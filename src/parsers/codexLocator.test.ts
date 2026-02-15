import { describe, it, expect, vi, afterEach } from "vitest";
import { getCodexSessionsDir } from "./codexLocator.js";
import * as os from "node:os";
import * as path from "node:path";

describe("getCodexSessionsDir", () => {
  const originalEnv = process.env.CODEX_HOME;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = originalEnv;
    }
  });

  it("returns configDir when provided", () => {
    process.env.CODEX_HOME = "/some/codex/home";
    const result = getCodexSessionsDir("/custom/path");
    expect(result).toBe("/custom/path");
  });

  it("uses CODEX_HOME env var when no configDir", () => {
    process.env.CODEX_HOME = "/my/codex";
    const result = getCodexSessionsDir();
    expect(result).toBe(path.join("/my/codex", "sessions"));
  });

  it("falls back to ~/.codex/sessions when no configDir or env var", () => {
    delete process.env.CODEX_HOME;
    const result = getCodexSessionsDir();
    expect(result).toBe(path.join(os.homedir(), ".codex", "sessions"));
  });

  it("prefers configDir over CODEX_HOME", () => {
    process.env.CODEX_HOME = "/env/codex";
    const result = getCodexSessionsDir("/config/path");
    expect(result).toBe("/config/path");
  });
});
