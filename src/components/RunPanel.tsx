/**
 * Run Panel Component
 *
 * Enhanced replacement for RunPane with:
 * - Streaming output display for PTY-based execution (with ANSI color support via xterm.js)
 * - Current task status with elapsed time
 * - Cancel button for running tasks
 * - Task history with re-run capability
 * - Watch/test results display (legacy support)
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { useUnisonStore } from '../store/unisonStore';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { TaskStatus } from '../types/logging';
import { logger } from '../services/loggingService';
import '@xterm/xterm/css/xterm.css';

interface RunPanelProps {
  isCollapsed: boolean;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes > 0) {
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
  return `${seconds}s`;
}

function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const statusConfig = {
    pending: { label: 'Pending', className: 'status-pending' },
    running: { label: 'Running', className: 'status-running' },
    completed: { label: 'Completed', className: 'status-completed' },
    failed: { label: 'Failed', className: 'status-failed' },
    cancelled: { label: 'Cancelled', className: 'status-cancelled' },
  };

  const config = statusConfig[status];
  return <span className={`task-status-badge ${config.className}`}>{config.label}</span>;
}

export function RunPanel({ isCollapsed }: RunPanelProps) {
  const {
    currentTask,
    taskHistory,
    startTask,
    appendTaskOutput,
    completeTask,
    cancelCurrentTask,
  } = useUnisonStore();

  const [elapsedTime, setElapsedTime] = useState(0);
  const [showHistory, setShowHistory] = useState(false);

  // xterm.js refs
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // Timer for elapsed time
  useEffect(() => {
    if (currentTask?.status === 'running') {
      const interval = setInterval(() => {
        setElapsedTime(Date.now() - currentTask.startTime);
      }, 100);
      return () => clearInterval(interval);
    } else {
      setElapsedTime(0);
    }
  }, [currentTask]);

  // Initialize xterm.js terminal for output display (runs once on mount)
  useEffect(() => {
    if (!terminalContainerRef.current || xtermRef.current) return;

    const term = new Terminal({
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#1e1e1e', // Hide cursor (read-only)
        cursorAccent: '#1e1e1e',
        selectionBackground: '#264f78',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#ffffff',
      },
      fontFamily: '"JetBrains Mono", "Fira Code", Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: false,
      cursorStyle: 'underline',
      scrollback: 5000,
      disableStdin: true, // Read-only terminal
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalContainerRef.current);

    // Initial fit
    setTimeout(() => {
      fitAddon.fit();
    }, 0);

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Set up resize observer
    const observer = new ResizeObserver(() => {
      if (fitAddonRef.current) {
        try {
          fitAddonRef.current.fit();
        } catch {
          // Ignore fit errors during resize
        }
      }
    });

    observer.observe(terminalContainerRef.current);
    resizeObserverRef.current = observer;

    return () => {
      observer.disconnect();
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  // Fit terminal when collapsed state changes or task starts
  useEffect(() => {
    if (!isCollapsed && fitAddonRef.current && currentTask) {
      setTimeout(() => {
        fitAddonRef.current?.fit();
      }, 50);
    }
  }, [isCollapsed, currentTask?.id]);

  // Clear and prepare terminal when a new task starts
  useEffect(() => {
    if (currentTask?.status === 'running' && xtermRef.current) {
      xtermRef.current.clear();
    }
  }, [currentTask?.id]);

  // Listen for PTY output when task is running
  useEffect(() => {
    if (!currentTask || currentTask.status !== 'running') return;

    let buffer = '';
    const promptPattern = /\S+\/\S+>\s*$/;

    const unlisten = listen<number[]>('ucm-pty-output', (event) => {
      const bytes = new Uint8Array(event.payload);
      const text = new TextDecoder().decode(bytes);

      // Write to xterm.js for colored display
      if (xtermRef.current) {
        xtermRef.current.write(bytes);
      }

      // Append to task output (for history/logging)
      appendTaskOutput(currentTask.id, text);

      // Check for prompt return (task completion)
      buffer += text;
      if (buffer.length > 500) {
        buffer = buffer.slice(-300);
      }

      // If we see the UCM prompt, the task has completed
      if (promptPattern.test(buffer)) {
        // Check if output contains error indicators
        const hasError = currentTask.output.includes('Error') ||
                        currentTask.output.includes('error:') ||
                        currentTask.output.includes('Exception');

        completeTask(currentTask.id, hasError ? 'failed' : 'completed');
        logger.info('run', `Task completed: ${currentTask.functionName}`, {
          status: hasError ? 'failed' : 'completed',
          duration: Date.now() - currentTask.startTime,
        });
      }
    });

    unlisten.then((fn) => {
      return () => fn();
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [currentTask?.id, currentTask?.status, appendTaskOutput, completeTask]);

  const handleCancel = useCallback(async () => {
    if (!currentTask) return;

    try {
      await invoke('ucm_pty_cancel_task');
      cancelCurrentTask();
      logger.info('run', `Task cancelled: ${currentTask.functionName}`);
    } catch (err) {
      logger.error('run', 'Failed to cancel task', err);
    }
  }, [currentTask, cancelCurrentTask]);

  const handleRerun = useCallback(async (functionName: string) => {
    try {
      const taskId = startTask(functionName);
      logger.info('run', `Starting task: ${functionName}`, { taskId });
      await invoke('ucm_pty_run_task', { functionName });
    } catch (err) {
      logger.error('run', `Failed to start task: ${functionName}`, err);
      completeTask(startTask(functionName), 'failed', String(err));
    }
  }, [startTask, completeTask]);

  if (isCollapsed) return null;

  return (
    <div className="run-panel">
      {/* Current task header */}
      {currentTask && (
        <div className={`run-panel-header ${currentTask.status}`}>
          <div className="run-panel-task-info">
            {currentTask.status === 'running' && (
              <span className="run-panel-spinner" />
            )}
            <span className="run-panel-task-name">
              {currentTask.status === 'running' ? 'Running' : 'Ran'}: {currentTask.functionName}
            </span>
            <TaskStatusBadge status={currentTask.status} />
            {currentTask.status === 'running' && (
              <span className="run-panel-elapsed">{formatDuration(elapsedTime)}</span>
            )}
            {currentTask.endTime && (
              <span className="run-panel-duration">
                ({formatDuration(currentTask.endTime - currentTask.startTime)})
              </span>
            )}
          </div>
          <div className="run-panel-actions">
            {currentTask.status === 'running' && (
              <button
                className="run-panel-cancel-btn"
                onClick={handleCancel}
                title="Cancel (Ctrl+C)"
              >
                Cancel
              </button>
            )}
            {currentTask.status !== 'running' && (
              <button
                className="run-panel-rerun-btn"
                onClick={() => handleRerun(currentTask.functionName)}
                title="Re-run"
              >
                Re-run
              </button>
            )}
          </div>
        </div>
      )}

      {/* Task output - xterm.js terminal (always rendered, hidden when no task) */}
      <div
        className="run-panel-terminal-container"
        style={{ display: currentTask ? 'flex' : 'none' }}
      >
        <div
          ref={terminalContainerRef}
          className="run-panel-terminal"
        />
        {currentTask?.error && (
          <div className="run-panel-error">
            Error: {currentTask.error}
          </div>
        )}
      </div>

      {/* Empty state */}
      {!currentTask && taskHistory.length === 0 && (
        <div className="run-panel-empty">
          No tasks have been run yet. Click the purple play button on an IO function to run it.
        </div>
      )}

      {/* Task history */}
      {taskHistory.length > 0 && (
        <div className="run-panel-history">
          <button
            className="run-panel-history-toggle"
            onClick={() => setShowHistory(!showHistory)}
          >
            {showHistory ? '▼' : '▶'} History ({taskHistory.length})
          </button>
          {showHistory && (
            <div className="run-panel-history-list">
              {taskHistory.map((task) => (
                <div key={task.id} className="run-panel-history-item">
                  <span className="history-item-name">{task.functionName}</span>
                  <TaskStatusBadge status={task.status} />
                  {task.endTime && task.startTime && (
                    <span className="history-item-duration">
                      {formatDuration(task.endTime - task.startTime)}
                    </span>
                  )}
                  <button
                    className="history-item-rerun"
                    onClick={() => handleRerun(task.functionName)}
                    title="Re-run this task"
                  >
                    ▶
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
