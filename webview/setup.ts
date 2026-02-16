import { LitElement, html, css } from "lit";
import { customElement } from "lit/decorators.js";

@customElement("container-setup")
class ContainerSetup extends LitElement {
  static override styles = css`
    :host {
      display: block;
      max-width: 720px;
      margin: 0 auto;
      line-height: 1.6;
    }

    h1 {
      font-size: 1.6em;
      margin-bottom: 0.3em;
      color: var(--vscode-editor-foreground);
    }

    .subtitle {
      color: var(--vscode-descriptionForeground);
      margin-bottom: 2em;
    }

    h2 {
      font-size: 1.15em;
      margin-top: 2em;
      margin-bottom: 0.5em;
      padding-bottom: 0.3em;
      border-bottom: 1px solid var(--vscode-widget-border, #333);
      color: #c4a882;
    }

    h3 {
      font-size: 1em;
      margin-top: 1.2em;
      margin-bottom: 0.3em;
      color: var(--vscode-editor-foreground);
    }

    p,
    li {
      color: var(--vscode-editor-foreground);
    }

    ol {
      padding-left: 1.5em;
    }

    li {
      margin-bottom: 0.5em;
    }

    pre {
      background: var(--vscode-textCodeBlock-background, #1e1e1e);
      border: 1px solid var(--vscode-widget-border, #333);
      border-radius: 4px;
      padding: 12px 16px;
      overflow-x: auto;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.9em;
      line-height: 1.5;
    }

    code {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.9em;
      background: var(--vscode-textCodeBlock-background, #1e1e1e);
      padding: 1px 4px;
      border-radius: 3px;
    }

    .note {
      color: var(--vscode-descriptionForeground);
      font-size: 0.9em;
      font-style: italic;
      margin-top: 0.5em;
    }

    .section-icon {
      display: inline-block;
      width: 1.2em;
      margin-right: 0.3em;
    }

    .tip {
      background: var(--vscode-textBlockQuote-background, rgba(255, 255, 255, 0.04));
      border-left: 3px solid #8aab7f;
      padding: 8px 12px;
      margin-top: 1em;
      border-radius: 0 4px 4px 0;
    }

    .tip p {
      margin: 0;
    }
  `;

  override render() {
    return html`
      <h1>Container Setup Guide</h1>
      <p class="subtitle">
        Claude Code and Codex sessions are discovered automatically in
        containers. GitHub Copilot Chat sessions live on the host and need a
        bind mount.
      </p>

      <h2>Copilot Chat Sessions (requires mount)</h2>
      <p>
        Copilot Chat is a UI extension — it stores sessions on the
        <strong>host machine</strong>, not inside the container. To make them
        visible to Agent Lens, mount the host's
        <code>workspaceStorage</code> directory.
      </p>

      <h3>macOS</h3>
      <pre>// devcontainer.json
"mounts": [
  "source=\${localEnv:HOME}/Library/Application Support/Code/User/workspaceStorage,target=/mnt/host-workspaceStorage,type=bind,readonly"
]</pre>

      <h3>Linux</h3>
      <pre>// devcontainer.json
"mounts": [
  "source=\${localEnv:HOME}/.config/Code/User/workspaceStorage,target=/mnt/host-workspaceStorage,type=bind,readonly"
]</pre>

      <h3>Windows / WSL</h3>
      <pre>// devcontainer.json
"mounts": [
  "source=\${localEnv:APPDATA}/Code/User/workspaceStorage,target=/mnt/host-workspaceStorage,type=bind,readonly"
]</pre>
      <p>
        For portable <code>devcontainer.json</code> on WSL, define a custom
        environment variable in your shell profile:
      </p>
      <pre># ~/.bashrc or ~/.profile
export VSCODE_CHAT_STORAGE="/mnt/c/Users/$USER/AppData/Roaming/Code/User/workspaceStorage"</pre>
      <p>Then reference it in <code>devcontainer.json</code>:</p>
      <pre>"mounts": [
  "source=\${localEnv:VSCODE_CHAT_STORAGE},target=/mnt/host-workspaceStorage,type=bind,readonly"
]</pre>

      <h3>Configure the setting</h3>
      <p>
        Add to <code>.vscode/settings.json</code>
        (container-specific):
      </p>
      <pre>"agentLens.sessionDir": "/mnt/host-workspaceStorage"</pre>
      <p>Then rebuild the container.</p>

      <h2>Session Persistence (optional)</h2>
      <p>
        Claude Code and Codex sessions are stored inside the container and
        <strong>lost on rebuild</strong>. Named volumes preserve them:
      </p>
      <pre>// devcontainer.json
"mounts": [
  "source=claude-data,target=/home/vscode/.claude,type=volume",
  "source=codex-data,target=/home/vscode/.codex,type=volume"
]</pre>
      <p class="note">
        This is only needed for persistence across rebuilds — session
        discovery works without it.
      </p>

      <h2>Already have a mount?</h2>
      <p>
        If your host data is already mounted, configure the setting to point
        to it:
      </p>
      <ul>
        <li>
          <code>agentLens.sessionDir</code> — Copilot
          <code>workspaceStorage</code> mount path
        </li>
        <li>
          <code>agentLens.claudeDir</code> — Claude
          <code>projects/</code> directory (only if mounted from host)
        </li>
        <li>
          <code>agentLens.codexDir</code> — Codex
          <code>sessions/</code> directory (only if mounted from host)
        </li>
      </ul>

      <h2>Troubleshooting</h2>
      <div class="tip">
        <p>
          Run <strong>Agent Lens: Diagnose Session Discovery</strong> from the
          Command Palette to inspect what Agent Lens sees — paths checked,
          accessibility, and file counts for each provider.
        </p>
      </div>
      <p>
        For WSL, SSH, Docker-in-Docker, and other advanced scenarios, see the
        <a href="https://github.com/23min/agent-lens/blob/main/docs/container-setup.md"
          >Advanced Container Setup Guide</a
        >.
      </p>
    `;
  }
}

// Prevent tree-shaking
void ContainerSetup;
