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
  input?: { subagent_type?: string };
  tool_use_id?: string;
  content?: ContentBlock[] | string;
}

export interface SubagentInput {
  content: string;
  agentId: string;
  subagentType: string | null;
}

/**
 * Scan main session content for Task tool_use blocks and their
 * corresponding tool_result responses to build a map of
 * agentId -> subagentType (e.g., "abc123" -> "Explore").
 */
export function buildSubagentTypeMap(content: string): Map<string, string> {
  const lines = content.split("\n").filter((l) => l.trim());

  // Phase 1: collect tool_use_id -> subagent_type from Task tool_use blocks
  const toolIdToType = new Map<string, string>();
  // Phase 2: collect tool_use_id -> agentId from tool_result blocks
  const toolIdToAgentId = new Map<string, string>();

  for (const line of lines) {
    let parsed: ClaudeLine;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    if (parsed.type === "assistant" && !parsed.isSidechain) {
      const blocks = Array.isArray(parsed.message?.content)
        ? parsed.message!.content
        : [];
      for (const block of blocks) {
        if (
          block.type === "tool_use" &&
          block.name === "Task" &&
          block.id &&
          block.input?.subagent_type
        ) {
          toolIdToType.set(block.id, block.input.subagent_type);
        }
      }
    }

    if (parsed.type === "user" && !parsed.isSidechain) {
      const blocks = Array.isArray(parsed.message?.content)
        ? parsed.message!.content
        : [];
      for (const block of blocks) {
        if (block.type === "tool_result" && block.tool_use_id) {
          // Look for "agentId: <id> (for resuming" pattern in content.
          // Use the LAST match — tool_result text may contain references
          // to other agents in the body, but the framework appends the
          // real agentId at the end.
          const text = extractToolResultText(block);
          let lastAgentId: string | null = null;
          for (const m of text.matchAll(
            /agentId: ([\w-]+) \(for resuming/g,
          )) {
            lastAgentId = m[1];
          }
          if (lastAgentId) {
            toolIdToAgentId.set(block.tool_use_id, lastAgentId);
          }
        }
      }
    }
  }

  // Correlate: agentId -> subagentType
  const result = new Map<string, string>();
  for (const [toolId, agentId] of toolIdToAgentId) {
    const subagentType = toolIdToType.get(toolId);
    if (subagentType) {
      result.set(agentId, subagentType);
    }
  }
  return result;
}

function extractToolResultText(block: ContentBlock): string {
  if (typeof block.content === "string") return block.content;
  if (Array.isArray(block.content)) {
    return block.content
      .filter((b) => b.type === "text" && b.text)
      .map((b) => b.text!)
      .join("\n");
  }
  return "";
}

/**
 * Parse a Claude Code session JSONL file into our Session model.
 *
 * Each line is a standalone JSON object with a `type` field.
 * We extract `assistant` messages (skipping sidechains) as requests,
 * and track `user` messages to populate `messageText`.
 *
 * When `subagents` is provided, their assistant messages are parsed
 * and interleaved into the timeline by timestamp.
 */
export function parseClaudeSessionJsonl(
  content: string,
  summary: string | null,
  subagents?: SubagentInput[],
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
          cacheReadTokens: msg.usage?.cache_read_input_tokens ?? 0,
          cacheCreationTokens: msg.usage?.cache_creation_input_tokens ?? 0,
        },
        toolCalls,
        availableSkills: [],
        loadedSkills: [],
      });
    }
  }

  // Parse subagent content and merge into requests
  if (subagents) {
    for (const sub of subagents) {
      const subRequests = parseSubagentContent(sub);
      requests.push(...subRequests);
    }

    // Sort all requests by timestamp
    requests.sort((a, b) => a.timestamp - b.timestamp);
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

function parseSubagentContent(sub: SubagentInput): SessionRequest[] {
  if (!sub.content.trim()) return [];

  const lines = sub.content.split("\n").filter((l) => l.trim());
  const agentName =
    sub.subagentType ??
    (sub.agentId.startsWith("acompact-") ? "compact" : sub.agentId);
  const requests: SessionRequest[] = [];

  for (const line of lines) {
    let parsed: ClaudeLine;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    // In subagent files, all lines have isSidechain: true
    // We still only want assistant messages
    if (parsed.type === "assistant") {
      const msg = parsed.message;
      if (!msg) continue;

      const toolCalls: ToolCallInfo[] = [];
      const blocks = Array.isArray(msg.content) ? msg.content : [];
      for (const block of blocks) {
        if (block.type === "tool_use" && block.id && block.name) {
          toolCalls.push({ id: block.id, name: block.name });
        }
      }

      requests.push({
        requestId: String(parsed.uuid ?? ""),
        timestamp: parsed.timestamp
          ? new Date(parsed.timestamp).getTime()
          : 0,
        agentId: "claude-code:subagent",
        customAgentName: agentName,
        modelId: String(msg.model ?? ""),
        messageText: "",
        timings: {
          firstProgress: null,
          totalElapsed: null,
        },
        usage: {
          promptTokens: msg.usage?.input_tokens ?? 0,
          completionTokens: msg.usage?.output_tokens ?? 0,
          cacheReadTokens: msg.usage?.cache_read_input_tokens ?? 0,
          cacheCreationTokens: msg.usage?.cache_creation_input_tokens ?? 0,
        },
        toolCalls,
        availableSkills: [],
        loadedSkills: [],
        isSubagent: true,
      });
    }
  }

  return requests;
}
