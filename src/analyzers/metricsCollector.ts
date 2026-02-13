import type { Session } from "../models/session.js";
import type { AggregatedMetrics, CountEntry, ActivityEntry } from "../models/metrics.js";

function countMap(map: Map<string, number>): CountEntry[] {
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

export function collectMetrics(
  sessions: Session[],
  definedAgentNames: string[],
  definedSkillNames: string[],
): AggregatedMetrics {
  const agentCounts = new Map<string, number>();
  const modelCounts = new Map<string, number>();
  const toolCounts = new Map<string, number>();
  const skillCounts = new Map<string, number>();
  const activityMap = new Map<string, number>();

  let totalRequests = 0;
  let promptTokens = 0;
  let completionTokens = 0;
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
  const unusedAgents = definedAgentNames.filter((n) => !usedAgents.has(n));
  const unusedSkills = definedSkillNames.filter((n) => !usedSkills.has(n));

  return {
    totalSessions: sessions.length,
    totalRequests,
    totalTokens: { prompt: promptTokens, completion: completionTokens },
    agentUsage: countMap(agentCounts),
    modelUsage: countMap(modelCounts),
    toolUsage: countMap(toolCounts),
    skillUsage: countMap(skillCounts),
    activity,
    unusedAgents,
    unusedSkills,
  };
}
