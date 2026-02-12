import type { Agent, Handoff } from "../models/agent.js";
import { parseFrontmatter } from "./frontmatterParser.js";

function inferNameFromPath(filePath: string): string {
  const filename = filePath.split("/").pop() ?? "";
  return filename.replace(/\.agent\.md$/, "");
}

function parseHandoffs(raw: unknown): Handoff[] {
  if (!Array.isArray(raw)) return [];

  return raw.map((h: Record<string, unknown>) => ({
    label: String(h.label ?? ""),
    agent: String(h.agent ?? ""),
    prompt: String(h.prompt ?? ""),
    send: h.send !== undefined ? Boolean(h.send) : true,
  }));
}

function toStringArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") return [raw];
  return [];
}

export function parseAgent(content: string, filePath: string): Agent {
  const { data, body } = parseFrontmatter(content);

  return {
    name: typeof data.name === "string" ? data.name : inferNameFromPath(filePath),
    description: typeof data.description === "string" ? data.description : "",
    tools: toStringArray(data.tools),
    model: toStringArray(data.model),
    handoffs: parseHandoffs(data.handoffs),
    body,
    filePath,
  };
}
