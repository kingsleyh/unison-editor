/**
 * Theme Service
 *
 * Singleton service for managing themes throughout the application.
 * Handles loading, saving, switching, importing, and exporting themes.
 */

import type {
  Theme,
  ThemeExport,
  PartialTheme,
  ThemeChangeEvent,
  ThemeValidationResult,
  ThemeCategory,
} from '../types/theme';
import { builtinThemes, getDefaultTheme, getBuiltinTheme } from './defaultThemes';

// localStorage keys
const STORAGE_ACTIVE_THEME_ID = 'unison-active-theme-id';
const STORAGE_SAVED_THEMES = 'unison-saved-themes';

// Event types
type ThemeChangeListener = (event: ThemeChangeEvent) => void;

/**
 * Theme Service Singleton
 */
class ThemeService {
  private static instance: ThemeService;

  private activeTheme: Theme;
  private savedThemes: Theme[] = [];
  private listeners: Set<ThemeChangeListener> = new Set();

  private constructor() {
    this.activeTheme = getDefaultTheme();
    this.loadSavedThemes();
    this.loadActiveTheme();
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): ThemeService {
    if (!ThemeService.instance) {
      ThemeService.instance = new ThemeService();
    }
    return ThemeService.instance;
  }

  // ─────────────────────────────────────────────────────────────
  // Theme Access
  // ─────────────────────────────────────────────────────────────

  /**
   * Get the currently active theme
   */
  getActiveTheme(): Theme {
    return this.activeTheme;
  }

  /**
   * Get a theme by ID (builtin or saved)
   */
  getTheme(id: string): Theme | undefined {
    const builtin = getBuiltinTheme(id);
    if (builtin) return builtin;
    return this.savedThemes.find(t => t.metadata.id === id);
  }

  /**
   * Get all available themes (builtin + saved)
   */
  getAllThemes(): Theme[] {
    return [...builtinThemes, ...this.savedThemes];
  }

  /**
   * Get only builtin themes
   */
  getBuiltinThemes(): Theme[] {
    return [...builtinThemes];
  }

  /**
   * Get only user-saved themes
   */
  getSavedThemes(): Theme[] {
    return [...this.savedThemes];
  }

  // ─────────────────────────────────────────────────────────────
  // Theme Switching
  // ─────────────────────────────────────────────────────────────

  /**
   * Switch to a different theme by ID
   */
  switchTheme(themeId: string): boolean {
    const theme = this.getTheme(themeId);
    if (!theme) {
      console.warn(`Theme not found: ${themeId}`);
      return false;
    }

    const previousTheme = this.activeTheme;
    this.activeTheme = theme;

    // Save active theme ID
    this.saveActiveThemeId(themeId);

    // Apply the theme
    this.applyTheme(theme);

    // Notify listeners
    this.notifyListeners(previousTheme, theme, ['syntax', 'ui', 'terminal', 'fonts']);

    return true;
  }

  /**
   * Apply a theme without saving it (for preview)
   * This also notifies Monaco and terminal to update their themes
   */
  previewTheme(theme: Theme): void {
    this.applyTheme(theme);
    // Notify listeners so Monaco and terminal update their themes
    this.notifyListeners(null, theme, ['syntax', 'ui', 'terminal', 'fonts']);
  }

  /**
   * Revert to the actual active theme (after preview)
   */
  revertPreview(): void {
    this.applyTheme(this.activeTheme);
    // Notify listeners so Monaco and terminal revert their themes
    this.notifyListeners(null, this.activeTheme, ['syntax', 'ui', 'terminal', 'fonts']);
  }

  // ─────────────────────────────────────────────────────────────
  // Theme Modification
  // ─────────────────────────────────────────────────────────────

