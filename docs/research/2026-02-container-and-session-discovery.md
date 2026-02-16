# Session Discovery: Environments, Containers & CLI

> Comprehensive analysis of where AI assistant session data lives across local and containerised environments, how CLI and VS Code extension sessions relate, and what Agent Lens can realistically discover in each scenario.

**Status**: Current — container setup guide implemented. Settings scope (`machine-overridable`) and Codex per-project filtering are pending. See recommendations in section 9. Updated 2026-02-16 with WSL testing results and workspaceStorage hash instability findings.

---

## 1. Extension Architecture in VS Code Remote

VS Code splits extensions into two hosts when running remotely (Dev Containers, SSH, WSL):

| Host | What runs here | Filesystem |
|------|---------------|------------|
| **UI (local)** | Extensions that provide panels, webviews, decorations | Host machine |
| **Workspace (remote)** | Extensions that need filesystem/terminal access | Container / remote |

An extension's `extensionKind` determines where it runs. Extensions that need to read/write project files or execute commands run as **workspace** extensions (in the container). Extensions that only provide UI run on the **host**.

Agent Lens currently has no `extensionKind` set. VS Code infers **workspace** from our use of `vscode.workspace` APIs, so we always run in the container.

> **Why not `extensionKind: ["ui"]`?** Setting UI kind would put Agent Lens on the host, fixing Copilot session access. However, all our providers use Node.js `fs.readFile()` / `fs.readdir()` which only see the local filesystem. Claude and Codex sessions written inside the container would become invisible. `vscode.workspace.fs` can bridge remote boundaries but only for files inside workspace folders — not arbitrary paths like `~/.claude/` or `~/.codex/`. Switching to UI would fix one provider and break two.

---

## 2. Where Each Extension Stores Sessions

### 2a. GitHub Copilot Chat (`github.copilot-chat`)

| Property | Value |
|----------|-------|
| **extensionKind** | UI — runs on the **host** |
| **Session path** | `<workspaceStorage>/{hash}/chatSessions/*.jsonl` |
| **Scoping** | Per-workspace (hash derived from workspace URI) |
| **Index** | None — directory listing |

The `workspaceStorage` root varies by platform:

| Platform | Path |
|----------|------|
| macOS | `~/Library/Application Support/Code/User/workspaceStorage/` |
| Linux | `~/.config/Code/User/workspaceStorage/` |
| Windows | `%APPDATA%/Code/User/workspaceStorage/` |

Because Copilot Chat is a UI extension, it **always** writes sessions to the host, even when VS Code is connected to a container.

### 2b. Claude Code (`anthropic.claude-code`)

| Property | Value |
|----------|-------|
| **extensionKind** | Workspace — runs in the **container** |
| **Session path** | `~/.claude/projects/{encoded-path}/*.jsonl` |
| **Scoping** | Per-project (path-encoded directory name) |
| **Index** | `sessions-index.json` (fast lookup) |

The extension embeds the Claude Code CLI process. Both CLI and extension write to the same `~/.claude/` directory. When running in a container, `~` resolves to the container's home (e.g., `/home/vscode`).

### 2c. OpenAI Codex (`openai.chatgpt`)

| Property | Value |
|----------|-------|
| **extensionKind** | Workspace — runs in the **container** |
| **Session path** | `~/.codex/sessions/{provider_id}/{date}/*.jsonl` |
| **Scoping** | **Global** — all sessions for all projects in one tree |
| **Index** | None — recursive directory listing |
| **Env override** | `CODEX_HOME` changes the root from `~/.codex/` |

The extension runs Codex tasks that execute shell commands, so it must run in the container. Like Claude, the extension and CLI share the same `~/.codex/` directory.

**Important**: Codex sessions are not scoped to a workspace. Every session from every project is stored in the same directory tree. Agent Lens currently shows all of them, which is a known gap (no per-project filtering).

---

## 3. CLI vs VS Code Extension: Shared or Separate?

### Claude Code

The VS Code extension **embeds** the Claude Code CLI. There is one shared data directory:

