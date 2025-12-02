//! UCM PTY Manager - Spawns and manages UCM with pseudo-terminal for interactive use
//!
//! This module provides:
//! - PTY-based UCM spawning for full terminal emulation
//! - Bidirectional communication (read/write)
//! - Context detection by parsing UCM prompt
//! - Event emission for output and context changes
//! - Dynamic port allocation for API and LSP servers

use crate::port_utils::find_available_port;
use parking_lot::Mutex;
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::sync::Arc;
use std::thread;
use tauri::{AppHandle, Emitter};

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

/// UCM PTY Manager - manages a UCM process with PTY
pub struct UCMPtyManager {
    /// Writer to send input to PTY
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    /// Master PTY handle for resize operations
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    /// Current detected context
    current_context: Arc<Mutex<UCMContext>>,
    /// Flag to signal reader thread to stop
    running: Arc<Mutex<bool>>,
    /// Allocated ports for this UCM instance
    #[allow(dead_code)]
    ports: UCMPorts,
}

impl UCMPtyManager {
    /// Spawn UCM with PTY and start reading output
    ///
    /// # Arguments
    /// * `app_handle` - Tauri app handle for emitting events
    /// * `cwd` - Optional working directory for UCM (for file loading)
    ///
    /// # Returns
    /// A tuple of (UCMPtyManager, UCMPorts) with the manager and allocated ports
    pub fn spawn(app_handle: AppHandle, cwd: Option<String>) -> Result<(Self, UCMPorts), String> {
        // Find available port for API server
        // Note: UCM's LSP port is hardcoded at 5757 and cannot be configured
        let api_port = find_available_port(5858)
            .ok_or("Could not find available port for UCM API server")?;

        // LSP port is hardcoded in UCM at 5757 - we cannot change it
        let lsp_port: u16 = 5757;

        log::info!("Allocating UCM ports - API: {}, LSP: {} (hardcoded)", api_port, lsp_port);

        let ports = UCMPorts { api_port, lsp_port };

        // Create PTY system
        let pty_system = native_pty_system();

        // Configure PTY size (standard terminal size)
        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to open PTY: {}", e))?;

        // Build command for UCM with explicit port configuration
        let mut cmd = CommandBuilder::new("ucm");

        // Pass port argument to UCM for the codebase server (HTTP API)
        // Note: UCM uses --port for the codebase server, LSP port is hardcoded at 5757
        cmd.arg("--port");
        cmd.arg(api_port.to_string());

        // Set PATH environment variable to include common installation locations
        // GUI apps on macOS don't inherit the user's shell PATH, so we need to set it explicitly
        let path_additions = vec![
            "/opt/homebrew/bin",      // Homebrew on Apple Silicon
            "/usr/local/bin",         // Homebrew on Intel / common install location
            "/usr/bin",
            "/bin",
            "/usr/sbin",
            "/sbin",
        ];

        // Also include user's home directory bin locations
        let mut all_paths = path_additions.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        if let Some(home) = dirs::home_dir() {
            all_paths.insert(0, format!("{}/.local/bin", home.display()));
            all_paths.insert(0, format!("{}/bin", home.display()));
        }

        // Get existing PATH and append our additions
        let existing_path = std::env::var("PATH").unwrap_or_default();
        let new_path = if existing_path.is_empty() {
            all_paths.join(":")
        } else {
            format!("{}:{}", all_paths.join(":"), existing_path)
        };

        log::info!("Setting UCM PATH to: {}", new_path);
        cmd.env("PATH", new_path);

        // Set TERM environment variable for proper terminal emulation
        // This is required for 'less' (used by UCM for paging) to work properly
        // Without this, 'less' shows "WARNING: terminal is not fully functional"
        cmd.env("TERM", "xterm-256color");

        // Set locale to UTF-8 to fix emoji and special character encoding
        // Without this, emoji show as hex bytes like <F0><9F><93><9A>
        cmd.env("LANG", "en_US.UTF-8");
        cmd.env("LC_ALL", "en_US.UTF-8");

        // Enable truecolor support for rich terminal colors
        cmd.env("COLORTERM", "truecolor");

        // Tell ncurses/terminfo where to find terminal capability definitions
        // macOS GUI apps don't have this set, causing "terminal is not fully functional"
        cmd.env(
            "TERMINFO_DIRS",
            "/usr/share/terminfo:/lib/terminfo:/etc/terminfo",
        );

        // Ensure HOME is set - macOS GUI apps often don't have this set
        // Always set it from dirs::home_dir() for consistency
        if let Some(home) = dirs::home_dir() {
            cmd.env("HOME", home.to_string_lossy().to_string());
        }

        // Force color output - some tools check these in addition to TERM/COLORTERM
        cmd.env("CLICOLOR", "1");
        cmd.env("CLICOLOR_FORCE", "1");
        // Force ANSI colors in some Haskell programs (which UCM is built with)
        cmd.env("FORCE_COLOR", "1");
        // Additional environment variables for Haskell/GHC programs
        // These help convince the Haskell runtime that it's running in a color-capable terminal
        cmd.env("ANSICON", "1");  // Windows compatibility flag that some tools check
        cmd.env("ConEmuANSI", "ON");  // ConEmu compatibility
        // Tell UCM specifically to use colors (if it respects this)
        cmd.env("UCM_COLOR", "always");
        cmd.env("NO_COLOR", "");  // Explicitly unset NO_COLOR to ensure colors are enabled

        // Set working directory if provided, otherwise use home directory
        if let Some(dir) = cwd {
            log::info!("Setting UCM working directory to: {}", dir);
            cmd.cwd(&dir);
        } else if let Some(home) = dirs::home_dir() {
            log::info!("Setting UCM working directory to home: {:?}", home);
            cmd.cwd(home);
        }

        // Spawn UCM in the PTY
        let _child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn UCM: {}", e))?;

        // Get the master PTY - we need to keep this for resize operations
        let master = pair.master;

        // Get writer for sending input
        let writer = master
            .take_writer()
            .map_err(|e| format!("Failed to get PTY writer: {}", e))?;

        // Get reader for receiving output
        let mut reader = master
            .try_clone_reader()
            .map_err(|e| format!("Failed to get PTY reader: {}", e))?;

        let current_context = Arc::new(Mutex::new(UCMContext::default()));
        let running = Arc::new(Mutex::new(true));

        // Clone for reader thread
        let context_clone = current_context.clone();
        let running_clone = running.clone();
        let app_handle_clone = app_handle.clone();

        // Spawn reader thread to emit output events
        thread::spawn(move || {
            let mut buffer = [0u8; 4096];
            let mut line_buffer = String::new();

            loop {
                // Check if we should stop
                if !*running_clone.lock() {
                    break;
                }

                match reader.read(&mut buffer) {
                    Ok(0) => {
                        // EOF - UCM exited
                        log::info!("UCM PTY EOF - process exited");
                        break;
                    }
                    Ok(n) => {
                        let output = &buffer[..n];

                        // Emit output event for terminal display
                        if let Err(e) = app_handle_clone.emit("ucm-pty-output", output.to_vec()) {
                            log::error!("Failed to emit ucm-pty-output: {}", e);
                        }

                        // Also accumulate for prompt parsing
                        if let Ok(text) = std::str::from_utf8(output) {
                            line_buffer.push_str(text);

                            // Check for file lock error (UCM cannot start if another instance is using this codebase)
                            if line_buffer.contains("Failed to obtain a file lock") {
                                log::warn!("UCM file lock error detected - another UCM is using this codebase");
                                // Mark as not running immediately so retry can work
                                *running_clone.lock() = false;
                                if let Err(e) = app_handle_clone.emit("ucm-file-lock-error", ()) {
                                    log::error!("Failed to emit ucm-file-lock-error: {}", e);
                                }
                                // Break out of the loop - UCM is going to exit anyway
                                break;
                            }

                            // Check for prompt pattern and detect context changes
                            if let Some(new_context) = parse_ucm_prompt(&line_buffer) {
                                let mut ctx = context_clone.lock();
                                if ctx.project != new_context.project
                                    || ctx.branch != new_context.branch
                                {
                                    *ctx = new_context.clone();
                                    // Emit context change event
                                    if let Err(e) =
                                        app_handle_clone.emit("ucm-context-changed", new_context)
                                    {
                                        log::error!("Failed to emit ucm-context-changed: {}", e);
                                    }
                                }
                            }

                            // Keep only recent output for prompt detection
                            if line_buffer.len() > 1024 {
                                line_buffer = line_buffer[line_buffer.len() - 512..].to_string();
                            }
                        }
                    }
                    Err(e) => {
                        log::error!("PTY read error: {}", e);
                        break;
                    }
                }
            }

            log::info!("UCM PTY reader thread exiting");
        });

        let manager = Self {
            writer: Arc::new(Mutex::new(writer)),
            master: Arc::new(Mutex::new(master)),
            current_context,
            running,
            ports: ports.clone(),
        };

        Ok((manager, ports))
    }

