import type {
  Session,
  SessionRequest,
  ToolCallInfo,
  SkillRef,
} from "../models/session.js";
import {
  detectCustomAgent,
  detectAvailableSkills,
  detectLoadedSkills,
} from "./detectors.js";

// --- JSONL parser ---

interface JsonlLine {
  kind: number;
  k?: (string | number)[];
  v: unknown;
}

function setNestedValue(obj: Record<string, unknown>, path: (string | number)[], value: unknown): void {
  let current: unknown = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (current && typeof current === "object") {
      current = (current as Record<string | number, unknown>)[key];
    }
  }
  if (current && typeof current === "object") {
    const lastKey = path[path.length - 1];
    (current as Record<string | number, unknown>)[lastKey] = value;
  }
}

function appendToArray(obj: Record<string, unknown>, path: (string | number)[], items: unknown[]): void {
  let current: unknown = obj;
  for (const key of path) {
    if (current && typeof current === "object") {
      current = (current as Record<string | number, unknown>)[key];
    }
  }
  if (Array.isArray(current)) {
    current.push(...items);
  }
}

export function parseSessionJsonl(content: string): Session {
  if (!content.trim()) {
    return {
      sessionId: "unknown",
      title: null,
      creationDate: 0,
      requests: [],
      source: "jsonl",
    };
  }

  const lines = content.split("\n").filter((l) => l.trim());
  const state: Record<string, unknown> = {};

  for (const line of lines) {
    let parsed: JsonlLine;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    switch (parsed.kind) {
      case 0:
        Object.assign(state, parsed.v as Record<string, unknown>);
        break;
      case 1:
        if (parsed.k) {
          setNestedValue(state, parsed.k, parsed.v);
        }
        break;
      case 2:
        if (parsed.k && Array.isArray(parsed.v)) {
          appendToArray(state, parsed.k, parsed.v);
        }
        break;
    }
  }

  return extractSession(state, "jsonl");
}

// --- Chat replay parser ---

export function parseChatReplay(content: string): Session {
  const data = JSON.parse(content);

  const requests: SessionRequest[] = [];

  for (const prompt of data.prompts ?? []) {
    const requestLog = (prompt.logs ?? []).find(
      (l: Record<string, unknown>) => l.kind === "request",
    );
    if (!requestLog) continue;

    const meta = requestLog.metadata ?? {};
    const toolCallLogs = (prompt.logs ?? []).filter(
      (l: Record<string, unknown>) => l.kind === "toolCall",
    );

    const toolCalls: ToolCallInfo[] = toolCallLogs.map(
      (tc: Record<string, unknown>) => ({
        id: String(tc.id ?? ""),
        name: String(tc.tool ?? ""),
      }),
    );

    const toolCallArgs: Record<string, string> = {};
    for (const tc of toolCallLogs) {
      toolCallArgs[String(tc.id)] = String(tc.args ?? "");
    }

    // Detect custom agent from system messages
    let systemText = "";
    const messages = requestLog.requestMessages?.messages ?? [];
    for (const msg of messages) {
      if (typeof msg.content === "string") {
        systemText += msg.content + "\n";
      }
    }

    const customAgentName = detectCustomAgent(systemText);
    const availableSkills = detectAvailableSkills(systemText);
    const loadedSkills = detectLoadedSkills(toolCalls, toolCallArgs);

    requests.push({
      requestId: String(requestLog.id ?? prompt.promptId ?? ""),
      timestamp: meta.startTime ? new Date(meta.startTime).getTime() : 0,
      agentId: String(requestLog.name ?? ""),
      customAgentName,
      modelId: String(meta.model ?? ""),
      messageText: String(prompt.prompt ?? ""),
      timings: {
        firstProgress: meta.timeToFirstToken ?? null,
        totalElapsed: meta.duration ?? null,
      },
      usage: {
        promptTokens: meta.usage?.prompt_tokens ?? 0,
        completionTokens: meta.usage?.completion_tokens ?? 0,
      },
      toolCalls,
      availableSkills,
      loadedSkills,
    });
  }

  return {
    sessionId: data.prompts?.[0]?.promptId ?? "unknown",
    title: null,
    creationDate: data.exportedAt ? new Date(data.exportedAt).getTime() : 0,
    requests,
    source: "chatreplay",
  };
}

// --- Shared extraction ---

function extractSession(
  state: Record<string, unknown>,
  source: "jsonl" | "json",
): Session {
  const rawRequests = (state.requests as unknown[]) ?? [];

  const requests: SessionRequest[] = rawRequests.map((raw) => {
    const r = raw as Record<string, unknown>;
    const agent = r.agent as Record<string, unknown> | undefined;
    const result = r.result as Record<string, unknown> | undefined;
    const meta = result?.metadata as Record<string, unknown> | undefined;
    const timings = result?.timings as Record<string, number> | undefined;
    const usage = result?.usage as Record<string, number> | undefined;

    // Extract tool calls from toolCallRounds
    const toolCalls: ToolCallInfo[] = [];
    const toolCallArgs: Record<string, string> = {};
    const rounds = (meta?.toolCallRounds as unknown[]) ?? [];
    for (const round of rounds) {
      const r = round as Record<string, unknown>;
      for (const tc of (r.toolCalls as Record<string, unknown>[]) ?? []) {
        toolCalls.push({
          id: String(tc.id ?? ""),
          name: String(tc.name ?? ""),
        });
      }
    }

    // Extract tool call args from toolCallResults for skill detection
    const toolCallResults = (meta?.toolCallResults ?? {}) as Record<
      string,
      Record<string, unknown>
    >;
    for (const [id, result] of Object.entries(toolCallResults)) {
      const content = result.content as Record<string, unknown>[] | undefined;
      if (content?.[0]) {
        toolCallArgs[id] = String(content[0].value ?? "");
      }
    }

    // Detect custom agent and skills from rendered system prompt
    let systemText = "";
    const rendered = meta?.renderedUserMessage;
    if (Array.isArray(rendered)) {
      for (const part of rendered) {
        const p = part as Record<string, unknown>;
        if (typeof p.value === "string") {
          systemText += p.value + "\n";
        }
      }
    }

    const customAgentName = detectCustomAgent(systemText);
    const availableSkills = detectAvailableSkills(systemText);
    const loadedSkills = detectLoadedSkills(toolCalls, toolCallArgs);

    const message = r.message as Record<string, unknown> | undefined;

    return {
      requestId: String(r.requestId ?? ""),
      timestamp: (r.timestamp as number) ?? 0,
      agentId: String(agent?.id ?? ""),
      customAgentName,
      modelId: String(r.modelId ?? ""),
      messageText: String(message?.text ?? ""),
      timings: {
        firstProgress: timings?.firstProgress ?? null,
        totalElapsed: timings?.totalElapsed ?? null,
      },
      usage: {
        promptTokens: usage?.promptTokens ?? 0,
        completionTokens: usage?.completionTokens ?? 0,
      },
      toolCalls,
      availableSkills,
      loadedSkills,
    };
  });

  return {
    sessionId: String(state.sessionId ?? "unknown"),
    title: (state.customTitle as string) ?? null,
    creationDate: (state.creationDate as number) ?? 0,
    requests,
    source,
  };
}
