// ---------------------------------------------------------------------------
// <session-timeline> — Lit component for horizontal session timeline.
//
// Renders request bars on a scrollable SVG timeline, with tracks for subagent
// branches and a minimap scrollbar for navigation.
// Hover for tooltip, click to select a request.
// ---------------------------------------------------------------------------

import { LitElement, html, css, svg } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { scaleTime } from "d3";
import {
  computeTimelineLayout,
  computeMinimapViewport,
  type TimelineBar,
  type TimelineConnector,
  type LegendEntry,
  type TimelineLayoutResult,
  type SessionRequestLike,
} from "./timelineLayout.js";

const TRACK_HEIGHT = 22;
const PADDING = 16;
const SVG_HEIGHT = 48;
const MINIMAP_HEIGHT = 24;

@customElement("session-timeline")
export class SessionTimeline extends LitElement {
  static styles = css`
    :host {
      display: block;
      width: 100%;
      position: relative;
      margin-bottom: 16px;
      background: var(--vscode-editorWidget-background, #252526);
      border: 1px solid var(--vscode-editorWidget-border, #454545);
      border-radius: 6px;
    }
    .main-viewport {
      overflow: hidden;
      position: relative;
    }
    .timeline-svg {
      display: block;
    }
    .bar {
      cursor: pointer;
    }
    .bar:hover {
      filter: brightness(1.4);
    }
    .bar.selected {
      filter: brightness(1.5);
    }
    .connector-line {
      stroke-linecap: round;
    }
    .time-label {
      fill: var(--vscode-descriptionForeground, #999);
      font-size: 9px;
      text-anchor: middle;
      pointer-events: none;
      font-family: var(--vscode-font-family, sans-serif);
    }
    .time-line {
      stroke: var(--vscode-editorWidget-border, #666);
      stroke-width: 1;
      stroke-dasharray: 4 3;
      stroke-opacity: 0.5;
    }
    .day-line {
      stroke: var(--vscode-editorWidget-border, #aaa);
      stroke-width: 2;
      stroke-dasharray: 8 4;
      stroke-opacity: 0.9;
    }
    .track-line {
      stroke: var(--vscode-editorWidget-border, #555);
      stroke-width: 1;
      stroke-opacity: 0.4;
    }
    .minimap-container {
      border-top: 1px solid var(--vscode-editorWidget-border, #454545);
      background: var(--vscode-editor-background, #1e1e1e);
      cursor: pointer;
      position: relative;
    }
    .minimap-svg {
      display: block;
      width: 100%;
    }
    .minimap-viewport {
      fill: var(--vscode-focusBorder, #007fd4);
      fill-opacity: 0.2;
      stroke: var(--vscode-focusBorder, #007fd4);
      stroke-width: 1;
      cursor: grab;
    }
    .minimap-viewport:active {
      cursor: grabbing;
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 14px;
      padding: 6px 10px;
      font-size: 12px;
      font-family: var(--vscode-font-family, sans-serif);
      color: var(--vscode-descriptionForeground, #999);
      border-bottom: 1px solid var(--vscode-editorWidget-border, #454545);
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .legend-swatch {
      width: 12px;
      height: 8px;
      border-radius: 2px;
      flex-shrink: 0;
      display: inline-block;
    }
    .tooltip {
      position: absolute;
      background: var(--vscode-editorHoverWidget-background, #252526);
      border: 1px solid var(--vscode-editorHoverWidget-border, #454545);
      color: var(--vscode-editorHoverWidget-foreground, #ccc);
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      pointer-events: none;
      max-width: 300px;
      z-index: 100;
      font-family: var(--vscode-font-family, sans-serif);
      white-space: nowrap;
    }
    .tooltip-label {
      font-weight: 600;
      margin-bottom: 3px;
    }
    .tooltip-detail {
      opacity: 0.7;
      font-size: 11px;
    }
  `;

  @property({ type: Array }) requests: SessionRequestLike[] = [];
  @property({ type: String }) selectedRequestId: string | null = null;

  @state() private layout: TimelineLayoutResult | null = null;
  @state() private scrollX = 0;
  @state() private viewportWidth = 800;
  @state() private tooltip: {
    x: number;
    y: number;
    bar: TimelineBar;
    request: SessionRequestLike;
  } | null = null;

  private resizeObserver?: ResizeObserver;

