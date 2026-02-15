import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

type SourceFilter = "all" | "copilot" | "claude" | "codex";

interface ToolCallInfo {
  id: string;
  name: string;
}

interface SkillRef {
  name: string;
  file: string;
}

interface SessionRequest {
  requestId: string;
  timestamp: number;
  agentId: string;
  customAgentName: string | null;
  modelId: string;
  messageText: string;
  timings: { firstProgress: number | null; totalElapsed: number | null };
  usage: {
    promptTokens: number;
    completionTokens: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
  };
  toolCalls: ToolCallInfo[];
  availableSkills: SkillRef[];
  loadedSkills: string[];
  isSubagent?: boolean;
}

interface Session {
  sessionId: string;
  title: string | null;
  creationDate: number;
  requests: SessionRequest[];
  source: string;
  provider: "copilot" | "claude" | "codex";
}

@customElement("session-explorer")
class SessionExplorer extends LitElement {
  static styles = css`
    :host {
      display: block;
      max-width: 900px;
      margin: 0 auto;
    }
    h1 {
      font-size: 20px;
      margin: 0 0 16px;
      font-weight: 500;
    }
    h2 {
      font-size: 16px;
      margin: 0 0 12px;
      font-weight: 500;
    }

    /* Session picker */
    .session-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 24px;
    }
    .session-item {
      display: flex;
      align-items: center;
      padding: 8px 12px;
      background: var(--vscode-editorWidget-background, #252526);
      border: 1px solid var(--vscode-editorWidget-border, #454545);
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
    }
    .session-item:hover {
      background: var(--vscode-list-hoverBackground, #2a2d2e);
    }
    .session-item.selected {
      border-color: var(--vscode-focusBorder, #007fd4);
      background: var(--vscode-list-activeSelectionBackground, #04395e);
    }
    .session-title {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .session-meta {
      font-size: 11px;
      opacity: 0.6;
      margin-left: 12px;
      white-space: nowrap;
    }
    .back-btn {
      background: none;
      border: 1px solid var(--vscode-button-border, #555);
      color: var(--vscode-button-foreground, #fff);
      padding: 4px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      margin-bottom: 12px;
      font-family: inherit;
    }
    .back-btn:hover {
      background: var(--vscode-button-hoverBackground, #333);
    }

    /* Timeline */
    .timeline {
      position: relative;
      padding-left: 24px;
    }
    .timeline::before {
      content: "";
      position: absolute;
      left: 8px;
      top: 0;
      bottom: 0;
      width: 2px;
      background: var(--vscode-editorWidget-border, #454545);
    }
    .timeline-entry {
      position: relative;
      margin-bottom: 16px;
      padding: 12px;
      background: var(--vscode-editorWidget-background, #252526);
      border: 1px solid var(--vscode-editorWidget-border, #454545);
      border-radius: 6px;
      cursor: pointer;
    }
    .timeline-entry:hover {
      border-color: var(--vscode-focusBorder, #007fd4);
    }
    .timeline-entry::before {
      content: "";
      position: absolute;
      left: -20px;
      top: 16px;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #c4a882;
      border: 2px solid var(--vscode-editor-background, #1e1e1e);
    }
    .timeline-entry.agent-switch::before {
      background: #b09090;
    }
    .timeline-entry.model-switch::before {
      background: #c9b87c;
    }
    .entry-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
      font-size: 12px;
    }
    .entry-agent {
      font-weight: 600;
      color: #c4a882;
    }
    .entry-model {
      opacity: 0.6;
    }
    .entry-time {
      margin-left: auto;
      opacity: 0.5;
      font-size: 11px;
    }
    .entry-prompt {
      font-size: 13px;
      line-height: 1.4;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    .entry-tools {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 8px;
    }
    .tool-tag {
      background: var(--vscode-badge-background, #4d4d4d);
      color: var(--vscode-badge-foreground, #ccc);
      padding: 1px 6px;
      border-radius: 3px;
      font-size: 10px;
    }
    .entry-stats {
      display: flex;
      gap: 12px;
      margin-top: 8px;
      font-size: 11px;
      opacity: 0.5;
    }
    .switch-badge {
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 3px;
      font-weight: 600;
    }
    .switch-badge.agent {
      background: rgba(176, 144, 144, 0.2);
      color: #b09090;
    }
    .switch-badge.model {
      background: rgba(201, 184, 124, 0.2);
      color: #c9b87c;
    }
    .timeline-entry.subagent::before {
      background: #8aab7f;
    }
    .switch-badge.subagent {
      background: rgba(138, 171, 127, 0.2);
      color: #8aab7f;
    }

    /* Detail view */
    .detail-overlay {
      margin-top: 16px;
      padding: 16px;
      background: var(--vscode-editorWidget-background, #252526);
      border: 1px solid var(--vscode-editorWidget-border, #454545);
      border-radius: 6px;
    }
    .detail-section {
      margin-bottom: 16px;
    }
    .detail-section h3 {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      opacity: 0.6;
      margin: 0 0 6px;
    }
    .detail-text {
      font-size: 13px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .empty-state {
      opacity: 0.5;
      font-style: italic;
      font-size: 13px;
      padding: 24px 0;
      text-align: center;
    }
    .filter-toggle {
      display: inline-flex;
      border: 1px solid var(--vscode-editorWidget-border, #454545);
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 16px;
    }
    .filter-btn {
      background: none;
      border: none;
      border-right: 1px solid var(--vscode-editorWidget-border, #454545);
      color: var(--vscode-editor-foreground);
      padding: 4px 14px;
      font-size: 12px;
      font-family: inherit;
      cursor: pointer;
      opacity: 0.7;
    }
    .filter-btn:last-child {
      border-right: none;
    }
    .filter-btn:hover {
      opacity: 1;
      background: var(--vscode-list-hoverBackground, #2a2d2e);
    }
    .filter-btn.active {
      opacity: 1;
      background: var(--vscode-button-background, #0e639c);
      color: var(--vscode-button-foreground, #fff);
    }
    .provider-badge {
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 3px;
      font-weight: 600;
      margin-right: 8px;
      flex-shrink: 0;
    }
    .provider-badge.copilot {
      background: rgba(196, 168, 130, 0.15);
      color: #c4a882;
    }
    .provider-badge.claude {
      background: rgba(176, 144, 144, 0.15);
      color: #b09090;
    }
    .provider-badge.codex {
      background: rgba(138, 171, 127, 0.15);
      color: #8aab7f;
    }
  `;

