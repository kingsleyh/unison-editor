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

export interface ServicePorts {
  apiPort: number;
  lspPort: number;
  lspProxyPort: number;
}

export interface UCMLifecycleState {
  status: UCMStatus;
  error: string | null;
  workspaceDirectory: string | null;
  ports: ServicePorts | null;
}

type StatusChangeCallback = (status: UCMStatus, error?: string) => void;

class UCMLifecycleService {
  private state: UCMLifecycleState = {
    status: 'idle',
    error: null,
    workspaceDirectory: null,
    ports: null,
  };

  private listeners: Set<StatusChangeCallback> = new Set();
  private outputListeners: Set<(data: Uint8Array) => void> = new Set();
  private unlistenOutput: UnlistenFn | null = null;
  private initialized: boolean = false;

  /**
   * Initialize listeners that need to be set up early
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    // Set up file lock error listener early - this resets status so retry can work
    // This event can be emitted very quickly after spawn, so we need to listen before spawn
    // Note: We don't store the unlisten function because this listener lives for the
    // lifetime of the singleton service
    await listen('ucm-file-lock-error', () => {
      console.log('[UCMLifecycle] UCM file lock error - resetting status to allow retry');
      this.notifyStatusChange('error', 'Another UCM process is using this codebase');
      this.state.ports = null;
    });
    console.log('[UCMLifecycle] File lock error listener registered');
  }

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
   * Get the allocated service ports (only available after spawn completes)
   */
  getPorts(): ServicePorts | null {
    return this.state.ports;
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
    // Initialize listeners first (only runs once)
    await this.initialize();

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

    // In error state (e.g., file lock error) - don't auto-retry, wait for explicit retry
    if (this.state.status === 'error' && this.state.workspaceDirectory === workspaceDirectory) {
      console.log('[UCMLifecycle] UCM in error state for this workspace, not auto-retrying');
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

      // Spawn UCM PTY - returns the allocated ports
      const ports = await invoke<ServicePorts>('ucm_pty_spawn', { cwd: workspaceDirectory });
      this.state.ports = ports;

      console.log('[UCMLifecycle] UCM PTY spawned successfully with ports:', ports);
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
   * Reset error state to allow retry.
   * Call this before spawn() when user explicitly clicks Retry.
   */
  resetError(): void {
    if (this.state.status === 'error') {
      console.log('[UCMLifecycle] Resetting error state for retry');
      this.state.status = 'idle';
      this.state.error = null;
      // Keep workspaceDirectory so spawn knows what folder to use
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

      // Note: Don't clean up file lock error listener - it's needed for retry functionality
      // and is set up once during initialization

      // Kill the UCM PTY process on the backend
      await invoke('ucm_pty_kill');

      this.notifyStatusChange('stopped');
      this.state.workspaceDirectory = null;
      this.state.ports = null;
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
