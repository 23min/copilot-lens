import { describe, it, expect } from "vitest";
import { parseSessionJsonl, parseChatReplay } from "./sessionParser.js";

const JSONL_FIXTURE = [
  JSON.stringify({
    kind: 0,
    v: {
      version: 3,
      creationDate: 1770929049693,
      sessionId: "test-session-id",
      requests: [],
    },
  }),
  JSON.stringify({
    kind: 2,
    k: ["requests"],
    v: [
      {
        requestId: "req-1",
        timestamp: 1770929089337,
        agent: {
          id: "github.copilot.editsAgent",
          name: "agent",
        },
        modelId: "copilot/claude-opus-4.6",
        message: { text: "Hello world" },
        response: [],
      },
    ],
  }),
  JSON.stringify({
    kind: 1,
    k: ["requests", 0, "result"],
    v: {
      timings: { firstProgress: 2000, totalElapsed: 5000 },
      metadata: {
        toolCallRounds: [
          {
            toolCalls: [
              { id: "tc-1", name: "read_file" },
              { id: "tc-2", name: "list_dir" },
            ],
          },
        ],
        renderedUserMessage: [
          {
            value:
              'Some text <modeInstructions>\nYou are currently running in "Planner" mode.\n</modeInstructions>\n<skills>\n<skill>\n<name>testing</name>\n<description>Test skill</description>\n<file>/repo/SKILL.md</file>\n</skill>\n</skills>',
          },
        ],
        toolCallResults: {
          "tc-1": {
            content: [{ value: '{"filePath": "/repo/.github/skills/testing/SKILL.md"}' }],
          },
        },
      },
      usage: { promptTokens: 1000, completionTokens: 200 },
    },
  }),
  JSON.stringify({
    kind: 1,
    k: ["customTitle"],
    v: "Test Session Title",
  }),
].join("\n");

describe("parseSessionJsonl", () => {
  it("reconstructs a session from JSONL lines", () => {
    const session = parseSessionJsonl(JSONL_FIXTURE);

    expect(session.sessionId).toBe("test-session-id");
    expect(session.title).toBe("Test Session Title");
    expect(session.creationDate).toBe(1770929049693);
    expect(session.source).toBe("jsonl");
    expect(session.requests).toHaveLength(1);
  });

  it("extracts request metadata", () => {
    const session = parseSessionJsonl(JSONL_FIXTURE);
    const req = session.requests[0];

    expect(req.requestId).toBe("req-1");
    expect(req.timestamp).toBe(1770929089337);
    expect(req.agentId).toBe("github.copilot.editsAgent");
    expect(req.modelId).toBe("copilot/claude-opus-4.6");
    expect(req.messageText).toBe("Hello world");
  });

  it("extracts timings and usage", () => {
    const session = parseSessionJsonl(JSONL_FIXTURE);
    const req = session.requests[0];

    expect(req.timings.firstProgress).toBe(2000);
    expect(req.timings.totalElapsed).toBe(5000);
    expect(req.usage.promptTokens).toBe(1000);
    expect(req.usage.completionTokens).toBe(200);
  });

  it("extracts tool calls", () => {
    const session = parseSessionJsonl(JSONL_FIXTURE);
    const req = session.requests[0];

    expect(req.toolCalls).toHaveLength(2);
    expect(req.toolCalls[0].name).toBe("read_file");
    expect(req.toolCalls[1].name).toBe("list_dir");
  });

  it("detects custom agent from modeInstructions", () => {
    const session = parseSessionJsonl(JSONL_FIXTURE);
    expect(session.requests[0].customAgentName).toBe("Planner");
  });

  it("detects available skills", () => {
    const session = parseSessionJsonl(JSONL_FIXTURE);
    expect(session.requests[0].availableSkills).toHaveLength(1);
    expect(session.requests[0].availableSkills[0].name).toBe("testing");
  });

  it("handles empty JSONL", () => {
    const session = parseSessionJsonl("");
    expect(session.sessionId).toBe("unknown");
    expect(session.requests).toEqual([]);
  });

  it("detects custom agent from inputState.mode in initial state", () => {
    const lines = [
      JSON.stringify({
        kind: 0,
        v: {
          sessionId: "s1",
          creationDate: 0,
          requests: [],
          inputState: {
            mode: {
              id: "file:///repo/.github/agents/planner.agent.md",
              kind: "agent",
            },
          },
        },
      }),
      JSON.stringify({
        kind: 2,
        k: ["requests"],
        v: [
          {
            requestId: "req-1",
            timestamp: 0,
            agent: { id: "github.copilot.editsAgent" },
            modelId: "copilot/claude-sonnet-4",
            message: { text: "plan this" },
          },
        ],
      }),
    ].join("\n");

    const session = parseSessionJsonl(lines);
    expect(session.requests[0].customAgentName).toBe("planner");
  });

  it("tracks mode changes between requests", () => {
    const lines = [
      JSON.stringify({
        kind: 0,
        v: {
          sessionId: "s2",
          creationDate: 0,
          requests: [],
          inputState: {
            mode: {
              id: "file:///repo/.github/agents/planner.agent.md",
              kind: "agent",
            },
          },
        },
      }),
      JSON.stringify({
        kind: 2,
        k: ["requests"],
        v: [
          {
            requestId: "req-1",
            timestamp: 0,
            agent: { id: "github.copilot.editsAgent" },
            modelId: "m1",
            message: { text: "first" },
          },
        ],
      }),
      // Mode switches to architect
      JSON.stringify({
        kind: 1,
        k: ["inputState", "mode"],
        v: {
          id: "file:///repo/.github/agents/architect.agent.md",
          kind: "agent",
        },
      }),
      JSON.stringify({
        kind: 2,
        k: ["requests"],
        v: [
          {
            requestId: "req-2",
            timestamp: 1,
            agent: { id: "github.copilot.editsAgent" },
            modelId: "m1",
            message: { text: "second" },
          },
        ],
      }),
      // Mode switches to tester
      JSON.stringify({
        kind: 1,
        k: ["inputState", "mode"],
        v: {
          id: "file:///repo/.github/agents/tester.agent.md",
          kind: "agent",
        },
      }),
      JSON.stringify({
        kind: 2,
        k: ["requests"],
        v: [
          {
            requestId: "req-3",
            timestamp: 2,
            agent: { id: "github.copilot.editsAgent" },
            modelId: "m1",
            message: { text: "third" },
          },
        ],
      }),
    ].join("\n");

    const session = parseSessionJsonl(lines);
    expect(session.requests).toHaveLength(3);
    expect(session.requests[0].customAgentName).toBe("planner");
    expect(session.requests[1].customAgentName).toBe("architect");
    expect(session.requests[2].customAgentName).toBe("tester");
  });

  it("falls back to modeInstructions when no inputState.mode", () => {
    // The original JSONL_FIXTURE has no inputState.mode but has
    // renderedUserMessage with modeInstructions — should still detect "Planner"
    const session = parseSessionJsonl(JSONL_FIXTURE);
    expect(session.requests[0].customAgentName).toBe("Planner");
  });
});

