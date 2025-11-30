import { useState, useCallback } from 'react';
import { FileExplorer } from './FileExplorer';
import { NamespaceBrowser, type TreeNode } from './NamespaceBrowser';
import { WorkspaceProjectLinker } from './WorkspaceProjectLinker';
import { FileCreationModal } from './FileCreationModal';
import { FolderCreationModal } from './FolderCreationModal';
import { NamespaceRenameModal } from './NamespaceRenameModal';
import { NamespaceDeleteModal } from './NamespaceDeleteModal';
import { CollapsiblePanelStack, type PanelConfig } from './CollapsiblePanelStack';
import { useUnisonStore } from '../store/unisonStore';
import { getFileSystemService } from '../services/fileSystem';
import { getUCMApiClient } from '../services/ucmApi';

interface NavigationProps {
  onFileClick: (path: string, name: string) => void;
  onDefinitionClick: (name: string, type: 'term' | 'type') => void;
  /** FQN path to reveal and highlight in the namespace browser */
  revealInTree?: string | null;
  /** Callback to add content to scratch file */
  onAddToScratch?: (content: string) => void;
  /** Controlled workspace expanded state */
  workspaceExpanded?: boolean;
  /** Controlled file explorer expanded state */
  fileExplorerExpanded?: boolean;
  /** Controlled UCM explorer expanded state */
  ucmExplorerExpanded?: boolean;
  /** Controlled split percent (file explorer %) */
  sidebarSplitPercent?: number;
  /** Callback when workspace expanded changes */
  onWorkspaceExpandedChange?: (expanded: boolean) => void;
  /** Callback when file explorer expanded changes */
  onFileExplorerExpandedChange?: (expanded: boolean) => void;
  /** Callback when UCM explorer expanded changes */
  onUcmExplorerExpandedChange?: (expanded: boolean) => void;
  /** Callback when split percent changes */
  onSidebarSplitPercentChange?: (percent: number) => void;
}

/**
 * Collected items from a namespace, tracking types separately for accessor filtering
 */
interface CollectedItems {
  terms: string[];           // FQNs of terms (will be filtered)
  types: string[];           // FQNs of types
  accessorPrefixes: Set<string>;  // Type FQNs that may have auto-generated accessors
}

/**
 * Check if a term is an auto-generated record accessor.
 *
 * Unison generates accessors for record fields:
 * - TypeName.fieldName (getter)
 * - TypeName.fieldName.set (setter)
 * - TypeName.fieldName.modify (modifier)
 */
function isRecordAccessor(termFQN: string, accessorPrefixes: Set<string>): boolean {
  for (const typePrefix of accessorPrefixes) {
    // Check if term starts with TypeName.
    if (termFQN.startsWith(typePrefix + '.')) {
      const remainder = termFQN.slice(typePrefix.length + 1);
      // remainder is "fieldName" or "fieldName.set" or "fieldName.modify"

      // If it's a simple identifier (no dots), it's a getter
      if (!remainder.includes('.')) {
        return true;
      }
      // If it ends with .set or .modify, it's a setter/modifier
      if (remainder.endsWith('.set') || remainder.endsWith('.modify')) {
        return true;
      }
    }
  }
  return false;
}

