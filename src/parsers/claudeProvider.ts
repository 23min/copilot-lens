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

    // Scan both user-configured dir and default location, merge results
    const configDir = vscode.workspace
      .getConfiguration("agentLens")
      .get<string>("claudeDir");

    let entries = [];

    // 1. User-configured claudeDir (for devcontainers with mounts)
    if (configDir) {
      log.debug(`Claude: scanning configured claudeDir = "${configDir}"`);
      const configEntries = await discoverClaudeSessionsInDir(configDir, workspacePath);
      log.debug(`  Found ${configEntries.length} session(s) via configured dir`);
      entries.push(...configEntries);
    }

    // 2. Default: ~/.claude/projects/{encoded-path}
    if (workspacePath) {
      const defaultEntries = await discoverClaudeSessions(workspacePath);
      log.debug(`  Found ${defaultEntries.length} session(s) via default path`);
      // Deduplicate by file path
      const seen = new Set(entries.map((e) => e.fullPath));
      for (const entry of defaultEntries) {
        if (!seen.has(entry.fullPath)) {
          entries.push(entry);
        }
      }
    }

    if (entries.length === 0) {
      if (!workspacePath && !configDir) {
        log.debug("Claude: no workspace path and no claudeDir configured, skipping");
      }
      return [];
    }

    log.debug(`Claude: parsing ${entries.length} session(s)`);
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

    log.debug(`Claude: parsed ${sessions.length} session(s)`);
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
