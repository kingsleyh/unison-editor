import React, { useState, useEffect, useRef } from 'react';
import { moveItem } from '../services/ucmCommands';

interface NamespaceRenameModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentFQN: string;
  itemType: 'term' | 'type' | 'namespace';
  onComplete?: () => void;
}

export function NamespaceRenameModal({
  isOpen,
  onClose,
  currentFQN,
  itemType,
  onComplete,
}: NamespaceRenameModalProps) {
  const [newFQN, setNewFQN] = useState(currentFQN);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setNewFQN(currentFQN);
      setError(null);
      setIsSubmitting(false);
      // Focus input after modal opens
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, currentFQN]);

  if (!isOpen) return null;

  function validateFQN(fqn: string): string | null {
    if (!fqn.trim()) {
      return 'Name cannot be empty';
    }

    // Check for leading/trailing dots
    if (fqn.startsWith('.') || fqn.endsWith('.')) {
      return 'Name cannot start or end with a dot';
    }

    // Check for consecutive dots
    if (fqn.includes('..')) {
      return 'Name cannot contain consecutive dots';
    }

    // Check each segment for valid characters
    const segments = fqn.split('.');
    for (const segment of segments) {
      if (!segment) {
        return 'Name cannot have empty segments';
      }
      // Unison allows alphanumeric and some symbols, but for safety we'll be conservative
      if (!/^[a-zA-Z_][a-zA-Z0-9_']*$/.test(segment)) {
        return `Invalid segment: "${segment}". Must start with letter or underscore, followed by alphanumeric, underscore, or quote`;
      }
    }

    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const validationError = validateFQN(newFQN);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (newFQN === currentFQN) {
      onClose();
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await moveItem(currentFQN, newFQN, itemType);
      // Wait for UCM to process the command before refreshing
      setTimeout(() => {
        onComplete?.();
      }, 500);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move/rename');
      setIsSubmitting(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose();
    }
  }

  const typeLabel = itemType === 'namespace' ? 'namespace' : itemType;
  const isRename = newFQN.split('.').slice(0, -1).join('.') ===
                   currentFQN.split('.').slice(0, -1).join('.');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content rename-modal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="modal-header">
          <h2>{isRename ? 'Rename' : 'Move'} {typeLabel}</h2>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label htmlFor="current-fqn">Current name:</label>
              <input
                type="text"
                id="current-fqn"
                value={currentFQN}
                disabled
                className="input-disabled"
              />
            </div>

            <div className="form-group">
              <label htmlFor="new-fqn">New name:</label>
              <input
                ref={inputRef}
                type="text"
                id="new-fqn"
                value={newFQN}
                onChange={(e) => {
                  setNewFQN(e.target.value);
                  setError(null);
                }}
                placeholder="e.g., myNamespace.myTerm"
                disabled={isSubmitting}
                autoComplete="off"
              />
              <div className="form-help">
                Change the namespace prefix to move to a different location.
              </div>
            </div>

            {error && <div className="form-error">{error}</div>}
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={isSubmitting || !newFQN.trim() || newFQN === currentFQN}
            >
              {isSubmitting ? 'Processing...' : isRename ? 'Rename' : 'Move'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
