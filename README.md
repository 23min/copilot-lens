# Copilot Lens

VS Code extension that visualizes your GitHub Copilot agents, skills, and handoffs as an interactive graph. Parses chat sessions to surface usage metrics — which agents run, how often, and how sessions flow.

## Status

Work in progress. See [ROADMAP.md](ROADMAP.md) for planned milestones.

## What it does

1. **Static analysis** — Parses your `.github/agents/` and `.github/skills/` directories to build a visual graph of agents, their handoff chains, and skills.
2. **Runtime analysis** *(planned)* — Reads Copilot chat session files to extract usage metrics: which agents ran, how often, what tools they called, and session durations.

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
  parsers/              # Pure-function parsers for .agent.md and SKILL.md
  analyzers/            # Graph builder, metrics collector (planned)
  views/
    treeProvider.ts     # Sidebar tree view (agents & skills)
    graphPanel.ts       # Webview panel host for the graph
webview/
  graph.ts              # Lit + D3.js force-directed graph component
```

## License

[MIT](LICENSE)
