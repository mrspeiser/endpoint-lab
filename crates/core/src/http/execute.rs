use std::time::{Duration, Instant};

use reqwest::header::{HeaderMap, HeaderName, HeaderValue, CONTENT_TYPE};
use tokio_util::sync::CancellationToken;

use crate::error::Error;
use crate::http::client::build_client;
use crate::http::redact::secret_values;
use crate::http::request::{build_url, normalize_timeout, HttpRequest};
use crate::http::response::{interpret_body, preview_limit, HeaderView, HttpResponse, RawBody};
use crate::limits::DEFAULT_TIMEOUT_MS;
use crate::util::{duration_ms, scrub};

/// Reusable HTTP client.
///
/// `reqwest::Client` is cheap to clone: the clone shares the connection pool.
/// Build one executor when the process starts and pass clones into benchmark workers.
#[derive(Clone)]
pub struct HttpExecutor {
    client: reqwest::Client,
}

impl HttpExecutor {
    pub fn new() -> Result<Self, Error> {
        Ok(Self {
            client: build_client()?,
        })
    }

    /// Validate URL, scheme, and headers before any socket is opened.
    pub fn prepare(&self, request: &HttpRequest) -> Result<(), Error> {
        self.build(request).map(|_| ())
    }

    pub async fn execute(
        &self,
        request: &HttpRequest,
        cancel: &CancellationToken,
    ) -> Result<HttpResponse, Error> {
        let started = Instant::now();
        let consumed = self.exchange(request, cancel, Consume::Preview).await?;
        Ok(HttpResponse {
            status: consumed.status,
            status_text: consumed.status_text,
            headers: consumed.headers,
            body: interpret_body(&RawBody {
                content_type: consumed.content_type,
                bytes: consumed.preview,
                size_bytes: consumed.size_bytes,
                size_exact: consumed.size_exact,
            }),
            size_bytes: consumed.size_bytes,
            size_exact: consumed.size_exact,
            truncated: consumed.truncated,
            elapsed_ms: duration_ms(started.elapsed()),
        })
    }

    /// Read the response only to count bytes. Nothing is retained per request.
    pub async fn measure(
        &self,
        request: &HttpRequest,
        cancel: &CancellationToken,
    ) -> Result<Measured, Error> {
        let consumed = self.exchange(request, cancel, Consume::Drain).await?;
        Ok(Measured {
            status: consumed.status,
            bytes: consumed.bytes_read,
        })
    }

    fn build(&self, request: &HttpRequest) -> Result<reqwest::Request, Error> {
        let secrets = secret_values(request);
        let timeout_ms = normalize_timeout(request.timeout_ms, DEFAULT_TIMEOUT_MS)?;
        let url = build_url(request)?;
        let method = request.method.to_reqwest();
        let mut headers = HeaderMap::new();
        for entry in &request.headers {
            if !entry.enabled || entry.name.trim().is_empty() {
                continue;
            }
            let name = HeaderName::from_bytes(entry.name.trim().as_bytes()).map_err(|_| {
                Error::InvalidConfig(format!("invalid header name '{}'", entry.name.trim()))
            })?;
            let value = HeaderValue::from_str(&entry.value).map_err(|_| {
                Error::InvalidConfig(format!("invalid header value for '{}'", entry.name.trim()))
            })?;
            headers.append(name, value);
        }
        let mut builder = self.client.request(method.clone(), url);
        if request.method.allows_body() {
            match &request.body {
                crate::http::RequestBody::None => {}
                crate::http::RequestBody::Json { value } => {
                    if !headers.contains_key(CONTENT_TYPE) {
                        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
                    }
                    builder = builder.body(value.clone());
                }
                crate::http::RequestBody::Text { value } => {
                    if !headers.contains_key(CONTENT_TYPE) {
                        headers.insert(
                            CONTENT_TYPE,
                            HeaderValue::from_static("text/plain; charset=utf-8"),
                        );
                    }
                    builder = builder.body(value.clone());
                }
            }
        }
        builder
            .headers(headers)
            .timeout(Duration::from_millis(timeout_ms))
            .build()
            .map_err(|err| Error::InvalidConfig(scrub(&err.to_string(), &secrets)))
    }