  /**
   * Update the active theme with partial changes (live editing)
   */
  updateActiveTheme(changes: PartialTheme): void {
    const previousTheme = { ...this.activeTheme };

    // Deep merge changes
    if (changes.metadata) {
      this.activeTheme.metadata = { ...this.activeTheme.metadata, ...changes.metadata };
    }
    if (changes.syntax) {
      this.activeTheme.syntax = { ...this.activeTheme.syntax, ...changes.syntax };
    }
    if (changes.ui) {
      this.activeTheme.ui = { ...this.activeTheme.ui, ...changes.ui };
    }
    if (changes.terminal) {
      this.activeTheme.terminal = { ...this.activeTheme.terminal, ...changes.terminal };
    }
    if (changes.fonts) {
      this.activeTheme.fonts = { ...this.activeTheme.fonts, ...changes.fonts };
    }

    // Apply changes immediately
    this.applyTheme(this.activeTheme);

    // Determine which categories changed
    const changedCategories: ThemeCategory[] = [];
    if (changes.syntax) changedCategories.push('syntax');
    if (changes.ui) changedCategories.push('ui');
    if (changes.terminal) changedCategories.push('terminal');
    if (changes.fonts) changedCategories.push('fonts');

    // Notify listeners
    this.notifyListeners(previousTheme, this.activeTheme, changedCategories);
  }

  // ─────────────────────────────────────────────────────────────
  // Theme CRUD
  // ─────────────────────────────────────────────────────────────

  /**
   * Set the active theme data (for applying edits from theme settings)
   */
  setActiveThemeData(theme: Theme): void {
    this.activeTheme = this.deepCloneTheme(theme);
    this.applyTheme(this.activeTheme);
    this.notifyListeners(null, this.activeTheme, ['syntax', 'ui', 'terminal', 'fonts']);
  }

  /**
   * Save the current theme as a new user theme
   */
  saveThemeAs(name: string, author?: string): Theme {
    const newTheme: Theme = {
      ...this.deepCloneTheme(this.activeTheme),
      metadata: {
        ...this.activeTheme.metadata,
        id: this.generateId(),
        name,
        author: author || 'User',
        isBuiltin: false,
        createdAt: Date.now(),
        modifiedAt: Date.now(),
      },
    };

    this.savedThemes.push(newTheme);
    this.persistSavedThemes();

    // Switch to the new theme
    this.activeTheme = newTheme;
    this.saveActiveThemeId(newTheme.metadata.id);
    this.notifyListeners(null, newTheme, []);

    return newTheme;
  }

  /**
   * Save changes to the current theme (if it's a user theme)
   */
  saveCurrentTheme(): boolean {
    if (this.activeTheme.metadata.isBuiltin) {
      console.warn('Cannot save changes to builtin themes');
      return false;
    }

    // Update modification timestamp
    this.activeTheme.metadata.modifiedAt = Date.now();

    // Update in saved themes array
    const index = this.savedThemes.findIndex(t => t.metadata.id === this.activeTheme.metadata.id);
    if (index !== -1) {
      this.savedThemes[index] = this.deepCloneTheme(this.activeTheme);
      this.persistSavedThemes();
      return true;
    }

    return false;
  }

  /**
   * Delete a user theme
   */
  deleteTheme(themeId: string): boolean {
    const theme = this.getTheme(themeId);
    if (!theme || theme.metadata.isBuiltin) {
      console.warn('Cannot delete builtin theme or theme not found');
      return false;
    }

    // Remove from saved themes
    this.savedThemes = this.savedThemes.filter(t => t.metadata.id !== themeId);
    this.persistSavedThemes();

    // If deleting the active theme, switch to default
    if (this.activeTheme.metadata.id === themeId) {
      this.switchTheme(getDefaultTheme().metadata.id);
    }

    return true;
  }

  /**
   * Duplicate an existing theme
   */
  duplicateTheme(themeId: string, newName?: string): Theme | null {
    const sourceTheme = this.getTheme(themeId);
    if (!sourceTheme) return null;

    const duplicatedTheme: Theme = {
      ...this.deepCloneTheme(sourceTheme),
      metadata: {
        ...sourceTheme.metadata,
        id: this.generateId(),
        name: newName || `${sourceTheme.metadata.name} (Copy)`,
        isBuiltin: false,
        createdAt: Date.now(),
        modifiedAt: Date.now(),
      },
    };

    this.savedThemes.push(duplicatedTheme);
    this.persistSavedThemes();

    return duplicatedTheme;
  }

