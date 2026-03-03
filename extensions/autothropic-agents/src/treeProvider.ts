import * as vscode from 'vscode';
import type { AgentSession } from './types';
import type { SessionManager } from './sessionManager';

/** Map agent hex colors to ThemeColor IDs for tree view icons. */
const COLOR_TO_THEME: Record<string, string> = {
  '#d97757': 'charts.orange',
  '#539bf5': 'charts.blue',
  '#57ab5a': 'charts.green',
  '#9d4edd': 'charts.purple',
  '#D4A574': 'charts.yellow',
  '#f28482': 'charts.red',
  '#4cc9f0': 'charts.blue',
  '#d4876a': 'charts.orange',
};

export class SessionTreeProvider implements vscode.TreeDataProvider<AgentSession> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<AgentSession | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly sessionManager: SessionManager) {
    sessionManager.onChanged(() => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(session: AgentSession): vscode.TreeItem {
    const item = new vscode.TreeItem(session.name, vscode.TreeItemCollapsibleState.None);

    // Icon: robot with agent color, or status-specific icon
    const themeColorId = COLOR_TO_THEME[session.color] || 'charts.orange';
    const themeColor = new vscode.ThemeColor(themeColorId);

    const iconName = session.status === 'running' ? 'sync~spin'
      : session.status === 'paused' ? 'debug-pause'
      : session.status === 'exited' ? 'debug-disconnect'
      : session.status === 'error' ? 'error'
      : 'robot';

    item.description = session.status;
    item.tooltip = new vscode.MarkdownString(
      `**${session.name}** — ${session.status}\n\n` +
      (session.systemPrompt ? `*Role:* ${session.systemPrompt.slice(0, 100)}${session.systemPrompt.length > 100 ? '...' : ''}\n\n` : '') +
      (session.humanInLoop ? '👁 HITL enabled\n\n' : '') +
      `Color: ${session.color}`
    );

    item.iconPath = new vscode.ThemeIcon(iconName, themeColor);
    item.contextValue = `agent-${session.status}`;

    item.command = {
      command: '_autothropic.agents.focusTerminal',
      title: 'Focus Agent Terminal',
      arguments: [session.id],
    };

    return item;
  }

  getChildren(): AgentSession[] {
    return this.sessionManager.getSessions();
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}
