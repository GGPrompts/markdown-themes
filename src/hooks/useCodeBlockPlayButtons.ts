import { useEffect, useRef, useCallback, type RefObject } from 'react';
import { useTerminalContext } from '../context/TerminalContext';
import { isRunnableLine } from '../components/CodePlayButton';

/** Languages where play buttons make sense */
const SHELL_LANGUAGES = new Set([
  'bash', 'sh', 'zsh', 'fish', 'shell', 'console',
  'powershell', 'bat', 'cmd', 'terminal',
]);

// SVG for a small play triangle
const PLAY_SVG = `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5,3 19,12 5,21"/></svg>`;
const PLAY_SVG_12 = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5,3 19,12 5,21"/></svg>`;

/**
 * Hook that observes a container for Streamdown code blocks and injects
 * play buttons into shell/command code blocks using vanilla DOM elements.
 *
 * Uses a delegated click handler to send commands via TerminalContext.
 */
export function useCodeBlockPlayButtons(
  containerRef: RefObject<HTMLElement | null>,
  enabled: boolean = true,
) {
  const termCtx = useTerminalContext();
  const processedBlocksRef = useRef<WeakSet<Element>>(new WeakSet());

  const sendCommand = useCallback((command: string) => {
    if (!termCtx) return;
    if (!termCtx.hasActiveTerminal) {
      termCtx.openTerminal();
      setTimeout(() => {
        termCtx.sendToTerminal(command + '\n');
      }, 800);
    } else {
      termCtx.sendToTerminal(command + '\n');
    }
  }, [termCtx]);

  const sendAllCommands = useCallback((lines: string[], delay: number = 200) => {
    if (!termCtx) return;
    const runnableLines = lines.filter(isRunnableLine);
    if (runnableLines.length === 0) return;

    const send = () => {
      runnableLines.forEach((line, idx) => {
        setTimeout(() => {
          termCtx.sendToTerminal(line + '\n');
        }, idx * delay);
      });
    };

    if (!termCtx.hasActiveTerminal) {
      termCtx.openTerminal();
      setTimeout(send, 800);
    } else {
      send();
    }
  }, [termCtx]);

  useEffect(() => {
    if (!enabled || !termCtx) return;
    const container = containerRef.current;
    if (!container) return;

    function processCodeBlocks() {
      const el = containerRef.current;
      if (!el) return;

      const codeBlocks = el.querySelectorAll('[data-streamdown="code-block"]');

      codeBlocks.forEach((block) => {
        // Already processed
        if (processedBlocksRef.current.has(block)) return;

        const language = (block.getAttribute('data-language') || '').toLowerCase();
        if (!SHELL_LANGUAGES.has(language)) return;

        const codeEl = block.querySelector('code');
        if (!codeEl) return;
        const codeText = codeEl.textContent || '';
        const lines = codeText.split('\n');
        const runnableCount = lines.filter(isRunnableLine).length;
        if (runnableCount === 0) return;

        processedBlocksRef.current.add(block);

        // Add "Run All" button to the header
        const header = block.querySelector('[data-streamdown="code-block-header"]');
        if (header) {
          const controlsDiv = header.querySelector('div:last-child') || header;
          const runAllBtn = document.createElement('button');
          runAllBtn.className = 'code-run-all-btn';
          runAllBtn.title = `Run all ${runnableCount} command${runnableCount > 1 ? 's' : ''}`;
          runAllBtn.innerHTML = `${PLAY_SVG_12}<span>Run All</span>`;
          runAllBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            sendAllCommands(lines);
          });
          controlsDiv.prepend(runAllBtn);
        }

        // Add per-line play buttons
        const body = block.querySelector('[data-streamdown="code-block-body"]') as HTMLElement | null;
        if (body) {
          const lineSpans = codeEl.children;
          for (let i = 0; i < lineSpans.length; i++) {
            const lineSpan = lineSpans[i] as HTMLElement;
            const lineText = lineSpan.textContent || '';

            if (!isRunnableLine(lineText)) continue;

            // Make line span position relative for the absolute play button
            lineSpan.style.position = 'relative';

            const btn = document.createElement('button');
            btn.className = 'code-play-btn';
            btn.type = 'button';
            const cmdPreview = lineText.trim().length > 60
              ? lineText.trim().slice(0, 57) + '...'
              : lineText.trim();
            btn.title = `Run: ${cmdPreview}`;
            btn.innerHTML = PLAY_SVG;
            btn.style.cssText = 'position: absolute; left: -18px; top: 50%; transform: translateY(-50%); z-index: 1;';
            btn.addEventListener('click', (e) => {
              e.stopPropagation();
              e.preventDefault();
              sendCommand(lineText.trim());
            });

            lineSpan.prepend(btn);
          }

          // Add left padding to body to make room for play buttons
          body.style.paddingLeft = '24px';
        }
      });
    }

    // Initial processing
    processCodeBlocks();

    // Watch for DOM changes (Streamdown renders asynchronously)
    const observer = new MutationObserver(() => {
      processCodeBlocks();
    });

    observer.observe(container, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      processedBlocksRef.current = new WeakSet();
    };
  }, [containerRef, enabled, termCtx, sendCommand, sendAllCommands]);
}
