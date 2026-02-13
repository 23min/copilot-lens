import { LitElement, html, css, svg } from "lit";
import { customElement, state } from "lit/decorators.js";

interface CountEntry {
  name: string;
  count: number;
}

interface ActivityEntry {
  date: string;
  count: number;
}

interface AggregatedMetrics {
  totalSessions: number;
  totalRequests: number;
  totalTokens: { prompt: number; completion: number };
  agentUsage: CountEntry[];
  modelUsage: CountEntry[];
  toolUsage: CountEntry[];
  skillUsage: CountEntry[];
  activity: ActivityEntry[];
  unusedAgents: string[];
  unusedSkills: string[];
}

@customElement("metrics-dashboard")
class MetricsDashboard extends LitElement {
  static styles = css`
    :host {
      display: block;
      max-width: 900px;
      margin: 0 auto;
    }
    h1 {
      font-size: 20px;
      margin: 0 0 20px;
      font-weight: 500;
    }
    h2 {
      font-size: 14px;
      margin: 24px 0 12px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      opacity: 0.7;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 12px;
      margin-bottom: 24px;
    }
    .stat-card {
      background: var(--vscode-editorWidget-background, #252526);
      border: 1px solid var(--vscode-editorWidget-border, #454545);
      border-radius: 6px;
      padding: 16px;
    }
    .stat-value {
      font-size: 28px;
      font-weight: 600;
      line-height: 1;
    }
    .stat-label {
      font-size: 11px;
      opacity: 0.6;
      margin-top: 4px;
    }
    .bar-chart {
      margin: 8px 0 16px;
    }
    .bar-row {
      display: flex;
      align-items: center;
      margin: 4px 0;
      font-size: 12px;
    }
    .bar-label {
      width: 180px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .bar-track {
      flex: 1;
      height: 18px;
      background: var(--vscode-editorWidget-border, #333);
      border-radius: 3px;
      overflow: hidden;
      margin: 0 8px;
    }
    .bar-fill {
      height: 100%;
      border-radius: 3px;
      transition: width 0.3s ease;
    }
    .bar-count {
      width: 40px;
      text-align: right;
      opacity: 0.7;
      flex-shrink: 0;
    }
    .unused-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: 8px 0;
    }
    .unused-tag {
      background: var(--vscode-inputValidation-warningBackground, #352a05);
      border: 1px solid var(--vscode-inputValidation-warningBorder, #9d8b1e);
      border-radius: 4px;
      padding: 2px 8px;
      font-size: 12px;
    }
    .empty-state {
      opacity: 0.5;
      font-style: italic;
      font-size: 13px;
      padding: 8px 0;
    }
    .activity-chart {
      margin: 8px 0 16px;
    }
  `;

  @state() private metrics: AggregatedMetrics | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("message", this.handleMessage);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("message", this.handleMessage);
  }

  private handleMessage = (e: MessageEvent): void => {
    if (e.data.type === "update-metrics") {
      this.metrics = e.data.metrics;
    }
  };

  private renderBarChart(
    entries: CountEntry[],
    color: string,
    maxItems = 10,
  ) {
    const items = entries.slice(0, maxItems);
    const maxCount = Math.max(...items.map((e) => e.count), 1);

    return html`
      <div class="bar-chart">
        ${items.map(
          (entry) => html`
            <div class="bar-row">
              <span class="bar-label" title="${entry.name}">${entry.name}</span>
              <div class="bar-track">
                <div
                  class="bar-fill"
                  style="width: ${(entry.count / maxCount) * 100}%; background: ${color};"
                ></div>
              </div>
              <span class="bar-count">${entry.count}</span>
            </div>
          `,
        )}
        ${items.length === 0
          ? html`<div class="empty-state">No data</div>`
          : null}
      </div>
    `;
  }

  private renderActivityChart(activity: ActivityEntry[]) {
    if (activity.length === 0) {
      return html`<div class="empty-state">No activity data</div>`;
    }

    const maxCount = Math.max(...activity.map((a) => a.count), 1);
    const width = 800;
    const height = 120;
    const padding = { top: 10, right: 10, bottom: 25, left: 10 };
    const barWidth = Math.min(
      30,
      (width - padding.left - padding.right) / activity.length - 2,
    );

    return html`
      <div class="activity-chart">
        <svg viewBox="0 0 ${width} ${height}" style="width: 100%; height: ${height}px;">
          ${activity.map((entry, i) => {
            const x =
              padding.left +
              i * ((width - padding.left - padding.right) / activity.length) +
              barWidth / 4;
            const barHeight =
              (entry.count / maxCount) *
              (height - padding.top - padding.bottom);
            const y = height - padding.bottom - barHeight;

            return svg`
              <rect
                x="${x}"
                y="${y}"
                width="${barWidth}"
                height="${barHeight}"
                fill="#4fc1ff"
                opacity="0.8"
                rx="2"
              />
              <text
                x="${x + barWidth / 2}"
                y="${height - 5}"
                text-anchor="middle"
                fill="currentColor"
                font-size="9"
                opacity="0.5"
              >${entry.date.slice(5)}</text>
            `;
          })}
        </svg>
      </div>
    `;
  }

  private formatNumber(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return String(n);
  }

  protected render() {
    if (!this.metrics) {
      return html`<div class="empty-state">Loading metrics...</div>`;
    }

    const m = this.metrics;

    return html`
      <h1>Copilot Lens Metrics</h1>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${m.totalSessions}</div>
          <div class="stat-label">Sessions</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${m.totalRequests}</div>
          <div class="stat-label">Requests</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">
            ${this.formatNumber(m.totalTokens.prompt + m.totalTokens.completion)}
          </div>
          <div class="stat-label">Total Tokens</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">
            ${this.formatNumber(m.totalTokens.prompt)}
          </div>
          <div class="stat-label">Prompt Tokens</div>
        </div>
      </div>

      <h2>Activity</h2>
      ${this.renderActivityChart(m.activity)}

      <h2>Agent Usage</h2>
      ${this.renderBarChart(m.agentUsage, "#4fc1ff")}

      <h2>Model Usage</h2>
      ${this.renderBarChart(m.modelUsage, "#c586c0")}

      <h2>Tool Calls</h2>
      ${this.renderBarChart(m.toolUsage, "#dcdcaa")}

      <h2>Skill Usage</h2>
      ${this.renderBarChart(m.skillUsage, "#4ec9b0")}

      ${m.unusedAgents.length > 0 || m.unusedSkills.length > 0
        ? html`
            <h2>Unused</h2>
            ${m.unusedAgents.length > 0
              ? html`
                  <div style="font-size: 12px; opacity: 0.6; margin-bottom: 4px;">
                    Agents defined but never used:
                  </div>
                  <div class="unused-list">
                    ${m.unusedAgents.map(
                      (name) => html`<span class="unused-tag">${name}</span>`,
                    )}
                  </div>
                `
              : null}
            ${m.unusedSkills.length > 0
              ? html`
                  <div
                    style="font-size: 12px; opacity: 0.6; margin-bottom: 4px; margin-top: 8px;"
                  >
                    Skills defined but never loaded:
                  </div>
                  <div class="unused-list">
                    ${m.unusedSkills.map(
                      (name) => html`<span class="unused-tag">${name}</span>`,
                    )}
                  </div>
                `
              : null}
          `
        : null}
    `;
  }
}
