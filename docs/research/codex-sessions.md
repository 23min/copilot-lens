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

Each session is a single JSONL file. The format is **not officially documented** — the details below are reverse-engineered from community tools and GitHub issues.

### Line 1: SessionMeta header

```json
{
  "session_id": "uuid",
  "timestamp": "2026-02-15T10:00:00Z",
  "model": "gpt-5-codex",
  "cli_version": "1.2.3"
}
```

### Lines 2+: RolloutLine entries

Each subsequent line is a `RolloutLine` wrapping either a `ResponseItem` or an `EventMsg`.

### Event types (`EventMsg` with `payload.type`)

| Event Type | Description |
|---|---|
| `token_count` | Cumulative token usage for the session |
| `turn_started` | Marks the beginning of a new turn/generation |
| `context_compacted` | Records when context compression occurred |

### Token usage (from `token_count` events)

| Field | Description |
|---|---|
| `total_token_usage` | Cumulative tokens consumed |
| `last_token_usage` | Most recent usage snapshot |
| `model_context_window` | Maximum context window size |
| `cached_input_tokens` | Reused cached tokens |

Per-turn deltas can be computed by subtracting previous `token_count` totals (input, cached input, output, reasoning, total).

### Response items

| Type | Description |
|---|---|
| `user_message` | User input (`{"type": "user_message", "message": "...", "images": []}`) |
| `function_call` | Tool invocation (tool name, parameters) |
| `function_call_output` | Tool execution result (success/failure, duration) |
| Assistant messages | Role and content of assistant responses |

### Session metadata (`turn_context`)

| Field | Description |
|---|---|
| Model name | e.g., `gpt-5-codex` |
| CLI version | Version of Codex CLI |
| Sandbox/approval settings | Execution environment config |
| Conversation ID | Links to conversation thread |

---

## 3. Timing Data

### What's available

| Data | Available | Notes |
|---|---|---|
| Session start time | Yes | `SessionMeta.timestamp` (RFC 3339) |
| Per-event timestamps | **No** | Events in rollout JSONL have no individual timestamps |
| Request duration | **No** | Cannot be computed from persisted data |
| Tool call duration | **No** | `function_call`/`function_call_output` have no timing fields |

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

**These events are streamed but not persisted.** Timing would require capturing them at ingestion time.

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

## 5. Implementation Plan

### Parser

1. Discover rollout files in `~/.codex/sessions/` (or `CODEX_HOME`)
2. Parse line 1 as `SessionMeta` for session-level metadata
3. Iterate subsequent lines, classifying as `EventMsg` or `ResponseItem`
4. Extract token usage from `token_count` events (compute deltas between consecutive events)
5. Extract tool calls from `function_call` / `function_call_output` items
6. Map to existing `Session` / `SessionRequest` model with `provider: "codex"`

### Settings

- `agentLens.codexDir` — custom path to Codex sessions directory
- Respect `CODEX_HOME` environment variable as fallback

### UI changes

- Add "Codex" option to source filter toggle
- Codex provider badge in Session Explorer (suggest green)

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