    /// Get the allocated ports for this UCM instance
    #[allow(dead_code)]
    pub fn get_ports(&self) -> UCMPorts {
        self.ports.clone()
    }

    /// Write data to UCM's stdin
    pub fn write(&self, data: &[u8]) -> Result<(), String> {
        let mut writer = self.writer.lock();
        writer
            .write_all(data)
            .map_err(|e| format!("Failed to write to PTY: {}", e))?;
        writer
            .flush()
            .map_err(|e| format!("Failed to flush PTY: {}", e))?;
        Ok(())
    }

    /// Send a switch command to UCM
    pub fn switch_context(&self, project: &str, branch: &str) -> Result<(), String> {
        let cmd = format!("switch {}/{}\n", project, branch);
        self.write(cmd.as_bytes())
    }

    /// Get current detected context
    pub fn get_context(&self) -> UCMContext {
        self.current_context.lock().clone()
    }

    /// Resize the PTY (called when terminal is resized)
    pub fn resize(&self, rows: u16, cols: u16) -> Result<(), String> {
        let master = self.master.lock();
        master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to resize PTY: {}", e))
    }

    /// Stop the PTY manager
    pub fn stop(&self) {
        *self.running.lock() = false;
    }

    /// Check if the PTY reader thread is still running
    /// This returns false if UCM has exited (e.g., due to file lock error)
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
/// UCM prompt format: "project/branch> " or "project/branch:path> "
fn parse_ucm_prompt(output: &str) -> Option<UCMContext> {
    // Look for the last prompt pattern in the output
    // UCM prompts look like: "myproject/main> " or "myproject/feature:lib> "

    // Find the last ">" which indicates end of prompt
    let lines: Vec<&str> = output.lines().collect();

    for line in lines.iter().rev() {
        let trimmed = line.trim();

        // Skip empty lines
        if trimmed.is_empty() {
            continue;
        }

        // Look for prompt pattern: ends with "> " or ">"
        if let Some(prompt_end) = trimmed.rfind('>') {
            let prompt_part = &trimmed[..prompt_end];

            // Remove any path suffix (after :)
            let context_part = if let Some(colon_idx) = prompt_part.find(':') {
                &prompt_part[..colon_idx]
            } else {
                prompt_part
            };

            // Split by / to get project and branch
            if let Some(slash_idx) = context_part.rfind('/') {
                let project = context_part[..slash_idx].trim();
                let branch = context_part[slash_idx + 1..].trim();

                // Validate - both should be non-empty and look like identifiers
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
