//! UCM PTY Manager - Spawns and manages UCM with pseudo-terminal for interactive use
//!
//! This module provides:
//! - PTY-based UCM spawning for full terminal emulation
//! - Non-blocking communication via channels (no hanging!)
//! - Context detection by parsing UCM prompt
//! - Event emission for output and context changes
//! - Dynamic port allocation for API and LSP servers

use crate::port_utils::find_available_port;
use parking_lot::Mutex;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;

/// Current UCM context (project and branch)
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct UCMContext {
    pub project: Option<String>,
    pub branch: Option<String>,
}

/// Ports allocated for UCM services
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UCMPorts {
    pub api_port: u16,
    pub lsp_port: u16,
}

/// UCM PTY Manager - manages a UCM process with PTY using channels for non-blocking I/O
pub struct UCMPtyManager {
    /// Channel to send input to PTY writer thread
    write_tx: mpsc::Sender<Vec<u8>>,
    /// Channel to send resize commands
    resize_tx: mpsc::Sender<(u16, u16)>,
    /// Current detected context
    current_context: Arc<Mutex<UCMContext>>,
    /// Flag to signal threads to stop
    running: Arc<Mutex<bool>>,
    /// Allocated ports for this UCM instance
    #[allow(dead_code)]
    ports: UCMPorts,
}

