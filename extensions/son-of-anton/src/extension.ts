/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { ChatPanel } from './chat/ChatPanel';
import { ChatViewProvider } from './chat/ChatViewProvider';
import { InlineEditProvider } from './inline/InlineEdit';
import { CompletionProvider } from './inline/CompletionProvider';
import { AgentStatusProvider } from './sidebar/AgentStatusProvider';
import { TaskQueueProvider } from './sidebar/TaskQueueProvider';
import { TraceViewerPanel } from './trace/TraceViewerPanel';
import { TraceExporter } from './trace/TraceExporter';
import { LlmClient } from './llm/LlmClient';
import { ToolRegistry } from './tools/registry';
import { AgentManager } from './agents/AgentManager';
import { McpClient } from './mcp/McpClient';
import { bridgeMcpToolsIntoRegistry } from './mcp/McpToolBridge';
import { StatusBarManager } from './sidebar/StatusBarManager';
import { registerAgentParticipants } from './agents/AgentParticipants';
import { createAgentStack } from './agents/AgentStackFactory';
import { AgentBridge } from './chat/AgentBridge';
import { WorkspaceContextProvider } from './chat/WorkspaceContextProvider';
import { SandboxManager, defaultSandboxConfig } from './sandbox/SandboxManager';
import { SandboxTerminal } from './sandbox/SandboxTerminal';
import { SecurityScanner } from './security/SecurityScanner';
import { SupplyChainGuard } from './security/SupplyChainGuard';
import { HookEngine } from './hooks/HookEngine';
import { SpecSyncWatcher } from './hooks/SpecSyncWatcher';
import { BackgroundTaskClient } from './background/BackgroundTaskClient';
import { FleetDashboardPanel } from './dashboard/FleetDashboardPanel';
import { MetricsTracker } from './agents/MetricsTracker';
import { StartupMessages } from './personality/StartupMessages';
import { TerminalBanner } from './personality/TerminalBanner';
import { KonamiCode } from './personality/KonamiCode';
import { GitBlameEasterEgg } from './personality/GitBlameEasterEgg';
import { activateAuth } from './auth/activation';
import { maybeShowFirstRunSignInPrompt } from './auth/firstRun';
import { SetupWizardPanel } from './onboarding/SetupWizardPanel';

