# Claude Code Session Data Research

> Findings from analyzing real Claude Code CLI session data on disk. Documents the JSONL schema, token tracking, subagent structure, and how it maps to our existing `Session`/`SessionRequest` model.

---

## 1. Where Claude Code Data Lives

### Session files (per-project)

```
~/.claude/projects/{encoded-project-path}/{sessionId}.jsonl
```

The project path is encoded by replacing `/` with `-`, e.g.:
- `/Users/peterbru/Dropbox/Projects/copilot-lens` → `-Users-peterbru-Dropbox-Projects-copilot-lens`

Each session is a JSONL file (one JSON object per line). Sessions can be large — the biggest observed session has 4,971 lines.

### Session index

```
~/.claude/projects/{encoded-project-path}/sessions-index.json
```

```json
{
  "version": 1,
  "entries": [
    {
      "sessionId": "e848fc35-...",
      "fullPath": "/Users/.../.claude/projects/.../e848fc35-....jsonl",
      "fileMtime": 1769365656734,
      "firstPrompt": "in iterm2, what do I answer...",
      "summary": "iTerm2 Oh My Zsh Installation Guide",
      "messageCount": 6,
      "created": "2026-01-25T18:16:50.773Z",
      "modified": "2026-01-25T18:19:20.784Z",
      "gitBranch": "",
      "projectPath": "/Users/peterbru"
    }
  ]
}
```

### Subagent files

```
~/.claude/projects/{encoded-project-path}/{sessionId}/subagents/agent-{agentId}.jsonl
```

Same JSONL format as main session, but with `isSidechain: true` and an `agentId` field.

### Aggregated stats

```
~/.claude/stats-cache.json
```

Pre-computed metrics: tokens by model, daily activity, session counts. Useful as a cross-check but we'll parse raw JSONL for accuracy.

### Command history

```
~/.claude/history.jsonl
```

Quick-access log of recent prompts with timestamps, project paths, and session IDs.

---

## 2. Session JSONL Schema

### Common fields (all line types)

| Field | Type | Description |
|-------|------|-------------|
| `uuid` | `string` | Unique ID for this event |
| `parentUuid` | `string \| null` | Parent message UUID (null for root) |
| `timestamp` | `string` | ISO 8601 timestamp |
| `type` | `string` | Event type (see below) |
| `sessionId` | `string` | Session UUID |
| `isSidechain` | `boolean` | `true` for subagent messages |
| `userType` | `string` | Always `"external"` |
| `cwd` | `string` | Working directory |
| `version` | `string` | Claude Code version (e.g. `"2.1.39"`) |
| `gitBranch` | `string` | Current git branch |
| `slug` | `string` | Human-readable session slug |
| `agentId` | `string?` | Agent ID (subagents only) |

### Event types

| `type` | Purpose |
|--------|---------|
| `"user"` | User message or tool result |
| `"assistant"` | Model response (with token usage) |
| `"progress"` | Hook execution events |
| `"queue-operation"` | Session lifecycle |
| `"file-history-snapshot"` | File change tracking |

---

## 3. Message Content Blocks

Content is **always an array of blocks**, never a plain string.

### User content blocks

```typescript
// Plain text
{ "type": "text", "text": "..." }

// Tool result (response to assistant's tool_use)
{ "type": "tool_result", "tool_use_id": "toolu_...", "content": "..." }
```

### Assistant content blocks

```typescript
// Plain text
{ "type": "text", "text": "..." }

// Tool invocation
{
  "type": "tool_use",
  "id": "toolu_013NgKJsC1u8MF812E4Qs59F",
  "name": "Read",            // Tool name: Read, Bash, Grep, Glob, Edit, Write, Task, etc.
  "input": { ... }           // Tool parameters
}

// Extended thinking
{
  "type": "thinking",
  "thinking": "...",          // Internal reasoning
  "signature": "..."         // Verification signature
}
```

---

## 4. Token Usage

Token counts appear **per assistant message** in the `message.usage` field:

```json
{
  "input_tokens": 3,
  "output_tokens": 14,
  "cache_creation_input_tokens": 1033,
  "cache_read_input_tokens": 28193,
  "cache_creation": {
    "ephemeral_5m_input_tokens": 0,
    "ephemeral_1h_input_tokens": 1033
  },
  "service_tier": "standard"
}
```

### Key insight: cache tokens dominate

In real usage, `cache_read_input_tokens` can exceed `input_tokens` by orders of magnitude:

| Metric | Value |
|--------|-------|
| `input_tokens` | 5,044 |
| `output_tokens` | 12,753 |
| `cache_read_input_tokens` | 116,344,111 |
| `cache_creation_input_tokens` | 4,893,207 |

This is a unique metric compared to Copilot. Prompt caching is critical for Claude Code's economics and should be surfaced in the dashboard.

---

## 5. Tool Call Pattern

A typical tool call sequence in the JSONL:

```
Line N:   assistant → content includes { "type": "tool_use", "id": "toolu_...", "name": "Read" }
Line N+1: progress  → { "hookEvent": "PreToolUse" }
Line N+2: progress  → { "hookEvent": "PostToolUse" }
Line N+3: user      → content includes { "type": "tool_result", "tool_use_id": "toolu_..." }
Line N+4: assistant → next response
```

Tool names observed: `Read`, `Bash`, `Grep`, `Glob`, `Edit`, `Write`, `Task`, `WebSearch`, `WebFetch`, `TodoWrite`, `AskUserQuestion`, `Skill`, `NotebookEdit`.

---

## 6. Subagent Structure

