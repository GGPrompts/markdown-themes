/**
 * markdownDiff.ts - Block-level diffing for markdown content
 *
 * Finds the first changed block between two markdown strings.
 * Works at the paragraph/block level to avoid scroll thrashing during typing.
 */

export interface DiffResult {
  /** Index of first changed block (0-based), or -1 if no change */
  firstChangedBlock: number;
  /** Total number of blocks in new content */
  totalBlocks: number;
  /** Approximate character offset where the change starts */
  charOffset: number;
  /** Whether content was added (vs modified or deleted) */
  isAddition: boolean;
}

/**
 * Split markdown into blocks (paragraphs, headings, lists, code blocks, etc.)
 * Uses double newlines as the primary delimiter, with special handling for code blocks.
 */
function splitIntoBlocks(content: string): string[] {
  if (!content) return [];

  // Normalize line endings
  const normalized = content.replace(/\r\n/g, '\n');

  // Split by double newlines, but preserve code blocks
  const blocks: string[] = [];
  let currentBlock = '';
  let inCodeBlock = false;

  const lines = normalized.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isCodeFence = line.startsWith('```') || line.startsWith('~~~');

    if (isCodeFence) {
      if (inCodeBlock) {
        // End of code block
        currentBlock += line + '\n';
        blocks.push(currentBlock.trim());
        currentBlock = '';
        inCodeBlock = false;
      } else {
        // Start of code block - save current block first
        if (currentBlock.trim()) {
          blocks.push(currentBlock.trim());
        }
        currentBlock = line + '\n';
        inCodeBlock = true;
      }
    } else if (inCodeBlock) {
      // Inside code block - just accumulate
      currentBlock += line + '\n';
    } else if (line === '') {
      // Empty line outside code block - might be block separator
      if (currentBlock.trim()) {
        blocks.push(currentBlock.trim());
        currentBlock = '';
      }
    } else {
      currentBlock += line + '\n';
    }
  }

  // Don't forget the last block
  if (currentBlock.trim()) {
    blocks.push(currentBlock.trim());
  }

  return blocks;
}

/**
 * Find the first block that differs between old and new content.
 * Returns info about where the change is and what type it is.
 */
export function findFirstChangedBlock(oldContent: string, newContent: string): DiffResult {
  const oldBlocks = splitIntoBlocks(oldContent);
  const newBlocks = splitIntoBlocks(newContent);

  // Find first differing block
  let charOffset = 0;
  const minLength = Math.min(oldBlocks.length, newBlocks.length);

  for (let i = 0; i < minLength; i++) {
    if (oldBlocks[i] !== newBlocks[i]) {
      return {
        firstChangedBlock: i,
        totalBlocks: newBlocks.length,
        charOffset,
        isAddition: newBlocks[i].length > oldBlocks[i].length,
      };
    }
    // Accumulate char offset (block + 2 for \n\n separator)
    charOffset += newBlocks[i].length + 2;
  }

  // If old has more blocks, content was deleted at end
  if (oldBlocks.length > newBlocks.length) {
    return {
      firstChangedBlock: newBlocks.length - 1,
      totalBlocks: newBlocks.length,
      charOffset: charOffset - (newBlocks.length > 0 ? newBlocks[newBlocks.length - 1].length + 2 : 0),
      isAddition: false,
    };
  }

  // If new has more blocks, content was added at end
  if (newBlocks.length > oldBlocks.length) {
    return {
      firstChangedBlock: oldBlocks.length,
      totalBlocks: newBlocks.length,
      charOffset,
      isAddition: true,
    };
  }

  // No change
  return {
    firstChangedBlock: -1,
    totalBlocks: newBlocks.length,
    charOffset: 0,
    isAddition: false,
  };
}

/**
 * Calculate scroll position as a percentage of the document.
 * This maps the change location to approximate scroll position.
 */
export function getScrollPercentage(diff: DiffResult): number {
  if (diff.firstChangedBlock === -1 || diff.totalBlocks === 0) {
    return -1; // No scroll needed
  }

  return diff.firstChangedBlock / diff.totalBlocks;
}
