import * as vscode from "vscode";
import type { Agent } from "../models/agent.js";
import type { Skill } from "../models/skill.js";

type TreeItemData =
  | { kind: "category"; label: string }
  | { kind: "agent"; agent: Agent }
  | { kind: "skill"; skill: Skill }
  | { kind: "detail"; label: string; description: string }
  | { kind: "action"; label: string; command: string; icon: string };

export class CopilotLensTreeProvider
  implements vscode.TreeDataProvider<TreeItemData>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private agents: Agent[] = [];
  private skills: Skill[] = [];
  private remoteNoSessions = false;

  update(
    agents: Agent[],
    skills: Skill[],
    opts?: { remoteNoSessions?: boolean },
  ): void {
    this.agents = agents;
    this.skills = skills;
    this.remoteNoSessions = opts?.remoteNoSessions ?? false;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeItemData): vscode.TreeItem {
    switch (element.kind) {
      case "category": {
        const item = new vscode.TreeItem(
          element.label,
          vscode.TreeItemCollapsibleState.Expanded,
        );
        item.contextValue = "category";
        return item;
      }
      case "agent": {
        const item = new vscode.TreeItem(
          element.agent.name,
          vscode.TreeItemCollapsibleState.Collapsed,
        );
        item.description = element.agent.description;
        item.contextValue = "agent";
        item.tooltip = element.agent.description;
        item.command = {
          command: "vscode.open",
          title: "Open Agent File",
          arguments: [element.agent.fileUri ? vscode.Uri.parse(element.agent.fileUri) : vscode.Uri.file(element.agent.filePath)],
        };
        return item;
      }
      case "skill": {
        const item = new vscode.TreeItem(
          element.skill.name,
          vscode.TreeItemCollapsibleState.None,
        );
        item.description = element.skill.description;
        item.contextValue = "skill";
        item.tooltip = element.skill.description;
        item.command = {
          command: "vscode.open",
          title: "Open Skill File",
          arguments: [element.skill.fileUri ? vscode.Uri.parse(element.skill.fileUri) : vscode.Uri.file(element.skill.filePath)],
        };
        return item;
      }
      case "detail": {
        const item = new vscode.TreeItem(
          element.label,
          vscode.TreeItemCollapsibleState.None,
        );
        item.description = element.description;
        return item;
      }
      case "action": {
        const item = new vscode.TreeItem(
          element.label,
          vscode.TreeItemCollapsibleState.None,
        );
        item.iconPath = new vscode.ThemeIcon(element.icon);
        item.command = {
          command: element.command,
          title: element.label,
        };
        return item;
      }
    }
  }

  getChildren(element?: TreeItemData): TreeItemData[] {
    if (!element) {
      // Return empty so VS Code renders viewsWelcome content
      if (this.remoteNoSessions) return [];

      const children: TreeItemData[] = [];
      children.push({ kind: "category", label: "Actions" });
      if (this.agents.length > 0) {
        children.push({ kind: "category", label: "Agents" });
      }
      if (this.skills.length > 0) {
        children.push({ kind: "category", label: "Skills" });
      }
      return children;
    }

    if (element.kind === "category" && element.label === "Actions") {
      return [
        { kind: "action", label: "Show Agent Graph", command: "copilotLens.showGraph", icon: "type-hierarchy" },
        { kind: "action", label: "Show Metrics Dashboard", command: "copilotLens.openMetrics", icon: "graph" },
        { kind: "action", label: "Session Explorer", command: "copilotLens.openSession", icon: "history" },
      ];
    }

    if (element.kind === "category" && element.label === "Agents") {
      return this.agents.map((agent) => ({ kind: "agent", agent }));
    }

    if (element.kind === "category" && element.label === "Skills") {
      return this.skills.map((skill) => ({ kind: "skill", skill }));
    }

    if (element.kind === "agent") {
      const details: TreeItemData[] = [];
      const { agent } = element;

      if (agent.tools.length > 0) {
        details.push({
          kind: "detail",
          label: "Tools",
          description: agent.tools.join(", "),
        });
      }
      if (agent.model.length > 0) {
        details.push({
          kind: "detail",
          label: "Models",
          description: agent.model.join(", "),
        });
      }
      for (const handoff of agent.handoffs) {
        details.push({
          kind: "detail",
          label: `→ ${handoff.agent}`,
          description: handoff.label,
        });
      }
      return details;
    }

    return [];
  }
}
