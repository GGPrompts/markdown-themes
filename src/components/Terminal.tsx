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

  // Keep callback refs fresh without triggering effect re-runs
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;
  const onInputRef = useRef(onInput);
  onInputRef.current = onInput;
  const isResizingRef = useRef(false);
  const writeQueueRef = useRef<string[]>([]);
  const resizeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resizeCooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastOutputTimeRef = useRef(0);
  const resizeDeferCountRef = useRef(0);
  const [initialized, setInitialized] = useState(false);
  const [fitPending, setFitPending] = useState(false);

  // Input guard: filter device query responses during first 1000ms
  // xterm.js sends DA1/DA2 queries on init; their responses leak into the PTY
  const isInitializingRef = useRef(true);

  // Output guard: buffer all output during first 1000ms, flush at once
  // Prevents partial escape sequences from corrupting display on reconnect
  const isOutputGuardedRef = useRef(true);
  const outputGuardBufferRef = useRef<string[]>([]);
  const outputGuardBytesRef = useRef<Uint8Array[]>([]);

  // Constants for resize/output coordination
  const OUTPUT_QUIET_PERIOD = 500;    // ms after last output before resize is safe
  const MAX_RESIZE_DEFERRALS = 10;    // max retry attempts before aborting resize
  const RESIZE_DEBOUNCE_MS = 150;     // ResizeObserver debounce
  const RESIZE_COOLDOWN_MS = 80;      // keep isResizing=true after fit() completes
  const RESIZE_TRICK_DEBOUNCE_MS = 500; // debounce between resize tricks to prevent redraw storms

  // Resize trick state (tmux two-step SIGWINCH pattern)
  const lastResizeTrickTimeRef = useRef(0);
  const prevDimensionsRef = useRef<{ cols: number; rows: number }>({ cols: 0, rows: 0 });
  const resizeTrickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const postResizeCleanupRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preResizeDimsRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });

  // Safe write that buffers during resize — accepts Uint8Array for proper UTF-8
  const writeQueueBytesRef = useRef<Uint8Array[]>([]);
  const safeWrite = useCallback((data: string | Uint8Array) => {
    lastOutputTimeRef.current = Date.now();

    // Output guard: buffer everything during first 1000ms
    if (isOutputGuardedRef.current) {
      if (data instanceof Uint8Array) {
        outputGuardBytesRef.current.push(data);
      } else {
        outputGuardBufferRef.current.push(data);
      }
      return;
    }

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

  // Two-step resize trick for tmux: shrink by 1 row (SIGWINCH), wait 200ms,
  // then fit to actual size (second SIGWINCH). This forces tmux to fully redraw
  // because tmux ignores resize to the same dimensions.
  const triggerResizeTrick = useCallback(() => {
    if (!xtermRef.current || !fitAddonRef.current) return;

    // Debounce to prevent redraw storms from rapid calls
    const timeSinceLast = Date.now() - lastResizeTrickTimeRef.current;
    if (timeSinceLast < RESIZE_TRICK_DEBOUNCE_MS) {
      return;
    }
    lastResizeTrickTimeRef.current = Date.now();

    const currentCols = xtermRef.current.cols;
    const currentRows = xtermRef.current.rows;

    console.log(`[triggerResizeTrick] ${currentCols}x${currentRows}`);

    // Step 1: Shrink by 1 ROW (sends SIGWINCH via creack/pty).
    // CRITICAL: Use rows, NOT columns! Column changes can cause tmux status bar
    // to wrap when sidebar is narrow, corrupting the terminal display.
    const minRows = Math.max(1, currentRows - 1);
    xtermRef.current.resize(currentCols, minRows);
    onResizeRef.current?.(currentCols, minRows);

    // Step 2: Fit to actual container size after 200ms (tmux processes first SIGWINCH)
    if (resizeTrickTimerRef.current) {
      clearTimeout(resizeTrickTimerRef.current);
    }
    resizeTrickTimerRef.current = setTimeout(() => {
      resizeTrickTimerRef.current = null;
      if (!xtermRef.current || !fitAddonRef.current) return;
      fitAddonRef.current.fit();
      const finalCols = xtermRef.current.cols;
      const finalRows = xtermRef.current.rows;
      onResizeRef.current?.(finalCols, finalRows);

      // Update tracking to prevent redundant sends
      prevDimensionsRef.current = { cols: finalCols, rows: finalRows };
    }, 200);
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
      fontFamily: "'JetBrains Mono NF', 'JetBrains Mono', 'Fira Code NF', 'Fira Code', 'CaskaydiaCove NF', 'Cascadia Code', Menlo, Monaco, monospace",
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

    // Handle input — filter device query responses during init period
    xterm.onData((data) => {
      if (isInitializingRef.current) {
        // DA1 response: ESC [ ? Ps c (Primary Device Attributes)
        // DA2 response: ESC [ > Ps c (Secondary Device Attributes)
        // Filter these out — xterm sends queries on init and responses
        // leak into the PTY, appearing as garbled text in the shell
        const filtered = data
          .replace(/\x1b\[\?[0-9;]*c/g, '')
          .replace(/\x1b\[>[0-9;]*c/g, '');
        if (filtered.length === 0) return;
        onInputRef.current?.(filtered);
        return;
      }
      onInputRef.current?.(data);
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
          onInputRef.current?.(text);
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

    // Input guard: clear after 1000ms — device query responses only arrive during init
    const inputGuardTimer = setTimeout(() => {
      isInitializingRef.current = false;
    }, 1000);

    // Output guard: buffer output for 1000ms, then flush all at once
    // Prevents partial escape sequences from corrupting display when
    // connecting mid-stream (e.g., page refresh during active output)
    const outputGuardTimer = setTimeout(() => {
      isOutputGuardedRef.current = false;

      // Flush buffered string output
      const bufferedStrings = outputGuardBufferRef.current;
      const bufferedBytes = outputGuardBytesRef.current;
      outputGuardBufferRef.current = [];
      outputGuardBytesRef.current = [];

      if (bufferedStrings.length > 0 || bufferedBytes.length > 0) {
        const xt = xtermRef.current;
        if (xt) {
          const joined = bufferedStrings.join('');
          if (joined.length > 0) {
            xt.write(joined);
          }
          for (const chunk of bufferedBytes) {
            xt.write(chunk);
          }
        }
      }

      // Force resize trick after output guard lifts to fix any tmux state
      // (copy mode, scroll regions) that may have been corrupted during reconnect
      if (tmuxManaged) {
        setTimeout(() => triggerResizeTrick(), 100);
      }
    }, 1000);

    return () => {
      clearTimeout(inputGuardTimer);
      clearTimeout(outputGuardTimer);
      if (resizeTrickTimerRef.current) {
        clearTimeout(resizeTrickTimerRef.current);
        resizeTrickTimerRef.current = null;
      }
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
          onResizeRef.current?.(result.cols, result.rows);
        }
        setFitPending(false);
        xtermRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [visible, initialized, fit]);

  // Perform the actual resize, checking for output quiet period first.
  // For tmux sessions, this only fits xterm locally — backend resize is handled
  // by triggerResizeTrick() which sends the two-step SIGWINCH pattern.
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
      // For tmux sessions, do NOT send resize to backend here.
      // Container CSS changes (sidebar resize, split view) should only
      // update xterm locally. The resize trick handles backend communication.
      if (!tmuxManaged) {
        onResizeRef.current?.(xterm.cols, xterm.rows);
      }
    } catch {
      // Ignore fit errors during resize
    }

    // Keep isResizing=true for a cooldown period AFTER fit() completes,
    // so output arriving in the immediate aftermath gets buffered
    resizeCooldownRef.current = setTimeout(() => {
      isResizingRef.current = false;
      resizeCooldownRef.current = null;

      // For tmux: clear write queues (resize trick redraws will handle content).
      // For non-tmux: flush write queues normally.
      if (tmuxManaged) {
        writeQueueRef.current = [];
        writeQueueBytesRef.current = [];
      } else {
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
      }
    }, RESIZE_COOLDOWN_MS);
  }, [tmuxManaged]);

  // ResizeObserver for container dimension changes.
  // For tmux sessions: fits xterm locally, then schedules resize trick after settling.
  // For non-tmux: sends resize directly to backend via doResize.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !initialized) return;

    // Track initial dimensions for significant-change detection
    const rect = container.getBoundingClientRect();
    preResizeDimsRef.current = { width: rect.width, height: rect.height };

    const observer = new ResizeObserver((entries) => {
      if (resizeDebounceRef.current) {
        clearTimeout(resizeDebounceRef.current);
      }

      // Cancel pending post-resize cleanup (will reschedule below)
      if (postResizeCleanupRef.current) {
        clearTimeout(postResizeCleanupRef.current);
        postResizeCleanupRef.current = null;
      }

      // Reset deferral counter on new resize event (fresh sequence)
      resizeDeferCountRef.current = 0;

      const entry = entries[0];
      const newWidth = entry.contentRect.width;
      const newHeight = entry.contentRect.height;

      // Debounced fit (local only for tmux, full resize for non-tmux)
      resizeDebounceRef.current = setTimeout(() => doResize(), RESIZE_DEBOUNCE_MS);

      // For tmux: schedule post-resize cleanup with resize trick
      // Fires 450ms after last resize event (150ms fit + 300ms settle)
      if (tmuxManaged) {
        postResizeCleanupRef.current = setTimeout(() => {
          postResizeCleanupRef.current = null;
          const widthChange = Math.abs(newWidth - preResizeDimsRef.current.width);
          const heightChange = Math.abs(newHeight - preResizeDimsRef.current.height);
          const significantChange = widthChange > 10 || heightChange > 10;

          if (significantChange && newWidth > 0 && newHeight > 0) {
            preResizeDimsRef.current = { width: newWidth, height: newHeight };
            triggerResizeTrick();
          }
        }, 450);
      }
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
      if (postResizeCleanupRef.current) {
        clearTimeout(postResizeCleanupRef.current);
      }
    };
  }, [initialized, doResize, tmuxManaged, triggerResizeTrick]);

  // Window resize events trigger the full resize trick for tmux sessions.
  // Unlike container ResizeObserver (CSS layout shifts), window resize is a
  // deliberate user action that always needs the two-step SIGWINCH pattern.
  useEffect(() => {
    if (!initialized || !tmuxManaged) return;

    let windowResizeTimer: ReturnType<typeof setTimeout> | null = null;

    const handleWindowResize = () => {
      if (windowResizeTimer) {
        clearTimeout(windowResizeTimer);
      }
      // Debounce: fit locally first, then resize trick after settling
      windowResizeTimer = setTimeout(() => {
        windowResizeTimer = null;
        if (!xtermRef.current || !fitAddonRef.current) return;
        try {
          fitAddonRef.current.fit();
        } catch {
          // ignore
        }
        // Trigger resize trick after fit settles
        setTimeout(() => triggerResizeTrick(), 200);
      }, RESIZE_DEBOUNCE_MS);
    };

    window.addEventListener('resize', handleWindowResize);
    return () => {
      window.removeEventListener('resize', handleWindowResize);
      if (windowResizeTimer) {
        clearTimeout(windowResizeTimer);
      }
    };
  }, [initialized, tmuxManaged, triggerResizeTrick]);

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
