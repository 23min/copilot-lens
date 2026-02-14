# CLAUDE.md — Project Conventions

## Branching strategy

Feature branches off `main`. Branch naming: `feature/<short-description>`, `fix/<short-description>`, `chore/<short-description>`.

No direct commits to `main` — always branch and merge.

### Integration branches

For large multi-issue projects, use an integration branch:

1. Create an integration branch off `main` (e.g., `integrate/claude-support`)
2. Branch off the integration branch for each issue (e.g., `feature/claude-session-parser`)
3. Merge issue branches back into the integration branch with `--no-ff`
4. Only merge the integration branch to `main` when the full project is complete and tested

**Current integration branch:** `integrate/claude-support` (tracks [Claude Code Support](https://github.com/users/23min/projects/2) project, issues #5–#9)

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

## Merging to main

Before the final commit on a feature branch (or on main after merge), always update:
- `CHANGELOG.md` — add new entries under `[Unreleased]`
- `README.md` — update project structure, feature descriptions, etc. if relevant

## Development

- TDD: red-green-refactor
- TypeScript for extension host code
- Lit + D3.js for webview components
- Vitest for unit tests
- Keep parsers as pure functions (easy to test)

## Releasing a new version

Before pushing a release, complete this checklist in order:

1. **All changes on a feature/fix branch** — never release from `main` directly
2. **Tests pass** — `npm test` must be green
3. **Build succeeds** — `npm run build` must complete without errors
4. **Bump version** in `package.json` (semver: patch for fixes, minor for features)
5. **Update CHANGELOG.md** — add entries under `[Unreleased]` describing what changed
6. **Update README.md** — if features, structure, or usage changed
7. **Commit** with message `chore: release vX.Y.Z`
8. **Merge to main** — `git checkout main && git merge <branch> --no-ff`
9. **Push** — `git push origin main`
10. **Tag** — `git tag vX.Y.Z && git push origin vX.Y.Z`
11. **GitHub Actions** builds the `.vsix` and attaches it to the GitHub Release automatically

To build a `.vsix` locally: `npx @vscode/vsce package`
