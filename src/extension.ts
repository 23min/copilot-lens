import * as vscode from "vscode";
import type { Agent } from "./models/agent.js";
import type { Skill } from "./models/skill.js";
import type { Session } from "./models/session.js";
import { discoverAgents, discoverSkills } from "./parsers/discovery.js";
import { discoverSessions } from "./parsers/sessionLocator.js";
import { buildGraph } from "./analyzers/graphBuilder.js";
import { collectMetrics } from "./analyzers/metricsCollector.js";
import { CopilotLensTreeProvider } from "./views/treeProvider.js";
import { initLogger, getLogger } from "./logger.js";
import { GraphPanel } from "./views/graphPanel.js";
import { MetricsPanel } from "./views/metricsPanel.js";
import { SessionPanel } from "./views/sessionPanel.js";

let cachedAgents: Agent[] = [];
let cachedSkills: Skill[] = [];
let cachedSessions: Session[] = [];

async function refresh(
  context: vscode.ExtensionContext,
  treeProvider: CopilotLensTreeProvider,
): Promise<void> {
  const log = getLogger();
  const start = Date.now();
  log.info("Refresh started");

  try {
    const [agents, skills, sessions] = await Promise.all([
      discoverAgents(),
      discoverSkills(),
      discoverSessions(context),
    ]);
    cachedAgents = agents;
    cachedSkills = skills;
    cachedSessions = sessions;
    treeProvider.update(agents, skills);

    const elapsed = Date.now() - start;
    log.info(
      `Refresh complete in ${elapsed}ms — ${agents.length} agents, ${skills.length} skills, ${sessions.length} sessions`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error(`Refresh failed: ${msg}`);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel("Copilot Lens");
  initLogger(outputChannel);
  getLogger().info("Copilot Lens activated");

  const treeProvider = new CopilotLensTreeProvider();
  const treeView = vscode.window.createTreeView("copilotLens.treeView", {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });

  const refreshCmd = vscode.commands.registerCommand(
    "copilotLens.refresh",
    () => refresh(context, treeProvider),
  );

  const showGraph = vscode.commands.registerCommand(
    "copilotLens.showGraph",
    () => {
      const graph = buildGraph(cachedAgents, cachedSkills);
      GraphPanel.show(context.extensionUri, graph);
    },
  );

  const openMetrics = vscode.commands.registerCommand(
    "copilotLens.openMetrics",
    () => {
      const metrics = collectMetrics(
        cachedSessions,
        cachedAgents.map((a) => a.name),
        cachedSkills.map((s) => s.name),
      );
      MetricsPanel.show(context.extensionUri, metrics);
    },
  );

  const openSession = vscode.commands.registerCommand(
    "copilotLens.openSession",
    () => {
      SessionPanel.show(context.extensionUri, cachedSessions);
    },
  );

  context.subscriptions.push(
    outputChannel,
    treeView,
    refreshCmd,
    showGraph,
    openMetrics,
    openSession,
  );

  // Initial scan
  void refresh(context, treeProvider);
}

export function deactivate(): void {
  // cleanup
}
