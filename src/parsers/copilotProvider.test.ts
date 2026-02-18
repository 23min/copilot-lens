import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";

// Mock fs and vscode before importing the module under test
vi.mock("node:fs/promises", () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
  access: vi.fn(),
}));

vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: vi.fn().mockReturnValue({ get: vi.fn().mockReturnValue(null) }),
    workspaceFolders: null,
  },
  window: {
    showInformationMessage: vi.fn(),
  },
  RelativePattern: vi.fn(),
  Uri: { file: vi.fn((p: string) => ({ fsPath: p })) },
}));

const mockReaddir = vi.mocked(fs.readdir);
const mockReadFile = vi.mocked(fs.readFile);

// We test the internal helpers through their effects on the public
// discoverSessions() method, using a minimal fake ExtensionContext.
import { CopilotSessionProvider, getPlatformStorageRoot } from "./copilotProvider.js";
import type { SessionDiscoveryContext } from "./sessionProvider.js";
import * as vscode from "vscode";

const STORAGE_ROOT = "/home/vscode/.vscode-server/data/User/workspaceStorage";
const CURRENT_HASH = "aaaa1111";
const STALE_HASH = "bbbb2222";
const WORKSPACE_NAME = "my-project";
const WORKSPACE_URI = `file:///workspaces/${WORKSPACE_NAME}`;

function makeCtx(storageHash = CURRENT_HASH): SessionDiscoveryContext {
  return {
    extensionContext: {
      storageUri: { fsPath: path.join(STORAGE_ROOT, storageHash, "agent-lens") },
    } as any,
    workspacePath: `/workspaces/${WORKSPACE_NAME}`,
  };
}

function minimalSession(id: string) {
  const init = JSON.stringify({
    kind: 0,
    v: { version: 3, creationDate: 1000, sessionId: id, requests: [] },
  });
  const append = JSON.stringify({
    kind: 2,
    k: ["requests"],
    v: [{
      requestId: "r1",
      timestamp: 1000,
      agent: { id: "github.copilot.editsAgent", name: "agent" },
      modelId: "gpt-4o",
      message: { text: "hi" },
      response: [],
    }],
  });
  return `${init}\n${append}`;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({ get: vi.fn().mockReturnValue(null) } as any);
  vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined as any);
  mockReadFile.mockRejectedValue(new Error("ENOENT"));
  mockReaddir.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
});

