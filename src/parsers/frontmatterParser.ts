import yaml from "js-yaml";

export interface FrontmatterResult {
  data: Record<string, unknown>;
  body: string;
}

export function parseFrontmatter(content: string): FrontmatterResult {
  const match = content.match(/^---\n([\s\S]*?)---(?:\n([\s\S]*))?$/);

  if (!match) {
    return { data: {}, body: content };
  }

  const yamlStr = match[1];
  const body = (match[2] ?? "").trim();

  let data: Record<string, unknown> = {};
  if (yamlStr.trim()) {
    const parsed = yaml.load(yamlStr);
    if (parsed && typeof parsed === "object") {
      data = parsed as Record<string, unknown>;
    }
  }

  return { data, body };
}
