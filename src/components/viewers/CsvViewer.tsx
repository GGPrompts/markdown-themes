import { useMemo, useState } from 'react';

interface CsvViewerProps {
  content: string;
  fontSize?: number;
}

interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

function parseCsv(content: string): ParsedCsv {
  const lines = content.split('\n').filter((line) => line.trim());

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  // Simple CSV parser that handles quoted fields
  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Escaped quote
          current += '"';
          i++;
        } else {
          // Toggle quote mode
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current.trim());
    return result;
  };

  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).map(parseRow);

  return { headers, rows };
}

export function CsvViewer({ content, fontSize = 100 }: CsvViewerProps) {
  const [sortColumn, setSortColumn] = useState<number | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const { headers, rows } = useMemo(() => parseCsv(content), [content]);

  const sortedRows = useMemo(() => {
    if (sortColumn === null) return rows;

    return [...rows].sort((a, b) => {
      const aVal = a[sortColumn] || '';
      const bVal = b[sortColumn] || '';

      // Try numeric sort first
      const aNum = parseFloat(aVal);
      const bNum = parseFloat(bVal);

      if (!isNaN(aNum) && !isNaN(bNum)) {
        return sortDirection === 'asc' ? aNum - bNum : bNum - aNum;
      }

      // Fall back to string sort
      return sortDirection === 'asc'
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    });
  }, [rows, sortColumn, sortDirection]);

  const handleHeaderClick = (index: number) => {
    if (sortColumn === index) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(index);
      setSortDirection('asc');
    }
  };

  if (headers.length === 0) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-secondary)' }}>
        <p>Empty CSV file</p>
      </div>
    );
  }

  return (
    <div
      className="csv-viewer h-full overflow-auto p-4"
      style={{ zoom: fontSize / 100 }}
    >
      <div
        className="overflow-x-auto rounded"
        style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
        }}
      >
        <table
          className="w-full border-collapse"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.875rem',
          }}
        >
          <thead>
            <tr>
              {headers.map((header, index) => (
                <th
                  key={index}
                  onClick={() => handleHeaderClick(index)}
                  className="px-4 py-2 text-left cursor-pointer select-none whitespace-nowrap"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    borderBottom: '2px solid var(--border)',
                    fontWeight: 600,
                  }}
                >
                  <span className="flex items-center gap-2">
                    {header || `Column ${index + 1}`}
                    {sortColumn === index && (
                      <span style={{ color: 'var(--accent)' }}>
                        {sortDirection === 'asc' ? '\u2191' : '\u2193'}
                      </span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className="hover:bg-opacity-50"
                style={{
                  backgroundColor: rowIndex % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                }}
              >
                {headers.map((_, colIndex) => (
                  <td
                    key={colIndex}
                    className="px-4 py-2 whitespace-nowrap"
                    style={{
                      color: 'var(--text-primary)',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    {row[colIndex] || ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div
        className="mt-2 text-sm"
        style={{ color: 'var(--text-secondary)' }}
      >
        {rows.length} row{rows.length !== 1 ? 's' : ''}, {headers.length} column{headers.length !== 1 ? 's' : ''}
      </div>
    </div>
  );
}
