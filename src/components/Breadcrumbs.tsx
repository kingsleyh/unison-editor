/**
 * Breadcrumbs Component
 *
 * Displays the current location in the code hierarchy above the editor.
 * Shows: File > Type/Ability > Function/Value
 *
 * Updates automatically based on cursor position using the DocumentSymbolProvider.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type * as Monaco from 'monaco-editor';

interface BreadcrumbItem {
  name: string;
  kind: 'file' | 'type' | 'ability' | 'function' | 'variable' | 'test' | 'watch' | 'namespace';
  line?: number;
}

interface BreadcrumbsProps {
  fileName?: string;
  editor?: Monaco.editor.IStandaloneCodeEditor | null;
  onNavigate?: (line: number) => void;
}

// Symbol kind to breadcrumb kind mapping
function symbolKindToBreadcrumbKind(kind: number): BreadcrumbItem['kind'] {
  // Monaco SymbolKind values
  switch (kind) {
    case 5: // Class (type)
    case 23: // Struct
      return 'type';
    case 11: // Interface (ability)
      return 'ability';
    case 12: // Function
    case 6: // Method
      return 'function';
    case 13: // Variable
      return 'variable';
    case 3: // Namespace
      return 'namespace';
    case 24: // Event (watch)
      return 'watch';
    default:
      return 'function';
  }
}

// Get icon for breadcrumb kind
function getKindIcon(kind: BreadcrumbItem['kind']): string {
  switch (kind) {
    case 'file':
      return ''; // Will use Unison icon
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
      return '';
  }
}

// Get color class for kind
function getKindColorClass(kind: BreadcrumbItem['kind']): string {
  switch (kind) {
    case 'type':
      return 'breadcrumb-type';
    case 'ability':
      return 'breadcrumb-ability';
    case 'function':
      return 'breadcrumb-function';
    case 'variable':
      return 'breadcrumb-variable';
    case 'test':
      return 'breadcrumb-test';
    case 'watch':
      return 'breadcrumb-watch';
    case 'namespace':
      return 'breadcrumb-namespace';
    default:
      return '';
  }
}

export function Breadcrumbs({ fileName, editor, onNavigate }: BreadcrumbsProps) {
  const [items, setItems] = useState<BreadcrumbItem[]>([]);
  const symbolsRef = useRef<Monaco.languages.DocumentSymbol[]>([]);

  // Fetch symbols from the model
  const fetchSymbols = useCallback(async () => {
    if (!editor) return;

    const model = editor.getModel();
    if (!model) return;

    try {
      // Parse the document ourselves to get symbols (same logic as our provider)
      const lines = model.getLinesContent();
      const parsedSymbols: Monaco.languages.DocumentSymbol[] = [];

      // Track names that have type signatures (name : Type)
      // so we skip their implementations (name = body)
      const namesWithTypeSignatures = new Set<string>();

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNumber = i + 1;

        // Type definitions
        const typeMatch = line.match(/^(unique\s+|structural\s+)?type\s+(\w+)/);
        if (typeMatch) {
          parsedSymbols.push({
            name: typeMatch[2],
            kind: typeMatch[1]?.includes('structural') ? 23 : 5, // Struct or Class
            detail: typeMatch[1]?.trim() || 'type',
            tags: [],
            range: { startLineNumber: lineNumber, startColumn: 1, endLineNumber: lineNumber, endColumn: line.length + 1 },
            selectionRange: { startLineNumber: lineNumber, startColumn: 1, endLineNumber: lineNumber, endColumn: line.length + 1 },
          });
          continue;
        }

        // Ability definitions
        const abilityMatch = line.match(/^(unique\s+)?ability\s+(\w+)/);
        if (abilityMatch) {
          parsedSymbols.push({
            name: abilityMatch[2],
            kind: 11, // Interface
            detail: 'ability',
            tags: [],
            range: { startLineNumber: lineNumber, startColumn: 1, endLineNumber: lineNumber, endColumn: line.length + 1 },
            selectionRange: { startLineNumber: lineNumber, startColumn: 1, endLineNumber: lineNumber, endColumn: line.length + 1 },
          });
          continue;
        }

        // Function definitions with type signature
        // Matches namespaced identifiers like audit.deploy.staging
        const funcMatch = line.match(/^([\w][\w'.]*)\s*:\s*(.+)/);
        if (funcMatch && !line.startsWith('--')) {
          const funcName = funcMatch[1];
          namesWithTypeSignatures.add(funcName);
          parsedSymbols.push({
            name: funcName,
            kind: 12, // Function
            detail: funcMatch[2].trim(),
            tags: [],
            range: { startLineNumber: lineNumber, startColumn: 1, endLineNumber: lineNumber, endColumn: line.length + 1 },
            selectionRange: { startLineNumber: lineNumber, startColumn: 1, endLineNumber: lineNumber, endColumn: line.length + 1 },
          });
          continue;
        }

        // Value bindings
        // Skip if this name already has a type signature (it's just the implementation)
        // Matches namespaced identifiers like audit.deploy.staging
        const bindMatch = line.match(/^([\w][\w'.]*)\s*=/);
        if (bindMatch && !line.startsWith('--')) {
          const bindName = bindMatch[1];
          // Skip if this is the implementation of a function with a type signature
          if (namesWithTypeSignatures.has(bindName)) {
            continue;
          }
          parsedSymbols.push({
            name: bindName,
            kind: 12, // Function - treat as function since top-level bindings are typically functions
            detail: '',
            tags: [],
            range: { startLineNumber: lineNumber, startColumn: 1, endLineNumber: lineNumber, endColumn: line.length + 1 },
            selectionRange: { startLineNumber: lineNumber, startColumn: 1, endLineNumber: lineNumber, endColumn: line.length + 1 },
          });
          continue;
        }

        // Test definitions
        const testMatch = line.match(/^test>\s*([\w][\w'.]*)/);
        if (testMatch) {
          parsedSymbols.push({
            name: testMatch[1],
            kind: 6, // Method
            detail: 'test',
            tags: [],
            range: { startLineNumber: lineNumber, startColumn: 1, endLineNumber: lineNumber, endColumn: line.length + 1 },
            selectionRange: { startLineNumber: lineNumber, startColumn: 1, endLineNumber: lineNumber, endColumn: line.length + 1 },
          });
        }
      }

      symbolsRef.current = parsedSymbols;
      updateBreadcrumbs(editor.getPosition()?.lineNumber || 1);
    } catch (e) {
      console.error('Failed to fetch symbols for breadcrumbs:', e);
    }
  }, [editor]);

  // Update breadcrumbs based on cursor position
  const updateBreadcrumbs = useCallback((currentLine: number) => {
    if (!editor) return;

    const model = editor.getModel();
    const newItems: BreadcrumbItem[] = [];

    // Add file
    if (fileName) {
      newItems.push({
        name: fileName.replace(/\.u$/, ''),
        kind: 'file',
      });
    }

    // Find the symbol(s) containing the current line
    // Sort symbols by line number descending to find the closest one before current line
    const sortedSymbols = [...symbolsRef.current].sort(
      (a, b) => b.range.startLineNumber - a.range.startLineNumber
    );

    // Find the closest symbol before or at the current line
    const currentSymbol = sortedSymbols.find(
      s => s.range.startLineNumber <= currentLine
    );

    if (currentSymbol) {
      newItems.push({
        name: currentSymbol.name,
        kind: symbolKindToBreadcrumbKind(currentSymbol.kind),
        line: currentSymbol.range.startLineNumber,
      });
    }

    // Check if current line is a local binding (indented name = ...)
    // This shows local variables in breadcrumbs when cursor is on them
    if (model) {
      const lineContent = model.getLineContent(currentLine);
      // Match indented bindings: starts with whitespace, then name = ...
      const localBindMatch = lineContent.match(/^(\s+)([\w][\w'.]*)\s*=/);
      if (localBindMatch) {
        const localName = localBindMatch[2];
        // Don't add if it's the same as the current symbol (shouldn't happen but just in case)
        if (!currentSymbol || currentSymbol.name !== localName) {
          newItems.push({
            name: localName,
            kind: 'variable',
            line: currentLine,
          });
        }
      }
    }

    setItems(newItems);
  }, [fileName, editor]);

  // Initial fetch and setup listeners
  useEffect(() => {
    if (!editor) return;

    fetchSymbols();

    // Listen to content changes
    const contentDisposable = editor.onDidChangeModelContent(() => {
      fetchSymbols();
    });

    // Listen to cursor position changes
    const cursorDisposable = editor.onDidChangeCursorPosition((e) => {
      updateBreadcrumbs(e.position.lineNumber);
    });

    // Listen to model changes (file switch)
    const modelDisposable = editor.onDidChangeModel(() => {
      fetchSymbols();
    });

    return () => {
      contentDisposable.dispose();
      cursorDisposable.dispose();
      modelDisposable.dispose();
    };
  }, [editor, fetchSymbols, updateBreadcrumbs]);

  // Update when fileName changes
  useEffect(() => {
    if (editor) {
      fetchSymbols();
    }
  }, [fileName, editor, fetchSymbols]);

  const handleClick = (item: BreadcrumbItem) => {
    if (item.line && onNavigate) {
      onNavigate(item.line);
    }
  };

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="breadcrumbs-bar">
      {items.map((item, index) => (
        <span key={`${item.name}-${index}`} className="breadcrumb-item-wrapper">
          {index > 0 && <span className="breadcrumb-separator">›</span>}
          <button
            className={`breadcrumb-item ${getKindColorClass(item.kind)} ${item.line ? 'clickable' : ''}`}
            onClick={() => handleClick(item)}
            disabled={!item.line}
          >
            {item.kind !== 'file' && (
              <span className={`breadcrumb-icon ${getKindColorClass(item.kind)}`}>
                {getKindIcon(item.kind)}
              </span>
            )}
            {item.kind === 'file' && (
              <span className="breadcrumb-file-icon">
                <img src="/src/assets/unison-file-icon.svg" alt="" width="14" height="14" />
              </span>
            )}
            <span className="breadcrumb-name">{item.name}</span>
          </button>
        </span>
      ))}
    </div>
  );
}
