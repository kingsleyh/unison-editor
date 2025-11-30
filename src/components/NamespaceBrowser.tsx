import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useUnisonStore } from '../store/unisonStore';
import { getUCMApiClient } from '../services/ucmApi';
import type { NamespaceItem } from '../services/ucmApi';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';
import { moveItem } from '../services/ucmCommands';

interface NamespaceBrowserProps {
  onOpenDefinition: (name: string, type: 'term' | 'type') => void;
  /** FQN path to reveal and highlight in the tree */
  revealPath?: string | null;
  /** Callback when selection changes (for parent components) */
  onSelectionChange?: (selectedNodes: TreeNode[]) => void;
  /** Callback to add selected items to scratch file */
  onAddToScratch?: (nodes: TreeNode[]) => void;
  /** Callback to rename/move an item */
  onRename?: (node: TreeNode) => void;
  /** Callback to delete selected items */
  onDelete?: (nodes: TreeNode[]) => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  targetNode: TreeNode;
}

interface TreeNode {
  name: string;
  fullPath: string;
  type: 'term' | 'type' | 'namespace';
  hash?: string;
  children?: TreeNode[];
  isExpanded?: boolean;
  isLoaded?: boolean;
}

/**
 * Generate a unique key for a tree node (path + type to handle term/type with same name)
 */
function getNodeKey(node: TreeNode): string {
  return `${node.type}:${node.fullPath}`;
}

/**
 * Deep clone a tree node and its children
 */
function cloneTreeNode(node: TreeNode): TreeNode {
  return {
    ...node,
    children: node.children ? node.children.map(cloneTreeNode) : undefined,
  };
}

/**
 * Deep clone an array of tree nodes
 */
function cloneTreeNodes(nodes: TreeNode[]): TreeNode[] {
  return nodes.map(cloneTreeNode);
}

// Export TreeNode type for use in other components
export type { TreeNode };

