import { describe, it, expect } from "vitest";
import {
  parseClaudeSessionJsonl,
  buildSubagentTypeMap,
} from "./claudeSessionParser.js";

function userLine(text: string, uuid: string): string {
  return JSON.stringify({
    type: "user",
    sessionId: "sess-1",
    uuid,
    parentUuid: null,
    isSidechain: false,
    timestamp: "2026-02-14T10:00:00.000Z",
    message: {
      role: "user",
      content: [{ type: "text", text }],
    },
  });
}

function assistantLine(opts: {
  uuid: string;
  parentUuid: string;
  model?: string;
  content?: unknown[];
  usage?: Record<string, number>;
  isSidechain?: boolean;
  timestamp?: string;
}): string {
  return JSON.stringify({
    type: "assistant",
    sessionId: "sess-1",
    uuid: opts.uuid,
    parentUuid: opts.parentUuid,
    isSidechain: opts.isSidechain ?? false,
    timestamp: opts.timestamp ?? "2026-02-14T10:00:01.000Z",
    message: {
      model: opts.model ?? "claude-opus-4-6",
      role: "assistant",
      content: opts.content ?? [{ type: "text", text: "Hello" }],
      usage: {
        input_tokens: opts.usage?.input_tokens ?? 100,
        output_tokens: opts.usage?.output_tokens ?? 50,
        cache_read_input_tokens: opts.usage?.cache_read_input_tokens ?? 0,
        cache_creation_input_tokens:
          opts.usage?.cache_creation_input_tokens ?? 0,
      },
    },
  });
}

function progressLine(): string {
  return JSON.stringify({
    type: "progress",
    sessionId: "sess-1",
    uuid: "prog-1",
    data: { type: "hook_progress" },
    timestamp: "2026-02-14T10:00:00.500Z",
  });
}

const BASIC_SESSION = [
  userLine("Hello world", "u1"),
  assistantLine({ uuid: "a1", parentUuid: "u1" }),
].join("\n");

