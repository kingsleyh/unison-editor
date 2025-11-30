import { useState, useCallback, useEffect, useRef } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useUnisonStore } from '../store/unisonStore';
import { WorkspaceSetupDialog } from './WorkspaceSetupDialog';
import { UCMConflictModal } from './UCMConflictModal';
import { getUCMLifecycleService } from '../services/ucmLifecycle';
import { getUCMApiClient } from '../services/ucmApi';
import appIcon from '../assets/app-icon.png';

interface WelcomeScreenProps {
  onWorkspaceReady: () => void;
}

export function WelcomeScreen({ onWorkspaceReady }: WelcomeScreenProps) {
  const recentWorkspaces = useUnisonStore((state) => state.recentWorkspaces);
  const setWorkspaceDirectory = useUnisonStore((state) => state.setWorkspaceDirectory);
  const addRecentWorkspace = useUnisonStore((state) => state.addRecentWorkspace);

  const [showSetupDialog, setShowSetupDialog] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [isStartingUCM, setIsStartingUCM] = useState(false);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const pendingFolderRef = useRef<string | null>(null);
  const pendingActionRef = useRef<'open' | 'recent' | null>(null);
  // Track file lock errors asynchronously - set by event listener, checked by spawnUCMForFolder
  const fileLockErrorRef = useRef(false);

  // Listen for UCM file lock error
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;

    listen('ucm-file-lock-error', () => {
      console.log('[WelcomeScreen] UCM file lock error received');
      fileLockErrorRef.current = true; // Set flag so spawnUCMForFolder knows to abort
      setIsStartingUCM(false);
      setShowConflictModal(true);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  const spawnUCMForFolder = useCallback(async (folder: string, action: 'open' | 'recent') => {
    setSelectedFolder(folder);
    setStartupError(null);
    setIsStartingUCM(true);
    pendingFolderRef.current = folder;
    pendingActionRef.current = action;
    fileLockErrorRef.current = false; // Reset flag before spawn attempt

    try {
      // Spawn UCM early so projects are available in the setup dialog
      const ucmLifecycle = getUCMLifecycleService();
      await ucmLifecycle.spawn(folder);

      // Check if file lock error occurred during spawn
      // Give a small delay for the async error event to be processed
      await new Promise((r) => setTimeout(r, 100));

      if (fileLockErrorRef.current) {
        // File lock error occurred - don't continue
        console.log('[WelcomeScreen] File lock error detected after spawn, aborting');
        return false;
      }

      // Wait for UCM API to be ready (max 10 seconds)
      const ucmApi = getUCMApiClient();
      let ready = false;
      for (let i = 0; i < 20 && !ready; i++) {
        // Check for file lock error each iteration
        if (fileLockErrorRef.current) {
          console.log('[WelcomeScreen] File lock error detected during connection wait, aborting');
          return false;
        }
        await new Promise((r) => setTimeout(r, 500));
        try {
          ready = await ucmApi.checkConnection();
        } catch {
          // Connection not ready yet
        }
      }

      // Final check for file lock error
      if (fileLockErrorRef.current) {
        console.log('[WelcomeScreen] File lock error detected after connection wait, aborting');
        return false;
      }

      if (!ready) {
        console.warn('[WelcomeScreen] UCM API not ready after 10s, continuing anyway');
      }

      setIsStartingUCM(false);
      pendingFolderRef.current = null;
      pendingActionRef.current = null;

      return true;
    } catch (err) {
      console.error('[WelcomeScreen] Failed to start UCM:', err);
      setIsStartingUCM(false);
      setStartupError(err instanceof Error ? err.message : String(err));
      return false;
    }
  }, []);

  const handleOpenFolder = useCallback(async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select Workspace Folder',
    });

    if (selected && typeof selected === 'string') {
      const success = await spawnUCMForFolder(selected, 'open');
      if (success) {
        setShowSetupDialog(true);
      }
    }
  }, [spawnUCMForFolder]);

  const handleRecentWorkspace = useCallback(
    async (path: string) => {
      const success = await spawnUCMForFolder(path, 'recent');
      if (success) {
        setWorkspaceDirectory(path);
        addRecentWorkspace(path);
        onWorkspaceReady();
      }
    },
    [spawnUCMForFolder, setWorkspaceDirectory, addRecentWorkspace, onWorkspaceReady]
  );

  const handleConflictRetry = useCallback(async () => {
    setShowConflictModal(false);
    const folder = pendingFolderRef.current;
    const action = pendingActionRef.current;

    if (!folder || !action) {
      return;
    }

    // Reset error state so spawn() will proceed
    const ucmLifecycle = getUCMLifecycleService();
    ucmLifecycle.resetError();

    const success = await spawnUCMForFolder(folder, action);
    if (success) {
      if (action === 'open') {
        setShowSetupDialog(true);
      } else {
        setWorkspaceDirectory(folder);
        addRecentWorkspace(folder);
        onWorkspaceReady();
      }
    }
  }, [spawnUCMForFolder, setWorkspaceDirectory, addRecentWorkspace, onWorkspaceReady]);

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
          <img src={appIcon} alt="Unison Editor" width="96" height="96" />
        </div>

        <h1 className="welcome-title">Welcome to Unison Editor</h1>
        <p className="welcome-subtitle">
          Select a workspace folder to get started. The folder will be used as the working
          directory for UCM.
        </p>

        <div className="welcome-actions">
          <button className="welcome-btn primary" onClick={handleOpenFolder} disabled={isStartingUCM}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1.5 2A1.5 1.5 0 000 3.5v9A1.5 1.5 0 001.5 14h13a1.5 1.5 0 001.5-1.5v-7A1.5 1.5 0 0014.5 4H8.414l-1-1A2 2 0 006 2.5H1.5z" />
            </svg>
            Open Folder...
          </button>
        </div>

        {isStartingUCM && (
          <div className="ucm-startup-status">
            <div className="ucm-startup-spinner"></div>
            <p>Starting UCM...</p>
          </div>
        )}

        {startupError && (
          <div className="ucm-startup-error">
            <p>Failed to start UCM: {startupError}</p>
            <button className="welcome-btn" onClick={() => setStartupError(null)}>
              Dismiss
            </button>
          </div>
        )}

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

      <UCMConflictModal
        isOpen={showConflictModal}
        onRetry={handleConflictRetry}
      />
    </div>
  );
}
