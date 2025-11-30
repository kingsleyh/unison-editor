import { useUnisonStore } from '../store/unisonStore';

interface RunPaneProps {
  isCollapsed: boolean;
}

export function RunPane({ isCollapsed }: RunPaneProps) {
  const { runOutput } = useUnisonStore();

  // When collapsed, the BottomPanelSplitter handles showing the collapsed label
  if (isCollapsed) {
    return null;
  }

  return (
    <div className="run-pane">
      <div className="run-pane-content">
        {runOutput ? (
          // Check if this is a watch expression result (contains ⇒)
          runOutput.message.includes('⇒') ? (
            <div className={`watch-results ${runOutput.type}`}>
              {runOutput.message.split('\n\n').map((block, i) => {
                // Determine block type based on content
                const isTestBlock = block.startsWith('Tests:') || block.includes('✅') || block.includes('🚫');
                const isErrorBlock = block.startsWith('⚠️');

                // Determine if this specific block has failures
                const blockHasFailure = block.includes('🚫');

                // Only test blocks with failures get 'error', error blocks get 'error'
                // Watch blocks and passing test blocks get 'success'
                const blockType = isErrorBlock ? 'error' :
                                  isTestBlock && blockHasFailure ? 'error' :
                                  'success';

                return (
                  <div key={i} className={`watch-result-block ${blockType}`}>
                    {block.split('\n').map((line, j) => (
                      <div
                        key={j}
                        className={
                          line.startsWith('⇒')
                            ? 'watch-result-value'
                            : line.startsWith('>')
                              ? 'watch-expression-line'
                              : line.includes('🚫')
                                ? 'test-failed-line'
                                : line.includes('✅')
                                  ? 'test-passed-line'
                                  : ''
                        }
                      >
                        {line}
                      </div>
                    ))}
                  </div>
                );
              })}
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
