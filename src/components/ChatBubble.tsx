import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Bot, Terminal } from 'lucide-react';

interface ChatBubbleProps {
  isGenerating: boolean;
  isChatOpen: boolean;
  isTerminalOpen: boolean;
  onToggleChat: () => void;
  onToggleTerminal: () => void;
}

export function ChatBubble({ isGenerating, isChatOpen, isTerminalOpen, onToggleChat, onToggleTerminal }: ChatBubbleProps) {
  const [isNearby, setIsNearby] = useState(false);

  const handleMouseEnter = useCallback(() => setIsNearby(true), []);
  const handleMouseLeave = useCallback(() => setIsNearby(false), []);

  // Hide completely when either panel is open — close button is in the panel header instead
  if (isChatOpen || isTerminalOpen) return null;

  const isVisible = isNearby || isGenerating;

  return createPortal(
    <div
      className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 items-center"
      style={{ padding: '64px', margin: '-64px' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Chat bubble */}
      <button
        onClick={onToggleChat}
        className="relative w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border)',
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? 'scale(1)' : 'scale(0.8)',
          pointerEvents: isVisible ? 'auto' : 'none',
        }}
        title="Open AI chat (Ctrl+Shift+C)"
      >
        <Bot size={22} />

        {/* Pulsing ring when AI is generating */}
        {isGenerating && (
          <>
            <span
              className="absolute inset-0 rounded-full animate-ping"
              style={{
                border: '2px solid var(--accent)',
                opacity: 0.5,
              }}
            />
            <span
              className="absolute -inset-0.5 rounded-full"
              style={{
                border: '2px solid var(--accent)',
                opacity: 0.7,
              }}
            />
          </>
        )}
      </button>

      {/* Terminal bubble */}
      <button
        onClick={onToggleTerminal}
        className="relative w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border)',
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? 'scale(1)' : 'scale(0.8)',
          pointerEvents: isVisible ? 'auto' : 'none',
        }}
        title="Open terminal (Ctrl+`)"
      >
        <Terminal size={22} />
      </button>
    </div>,
    document.body
  );
}
