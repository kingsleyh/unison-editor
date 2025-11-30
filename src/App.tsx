import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { getCurrentWindow, LogicalSize, LogicalPosition } from '@tauri-apps/api/window';
import { Editor, type DiagnosticCount } from './components/Editor';
import { Navigation } from './components/Navigation';
import { DefinitionStack } from './components/DefinitionStack';
import { ResizableSplitter } from './components/ResizableSplitter';
import { VerticalResizableSplitter } from './components/VerticalResizableSplitter';
import { BottomPanelSplitter } from './components/BottomPanelSplitter';
import { TabBar } from './components/TabBar';
import { CodebaseActions } from './components/CodebaseActions';
import { RunPane } from './components/RunPane';
import { UCMTerminal } from './components/UCMTerminal';
import { GeneralTerminal } from './components/GeneralTerminal';
import { WelcomeScreen } from './components/WelcomeScreen';
import { useUnisonStore } from './store/unisonStore';
import type { EditorTab } from './store/unisonStore';
import { getUCMApiClient } from './services/ucmApi';
import { applyThemeVariables, loadTheme } from './theme/unisonTheme';
import { buildSingleWatchCode, buildSingleTestCode, buildAllWatchesCode, buildAllTestsCode, getTestName, detectTestExpressions, detectWatchExpressions } from './services/watchExpressionService';
import { getWorkspaceConfigService, type WorkspaceEditorState, type PersistedTab, type WindowState } from './services/workspaceConfigService';
import { getUCMLifecycleService } from './services/ucmLifecycle';
import './App.css';

// Debounce helper
function debounce<T extends (...args: Parameters<T>) => void>(fn: T, delay: number): T {
  let timeoutId: number | null = null;
  return ((...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => fn(...args), delay);
  }) as T;
}

