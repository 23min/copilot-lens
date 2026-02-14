# Agent Lens — Design Specification

> VS Code extension that visualizes your GitHub Copilot agents, skills, and handoffs as an interactive graph. Parses chat sessions to surface usage metrics — which agents run, how often, and how sessions flow.

---

## 1. Overview

### What is this?

Agent Lens is a VS Code extension that provides visibility into your GitHub Copilot agent and skill setup. It does two things:

1. **Static analysis** — Parses your `.github/agents/` and `.github/skills/` directories to build a visual graph of agents, their handoff chains, tools, and skills.
2. **Runtime analysis** — Reads the raw Copilot chat session JSON files stored by VS Code to extract usage metrics: which agents actually ran, how often, what tools they called, session durations, and activity patterns.

### Why does this exist?

VS Code's built-in Chat Debug view is a single monolithic dump of the current session. There is no way to:
- See your agent/skill architecture at a glance
- Understand handoff chains visually
- Know which agents or skills are actually being used
- Get historical metrics across sessions
- Identify unused or underperforming agents/skills

Agent Lens fills this gap.

### Target users

Developers and teams who have set up custom Copilot agents (`.github/agents/*.agent.md`) and skills (`.github/skills/*/SKILL.md`) and want to understand, debug, and optimize their agent architecture.

---

## 2. Architecture

### Extension type

This is a standard VS Code extension (TypeScript) that contributes:
- A **Webview Panel** for the interactive graph and dashboard
- A **Tree View** in the sidebar (activity bar icon) for quick navigation
- **Commands** accessible via the command palette

### Key components

```
agent-lens/
├── src/
│   ├── extension.ts              # Activation, command registration
│   ├── parsers/
│   │   ├── agentParser.ts        # Parse .agent.md files (YAML frontmatter + body)
│   │   ├── skillParser.ts        # Parse SKILL.md files (YAML frontmatter + body)
│   │   └── sessionParser.ts      # Parse chatSessions/*.json files
│   ├── analyzers/
│   │   ├── graphBuilder.ts       # Build agent→handoff→skill graph model
│   │   └── metricsCollector.ts   # Aggregate session data into metrics
│   ├── views/
│   │   ├── graphPanel.ts         # Webview: interactive agent/skill graph
│   │   ├── metricsPanel.ts       # Webview: usage metrics dashboard
│   │   ├── sessionExplorer.ts    # Webview: single session timeline view
│   │   └── treeProvider.ts       # Sidebar tree view of agents/skills
│   ├── models/
│   │   ├── agent.ts              # Agent data model
│   │   ├── skill.ts              # Skill data model
│   │   ├── session.ts            # Session/request data model
│   │   └── metrics.ts            # Aggregated metrics model
│   └── utils/
│       ├── frontmatterParser.ts  # YAML frontmatter extraction
│       ├── sessionLocator.ts     # Find chatSessions dir for current workspace
│       └── fileWatcher.ts        # Watch for changes to agents/skills/sessions
├── webview/                      # Frontend assets for webview panels
│   ├── graph.html
│   ├── graph.js                  # D3.js or vis.js graph rendering
│   ├── metrics.html
│   ├── metrics.js                # Chart.js or similar for metrics
│   └── styles.css
├── package.json
├── tsconfig.json
├── README.md
└── SPEC.md                       # This file
```

---

## 3. Data Sources

### 3.1 Agent definitions (static, per repo)

**Location:** `.github/agents/*.agent.md` in the workspace root

**Format:** Markdown files with YAML frontmatter

```yaml
---
name: Planner
description: Generate an implementation plan for new features
tools: ['search', 'fetch', 'githubRepo', 'usages']
model: ['Claude Opus 4.5', 'GPT-5.2']
handoffs:
  - label: Start Implementation
    agent: implementation
    prompt: Implement the plan outlined above.
    send: false
  - label: Review Code
    agent: reviewer
    prompt: Review the implementation above.
    send: false
---

# Planning instructions

You are in planning mode. Your task is to generate an implementation plan...
```

**Fields to extract:**
- `name` — agent display name
- `description` — what this agent does and when to use it
- `tools` — array of tool identifiers the agent can use
- `model` — preferred model(s)
- `handoffs` — array of handoff definitions:
  - `label` — button text shown to user
  - `agent` — target agent filename (without `.agent.md`)
  - `prompt` — pre-filled prompt for the target agent
  - `send` — whether the prompt auto-submits (true/false)
- The markdown body (instructions) — useful for display/summary

### 3.2 Skill definitions (static, per repo)

**Location:** `.github/skills/*/SKILL.md` in the workspace root

**Format:** Markdown files with YAML frontmatter

```yaml
---
name: webapp-testing
description: Guide for testing web applications using Playwright. Use this when asked to create or run browser-based tests.
---

# Web Application Testing with Playwright

This skill helps you create and run browser-based tests...
```

