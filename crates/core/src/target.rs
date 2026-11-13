use url::Url;

use crate::error::Error;

/// Loopback targets can be load-tested without an extra confirmation.
/// Every other host requires `authorize_remote`.
pub fn ensure_target_allowed(url: &str, authorize_remote: bool) -> Result<(), Error> {
    let host = host_of(url)?;
    if is_loopback_host(&host) || authorize_remote {
        Ok(())
    } else {
        Err(Error::TargetNotAuthorized { host })
    }
}

pub fn is_loopback_url(url: &str) -> bool {
    host_of(url)
        .map(|host| is_loopback_host(&host))
        .unwrap_or(false)
}

fn host_of(url: &str) -> Result<String, Error> {
    let parsed = Url::parse(url.trim()).map_err(|err| Error::InvalidUrl(err.to_string()))?;
    parsed
        .host_str()
        .map(ToString::to_string)
        .ok_or_else(|| Error::InvalidUrl("url is missing a host".into()))
}

pub fn is_loopback_host(host: &str) -> bool {
    let host = host
        .trim()
        .trim_matches(|character| character == '[' || character == ']')
        .trim_end_matches('.');
    host.eq_ignore_ascii_case("localhost")
        || host == "::1"
        || host
            .split('.')
            .next()
            .is_some_and(|octet| octet == "127" && host.parse::<std::net::Ipv4Addr>().is_ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn loopback_hosts_are_allowed_without_confirmation() {
        assert!(ensure_target_allowed("http://127.0.0.1:8080/health", false).is_ok());
        assert!(ensure_target_allowed("http://localhost/v1", false).is_ok());
        assert!(ensure_target_allowed("http://[::1]:9/", false).is_ok());
        assert!(ensure_target_allowed("http://127.1.2.3/", false).is_ok());
    }

    #[test]
    fn remote_hosts_require_an_explicit_opt_in() {
        let denied = ensure_target_allowed("https://example.com/api", false).unwrap_err();
        assert_eq!(denied.code(), "target_not_authorized");
        assert!(ensure_target_allowed("https://example.com/api", true).is_ok());
    }
}
