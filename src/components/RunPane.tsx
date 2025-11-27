import { useUnisonStore } from '../store/unisonStore';
import { ConnectionStatus } from './ConnectionStatus';

interface RunPaneProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export function RunPane({ isCollapsed, onToggleCollapse }: RunPaneProps) {
  const { runOutput, clearRunOutput } = useUnisonStore();

  // When collapsed, show just the expand bar
  if (isCollapsed) {
    return (
      <div className="run-pane-collapsed-bar" onClick={onToggleCollapse}>
        <span className="run-pane-collapsed-icon">▲</span>
        <span className="run-pane-collapsed-title">Output</span>
        {runOutput && (
          <span className={`run-pane-collapsed-indicator ${runOutput.type}`}>
            {runOutput.type === 'success' ? '✓' : runOutput.type === 'error' ? '✗' : '●'}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="run-pane">
      <div className="run-pane-header">
        <div className="run-pane-header-left">
          <span className="run-pane-title">Output</span>
          <ConnectionStatus />
        </div>
        <div className="run-pane-actions">
          {runOutput && (
            <button
              className="run-pane-clear-btn"
              onClick={clearRunOutput}
              title="Clear output"
            >
              Clear
            </button>
          )}
          <button
            className="run-pane-collapse-btn"
            onClick={onToggleCollapse}
            title="Collapse panel"
          >
            ▼
          </button>
        </div>
      </div>
      <div className="run-pane-content">
        {runOutput ? (
          // Check if this is a watch expression result (contains ⇒)
          runOutput.message.includes('⇒') ? (
            <div className="watch-results">
              {runOutput.message.split('\n\n').map((block, i) => (
                <div key={i} className="watch-result-block">
                  {block.split('\n').map((line, j) => (
                    <div
                      key={j}
                      className={
                        line.startsWith('⇒')
                          ? 'watch-result-value'
                          : line.startsWith('>')
                            ? 'watch-expression-line'
                            : ''
                      }
                    >
                      {line}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className={`run-pane-message ${runOutput.type}`}>
              <span className="run-pane-message-icon">
                {runOutput.type === 'success' && '✓'}
                {runOutput.type === 'error' && '✗'}
                {runOutput.type === 'info' && '●'}
              </span>
              <span className="run-pane-message-text">{runOutput.message}</span>
            </div>
          )
        ) : (
          <div className="run-pane-empty">
            No output yet. Click the play button on a watch expression to evaluate it.
          </div>
        )}
      </div>
    </div>
  );
}
