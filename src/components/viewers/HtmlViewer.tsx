import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { CodeViewer } from './CodeViewer';
import { useTerminalContext } from '../../context/TerminalContext';

const API_BASE = 'http://localhost:8130';

interface HtmlViewerProps {
  filePath: string;
  content: string;
  fontSize?: number;
  isStreaming?: boolean;
}

type ViewMode = 'preview' | 'source';

/**
 * Read resolved CSS variable values from the parent document
 * so we can inject them as concrete colors into the iframe's srcdoc.
 */
function getThemeColors(): { track: string; thumb: string; thumbHover: string; radius: string } {
  const style = getComputedStyle(document.documentElement);
  return {
    track: style.getPropertyValue('--bg-secondary').trim() || '#1a1a2e',
    thumb: style.getPropertyValue('--border').trim() || '#333',
    thumbHover: style.getPropertyValue('--text-secondary').trim() || '#666',
    radius: style.getPropertyValue('--radius').trim() || '4px',
  };
}

export function HtmlViewer({ filePath, content, fontSize = 100, isStreaming = false }: HtmlViewerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('preview');
  const termCtx = useTerminalContext();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const fileName = filePath.split('/').pop() || 'HTML file';

  // Directory portion for <base> tag so relative URLs resolve via the serve endpoint
  const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));
  const serveDirPath = dirPath.startsWith('/') ? dirPath.slice(1) : dirPath;
  const baseHref = `${API_BASE}/api/files/serve/${serveDirPath}/`;

  // Full serve URL for "Open in Browser"
  const servePath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
  const baseServeUrl = `${API_BASE}/api/files/serve/${servePath}`;

  // Build srcdoc: inject <base> for relative URLs + scrollbar CSS with resolved theme colors
  const srcdoc = useMemo(() => {
    const colors = getThemeColors();
    const scrollbarCss = `
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: ${colors.track}; }
::-webkit-scrollbar-thumb { background: ${colors.thumb}; border-radius: ${colors.radius}; }
::-webkit-scrollbar-thumb:hover { background: ${colors.thumbHover}; }
html { scrollbar-color: ${colors.thumb} ${colors.track}; scrollbar-width: thin; }`;

    const baseTag = `<base href="${baseHref}">`;
    const styleTag = `<style data-scrollbar>${scrollbarCss}</style>`;
    // Intercept fragment-only link clicks so they scroll in-page
    // instead of navigating away from the srcdoc (which the <base> tag would cause)
    const fragmentScript = `<script>document.addEventListener('click',function(e){var a=e.target.closest('a[href^="#"]');if(a){e.preventDefault();var id=a.getAttribute('href').slice(1);if(!id){window.scrollTo({top:0,behavior:'smooth'});return;}var el=document.getElementById(id)||document.querySelector('[name="'+id+'"]');if(el)el.scrollIntoView({behavior:'smooth'});}});</script>`;
    // Intercept clicks on elements with data-terminal-command attribute
    const terminalCommandScript = `<script>document.addEventListener('click',function(e){var el=e.target.closest('[data-terminal-command]');if(el){e.preventDefault();var cmd=el.getAttribute('data-terminal-command');if(cmd){window.parent.postMessage({type:'terminal-command',command:cmd},'*');}}});</script>`;

    const injected = baseTag + styleTag + fragmentScript + terminalCommandScript;

    // Inject into <head> if present, otherwise prepend
    if (/<head[\s>]/i.test(content)) {
      return content.replace(/<head([\s>])/i, `<head$1${injected}`);
    }
    return injected + content;
  }, [content, baseHref]);

  const handleOpenInBrowser = useCallback(() => {
    window.open(baseServeUrl, '_blank');
  }, [baseServeUrl]);

  // Listen for terminal-command messages from iframe
  useEffect(() => {
    if (!termCtx) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'terminal-command' && event.data.command) {
        const command = event.data.command as string;
        if (!termCtx.hasActiveTerminal) {
          termCtx.openTerminal();
          setTimeout(() => {
            termCtx.sendToTerminal(command + '\n');
          }, 800);
        } else {
          termCtx.sendToTerminal(command + '\n');
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [termCtx]);

  return (
    <div className="html-viewer h-full flex flex-col">
      {/* Toolbar */}
      <div
        className="flex items-center gap-2 px-4 py-2 border-b"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderColor: 'var(--border)',
        }}
      >
        {/* View mode toggle */}
        <button
          onClick={() => setViewMode('preview')}
          className="px-3 py-1 rounded text-sm"
          style={viewMode === 'preview' ? {
            backgroundColor: 'var(--accent)',
            color: 'white',
          } : {
            backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
          }}
        >
          Preview
        </button>
        <button
          onClick={() => setViewMode('source')}
          className="px-3 py-1 rounded text-sm"
          style={viewMode === 'source' ? {
            backgroundColor: 'var(--accent)',
            color: 'white',
          } : {
            backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
          }}
        >
          Source
        </button>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-4">
          {isStreaming && (
            <span
              className="text-sm flex items-center gap-1.5"
              style={{ color: 'var(--accent)' }}
            >
              <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'var(--accent)' }} />
              AI writing...
            </span>
          )}

          {/* Open in Browser */}
          <button
            onClick={handleOpenInBrowser}
            className="px-2 py-1 rounded text-sm flex items-center gap-1.5"
            style={{
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
            }}
            title="Open in browser tab"
          >
            <ExternalLinkIcon />
            Open in Browser
          </button>

          {fileName && (
            <span
              className="text-sm truncate max-w-[200px]"
              style={{ color: 'var(--text-secondary)' }}
              title={fileName}
            >
              {fileName}
            </span>
          )}
        </div>
      </div>

      {/* Content area */}
      {viewMode === 'preview' ? (
        <div className="flex-1 overflow-hidden relative">
          <iframe
            ref={iframeRef}
            srcDoc={srcdoc}
            title={fileName}
            sandbox="allow-scripts"
            className="w-full h-full border-0"
            style={{
              backgroundColor: 'white',
            }}
          />
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <CodeViewer
            content={content}
            filePath={filePath}
            fontSize={fontSize}
            isStreaming={isStreaming}
          />
        </div>
      )}
    </div>
  );
}

function ExternalLinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}