When the assistant uses the `Task` tool, a subagent is spawned:

```json
{
  "type": "tool_use",
  "name": "Task",
  "input": {
    "description": "Find Claude extension storage",
    "subagent_type": "Explore",
    "prompt": "..."
  }
}
```

The subagent's conversation is recorded in a separate JSONL file under `subagents/`. These files have the same schema but with `isSidechain: true`.

Observed: 27 subagent files in a single session, each representing an independent exploration or task thread.

### Subagent file structure

```
~/.claude/projects/{encoded-path}/{sessionId}/subagents/agent-{agentId}.jsonl
```

Each subagent file contains the same JSONL format with these distinguishing fields:
- `isSidechain: true` on all lines (both user and assistant)
- `agentId: "{shortId}"` — unique identifier (e.g., `"ad2d877"`)
- Same `sessionId` as the parent session

Common `subagent_type` values: `"Explore"`, `"Bash"`, `"Plan"`, `"general-purpose"`.

### AgentId correlation

The `tool_result` for a Task call contains the agentId in a text block:

```
agentId: ad2d877 (for resuming to continue this agent's work if needed)
```

This enables correlating `subagent_type` from the `Task` tool_use input with the agentId in the subagent filename. The correlation chain:

1. Main session: `Task` tool_use with `id: "toolu_XXX"` and `input.subagent_type: "Explore"`
2. Main session: `tool_result` with `tool_use_id: "toolu_XXX"` containing `"agentId: ad2d877"`
3. Subagent file: `agent-ad2d877.jsonl`

### How we parse subagents

1. **Discovery**: `claudeLocator.ts` scans `{sessionId}/subagents/` for `agent-*.jsonl` files
2. **Type mapping**: `buildSubagentTypeMap()` scans the main session to build `Map<agentId, subagentType>`
3. **Parsing**: Each subagent's assistant messages become `SessionRequest` entries with:
   - `agentId: "claude-code:subagent"` (fixed prefix)
   - `customAgentName: subagentType ?? agentId` (e.g., `"Explore"` or `"ad2d877"`)
   - `isSubagent: true`
4. **Interleaving**: Subagent requests merge into the main timeline sorted by timestamp
5. **Display**: Session Explorer shows sage-green timeline dots and "subagent" badges

---

## 7. Mapping to Our Data Model

### Session → `Session`

| Claude Code | Our model |
|-------------|-----------|
| `sessionId` | `sessionId` |
| `sessions-index.json` summary | `title` |
| First message timestamp | `creationDate` |
| Filtered assistant messages | `requests[]` |
| `"claude"` | `source` |

### Assistant message → `SessionRequest`

| Claude Code | Our model |
|-------------|-----------|
| `uuid` | `requestId` |
| `timestamp` | `timestamp` |
| `"claude-code"` (main) or `"claude-code:subagent"` | `agentId` |
| Subagent type (e.g., `"Explore"`) or `agentId` fallback | `customAgentName` |
| `message.model` | `modelId` |
| User message `text` before this response | `messageText` |
| `message.usage` | `usage` → `{ promptTokens, completionTokens, cacheReadTokens?, cacheCreationTokens? }` |
| `tool_use` blocks in content | `toolCalls[]` |
| N/A (Claude Code doesn't have skills) | `loadedSkills` → `[]` |
| `isSidechain` / subagent file origin | `isSubagent` → `true` for subagent requests |

### Implemented fields

| Field | Source | Status |
|-------|--------|--------|
| `cacheReadTokens` | `message.usage.cache_read_input_tokens` | Implemented in `usage` |
| `cacheCreationTokens` | `message.usage.cache_creation_input_tokens` | Implemented in `usage` |
| `isSubagent` | Subagent file origin | Implemented on `SessionRequest` |

### Fields to consider

| Field | Source | Why |
|-------|--------|-----|
| `thinkingTokens` | Count of `thinking` blocks | Shows reasoning overhead |

---

## 8. Differences from Copilot

| Aspect | Copilot | Claude Code |
|--------|---------|-------------|
| Storage | VS Code `workspaceStorage/` | `~/.claude/projects/` |
| Format | JSONL with kind 0/1/2 patches | JSONL with typed messages |
| Token tracking | Not in session files | Per-message `usage` field |
| Agent detection | `inputState.mode` URI inference | Explicit subagent files |
| Skills | `<skills>` XML in system prompt | N/A |
| Caching | Not exposed | `cache_read` / `cache_creation` tokens |
| Tool calls | `toolCallsByName` aggregated | Individual `tool_use` content blocks |
| Models | `copilot/claude-opus-4.6` etc. | `claude-opus-4-6` etc. |
| Thinking | Not exposed | `thinking` content blocks |

---

## 9. Implementation Notes

1. **Project matching**: To find sessions for the current workspace, encode the workspace path and look for the matching directory under `~/.claude/projects/`.

2. **Large files**: Sessions can be very large (5k+ lines). Parse line-by-line, only keep assistant messages for `SessionRequest` construction.

3. **Token mapping**: Map `input_tokens` → `promptTokens` and `output_tokens` → `completionTokens`. Add cache tokens as a separate dimension.

4. **Subagent handling**: Subagent requests are inlined into the parent session timeline sorted by timestamp. Each subagent request gets `isSubagent: true`, `agentId: "claude-code:subagent"`, and `customAgentName` set to the subagent type (e.g., "Explore", "Bash", "Plan") via `buildSubagentTypeMap()` correlation.

5. **No workspace hash**: Unlike Copilot, Claude Code uses the literal project path, making discovery straightforward.
