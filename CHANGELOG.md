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
- File discovery: find all agent/skill files in workspace via `vscode.workspace.findFiles`
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
