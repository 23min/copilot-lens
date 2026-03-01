import { describe, it, expect } from "vitest";
import { formatTokens, formatCacheTokens, formatTime } from "./timeline.js";

describe("formatTokens", () => {
  it("formats prompt and completion tokens", () => {
    const result = formatTokens({ promptTokens: 1234, completionTokens: 567 });
    expect(result).toBe("Prompt: 1,234 | Completion: 567");
  });

  it("handles zero tokens", () => {
    const result = formatTokens({ promptTokens: 0, completionTokens: 0 });
    expect(result).toBe("Prompt: 0 | Completion: 0");
  });

  it("formats large numbers with locale separators", () => {
    const result = formatTokens({
      promptTokens: 125374,
      completionTokens: 98765,
    });
    expect(result).toContain("125");
    expect(result).toContain("98");
  });
});

describe("formatCacheTokens", () => {
  it("returns null when both cache values are zero", () => {
    expect(
      formatCacheTokens({ promptTokens: 100, completionTokens: 50 }),
    ).toBeNull();
  });

  it("returns null when cache fields are missing", () => {
    expect(
      formatCacheTokens({
        promptTokens: 100,
        completionTokens: 50,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      }),
    ).toBeNull();
  });

  it("shows only cache creation when read is zero", () => {
    const result = formatCacheTokens({
      promptTokens: 100,
      completionTokens: 50,
      cacheCreationTokens: 5000,
      cacheReadTokens: 0,
    });
    expect(result).toBe("Cache create: 5,000");
  });

  it("shows only cache read when creation is zero", () => {
    const result = formatCacheTokens({
      promptTokens: 100,
      completionTokens: 50,
      cacheCreationTokens: 0,
      cacheReadTokens: 3000,
    });
    expect(result).toBe("Cache read: 3,000");
  });

  it("shows both when both are non-zero", () => {
    const result = formatCacheTokens({
      promptTokens: 100,
      completionTokens: 50,
      cacheCreationTokens: 5000,
      cacheReadTokens: 3000,
    });
    expect(result).toBe("Cache create: 5,000 | Cache read: 3,000");
  });
});

describe("formatTime", () => {
  it("formats a timestamp as HH:MM", () => {
    // Use a known timestamp: 2026-01-15T10:30:00Z
    const ts = new Date("2026-01-15T10:30:00Z").getTime();
    const result = formatTime(ts);
    // Exact format depends on locale, but should contain hour and minute
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });

  it("returns a string for any numeric timestamp", () => {
    expect(typeof formatTime(0)).toBe("string");
    expect(typeof formatTime(Date.now())).toBe("string");
  });
});
