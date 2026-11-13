use std::fmt;

use serde::{Deserialize, Serialize};
use url::Url;

use crate::error::Error;
use crate::http::redact::{is_sensitive_name, redact_url};
use crate::limits::{HISTORY_BODY_LIMIT, MAX_TIMEOUT_MS};
use crate::util::truncate_in_place;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "UPPERCASE")]
pub enum Method {
    Get,
    Post,
    Put,
    Patch,
    Delete,
    Head,
}

impl Method {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Get => "GET",
            Self::Post => "POST",
            Self::Put => "PUT",
            Self::Patch => "PATCH",
            Self::Delete => "DELETE",
            Self::Head => "HEAD",
        }
    }

    pub fn to_reqwest(self) -> reqwest::Method {
        reqwest::Method::from_bytes(self.as_str().as_bytes())
            .expect("method names are valid HTTP tokens")
    }

    pub fn allows_body(self) -> bool {
        !matches!(self, Self::Get | Self::Head)
    }
}

impl fmt::Display for Method {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

pub fn parse_method(value: &str) -> Result<Method, Error> {
    match value.trim().to_ascii_uppercase().as_str() {
        "GET" => Ok(Method::Get),
        "POST" => Ok(Method::Post),
        "PUT" => Ok(Method::Put),
        "PATCH" => Ok(Method::Patch),
        "DELETE" => Ok(Method::Delete),
        "HEAD" => Ok(Method::Head),
        other => Err(Error::InvalidConfig(format!(
            "unsupported method '{other}'"
        ))),
    }
}

fn default_enabled() -> bool {
    true
}

#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HeaderEntry {
    pub name: String,
    pub value: String,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    #[serde(default)]
    pub secret: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub secret_ref: Option<String>,
}

impl fmt::Debug for HeaderEntry {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let value = if self.secret || is_sensitive_name(&self.name) {
            "***"
        } else {
            self.value.as_str()
        };
        formatter
            .debug_struct("HeaderEntry")
            .field("name", &self.name)
            .field("value", &value)
            .field("enabled", &self.enabled)
            .field("secret", &self.secret)
            .finish()
    }
}

#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct QueryParam {
    pub name: String,
    pub value: String,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    #[serde(default)]
    pub secret: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub secret_ref: Option<String>,
}

impl fmt::Debug for QueryParam {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let value = if self.secret || is_sensitive_name(&self.name) {
            "***"
        } else {
            self.value.as_str()
        };
        formatter
            .debug_struct("QueryParam")
            .field("name", &self.name)
            .field("value", &value)
            .field("enabled", &self.enabled)
            .field("secret", &self.secret)
            .finish()
    }
}

/// `kind` is the JSON discriminator (`none`, `json`, `text`).
///
/// The JSON variant stores the text the user typed. It is not parsed before
/// it is sent, so a client can deliberately send invalid JSON.
#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum RequestBody {
    None,
    Json { value: String },
    Text { value: String },
}

impl fmt::Debug for RequestBody {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::None => formatter.write_str("None"),
            Self::Json { value } => write!(formatter, "Json({} bytes)", value.len()),
            Self::Text { value } => write!(formatter, "Text({} bytes)", value.len()),
        }
    }
}

impl RequestBody {
    pub fn truncate(&mut self, limit: usize) {
        match self {
            Self::None => {}
            Self::Json { value } | Self::Text { value } => truncate_in_place(value, limit),
        }
    }
}

#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UrlSecretRef {
    pub slot: String,
    pub secret_ref: String,
}

#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HttpRequest {
    pub method: Method,
    pub url: String,
    #[serde(default)]
    pub headers: Vec<HeaderEntry>,
    #[serde(default)]
    pub query: Vec<QueryParam>,
    pub body: RequestBody,
    pub timeout_ms: u64,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub url_secret_refs: Vec<UrlSecretRef>,
}

impl fmt::Debug for HttpRequest {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let redacted = redact_request(self);
        formatter
            .debug_struct("HttpRequest")
            .field("method", &redacted.method)
            .field("url", &redacted.url)
            .field("headers", &redacted.headers)
            .field("query", &redacted.query)
            .field("body", &self.body)
            .field("timeout_ms", &self.timeout_ms)
            .finish()
    }
}

