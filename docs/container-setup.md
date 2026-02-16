# Advanced Container Setup Guide

> Guide for using Agent Lens in Dev Containers, WSL, SSH, and other remote environments.

**Quick summary**: Claude Code and Codex sessions work automatically in containers. Only Copilot Chat needs a bind mount — it stores sessions on the host machine.

---

## Quick Start: Copilot Chat in a Dev Container

Copilot Chat is a UI extension that writes session data to the host's `workspaceStorage` directory, not inside the container. Agent Lens (a workspace extension running inside the container) can't see these files unless you mount them.

### 1. Add a bind mount to `devcontainer.json`

**macOS:**
```jsonc
"mounts": [
  "source=${localEnv:HOME}/Library/Application Support/Code/User/workspaceStorage,target=/mnt/host-workspaceStorage,type=bind,readonly"
]
```

**Linux:**
```jsonc
"mounts": [
  "source=${localEnv:HOME}/.config/Code/User/workspaceStorage,target=/mnt/host-workspaceStorage,type=bind,readonly"
]
```

**Windows (via `%APPDATA%`):**
```jsonc
"mounts": [
  "source=${localEnv:APPDATA}/Code/User/workspaceStorage,target=/mnt/host-workspaceStorage,type=bind,readonly"
]
```

### 2. Configure the setting

Add to `.vscode/settings.json`:
```json
{
  "agentLens.sessionDir": "/mnt/host-workspaceStorage"
}
```

### 3. Rebuild the container

Agent Lens will scan the mounted `workspaceStorage` root, find hash directories matching your workspace name, and discover Copilot Chat sessions.

---

## WSL-Specific Setup

### WSL direct (no container)

When VS Code is connected to WSL (not a Dev Container), Agent Lens runs inside the WSL distribution. Copilot Chat sessions are on the Windows side at `%APPDATA%\Code\User\workspaceStorage`, accessible from WSL at `/mnt/c/Users/<username>/AppData/Roaming/Code/User/workspaceStorage`.

Set in **User settings** (not workspace settings, since the path contains your Windows username):
```json
{
  "agentLens.sessionDir": "/mnt/c/Users/<your-username>/AppData/Roaming/Code/User/workspaceStorage"
}
```

### WSL + Dev Container

When running a Dev Container inside WSL, the container cannot access `/mnt/c/` directly. You need an explicit bind mount.

**Portable approach with a custom environment variable:**

1. Add to your WSL `~/.bashrc` or `~/.profile`:
   ```bash
   export VSCODE_CHAT_STORAGE="/mnt/c/Users/$USER/AppData/Roaming/Code/User/workspaceStorage"
   ```

2. Reference it in `devcontainer.json`:
   ```jsonc
   "mounts": [
     "source=${localEnv:VSCODE_CHAT_STORAGE},target=/mnt/host-workspaceStorage,type=bind,readonly"
   ]
   ```

This keeps `devcontainer.json` portable — no hardcoded usernames. Each developer sets `VSCODE_CHAT_STORAGE` once in their shell profile. If the variable is unset, the mount is silently skipped.

### Known WSL limitations

- **`dev.containers.defaultMounts` does not work from WSL remote sessions.** This VS Code Desktop setting is not read when the Dev Containers extension runs inside a WSL remote session. Use explicit mounts in `devcontainer.json` instead.
- **`code .` from WSL is not the same as reopening a Dev Container.** Running `code .` opens VS Code in WSL remote mode (no Docker). To use your Dev Container, open from Recent Projects or run "Dev Containers: Reopen in Container" from the Command Palette.

---

## Session Persistence

Claude Code and Codex sessions are stored inside the container (`~/.claude/` and `~/.codex/`) and are **lost when the container is rebuilt**. Named Docker volumes preserve them:

```jsonc
// devcontainer.json
{
  "mounts": [
    "source=claude-data,target=/home/vscode/.claude,type=volume",
    "source=codex-data,target=/home/vscode/.codex,type=volume"
  ]
}
```

Copilot Chat sessions are never in the container (always on the host), so they're not affected by container rebuilds.

