---
name: project-context
description: Background knowledge about the Agent Lens VS Code extension architecture. Preloaded by agents for project context.
user-invocable: false
---

# Agent Lens — Project Architecture

VS Code extension that visualizes AI agent workflows across GitHub Copilot, Claude Code, and OpenAI Codex.

## Tech stack

TypeScript, Lit 3, D3.js 7 + d3-dag, Vitest 3, esbuild, js-yaml

## Source structure

```
src/
  extension.ts              — Activation, command registration, watchers
  models/                   — Interfaces: Agent, Skill, Session, Graph, Metrics
  parsers/                  — Session discovery and parsing (pure functions)
    sessionProvider.ts      — SessionProvider interface (all providers implement this)
    copilotProvider.ts      — GitHub Copilot session discovery
    claudeProvider.ts       — Claude Code session discovery
    codexProvider.ts        — OpenAI Codex CLI session discovery
    agentParser.ts          — Agent frontmatter + handoff parsing
    skillParser.ts          — Skill frontmatter parsing
    frontmatterParser.ts    — YAML frontmatter extraction
    discovery.ts            — Glob-based agent/skill file discovery
    sessionRegistry.ts      — Coordinates providers, dedupes, watches changes
    detectors.ts            — Agent/skill detection helpers
  analyzers/
    graphBuilder.ts         — Agents + skills → DAG with handoff edges
    metricsCollector.ts     — Token usage, agent/model/tool/skill counts
  views/
    treeProvider.ts         — Sidebar tree (agents, skills, actions)
    graphPanel.ts           — Graph webview panel controller
    metricsPanel.ts         — Metrics webview panel controller
    sessionPanel.ts         — Session explorer panel controller
webview/
  graph.ts                  — D3 graph visualization (Lit custom element)
  layout.ts                 — D3-DAG Sugiyama layout algorithm
  metrics.ts                — Metrics dashboard webview
  session.ts                — Session explorer (timeline)
```

## Key patterns

- **Parsers are pure functions** — no side effects, easy to test
- **SessionProvider interface** — implement to add new agent sources
- **Webview ↔ extension** — message passing via postMessage/onDidReceiveMessage
- **Panel controllers** (`src/views/*Panel.ts`) manage webview lifecycle
- **Models** define all shared types in `src/models/`

## Build commands

- `npm run build` — Build extension + webview
- `npm test` — Run all tests (vitest)
- `npx vitest run <path>` — Run a single test file
- `npm run build:ext` — Build extension only
- `npm run build:webview` — Build webview only

## Graph model types

`NodeKind`: agent, skill, builtin-agent, claude-agent
`EdgeKind`: handoff, tool-call, skill-use

## Conventions

- Conventional Commits (`feat(scope):`, `fix(scope):`, etc.)
- TDD: red-green-refactor
- Tests co-located: `*.test.ts` next to source files
- Branch per issue, merge via PR