  @state() private sessions: Session[] = [];
  @state() private activeFilter: SourceFilter = "all";
  @state() private selectedSession: Session | null = null;
  @state() private selectedRequest: SessionRequest | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("message", this.handleMessage);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("message", this.handleMessage);
  }

  private handleMessage = (e: MessageEvent): void => {
    if (e.data.type === "update-sessions") {
      this.sessions = e.data.sessions;
      if (e.data.activeFilter) {
        this.activeFilter = e.data.activeFilter;
      }

      // Keep the selected session/request in sync with fresh data
      if (this.selectedSession) {
        const updated = this.sessions.find(
          (s) => s.sessionId === this.selectedSession!.sessionId,
        );
        if (updated) {
          this.selectedSession = updated;
          if (this.selectedRequest) {
            this.selectedRequest =
              updated.requests.find(
                (r) => r.requestId === this.selectedRequest!.requestId,
              ) ?? null;
          }
        }
      }
    }
  };

  private onFilterChange(filter: SourceFilter): void {
    this.activeFilter = filter;
    vscode.postMessage({ type: "filter-change", provider: filter });
  }

  private formatDate(ts: number): string {
    return new Date(ts).toLocaleString();
  }

  private formatDuration(ms: number | null): string {
    if (ms === null) return "-";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  private renderSessionList() {
    const sorted = [...this.sessions].sort(
      (a, b) => b.creationDate - a.creationDate,
    );

    const filterOptions: { value: SourceFilter; label: string }[] = [
      { value: "all", label: "All" },
      { value: "copilot", label: "Copilot" },
      { value: "claude", label: "Claude" },
      { value: "codex", label: "Codex" },
    ];

    return html`
      <div class="filter-toggle">
        ${filterOptions.map(
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
      <h1>Session Explorer</h1>
      ${sorted.length === 0
        ? html`<div class="empty-state">
            No sessions found. Sessions are auto-discovered from VS Code
            workspace storage.
          </div>`
        : html`
            <div class="session-list">
              ${sorted.map(
                (session) => html`
                  <div
                    class="session-item"
                    @click="${() => {
                      this.selectedSession = session;
                      this.selectedRequest = null;
                    }}"
                  >
                    <span class="provider-badge ${session.provider}">
                      ${session.provider === "copilot" ? "Copilot" : session.provider === "claude" ? "Claude" : "Codex"}
                    </span>
                    <span class="session-title">
                      ${session.title ?? session.sessionId}
                    </span>
                    <span class="session-meta">
                      ${session.requests.length} requests
                    </span>
                    <span class="session-meta">
                      ${this.formatDate(session.creationDate)}
                    </span>
                  </div>
                `,
              )}
            </div>
          `}
    `;
  }

  private renderTimeline(session: Session) {
    return html`
      <button
        class="back-btn"
        @click="${() => {
          this.selectedSession = null;
          this.selectedRequest = null;
        }}"
      >
        Back to sessions
      </button>
      <h2>${session.title ?? session.sessionId}</h2>

      <div class="timeline">
        ${session.requests.map((req, i) => {
          const prev = i > 0 ? session.requests[i - 1] : null;
          const agentName = req.customAgentName ?? req.agentId;
          const prevAgent = prev
            ? prev.customAgentName ?? prev.agentId
            : null;
          const isSubagent = req.isSubagent === true;
          const agentSwitch =
            prev !== null && agentName !== prevAgent && !isSubagent;
          const modelSwitch =
            prev !== null && req.modelId !== prev.modelId;

          return html`
            <div
              class="timeline-entry ${isSubagent ? "subagent" : ""} ${agentSwitch ? "agent-switch" : ""} ${modelSwitch ? "model-switch" : ""}"
              @click="${() => {
                this.selectedRequest =
                  this.selectedRequest?.requestId === req.requestId
                    ? null
                    : req;
              }}"
            >
              <div class="entry-header">
                <span class="entry-agent">${agentName}</span>
                ${isSubagent
                  ? html`<span class="switch-badge subagent">subagent</span>`
                  : null}
                ${agentSwitch
                  ? html`<span class="switch-badge agent">agent switch</span>`
                  : null}
                ${modelSwitch
                  ? html`<span class="switch-badge model">model switch</span>`
                  : null}
                <span class="entry-model">${req.modelId}</span>
                <span class="entry-time"
                  >${this.formatDate(req.timestamp)}</span
                >
              </div>
              <div class="entry-prompt">${req.messageText}</div>
              ${req.toolCalls.length > 0
                ? html`
                    <div class="entry-tools">
                      ${req.toolCalls.map(
                        (tc) =>
                          html`<span class="tool-tag">${tc.name}</span>`,
                      )}
                    </div>
                  `
                : null}
              <div class="entry-stats">
                <span>${this.formatDuration(req.timings.totalElapsed)}</span>
                <span
                  >${(req.usage.promptTokens + req.usage.completionTokens + (req.usage.cacheReadTokens ?? 0) + (req.usage.cacheCreationTokens ?? 0)).toLocaleString()}
                  tokens</span
                >
              </div>
              ${this.selectedRequest?.requestId === req.requestId
                ? this.renderRequestDetail(req)
                : null}
            </div>
          `;
        })}
      </div>
    `;
  }

  private renderRequestDetail(req: SessionRequest) {
    return html`
      <div class="detail-overlay" @click="${(e: Event) => e.stopPropagation()}">
        <div class="detail-section">
          <h3>Prompt</h3>
          <div class="detail-text">${req.messageText}</div>
        </div>
        ${req.toolCalls.length > 0
          ? html`
              <div class="detail-section">
                <h3>Tool Calls (${req.toolCalls.length})</h3>
                ${req.toolCalls.map(
                  (tc) => html`<div class="detail-text">${tc.name}</div>`,
                )}
              </div>
            `
          : null}
        ${req.loadedSkills.length > 0
          ? html`
              <div class="detail-section">
                <h3>Loaded Skills</h3>
                ${req.loadedSkills.map(
                  (s) => html`<div class="detail-text">${s}</div>`,
                )}
              </div>
            `
          : null}
        <div class="detail-section">
          <h3>Timing</h3>
          <div class="detail-text">
            First token: ${this.formatDuration(req.timings.firstProgress)} |
            Total: ${this.formatDuration(req.timings.totalElapsed)}
          </div>
        </div>
        <div class="detail-section">
          <h3>Tokens</h3>
          <div class="detail-text">
            Prompt: ${req.usage.promptTokens.toLocaleString()} | Completion:
            ${req.usage.completionTokens.toLocaleString()}
            ${(req.usage.cacheReadTokens ?? 0) > 0 || (req.usage.cacheCreationTokens ?? 0) > 0
              ? html`<br>Cache Read: ${(req.usage.cacheReadTokens ?? 0).toLocaleString()} | Cache Creation: ${(req.usage.cacheCreationTokens ?? 0).toLocaleString()}`
              : null}
          </div>
        </div>
      </div>
    `;
  }

  protected render() {
    if (this.selectedSession) {
      return this.renderTimeline(this.selectedSession);
    }
    return this.renderSessionList();
  }
}
