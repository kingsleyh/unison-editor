/**
 * Default Theme Definitions
 *
 * Built-in themes that ship with the editor.
 * These serve as the base for user customization.
 */

import type { Theme, SyntaxColors, UIColors, TerminalColors, FontSettings } from '../types/theme';

/**
 * Default Dark Theme Syntax Colors
 * Based on UCM Desktop / VS Code dark colors
 */
const darkSyntax: SyntaxColors = {
  // Keywords
  keyword: '#C586C0',           // Purple - general keywords
  controlKeyword: '#C586C0',    // Purple - if, then, else, match
  typeKeyword: '#569CD6',       // Blue - type, ability, unique
  useKeyword: '#C586C0',        // Purple - use keyword
  linkKeyword: '#C586C0',       // Purple - @, @@
  dataTypeKeyword: '#569CD6',   // Blue - structural, unique type
  docKeyword: '#608B4E',        // Dark green - doc keywords

  // References
  typeReference: '#4EC9B0',     // Teal - Type names
  termReference: '#9CDCFE',     // Light blue - function/value names
  hashQualifier: '#DCDCAA',     // Yellow - qualified names

  // Namespace variants
  typeNamespace: '#4EC9B0',     // Teal
  termNamespace: '#9CDCFE',     // Light blue
  constructorNamespace: '#4EC9B0', // Teal

  // Operators and punctuation
  operator: '#D4D4D4',          // Light gray
  typeAscription: '#D4D4D4',    // Light gray - :
  bindingEquals: '#D4D4D4',     // Light gray - =
  delayForce: '#D7BA7D',        // Gold - ' (delay/force)
  arrow: '#D4D4D4',             // Light gray - ->

  // Delimiters
  abilityBraces: '#CE9178',     // Orange - { } for abilities
  dataTypeParams: '#9CDCFE',    // Light blue - type parameters
  dataTypeModifier: '#569CD6',  // Blue - unique, structural
  parenthesis: '#D4D4D4',       // Light gray - ( )
  brackets: '#D4D4D4',          // Light gray - [ ]

  // Literals
  number: '#B5CEA8',            // Light green
  string: '#CE9178',            // Orange
  boolean: '#569CD6',           // Blue - true/false
  char: '#CE9178',              // Orange

  // Comments and documentation
  comment: '#6A9955',           // Green
  docBlock: '#608B4E',          // Dark green
  docCode: '#CE9178',           // Orange
  docDirective: '#569CD6',      // Blue

  // Constructor
  constructor: '#4EC9B0',       // Teal

  // Pattern matching
  pattern: '#9CDCFE',           // Light blue
};

/**
 * Default Dark Theme UI Colors
 */