describe("parseClaudeSessionJsonl", () => {
  it("parses a basic session with one exchange", () => {
    const session = parseClaudeSessionJsonl(BASIC_SESSION, null);

    expect(session.sessionId).toBe("sess-1");
    expect(session.source).toBe("claude");
    expect(session.provider).toBe("claude");
    expect(session.requests).toHaveLength(1);
  });

  it("uses summary as title when provided", () => {
    const session = parseClaudeSessionJsonl(BASIC_SESSION, "My Summary");
    expect(session.title).toBe("My Summary");
  });

  it("falls back to null title when no summary", () => {
    const session = parseClaudeSessionJsonl(BASIC_SESSION, null);
    expect(session.title).toBeNull();
  });

  it("sets creationDate from first message timestamp", () => {
    const session = parseClaudeSessionJsonl(BASIC_SESSION, null);
    expect(session.creationDate).toBe(
      new Date("2026-02-14T10:00:00.000Z").getTime(),
    );
  });

  it("extracts request metadata", () => {
    const session = parseClaudeSessionJsonl(BASIC_SESSION, null);
    const req = session.requests[0];

    expect(req.requestId).toBe("a1");
    expect(req.modelId).toBe("claude-opus-4-6");
    expect(req.agentId).toBe("claude-code");
    expect(req.messageText).toBe("Hello world");
    expect(req.timestamp).toBe(
      new Date("2026-02-14T10:00:01.000Z").getTime(),
    );
  });

  it("extracts token usage", () => {
    const session = parseClaudeSessionJsonl(BASIC_SESSION, null);
    const req = session.requests[0];

    expect(req.usage.promptTokens).toBe(100);
    expect(req.usage.completionTokens).toBe(50);
  });

  it("extracts tool calls from content blocks", () => {
    const content = [
      { type: "text", text: "Let me read that file." },
      { type: "tool_use", id: "toolu_1", name: "Read", input: {} },
      { type: "tool_use", id: "toolu_2", name: "Grep", input: {} },
    ];

    const lines = [
      userLine("check the code", "u1"),
      assistantLine({ uuid: "a1", parentUuid: "u1", content }),
    ].join("\n");

    const session = parseClaudeSessionJsonl(lines, null);
    expect(session.requests[0].toolCalls).toHaveLength(2);
    expect(session.requests[0].toolCalls[0]).toEqual({
      id: "toolu_1",
      name: "Read",
    });
    expect(session.requests[0].toolCalls[1]).toEqual({
      id: "toolu_2",
      name: "Grep",
    });
  });

  it("aggregates multiple assistant messages into one request per user turn", () => {
    // Claude often sends multiple assistant lines for a single response
    // (text, then tool_use, then more text after tool_result)
    // We treat each assistant line as a separate request
    const lines = [
      userLine("do something", "u1"),
      assistantLine({
        uuid: "a1",
        parentUuid: "u1",
        content: [{ type: "text", text: "thinking..." }],
        usage: { input_tokens: 100, output_tokens: 20 },
      }),
      assistantLine({
        uuid: "a2",
        parentUuid: "a1",
        content: [
          { type: "tool_use", id: "t1", name: "Read", input: {} },
        ],
        usage: { input_tokens: 200, output_tokens: 30 },
      }),
    ].join("\n");

    const session = parseClaudeSessionJsonl(lines, null);
    expect(session.requests).toHaveLength(2);
    expect(session.requests[0].usage.promptTokens).toBe(100);
    expect(session.requests[0].messageText).toBe("do something");
    expect(session.requests[1].toolCalls).toHaveLength(1);
    expect(session.requests[1].messageText).toBe("");
  });

  it("skips sidechain (subagent) messages", () => {
    const lines = [
      userLine("hello", "u1"),
      assistantLine({ uuid: "a1", parentUuid: "u1" }),
      assistantLine({
        uuid: "a2",
        parentUuid: "u1",
        isSidechain: true,
      }),
    ].join("\n");

    const session = parseClaudeSessionJsonl(lines, null);
    expect(session.requests).toHaveLength(1);
  });

  it("skips progress and other non-message lines", () => {
    const lines = [
      userLine("hi", "u1"),
      progressLine(),
      assistantLine({ uuid: "a1", parentUuid: "u1" }),
    ].join("\n");

    const session = parseClaudeSessionJsonl(lines, null);
    expect(session.requests).toHaveLength(1);
  });

  it("handles empty content", () => {
    const session = parseClaudeSessionJsonl("", null);
    expect(session.sessionId).toBe("unknown");
    expect(session.requests).toEqual([]);
  });

  it("handles malformed lines gracefully", () => {
    const lines = [
      "not json at all",
      userLine("hello", "u1"),
      "{ broken json",
      assistantLine({ uuid: "a1", parentUuid: "u1" }),
    ].join("\n");

    const session = parseClaudeSessionJsonl(lines, null);
    expect(session.requests).toHaveLength(1);
  });

  it("handles multiple user-assistant exchanges", () => {
    const lines = [
      userLine("first question", "u1"),
      assistantLine({
        uuid: "a1",
        parentUuid: "u1",
        timestamp: "2026-02-14T10:00:01.000Z",
      }),
      userLine("second question", "u2"),
      assistantLine({
        uuid: "a2",
        parentUuid: "u2",
        timestamp: "2026-02-14T10:01:00.000Z",
      }),
    ].join("\n");

    const session = parseClaudeSessionJsonl(lines, null);
    expect(session.requests).toHaveLength(2);
    expect(session.requests[0].messageText).toBe("first question");
    expect(session.requests[1].messageText).toBe("second question");
  });

  it("sets empty skills/agent fields (Claude has no Copilot skills)", () => {
    const session = parseClaudeSessionJsonl(BASIC_SESSION, null);
    const req = session.requests[0];

    expect(req.customAgentName).toBeNull();
    expect(req.availableSkills).toEqual([]);
    expect(req.loadedSkills).toEqual([]);
  });

  it("sets timings to null (not available in Claude format)", () => {
    const session = parseClaudeSessionJsonl(BASIC_SESSION, null);
    const req = session.requests[0];

    expect(req.timings.firstProgress).toBeNull();
    expect(req.timings.totalElapsed).toBeNull();
  });

  it("extracts cache token usage", () => {
    const lines = [
      userLine("hello", "u1"),
      assistantLine({
        uuid: "a1",
        parentUuid: "u1",
        usage: {
          input_tokens: 3,
          output_tokens: 10,
          cache_read_input_tokens: 18019,
          cache_creation_input_tokens: 2620,
        },
      }),
    ].join("\n");

    const session = parseClaudeSessionJsonl(lines, null);
    const req = session.requests[0];

    expect(req.usage.promptTokens).toBe(3);
    expect(req.usage.completionTokens).toBe(10);
    expect(req.usage.cacheReadTokens).toBe(18019);
    expect(req.usage.cacheCreationTokens).toBe(2620);
  });

  it("defaults cache tokens to 0 when not present", () => {
    const lines = [
      userLine("hello", "u1"),
      assistantLine({
        uuid: "a1",
        parentUuid: "u1",
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    ].join("\n");

    const session = parseClaudeSessionJsonl(lines, null);
    const req = session.requests[0];

    expect(req.usage.cacheReadTokens).toBe(0);
    expect(req.usage.cacheCreationTokens).toBe(0);
  });

  it("handles string content gracefully", () => {
    const lines = [
      JSON.stringify({
        type: "user",
        sessionId: "sess-1",
        uuid: "u1",
        timestamp: "2026-02-14T10:00:00.000Z",
        message: { role: "user", content: "plain string content" },
      }),
      assistantLine({ uuid: "a1", parentUuid: "u1" }),
    ].join("\n");

    const session = parseClaudeSessionJsonl(lines, null);
    expect(session.requests).toHaveLength(1);
    expect(session.requests[0].messageText).toBe("plain string content");
  });
});

// --- Subagent helpers ---

function taskToolUseLine(opts: {
  uuid: string;
  parentUuid: string;
  toolId: string;
  subagentType: string;
  description: string;
  timestamp?: string;
}): string {
  return JSON.stringify({
    type: "assistant",
    sessionId: "sess-1",
    uuid: opts.uuid,
    parentUuid: opts.parentUuid,
    isSidechain: false,
    timestamp: opts.timestamp ?? "2026-02-14T10:00:02.000Z",
    message: {
      model: "claude-opus-4-6",
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: opts.toolId,
          name: "Task",
          input: {
            description: opts.description,
            subagent_type: opts.subagentType,
            prompt: "do something",
          },
        },
      ],
      usage: { input_tokens: 50, output_tokens: 10 },
    },
  });
}

