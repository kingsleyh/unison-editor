/**
 * Monaco Document Symbol Provider for Unison
 *
 * Provides document symbols for:
 * - Outline view (sidebar)
 * - Breadcrumbs (top bar navigation)
 * - Go to Symbol (Ctrl+Shift+O)
 *
 * Parses Unison code to detect:
 * - Type definitions (type, unique type, structural type)
 * - Ability definitions
 * - Function definitions (with type signatures)
 * - Value bindings
 * - Test definitions
 * - Watch expressions
 */

import * as monaco from 'monaco-editor';

let isRegistered = false;

/**
 * Register the document symbol provider for Unison language.
 * Only registers once to prevent duplicates.
 */
export function registerDocumentSymbolProvider(): monaco.IDisposable | null {
  if (isRegistered) {
    return null;
  }

  isRegistered = true;

  return monaco.languages.registerDocumentSymbolProvider('unison', {
    provideDocumentSymbols(
      model: monaco.editor.ITextModel
    ): monaco.languages.ProviderResult<monaco.languages.DocumentSymbol[]> {
      const symbols: monaco.languages.DocumentSymbol[] = [];
      const lines = model.getLinesContent();

      // Track names that have type signatures (name : Type)
      // so we skip their implementations (name = body)
      const namesWithTypeSignatures = new Set<string>();

      // Track multiline definitions
      let currentTypeBlock: {
        name: string;
        kind: monaco.languages.SymbolKind;
        startLine: number;
        detail: string;
      } | null = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNumber = i + 1;
        const trimmedLine = line.trim();

        // Skip empty lines and comments
        if (!trimmedLine || trimmedLine.startsWith('--')) {
          continue;
        }

        // End current type block if we hit a non-indented line
        if (currentTypeBlock && !line.startsWith(' ') && !line.startsWith('\t') && trimmedLine) {
          symbols.push(
            createSymbol(
              currentTypeBlock.name,
              currentTypeBlock.kind,
              currentTypeBlock.startLine,
              i, // End at previous line
              currentTypeBlock.detail
            )
          );
          currentTypeBlock = null;
        }

        // Type definitions: type, unique type, structural type
        const typeMatch = line.match(/^(unique\s+|structural\s+)?type\s+(\w+)/);
        if (typeMatch) {
          currentTypeBlock = {
            name: typeMatch[2],
            kind: typeMatch[1]?.includes('structural')
              ? monaco.languages.SymbolKind.Struct
              : monaco.languages.SymbolKind.Class,
            startLine: lineNumber,
            detail: typeMatch[1]?.trim() || 'type',
          };
          continue;
        }

        // Ability definitions
        const abilityMatch = line.match(/^(unique\s+)?ability\s+(\w+)/);
        if (abilityMatch) {
          currentTypeBlock = {
            name: abilityMatch[2],
            kind: monaco.languages.SymbolKind.Interface,
            startLine: lineNumber,
            detail: 'ability',
          };
          continue;
        }

        // Namespace definitions
        const namespaceMatch = line.match(/^namespace\s+(\w+)/);
        if (namespaceMatch) {
          symbols.push(
            createSymbol(
              namespaceMatch[1],
              monaco.languages.SymbolKind.Namespace,
              lineNumber,
              lineNumber,
              'namespace'
            )
          );
          continue;
        }

        // Function/term definitions with type signature: name : Type
        // Matches namespaced identifiers like audit.deploy.staging
        const funcMatch = line.match(/^([\w][\w'.]*)\s*:\s*(.+)/);
        if (funcMatch) {
          const funcName = funcMatch[1];
          namesWithTypeSignatures.add(funcName);
          symbols.push(
            createSymbol(
              funcName,
              monaco.languages.SymbolKind.Function,
              lineNumber,
              lineNumber,
              funcMatch[2].trim() // Type signature as detail
            )
          );
          continue;
        }

        // Value bindings: name = value (but not inside type definitions)
        // Skip if this name already has a type signature (it's just the implementation)
        // Matches namespaced identifiers like audit.deploy.staging
        const bindMatch = line.match(/^([\w][\w'.]*)\s*=/);
        if (bindMatch && !currentTypeBlock) {
          const bindName = bindMatch[1];
          // Skip if this is the implementation of a function with a type signature
          if (namesWithTypeSignatures.has(bindName)) {
            continue;
          }
          symbols.push(
            createSymbol(
              bindName,
              monaco.languages.SymbolKind.Function, // Treat as function since top-level bindings are typically functions
              lineNumber,
              lineNumber,
              ''
            )
          );
          continue;
        }

        // Test definitions: test> name = ...
        const testMatch = line.match(/^test>\s*([\w][\w'.]*)/);
        if (testMatch) {
          symbols.push(
            createSymbol(
              testMatch[1],
              monaco.languages.SymbolKind.Method,
              lineNumber,
              lineNumber,
              'test'
            )
          );
          continue;
        }

        // Watch expressions: > expression or ^> expression
        const watchMatch = line.match(/^[\^]?>\s*(.+)/);
        if (watchMatch) {
          // Use first significant part of expression as name
          const expr = watchMatch[1].trim();
          const name = expr.length > 30 ? expr.substring(0, 27) + '...' : expr;
          symbols.push(
            createSymbol(
              name,
              monaco.languages.SymbolKind.Event,
              lineNumber,
              lineNumber,
              'watch'
            )
          );
          continue;
        }
      }

      // Close any remaining type block
      if (currentTypeBlock) {
        symbols.push(
          createSymbol(
            currentTypeBlock.name,
            currentTypeBlock.kind,
            currentTypeBlock.startLine,
            lines.length,
            currentTypeBlock.detail
          )
        );
      }

      return symbols;
    },
  });
}

/**
 * Create a DocumentSymbol with the given properties.
 */
function createSymbol(
  name: string,
  kind: monaco.languages.SymbolKind,
  startLine: number,
  endLine: number,
  detail: string
): monaco.languages.DocumentSymbol {
  return {
    name,
    kind,
    detail,
    tags: [],
    range: {
      startLineNumber: startLine,
      startColumn: 1,
      endLineNumber: endLine,
      endColumn: 1,
    },
    selectionRange: {
      startLineNumber: startLine,
      startColumn: 1,
      endLineNumber: startLine,
      endColumn: 1,
    },
  };
}
