import type * as Monaco from 'monaco-editor';
import { generateMonacoTheme, unisonDarkTheme, type ThemeColors } from '../theme/unisonTheme';

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

export function registerUnisonLanguage(monaco: typeof Monaco, theme: ThemeColors = unisonDarkTheme) {
  console.log('Registering Unison language...');

  // Register the language
  monaco.languages.register({ id: 'unison' });

  // Register the configuration
  monaco.languages.setLanguageConfiguration('unison', unisonLanguageConfig);

  // Register the token provider
  monaco.languages.setMonarchTokensProvider('unison', unisonTokenProvider);

  // Define custom theme using unified theme system
  const monacoTheme = generateMonacoTheme(theme);
  monaco.editor.defineTheme('unison-dark', monacoTheme);

  console.log('Unison language registered successfully');
}
