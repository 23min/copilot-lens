import { LitElement, html, css, svg } from "lit";
import { customElement, state } from "lit/decorators.js";
import * as d3 from "d3";

interface GraphNode {
  id: string;
  label: string;
  kind: "agent" | "skill" | "builtin-agent" | "claude-agent";
  description: string;
  x?: number;
  y?: number;
}

interface GraphEdge {
  source: string;
  target: string;
  label: string;
  kind: "handoff" | "skill-link";
  send: boolean;
}

interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const NODE_COLORS: Record<string, string> = {
  agent: "#4fc1ff",
  skill: "#4ec9b0",
  "builtin-agent": "#9cdcfe",
  "claude-agent": "#b392f0",
};

const NODE_RADIUS = 28;
const LAYER_GAP = 240;
const NODE_GAP = 90;
const PADDING = 80;

/**
 * Assign each node to a layer using longest-path from roots (nodes with no
 * incoming edges). This produces a left-to-right DAG ordering.
 */
function assignLayers(
  nodes: GraphNode[],
  edges: GraphEdge[],
): Map<string, number> {
  const inDegree = new Map<string, number>();
  const outEdges = new Map<string, string[]>();
  for (const n of nodes) {
    inDegree.set(n.id, 0);
    outEdges.set(n.id, []);
  }
  for (const e of edges) {
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
    outEdges.get(e.source)?.push(e.target);
  }

  // BFS from roots using longest path
  const layer = new Map<string, number>();
  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) {
      queue.push(id);
      layer.set(id, 0);
    }
  }

  // If no roots (cycle), just start from first node
  if (queue.length === 0 && nodes.length > 0) {
    queue.push(nodes[0].id);
    layer.set(nodes[0].id, 0);
  }

  let idx = 0;
  while (idx < queue.length) {
    const id = queue[idx++];
    const currentLayer = layer.get(id) ?? 0;
    for (const target of outEdges.get(id) ?? []) {
      const prev = layer.get(target);
      const next = currentLayer + 1;
      if (prev === undefined || next > prev) {
        layer.set(target, next);
      }
      // Only queue if all incoming edges have been visited
      // (simplified: always queue but we use max layer)
      if (!queue.includes(target)) {
        queue.push(target);
      }
    }
  }

  // Any disconnected nodes get layer 0
  for (const n of nodes) {
    if (!layer.has(n.id)) {
      layer.set(n.id, 0);
    }
  }

  return layer;
}

function layoutGraph(nodes: GraphNode[], edges: GraphEdge[]): GraphNode[] {
  const layers = assignLayers(nodes, edges);

  // Group by layer
  const byLayer = new Map<number, GraphNode[]>();
  for (const n of nodes) {
    const l = layers.get(n.id) ?? 0;
    if (!byLayer.has(l)) byLayer.set(l, []);
    byLayer.get(l)!.push(n);
  }

  const maxLayer = Math.max(...byLayer.keys(), 0);
  const positioned: GraphNode[] = [];

  for (let l = 0; l <= maxLayer; l++) {
    const group = byLayer.get(l) ?? [];
    // Sort within layer: agents first, then builtin, then skills
    const kindOrder: Record<string, number> = {
      agent: 0,
      "claude-agent": 1,
      "builtin-agent": 2,
      skill: 3,
    };
    group.sort((a, b) => (kindOrder[a.kind] ?? 9) - (kindOrder[b.kind] ?? 9));

    const x = PADDING + l * LAYER_GAP;
    const groupHeight = (group.length - 1) * NODE_GAP;
    const startY = PADDING + Math.max(0, (400 - groupHeight) / 2);

    for (let row = 0; row < group.length; row++) {
      positioned.push({
        ...group[row],
        x,
        y: startY + row * NODE_GAP,
      });
    }
  }

  return positioned;
}

