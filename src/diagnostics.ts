import * as path from "node:path";
import * as fs from "node:fs/promises";
import {
  encodeProjectPath,
  encodedPathVariants,
} from "./parsers/claudeLocator.js";
import { getCodexSessionsDir } from "./parsers/codexLocator.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiagnosticEnvironment {
  remoteName: string | null;
  workspacePath: string | null;
  storageUri: string | null;
  homeDir: string;
  platform: string;
  codexHome: string | null;
}

export interface DiagnosticSettings {
  sessionDir: string | null;
  claudeDir: string | null;
  codexDir: string | null;
}

export interface StrategyResult {
  name: string;
  path: string;
  accessible: boolean;
  details: string;
}

export interface ProviderDiagnostic {
  name: string;
  configuredDir: string | null;
  strategies: StrategyResult[];
  totalFiles: number;
}

export interface DiagnosticReport {
  timestamp: string;
  environment: DiagnosticEnvironment;
  providers: ProviderDiagnostic[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function isAccessible(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function countJsonlFiles(dir: string): Promise<number> {
  try {
    const entries = await fs.readdir(dir);
    return entries.filter((e) => e.endsWith(".jsonl") || e.endsWith(".json")).length;
  } catch {
    return 0;
  }
}

async function countJsonlFilesRecursive(dir: string): Promise<number> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    let count = 0;
    for (const entry of entries) {
      if (entry.isDirectory()) {
        count += await countJsonlFilesRecursive(path.join(dir, entry.name));
      } else if (entry.name.endsWith(".jsonl")) {
        count++;
      }
    }
    return count;
  } catch {
    return 0;
  }
}

/**
 * Read workspace.json from a hash dir to extract the workspace folder URI.
 */
async function readWorkspaceUri(hashDir: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(path.join(hashDir, "workspace.json"), "utf-8");
    const data = JSON.parse(raw);
    return data.folder ?? data.workspace ?? null;
  } catch {
    return null;
  }
}

function workspaceName(uri: string): string {
  const cleaned = uri.replace(/\/+$/, "");
  const lastSlash = cleaned.lastIndexOf("/");
  return lastSlash >= 0 ? cleaned.slice(lastSlash + 1) : cleaned;
}

// ---------------------------------------------------------------------------
// Provider diagnostics
// ---------------------------------------------------------------------------

async function diagnoseCopilot(
  env: DiagnosticEnvironment,
  settings: DiagnosticSettings,
): Promise<ProviderDiagnostic> {
  const strategies: StrategyResult[] = [];
  let totalFiles = 0;

  // Strategy 1: user-configured sessionDir
  if (settings.sessionDir) {
    const accessible = await isAccessible(settings.sessionDir);
    const fileCount = accessible ? await countJsonlFiles(settings.sessionDir) : 0;
    let details: string;

    if (!accessible) {
      details = "directory not accessible";
    } else if (fileCount > 0) {
      details = `${fileCount} session file(s) found directly`;
      totalFiles += fileCount;
    } else {
      // Try as workspaceStorage root
      const wsName = env.workspacePath ? path.basename(env.workspacePath) : null;
      if (wsName) {
        const { matched, total } = await scanStorageRootSummary(settings.sessionDir, wsName);
        details = `scanned as workspaceStorage root: ${total} hash dir(s), ${matched} matched "${wsName}"`;
        if (matched > 0) {
          // Count files in matched dirs
          const dirs = await findMatchingChatSessionsDirs(settings.sessionDir, wsName);
          for (const d of dirs) {
            totalFiles += await countJsonlFiles(d);
          }
          details += ` — ${totalFiles} session file(s)`;
        }
      } else {
        details = "0 session files, no workspace name to scan as storage root";
      }
    }

    strategies.push({
      name: "configDir",
      path: settings.sessionDir,
      accessible,
      details,
    });
  }

  // Strategy 2: primary hash dir from storageUri
  if (env.storageUri) {
    const hashDir = path.dirname(env.storageUri);
    const chatDir = path.join(hashDir, "chatSessions");
    const accessible = await isAccessible(chatDir);
    const fileCount = accessible ? await countJsonlFiles(chatDir) : 0;

    if (accessible && fileCount > 0) totalFiles += fileCount;

    strategies.push({
      name: "primaryHash",
      path: chatDir,
      accessible,
      details: accessible
        ? `${fileCount} session file(s)`
        : "chatSessions/ not found in current hash dir",
    });
  } else {
    strategies.push({
      name: "primaryHash",
      path: "(no storageUri available)",
      accessible: false,
      details: "skipped — VS Code did not provide a storageUri",
    });
  }

  // Strategy 3: sibling hash dir scan
  if (env.storageUri) {
    const hashDir = path.dirname(env.storageUri);
    const storageRoot = path.dirname(hashDir);
    const wsName = env.workspacePath ? path.basename(env.workspacePath) : null;

    if (wsName) {
      const { matched, total } = await scanStorageRootSummary(storageRoot, wsName);
      let siblingFiles = 0;
      if (matched > 0) {
        const dirs = await findMatchingChatSessionsDirs(storageRoot, wsName);
        for (const d of dirs) {
          siblingFiles += await countJsonlFiles(d);
        }
      }

      strategies.push({
        name: "siblingScan",
        path: storageRoot,
        accessible: true,
        details: `${total} hash dir(s), ${matched} matched "${wsName}" — ${siblingFiles} session file(s)`,
      });
    } else {
      strategies.push({
        name: "siblingScan",
        path: path.dirname(path.dirname(env.storageUri)),
        accessible: true,
        details: "skipped — no workspace name for matching",
      });
    }
  }

  return { name: "Copilot", configuredDir: settings.sessionDir, strategies, totalFiles };
}

