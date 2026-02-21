# CLAUDE.md — Project Conventions

## Branching strategy

Feature branches off `main`. Branch naming: `feature/<short-description>`, `fix/<short-description>`, `chore/<short-description>`.

No direct commits to `main` — always branch and PR. Never push directly to `main`; always use `gh pr create` and merge via GitHub.

### Integration branches

For large multi-issue projects, use an integration branch:

1. Create an integration branch off `main` (e.g., `integrate/claude-support`)
2. Branch off the integration branch for each issue (e.g., `feature/claude-session-parser`)
3. Merge issue branches back into the integration branch with `--no-ff`
4. Only merge the integration branch to `main` when the full project is complete and tested

Use integration branches when needed for multi-issue projects (e.g., `integrate/claude-support` was used for issues #5–#9).

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

Link commits to GitHub issues: use `Closes #N` or `Fixes #N` in the commit body (not subject line) so GitHub auto-closes the issue on merge.

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
8. **Push branch** — `git push -u origin <branch>`
9. **Create PR** — `gh pr create` targeting `main`
10. **Merge PR** — merge via GitHub (or `gh pr merge --merge`)
11. **Tag** — `git checkout main && git pull && git tag vX.Y.Z && git push origin vX.Y.Z`
12. **GitHub Actions** builds the `.vsix` and attaches it to the GitHub Release automatically

To build a `.vsix` locally: `npx @vscode/vsce package`