function taskToolResultLine(opts: {
  uuid: string;
  parentUuid: string;
  toolUseId: string;
  agentId: string;
  timestamp?: string;
}): string {
  return JSON.stringify({
    type: "user",
    sessionId: "sess-1",
    uuid: opts.uuid,
    parentUuid: opts.parentUuid,
    isSidechain: false,
    timestamp: opts.timestamp ?? "2026-02-14T10:00:05.000Z",
    message: {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: opts.toolUseId,
          content: [
            {
              type: "text",
              text: `Result text here\nagentId: ${opts.agentId} (for resuming to continue this agent's work if needed)`,
            },
          ],
        },
      ],
    },
  });
}

function subagentUserLine(opts: {
  uuid: string;
  agentId: string;
  timestamp?: string;
}): string {
  return JSON.stringify({
    type: "user",
    sessionId: "sess-1",
    uuid: opts.uuid,
    parentUuid: null,
    isSidechain: true,
    agentId: opts.agentId,
    timestamp: opts.timestamp ?? "2026-02-14T10:00:03.000Z",
    message: {
      role: "user",
      content: [{ type: "text", text: "subagent prompt" }],
    },
  });
}

function subagentAssistantLine(opts: {
  uuid: string;
  parentUuid: string;
  agentId: string;
  model?: string;
  content?: unknown[];
  usage?: Record<string, number>;
  timestamp?: string;
}): string {
  return JSON.stringify({
    type: "assistant",
    sessionId: "sess-1",
    uuid: opts.uuid,
    parentUuid: opts.parentUuid,
    isSidechain: true,
    agentId: opts.agentId,
    timestamp: opts.timestamp ?? "2026-02-14T10:00:04.000Z",
    message: {
      model: opts.model ?? "claude-opus-4-6",
      role: "assistant",
      content: opts.content ?? [{ type: "text", text: "subagent response" }],
      usage: {
        input_tokens: opts.usage?.input_tokens ?? 200,
        output_tokens: opts.usage?.output_tokens ?? 80,
        cache_read_input_tokens: opts.usage?.cache_read_input_tokens ?? 0,
        cache_creation_input_tokens:
          opts.usage?.cache_creation_input_tokens ?? 0,
      },
    },
  });
}

