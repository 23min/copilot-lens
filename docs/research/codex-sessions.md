# OpenAI Codex CLI — Session Data Research

> Research into local session data stored by the OpenAI Codex CLI and VS Code extension, for integration into Agent Lens.

---

## 1. Where Codex Session Data Lives

### Default location

```
~/.codex/sessions/<provider_id>/<YYYY-MM-DD>/<uuid>.jsonl
```

Configurable via the `CODEX_HOME` environment variable (defaults to `~/.codex/`).

### Other local files

| Path | Contents |
|------|----------|
| `~/.codex/config.toml` | Global configuration |
| `~/.codex/history.jsonl` | Append-only session transcript log |
| `~/.codex/AGENTS.md` | Global agent instructions |
| `~/.codex/rules/` | Custom rules |
| `~/.codex/log/` | Application logs |
| `~/.codex/auth.json` | Credentials (if not using OS keychain) |

### History file

`~/.codex/history.jsonl` is a single append-only JSONL file with session transcripts. Controlled by `history.persistence` config (`save-all` or `none`). File size capped via `history.max_bytes`.

### VS Code extension

The Codex VS Code extension (`openai.chatgpt`) writes to the **same** `~/.codex/sessions/` directory as the CLI. Local tasks started from the extension produce the same `rollout-*.jsonl` files.

---

## 2. Rollout JSONL Format

Each session is a single JSONL file. The format is **not officially documented** — the details below are reverse-engineered from real session files (verified February 2026).

### Typed envelope structure

Every line is a typed envelope with a consistent shape:

```json
{
  "timestamp": "2026-02-15T13:00:00.000Z",
  "type": "<line_type>",
  "payload": { ... }
}
```

Line types: `session_meta`, `response_item`, `event_msg`, `turn_context`.

### Line 1: `session_meta`

The first line is always a `session_meta` envelope containing session-level metadata:

```json
{
  "timestamp": "2026-02-15T13:00:00.000Z",
  "type": "session_meta",
  "payload": {
    "id": "uuid",
    "timestamp": "2026-02-15T13:00:00.000Z",
    "cli_version": "0.100.0",
    "model_provider": "openai",
    "source": "cli"
  }
}
```

Note: the `model` field is **not** in session_meta — it comes from `turn_context` lines (see below).

### `event_msg` lines

Events that mark turn lifecycle and token usage. `payload.type` values:

| Event Type | Description |
|---|---|
| `task_started` | Marks the beginning of a new turn (may include `turn_id`) |
| `task_complete` | Marks the end of a successful turn |
| `turn_aborted` | Turn was interrupted (includes `reason`) |
| `token_count` | Cumulative token usage snapshot (see below) |
| `user_message` | User input text (`payload.message`) |
| `agent_reasoning` | Agent's internal reasoning |
| `agent_message` | Agent message to user |

### Token usage (from `token_count` events)

```json
{
  "type": "event_msg",
  "payload": {
    "type": "token_count",
    "info": {
      "total_token_usage": {
        "input_tokens": 2500,
        "cached_input_tokens": 1800,
        "output_tokens": 500,
        "reasoning_output_tokens": 0,
        "total_tokens": 3000
      },
      "last_token_usage": { ... }
    }
  }
}
```

- `total_token_usage` is **cumulative** across the entire session
- Per-turn deltas are computed by subtracting previous `total_token_usage` values
- `info` can be `null` (e.g., when no API call was made)
- Multiple `token_count` events per turn are possible — use the last one

### `response_item` lines

Conversation content. `payload.type` values:

| Type | Description |
|---|---|
| `message` | User, assistant, or developer message (see `role` and `content[]`) |
| `function_call` | Tool invocation (`name`, `call_id`, `arguments`) |
| `function_call_output` | Tool result (`call_id`, `output`) |
| `reasoning` | Model reasoning content |
| `custom_tool_call` | Custom/MCP tool calls |
| `ghost_snapshot` | Intermediate state snapshots |

#### Message content structure

Messages have a `role` (`user`, `assistant`, `developer`) and a `content` array:

```json
{
  "type": "response_item",
  "payload": {
    "type": "message",
    "role": "user",
    "content": [{ "type": "input_text", "text": "Hello" }]
  }
}
```

Content part types: `input_text`, `output_text`, `summary_text`, `input_image`.

Assistant messages may include a `phase` field: `"commentary"` or `"final_answer"`.

### `turn_context` lines

Provides model information for the current turn:

```json
{
  "type": "turn_context",
  "payload": {
    "model": "gpt-5.3-codex"
  }
}
```

### Turn lifecycle

A typical turn follows this sequence:

1. `event_msg` type `task_started` — opens the turn
2. `turn_context` — sets the model for this turn
3. `response_item` type `message` (role: user) — user input
4. `response_item` type `function_call` / `function_call_output` — tool usage (0+)
5. `response_item` type `message` (role: assistant, phase: final_answer) — response
6. `event_msg` type `token_count` — cumulative usage snapshot
7. `event_msg` type `task_complete` — closes the turn

