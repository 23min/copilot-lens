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
        Copilot Lens needs access to session data that lives on your host
        machine. In a container, this data isn't visible unless you mount it.
      </p>

      <h2>GitHub Copilot Sessions</h2>
      <ol>
        <li>
          Add a bind mount to your <code>devcontainer.json</code>:
          <pre>"mounts": [
  "source=\${localEnv:HOME}/.config/Code/User/workspaceStorage,target=/mnt/copilot-sessions,type=bind,readonly"
]</pre>
        </li>
        <li>
          Set the <code>copilotLens.sessionDir</code> setting to the mount path:
          <pre>"copilotLens.sessionDir": "/mnt/copilot-sessions"</pre>
        </li>
        <li>Rebuild the container.</li>
      </ol>

      <h2>Claude Code Sessions</h2>
      <ol>
        <li>
          Add a bind mount to your <code>devcontainer.json</code>:
          <pre>"mounts": [
  "source=\${localEnv:HOME}/.claude,target=/mnt/claude,type=bind,readonly"
]</pre>
        </li>
        <li>
          Set the <code>copilotLens.claudeDir</code> setting to the mount path:
          <pre>"copilotLens.claudeDir": "/mnt/claude/projects"</pre>
        </li>
        <li>Rebuild the container.</li>
      </ol>

      <h2>Already have a mount?</h2>
      <p>
        If your host data is already mounted somewhere in the container, you
        just need to configure the settings to point to it:
      </p>
      <ul>
        <li>
          <code>copilotLens.sessionDir</code> — point to the directory
          containing Copilot <code>.jsonl</code> files (or the
          <code>workspaceStorage</code> root)
        </li>
        <li>
          <code>copilotLens.claudeDir</code> — point to the
          <code>projects/</code> directory inside <code>.claude</code>
        </li>
      </ul>

      <div class="tip">
        <p>
          After changing settings, run <strong>Copilot Lens: Refresh</strong>
          from the command palette to pick up the new paths.
        </p>
      </div>
    `;
  }
}

// Prevent tree-shaking
void ContainerSetup;
