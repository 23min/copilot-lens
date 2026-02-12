# CLAUDE.md — Project Conventions

## Branching strategy

Feature branches off `main`. Branch naming: `feature/<short-description>`, `fix/<short-description>`, `chore/<short-description>`.

No direct commits to `main` — always branch and merge.

## Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `build`.

Scope is optional but encouraged (e.g., `parser`, `graph`, `webview`, `metrics`).

Examples:
- `feat(parser): add agent frontmatter parser`
- `test(parser): add tests for skill parser edge cases`
- `docs: add design spec`
- `chore: initial project scaffolding`

Keep the subject line under 72 characters. Use imperative mood ("add", not "added").

## Working style

- Never guess or assume. If unsure about something, or there are multiple valid approaches, ask the user and let them choose.
- Never infer personal information (names, emails, etc.) from filesystem paths or environment variables.

## Development

- TDD: red-green-refactor
- TypeScript for extension host code
- Lit + D3.js for webview components
- Vitest for unit tests
- Keep parsers as pure functions (easy to test)
