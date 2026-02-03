import { useState, useMemo, useCallback } from 'react';

interface JsonViewerProps {
  content: string;
  fontSize?: number;
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

export function JsonViewer({ content, fontSize = 100 }: JsonViewerProps) {
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const parsedData = useMemo(() => {
    try {
      setParseError(null);
      return JSON.parse(content);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Invalid JSON');
      return null;
    }
  }, [content]);

  const handleCopyPath = useCallback(async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
      setCopiedPath(path);
      setTimeout(() => setCopiedPath(null), 2000);
    } catch (err) {
      console.error('Failed to copy path:', err);
    }
  }, []);

  if (parseError) {
    return (
      <div className="json-viewer h-full overflow-auto p-4">
        <div
          className="mb-4 p-3 rounded"
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#ef4444',
          }}
        >
          <strong>Parse Error:</strong> {parseError}
        </div>
        <pre
          className="p-4 rounded overflow-x-auto"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.875rem',
            lineHeight: '1.7',
          }}
        >
          {content}
        </pre>
      </div>
    );
  }

  return (
    <div
      className="json-viewer h-full overflow-auto p-4"
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
        className="p-4 rounded overflow-x-auto"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.875rem',
          lineHeight: '1.7',
          borderRadius: 'var(--radius)',
        }}
      >
        <JsonNode data={parsedData} path="$" depth={0} onCopyPath={handleCopyPath} />
      </div>
    </div>
  );
}
