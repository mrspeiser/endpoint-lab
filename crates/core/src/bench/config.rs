use serde::{Deserialize, Serialize};

use crate::error::Error;
use crate::http::HttpRequest;
use crate::limits::{MAX_CONCURRENCY, MAX_DURATION_MS, MAX_REQUESTS, MAX_TIMEOUT_MS};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BenchConfig {
    pub request: HttpRequest,
    pub total_requests: u64,
    pub concurrency: usize,
    pub duration_ms: Option<u64>,
    pub timeout_ms: u64,
    pub warmup_requests: u64,
    pub authorize_remote: bool,
}

impl BenchConfig {
    pub fn validate(&self) -> Result<(), Error> {
        if self.total_requests == 0 {
            return Err(Error::InvalidConfig(
                "total requests must be at least 1".into(),
            ));
        }
        if self.total_requests > MAX_REQUESTS {
            return Err(Error::InvalidConfig(format!(
                "total requests cannot exceed {MAX_REQUESTS}"
            )));
        }
        if self.concurrency == 0 {
            return Err(Error::InvalidConfig(
                "concurrency must be at least 1".into(),
            ));
        }
        if self.concurrency > MAX_CONCURRENCY {
            return Err(Error::InvalidConfig(format!(
                "concurrency cannot exceed {MAX_CONCURRENCY}"
            )));
        }
        if let Some(duration) = self.duration_ms
            && (duration == 0 || duration > MAX_DURATION_MS)
        {
            return Err(Error::InvalidConfig(format!(
                "duration must be between 1 and {MAX_DURATION_MS} ms"
            )));
        }
        if self.timeout_ms == 0 || self.timeout_ms > MAX_TIMEOUT_MS {
            return Err(Error::InvalidConfig(format!(
                "timeout must be between 1 and {MAX_TIMEOUT_MS} ms"
            )));
        }
        if self.warmup_requests > MAX_REQUESTS {
            return Err(Error::InvalidConfig(format!(
                "warmup requests cannot exceed {MAX_REQUESTS}"
            )));
        }
        Ok(())
    }

    pub fn execution_request(&self) -> HttpRequest {
        let mut request = self.request.clone();
        request.timeout_ms = self.timeout_ms;
        request
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::http::{Method, RequestBody};

    fn config() -> BenchConfig {
        BenchConfig {
            request: HttpRequest {
                method: Method::Get,
                url: "http://127.0.0.1/".into(),
                headers: Vec::new(),
                query: Vec::new(),
                body: RequestBody::None,
                timeout_ms: 1000,
                url_secret_refs: Vec::new(),
            },
            total_requests: 10,
            concurrency: 2,
            duration_ms: None,
            timeout_ms: 1000,
            warmup_requests: 0,
            authorize_remote: false,
        }
    }

    #[test]
    fn caps_are_enforced() {
        let mut sample = config();
        sample.concurrency = MAX_CONCURRENCY + 1;
        assert_eq!(sample.validate().unwrap_err().code(), "invalid_config");
        sample = config();
        sample.total_requests = MAX_REQUESTS + 1;
        assert!(sample.validate().is_err());
        sample = config();
        sample.duration_ms = Some(0);
        assert!(sample.validate().is_err());
        sample = config();
        sample.timeout_ms = 0;
        assert!(sample.validate().is_err());
        assert!(config().validate().is_ok());
    }
}
