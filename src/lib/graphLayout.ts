/**
 * Git Graph Layout Algorithm
 *
 * Calculates visual layout for git commit graph visualization.
 * Assigns each commit to a "rail" (column) and generates connection data
 * for drawing lines between commits.
 */

/**
 * Input commit data from the API
 */
export interface Commit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
  parents: string[];
  refs: string[];
}

/**
 * Commit with layout positioning data
 */
export interface GraphNode {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
  parents: string[];
  refs: string[];
  rail: number;  // Column index (0, 1, 2, ...)
  row: number;   // Row index (matches commit order)
}

/**
 * Connection between two commits in the graph
 */
export interface GraphConnection {
  fromHash: string;
  toHash: string;
  fromRail: number;
  toRail: number;
  fromRow: number;
  toRow: number;
  type: 'straight' | 'merge-left' | 'merge-right';
}

/**
 * Complete graph layout result
 */
export interface GraphLayout {
  nodes: GraphNode[];
  connections: GraphConnection[];
  railCount: number;  // Max rails needed
}

/**
 * Rail color palette (8 colors, cycled by rail index)
 */
export const RAIL_COLORS = [
  '#6bcaf7', // cyan
  '#f76b6b', // red
  '#6bf78e', // green
  '#f7a86b', // orange
  '#b76bf7', // purple
  '#f76bb7', // pink
  '#b7f76b', // olive
  '#c4a8ff', // lavender
];

/**
 * Get the color for a given rail index
 */
export function getRailColor(rail: number): string {
  return RAIL_COLORS[rail % RAIL_COLORS.length];
}

/**
 * Calculate the visual layout for a git commit graph.
 *
 * Algorithm:
 * 1. Process commits in order (already topologically sorted from backend)
 * 2. Track "active rails" - columns occupied by branch lines waiting for parents
 * 3. For each commit:
 *    - If it's an expected parent in rail X, place it in rail X
 *    - If multiple rails expect this commit (merge), use the leftmost rail
 *    - If new (no active rail waiting), assign first free rail
 * 4. Generate connection data for drawing lines between commits
 *
 * @param commits Array of commits in topological order (newest first)
 * @returns Graph layout with positioned nodes and connections
 */
export function calculateGraphLayout(commits: Commit[]): GraphLayout {
  if (commits.length === 0) {
    return { nodes: [], connections: [], railCount: 0 };
  }

  const nodes: GraphNode[] = [];
  const connections: GraphConnection[] = [];

  // Maps commit hash to the rail(s) expecting it as a parent
  // A commit can be expected by multiple rails (in case of merge)
  const expectedParents: Map<string, number[]> = new Map();

  // Track which rails are currently active (occupied by a branch line)
  // Value is the hash of the commit that will use this rail next
  const activeRails: Map<number, string | null> = new Map();

  // Track row index of each commit for connection drawing
  const commitRowMap: Map<string, number> = new Map();
  const commitRailMap: Map<string, number> = new Map();

  let maxRail = 0;

  for (let row = 0; row < commits.length; row++) {
    const commit = commits[row];
    let rail: number;

    // Check if any rails are expecting this commit
    const expectingRails = expectedParents.get(commit.hash) || [];

    if (expectingRails.length > 0) {
      // Use the leftmost expecting rail (this handles merge visualization)
      rail = Math.min(...expectingRails);

      // Free up any other rails that were also expecting this commit
      for (const r of expectingRails) {
        if (r !== rail) {
          activeRails.delete(r);
        }
      }

      // Remove from expected parents
      expectedParents.delete(commit.hash);
    } else {
      // Find first free rail (not currently active)
      rail = 0;
      while (activeRails.has(rail)) {
        rail++;
      }
    }

    // Track max rail for layout width
    maxRail = Math.max(maxRail, rail);

    // Record this commit's position
    commitRowMap.set(commit.hash, row);
    commitRailMap.set(commit.hash, rail);

    // Create the graph node
    nodes.push({
      ...commit,
      rail,
      row,
    });

    // Handle parents (guard against undefined parents from API)
    const parents = commit.parents ?? [];
    if (parents.length === 0) {
      // Root commit - this rail becomes inactive
      activeRails.delete(rail);
    } else {
      // First parent continues on the same rail
      const firstParent = parents[0];
      activeRails.set(rail, firstParent);

      // Register this rail as expecting the first parent
      const existing = expectedParents.get(firstParent) || [];
      existing.push(rail);
      expectedParents.set(firstParent, existing);

      // Additional parents get new rails (merge scenario)
      for (let i = 1; i < parents.length; i++) {
        const parentHash = parents[i];

        // Find first free rail for this branch
        let newRail = 0;
        while (activeRails.has(newRail)) {
          newRail++;
        }

        activeRails.set(newRail, parentHash);
        maxRail = Math.max(maxRail, newRail);

        // Register this new rail as expecting the parent
        const existingParent = expectedParents.get(parentHash) || [];
        existingParent.push(newRail);
        expectedParents.set(parentHash, existingParent);
      }
    }
  }

  // Generate connections
  for (const node of nodes) {
    for (const parentHash of node.parents ?? []) {
      const parentRow = commitRowMap.get(parentHash);
      const parentRail = commitRailMap.get(parentHash);

      if (parentRow !== undefined && parentRail !== undefined) {
        // Determine connection type based on rail positions
        let type: GraphConnection['type'];
        if (node.rail === parentRail) {
          type = 'straight';
        } else if (node.rail > parentRail) {
          type = 'merge-left';
        } else {
          type = 'merge-right';
        }

        connections.push({
          fromHash: node.hash,
          toHash: parentHash,
          fromRail: node.rail,
          toRail: parentRail,
          fromRow: node.row,
          toRow: parentRow,
          type,
        });
      }
    }
  }

  return {
    nodes,
    connections,
    railCount: maxRail + 1,
  };
}
