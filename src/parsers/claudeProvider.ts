import * as vscode from "vscode";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import {
  discoverClaudeSessions,
  discoverClaudeSessionsInDir,
  encodeProjectPath,
} from "./claudeLocator.js";
import {
  parseClaudeSessionJsonl,
  buildSubagentTypeMap,
} from "./claudeSessionParser.js";
import type { SubagentInput } from "./claudeSessionParser.js";
import type { Session } from "../models/session.js";
import type {
  SessionProvider,
  SessionDiscoveryContext,
  WatchTarget,
} from "./sessionProvider.js";
import { getLogger } from "../logger.js";

export class ClaudeSessionProvider implements SessionProvider {
  readonly name = "Claude";

  async discoverSessions(ctx: SessionDiscoveryContext): Promise<Session[]> {
    const log = getLogger();
    const { workspacePath } = ctx;

    // 1. Check user-configured claudeDir first (for devcontainers with mounts)
    const configDir = vscode.workspace
      .getConfiguration("agentLens")
      .get<string>("claudeDir");

    let entries;
    if (configDir) {
      log.info(`Claude strategy 1: user-configured claudeDir = "${configDir}"`);
      entries = await discoverClaudeSessionsInDir(configDir, workspacePath);
      if (entries.length > 0) {
        log.info(`  Found ${entries.length} session(s) via configured dir`);
      } else {
        log.info("  No sessions found via configured dir, falling back");
        entries = null;
      }
    }

    // 2. Default: use ~/.claude/projects/{encoded-path}
    if (!entries) {
      if (!workspacePath) {
        log.info("Claude: no workspace path, skipping");
        return [];
      }
      entries = await discoverClaudeSessions(workspacePath);
    }
    if (entries.length === 0) return [];

    log.info(`Claude: parsing ${entries.length} session(s)`);
    const sessions: Session[] = [];

    for (const entry of entries) {
      try {
        const content = await fs.readFile(entry.fullPath, "utf-8");

        // Build agentId -> subagentType mapping from main session
        const typeMap = buildSubagentTypeMap(content);

        // Read subagent files
        const subagents: SubagentInput[] = [];
        for (const subPath of entry.subagentPaths) {
          try {
            const subContent = await fs.readFile(subPath, "utf-8");
            const agentId = path
              .basename(subPath, ".jsonl")
              .replace(/^agent-/, "");
            subagents.push({
              content: subContent,
              agentId,
              subagentType: typeMap.get(agentId) ?? null,
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            log.warn(`  Skipping subagent file "${subPath}": ${msg}`);
          }
        }

        const session = parseClaudeSessionJsonl(
          content,
          entry.summary,
          subagents.length > 0 ? subagents : undefined,
        );
        sessions.push(session);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn(`  Skipping Claude session "${entry.fullPath}": ${msg}`);
      }
    }

    log.info(`Claude: parsed ${sessions.length} session(s)`);
    return sessions;
  }

  getWatchTargets(ctx: SessionDiscoveryContext): WatchTarget[] {
    const { workspacePath } = ctx;
    const targets: WatchTarget[] = [];

    // Watch user-configured dir if set
    const configDir = vscode.workspace
      .getConfiguration("agentLens")
      .get<string>("claudeDir");
    if (configDir) {
      targets.push(
        {
          pattern: new vscode.RelativePattern(
            vscode.Uri.file(configDir),
            "**/*.jsonl",
          ),
          events: ["create", "change"],
        },
      );
    }

    // Watch default location
    if (workspacePath) {
      const encoded = encodeProjectPath(workspacePath);
      const claudeProjectDir = path.join(
        os.homedir(),
        ".claude",
        "projects",
        encoded,
      );

      targets.push(
        {
          pattern: new vscode.RelativePattern(
            vscode.Uri.file(claudeProjectDir),
            "*.jsonl",
          ),
          events: ["create", "change"],
        },
        {
          pattern: new vscode.RelativePattern(
            vscode.Uri.file(claudeProjectDir),
            "*/subagents/agent-*.jsonl",
          ),
          events: ["create", "change"],
        },
      );
    }

    return targets;
  }
}
