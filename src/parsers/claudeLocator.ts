import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { getLogger } from "../logger.js";

export interface ClaudeSessionEntry {
  sessionId: string;
  fullPath: string;
  summary: string | null;
  messageCount: number;
  created: string;
  modified: string;
  gitBranch: string;
}

/**
 * Encode a workspace path the way Claude Code does:
 * `/Users/peterbru/project` → `-Users-peterbru-project`
 */
export function encodeProjectPath(workspacePath: string): string {
  return workspacePath.replace(/\/+$/, "").replace(/\//g, "-");
}

/**
 * Parse a Claude Code sessions-index.json file.
 * Returns an empty array on any error.
 */
export function parseSessionIndex(raw: string): ClaudeSessionEntry[] {
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data?.entries)) return [];
    return data.entries.map(
      (e: Record<string, unknown>): ClaudeSessionEntry => ({
        sessionId: String(e.sessionId ?? ""),
        fullPath: String(e.fullPath ?? ""),
        summary: e.summary ? String(e.summary) : null,
        messageCount: Number(e.messageCount ?? 0),
        created: String(e.created ?? ""),
        modified: String(e.modified ?? ""),
        gitBranch: String(e.gitBranch ?? ""),
      }),
    );
  } catch {
    return [];
  }
}

/**
 * Discover Claude Code session files for a given workspace path.
 * Returns the list of JSONL file paths and their index metadata.
 */
export async function discoverClaudeSessions(
  workspacePath: string,
): Promise<ClaudeSessionEntry[]> {
  const log = getLogger();
  const claudeRoot = path.join(os.homedir(), ".claude", "projects");
  const encoded = encodeProjectPath(workspacePath);
  const projectDir = path.join(claudeRoot, encoded);

  log.info(`Claude session discovery: looking for "${encoded}" in ${claudeRoot}`);

  // Check if the project directory exists
  try {
    await fs.access(projectDir);
  } catch {
    log.info("  No Claude project directory found");
    return [];
  }

  // Read sessions-index.json
  const indexPath = path.join(projectDir, "sessions-index.json");
  try {
    const raw = await fs.readFile(indexPath, "utf-8");
    const entries = parseSessionIndex(raw);
    log.info(`  Found ${entries.length} session(s) in index`);

    // Verify each session file exists
    const verified: ClaudeSessionEntry[] = [];
    for (const entry of entries) {
      try {
        await fs.access(entry.fullPath);
        verified.push(entry);
      } catch {
        log.warn(`  Session file missing: ${entry.fullPath}`);
      }
    }

    log.info(`  Verified ${verified.length} session file(s)`);
    return verified;
  } catch {
    log.info("  No sessions-index.json found, scanning directory");
  }

  // Fallback: scan for JSONL files directly
  try {
    const files = await fs.readdir(projectDir);
    const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));
    log.info(`  Found ${jsonlFiles.length} JSONL file(s) by scan`);

    return jsonlFiles.map((f) => ({
      sessionId: f.replace(/\.jsonl$/, ""),
      fullPath: path.join(projectDir, f),
      summary: null,
      messageCount: 0,
      created: "",
      modified: "",
      gitBranch: "",
    }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`  Cannot read Claude project dir: ${msg}`);
    return [];
  }
}
