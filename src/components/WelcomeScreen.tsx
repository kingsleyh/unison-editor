import { useState, useCallback } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useUnisonStore } from '../store/unisonStore';
import { WorkspaceSetupDialog } from './WorkspaceSetupDialog';

interface WelcomeScreenProps {
  onWorkspaceReady: () => void;
}

export function WelcomeScreen({ onWorkspaceReady }: WelcomeScreenProps) {
  const recentWorkspaces = useUnisonStore((state) => state.recentWorkspaces);
  const setWorkspaceDirectory = useUnisonStore((state) => state.setWorkspaceDirectory);
  const addRecentWorkspace = useUnisonStore((state) => state.addRecentWorkspace);

  const [showSetupDialog, setShowSetupDialog] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);

  const handleOpenFolder = useCallback(async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select Workspace Folder',
    });

    if (selected && typeof selected === 'string') {
      setSelectedFolder(selected);
      setShowSetupDialog(true);
    }
  }, []);

  const handleRecentWorkspace = useCallback(
    async (path: string) => {
      setWorkspaceDirectory(path);
      addRecentWorkspace(path);
      onWorkspaceReady();
    },
    [setWorkspaceDirectory, addRecentWorkspace, onWorkspaceReady]
  );

  const handleSetupComplete = useCallback(() => {
    if (selectedFolder) {
      setWorkspaceDirectory(selectedFolder);
      addRecentWorkspace(selectedFolder);
      setShowSetupDialog(false);
      onWorkspaceReady();
    }
  }, [selectedFolder, setWorkspaceDirectory, addRecentWorkspace, onWorkspaceReady]);

  const handleSetupCancel = useCallback(() => {
    setShowSetupDialog(false);
    setSelectedFolder(null);
  }, []);

  const getWorkspaceName = (path: string) => {
    const parts = path.split('/');
    return parts[parts.length - 1] || path;
  };

  return (
    <div className="welcome-screen">
      <div className="welcome-content">
        <div className="welcome-logo">
          <svg
            width="80"
            height="80"
            viewBox="0 0 100 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle cx="50" cy="50" r="45" stroke="#0e639c" strokeWidth="4" fill="none" />
            <path
              d="M30 35 L50 65 L70 35"
              stroke="#0e639c"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </div>

        <h1 className="welcome-title">Welcome to Unison Editor</h1>
        <p className="welcome-subtitle">
          Select a workspace folder to get started. The folder will be used as the working
          directory for UCM.
        </p>

        <div className="welcome-actions">
          <button className="welcome-btn primary" onClick={handleOpenFolder}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1.5 2A1.5 1.5 0 000 3.5v9A1.5 1.5 0 001.5 14h13a1.5 1.5 0 001.5-1.5v-7A1.5 1.5 0 0014.5 4H8.414l-1-1A2 2 0 006 2.5H1.5z" />
            </svg>
            Open Folder...
          </button>
        </div>

        {recentWorkspaces.length > 0 && (
          <div className="recent-workspaces">
            <h3 className="recent-title">Recent Workspaces</h3>
            <div className="recent-list">
              {recentWorkspaces.map((path, index) => (
                <button
                  key={index}
                  className="recent-workspace-btn"
                  onClick={() => handleRecentWorkspace(path)}
                >
                  <svg
                    className="folder-icon"
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                  >
                    <path d="M1.5 2A1.5 1.5 0 000 3.5v9A1.5 1.5 0 001.5 14h13a1.5 1.5 0 001.5-1.5v-7A1.5 1.5 0 0014.5 4H8.414l-1-1A2 2 0 006 2.5H1.5z" />
                  </svg>
                  <div className="workspace-info">
                    <span className="workspace-name">{getWorkspaceName(path)}</span>
                    <span className="workspace-path">{path}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {showSetupDialog && selectedFolder && (
        <WorkspaceSetupDialog
          folderPath={selectedFolder}
          onComplete={handleSetupComplete}
          onCancel={handleSetupCancel}
        />
      )}
    </div>
  );
}
