use crate::lsp_proxy::LspProxy;
use crate::mcp_client::{MCPClient, RunFunctionResult, RunTestsResult, TypecheckResult, UpdateResult};
use crate::port_utils::find_available_port;
use crate::ucm_api::{
    Branch, CurrentContext, Definition, DefinitionSummary, NamespaceItem, Project, SearchResult,
    UCMApiClient,
};
use crate::ucm_pty::{UCMContext, UCMPtyManager};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, State};

pub struct AppState {
    pub ucm_client: Mutex<Option<UCMApiClient>>,
    pub mcp_client: Mutex<Option<MCPClient>>,
    pub ucm_pty: Mutex<Option<UCMPtyManager>>,
    /// UCM HTTP API port (dynamically allocated, default 5858)
    pub api_port: Mutex<u16>,
    /// UCM LSP server port (dynamically allocated, default 5757)
    pub lsp_port: Mutex<u16>,
    /// WebSocket proxy port for LSP (dynamically allocated, default 5758)
    pub lsp_proxy_port: Mutex<u16>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            // UCM client will be initialized when UCM is spawned with the actual port
            ucm_client: Mutex::new(None),
            mcp_client: Mutex::new(None),
            ucm_pty: Mutex::new(None),
            api_port: Mutex::new(5858),
            lsp_port: Mutex::new(5757),
            lsp_proxy_port: Mutex::new(5758),
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

    // Use suffixifyBindings=true for display (shorter, more readable names)
    client
        .get_definition(&projectName, &branchName, &name, true)
        .await
        .map_err(|e| format!("Failed to get definition: {}", e))
}

/// Get definition with fully qualified names (for add-to-scratch functionality)
/// Uses suffixifyBindings=false to get FQN source suitable for scratch files
#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_definition_fqn(
    projectName: String,
    branchName: String,
    name: String,
    state: State<'_, AppState>,
) -> Result<Option<DefinitionSummary>, String> {
    let client = {
        let client_guard = state.ucm_client.lock().unwrap();
        client_guard.as_ref().ok_or("UCM client not initialized")?.clone()
    };

    // Use suffixifyBindings=false for FQN source (for scratch files)
    client
        .get_definition(&projectName, &branchName, &name, false)
        .await
        .map_err(|e| format!("Failed to get definition with FQN: {}", e))
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

/// Maximum recursion depth for directory listing to prevent infinite loops
const MAX_DIRECTORY_DEPTH: usize = 50;

/// Validate that a path is within the allowed workspace directory
/// Returns the canonicalized path if valid, or an error if path traversal is detected
fn validate_path(path: &str, workspace: Option<&str>) -> Result<PathBuf, String> {
    let path_buf = PathBuf::from(path);

    // Check for path traversal attempts in the raw path
    if path.contains("..") {
        return Err(format!("Path traversal not allowed: {}", path));
    }

    // If the path doesn't exist yet (e.g., for create operations), validate the parent
    let canonical = if path_buf.exists() {
        fs::canonicalize(&path_buf)
            .map_err(|e| format!("Failed to resolve path '{}': {}", path, e))?
    } else {
        // For non-existent paths, canonicalize the parent and append the filename
        if let Some(parent) = path_buf.parent() {
            if parent.as_os_str().is_empty() || !parent.exists() {
                // If parent doesn't exist or is empty, just return the original path
                // This will be validated by the actual file operation
                path_buf.clone()
            } else {
                let canonical_parent = fs::canonicalize(parent)
                    .map_err(|e| format!("Failed to resolve parent path: {}", e))?;
                if let Some(filename) = path_buf.file_name() {
                    canonical_parent.join(filename)
                } else {
                    canonical_parent
                }
            }
        } else {
            path_buf.clone()
        }
    };

    // If workspace is provided, ensure the path is within it
    if let Some(ws) = workspace {
        let ws_path = PathBuf::from(ws);
        if ws_path.exists() {
            let workspace_canonical = fs::canonicalize(&ws_path)
                .map_err(|e| format!("Failed to resolve workspace '{}': {}", ws, e))?;

            if !canonical.starts_with(&workspace_canonical) {
                return Err(format!(
                    "Path '{}' is outside the workspace directory",
                    path
                ));
            }
        }
    }

    Ok(canonical)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    #[serde(rename = "isDirectory")]
    pub is_directory: bool,
    pub children: Option<Vec<FileNode>>,
}

#[tauri::command]
pub async fn read_file(path: String, workspace: Option<String>) -> Result<String, String> {
    let validated_path = validate_path(&path, workspace.as_deref())?;
    fs::read_to_string(&validated_path)
        .map_err(|e| format!("Failed to read file '{}': {}", path, e))
}

#[tauri::command]
pub async fn write_file(path: String, content: String, workspace: Option<String>) -> Result<(), String> {
    let validated_path = validate_path(&path, workspace.as_deref())?;

    // Ensure parent directory exists
    if let Some(parent) = validated_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create parent directory: {}", e))?;
    }

    fs::write(&validated_path, content)
        .map_err(|e| format!("Failed to write file '{}': {}", path, e))
}

