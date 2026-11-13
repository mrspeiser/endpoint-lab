use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::error::Error;

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| i64::try_from(duration.as_millis()).unwrap_or(i64::MAX))
        .unwrap_or(0)
}

pub fn duration_ms(duration: Duration) -> u64 {
    u64::try_from(duration.as_millis()).unwrap_or(u64::MAX)
}

pub fn duration_us(duration: Duration) -> u64 {
    u64::try_from(duration.as_micros()).unwrap_or(u64::MAX)
}

pub fn storage(err: impl std::fmt::Display) -> Error {
    Error::Storage(err.to_string())
}

/// Replace known secret strings with a fixed mask.
///
/// `str::replace` matches literally, so characters that are special in a
/// regular expression stay ordinary text.
pub fn scrub(message: &str, secrets: &[String]) -> String {
    let mut out = message.to_string();
    for secret in secrets {
        if secret.len() >= 4 && secret != "***" {
            out = out.replace(secret, "***");
        }
    }
    out
}

pub fn truncate_in_place(value: &mut String, limit: usize) {
    if value.len() <= limit {
        return;
    }
    let mut end = limit;
    while end > 0 && !value.is_char_boundary(end) {
        end -= 1;
    }
    value.truncate(end);
}
