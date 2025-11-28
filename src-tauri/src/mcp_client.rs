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

/// Result of typechecking code (including watch expression evaluation)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TypecheckResult {
    pub success: bool,
    pub errors: Vec<String>,
    /// Watch expression results
    #[serde(rename = "watchResults")]
    pub watch_results: Vec<WatchResult>,
    /// Test expression results
    #[serde(rename = "testResults")]
    pub test_results: Vec<TestResult>,
    /// Raw output for debugging
    pub output: String,
}

/// A single test result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestResult {
    pub name: String,
    pub passed: bool,
    pub message: String,
}

/// Result of running tests from the codebase
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunTestsResult {
    pub success: bool,
    pub output: String,
    pub errors: Vec<String>,
    #[serde(rename = "testResults")]
    pub test_results: Vec<TestResult>,
}

/// A single watch expression result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatchResult {
    pub expression: String,
    pub result: String,
    #[serde(rename = "lineNumber")]
    pub line_number: usize,
}

/// Result of running an IO function
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunFunctionResult {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
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

    /// Typecheck code and evaluate watch expressions
    ///
    /// This calls the "typecheck-code" MCP tool with the provided code
    /// and project context. Watch expressions (lines starting with >) are
    /// evaluated and their results returned.
    pub fn typecheck_code(
        &mut self,
        code: &str,
        project_name: &str,
        branch_name: &str,
    ) -> Result<TypecheckResult, String> {
        let arguments = json!({
            "projectContext": {
                "projectName": project_name,
                "branchName": branch_name
            },
            "code": {
                "sourceCode": code
            }
        });

        let response = self.call_tool("typecheck-code", arguments)?;

        // Parse the response
        if let Some(error) = response.get("error") {
            return Ok(TypecheckResult {
                success: false,
                errors: vec![error["message"]
                    .as_str()
                    .unwrap_or("Unknown error")
                    .to_string()],
                watch_results: vec![],
                test_results: vec![],
                output: String::new(),
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

            // Parse the output to extract watch results and test results
            let (output, errors, watch_results, test_results) = parse_typecheck_output(&raw_output, is_error);

            Ok(TypecheckResult {
                success: !is_error && errors.is_empty(),
                errors,
                watch_results,
                test_results,
                output,
            })
        } else {
            Err("Invalid MCP response: missing result".to_string())
        }
    }

    /// Run tests from the codebase
    ///
    /// This calls the "run-tests" MCP tool to run tests that are already
    /// saved in the codebase. Can optionally specify a subnamespace to
    /// run tests from a specific location.
    pub fn run_tests(
        &mut self,
        project_name: &str,
        branch_name: &str,
        subnamespace: Option<&str>,
    ) -> Result<RunTestsResult, String> {
        let mut arguments = json!({
            "projectContext": {
                "projectName": project_name,
                "branchName": branch_name
            }
        });

        // Add optional subnamespace
        if let Some(ns) = subnamespace {
            arguments["subnamespace"] = json!(ns);
        }

        let response = self.call_tool("run-tests", arguments)?;

        // Parse the response
        if let Some(error) = response.get("error") {
            return Ok(RunTestsResult {
                success: false,
                output: String::new(),
                errors: vec![error["message"]
                    .as_str()
                    .unwrap_or("Unknown error")
                    .to_string()],
                test_results: vec![],
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

            // Parse the output to extract test results
            let (output, errors, test_results) = parse_run_tests_output(&raw_output, is_error);

            Ok(RunTestsResult {
                success: !is_error && errors.is_empty(),
                output,
                errors,
                test_results,
            })
        } else {
            Err("Invalid MCP response: missing result".to_string())
        }
    }

    /// Run an IO function
    ///
    /// This calls the "run" MCP tool to execute a function that has IO and Exception abilities.
    /// The function must already be saved in the codebase.
    pub fn run_function(
        &mut self,
        function_name: &str,
        project_name: &str,
        branch_name: &str,
        args: Vec<String>,
    ) -> Result<RunFunctionResult, String> {
        let arguments = json!({
            "projectContext": {
                "projectName": project_name,
                "branchName": branch_name
            },
            "mainFunctionName": function_name,
            "args": args
        });

        let response = self.call_tool("run", arguments)?;

        // Parse the response
        if let Some(error) = response.get("error") {
            return Ok(RunFunctionResult {
                success: false,
                stdout: String::new(),
                stderr: String::new(),
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

            // Parse the output to extract stdout, stderr, errors
            let (stdout, stderr, output, errors) = parse_run_function_output(&raw_output, is_error);

            Ok(RunFunctionResult {
                success: !is_error && errors.is_empty(),
                stdout,
                stderr,
                output,
                errors,
            })
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

/// Parse UCM's typecheck output to extract watch expression results and test results
/// Watch format: "  1 | > 1 + 2\n        ⧩\n        3"
/// Test format: "  4 | test> square.tests.ex1 = ..." followed by "✅ Passed Passed (cached)"
fn parse_typecheck_output(raw_output: &str, is_error: bool) -> (String, Vec<String>, Vec<WatchResult>, Vec<TestResult>) {
    let mut errors: Vec<String> = Vec::new();
    let mut watch_results: Vec<WatchResult> = Vec::new();
    let mut test_results: Vec<TestResult> = Vec::new();
    let mut messages: Vec<String> = Vec::new();

    // Try to parse as JSON
    if let Ok(json) = serde_json::from_str::<Value>(raw_output) {
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

        // Extract output messages and parse watch expressions and test results
        if let Some(output_msgs) = json.get("outputMessages").and_then(|v| v.as_array()) {
            // First pass: collect all lines from all messages
            let mut all_lines: Vec<String> = Vec::new();
            for msg in output_msgs {
                if let Some(s) = msg.as_str() {
                    // Split multi-line messages into individual lines
                    for line in s.lines() {
                        all_lines.push(line.to_string());
                    }
                }
            }

            // Second pass: parse lines sequentially, tracking test names and watch expressions
            let mut pending_test_name: Option<String> = None;
            let mut pending_watch: Option<(usize, String)> = None; // (line_number, expression)

            for line in &all_lines {
                let s = line.as_str();

                // Check if this is a test definition line: "  4 | test> square.tests.ex1 = ..."
                if s.contains(" | test>") {
                    if let Some(idx) = s.find("test>") {
                        let after_test = s[idx + 5..].trim();
                        let name = after_test.split('=').next().unwrap_or("").trim().to_string();
                        if !name.is_empty() {
                            pending_test_name = Some(name);
                        }
                    }
                    continue;
                }

                // Check if this is a test result line (comes after definition)
                if (s.contains("✅") || s.contains("◉")) && s.contains("Passed") {
                    let name = pending_test_name.take().unwrap_or_else(|| "test".to_string());
                    // Deduplicate - only add if not already present
                    if !test_results.iter().any(|t: &TestResult| t.name == name) {
                        test_results.push(TestResult {
                            name,
                            passed: true,
                            message: "Passed".to_string(),
                        });
                    }
                    continue;
                }

                // Check for failing test
                if s.contains("🚫") || (s.contains("FAILED") && !s.contains("0 failed")) {
                    let name = pending_test_name.take().unwrap_or_else(|| "test".to_string());
                    // Deduplicate - only add if not already present
                    if !test_results.iter().any(|t: &TestResult| t.name == name) {
                        test_results.push(TestResult {
                            name,
                            passed: false,
                            message: s.to_string(),
                        });
                    }
                    continue;
                }

                // Check if this is a watch expression line: "  12 | > square 4"
                if s.contains(" | ") && s.contains("> ") && !s.contains("test>") {
                    // Parse line number and expression
                    let parts: Vec<&str> = s.splitn(2, '|').collect();
                    if parts.len() == 2 {
                        let line_num: usize = parts[0].trim().parse().unwrap_or(0);
                        let expr_part = parts[1].trim();
                        let expression = if expr_part.starts_with("> ") {
                            expr_part[2..].to_string()
                        } else if expr_part.starts_with(">") {
                            expr_part[1..].trim().to_string()
                        } else {
                            String::new()
                        };
                        if line_num > 0 && !expression.is_empty() {
                            pending_watch = Some((line_num, expression));
                        }
                    }
                    continue;
                }

                // Check if this is the ⧩ arrow (watch result follows)
                if s.contains('⧩') {
                    // Result will be on the next line(s)
                    continue;
                }

                // Check if this is a watch result value (comes after ⧩)
                if let Some((line_num, expression)) = pending_watch.take() {
                    let result_val = s.trim().to_string();
                    if !result_val.is_empty() && !result_val.contains(" | ") {
                        // Deduplicate
                        if !watch_results.iter().any(|w: &WatchResult| w.line_number == line_num) {
                            watch_results.push(WatchResult {
                                expression,
                                result: result_val,
                                line_number: line_num,
                            });
                        }
                    } else {
                        // Put back if not a result value
                        pending_watch = Some((line_num, expression));
                    }
                    continue;
                }
            }
        }

        // If we have errors, return them
        if !errors.is_empty() {
            return (errors.join("\n"), errors, watch_results, test_results);
        }

        // Build output message
        let output = if !test_results.is_empty() {
            // Format test results
            test_results
                .iter()
                .map(|t| {
                    if t.passed {
                        format!("✅ {}", t.name)
                    } else {
                        format!("🚫 {}\n{}", t.name, t.message)
                    }
                })
                .collect::<Vec<_>>()
                .join("\n")
        } else if !watch_results.is_empty() {
            watch_results
                .iter()
                .map(|w| format!("> {}\n⇒ {}", w.expression, w.result))
                .collect::<Vec<_>>()
                .join("\n\n")
        } else if !messages.is_empty() {
            messages.join("\n")
        } else {
            "Code typechecks successfully".to_string()
        };

        (output, vec![], watch_results, test_results)
    } else {
        // Not JSON, return as-is
        if is_error {
            (raw_output.to_string(), vec![raw_output.to_string()], vec![], vec![])
        } else {
            (raw_output.to_string(), vec![], vec![], vec![])
        }
    }
}

/// Parse a test result from UCM output
/// Formats from typecheck-code:
/// - "  4 | test> square.tests.ex1 = check (...)" followed by "✅ Passed Passed (cached)"
/// - "🚫 FAILED square.tests.ex1" followed by error details
/// The test name is in the "N | test> name = ..." line, not in the result line
fn parse_test_result(s: &str) -> Option<TestResult> {
    let trimmed = s.trim();

    // First, check if this is a test definition line: "  4 | test> square.tests.ex1 = ..."
    // We'll extract the name from here
    if trimmed.contains(" | test>") {
        // Extract test name from format: "  4 | test> square.tests.ex1 = check (...)"
        if let Some(idx) = trimmed.find("test>") {
            let after_test = trimmed[idx + 5..].trim();
            // Get the name before the "="
            let name = after_test.split('=').next().unwrap_or("").trim().to_string();
            if !name.is_empty() {
                // This is just the definition line, we'll need the next message for pass/fail
                // Return None here - we'll handle this differently
                return None;
            }
        }
    }

    // Check for passing test result line
    // Format: "✅ Passed Passed (cached)" or "✅ Passed"
    if (trimmed.contains("✅") || trimmed.contains("◉")) && trimmed.contains("Passed") {
        // This is a result line - name should have been captured from the definition line
        // Return a placeholder that will be matched with the definition
        return Some(TestResult {
            name: "_pending_".to_string(), // Will be replaced with actual name
            passed: true,
            message: "Passed".to_string(),
        });
    }

    // Check for failing test
    // Format: "🚫 FAILED" or "🚫 FAILED testName"
    if trimmed.contains("🚫") || (trimmed.contains("FAILED") && !trimmed.contains("0 failed")) {
        return Some(TestResult {
            name: "_pending_".to_string(), // Will be replaced with actual name
            passed: false,
            message: "Failed".to_string(),
        });
    }

    None
}

/// Parse a single watch expression result from UCM output
/// Format: "  1 | > 1 + 2\n        ⧩\n        3"
fn parse_watch_result(s: &str) -> Option<WatchResult> {
    let lines: Vec<&str> = s.lines().collect();

    // Find the line with the expression (contains " | > ")
    let mut line_number = 0;
    let mut expression = String::new();
    let mut result = String::new();

    for (i, line) in lines.iter().enumerate() {
        if line.contains(" | ") && line.contains("> ") {
            // Parse line number and expression
            // Format: "  1 | > 1 + 2"
            let parts: Vec<&str> = line.splitn(2, '|').collect();
            if parts.len() == 2 {
                line_number = parts[0].trim().parse().unwrap_or(0);
                let expr_part = parts[1].trim();
                // Remove the leading "> "
                if expr_part.starts_with("> ") {
                    expression = expr_part[2..].to_string();
                } else if expr_part.starts_with(">") {
                    expression = expr_part[1..].trim().to_string();
                }
            }
        } else if line.contains('⧩') {
            // The next non-empty line(s) after ⧩ contain the result
            for j in (i + 1)..lines.len() {
                let result_line = lines[j].trim();
                if !result_line.is_empty() {
                    if !result.is_empty() {
                        result.push('\n');
                    }
                    result.push_str(result_line);
                }
            }
            break;
        }
    }

    if line_number > 0 && !expression.is_empty() {
        Some(WatchResult {
            expression,
            result,
            line_number,
        })
    } else {
        None
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

/// Parse the output from run-tests MCP tool
/// Format: "1. myPassingTest ✓ passing\n2. myFailingTest ✗ failing"
/// Or JSON with outputMessages containing test results
fn parse_run_tests_output(raw_output: &str, is_error: bool) -> (String, Vec<String>, Vec<TestResult>) {
    let mut errors = Vec::new();
    let mut test_results = Vec::new();
    let mut messages = Vec::new();

    // Try to parse as JSON first
    if let Ok(json) = serde_json::from_str::<Value>(raw_output) {
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

        // Extract output messages and parse test results
        if let Some(output_msgs) = json.get("outputMessages").and_then(|v| v.as_array()) {
            for msg in output_msgs {
                if let Some(s) = msg.as_str() {
                    // Check for test result patterns
                    // Format: "1. testName ✓ passing" or "2. testName ✗ failing"
                    if s.contains("✓") || s.contains("passing") {
                        if let Some(test) = parse_run_tests_line(s, true) {
                            test_results.push(test);
                        }
                    } else if s.contains("✗") || s.contains("failing") {
                        if let Some(test) = parse_run_tests_line(s, false) {
                            test_results.push(test);
                        }
                    } else if !s.is_empty()
                        && !s.contains("Loading")
                        && s != "Done."
                    {
                        messages.push(s.to_string());
                    }
                }
            }
        }

        // If we have errors, return them
        if !errors.is_empty() {
            return (errors.join("\n"), errors, test_results);
        }

        // Build output message
        let output = if !test_results.is_empty() {
            test_results
                .iter()
                .map(|t| {
                    if t.passed {
                        format!("✅ {} - Passed", t.name)
                    } else {
                        format!("🚫 {} - FAILED\n{}", t.name, t.message)
                    }
                })
                .collect::<Vec<_>>()
                .join("\n")
        } else if !messages.is_empty() {
            messages.join("\n")
        } else {
            "No tests found".to_string()
        };

        (output, vec![], test_results)
    } else {
        // Not JSON - try to parse as plain text test results
        // Format: "1. testName ✓ passing\n2. testName ✗ failing"
        for line in raw_output.lines() {
            let trimmed = line.trim();
            if trimmed.contains("✓") || trimmed.contains("passing") {
                if let Some(test) = parse_run_tests_line(trimmed, true) {
                    test_results.push(test);
                }
            } else if trimmed.contains("✗") || trimmed.contains("failing") {
                if let Some(test) = parse_run_tests_line(trimmed, false) {
                    test_results.push(test);
                }
            }
        }

        if !test_results.is_empty() {
            let output = test_results
                .iter()
                .map(|t| {
                    if t.passed {
                        format!("✅ {} - Passed", t.name)
                    } else {
                        format!("🚫 {} - FAILED", t.name)
                    }
                })
                .collect::<Vec<_>>()
                .join("\n");
            (output, vec![], test_results)
        } else if is_error {
            (raw_output.to_string(), vec![raw_output.to_string()], vec![])
        } else {
            (raw_output.to_string(), vec![], vec![])
        }
    }
}

/// Parse a single line from run-tests output
/// Format: "1. testName ✓ passing" or "2. testName ✗ failing"
fn parse_run_tests_line(line: &str, passed: bool) -> Option<TestResult> {
    // Remove leading number and dot: "1. testName ✓ passing" -> "testName ✓ passing"
    let trimmed = line.trim();

    // Find the test name - it's between the number prefix and the status indicator
    let without_number = if trimmed.chars().next()?.is_digit(10) {
        // Skip "N. " prefix
        trimmed.splitn(2, ". ").nth(1).unwrap_or(trimmed)
    } else {
        trimmed
    };

    // Extract the test name (before ✓/✗ or passing/failing)
    let name = without_number
        .split(|c| c == '✓' || c == '✗')
        .next()
        .unwrap_or(without_number)
        .split("passing")
        .next()
        .unwrap_or(without_number)
        .split("failing")
        .next()
        .unwrap_or(without_number)
        .trim()
        .to_string();

    if name.is_empty() {
        return None;
    }

    Some(TestResult {
        name,
        passed,
        message: if passed { "Passed".to_string() } else { "Failed".to_string() },
    })
}

/// Parse the output from the run MCP tool
/// The MCP run tool returns JSON with stdout, stderr, outputMessages, errorMessages
fn parse_run_function_output(raw_output: &str, is_error: bool) -> (String, String, String, Vec<String>) {
    let mut stdout = String::new();
    let mut stderr = String::new();
    let mut errors = Vec::new();
    let mut output_messages = Vec::new();

    // Try to parse as JSON first
    if let Ok(json) = serde_json::from_str::<Value>(raw_output) {
        // Extract stdout
        if let Some(s) = json.get("stdout").and_then(|v| v.as_str()) {
            stdout = s.to_string();
        }

        // Extract stderr
        if let Some(s) = json.get("stderr").and_then(|v| v.as_str()) {
            stderr = s.to_string();
        }

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
                    if !s.is_empty() && !s.contains("Loading") && s != "Done." {
                        output_messages.push(s.to_string());
                    }
                }
            }
        }

        // Build combined output
        let output = if !stdout.is_empty() {
            stdout.clone()
        } else if !output_messages.is_empty() {
            output_messages.join("\n")
        } else {
            "Function executed successfully".to_string()
        };

        (stdout, stderr, output, errors)
    } else {
        // Not JSON, return as-is
        if is_error {
            (String::new(), raw_output.to_string(), raw_output.to_string(), vec![raw_output.to_string()])
        } else {
            (raw_output.to_string(), String::new(), raw_output.to_string(), vec![])
        }
    }
}
