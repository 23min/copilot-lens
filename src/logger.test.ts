import { describe, it, expect, vi, beforeEach } from "vitest";
import { initLogger, getLogger } from "./logger.js";

describe("logger", () => {
  it("no-ops before initialization", () => {
    // Should not throw
    getLogger().debug("test");
    getLogger().info("test");
    getLogger().warn("test");
    getLogger().error("test");
  });

  describe("after initialization", () => {
    const channel = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    beforeEach(() => {
      delete process.env.AGENT_LENS_LOG_LEVEL;
      delete process.env.AGENT_LENS_DEBUG;
      channel.debug.mockClear();
      channel.info.mockClear();
      channel.warn.mockClear();
      channel.error.mockClear();
      initLogger(channel as any);
    });

    it("suppresses debug by default", () => {
      getLogger().debug("verbose");
      expect(channel.debug).not.toHaveBeenCalled();
    });

    it("delegates debug when AGENT_LENS_LOG_LEVEL=debug", () => {
      process.env.AGENT_LENS_LOG_LEVEL = "debug";
      initLogger(channel as any);

      getLogger().debug("verbose");
      expect(channel.debug).toHaveBeenCalledWith("verbose");
    });

    it("delegates debug when AGENT_LENS_DEBUG=1", () => {
      process.env.AGENT_LENS_DEBUG = "1";
      initLogger(channel as any);

      getLogger().debug("verbose");
      expect(channel.debug).toHaveBeenCalledWith("verbose");
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
