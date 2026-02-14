import * as vscode from "vscode";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { discoverClaudeSessions, encodeProjectPath } from "./claudeLocator.js";
import { parseClaudeSessionJsonl } from "./claudeSessionParser.js";
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

    if (!workspacePath) {
      log.info("Claude: no workspace path, skipping");
      return [];
    }

    const entries = await discoverClaudeSessions(workspacePath);
    if (entries.length === 0) return [];

    log.info(`Claude: parsing ${entries.length} session(s)`);
    const sessions: Session[] = [];

    for (const entry of entries) {
      try {
        const content = await fs.readFile(entry.fullPath, "utf-8");
        const session = parseClaudeSessionJsonl(
          content,
          entry.summary,
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
    if (!workspacePath) return [];

    const encoded = encodeProjectPath(workspacePath);
    const claudeProjectDir = path.join(
      os.homedir(),
      ".claude",
      "projects",
      encoded,
    );

    return [
      {
        pattern: new vscode.RelativePattern(
          vscode.Uri.file(claudeProjectDir),
          "*.jsonl",
        ),
        events: ["create", "change"],
      },
    ];
  }
}
