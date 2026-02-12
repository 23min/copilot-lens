export interface Handoff {
  label: string;
  agent: string;
  prompt: string;
  send: boolean;
}

export interface Agent {
  name: string;
  description: string;
  tools: string[];
  model: string[];
  handoffs: Handoff[];
  body: string;
  filePath: string;
}