async function scanStorageRootSummary(
  storageRoot: string,
  targetName: string,
): Promise<{ matched: number; total: number }> {
  try {
    const entries = await fs.readdir(storageRoot);
    let matched = 0;
    for (const entry of entries) {
      const uri = await readWorkspaceUri(path.join(storageRoot, entry));
      if (uri && workspaceName(uri) === targetName) matched++;
    }
    return { matched, total: entries.length };
  } catch {
    return { matched: 0, total: 0 };
  }
}

async function findMatchingChatSessionsDirs(
  storageRoot: string,
  targetName: string,
): Promise<string[]> {
  try {
    const entries = await fs.readdir(storageRoot);
    const dirs: string[] = [];
    for (const entry of entries) {
      const candidateDir = path.join(storageRoot, entry);
      const uri = await readWorkspaceUri(candidateDir);
      if (uri && workspaceName(uri) === targetName) {
        dirs.push(path.join(candidateDir, "chatSessions"));
      }
    }
    return dirs;
  } catch {
    return [];
  }
}

async function diagnoseClaude(
  env: DiagnosticEnvironment,
  settings: DiagnosticSettings,
): Promise<ProviderDiagnostic> {
  const strategies: StrategyResult[] = [];
  let totalFiles = 0;

  // Strategy 1: user-configured claudeDir
  if (settings.claudeDir) {
    const accessible = await isAccessible(settings.claudeDir);
    const fileCount = accessible ? await countJsonlFiles(settings.claudeDir) : 0;
    totalFiles += fileCount;

    strategies.push({
      name: "configDir",
      path: settings.claudeDir,
      accessible,
      details: accessible
        ? `${fileCount} .jsonl file(s)`
        : "directory not accessible",
    });
  }

  // Strategy 2: default path ~/.claude/projects/{encoded-path}
  if (env.workspacePath) {
    const claudeRoot = path.join(env.homeDir, ".claude", "projects");
    const variants = encodedPathVariants(env.workspacePath);

    for (const variant of variants) {
      const projectDir = path.join(claudeRoot, variant);
      const accessible = await isAccessible(projectDir);

      if (accessible) {
        // Check for sessions-index.json
        const indexPath = path.join(projectDir, "sessions-index.json");
        const hasIndex = await isAccessible(indexPath);
        let details: string;

        if (hasIndex) {
          try {
            const raw = await fs.readFile(indexPath, "utf-8");
            const data = JSON.parse(raw);
            const entryCount = Array.isArray(data?.entries) ? data.entries.length : 0;
            details = `sessions-index.json with ${entryCount} entry/entries`;
            totalFiles += entryCount;
          } catch {
            details = "sessions-index.json found but unreadable";
          }
        } else {
          const fileCount = await countJsonlFiles(projectDir);
          details = `${fileCount} .jsonl file(s) (no index)`;
          totalFiles += fileCount;
        }

        strategies.push({
          name: "defaultPath",
          path: projectDir,
          accessible: true,
          details,
        });
        break; // First match wins
      } else {
        strategies.push({
          name: "defaultPath",
          path: projectDir,
          accessible: false,
          details: "directory not found",
        });
      }
    }
  } else {
    strategies.push({
      name: "defaultPath",
      path: path.join(env.homeDir, ".claude", "projects", "(no workspace path)"),
      accessible: false,
      details: "skipped — no workspace path",
    });
  }

  return { name: "Claude", configuredDir: settings.claudeDir, strategies, totalFiles };
}

