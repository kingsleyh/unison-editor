interface FileConflictModalProps {
  isOpen: boolean;
  fileName: string;
  filePath: string;
  onReload: () => void;
  onKeepLocal: () => void;
}

export function FileConflictModal({
  isOpen,
  fileName,
  filePath,
  onReload,
  onKeepLocal,
}: FileConflictModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content file-conflict-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="file-conflict-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f0a020" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2>File Changed Externally</h2>
        </div>

        <div className="modal-body">
          <p>
            The file <strong>{fileName}</strong> has been modified outside the editor.
          </p>
          <p className="file-conflict-path">{filePath}</p>
          <p>You have unsaved changes. What would you like to do?</p>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onKeepLocal}>
            Keep My Changes
          </button>
          <button type="button" className="btn-primary btn-danger" onClick={onReload}>
            Reload from Disk
          </button>
        </div>
      </div>
    </div>
  );
}
