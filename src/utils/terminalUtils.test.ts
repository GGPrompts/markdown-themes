import { describe, it, expect, vi } from 'vitest';
import { sanitizeProfileName, generateTerminalId, generateProfileId } from './terminalUtils';

describe('sanitizeProfileName', () => {
  it('lowercases input', () => {
    expect(sanitizeProfileName('MyProfile')).toBe('myprofile');
  });

  it('replaces non-alphanumeric characters with hyphens', () => {
    expect(sanitizeProfileName('my profile!')).toBe('my-profile');
  });

  it('trims leading and trailing hyphens', () => {
    expect(sanitizeProfileName('---hello---')).toBe('hello');
  });

  it('collapses consecutive non-alphanumeric characters to a single hyphen', () => {
    expect(sanitizeProfileName('a   b...c')).toBe('a-b-c');
  });

  it('truncates to 20 characters', () => {
    const long = 'abcdefghijklmnopqrstuvwxyz';
    expect(sanitizeProfileName(long)).toBe('abcdefghijklmnopqrst');
    expect(sanitizeProfileName(long).length).toBe(20);
  });

  it('returns "bash" for empty string', () => {
    expect(sanitizeProfileName('')).toBe('bash');
  });

  it('returns "bash" when input is only special characters', () => {
    expect(sanitizeProfileName('!!@@##')).toBe('bash');
  });

  it('handles unicode characters', () => {
    const result = sanitizeProfileName('café résumé');
    expect(result).toBe('caf-r-sum');
  });
});

describe('generateTerminalId', () => {
  it('starts with mt- prefix', () => {
    expect(generateTerminalId('shell')).toMatch(/^mt-/);
  });

  it('includes sanitized profile name', () => {
    const id = generateTerminalId('My Profile');
    expect(id).toMatch(/^mt-my-profile-/);
  });

  it('ends with an 8-character hex suffix', () => {
    const id = generateTerminalId('shell');
    const parts = id.split('-');
    const hexPart = parts[parts.length - 1];
    expect(hexPart).toMatch(/^[0-9a-f]{8}$/);
  });

  it('defaults to "bash" when no name provided', () => {
    const id = generateTerminalId();
    expect(id).toMatch(/^mt-bash-/);
  });

  it('defaults to "bash" when empty string provided', () => {
    const id = generateTerminalId('');
    expect(id).toMatch(/^mt-bash-/);
  });

  it('generates unique IDs across calls', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateTerminalId('test')));
    expect(ids.size).toBe(50);
  });

  it('handles long profile names by truncating', () => {
    const id = generateTerminalId('a-very-long-profile-name-that-exceeds-the-limit');
    // sanitized name should be max 20 chars
    const withoutPrefix = id.slice(3); // remove "mt-"
    const namePart = withoutPrefix.slice(0, withoutPrefix.lastIndexOf('-'));
    expect(namePart.length).toBeLessThanOrEqual(20);
  });
});

describe('generateProfileId', () => {
  it('starts with sanitized name', () => {
    const id = generateProfileId('My Shell');
    expect(id).toMatch(/^my-shell-/);
  });

  it('has a random suffix after the name', () => {
    const id = generateProfileId('test');
    const parts = id.split('-');
    const suffix = parts[parts.length - 1];
    expect(suffix.length).toBeGreaterThan(0);
    expect(suffix).toMatch(/^[a-z0-9]+$/);
  });

  it('generates unique IDs across calls', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateProfileId('test')));
    expect(ids.size).toBe(50);
  });

  it('handles empty-ish names (falls back to bash)', () => {
    const id = generateProfileId('!!!');
    expect(id).toMatch(/^bash-/);
  });
});
