# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.12] - 2026-02-15

### Added
- OpenAI Codex CLI session support: parses rollout JSONL files from `~/.codex/sessions/` into `Session`/`SessionRequest` model (closes #13)
- `CodexSessionProvider` with file discovery, JSONL parsing, and file watching
- Codex session locator: scans `agentLens.codexDir` setting, `CODEX_HOME` env, or default `~/.codex/sessions/`
- "Codex" filter toggle in Session Explorer and Metrics Dashboard
- Green provider badge for Codex sessions in Session Explorer
- `agentLens.codexDir` configuration setting for devcontainer/remote environments
- Codex section in Container Setup Guide with mount instructions
- Updated research doc with verified Codex JSONL envelope format
- Claude Code skill discovery: scans `.claude/skills/*/SKILL.md` following the Agent Skills standard
- Provider disambiguation across all views (closes #17)
  - Sidebar: consistent `(Copilot)` / `(Claude)` prefix on both agents and skills
  - Agent Graph: filter toggle (All / Copilot / Claude) with provider badges on nodes
  - Metrics Dashboard: unused agents/skills tags show provider origin
- `provider` field on `Skill` model, propagated through parser, discovery, graph builder, and metrics
- 28 new tests (167 total)

## [0.0.11] - 2026-02-15

### Added
- Claude Code agent discovery: scans `.claude/agents/*.md` (project-level) and `~/.claude/agents/*.md` (global) for sub-agent definitions (closes #10)
- `AgentProvider` type (`"copilot" | "claude"`) and `provider` field on `Agent` model
- Purple graph nodes (`#b392f0`) for Claude agents in Agent Graph
- "(Claude)" badge in sidebar tree view for Claude agents
- Activation event and file watcher for `.claude/agents/*.md`
- Issue-linking convention in CLAUDE.md
- 6 new tests (139 total)

### Fixed
- `claudeDir` config now scans both the configured directory and the default `~/.claude/projects/` path, merging and deduplicating results — previously the configured dir replaced the default lookup (fixes #14)

## [0.0.10] - 2026-02-15

### Changed
- Added metrics dashboard screenshot to README
- Added .DS_Store to .gitignore

## [0.0.9] - 2026-02-14

### Changed
- Rewrote README for VS Code marketplace: clear value proposition, feature descriptions, getting started guide, removed dev docs

## [0.0.8] - 2026-02-14

### Changed
- Renamed extension from "Copilot Lens" to "Agent Lens" — new publisher `Proliminal`, updated all command IDs (`agentLens.*`), config keys, view container, and repo URLs
- CI release workflow now publishes to VS Code Marketplace automatically on git tag push

### Added
- Claude Code session parser: parses JSONL session files into `Session`/`SessionRequest` model (closes #5)
- `ClaudeSessionProvider` now calls the parser and returns parsed sessions
- Source filtering in Metrics Dashboard and Session Explorer: segmented toggle (All | Copilot | Claude) filters sessions by provider (closes #7)
- `SessionProviderType` union type (`"copilot" | "claude"`) and `provider` field on `Session` model
- Provider badges in Session Explorer (blue for Copilot, purple for Claude)
- Reverse messaging: webview filter changes flow to extension host for re-aggregation
- Cache token metrics: `cacheReadTokens` and `cacheCreationTokens` fields on `SessionRequest.usage`, aggregated in `AggregatedMetrics.cacheTokens` (closes #8)
- Cache stat cards in Metrics Dashboard: Cache Read Tokens, Cache Creation Tokens, Cache Hit Ratio (shown only when cache data exists)
- Input Token Breakdown donut chart: visualizes cache read vs cache creation vs non-cached input tokens
- Session Explorer detail view shows cache token counts per request
- Empty state for Agent Graph: shows guidance and doc links when no agents or skills are found
- 18 unit tests for Claude session parsing, 133 total

### Fixed
- Claude session discovery in devcontainers/SSH: multi-strategy cascade (encoded path variants, direct scan, folder name suffix match) handles path mismatches between container and host
- Underscore-to-dash path variant matching for container workspaces (e.g. `ex_a2ui` → `ex-a2ui`)

## [0.0.7] - 2026-02-13

### Added
- Token distribution donut charts: tokens by agent, tokens by model, prompt vs completion ratio (closes #2)
- Hover tooltips on Agent Usage bar chart: shows total tokens, avg prompt size, avg completion size per agent
- `TokenEntry` data model and `tokensByAgent` / `tokensByModel` fields in aggregated metrics
- Design spec for donut charts feature (`docs/design/donut-charts.md`)

### Removed
- Activity timeline chart from the Metrics Dashboard (low value)

## [0.0.6] - 2026-02-13

### Added
- Project scaffolding: CLAUDE.md, .gitignore, .github/ structure
- Design spec (docs/design/spec.md)
- Data sources research with real session schema analysis (docs/research/data-sources.md)
- Example agents: Planner, Implementer, Reviewer (`.github/agents/`)
- Example skills: testing, vscode-extensions (`.github/skills/`)
- Copilot instructions (`.github/copilot-instructions.md`)
- Roadmap with 9 milestones (ROADMAP.md)
- Extension skeleton: package.json, esbuild bundler, vitest, TypeScript config, VS Code launch/tasks
- Minimal extension entry point with `activate()` / `deactivate()`
- Data models: `Agent`, `Skill`, `Handoff`, `GraphNode`, `GraphEdge`, `Graph` interfaces
- Frontmatter parser: extracts YAML frontmatter + markdown body from `.agent.md` and `SKILL.md` files
- Agent parser: `.agent.md` content → `Agent` model (name, tools, model, handoffs, body)
- Skill parser: `SKILL.md` content → `Skill` model (name, description, body)
- File discovery: find all agent/skill files in workspace via `vscode.workspace.findFiles`; supports both `skills/*/SKILL.md` and `skills/*.skill.md` conventions
- Graph builder: constructs node/edge graph from agents and skills, resolves handoff targets, warns on broken references
- Optional built-in Copilot agents (Ask, Edit, Agent) as graph nodes
- 28 unit tests across parsers and graph builder
- Sidebar tree view: agents and skills with collapsible hierarchy (tools, models, handoffs as children)
- Activity bar icon (telescope) and refresh command
- Click-to-open agent/skill files from tree view
- Interactive D3 force-directed graph webview (Lit + D3.js)
- Color-coded nodes: agents (blue), skills (teal), built-in (light blue)
- Directed edges with arrowheads, dashed lines for manual handoffs
- Zoom, pan, node dragging, hover tooltips, edge labels
- Separate browser bundle for webview (esbuild ESM)
- Session data models: `Session`, `SessionRequest`, `ToolCallInfo`, `SkillRef`
- JSONL session parser: reconstructs sessions from kind=0/1/2 incremental patches
- Chat replay parser: imports `.chatreplay.json` manual exports
- Custom agent detection: extracts agent name from `inputState.mode` file URI in JSONL sessions, with `<modeInstructions>` fallback
- Skill detection: parses `<skills>` XML for available skills, `read_file` tool calls for loaded skills
- Session locator: finds `chatSessions/` directory from extension storage URI
- 50 unit tests total
- Metrics data model: `AggregatedMetrics`, `CountEntry`, `ActivityEntry`
- Metrics collector: aggregates agent/model/tool/skill usage, token totals, activity timeline, unused detection
- Metrics dashboard webview (Lit): stat cards, bar charts, activity timeline, unused agents/skills warnings
- `Copilot Lens: Show Metrics Dashboard` command
- Auto-discovers session files on activation
- 66 unit tests total
- Session Explorer webview: session picker sorted by date, vertical timeline of requests
- Agent switch and model switch highlighting with colored badges
- Click request to expand detail view (full prompt, tool calls, skills, timing, tokens)
- `Copilot Lens: Session Explorer` command
- Actions section in sidebar tree view with quick-launch buttons for Graph, Metrics, and Session Explorer
- DAG layout for agent graph: layered left-to-right topological ordering with auto-fit to viewport
- Bezier curve edges between graph nodes
- Structured startup and refresh logging via Output Channel: timing, discovery counts, session strategy tracing, and error diagnostics (closes #4)
- Logger singleton (`src/logger.ts`) with `[INFO]`/`[WARN]`/`[ERROR]` prefixes for the "Agent Lens" output channel
- CI workflow with CodeQL static analysis, npm audit, and dependency review on PRs
- Auto-refresh: file system watchers on agent, skill, and session files trigger debounced refresh automatically (closes #3)
- Panels (Graph, Metrics, Session Explorer) now re-scan before displaying to ensure fresh data

### Fixed
- Webview panels rendering blank: HTML now uses Lit custom elements instead of empty div containers
- Graph fills full viewport height (was clipped mid-screen)
- VS Code build task failing with exit code 127: tasks.json uses shell type with fnm init
- Session discovery in devcontainers/WSL2: scans sibling workspace hash directories to find sessions when the storage hash differs from the original
- `agentLens.sessionDir` setting: manually specify a session directory or mounted `workspaceStorage` root for devcontainer environments where sessions live on the host
- Click-to-open agent/skill files broken on Windows: was using relative path with `Uri.file()`, now preserves the original URI from discovery
- Malformed YAML frontmatter in agent/skill files no longer crashes the Refresh command; bad files are skipped with a console warning (fixes #1)
- Tree view sort order no longer shuffles on refresh; agents and skills are sorted alphabetically by name
- Custom agent names now correctly detected from JSONL sessions: tracks `inputState.mode` changes and correlates them with requests instead of relying solely on system prompt regex
