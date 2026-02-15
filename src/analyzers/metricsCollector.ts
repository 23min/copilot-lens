import type { Session } from "../models/session.js";
import type {
  AggregatedMetrics,
  CountEntry,
  ActivityEntry,
  TokenEntry,
  UnusedEntry,
} from "../models/metrics.js";

function countMap(map: Map<string, number>): CountEntry[] {
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

function tokenMap(
  map: Map<string, { prompt: number; completion: number }>,
): TokenEntry[] {
  return Array.from(map.entries())
    .map(([name, t]) => ({
      name,
      promptTokens: t.prompt,
      completionTokens: t.completion,
    }))
    .sort(
      (a, b) =>
        b.promptTokens + b.completionTokens - (a.promptTokens + a.completionTokens),
    );
}

export interface DefinedItem {
  name: string;
  provider?: string;
}

export function collectMetrics(
  sessions: Session[],
  definedAgents: DefinedItem[],
  definedSkills: DefinedItem[],
): AggregatedMetrics {
  const agentCounts = new Map<string, number>();
  const modelCounts = new Map<string, number>();
  const toolCounts = new Map<string, number>();
  const skillCounts = new Map<string, number>();
  const activityMap = new Map<string, number>();
  const agentTokens = new Map<string, { prompt: number; completion: number }>();
  const modelTokens = new Map<string, { prompt: number; completion: number }>();

  let totalRequests = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;
  const usedAgents = new Set<string>();
  const usedSkills = new Set<string>();

  for (const session of sessions) {
    for (const req of session.requests) {
      totalRequests++;

      // Agent usage — prefer custom agent name
      const agentName = req.customAgentName ?? req.agentId;
      agentCounts.set(agentName, (agentCounts.get(agentName) ?? 0) + 1);
      if (req.customAgentName) usedAgents.add(req.customAgentName);

      // Model usage
      modelCounts.set(req.modelId, (modelCounts.get(req.modelId) ?? 0) + 1);

      // Token usage
      promptTokens += req.usage.promptTokens;
      completionTokens += req.usage.completionTokens;
      cacheReadTokens += req.usage.cacheReadTokens ?? 0;
      cacheCreationTokens += req.usage.cacheCreationTokens ?? 0;

      // Tokens by agent
      const agentTok = agentTokens.get(agentName) ?? { prompt: 0, completion: 0 };
      agentTok.prompt += req.usage.promptTokens;
      agentTok.completion += req.usage.completionTokens;
      agentTokens.set(agentName, agentTok);

      // Tokens by model
      const modelTok = modelTokens.get(req.modelId) ?? { prompt: 0, completion: 0 };
      modelTok.prompt += req.usage.promptTokens;
      modelTok.completion += req.usage.completionTokens;
      modelTokens.set(req.modelId, modelTok);

      // Tool usage
      for (const tc of req.toolCalls) {
        toolCounts.set(tc.name, (toolCounts.get(tc.name) ?? 0) + 1);
      }

      // Skill usage
      for (const skill of req.loadedSkills) {
        skillCounts.set(skill, (skillCounts.get(skill) ?? 0) + 1);
        usedSkills.add(skill);
      }

      // Activity by date
      const date = new Date(req.timestamp).toISOString().slice(0, 10);
      activityMap.set(date, (activityMap.get(date) ?? 0) + 1);
    }
  }

  // Sort activity by date
  const activity: ActivityEntry[] = Array.from(activityMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Unused detection
  const unusedAgents: UnusedEntry[] = definedAgents
    .filter((a) => !usedAgents.has(a.name))
    .map((a) => ({ name: a.name, provider: a.provider }));
  const unusedSkills: UnusedEntry[] = definedSkills
    .filter((s) => !usedSkills.has(s.name))
    .map((s) => ({ name: s.name, provider: s.provider }));

  return {
    totalSessions: sessions.length,
    totalRequests,
    totalTokens: { prompt: promptTokens, completion: completionTokens },
    cacheTokens: { read: cacheReadTokens, creation: cacheCreationTokens },
    agentUsage: countMap(agentCounts),
    modelUsage: countMap(modelCounts),
    toolUsage: countMap(toolCounts),
    skillUsage: countMap(skillCounts),
    tokensByAgent: tokenMap(agentTokens),
    tokensByModel: tokenMap(modelTokens),
    activity,
    unusedAgents,
    unusedSkills,
  };
}