async function diagnoseCodex(
  env: DiagnosticEnvironment,
  settings: DiagnosticSettings,
): Promise<ProviderDiagnostic> {
  const strategies: StrategyResult[] = [];
  let totalFiles = 0;

  // Strategy 1: user-configured codexDir
  if (settings.codexDir) {
    const accessible = await isAccessible(settings.codexDir);
    const fileCount = accessible ? await countJsonlFilesRecursive(settings.codexDir) : 0;
    totalFiles += fileCount;

    strategies.push({
      name: "configDir",
      path: settings.codexDir,
      accessible,
      details: accessible
        ? `${fileCount} .jsonl file(s) (recursive)`
        : "directory not accessible",
    });
  }

  // Strategy 2: default path (CODEX_HOME or ~/.codex/sessions)
  const defaultDir = getCodexSessionsDir();
  const accessible = await isAccessible(defaultDir);
  const fileCount = accessible ? await countJsonlFilesRecursive(defaultDir) : 0;
  if (fileCount > totalFiles) totalFiles = fileCount; // Avoid double-counting if configDir == defaultDir

  const source = env.codexHome ? `CODEX_HOME (${env.codexHome})` : "~/.codex/sessions";
  strategies.push({
    name: "defaultPath",
    path: defaultDir,
    accessible,
    details: accessible
      ? `${fileCount} .jsonl file(s) (recursive) — via ${source}`
      : `directory not found — via ${source}`,
  });

  return { name: "Codex", configuredDir: settings.codexDir, strategies, totalFiles };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function collectDiagnostics(
  env: DiagnosticEnvironment,
  settings: DiagnosticSettings,
): Promise<DiagnosticReport> {
  const [copilot, claude, codex] = await Promise.all([
    diagnoseCopilot(env, settings),
    diagnoseClaude(env, settings),
    diagnoseCodex(env, settings),
  ]);

  return {
    timestamp: new Date().toISOString(),
    environment: env,
    providers: [copilot, claude, codex],
  };
}

export function formatDiagnosticReport(report: DiagnosticReport): string {
  const lines: string[] = [];
  const { environment: env } = report;

  lines.push("=== Agent Lens: Session Discovery Diagnostic ===");
  lines.push(`Timestamp: ${report.timestamp}`);
  lines.push("");
  lines.push("Environment:");
  lines.push(`  Remote:         ${env.remoteName ?? "(local)"}`);
  lines.push(`  Workspace:      ${env.workspacePath ?? "(none)"}`);
  lines.push(`  Storage URI:    ${env.storageUri ?? "(none)"}`);
  lines.push(`  Home:           ${env.homeDir}`);
  lines.push(`  Platform:       ${env.platform}`);
  lines.push(`  CODEX_HOME:     ${env.codexHome ?? "(not set)"}`);

  for (const provider of report.providers) {
    lines.push("");
    lines.push(`--- ${provider.name} ---`);
    lines.push(`  ${settingName(provider.name)} setting: ${provider.configuredDir ?? "(not set)"}`);

    for (const s of provider.strategies) {
      lines.push(`  [${s.name}] ${s.path}`);
      lines.push(`    ${s.accessible ? "Accessible" : "Not accessible"}: ${s.details}`);
    }

    lines.push(`  Total session files: ${provider.totalFiles}`);
  }

  lines.push("");
  lines.push("Run 'Agent Lens: Refresh' to re-scan with these paths.");
  return lines.join("\n");
}

function settingName(provider: string): string {
  switch (provider) {
    case "Copilot": return "sessionDir";
    case "Claude": return "claudeDir";
    case "Codex": return "codexDir";
    default: return "unknown";
  }
}
