//! Local collections, history, and benchmark summaries.
//!
//! The store is a JSON file plus a [`SecretStore`]. The file never contains
//! secret values. Tests pass a temporary path and [`MemorySecretStore`]; the
//! desktop app uses the OS keychain.

mod model;
mod secrets;

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::bench::BenchSummary;
use crate::error::Error;
use crate::http::{redact_request, secret_values, HttpRequest};
use crate::limits::{BENCHMARK_HISTORY_LIMIT, HISTORY_LIMIT};
use crate::util::{now_ms, scrub, storage};
use model::{Collection, Document, SavedRequest};
pub use model::{CollectionSummary, HistoryEntry, LoadedRequest, RequestSummary, StoreStatus};
use secrets::forget_refs;
pub use secrets::{seal_request, unseal_request, KeyringSecretStore, MemorySecretStore, SecretStore};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryOutcome {
    pub ok: bool,
    pub status: Option<u16>,
    pub elapsed_ms: Option<u64>,
    pub error: Option<String>,
}

pub struct Store {
    path: PathBuf,
    doc: Document,
    load_error: Option<String>,
}

impl Store {
    pub fn open(path: PathBuf) -> Self {
        if path.as_os_str().is_empty() {
            return Self::unavailable("storage path is empty".into());
        }
        if !path.exists() {
            return Self {
                path,
                doc: Document::default(),
                load_error: None,
            };
        }
        match fs::read_to_string(&path).and_then(|text| {
            serde_json::from_str::<Document>(&text).map_err(|err| {
                std::io::Error::new(std::io::ErrorKind::InvalidData, err)
            })
        }) {
            Ok(doc) => Self {
                path,
                doc,
                load_error: None,
            },
            Err(err) => Self {
                path,
                doc: Document::default(),
                load_error: Some(err.to_string()),
            },
        }
    }

    pub fn unavailable(message: String) -> Self {
        Self {
            path: PathBuf::new(),
            doc: Document::default(),
            load_error: Some(message),
        }
    }

    pub fn status(&self) -> StoreStatus {
        StoreStatus {
            ok: self.load_error.is_none(),
            message: self.load_error.clone(),
        }
    }

    pub fn list_collections(&self) -> Vec<CollectionSummary> {
        self.doc
            .collections
            .iter()
            .map(Collection::summary)
            .collect()
    }

    pub fn create_collection(&mut self, name: String) -> Result<CollectionSummary, Error> {
        let name = require_name(&name, "collection name")?;
        let mut doc = self.doc.clone();
        let collection = Collection {
            id: uuid::Uuid::new_v4().to_string(),
            name,
            requests: Vec::new(),
        };
        let summary = collection.summary();
        doc.collections.push(collection);
        self.commit(doc)?;
        Ok(summary)
    }

    pub fn rename_collection(&mut self, id: &str, name: String) -> Result<(), Error> {
        let name = require_name(&name, "collection name")?;
        let mut doc = self.doc.clone();
        let collection = find_collection_mut(&mut doc, id)?;
        collection.name = name;
        self.commit(doc)
    }

    pub fn delete_collection(&mut self, id: &str, secrets: &dyn SecretStore) -> Result<(), Error> {
        let mut doc = self.doc.clone();
        let index = doc
            .collections
            .iter()
            .position(|collection| collection.id == id)
            .ok_or_else(|| Error::NotFound(format!("collection {id}")))?;
        let removed = doc.collections.remove(index);
        let refs = removed
            .requests
            .iter()
            .flat_map(|saved| secrets::refs_of(&saved.request))
            .collect::<Vec<_>>();
        self.commit(doc)?;
        secrets::delete_refs(secrets, &refs);
        Ok(())
    }

    pub fn save_request(
        &mut self,
        secrets: &dyn SecretStore,
        collection_id: &str,
        name: String,
        request: &HttpRequest,
    ) -> Result<RequestSummary, Error> {
        let name = request_name(&name);
        let sealed = seal_request(request, secrets)?;
        let mut doc = self.doc.clone();
        let collection = find_collection_mut(&mut doc, collection_id)?;
        let saved = SavedRequest {
            id: uuid::Uuid::new_v4().to_string(),
            name,
            request: sealed,
            created_at_ms: now_ms(),
            updated_at_ms: now_ms(),
        };
        let summary = saved.summary();
        collection.requests.push(saved);
        self.commit(doc)?;
        Ok(summary)
    }

