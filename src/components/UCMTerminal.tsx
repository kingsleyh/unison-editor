import { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { getUCMLifecycleService } from '../services/ucmLifecycle';
import '@xterm/xterm/css/xterm.css';

interface UCMTerminalProps {
  isCollapsed: boolean;
}

/**
 * UCMTerminal component - displays the UCM PTY output in an xterm.js terminal.
 *
 * This component does NOT spawn UCM - that's handled by the UCMLifecycleService
 * which is triggered from App.tsx when the workspace is configured. This component
 * only provides the UI for interacting with the already-running UCM process.
 */
export function UCMTerminal({ isCollapsed }: UCMTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const unsubscribeOutputRef = useRef<(() => void) | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

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

    // Create addons
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    // Open terminal in container
    term.open(terminalRef.current);

    // Initial fit
    setTimeout(() => {
      fitAddon.fit();
    }, 0);

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Subscribe to UCM output from the lifecycle service
    unsubscribeOutputRef.current = ucmService.onOutput((data) => {
      term.write(data);
    });

    // Send input to UCM via lifecycle service
    term.onData((data) => {
      ucmService.write(data);
    });

    // Handle resize
    term.onResize(({ rows, cols }) => {
      ucmService.resize(rows, cols);
    });

    // Set up resize observer for container
    const observer = new ResizeObserver(() => {
      if (fitAddonRef.current && !isCollapsed) {
        fitAddonRef.current.fit();
      }
    });
    observer.observe(terminalRef.current);
    resizeObserverRef.current = observer;

    // Cleanup
    return () => {
      if (unsubscribeOutputRef.current) {
        unsubscribeOutputRef.current();
      }
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, []); // No dependencies - terminal connects to service on mount

  // Track previous collapsed state to detect expand
  const wasCollapsedRef = useRef(isCollapsed);
  // Track if we've ever expanded (to send initial clear only once)
  const hasExpandedOnceRef = useRef(false);

  // Handle collapse/expand
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
    }
    wasCollapsedRef.current = isCollapsed;
  }, [isCollapsed]);

  // Focus terminal when clicked
  const handleClick = useCallback(() => {
    xtermRef.current?.focus();
  }, []);

  return (
    <div
      className="ucm-terminal-container"
      onClick={handleClick}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        backgroundColor: '#1e1e1e',
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