const darkUI: UIColors = {
  // Editor
  editorBackground: '#1E1E1E',
  editorForeground: '#D4D4D4',
  editorSelection: '#264F78',
  editorLineHighlight: '#2A2A2A',
  editorCursor: '#AEAFAD',
  editorGutter: '#1E1E1E',
  editorLineNumbers: '#858585',
  editorLineNumbersActive: '#C6C6C6',
  editorIndentGuide: '#404040',
  editorWhitespace: '#404040',
  editorBracketMatch: '#0D3A58',
  editorBracketMatchBorder: '#888888',
  editorFindMatch: '#515C6A',
  editorFindMatchHighlight: '#EA5C0055',
  editorWordHighlight: '#575757',

  // App chrome
  appBackground: '#1E1E1E',
  appForeground: '#CCCCCC',
  appForegroundMuted: '#858585',
  appForegroundDisabled: '#6A6A6A',
  appBorder: '#454545',
  headerBackground: '#323233',
  headerForeground: '#CCCCCC',
  headerBorder: '#454545',

  // Sidebar / Navigation
  sidebarBackground: '#252526',
  sidebarItemHover: '#2A2D2E',

  // Workspace Panel (in sidebar)
  workspacePanelHeaderBackground: '#303031',
  workspacePanelHeaderForeground: '#CCCCCC',
  workspacePanelBackground: '#252526',
  workspacePanelForeground: '#CCCCCC',

  // File Explorer Panel (in sidebar)
  fileExplorerPanelHeaderBackground: '#343435',
  fileExplorerPanelHeaderForeground: '#CCCCCC',
  fileExplorerPanelBackground: '#282829',
  fileExplorerPanelForeground: '#CCCCCC',

  // Outline Panel (in sidebar)
  outlinePanelHeaderBackground: '#383839',
  outlinePanelHeaderForeground: '#CCCCCC',
  outlinePanelBackground: '#2B2B2C',
  outlinePanelForeground: '#CCCCCC',

  // UCM Explorer Panel (in sidebar)
  ucmExplorerPanelHeaderBackground: '#3C3C3D',
  ucmExplorerPanelHeaderForeground: '#CCCCCC',
  ucmExplorerPanelBackground: '#2E2E2F',
  ucmExplorerPanelForeground: '#CCCCCC',

  // Tabs
  tabBackground: '#2D2D2D',
  tabForeground: '#FFFFFF80',
  tabActiveBackground: '#1E1E1E',
  tabActiveForeground: '#FFFFFF',
  tabBorder: '#252526',
  tabActiveBorder: '#1E1E1E',
  tabHoverBackground: '#3C3C3C',
  tabDirtyIndicator: '#FFFFFF',

  // Panels
  panelBackground: '#1E1E1E',
  panelForeground: '#CCCCCC',
  panelBorder: '#3E3E42',
  panelHeaderBackground: '#252526',
  panelHeaderForeground: '#BBBBBB',
  panelTabBackground: '#2D2D2D',
  panelTabForeground: '#FFFFFF80',
  panelTabActiveBackground: '#1E1E1E',
  panelTabActiveForeground: '#FFFFFF',

  // Inputs and controls
  inputBackground: '#3C3C3C',
  inputForeground: '#CCCCCC',
  inputBorder: '#3C3C3C',
  inputFocusBorder: '#007FD4',
  inputPlaceholder: '#A6A6A6',
  buttonBackground: '#0E639C',
  buttonForeground: '#FFFFFF',
  buttonHoverBackground: '#1177BB',
  buttonSecondaryBackground: '#3A3D41',
  buttonSecondaryForeground: '#FFFFFF',
  buttonSecondaryHoverBackground: '#45494E',
  buttonSecondaryBorder: '#3A3D41',

  // Checkboxes and toggles
  checkboxBackground: '#3C3C3C',
  checkboxBorder: '#3C3C3C',
  checkboxCheckedBackground: '#007FD4',
  checkboxCheckedForeground: '#FFFFFF',

  // Scrollbars
  scrollbarThumb: '#79797966',
  scrollbarTrack: 'transparent',
  scrollbarThumbHover: '#646464',

  // Status colors
  statusSuccess: '#89D185',
  statusSuccessForeground: '#1E1E1E',
  statusSuccessSubtle: 'rgba(78, 201, 176, 0.15)',
  statusWarning: '#CCA700',
  statusWarningForeground: '#1E1E1E',
  statusWarningSubtle: 'rgba(229, 192, 123, 0.15)',
  statusError: '#F14C4C',
  statusErrorForeground: '#FFFFFF',
  statusErrorSubtle: 'rgba(244, 135, 113, 0.15)',
  statusInfo: '#3794FF',
  statusInfoForeground: '#FFFFFF',
  statusInfoSubtle: 'rgba(55, 148, 255, 0.15)',

  // Dividers and separators
  divider: '#2D2D30',
  dividerHover: '#3E3E42',
  dividerActive: '#505055',
  border: '#454545',
  borderSubtle: '#3E3E42',

  // Focus / accent
  focusRing: '#007FD4',
  accent: '#007FD4',
  accentForeground: '#FFFFFF',
  accentHover: '#1177BB',
  accentSubtle: 'rgba(0, 122, 204, 0.15)',

  // Syntax highlight backgrounds (for badges/labels in UI)
  syntaxTypeSubtle: 'rgba(78, 201, 176, 0.15)',
  syntaxTypeHighlight: 'rgba(78, 201, 176, 0.5)',
  syntaxTermSubtle: 'rgba(156, 220, 254, 0.15)',
  syntaxTermHighlight: 'rgba(156, 220, 254, 0.5)',
  syntaxKeywordSubtle: 'rgba(197, 134, 192, 0.15)',
  syntaxKeywordHighlight: 'rgba(197, 134, 192, 0.5)',

  // Modals and overlays
  modalBackground: '#252526',
  modalForeground: '#CCCCCC',
  modalBorder: '#454545',
  overlayBackground: '#00000088',

  // Tooltip
  tooltipBackground: '#252526',
  tooltipForeground: '#CCCCCC',
  tooltipBorder: '#454545',

  // Links
  linkForeground: '#3794FF',
  linkHoverForeground: '#4FA3FF',

  // Selection
  selectionBackground: '#094771',
  selectionForeground: '#FFFFFF',

  // List items
  listHoverBackground: '#2A2D2E',
  listActiveBackground: '#094771',
  listActiveForeground: '#FFFFFF',
  listFocusBackground: '#37373D',
  listActiveFocusBackground: '#0A5485',

  // Badges
  badgeBackground: '#4D4D4D',
  badgeForeground: '#FFFFFF',

  // Progress
  progressBackground: '#3C3C3C',
  progressForeground: '#0E70C0',
};

