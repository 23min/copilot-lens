/**
 * Graph layout using d3-dag's Sugiyama algorithm.
 *
 * Replaces the manual longest-path layering with proper crossing reduction,
 * optimal layer assignment, and smooth coordinate placement.
 */

import {
  graphStratify,
  sugiyama,
  layeringSimplex,
  decrossTwoLayer,
  coordQuad,
  tweakShape,
  shapeEllipse,
} from "d3-dag";

// ---------------------------------------------------------------------------
// Types (mirrors graph.ts interfaces — keep in sync)
// ---------------------------------------------------------------------------

export interface GraphNode {
  id: string;
  label: string;
  kind: "agent" | "skill" | "builtin-agent" | "claude-agent";
  description: string;
  provider?: string;
  x?: number;
  y?: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  label: string;
  kind: "handoff" | "skill-link";
  send: boolean;
}

export interface LayoutResult {
  nodes: GraphNode[];
  edgePaths: Map<string, [number, number][]>;
  reversedEdges: Set<string>;
  selfLoops: GraphEdge[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NODE_RADIUS = 14;
const NODE_WIDTH = NODE_RADIUS * 2 + 120; // horizontal space per node (includes label)
const NODE_HEIGHT = NODE_RADIUS * 2 + 20; // vertical space per node
const LAYER_GAP = 180;
const NODE_GAP = 50;
const PADDING = 60;

// ---------------------------------------------------------------------------
// Cycle breaking — DFS back-edge detection with reversal
// ---------------------------------------------------------------------------

export function breakCycles(
  nodes: GraphNode[],
  edges: GraphEdge[],
): { dagEdges: GraphEdge[]; reversedEdges: Set<string>; selfLoops: GraphEdge[] } {
  const selfLoops: GraphEdge[] = [];
  const nonSelfEdges: GraphEdge[] = [];

  for (const e of edges) {
    if (e.source === e.target) {
      selfLoops.push(e);
    } else {
      nonSelfEdges.push(e);
    }
  }

  const nodeIds = new Set(nodes.map((n) => n.id));
  const adj = new Map<string, GraphEdge[]>();
  for (const id of nodeIds) adj.set(id, []);
  for (const e of nonSelfEdges) {
    adj.get(e.source)?.push(e);
  }

  // DFS states: 0 = unvisited, 1 = in-progress, 2 = done
  const state = new Map<string, number>();
  for (const id of nodeIds) state.set(id, 0);

  const reversedKeys = new Set<string>();

  function dfs(id: string): void {
    state.set(id, 1);
    for (const edge of adj.get(id) ?? []) {
      const targetState = state.get(edge.target);
      if (targetState === 1) {
        // Back-edge → reverse to break cycle
        reversedKeys.add(`${edge.source}->${edge.target}`);
      } else if (targetState === 0) {
        dfs(edge.target);
      }
    }
    state.set(id, 2);
  }

  for (const id of nodeIds) {
    if (state.get(id) === 0) dfs(id);
  }

  // Build DAG edges: reverse the back-edges
  const dagEdges = nonSelfEdges.map((e) => {
    const key = `${e.source}->${e.target}`;
    if (reversedKeys.has(key)) {
      return { ...e, source: e.target, target: e.source };
    }
    return e;
  });

  return { dagEdges, reversedEdges: reversedKeys, selfLoops };
}

// ---------------------------------------------------------------------------
// Main layout function
// ---------------------------------------------------------------------------

export function layoutGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
): LayoutResult {
  const empty: LayoutResult = {
    nodes: [],
    edgePaths: new Map(),
    reversedEdges: new Set(),
    selfLoops: [],
  };

  if (nodes.length === 0) return empty;

  // Single node — no layout needed
  if (nodes.length === 1) {
    return {
      nodes: [{ ...nodes[0], x: PADDING, y: PADDING }],
      edgePaths: new Map(),
      reversedEdges: new Set(),
      selfLoops: edges.filter((e) => e.source === e.target),
    };
  }

  const { dagEdges, reversedEdges, selfLoops } = breakCycles(nodes, edges);

  // Build parent-id map for graphStratify
  const parentMap = new Map<string, string[]>();
  for (const n of nodes) parentMap.set(n.id, []);
  for (const e of dagEdges) {
    parentMap.get(e.target)?.push(e.source);
  }

  // Deduplicate parent lists (multiple edges between same pair)
  for (const [id, parents] of parentMap) {
    parentMap.set(id, [...new Set(parents)]);
  }

  const stratify = graphStratify()
    .id((d: { id: string }) => d.id)
    .parentIds((d: { id: string }) => parentMap.get(d.id) ?? []);

  const dag = stratify(nodes.map((n) => ({ id: n.id })));

  // Configure Sugiyama layout
  const nodeSize: [number, number] = [NODE_HEIGHT, NODE_WIDTH];
  const layout = sugiyama()
    .nodeSize(nodeSize)
    .gap([NODE_GAP, LAYER_GAP])
    .layering(layeringSimplex())
    .decross(decrossTwoLayer())
    .coord(coordQuad())
    .tweaks([tweakShape(nodeSize, shapeEllipse)]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- d3-dag generic variance issue
  layout(dag as any);

  // Extract node positions — d3-dag outputs top-to-bottom, swap for left-to-right
  const posMap = new Map<string, { x: number; y: number }>();
  for (const node of dag.nodes()) {
    posMap.set(node.data.id as string, {
      x: PADDING + node.y, // layer depth → horizontal
      y: PADDING + node.x, // within-layer → vertical
    });
  }

  const positioned = nodes.map((n) => ({
    ...n,
    x: posMap.get(n.id)?.x ?? PADDING,
    y: posMap.get(n.id)?.y ?? PADDING,
  }));

  // Extract edge paths from link control points
  const edgePaths = new Map<string, [number, number][]>();

  for (const link of dag.links()) {
    const srcId = link.source.data.id as string;
    const tgtId = link.target.data.id as string;

    // Swap x/y for left-to-right
    const points: [number, number][] = link.points.map(
      ([x, y]) => [PADDING + y, PADDING + x] as [number, number],
    );

    // Store path under the d3-dag link direction
    const forwardKey = `${srcId}->${tgtId}`;
    edgePaths.set(forwardKey, points);

    // If the reverse direction was a reversed edge, also store a path for it
    const reverseKey = `${tgtId}->${srcId}`;
    if (reversedEdges.has(reverseKey)) {
      edgePaths.set(reverseKey, points.slice().reverse());
    }
  }

  return { nodes: positioned, edgePaths, reversedEdges, selfLoops };
}
