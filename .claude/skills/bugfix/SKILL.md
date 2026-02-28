---
name: bugfix
description: Investigate and fix a bug using the project's TDD workflow. Use when given a bug report or GitHub issue to fix.
argument-hint: <issue number or description>
---

# Bugfix Workflow for Agent Lens

Follow this workflow to investigate and fix bugs in the Agent Lens VS Code extension.

## 1. Understand the bug

- If given an issue number, read it: `gh issue view $ARGUMENTS`
- Identify what component is affected (parser, analyzer, view, webview, model)
- Reproduce the problem by reading the relevant source code

## 2. Locate the source

Map the bug to the right layer:

| Symptom | Look in |
|---------|---------|
| Wrong data parsed from sessions | `src/parsers/` |
| Graph shows incorrect nodes/edges | `src/analyzers/graphBuilder.ts` |
| Metrics are wrong | `src/analyzers/metricsCollector.ts` |
| Tree view display issue | `src/views/treeProvider.ts` |
| Webview rendering issue | `webview/graph.ts`, `webview/metrics.ts`, `webview/session.ts` |
| Dark mode / theming issue | Webview CSS (check for `var(--vscode-*)` tokens) |
| Session discovery issue | `src/parsers/*Provider.ts`, `src/parsers/sessionRegistry.ts` |
| Agent/skill detection issue | `src/parsers/detectors.ts`, `src/parsers/agentParser.ts`, `src/parsers/skillParser.ts` |

## 3. Write a failing test (TDD red)

- Tests are co-located: `src/parsers/foo.ts` → `src/parsers/foo.test.ts`
- Run single test: `npx vitest run <test-file-path>`
- Write a test that demonstrates the bug before fixing

## 4. Fix the bug (TDD green)

- Make the minimal change to fix the bug
- Keep parsers as pure functions
- Follow existing patterns in the file

## 5. Verify (automated)

- `npm test` — all tests pass
- `npm run build` — no type errors

## 6. STOP — Wait for human testing

**Do NOT commit, push, or create a PR yet.**

Tell the user:
- What was changed and why
- How to test it manually (e.g., reload the extension, open a panel, check behavior)
- Wait for the user to confirm the fix works before proceeding

## 7. Commit (only after user approval)

Use conventional commit format:

```
fix(<scope>): <description>

Closes #<issue-number>
```

Scope should match the affected area: `parser`, `graph`, `webview`, `metrics`, `tree`, `session`.

## 8. Push and PR (only when user says to)

- `git push -u origin <branch>`
- `gh pr create` targeting `main`
- Do NOT merge — let the user review the PR first
