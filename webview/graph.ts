import { LitElement, html, css, svg } from "lit";
import { customElement, state } from "lit/decorators.js";
import * as d3 from "d3";

interface GraphNode {
  id: string;
  label: string;
  kind: "agent" | "skill" | "builtin-agent";
  description: string;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

interface GraphEdge {
  source: string | GraphNode;
  target: string | GraphNode;
  label: string;
  kind: "handoff" | "skill-link";
  send: boolean;
}

interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface VsCodeApi {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();

const NODE_COLORS: Record<string, string> = {
  agent: "#4fc1ff",
  skill: "#4ec9b0",
  "builtin-agent": "#9cdcfe",
};

const NODE_RADIUS = 28;

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
      cursor: grab;
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
    .edge-line {
      fill: none;
      stroke: var(--vscode-editorWidget-border, #555);
      stroke-width: 1.5;
    }
    .edge-line.dashed {
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
  `;

  @state() private nodes: GraphNode[] = [];
  @state() private edges: GraphEdge[] = [];
  @state() private tooltip: { x: number; y: number; text: string } | null = null;
  @state() private transform = d3.zoomIdentity;

  private simulation: d3.Simulation<GraphNode, GraphEdge> | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("message", this.handleMessage);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("message", this.handleMessage);
    this.simulation?.stop();
  }

  private handleMessage = (e: MessageEvent): void => {
    const msg = e.data;
    if (msg.type === "update-graph") {
      this.setGraph(msg.graph);
    }
  };

  private setGraph(graph: Graph): void {
    this.simulation?.stop();

    this.nodes = graph.nodes.map((n) => ({ ...n }));
    this.edges = graph.edges.map((e) => ({ ...e }));

    const width = this.clientWidth || 800;
    const height = this.clientHeight || 600;

    this.simulation = d3
      .forceSimulation<GraphNode>(this.nodes)
      .force(
        "link",
        d3
          .forceLink<GraphNode, GraphEdge>(this.edges)
          .id((d) => d.id)
          .distance(150),
      )
      .force("charge", d3.forceManyBody().strength(-400))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide(NODE_RADIUS + 10))
      .on("tick", () => {
        this.requestUpdate();
      });
  }

  protected firstUpdated(): void {
    const svgEl = this.renderRoot.querySelector("svg");
    if (!svgEl) return;

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on("zoom", (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        this.transform = event.transform;
        this.requestUpdate();
      });

    d3.select(svgEl).call(zoom);
  }

  private onNodeMouseDown(e: MouseEvent, node: GraphNode): void {
    e.stopPropagation();
    const svgEl = this.renderRoot.querySelector("svg")!;
    const svgRect = svgEl.getBoundingClientRect();

    const onMouseMove = (moveEvent: MouseEvent) => {
      const x = (moveEvent.clientX - svgRect.left - this.transform.x) / this.transform.k;
      const y = (moveEvent.clientY - svgRect.top - this.transform.y) / this.transform.k;
      node.fx = x;
      node.fy = y;
      this.simulation?.alpha(0.3).restart();
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      node.fx = null;
      node.fy = null;
      this.simulation?.alpha(0.3).restart();
    };

    node.fx = node.x;
    node.fy = node.y;
    this.simulation?.alphaTarget(0.3).restart();

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
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
    const sourceNode = (e: GraphEdge) =>
      typeof e.source === "string" ? this.nodes.find((n) => n.id === e.source) : e.source;
    const targetNode = (e: GraphEdge) =>
      typeof e.target === "string" ? this.nodes.find((n) => n.id === e.target) : e.target;

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
          ${this.edges.map((edge) => {
            const s = sourceNode(edge);
            const t = targetNode(edge);
            if (!s?.x || !t?.x || !s?.y || !t?.y) return null;

            const dx = t.x - s.x;
            const dy = t.y - s.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const offsetX = (dx / dist) * NODE_RADIUS;
            const offsetY = (dy / dist) * NODE_RADIUS;

            return svg`
              <line
                class="edge-line ${edge.send ? "" : "dashed"}"
                x1="${s.x + offsetX}"
                y1="${s.y + offsetY}"
                x2="${t.x - offsetX}"
                y2="${t.y - offsetY}"
                marker-end="url(#arrowhead)"
              />
              <text
                class="edge-label"
                x="${(s.x + t.x) / 2}"
                y="${(s.y + t.y) / 2 - 6}"
              >${edge.label}</text>
            `;
          })}
          ${this.nodes.map(
            (node) => svg`
            <g
              transform="translate(${node.x ?? 0}, ${node.y ?? 0})"
              @mousedown="${(e: MouseEvent) => this.onNodeMouseDown(e, node)}"
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
          )}
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
}
