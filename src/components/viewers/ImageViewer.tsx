import { useState, useRef, useCallback, useEffect } from 'react';

interface ImageViewerProps {
  filePath: string;
  fontSize?: number;
}

type ZoomMode = 'fit' | '100' | 'custom';

const API_BASE = 'http://localhost:8129';

export function ImageViewer({ filePath }: ImageViewerProps) {
  const [zoom, setZoom] = useState(100);
  const [zoomMode, setZoomMode] = useState<ZoomMode>('fit');
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Build the image URL from TabzChrome API
  const imageUrl = `${API_BASE}/api/files/content?path=${encodeURIComponent(filePath)}&raw=true`;

  // Calculate fit zoom level
  const calculateFitZoom = useCallback(() => {
    if (!containerRef.current || imageSize.width === 0) return 100;

    const containerRect = containerRef.current.getBoundingClientRect();
    const padding = 40; // Padding around image
    const availableWidth = containerRect.width - padding * 2;
    const availableHeight = containerRect.height - padding * 2;

    const widthRatio = availableWidth / imageSize.width;
    const heightRatio = availableHeight / imageSize.height;

    // Use the smaller ratio to fit the image
    return Math.min(widthRatio, heightRatio, 1) * 100;
  }, [imageSize]);

  // Update zoom when mode changes or image loads
  useEffect(() => {
    if (zoomMode === 'fit') {
      setZoom(calculateFitZoom());
      setPosition({ x: 0, y: 0 });
    } else if (zoomMode === '100') {
      setZoom(100);
      setPosition({ x: 0, y: 0 });
    }
  }, [zoomMode, calculateFitZoom]);

  // Handle image load
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
    setError(null);
  };

  // Handle image error
  const handleImageError = () => {
    setError('Failed to load image');
  };

  // Zoom controls
  const handleZoomIn = () => {
    setZoomMode('custom');
    setZoom((prev) => Math.min(prev * 1.25, 500));
  };

  const handleZoomOut = () => {
    setZoomMode('custom');
    setZoom((prev) => Math.max(prev / 1.25, 10));
  };

  const handleFit = () => {
    setZoomMode('fit');
  };

  const handleActualSize = () => {
    setZoomMode('100');
  };

  // Pan handling
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= calculateFitZoom()) return; // No panning when zoomed out

    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;

    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoomMode('custom');

    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((prev) => Math.min(Math.max(prev * delta, 10), 500));
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-secondary)' }}>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="image-viewer h-full flex flex-col">
      {/* Toolbar */}
      <div
        className="flex items-center gap-2 px-4 py-2 border-b"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderColor: 'var(--border)',
        }}
      >
        <button
          onClick={handleFit}
          className={`px-3 py-1 rounded text-sm ${zoomMode === 'fit' ? 'bg-accent text-white' : ''}`}
          style={zoomMode !== 'fit' ? {
            backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
          } : {
            backgroundColor: 'var(--accent)',
            color: 'white',
          }}
        >
          Fit
        </button>
        <button
          onClick={handleActualSize}
          className={`px-3 py-1 rounded text-sm ${zoomMode === '100' ? 'bg-accent text-white' : ''}`}
          style={zoomMode !== '100' ? {
            backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
          } : {
            backgroundColor: 'var(--accent)',
            color: 'white',
          }}
        >
          100%
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={handleZoomOut}
            className="px-2 py-1 rounded text-sm"
            style={{
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
            }}
          >
            -
          </button>
          <span
            className="px-2 min-w-[4rem] text-center text-sm"
            style={{ color: 'var(--text-secondary)' }}
          >
            {Math.round(zoom)}%
          </span>
          <button
            onClick={handleZoomIn}
            className="px-2 py-1 rounded text-sm"
            style={{
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
            }}
          >
            +
          </button>
        </div>
        {imageSize.width > 0 && (
          <span
            className="ml-auto text-sm"
            style={{ color: 'var(--text-secondary)' }}
          >
            {imageSize.width} x {imageSize.height}
          </span>
        )}
      </div>

      {/* Image container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden flex items-center justify-center"
        style={{
          backgroundColor: 'var(--bg-primary)',
          cursor: zoom > calculateFitZoom() ? (isDragging ? 'grabbing' : 'grab') : 'default',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <img
          ref={imageRef}
          src={imageUrl}
          alt={filePath.split('/').pop() || 'Image'}
          onLoad={handleImageLoad}
          onError={handleImageError}
          draggable={false}
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${zoom / 100})`,
            transformOrigin: 'center center',
            maxWidth: 'none',
            maxHeight: 'none',
            transition: isDragging ? 'none' : 'transform 0.1s ease-out',
          }}
        />
      </div>
    </div>
  );
}
