import { useState, useRef, useEffect, useMemo } from 'react';

interface AudioViewerProps {
  filePath: string;
}

const API_BASE = 'http://localhost:8130';

// Pre-generate random heights for waveform bars (stable across renders)
const WAVEFORM_BARS = 20;
const generateWaveformHeights = () =>
  Array.from({ length: WAVEFORM_BARS }, () => Math.random() * 40 + 10);

function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return '--:--';

  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Icons as inline SVGs for the custom player
const PlayIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
    <path d="M8 5v14l11-7z" />
  </svg>
);

const PauseIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
  </svg>
);

const VolumeHighIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
  </svg>
);

const VolumeMuteIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
  </svg>
);

const VolumeLowIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M7 9v6h4l5 5V4l-5 5H7z" />
  </svg>
);

const DownloadIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
  </svg>
);

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function AudioViewer({ filePath }: AudioViewerProps) {
  const [duration, setDuration] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const fileName = filePath.split('/').pop() || 'Audio file';

  // Stable random heights - only regenerate when filePath changes
  const waveformHeights = useMemo(() => generateWaveformHeights(), [filePath]);

  // Fetch audio as base64 data URI from TabzChrome API
  useEffect(() => {
    setLoading(true);
    setError(null);
    setAudioUrl(null);
    setDuration(null);
    setCurrentTime(0);
    setIsPlaying(false);

    fetch(`${API_BASE}/api/files/audio?path=${encodeURIComponent(filePath)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load audio: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setAudioUrl(data.dataUri);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load audio file');
        setLoading(false);
      });
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

  const togglePlayPause = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !progressRef.current || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audioRef.current.currentTime = percent * duration;
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
    if (newVolume > 0 && isMuted) {
      setIsMuted(false);
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    audioRef.current.muted = newMuted;
  };

  const cyclePlaybackSpeed = () => {
    const currentIndex = PLAYBACK_SPEEDS.indexOf(playbackSpeed);
    const nextIndex = (currentIndex + 1) % PLAYBACK_SPEEDS.length;
    const newSpeed = PLAYBACK_SPEEDS[nextIndex];
    setPlaybackSpeed(newSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = newSpeed;
    }
  };

  const handleDownload = () => {
    if (!audioUrl) return;
    const link = document.createElement('a');
    link.href = audioUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const VolumeIcon = isMuted || volume === 0 ? VolumeMuteIcon : volume < 0.5 ? VolumeLowIcon : VolumeHighIcon;

  const handleError = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    const audio = e.currentTarget;
    const mediaError = audio.error;
    let errorMsg = 'Failed to load audio file';
    if (mediaError) {
      const codes: Record<number, string> = {
        1: 'Audio loading aborted',
        2: 'Network error while loading audio',
        3: 'Audio decoding failed',
        4: 'Audio format not supported',
      };
      errorMsg = codes[mediaError.code] || `Audio error: ${mediaError.message}`;
    }
    setError(errorMsg);
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
            {/* Simple audio wave visualization with CSS animations */}
            {waveformHeights.map((height, i) => (
              <div
                key={i}
                className="w-1 rounded-full"
                style={{
                  backgroundColor: 'var(--accent)',
                  height: isPlaying ? `${height}px` : '8px',
                  opacity: isPlaying ? 0.8 : 0.4,
                  transition: 'height 0.15s ease-out, opacity 0.15s ease-out',
                  animation: isPlaying
                    ? `waveform-pulse 0.8s ease-in-out infinite ${i * 0.05}s`
                    : 'none',
                }}
              />
            ))}
          </div>
        </div>

        {/* Custom themed controls */}
        <div className="flex items-center gap-3">
          {/* Play/Pause button */}
          <button
            onClick={togglePlayPause}
            className="flex items-center justify-center w-10 h-10 rounded-full transition-colors"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'var(--bg-primary)',
            }}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>

          {/* Time and progress */}
          <div className="flex-1">
            {/* Progress bar */}
            <div
              ref={progressRef}
              onClick={handleSeek}
              className="h-2 rounded-full cursor-pointer relative"
              style={{ backgroundColor: 'var(--border)' }}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: duration ? `${(currentTime / duration) * 100}%` : '0%',
                  backgroundColor: 'var(--accent)',
                }}
              />
              {/* Seek handle */}
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full opacity-0 hover:opacity-100 transition-opacity"
                style={{
                  left: duration ? `calc(${(currentTime / duration) * 100}% - 6px)` : '0',
                  backgroundColor: 'var(--accent)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }}
              />
            </div>
            {/* Time display */}
            <div
              className="flex justify-between text-xs mt-1"
              style={{
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              <span>{formatDuration(currentTime)}</span>
              <span>{duration ? formatDuration(duration) : '--:--'}</span>
            </div>
          </div>

          {/* Volume control */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleMute}
              className="p-1 rounded transition-colors hover:opacity-80"
              style={{ color: 'var(--text-secondary)' }}
              aria-label={isMuted ? 'Unmute' : 'Mute'}
            >
              <VolumeIcon />
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              className="w-16 h-1 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, var(--accent) ${(isMuted ? 0 : volume) * 100}%, var(--border) ${(isMuted ? 0 : volume) * 100}%)`,
              }}
              aria-label="Volume"
            />
          </div>
        </div>

        {/* Secondary controls row */}
        <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
          {/* Playback speed */}
          <button
            onClick={cyclePlaybackSpeed}
            className="px-2 py-1 text-xs rounded transition-colors hover:opacity-80"
            style={{
              color: 'var(--text-secondary)',
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              fontFamily: 'var(--font-mono)',
            }}
            title="Playback speed (click to cycle)"
          >
            {playbackSpeed}x
          </button>

          {/* Download button */}
          <button
            onClick={handleDownload}
            className="p-1.5 rounded transition-colors hover:opacity-80"
            style={{
              color: 'var(--text-secondary)',
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border)',
            }}
            aria-label="Download"
            title="Download"
          >
            <DownloadIcon />
          </button>
        </div>

        {/* Hidden audio element */}
        <audio
          ref={audioRef}
          src={audioUrl}
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onPlay={handlePlay}
          onPause={handlePause}
          onEnded={handleEnded}
          onError={handleError}
        />
      </div>
    </div>
  );
}