  connectedCallback(): void {
    super.connectedCallback();
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        this.viewportWidth = entry.contentRect.width;
        this.recomputeLayout();
      }
    });
    this.resizeObserver.observe(this);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.resizeObserver?.disconnect();
  }

  protected willUpdate(changed: Map<string, unknown>): void {
    if (changed.has("requests")) {
      this.recomputeLayout();
    }
  }

  private recomputeLayout(): void {
    if (this.requests.length === 0) {
      this.layout = null;
      return;
    }
    const viewWidth = this.clientWidth || 800;
    this.layout = computeTimelineLayout({
      requests: this.requests,
      viewWidth,
      minBarSpacing: 12,
      trackHeight: TRACK_HEIGHT,
      padding: PADDING,
    });
    // Clamp scrollX if layout shrank
    const maxScroll = Math.max(0, this.layout.totalWidth - this.viewportWidth);
    if (this.scrollX > maxScroll) {
      this.scrollX = maxScroll;
    }
  }

  // Build a requestId → SessionRequestLike lookup
  private get requestById(): Map<string, SessionRequestLike> {
    const m = new Map<string, SessionRequestLike>();
    for (const r of this.requests) {
      m.set(r.requestId, r);
    }
    return m;
  }

  // ---- Scroll interactions ----

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    if (!this.layout) return;
    const maxScroll = Math.max(0, this.layout.totalWidth - this.viewportWidth);
    this.scrollX = Math.max(
      0,
      Math.min(maxScroll, this.scrollX + e.deltaX + e.deltaY),
    );
  }

  private onMinimapClick(e: MouseEvent): void {
    if (!this.layout) return;
    // Ignore clicks on the viewport handle (it uses drag)
    if ((e.target as Element)?.classList?.contains("minimap-viewport")) return;

    const rect = (e.currentTarget as Element).getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const minimapScale = this.viewportWidth / this.layout.totalWidth;
    const targetScroll = clickX / minimapScale - this.viewportWidth / 2;
    const maxScroll = Math.max(0, this.layout.totalWidth - this.viewportWidth);
    this.scrollX = Math.max(0, Math.min(maxScroll, targetScroll));
  }

  private onMinimapDragStart(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    if (!this.layout) return;

    const startX = e.clientX;
    const startScroll = this.scrollX;
    const minimapScale = this.viewportWidth / this.layout.totalWidth;
    const maxScroll = Math.max(0, this.layout.totalWidth - this.viewportWidth);

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const scrollDelta = dx / minimapScale;
      this.scrollX = Math.max(
        0,
        Math.min(maxScroll, startScroll + scrollDelta),
      );
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // ---- Tooltip & selection ----

  private onBarHover(e: MouseEvent, bar: TimelineBar): void {
    const req = this.requestById.get(bar.requestId);
    if (!req) return;
    const hostRect = this.getBoundingClientRect();
    let x = e.clientX - hostRect.left + 16;
    let y = e.clientY - hostRect.top - 50;
    // Flip tooltip to left side if it would overflow the right edge
    if (x + 220 > hostRect.width) {
      x = e.clientX - hostRect.left - 16 - 220;
    }
    if (x < 0) x = 4;
    // Keep tooltip within the component vertically
    if (y < 4) y = 4;
    this.tooltip = { x, y, bar, request: req };
  }

  private onBarLeave(): void {
    this.tooltip = null;
  }

  private onBarClick(bar: TimelineBar): void {
    this.dispatchEvent(
      new CustomEvent("request-select", {
        detail: bar.requestId,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private formatTokens(req: SessionRequestLike): string {
    return `Prompt: ${req.usage.promptTokens.toLocaleString()} | Completion: ${req.usage.completionTokens.toLocaleString()}`;
  }

  private formatCacheTokens(req: SessionRequestLike): string | null {
    const creation = req.usage.cacheCreationTokens ?? 0;
    const read = req.usage.cacheReadTokens ?? 0;
    if (creation === 0 && read === 0) return null;
    const parts: string[] = [];
    if (creation > 0) parts.push(`Cache create: ${creation.toLocaleString()}`);
    if (read > 0) parts.push(`Cache read: ${read.toLocaleString()}`);
    return parts.join(" | ");
  }

  private formatTime(ts: number): string {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  // ---- SVG rendering ----

  private renderTimeAndDayMarkers(layout: TimelineLayoutResult) {
    const [minTs, maxTs] = layout.timeRange;
    if (minTs === maxTs) return null;

    const scale = scaleTime()
      .domain([new Date(minTs), new Date(maxTs)])
      .range([PADDING, layout.totalWidth - PADDING]);

    const contentHeight = PADDING * 2 + layout.trackCount * TRACK_HEIGHT;
    const result: unknown[] = [];

    // Time ticks (always shown)
    const ticks = scale.ticks(6);
    for (const tick of ticks) {
      const x = scale(tick);
      const label = tick.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      result.push(svg`
        <line class="time-line" x1="${x}" y1="4" x2="${x}" y2="${contentHeight - 4}" />
        <text class="time-label" x="${x}" y="${contentHeight + 10}">${label}</text>
      `);
    }

    // Day boundary lines (midnight markers for multi-day sessions)
    const start = new Date(minTs);
    const nextMidnight = new Date(start);
    nextMidnight.setHours(0, 0, 0, 0);
    nextMidnight.setDate(nextMidnight.getDate() + 1);

    let current = nextMidnight;
    while (current.getTime() <= maxTs) {
      const x = scale(current);
      const label = current.toLocaleDateString([], { month: "short", day: "numeric" });
      result.push(svg`
        <line class="day-line" x1="${x}" y1="2" x2="${x}" y2="${contentHeight - 2}" />
        <text class="time-label" x="${x + 4}" y="${contentHeight + 10}" text-anchor="start" style="font-weight:600">${label}</text>
      `);
      current = new Date(current);
      current.setDate(current.getDate() + 1);
    }

    return result;
  }

  private renderTrackLines(layout: TimelineLayoutResult) {
    return Array.from({ length: layout.trackCount }, (_, track) => {
      const y = PADDING + track * TRACK_HEIGHT;
      return svg`
        <line
          class="track-line"
          x1="0" y1="${y}"
          x2="${layout.totalWidth}" y2="${y}"
        />
      `;
    });
  }

  private renderConnectors(connectors: TimelineConnector[]) {
    return connectors.map((c) => {
      return svg`
        <line
          class="connector-line"
          x1="${c.x}" y1="${c.fromY}"
          x2="${c.x}" y2="${c.toY}"
          stroke="${c.color}"
          stroke-width="1.5"
          stroke-opacity="0.6"
        />
      `;
    });
  }

  private renderBars(bars: TimelineBar[]) {
    return bars.map((bar) => {
      const isSelected = bar.requestId === this.selectedRequestId;
      return svg`
        <rect
          class="bar ${isSelected ? "selected" : ""}"
          x="${bar.x}" y="${bar.y - bar.height / 2}"
          width="${bar.width}" height="${bar.height}"
          rx="2" ry="2"
          fill="${bar.color}"
          @mouseenter="${(e: MouseEvent) => this.onBarHover(e, bar)}"
          @mouseleave="${() => this.onBarLeave()}"
          @click="${() => this.onBarClick(bar)}"
        />
      `;
    });
  }

  private renderMinimapBars(bars: TimelineBar[], scaleX: number, scaleY: number) {
    return bars.map((bar) => {
      return svg`
        <rect
          x="${bar.x * scaleX}"
          y="${(bar.y - bar.height / 2) * scaleY}"
          width="${Math.max(bar.width * scaleX, 1)}"
          height="${Math.max(bar.height * scaleY, 2)}"
          rx="1"
          fill="${bar.color}"
          fill-opacity="0.7"
        />
      `;
    });
  }

  private renderLegend(legend: LegendEntry[]) {
    if (legend.length <= 1) return null; // skip legend if only main track
    return html`
      <div class="legend">
        ${legend.map(
          (entry) => html`
            <span class="legend-item">
              <span
                class="legend-swatch"
                style="background: ${entry.color}"
              ></span>
              ${entry.label}
            </span>
          `,
        )}
      </div>
    `;
  }

  protected render() {
    if (!this.layout || this.layout.bars.length === 0) return null;

    const layout = this.layout;
    const LABEL_SPACE = 16; // room for time/day labels below tracks
    const svgH = Math.max(
      SVG_HEIGHT,
      PADDING * 2 + layout.trackCount * TRACK_HEIGHT + LABEL_SPACE,
    );

    const vp = computeMinimapViewport(
      layout.totalWidth,
      this.viewportWidth,
      this.scrollX,
    );

    const minimapScaleX = this.viewportWidth / layout.totalWidth;
    const minimapScaleY = MINIMAP_HEIGHT / svgH;

    return html`
      ${this.renderLegend(layout.legend)}
      <div class="main-viewport" @wheel="${this.onWheel}">
        <svg
          class="timeline-svg"
          width="${layout.totalWidth}"
          height="${svgH}"
          style="transform: translateX(${-this.scrollX}px)"
        >
          ${this.renderTimeAndDayMarkers(layout)} ${this.renderTrackLines(layout)}
          ${this.renderConnectors(layout.connectors)}
          ${this.renderBars(layout.bars)}
        </svg>
      </div>
      <div class="minimap-container" @click="${this.onMinimapClick}">
        <svg class="minimap-svg" height="${MINIMAP_HEIGHT}">
          ${this.renderMinimapBars(layout.bars, minimapScaleX, minimapScaleY)}
          <rect
            class="minimap-viewport"
            x="${vp.indicatorX}"
            y="0"
            width="${vp.indicatorWidth}"
            height="${MINIMAP_HEIGHT}"
            @mousedown="${this.onMinimapDragStart}"
          />
        </svg>
      </div>
      ${this.tooltip
        ? html`<div
            class="tooltip"
            style="left: ${this.tooltip.x}px; top: ${this.tooltip.y}px"
          >
            <div class="tooltip-label">${this.tooltip.bar.label}</div>
            <div class="tooltip-detail">${this.formatTime(this.tooltip.request.timestamp)}</div>
            <div class="tooltip-detail">${this.formatTokens(this.tooltip.request)}</div>
            ${this.formatCacheTokens(this.tooltip.request)
              ? html`<div class="tooltip-detail">${this.formatCacheTokens(this.tooltip.request)}</div>`
              : null}
            ${this.tooltip.request.modelId
              ? html`<div class="tooltip-detail">${this.tooltip.request.modelId}</div>`
              : null}
          </div>`
        : null}
    `;
  }
}
