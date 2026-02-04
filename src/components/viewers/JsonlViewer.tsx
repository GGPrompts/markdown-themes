import { useState, useMemo, useCallback } from 'react';

interface JsonlViewerProps {
  content: string;
  fontSize?: number;
}

interface ParsedLine {
  id: number;
  data: unknown;
  error: string | null;
}

interface JsonNodeProps {
  data: unknown;
  path: string;
  depth: number;
  onCopyPath: (path: string) => void;
}

function JsonNode({ data, path, depth, onCopyPath }: JsonNodeProps) {
  const [isExpanded, setIsExpanded] = useState(depth < 2);

  const handleToggle = () => setIsExpanded(!isExpanded);
  const handleCopyPath = () => onCopyPath(path);

  const indent = depth * 1.5;

  if (data === null) {
    return (
      <span
        className="json-null cursor-pointer"
        style={{ color: 'var(--shiki-token-constant)' }}
        onClick={handleCopyPath}
        title={`Click to copy: ${path}`}
      >
        null
      </span>
    );
  }

  if (typeof data === 'boolean') {
    return (
      <span
        className="json-boolean cursor-pointer"
        style={{ color: 'var(--shiki-token-constant)' }}
        onClick={handleCopyPath}
        title={`Click to copy: ${path}`}
      >
        {data ? 'true' : 'false'}
      </span>
    );
  }

  if (typeof data === 'number') {
    return (
      <span
        className="json-number cursor-pointer"
        style={{ color: 'var(--shiki-token-constant)' }}
        onClick={handleCopyPath}
        title={`Click to copy: ${path}`}
      >
        {data}
      </span>
    );
  }

  if (typeof data === 'string') {
    return (
      <span
        className="json-string cursor-pointer"
        style={{ color: 'var(--shiki-token-string)' }}
        onClick={handleCopyPath}
        title={`Click to copy: ${path}`}
      >
        "{data}"
      </span>
    );
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return (
        <span
          className="cursor-pointer"
          style={{ color: 'var(--shiki-token-punctuation)' }}
          onClick={handleCopyPath}
          title={`Click to copy: ${path}`}
        >
          []
        </span>
      );
    }

    return (
      <span>
        <span
          className="cursor-pointer select-none"
          onClick={handleToggle}
          style={{ color: 'var(--shiki-token-punctuation)' }}
        >
          {isExpanded ? '[\u25BC' : `[\u25B6 ${data.length} items]`}
        </span>
        {isExpanded && (
          <>
            {data.map((item, index) => (
              <div key={index} style={{ paddingLeft: `${indent + 1.5}rem` }}>
                <span
                  className="cursor-pointer"
                  style={{ color: 'var(--text-secondary)' }}
                  onClick={handleCopyPath}
                >
                  {index}
                </span>
                <span style={{ color: 'var(--shiki-token-punctuation)' }}>: </span>
                <JsonNode
                  data={item}
                  path={`${path}[${index}]`}
                  depth={depth + 1}
                  onCopyPath={onCopyPath}
                />
                {index < data.length - 1 && (
                  <span style={{ color: 'var(--shiki-token-punctuation)' }}>,</span>
                )}
              </div>
            ))}
            <div style={{ paddingLeft: `${indent}rem` }}>
              <span style={{ color: 'var(--shiki-token-punctuation)' }}>]</span>
            </div>
          </>
        )}
      </span>
    );
  }

  if (typeof data === 'object') {
    const entries = Object.entries(data);

    if (entries.length === 0) {
      return (
        <span
          className="cursor-pointer"
          style={{ color: 'var(--shiki-token-punctuation)' }}
          onClick={handleCopyPath}
          title={`Click to copy: ${path}`}
        >
          {'{}'}
        </span>
      );
    }

    return (
      <span>
        <span
          className="cursor-pointer select-none"
          onClick={handleToggle}
          style={{ color: 'var(--shiki-token-punctuation)' }}
        >
          {isExpanded ? '{\u25BC' : `{\u25B6 ${entries.length} keys}`}
        </span>
        {isExpanded && (
          <>
            {entries.map(([key, value], index) => (
              <div key={key} style={{ paddingLeft: `${indent + 1.5}rem` }}>
                <span
                  className="cursor-pointer"
                  style={{ color: 'var(--shiki-token-keyword)' }}
                  onClick={() => onCopyPath(`${path}.${key}`)}
                  title={`Click to copy: ${path}.${key}`}
                >
                  "{key}"
                </span>
                <span style={{ color: 'var(--shiki-token-punctuation)' }}>: </span>
                <JsonNode
                  data={value}
                  path={`${path}.${key}`}
                  depth={depth + 1}
                  onCopyPath={onCopyPath}
                />
                {index < entries.length - 1 && (
                  <span style={{ color: 'var(--shiki-token-punctuation)' }}>,</span>
                )}
              </div>
            ))}
            <div style={{ paddingLeft: `${indent}rem` }}>
              <span style={{ color: 'var(--shiki-token-punctuation)' }}>{'}'}</span>
            </div>
          </>
        )}
      </span>
    );
  }

  return <span>{String(data)}</span>;
}

