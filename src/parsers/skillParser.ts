import type { Skill } from "../models/skill.js";
import { parseFrontmatter } from "./frontmatterParser.js";

function inferNameFromPath(filePath: string): string {
  // Convention 1: .github/skills/<name>/SKILL.md
  const parts = filePath.split("/");
  const skillMdIndex = parts.lastIndexOf("SKILL.md");
  if (skillMdIndex > 0) {
    return parts[skillMdIndex - 1];
  }
  // Convention 2: .github/skills/<name>.skill.md
  const filename = parts[parts.length - 1];
  const flatMatch = filename.match(/^(.+)\.skill\.md$/);
  if (flatMatch) {
    return flatMatch[1];
  }
  return "unknown";
}

export function parseSkill(content: string, filePath: string): Skill {
  const { data, body } = parseFrontmatter(content);

  return {
    name: typeof data.name === "string" ? data.name : inferNameFromPath(filePath),
    description: typeof data.description === "string" ? data.description : "",
    body,
    filePath,
  };
}
