import * as vscode from "vscode";
import type { Graph } from "../models/graph.js";

export class GraphPanel {
  private static instance: GraphPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposed = false;

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
  ) {
    this.panel = panel;

    this.panel.onDidDispose(() => {
      this.disposed = true;
      GraphPanel.instance = undefined;
    });
  }

  static show(extensionUri: vscode.Uri, graph: Graph): GraphPanel {
    if (GraphPanel.instance && !GraphPanel.instance.disposed) {
      GraphPanel.instance.panel.reveal();
      GraphPanel.instance.updateGraph(graph);
      return GraphPanel.instance;
    }

    const panel = vscode.window.createWebviewPanel(
      "copilotLens.graph",
      "Copilot Lens: Agent Graph",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "out", "webview")],
        retainContextWhenHidden: true,
      },
    );

    const instance = new GraphPanel(panel, extensionUri);
    GraphPanel.instance = instance;

    panel.webview.html = instance.getHtml(panel.webview);
    instance.updateGraph(graph);

    return instance;
  }

  updateGraph(graph: Graph): void {
    if (this.disposed) return;
    this.panel.webview.postMessage({ type: "update-graph", graph });
  }

  static updateIfOpen(graph: Graph): void {
    if (GraphPanel.instance && !GraphPanel.instance.disposed) {
      GraphPanel.instance.updateGraph(graph);
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "out", "webview", "graph.js"),
    );

    const nonce = getNonce();

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
  <title>Copilot Lens: Agent Graph</title>
  <style>
    html, body {
      margin: 0;
      overflow: hidden;
      width: 100vw;
      height: 100vh;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family);
    }
    graph-view {
      display: block;
      width: 100vw;
      height: 100vh;
    }
  </style>
</head>
<body>
  <graph-view></graph-view>
  <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