---

## WorkspaceStorage Hash Instability

VS Code derives a hash from the workspace URI to scope `workspaceStorage` directories. When a Dev Container is reopened, VS Code may generate a **different hash** — after a rebuild, a `devcontainer.json` change, or sometimes seemingly at random.

**Symptom**: Copilot Chat history disappears, even though the session files still exist on disk under the previous hash directory.

**Agent Lens mitigation**: Agent Lens automatically scans sibling hash directories matching your workspace folder name (strategy 3 in the Copilot provider). This finds sessions under stale hashes that Copilot Chat itself no longer shows.

This is tracked upstream as [vscode#285059](https://github.com/microsoft/vscode/issues/285059) (closed as "not planned").

---

## Docker-in-Docker

When using the `docker-in-docker` Dev Container feature, the container runs its own Docker daemon. Mounts added by the outer Docker (when VS Code creates the container) **do not cascade** into containers started by the inner Docker daemon.

If you need session data inside an inner container, configure mounts at the inner container level or use Docker volumes shared between the outer and inner containers.

---

## SSH Remote

### Direct SSH (no container)

Agent Lens runs on the remote machine. Claude and Codex sessions in `~/.claude/` and `~/.codex/` on the remote are discovered automatically.

Copilot Chat sessions remain on your **local machine** — they are not accessible from the remote. Making them accessible would require a reverse mount (e.g., `sshfs`), which is unusual and fragile.

### SSH + Dev Container

A two-hop scenario: local machine → SSH remote → Dev Container. Copilot Chat sessions are on the local machine (two hops away) and practically inaccessible. Claude and Codex sessions inside the container work automatically.

---

## Diagnosing Issues

Run **Agent Lens: Diagnose Session Discovery** from the Command Palette. This outputs a structured report to the Output Channel ("Agent Lens") showing:

- Environment: remote type, workspace path, storage URI, platform
- For each provider: paths checked, accessibility, file counts
- Configured settings and whether they point to valid directories

### Example output

```
=== Agent Lens: Session Discovery Diagnostic ===
Timestamp: 2026-02-16T14:30:00.000Z

Environment:
  Remote:         dev-container
  Workspace:      /workspaces/my-project
  Storage URI:    /home/vscode/.vscode-server/.../abc123/agent-lens
  Home:           /home/vscode
  Platform:       linux
  CODEX_HOME:     (not set)

--- Copilot ---
  sessionDir setting: /mnt/host-workspaceStorage
  [configDir] /mnt/host-workspaceStorage
    Accessible: yes — scanned as workspaceStorage root: 42 hash dir(s), 1 matched "my-project" — 8 session file(s)
  Total session files: 8

--- Claude ---
  claudeDir setting: (not set)
  [defaultPath] /home/vscode/.claude/projects/-workspaces-my-project
    Accessible: yes — sessions-index.json with 5 entry/entries
  Total session files: 5

--- Codex ---
  codexDir setting: (not set)
  [defaultPath] /home/vscode/.codex/sessions
    Accessible: yes — 12 .jsonl file(s) (recursive) — via ~/.codex/sessions
  Total session files: 12
```

### Common issues

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Copilot shows 0 files | Mount missing or wrong path | Check diagnostic output for `Not accessible` |
| Claude/Codex show 0 files | Sessions lost on rebuild | Add named volume mounts |
| All providers show 0 | Settings point to wrong paths | Run diagnostic, check paths |
| Sessions found but panels empty | Parsing errors | Check Output Channel for warnings |

---

## Reference

- [VS Code Remote Development — Extension Host](https://code.visualstudio.com/api/advanced-topics/extension-host)
- [Dev Containers — Mount Volumes](https://containers.dev/implementors/json_reference/#mounts)
- [VS Code Settings Scope](https://code.visualstudio.com/api/references/contribution-points#Configuration-property-schema)
- [vscode#285059 — WorkspaceStorage hash instability](https://github.com/microsoft/vscode/issues/285059)
- [Internal research: Container and Session Discovery](docs/research/2026-02-container-and-session-discovery.md)
