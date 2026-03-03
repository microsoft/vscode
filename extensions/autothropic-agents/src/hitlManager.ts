import * as vscode from 'vscode';
import type { PendingApproval } from './types';
import type { SessionManager } from './sessionManager';
import { sendToSession } from './messageRouter';

/**
 * HITLManager manages the Human-in-the-Loop approval queue.
 * When orchestration routes a message to a HITL-enabled agent,
 * it's queued here for human approval before delivery.
 */
export class HITLManager {
  private pendingApprovals: PendingApproval[] = [];
  private panel: vscode.WebviewPanel | undefined;
  private readonly _onApprovalChanged = new vscode.EventEmitter<void>();
  readonly onApprovalChanged = this._onApprovalChanged.event;

  constructor(
    private readonly sessionManager: SessionManager,
    private readonly extensionUri: vscode.Uri,
  ) {}

  get currentApproval(): PendingApproval | null {
    return this.pendingApprovals[0] ?? null;
  }

  get queueLength(): number {
    return this.pendingApprovals.length;
  }

  enqueue(approval: PendingApproval): void {
    this.pendingApprovals.push(approval);
    this._onApprovalChanged.fire();
    this.showApprovalPanel();
  }

  approve(id: string): void {
    const item = this.pendingApprovals.find(a => a.id === id);
    if (item) {
      sendToSession(this.sessionManager, item.toSessionId, item.fullMessage);
      this.sessionManager.setSessionStatus(item.toSessionId, 'running');
      this.sessionManager.addMessage({
        id: `${Date.now()}-${item.fromSessionId}-${item.toSessionId}`,
        fromSessionId: item.fromSessionId,
        toSessionId: item.toSessionId,
        content: item.summary,
        timestamp: Date.now(),
      });
      vscode.window.showInformationMessage(`Approved: ${item.fromSessionName} → ${item.toSessionName}`);
    }
    this.pendingApprovals = this.pendingApprovals.filter(a => a.id !== id);
    this._onApprovalChanged.fire();
    this.updatePanel();
  }

  reject(id: string): void {
    const item = this.pendingApprovals.find(a => a.id === id);
    if (item) {
      vscode.window.showWarningMessage(`Rejected: ${item.fromSessionName} → ${item.toSessionName}`);
    }
    this.pendingApprovals = this.pendingApprovals.filter(a => a.id !== id);
    this._onApprovalChanged.fire();
    this.updatePanel();
  }

  reiterate(id: string, instruction: string): void {
    const item = this.pendingApprovals.find(a => a.id === id);
    if (item) {
      const modifiedMessage = `${item.fullMessage}\n\n[Human instruction]: ${instruction}`;
      sendToSession(this.sessionManager, item.toSessionId, modifiedMessage);
      this.sessionManager.setSessionStatus(item.toSessionId, 'running');
      this.sessionManager.addMessage({
        id: `${Date.now()}-${item.fromSessionId}-${item.toSessionId}`,
        fromSessionId: item.fromSessionId,
        toSessionId: item.toSessionId,
        content: `${item.summary}\n\n[Human instruction]: ${instruction}`,
        timestamp: Date.now(),
      });
      vscode.window.showInformationMessage(`Reiterated: ${item.fromSessionName} → ${item.toSessionName}`);
    }
    this.pendingApprovals = this.pendingApprovals.filter(a => a.id !== id);
    this._onApprovalChanged.fire();
    this.updatePanel();
  }

