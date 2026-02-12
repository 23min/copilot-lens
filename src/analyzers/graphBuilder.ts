import type { Agent } from "../models/agent.js";
import type { Skill } from "../models/skill.js";
import type { Graph, GraphNode, GraphEdge, GraphWarning } from "../models/graph.js";

export interface BuildGraphOptions {
  includeBuiltins?: boolean;
}

const BUILTIN_AGENTS: { name: string; description: string }[] = [
  { name: "Ask", description: "General-purpose Copilot chat" },
  { name: "Edit", description: "Edit code in the workspace" },
  { name: "Agent", description: "Autonomous multi-step agent" },
];

export function buildGraph(
  agents: Agent[],
  skills: Skill[],
  options: BuildGraphOptions = {},
): Graph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const warnings: GraphWarning[] = [];

  // Index agent names (lowercase) → canonical name for lookup
  const agentNameMap = new Map<string, string>();
  for (const agent of agents) {
    agentNameMap.set(agent.name.toLowerCase(), agent.name);
  }

  // Add agent nodes
  for (const agent of agents) {
    nodes.push({
      id: `agent:${agent.name}`,
      label: agent.name,
      kind: "agent",
      description: agent.description,
      filePath: agent.filePath,
    });
  }

  // Add skill nodes
  for (const skill of skills) {
    nodes.push({
      id: `skill:${skill.name}`,
      label: skill.name,
      kind: "skill",
      description: skill.description,
      filePath: skill.filePath,
    });
  }

  // Add built-in agents if requested
  if (options.includeBuiltins) {
    for (const builtin of BUILTIN_AGENTS) {
      agentNameMap.set(builtin.name.toLowerCase(), builtin.name);
      nodes.push({
        id: `builtin:${builtin.name}`,
        label: builtin.name,
        kind: "builtin-agent",
        description: builtin.description,
      });
    }
  }

  // Build handoff edges
  for (const agent of agents) {
    for (const handoff of agent.handoffs) {
      const targetName = agentNameMap.get(handoff.agent.toLowerCase());

      if (!targetName) {
        warnings.push({
          message: `Handoff target "${handoff.agent}" not found`,
          source: agent.name,
        });
        continue;
      }

      const targetId = agents.some((a) => a.name === targetName)
        ? `agent:${targetName}`
        : `builtin:${targetName}`;

      edges.push({
        source: `agent:${agent.name}`,
        target: targetId,
        label: handoff.label,
        kind: "handoff",
        send: handoff.send,
      });
    }
  }

  return { nodes, edges, warnings };
}
