/**
 * Utilities for parsing and processing .prompty files
 *
 * Format:
 * ---
 * name: Prompt Name
 * description: What this prompt does
 * model: claude-3-opus
 * ---
 * Prompt content with {{variables}} and {{variable:hint}} or {{variable:opt1|opt2}}
 */

export interface PromptyFrontmatter {
  name?: string;
  description?: string;
  model?: string;
  url?: string;
  author?: string;
  version?: string;
  [key: string]: string | undefined;
}

export interface ParsedPrompty {
  frontmatter: PromptyFrontmatter;
  content: string;
  variables: VariableInfo[];
}

export interface VariableInfo {
  name: string;
  hint?: string;
  options?: string[]; // For dropdown: {{var:opt1|opt2|opt3}}
}

export interface ContentSegment {
  type: 'text' | 'field';
  content: string; // For text: the text content. For field: the variable name
  hint?: string; // For field: optional hint after colon
  options?: string[]; // For field: dropdown options if hint contains |
}

/**
 * Parse a prompty file into frontmatter, content, and detected variables
 */
export function parsePrompty(raw: string): ParsedPrompty {
  const frontmatter: PromptyFrontmatter = {};
  let content = raw;

  // Extract YAML frontmatter between --- delimiters
  const frontmatterMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (frontmatterMatch) {
    const yamlContent = frontmatterMatch[1];
    content = frontmatterMatch[2];

    // Simple YAML parsing (key: value pairs)
    yamlContent.split('\n').forEach((line) => {
      const match = line.match(/^(\w+):\s*(.*)$/);
      if (match) {
        frontmatter[match[1]] = match[2].trim();
      }
    });
  }

  // Detect {{variables}} in content - supports {{name}}, {{name:hint}}, {{name:opt1|opt2}}
  const variableRegex = /\{\{([^:}]+)(?::([^}]+))?\}\}/g;
  const variableMap = new Map<string, VariableInfo>();
  let match;

  while ((match = variableRegex.exec(content)) !== null) {
    const name = match[1].trim();
    const hint = match[2]?.trim();

    if (!variableMap.has(name)) {
      const varInfo: VariableInfo = { name };

      if (hint) {
        // Check if hint contains | for dropdown options
        if (hint.includes('|')) {
          varInfo.options = hint.split('|').map((opt) => opt.trim()).filter(Boolean);
        } else {
          varInfo.hint = hint;
        }
      }

      variableMap.set(name, varInfo);
    }
  }

  return {
    frontmatter,
    content,
    variables: Array.from(variableMap.values()),
  };
}

/**
 * Substitute variables in prompt content
 * Handles both {{var}} and {{var:hint}} syntax
 */
export function substituteVariables(content: string, values: Record<string, string>): string {
  let result = content;
  for (const [key, value] of Object.entries(values)) {
    // Replace {{key}} and {{key:anything}}
    result = result.replace(new RegExp(`\\{\\{${key}(?::[^}]+)?\\}\\}`, 'g'), value);
  }
  return result;
}

/**
 * Check if a file is a prompty file
 */
export function isPromptyFile(path: string): boolean {
  return /\.prompty$/i.test(path);
}

/**
 * Get content ready for sending (strip frontmatter, substitute variables)
 */
export function getPromptForSending(raw: string, variables: Record<string, string>): string {
  const { content } = parsePrompty(raw);
  return substituteVariables(content, variables);
}

/**
 * Parse content into segments of text and fields for inline rendering
 * Supports both {{variable}} and {{variable:hint}} syntax
 */
export function parseContentToSegments(content: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  const fieldRegex = /\{\{([^:}]+)(?::([^}]+))?\}\}/g;
  let lastIndex = 0;
  let match;

  while ((match = fieldRegex.exec(content)) !== null) {
    // Add text before this field
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        content: content.slice(lastIndex, match.index),
      });
    }

    const name = match[1].trim();
    const hint = match[2]?.trim();

    // Add the field
    const segment: ContentSegment = {
      type: 'field',
      content: name,
    };

    if (hint) {
      if (hint.includes('|')) {
        segment.options = hint.split('|').map((opt) => opt.trim()).filter(Boolean);
      } else {
        segment.hint = hint;
      }
    }

    segments.push(segment);
    lastIndex = fieldRegex.lastIndex;
  }

  // Add remaining text after last field
  if (lastIndex < content.length) {
    segments.push({
      type: 'text',
      content: content.slice(lastIndex),
    });
  }

  return segments;
}

/**
 * Get progress on filling variables
 */
export function getFieldProgress(
  variables: VariableInfo[],
  values: Record<string, string>
): { filled: number; total: number; percentage: number } {
  const total = variables.length;
  const filled = variables.filter((v) => values[v.name]?.trim()).length;
  const percentage = total > 0 ? Math.round((filled / total) * 100) : 100;
  return { filled, total, percentage };
}

/**
 * Get ordered list of field names from content (for tab navigation)
 */
export function getFieldOrder(content: string): string[] {
  const fieldRegex = /\{\{([^:}]+)(?::([^}]+))?\}\}/g;
  const fields: string[] = [];
  let match;

  while ((match = fieldRegex.exec(content)) !== null) {
    const fieldName = match[1].trim();
    if (!fields.includes(fieldName)) {
      fields.push(fieldName);
    }
  }

  return fields;
}