**Fields to extract:**
- `name` — skill identifier
- `description` — what the skill does and when Copilot should load it (this is the trigger — Copilot reads this to decide whether to inject the skill)
- The markdown body — the actual instructions injected into context

**Also check for personal skills at:**
- `~/.copilot/skills/*/SKILL.md` (per-user, cross-repo)
- `~/.claude/skills/*/SKILL.md` (backwards compatibility)

### 3.3 Chat session data (runtime, per workspace)

**Location:** VS Code stores chat sessions per workspace in:

```
{UserDataRoot}/{Edition}/User/workspaceStorage/{WorkspaceHash}/chatSessions/{SessionId}.json
```

Platform paths for `{UserDataRoot}`:
- **Windows:** `%APPDATA%/Code` (or `Code - Insiders`)
- **macOS:** `~/Library/Application Support/Code` (or `Code - Insiders`)
- **Linux:** `~/.config/Code` (or `Code - Insiders`)

**Finding the right workspace:** Use `vscode.ExtensionContext.storageUri` or `globalStorageUri` to get the current workspace storage path, then navigate to `chatSessions/` in the parent workspace storage directory.

The session index is in `state.vscdb` (SQLite) at key `chat.ChatSessionStore.index`, but we can also just glob `chatSessions/*.json`.

**Session JSON schema:**

```typescript
interface CopilotChatSession {
  sessionId: string;          // UUID
  creationDate: number;       // Unix timestamp (ms)
  version: number;            // Schema version (currently 3)
  requests: CopilotRequest[];
}

interface CopilotRequest {
  requestId: string;          // "request_{UUID}"
  timestamp: number;          // Unix timestamp (ms)
  modelId?: string;           // e.g. "copilot/claude-sonnet-4", "copilot/gpt-4o"
  message: {
    text: string;             // User's prompt text
    attachments?: any[];      // File attachments, images, etc.
  };
  agent?: {
    id: string;               // e.g. "github.copilot.editsAgent", or custom agent id
    name?: string;            // Display name
  };
  response?: any;             // Response content — varies by agent, contains tool calls
}
```

**Key fields for metrics:**
- `agent.id` — which agent handled this request (maps to custom agents from `.github/agents/`)
- `modelId` — which LLM model was used
- `timestamp` — for timeline analysis, activity patterns
- `response` — contains tool invocations (structure varies)

**Caveats:**
- Session files can be **very large** (100MB+ for long sessions). Stream/parse incrementally.
- Skill loading is implicit — Copilot injects SKILL.md content into the system prompt. There's no discrete "skill X was loaded" field in the session JSON. Skill usage must be **inferred** from the system prompt content or response patterns.
- The `agent.id` for custom agents needs mapping back to your `.github/agents/` filenames.
- Sessions persist across VS Code restarts and are only deleted manually.

### 3.4 Custom instructions (supplementary context)

These aren't primary data sources but are useful for display:
- `.github/copilot-instructions.md` — project-wide instructions
- `AGENTS.md` — multi-agent workspace instructions
- `*.instructions.md` — file-pattern-scoped instructions

---

## 4. Features

### 4.1 Agent/Skill Graph (Panel 1)

An interactive node-and-edge graph showing:

**Nodes:**
- **Agent nodes** — one per `.agent.md` file. Show name, description, model, tool count.
- **Skill nodes** — one per `SKILL.md`. Show name, description.
- **Built-in agent nodes** (optional) — Ask, Edit, Agent, Plan (the default Copilot agents).

**Edges:**
- **Handoff edges** — agent A → agent B, labeled with the handoff `label`. Directed arrows. Distinguish `send: true` (auto-submit, solid line) vs `send: false` (manual, dashed line).
- **Tool edges** (optional) — agent → tool nodes, showing which tools each agent has access to.

**Interactions:**
- Click a node to see full details (description, instructions body, tools list, model).
- Hover for summary tooltip.
- Zoom, pan, drag nodes to rearrange.
- Search/filter by agent or skill name.
- Color coding: agents vs skills vs built-in agents. Optionally color by usage frequency (from metrics).

**Tech:** D3.js force-directed graph or vis.js Network in a VS Code Webview panel.

### 4.2 Usage Metrics Dashboard (Panel 2)

Aggregated from chat session JSON files:

**Metrics to surface:**
- **Agent usage frequency** — bar chart: how many requests each agent handled, broken down by custom vs built-in agents.
- **Model distribution** — pie/donut chart: which LLM models are being used (claude-sonnet, gpt-4o, etc.)
- **Session overview** — total sessions, total requests, average requests per session, average session duration.
- **Activity timeline** — line chart or heatmap: requests over time (daily/weekly).
- **Tool call frequency** — which tools are invoked most often.
- **Agent switching patterns** — how often users switch between agents within a session (Sankey diagram or flow).
- **Unused agents/skills** — highlight agents defined in `.github/agents/` that have zero usage in session data. Same for skills.

