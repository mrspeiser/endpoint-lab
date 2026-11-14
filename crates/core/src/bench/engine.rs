use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use tokio::task::JoinSet;
use tokio_util::sync::CancellationToken;

use crate::bench::config::BenchConfig;
use crate::bench::stats::{
    empty_summary, AttemptOutcome, BenchPhase, BenchSnapshot, BenchSummary, RunState, SummaryIdentity,
    TransportKind,
};
use crate::error::Error;
use crate::http::{redact_url, HttpExecutor, HttpRequest};
use crate::limits::PROGRESS_INTERVAL_MS;
use crate::target::ensure_target_allowed;
use crate::util::{duration_us, now_ms};

/// Run a closed-loop benchmark.
///
/// `progress` is invoked from this task about every 250 ms, not from each
/// worker and not once per request. The callback must be `Send` because the
/// benchmark future moves across threads. It does not need to be `Sync`
/// because workers never call it.
///
/// Latency uses [`Instant`], which is monotonic. A 2xx response is a success.
/// Any other status is an HTTP error. Timeouts, DNS, TLS, and connect failures
/// are transport errors. User cancellation is recorded separately and is not a
/// failure of the target.
pub async fn run_benchmark(
    executor: &HttpExecutor,
    config: BenchConfig,
    cancel: &CancellationToken,
    mut progress: impl FnMut(BenchSnapshot) + Send,
) -> Result<BenchSummary, Error> {
    config.validate()?;
    let request = config.execution_request();
    executor.prepare(&request)?;
    ensure_target_allowed(&request.url, config.authorize_remote)?;

    let redacted_url = redact_url(&request.url);
    tracing::info!(
        url = %redacted_url,
        total = config.total_requests,
        concurrency = config.concurrency,
        warmup = config.warmup_requests,
        "benchmark start"
    );

    let started_at_ms = now_ms();
    if config.warmup_requests > 0 {
        let warmup = Arc::new(RunState::new());
        run_phase(
            executor,
            &request,
            PhasePlan {
                total: config.warmup_requests,
                concurrency: config.concurrency,
                deadline: None,
                phase: BenchPhase::Warmup,
            },
            cancel,
            &warmup,
            &mut progress,
        )
        .await;
        if cancel.is_cancelled() {
            return Ok(empty_summary(
                identity(&config, request.method, redacted_url),
                true,
            ));
        }
    }

    let measured = Arc::new(RunState::new());
    let measure_started = Instant::now();
    let deadline = config
        .duration_ms
        .map(|millis| Instant::now() + Duration::from_millis(millis));
    run_phase(
        executor,
        &request,
        PhasePlan {
            total: config.total_requests,
            concurrency: config.concurrency,
            deadline,
            phase: BenchPhase::Measure,
        },
        cancel,
        &measured,
        &mut progress,
    )
    .await;

    let summary = measured.summary(
        identity(&config, request.method, redacted_url),
        started_at_ms,
        measure_started,
        cancel.is_cancelled(),
    );
    tracing::info!(
        total = summary.total,
        success = summary.success,
        http_errors = summary.http_errors,
        transport_errors = summary.transport_errors,
        cancelled = summary.cancelled,
        "benchmark finished"
    );
    Ok(summary)
}

struct PhasePlan {
    total: u64,
    concurrency: usize,
    deadline: Option<Instant>,
    phase: BenchPhase,
}

fn identity(config: &BenchConfig, method: crate::http::Method, url: String) -> SummaryIdentity {
    SummaryIdentity {
        method,
        url,
        total_requests: config.total_requests,
        concurrency: config.concurrency,
        duration_ms: config.duration_ms,
        timeout_ms: config.timeout_ms,
        warmup_requests: config.warmup_requests,
    }
}

async fn run_phase(
    executor: &HttpExecutor,
    request: &HttpRequest,
    plan: PhasePlan,
    cancel: &CancellationToken,
    state: &Arc<RunState>,
    progress: &mut (dyn FnMut(BenchSnapshot) + Send),
) {
    let started = Instant::now();
    progress(state.snapshot(plan.phase, started));
    if plan.total == 0 || cancel.is_cancelled() {
        return;
    }
    let drive = drive(
        executor.clone(),
        request.clone(),
        plan.total,
        plan.concurrency,
        plan.deadline,
        cancel.clone(),
        Arc::clone(state),
    );
    tokio::pin!(drive);
    loop {
        tokio::select! {
            biased;
            _ = &mut drive => break,
            _ = tokio::time::sleep(Duration::from_millis(PROGRESS_INTERVAL_MS)) => {
                progress(state.snapshot(plan.phase, started));
            }
        }
    }
    progress(state.snapshot(plan.phase, started));
}

async fn drive(
    executor: HttpExecutor,
    request: HttpRequest,
    total: u64,
    concurrency: usize,
    deadline: Option<Instant>,
    cancel: CancellationToken,
    state: Arc<RunState>,
) {
    let issued = Arc::new(AtomicU64::new(0));
    let workers = worker_count(concurrency, total);
    let mut set = JoinSet::new();
    for _ in 0..workers {
        let executor = executor.clone();
        let request = request.clone();
        let issued = Arc::clone(&issued);
        let cancel = cancel.clone();
        let state = Arc::clone(&state);
        set.spawn(async move {
            worker(executor, request, total, deadline, issued, cancel, state).await;
        });
    }
    while set.join_next().await.is_some() {}
}

async fn worker(
    executor: HttpExecutor,
    request: HttpRequest,
    total: u64,
    deadline: Option<Instant>,
    issued: Arc<AtomicU64>,
    cancel: CancellationToken,
    state: Arc<RunState>,
) {
    loop {
        if cancel.is_cancelled() {
            break;
        }
        if deadline.is_some_and(|deadline| Instant::now() >= deadline) {
            break;
        }
        let ticket = issued.fetch_add(1, Ordering::Relaxed);
        if ticket >= total {
            break;
        }
        state.begin();
        let outcome = attempt(&executor, &request, &cancel).await;
        state.end();
        state.record(outcome);
    }
}

async fn attempt(
    executor: &HttpExecutor,
    request: &HttpRequest,
    cancel: &CancellationToken,
) -> AttemptOutcome {
    let started = Instant::now();
    let result = executor.measure(request, cancel).await;
    let latency_us = duration_us(started.elapsed());
    match result {
        Ok(measured) if (200..300).contains(&measured.status) => AttemptOutcome::Success {
            bytes: measured.bytes,
            latency_us,
        },
        Ok(measured) => AttemptOutcome::HttpError {
            status: measured.status,
            bytes: measured.bytes,
            latency_us,
        },
        Err(Error::Cancelled) => AttemptOutcome::Cancelled,
        Err(err) => AttemptOutcome::Transport {
            kind: TransportKind::from_error(&err),
            latency_us,
        },
    }
}

fn worker_count(concurrency: usize, total: u64) -> usize {
    let capped = usize::try_from(total).unwrap_or(usize::MAX);
    concurrency.min(capped).max(1)
}
