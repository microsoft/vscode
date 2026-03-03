import * as vscode from 'vscode';
import { SessionManager, TOPOLOGY_PRESETS } from './sessionManager';
import { OutputDetector } from './outputDetector';
import { OrchestrationEngine } from './orchestration';
import { HITLManager } from './hitlManager';
import { GoalManager } from './goalManager';
import { OrchestratorAgent } from './orchestratorAgent';
import { SessionTreeProvider } from './treeProvider';
import { sendToSession, appendToSessionInput } from './messageRouter';

const AGENT_COLORS = [
  '#d97757', '#539bf5', '#57ab5a', '#9d4edd',
  '#D4A574', '#f28482', '#4cc9f0', '#d4876a',
];

let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
  const sessionManager = new SessionManager(context);
  const hitlManager = new HITLManager(sessionManager, context.extensionUri);
  const outputDetector = new OutputDetector(sessionManager);
  const orchestrationEngine = new OrchestrationEngine(sessionManager, hitlManager);
  const goalManager = new GoalManager(sessionManager, context);
  orchestrationEngine.setGoalManager(goalManager);
  const orchestratorAgent = new OrchestratorAgent(sessionManager, outputDetector);
  orchestratorAgent.start();

  // Start output detection and orchestration
  context.subscriptions.push(outputDetector.start());
  orchestrationEngine.start();

  // Wire completion events to orchestration
  context.subscriptions.push(
    outputDetector.onCompletion((event) => {
      orchestrationEngine.handleCompletion(event);
    })
  );

  // When Claude Code exits inside a terminal, auto-restart with a clean terminal.
  // Guard: ignore exit events if the session was already restarted (status === 'waiting').
  context.subscriptions.push(
    outputDetector.onExited(async (sessionId) => {
      const session = sessionManager.getSession(sessionId);
      if (!session) { return; }
      // If session was already restarted (status is 'waiting'), ignore stale exit event
      if (session.status === 'waiting') { return; }

      // Auto-restart: clear old state and create a fresh clean terminal
      outputDetector.clearBuffer(sessionId);
      sessionManager.restartSession(sessionId);
      vscode.window.showInformationMessage(`Auto-restarted "${session.name}"`);
    })
  );

  // Tree view
  const treeProvider = new SessionTreeProvider(sessionManager);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('autothropic.sessions', treeProvider)
  );

  // Status bar
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  statusBarItem.command = 'autothropic.graph.open';
  context.subscriptions.push(statusBarItem);
  updateStatusBar(sessionManager);
  context.subscriptions.push(
    sessionManager.onChanged(() => {
      updateStatusBar(sessionManager);
      // Notify graph extension to refresh
      vscode.commands.executeCommand('_autothropic.graph.refresh').then(undefined, () => {});
    })
  );

  // Wire goal changes to graph refresh + update task running status
  context.subscriptions.push(
    goalManager.onGoalChanged(() => {
      vscode.commands.executeCommand('_autothropic.graph.refresh').then(undefined, () => {});
    })
  );

  // Track when goal-linked agents start running
  context.subscriptions.push(
    outputDetector.onCompletion(() => {
      // Also handled by orchestration, but we also track running state
    })
  );

  // Update goal task status when agent starts running
  context.subscriptions.push(
    sessionManager.onChanged(() => {
      for (const s of sessionManager.getSessions()) {
        if (s.goalId && s.taskId && s.status === 'running') {
          goalManager.handleTaskRunning(s.id);
        }
      }
    })
  );

  // Wire orchestrator plan detection — show confirmation dialog
  context.subscriptions.push(
    orchestratorAgent.onPlanDetected(async (event) => {
      const choice = await vscode.window.showInformationMessage(
        `Main Agent proposed: ${event.summary}`,
        'Deploy Team',
        'Cancel',
      );
      if (choice === 'Deploy Team') {
        await orchestratorAgent.executePlan(event.plan);
      }
    })
  );

  // Wire human input notifications
  context.subscriptions.push(
    orchestratorAgent.onHumanInputNeeded(({ sessionId, summary }) => {
      const session = sessionManager.getSession(sessionId);
      if (!session) { return; }
      vscode.window.showWarningMessage(
        `${session.name} needs input: ${summary}`,
        'Respond',
      ).then(choice => {
        if (choice === 'Respond') { session.terminal.show(); }
      });
    })
  );

  // Wire orchestrator state changes to graph refresh
  context.subscriptions.push(
    orchestratorAgent.onStateChanged(() => {
      vscode.commands.executeCommand('_autothropic.graph.refresh').then(undefined, () => {});
    })
  );

  // Detect pipeline completion — when last worker finishes, advance task queue
  context.subscriptions.push(
    outputDetector.onCompletion((event) => {
      if (orchestratorAgent.isLastWorker(event.sessionId)) {
        orchestratorAgent.handlePipelineCompletion();
      }
    })
  );

  // --- User-facing commands ---

  context.subscriptions.push(
    vscode.commands.registerCommand('autothropic.agents.spawn', async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showWarningMessage('Open a folder first');
        return;
      }
      const config = vscode.workspace.getConfiguration('autothropic.agents');
      const maxConcurrent = config.get<number>('maxConcurrent', 5);
      if (sessionManager.getSessions().length >= maxConcurrent) {
        vscode.window.showWarningMessage(`Maximum ${maxConcurrent} concurrent agents reached`);
        return;
      }
      const session = sessionManager.createSession();
      return session.id;
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('autothropic.agents.pauseAll', () => {
      for (const s of sessionManager.getSessions()) {
        if (s.status !== 'paused') {
          sessionManager.setSessionStatus(s.id, 'paused');
          s.terminal.sendText('\x03', false);
        }
      }
      vscode.window.showInformationMessage('All agents paused');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('autothropic.agents.resumeAll', () => {
      for (const s of sessionManager.getSessions()) {
        if (s.status === 'paused') {
          sessionManager.setSessionStatus(s.id, 'waiting');
        }
      }
      vscode.window.showInformationMessage('All agents resumed');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('autothropic.agents.broadcast', async () => {
      const message = await vscode.window.showInputBox({
        prompt: 'Message to broadcast to all idle agents',
        placeHolder: 'Enter a prompt...',
      });
      if (!message) { return; }
      const idle = sessionManager.getSessions().filter(s => s.status === 'waiting');
      for (const s of idle) {
        s.terminal.sendText(message);
        sessionManager.setSessionStatus(s.id, 'running');
      }
      vscode.window.showInformationMessage(`Broadcasted to ${idle.length} agent(s)`);
    })
  );

  // --- Internal commands (for graph/preview extensions) ---

  context.subscriptions.push(
    vscode.commands.registerCommand('_autothropic.agents.getSessions', () => {
      return sessionManager.getSerializableSessions();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('_autothropic.agents.getEdges', () => {
      return sessionManager.getEdges();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('_autothropic.agents.createSession', (name?: string, role?: string) => {
      // Created from graph/internal — don't steal focus to the terminal
      const session = sessionManager.createSession(name, role, { showTerminal: false });
      return {
        id: session.id,
        name: session.name,
        status: session.status,
        color: session.color,
        graphPosition: session.graphPosition,
        systemPrompt: session.systemPrompt,
        humanInLoop: session.humanInLoop,
        createdAt: session.createdAt,
      };
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('_autothropic.agents.removeSession', (id: string) => {
      sessionManager.removeSession(id);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('_autothropic.agents.addEdge', (from: string, to: string) => {
      return sessionManager.addEdge(from, to);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('_autothropic.agents.removeEdge', (edgeId: string) => {
      sessionManager.removeEdge(edgeId);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('_autothropic.agents.updateEdge', (edgeId: string, patch: any) => {
      sessionManager.updateEdge(edgeId, patch);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('_autothropic.agents.updateSessionPosition', (id: string, x: number, y: number) => {
      sessionManager.updateGraphPosition(id, { x, y });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('_autothropic.agents.setSessionRole', (id: string, role: string) => {
      sessionManager.setSessionRole(id, role);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('_autothropic.agents.setSessionColor', (id: string, color: string) => {
      sessionManager.setSessionColor(id, color);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('_autothropic.agents.setSessionHITL', (id: string, enabled: boolean) => {
      sessionManager.setSessionHITL(id, enabled);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('_autothropic.agents.sendMessage', (id: string, message: string) => {
      const session = sessionManager.getSession(id);
      if (session) {
        sendToSession(sessionManager, id, message);
        sessionManager.setSessionStatus(id, 'running');
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('_autothropic.agents.appendToInput', (id: string, text: string) => {
      const session = sessionManager.getSession(id);
      if (session) {
        appendToSessionInput(sessionManager, id, text);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('_autothropic.agents.renameSession', (id: string, name: string) => {
      sessionManager.renameSession(id, name);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('_autothropic.agents.applyTopology', (presetId: string) => {
      const preset = TOPOLOGY_PRESETS.find(p => p.id === presetId);
      if (preset) {
        const ids = sessionManager.applyTopology(preset);
        return ids;
      }
      return [];
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('_autothropic.agents.getTopologyPresets', () => {
      return TOPOLOGY_PRESETS.map(p => ({ id: p.id, label: p.label, description: p.description }));
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('_autothropic.agents.getActivityLog', () => {
      return sessionManager.getActivityLog();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('_autothropic.agents.getOutputPreview', () => {
      return outputDetector.getAllLastLines(3);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('_autothropic.agents.broadcast', (message: string) => {
      if (!message) { return 0; }
      const idle = sessionManager.getSessions().filter(s => s.status === 'waiting');
      for (const s of idle) {
        s.terminal.sendText(message);
        sessionManager.setSessionStatus(s.id, 'running');
      }
      return idle.length;
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('_autothropic.agents.focusTerminal', (id: string) => {
      const session = sessionManager.getSession(id);
      if (session) {
        session.terminal.show();
      }
    })
  );

  // --- Goal commands ---

  context.subscriptions.push(
    vscode.commands.registerCommand('autothropic.goal.start', async () => {
      const prompt = await vscode.window.showInputBox({
        prompt: 'Describe your goal',
        placeHolder: 'e.g., Add user authentication with JWT...',
      });
      if (!prompt) { return; }
      await goalManager.startGoal(prompt);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('_autothropic.goal.start', async (prompt: string) => {
      if (!prompt) { return; }
      await goalManager.startGoal(prompt);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('_autothropic.goal.getState', () => {
      return goalManager.getGoalState();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('_autothropic.goal.mergeAll', async (goalId: string) => {
      await goalManager.mergeAll(goalId);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('_autothropic.goal.mergeTask', async (taskId: string) => {
      await goalManager.mergeTask(taskId);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('_autothropic.goal.cancel', async (goalId: string) => {
      await goalManager.cancelGoal(goalId);
    })
  );

  // --- Orchestrator commands ---

  context.subscriptions.push(
    vscode.commands.registerCommand('_autothropic.orchestrator.getState', () => {
      return orchestratorAgent.getState();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('_autothropic.orchestrator.getWorkflows', () => {
      return orchestratorAgent.getWorkflowTemplates();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('_autothropic.orchestrator.executePlan', async (plan: any) => {
      await orchestratorAgent.executePlan(plan);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('_autothropic.orchestrator.sendInput', (sessionId: string, input: string) => {
      orchestratorAgent.sendInput(sessionId, input);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('_autothropic.orchestrator.focusOrchestrator', () => {
      const id = orchestratorAgent.getOrchestratorSessionId();
      if (id) {
        const session = sessionManager.getSession(id);
        if (session) { session.terminal.show(); }
      }
    })
  );

  // Context menu commands for tree view
  context.subscriptions.push(
    vscode.commands.registerCommand('autothropic.agents.rename', async (item: any) => {
      const session = sessionManager.getSession(item?.id);
      if (!session) { return; }
      const name = await vscode.window.showInputBox({
        prompt: 'New agent name',
        value: session.name,
      });
      if (name) { sessionManager.renameSession(session.id, name); }
    })
  );

  const ROLE_PRESETS: { label: string; description: string; prompt: string }[] = [
    { label: 'Leader', description: 'Coordinate and delegate work', prompt: 'You are the team leader. Coordinate work across agents. Break down tasks, delegate to workers, and synthesize their outputs into a cohesive result.' },
    { label: 'Reviewer', description: 'Review code for quality & bugs', prompt: 'You are a strict code reviewer. Review code for bugs, security issues, performance, and quality. Provide clear, actionable feedback.' },
    { label: 'Builder', description: 'Implement features & write code', prompt: 'You are a builder/implementer. Write clean, working code to complete the assigned task. Follow best practices and write tests when appropriate.' },
    { label: 'Tester', description: 'Write tests & verify correctness', prompt: 'You are a QA tester. Write comprehensive tests, verify edge cases, and ensure code correctness. Report failures clearly with reproduction steps.' },
    { label: 'Debugger', description: 'Investigate and fix bugs', prompt: 'You are a debugger. Investigate issues, trace root causes, and fix bugs. Use systematic debugging approaches and explain your findings.' },
    { label: 'Architect', description: 'Design systems & interfaces', prompt: 'You are a software architect. Design system architecture, define interfaces, plan technical approaches, and ensure consistency across the codebase.' },
    { label: 'Verifier', description: 'Validate implementations match spec', prompt: 'You are a verifier. Check that implementations match requirements, validate outputs, and confirm correctness before signing off.' },
    { label: 'Minion', description: 'Execute tasks precisely', prompt: 'You are a task executor. Follow instructions precisely, complete assigned work thoroughly, and report results concisely.' },
    { label: 'Custom...', description: 'Enter a custom system prompt', prompt: '' },
  ];

  context.subscriptions.push(
    vscode.commands.registerCommand('autothropic.agents.setRole', async (item: any) => {
      const session = sessionManager.getSession(item?.id);
      if (!session) { return; }
      const pick = await vscode.window.showQuickPick(ROLE_PRESETS, {
        placeHolder: 'Select a role preset or custom',
      });
      if (!pick) { return; }
      if (pick.label === 'Custom...') {
        const role = await editPromptInEditor(session.systemPrompt ?? '', session.name);
        if (role !== undefined) { sessionManager.setSessionRole(session.id, role); }
      } else {
        sessionManager.setSessionRole(session.id, pick.prompt);
        sessionManager.renameSession(session.id, pick.label);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('autothropic.agents.setColor', async (item: any) => {
      const session = sessionManager.getSession(item?.id);
      if (!session) { return; }
      const pick = await vscode.window.showQuickPick(
        AGENT_COLORS.map(c => ({ label: c, description: c === session.color ? '(current)' : '' })),
        { placeHolder: 'Pick agent color' },
      );
      if (pick) { sessionManager.setSessionColor(session.id, pick.label); }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('autothropic.agents.toggleHITL', (item: any) => {
      const session = sessionManager.getSession(item?.id);
      if (session) {
        sessionManager.setSessionHITL(session.id, !session.humanInLoop);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('autothropic.agents.delete', (item: any) => {
      const session = sessionManager.getSession(item?.id);
      if (session) { sessionManager.removeSession(session.id); }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('autothropic.agents.restart', (item: any) => {
      const session = sessionManager.getSession(item?.id);
      if (session) {
        outputDetector.clearBuffer(session.id);
        sessionManager.restartSession(session.id);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('_autothropic.agents.restartSession', (id: string) => {
      outputDetector.clearBuffer(id);
      sessionManager.restartSession(id);
    })
  );

  // Restore sessions from the previous IDE session.
  // VS Code restores stale terminals on restart — we dispose them all
  // and create fresh clean terminals for each persisted session.
  // Delay briefly to let VS Code finish restoring terminals.
  setTimeout(() => {
    const adopted = sessionManager.adoptRestoredTerminals();

    // Only auto-spawn orchestrator if no agents were restored
    if (adopted === 0) {
      orchestratorAgent.ensureOrchestrator();
    }

    // Auto-open graph panel so it's visible on start
    vscode.commands.executeCommand('autothropic.graphView.focus').then(undefined, () => {});
  }, 2500);

  // Terminal cleanup
  context.subscriptions.push(
    vscode.window.onDidCloseTerminal((terminal) => {
      sessionManager.handleTerminalClose(terminal);
    })
  );

  // Cleanup
  context.subscriptions.push({
    dispose() {
      sessionManager.dispose();
      hitlManager.dispose();
      outputDetector.dispose();
      orchestrationEngine.dispose();
      goalManager.dispose();
      orchestratorAgent.dispose();
      treeProvider.dispose();
    },
  });
}

function updateStatusBar(sessionManager: SessionManager): void {
  const sessions = sessionManager.getSessions();
  if (sessions.length === 0) {
    statusBarItem.hide();
    return;
  }
  const active = sessions.filter(s => s.status === 'running').length;
  const idle = sessions.filter(s => s.status === 'waiting').length;
  const needsInput = sessions.filter(s => s.needsInput).length;
  let text = `$(hubot) ${active} active · ${idle} idle`;
  if (needsInput > 0) {
    text += ` · ${needsInput} needs input`;
  }
  statusBarItem.text = text;
  statusBarItem.tooltip = `${sessions.length} total agents\nClick to open graph`;
  statusBarItem.show();
}

/**
 * Opens an untitled editor for multi-line prompt editing.
 * The user edits the text, then saves (Ctrl+S) to confirm.
 * Closing without saving cancels.
 */
async function editPromptInEditor(currentPrompt: string, agentName: string): Promise<string | undefined> {
  const header = `# System prompt for "${agentName}"\n# Edit below, then Save (Ctrl+S) to apply. Close tab to cancel.\n# ─────────────────────────────────────────────────────────────\n\n`;
  const doc = await vscode.workspace.openTextDocument({
    content: header + currentPrompt,
    language: 'markdown',
  });
  await vscode.window.showTextDocument(doc, { preview: true });

  return new Promise<string | undefined>((resolve) => {
    let resolved = false;

    const onSave = vscode.workspace.onDidSaveTextDocument((saved) => {
      if (saved.uri.toString() !== doc.uri.toString()) { return; }
      resolved = true;
      // Strip header comment lines
      const lines = saved.getText().split('\n');
      const contentLines = lines.filter(l => !l.startsWith('# '));
      const prompt = contentLines.join('\n').trim();
      onSave.dispose();
      onClose.dispose();
      // Close the editor tab
      vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      resolve(prompt);
    });

    const onClose = vscode.workspace.onDidCloseTextDocument((closed) => {
      if (closed.uri.toString() !== doc.uri.toString()) { return; }
      onSave.dispose();
      onClose.dispose();
      if (!resolved) { resolve(undefined); }
    });
  });
}

export function deactivate() {}
