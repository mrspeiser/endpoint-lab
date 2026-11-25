#[path = "common/mod.rs"]
mod support;

use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::{routing::get, Router};
use tokio::net::TcpListener;
use tokio_util::sync::CancellationToken;

use endpoint_lab_core::{run_benchmark, BenchConfig, HttpExecutor, Method};

use support::{count_hits, request, serve, status_500, Hits};

fn config(url: &str, total: u64, concurrency: usize) -> BenchConfig {
    BenchConfig {
        request: request(Method::Get, url),
        total_requests: total,
        concurrency,
        duration_ms: None,
        timeout_ms: 5_000,
        warmup_requests: 0,
        authorize_remote: false,
    }
}

#[tokio::test]
async fn count_termination_is_exact() {
    let base = serve(Router::new().route("/fast", get(|| async { "ok" }))).await;
    let executor = HttpExecutor::new().unwrap();
    let summary = run_benchmark(
        &executor,
        config(&format!("{base}/fast"), 25, 4),
        &CancellationToken::new(),
        |_| {},
    )
    .await
    .unwrap();
    assert_eq!(summary.success, 25);
    assert_eq!(summary.total, 25);
    assert!(!summary.cancelled);
    assert_eq!(summary.http_errors, 0);
    assert_eq!(summary.transport_errors, 0);
}

#[tokio::test]
async fn concurrency_never_exceeds_the_worker_count() {
    let hits = Arc::new(Hits::default());
    let base = serve(
        Router::new()
            .route("/tracked", get(support::tracked))
            .with_state(Arc::clone(&hits)),
    )
    .await;
    let executor = HttpExecutor::new().unwrap();
    let summary = run_benchmark(
        &executor,
        config(&format!("{base}/tracked"), 12, 4),
        &CancellationToken::new(),
        |_| {},
    )
    .await
    .unwrap();
    let peak = hits.peak.load(std::sync::atomic::Ordering::SeqCst);
    assert!(peak <= 4, "peak in flight was {peak}");
    assert!(peak >= 2, "expected parallel workers, peak was {peak}");
    assert_eq!(summary.success, 12);
}

#[tokio::test]
async fn warmup_is_excluded_and_latency_tracks_the_injected_delay() {
    let hits = Arc::new(Hits::default());
    let base = serve(
        Router::new()
            .route("/slow", get(count_hits))
            .with_state(Arc::clone(&hits)),
    )
    .await;
    let executor = HttpExecutor::new().unwrap();
    let mut sample = config(&format!("{base}/slow"), 10, 1);
    sample.warmup_requests = 4;
    let summary = run_benchmark(&executor, sample, &CancellationToken::new(), |_| {})
        .await
        .unwrap();
    assert_eq!(hits.hits.load(std::sync::atomic::Ordering::SeqCst), 14);
    assert_eq!(summary.success, 10);
    assert!(
        summary.latency.p50_us >= 10_000,
        "p50 {}",
        summary.latency.p50_us
    );
    assert!(
        summary.latency.p50_us <= 250_000,
        "p50 {}",
        summary.latency.p50_us
    );
    assert!(summary.latency.min_us <= summary.latency.p50_us);
    assert!(summary.latency.p50_us <= summary.latency.p95_us);
    assert!(summary.latency.p95_us <= summary.latency.p99_us);
    assert!(summary.latency.p99_us <= summary.latency.max_us);
}

#[tokio::test]
async fn http_status_failures_are_not_transport_failures() {
    let base = serve(Router::new().route("/boom", get(status_500))).await;
    let executor = HttpExecutor::new().unwrap();
    let summary = run_benchmark(
        &executor,
        config(&format!("{base}/boom"), 8, 2),
        &CancellationToken::new(),
        |_| {},
    )
    .await
    .unwrap();
    assert_eq!(summary.success, 0);
    assert_eq!(summary.http_errors, 8);
    assert_eq!(summary.transport_errors, 0);
    assert!(summary
        .errors
        .iter()
        .any(|item| item.cause == "http_500" && item.count == 8));
}

#[tokio::test]
async fn connection_refused_is_a_transport_error() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    drop(listener);
    let executor = HttpExecutor::new().unwrap();
    let summary = run_benchmark(
        &executor,
        config(&format!("http://{address}/missing"), 6, 3),
        &CancellationToken::new(),
        |_| {},
    )
    .await
    .unwrap();
    assert_eq!(summary.success, 0);
    assert_eq!(summary.transport_errors, 6);
    assert!(summary.errors.iter().any(|item| item.cause == "connect"));
}

#[tokio::test]
async fn duration_stops_the_run_before_the_request_budget() {
    let base = serve(Router::new().route(
        "/pause",
        get(|| async {
            tokio::time::sleep(Duration::from_millis(30)).await;
            "ok"
        }),
    ))
    .await;
    let executor = HttpExecutor::new().unwrap();
    let mut sample = config(&format!("{base}/pause"), 100_000, 4);
    sample.duration_ms = Some(350);
    let summary = run_benchmark(&executor, sample, &CancellationToken::new(), |_| {})
        .await
        .unwrap();
    assert!(!summary.cancelled);
    assert!(summary.total > 0);
    assert!(summary.total < 100_000);
    assert!(summary.elapsed_ms >= 250, "elapsed {}", summary.elapsed_ms);
    assert!(summary.elapsed_ms < 2_000, "elapsed {}", summary.elapsed_ms);
}

#[tokio::test]
async fn cancellation_stops_the_benchmark_without_counting_transport_errors() {
    let base = serve(Router::new().route(
        "/stuck",
        get(|| async {
            tokio::time::sleep(Duration::from_secs(30)).await;
            "late"
        }),
    ))
    .await;
    let executor = HttpExecutor::new().unwrap();
    let mut sample = config(&format!("{base}/stuck"), 1_000, 4);
    sample.timeout_ms = 20_000;
    let cancel = CancellationToken::new();
    let cancel_later = cancel.clone();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(80)).await;
        cancel_later.cancel();
    });
    let started = Instant::now();
    let summary = tokio::time::timeout(
        Duration::from_secs(3),
        run_benchmark(&executor, sample, &cancel, |_| {}),
    )
    .await
    .expect("benchmark did not observe cancellation")
    .unwrap();
    assert!(summary.cancelled);
    assert_eq!(summary.transport_errors, 0);
    assert!(summary.success + summary.http_errors < 10);
    assert!(started.elapsed() < Duration::from_secs(3));
}

#[tokio::test]
async fn remote_targets_are_rejected_before_any_connection() {
    let executor = HttpExecutor::new().unwrap();
    let mut sample = config("http://example.com/not-a-test", 10, 2);
    sample.authorize_remote = false;
    let error = run_benchmark(&executor, sample, &CancellationToken::new(), |_| {})
        .await
        .unwrap_err();
    assert_eq!(error.code(), "target_not_authorized");

    let mut allowed = config("http://example.com/not-a-test", 10, 2);
    allowed.authorize_remote = true;
    allowed.concurrency = 10_000;
    let error = run_benchmark(&executor, allowed, &CancellationToken::new(), |_| {})
        .await
        .unwrap_err();
    assert_eq!(error.code(), "invalid_config");
}
