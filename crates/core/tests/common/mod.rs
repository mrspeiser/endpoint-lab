#![allow(dead_code)]

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use axum::{
    body::Bytes,
    extract::{Query, State},
    http::{header, HeaderMap, Method, StatusCode},
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use serde_json::{json, Value};
use tokio::net::TcpListener;

use endpoint_lab_core::{HttpRequest, Method as Verb, RequestBody};

#[derive(Default)]
pub struct Hits {
    pub hits: AtomicU64,
    pub in_flight: AtomicU64,
    pub peak: AtomicU64,
}

pub async fn serve(app: Router) -> String {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move {
        axum::serve(listener, app.into_make_service())
            .await
            .unwrap();
    });
    tokio::time::sleep(Duration::from_millis(20)).await;
    format!("http://{address}")
}

pub fn request(method: Verb, url: &str) -> HttpRequest {
    HttpRequest {
        method,
        url: url.to_string(),
        headers: Vec::new(),
        query: Vec::new(),
        body: RequestBody::None,
        timeout_ms: 5_000,
        url_secret_refs: Vec::new(),
    }
}

pub async fn echo(
    method: Method,
    Query(query): Query<Vec<(String, String)>>,
    headers: HeaderMap,
    body: Bytes,
) -> Json<Value> {
    let mut header_map = serde_json::Map::new();
    for (name, value) in headers.iter() {
        header_map.insert(
            name.as_str().to_string(),
            Value::String(String::from_utf8_lossy(value.as_bytes()).into_owned()),
        );
    }
    Json(json!({
        "method": method.as_str(),
        "query": query,
        "headers": header_map,
        "body": String::from_utf8_lossy(&body),
    }))
}

pub async fn tracked(State(state): State<Arc<Hits>>) -> &'static str {
    state.hits.fetch_add(1, Ordering::SeqCst);
    let now = state.in_flight.fetch_add(1, Ordering::SeqCst) + 1;
    state.peak.fetch_max(now, Ordering::SeqCst);
    tokio::time::sleep(Duration::from_millis(200)).await;
    state.in_flight.fetch_sub(1, Ordering::SeqCst);
    "ok"
}

pub async fn delay(State(millis): State<u64>) -> &'static str {
    tokio::time::sleep(Duration::from_millis(millis)).await;
    "ok"
}

pub async fn count_hits(State(state): State<Arc<Hits>>) -> &'static str {
    state.hits.fetch_add(1, Ordering::SeqCst);
    tokio::time::sleep(Duration::from_millis(20)).await;
    "ok"
}

pub async fn status_500() -> StatusCode {
    StatusCode::INTERNAL_SERVER_ERROR
}

pub async fn large() -> impl IntoResponse {
    ([(header::CONTENT_TYPE, "text/plain")], "a".repeat(1_500_000))
}

pub async fn binary() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "application/octet-stream")],
        vec![0_u8, 255, 0, 1],
    )
}

pub async fn plain() -> impl IntoResponse {
    ([(header::CONTENT_TYPE, "text/plain")], "hello")
}

pub async fn bad_json() -> impl IntoResponse {
    ([(header::CONTENT_TYPE, "application/json")], "not-json")
}

pub fn echo_router() -> Router {
    Router::new().route("/echo", get(echo).post(echo).put(echo).patch(echo).delete(echo))
}

pub fn fast_router() -> Router {
    Router::new().route("/fast", get(|| async { "ok" }).post(|| async { "ok" }))
}
