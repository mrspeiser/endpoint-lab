use url::Url;

use crate::http::request::HttpRequest;

const SENSITIVE_NAMES: &[&str] = &[
    "authorization",
    "cookie",
    "proxy-authorization",
    "set-cookie",
    "x-api-key",
    "api-key",
    "apikey",
    "x-api-token",
    "x-auth-token",
    "x-access-token",
    "token",
    "access-token",
    "secret",
    "password",
    "passwd",
    "auth",
];

pub fn is_sensitive_name(name: &str) -> bool {
    let normalized = name.trim().to_ascii_lowercase().replace('_', "-");
    if normalized.is_empty() {
        return false;
    }
    SENSITIVE_NAMES.contains(&normalized.as_str())
        || normalized.contains("api-key")
        || normalized.contains("apikey")
        || normalized.contains("token")
        || normalized.contains("secret")
        || normalized.contains("password")
        || normalized.contains("authorization")
}

pub fn redact_url(url: &str) -> String {
    let Ok(mut parsed) = Url::parse(url) else {
        return url.to_string();
    };
    if parsed.password().is_some() {
        let _ = parsed.set_password(None);
    }
    let pairs: Vec<(String, String)> = parsed
        .query_pairs()
        .map(|(key, value)| {
            let shown = if is_sensitive_name(&key) && !value.is_empty() {
                "***".to_string()
            } else {
                value.into_owned()
            };
            (key.into_owned(), shown)
        })
        .collect();
    parsed.set_query(None);
    if !pairs.is_empty() {
        let mut serializer = parsed.query_pairs_mut();
        for (key, value) in &pairs {
            serializer.append_pair(key, value);
        }
    }
    parsed.to_string()
}

pub fn secret_values(request: &HttpRequest) -> Vec<String> {
    let mut values = Vec::new();
    for header in &request.headers {
        push_secret(&mut values, &header.name, &header.value, header.secret);
    }
    for param in &request.query {
        push_secret(&mut values, &param.name, &param.value, param.secret);
    }
    if let Ok(parsed) = Url::parse(&request.url) {
        if let Some(password) = parsed.password() {
            push_raw(&mut values, password);
        }
        for (key, value) in parsed.query_pairs() {
            push_secret(&mut values, &key, &value, false);
        }
    }
    values
}

fn push_secret(values: &mut Vec<String>, name: &str, value: &str, marked: bool) {
    if marked || is_sensitive_name(name) {
        push_raw(values, value);
    }
}

fn push_raw(values: &mut Vec<String>, value: &str) {
    if value.len() >= 4 && value != "***" {
        values.push(value.to_string());
    }
}

pub use crate::http::request::redact_request;
