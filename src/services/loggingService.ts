/**
 * Logging Service
 *
 * Centralized logging service that captures all editor operations
 * for debugging and support. Uses a ring buffer to prevent memory
 * issues with long sessions.
 */

import type {
  LogLevel,
  LogCategory,
  LogEntry,
  LogFilter,
  LogExport,
} from '../types/logging';

const MAX_LOGS = 5000;

type LogListener = (entry: LogEntry) => void;

class LoggingService {
  private logs: LogEntry[] = [];
  private listeners: Set<LogListener> = new Set();
  private sessionId: string;

  constructor() {
    this.sessionId = this.generateSessionId();
  }

  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateLogId(): string {
    return `log-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  }

  private addLog(entry: Omit<LogEntry, 'id' | 'timestamp'>): LogEntry {
    const fullEntry: LogEntry = {
      ...entry,
      id: this.generateLogId(),
      timestamp: Date.now(),
    };

    // Ring buffer - remove oldest if at max
    if (this.logs.length >= MAX_LOGS) {
      this.logs.shift();
    }

    this.logs.push(fullEntry);

    // Notify listeners
    this.listeners.forEach((listener) => {
      try {
        listener(fullEntry);
      } catch (err) {
        console.error('[LoggingService] Listener error:', err);
      }
    });

    // Also log to console in development
    if (import.meta.env.DEV) {
      const consoleMethod = entry.level === 'error' ? 'error' :
                           entry.level === 'warn' ? 'warn' :
                           entry.level === 'debug' ? 'debug' : 'log';
      console[consoleMethod](
        `[${entry.category}] ${entry.message}`,
        entry.details || ''
      );
    }

    return fullEntry;
  }

  /**
   * Log a debug message (hidden by default in UI)
   */
  debug(category: LogCategory, message: string, details?: Record<string, unknown>, source?: string): LogEntry {
    return this.addLog({ level: 'debug', category, message, details, source });
  }

  /**
   * Log an info message
   */
  info(category: LogCategory, message: string, details?: Record<string, unknown>, source?: string): LogEntry {
    return this.addLog({ level: 'info', category, message, details, source });
  }

  /**
   * Log a warning
   */
  warn(category: LogCategory, message: string, details?: Record<string, unknown>, source?: string): LogEntry {
    return this.addLog({ level: 'warn', category, message, details, source });
  }

  /**
   * Log an error
   */
  error(
    category: LogCategory,
    message: string,
    error?: Error | unknown,
    details?: Record<string, unknown>,
    source?: string
  ): LogEntry {
    const errorInfo = error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : error
        ? { name: 'Error', message: String(error) }
        : undefined;

    return this.addLog({
      level: 'error',
      category,
      message,
      details,
      source,
      error: errorInfo,
    });
  }

  /**
   * Start a timed operation. Returns an object with complete() and fail() methods.
   * Usage:
   *   const op = logger.startOperation('run', 'Typechecking code');
   *   try {
   *     // ... do work ...
   *     op.complete({ resultCount: 5 }); // Logs completion with duration
   *   } catch (err) {
   *     op.fail(err); // Logs failure with error
   *   }
   */
  startOperation(
    category: LogCategory,
    message: string,
    details?: Record<string, unknown>,
    source?: string
  ): { complete: (resultDetails?: Record<string, unknown>) => void; fail: (error?: unknown) => void } {
    const startTime = Date.now();
    this.addLog({ level: 'info', category, message: `Starting: ${message}`, details, source });

    const finish = (success: boolean, resultDetails?: Record<string, unknown>, error?: unknown) => {
      const duration = Date.now() - startTime;
      const level: LogLevel = success ? 'info' : 'error';
      const status = success ? 'Completed' : 'Failed';

      const errorInfo = error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : error
          ? { name: 'Error', message: String(error) }
          : undefined;

      this.addLog({
        level,
        category,
        message: `${status}: ${message}`,
        details: { ...details, ...resultDetails },
        source,
        duration,
        error: errorInfo,
      });
    };

    return {
      complete: (resultDetails?: Record<string, unknown>) => finish(true, resultDetails),
      fail: (error?: unknown) => finish(false, undefined, error),
    };
  }

  /**
   * Subscribe to log entries in real-time
   */
  onLog(callback: LogListener): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Get all logs, optionally filtered
   */
  getLogs(filter?: LogFilter): LogEntry[] {
    if (!filter) {
      return [...this.logs];
    }

    return this.logs.filter((log) => {
      // Level filter
      if (!filter.levels.has(log.level)) {
        return false;
      }

      // Category filter
      if (!filter.categories.has(log.category)) {
        return false;
      }

      // Search filter
      if (filter.searchQuery) {
        const query = filter.searchQuery.toLowerCase();
        const messageMatch = log.message.toLowerCase().includes(query);
        const detailsMatch = log.details
          ? JSON.stringify(log.details).toLowerCase().includes(query)
          : false;
        if (!messageMatch && !detailsMatch) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Clear all logs
   */
  clear(): void {
    this.logs = [];
    // Notify listeners of clear (empty log)
    this.listeners.forEach((listener) => {
      try {
        listener({
          id: 'clear',
          timestamp: Date.now(),
          level: 'info',
          category: 'system',
          message: 'Logs cleared',
        });
      } catch (err) {
        console.error('[LoggingService] Listener error:', err);
      }
    });
  }

  /**
   * Export logs for support (sanitized)
   */
  exportForSupport(filter?: LogFilter): LogExport {
    const logs = this.getLogs(filter);

    // Sanitize paths in logs
    const sanitizedLogs = logs.map((log) => ({
      ...log,
      message: this.sanitizePaths(log.message),
      details: log.details ? this.sanitizeObject(log.details) : undefined,
      error: log.error
        ? {
            ...log.error,
            message: this.sanitizePaths(log.error.message),
            stack: log.error.stack ? this.sanitizePaths(log.error.stack) : undefined,
          }
        : undefined,
    }));

    const errorCount = logs.filter((l) => l.level === 'error').length;
    const warnCount = logs.filter((l) => l.level === 'warn').length;

    const timestamps = logs.map((l) => l.timestamp);
    const minTime = timestamps.length > 0 ? Math.min(...timestamps) : Date.now();
    const maxTime = timestamps.length > 0 ? Math.max(...timestamps) : Date.now();

    return {
      metadata: {
        exportedAt: new Date().toISOString(),
        sessionId: this.sessionId,
        platform: navigator.platform,
        version: '0.1.0', // TODO: Get from package.json
      },
      systemInfo: {
        // These will be filled in by the caller if available
      },
      summary: {
        totalLogs: logs.length,
        errorCount,
        warnCount,
        timeRange: {
          start: new Date(minTime).toISOString(),
          end: new Date(maxTime).toISOString(),
        },
      },
      logs: sanitizedLogs,
    };
  }

  /**
   * Export logs as JSON string
   */
  exportAsJson(filter?: LogFilter): string {
    const exportData = this.exportForSupport(filter);
    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Sanitize file paths to protect user privacy
   */
  private sanitizePaths(text: string): string {
    // Replace home directory paths
    const homePattern = /\/Users\/[^\/\s]+/g;
    let sanitized = text.replace(homePattern, '<user>');

    // Replace Windows paths
    const windowsPattern = /C:\\Users\\[^\\]+/gi;
    sanitized = sanitized.replace(windowsPattern, '<user>');

    return sanitized;
  }

  /**
   * Recursively sanitize an object
   */
  private sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        result[key] = this.sanitizePaths(value);
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.sanitizeObject(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Get log count
   */
  getLogCount(): number {
    return this.logs.length;
  }
}

// Singleton instance
let instance: LoggingService | null = null;

export function getLoggingService(): LoggingService {
  if (!instance) {
    instance = new LoggingService();
  }
  return instance;
}

// Convenience export for direct imports
export const logger = {
  debug: (category: LogCategory, message: string, details?: Record<string, unknown>, source?: string) =>
    getLoggingService().debug(category, message, details, source),
  info: (category: LogCategory, message: string, details?: Record<string, unknown>, source?: string) =>
    getLoggingService().info(category, message, details, source),
  warn: (category: LogCategory, message: string, details?: Record<string, unknown>, source?: string) =>
    getLoggingService().warn(category, message, details, source),
  error: (category: LogCategory, message: string, error?: Error | unknown, details?: Record<string, unknown>, source?: string) =>
    getLoggingService().error(category, message, error, details, source),
  startOperation: (category: LogCategory, message: string, details?: Record<string, unknown>, source?: string) =>
    getLoggingService().startOperation(category, message, details, source),
};
