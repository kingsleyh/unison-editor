/**
 * Keyboard Shortcut Service
 *
 * Singleton service for managing keyboard shortcuts.
 * Handles registration, conflict detection, persistence, and key event handling.
 */

import {
  type KeyBinding,
  type RegisteredShortcut,
  type UserKeybindingsConfig,
  type ShortcutConflict,
  type ShortcutCategory,
  type PaletteCommand,
  parseBindingString,
  formatBinding,
  bindingsEqual,
  eventMatchesBinding,
} from '../types/shortcuts';

const STORAGE_KEY = 'unison-keybindings';

/**
 * Default keybindings definition
 * Actions are set to no-op initially; App.tsx will wire them up
 */
interface DefaultShortcut {
  id: string;
  label: string;
  description?: string;
  category: ShortcutCategory;
  defaultBindingMac: string;
  defaultBindingWin: string;
}

const DEFAULT_SHORTCUTS: DefaultShortcut[] = [
  // General
  {
    id: 'general.commandPalette',
    label: 'Command Palette',
    description: 'Open the command palette',
    category: 'general',
    defaultBindingMac: 'Cmd+Shift+P',
    defaultBindingWin: 'Ctrl+Shift+P',
  },
  {
    id: 'general.save',
    label: 'Save File',
    description: 'Save the current file',
    category: 'general',
    defaultBindingMac: 'Cmd+S',
    defaultBindingWin: 'Ctrl+S',
  },
  {
    id: 'general.settings',
    label: 'Keyboard Shortcuts',
    description: 'Open keyboard shortcuts settings',
    category: 'general',
    defaultBindingMac: 'Cmd+K',
    defaultBindingWin: 'Ctrl+K',
  },

  // Navigation - Panel Focus (opens panel if closed, focuses it)
  {
    id: 'nav.focusEditor',
    label: 'Focus Editor',
    description: 'Move focus to the code editor',
    category: 'navigation',
    defaultBindingMac: 'Cmd+1',
    defaultBindingWin: 'Ctrl+1',
  },
  {
    id: 'nav.focusUcm',
    label: 'Focus UCM Terminal',
    description: 'Focus the UCM terminal (opens if closed)',
    category: 'navigation',
    defaultBindingMac: 'Cmd+2',
    defaultBindingWin: 'Ctrl+2',
  },
  {
    id: 'nav.focusOutput',
    label: 'Focus Output Panel',
    description: 'Focus the output panel (opens if closed)',
    category: 'navigation',
    defaultBindingMac: 'Cmd+3',
    defaultBindingWin: 'Ctrl+3',
  },
  {
    id: 'nav.focusLogs',
    label: 'Focus Logs Panel',
    description: 'Focus the logs panel (opens if closed)',
    category: 'navigation',
    defaultBindingMac: 'Cmd+4',
    defaultBindingWin: 'Ctrl+4',
  },
  {
    id: 'nav.focusTerminal',
    label: 'Focus Terminal',
    description: 'Focus the general terminal (opens if closed)',
    category: 'navigation',
    defaultBindingMac: 'Cmd+5',
    defaultBindingWin: 'Ctrl+5',
  },

  // Navigation - Panel Toggles (open/close)
  {
    id: 'nav.toggleUcm',
    label: 'Toggle UCM Terminal',
    description: 'Open or close the UCM terminal panel',
    category: 'navigation',
    defaultBindingMac: 'Cmd+Alt+2',
    defaultBindingWin: 'Ctrl+Alt+2',
  },
  {
    id: 'nav.toggleOutput',
    label: 'Toggle Output Panel',
    description: 'Open or close the output panel',
    category: 'navigation',
    defaultBindingMac: 'Cmd+Alt+3',
    defaultBindingWin: 'Ctrl+Alt+3',
  },
  {
    id: 'nav.toggleLogs',
    label: 'Toggle Logs Panel',
    description: 'Open or close the logs panel',
    category: 'navigation',
    defaultBindingMac: 'Cmd+Alt+4',
    defaultBindingWin: 'Ctrl+Alt+4',
  },
  {
    id: 'nav.toggleTerminal',
    label: 'Toggle Terminal',
    description: 'Open or close the general terminal panel',
    category: 'navigation',
    defaultBindingMac: 'Cmd+Alt+5',
    defaultBindingWin: 'Ctrl+Alt+5',
  },

  // Navigation - Tab Management
  {
    id: 'nav.nextTab',
    label: 'Next Tab',
    description: 'Switch to the next editor tab',
    category: 'navigation',
    defaultBindingMac: 'Cmd+Alt+ArrowRight',
    defaultBindingWin: 'Ctrl+PageDown',
  },
  {
    id: 'nav.prevTab',
    label: 'Previous Tab',
    description: 'Switch to the previous editor tab',
    category: 'navigation',
    defaultBindingMac: 'Cmd+Alt+ArrowLeft',
    defaultBindingWin: 'Ctrl+PageUp',
  },
  {
    id: 'nav.closeTab',
    label: 'Close Tab',
    description: 'Close the current editor tab',
    category: 'navigation',
    defaultBindingMac: 'Cmd+W',
    defaultBindingWin: 'Ctrl+W',
  },
  {
    id: 'nav.reopenTab',
    label: 'Reopen Closed Tab',
    description: 'Reopen the last closed tab',
    category: 'navigation',
    defaultBindingMac: 'Cmd+Shift+T',
    defaultBindingWin: 'Ctrl+Shift+T',
  },

  // Editor
  {
    id: 'editor.format',
    label: 'Format Document',
    description: 'Format the current document',
    category: 'editor',
    defaultBindingMac: 'Cmd+Shift+F',
    defaultBindingWin: 'Ctrl+Shift+F',
  },
  {
    id: 'editor.runWatches',
    label: 'Run All Watches',
    description: 'Run all watch expressions in the current file',
    category: 'editor',
    defaultBindingMac: 'Cmd+Enter',
    defaultBindingWin: 'Ctrl+Enter',
  },
  {
    id: 'editor.runTests',
    label: 'Run All Tests',
    description: 'Run all tests in the current file',
    category: 'editor',
    defaultBindingMac: 'Cmd+Shift+Enter',
    defaultBindingWin: 'Ctrl+Shift+Enter',
  },
  {
    id: 'editor.toggleAutoRun',
    label: 'Toggle Auto-Run',
    description: 'Toggle automatic evaluation on save',
    category: 'editor',
    defaultBindingMac: 'Cmd+Shift+A',
    defaultBindingWin: 'Ctrl+Shift+A',
  },
  {
    id: 'editor.duplicateLine',
    label: 'Duplicate Line',
    description: 'Duplicate the current line below',
    category: 'editor',
    defaultBindingMac: 'Cmd+D',
    defaultBindingWin: 'Ctrl+D',
  },
  {
    id: 'editor.deleteLine',
    label: 'Delete Line',
    description: 'Delete the current line',
    category: 'editor',
    defaultBindingMac: 'Cmd+Shift+K',
    defaultBindingWin: 'Ctrl+Shift+K',
  },
  {
    id: 'editor.moveLineUp',
    label: 'Move Line Up',
    description: 'Move the current line up',
    category: 'editor',
    defaultBindingMac: 'Alt+ArrowUp',
    defaultBindingWin: 'Alt+ArrowUp',
  },
  {
    id: 'editor.moveLineDown',
    label: 'Move Line Down',
    description: 'Move the current line down',
    category: 'editor',
    defaultBindingMac: 'Alt+ArrowDown',
    defaultBindingWin: 'Alt+ArrowDown',
  },
  {
    id: 'editor.selectAllOccurrences',
    label: 'Select All Occurrences',
    description: 'Select all occurrences of the current selection',
    category: 'editor',
    defaultBindingMac: 'Cmd+Shift+L',
    defaultBindingWin: 'Ctrl+Shift+L',
  },
  {
    id: 'editor.addCursorAbove',
    label: 'Add Cursor Above',
    description: 'Add a cursor above the current line',
    category: 'editor',
    defaultBindingMac: 'Cmd+Alt+ArrowUp',
    defaultBindingWin: 'Ctrl+Alt+ArrowUp',
  },
  {
    id: 'editor.addCursorBelow',
    label: 'Add Cursor Below',
    description: 'Add a cursor below the current line',
    category: 'editor',
    defaultBindingMac: 'Cmd+Alt+ArrowDown',
    defaultBindingWin: 'Ctrl+Alt+ArrowDown',
  },
  {
    id: 'editor.goToLine',
    label: 'Go to Line',
    description: 'Go to a specific line number',
    category: 'editor',
    defaultBindingMac: 'Cmd+G',
    defaultBindingWin: 'Ctrl+G',
  },
  {
    id: 'editor.toggleComment',
    label: 'Toggle Line Comment',
    description: 'Toggle comment on the current line',
    category: 'editor',
    defaultBindingMac: 'Cmd+/',
    defaultBindingWin: 'Ctrl+/',
  },

  // View
  {
    id: 'view.toggleNavigation',
    label: 'Toggle Navigation',
    description: 'Show or hide the navigation sidebar',
    category: 'view',
    defaultBindingMac: 'Cmd+B',
    defaultBindingWin: 'Ctrl+B',
  },
  {
    id: 'view.toggleBottomPanel',
    label: 'Toggle Bottom Panel',
    description: 'Show or hide the bottom panel',
    category: 'view',
    defaultBindingMac: 'Cmd+J',
    defaultBindingWin: 'Ctrl+J',
  },
  {
    id: 'view.toggleTermsPanel',
    label: 'Toggle Terms Panel',
    description: 'Show or hide the terms/definitions panel',
    category: 'view',
    defaultBindingMac: 'Cmd+Shift+B',
    defaultBindingWin: 'Ctrl+Shift+B',
  },
  {
    id: 'view.toggleWorkspace',
    label: 'Toggle Workspace Panel',
    description: 'Show or hide the workspace panel in sidebar',
    category: 'view',
    defaultBindingMac: 'Cmd+Shift+W',
    defaultBindingWin: 'Ctrl+Shift+W',
  },
  {
    id: 'view.toggleFileExplorer',
    label: 'Toggle File Explorer',
    description: 'Show or hide the file explorer panel',
    category: 'view',
    defaultBindingMac: 'Cmd+Shift+E',
    defaultBindingWin: 'Ctrl+Shift+E',
  },
  {
    id: 'view.toggleOutline',
    label: 'Toggle Outline',
    description: 'Show or hide the document outline panel',
    category: 'view',
    defaultBindingMac: 'Cmd+Shift+O',
    defaultBindingWin: 'Ctrl+Shift+O',
  },
  {
    id: 'view.toggleUcmExplorer',
    label: 'Toggle UCM Explorer',
    description: 'Show or hide the UCM explorer panel',
    category: 'view',
    defaultBindingMac: 'Cmd+Shift+U',
    defaultBindingWin: 'Ctrl+Shift+U',
  },
];

