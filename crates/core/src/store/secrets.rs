use std::collections::{HashMap, HashSet};
use std::sync::Mutex;

use url::Url;
use uuid::Uuid;

use crate::error::Error;
use crate::http::{is_sensitive_name, HeaderEntry, HttpRequest, QueryParam, UrlSecretRef};

const KEYCHAIN_SERVICE: &str = "com.matthewspeiser.endpoint-lab";

pub trait SecretStore: Send + Sync {
    fn set(&self, id: &str, value: &str) -> Result<(), Error>;
    fn get(&self, id: &str) -> Result<Option<String>, Error>;
    fn delete(&self, id: &str) -> Result<(), Error>;
}

#[derive(Default)]
pub struct MemorySecretStore {
    values: Mutex<HashMap<String, String>>,
}

impl SecretStore for MemorySecretStore {
    fn set(&self, id: &str, value: &str) -> Result<(), Error> {
        self.values
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .insert(id.to_string(), value.to_string());
        Ok(())
    }

    fn get(&self, id: &str) -> Result<Option<String>, Error> {
        Ok(self
            .values
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .get(id)
            .cloned())
    }

    fn delete(&self, id: &str) -> Result<(), Error> {
        self.values
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .remove(id);
        Ok(())
    }
}

pub struct KeyringSecretStore {
    service: String,
}

impl Default for KeyringSecretStore {
    fn default() -> Self {
        Self {
            service: KEYCHAIN_SERVICE.to_string(),
        }
    }
}

impl SecretStore for KeyringSecretStore {
    fn set(&self, id: &str, value: &str) -> Result<(), Error> {
        let entry = keyring::Entry::new(&self.service, id).map_err(secret_err)?;
        entry.set_password(value).map_err(secret_err)
    }

    fn get(&self, id: &str) -> Result<Option<String>, Error> {
        let entry = keyring::Entry::new(&self.service, id).map_err(secret_err)?;
        match entry.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(err) => Err(secret_err(err)),
        }
    }

    fn delete(&self, id: &str) -> Result<(), Error> {
        let entry = keyring::Entry::new(&self.service, id).map_err(secret_err)?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(err) => Err(secret_err(err)),
        }
    }
}

fn secret_err(err: impl std::fmt::Display) -> Error {
    Error::Secret(err.to_string())
}

pub fn seal_request(request: &HttpRequest, secrets: &dyn SecretStore) -> Result<HttpRequest, Error> {
    let mut sealed = request.clone();
    sealed.headers = seal_headers(&request.headers, secrets)?;
    sealed.query = seal_query(&request.query, secrets)?;
    let (url, refs) = seal_url(&request.url, &request.url_secret_refs, secrets)?;
    sealed.url = url;
    sealed.url_secret_refs = refs;
    Ok(sealed)
}

pub fn unseal_request(request: &HttpRequest, secrets: &dyn SecretStore) -> Result<HttpRequest, Error> {
    let mut opened = request.clone();
    for header in &mut opened.headers {
        fill_secret(&mut header.value, header.secret_ref.as_deref(), secrets)?;
    }
    for param in &mut opened.query {
        fill_secret(&mut param.value, param.secret_ref.as_deref(), secrets)?;
    }
    opened.url = unseal_url(&request.url, &request.url_secret_refs, secrets)?;
    Ok(opened)
}

pub fn refs_of(request: &HttpRequest) -> Vec<String> {
    let mut refs = Vec::new();
    for header in &request.headers {
        if let Some(id) = &header.secret_ref {
            refs.push(id.clone());
        }
    }
    for param in &request.query {
        if let Some(id) = &param.secret_ref {
            refs.push(id.clone());
        }
    }
    for item in &request.url_secret_refs {
        refs.push(item.secret_ref.clone());
    }
    refs
}

pub fn forget_refs(secrets: &dyn SecretStore, previous: &HttpRequest, current: &HttpRequest) {
    let kept: HashSet<_> = refs_of(current).into_iter().collect();
    let stale: Vec<_> = refs_of(previous)
        .into_iter()
        .filter(|id| !kept.contains(id))
        .collect();
    delete_refs(secrets, &stale);
}

pub fn delete_refs(secrets: &dyn SecretStore, refs: &[String]) {
    for id in refs {
        if let Err(err) = secrets.delete(id) {
            tracing::warn!(error = %err, "failed to delete a keychain item");
        }
    }
}

fn seal_headers(headers: &[HeaderEntry], secrets: &dyn SecretStore) -> Result<Vec<HeaderEntry>, Error> {
    let mut sealed = Vec::with_capacity(headers.len());
    for header in headers {
        let mut saved = header.clone();
        if should_seal(&header.name, header.secret) && !header.name.trim().is_empty() {
            saved.secret = true;
            saved.secret_ref = store_value(secrets, header.secret_ref.as_deref(), &header.value)?;
            saved.value.clear();
        } else {
            saved.secret = false;
            saved.secret_ref = None;
        }
        sealed.push(saved);
    }
    Ok(sealed)
}