```
~/.claude/
├── projects/
│   └── {encoded-path}/
│       ├── sessions-index.json
│       ├── {session-id}.jsonl        ← created by CLI or extension
│       └── {session-id}/
│           └── subagents/
│               └── agent-{id}.jsonl
├── settings.json
└── credentials.json
```

- Sessions created via `claude` in the terminal and sessions created via the VS Code extension are **identical** in format and location.
- If the user runs `claude` on the host terminal while VS Code is connected to a container, the host sessions are in the **host's** `~/.claude/` and the container cannot see them.
- If the user runs `claude` in the VS Code integrated terminal (which is inside the container), sessions go to the **container's** `~/.claude/`.

### Codex

The VS Code extension writes to the **same** directory as the CLI:

```
~/.codex/
├── sessions/
│   └── {provider_id}/
│       └── {YYYY-MM-DD}/
│           └── rollout-{uuid}.jsonl  ← created by CLI or extension
├── config.toml
├── history.jsonl
└── auth.json
```

Same rules apply: terminal location (host vs container) determines which `~/.codex/` receives the session.

### Copilot Chat

There is **no CLI equivalent** that shares sessions with the VS Code extension.

`gh copilot` (the GitHub CLI extension) is a separate tool for terminal completions. It does not read or write `chatSessions/` data and has no relationship to the VS Code Copilot Chat session format.

---

## 4. What Happens on Container Rebuild?

When a Dev Container is rebuilt, the container filesystem is destroyed and recreated. What survives depends on what is mounted.

### Default Dev Container setup

| Data | Location | Persists? | Why |
|------|----------|-----------|-----|
| **Workspace files** | Bind mount from host | **Yes** | Mounted from host filesystem |
| **VS Code Server** | Docker volume (`vscode-server`) | **Usually yes** | VS Code creates a named volume by default |
| **Copilot Chat sessions** | Host `workspaceStorage/` | **Yes** | Never in the container |
| **Claude sessions** | Container `~/.claude/` | **No** | Container home is ephemeral |
| **Codex sessions** | Container `~/.codex/` | **No** | Container home is ephemeral |
| **Our extension storage** | Container `~/.vscode-server/` | **Usually yes** | Part of the VS Code Server volume |
| `.vscode/settings.json` | Workspace (bind mount) | **Yes** | Part of the workspace |

### Key insight

Claude and Codex sessions are **lost on rebuild** unless the user explicitly adds a volume or bind mount. This is not just an Agent Lens problem — the users lose their AI session history for those tools too.

### Preserving sessions across rebuilds

Users can add mounts in `devcontainer.json`:

```jsonc
{
  "mounts": [
    // Preserve Claude sessions across rebuilds
    "source=claude-data,target=/home/vscode/.claude,type=volume",
    // Preserve Codex sessions across rebuilds
    "source=codex-data,target=/home/vscode/.codex,type=volume"
  ]
}
```

Named Docker volumes (`type=volume`) persist across container rebuilds. Bind mounts (`type=bind`) map to the host filesystem directly.

---

## 5. Discovery Paths: Local vs Container

### Local development (no container)

Everything runs on the same machine. No mounts or settings needed.

| Provider | Discovery method | Works automatically? |
|----------|-----------------|---------------------|
| **Copilot** | `context.storageUri` → parent hash dir → `chatSessions/` | **Yes** |
| **Claude** | `os.homedir()/.claude/projects/{encoded-path}/` | **Yes** |
| **Codex** | `os.homedir()/.codex/sessions/` (or `CODEX_HOME`) | **Yes** |

### Container — default (no extra mounts)

Agent Lens runs in the container. Claude and Codex extensions also run in the container.

| Provider | Discovery method | Works automatically? | Why |
|----------|-----------------|---------------------|-----|
| **Copilot** | `context.storageUri` → container `workspaceStorage` | **No** | Sessions are on host |
| **Claude** | Container `~/.claude/projects/{encoded-path}/` | **Yes** | Extension writes here |
| **Codex** | Container `~/.codex/sessions/` | **Yes** | Extension writes here |

### Container — with host bind mount for Copilot

