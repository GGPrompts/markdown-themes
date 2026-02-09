import { useState, useEffect } from 'react';
import { Loader2, Copy, Check, FileText, FilePlus, FileMinus, FileEdit, Clipboard } from 'lucide-react';

const API_BASE = 'http://localhost:8130';

interface CommitFile {
  status: 'A' | 'M' | 'D' | 'R' | string;
  path: string;
}

interface CommitData {
  hash: string;
  shortHash: string;
  message: string;
  body: string | null;
  author: string | null;
  email: string | null;
  date: string | null;
  parents: string[];
  refs: string[];
  files: CommitFile[];
}

interface CommitDetailsProps {
  hash: string;
  repoPath: string;
  onFileClick?: (path: string, status: string) => void;
}

/**
 * Get icon for file status
 */
function getStatusIcon(status: string) {
  switch (status) {
    case 'A':
      return <FilePlus className="w-3.5 h-3.5" style={{ color: '#4ade80' }} />;
    case 'D':
      return <FileMinus className="w-3.5 h-3.5" style={{ color: '#f87171' }} />;
    case 'M':
      return <FileEdit className="w-3.5 h-3.5" style={{ color: '#fbbf24' }} />;
    case 'R':
      return <FileText className="w-3.5 h-3.5" style={{ color: '#60a5fa' }} />;
    default:
      return <FileText className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} />;
  }
}

/**
 * Get label for file status
 */
function getStatusLabel(status: string): string {
  switch (status) {
    case 'A': return 'Added';
    case 'D': return 'Deleted';
    case 'M': return 'Modified';
    case 'R': return 'Renamed';
    default: return status;
  }
}

export function CommitDetails({ hash, repoPath, onFileClick }: CommitDetailsProps) {
  const [data, setData] = useState<CommitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchDetails() {
      try {
        setLoading(true);
        setError(null);

        const url = `${API_BASE}/api/git/commit/${hash}?path=${encodeURIComponent(repoPath)}`;
        const response = await fetch(url);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(errorData.error || `Failed to fetch commit: ${response.status}`);
        }

        const result = await response.json();
        if (!cancelled) {
          setData(result.data);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch commit details');
          setLoading(false);
        }
      }
    }

    fetchDetails();

    return () => {
      cancelled = true;
    };
  }, [hash, repoPath]);

  const handleCopyHash = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy hash:', err);
    }
  };

  const [gitlogueCopied, setGitlogueCopied] = useState(false);

  const handleGitlogue = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(`cd "${repoPath}" && gitlogue --commit ${data.hash}`);
      setGitlogueCopied(true);
      setTimeout(() => setGitlogueCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy gitlogue command:', err);
    }
  };

  if (loading) {
    return (
      <div
        className="commit-details px-4 py-3"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderTop: '1px solid var(--border)',
        }}
      >
        <div className="flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading commit details...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="commit-details px-4 py-3"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderTop: '1px solid var(--border)',
        }}
      >
        <p className="text-sm" style={{ color: '#f87171' }}>{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const formattedDate = data.date ? new Date(data.date).toLocaleString() : null;

  return (
    <div
      className="commit-details px-4 py-3"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Full commit message */}
      <div className="mb-3">
        <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
          {data.message}
        </p>
        {data.body && (
          <p
            className="text-sm whitespace-pre-wrap"
            style={{ color: 'var(--text-secondary)' }}
          >
            {data.body}
          </p>
        )}
      </div>

      {/* Author and date */}
      {(data.author || formattedDate) && (
        <div className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
          {data.author && <span>{data.author}</span>}
          {data.author && formattedDate && <span className="mx-2">•</span>}
          {formattedDate && <span>{formattedDate}</span>}
        </div>
      )}

      {/* Files changed */}
      {data.files?.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            Files changed ({data.files.length})
          </p>
          <div
            className="rounded overflow-hidden"
            style={{
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border)',
            }}
          >
            {data.files.map((file) => (
              <div
                key={file.path}
                className="flex items-center gap-2 px-2 py-1.5 text-xs cursor-pointer transition-colors hover:bg-[var(--bg-secondary)]"
                style={{
                  borderBottom: '1px solid var(--border)',
                }}
                onClick={() => onFileClick?.(file.path, file.status)}
                title={`${getStatusLabel(file.status)}: ${file.path}`}
              >
                {getStatusIcon(file.status)}
                <span
                  className="font-mono truncate flex-1"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {file.path}
                </span>
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] uppercase font-medium"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  View
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleCopyHash}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded transition-colors"
          style={{
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            color: copied ? '#4ade80' : 'var(--text-secondary)',
          }}
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              Copy Hash
            </>
          )}
        </button>
        <button
          onClick={handleGitlogue}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded transition-colors"
          style={{
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
          }}
        >
          {gitlogueCopied ? (
            <>
              <Check className="w-3.5 h-3.5" />
              Copied!
            </>
          ) : (
            <>
              <Clipboard className="w-3.5 h-3.5" />
              Gitlogue
            </>
          )}
        </button>
      </div>
    </div>
  );
}
