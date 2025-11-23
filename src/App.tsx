import { useEffect, useState } from 'react';
import { Editor } from './components/Editor';
import { ProjectBranchSelector } from './components/ProjectBranchSelector';
import { NamespaceBrowser } from './components/NamespaceBrowser';
import { ResizableSplitter } from './components/ResizableSplitter';
import { useUnisonStore } from './store/unisonStore';
import type { EditorTab } from './store/unisonStore';
import { getUCMApiClient } from './services/ucmApi';
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

  const client = getUCMApiClient();

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

  async function handleOpenDefinition(name: string, type: 'term' | 'type') {
    const { currentProject, currentBranch } = useUnisonStore.getState();

    if (!currentProject || !currentBranch) {
      alert('Please select a project and branch first');
      return;
    }

    try {
      const definition = await client.getDefinition(
        currentProject.name,
        currentBranch.name,
        name
      );

      if (!definition) {
        alert(`Definition not found: ${name}`);
        return;
      }

      // Check if already open in a tab
      const existingTab = tabs.find((t) => t.definition?.name === name);
      if (existingTab) {
        setActiveTab(existingTab.id);
        return;
      }

      // Create new tab
      const newTab: EditorTab = {
        id: `tab-${Date.now()}`,
        title: name,
        content: definition.source,
        language: 'unison',
        definition: {
          name: definition.name,
          hash: definition.hash,
          type,
          source: definition.source,
        },
        isDirty: false,
      };

      addTab(newTab);
    } catch (err) {
      console.error('Failed to open definition:', err);
      alert(`Failed to open definition: ${err}`);
    }
  }

  function handleEditorChange(value: string | undefined) {
    if (activeTabId && value !== undefined) {
      const activeTab = getActiveTab();
      if (activeTab) {
        updateTab(activeTabId, {
          content: value,
          isDirty: value !== activeTab.definition?.source,
        });
      }
    }
  }

  function handleNewFile() {
    const newTab: EditorTab = {
      id: `tab-${Date.now()}`,
      title: 'Untitled',
      content: '-- New Unison file\n\n',
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
            maxLeftWidth={600}
            defaultLeftWidth={250}
            left={<NamespaceBrowser onOpenDefinition={handleOpenDefinition} />}
            right={
              <main className="main-content">
                <div className="tabs-bar">
                  <div className="tabs">
                    {tabs.map((tab) => (
                      <div
                        key={tab.id}
                        className={`tab ${tab.id === activeTabId ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab.id)}
                      >
                        <span className="tab-title">
                          {tab.title}
                          {tab.isDirty && ' •'}
                        </span>
                        <button
                          className="tab-close"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeTab(tab.id);
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                  <button className="new-file-btn" onClick={handleNewFile}>
                    + New
                  </button>
                </div>

                <div className="editor-container">
                  {activeTab ? (
                    <Editor
                      value={activeTab.content}
                      onChange={handleEditorChange}
                      language={activeTab.language}
                    />
                  ) : (
                    <div className="no-editor">
                      <p>No file open</p>
                      <button onClick={handleNewFile}>Create New File</button>
                    </div>
                  )}
                </div>
              </main>
            }
          />
        )}
      </div>
    </div>
  );
}

export default App;
