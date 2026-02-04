import { describe, it, expect } from 'vitest';
import {
  calculateGraphLayout,
  getRailColor,
  RAIL_COLORS,
  type Commit,
} from './graphLayout';

// Helper to create a commit
function commit(
  hash: string,
  parents: string[] = [],
  message = 'test commit',
  refs: string[] = []
): Commit {
  return {
    hash,
    shortHash: hash.slice(0, 7),
    message,
    author: 'Test Author',
    date: '2026-02-04T12:00:00Z',
    parents,
    refs,
  };
}

describe('calculateGraphLayout', () => {
  it('returns empty layout for empty commits', () => {
    const result = calculateGraphLayout([]);

    expect(result.nodes).toEqual([]);
    expect(result.connections).toEqual([]);
    expect(result.railCount).toBe(0);
  });

  describe('linear history', () => {
    it('places all commits on rail 0 for linear history', () => {
      // A -> B -> C (newest to oldest)
      const commits = [
        commit('aaa', ['bbb']),
        commit('bbb', ['ccc']),
        commit('ccc', []),  // root
      ];

      const result = calculateGraphLayout(commits);

      expect(result.railCount).toBe(1);
      expect(result.nodes.map((n) => n.rail)).toEqual([0, 0, 0]);
      expect(result.nodes.map((n) => n.row)).toEqual([0, 1, 2]);
    });

    it('generates straight connections for linear history', () => {
      const commits = [
        commit('aaa', ['bbb']),
        commit('bbb', ['ccc']),
        commit('ccc', []),
      ];

      const result = calculateGraphLayout(commits);

      expect(result.connections).toHaveLength(2);
      expect(result.connections[0]).toEqual({
        fromHash: 'aaa',
        toHash: 'bbb',
        fromRail: 0,
        toRail: 0,
        fromRow: 0,
        toRow: 1,
        type: 'straight',
      });
      expect(result.connections[1]).toEqual({
        fromHash: 'bbb',
        toHash: 'ccc',
        fromRail: 0,
        toRail: 0,
        fromRow: 1,
        toRow: 2,
        type: 'straight',
      });
    });

    it('handles single root commit', () => {
      const commits = [commit('aaa', [])];

      const result = calculateGraphLayout(commits);

      expect(result.railCount).toBe(1);
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].rail).toBe(0);
      expect(result.nodes[0].row).toBe(0);
      expect(result.connections).toHaveLength(0);
    });
  });

  describe('simple branch and merge', () => {
    it('creates separate rails for branches', () => {
      // Topology:
      //   A (merge commit, parents: B, C)
      //   |\
      //   B C
      //   |/
      //   D (common ancestor)
      const commits = [
        commit('aaa', ['bbb', 'ccc']), // merge: first parent B, second parent C
        commit('bbb', ['ddd']),         // first parent branch
        commit('ccc', ['ddd']),         // second parent branch
        commit('ddd', []),              // common ancestor
      ];

      const result = calculateGraphLayout(commits);

      // A is at rail 0
      expect(result.nodes[0].rail).toBe(0);
      // B continues on rail 0 (first parent)
      expect(result.nodes[1].rail).toBe(0);
      // C goes to a new rail (second parent branch)
      expect(result.nodes[2].rail).toBe(1);
      // D is on rail 0 (where B was pointing)
      expect(result.nodes[3].rail).toBe(0);

      expect(result.railCount).toBe(2);
    });

    it('generates merge connections with correct types', () => {
      const commits = [
        commit('aaa', ['bbb', 'ccc']),
        commit('bbb', ['ddd']),
        commit('ccc', ['ddd']),
        commit('ddd', []),
      ];

      const result = calculateGraphLayout(commits);

      // Find connections from merge commit
      const mergeConnections = result.connections.filter(
        (c) => c.fromHash === 'aaa'
      );

      expect(mergeConnections).toHaveLength(2);

      // Connection to first parent (same rail)
      const toBbb = mergeConnections.find((c) => c.toHash === 'bbb');
      expect(toBbb?.type).toBe('straight');
      expect(toBbb?.fromRail).toBe(0);
      expect(toBbb?.toRail).toBe(0);

      // Connection to second parent (different rail)
      const toCcc = mergeConnections.find((c) => c.toHash === 'ccc');
      expect(toCcc?.type).toBe('merge-right');
      expect(toCcc?.fromRail).toBe(0);
      expect(toCcc?.toRail).toBe(1);
    });

    it('merges rails when branch rejoins main line', () => {
      // Same as above but check that C's connection to D
      // crosses from rail 1 to rail 0
      const commits = [
        commit('aaa', ['bbb', 'ccc']),
        commit('bbb', ['ddd']),
        commit('ccc', ['ddd']),
        commit('ddd', []),
      ];

      const result = calculateGraphLayout(commits);

      // Connection from C to D
      const cToD = result.connections.find(
        (c) => c.fromHash === 'ccc' && c.toHash === 'ddd'
      );

      expect(cToD).toBeDefined();
      expect(cToD?.type).toBe('merge-left');
      expect(cToD?.fromRail).toBe(1);
      expect(cToD?.toRail).toBe(0);
    });
  });

  describe('multiple parallel branches', () => {
    it('handles three parallel branches', () => {
      // Topology:
      //   A (merge with 3 parents: B, C, D)
      //   |\|\
      //   B C D
      //   |/|/
      //   E
      const commits = [
        commit('aaa', ['bbb', 'ccc', 'ddd']), // octopus merge
        commit('bbb', ['eee']),
        commit('ccc', ['eee']),
        commit('ddd', ['eee']),
        commit('eee', []),
      ];

      const result = calculateGraphLayout(commits);

      // A at rail 0
      expect(result.nodes[0].rail).toBe(0);
      // B continues on rail 0
      expect(result.nodes[1].rail).toBe(0);
      // C gets rail 1
      expect(result.nodes[2].rail).toBe(1);
      // D gets rail 2
      expect(result.nodes[3].rail).toBe(2);
      // E on rail 0
      expect(result.nodes[4].rail).toBe(0);

      expect(result.railCount).toBe(3);
    });

    it('handles independent branches that never merge', () => {
      // Two separate root commits
      const commits = [
        commit('aaa', ['bbb']),
        commit('ccc', ['ddd']),
        commit('bbb', []),  // root 1
        commit('ddd', []),  // root 2
      ];

      const result = calculateGraphLayout(commits);

      // First branch on rail 0
      expect(result.nodes[0].rail).toBe(0);  // A
      expect(result.nodes[2].rail).toBe(0);  // B

      // Second branch on rail 1
      expect(result.nodes[1].rail).toBe(1);  // C
      expect(result.nodes[3].rail).toBe(1);  // D

      expect(result.railCount).toBe(2);
    });

    it('reuses freed rails', () => {
      // After a branch ends (reaches root), its rail should be reused
      // A -> B (rail 0)
      // C (independent, starts after B ends)
      const commits = [
        commit('aaa', ['bbb']),
        commit('bbb', []),  // root - rail 0 freed
        commit('ccc', []),  // should reuse rail 0
      ];

      const result = calculateGraphLayout(commits);

      expect(result.nodes[0].rail).toBe(0);  // A
      expect(result.nodes[1].rail).toBe(0);  // B
      expect(result.nodes[2].rail).toBe(0);  // C reuses rail 0

      expect(result.railCount).toBe(1);
    });
  });

  describe('complex scenarios', () => {
    it('handles branch from middle of history', () => {
      // Main: A -> B -> C
      // Branch from B: D
      // No merge yet
      const commits = [
        commit('aaa', ['bbb']),
        commit('ddd', ['bbb']),  // branch from B
        commit('bbb', ['ccc']),
        commit('ccc', []),
      ];

      const result = calculateGraphLayout(commits);

      // A and D both point to B, first one (A) gets rail 0
      expect(result.nodes[0].rail).toBe(0);  // A
      // D comes next, creates new branch
      expect(result.nodes[1].rail).toBe(1);  // D
      // B is expected by both A (rail 0) and D (rail 1), uses leftmost
      expect(result.nodes[2].rail).toBe(0);  // B
      expect(result.nodes[3].rail).toBe(0);  // C

      // D -> B should be merge-left (from rail 1 to rail 0)
      const dToB = result.connections.find(
        (c) => c.fromHash === 'ddd' && c.toHash === 'bbb'
      );
      expect(dToB?.type).toBe('merge-left');
    });

    it('preserves refs in nodes', () => {
      const commits = [
        commit('aaa', ['bbb'], 'HEAD commit', ['HEAD -> main', 'origin/main']),
        commit('bbb', [], 'Initial commit', ['v1.0.0']),
      ];

      const result = calculateGraphLayout(commits);

      expect(result.nodes[0].refs).toEqual(['HEAD -> main', 'origin/main']);
      expect(result.nodes[1].refs).toEqual(['v1.0.0']);
    });

    it('preserves commit metadata in nodes', () => {
      const commits = [
        {
          hash: 'abc123def456',
          shortHash: 'abc123d',
          message: 'Fix bug in parser',
          author: 'Jane Doe',
          date: '2026-02-04T15:30:00Z',
          parents: [],
          refs: ['HEAD'],
        },
      ];

      const result = calculateGraphLayout(commits);

      expect(result.nodes[0]).toMatchObject({
        hash: 'abc123def456',
        shortHash: 'abc123d',
        message: 'Fix bug in parser',
        author: 'Jane Doe',
        date: '2026-02-04T15:30:00Z',
        refs: ['HEAD'],
        rail: 0,
        row: 0,
      });
    });
  });
});

describe('getRailColor', () => {
  it('returns colors for rails 0-7', () => {
    expect(getRailColor(0)).toBe('#6bcaf7');  // cyan
    expect(getRailColor(1)).toBe('#f76b6b');  // red
    expect(getRailColor(7)).toBe('#c4a8ff');  // lavender
  });

  it('cycles colors for rails >= 8', () => {
    expect(getRailColor(8)).toBe(getRailColor(0));
    expect(getRailColor(9)).toBe(getRailColor(1));
    expect(getRailColor(15)).toBe(getRailColor(7));
    expect(getRailColor(16)).toBe(getRailColor(0));
  });
});

describe('RAIL_COLORS', () => {
  it('has exactly 8 colors', () => {
    expect(RAIL_COLORS).toHaveLength(8);
  });

  it('contains valid hex color codes', () => {
    const hexColorRegex = /^#[0-9a-fA-F]{6}$/;
    for (const color of RAIL_COLORS) {
      expect(color).toMatch(hexColorRegex);
    }
  });
});
