use tauri::{ipc::Channel, State};

use endpoint_lab_core::{
    run_benchmark as execute_benchmark, BenchConfig, BenchSnapshot, BenchSummary, BodySummary,
    CancellationToken, CollectionSummary, DomainSummary, EngineLimits, Error, ErrorView, HeaderEntry,
    HeaderSummary, HistoryEntry, HistoryOutcome, HttpRequest, HttpResponse, LoadedBody, LoadedHeaders,
    Method, PathSummary, RequestBody, StoreStatus,
};

use crate::state::{lock, AppState, BenchGuard, InflightGuard};

#[tauri::command]
pub fn engine_limits() -> EngineLimits {
    EngineLimits::current()
}

#[tauri::command]
pub fn store_status(state: State<'_, AppState>) -> StoreStatus {
    lock(&state.store).status()
}

#[tauri::command]
pub async fn send_request(
    state: State<'_, AppState>,
    invocation_id: String,
    request: HttpRequest,
) -> Result<HttpResponse, ErrorView> {
    let executor = state.executor.clone();
    let store = state.store.clone();
    let token = CancellationToken::new();
    let _guard = InflightGuard::insert(state.inflight.clone(), invocation_id, token.clone());
    let result = executor.execute(&request, &token).await;
    let outcome = match &result {
        Ok(response) => HistoryOutcome {
            ok: true,
            status: Some(response.status),
            elapsed_ms: Some(response.elapsed_ms),
            error: None,
        },
        Err(err) => HistoryOutcome {
            ok: false,
            status: None,
            elapsed_ms: None,
            error: Some(err.to_string()),
        },
    };
    if let Err(err) = lock(&store).record_history(&request, outcome) {
        tracing::error!(error = %err, "failed to record history");
    }
    result.map_err(Error::view)
}

#[tauri::command]
pub fn cancel_request(state: State<'_, AppState>, invocation_id: String) -> Result<(), ErrorView> {
    if let Some(token) = lock(&state.inflight).get(&invocation_id) {
        token.cancel();
    }
    Ok(())
}

#[tauri::command]
pub fn list_domains(state: State<'_, AppState>) -> Result<Vec<DomainSummary>, ErrorView> {
    Ok(lock(&state.store).list_domains())
}

#[tauri::command]
pub fn create_domain(state: State<'_, AppState>, name: String) -> Result<DomainSummary, ErrorView> {
    lock(&state.store).create_domain(name).map_err(Error::view)
}

#[tauri::command]
pub fn rename_domain(state: State<'_, AppState>, id: String, name: String) -> Result<(), ErrorView> {
    lock(&state.store)
        .rename_domain(&id, name)
        .map_err(Error::view)
}

#[tauri::command]
pub fn delete_domain(state: State<'_, AppState>, id: String) -> Result<(), ErrorView> {
    let secrets = state.secrets.clone();
    lock(&state.store)
        .delete_domain(&id, secrets.as_ref())
        .map_err(Error::view)
}

#[tauri::command]
pub fn reorder_domains(state: State<'_, AppState>, ids: Vec<String>) -> Result<(), ErrorView> {
    lock(&state.store).reorder_domains(ids).map_err(Error::view)
}

#[tauri::command]
pub fn create_collection(
    state: State<'_, AppState>,
    domain_id: String,
    name: String,
    base_url: String,
) -> Result<CollectionSummary, ErrorView> {
    lock(&state.store)
        .create_collection(&domain_id, name, base_url)
        .map_err(Error::view)
}

#[tauri::command]
pub fn rename_collection(
    state: State<'_, AppState>,
    domain_id: String,
    id: String,
    name: String,
) -> Result<(), ErrorView> {
    lock(&state.store)
        .rename_collection(&domain_id, &id, name)
        .map_err(Error::view)
}

#[tauri::command]
pub fn update_collection(
    state: State<'_, AppState>,
    domain_id: String,
    id: String,
    name: String,
    base_url: String,
) -> Result<(), ErrorView> {
    lock(&state.store)
        .update_collection(&domain_id, &id, name, base_url)
        .map_err(Error::view)
}

#[tauri::command]
pub fn delete_collection(
    state: State<'_, AppState>,
    domain_id: String,
    id: String,
) -> Result<(), ErrorView> {
    let secrets = state.secrets.clone();
    lock(&state.store)
        .delete_collection(&domain_id, &id, secrets.as_ref())
        .map_err(Error::view)
}

