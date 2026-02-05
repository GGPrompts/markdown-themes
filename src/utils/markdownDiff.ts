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

export interface LineDiffResult {
  /** Line number of first changed line (1-based), or -1 if no change */
  firstChangedLine: number;
  /** Total number of lines in new content */
  totalLines: number;
  /** Whether content was added (vs modified or deleted) */
  isAddition: boolean;
}

export type LineChangeType = 'added' | 'modified';

export interface AllChangedLinesResult {
  /** Map of line number (1-based) to change type */
  changedLines: Map<number, LineChangeType>;
  /** Total number of lines in new content */
  totalLines: number;
}

export type BlockChangeType = 'added' | 'modified';

export interface BlockRange {
  /** Starting line number (1-based) */
  startLine: number;
  /** Ending line number (1-based, inclusive) */
  endLine: number;
}

export interface BlockWithChange {
  /** The block content */
  content: string;
  /** Block index (0-based) */
  index: number;
  /** Line range in the original markdown */
  lines: BlockRange;
  /** Change type if this block contains changes, undefined if unchanged */
  changeType?: BlockChangeType;
}

/**
 * Find the first line that differs between old and new content.
 * Used for code files where line-level precision is needed.
 */
export function findFirstChangedLine(oldContent: string, newContent: string): LineDiffResult {
  // Normalize line endings
  const oldNormalized = oldContent.replace(/\r\n/g, '\n');
  const newNormalized = newContent.replace(/\r\n/g, '\n');

  const oldLines = oldNormalized.split('\n');
  const newLines = newNormalized.split('\n');

  // Find first differing line
  const minLength = Math.min(oldLines.length, newLines.length);

  for (let i = 0; i < minLength; i++) {
    if (oldLines[i] !== newLines[i]) {
      return {
        firstChangedLine: i + 1, // 1-based line numbers
        totalLines: newLines.length,
        isAddition: newLines[i].length > oldLines[i].length,
      };
    }
  }

  // If old has more lines, content was deleted at end
  if (oldLines.length > newLines.length) {
    return {
      firstChangedLine: newLines.length > 0 ? newLines.length : 1,
      totalLines: newLines.length,
      isAddition: false,
    };
  }

  // If new has more lines, content was added at end
  if (newLines.length > oldLines.length) {
    return {
      firstChangedLine: oldLines.length + 1, // First new line
      totalLines: newLines.length,
      isAddition: true,
    };
  }

  // No change
  return {
    firstChangedLine: -1,
    totalLines: newLines.length,
    isAddition: false,
  };
}

/**
 * Find all lines that differ between old and new content.
 * Returns a map of line numbers to their change type (added or modified).
 * Used for highlighting changed lines during streaming.
 */
export function findAllChangedLines(oldContent: string, newContent: string): AllChangedLinesResult {
  // Normalize line endings
  const oldNormalized = oldContent.replace(/\r\n/g, '\n');
  const newNormalized = newContent.replace(/\r\n/g, '\n');

  const oldLines = oldNormalized.split('\n');
  const newLines = newNormalized.split('\n');

  const changedLines = new Map<number, LineChangeType>();

  // Special case: empty old content means all new lines are additions
  const oldIsEmpty = oldContent === '';

  // Compare lines that exist in both
  const minLength = Math.min(oldLines.length, newLines.length);
  for (let i = 0; i < minLength; i++) {
    if (oldLines[i] !== newLines[i]) {
      // If old was empty, treat all lines as added, not modified
      changedLines.set(i + 1, oldIsEmpty ? 'added' : 'modified'); // 1-based line numbers
    }
  }

  // Any new lines beyond the old content are additions
  for (let i = oldLines.length; i < newLines.length; i++) {
    changedLines.set(i + 1, 'added'); // 1-based line numbers
  }

  return {
    changedLines,
    totalLines: newLines.length,
  };
}

/**
 * Split markdown into blocks with line number tracking.
 * Each block knows its start and end line numbers.
 */
function splitIntoBlocksWithLines(content: string): { blocks: string[]; lineRanges: BlockRange[] } {
  if (!content) return { blocks: [], lineRanges: [] };

  // Normalize line endings
  const normalized = content.replace(/\r\n/g, '\n');

  const blocks: string[] = [];
  const lineRanges: BlockRange[] = [];
  let currentBlock = '';
  let currentBlockStartLine = 1;
  let currentLine = 1;
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
        lineRanges.push({ startLine: currentBlockStartLine, endLine: currentLine });
        currentBlock = '';
        currentBlockStartLine = currentLine + 1;
        inCodeBlock = false;
      } else {
        // Start of code block - save current block first
        if (currentBlock.trim()) {
          blocks.push(currentBlock.trim());
          lineRanges.push({ startLine: currentBlockStartLine, endLine: currentLine - 1 });
        }
        currentBlock = line + '\n';
        currentBlockStartLine = currentLine;
        inCodeBlock = true;
      }
    } else if (inCodeBlock) {
      // Inside code block - just accumulate
      currentBlock += line + '\n';
    } else if (line === '') {
      // Empty line outside code block - might be block separator
      if (currentBlock.trim()) {
        blocks.push(currentBlock.trim());
        lineRanges.push({ startLine: currentBlockStartLine, endLine: currentLine - 1 });
        currentBlock = '';
        currentBlockStartLine = currentLine + 1;
      } else {
        // Skip empty lines, but update start line for next block
        currentBlockStartLine = currentLine + 1;
      }
    } else {
      currentBlock += line + '\n';
    }
    currentLine++;
  }

  // Don't forget the last block
  if (currentBlock.trim()) {
    blocks.push(currentBlock.trim());
    lineRanges.push({ startLine: currentBlockStartLine, endLine: currentLine - 1 });
  }

  return { blocks, lineRanges };
}

/**
 * Map git diff line changes to markdown blocks.
 * Returns blocks with their change types based on whether they contain changed lines.
 *
 * @param content The markdown content
 * @param changedLines Map of line numbers to change types from git diff
 * @returns Array of blocks with their change types
 */
export function mapLinesToBlocks(
  content: string,
  changedLines: Map<number, 'added' | 'modified'>
): BlockWithChange[] {
  const { blocks, lineRanges } = splitIntoBlocksWithLines(content);

  return blocks.map((block, index) => {
    const range = lineRanges[index];
    let changeType: BlockChangeType | undefined;

    // Check if any line in this block is changed
    for (let line = range.startLine; line <= range.endLine; line++) {
      const lineChange = changedLines.get(line);
      if (lineChange) {
        // Prefer 'added' over 'modified' if block has both
        if (lineChange === 'added' || changeType === undefined) {
          changeType = lineChange;
        }
        // If we find 'added', that takes precedence
        if (changeType === 'added') break;
      }
    }

    return {
      content: block,
      index,
      lines: range,
      changeType,
    };
  });
}
