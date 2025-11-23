import type * as Monaco from 'monaco-editor';

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

export function registerUnisonLanguage(monaco: typeof Monaco) {
  console.log('Registering Unison language...');

  // Register the language
  monaco.languages.register({ id: 'unison' });

  // Register the configuration
  monaco.languages.setLanguageConfiguration('unison', unisonLanguageConfig);

  // Register the token provider
  monaco.languages.setMonarchTokensProvider('unison', unisonTokenProvider);

  // Define custom theme with Unison syntax colors
  monaco.editor.defineTheme('unison-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: 'C586C0' }, // Purple for keywords
      { token: 'keyword.type', foreground: '4EC9B0' }, // Teal for type keywords
      { token: 'keyword.control', foreground: 'C586C0' }, // Purple for control
      { token: 'type.identifier', foreground: '4EC9B0' }, // Teal for types
      { token: 'identifier', foreground: '9CDCFE' }, // Light blue for identifiers
      { token: 'operator', foreground: 'D4D4D4' }, // Default for operators
      { token: 'number', foreground: 'B5CEA8' }, // Green for numbers
      { token: 'number.hex', foreground: 'B5CEA8' },
      { token: 'number.octal', foreground: 'B5CEA8' },
      { token: 'number.binary', foreground: 'B5CEA8' },
      { token: 'number.float', foreground: 'B5CEA8' },
      { token: 'string', foreground: 'CE9178' }, // Orange for strings
      { token: 'string.quote', foreground: 'CE9178' },
      { token: 'string.escape', foreground: 'D7BA7D' }, // Yellow for escapes
      { token: 'comment', foreground: '6A9955' }, // Green for comments
      { token: 'comment.doc', foreground: '6A9955' },
      { token: 'comment.doc.code', foreground: '4EC9B0' }, // Teal for doc code
      { token: 'comment.doc.directive', foreground: 'C586C0' }, // Purple for directives
      { token: 'comment.pragma', foreground: 'C586C0' },
    ],
    colors: {},
  });

  console.log('Unison language registered successfully');
}
