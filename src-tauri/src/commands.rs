use crate::ucm_api::{
    Branch, CurrentContext, Definition, DefinitionSummary, NamespaceItem, Project, SearchResult,
    UCMApiClient,
};
use std::sync::Mutex;
use tauri::State;

pub struct AppState {
    pub ucm_client: Mutex<Option<UCMApiClient>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            ucm_client: Mutex::new(Some(UCMApiClient::new("127.0.0.1", 5858))),
        }
    }
}

#[tauri::command]
pub async fn get_projects(state: State<'_, AppState>) -> Result<Vec<Project>, String> {
    let client = {
        let client_guard = state.ucm_client.lock().unwrap();
        client_guard.as_ref().ok_or("UCM client not initialized")?.clone()
    };

    client
        .get_projects()
        .await
        .map_err(|e| format!("Failed to get projects: {}", e))
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_branches(
    projectName: String,
    state: State<'_, AppState>,
) -> Result<Vec<Branch>, String> {
    let client = {
        let client_guard = state.ucm_client.lock().unwrap();
        client_guard.as_ref().ok_or("UCM client not initialized")?.clone()
    };

    client
        .get_branches(&projectName)
        .await
        .map_err(|e| format!("Failed to get branches: {}", e))
}

#[tauri::command]
pub async fn get_current_context(
    state: State<'_, AppState>,
) -> Result<CurrentContext, String> {
    let client = {
        let client_guard = state.ucm_client.lock().unwrap();
        client_guard.as_ref().ok_or("UCM client not initialized")?.clone()
    };

    client
        .get_current_context()
        .await
        .map_err(|e| format!("Failed to get current context: {}", e))
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn list_namespace(
    projectName: String,
    branchName: String,
    namespace: String,
    state: State<'_, AppState>,
) -> Result<Vec<NamespaceItem>, String> {
    let client = {
        let client_guard = state.ucm_client.lock().unwrap();
        client_guard.as_ref().ok_or("UCM client not initialized")?.clone()
    };

    client
        .list_namespace(&projectName, &branchName, &namespace)
        .await
        .map_err(|e| format!("Failed to list namespace: {}", e))
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_definition(
    projectName: String,
    branchName: String,
    name: String,
    state: State<'_, AppState>,
) -> Result<Option<DefinitionSummary>, String> {
    let client = {
        let client_guard = state.ucm_client.lock().unwrap();
        client_guard.as_ref().ok_or("UCM client not initialized")?.clone()
    };

    client
        .get_definition(&projectName, &branchName, &name)
        .await
        .map_err(|e| format!("Failed to get definition: {}", e))
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn find_definitions(
    projectName: String,
    branchName: String,
    query: String,
    limit: usize,
    state: State<'_, AppState>,
) -> Result<Vec<SearchResult>, String> {
    let client = {
        let client_guard = state.ucm_client.lock().unwrap();
        client_guard.as_ref().ok_or("UCM client not initialized")?.clone()
    };

    client
        .find_definitions(&projectName, &branchName, &query, limit)
        .await
        .map_err(|e| format!("Failed to find definitions: {}", e))
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_dependencies(
    projectName: String,
    branchName: String,
    name: String,
    state: State<'_, AppState>,
) -> Result<Vec<Definition>, String> {
    let client = {
        let client_guard = state.ucm_client.lock().unwrap();
        client_guard.as_ref().ok_or("UCM client not initialized")?.clone()
    };

    client
        .get_dependencies(&projectName, &branchName, &name)
        .await
        .map_err(|e| format!("Failed to get dependencies: {}", e))
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_dependents(
    projectName: String,
    branchName: String,
    name: String,
    state: State<'_, AppState>,
) -> Result<Vec<Definition>, String> {
    let client = {
        let client_guard = state.ucm_client.lock().unwrap();
        client_guard.as_ref().ok_or("UCM client not initialized")?.clone()
    };

    client
        .get_dependents(&projectName, &branchName, &name)
        .await
        .map_err(|e| format!("Failed to get dependents: {}", e))
}

#[tauri::command]
pub async fn check_ucm_connection(state: State<'_, AppState>) -> Result<bool, String> {
    let client = {
        let client_guard = state.ucm_client.lock().unwrap();
        client_guard.as_ref().ok_or("UCM client not initialized")?.clone()
    };

    client
        .check_connection()
        .await
        .map_err(|e| format!("Failed to check connection: {}", e))
}

#[tauri::command]
pub async fn configure_ucm(
    host: String,
    port: u16,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut client_guard = state.ucm_client.lock().unwrap();
    *client_guard = Some(UCMApiClient::new(&host, port));
    Ok(())
}
