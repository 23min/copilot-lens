import type {
  Session,
  SessionRequest,
  ToolCallInfo,
} from "../models/session.js";

/* ------------------------------------------------------------------ */
/*  Codex JSONL envelope types                                        */
/* ------------------------------------------------------------------ */

/** Every line in a Codex rollout file is a typed envelope. */
interface CodexLine {
  timestamp: string;
  type: "session_meta" | "response_item" | "event_msg" | "turn_context";
  payload: Record<string, unknown>;
}

/* -- session_meta -------------------------------------------------- */
interface SessionMetaPayload {
  id?: string;
  timestamp?: string;
  cli_version?: string;
  model_provider?: string;
  source?: string;
}

/* -- response_item ------------------------------------------------- */
interface ResponseItemPayload {
  type: string;           // message | function_call | function_call_output | reasoning | ...
  role?: string;          // user | assistant | developer | cwd
  content?: ContentPart[];
  phase?: string;         // commentary | final_answer
  name?: string;          // tool name (function_call)
  call_id?: string;       // tool call id
  end_turn?: boolean;
}

interface ContentPart {
  type: string;           // input_text | output_text | summary_text | input_image
  text?: string;
}

/* -- event_msg ----------------------------------------------------- */
interface EventMsgPayload {
  type: string;           // task_started | task_complete | token_count | user_message | ...
  turn_id?: string;
  message?: string;       // user_message.message / agent_message.message
  info?: TokenInfo | null;
}

interface TokenInfo {
  total_token_usage?: TokenUsage;
  last_token_usage?: TokenUsage;
}

interface TokenUsage {
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
  reasoning_output_tokens?: number;
  total_tokens?: number;
}

/* -- turn_context -------------------------------------------------- */
interface TurnContextPayload {
  turn_id?: string;
  model?: string;
}

/* ------------------------------------------------------------------ */
/*  Parser                                                            */
/* ------------------------------------------------------------------ */

interface TurnState {
  userMessage: string;
  toolCalls: ToolCallInfo[];
  model: string;
  timestamp: number;
  lastTokenUsage: TokenUsage | null;
}

function emptyTurnState(model: string, timestamp: number): TurnState {
  return {
    userMessage: "",
    toolCalls: [],
    model,
    timestamp,
    lastTokenUsage: null,
  };
}

export function parseCodexSessionJsonl(content: string): Session {
  const lines = content.split("\n").filter((l) => l.trim());
  if (lines.length === 0) return emptySession();

  // Parse first line — must be session_meta
  let firstLine: CodexLine;
  try {
    firstLine = JSON.parse(lines[0]);
  } catch {
    return emptySession();
  }

  if (firstLine.type !== "session_meta") return emptySession();

  const meta = firstLine.payload as unknown as SessionMetaPayload;
  const sessionId = meta.id ?? `codex-${Date.now()}`;
  const creationDate = meta.timestamp
    ? new Date(meta.timestamp).getTime()
    : 0;
  const defaultModel = meta.model_provider ?? "codex";

  const requests: SessionRequest[] = [];
  let currentTurn: TurnState | null = null;
  let sessionModel = defaultModel;
  let previousTotalTokens: TokenUsage = {};

  function finalizeTurn(): void {
    if (!currentTurn) return;

    const usage = computeUsage(currentTurn.lastTokenUsage, previousTotalTokens);
    if (currentTurn.lastTokenUsage) {
      previousTotalTokens = currentTurn.lastTokenUsage;
    }

    requests.push({
      requestId: `codex-turn-${requests.length}`,
      timestamp: currentTurn.timestamp || creationDate,
      agentId: "codex-cli",
      customAgentName: null,
      modelId: currentTurn.model,
      messageText: currentTurn.userMessage,
      timings: { firstProgress: null, totalElapsed: null },
      usage,
      toolCalls: currentTurn.toolCalls,
      availableSkills: [],
      loadedSkills: [],
    });

    currentTurn = null;
  }

  for (let i = 1; i < lines.length; i++) {
    let line: CodexLine;
    try {
      line = JSON.parse(lines[i]);
    } catch {
      continue;
    }

    const lineTs = line.timestamp
      ? new Date(line.timestamp).getTime()
      : creationDate;

    if (line.type === "event_msg") {
      const evt = line.payload as unknown as EventMsgPayload;

      if (evt.type === "task_started") {
        finalizeTurn();
        currentTurn = emptyTurnState(sessionModel, lineTs);
      } else if (evt.type === "task_complete" || evt.type === "turn_aborted") {
        finalizeTurn();
      } else if (evt.type === "user_message") {
        // Captures user message text for current or upcoming turn
        const msg = evt.message ?? "";
        if (currentTurn) {
          currentTurn.userMessage = msg;
        }
      } else if (evt.type === "token_count") {
        if (evt.info?.total_token_usage && currentTurn) {
          currentTurn.lastTokenUsage = evt.info.total_token_usage;
        }
      }
    } else if (line.type === "response_item") {
      const item = line.payload as unknown as ResponseItemPayload;

      // Ensure we have a turn (older sessions may lack task_started)
      if (!currentTurn) {
        currentTurn = emptyTurnState(sessionModel, lineTs);
      }

      if (item.type === "message" && item.role === "user") {
        // Extract user message text from content array
        const text = extractTextFromContent(item.content);
        if (text) {
          currentTurn.userMessage = text;
        }
      } else if (item.type === "function_call") {
        currentTurn.toolCalls.push({
          id: item.call_id ?? "",
          name: item.name ?? "unknown",
        });
      }
    } else if (line.type === "turn_context") {
      const ctx = line.payload as unknown as TurnContextPayload;
      if (ctx.model) {
        sessionModel = ctx.model;
        if (currentTurn) {
          currentTurn.model = ctx.model;
        }
      }
    }
  }

  // Finalize any open turn
  finalizeTurn();

  return {
    sessionId,
    title: null,
    creationDate,
    requests,
    source: "codex",
    provider: "codex",
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function extractTextFromContent(
  content: ContentPart[] | undefined,
): string {
  if (!content) return "";
  const parts: string[] = [];
  for (const c of content) {
    if ((c.type === "input_text" || c.type === "output_text") && c.text) {
      parts.push(c.text);
    }
  }
  return parts.join("\n");
}

function computeUsage(
  turnTotal: TokenUsage | null,
  previousTotal: TokenUsage,
): {
  promptTokens: number;
  completionTokens: number;
  cacheReadTokens: number;
} {
  if (!turnTotal) {
    return { promptTokens: 0, completionTokens: 0, cacheReadTokens: 0 };
  }
  return {
    promptTokens: Math.max(
      0,
      (turnTotal.input_tokens ?? 0) - (previousTotal.input_tokens ?? 0),
    ),
    completionTokens: Math.max(
      0,
      (turnTotal.output_tokens ?? 0) - (previousTotal.output_tokens ?? 0),
    ),
    cacheReadTokens: Math.max(
      0,
      (turnTotal.cached_input_tokens ?? 0) -
        (previousTotal.cached_input_tokens ?? 0),
    ),
  };
}

function emptySession(): Session {
  return {
    sessionId: `codex-empty-${Date.now()}`,
    title: null,
    creationDate: 0,
    requests: [],
    source: "codex",
    provider: "codex",
  };
}
