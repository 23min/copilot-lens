import * as vscode from "vscode";

export class SetupPanel {
  private static instance: SetupPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposed = false;

  private constructor(panel: vscode.WebviewPanel) {
    this.panel = panel;

    this.panel.onDidDispose(() => {
      this.disposed = true;
      SetupPanel.instance = undefined;
    });
  }

  static show(extensionUri: vscode.Uri): SetupPanel {
    if (SetupPanel.instance && !SetupPanel.instance.disposed) {
      SetupPanel.instance.panel.reveal();
      return SetupPanel.instance;
    }

    const panel = vscode.window.createWebviewPanel(
      "copilotLens.setup",
      "Copilot Lens: Container Setup",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, "out", "webview"),
        ],
      },
    );

    const instance = new SetupPanel(panel);
    SetupPanel.instance = instance;

    panel.webview.html = instance.getHtml(panel.webview, extensionUri);

    return instance;
  }

  private getHtml(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
  ): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, "out", "webview", "setup.js"),
    );

    const nonce = getNonce();

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
  <title>Copilot Lens: Container Setup</title>
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
  <container-setup></container-setup>
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
