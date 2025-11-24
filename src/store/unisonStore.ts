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
}));
