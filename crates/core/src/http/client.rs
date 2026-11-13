use std::time::Duration;

use reqwest::redirect::Policy;

use crate::error::Error;
use crate::limits::MAX_CONCURRENCY;

pub fn build_client() -> Result<reqwest::Client, Error> {
    reqwest::Client::builder()
        .user_agent("EndpointLab/0.1")
        .pool_max_idle_per_host(MAX_CONCURRENCY)
        .pool_idle_timeout(Duration::from_secs(30))
        .tcp_keepalive(Duration::from_secs(30))
        .redirect(Policy::limited(10))
        .build()
        .map_err(|err| Error::Network(err.to_string()))
}
