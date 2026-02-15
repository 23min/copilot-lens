import type { AgentProvider } from "./agent.js";

export interface Skill {
  name: string;
  description: string;
  body: string;
  filePath: string;
  fileUri?: string;
  provider?: AgentProvider;
}
