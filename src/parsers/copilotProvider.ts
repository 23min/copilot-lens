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
import { getPlatformStorageRoot } from "./platformStorage.js";

/**
 * Read all session files from a single chatSessions directory.
 */
async function readSessionsFromDir(dir: string): Promise<Session[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      getLogger().debug(`  Session dir not found: "${dir}"`);
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      getLogger().warn(`  Cannot read session dir "${dir}": ${msg}`);
    }
    return [];
  }

  const sessions: Session[] = [];
  let emptyCount = 0;
  for (const entry of entries) {
    if (!entry.endsWith(".jsonl") && !entry.endsWith(".json")) continue;
    const filePath = path.join(dir, entry);
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const session = parseSessionJsonl(content);
      if (session.requests.length === 0) {
        emptyCount++;
      }
      sessions.push(session);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      getLogger().warn(`  Skipping session file "${filePath}": ${msg}`);
    }
  }
  if (emptyCount > 0) {
    getLogger().debug(`  Found ${sessions.length} session(s), ${emptyCount} empty (no requests)`);
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

interface ChatSessionsMatch {
  dir: string;
  workspaceUri: string;
}

/**
 * Scan a workspaceStorage root for chatSessions directories that match
 * the current workspace by folder name. Returns each match with its
 * workspace URI so callers can stamp matchedWorkspace on sessions.
 */
async function scanWorkspaceStorageRoot(
  workspaceStorageRoot: string,
  targetName: string,
): Promise<ChatSessionsMatch[]> {
  const log = getLogger();
  let hashDirs: string[];
  try {
    hashDirs = await fs.readdir(workspaceStorageRoot);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`  Cannot read storage root "${workspaceStorageRoot}": ${msg}`);
    return [];
  }

  log.debug(`  Scanning ${hashDirs.length} hash dir(s) for workspace "${targetName}"`);
  const matches: ChatSessionsMatch[] = [];
  for (const entry of hashDirs) {
    const candidateDir = path.join(workspaceStorageRoot, entry);
    const candidateUri = await readWorkspaceUri(candidateDir);
    if (!candidateUri) continue;

    if (workspaceName(candidateUri) === targetName) {
      matches.push({
        dir: path.join(candidateDir, "chatSessions"),
        workspaceUri: candidateUri,
      });
    }
  }
  return matches;
}

