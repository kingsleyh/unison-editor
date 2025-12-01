import { invoke } from '@tauri-apps/api/core';

const CONFIG_DIR = '.unison-editor';
const CONFIG_FILE = 'config.json';
const EDITOR_STATE_FILE = 'editor-state.json';

/**
 * Workspace configuration stored in .unison-editor/config.json
 */
export interface WorkspaceConfig {
  version: 1;
  linkedProject: string | null;
  defaultBranch: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Tab state for persistence
 */
export interface PersistedTab {
  id: string;
  title: string;
  filePath?: string;
  content?: string; // Only for scratch tabs (no filePath)
  language: string;
}

/**
 * Window size and position
 */
export interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized?: boolean;
}

/**
 * Complete layout state for all panels and splitters
 */
export interface LayoutState {
  // Left sidebar
  navPanelCollapsed: boolean;
  navPanelWidth: number;           // pixels
  workspaceExpanded: boolean;      // Workspace panel in sidebar
  fileExplorerExpanded: boolean;
  ucmExplorerExpanded: boolean;
  sidebarSplitPercent: number;     // 0-100

  // Terms panel (middle)
  termsPanelCollapsed: boolean;
  termsPanelWidth: number;         // pixels

  // Editor/Bottom vertical split
  editorBottomSplitPercent: number; // 0-100

  // Bottom panels
  bottomPanelCollapsed: boolean;    // whole bottom area
  ucmPanelCollapsed: boolean;
  outputPanelCollapsed: boolean;    // Output panel (typecheck/watch/tests)
  runPanelCollapsed: boolean;       // Run panel (purple button IO functions)
  logPanelCollapsed: boolean;       // Log panel
  terminalPanelCollapsed: boolean;
  bottomPanelWidths: number[];      // [ucm%, output%, run%, logs%, terminal%]

  // Window state
  windowState?: WindowState;
}

/**
 * Default layout values
 */
export const DEFAULT_LAYOUT: LayoutState = {
  navPanelCollapsed: false,
  navPanelWidth: 250,
  workspaceExpanded: true,
  fileExplorerExpanded: true,
  ucmExplorerExpanded: true,
  sidebarSplitPercent: 50,
  termsPanelCollapsed: true,
  termsPanelWidth: 400,
  editorBottomSplitPercent: 65,
  bottomPanelCollapsed: false,
  ucmPanelCollapsed: false,
  outputPanelCollapsed: false,
  runPanelCollapsed: true,        // Run panel collapsed by default
  logPanelCollapsed: true,        // Logs collapsed by default
  terminalPanelCollapsed: true,
  bottomPanelWidths: [30, 25, 20, 15, 10], // [ucm%, output%, run%, logs%, terminal%]
};

/**
 * Persisted definition card (minimal info needed to restore)
 */
export interface PersistedDefinitionCard {
  id: string;
  pendingIdentifier: string;
}

/**
 * Editor state stored in .unison-editor/editor-state.json
 */
export interface WorkspaceEditorState {
  version: 2;
  tabs: PersistedTab[];
  activeTabId: string | null;
  autoRun: boolean;
  layout: LayoutState;
  definitionCards?: PersistedDefinitionCard[];
  selectedCardId?: string | null;
}

/**
 * Default workspace configuration
 */
