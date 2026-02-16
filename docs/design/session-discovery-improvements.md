# Session Discovery Improvements — Design

> Actionable issues derived from [2026-02-container-and-session-discovery.md](../research/2026-02-container-and-session-discovery.md). Each section maps to one GitHub issue.

---

## Issue 1: Set settings scope to `machine-overridable`

### Problem

The three path-override settings (`agentLens.sessionDir`, `agentLens.claudeDir`, `agentLens.codexDir`) have no explicit `scope`, defaulting to `"window"`. This means a single value is shared across host and container. A container-specific mount path like `/mnt/host-workspaceStorage` leaks into the host context where it doesn't exist.

### Change

In `package.json`, add `"scope": "machine-overridable"` to each setting:

```jsonc
"agentLens.sessionDir": {
  "type": "string",
  "default": "",
  "scope": "machine-overridable",
  "markdownDescription": "..."
}
```

Repeat for `claudeDir` and `codexDir`.

### Behaviour

- Host and container maintain **independent** User-level values
- `.vscode/settings.json` (Workspace) can **override** both
- No code changes needed — VS Code handles scope resolution automatically

### Files

- `package.json` (settings definitions only)

### Acceptance criteria

- All three settings have `"scope": "machine-overridable"`
- Setting a value in `.vscode/settings.json` works in both local and container contexts
- Setting a value in User settings on host does not appear in container and vice versa

---

## Issue 2: Update setup guide for Copilot-only focus

### Problem

The current container setup guide (`webview/setup.ts`) covers Copilot, Claude, and Codex equally. In practice, Claude and Codex work automatically in containers (they're workspace extensions writing to the container filesystem). Only Copilot needs user action.

### Change

1. Restructure the setup guide to lead with the key message: **Claude and Codex work automatically in containers. Copilot requires a bind mount.**
2. Move Claude/Codex mount instructions to an "Advanced" or "Optional" section for the case where the user runs CLIs on the host.
3. Add a note about session persistence across container rebuilds (named volumes for `~/.claude` and `~/.codex`).

### Files

- `webview/setup.ts`

### Acceptance criteria

- Setup guide clearly states which providers need action
- Copilot mount instructions are prominent
- Persistence guidance is included
- Claude/Codex "just works" message is clear

---

## Issue 3: Codex per-project filtering

### Problem

Codex stores all sessions globally under `~/.codex/sessions/{provider}/{date}/`. Unlike Copilot (keyed by workspace URI hash) and Claude (keyed by encoded workspace path), Codex has no per-project scoping. Agent Lens currently shows all Codex sessions from all projects.

### Approach

Codex rollout JSONL files do not contain a workspace path in the header. Options:

**Option A: Filter by working directory heuristic**
Parse `function_call` items for `cwd` or file path patterns that match the current workspace. Fragile — depends on tool call content.

**Option B: Filter by date/activity correlation**
Show only Codex sessions that overlap in time with the current workspace's git activity. Approximate but requires no format changes.

**Option C: Show all with a visual indicator**
Keep showing all sessions but add a "(global)" badge or group header. Users understand these aren't project-scoped.

**Recommended: Option C** — simplest, honest, no false negatives. Add Option A as a future enhancement if Codex adds workspace metadata to their format.

### Files

- `src/views/treeProvider.ts` (badge/label)
- `webview/metrics.ts` (optional: filter toggle)

### Acceptance criteria

- Codex sessions are visually distinguishable as global (not project-scoped)
- No sessions are silently hidden

---

## Issue 4: Flag cross-workspace Copilot sessions

### Problem

When the primary Copilot discovery (exact workspace hash match) fails, we fall back to scanning sibling hash directories by **folder name**. This can surface sessions from a different workspace that happens to share the same folder name (e.g., two repos both named `app`).

These sessions appear in Agent Lens but won't appear in Copilot Chat's session list, which is confusing.

### Change

1. Track which discovery strategy found each session (primary hash vs folder-name fallback)
2. When displaying sessions found via fallback, add a visual indicator (e.g., warning icon or "(similar workspace)" suffix in the tree view)

### Files

- `src/parsers/copilotProvider.ts` (tag sessions with discovery source)
- `src/models/session.ts` (optional: `discoverySource` field)
- `src/views/treeProvider.ts` (conditional icon/label)

### Acceptance criteria

- Sessions from exact hash match display normally
- Sessions from folder-name fallback display with a visual indicator
- User can understand why a session appears in Agent Lens but not in Copilot Chat

---

## Issue 5: Copilot file watcher for late-created `chatSessions/` directory

### Problem

When the extension activates before the user has any Copilot sessions (common in containers or new workspaces), the `chatSessions/` directory doesn't exist yet. The file watcher was anchored to that directory and never fired when it was created.

### Status

**Fixed** — watcher is now anchored to the parent hash directory with glob `chatSessions/*.jsonl`. This was implemented in the current branch but not yet committed.

### Files

- `src/parsers/copilotProvider.ts` (`getWatchTargets`)

### Acceptance criteria

- Extension auto-detects new Copilot sessions even if `chatSessions/` didn't exist at activation
- Verified in a Dev Container where first Copilot session is created after extension loads

---

## Issue 6: Add session persistence guidance to documentation

### Problem

Claude and Codex sessions stored in the container's home directory (`~/.claude/`, `~/.codex/`) are lost on container rebuild. Users may not realize this until it's too late.

### Change

1. Add a section to the setup guide about session persistence
2. Provide copy-pasteable `devcontainer.json` mount snippets for named volumes
3. Consider a one-time notification when running in a container without volumes (stretch goal — detecting volume mounts programmatically is non-trivial)

### Example mount config

```jsonc
{
  "mounts": [
    "source=claude-data,target=/home/vscode/.claude,type=volume",
    "source=codex-data,target=/home/vscode/.codex,type=volume"
  ]
}
```

### Files

- `webview/setup.ts` (persistence section)

### Acceptance criteria

- Setup guide includes persistence guidance with mount snippets
- Named volume approach is clearly explained

---

## Priority and sequencing

| Issue | Priority | Effort | Dependencies |
|-------|----------|--------|-------------|
| **1. Settings scope** | P0 | Small | None |
| **5. Watcher fix** | P0 | Done | None (already implemented) |
| **2. Setup guide focus** | P1 | Medium | Issue 1 (settings context) |
| **6. Persistence guidance** | P1 | Small | Issue 2 (part of setup guide) |
| **3. Codex filtering** | P2 | Medium | None |
| **4. Cross-workspace flag** | P2 | Medium | None |

Issues 2 and 6 can be combined into a single "setup guide v2" issue. Issues 3 and 4 are independent enhancements.
