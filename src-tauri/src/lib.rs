mod commands;
mod state;

use state::AppState;
use tracing_subscriber::EnvFilter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| {
        EnvFilter::new("warn,endpoint_lab_core=info,endpoint_lab_lib=info")
    });
    let _ = tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_target(false)
        .try_init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::engine_limits,
            commands::store_status,
            commands::send_request,
            commands::cancel_request,
            commands::list_domains,
            commands::create_domain,
            commands::rename_domain,
            commands::delete_domain,
            commands::create_collection,
            commands::rename_collection,
            commands::delete_collection,
            commands::save_headers,
            commands::rename_headers,
            commands::update_headers,
            commands::delete_headers,
            commands::load_headers,
            commands::save_path,
            commands::update_path,
            commands::delete_path,
            commands::save_body,
            commands::rename_body,
            commands::update_body,
            commands::delete_body,
            commands::load_body,
            commands::list_history,
            commands::list_benchmarks,
            commands::run_benchmark,
            commands::cancel_benchmark,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
