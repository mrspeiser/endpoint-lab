use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::limits::PREVIEW_LIMIT_BYTES;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HeaderView {
    pub name: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ResponseBody {
    Empty,
    Text { content: String, pretty: bool },
    Binary { message: String },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HttpResponse {
    pub status: u16,
    pub status_text: String,
    pub headers: Vec<HeaderView>,
    pub body: ResponseBody,
    pub size_bytes: u64,
    pub size_exact: bool,
    pub truncated: bool,
    pub elapsed_ms: u64,
}

pub struct RawBody {
    pub content_type: Option<String>,
    pub bytes: Vec<u8>,
    pub size_bytes: u64,
    pub size_exact: bool,
}

pub fn interpret_body(raw: &RawBody) -> ResponseBody {
    if raw.bytes.is_empty() {
        return ResponseBody::Empty;
    }
    if !is_textual(raw.content_type.as_deref()) {
        return ResponseBody::Binary {
            message: format!(
                "Binary response ({}). Preview omitted.",
                format_size(raw.size_bytes, raw.size_exact)
            ),
        };
    }
    let text = String::from_utf8_lossy(&raw.bytes).into_owned();
    let content_type = raw.content_type.as_deref().unwrap_or("");
    let want_json =
        content_type.to_ascii_lowercase().contains("json") || looks_like_json(&raw.bytes);
    if want_json {
        if let Ok(value) = serde_json::from_slice::<Value>(&raw.bytes) {
            if let Ok(pretty) = serde_json::to_string_pretty(&value) {
                return ResponseBody::Text {
                    content: pretty,
                    pretty: true,
                };
            }
        }
    }
    ResponseBody::Text {
        content: text,
        pretty: false,
    }
}

fn is_textual(content_type: Option<&str>) -> bool {
    let Some(content_type) = content_type else {
        return true;
    };
    let content_type = content_type.to_ascii_lowercase();
    content_type.starts_with("text/")
        || content_type.contains("json")
        || content_type.contains("xml")
        || content_type.contains("javascript")
        || content_type.contains("x-www-form-urlencoded")
        || content_type.contains("graphql")
        || content_type.contains("yaml")
}

fn looks_like_json(bytes: &[u8]) -> bool {
    let trimmed = trim_ascii(bytes);
    matches!(trimmed.first(), Some(b'{') | Some(b'['))
}

fn trim_ascii(bytes: &[u8]) -> &[u8] {
    let start = bytes
        .iter()
        .position(|byte| !byte.is_ascii_whitespace())
        .unwrap_or(bytes.len());
    let end = bytes
        .iter()
        .rposition(|byte| !byte.is_ascii_whitespace())
        .map(|index| index + 1)
        .unwrap_or(start);
    &bytes[start..end]
}

fn format_size(bytes: u64, exact: bool) -> String {
    let shown = if bytes < 1024 {
        format!("{bytes} B")
    } else {
        format!("{:.1} KB", bytes as f64 / 1024.0)
    };
    if exact {
        shown
    } else {
        format!("at least {shown}")
    }
}

pub fn preview_limit() -> usize {
    PREVIEW_LIMIT_BYTES
}

#[cfg(test)]
mod tests {
    use super::*;

    fn raw(content_type: Option<&str>, bytes: &[u8]) -> RawBody {
        RawBody {
            content_type: content_type.map(str::to_string),
            bytes: bytes.to_vec(),
            size_bytes: bytes.len() as u64,
            size_exact: true,
        }
    }

    #[test]
    fn json_is_pretty_printed() {
        let body = interpret_body(&raw(Some("application/json"), br#"{"a":1,"b":[true]}"#));
        match body {
            ResponseBody::Text { content, pretty } => {
                assert!(pretty);
                assert!(content.contains('\n'));
                assert!(content.contains("\"a\""));
            }
            other => panic!("expected text, got {other:?}"),
        }
    }

    #[test]
    fn invalid_json_stays_text() {
        let body = interpret_body(&raw(Some("application/json"), b"not-json"));
        assert_eq!(
            body,
            ResponseBody::Text {
                content: "not-json".into(),
                pretty: false
            }
        );
    }

    #[test]
    fn plain_text_is_preserved() {
        let body = interpret_body(&raw(Some("text/plain"), b"hello"));
        assert_eq!(
            body,
            ResponseBody::Text {
                content: "hello".into(),
                pretty: false
            }
        );
    }

    #[test]
    fn binary_content_is_not_dumped() {
        let body = interpret_body(&raw(Some("application/octet-stream"), &[0, 255, 0, 1]));
        assert!(matches!(body, ResponseBody::Binary { .. }));
    }

    #[test]
    fn empty_payload_is_empty() {
        assert_eq!(interpret_body(&raw(None, b"")), ResponseBody::Empty);
    }
}
