import { describe, it, expect } from "vitest";
import { breakCycles, layoutGraph } from "./layout.js";
import type { GraphNode, GraphEdge } from "./layout.js";

function makeNode(id: string, kind: GraphNode["kind"] = "agent"): GraphNode {
  return { id, label: id, kind, description: "", provider: "copilot" };
}

function makeEdge(
  source: string,
  target: string,
  label = "",
): GraphEdge {
  return { source, target, label, kind: "handoff", send: true };
}

// ---------------------------------------------------------------------------
// breakCycles
// ---------------------------------------------------------------------------

describe("breakCycles", () => {
  it("returns edges unchanged when graph is acyclic", () => {
    const nodes = [makeNode("A"), makeNode("B"), makeNode("C")];
    const edges = [makeEdge("A", "B"), makeEdge("B", "C")];
    const { dagEdges, reversedEdges, selfLoops } = breakCycles(nodes, edges);

    expect(dagEdges).toHaveLength(2);
    expect(reversedEdges.size).toBe(0);
    expect(selfLoops).toHaveLength(0);
  });

  it("reverses one edge in a 2-node cycle A→B→A", () => {
    const nodes = [makeNode("A"), makeNode("B")];
    const edges = [makeEdge("A", "B"), makeEdge("B", "A")];
    const { dagEdges, reversedEdges } = breakCycles(nodes, edges);

    expect(reversedEdges.size).toBe(1);
    // After breaking, all edges should go in one direction (DAG)
    const sources = new Set(dagEdges.map((e) => e.source));
    const targets = new Set(dagEdges.map((e) => e.target));
    // At least one node has no incoming edges (it's a DAG root)
    const hasRoot = [...sources].some(
      (s) => !targets.has(s) || ![...dagEdges].some((e) => e.target === s),
    );
    expect(dagEdges).toHaveLength(2);
  });

  it("reverses one edge in a 3-node cycle A→B→C→A", () => {
    const nodes = [makeNode("A"), makeNode("B"), makeNode("C")];
    const edges = [
      makeEdge("A", "B"),
      makeEdge("B", "C"),
      makeEdge("C", "A"),
    ];
    const { reversedEdges } = breakCycles(nodes, edges);

    expect(reversedEdges.size).toBe(1);
  });

  it("filters out self-loops", () => {
    const nodes = [makeNode("A"), makeNode("B")];
    const edges = [makeEdge("A", "A"), makeEdge("A", "B")];
    const { dagEdges, selfLoops } = breakCycles(nodes, edges);

    expect(selfLoops).toHaveLength(1);
    expect(selfLoops[0].source).toBe("A");
    expect(dagEdges).toHaveLength(1);
    expect(dagEdges[0].source).toBe("A");
    expect(dagEdges[0].target).toBe("B");
  });

  it("handles disconnected components", () => {
    const nodes = [makeNode("A"), makeNode("B"), makeNode("C"), makeNode("D")];
    const edges = [makeEdge("A", "B"), makeEdge("C", "D")];
    const { dagEdges, reversedEdges } = breakCycles(nodes, edges);

    expect(dagEdges).toHaveLength(2);
    expect(reversedEdges.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// layoutGraph
// ---------------------------------------------------------------------------

describe("layoutGraph", () => {
  it("returns empty result for empty graph", () => {
    const result = layoutGraph([], []);

    expect(result.nodes).toHaveLength(0);
    expect(result.edgePaths.size).toBe(0);
  });

  it("handles single node", () => {
    const nodes = [makeNode("A")];
    const result = layoutGraph(nodes, []);

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].x).toBeDefined();
    expect(result.nodes[0].y).toBeDefined();
  });

  it("assigns positions to all nodes", () => {
    const nodes = [makeNode("A"), makeNode("B"), makeNode("C")];
    const edges = [makeEdge("A", "B"), makeEdge("B", "C")];
    const result = layoutGraph(nodes, edges);

    expect(result.nodes).toHaveLength(3);
    for (const n of result.nodes) {
      expect(n.x).toBeDefined();
      expect(n.y).toBeDefined();
      expect(typeof n.x).toBe("number");
      expect(typeof n.y).toBe("number");
    }
  });

  it("produces left-to-right flow (source x < target x)", () => {
    const nodes = [makeNode("A"), makeNode("B"), makeNode("C")];
    const edges = [makeEdge("A", "B"), makeEdge("B", "C")];
    const result = layoutGraph(nodes, edges);

    const byId = new Map(result.nodes.map((n) => [n.id, n]));
    expect(byId.get("A")!.x!).toBeLessThan(byId.get("B")!.x!);
    expect(byId.get("B")!.x!).toBeLessThan(byId.get("C")!.x!);
  });

  it("returns edge paths for all edges", () => {
    const nodes = [makeNode("A"), makeNode("B")];
    const edges = [makeEdge("A", "B")];
    const result = layoutGraph(nodes, edges);

    expect(result.edgePaths.size).toBe(1);
    const path = result.edgePaths.get("A->B");
    expect(path).toBeDefined();
    expect(path!.length).toBeGreaterThanOrEqual(2);
    // Each point should be [x, y]
    for (const pt of path!) {
      expect(pt).toHaveLength(2);
      expect(typeof pt[0]).toBe("number");
      expect(typeof pt[1]).toBe("number");
    }
  });

  it("identifies reversed edges in a cycle", () => {
    const nodes = [makeNode("A"), makeNode("B")];
    const edges = [makeEdge("A", "B"), makeEdge("B", "A")];
    const result = layoutGraph(nodes, edges);

    expect(result.reversedEdges.size).toBe(1);
    // Both edges should have paths
    expect(result.edgePaths.size).toBe(2);
  });

  it("separates self-loops from layout edges", () => {
    const nodes = [makeNode("A"), makeNode("B")];
    const edges = [makeEdge("A", "A"), makeEdge("A", "B")];
    const result = layoutGraph(nodes, edges);

    expect(result.selfLoops).toHaveLength(1);
    expect(result.selfLoops[0].source).toBe("A");
    expect(result.edgePaths.size).toBe(1);
  });

  it("handles isolated nodes (no edges)", () => {
    const nodes = [makeNode("A"), makeNode("B"), makeNode("C")];
    const edges = [makeEdge("A", "B")]; // C is isolated
    const result = layoutGraph(nodes, edges);

    expect(result.nodes).toHaveLength(3);
    const c = result.nodes.find((n) => n.id === "C");
    expect(c?.x).toBeDefined();
    expect(c?.y).toBeDefined();
  });

  it("preserves node properties through layout", () => {
    const nodes = [
      { ...makeNode("A"), kind: "skill" as const, description: "desc-A" },
      makeNode("B"),
    ];
    const edges = [makeEdge("A", "B")];
    const result = layoutGraph(nodes, edges);

    const a = result.nodes.find((n) => n.id === "A");
    expect(a?.kind).toBe("skill");
    expect(a?.description).toBe("desc-A");
  });

  it("handles diamond-shaped DAG (branching + converging)", () => {
    const nodes = [
      makeNode("A"),
      makeNode("B"),
      makeNode("C"),
      makeNode("D"),
    ];
    const edges = [
      makeEdge("A", "B"),
      makeEdge("A", "C"),
      makeEdge("B", "D"),
      makeEdge("C", "D"),
    ];
    const result = layoutGraph(nodes, edges);

    const byId = new Map(result.nodes.map((n) => [n.id, n]));
    // A should be leftmost, D rightmost
    expect(byId.get("A")!.x!).toBeLessThan(byId.get("D")!.x!);
    // B and C should be at the same x (same layer)
    expect(byId.get("B")!.x!).toBeCloseTo(byId.get("C")!.x!, 0);
    // B and C at different y
    expect(byId.get("B")!.y!).not.toBeCloseTo(byId.get("C")!.y!, 0);
  });
});
