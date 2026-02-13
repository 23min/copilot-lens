import * as vscode from "vscode";
import type { Session } from "../models/session.js";

export class SessionPanel {
  private static instance: SessionPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposed = false;

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
  ) {
    this.panel = panel;

    this.panel.onDidDispose(() => {
      this.disposed = true;
      SessionPanel.instance = undefined;
    });
  }

  static show(
    extensionUri: vscode.Uri,
    sessions: Session[],
  ): SessionPanel {
    if (SessionPanel.instance && !SessionPanel.instance.disposed) {
      SessionPanel.instance.panel.reveal();
      SessionPanel.instance.updateSessions(sessions);
      return SessionPanel.instance;
    }

    const panel = vscode.window.createWebviewPanel(
      "copilotLens.session",
      "Copilot Lens: Session Explorer",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, "out", "webview"),
        ],
        retainContextWhenHidden: true,
      },
    );

    const instance = new SessionPanel(panel, extensionUri);
    SessionPanel.instance = instance;

    panel.webview.html = instance.getHtml(panel.webview);
    instance.updateSessions(sessions);

    return instance;
  }

  updateSessions(sessions: Session[]): void {
    if (this.disposed) return;
    this.panel.webview.postMessage({ type: "update-sessions", sessions });
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "out", "webview", "session.js"),
    );

    const nonce = getNonce();

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
  <title>Copilot Lens: Session Explorer</title>
  <style>
    body {
      margin: 0;
      padding: 16px;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family);
    }
  </style>
</head>
<body>
  <session-explorer></session-explorer>
  <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
