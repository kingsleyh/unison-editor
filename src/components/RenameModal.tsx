import { useState, useEffect } from 'react';

interface RenameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRename: (newName: string) => void;
  currentName: string;
  itemType: 'file' | 'directory';
}

export function RenameModal({
  isOpen,
  onClose,
  onRename,
  currentName,
  itemType,
}: RenameModalProps) {
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Pre-fill with current name (without extension for files)
      if (itemType === 'file' && currentName.endsWith('.u')) {
        setNewName(currentName.slice(0, -2));
      } else {
        setNewName(currentName);
      }
    }
  }, [isOpen, currentName, itemType]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!newName.trim()) {
      setError('Name cannot be empty');
      return;
    }

    // Add .u extension for files if missing
    let finalName = newName.trim();
    if (itemType === 'file' && !finalName.endsWith('.u')) {
      finalName += '.u';
    }

    // Check for invalid characters
    if (finalName.includes('/') || finalName.includes('\\')) {
      setError('Name cannot contain / or \\');
      return;
    }

    if (finalName === currentName) {
      setError('Name has not changed');
      return;
    }

    onRename(finalName);
    handleClose();
  }

  function handleClose() {
    setNewName('');
    setError(null);
    onClose();
  }

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Rename {itemType === 'file' ? 'File' : 'Folder'}</h2>
          <button className="modal-close-btn" onClick={handleClose}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label htmlFor="newName">
                New {itemType === 'file' ? 'filename' : 'folder name'}
              </label>
              <input
                type="text"
                id="newName"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={currentName}
                autoFocus
              />
              {itemType === 'file' && (
                <div className="form-hint">
                  .u extension will be added automatically if not provided
                </div>
              )}
            </div>

            {error && <div className="form-error">{error}</div>}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={handleClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Rename
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
