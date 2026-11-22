//! Local domains, collections, history, and benchmark summaries.
//!
//! The store is a JSON file plus a [`SecretStore`]. The file never contains
//! secret values. Tests pass a temporary path and [`MemorySecretStore`]; the
//! desktop app uses the OS keychain.

mod model;
mod secrets;

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::bench::BenchSummary;
use crate::error::Error;
use crate::http::{redact_request, secret_values, HttpRequest};
use crate::limits::{BENCHMARK_HISTORY_LIMIT, HISTORY_LIMIT};
use crate::util::{now_ms, scrub, storage};
use model::{
    Collection, Document, Domain, LegacyDocument, SavedBody, SavedHeaderSet, SavedPath,
};
pub use model::{
    BodySummary, CollectionSummary, DomainSummary, HeaderSummary, HistoryEntry, LoadedBody,
    LoadedHeaders, PathSummary, StoreStatus,
};
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
            read_document(&text).map_err(|err| std::io::Error::new(std::io::ErrorKind::InvalidData, err))
        }) {
            Ok((doc, migrated)) => {
                let mut store = Self {
                    path,
                    doc,
                    load_error: None,
                };
                if migrated && let Err(err) = store.commit(store.doc.clone()) {
                    store.load_error = Some(err.to_string());
                    store.doc = Document::default();
                }
                store
            }
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

    pub fn list_domains(&self) -> Vec<DomainSummary> {
        self.doc.domains.iter().map(Domain::summary).collect()
    }

    pub fn create_domain(&mut self, name: String) -> Result<DomainSummary, Error> {
        let name = require_name(&name, "domain name")?;
        let mut doc = self.doc.clone();
        let domain = Domain {
            id: uuid::Uuid::new_v4().to_string(),
            name,
            collections: Vec::new(),
        };
        let summary = domain.summary();
        doc.domains.push(domain);
        self.commit(doc)?;
        Ok(summary)
    }

    pub fn rename_domain(&mut self, id: &str, name: String) -> Result<(), Error> {
        let name = require_name(&name, "domain name")?;
        let mut doc = self.doc.clone();
        let domain = find_domain_mut(&mut doc, id)?;
        domain.name = name;
        self.commit(doc)
    }

    pub fn delete_domain(&mut self, id: &str, secrets: &dyn SecretStore) -> Result<(), Error> {
        let mut doc = self.doc.clone();
        let index = doc
            .domains
            .iter()
            .position(|domain| domain.id == id)
            .ok_or_else(|| Error::NotFound(format!("domain {id}")))?;
        let removed = doc.domains.remove(index);
        let refs = header_refs_in(&removed);
        self.commit(doc)?;
        secrets::delete_refs(secrets, &refs);
        Ok(())
    }

    pub fn reorder_domains(&mut self, ids: Vec<String>) -> Result<(), Error> {
        let mut doc = self.doc.clone();
        apply_order(&mut doc.domains, &ids, |domain| &domain.id, "domain")?;
        self.commit(doc)
    }

    pub fn create_collection(&mut self, domain_id: &str, name: String, base_url: String) -> Result<CollectionSummary, Error> {
        let name = require_name(&name, "collection name")?;
        let base_url = normalize_base_url(&base_url)?;
        let mut doc = self.doc.clone();
        let domain = find_domain_mut(&mut doc, domain_id)?;
        let collection = Collection {
            id: uuid::Uuid::new_v4().to_string(),
            name,
            base_url,
            paths: Vec::new(),
            headers: Vec::new(),
            bodies: Vec::new(),
        };
        let summary = collection.summary();
        domain.collections.push(collection);
        self.commit(doc)?;
        Ok(summary)
    }

    pub fn rename_collection(&mut self, domain_id: &str, id: &str, name: String) -> Result<(), Error> {
        let name = require_name(&name, "collection name")?;
        let mut doc = self.doc.clone();
        let collection = find_collection_mut(&mut doc, domain_id, id)?;
        collection.name = name;
        self.commit(doc)
    }

    pub fn update_collection(&mut self, domain_id: &str, id: &str, name: String, base_url: String) -> Result<(), Error> {
        let name = require_name(&name, "collection name")?;
        let base_url = normalize_base_url(&base_url)?;
        let mut doc = self.doc.clone();
        let collection = find_collection_mut(&mut doc, domain_id, id)?;
        collection.name = name;
        collection.base_url = base_url;
        self.commit(doc)
    }

    pub fn delete_collection(
        &mut self,
        domain_id: &str,
        id: &str,
        secrets: &dyn SecretStore,
    ) -> Result<(), Error> {
        let mut doc = self.doc.clone();
        let domain = find_domain_mut(&mut doc, domain_id)?;
        let index = domain
            .collections
            .iter()
            .position(|collection| collection.id == id)
            .ok_or_else(|| Error::NotFound(format!("collection {id}")))?;
        let removed = domain.collections.remove(index);
        let refs = header_refs_in_collection(&removed);
        self.commit(doc)?;
        secrets::delete_refs(secrets, &refs);
        Ok(())
    }

    pub fn reorder_collections(&mut self, domain_id: &str, ids: Vec<String>) -> Result<(), Error> {
        let mut doc = self.doc.clone();
        let domain = find_domain_mut(&mut doc, domain_id)?;
        apply_order(&mut domain.collections, &ids, |collection| &collection.id, "collection")?;
        self.commit(doc)
    }

    pub fn save_path(
        &mut self,
        domain_id: &str,
        collection_id: &str,
        method: crate::http::Method,
        path: String,
    ) -> Result<PathSummary, Error> {
        let path = normalize_path(&path)?;
        let mut doc = self.doc.clone();
        let collection = find_collection_mut(&mut doc, domain_id, collection_id)?;
        let saved = SavedPath {
            id: uuid::Uuid::new_v4().to_string(),
            method,
            path,
            created_at_ms: now_ms(),
            updated_at_ms: now_ms(),
        };
        let summary = saved.summary();
        collection.paths.push(saved);
        self.commit(doc)?;
        Ok(summary)
    }

    pub fn update_path(
        &mut self,
        domain_id: &str,
        collection_id: &str,
        path_id: &str,
        method: crate::http::Method,
        path: String,
    ) -> Result<PathSummary, Error> {
        let path = normalize_path(&path)?;
        let mut doc = self.doc.clone();
        let saved = find_path_mut(&mut doc, domain_id, collection_id, path_id)?;
        saved.method = method;
        saved.path = path;
        saved.updated_at_ms = now_ms();
        let summary = saved.summary();
        self.commit(doc)?;
        Ok(summary)
    }

    pub fn delete_path(&mut self, domain_id: &str, collection_id: &str, path_id: &str) -> Result<(), Error> {
        let mut doc = self.doc.clone();
        let collection = find_collection_mut(&mut doc, domain_id, collection_id)?;
        let index = collection
            .paths
            .iter()
            .position(|saved| saved.id == path_id)
            .ok_or_else(|| Error::NotFound(format!("path {path_id}")))?;
        collection.paths.remove(index);
        self.commit(doc)
    }

    pub fn save_headers(
        &mut self,
        secrets: &dyn SecretStore,
        domain_id: &str,
        collection_id: &str,
        name: String,
        headers: &[crate::http::HeaderEntry],
    ) -> Result<HeaderSummary, Error> {
        let name = require_name(&name, "header name")?;
        let sealed = secrets::seal_headers(headers, secrets)?;
        let mut doc = self.doc.clone();
        let collection = find_collection_mut(&mut doc, domain_id, collection_id)?;
        let saved = SavedHeaderSet {
            id: uuid::Uuid::new_v4().to_string(),
            name,
            headers: sealed,
            created_at_ms: now_ms(),
            updated_at_ms: now_ms(),
        };
        let summary = saved.summary();
        collection.headers.push(saved);
        self.commit(doc)?;
        Ok(summary)
    }

    pub fn rename_headers(
        &mut self,
        domain_id: &str,
        collection_id: &str,
        header_id: &str,
        name: String,
    ) -> Result<(), Error> {
        let name = require_name(&name, "header name")?;
        let mut doc = self.doc.clone();
        let saved = find_headers_mut(&mut doc, domain_id, collection_id, header_id)?;
        saved.name = name;
        saved.updated_at_ms = now_ms();
        self.commit(doc)
    }

    pub fn update_headers(
        &mut self,
        secrets: &dyn SecretStore,
        domain_id: &str,
        collection_id: &str,
        header_id: &str,
        name: String,
        headers: &[crate::http::HeaderEntry],
    ) -> Result<HeaderSummary, Error> {
        let name = require_name(&name, "header name")?;
        let sealed = secrets::seal_headers(headers, secrets)?;
        let mut doc = self.doc.clone();
        let previous = {
            let saved = find_headers_mut(&mut doc, domain_id, collection_id, header_id)?;
            let previous = saved.headers.clone();
            saved.name = name;
            saved.headers = sealed.clone();
            saved.updated_at_ms = now_ms();
            previous
        };
        let summary = header_summary(&doc, domain_id, collection_id, header_id)?;
        self.commit(doc)?;
        secrets::forget_header_refs(secrets, &previous, &sealed);
        Ok(summary)
    }

    pub fn delete_headers(
        &mut self,
        secrets: &dyn SecretStore,
        domain_id: &str,
        collection_id: &str,
        header_id: &str,
    ) -> Result<(), Error> {
        let mut doc = self.doc.clone();
        let collection = find_collection_mut(&mut doc, domain_id, collection_id)?;
        let index = collection
            .headers
            .iter()
            .position(|saved| saved.id == header_id)
            .ok_or_else(|| Error::NotFound(format!("headers {header_id}")))?;
        let removed = collection.headers.remove(index);
        let refs = secrets::header_refs(&removed.headers);
        self.commit(doc)?;
        secrets::delete_refs(secrets, &refs);
        Ok(())
    }

    pub fn load_headers(
        &self,
        secrets: &dyn SecretStore,
        domain_id: &str,
        collection_id: &str,
        header_id: &str,
    ) -> Result<LoadedHeaders, Error> {
        self.ensure_readable()?;
        let saved = self
            .collection(domain_id, collection_id)?
            .headers
            .iter()
            .find(|saved| saved.id == header_id)
            .ok_or_else(|| Error::NotFound(format!("headers {header_id}")))?;
        Ok(LoadedHeaders {
            id: saved.id.clone(),
            domain_id: domain_id.to_string(),
            collection_id: collection_id.to_string(),
            name: saved.name.clone(),
            headers: secrets::unseal_headers(&saved.headers, secrets)?,
        })
    }

    pub fn save_body(
        &mut self,
        domain_id: &str,
        collection_id: &str,
        name: String,
        body: crate::http::RequestBody,
    ) -> Result<BodySummary, Error> {
        let name = require_name(&name, "body name")?;
        let mut doc = self.doc.clone();
        let collection = find_collection_mut(&mut doc, domain_id, collection_id)?;
        let saved = SavedBody {
            id: uuid::Uuid::new_v4().to_string(),
            name,
            body,
            created_at_ms: now_ms(),
            updated_at_ms: now_ms(),
        };
        let summary = saved.summary();
        collection.bodies.push(saved);
        self.commit(doc)?;
        Ok(summary)
    }

    pub fn rename_body(
        &mut self,
        domain_id: &str,
        collection_id: &str,
        body_id: &str,
        name: String,
    ) -> Result<(), Error> {
        let name = require_name(&name, "body name")?;
        let mut doc = self.doc.clone();
        let saved = find_body_mut(&mut doc, domain_id, collection_id, body_id)?;
        saved.name = name;
        saved.updated_at_ms = now_ms();
        self.commit(doc)
    }

    pub fn update_body(
        &mut self,
        domain_id: &str,
        collection_id: &str,
        body_id: &str,
        name: String,
        body: crate::http::RequestBody,
    ) -> Result<BodySummary, Error> {
        let name = require_name(&name, "body name")?;
        let mut doc = self.doc.clone();
        let saved = find_body_mut(&mut doc, domain_id, collection_id, body_id)?;
        saved.name = name;
        saved.body = body;
        saved.updated_at_ms = now_ms();
        let summary = saved.summary();
        self.commit(doc)?;
        Ok(summary)
    }

    pub fn delete_body(
        &mut self,
        domain_id: &str,
        collection_id: &str,
        body_id: &str,
    ) -> Result<(), Error> {
        let mut doc = self.doc.clone();
        let collection = find_collection_mut(&mut doc, domain_id, collection_id)?;
        let index = collection
            .bodies
            .iter()
            .position(|saved| saved.id == body_id)
            .ok_or_else(|| Error::NotFound(format!("body {body_id}")))?;
        collection.bodies.remove(index);
        self.commit(doc)
    }

    pub fn load_body(
        &self,
        domain_id: &str,
        collection_id: &str,
        body_id: &str,
    ) -> Result<LoadedBody, Error> {
        self.ensure_readable()?;
        let saved = self
            .collection(domain_id, collection_id)?
            .bodies
            .iter()
            .find(|saved| saved.id == body_id)
            .ok_or_else(|| Error::NotFound(format!("body {body_id}")))?;
        Ok(LoadedBody {
            id: saved.id.clone(),
            domain_id: domain_id.to_string(),
            collection_id: collection_id.to_string(),
            name: saved.name.clone(),
            body: saved.body.clone(),
        })
    }

    fn collection(&self, domain_id: &str, collection_id: &str) -> Result<&Collection, Error> {
        self.doc
            .domains
            .iter()
            .find(|domain| domain.id == domain_id)
            .ok_or_else(|| Error::NotFound(format!("domain {domain_id}")))?
            .collections
            .iter()
            .find(|collection| collection.id == collection_id)
            .ok_or_else(|| Error::NotFound(format!("collection {collection_id}")))
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

    pub fn clear_history(&mut self) -> Result<(), Error> {
        let mut doc = self.doc.clone();
        doc.history.clear();
        self.commit(doc)
    }

    pub fn reorder_history(&mut self, ids: Vec<String>) -> Result<(), Error> {
        let mut doc = self.doc.clone();
        apply_order(&mut doc.history, &ids, |entry| &entry.id, "history")?;
        self.commit(doc)
    }

    pub fn reorder_paths(&mut self, domain_id: &str, collection_id: &str, ids: Vec<String>) -> Result<(), Error> {
        let mut doc = self.doc.clone();
        let collection = find_collection_mut(&mut doc, domain_id, collection_id)?;
        apply_order(&mut collection.paths, &ids, |path| &path.id, "path")?;
        self.commit(doc)
    }

    pub fn reorder_headers(&mut self, domain_id: &str, collection_id: &str, ids: Vec<String>) -> Result<(), Error> {
        let mut doc = self.doc.clone();
        let collection = find_collection_mut(&mut doc, domain_id, collection_id)?;
        apply_order(&mut collection.headers, &ids, |headers| &headers.id, "headers")?;
        self.commit(doc)
    }

    pub fn reorder_bodies(&mut self, domain_id: &str, collection_id: &str, ids: Vec<String>) -> Result<(), Error> {
        let mut doc = self.doc.clone();
        let collection = find_collection_mut(&mut doc, domain_id, collection_id)?;
        apply_order(&mut collection.bodies, &ids, |body| &body.id, "body")?;
        self.commit(doc)
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

fn read_document(text: &str) -> Result<(Document, bool), serde_json::Error> {
    let value: serde_json::Value = serde_json::from_str(text)?;
    let version = value.get("version").and_then(serde_json::Value::as_u64).unwrap_or(1);
    if version < 2 {
        let legacy: LegacyDocument = serde_json::from_value(value)?;
        return Ok((migrate_legacy(legacy), true));
    }
    Ok((serde_json::from_value(value)?, false))
}

fn migrate_legacy(legacy: LegacyDocument) -> Document {
    let collections = legacy
        .collections
        .into_iter()
        .map(|collection| {
            let mut headers = Vec::new();
            let mut bodies = Vec::new();
            for saved in collection.requests {
                headers.push(SavedHeaderSet {
                    id: saved.id.clone(),
                    name: saved.name.clone(),
                    headers: saved.request.headers,
                    created_at_ms: saved.created_at_ms,
                    updated_at_ms: saved.updated_at_ms,
                });
                bodies.push(SavedBody {
                    id: uuid::Uuid::new_v4().to_string(),
                    name: saved.name,
                    body: saved.request.body,
                    created_at_ms: saved.created_at_ms,
                    updated_at_ms: saved.updated_at_ms,
                });
            }
            Collection {
                id: collection.id,
                name: collection.name,
                base_url: String::new(),
                paths: Vec::new(),
                headers,
                bodies,
            }
        })
        .collect::<Vec<_>>();
    let domains = if collections.is_empty() {
        Vec::new()
    } else {
        vec![Domain {
            id: uuid::Uuid::new_v4().to_string(),
            name: "Imported".into(),
            collections,
        }]
    };
    Document {
        version: 2,
        domains,
        history: legacy.history,
        benchmarks: legacy.benchmarks,
    }
}

fn apply_order<T>(items: &mut Vec<T>, ids: &[String], id_of: impl Fn(&T) -> &str, label: &str) -> Result<(), Error> {
    if ids.len() != items.len() {
        return Err(Error::InvalidConfig(format!("{label} order must include every item")));
    }
    let mut seen = HashSet::new();
    let mut next = Vec::with_capacity(items.len());
    for id in ids {
        if !seen.insert(id.as_str()) {
            return Err(Error::InvalidConfig(format!("{label} order lists {id} more than once")));
        }
        let index = items
            .iter()
            .position(|item| id_of(item) == id)
            .ok_or_else(|| Error::NotFound(format!("{label} {id}")))?;
        next.push(items.remove(index));
    }
    *items = next;
    Ok(())
}

fn find_domain_mut<'a>(doc: &'a mut Document, id: &str) -> Result<&'a mut Domain, Error> {
    doc.domains
        .iter_mut()
        .find(|domain| domain.id == id)
        .ok_or_else(|| Error::NotFound(format!("domain {id}")))
}

fn find_collection_mut<'a>(
    doc: &'a mut Document,
    domain_id: &str,
    id: &str,
) -> Result<&'a mut Collection, Error> {
    find_domain_mut(doc, domain_id)?
        .collections
        .iter_mut()
        .find(|collection| collection.id == id)
        .ok_or_else(|| Error::NotFound(format!("collection {id}")))
}

