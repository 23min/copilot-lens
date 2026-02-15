import * as vscode from "vscode";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { parseAgent } from "./agentParser.js";
import { parseSkill } from "./skillParser.js";
import type { Agent } from "../models/agent.js";
import type { Skill } from "../models/skill.js";
import { getLogger } from "../logger.js";

const COPILOT_AGENT_GLOB = "**/.github/agents/*.agent.md";
const CLAUDE_AGENT_GLOB = "**/.claude/agents/*.md";
const SKILL_GLOBS = [
  "**/.github/skills/*/SKILL.md",
  "**/.github/skills/*.skill.md",
  "**/.claude/skills/*/SKILL.md",
];

async function discoverCopilotAgents(): Promise<Agent[]> {
  const log = getLogger();
  const uris = await vscode.workspace.findFiles(COPILOT_AGENT_GLOB);
  log.info(`Copilot agent discovery: found ${uris.length} file(s)`);
  const agents: Agent[] = [];

  for (const uri of uris) {
    try {
      const content = await fs.readFile(uri.fsPath, "utf-8");
      const relativePath = vscode.workspace.asRelativePath(uri);
      const agent = parseAgent(content, relativePath, "copilot");
      agent.fileUri = uri.toString();
      agents.push(agent);
      log.info(`  Parsed Copilot agent: ${agent.name} (${relativePath})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn(`  Skipping Copilot agent ${uri.fsPath}: ${msg}`);
    }
  }

  return agents;
}

async function discoverClaudeProjectAgents(): Promise<Agent[]> {
  const log = getLogger();
  const uris = await vscode.workspace.findFiles(CLAUDE_AGENT_GLOB);
  log.info(`Claude project agent discovery: found ${uris.length} file(s)`);
  const agents: Agent[] = [];

  for (const uri of uris) {
    try {
      const content = await fs.readFile(uri.fsPath, "utf-8");
      const relativePath = vscode.workspace.asRelativePath(uri);
      const agent = parseAgent(content, relativePath, "claude");
      agent.fileUri = uri.toString();
      agents.push(agent);
      log.info(`  Parsed Claude agent: ${agent.name} (${relativePath})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn(`  Skipping Claude agent ${uri.fsPath}: ${msg}`);
    }
  }

  return agents;
}

async function discoverClaudeGlobalAgents(): Promise<Agent[]> {
  const log = getLogger();
  const globalDir = path.join(os.homedir(), ".claude", "agents");

  let entries: string[];
  try {
    entries = await fs.readdir(globalDir);
  } catch {
    log.info(`Claude global agent discovery: ${globalDir} not found`);
    return [];
  }

  const mdFiles = entries.filter((e) => e.endsWith(".md"));
  log.info(`Claude global agent discovery: found ${mdFiles.length} file(s) in ${globalDir}`);
  const agents: Agent[] = [];

  for (const file of mdFiles) {
    const filePath = path.join(globalDir, file);
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const agent = parseAgent(content, `~/.claude/agents/${file}`, "claude");
      agent.fileUri = vscode.Uri.file(filePath).toString();
      agents.push(agent);
      log.info(`  Parsed Claude global agent: ${agent.name} (~/.claude/agents/${file})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn(`  Skipping Claude global agent ${filePath}: ${msg}`);
    }
  }

  return agents;
}

export async function discoverAgents(): Promise<Agent[]> {
  const [copilotAgents, claudeProjectAgents, claudeGlobalAgents] =
    await Promise.all([
      discoverCopilotAgents(),
      discoverClaudeProjectAgents(),
      discoverClaudeGlobalAgents(),
    ]);

  // Deduplicate: project-level Claude agents take priority over global ones
  const projectNames = new Set(claudeProjectAgents.map((a) => a.name));
  const dedupedGlobal = claudeGlobalAgents.filter(
    (a) => !projectNames.has(a.name),
  );

  const agents = [...copilotAgents, ...claudeProjectAgents, ...dedupedGlobal];
  agents.sort((a, b) => a.name.localeCompare(b.name));
  return agents;
}

export async function discoverSkills(): Promise<Skill[]> {
  const log = getLogger();
  const uriArrays = await Promise.all(
    SKILL_GLOBS.map((g) => vscode.workspace.findFiles(g)),
  );
  const uris = uriArrays.flat();
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

  skills.sort((a, b) => a.name.localeCompare(b.name));
  return skills;
}
