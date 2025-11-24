import { useEffect, useState } from 'react';
import { Editor } from './components/Editor';
import { ProjectBranchSelector } from './components/ProjectBranchSelector';
import { Navigation } from './components/Navigation';
import { DefinitionStack } from './components/DefinitionStack';
import { ResizableSplitter } from './components/ResizableSplitter';
import { TabBar } from './components/TabBar';
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
  } = useUnisonStore();

  const [connectionChecking, setConnectionChecking] = useState(true);
  const [selectedDefinition, setSelectedDefinition] = useState<{
    name: string;
    type: 'term' | 'type';
  } | null>(null);

  const client = getUCMApiClient();

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
    setSelectedDefinition({ name, type });
  }

  function handleFileClick(path: string, name: string) {
    // Check if file is already open in a tab
    const existingTab = tabs.find((t) => t.title === name);
    if (existingTab) {
      setActiveTab(existingTab.id);
      return;
    }

    // Create new tab for the file
    // For now, use empty content. Will load from file system later
    const newTab: EditorTab = {
      id: `tab-${Date.now()}`,
      title: name,
      content: `-- ${name}\n\n`,
      language: 'unison',
      isDirty: false,
    };
    addTab(newTab);
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

  function handleEditorChange(value: string | undefined) {
    if (activeTabId && value !== undefined) {
      const activeTab = getActiveTab();
      if (activeTab) {
        // Mark as dirty if content changed from original
        const isDirty = value !== (activeTab.content || '');
        updateTab(activeTabId, {
          content: value,
          isDirty,
        });
      }
    }
  }

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
                  />
                }
                right={
                  <main className="main-content">
                    <TabBar
                      tabs={tabs}
                      activeTabId={activeTabId}
                      onTabClick={setActiveTab}
                      onTabClose={removeTab}
                      onNewFile={handleNewFile}
                    />

                    <div className="editor-container">
                      {activeTab ? (
                        <Editor
                          value={activeTab.content}
                          onChange={handleEditorChange}
                          language={activeTab.language}
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