describe("CopilotSessionProvider — primary hash (strategy 2)", () => {
  it("returns sessions with scope=workspace and matchedWorkspace set from workspace.json", async () => {
    const chatDir = path.join(STORAGE_ROOT, CURRENT_HASH, "chatSessions");
    const hashDir = path.join(STORAGE_ROOT, CURRENT_HASH);

    mockReaddir.mockImplementation(async (p) => {
      if (String(p) === chatDir) return ["session-abc.jsonl"] as any;
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    mockReadFile.mockImplementation(async (p) => {
      const ps = String(p);
      if (ps.endsWith("workspace.json") && ps.includes(CURRENT_HASH)) {
        return JSON.stringify({ folder: WORKSPACE_URI });
      }
      if (ps.endsWith("session-abc.jsonl")) return minimalSession("session-abc");
      throw new Error("ENOENT");
    });

    const provider = new CopilotSessionProvider();
    const sessions = await provider.discoverSessions(makeCtx());

    expect(sessions).toHaveLength(1);
    expect(sessions[0].scope).toBe("workspace");
    expect(sessions[0].matchedWorkspace).toBe(WORKSPACE_URI);
    expect(sessions[0].sessionId).toBe("session-abc");
  });

  it("does not show a notification for primary hash sessions", async () => {
    const chatDir = path.join(STORAGE_ROOT, CURRENT_HASH, "chatSessions");

    mockReaddir.mockImplementation(async (p) => {
      if (String(p) === chatDir) return ["session-abc.jsonl"] as any;
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    mockReadFile.mockImplementation(async (p) => {
      const ps = String(p);
      if (ps.endsWith("workspace.json")) return JSON.stringify({ folder: WORKSPACE_URI });
      if (ps.endsWith("session-abc.jsonl")) return minimalSession("session-abc");
      throw new Error("ENOENT");
    });

    const provider = new CopilotSessionProvider();
    await provider.discoverSessions(makeCtx());

    expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
  });
});

describe("CopilotSessionProvider — stale hash fallback (strategy 3)", () => {
  it("returns sessions with scope=fallback and matchedWorkspace from stale hash workspace.json", async () => {
    const staleHashDir = path.join(STORAGE_ROOT, STALE_HASH);
    const staleChatDir = path.join(staleHashDir, "chatSessions");
    const currentChatDir = path.join(STORAGE_ROOT, CURRENT_HASH, "chatSessions");

    mockReaddir.mockImplementation(async (p) => {
      const ps = String(p);
      if (ps === currentChatDir) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      if (ps === STORAGE_ROOT) return [CURRENT_HASH, STALE_HASH, "unrelated-hash"] as any;
      if (ps === staleChatDir) return ["session-xyz.jsonl"] as any;
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    mockReadFile.mockImplementation(async (p) => {
      const ps = String(p);
      if (ps === path.join(staleHashDir, "workspace.json")) {
        return JSON.stringify({ folder: WORKSPACE_URI });
      }
      if (ps === path.join(STORAGE_ROOT, CURRENT_HASH, "workspace.json")) {
        return JSON.stringify({ folder: WORKSPACE_URI });
      }
      if (ps.includes("unrelated-hash") && ps.endsWith("workspace.json")) {
        return JSON.stringify({ folder: "file:///other/project" });
      }
      if (ps.endsWith("session-xyz.jsonl")) return minimalSession("session-xyz");
      throw new Error("ENOENT");
    });

    const provider = new CopilotSessionProvider();
    const sessions = await provider.discoverSessions(makeCtx());

    expect(sessions).toHaveLength(1);
    expect(sessions[0].scope).toBe("fallback");
    expect(sessions[0].matchedWorkspace).toBe(WORKSPACE_URI);
    expect(sessions[0].sessionId).toBe("session-xyz");
  });

  it("shows an info notification when stale-hash sessions are found", async () => {
    const staleHashDir = path.join(STORAGE_ROOT, STALE_HASH);
    const staleChatDir = path.join(staleHashDir, "chatSessions");
    const currentChatDir = path.join(STORAGE_ROOT, CURRENT_HASH, "chatSessions");

    mockReaddir.mockImplementation(async (p) => {
      const ps = String(p);
      if (ps === currentChatDir) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      if (ps === STORAGE_ROOT) return [CURRENT_HASH, STALE_HASH] as any;
      if (ps === staleChatDir) return ["session-xyz.jsonl"] as any;
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    mockReadFile.mockImplementation(async (p) => {
      const ps = String(p);
      if (ps.endsWith("workspace.json")) return JSON.stringify({ folder: WORKSPACE_URI });
      if (ps.endsWith("session-xyz.jsonl")) return minimalSession("session-xyz");
      throw new Error("ENOENT");
    });

    const provider = new CopilotSessionProvider();
    await provider.discoverSessions(makeCtx());

    expect(vscode.window.showInformationMessage).toHaveBeenCalledOnce();
    const msg = vi.mocked(vscode.window.showInformationMessage).mock.calls[0][0];
    expect(msg).toContain("1 Copilot Chat session");
    expect(msg).toContain("previous workspace hash");
  });

  it("deduplicates sessions found in multiple stale hashes", async () => {
    const staleHash2 = "cccc3333";
    const stale1Dir = path.join(STORAGE_ROOT, STALE_HASH);
    const stale1ChatDir = path.join(stale1Dir, "chatSessions");
    const stale2Dir = path.join(STORAGE_ROOT, staleHash2);
    const stale2ChatDir = path.join(stale2Dir, "chatSessions");
    const currentChatDir = path.join(STORAGE_ROOT, CURRENT_HASH, "chatSessions");

    mockReaddir.mockImplementation(async (p) => {
      const ps = String(p);
      if (ps === currentChatDir) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      if (ps === STORAGE_ROOT) return [CURRENT_HASH, STALE_HASH, staleHash2] as any;
      if (ps === stale1ChatDir) return ["session-dup.jsonl", "session-unique1.jsonl"] as any;
      if (ps === stale2ChatDir) return ["session-dup.jsonl", "session-unique2.jsonl"] as any;
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    mockReadFile.mockImplementation(async (p) => {
      const ps = String(p);
      if (ps.endsWith("workspace.json")) return JSON.stringify({ folder: WORKSPACE_URI });
      if (ps.includes("session-dup.jsonl")) return minimalSession("session-dup");
      if (ps.includes("session-unique1.jsonl")) return minimalSession("session-unique1");
      if (ps.includes("session-unique2.jsonl")) return minimalSession("session-unique2");
      throw new Error("ENOENT");
    });

    const provider = new CopilotSessionProvider();
    const sessions = await provider.discoverSessions(makeCtx());

    expect(sessions).toHaveLength(3);
    const ids = sessions.map((s) => s.sessionId).sort();
    expect(ids).toEqual(["session-dup", "session-unique1", "session-unique2"]);
  });

  it("does not show notification when stale scan finds nothing", async () => {
    const currentChatDir = path.join(STORAGE_ROOT, CURRENT_HASH, "chatSessions");

    mockReaddir.mockImplementation(async (p) => {
      const ps = String(p);
      if (ps === currentChatDir) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      if (ps === STORAGE_ROOT) return [CURRENT_HASH] as any;
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    mockReadFile.mockImplementation(async (p) => {
      if (String(p).endsWith("workspace.json")) return JSON.stringify({ folder: WORKSPACE_URI });
      throw new Error("ENOENT");
    });

    const provider = new CopilotSessionProvider();
    const sessions = await provider.discoverSessions(makeCtx());

    expect(sessions).toHaveLength(0);
    expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
  });
});

describe("CopilotSessionProvider — platform storage root (strategy 4)", () => {
  const PLATFORM_ROOT = path.join("/Users/testuser", "Library", "Application Support", "Code", "User", "workspaceStorage");
  const PLATFORM_HASH = "dddd4444";

  beforeEach(() => {
    vi.spyOn(CopilotSessionProvider.prototype, "getPlatformStorageRoot" as any).mockReturnValue(PLATFORM_ROOT);
  });

  it("discovers sessions from the platform storage root", async () => {
    const platformChatDir = path.join(PLATFORM_ROOT, PLATFORM_HASH, "chatSessions");
    const currentChatDir = path.join(STORAGE_ROOT, CURRENT_HASH, "chatSessions");

    mockReaddir.mockImplementation(async (p) => {
      const ps = String(p);
      // Strategy 2: primary hash — empty
      if (ps === currentChatDir) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      // Strategy 3: sibling scan — only current hash, nothing new
      if (ps === STORAGE_ROOT) return [CURRENT_HASH] as any;
      // Strategy 4: platform root
      if (ps === PLATFORM_ROOT) return [PLATFORM_HASH] as any;
      if (ps === platformChatDir) return ["session-platform.jsonl"] as any;
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    mockReadFile.mockImplementation(async (p) => {
      const ps = String(p);
      if (ps === path.join(PLATFORM_ROOT, PLATFORM_HASH, "workspace.json")) {
        return JSON.stringify({ folder: WORKSPACE_URI });
      }
      if (ps === path.join(STORAGE_ROOT, CURRENT_HASH, "workspace.json")) {
        return JSON.stringify({ folder: WORKSPACE_URI });
      }
      if (ps.endsWith("session-platform.jsonl")) return minimalSession("session-platform");
      throw new Error("ENOENT");
    });

    const provider = new CopilotSessionProvider();
    const sessions = await provider.discoverSessions(makeCtx());

    expect(sessions).toHaveLength(1);
    expect(sessions[0].sessionId).toBe("session-platform");
    expect(sessions[0].scope).toBe("workspace");
  });

  it("deduplicates sessions across strategies", async () => {
    const currentChatDir = path.join(STORAGE_ROOT, CURRENT_HASH, "chatSessions");
    const platformChatDir = path.join(PLATFORM_ROOT, PLATFORM_HASH, "chatSessions");

    mockReaddir.mockImplementation(async (p) => {
      const ps = String(p);
      // Strategy 2: primary hash has one session
      if (ps === currentChatDir) return ["session-shared.jsonl"] as any;
      // Strategy 3: sibling scan
      if (ps === STORAGE_ROOT) return [CURRENT_HASH] as any;
      // Strategy 4: platform root has same session + one new
      if (ps === PLATFORM_ROOT) return [PLATFORM_HASH] as any;
      if (ps === platformChatDir) return ["session-shared.jsonl", "session-local.jsonl"] as any;
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    mockReadFile.mockImplementation(async (p) => {
      const ps = String(p);
      if (ps.endsWith("workspace.json")) return JSON.stringify({ folder: WORKSPACE_URI });
      if (ps.includes("session-shared.jsonl")) return minimalSession("session-shared");
      if (ps.includes("session-local.jsonl")) return minimalSession("session-local");
      throw new Error("ENOENT");
    });

    const provider = new CopilotSessionProvider();
    const sessions = await provider.discoverSessions(makeCtx());

    expect(sessions).toHaveLength(2);
    const ids = sessions.map((s) => s.sessionId).sort();
    expect(ids).toEqual(["session-local", "session-shared"]);
  });

  it("skips strategy 4 when platform root equals current storage root", async () => {
    vi.spyOn(CopilotSessionProvider.prototype, "getPlatformStorageRoot" as any).mockReturnValue(STORAGE_ROOT);

    const currentChatDir = path.join(STORAGE_ROOT, CURRENT_HASH, "chatSessions");

    mockReaddir.mockImplementation(async (p) => {
      const ps = String(p);
      if (ps === currentChatDir) return ["session-abc.jsonl"] as any;
      if (ps === STORAGE_ROOT) return [CURRENT_HASH] as any;
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    mockReadFile.mockImplementation(async (p) => {
      const ps = String(p);
      if (ps.endsWith("workspace.json")) return JSON.stringify({ folder: WORKSPACE_URI });
      if (ps.endsWith("session-abc.jsonl")) return minimalSession("session-abc");
      throw new Error("ENOENT");
    });

    const provider = new CopilotSessionProvider();
    const sessions = await provider.discoverSessions(makeCtx());

    // Should only find the session once (from strategy 2), not duplicated
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sessionId).toBe("session-abc");
  });
});

describe("CopilotSessionProvider — accumulative discovery", () => {
  it("accumulates sessions from strategy 1 and strategy 2 together", async () => {
    const configDir = "/mnt/host-sessions";
    const currentChatDir = path.join(STORAGE_ROOT, CURRENT_HASH, "chatSessions");

    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn().mockReturnValue(configDir),
    } as any);

    mockReaddir.mockImplementation(async (p) => {
      const ps = String(p);
      // Strategy 1: configDir has one session
      if (ps === configDir) return ["session-config.jsonl"] as any;
      // Strategy 2: primary hash has a different session
      if (ps === currentChatDir) return ["session-primary.jsonl"] as any;
      // Strategy 3: sibling scan
      if (ps === STORAGE_ROOT) return [CURRENT_HASH] as any;
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    mockReadFile.mockImplementation(async (p) => {
      const ps = String(p);
      if (ps.endsWith("workspace.json")) return JSON.stringify({ folder: WORKSPACE_URI });
      if (ps.endsWith("session-config.jsonl")) return minimalSession("session-config");
      if (ps.endsWith("session-primary.jsonl")) return minimalSession("session-primary");
      throw new Error("ENOENT");
    });

    const provider = new CopilotSessionProvider();
    const sessions = await provider.discoverSessions(makeCtx());

    expect(sessions).toHaveLength(2);
    const ids = sessions.map((s) => s.sessionId).sort();
    expect(ids).toEqual(["session-config", "session-primary"]);
  });

  it("does not duplicate sessions found by both strategy 1 and strategy 2", async () => {
    const configDir = "/mnt/host-sessions";
    const currentChatDir = path.join(STORAGE_ROOT, CURRENT_HASH, "chatSessions");

    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn().mockReturnValue(configDir),
    } as any);

    mockReaddir.mockImplementation(async (p) => {
      const ps = String(p);
      if (ps === configDir) return ["session-same.jsonl"] as any;
      if (ps === currentChatDir) return ["session-same.jsonl"] as any;
      if (ps === STORAGE_ROOT) return [CURRENT_HASH] as any;
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    mockReadFile.mockImplementation(async (p) => {
      const ps = String(p);
      if (ps.endsWith("workspace.json")) return JSON.stringify({ folder: WORKSPACE_URI });
      if (ps.includes("session-same.jsonl")) return minimalSession("session-same");
      throw new Error("ENOENT");
    });

    const provider = new CopilotSessionProvider();
    const sessions = await provider.discoverSessions(makeCtx());

    expect(sessions).toHaveLength(1);
    expect(sessions[0].sessionId).toBe("session-same");
  });
});

describe("getPlatformStorageRoot", () => {
  it("returns macOS path on darwin", () => {
    // Restore real implementation for this test
    vi.restoreAllMocks();
    if (process.platform === "darwin") {
      const result = getPlatformStorageRoot();
      expect(result).toContain("Library/Application Support/Code/User/workspaceStorage");
    }
  });
});
