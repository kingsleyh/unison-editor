import { Editor as MonacoEditor } from '@monaco-editor/react';
import { useRef, useEffect } from 'react';
import type * as Monaco from 'monaco-editor';
import { registerUnisonLanguage } from '../editor/unisonLanguage';
import { getMonacoLspClient, type PublishDiagnosticsParams, type LspDiagnostic } from '../services/monacoLspClient';
import { registerUCMProviders, setOnDefinitionClick, setMonacoEditor, triggerDefinitionClick } from '../services/monacoUcmProviders';
import { registerDocumentSymbolProvider } from '../services/monacoSymbolProvider';
import { registerDocumentHighlightProvider } from '../services/monacoHighlightProvider';
import { ucmContext } from '../services/ucmContext';
import { getUCMLifecycleService } from '../services/ucmLifecycle';
import { formatUnisonCode } from '../services/unisonFormatter';
import {
  detectWatchExpressions,
  isWatchExpressionLine,
  detectTestExpressions,
  isTestExpressionLine,
} from '../services/watchExpressionService';
import {
  detectRunnableFunctions,
  isRunnableFunctionLine,
  getRunnableFunctionName,
} from '../services/runnableFunctionService';

export interface DiagnosticCount {
  errors: number;
  warnings: number;
}

interface EditorProps {
  value: string;
  onChange?: (value: string | undefined) => void;
  language?: string;
  readOnly?: boolean;
  filePath?: string;
  onDefinitionClick?: (name: string, type: 'term' | 'type') => void;
  onRunWatchExpression?: (lineNumber: number, fullCode: string) => void;
  onRunTestExpression?: (lineNumber: number, fullCode: string) => void;
  onRunFunction?: (functionName: string) => void;
  onDiagnosticsChange?: (diagnostics: DiagnosticCount) => void;
  onEditorMount?: (editor: Monaco.editor.IStandaloneCodeEditor) => void;
}

/**
 * Convert LSP severity to Monaco MarkerSeverity
 */
function lspSeverityToMonaco(severity?: number): Monaco.MarkerSeverity {
  // Monaco MarkerSeverity: 1=Hint, 2=Info, 4=Warning, 8=Error
  // LSP DiagnosticSeverity: 1=Error, 2=Warning, 3=Info, 4=Hint
  switch (severity) {
    case 1: return 8; // Error
    case 2: return 4; // Warning
    case 3: return 2; // Info
    case 4: return 1; // Hint
    default: return 8; // Default to Error
  }
}

/**
 * Convert LSP diagnostics to Monaco markers
 */
function diagnosticsToMarkers(
  diagnostics: LspDiagnostic[],
  _monaco: typeof Monaco
): Monaco.editor.IMarkerData[] {
  return diagnostics.map((diag) => ({
    severity: lspSeverityToMonaco(diag.severity),
    message: diag.message,
    startLineNumber: diag.range.start.line + 1, // LSP is 0-based, Monaco is 1-based
    startColumn: diag.range.start.character + 1,
    endLineNumber: diag.range.end.line + 1,
    endColumn: diag.range.end.character + 1,
    source: diag.source || 'unison',
    code: diag.code?.toString(),
  }));
}

/**
 * Unison Code Editor
 *
 * Monaco editor with hybrid UCM/LSP integration:
 * - UCM API: Hover, completion, go-to-definition (full codebase context)
 * - LSP: Diagnostics and type errors only (scratch file validation)
 */
