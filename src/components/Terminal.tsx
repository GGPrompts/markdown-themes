import { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { CanvasAddon } from '@xterm/addon-canvas';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { terminalPalettes, buildXtermTheme } from '../lib/terminalThemes';
import type { ThemeId } from '../themes';
import '@xterm/xterm/css/xterm.css';

interface TerminalProps {
  terminalId: string;
  visible: boolean;
  /** When true, set xterm scrollback to 0 (tmux manages scrollback with 10K lines). */
  tmuxManaged?: boolean;
  /** App theme ID — drives terminal ANSI color palette. */
  themeId?: ThemeId;
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
  fontFamily?: string;
}

/** Force all xterm internal elements transparent so --terminal-bg gradient shows through.
 *  xterm.js sets inline backgroundColor on its scrollable-element wrapper,
 *  and xterm.css sets background-color: #000 on .xterm-viewport. */
function forceXtermTransparent(container: HTMLElement) {
  container.querySelectorAll<HTMLElement>('.xterm > div, .xterm-viewport, .xterm-screen').forEach((el) => {
    el.style.setProperty('background-color', 'transparent', 'important');
  });
}

function getXtermTheme(themeId?: ThemeId) {
  const palette = terminalPalettes[themeId || 'default'] ?? terminalPalettes['default'];
  return buildXtermTheme(palette);
}

const DEFAULT_FONT_FAMILY = "'JetBrains Mono NF', 'JetBrains Mono', 'Fira Code NF', 'Fira Code', 'CaskaydiaCove NF', 'Cascadia Code', Menlo, Monaco, monospace";

export function Terminal({
  terminalId,
  visible,
  tmuxManaged = true,
  themeId,
  onTitleChange,
  onReady,
  onInput,
  onResize,
  fontSize = 14,
  fontFamily,
}: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const canvasAddonRef = useRef<CanvasAddon | null>(null);

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
  const RESIZE_COOLDOWN_MS = 50;      // keep isResizing=true after fit() completes
  const RESIZE_TRICK_DEBOUNCE_MS = 500; // debounce between resize tricks to prevent redraw storms

  // Resize trick state (tmux two-step SIGWINCH pattern)
  const lastResizeTrickTimeRef = useRef(0);
  const prevDimensionsRef = useRef<{ cols: number; rows: number }>({ cols: 0, rows: 0 });
  const resizeTrickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const postResizeCleanupRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preResizeDimsRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });

  // 3-phase init fit timers (cleaned up on unmount)
  const initPhaseTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

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

  // Initialize xterm. Parent uses visibility:hidden (not display:none) for
  // inactive tabs, so containers always have real dimensions and xterm.open()
  // can be called immediately on mount.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || xtermRef.current) return;

    const xterm = new XTerm({
      cols: 80,
      rows: 24,
      cursorBlink: true,
      fontSize,
      fontFamily: fontFamily || DEFAULT_FONT_FAMILY,
      theme: getXtermTheme(themeId),
      allowTransparency: true,
      allowProposedApi: true,
      scrollback: tmuxManaged ? 0 : 10000,
      minimumContrastRatio: 4.5,
    });

    const fitAddon = new FitAddon();

    xterm.loadAddon(fitAddon);
    xterm.loadAddon(new WebLinksAddon());
    const unicode11 = new Unicode11Addon();
    xterm.loadAddon(unicode11);

    // Open terminal in container
    xterm.open(container);
    xterm.unicode.activeVersion = '11';

    // Canvas renderer for GPU-accelerated rendering with transparency
    const canvasAddon = new CanvasAddon();
    xterm.loadAddon(canvasAddon);
    canvasAddonRef.current = canvasAddon;

    forceXtermTransparent(container);

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // Handle input — filter device query responses during init period
    xterm.onData((data) => {
      if (isInitializingRef.current) {
        const filtered = data
          .replace(/\x1b\[\?[0-9;]*c/g, '')
          .replace(/\x1b\[>[0-9;]*c/g, '');
        if (filtered.length === 0) return;
        onInputRef.current?.(filtered);
        return;
      }
      onInputRef.current?.(data);
    });

    xterm.onTitleChange((title) => {
      onTitleChange?.(title);
    });

    xterm.attachCustomKeyEventHandler((e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        const selection = xterm.getSelection();
        if (selection) {
          navigator.clipboard.writeText(selection);
        }
        return false;
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'V') {
        navigator.clipboard.readText().then((text) => {
          onInputRef.current?.(text);
        });
        return false;
      }
      if (e.ctrlKey && (e.key === '=' || e.key === '-' || e.key === '0')) {
        return false;
      }
      return true;
    });

    // 3-phase init fit matching TabzChrome's proven sequence.
    // Phase 1 (0ms): local fit only, do NOT send resize to backend
    try {
      fitAddon.fit();
    } catch { /* ignore */ }

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

    // Phase 2 (100ms): catch layout shifts, still no backend send
    const phase2Timer = setTimeout(() => {
      try {
        fitAddon.fit();
      } catch { /* ignore */ }
    }, 100);

    // Phase 3 (300ms): fit + send initial dims to backend
    const phase3Timer = setTimeout(() => {
      try {
        fitAddon.fit();
        onResizeRef.current?.(xterm.cols, xterm.rows);
        // Seed prevDimensionsRef so doResize can detect narrowing
        prevDimensionsRef.current = { cols: xterm.cols, rows: xterm.rows };
      } catch { /* ignore */ }
    }, 300);

    // Phase 3b (350ms): full refresh + optional clear for tmux
    const phase3bTimer = setTimeout(() => {
      try {
        xterm.refresh(0, xterm.rows - 1);
        if (tmuxManaged) {
          xterm.clear();
        }
      } catch { /* ignore */ }
    }, 350);

    initPhaseTimersRef.current = [phase2Timer, phase3Timer, phase3bTimer];

    // Input guard: clear after 1000ms — device query responses only arrive during init
    const inputGuardTimer = setTimeout(() => {
      isInitializingRef.current = false;
    }, 1000);

    // Output guard: buffer output for 1000ms, then flush all at once.
    // Prevents partial escape sequences from corrupting display on reconnect.
    const outputGuardTimer = setTimeout(() => {
      isOutputGuardedRef.current = false;

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
          requestAnimationFrame(() => {
            xt.refresh(0, xt.rows - 1);
          });
        }
      }

      if (tmuxManaged) {
        setTimeout(() => triggerResizeTrick(), 100);
      }
    }, 1000);

    return () => {
      clearTimeout(inputGuardTimer);
      clearTimeout(outputGuardTimer);
      // Clean up 3-phase init timers
      for (const t of initPhaseTimersRef.current) {
        clearTimeout(t);
      }
      initPhaseTimersRef.current = [];
      if (resizeTrickTimerRef.current) {
        clearTimeout(resizeTrickTimerRef.current);
        resizeTrickTimerRef.current = null;
      }
      try { canvasAddonRef.current?.dispose(); } catch { /* ignore */ }
      try { xterm.dispose(); } catch { /* dispose race in StrictMode */ }
      xtermRef.current = null;
      fitAddonRef.current = null;
      canvasAddonRef.current = null;
    };
  }, [terminalId]); // Re-init only on terminalId change

  // Handle visibility changes — re-fit when becoming visible.
  // The CanvasAddon loses its rendering context when the container is
  // display:none, so we must re-fit, refresh the canvas, clear stale
  // selections, and re-force transparency after the container is shown.
  useEffect(() => {
    if (visible && initialized) {
      setFitPending(true);
      const timer = setTimeout(() => {
        const xterm = xtermRef.current;
        if (!xterm) { setFitPending(false); return; }

        // Clear any lingering selection from before the tab switch
        xterm.clearSelection();

        const result = fit();
        if (result) {
          onResizeRef.current?.(result.cols, result.rows);
        }

        // Full refresh to re-render the canvas after display:none
        xterm.refresh(0, xterm.rows - 1);

        // Re-force transparent backgrounds (xterm may re-apply inline styles)
        if (containerRef.current) {
          forceXtermTransparent(containerRef.current);
        }

        setFitPending(false);
        xterm.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [visible, initialized, fit]);

  // Perform the actual resize, checking for output quiet period first.
  // For tmux sessions, this only fits xterm locally — backend resize is handled
  // by triggerResizeTrick() which sends the two-step SIGWINCH pattern.
  const doResize = useCallback(() => {
    if (!xtermRef.current || !fitAddonRef.current) return;

    // Don't resize if container is hidden — prevents dimension corruption on tab switch
    const container = containerRef.current;
    if (container) {
      const rect = container.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
    }

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

    // Capture previous dimensions BEFORE fit
    const prevCols = prevDimensionsRef.current.cols;
    const prevRows = prevDimensionsRef.current.rows;

    try {
      fitAddonRef.current.fit();
      const xterm = xtermRef.current;
      const newCols = xterm.cols;
      const newRows = xterm.rows;

      // Detect column narrowing or large row delta (tmux status bar reflow).
      // When columns decrease, xterm's reflow algorithm corrupts complex ANSI
      // sequences (box-drawing chars, colors, tmux status bars). Clear the
      // buffer to prevent corruption and let tmux redraw cleanly.
      const colsNarrowed = prevCols > 0 && newCols < prevCols;
      const largeRowDelta = prevRows > 0 && Math.abs(newRows - prevRows) > 2;

      if (colsNarrowed || largeRowDelta) {
        console.log(`[doResize] Buffer clear: cols ${prevCols}->${newCols}, rows ${prevRows}->${newRows}`);
        xterm.clear();

        // Discard queued writes — they contain pre-resize content that would
        // re-corrupt the display
        writeQueueRef.current = [];
        writeQueueBytesRef.current = [];
      }

      // Update tracked dimensions
      prevDimensionsRef.current = { cols: newCols, rows: newRows };

      // For tmux sessions, do NOT send resize to backend here.
      // Container CSS changes (sidebar resize, split view) should only
      // update xterm locally. The resize trick handles backend communication.
      if (!tmuxManaged) {
        onResizeRef.current?.(newCols, newRows);
      }
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

    // For tmux sessions, trigger resize trick after clearing to force redraw
    if (tmuxManaged && prevCols > 0 && (prevCols > xtermRef.current!.cols || (prevRows > 0 && Math.abs(xtermRef.current!.rows - prevRows) > 2))) {
      // Schedule after cooldown settles
      setTimeout(() => triggerResizeTrick(), RESIZE_COOLDOWN_MS + 50);
    }
  }, [tmuxManaged, triggerResizeTrick]);

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

      // Skip if container is hidden (zero dimensions) — prevents corrupting
      // xterm dimensions when tab becomes inactive (display: none)
      if (newWidth < 1 || newHeight < 1) return;

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

  // Theme updates — re-apply palette when themeId changes
  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.theme = getXtermTheme(themeId);
      // Re-force transparency after xterm re-applies the theme background
      if (containerRef.current) {
        requestAnimationFrame(() => forceXtermTransparent(containerRef.current!));
      }
    }
  }, [themeId]);

  // Font size changes
  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.fontSize = fontSize;
      fitAddonRef.current?.fit();
    }
  }, [fontSize]);

  // Font family changes
  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.fontFamily = fontFamily || DEFAULT_FONT_FAMILY;
      fitAddonRef.current?.fit();
    }
  }, [fontFamily]);

  return (
    <div
      ref={containerRef}
      className="terminal-container"
      onContextMenu={(e) => e.preventDefault()}
      style={{
        width: '100%',
        height: '100%',
        visibility: fitPending ? 'hidden' : 'visible',
      }}
    />
  );
}
