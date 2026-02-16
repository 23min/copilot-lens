# Data Sources Research

> Findings from analyzing real Copilot chat data on disk. This documents what's actually available, how to access it, and how it differs from the assumptions in the original design spec.

**Status**: Implemented — Copilot session parsing shipped in v0.0.8. All discovery strategies, JSONL parsing, and custom agent/skill detection are in production.

---

## 1. Where Copilot Chat Data Lives

### Workspace storage (auto-discoverable)

```
{UserDataRoot}/User/workspaceStorage/{WorkspaceHash}/chatSessions/{SessionId}.jsonl
```

Platform paths for `{UserDataRoot}`:
- **macOS:** `~/Library/Application Support/Code/` (or `Code - Insiders`)
- **Windows:** `%APPDATA%/Code/`
- **Linux:** `~/.config/Code/`

Each VS Code workspace gets a hash directory. Inside it:
- `workspace.json` — maps the hash to the actual workspace path
- `chatSessions/` — one file per chat session
- `state.vscdb` — SQLite database with session index

### Session index (SQLite)

```bash
sqlite3 state.vscdb "SELECT value FROM ItemTable WHERE key = 'chat.ChatSessionStore.index';"
```

Returns JSON:
```json
{
  "version": 1,
  "entries": {
    "<sessionId>": {
      "sessionId": "25360328-3a13-44a3-bf95-989d6618e9aa",
      "title": "Design specification and development environment questions",
      "lastMessageDate": 1770929089337,
      "timing": {
        "created": 1770929049693,
        "lastRequestStarted": 1770929089337,
        "lastRequestEnded": 1770929154460
      },
      "initialLocation": "panel",
      "hasPendingEdits": false,
      "isEmpty": false,
      "isExternal": false,
      "lastResponseState": 1
    }
  }
}
```

This lets us list all sessions with titles and timestamps without parsing the full session files.

### Finding the right workspace from an extension

```typescript
// context.storageUri gives the extension's own storage dir:
//   workspaceStorage/{hash}/copilot-lens/
// Navigate up twice to get the workspace storage root:
const extensionStorageDir = context.storageUri?.fsPath;
const workspaceHashDir = path.dirname(extensionStorageDir);
const chatSessionsDir = path.join(workspaceHashDir, 'chatSessions');
```

### Global storage (Copilot Chat extension)

```
{UserDataRoot}/User/globalStorage/github.copilot-chat/
├── commandEmbeddings.json    # 25MB — embeddings cache
├── toolEmbeddingsCache.bin   # Tool embeddings
├── debugCommand/             # copilot-debug CLI
├── copilotCli/               # CLI shims
├── logContextRecordings/     # Empty
└── plan-agent/Plan.agent.md  # Plan agent definition
```

No session data here — it's all in workspace storage.

---

## 2. Session File Format: JSONL (Current)

Newer sessions (all sessions in our test workspace) use `.jsonl` — one JSON object per line with incremental patches.

### Line types

| `kind` | Purpose | Key path `k` | Value `v` |
|--------|---------|--------------|-----------|
| `0` | Session header | n/a | Full session object with `version`, `sessionId`, `creationDate`, `inputState` |
| `1` | Property update | Path array, e.g. `["customTitle"]` or `["requests", 0, "result"]` | The new value |
| `2` | Array append | Path array, e.g. `["requests"]` or `["requests", 2, "response"]` | Array of items to append |

### kind=0: Session header

```json
{
  "kind": 0,
  "v": {
    "version": 3,
    "creationDate": 1770929049693,
    "initialLocation": "panel",
    "responderUsername": "GitHub Copilot",
    "sessionId": "25360328-3a13-44a3-bf95-989d6618e9aa",
    "hasPendingEdits": false,
    "requests": [],
    "inputState": {
      "attachments": [],
      "mode": { "id": "agent", "kind": "agent" },
      "selectedModel": {
        "identifier": "copilot/claude-opus-4.6",
        "metadata": {
          "id": "claude-opus-4.6",
          "name": "Claude Opus 4.6",
          "family": "claude-opus-4.6",
          "maxInputTokens": 127805,
          "maxOutputTokens": 64000,
          "capabilities": { "vision": true, "toolCalling": true, "agentMode": true }
        }
      },
      "inputText": "..."
    }
  }
}
```

