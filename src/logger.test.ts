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
    const appendLine = vi.fn();

    beforeEach(() => {
      appendLine.mockClear();
      initLogger({ appendLine } as any);
    });

    it("logs info messages", () => {
      getLogger().info("hello");
      expect(appendLine).toHaveBeenCalledWith("[INFO]  hello");
    });

    it("logs warn messages", () => {
      getLogger().warn("careful");
      expect(appendLine).toHaveBeenCalledWith("[WARN]  careful");
    });

    it("logs error messages", () => {
      getLogger().error("boom");
      expect(appendLine).toHaveBeenCalledWith("[ERROR] boom");
    });
  });
});
