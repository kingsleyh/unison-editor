/**
 * UCM Lifecycle Service
 *
 * Manages the UCM process lifecycle independently of UI components.
 * UCM is spawned when workspace is ready and persists regardless of
 * whether the terminal panel is visible.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { logger } from './loggingService';

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
      logger.warn('ucm', 'UCM file lock error - another process is using this codebase');
      this.notifyStatusChange('error', 'Another UCM process is using this codebase');
      this.state.ports = null;
    });

    // Listen for UCM process exit (user typed 'exit' or process crashed)
    await listen('ucm-process-exited', () => {
      logger.info('ucm', 'UCM process exited');
      this.notifyStatusChange('stopped');
      this.state.ports = null;
      // Clean up output listener since process is gone
      if (this.unlistenOutput) {
        this.unlistenOutput();
        this.unlistenOutput = null;
      }
    });

    logger.debug('ucm', 'UCM lifecycle service initialized');
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
      logger.debug('ucm', 'UCM already running for workspace', { workspaceDirectory });
      return true;
    }

    // Already spawning
    if (this.state.status === 'spawning') {
      logger.debug('ucm', 'UCM spawn already in progress');
      return false;
    }

    // In error state (e.g., file lock error) - don't auto-retry, wait for explicit retry
    if (this.state.status === 'error' && this.state.workspaceDirectory === workspaceDirectory) {
      logger.debug('ucm', 'UCM in error state for this workspace, not auto-retrying');
      return false;
    }

    // If running for different workspace, stop first
    if (this.state.status === 'running' && this.state.workspaceDirectory !== workspaceDirectory) {
      logger.info('ucm', 'Stopping UCM for workspace change');
      await this.stop();
    }

    this.state.workspaceDirectory = workspaceDirectory;
    this.notifyStatusChange('spawning');

    const spawnOp = logger.startOperation('ucm', 'Spawning UCM PTY', { workspaceDirectory });
    try {
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

      spawnOp.complete({ ports });
      this.notifyStatusChange('running');
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      spawnOp.fail(err);
      this.notifyStatusChange('error', errorMessage);
      return false;
    }
  }

  /**
   * Write data to the UCM PTY
   */
  async write(data: string): Promise<void> {
    if (this.state.status !== 'running') {
      logger.warn('ucm', 'Cannot write to UCM - not running');
      return;
    }

    try {
      await invoke('ucm_pty_write', { data });
    } catch (err) {
      logger.error('ucm', 'Failed to write to UCM PTY', err);
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
      logger.error('ucm', 'Failed to resize UCM PTY', err);
    }
  }

  /**
   * Reset error state to allow retry.
   * Call this before spawn() when user explicitly clicks Retry.
   */
  resetError(): void {
    if (this.state.status === 'error') {
      logger.info('ucm', 'Resetting error state for retry');
      this.state.status = 'idle';
      this.state.error = null;
      // Keep workspaceDirectory so spawn knows what folder to use
    }
  }

  /**
   * Restart UCM (useful after exit or crash)
   * Returns true if restart was successful
   */
  async restart(): Promise<boolean> {
    const workspaceDir = this.state.workspaceDirectory;
    if (!workspaceDir) {
      logger.warn('ucm', 'Cannot restart UCM - no workspace directory');
      return false;
    }

    logger.info('ucm', 'Restarting UCM');

    // Reset state to allow spawn
    this.state.status = 'idle';
    this.state.error = null;

    return this.spawn(workspaceDir);
  }

  /**
   * Stop the UCM PTY
   */
  async stop(): Promise<void> {
    if (this.state.status === 'idle' || this.state.status === 'stopped') {
      return;
    }

    const stopOp = logger.startOperation('ucm', 'Stopping UCM PTY');
    try {
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
      stopOp.complete();
    } catch (err) {
      stopOp.fail(err);
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
