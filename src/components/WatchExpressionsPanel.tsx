import { useEffect, useState } from 'react';
import { getLSPService } from '../services/lspService';

interface WatchExpressionsPanelProps {
  fileContent: string;
  filePath?: string;
}

interface WatchExpressionResult {
  expression: string;
  line: number;
  result?: string;
  loading?: boolean;
}

export function WatchExpressionsPanel({ fileContent, filePath }: WatchExpressionsPanelProps) {
  const [watchExpressions, setWatchExpressions] = useState<WatchExpressionResult[]>([]);
  const [lspConnected, setLspConnected] = useState(false);
  const lspService = getLSPService();

  useEffect(() => {
    // Subscribe to LSP connection status
    const unsubscribe = lspService.onConnectionChange((connected) => {
      setLspConnected(connected);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    // Parse watch expressions whenever file content changes
    const lines = fileContent.split('\n');
    const expressions: WatchExpressionResult[] = [];

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('>')) {
        const expression = trimmed.substring(1).trim();
        if (expression) {
          expressions.push({
            expression,
            line: index,
            loading: lspConnected,
          });
        }
      }
    });

    setWatchExpressions(expressions);
  }, [fileContent, lspConnected]);

  // Fetch hover information for watch expressions
  useEffect(() => {
    if (lspConnected && filePath && watchExpressions.length > 0) {
      watchExpressions.forEach(async (watch, index) => {
        if (!watch.result && !watch.loading) {
          try {
            // Request hover information at the watch expression position
            const uri = `file://${filePath}`;
            const hover = await lspService.hover(uri, watch.line, 1);

            if (hover && hover.contents) {
              // Extract the hover text
              let resultText = '';
              if (typeof hover.contents === 'string') {
                resultText = hover.contents;
              } else if ('value' in hover.contents) {
                resultText = hover.contents.value;
              } else if (Array.isArray(hover.contents)) {
                resultText = hover.contents
                  .map((c) => (typeof c === 'string' ? c : c.value))
                  .join('\n');
              }

              // Update the watch expression with the result
              setWatchExpressions((prev) => {
                const updated = [...prev];
                if (updated[index]) {
                  updated[index] = {
                    ...updated[index],
                    result: resultText,
                    loading: false,
                  };
                }
                return updated;
              });
            }
          } catch (error) {
            console.error('Failed to get watch result:', error);
          }
        }
      });
    }
  }, [lspConnected, filePath, watchExpressions.length]);

  if (watchExpressions.length === 0) {
    return (
      <div className="watch-panel-empty">
        <p>No watch expressions found</p>
        <p className="hint">
          Start a line with <code>&gt;</code> to create a watch expression
        </p>
      </div>
    );
  }

  return (
    <div className="watch-panel">
      <div className="watch-panel-header">
        <h3>Watch Expressions</h3>
        <span className="watch-count">{watchExpressions.length}</span>
        {lspConnected && <span className="lsp-status connected">LSP Connected</span>}
        {!lspConnected && <span className="lsp-status disconnected">LSP Disconnected</span>}
      </div>

      <div className="watch-panel-content">
        {watchExpressions.map((watch, index) => (
          <div key={index} className="watch-expression">
            <div className="watch-expression-code">
              <code>&gt; {watch.expression}</code>
            </div>
            <div className="watch-expression-result">
              {watch.loading ? (
                <span className="watch-loading">⏳ Evaluating...</span>
              ) : watch.result ? (
                <span className="watch-result">{watch.result}</span>
              ) : (
                <span className="watch-pending">
                  {lspConnected ? '⏸ Waiting for evaluation' : '⏸ Start UCM to evaluate'}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {!lspConnected && (
        <div className="watch-panel-info">
          <p>
            💡 To evaluate these expressions, run <code>ucm</code> in your workspace directory.
            UCM's LSP server will provide real-time evaluation.
          </p>
        </div>
      )}
    </div>
  );
}
