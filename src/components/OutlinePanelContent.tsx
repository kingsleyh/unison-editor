/**
 * Outline Panel Content
 *
 * Content-only version of DocumentOutline for use inside CollapsiblePanelStack.
 * Shows the structure of the current file without its own header.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import type * as Monaco from 'monaco-editor';

interface OutlineSymbol {
  name: string;
  kind: 'type' | 'ability' | 'function' | 'variable' | 'test' | 'watch' | 'namespace';
  detail: string;
  line: number;
  endLine: number;
}

interface OutlinePanelContentProps {
  editor?: Monaco.editor.IStandaloneCodeEditor | null;
  fileName?: string;
}

// Get icon for symbol kind
function getKindIcon(kind: OutlineSymbol['kind']): string {
  switch (kind) {
    case 'type':
      return 'T';
    case 'ability':
      return 'A';
    case 'function':
      return 'f';
    case 'variable':
      return 'v';
    case 'test':
      return 't';
    case 'watch':
      return '>';
    case 'namespace':
      return 'N';
    default:
      return '?';
  }
}

// Get color class for kind
function getKindColorClass(kind: OutlineSymbol['kind']): string {
  switch (kind) {
    case 'type':
      return 'outline-type';
    case 'ability':
      return 'outline-ability';
    case 'function':
      return 'outline-function';
    case 'variable':
      return 'outline-variable';
    case 'test':
      return 'outline-test';
    case 'watch':
      return 'outline-watch';
    case 'namespace':
      return 'outline-namespace';
    default:
      return '';
  }
}

// Sort order for symbol kinds
function getKindSortOrder(kind: OutlineSymbol['kind']): number {
  switch (kind) {
    case 'namespace':
      return 0;
    case 'type':
      return 1;
    case 'ability':
      return 2;
    case 'function':
      return 3;
    case 'variable':
      return 4;
    case 'test':
      return 5;
    case 'watch':
      return 6;
    default:
      return 99;
  }
}

export function OutlinePanelContent({ editor, fileName }: OutlinePanelContentProps) {
  const [symbols, setSymbols] = useState<OutlineSymbol[]>([]);
  const [currentLine, setCurrentLine] = useState<number>(1);
  const [filter, setFilter] = useState<string>('');
  const [sortByKind, setSortByKind] = useState<boolean>(true);

  // Parse symbols from the editor content
  const parseSymbols = useCallback(() => {
    if (!editor) return;

    const model = editor.getModel();
    if (!model) return;

    const lines = model.getLinesContent();
    const parsedSymbols: OutlineSymbol[] = [];

    // Track names that have type signatures (name : Type)
    // so we skip their implementations (name = body)
    const namesWithTypeSignatures = new Set<string>();

    let currentTypeBlock: { name: string; kind: 'type' | 'ability'; startLine: number } | null = null;

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
        currentTypeBlock = null;
      }

      // Type definitions
      const typeMatch = line.match(/^(unique\s+|structural\s+)?type\s+(\w+)/);
      if (typeMatch) {
        let endLine = lineNumber;
        for (let j = i + 1; j < lines.length; j++) {
          const nextLine = lines[j];
          if (nextLine.trim() && !nextLine.startsWith(' ') && !nextLine.startsWith('\t')) {
            break;
          }
          endLine = j + 1;
        }

        parsedSymbols.push({
          name: typeMatch[2],
          kind: 'type',
          detail: typeMatch[1]?.trim() || 'type',
          line: lineNumber,
          endLine,
        });
        continue;
      }

      // Ability definitions
      const abilityMatch = line.match(/^(unique\s+)?ability\s+(\w+)/);
      if (abilityMatch) {
        let endLine = lineNumber;
        for (let j = i + 1; j < lines.length; j++) {
          const nextLine = lines[j];
          if (nextLine.trim() && !nextLine.startsWith(' ') && !nextLine.startsWith('\t')) {
            break;
          }
          endLine = j + 1;
        }

        parsedSymbols.push({
          name: abilityMatch[2],
          kind: 'ability',
          detail: 'ability',
          line: lineNumber,
          endLine,
        });
        continue;
      }

      // Namespace definitions
      const namespaceMatch = line.match(/^namespace\s+(\w+)/);
      if (namespaceMatch) {
        parsedSymbols.push({
          name: namespaceMatch[1],
          kind: 'namespace',
          detail: 'namespace',
          line: lineNumber,
          endLine: lineNumber,
        });
        continue;
      }

      // Function definitions with type signature (matches namespaced identifiers)
      const funcMatch = line.match(/^([\w][\w'.]*)\s*:\s*(.+)/);
      if (funcMatch && !line.startsWith('--')) {
        const funcName = funcMatch[1];
        namesWithTypeSignatures.add(funcName);
        parsedSymbols.push({
          name: funcName,
          kind: 'function',
          detail: funcMatch[2].trim(),
          line: lineNumber,
          endLine: lineNumber,
        });
        continue;
      }

      // Value bindings (matches namespaced identifiers)
      // Skip if this name already has a type signature (it's just the implementation)
      const bindMatch = line.match(/^([\w][\w'.]*)\s*=/);
      if (bindMatch && !line.startsWith('--') && !currentTypeBlock) {
        const bindName = bindMatch[1];
        // Skip if this is the implementation of a function with a type signature
        if (namesWithTypeSignatures.has(bindName)) {
          continue;
        }
        parsedSymbols.push({
          name: bindName,
          kind: 'variable',
          detail: '',
          line: lineNumber,
          endLine: lineNumber,
        });
        continue;
      }

      // Test definitions
      const testMatch = line.match(/^test>\s*([\w][\w'.]*)/);
      if (testMatch) {
        parsedSymbols.push({
          name: testMatch[1],
          kind: 'test',
          detail: 'test',
          line: lineNumber,
          endLine: lineNumber,
        });
        continue;
      }

      // Watch expressions
      const watchMatch = line.match(/^[\^]?>\s*(.+)/);
      if (watchMatch) {
        const expr = watchMatch[1].trim();
        const name = expr.length > 25 ? expr.substring(0, 22) + '...' : expr;
        parsedSymbols.push({
          name,
          kind: 'watch',
          detail: 'watch',
          line: lineNumber,
          endLine: lineNumber,
        });
      }
    }

    setSymbols(parsedSymbols);
  }, [editor]);

  // Initial parse and setup listeners
  useEffect(() => {
    if (!editor) return;

    parseSymbols();

    const contentDisposable = editor.onDidChangeModelContent(() => {
      parseSymbols();
    });

    const cursorDisposable = editor.onDidChangeCursorPosition((e) => {
      setCurrentLine(e.position.lineNumber);
    });

    const modelDisposable = editor.onDidChangeModel(() => {
      parseSymbols();
    });

    return () => {
      contentDisposable.dispose();
      cursorDisposable.dispose();
      modelDisposable.dispose();
    };
  }, [editor, parseSymbols]);

  // Re-parse when fileName changes
  useEffect(() => {
    if (editor) {
      parseSymbols();
    }
  }, [fileName, editor, parseSymbols]);

  // Filter and sort symbols
  const filteredSymbols = useMemo(() => {
    let result = symbols;

    if (filter) {
      const lowerFilter = filter.toLowerCase();
      result = result.filter(s =>
        s.name.toLowerCase().includes(lowerFilter) ||
        s.detail.toLowerCase().includes(lowerFilter)
      );
    }

    if (sortByKind) {
      result = [...result].sort((a, b) => {
        const kindDiff = getKindSortOrder(a.kind) - getKindSortOrder(b.kind);
        if (kindDiff !== 0) return kindDiff;
        return a.line - b.line;
      });
    } else {
      result = [...result].sort((a, b) => a.line - b.line);
    }

    return result;
  }, [symbols, filter, sortByKind]);

  // Check if a symbol is the current one
  const isCurrentSymbol = useCallback((symbol: OutlineSymbol) => {
    return currentLine >= symbol.line && currentLine <= symbol.endLine;
  }, [currentLine]);

  // Navigate to symbol
  const handleSymbolClick = useCallback((symbol: OutlineSymbol) => {
    if (!editor) return;

    editor.revealLineInCenter(symbol.line);
    editor.setPosition({ lineNumber: symbol.line, column: 1 });
    editor.focus();
  }, [editor]);

  // Group symbols by kind
  const groupedSymbols = useMemo(() => {
    if (!sortByKind) return null;

    const groups: Record<string, OutlineSymbol[]> = {};
    for (const symbol of filteredSymbols) {
      if (!groups[symbol.kind]) {
        groups[symbol.kind] = [];
      }
      groups[symbol.kind].push(symbol);
    }
    return groups;
  }, [filteredSymbols, sortByKind]);

  return (
    <div className="outline-panel-content">
      {/* Toolbar */}
      <div className="outline-toolbar">
        <input
          type="text"
          className="outline-filter"
          placeholder="Filter symbols..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <button
          className={`outline-sort-btn ${sortByKind ? 'active' : ''}`}
          onClick={() => setSortByKind(!sortByKind)}
          title={sortByKind ? 'Sort by position' : 'Sort by kind'}
        >
          {sortByKind ? '⊞' : '↕'}
        </button>
      </div>

      {/* Symbol list */}
      <div className="outline-symbols">
        {filteredSymbols.length === 0 ? (
          <div className="outline-empty">
            {symbols.length === 0 ? 'No symbols found' : 'No matches'}
          </div>
        ) : sortByKind && groupedSymbols ? (
          // Grouped view
          Object.entries(groupedSymbols).map(([kind, kindSymbols]) => (
            <div key={kind} className="outline-group">
              <div className="outline-group-header">
                <span className={`outline-group-icon ${getKindColorClass(kind as OutlineSymbol['kind'])}`}>
                  {getKindIcon(kind as OutlineSymbol['kind'])}
                </span>
                <span className="outline-group-name">
                  {kind.charAt(0).toUpperCase() + kind.slice(1)}s
                </span>
                <span className="outline-group-count">{kindSymbols.length}</span>
              </div>
              {kindSymbols.map((symbol) => (
                <button
                  key={`${symbol.name}-${symbol.line}`}
                  className={`outline-symbol ${isCurrentSymbol(symbol) ? 'current' : ''}`}
                  onClick={() => handleSymbolClick(symbol)}
                >
                  <span className={`outline-symbol-icon ${getKindColorClass(symbol.kind)}`}>
                    {getKindIcon(symbol.kind)}
                  </span>
                  <span className="outline-symbol-name">{symbol.name}</span>
                  {symbol.detail && symbol.kind === 'function' && (
                    <span className="outline-symbol-detail" title={symbol.detail}>
                      : {symbol.detail.length > 30 ? symbol.detail.substring(0, 27) + '...' : symbol.detail}
                    </span>
                  )}
                  <span className="outline-symbol-line">:{symbol.line}</span>
                </button>
              ))}
            </div>
          ))
        ) : (
          // Flat view
          filteredSymbols.map((symbol) => (
            <button
              key={`${symbol.name}-${symbol.line}`}
              className={`outline-symbol ${isCurrentSymbol(symbol) ? 'current' : ''}`}
              onClick={() => handleSymbolClick(symbol)}
            >
              <span className={`outline-symbol-icon ${getKindColorClass(symbol.kind)}`}>
                {getKindIcon(symbol.kind)}
              </span>
              <span className="outline-symbol-name">{symbol.name}</span>
              {symbol.detail && symbol.kind === 'function' && (
                <span className="outline-symbol-detail" title={symbol.detail}>
                  : {symbol.detail.length > 30 ? symbol.detail.substring(0, 27) + '...' : symbol.detail}
                </span>
              )}
              <span className="outline-symbol-line">:{symbol.line}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
