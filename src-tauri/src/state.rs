use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard};

use endpoint_lab_core::{
    default_store_path, CancellationToken, HttpExecutor, KeyringSecretStore, SecretStore, Store,
};

pub struct AppState {
    pub executor: HttpExecutor,
    pub inflight: Arc<Mutex<HashMap<String, CancellationToken>>>,
    pub bench: Arc<Mutex<Option<CancellationToken>>>,
    pub store: Arc<Mutex<Store>>,
    pub secrets: Arc<dyn SecretStore>,
}

impl AppState {
    pub fn new() -> Self {
        let executor = match HttpExecutor::new() {
            Ok(executor) => executor,
            Err(err) => {
                // The process cannot send traffic without a client. This is startup,
                // not a per-request failure.
                tracing::error!(error = %err, "failed to build the HTTP client");
                panic!("failed to build the HTTP client: {err}");
            }
        };
        let store = match default_store_path() {
            Ok(path) => Store::open(path),
            Err(err) => {
                tracing::error!(error = %err, "app data directory is unavailable");
                Store::unavailable(err.to_string())
            }
        };
        Self {
            executor,
            inflight: Arc::new(Mutex::new(HashMap::new())),
            bench: Arc::new(Mutex::new(None)),
            store: Arc::new(Mutex::new(store)),
            secrets: Arc::new(KeyringSecretStore::default()),
        }
    }
}

pub fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

pub struct InflightGuard {
    map: Arc<Mutex<HashMap<String, CancellationToken>>>,
    id: String,
}

impl InflightGuard {
    pub fn insert(
        map: Arc<Mutex<HashMap<String, CancellationToken>>>,
        id: String,
        token: CancellationToken,
    ) -> Self {
        let mut inflight = lock(&map);
        if let Some(previous) = inflight.insert(id.clone(), token) {
            previous.cancel();
        }
        drop(inflight);
        Self { map, id }
    }
}

impl Drop for InflightGuard {
    fn drop(&mut self) {
        lock(&self.map).remove(&self.id);
    }
}

pub struct BenchGuard(pub Arc<Mutex<Option<CancellationToken>>>);

impl Drop for BenchGuard {
    fn drop(&mut self) {
        *lock(&self.0) = None;
    }
}
