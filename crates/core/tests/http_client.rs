#[path = "common/mod.rs"]
mod support;

use std::time::{Duration, Instant};

use axum::{routing::get, Router};
use tokio_util::sync::CancellationToken;

use endpoint_lab_core::{
    HeaderEntry, HttpExecutor, Method, QueryParam, RequestBody, ResponseBody,
};

use support::{bad_json, binary, echo_router, large, plain, request, serve};

#[tokio::test]
async fn constructs_and_reads_a_json_request() {
    let base = serve(echo_router()).await;
    let executor = HttpExecutor::new().unwrap();
    let mut sample = request(Method::Post, &format!("{base}/echo?page=2"));
    sample.headers.push(HeaderEntry {
        name: "X-Test".into(),
        value: "yes".into(),
        enabled: true,
        secret: false,
        secret_ref: None,
    });
    sample.query.push(QueryParam {
        name: "q".into(),
        value: "rust".into(),
        enabled: true,
        secret: false,
        secret_ref: None,
    });
    sample.body = RequestBody::Json {
        value: "{\"a\":1}".into(),
    };
    sample.timeout_ms = 2_000;

    let response = executor
        .execute(&sample, &CancellationToken::new())
        .await
        .unwrap();
    assert_eq!(response.status, 200);
    let ResponseBody::Text { content, pretty } = response.body else {
        panic!("expected a text body");
    };
    assert!(pretty);
    assert!(content.contains("\"POST\""));
    assert!(content.contains("\"q\""));
    assert!(content.contains("rust"));
    assert!(content.contains("page"));
    assert!(content.contains("yes"));
    assert!(content.contains("{\\\"a\\\":1}") || content.contains("{\"a\":1}"));
    assert!(response.elapsed_ms < 2_000);
    assert!(!response.truncated);
}

#[tokio::test]
async fn plain_text_invalid_json_and_binary_are_distinct() {
    let base = serve(
        Router::new()
            .route("/plain", get(plain))
            .route("/bad", get(bad_json))
            .route("/bin", get(binary)),
    )
    .await;
    let executor = HttpExecutor::new().unwrap();
    let plain_response = executor
        .execute(&request(Method::Get, &format!("{base}/plain")), &CancellationToken::new())
        .await
        .unwrap();
    assert_eq!(
        plain_response.body,
        ResponseBody::Text {
            content: "hello".into(),
            pretty: false
        }
    );

    let bad = executor
        .execute(&request(Method::Get, &format!("{base}/bad")), &CancellationToken::new())
        .await
        .unwrap();
    assert_eq!(
        bad.body,
        ResponseBody::Text {
            content: "not-json".into(),
            pretty: false
        }
    );

    let binary_response = executor
        .execute(&request(Method::Get, &format!("{base}/bin")), &CancellationToken::new())
        .await
        .unwrap();
    assert!(matches!(binary_response.body, ResponseBody::Binary { .. }));
}

#[tokio::test]
async fn large_bodies_are_truncated_to_the_preview_limit() {
    let base = serve(Router::new().route("/large", get(large))).await;
    let executor = HttpExecutor::new().unwrap();
    let response = executor
        .execute(
            &request(Method::Get, &format!("{base}/large")),
            &CancellationToken::new(),
        )
        .await
        .unwrap();
    assert!(response.truncated);
    assert_eq!(response.size_bytes, 1_500_000);
    assert!(response.size_exact);
    let ResponseBody::Text { content, .. } = response.body else {
        panic!("expected text preview");
    };
    assert!(content.len() <= 1024 * 1024);
}

#[tokio::test]
async fn http_errors_are_still_responses() {
    let base = serve(Router::new().route(
        "/missing",
        get(|| async { axum::http::StatusCode::NOT_FOUND }),
    ))
    .await;
    let executor = HttpExecutor::new().unwrap();
    let response = executor
        .execute(
            &request(Method::Get, &format!("{base}/missing")),
            &CancellationToken::new(),
        )
        .await
        .unwrap();
    assert_eq!(response.status, 404);
}

#[tokio::test]
async fn timeout_is_reported_without_hanging() {
    let base = serve(Router::new().route(
        "/slow",
        get(|| async {
            tokio::time::sleep(Duration::from_secs(5)).await;
            "late"
        }),
    ))
    .await;
    let executor = HttpExecutor::new().unwrap();
    let mut sample = request(Method::Get, &format!("{base}/slow"));
    sample.timeout_ms = 200;
    let started = Instant::now();
    let error = executor
        .execute(&sample, &CancellationToken::new())
        .await
        .unwrap_err();
    assert_eq!(error.code(), "timeout");
    assert!(started.elapsed() < Duration::from_secs(2));
}

#[tokio::test]
async fn cancellation_aborts_an_in_flight_request() {
    let base = serve(Router::new().route(
        "/slow",
        get(|| async {
            tokio::time::sleep(Duration::from_secs(30)).await;
            "late"
        }),
    ))
    .await;
    let executor = HttpExecutor::new().unwrap();
    let sample = request(Method::Get, &format!("{base}/slow"));
    let cancel = CancellationToken::new();
    let cancel_later = cancel.clone();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(50)).await;
        cancel_later.cancel();
    });
    let started = Instant::now();
    let error = executor.execute(&sample, &cancel).await.unwrap_err();
    assert_eq!(error.code(), "cancelled");
    assert!(started.elapsed() < Duration::from_secs(2));
}

#[tokio::test]
async fn get_does_not_send_a_body() {
    let base = serve(echo_router()).await;
    let executor = HttpExecutor::new().unwrap();
    let mut sample = request(Method::Get, &format!("{base}/echo"));
    sample.body = RequestBody::Text {
        value: "should-not-send".into(),
    };
    let response = executor
        .execute(&sample, &CancellationToken::new())
        .await
        .unwrap();
    let ResponseBody::Text { content, .. } = response.body else {
        panic!("expected text");
    };
    assert!(!content.contains("should-not-send"));
}
