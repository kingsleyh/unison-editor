/**
 * Log Panel Component
 *
 * Displays logs for debugging with filtering, search, and export.
 */

import { useEffect, useRef, useState, useMemo } from 'react';
import { useUnisonStore } from '../store/unisonStore';
import { getLoggingService } from '../services/loggingService';
import type { LogLevel, LogEntry } from '../types/logging';
import { LOG_LEVEL_COLORS } from '../types/logging';

interface LogPanelProps {
  isCollapsed: boolean;
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function LogEntryRow({ log, expanded, onToggle }: {
  log: LogEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  const hasDetails = log.details || log.error || log.duration !== undefined;

  return (
    <div className={`log-entry log-level-${log.level}`}>
      <div className="log-entry-main" onClick={hasDetails ? onToggle : undefined}>
        <span className="log-timestamp" title={new Date(log.timestamp).toISOString()}>
          {formatTimestamp(log.timestamp)}
        </span>
        <span
          className="log-level-badge"
          style={{ backgroundColor: LOG_LEVEL_COLORS[log.level] }}
        >
          {log.level.charAt(0).toUpperCase()}
        </span>
        <span className={`log-category-badge log-category-${log.category}`}>
          {log.category}
        </span>
        <span className="log-message">{log.message}</span>
        {log.duration !== undefined && (
          <span className="log-duration">{log.duration}ms</span>
        )}
        {hasDetails && (
          <span className="log-expand-icon">{expanded ? '▼' : '▶'}</span>
        )}
      </div>
      {expanded && hasDetails && (
        <div className="log-entry-details">
          {log.duration !== undefined && (
            <div className="log-detail-row">
              <span className="log-detail-label">Duration:</span>
              <span className="log-detail-value">{log.duration}ms</span>
            </div>
          )}
          {log.source && (
            <div className="log-detail-row">
              <span className="log-detail-label">Source:</span>
              <span className="log-detail-value">{log.source}</span>
            </div>
          )}
          {log.error && (
            <div className="log-detail-row log-error-details">
              <span className="log-detail-label">Error:</span>
              <pre className="log-detail-value log-error-message">
                {log.error.name}: {log.error.message}
                {log.error.stack && `\n${log.error.stack}`}
              </pre>
            </div>
          )}
          {log.details && (
            <div className="log-detail-row">
              <span className="log-detail-label">Details:</span>
              <pre className="log-detail-value">
                {JSON.stringify(log.details, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function LogPanel({ isCollapsed }: LogPanelProps) {
  const { logs, logFilter, setLogFilter } = useUnisonStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [expandedLogIds, setExpandedLogIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Filter logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // Level filter
      if (!logFilter.levels.has(log.level)) return false;

      // Category filter
      if (!logFilter.categories.has(log.category)) return false;

      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const messageMatch = log.message.toLowerCase().includes(query);
        const detailsMatch = log.details
          ? JSON.stringify(log.details).toLowerCase().includes(query)
          : false;
        if (!messageMatch && !detailsMatch) return false;
      }

      return true;
    });
  }, [logs, logFilter, searchQuery]);

  // Auto-scroll to bottom on new logs
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredLogs, autoScroll]);

  // Handle scroll to detect if user scrolled up
  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isAtBottom);
  };

  const toggleLevel = (level: LogLevel) => {
    const newLevels = new Set(logFilter.levels);
    if (newLevels.has(level)) {
      newLevels.delete(level);
    } else {
      newLevels.add(level);
    }
    setLogFilter({ levels: newLevels });
  };

  const toggleExpanded = (logId: string) => {
    const newExpanded = new Set(expandedLogIds);
    if (newExpanded.has(logId)) {
      newExpanded.delete(logId);
    } else {
      newExpanded.add(logId);
    }
    setExpandedLogIds(newExpanded);
  };

  const handleExport = (type: 'json' | 'support' | 'clipboard') => {
    const loggingService = getLoggingService();

    if (type === 'clipboard') {
      const text = filteredLogs
        .map((log) => `[${formatTimestamp(log.timestamp)}] [${log.level}] [${log.category}] ${log.message}`)
        .join('\n');
      navigator.clipboard.writeText(text);
    } else if (type === 'json') {
      const json = loggingService.exportAsJson();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `unison-editor-logs-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } else if (type === 'support') {
      const exportData = loggingService.exportForSupport();
      const json = JSON.stringify(exportData, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `unison-editor-support-${exportData.metadata.sessionId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }

    setShowExportMenu(false);
  };

  if (isCollapsed) return null;

  const errorCount = logs.filter((l) => l.level === 'error').length;
  const warnCount = logs.filter((l) => l.level === 'warn').length;

  return (
    <div className="log-panel">
      {/* Filter bar */}
      <div className="log-panel-filters">
        <div className="log-level-filters">
          {(['debug', 'info', 'warn', 'error'] as LogLevel[]).map((level) => (
            <button
              key={level}
              className={`log-level-filter ${logFilter.levels.has(level) ? 'active' : ''}`}
              style={{
                borderColor: logFilter.levels.has(level) ? LOG_LEVEL_COLORS[level] : 'transparent',
              }}
              onClick={() => toggleLevel(level)}
              title={`Toggle ${level} logs`}
            >
              {level.charAt(0).toUpperCase()}
              {level === 'error' && errorCount > 0 && (
                <span className="log-count-badge error">{errorCount}</span>
              )}
              {level === 'warn' && warnCount > 0 && (
                <span className="log-count-badge warn">{warnCount}</span>
              )}
            </button>
          ))}
        </div>

        <input
          type="text"
          className="log-search-input"
          placeholder="Search logs..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        <div className="log-panel-actions">
          <div className="log-export-container">
            <button
              className="log-action-btn"
              onClick={() => setShowExportMenu(!showExportMenu)}
              title="Export logs"
            >
              Export
            </button>
            {showExportMenu && (
              <div className="log-export-menu">
                <button onClick={() => handleExport('clipboard')}>
                  Copy to Clipboard
                </button>
                <button onClick={() => handleExport('json')}>
                  Download Full Logs
                </button>
                <button onClick={() => handleExport('support')}>
                  Export for Support
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Log entries */}
      <div
        className="log-panel-entries"
        ref={scrollRef}
        onScroll={handleScroll}
      >
        {filteredLogs.length === 0 ? (
          <div className="log-panel-empty">
            {logs.length === 0
              ? 'No log entries yet. Operations will be logged here.'
              : 'No logs match the current filters.'}
          </div>
        ) : (
          filteredLogs.map((log) => (
            <LogEntryRow
              key={log.id}
              log={log}
              expanded={expandedLogIds.has(log.id)}
              onToggle={() => toggleExpanded(log.id)}
            />
          ))
        )}
      </div>

      {/* Status bar */}
      <div className="log-panel-status">
        <span>
          {filteredLogs.length} of {logs.length} entries
          {errorCount > 0 && ` | ${errorCount} errors`}
          {warnCount > 0 && ` | ${warnCount} warnings`}
        </span>
        {!autoScroll && (
          <button
            className="log-scroll-btn"
            onClick={() => {
              setAutoScroll(true);
              if (scrollRef.current) {
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
              }
            }}
          >
            Scroll to bottom
          </button>
        )}
      </div>
    </div>
  );
}
