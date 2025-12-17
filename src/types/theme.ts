/**
 * Theme System Type Definitions
 *
 * Comprehensive types for the customizable theme system including
 * syntax highlighting, UI colors, terminal colors, and fonts.
 */

/**
 * Theme metadata for identification and management
 */
export interface ThemeMetadata {
  /** Unique identifier (UUID for user themes, fixed IDs for builtins) */
  id: string;
  /** Display name */
  name: string;
  /** Theme author */
  author?: string;
  /** Theme version */
  version?: string;
  /** Theme description */
  description?: string;
  /** Base theme for Monaco inheritance */
  baseTheme: 'dark' | 'light';
  /** True for bundled themes that cannot be deleted */
  isBuiltin: boolean;
  /** Creation timestamp */
  createdAt?: number;
  /** Last modified timestamp */
  modifiedAt?: number;
}

/**
 * Syntax highlighting colors for code
 */
export interface SyntaxColors {
  // Keywords
  keyword: string;
  controlKeyword: string;
  typeKeyword: string;
  useKeyword: string;
  linkKeyword: string;
  dataTypeKeyword: string;
  docKeyword: string;

  // References
  typeReference: string;
  termReference: string;
  hashQualifier: string;

  // Namespace variants
  typeNamespace: string;
  termNamespace: string;
  constructorNamespace: string;

  // Operators and punctuation
  operator: string;
  typeAscription: string;
  bindingEquals: string;
  delayForce: string;
  arrow: string;

  // Delimiters
  abilityBraces: string;
  dataTypeParams: string;
  dataTypeModifier: string;
  parenthesis: string;
  brackets: string;

  // Literals
  number: string;
  string: string;
  boolean: string;
  char: string;

  // Comments and documentation
  comment: string;
  docBlock: string;
  docCode: string;
  docDirective: string;

  // Constructor
  constructor: string;

  // Pattern matching
  pattern: string;
}

/**
 * UI colors for the application interface
 */
export interface UIColors {
  // Editor
  editorBackground: string;
  editorForeground: string;
  editorSelection: string;
  editorLineHighlight: string;
  editorCursor: string;
  editorGutter: string;
  editorLineNumbers: string;
  editorLineNumbersActive: string;
  editorIndentGuide: string;
  editorWhitespace: string;
  editorBracketMatch: string;
  editorBracketMatchBorder: string;
  editorFindMatch: string;
  editorFindMatchHighlight: string;
  editorWordHighlight: string;

  // App chrome
  appBackground: string;
  appForeground: string;
  appForegroundMuted: string;
  appForegroundDisabled: string;
  appBorder: string;
  headerBackground: string;
  headerForeground: string;
  headerBorder: string;

  // Sidebar / Navigation
  sidebarBackground: string;
  sidebarItemHover: string;

  // Workspace Panel (in sidebar)
  workspacePanelHeaderBackground: string;
  workspacePanelHeaderForeground: string;
  workspacePanelBackground: string;
  workspacePanelForeground: string;

  // File Explorer Panel (in sidebar)
  fileExplorerPanelHeaderBackground: string;
  fileExplorerPanelHeaderForeground: string;
  fileExplorerPanelBackground: string;
  fileExplorerPanelForeground: string;

  // Outline Panel (in sidebar)
  outlinePanelHeaderBackground: string;
  outlinePanelHeaderForeground: string;
  outlinePanelBackground: string;
  outlinePanelForeground: string;

  // UCM Explorer Panel (in sidebar)
  ucmExplorerPanelHeaderBackground: string;
  ucmExplorerPanelHeaderForeground: string;
  ucmExplorerPanelBackground: string;
  ucmExplorerPanelForeground: string;

  // Tabs
  tabBackground: string;
  tabForeground: string;
  tabActiveBackground: string;
  tabActiveForeground: string;
  tabBorder: string;
  tabActiveBorder: string;
  tabHoverBackground: string;
  tabDirtyIndicator: string;

  // Panels (definitions, output, logs)
  panelBackground: string;
  panelForeground: string;
  panelBorder: string;
  panelHeaderBackground: string;
  panelHeaderForeground: string;
  panelTabBackground: string;
  panelTabForeground: string;
  panelTabActiveBackground: string;
  panelTabActiveForeground: string;

  // Inputs and controls
  inputBackground: string;
  inputForeground: string;
  inputBorder: string;
  inputFocusBorder: string;
  inputPlaceholder: string;
  buttonBackground: string;
  buttonForeground: string;
  buttonHoverBackground: string;
  buttonSecondaryBackground: string;
  buttonSecondaryForeground: string;
  buttonSecondaryHoverBackground: string;
  buttonSecondaryBorder: string;

