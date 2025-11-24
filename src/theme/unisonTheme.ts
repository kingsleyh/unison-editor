/**
 * Unified theme system for Unison Editor
 * Provides single source of truth for syntax highlighting colors
 * Generates both CSS variables and Monaco theme from the same config
 */

export interface ThemeColors {
  // Syntax highlighting colors
  keyword: string;
  controlKeyword: string;
  typeKeyword: string;
  useKeyword: string;
  linkKeyword: string;
  dataTypeKeyword: string;

  typeReference: string;
  termReference: string;
  hashQualifier: string;

  operator: string;
  typeAscription: string;
  bindingEquals: string;
  delayForce: string;

  abilityBraces: string;
  dataTypeParams: string;
  dataTypeModifier: string;
  parenthesis: string;

  number: string;
  string: string;
  comment: string;
  docBlock: string;

  // Editor colors
  background: string;
  foreground: string;
  selection: string;
  lineHighlight: string;
}

/**
 * Default Unison Dark Theme
 * Based on UCM Desktop colors
 */
export const unisonDarkTheme: ThemeColors = {
  // Keywords
  keyword: '#C586C0',           // Purple - general keywords
  controlKeyword: '#C586C0',    // Purple - if, then, else, match, etc.
  typeKeyword: '#569CD6',       // Blue - type, ability, unique
  useKeyword: '#C586C0',        // Purple - use keyword
  linkKeyword: '#C586C0',       // Purple - @, @@
  dataTypeKeyword: '#569CD6',   // Blue - structural, unique type

  // References
  typeReference: '#4EC9B0',     // Teal - Type names
  termReference: '#9CDCFE',     // Light blue - function/value names
  hashQualifier: '#DCDCAA',     // Yellow - qualified names

  // Operators and punctuation
  operator: '#D4D4D4',          // Light gray - +, -, *, etc.
  typeAscription: '#D4D4D4',    // Light gray - :
  bindingEquals: '#D4D4D4',     // Light gray - =
  delayForce: '#D7BA7D',        // Gold - ' (delay/force)

  abilityBraces: '#CE9178',     // Orange - { } for abilities
  dataTypeParams: '#9CDCFE',    // Light blue - type parameters
  dataTypeModifier: '#569CD6',  // Blue - unique, structural
  parenthesis: '#D4D4D4',       // Light gray - ( ) [ ]

  // Literals
  number: '#B5CEA8',            // Light green - numbers
  string: '#CE9178',            // Orange - strings
  comment: '#6A9955',           // Green - comments
  docBlock: '#6A9955',          // Green - doc blocks

  // Editor
  background: '#1E1E1E',
  foreground: '#D4D4D4',
  selection: '#264F78',
  lineHighlight: '#2A2A2A',
};

/**
 * Generate CSS variables from theme colors
 * These can be applied to :root for global styling
 * Variable names match doc-syntax.css expectations
 */
export function generateCSSVariables(theme: ThemeColors): Record<string, string> {
  return {
    // Main syntax colors (matching doc-syntax.css)
    '--color-syntax-keyword': theme.keyword,
    '--color-syntax-type': theme.typeReference,
    '--color-syntax-term': theme.termReference,
    '--color-syntax-operator': theme.operator,
    '--color-syntax-ability': theme.delayForce,  // Used for delay/force chars

    // Additional syntax colors
    '--color-syntax-plain': theme.foreground,
    '--color-syntax-base': theme.foreground,
    '--color-syntax-subtle': theme.comment,
    '--color-syntax-text': theme.string,

    // Editor colors
    '--color-editor-background': theme.background,
    '--color-editor-foreground': theme.foreground,
    '--color-editor-selection': theme.selection,
    '--color-editor-line-highlight': theme.lineHighlight,
  };
}

/**
 * Generate Monaco editor theme from colors
 */
export function generateMonacoTheme(theme: ThemeColors) {
  // Helper to strip # from hex colors for Monaco
  const stripHash = (color: string) => color.replace('#', '');

  return {
    base: 'vs-dark' as const,
    inherit: true,
    rules: [
      { token: 'keyword', foreground: stripHash(theme.keyword) },
      { token: 'keyword.control', foreground: stripHash(theme.controlKeyword) },
      { token: 'keyword.type', foreground: stripHash(theme.typeKeyword) },

      { token: 'type.identifier', foreground: stripHash(theme.typeReference) },
      { token: 'identifier', foreground: stripHash(theme.termReference) },

      { token: 'operator', foreground: stripHash(theme.operator) },
      { token: 'delimiter', foreground: stripHash(theme.parenthesis) },
      { token: 'delimiter.parenthesis', foreground: stripHash(theme.parenthesis) },
      { token: 'delimiter.square', foreground: stripHash(theme.parenthesis) },
      { token: 'delimiter.curly', foreground: stripHash(theme.abilityBraces) },

      { token: 'number', foreground: stripHash(theme.number) },
      { token: 'string', foreground: stripHash(theme.string) },
      { token: 'comment', foreground: stripHash(theme.comment) },
      { token: 'doc', foreground: stripHash(theme.docBlock) },
    ],
    colors: {
      'editor.background': theme.background,
      'editor.foreground': theme.foreground,
      'editor.selectionBackground': theme.selection,
      'editor.lineHighlightBackground': theme.lineHighlight,
    },
  };
}

/**
 * Apply theme variables to document root
 * This makes CSS variables available globally
 */
export function applyThemeVariables(theme: ThemeColors): void {
  const variables = generateCSSVariables(theme);
  const root = document.documentElement;

  Object.entries(variables).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
}

/**
 * Load theme from localStorage or use default
 */
export function loadTheme(): ThemeColors {
  try {
    const savedTheme = localStorage.getItem('unison-theme');
    if (savedTheme) {
      return { ...unisonDarkTheme, ...JSON.parse(savedTheme) };
    }
  } catch (error) {
    console.warn('Failed to load saved theme:', error);
  }
  return unisonDarkTheme;
}

/**
 * Save theme to localStorage
 */
export function saveTheme(theme: ThemeColors): void {
  try {
    localStorage.setItem('unison-theme', JSON.stringify(theme));
  } catch (error) {
    console.error('Failed to save theme:', error);
  }
}