**macOS:**
```jsonc
// devcontainer.json
{
  "mounts": [
    "source=${localEnv:HOME}/Library/Application Support/Code/User/workspaceStorage,target=/mnt/host-workspaceStorage,type=bind,readonly"
  ]
}
```

**Linux:**
```jsonc
// devcontainer.json
{
  "mounts": [
    "source=${localEnv:HOME}/.config/Code/User/workspaceStorage,target=/mnt/host-workspaceStorage,type=bind,readonly"
  ]
}
```

**Windows** (`%APPDATA%` = `AppData\Roaming`)**:**
```jsonc
// devcontainer.json
{
  "mounts": [
    "source=${localEnv:APPDATA}/Code/User/workspaceStorage,target=/mnt/host-workspaceStorage,type=bind,readonly"
  ]
}
```

Then in all cases:

```jsonc
// .vscode/settings.json
{
  "agentLens.sessionDir": "/mnt/host-workspaceStorage"
}
```

| Provider | Works? | Notes |
|----------|--------|-------|
| **Copilot** | **Yes** | Via `sessionDir` setting pointing to mount |
| **Claude** | **Yes** | Automatic (container `~/.claude`) |
| **Codex** | **Yes** | Automatic (container `~/.codex`) |

### Container — with named volumes for persistence

```jsonc
// devcontainer.json
{
  "mounts": [
    "source=${localEnv:HOME}/Library/Application Support/Code/User/workspaceStorage,target=/mnt/host-workspaceStorage,type=bind,readonly",
    "source=claude-data,target=/home/vscode/.claude,type=volume",
    "source=codex-data,target=/home/vscode/.codex,type=volume"
  ]
}
```

This gives full session access **and** persistence across rebuilds.

---

## 6. Settings Reference

### Current settings

| Setting | Purpose | Default discovery |
|---------|---------|-------------------|
| `agentLens.sessionDir` | Override Copilot session path | `context.storageUri` → `chatSessions/` |
| `agentLens.claudeDir` | Override Claude session path | `~/.claude/projects/{encoded-path}/` |
| `agentLens.codexDir` | Override Codex session path | `~/.codex/sessions/` |

### Setting scope

All settings currently have no explicit `scope` (defaults to `"window"`). They should use `"machine-overridable"`:

- **`machine`** scope: host and container maintain separate values independently
- **`overridable`** part: `.vscode/settings.json` can override the per-machine value

This matters because a user might set `agentLens.sessionDir = "/mnt/host-workspaceStorage"` in `.vscode/settings.json`. That path only makes sense inside the container (where the mount exists). With `machine-overridable` scope, the setting applies in the container without interfering with the local (host) setup where discovery works automatically.

### Where to put settings

| Setting location | Shared between host and container? | Best for |
|------------------|------------------------------------|----------|
| **User settings** | Synced (but `machine` scope separates them) | Per-machine defaults |
| **Workspace settings** (`.vscode/settings.json`) | Yes (bind-mounted workspace) | Container-specific overrides |
| **Folder settings** (multi-root) | Yes | Per-folder overrides |

**Recommendation**: Container mount paths should go in `.vscode/settings.json` since they're project-specific and only meaningful when the mount exists.

---

## 7. Edge Cases

### User runs CLI on host while VS Code is in container

A user may have a separate terminal (outside VS Code) where they run `claude` or `codex` on the host. Those sessions go to the **host's** `~/.claude/` or `~/.codex/`, not the container's. The container can't see them.

To surface these sessions, the user would need to:
1. Bind-mount the host's `~/.claude` and/or `~/.codex` into the container
2. Set `agentLens.claudeDir` / `agentLens.codexDir` to the mount paths

This is a realistic scenario — not all users work exclusively inside the VS Code terminal. Some may use a tiling terminal (tmux, iTerm2 splits, Windows Terminal tabs) alongside VS Code.

### WorkspaceStorage hash instability (vscode#285059)

VS Code derives a hash from the workspace URI to scope `workspaceStorage` directories. When a Dev Container is reopened, VS Code may generate a **different hash** — for example after a container rebuild, a change to `devcontainer.json`, or sometimes seemingly at random. When this happens:

- Copilot Chat sessions "disappear" from the UI — they are no longer associated with the current workspace hash
- The old session files **still exist** on disk under the previous hash directory
- The user sees an empty chat history even though nothing was deleted

This is tracked upstream as [vscode#285059](https://github.com/microsoft/vscode/issues/285059), which was closed as **"not planned"**.

**Impact on Agent Lens**: Our strategy 3 fallback (folder-name scan across sibling hash dirs) already partially mitigates this — it finds sessions under stale hashes. However, we currently don't distinguish "current hash" sessions from "stale hash" sessions, and users may not realise the fallback is active. See enhancement issue for explicit mitigation.

### Multiple workspaces with the same folder name

Copilot uses workspace URI hashes, so different workspaces with the same folder name have different hashes. Our fallback scan (strategy 3 in `copilotProvider.ts`) matches by **folder name**, which could surface sessions from a different workspace with the same name. This is a known trade-off — false positive is better than no sessions.

**UI concern**: If Agent Lens lists a session discovered via the folder-name fallback, that session may not appear in Copilot Chat's own session list (which uses the exact hash). This could confuse users. We should consider flagging these sessions in the tree view — e.g., a warning icon or "(from similar workspace)" suffix — so users understand why they see a session that Copilot doesn't show.

### SSH Remote (direct)

When VS Code connects to a remote machine via SSH (no container), Agent Lens runs on the remote machine. The remote machine **is** the workspace host.

- **Claude/Codex**: If the user runs the CLIs on the remote machine, sessions are in the remote's `~/.claude/` and `~/.codex/`. Agent Lens finds them automatically.
- **Copilot Chat**: Still a UI extension on the local machine. Sessions are on the **local** machine's `workspaceStorage`. Agent Lens on the remote can't see them. The user would need to make the local `workspaceStorage` accessible on the remote (e.g., via `sshfs` reverse mount or a shared filesystem), which is unusual.

### SSH Remote + Dev Container (nested)

A user may SSH into a remote machine and then open a project inside a Dev Container on that remote. This creates a two-hop scenario:

```
Local machine (UI host)
  └── SSH to remote machine
        └── Dev Container on remote
              └── Agent Lens runs here
```

- **Copilot Chat**: Sessions are on the **local machine** (two hops away). Practically inaccessible.
- **Claude/Codex extensions**: Run inside the Dev Container on the remote. Sessions are in the container's `~/.claude/` and `~/.codex/`. Agent Lens finds them automatically.
- **Claude/Codex CLIs on the remote** (outside the container): Sessions are on the remote host's filesystem, not inside the container. The user would need a bind mount from the remote host into the container.

This is the most complex scenario. For Copilot, there is no practical path to session discovery. For CLI sessions on the remote host, the same bind-mount strategy applies as for regular Dev Containers, but the "host" is the remote machine rather than the local one.

### WSL

WSL has two sub-scenarios with different behaviour:

**WSL direct** (VS Code connected to WSL, no container):

Agent Lens runs inside the WSL distribution as a workspace extension. Copilot Chat is a UI extension and runs on the **Windows side** — it writes `chatSessions/` to Windows `%APPDATA%`, not to WSL's `~/.vscode-server/`. The WSL-side `~/.vscode-server/data/User/workspaceStorage/` only contains data from workspace extensions and will NOT have `chatSessions/`.

The Windows filesystem is accessible from WSL at `/mnt/c/`, so the user could set:

```json
{
  "agentLens.sessionDir": "/mnt/c/Users/<username>/AppData/Roaming/Code/User/workspaceStorage"
}
```

**Important**: This path contains the Windows username, so it must go in **User settings** (per-machine), not in `.vscode/settings.json` (which is shared via source control and would break for other team members).

Claude and Codex CLIs run in WSL, writing to WSL's `~/.claude/` and `~/.codex/`. Agent Lens finds them automatically.

**WSL + Dev Container** (container running inside WSL):

This is the more common Docker Desktop on Windows setup. The Dev Container runs inside WSL's Docker daemon. Agent Lens runs inside the container.

- `/mnt/c/` is accessible from WSL but is **not** accessible from inside the container. The container has its own isolated filesystem.
- To reach Windows-side Copilot sessions from inside the container, the user needs an explicit bind mount in `devcontainer.json`.
- Claude and Codex extensions run in the container and write to the container's home. Agent Lens finds them automatically.

**Verified findings from WSL testing (2026-02-16):**

1. **`dev.containers.defaultMounts` does not work from WSL remote sessions.** This VS Code Desktop setting is not read from the Windows-side settings when the Dev Containers extension is running inside a WSL remote session. SSH mounts configured in `devcontainer.json` work fine — confirming that the mount mechanism itself is functional, just not the `defaultMounts` setting.

2. **Docker-in-Docker complicates mounts.** When using the `docker-in-docker` devcontainer feature, the container runs its own Docker daemon. Mounts added by the outer Docker (when VS Code creates the devcontainer) do not cascade into inner Docker containers.

3. **`${localEnv:APPDATA}` works in `devcontainer.json` mounts** and resolves per-user, avoiding hardcoded Windows usernames in the repo.

4. **Pragmatic portable approach: use a custom environment variable.** Rather than relying on `${localEnv:APPDATA}` (which only exists on Windows), define a custom env var like `VSCODE_CHAT_STORAGE` in the user's shell profile:

   ```bash
   # In WSL ~/.bashrc or ~/.profile
   export VSCODE_CHAT_STORAGE="/mnt/c/Users/$USER/AppData/Roaming/Code/User/workspaceStorage"
   ```

   Then reference it in `devcontainer.json`:

   ```jsonc
   {
     "mounts": [
       "source=${localEnv:VSCODE_CHAT_STORAGE},target=/mnt/host-workspaceStorage,type=bind,readonly"
     ]
   }
   ```

   Benefits:
   - `devcontainer.json` is portable — no hardcoded usernames
   - Each developer sets the path once in their shell profile
   - If the variable is unset, the mount is silently skipped (no errors)
   - Works across platforms (macOS/Linux users set the same var to their platform's path)

5. **`code .` from WSL is not the same as reopening a DevContainer.** Running `code .` in a WSL terminal opens VS Code in **WSL remote mode** (no Docker). Opening from Recent Projects with a `dev-container+` URI reconnects to the DevContainer. Users must explicitly "Reopen in Container" from the Command Palette to switch.

---

## 8. Session Discovery Strategy Matrix

This matrix shows what Agent Lens can discover in each environment, with and without configuration.

### Without any settings (out of the box)

| Environment | Copilot Chat | Claude Code ext | Codex ext |
|-------------|-------------|-----------------|-----------|
| **Local (macOS/Linux/Windows)** | Auto | Auto | Auto (global) |
| **Dev Container** | **Missing** | Auto | Auto (global) |
| **SSH Remote (direct)** | **Missing** | Auto | Auto (global) |
| **SSH + Dev Container** | **Missing** | Auto | Auto (global) |
| **WSL (direct)** | **Missing** | Auto | Auto (global) |
| **WSL + Dev Container** | **Missing** | Auto | Auto (global) |

### With settings and mounts configured

| Environment | Copilot Chat | Claude Code ext | Codex ext |
|-------------|-------------|-----------------|-----------|
| **Local** | Auto | Auto | Auto |
| **Dev Container + host mount** | Via `sessionDir` | Auto | Auto |
| **SSH Remote (direct)** | Impractical* | Auto | Auto |
| **SSH + Dev Container** | Impractical* | Auto | Auto |
| **WSL (direct)** | Via `sessionDir` (`/mnt/c/...`) | Auto | Auto |
| **WSL + Dev Container** | Via mount + `sessionDir`** | Auto | Auto |

\* SSH: local workspaceStorage would need to be made accessible on the remote, which is unusual and fragile.

\** WSL + Container: `/mnt/c/` is not accessible from inside the container. Requires an explicit bind mount — verified working with `${localEnv:APPDATA}` or custom env var in `devcontainer.json`. Note that `dev.containers.defaultMounts` does NOT work from WSL remote sessions.

### Scoping

| Provider | Scoped to project? | Notes |
|----------|-------------------|-------|
| **Copilot Chat** | Yes | Sessions keyed by workspace URI hash |
| **Claude Code** | Yes | Sessions keyed by encoded workspace path |
| **Codex** | **No** | All sessions global — needs filtering |

### Session persistence across container rebuild

| Provider | Default | With named volume |
|----------|---------|-------------------|
| **Copilot Chat** | Persists (on host) | N/A |
| **Claude Code** | **Lost** | Persists |
| **Codex** | **Lost** | Persists |

### CLI ↔ Extension session sharing

| Tool | CLI sessions visible to extension? | Extension sessions visible to CLI? | Shared storage? |
|------|-----------------------------------|-----------------------------------|-----------------|
| **Claude Code** | Yes — same `~/.claude/` | Yes | Yes |
| **Codex** | Yes — same `~/.codex/` | Yes | Yes |
| **Copilot** | N/A (no CLI equivalent) | N/A | N/A |

### What Agent Lens should support

| Capability | Priority | Rationale |
|------------|----------|-----------|
| Per-project Copilot sessions (local) | P0 | Core use case, works today |
| Per-project Claude sessions (local) | P0 | Core use case, works today |
| Per-project Claude sessions (container) | P0 | Works today (extension in container) |
| Per-project Codex sessions (local) | P1 | Works today but shows all projects |
| Per-project Codex sessions (container) | P1 | Works but shows all projects |
| Copilot sessions in container via mount | P1 | Requires user setup, setup guide exists |
| Codex per-project filtering | P2 | Enhancement — filter by workspace path |
| System-wide session overview | P3 | Cross-project view, different UX |
| Host CLI sessions from container | P3 | Rare use case, needs mount |

---

## 9. Recommendations

1. **Keep Agent Lens as a workspace extension** — Claude and Codex are the primary container use cases and they work automatically.

2. **Set settings scope to `machine-overridable`** — allows `.vscode/settings.json` to configure container-specific paths without affecting local development.

3. **The setup guide should focus on Copilot** — it's the only provider that needs a mount. Claude and Codex work out of the box in containers.

4. **Add persistence guidance** — warn users that Claude and Codex sessions are lost on container rebuild, recommend named volumes.

5. **Add Codex per-project filtering** — Codex is the only provider without workspace scoping. This is a separate issue but worth tracking.

6. **Per-project is the right default** — system-wide session discovery is a different feature with different UX needs. Keep the current per-project focus.

7. **Mitigate workspaceStorage hash instability** — the strategy 3 fallback already finds sessions across hash dirs, but Agent Lens should actively surface sessions from stale hashes and notify users. See [vscode#285059](https://github.com/microsoft/vscode/issues/285059).

8. **Document the custom env var approach for WSL** — the `VSCODE_CHAT_STORAGE` pattern is the most portable solution for WSL + DevContainer setups. Include in setup guide.

---

## References

- [VS Code Remote Development — Extension Host](https://code.visualstudio.com/api/advanced-topics/extension-host)
- [VS Code Extension Manifest — extensionKind](https://code.visualstudio.com/api/references/extension-manifest)
- [Dev Containers — Mount Volumes](https://containers.dev/implementors/json_reference/#mounts)
- [VS Code Settings Scope](https://code.visualstudio.com/api/references/contribution-points#Configuration-property-schema)
- [2026-02-data-sources.md](2026-02-data-sources.md) — Copilot session format details
- [2026-02-claude-code-sessions.md](2026-02-claude-code-sessions.md) — Claude session format details
- [2026-02-codex-sessions.md](2026-02-codex-sessions.md) — Codex session format details
- [2026-02-session-tracing.md](2026-02-session-tracing.md) — Timing and trace visualization research
- [vscode#285059 — Copilot Chat history disappears in Dev Container](https://github.com/microsoft/vscode/issues/285059) — workspaceStorage hash instability
- [vscode-remote#10945 — Multi-platform localEnv in mounts](https://github.com/microsoft/vscode-remote-release/issues/10945) — `HOME`+`USERPROFILE` concatenation caveat
- [vscode-remote#3354 — Reopen locally from dev container on WSL](https://github.com/microsoft/vscode-remote-release/issues/3354) — remote authority transition quirks
