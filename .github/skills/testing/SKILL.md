---
name: testing
description: Guide for writing tests. Use this when creating unit tests, integration tests, or setting up test infrastructure.
---

# Testing Patterns

## TDD workflow
1. Write a failing test (red)
2. Write minimal code to pass (green)
3. Refactor while keeping tests green

## Vitest conventions
- Test files: `*.test.ts` next to source files
- Use `describe` / `it` blocks
- Prefer `expect` assertions
- Mock external dependencies, not internal logic
