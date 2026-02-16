# Session Tracing & Execution Graphs — Research

> Research into building trace visualizations from AI coding agent session data. The goal: show session execution as a waterfall/flamechart — where time is spent, what tools are called, where bottlenecks and throttling occur.

**Status**: Research only — none of the four phases have been implemented. Mapped to ROADMAP Milestone 11 (future).

---

## 1. The Idea

Current Agent Lens views show **what** happened (metrics, session timeline). Tracing shows **when** and **how long** — turning a session into an execution graph:

```
User message ──────────────────────────────────────────────── 45.2s total
├─ API request (claude-opus-4-6) ─────────────── 12.3s
│  └─ Tool: read_file ──── 0.8s
│  └─ Tool: grep_search ── 1.2s
├─ API request (claude-opus-4-6) ───────── 8.1s
│  └─ Tool: write_file ─── 0.3s
├─ API request (claude-opus-4-6) ──── 5.4s
│  └─ Tool: run_terminal ──────────── 18.9s  ← bottleneck
└─ API response (final) ── 0.3s
```

This answers questions like:
- Where is time being spent — API calls or tool execution?
- Is a specific tool consistently slow?
- Are there long pauses (throttling? rate limits? user idle time)?
- How does context size affect response time over a session?
- Are subagent/sidechain calls adding latency?

---

## 2. Available Timing Data by Provider

### GitHub Copilot

**Best out-of-the-box timing.** The JSONL session format includes native timing fields per request.

| Field | Unit | Description |
|---|---|---|
| `requests[].timestamp` | ms (epoch) | When the request was made |
| `result.timings.totalElapsed` | ms | Total request duration (user → final response) |
| `result.timings.firstProgress` | ms | Time to first streaming token |
| `result.usage.promptTokens` | count | Input tokens |
| `result.usage.completionTokens` | count | Output tokens |

**What we can build:**
- Request-level waterfall with exact durations
- Time-to-first-token vs total duration (shows streaming lag)
- Token count correlation with response time
- Inter-request gaps (user think time vs system processing)

**What we can't:**
- Per-tool-call duration (tool calls have names/IDs but no individual timing)
- API-level vs tool-level breakdown within a request

### Claude Code

**Timestamps on every message, but no explicit durations.** Every line in the JSONL carries an ISO 8601 `timestamp` with millisecond precision.

| Field | Description |
|---|---|
| `timestamp` | ISO 8601 ms on every message (user, assistant, tool_result) |
| `message.usage.*` | Token counts per response |
| `message.model` | Model used |
| `isSidechain` | Whether this is a subagent call |
| `parentUuid` | Conversation threading |

**What we can derive:**
- Request duration: `assistant.timestamp - user.timestamp`
- Per-turn duration in tool-use loops: successive `assistant` timestamps
- Subagent execution time: sidechain message timestamp ranges
- Session pacing: gaps between turns

**What we can't (from JSONL alone):**
- Per-tool execution duration (tool_use and tool_result are in the same assistant/user message pair)
- API response time vs tool execution time
- Rate limiting / retry information

**OpenTelemetry (opt-in, not in JSONL):**

When `CLAUDE_CODE_ENABLE_TELEMETRY=1` is set, Claude Code emits OTel events with rich timing:

| Event | Key Fields |
|---|---|
| `claude_code.api_request` | `duration_ms`, `cost_usd` |
| `claude_code.tool_result` | `duration_ms`, `tool_name`, `success` |
| `claude_code.api_error` | `duration_ms`, `status_code`, `attempt` (retry count) |

This is the **only source of per-tool `duration_ms`** across any provider. It also captures rate limiting (status 429) and retry counts. However, OTel events are exported to a collector, not written to session JSONL files.

### OpenAI Codex CLI

**Poorest timing data.** Rollout JSONL files lack per-event timestamps.

| Data | Available |
|---|---|
| Session start time | Yes (`SessionMeta.timestamp`) |
| Per-event timestamps | No |
| Request duration | Cannot compute |
| Tool call duration | Cannot compute |