async function collectFromMatches(
  matches: ChatSessionsMatch[],
  scope: "workspace" | "fallback",
): Promise<Session[]> {
  const seen = new Set<string>();
  const sessions: Session[] = [];
  for (const { dir, workspaceUri } of matches) {
    const found = await readSessionsFromDir(dir);
    for (const s of found) {
      if (!seen.has(s.sessionId)) {
        seen.add(s.sessionId);
        s.scope = scope;
        s.matchedWorkspace = workspaceUri;
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

/**
 * Return the platform-native VS Code app storage root.
 * Re-exported from platformStorage for backwards compatibility.
 */
export { getPlatformStorageRoot } from "./platformStorage.js";

/**
 * Accumulate sessions into a pool, deduplicating by sessionId.
 */
function mergeInto(
  pool: Session[],
  seen: Set<string>,
  incoming: Session[],
): number {
  let added = 0;
  for (const s of incoming) {
    if (!seen.has(s.sessionId)) {
      seen.add(s.sessionId);
      pool.push(s);
      added++;
    }
  }
  return added;
}

export class CopilotSessionProvider implements SessionProvider {
  readonly name = "Copilot";

  /** Overridable for testing. */
  protected getPlatformStorageRoot(): string | null {
    return getPlatformStorageRoot();
  }

  async discoverSessions(ctx: SessionDiscoveryContext): Promise<Session[]> {
    const log = getLogger();
    const { extensionContext } = ctx;
    const ourName = await getWorkspaceFolderName(extensionContext);
    log.debug(`Copilot session discovery: workspace name = "${ourName ?? "(unknown)"}"`);

    const pool: Session[] = [];
    const seen = new Set<string>();

    // ── Strategy 1: user-configured sessionDir (complements, not overrides) ──
    const configDir = vscode.workspace
      .getConfiguration("agentLens")
      .get<string>("sessionDir");

    if (configDir) {
      log.debug(`Copilot strategy 1: user-configured sessionDir = "${configDir}"`);
      const direct = await readSessionsFromDir(configDir);
      if (direct.length > 0) {
        log.debug(`  Found ${direct.length} session(s) directly`);
        mergeInto(pool, seen, direct);
      } else if (ourName) {
        const matches = await scanWorkspaceStorageRoot(configDir, ourName);
        const scanned = await collectFromMatches(matches, "workspace");
        if (scanned.length > 0) {
          log.debug(`  Found ${scanned.length} session(s) via storage root scan`);
          mergeInto(pool, seen, scanned);
        }
      }
      if (pool.length === 0) {
        log.debug("  No sessions found via configured dir");
      }
    }

    // ── Strategy 2: primary location (current workspace hash) ──
    const primaryDir = getChatSessionsDir(extensionContext);
    if (primaryDir) {
      log.debug(`Copilot strategy 2: primary dir = "${primaryDir}"`);
      const primary = await readSessionsFromDir(primaryDir);
      if (primary.length > 0) {
        log.debug(`  Found ${primary.length} session(s)`);
        const hashDir = path.dirname(primaryDir);
        const uri = await readWorkspaceUri(hashDir);
        for (const s of primary) {
          s.scope = "workspace";
          if (uri) s.matchedWorkspace = uri;
        }
        mergeInto(pool, seen, primary);
      } else {
        log.debug("  No sessions found in primary dir");
      }
    } else {
      log.debug("Copilot strategy 2: skipped (no storageUri)");
    }

    // ── Strategy 3: sibling hash directories (stale hash recovery) ──
    if (ourName && extensionContext.storageUri) {
      const hashDir = path.dirname(extensionContext.storageUri.fsPath);
      const storageRoot = path.dirname(hashDir);
      log.debug(`Copilot strategy 3: scanning sibling dirs under "${storageRoot}"`);
      const matches = await scanWorkspaceStorageRoot(storageRoot, ourName);
      const result = await collectFromMatches(matches, "fallback");
      const added = mergeInto(pool, seen, result);
      log.debug(`  Found ${added} new session(s) via sibling scan (stale hash)`);
    }

    // ── Strategy 4: platform app storage root ──
    if (ourName) {
      const platformRoot = this.getPlatformStorageRoot();
      // Only probe if it's different from the storage root already scanned in strategy 3
      const currentStorageRoot = extensionContext.storageUri
        ? path.dirname(path.dirname(extensionContext.storageUri.fsPath))
        : null;

      if (platformRoot && platformRoot !== currentStorageRoot) {
        log.debug(`Copilot strategy 4: platform storage root = "${platformRoot}"`);
        const matches = await scanWorkspaceStorageRoot(platformRoot, ourName);
        const result = await collectFromMatches(matches, "workspace");
        const added = mergeInto(pool, seen, result);
        log.debug(`  Found ${added} new session(s) via platform storage root`);
      } else if (platformRoot) {
        log.debug("Copilot strategy 4: skipped (same as strategy 3 root)");
      } else {
        log.debug("Copilot strategy 4: skipped (unsupported platform)");
      }
    }

    log.debug(`Copilot: total ${pool.length} session(s) discovered`);
    return pool;
  }

  getWatchTargets(ctx: SessionDiscoveryContext): WatchTarget[] {
    const storageUri = ctx.extensionContext.storageUri;
    if (!storageUri) return [];

    // Anchor watcher to the workspace hash dir (parent of chatSessions/)
    // so it fires even when chatSessions/ doesn't exist yet at activation.
    const hashDir = path.dirname(storageUri.fsPath);
    return [
      {
        pattern: new vscode.RelativePattern(
          vscode.Uri.file(hashDir),
          "chatSessions/*.jsonl",
        ),
        events: ["create", "change"],
      },
    ];
  }
}
