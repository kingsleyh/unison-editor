import type * as Monaco from 'monaco-editor';
import { themeService } from '../theme/themeService';
import type { Theme } from '../types/theme';

export const unisonLanguageConfig: Monaco.languages.LanguageConfiguration = {
  comments: {
    lineComment: '--',
    blockComment: ['{-', '-}'],
  },
  brackets: [
    ['{', '}'],
    ['[', ']'],
    ['(', ')'],
  ],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"' },
    { open: "'", close: "'" },
  ],
  surroundingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"' },
    { open: "'", close: "'" },
  ],
  // Define what constitutes a "word" in Unison
  // Unison identifiers can contain letters, numbers, underscores, apostrophes, and exclamation marks
  wordPattern: /[a-zA-Z_][\w'!]*/,
};

export const unisonTokenProvider: Monaco.languages.IMonarchLanguage = {
  defaultToken: '',
  tokenPostfix: '.unison',

  keywords: [
    'ability',
    'do',
    'type',
    'where',
    'match',
    'cases',
    'let',
    'with',
    'handle',
    'if',
    'else',
    'then',
    'use',
    'namespace',
    'unique',
    'structural',
    'forall',
  ],

  typeKeywords: ['Boolean', 'Nat', 'Int', 'Float', 'Text', 'Char', 'Bytes'],

  operators: [
    '=',
    '>',
    '<',
    '!',
    '~',
    '?',
    ':',
    '==',
    '<=',
    '>=',
    '!=',
    '&&',
    '||',
    '++',
    '+',
    '-',
    '*',
    '/',
    '&',
    '|',
    '^',
    '%',
    '<<',
    '>>',
    '>>>',
    '+=',
    '-=',
    '*=',
    '/=',
    '&=',
    '|=',
    '^=',
    '%=',
    '<<=',
    '>>=',
    '>>>=',
    '->',
    '=>',
  ],

  // we include these common regular expressions
  symbols: /[=><!~?:&|+\-*\/\^%]+/,
  escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,

  tokenizer: {
    root: [
      // Doc blocks
      [/\{\{/, { token: 'comment.doc', next: '@docblock' }],

      // Identifiers and keywords
      [
        /[a-z_][\w'!]*/,
        {
          cases: {
            '@keywords': 'keyword',
            '@default': 'identifier',
          },
        },
      ],

      // Type identifiers (start with uppercase)
      [
        /[A-Z][\w'!]*/,
        {
          cases: {
            '@typeKeywords': 'keyword.type',
            '@default': 'type.identifier',
          },
        },
      ],

      // Definition names (lowercase identifier followed by :)
      [/^[A-Za-z_][\w'!]*\s*:/, 'type.identifier'],

      // Watch expressions
      [/^[A-Za-z]*>/, 'keyword.control'],

      // Whitespace
      { include: '@whitespace' },

      // Delimiters and operators
      [/[{}()\[\]]/, '@brackets'],
      [/[<>](?!@symbols)/, '@brackets'],
      [
        /@symbols/,
        {
          cases: {
            '@operators': 'operator',
            '@default': '',
          },
        },
      ],

      // Numbers
      [/0[xX][0-9a-fA-F]+/, 'number.hex'],
      [/0[oO][0-7]+/, 'number.octal'],
      [/0[bB][01]+/, 'number.binary'],
      [/\d+\.\d+([eE][-+]?\d+)?/, 'number.float'],
      [/\d+/, 'number'],

      // Delimiter
      [/[;,.]/, 'delimiter'],

      // Strings
      [/"([^"\\]|\\.)*$/, 'string.invalid'], // non-terminated string
      [/"/, { token: 'string.quote', bracket: '@open', next: '@string' }],

      // Characters
      [/'[^\\']'/, 'string'],
      [/(')(@escapes)(')/, ['string', 'string.escape', 'string']],
      [/'/, 'string.invalid'],
    ],

    whitespace: [
      [/[ \t\r\n]+/, 'white'],
      [/--.*$/, 'comment'],
      [/\{-/, 'comment', '@blockcomment'],
      [/\{-#/, 'comment.pragma', '@pragma'],
    ],

    blockcomment: [
      [/[^{-]+/, 'comment'],
      [/\{-/, 'comment', '@push'],
      [/-\}/, 'comment', '@pop'],
      [/[{-]/, 'comment'],
    ],

    pragma: [
      [/[^#-]+/, 'comment.pragma'],
      [/#-\}/, 'comment.pragma', '@pop'],
      [/[#-]/, 'comment.pragma'],
    ],

    docblock: [
      [/\}\}/, { token: 'comment.doc', next: '@pop' }],
      [/```/, { token: 'comment.doc.code', next: '@doccode' }],
      [/``/, { token: 'comment.doc.code', next: '@docinline' }],
      [/''[^']*''/, 'comment.doc.mono'],
      [/@[a-zA-Z0-9_']*\{/, { token: 'comment.doc.directive', next: '@docdirective' }],
      [/[^}@`']+/, 'comment.doc'],
      [/./, 'comment.doc'],
    ],

    doccode: [
      [/```/, { token: 'comment.doc.code', next: '@pop' }],
      [/[^`]+/, 'comment.doc.code'],
      [/./, 'comment.doc.code'],
    ],

    docinline: [
      [/``/, { token: 'comment.doc.code', next: '@pop' }],
      [/[^`]+/, 'comment.doc.code'],
      [/./, 'comment.doc.code'],
    ],

    docdirective: [
      [/\}/, { token: 'comment.doc.directive', next: '@pop' }],
      [/[^}]+/, 'comment.doc.directive'],
      [/./, 'comment.doc.directive'],
    ],

    string: [
      [/[^\\"]+/, 'string'],
      [/@escapes/, 'string.escape'],
      [/\\./, 'string.escape.invalid'],
      [/"/, { token: 'string.quote', bracket: '@close', next: '@pop' }],
    ],
  },
};

// Theme name used for Monaco editor
export const UNISON_THEME_NAME = 'unison-theme';

export function registerUnisonLanguage(monaco: typeof Monaco) {
  console.log('Registering Unison language...');

  // Register the language
  monaco.languages.register({ id: 'unison' });

  // Register the configuration
  monaco.languages.setLanguageConfiguration('unison', unisonLanguageConfig);

  // Register the token provider
  monaco.languages.setMonarchTokensProvider('unison', unisonTokenProvider);

  // Define initial theme using themeService
  const monacoTheme = themeService.getMonacoTheme();
  monaco.editor.defineTheme(UNISON_THEME_NAME, monacoTheme);

  console.log('Unison language registered successfully');
}

/**
 * Update the Monaco theme when the theme changes
 * Call this when themeService emits a theme change event
 * @param monaco - Monaco instance
 * @param theme - Optional theme to use (if not provided, uses active theme from service)
 */
export function updateMonacoTheme(monaco: typeof Monaco, theme?: Theme) {
  const monacoTheme = theme
    ? themeService.generateMonacoThemeData(theme)
    : themeService.getMonacoTheme();
  monaco.editor.defineTheme(UNISON_THEME_NAME, monacoTheme);
  // Force theme refresh by re-applying it to all editors
  monaco.editor.setTheme(UNISON_THEME_NAME);
}
