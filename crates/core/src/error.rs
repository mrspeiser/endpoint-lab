use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Recoverable engine failure.
///
/// `thiserror` generates `Display` and `std::error::Error`. The text is safe to
/// show in the UI. Callers that build these variants must already have removed
/// header values, tokens, and passwords from the message.
#[derive(Debug, Error)]
pub enum Error {
    #[error("invalid url: {0}")]
    InvalidUrl(String),
    #[error("invalid configuration: {0}")]
    InvalidConfig(String),
    #[error("request timed out after {timeout_ms} ms")]
    Timeout { timeout_ms: u64 },
    #[error("request cancelled")]
    Cancelled,
    #[error("connection failed: {0}")]
    Connect(String),
    #[error("dns lookup failed: {0}")]
    Dns(String),
    #[error("tls error: {0}")]
    Tls(String),
    #[error("network error: {0}")]
    Network(String),
    #[error("storage error: {0}")]
    Storage(String),
    #[error("secret storage error: {0}")]
    Secret(String),
    #[error(
        "target is not authorized for load testing: {host}. Confirm you are allowed to test this host before continuing"
    )]
    TargetNotAuthorized { host: String },
    #[error("not found: {0}")]
    NotFound(String),
}

impl Error {
    pub fn code(&self) -> &'static str {
        match self {
            Self::InvalidUrl(_) => "invalid_url",
            Self::InvalidConfig(_) => "invalid_config",
            Self::Timeout { .. } => "timeout",
            Self::Cancelled => "cancelled",
            Self::Connect(_) => "connect",
            Self::Dns(_) => "dns",
            Self::Tls(_) => "tls",
            Self::Network(_) => "network",
            Self::Storage(_) => "storage",
            Self::Secret(_) => "secret",
            Self::TargetNotAuthorized { .. } => "target_not_authorized",
            Self::NotFound(_) => "not_found",
        }
    }

    pub fn view(self) -> ErrorView {
        ErrorView {
            code: self.code().to_string(),
            message: self.to_string(),
        }
    }
}

/// Serializable error returned across the process boundary.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ErrorView {
    pub code: String,
    pub message: String,
}