export function Editor({
  value,
  onChange,
  language = 'unison',
  readOnly = false,
  filePath,
  onDefinitionClick,
  onRunWatchExpression,
  onRunTestExpression,
  onRunFunction,
  onDiagnosticsChange,
  onEditorMount,
}: EditorProps) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const documentUriRef = useRef<string | null>(null);
  const watchDecorationsRef = useRef<string[]>([]);
  const testDecorationsRef = useRef<string[]>([]);
  const runnableFunctionDecorationsRef = useRef<string[]>([]);

  const lspClient = getMonacoLspClient();

  // Store onRunWatchExpression in a ref so we can use it in event handlers
  const onRunWatchExpressionRef = useRef(onRunWatchExpression);
  onRunWatchExpressionRef.current = onRunWatchExpression;

  // Store onRunTestExpression in a ref so we can use it in event handlers
  const onRunTestExpressionRef = useRef(onRunTestExpression);
  onRunTestExpressionRef.current = onRunTestExpression;

  // Store onRunFunction in a ref so we can use it in event handlers
  const onRunFunctionRef = useRef(onRunFunction);
  onRunFunctionRef.current = onRunFunction;

  // Initialize UCM context (once per app)
  useEffect(() => {
    async function initUCM() {
      try {
        await ucmContext.initialize();
        console.log('UCM context initialized');
      } catch (error) {
        console.error('Failed to initialize UCM context:', error);
      }
    }

    initUCM();

    return () => {
      ucmContext.dispose();
    };
  }, []);

  // Track the last connected port to detect port changes
  const lastConnectedPortRef = useRef<number | null>(null);

  // Initialize LSP connection and reconnect when UCM status changes
  useEffect(() => {
    const ucmLifecycle = getUCMLifecycleService();

    async function connectLSP() {
      try {
        const ports = ucmLifecycle.getPorts();
        const wsPort = ports?.lspProxyPort ?? 5758;

        // If we're already connected to this port, don't reconnect
        if (lspClient.connected && lastConnectedPortRef.current === wsPort) {
          return;
        }

        // If connected to a different port, disconnect first
        if (lspClient.connected && lastConnectedPortRef.current !== wsPort) {
          console.log(`[Editor] LSP port changed from ${lastConnectedPortRef.current} to ${wsPort}, reconnecting...`);
          await lspClient.disconnect();
          lspClient.resetReconnect(); // Allow reconnection after disconnect
        }

        // Connect to LSP via WebSocket proxy
        await lspClient.connect(wsPort);
        lastConnectedPortRef.current = wsPort;
        console.log(`[Editor] LSP connected on port ${wsPort} (diagnostics only)`);
      } catch (error) {
        console.error('[Editor] Failed to connect to LSP:', error);
      }
    }

    // Initial connection if not already connected
    if (!lspClient.connected) {
      connectLSP();
    }

    // Subscribe to UCM status changes to reconnect LSP when UCM comes back online
    const unsubscribe = ucmLifecycle.onStatusChange((status) => {
      if (status === 'running') {
        console.log('[Editor] UCM status changed to running, reconnecting LSP...');
        connectLSP();
      } else if (status === 'error' || status === 'stopped') {
        // Clear the port ref so we reconnect on next start
        lastConnectedPortRef.current = null;
      }
    });

    return () => {
      unsubscribe();
    };
  }, [lspClient]);

  // Subscribe to LSP diagnostics
  useEffect(() => {
    const unsubscribe = lspClient.onDiagnostics((params: PublishDiagnosticsParams) => {
      const editor = editorRef.current;
      const monaco = monacoRef.current;
      const currentUri = documentUriRef.current;

      if (!editor || !monaco || !currentUri) return;

      // Only apply diagnostics for the current document
      if (params.uri !== currentUri) {
        console.log('[Editor] Ignoring diagnostics for different URI:', params.uri, 'vs', currentUri);
        return;
      }

      const model = editor.getModel();
      if (!model) return;

      // Convert LSP diagnostics to Monaco markers
      const markers = diagnosticsToMarkers(params.diagnostics, monaco);
      monaco.editor.setModelMarkers(model, 'unison-lsp', markers);

      // Count errors and warnings for the status indicator
      const errors = params.diagnostics.filter(d => d.severity === 1).length;
      const warnings = params.diagnostics.filter(d => d.severity === 2).length;

      // Notify parent component
      if (onDiagnosticsChange) {
        onDiagnosticsChange({ errors, warnings });
      }

      console.log(`[Editor] Applied ${markers.length} diagnostics (${errors} errors, ${warnings} warnings)`);
    });

    return () => {
      unsubscribe();
    };
  }, [lspClient]);

  // Store onDefinitionClick in a ref so we can use it in handleEditorWillMount
  const onDefinitionClickRef = useRef(onDefinitionClick);
  onDefinitionClickRef.current = onDefinitionClick;

  function handleEditorWillMount(monaco: typeof Monaco) {
    // Register Unison language BEFORE the editor mounts
    registerUnisonLanguage(monaco);
    monacoRef.current = monaco;

    // Register UCM providers for IDE features (hover, completion, etc.)
    registerUCMProviders(monaco, language);
    console.log('UCM providers registered (hover, completion, definition, signature help)');

    // Register document symbol provider (enables outline, breadcrumbs, Ctrl+Shift+O)
    registerDocumentSymbolProvider();

    // Register document highlight provider (highlights all occurrences of selected symbol)
    registerDocumentHighlightProvider();
    console.log('Document symbol and highlight providers registered');

    // Register document formatting provider (uses custom Unison formatter)
    monaco.languages.registerDocumentFormattingEditProvider(language, {
      provideDocumentFormattingEdits(model, options) {
        try {
          const originalCode = model.getValue();
          const formattedCode = formatUnisonCode(originalCode, {
            tabSize: options.tabSize,
            insertSpaces: options.insertSpaces,
          });

          // If no changes, return empty array
          if (originalCode === formattedCode) {
            console.log('Formatting: no changes needed');
            return [];
          }

          console.log('Formatting: applying changes');
          // Return a single edit that replaces the entire document
          const lineCount = model.getLineCount();
          const lastLineLength = model.getLineLength(lineCount);

          return [{
            range: {
              startLineNumber: 1,
              startColumn: 1,
              endLineNumber: lineCount,
              endColumn: lastLineLength + 1,
            },
            text: formattedCode,
          }];
        } catch (error) {
          console.error('Document formatting error:', error);
          return [];
        }
      },
    });

    // Register range formatting provider (Format Selection)
    monaco.languages.registerDocumentRangeFormattingEditProvider(language, {
      provideDocumentRangeFormattingEdits(model, range, options) {
        try {
          // Get the selected text, expanding to full lines
          const startLine = range.startLineNumber;
          const endLine = range.endLineNumber;

          // Get the full lines in the selection
          const selectedLines: string[] = [];
          for (let i = startLine; i <= endLine; i++) {
            selectedLines.push(model.getLineContent(i));
          }
          const selectedText = selectedLines.join('\n');

          // Detect the base indentation of the selection
          const firstLineIndent = selectedLines[0].match(/^(\s*)/)?.[1] || '';

          // Format the selected code
          const formattedCode = formatUnisonCode(selectedText + '\n', {
            tabSize: options.tabSize,
            insertSpaces: options.insertSpaces,
          });

          // Remove the trailing newline we added for formatting
          let result = formattedCode.replace(/\n$/, '');

          // If the formatted code changed the base indentation, restore it
          const formattedFirstLineIndent = result.match(/^(\s*)/)?.[1] || '';
          if (formattedFirstLineIndent !== firstLineIndent && firstLineIndent.length > 0) {
            // Adjust all lines to maintain relative indentation from the original base
            const indentDiff = firstLineIndent.length - formattedFirstLineIndent.length;
            if (indentDiff > 0) {
              const padding = ' '.repeat(indentDiff);
              result = result.split('\n').map(line => line.length > 0 ? padding + line : line).join('\n');
            }
          }

          // If no changes, return empty array
          if (selectedText === result) {
            console.log('Range formatting: no changes needed');
            return [];
          }

          console.log('Range formatting: applying changes to lines', startLine, '-', endLine);

          // Return edit for the selected range (full lines)
          return [{
            range: {
              startLineNumber: startLine,
              startColumn: 1,
              endLineNumber: endLine,
              endColumn: model.getLineLength(endLine) + 1,
            },
            text: result,
          }];
        } catch (error) {
          console.error('Range formatting error:', error);
          return [];
        }
      },
    });
    console.log('Document formatting providers registered (full document + selection)');

    // Set up the definition click callback AFTER providers are registered
    console.log('[Editor] Setting definition click callback after provider registration');
    setOnDefinitionClick((fqn, type) => {
      // The fqn parameter is the fully qualified name resolved from the clicked word
      console.log('[Editor] Definition click:', fqn, type);
      if (onDefinitionClickRef.current) {
        onDefinitionClickRef.current(fqn, type);
      }
    });
  }

  function handleEditorDidMount(editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof Monaco) {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Set the editor instance for definition provider (needed for cmd+click)
    setMonacoEditor(editor);

    // Notify parent that editor is mounted (for Breadcrumbs, Outline, etc.)
    if (onEditorMount) {
      onEditorMount(editor);
    }

    console.log('Editor mounted with UCM/LSP hybrid support');

    // Listen for cmd+click to trigger definition panel
    // Monaco shows link preview on cmd+hover, but we only want to open panel on actual click
    editor.onMouseDown((e) => {
      // Check if click is on glyph margin (watch/test expression run button)
      if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
        const lineNumber = e.target.position?.lineNumber;
        if (lineNumber) {
          const model = editor.getModel();
          if (model) {
            const lineContent = model.getLineContent(lineNumber);
            if (isWatchExpressionLine(lineContent)) {
              // Run this watch expression
              console.log('[Editor] Watch expression run button clicked, line:', lineNumber);
              // Pass the full code so UCM has context
              if (onRunWatchExpressionRef.current) {
                onRunWatchExpressionRef.current(lineNumber, model.getValue());
              }
            } else if (isTestExpressionLine(lineContent)) {
              // Run this test expression
              console.log('[Editor] Test expression run button clicked, line:', lineNumber);
              if (onRunTestExpressionRef.current) {
                onRunTestExpressionRef.current(lineNumber, model.getValue());
              }
            } else if (isRunnableFunctionLine(lineContent)) {
              // Run this IO function
              const functionName = getRunnableFunctionName(lineContent);
              console.log('[Editor] Runnable function run button clicked, function:', functionName);
              if (onRunFunctionRef.current && functionName) {
                onRunFunctionRef.current(functionName);
              }
            }
          }
        }
        return; // Don't process further for gutter clicks
      }

      // Check if cmd/ctrl key is held and it's a left click on a link (definition)
      if (e.event.metaKey || e.event.ctrlKey) {
        // Check if clicking on a word (potential definition link)
        if (e.target.type === monaco.editor.MouseTargetType.CONTENT_TEXT) {
          console.log('[Editor] Cmd+click detected, triggering definition click');
          // Trigger immediately - triggerDefinitionClick handles FQN resolution
          triggerDefinitionClick();
        }
      }
    });

    // Update watch, test, and runnable function decorations on content change
    const updateDecorations = () => {
      const model = editor.getModel();
      if (!model) return;

      const content = model.getValue();
      const watchExpressions = detectWatchExpressions(content);
      const testExpressions = detectTestExpressions(content);
      const runnableFunctions = detectRunnableFunctions(content);

      // Create decorations for each watch expression line
      const watchDecorations = watchExpressions.map((watch) => ({
        range: new monaco.Range(watch.lineNumber, 1, watch.lineNumber, 1),
        options: {
          glyphMarginClassName: 'watch-expression-run-button',
          glyphMarginHoverMessage: { value: 'Run expression (click to evaluate)' },
        },
      }));

      // Create decorations for each test expression line
      const testDecorations = testExpressions.map((test) => ({
        range: new monaco.Range(test.lineNumber, 1, test.lineNumber, 1),
        options: {
          glyphMarginClassName: 'test-expression-run-button',
          glyphMarginHoverMessage: { value: `Run test: ${test.name}` },
        },
      }));

      // Create decorations for each runnable IO function
      const runnableFunctionDecorations = runnableFunctions.map((func) => ({
        range: new monaco.Range(func.lineNumber, 1, func.lineNumber, 1),
        options: {
          glyphMarginClassName: 'runnable-function-run-button',
          glyphMarginHoverMessage: { value: `Run function: ${func.name} (must be saved to codebase first)` },
        },
      }));

      // Apply watch decorations
      watchDecorationsRef.current = editor.deltaDecorations(
        watchDecorationsRef.current,
        watchDecorations
      );

      // Apply test decorations
      testDecorationsRef.current = editor.deltaDecorations(
        testDecorationsRef.current,
        testDecorations
      );

      // Apply runnable function decorations
      runnableFunctionDecorationsRef.current = editor.deltaDecorations(
        runnableFunctionDecorationsRef.current,
        runnableFunctionDecorations
      );
    };

    // Update decorations initially
    updateDecorations();

    // Track version for LSP didChange
    let documentVersion = 1;

    // Update decorations when content changes and notify LSP
    editor.onDidChangeModelContent(() => {
      updateDecorations();

      // Send didChange to LSP for live diagnostics
      if (lspClient.connected && documentUriRef.current) {
        const model = editor.getModel();
        if (model) {
          documentVersion++;
          lspClient.sendLspNotification('textDocument/didChange', {
            textDocument: {
              uri: documentUriRef.current,
              version: documentVersion,
            },
            contentChanges: [
              { text: model.getValue() }, // Full document sync
            ],
          });
        }
      }
    });

    // Send textDocument/didOpen notification to LSP server for diagnostics
    if (lspClient.connected) {
      const model = editor.getModel();
      if (model) {
        // Convert file path to file:// URI, or use a temp URI for scratch files
        const documentUri = filePath
          ? `file://${filePath}`
          : `file:///tmp/scratch-${Date.now()}.u`;

        // Store the document URI
        documentUriRef.current = documentUri;

        console.log(`Sending textDocument/didOpen to LSP for diagnostics: ${documentUri}`);
        lspClient.sendLspNotification('textDocument/didOpen', {
          textDocument: {
            uri: documentUri,
            languageId: language,
            version: 1,
            text: model.getValue(),
          },
        });
      }
    }
  }

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative' }}>
      <MonacoEditor
        height="100%"
        language={language}
        theme="vs-dark"
        value={value}
        onChange={onChange}
        beforeMount={handleEditorWillMount}
        onMount={handleEditorDidMount}
        options={{
          readOnly,
          minimap: { enabled: true },
          fontSize: 14,
          lineNumbers: 'on',
          renderWhitespace: 'selection',
          scrollBeyondLastLine: false,
          wordWrap: 'off',
          folding: true,
          links: true,
          automaticLayout: true,
          tabSize: 2,
          insertSpaces: true,
          // Enable glyph margin for watch expression run buttons
          glyphMargin: true,
          // Disable automatic occurrence highlighting on click (too noisy)
          // User can still use Cmd+Shift+L to select all occurrences
          occurrencesHighlight: 'off',
          // LSP features are enabled via custom LSP service (lspService.ts)
          quickSuggestions: {
            other: true,
            comments: false,
            strings: false,
          },
          suggestOnTriggerCharacters: true,
          acceptSuggestionOnCommitCharacter: true,
          acceptSuggestionOnEnter: 'on',
          snippetSuggestions: 'inline',
          hover: {
            enabled: true,
            delay: 300,
            sticky: true,
          },
          parameterHints: {
            enabled: true,
          },
          // Enable semantic highlighting
          'semanticHighlighting.enabled': true,
          // Sticky scroll - keeps function/type headers visible when scrolling
          stickyScroll: {
            enabled: true,
            maxLineCount: 5,
          },
        }}
      />
    </div>
  );
}
