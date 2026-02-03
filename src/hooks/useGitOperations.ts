import { useState, useCallback } from 'react';
import { getAuthToken } from '../lib/api';

const API_BASE = 'http://localhost:8129';

interface OperationResult {
  success: boolean;
  message?: string;
  error?: string;
  output?: string;
}

async function gitOperation(
  repo: string,
  operation: string,
  body?: object,
  projectsDir?: string
): Promise<OperationResult> {
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
      body: body ? JSON.stringify(body) : undefined,
    }
  );
  return res.json();
}

export function useGitOperations(repoName: string, projectsDir?: string) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stageFiles = useCallback(
    async (files: string[] = ['.']) => {
      setLoading('stage');
      setError(null);
      try {
        const result = await gitOperation(repoName, 'stage', { files }, projectsDir);
        if (!result.success) throw new Error(result.error);
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Stage failed');
        throw err;
      } finally {
        setLoading(null);
      }
    },
    [repoName, projectsDir]
  );

  const unstageFiles = useCallback(
    async (files: string[]) => {
      setLoading('unstage');
      setError(null);
      try {
        const result = await gitOperation(repoName, 'unstage', { files }, projectsDir);
        if (!result.success) throw new Error(result.error);
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unstage failed');
        throw err;
      } finally {
        setLoading(null);
      }
    },
    [repoName, projectsDir]
  );

  const commit = useCallback(
    async (message: string) => {
      setLoading('commit');
      setError(null);
      try {
        const result = await gitOperation(repoName, 'commit', { message }, projectsDir);
        if (!result.success) throw new Error(result.error);
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Commit failed');
        throw err;
      } finally {
        setLoading(null);
      }
    },
    [repoName, projectsDir]
  );

  const push = useCallback(async () => {
    setLoading('push');
    setError(null);
    try {
      const result = await gitOperation(repoName, 'push', {}, projectsDir);
      if (!result.success) throw new Error(result.error);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Push failed');
      throw err;
    } finally {
      setLoading(null);
    }
  }, [repoName, projectsDir]);

  const pull = useCallback(async () => {
    setLoading('pull');
    setError(null);
    try {
      const result = await gitOperation(repoName, 'pull', {}, projectsDir);
      if (!result.success) throw new Error(result.error);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pull failed');
      throw err;
    } finally {
      setLoading(null);
    }
  }, [repoName, projectsDir]);

  const gitFetch = useCallback(async () => {
    setLoading('fetch');
    setError(null);
    try {
      const result = await gitOperation(repoName, 'fetch', {}, projectsDir);
      if (!result.success) throw new Error(result.error);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fetch failed');
      throw err;
    } finally {
      setLoading(null);
    }
  }, [repoName, projectsDir]);

  const discardFiles = useCallback(
    async (files: string[]) => {
      setLoading('discard');
      setError(null);
      try {
        const result = await gitOperation(repoName, 'discard', { files }, projectsDir);
        if (!result.success) throw new Error(result.error);
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Discard failed');
        throw err;
      } finally {
        setLoading(null);
      }
    },
    [repoName, projectsDir]
  );

  const discardAll = useCallback(async () => {
    setLoading('discard');
    setError(null);
    try {
      const result = await gitOperation(repoName, 'discard', { all: true }, projectsDir);
      if (!result.success) throw new Error(result.error);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Discard all failed');
      throw err;
    } finally {
      setLoading(null);
    }
  }, [repoName, projectsDir]);

  return {
    loading,
    error,
    stageFiles,
    unstageFiles,
    commit,
    push,
    pull,
    fetch: gitFetch,
    discardFiles,
    discardAll,
    clearError: () => setError(null),
  };
}
