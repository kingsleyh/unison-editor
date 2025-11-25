import { invoke } from '@tauri-apps/api/core';

/**
 * UCM Context Service
 *
 * Manages the current UCM project/branch context for the editor.
 * Supports both UCM polling and manual overrides from the UI.
 */

export interface Project {
  name: string;
  active_branch?: string;
}

export interface Branch {
  name: string;
  project?: string;
}

export interface CurrentContext {
  project?: Project;
  branch?: Branch;
  path: string;
}

type ContextChangeListener = (context: CurrentContext) => void;

class UCMContextService {
  private currentContext: CurrentContext | null = null;
  private listeners: Set<ContextChangeListener> = new Set();
  private refreshInterval: number | null = null;

  // Manual overrides from UI - these take precedence over UCM polling
  private manualProjectName: string | null = null;
  private manualBranchName: string | null = null;

  // Debug: unique ID to verify singleton
  private instanceId = Math.random().toString(36).substr(2, 9);

  constructor() {
    console.log('[ucmContext] Instance created with ID:', this.instanceId);
  }

  /**
   * Initialize the context service and start polling for changes
   */
  async initialize(): Promise<void> {
    await this.refresh();

    // Poll for context changes every 5 seconds (only used if no manual override)
    this.refreshInterval = window.setInterval(() => {
      this.refresh().catch(err => {
        console.error('Failed to refresh UCM context:', err);
      });
    }, 5000);
  }

  /**
   * Set manual project/branch override from UI selector.
   * These take precedence over UCM's current context.
   */
  setManualContext(projectName: string | null, branchName: string | null): void {
    const changed = this.manualProjectName !== projectName || this.manualBranchName !== branchName;
    this.manualProjectName = projectName;
    this.manualBranchName = branchName;

    if (changed) {
      console.log('[ucmContext] ID:', this.instanceId, 'Manual context set:', { projectName, branchName });
      this.notifyListeners();
    }
  }

  /**
   * Refresh the current context from UCM
   */
  async refresh(): Promise<CurrentContext> {
    try {
      const context = await invoke<CurrentContext>('get_current_context');

      // Only notify if context actually changed
      if (JSON.stringify(context) !== JSON.stringify(this.currentContext)) {
        this.currentContext = context;
        this.notifyListeners();
      }

      return context;
    } catch (error) {
      console.error('Failed to get current context:', error);
      throw error;
    }
  }

  /**
   * Get the current context (cached)
   */
  getContext(): CurrentContext | null {
    return this.currentContext;
  }

  /**
   * Get the current project name.
   * Manual override takes precedence over UCM context.
   */
  getProjectName(): string | null {
    // Manual override takes precedence
    if (this.manualProjectName) {
      console.log('[ucmContext.getProjectName] ID:', this.instanceId, 'Using manual override:', this.manualProjectName);
      return this.manualProjectName;
    }
    const fromContext = this.currentContext?.project?.name ?? null;
    console.log('[ucmContext.getProjectName] ID:', this.instanceId, 'Using UCM context:', fromContext, 'manual was:', this.manualProjectName);
    return fromContext;
  }

  /**
   * Get the current branch name.
   * Manual override takes precedence over UCM context.
   */
  getBranchName(): string | null {
    // Manual override takes precedence
    if (this.manualBranchName) {
      console.log('[ucmContext.getBranchName] Using manual override:', this.manualBranchName);
      return this.manualBranchName;
    }
    const fromContext = this.currentContext?.branch?.name ?? null;
    console.log('[ucmContext.getBranchName] Using UCM context:', fromContext, 'manual was:', this.manualBranchName);
    return fromContext;
  }

  /**
   * Get the current namespace path
   */
  getNamespacePath(): string {
    return this.currentContext?.path ?? '.';
  }

  /**
   * Subscribe to context changes
   */
  onChange(listener: ContextChangeListener): () => void {
    this.listeners.add(listener);

    // Immediately notify with current context
    if (this.currentContext) {
      listener(this.currentContext);
    }

    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all listeners of context change
   */
  private notifyListeners(): void {
    if (this.currentContext) {
      this.listeners.forEach(listener => {
        try {
          listener(this.currentContext!);
        } catch (error) {
          console.error('Error in context change listener:', error);
        }
      });
    }
  }

  /**
   * Clean up resources
   * Note: Does NOT clear manual context as that's controlled by the UI
   */
  dispose(): void {
    if (this.refreshInterval !== null) {
      window.clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    this.listeners.clear();
    // Don't clear manual context - it's set by the UI and should persist
    // this.manualProjectName = null;
    // this.manualBranchName = null;
  }
}

// Singleton instance
export const ucmContext = new UCMContextService();