    async fn exchange(
        &self,
        request: &HttpRequest,
        cancel: &CancellationToken,
        mode: Consume,
    ) -> Result<Consumed, Error> {
        let secrets = secret_values(request);
        let timeout_ms = normalize_timeout(request.timeout_ms, DEFAULT_TIMEOUT_MS)?;
        let prepared = self.build(request)?;
        let method = request.method;
        let redacted_url = crate::http::redact::redact_url(&request.url);
        tracing::debug!(%method, url = %redacted_url, "sending request");

        let pending = async {
            let response = self
                .client
                .execute(prepared)
                .await
                .map_err(|err| map_transport(err, timeout_ms, &secrets))?;
            consume(response, mode, timeout_ms, &secrets).await
        };

        // `biased` prefers cancellation when both are ready. Dropping `pending`
        // drops the Reqwest future, which aborts the socket.
        tokio::select! {
            biased;
            _ = cancel.cancelled() => Err(Error::Cancelled),
            result = pending => result,
        }
    }
}

pub struct Measured {
    pub status: u16,
    pub bytes: u64,
}

enum Consume {
    Preview,
    Drain,
}

struct Consumed {
    status: u16,
    status_text: String,
    headers: Vec<HeaderView>,
    content_type: Option<String>,
    preview: Vec<u8>,
    size_bytes: u64,
    size_exact: bool,
    truncated: bool,
    bytes_read: u64,
}

async fn consume(
    mut response: reqwest::Response,
    mode: Consume,
    timeout_ms: u64,
    secrets: &[String],
) -> Result<Consumed, Error> {
    let status = response.status();
    let status_code = status.as_u16();
    let status_text = status.canonical_reason().unwrap_or("Unknown").to_string();
    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    let content_length = response.content_length();
    let headers = response
        .headers()
        .iter()
        .map(|(name, value)| HeaderView {
            name: name.as_str().to_string(),
            value: String::from_utf8_lossy(value.as_bytes()).into_owned(),
        })
        .collect();

    let limit = preview_limit();
    let mut preview = Vec::new();
    let mut bytes_read = 0u64;
    let mut truncated = false;

    loop {
        let chunk = response
            .chunk()
            .await
            .map_err(|err| map_transport(err, timeout_ms, secrets))?;
        let Some(chunk) = chunk else {
            break;
        };
        bytes_read += chunk.len() as u64;
        if matches!(mode, Consume::Preview) {
            let room = limit.saturating_sub(preview.len());
            if chunk.len() > room {
                preview.extend_from_slice(&chunk[..room]);
                truncated = true;
            } else {
                preview.extend_from_slice(&chunk);
            }
            // Stop once the preview cap is full so a large body is not pulled
            // into memory or across the IPC boundary.
            if truncated {
                break;
            }
        }
    }

    let (size_bytes, size_exact) = match content_length {
        Some(length) => (length, true),
        None => (bytes_read, !truncated),
    };

    Ok(Consumed {
        status: status_code,
        status_text,
        headers,
        content_type,
        preview,
        size_bytes,
        size_exact,
        truncated,
        bytes_read,
    })
}

pub(crate) fn map_transport(err: reqwest::Error, timeout_ms: u64, secrets: &[String]) -> Error {
    let message = scrub(&err.to_string(), secrets);
    classify_transport(err.is_timeout(), err.is_connect(), &message, timeout_ms)
}

pub(crate) fn classify_transport(
    is_timeout: bool,
    is_connect: bool,
    message: &str,
    timeout_ms: u64,
) -> Error {
    if is_timeout {
        return Error::Timeout { timeout_ms };
    }
    let lower = message.to_ascii_lowercase();
    if lower.contains("dns")
        || lower.contains("name resolution")
        || lower.contains("failed to lookup")
    {
        return Error::Dns(message.to_string());
    }
    if lower.contains("tls") || lower.contains("certificate") {
        return Error::Tls(message.to_string());
    }
    if is_connect {
        return Error::Connect(message.to_string());
    }
    Error::Network(message.to_string())
}

pub async fn execute_request(
    executor: &HttpExecutor,
    request: &HttpRequest,
    cancel: &CancellationToken,
) -> Result<HttpResponse, Error> {
    executor.execute(request, cancel).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transport_classification_prefers_timeout_then_dns_tls_and_connect() {
        assert_eq!(
            classify_transport(true, true, "timed out", 25).code(),
            "timeout"
        );
        assert_eq!(
            classify_transport(false, false, "dns lookup failed", 25).code(),
            "dns"
        );
        assert_eq!(
            classify_transport(false, false, "certificate verify failed", 25).code(),
            "tls"
        );
        assert_eq!(
            classify_transport(false, true, "connection refused", 25).code(),
            "connect"
        );
        assert_eq!(
            classify_transport(false, false, "reset by peer", 25).code(),
            "network"
        );
    }
}
