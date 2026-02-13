# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
- Custom agent detection: extracts agent name from `<modeInstructions>` in system prompt
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
- Logger singleton (`src/logger.ts`) with `[INFO]`/`[WARN]`/`[ERROR]` prefixes for the "Copilot Lens" output channel
- CI workflow with CodeQL static analysis, npm audit, and dependency review on PRs
- Auto-refresh: file system watchers on agent, skill, and session files trigger debounced refresh automatically (closes #3)
- Panels (Graph, Metrics, Session Explorer) now re-scan before displaying to ensure fresh data

### Fixed
- Webview panels rendering blank: HTML now uses Lit custom elements instead of empty div containers
- Graph fills full viewport height (was clipped mid-screen)
- VS Code build task failing with exit code 127: tasks.json uses shell type with fnm init
- Session discovery in devcontainers/WSL2: scans sibling workspace hash directories to find sessions when the storage hash differs from the original
- `copilotLens.sessionDir` setting: manually specify a session directory or mounted `workspaceStorage` root for devcontainer environments where sessions live on the host
- Click-to-open agent/skill files broken on Windows: was using relative path with `Uri.file()`, now preserves the original URI from discovery
- Malformed YAML frontmatter in agent/skill files no longer crashes the Refresh command; bad files are skipped with a console warning (fixes #1)
- Tree view sort order no longer shuffles on refresh; agents and skills are sorted alphabetically by name
