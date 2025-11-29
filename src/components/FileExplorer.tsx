import { useState, useEffect, useRef } from 'react';
import { getFileSystemService, type FileNode } from '../services/fileSystem';
import { useUnisonStore } from '../store/unisonStore';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';
import { RenameModal } from './RenameModal';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { FolderCreationModal } from './FolderCreationModal';
import { FileCreationModal } from './FileCreationModal';
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
  const [folderModal, setFolderModal] = useState<{ parentPath: string } | null>(null);
  const [fileModal, setFileModal] = useState<{ parentPath: string } | null>(null);

  // Selection state for multi-select
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [lastSelectedPath, setLastSelectedPath] = useState<string | null>(null);

  // Drag-and-drop state - use ref for draggedPaths to avoid stale closure issues
  const draggedPathsRef = useRef<string[]>([]);
  const [dropTarget, setDropTarget] = useState<{
    path: string;
    isValid: boolean;
  } | null>(null);
  // Drop zone between items (for reordering / moving to root level between items)
  const [dropZone, setDropZone] = useState<{
    parentPath: string; // The parent directory where the item will be moved
    afterPath: string | null; // The path of the item this zone is after (null = at start)
  } | null>(null);

  // Ref for the container to enable auto-scroll
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollIntervalRef = useRef<number | null>(null);

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

      // Reload children for any expanded directories
      files = await reloadExpandedChildren(files);

      setFiles(files);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load directory');
      console.error('Failed to load directory:', err);
    } finally {
      setLoading(false);
    }
  }

  // Recursively reload children for expanded directories
  async function reloadExpandedChildren(nodes: FileNode[]): Promise<FileNode[]> {
    const result: FileNode[] = [];

    for (const node of nodes) {
      if (node.isDirectory && expandedDirs.has(node.path)) {
        // This directory is expanded, load its children
        try {
          let children = await fileSystemService.listDirectory(node.path, false);
          if (showOnlyUnison) {
            children = fileSystemService.filterUnisonFiles(children);
          }
          // Recursively load children of expanded subdirectories
          children = await reloadExpandedChildren(children);
          result.push({ ...node, children });
        } catch {
          // If we can't load children, just include the node without them
          result.push(node);
        }
      } else {
        result.push(node);
      }
    }

    return result;
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

  // Flatten visible tree for range selection
  function getVisiblePaths(nodes: FileNode[]): string[] {
    const result: string[] = [];
    for (const node of nodes) {
      result.push(node.path);
      if (node.isDirectory && expandedDirs.has(node.path) && node.children) {
        result.push(...getVisiblePaths(node.children));
      }
    }
    return result;
  }

  // Handle selection with keyboard modifiers
  function handleSelect(file: FileNode, e: React.MouseEvent) {
    if (e.shiftKey && lastSelectedPath) {
      // Range selection
      const visiblePaths = getVisiblePaths(files);
      const lastIndex = visiblePaths.indexOf(lastSelectedPath);
      const currentIndex = visiblePaths.indexOf(file.path);

      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);
        const rangePaths = visiblePaths.slice(start, end + 1);
        setSelectedPaths(new Set(rangePaths));
      }
    } else if (e.metaKey || e.ctrlKey) {
      // Toggle selection
      setSelectedPaths((prev) => {
        const next = new Set(prev);
        if (next.has(file.path)) {
          next.delete(file.path);
        } else {
          next.add(file.path);
        }
        return next;
      });
      setLastSelectedPath(file.path);
    } else {
      // Single selection
      setSelectedPaths(new Set([file.path]));
      setLastSelectedPath(file.path);
    }
  }

  function handleFileClick(file: FileNode, e: React.MouseEvent) {
    // Handle selection
    handleSelect(file, e);

    // For directories, toggle expansion (but don't open)
    // For files, also open them (only on regular click, not multi-select)
    if (file.isDirectory) {
      handleDirectoryToggle(file);
    } else if (!e.metaKey && !e.ctrlKey && !e.shiftKey) {
      // Only open file on regular click (not selection modifier clicks)
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
    const items: ContextMenuItem[] = [];

    if (file.isDirectory) {
      items.push({
        label: 'New Folder',
        icon: '📁',
        onClick: () => setFolderModal({ parentPath: file.path }),
      });
      items.push({
        label: 'New File',
        icon: '📄',
        onClick: () => setFileModal({ parentPath: file.path }),
      });
      items.push({ label: '', onClick: () => {}, divider: true });
    }

    items.push({
      label: 'Rename',
      icon: '✏️',
      onClick: () => setRenameModal(file),
    });
    items.push({
      label: 'Delete',
      icon: '🗑️',
      onClick: () => setDeleteModal(file),
    });

    return items;
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

  async function handleCreateFolder(parentPath: string, folderName: string) {
    try {
      const newPath = `${parentPath}/${folderName}`;
      await fileSystemService.createFile(newPath, true); // isDirectory = true

      // Expand the parent directory to show the new folder
      setExpandedDirs((prev) => {
        const next = new Set(prev);
        next.add(parentPath);
        return next;
      });

      // Reload directory
      await loadDirectory();
    } catch (err) {
      console.error('Failed to create folder:', err);
      setError(err instanceof Error ? err.message : 'Failed to create folder');
    }
  }

  async function handleCreateFile(parentPath: string, fileName: string, template: string) {
    try {
      const newPath = `${parentPath}/${fileName}`;
      // Create file and write template content
      await fileSystemService.createFile(newPath, false); // isDirectory = false
      if (template) {
        await fileSystemService.writeFile(newPath, template);
      }

      // Expand the parent directory to show the new file
      setExpandedDirs((prev) => {
        const next = new Set(prev);
        next.add(parentPath);
        return next;
      });

      // Reload directory
      await loadDirectory();

      // Open the new file
      onFileClick(newPath, fileName);
    } catch (err) {
      console.error('Failed to create file:', err);
      setError(err instanceof Error ? err.message : 'Failed to create file');
    }
  }

  // Drag-and-drop validation
  function isValidDropTarget(targetPath: string, targetIsDirectory: boolean, paths: string[]): boolean {
    // Can only drop into directories
    if (!targetIsDirectory) return false;

    // Need paths to validate against
    if (paths.length === 0) return false;

    for (const draggedPath of paths) {
      // Cannot drop on self
      if (targetPath === draggedPath) return false;
      // Cannot drop folder into its own descendants
      if (targetPath.startsWith(draggedPath + '/')) return false;
    }
    return true;
  }

  // Drag handlers
  function handleDragStart(e: React.DragEvent, file: FileNode) {
    // If dragging a selected item, drag all selected; otherwise just drag this one
    const pathsToDrag =
      selectedPaths.has(file.path) && selectedPaths.size > 1
        ? Array.from(selectedPaths)
        : [file.path];

    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', pathsToDrag.join('\n'));
    draggedPathsRef.current = pathsToDrag;
  }

  function handleDragEnd() {
    draggedPathsRef.current = [];
    setDropTarget(null);
    setDropZone(null);
    stopAutoScroll();
  }

  // Auto-scroll when dragging near edges
  function startAutoScroll(direction: 'up' | 'down') {
    if (scrollIntervalRef.current) return; // Already scrolling

    const scrollSpeed = 5;
    scrollIntervalRef.current = window.setInterval(() => {
      if (containerRef.current) {
        containerRef.current.scrollTop += direction === 'down' ? scrollSpeed : -scrollSpeed;
      }
    }, 16); // ~60fps
  }

  function stopAutoScroll() {
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }
  }

  function handleAutoScroll(e: React.DragEvent) {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const scrollThreshold = 40; // pixels from edge to trigger scroll

    if (e.clientY < rect.top + scrollThreshold) {
      startAutoScroll('up');
    } else if (e.clientY > rect.bottom - scrollThreshold) {
      startAutoScroll('down');
    } else {
      stopAutoScroll();
    }
  }

  function handleDragOver(e: React.DragEvent, file: FileNode, parentPath: string, siblingIndex: number, siblings: FileNode[]) {
    e.preventDefault();
    e.stopPropagation();

    // Handle auto-scroll
    handleAutoScroll(e);

    // Use ref for immediate access (avoids stale closure with state)
    const currentDraggedPaths = draggedPathsRef.current;
    if (currentDraggedPaths.length === 0) return;

    // Check if dragging one of the items being dragged
    if (currentDraggedPaths.includes(file.path)) {
      setDropTarget(null);
      setDropZone(null);
      return;
    }

    // Get the element's bounding rect to detect top/bottom zones
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const mouseY = e.clientY;
    const relativeY = mouseY - rect.top;
    const itemHeight = rect.height;

    // For directories: top 25% = above, middle 50% = into folder, bottom 25% = below
    // For files: top 50% = above, bottom 50% = below
    const isDirectory = file.isDirectory;
    const topZone = isDirectory ? itemHeight * 0.25 : itemHeight * 0.5;
    const bottomZone = isDirectory ? itemHeight * 0.75 : itemHeight * 0.5;

    if (relativeY < topZone) {
      // Drop zone above this item
      // For first item, use afterPath: null; otherwise use previous sibling's path
      const prevSibling = siblingIndex > 0 ? siblings[siblingIndex - 1] : null;
      const afterPath = prevSibling ? prevSibling.path : null;
      setDropZone({ parentPath, afterPath });
      setDropTarget(null);
      e.dataTransfer.dropEffect = 'move';
    } else if (relativeY > bottomZone || !isDirectory) {
      // Drop zone below this item
      setDropZone({ parentPath, afterPath: file.path });
      setDropTarget(null);
      e.dataTransfer.dropEffect = 'move';
    } else {
      // Middle of a directory - drop INTO the folder
      const isValid = isValidDropTarget(file.path, true, currentDraggedPaths);
      setDropTarget({ path: file.path, isValid });
      setDropZone(null);
      e.dataTransfer.dropEffect = isValid ? 'move' : 'none';
    }
  }

  function handleDragEnter(e: React.DragEvent, file: FileNode) {
    e.preventDefault();
    e.stopPropagation();

    const currentDraggedPaths = draggedPathsRef.current;
    if (currentDraggedPaths.length === 0) return;

    const isValid = isValidDropTarget(file.path, file.isDirectory, currentDraggedPaths);
    setDropTarget({
      path: file.path,
      isValid,
    });
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    // Only clear if we're actually leaving the target (not entering a child)
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
      setDropTarget(null);
    }
  }

  // Move files to a directory
  async function moveFilesToDirectory(pathsToMove: string[], destDir: string) {
    try {
      for (const sourcePath of pathsToMove) {
        const fileName = sourcePath.split('/').pop()!;
        const newPath = `${destDir}/${fileName}`;

        // Don't move if already in the same directory
        const sourceDir = sourcePath.substring(0, sourcePath.lastIndexOf('/'));
        if (sourceDir === destDir) {
          continue;
        }

        // Check if destination already exists
        const exists = await fileSystemService.fileExists(newPath);
        if (exists) {
          setError(`Cannot move: '${fileName}' already exists in destination`);
          continue;
        }

        await fileSystemService.renameFile(sourcePath, newPath);
      }

      // Reload directory and clear selection
      await loadDirectory();
      setSelectedPaths(new Set());
    } catch (err) {
      console.error('Failed to move files:', err);
      setError(err instanceof Error ? err.message : 'Failed to move files');
    }
  }

  async function handleDropOnItem(e: React.DragEvent, targetFile: FileNode, parentPath: string) {
    e.preventDefault();
    e.stopPropagation();

    const pathsToMove = draggedPathsRef.current;
    if (pathsToMove.length === 0) {
      handleDragEnd();
      return;
    }

    // If we have a dropZone active, move to the parent directory (between items)
    if (dropZone !== null) {
      await moveFilesToDirectory(pathsToMove, dropZone.parentPath);
      handleDragEnd();
      return;
    }

    // If dropping on a folder (dropTarget is set), move INTO the folder
    if (dropTarget && dropTarget.isValid && targetFile.isDirectory) {
      // Validate: can't drop on self or into own descendants
      for (const draggedPath of pathsToMove) {
        if (targetFile.path === draggedPath || targetFile.path.startsWith(draggedPath + '/')) {
          handleDragEnd();
          return;
        }
      }

      await moveFilesToDirectory(pathsToMove, targetFile.path);
      handleDragEnd();
      return;
    }

    // Fallback: move to parent directory
    await moveFilesToDirectory(pathsToMove, parentPath);
    handleDragEnd();
  }

  function renderFileNode(file: FileNode, depth: number = 0, parentPath: string, siblingIndex: number, siblings: FileNode[]): JSX.Element {
    const isExpanded = expandedDirs.has(file.path);
    const hasChildren = file.children && file.children.length > 0;
    const isSelected = selectedPaths.has(file.path);
    const isBeingDragged = draggedPathsRef.current.includes(file.path);
    const isDropTargetItem = dropTarget?.path === file.path;
    const isValidDrop = isDropTargetItem && dropTarget?.isValid;
    const isInvalidDrop = isDropTargetItem && !dropTarget?.isValid;

    // Only show drop zone above the FIRST item when afterPath is null (dropping at the very top)
    const showDropZoneAbove = dropZone !== null &&
      dropZone.parentPath === parentPath &&
      dropZone.afterPath === null &&
      siblingIndex === 0;

    // Show drop zone below this item when afterPath matches this file's path
    const showDropZoneBelow = dropZone !== null &&
      dropZone.parentPath === parentPath &&
      dropZone.afterPath === file.path;

    // Build class names
    const classNames = [
      'file-explorer-item',
      isSelected ? 'selected' : '',
      isBeingDragged ? 'dragging' : '',
      isValidDrop ? 'drop-target-valid' : '',
      isInvalidDrop ? 'drop-target-invalid' : '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div key={file.path}>
        {/* Drop zone indicator above */}
        {showDropZoneAbove && (
          <div
            className="drop-zone-indicator"
            style={{ marginLeft: `${depth * 16 + 8}px` }}
          />
        )}

        <div
          className={classNames}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          draggable={true}
          onClick={(e) => handleFileClick(file, e)}
          onContextMenu={(e) => handleContextMenu(e, file)}
          onDragStart={(e) => handleDragStart(e, file)}
          onDragEnd={handleDragEnd}
          onDragEnter={(e) => handleDragEnter(e, file)}
          onDragOver={(e) => handleDragOver(e, file, parentPath, siblingIndex, siblings)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDropOnItem(e, file, parentPath)}
        >
          {file.isDirectory && (
            <span className="file-arrow">
              {isExpanded ? '▼' : '▶'}
            </span>
          )}
          <span className="file-icon">{getFileIcon(file)}</span>
          <span className="file-name">{file.name}</span>
        </div>

        {/* Drop zone indicator below */}
        {showDropZoneBelow && (
          <div
            className="drop-zone-indicator"
            style={{ marginLeft: `${depth * 16 + 8}px` }}
          />
        )}

        {isExpanded && hasChildren && (
          <div className="file-explorer-children">
            {file.children!.map((child, idx) => renderFileNode(child, depth + 1, file.path, idx, file.children!))}
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

  // Container-level drag handlers - dropping on container moves to workspace root
  function handleContainerDragOver(e: React.DragEvent) {
    e.preventDefault();
    const currentDraggedPaths = draggedPathsRef.current;
    if (currentDraggedPaths.length > 0 && workspaceDirectory) {
      e.dataTransfer.dropEffect = 'move';
    }
  }

  async function handleContainerDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();

    const pathsToMove = draggedPathsRef.current;
    if (!workspaceDirectory || pathsToMove.length === 0) {
      handleDragEnd();
      return;
    }

    // If dropZone is active, use that; otherwise move to workspace root
    const targetDir = dropZone?.parentPath || workspaceDirectory;
    await moveFilesToDirectory(pathsToMove, targetDir);
    handleDragEnd();
  }

  return (
    <>
      <div
        ref={containerRef}
        className="file-explorer-items"
        onDragOver={handleContainerDragOver}
        onDrop={handleContainerDrop}
      >
        {files.map((file, idx) => renderFileNode(file, 0, workspaceDirectory, idx, files))}
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

      {folderModal && (
        <FolderCreationModal
          isOpen={true}
          onClose={() => setFolderModal(null)}
          onCreate={(folderName) => handleCreateFolder(folderModal.parentPath, folderName)}
          parentPath={folderModal.parentPath}
        />
      )}

      {fileModal && (
        <FileCreationModal
          isOpen={true}
          onClose={() => setFileModal(null)}
          onCreate={(fileName, template) => handleCreateFile(fileModal.parentPath, fileName, template)}
          defaultPath={fileModal.parentPath}
        />
      )}
    </>
  );
}
