import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { AppStoreProvider, useAppStore } from './AppStoreContext';
import type { ReactNode } from 'react';

const STORAGE_KEY = 'markdown-themes-settings';

function wrapper({ children }: { children: ReactNode }) {
  return <AppStoreProvider>{children}</AppStoreProvider>;
}

describe('AppStoreContext', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('initial state', () => {
    it('provides default state when localStorage is empty', async () => {
      const { result } = renderHook(() => useAppStore(), { wrapper });

      // Wait for initial load
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(result.current.state.theme).toBe('dark-academia');
      expect(result.current.state.recentFiles).toEqual([]);
      expect(result.current.state.recentFolders).toEqual([]);
      expect(result.current.state.fontSize).toBe(100);
    });

    it('loads state from localStorage', async () => {
      const savedState = {
        theme: 'cyberpunk',
        recentFiles: ['/path/to/file.md'],
        recentFolders: ['/path/to/folder'],
        fontSize: 110,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedState));

      const { result } = renderHook(() => useAppStore(), { wrapper });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(result.current.state.theme).toBe('cyberpunk');
      expect(result.current.state.recentFiles).toEqual(['/path/to/file.md']);
      expect(result.current.state.fontSize).toBe(110);
    });

    it('uses defaults for missing fields in localStorage', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: 'noir' }));

      const { result } = renderHook(() => useAppStore(), { wrapper });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(result.current.state.theme).toBe('noir');
      expect(result.current.state.recentFiles).toEqual([]);
      expect(result.current.state.fontSize).toBe(100);
    });

    it('handles corrupted localStorage gracefully', async () => {
      localStorage.setItem(STORAGE_KEY, 'not valid json');

      const { result } = renderHook(() => useAppStore(), { wrapper });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(result.current.state.theme).toBe('dark-academia');
    });
  });

  describe('saveTheme', () => {
    it('updates theme and persists to localStorage', async () => {
      const { result } = renderHook(() => useAppStore(), { wrapper });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      act(() => {
        result.current.saveTheme('cosmic');
      });

      expect(result.current.state.theme).toBe('cosmic');

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
      expect(stored.theme).toBe('cosmic');
    });
  });

  describe('addRecentFile', () => {
    it('adds file to front of recent files', async () => {
      const { result } = renderHook(() => useAppStore(), { wrapper });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      act(() => {
        result.current.addRecentFile('/path/to/file1.md');
        result.current.addRecentFile('/path/to/file2.md');
      });

      expect(result.current.state.recentFiles[0]).toBe('/path/to/file2.md');
      expect(result.current.state.recentFiles[1]).toBe('/path/to/file1.md');
    });

    it('moves existing file to front without duplicating', async () => {
      const { result } = renderHook(() => useAppStore(), { wrapper });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      act(() => {
        result.current.addRecentFile('/path/to/file1.md');
        result.current.addRecentFile('/path/to/file2.md');
        result.current.addRecentFile('/path/to/file1.md');
      });

      expect(result.current.state.recentFiles).toEqual([
        '/path/to/file1.md',
        '/path/to/file2.md',
      ]);
    });

    it('limits to 10 recent files', async () => {
      const { result } = renderHook(() => useAppStore(), { wrapper });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      act(() => {
        for (let i = 0; i < 15; i++) {
          result.current.addRecentFile(`/file${i}.md`);
        }
      });

      expect(result.current.state.recentFiles).toHaveLength(10);
      expect(result.current.state.recentFiles[0]).toBe('/file14.md');
    });
  });

  describe('addRecentFolder', () => {
    it('adds folder to front of recent folders', async () => {
      const { result } = renderHook(() => useAppStore(), { wrapper });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      act(() => {
        result.current.addRecentFolder('/path/to/folder1');
        result.current.addRecentFolder('/path/to/folder2');
      });

      expect(result.current.state.recentFolders[0]).toBe('/path/to/folder2');
      expect(result.current.state.recentFolders[1]).toBe('/path/to/folder1');
    });

    it('limits to 5 recent folders', async () => {
      const { result } = renderHook(() => useAppStore(), { wrapper });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      act(() => {
        for (let i = 0; i < 10; i++) {
          result.current.addRecentFolder(`/folder${i}`);
        }
      });

      expect(result.current.state.recentFolders).toHaveLength(5);
      expect(result.current.state.recentFolders[0]).toBe('/folder9');
    });
  });

  describe('saveFontSize', () => {
    it('updates font size and persists to localStorage', async () => {
      const { result } = renderHook(() => useAppStore(), { wrapper });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      act(() => {
        result.current.saveFontSize(120);
      });

      expect(result.current.state.fontSize).toBe(120);

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
      expect(stored.fontSize).toBe(120);
    });
  });

  describe('saveLastWorkspace', () => {
    it('saves workspace path', async () => {
      const { result } = renderHook(() => useAppStore(), { wrapper });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      act(() => {
        result.current.saveLastWorkspace('/path/to/workspace');
      });

      expect(result.current.state.lastWorkspace).toBe('/path/to/workspace');
    });

    it('clears workspace when passed null', async () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ lastWorkspace: '/old/workspace' })
      );

      const { result } = renderHook(() => useAppStore(), { wrapper });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      act(() => {
        result.current.saveLastWorkspace(null);
      });

      expect(result.current.state.lastWorkspace).toBeUndefined();
    });
  });

  describe('clearRecentFiles', () => {
    it('clears all recent files', async () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ recentFiles: ['/file1.md', '/file2.md'] })
      );

      const { result } = renderHook(() => useAppStore(), { wrapper });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(result.current.state.recentFiles).toHaveLength(2);

      act(() => {
        result.current.clearRecentFiles();
      });

      expect(result.current.state.recentFiles).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('throws error when used outside provider', () => {
      expect(() => {
        renderHook(() => useAppStore());
      }).toThrow('useAppStore must be used within an AppStoreProvider');
    });
  });
});
