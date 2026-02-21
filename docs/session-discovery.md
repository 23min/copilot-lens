# Session Discovery & Agent/Skill Detection

> What Agent Lens can and cannot see, and why, depending on how you run VS Code.

---

## How Agent and Skill Detection Works

Understanding *what* Agent Lens looks for in session data is essential before debugging why something isn't showing up.

### Copilot: Agent Detection

Copilot Chat writes agent mode changes into the session `.jsonl` file as JSONL patches:

```jsonl
{"kind":1,"k":["inputState","mode"],"v":{"kind":"agent","id":"file:///…/.github/agents/implementer.agent.md"}}
```

Agent Lens reads these patches and extracts the agent name from the file URI.

**Important**: This is triggered by selecting an agent from the **mode picker** (the dropdown at the top of the Copilot Chat panel). Typing `@implementer` in the message text does *not* switch modes and does *not* write a mode change to the session file.

**Not detected**: When you switch agent mid-session, only the requests sent *after* the switch are associated with that agent. Switching back to Agent/Ask mode is recorded as clearing the custom agent.

### Copilot: Skill Detection

Skills are detected in two ways:

| Type | What it means | How detected |
|------|--------------|--------------|
| **Available** | The skill was listed in the system prompt | `<skills>…</skills>` block in the rendered user message |
| **Loaded** | The skill file was actually read during the request | A `read_file` tool call targeting `.github/skills/<name>/SKILL.md` |

A skill being *available* does not mean it was used. A skill is only *loaded* when Copilot actually calls `read_file` on its SKILL.md file. This happens when the topic of a message matches the skill's domain and Copilot decides to load it.

**Skill reads are only recorded if the tool call appears in the session data.** Reads that happen as part of VS Code's internal skill injection (not via an explicit `read_file` tool call) are *not* recorded.

### Claude: Agent Detection

Claude Code uses a subagent system. When Claude spawns a subagent via the `Task` tool, the subagent type (e.g., `Explore`, `Bash`, `Plan`, or a custom agent name like `Implementer`) is recorded in the session JSONL. Agent Lens reads the subagent JSONL files (stored under `{sessionId}/subagents/`) and correlates them with the `Task` tool call that spawned them.

Custom project agents from `.claude/agents/*.md` appear as subagent types when Claude decides to delegate to them. For example, if you define `.claude/agents/implementer.md` with `name: Implementer`, sessions where Claude delegates to it will show `Implementer` as the agent name.

Unlike Copilot, there is no mode picker — the main session is always "Claude Code" itself, and custom agents only appear as subagents.

### Claude: Skill Detection

**Not currently detectable.** Claude Code injects skill content (from `.claude/skills/`) into the system prompt sent to the API, but this system prompt is not written to the JSONL session files. Agent Lens cannot determine which skills were active or used in a Claude session from the session data alone.

Skills defined in `.claude/skills/` will appear in the sidebar tree and Agent Graph, but they will not show usage data in the Metrics Dashboard or badges in the Session Explorer.

---

## Scenario Matrix

This table shows what Agent Lens can discover in each common setup.

| Scenario | Copilot sessions | Copilot agents/skills | Claude sessions | Claude agents | Claude skills |
|----------|-----------------|----------------------|-----------------|---------------|---------------|
| **Local VS Code (macOS/Linux/Windows)** | ✅ Auto | ✅ If mode picker used | ✅ Auto | ✅ Subagents | — Not in JSONL |
| **SSH Remote** | ❌ On local machine | ❌ | ✅ Auto (remote `~/.claude`) | ✅ Subagents | — Not in JSONL |
| **WSL (no container)** | ⚠️ Manual config | ⚠️ If configured | ✅ Auto | ✅ Subagents | — Not in JSONL |
| **Dev Container (macOS host)** | ⚠️ Needs mount | ⚠️ If mounted | ✅ Auto | ✅ Subagents | — Not in JSONL |
| **Dev Container (Linux host)** | ⚠️ Needs mount | ⚠️ If mounted | ✅ Auto | ✅ Subagents | — Not in JSONL |
| **Dev Container (WSL host)** | ⚠️ Needs mount | ⚠️ If mounted | ✅ Auto | ✅ Subagents | — Not in JSONL |
| **SSH + Dev Container** | ❌ Two hops away | ❌ | ✅ Auto | ✅ Subagents | — Not in JSONL |

**Legend:**
- ✅ Auto — works out of the box, no configuration needed
- ✅ Subagents — custom agents are detected when Claude delegates via the Task tool
- ⚠️ Manual config — works with the right `agentLens.sessionDir` setting and/or bind mount
- ❌ — not supported; the session data is inaccessible from where the extension host runs
- — Not in JSONL — Claude skill usage is not recorded in session files (see [Claude: Skill Detection](#claude-skill-detection) above)

For configuration instructions for the ⚠️ cases, see [container-setup.md](container-setup.md).

---

## Why Copilot Sessions Are Local-Only

Copilot Chat is a **UI extension** — it runs on the local VS Code client, not on the remote. Session data is written to `workspaceStorage` on the local machine:

| OS | Path |
|----|------|
| macOS | `~/Library/Application Support/Code/User/workspaceStorage` |
| Linux | `~/.config/Code/User/workspaceStorage` |
| Windows | `%APPDATA%\Code\User\workspaceStorage` |

Agent Lens is a **workspace extension** — it runs on the extension host, which in SSH/Dev Container/WSL scenarios runs on the *remote*. The extension host has no access to the local file system, so it cannot read Copilot's session files unless they are explicitly mounted.

Claude Code and Codex, by contrast, are CLI tools that run on the remote machine, so their sessions (`~/.claude/`, `~/.codex/`) are always accessible to the extension host.

---

## Data Freshness

VS Code does not write session data to `.jsonl` files in real-time. It buffers changes in memory and flushes periodically. As a result:

- **Agent mode switches** may not appear on disk immediately after switching modes.
- **Recent messages** in a live session may not yet be persisted.
- **Closing the Copilot Chat panel** or **reloading the window** typically triggers a flush.

If Agent Lens does not show recent activity after clicking Refresh, wait a few seconds and try again, or close and reopen the chat panel.

---

## Common Pitfalls

| Symptom | Likely cause |
|---------|-------------|
| Agent usage shows nothing, even locally | Mode picker was not used; agent was invoked by typing `@name` in message text instead |
| Skill shows as "available" but not "loaded" | Copilot decided not to read the skill file for that request |
| Copilot shows 0 sessions over SSH | Expected — Copilot sessions are on the local machine |
| Copilot shows 0 sessions in Dev Container | `agentLens.sessionDir` not configured or bind mount not added |
| Data present in file but not shown in Agent Lens | Session not yet flushed to disk — close and reopen the chat panel |
| Agent Lens shows sessions but no agent/skill data | Sessions predate the `.github/agents/` and `.github/skills/` setup, or the mode picker was never used |
| Claude skills show as "unused" in Metrics Dashboard | Expected — Claude skill usage is not recorded in session files, so all defined skills appear unused |

---

## Diagnosing Session Discovery

Run **Agent Lens: Diagnose Session Discovery** from the Command Palette to get a detailed breakdown of what the extension can and cannot find on the current machine. See [container-setup.md](container-setup.md#diagnosing-issues) for example output and how to interpret it.
