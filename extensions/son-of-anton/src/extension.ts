/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { ChatPanel } from './chat/ChatPanel';
import { InlineEditProvider } from './inline/InlineEdit';
import { CompletionProvider } from './inline/CompletionProvider';
import { AgentStatusProvider } from './sidebar/AgentStatusProvider';
import { TaskQueueProvider } from './sidebar/TaskQueueProvider';
import { TraceViewerPanel } from './trace/TraceViewerPanel';
import { TraceExporter } from './trace/TraceExporter';
import { LlmClient } from './llm/LlmClient';
import { AgentManager } from './agents/AgentManager';
import { McpClient } from './mcp/McpClient';
import { StatusBarManager } from './sidebar/StatusBarManager';
import { registerAgentParticipants } from './agents/AgentParticipants';
import { SandboxManager, defaultSandboxConfig } from './sandbox/SandboxManager';
import { SandboxTerminal } from './sandbox/SandboxTerminal';
import { SecurityScanner } from './security/SecurityScanner';
import { SupplyChainGuard } from './security/SupplyChainGuard';
import { HookEngine } from './hooks/HookEngine';
import { SpecSyncWatcher } from './hooks/SpecSyncWatcher';
import { BackgroundTaskClient } from './background/BackgroundTaskClient';
import { FleetDashboardPanel } from './dashboard/FleetDashboardPanel';
import { MetricsTracker } from './agents/MetricsTracker';

export function activate(context: vscode.ExtensionContext): void {
	const llmClient = new LlmClient(context);
	const mcpClient = new McpClient();
	const agentManager = new AgentManager(llmClient);
	const agentStatusProvider = new AgentStatusProvider(agentManager);
	const taskQueueProvider = new TaskQueueProvider(agentManager);
	const statusBarManager = new StatusBarManager(agentManager);

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

	// Register multi-agent chat participants
	const agentDisposables = registerAgentParticipants(
		context, llmClient, mcpClient, agentManager,
	);
	context.subscriptions.push(...agentDisposables);

	// Chat Panel
	context.subscriptions.push(
		vscode.commands.registerCommand('sota.openChat', () => {
			ChatPanel.createOrShow(context, llmClient);
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
		backgroundClient.onDidCompleteTask(task => {
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
