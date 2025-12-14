mod commands;
mod file_watcher;
mod mcp_client;
mod port_utils;
mod ucm_api;
mod lsp_proxy;
mod ucm_pty;

use commands::{AppState, LSPConnection};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      // Enable logging in both debug and release builds for diagnostics
      app.handle().plugin(
        tauri_plugin_log::Builder::default()
          .level(log::LevelFilter::Info)
          .build(),
      )?;

      // UCM PTY is now spawned on-demand by the frontend via ucm_pty_spawn command
      // This allows passing the workspace directory for proper file loading

      // Note: LSP WebSocket proxy is no longer started here.
      // It is started by ucm_pty_spawn after UCM is running and we know the LSP port.
      // The proxy will be started on port 5758 (WebSocket) -> dynamic LSP port

      Ok(())
    })
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_clipboard_manager::init())
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
      // Service port management
      commands::get_service_ports,
      // File watcher commands
      commands::init_file_watcher,
      commands::watch_file,
      commands::unwatch_file,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