export function Navigation({
  onFileClick,
  onDefinitionClick,
  revealInTree,
  onAddToScratch,
  workspaceExpanded,
  fileExplorerExpanded,
  ucmExplorerExpanded,
  sidebarSplitPercent,
  onWorkspaceExpandedChange,
  onFileExplorerExpandedChange,
  onUcmExplorerExpandedChange,
  onSidebarSplitPercentChange,
}: NavigationProps) {
  const [showOnlyUnison, setShowOnlyUnison] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // UCM Explorer modal state
  const [renameNode, setRenameNode] = useState<TreeNode | null>(null);
  const [deleteNodes, setDeleteNodes] = useState<TreeNode[]>([]);

  const { workspaceDirectory, currentProject, currentBranch, refreshNamespace } = useUnisonStore();
  const fileSystemService = getFileSystemService();
  const ucmApi = getUCMApiClient();

  /**
   * Recursively collect all term/type FQNs from a namespace,
   * tracking types separately for accessor filtering
   */
  const collectNamespaceItems = useCallback(async (
    namespacePath: string
  ): Promise<CollectedItems> => {
    if (!currentProject || !currentBranch) {
      return { terms: [], types: [], accessorPrefixes: new Set() };
    }

    const items = await ucmApi.listNamespace(
      currentProject.name,
      currentBranch.name,
      namespacePath
    );

    const result: CollectedItems = {
      terms: [],
      types: [],
      accessorPrefixes: new Set()
    };

    for (const item of items) {
      const fullPath = namespacePath === '.'
        ? item.name
        : `${namespacePath}.${item.name}`;

      if (item.type === 'type') {
        result.types.push(fullPath);
        // Mark this type's name as an accessor prefix
        result.accessorPrefixes.add(fullPath);
      } else if (item.type === 'term') {
        result.terms.push(fullPath);
      } else if (item.type === 'namespace') {
        // Recursively collect from sub-namespaces
        const subItems = await collectNamespaceItems(fullPath);
        result.terms.push(...subItems.terms);
        result.types.push(...subItems.types);
        subItems.accessorPrefixes.forEach(p => result.accessorPrefixes.add(p));
      }
    }

    return result;
  }, [currentProject, currentBranch, ucmApi]);

  /**
   * Handle "Add to Scratch" for selected namespace items.
   * Filters out auto-generated record accessors to avoid conflicts.
   */
  const handleAddToScratch = useCallback(async (nodes: TreeNode[]) => {
    if (!onAddToScratch || !currentProject || !currentBranch) return;

    try {
      // Collect items, tracking types separately for accessor filtering
      const allItems: CollectedItems = {
        terms: [],
        types: [],
        accessorPrefixes: new Set()
      };
      const sourceLabels: string[] = [];

      for (const node of nodes) {
        if (node.type === 'term') {
          allItems.terms.push(node.fullPath);
          sourceLabels.push(`-- from ${node.fullPath}`);
        } else if (node.type === 'type') {
          allItems.types.push(node.fullPath);
          allItems.accessorPrefixes.add(node.fullPath);
          sourceLabels.push(`-- from ${node.fullPath}`);
        } else if (node.type === 'namespace') {
          // Recursively collect all terms/types from the namespace
          const namespaceItems = await collectNamespaceItems(node.fullPath);
          allItems.terms.push(...namespaceItems.terms);
          allItems.types.push(...namespaceItems.types);
          namespaceItems.accessorPrefixes.forEach(p => allItems.accessorPrefixes.add(p));
          sourceLabels.push(`-- from namespace ${node.fullPath}`);
        }
      }

      // Filter out auto-generated record accessors
      const filteredTerms = allItems.terms.filter(
        term => !isRecordAccessor(term, allItems.accessorPrefixes)
      );

      const accessorsFiltered = allItems.terms.length - filteredTerms.length;

      // Combine types and filtered terms
      const allFqns = [...allItems.types, ...filteredTerms];

      if (allFqns.length === 0) {
        console.warn('No terms or types found for scratch');
        return;
      }

      // Add summary of what was collected
      const summaryComment = accessorsFiltered > 0
        ? `\n-- (${allItems.types.length} types, ${filteredTerms.length} terms, ${accessorsFiltered} auto-generated accessors filtered)`
        : '';

      // Get definition sources using view-definitions
      const sources = await ucmApi.viewDefinitions(
        currentProject.name,
        currentBranch.name,
        allFqns
      );

      // Format with comment header
      const formattedContent = sourceLabels.join('\n') + summaryComment + '\n\n' + sources;

      onAddToScratch(formattedContent);
    } catch (err) {
      console.error('Failed to get definitions for scratch:', err);
    }
  }, [onAddToScratch, currentProject, currentBranch, ucmApi, collectNamespaceItems]);

  /**
   * Handle rename request from context menu
   */
  const handleRename = useCallback((node: TreeNode) => {
    setRenameNode(node);
  }, []);

  /**
   * Handle delete request from context menu
   */
  const handleDelete = useCallback((nodes: TreeNode[]) => {
    setDeleteNodes(nodes);
  }, []);

  /**
   * Handle completion of rename/delete operations
   */
  const handleOperationComplete = useCallback(() => {
    // Trigger namespace browser refresh
    refreshNamespace();
  }, [refreshNamespace]);

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

  async function handleCreateFolder(folderName: string) {
    if (!workspaceDirectory) {
      setCreateError('No workspace selected');
      return;
    }

    try {
      const folderPath = `${workspaceDirectory}/${folderName}`;

      // Check if folder already exists
      const exists = await fileSystemService.fileExists(folderPath);
      if (exists) {
        setCreateError(`Folder '${folderName}' already exists`);
        return;
      }

      // Create the folder (isDirectory = true)
      await fileSystemService.createFile(folderPath, true);

      // Trigger file explorer refresh
      setRefreshTrigger((prev) => prev + 1);

      setCreateError(null);
    } catch (err) {
      console.error('Failed to create folder:', err);
      setCreateError(err instanceof Error ? err.message : 'Failed to create folder');
    }
  }

  // Workspace panel content
  const workspaceContent = <WorkspaceProjectLinker />;

  // Handler to manually refresh file explorer
  const handleRefreshFiles = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

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
        <button
          className="btn-new-folder"
          onClick={() => setIsFolderModalOpen(true)}
          disabled={!workspaceDirectory}
          title={workspaceDirectory ? 'Create new folder' : 'Select a workspace first'}
        >
          + New Folder
        </button>
        <button
          className="btn-refresh"
          onClick={handleRefreshFiles}
          disabled={!workspaceDirectory}
          title="Refresh file list"
        >
          ↻
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
    <NamespaceBrowser
      onOpenDefinition={onDefinitionClick}
      revealPath={revealInTree}
      onAddToScratch={onAddToScratch ? handleAddToScratch : undefined}
      onRename={handleRename}
      onDelete={handleDelete}
    />
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
      <CollapsiblePanelStack
        panels={panels}
        workspaceExpanded={workspaceExpanded}
        fileExplorerExpanded={fileExplorerExpanded}
        ucmExplorerExpanded={ucmExplorerExpanded}
        splitPercent={sidebarSplitPercent}
        onWorkspaceExpandedChange={onWorkspaceExpandedChange}
        onFileExplorerExpandedChange={onFileExplorerExpandedChange}
        onUcmExplorerExpandedChange={onUcmExplorerExpandedChange}
        onSplitPercentChange={onSidebarSplitPercentChange}
      />

      <FileCreationModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={handleCreateFile}
        defaultPath={workspaceDirectory || undefined}
      />

      <FolderCreationModal
        isOpen={isFolderModalOpen}
        onClose={() => setIsFolderModalOpen(false)}
        onCreate={handleCreateFolder}
        parentPath={workspaceDirectory || undefined}
      />

      {/* UCM Explorer modals */}
      {renameNode && (
        <NamespaceRenameModal
          isOpen={true}
          onClose={() => setRenameNode(null)}
          currentFQN={renameNode.fullPath}
          itemType={renameNode.type}
          onComplete={handleOperationComplete}
        />
      )}

      <NamespaceDeleteModal
        isOpen={deleteNodes.length > 0}
        onClose={() => setDeleteNodes([])}
        items={deleteNodes}
        onComplete={handleOperationComplete}
      />
    </div>
  );
}
