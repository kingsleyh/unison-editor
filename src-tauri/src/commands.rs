use crate::mcp_client::{MCPClient, RunTestsResult, TypecheckResult, UpdateResult};
use crate::ucm_api::{
    Branch, CurrentContext, Definition, DefinitionSummary, NamespaceItem, Project, SearchResult,
    UCMApiClient,
};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::State;

pub struct AppState {
    pub ucm_client: Mutex<Option<UCMApiClient>>,
    pub mcp_client: Mutex<Option<MCPClient>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            ucm_client: Mutex::new(Some(UCMApiClient::new("127.0.0.1", 5858))),
            mcp_client: Mutex::new(None),
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

// File System Commands

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    #[serde(rename = "isDirectory")]
    pub is_directory: bool,
    pub children: Option<Vec<FileNode>>,
}

#[tauri::command]
pub async fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file '{}': {}", path, e))
}

#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<(), String> {
    // Ensure parent directory exists
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create parent directory: {}", e))?;
    }

    fs::write(&path, content)
        .map_err(|e| format!("Failed to write file '{}': {}", path, e))
}

#[tauri::command]
pub async fn list_directory(path: String, recursive: bool) -> Result<Vec<FileNode>, String> {
    let path_buf = PathBuf::from(&path);

    if !path_buf.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    if !path_buf.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }

    list_directory_impl(&path_buf, recursive)
}

