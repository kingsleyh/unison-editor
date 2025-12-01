/**
 * Run Panel Component
 *
 * Simple panel showing PTY output from running IO functions.
 * Uses xterm.js to display ANSI-colored terminal output.
 * Includes a cancel button to stop long-running tasks.
 */

import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import '@xterm/xterm/css/xterm.css';

interface RunPanelProps {
  isCollapsed: boolean;
}

export interface RunPanelHandle {
  cancel: () => Promise<void>;
  clear: () => void;
}

export const RunPanel = forwardRef<RunPanelHandle, RunPanelProps>(function RunPanel({ isCollapsed }, ref) {
  // xterm.js refs
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

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

  // Fit terminal when collapsed state changes
  useEffect(() => {
    if (!isCollapsed && fitAddonRef.current) {
      setTimeout(() => {
        fitAddonRef.current?.fit();
      }, 50);
    }
  }, [isCollapsed]);

  // Listen for PTY output and write to terminal
  useEffect(() => {
    const unlisten = listen<number[]>('ucm-pty-output', (event) => {
      const bytes = new Uint8Array(event.payload);

      // Write to xterm.js for colored display
      if (xtermRef.current) {
        xtermRef.current.write(bytes);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Cancel running task by sending Ctrl+C to PTY
  const handleCancel = useCallback(async () => {
    try {
      await invoke('ucm_pty_cancel_task');
    } catch (err) {
      console.error('Failed to cancel task:', err);
    }
  }, []);

  // Clear terminal output
  const handleClear = useCallback(() => {
    if (xtermRef.current) {
      xtermRef.current.clear();
    }
  }, []);

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    cancel: handleCancel,
    clear: handleClear,
  }), [handleCancel, handleClear]);

  if (isCollapsed) return null;

  return (
    <div className="run-panel">
      <div className="run-panel-terminal-container">
        <div
          ref={terminalContainerRef}
          className="run-panel-terminal"
        />
      </div>
    </div>
  );
});
