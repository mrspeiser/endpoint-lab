//! HTTP request construction and execution.
//!
//! A single [`HttpExecutor`] owns one connection pool. Adapters call
//! [`HttpExecutor::execute`] for an interactive request or
//! [`HttpExecutor::measure`] when the benchmark engine only needs a status
//! code and a byte count.

mod client;
mod execute;
mod redact;
mod request;
mod response;

pub use execute::{execute_request, HttpExecutor};
pub use redact::{is_sensitive_name, redact_request, redact_url, secret_values};
pub use request::{
    build_url, parse_method, HeaderEntry, HttpRequest, Method, QueryParam, RequestBody, UrlSecretRef,
};
pub use response::{HttpResponse, ResponseBody};
