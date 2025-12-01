import { create } from 'zustand';
import type { DefinitionSummary } from '../types/syntax';
import type { ResolvedDefinition } from '../types/navigation';
import { DEFAULT_LAYOUT, type LayoutState } from '../services/workspaceConfigService';
import type { LogEntry, LogFilter, TaskExecution, TaskStatus } from '../types/logging';
import { DEFAULT_LOG_FILTER } from '../types/logging';

/**
 * Safely parse JSON from localStorage with fallback
 */
function safeLocalStorageGetJson<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    if (value === null) return fallback;
    return JSON.parse(value) as T;
  } catch (e) {
    console.warn(`[Store] Failed to parse localStorage key "${key}":`, e);
    return fallback;
  }
}

export interface Project {
  name: string;
  active_branch?: string;
}

export interface Branch {
  name: string;
  project?: string;
}

export interface Definition {
  name: string;
  hash?: string;
  type: 'term' | 'type';
  source?: string;
}

export interface DefinitionCardState {
  id: string;
  /** The identifier we're looking up (could be hash or FQN initially) */
  pendingIdentifier: string;
  /** Canonical hash - primary key for deduplication (null until resolved) */
  hash: string | null;
  /** Fully qualified name - for display and tree navigation (null until resolved) */
  fqn: string | null;
  /** Full resolution info from DefinitionResolver */
  resolved: ResolvedDefinition | null;
  /** The loaded definition */
  definition: DefinitionSummary | null;
  loading: boolean;
  error: string | null;
}

export interface EditorTab {
  id: string;
  title: string;
  content: string;
  language: string;
  isDirty: boolean;
  filePath?: string; // Optional: path to the file on disk
  saveStatus?: 'saved' | 'saving' | 'error'; // Save status indicator
}

interface UnisonState {
  // Connection state
  isConnected: boolean;
  ucmHost: string;
  ucmPort: number;
  lspPort: number;

  // Current context
  currentProject: Project | null;
  currentBranch: Branch | null;
  currentPath: string;

  // Projects and branches
  projects: Project[];
  branches: Branch[];

  // Editor state
  tabs: EditorTab[];
  activeTabId: string | null;

  // File system state
  workspaceDirectory: string | null;
  recentFiles: string[];

  // Workspace configuration state
  linkedProject: string | null;
  workspaceConfigLoaded: boolean;
  recentWorkspaces: string[];

  // Namespace browser refresh trigger
  namespaceVersion: number;

  // Definitions refresh trigger (for invalidating definition cache)
  definitionsVersion: number;

  // Run pane state
  runOutput: {
    type: 'success' | 'error' | 'info';
    message: string;
    timestamp: number;
  } | null;
  runPaneCollapsed: boolean;

  // Auto-run state (persisted to localStorage)
  autoRun: boolean;

  // Definition cards state
  definitionCards: DefinitionCardState[];
  selectedCardId: string | null;

  // Layout state (persisted per-workspace)
  layout: LayoutState;

  // Logging state
  logs: LogEntry[];
  logFilter: LogFilter;

  // Task execution state (for Run panel)
  currentTask: TaskExecution | null;
  taskHistory: TaskExecution[];

  // Actions
  setConnection: (host: string, port: number, lspPort: number) => void;
  setConnected: (connected: boolean) => void;
  setCurrentProject: (project: Project | null) => void;
  setCurrentBranch: (branch: Branch | null) => void;
  setCurrentPath: (path: string) => void;
  setProjects: (projects: Project[]) => void;
  setBranches: (branches: Branch[]) => void;

  // Tab management
  addTab: (tab: EditorTab) => void;
  removeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateTab: (tabId: string, updates: Partial<EditorTab>) => void;
  getActiveTab: () => EditorTab | null;
  clearTabs: () => void;

  // File system actions
  setWorkspaceDirectory: (directory: string | null) => void;
  addRecentFile: (filePath: string) => void;

  // Workspace configuration actions
  setLinkedProject: (project: string | null) => void;
  setWorkspaceConfigLoaded: (loaded: boolean) => void;
  addRecentWorkspace: (path: string) => void;
  clearWorkspaceState: () => void;

  // Namespace actions
  refreshNamespace: () => void;

  // Definitions actions
  refreshDefinitions: () => void;

  // Run pane actions
  setRunOutput: (output: { type: 'success' | 'error' | 'info'; message: string }) => void;
  clearRunOutput: () => void;
  setRunPaneCollapsed: (collapsed: boolean) => void;

  // Auto-run actions
  setAutoRun: (enabled: boolean) => void;

