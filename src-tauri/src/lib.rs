mod commands;
mod mcp_client;
mod ucm_api;
mod lsp_proxy;
mod ucm_pty;

use commands::{AppState, LSPConnection};
use lsp_proxy::LspProxy;
use std::sync::Arc;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // UCM PTY is now spawned on-demand by the frontend via ucm_pty_spawn command
      // This allows passing the workspace directory for proper file loading

      // Start LSP WebSocket proxy server in Tauri's async runtime
      // WebSocket on port 5758, proxying to UCM LSP on port 5757
      tauri::async_runtime::spawn(async move {
        let proxy = Arc::new(LspProxy::new(5758, "127.0.0.1".to_string(), 5757));
        log::info!("LSP WebSocket proxy starting on port 5758");
        if let Err(e) = proxy.start().await {
          log::error!("LSP proxy server error: {}", e);
        }
      });

      Ok(())
    })
    .plugin(tauri_plugin_dialog::init())
    .manage(AppState::default())
    .manage(LSPConnection::default())
    .invoke_handler(tauri::generate_handler![
      commands::get_projects,
      commands::get_branches,
      commands::get_current_context,
      commands::list_namespace,
      commands::get_definition,
      commands::get_definition_fqn,
      commands::find_definitions,
      commands::get_dependencies,
      commands::get_dependents,
      commands::check_ucm_connection,
      commands::configure_ucm,
      commands::read_file,
      commands::write_file,
      commands::list_directory,
      commands::create_file,
      commands::delete_file,
      commands::rename_file,
      commands::file_exists,
      commands::switch_project_branch,
      commands::ucm_update,
      commands::ucm_typecheck,
      commands::ucm_run_tests,
      commands::ucm_run,
      commands::view_definitions,
      commands::lsp_connect,
      commands::lsp_disconnect,
      commands::lsp_send_request,
      // UCM PTY commands for integrated terminal
      commands::ucm_pty_spawn,
      commands::ucm_pty_write,
      commands::ucm_pty_resize,
      commands::ucm_pty_get_context,
      commands::ucm_pty_switch_context,
      commands::ucm_pty_kill,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
