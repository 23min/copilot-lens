import type { Skill } from "../models/skill.js";
import { parseFrontmatter } from "./frontmatterParser.js";

function inferNameFromPath(filePath: string): string {
  const parts = filePath.split("/");
  const skillMdIndex = parts.lastIndexOf("SKILL.md");
  if (skillMdIndex > 0) {
    return parts[skillMdIndex - 1];
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
