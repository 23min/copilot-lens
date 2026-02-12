export type NodeKind = "agent" | "skill" | "builtin-agent";

export interface GraphNode {
  id: string;
  label: string;
  kind: NodeKind;
  description: string;
  filePath?: string;
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