fn seal_query(params: &[QueryParam], secrets: &dyn SecretStore) -> Result<Vec<QueryParam>, Error> {
    let mut sealed = Vec::with_capacity(params.len());
    for param in params {
        let mut saved = param.clone();
        if should_seal(&param.name, param.secret) && !param.name.trim().is_empty() {
            saved.secret = true;
            saved.secret_ref = store_value(secrets, param.secret_ref.as_deref(), &param.value)?;
            saved.value.clear();
        } else {
            saved.secret = false;
            saved.secret_ref = None;
        }
        sealed.push(saved);
    }
    Ok(sealed)
}

fn should_seal(name: &str, marked: bool) -> bool {
    marked || is_sensitive_name(name)
}

fn store_value(
    secrets: &dyn SecretStore,
    existing: Option<&str>,
    value: &str,
) -> Result<Option<String>, Error> {
    let real = !value.is_empty() && value != "***";
    if real {
        let id = existing
            .filter(|id| !id.is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        secrets.set(&id, value)?;
        return Ok(Some(id));
    }
    Ok(existing.filter(|id| !id.is_empty()).map(str::to_string))
}

fn fill_secret(value: &mut String, secret_ref: Option<&str>, secrets: &dyn SecretStore) -> Result<(), Error> {
    if value.is_empty()
        && let Some(id) = secret_ref
        && let Some(stored) = secrets.get(id)?
    {
        *value = stored;
    }
    Ok(())
}

fn seal_url(
    url: &str,
    existing: &[UrlSecretRef],
    secrets: &dyn SecretStore,
) -> Result<(String, Vec<UrlSecretRef>), Error> {
    let Ok(mut parsed) = Url::parse(url) else {
        return Ok((url.to_string(), Vec::new()));
    };
    let mut refs = Vec::new();
    if let Some(password) = parsed.password().map(str::to_string) {
        if !password.is_empty() && password != "***" {
            let id = reuse(existing, ":password");
            secrets.set(&id, &password)?;
            refs.push(UrlSecretRef {
                slot: ":password".into(),
                secret_ref: id,
            });
            parsed
                .set_password(None)
                .map_err(|_| Error::InvalidUrl("could not remove a url password".into()))?;
        } else if let Some(id) = existing_id(existing, ":password") {
            refs.push(UrlSecretRef {
                slot: ":password".into(),
                secret_ref: id,
            });
            let _ = parsed.set_password(None);
        }
    }

    let pairs: Vec<(String, String)> = parsed
        .query_pairs()
        .map(|(key, value)| (key.into_owned(), value.into_owned()))
        .collect();
    if pairs.is_empty() {
        return Ok((parsed.to_string(), refs));
    }
    let mut updated = pairs.clone();
    for (index, (name, value)) in pairs.iter().enumerate() {
        if !is_sensitive_name(name) {
            continue;
        }
        let slot = format!("q:{index}");
        if !value.is_empty() && value != "***" {
            let id = reuse(existing, &slot);
            secrets.set(&id, value)?;
            refs.push(UrlSecretRef {
                slot,
                secret_ref: id,
            });
            updated[index].1.clear();
        } else if let Some(id) = existing_id(existing, &slot) {
            refs.push(UrlSecretRef {
                slot,
                secret_ref: id,
            });
            updated[index].1.clear();
        }
    }
    parsed.set_query(None);
    {
        let mut serializer = parsed.query_pairs_mut();
        for (name, value) in &updated {
            serializer.append_pair(name, value);
        }
    }
    Ok((parsed.to_string(), refs))
}

fn unseal_url(url: &str, refs: &[UrlSecretRef], secrets: &dyn SecretStore) -> Result<String, Error> {
    if refs.is_empty() {
        return Ok(url.to_string());
    }
    let Ok(mut parsed) = Url::parse(url) else {
        return Ok(url.to_string());
    };
    for item in refs {
        let Some(value) = secrets.get(&item.secret_ref)? else {
            continue;
        };
        if item.slot == ":password" {
            parsed
                .set_password(Some(&value))
                .map_err(|_| Error::InvalidUrl("could not restore a url password".into()))?;
            continue;
        }
        if let Some(index) = item.slot.strip_prefix("q:").and_then(|raw| raw.parse::<usize>().ok()) {
            set_query_value(&mut parsed, index, &value);
        }
    }
    Ok(parsed.to_string())
}

fn set_query_value(url: &mut Url, index: usize, value: &str) {
    let mut pairs: Vec<(String, String)> = url
        .query_pairs()
        .map(|(key, current)| (key.into_owned(), current.into_owned()))
        .collect();
    if let Some(pair) = pairs.get_mut(index) {
        pair.1 = value.to_string();
    }
    url.set_query(None);
    if !pairs.is_empty() {
        let mut serializer = url.query_pairs_mut();
        for (name, current) in &pairs {
            serializer.append_pair(name, current);
        }
    }
}

fn reuse(existing: &[UrlSecretRef], slot: &str) -> String {
    existing_id(existing, slot).unwrap_or_else(|| Uuid::new_v4().to_string())
}

fn existing_id(existing: &[UrlSecretRef], slot: &str) -> Option<String> {
    existing
        .iter()
        .find(|item| item.slot == slot)
        .map(|item| item.secret_ref.clone())
}
