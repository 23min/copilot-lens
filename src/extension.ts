import * as vscode from "vscode";
import type { Agent } from "./models/agent.js";
import type { Skill } from "./models/skill.js";
import type { Session } from "./models/session.js";
import { discoverAgents, discoverSkills } from "./parsers/discovery.js";
import {
  registerSessionProvider,
  discoverAllSessions,
  collectWatchTargets,
} from "./parsers/sessionRegistry.js";
import type { SessionDiscoveryContext } from "./parsers/sessionProvider.js";
import { CopilotSessionProvider } from "./parsers/copilotProvider.js";
import { ClaudeSessionProvider } from "./parsers/claudeProvider.js";
import { buildGraph } from "./analyzers/graphBuilder.js";
import { CopilotLensTreeProvider } from "./views/treeProvider.js";
import { initLogger, getLogger } from "./logger.js";
import { GraphPanel } from "./views/graphPanel.js";
import { MetricsPanel } from "./views/metricsPanel.js";
import { SessionPanel } from "./views/sessionPanel.js";
import { SetupPanel } from "./views/setupPanel.js";

let cachedAgents: Agent[] = [];
let cachedSkills: Skill[] = [];
let cachedSessions: Session[] = [];

async function refresh(
  sessionCtx: SessionDiscoveryContext,
  treeProvider: CopilotLensTreeProvider,
): Promise<void> {
  const log = getLogger();
  const start = Date.now();
  log.info("Refresh started");

  try {
    const [agents, skills, sessions] = await Promise.all([
      discoverAgents(),
      discoverSkills(),
      discoverAllSessions(sessionCtx),
    ]);
    cachedAgents = agents;
    cachedSkills = skills;
    cachedSessions = sessions;

    // Detect remote/container context with no sessions
    const isRemote = !!vscode.env.remoteName;
    const remoteNoSessions = isRemote && sessions.length === 0;
    void vscode.commands.executeCommand(
      "setContext",
      "copilotLens.isRemoteNoSessions",
      remoteNoSessions,
    );

    treeProvider.update(agents, skills, { remoteNoSessions });

    // Push fresh data to any open panels (without stealing focus)
    GraphPanel.updateIfOpen(buildGraph(agents, skills));
    MetricsPanel.updateIfOpen(
      sessions,
      agents.map((a) => a.name),
      skills.map((s) => s.name),
    );
    SessionPanel.updateIfOpen(sessions);

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
  const outputChannel = vscode.window.createOutputChannel("Copilot Lens", { log: true });
  initLogger(outputChannel);
  getLogger().info("Copilot Lens activated");

  // Register session providers
  registerSessionProvider(new CopilotSessionProvider());
  registerSessionProvider(new ClaudeSessionProvider());

  const sessionCtx: SessionDiscoveryContext = {
    extensionContext: context,
    workspacePath:
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null,
  };

  const treeProvider = new CopilotLensTreeProvider();
  const treeView = vscode.window.createTreeView("copilotLens.treeView", {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });

  const refreshCmd = vscode.commands.registerCommand(
    "copilotLens.refresh",
    () => refresh(sessionCtx, treeProvider),
  );

  const showGraph = vscode.commands.registerCommand(
    "copilotLens.showGraph",
    async () => {
      await refresh(sessionCtx, treeProvider);
      const graph = buildGraph(cachedAgents, cachedSkills);
      GraphPanel.show(context.extensionUri, graph);
    },
  );

  const openMetrics = vscode.commands.registerCommand(
    "copilotLens.openMetrics",
    async () => {
      await refresh(sessionCtx, treeProvider);
      MetricsPanel.show(
        context.extensionUri,
        cachedSessions,
        cachedAgents.map((a) => a.name),
        cachedSkills.map((s) => s.name),
      );
    },
  );

  const openSession = vscode.commands.registerCommand(
    "copilotLens.openSession",
    async () => {
      await refresh(sessionCtx, treeProvider);
      SessionPanel.show(context.extensionUri, cachedSessions);
    },
  );

  const openContainerSetup = vscode.commands.registerCommand(
    "copilotLens.openContainerSetup",
    () => {
      SetupPanel.show(context.extensionUri);
    },
  );

  // File watchers — auto-refresh on agent/skill/session changes
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  function scheduleRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => refresh(sessionCtx, treeProvider), 500);
  }

  const agentWatcher = vscode.workspace.createFileSystemWatcher(
    "**/.github/agents/*.agent.md",
  );
  const skillWatcher = vscode.workspace.createFileSystemWatcher(
    "**/.github/skills/*/SKILL.md",
  );
  const skillFlatWatcher = vscode.workspace.createFileSystemWatcher(
    "**/.github/skills/*.skill.md",
  );

  agentWatcher.onDidCreate(scheduleRefresh);
  agentWatcher.onDidChange(scheduleRefresh);
  agentWatcher.onDidDelete(scheduleRefresh);
  skillWatcher.onDidCreate(scheduleRefresh);
  skillWatcher.onDidChange(scheduleRefresh);
  skillWatcher.onDidDelete(scheduleRefresh);
  skillFlatWatcher.onDidCreate(scheduleRefresh);
  skillFlatWatcher.onDidChange(scheduleRefresh);
  skillFlatWatcher.onDidDelete(scheduleRefresh);

  context.subscriptions.push(
    outputChannel,
    treeView,
    refreshCmd,
    showGraph,
    openMetrics,
    openSession,
    openContainerSetup,
    agentWatcher,
    skillWatcher,
    skillFlatWatcher,
  );

  // Watch session files from all providers
  for (const target of collectWatchTargets(sessionCtx)) {
    const watcher = vscode.workspace.createFileSystemWatcher(target.pattern);
    if (target.events.includes("create")) watcher.onDidCreate(scheduleRefresh);
    if (target.events.includes("change")) watcher.onDidChange(scheduleRefresh);
    if (target.events.includes("delete")) watcher.onDidDelete(scheduleRefresh);
    context.subscriptions.push(watcher);
  }

  // Initial scan
  void refresh(sessionCtx, treeProvider);
}

export function deactivate(): void {
  // cleanup
}
