export interface SessionRequest {
  requestId: string;
  timestamp: number;
  agentId: string;
  customAgentName: string | null;
  modelId: string;
  messageText: string;
  timings: {
    firstProgress: number | null;
    totalElapsed: number | null;
  };
  usage: {
    promptTokens: number;
    completionTokens: number;
  };
  toolCalls: ToolCallInfo[];
  availableSkills: SkillRef[];
  loadedSkills: string[];
}

export interface ToolCallInfo {
  id: string;
  name: string;
}

export interface SkillRef {
  name: string;
  file: string;
}

export type SessionProviderType = "copilot" | "claude";

export interface Session {
  sessionId: string;
  title: string | null;
  creationDate: number;
  requests: SessionRequest[];
  source: string;
  provider: SessionProviderType;
}
