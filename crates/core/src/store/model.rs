use serde::{Deserialize, Serialize};

use crate::bench::BenchSummary;
use crate::http::{HeaderEntry, HttpRequest, Method, RequestBody};

fn document_version() -> u32 {
    2
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    #[serde(default = "document_version")]
    pub version: u32,
    #[serde(default)]
    pub domains: Vec<Domain>,
    #[serde(default)]
    pub history: Vec<HistoryEntry>,
    #[serde(default)]
    pub benchmarks: Vec<BenchSummary>,
}

impl Default for Document {
    fn default() -> Self {
        Self {
            version: document_version(),
            domains: Vec::new(),
            history: Vec::new(),
            benchmarks: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Domain {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub collections: Vec<Collection>,
}

impl Domain {
    pub fn summary(&self) -> DomainSummary {
        DomainSummary {
            id: self.id.clone(),
            name: self.name.clone(),
            collections: self.collections.iter().map(Collection::summary).collect(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Collection {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub paths: Vec<SavedPath>,
    #[serde(default)]
    pub headers: Vec<SavedHeaderSet>,
    #[serde(default)]
    pub bodies: Vec<SavedBody>,
}

impl Collection {
    pub fn summary(&self) -> CollectionSummary {
        CollectionSummary {
            id: self.id.clone(),
            name: self.name.clone(),
            paths: self.paths.iter().map(SavedPath::summary).collect(),
            headers: self.headers.iter().map(SavedHeaderSet::summary).collect(),
            bodies: self.bodies.iter().map(SavedBody::summary).collect(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedPath {
    pub id: String,
    pub method: Method,
    pub path: String,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
}

impl SavedPath {
    pub fn summary(&self) -> PathSummary {
        PathSummary {
            id: self.id.clone(),
            method: self.method,
            path: self.path.clone(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedHeaderSet {
    pub id: String,
    pub name: String,
    pub headers: Vec<HeaderEntry>,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
}

impl SavedHeaderSet {
    pub fn summary(&self) -> HeaderSummary {
        HeaderSummary {
            id: self.id.clone(),
            name: self.name.clone(),
            updated_at_ms: self.updated_at_ms,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedBody {
    pub id: String,
    pub name: String,
    pub body: RequestBody,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
}

impl SavedBody {
    pub fn summary(&self) -> BodySummary {
        BodySummary {
            id: self.id.clone(),
            name: self.name.clone(),
            kind: body_kind(&self.body).to_string(),
            updated_at_ms: self.updated_at_ms,
        }
    }
}

fn body_kind(body: &RequestBody) -> &'static str {
    match body {
        RequestBody::None => "none",
        RequestBody::Json { .. } => "json",
        RequestBody::Text { .. } => "text",
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DomainSummary {
    pub id: String,
    pub name: String,
    pub collections: Vec<CollectionSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionSummary {
    pub id: String,
    pub name: String,
    pub paths: Vec<PathSummary>,
    pub headers: Vec<HeaderSummary>,
    pub bodies: Vec<BodySummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PathSummary {
    pub id: String,
    pub method: Method,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeaderSummary {
    pub id: String,
    pub name: String,
    pub updated_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BodySummary {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub updated_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadedHeaders {
    pub id: String,
    pub domain_id: String,
    pub collection_id: String,
    pub name: String,
    pub headers: Vec<HeaderEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadedBody {
    pub id: String,
    pub domain_id: String,
    pub collection_id: String,
    pub name: String,
    pub body: RequestBody,
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

/// Version 1 stored full requests in top-level collections.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LegacyDocument {
    #[serde(default)]
    pub history: Vec<HistoryEntry>,
    #[serde(default)]
    pub benchmarks: Vec<BenchSummary>,
    #[serde(default)]
    pub collections: Vec<LegacyCollection>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LegacyCollection {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub requests: Vec<LegacyRequest>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LegacyRequest {
    pub id: String,
    pub name: String,
    pub request: HttpRequest,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
}
