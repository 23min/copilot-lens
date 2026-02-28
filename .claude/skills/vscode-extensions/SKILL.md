---
name: vscode-extensions
description: Guide for developing the Agent Lens VS Code extension. Use when creating or modifying extension code, webviews, tree views, or commands.
---

# VS Code Extension Development — Agent Lens

## Extension entry point

`src/extension.ts` — registers commands, tree view, file watchers, session discovery.

## Architecture layers

1. **Parsers** (`src/parsers/`) — Pure functions that discover and parse agent/skill/session data
2. **Analyzers** (`src/analyzers/`) — Build graphs and compute metrics from parsed data
3. **Views** (`src/views/`) — Panel controllers and tree provider that render UI
4. **Webview** (`webview/`) — Lit custom elements with D3 visualizations

## Panel controller pattern

Each webview panel has a controller in `src/views/*Panel.ts`:

- Creates/reveals the webview panel
- Sets HTML content with CSP headers
- Handles `postMessage` / `onDidReceiveMessage` for data exchange
- Disposes resources on close

## Tree view

`src/views/treeProvider.ts` — `AgentLensTreeProvider` implements `TreeDataProvider`:

- Renders agents, skills, and action items in the sidebar
- Groups by provider (Copilot, Claude, Codex)
- Supports expand/collapse with detail children (tools, models, handoffs)
- Uses `vscode.TreeItem` with contextual icons and descriptions

## Webview components

Lit custom elements in `webview/`:

- `graph.ts` — D3 force/DAG graph with zoom, pan, tooltips, legend
- `metrics.ts` — Dashboard with token charts, agent/tool counts
- `session.ts` — Timeline of session requests
- All use `var(--vscode-*)` CSS tokens for theme integration

## Webview security

- Use `webview.asWebviewUri()` for local resources
- Set Content-Security-Policy in panel HTML
- Bundle all dependencies locally (no CDN)
- Sanitize any data sent from extension to webview

## Package.json contributes

- Commands: `agentLens.showGraph`, `agentLens.refresh`, `agentLens.openMetrics`, `agentLens.openSession`
- Views: `agentLens.treeView` in `agent-lens` view container
- Configuration: `agentLens.sessionDir`, `agentLens.claudeDir`, `agentLens.codexDir`

## Testing

- Unit test pure logic with Vitest (parsers, analyzers, layout)
- VS Code API is mocked at boundaries, not in pure function tests
- `@vscode/test-electron` available for integration tests