    pub fn update_request(
        &mut self,
        secrets: &dyn SecretStore,
        collection_id: &str,
        request_id: &str,
        name: String,
        request: &HttpRequest,
    ) -> Result<RequestSummary, Error> {
        let name = request_name(&name);
        let sealed = seal_request(request, secrets)?;
        let mut doc = self.doc.clone();
        let previous = {
            let collection = find_collection_mut(&mut doc, collection_id)?;
            let saved = find_request_mut(collection, request_id)?;
            let previous = saved.request.clone();
            saved.name = name;
            saved.request = sealed.clone();
            saved.updated_at_ms = now_ms();
            previous
        };
        let summary = doc
            .collections
            .iter()
            .find(|collection| collection.id == collection_id)
            .and_then(|collection| collection.requests.iter().find(|saved| saved.id == request_id))
            .map(SavedRequest::summary)
            .ok_or_else(|| Error::NotFound(format!("request {request_id}")))?;
        self.commit(doc)?;
        forget_refs(secrets, &previous, &sealed);
        Ok(summary)
    }

    pub fn delete_request(
        &mut self,
        secrets: &dyn SecretStore,
        collection_id: &str,
        request_id: &str,
    ) -> Result<(), Error> {
        let mut doc = self.doc.clone();
        let collection = find_collection_mut(&mut doc, collection_id)?;
        let index = collection
            .requests
            .iter()
            .position(|saved| saved.id == request_id)
            .ok_or_else(|| Error::NotFound(format!("request {request_id}")))?;
        let removed = collection.requests.remove(index);
        let refs = secrets::refs_of(&removed.request);
        self.commit(doc)?;
        secrets::delete_refs(secrets, &refs);
        Ok(())
    }

    pub fn load_request(
        &self,
        secrets: &dyn SecretStore,
        collection_id: &str,
        request_id: &str,
    ) -> Result<LoadedRequest, Error> {
        self.ensure_readable()?;
        let collection = self
            .doc
            .collections
            .iter()
            .find(|collection| collection.id == collection_id)
            .ok_or_else(|| Error::NotFound(format!("collection {collection_id}")))?;
        let saved = collection
            .requests
            .iter()
            .find(|saved| saved.id == request_id)
            .ok_or_else(|| Error::NotFound(format!("request {request_id}")))?;
        Ok(LoadedRequest {
            id: saved.id.clone(),
            collection_id: collection.id.clone(),
            name: saved.name.clone(),
            request: unseal_request(&saved.request, secrets)?,
        })
    }

    pub fn record_history(&mut self, request: &HttpRequest, mut outcome: HistoryOutcome) -> Result<(), Error> {
        if let Some(message) = outcome.error.as_deref() {
            outcome.error = Some(scrub(message, &secret_values(request)));
        }
        let mut doc = self.doc.clone();
        doc.history.insert(
            0,
            HistoryEntry {
                id: uuid::Uuid::new_v4().to_string(),
                at_ms: now_ms(),
                request: redact_request(request),
                ok: outcome.ok,
                status: outcome.status,
                elapsed_ms: outcome.elapsed_ms,
                error: outcome.error,
            },
        );
        if doc.history.len() > HISTORY_LIMIT {
            doc.history.truncate(HISTORY_LIMIT);
        }
        self.commit(doc)
    }

    pub fn list_history(&self) -> Vec<HistoryEntry> {
        self.doc.history.clone()
    }

    pub fn record_benchmark(&mut self, summary: BenchSummary) -> Result<(), Error> {
        let mut doc = self.doc.clone();
        doc.benchmarks.insert(0, summary);
        if doc.benchmarks.len() > BENCHMARK_HISTORY_LIMIT {
            doc.benchmarks.truncate(BENCHMARK_HISTORY_LIMIT);
        }
        self.commit(doc)
    }

    pub fn list_benchmarks(&self) -> Vec<BenchSummary> {
        self.doc.benchmarks.clone()
    }

    fn ensure_readable(&self) -> Result<(), Error> {
        match &self.load_error {
            Some(message) => Err(Error::Storage(message.clone())),
            None => Ok(()),
        }
    }