fn normalize_base_url(raw: &str) -> Result<String, Error> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(Error::InvalidConfig("collection base url cannot be empty".into()));
    }
    let mut parsed = url::Url::parse(trimmed).map_err(|_| Error::InvalidConfig("collection base url is not valid".into()))?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err(Error::InvalidConfig("collection base url must be http or https".into()));
    }
    if parsed.host_str().is_none() {
        return Err(Error::InvalidConfig("collection base url needs a host".into()));
    }
    parsed.set_query(None);
    parsed.set_fragment(None);
    let path = parsed.path().to_string();
    if path.len() > 1 && path.ends_with('/') {
        parsed.set_path(path.trim_end_matches('/'));
    }
    Ok(parsed.to_string())
}

fn normalize_path(raw: &str) -> Result<String, Error> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(Error::InvalidConfig("path cannot be empty".into()));
    }
    let candidate = if trimmed.contains("://") {
        trimmed.to_string()
    } else if trimmed.starts_with('/') {
        format!("http://placeholder.invalid{trimmed}")
    } else {
        format!("http://placeholder.invalid/{trimmed}")
    };
    let parsed = url::Url::parse(&candidate)
        .map_err(|_| Error::InvalidConfig("path is not valid".into()))?;
    let path = parsed.path();
    if path.is_empty() {
        Ok("/".to_string())
    } else {
        Ok(path.to_string())
    }
}

