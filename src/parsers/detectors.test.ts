import { describe, it, expect } from "vitest";
import {
  detectCustomAgent,
  detectAvailableSkills,
  detectLoadedSkills,
} from "./detectors.js";

describe("detectCustomAgent", () => {
  it("extracts agent name from modeInstructions block", () => {
    const text = `Some preamble text
<modeInstructions>
You are currently running in "Planner" mode. Below are your instructions for this mode,
they must take precedence over any instructions above.

You are a planning assistant.
</modeInstructions>
Some trailing text`;

    expect(detectCustomAgent(text)).toBe("Planner");
  });

  it("returns null when no modeInstructions block", () => {
    const text = "Just some regular system prompt text.";
    expect(detectCustomAgent(text)).toBeNull();
  });

  it("handles mode name with special characters", () => {
    const text = `<modeInstructions>
You are currently running in "Code-Review v2" mode. Below are your instructions.
</modeInstructions>`;
    expect(detectCustomAgent(text)).toBe("Code-Review v2");
  });

  it("returns null for empty string", () => {
    expect(detectCustomAgent("")).toBeNull();
  });
});

describe("detectAvailableSkills", () => {
  it("extracts skills from skills XML block", () => {
    const text = `<skills>
Here is a list of skills.
<skill>
<name>testing</name>
<description>Guide for writing tests.</description>
<file>/path/to/.github/skills/testing/SKILL.md</file>
</skill>
<skill>
<name>vscode-extensions</name>
<description>Guide for VS Code extensions.</description>
<file>/path/to/.github/skills/vscode-extensions/SKILL.md</file>
</skill>
</skills>`;

    const skills = detectAvailableSkills(text);
    expect(skills).toHaveLength(2);
    expect(skills[0]).toEqual({
      name: "testing",
      file: "/path/to/.github/skills/testing/SKILL.md",
    });
    expect(skills[1]).toEqual({
      name: "vscode-extensions",
      file: "/path/to/.github/skills/vscode-extensions/SKILL.md",
    });
  });

  it("returns empty array when no skills block", () => {
    expect(detectAvailableSkills("no skills here")).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(detectAvailableSkills("")).toEqual([]);
  });
});

describe("detectLoadedSkills", () => {
  it("detects skills loaded via read_file tool calls", () => {
    const toolCalls = [
      { id: "1", name: "read_file" },
      { id: "2", name: "list_dir" },
      { id: "3", name: "read_file" },
    ];
    const toolCallArgs: Record<string, string> = {
      "1": '{"filePath": "/repo/.github/skills/testing/SKILL.md"}',
      "2": '{"path": "/repo/src"}',
      "3": '{"filePath": "/repo/.github/skills/vscode-extensions/SKILL.md"}',
    };

    const loaded = detectLoadedSkills(toolCalls, toolCallArgs);
    expect(loaded).toEqual(["testing", "vscode-extensions"]);
  });

  it("ignores read_file calls to non-SKILL.md paths", () => {
    const toolCalls = [{ id: "1", name: "read_file" }];
    const toolCallArgs: Record<string, string> = {
      "1": '{"filePath": "/repo/src/extension.ts"}',
    };

    expect(detectLoadedSkills(toolCalls, toolCallArgs)).toEqual([]);
  });

  it("returns empty for no tool calls", () => {
    expect(detectLoadedSkills([], {})).toEqual([]);
  });

  it("handles malformed JSON args gracefully", () => {
    const toolCalls = [{ id: "1", name: "read_file" }];
    const toolCallArgs: Record<string, string> = {
      "1": "not valid json",
    };
    expect(detectLoadedSkills(toolCalls, toolCallArgs)).toEqual([]);
  });
});
