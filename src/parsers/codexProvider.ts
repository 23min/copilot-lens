import * as vscode from "vscode";
import * as fs from "node:fs/promises";
import { getCodexSessionsDir, discoverCodexSessions } from "./codexLocator.js";
import { parseCodexSessionJsonl } from "./codexSessionParser.js";
import type { Session } from "../models/session.js";
import type {
  SessionProvider,
  SessionDiscoveryContext,
  WatchTarget,
} from "./sessionProvider.js";
import { getLogger } from "../logger.js";

export class CodexSessionProvider implements SessionProvider {
  readonly name = "Codex";

  async discoverSessions(ctx: SessionDiscoveryContext): Promise<Session[]> {
    const log = getLogger();

    const configDir = vscode.workspace
      .getConfiguration("agentLens")
      .get<string>("codexDir");

    // Scan both configDir and default location, merge results
    const seen = new Set<string>();
    const allEntries = [];

    // 1. User-configured codexDir
    if (configDir) {
      log.info(`Codex: scanning configured codexDir = "${configDir}"`);
      const configEntries = await discoverCodexSessions(configDir);
      log.info(`  Found ${configEntries.length} session(s) via configured dir`);
      for (const entry of configEntries) {
        seen.add(entry.fullPath);
        allEntries.push(entry);
      }
    }

    // 2. Default location (CODEX_HOME or ~/.codex/sessions)
    const defaultDir = getCodexSessionsDir();
    const defaultEntries = await discoverCodexSessions(defaultDir);
    log.info(`  Found ${defaultEntries.length} session(s) via default path (${defaultDir})`);
    for (const entry of defaultEntries) {
      if (!seen.has(entry.fullPath)) {
        allEntries.push(entry);
      }
    }

    if (allEntries.length === 0) return [];

    log.info(`Codex: parsing ${allEntries.length} session(s)`);
    const sessions: Session[] = [];

    for (const entry of allEntries) {
      try {
        const content = await fs.readFile(entry.fullPath, "utf-8");
        const session = parseCodexSessionJsonl(content);
        if (session.requests.length > 0) {
          sessions.push(session);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn(`  Skipping Codex session "${entry.fullPath}": ${msg}`);
      }
    }

    for (const s of sessions) s.scope = "global";
    log.info(`Codex: parsed ${sessions.length} session(s)`);
    return sessions;
  }

  getWatchTargets(ctx: SessionDiscoveryContext): WatchTarget[] {
    const targets: WatchTarget[] = [];

    const configDir = vscode.workspace
      .getConfiguration("agentLens")
      .get<string>("codexDir");

    if (configDir) {
      targets.push({
        pattern: new vscode.RelativePattern(
          vscode.Uri.file(configDir),
          "**/*.jsonl",
        ),
        events: ["create", "change"],
      });
    }

    const defaultDir = getCodexSessionsDir();
    targets.push({
      pattern: new vscode.RelativePattern(
        vscode.Uri.file(defaultDir),
        "**/*.jsonl",
      ),
      events: ["create", "change"],
    });

    return targets;
  }
}