impl UCMPtyManager {
    /// Spawn UCM with PTY and start reading output via channels (non-blocking)
    ///
    /// # Arguments
    /// * `app_handle` - Tauri app handle for emitting events
    /// * `cwd` - Optional working directory for UCM (for file loading)
    ///
    /// # Returns
    /// A tuple of (UCMPtyManager, UCMPorts) with the manager and allocated ports
    pub async fn spawn(app_handle: AppHandle, cwd: Option<String>) -> Result<(Self, UCMPorts), String> {
        log::info!("UCM PTY spawn starting...");

        // Find available port for API server
        let api_port = find_available_port(5858)
            .ok_or("Could not find available port for UCM API server")?;

        // LSP port is hardcoded in UCM at 5757
        let lsp_port: u16 = 5757;

        log::info!("Allocating UCM ports - API: {}, LSP: {} (hardcoded)", api_port, lsp_port);

        let ports = UCMPorts { api_port, lsp_port };

        // Create PTY system
        let pty_system = native_pty_system();

        // Configure PTY size
        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to open PTY: {}", e))?;

        log::info!("PTY created successfully");

        // Build command for UCM
        let mut cmd = CommandBuilder::new("ucm");
        cmd.arg("--port");
        cmd.arg(api_port.to_string());

        // Set PATH for GUI apps on macOS
        let path_additions = vec![
            "/opt/homebrew/bin",
            "/usr/local/bin",
            "/usr/bin",
            "/bin",
            "/usr/sbin",
            "/sbin",
        ];

        let mut all_paths = path_additions.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        if let Some(home) = dirs::home_dir() {
            all_paths.insert(0, format!("{}/.local/bin", home.display()));
            all_paths.insert(0, format!("{}/bin", home.display()));
        }

        let existing_path = std::env::var("PATH").unwrap_or_default();
        let new_path = if existing_path.is_empty() {
            all_paths.join(":")
        } else {
            format!("{}:{}", all_paths.join(":"), existing_path)
        };

        cmd.env("PATH", new_path);
        cmd.env("TERM", "xterm-256color");
        cmd.env("LANG", "en_US.UTF-8");
        cmd.env("LC_ALL", "en_US.UTF-8");
        cmd.env("COLORTERM", "truecolor");
        cmd.env("TERMINFO_DIRS", "/usr/share/terminfo:/lib/terminfo:/etc/terminfo");

        if let Some(home) = dirs::home_dir() {
            cmd.env("HOME", home.to_string_lossy().to_string());
        }

        cmd.env("CLICOLOR", "1");
        cmd.env("CLICOLOR_FORCE", "1");
        cmd.env("FORCE_COLOR", "1");
        cmd.env("UCM_COLOR", "always");
        cmd.env("NO_COLOR", "");

        // Set working directory
        if let Some(dir) = cwd {
            log::info!("Setting UCM working directory to: {}", dir);
            cmd.cwd(&dir);
        } else if let Some(home) = dirs::home_dir() {
            cmd.cwd(home);
        }

        // Spawn UCM in the PTY
        let _child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn UCM: {}", e))?;

        log::info!("UCM process spawned successfully");

        let master = pair.master;
        let writer = master
            .take_writer()
            .map_err(|e| format!("Failed to get PTY writer: {}", e))?;
        let mut reader = master
            .try_clone_reader()
            .map_err(|e| format!("Failed to get PTY reader: {}", e))?;

        let current_context = Arc::new(Mutex::new(UCMContext::default()));
        let running = Arc::new(Mutex::new(true));
        let master = Arc::new(Mutex::new(master));

        // Create channels for non-blocking communication
        let (write_tx, mut write_rx) = mpsc::channel::<Vec<u8>>(100);
        let (resize_tx, mut resize_rx) = mpsc::channel::<(u16, u16)>(10);

        // Writer thread - handles writes and resizes via channels
        let writer = Arc::new(Mutex::new(writer));
        let writer_clone = writer.clone();
        let master_clone = master.clone();
        let running_writer = running.clone();

        tokio::spawn(async move {
            loop {
                tokio::select! {
                    Some(data) = write_rx.recv() => {
                        let mut w = writer_clone.lock();
                        if let Err(e) = w.write_all(&data) {
                            log::error!("PTY write error: {}", e);
                        }
                        let _ = w.flush();
                    }
                    Some((rows, cols)) = resize_rx.recv() => {
                        let m = master_clone.lock();
                        if let Err(e) = m.resize(PtySize {
                            rows,
                            cols,
                            pixel_width: 0,
                            pixel_height: 0,
                        }) {
                            log::error!("PTY resize error: {}", e);
                        } else {
                            log::debug!("PTY resized to {}x{}", cols, rows);
                        }
                    }
                    else => {
                        if !*running_writer.lock() {
                            break;
                        }
                        tokio::time::sleep(Duration::from_millis(10)).await;
                    }
                }
            }
            log::info!("UCM PTY writer task exiting");
        });

        // Reader thread - reads output and emits events
        let context_clone = current_context.clone();
        let running_clone = running.clone();
        let app_handle_clone = app_handle.clone();

        thread::spawn(move || {
            // Larger buffer for better throughput during heavy output (e.g., run commands)
            let mut buffer = [0u8; 32768];
            let mut line_buffer = String::new();
            let mut reads_since_parse = 0u32;

            loop {
                if !*running_clone.lock() {
                    break;
                }

                match reader.read(&mut buffer) {
                    Ok(0) => {
                        // EOF - UCM exited (user typed 'exit' or process terminated)
                        log::info!("UCM PTY EOF - process exited");
                        *running_clone.lock() = false;
                        // Notify frontend that UCM has exited
                        let _ = app_handle_clone.emit("ucm-process-exited", ());
                        break;
                    }
                    Ok(n) => {
                        let output = &buffer[..n];

                        // Emit output event immediately - don't block on parsing
                        if let Err(e) = app_handle_clone.emit("ucm-pty-output", output.to_vec()) {
                            log::error!("Failed to emit ucm-pty-output: {}", e);
                        }

                        // Only parse occasionally to reduce overhead during heavy output
                        reads_since_parse += 1;
                        let should_parse = reads_since_parse >= 5 || n < 1000;

                        if should_parse {
                            reads_since_parse = 0;

                            // Parse for context changes and errors
                            if let Ok(text) = std::str::from_utf8(output) {
                                line_buffer.push_str(text);

                                // Check for file lock error
                                if line_buffer.contains("Failed to obtain a file lock") {
                                    log::warn!("UCM file lock error detected");
                                    *running_clone.lock() = false;
                                    let _ = app_handle_clone.emit("ucm-file-lock-error", ());
                                    break;
                                }

                                // Check for context changes (only when we see a prompt indicator)
                                if line_buffer.contains('>') {
                                    if let Some(new_context) = parse_ucm_prompt(&line_buffer) {
                                        let mut ctx = context_clone.lock();
                                        if ctx.project != new_context.project || ctx.branch != new_context.branch {
                                            *ctx = new_context.clone();
                                            let _ = app_handle_clone.emit("ucm-context-changed", new_context);
                                        }
                                    }
                                }

                                // Trim buffer
                                if line_buffer.len() > 1024 {
                                    line_buffer = line_buffer[line_buffer.len() - 512..].to_string();
                                }
                            }
                        }
                    }
                    Err(e) => {
                        // Check if it's a would-block error (expected for non-blocking)
                        if e.kind() == std::io::ErrorKind::WouldBlock {
                            thread::sleep(Duration::from_millis(10));
                            continue;
                        }
                        // Other errors - UCM likely crashed or was killed
                        log::error!("PTY read error: {}", e);
                        *running_clone.lock() = false;
                        let _ = app_handle_clone.emit("ucm-process-exited", ());
                        break;
                    }
                }
            }

            log::info!("UCM PTY reader thread exiting");
        });

        let manager = Self {
            write_tx,
            resize_tx,
            current_context,
            running,
            ports: ports.clone(),
        };

        log::info!("UCM PTY spawn completed successfully");
        Ok((manager, ports))
    }