#[tauri::command]
pub fn reorder_collections(state: State<'_, AppState>, domain_id: String, ids: Vec<String>) -> Result<(), ErrorView> {
    lock(&state.store)
        .reorder_collections(&domain_id, ids)
        .map_err(Error::view)
}

#[tauri::command]
pub fn save_headers(
    state: State<'_, AppState>,
    domain_id: String,
    collection_id: String,
    name: String,
    headers: Vec<HeaderEntry>,
) -> Result<HeaderSummary, ErrorView> {
    let secrets = state.secrets.clone();
    lock(&state.store)
        .save_headers(secrets.as_ref(), &domain_id, &collection_id, name, &headers)
        .map_err(Error::view)
}

#[tauri::command]
pub fn rename_headers(
    state: State<'_, AppState>,
    domain_id: String,
    collection_id: String,
    header_id: String,
    name: String,
) -> Result<(), ErrorView> {
    lock(&state.store)
        .rename_headers(&domain_id, &collection_id, &header_id, name)
        .map_err(Error::view)
}

#[tauri::command]
pub fn update_headers(
    state: State<'_, AppState>,
    domain_id: String,
    collection_id: String,
    header_id: String,
    name: String,
    headers: Vec<HeaderEntry>,
) -> Result<HeaderSummary, ErrorView> {
    let secrets = state.secrets.clone();
    lock(&state.store)
        .update_headers(
            secrets.as_ref(),
            &domain_id,
            &collection_id,
            &header_id,
            name,
            &headers,
        )
        .map_err(Error::view)
}

#[tauri::command]
pub fn delete_headers(
    state: State<'_, AppState>,
    domain_id: String,
    collection_id: String,
    header_id: String,
) -> Result<(), ErrorView> {
    let secrets = state.secrets.clone();
    lock(&state.store)
        .delete_headers(secrets.as_ref(), &domain_id, &collection_id, &header_id)
        .map_err(Error::view)
}

#[tauri::command]
pub fn reorder_headers(
    state: State<'_, AppState>,
    domain_id: String,
    collection_id: String,
    ids: Vec<String>,
) -> Result<(), ErrorView> {
    lock(&state.store)
        .reorder_headers(&domain_id, &collection_id, ids)
        .map_err(Error::view)
}

#[tauri::command]
pub fn load_headers(
    state: State<'_, AppState>,
    domain_id: String,
    collection_id: String,
    header_id: String,
) -> Result<LoadedHeaders, ErrorView> {
    let secrets = state.secrets.clone();
    lock(&state.store)
        .load_headers(secrets.as_ref(), &domain_id, &collection_id, &header_id)
        .map_err(Error::view)
}

#[tauri::command]
pub fn import_headers(
    state: State<'_, AppState>,
    domain_id: String,
    collection_id: String,
    raw: String,
) -> Result<u32, ErrorView> {
    let secrets = state.secrets.clone();
    lock(&state.store)
        .import_headers(secrets.as_ref(), &domain_id, &collection_id, &raw)
        .map(|items| items.len() as u32)
        .map_err(Error::view)
}

#[tauri::command]
pub fn save_path(
    state: State<'_, AppState>,
    domain_id: String,
    collection_id: String,
    method: Method,
    path: String,
) -> Result<PathSummary, ErrorView> {
    lock(&state.store)
        .save_path(&domain_id, &collection_id, method, path)
        .map_err(Error::view)
}

#[tauri::command]
pub fn update_path(
    state: State<'_, AppState>,
    domain_id: String,
    collection_id: String,
    path_id: String,
    method: Method,
    path: String,
) -> Result<PathSummary, ErrorView> {
    lock(&state.store)
        .update_path(&domain_id, &collection_id, &path_id, method, path)
        .map_err(Error::view)
}

#[tauri::command]
pub fn delete_path(
    state: State<'_, AppState>,
    domain_id: String,
    collection_id: String,
    path_id: String,
) -> Result<(), ErrorView> {
    lock(&state.store)
        .delete_path(&domain_id, &collection_id, &path_id)
        .map_err(Error::view)
}

#[tauri::command]
pub fn import_paths(
    state: State<'_, AppState>,
    domain_id: String,
    collection_id: String,
    raw: String,
) -> Result<u32, ErrorView> {
    lock(&state.store)
        .import_paths(&domain_id, &collection_id, &raw)
        .map(|items| items.len() as u32)
        .map_err(Error::view)
}

#[tauri::command]
pub fn reorder_paths(
    state: State<'_, AppState>,
    domain_id: String,
    collection_id: String,
    ids: Vec<String>,
) -> Result<(), ErrorView> {
    lock(&state.store)
        .reorder_paths(&domain_id, &collection_id, ids)
        .map_err(Error::view)
}