function App() {
  const {
    tabs,
    activeTabId,
    addTab,
    removeTab,
    setActiveTab,
    updateTab,
    getActiveTab,
    setConnected,
    isConnected,
    runPaneCollapsed,
    setRunPaneCollapsed,
    workspaceDirectory,
    workspaceConfigLoaded,
    setWorkspaceConfigLoaded,
    setLinkedProject,
    addRecentWorkspace,
    autoRun,
    setAutoRun,
    layout,
    setLayout,
  } = useUnisonStore();

  // State for showing welcome screen vs main editor
  const [showWelcome, setShowWelcome] = useState(!workspaceDirectory);

  const [selectedDefinition, setSelectedDefinition] = useState<{
    name: string;
    type: 'term' | 'type';
    /** Unique ID to ensure each click is treated as a new selection */
    id: number;
  } | null>(null);
  const [revealInTree, setRevealInTree] = useState<string | null>(null);

  // Panel collapse states from layout (stored in Zustand, persisted per-workspace)
  const navPanelCollapsed = layout.navPanelCollapsed;
  const termsPanelCollapsed = layout.termsPanelCollapsed;
  const ucmPanelCollapsed = layout.ucmPanelCollapsed;
  const outputPanelCollapsed = layout.outputPanelCollapsed;
  const terminalPanelCollapsed = layout.terminalPanelCollapsed;

  // Layout update helpers
  const setNavPanelCollapsed = useCallback((collapsed: boolean) => {
    setLayout({ navPanelCollapsed: collapsed });
  }, [setLayout]);
  const setTermsPanelCollapsed = useCallback((collapsed: boolean) => {
    setLayout({ termsPanelCollapsed: collapsed });
  }, [setLayout]);
  const setUcmPanelCollapsed = useCallback((collapsed: boolean) => {
    setLayout({ ucmPanelCollapsed: collapsed });
  }, [setLayout]);
  const setOutputPanelCollapsed = useCallback((collapsed: boolean) => {
    setLayout({ outputPanelCollapsed: collapsed });
  }, [setLayout]);
  const setTerminalPanelCollapsed = useCallback((collapsed: boolean) => {
    setLayout({ terminalPanelCollapsed: collapsed });
  }, [setLayout]);

  // Diagnostic count from the editor (for status indicator)
  const [diagnosticCount, setDiagnosticCount] = useState<DiagnosticCount>({ errors: 0, warnings: 0 });

  const client = getUCMApiClient();
  const saveTimeoutRef = useRef<number | null>(null);
  const autoRunTimeoutRef = useRef<number | null>(null);
  // Flag to prevent saving window state until restoration is complete
  const windowRestoredRef = useRef(false);
  // Flag to prevent multiple workspace initializations
  const workspaceInitializedRef = useRef<string | null>(null);

  // Initialize theme system on mount
  useEffect(() => {
    const theme = loadTheme();
    applyThemeVariables(theme);
  }, []);

  // Track window size/position changes and save to layout
  useEffect(() => {
    const appWindow = getCurrentWindow();
    const unlistenPromises: Promise<() => void>[] = [];

    // Debounced save function to avoid too many writes
    let saveTimeout: number | null = null;
    const saveWindowState = async () => {
      // Skip saving until window restoration is complete
      if (!windowRestoredRef.current) return;

      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = window.setTimeout(async () => {
        try {
          // Use outer size (window frame) for more accurate restoration
          const size = await appWindow.outerSize();
          const position = await appWindow.outerPosition();
          const isMaximized = await appWindow.isMaximized();
          const scaleFactor = await appWindow.scaleFactor();

          // Convert to logical pixels for cross-session consistency
          const windowState: WindowState = {
            width: Math.round(size.width / scaleFactor),
            height: Math.round(size.height / scaleFactor),
            x: Math.round(position.x / scaleFactor),
            y: Math.round(position.y / scaleFactor),
            isMaximized,
          };

          setLayout({ windowState });
        } catch (e) {
          console.warn('Failed to save window state:', e);
        }
      }, 500);
    };

    // Listen for resize events
    unlistenPromises.push(
      appWindow.onResized(() => {
        saveWindowState();
      })
    );

    // Listen for move events
    unlistenPromises.push(
      appWindow.onMoved(() => {
        saveWindowState();
      })
    );

    return () => {
      if (saveTimeout) clearTimeout(saveTimeout);
      // Cleanup listeners
      Promise.all(unlistenPromises).then((unlistenFns) => {
        unlistenFns.forEach((unlisten) => unlisten());
      });
    };
  }, [setLayout]);

  // Initialize workspace configuration when workspace directory changes
  useEffect(() => {
    async function initWorkspace() {
      if (!workspaceDirectory) {
        setWorkspaceConfigLoaded(false);
        setShowWelcome(true);
        workspaceInitializedRef.current = null;
        return;
      }

      // Prevent multiple initializations for the same workspace
      if (workspaceInitializedRef.current === workspaceDirectory) {
        return;
      }
      workspaceInitializedRef.current = workspaceDirectory;

      setShowWelcome(false);

      const configService = getWorkspaceConfigService();
      const ucmLifecycle = getUCMLifecycleService();

      try {
        // Create .unison-editor/ if needed
        if (!(await configService.hasConfig(workspaceDirectory))) {
          await configService.initWorkspace(workspaceDirectory);
        }

        // Load config and set linked project
        const config = await configService.loadConfig(workspaceDirectory);
        if (config?.linkedProject) {
          setLinkedProject(config.linkedProject);
        }

        // Load editor state (tabs, layout)
        const editorState = await configService.loadEditorState(workspaceDirectory);
        if (editorState) {
          // Restore layout
          if (editorState.layout) {
            setLayout(editorState.layout);

            // Restore window size/position
            if (editorState.layout.windowState) {
              const windowState = editorState.layout.windowState;
              const appWindow = getCurrentWindow();

              try {
                // First check if it was maximized
                if (windowState.isMaximized) {
                  await appWindow.maximize();
                } else {
                  // Use LogicalSize/Position for cross-platform consistency
                  // Restore position first if available (before resize to avoid off-screen)
                  if (windowState.x !== undefined && windowState.y !== undefined) {
                    await appWindow.setPosition(new LogicalPosition(windowState.x, windowState.y));
                  }
                  // Restore size using logical pixels
                  await appWindow.setSize(new LogicalSize(windowState.width, windowState.height));
                }
                // Small delay to ensure Tauri has finished applying the size
                // before enabling window event tracking
                await new Promise(resolve => setTimeout(resolve, 200));
              } catch (e) {
                console.warn('Failed to restore window state:', e);
              }
            }
          }
          // Restore auto-run preference
          if (editorState.autoRun !== undefined) {
            setAutoRun(editorState.autoRun);
          }
          // Restore tabs - load file content for each tab with filePath
          if (editorState.tabs && editorState.tabs.length > 0) {
            // Clear existing tabs before restoring to prevent duplicates
            const { clearTabs } = useUnisonStore.getState();
            clearTabs();

            const { getFileSystemService } = await import('./services/fileSystem');
            const fileSystemService = getFileSystemService();

            for (const persistedTab of editorState.tabs) {
              try {
                let content = persistedTab.content || '';
                // If tab has a file path, load the content from disk (may have changed)
                if (persistedTab.filePath) {
                  try {
                    content = await fileSystemService.readFile(persistedTab.filePath);
                  } catch (e) {
                    console.warn(`Failed to load file for tab ${persistedTab.title}:`, e);
                    continue; // Skip tabs with missing files
                  }
                }
                const tab: EditorTab = {
                  id: persistedTab.id,
                  title: persistedTab.title,
                  content,
                  language: persistedTab.language,
                  isDirty: false,
                  filePath: persistedTab.filePath,
                };
                addTab(tab);
              } catch (e) {
                console.error(`Failed to restore tab ${persistedTab.title}:`, e);
              }
            }
            // Restore active tab
            if (editorState.activeTabId) {
              setActiveTab(editorState.activeTabId);
            }
          }
        }

        // Enable window state saving now that restoration is complete
        windowRestoredRef.current = true;

        // Add to recent workspaces
        addRecentWorkspace(workspaceDirectory);

        // Spawn UCM PTY for this workspace - this happens independently of terminal UI
        // The UCMTerminal component will connect to this already-running process
        await ucmLifecycle.spawn(workspaceDirectory);

        setWorkspaceConfigLoaded(true);
      } catch (error) {
        console.error('Failed to initialize workspace:', error);
        setWorkspaceConfigLoaded(true); // Still mark as loaded to allow app to function
      }
    }

    initWorkspace();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceDirectory]);

  // Debounced save of editor state when tabs or layout changes
  const debouncedSaveEditorState = useMemo(
    () =>
      debounce(async () => {
        if (!workspaceDirectory || !workspaceConfigLoaded) return;

        const state = useUnisonStore.getState();
        const configService = getWorkspaceConfigService();

        const editorState: WorkspaceEditorState = {
          version: 2,
          tabs: state.tabs.map((t): PersistedTab => ({
            id: t.id,
            title: t.title,
            filePath: t.filePath,
            content: t.filePath ? undefined : t.content, // Only save content for scratch tabs
            language: t.language,
          })),
          activeTabId: state.activeTabId,
          autoRun: state.autoRun,
          layout: state.layout,
        };

        await configService.saveEditorState(workspaceDirectory, editorState);
      }, 500),
    [workspaceDirectory, workspaceConfigLoaded]
  );

  // Save state when tabs, activeTabId, autoRun, layout, or definition cards change
  useEffect(() => {
    if (workspaceDirectory && workspaceConfigLoaded) {
      debouncedSaveEditorState();
    }
  }, [tabs, activeTabId, autoRun, layout, workspaceDirectory, workspaceConfigLoaded, debouncedSaveEditorState]);

  // Check UCM API connection only when workspace config is loaded
  // This polls the UCM HTTP API to verify UCM is ready to accept commands
  useEffect(() => {
    if (workspaceConfigLoaded && workspaceDirectory) {
      checkConnection();
    }
  }, [workspaceConfigLoaded, workspaceDirectory]);

  // Run auto-run when autoRun is toggled on OR when tab changes while autoRun is enabled
  // Tab changes get a 1 second delay to allow large files to load
  useEffect(() => {
    let tabSwitchTimeout: number | null = null;

    const unsubscribe = useUnisonStore.subscribe(
      (state, prevState) => {
        // Check if autoRun was just turned on (false -> true)
        if (state.autoRun && !prevState.autoRun) {
          const activeTab = state.tabs.find(t => t.id === state.activeTabId);
          if (activeTab?.content) {
            handleAutoRun(activeTab.content);
          }
        }

        // Check if tab changed while autoRun is enabled
        if (state.autoRun && state.activeTabId !== prevState.activeTabId && state.activeTabId) {
          // Clear any pending tab switch auto-run
          if (tabSwitchTimeout) {
            clearTimeout(tabSwitchTimeout);
          }
          // Delay auto-run by 1 second when switching tabs (allows large files to load)
          tabSwitchTimeout = window.setTimeout(() => {
            const activeTab = state.tabs.find(t => t.id === state.activeTabId);
            if (activeTab?.content) {
              handleAutoRun(activeTab.content);
            }
          }, 1000);
        }
      }
    );

    return () => {
      unsubscribe();
      if (tabSwitchTimeout) {
        clearTimeout(tabSwitchTimeout);
      }
    };
  }, []);

  async function checkConnection(retries = 10, delay = 1000) {
    // UCM takes a few seconds to start up, so we poll for connection
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const connected = await client.checkConnection();
        if (connected) {
          console.log(`UCM connected on attempt ${attempt}`);
          setConnected(true);
          return;
        }
      } catch (err) {
        console.log(`Connection attempt ${attempt}/${retries} failed:`, err);
      }

      // Wait before next attempt (except on last try)
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // All retries exhausted
    console.error('Failed to connect to UCM after all retries');
    setConnected(false);
  }

  function handleOpenDefinition(name: string, type: 'term' | 'type') {
    // Auto-expand the Terms panel if it's collapsed
    if (termsPanelCollapsed) {
      setTermsPanelCollapsed(false);
    }

    // Show in definition stack
    // Tree reveal is now handled by DefinitionStack after resolution
    // Use unique ID so each click triggers useEffect even for same definition
    setSelectedDefinition({ name, type, id: Date.now() });
  }

  /**
   * Handle running a single watch expression from the editor gutter.
   * Only evaluates the clicked watch expression (not all of them).
   * @param lineNumber The line number of the watch expression
   * @param fullCode The full editor content (for context)
   */
  async function handleRunWatchExpression(lineNumber: number, fullCode: string) {
    const { currentProject, currentBranch, setRunOutput } = useUnisonStore.getState();

    if (!currentProject || !currentBranch) {
      setRunOutput({
        type: 'error',
        message: 'No project/branch selected. Please select a project first.',
      });
      return;
    }

    // Auto-expand output pane
    setRunPaneCollapsed(false);

    // Show loading state
    setRunOutput({ type: 'info', message: 'Evaluating...' });

    try {
      // Build code with all definitions but only the clicked watch expression
      const singleWatchCode = buildSingleWatchCode(fullCode, lineNumber);

      const result = await client.typecheckCode(
        currentProject.name,
        currentBranch.name,
        singleWatchCode
      );

      if (result.errors.length > 0) {
        setRunOutput({ type: 'error', message: result.errors.join('\n') });
      } else if (result.watchResults.length > 0) {
        // Should only have one result since we filtered to one watch expression
        const watchResult = result.watchResults[0];
        setRunOutput({
          type: 'success',
          message: `> ${watchResult.expression}\n⇒ ${watchResult.result}`,
        });
      } else if (result.output && result.output.includes('⧩')) {
        // Fallback: try to parse watch result from output string
        // Format: "  5 | > square 4\n        ⧩\n        16"
        const lines = result.output.split('\n');
        let expression = '';
        let watchResult = '';
        let foundArrow = false;

        for (const line of lines) {
          if (line.includes(' | ') && line.includes('>')) {
            // Extract expression: "  5 | > square 4" -> "square 4"
            const match = line.match(/\|\s*>\s*(.+)/);
            if (match) {
              expression = match[1].trim();
            }
          } else if (line.includes('⧩')) {
            foundArrow = true;
          } else if (foundArrow && line.trim()) {
            watchResult = line.trim();
            break;
          }
        }

        if (expression && watchResult) {
          setRunOutput({
            type: 'success',
            message: `> ${expression}\n⇒ ${watchResult}`,
          });
        } else {
          setRunOutput({ type: 'info', message: result.output });
        }
      } else {
        // No watch results
        setRunOutput({ type: 'info', message: result.output || 'No result' });
      }
    } catch (err) {
      setRunOutput({
        type: 'error',
        message: `Failed to evaluate: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  /**
   * Handle running all watch expressions in the current file.
   * Evaluates all watch expressions and shows all results.
   */
  async function handleRunAllWatchExpressions() {
    const activeTab = getActiveTab();
    const { currentProject, currentBranch, setRunOutput } = useUnisonStore.getState();

    if (!activeTab) {
      return;
    }

    if (!currentProject || !currentBranch) {
      setRunOutput({
        type: 'error',
        message: 'No project/branch selected. Please select a project first.',
      });
      return;
    }

    const watches = detectWatchExpressions(activeTab.content);
    if (watches.length === 0) {
      setRunOutput({ type: 'info', message: 'No watch expressions found' });
      return;
    }

    // Auto-expand output pane
    setRunPaneCollapsed(false);

    // Show loading state
    setRunOutput({ type: 'info', message: `Evaluating ${watches.length} watch expression(s)...` });

    try {
      // Build code with all watches but NO tests
      const watchOnlyCode = buildAllWatchesCode(activeTab.content);

      const result = await client.typecheckCode(
        currentProject.name,
        currentBranch.name,
        watchOnlyCode
      );

      if (result.errors.length > 0) {
        setRunOutput({ type: 'error', message: result.errors.join('\n') });
      } else if (result.watchResults.length > 0) {
        // Show ALL watch results
        const output = result.watchResults
          .map((w) => `> ${w.expression}\n⇒ ${w.result}`)
          .join('\n\n');
        setRunOutput({ type: 'success', message: output });
      } else if (result.output && result.output.includes('⧩')) {
        // Fallback: parse from output string
        const lines = result.output.split('\n');
        const results: Array<{expr: string, val: string}> = [];
        let currentExpr = '';
        let foundArrow = false;

        for (const line of lines) {
          if (line.includes(' | ') && line.includes('>')) {
            const match = line.match(/\|\s*>\s*(.+)/);
            if (match) {
              currentExpr = match[1].trim();
              foundArrow = false;
            }
          } else if (line.includes('⧩')) {
            foundArrow = true;
          } else if (foundArrow && line.trim() && currentExpr) {
            results.push({ expr: currentExpr, val: line.trim() });
            currentExpr = '';
            foundArrow = false;
          }
        }

        if (results.length > 0) {
          const output = results
            .map((r) => `> ${r.expr}\n⇒ ${r.val}`)
            .join('\n\n');
          setRunOutput({ type: 'success', message: output });
        } else {
          setRunOutput({ type: 'info', message: result.output });
        }
      } else {
        setRunOutput({ type: 'info', message: result.output || 'No results' });
      }
    } catch (err) {
      setRunOutput({
        type: 'error',
        message: `Failed to evaluate: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  /**
   * Handle running a single test expression from the editor gutter.
   * Only evaluates the clicked test expression (not all of them).
   * @param lineNumber The line number of the test expression
   * @param fullCode The full editor content (for context)
   */
  async function handleRunTestExpression(lineNumber: number, fullCode: string) {
    const { currentProject, currentBranch, setRunOutput } = useUnisonStore.getState();

    if (!currentProject || !currentBranch) {
      setRunOutput({
        type: 'error',
        message: 'No project/branch selected. Please select a project first.',
      });
      return;
    }

    // Get the test name from the line
    const lines = fullCode.split('\n');
    const testLine = lines[lineNumber - 1] || '';
    const testName = getTestName(testLine);

    // Auto-expand output pane
    setRunPaneCollapsed(false);

    // Show loading state
    setRunOutput({ type: 'info', message: `Running ${testName}...` });

    try {
      // Build code with all definitions but only the clicked test expression
      const singleTestCode = buildSingleTestCode(fullCode, lineNumber);

      const result = await client.typecheckCode(
        currentProject.name,
        currentBranch.name,
        singleTestCode
      );

      if (result.errors.length > 0) {
        setRunOutput({ type: 'error', message: result.errors.join('\n') });
        return;
      }

      // Check for test results (parsed from typecheck output)
      if (result.testResults && result.testResults.length > 0) {
        const testResult = result.testResults[0];
        if (testResult.passed) {
          setRunOutput({
            type: 'success',
            message: `✅ ${testName}`,
          });
        } else {
          setRunOutput({
            type: 'error',
            message: `🚫 ${testName}${testResult.message && testResult.message !== 'Failed' ? `\n${testResult.message}` : ''}`,
          });
        }
      } else if (result.output) {
        // Fallback to output string
        if (result.output.includes('✅') || result.output.includes('Passed')) {
          setRunOutput({ type: 'success', message: `✅ ${testName}` });
        } else if (result.output.includes('🚫') || result.output.includes('FAILED')) {
          setRunOutput({ type: 'error', message: `🚫 ${testName}\n${result.output}` });
        } else if (result.output.includes('[Result]') && !result.output.includes('error') && !result.output.includes('Error')) {
          // Test typechecked successfully (shows [Result] type) - assume passed
          setRunOutput({ type: 'success', message: `✅ ${testName}` });
        } else {
          setRunOutput({ type: 'info', message: result.output || 'Test completed' });
        }
      } else {
        setRunOutput({ type: 'info', message: 'Test completed' });
      }
    } catch (err) {
      setRunOutput({
        type: 'error',
        message: `Failed to run test: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  /**
   * Handle running all test expressions in the current file.
   */
  async function handleRunAllTestExpressions() {
    const activeTab = getActiveTab();
    const { currentProject, currentBranch, setRunOutput } = useUnisonStore.getState();

    if (!activeTab) {
      return;
    }

    if (!currentProject || !currentBranch) {
      setRunOutput({
        type: 'error',
        message: 'No project/branch selected. Please select a project first.',
      });
      return;
    }

    const tests = detectTestExpressions(activeTab.content);
    if (tests.length === 0) {
      setRunOutput({ type: 'info', message: 'No test expressions found' });
      return;
    }

    // Auto-expand output pane
    setRunPaneCollapsed(false);

    // Show loading state
    setRunOutput({ type: 'info', message: `Running ${tests.length} test(s)...` });

    try {
      // Build code with all tests but NO watch expressions
      const testOnlyCode = buildAllTestsCode(activeTab.content);

      const result = await client.typecheckCode(
        currentProject.name,
        currentBranch.name,
        testOnlyCode
      );

      if (result.errors.length > 0) {
        setRunOutput({ type: 'error', message: result.errors.join('\n') });
        return;
      }

      // Check if testResults has real individual test names
      const hasRealTestResults = result.testResults &&
        result.testResults.length > 0 &&
        !result.testResults.every(t => t.name === 'Passed' || t.name === 'test' || t.name === '_pending_');

      if (hasRealTestResults) {
        // UCM returned individual test results with names
        const passed = result.testResults.filter(t => t.passed).length;
        const failed = result.testResults.filter(t => !t.passed).length;

        const output = result.testResults
          .map((t) => {
            if (t.passed) {
              return `✅ ${t.name}`;
            } else {
              // Include failure details if available
              const details = t.message && t.message !== 'Failed' ? `\n   ${t.message.replace(/\n/g, '\n   ')}` : '';
              return `🚫 ${t.name}${details}`;
            }
          })
          .join('\n');

        setRunOutput({
          type: failed > 0 ? 'error' : 'success',
          message: `${passed} passed, ${failed} failed\n\n${output}`,
        });
      } else {
        // Fallback: check output for failures
        const hasFailures = result.output.includes('🚫');

        if (!hasFailures) {
          // All tests passed - show each detected test name as passed
          const output = tests.map((t) => `✅ ${t.name}`).join('\n');
          setRunOutput({
            type: 'success',
            message: `${tests.length} passed, 0 failed\n\n${output}`,
          });
        } else {
          // There are failures - show the raw output so user can see what failed
          setRunOutput({
            type: 'error',
            message: result.output || 'Some tests failed',
          });
        }
      }
    } catch (err) {
      setRunOutput({
        type: 'error',
        message: `Failed to run tests: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  /**
   * Handle auto-run when content changes and autoRun is enabled.
   * Runs both tests and watches, combining output.
   */
  async function handleAutoRun(content: string) {
    const { currentProject, currentBranch, setRunOutput, setRunPaneCollapsed, autoRun } = useUnisonStore.getState();

    if (!autoRun || !currentProject || !currentBranch) {
      return;
    }

    const watches = detectWatchExpressions(content);
    const tests = detectTestExpressions(content);

    // Auto-expand output pane
    setRunPaneCollapsed(false);
    setRunOutput({ type: 'info', message: 'Auto-running...' });

    try {
      // Run typecheck with ALL expressions (both tests and watches)
      const result = await client.typecheckCode(
        currentProject.name,
        currentBranch.name,
        content // Send full content - UCM will evaluate all
      );

      // Build combined output
      const outputParts: string[] = [];

      // 1. Handle errors (inline at top if any)
      if (result.errors.length > 0) {
        outputParts.push(`⚠️ Errors:\n${result.errors.join('\n')}`);
      }

      // 2. Handle test results
      if (result.testResults && result.testResults.length > 0) {
        const passed = result.testResults.filter(t => t.passed).length;
        const failed = result.testResults.filter(t => !t.passed).length;
        const testOutput = result.testResults
          .map(t => {
            if (t.passed) {
              return `✅ ${t.name}`;
            } else {
              // Include failure details if available
              const details = t.message && t.message !== 'Failed' ? `\n   ${t.message.replace(/\n/g, '\n   ')}` : '';
              return `🚫 ${t.name}${details}`;
            }
          })
          .join('\n');
        outputParts.push(`Tests: ${passed} passed, ${failed} failed\n${testOutput}`);
      }

      // 3. Handle watch results
      if (result.watchResults && result.watchResults.length > 0) {
        const watchOutput = result.watchResults
          .map(w => `> ${w.expression}\n⇒ ${w.result}`)
          .join('\n\n');
        outputParts.push(watchOutput);
      }

      // Determine overall type based on results
      const hasErrors = result.errors.length > 0;
      const hasFailedTests = result.testResults?.some(t => !t.passed);
      const outputType = hasErrors || hasFailedTests ? 'error' : 'success';

      if (outputParts.length > 0) {
        setRunOutput({
          type: outputType,
          message: outputParts.join('\n\n'),
        });
      } else if (result.output) {
        // Fallback to raw output
        setRunOutput({ type: 'info', message: result.output });
      } else {
        setRunOutput({ type: 'success', message: '✓ No issues found' });
      }
    } catch (err) {
      setRunOutput({
        type: 'error',
        message: `Auto-run failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  /**
   * Handle manual typecheck of the current file.
   * Similar to handleAutoRun but triggered manually via button.
   */
  async function handleTypecheckAll() {
    const activeTab = getActiveTab();
    if (!activeTab?.content) {
      return;
    }

    const { currentProject, currentBranch, setRunOutput, setRunPaneCollapsed } = useUnisonStore.getState();

    if (!currentProject || !currentBranch) {
      setRunOutput({
        type: 'error',
        message: 'No project/branch selected. Please select a project first.',
      });
      setRunPaneCollapsed(false);
      return;
    }

    const content = activeTab.content;

    setRunPaneCollapsed(false);
    setRunOutput({ type: 'info', message: 'Typechecking...' });

    try {
      const result = await client.typecheckCode(
        currentProject.name,
        currentBranch.name,
        content
      );

      const outputParts: string[] = [];

      if (result.errors.length > 0) {
        outputParts.push(`⚠️ Errors:\n${result.errors.join('\n')}`);
      }

      if (result.testResults && result.testResults.length > 0) {
        const passed = result.testResults.filter(t => t.passed).length;
        const failed = result.testResults.filter(t => !t.passed).length;
        const testOutput = result.testResults
          .map(t => `${t.passed ? '✅' : '🚫'} ${t.name}`)
          .join('\n');
        outputParts.push(`Tests: ${passed} passed, ${failed} failed\n${testOutput}`);
      }

      if (result.watchResults && result.watchResults.length > 0) {
        const watchOutput = result.watchResults
          .map(w => `> ${w.expression}\n⇒ ${w.result}`)
          .join('\n\n');
        outputParts.push(watchOutput);
      }

      const hasErrors = result.errors.length > 0;
      const hasFailedTests = result.testResults?.some(t => !t.passed);
      const outputType = hasErrors || hasFailedTests ? 'error' : 'success';

      if (outputParts.length > 0) {
        setRunOutput({
          type: outputType,
          message: outputParts.join('\n\n'),
        });
      } else if (result.output) {
        setRunOutput({ type: 'info', message: result.output });
      } else {
        setRunOutput({ type: 'success', message: '✓ Typecheck passed' });
      }
    } catch (err) {
      setRunOutput({
        type: 'error',
        message: `Typecheck failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  /**
   * Handle running an IO function from the editor gutter.
   * Executes a function that has IO and Exception abilities.
   */
  async function handleRunFunction(functionName: string) {
    const { currentProject, currentBranch, setRunOutput, setRunPaneCollapsed } = useUnisonStore.getState();

    if (!currentProject || !currentBranch) {
      setRunOutput({
        type: 'error',
        message: 'No project/branch selected. Please select a project first.',
      });
      setRunPaneCollapsed(false);
      return;
    }

    // Auto-expand output pane
    setRunPaneCollapsed(false);

    // Show loading state
    setRunOutput({ type: 'info', message: `Running ${functionName}...` });

    try {
      const result = await client.runFunction(
        currentProject.name,
        currentBranch.name,
        functionName
      );

      if (result.errors.length > 0) {
        setRunOutput({
          type: 'error',
          message: result.errors.join('\n'),
        });
      } else if (result.output) {
        // Show stdout/output from the function
        setRunOutput({
          type: 'success',
          message: result.output,
        });
      } else if (result.stdout) {
        setRunOutput({
          type: 'success',
          message: result.stdout,
        });
      } else {
        setRunOutput({
          type: 'success',
          message: `${functionName} completed successfully`,
        });
      }
    } catch (err) {
      setRunOutput({
        type: 'error',
        message: `Failed to run ${functionName}: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  /**
   * Handle reveal in tree request from DefinitionStack.
   * This is called after definition resolution to ensure we have the correct FQN.
   */
  function handleRevealInTree(fqn: string, _type: 'term' | 'type') {
    // Guard: Never reveal hashes in tree
    if (fqn.startsWith('#')) {
      console.warn('[App] Ignoring hash reveal request:', fqn);
      return;
    }
    // Use timestamp suffix to re-trigger even for same path
    // Using '|' as delimiter since it's not valid in FQNs or hashes
    setRevealInTree(`${fqn}|${Date.now()}`);
  }

  async function handleFileClick(path: string, name: string) {
    // Check if file is already open in a tab
    const existingTab = tabs.find((t) => t.filePath === path);
    if (existingTab) {
      setActiveTab(existingTab.id);
      return;
    }

    try {
      // Load file content from disk
      const { getFileSystemService } = await import('./services/fileSystem');
      const fileSystemService = getFileSystemService();
      const content = await fileSystemService.readFile(path);

      // Create new tab for the file
      const newTab: EditorTab = {
        id: `tab-${Date.now()}`,
        title: name,
        content,
        language: 'unison',
        isDirty: false,
        filePath: path,
      };
      addTab(newTab);

      // Add to recent files
      const { addRecentFile } = useUnisonStore.getState();
      addRecentFile(path);
    } catch (err) {
      console.error('Failed to load file:', err);
      alert(`Failed to load file: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Helper to trigger autosave for a tab after content is programmatically added
   */
  async function triggerAutoSaveForTab(tabId: string) {
    // Small delay to ensure state is updated
    setTimeout(async () => {
      // Get fresh state from store to avoid stale closure
      const { tabs: currentTabs, updateTab: storeUpdateTab } = useUnisonStore.getState();
      const tab = currentTabs.find(t => t.id === tabId);
      if (tab?.filePath && tab.isDirty) {
        try {
          storeUpdateTab(tabId, { saveStatus: 'saving' });
          const { getFileSystemService } = await import('./services/fileSystem');
          const fileSystemService = getFileSystemService();
          await fileSystemService.writeFile(tab.filePath, tab.content);
          storeUpdateTab(tabId, { isDirty: false, saveStatus: 'saved' });
          // Clear saved indicator after 3 seconds
          setTimeout(() => {
            useUnisonStore.getState().updateTab(tabId, { saveStatus: undefined });
          }, 3000);
        } catch (err) {
          console.error('Auto-save failed:', err);
          useUnisonStore.getState().updateTab(tabId, { saveStatus: undefined });
        }
      }
    }, 100);
  }

  function handleAddToScratch(source: string, name: string) {
    const activeTab = getActiveTab();

    if (activeTab) {
      // Append to existing active tab with a comment
      const newContent = `${activeTab.content}\n\n-- From ${name}\n${source}\n`;
      updateTab(activeTab.id, {
        content: newContent,
        isDirty: true,
      });
      // Trigger autosave
      triggerAutoSaveForTab(activeTab.id);
    } else {
      // Create new scratch file with the definition
      const newTab: EditorTab = {
        id: `tab-${Date.now()}`,
        title: 'Scratch',
        content: `-- Scratch file\n\n-- From ${name}\n${source}\n`,
        language: 'unison',
        isDirty: false,
      };
      addTab(newTab);
    }
  }

  /**
   * Handle adding content to scratch from Navigation (UCM Explorer)
   * This is a wrapper that takes pre-formatted content string
   */
  function handleAddToScratchFromNav(content: string) {
    const activeTab = getActiveTab();

    if (activeTab) {
      // Append to existing active tab
      const newContent = `${activeTab.content}\n\n${content}`;
      updateTab(activeTab.id, {
        content: newContent,
        isDirty: true,
      });
      // Trigger autosave
      triggerAutoSaveForTab(activeTab.id);
    } else {
      // Create new scratch file
      const newTab: EditorTab = {
        id: `tab-${Date.now()}`,
        title: 'Scratch',
        content: `-- Scratch file\n\n${content}`,
        language: 'unison',
        isDirty: false,
      };
      addTab(newTab);
    }
  }

  // Manual save function (for Cmd+S)
  const saveCurrentFile = useCallback(async () => {
    const activeTab = getActiveTab();
    if (!activeTab || !activeTab.filePath || !activeTab.isDirty) {
      return;
    }

    try {
      // Set saving status
      updateTab(activeTab.id, { saveStatus: 'saving' });

      const { getFileSystemService } = await import('./services/fileSystem');
      const fileSystemService = getFileSystemService();
      await fileSystemService.writeFile(activeTab.filePath, activeTab.content);

      // Mark as saved
      updateTab(activeTab.id, {
        isDirty: false,
        saveStatus: 'saved',
      });

      // Clear "saved" indicator after 2 seconds
      setTimeout(() => {
        updateTab(activeTab.id, { saveStatus: undefined });
      }, 2000);
    } catch (err) {
      console.error('Failed to save file:', err);
      updateTab(activeTab.id, { saveStatus: 'error' });

      // Clear error after 3 seconds
      setTimeout(() => {
        updateTab(activeTab.id, { saveStatus: undefined });
      }, 3000);
    }
  }, [getActiveTab, updateTab]);

  // Debounced auto-save
  async function handleEditorChange(value: string | undefined) {
    if (activeTabId && value !== undefined) {
      const activeTab = getActiveTab();
      if (activeTab) {
        // Mark as dirty if content changed
        const isDirty = value !== activeTab.content;
        updateTab(activeTabId, {
          content: value,
          isDirty,
        });

        // Clear existing save timeout
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }

        // Debounced auto-save (only if file has a path and is dirty)
        if (activeTab.filePath && isDirty) {
          saveTimeoutRef.current = window.setTimeout(async () => {
            await saveCurrentFile();
          }, 500); // 500ms debounce
        }

        // Clear existing auto-run timeout
        if (autoRunTimeoutRef.current) {
          clearTimeout(autoRunTimeoutRef.current);
        }

        // Debounced auto-run (1 second after typing stops)
        const { autoRun } = useUnisonStore.getState();
        if (autoRun && isDirty) {
          autoRunTimeoutRef.current = window.setTimeout(async () => {
            await handleAutoRun(value);
          }, 1000);
        }
      }
    }
  }

  // Keyboard shortcut handler
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Cmd+S (Mac) or Ctrl+S (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        saveCurrentFile();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saveCurrentFile]);

  function handleNewFile() {
    const newTab: EditorTab = {
      id: `tab-${Date.now()}`,
      title: 'Scratch',
      content: '-- Scratch file\n\n',
      language: 'unison',
      isDirty: false,
    };
    addTab(newTab);
  }

  const activeTab = getActiveTab();

  // Handle workspace ready callback from WelcomeScreen
  const handleWorkspaceReady = useCallback(() => {
    setShowWelcome(false);
  }, []);

  // Show welcome screen when no workspace is selected
  if (showWelcome) {
    return <WelcomeScreen onWorkspaceReady={handleWorkspaceReady} />;
  }

  return (
    <div className="app">
      <div className="app-body">
        {!workspaceConfigLoaded ? (
          <div className="connection-status">Loading workspace...</div>
        ) : (
          <ResizableSplitter
            minLeftWidth={200}
            maxLeftWidth={400}
            defaultLeftWidth={250}
            width={layout.navPanelWidth}
            onWidthChange={(w) => setLayout({ navPanelWidth: w })}
            leftCollapsed={navPanelCollapsed}
            onLeftCollapse={setNavPanelCollapsed}
            collapsedLabel="Explorer"
            left={
              <Navigation
                onFileClick={handleFileClick}
                onDefinitionClick={handleOpenDefinition}
                revealInTree={revealInTree}
                onAddToScratch={handleAddToScratchFromNav}
                workspaceExpanded={layout.workspaceExpanded}
                fileExplorerExpanded={layout.fileExplorerExpanded}
                ucmExplorerExpanded={layout.ucmExplorerExpanded}
                sidebarSplitPercent={layout.sidebarSplitPercent}
                onWorkspaceExpandedChange={(expanded) => setLayout({ workspaceExpanded: expanded })}
                onFileExplorerExpandedChange={(expanded) => setLayout({ fileExplorerExpanded: expanded })}
                onUcmExplorerExpandedChange={(expanded) => setLayout({ ucmExplorerExpanded: expanded })}
                onSidebarSplitPercentChange={(percent) => setLayout({ sidebarSplitPercent: percent })}
              />
            }
            right={
              <ResizableSplitter
                minLeftWidth={300}
                maxLeftWidth={800}
                defaultLeftWidth={400}
                width={layout.termsPanelWidth}
                onWidthChange={(w) => setLayout({ termsPanelWidth: w })}
                leftCollapsed={termsPanelCollapsed}
                onLeftCollapse={setTermsPanelCollapsed}
                collapsedLabel="Terms"
                left={
                  <DefinitionStack
                    selectedDefinition={selectedDefinition}
                    onAddToScratch={handleAddToScratch}
                    onRevealInTree={handleRevealInTree}
                  />
                }
                right={
                  <main className="main-content">
                    <div className="editor-header">
                      <TabBar
                        tabs={tabs}
                        activeTabId={activeTabId}
                        onTabClick={setActiveTab}
                        onTabClose={removeTab}
                      />
                      <CodebaseActions onTypecheckAll={handleTypecheckAll} onRunAllWatchExpressions={handleRunAllWatchExpressions} onRunAllTestExpressions={handleRunAllTestExpressions} diagnosticCount={diagnosticCount} />
                    </div>

                    <VerticalResizableSplitter
                      minTopHeight={150}
                      minBottomHeight={120}
                      defaultTopPercent={65}
                      topPercent={layout.editorBottomSplitPercent}
                      onTopPercentChange={(p) => setLayout({ editorBottomSplitPercent: p })}
                      bottomCollapsed={layout.bottomPanelCollapsed}
                      onBottomCollapse={(collapsed) => setLayout({ bottomPanelCollapsed: collapsed })}
                      collapsedHeight={32}
                      collapsedLabel="Panel"
                      top={
                        <div className="editor-container">
                          {activeTab ? (
                            <Editor
                              value={activeTab.content}
                              onChange={handleEditorChange}
                              language={activeTab.language}
                              filePath={activeTab.filePath}
                              onDefinitionClick={handleOpenDefinition}
                              onRunWatchExpression={handleRunWatchExpression}
                              onRunTestExpression={handleRunTestExpression}
                              onRunFunction={handleRunFunction}
                              onDiagnosticsChange={setDiagnosticCount}
                            />
                          ) : (
                            <div className="no-editor">
                              <p>No scratch file open</p>
                              <button onClick={handleNewFile}>
                                Create Scratch File
                              </button>
                            </div>
                          )}
                        </div>
                      }
                      bottom={
                        <BottomPanelSplitter
                          widths={layout.bottomPanelWidths}
                          onWidthsChange={(widths) => setLayout({ bottomPanelWidths: widths })}
                          panels={[
                            {
                              id: 'ucm',
                              label: 'UCM',
                              component: <UCMTerminal isCollapsed={ucmPanelCollapsed} />,
                              collapsed: ucmPanelCollapsed,
                              onCollapse: setUcmPanelCollapsed,
                              minWidth: 200,
                              defaultWidth: 40,
                            },
                            {
                              id: 'output',
                              label: 'Output',
                              component: (
                                <RunPane isCollapsed={outputPanelCollapsed} />
                              ),
                              collapsed: outputPanelCollapsed,
                              onCollapse: setOutputPanelCollapsed,
                              minWidth: 150,
                              defaultWidth: 35,
                              headerActions: (
                                <button
                                  className="bottom-panel-action-btn"
                                  onClick={() => useUnisonStore.getState().clearRunOutput()}
                                  title="Clear output"
                                >
                                  Clear
                                </button>
                              ),
                            },
                            {
                              id: 'terminal',
                              label: 'Terminal',
                              component: <GeneralTerminal isCollapsed={terminalPanelCollapsed} />,
                              collapsed: terminalPanelCollapsed,
                              onCollapse: setTerminalPanelCollapsed,
                              minWidth: 150,
                              defaultWidth: 25,
                            },
                          ]}
                        />
                      }
                    />
                  </main>
                }
              />
            }
          />
        )}
      </div>
    </div>
  );
}

export default App;
