import { useState, useEffect } from 'react';

interface VideoViewerProps {
  filePath: string;
  fontSize?: number;
}

const API_BASE = 'http://localhost:8130';

export function VideoViewer({ filePath, fontSize = 100 }: VideoViewerProps) {
  const [error, setError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fileName = filePath.split('/').pop() || 'Video file';

  useEffect(() => {
    // Reset state and fetch video when file changes
    setLoading(true);
    setError(null);
    setVideoUrl(null);

    fetch(`${API_BASE}/api/files/video?path=${encodeURIComponent(filePath)}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load video');
        return res.json();
      })
      .then((data) => {
        setVideoUrl(data.dataUri);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load video file');
        setLoading(false);
      });
  }, [filePath]);

  if (loading) {
    return (
      <div
        className="flex items-center justify-center h-full"
        style={{ color: 'var(--text-secondary)' }}
      >
        <p>Loading video...</p>
      </div>
    );
  }

  if (error || !videoUrl) {
    return (
      <div
        className="flex items-center justify-center h-full"
        style={{ color: 'var(--text-secondary)' }}
      >
        <p>{error || 'Failed to load video file'}</p>
      </div>
    );
  }

  return (
    <div
      className="video-viewer h-full flex flex-col"
      style={{
        backgroundColor: 'var(--bg-primary)',
        zoom: fontSize / 100,
      }}
    >
      {/* Toolbar with file name */}
      <div
        className="px-4 py-2 flex items-center border-b"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderColor: 'var(--border)',
        }}
      >
        <h2
          className="text-sm font-medium truncate"
          style={{
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-body)',
          }}
          title={fileName}
        >
          {fileName}
        </h2>
      </div>

      {/* Video container */}
      <div className="flex-1 flex items-center justify-center p-4">
        <video
          key={filePath}
          src={videoUrl}
          controls
          className="max-w-full max-h-full"
          style={{
            borderRadius: 'var(--radius)',
            backgroundColor: 'var(--bg-secondary)',
          }}
        />
      </div>
    </div>
  );
}
