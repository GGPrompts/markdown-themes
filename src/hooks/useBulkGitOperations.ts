import { useState, useCallback } from 'react';
import { getAuthToken } from '../lib/api';

const API_BASE = 'http://localhost:8130';

export type BulkOperationType = 'fetch' | 'pull' | 'push';

export interface BulkOperationResult {
  repoName: string;
  success: boolean;
  error?: string;
}

export interface BulkOperationProgress {
  operation: BulkOperationType;
  total: number;
  completed: number;
  current: string;
  results: BulkOperationResult[];
}

async function gitOperation(
  repo: string,
  operation: string,
  projectsDir?: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getAuthToken();
  const dirParam = projectsDir ? `?dir=${encodeURIComponent(projectsDir)}` : '';
  const res = await fetch(
    `${API_BASE}/api/git/repos/${encodeURIComponent(repo)}/${operation}${dirParam}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-Token': token,
      },
      body: '{}',
    }
  );
  return res.json();
}

export function useBulkGitOperations() {
  const [progress, setProgress] = useState<BulkOperationProgress | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const runBulkOperation = useCallback(
    async (
      repoNames: string[],
      operation: BulkOperationType,
      onComplete?: () => void,
      projectsDir?: string
    ) => {
      if (repoNames.length === 0) return;

      setIsRunning(true);
      setProgress({
        operation,
        total: repoNames.length,
        completed: 0,
        current: repoNames[0],
        results: [],
      });

      const results: BulkOperationResult[] = [];

      // Run operations in parallel with concurrency limit
      const concurrency = 3;
      const chunks: string[][] = [];
      for (let i = 0; i < repoNames.length; i += concurrency) {
        chunks.push(repoNames.slice(i, i + concurrency));
      }

      for (const chunk of chunks) {
        // Update current to show the first repo in this chunk
        setProgress((prev) =>
          prev
            ? {
                ...prev,
                current: chunk[0],
              }
            : null
        );

        const chunkResults = await Promise.all(
          chunk.map(async (repoName) => {
            try {
              const result = await gitOperation(repoName, operation, projectsDir);
              return {
                repoName,
                success: result.success,
                error: result.error,
              };
            } catch (err) {
              return {
                repoName,
                success: false,
                error: err instanceof Error ? err.message : 'Unknown error',
              };
            }
          })
        );

        results.push(...chunkResults);
        setProgress((prev) =>
          prev
            ? {
                ...prev,
                completed: results.length,
                results: [...results],
              }
            : null
        );
      }

      setIsRunning(false);

      // Keep progress visible briefly so user can see final results
      setTimeout(() => {
        onComplete?.();
      }, 500);

      return results;
    },
    []
  );

  const clearProgress = useCallback(() => {
    setProgress(null);
  }, []);

  const fetchAll = useCallback(
    (repoNames: string[], onComplete?: () => void, projectsDir?: string) => {
      return runBulkOperation(repoNames, 'fetch', onComplete, projectsDir);
    },
    [runBulkOperation]
  );

  const pullAll = useCallback(
    (repoNames: string[], onComplete?: () => void, projectsDir?: string) => {
      return runBulkOperation(repoNames, 'pull', onComplete, projectsDir);
    },
    [runBulkOperation]
  );

  const pushAll = useCallback(
    (repoNames: string[], onComplete?: () => void, projectsDir?: string) => {
      return runBulkOperation(repoNames, 'push', onComplete, projectsDir);
    },
    [runBulkOperation]
  );

  return {
    progress,
    isRunning,
    fetchAll,
    pullAll,
    pushAll,
    clearProgress,
  };
}
