import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { parseSessionJsonl } from "./sessionParser.js";
import type { Session } from "../models/session.js";

export function getChatSessionsDir(
  context: vscode.ExtensionContext,
): string | null {
  const storageUri = context.storageUri;
  if (!storageUri) return null;

  // storageUri = workspaceStorage/{hash}/copilot-lens/
  // Navigate up to workspace hash dir, then into chatSessions/
  const workspaceHashDir = path.dirname(storageUri.fsPath);
  return path.join(workspaceHashDir, "chatSessions");
}

/**
 * Read all session files from a single chatSessions directory.
 */
async function readSessionsFromDir(dir: string): Promise<Session[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
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
    } catch {
      // skip unreadable files
    }
  }
  return sessions;
}

/**
 * Extract the workspace folder URI from a workspace.json file.
 * Returns the folder/workspace path, or null if unreadable.
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
    // workspace.json has either "folder" or "workspace" key
    return data.folder ?? data.workspace ?? null;
  } catch {
    return null;
  }
}

/**
 * Extract the workspace folder name from a URI string.
 * Handles file://, vscode-remote://, and other schemes.
 * e.g. "vscode-remote://dev-container+.../home/user/my-project" → "my-project"
 */
function workspaceName(uri: string): string {
  // Strip trailing slash, then take last path segment
  const cleaned = uri.replace(/\/+$/, "");
  const lastSlash = cleaned.lastIndexOf("/");
  return lastSlash >= 0 ? cleaned.slice(lastSlash + 1) : cleaned;
}

/**
 * Find all chatSessions directories under workspaceStorage/ that belong
 * to the same workspace (by folder name). This handles devcontainers,
 * WSL2, and hash changes that create multiple storage directories for
 * the same project.
 */
async function findAllMatchingSessionDirs(
  context: vscode.ExtensionContext,
): Promise<string[]> {
  const storageUri = context.storageUri;
  if (!storageUri) return [];

  // workspaceStorage/{hash}/copilot-lens/ → workspaceStorage/
  const hashDir = path.dirname(storageUri.fsPath);
  const workspaceStorageRoot = path.dirname(hashDir);

  // Determine our workspace's folder name
  const ourUri = await readWorkspaceUri(hashDir);
  const ourName = ourUri
    ? workspaceName(ourUri)
    : vscode.workspace.workspaceFolders?.[0]?.name ?? null;
  if (!ourName) return [];

  let hashDirs: string[];
  try {
    hashDirs = await fs.readdir(workspaceStorageRoot);
  } catch {
    return [];
  }

  const dirs: string[] = [];

  for (const entry of hashDirs) {
    const candidateDir = path.join(workspaceStorageRoot, entry);
    const candidateUri = await readWorkspaceUri(candidateDir);
    if (!candidateUri) continue;

    if (workspaceName(candidateUri) === ourName) {
      const sessionsDir = path.join(candidateDir, "chatSessions");
      dirs.push(sessionsDir);
    }
  }

  return dirs;
}

export async function discoverSessions(
  context: vscode.ExtensionContext,
): Promise<Session[]> {
  // Try the primary location first (current workspace hash)
  const primaryDir = getChatSessionsDir(context);
  if (primaryDir) {
    const primary = await readSessionsFromDir(primaryDir);
    if (primary.length > 0) return primary;
  }

  // Fallback: scan all sibling hash directories for the same workspace.
  // This finds sessions when hash changes (devcontainer reconnects, WSL2,
  // workspace renames).
  const dirs = await findAllMatchingSessionDirs(context);
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