describe("buildSubagentTypeMap", () => {
  it("extracts agentId to subagentType mapping from Task tool calls", () => {
    const lines = [
      userLine("do something", "u1"),
      taskToolUseLine({
        uuid: "a1",
        parentUuid: "u1",
        toolId: "toolu_1",
        subagentType: "Explore",
        description: "find files",
      }),
      taskToolResultLine({
        uuid: "u2",
        parentUuid: "a1",
        toolUseId: "toolu_1",
        agentId: "abc123",
      }),
    ].join("\n");

    const map = buildSubagentTypeMap(lines);
    expect(map.get("abc123")).toBe("Explore");
  });

  it("returns empty map when no Task tool calls", () => {
    const map = buildSubagentTypeMap(BASIC_SESSION);
    expect(map.size).toBe(0);
  });

  it("handles multiple Task invocations", () => {
    const lines = [
      userLine("start", "u1"),
      taskToolUseLine({
        uuid: "a1",
        parentUuid: "u1",
        toolId: "toolu_1",
        subagentType: "Bash",
        description: "run command",
      }),
      taskToolResultLine({
        uuid: "u2",
        parentUuid: "a1",
        toolUseId: "toolu_1",
        agentId: "abc123",
      }),
      taskToolUseLine({
        uuid: "a2",
        parentUuid: "u2",
        toolId: "toolu_2",
        subagentType: "Plan",
        description: "design plan",
      }),
      taskToolResultLine({
        uuid: "u3",
        parentUuid: "a2",
        toolUseId: "toolu_2",
        agentId: "def456",
      }),
    ].join("\n");

    const map = buildSubagentTypeMap(lines);
    expect(map.get("abc123")).toBe("Bash");
    expect(map.get("def456")).toBe("Plan");
  });

  it("handles missing agentId in tool_result gracefully", () => {
    const lines = [
      userLine("start", "u1"),
      taskToolUseLine({
        uuid: "a1",
        parentUuid: "u1",
        toolId: "toolu_1",
        subagentType: "Explore",
        description: "find files",
      }),
      // tool_result without agentId pattern
      JSON.stringify({
        type: "user",
        sessionId: "sess-1",
        uuid: "u2",
        parentUuid: "a1",
        isSidechain: false,
        timestamp: "2026-02-14T10:00:05.000Z",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_1",
              content: "error: tool failed",
            },
          ],
        },
      }),
    ].join("\n");

    const map = buildSubagentTypeMap(lines);
    expect(map.size).toBe(0);
  });
});

