import { describe, it, expect } from "vitest";
import { parseAgent } from "./agentParser.js";

const PLANNER_FIXTURE = `---
name: Planner
description: Design and plan implementation tasks. Use this when discussing architecture, making technical decisions, or breaking down features into steps.
tools: ['search', 'fetch', 'githubRepo']
model: ['Claude Sonnet 4.5', 'GPT-4o']
handoffs:
  - label: Start Implementation
    agent: implementer
    prompt: Implement the plan outlined above.
    send: false
---

You are a planning assistant. When asked to plan or design something:

1. Understand the requirements and constraints
2. Identify key technical decisions
3. Break the work into ordered steps
4. Flag risks or open questions

Keep plans concise and actionable.`;

const IMPLEMENTER_FIXTURE = `---
name: Implementer
description: Write and modify code.
tools: ['search', 'read', 'write', 'terminal', 'usages']
model: ['Claude Sonnet 4.5', 'GPT-4o']
handoffs:
  - label: Review Code
    agent: reviewer
    prompt: Review the implementation above.
    send: false
  - label: Back to Planning
    agent: planner
    prompt: Let's revisit the plan.
    send: false
---

You are an implementation assistant.`;

describe("parseAgent", () => {
  it("parses a complete agent file", () => {
    const agent = parseAgent(PLANNER_FIXTURE, ".github/agents/planner.agent.md");

    expect(agent.name).toBe("Planner");
    expect(agent.description).toBe(
      "Design and plan implementation tasks. Use this when discussing architecture, making technical decisions, or breaking down features into steps.",
    );
    expect(agent.tools).toEqual(["search", "fetch", "githubRepo"]);
    expect(agent.model).toEqual(["Claude Sonnet 4.5", "GPT-4o"]);
    expect(agent.filePath).toBe(".github/agents/planner.agent.md");
    expect(agent.body).toContain("You are a planning assistant.");
  });

  it("parses handoffs correctly", () => {
    const agent = parseAgent(PLANNER_FIXTURE, "planner.agent.md");

    expect(agent.handoffs).toHaveLength(1);
    expect(agent.handoffs[0]).toEqual({
      label: "Start Implementation",
      agent: "implementer",
      prompt: "Implement the plan outlined above.",
      send: false,
    });
  });

  it("parses multiple handoffs", () => {
    const agent = parseAgent(IMPLEMENTER_FIXTURE, "implementer.agent.md");

    expect(agent.handoffs).toHaveLength(2);
    expect(agent.handoffs[0].agent).toBe("reviewer");
    expect(agent.handoffs[1].agent).toBe("planner");
  });

  it("defaults send to true when not specified", () => {
    const content = `---
name: Simple
description: A simple agent
handoffs:
  - label: Next
    agent: other
    prompt: Continue.
---

Body.`;
    const agent = parseAgent(content, "simple.agent.md");
    expect(agent.handoffs[0].send).toBe(true);
  });

  it("defaults to empty arrays when tools/model/handoffs missing", () => {
    const content = `---
name: Minimal
description: Bare minimum agent
---

Body.`;
    const agent = parseAgent(content, "minimal.agent.md");
    expect(agent.tools).toEqual([]);
    expect(agent.model).toEqual([]);
    expect(agent.handoffs).toEqual([]);
  });

  it("returns a warning agent when name is missing", () => {
    const content = `---
description: No name field
---

Body.`;
    const agent = parseAgent(content, "noname.agent.md");
    expect(agent.name).toBe("noname");
  });

  it("returns a warning agent for empty content", () => {
    const agent = parseAgent("", "empty.agent.md");
    expect(agent.name).toBe("empty");
    expect(agent.body).toBe("");
  });
});
