import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  registerSessionProvider,
  clearProviders,
  discoverAllSessions,
  collectWatchTargets,
} from "./sessionRegistry.js";
import type { SessionProvider, SessionDiscoveryContext } from "./sessionProvider.js";
import type { Session } from "../models/session.js";

function makeSession(id: string, source: string): Session {
  return {
    sessionId: id,
    title: null,
    creationDate: 0,
    requests: [],
    source,
  };
}

function makeProvider(
  name: string,
  sessions: Session[],
): SessionProvider {
  return {
    name,
    discoverSessions: vi.fn().mockResolvedValue(sessions),
  };
}

const dummyCtx = {} as SessionDiscoveryContext;

describe("sessionRegistry", () => {
  beforeEach(() => {
    clearProviders();
  });

  it("returns empty array with no providers", async () => {
    const result = await discoverAllSessions(dummyCtx);
    expect(result).toEqual([]);
  });

  it("merges sessions from multiple providers", async () => {
    registerSessionProvider(
      makeProvider("A", [makeSession("s1", "a")]),
    );
    registerSessionProvider(
      makeProvider("B", [makeSession("s2", "b")]),
    );

    const result = await discoverAllSessions(dummyCtx);
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.sessionId)).toEqual(["s1", "s2"]);
  });

  it("deduplicates sessions by sessionId", async () => {
    registerSessionProvider(
      makeProvider("A", [makeSession("dup", "a")]),
    );
    registerSessionProvider(
      makeProvider("B", [makeSession("dup", "b")]),
    );

    const result = await discoverAllSessions(dummyCtx);
    expect(result).toHaveLength(1);
    expect(result[0].sessionId).toBe("dup");
    // First provider wins
    expect(result[0].source).toBe("a");
  });

  it("continues when a provider throws", async () => {
    const failing: SessionProvider = {
      name: "Failing",
      discoverSessions: vi.fn().mockRejectedValue(new Error("boom")),
    };
    registerSessionProvider(failing);
    registerSessionProvider(
      makeProvider("Good", [makeSession("s1", "good")]),
    );

    const result = await discoverAllSessions(dummyCtx);
    expect(result).toHaveLength(1);
    expect(result[0].sessionId).toBe("s1");
  });

  it("collects watch targets from all providers", () => {
    const pattern = "*.jsonl";
    const provider: SessionProvider = {
      name: "Watcher",
      discoverSessions: vi.fn().mockResolvedValue([]),
      getWatchTargets: () => [{ pattern, events: ["create", "change"] }],
    };
    const noWatcher: SessionProvider = {
      name: "NoWatcher",
      discoverSessions: vi.fn().mockResolvedValue([]),
    };

    registerSessionProvider(provider);
    registerSessionProvider(noWatcher);

    const targets = collectWatchTargets(dummyCtx);
    expect(targets).toHaveLength(1);
    expect(targets[0].pattern).toBe(pattern);
    expect(targets[0].events).toEqual(["create", "change"]);
  });

  it("returns empty watch targets with no providers", () => {
    const targets = collectWatchTargets(dummyCtx);
    expect(targets).toEqual([]);
  });
});
