export type NodeKind = "agent" | "skill" | "builtin-agent" | "claude-agent";

export interface GraphNode {
  id: string;
  label: string;
  kind: NodeKind;
  description: string;
  filePath?: string;
  provider?: string;
}

export type EdgeKind = "handoff" | "skill-link";

export interface GraphEdge {
  source: string;
  target: string;
  label: string;
  kind: EdgeKind;
  send: boolean;
}

export interface GraphWarning {
  message: string;
  source: string;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  warnings: GraphWarning[];
}
