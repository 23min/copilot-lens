import { describe, it, expect } from "vitest";
import { parseSkill } from "./skillParser.js";

const TESTING_SKILL_FIXTURE = `---
name: testing
description: Guide for writing tests. Use this when creating unit tests, integration tests, or setting up test infrastructure.
---

# Testing Patterns

## TDD workflow
1. Write a failing test (red)
2. Write minimal code to pass (green)
3. Refactor while keeping tests green

## Vitest conventions
- Test files: \`*.test.ts\` next to source files
- Use \`describe\` / \`it\` blocks
- Prefer \`expect\` assertions
- Mock external dependencies, not internal logic`;

describe("parseSkill", () => {
  it("parses a complete skill file", () => {
    const skill = parseSkill(
      TESTING_SKILL_FIXTURE,
      ".github/skills/testing/SKILL.md",
    );

    expect(skill.name).toBe("testing");
    expect(skill.description).toBe(
      "Guide for writing tests. Use this when creating unit tests, integration tests, or setting up test infrastructure.",
    );
    expect(skill.body).toContain("# Testing Patterns");
    expect(skill.body).toContain("TDD workflow");
    expect(skill.filePath).toBe(".github/skills/testing/SKILL.md");
  });

  it("handles skill with no description", () => {
    const content = `---
name: quickfix
---

Just do the thing.`;
    const skill = parseSkill(content, "quickfix/SKILL.md");
    expect(skill.name).toBe("quickfix");
    expect(skill.description).toBe("");
    expect(skill.body).toBe("Just do the thing.");
  });

  it("falls back to directory name when name is missing", () => {
    const content = `---
description: A skill without a name
---

Instructions.`;
    const skill = parseSkill(content, ".github/skills/my-skill/SKILL.md");
    expect(skill.name).toBe("my-skill");
  });

  it("handles empty content", () => {
    const skill = parseSkill("", ".github/skills/empty/SKILL.md");
    expect(skill.name).toBe("empty");
    expect(skill.description).toBe("");
    expect(skill.body).toBe("");
  });

  it("handles content with no frontmatter", () => {
    const content = "# Just Markdown\n\nNo frontmatter here.";
    const skill = parseSkill(content, ".github/skills/raw/SKILL.md");
    expect(skill.name).toBe("raw");
    expect(skill.body).toBe("# Just Markdown\n\nNo frontmatter here.");
  });
});
