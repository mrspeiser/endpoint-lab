use tauri::{ipc::Channel, State};

use endpoint_lab_core::{
    run_benchmark as execute_benchmark, BenchConfig, BenchSnapshot, BenchSummary, CancellationToken,
    CollectionSummary, EngineLimits, Error, ErrorView, HistoryEntry, HistoryOutcome, HttpRequest,
    HttpResponse, LoadedRequest, RequestSummary, StoreStatus,
};

use crate::state::{lock, AppState, BenchGuard, InflightGuard};

#[tauri::command]
fn engine_limits() -> EngineLimits {
    EngineLimits::current()
}

#[tauri::command]
fn store_status(state: State<'_, AppState>) -> StoreStatus {
    lock(&state.store).status()
}

#[tauri::command]
async fn send_request(
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
fn cancel_request(state: State<'_, AppState>, invocation_id: String) -> Result<(), ErrorView> {
    if let Some(token) = lock(&state.inflight).get(&invocation_id) {
        token.cancel();
    }
    Ok(())
}

#[tauri::command]
fn list_collections(state: State<'_, AppState>) -> Result<Vec<CollectionSummary>, ErrorView> {
    Ok(lock(&state.store).list_collections())
}

#[tauri::command]
fn create_collection(state: State<'_, AppState>, name: String) -> Result<CollectionSummary, ErrorView> {
    lock(&state.store)
        .create_collection(name)
        .map_err(Error::view)
}

#[tauri::command]
fn rename_collection(state: State<'_, AppState>, id: String, name: String) -> Result<(), ErrorView> {
    lock(&state.store)
        .rename_collection(&id, name)
        .map_err(Error::view)
}

#[tauri::command]
fn delete_collection(state: State<'_, AppState>, id: String) -> Result<(), ErrorView> {
    let secrets = state.secrets.clone();
    lock(&state.store)
        .delete_collection(&id, secrets.as_ref())
        .map_err(Error::view)
}

#[tauri::command]
fn save_request(
    state: State<'_, AppState>,
    collection_id: String,
    name: String,
    request: HttpRequest,
) -> Result<RequestSummary, ErrorView> {
    let secrets = state.secrets.clone();
    lock(&state.store)
        .save_request(secrets.as_ref(), &collection_id, name, &request)
        .map_err(Error::view)
}

#[tauri::command]
fn update_request(
    state: State<'_, AppState>,
    collection_id: String,
    request_id: String,
    name: String,
    request: HttpRequest,
) -> Result<RequestSummary, ErrorView> {
    let secrets = state.secrets.clone();
    lock(&state.store)
        .update_request(
            secrets.as_ref(),
            &collection_id,
            &request_id,
            name,
            &request,
        )
        .map_err(Error::view)
}

#[tauri::command]
fn delete_request(
    state: State<'_, AppState>,
    collection_id: String,
    request_id: String,
) -> Result<(), ErrorView> {
    let secrets = state.secrets.clone();
    lock(&state.store)
        .delete_request(secrets.as_ref(), &collection_id, &request_id)
        .map_err(Error::view)
}

#[tauri::command]
fn load_request(
    state: State<'_, AppState>,
    collection_id: String,
    request_id: String,
) -> Result<LoadedRequest, ErrorView> {
    let secrets = state.secrets.clone();
    lock(&state.store)
        .load_request(secrets.as_ref(), &collection_id, &request_id)
        .map_err(Error::view)
}

#[tauri::command]
fn list_history(state: State<'_, AppState>) -> Result<Vec<HistoryEntry>, ErrorView> {
    Ok(lock(&state.store).list_history())
}

#[tauri::command]
fn list_benchmarks(state: State<'_, AppState>) -> Result<Vec<BenchSummary>, ErrorView> {
    Ok(lock(&state.store).list_benchmarks())
}

#[tauri::command]
async fn run_benchmark(
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
fn cancel_benchmark(state: State<'_, AppState>) -> Result<(), ErrorView> {
    if let Some(token) = lock(&state.bench).as_ref() {
        token.cancel();
    }
    Ok(())
}
