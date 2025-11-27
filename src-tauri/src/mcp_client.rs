//! MCP (Model Context Protocol) client for communicating with UCM
//!
//! This module provides a client to spawn and communicate with `ucm mcp` subprocess
//! using JSON-RPC over stdio.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};

/// Result of an UCM update operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateResult {
    pub success: bool,
    pub output: String,
    pub errors: Vec<String>,
}

/// MCP client that manages a `ucm mcp` subprocess
pub struct MCPClient {
    process: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    request_id: AtomicU64,
    initialized: bool,
}

impl MCPClient {
    /// Spawn a new `ucm mcp` process
    pub fn spawn() -> Result<Self, String> {
        let mut process = Command::new("ucm")
            .arg("mcp")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("Failed to spawn ucm mcp: {}", e))?;

        let stdin = process.stdin.take().ok_or("Failed to capture stdin")?;
        let stdout = process.stdout.take().ok_or("Failed to capture stdout")?;

        let mut client = Self {
            process,
            stdin,
            stdout: BufReader::new(stdout),
            request_id: AtomicU64::new(1),
            initialized: false,
        };

        // Initialize the MCP connection
        client.initialize()?;

        Ok(client)
    }

    /// Initialize the MCP connection (required before calling tools)
    fn initialize(&mut self) -> Result<(), String> {
        let request = json!({
            "jsonrpc": "2.0",
            "id": self.next_id(),
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {
                    "name": "unison-editor",
                    "version": "0.1.0"
                }
            }
        });

        let response = self.send_request(&request)?;

        // Check if initialization was successful
        if response.get("error").is_some() {
            return Err(format!(
                "MCP initialization failed: {}",
                response["error"]["message"]
            ));
        }

        // Send initialized notification
        let notification = json!({
            "jsonrpc": "2.0",
            "method": "notifications/initialized"
        });
        self.send_notification(&notification)?;

        self.initialized = true;
        Ok(())
    }

    /// Get the next request ID
    fn next_id(&self) -> u64 {
        self.request_id.fetch_add(1, Ordering::SeqCst)
    }

    /// Send a JSON-RPC request and wait for response
    fn send_request(&mut self, request: &Value) -> Result<Value, String> {
        let request_str = request.to_string();

        // Write request as a single line (MCP uses newline-delimited JSON)
        writeln!(self.stdin, "{}", request_str)
            .map_err(|e| format!("Failed to write request: {}", e))?;
        self.stdin
            .flush()
            .map_err(|e| format!("Failed to flush stdin: {}", e))?;

        // Read response line
        let mut response_line = String::new();
        self.stdout
            .read_line(&mut response_line)
            .map_err(|e| format!("Failed to read response: {}", e))?;

        // Parse JSON response
        serde_json::from_str(&response_line)
            .map_err(|e| format!("Failed to parse response: {} (raw: {})", e, response_line))
    }

    /// Send a notification (no response expected)
    fn send_notification(&mut self, notification: &Value) -> Result<(), String> {
        let notification_str = notification.to_string();
        writeln!(self.stdin, "{}", notification_str)
            .map_err(|e| format!("Failed to write notification: {}", e))?;
        self.stdin
            .flush()
            .map_err(|e| format!("Failed to flush stdin: {}", e))
    }

    /// Call a tool and get the result
    pub fn call_tool(&mut self, tool_name: &str, arguments: Value) -> Result<Value, String> {
        if !self.initialized {
            return Err("MCP client not initialized".to_string());
        }

        let request = json!({
            "jsonrpc": "2.0",
            "id": self.next_id(),
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": arguments
            }
        });

        self.send_request(&request)
    }

    /// Update definitions in the codebase
    ///
    /// This calls the "update-definitions" MCP tool with the provided code
    /// and project context.
    pub fn update_definitions(
        &mut self,
        code: &str,
        project_name: &str,
        branch_name: &str,
    ) -> Result<UpdateResult, String> {
        // Format project context as UCM expects
        // project_name already includes @ prefix from the frontend
        let arguments = json!({
            "projectContext": {
                "projectName": project_name,
                "branchName": branch_name
            },
            "code": {
                "text": code
            }
        });

        let response = self.call_tool("update-definitions", arguments)?;

        // Parse the response
        if let Some(error) = response.get("error") {
            return Ok(UpdateResult {
                success: false,
                output: String::new(),
                errors: vec![error["message"]
                    .as_str()
                    .unwrap_or("Unknown error")
                    .to_string()],
            });
        }

        // Extract result content
        if let Some(result) = response.get("result") {
            let is_error = result.get("isError").and_then(|v| v.as_bool()).unwrap_or(false);

            // Extract text content from the result
            let raw_output = result
                .get("content")
                .and_then(|c| c.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|item| item.get("text").and_then(|t| t.as_str()))
                        .collect::<Vec<_>>()
                        .join("\n")
                })
                .unwrap_or_default();

            // Try to parse the output as JSON to extract friendly messages
            let (output, errors) = parse_ucm_output(&raw_output, is_error);

            if is_error || !errors.is_empty() {
                Ok(UpdateResult {
                    success: false,
                    output,
                    errors,
                })
            } else {
                Ok(UpdateResult {
                    success: true,
                    output,
                    errors: vec![],
                })
            }
        } else {
            Err("Invalid MCP response: missing result".to_string())
        }
    }

    /// Close the MCP connection
    pub fn close(&mut self) {
        let _ = self.process.kill();
    }
}

impl Drop for MCPClient {
    fn drop(&mut self) {
        self.close();
    }
}

/// Parse UCM's JSON output into friendly messages
fn parse_ucm_output(raw_output: &str, is_error: bool) -> (String, Vec<String>) {
    // Try to parse as JSON
    if let Ok(json) = serde_json::from_str::<Value>(raw_output) {
        let mut messages = Vec::new();
        let mut errors = Vec::new();

        // Extract error messages
        if let Some(error_msgs) = json.get("errorMessages").and_then(|v| v.as_array()) {
            for msg in error_msgs {
                if let Some(s) = msg.as_str() {
                    if !s.is_empty() {
                        errors.push(s.to_string());
                    }
                }
            }
        }

        // Extract output messages
        if let Some(output_msgs) = json.get("outputMessages").and_then(|v| v.as_array()) {
            for msg in output_msgs {
                if let Some(s) = msg.as_str() {
                    // Filter out noise messages
                    if !s.is_empty()
                        && !s.contains("Loading changes detected")
                        && s != "Done."
                    {
                        messages.push(s.to_string());
                    }
                }
            }
        }

        // Extract source code updates for the success message
        if let Some(updates) = json.get("sourceCodeUpdates").and_then(|v| v.as_array()) {
            if !updates.is_empty() {
                let count = updates.len();
                messages.push(format!("Updated {} definition{}", count, if count == 1 { "" } else { "s" }));
            }
        }

        // If we have errors, return them
        if !errors.is_empty() {
            return (errors.join("\n"), errors);
        }

        // Build success message
        if messages.is_empty() {
            if is_error {
                return ("Update failed".to_string(), vec!["Update failed".to_string()]);
            }
            return ("Saved to codebase".to_string(), vec![]);
        }

        (messages.join(". "), vec![])
    } else {
        // Not JSON, return as-is
        if is_error {
            (raw_output.to_string(), vec![raw_output.to_string()])
        } else {
            (raw_output.to_string(), vec![])
        }
    }
}
