import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

interface GeneralTerminalProps {
  isCollapsed: boolean;
}

export interface GeneralTerminalHandle {
  focus: () => void;
}

/**
 * A general-purpose terminal component.
 * Currently displays a placeholder - could be extended to spawn a shell PTY.
 * Exposes focus() via ref for keyboard shortcuts.
 */
export const GeneralTerminal = forwardRef<GeneralTerminalHandle, GeneralTerminalProps>(function GeneralTerminal({ isCollapsed }, ref) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // Expose focus method via ref for keyboard shortcuts
  useImperativeHandle(ref, () => ({
    focus: () => {
      xtermRef.current?.focus();
    },
  }), []);

  // Initialize terminal
  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;

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

    // Show placeholder message
    term.writeln('\x1b[90m--- General Terminal ---\x1b[0m');
    term.writeln('\x1b[90mThis terminal is a placeholder.\x1b[0m');
    term.writeln('\x1b[90mFuture: Connect to system shell (bash/zsh).\x1b[0m');
    term.writeln('');

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
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  // Handle collapse/expand
  useEffect(() => {
    if (!isCollapsed && fitAddonRef.current) {
      // Delay fit to allow layout to settle
      setTimeout(() => {
        fitAddonRef.current?.fit();
      }, 100);
    }
  }, [isCollapsed]);

  // Focus terminal when clicked
  const handleClick = useCallback(() => {
    xtermRef.current?.focus();
  }, []);

  return (
    <div
      className="general-terminal-container"
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
});
