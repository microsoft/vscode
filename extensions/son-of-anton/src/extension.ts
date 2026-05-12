/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import * as path from 'node:path';
import { globalScopedConfig, liveConfig } from './chat/globalScopedConfig';
import { mirrorSecretsToCliStore, watchSecretsForCliMirror } from './auth/cliSecretsMirror';
import { ChatPanel } from './chat/ChatPanel';
import { ChatViewProvider } from './chat/ChatViewProvider';
import { WriteSnapshotStore } from './chat/WriteSnapshotStore';
import { ConversationStore } from './chat/ConversationStore';
import { ConversationListProvider, ConversationTreeItem } from './chat/ConversationListProvider';
import { InlineEditProvider } from './inline/InlineEdit';
import { CompletionProvider } from './inline/CompletionProvider';
import { AgentStatusProvider } from './sidebar/AgentStatusProvider';
import { AgentRosterProvider, formatLastActive } from './sidebar/AgentRosterProvider';
import { TaskQueueProvider } from './sidebar/TaskQueueProvider';
import { PERSONAS } from 'son-of-anton-core/chat/personas';
import { TraceViewerPanel } from './trace/TraceViewerPanel';
import { TraceExporter } from './trace/TraceExporter';
import { LlmClient } from 'son-of-anton-core/llm/LlmClient';
import { isCodexAvailable } from 'son-of-anton-core/llm/codexRunner';
import { isClaudeCodeAvailable } from 'son-of-anton-core/llm/claudeCodeRunner';
import { ToolRegistry, createInstrumentedWorkspaceToolContext, defaultModalApproval } from './tools/registry';
import { getActiveApproval } from './chat/approvalRegistry';
import { HookRunner, hooksFilePath } from 'son-of-anton-core/persistence/HookRunner';
import type { CoreHost } from 'son-of-anton-core/host';
import * as fs from 'node:fs';
import { AgentManager } from 'son-of-anton-core/agents/AgentManager';
import { McpClient, type McpClientDeps } from 'son-of-anton-core/mcp/McpClient';
import { bridgeMcpToolsIntoRegistry, subscribeMcpToolBridge } from 'son-of-anton-core/mcp/McpToolBridge';
import { StatusBarManager } from './sidebar/StatusBarManager';
import { registerAgentParticipants } from './agents/AgentParticipants';
import { createAgentStack } from 'son-of-anton-core/agents/AgentStackFactory';
import { AgentBridge } from './chat/AgentBridge';
import { WorkspaceContextProvider } from './chat/WorkspaceContextProvider';
import { WorkspaceAgentsMdProvider } from './agents/AgentsMdLoader';
import { SandboxManager, defaultSandboxConfig } from './sandbox/SandboxManager';
import { SandboxTerminal } from './sandbox/SandboxTerminal';
import { SecurityScanner } from './security/SecurityScanner';
import { SupplyChainGuard } from './security/SupplyChainGuard';
import { TrustedFolders } from './security/TrustedFolders';
import { TrustStatusBarItem } from './security/TrustStatusBarItem';
import { HookEngine } from './hooks/HookEngine';
import { SpecSyncWatcher } from './hooks/SpecSyncWatcher';
import { BackgroundTaskClient } from './background/BackgroundTaskClient';
import { FleetDashboardPanel } from './dashboard/FleetDashboardPanel';
import { MetricsTracker } from 'son-of-anton-core/agents/MetricsTracker';
import { StartupMessages } from './personality/StartupMessages';
import { TerminalBanner } from './personality/TerminalBanner';
import { KonamiCode } from './personality/KonamiCode';
import { GitBlameEasterEgg } from './personality/GitBlameEasterEgg';
import { AntonIsWatching } from './personality/AntonIsWatching';
import { registerPersonalityCommands } from './personality/registerPersonalityCommands';
import { activateAuth } from './auth/activation';
import { maybeShowFirstRunSignInPrompt } from './auth/firstRun';
import { SetupWizardPanel } from './onboarding/SetupWizardPanel';
import { CostReporter } from './monitoring/CostReporter';
import { CheckpointManager } from 'son-of-anton-core/checkpoint/CheckpointManager';
import { TaskBoardModel, BoardTask, SubtaskState } from './board/TaskBoardModel';
import { TaskBoardPanel } from './board/TaskBoardPanel';
import { TaskBoardSidebarView } from './board/TaskBoardSidebarView';
import { AgentEvent, AgentPlan } from './chat/agentEvents';
import { CodeGraphController } from './services/CodeGraphController';
import { CodeGraphStatusBarItem as DockerStackStatusBarItem } from './sidebar/CodeGraphStatusBarItem';
import { CodeGraphBackend, type McpServerEntry as CodeGraphMcpEntry } from './codeGraph/CodeGraphBackend';
import { CodeGraphStatusBarItem } from './status/CodeGraphStatusBarItem';
import { CliStatusBarItem } from './cli/CliStatusBarItem';
import { HarnessStatusBarItem } from './status/HarnessStatusBarItem';
import { registerOpenCliInTerminalCommand } from './cli/openCliInTerminal';
import * as cp from 'node:child_process';

