import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { parseSessionJsonl } from "./sessionParser.js";
import type { Session } from "../models/session.js";
import type {
  SessionProvider,
  SessionDiscoveryContext,
  WatchTarget,
} from "./sessionProvider.js";
import { getLogger } from "../logger.js";

/**
 * Read all session files from a single chatSessions directory.
 */
async function readSessionsFromDir(dir: string): Promise<Session[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    getLogger().warn(`  Cannot read session dir "${dir}": ${msg}`);
    return [];
  }

  const sessions: Session[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".jsonl") && !entry.endsWith(".json")) continue;
    const filePath = path.join(dir, entry);
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const session = parseSessionJsonl(content);
      sessions.push(session);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      getLogger().warn(`  Skipping session file "${filePath}": ${msg}`);
    }
  }
  return sessions;
}

/**
 * Extract the workspace folder URI from a workspace.json file.
 */
async function readWorkspaceUri(
  hashDir: string,
): Promise<string | null> {
  try {
    const raw = await fs.readFile(
      path.join(hashDir, "workspace.json"),
      "utf-8",
    );
    const data = JSON.parse(raw);
    return data.folder ?? data.workspace ?? null;
  } catch {
    return null;
  }
}

/**
 * Extract the workspace folder name from a URI string.
 */
function workspaceName(uri: string): string {
  const cleaned = uri.replace(/\/+$/, "");
  const lastSlash = cleaned.lastIndexOf("/");
  return lastSlash >= 0 ? cleaned.slice(lastSlash + 1) : cleaned;
}

/**
 * Scan a workspaceStorage root for chatSessions directories that match
 * the current workspace by folder name.
 */
async function scanWorkspaceStorageRoot(
  workspaceStorageRoot: string,
  targetName: string,
): Promise<string[]> {
  const log = getLogger();
  let hashDirs: string[];
  try {
    hashDirs = await fs.readdir(workspaceStorageRoot);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`  Cannot read storage root "${workspaceStorageRoot}": ${msg}`);
    return [];
  }

  log.info(`  Scanning ${hashDirs.length} hash dir(s) for workspace "${targetName}"`);
  const dirs: string[] = [];
  for (const entry of hashDirs) {
    const candidateDir = path.join(workspaceStorageRoot, entry);
    const candidateUri = await readWorkspaceUri(candidateDir);
    if (!candidateUri) continue;

    if (workspaceName(candidateUri) === targetName) {
      dirs.push(path.join(candidateDir, "chatSessions"));
    }
  }
  return dirs;
}

async function collectFromDirs(dirs: string[]): Promise<Session[]> {
  const seen = new Set<string>();
  const sessions: Session[] = [];
  for (const dir of dirs) {
    const found = await readSessionsFromDir(dir);
    for (const s of found) {
      if (!seen.has(s.sessionId)) {
        seen.add(s.sessionId);
        sessions.push(s);
      }
    }
  }
  return sessions;
}

/**
 * Get the current workspace's folder name for matching.
 */
async function getWorkspaceFolderName(
  context: vscode.ExtensionContext,
): Promise<string | null> {
  const storageUri = context.storageUri;
  if (storageUri) {
    const hashDir = path.dirname(storageUri.fsPath);
    const ourUri = await readWorkspaceUri(hashDir);
    if (ourUri) return workspaceName(ourUri);
  }
  return vscode.workspace.workspaceFolders?.[0]?.name ?? null;
}

function getChatSessionsDir(
  context: vscode.ExtensionContext,
): string | null {
  const storageUri = context.storageUri;
  if (!storageUri) return null;
  const workspaceHashDir = path.dirname(storageUri.fsPath);
  return path.join(workspaceHashDir, "chatSessions");
}

export class CopilotSessionProvider implements SessionProvider {
  readonly name = "Copilot";

  async discoverSessions(ctx: SessionDiscoveryContext): Promise<Session[]> {
    const log = getLogger();
    const { extensionContext } = ctx;
    const ourName = await getWorkspaceFolderName(extensionContext);
    log.info(`Copilot session discovery: workspace name = "${ourName ?? "(unknown)"}"`);

    // 1. Check user-configured sessionDir first (for devcontainers with mounts)
    const configDir = vscode.workspace
      .getConfiguration("copilotLens")
      .get<string>("sessionDir");

    if (configDir) {
      log.info(`Copilot strategy 1: user-configured sessionDir = "${configDir}"`);
      const direct = await readSessionsFromDir(configDir);
      if (direct.length > 0) {
        log.info(`  Found ${direct.length} session(s) directly`);
        return direct;
      }

      if (ourName) {
        const scanned = await collectFromDirs(
          await scanWorkspaceStorageRoot(configDir, ourName),
        );
        if (scanned.length > 0) {
          log.info(`  Found ${scanned.length} session(s) via storage root scan`);
          return scanned;
        }
      }
      log.info("  No sessions found via configured dir");
    }

    // 2. Try primary location (current workspace hash)
    const primaryDir = getChatSessionsDir(extensionContext);
    if (primaryDir) {
      log.info(`Copilot strategy 2: primary dir = "${primaryDir}"`);
      const primary = await readSessionsFromDir(primaryDir);
      if (primary.length > 0) {
        log.info(`  Found ${primary.length} session(s)`);
        return primary;
      }
      log.info("  No sessions found in primary dir");
    } else {
      log.info("Copilot strategy 2: skipped (no storageUri)");
    }

    // 3. Fallback: scan sibling hash directories for the same workspace
    if (ourName && extensionContext.storageUri) {
      const hashDir = path.dirname(extensionContext.storageUri.fsPath);
      const storageRoot = path.dirname(hashDir);
      log.info(`Copilot strategy 3: scanning sibling dirs under "${storageRoot}"`);
      const result = await collectFromDirs(
        await scanWorkspaceStorageRoot(storageRoot, ourName),
      );
      log.info(`  Found ${result.length} session(s) via sibling scan`);
      return result;
    }

    log.info("Copilot: no sessions found");
    return [];
  }

  getWatchTargets(ctx: SessionDiscoveryContext): WatchTarget[] {
    const sessionDir = getChatSessionsDir(ctx.extensionContext);
    if (!sessionDir) return [];

    return [
      {
        pattern: new vscode.RelativePattern(
          vscode.Uri.file(sessionDir),
          "*.jsonl",
        ),
        events: ["create", "change"],
      },
    ];
  }
}
