import type * as vscode from "vscode";
import type { Session } from "../models/session.js";

export interface SessionDiscoveryContext {
  extensionContext: vscode.ExtensionContext;
  workspacePath: string | null;
}

export interface WatchTarget {
  pattern: vscode.RelativePattern | vscode.GlobPattern;
  events: ("create" | "change" | "delete")[];
}

export interface SessionProvider {
  readonly name: string;
  discoverSessions(ctx: SessionDiscoveryContext): Promise<Session[]>;
  getWatchTargets?(ctx: SessionDiscoveryContext): WatchTarget[];
}
