import { describe, it, expect } from "vitest";
import { parseFrontmatter } from "./frontmatterParser.js";

describe("parseFrontmatter", () => {
  it("extracts YAML data and markdown body", () => {
    const content = `---
name: Test
description: A test agent
---

Body content here.`;

    const result = parseFrontmatter(content);
    expect(result.data).toEqual({ name: "Test", description: "A test agent" });
    expect(result.body).toBe("Body content here.");
  });

  it("handles complex YAML with arrays and nested objects", () => {
    const content = `---
name: Planner
tools: ['search', 'fetch']
handoffs:
  - label: Start
    agent: implementer
---

Instructions here.`;

    const result = parseFrontmatter(content);
    expect(result.data.name).toBe("Planner");
    expect(result.data.tools).toEqual(["search", "fetch"]);
    expect(result.data.handoffs).toEqual([
      { label: "Start", agent: "implementer" },
    ]);
    expect(result.body).toBe("Instructions here.");
  });

  it("returns empty data when no frontmatter delimiters", () => {
    const content = "Just body content, no frontmatter.";
    const result = parseFrontmatter(content);
    expect(result.data).toEqual({});
    expect(result.body).toBe("Just body content, no frontmatter.");
  });

  it("returns empty data when only one delimiter", () => {
    const content = `---
name: Broken`;
    const result = parseFrontmatter(content);
    expect(result.data).toEqual({});
    expect(result.body).toBe(content);
  });

  it("handles empty frontmatter block", () => {
    const content = `---
---

Body only.`;
    const result = parseFrontmatter(content);
    expect(result.data).toEqual({});
    expect(result.body).toBe("Body only.");
  });

  it("handles empty body", () => {
    const content = `---
name: NoBody
---`;
    const result = parseFrontmatter(content);
    expect(result.data).toEqual({ name: "NoBody" });
    expect(result.body).toBe("");
  });

  it("handles empty string", () => {
    const result = parseFrontmatter("");
    expect(result.data).toEqual({});
    expect(result.body).toBe("");
  });
});