**Filters:**
- Date range picker
- Filter by agent
- Filter by model

**Tech:** Chart.js or Recharts-style charting in a Webview.

### 4.3 Session Explorer (Panel 3)

A timeline/detail view for a single chat session:

- **Session picker** — dropdown or list of all sessions, sorted by date, showing session duration and request count.
- **Timeline view** — vertical timeline of requests within the session:
  - Each request shows: timestamp, agent used, model, user prompt (truncated), tool calls made.
  - Agent switches are highlighted (e.g. "Switched from Planner → Agent").
  - Handoff activations are marked.
- **Request detail** — click a request to see full prompt text, full response, all tool invocations.

### 4.4 Sidebar Tree View

An activity bar icon ("Agent Lens" with a lens/magnifying glass icon) that opens a tree view:

```
COPILOT LENS
├── 📊 Dashboard          → opens metrics panel
├── 🔗 Agent Graph         → opens graph panel
├── Agents (3)
│   ├── 🤖 Planner
│   │   ├── Tools: search, fetch, githubRepo
│   │   ├── Handoffs → Implementation, Reviewer
│   │   └── Model: Claude Opus 4.5
│   ├── 🤖 Implementation
│   │   └── Tools: read, write, terminal
│   └── 🤖 Reviewer
│       └── Tools: search, read
├── Skills (2)
│   ├── 📘 webapp-testing
│   └── 📘 github-actions-debugging
├── Personal Skills (1)
│   └── 📘 my-formatting-skill
└── Sessions (12)
    ├── 📝 Feb 12 — 14 requests (Planner, Agent)
    ├── 📝 Feb 11 — 8 requests (Agent)
    └── 📝 Feb 10 — 23 requests (Planner → Implementation)
```

Clicking any item opens the relevant panel or detail view.

---

## 5. Commands

Register these in `package.json` under `contributes.commands`:

| Command ID | Title | Description |
|---|---|---|
| `agent-lens.openGraph` | Agent Lens: Open Agent Graph | Opens the interactive graph panel |
| `agent-lens.openMetrics` | Agent Lens: Open Metrics Dashboard | Opens the metrics panel |
| `agent-lens.openSession` | Agent Lens: Explore Session | Opens the session explorer |
| `agent-lens.refresh` | Agent Lens: Refresh | Re-scan agents, skills, and sessions |
| `agent-lens.exportMetrics` | Agent Lens: Export Metrics | Export metrics data as JSON |

---

## 6. Activation

The extension should activate when:
- The workspace contains a `.github/agents/` or `.github/skills/` directory
- The user runs any `agent-lens.*` command
- The user opens the Agent Lens sidebar

```json
"activationEvents": [
  "workspaceContains:.github/agents",
  "workspaceContains:.github/skills",
  "onView:agentLens.treeView",
  "onCommand:agent-lens.openGraph"
]
```

---

## 7. Configuration

Extension settings in `contributes.configuration`:

| Setting | Type | Default | Description |
|---|---|---|---|
| `agentLens.scanPersonalSkills` | boolean | `true` | Include `~/.copilot/skills/` in the graph |
| `agentLens.maxSessionsToAnalyze` | number | `50` | Max number of session files to parse for metrics |
| `agentLens.sessionMaxSizeMB` | number | `50` | Skip session files larger than this (they can be 100MB+) |
| `agentLens.showBuiltInAgents` | boolean | `false` | Show built-in Copilot agents (Ask, Edit, Agent, Plan) in the graph |

---

## 8. package.json Essentials

```json
{
  "name": "agent-lens",
  "displayName": "Agent Lens",
  "description": "Visualize your GitHub Copilot agents, skills, and handoffs as an interactive graph. Analyze chat session metrics and trace agent activity.",
  "version": "0.1.0",
  "publisher": "YOUR_PUBLISHER_ID",
  "engines": {
    "vscode": "^1.85.0"
  },
  "categories": ["Visualization", "Other"],
  "keywords": [
    "copilot",
    "github-copilot",
    "agents",
    "skills",
    "handoffs",
    "visualization",
    "metrics",
    "debug",
    "graph",
    "agent-mode"
  ],
  "activationEvents": [
    "workspaceContains:.github/agents",
    "workspaceContains:.github/skills"
  ],
  "main": "./out/extension.js",
  "contributes": {
    "commands": [],
    "viewsContainers": {
      "activitybar": [
        {
          "id": "agent-lens",
          "title": "Agent Lens",
          "icon": "resources/icon.svg"
        }
      ]
    },
    "views": {
      "agent-lens": [
        {
          "id": "agentLens.treeView",
          "name": "Agent Lens"
        }
      ]
    },
    "configuration": {}
  }
}
```