Older sessions may omit `task_started`/`task_complete` — the parser handles this by creating implicit turns on the first `response_item`.

---

## 3. Timing Data

### What's available

| Data | Available | Notes |
|---|---|---|
| Session start time | Yes | `session_meta.payload.timestamp` (ISO 8601) |
| Per-line timestamps | Yes | Every envelope has a `timestamp` field |
| Per-turn timing | **Partial** | Can compute from `task_started` → `task_complete` timestamps |
| Tool call duration | **No** | `function_call`/`function_call_output` share the same envelope timestamp |

Note: While every line has a timestamp, the granularity is limited. Multiple lines within a turn often share the same timestamp. Per-tool-call duration cannot be reliably computed from persisted data.

### `--json` streaming output

The `codex exec --json` flag emits structured events in real-time:

| Event | Key Fields |
|---|---|
| `thread.started` | `thread_id` |
| `turn.started` | (no timing fields) |
| `turn.completed` | `usage.input_tokens`, `usage.output_tokens` |
| `turn.failed` | Error information |
| `item.started` | `item.id`, `item.type`, `item.command`, `item.status` |
| `item.completed` | `item.id`, `item.type`, `item.text` |

Item types: `command_execution`, `agent_message`, `reasoning`, `file_change`, `mcp_tool_call`, `web_search`, `plan_update`.

**These events are streamed but not persisted.** Finer-grained timing would require capturing them at ingestion time.

### Community requests for timestamps

- [Issue #8027](https://github.com/openai/codex/issues/8027) — `CODEX_TRACE_PATH` proposal to add `ts_ms` fields
- [Issue #8620](https://github.com/openai/codex/issues/8620) — Request for `timestamp` on `thread.started`
- [Issue #10407](https://github.com/openai/codex/issues/10407) — Request for stable session export format

---

## 4. Caveats

- **Format is unstable**: OpenAI maintainers consider it internal and subject to change
- **Historical gaps**: Sessions before September 2025 may lack `token_count` events and model metadata
- **No per-event timestamps**: Makes trace/flamechart visualization impossible from persisted data alone
- **VS Code extension is closed-source**: Only the CLI is Apache-2.0 ([Issue #5822](https://github.com/openai/codex/issues/5822))

---

## 5. Implementation (Completed)

### Parser — `src/parsers/codexSessionParser.ts`

1. Parse line 1 as `session_meta` envelope for session-level metadata
2. Iterate subsequent lines by envelope type:
   - `event_msg`: track turn lifecycle (`task_started`/`task_complete`/`turn_aborted`), extract `user_message` text, accumulate `token_count` snapshots
   - `response_item`: extract user messages from `message` items, tool calls from `function_call` items
   - `turn_context`: update model for current turn
3. Compute per-turn token deltas from cumulative `total_token_usage`
4. Handle older sessions without explicit `task_started` (implicit turn on first `response_item`)
5. Map to `Session` / `SessionRequest` model with `provider: "codex"`, `agentId: "codex-cli"`

### Locator — `src/parsers/codexLocator.ts`

Discovery priority: `agentLens.codexDir` setting → `CODEX_HOME` env → `~/.codex/sessions/`

### Provider — `src/parsers/codexProvider.ts`

Implements `SessionProvider` interface. Scans both configured and default directories, deduplicates by path.

### Settings

- `agentLens.codexDir` — custom path to Codex sessions directory
- Respects `CODEX_HOME` environment variable as fallback

### UI changes

- "Codex" filter toggle in Session Explorer and Metrics Dashboard
- Green provider badge (`.provider-badge.codex`, color `#8aab7f`)
- Container setup guide with mount instructions

---

## 6. Community Tools

| Tool | What it does |
|------|-------------|
| [ccusage](https://ccusage.com/guide/codex/) | Parses token counts from rollout JSONL, calculates costs |
| [codex-hud](https://github.com/fwyc0573/codex-hud) | Real-time HUD for Codex CLI, parses `token_count`/`turn_started`/`context_compacted` events |
| [codex_usage](https://lib.rs/crates/codex_usage) | Rust crate for Codex session analysis |

---

## References

- [Codex CLI Features](https://developers.openai.com/codex/cli/features/)
- [Codex Advanced Configuration](https://developers.openai.com/codex/config-advanced/)
- [Codex Configuration Reference](https://developers.openai.com/codex/config-reference/)
- [Codex IDE Extension](https://developers.openai.com/codex/ide/)
- [GitHub Issue #2288 — JSON trajectory output](https://github.com/openai/codex/issues/2288)
- [GitHub Issue #4963 — Log rotate history.jsonl](https://github.com/openai/codex/issues/4963)
- [GitHub Discussion #2956 — Save chat history in VS Code](https://github.com/openai/codex/discussions/2956)
