---
name: testing
description: Guide for writing tests in Agent Lens. Use when creating unit tests, integration tests, or setting up test infrastructure.
---

# Testing Patterns — Agent Lens

## TDD workflow

1. Write a failing test (red)
2. Write minimal code to pass (green)
3. Refactor while keeping tests green

## Vitest setup

- Config: `vitest.config.ts` (globals enabled, includes `src/**/*.test.ts` and `webview/**/*.test.ts`)
- Run all: `npm test`
- Run one file: `npx vitest run src/parsers/agentParser.test.ts`
- Watch mode: `npm run test:watch`

## File conventions

- Tests are co-located: `src/parsers/foo.ts` → `src/parsers/foo.test.ts`
- Use `describe` / `it` blocks
- Use `expect` assertions
- Vitest globals are enabled (no imports needed for `describe`, `it`, `expect`)

## What to test

| Layer | What to test | Example file |
|-------|-------------|-------------|
| Parsers | Pure function input/output, edge cases, malformed input | `agentParser.test.ts` |
| Analyzers | Graph construction, metrics aggregation, edge cases | `graphBuilder.test.ts` |
| Detectors | Detection logic for agents, skills, tools, MCP servers | `detectors.test.ts` |
| Layout | D3-DAG layout algorithm, cycle handling | `webview/layout.test.ts` |

## Mocking

- Mock external dependencies (filesystem, VS Code API), not internal logic
- For parsers: pass input strings directly, no mocking needed
- For providers: mock `fs` and `vscode.workspace` at boundaries

## Common patterns

```typescript
describe("parserName", () => {
  it("should parse valid input", () => {
    const result = parseAgent(validMarkdown);
    expect(result.name).toBe("expected");
  });

  it("should handle missing frontmatter", () => {
    const result = parseAgent("no frontmatter here");
    expect(result.name).toBe("");
  });
});
```