---

## 9. Technical Considerations

### Session file discovery

Use `vscode.ExtensionContext` to locate workspace storage:

```typescript
// From extension context, storageUri gives us workspace-specific storage
// Navigate up to find chatSessions:
const workspaceStorageDir = context.storageUri?.fsPath;
// Parent dir contains chatSessions/
const chatSessionsDir = path.join(path.dirname(workspaceStorageDir), 'chatSessions');
```

Alternatively, scan all `workspaceStorage/*/chatSessions/` directories and match by checking `workspace.json` in each for the current workspace path.

### Large file handling

Session JSON files can be 100MB+. Options:
- Use streaming JSON parsing (e.g. `jsonstream` or custom line-by-line)
- Set a configurable size limit and skip files above it
- Parse only the metadata we need (timestamps, agent ids, model ids) without loading full response bodies
- Cache parsed metrics and only re-parse when files change (use file watcher + mtime)

### YAML frontmatter parsing

Agent and skill files use YAML frontmatter delimited by `---`. Use a library like `gray-matter` or write a simple parser:

```typescript
function parseFrontmatter(content: string): { data: any; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { data: {}, body: content };
  return {
    data: yaml.parse(match[1]),
    body: match[2].trim()
  };
}
```

### File watching

Watch for changes to agent/skill files and session files:
- `vscode.workspace.createFileSystemWatcher('**/.github/agents/*.agent.md')`
- `vscode.workspace.createFileSystemWatcher('**/.github/skills/*/SKILL.md')`
- For sessions, watch the `chatSessions/` directory for new/modified `.json` files

### Webview security

Follow VS Code webview best practices:
- Use `webview.asWebviewUri()` for all local resource references
- Set a restrictive `Content-Security-Policy`
- Use message passing (`postMessage`/`onDidReceiveMessage`) for communication between extension and webview
- Bundle D3/Chart.js locally rather than loading from CDN

---

## 10. Development Setup

```bash
git clone https://github.com/YOUR_USERNAME/agent-lens.git
cd agent-lens
npm install
```

**Dev dependencies needed:**
- `typescript`
- `@types/vscode`
- `@vscode/vsce` (for packaging/publishing)
- `gray-matter` or `js-yaml` (YAML frontmatter parsing)
- `d3` + `@types/d3` (graph visualization)
- `chart.js` (metrics charts)

**Run/debug:**
- Press F5 in VS Code to launch Extension Development Host
- The extension activates in the new window when it detects `.github/agents/` or `.github/skills/`

**Package:**
```bash
npx @vscode/vsce package
```

---

## 11. Implementation Priority

### Phase 1 — MVP
1. Agent/skill parser (read `.agent.md` and `SKILL.md` files)
2. Graph builder (construct the node/edge model from parsed data)
3. Sidebar tree view (list agents, skills, handoffs)
4. Interactive graph webview panel (D3 force-directed graph)

### Phase 2 — Session Analysis
5. Session file locator (find `chatSessions/` for current workspace)
6. Session parser (extract agent usage, model, timestamps, tool calls)
7. Metrics collector (aggregate across sessions)
8. Metrics dashboard webview panel

### Phase 3 — Session Explorer
9. Session timeline view
10. Request detail view
11. Agent switching visualization

### Phase 4 — Polish
12. File watchers for live updates
13. Metrics caching
14. Export functionality
15. Settings/configuration
16. Marketplace icon and README

---

## 12. Open Questions

- **Skill usage inference:** The session JSON doesn't have a clean "skill X was loaded" field. Skills are injected into the system prompt. Can we detect skill usage by matching skill names/descriptions in the response metadata? Or do we need to parse the system prompt from the Chat Debug view somehow? For MVP, we may just show skills as "defined but usage unknown" and only track agent-level usage.

- **Agent ID mapping:** Custom agent IDs in session JSON — how exactly do they appear? Do they match the filename (e.g. `planner` for `planner.agent.md`)? Need to verify with real session data. Built-in agents use IDs like `github.copilot.editsAgent`.

- **SpecStory compatibility:** Should we also support reading `.specstory/history/` markdown files as an alternative/supplementary data source? SpecStory auto-saves all Copilot chats as structured markdown and has growing adoption.

---

## 13. Naming & Publishing

- **Extension ID:** `agent-lens`
- **Display name:** `Agent Lens`
- **GitHub repo:** `agent-lens` (or `vscode-agent-lens`)
- **Description:** "Visualize your GitHub Copilot agents, skills, and handoffs as an interactive graph. Parses chat sessions to surface usage metrics — which agents run, how often, and how sessions flow."
- **Categories:** Visualization, Other
- **Keywords:** copilot, github-copilot, agents, skills, handoffs, visualization, metrics, debug, graph, agent-mode