export interface CountEntry {
  name: string;
  count: number;
}

export interface ActivityEntry {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface AggregatedMetrics {
  totalSessions: number;
  totalRequests: number;
  totalTokens: { prompt: number; completion: number };
  agentUsage: CountEntry[];
  modelUsage: CountEntry[];
  toolUsage: CountEntry[];
  skillUsage: CountEntry[];
  activity: ActivityEntry[];
  unusedAgents: string[];
  unusedSkills: string[];
}
