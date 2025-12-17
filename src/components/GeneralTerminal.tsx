import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Terminal, type ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { themeService } from '../theme/themeService';
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
        backgroundColor: 'var(--color-panel-background)',
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