### kind=1: Property updates

```json
{"kind": 1, "k": ["customTitle"], "v": "Design specification and development environment questions"}
{"kind": 1, "k": ["requests", 0, "result"], "v": { "timings": {...}, "metadata": {...} }}
{"kind": 1, "k": ["inputState", "inputText"], "v": ""}
```

### kind=2: Request data (the main payload)

```json
{
  "kind": 2,
  "k": ["requests"],
  "v": [{
    "requestId": "request_5de388ab-2cea-44aa-acf0-13da44da801f",
    "timestamp": 1770929089337,
    "agent": {
      "extensionId": { "value": "GitHub.copilot-chat" },
      "id": "github.copilot.editsAgent",
      "name": "agent",
      "fullName": "GitHub Copilot",
      "isDefault": true,
      "modes": ["agent"]
    },
    "modelId": "copilot/claude-opus-4.6",
    "responseId": "response_df736250-4e24-4f3d-8da7-fe2bc959ecd0",
    "message": { "text": "I put a document in docs/research..." },
    "response": [
      { "kind": "mcpServersStarting", "didStartServerIds": [] },
      { "kind": "progressTaskSerialized", "content": { "value": "Optimizing tool selection..." } },
      { "kind": "thinking", "value": "Let me first look at...", "id": "thinking_1" },
      { "kind": "toolInvocationSerialized", "toolId": "copilot_listDirectory", "toolCallId": "..." },
      { "value": "markdown response text...", "supportThemeIcons": false }
    ]
  }]
}
```

### Result metadata (set via kind=1 patch after request completes)

```json
{
  "kind": 1,
  "k": ["requests", 0, "result"],
  "v": {
    "timings": {
      "firstProgress": 3659,
      "totalElapsed": 44202
    },
    "metadata": {
      "agentId": "github.copilot.editsAgent",
      "promptTokens": 28857,
      "outputTokens": 1107,
      "renderedUserMessage": [...],
      "toolCallRounds": [
        {
          "id": "...",
          "response": "...",
          "thinking": "...",
          "toolCalls": [
            { "id": "toolu_vrtx_...", "name": "read_file" },
            { "id": "toolu_vrtx_...", "name": "read_file" }
          ],
          "toolInputRetry": 0
        }
      ],
      "toolCallResults": { "<toolCallId>": { "content": [...] } },
      "codeBlocks": [],
      "modelMessageId": "...",
      "responseId": "...",
      "sessionId": "..."
    },
    "usage": {
      "completionTokens": 1107,
      "promptTokens": 28857,
      "promptTokenDetails": [
        { "category": "System", "label": "System Instructions", "percentageOfPrompt": 13 },
        { "category": "System", "label": "Tool Definitions", "percentageOfPrompt": 56 },
        { "category": "User Context", "label": "Messages", "percentageOfPrompt": 7 },
        { "category": "User Context", "label": "Tool Results", "percentageOfPrompt": 24 }
      ]
    }
  }
}
```

---

## 3. Session File Format: JSON (Legacy)

Older sessions use a monolithic `.json` file — same schema as the kind=0 header but with `requests[]` fully populated. The spec's `CopilotChatSession` interface was roughly based on this format. We found no `.json` files in our test workspace (created Feb 2026), suggesting VS Code has migrated fully to JSONL.

**Decision:** Support both formats. Parse JSONL as primary, fall back to monolithic JSON for older sessions.

---

## 4. Chat Replay Export Format (.chatreplay.json)

Produced by: `Developer: Show Chat Debug View` → right-click → `Export As...`

