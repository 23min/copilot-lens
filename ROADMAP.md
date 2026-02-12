# Copilot Lens — Roadmap

> Broken into milestones that each deliver something usable. Each milestone is a set of tasks that can be developed on a feature branch and merged independently.

---

## Milestone 0: Project Setup

> Get the extension skeleton running. No features yet — just the build pipeline, test runner, and an empty extension that activates.

| # | Task | Details |
|---|---|---|
| 0.1 | Initialize npm project | `package.json` with VS Code extension metadata, engine constraints |
| 0.2 | TypeScript config | `tsconfig.json` targeting ES2022, strict mode |
| 0.3 | esbuild bundler | Build script for extension host code, watch mode for dev |
| 0.4 | Vitest setup | Config, first dummy test to verify the runner works |
| 0.5 | VS Code launch config | `.vscode/launch.json` for F5 debugging (Extension Development Host) |
| 0.6 | Extension entry point | Minimal `src/extension.ts` with `activate()` / `deactivate()`, activation events |
| 0.7 | Verify end-to-end | F5 → extension activates → "Copilot Lens" appears in output → passes dummy test |

**Branch:** `feature/extension-setup`
**Definition of done:** `npm run build` succeeds, `npm test` passes, F5 launches the extension.

---

## Milestone 1: Static Parsers

> Parse `.agent.md` and `SKILL.md` files into structured data models. Pure functions, fully TDD.

| # | Task | Details |
|---|---|---|
| 1.1 | Define data models | `Agent`, `Skill`, `Handoff` TypeScript interfaces in `src/models/` |
| 1.2 | Frontmatter parser | Extract YAML frontmatter + markdown body from a string. Use `js-yaml` or `gray-matter`. Pure function. |
| 1.3 | Agent parser | Parse `.agent.md` → `Agent` model. Extract name, description, tools, model, handoffs, body. Test with fixture files. |
| 1.4 | Skill parser | Parse `SKILL.md` → `Skill` model. Extract name, description, body. Handle personal skills paths. Test with fixtures. |
| 1.5 | File discovery | Find all `.agent.md` and `SKILL.md` files in workspace. Glob `**/.github/agents/*.agent.md` and `**/.github/skills/*/SKILL.md`. |
| 1.6 | Validation & edge cases | Missing frontmatter, malformed YAML, missing `name` field, empty files, duplicate agent names. Emit warnings, don't crash. |

**Branch:** `feature/static-parsers`
**Definition of done:** All parsers pass comprehensive unit tests. Real `.github/` fixtures parse correctly.

---

## Milestone 2: Graph Model

> Build the node-and-edge graph data structure from parsed agents and skills. No UI yet.

| # | Task | Details |
|---|---|---|
| 2.1 | Graph data model | `GraphNode`, `GraphEdge` interfaces. Nodes: agents, skills. Edges: handoffs (with label, send/manual). |
| 2.2 | Graph builder | Takes `Agent[]` and `Skill[]`, produces `Graph` (nodes + edges). Resolve handoff targets (agent name → agent node). Flag broken references. |
| 2.3 | Built-in agents (optional) | Optionally include built-in Copilot agents (Ask, Edit, Agent, Plan) as nodes. Controlled by config. |

**Branch:** `feature/graph-model`
**Definition of done:** Graph builder produces correct node/edge structures from test fixtures. Broken handoff references flagged.

---

## Milestone 3: Tree View

> First visible UI — sidebar tree showing agents, skills, and handoffs.

| # | Task | Details |
|---|---|---|
| 3.1 | Tree data provider | Implement `vscode.TreeDataProvider` for the sidebar. Show agents with their tools/handoffs/model as children. Show skills. |
| 3.2 | Activity bar icon | Register view container in `package.json`, add icon to activity bar. |
| 3.3 | Refresh command | `copilot-lens.refresh` re-scans files and updates the tree. |
| 3.4 | Click to open file | Clicking an agent/skill opens its `.agent.md` or `SKILL.md` file in the editor. |

**Branch:** `feature/tree-view`
**Definition of done:** Sidebar shows agents/skills tree with correct hierarchy. Clicking items opens files.

---

## Milestone 4: Interactive Graph Webview

> The visual centerpiece — a D3 force-directed graph of agents, handoffs, and skills in a webview panel.

| # | Task | Details |
|---|---|---|
| 4.1 | Webview panel scaffold | Create webview panel with proper CSP, `asWebviewUri` for local resources, message passing setup. |
| 4.2 | Lit component scaffold | Set up Lit in the webview. Basic component renders. Bundle with esbuild. |
| 4.3 | D3 force-directed graph | Render agent/skill nodes and handoff edges. Force simulation for layout. |
| 4.4 | Node styling | Color code: agents vs skills vs built-in. Show name, icon. Handoff edges: solid (send:true) vs dashed (send:false), labeled. |
| 4.5 | Interactions | Click node → detail panel. Hover → tooltip. Zoom, pan, drag. |
| 4.6 | Search/filter | Filter nodes by name. Highlight matching nodes. |
| 4.7 | Open graph command | `copilot-lens.openGraph` command and tree view link. |

**Branch:** `feature/graph-webview`
**Definition of done:** Graph renders correctly with all agents/skills/handoffs. Interactions work. Visually polished.