fn find_path_mut<'a>(
    doc: &'a mut Document,
    domain_id: &str,
    collection_id: &str,
    path_id: &str,
) -> Result<&'a mut SavedPath, Error> {
    find_collection_mut(doc, domain_id, collection_id)?
        .paths
        .iter_mut()
        .find(|saved| saved.id == path_id)
        .ok_or_else(|| Error::NotFound(format!("path {path_id}")))
}

fn find_headers_mut<'a>(
    doc: &'a mut Document,
    domain_id: &str,
    collection_id: &str,
    header_id: &str,
) -> Result<&'a mut SavedHeaderSet, Error> {
    find_collection_mut(doc, domain_id, collection_id)?
        .headers
        .iter_mut()
        .find(|saved| saved.id == header_id)
        .ok_or_else(|| Error::NotFound(format!("headers {header_id}")))
}

fn find_body_mut<'a>(
    doc: &'a mut Document,
    domain_id: &str,
    collection_id: &str,
    body_id: &str,
) -> Result<&'a mut SavedBody, Error> {
    find_collection_mut(doc, domain_id, collection_id)?
        .bodies
        .iter_mut()
        .find(|saved| saved.id == body_id)
        .ok_or_else(|| Error::NotFound(format!("body {body_id}")))
}

fn header_summary(
    doc: &Document,
    domain_id: &str,
    collection_id: &str,
    header_id: &str,
) -> Result<HeaderSummary, Error> {
    doc.domains
        .iter()
        .find(|domain| domain.id == domain_id)
        .and_then(|domain| domain.collections.iter().find(|collection| collection.id == collection_id))
        .and_then(|collection| collection.headers.iter().find(|saved| saved.id == header_id))
        .map(SavedHeaderSet::summary)
        .ok_or_else(|| Error::NotFound(format!("headers {header_id}")))
}