/**
 * Default Dark Theme Terminal Colors
 */
const darkTerminal: TerminalColors = {
  background: '#1E1E1E',
  foreground: '#D4D4D4',
  cursor: '#D4D4D4',
  cursorAccent: '#1E1E1E',
  selectionBackground: '#264F78',
  selectionForeground: '#FFFFFF',

  // Standard ANSI colors
  black: '#000000',
  red: '#CD3131',
  green: '#0DBC79',
  yellow: '#E5E510',
  blue: '#2472C8',
  magenta: '#BC3FBC',
  cyan: '#11A8CD',
  white: '#E5E5E5',

  // Bright ANSI colors
  brightBlack: '#666666',
  brightRed: '#F14C4C',
  brightGreen: '#23D18B',
  brightYellow: '#F5F543',
  brightBlue: '#3B8EEA',
  brightMagenta: '#D670D6',
  brightCyan: '#29B8DB',
  brightWhite: '#FFFFFF',
};

/**
 * Default Light Theme Syntax Colors
 */
const lightSyntax: SyntaxColors = {
  // Keywords
  keyword: '#AF00DB',           // Purple
  controlKeyword: '#AF00DB',    // Purple
  typeKeyword: '#0000FF',       // Blue
  useKeyword: '#AF00DB',        // Purple
  linkKeyword: '#AF00DB',       // Purple
  dataTypeKeyword: '#0000FF',   // Blue
  docKeyword: '#008000',        // Green

  // References
  typeReference: '#267F99',     // Teal
  termReference: '#001080',     // Dark blue
  hashQualifier: '#795E26',     // Brown/gold

  // Namespace variants
  typeNamespace: '#267F99',     // Teal
  termNamespace: '#001080',     // Dark blue
  constructorNamespace: '#267F99', // Teal

  // Operators and punctuation
  operator: '#000000',          // Black
  typeAscription: '#000000',    // Black
  bindingEquals: '#000000',     // Black
  delayForce: '#795E26',        // Brown/gold
  arrow: '#000000',             // Black

  // Delimiters
  abilityBraces: '#A31515',     // Red
  dataTypeParams: '#001080',    // Dark blue
  dataTypeModifier: '#0000FF',  // Blue
  parenthesis: '#000000',       // Black
  brackets: '#000000',          // Black

  // Literals
  number: '#098658',            // Green
  string: '#A31515',            // Red
  boolean: '#0000FF',           // Blue
  char: '#A31515',              // Red

  // Comments and documentation
  comment: '#008000',           // Green
  docBlock: '#008000',          // Green
  docCode: '#A31515',           // Red
  docDirective: '#0000FF',      // Blue

  // Constructor
  constructor: '#267F99',       // Teal

  // Pattern matching
  pattern: '#001080',           // Dark blue
};

/**
 * Default Light Theme UI Colors
 */