    /// Write data to UCM's stdin (async, via channel)
    pub async fn write(&self, data: &[u8]) -> Result<(), String> {
        self.write_tx
            .send(data.to_vec())
            .await
            .map_err(|e| format!("Failed to send write to PTY: {}", e))
    }

    /// Send a switch command to UCM
    pub async fn switch_context(&self, project: &str, branch: &str) -> Result<(), String> {
        let cmd = format!("switch {}/{}\n", project, branch);
        self.write(cmd.as_bytes()).await
    }

    /// Get current detected context
    pub fn get_context(&self) -> UCMContext {
        self.current_context.lock().clone()
    }

    /// Resize the PTY (async, via channel)
    pub async fn resize(&self, rows: u16, cols: u16) -> Result<(), String> {
        self.resize_tx
            .send((rows, cols))
            .await
            .map_err(|e| format!("Failed to send resize to PTY: {}", e))
    }

    /// Stop the PTY manager
    pub fn stop(&self) {
        *self.running.lock() = false;
    }

    /// Check if the PTY is still running
    pub fn is_running(&self) -> bool {
        *self.running.lock()
    }
}

impl Drop for UCMPtyManager {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Parse UCM prompt to extract project and branch
fn parse_ucm_prompt(output: &str) -> Option<UCMContext> {
    let lines: Vec<&str> = output.lines().collect();

    for line in lines.iter().rev() {
        let trimmed = line.trim();

        if trimmed.is_empty() {
            continue;
        }

        if let Some(prompt_end) = trimmed.rfind('>') {
            let prompt_part = &trimmed[..prompt_end];

            let context_part = if let Some(colon_idx) = prompt_part.find(':') {
                &prompt_part[..colon_idx]
            } else {
                prompt_part
            };

            if let Some(slash_idx) = context_part.rfind('/') {
                let project = context_part[..slash_idx].trim();
                let branch = context_part[slash_idx + 1..].trim();

                if !project.is_empty()
                    && !branch.is_empty()
                    && !project.contains(' ')
                    && !branch.contains(' ')
                {
                    return Some(UCMContext {
                        project: Some(project.to_string()),
                        branch: Some(branch.to_string()),
                    });
                }
            }
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_ucm_prompt_basic() {
        let output = "tour/main> ";
        let ctx = parse_ucm_prompt(output).unwrap();
        assert_eq!(ctx.project, Some("tour".to_string()));
        assert_eq!(ctx.branch, Some("main".to_string()));
    }

    #[test]
    fn test_parse_ucm_prompt_with_path() {
        let output = "myproject/feature:lib.utils> ";
        let ctx = parse_ucm_prompt(output).unwrap();
        assert_eq!(ctx.project, Some("myproject".to_string()));
        assert_eq!(ctx.branch, Some("feature".to_string()));
    }

    #[test]
    fn test_parse_ucm_prompt_multiline() {
        let output = "Some output here\nMore output\nconveynow/main> ";
        let ctx = parse_ucm_prompt(output).unwrap();
        assert_eq!(ctx.project, Some("conveynow".to_string()));
        assert_eq!(ctx.branch, Some("main".to_string()));
    }

    #[test]
    fn test_parse_ucm_prompt_no_match() {
        let output = "Just some text without a prompt";
        assert!(parse_ucm_prompt(output).is_none());
    }
}