@customElement("graph-view")
class GraphView extends LitElement {
  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    svg {
      width: 100%;
      height: 100%;
    }
    .node-circle {
      stroke-width: 2;
    }
    .node-circle:hover {
      stroke-width: 3;
      filter: brightness(1.2);
    }
    .node-label {
      fill: var(--vscode-editor-foreground, #ccc);
      font-size: 11px;
      text-anchor: middle;
      pointer-events: none;
      font-family: var(--vscode-font-family, sans-serif);
    }
    .edge-path {
      fill: none;
      stroke: var(--vscode-editorWidget-border, #555);
      stroke-width: 1.5;
    }
    .edge-path.dashed {
      stroke-dasharray: 6 3;
    }
    .edge-label {
      fill: var(--vscode-descriptionForeground, #999);
      font-size: 9px;
      text-anchor: middle;
      pointer-events: none;
      font-family: var(--vscode-font-family, sans-serif);
    }
    .arrowhead {
      fill: var(--vscode-editorWidget-border, #555);
    }
    .tooltip {
      position: absolute;
      background: var(--vscode-editorHoverWidget-background, #252526);
      border: 1px solid var(--vscode-editorHoverWidget-border, #454545);
      color: var(--vscode-editorHoverWidget-foreground, #ccc);
      padding: 6px 10px;
      border-radius: 4px;
      font-size: 12px;
      pointer-events: none;
      max-width: 300px;
      z-index: 100;
      font-family: var(--vscode-font-family, sans-serif);
    }
    .kind-badge {
      font-size: 9px;
      opacity: 0.7;
      fill: var(--vscode-editor-foreground, #ccc);
      text-anchor: middle;
      pointer-events: none;
    }
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      gap: 16px;
      color: var(--vscode-descriptionForeground, #999);
      font-family: var(--vscode-font-family, sans-serif);
      text-align: center;
      padding: 40px;
    }
    .empty-state h2 {
      margin: 0;
      font-size: 18px;
      font-weight: 500;
      color: var(--vscode-editor-foreground, #ccc);
    }
    .empty-state p {
      margin: 0;
      font-size: 13px;
      line-height: 1.6;
      max-width: 480px;
    }
    .empty-state a {
      color: var(--vscode-textLink-foreground, #3794ff);
      text-decoration: none;
    }
    .empty-state a:hover {
      text-decoration: underline;
    }
    .empty-state .doc-links {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 8px;
    }
    .empty-state .doc-link {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
    }
  `;

  @state() private nodes: GraphNode[] = [];
  @state() private edges: GraphEdge[] = [];
  @state() private tooltip: { x: number; y: number; text: string } | null =
    null;
  @state() private transform = d3.zoomIdentity;

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("message", this.handleMessage);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("message", this.handleMessage);
  }

  private handleMessage = (e: MessageEvent): void => {
    const msg = e.data;
    if (msg.type === "update-graph") {
      this.setGraph(msg.graph);
    }
  };

  private zoom: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null;

  private setGraph(graph: Graph): void {
    this.nodes = layoutGraph(graph.nodes, graph.edges);
    this.edges = graph.edges.map((e) => ({ ...e }));
    // Fit to viewport after next render
    this.updateComplete.then(() => this.fitToView());
  }

  private fitToView(): void {
    if (this.nodes.length === 0) return;
    const svgEl = this.renderRoot.querySelector("svg");
    if (!svgEl) return;

    const vw = this.clientWidth || 800;
    const vh = this.clientHeight || 600;
    const margin = 60;

    // Compute bounding box of all nodes (accounting for radius + badge)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of this.nodes) {
      const nx = n.x ?? 0;
      const ny = n.y ?? 0;
      minX = Math.min(minX, nx - NODE_RADIUS - 10);
      minY = Math.min(minY, ny - NODE_RADIUS - 10);
      maxX = Math.max(maxX, nx + NODE_RADIUS + 10);
      maxY = Math.max(maxY, ny + NODE_RADIUS + 20); // extra for kind badge
    }

    const graphW = maxX - minX;
    const graphH = maxY - minY;
    const availW = vw - margin * 2;
    const availH = vh - margin * 2;
    const scale = Math.min(availW / graphW, availH / graphH, 2);
    const tx = (vw - graphW * scale) / 2 - minX * scale;
    const ty = (vh - graphH * scale) / 2 - minY * scale;

    const t = d3.zoomIdentity.translate(tx, ty).scale(scale);
    this.transform = t;

    // Sync zoom state so further pan/zoom works from this position
    if (this.zoom) {
      d3.select(svgEl).call(this.zoom.transform, t);
    }
  }

  protected firstUpdated(): void {
    this.setupZoom();
  }

  protected updated(): void {
    this.setupZoom();
  }

  private zoomAttached = false;

  private setupZoom(): void {
    if (this.zoomAttached) return;
    const svgEl = this.renderRoot.querySelector("svg");
    if (!svgEl) return;
    this.zoomAttached = true;

    this.zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on("zoom", (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        this.transform = event.transform;
      });

    d3.select(svgEl).call(this.zoom);
  }

  private nodeById(id: string): GraphNode | undefined {
    return this.nodes.find((n) => n.id === id);
  }

  private onNodeHover(e: MouseEvent, node: GraphNode): void {
    this.tooltip = {
      x: e.clientX + 12,
      y: e.clientY + 12,
      text: node.description || node.label,
    };
  }

  private onNodeLeave(): void {
    this.tooltip = null;
  }

  protected render() {
    if (this.nodes.length === 0) {
      return html`
        <div class="empty-state">
          <h2>No agents or skills found</h2>
          <p>
            Agent Lens visualizes the agents and skills defined in your project.
            Add agent or skill configuration files to see them here.
          </p>
          <div class="doc-links">
            <div class="doc-link">
              <span>GitHub Copilot:</span>
              <a href="https://code.visualstudio.com/docs/copilot/customization/custom-agents#_what-are-custom-agents"
                >Custom agents &amp; skills</a>
            </div>
            <div class="doc-link">
              <span>Claude Code:</span>
              <a href="https://code.claude.com/docs/en/sub-agents"
                >Sub-agents</a>
            </div>
          </div>
        </div>
      `;
    }

    return html`
      <svg>
        <defs>
          <marker
            id="arrowhead"
            viewBox="0 0 10 6"
            refX="10"
            refY="3"
            markerWidth="10"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 3 L 0 6 z" class="arrowhead" />
          </marker>
        </defs>
        <g transform="${this.transform.toString()}">
          ${this.renderEdges()} ${this.renderNodes()}
        </g>
      </svg>
      ${this.tooltip
        ? html`<div
            class="tooltip"
            style="left: ${this.tooltip.x}px; top: ${this.tooltip.y}px"
          >
            ${this.tooltip.text}
          </div>`
        : null}
    `;
  }

  private renderEdges() {
    return this.edges.map((edge) => {
      const s = this.nodeById(edge.source);
      const t = this.nodeById(edge.target);
      if (!s?.x || !t?.x || !s?.y || !t?.y) return null;

      // Bezier curve: exit right of source, enter left of target
      const sx = s.x + NODE_RADIUS;
      const sy = s.y;
      const tx = t.x - NODE_RADIUS;
      const ty = t.y;
      const cpOffset = Math.min(Math.abs(tx - sx) * 0.5, 120);
      const path = `M ${sx} ${sy} C ${sx + cpOffset} ${sy}, ${tx - cpOffset} ${ty}, ${tx} ${ty}`;

      // Place label at midpoint of the curve
      const midX = (sx + tx) / 2;
      const midY = (sy + ty) / 2;

      return svg`
        <path
          class="edge-path ${edge.send ? "" : "dashed"}"
          d="${path}"
          marker-end="url(#arrowhead)"
        />
        <text
          class="edge-label"
          x="${midX}"
          y="${midY - 8}"
        >${edge.label}</text>
      `;
    });
  }

  private renderNodes() {
    return this.nodes.map(
      (node) => svg`
        <g
          transform="translate(${node.x ?? 0}, ${node.y ?? 0})"
          @mouseenter="${(e: MouseEvent) => this.onNodeHover(e, node)}"
          @mouseleave="${() => this.onNodeLeave()}"
        >
          <circle
            class="node-circle"
            r="${NODE_RADIUS}"
            fill="${NODE_COLORS[node.kind] ?? "#888"}"
            stroke="${NODE_COLORS[node.kind] ?? "#888"}"
            fill-opacity="0.15"
          />
          <text class="node-label" dy="2">${node.label}</text>
          <text class="kind-badge" dy="${NODE_RADIUS + 14}">${node.kind}</text>
        </g>
      `,
    );
  }
}
