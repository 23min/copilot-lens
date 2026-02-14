# Agent Lens

[![CI](https://github.com/23min/agent-lens/actions/workflows/ci.yml/badge.svg)](https://github.com/23min/agent-lens/actions/workflows/ci.yml)
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/Proliminal.agent-lens)](https://marketplace.visualstudio.com/items?itemName=Proliminal.agent-lens)

**Understand what your AI coding agents are actually doing.**

Agent Lens gives you visibility into your GitHub Copilot and Claude Code sessions — which agents ran, what models they used, how many tokens they consumed, and how your agent workflows connect.

## Why Agent Lens?

AI coding agents are powerful but opaque. When you use custom agents in GitHub Copilot or sub-agents in Claude Code, it's hard to know:

- Which agents are doing the most work?
- How are tokens distributed across models?
- Are your custom agents and skills actually being used?
- How do your agents hand off work to each other?

Agent Lens answers these questions by parsing your local session data and presenting it visually — right inside VS Code.

## Features

### Metrics Dashboard

See token usage, model distribution, agent activity, tool calls, and skill usage at a glance. Filter by provider (Copilot, Claude, or both). Spot unused agents and skills that might need attention.

### Agent & Skill Explorer

Browse your agents and skills in the sidebar. See their tools, models, and handoff chains. Click to open the source file.

### Agent Graph

Interactive DAG visualization of your agents, skills, and handoff connections. Zoom, pan, and hover for details.

### Session Explorer

Replay individual sessions as a timeline. See each request's agent, model, tokens, tool calls, and timing. Spot agent switches and model changes.

### Cache Token Metrics

For Claude Code sessions: see cache read tokens, cache creation tokens, cache hit ratio, and an input token breakdown showing cached vs non-cached input.

## Supported AI Tools

| Tool | What Agent Lens reads |
|------|----------------------|
| **GitHub Copilot** | Chat session JSONL files from VS Code workspace storage. Detects custom agents (from `.github/agents/`) and skills (from `.github/skills/`). |
| **Claude Code** | Session JSONL files from `~/.claude/projects/`. Detects custom agents and skills, parses sub-agent sessions and prompt caching metrics. |

Session data stays local — Agent Lens only reads files already on your machine.

## Getting Started

1. Install Agent Lens from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=Proliminal.agent-lens)
2. Open a project where you've used GitHub Copilot or Claude Code
3. Look for the **Agent Lens** icon in the activity bar
4. Click **Show Metrics Dashboard** or **Session Explorer** to explore your sessions

Agent Lens automatically discovers sessions for your current workspace. No configuration needed in most cases.

### Devcontainers & Remote SSH

If your sessions live on a mounted host path, configure the directory manually:

| Setting | Description |
|---------|-------------|
| `agentLens.sessionDir` | Path to Copilot chat session files (or a `workspaceStorage` root) |
| `agentLens.claudeDir` | Path to Claude Code project files (e.g., a mounted `~/.claude/projects`) |

Use the **Agent Lens: Container Setup Guide** command for step-by-step instructions.

## Contributing

Found a bug or have an idea? Open an [issue](https://github.com/23min/agent-lens/issues) or submit a pull request.

## License

[MIT](LICENSE)