const CHATREPLAY_FIXTURE = JSON.stringify({
  exportedAt: "2026-02-12T21:13:03.592Z",
  totalPrompts: 1,
  totalLogEntries: 2,
  prompts: [
    {
      prompt: "Hello from chatreplay",
      promptId: "prompt-1",
      logs: [
        {
          id: "log-1",
          kind: "request",
          type: "ChatMLSuccess",
          name: "panel/editAgent",
          metadata: {
            model: "claude-opus-4.6",
            duration: 5000,
            timeToFirstToken: 2000,
            startTime: "2026-02-12T21:04:30.522Z",
            endTime: "2026-02-12T21:04:35.379Z",
            usage: { prompt_tokens: 1500, completion_tokens: 300 },
          },
          requestMessages: {
            messages: [
              {
                role: "system",
                content:
                  '<modeInstructions>\nYou are currently running in "Reviewer" mode.\n</modeInstructions>',
              },
            ],
          },
          response: { type: "success", message: ["Response text"] },
        },
        {
          id: "tool-1",
          kind: "toolCall",
          tool: "read_file",
          args: '{"filePath": "/repo/.github/skills/testing/SKILL.md"}',
          time: "2026-02-12T21:04:35.000Z",
          response: ["file contents"],
        },
      ],
    },
  ],
});

describe("parseChatReplay", () => {
  it("parses a chatreplay export", () => {
    const session = parseChatReplay(CHATREPLAY_FIXTURE);

    expect(session.source).toBe("chatreplay");
    expect(session.requests).toHaveLength(1);
  });

  it("extracts request data from chatreplay", () => {
    const session = parseChatReplay(CHATREPLAY_FIXTURE);
    const req = session.requests[0];

    expect(req.messageText).toBe("Hello from chatreplay");
    expect(req.modelId).toBe("claude-opus-4.6");
    expect(req.timings.totalElapsed).toBe(5000);
    expect(req.timings.firstProgress).toBe(2000);
    expect(req.usage.promptTokens).toBe(1500);
    expect(req.usage.completionTokens).toBe(300);
  });

  it("detects custom agent from chatreplay", () => {
    const session = parseChatReplay(CHATREPLAY_FIXTURE);
    expect(session.requests[0].customAgentName).toBe("Reviewer");
  });

  it("detects loaded skills from tool calls", () => {
    const session = parseChatReplay(CHATREPLAY_FIXTURE);
    expect(session.requests[0].loadedSkills).toContain("testing");
  });
});
