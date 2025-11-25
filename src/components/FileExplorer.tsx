import { useState, useEffect } from 'react';
import { getFileSystemService, type FileNode } from '../services/fileSystem';
import { useUnisonStore } from '../store/unisonStore';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';
import { RenameModal } from './RenameModal';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import UnisonFileIcon from '../assets/unison-file-icon.svg';

interface FileExplorerProps {
  onFileClick: (path: string, name: string) => void;
  showOnlyUnison?: boolean;
  refreshTrigger?: number; // Used to trigger refresh when files are created/deleted
}

export function FileExplorer({ onFileClick, showOnlyUnison = false, refreshTrigger }: FileExplorerProps) {
  const [files, setFiles] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    file: FileNode;
  } | null>(null);

  // Modal states
  const [renameModal, setRenameModal] = useState<FileNode | null>(null);
  const [deleteModal, setDeleteModal] = useState<FileNode | null>(null);

  const { workspaceDirectory } = useUnisonStore();
  const fileSystemService = getFileSystemService();

  useEffect(() => {
    if (workspaceDirectory) {
      loadDirectory();
    }
  }, [workspaceDirectory, refreshTrigger]);

  async function loadDirectory() {
    if (!workspaceDirectory) return;

    setLoading(true);
    setError(null);

    try {
      let files = await fileSystemService.listDirectory(workspaceDirectory, false);

      if (showOnlyUnison) {
        files = fileSystemService.filterUnisonFiles(files);
      }

      setFiles(files);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load directory');
      console.error('Failed to load directory:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDirectoryToggle(file: FileNode) {
    if (!file.isDirectory) return;

    const isExpanded = expandedDirs.has(file.path);

    if (isExpanded) {
      // Collapse directory
      setExpandedDirs((prev) => {
        const next = new Set(prev);
        next.delete(file.path);
        return next;
      });
    } else {
      // Expand directory - load its children
      try {
        let children = await fileSystemService.listDirectory(file.path, false);

        if (showOnlyUnison) {
          children = fileSystemService.filterUnisonFiles(children);
        }

        // Update the file node with children
        setFiles((prevFiles) => updateFileNodeChildren(prevFiles, file.path, children));

        setExpandedDirs((prev) => {
          const next = new Set(prev);
          next.add(file.path);
          return next;
        });
      } catch (err) {
        console.error('Failed to load directory:', err);
      }
    }
  }

  function updateFileNodeChildren(
    nodes: FileNode[],
    targetPath: string,
    children: FileNode[]
  ): FileNode[] {
    return nodes.map((node) => {
      if (node.path === targetPath) {
        return { ...node, children };
      } else if (node.children) {
        return {
          ...node,
          children: updateFileNodeChildren(node.children, targetPath, children),
        };
      }
      return node;
    });
  }

  function handleFileClick(file: FileNode) {
    if (file.isDirectory) {
      handleDirectoryToggle(file);
    } else {
      onFileClick(file.path, file.name);
    }
  }

  function getFileIcon(file: FileNode) {
    if (file.isDirectory) {
      return expandedDirs.has(file.path) ? '📂' : '📁';
    }
    if (fileSystemService.isUnisonFile(file.name)) {
      return <img src={UnisonFileIcon} alt="Unison file" className="unison-file-icon" />;
    }
    return '📄';
  }

  function handleContextMenu(e: React.MouseEvent, file: FileNode) {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, file });
  }

  function getContextMenuItems(file: FileNode): ContextMenuItem[] {
    return [
      {
        label: 'Rename',
        icon: '✏️',
        onClick: () => setRenameModal(file),
      },
      {
        label: 'Delete',
        icon: '🗑️',
        onClick: () => setDeleteModal(file),
      },
    ];
  }

  async function handleRename(file: FileNode, newName: string) {
    try {
      const directory = file.path.substring(0, file.path.lastIndexOf('/'));
      const newPath = `${directory}/${newName}`;

      await fileSystemService.renameFile(file.path, newPath);

      // Reload directory
      await loadDirectory();
    } catch (err) {
      console.error('Failed to rename:', err);
      setError(err instanceof Error ? err.message : 'Failed to rename');
    }
  }

  async function handleDelete(file: FileNode) {
    try {
      await fileSystemService.deleteFile(file.path);

      // Reload directory
      await loadDirectory();
    } catch (err) {
      console.error('Failed to delete:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  }

  function renderFileNode(file: FileNode, depth: number = 0): JSX.Element {
    const isExpanded = expandedDirs.has(file.path);
    const hasChildren = file.children && file.children.length > 0;

    return (
      <div key={file.path}>
        <div
          className="file-explorer-item"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => handleFileClick(file)}
          onContextMenu={(e) => handleContextMenu(e, file)}
        >
          {file.isDirectory && (
            <span className="file-arrow">
              {isExpanded ? '▼' : '▶'}
            </span>
          )}
          <span className="file-icon">{getFileIcon(file)}</span>
          <span className="file-name">{file.name}</span>
        </div>

        {isExpanded && hasChildren && (
          <div className="file-explorer-children">
            {file.children!.map((child) => renderFileNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  }

  if (!workspaceDirectory) {
    return (
      <div className="file-explorer-empty">
        <p>No workspace selected</p>
        <p className="hint">Choose a workspace directory to get started</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="file-explorer-loading">
        <p>Loading files...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="file-explorer-error">
        <p>Error: {error}</p>
        <button onClick={loadDirectory}>Retry</button>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="file-explorer-empty">
        <p>No {showOnlyUnison ? '.u ' : ''}files found</p>
        <p className="hint">Create a new file to get started</p>
      </div>
    );
  }

  return (
    <>
      <div className="file-explorer-items">
        {files.map((file) => renderFileNode(file, 0))}
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={getContextMenuItems(contextMenu.file)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {renameModal && (
        <RenameModal
          isOpen={true}
          onClose={() => setRenameModal(null)}
          onRename={(newName) => handleRename(renameModal, newName)}
          currentName={renameModal.name}
          itemType={renameModal.isDirectory ? 'directory' : 'file'}
        />
      )}

      {deleteModal && (
        <DeleteConfirmModal
          isOpen={true}
          onClose={() => setDeleteModal(null)}
          onConfirm={() => handleDelete(deleteModal)}
          itemName={deleteModal.name}
          itemType={deleteModal.isDirectory ? 'directory' : 'file'}
        />
      )}
    </>
  );
}
