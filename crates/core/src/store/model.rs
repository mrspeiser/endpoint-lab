use serde::{Deserialize, Serialize};

use crate::bench::BenchSummary;
use crate::http::{HttpRequest, Method};

fn document_version() -> u32 {
    1
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    #[serde(default = "document_version")]
    pub version: u32,
    #[serde(default)]
    pub collections: Vec<Collection>,
    #[serde(default)]
    pub history: Vec<HistoryEntry>,
    #[serde(default)]
    pub benchmarks: Vec<BenchSummary>,
}

impl Default for Document {
    fn default() -> Self {
        Self {
            version: document_version(),
            collections: Vec::new(),
            history: Vec::new(),
            benchmarks: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Collection {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub requests: Vec<SavedRequest>,
}

impl Collection {
    pub fn summary(&self) -> CollectionSummary {
        CollectionSummary {
            id: self.id.clone(),
            name: self.name.clone(),
            requests: self.requests.iter().map(SavedRequest::summary).collect(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedRequest {
    pub id: String,
    pub name: String,
    pub request: HttpRequest,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
}

impl SavedRequest {
    pub fn summary(&self) -> RequestSummary {
        RequestSummary {
            id: self.id.clone(),
            name: self.name.clone(),
            method: self.request.method,
            url: self.request.url.clone(),
            updated_at_ms: self.updated_at_ms,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionSummary {
    pub id: String,
    pub name: String,
    pub requests: Vec<RequestSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestSummary {
    pub id: String,
    pub name: String,
    pub method: Method,
    pub url: String,
    pub updated_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadedRequest {
    pub id: String,
    pub collection_id: String,
    pub name: String,
    pub request: HttpRequest,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: String,
    pub at_ms: i64,
    pub request: HttpRequest,
    pub ok: bool,
    pub status: Option<u16>,
    pub elapsed_ms: Option<u64>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoreStatus {
    pub ok: bool,
    pub message: Option<String>,
}
