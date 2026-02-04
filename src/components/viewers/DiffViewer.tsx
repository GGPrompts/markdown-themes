import { useMemo } from 'react';

interface DiffViewerProps {
  diff: string;
  className?: string;
}

// Types for parsed diff structure
export interface DiffFile {
  oldPath: string;
  newPath: string;
  hunks: DiffHunk[];
}

export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  header: string;
  lines: DiffLine[];
}

export interface DiffLine {
  type: 'context' | 'addition' | 'deletion';
  content: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
}

/**
 * Parse a unified diff string into structured data
 */
export function parseDiff(diffText: string): DiffFile[] {
  const files: DiffFile[] = [];
  const lines = diffText.split('\n');

  let currentFile: DiffFile | null = null;
  let currentHunk: DiffHunk | null = null;
  let oldLineNum = 0;
  let newLineNum = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // File header: diff --git a/file b/file
    if (line.startsWith('diff --git ')) {
      // Save previous file if exists
      if (currentFile) {
        if (currentHunk) {
          currentFile.hunks.push(currentHunk);
        }
        files.push(currentFile);
      }

      // Parse paths from diff --git a/path b/path
      const match = line.match(/^diff --git a\/(.+) b\/(.+)$/);
      currentFile = {
        oldPath: match ? match[1] : '',
        newPath: match ? match[2] : '',
        hunks: [],
      };
      currentHunk = null;
      continue;
    }

    // Skip index, --- and +++ lines but update paths if needed
    if (line.startsWith('index ')) continue;

    if (line.startsWith('--- ')) {
      const path = line.slice(4);
      if (currentFile && path !== '/dev/null') {
        // Remove a/ prefix if present
        currentFile.oldPath = path.startsWith('a/') ? path.slice(2) : path;
      }
      continue;
    }

    if (line.startsWith('+++ ')) {
      const path = line.slice(4);
      if (currentFile && path !== '/dev/null') {
        // Remove b/ prefix if present
        currentFile.newPath = path.startsWith('b/') ? path.slice(2) : path;
      }
      continue;
    }

    // Hunk header: @@ -10,6 +10,7 @@ optional context
    if (line.startsWith('@@')) {
      // Save previous hunk if exists
      if (currentFile && currentHunk) {
        currentFile.hunks.push(currentHunk);
      }

      // Parse hunk header: @@ -oldStart,oldCount +newStart,newCount @@ context
      const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/);
      if (hunkMatch) {
        oldLineNum = parseInt(hunkMatch[1], 10);
        newLineNum = parseInt(hunkMatch[3], 10);
        currentHunk = {
          oldStart: oldLineNum,
          oldCount: hunkMatch[2] ? parseInt(hunkMatch[2], 10) : 1,
          newStart: newLineNum,
          newCount: hunkMatch[4] ? parseInt(hunkMatch[4], 10) : 1,
          header: hunkMatch[5]?.trim() || '',
          lines: [],
        };
      }
      continue;
    }

    // Diff lines (must have a current hunk)
    if (currentHunk) {
      if (line.startsWith('+')) {
        currentHunk.lines.push({
          type: 'addition',
          content: line.slice(1),
          oldLineNumber: null,
          newLineNumber: newLineNum++,
        });
      } else if (line.startsWith('-')) {
        currentHunk.lines.push({
          type: 'deletion',
          content: line.slice(1),
          oldLineNumber: oldLineNum++,
          newLineNumber: null,
        });
      } else if (line.startsWith(' ') || line === '') {
        // Context line (space prefix) or empty line
        const content = line.startsWith(' ') ? line.slice(1) : line;
        currentHunk.lines.push({
          type: 'context',
          content,
          oldLineNumber: oldLineNum++,
          newLineNumber: newLineNum++,
        });
      }
      // Ignore other lines like "\ No newline at end of file"
    }
  }

  // Save last file and hunk
  if (currentFile) {
    if (currentHunk) {
      currentFile.hunks.push(currentHunk);
    }
    files.push(currentFile);
  }

  return files;
}

/**
 * Get the file extension from a path for potential syntax highlighting
 */