#[tauri::command]
pub async fn list_directory(path: String, recursive: bool, workspace: Option<String>) -> Result<Vec<FileNode>, String> {
    let validated_path = validate_path(&path, workspace.as_deref())?;

    if !validated_path.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    if !validated_path.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }

    list_directory_impl(&validated_path, recursive, 0)
}

fn list_directory_impl(path: &Path, recursive: bool, depth: usize) -> Result<Vec<FileNode>, String> {
    // Prevent infinite recursion from symlinks or deeply nested directories
    if depth > MAX_DIRECTORY_DEPTH {
        return Err(format!(
            "Maximum directory depth ({}) exceeded at '{}'",
            MAX_DIRECTORY_DEPTH,
            path.display()
        ));
    }

    let entries = fs::read_dir(path)
        .map_err(|e| format!("Failed to read directory '{}': {}", path.display(), e))?;

    let mut nodes = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let entry_path = entry.path();
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

        // Skip symlinks to prevent infinite loops
        if metadata.file_type().is_symlink() {
            continue;
        }

        let path_str = entry_path.to_string_lossy().to_string();

        let children = if is_directory && recursive {
            Some(list_directory_impl(&entry_path, recursive, depth + 1)?)
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
pub async fn create_file(path: String, is_directory: bool, workspace: Option<String>) -> Result<(), String> {
    let validated_path = validate_path(&path, workspace.as_deref())?;

    if validated_path.exists() {
        return Err(format!("Path already exists: {}", path));
    }

    if is_directory {
        fs::create_dir_all(&validated_path)
            .map_err(|e| format!("Failed to create directory '{}': {}", path, e))?;
    } else {
        // Ensure parent directory exists
        if let Some(parent) = validated_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create parent directory: {}", e))?;
        }

        fs::write(&validated_path, "")
            .map_err(|e| format!("Failed to create file '{}': {}", path, e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn delete_file(path: String, workspace: Option<String>) -> Result<(), String> {
    let validated_path = validate_path(&path, workspace.as_deref())?;

    if !validated_path.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    if validated_path.is_dir() {
        fs::remove_dir_all(&validated_path)
            .map_err(|e| format!("Failed to delete directory '{}': {}", path, e))?;
    } else {
        fs::remove_file(&validated_path)
            .map_err(|e| format!("Failed to delete file '{}': {}", path, e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn rename_file(old_path: String, new_path: String, workspace: Option<String>) -> Result<(), String> {
    // Validate both paths are within the workspace
    let validated_old = validate_path(&old_path, workspace.as_deref())?;
    let validated_new = validate_path(&new_path, workspace.as_deref())?;

    if !validated_old.exists() {
        return Err(format!("Source path does not exist: {}", old_path));
    }

    if validated_new.exists() {
        return Err(format!("Destination path already exists: {}", new_path));
    }

    fs::rename(&validated_old, &validated_new)
        .map_err(|e| format!("Failed to rename '{}' to '{}': {}", old_path, new_path, e))
}

#[tauri::command]
pub async fn file_exists(path: String, workspace: Option<String>) -> Result<bool, String> {
    // Validate path even for existence check to prevent information disclosure
    let validated_path = validate_path(&path, workspace.as_deref())?;
    Ok(validated_path.exists())
}

// UCM MCP Commands - For updating codebase definitions

/// Switch UCM's project/branch context
/// This syncs UCM with the editor's selected project/branch
#[tauri::command]
#[allow(non_snake_case)]
pub fn switch_project_branch(
    projectName: String,
    branchName: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut mcp_guard = state.mcp_client.lock().unwrap();

    // Spawn MCP client if not already running
    if mcp_guard.is_none() {
        *mcp_guard = Some(MCPClient::spawn()?);
    }

    let mcp_client = mcp_guard
        .as_mut()
        .ok_or("Failed to get MCP client")?;

    mcp_client.switch_context(&projectName, &branchName)
}

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
    let start_time = std::time::Instant::now();
    let mut mcp_guard = state.mcp_client.lock().unwrap();

    // Spawn MCP client if not already running
    let spawned = if mcp_guard.is_none() {
        log::info!("MCP client not initialized, spawning new instance...");
        *mcp_guard = Some(MCPClient::spawn()?);
        log::info!("MCP client spawned in {:?}", start_time.elapsed());
        true
    } else {
        log::debug!("Reusing existing MCP client");
        false
    };

    let mcp_client = mcp_guard
        .as_mut()
        .ok_or("Failed to get MCP client")?;

    // Call the typecheck tool
    let typecheck_start = std::time::Instant::now();
    let result = mcp_client.typecheck_code(&code, &projectName, &branchName);
    log::info!(
        "ucm_typecheck completed in {:?} (spawned: {}, typecheck: {:?})",
        start_time.elapsed(),
        spawned,
        typecheck_start.elapsed()
    );
    result
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

#[tauri::command]
#[allow(non_snake_case)]
pub fn ucm_run(
    functionName: String,
    projectName: String,
    branchName: String,
    args: Vec<String>,
    state: State<'_, AppState>,
) -> Result<RunFunctionResult, String> {
    let mut mcp_guard = state.mcp_client.lock().unwrap();

    // Spawn MCP client if not already running
    if mcp_guard.is_none() {
        *mcp_guard = Some(MCPClient::spawn()?);
    }

    let mcp_client = mcp_guard
        .as_mut()
        .ok_or("Failed to get MCP client")?;

    // Call the run tool
    mcp_client.run_function(&functionName, &projectName, &branchName, args)
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn view_definitions(
    projectName: String,
    branchName: String,
    names: Vec<String>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let mut mcp_guard = state.mcp_client.lock().unwrap();

    // Spawn MCP client if not already running
    if mcp_guard.is_none() {
        *mcp_guard = Some(MCPClient::spawn()?);
    }

    let mcp_client = mcp_guard
        .as_mut()
        .ok_or("Failed to get MCP client")?;

    // Call the view-definitions tool
    mcp_client.view_definitions(&projectName, &branchName, names)
}

// LSP Commands

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::Mutex as TokioMutex;

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

// UCM PTY Commands - For integrated terminal

/// Spawn UCM with PTY for interactive terminal
///
/// # Arguments
/// * `cwd` - Optional working directory for UCM (for file loading via `load` command)
///
/// # Returns
/// The allocated service ports (API and LSP)
#[tauri::command]
pub fn ucm_pty_spawn(
    cwd: Option<String>,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<ServicePorts, String> {
    let mut pty_guard = state.ucm_pty.lock().unwrap();

    // If already running, check if it's still actually running
    // (UCM might have crashed due to file lock or other errors)
    if let Some(ref manager) = *pty_guard {
        if manager.is_running() {
            let ports = ServicePorts {
                api_port: *state.api_port.lock().unwrap(),
                lsp_port: *state.lsp_port.lock().unwrap(),
                lsp_proxy_port: *state.lsp_proxy_port.lock().unwrap(),
            };
            return Ok(ports);
        } else {
            // UCM exited - clear the old manager so we can try again
            log::info!("Previous UCM PTY is no longer running, clearing state for respawn");
            *pty_guard = None;
        }
    }

    let (manager, ucm_ports) = UCMPtyManager::spawn(app_handle, cwd)?;
    *pty_guard = Some(manager);

    // Find available port for LSP WebSocket proxy (starting at 5758)
    let lsp_proxy_port = find_available_port(5758)
        .ok_or("Could not find available port for LSP WebSocket proxy")?;

    // Store the allocated ports in AppState
    *state.api_port.lock().unwrap() = ucm_ports.api_port;
    *state.lsp_port.lock().unwrap() = ucm_ports.lsp_port;
    *state.lsp_proxy_port.lock().unwrap() = lsp_proxy_port;

    // Update the UCM API client to use the new port
    let mut client_guard = state.ucm_client.lock().unwrap();
    *client_guard = Some(UCMApiClient::new("127.0.0.1", ucm_ports.api_port));

    // Start LSP WebSocket proxy now that we know the LSP port
    let lsp_port = ucm_ports.lsp_port;
    tauri::async_runtime::spawn(async move {
        let proxy = Arc::new(LspProxy::new(lsp_proxy_port, "127.0.0.1".to_string(), lsp_port));
        log::info!(
            "LSP WebSocket proxy starting on port {} -> UCM LSP port {}",
            lsp_proxy_port,
            lsp_port
        );
        if let Err(e) = proxy.start().await {
            log::error!("LSP proxy server error: {}", e);
        }
    });

    log::info!(
        "UCM PTY spawned successfully on ports - API: {}, LSP: {}, LSP Proxy: {}",
        ucm_ports.api_port,
        ucm_ports.lsp_port,
        lsp_proxy_port
    );

    // Return all allocated ports
    Ok(ServicePorts {
        api_port: ucm_ports.api_port,
        lsp_port: ucm_ports.lsp_port,
        lsp_proxy_port,
    })
}

/// Write data to UCM PTY (user input from terminal)
#[tauri::command]
pub fn ucm_pty_write(
    data: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let pty_guard = state.ucm_pty.lock().unwrap();
    let manager = pty_guard
        .as_ref()
        .ok_or("UCM PTY not spawned")?;

    manager.write(data.as_bytes())
}

/// Resize UCM PTY (when terminal is resized)
#[tauri::command]
pub fn ucm_pty_resize(
    rows: u16,
    cols: u16,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let pty_guard = state.ucm_pty.lock().unwrap();
    let manager = pty_guard
        .as_ref()
        .ok_or("UCM PTY not spawned")?;

    manager.resize(rows, cols)
}

/// Get current UCM context (project/branch) detected from PTY output
#[tauri::command]
pub fn ucm_pty_get_context(
    state: State<'_, AppState>,
) -> Result<UCMContext, String> {
    let pty_guard = state.ucm_pty.lock().unwrap();
    let manager = pty_guard
        .as_ref()
        .ok_or("UCM PTY not spawned")?;

    Ok(manager.get_context())
}

/// Send switch command to UCM via PTY
/// This switches UCM's project/branch context in the integrated terminal
#[tauri::command]
pub fn ucm_pty_switch_context(
    project: String,
    branch: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let pty_guard = state.ucm_pty.lock().unwrap();
    let manager = pty_guard
        .as_ref()
        .ok_or("UCM PTY not spawned")?;

    manager.switch_context(&project, &branch)
}

/// Kill the UCM PTY process
/// This should be called before spawning a new UCM PTY with a different working directory
#[tauri::command]
pub fn ucm_pty_kill(
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut pty_guard = state.ucm_pty.lock().unwrap();

    if let Some(manager) = pty_guard.take() {
        log::info!("Killing UCM PTY");
        manager.stop();
        // The manager will be dropped here, which also calls stop()
    }

    Ok(())
}

/// Response struct for get_service_ports command
#[derive(Serialize)]
pub struct ServicePorts {
    pub api_port: u16,
    pub lsp_port: u16,
    pub lsp_proxy_port: u16,
}

/// Get the current service ports (API, LSP, LSP proxy)
/// These are dynamically allocated when UCM is spawned
#[tauri::command]
pub fn get_service_ports(
    state: State<'_, AppState>,
) -> ServicePorts {
    ServicePorts {
        api_port: *state.api_port.lock().unwrap(),
        lsp_port: *state.lsp_port.lock().unwrap(),
        lsp_proxy_port: *state.lsp_proxy_port.lock().unwrap(),
    }
}
