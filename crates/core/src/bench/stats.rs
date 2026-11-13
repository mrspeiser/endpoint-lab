use std::collections::BTreeMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use hdrhistogram::Histogram;
use serde::{Deserialize, Serialize};

use crate::error::Error;
use crate::http::Method;
use crate::limits::HISTOGRAM_MAX_US;
use crate::util::{duration_ms, now_ms};

const HISTOGRAM_EDGES_US: [u64; 12] = [
    1_000,
    2_000,
    5_000,
    10_000,
    25_000,
    50_000,
    100_000,
    250_000,
    500_000,
    1_000_000,
    2_000_000,
    5_000_000,
];

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum BenchPhase {
    Warmup,
    Measure,
    Done,
}

impl std::fmt::Display for BenchPhase {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(match self {
            Self::Warmup => "warmup",
            Self::Measure => "measure",
            Self::Done => "done",
        })
    }
}

#[derive(Debug, Clone, Copy)]
pub enum TransportKind {
    Timeout,
    Connect,
    Dns,
    Tls,
    Other,
}

impl TransportKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Timeout => "timeout",
            Self::Connect => "connect",
            Self::Dns => "dns",
            Self::Tls => "tls",
            Self::Other => "other",
        }
    }

    pub fn from_error(err: &Error) -> Self {
        match err {
            Error::Timeout { .. } => Self::Timeout,
            Error::Connect(_) => Self::Connect,
            Error::Dns(_) => Self::Dns,
            Error::Tls(_) => Self::Tls,
            _ => Self::Other,
        }
    }
}