describe("subagent parsing", () => {
  it("includes subagent requests when subagent input provided", () => {
    const mainContent = BASIC_SESSION;
    const subContent = [
      subagentUserLine({ uuid: "su1", agentId: "abc123" }),
      subagentAssistantLine({
        uuid: "sa1",
        parentUuid: "su1",
        agentId: "abc123",
      }),
    ].join("\n");

    const session = parseClaudeSessionJsonl(mainContent, null, [
      { content: subContent, agentId: "abc123", subagentType: "Explore" },
    ]);

    expect(session.requests).toHaveLength(2); // 1 main + 1 subagent
  });

  it("sets isSubagent true on subagent requests", () => {
    const subContent = [
      subagentUserLine({ uuid: "su1", agentId: "abc123" }),
      subagentAssistantLine({
        uuid: "sa1",
        parentUuid: "su1",
        agentId: "abc123",
      }),
    ].join("\n");

    const session = parseClaudeSessionJsonl(BASIC_SESSION, null, [
      { content: subContent, agentId: "abc123", subagentType: "Explore" },
    ]);

    const mainReq = session.requests.find((r) => !r.isSubagent);
    const subReq = session.requests.find((r) => r.isSubagent);

    expect(mainReq).toBeDefined();
    expect(mainReq!.isSubagent).toBeFalsy();
    expect(subReq).toBeDefined();
    expect(subReq!.isSubagent).toBe(true);
  });

  it("sets customAgentName from subagentType", () => {
    const subContent = [
      subagentUserLine({ uuid: "su1", agentId: "abc123" }),
      subagentAssistantLine({
        uuid: "sa1",
        parentUuid: "su1",
        agentId: "abc123",
      }),
    ].join("\n");

    const session = parseClaudeSessionJsonl(BASIC_SESSION, null, [
      { content: subContent, agentId: "abc123", subagentType: "Explore" },
    ]);

    const subReq = session.requests.find((r) => r.isSubagent);
    expect(subReq!.customAgentName).toBe("Explore");
    expect(subReq!.agentId).toBe("claude-code:subagent");
  });

  it("falls back to agentId when subagentType is null", () => {
    const subContent = [
      subagentUserLine({ uuid: "su1", agentId: "abc123" }),
      subagentAssistantLine({
        uuid: "sa1",
        parentUuid: "su1",
        agentId: "abc123",
      }),
    ].join("\n");

    const session = parseClaudeSessionJsonl(BASIC_SESSION, null, [
      { content: subContent, agentId: "abc123", subagentType: null },
    ]);

    const subReq = session.requests.find((r) => r.isSubagent);
    expect(subReq!.customAgentName).toBe("abc123");
  });

  it("interleaves subagent requests by timestamp", () => {
    const mainContent = [
      userLine("first", "u1"),
      assistantLine({
        uuid: "a1",
        parentUuid: "u1",
        timestamp: "2026-02-14T10:00:01.000Z",
      }),
      userLine("second", "u2"),
      assistantLine({
        uuid: "a2",
        parentUuid: "u2",
        timestamp: "2026-02-14T10:00:10.000Z",
      }),
    ].join("\n");

    const subContent = [
      subagentUserLine({
        uuid: "su1",
        agentId: "abc123",
        timestamp: "2026-02-14T10:00:05.000Z",
      }),
      subagentAssistantLine({
        uuid: "sa1",
        parentUuid: "su1",
        agentId: "abc123",
        timestamp: "2026-02-14T10:00:06.000Z",
      }),
    ].join("\n");

    const session = parseClaudeSessionJsonl(mainContent, null, [
      { content: subContent, agentId: "abc123", subagentType: "Bash" },
    ]);

    expect(session.requests).toHaveLength(3);
    expect(session.requests[0].timestamp).toBe(
      new Date("2026-02-14T10:00:01.000Z").getTime(),
    );
    expect(session.requests[1].isSubagent).toBe(true);
    expect(session.requests[1].timestamp).toBe(
      new Date("2026-02-14T10:00:06.000Z").getTime(),
    );
    expect(session.requests[2].timestamp).toBe(
      new Date("2026-02-14T10:00:10.000Z").getTime(),
    );
  });

  it("extracts tool calls from subagent content", () => {
    const subContent = [
      subagentUserLine({ uuid: "su1", agentId: "abc123" }),
      subagentAssistantLine({
        uuid: "sa1",
        parentUuid: "su1",
        agentId: "abc123",
        content: [
          { type: "tool_use", id: "t1", name: "Read", input: {} },
          { type: "tool_use", id: "t2", name: "Grep", input: {} },
        ],
      }),
    ].join("\n");

    const session = parseClaudeSessionJsonl(BASIC_SESSION, null, [
      { content: subContent, agentId: "abc123", subagentType: "Explore" },
    ]);

    const subReq = session.requests.find((r) => r.isSubagent);
    expect(subReq!.toolCalls).toHaveLength(2);
    expect(subReq!.toolCalls[0]).toEqual({ id: "t1", name: "Read" });
  });

  it("extracts token usage from subagent content", () => {
    const subContent = [
      subagentUserLine({ uuid: "su1", agentId: "abc123" }),
      subagentAssistantLine({
        uuid: "sa1",
        parentUuid: "su1",
        agentId: "abc123",
        usage: {
          input_tokens: 5,
          output_tokens: 20,
          cache_read_input_tokens: 5000,
          cache_creation_input_tokens: 1000,
        },
      }),
    ].join("\n");

    const session = parseClaudeSessionJsonl(BASIC_SESSION, null, [
      { content: subContent, agentId: "abc123", subagentType: "Explore" },
    ]);

    const subReq = session.requests.find((r) => r.isSubagent);
    expect(subReq!.usage.promptTokens).toBe(5);
    expect(subReq!.usage.completionTokens).toBe(20);
    expect(subReq!.usage.cacheReadTokens).toBe(5000);
    expect(subReq!.usage.cacheCreationTokens).toBe(1000);
  });

  it("handles empty subagent content gracefully", () => {
    const session = parseClaudeSessionJsonl(BASIC_SESSION, null, [
      { content: "", agentId: "abc123", subagentType: "Explore" },
    ]);

    // Only main session requests, no subagent requests added
    expect(session.requests).toHaveLength(1);
    expect(session.requests[0].isSubagent).toBeFalsy();
  });

  it("still skips isSidechain lines in main session content", () => {
    const mainContent = [
      userLine("hello", "u1"),
      assistantLine({ uuid: "a1", parentUuid: "u1" }),
      assistantLine({
        uuid: "a2",
        parentUuid: "u1",
        isSidechain: true,
      }),
    ].join("\n");

    const session = parseClaudeSessionJsonl(mainContent, null);
    expect(session.requests).toHaveLength(1);
  });
});
