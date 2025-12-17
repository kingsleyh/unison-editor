import { useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';
import { Terminal, type ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { getUCMLifecycleService } from '../services/ucmLifecycle';
import { themeService } from '../theme/themeService';
import '@xterm/xterm/css/xterm.css';

interface UCMTerminalProps {
  isCollapsed: boolean;
}

export interface UCMTerminalHandle {
  focus: () => void;
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
 * - Uses default DOM renderer for stability during panel resizing
 * - Debounced resize to prevent rapid fit() calls
 * - Visibility change handling to refresh on tab switch
 * - Proper focus management
 * - Exposes focus() via ref for keyboard shortcuts
 */
export const UCMTerminal = forwardRef<UCMTerminalHandle, UCMTerminalProps>(function UCMTerminal({ isCollapsed }, ref) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const unsubscribeOutputRef = useRef<(() => void) | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // Track previous collapsed state to detect expand
  const wasCollapsedRef = useRef(isCollapsed);
  // Track if we've ever expanded (to send initial clear only once)
  const hasExpandedOnceRef = useRef(false);

  // Expose focus method via ref for keyboard shortcuts
  useImperativeHandle(ref, () => ({
    focus: () => {
      xtermRef.current?.focus();
    },
  }), []);

  // Check if container has valid dimensions for terminal rendering
  const hasValidDimensions = useCallback(() => {
    if (!terminalRef.current) return false;
    const rect = terminalRef.current.getBoundingClientRect();
    // Need at least 50px in each dimension for a meaningful terminal
    return rect.width >= 50 && rect.height >= 50;
  }, []);

  // Debounced resize handler to prevent rapid fit() calls
  const debouncedFit = useMemo(
    () =>
      debounce(() => {
        if (fitAddonRef.current && xtermRef.current && !isCollapsed && hasValidDimensions()) {
          try {
            fitAddonRef.current.fit();
          } catch (e) {
            console.warn('Failed to fit terminal:', e);
          }
        }
      }, 150),
    [isCollapsed, hasValidDimensions]
  );

  // Force a full terminal refresh (useful when display goes blank)
  const forceRefresh = useCallback(() => {
    if (!xtermRef.current || !fitAddonRef.current || isCollapsed) return;
    if (!hasValidDimensions()) return;

    try {
      // Re-fit the terminal
      fitAddonRef.current.fit();
    } catch (e) {
      console.warn('Failed to refresh terminal:', e);
    }
  }, [isCollapsed, hasValidDimensions]);

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

    // Get initial theme from themeService
    const activeTheme = themeService.getActiveTheme();

    // Create terminal instance
    const term = new Terminal({
      theme: themeService.getTerminalTheme() as ITheme,
      fontFamily: activeTheme.fonts.terminalFontFamily,
      fontSize: activeTheme.fonts.terminalFontSize,
      lineHeight: activeTheme.fonts.terminalLineHeight,
      fontWeight: String(activeTheme.fonts.terminalFontWeight) as 'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900',
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

    // Set up resize observer - only observe the terminal container itself
    // Track last known good size to avoid unnecessary fits
    let lastWidth = 0;
    let lastHeight = 0;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        // Only trigger fit if size is valid and changed significantly (>10px)
        if (width >= 50 && height >= 50) {
          const widthDiff = Math.abs(width - lastWidth);
          const heightDiff = Math.abs(height - lastHeight);
          if (widthDiff > 10 || heightDiff > 10) {
            lastWidth = width;
            lastHeight = height;
            debouncedFit();
          }
        }
      }
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
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [debouncedFit]);

  // Subscribe to theme changes
  useEffect(() => {
    const unsubscribe = themeService.onThemeChange((event) => {
      const term = xtermRef.current;
      if (term) {
        const newTheme = event.newTheme;
        term.options.theme = themeService.generateTerminalThemeData(newTheme) as ITheme;
        term.options.fontFamily = newTheme.fonts.terminalFontFamily;
        term.options.fontSize = newTheme.fonts.terminalFontSize;
        term.options.lineHeight = newTheme.fonts.terminalLineHeight;
        // Trigger a re-render
        term.refresh(0, term.rows - 1);
        // Refit to account for potential font size changes
        fitAddonRef.current?.fit();
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Handle visibility changes (browser tab switch, window minimize)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && xtermRef.current && !isCollapsed) {
        // Refresh terminal display when becoming visible - use longer delay
        setTimeout(() => {
          forceRefresh();
        }, 200);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isCollapsed, forceRefresh]);

  // Handle collapse/expand with proper refresh
  useEffect(() => {
    if (!isCollapsed && fitAddonRef.current) {
      // Delay fit to allow layout to fully settle
      setTimeout(() => {
        forceRefresh();
      }, 250);

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
  }, [isCollapsed, forceRefresh]);

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
        backgroundColor: 'var(--color-panel-background)',
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
});
