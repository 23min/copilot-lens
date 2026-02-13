import * as vscode from "vscode";
import type { Agent } from "./models/agent.js";
import type { Skill } from "./models/skill.js";
import { discoverAgents, discoverSkills } from "./parsers/discovery.js";
import { buildGraph } from "./analyzers/graphBuilder.js";
import { CopilotLensTreeProvider } from "./views/treeProvider.js";
import { GraphPanel } from "./views/graphPanel.js";

let cachedAgents: Agent[] = [];
let cachedSkills: Skill[] = [];

async function refresh(treeProvider: CopilotLensTreeProvider): Promise<void> {
  const [agents, skills] = await Promise.all([
    discoverAgents(),
    discoverSkills(),
  ]);
  cachedAgents = agents;
  cachedSkills = skills;
  treeProvider.update(agents, skills);
}

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel("Copilot Lens");
  outputChannel.appendLine("Copilot Lens activated");

  const treeProvider = new CopilotLensTreeProvider();
  const treeView = vscode.window.createTreeView("copilotLens.treeView", {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });

  const refreshCmd = vscode.commands.registerCommand(
    "copilotLens.refresh",
    () => refresh(treeProvider),
  );

  const showGraph = vscode.commands.registerCommand(
    "copilotLens.showGraph",
    () => {
      const graph = buildGraph(cachedAgents, cachedSkills);
      GraphPanel.show(context.extensionUri, graph);
    },
  );

  context.subscriptions.push(outputChannel, treeView, refreshCmd, showGraph);

  // Initial scan
  void refresh(treeProvider);
}

export function deactivate(): void {
  // cleanup
}
