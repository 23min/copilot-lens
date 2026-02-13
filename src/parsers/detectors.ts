import type { SkillRef, ToolCallInfo } from "../models/session.js";

export function detectCustomAgent(text: string): string | null {
  const match = text.match(
    /<modeInstructions>\s*You are currently running in "([^"]+)" mode/,
  );
  return match ? match[1] : null;
}

export function detectAvailableSkills(text: string): SkillRef[] {
  const skillsBlockMatch = text.match(/<skills>([\s\S]*?)<\/skills>/);
  if (!skillsBlockMatch) return [];

  const skills: SkillRef[] = [];
  const skillRegex = /<skill>\s*<name>(.*?)<\/name>\s*<description>.*?<\/description>\s*<file>(.*?)<\/file>\s*<\/skill>/gs;

  let match;
  while ((match = skillRegex.exec(skillsBlockMatch[1])) !== null) {
    skills.push({ name: match[1], file: match[2] });
  }

  return skills;
}

export function detectLoadedSkills(
  toolCalls: ToolCallInfo[],
  toolCallArgs: Record<string, string>,
): string[] {
  const loaded: string[] = [];

  for (const call of toolCalls) {
    if (call.name !== "read_file") continue;

    const argsStr = toolCallArgs[call.id];
    if (!argsStr) continue;

    try {
      const args = JSON.parse(argsStr);
      const filePath: string = args.filePath ?? "";
      const skillMatch = filePath.match(
        /\.github\/skills\/([^/]+)\/SKILL\.md$/,
      );
      if (skillMatch) {
        loaded.push(skillMatch[1]);
      }
    } catch {
      // malformed JSON, skip
    }
  }

  return loaded;
}
