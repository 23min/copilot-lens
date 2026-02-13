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

export async function discoverSessions(
  context: vscode.ExtensionContext,
): Promise<Session[]> {
  const dir = getChatSessionsDir(context);
  if (!dir) return [];

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
