import { describe, it, expect } from "vitest";
import { parseCodexSessionJsonl } from "./codexSessionParser.js";

/* ------------------------------------------------------------------ */
/*  Test helpers — build JSONL envelope lines                         */
/* ------------------------------------------------------------------ */

function sessionMeta(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    timestamp: "2026-02-15T13:00:00.000Z",
    type: "session_meta",
    payload: {
      id: "test-session-id",
      timestamp: "2026-02-15T13:00:00.000Z",
      cli_version: "0.100.0",
      model_provider: "openai",
      source: "cli",
      ...overrides,
    },
  });
}

function eventMsg(type: string, extra: Record<string, unknown> = {}, ts?: string): string {
  return JSON.stringify({
    timestamp: ts ?? "2026-02-15T13:01:00.000Z",
    type: "event_msg",
    payload: { type, ...extra },
  });
}

function responseItem(
  type: string,
  extra: Record<string, unknown> = {},
  ts?: string,
): string {
  return JSON.stringify({
    timestamp: ts ?? "2026-02-15T13:01:00.000Z",
    type: "response_item",
    payload: { type, ...extra },
  });
}

function turnContext(model: string): string {
  return JSON.stringify({
    timestamp: "2026-02-15T13:01:00.000Z",
    type: "turn_context",
    payload: { model },
  });
}

function userMessage(text: string): string {
  return responseItem("message", {
    role: "user",
    content: [{ type: "input_text", text }],
  });
}

function assistantMessage(text: string, phase?: string): string {
  return responseItem("message", {
    role: "assistant",
    content: [{ type: "output_text", text }],
    ...(phase ? { phase } : {}),
  });
}

function functionCall(name: string, callId: string): string {
  return responseItem("function_call", {
    name,
    call_id: callId,
    arguments: "{}",
  });
}

function functionCallOutput(callId: string, output: string): string {
  return responseItem("function_call_output", {
    call_id: callId,
    output,
  });
}

function tokenCount(
  total: { input_tokens: number; cached_input_tokens: number; output_tokens: number },
): string {
  return eventMsg("token_count", {
    info: {
      total_token_usage: { ...total, total_tokens: total.input_tokens + total.output_tokens },
      last_token_usage: total,
    },
  });
}

