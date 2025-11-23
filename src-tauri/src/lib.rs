mod commands;
mod ucm_api;

use commands::AppState;

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
      Ok(())
    })
    .manage(AppState::default())
    .invoke_handler(tauri::generate_handler![
      commands::get_projects,
      commands::get_branches,
      commands::get_current_context,
      commands::list_namespace,
      commands::get_definition,
      commands::find_definitions,
      commands::get_dependencies,
      commands::get_dependents,
      commands::check_ucm_connection,
      commands::configure_ucm,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