export function activate(context: vscode.ExtensionContext): void {
	// --- Credential broker (OAuth-based provider sign-in) ---
	const auth = activateAuth({
		secrets: context.secrets,
		openExternal: uri => vscode.env.openExternal(vscode.Uri.parse(uri)),
		getConfig: section => vscode.workspace.getConfiguration(section),
		registerCommand: (id, handler) => vscode.commands.registerCommand(id, handler),
	});
	context.subscriptions.push(...auth.disposables);

	const llmClient = new LlmClient(context, auth.broker);

	// First-launch setup wizard — fires once per install, silent if any
	// credential is already configured (OAuth, settings, env var, AWS chain).
	// Deferred by a tick so the rest of activation (chat sidebar, status bar)
	// is in place before the wizard panel grabs focus.
	setTimeout(() => {
		void maybeShowFirstRunSignInPrompt({
			broker: auth.broker,
			llmClient,
			context,
			getConfig: (section) => vscode.workspace.getConfiguration(section),
		});
	}, 1000);
	// Single shared tool registry threaded into all chat surfaces so tool-call
	// orchestration is consistent regardless of where the chat is hosted.
	const toolRegistry = new ToolRegistry();
	const mcpClient = new McpClient();

	// Bridge MCP-discovered tools into the shared ToolRegistry so chat agents
	// see them alongside built-in tools. Best-effort and non-blocking — the
	// chat works with built-in tools immediately and gains MCP tools as soon
	// as discovery completes.
	void (async () => {
		const result = await bridgeMcpToolsIntoRegistry(mcpClient, toolRegistry);
		if (result.failed) {
			console.warn(`[extension] MCP tool bridge failed: ${result.reason}`);
		} else if (result.registered > 0) {
			console.log(`[extension] Registered ${result.registered} MCP tools.`);
		}
	})();

	const agentManager = new AgentManager(llmClient);
	const agentStatusProvider = new AgentStatusProvider(agentManager);
	const taskQueueProvider = new TaskQueueProvider(agentManager);
	const statusBarManager = new StatusBarManager(agentManager, auth.broker);

	// --- Sandbox ---
	const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
	const sandboxTerminal = new SandboxTerminal();
	const sandboxConfig = defaultSandboxConfig(workspacePath);
	const sandboxManager = new SandboxManager(sandboxConfig, sandboxTerminal);

	// Confirmation callback for sandbox commands
	sandboxManager.setConfirmCallback(async (command, reason) => {
		const choice = await vscode.window.showWarningMessage(
			`Agent wants to run: ${command}\nReason: ${reason}`,
			{ modal: true },
			'Allow',
			'Deny',
		);
		return choice === 'Allow';
	});

	// --- Security ---
	const securityScanner = new SecurityScanner(sandboxManager, workspacePath);
	const supplyChainGuard = new SupplyChainGuard();

	// Load extension allowlist if available
	loadSupplyChainConfig(supplyChainGuard, workspacePath);

	// Start extension watcher
	context.subscriptions.push(supplyChainGuard.startExtensionWatcher());

	// --- Hooks ---
	const hookEngine = new HookEngine();
	hookEngine.loadFromWorkspace().then(() => {
		hookEngine.registerFileWatchers();
		hookEngine.registerGitHooks();
	});

	// --- Spec Sync ---
	const specSyncWatcher = new SpecSyncWatcher();
	specSyncWatcher.start();

	// Surface spec sync warnings in the output channel
	const specSyncChannel = vscode.window.createOutputChannel('Son of Anton: Spec Sync');
	context.subscriptions.push(specSyncChannel);
	context.subscriptions.push(
		specSyncWatcher.onDidDetectSync(warning => {
			specSyncChannel.appendLine(
				`[${warning.direction}] ${warning.message}`
			);
		})
	);

	// --- Tracing ---
	const traceExporter = new TraceExporter();

	// Wire hook execution results to trace exporter
	context.subscriptions.push(
		hookEngine.onDidExecuteHook(result => {
			traceExporter.recordHookExecution(result);
		})
	);

	// Wire agent span events to trace exporter
	context.subscriptions.push(
		agentManager.onDidAddSpan(span => {
			traceExporter.importSpans([span]);
		})
	);

	// Build the agent stack once and share it across surfaces (chat
	// participants, webview sidebar, command-palette commands). Disposing
	// the stack flushes metrics so we don't drop telemetry on shutdown.
	const agentStack = createAgentStack({ llmClient, mcpClient, agentManager });
	context.subscriptions.push({ dispose: () => agentStack.dispose() });
	const agentBridge = new AgentBridge(agentStack);

	// Single shared WorkspaceContextProvider so MRU listeners are registered
	// once for the whole window, not per-session — avoids duplicate event
	// handlers when both the sidebar view and the panel command are active.
	const workspaceContextProvider = new WorkspaceContextProvider();
	context.subscriptions.push(workspaceContextProvider);

	// Register multi-agent chat participants against the shared stack
	const agentDisposables = registerAgentParticipants(context, agentStack);
	context.subscriptions.push(...agentDisposables);

	// Chat sidebar view (primary surface)
	const chatViewProvider = new ChatViewProvider(context, llmClient, toolRegistry, agentBridge, workspaceContextProvider);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(ChatViewProvider.VIEW_ID, chatViewProvider, {
			webviewOptions: { retainContextWhenHidden: true },
		}),
	);

	// Open chat in editor area (legacy command, still useful for split layouts)
	context.subscriptions.push(
		vscode.commands.registerCommand('sota.openChat', () => {
			ChatPanel.createOrShow(context, llmClient, toolRegistry, agentBridge, workspaceContextProvider);
		})
	);

	// --- OAuth sign-in commands (user-facing) ---
	// CredentialBroker has no onDidConnect hook, so we refresh the status bar
	// here after each connect attempt to surface the new provider state.
	context.subscriptions.push(
		vscode.commands.registerCommand('sota.signInClaude', async () => {
			await vscode.commands.executeCommand('sotaAuth.connect', 'anthropic-oauth');
			await statusBarManager.refreshAuth();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('sota.signInOpenAI', async () => {
			await vscode.commands.executeCommand('sotaAuth.connect', 'chatgpt-oauth');
			await statusBarManager.refreshAuth();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('sota.signOutAll', async () => {
			const status = await auth.broker.status();
			const connected = status.filter(p => p.connected);
			if (connected.length === 0) {
				vscode.window.showInformationMessage('Son of Anton: no providers are currently connected.');
				return;
			}
			const pick = await vscode.window.showQuickPick(
				connected.map(p => ({
					label: p.displayName,
					description: p.id,
					providerId: p.id,
				})),
				{ placeHolder: 'Select a provider to sign out of', canPickMany: false },
			);
			if (!pick) {
				return;
			}
			await vscode.commands.executeCommand('sotaAuth.disconnect', pick.providerId);
			await statusBarManager.refreshAuth();
		})
	);

	// Reset the first-run sign-in prompt (development/testing aid)
	context.subscriptions.push(
		vscode.commands.registerCommand('sota.resetFirstRunPrompt', async () => {
			await context.globalState.update('sotaAuth.firstRunPromptDismissed', undefined);
			await context.globalState.update('sotaOnboarding.setupWizardSkipped', undefined);
			vscode.window.showInformationMessage(
				'First-run sign-in prompt reset — will appear on next window reload.',
			);
		})
	);

	// Manual entry point to the setup wizard (always available regardless of
	// whether the user has previously skipped or completed the auto-popup).
	context.subscriptions.push(
		vscode.commands.registerCommand('sota.openSetupWizard', () => {
			SetupWizardPanel.createOrShow(context, {
				llmClient,
				broker: auth.broker,
				secrets: context.secrets,
				config: vscode.workspace.getConfiguration('sota'),
			});
		})
	);

	// Clear Chat
	context.subscriptions.push(
		vscode.commands.registerCommand('sota.clearChat', () => {
			ChatPanel.clearConversation(context);
		})
	);

	// Inline Edit (Cmd+K / Ctrl+K)
	const inlineEditProvider = new InlineEditProvider(llmClient);
	context.subscriptions.push(
		vscode.commands.registerCommand('sota.inlineEdit', () => {
			inlineEditProvider.provideInlineEdit();
		})
	);

	// Inline Completions
	const completionProvider = new CompletionProvider(llmClient);
	context.subscriptions.push(
		vscode.languages.registerInlineCompletionItemProvider(
			{ pattern: '**' },
			completionProvider
		)
	);

	// Agent Status Sidebar
	context.subscriptions.push(
		vscode.window.registerTreeDataProvider('sota.agentStatus', agentStatusProvider)
	);
	context.subscriptions.push(
		vscode.window.registerTreeDataProvider('sota.taskQueue', taskQueueProvider)
	);

	// Trace Viewer
	context.subscriptions.push(
		vscode.commands.registerCommand('sota.showTraces', () => {
			TraceViewerPanel.createOrShow(context, agentManager);
		})
	);

	// Export traces command
	context.subscriptions.push(
		vscode.commands.registerCommand('sota.exportTraces', async () => {
			const uri = await traceExporter.exportToWorkspace();
			if (uri) {
				vscode.window.showInformationMessage(`Traces exported to ${uri.fsPath}`);
			}
		})
	);

	// Sandbox terminal command
	context.subscriptions.push(
		vscode.commands.registerCommand('sota.showSandbox', () => {
			sandboxTerminal.ensureVisible();
		})
	);

	// Pre-commit hook trigger command (called by git hook script)
	context.subscriptions.push(
		vscode.commands.registerCommand('sota.triggerPreCommitHook', async () => {
			const allowed = await hookEngine.triggerPreCommit([]);
			if (!allowed) {
				vscode.window.showErrorMessage('Pre-commit hook blocked the commit. See security scan results.');
			}
		})
	);

	// Status bar
	context.subscriptions.push(statusBarManager);

	// Refresh commands for tree views
	context.subscriptions.push(
		vscode.commands.registerCommand('sota.refreshAgentStatus', () => {
			agentStatusProvider.refresh();
		})
	);

	// --- Background Tasks ---
	const backgroundClient = new BackgroundTaskClient();
	const metricsTracker = new MetricsTracker();

	// Check for completed background tasks on reconnect
	backgroundClient.checkOnReconnect();

	// Background task notification handler
	context.subscriptions.push(
		backgroundClient.onDidCompleteTask(() => {
			agentStatusProvider.refresh();
		})
	);

	// Create background task command
	context.subscriptions.push(
		vscode.commands.registerCommand('sota.createBackgroundTask', async () => {
			const name = await vscode.window.showInputBox({
				prompt: 'Task name',
				placeHolder: 'e.g., Generate E2E tests',
			});
			if (!name) {
				return;
			}

			const description = await vscode.window.showInputBox({
				prompt: 'Task description',
				placeHolder: 'Describe what the task should do...',
			});
			if (!description) {
				return;
			}

			try {
				const task = await backgroundClient.createTask({
					name,
					description,
					projectPath: workspacePath,
				});
				vscode.window.showInformationMessage(
					`Background task "${task.name}" started (ID: ${task.id})`
				);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				vscode.window.showErrorMessage(`Failed to create background task: ${message}`);
			}
		})
	);

	// View background task results
	context.subscriptions.push(
		vscode.commands.registerCommand('sota.showBackgroundTaskResults', async (taskId?: string) => {
			if (!taskId) {
				const tasks = await backgroundClient.listTasks('completed');
				if (tasks.length === 0) {
					vscode.window.showInformationMessage('No completed background tasks.');
					return;
				}
				const pick = await vscode.window.showQuickPick(
					tasks.map(t => ({
						label: t.name,
						description: t.status,
						detail: t.progress.message,
						taskId: t.id,
					})),
					{ placeHolder: 'Select a task to view results' },
				);
				if (!pick) {
					return;
				}
				taskId = pick.taskId;
			}

			const results = await backgroundClient.getTaskResults(taskId);
			const content = Object.entries(results)
				.map(([file, data]) => `## ${file}\n\`\`\`\n${data}\n\`\`\``)
				.join('\n\n');

			const doc = await vscode.workspace.openTextDocument({
				content: content || 'No results available.',
				language: 'markdown',
			});
			vscode.window.showTextDocument(doc);
		})
	);

	// --- Fleet Dashboard ---
	context.subscriptions.push(
		vscode.commands.registerCommand('sota.showFleetDashboard', () => {
			FleetDashboardPanel.createOrShow(
				context.extensionUri,
				agentManager,
				metricsTracker,
				backgroundClient,
			);
		})
	);

	// --- Personality ---
	StartupMessages.show(context.extensionUri);

	const terminalBanner = new TerminalBanner();
	context.subscriptions.push(terminalBanner);

	const konamiCode = new KonamiCode();
	context.subscriptions.push(konamiCode);

	const gitBlameEasterEgg = new GitBlameEasterEgg();
	context.subscriptions.push(gitBlameEasterEgg);

	// Dispose sandbox, security, spec sync, and background client on deactivation
	context.subscriptions.push({
		dispose: () => {
			sandboxManager.destroy();
			securityScanner.dispose();
			supplyChainGuard.dispose();
			hookEngine.dispose();
			sandboxTerminal.dispose();
			specSyncWatcher.dispose();
			backgroundClient.dispose();
		}
	});
}

/**
 * Load supply chain configuration from .son-of-anton/supply-chain.json.
 */
async function loadSupplyChainConfig(guard: SupplyChainGuard, workspacePath: string): Promise<void> {
	if (!workspacePath) {
		return;
	}

	try {
		const configUri = vscode.Uri.file(`${workspacePath}/.son-of-anton/supply-chain.json`);
		const content = await vscode.workspace.fs.readFile(configUri);
		const config = JSON.parse(Buffer.from(content).toString('utf-8'));
		guard.loadConfig(config);
	} catch {
		// No config file — use defaults
	}
}

export function deactivate(): void {
	// Cleanup handled by disposables
}
