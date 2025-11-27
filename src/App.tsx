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
  } | null>(null);
  const [revealInTree, setRevealInTree] = useState<string | null>(null);

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
    // Show in definition stack
    // Tree reveal is now handled by DefinitionStack after resolution
    setSelectedDefinition({ name, type });
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
                      <CodebaseActions />
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
