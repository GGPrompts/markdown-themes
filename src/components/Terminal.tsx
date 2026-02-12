import { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import '@xterm/xterm/css/xterm.css';

interface TerminalProps {
  terminalId: string;
  visible: boolean;
  /** When true, set xterm scrollback to 0 (tmux manages scrollback with 10K lines). */
  tmuxManaged?: boolean;
  onTitleChange?: (title: string) => void;
  onReady?: (helpers: {
    write: (data: string | Uint8Array) => void;
    fit: () => { cols: number; rows: number } | null;
    focus: () => void;
    clear: () => void;
  }) => void;
  onInput?: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
  fontSize?: number;
}

/** Force all xterm internal elements transparent so --terminal-bg gradient shows through.
 *  xterm.js sets inline backgroundColor on its scrollable-element wrapper,
 *  and xterm.css sets background-color: #000 on .xterm-viewport. */
function forceXtermTransparent(container: HTMLElement) {
  container.querySelectorAll<HTMLElement>('.xterm > div, .xterm-viewport, .xterm-screen').forEach((el) => {
    el.style.setProperty('background-color', 'transparent', 'important');
  });
}

function getXtermTheme() {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string) => s.getPropertyValue(name).trim();
  return {
    background: 'transparent',
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
  tmuxManaged = true,
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
  const resizeCooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastOutputTimeRef = useRef(0);
  const resizeDeferCountRef = useRef(0);
  const [initialized, setInitialized] = useState(false);
  const [fitPending, setFitPending] = useState(false);

  // Constants for resize/output coordination
  const OUTPUT_QUIET_PERIOD = 500;    // ms after last output before resize is safe
  const MAX_RESIZE_DEFERRALS = 10;    // max retry attempts before aborting resize
  const RESIZE_DEBOUNCE_MS = 150;     // ResizeObserver debounce
  const RESIZE_COOLDOWN_MS = 80;      // keep isResizing=true after fit() completes

  // Safe write that buffers during resize — accepts Uint8Array for proper UTF-8
  const writeQueueBytesRef = useRef<Uint8Array[]>([]);
  const safeWrite = useCallback((data: string | Uint8Array) => {
    lastOutputTimeRef.current = Date.now();
    if (isResizingRef.current) {
      if (data instanceof Uint8Array) {
        writeQueueBytesRef.current.push(data);
      } else {
        writeQueueRef.current.push(data);
      }
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
      cols: 80,
      rows: 24,
      cursorBlink: true,
      fontSize,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, monospace",
      theme: getXtermTheme(),
      allowTransparency: true,
      allowProposedApi: true,
      // When tmux manages the terminal, set scrollback to 0 since tmux
      // handles scrollback with 10K lines via .tmux-markdown-themes.conf.
      scrollback: tmuxManaged ? 0 : 10000,
      minimumContrastRatio: 4.5,
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

    // DOM renderer is used (no CanvasAddon) for transparency support.
    // Force xterm's internal elements transparent after it creates its DOM.
    forceXtermTransparent(container);

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

    // Wait for container to have real dimensions before fitting
    let initObserver: ResizeObserver | null = null;
    let initDone = false;

    const tryInitFit = () => {
      if (initDone) return;
      const rect = container.getBoundingClientRect();
      if (rect.width < 50 || rect.height < 50) return; // Not laid out yet

      initDone = true;
      initObserver?.disconnect();

      try {
        fitAddon.fit();
      } catch {
        // ignore
      }

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
    };

    // Try immediately, then observe for layout changes
    tryInitFit();
    if (!initDone) {
      initObserver = new ResizeObserver(tryInitFit);
      initObserver.observe(container);
    }

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
      initObserver?.disconnect();
      try { xterm.dispose(); } catch { /* dispose race in StrictMode */ }
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [terminalId]); // Re-init only on terminalId change

  // Handle visibility changes — re-fit when becoming visible
  useEffect(() => {
    if (visible && initialized) {
      // Hide content until fit completes to prevent flash of stale dimensions
      setFitPending(true);
      // Small delay to let DOM layout update
      const timer = setTimeout(() => {
        const result = fit();
        if (result) {
          onResize?.(result.cols, result.rows);
        }
        setFitPending(false);
        xtermRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [visible, initialized, fit, onResize]);

  // Perform the actual resize, checking for output quiet period first
  const doResize = useCallback(() => {
    if (!xtermRef.current || !fitAddonRef.current) return;

    // Check if output occurred recently — defer resize if so
    const timeSinceOutput = Date.now() - lastOutputTimeRef.current;
    if (timeSinceOutput < OUTPUT_QUIET_PERIOD) {
      if (resizeDeferCountRef.current < MAX_RESIZE_DEFERRALS) {
        resizeDeferCountRef.current++;
        resizeDebounceRef.current = setTimeout(() => doResize(), OUTPUT_QUIET_PERIOD);
        return;
      } else {
        // Abort — continuous output, forcing resize would corrupt terminal
        resizeDeferCountRef.current = 0;
        return;
      }
    }

    // Safe to resize — reset deferral counter
    resizeDeferCountRef.current = 0;
    isResizingRef.current = true;

    // Clear any previous cooldown timer
    if (resizeCooldownRef.current) {
      clearTimeout(resizeCooldownRef.current);
      resizeCooldownRef.current = null;
    }

    try {
      fitAddonRef.current.fit();
      const xterm = xtermRef.current;
      onResize?.(xterm.cols, xterm.rows);
    } catch {
      // Ignore fit errors during resize
    }

    // Keep isResizing=true for a cooldown period AFTER fit() completes,
    // so output arriving in the immediate aftermath gets buffered
    resizeCooldownRef.current = setTimeout(() => {
      isResizingRef.current = false;
      resizeCooldownRef.current = null;

      // Flush write queues via requestAnimationFrame for stability
      const queue = writeQueueRef.current;
      const bytesQueue = writeQueueBytesRef.current;
      writeQueueRef.current = [];
      writeQueueBytesRef.current = [];

      if (queue.length > 0 || bytesQueue.length > 0) {
        requestAnimationFrame(() => {
          const xterm = xtermRef.current;
          if (!xterm) return;
          for (const data of queue) {
            xterm.write(data);
          }
          for (const data of bytesQueue) {
            xterm.write(data);
          }
        });
      }
    }, RESIZE_COOLDOWN_MS);
  }, [onResize]);

  // ResizeObserver for container dimension changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !initialized) return;

    const observer = new ResizeObserver(() => {
      if (resizeDebounceRef.current) {
        clearTimeout(resizeDebounceRef.current);
      }

      // Reset deferral counter on new resize event (fresh sequence)
      resizeDeferCountRef.current = 0;

      resizeDebounceRef.current = setTimeout(() => doResize(), RESIZE_DEBOUNCE_MS);
    });

    observer.observe(container);
    return () => {
      observer.disconnect();
      if (resizeDebounceRef.current) {
        clearTimeout(resizeDebounceRef.current);
      }
      if (resizeCooldownRef.current) {
        clearTimeout(resizeCooldownRef.current);
      }
    };
  }, [initialized, doResize]);

  // Theme updates via MutationObserver on <html> class changes
  useEffect(() => {
    const html = document.documentElement;
    const observer = new MutationObserver(() => {
      if (xtermRef.current) {
        xtermRef.current.options.theme = getXtermTheme();
        // Re-force transparency after xterm re-applies the theme background
        if (containerRef.current) {
          requestAnimationFrame(() => forceXtermTransparent(containerRef.current!));
        }
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
        visibility: fitPending ? 'hidden' : 'visible',
      }}
    />
  );
}
