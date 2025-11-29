/**
 * UCM Lifecycle Service
 *
 * Manages the UCM process lifecycle independently of UI components.
 * UCM is spawned when workspace is ready and persists regardless of
 * whether the terminal panel is visible.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export type UCMStatus = 'idle' | 'spawning' | 'running' | 'error' | 'stopped';

export interface UCMLifecycleState {
  status: UCMStatus;
  error: string | null;
  workspaceDirectory: string | null;
}

type StatusChangeCallback = (status: UCMStatus, error?: string) => void;

class UCMLifecycleService {
  private state: UCMLifecycleState = {
    status: 'idle',
    error: null,
    workspaceDirectory: null,
  };

  private listeners: Set<StatusChangeCallback> = new Set();
  private outputListeners: Set<(data: Uint8Array) => void> = new Set();
  private unlistenOutput: UnlistenFn | null = null;

  /**
   * Get current UCM status
   */
  getStatus(): UCMStatus {
    return this.state.status;
  }

  /**
   * Get current error message if any
   */
  getError(): string | null {
    return this.state.error;
  }

  /**
   * Check if UCM is running
   */
  isRunning(): boolean {
    return this.state.status === 'running';
  }

  /**
   * Subscribe to status changes
   */
  onStatusChange(callback: StatusChangeCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Subscribe to PTY output
   */
  onOutput(callback: (data: Uint8Array) => void): () => void {
    this.outputListeners.add(callback);
    return () => this.outputListeners.delete(callback);
  }

  private notifyStatusChange(status: UCMStatus, error?: string) {
    this.state.status = status;
    this.state.error = error || null;
    this.listeners.forEach((cb) => cb(status, error));
  }

  private notifyOutput(data: Uint8Array) {
    this.outputListeners.forEach((cb) => cb(data));
  }

  /**
   * Spawn UCM PTY for the given workspace directory.
   * This should be called once when workspace is configured.
   */
  async spawn(workspaceDirectory: string): Promise<boolean> {
    // Already running for this workspace
    if (this.state.status === 'running' && this.state.workspaceDirectory === workspaceDirectory) {
      console.log('[UCMLifecycle] UCM already running for workspace:', workspaceDirectory);
      return true;
    }

    // Already spawning
    if (this.state.status === 'spawning') {
      console.log('[UCMLifecycle] UCM spawn already in progress');
      return false;
    }

    // If running for different workspace, stop first
    if (this.state.status === 'running' && this.state.workspaceDirectory !== workspaceDirectory) {
      console.log('[UCMLifecycle] Stopping UCM for workspace change');
      await this.stop();
    }

    this.state.workspaceDirectory = workspaceDirectory;
    this.notifyStatusChange('spawning');

    try {
      console.log('[UCMLifecycle] Spawning UCM PTY for workspace:', workspaceDirectory);

      // Set up output listener before spawning
      if (!this.unlistenOutput) {
        this.unlistenOutput = await listen<number[]>('ucm-pty-output', (event) => {
          const data = new Uint8Array(event.payload);
          this.notifyOutput(data);
        });
      }

      // Spawn UCM PTY
      await invoke('ucm_pty_spawn', { cwd: workspaceDirectory });

      console.log('[UCMLifecycle] UCM PTY spawned successfully');
      this.notifyStatusChange('running');
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('[UCMLifecycle] Failed to spawn UCM PTY:', errorMessage);
      this.notifyStatusChange('error', errorMessage);
      return false;
    }
  }

  /**
   * Write data to the UCM PTY
   */
  async write(data: string): Promise<void> {
    if (this.state.status !== 'running') {
      console.warn('[UCMLifecycle] Cannot write to UCM - not running');
      return;
    }

    try {
      await invoke('ucm_pty_write', { data });
    } catch (err) {
      console.error('[UCMLifecycle] Failed to write to UCM PTY:', err);
    }
  }

  /**
   * Resize the UCM PTY
   */
  async resize(rows: number, cols: number): Promise<void> {
    if (this.state.status !== 'running') {
      return;
    }

    try {
      await invoke('ucm_pty_resize', { rows, cols });
    } catch (err) {
      console.error('[UCMLifecycle] Failed to resize UCM PTY:', err);
    }
  }

  /**
   * Stop the UCM PTY
   */
  async stop(): Promise<void> {
    if (this.state.status === 'idle' || this.state.status === 'stopped') {
      return;
    }

    try {
      console.log('[UCMLifecycle] Stopping UCM PTY');

      // Clean up output listener
      if (this.unlistenOutput) {
        this.unlistenOutput();
        this.unlistenOutput = null;
      }

      // Kill the UCM PTY process on the backend
      await invoke('ucm_pty_kill');

      this.notifyStatusChange('stopped');
      this.state.workspaceDirectory = null;
      console.log('[UCMLifecycle] UCM PTY stopped');
    } catch (err) {
      console.error('[UCMLifecycle] Failed to stop UCM PTY:', err);
    }
  }
}

// Singleton instance
let instance: UCMLifecycleService | null = null;

export function getUCMLifecycleService(): UCMLifecycleService {
  if (!instance) {
    instance = new UCMLifecycleService();
  }
  return instance;
}
