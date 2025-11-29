import React, { useState, useEffect } from 'react';
import { deleteItem } from '../services/ucmCommands';
import type { TreeNode } from './NamespaceBrowser';

interface NamespaceDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: TreeNode[];
  onComplete?: () => void;
}

export function NamespaceDeleteModal({
  isOpen,
  onClose,
  items,
  onComplete,
}: NamespaceDeleteModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal opens or items change
  useEffect(() => {
    if (isOpen) {
      setIsDeleting(false);
      setError(null);
    }
  }, [isOpen, items]);

  if (!isOpen || items.length === 0) return null;

  const hasNamespaces = items.some((item) => item.type === 'namespace');
  const itemCount = items.length;

  async function handleDelete() {
    setIsDeleting(true);
    setError(null);

    try {
      // Delete items one by one
      for (const item of items) {
        await deleteItem(item.fullPath, item.type);
      }
      // Wait for UCM to process the commands before refreshing
      // UCM PTY commands are async, so we need a short delay
      setTimeout(() => {
        onComplete?.();
      }, 500);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
      setIsDeleting(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose();
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content delete-modal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="modal-header">
          <h2>Confirm Delete</h2>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <p>
            Are you sure you want to delete{' '}
            {itemCount === 1 ? (
              <strong>{items[0].fullPath}</strong>
            ) : (
              <strong>{itemCount} items</strong>
            )}
            ?
          </p>

          {hasNamespaces && (
            <div className="warning-box">
              <strong>Warning:</strong> Deleting a namespace will remove all its
              contents recursively.
            </div>
          )}

          {itemCount > 1 && (
            <div className="delete-item-list">
              <p>Items to delete:</p>
              <ul>
                {items.map((item) => (
                  <li key={item.fullPath}>
                    <span className="item-type-badge">{item.type}</span>
                    {item.fullPath}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {error && <div className="form-error">{error}</div>}
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-danger"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