  // Definition cards actions
  setDefinitionCards: (cards: DefinitionCardState[]) => void;
  addDefinitionCard: (card: DefinitionCardState) => void;
  updateDefinitionCard: (cardId: string, updates: Partial<DefinitionCardState>) => void;
  removeDefinitionCard: (cardId: string) => void;
  setSelectedCardId: (cardId: string | null) => void;
  getDefinitionCards: () => DefinitionCardState[];

  // Layout actions
  setLayout: (layout: Partial<LayoutState>) => void;
  resetLayout: () => void;

  // Logging actions
  addLog: (entry: Omit<LogEntry, 'id' | 'timestamp'>) => void;
  clearLogs: () => void;
  setLogFilter: (filter: Partial<LogFilter>) => void;

  // Task execution actions
  startTask: (functionName: string) => string;  // Returns task ID
  appendTaskOutput: (taskId: string, output: string) => void;
  completeTask: (taskId: string, status: TaskStatus, error?: string) => void;
  cancelCurrentTask: () => void;
  clearTaskHistory: () => void;
}

export const useUnisonStore = create<UnisonState>((set, get) => ({
  // Initial state
  isConnected: false,
  ucmHost: '127.0.0.1',
  ucmPort: 5858,
  lspPort: 5757,

  currentProject: null,
  currentBranch: null,
  currentPath: '.',

  projects: [],
  branches: [],

  tabs: [],
  activeTabId: null,

  workspaceDirectory: localStorage.getItem('workspaceDirectory') || null,
  recentFiles: safeLocalStorageGetJson<string[]>('recentFiles', []),

  // Workspace configuration state
  linkedProject: null, // Loaded from workspace config file
  workspaceConfigLoaded: false,
  recentWorkspaces: safeLocalStorageGetJson<string[]>('recentWorkspaces', []),

  namespaceVersion: 0,
  definitionsVersion: 0,

  // Run pane state
  runOutput: null,
  runPaneCollapsed: true,

  // Auto-run state (load from localStorage)
  autoRun: localStorage.getItem('autoRun') === 'true',

  // Definition cards state
  definitionCards: [],
  selectedCardId: null,

  // Layout state - initialized with defaults
  layout: { ...DEFAULT_LAYOUT },

  // Logging state
  logs: [],
  logFilter: { ...DEFAULT_LOG_FILTER },

  // Task execution state
  currentTask: null,
  taskHistory: [],

  // Actions
  setConnection: (host, port, lspPort) =>
    set({ ucmHost: host, ucmPort: port, lspPort }),

  setConnected: (connected) => set({ isConnected: connected }),

  setCurrentProject: (project) => set({ currentProject: project }),

  setCurrentBranch: (branch) => set({ currentBranch: branch }),

  setCurrentPath: (path) => set({ currentPath: path }),

  setProjects: (projects) => set({ projects }),

  setBranches: (branches) => set({ branches }),

  // Tab management
  addTab: (tab) =>
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: tab.id,
    })),

  removeTab: (tabId) =>
    set((state) => {
      const newTabs = state.tabs.filter((t) => t.id !== tabId);
      let newActiveTabId = state.activeTabId;

      if (state.activeTabId === tabId) {
        // If we're closing the active tab, activate the tab to the right, or left if none
        const currentIndex = state.tabs.findIndex((t) => t.id === tabId);
        if (newTabs.length > 0) {
          const nextIndex = Math.min(currentIndex, newTabs.length - 1);
          newActiveTabId = newTabs[nextIndex]?.id || null;
        } else {
          newActiveTabId = null;
        }
      }

      return {
        tabs: newTabs,
        activeTabId: newActiveTabId,
      };
    }),

  setActiveTab: (tabId) => set({ activeTabId: tabId }),

  updateTab: (tabId, updates) =>
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId ? { ...tab, ...updates } : tab
      ),
    })),

  getActiveTab: () => {
    const state = get();
    return state.tabs.find((t) => t.id === state.activeTabId) || null;
  },

  clearTabs: () => set({ tabs: [], activeTabId: null }),

  // File system actions
  setWorkspaceDirectory: (directory) => {
    if (directory) {
      localStorage.setItem('workspaceDirectory', directory);
    } else {
      localStorage.removeItem('workspaceDirectory');
    }
    set({ workspaceDirectory: directory });
  },

  addRecentFile: (filePath) =>
    set((state) => {
      const recentFiles = [
        filePath,
        ...state.recentFiles.filter((f) => f !== filePath),
      ].slice(0, 10); // Keep only last 10 files

      localStorage.setItem('recentFiles', JSON.stringify(recentFiles));
      return { recentFiles };
    }),

  // Workspace configuration actions
  setLinkedProject: (project) => set({ linkedProject: project }),

  setWorkspaceConfigLoaded: (loaded) => set({ workspaceConfigLoaded: loaded }),

  addRecentWorkspace: (path) =>
    set((state) => {
      const recentWorkspaces = [
        path,
        ...state.recentWorkspaces.filter((w) => w !== path),
      ].slice(0, 10); // Keep only last 10 workspaces

      localStorage.setItem('recentWorkspaces', JSON.stringify(recentWorkspaces));
      return { recentWorkspaces };
    }),

  clearWorkspaceState: () =>
    set({
      linkedProject: null,
      workspaceConfigLoaded: false,
      tabs: [],
      activeTabId: null,
      definitionCards: [],
      selectedCardId: null,
      runOutput: null,
      // Clear project/branch state so new workspace can set its own
      currentProject: null,
      currentBranch: null,
      projects: [],
      branches: [],
      isConnected: false,
      // Reset layout to defaults
      layout: { ...DEFAULT_LAYOUT },
    }),

  // Namespace actions
  refreshNamespace: () =>
    set((state) => ({ namespaceVersion: state.namespaceVersion + 1 })),

  // Definitions actions
  refreshDefinitions: () =>
    set((state) => ({ definitionsVersion: state.definitionsVersion + 1 })),

  // Run pane actions
  setRunOutput: (output) =>
    set({ runOutput: { ...output, timestamp: Date.now() } }),

  clearRunOutput: () => set({ runOutput: null }),

  setRunPaneCollapsed: (collapsed) => set({ runPaneCollapsed: collapsed }),

  // Auto-run actions
  setAutoRun: (enabled) => {
    localStorage.setItem('autoRun', enabled.toString());
    set({ autoRun: enabled });
  },

  // Definition cards actions
  setDefinitionCards: (cards) => set({ definitionCards: cards }),

  addDefinitionCard: (card) =>
    set((state) => ({
      definitionCards: [card, ...state.definitionCards],
      selectedCardId: card.id,
    })),

  updateDefinitionCard: (cardId, updates) =>
    set((state) => ({
      definitionCards: state.definitionCards.map((card) =>
        card.id === cardId ? { ...card, ...updates } : card
      ),
    })),

  removeDefinitionCard: (cardId) =>
    set((state) => ({
      definitionCards: state.definitionCards.filter((card) => card.id !== cardId),
    })),

  setSelectedCardId: (cardId) => set({ selectedCardId: cardId }),

  getDefinitionCards: () => get().definitionCards,

  // Layout actions
  setLayout: (updates) =>
    set((state) => ({
      layout: { ...state.layout, ...updates },
    })),

  resetLayout: () => set({ layout: { ...DEFAULT_LAYOUT } }),

  // Logging actions
  addLog: (entry) =>
    set((state) => {
      const newLog: LogEntry = {
        ...entry,
        id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        timestamp: Date.now(),
      };
      // Ring buffer - keep last 5000 logs
      const logs = [...state.logs, newLog].slice(-5000);
      return { logs };
    }),

  clearLogs: () => set({ logs: [] }),

  setLogFilter: (filter) =>
    set((state) => ({
      logFilter: { ...state.logFilter, ...filter },
    })),

  // Task execution actions
  startTask: (functionName) => {
    const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const newTask: TaskExecution = {
      id: taskId,
      functionName,
      status: 'running',
      startTime: Date.now(),
      output: '',
    };
    set({ currentTask: newTask });
    return taskId;
  },

  appendTaskOutput: (taskId, output) =>
    set((state) => {
      if (state.currentTask?.id !== taskId) return state;
      return {
        currentTask: {
          ...state.currentTask,
          output: state.currentTask.output + output,
        },
      };
    }),

  completeTask: (taskId, status, error) =>
    set((state) => {
      if (state.currentTask?.id !== taskId) return state;
      const completedTask: TaskExecution = {
        ...state.currentTask,
        status,
        endTime: Date.now(),
        error,
      };
      // Add to history (keep last 10)
      const taskHistory = [completedTask, ...state.taskHistory].slice(0, 10);
      return {
        currentTask: null,
        taskHistory,
      };
    }),

  cancelCurrentTask: () =>
    set((state) => {
      if (!state.currentTask) return state;
      const cancelledTask: TaskExecution = {
        ...state.currentTask,
        status: 'cancelled',
        endTime: Date.now(),
      };
      const taskHistory = [cancelledTask, ...state.taskHistory].slice(0, 10);
      return {
        currentTask: null,
        taskHistory,
      };
    }),

  clearTaskHistory: () => set({ taskHistory: [] }),
}));