    fn commit(&mut self, doc: Document) -> Result<(), Error> {
        self.ensure_readable()?;
        if self.path.as_os_str().is_empty() {
            return Err(Error::Storage("storage path is empty".into()));
        }
        let bytes = serde_json::to_vec_pretty(&doc).map_err(storage)?;
        write_atomic(&self.path, &bytes)?;
        self.doc = doc;
        Ok(())
    }
}

pub fn default_store_path() -> Result<PathBuf, Error> {
    let dirs = directories::ProjectDirs::from("com", "matthewspeiser", "endpoint-lab")
        .ok_or_else(|| Error::Storage("could not resolve the app data directory".into()))?;
    Ok(dirs.data_dir().join("endpoint-lab.json"))
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), Error> {
    if let Some(parent) = path.parent()
        && !parent.as_os_str().is_empty()
    {
        fs::create_dir_all(parent).map_err(storage)?;
    }
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, bytes).map_err(storage)?;
    fs::rename(&tmp, path).map_err(storage)?;
    Ok(())
}

fn require_name(name: &str, label: &str) -> Result<String, Error> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(Error::InvalidConfig(format!("{label} cannot be empty")));
    }
    Ok(trimmed.to_string())
}

fn request_name(name: &str) -> String {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        "Untitled".to_string()
    } else {
        trimmed.to_string()
    }
}

fn find_collection_mut<'a>(doc: &'a mut Document, id: &str) -> Result<&'a mut Collection, Error> {
    doc.collections
        .iter_mut()
        .find(|collection| collection.id == id)
        .ok_or_else(|| Error::NotFound(format!("collection {id}")))
}

fn find_request_mut<'a>(
    collection: &'a mut Collection,
    id: &str,
) -> Result<&'a mut SavedRequest, Error> {
    collection
        .requests
        .iter_mut()
        .find(|saved| saved.id == id)
        .ok_or_else(|| Error::NotFound(format!("request {id}")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::http::{HeaderEntry, Method, QueryParam, RequestBody};

    fn sample() -> HttpRequest {
        HttpRequest {
            method: Method::Post,
            url: "http://user:s3cr3t-value-xyz@127.0.0.1/v1?api_key=s3cr3t-value-xyz&page=1".into(),
            headers: vec![HeaderEntry {
                name: "Authorization".into(),
                value: "Bearer s3cr3t-value-xyz".into(),
                enabled: true,
                secret: false,
                secret_ref: None,
            }],
            query: vec![QueryParam {
                name: "token".into(),
                value: "s3cr3t-value-xyz".into(),
                enabled: true,
                secret: false,
                secret_ref: None,
            }],
            body: RequestBody::Json {
                value: "{\"ok\":true}".into(),
            },
            timeout_ms: 1000,
            url_secret_refs: Vec::new(),
        }
    }

    #[test]
    fn saved_requests_and_history_do_not_keep_plaintext_secrets() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("store.json");
        let secrets = MemorySecretStore::default();
        let mut store = Store::open(path.clone());
        let collection = store.create_collection("Auth".into()).unwrap();
        let summary = store
            .save_request(&secrets, &collection.id, "Login".into(), &sample())
            .unwrap();
        store
            .record_history(
                &sample(),
                HistoryOutcome {
                    ok: false,
                    status: None,
                    elapsed_ms: None,
                    error: Some("authorization failed for Bearer s3cr3t-value-xyz".into()),
                },
            )
            .unwrap();

        let on_disk = fs::read_to_string(&path).unwrap();
        assert!(!on_disk.contains("s3cr3t-value-xyz"), "{on_disk}");
        assert!(on_disk.contains("***") || on_disk.contains("secretRef") || on_disk.contains("secret_ref"));

        let loaded = store
            .load_request(&secrets, &collection.id, &summary.id)
            .unwrap();
        assert!(loaded.request.headers[0].value.contains("s3cr3t-value-xyz"));
        assert_eq!(loaded.request.query[0].value, "s3cr3t-value-xyz");
        let restored = url::Url::parse(&loaded.request.url).unwrap();
        assert_eq!(restored.password(), Some("s3cr3t-value-xyz"));
        assert!(restored
            .query_pairs()
            .any(|(key, value)| key == "api_key" && value == "s3cr3t-value-xyz"));

        let history = store.list_history();
        let rendered = serde_json::to_string(&history).unwrap();
        assert!(!rendered.contains("s3cr3t-value-xyz"));
        assert!(rendered.contains("***"));
    }
}