#[tauri::command]
pub fn save_body(
    state: State<'_, AppState>,
    domain_id: String,
    collection_id: String,
    name: String,
    body: RequestBody,
) -> Result<BodySummary, ErrorView> {
    lock(&state.store)
        .save_body(&domain_id, &collection_id, name, body)
        .map_err(Error::view)
}

#[tauri::command]
pub fn rename_body(
    state: State<'_, AppState>,
    domain_id: String,
    collection_id: String,
    body_id: String,
    name: String,
) -> Result<(), ErrorView> {
    lock(&state.store)
        .rename_body(&domain_id, &collection_id, &body_id, name)
        .map_err(Error::view)
}

#[tauri::command]
pub fn update_body(
    state: State<'_, AppState>,
    domain_id: String,
    collection_id: String,
    body_id: String,
    name: String,
    body: RequestBody,
) -> Result<BodySummary, ErrorView> {
    lock(&state.store)
        .update_body(&domain_id, &collection_id, &body_id, name, body)
        .map_err(Error::view)
}

#[tauri::command]
pub fn delete_body(
    state: State<'_, AppState>,
    domain_id: String,
    collection_id: String,
    body_id: String,
) -> Result<(), ErrorView> {
    lock(&state.store)
        .delete_body(&domain_id, &collection_id, &body_id)
        .map_err(Error::view)
}

#[tauri::command]
pub fn import_bodies(
    state: State<'_, AppState>,
    domain_id: String,
    collection_id: String,
    raw: String,
) -> Result<u32, ErrorView> {
    lock(&state.store)
        .import_bodies(&domain_id, &collection_id, &raw)
        .map(|items| items.len() as u32)
        .map_err(Error::view)
}

#[tauri::command]
pub fn reorder_bodies(
    state: State<'_, AppState>,
    domain_id: String,
    collection_id: String,
    ids: Vec<String>,
) -> Result<(), ErrorView> {
    lock(&state.store)
        .reorder_bodies(&domain_id, &collection_id, ids)
        .map_err(Error::view)
}

#[tauri::command]
pub fn load_body(
    state: State<'_, AppState>,
    domain_id: String,
    collection_id: String,
    body_id: String,
) -> Result<LoadedBody, ErrorView> {
    lock(&state.store)
        .load_body(&domain_id, &collection_id, &body_id)
        .map_err(Error::view)
}

#[tauri::command]
pub fn list_history(state: State<'_, AppState>) -> Result<Vec<HistoryEntry>, ErrorView> {
    Ok(lock(&state.store).list_history())
}

#[tauri::command]
pub fn clear_history(state: State<'_, AppState>) -> Result<(), ErrorView> {
    lock(&state.store).clear_history().map_err(Error::view)
}

#[tauri::command]
pub fn reorder_history(state: State<'_, AppState>, ids: Vec<String>) -> Result<(), ErrorView> {
    lock(&state.store).reorder_history(ids).map_err(Error::view)
}

#[tauri::command]
pub fn list_benchmarks(state: State<'_, AppState>) -> Result<Vec<BenchSummary>, ErrorView> {
    Ok(lock(&state.store).list_benchmarks())
}

#[tauri::command]
pub async fn run_benchmark(
    state: State<'_, AppState>,
    config: BenchConfig,
    on_progress: Channel<BenchSnapshot>,
) -> Result<BenchSummary, ErrorView> {
    if lock(&state.bench).is_some() {
        return Err(Error::InvalidConfig("a benchmark is already running".into()).view());
    }
    let token = CancellationToken::new();
    *lock(&state.bench) = Some(token.clone());
    let _guard = BenchGuard(state.bench.clone());
    let executor = state.executor.clone();
    let store = state.store.clone();
    let summary = execute_benchmark(&executor, config, &token, |snapshot| {
        if let Err(err) = on_progress.send(snapshot) {
            tracing::debug!(error = %err, "progress channel closed");
        }
    })
    .await
    .map_err(Error::view)?;
    if let Err(err) = lock(&store).record_benchmark(summary.clone()) {
        tracing::error!(error = %err, "failed to store the benchmark summary");
    }
    Ok(summary)
}

#[tauri::command]
pub fn cancel_benchmark(state: State<'_, AppState>) -> Result<(), ErrorView> {
    if let Some(token) = lock(&state.bench).as_ref() {
        token.cancel();
    }
    Ok(())
}
