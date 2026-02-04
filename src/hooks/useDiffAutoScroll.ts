import { useRef, useEffect, useCallback } from 'react';
import { findFirstChangedBlock, getScrollPercentage } from '../utils/markdownDiff';

interface UseDiffAutoScrollOptions {
  /** Current content to render */
  content: string;
  /** Whether AI is currently streaming/editing */
  isStreaming: boolean;
  /** Ref to the scroll container element */
  scrollContainerRef: React.RefObject<HTMLElement | null>;
  /** Whether auto-scroll is enabled (default: true) */
  enabled?: boolean;
  /** Debounce delay in ms before scrolling (default: 100) */
  debounceMs?: number;
}

/**
 * Hook that auto-scrolls to changed content during AI streaming.
 *
 * How it works:
 * 1. Tracks previous content in a ref
 * 2. When content changes during streaming, diffs old vs new
 * 3. Finds the first changed block
 * 4. Scrolls to that position in the container
 *
 * User interruption: If user manually scrolls during streaming,
 * auto-scroll is paused until streaming stops.
 */
export function useDiffAutoScroll({
  content,
  isStreaming,
  scrollContainerRef,
  enabled = true,
  debounceMs = 100,
}: UseDiffAutoScrollOptions) {
  const prevContentRef = useRef<string>('');
  const userScrolledRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastScrollTimeRef = useRef(0);

  // Detect user scroll to pause auto-scroll
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !isStreaming) return;

    const handleScroll = () => {
      // If this scroll happened very recently after we programmatically scrolled,
      // ignore it (it's probably our scroll, not user's)
      const timeSinceOurScroll = Date.now() - lastScrollTimeRef.current;
      if (timeSinceOurScroll < 150) return;

      userScrolledRef.current = true;
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [scrollContainerRef, isStreaming]);

  // Reset user scroll flag when streaming stops
  useEffect(() => {
    if (!isStreaming) {
      userScrolledRef.current = false;
    }
  }, [isStreaming]);

  // Main effect: detect changes and scroll
  useEffect(() => {
    if (!enabled || !isStreaming || !scrollContainerRef.current) {
      // Update prev content even when disabled so we don't scroll on re-enable
      prevContentRef.current = content;
      return;
    }

    // Don't auto-scroll if user manually scrolled
    if (userScrolledRef.current) {
      prevContentRef.current = content;
      return;
    }

    const prevContent = prevContentRef.current;
    prevContentRef.current = content;

    // Skip if no previous content (initial load)
    if (!prevContent) return;

    // Skip if content unchanged
    if (prevContent === content) return;

    // Clear any pending scroll
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    // Debounce the scroll to avoid thrashing
    scrollTimeoutRef.current = setTimeout(() => {
      const container = scrollContainerRef.current;
      if (!container) return;

      // Find what changed
      const diff = findFirstChangedBlock(prevContent, content);
      const scrollPercent = getScrollPercentage(diff);

      if (scrollPercent < 0) return; // No change found

      // Calculate target scroll position
      const scrollHeight = container.scrollHeight - container.clientHeight;
      const targetScroll = scrollHeight * scrollPercent;

      // Only scroll if the change is below current viewport
      // (don't scroll up when edits happen above)
      const currentScroll = container.scrollTop;
      const targetIsBelow = targetScroll > currentScroll;

      // Also scroll if target is near the bottom (new content being added)
      const isNearBottom = scrollPercent > 0.8;

      if (targetIsBelow || isNearBottom) {
        lastScrollTimeRef.current = Date.now();
        container.scrollTo({
          top: targetScroll,
          behavior: 'smooth',
        });
      }
    }, debounceMs);

    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [content, isStreaming, enabled, scrollContainerRef, debounceMs]);

  // Manual scroll function for external use
  const scrollToChange = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || !prevContentRef.current) return;

    const diff = findFirstChangedBlock(prevContentRef.current, content);
    const scrollPercent = getScrollPercentage(diff);

    if (scrollPercent < 0) return;

    const scrollHeight = container.scrollHeight - container.clientHeight;
    const targetScroll = scrollHeight * scrollPercent;

    lastScrollTimeRef.current = Date.now();
    container.scrollTo({
      top: targetScroll,
      behavior: 'smooth',
    });
  }, [content, scrollContainerRef]);

  // Reset user scroll flag manually
  const resetUserScroll = useCallback(() => {
    userScrolledRef.current = false;
  }, []);

  return {
    /** Whether user has manually scrolled (auto-scroll paused) */
    userScrolled: userScrolledRef.current,
    /** Manually trigger scroll to current change */
    scrollToChange,
    /** Reset user scroll flag to re-enable auto-scroll */
    resetUserScroll,
  };
}