class KeyboardShortcutService {
  private shortcuts: Map<string, RegisteredShortcut> = new Map();
  private userConfig: UserKeybindingsConfig;
  private listeners: Set<() => void> = new Set();
  private _isMac: boolean;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor() {
    this._isMac = navigator.platform.toLowerCase().includes('mac');
    this.userConfig = this.loadUserConfig();
    this.initializeDefaultShortcuts();
  }

  /**
   * Check if running on Mac
   */
  get isMac(): boolean {
    return this._isMac;
  }

  /**
   * Initialize default shortcuts with no-op actions
   * Actions will be wired up by App.tsx
   */
  private initializeDefaultShortcuts(): void {
    for (const def of DEFAULT_SHORTCUTS) {
      const bindingStr = this._isMac ? def.defaultBindingMac : def.defaultBindingWin;
      const shortcut: RegisteredShortcut = {
        id: def.id,
        label: def.label,
        description: def.description,
        category: def.category,
        scope: 'global',
        defaultBinding: parseBindingString(bindingStr),
        action: () => {}, // Will be set by setAction()
        userBinding: this.userConfig.bindings[def.id],
      };
      this.shortcuts.set(def.id, shortcut);
    }
  }

  /**
   * Load user config from localStorage
   */
  private loadUserConfig(): UserKeybindingsConfig {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const config = JSON.parse(stored) as UserKeybindingsConfig;
        if (config.version === 1) {
          return config;
        }
      }
    } catch (e) {
      console.warn('[KeyboardShortcuts] Failed to load user config:', e);
    }
    return { version: 1, bindings: {} };
  }

  /**
   * Save user config to localStorage
   */
  private saveUserConfig(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.userConfig));
    } catch (e) {
      console.error('[KeyboardShortcuts] Failed to save user config:', e);
    }
  }

  /**
   * Set the action for a shortcut
   * Called by App.tsx to wire up actions after shortcuts are registered
   */
  setAction(id: string, action: () => void | Promise<void>): void {
    const shortcut = this.shortcuts.get(id);
    if (shortcut) {
      shortcut.action = action;
    }
  }

  /**
   * Get all registered shortcuts
   */
  getAllShortcuts(): RegisteredShortcut[] {
    return Array.from(this.shortcuts.values());
  }

  /**
   * Get shortcuts grouped by category
   */
  getShortcutsByCategory(): Map<ShortcutCategory, RegisteredShortcut[]> {
    const groups = new Map<ShortcutCategory, RegisteredShortcut[]>();
    for (const shortcut of this.shortcuts.values()) {
      const list = groups.get(shortcut.category) || [];
      list.push(shortcut);
      groups.set(shortcut.category, list);
    }
    return groups;
  }

  /**
   * Get a shortcut by ID
   */
  getShortcut(id: string): RegisteredShortcut | undefined {
    return this.shortcuts.get(id);
  }

  /**
   * Get the active binding for a shortcut (user override or default)
   */
  getActiveBinding(id: string): KeyBinding | null {
    const shortcut = this.shortcuts.get(id);
    if (!shortcut) return null;

    // User binding can be explicitly null (disabled) or undefined (use default)
    if (shortcut.userBinding === null) {
      return null; // Explicitly disabled
    }
    if (shortcut.userBinding !== undefined) {
      return shortcut.userBinding;
    }
    return shortcut.defaultBinding;
  }

  /**
   * Format a shortcut's active binding for display
   */
  formatShortcut(id: string): string {
    const binding = this.getActiveBinding(id);
    if (!binding) return '';
    return formatBinding(binding, this._isMac);
  }

  /**
   * Set a custom binding for a shortcut
   * Pass null to disable, undefined to reset to default
   */
  setUserBinding(id: string, binding: KeyBinding | null | undefined): void {
    const shortcut = this.shortcuts.get(id);
    if (!shortcut) return;

    if (binding === undefined) {
      // Reset to default
      delete this.userConfig.bindings[id];
      shortcut.userBinding = undefined;
    } else {
      // Set custom (or disable with null)
      this.userConfig.bindings[id] = binding;
      shortcut.userBinding = binding;
    }

    this.saveUserConfig();
    this.notifyListeners();
  }

  /**
   * Reset a shortcut to its default binding
   */
  resetToDefault(id: string): void {
    this.setUserBinding(id, undefined);
  }

  /**
   * Reset all shortcuts to defaults
   */
  resetAllToDefaults(): void {
    this.userConfig.bindings = {};
    for (const shortcut of this.shortcuts.values()) {
      shortcut.userBinding = undefined;
    }
    this.saveUserConfig();
    this.notifyListeners();
  }

  /**
   * Find a conflict if a binding is already used by another shortcut
   */
  findConflict(binding: KeyBinding, excludeId?: string): ShortcutConflict | null {
    for (const shortcut of this.shortcuts.values()) {
      if (excludeId && shortcut.id === excludeId) continue;

      const activeBinding = this.getActiveBinding(shortcut.id);
      if (activeBinding && bindingsEqual(activeBinding, binding)) {
        return {
          existingShortcut: shortcut,
          binding,
        };
      }
    }
    return null;
  }

  /**
   * Handle a keyboard event
   * Returns true if the event was handled
   */
  handleKeyEvent(event: KeyboardEvent): boolean {
    // Don't handle if user is typing in an input
    const target = event.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      // Exception: still handle shortcuts with Cmd/Ctrl
      if (!event.metaKey && !event.ctrlKey) {
        return false;
      }
    }

    for (const shortcut of this.shortcuts.values()) {
      const binding = this.getActiveBinding(shortcut.id);
      if (!binding) continue;

      if (eventMatchesBinding(event, binding, this._isMac)) {
        // Check condition
        if (shortcut.when && !shortcut.when()) continue;

        event.preventDefault();
        event.stopPropagation();

        // Execute action
        try {
          const result = shortcut.action();
          if (result instanceof Promise) {
            result.catch((err) => {
              console.error(`[KeyboardShortcuts] Error executing ${shortcut.id}:`, err);
            });
          }
        } catch (err) {
          console.error(`[KeyboardShortcuts] Error executing ${shortcut.id}:`, err);
        }

        return true;
      }
    }

    return false;
  }

  /**
   * Start listening for keyboard events globally
   */
  startListening(): void {
    if (this.keydownHandler) return;

    this.keydownHandler = (e: KeyboardEvent) => {
      this.handleKeyEvent(e);
    };

    window.addEventListener('keydown', this.keydownHandler, { capture: true });
  }

  /**
   * Stop listening for keyboard events
   */
  stopListening(): void {
    if (this.keydownHandler) {
      window.removeEventListener('keydown', this.keydownHandler, { capture: true });
      this.keydownHandler = null;
    }
  }

  /**
   * Get commands for the Command Palette
   */
  getPaletteCommands(): PaletteCommand[] {
    const categoryLabels: Record<ShortcutCategory, string> = {
      general: 'General',
      navigation: 'Navigation',
      editor: 'Editor',
      view: 'View',
    };

    return Array.from(this.shortcuts.values())
      .filter((shortcut) => !shortcut.when || shortcut.when())
      .map((shortcut) => ({
        id: shortcut.id,
        label: shortcut.label,
        category: categoryLabels[shortcut.category],
        keybinding: this.formatShortcut(shortcut.id),
        execute: shortcut.action,
      }));
  }

  /**
   * Subscribe to shortcut changes (for UI updates)
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

// Singleton instance
let instance: KeyboardShortcutService | null = null;

export function getKeyboardShortcutService(): KeyboardShortcutService {
  if (!instance) {
    instance = new KeyboardShortcutService();
  }
  return instance;
}

// Export the type for typing the service
export type { KeyboardShortcutService };
