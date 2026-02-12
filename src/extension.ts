import * as vscode from "vscode";
import { discoverAgents, discoverSkills } from "./parsers/discovery.js";
import { CopilotLensTreeProvider } from "./views/treeProvider.js";

async function refresh(treeProvider: CopilotLensTreeProvider): Promise<void> {
  const [agents, skills] = await Promise.all([
    discoverAgents(),
    discoverSkills(),
  ]);
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
      vscode.window.showInformationMessage("Copilot Lens: Graph coming soon!");
    },
  );

  context.subscriptions.push(outputChannel, treeView, refreshCmd, showGraph);

  // Initial scan
  void refresh(treeProvider);
}

export function deactivate(): void {
  // cleanup
}
