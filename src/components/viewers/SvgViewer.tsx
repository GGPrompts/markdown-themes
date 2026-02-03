import { useState, useMemo } from 'react';
import { CodeViewer } from './CodeViewer';

interface SvgViewerProps {
  filePath: string;
  content: string;
  fontSize?: number;
}

type ViewMode = 'render' | 'source';

export function SvgViewer({ filePath, content, fontSize = 100 }: SvgViewerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('render');

  const fileName = filePath.split('/').pop() || 'SVG file';

  // Create a data URL from the SVG content for inline rendering
  const svgDataUrl = useMemo(() => {
    const encoded = encodeURIComponent(content);
    return `data:image/svg+xml,${encoded}`;
  }, [content]);

  // Extract SVG dimensions from content if available
  const svgInfo = useMemo(() => {
    const widthMatch = content.match(/width=["'](\d+(?:\.\d+)?)(px|em|%)?["']/);
    const heightMatch = content.match(/height=["'](\d+(?:\.\d+)?)(px|em|%)?["']/);
    const viewBoxMatch = content.match(/viewBox=["']([^"']+)["']/);

    let width: string | null = null;
    let height: string | null = null;

    if (widthMatch) {
      width = widthMatch[1] + (widthMatch[2] || 'px');
    }
    if (heightMatch) {
      height = heightMatch[1] + (heightMatch[2] || 'px');
    }

    // Try to get dimensions from viewBox if width/height not specified
    if (viewBoxMatch && (!width || !height)) {
      const parts = viewBoxMatch[1].trim().split(/\s+/);
      if (parts.length === 4) {
        if (!width) width = parts[2] + 'px';
        if (!height) height = parts[3] + 'px';
      }
    }

    return { width, height, viewBox: viewBoxMatch?.[1] || null };
  }, [content]);

  return (
    <div className="svg-viewer h-full flex flex-col">
      {/* Toolbar */}
      <ViewerToolbar
        viewMode={viewMode}
        setViewMode={setViewMode}
        svgInfo={svgInfo}
        fileName={fileName}
      />

      {/* Content area */}
      {viewMode === 'render' ? (
        <div
          className="flex-1 overflow-auto flex items-center justify-center p-8"
          style={{
            backgroundColor: 'var(--bg-primary)',
            zoom: fontSize / 100,
          }}
        >
          {/* Checkered background to show transparency */}
          <div
            className="relative p-4 rounded"
            style={{
              backgroundImage: `
                linear-gradient(45deg, var(--bg-secondary) 25%, transparent 25%),
                linear-gradient(-45deg, var(--bg-secondary) 25%, transparent 25%),
                linear-gradient(45deg, transparent 75%, var(--bg-secondary) 75%),
                linear-gradient(-45deg, transparent 75%, var(--bg-secondary) 75%)
              `,
              backgroundSize: '20px 20px',
              backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
            }}
          >
            <img
              src={svgDataUrl}
              alt={fileName}
              style={{
                maxWidth: '100%',
                maxHeight: 'calc(100vh - 200px)',
                display: 'block',
              }}
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden">
          <CodeViewer
            content={content}
            filePath={filePath.replace(/\.svg$/i, '.xml')} // Treat as XML for syntax highlighting
            fontSize={fontSize}
          />
        </div>
      )}
    </div>
  );
}

// Toolbar component for the SVG viewer
interface ViewerToolbarProps {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  svgInfo: { width: string | null; height: string | null; viewBox: string | null };
  fileName?: string;
}

function ViewerToolbar({ viewMode, setViewMode, svgInfo, fileName }: ViewerToolbarProps) {
  return (
    <div
      className="flex items-center gap-2 px-4 py-2 border-b"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderColor: 'var(--border)',
      }}
    >
      {/* View mode toggle */}
      <button
        onClick={() => setViewMode('render')}
        className="px-3 py-1 rounded text-sm"
        style={viewMode === 'render' ? {
          backgroundColor: 'var(--accent)',
          color: 'white',
        } : {
          backgroundColor: 'var(--bg-primary)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border)',
        }}
      >
        Render
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

      {/* SVG info */}
      <div className="ml-auto flex items-center gap-4">
        {svgInfo.width && svgInfo.height && (
          <span
            className="text-sm"
            style={{ color: 'var(--text-secondary)' }}
          >
            {svgInfo.width} x {svgInfo.height}
          </span>
        )}
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
  );
}