/**
 * Parse JSONL content into an array of parsed lines.
 * Each non-empty line is parsed as JSON independently.
 */
export function parseJsonlContent(content: string): ParsedLine[] {
  return content
    .split('\n')
    .map((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return null;
      }
      try {
        return { id: idx, data: JSON.parse(trimmed), error: null };
      } catch (e) {
        return {
          id: idx,
          data: null,
          error: e instanceof Error ? e.message : 'Parse error',
        };
      }
    })
    .filter((line): line is ParsedLine => line !== null);
}

interface JsonlLineProps {
  line: ParsedLine;
  lineNumber: number;
  onCopyPath: (path: string) => void;
}

function JsonlLine({ line, lineNumber, onCopyPath }: JsonlLineProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (line.error) {
    return (
      <div
        className="mb-2 p-3 rounded"
        style={{
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="text-xs px-2 py-0.5 rounded"
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.2)',
              color: '#ef4444',
            }}
          >
            Line {lineNumber}
          </span>
          <span style={{ color: '#ef4444' }}>Parse error: {line.error}</span>
        </div>
      </div>
    );
  }

  // Get a preview of the JSON object
  const preview = useMemo(() => {
    if (line.data === null) return 'null';
    if (typeof line.data !== 'object') return String(line.data);
    if (Array.isArray(line.data)) return `Array (${line.data.length} items)`;
    const keys = Object.keys(line.data);
    if (keys.length <= 3) return keys.join(', ');
    return `${keys.slice(0, 3).join(', ')}... (${keys.length} keys)`;
  }, [line.data]);

  return (
    <div
      className="mb-2 rounded overflow-hidden"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderRadius: 'var(--radius)',
      }}
    >
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none"
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          borderBottom: isExpanded ? '1px solid var(--border)' : 'none',
        }}
      >
        <span
          className="text-xs px-2 py-0.5 rounded font-mono"
          style={{
            backgroundColor: 'var(--accent)',
            color: 'white',
            opacity: 0.8,
          }}
        >
          {lineNumber}
        </span>
        <span style={{ color: 'var(--shiki-token-punctuation)' }}>
          {isExpanded ? '\u25BC' : '\u25B6'}
        </span>
        <span
          className="truncate"
          style={{
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.875rem',
          }}
        >
          {preview}
        </span>
      </div>
      {isExpanded && (
        <div
          className="p-3 overflow-x-auto"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.875rem',
            lineHeight: '1.7',
          }}
        >
          <JsonNode
            data={line.data}
            path={`$[${line.id}]`}
            depth={0}
            onCopyPath={onCopyPath}
          />
        </div>
      )}
    </div>
  );
}

export function JsonlViewer({ content, fontSize = 100 }: JsonlViewerProps) {
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const lines = useMemo(() => parseJsonlContent(content), [content]);

  const handleCopyPath = useCallback(async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
      setCopiedPath(path);
      setTimeout(() => setCopiedPath(null), 2000);
    } catch (err) {
      console.error('Failed to copy path:', err);
    }
  }, []);

  if (lines.length === 0) {
    return (
      <div
        className="h-full overflow-auto p-4"
        style={{ zoom: fontSize / 100 }}
      >
        <div
          className="p-4 rounded text-center"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-secondary)',
          }}
        >
          No JSON lines found
        </div>
      </div>
    );
  }

  const errorCount = lines.filter((l) => l.error).length;
  const validCount = lines.length - errorCount;

  return (
    <div
      className="jsonl-viewer h-full overflow-auto p-4"
      style={{ zoom: fontSize / 100 }}
    >
      {copiedPath && (
        <div
          className="fixed top-4 right-4 px-3 py-2 rounded shadow-lg z-50"
          style={{
            backgroundColor: 'var(--accent)',
            color: 'white',
          }}
        >
          Copied: {copiedPath}
        </div>
      )}

      <div
        className="mb-4 flex items-center gap-4 text-sm"
        style={{ color: 'var(--text-secondary)' }}
      >
        <span>{validCount} valid lines</span>
        {errorCount > 0 && (
          <span style={{ color: '#ef4444' }}>{errorCount} errors</span>
        )}
      </div>

      {lines.map((line, idx) => (
        <JsonlLine
          key={line.id}
          line={line}
          lineNumber={idx + 1}
          onCopyPath={handleCopyPath}
        />
      ))}
    </div>
  );
}
