use serde::Serialize;

pub const PREVIEW_LIMIT_BYTES: usize = 1024 * 1024;
pub const MAX_REQUESTS: u64 = 100_000;
pub const MAX_CONCURRENCY: usize = 200;
pub const MAX_DURATION_MS: u64 = 10 * 60 * 1000;
pub const MAX_TIMEOUT_MS: u64 = 120_000;
pub const DEFAULT_TIMEOUT_MS: u64 = 30_000;
pub const DEFAULT_BENCH_TIMEOUT_MS: u64 = 10_000;
pub const HISTORY_LIMIT: usize = 200;
pub const BENCHMARK_HISTORY_LIMIT: usize = 50;
pub const HISTORY_BODY_LIMIT: usize = 64 * 1024;
pub const PROGRESS_INTERVAL_MS: u64 = 250;
/// Highest latency the histogram can track: 10 minutes, in microseconds.
pub const HISTOGRAM_MAX_US: u64 = 600_000_000;

/// Caps the desktop UI reads so the form and the engine share one source.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineLimits {
    pub max_requests: u64,
    pub max_concurrency: u64,
    pub max_duration_ms: u64,
    pub max_timeout_ms: u64,
    pub default_timeout_ms: u64,
    pub preview_limit_bytes: u64,
    pub history_limit: u64,
    pub benchmark_history_limit: u64,
}

impl EngineLimits {
    pub const fn current() -> Self {
        Self {
            max_requests: MAX_REQUESTS,
            max_concurrency: MAX_CONCURRENCY as u64,
            max_duration_ms: MAX_DURATION_MS,
            max_timeout_ms: MAX_TIMEOUT_MS,
            default_timeout_ms: DEFAULT_TIMEOUT_MS,
            preview_limit_bytes: PREVIEW_LIMIT_BYTES as u64,
            history_limit: HISTORY_LIMIT as u64,
            benchmark_history_limit: BENCHMARK_HISTORY_LIMIT as u64,
        }
    }
}
