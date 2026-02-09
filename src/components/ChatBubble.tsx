import { useState, useCallback } from 'react';
import { Bot } from 'lucide-react';

interface ChatBubbleProps {
  isGenerating: boolean;
  isChatOpen: boolean;
  onToggleChat: () => void;
}

export function ChatBubble({ isGenerating, isChatOpen, onToggleChat }: ChatBubbleProps) {
  const [isNearby, setIsNearby] = useState(false);

  // Track mouse proximity via a larger invisible hit area
  const handleMouseEnter = useCallback(() => setIsNearby(true), []);
  const handleMouseLeave = useCallback(() => setIsNearby(false), []);

  const isVisible = isNearby || isGenerating || isChatOpen;

  return (
    <div
      className="fixed bottom-6 right-6 z-50"
      style={{ pointerEvents: 'auto' }}
    >
      {/* Larger invisible hit area for proximity detection */}
      <div
        className="absolute -inset-16"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{ pointerEvents: 'auto' }}
      />

      {/* The bubble button */}
      <button
        onClick={onToggleChat}
        className="relative w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg"
        style={{
          backgroundColor: isChatOpen ? 'var(--accent)' : 'var(--bg-secondary)',
          color: isChatOpen ? 'var(--bg-primary)' : 'var(--text-primary)',
          border: '1px solid var(--border)',
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? 'scale(1)' : 'scale(0.8)',
          pointerEvents: isVisible ? 'auto' : 'none',
        }}
        title={isChatOpen ? 'Close AI chat (Ctrl+Shift+C)' : 'Open AI chat (Ctrl+Shift+C)'}
      >
        <Bot size={22} />

        {/* Pulsing ring when AI is generating and chat is closed */}
        {isGenerating && !isChatOpen && (
          <span
            className="absolute inset-0 rounded-full animate-ping"
            style={{
              border: '2px solid var(--accent)',
              opacity: 0.5,
            }}
          />
        )}

        {/* Static accent ring when generating (always visible as indicator) */}
        {isGenerating && (
          <span
            className="absolute -inset-0.5 rounded-full"
            style={{
              border: '2px solid var(--accent)',
              opacity: 0.7,
            }}
          />
        )}
      </button>
    </div>
  );
}