  private showApprovalPanel(): void {
    if (this.panel) {
      this.updatePanel();
      this.panel.reveal(vscode.ViewColumn.Two, true);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'autothropic.hitl',
      'HITL Approval',
      { viewColumn: vscode.ViewColumn.Two, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [this.extensionUri],
      },
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    this.panel.webview.onDidReceiveMessage((msg) => {
      switch (msg.type) {
        case 'approve':
          this.approve(msg.id);
          break;
        case 'reject':
          this.reject(msg.id);
          break;
        case 'reiterate':
          this.reiterate(msg.id, msg.instruction);
          break;
      }
    });

    this.updatePanel();
  }

  private updatePanel(): void {
    if (!this.panel) { return; }

    const approval = this.currentApproval;
    if (!approval) {
      this.panel.webview.html = this.getEmptyHtml();
      return;
    }

    this.panel.webview.html = this.getApprovalHtml(approval);
  }

  private getEmptyHtml(): string {
    return `<!DOCTYPE html>
<html><body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#111110;color:#7a7870;font-family:system-ui;font-size:13px;">
  <div style="text-align:center">
    <p>No pending approvals</p>
    <p style="font-size:11px;opacity:0.5;margin-top:8px">HITL approval requests will appear here</p>
  </div>
</body></html>`;
  }

  private getApprovalHtml(approval: PendingApproval): string {
    const escapedSummary = approval.summary
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');

    return `<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #111110;
      color: #a8a69e;
      font-family: system-ui, -apple-system, sans-serif;
      padding: 20px;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
    }
    .arrow { color: #7a7870; font-size: 14px; }
    .queue-info {
      font-size: 11px;
      color: #7a7870;
      margin-bottom: 12px;
    }
    .summary {
      background: #1c1c1a;
      border: 1px solid #2a2a26;
      border-radius: 8px;
      padding: 12px;
      font-size: 12px;
      line-height: 1.5;
      margin-bottom: 16px;
      max-height: 300px;
      overflow-y: auto;
      font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
      white-space: pre-wrap;
    }
    .actions {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
    }
    button {
      padding: 8px 16px;
      border-radius: 6px;
      border: 1px solid #2a2a26;
      background: #1c1c1a;
      color: #a8a69e;
      font-size: 12px;
      cursor: pointer;
      font-family: inherit;
    }
    button:hover { background: #232320; }
    .btn-approve {
      background: #57ab5a;
      color: #f5f2eb;
      border-color: #57ab5a;
    }
    .btn-approve:hover { background: #4a9a4d; }
    .btn-reject {
      background: #e5534b;
      color: #f5f2eb;
      border-color: #e5534b;
    }
    .btn-reject:hover { background: #c94038; }
    .reiterate-section {
      margin-top: 12px;
    }
    textarea {
      width: 100%;
      background: #1c1c1a;
      border: 1px solid #2a2a26;
      border-radius: 6px;
      color: #a8a69e;
      padding: 8px;
      font-family: inherit;
      font-size: 12px;
      resize: vertical;
      min-height: 60px;
    }
    textarea:focus { outline: none; border-color: #d97757; }
    .hint {
      font-size: 10px;
      color: #5a5850;
      margin-top: 8px;
    }
  </style>
</head>
<body>
  <div class="header">
    <span class="badge" style="background:${approval.fromSessionColor}22;color:${approval.fromSessionColor}">${approval.fromSessionName}</span>
    <span class="arrow">→</span>
    <span class="badge" style="background:#d9775722;color:#d97757">${approval.toSessionName}</span>
  </div>
  <div class="queue-info">${this.pendingApprovals.length} pending approval(s)</div>
  <div class="summary">${escapedSummary}</div>
  <div class="actions">
    <button class="btn-approve" onclick="approve()">Approve (⌘↵)</button>
    <button class="btn-reject" onclick="reject()">Reject (Esc)</button>
  </div>
  <div class="reiterate-section">
    <textarea id="instruction" placeholder="Add human instruction before forwarding..."></textarea>
    <button onclick="reiterate()" style="margin-top:8px">Reiterate with Instruction</button>
  </div>
  <div class="hint">Approve sends the message as-is. Reiterate appends your instruction.</div>
  <script>
    const vscode = acquireVsCodeApi();
    const approvalId = ${JSON.stringify(approval.id)};

    function approve() {
      vscode.postMessage({ type: 'approve', id: approvalId });
    }
    function reject() {
      vscode.postMessage({ type: 'reject', id: approvalId });
    }
    function reiterate() {
      const instruction = document.getElementById('instruction').value.trim();
      if (!instruction) return;
      vscode.postMessage({ type: 'reiterate', id: approvalId, instruction });
    }

    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        approve();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        reject();
      }
    });
  </script>
</body>
</html>`;
  }

  dispose(): void {
    this._onApprovalChanged.dispose();
    this.panel?.dispose();
  }
}
