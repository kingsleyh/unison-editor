import { Editor as MonacoEditor } from '@monaco-editor/react';
import { useRef, useEffect } from 'react';
import type * as Monaco from 'monaco-editor';
import { registerUnisonLanguage } from '../editor/unisonLanguage';
import { getMonacoLspClient } from '../services/monacoLspClient';
import { registerUCMProviders, setOnDefinitionClick, setMonacoEditor, triggerDefinitionClick } from '../services/monacoUcmProviders';
import { ucmContext } from '../services/ucmContext';
import {
  detectWatchExpressions,
  isWatchExpressionLine,
  detectTestExpressions,
  isTestExpressionLine,
} from '../services/watchExpressionService';

interface EditorProps {
  value: string;
  onChange?: (value: string | undefined) => void;
  language?: string;
  readOnly?: boolean;
  filePath?: string;
  onDefinitionClick?: (name: string, type: 'term' | 'type') => void;
  onRunWatchExpression?: (lineNumber: number, fullCode: string) => void;
  onRunTestExpression?: (lineNumber: number, fullCode: string) => void;
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
}: EditorProps) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const documentUriRef = useRef<string | null>(null);
  const watchDecorationsRef = useRef<string[]>([]);
  const testDecorationsRef = useRef<string[]>([]);

  const lspClient = getMonacoLspClient();

  // Store onRunWatchExpression in a ref so we can use it in event handlers
  const onRunWatchExpressionRef = useRef(onRunWatchExpression);
  onRunWatchExpressionRef.current = onRunWatchExpression;

  // Store onRunTestExpression in a ref so we can use it in event handlers
  const onRunTestExpressionRef = useRef(onRunTestExpression);
  onRunTestExpressionRef.current = onRunTestExpression;

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

  // Initialize LSP connection (once per app)
  useEffect(() => {
    async function initLSP() {
      // Only connect if not already connected
      if (lspClient.connected) {
        return;
      }

      try {
        // Connect to LSP via WebSocket proxy (port 5758)
        // LSP is used ONLY for diagnostics (type errors, parse errors)
        await lspClient.connect(5758);
        console.log('LSP connected (diagnostics only)');
      } catch (error) {
        console.error('Failed to connect to LSP:', error);
      }
    }

    // Only initialize if not already connected
    if (!lspClient.connected) {
      initLSP();
    }
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

    // Update watch and test expression decorations on content change
    const updateDecorations = () => {
      const model = editor.getModel();
      if (!model) return;

      const content = model.getValue();
      const watchExpressions = detectWatchExpressions(content);
      const testExpressions = detectTestExpressions(content);

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
    };

    // Update decorations initially
    updateDecorations();

    // Update decorations when content changes
    editor.onDidChangeModelContent(() => {
      updateDecorations();
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
          // LSP features are automatically enabled via monaco-languageclient
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
        }}
      />
    </div>
  );
}
