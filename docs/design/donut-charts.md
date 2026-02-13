# Donut Charts & Token Efficiency — Design Spec

> Add token distribution donut charts and hover tooltips to the Metrics Dashboard so users can understand where their tokens go and identify optimization opportunities.

---

## 1. Problem

The current Metrics Dashboard shows **request counts** per agent and model as bar charts. This answers "how often was each agent used?" but not **"where did my tokens go?"** — which is the question that matters for cost and efficiency.

An agent might handle only 3 requests but consume 60% of all tokens due to large system prompts or verbose output. The current bar charts can't surface this. Additionally, there's no way to see the prompt-vs-completion ratio, which hints at context bloat (high prompt) or heavy generation (high completion).

---

## 2. Scope

### In scope
1. Three donut charts showing token distribution
2. Hover tooltips on the agent usage bar chart showing per-agent token averages
3. New `TokenEntry` data model and metrics collector changes
4. Tests for the new aggregation logic

### Out of scope
- Token budget/limit tracking (no data source for this yet)
- Cost estimation (would need model pricing, which varies)
- Date range filters
- Drill-down from donut slice to individual sessions

---

## 3. Design

### 3.1 Donut charts

Three donut charts displayed in a responsive grid row between the stat cards and the activity timeline:

```
┌──────────────────────────────────────────────────────────┐
│  TOKEN DISTRIBUTION                                      │
│                                                          │
│  ┌─ By Agent ──────┐  ┌─ By Model ──────┐  ┌─ Prompt vs │
│  │                  │  │                  │  │ Completion │
│  │   ╭──────╮       │  │   ╭──────╮       │  │  ╭──────╮  │
│  │   │ 45.2k│ leg.  │  │   │ 45.2k│ leg.  │  │  │ 45.2k│  │
│  │   ╰──────╯       │  │   ╰──────╯       │  │  ╰──────╯  │
│  │                  │  │                  │  │            │
│  └──────────────────┘  └──────────────────┘  └────────────┘
└──────────────────────────────────────────────────────────┘
```

Each donut shows:
- **Center label**: total tokens (formatted: 1.2k, 3.5M)
- **Colored slices**: proportional to token count
- **Legend beside the donut**: name, formatted token count, percentage

**Color palette** (rotating, matching existing chart colors):

| Index | Color     | Hex       |
|-------|-----------|-----------|
| 0     | Blue      | `#4fc1ff` |
| 1     | Purple    | `#c586c0` |
| 2     | Teal      | `#4ec9b0` |
| 3     | Yellow    | `#dcdcaa` |
| 4     | Orange    | `#ce9178` |
| 5     | Light blue| `#9cdcfe` |
| 6     | Gray      | `#d4d4d4` |
| 7     | Green     | `#608b4e` |

For the prompt-vs-completion chart, use fixed colors:
- Prompt: `#4fc1ff` (blue)
- Completion: `#c586c0` (purple)

### 3.2 Hover tooltips on agent bar chart

When the user hovers over a row in the Agent Usage bar chart, a tooltip appears near the cursor showing:

```
┌──────────────────────────────────┐
│ Planner                          │
│ 12 requests · 45.2k tokens      │
│ Avg prompt: 3,200                │
│ Avg completion: 570              │
└──────────────────────────────────┘
```

The tooltip follows the mouse and disappears on mouse leave. This reuses the same HTML tooltip pattern already implemented in `webview/graph.ts` for node hover.

---

## 4. Data Model

### New type: `TokenEntry`

```typescript
// src/models/metrics.ts
export interface TokenEntry {
  name: string;
  promptTokens: number;
  completionTokens: number;
}
```

Separate from `CountEntry` (which represents request counts) to avoid conflating two distinct concepts. Percentages are computed in the webview since they're a presentation concern.

### Extended `AggregatedMetrics`

```typescript
export interface AggregatedMetrics {
  // ... existing fields unchanged ...
  tokensByAgent: TokenEntry[];   // sorted by total tokens desc
  tokensByModel: TokenEntry[];   // sorted by total tokens desc
}
```

The existing `totalTokens: { prompt, completion }` field already provides the data for the prompt-vs-completion donut — no new field needed.

---

## 5. Metrics Collector Changes

### New helper function

```typescript
function tokenMap(
  map: Map<string, { prompt: number; completion: number }>
): TokenEntry[] {
  return Array.from(map.entries())
    .map(([name, t]) => ({
      name,
      promptTokens: t.prompt,
      completionTokens: t.completion,
    }))
    .sort((a, b) =>
      (b.promptTokens + b.completionTokens) -
      (a.promptTokens + a.completionTokens)
    );
}
```

Mirrors the existing `countMap()` pattern.

### Aggregation in the request loop

Two new `Map<string, { prompt, completion }>` accumulators — one keyed by agent name, one by model ID — populated alongside the existing counters.

---

## 6. Webview Rendering

### Technology choice

Use D3's `arc()` + `pie()` generators for the donut slices. D3 is already a project dependency (`"d3": "^7.9.0"`) and is used in `webview/graph.ts`. This avoids hand-rolling SVG arc math and handles edge cases (single slice, zero values, full circle).

### Donut renderer (reusable)

A private method `renderDonutChart(entries, size)` that:
1. Takes `{ name, value, color }[]` and an optional size (default 140px)
2. Uses `d3.pie()` to compute angles, `d3.arc()` to generate SVG path `d` attributes
3. Returns an SVG donut with a centered total label, plus an HTML legend

### Tooltip infrastructure

- `@state() private tooltip` reactive property
- `@mouseenter` / `@mouseleave` / `@mousemove` event handlers on bar rows
- Conditionally rendered `<div class="tooltip">` with `position: fixed`
- Styled using VS Code hover widget CSS variables for consistency

### Layout

Insert after stat cards, before activity chart:

```
Stat cards
  ↓
"Token Distribution" section (new)
  ↓
Activity chart
  ↓
Agent Usage (bar chart, now with tooltips)
  ↓
Model Usage, Tool Calls, Skill Usage (unchanged)
  ↓
Unused agents/skills
```

---

## 7. Files to Change

| File | Change |
|------|--------|
| `src/models/metrics.ts` | Add `TokenEntry` interface; extend `AggregatedMetrics` |
| `src/models/index.ts` | Re-export `TokenEntry` |
| `src/analyzers/metricsCollector.ts` | Add `tokenMap()` helper; accumulate tokens by agent/model |
| `src/analyzers/metricsCollector.test.ts` | Add tests for token aggregation |
| `webview/metrics.ts` | Donut renderer, tooltip, CSS, layout changes |
| `CHANGELOG.md` | Document under `[Unreleased]` |

---

## 8. Test Plan

### Unit tests (metricsCollector.test.ts)

| Test | Description |
|------|-------------|
| Tokens by agent | Sum prompt + completion per agent name across sessions |
| Tokens by model | Sum prompt + completion per model ID across sessions |
| Sort order | `tokensByAgent` and `tokensByModel` sorted by total tokens descending |
| Empty sessions | Returns empty arrays |

### Manual verification

1. Open Metrics Dashboard with real session data
2. Verify 3 donut charts appear with correct totals
3. Verify legend shows names, values, percentages
4. Hover agent bar rows — tooltip appears with avg prompt/completion
5. Tooltip follows mouse, disappears on leave
6. Test single-agent case (full circle donut)
7. Test with no sessions ("No data" empty state)