pub fn redact_request(request: &HttpRequest) -> HttpRequest {
    let mut out = request.clone();
    out.url = redact_url(&request.url);
    for header in &mut out.headers {
        mask_entry(&header.name, &mut header.value, &mut header.secret);
        header.secret_ref = None;
    }
    for param in &mut out.query {
        mask_entry(&param.name, &mut param.value, &mut param.secret);
        param.secret_ref = None;
    }
    out.url_secret_refs.clear();
    out.body.truncate(HISTORY_BODY_LIMIT);
    out
}

fn mask_entry(name: &str, value: &mut String, secret: &mut bool) {
    if *secret || is_sensitive_name(name) {
        if !value.is_empty() {
            *value = "***".to_string();
        }
        *secret = true;
    }
}

pub fn build_url(request: &HttpRequest) -> Result<Url, Error> {
    let mut url = Url::parse(request.url.trim()).map_err(|err| Error::InvalidUrl(err.to_string()))?;
    if url.scheme() != "http" && url.scheme() != "https" {
        return Err(Error::InvalidUrl(format!(
            "unsupported scheme '{}'",
            url.scheme()
        )));
    }
    if url.host_str().is_none() {
        return Err(Error::InvalidUrl("url is missing a host".into()));
    }
    let extra: Vec<(String, String)> = request
        .query
        .iter()
        .filter(|param| param.enabled && !param.name.trim().is_empty())
        .map(|param| (param.name.trim().to_string(), param.value.clone()))
        .collect();
    if !extra.is_empty() {
        let mut pairs = url.query_pairs_mut();
        for (name, value) in extra {
            pairs.append_pair(&name, &value);
        }
    }
    Ok(url)
}

pub fn normalize_timeout(timeout_ms: u64, default_ms: u64) -> Result<u64, Error> {
    let timeout_ms = if timeout_ms == 0 { default_ms } else { timeout_ms };
    if timeout_ms > MAX_TIMEOUT_MS {
        return Err(Error::InvalidConfig(format!(
            "timeout cannot exceed {MAX_TIMEOUT_MS} ms"
        )));
    }
    Ok(timeout_ms)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(url: &str) -> HttpRequest {
        HttpRequest {
            method: Method::Get,
            url: url.to_string(),
            headers: Vec::new(),
            query: vec![QueryParam {
                name: "q".into(),
                value: "rust".into(),
                enabled: true,
                secret: false,
                secret_ref: None,
            }],
            body: RequestBody::None,
            timeout_ms: 1000,
            url_secret_refs: Vec::new(),
        }
    }

    #[test]
    fn query_parameters_are_appended_to_existing_ones() {
        let url = build_url(&request("http://127.0.0.1:9/items?page=2")).unwrap();
        let pairs: Vec<_> = url.query_pairs().collect();
        assert!(pairs.iter().any(|(key, value)| key == "page" && value == "2"));
        assert!(pairs.iter().any(|(key, value)| key == "q" && value == "rust"));
    }

    #[test]
    fn disabled_and_blank_query_parameters_are_skipped() {
        let mut sample = request("http://127.0.0.1/items");
        sample.query.push(QueryParam {
            name: "skip".into(),
            value: "1".into(),
            enabled: false,
            secret: false,
            secret_ref: None,
        });
        sample.query.push(QueryParam {
            name: "  ".into(),
            value: "x".into(),
            enabled: true,
            secret: false,
            secret_ref: None,
        });
        let url = build_url(&sample).unwrap();
        assert_eq!(url.query(), Some("q=rust"));
    }

    #[test]
    fn only_http_schemes_are_accepted() {
        let error = build_url(&request("file:///tmp/demo")).unwrap_err();
        assert_eq!(error.code(), "invalid_url");
    }

    #[test]
    fn debug_output_masks_authorization() {
        let mut sample = request("http://user:s3cr3t-value-xyz@127.0.0.1/v1?api_key=s3cr3t-value-xyz");
        sample.headers.push(HeaderEntry {
            name: "Authorization".into(),
            value: "s3cr3t-value-xyz".into(),
            enabled: true,
            secret: false,
            secret_ref: None,
        });
        let rendered = format!("{sample:?}");
        assert!(!rendered.contains("s3cr3t-value-xyz"));
        assert!(rendered.contains("***"));
    }
}
