import { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { CanvasAddon } from '@xterm/addon-canvas';
import '@xterm/xterm/css/xterm.css';

interface TerminalProps {
  terminalId: string;
  visible: boolean;
  onTitleChange?: (title: string) => void;
  onReady?: (helpers: {
    write: (data: string) => void;
    fit: () => { cols: number; rows: number } | null;
    focus: () => void;
    clear: () => void;
  }) => void;
  onInput?: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
  fontSize?: number;
}

function getXtermTheme() {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string) => s.getPropertyValue(name).trim();
  return {
    background: v('--bg-secondary') || '#1a1a2e',
    foreground: v('--text-primary') || '#e0e0e0',
    cursor: v('--accent') || '#64ffda',
    cursorAccent: v('--bg-secondary') || '#1a1a2e',
    selectionBackground: (v('--accent') || '#64ffda') + '40',
    selectionForeground: undefined,
    // ANSI colors — sensible defaults
    black: '#282a36',
    red: '#ff5555',
    green: '#50fa7b',
    yellow: '#f1fa8c',
    blue: '#6272a4',
    magenta: '#ff79c6',
    cyan: '#8be9fd',
    white: '#f8f8f2',
    brightBlack: '#6272a4',
    brightRed: '#ff6e6e',
    brightGreen: '#69ff94',
    brightYellow: '#ffffa5',
    brightBlue: '#d6acff',
    brightMagenta: '#ff92df',
    brightCyan: '#a4ffff',
    brightWhite: '#ffffff',
  };
}

export function Terminal({
  terminalId,
  visible,
  onTitleChange,
  onReady,
  onInput,
  onResize,
  fontSize = 14,
}: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const isResizingRef = useRef(false);
  const writeQueueRef = useRef<string[]>([]);
  const resizeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Safe write that buffers during resize
  const safeWrite = useCallback((data: string) => {
    if (isResizingRef.current) {
      writeQueueRef.current.push(data);
    } else if (xtermRef.current) {
      xtermRef.current.write(data);
    }
  }, []);

  // Fit terminal to container
  const fit = useCallback(() => {
    const fitAddon = fitAddonRef.current;
    const xterm = xtermRef.current;
    if (!fitAddon || !xterm || !containerRef.current) return null;

    try {
      fitAddon.fit();
      return { cols: xterm.cols, rows: xterm.rows };
    } catch {
      return null;
    }
  }, []);

  // Initialize xterm
  useEffect(() => {
    const container = containerRef.current;
    if (!container || xtermRef.current) return;

    const xterm = new XTerm({
      cursorBlink: true,
      fontSize,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, monospace",
      theme: getXtermTheme(),
      allowTransparency: true,
      scrollback: 10000,
      minimumContrastRatio: 4.5,
      convertEol: true,
    });

    const fitAddon = new FitAddon();

    // Load addons in correct order
    xterm.loadAddon(fitAddon);
    xterm.loadAddon(new WebLinksAddon());
    const unicode11 = new Unicode11Addon();
    xterm.loadAddon(unicode11);

    // Open terminal in container
    xterm.open(container);
    xterm.unicode.activeVersion = '11';

    // Load canvas renderer after open()
    try {
      xterm.loadAddon(new CanvasAddon());
    } catch {
      // Falls back to DOM renderer
    }

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // Handle input
    xterm.onData((data) => {
      onInput?.(data);
    });

    // Handle title changes
    xterm.onTitleChange((title) => {
      onTitleChange?.(title);
    });

    // Multiple fit passes to catch layout shifts
    const fitPasses = [0, 100, 300];
    const timers = fitPasses.map((delay) =>
      setTimeout(() => {
        try {
          fitAddon.fit();
          if (delay === fitPasses[fitPasses.length - 1]) {
            setInitialized(true);
            onReady?.({
              write: safeWrite,
              fit: () => {
                try {
                  fitAddon.fit();
                  return { cols: xterm.cols, rows: xterm.rows };
                } catch {
                  return null;
                }
              },
              focus: () => xterm.focus(),
              clear: () => xterm.clear(),
            });
          }
        } catch {
          // Container might not have dimensions yet
        }
      }, delay)
    );

    // Handle keyboard shortcuts
    xterm.attachCustomKeyEventHandler((e) => {
      // Ctrl+Shift+C — copy
      if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        const selection = xterm.getSelection();
        if (selection) {
          navigator.clipboard.writeText(selection);
        }
        return false;
      }
      // Ctrl+Shift+V — paste
      if (e.ctrlKey && e.shiftKey && e.key === 'V') {
        navigator.clipboard.readText().then((text) => {
          onInput?.(text);
        });
        return false;
      }
      // Ctrl + = / - / 0 — font size (let parent handle)
      if (e.ctrlKey && (e.key === '=' || e.key === '-' || e.key === '0')) {
        return false;
      }
      // Allow all other keys through to the terminal
      return true;
    });

    return () => {
      timers.forEach(clearTimeout);
      xterm.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [terminalId]); // Re-init only on terminalId change

  // Handle visibility changes — re-fit when becoming visible
  useEffect(() => {
    if (visible && initialized) {
      // Small delay to let DOM layout update
      const timer = setTimeout(() => {
        const result = fit();
        if (result) {
          onResize?.(result.cols, result.rows);
        }
        xtermRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [visible, initialized, fit, onResize]);

  // ResizeObserver for container dimension changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !initialized) return;

    const observer = new ResizeObserver(() => {
      if (resizeDebounceRef.current) {
        clearTimeout(resizeDebounceRef.current);
      }
      resizeDebounceRef.current = setTimeout(() => {
        if (!xtermRef.current || !fitAddonRef.current) return;

        isResizingRef.current = true;
        try {
          fitAddonRef.current.fit();
          const xterm = xtermRef.current;
          onResize?.(xterm.cols, xterm.rows);
        } catch {
          // Ignore fit errors during resize
        }
        isResizingRef.current = false;

        // Flush write queue
        const queue = writeQueueRef.current;
        writeQueueRef.current = [];
        for (const data of queue) {
          xtermRef.current?.write(data);
        }
      }, 100);
    });

    observer.observe(container);
    return () => {
      observer.disconnect();
      if (resizeDebounceRef.current) {
        clearTimeout(resizeDebounceRef.current);
      }
    };
  }, [initialized, onResize]);

  // Theme updates via MutationObserver on <html> class changes
  useEffect(() => {
    const html = document.documentElement;
    const observer = new MutationObserver(() => {
      if (xtermRef.current) {
        xtermRef.current.options.theme = getXtermTheme();
      }
    });
    observer.observe(html, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Font size changes
  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.fontSize = fontSize;
      fitAddonRef.current?.fit();
    }
  }, [fontSize]);

  return (
    <div
      ref={containerRef}
      className="terminal-container"
      style={{
        width: '100%',
        height: '100%',
        display: visible ? 'block' : 'none',
      }}
    />
  );
}