fn list_directory_impl(path: &Path, recursive: bool) -> Result<Vec<FileNode>, String> {
    let entries = fs::read_dir(path)
        .map_err(|e| format!("Failed to read directory '{}': {}", path.display(), e))?;

    let mut nodes = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();
        let metadata = entry.metadata()
            .map_err(|e| format!("Failed to read metadata: {}", e))?;

        let name = entry.file_name()
            .to_string_lossy()
            .to_string();

        // Skip hidden files (starting with .)
        if name.starts_with('.') {
            continue;
        }

        let is_directory = metadata.is_dir();
        let path_str = path.to_string_lossy().to_string();

        let children = if is_directory && recursive {
            Some(list_directory_impl(&path, recursive)?)
        } else {
            None
        };

        nodes.push(FileNode {
            name,
            path: path_str,
            is_directory,
            children,
        });
    }

    // Sort: directories first, then alphabetically
    nodes.sort_by(|a, b| {
        match (a.is_directory, b.is_directory) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(nodes)
}

#[tauri::command]
pub async fn create_file(path: String, is_directory: bool) -> Result<(), String> {
    let path_buf = PathBuf::from(&path);

    if path_buf.exists() {
        return Err(format!("Path already exists: {}", path));
    }

    if is_directory {
        fs::create_dir_all(&path_buf)
            .map_err(|e| format!("Failed to create directory '{}': {}", path, e))?;
    } else {
        // Ensure parent directory exists
        if let Some(parent) = path_buf.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create parent directory: {}", e))?;
        }

        fs::write(&path_buf, "")
            .map_err(|e| format!("Failed to create file '{}': {}", path, e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn delete_file(path: String) -> Result<(), String> {
    let path_buf = PathBuf::from(&path);

    if !path_buf.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    if path_buf.is_dir() {
        fs::remove_dir_all(&path_buf)
            .map_err(|e| format!("Failed to delete directory '{}': {}", path, e))?;
    } else {
        fs::remove_file(&path_buf)
            .map_err(|e| format!("Failed to delete file '{}': {}", path, e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn rename_file(old_path: String, new_path: String) -> Result<(), String> {
    let old_path_buf = PathBuf::from(&old_path);
    let new_path_buf = PathBuf::from(&new_path);

    if !old_path_buf.exists() {
        return Err(format!("Source path does not exist: {}", old_path));
    }

    if new_path_buf.exists() {
        return Err(format!("Destination path already exists: {}", new_path));
    }

    fs::rename(&old_path_buf, &new_path_buf)
        .map_err(|e| format!("Failed to rename '{}' to '{}': {}", old_path, new_path, e))
}

#[tauri::command]
pub async fn file_exists(path: String) -> Result<bool, String> {
    Ok(PathBuf::from(&path).exists())
}

// UCM MCP Commands - For updating codebase definitions

#[tauri::command]
#[allow(non_snake_case)]
pub fn ucm_update(
    code: String,
    projectName: String,
    branchName: String,
    state: State<'_, AppState>,
) -> Result<UpdateResult, String> {
    let mut mcp_guard = state.mcp_client.lock().unwrap();

    // Spawn MCP client if not already running
    if mcp_guard.is_none() {
        *mcp_guard = Some(MCPClient::spawn()?);
    }

    let mcp_client = mcp_guard
        .as_mut()
        .ok_or("Failed to get MCP client")?;

    // Call the update tool
    mcp_client.update_definitions(&code, &projectName, &branchName)
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn ucm_typecheck(
    code: String,
    projectName: String,
    branchName: String,
    state: State<'_, AppState>,
) -> Result<TypecheckResult, String> {
    let mut mcp_guard = state.mcp_client.lock().unwrap();

    // Spawn MCP client if not already running
    if mcp_guard.is_none() {
        *mcp_guard = Some(MCPClient::spawn()?);
    }

    let mcp_client = mcp_guard
        .as_mut()
        .ok_or("Failed to get MCP client")?;

    // Call the typecheck tool
    mcp_client.typecheck_code(&code, &projectName, &branchName)
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn ucm_run_tests(
    projectName: String,
    branchName: String,
    subnamespace: Option<String>,
    state: State<'_, AppState>,
) -> Result<RunTestsResult, String> {
    let mut mcp_guard = state.mcp_client.lock().unwrap();

    // Spawn MCP client if not already running
    if mcp_guard.is_none() {
        *mcp_guard = Some(MCPClient::spawn()?);
    }

    let mcp_client = mcp_guard
        .as_mut()
        .ok_or("Failed to get MCP client")?;

    // Call the run-tests tool
    mcp_client.run_tests(&projectName, &branchName, subnamespace.as_deref())
}

// LSP Commands

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::Mutex as TokioMutex;
use std::sync::Arc;

pub struct LSPConnection {
    pub stream: Arc<TokioMutex<Option<TcpStream>>>,
}

impl Default for LSPConnection {
    fn default() -> Self {
        Self {
            stream: Arc::new(TokioMutex::new(None)),
        }
    }
}

#[tauri::command]
pub async fn lsp_connect(
    host: String,
    port: u16,
    state: State<'_, LSPConnection>,
) -> Result<(), String> {
    let addr = format!("{}:{}", host, port);
    let stream = TcpStream::connect(&addr)
        .await
        .map_err(|e| format!("Failed to connect to LSP server at {}: {}", addr, e))?;

    let mut guard = state.stream.lock().await;
    *guard = Some(stream);

    Ok(())
}

#[tauri::command]
pub async fn lsp_disconnect(state: State<'_, LSPConnection>) -> Result<(), String> {
    let mut guard = state.stream.lock().await;
    if let Some(stream) = guard.take() {
        drop(stream); // Close the connection
    }
    Ok(())
}

#[tauri::command]
pub async fn lsp_send_request(
    message: String,
    state: State<'_, LSPConnection>,
) -> Result<String, String> {
    let mut guard = state.stream.lock().await;
    let stream = guard
        .as_mut()
        .ok_or("LSP connection not established")?;

    // LSP uses Content-Length header format
    let content_length = message.len();
    let request = format!(
        "Content-Length: {}\r\n\r\n{}",
        content_length,
        message
    );

    // Send the request
    stream
        .write_all(request.as_bytes())
        .await
        .map_err(|e| format!("Failed to send LSP request: {}", e))?;

    stream
        .flush()
        .await
        .map_err(|e| format!("Failed to flush LSP stream: {}", e))?;

    // Read the response
    let response = read_lsp_message(stream)
        .await
        .map_err(|e| format!("Failed to read LSP response: {}", e))?;

    Ok(response)
}

async fn read_lsp_message(stream: &mut TcpStream) -> Result<String, anyhow::Error> {
    // Read headers
    let mut headers = Vec::new();
    let mut buffer = [0u8; 1];
    let mut prev_char = '\0';

    loop {
        stream.read_exact(&mut buffer).await?;
        let ch = buffer[0] as char;
        headers.push(ch);

        // Check for \r\n\r\n (end of headers)
        if headers.len() >= 4 {
            let last_four: String = headers.iter().rev().take(4).rev().collect();
            if last_four == "\r\n\r\n" {
                break;
            }
        }

        prev_char = ch;
    }

    // Parse Content-Length
    let headers_str: String = headers.iter().collect();
    let content_length = headers_str
        .lines()
        .find(|line| line.starts_with("Content-Length:"))
        .and_then(|line| line.split(':').nth(1))
        .and_then(|s| s.trim().parse::<usize>().ok())
        .ok_or_else(|| anyhow::anyhow!("Missing or invalid Content-Length header"))?;

    // Read the content
    let mut content = vec![0u8; content_length];
    stream.read_exact(&mut content).await?;

    Ok(String::from_utf8(content)?)
}
