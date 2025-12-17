interface UCMNotFoundModalProps {
  isOpen: boolean;
  onRetry: () => void;
  onDismiss: () => void;
}

export function UCMNotFoundModal({
  isOpen,
  onRetry,
  onDismiss,
}: UCMNotFoundModalProps) {
  if (!isOpen) return null;

  return (
    <div className="ucm-conflict-overlay">
      <div className="ucm-conflict-modal">
        <div className="ucm-conflict-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-status-error)" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </div>
        <h2>UCM Not Found</h2>
        <p>
          The Unison Codebase Manager (UCM) could not be found on your system.
          UCM is required to use Unison Editor.
        </p>
        <p className="ucm-conflict-hint">
          Please install UCM from{' '}
          <a
            href="https://www.unison-lang.org/docs/installation/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--color-link-foreground)', textDecoration: 'underline' }}
          >
            unison-lang.org
          </a>{' '}
          and ensure it's in your PATH (typically installed via Homebrew: <code style={{
            background: 'var(--color-tab-background)',
            padding: '2px 6px',
            borderRadius: '4px',
            fontSize: '12px'
          }}>brew install unisonweb/unison/unison</code>).
        </p>
        <div className="ucm-conflict-actions">
          <button className="ucm-conflict-btn secondary" onClick={onDismiss}>
            Dismiss
          </button>
          <button className="ucm-conflict-btn primary" onClick={onRetry}>
            Retry
          </button>
        </div>
      </div>
    </div>
  );
}
