import { describe, it, expect } from "vitest";
import { parseClaudeSessionJsonl } from "./claudeSessionParser.js";

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
