interface UCMConflictModalProps {
  isOpen: boolean;
  onRetry: () => void;
}

export function UCMConflictModal({
  isOpen,
  onRetry,
}: UCMConflictModalProps) {
  if (!isOpen) return null;

  return (
    <div className="ucm-conflict-overlay">
      <div className="ucm-conflict-modal">
        <div className="ucm-conflict-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-status-warning)" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h2>UCM Already Running</h2>
        <p>
          Another UCM process is using this codebase. Only one UCM instance can
          access a codebase at a time.
        </p>
        <p className="ucm-conflict-hint">
          Please close any existing UCM instances (terminal windows, other
          editor instances) before continuing.
        </p>
        <div className="ucm-conflict-actions">
          <button className="ucm-conflict-btn primary" onClick={onRetry}>
            Retry
          </button>
        </div>
      </div>
    </div>
  );
}
