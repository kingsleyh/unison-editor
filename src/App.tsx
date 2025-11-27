import { useEffect, useState, useRef, useCallback } from 'react';
import { Editor } from './components/Editor';
import { ProjectBranchSelector } from './components/ProjectBranchSelector';
import { Navigation } from './components/Navigation';
import { DefinitionStack } from './components/DefinitionStack';
import { ResizableSplitter } from './components/ResizableSplitter';
import { VerticalResizableSplitter } from './components/VerticalResizableSplitter';
import { TabBar } from './components/TabBar';
import { CodebaseActions } from './components/CodebaseActions';
import { RunPane } from './components/RunPane';
import { useUnisonStore } from './store/unisonStore';
import type { EditorTab } from './store/unisonStore';
import { getUCMApiClient } from './services/ucmApi';
import { applyThemeVariables, loadTheme } from './theme/unisonTheme';
import { buildSingleWatchCode, buildSingleTestCode, buildAllWatchesCode, buildAllTestsCode, getTestName, detectTestExpressions, detectWatchExpressions } from './services/watchExpressionService';
import './App.css';

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
  } = useUnisonStore();

  const [connectionChecking, setConnectionChecking] = useState(true);
  const [selectedDefinition, setSelectedDefinition] = useState<{
    name: string;
    type: 'term' | 'type';
    /** Unique ID to ensure each click is treated as a new selection */
    id: number;
  } | null>(null);
  const [revealInTree, setRevealInTree] = useState<string | null>(null);

  // Panel collapse states
  const [navPanelCollapsed, setNavPanelCollapsed] = useState(false);
  const [termsPanelCollapsed, setTermsPanelCollapsed] = useState(true);

  const client = getUCMApiClient();
  const saveTimeoutRef = useRef<number | null>(null);

  // Initialize theme system on mount
  useEffect(() => {
    const theme = loadTheme();
    applyThemeVariables(theme);
  }, []);

  // Check UCM connection on mount
  useEffect(() => {
    checkConnection();
  }, []);

  async function checkConnection() {
    setConnectionChecking(true);
    try {
      const connected = await client.checkConnection();
      setConnected(connected);
    } catch (err) {
      console.error('Failed to check connection:', err);
      setConnected(false);
    } finally {
      setConnectionChecking(false);
    }
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
          .map((t) => `${t.passed ? '✅' : '🚫'} ${t.name}`)
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

  function handleAddToScratch(source: string, name: string) {
    const activeTab = getActiveTab();

    if (activeTab) {
      // Append to existing active tab with a comment
      const newContent = `${activeTab.content}\n\n-- From ${name}\n${source}\n`;
      updateTab(activeTab.id, {
        content: newContent,
        isDirty: true,
      });
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

  return (
    <div className="app">
      <header className="app-header">
        <h1>Unison Editor</h1>
        <ProjectBranchSelector />
      </header>

      <div className="app-body">
        {connectionChecking ? (
          <div className="connection-status">Checking connection...</div>
        ) : !isConnected ? (
          <div className="connection-error">
            <h2>Not Connected to UCM</h2>
            <p>
              Please ensure UCM is running and accessible at the configured
              address.
            </p>
            <button onClick={checkConnection}>Retry Connection</button>
          </div>
        ) : (
          <ResizableSplitter
            minLeftWidth={200}
            maxLeftWidth={400}
            defaultLeftWidth={250}
            leftCollapsed={navPanelCollapsed}
            onLeftCollapse={setNavPanelCollapsed}
            collapsedLabel="Explorer"
            left={
              <Navigation
                onFileClick={handleFileClick}
                onDefinitionClick={handleOpenDefinition}
                revealInTree={revealInTree}
              />
            }
            right={
              <ResizableSplitter
                minLeftWidth={300}
                maxLeftWidth={800}
                defaultLeftWidth={400}
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
                      <CodebaseActions onRunAllWatchExpressions={handleRunAllWatchExpressions} onRunAllTestExpressions={handleRunAllTestExpressions} />
                    </div>

                    <VerticalResizableSplitter
                      minTopHeight={150}
                      minBottomHeight={80}
                      defaultTopPercent={75}
                      bottomCollapsed={runPaneCollapsed}
                      onBottomCollapse={setRunPaneCollapsed}
                      collapsedHeight={32}
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
                        <RunPane
                          isCollapsed={runPaneCollapsed}
                          onToggleCollapse={() => setRunPaneCollapsed(!runPaneCollapsed)}
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
