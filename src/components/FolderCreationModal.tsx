import { useState } from 'react';

interface FolderCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (folderName: string) => void;
  parentPath?: string;
}

export function FolderCreationModal({
  isOpen,
  onClose,
  onCreate,
  parentPath = '',
}: FolderCreationModalProps) {
  const [folderName, setFolderName] = useState('');
  const [error, setError] = useState<string | null>(null);

  function validateFolderName(name: string): string | null {
    if (!name.trim()) {
      return 'Folder name cannot be empty';
    }

    // Check for invalid characters (cross-platform safe)
    const invalidChars = /[<>:"/\\|?*]/;
    if (invalidChars.test(name)) {
      return 'Folder name contains invalid characters';
    }

    // Reserved names on Windows
    const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
    if (reservedNames.test(name.trim())) {
      return 'This name is reserved and cannot be used';
    }

    // Check for names starting/ending with spaces or ending with periods
    if (name.startsWith(' ') || name.endsWith(' ') || name.endsWith('.')) {
      return 'Folder name cannot start/end with spaces or end with a period';
    }

    return null;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const validationError = validateFolderName(folderName);
    if (validationError) {
      setError(validationError);
      return;
    }

    onCreate(folderName.trim());
    handleClose();
  }

  function handleClose() {
    setFolderName('');
    setError(null);
    onClose();
  }

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create New Folder</h2>
          <button className="modal-close-btn" onClick={handleClose}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {parentPath && (
              <div className="modal-info">
                Location: {parentPath}
              </div>
            )}

            <div className="form-group">
              <label htmlFor="folderName">Folder name</label>
              <input
                type="text"
                id="folderName"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="New Folder"
                autoFocus
              />
            </div>

            {error && <div className="form-error">{error}</div>}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={handleClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Create Folder
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
