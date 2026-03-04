import * as vscode from 'vscode';
import { SessionManager, TOPOLOGY_PRESETS } from './sessionManager';
import { OutputDetector } from './outputDetector';
import { OrchestrationEngine } from './orchestration';
import { HITLManager } from './hitlManager';
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

	// Start output detection and orchestration
	context.subscriptions.push(outputDetector.start());
	orchestrationEngine.start();

	// Wire completion events to orchestration
	context.subscriptions.push(
		outputDetector.onCompletion((event) => {
			orchestrationEngine.handleCompletion(event);
		})
	);

	// Auto-restart when Claude Code exits
	context.subscriptions.push(
		outputDetector.onExited(async (sessionId) => {
			const session = sessionManager.getSession(sessionId);
			if (!session) { return; }
			if (session.status === 'waiting') { return; }

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
			vscode.commands.executeCommand('_autothropic.graph.refresh').then(undefined, () => {});
		})
	);

	// =============================================
	// User-facing commands
	// =============================================

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

	// =============================================
	// Tutorial / Getting Started
	// =============================================

	context.subscriptions.push(
		vscode.commands.registerCommand('autothropic.agents.tutorial', async () => {
			const steps = [
				{
					title: 'Step 1: Spawn an Agent',
					detail: 'Click the + button in the Agents sidebar, or press Ctrl+Shift+N.\nThis creates a new Claude Code terminal with its own session.',
					action: 'Spawn Agent',
				},
				{
					title: 'Step 2: Set a Role',
					detail: 'Right-click an agent in the sidebar and choose "Set Role".\nRoles give agents specialized system prompts (Builder, Reviewer, Tester, etc.).',
				},
				{
					title: 'Step 3: Connect Agents',
					detail: 'Open the Graph view (click the status bar or run "Autothropic: Open Graph").\nDrag from one agent node to another to create an edge.\nWhen the source agent completes, its output auto-forwards to connected agents.',
				},
				{
					title: 'Step 4: Use a Topology Preset',
					detail: 'In the Graph view, click "Topology" to deploy a pre-built team:\n  - Pipeline: Analyst -> Builder -> Reviewer\n  - Star: Leader + 3 Workers\n  - Fan-out/Fan-in: Source -> Workers -> Aggregator\n  - Review Loop: Builder <-> Reviewer (max 3 iterations)',
				},
				{
					title: 'Step 5: Human-in-the-Loop (HITL)',
					detail: 'Right-click an agent and toggle "HITL".\nMessages to HITL agents require your approval before delivery.\nYou can approve, reject, or reiterate with additional instructions.',
				},
				{
					title: 'Step 6: Broadcast & Coordinate',
					detail: 'Use "Autothropic: Broadcast" to send a message to all idle agents.\nAgents auto-restart when Claude exits. Edge conditions filter what gets forwarded:\n  - all: forward everything\n  - code-changes: only when code is modified\n  - errors: only when errors are detected\n  - summary-only: condensed output',
				},
			];

			for (let i = 0; i < steps.length; i++) {
				const step = steps[i];
				const buttons: string[] = [];
				if (step.action) { buttons.push(step.action); }
				buttons.push(i < steps.length - 1 ? 'Next' : 'Done');
				if (i > 0) { buttons.push('Cancel'); }

				const choice = await vscode.window.showInformationMessage(
					`${step.title}\n\n${step.detail}`,
					{ modal: true },
					...buttons
				);

				if (choice === step.action) {
					await vscode.commands.executeCommand('autothropic.agents.spawn');
				}
				if (choice === 'Cancel' || choice === 'Done' || !choice) {
					break;
				}
			}
		})
	);

	// =============================================
	// Internal commands (for graph/preview extensions)
	// =============================================

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
				return sessionManager.applyTopology(preset);
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

	// =============================================
	// Tree view context menu commands
	// =============================================

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
				const role = await vscode.window.showInputBox({
					prompt: 'Enter custom system prompt',
					value: session.systemPrompt ?? '',
				});
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

	// =============================================
	// Startup: restore sessions, show tutorial hint
	// =============================================

	setTimeout(() => {
		const adopted = sessionManager.adoptRestoredTerminals();

		// Auto-open graph panel
		vscode.commands.executeCommand('autothropic.graphView.focus').then(undefined, () => {});

		// Show tutorial hint for first-time users
		if (adopted === 0 && sessionManager.getSessions().length === 0) {
			const hasSeenTutorial = context.globalState.get<boolean>('hasSeenTutorial');
			if (!hasSeenTutorial) {
				vscode.window.showInformationMessage(
					'Welcome to Autothropic! Spawn your first agent to get started.',
					'Tutorial',
					'Spawn Agent',
				).then(choice => {
					if (choice === 'Tutorial') {
						vscode.commands.executeCommand('autothropic.agents.tutorial');
					} else if (choice === 'Spawn Agent') {
						vscode.commands.executeCommand('autothropic.agents.spawn');
					}
				});
				context.globalState.update('hasSeenTutorial', true);
			}
		}
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
	statusBarItem.text = `$(hubot) ${active} active / ${idle} idle`;
	statusBarItem.tooltip = `${sessions.length} total agents\nClick to open graph`;
	statusBarItem.show();
}

export function deactivate() {}