export function NamespaceBrowser({
  onOpenDefinition,
  revealPath,
  onSelectionChange,
  onAddToScratch,
  onRename,
  onDelete,
}: NamespaceBrowserProps) {
  const { currentProject, currentBranch, namespaceVersion } = useUnisonStore();
  const [rootNodes, setRootNodes] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<NamespaceItem[]>([]);
  const [highlightedPath, setHighlightedPath] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const highlightedRef = useRef<HTMLDivElement>(null);

  // Multi-select state
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set()); // Set of fullPath keys
  const [lastSelectedPath, setLastSelectedPath] = useState<string | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Drag-and-drop state
  const draggedNodesRef = useRef<TreeNode[]>([]);
  const [dropTarget, setDropTarget] = useState<{
    path: string;
    position: 'inside' | 'before' | 'after';
    isValid: boolean;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const { refreshNamespace } = useUnisonStore();
  const client = getUCMApiClient();

  /**
   * Get all visible nodes in the tree (for shift-click range selection)
   */
  const getVisibleNodes = useCallback((): TreeNode[] => {
    const visible: TreeNode[] = [];

    function collectVisible(nodes: TreeNode[]) {
      for (const node of nodes) {
        visible.push(node);
        if (node.type === 'namespace' && node.isExpanded && node.children) {
          collectVisible(node.children);
        }
      }
    }

    collectVisible(rootNodes);
    return visible;
  }, [rootNodes]);

  /**
   * Get TreeNode objects for current selection
   */
  const getSelectedTreeNodes = useCallback((): TreeNode[] => {
    const result: TreeNode[] = [];

    function findSelected(nodes: TreeNode[]) {
      for (const node of nodes) {
        if (selectedNodes.has(node.fullPath)) {
          result.push(node);
        }
        if (node.children) {
          findSelected(node.children);
        }
      }
    }

    findSelected(rootNodes);
    return result;
  }, [rootNodes, selectedNodes]);

  // Notify parent when selection changes
  useEffect(() => {
    if (onSelectionChange) {
      onSelectionChange(getSelectedTreeNodes());
    }
  }, [selectedNodes, onSelectionChange, getSelectedTreeNodes]);

  /**
   * Handle node click with multi-select support
   */
  const handleNodeClick = useCallback((
    e: React.MouseEvent,
    node: TreeNode,
    nodePath: number[]
  ) => {
    const isMetaKey = e.metaKey || e.ctrlKey;
    const isShiftKey = e.shiftKey;

    if (isMetaKey) {
      // Cmd/Ctrl+Click: Toggle selection without opening/expanding
      e.preventDefault();
      setSelectedNodes(prev => {
        const newSet = new Set(prev);
        if (newSet.has(node.fullPath)) {
          newSet.delete(node.fullPath);
        } else {
          newSet.add(node.fullPath);
        }
        return newSet;
      });
      setLastSelectedPath(node.fullPath);
    } else if (isShiftKey && lastSelectedPath) {
      // Shift+Click: Range selection
      e.preventDefault();
      const visibleNodes = getVisibleNodes();
      const lastIndex = visibleNodes.findIndex(n => n.fullPath === lastSelectedPath);
      const currentIndex = visibleNodes.findIndex(n => n.fullPath === node.fullPath);

      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);
        const newSelection = new Set<string>();
        for (let i = start; i <= end; i++) {
          newSelection.add(visibleNodes[i].fullPath);
        }
        setSelectedNodes(newSelection);
      }
    } else {
      // Regular click: Select single item, open term or toggle namespace
      setSelectedNodes(new Set([node.fullPath]));
      setLastSelectedPath(node.fullPath);
      setSelectedPath(node.fullPath);

      if (node.type === 'namespace') {
        toggleNode(nodePath);
      } else {
        handleItemClick(node);
      }
    }
  }, [lastSelectedPath, getVisibleNodes]);

  /**
   * Handle right-click context menu
   */
  const handleContextMenu = useCallback((
    e: React.MouseEvent,
    node: TreeNode
  ) => {
    e.preventDefault();
    e.stopPropagation();

    // If the right-clicked node is not in the current selection, select only it
    if (!selectedNodes.has(node.fullPath)) {
      setSelectedNodes(new Set([node.fullPath]));
      setLastSelectedPath(node.fullPath);
    }

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      targetNode: node,
    });
  }, [selectedNodes]);

  /**
   * Build context menu items based on current selection
   */
  const getContextMenuItems = useCallback((): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];
    const selection = getSelectedTreeNodes();
    const hasTermsOrTypes = selection.some(n => n.type === 'term' || n.type === 'type');
    const isSingleSelection = selection.length === 1;

    // Open - only for terms/types
    if (hasTermsOrTypes) {
      const termsAndTypes = selection.filter(n => n.type === 'term' || n.type === 'type');
      items.push({
        label: `Open${termsAndTypes.length > 1 ? ` (${termsAndTypes.length})` : ''}`,
        icon: '📄',
        onClick: () => {
          termsAndTypes.forEach(node => {
            onOpenDefinition(node.fullPath, node.type);
          });
        },
      });
    }

    // Add to Scratch - for any selection (namespaces will recursively include their contents)
    if (onAddToScratch && selection.length > 0) {
      items.push({
        label: `Add to Scratch${selection.length > 1 ? ` (${selection.length})` : ''}`,
        icon: '📝',
        onClick: () => onAddToScratch(selection),
      });
    }

    // Divider before destructive operations
    if (items.length > 0) {
      items.push({ label: '', onClick: () => {}, divider: true });
    }

    // Rename/Move - only for single selection
    if (onRename && isSingleSelection) {
      items.push({
        label: 'Rename/Move...',
        icon: '✏️',
        onClick: () => onRename(selection[0]),
      });
    }

    // Delete - for any selection
    if (onDelete && selection.length > 0) {
      items.push({
        label: `Delete${selection.length > 1 ? ` (${selection.length})` : ''}`,
        icon: '🗑️',
        onClick: () => onDelete(selection),
      });
    }

    return items;
  }, [getSelectedTreeNodes, onOpenDefinition, onAddToScratch, onRename, onDelete]);

  /**
   * Handle drag start - store dragged nodes
   */
  const handleDragStart = useCallback((e: React.DragEvent, node: TreeNode) => {
    // If the dragged node is in selection, drag all selected nodes
    // Otherwise, just drag the single node
    if (selectedNodes.has(node.fullPath)) {
      draggedNodesRef.current = getSelectedTreeNodes();
    } else {
      draggedNodesRef.current = [node];
      // Also select this node
      setSelectedNodes(new Set([node.fullPath]));
    }

    setIsDragging(true);

    // Set drag data
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', node.fullPath);
  }, [selectedNodes, getSelectedTreeNodes]);

  /**
   * Handle drag over - show drop target indicator
   */
  const handleDragOver = useCallback((e: React.DragEvent, node: TreeNode) => {
    e.preventDefault();
    e.stopPropagation();

    // Can only drop into namespaces
    if (node.type !== 'namespace') {
      e.dataTransfer.dropEffect = 'none';
      setDropTarget({ path: node.fullPath, position: 'inside', isValid: false });
      return;
    }

    // Check if we're dragging a node into itself or a descendant
    const isInvalidDrop = draggedNodesRef.current.some(
      draggedNode =>
        draggedNode.fullPath === node.fullPath ||
        node.fullPath.startsWith(draggedNode.fullPath + '.')
    );

    if (isInvalidDrop) {
      e.dataTransfer.dropEffect = 'none';
      setDropTarget({ path: node.fullPath, position: 'inside', isValid: false });
      return;
    }

    e.dataTransfer.dropEffect = 'move';
    setDropTarget({ path: node.fullPath, position: 'inside', isValid: true });
  }, []);

  /**
   * Handle drag leave - clear drop target
   */
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    // Only clear if we're actually leaving (not entering a child)
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
      setDropTarget(null);
    }
  }, []);

  /**
   * Handle drop - move items to target namespace
   */
  const handleDrop = useCallback(async (e: React.DragEvent, targetNode: TreeNode) => {
    e.preventDefault();
    e.stopPropagation();

    setDropTarget(null);
    setIsDragging(false);

    // Can only drop into namespaces
    if (targetNode.type !== 'namespace') return;

    const nodesToMove = draggedNodesRef.current;
    if (nodesToMove.length === 0) return;

    // Check for invalid drops
    const isInvalidDrop = nodesToMove.some(
      node =>
        node.fullPath === targetNode.fullPath ||
        targetNode.fullPath.startsWith(node.fullPath + '.')
    );

    if (isInvalidDrop) return;

    // Move each item to the target namespace
    try {
      for (const node of nodesToMove) {
        const newFQN = `${targetNode.fullPath}.${node.name}`;
        await moveItem(node.fullPath, newFQN, node.type);
      }
      // Wait for UCM to process the commands before refreshing
      setTimeout(() => {
        refreshNamespace();
      }, 500);
    } catch (err) {
      console.error('Failed to move items:', err);
    }

    draggedNodesRef.current = [];
  }, [refreshNamespace]);

  /**
   * Handle drag end - cleanup
   */
  const handleDragEnd = useCallback(() => {
    setDropTarget(null);
    setIsDragging(false);
    draggedNodesRef.current = [];
  }, []);

  /**
   * Handle drop on root (move to top-level namespace)
   */
  const handleDropOnRoot = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setDropTarget(null);
    setIsDragging(false);

    const nodesToMove = draggedNodesRef.current;
    if (nodesToMove.length === 0) return;

    // Move each item to root namespace
    try {
      for (const node of nodesToMove) {
        // Moving to root means just using the name (no namespace prefix)
        const newFQN = node.name;
        await moveItem(node.fullPath, newFQN, node.type);
      }
      // Wait for UCM to process the commands before refreshing
      setTimeout(() => {
        refreshNamespace();
      }, 500);
    } catch (err) {
      console.error('Failed to move items to root:', err);
    }

    draggedNodesRef.current = [];
  }, [refreshNamespace]);

  // Load root namespace when project/branch changes or when refreshNamespace is triggered
  useEffect(() => {
    if (currentProject && currentBranch) {
      loadRootNamespace();
    }
  }, [currentProject, currentBranch, namespaceVersion]);

  // Debounced search when query changes
  useEffect(() => {
    if (!currentProject || !currentBranch) return;

    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timeoutId = setTimeout(() => {
      performSearch();
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, currentProject, currentBranch]);

  // Reveal and highlight a path when revealPath changes
  useEffect(() => {
    if (!revealPath || !currentProject || !currentBranch) {
      setHighlightedPath(null);
      return;
    }

    // Strip timestamp suffix if present (e.g., "base.List.map|123456" -> "base.List.map")
    // Using '|' as delimiter to avoid confusion with hash '#'
    const actualPath = revealPath.includes('|')
      ? revealPath.substring(0, revealPath.lastIndexOf('|'))
      : revealPath;

    // Clear search query to show tree view
    setSearchQuery('');

    // Expand path and highlight
    revealAndHighlightPath(actualPath);
  }, [revealPath, currentProject, currentBranch]);

  // Scroll to highlighted item when it changes
  useEffect(() => {
    if (highlightedPath && highlightedRef.current) {
      highlightedRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [highlightedPath]);

  /**
   * Expand the tree to reveal a path and highlight the target item
   * e.g., "base.List.map" expands "base" and "base.List", then highlights "base.List.map"
   *
   * IMPORTANT: This function only accepts FQN paths, not hashes.
   * The DefinitionResolver should always provide FQN after resolution.
   *
   * Note: In Unison, terms can have dots in their names (e.g., "Route.respond.ok.json" is a single term).
   * We handle this by trying to expand as many namespaces as possible, then searching for
   * compound term names in the deepest expanded namespace.
   */
  async function revealAndHighlightPath(fqn: string) {
    // Guard: Cannot reveal hashes - need FQN for tree navigation
    if (fqn.startsWith('#')) {
      console.error('[NamespaceBrowser] Cannot reveal hash, need FQN:', fqn);
      return;
    }

    const parts = fqn.split('.');
    // Deep clone to avoid mutating existing state
    let newNodes = cloneTreeNodes(rootNodes);
    let lastExpandedPath = '';
    let stoppedAtIndex = -1;

    // Navigate and expand each namespace in the path
    // We try to expand as many as possible, stopping when we can't find a namespace
    for (let i = 0; i < parts.length - 1; i++) {
      const partialPath = parts.slice(0, i + 1).join('.');
      const node = findNodeByPath(newNodes, partialPath);

      if (!node) {
        // Node not found - this might mean the remaining parts are the term name
        console.log(`[NamespaceBrowser] Could not find namespace "${partialPath}", stopping expansion at index ${i}`);
        stoppedAtIndex = i;
        break;
      }

      if (node.type === 'namespace') {
        // Expand this namespace if not already
        if (!node.isExpanded) {
          node.isExpanded = true;
          if (!node.isLoaded) {
            try {
              node.children = await loadChildren(node);
              node.isLoaded = true;
            } catch (err) {
              console.error('Error expanding namespace:', err);
              stoppedAtIndex = i;
              break;
            }
          }
        }
        lastExpandedPath = partialPath;
      } else {
        // Found a non-namespace node (term/type) before reaching the end
        // The full FQN might be a compound term name starting from the previous namespace
        console.log(`[NamespaceBrowser] Found non-namespace at "${partialPath}", stopping at index ${i}`);
        stoppedAtIndex = i;
        break;
      }
    }

    // Try to find the exact target node
    let targetNode = findNodeByPath(newNodes, fqn);

    // If exact match not found, try to find the term in the tree
    // Unison has several patterns:
    // 1. Simple term: "ns.foo" -> term "foo" in namespace "ns"
    // 2. Type accessor: "ns.Type.method" -> term "Type.method" in namespace "ns" OR type "Type" in "ns"
    // 3. Nested: "ns.Type.Nested.method" -> various possibilities
    if (!targetNode && lastExpandedPath) {
      const parentNode = findNodeByPath(newNodes, lastExpandedPath);
      if (parentNode?.children) {
        const lastExpandedParts = lastExpandedPath.split('.').length;
        const remainingParts = parts.slice(lastExpandedParts);
        const termName = remainingParts.join('.');

        // Strategy 1: Look for exact compound term name (e.g., "Either.mapRight")
        targetNode = parentNode.children.find((child) => child.name === termName);

        // Strategy 2: Look for a type/term with the first part of the name (e.g., "Either")
        // This handles cases where "Either.mapRight" means type "Either" in the tree
        if (!targetNode && remainingParts.length > 0) {
          const firstPart = remainingParts[0];
          targetNode = parentNode.children.find((child) => child.name === firstPart);
        }

        // Strategy 3: Look for terms that start with the type name followed by a dot
        // This handles "Type.method" style accessor terms stored as compound names
        if (!targetNode && remainingParts.length > 1) {
          const prefix = remainingParts[0] + '.';
          const matchingChildren = parentNode.children.filter((child) =>
            child.name.startsWith(prefix)
          );
          if (matchingChildren.length > 0) {
            // Try to find exact match among compound names
            targetNode = matchingChildren.find((child) => child.name === termName);
            if (!targetNode) {
              // Fall back to the type itself if we found related terms
              targetNode = parentNode.children.find((child) => child.name === remainingParts[0]);
            }
          }
        }
      }
    }

    setRootNodes(newNodes);

    // Highlight whatever we could find, or the FQN for visual feedback
    const highlightPath = targetNode?.fullPath || fqn;
    setHighlightedPath(highlightPath);
    setSelectedPath(highlightPath);

    // Clear the animated highlight after 3 seconds, but keep selected
    setTimeout(() => {
      setHighlightedPath((current) => (current === highlightPath ? null : current));
    }, 3000);
  }

  /**
   * Find a node by its full path in the tree
   */
  function findNodeByPath(nodes: TreeNode[], path: string): TreeNode | null {
    for (const node of nodes) {
      if (node.fullPath === path) {
        return node;
      }
      if (node.children) {
        const found = findNodeByPath(node.children, path);
        if (found) return found;
      }
    }
    return null;
  }

  async function loadRootNamespace() {
    if (!currentProject || !currentBranch) return;

    setLoading(true);
    setError(null);
    try {
      const items = await client.listNamespace(
        currentProject.name,
        currentBranch.name,
        '.'
      );

      const nodes: TreeNode[] = items.map((item) => ({
        name: item.name,
        fullPath: item.name,
        type: item.type,
        hash: item.hash,
        isExpanded: false,
        isLoaded: item.type !== 'namespace',
        children: item.type === 'namespace' ? [] : undefined,
      }));

      setRootNodes(nodes);
    } catch (err) {
      setError(`Failed to load namespace: ${err}`);
      console.error('Error loading namespace:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadChildren(node: TreeNode): Promise<TreeNode[]> {
    if (!currentProject || !currentBranch) return [];

    const items = await client.listNamespace(
      currentProject.name,
      currentBranch.name,
      node.fullPath
    );

    return items.map((item) => ({
      name: item.name,
      fullPath: `${node.fullPath}.${item.name}`,
      type: item.type,
      hash: item.hash,
      isExpanded: false,
      isLoaded: item.type !== 'namespace',
      children: item.type === 'namespace' ? [] : undefined,
    }));
  }

  async function toggleNode(nodePath: number[]) {
    // Deep clone to avoid mutating existing state
    const newRootNodes = cloneTreeNodes(rootNodes);

    // Navigate to the node using the path
    let nodes = newRootNodes;
    let targetNode: TreeNode | undefined;

    for (let i = 0; i < nodePath.length; i++) {
      const index = nodePath[i];
      targetNode = nodes[index];

      if (i < nodePath.length - 1 && targetNode.children) {
        nodes = targetNode.children;
      }
    }

    if (!targetNode || targetNode.type !== 'namespace') return;

    // Toggle expansion
    if (targetNode.isExpanded) {
      targetNode.isExpanded = false;
    } else {
      targetNode.isExpanded = true;
      // Load children if not already loaded
      if (!targetNode.isLoaded) {
        try {
          targetNode.children = await loadChildren(targetNode);
          targetNode.isLoaded = true;
        } catch (err) {
          setError(`Failed to load namespace: ${err}`);
          console.error('Error loading namespace:', err);
          return;
        }
      }
    }

    setRootNodes(newRootNodes);
  }

  async function performSearch() {
    if (!currentProject || !currentBranch || !searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const results = await client.findDefinitions(
        currentProject.name,
        currentBranch.name,
        searchQuery,
        50
      );

      const namespaceItems: NamespaceItem[] = results.map((r) => ({
        name: r.name,
        type: r.type,
        hash: r.hash,
      }));

      setSearchResults(namespaceItems);
    } catch (err) {
      setError(`Failed to search: ${err}`);
      console.error('Error searching:', err);
    } finally {
      setLoading(false);
    }
  }

  function handleItemClick(item: NamespaceItem | TreeNode) {
    if (item.type === 'term' || item.type === 'type') {
      const fullName = 'fullPath' in item ? item.fullPath : item.name;
      onOpenDefinition(fullName, item.type as 'term' | 'type');
    }
  }

  function getItemIcon(type: string, isExpanded?: boolean) {
    switch (type) {
      case 'namespace':
        return isExpanded ? '📂' : '📁';
      case 'term':
        return '𝑓';
      case 'type':
        return '𝑇';
      default:
        return '•';
    }
  }

  function renderTreeNode(node: TreeNode, path: number[], depth: number = 0): React.ReactElement {
    const nodePath = [...path];
    const hasChildren = node.type === 'namespace';
    const isHighlighted = node.fullPath === highlightedPath;
    const isSelected = selectedNodes.has(node.fullPath);
    const isDropTargetNode = dropTarget?.path === node.fullPath && dropTarget?.position === 'inside';
    const isDropTargetValid = isDropTargetNode && dropTarget?.isValid;
    const isDropTargetInvalid = isDropTargetNode && !dropTarget?.isValid;
    const nodeKey = getNodeKey(node);

    // Determine drop target class
    const dropTargetClass = isDropTargetValid
      ? 'drop-target-valid'
      : isDropTargetInvalid
        ? 'drop-target-invalid'
        : '';

    return (
      <div key={nodeKey}>
        <div
          ref={isHighlighted ? highlightedRef : undefined}
          className={`namespace-item ${isHighlighted ? 'highlighted' : ''} ${isSelected ? 'selected' : ''} ${dropTargetClass} ${isDragging && isSelected ? 'dragging' : ''}`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={(e) => handleNodeClick(e, node, nodePath)}
          onContextMenu={(e) => handleContextMenu(e, node)}
          draggable
          onDragStart={(e) => handleDragStart(e, node)}
          onDragOver={(e) => handleDragOver(e, node)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, node)}
          onDragEnd={handleDragEnd}
        >
          {hasChildren && (
            <span className="tree-arrow">
              {node.isExpanded ? '▼' : '▶'}
            </span>
          )}
          {!hasChildren && <span className="tree-spacer" />}
          <span className="item-icon">{getItemIcon(node.type, node.isExpanded)}</span>
          <span className="item-name">{node.name}</span>
          {node.hash && (
            <span className="item-hash">{node.hash.substring(0, 8)}</span>
          )}
        </div>
        {hasChildren && node.isExpanded && node.children && (
          <div className="tree-children">
            {node.children.map((child, index) =>
              renderTreeNode(child, [...nodePath, index], depth + 1)
            )}
          </div>
        )}
      </div>
    );
  }

  if (!currentProject || !currentBranch) {
    return (
      <div className="namespace-browser empty">
        <p>Select a project and branch to browse</p>
      </div>
    );
  }

  return (
    <div className="namespace-browser">
      <div className="search-box">
        <input
          type="text"
          placeholder="Search definitions..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <button
          className="btn-refresh"
          onClick={() => refreshNamespace()}
          title="Refresh namespace"
          disabled={loading}
        >
          ↻
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading && searchResults.length === 0 && rootNodes.length === 0 ? (
        <div className="loading">Loading...</div>
      ) : (
        <div className="namespace-items">
          {searchQuery.trim() ? (
            // Show search results
            searchResults.length === 0 ? (
              <div className="empty-message">No results found</div>
            ) : (
              searchResults.map((item, index) => (
                <div
                  key={`${item.name}-${index}`}
                  className={`namespace-item ${item.type}`}
                  onClick={() => handleItemClick(item)}
                >
                  <span className="item-icon">{getItemIcon(item.type)}</span>
                  <span className="item-name">{item.name}</span>
                  {item.hash && (
                    <span className="item-hash">{item.hash.substring(0, 8)}</span>
                  )}
                </div>
              ))
            )
          ) : (
            // Show tree view
            rootNodes.length === 0 ? (
              <div className="empty-message">No items found</div>
            ) : (
              rootNodes.map((node, index) => renderTreeNode(node, [index]))
            )
          )}
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={getContextMenuItems()}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
