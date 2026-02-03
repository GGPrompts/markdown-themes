interface PdfViewerProps {
  filePath: string;
  fontSize?: number;
}

const API_BASE = 'http://localhost:8129';

export function PdfViewer({ filePath }: PdfViewerProps) {
  const fileName = filePath.split('/').pop() || 'Document';
  const pdfUrl = `${API_BASE}/api/files/content?path=${encodeURIComponent(filePath)}&raw=true`;

  const handleOpenInNewTab = () => {
    window.open(pdfUrl, '_blank');
  };

  return (
    <div className="pdf-viewer h-full flex flex-col">
      {/* Toolbar */}
      <div
        className="flex items-center gap-2 px-4 py-2 border-b"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderColor: 'var(--border)',
        }}
      >
        <span
          className="text-sm font-medium truncate"
          style={{ color: 'var(--text-primary)' }}
        >
          {fileName}
        </span>
        <button
          onClick={handleOpenInNewTab}
          className="ml-auto px-3 py-1 rounded text-sm"
          style={{
            backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
          }}
        >
          Open in New Tab
        </button>
      </div>

      {/* PDF iframe */}
      <div
        className="flex-1"
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        <iframe
          src={pdfUrl}
          title={fileName}
          className="w-full h-full border-0"
        />
      </div>
    </div>
  );
}