function getFileExtension(path: string): string {
  const parts = path.split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

/**
 * Format line number with padding
 */
function formatLineNumber(num: number | null, width: number): string {
  if (num === null) return ' '.repeat(width);
  return String(num).padStart(width, ' ');
}

export function DiffViewer({ diff, className = '' }: DiffViewerProps) {
  const files = useMemo(() => parseDiff(diff), [diff]);

  // Calculate the max line number width for alignment
  const maxLineNumber = useMemo(() => {
    let max = 0;
    for (const file of files) {
      for (const hunk of file.hunks) {
        for (const line of hunk.lines) {
          if (line.oldLineNumber !== null && line.oldLineNumber > max) {
            max = line.oldLineNumber;
          }
          if (line.newLineNumber !== null && line.newLineNumber > max) {
            max = line.newLineNumber;
          }
        }
      }
    }
    return max;
  }, [files]);

  const lineNumberWidth = Math.max(3, String(maxLineNumber).length);

  if (files.length === 0) {
    return (
      <div
        className={`diff-viewer h-full overflow-auto p-4 ${className}`}
        style={{ color: 'var(--text-secondary)' }}
      >
        <p>No changes to display</p>
      </div>
    );
  }

  return (
    <div
      className={`diff-viewer h-full overflow-auto ${className}`}
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      {files.map((file, fileIndex) => (
        <div key={fileIndex} className="mb-4">
          {/* File header */}
          <div
            className="px-4 py-2 font-medium sticky top-0"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              borderBottom: '1px solid var(--border)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.875rem',
            }}
          >
            <span style={{ color: 'var(--text-primary)' }}>
              {file.oldPath === file.newPath ? (
                file.newPath
              ) : (
                <>
                  <span style={{ color: 'var(--shiki-token-keyword)' }}>
                    {file.oldPath}
                  </span>
                  <span style={{ color: 'var(--text-secondary)' }}> → </span>
                  <span style={{ color: 'var(--shiki-token-string)' }}>
                    {file.newPath}
                  </span>
                </>
              )}
            </span>
            {getFileExtension(file.newPath) && (
              <span
                className="ml-2 px-2 py-0.5 rounded text-xs"
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                }}
              >
                {getFileExtension(file.newPath)}
              </span>
            )}
          </div>

          {/* Hunks */}
          {file.hunks.map((hunk, hunkIndex) => (
            <div key={hunkIndex}>
              {/* Hunk header */}
              <div
                className="px-4 py-1"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--accent) 10%, var(--bg-secondary))',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary)',
                  borderTop: hunkIndex > 0 ? '1px solid var(--border)' : undefined,
                }}
              >
                @@ -{hunk.oldStart},{hunk.oldCount} +{hunk.newStart},{hunk.newCount} @@
                {hunk.header && (
                  <span style={{ color: 'var(--accent)' }}> {hunk.header}</span>
                )}
              </div>

              {/* Diff lines */}
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.875rem',
                  lineHeight: '1.5',
                }}
              >
                {hunk.lines.map((line, lineIndex) => {
                  let bgColor: string;
                  let borderColor: string;
                  let prefix: string;

                  switch (line.type) {
                    case 'addition':
                      bgColor = 'color-mix(in srgb, #22c55e 15%, var(--bg-primary))';
                      borderColor = '#22c55e';
                      prefix = '+';
                      break;
                    case 'deletion':
                      bgColor = 'color-mix(in srgb, #ef4444 15%, var(--bg-primary))';
                      borderColor = '#ef4444';
                      prefix = '-';
                      break;
                    default:
                      bgColor = 'var(--bg-primary)';
                      borderColor = 'transparent';
                      prefix = ' ';
                  }

                  return (
                    <div
                      key={lineIndex}
                      className="flex"
                      style={{
                        backgroundColor: bgColor,
                        borderLeft: `3px solid ${borderColor}`,
                      }}
                    >
                      {/* Old line number */}
                      <span
                        className="select-none text-right px-2"
                        style={{
                          minWidth: `${lineNumberWidth + 1}ch`,
                          color: 'var(--text-secondary)',
                          opacity: 0.6,
                          borderRight: '1px solid var(--border)',
                        }}
                      >
                        {formatLineNumber(line.oldLineNumber, lineNumberWidth)}
                      </span>

                      {/* New line number */}
                      <span
                        className="select-none text-right px-2"
                        style={{
                          minWidth: `${lineNumberWidth + 1}ch`,
                          color: 'var(--text-secondary)',
                          opacity: 0.6,
                          borderRight: '1px solid var(--border)',
                        }}
                      >
                        {formatLineNumber(line.newLineNumber, lineNumberWidth)}
                      </span>

                      {/* Prefix (+/-/space) */}
                      <span
                        className="select-none px-1"
                        style={{
                          color: line.type === 'addition' ? '#22c55e' :
                                 line.type === 'deletion' ? '#ef4444' :
                                 'var(--text-secondary)',
                          fontWeight: line.type !== 'context' ? 600 : 400,
                        }}
                      >
                        {prefix}
                      </span>

                      {/* Line content */}
                      <pre
                        className="flex-1 m-0 pr-4"
                        style={{
                          backgroundColor: 'transparent',
                          color: 'var(--text-primary)',
                          whiteSpace: 'pre',
                          overflow: 'visible',
                        }}
                      >
                        {line.content || ' '}
                      </pre>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
