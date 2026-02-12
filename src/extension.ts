import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel("Copilot Lens");
  outputChannel.appendLine("Copilot Lens activated");

  const showGraph = vscode.commands.registerCommand(
    "copilotLens.showGraph",
    () => {
      vscode.window.showInformationMessage("Copilot Lens: Graph coming soon!");
    },
  );

  context.subscriptions.push(outputChannel, showGraph);
}

export function deactivate(): void {
  // cleanup
}