  // Checkboxes and toggles
  checkboxBackground: string;
  checkboxBorder: string;
  checkboxCheckedBackground: string;
  checkboxCheckedForeground: string;

  // Scrollbars
  scrollbarThumb: string;
  scrollbarTrack: string;
  scrollbarThumbHover: string;

  // Status colors
  statusSuccess: string;
  statusSuccessForeground: string;
  statusSuccessSubtle: string;
  statusWarning: string;
  statusWarningForeground: string;
  statusWarningSubtle: string;
  statusError: string;
  statusErrorForeground: string;
  statusErrorSubtle: string;
  statusInfo: string;
  statusInfoForeground: string;
  statusInfoSubtle: string;

  // Dividers and separators
  divider: string;
  dividerHover: string;
  dividerActive: string;
  border: string;
  borderSubtle: string;

  // Focus / accent
  focusRing: string;
  accent: string;
  accentForeground: string;
  accentHover: string;
  accentSubtle: string;

  // Syntax highlight backgrounds (for badges/labels in UI)
  syntaxTypeSubtle: string;
  syntaxTypeHighlight: string;
  syntaxTermSubtle: string;
  syntaxTermHighlight: string;
  syntaxKeywordSubtle: string;
  syntaxKeywordHighlight: string;

  // Modals and overlays
  modalBackground: string;
  modalForeground: string;
  modalBorder: string;
  overlayBackground: string;

  // Tooltip
  tooltipBackground: string;
  tooltipForeground: string;
  tooltipBorder: string;

  // Links
  linkForeground: string;
  linkHoverForeground: string;

  // Selection
  selectionBackground: string;
  selectionForeground: string;

  // List items
  listHoverBackground: string;
  listActiveBackground: string;
  listActiveForeground: string;
  listFocusBackground: string;
  listActiveFocusBackground: string;

  // Badges
  badgeBackground: string;
  badgeForeground: string;

  // Progress
  progressBackground: string;
  progressForeground: string;
}

/**
 * Terminal colors (xterm.js ANSI palette)
 */
export interface TerminalColors {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
  selectionForeground: string;

  // Standard 8 ANSI colors
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;

  // Bright 8 ANSI colors
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

/**
 * Font settings for different areas
 */
export interface FontSettings {
  // Editor fonts
  editorFontFamily: string;
  editorFontSize: number;
  editorLineHeight: number;
  editorFontWeight: number;
  editorLetterSpacing: number;

  // Terminal fonts
  terminalFontFamily: string;
  terminalFontSize: number;
  terminalLineHeight: number;
  terminalFontWeight: number;

  // UI fonts
  uiFontFamily: string;
  uiFontSize: number;
  uiLineHeight: number;

  // Monospace font for code in UI
  monoFontFamily: string;
}

/**
 * Complete theme definition
 */
export interface Theme {
  metadata: ThemeMetadata;
  syntax: SyntaxColors;
  ui: UIColors;
  terminal: TerminalColors;
  fonts: FontSettings;
}

/**
 * Theme export format (for import/export)
 */
export interface ThemeExport {
  /** Schema version for future compatibility */
  version: 1;
  /** The theme data */
  theme: Theme;
}

/**
 * Partial theme for customization (user can override specific values)
 */
export type PartialTheme = {
  metadata?: Partial<ThemeMetadata>;
  syntax?: Partial<SyntaxColors>;
  ui?: Partial<UIColors>;
  terminal?: Partial<TerminalColors>;
  fonts?: Partial<FontSettings>;
};

/**
 * Theme category for UI organization
 */
export type ThemeCategory = 'syntax' | 'ui' | 'terminal' | 'fonts';

/**
 * Color group within a category
 */
export interface ColorGroup {
  id: string;
  label: string;
  colors: ColorDefinition[];
}

/**
 * Individual color definition for the settings UI
 */
export interface ColorDefinition {
  key: string;
  label: string;
  description?: string;
  category: ThemeCategory;
  subCategory?: string;
}

/**
 * Font definition for the settings UI
 */
export interface FontDefinition {
  key: keyof FontSettings;
  label: string;
  description?: string;
  type: 'family' | 'size' | 'weight' | 'lineHeight' | 'letterSpacing';
  min?: number;
  max?: number;
  step?: number;
}

/**
 * Theme change event for listeners
 */
export interface ThemeChangeEvent {
  previousTheme: Theme | null;
  newTheme: Theme;
  changedCategories: ThemeCategory[];
}

/**
 * Theme validation result
 */
export interface ThemeValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
