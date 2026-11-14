//! Endpoint Lab's processing engine.
//!
//! This crate owns HTTP execution, load generation, latency statistics, and
//! local persistence. It does not reference Tauri. The desktop shell and the
//! CLI are adapters that call into these types.
//!
//! # Errors
//!
//! Library functions return [`Error`]. They do not panic on bad input, network
//! failure, or cancellation. `Result` is the recovery path: callers decide
//! whether a failure is shown to a person, counted in a benchmark, or retried.

#![forbid(unsafe_code)]

pub mod bench;
pub mod error;
pub mod http;
pub mod limits;
pub mod store;
pub mod target;
mod util;

#[cfg(test)]
mod ipc_shape;

pub use bench::{run_benchmark, BenchConfig, BenchPhase, BenchSnapshot, BenchSummary};
pub use error::{Error, ErrorView};
pub use http::{
    execute_request, HeaderEntry, HttpExecutor, HttpRequest, HttpResponse, Method, QueryParam,
    RequestBody, ResponseBody,
};
pub use limits::EngineLimits;
pub use store::{
    default_store_path, BodySummary, CollectionSummary, DomainSummary, HeaderSummary, HistoryEntry,
    HistoryOutcome, KeyringSecretStore, LoadedBody, LoadedHeaders, MemorySecretStore, PathSummary,
    SecretStore, Store, StoreStatus,
};
pub use target::ensure_target_allowed;
pub use tokio_util::sync::CancellationToken;