const lightUI: UIColors = {
  // Editor
  editorBackground: '#FFFFFF',
  editorForeground: '#000000',
  editorSelection: '#ADD6FF',
  editorLineHighlight: '#F8F8F8',
  editorCursor: '#000000',
  editorGutter: '#FFFFFF',
  editorLineNumbers: '#237893',
  editorLineNumbersActive: '#0B216F',
  editorIndentGuide: '#D3D3D3',
  editorWhitespace: '#D3D3D3',
  editorBracketMatch: '#B9D7F8',
  editorBracketMatchBorder: '#B9B9B9',
  editorFindMatch: '#A8AC94',
  editorFindMatchHighlight: '#EA5C0055',
  editorWordHighlight: '#E2E2E2',

  // App chrome
  appBackground: '#F3F3F3',
  appForeground: '#333333',
  appForegroundMuted: '#767676',
  appForegroundDisabled: '#A0A0A0',
  appBorder: '#CCCCCC',
  headerBackground: '#DDDDDD',
  headerForeground: '#333333',
  headerBorder: '#CCCCCC',

  // Sidebar / Navigation
  sidebarBackground: '#F3F3F3',
  sidebarItemHover: '#E8E8E8',

  // Workspace Panel (in sidebar)
  workspacePanelHeaderBackground: '#E8E8E8',
  workspacePanelHeaderForeground: '#333333',
  workspacePanelBackground: '#F3F3F3',
  workspacePanelForeground: '#333333',

  // File Explorer Panel (in sidebar)
  fileExplorerPanelHeaderBackground: '#E4E4E4',
  fileExplorerPanelHeaderForeground: '#333333',
  fileExplorerPanelBackground: '#EFEFEF',
  fileExplorerPanelForeground: '#333333',

  // Outline Panel (in sidebar)
  outlinePanelHeaderBackground: '#E0E0E0',
  outlinePanelHeaderForeground: '#333333',
  outlinePanelBackground: '#EBEBEB',
  outlinePanelForeground: '#333333',

  // UCM Explorer Panel (in sidebar)
  ucmExplorerPanelHeaderBackground: '#DCDCDC',
  ucmExplorerPanelHeaderForeground: '#333333',
  ucmExplorerPanelBackground: '#E7E7E7',
  ucmExplorerPanelForeground: '#333333',

  // Tabs
  tabBackground: '#ECECEC',
  tabForeground: '#33333380',
  tabActiveBackground: '#FFFFFF',
  tabActiveForeground: '#333333',
  tabBorder: '#F3F3F3',
  tabActiveBorder: '#FFFFFF',
  tabHoverBackground: '#D6D6D6',
  tabDirtyIndicator: '#333333',

  // Panels
  panelBackground: '#FFFFFF',
  panelForeground: '#333333',
  panelBorder: '#E7E7E7',
  panelHeaderBackground: '#F3F3F3',
  panelHeaderForeground: '#333333',
  panelTabBackground: '#ECECEC',
  panelTabForeground: '#33333380',
  panelTabActiveBackground: '#FFFFFF',
  panelTabActiveForeground: '#333333',

  // Inputs and controls
  inputBackground: '#FFFFFF',
  inputForeground: '#333333',
  inputBorder: '#CECECE',
  inputFocusBorder: '#0066B8',
  inputPlaceholder: '#767676',
  buttonBackground: '#0066B8',
  buttonForeground: '#FFFFFF',
  buttonHoverBackground: '#0060C0',
  buttonSecondaryBackground: '#E8E8E8',
  buttonSecondaryForeground: '#333333',
  buttonSecondaryHoverBackground: '#D6D6D6',
  buttonSecondaryBorder: '#CCCCCC',

  // Checkboxes and toggles
  checkboxBackground: '#FFFFFF',
  checkboxBorder: '#CECECE',
  checkboxCheckedBackground: '#0066B8',
  checkboxCheckedForeground: '#FFFFFF',

  // Scrollbars
  scrollbarThumb: '#64646466',
  scrollbarTrack: 'transparent',
  scrollbarThumbHover: '#646464',

  // Status colors
  statusSuccess: '#388A34',
  statusSuccessForeground: '#FFFFFF',
  statusSuccessSubtle: 'rgba(56, 138, 52, 0.15)',
  statusWarning: '#BF8803',
  statusWarningForeground: '#FFFFFF',
  statusWarningSubtle: 'rgba(191, 136, 3, 0.15)',
  statusError: '#D32F2F',
  statusErrorForeground: '#FFFFFF',
  statusErrorSubtle: 'rgba(211, 47, 47, 0.15)',
  statusInfo: '#0066B8',
  statusInfoForeground: '#FFFFFF',
  statusInfoSubtle: 'rgba(0, 102, 184, 0.15)',

  // Dividers and separators
  divider: '#E0E0E0',
  dividerHover: '#D0D0D0',
  dividerActive: '#C0C0C0',
  border: '#CCCCCC',
  borderSubtle: '#E7E7E7',

  // Focus / accent
  focusRing: '#0066B8',
  accent: '#0066B8',
  accentForeground: '#FFFFFF',
  accentHover: '#0060C0',
  accentSubtle: 'rgba(0, 102, 184, 0.15)',

  // Syntax highlight backgrounds (for badges/labels in UI)
  syntaxTypeSubtle: 'rgba(38, 127, 153, 0.15)',
  syntaxTypeHighlight: 'rgba(38, 127, 153, 0.35)',
  syntaxTermSubtle: 'rgba(0, 16, 128, 0.15)',
  syntaxTermHighlight: 'rgba(0, 16, 128, 0.35)',
  syntaxKeywordSubtle: 'rgba(175, 0, 219, 0.15)',
  syntaxKeywordHighlight: 'rgba(175, 0, 219, 0.35)',

  // Modals and overlays
  modalBackground: '#FFFFFF',
  modalForeground: '#333333',
  modalBorder: '#CCCCCC',
  overlayBackground: '#00000055',

  // Tooltip
  tooltipBackground: '#F3F3F3',
  tooltipForeground: '#333333',
  tooltipBorder: '#CCCCCC',

  // Links
  linkForeground: '#0066B8',
  linkHoverForeground: '#0060C0',

  // Selection
  selectionBackground: '#0066B8',
  selectionForeground: '#FFFFFF',

  // List items
  listHoverBackground: '#E8E8E8',
  listActiveBackground: '#0066B8',
  listActiveForeground: '#FFFFFF',
  listFocusBackground: '#E4E6F1',
  listActiveFocusBackground: '#0052A3',

  // Badges
  badgeBackground: '#CCCCCC',
  badgeForeground: '#333333',

  // Progress
  progressBackground: '#E8E8E8',
  progressForeground: '#0066B8',
};