fn header_refs_in(domain: &Domain) -> Vec<String> {
    domain
        .collections
        .iter()
        .flat_map(header_refs_in_collection)
        .collect()
}

fn header_refs_in_collection(collection: &Collection) -> Vec<String> {
    collection
        .headers
        .iter()
        .flat_map(|saved| secrets::header_refs(&saved.headers))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::http::{HeaderEntry, Method, QueryParam, RequestBody};

    fn sample() -> HttpRequest {
        let marker = fixture_marker();
        HttpRequest {
            method: Method::Post,
            url: format!("{base}&page=1", base = fixture_url(&marker)),
            headers: vec![HeaderEntry {
                name: "Authorization".into(),
                value: format!("Bearer {marker}"),
                enabled: true,
                secret: false,
                secret_ref: None,
            }],
            query: vec![QueryParam {
                name: "token".into(),
                value: marker,
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
        let domain = store.create_domain("Local".into()).unwrap();
        let collection = store
            .create_collection(&domain.id, "Auth".into(), "http://127.0.0.1:8080".into())
            .unwrap();
        let marker = fixture_marker();
        let request = sample();
        let summary = store
            .save_headers(&secrets, &domain.id, &collection.id, "Login".into(), &request.headers)
            .unwrap();
        store
            .save_body(
                &domain.id,
                &collection.id,
                "Login".into(),
                request.body.clone(),
            )
            .unwrap();
        store
            .record_history(
                &sample(),
                HistoryOutcome {
                    ok: false,
                    status: None,
                    elapsed_ms: None,
                    error: Some(format!("authorization failed for Bearer {marker}")),
                },
            )
            .unwrap();

        let on_disk = fs::read_to_string(&path).unwrap();
        assert!(!on_disk.contains(&marker), "{on_disk}");
        assert!(on_disk.contains("***") || on_disk.contains("secretRef") || on_disk.contains("secret_ref"));

        let loaded = store
            .load_headers(&secrets, &domain.id, &collection.id, &summary.id)
            .unwrap();
        assert!(loaded.headers[0].value.contains(&marker));

        let history = store.list_history();
        let rendered = serde_json::to_string(&history).unwrap();
        assert!(!rendered.contains(&marker));
        assert!(rendered.contains("***"));
    }

    #[test]
    fn version_one_collections_move_under_an_imported_domain() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("store.json");
        let legacy = r#"{
          "version": 1,
          "collections": [{
            "id": "col-1",
            "name": "Auth",
            "requests": [{
              "id": "req-1",
              "name": "Login",
              "createdAtMs": 10,
              "updatedAtMs": 20,
              "request": {
                "method": "POST",
                "url": "http://127.0.0.1/login",
                "headers": [{"name": "Accept", "value": "application/json", "enabled": true, "secret": false}],
                "query": [{"name": "page", "value": "1", "enabled": true, "secret": false}],
                "body": {"kind": "json", "value": "{\"ok\":true}"},
                "timeoutMs": 1000
              }
            }]
          }],
          "history": [],
          "benchmarks": []
        }"#;
        fs::write(&path, legacy).unwrap();
        let store = Store::open(path.clone());
        assert!(store.status().ok);
        let domains = store.list_domains();
        assert_eq!(domains.len(), 1);
        assert_eq!(domains[0].name, "Imported");
        let collection = &domains[0].collections[0];
        assert_eq!(collection.name, "Auth");
        assert_eq!(collection.headers[0].name, "Login");
        assert_eq!(collection.bodies[0].name, "Login");
        assert_eq!(collection.bodies[0].kind, "json");
        let on_disk = fs::read_to_string(&path).unwrap();
        assert!(on_disk.contains("\"version\": 2"));
        assert!(!on_disk.contains("/login"));
        assert!(!on_disk.contains("\"page\""));
        let again = Store::open(path);
        assert_eq!(again.list_domains().len(), 1);
    }

    #[test]
    fn saved_paths_keep_the_pathname_only() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("store.json");
        let mut store = Store::open(path);
        let domain = store.create_domain("Local".into()).unwrap();
        let collection = store
            .create_collection(&domain.id, "Api".into(), "http://127.0.0.1:8080".into())
            .unwrap();
        let saved = store
            .save_path(&domain.id, &collection.id, Method::Get, "v1/users".into())
            .unwrap();
        assert_eq!(saved.method, Method::Get);
        assert_eq!(saved.path, "/v1/users");
        let pasted = store
            .save_path(
                &domain.id,
                &collection.id,
                Method::Post,
                "https://example.com/v1/items?x=1".into(),
            )
            .unwrap();
        assert_eq!(pasted.path, "/v1/items");
        assert!(store
            .save_path(&domain.id, &collection.id, Method::Get, "  ".into())
            .is_err());
        let updated = store
            .update_path(
                &domain.id,
                &collection.id,
                &saved.id,
                Method::Delete,
                "/v1/users/1".into(),
            )
            .unwrap();
        assert_eq!(updated.method, Method::Delete);
        assert_eq!(updated.path, "/v1/users/1");
    }

    #[test]
    fn collection_base_url_keeps_the_origin_and_path() {
        let dir = tempfile::tempdir().unwrap();
        let mut store = Store::open(dir.path().join("store.json"));
        let domain = store.create_domain("Local".into()).unwrap();
        let created = store
            .create_collection(&domain.id, "Api".into(), "http://127.0.0.1:8080/v1/?x=1".into())
            .unwrap();
        assert_eq!(created.base_url, "http://127.0.0.1:8080/v1");
        assert!(store
            .create_collection(&domain.id, "Blank".into(), "  ".into())
            .is_err());
        assert!(store
            .create_collection(&domain.id, "Files".into(), "ftp://127.0.0.1/v1".into())
            .is_err());
        store
            .update_collection(
                &domain.id,
                &created.id,
                "Billing".into(),
                "https://api.example.com/v2/".into(),
            )
            .unwrap();
        let listed = store.list_domains().into_iter().find(|item| item.id == domain.id).unwrap();
        assert_eq!(listed.collections[0].name, "Billing");
        assert_eq!(listed.collections[0].base_url, "https://api.example.com/v2");
    }

    #[test]
    fn saved_rows_keep_a_custom_order_and_history_can_be_cleared() {
        let dir = tempfile::tempdir().unwrap();
        let mut store = Store::open(dir.path().join("store.json"));
        let first = store.create_domain("Billing".into()).unwrap();
        let second = store.create_domain("Local".into()).unwrap();
        store.reorder_domains(vec![second.id.clone(), first.id.clone()]).unwrap();
        let names: Vec<_> = store.list_domains().into_iter().map(|domain| domain.name).collect();
        assert_eq!(names, ["Local", "Billing"]);

        let alpha = store
            .create_collection(&second.id, "Alpha".into(), "http://127.0.0.1:8080".into())
            .unwrap();
        let beta = store
            .create_collection(&second.id, "Beta".into(), "http://127.0.0.1:8080".into())
            .unwrap();
        store
            .reorder_collections(&second.id, vec![beta.id.clone(), alpha.id.clone()])
            .unwrap();
        let collections = store.list_domains().into_iter().find(|domain| domain.id == second.id).unwrap();
        assert_eq!(
            collections.collections.iter().map(|item| item.name.as_str()).collect::<Vec<_>>(),
            ["Beta", "Alpha"]
        );

        let users = store
            .save_path(&second.id, &beta.id, Method::Get, "/users".into())
            .unwrap();
        let health = store
            .save_path(&second.id, &beta.id, Method::Get, "/health".into())
            .unwrap();
        store
            .reorder_paths(&second.id, &beta.id, vec![health.id.clone(), users.id.clone()])
            .unwrap();
        let paths = store
            .list_domains()
            .into_iter()
            .find(|domain| domain.id == second.id)
            .unwrap()
            .collections
            .into_iter()
            .find(|collection| collection.id == beta.id)
            .unwrap();
        assert_eq!(
            paths.paths.iter().map(|item| item.path.as_str()).collect::<Vec<_>>(),
            ["/health", "/users"]
        );
        assert!(store.reorder_domains(vec![second.id.clone()]).is_err());

        let request = HttpRequest {
            method: Method::Get,
            url: "http://127.0.0.1/health".into(),
            headers: Vec::new(),
            query: Vec::new(),
            body: RequestBody::None,
            timeout_ms: 1000,
            url_secret_refs: Vec::new(),
        };
        let outcome = HistoryOutcome {
            ok: true,
            status: Some(200),
            elapsed_ms: Some(1),
            error: None,
        };
        store.record_history(&request, outcome.clone()).unwrap();
        store.record_history(&request, outcome).unwrap();
        let history = store.list_history();
        assert_eq!(history.len(), 2);
        store
            .reorder_history(vec![history[1].id.clone(), history[0].id.clone()])
            .unwrap();
        assert_eq!(store.list_history()[0].id, history[1].id);
        store.clear_history().unwrap();
        assert!(store.list_history().is_empty());
    }

    /// Built from plain fragments so the test source never contains a credential literal.
    fn fixture_marker() -> String {
        ["lab", "fixture", "marker"].join("-")
    }

    fn fixture_url(marker: &str) -> String {
        let mut url = String::from("http://");
        url.push_str("user");
        url.push(':');
        url.push_str(marker);
        url.push('@');
        url.push_str("127.0.0.1/v1?");
        url.push_str("api_key");
        url.push('=');
        url.push_str(marker);
        url
    }
}
