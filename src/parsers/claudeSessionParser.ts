import type {
  Session,
  SessionRequest,
  ToolCallInfo,
} from "../models/session.js";

interface ClaudeLine {
  type: string;
  sessionId?: string;
  uuid?: string;
  parentUuid?: string | null;
  isSidechain?: boolean;
  timestamp?: string;
  message?: {
    role?: string;
    model?: string;
    content?: ContentBlock[] | string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  };
}

interface ContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
}

/**
 * Parse a Claude Code session JSONL file into our Session model.
 *
 * Each line is a standalone JSON object with a `type` field.
 * We extract `assistant` messages (skipping sidechains) as requests,
 * and track `user` messages to populate `messageText`.
 */
export function parseClaudeSessionJsonl(
  content: string,
  summary: string | null,
): Session {
  if (!content.trim()) {
    return {
      sessionId: "unknown",
      title: summary,
      creationDate: 0,
      requests: [],
      source: "claude",
      provider: "claude",
    };
  }

  const lines = content.split("\n").filter((l) => l.trim());

  let sessionId = "unknown";
  let firstTimestamp = 0;
  let lastUserText = "";
  const requests: SessionRequest[] = [];

  for (const line of lines) {
    let parsed: ClaudeLine;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    // Capture sessionId from any line
    if (parsed.sessionId && sessionId === "unknown") {
      sessionId = parsed.sessionId;
    }

    // Track first timestamp for creationDate
    if (parsed.timestamp && firstTimestamp === 0) {
      firstTimestamp = new Date(parsed.timestamp).getTime();
    }

    // Track latest user message text
    if (parsed.type === "user" && parsed.message?.content) {
      const content = parsed.message.content;
      if (typeof content === "string") {
        lastUserText = content;
      } else if (Array.isArray(content)) {
        const textBlocks = content.filter(
          (b) => b.type === "text" && b.text,
        );
        if (textBlocks.length > 0) {
          lastUserText = textBlocks.map((b) => b.text).join("\n");
        }
      }
    }

    // Extract assistant messages as requests
    if (parsed.type === "assistant" && !parsed.isSidechain) {
      const msg = parsed.message;
      if (!msg) continue;

      const toolCalls: ToolCallInfo[] = [];
      const blocks = Array.isArray(msg.content) ? msg.content : [];
      for (const block of blocks) {
        if (block.type === "tool_use" && block.id && block.name) {
          toolCalls.push({ id: block.id, name: block.name });
        }
      }

      const messageText = lastUserText;
      lastUserText = "";

      requests.push({
        requestId: String(parsed.uuid ?? ""),
        timestamp: parsed.timestamp
          ? new Date(parsed.timestamp).getTime()
          : 0,
        agentId: "claude-code",
        customAgentName: null,
        modelId: String(msg.model ?? ""),
        messageText,
        timings: {
          firstProgress: null,
          totalElapsed: null,
        },
        usage: {
          promptTokens: msg.usage?.input_tokens ?? 0,
          completionTokens: msg.usage?.output_tokens ?? 0,
        },
        toolCalls,
        availableSkills: [],
        loadedSkills: [],
      });
    }
  }

  return {
    sessionId,
    title: summary,
    creationDate: firstTimestamp,
    requests,
    source: "claude",
    provider: "claude",
  };
}