function getDefaultConfig(): WorkspaceConfig {
  const now = new Date().toISOString();
  return {
    version: 1,
    linkedProject: null,
    defaultBranch: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Default editor state
 */
function getDefaultEditorState(): WorkspaceEditorState {
  return {
    version: 2,
    tabs: [],
    activeTabId: null,
    autoRun: false,
    layout: { ...DEFAULT_LAYOUT },
  };
}

/**
 * Service for managing workspace configuration in .unison-editor/
 */
export class WorkspaceConfigService {
  private getConfigDirPath(workspacePath: string): string {
    return `${workspacePath}/${CONFIG_DIR}`;
  }

  private getConfigFilePath(workspacePath: string): string {
    return `${workspacePath}/${CONFIG_DIR}/${CONFIG_FILE}`;
  }

  private getEditorStatePath(workspacePath: string): string {
    return `${workspacePath}/${CONFIG_DIR}/${EDITOR_STATE_FILE}`;
  }

  /**
   * Check if workspace has .unison-editor config directory
   */
  async hasConfig(workspacePath: string): Promise<boolean> {
    try {
      const configPath = this.getConfigFilePath(workspacePath);
      return await invoke<boolean>('file_exists', { path: configPath });
    } catch {
      return false;
    }
  }

  /**
   * Initialize a workspace with default configuration
   * Creates .unison-editor/ directory and config.json
   */
  async initWorkspace(workspacePath: string): Promise<void> {
    const dirPath = this.getConfigDirPath(workspacePath);

    // Create .unison-editor directory
    try {
      await invoke('create_file', { path: dirPath, isDirectory: true });
    } catch (error) {
      // Directory might already exist, that's ok
      console.warn('Config dir may already exist:', error);
    }

    // Write default config
    const defaultConfig = getDefaultConfig();
    await this.saveConfig(workspacePath, defaultConfig);

    // Write default editor state
    const defaultState = getDefaultEditorState();
    await this.saveEditorState(workspacePath, defaultState);
  }

  /**
   * Load workspace configuration from .unison-editor/config.json
   */
  async loadConfig(workspacePath: string): Promise<WorkspaceConfig | null> {
    try {
      const configPath = this.getConfigFilePath(workspacePath);
      const content = await invoke<string>('read_file', { path: configPath });
      const config = JSON.parse(content) as WorkspaceConfig;
      return config;
    } catch (error) {
      console.error('Failed to load workspace config:', error);
      return null;
    }
  }

  /**
   * Save workspace configuration to .unison-editor/config.json
   */
  async saveConfig(workspacePath: string, config: WorkspaceConfig): Promise<void> {
    try {
      const configPath = this.getConfigFilePath(workspacePath);
      const content = JSON.stringify(config, null, 2);
      await invoke('write_file', { path: configPath, content });
    } catch (error) {
      console.error('Failed to save workspace config:', error);
      throw new Error(`Failed to save workspace config: ${error}`);
    }
  }

  /**
   * Load editor state from .unison-editor/editor-state.json
   */
  async loadEditorState(workspacePath: string): Promise<WorkspaceEditorState | null> {
    try {
      const statePath = this.getEditorStatePath(workspacePath);
      const exists = await invoke<boolean>('file_exists', { path: statePath });
      if (!exists) {
        return null;
      }
      const content = await invoke<string>('read_file', { path: statePath });
      const state = JSON.parse(content) as WorkspaceEditorState;
      return state;
    } catch (error) {
      console.error('Failed to load editor state:', error);
      return null;
    }
  }

  /**
   * Save editor state to .unison-editor/editor-state.json
   */
  async saveEditorState(workspacePath: string, state: WorkspaceEditorState): Promise<void> {
    try {
      const statePath = this.getEditorStatePath(workspacePath);
      const content = JSON.stringify(state, null, 2);
      await invoke('write_file', { path: statePath, content });
    } catch (error) {
      console.error('Failed to save editor state:', error);
      // Don't throw - state saving is best-effort
    }
  }

  /**
   * Update linked project in workspace config
   */
  async updateLinkedProject(
    workspacePath: string,
    projectName: string | null
  ): Promise<void> {
    const config = await this.loadConfig(workspacePath);
    if (config) {
      config.linkedProject = projectName;
      config.updatedAt = new Date().toISOString();
      await this.saveConfig(workspacePath, config);
    }
  }
}

// Singleton instance
let workspaceConfigService: WorkspaceConfigService | null = null;

export function getWorkspaceConfigService(): WorkspaceConfigService {
  if (!workspaceConfigService) {
    workspaceConfigService = new WorkspaceConfigService();
  }
  return workspaceConfigService;
}
