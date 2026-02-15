import { describe, it, expect } from "vitest";
import { buildGraph } from "./graphBuilder.js";
import type { Agent } from "../models/agent.js";
import type { Skill } from "../models/skill.js";

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    name: "TestAgent",
    description: "A test agent",
    tools: [],
    model: [],
    handoffs: [],
    body: "",
    filePath: "test.agent.md",
    ...overrides,
  };
}

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    name: "test-skill",
    description: "A test skill",
    body: "",
    filePath: "SKILL.md",
    ...overrides,
  };
}

describe("buildGraph", () => {
  it("creates nodes for agents and skills", () => {
    const agents = [makeAgent({ name: "Planner" })];
    const skills = [makeSkill({ name: "testing" })];

    const graph = buildGraph(agents, skills);

    expect(graph.nodes).toHaveLength(2);
    expect(graph.nodes).toContainEqual(
      expect.objectContaining({ id: "agent:Planner", kind: "agent" }),
    );
    expect(graph.nodes).toContainEqual(
      expect.objectContaining({ id: "skill:testing", kind: "skill" }),
    );
  });

  it("creates handoff edges between agents", () => {
    const agents = [
      makeAgent({
        name: "Planner",
        handoffs: [
          {
            label: "Implement",
            agent: "implementer",
            prompt: "Go",
            send: false,
          },
        ],
      }),
      makeAgent({ name: "Implementer" }),
    ];

    const graph = buildGraph(agents, []);

    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]).toEqual({
      source: "agent:Planner",
      target: "agent:Implementer",
      label: "Implement",
      kind: "handoff",
      send: false,
    });
  });

  it("matches handoff targets case-insensitively", () => {
    const agents = [
      makeAgent({
        name: "Planner",
        handoffs: [
          { label: "Go", agent: "IMPLEMENTER", prompt: "", send: true },
        ],
      }),
      makeAgent({ name: "Implementer" }),
    ];

    const graph = buildGraph(agents, []);
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0].target).toBe("agent:Implementer");
  });

  it("warns on broken handoff references", () => {
    const agents = [
      makeAgent({
        name: "Planner",
        handoffs: [
          {
            label: "Go",
            agent: "nonexistent",
            prompt: "",
            send: true,
          },
        ],
      }),
    ];

    const graph = buildGraph(agents, []);

    expect(graph.edges).toHaveLength(0);
    expect(graph.warnings).toHaveLength(1);
    expect(graph.warnings[0].message).toContain("nonexistent");
    expect(graph.warnings[0].source).toBe("Planner");
  });

  it("handles the full planner→implementer→reviewer cycle", () => {
    const agents = [
      makeAgent({
        name: "Planner",
        handoffs: [
          { label: "Implement", agent: "implementer", prompt: "", send: false },
        ],
      }),
      makeAgent({
        name: "Implementer",
        handoffs: [
          { label: "Review", agent: "reviewer", prompt: "", send: false },
          { label: "Re-plan", agent: "planner", prompt: "", send: false },
        ],
      }),
      makeAgent({
        name: "Reviewer",
        handoffs: [
          { label: "Fix", agent: "implementer", prompt: "", send: false },
        ],
      }),
    ];

    const graph = buildGraph(agents, []);

    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges).toHaveLength(4);
    expect(graph.warnings).toHaveLength(0);
  });

  it("returns empty graph for no input", () => {
    const graph = buildGraph([], []);
    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
    expect(graph.warnings).toEqual([]);
  });

  it("includes built-in agents when option is set", () => {
    const graph = buildGraph([], [], { includeBuiltins: true });

    const builtinNodes = graph.nodes.filter((n) => n.kind === "builtin-agent");
    expect(builtinNodes.length).toBeGreaterThanOrEqual(3);
    expect(builtinNodes.map((n) => n.label)).toContain("Ask");
    expect(builtinNodes.map((n) => n.label)).toContain("Edit");
    expect(builtinNodes.map((n) => n.label)).toContain("Agent");
  });

  it("excludes built-in agents by default", () => {
    const graph = buildGraph([], []);
    const builtinNodes = graph.nodes.filter((n) => n.kind === "builtin-agent");
    expect(builtinNodes).toHaveLength(0);
  });

  it("uses claude-agent kind for Claude provider agents", () => {
    const agents = [makeAgent({ name: "Researcher", provider: "claude" })];
    const graph = buildGraph(agents, []);

    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0].kind).toBe("claude-agent");
    expect(graph.nodes[0].id).toBe("agent:Researcher");
  });

  it("uses agent kind for Copilot provider agents", () => {
    const agents = [makeAgent({ name: "Planner", provider: "copilot" })];
    const graph = buildGraph(agents, []);

    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0].kind).toBe("agent");
  });

  it("mixes Copilot and Claude agents in the same graph", () => {
    const agents = [
      makeAgent({ name: "Planner", provider: "copilot" }),
      makeAgent({ name: "Researcher", provider: "claude" }),
    ];
    const graph = buildGraph(agents, []);

    expect(graph.nodes).toHaveLength(2);
    const kinds = graph.nodes.map((n) => n.kind).sort();
    expect(kinds).toEqual(["agent", "claude-agent"]);
  });
});
