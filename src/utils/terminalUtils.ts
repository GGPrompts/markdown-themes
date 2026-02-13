/**
 * Pure utility functions for terminal ID/name generation.
 * Extracted from TerminalPanel.tsx for testability.
 */

export function sanitizeProfileName(name: string): string {
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20);
  return sanitized || 'bash';
}

export function generateTerminalId(profileName?: string): string {
  const name = sanitizeProfileName(profileName || 'bash');
  const hex = Math.random().toString(16).slice(2, 10).padEnd(8, '0');
  return `mt-${name}-${hex}`;
}

export function generateProfileId(name: string): string {
  return sanitizeProfileName(name) + '-' + Math.random().toString(36).slice(2, 8);
}
