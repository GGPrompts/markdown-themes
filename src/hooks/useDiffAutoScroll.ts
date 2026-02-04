import { useRef, useEffect, useCallback } from 'react';
import { findFirstChangedBlock } from '../utils/markdownDiff';

/**
 * useDiffAutoScroll - Auto-scroll to content changes during AI streaming
 *
 * This hook enables a "watch Claude code" experience by automatically
 * scrolling the viewport to show where changes are happening in real-time.
 *
 * Features:
 * - Block-level diffing for markdown (paragraphs, headings, code blocks)
 * - Percentage-based fallback for code files
 * - User interruption detection (pauses if you scroll manually)
 * - Works at any zoom/font-size level via DOM-based positioning
 */

interface UseDiffAutoScrollOptions {
  /** Current content to render */
  content: string;
  /** Whether AI is currently streaming/editing */
  isStreaming: boolean;
  /** Ref to the scroll container element */
  scrollContainerRef: React.RefObject<HTMLElement | null>;
  /** Whether auto-scroll is enabled (default: true) */
  enabled?: boolean;
  /** Debounce delay in ms before scrolling (default: 150) */
  debounceMs?: number;
}

/**
 * CSS selectors for block-level elements in rendered content.
 *
 * For markdown: paragraphs, headings, lists, code blocks, etc.
 * For code viewers: .line classes or data-line attributes from syntax highlighters
 */
const BLOCK_SELECTORS = 'p, h1, h2, h3, h4, h5, h6, pre, ul, ol, blockquote, table, hr, .line, [data-line]';

/**
 * Hook that auto-scrolls to changed content during AI streaming.
 *
 * How it works:
 * 1. Tracks previous content in a ref
 * 2. When content changes during streaming, diffs old vs new
 * 3. Finds the first changed block index
 * 4. Queries the DOM for block elements and scrolls to the matching one
 *
 * User interruption: If user manually scrolls during streaming,
 * auto-scroll is paused until streaming stops.
 */
export function useDiffAutoScroll({
  content,
  isStreaming,
  scrollContainerRef,
  enabled = true,
  debounceMs = 150,
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
      if (timeSinceOurScroll < 200) return;

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

    // Debounce the scroll to avoid thrashing and let DOM update
    scrollTimeoutRef.current = setTimeout(() => {
      const container = scrollContainerRef.current;
      if (!container) return;

      // Find what changed
      const diff = findFirstChangedBlock(prevContent, content);
      if (diff.firstChangedBlock < 0) return; // No change found

      // Find block elements in the rendered DOM
      const blocks = container.querySelectorAll(BLOCK_SELECTORS);
      const targetBlock = blocks[diff.firstChangedBlock];

      if (targetBlock) {
        // Get the block's position relative to the scroll container
        const containerRect = container.getBoundingClientRect();
        const blockRect = targetBlock.getBoundingClientRect();
        const relativeTop = blockRect.top - containerRect.top + container.scrollTop;

        // Check if block is currently visible in viewport
        const currentScroll = container.scrollTop;
        const viewportHeight = container.clientHeight;
        const blockTop = relativeTop;
        const blockBottom = relativeTop + blockRect.height;
        const viewportTop = currentScroll;
        const viewportBottom = currentScroll + viewportHeight;
        const isVisible = blockTop < viewportBottom && blockBottom > viewportTop;

        // Always scroll to new additions, or scroll if block is not visible
        if (diff.isAddition || !isVisible) {
          lastScrollTimeRef.current = Date.now();

          // Scroll to show the block in the lower third of the viewport
          const targetScroll = Math.max(0, relativeTop - viewportHeight * 0.6);

          container.scrollTo({
            top: targetScroll,
            behavior: 'smooth',
          });
        }
      } else {
        // Couldn't find specific block - use percentage-based fallback
        // This handles code files where block structure differs from markdown
        const scrollHeight = container.scrollHeight - container.clientHeight;
        const scrollPercent = diff.totalBlocks > 0
          ? diff.firstChangedBlock / diff.totalBlocks
          : 1; // Default to bottom if no blocks

        lastScrollTimeRef.current = Date.now();
        container.scrollTo({
          top: scrollHeight * Math.max(scrollPercent, 0.5), // At least scroll halfway
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
    if (diff.firstChangedBlock < 0) return;

    const blocks = container.querySelectorAll(BLOCK_SELECTORS);
    const targetBlock = blocks[diff.firstChangedBlock];

    if (targetBlock) {
      lastScrollTimeRef.current = Date.now();
      targetBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
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

