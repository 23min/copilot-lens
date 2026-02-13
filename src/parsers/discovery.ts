import * as vscode from "vscode";
import * as fs from "node:fs/promises";
import { parseAgent } from "./agentParser.js";
import { parseSkill } from "./skillParser.js";
import type { Agent } from "../models/agent.js";
import type { Skill } from "../models/skill.js";

const AGENT_GLOB = "**/.github/agents/*.agent.md";
const SKILL_GLOB = "**/.github/skills/*/SKILL.md";

export async function discoverAgents(): Promise<Agent[]> {
  const uris = await vscode.workspace.findFiles(AGENT_GLOB);
  const agents: Agent[] = [];

  for (const uri of uris) {
    const content = await fs.readFile(uri.fsPath, "utf-8");
    const relativePath = vscode.workspace.asRelativePath(uri);
    const agent = parseAgent(content, relativePath);
    agent.fileUri = uri.toString();
    agents.push(agent);
  }

  return agents;
}

export async function discoverSkills(): Promise<Skill[]> {
  const uris = await vscode.workspace.findFiles(SKILL_GLOB);
  const skills: Skill[] = [];

  for (const uri of uris) {
    const content = await fs.readFile(uri.fsPath, "utf-8");
    const relativePath = vscode.workspace.asRelativePath(uri);
    const skill = parseSkill(content, relativePath);
    skill.fileUri = uri.toString();
    skills.push(skill);
  }

  return skills;
}
