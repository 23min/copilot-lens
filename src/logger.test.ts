import { describe, it, expect, vi, beforeEach } from "vitest";
import { initLogger, getLogger } from "./logger.js";

describe("logger", () => {
  it("no-ops before initialization", () => {
    // Should not throw
    getLogger().info("test");
    getLogger().warn("test");
    getLogger().error("test");
  });

  describe("after initialization", () => {
    const channel = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    beforeEach(() => {
      channel.info.mockClear();
      channel.warn.mockClear();
      channel.error.mockClear();
      initLogger(channel as any);
    });

    it("delegates info to channel.info", () => {
      getLogger().info("hello");
      expect(channel.info).toHaveBeenCalledWith("hello");
    });

    it("delegates warn to channel.warn", () => {
      getLogger().warn("careful");
      expect(channel.warn).toHaveBeenCalledWith("careful");
    });

    it("delegates error to channel.error", () => {
      getLogger().error("boom");
      expect(channel.error).toHaveBeenCalledWith("boom");
    });
  });
});
