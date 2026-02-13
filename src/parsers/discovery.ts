import * as vscode from "vscode";
import * as fs from "node:fs/promises";
import { parseAgent } from "./agentParser.js";
import { parseSkill } from "./skillParser.js";
import type { Agent } from "../models/agent.js";
import type { Skill } from "../models/skill.js";
import { getLogger } from "../logger.js";

const AGENT_GLOB = "**/.github/agents/*.agent.md";
const SKILL_GLOB = "**/.github/skills/*/SKILL.md";

export async function discoverAgents(): Promise<Agent[]> {
  const log = getLogger();
  const uris = await vscode.workspace.findFiles(AGENT_GLOB);
  log.info(`Agent discovery: found ${uris.length} file(s)`);
  const agents: Agent[] = [];

  for (const uri of uris) {
    try {
      const content = await fs.readFile(uri.fsPath, "utf-8");
      const relativePath = vscode.workspace.asRelativePath(uri);
      const agent = parseAgent(content, relativePath);
      agent.fileUri = uri.toString();
      agents.push(agent);
      log.info(`  Parsed agent: ${agent.name} (${relativePath})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn(`  Skipping agent ${uri.fsPath}: ${msg}`);
    }
  }

  return agents;
}

export async function discoverSkills(): Promise<Skill[]> {
  const log = getLogger();
  const uris = await vscode.workspace.findFiles(SKILL_GLOB);
  log.info(`Skill discovery: found ${uris.length} file(s)`);
  const skills: Skill[] = [];

  for (const uri of uris) {
    try {
      const content = await fs.readFile(uri.fsPath, "utf-8");
      const relativePath = vscode.workspace.asRelativePath(uri);
      const skill = parseSkill(content, relativePath);
      skill.fileUri = uri.toString();
      skills.push(skill);
      log.info(`  Parsed skill: ${skill.name} (${relativePath})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn(`  Skipping skill ${uri.fsPath}: ${msg}`);
    }
  }

  return skills;
}
