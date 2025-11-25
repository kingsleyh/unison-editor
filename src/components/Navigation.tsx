import { useState } from 'react';
import { FileExplorer } from './FileExplorer';
import { NamespaceBrowser } from './NamespaceBrowser';
import { WorkspaceSelector } from './WorkspaceSelector';
import { FileCreationModal } from './FileCreationModal';
import { useUnisonStore } from '../store/unisonStore';
import { getFileSystemService } from '../services/fileSystem';

interface NavigationProps {
  onFileClick: (path: string, name: string) => void;
  onDefinitionClick: (name: string, type: 'term' | 'type') => void;
}

export function Navigation({ onFileClick, onDefinitionClick }: NavigationProps) {
  const [localFilesExpanded, setLocalFilesExpanded] = useState(true);
  const [codebaseExpanded, setCodebaseExpanded] = useState(true);
  const [showOnlyUnison, setShowOnlyUnison] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const { workspaceDirectory } = useUnisonStore();
  const fileSystemService = getFileSystemService();

  async function handleCreateFile(filename: string, template: string) {
    if (!workspaceDirectory) {
      setCreateError('No workspace selected');
      return;
    }

    try {
      const filePath = `${workspaceDirectory}/${filename}`;

      // Check if file already exists
      const exists = await fileSystemService.fileExists(filePath);
      if (exists) {
        setCreateError(`File '${filename}' already exists`);
        return;
      }

      // Create the file with template content
      await fileSystemService.writeFile(filePath, template);

      // Trigger file explorer refresh
      setRefreshTrigger(prev => prev + 1);

      // Open the newly created file
      onFileClick(filePath, filename);

      setCreateError(null);
    } catch (err) {
      console.error('Failed to create file:', err);
      setCreateError(err instanceof Error ? err.message : 'Failed to create file');
    }
  }

  return (
    <div className="navigation">
      {/* Local Files Section */}
      <div className="nav-section">
        <div
          className="nav-section-header"
          onClick={() => setLocalFilesExpanded(!localFilesExpanded)}
        >
          <span className="nav-section-arrow">
            {localFilesExpanded ? '▼' : '▶'}
          </span>
          <span className="nav-section-title">Local Files</span>
        </div>
        {localFilesExpanded && (
          <div className="nav-section-content">
            <WorkspaceSelector />

            <div className="file-actions">
              <button
                className="btn-new-file"
                onClick={() => setIsCreateModalOpen(true)}
                disabled={!workspaceDirectory}
                title={workspaceDirectory ? 'Create new .u file' : 'Select a workspace first'}
              >
                + New File
              </button>
            </div>

            {createError && (
              <div className="file-error">
                {createError}
                <button onClick={() => setCreateError(null)}>✕</button>
              </div>
            )}

            <div className="file-filter">
              <label>
                <input
                  type="checkbox"
                  checked={showOnlyUnison}
                  onChange={(e) => setShowOnlyUnison(e.target.checked)}
                />
                Show only .u files
              </label>
            </div>
            <FileExplorer
              onFileClick={onFileClick}
              showOnlyUnison={showOnlyUnison}
              refreshTrigger={refreshTrigger}
            />
          </div>
        )}
      </div>

      <FileCreationModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={handleCreateFile}
        defaultPath={workspaceDirectory || undefined}
      />

      {/* UCM Codebase Section */}
      <div className="nav-section">
        <div
          className="nav-section-header"
          onClick={() => setCodebaseExpanded(!codebaseExpanded)}
        >
          <span className="nav-section-arrow">
            {codebaseExpanded ? '▼' : '▶'}
          </span>
          <span className="nav-section-title">UCM Codebase</span>
        </div>
        {codebaseExpanded && (
          <div className="nav-section-content">
            <NamespaceBrowser onOpenDefinition={onDefinitionClick} />
          </div>
        )}
      </div>
    </div>
  );
}
