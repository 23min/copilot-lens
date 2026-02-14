# Agent Lens

[![CI](https://github.com/23min/agent-lens/actions/workflows/ci.yml/badge.svg)](https://github.com/23min/agent-lens/actions/workflows/ci.yml)
[![Release](https://github.com/23min/agent-lens/actions/workflows/release.yml/badge.svg)](https://github.com/23min/agent-lens/actions/workflows/release.yml)

VS Code extension that visualizes your AI coding agents (GitHub Copilot, Claude Code) as an interactive graph. Parses chat sessions to surface usage metrics — which agents run, how often, and how sessions flow.

## Status

Work in progress. See [ROADMAP.md](ROADMAP.md) for planned milestones.

## What it does

1. **Static analysis** — Parses your `.github/agents/` and `.github/skills/` directories to build a visual graph of agents, their handoff chains, and skills.
2. **Runtime analysis** — Reads Copilot chat session JSONL files from VS Code workspace storage and Claude Code session JSONL files from `~/.claude/projects/` to extract usage metrics: which agents ran, how often, what tools they called, and session durations. Detects custom agents and skills from system prompts. Automatically finds sessions across workspace storage hash directories, so it works in devcontainers, WSL2, and after workspace reconnections.
3. **Token distribution** — Donut charts show where tokens are going: by agent, by model, and prompt vs completion ratio. Hover tooltips on agent usage bars reveal average prompt/completion sizes to spot context bloat.
4. **Source filtering** — Toggle between All, Copilot, and Claude sessions in both the Metrics Dashboard and Session Explorer. Provider badges distinguish session origins at a glance.
5. **Cache token metrics** — Surfaces Claude's prompt caching metrics: cache read tokens, cache creation tokens, cache hit ratio, and an input token breakdown donut chart showing cached vs non-cached input.

## Development

```bash
fnm use          # or nvm use — picks up .node-version
npm install
npm run build    # esbuild bundle
npm test         # vitest
npm run watch    # esbuild watch mode
```

Press **F5** in VS Code to launch the Extension Development Host.

## Project structure

```
src/
  extension.ts          # Activation, command registration
  models/               # TypeScript interfaces (Agent, Skill, Graph)
  parsers/              # Pure-function parsers for agents, skills, and sessions
  analyzers/            # Graph builder, metrics collector
  views/
    treeProvider.ts     # Sidebar tree view (agents & skills)
    graphPanel.ts       # Webview panel host for the graph
    metricsPanel.ts     # Webview panel host for the dashboard
    sessionPanel.ts     # Webview panel host for session explorer
webview/
  graph.ts              # Lit + D3.js DAG graph component
  metrics.ts            # Lit metrics dashboard component
  session.ts            # Lit session explorer component
```

## License

[MIT](LICENSE)
