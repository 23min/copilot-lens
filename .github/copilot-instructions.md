# Agent Lens — Project Instructions

This is a VS Code extension project called Agent Lens. It visualizes AI coding agents (GitHub Copilot, Claude Code), skills, and handoffs as an interactive graph, and analyzes chat session data for usage metrics.

## Tech stack
- TypeScript (extension host)
- Lit + D3.js (webview UI)
- Vitest (unit tests)
- VS Code Extension API

## Conventions
- Follow TDD: red-green-refactor
- Keep webview code separate from extension host code
- Parse agent/skill files from `.github/agents/` and `.github/skills/`
- Never push directly to `main` — always create a PR via `gh pr create` and merge via GitHub
