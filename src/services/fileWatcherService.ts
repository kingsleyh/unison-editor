import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { logger } from './loggingService';

export interface FileChangeEvent {
  path: string;
  changeType: 'modified' | 'deleted';
  /** Timestamp when the change was detected in the backend (milliseconds since epoch) */
  detectedAt: number;
}

export type FileChangeCallback = (event: FileChangeEvent) => void;

/**
 * Service for watching files for external changes.
 * Uses the Rust file_watcher module via Tauri to detect when
 * files are modified outside the editor (e.g., by UCM's edit command).
 */
class FileWatcherService {
  private initialized = false;
  private initializing = false;
  private listeners: Set<FileChangeCallback> = new Set();
  private unlistenChange: UnlistenFn | null = null;
  private watchedPaths: Set<string> = new Set();
  // Track last processed event to deduplicate
  private lastProcessedEvent: { path: string; detectedAt: number } | null = null;
  // Track files that are currently being edited (suppress all events)
  private activelyEditingFiles: Map<string, number> = new Map();
  // How long after last edit to wait before accepting external change events (ms)
  private static readonly EDITING_COOLDOWN_MS = 3000;

  /**
   * Initialize the file watcher service.
   * Must be called before watching any files.
   */
  async initialize(): Promise<void> {
    if (this.initialized || this.initializing) {
      return;
    }

    this.initializing = true;

    try {
      // Initialize the Rust file watcher
      await invoke('init_file_watcher');

      // Listen for file change events from the backend
      this.unlistenChange = await listen<FileChangeEvent>('file-changed', (event) => {
        const receivedAt = Date.now();
        const backendToFrontendLatency = receivedAt - event.payload.detectedAt;

        // Deduplicate events with the same path and timestamp
        if (this.lastProcessedEvent &&
            this.lastProcessedEvent.path === event.payload.path &&
            this.lastProcessedEvent.detectedAt === event.payload.detectedAt) {
          logger.debug('file', `[FileWatcher] Skipping duplicate event for ${event.payload.path}`);
          return;
        }
        this.lastProcessedEvent = { path: event.payload.path, detectedAt: event.payload.detectedAt };

        // Check if this file is actively being edited (ignore all events during editing)
        const lastEditTime = this.activelyEditingFiles.get(event.payload.path);
        if (lastEditTime && (receivedAt - lastEditTime) < FileWatcherService.EDITING_COOLDOWN_MS) {
          logger.debug('file', `[FileWatcher] Ignoring event for actively edited file: ${event.payload.path} (last edit ${receivedAt - lastEditTime}ms ago)`);
          return;
        }

        logger.info('file', `[FileWatcher] External change detected - latency: ${backendToFrontendLatency}ms`, {
          path: event.payload.path,
          changeType: event.payload.changeType,
          latency: backendToFrontendLatency,
        });
        this.notifyListeners(event.payload);
      });

      this.initialized = true;
      this.initializing = false;
      logger.info('file', 'File watcher service initialized');
    } catch (error) {
      this.initializing = false;
      logger.error('file', 'Failed to initialize file watcher', error);
      throw error;
    }
  }

  /**
   * Start watching a file for external changes.
   * @param path - Absolute path to the file to watch
   */
  async watchFile(path: string): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (this.watchedPaths.has(path)) {
      return;
    }

    try {
      await invoke('watch_file', { path });
      this.watchedPaths.add(path);
      logger.debug('file', 'Started watching file', { path });
    } catch (error) {
      logger.error('file', 'Failed to watch file', error, { path });
      throw error;
    }
  }

  /**
   * Stop watching a file.
   * @param path - Absolute path to the file to stop watching
   */
  async unwatchFile(path: string): Promise<void> {
    if (!this.watchedPaths.has(path)) {
      return;
    }

    try {
      await invoke('unwatch_file', { path });
    } catch (error) {
      logger.warn('file', 'Failed to unwatch file', { path, error });
    } finally {
      this.watchedPaths.delete(path);
      logger.debug('file', 'Stopped watching file', { path });
    }
  }

  /**
   * Register a callback to be notified when any watched file changes.
   * @param callback - Function to call when a file changes
   * @returns Unsubscribe function
   */
  onFileChange(callback: FileChangeCallback): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Mark a file as actively being edited.
   * This suppresses all file watcher events for this file until the cooldown expires.
   * Call this whenever the user edits a file in the editor.
   * @param path - Absolute path to the file being edited
   */
  markFileEditing(path: string): void {
    this.activelyEditingFiles.set(path, Date.now());
  }

  /**
   * Clear the editing state for a file.
   * Call this when a file tab is closed.
   * @param path - Absolute path to the file
   */
  clearFileEditing(path: string): void {
    this.activelyEditingFiles.delete(path);
  }

  /**
   * Get the list of currently watched file paths.
   */
  getWatchedFiles(): string[] {
    return Array.from(this.watchedPaths);
  }

  /**
   * Check if a file is currently being watched.
   */
  isWatching(path: string): boolean {
    return this.watchedPaths.has(path);
  }

  /**
   * Notify all registered listeners of a file change.
   */
  private notifyListeners(event: FileChangeEvent): void {
    this.listeners.forEach((callback) => {
      try {
        callback(event);
      } catch (error) {
        logger.error('file', 'Error in file change callback', error);
      }
    });
  }

  /**
   * Clean up the file watcher service.
   * Stops watching all files and removes event listeners.
   */
  async dispose(): Promise<void> {
    // Remove Tauri event listener
    if (this.unlistenChange) {
      this.unlistenChange();
      this.unlistenChange = null;
    }

    // Unwatch all files
    for (const path of this.watchedPaths) {
      try {
        await invoke('unwatch_file', { path });
      } catch {
        // Ignore errors during cleanup
      }
    }

    this.watchedPaths.clear();
    this.listeners.clear();
    this.initialized = false;
    logger.info('file', 'File watcher service disposed');
  }
}

// Singleton instance
let instance: FileWatcherService | null = null;

export function getFileWatcherService(): FileWatcherService {
  if (!instance) {
    instance = new FileWatcherService();
  }
  return instance;
}