/**
 * Default Light Theme Terminal Colors
 */
const lightTerminal: TerminalColors = {
  background: '#FFFFFF',
  foreground: '#333333',
  cursor: '#333333',
  cursorAccent: '#FFFFFF',
  selectionBackground: '#ADD6FF',
  selectionForeground: '#000000',

  // Standard ANSI colors (adjusted for light background)
  black: '#000000',
  red: '#C72222',
  green: '#118811',
  yellow: '#997700',
  blue: '#0451A5',
  magenta: '#BC05BC',
  cyan: '#0598BC',
  white: '#555555',

  // Bright ANSI colors
  brightBlack: '#666666',
  brightRed: '#CD3131',
  brightGreen: '#14CE14',
  brightYellow: '#B5BA00',
  brightBlue: '#0066FF',
  brightMagenta: '#E500E5',
  brightCyan: '#00B3C7',
  brightWhite: '#A5A5A5',
};

/**
 * Default Font Settings (shared between themes)
 */
const defaultFonts: FontSettings = {
  // Editor fonts
  editorFontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", Consolas, "Courier New", monospace',
  editorFontSize: 14,
  editorLineHeight: 1.5,
  editorFontWeight: 400,
  editorLetterSpacing: 0,

  // Terminal fonts
  terminalFontFamily: '"JetBrains Mono", "Fira Code", Consolas, monospace',
  terminalFontSize: 13,
  terminalLineHeight: 1.2,
  terminalFontWeight: 400,

  // UI fonts
  uiFontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  uiFontSize: 13,
  uiLineHeight: 1.4,

  // Monospace font for code in UI
  monoFontFamily: '"SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, monospace',
};

/**
 * Unison Dark Theme (Default)
 */
export const unisonDark: Theme = {
  metadata: {
    id: 'unison-dark',
    name: 'Unison Dark',
    author: 'Unison',
    version: '1.0.0',
    description: 'Default dark theme for Unison Editor',
    baseTheme: 'dark',
    isBuiltin: true,
  },
  syntax: darkSyntax,
  ui: darkUI,
  terminal: darkTerminal,
  fonts: { ...defaultFonts },
};

/**
 * Unison Light Theme
 */
export const unisonLight: Theme = {
  metadata: {
    id: 'unison-light',
    name: 'Unison Light',
    author: 'Unison',
    version: '1.0.0',
    description: 'Light theme for Unison Editor',
    baseTheme: 'light',
    isBuiltin: true,
  },
  syntax: lightSyntax,
  ui: lightUI,
  terminal: lightTerminal,
  fonts: { ...defaultFonts },
};

/**
 * All built-in themes
 */
export const builtinThemes: Theme[] = [unisonDark, unisonLight];

/**
 * Get a built-in theme by ID
 */
export function getBuiltinTheme(id: string): Theme | undefined {
  return builtinThemes.find(theme => theme.metadata.id === id);
}

/**
 * Get the default theme
 */
export function getDefaultTheme(): Theme {
  return unisonDark;
}
