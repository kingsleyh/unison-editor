import { useEffect, useRef, useCallback, useMemo } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import { CanvasAddon } from '@xterm/addon-canvas';
import { getUCMLifecycleService } from '../services/ucmLifecycle';
import '@xterm/xterm/css/xterm.css';

interface UCMTerminalProps {
  isCollapsed: boolean;
}

// Debounce utility
function debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number): T {
  let timeoutId: ReturnType<typeof setTimeout>;
  return ((...args: unknown[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  }) as T;
}

/**
 * UCMTerminal component - displays the UCM PTY output in an xterm.js terminal.
 *
 * This component does NOT spawn UCM - that's handled by the UCMLifecycleService
 * which is triggered from App.tsx when the workspace is configured. This component
 * only provides the UI for interacting with the already-running UCM process.
 *
 * Features:
 * - WebGL renderer with automatic canvas fallback on context loss
 * - Debounced resize to prevent rapid fit() calls
 * - Visibility change handling to refresh on tab switch
 * - Proper focus management
 */
export function UCMTerminal({ isCollapsed }: UCMTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const webglAddonRef = useRef<WebglAddon | null>(null);
  const canvasAddonRef = useRef<CanvasAddon | null>(null);
  const rendererTypeRef = useRef<'webgl' | 'canvas'>('webgl');
  const unsubscribeOutputRef = useRef<(() => void) | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // Track previous collapsed state to detect expand
  const wasCollapsedRef = useRef(isCollapsed);
  // Track if we've ever expanded (to send initial clear only once)
  const hasExpandedOnceRef = useRef(false);

  // Load renderer with WebGL fallback to canvas
  const loadRenderer = useCallback((term: Terminal) => {
    // Try WebGL first for better performance
    if (rendererTypeRef.current === 'webgl') {
      try {
        const webglAddon = new WebglAddon();

        // Handle WebGL context loss - fall back to canvas
        webglAddon.onContextLoss(() => {
          console.warn('WebGL context lost, falling back to canvas renderer');
          webglAddon.dispose();
          webglAddonRef.current = null;
          rendererTypeRef.current = 'canvas';
          loadRenderer(term);
        });

        term.loadAddon(webglAddon);
        webglAddonRef.current = webglAddon;
        console.log('UCM Terminal: Using WebGL renderer');
        return;
      } catch (e) {
        console.warn('WebGL not available, using canvas renderer:', e);
        rendererTypeRef.current = 'canvas';
      }
    }

    // Fallback to canvas renderer
    try {
      const canvasAddon = new CanvasAddon();
      term.loadAddon(canvasAddon);
      canvasAddonRef.current = canvasAddon;
      console.log('UCM Terminal: Using Canvas renderer');
    } catch (e) {
      console.warn('Canvas addon failed to load, using default renderer:', e);
    }
  }, []);

  // Debounced resize handler to prevent rapid fit() calls
  const debouncedFit = useMemo(
    () =>
      debounce(() => {
        if (fitAddonRef.current && xtermRef.current && !isCollapsed) {
          try {
            fitAddonRef.current.fit();
          } catch (e) {
            console.warn('Failed to fit terminal:', e);
          }
        }
      }, 100),
    [isCollapsed]
  );

  // Track input buffer to intercept 'exit' command
  const inputBufferRef = useRef<string>('');

  // Write batching for high-volume output (prevents xterm.js from being overwhelmed)
  const writeBufferRef = useRef<Uint8Array[]>([]);
  const writeScheduledRef = useRef<number | null>(null);

  // Handle unexpected UCM termination (crashes, external kills)
  useEffect(() => {
    const ucmService = getUCMLifecycleService();

    const unsubscribe = ucmService.onStatusChange((status) => {
      if (status === 'stopped' && xtermRef.current) {
        // UCM stopped unexpectedly - show restart message
        xtermRef.current.writeln('\r\n\x1b[31m[UCM process terminated unexpectedly]\x1b[0m');
        xtermRef.current.writeln('\x1b[33mPress Enter to restart UCM...\x1b[0m');
        inputBufferRef.current = '__RESTART_UCM__';
      }
    });

    return () => unsubscribe();
  }, []);

  // Initialize terminal UI (connects to already-running UCM via lifecycle service)
  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;

    const ucmService = getUCMLifecycleService();

    // Create terminal instance
    const term = new Terminal({
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
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
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 10000,
      allowProposedApi: true,
    });

    // Create fit addon first (needed before opening)
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    // Open terminal in container
    term.open(terminalRef.current);

    // Load WebGL/Canvas renderer
    loadRenderer(term);

    // Initial fit with delay for layout to settle
    setTimeout(() => {
      fitAddon.fit();
    }, 0);

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Subscribe to UCM output from the lifecycle service with write batching
    // This prevents xterm.js from being overwhelmed during high-volume output (e.g., run commands)
    unsubscribeOutputRef.current = ucmService.onOutput((data) => {
      writeBufferRef.current.push(data);

      // Schedule a batched write if not already scheduled
      if (writeScheduledRef.current === null) {
        writeScheduledRef.current = requestAnimationFrame(() => {
          writeScheduledRef.current = null;

          if (writeBufferRef.current.length === 0) return;

          // Combine all buffered data into one write
          const totalLength = writeBufferRef.current.reduce((sum, arr) => sum + arr.length, 0);
          const combined = new Uint8Array(totalLength);
          let offset = 0;
          for (const chunk of writeBufferRef.current) {
            combined.set(chunk, offset);
            offset += chunk.length;
          }
          writeBufferRef.current = [];

          // Single write to xterm
          term.write(combined);
        });
      }
    });

    // Send input to UCM via lifecycle service, but intercept 'exit' command
    term.onData((data) => {
      // Handle special characters
      if (data === '\r' || data === '\n') {
        // Check if we need to restart UCM after unexpected termination
        if (inputBufferRef.current === '__RESTART_UCM__') {
          inputBufferRef.current = '';
          term.writeln('\r\n\x1b[36mRestarting UCM...\x1b[0m');
          ucmService.restart().then((success) => {
            if (!success) {
              term.writeln('\x1b[31mFailed to restart UCM. Please restart the application.\x1b[0m');
            }
          });
          return;
        }

        // Enter pressed - check if command is 'exit'
        const command = inputBufferRef.current.trim().toLowerCase();
        if (command === 'exit' || command === 'quit' || command === ':q') {
          // Block exit command and show message
          term.writeln('');
          term.writeln('\x1b[33mThe exit command is disabled. UCM is required for editor operations.\x1b[0m');
          term.writeln('\x1b[33mUse the window controls to close the application instead.\x1b[0m');
          // Send Ctrl+C to cancel the current line and get a fresh prompt
          ucmService.write('\x03');
          inputBufferRef.current = '';
          return;
        }
        inputBufferRef.current = '';
        ucmService.write(data);
      } else if (data === '\x7f' || data === '\b') {
        // Backspace - remove last character from buffer
        inputBufferRef.current = inputBufferRef.current.slice(0, -1);
        ucmService.write(data);
      } else if (data === '\x03') {
        // Ctrl+C - clear buffer
        inputBufferRef.current = '';
        ucmService.write(data);
      } else if (data === '\x04') {
        // Ctrl+D (EOF) - block it to prevent UCM exit
        term.writeln('');
        term.writeln('\x1b[33mCtrl+D is disabled. UCM is required for editor operations.\x1b[0m');
        return;
      } else if (data === '\x15') {
        // Ctrl+U - clear line
        inputBufferRef.current = '';
        ucmService.write(data);
      } else {
        // Regular character - add to buffer (unless in restart mode)
        if (inputBufferRef.current === '__RESTART_UCM__') {
          // Ignore input while waiting for restart
          return;
        }
        inputBufferRef.current += data;
        ucmService.write(data);
      }
    });

    // Handle resize - send to backend
    term.onResize(({ rows, cols }) => {
      ucmService.resize(rows, cols);
    });

    // Set up debounced resize observer for container
    const observer = new ResizeObserver(() => {
      debouncedFit();
    });
    observer.observe(terminalRef.current);
    resizeObserverRef.current = observer;

    // Cleanup
    return () => {
      if (unsubscribeOutputRef.current) {
        unsubscribeOutputRef.current();
      }
      if (writeScheduledRef.current !== null) {
        cancelAnimationFrame(writeScheduledRef.current);
        writeScheduledRef.current = null;
      }
      writeBufferRef.current = [];
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
      if (webglAddonRef.current) {
        webglAddonRef.current.dispose();
      }
      if (canvasAddonRef.current) {
        canvasAddonRef.current.dispose();
      }
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
      webglAddonRef.current = null;
      canvasAddonRef.current = null;
    };
  }, [loadRenderer, debouncedFit]);

  // Handle visibility changes (browser tab switch, window minimize)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && xtermRef.current && !isCollapsed) {
        // Refresh terminal display when becoming visible
        setTimeout(() => {
          if (xtermRef.current) {
            xtermRef.current.refresh(0, xtermRef.current.rows - 1);
            fitAddonRef.current?.fit();
          }
        }, 50);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isCollapsed]);

  // Handle collapse/expand with proper refresh
  useEffect(() => {
    if (!isCollapsed && fitAddonRef.current) {
      // Delay fit to allow layout to settle
      setTimeout(() => {
        fitAddonRef.current?.fit();
        // Refresh the terminal to ensure proper display
        xtermRef.current?.refresh(0, xtermRef.current.rows - 1);
      }, 100);

      // On first expand, send 'clear' command to UCM to display a fresh prompt
      // This handles the case where UCM started while panel was collapsed
      if (!hasExpandedOnceRef.current) {
        hasExpandedOnceRef.current = true;
        setTimeout(() => {
          getUCMLifecycleService().write('clear\n');
        }, 200);
      }

      // Auto-focus when expanded
      setTimeout(() => {
        xtermRef.current?.focus();
      }, 150);
    }
    wasCollapsedRef.current = isCollapsed;
  }, [isCollapsed]);

  // Focus terminal when clicked or focused
  const handleFocus = useCallback(() => {
    xtermRef.current?.focus();
  }, []);

  return (
    <div
      className="ucm-terminal-container"
      onClick={handleFocus}
      onFocus={handleFocus}
      tabIndex={0}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        backgroundColor: '#1e1e1e',
        outline: 'none',
      }}
    >
      <div
        ref={terminalRef}
        style={{
          width: '100%',
          height: '100%',
        }}
      />
    </div>
  );
}
