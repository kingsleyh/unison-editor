import { useEffect, useState } from 'react';
import { useUnisonStore } from '../store/unisonStore';
import { getUCMApiClient } from '../services/ucmApi';
import type { NamespaceItem } from '../services/ucmApi';

interface NamespaceBrowserProps {
  onOpenDefinition: (name: string, type: 'term' | 'type') => void;
}

export function NamespaceBrowser({ onOpenDefinition }: NamespaceBrowserProps) {
  const { currentProject, currentBranch, currentPath } = useUnisonStore();
  const [items, setItems] = useState<NamespaceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const client = getUCMApiClient();

  // Load namespace when project, branch, or path changes
  useEffect(() => {
    if (currentProject && currentBranch) {
      loadNamespace();
    }
  }, [currentProject, currentBranch, currentPath]);

  // Debounced search when query changes
  useEffect(() => {
    if (!currentProject || !currentBranch) return;

    // If search query is empty, load namespace instead
    if (!searchQuery.trim()) {
      loadNamespace();
      return;
    }

    // Debounce the search
    const timeoutId = setTimeout(() => {
      performSearch();
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [searchQuery, currentProject, currentBranch]);

  async function loadNamespace() {
    if (!currentProject || !currentBranch) return;

    setLoading(true);
    setError(null);
    try {
      const namespaceItems = await client.listNamespace(
        currentProject.name,
        currentBranch.name,
        currentPath
      );
      setItems(namespaceItems);
    } catch (err) {
      setError(`Failed to load namespace: ${err}`);
      console.error('Error loading namespace:', err);
    } finally {
      setLoading(false);
    }
  }

  async function performSearch() {
    if (!currentProject || !currentBranch || !searchQuery.trim()) {
      loadNamespace();
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

      // Convert search results to namespace items
      const namespaceItems: NamespaceItem[] = results.map((r) => ({
        name: r.name,
        type: r.type,
        hash: r.hash,
      }));

      setItems(namespaceItems);
    } catch (err) {
      setError(`Failed to search: ${err}`);
      console.error('Error searching:', err);
    } finally {
      setLoading(false);
    }
  }

  function handleItemClick(item: NamespaceItem) {
    if (item.type === 'namespace') {
      // Navigate into namespace by updating the current path
      const newPath = currentPath === '.' || currentPath === ''
        ? item.name
        : `${currentPath}.${item.name}`;
      useUnisonStore.getState().setCurrentPath(newPath);
    } else if (item.type === 'term' || item.type === 'type') {
      // Use fully qualified name (current path + item name)
      const fullName = currentPath === '.' || currentPath === ''
        ? item.name
        : `${currentPath}.${item.name}`;
      onOpenDefinition(fullName, item.type as 'term' | 'type');
    }
  }

  function getItemIcon(type: string) {
    switch (type) {
      case 'namespace':
        return '📁';
      case 'term':
        return '𝑓';
      case 'type':
        return '𝑇';
      default:
        return '•';
    }
  }

  if (!currentProject || !currentBranch) {
    return (
      <div className="namespace-browser empty">
        <p>Select a project and branch to browse</p>
      </div>
    );
  }

  function navigateToPath(newPath: string) {
    useUnisonStore.getState().setCurrentPath(newPath);
    setSearchQuery(''); // Clear search when navigating
  }

  function renderBreadcrumbs() {
    const parts = currentPath === '.' || currentPath === '' ? [] : currentPath.split('.');

    return (
      <div className="breadcrumbs">
        <span
          className="breadcrumb-item"
          onClick={() => navigateToPath('.')}
          style={{ cursor: 'pointer' }}
        >
          🏠
        </span>
        {parts.map((part, index) => {
          const pathUpToHere = parts.slice(0, index + 1).join('.');
          return (
            <span key={index}>
              <span className="breadcrumb-separator"> / </span>
              <span
                className="breadcrumb-item"
                onClick={() => navigateToPath(pathUpToHere)}
                style={{ cursor: 'pointer' }}
              >
                {part}
              </span>
            </span>
          );
        })}
      </div>
    );
  }

  return (
    <div className="namespace-browser">
      {renderBreadcrumbs()}

      <div className="search-box">
        <input
          type="text"
          placeholder="Search definitions..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading ? (
        <div className="loading">Loading...</div>
      ) : (
        <div className="namespace-items">
          {items.length === 0 ? (
            <div className="empty-message">No items found</div>
          ) : (
            items.map((item, index) => (
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
          )}
        </div>
      )}
    </div>
  );
}
