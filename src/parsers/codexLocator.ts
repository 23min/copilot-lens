import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs/promises";

export interface CodexSessionEntry {
  fullPath: string;
}

/**
 * Determine the Codex sessions root directory.
 * Priority: configDir parameter > CODEX_HOME env > ~/.codex/sessions
 */
export function getCodexSessionsDir(configDir?: string): string {
  if (configDir) return configDir;
  const codexHome = process.env.CODEX_HOME;
  if (codexHome) return path.join(codexHome, "sessions");
  return path.join(os.homedir(), ".codex", "sessions");
}

/**
 * Recursively discover all .jsonl files under the given sessions directory.
 * Traverses the <provider_id>/<date>/ directory structure.
 */
export async function discoverCodexSessions(
  sessionsDir: string,
): Promise<CodexSessionEntry[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(sessionsDir);
  } catch {
    return [];
  }

  const results: CodexSessionEntry[] = [];
  for (const entry of entries) {
    const fullPath = path.join(sessionsDir, entry);
    let stat;
    try {
      stat = await fs.stat(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      // Recurse into subdirectories (provider_id, date folders)
      const nested = await discoverCodexSessions(fullPath);
      results.push(...nested);
    } else if (entry.endsWith(".jsonl")) {
      results.push({ fullPath });
    }
  }

  return results;
}