export function activate(context: vscode.ExtensionContext): void {
	// --- Credential broker (OAuth-based provider sign-in) ---
	const auth = activateAuth({
		secrets: context.secrets,
		openExternal: uri => vscode.env.openExternal(vscode.Uri.parse(uri)),
		getConfig: section => vscode.workspace.getConfiguration(section),
		registerCommand: (id, handler) => vscode.commands.registerCommand(id, handler),
	});
	context.subscriptions.push(...auth.disposables);

	// One-direction sync: copy the IDE's SecretStorage entries into the
	// CLI's file-backed secret store at `~/.son-of-anton/data/secrets.json`
	// so users who configure providers in the IDE can run `sota chat` from
	// a terminal without re-exporting env vars. Runs once at activation
	// plus a watcher for live updates on every credential save.
	void mirrorSecretsToCliStore(context.secrets);
	context.subscriptions.push(watchSecretsForCliMirror(context.secrets));

	// Cost meter for the chat surface header. Threaded into LlmClient so any
	// streamRequest call that carries an `agentHandle` records cost; the chat
	// view subscribes to the reporter's onDidChange to refresh its meter.
	const costReporter = new CostReporter();
	context.subscriptions.push({ dispose: () => costReporter.dispose() });

	const llmClient = new LlmClient(
		context.secrets,
		liveConfig('sota'),
		auth.broker,
		costReporter,
	);

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

	// Forward reference: the bundled code-graph backend (see below) is
	// constructed after the agent stack so it can read globalStorageUri, but
	// the McpClient is built earlier and needs to know about the embedded
	// MCP server. The closure captures the reference and reads it at call
	// time — the backend's `onDidChangeState` re-fires `onSettingChange` so
	// the McpClient reconciles when the embedded server comes up or down.
	let codeGraphBackendRef: CodeGraphBackend | undefined;
	const codeGraphSettingChangeListeners: Array<() => void> = [];
	const fireCodeGraphSettingChange = (): void => {
		for (const listener of codeGraphSettingChangeListeners) {
			try { listener(); } catch (err) { console.warn('[extension] code-graph setting listener threw', err); }
		}
	};
	const mcpClientDeps: McpClientDeps = {
		readServersSetting: () => {
			const userServers = vscode.workspace.getConfiguration().get<unknown>('sota.mcp.servers');
			const list: unknown[] = Array.isArray(userServers) ? [...userServers] : [];
			const backendEntry: CodeGraphMcpEntry | undefined = codeGraphBackendRef?.getMcpServerEntry();
			if (backendEntry) {
				// Skip if the user has manually configured a `code-graph` entry
				// already — their setting wins so existing Docker users aren't
				// silently overridden.
				const userHasOverride = list.some(s =>
					s !== null && typeof s === 'object' && (s as { name?: unknown }).name === backendEntry.name,
				);
				if (!userHasOverride) {
					list.push({
						name: backendEntry.name,
						command: backendEntry.command,
						args: backendEntry.args ? [...backendEntry.args] : undefined,
						env: backendEntry.env,
						cwd: backendEntry.cwd,
					});
				}
			}
			return list;
		},
		getWorkspaceRoot: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
		onSettingChange: (listener) => {
			codeGraphSettingChangeListeners.push(listener);
			const sub = vscode.workspace.onDidChangeConfiguration(e => {
				if (
					e.affectsConfiguration('sota.mcp.servers') ||
					e.affectsConfiguration('sota.codeGraph')
				) {
					listener();
				}
			});
			return {
				dispose: () => {
					const idx = codeGraphSettingChangeListeners.indexOf(listener);
					if (idx >= 0) {
						codeGraphSettingChangeListeners.splice(idx, 1);
					}
					sub.dispose();
				},
			};
		},
	};
	const mcpClient = new McpClient(mcpClientDeps);
	context.subscriptions.push({ dispose: () => mcpClient.dispose() });

	// Subscribe the registry to live MCP tool updates so adds / edits / removes
	// from the in-chat settings UI take effect without a chat reload. The
	// subscription is registered before the initial bridge run so any race
	// where the McpClient fires onDidChangeTools mid-bridge is handled.
	context.subscriptions.push(subscribeMcpToolBridge(mcpClient, toolRegistry));

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

	// Phase 67: project-context provider. Loads `.son-of-anton/AGENTS.md` /
	// `AGENTS.md` / `CLAUDE.md` from every workspace root, watches for
	// changes, and feeds the assembled markdown into the agent system prompt
	// via `CoreHost.projectContext`. The output channel surfaces one INFO
	// line the first time each file is loaded so users can confirm which
	// files the agents are seeing.
	const agentsMdChannel = vscode.window.createOutputChannel('Son of Anton: AGENTS.md');
	context.subscriptions.push(agentsMdChannel);
	const projectContextProvider = new WorkspaceAgentsMdProvider(
		vscode.workspace.workspaceFolders,
		agentsMdChannel,
	);
	context.subscriptions.push(projectContextProvider);

	// Build the agent stack once and share it across surfaces (chat
	// participants, webview sidebar, command-palette commands). Disposing
	// the stack flushes metrics so we don't drop telemetry on shutdown.
	//
	// H1 activation (IDE side) — supply a `ToolExecutionContext` so
	// specialists dispatched through the orchestrator (`@anton "..."` →
	// plan → CodeGeneratorAgent.execute) drive the native tool-use loop
	// instead of the legacy diff-parse fallback. The context comes from
	// the same `createWorkspaceToolContext` factory the chat panel uses,
	// so writeFile / runCommand surface their existing modal approval
	// dialogs (with diff preview) when specialists invoke them. The
	// chat panel's webview-card approval flow is unaffected — that path
	// runs its own tool loop (`runDirectTurn`) with its own context
	// instance and its own gating, independent of `BaseAgent.runToolLoop`.
	//
	// Single context instance for the agent stack's lifetime: the
	// workspace root is captured at activation. Switching workspaces
	// requires a window reload — same constraint that already applies
	// to `workspaceRoot` and `projectContextProvider` above.
	// H14 — Workspace-trust-gated hook runner for `.son-of-anton/hooks.json`.
	// Constructed once per activation so every chat surface (agent stack
	// specialists AND the chat panel's per-send tool loop) fires the same
	// `pre-write-file` / `pre-shell-command` / `post-tool-call` scripts.
	// We skip instantiation entirely when the file is missing or the
	// workspace is untrusted so untouched workspaces pay zero overhead.
	// The HookRunner needs a CoreHost; we synthesise the minimal slice
	// (workspace + notifier) here rather than pulling in a full host
	// implementation — the runner only reads `workspace.folders[0].fsPath`,
	// `workspace.isTrusted`, and `notifier.warn` for slow-script logging.
	const hookRunner: HookRunner | undefined = (() => {
		if (!workspacePath || !vscode.workspace.isTrusted) {
			return undefined;
		}
		if (!fs.existsSync(hooksFilePath(workspacePath))) {
			return undefined;
		}
		const folderName = vscode.workspace.workspaceFolders?.[0]?.name ?? path.basename(workspacePath);
		// VS Code adapter for the core `Notifier` interface. `warn` is the
		// only method the HookRunner actually calls (slow-hook timeouts);
		// the others are wired for completeness so future hook events that
		// log via `notifier.info` / `notifier.error` keep working.
		const notifier = {
			info: (message: string) => { void vscode.window.showInformationMessage(message); },
			warn: (message: string) => { void vscode.window.showWarningMessage(message); },
			error: (message: string) => { void vscode.window.showErrorMessage(message); },
		};
		const hostStub = {
			// Only the surface HookRunner reads is populated; the rest is
			// asserted via cast since the runner never touches it.
			workspace: {
				folders: [{ fsPath: workspacePath, name: folderName }],
				isTrusted: true,
			},
			notifier,
		} as unknown as CoreHost;
		return new HookRunner(hostStub);
	})();

	// Thin VS Code adapter for the core ConfigStore shape so the agent
	// stack can read user-configurable settings — currently
	// `sota.agents.<handle>.model` for per-agent model overrides.
	// Reading via `vscode.workspace.getConfiguration()` picks up live
	// changes without an extension reload, but the agent stack only
	// reads at construction so a window reload is still required for
	// new model assignments to take effect.
	const agentConfigStore: import('son-of-anton-core/host').ConfigStore = {
		get<T>(key: string, defaultValue?: T): T | undefined {
			const value = vscode.workspace.getConfiguration().get<T>(key);
			return value ?? defaultValue;
		},
	};

	const agentStack = createAgentStack({
		llmClient,
		mcpClient,
		agentManager,
		globalState: context.globalState,
		workspaceRoot: workspacePath || undefined,
		projectContext: projectContextProvider,
		configStore: agentConfigStore,
		toolExecutionContext: workspacePath
			? createInstrumentedWorkspaceToolContext(hookRunner, {
				// Approval routing: consult the chat panel's webview-card
				// flow when one is active (registered via
				// `setActiveApproval` on chat-session construction); fall
				// back to the modal `vscode.window.showInformationMessage`
				// flow when no panel exists (palette commands,
				// programmatic invocations). The lookup happens per call
				// so panels opening / closing are picked up immediately.
				requestApproval: async (request) => {
					const handler = getActiveApproval();
					if (handler) {
						return handler(request);
					}
					return defaultModalApproval(request);
				},
			})
			: undefined,
	});
	context.subscriptions.push({ dispose: () => agentStack.dispose() });
	// Specialist memory is owned by the stack but pushed separately so
	// future surfaces (e.g. UI listing what `@anton-code` remembers) can
	// resolve it from `context.subscriptions` if needed. Disposal is
	// idempotent — `agentStack.dispose()` already calls into it.
	context.subscriptions.push(agentStack.specialistMemory);

	// Per-workspace trust gate. Threaded into the AgentBridge so every
	// orchestrator / specialist run has to clear it before any tool call
	// (write_file, run_command, MCP) can fire. Wired up here (rather than
	// inside the bridge) so command handlers and the status bar item can
	// share the same instance.
	const trustedFolders = new TrustedFolders(context.globalState);
	context.subscriptions.push(trustedFolders);

	const agentBridge = new AgentBridge(agentStack, trustedFolders);
	context.subscriptions.push({ dispose: () => agentBridge.dispose() });

	// Status bar lock that only surfaces when platform trust is granted but
	// Son of Anton's consent has not been given.
	const trustStatusBarItem = new TrustStatusBarItem(trustedFolders);
	context.subscriptions.push(trustStatusBarItem);

	// Trust commands (palette + status-bar click target).
	context.subscriptions.push(
		vscode.commands.registerCommand('sota.grantWorkspaceTrust', async () => {
			const folder = vscode.workspace.workspaceFolders?.[0];
			if (!folder) {
				vscode.window.showInformationMessage('Son of Anton: open a workspace folder before granting trust.');
				return;
			}
			if (!vscode.workspace.isTrusted) {
				vscode.window.showWarningMessage(
					'Son of Anton: VS Code workspace trust is required first. Use "Workspaces: Manage Workspace Trust" to grant it.',
				);
				return;
			}
			const choice = await vscode.window.showWarningMessage(
				`Trust Son of Anton in '${folder.name}'?\n\nSon of Anton agents can read your files, run shell commands, and modify code. Grant trust only if you trust this workspace.`,
				{ modal: true },
				'Trust Forever',
				'Cancel',
			);
			if (choice === 'Trust Forever') {
				trustedFolders.grant(folder.uri.fsPath);
				trustStatusBarItem.refresh();
				vscode.window.showInformationMessage(`Son of Anton: granted trust for '${folder.name}'.`);
			}
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('sota.revokeWorkspaceTrust', () => {
			const folder = vscode.workspace.workspaceFolders?.[0];
			if (!folder) {
				vscode.window.showInformationMessage('Son of Anton: no workspace folder open.');
				return;
			}
			if (!trustedFolders.isTrusted(folder.uri.fsPath)) {
				vscode.window.showInformationMessage(`Son of Anton: '${folder.name}' is not currently trusted.`);
				return;
			}
			trustedFolders.revoke(folder.uri.fsPath);
			trustStatusBarItem.refresh();
			vscode.window.showInformationMessage(`Son of Anton: revoked trust for '${folder.name}'.`);
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('sota.manageTrustedFolders', async () => {
			const entries = trustedFolders.list();
			if (entries.length === 0) {
				vscode.window.showInformationMessage('Son of Anton: no trusted folders yet.');
				return;
			}
			const pick = await vscode.window.showQuickPick(
				entries.map(entry => ({
					label: `$(lock) ${entry.folderPath}`,
					description: `granted ${new Date(entry.grantedAt).toLocaleString()} by ${entry.grantedBy}`,
					detail: 'Select to revoke trust for this folder.',
					folderPath: entry.folderPath,
				})),
				{ placeHolder: 'Select a folder to revoke Son of Anton trust' },
			);
			if (!pick) {
				return;
			}
			trustedFolders.revoke(pick.folderPath);
			trustStatusBarItem.refresh();
			vscode.window.showInformationMessage(`Son of Anton: revoked trust for '${pick.folderPath}'.`);
		}),
	);

	// Single shared WorkspaceContextProvider so MRU listeners are registered
	// once for the whole window, not per-session — avoids duplicate event
	// handlers when both the sidebar view and the panel command are active.
	const workspaceContextProvider = new WorkspaceContextProvider();
	context.subscriptions.push(workspaceContextProvider);

	// Register multi-agent chat participants against the shared stack
	const agentDisposables = registerAgentParticipants(context, agentStack);
	context.subscriptions.push(...agentDisposables);

	// Conversation history store (Phase 47). Persists past chat sessions in
	// globalState so users can browse and return to them from the History
	// sidebar view. Constructed once and shared across the chat sidebar, the
	// editor-panel chat command, and the History tree provider.
	const conversationStore = new ConversationStore(context);
	context.subscriptions.push(conversationStore);

	// Workspace checkpoint manager (Cline-style snapshots). Captures a
	// `git stash create` SHA per chat turn so the user can roll the working
	// tree back to any prior state. Capture is best-effort and silently
	// skipped if the workspace isn't a git repo or `sota.checkpoints.enabled`
	// is `false`.
	const checkpointManager = new CheckpointManager(conversationStore, context.globalState, {
		notifier: {
			info: (msg) => { void vscode.window.showInformationMessage(msg); },
			warn: (msg) => { void vscode.window.showWarningMessage(msg); },
			error: (msg) => { void vscode.window.showErrorMessage(msg); },
		},
		config: vscode.workspace.getConfiguration('sota'),
		getWorkspaceRoot: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
		confirmRestore: async (message) => {
			const choice = await vscode.window.showWarningMessage(
				message,
				{ modal: true },
				'Restore',
			);
			return choice === 'Restore';
		},
	});
	context.subscriptions.push(checkpointManager);

	// Task board (Phase 82). Shared model that mirrors orchestrator plan +
	// subtask events into a per-conversation kanban state. Wired to the
	// AgentBridge's global event tap so the model updates regardless of which
	// chat surface initiated the run.
	const taskBoardModel = new TaskBoardModel();
	context.subscriptions.push(taskBoardModel);
	context.subscriptions.push(
		agentBridge.onDidEmitEvent(envelope => {
			const conversationId = envelope.conversationId;
			if (!conversationId) {
				return;
			}
			applyAgentEventToBoard(taskBoardModel, conversationId, envelope.event);
		}),
	);

	// Phase 63 — shared store for write_file pre-image snapshots. Backs the
	// "View diff" button on tool-result cards by exposing each captured
	// snapshot through a synthetic `son-of-anton-snapshot:` URI; clicking
	// the button calls `vscode.diff(snapshotUri, onDiskUri, title)`.
	const writeSnapshotStore = new WriteSnapshotStore();
	context.subscriptions.push(
		vscode.workspace.registerTextDocumentContentProvider(WriteSnapshotStore.scheme, writeSnapshotStore),
		{ dispose: () => writeSnapshotStore.dispose() },
	);

	// Chat sidebar view (primary surface)
	const chatViewProvider = new ChatViewProvider(context, conversationStore, llmClient, toolRegistry, agentBridge, workspaceContextProvider, costReporter, checkpointManager, auth.broker, taskBoardModel, writeSnapshotStore, hookRunner);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(ChatViewProvider.VIEW_ID, chatViewProvider, {
			webviewOptions: { retainContextWhenHidden: true },
		}),
	);

	// Task board sidebar (Phase 83). Compact pane in its own activity-bar
	// container that summarises the active conversation's board and hosts
	// the "Open Full Board" CTA which delegates to the existing
	// `sota.openTaskBoard` command. Subscribes to `taskBoardModel` and
	// `conversationStore` so counts repaint as plans evolve and as the user
	// switches conversations from the chat sidebar.
	const taskBoardSidebarView = new TaskBoardSidebarView(context, taskBoardModel, conversationStore);
	context.subscriptions.push(taskBoardSidebarView);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(TaskBoardSidebarView.VIEW_ID, taskBoardSidebarView, {
			webviewOptions: { retainContextWhenHidden: true },
		}),
	);

	// History sidebar view (Phase 47). Lives below the Chat view inside the
	// `sota-chat` view container. Backed by the shared ConversationStore so
	// edits in either surface (clicking new-chat in the chat header,
	// renaming via the tree) repaint both consistently.
	const conversationListProvider = new ConversationListProvider(conversationStore);
	context.subscriptions.push(conversationListProvider);
	context.subscriptions.push(
		vscode.window.registerTreeDataProvider('sota.conversationList', conversationListProvider),
	);

	// Anton Roster sidebar view (Phase 77). Lists every persona registered
	// in `son-of-anton-core/chat/personas` with a live status chip driven
	// by the same `AgentBridge.onDidEmitEvent` envelopes the task board
	// observes. Sits beneath the History view in the `sota-chat`
	// container.
	const agentRosterProvider = new AgentRosterProvider(agentBridge);
	context.subscriptions.push(agentRosterProvider);
	const agentRosterView = vscode.window.createTreeView('sota.specialistRoster', {
		treeDataProvider: agentRosterProvider,
		showCollapseAll: false,
	});
	context.subscriptions.push(agentRosterView);

	// Dedicated output channel surfaced by "Show Last Trace" — split from
	// the generic agent-trace exporter so the roster's traces don't get
	// drowned out by hook execution lines.
	const specialistTraceChannel = vscode.window.createOutputChannel('Son of Anton: Specialists');
	context.subscriptions.push(specialistTraceChannel);

	// --- Anton Roster commands ---
	// The action handlers receive either the tree item argument forwarded
	// by VS Code (when invoked from the context menu) or no argument
	// (when invoked from the palette); the helper below normalises both.
	const resolveRosterHandle = async (arg: unknown): Promise<string | undefined> => {
		if (typeof arg === 'string' && arg.length > 0) {
			return arg;
		}
		if (arg && typeof arg === 'object' && 'id' in arg) {
			const id = (arg as { id?: unknown }).id;
			if (typeof id === 'string' && id.length > 0) {
				return id;
			}
		}
		// Palette fallback: ask the user which specialist to act on.
		const items = PERSONAS.map(persona => ({
			label: `${persona.monogram}  ${persona.id}`,
			description: persona.tagline,
			handle: persona.id,
		}));
		const pick = await vscode.window.showQuickPick(items, {
			placeHolder: 'Select a specialist',
		});
		return pick?.handle;
	};

	context.subscriptions.push(
		vscode.commands.registerCommand('sota.specialistRoster.startThread', async (arg?: unknown) => {
			const handle = await resolveRosterHandle(arg);
			if (!handle) {
				return;
			}
			// Open a fresh conversation and surface the chat view so the
			// user can address the specialist directly. Pre-filling the
			// composer is a follow-up (the chat panel doesn't yet expose a
			// programmatic compose hook), so we hint via status bar.
			const fresh = conversationStore.create();
			await vscode.commands.executeCommand(`${ChatViewProvider.VIEW_ID}.focus`);
			chatViewProvider.openConversation(fresh.summary.id);
			ChatPanel.switchConversation(fresh.summary.id);
			vscode.window.setStatusBarMessage(
				`Started a thread — address ${handle} with @${handle} in the composer.`,
				5000,
			);
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('sota.specialistRoster.viewMemory', async (arg?: unknown) => {
			const handle = await resolveRosterHandle(arg);
			if (!handle) {
				return;
			}
			const entries = agentStack.specialistMemory.list(handle as Parameters<typeof agentStack.specialistMemory.list>[0]);
			if (entries.length === 0) {
				vscode.window.showInformationMessage(`No memory recorded yet for ${handle}.`);
				return;
			}
			const lines: string[] = [
				`# Memory for ${handle}`,
				'',
				`_${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} · newest first_`,
				'',
			];
			for (const entry of entries) {
				const updated = new Date(entry.updatedAt).toLocaleString();
				lines.push(`## ${entry.key}`);
				lines.push(`_Updated: ${updated}${entry.conversationId ? ` · conversation ${entry.conversationId}` : ''}_`);
				lines.push('');
				lines.push(entry.value);
				lines.push('');
			}
			const doc = await vscode.workspace.openTextDocument({
				content: lines.join('\n'),
				language: 'markdown',
			});
			await vscode.window.showTextDocument(doc, { preview: true });
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('sota.specialistRoster.clearThread', async (arg?: unknown) => {
			const handle = await resolveRosterHandle(arg);
			if (!handle) {
				return;
			}
			const choice = await vscode.window.showWarningMessage(
				`Clear ${handle}'s memory and reset roster status? This cannot be undone.`,
				{ modal: true },
				'Clear',
			);
			if (choice !== 'Clear') {
				return;
			}
			agentStack.specialistMemory.clear(handle as Parameters<typeof agentStack.specialistMemory.clear>[0]);
			agentRosterProvider.resetEntry(handle);
			vscode.window.showInformationMessage(`Cleared memory for ${handle}.`);
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('sota.specialistRoster.showLastTrace', async (arg?: unknown) => {
			const handle = await resolveRosterHandle(arg);
			if (!handle) {
				return;
			}
			const entry = agentRosterProvider.getEntry(handle);
			specialistTraceChannel.show(true);
			if (!entry) {
				specialistTraceChannel.appendLine(`[${new Date().toISOString()}] ${handle}: no roster entry.`);
				return;
			}
			const stamp = new Date().toISOString();
			specialistTraceChannel.appendLine(`[${stamp}] ${handle} · status=${entry.status} · last active=${formatLastActive(entry.lastActiveAt)}`);
			if (entry.lastTrace) {
				specialistTraceChannel.appendLine(entry.lastTrace);
			} else {
				specialistTraceChannel.appendLine('No trace recorded yet — run the specialist via chat first.');
			}
			specialistTraceChannel.appendLine('');
		}),
	);

	// Open chat in editor area (legacy command, still useful for split layouts)
	context.subscriptions.push(
		vscode.commands.registerCommand('sota.openChat', () => {
			ChatPanel.createOrShow(context, conversationStore, llmClient, toolRegistry, agentBridge, workspaceContextProvider, costReporter, checkpointManager, auth.broker, taskBoardModel, writeSnapshotStore, hookRunner);
		})
	);

	// Open the task board (Phase 82) for the most recently active conversation.
	// The board is a separate webview panel (not embedded in the chat
	// sidebar) so it can occupy a full editor column for the kanban grid.
	context.subscriptions.push(
		vscode.commands.registerCommand('sota.openTaskBoard', () => {
			const list = conversationStore.list();
			const activeId = list.length > 0 ? list[0].id : undefined;

			// Best-effort hydration: if the orchestrator already has a live plan
			// (e.g. the user proposed a plan, then opened the board before
			// approving), seed the model from that plan so the board renders
			// tiles immediately rather than showing the empty state.
			if (activeId) {
				const existingSnapshot = taskBoardModel.getSnapshot(activeId);
				if (!existingSnapshot) {
					const plan = agentBridge.getActivePlan();
					if (plan) {
						const tasks: BoardTask[] = plan.subtasks.map(subtask => ({
							id: subtask.id,
							instruction: subtask.instruction,
							assignee: subtask.assignee,
							scopeFiles: subtask.scopeFiles,
							dependencies: subtask.dependencies,
							state: subtaskStatusToBoardState(subtask.status),
						}));
						taskBoardModel.setPlan(activeId, tasks);
					}
				}
			}

			TaskBoardPanel.createOrShow(
				context,
				taskBoardModel,
				conversationStore,
				{
					revealSubtaskInChat: (taskId) => {
						// Best-effort: surface the chat view and rely on the user
						// to scroll to the matching subtask card. Deep-linking
						// into the transcript is a follow-up — for now we just
						// guarantee the chat is visible.
						void vscode.commands.executeCommand(`${ChatViewProvider.VIEW_ID}.focus`);
						void vscode.window.showInformationMessage(`Reveal subtask ${taskId} in chat — open the active conversation to scroll to it.`);
					},
					dispatchSubtask: (_taskId) => {
						// Drag from Ready -> In Progress fans through to a fresh
						// approve cycle. The orchestrator's concurrent dispatch
						// loop picks up *every* ready subtask, not just the
						// dragged one, but the UX here matches "the user signalled
						// that work should begin".
						void runApprove();
					},
					reassignSubtask: (taskId, newAssignee) => {
						if (activeId) {
							taskBoardModel.reassign(activeId, taskId, newAssignee);
						}
					},
					rerunSubtask: (taskId) => {
						// Re-running a single tile in v1 just resets it to ready
						// and triggers another approve cycle. The dependency
						// graph then re-routes any downstream tiles that were
						// blocked on this task.
						if (activeId) {
							taskBoardModel.updateTask(activeId, taskId, { state: 'ready', summary: undefined, finishedAt: undefined });
							void runApprove();
						}
					},
					// Embedded "Talk to the board" chat: pump a stream from
					// LlmClient back to the React webview. Returns a disposable
					// the panel can dispose to cancel mid-stream (we use an
					// AbortController to actually unwind the underlying fetch).
					streamChat: (model, messages, onEvent, tools) => {
						const controller = new AbortController();
						void (async () => {
							try {
								// LlmClient's `LlmMessage` only accepts user / assistant
								// roles; any system messages from the webview collapse
								// into the systemPrompt below, prepended to the static
								// board persona.
								const systemFragments = messages
									.filter(m => m.role === 'system')
									.map(m => m.content);
								const systemPrompt = [
									'You are Son of Anton, an AI orchestrator embedded in the Task Board. You can move cards, reassign work, change priorities, and answer questions about the board state. Use the registered tools (moveCard, addCard, setCardStatus, setCardAssignee, setCardPriority) when the user asks for board mutations.',
									...systemFragments,
								].filter(Boolean).join('\n\n');
								const turnMessages = messages
									.filter(m => m.role === 'user' || m.role === 'assistant')
									.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
								const stream = llmClient.streamRequest({
									model: model as Parameters<typeof llmClient.streamRequest>[0]['model'],
									messages: turnMessages,
									systemPrompt,
									enableCaching: true,
									signal: controller.signal,
									// Forward the webview-derived tools array. Shape is
									// already compatible with `LlmClient.ToolDefinition`.
									tools: tools as Parameters<typeof llmClient.streamRequest>[0]['tools'],
								});
								for await (const event of stream) {
									if (event.type === 'token') {
										onEvent({ type: 'token', token: event.token });
									} else if (event.type === 'tool-call') {
										onEvent({ type: 'tool-call', id: event.id, name: event.name, input: event.input });
									} else if (event.type === 'complete') {
										onEvent({ type: 'complete', fullText: event.fullText });
									} else if (event.type === 'error') {
										onEvent({ type: 'error', error: event.error });
									}
								}
							} catch (err) {
								if (controller.signal.aborted) {
									return;
								}
								const message = err instanceof Error ? err.message : String(err);
								onEvent({ type: 'error', error: message });
							}
						})();
						return new vscode.Disposable(() => controller.abort());
					},
				},
				activeId,
			);

			async function runApprove(): Promise<void> {
				const cancellationSource = new vscode.CancellationTokenSource();
				try {
					await agentBridge.approveActivePlan(activeId, () => { /* events flow via onDidEmitEvent */ }, cancellationSource.token);
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					void vscode.window.showErrorMessage(`Task board approve failed: ${message}`);
				} finally {
					cancellationSource.dispose();
				}
			}
		}),
	);

	// Conversation history commands (Phase 47).
	context.subscriptions.push(
		vscode.commands.registerCommand('sota.openConversation', async (id: string) => {
			if (typeof id !== 'string' || !id) {
				return;
			}
			// Reveal the chat sidebar so the message has somewhere to land
			// before we forward the switch — clicking a History entry while
			// the chat view is collapsed still surfaces the conversation.
			await vscode.commands.executeCommand(`${ChatViewProvider.VIEW_ID}.focus`);
			chatViewProvider.openConversation(id);
			ChatPanel.switchConversation(id);
		}),
	);

	// CLI bridge (Phase CLI7). Clicking a CLI session in the History tree
	// imports it into the IDE store as a fresh editable conversation and
	// surfaces it in the chat view. The CLI file is left untouched so
	// future CLI writes don't disturb the imported copy.
	context.subscriptions.push(
		vscode.commands.registerCommand('sota.openCliConversation', async (id: string) => {
			if (typeof id !== 'string' || !id) {
				return;
			}
			await vscode.commands.executeCommand(`${ChatViewProvider.VIEW_ID}.focus`);
			const imported = await ChatPanel.openCliConversation(id, conversationStore);
			if (!imported) {
				void vscode.window.showWarningMessage(
					'Could not load the selected CLI conversation. The file may have been moved or is malformed.',
				);
				return;
			}
			// `ChatPanel.openCliConversation` mints the fresh IDE
			// conversation and broadcasts the switch via the static
			// `switchConversation` helper; the sidebar webview view also
			// needs a nudge so its single-session surface re-renders.
			const newest = conversationStore.list();
			if (newest.length > 0) {
				chatViewProvider.openConversation(newest[0].id);
			}
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('sota.newConversation', async () => {
			const fresh = conversationStore.create();
			await vscode.commands.executeCommand(`${ChatViewProvider.VIEW_ID}.focus`);
			chatViewProvider.openConversation(fresh.summary.id);
			ChatPanel.switchConversation(fresh.summary.id);
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('sota.renameConversation', async (item?: ConversationTreeItem) => {
			if (!item || !item.summary) {
				return;
			}
			const newTitle = await vscode.window.showInputBox({
				prompt: 'Rename conversation',
				value: item.summary.title,
				validateInput: (value) => (value.trim().length === 0 ? 'Title cannot be empty.' : undefined),
			});
			if (newTitle === undefined) {
				return;
			}
			conversationStore.rename(item.summary.id, newTitle);
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('sota.deleteConversation', async (item?: ConversationTreeItem) => {
			if (!item || !item.summary) {
				return;
			}
			const confirm = await vscode.window.showWarningMessage(
				`Delete conversation "${item.summary.title}"? This cannot be undone.`,
				{ modal: true },
				'Delete',
			);
			if (confirm !== 'Delete') {
				return;
			}
			const deletedId = item.summary.id;
			conversationStore.delete(deletedId);
			// Drop the conversation's checkpoints alongside it so we don't
			// leak orphaned index entries pointing at a now-defunct
			// conversation id.
			checkpointManager.deleteFor(deletedId);
			// If the deleted conversation was the active one, switch to the
			// most recent remaining (or create a fresh one when the list is
			// now empty) so the chat view doesn't keep rendering a tombstoned
			// conversation's scrollback.
			const remaining = conversationStore.list();
			const target = remaining.length > 0 ? remaining[0].id : conversationStore.create().summary.id;
			chatViewProvider.openConversation(target);
			ChatPanel.switchConversation(target);
		}),
	);

	// Export the active (most recent) conversation to a Markdown file. The
	// command is also wired to a small icon button in the chat header so
	// users don't have to open the palette for a routine archive action.
	context.subscriptions.push(
		vscode.commands.registerCommand('sota.exportConversation', async () => {
			const list = conversationStore.list();
			if (list.length === 0) {
				await vscode.window.showInformationMessage('No conversations to export.');
				return;
			}
			// V1 exports the most recently updated conversation. A future
			// follow-up can wire a quickpick when users push back on this.
			const summary = list[0];
			const record = conversationStore.load(summary.id);
			if (!record) {
				await vscode.window.showWarningMessage('Conversation not found.');
				return;
			}
			const { exportConversationAsMarkdown, exportFilename } = await import('./chat/ConversationExporter');
			// Capture a cost/token snapshot from the live reporter so the
			// export carries a meaningful "Cost & Tokens" block. The
			// reporter only retains in-memory entries for the current
			// session, so reports for older conversations will show
			// session-wide totals rather than per-conversation — a
			// limitation we're explicit about in the section header.
			const totalTokens = costReporter.getTotalTokens();
			const totalCost = costReporter.getTotalCost();
			const markdown = exportConversationAsMarkdown(record, {
				includeMetadata: true,
				includeTimestamps: true,
				workspaceFolder: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
				cost: {
					inputTokens: totalTokens.input,
					outputTokens: totalTokens.output,
					cachedInputTokens: totalTokens.cached,
					totalCost,
				},
			});
			const filename = exportFilename(record);
			const defaultUri = vscode.workspace.workspaceFolders?.[0]?.uri
				? vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, filename)
				: vscode.Uri.file(filename);
			const target = await vscode.window.showSaveDialog({
				defaultUri,
				filters: { Markdown: ['md'] },
			});
			if (!target) {
				return;
			}
			await vscode.workspace.fs.writeFile(target, Buffer.from(markdown, 'utf-8'));
			const filenameLabel = target.path.split('/').pop() ?? filename;
			const choice = await vscode.window.showInformationMessage(
				`Exported to ${filenameLabel}`,
				'Open',
				'Reveal in Explorer',
			);
			if (choice === 'Open') {
				await vscode.commands.executeCommand('vscode.open', target);
			} else if (choice === 'Reveal in Explorer') {
				await vscode.commands.executeCommand('revealFileInOS', target);
			}
		}),
	);

	// --- OAuth sign-in commands (user-facing) ---
	// CredentialBroker has no onDidConnect hook, so we refresh the status bar
	// here after each connect attempt to surface the new provider state.
	//
	// Neither Anthropic nor OpenAI offers public OAuth client registration for
	// third-party tools today, so the literal `sotaAuth.connect` PKCE flow
	// requires a per-user `clientId` setting (not workable for typical
	// installs). The CLI-delegation path is the path that actually works:
	// users install Anthropic's `claude` or OpenAI's `codex` binary, run its
	// own `login` command, and Son of Anton spawns the binary at chat-turn
	// time with the API key stripped from env so the CLI's stored
	// subscription tokens are used.
	//
	// Both commands present a quick-pick when the relevant CLI is detected,
	// offering "Sign in via the CLI" as the first option. Users without the
	// CLI get an "Install" link and an advanced "Configure OAuth client ID"
	// fallback for OAuth-partner deployments.
	context.subscriptions.push(
		vscode.commands.registerCommand('sota.signInClaude', async () => {
			await runSubscriptionSignIn({
				providerLabel: 'Claude (Anthropic)',
				cliBinary: 'claude',
				cliInstallUrl: 'https://docs.claude.com/en/docs/claude-code/quickstart',
				cliInstalled: isClaudeCodeAvailable(),
				oauthProviderId: 'anthropic-oauth',
				oauthClientIdSetting: 'sotaAuth.anthropic-oauth.clientId',
				apiKeySetting: 'sota.apiKey',
			});
			await statusBarManager.refreshAuth();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('sota.signInOpenAI', async () => {
			await runSubscriptionSignIn({
				providerLabel: 'ChatGPT / Codex (OpenAI)',
				cliBinary: 'codex',
				cliInstallUrl: 'https://github.com/openai/codex',
				cliInstalled: isCodexAvailable(),
				oauthProviderId: 'chatgpt-oauth',
				oauthClientIdSetting: 'sotaAuth.chatgpt-oauth.clientId',
				apiKeySetting: 'sota.openaiApiKey',
			});
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
				config: globalScopedConfig('sota'),
			});
		})
	);

	// Clear Chat — starts a fresh conversation in every active chat session.
	// The previous conversation is preserved in the ConversationStore so it
	// remains accessible from the History sidebar.
	context.subscriptions.push(
		vscode.commands.registerCommand('sota.clearChat', () => {
			ChatPanel.clearConversation();
		})
	);

	// --- Workspace Checkpoints ---
	// Manual capture from the palette so users can mint a snapshot outside
	// the chat send loop (e.g. before running a destructive script).
	context.subscriptions.push(
		vscode.commands.registerCommand('sota.captureCheckpoint', async () => {
			const summary = await vscode.window.showInputBox({
				prompt: 'Optional label for this checkpoint',
				placeHolder: 'e.g. Before running migration script',
			});
			if (summary === undefined) {
				return;
			}
			const conversationList = conversationStore.list();
			const conversationId = conversationList.length > 0 ? conversationList[0].id : conversationStore.create().summary.id;
			const record = conversationStore.load(conversationId);
			const turnIndex = record ? record.messages.length : 0;
			const checkpoint = await checkpointManager.capture(
				conversationId,
				turnIndex,
				summary || 'Manual checkpoint',
			);
			if (!checkpoint) {
				vscode.window.showWarningMessage(
					'Could not capture checkpoint — workspace must be a git repository and `sota.checkpoints.enabled` must be true.',
				);
				return;
			}
			vscode.window.showInformationMessage(
				`Checkpoint captured (${checkpoint.gitSha?.slice(0, 7) ?? checkpoint.id.slice(0, 8)}).`,
			);
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('sota.listCheckpoints', async () => {
			const all = checkpointManager.listAll();
			if (all.length === 0) {
				vscode.window.showInformationMessage('No checkpoints captured yet.');
				return;
			}
			const items = [...all].reverse().map(cp => ({
				label: `$(history) ${new Date(cp.capturedAt).toLocaleString()}`,
				description: cp.summary ?? '',
				detail: cp.userMessage,
				checkpoint: cp,
			}));
			const pick = await vscode.window.showQuickPick(items, {
				placeHolder: 'Select a checkpoint to inspect',
			});
			if (!pick) {
				return;
			}
			vscode.window.showInformationMessage(
				`Checkpoint ${pick.checkpoint.gitSha?.slice(0, 7) ?? pick.checkpoint.id.slice(0, 8)} · ${pick.checkpoint.summary ?? ''} · captured ${new Date(pick.checkpoint.capturedAt).toLocaleString()}.`,
			);
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('sota.restoreCheckpoint', async () => {
			const all = checkpointManager.listAll();
			if (all.length === 0) {
				vscode.window.showInformationMessage('No checkpoints to restore.');
				return;
			}
			const items = [...all].reverse().map(cp => ({
				label: `$(history) ${new Date(cp.capturedAt).toLocaleString()}`,
				description: cp.summary ?? '',
				detail: cp.userMessage,
				checkpoint: cp,
			}));
			const pick = await vscode.window.showQuickPick(items, {
				placeHolder: 'Select a checkpoint to restore',
			});
			if (!pick) {
				return;
			}
			const scope = await vscode.window.showQuickPick(
				[
					{ label: 'Restore workspace only', conversationToo: false },
					{ label: 'Restore workspace + conversation', conversationToo: true },
				],
				{ placeHolder: 'How much do you want to restore?' },
			);
			if (!scope) {
				return;
			}
			// Abort any in-flight chat stream before the workspace gets
			// rewritten under it. The chat surface listens for its own
			// abort and unwinds cleanly.
			ChatPanel.abortAll();
			await checkpointManager.restore(pick.checkpoint.id, { conversationToo: scope.conversationToo });
			if (scope.conversationToo) {
				ChatPanel.reloadCurrentConversations();
			}
		}),
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
		vscode.commands.registerCommand('sota.showTraces', (taskId?: string) => {
			TraceViewerPanel.createOrShow(context, agentManager, typeof taskId === 'string' ? taskId : undefined);
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

	// Harness stats command (H16) — surface PromptCacheOptimizer +
	// ModelRouter `formatSummary()` output as a one-shot markdown snapshot.
	// Both objects are read off the agent stack so the dump reflects the
	// same instances the rest of the editor reads from.
	context.subscriptions.push(
		vscode.commands.registerCommand('sota.showHarnessStats', async () => {
			const cacheSummary = agentStack.cacheOptimizer
				? agentStack.cacheOptimizer.formatSummary()
				: '## Prompt Cache Performance\n\n_(cache optimizer not available)_\n';
			const routingSummary = agentStack.modelRouter
				? agentStack.modelRouter.formatSummary()
				: '## Model Routing Summary\n\n_(model router not available)_\n';

			const generatedAt = new Date().toISOString();
			const combined = `# Son of Anton — Harness Stats\n\n_Snapshot taken at ${generatedAt}_\n\n${cacheSummary}\n\n${routingSummary}\n`;

			const doc = await vscode.workspace.openTextDocument({
				content: combined,
				language: 'markdown',
			});
			await vscode.window.showTextDocument(doc, { preview: true });
			// Open the markdown preview alongside so the tables render.
			// Failure (e.g. preview disabled) is non-fatal — the raw markdown
			// is already visible in the editor.
			try {
				await vscode.commands.executeCommand('markdown.showPreview', doc.uri);
			} catch {
				// Preview unavailable — markdown source is still shown.
			}
		}),
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

	// --- Code Graph (bundled docker stack + embedded backend) ---
	const codeGraphChannel = vscode.window.createOutputChannel('Son of Anton Code Graph');
	context.subscriptions.push(codeGraphChannel);
	const repoRoot = path.resolve(context.extensionPath, '..', '..');
	// `services/code-graph/` lives in the Son of Anton repo (alongside the
	// `extensions/` dir), NOT in the user's open workspace. The extension at
	// `<repo>/extensions/son-of-anton/` resolves the repo root as
	// `<extensionPath>/../..`; that's where the bundled compose stack lives.
	// Fall back to the workspace root only if the resolved path doesn't exist
	// (e.g. when the extension ships from a packaged location in the future).
	const codeGraphController = new CodeGraphController({
		workspaceRoot: workspacePath || undefined,
		repoRoot,
		output: codeGraphChannel,
	});
	context.subscriptions.push(codeGraphController);
	// Legacy Docker-compose stack status item — kept for users on the new
	// FalkorDB+Qdrant path. The unified backend status (below) covers the
	// embedded server lifecycle and the legacy `services/{indexer,lsif,
	// mcp-gateway}` Docker setup.
	const dockerStackStatusItem = new DockerStackStatusBarItem(codeGraphController);
	context.subscriptions.push(dockerStackStatusItem);

	// Embedded MCP server lifecycle. Owns the child-process spawn of
	// `services/code-graph/mcp-server/dist/index.js`, auto-restarts on
	// crash, and surfaces backend state to its own status-bar item. The
	// extension merges its `getMcpServerEntry()` into `sota.mcp.servers`
	// (see `mcpClientDeps.readServersSetting` above) so the existing
	// `McpClient` picks the server up without the user having to add it
	// manually.
	const codeGraphBackend = new CodeGraphBackend({
		workspaceRoot: workspacePath || undefined,
		repoRoot,
		storageDir: context.globalStorageUri.fsPath,
		output: codeGraphChannel,
	});
	codeGraphBackendRef = codeGraphBackend;
	context.subscriptions.push(codeGraphBackend);
	// Trigger an McpClient reconcile whenever the backend transitions between
	// off / starting / embedded / docker / failed so the server entry is
	// added/removed in lock-step with the lifecycle.
	context.subscriptions.push(
		codeGraphBackend.onDidChangeState(() => fireCodeGraphSettingChange()),
	);
	const codeGraphBackendStatusItem = new CodeGraphStatusBarItem(codeGraphBackend);
	context.subscriptions.push(codeGraphBackendStatusItem);
	// Kick off the backend asynchronously — activation must stay fast and
	// non-blocking. Failures surface in the output channel / status bar item.
	void codeGraphBackend.start();

	// CLI integration (Phase CLI7 partial). The status bar item shows whether
	// the bundled `sota` CLI is on PATH and the palette command launches it
	// in the integrated terminal — sharing workspace cwd and the file-backed
	// secret + conversation stores already mirrored from the IDE.
	const cliStatusItem = new CliStatusBarItem();
	context.subscriptions.push(cliStatusItem);
	registerOpenCliInTerminalCommand(context);

	// Harness state at a glance — Codex / Claude CLI auth pills + a count
	// of pinned specialist model overrides. Lives next to the `sota` CLI
	// item but covers a different concern (subscription auth + per-agent
	// model assignment vs. CLI install state). Click opens a quick-pick
	// with sign-in / settings / harness-stats shortcuts.
	const harnessStatusItem = new HarnessStatusBarItem();
	context.subscriptions.push(harnessStatusItem);

	context.subscriptions.push(
		vscode.commands.registerCommand('sota.enableCodeGraph', async () => {
			await runEnableCodeGraph(codeGraphController, codeGraphChannel, context);
		}),
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('sota.codeGraph.menu', async () => {
			const pick = await vscode.window.showQuickPick(
				[
					{ label: '$(debug-stop) Stop', action: 'stop' as const },
					{ label: '$(refresh) Restart', action: 'restart' as const },
					{ label: '$(output) Show Logs', action: 'logs' as const },
				],
				{ placeHolder: 'Code Graph actions' },
			);
			if (!pick) {
				return;
			}
			if (pick.action === 'stop') {
				const r = await codeGraphController.stop();
				if (!r.ok) {
					vscode.window.showErrorMessage(`Could not stop code graph: ${r.reason}`);
				}
			} else if (pick.action === 'restart') {
				const r = await codeGraphController.restart();
				if (!r.ok) {
					vscode.window.showErrorMessage(`Could not restart code graph: ${r.reason}`);
				}
			} else {
				await codeGraphController.showLogs();
			}
		}),
	);

	// Four palette commands for the embedded code-graph backend. They mirror
	// the reference extension in `services/code-graph/extension-sample/` but
	// drive the unified `CodeGraphBackend` rather than the older docker
	// compose controller.
	context.subscriptions.push(
		vscode.commands.registerCommand('sota.codeGraph.indexWorkspace', async () => {
			await codeGraphBackend.indexWorkspace();
			vscode.window.showInformationMessage('Son of Anton: code graph reindex requested.');
		}),
		vscode.commands.registerCommand('sota.codeGraph.restart', async () => {
			await codeGraphBackend.restart();
		}),
		vscode.commands.registerCommand('sota.codeGraph.showStatus', () => {
			const state = codeGraphBackend.currentState;
			const lastIndexed = codeGraphBackend.lastIndexedAt
				? new Date(codeGraphBackend.lastIndexedAt).toLocaleString()
				: 'never';
			const files = codeGraphBackend.fileCount ?? 0;
			const symbols = codeGraphBackend.symbolCount ?? 0;
			const failure = codeGraphBackend.failureReason ? ` — ${codeGraphBackend.failureReason}` : '';
			vscode.window.showInformationMessage(
				`Code Graph: ${state}${failure} · last index: ${lastIndexed} · ${files} files, ${symbols} symbols`,
			);
		}),
		vscode.commands.registerCommand('sota.codeGraph.openLogs', () => {
			codeGraphBackend.openLogs();
		}),
	);

	// First-run prompt — fires once per install when the workspace is large
	// enough to plausibly benefit from a code graph. The prompt is silent for
	// users with tiny workspaces or those who've already answered.
	void maybePromptCodeGraphFirstRun(context, workspacePath);

	// --- Personality ---
	StartupMessages.show(context.extensionUri, context);

	const terminalBanner = new TerminalBanner();
	context.subscriptions.push(terminalBanner);

	const konamiCode = new KonamiCode();
	context.subscriptions.push(konamiCode);

	const gitBlameEasterEgg = new GitBlameEasterEgg();
	context.subscriptions.push(gitBlameEasterEgg);

	const antonIsWatching = new AntonIsWatching();
	context.subscriptions.push(antonIsWatching);
	// Manual trigger so the user can test the surface without waiting for
	// the random in-window timer to fire. Bound to the palette as
	// "Son of Anton: Trigger Anton is Watching".
	context.subscriptions.push(
		vscode.commands.registerCommand('sota.triggerAntonIsWatching', () => antonIsWatching.triggerNow()),
	);

	context.subscriptions.push(...registerPersonalityCommands());

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

/**
 * Drive the `sota.enableCodeGraph` palette command flow:
 *  1. Verify Docker is on PATH (offer install link if missing).
 *  2. Build the bundled MCP server if it hasn't been built yet.
 *  3. Bring the docker compose stack up and poll FalkorDB until ready.
 *  4. Register the MCP server in user-scope `sota.mcp.servers` settings.
 */
async function runEnableCodeGraph(
	controller: CodeGraphController,
	output: vscode.OutputChannel,
	context: vscode.ExtensionContext,
): Promise<void> {
	if (!(await controller.isDockerAvailable())) {
		const choice = await vscode.window.showErrorMessage(
			"Son of Anton's code graph backend uses Docker (FalkorDB + Qdrant). Docker isn't installed on this machine.",
			{
				modal: true,
				detail: "Install Docker Desktop, restart this window, then try Enable Code Graph again. An embedded mode that doesn't need Docker is planned for the next release — chat works fine without the code graph in the meantime.",
			},
			'Install Docker Desktop',
			'Open release notes',
		);
		if (choice === 'Install Docker Desktop') {
			void vscode.env.openExternal(vscode.Uri.parse('https://www.docker.com/products/docker-desktop/'));
		} else if (choice === 'Open release notes') {
			void vscode.env.openExternal(vscode.Uri.parse('https://github.com/CodeHalwell/Son-Of-Anton/blob/main/CHANGELOG.md'));
		}
		return;
	}

	const stack = controller.getStackRoot();
	if (!stack) {
		vscode.window.showErrorMessage('Could not locate services/code-graph/ in this workspace.');
		return;
	}

	// Ensure the MCP server is built before we register it. The build is
	// idempotent and cheap on subsequent runs because tsc only re-emits when
	// inputs change.
	output.show(true);
	const buildOk = await ensureMcpServerBuilt(stack, output);
	if (!buildOk) {
		vscode.window.showErrorMessage('Could not build the bundled code-graph MCP server. See output for details.');
		return;
	}

	await vscode.window.withProgress(
		{ location: vscode.ProgressLocation.Notification, title: 'Son of Anton — starting code graph' },
		async progress => {
			progress.report({ message: 'Bringing docker compose stack up...' });
			const result = await controller.start();
			if (!result.ok) {
				vscode.window.showErrorMessage(`Could not start code graph: ${result.reason}`);
				return;
			}
			progress.report({ message: 'Registering MCP server...' });
			await controller.registerMcpServer();
			await context.workspaceState.update('sota.codeGraph.autoStart', true);
			vscode.window.showInformationMessage('Son of Anton code graph is running.');
		},
	);
}

/**
 * Build the bundled MCP server (`services/code-graph/mcp-server/`) so the
 * compiled `dist/index.js` exists before `sota.mcp.servers` references it.
 * Uses `npm install` + `npm run build` in the mcp-server directory. Returns
 * true if the entry point exists after the build.
 */
async function ensureMcpServerBuilt(stackRoot: string, output: vscode.OutputChannel): Promise<boolean> {
	const path = await import('node:path');
	const fs = await import('node:fs');
	const mcpDir = path.join(stackRoot, 'mcp-server');
	const entry = path.join(mcpDir, 'dist', 'index.js');

	if (fs.existsSync(entry)) {
		return true;
	}

	const runStep = (cmd: string, args: string[]): Promise<boolean> => new Promise(resolve => {
		output.appendLine(`> ${cmd} ${args.join(' ')} (in ${mcpDir})`);
		const child = cp.spawn(cmd, args, { cwd: mcpDir, shell: false });
		child.stdout.setEncoding('utf8');
		child.stderr.setEncoding('utf8');
		child.stdout.on('data', d => output.append(d));
		child.stderr.on('data', d => output.append(d));
		child.on('error', err => {
			output.appendLine(`error: ${err.message}`);
			resolve(false);
		});
		child.on('close', code => resolve(code === 0));
	});

	if (!fs.existsSync(path.join(mcpDir, 'node_modules'))) {
		const ok = await runStep('npm', ['install', '--no-audit', '--no-fund']);
		if (!ok) {
			return false;
		}
	}
	const buildOk = await runStep('npm', ['run', 'build']);
	return buildOk && fs.existsSync(entry);
}

/**
 * Show the one-time "Enable code graph?" prompt on extension activation when
 * the workspace looks substantial (>=10 files in the top two levels). Stores
 * the result in globalState so subsequent installs / reloads stay quiet.
 */
async function maybePromptCodeGraphFirstRun(
	context: vscode.ExtensionContext,
	workspacePath: string,
): Promise<void> {
	const PROMPTED_KEY = 'sota.codeGraph.firstRunPrompted';
	if (context.globalState.get<boolean>(PROMPTED_KEY)) {
		return;
	}
	if (!workspacePath) {
		return;
	}
	const fileCount = await countTopLevelFiles(workspacePath);
	if (fileCount < 10) {
		return;
	}
	const choice = await vscode.window.showInformationMessage(
		"Enable Son of Anton's code graph for richer context? Requires Docker Desktop. " +
		"(An embedded mode that doesn't need Docker is planned for the next release.)",
		'Yes',
		'Not now',
		"Don't ask again",
	);
	if (choice === 'Yes') {
		await context.globalState.update(PROMPTED_KEY, true);
		void vscode.commands.executeCommand('sota.enableCodeGraph');
	} else if (choice === "Don't ask again") {
		await context.globalState.update(PROMPTED_KEY, true);
	}
	// "Not now" leaves the flag unset so we ask again next session.
}

/**
 * Count files visible in the top two levels of the workspace. We avoid a deep
 * scan to keep activation snappy; ten visible files is a coarse heuristic
 * that "this is more than a scratch folder."
 */
async function countTopLevelFiles(root: string): Promise<number> {
	try {
		const fs = await import('node:fs/promises');
		const path = await import('node:path');
		const stack: string[] = [root];
		let visited = 0;
		let count = 0;
		while (stack.length > 0 && visited < 2 && count < 10) {
			const dir = stack.shift() as string;
			visited++;
			const entries = await fs.readdir(dir, { withFileTypes: true });
			for (const entry of entries) {
				if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'out' || entry.name === 'dist') {
					continue;
				}
				if (entry.isFile()) {
					count++;
					if (count >= 10) {
						break;
					}
				} else if (entry.isDirectory() && stack.length === 0) {
					stack.push(path.join(dir, entry.name));
				}
			}
		}
		return count;
	} catch {
		return 0;
	}
}

/**
 * Translate the orchestrator's `Subtask.status` enum (used in `agents/types`)
 * to the board's `SubtaskState` (used in `TaskBoardModel`). Both vocabs
 * overlap but the board distinguishes `backlog` vs `ready` based on
 * dependency satisfaction, while the orchestrator collapses both into
 * `pending` until dispatch.
 */
/**
 * Drive the "Sign in to ChatGPT / Codex" / "Sign in to Claude" UX. The
 * underlying providers don't have public OAuth client registration today
 * so the realistic path is: install the official subscription CLI
 * (`codex` for OpenAI, `claude` for Anthropic), run its own `login`
 * subcommand, and let Son of Anton spawn the binary at chat-turn time
 * with the API key stripped from env so the CLI's stored tokens get
 * used.
 *
 * Renders a quick-pick whose contents depend on whether the relevant
 * CLI is detected on PATH:
 *
 *   - CLI installed → primary action opens an integrated terminal and
 *     types `<cli> login` so the user can complete OAuth in their
 *     browser.
 *   - CLI not installed → primary action opens the install docs in
 *     the system browser.
 *
 * In both cases an "advanced" option is offered to configure a
 * `sotaAuth.<provider>.clientId` setting, in case the user is an
 * approved OAuth partner with their own client id.
 */
async function runSubscriptionSignIn(opts: {
	providerLabel: string;
	cliBinary: string;
	cliInstallUrl: string;
	cliInstalled: boolean;
	oauthProviderId: string;
	oauthClientIdSetting: string;
	apiKeySetting: string;
}): Promise<void> {
	interface PickItem extends vscode.QuickPickItem {
		readonly action: 'cli-login' | 'install-cli' | 'configure-oauth' | 'use-api-key';
	}

	const items: PickItem[] = [];
	if (opts.cliInstalled) {
		items.push({
			label: `$(terminal) Sign in via ${opts.cliBinary} CLI`,
			description: `Run \`${opts.cliBinary} login\` — works with your subscription`,
			detail: `Opens an integrated terminal so you can complete OAuth in your browser. Recommended for ${opts.providerLabel} subscribers.`,
			action: 'cli-login',
		});
	} else {
		items.push({
			label: `$(cloud-download) Install ${opts.cliBinary} CLI`,
			description: opts.cliInstallUrl,
			detail: `You need the ${opts.cliBinary} CLI to sign in with a subscription. Opens the install docs in your browser.`,
			action: 'install-cli',
		});
	}

	items.push({
		label: '$(key) Use an API key instead',
		description: `Set ${opts.apiKeySetting}`,
		detail: 'Routes through the metered API. Faster to set up, but uses pay-as-you-go billing rather than your subscription.',
		action: 'use-api-key',
	});

	items.push({
		label: '$(gear) Configure OAuth client ID (advanced)',
		description: `Set ${opts.oauthClientIdSetting}`,
		detail: 'For approved OAuth partners only. Most users should pick the CLI option above — public OAuth is not currently available for third-party tools.',
		action: 'configure-oauth',
	});

	const choice = await vscode.window.showQuickPick(items, {
		placeHolder: `Sign in to ${opts.providerLabel}`,
		title: `Son of Anton — ${opts.providerLabel} sign-in`,
	});
	if (!choice) {
		return;
	}

	if (choice.action === 'cli-login') {
		const existing = vscode.window.terminals.find(t => t.name === `${opts.cliBinary} login`);
		const terminal = existing ?? vscode.window.createTerminal({ name: `${opts.cliBinary} login` });
		terminal.show();
		terminal.sendText(`${opts.cliBinary} login`);
		// Best-effort hint so the user knows what to do next.
		vscode.window.showInformationMessage(
			`Running \`${opts.cliBinary} login\` in the terminal. Complete sign-in in your browser, then come back and pick a ${opts.providerLabel} model in the chat composer.`,
		);
		return;
	}
	if (choice.action === 'install-cli') {
		await vscode.env.openExternal(vscode.Uri.parse(opts.cliInstallUrl));
		return;
	}
	if (choice.action === 'use-api-key') {
		await vscode.commands.executeCommand('workbench.action.openSettings', opts.apiKeySetting);
		return;
	}
	if (choice.action === 'configure-oauth') {
		await vscode.commands.executeCommand('workbench.action.openSettings', opts.oauthClientIdSetting);
		// Try the connect flow afterwards in case the user has just
		// pasted a clientId — the broker will surface its own error if
		// nothing's configured yet.
		await vscode.commands.executeCommand('sotaAuth.connect', opts.oauthProviderId);
		return;
	}
}

function subtaskStatusToBoardState(status: 'pending' | 'in_progress' | 'completed' | 'failed'): SubtaskState {
	switch (status) {
		case 'in_progress': return 'in-progress';
		case 'completed': return 'done';
		case 'failed': return 'failed';
		case 'pending':
		default:
			// `backlog` is the safe default; `recomputeStates` promotes to
			// `ready` immediately if dependencies are satisfied.
			return 'backlog';
	}
}

/**
 * Fold a single `AgentEvent` into the board model. Only the structured
 * plan / subtask events advance state; token streams and the final
 * aggregate are ignored here (the chat surface owns that rendering).
 *
 * The function mutates the model exclusively through `setPlan` and
 * `updateTask`, keeping all derived state (ready promotion, dependency
 * recompute) on the model side.
 */
function applyAgentEventToBoard(model: TaskBoardModel, conversationId: string, event: AgentEvent): void {
	switch (event.type) {
		case 'plan-proposed': {
			const plan: AgentPlan = event.plan;
			// Plans are emitted from the orchestrator with positional ids
			// that match `parsePlan`'s `${planId}-subtask-${i}` scheme. We
			// reconstruct the same id sequence here so a later subtask
			// event keyed on `subtaskId` finds its tile.
			const tasks: BoardTask[] = plan.subtasks.map((subtask, index) => ({
				id: `board-${conversationId}-${index}`,
				instruction: subtask.instruction,
				assignee: subtask.assignee,
				scopeFiles: subtask.scopeFiles,
				dependencies: subtask.dependencies,
				state: 'backlog',
			}));
			// Re-key tasks to use the orchestrator's actual subtask ids if we
			// can recover them — the AgentPlan shape doesn't carry them today,
			// so we generate stable per-conversation ids and map by index.
			// `subtask-started` events carry the orchestrator's id; we patch
			// it onto the board tile in the started branch below.
			model.setPlan(conversationId, tasks);
			return;
		}
		case 'subtask-ready': {
			// The orchestrator computes ready state itself; the board's
			// `recomputeStates` agrees with that calculation. This event is
			// purely informational here — we still call updateTask to
			// trigger a redraw.
			updateBoardForSubtask(model, conversationId, event.subtaskId, event.assignee, { state: 'ready' });
			return;
		}
		case 'subtask-started': {
			updateBoardForSubtask(model, conversationId, event.subtaskId, event.assignee, {
				state: 'in-progress',
				startedAt: Date.now(),
			});
			return;
		}
		case 'subtask-completed': {
			updateBoardForSubtask(model, conversationId, event.subtaskId, event.assignee, {
				state: 'done',
				summary: event.summary,
				finishedAt: Date.now(),
			});
			return;
		}
		case 'subtask-failed': {
			updateBoardForSubtask(model, conversationId, event.subtaskId, event.assignee, {
				state: 'failed',
				summary: event.error,
				finishedAt: Date.now(),
			});
			return;
		}
		case 'subtask-blocked': {
			updateBoardForSubtask(model, conversationId, event.subtaskId, event.assignee, {
				state: 'failed',
				summary: event.reason,
				finishedAt: Date.now(),
			});
			return;
		}
		case 'subtask-reassigned': {
			model.reassign(conversationId, event.subtaskId, event.to);
			return;
		}
		// Token, plan-proposed already handled, final/error are chat-only.
		default:
			return;
	}
}

/**
 * Shim that bridges the orchestrator's subtask ids onto the board's
 * positional ids. The board mints synthetic ids in `plan-proposed`; once
 * the first event for an orchestrator subtask arrives, we look up the
 * tile by index (orchestrator subtask ids end with `-subtask-<n>`). If
 * lookup fails (e.g. the assignee chip is unknown), we fall back to a
 * simple id match — the board still renders, just without persona
 * styling.
 */
function updateBoardForSubtask(
	model: TaskBoardModel,
	conversationId: string,
	subtaskId: string,
	assignee: string,
	patch: Partial<BoardTask>,
): void {
	const snapshot = model.getSnapshot(conversationId);
	if (!snapshot) {
		return;
	}
	// Try direct id match first (cheapest path).
	let target = snapshot.tasks.find(t => t.id === subtaskId);
	// Then positional match: orchestrator ids look like `plan-1-subtask-3`.
	if (!target) {
		const match = subtaskId.match(/-subtask-(\d+)$/);
		if (match) {
			const idx = Number(match[1]);
			target = snapshot.tasks[idx];
		}
	}
	if (!target) {
		return;
	}
	model.updateTask(conversationId, target.id, { ...patch, assignee });
}
