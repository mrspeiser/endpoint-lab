//! Closed-loop load generator.
//!
//! Concurrency is the number of worker tasks. Each worker performs one request
//! at a time, so in-flight work cannot exceed the configured level. Latency is
//! recorded in a fixed-size histogram instead of a sample per request.

mod config;
mod engine;
mod stats;

pub use config::BenchConfig;
pub use engine::run_benchmark;
pub use stats::{BenchPhase, BenchSnapshot, BenchSummary, ErrorCount, HistBar, LatencySummary};