The `--json` streaming output has event structure (`turn.started`/`turn.completed`, `item.started`/`item.completed`) that maps well to traces, but carries no timing fields. Community has requested this ([Issue #8027](https://github.com/openai/codex/issues/8027)).

---

## 3. Comparative Summary

| Capability | Copilot | Claude Code | Codex CLI |
|---|---|---|---|
| Request duration | Native (`totalElapsed`) | Derived (timestamp delta) | Not available |
| Time to first token | Native (`firstProgress`) | Not available | Not available |
| Per-tool duration | Not available | OTel only | Not available |
| Timestamps per event | Per request (ms epoch) | Per message (ISO 8601 ms) | Session-level only |
| Rate limit detection | No | OTel `api_error` (429) | No |
| Retry tracking | No | OTel `attempt` field | No |
| Subagent timing | N/A | Yes (`isSidechain` + timestamps) | No |

---

## 4. What We Can Build

### Phase 1: Request Waterfall (Copilot + Claude)

A horizontal waterfall chart showing each request as a bar, positioned on a time axis:

```
Time →  0s        5s        10s       15s       20s
        ├─────────┼─────────┼─────────┼─────────┤
Req 1   ████████░░                                  8.2s (░ = time to first token)
Req 2              ███████████                     11.1s
Req 3                          ████                 4.3s
Req 4                              ████████████    12.0s
```

**Data needed:** request timestamp + totalElapsed (Copilot) or derived from message timestamps (Claude).

Annotations per bar:
- Agent name and model
- Token count (prompt + completion)
- Tool calls (count, names)
- Agent/model switches highlighted

### Phase 2: Tool Call Breakdown

Where per-tool timing is available (Claude OTel), expand request bars into nested tool-call spans:

```
Req 2  ███████████████████████████████  11.1s
       ├─ API response ──── 3.2s
       ├─ read_file ──── 0.4s
       ├─ API response ──── 2.8s
       ├─ write_file ── 0.2s
       ├─ run_terminal ──────── 4.5s  ← slowest
```

### Phase 3: Session Health Indicators

Overlay indicators on the waterfall:

| Indicator | Source | Visual |
|---|---|---|
| **Rate limiting** | Claude OTel 429 errors | Red marker on timeline |
| **Retries** | Claude OTel `attempt > 1` | Retry count badge |
| **Context growth** | Token counts over time | Line chart overlay |
| **Long gaps** | Timestamp deltas between requests | Gray gap bars |
| **Timeouts** | Missing responses, error events | Red X marker |
| **Context compaction** | Codex `context_compacted`, Claude behavior | Orange marker |

### Phase 4: Execution Graph (DAG)

For sessions with subagents/sidechains (Claude Code), render an execution DAG:

```
Main thread ──────┬──── Subagent A ────┬──── continue ────
                  │                    │
                  └──── Subagent B ────┘
```

**Data needed:** `parentUuid`, `isSidechain`, `sessionId` threading from Claude Code JSONL.

---

## 5. Visualization Technology

### Options

| Approach | Pros | Cons |
|---|---|---|
| **D3.js custom** | Full control, already used in Agent Lens | More code to write |
| **Flame chart library** | Purpose-built for this | May not fit our exact model |
| **SVG timeline** | Simple, lightweight | Limited interaction |
| **Canvas-based** | Performance for large sessions | Harder accessibility |

Recommendation: **D3.js custom** — we already have D3 in the project, and the visualization is close to a Gantt chart (horizontal bars on a time axis). D3's scale/axis utilities and transitions are a good fit.

### Webview panel

New command: `agentLens.openTrace` / "Agent Lens: Session Trace"

Could be:
- A new dedicated webview panel
- An additional tab/mode within the existing Session Explorer

---

## 6. Data Model

```typescript
interface TraceSpan {
  id: string;
  parentId: string | null;     // for nesting (request → tool calls)
  label: string;               // "API request", "read_file", etc.
  startMs: number;             // relative to session start
  durationMs: number;
  type: 'request' | 'tool' | 'subagent' | 'gap' | 'error';
  metadata: {
    agent?: string;
    model?: string;
    promptTokens?: number;
    completionTokens?: number;
    toolName?: string;
    isRetry?: boolean;
    statusCode?: number;
  };
}

interface SessionTrace {
  sessionId: string;
  provider: SessionProviderType;
  startTime: Date;
  totalDurationMs: number;
  spans: TraceSpan[];
}
```

The trace builder would convert provider-specific session data into this common `SessionTrace` model, similar to how we normalize into `Session`/`SessionRequest` today.

---

## 7. Implementation Phases

| Phase | What | Depends on |
|---|---|---|
| **Phase 1** | Request waterfall (Copilot + Claude) | Existing session data |
| **Phase 2** | Tool call breakdown (Claude OTel) | OTel data ingestion |
| **Phase 3** | Session health indicators | Phase 1 + error/throttle detection |
| **Phase 4** | Execution DAG for subagents | Phase 1 + Claude sidechain parsing |

Phase 1 is achievable with data we already parse today. Phases 2-4 require additional data sources or deeper parsing.

---

## References

- [Claude Code monitoring/OTel](https://code.claude.com/docs/en/monitoring-usage)
- [Claude Code statusline](https://code.claude.com/docs/en/statusline)
- [Codex CLI CODEX_TRACE_PATH proposal (Issue #8027)](https://github.com/openai/codex/issues/8027)
- [ccusage](https://github.com/ryoppippi/ccusage) — token/cost analysis across providers
- [Claude Code log analysis with DuckDB](https://liambx.com/blog/claude-code-log-analysis-with-duckdb)