---

## Milestone 5: Session Parser

> Read the raw session JSONL files from VS Code workspace storage. Extract structured request data.

| # | Task | Details |
|---|---|---|
| 5.1 | Session locator | Find `chatSessions/` dir from `context.storageUri`. Handle missing dir gracefully. |
| 5.2 | SQLite index reader | Read `state.vscdb` → `chat.ChatSessionStore.index` for fast session listing (title, timestamps, counts). |
| 5.3 | JSONL parser | Reconstruct session state from kind=0/1/2 patches. Stream line-by-line for large files. |
| 5.4 | Legacy JSON parser | Parse monolithic `.json` session files (detect by extension, fallback). |
| 5.5 | Request model | Extract from each request: `requestId`, `timestamp`, `agent.id`, `modelId`, `message.text`, `result.timings`, `result.usage`, `toolCallRounds`. |
| 5.6 | Custom agent detection | Parse `<modeInstructions>` from `renderedUserMessage` to extract custom agent mode name. |
| 5.7 | Skill detection | Parse `<skills>` XML from rendered system prompt. Detect actually-loaded skills via `read_file` tool calls to `SKILL.md` paths. |
| 5.8 | Chatreplay import | Support importing `.chatreplay.json` via command. Parse the prompt/log structure. |
| 5.9 | Size limits | Respect `copilotLens.sessionMaxSizeMB` setting. Skip files over the limit. |

**Branch:** `feature/session-parser`
**Definition of done:** Session files from `data/` parse correctly. Custom agent and skill detection work against real data. Unit tests pass with fixture data.

---

## Milestone 6: Metrics Dashboard

> Aggregate session data into charts and stats. Second webview panel.

| # | Task | Details |
|---|---|---|
| 6.1 | Metrics collector | Aggregate across parsed sessions: agent frequency, model distribution, tool call frequency, session counts, activity timeline. |
| 6.2 | Metrics data model | `AggregatedMetrics` interface: per-agent counts, per-model counts, per-tool counts, time series data, unused agents/skills list. |
| 6.3 | Dashboard webview | Webview panel with charts. Lit components. |
| 6.4 | Charts | Agent usage bar chart, model distribution donut, activity timeline (line/heatmap), tool call frequency. Use D3 or Chart.js. |
| 6.5 | Unused detection | Cross-reference defined agents/skills with session data. Highlight unused ones. |
| 6.6 | Filters | Date range, filter by agent, filter by model. |
| 6.7 | Open dashboard command | `copilot-lens.openMetrics` command. |

**Branch:** `feature/metrics-dashboard`
**Definition of done:** Dashboard shows meaningful charts from real session data. Filters work.

---

## Milestone 7: Session Explorer

> Timeline view for individual sessions. Third webview panel.

| # | Task | Details |
|---|---|---|
| 7.1 | Session picker | List all sessions (from SQLite index or parsed files), sorted by date. Show title, request count, duration. |
| 7.2 | Timeline view | Vertical timeline of requests within a session. Show timestamp, agent, model, prompt (truncated), tool calls. |
| 7.3 | Agent switch highlighting | Visually mark when the agent or model changes between requests. |
| 7.4 | Request detail | Click a request → full prompt text, response, tool invocations. |
| 7.5 | Open explorer command | `copilot-lens.openSession` command. |

**Branch:** `feature/session-explorer`
**Definition of done:** Can browse sessions, see timeline, click into request details.

---

## Milestone 8: Polish & Ship

> File watchers, caching, settings, packaging.

| # | Task | Details |
|---|---|---|
| 8.1 | File watchers | Watch `.github/agents/`, `.github/skills/`, and `chatSessions/` for changes. Auto-refresh tree and panels. |
| 8.2 | Metrics caching | Cache parsed session data. Only re-parse when files change (check mtime). |
| 8.3 | Export metrics | `copilot-lens.exportMetrics` → save aggregated metrics as JSON. |
| 8.4 | Settings | Implement all settings from spec (scanPersonalSkills, maxSessionsToAnalyze, sessionMaxSizeMB, showBuiltInAgents). |
| 8.5 | Error handling | Graceful degradation when no agents/skills/sessions found. Informative empty states. |
| 8.6 | Marketplace prep | Extension icon, README with screenshots, CHANGELOG, categories/keywords. |
| 8.7 | Package & publish | `vsce package`, test the `.vsix` install, publish to marketplace. |

**Branch:** `chore/polish-and-ship`
**Definition of done:** Extension installable from marketplace. All features work. No rough edges.

---

## Dependency Graph

```
M0 (Setup)
 └─→ M1 (Parsers)
      └─→ M2 (Graph Model)
      │    └─→ M3 (Tree View)
      │    └─→ M4 (Graph Webview)
      └─→ M5 (Session Parser)
           └─→ M6 (Metrics Dashboard)
           └─→ M7 (Session Explorer)

M8 (Polish) depends on all above
```

Milestones 3+4 (UI) and 5 (session parser) can run in parallel after M2 is done.
Milestones 6+7 can run in parallel after M5 is done.

---

## What to build first

**M0 → M1 → M2** is the critical path. Everything else depends on having parsers and a graph model. This is also where TDD pays off most — pure functions, easy to test, high confidence before we touch any UI.
