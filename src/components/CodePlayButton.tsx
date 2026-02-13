import { useCallback } from 'react';
import { Play } from 'lucide-react';
import { useTerminalContext } from '../context/TerminalContext';

/**
 * Check if a line is a runnable command (not blank, not a comment).
 */
export function isRunnableLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  // Skip common comment patterns
  if (trimmed.startsWith('#') && !trimmed.startsWith('#!')) return false; // shell comments (but not shebangs)
  if (trimmed.startsWith('//')) return false;
  if (trimmed.startsWith('--')) return false;
  if (trimmed.startsWith('/*')) return false;
  if (trimmed.startsWith('*')) return false; // continuation of block comment
  if (trimmed.startsWith('"""') || trimmed.startsWith("'''")) return false; // python docstrings
  return true;
}

interface PlayButtonProps {
  /** The command text to send */
  command: string;
  /** Size of the icon in pixels */
  size?: number;
  /** Additional CSS class name */
  className?: string;
  /** Additional inline style */
  style?: React.CSSProperties;
}

/**
 * A small play triangle button that sends a command to the active terminal.
 * If no terminal is open, it opens the terminal panel first and retries.
 */
export function PlayButton({ command, size = 10, className = '', style }: PlayButtonProps) {
  const termCtx = useTerminalContext();

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!termCtx) return;

    if (!termCtx.hasActiveTerminal) {
      termCtx.openTerminal();
      // Retry sending after a short delay to allow terminal to spawn
      setTimeout(() => {
        termCtx.sendToTerminal(command + '\n');
      }, 800);
    } else {
      termCtx.sendToTerminal(command + '\n');
    }
  }, [command, termCtx]);

  if (!termCtx) return null;

  return (
    <button
      type="button"
      className={`code-play-btn ${className}`}
      onClick={handleClick}
      title={`Run: ${command.length > 60 ? command.slice(0, 57) + '...' : command}`}
      style={style}
    >
      <Play size={size} fill="currentColor" />
    </button>
  );
}

interface RunAllButtonProps {
  /** Lines of code to run */
  lines: string[];
  /** Delay between lines in ms */
  delay?: number;
}

/**
 * A "Run All" button that sends all runnable lines to the terminal with a delay.
 */
export function RunAllButton({ lines, delay = 200 }: RunAllButtonProps) {
  const termCtx = useTerminalContext();

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!termCtx) return;

    const runnableLines = lines.filter(isRunnableLine);
    if (runnableLines.length === 0) return;

    const send = () => {
      runnableLines.forEach((line, idx) => {
        setTimeout(() => {
          termCtx.sendToTerminal(line + '\n');
        }, idx * delay);
      });
    };

    if (!termCtx.hasActiveTerminal) {
      termCtx.openTerminal();
      setTimeout(send, 800);
    } else {
      send();
    }
  }, [lines, delay, termCtx]);

  if (!termCtx) return null;

  const runnableCount = lines.filter(isRunnableLine).length;
  if (runnableCount === 0) return null;

  return (
    <button
      type="button"
      className="code-run-all-btn"
      onClick={handleClick}
      title={`Run all ${runnableCount} command${runnableCount > 1 ? 's' : ''}`}
    >
      <Play size={12} fill="currentColor" />
      <span>Run All</span>
    </button>
  );
}