  // ─────────────────────────────────────────────────────────────
  // Import / Export
  // ─────────────────────────────────────────────────────────────

  /**
   * Export a theme as JSON string
   */
  exportTheme(themeId: string): string | null {
    const theme = this.getTheme(themeId);
    if (!theme) return null;

    const exportData: ThemeExport = {
      version: 1,
      theme: this.deepCloneTheme(theme),
    };

    // Mark as not builtin for export
    exportData.theme.metadata.isBuiltin = false;

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Export active theme as JSON string
   */
  exportActiveTheme(): string {
    const exportData: ThemeExport = {
      version: 1,
      theme: this.deepCloneTheme(this.activeTheme),
    };

    exportData.theme.metadata.isBuiltin = false;

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Import a theme from JSON string
   */
  importTheme(jsonString: string): Theme | null {
    const validation = this.validateThemeJson(jsonString);
    if (!validation.valid) {
      console.error('Theme validation failed:', validation.errors);
      return null;
    }

    try {
      const data = JSON.parse(jsonString) as ThemeExport;
      const theme = data.theme;

      // Generate new ID and mark as user theme
      theme.metadata.id = this.generateId();
      theme.metadata.isBuiltin = false;
      theme.metadata.createdAt = Date.now();
      theme.metadata.modifiedAt = Date.now();

      // Ensure unique name
      let name = theme.metadata.name;
      let counter = 1;
      while (this.getAllThemes().some(t => t.metadata.name === name)) {
        name = `${theme.metadata.name} (${counter++})`;
      }
      theme.metadata.name = name;

      this.savedThemes.push(theme);
      this.persistSavedThemes();

      return theme;
    } catch (error) {
      console.error('Failed to import theme:', error);
      return null;
    }
  }

  /**
   * Validate theme JSON before import
   */
  validateThemeJson(jsonString: string): ThemeValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const data = JSON.parse(jsonString);

      if (!data.version || data.version !== 1) {
        errors.push('Invalid or missing version field');
      }

      if (!data.theme) {
        errors.push('Missing theme data');
        return { valid: false, errors, warnings };
      }

      const theme = data.theme;

      // Validate metadata
      if (!theme.metadata) {
        errors.push('Missing theme metadata');
      } else {
        if (!theme.metadata.name) errors.push('Missing theme name');
        if (!theme.metadata.baseTheme) errors.push('Missing baseTheme');
      }

      // Validate syntax colors
      if (!theme.syntax) {
        errors.push('Missing syntax colors');
      } else {
        const requiredSyntax = ['keyword', 'typeReference', 'termReference', 'operator'];
        requiredSyntax.forEach(key => {
          if (!theme.syntax[key]) warnings.push(`Missing syntax color: ${key}`);
        });
      }

      // Validate UI colors
      if (!theme.ui) {
        errors.push('Missing UI colors');
      } else {
        const requiredUI = ['editorBackground', 'editorForeground', 'appBackground'];
        requiredUI.forEach(key => {
          if (!theme.ui[key]) warnings.push(`Missing UI color: ${key}`);
        });
      }

      // Validate terminal colors
      if (!theme.terminal) {
        warnings.push('Missing terminal colors - defaults will be used');
      }

      // Validate fonts
      if (!theme.fonts) {
        warnings.push('Missing font settings - defaults will be used');
      }

    } catch (error) {
      errors.push(`Invalid JSON: ${(error as Error).message}`);
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  // ─────────────────────────────────────────────────────────────
  // Event Listeners
  // ─────────────────────────────────────────────────────────────

  /**
   * Subscribe to theme changes
   */
  onThemeChange(listener: ThemeChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners of a theme change
   */
  private notifyListeners(
    previousTheme: Theme | null,
    newTheme: Theme,
    changedCategories: ThemeCategory[]
  ): void {
    const event: ThemeChangeEvent = {
      previousTheme,
      newTheme,
      changedCategories,
    };

    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('Theme change listener error:', error);
      }
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Theme Application (CSS, Monaco, Terminal)
  // ─────────────────────────────────────────────────────────────

  /**
   * Apply a theme to all targets
   */
  applyTheme(theme: Theme): void {
    this.applyCssVariables(theme);
    // Monaco and Terminal themes are handled by their respective components
    // via the onThemeChange listener
  }

  /**
   * Apply CSS variables to document root
   */
  private applyCssVariables(theme: Theme): void {
    const root = document.documentElement;

    // Syntax colors
    Object.entries(theme.syntax).forEach(([key, value]) => {
      root.style.setProperty(`--color-syntax-${this.kebabCase(key)}`, value);
    });

    // UI colors
    Object.entries(theme.ui).forEach(([key, value]) => {
      root.style.setProperty(`--color-${this.kebabCase(key)}`, value);
    });

    // Terminal colors (with terminal prefix)
    Object.entries(theme.terminal).forEach(([key, value]) => {
      root.style.setProperty(`--color-terminal-${this.kebabCase(key)}`, value);
    });

    // Font settings
    root.style.setProperty('--font-editor-family', theme.fonts.editorFontFamily);
    root.style.setProperty('--font-editor-size', `${theme.fonts.editorFontSize}px`);
    root.style.setProperty('--font-editor-line-height', String(theme.fonts.editorLineHeight));
    root.style.setProperty('--font-editor-weight', String(theme.fonts.editorFontWeight));
    root.style.setProperty('--font-editor-letter-spacing', `${theme.fonts.editorLetterSpacing}px`);

    root.style.setProperty('--font-terminal-family', theme.fonts.terminalFontFamily);
    root.style.setProperty('--font-terminal-size', `${theme.fonts.terminalFontSize}px`);
    root.style.setProperty('--font-terminal-line-height', String(theme.fonts.terminalLineHeight));
    root.style.setProperty('--font-terminal-weight', String(theme.fonts.terminalFontWeight));

    root.style.setProperty('--font-ui-family', theme.fonts.uiFontFamily);
    root.style.setProperty('--font-ui-size', `${theme.fonts.uiFontSize}px`);
    root.style.setProperty('--font-ui-line-height', String(theme.fonts.uiLineHeight));

    root.style.setProperty('--font-mono-family', theme.fonts.monoFontFamily);

    // Set base theme class for conditional styling
    root.classList.toggle('theme-light', theme.metadata.baseTheme === 'light');
    root.classList.toggle('theme-dark', theme.metadata.baseTheme === 'dark');
  }

  /**
   * Generate Monaco theme data from current theme
   */
  getMonacoTheme(): ReturnType<typeof this.generateMonacoThemeData> {
    return this.generateMonacoThemeData(this.activeTheme);
  }

  /**
   * Generate Monaco theme data from a theme
   */
  generateMonacoThemeData(theme: Theme) {
    const stripHash = (color: string) => color.replace('#', '');

    return {
      base: theme.metadata.baseTheme === 'dark' ? 'vs-dark' as const : 'vs' as const,
      inherit: true,
      rules: [
        // Keywords
        { token: 'keyword', foreground: stripHash(theme.syntax.keyword) },
        { token: 'keyword.control', foreground: stripHash(theme.syntax.controlKeyword) },
        { token: 'keyword.type', foreground: stripHash(theme.syntax.typeKeyword) },
        { token: 'keyword.use', foreground: stripHash(theme.syntax.useKeyword) },
        { token: 'keyword.link', foreground: stripHash(theme.syntax.linkKeyword) },
        { token: 'keyword.datatype', foreground: stripHash(theme.syntax.dataTypeKeyword) },
        { token: 'keyword.doc', foreground: stripHash(theme.syntax.docKeyword) },

        // References
        { token: 'type.identifier', foreground: stripHash(theme.syntax.typeReference) },
        { token: 'type', foreground: stripHash(theme.syntax.typeReference) },
        { token: 'identifier', foreground: stripHash(theme.syntax.termReference) },
        { token: 'variable', foreground: stripHash(theme.syntax.termReference) },
        { token: 'hash', foreground: stripHash(theme.syntax.hashQualifier) },

        // Namespaces
        { token: 'namespace.type', foreground: stripHash(theme.syntax.typeNamespace) },
        { token: 'namespace.term', foreground: stripHash(theme.syntax.termNamespace) },
        { token: 'namespace.constructor', foreground: stripHash(theme.syntax.constructorNamespace) },

        // Operators
        { token: 'operator', foreground: stripHash(theme.syntax.operator) },
        { token: 'operator.ascription', foreground: stripHash(theme.syntax.typeAscription) },
        { token: 'operator.equals', foreground: stripHash(theme.syntax.bindingEquals) },
        { token: 'operator.delay', foreground: stripHash(theme.syntax.delayForce) },
        { token: 'operator.arrow', foreground: stripHash(theme.syntax.arrow) },

        // Delimiters
        { token: 'delimiter', foreground: stripHash(theme.syntax.parenthesis) },
        { token: 'delimiter.parenthesis', foreground: stripHash(theme.syntax.parenthesis) },
        { token: 'delimiter.bracket', foreground: stripHash(theme.syntax.brackets) },
        { token: 'delimiter.square', foreground: stripHash(theme.syntax.brackets) },
        { token: 'delimiter.curly', foreground: stripHash(theme.syntax.abilityBraces) },
        { token: 'delimiter.ability', foreground: stripHash(theme.syntax.abilityBraces) },

        // Literals
        { token: 'number', foreground: stripHash(theme.syntax.number) },
        { token: 'string', foreground: stripHash(theme.syntax.string) },
        { token: 'string.char', foreground: stripHash(theme.syntax.char) },
        { token: 'constant.boolean', foreground: stripHash(theme.syntax.boolean) },

        // Comments
        { token: 'comment', foreground: stripHash(theme.syntax.comment) },
        { token: 'comment.doc', foreground: stripHash(theme.syntax.docBlock) },
        { token: 'doc', foreground: stripHash(theme.syntax.docBlock) },
        { token: 'doc.code', foreground: stripHash(theme.syntax.docCode) },
        { token: 'doc.directive', foreground: stripHash(theme.syntax.docDirective) },

        // Constructor
        { token: 'constructor', foreground: stripHash(theme.syntax.constructor) },
        { token: 'tag', foreground: stripHash(theme.syntax.constructor) },

        // Pattern
        { token: 'pattern', foreground: stripHash(theme.syntax.pattern) },
      ],
      colors: {
        'editor.background': theme.ui.editorBackground,
        'editor.foreground': theme.ui.editorForeground,
        'editor.selectionBackground': theme.ui.editorSelection,
        'editor.lineHighlightBackground': theme.ui.editorLineHighlight,
        'editorCursor.foreground': theme.ui.editorCursor,
        'editorGutter.background': theme.ui.editorGutter,
        'editorLineNumber.foreground': theme.ui.editorLineNumbers,
        'editorLineNumber.activeForeground': theme.ui.editorLineNumbersActive,
        'editorIndentGuide.background': theme.ui.editorIndentGuide,
        'editorWhitespace.foreground': theme.ui.editorWhitespace,
        'editorBracketMatch.background': theme.ui.editorBracketMatch,
        'editorBracketMatch.border': theme.ui.editorBracketMatchBorder,
        'editor.findMatchBackground': theme.ui.editorFindMatch,
        'editor.findMatchHighlightBackground': theme.ui.editorFindMatchHighlight,
        'editor.wordHighlightBackground': theme.ui.editorWordHighlight,
        'scrollbar.shadow': '#00000000',
        'scrollbarSlider.background': theme.ui.scrollbarThumb,
        'scrollbarSlider.hoverBackground': theme.ui.scrollbarThumbHover,
        'scrollbarSlider.activeBackground': theme.ui.scrollbarThumbHover,
      },
    };
  }

  /**
   * Get terminal theme for xterm.js
   */
  getTerminalTheme(): Record<string, string> {
    return this.generateTerminalThemeData(this.activeTheme);
  }

  /**
   * Generate xterm.js theme data from a theme
   */
  generateTerminalThemeData(theme: Theme): Record<string, string> {
    return {
      background: theme.terminal.background,
      foreground: theme.terminal.foreground,
      cursor: theme.terminal.cursor,
      cursorAccent: theme.terminal.cursorAccent,
      selectionBackground: theme.terminal.selectionBackground,
      selectionForeground: theme.terminal.selectionForeground,
      black: theme.terminal.black,
      red: theme.terminal.red,
      green: theme.terminal.green,
      yellow: theme.terminal.yellow,
      blue: theme.terminal.blue,
      magenta: theme.terminal.magenta,
      cyan: theme.terminal.cyan,
      white: theme.terminal.white,
      brightBlack: theme.terminal.brightBlack,
      brightRed: theme.terminal.brightRed,
      brightGreen: theme.terminal.brightGreen,
      brightYellow: theme.terminal.brightYellow,
      brightBlue: theme.terminal.brightBlue,
      brightMagenta: theme.terminal.brightMagenta,
      brightCyan: theme.terminal.brightCyan,
      brightWhite: theme.terminal.brightWhite,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Persistence
  // ─────────────────────────────────────────────────────────────

  /**
   * Load saved themes from localStorage
   */
  private loadSavedThemes(): void {
    try {
      const saved = localStorage.getItem(STORAGE_SAVED_THEMES);
      if (saved) {
        this.savedThemes = JSON.parse(saved);
      }
    } catch (error) {
      console.warn('Failed to load saved themes:', error);
      this.savedThemes = [];
    }
  }

  /**
   * Save themes to localStorage
   */
  private persistSavedThemes(): void {
    try {
      localStorage.setItem(STORAGE_SAVED_THEMES, JSON.stringify(this.savedThemes));
    } catch (error) {
      console.error('Failed to save themes:', error);
    }
  }

  /**
   * Load active theme from localStorage
   */
  private loadActiveTheme(): void {
    try {
      const savedId = localStorage.getItem(STORAGE_ACTIVE_THEME_ID);
      if (savedId) {
        const theme = this.getTheme(savedId);
        if (theme) {
          this.activeTheme = theme;
        }
      }
    } catch (error) {
      console.warn('Failed to load active theme:', error);
    }

    // Apply the active theme
    this.applyTheme(this.activeTheme);
  }

  /**
   * Save active theme ID to localStorage
   */
  private saveActiveThemeId(themeId: string): void {
    try {
      localStorage.setItem(STORAGE_ACTIVE_THEME_ID, themeId);
    } catch (error) {
      console.error('Failed to save active theme ID:', error);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Utilities
  // ─────────────────────────────────────────────────────────────

  /**
   * Generate a unique ID for new themes
   */
  private generateId(): string {
    return `user-theme-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Convert camelCase to kebab-case
   */
  private kebabCase(str: string): string {
    return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  }

  /**
   * Deep clone a theme object
   */
  private deepCloneTheme(theme: Theme): Theme {
    return JSON.parse(JSON.stringify(theme));
  }

  /**
   * Reset to default theme
   */
  resetToDefault(): void {
    this.switchTheme(getDefaultTheme().metadata.id);
  }

  /**
   * Check if a theme has unsaved changes
   */
  hasUnsavedChanges(themeId: string): boolean {
    if (this.activeTheme.metadata.id !== themeId) return false;
    if (this.activeTheme.metadata.isBuiltin) return false;

    const saved = this.savedThemes.find(t => t.metadata.id === themeId);
    if (!saved) return false;

    return JSON.stringify(this.activeTheme) !== JSON.stringify(saved);
  }
}

// Export singleton instance
export const themeService = ThemeService.getInstance();

// Export class for type reference
export type { ThemeService };
