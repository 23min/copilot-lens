export interface CountEntry {
  name: string;
  count: number;
  isCustom?: boolean;
}

export interface ActivityEntry {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface TokenEntry {
  name: string;
  promptTokens: number;
  completionTokens: number;
}

export interface UnusedEntry {
  name: string;
  provider?: string;
}

export interface AggregatedMetrics {
  totalSessions: number;
  totalRequests: number;
  totalTokens: { prompt: number; completion: number };
  cacheTokens: { read: number; creation: number };
  agentUsage: CountEntry[];
  modelUsage: CountEntry[];
  toolUsage: CountEntry[];
  skillUsage: CountEntry[];
  tokensByAgent: TokenEntry[];
  tokensByModel: TokenEntry[];
  activity: ActivityEntry[];
  unusedAgents: UnusedEntry[];
  unusedSkills: UnusedEntry[];
  mcpServerUsage: CountEntry[];
}
