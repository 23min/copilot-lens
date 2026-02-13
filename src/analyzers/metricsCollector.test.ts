import { describe, it, expect } from "vitest";
import { collectMetrics } from "./metricsCollector.js";
import type { Session } from "../models/session.js";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    sessionId: "s1",
    title: null,
    creationDate: Date.now(),
    requests: [],
    source: "jsonl",
    ...overrides,
  };
}

const SESSIONS: Session[] = [
  makeSession({
    sessionId: "s1",
    requests: [
      {
        requestId: "r1",
        timestamp: new Date("2026-02-10T10:00:00Z").getTime(),
        agentId: "github.copilot.editsAgent",
        customAgentName: "Planner",
        modelId: "copilot/claude-opus-4.6",
        messageText: "Plan this feature",
        timings: { firstProgress: 2000, totalElapsed: 5000 },
        usage: { promptTokens: 1000, completionTokens: 200 },
        toolCalls: [
          { id: "tc1", name: "read_file" },
          { id: "tc2", name: "list_dir" },
        ],
        availableSkills: [
          { name: "testing", file: "/path/SKILL.md" },
          { name: "vscode-extensions", file: "/path/SKILL.md" },
        ],
        loadedSkills: ["testing"],
      },
      {
        requestId: "r2",
        timestamp: new Date("2026-02-10T10:05:00Z").getTime(),
        agentId: "github.copilot.editsAgent",
        customAgentName: "Implementer",
        modelId: "copilot/claude-opus-4.6",
        messageText: "Implement it",
        timings: { firstProgress: 1500, totalElapsed: 8000 },
        usage: { promptTokens: 2000, completionTokens: 500 },
        toolCalls: [
          { id: "tc3", name: "read_file" },
          { id: "tc4", name: "write_file" },
          { id: "tc5", name: "read_file" },
        ],
        availableSkills: [],
        loadedSkills: [],
      },
    ],
  }),
  makeSession({
    sessionId: "s2",
    requests: [
      {
        requestId: "r3",
        timestamp: new Date("2026-02-11T14:00:00Z").getTime(),
        agentId: "github.copilot.editsAgent",
        customAgentName: null,
        modelId: "copilot/gpt-4o",
        messageText: "Quick question",
        timings: { firstProgress: 500, totalElapsed: 1000 },
        usage: { promptTokens: 500, completionTokens: 100 },
        toolCalls: [],
        availableSkills: [],
        loadedSkills: [],
      },
    ],
  }),
];

describe("collectMetrics", () => {
  it("counts sessions and requests", () => {
    const metrics = collectMetrics(SESSIONS, [], []);
    expect(metrics.totalSessions).toBe(2);
    expect(metrics.totalRequests).toBe(3);
  });

  it("aggregates token usage", () => {
    const metrics = collectMetrics(SESSIONS, [], []);
    expect(metrics.totalTokens.prompt).toBe(3500);
    expect(metrics.totalTokens.completion).toBe(800);
  });

  it("counts agent usage with custom agent names", () => {
    const metrics = collectMetrics(SESSIONS, [], []);
    const planner = metrics.agentUsage.find((a) => a.name === "Planner");
    const implementer = metrics.agentUsage.find((a) => a.name === "Implementer");
    const defaultAgent = metrics.agentUsage.find(
      (a) => a.name === "github.copilot.editsAgent",
    );

    expect(planner?.count).toBe(1);
    expect(implementer?.count).toBe(1);
    expect(defaultAgent?.count).toBe(1);
  });

  it("counts model usage", () => {
    const metrics = collectMetrics(SESSIONS, [], []);
    const claude = metrics.modelUsage.find(
      (m) => m.name === "copilot/claude-opus-4.6",
    );
    const gpt = metrics.modelUsage.find((m) => m.name === "copilot/gpt-4o");

    expect(claude?.count).toBe(2);
    expect(gpt?.count).toBe(1);
  });

  it("counts tool usage", () => {
    const metrics = collectMetrics(SESSIONS, [], []);
    const readFile = metrics.toolUsage.find((t) => t.name === "read_file");
    const listDir = metrics.toolUsage.find((t) => t.name === "list_dir");
    const writeFile = metrics.toolUsage.find((t) => t.name === "write_file");

    expect(readFile?.count).toBe(3);
    expect(listDir?.count).toBe(1);
    expect(writeFile?.count).toBe(1);
  });

  it("counts skill usage", () => {
    const metrics = collectMetrics(SESSIONS, [], []);
    const testing = metrics.skillUsage.find((s) => s.name === "testing");
    expect(testing?.count).toBe(1);
  });

  it("groups activity by date", () => {
    const metrics = collectMetrics(SESSIONS, [], []);
    expect(metrics.activity).toHaveLength(2);
    const feb10 = metrics.activity.find((a) => a.date === "2026-02-10");
    const feb11 = metrics.activity.find((a) => a.date === "2026-02-11");
    expect(feb10?.count).toBe(2);
    expect(feb11?.count).toBe(1);
  });

  it("detects unused agents", () => {
    const definedAgents = ["Planner", "Implementer", "Reviewer"];
    const metrics = collectMetrics(SESSIONS, definedAgents, []);
    expect(metrics.unusedAgents).toEqual(["Reviewer"]);
  });

  it("detects unused skills", () => {
    const definedSkills = ["testing", "vscode-extensions"];
    const metrics = collectMetrics(SESSIONS, [], definedSkills);
    expect(metrics.unusedSkills).toEqual(["vscode-extensions"]);
  });

  it("sorts usage entries by count descending", () => {
    const metrics = collectMetrics(SESSIONS, [], []);
    for (let i = 1; i < metrics.toolUsage.length; i++) {
      expect(metrics.toolUsage[i - 1].count).toBeGreaterThanOrEqual(
        metrics.toolUsage[i].count,
      );
    }
  });

  it("handles empty sessions", () => {
    const metrics = collectMetrics([], [], []);
    expect(metrics.totalSessions).toBe(0);
    expect(metrics.totalRequests).toBe(0);
    expect(metrics.agentUsage).toEqual([]);
  });
});