function tokenCountNull(): string {
  return eventMsg("token_count", { info: null });
}

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describe("parseCodexSessionJsonl", () => {
  it("parses session metadata from envelope", () => {
    const content = [
      sessionMeta({ id: "abc-123", timestamp: "2026-01-20T10:00:00.000Z" }),
    ].join("\n");

    const session = parseCodexSessionJsonl(content);
    expect(session.sessionId).toBe("abc-123");
    expect(session.creationDate).toBe(new Date("2026-01-20T10:00:00.000Z").getTime());
    expect(session.provider).toBe("codex");
    expect(session.source).toBe("codex");
    expect(session.requests).toHaveLength(0);
  });

  it("returns empty session for empty input", () => {
    const session = parseCodexSessionJsonl("");
    expect(session.requests).toHaveLength(0);
  });

  it("returns empty session for malformed first line", () => {
    const session = parseCodexSessionJsonl("not json");
    expect(session.requests).toHaveLength(0);
  });

  it("returns empty session when first line is not session_meta", () => {
    const content = eventMsg("task_started");
    const session = parseCodexSessionJsonl(content);
    expect(session.requests).toHaveLength(0);
  });

  it("parses a single turn with task_started and task_complete", () => {
    const content = [
      sessionMeta(),
      eventMsg("task_started", { turn_id: "turn-1" }),
      userMessage("Hello Codex"),
      eventMsg("user_message", { message: "Hello Codex" }),
      assistantMessage("Hi there", "final_answer"),
      tokenCount({ input_tokens: 1000, cached_input_tokens: 500, output_tokens: 200 }),
      eventMsg("task_complete", { turn_id: "turn-1" }),
    ].join("\n");

    const session = parseCodexSessionJsonl(content);
    expect(session.requests).toHaveLength(1);

    const req = session.requests[0];
    expect(req.requestId).toBe("codex-turn-0");
    expect(req.messageText).toBe("Hello Codex");
    expect(req.agentId).toBe("codex-cli");
    expect(req.usage.promptTokens).toBe(1000);
    expect(req.usage.completionTokens).toBe(200);
    expect(req.usage.cacheReadTokens).toBe(500);
  });

  it("parses multi-turn session with cumulative token deltas", () => {
    const content = [
      sessionMeta(),
      // Turn 1
      eventMsg("task_started", { turn_id: "t1" }),
      userMessage("First question"),
      tokenCount({ input_tokens: 1000, cached_input_tokens: 500, output_tokens: 200 }),
      eventMsg("task_complete", { turn_id: "t1" }),
      // Turn 2
      eventMsg("task_started", { turn_id: "t2" }),
      userMessage("Second question"),
      tokenCount({ input_tokens: 2500, cached_input_tokens: 1800, output_tokens: 500 }),
      eventMsg("task_complete", { turn_id: "t2" }),
    ].join("\n");

    const session = parseCodexSessionJsonl(content);
    expect(session.requests).toHaveLength(2);

    // Turn 1: absolute values (no previous)
    expect(session.requests[0].usage.promptTokens).toBe(1000);
    expect(session.requests[0].usage.completionTokens).toBe(200);
    expect(session.requests[0].usage.cacheReadTokens).toBe(500);

    // Turn 2: delta from turn 1
    expect(session.requests[1].usage.promptTokens).toBe(1500);
    expect(session.requests[1].usage.completionTokens).toBe(300);
    expect(session.requests[1].usage.cacheReadTokens).toBe(1300);
  });

  it("extracts tool calls from function_call response_items", () => {
    const content = [
      sessionMeta(),
      eventMsg("task_started"),
      userMessage("Run a command"),
      functionCall("exec_command", "call_abc"),
      functionCallOutput("call_abc", "done"),
      functionCall("apply_patch", "call_def"),
      functionCallOutput("call_def", "patched"),
      eventMsg("task_complete"),
    ].join("\n");

    const session = parseCodexSessionJsonl(content);
    expect(session.requests).toHaveLength(1);
    expect(session.requests[0].toolCalls).toEqual([
      { id: "call_abc", name: "exec_command" },
      { id: "call_def", name: "apply_patch" },
    ]);
  });

  it("handles token_count with info: null gracefully", () => {
    const content = [
      sessionMeta(),
      eventMsg("task_started"),
      userMessage("Test"),
      tokenCountNull(),
      eventMsg("task_complete"),
    ].join("\n");

    const session = parseCodexSessionJsonl(content);
    expect(session.requests).toHaveLength(1);
    expect(session.requests[0].usage.promptTokens).toBe(0);
    expect(session.requests[0].usage.completionTokens).toBe(0);
  });

  it("skips malformed lines without crashing", () => {
    const content = [
      sessionMeta(),
      "not valid json {{{",
      eventMsg("task_started"),
      userMessage("Still works"),
      eventMsg("task_complete"),
    ].join("\n");

    const session = parseCodexSessionJsonl(content);
    expect(session.requests).toHaveLength(1);
    expect(session.requests[0].messageText).toBe("Still works");
  });

  it("uses model from turn_context", () => {
    const content = [
      sessionMeta(),
      eventMsg("task_started"),
      turnContext("gpt-5.3-codex"),
      userMessage("Hi"),
      eventMsg("task_complete"),
    ].join("\n");

    const session = parseCodexSessionJsonl(content);
    expect(session.requests[0].modelId).toBe("gpt-5.3-codex");
  });

  it("falls back to model_provider when no turn_context", () => {
    const content = [
      sessionMeta({ model_provider: "openai" }),
      eventMsg("task_started"),
      userMessage("Hi"),
      eventMsg("task_complete"),
    ].join("\n");

    const session = parseCodexSessionJsonl(content);
    expect(session.requests[0].modelId).toBe("openai");
  });

  it("handles session without explicit task_started (legacy format)", () => {
    const content = [
      sessionMeta(),
      userMessage("Older format question"),
      eventMsg("user_message", { message: "Older format question" }),
      assistantMessage("Answer"),
    ].join("\n");

    const session = parseCodexSessionJsonl(content);
    expect(session.requests).toHaveLength(1);
    expect(session.requests[0].messageText).toBe("Older format question");
  });

  it("handles turn_aborted event", () => {
    const content = [
      sessionMeta(),
      eventMsg("task_started"),
      userMessage("Do something"),
      functionCall("exec_command", "call_1"),
      eventMsg("turn_aborted", { reason: "interrupted" }),
    ].join("\n");

    const session = parseCodexSessionJsonl(content);
    expect(session.requests).toHaveLength(1);
    expect(session.requests[0].toolCalls).toHaveLength(1);
  });

  it("uses event_msg user_message when inside a turn", () => {
    const content = [
      sessionMeta(),
      eventMsg("task_started"),
      eventMsg("user_message", { message: "From event" }),
      eventMsg("task_complete"),
    ].join("\n");

    const session = parseCodexSessionJsonl(content);
    expect(session.requests).toHaveLength(1);
    expect(session.requests[0].messageText).toBe("From event");
  });

  it("sequential request IDs are 0-indexed", () => {
    const content = [
      sessionMeta(),
      eventMsg("task_started"),
      userMessage("Q1"),
      eventMsg("task_complete"),
      eventMsg("task_started"),
      userMessage("Q2"),
      eventMsg("task_complete"),
      eventMsg("task_started"),
      userMessage("Q3"),
      eventMsg("task_complete"),
    ].join("\n");

    const session = parseCodexSessionJsonl(content);
    expect(session.requests.map((r) => r.requestId)).toEqual([
      "codex-turn-0",
      "codex-turn-1",
      "codex-turn-2",
    ]);
  });

  it("title is null when there are no requests", () => {
    const content = [sessionMeta()].join("\n");
    const session = parseCodexSessionJsonl(content);
    expect(session.title).toBeNull();
  });

  it("title is the first user prompt", () => {
    const content = [
      sessionMeta(),
      eventMsg("task_started"),
      userMessage("Fix the login bug"),
      eventMsg("task_complete"),
      eventMsg("task_started"),
      userMessage("Now add tests"),
      eventMsg("task_complete"),
    ].join("\n");

    const session = parseCodexSessionJsonl(content);
    expect(session.title).toBe("Fix the login bug");
  });

  it("title is truncated at 80 characters with ellipsis", () => {
    const longPrompt = "A".repeat(120);
    const content = [
      sessionMeta(),
      eventMsg("task_started"),
      userMessage(longPrompt),
      eventMsg("task_complete"),
    ].join("\n");

    const session = parseCodexSessionJsonl(content);
    expect(session.title).toBe("A".repeat(80) + "…");
  });

  it("title is not truncated when exactly 80 characters", () => {
    const prompt80 = "B".repeat(80);
    const content = [
      sessionMeta(),
      eventMsg("task_started"),
      userMessage(prompt80),
      eventMsg("task_complete"),
    ].join("\n");

    const session = parseCodexSessionJsonl(content);
    expect(session.title).toBe(prompt80);
  });

  it("timings are null", () => {
    const content = [
      sessionMeta(),
      eventMsg("task_started"),
      userMessage("Test"),
      eventMsg("task_complete"),
    ].join("\n");

    const session = parseCodexSessionJsonl(content);
    expect(session.requests[0].timings.firstProgress).toBeNull();
    expect(session.requests[0].timings.totalElapsed).toBeNull();
  });

  it("skills are always empty", () => {
    const content = [
      sessionMeta(),
      eventMsg("task_started"),
      userMessage("Test"),
      eventMsg("task_complete"),
    ].join("\n");

    const session = parseCodexSessionJsonl(content);
    expect(session.requests[0].availableSkills).toEqual([]);
    expect(session.requests[0].loadedSkills).toEqual([]);
  });

  it("handles multiple token_count events per turn (takes last)", () => {
    const content = [
      sessionMeta(),
      eventMsg("task_started"),
      userMessage("Test"),
      tokenCount({ input_tokens: 100, cached_input_tokens: 50, output_tokens: 20 }),
      tokenCount({ input_tokens: 500, cached_input_tokens: 300, output_tokens: 100 }),
      eventMsg("task_complete"),
    ].join("\n");

    const session = parseCodexSessionJsonl(content);
    // Should use the last token_count (highest cumulative values)
    expect(session.requests[0].usage.promptTokens).toBe(500);
    expect(session.requests[0].usage.completionTokens).toBe(100);
    expect(session.requests[0].usage.cacheReadTokens).toBe(300);
  });

  it("ignores developer and assistant messages for user text", () => {
    const content = [
      sessionMeta(),
      eventMsg("task_started"),
      responseItem("message", {
        role: "developer",
        content: [{ type: "input_text", text: "system prompt" }],
      }),
      userMessage("actual user question"),
      assistantMessage("response"),
      eventMsg("task_complete"),
    ].join("\n");

    const session = parseCodexSessionJsonl(content);
    expect(session.requests[0].messageText).toBe("actual user question");
  });

  /* ---------------------------------------------------------------- */
  /*  Context message filtering                                       */
  /* ---------------------------------------------------------------- */

  it("skips AGENTS.md context messages (no phantom turn)", () => {
    const content = [
      sessionMeta(),
      // Pre-task context injected by VS Code — should be ignored
      userMessage("# AGENTS.md instructions for /Users/me/project\n\n<INSTRUCTIONS>..."),
      userMessage("<environment_context>\n  <cwd>/Users/me/project</cwd>\n</environment_context>"),
      // Real turn
      eventMsg("task_started"),
      userMessage("Fix the bug"),
      eventMsg("user_message", { message: "Fix the bug" }),
      eventMsg("task_complete"),
    ].join("\n");

    const session = parseCodexSessionJsonl(content);
    expect(session.requests).toHaveLength(1);
    expect(session.requests[0].messageText).toBe("Fix the bug");
  });

  it("skips environment_context messages", () => {
    const content = [
      sessionMeta(),
      userMessage("<environment_context>\n  <cwd>/foo</cwd>\n  <shell>zsh</shell>\n</environment_context>"),
      eventMsg("task_started"),
      userMessage("Hello"),
      eventMsg("task_complete"),
    ].join("\n");

    const session = parseCodexSessionJsonl(content);
    expect(session.requests).toHaveLength(1);
    expect(session.requests[0].messageText).toBe("Hello");
  });

  /* ---------------------------------------------------------------- */
  /*  Legacy turn segmentation                                        */
  /* ---------------------------------------------------------------- */

  it("segments turns via user_message events in legacy sessions", () => {
    const content = [
      sessionMeta(),
      // Context messages — skipped
      userMessage("# AGENTS.md instructions for /project\n..."),
      userMessage("<environment_context>\n  <cwd>/project</cwd>\n</environment_context>"),
      // Turn 1
      userMessage("# Context from my IDE setup:\n\n## My request for Codex:\nFirst question"),
      eventMsg("user_message", { message: "# Context from my IDE setup:\n\n## My request for Codex:\nFirst question" }),
      // Turn 2
      userMessage("# Context from my IDE setup:\n\n## My request for Codex:\nSecond question"),
      eventMsg("user_message", { message: "# Context from my IDE setup:\n\n## My request for Codex:\nSecond question" }),
    ].join("\n");

    const session = parseCodexSessionJsonl(content);
    expect(session.requests).toHaveLength(2);
    expect(session.requests[0].messageText).toContain("First question");
    expect(session.requests[1].messageText).toContain("Second question");
  });

  /* ---------------------------------------------------------------- */
  /*  IDE context stripping for title                                 */
  /* ---------------------------------------------------------------- */

  it("title extracts user request from IDE context wrapper", () => {
    const content = [
      sessionMeta(),
      eventMsg("task_started"),
      eventMsg("user_message", {
        message: "# Context from my IDE setup:\n\n## Active file: foo.ts\n\n## My request for Codex:\nClarify Copilot vs Claude UI",
      }),
      eventMsg("task_complete"),
    ].join("\n");

    const session = parseCodexSessionJsonl(content);
    expect(session.title).toBe("Clarify Copilot vs Claude UI");
  });

  it("title uses raw text when no IDE context wrapper", () => {
    const content = [
      sessionMeta(),
      eventMsg("task_started"),
      userMessage("Plain CLI question"),
      eventMsg("task_complete"),
    ].join("\n");

    const session = parseCodexSessionJsonl(content);
    expect(session.title).toBe("Plain CLI question");
  });

  it("title truncates extracted request at 80 chars", () => {
    const longRequest = "X".repeat(100);
    const content = [
      sessionMeta(),
      eventMsg("task_started"),
      eventMsg("user_message", {
        message: `# Context from my IDE setup:\n\n## My request for Codex:\n${longRequest}`,
      }),
      eventMsg("task_complete"),
    ].join("\n");

    const session = parseCodexSessionJsonl(content);
    expect(session.title).toBe("X".repeat(80) + "…");
  });

  /* ---------------------------------------------------------------- */
  /*  Full VS Code session simulation                                 */
  /* ---------------------------------------------------------------- */

  it("handles realistic VS Code session with context + task_started", () => {
    const content = [
      sessionMeta(),
      // Injected context (before task_started)
      responseItem("message", {
        role: "developer",
        content: [{ type: "input_text", text: "<permissions instructions>..." }],
      }),
      userMessage("# AGENTS.md instructions for /project\n\nSkills list..."),
      userMessage("<environment_context>\n  <cwd>/project</cwd>\n</environment_context>"),
      responseItem("message", {
        role: "developer",
        content: [{ type: "input_text", text: "<collaboration_mode>..." }],
      }),
      // Real turn
      eventMsg("task_started", { turn_id: "t1" }),
      userMessage("# Context from my IDE setup:\n\n## Active file: app.ts\n\n## My request for Codex:\nAdd error handling"),
      eventMsg("user_message", {
        message: "# Context from my IDE setup:\n\n## Active file: app.ts\n\n## My request for Codex:\nAdd error handling",
      }),
      functionCall("exec_command", "call_1"),
      tokenCount({ input_tokens: 5000, cached_input_tokens: 3000, output_tokens: 800 }),
      eventMsg("task_complete", { turn_id: "t1" }),
    ].join("\n");

    const session = parseCodexSessionJsonl(content);
    // Should have exactly 1 turn (no phantom from context messages)
    expect(session.requests).toHaveLength(1);
    expect(session.title).toBe("Add error handling");
    expect(session.requests[0].toolCalls).toHaveLength(1);
    expect(session.requests[0].usage.promptTokens).toBe(5000);
  });
});
