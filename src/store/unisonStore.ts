import { create } from 'zustand';

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

  // Namespace browser refresh trigger
  namespaceVersion: number;

  // Run pane state
  runOutput: {
    type: 'success' | 'error' | 'info';
    message: string;
    timestamp: number;
  } | null;
  runPaneCollapsed: boolean;

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

  // File system actions
  setWorkspaceDirectory: (directory: string | null) => void;
  addRecentFile: (filePath: string) => void;

  // Namespace actions
  refreshNamespace: () => void;

  // Run pane actions
  setRunOutput: (output: { type: 'success' | 'error' | 'info'; message: string }) => void;
  clearRunOutput: () => void;
  setRunPaneCollapsed: (collapsed: boolean) => void;
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
  recentFiles: JSON.parse(localStorage.getItem('recentFiles') || '[]'),

  namespaceVersion: 0,

  // Run pane state
  runOutput: null,
  runPaneCollapsed: false,

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

  // Namespace actions
  refreshNamespace: () =>
    set((state) => ({ namespaceVersion: state.namespaceVersion + 1 })),

  // Run pane actions
  setRunOutput: (output) =>
    set({ runOutput: { ...output, timestamp: Date.now() } }),

  clearRunOutput: () => set({ runOutput: null }),

  setRunPaneCollapsed: (collapsed) => set({ runPaneCollapsed: collapsed }),
}));
