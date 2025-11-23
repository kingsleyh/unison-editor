import { useEffect, useState } from 'react';
import { useUnisonStore } from '../store/unisonStore';
import { getUCMApiClient } from '../services/ucmApi';
import type { NamespaceItem } from '../services/ucmApi';

interface NamespaceBrowserProps {
  onOpenDefinition: (name: string, type: 'term' | 'type') => void;
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

export function NamespaceBrowser({ onOpenDefinition }: NamespaceBrowserProps) {
  const { currentProject, currentBranch } = useUnisonStore();
  const [rootNodes, setRootNodes] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<NamespaceItem[]>([]);

  const client = getUCMApiClient();

  // Load root namespace when project/branch changes
  useEffect(() => {
    if (currentProject && currentBranch) {
      loadRootNamespace();
    }
  }, [currentProject, currentBranch]);

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

  async function toggleNode(nodePath: string[]) {
    const newRootNodes = [...rootNodes];

    // Navigate to the node using the path
    let nodes = newRootNodes;
    let targetNode: TreeNode | undefined;

    for (let i = 0; i < nodePath.length; i++) {
      const index = parseInt(nodePath[i]);
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

  function renderTreeNode(node: TreeNode, path: number[], depth: number = 0): JSX.Element {
    const nodePath = [...path];
    const hasChildren = node.type === 'namespace';

    return (
      <div key={node.fullPath}>
        <div
          className="namespace-item"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => {
            if (hasChildren) {
              toggleNode(nodePath);
            } else {
              handleItemClick(node);
            }
          }}
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
    </div>
  );
}
