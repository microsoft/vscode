import * as vscode from 'vscode';

export class GraphViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private static instance: GraphViewProvider | undefined;
  private refreshTimer?: ReturnType<typeof setInterval>;

  constructor(private readonly extensionUri: vscode.Uri) {
    GraphViewProvider.instance = this;
  }

  static getInstance(): GraphViewProvider | undefined {
    return GraphViewProvider.instance;
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.onDidReceiveMessage((msg) => this.handleMessage(msg));

    // Start periodic refresh for live output previews
    this.refreshTimer = setInterval(() => {
      if (this.view?.visible) {
        this.refresh();
      }
    }, 2000);

    webviewView.onDidDispose(() => {
      if (this.refreshTimer) {
        clearInterval(this.refreshTimer);
        this.refreshTimer = undefined;
      }
    });

    this.updateContent();
  }

  async refresh(): Promise<void> {
    if (!this.view) { return; }
    try {
      let outputPreviews: Record<string, string[]> = {};
      let goalState: any = null;
      let orchestratorState: any = null;
      const [sessions, edges] = await Promise.all([
        vscode.commands.executeCommand<any[]>('_autothropic.agents.getSessions'),
        vscode.commands.executeCommand<any[]>('_autothropic.agents.getEdges'),
      ]);
      try {
        outputPreviews = await vscode.commands.executeCommand<Record<string, string[]>>('_autothropic.agents.getOutputPreview') ?? {};
      } catch { /* command not yet registered */ }
      try {
        goalState = await vscode.commands.executeCommand('_autothropic.goal.getState');
      } catch { /* command not yet registered */ }
      try {
        orchestratorState = await vscode.commands.executeCommand('_autothropic.orchestrator.getState');
      } catch { /* command not yet registered */ }
      this.view.webview.postMessage({
        type: 'update',
        sessions: sessions ?? [],
        edges: edges ?? [],
        outputPreviews: outputPreviews ?? {},
        goalState: goalState ?? null,
        orchestratorState: orchestratorState ?? null,
      });
    } catch {
      // Agents extension might not be active yet
    }
  }

  notifyEdgePulse(fromId: string, toId: string): void {
    if (!this.view) { return; }
    this.view.webview.postMessage({
      type: 'edgePulse',
      fromId,
      toId,
    });
  }

  focus(): void {
    if (this.view) {
      this.view.show(true);
    }
  }

  private async handleMessage(msg: any): Promise<void> {
    switch (msg.type) {
      case 'ready':
        await this.refresh();
        break;
      case 'createSession':
        await vscode.commands.executeCommand('_autothropic.agents.createSession', msg.name, msg.role);
        await this.refresh();
        break;
      case 'removeSession':
        await vscode.commands.executeCommand('_autothropic.agents.removeSession', msg.id);
        await this.refresh();
        break;
      case 'restartSession':
        await vscode.commands.executeCommand('_autothropic.agents.restartSession', msg.id);
        await this.refresh();
        break;
      case 'addEdge':
        await vscode.commands.executeCommand('_autothropic.agents.addEdge', msg.from, msg.to);
        await this.refresh();
        break;
      case 'removeEdge':
        await vscode.commands.executeCommand('_autothropic.agents.removeEdge', msg.edgeId);
        await this.refresh();
        break;
      case 'updateEdge':
        await vscode.commands.executeCommand('_autothropic.agents.updateEdge', msg.edgeId, msg.patch);
        await this.refresh();
        break;
      case 'updatePosition':
        await vscode.commands.executeCommand('_autothropic.agents.updateSessionPosition', msg.id, msg.x, msg.y);
        break;
      case 'focusTerminal':
        await vscode.commands.executeCommand('_autothropic.agents.focusTerminal', msg.id);
        break;
      case 'renameSession':
        await vscode.commands.executeCommand('_autothropic.agents.renameSession', msg.id, msg.name);
        await this.refresh();
        break;
      case 'setRole':
        await vscode.commands.executeCommand('_autothropic.agents.setSessionRole', msg.id, msg.role);
        break;
      case 'setColor':
        await vscode.commands.executeCommand('_autothropic.agents.setSessionColor', msg.id, msg.color);
        await this.refresh();
        break;
      case 'toggleHITL':
        await vscode.commands.executeCommand('_autothropic.agents.setSessionHITL', msg.id, msg.enabled);
        await this.refresh();
        break;
      case 'applyTopology':
        await vscode.commands.executeCommand('_autothropic.agents.applyTopology', msg.presetId);
        await this.refresh();
        break;
      case 'spawnAgent':
        await vscode.commands.executeCommand('autothropic.agents.spawn');
        await this.refresh();
        break;
      case 'pauseAll':
        await vscode.commands.executeCommand('autothropic.agents.pauseAll');
        await this.refresh();
        break;
      case 'resumeAll':
        await vscode.commands.executeCommand('autothropic.agents.resumeAll');
        await this.refresh();
        break;
      case 'broadcast':
        if (msg.message) {
          await vscode.commands.executeCommand('_autothropic.agents.broadcast', msg.message);
          await this.refresh();
        }
        break;
      case 'startGoal':
        if (msg.prompt) {
          await vscode.commands.executeCommand('_autothropic.goal.start', msg.prompt);
          await this.refresh();
        }
        break;
      case 'mergeAll':
        await vscode.commands.executeCommand('_autothropic.goal.mergeAll', msg.goalId);
        await this.refresh();
        break;
      case 'mergeTask':
        await vscode.commands.executeCommand('_autothropic.goal.mergeTask', msg.taskId);
        await this.refresh();
        break;
      case 'cancelGoal':
        await vscode.commands.executeCommand('_autothropic.goal.cancel', msg.goalId);
        await this.refresh();
        break;
      case 'focusOrchestrator':
        await vscode.commands.executeCommand('_autothropic.orchestrator.focusOrchestrator');
        break;
      case 'sendInput':
        if (msg.sessionId && msg.input) {
          await vscode.commands.executeCommand('_autothropic.orchestrator.sendInput', msg.sessionId, msg.input);
          await this.refresh();
        }
        break;
      case 'executePlan':
        if (msg.plan) {
          await vscode.commands.executeCommand('_autothropic.orchestrator.executePlan', msg.plan);
          await this.refresh();
        }
        break;
    }
  }

  private updateContent(): void {
    if (!this.view) { return; }
    const webview = this.view.webview;
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'graph.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'graph.css'));
    const nonce = getNonce();

    webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <link href="${styleUri}" rel="stylesheet">
  <title>Agent Graph</title>
</head>
<body>
  <div id="broadcast-bar">
    <button id="btn-pause-all" title="Pause all agents">Pause All</button>
    <button id="btn-resume-all" title="Resume all agents">Resume All</button>
    <span class="broadcast-sep">|</span>
    <span id="idle-count">0 idle</span>
    <span class="broadcast-sep">|</span>
    <input id="broadcast-input" type="text" placeholder="Broadcast to idle agents..." />
    <button id="btn-send-all" title="Send to all idle agents">Send All</button>
  </div>
  <div id="goal-bar" class="hidden">
    <div class="goal-header">
      <span id="goal-prompt-text"></span>
      <span id="goal-progress-text"></span>
    </div>
    <div class="goal-progress-bar"><div class="goal-progress-fill" id="goal-progress-fill"></div></div>
    <div class="goal-tasks" id="goal-tasks"></div>
    <div class="goal-actions" id="goal-actions"></div>
  </div>
  <div id="goal-planning" class="hidden">
    <div class="planning-spinner"></div>
    <span>Planning tasks...</span>
  </div>
  <div id="graph-container">
    <svg id="edge-layer"></svg>
    <div id="node-layer"></div>
  </div>
  <div id="toolbar">
    <button id="btn-zoom-in" title="Zoom in">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    </button>
    <span id="zoom-level">100%</span>
    <button id="btn-zoom-out" title="Zoom out">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
    </button>
    <div class="separator"></div>
    <button id="btn-fit" title="Fit to view">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>
    </button>
  </div>
  <div id="info-bar">
    <button id="btn-presets">Presets</button>
    <button id="btn-add-agent">+ New Agent</button>
    <span id="stats"></span>
  </div>
  <div id="presets-dropdown" class="hidden"></div>
  <div id="edge-menu" class="hidden"></div>
  <div id="context-menu" class="hidden"></div>
  <div id="instructions" class="hidden">Drag from ● output to ● input to connect agents · Scroll to pan · Pinch to zoom</div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
