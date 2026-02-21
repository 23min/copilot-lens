import { LitElement, html, css, svg } from "lit";
import { customElement, state } from "lit/decorators.js";
import * as d3 from "d3";
import { layoutGraph } from "./layout.js";
import type { GraphNode, GraphEdge } from "./layout.js";

type ProviderFilter = "copilot" | "claude";

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
  agent: "#3b82f6",
  skill: "#10b981",
  "builtin-agent": "#f59e0b",
  "claude-agent": "#a855f7",
};

const NODE_LABELS: Record<string, string> = {
  agent: "Agent",
  skill: "Skill",
  "builtin-agent": "Built-in",
  "claude-agent": "Agent",
};

const NODE_RADIUS = 14;
const RING_RADIUS = 19;

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
    .node-dot {
      cursor: pointer;
    }
    .node-dot:hover {
      filter: brightness(1.3);
    }
    .node-label {
      fill: var(--vscode-editor-foreground, #ccc);
      font-size: 11px;
      text-anchor: start;
      pointer-events: none;
      font-family: var(--vscode-font-family, sans-serif);
      font-weight: 500;
    }
    .edge-path {
      fill: none;
      stroke: var(--vscode-editorWidget-border, #555);
      stroke-width: 2;
      stroke-opacity: 0.6;
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
      fill-opacity: 0.6;
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
    .toolbar {
      position: absolute;
      top: 8px;
      left: 8px;
      z-index: 10;
      display: flex;
      gap: 2px;
    }
    .filter-btn {
      background: var(--vscode-button-secondaryBackground, #3a3d41);
      color: var(--vscode-button-secondaryForeground, #ccc);
      border: 1px solid var(--vscode-editorWidget-border, #454545);
      padding: 4px 10px;
      font-size: 11px;
      cursor: pointer;
      font-family: var(--vscode-font-family, sans-serif);
    }
    .filter-btn:first-child { border-radius: 4px 0 0 4px; }
    .filter-btn:last-child { border-radius: 0 4px 4px 0; }
    .filter-btn.active {
      background: var(--vscode-button-background, #0e639c);
      color: var(--vscode-button-foreground, #fff);
    }
    .legend {
      position: absolute;
      bottom: 12px;
      left: 12px;
      z-index: 10;
      display: flex;
      flex-direction: column;
      gap: 6px;
      background: var(--vscode-editorWidget-background, #1e1e1e);
      border: 1px solid var(--vscode-editorWidget-border, #454545);
      border-radius: 6px;
      padding: 10px 14px;
      font-family: var(--vscode-font-family, sans-serif);
      font-size: 11px;
      color: var(--vscode-editor-foreground, #ccc);
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .legend-line {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .legend-line-sample {
      width: 20px;
      height: 0;
      border-top: 2px solid var(--vscode-editorWidget-border, #555);
    }
    .legend-line-sample.dashed {
      border-top-style: dashed;
    }
  `;

  @state() private nodes: GraphNode[] = [];
  @state() private edges: GraphEdge[] = [];
  @state() private edgePaths: Map<string, [number, number][]> = new Map();
  @state() private reversedEdges: Set<string> = new Set();
  @state() private selfLoops: GraphEdge[] = [];
  @state() private tooltip: { x: number; y: number; text: string } | null =
    null;
  @state() private transform = d3.zoomIdentity;
  @state() private activeFilter: ProviderFilter = "copilot";

  private allNodes: GraphNode[] = [];
  private allEdges: GraphEdge[] = [];

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
    this.allNodes = graph.nodes;
    this.allEdges = graph.edges.map((e) => ({ ...e }));
    this.applyFilter();
  }

  private onFilterChange(filter: ProviderFilter): void {
    this.activeFilter = filter;
    this.applyFilter();
  }

  private applyFilter(): void {
    const filteredNodes = this.allNodes.filter(
      (n) => n.provider === this.activeFilter || n.kind === "builtin-agent",
    );
    const nodeIds = new Set(filteredNodes.map((n) => n.id));
    const filteredEdges = this.allEdges.filter(
      (e) => nodeIds.has(e.source) && nodeIds.has(e.target),
    );
    const result = layoutGraph(filteredNodes, filteredEdges);
    this.nodes = result.nodes;
    this.edges = filteredEdges;
    this.edgePaths = result.edgePaths;
    this.reversedEdges = result.reversedEdges;
    this.selfLoops = result.selfLoops;
    this.updateComplete.then(() => this.fitToView());
  }

  private fitToView(): void {
    if (this.nodes.length === 0) return;
    const svgEl = this.renderRoot.querySelector("svg");
    if (!svgEl) return;

    const vw = this.clientWidth || 800;
    const vh = this.clientHeight || 600;
    const margin = 60;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of this.nodes) {
      const nx = n.x ?? 0;
      const ny = n.y ?? 0;
      minX = Math.min(minX, nx - RING_RADIUS - 10);
      minY = Math.min(minY, ny - RING_RADIUS - 10);
      maxX = Math.max(maxX, nx + RING_RADIUS + 100); // extra for side label
      maxY = Math.max(maxY, ny + RING_RADIUS + 10);
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

  private renderFilterToolbar() {
    const options: { value: ProviderFilter; label: string }[] = [
      { value: "copilot", label: "Copilot" },
      { value: "claude", label: "Claude" },
    ];
    return html`
      <div class="toolbar">
        ${options.map(
          (opt) => html`
            <button
              class="filter-btn ${this.activeFilter === opt.value ? "active" : ""}"
              @click="${() => this.onFilterChange(opt.value)}"
            >
              ${opt.label}
            </button>
          `,
        )}
      </div>
    `;
  }

  private renderLegend() {
    // Collect which kinds are present in the current view
    const kinds = new Set(this.nodes.map((n) => n.kind));
    const hasSendEdge = this.edges.some((e) => e.send);
    const hasReceiveEdge = this.edges.some((e) => !e.send);

    return html`
      <div class="legend">
        ${[...kinds].map(
          (kind) => html`
            <div class="legend-item">
              <div
                class="legend-dot"
                style="background: ${NODE_COLORS[kind] ?? "#888"}"
              ></div>
              <span>${NODE_LABELS[kind] ?? kind}</span>
            </div>
          `,
        )}
        ${hasSendEdge
          ? html`
              <div class="legend-line">
                <div class="legend-line-sample"></div>
                <span>Handoff</span>
              </div>
            `
          : null}
        ${hasReceiveEdge
          ? html`
              <div class="legend-line">
                <div class="legend-line-sample dashed"></div>
                <span>Receive</span>
              </div>
            `
          : null}
      </div>
    `;
  }

  protected render() {
    if (this.allNodes.length === 0) {
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
      ${this.renderFilterToolbar()}
      <svg>
        <defs>
          <marker
            id="arrowhead"
            viewBox="0 0 10 6"
            refX="10"
            refY="3"
            markerWidth="8"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 3 L 0 6 z" class="arrowhead" />
          </marker>
        </defs>
        <g transform="${this.transform.toString()}">
          ${this.renderEdges()} ${this.renderNodes()}
        </g>
      </svg>
      ${this.nodes.length > 0 ? this.renderLegend() : null}
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

  private readonly pathGen = d3.line<[number, number]>()
    .x((d) => d[0])
    .y((d) => d[1])
    .curve(d3.curveBasis);

  private renderEdges() {
    const edgeSvg = this.edges.map((edge) => {
      const key = `${edge.source}->${edge.target}`;
      const points = this.edgePaths.get(key);
      if (!points || points.length < 2) return null;

      const pathD = this.pathGen(points);
      if (!pathD) return null;

      const isReversed = this.reversedEdges.has(key);
      const isDashed = !edge.send || isReversed;

      const midIdx = Math.floor(points.length / 2);
      const [midX, midY] = points[midIdx];

      return svg`
        <path
          class="edge-path ${isDashed ? "dashed" : ""}"
          d="${pathD}"
          marker-end="url(#arrowhead)"
        />
        <text
          class="edge-label"
          x="${midX}"
          y="${midY - 8}"
        >${edge.label}</text>
      `;
    });

    const loopSvg = this.selfLoops.map((edge) => {
      const node = this.nodeById(edge.source);
      if (!node?.x || !node?.y) return null;
      const x = node.x + NODE_RADIUS;
      const y = node.y - 8;
      const r = 14;
      return svg`
        <path
          class="edge-path dashed"
          d="M ${x} ${y} A ${r} ${r} 0 1 1 ${x} ${y + 16}"
          marker-end="url(#arrowhead)"
        />
      `;
    });

    return [...edgeSvg, ...loopSvg];
  }

  private renderNodes() {
    return this.nodes.map((node) => {
      const color = NODE_COLORS[node.kind] ?? "#888";
      return svg`
        <g
          class="node-dot"
          transform="translate(${node.x ?? 0}, ${node.y ?? 0})"
          @mouseenter="${(e: MouseEvent) => this.onNodeHover(e, node)}"
          @mouseleave="${() => this.onNodeLeave()}"
        >
          <circle
            r="${RING_RADIUS}"
            fill="none"
            stroke="${color}"
            stroke-width="3"
            stroke-opacity="0.25"
          />
          <circle
            r="${NODE_RADIUS}"
            fill="${color}"
          />
          <text class="node-label" x="${RING_RADIUS + 6}" dy="4">${node.label}</text>
        </g>
      `;
    });
  }
}
