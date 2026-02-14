import * as vscode from "vscode";
import * as os from "node:os";
import * as path from "node:path";
import { discoverClaudeSessions, encodeProjectPath } from "./claudeLocator.js";
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
    if (entries.length > 0) {
      log.info(
        `Claude: found ${entries.length} session(s) (parser not yet implemented)`,
      );
      // TODO (#5): parse Claude session JSONL files into Session objects
    }

    return [];
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
