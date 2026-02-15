import * as vscode from "vscode";
import type { Session, SessionProviderType } from "../models/session.js";
import { collectMetrics } from "../analyzers/metricsCollector.js";
import type { DefinedItem } from "../analyzers/metricsCollector.js";

type SourceFilter = SessionProviderType | "all";

export class MetricsPanel {
  private static instance: MetricsPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposed = false;

  private currentFilter: SourceFilter = "all";
  private cachedSessions: Session[] = [];
  private cachedAgents: DefinedItem[] = [];
  private cachedSkills: DefinedItem[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
  ) {
    this.panel = panel;

    this.panel.onDidDispose(() => {
      this.disposed = true;
      MetricsPanel.instance = undefined;
    });

    this.panel.webview.onDidReceiveMessage((msg) => {
      if (msg.type === "filter-change") {
        this.currentFilter = msg.provider;
        this.pushFilteredMetrics();
      }
    });
  }

  static show(
    extensionUri: vscode.Uri,
    sessions: Session[],
    agents: DefinedItem[],
    skills: DefinedItem[],
  ): MetricsPanel {
    if (MetricsPanel.instance && !MetricsPanel.instance.disposed) {
      MetricsPanel.instance.panel.reveal();
      MetricsPanel.instance.updateData(sessions, agents, skills);
      return MetricsPanel.instance;
    }

    const panel = vscode.window.createWebviewPanel(
      "agentLens.metrics",
      "Agent Lens: Metrics Dashboard",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, "out", "webview"),
        ],
        retainContextWhenHidden: true,
      },
    );

    const instance = new MetricsPanel(panel, extensionUri);
    MetricsPanel.instance = instance;

    panel.webview.html = instance.getHtml(panel.webview);
    instance.updateData(sessions, agents, skills);

    return instance;
  }

  updateData(
    sessions: Session[],
    agents: DefinedItem[],
    skills: DefinedItem[],
  ): void {
    if (this.disposed) return;
    this.cachedSessions = sessions;
    this.cachedAgents = agents;
    this.cachedSkills = skills;
    this.pushFilteredMetrics();
  }

  private pushFilteredMetrics(): void {
    const filtered =
      this.currentFilter === "all"
        ? this.cachedSessions
        : this.cachedSessions.filter(
            (s) => s.provider === this.currentFilter,
          );
    const metrics = collectMetrics(
      filtered,
      this.cachedAgents,
      this.cachedSkills,
    );
    this.panel.webview.postMessage({
      type: "update-metrics",
      metrics,
      activeFilter: this.currentFilter,
    });
  }

  static updateIfOpen(
    sessions: Session[],
    agents: DefinedItem[],
    skills: DefinedItem[],
  ): void {
    if (MetricsPanel.instance && !MetricsPanel.instance.disposed) {
      MetricsPanel.instance.updateData(sessions, agents, skills);
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "out", "webview", "metrics.js"),
    );

    const nonce = getNonce();

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
  <title>Agent Lens: Metrics</title>
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
  <metrics-dashboard></metrics-dashboard>
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
