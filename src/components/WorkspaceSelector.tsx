import { useState } from 'react';
import { useUnisonStore } from '../store/unisonStore';

export function WorkspaceSelector() {
  const { workspaceDirectory, setWorkspaceDirectory } = useUnisonStore();
  const [isSelecting, setIsSelecting] = useState(false);

  async function handleSelectDirectory() {
    setIsSelecting(true);
    try {
      // Use Tauri dialog API to select directory
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Workspace Directory',
      });

      if (selected && typeof selected === 'string') {
        setWorkspaceDirectory(selected);
      }
    } catch (err) {
      console.error('Failed to select directory:', err);
    } finally {
      setIsSelecting(false);
    }
  }

  function handleClearWorkspace() {
    setWorkspaceDirectory(null);
  }

  return (
    <div className="workspace-selector">
      {workspaceDirectory ? (
        <div className="workspace-info">
          <div className="workspace-path" title={workspaceDirectory}>
            📁 {workspaceDirectory.split('/').pop() || workspaceDirectory}
          </div>
          <button
            className="workspace-action-btn"
            onClick={handleSelectDirectory}
            disabled={isSelecting}
          >
            Change
          </button>
          <button
            className="workspace-action-btn"
            onClick={handleClearWorkspace}
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          className="workspace-select-btn"
          onClick={handleSelectDirectory}
          disabled={isSelecting}
        >
          {isSelecting ? 'Selecting...' : 'Select Workspace'}
        </button>
      )}
    </div>
  );
}
