import { useState, useEffect } from 'react';
import { FileExplorer } from './FileExplorer';
import { NamespaceBrowser } from './NamespaceBrowser';
import { WorkspaceProjectLinker } from './WorkspaceProjectLinker';
import { FileCreationModal } from './FileCreationModal';
import { CollapsiblePanelStack, type PanelConfig } from './CollapsiblePanelStack';
import { useUnisonStore } from '../store/unisonStore';
import { getFileSystemService } from '../services/fileSystem';

interface NavigationProps {
  onFileClick: (path: string, name: string) => void;
  onDefinitionClick: (name: string, type: 'term' | 'type') => void;
  /** FQN path to reveal and highlight in the namespace browser */
  revealInTree?: string | null;
}

export function Navigation({ onFileClick, onDefinitionClick, revealInTree }: NavigationProps) {
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
      setRefreshTrigger((prev) => prev + 1);

      // Open the newly created file
      onFileClick(filePath, filename);

      setCreateError(null);
    } catch (err) {
      console.error('Failed to create file:', err);
      setCreateError(err instanceof Error ? err.message : 'Failed to create file');
    }
  }

  // Workspace panel content
  const workspaceContent = <WorkspaceProjectLinker />;

  // File Explorer panel content
  const fileExplorerContent = (
    <div className="file-explorer-panel-content">
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
  );

  // UCM Explorer panel content
  const ucmExplorerContent = (
    <NamespaceBrowser onOpenDefinition={onDefinitionClick} revealPath={revealInTree} />
  );

  const panels: PanelConfig[] = [
    {
      id: 'workspace',
      title: 'WORKSPACE',
      content: workspaceContent,
      defaultExpanded: true,
      fixedHeight: true,
    },
    {
      id: 'file-explorer',
      title: 'FILE EXPLORER',
      content: fileExplorerContent,
      defaultExpanded: true,
      minHeight: 100,
    },
    {
      id: 'ucm-explorer',
      title: 'UCM EXPLORER',
      content: ucmExplorerContent,
      defaultExpanded: true,
      minHeight: 100,
    },
  ];

  return (
    <div className="navigation">
      <CollapsiblePanelStack panels={panels} />

      <FileCreationModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={handleCreateFile}
        defaultPath={workspaceDirectory || undefined}
      />
    </div>
  );
}
