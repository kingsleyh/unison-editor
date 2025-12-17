/**
 * Logging Types
 *
 * Types for the comprehensive logging system that captures
 * all editor operations for debugging and support.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogCategory =
  | 'ucm'      // UCM connection, PTY, lifecycle
  | 'lsp'      // LSP connection, diagnostics
  | 'file'     // File operations (read, write, create, delete)
  | 'run'      // Code execution (typecheck, tests, functions)
  | 'editor'   // Editor operations (tab changes, definition clicks)
  | 'network'  // HTTP requests to UCM API
  | 'system';  // Internal errors, performance

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  category: LogCategory;
  message: string;
  details?: Record<string, unknown>;
  source?: string;      // Component/service name
  duration?: number;    // For timed operations (ms)
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export interface LogFilter {
  levels: Set<LogLevel>;
  categories: Set<LogCategory>;
  searchQuery: string;
}

/**
 * Export format for sharing logs with support
 */
export interface LogExport {
  metadata: {
    exportedAt: string;
    sessionId: string;
    platform: string;
    version: string;
  };
  systemInfo: {
    ucmVersion?: string;
    ucmPorts?: {
      apiPort?: number;
      lspPort?: number;
    };
    workspacePath?: string;  // Will be sanitized
  };
  summary: {
    totalLogs: number;
    errorCount: number;
    warnCount: number;
    timeRange: {
      start: string;
      end: string;
    };
  };
  logs: LogEntry[];
}

/**
 * Default log filter showing info, warn, error levels
 */
export const DEFAULT_LOG_FILTER: LogFilter = {
  levels: new Set(['info', 'warn', 'error']),
  categories: new Set(['ucm', 'lsp', 'file', 'run', 'editor', 'network', 'system']),
  searchQuery: '',
};

/**
 * Log level colors for UI
 */
export const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  debug: 'var(--color-app-foreground-muted)',
  info: 'var(--color-status-info)',
  warn: 'var(--color-status-warning)',
  error: 'var(--color-status-error)',
};

/**
 * Log category icons for UI
 */
export const LOG_CATEGORY_ICONS: Record<LogCategory, string> = {
  ucm: 'U',
  lsp: 'L',
  file: 'F',
  run: 'R',
  editor: 'E',
  network: 'N',
  system: 'S',
};
