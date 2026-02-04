import { useState, useRef, useEffect } from 'react';

interface AudioViewerProps {
  filePath: string;
  fontSize?: number;
}

const API_BASE = 'http://localhost:8129';

function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return '--:--';

  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function AudioViewer({ filePath, fontSize = 100 }: AudioViewerProps) {
  const [duration, setDuration] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const audioRef = useRef<HTMLAudioElement>(null);

  const fileName = filePath.split('/').pop() || 'Audio file';

  // Fetch audio as blob and create object URL
  useEffect(() => {
    let objectUrl: string | null = null;

    setLoading(true);
    setError(null);
    setAudioUrl(null);
    setDuration(null);
    setCurrentTime(0);
    setIsPlaying(false);

    fetch(`${API_BASE}/api/files/content?path=${encodeURIComponent(filePath)}&raw=true`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load audio');
        return res.blob();
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setAudioUrl(objectUrl);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load audio file');
        setLoading(false);
      });

    // Cleanup object URL on unmount or when filePath changes
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [filePath]);

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
      setError(null);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handlePlay = () => setIsPlaying(true);
  const handlePause = () => setIsPlaying(false);
  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleError = () => {
    setError('Failed to load audio file');
  };

  if (loading) {
    return (
      <div
        className="flex items-center justify-center h-full"
        style={{ color: 'var(--text-secondary)' }}
      >
        <p>Loading audio...</p>
      </div>
    );
  }

  if (error || !audioUrl) {
    return (
      <div
        className="flex items-center justify-center h-full"
        style={{ color: 'var(--text-secondary)' }}
      >
        <p>{error || 'Failed to load audio file'}</p>
      </div>
    );
  }

  return (
    <div
      className="audio-viewer h-full flex flex-col items-center justify-center p-8"
      style={{
        backgroundColor: 'var(--bg-primary)',
        zoom: fontSize / 100,
      }}
    >
      <div
        className="w-full max-w-lg p-6 rounded-lg"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
        }}
      >
        {/* File name */}
        <h2
          className="text-lg font-medium mb-4 truncate"
          style={{
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-body)',
          }}
          title={fileName}
        >
          {fileName}
        </h2>

        {/* Waveform placeholder / visualization area */}
        <div
          className="h-20 mb-4 rounded flex items-center justify-center"
          style={{
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border)',
          }}
        >
          <div
            className="flex items-center gap-1"
            style={{ color: 'var(--accent)' }}
          >
            {/* Simple audio wave visualization */}
            {[...Array(20)].map((_, i) => (
              <div
                key={i}
                className="w-1 rounded-full transition-all duration-150"
                style={{
                  backgroundColor: 'var(--accent)',
                  height: isPlaying
                    ? `${Math.random() * 40 + 10}px`
                    : '8px',
                  opacity: isPlaying ? 0.8 : 0.4,
                }}
              />
            ))}
          </div>
        </div>

        {/* Time display */}
        <div
          className="flex justify-between text-sm mb-3"
          style={{
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <span>{formatDuration(currentTime)}</span>
          <span>{duration ? formatDuration(duration) : '--:--'}</span>
        </div>

        {/* Native audio element with custom styling */}
        <audio
          ref={audioRef}
          src={audioUrl}
          controls
          className="w-full audio-controls"
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onPlay={handlePlay}
          onPause={handlePause}
          onEnded={handleEnded}
          onError={handleError}
          style={{
            borderRadius: 'var(--radius)',
            outline: 'none',
          }}
        />
      </div>

      {/* File info */}
      <div
        className="mt-4 text-sm"
        style={{ color: 'var(--text-secondary)' }}
      >
        {duration && (
          <span>Duration: {formatDuration(duration)}</span>
        )}
      </div>
    </div>
  );
}