**Cannot be automated.** The export command lives inside the `github.copilot-chat` extension, requires UI interaction (tree node selection + file save dialog), and Microsoft explicitly closed a request for programmatic export as "out of scope" ([issue #228144](https://github.com/microsoft/vscode/issues/228144)).

### Schema

```json
{
  "exportedAt": "2026-02-12T21:13:03.592Z",
  "totalPrompts": 4,
  "totalLogEntries": 18,
  "prompts": [
    {
      "prompt": "user's message text",
      "promptId": "12ed2d39-prompt",
      "hasSeen": false,
      "logCount": 11,
      "logs": [
        {
          "id": "12ed2d39",
          "kind": "request",
          "type": "ChatMLSuccess",
          "name": "panel/editAgent",
          "metadata": {
            "model": "claude-opus-4.6",
            "duration": 4857,
            "timeToFirstToken": 2732,
            "startTime": "2026-02-12T21:04:30.522Z",
            "endTime": "2026-02-12T21:04:35.379Z",
            "usage": {
              "prompt_tokens": 20871,
              "completion_tokens": 214
            },
            "tools": [...]
          },
          "requestMessages": { "messages": [...] },
          "response": { "type": "success", "message": ["..."] }
        },
        {
          "id": "toolu_vrtx_...",
          "kind": "toolCall",
          "tool": "read_file",
          "args": "{\"filePath\": \"...\"}",
          "time": "2026-02-12T21:04:35.000Z",
          "response": ["file contents..."],
          "thinking": { "id": "thinking_1", "text": "..." }
        }
      ]
    }
  ],
  "mcpServers": [...]
}
```

### Two log entry types

| `kind` | `name` / `tool` | Description |
|--------|-----------------|-------------|
| `"request"` | `"panel/editAgent"` | Main agentic LLM call (claude-opus-4.6, large token budget) |
| `"request"` | `"copilotLanguageModelWrapper"` | Subsidiary summarization call (gpt-4o-mini, small budget) |
| `"toolCall"` | `"read_file"`, `"list_dir"`, etc. | Tool invocation with full args and response |

---

## 5. Data Availability Comparison

| Data field | Session JSONL | Chat Replay | Notes |
|---|---|---|---|
| User prompt text | `message.text` | `prompt` | |
| Built-in agent ID | `agent.id` (e.g. `github.copilot.editsAgent`) | `name` (e.g. `panel/editAgent`) | Different identifiers |
| Custom agent (mode) | Parse `<modeInstructions>` from `renderedUserMessage` | Parse `<modeInstructions>` from `requestMessages` | Same approach both formats |
| Model | `modelId` (e.g. `copilot/claude-opus-4.6`) | `metadata.model` (e.g. `claude-opus-4.6`) | Session has vendor prefix |
| Timestamp | `timestamp` (Unix ms) | `metadata.startTime` (ISO 8601) | |
| Duration | `result.timings.totalElapsed` (ms) | `metadata.duration` (ms) | |
| Time to first token | `result.timings.firstProgress` (ms) | `metadata.timeToFirstToken` (ms) | |
| Token usage | `result.usage.promptTokens/completionTokens` | `metadata.usage.prompt_tokens/completion_tokens` | |
| Token breakdown by category | `result.usage.promptTokenDetails[]` | Not present | Session-only |
| Tool calls (name + args) | `result.metadata.toolCallRounds[].toolCalls[]` | `logs[].tool` + `logs[].args` | |
| Tool results (full output) | Serialized internal format (not human-readable) | `logs[].response` (readable text) | Replay is much better here |
| Thinking/reasoning | In `toolCallRounds[].thinking` and response items | `logs[].thinking` | |
| Rendered system prompt | `result.metadata.renderedUserMessage` | `requestMessages.messages[]` | Both have it |
| Skills in system prompt | Embedded in `renderedUserMessage` as `<skills>` XML | Embedded in `requestMessages` | Both — parseable |
| Session title | Via `state.vscdb` index | Not present | |
| MCP servers | Not present | `mcpServers[]` | Replay-only |

---

## 6. Implications for the Extension

### Primary data path (automated)
Read `chatSessions/*.jsonl` (and `*.json` for legacy) directly from workspace storage. This gives us:
- Built-in agent identification (`agent.id`)
- Custom agent detection (parse `<modeInstructions>` from rendered system prompt)
- Model used (`modelId`)
- Timing and token usage
- Tool call names and arguments
- Skill availability (parse `<skills>` XML from rendered system prompt)
- Skill actual loading (detect `read_file` calls to `SKILL.md` paths)

### Secondary data path (manual import)
Support importing `.chatreplay.json` files via a command (e.g. `Copilot Lens: Import Chat Replay`). This adds:
- Human-readable tool results
- Cleaner interleaved log format
- MCP server info

### Session parser requirements
1. **JSONL reconstruction** — read line by line, apply kind=0/1/2 patches to build the full session state
2. **Handle both `.json` and `.jsonl`** — detect by extension, parse accordingly
3. **Large file handling** — session files can grow large; stream JSONL line by line
4. **SQLite index** — use `state.vscdb` for fast session listing (title, timestamps) before parsing full files

### Spec corrections needed
The original spec's `CopilotChatSession` / `CopilotRequest` interfaces need updating:
- `agent` is not `{ id: string; name?: string }` — it's a rich object with `extensionId`, `modes`, `locations`, etc.
- `modelId` has a vendor prefix (`copilot/claude-opus-4.6`)
- `response` is a heterogeneous array of typed items (thinking, tool invocations, markdown text, progress)
- `result` and its `metadata` are delivered as a separate kind=1 patch, not inline in the request

---

## 7. Custom Agent and Skill Detection (Critical Finding)

Custom agents from `.github/agents/` are **not** separate agents in session data. They are implemented as **modes** of the same built-in `github.copilot.editsAgent`.

### Evidence

When invoking `@planner` in Copilot Chat:
- `agent.id` remains `github.copilot.editsAgent`
- `agent.name` remains `agent`
- `agent.modes` remains `["agent"]`
- **No field changes** to indicate a custom agent is active

### How custom agents are identified

The custom agent's instructions are injected into the **system prompt** as a `<modeInstructions>` block:

```xml
<modeInstructions>
You are currently running in "Planner" mode. Below are your instructions for this mode,
they must take precedence over any instructions above.

You are a planning assistant. When asked to plan or design something:
1. Understand the requirements and constraints
2. Identify key technical decisions
3. Break the work into ordered steps
4. Flag risks or open questions

Keep plans concise and actionable.
</modeInstructions>
```

The mode name in the string `"Planner"` maps back to the `name` field in `planner.agent.md` frontmatter.

### How skills are identified

Skills appear in the system prompt as `<skills>` XML:

```xml
<skills>
Here is a list of skills that contain domain specific knowledge on a variety of topics.
Each skill comes with a description of the topic and a file path that contains the detailed instructions.
When a user asks you to perform a task that falls within the domain of a skill, use the 'read_file' tool to acquire the full instructions from the file URI.
<skill>
<name>testing</name>
<description>Guide for writing tests...</description>
<file>/Users/peterbru/Dropbox/Projects/copilot-lens/.github/skills/testing/SKILL.md</file>
</skill>
<skill>
<name>vscode-extensions</name>
<description>Guide for developing VS Code extensions...</description>
<file>/Users/peterbru/Dropbox/Projects/copilot-lens/.github/skills/vscode-extensions/SKILL.md</file>
</skill>
</skills>
```

Skills are listed as available (injected into system prompt) but **not necessarily loaded**. Copilot uses `read_file` to fetch the full skill instructions when it decides a skill is relevant. To detect actual skill usage, look for `read_file` tool calls targeting `SKILL.md` file paths.

### Detection approach for the parser

| What to detect | Where to look | How |
|---|---|---|
| Active custom agent | `renderedUserMessage` or `requestMessages` | Parse `<modeInstructions>` block, extract mode name from `"running in \"{name}\" mode"` |
| Available skills | `renderedUserMessage` or `requestMessages` | Parse `<skills>` XML, extract `<name>` and `<file>` |
| Actually loaded skills | `toolCallRounds` or tool call logs | Find `read_file` calls targeting `*/SKILL.md` paths |
| Built-in agent type | `agent.id` field | `github.copilot.editsAgent` = agent mode, others = ask/edit/etc. |

---

## 8. Custom Agent Detection: Supplementary Signals

The `<modeInstructions>` block (section 7) is the primary detection method. Two additional signals can supplement it:

1. **`@AgentName` in user prompt text** — Simple regex on `message.text`. Limitation: user may select the agent from a dropdown instead of typing `@`, in which case this won't appear in the prompt text.

2. **Match agent instructions body** — Compare the body text inside `<modeInstructions>` against the markdown body of `.agent.md` files. Useful as a fallback/confirmation when the mode name doesn't exactly match the frontmatter `name` field.

---

## 9. Open Questions (Resolved)

| Question from spec | Answer |
|---|---|
| Skill usage inference | **Feasible.** Skills listed in `<skills>` XML in system prompt. Actual loading detectable via `read_file` tool calls to `SKILL.md` paths. |
| Agent ID mapping | **Custom agents don't get their own `agent.id`.** They're modes of `github.copilot.editsAgent`. Detect via `<modeInstructions>` in system prompt. Map mode name back to `.agent.md` `name` field. |
| Does it have to be TypeScript? | **No, but yes.** Plain JS works technically, but `@types/vscode` type definitions catch many API mistakes. TypeScript for extension host; webview can be anything. |
| Develop inside a container? | **No.** Extension testing requires an Extension Development Host (F5 launches a second VS Code window). Small dependency footprint (Node.js, npm). A `.nvmrc` is sufficient. |
| Webview framework | **Lit + D3.js.** Lit is Web Components (~5KB), no build step required, great VS Code webview fit. D3 for graph visualization. Not React (heavy), not Svelte (compiler step). Considered React Flow but decided against pulling in React as a dependency. |
| Testing | **Vitest** for unit tests (parsers as pure functions, TDD). **@vscode/test-electron** for integration tests. **Playwright** for webview E2E if needed later. |
| Chat replay export automation | **Not possible.** Manual only. Use session JSONL as primary data source. Support chatreplay import as optional bonus. |
| SpecStory compatibility | **Deferred.** Focus on the two native formats first. |
| Session file discovery | Use `context.storageUri`, navigate up to workspace hash dir, read `chatSessions/`. Use `state.vscdb` for index. |

---

## 10. Decisions Summary

| Decision | Choice | Rationale |
|---|---|---|
| Language | TypeScript | VS Code API type safety |
| Webview framework | Lit | Lightweight Web Components, no build step, ~5KB |
| Graph library | D3.js (force-directed) | Flexible, framework-agnostic; vis.js/Cytoscape as fallback |
| Unit test runner | Vitest | Fast, modern, good DX |
| Integration tests | @vscode/test-electron | VS Code standard |
| Primary data source | Session JSONL files | Auto-discoverable, rich enough for all features |
| Secondary data source | Chat replay JSON (import) | Manual export, richer tool results |
| Custom agent detection | Parse `<modeInstructions>` from system prompt | Only reliable signal; `agent.id` doesn't change |
| Skill detection | Parse `<skills>` XML + detect `read_file` calls to SKILL.md | Distinguishes "available" from "actually loaded" |
| Bundler | esbuild | VS Code extension standard |
| Commit style | Conventional Commits | Per CLAUDE.md |
| Branching | Feature branches off main | Per CLAUDE.md |

---

## References

- [VS Code Chat Sessions docs](https://code.visualstudio.com/docs/copilot/chat/chat-sessions)
- [Chat Debug View docs](https://code.visualstudio.com/docs/copilot/chat/chat-debug-view)
- [PR #672: Chat debug export](https://github.com/microsoft/vscode-copilot-chat/pull/672)
- [Issue #228144: Programmatic export — closed as out of scope](https://github.com/microsoft/vscode/issues/228144)
- [Reverse Engineering Agentic Workflows from Copilot Debug Logs](https://coderrob.com/posts/reverse-engineering-agentic-workflows-from-copilot-debug-logs/)
- [GitHub Copilot Chat Exporter extension](https://marketplace.visualstudio.com/items?itemName=fengzehan.vscode-copilot-exporter)