#[derive(Debug)]
pub enum AttemptOutcome {
    Success { bytes: u64, latency_us: u64 },
    HttpError { status: u16, bytes: u64, latency_us: u64 },
    Transport { kind: TransportKind, latency_us: u64 },
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ErrorCount {
    pub cause: String,
    pub count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HistBar {
    pub le_us: u64,
    pub count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct LatencySummary {
    pub mean_us: u64,
    pub min_us: u64,
    pub max_us: u64,
    pub p50_us: u64,
    pub p90_us: u64,
    pub p95_us: u64,
    pub p99_us: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BenchSnapshot {
    pub phase: BenchPhase,
    pub elapsed_ms: u64,
    pub total: u64,
    pub success: u64,
    pub http_errors: u64,
    pub transport_errors: u64,
    pub cancelled_attempts: u64,
    pub in_flight: u64,
    pub rps: f64,
    pub latency: LatencySummary,
    pub bytes: u64,
    pub errors: Vec<ErrorCount>,
    pub histogram: Vec<HistBar>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BenchSummary {
    pub id: String,
    pub started_at_ms: i64,
    pub elapsed_ms: u64,
    pub method: Method,
    pub url: String,
    pub total_requests: u64,
    pub concurrency: usize,
    pub duration_ms: Option<u64>,
    pub timeout_ms: u64,
    pub warmup_requests: u64,
    pub total: u64,
    pub success: u64,
    pub http_errors: u64,
    pub transport_errors: u64,
    pub cancelled_attempts: u64,
    pub rps: f64,
    pub latency: LatencySummary,
    pub bytes: u64,
    pub errors: Vec<ErrorCount>,
    pub histogram: Vec<HistBar>,
    pub cancelled: bool,
}

pub struct RunState {
    stats: Mutex<Stats>,
    in_flight: AtomicU64,
}

impl RunState {
    pub fn new() -> Self {
        Self {
            stats: Mutex::new(Stats::new()),
            in_flight: AtomicU64::new(0),
        }
    }

    pub fn begin(&self) {
        self.in_flight.fetch_add(1, Ordering::Relaxed);
    }

    pub fn end(&self) {
        self.in_flight.fetch_sub(1, Ordering::Relaxed);
    }

    pub fn record(&self, outcome: AttemptOutcome) {
        let mut stats = self.stats.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        stats.record(outcome);
    }

    pub fn snapshot(&self, phase: BenchPhase, started: Instant) -> BenchSnapshot {
        let stats = self.stats.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        stats.to_snapshot(phase, started.elapsed(), self.in_flight.load(Ordering::Relaxed))
    }

    pub fn summary(
        &self,
        identity: SummaryIdentity,
        started_at_ms: i64,
        started: Instant,
        cancelled: bool,
    ) -> BenchSummary {
        let snapshot = self.snapshot(BenchPhase::Done, started);
        BenchSummary {
            id: uuid::Uuid::new_v4().to_string(),
            started_at_ms,
            elapsed_ms: snapshot.elapsed_ms,
            method: identity.method,
            url: identity.url,
            total_requests: identity.total_requests,
            concurrency: identity.concurrency,
            duration_ms: identity.duration_ms,
            timeout_ms: identity.timeout_ms,
            warmup_requests: identity.warmup_requests,
            total: snapshot.total,
            success: snapshot.success,
            http_errors: snapshot.http_errors,
            transport_errors: snapshot.transport_errors,
            cancelled_attempts: snapshot.cancelled_attempts,
            rps: snapshot.rps,
            latency: snapshot.latency,
            bytes: snapshot.bytes,
            errors: snapshot.errors,
            histogram: snapshot.histogram,
            cancelled,
        }
    }
}

pub struct SummaryIdentity {
    pub method: Method,
    pub url: String,
    pub total_requests: u64,
    pub concurrency: usize,
    pub duration_ms: Option<u64>,
    pub timeout_ms: u64,
    pub warmup_requests: u64,
}

pub fn empty_summary(identity: SummaryIdentity, cancelled: bool) -> BenchSummary {
    BenchSummary {
        id: uuid::Uuid::new_v4().to_string(),
        started_at_ms: now_ms(),
        elapsed_ms: 0,
        method: identity.method,
        url: identity.url,
        total_requests: identity.total_requests,
        concurrency: identity.concurrency,
        duration_ms: identity.duration_ms,
        timeout_ms: identity.timeout_ms,
        warmup_requests: identity.warmup_requests,
        total: 0,
        success: 0,
        http_errors: 0,
        transport_errors: 0,
        cancelled_attempts: 0,
        rps: 0.0,
        latency: LatencySummary::default(),
        bytes: 0,
        errors: Vec::new(),
        histogram: histogram_bars(&new_histogram()),
        cancelled,
    }
}

struct Stats {
    success: u64,
    http_errors: u64,
    transport_errors: u64,
    cancelled_attempts: u64,
    bytes: u64,
    latency_sum_us: u128,
    latency_count: u64,
    histogram: Histogram<u64>,
    errors: BTreeMap<String, u64>,
}

impl Stats {
    fn new() -> Self {
        Self {
            success: 0,
            http_errors: 0,
            transport_errors: 0,
            cancelled_attempts: 0,
            bytes: 0,
            latency_sum_us: 0,
            latency_count: 0,
            histogram: new_histogram(),
            errors: BTreeMap::new(),
        }
    }

    fn record(&mut self, outcome: AttemptOutcome) {
        match outcome {
            AttemptOutcome::Success { bytes, latency_us } => {
                self.success += 1;
                self.bytes += bytes;
                self.record_latency(latency_us);
            }
            AttemptOutcome::HttpError {
                status,
                bytes,
                latency_us,
            } => {
                self.http_errors += 1;
                self.bytes += bytes;
                self.bump(format!("http_{status}"));
                self.record_latency(latency_us);
            }
            AttemptOutcome::Transport { kind, latency_us } => {
                self.transport_errors += 1;
                self.bump(kind.as_str().to_string());
                self.record_latency(latency_us);
            }
            AttemptOutcome::Cancelled => {
                self.cancelled_attempts += 1;
            }
        }
    }

    fn record_latency(&mut self, latency_us: u64) {
        let high = self.histogram.high();
        let value = latency_us.clamp(1, high);
        self.latency_sum_us += u128::from(latency_us);
        self.latency_count += 1;
        let _ = self.histogram.record(value);
    }

    fn bump(&mut self, cause: String) {
        *self.errors.entry(cause).or_insert(0) += 1;
    }

    fn completed(&self) -> u64 {
        self.success + self.http_errors + self.transport_errors
    }

    fn to_snapshot(&self, phase: BenchPhase, elapsed: Duration, in_flight: u64) -> BenchSnapshot {
        let total = self.completed();
        let seconds = elapsed.as_secs_f64();
        let rps = if seconds <= f64::EPSILON || total == 0 {
            0.0
        } else {
            total as f64 / seconds
        };
        BenchSnapshot {
            phase,
            elapsed_ms: duration_ms(elapsed),
            total,
            success: self.success,
            http_errors: self.http_errors,
            transport_errors: self.transport_errors,
            cancelled_attempts: self.cancelled_attempts,
            in_flight,
            rps,
            latency: self.latency(),
            bytes: self.bytes,
            errors: error_list(&self.errors),
            histogram: histogram_bars(&self.histogram),
        }
    }

    fn latency(&self) -> LatencySummary {
        if self.latency_count == 0 {
            return LatencySummary::default();
        }
        let mean = self.latency_sum_us / u128::from(self.latency_count);
        LatencySummary {
            mean_us: u64::try_from(mean).unwrap_or(u64::MAX),
            min_us: self.histogram.min(),
            max_us: self.histogram.max(),
            p50_us: self.histogram.value_at_quantile(0.50),
            p90_us: self.histogram.value_at_quantile(0.90),
            p95_us: self.histogram.value_at_quantile(0.95),
            p99_us: self.histogram.value_at_quantile(0.99),
        }
    }
}

fn new_histogram() -> Histogram<u64> {
    Histogram::new_with_bounds(1, HISTOGRAM_MAX_US, 3)
        .expect("histogram bounds are constant and valid")
}

fn histogram_bars(histogram: &Histogram<u64>) -> Vec<HistBar> {
    let mut bars = Vec::with_capacity(HISTOGRAM_EDGES_US.len() + 1);
    let mut previous = 0u64;
    for edge in HISTOGRAM_EDGES_US {
        let low = previous.saturating_add(1);
        let count = count_between(histogram, low, edge);
        bars.push(HistBar {
            le_us: edge,
            count,
        });
        previous = edge;
    }
    let high = histogram.high();
    let low = previous.saturating_add(1);
    bars.push(HistBar {
        le_us: high,
        count: count_between(histogram, low, high),
    });
    bars
}

fn count_between(histogram: &Histogram<u64>, low: u64, high: u64) -> u64 {
    if histogram.is_empty() || low > high || high < histogram.low() || low > histogram.high() {
        return 0;
    }
    let low = low.clamp(histogram.low(), histogram.high());
    let high = high.clamp(histogram.low(), histogram.high());
    if low > high {
        return 0;
    }
    histogram.count_between(low, high)
}

fn error_list(errors: &BTreeMap<String, u64>) -> Vec<ErrorCount> {
    let mut items: Vec<_> = errors
        .iter()
        .map(|(cause, count)| ErrorCount {
            cause: cause.clone(),
            count: *count,
        })
        .collect();
    items.sort_by(|left, right| {
        right
            .count
            .cmp(&left.count)
            .then_with(|| left.cause.cmp(&right.cause))
    });
    items
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn percentiles_and_error_groups_stay_bounded() {
        let mut stats = Stats::new();
        for latency_us in [1_000_u64, 2_000, 3_000, 4_000, 5_000] {
            stats.record(AttemptOutcome::Success {
                bytes: 10,
                latency_us,
            });
        }
        stats.record(AttemptOutcome::HttpError {
            status: 500,
            bytes: 4,
            latency_us: 1_500,
        });
        stats.record(AttemptOutcome::HttpError {
            status: 500,
            bytes: 4,
            latency_us: 1_500,
        });
        stats.record(AttemptOutcome::HttpError {
            status: 404,
            bytes: 4,
            latency_us: 1_200,
        });
        stats.record(AttemptOutcome::Transport {
            kind: TransportKind::Timeout,
            latency_us: 20_000,
        });
        stats.record(AttemptOutcome::Cancelled);

        assert_eq!(stats.success, 5);
        assert_eq!(stats.http_errors, 3);
        assert_eq!(stats.transport_errors, 1);
        assert_eq!(stats.cancelled_attempts, 1);
        assert_eq!(stats.completed(), 9);
        let latency = stats.latency();
        assert!(latency.p50_us >= 1_000 && latency.p50_us <= 5_000);
        assert!(latency.min_us <= latency.p50_us);
        assert!(latency.p50_us <= latency.p90_us);
        assert!(latency.p90_us <= latency.p99_us);
        assert!(latency.p99_us <= latency.max_us);
        let errors = error_list(&stats.errors);
        assert_eq!(errors[0].cause, "http_500");
        assert_eq!(errors[0].count, 2);
        assert!(errors.iter().any(|item| item.cause == "timeout" && item.count == 1));
        assert!(errors.iter().any(|item| item.cause == "http_404" && item.count == 1));
        let bars = histogram_bars(&stats.histogram);
        assert!(bars.iter().map(|bar| bar.count).sum::<u64>() >= stats.latency_count);
    }

    #[test]
    fn empty_stats_do_not_query_an_empty_histogram() {
        let stats = Stats::new();
        assert_eq!(stats.latency(), LatencySummary::default());
    }
}
