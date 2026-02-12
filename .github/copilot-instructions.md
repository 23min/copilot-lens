# Copilot Lens — Project Instructions

This is a VS Code extension project called Copilot Lens. It visualizes GitHub Copilot agents, skills, and handoffs as an interactive graph, and analyzes chat session data for usage metrics.

## Tech stack
- TypeScript (extension host)
- Lit + D3.js (webview UI)
- Vitest (unit tests)
- VS Code Extension API

## Conventions
- Follow TDD: red-green-refactor
- Keep webview code separate from extension host code
- Parse agent/skill files from `.github/agents/` and `.github/skills/`
