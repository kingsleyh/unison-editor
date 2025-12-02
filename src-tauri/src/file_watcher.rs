//! File Watcher Module - Watches files for external changes
//!
//! This module provides per-file watching with fast event delivery.
//! When a watched file changes, it emits a Tauri event to the frontend.
//!
//! Uses PollWatcher for predictable, fast detection across all platforms.

use notify::{Config, Event, PollWatcher, RecursiveMode, Watcher};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

/// Event payload sent to frontend when a file changes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileChangeEvent {
    pub path: String,
    #[serde(rename = "changeType")]
    pub change_type: String,
    /// Timestamp when the change was detected (milliseconds since epoch)
    #[serde(rename = "detectedAt")]
    pub detected_at: u64,
}

/// File Watcher Manager - manages watched files and emits change events
pub struct FileWatcherManager {
    watched_paths: Arc<Mutex<HashSet<PathBuf>>>,
    watcher: Arc<Mutex<Option<PollWatcher>>>,
    app_handle: Arc<Mutex<Option<AppHandle>>>,
    // Track last event time per path to debounce duplicates
    last_event_times: Arc<Mutex<HashMap<PathBuf, u64>>>,
}

impl FileWatcherManager {
    pub fn new() -> Self {
        Self {
            watched_paths: Arc::new(Mutex::new(HashSet::new())),
            watcher: Arc::new(Mutex::new(None)),
            app_handle: Arc::new(Mutex::new(None)),
            last_event_times: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Initialize the file watcher with a Tauri app handle for event emission
    pub fn initialize(&self, app_handle: AppHandle) -> Result<(), String> {
        let mut handle_guard = self.app_handle.lock();
        if handle_guard.is_some() {
            // Already initialized
            return Ok(());
        }
        *handle_guard = Some(app_handle.clone());
        drop(handle_guard);

        let watched_paths = self.watched_paths.clone();
        let app_handle_for_callback = app_handle.clone();
        let last_event_times = self.last_event_times.clone();

        // Use PollWatcher with 500ms interval for fast, predictable detection
        // This is more reliable than FSEvents on macOS which can have unpredictable delays
        let config = Config::default()
            .with_poll_interval(Duration::from_millis(500))
            .with_compare_contents(true); // Compare file contents to detect changes

        let watcher = PollWatcher::new(
            move |result: Result<Event, notify::Error>| {
                let now_ms = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64;

                match result {
                    Ok(event) => {
                        // Determine the change type based on the event kind
                        let change_type = if event.kind.is_remove() {
                            "deleted"
                        } else if event.kind.is_modify() || event.kind.is_create() {
                            "modified"
                        } else {
                            // Ignore other event types (access, etc.)
                            return;
                        };

                        let paths = watched_paths.lock();
                        let mut last_times = last_event_times.lock();

                        for path in &event.paths {
                            // Only emit for files we're actually watching
                            if paths.contains(path) {
                                // Debounce: skip if we emitted for this path within last 100ms
                                // (but don't debounce delete events)
                                if change_type != "deleted" {
                                    if let Some(&last_time) = last_times.get(path) {
                                        if now_ms - last_time < 100 {
                                            log::debug!("[FileWatcher] Skipping duplicate event for {} ({}ms since last)", path.display(), now_ms - last_time);
                                            continue;
                                        }
                                    }
                                }
                                last_times.insert(path.clone(), now_ms);

                                let change_event = FileChangeEvent {
                                    path: path.to_string_lossy().to_string(),
                                    change_type: change_type.to_string(),
                                    detected_at: now_ms,
                                };

                                log::info!(
                                    "[FileWatcher] File {} detected at {}ms, path: {}, event kind: {:?}",
                                    change_type,
                                    now_ms,
                                    path.display(),
                                    event.kind
                                );

                                if let Err(e) = app_handle_for_callback.emit("file-changed", change_event) {
                                    log::error!("[FileWatcher] Failed to emit file-changed event: {}", e);
                                }
                            }
                        }
                    }
                    Err(e) => log::error!("[FileWatcher] File watcher error: {:?}", e),
                }
            },
            config,
        ).map_err(|e| format!("Failed to create file watcher: {}", e))?;

        *self.watcher.lock() = Some(watcher);
        log::info!("[FileWatcher] File watcher initialized with 500ms poll interval");
        Ok(())
    }

    /// Start watching a file for changes
    pub fn watch_file(&self, path: &str) -> Result<(), String> {
        let path_buf = PathBuf::from(path);

        // Check if already watching
        {
            let mut paths = self.watched_paths.lock();
            if paths.contains(&path_buf) {
                return Ok(());
            }
            paths.insert(path_buf.clone());
        }

        // Add to watcher
        let mut watcher_guard = self.watcher.lock();
        if let Some(ref mut watcher) = *watcher_guard {
            watcher
                .watch(&path_buf, RecursiveMode::NonRecursive)
                .map_err(|e| format!("Failed to watch file '{}': {}", path, e))?;
            log::info!("[FileWatcher] Started watching file: {}", path);
        } else {
            return Err("File watcher not initialized".to_string());
        }
        Ok(())
    }

    /// Stop watching a file
    pub fn unwatch_file(&self, path: &str) -> Result<(), String> {
        let path_buf = PathBuf::from(path);

        // Remove from tracked paths
        {
            let mut paths = self.watched_paths.lock();
            if !paths.remove(&path_buf) {
                // Wasn't watching this file
                return Ok(());
            }
        }

        // Remove from last event times
        {
            let mut last_times = self.last_event_times.lock();
            last_times.remove(&path_buf);
        }

        // Remove from watcher
        let mut watcher_guard = self.watcher.lock();
        if let Some(ref mut watcher) = *watcher_guard {
            let _ = watcher.unwatch(&path_buf);
            log::info!("[FileWatcher] Stopped watching file: {}", path);
        }
        Ok(())
    }

    /// Get list of currently watched files
    #[allow(dead_code)]
    pub fn get_watched_files(&self) -> Vec<String> {
        self.watched_paths
            .lock()
            .iter()
            .map(|p| p.to_string_lossy().to_string())
            .collect()
    }
}

impl Default for FileWatcherManager {
    fn default() -> Self {
        Self::new()
    }
}
