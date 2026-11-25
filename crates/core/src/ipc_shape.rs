use crate::bench::{BenchSnapshot, BenchSummary};
use crate::http::{HttpRequest, HttpResponse};

#[test]
fn ipc_fixtures_round_trip() {
    let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../src/fixtures/ipc-shapes.json");
    let text = std::fs::read_to_string(&path).unwrap();
    let value: serde_json::Value = serde_json::from_str(&text).unwrap();

    let request: HttpRequest = serde_json::from_value(value["request"].clone()).unwrap();
    assert_eq!(serde_json::to_value(&request).unwrap(), value["request"]);
    assert_eq!(request.method.as_str(), "POST");

    let response: HttpResponse = serde_json::from_value(value["response"].clone()).unwrap();
    assert_eq!(serde_json::to_value(&response).unwrap(), value["response"]);
    assert_eq!(response.status, 200);

    let snapshot: BenchSnapshot = serde_json::from_value(value["snapshot"].clone()).unwrap();
    assert_eq!(serde_json::to_value(&snapshot).unwrap(), value["snapshot"]);

    let summary: BenchSummary = serde_json::from_value(value["summary"].clone()).unwrap();
    assert_eq!(serde_json::to_value(&summary).unwrap(), value["summary"]);
    assert_eq!(summary.success, 98);
}
