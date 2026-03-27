/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CopilotClient, CopilotSession, type SessionEvent, type SessionEventPayload } from '@github/copilot-sdk';
import { rgPath } from '@vscode/ripgrep';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { FileAccess } from '../../../../base/common/network.js';
import type { IAuthorizationProtectedResourceMetadata } from '../../../../base/common/oauth.js';
import { delimiter, dirname } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../files/common/files.js';
import { ILogService } from '../../../log/common/log.js';
import { localize } from '../../../../nls.js';
import { AgentSession, IAgent, IAgentAttachment, IAgentCreateSessionConfig, IAgentDescriptor, IAgentMessageEvent, IAgentModelInfo, IAgentProgressEvent, IAgentSessionMetadata, IAgentToolCompleteEvent, IAgentToolStartEvent } from '../../common/agentService.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { ToolResultContentType, type IPendingMessage, type IToolResultContent, type PolicyState } from '../../common/state/sessionState.js';
import { CopilotSessionWrapper } from './copilotSessionWrapper.js';
import { getEditFilePath, getInvocationMessage, getPastTenseMessage, getShellLanguage, getToolDisplayName, getToolInputString, getToolKind, isEditTool, isHiddenTool } from './copilotToolDisplay.js';
import { FileEditTracker } from './fileEditTracker.js';

function tryStringify(value: unknown): string | undefined {
	try {
		return JSON.stringify(value);
	} catch {
		return undefined;
	}
}

/**
 * Agent provider backed by the Copilot SDK {@link CopilotClient}.
 */
export class CopilotAgent extends Disposable implements IAgent {
	readonly id = 'copilot' as const;

	private readonly _onDidSessionProgress = this._register(new Emitter<IAgentProgressEvent>());
	readonly onDidSessionProgress = this._onDidSessionProgress.event;

	private _client: CopilotClient | undefined;
	private _clientStarting: Promise<CopilotClient> | undefined;
	private _githubToken: string | undefined;
	private readonly _sessions = this._register(new DisposableMap<string, CopilotSessionWrapper>());
	/** Tracks active tool invocations so we can produce past-tense messages on completion. Keyed by `sessionId:toolCallId`. */
	private readonly _activeToolCalls = new Map<string, { toolName: string; displayName: string; parameters: Record<string, unknown> | undefined }>();
	/** Pending permission requests awaiting a renderer-side decision. Keyed by requestId. */
	private readonly _pendingPermissions = new Map<string, { sessionId: string; deferred: DeferredPromise<boolean> }>();
	/** Working directory per session, used when resuming. */
	private readonly _sessionWorkingDirs = new Map<string, string>();
	/** File edit trackers per session, keyed by raw session ID. */
	private readonly _editTrackers = new Map<string, FileEditTracker>();

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IFileService private readonly _fileService: IFileService,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
	) {
		super();
	}

	// ---- auth ---------------------------------------------------------------

	getDescriptor(): IAgentDescriptor {
		return {
			provider: 'copilot',
			displayName: 'Agent Host - Copilot',
			description: 'Copilot SDK agent running in a dedicated process',
			requiresAuth: true,
		};
	}

	getProtectedResources(): IAuthorizationProtectedResourceMetadata[] {
		return [{
			resource: 'https://api.github.com',
			resource_name: 'GitHub Copilot',
			authorization_servers: ['https://github.com/login/oauth'],
			scopes_supported: ['read:user', 'user:email'],
		}];
	}

	async authenticate(resource: string, token: string): Promise<boolean> {
		if (resource !== 'https://api.github.com') {
			return false;
		}
		const tokenChanged = this._githubToken !== token;
		this._githubToken = token;
		this._logService.info(`[Copilot] Auth token ${tokenChanged ? 'updated' : 'unchanged'}`);
		if (tokenChanged && this._client && this._sessions.size === 0) {
			this._logService.info('[Copilot] Restarting CopilotClient with new token');
			const client = this._client;
			this._client = undefined;
			this._clientStarting = undefined;
			await client.stop();
		}
		return true;
	}

	// ---- client lifecycle ---------------------------------------------------

	private async _ensureClient(): Promise<CopilotClient> {
		if (this._client) {
			return this._client;
		}
		if (this._clientStarting) {
			return this._clientStarting;
		}
		this._clientStarting = (async () => {
			this._logService.info(`[Copilot] Starting CopilotClient... ${this._githubToken ? '(with token)' : '(no token)'}`);

			// Build a clean env for the CLI subprocess, stripping Electron/VS Code vars
			// that can interfere with the Node.js process the SDK spawns.
			const env: Record<string, string | undefined> = Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1' });
			delete env['NODE_OPTIONS'];
			delete env['VSCODE_INSPECTOR_OPTIONS'];
			delete env['VSCODE_ESM_ENTRYPOINT'];
			delete env['VSCODE_HANDLES_UNCAUGHT_ERRORS'];
			for (const key of Object.keys(env)) {
				if (key === 'ELECTRON_RUN_AS_NODE') {
					continue;
				}
				if (key.startsWith('VSCODE_') || key.startsWith('ELECTRON_')) {
					delete env[key];
				}
			}
			env['COPILOT_CLI_RUN_AS_NODE'] = '1';
			env['USE_BUILTIN_RIPGREP'] = '0';

			// Resolve the CLI entry point from node_modules. We can't use require.resolve()
			// because @github/copilot's exports map blocks direct subpath access.
			// FileAccess.asFileUri('') points to the `out/` directory; node_modules is one level up.
			const cliPath = URI.joinPath(FileAccess.asFileUri(''), '..', 'node_modules', '@github', 'copilot', 'index.js').fsPath;

			// Add VS Code's built-in ripgrep to PATH so the CLI subprocess can find it.
			// If @vscode/ripgrep is in an .asar file, the binary is unpacked.
			const rgDiskPath = rgPath.replace(/\bnode_modules\.asar\b/, 'node_modules.asar.unpacked');
			const rgDir = dirname(rgDiskPath);
			// On Windows the env key is typically "Path" (not "PATH"). Since we copied
			// process.env into a plain (case-sensitive) object, we must find the actual key.
			const pathKey = Object.keys(env).find(k => k.toUpperCase() === 'PATH') ?? 'PATH';
			const currentPath = env[pathKey];
			env[pathKey] = currentPath ? `${currentPath}${delimiter}${rgDir}` : rgDir;
			this._logService.info(`[Copilot] Resolved CLI path: ${cliPath}`);

			const client = new CopilotClient({
				githubToken: this._githubToken,
				useLoggedInUser: !this._githubToken,
				useStdio: true,
				autoStart: true,
				env,
				cliPath,
			});
			await client.start();
			this._logService.info('[Copilot] CopilotClient started successfully');
			this._client = client;
			this._clientStarting = undefined;
			return client;
		})();
		return this._clientStarting;
	}

	// ---- session management -------------------------------------------------

	async listSessions(): Promise<IAgentSessionMetadata[]> {
		this._logService.info('[Copilot] Listing sessions...');
		const client = await this._ensureClient();
		const sessions = await client.listSessions();
		const result: IAgentSessionMetadata[] = sessions.map(s => ({
			session: AgentSession.uri(this.id, s.sessionId),
			startTime: s.startTime.getTime(),
			modifiedTime: s.modifiedTime.getTime(),
			summary: s.summary,
			workingDirectory: typeof s.context?.cwd === 'string' ? s.context.cwd : undefined,
		}));
		this._logService.info(`[Copilot] Found ${result.length} sessions`);
		return result;
	}

	async listModels(): Promise<IAgentModelInfo[]> {
		this._logService.info('[Copilot] Listing models...');
		const client = await this._ensureClient();
		const models = await client.listModels();
		const result = models.map(m => ({
			provider: this.id,
			id: m.id,
			name: m.name,
			maxContextWindow: m.capabilities.limits.max_context_window_tokens,
			supportsVision: m.capabilities.supports.vision,
			supportsReasoningEffort: m.capabilities.supports.reasoningEffort,
			supportedReasoningEfforts: m.supportedReasoningEfforts,
			defaultReasoningEffort: m.defaultReasoningEffort,
			policyState: m.policy?.state as PolicyState | undefined,
			billingMultiplier: m.billing?.multiplier,
		}));
		this._logService.info(`[Copilot] Found ${result.length} models`);
		return result;
	}

	async createSession(config?: IAgentCreateSessionConfig): Promise<URI> {
		this._logService.info(`[Copilot] Creating session... ${config?.model ? `model=${config.model}` : ''}`);
		const client = await this._ensureClient();
		const raw = await client.createSession({
			model: config?.model,
			sessionId: config?.session ? AgentSession.id(config.session) : undefined,
			streaming: true,
			workingDirectory: config?.workingDirectory,
			onPermissionRequest: (request, invocation) => this._handlePermissionRequest(request, invocation),
			hooks: this._createSessionHooks(),
		});

		const wrapper = this._trackSession(raw);
		const session = AgentSession.uri(this.id, wrapper.sessionId);
		if (config?.workingDirectory) {
			this._sessionWorkingDirs.set(wrapper.sessionId, config.workingDirectory);
		}
		this._logService.info(`[Copilot] Session created: ${session.toString()}`);
		return session;
	}

	async sendMessage(session: URI, prompt: string, attachments?: IAgentAttachment[]): Promise<void> {
		const sessionId = AgentSession.id(session);
		this._logService.info(`[Copilot:${sessionId}] sendMessage called: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}" (${attachments?.length ?? 0} attachments)`);
		const entry = this._sessions.get(sessionId) ?? await this._resumeSession(sessionId);
		this._logService.info(`[Copilot:${sessionId}] Found session wrapper, calling session.send()...`);

		const sdkAttachments = attachments?.map(a => {
			if (a.type === 'selection') {
				return { type: 'selection' as const, filePath: a.path, displayName: a.displayName ?? a.path, text: a.text, selection: a.selection };
			}
			return { type: a.type, path: a.path, displayName: a.displayName };
		});
		if (sdkAttachments?.length) {
			this._logService.trace(`[Copilot:${sessionId}] Attachments: ${JSON.stringify(sdkAttachments.map(a => ({ type: a.type, path: a.type === 'selection' ? a.filePath : a.path })))}`);
		}

		await entry.session.send({ prompt, attachments: sdkAttachments });
		this._logService.info(`[Copilot:${sessionId}] session.send() returned`);
	}

	setPendingMessages(session: URI, steeringMessage: IPendingMessage | undefined, queuedMessages: readonly IPendingMessage[]): void {
		const sessionId = AgentSession.id(session);
		const entry = this._sessions.get(sessionId);
		if (!entry) {
			this._logService.warn(`[Copilot:${sessionId}] setPendingMessages: session not found`);
			return;
		}

		// Steering: send with mode 'immediate' so the SDK injects it mid-turn
		if (steeringMessage) {
			this._logService.info(`[Copilot:${sessionId}] Sending steering message: "${steeringMessage.userMessage.text.substring(0, 100)}"`);
			entry.session.send({
				prompt: steeringMessage.userMessage.text,
				mode: 'immediate',
			}).catch(err => {
				this._logService.error(`[Copilot:${sessionId}] Steering message failed`, err);
			});
		}

		// Queued messages are consumed by the server (AgentSideEffects)
		// which dispatches SessionTurnStarted and calls sendMessage directly.
		// No SDK-level enqueue is needed.
	}

	async getSessionMessages(session: URI): Promise<(IAgentMessageEvent | IAgentToolStartEvent | IAgentToolCompleteEvent)[]> {
		const sessionId = AgentSession.id(session);
		const entry = this._sessions.get(sessionId) ?? await this._resumeSession(sessionId).catch(() => undefined);
		if (!entry) {
			return [];
		}

		const events = await entry.session.getMessages();
		return this._mapSessionEvents(session, events);
	}

	async disposeSession(session: URI): Promise<void> {
		const sessionId = AgentSession.id(session);
		this._sessions.deleteAndDispose(sessionId);
		this._clearToolCallsForSession(sessionId);
		this._sessionWorkingDirs.delete(sessionId);
		this._denyPendingPermissionsForSession(sessionId);
	}

	async abortSession(session: URI): Promise<void> {
		const sessionId = AgentSession.id(session);
		const entry = this._sessions.get(sessionId);
		if (entry) {
			this._logService.info(`[Copilot:${sessionId}] Aborting session...`);
			this._denyPendingPermissionsForSession(sessionId);
			await entry.session.abort();
		}
	}

	async changeModel(session: URI, model: string): Promise<void> {
		const sessionId = AgentSession.id(session);
		const entry = this._sessions.get(sessionId);
		if (entry) {
			this._logService.info(`[Copilot:${sessionId}] Changing model to: ${model}`);
			await entry.session.setModel(model);
		}
	}

	async shutdown(): Promise<void> {
		this._logService.info('[Copilot] Shutting down...');
		this._sessions.clearAndDisposeAll();
		this._activeToolCalls.clear();
		this._sessionWorkingDirs.clear();
		this._denyPendingPermissions();
		await this._client?.stop();
		this._client = undefined;
	}

	respondToPermissionRequest(requestId: string, approved: boolean): void {
		const entry = this._pendingPermissions.get(requestId);
		if (entry) {
			this._pendingPermissions.delete(requestId);
			entry.deferred.complete(approved);
		}
	}

	/**
	 * Returns true if this provider owns the given session ID.
	 */
	hasSession(session: URI): boolean {
		return this._sessions.has(AgentSession.id(session));
	}

	// ---- helpers ------------------------------------------------------------

	/**
	 * Handles a permission request from the SDK by firing a `tool_ready` event
	 * (which transitions the tool to PendingConfirmation) and waiting for the
	 * side-effects layer to respond via respondToPermissionRequest.
	 */
	private async _handlePermissionRequest(
		request: { kind: string; toolCallId?: string;[key: string]: unknown },
		invocation: { sessionId: string },
	): Promise<{ kind: 'approved' | 'denied-interactively-by-user' }> {
		const session = AgentSession.uri(this.id, invocation.sessionId);

		this._logService.info(`[Copilot:${invocation.sessionId}] Permission request: kind=${request.kind}`);

		// Auto-approve reads inside the working directory
		if (request.kind === 'read') {
			const requestPath = typeof request.path === 'string' ? request.path : undefined;
			const workingDir = this._sessionWorkingDirs.get(invocation.sessionId);
			if (requestPath && workingDir && requestPath.startsWith(workingDir)) {
				this._logService.trace(`[Copilot:${invocation.sessionId}] Auto-approving read inside working directory: ${requestPath}`);
				return { kind: 'approved' };
			}
		}

		const toolCallId = request.toolCallId;
		if (!toolCallId) {
			// TODO: handle permission requests without a toolCallId by creating a synthetic tool call
			this._logService.warn(`[Copilot:${invocation.sessionId}] Permission request without toolCallId, auto-denying: kind=${request.kind}`);
			return { kind: 'denied-interactively-by-user' };
		}

		this._logService.info(`[Copilot:${invocation.sessionId}] Requesting confirmation for tool call: ${toolCallId}`);

		const deferred = new DeferredPromise<boolean>();
		this._pendingPermissions.set(toolCallId, { sessionId: invocation.sessionId, deferred });

		// Derive display information from the permission request kind
		const { confirmationTitle, invocationMessage, toolInput } = this._getPermissionDisplay(request);

		// Fire a tool_ready event to transition the tool to PendingConfirmation
		this._onDidSessionProgress.fire({
			session,
			type: 'tool_ready',
			toolCallId,
			invocationMessage,
			toolInput,
			confirmationTitle,
		});

		const approved = await deferred.p;
		this._logService.info(`[Copilot:${invocation.sessionId}] Permission response: toolCallId=${toolCallId}, approved=${approved}`);
		return { kind: approved ? 'approved' : 'denied-interactively-by-user' };
	}

	/**
	 * Derives display fields from a permission request for the tool confirmation UI.
	 */
	private _getPermissionDisplay(request: { kind: string;[key: string]: unknown }): {
		confirmationTitle: string;
		invocationMessage: string;
		toolInput?: string;
	} {
		const path = typeof request.path === 'string' ? request.path : (typeof request.fileName === 'string' ? request.fileName : undefined);
		const fullCommandText = typeof request.fullCommandText === 'string' ? request.fullCommandText : undefined;
		const intention = typeof request.intention === 'string' ? request.intention : undefined;
		const serverName = typeof request.serverName === 'string' ? request.serverName : undefined;
		const toolName = typeof request.toolName === 'string' ? request.toolName : undefined;

		switch (request.kind) {
			case 'shell':
				return {
					confirmationTitle: localize('copilot.permission.shell.title', "Run in terminal"),
					invocationMessage: intention ?? localize('copilot.permission.shell.message', "Run command"),
					toolInput: fullCommandText,
				};
			case 'write':
				return {
					confirmationTitle: localize('copilot.permission.write.title', "Write file"),
					invocationMessage: path ? localize('copilot.permission.write.message', "Edit {0}", path) : localize('copilot.permission.write.messageGeneric', "Edit file"),
					toolInput: tryStringify(path ? { path } : request) ?? undefined,
				};
			case 'mcp': {
				const title = toolName ?? localize('copilot.permission.mcp.defaultTool', "MCP Tool");
				return {
					confirmationTitle: serverName ? `${serverName}: ${title}` : title,
					invocationMessage: serverName ? `${serverName}: ${title}` : title,
					toolInput: tryStringify({ serverName, toolName }) ?? undefined,
				};
			}
			case 'read':
				return {
					confirmationTitle: localize('copilot.permission.read.title', "Read file"),
					invocationMessage: intention ?? localize('copilot.permission.read.message', "Read file"),
					toolInput: tryStringify(path ? { path, intention } : request) ?? undefined,
				};
			default:
				return {
					confirmationTitle: localize('copilot.permission.default.title', "Permission request"),
					invocationMessage: localize('copilot.permission.default.message', "Permission request"),
					toolInput: tryStringify(request) ?? undefined,
				};
		}
	}

	private _clearToolCallsForSession(sessionId: string): void {
		const prefix = `${sessionId}:`;
		for (const key of this._activeToolCalls.keys()) {
			if (key.startsWith(prefix)) {
				this._activeToolCalls.delete(key);
			}
		}
	}

	private _getOrCreateEditTracker(rawSessionId: string): FileEditTracker {
		let tracker = this._editTrackers.get(rawSessionId);
		if (!tracker) {
			tracker = new FileEditTracker(rawSessionId, this._sessionDataService, this._fileService, this._logService);
			this._editTrackers.set(rawSessionId, tracker);
		}
		return tracker;
	}

	/**
	 * Creates SDK session hooks for pre/post tool use. The `onPreToolUse`
	 * hook snapshots files before edit tools run. The `onPostToolUse` hook
	 * snapshots the after-content so that it's ready synchronously when
	 * `onToolComplete` fires.
	 */
	private _createSessionHooks() {
		return {
			onPreToolUse: async (input: { toolName: string; toolArgs: unknown }, invocation: { sessionId: string }) => {
				if (isEditTool(input.toolName)) {
					const filePath = getEditFilePath(input.toolArgs);
					if (filePath) {
						const tracker = this._getOrCreateEditTracker(invocation.sessionId);
						await tracker.trackEditStart(filePath);
					}
				}
			},
			onPostToolUse: async (input: { toolName: string; toolArgs: unknown }, invocation: { sessionId: string }) => {
				if (isEditTool(input.toolName)) {
					const filePath = getEditFilePath(input.toolArgs);
					if (filePath) {
						const tracker = this._editTrackers.get(invocation.sessionId);
						await tracker?.completeEdit(filePath);
					}
				}
			},
		};
	}

	private _trackSession(raw: CopilotSession, sessionIdOverride?: string): CopilotSessionWrapper {
		const wrapper = new CopilotSessionWrapper(raw);
		const rawId = sessionIdOverride ?? wrapper.sessionId;
		const session = AgentSession.uri(this.id, rawId);

		wrapper.onMessageDelta(e => {
			this._logService.trace(`[Copilot:${rawId}] delta: ${e.data.deltaContent}`);
			this._onDidSessionProgress.fire({
				session,
				type: 'delta',
				messageId: e.data.messageId,
				content: e.data.deltaContent,
				parentToolCallId: e.data.parentToolCallId,
			});
		});

		wrapper.onMessage(e => {
			this._logService.info(`[Copilot:${rawId}] Full message received: ${e.data.content.length} chars`);
			this._onDidSessionProgress.fire({
				session,
				type: 'message',
				role: 'assistant',
				messageId: e.data.messageId,
				content: e.data.content,
				toolRequests: e.data.toolRequests?.map(tr => ({
					toolCallId: tr.toolCallId,
					name: tr.name,
					arguments: tr.arguments !== undefined ? tryStringify(tr.arguments) : undefined,
					type: tr.type,
				})),
				reasoningOpaque: e.data.reasoningOpaque,
				reasoningText: e.data.reasoningText,
				encryptedContent: e.data.encryptedContent,
				parentToolCallId: e.data.parentToolCallId,
			});
		});

		wrapper.onToolStart(e => {
			if (isHiddenTool(e.data.toolName)) {
				this._logService.trace(`[Copilot:${rawId}] Tool started (hidden): ${e.data.toolName}`);
				return;
			}
			this._logService.info(`[Copilot:${rawId}] Tool started: ${e.data.toolName}`);
			const toolArgs = e.data.arguments !== undefined ? tryStringify(e.data.arguments) : undefined;
			let parameters: Record<string, unknown> | undefined;
			if (toolArgs) {
				try { parameters = JSON.parse(toolArgs) as Record<string, unknown>; } catch { /* ignore */ }
			}
			const displayName = getToolDisplayName(e.data.toolName);
			const trackingKey = `${rawId}:${e.data.toolCallId}`;
			this._activeToolCalls.set(trackingKey, { toolName: e.data.toolName, displayName, parameters });
			const toolKind = getToolKind(e.data.toolName);

			this._onDidSessionProgress.fire({
				session,
				type: 'tool_start',
				toolCallId: e.data.toolCallId,
				toolName: e.data.toolName,
				displayName,
				invocationMessage: getInvocationMessage(e.data.toolName, displayName, parameters),
				toolInput: getToolInputString(e.data.toolName, parameters, toolArgs),
				toolKind,
				language: toolKind === 'terminal' ? getShellLanguage(e.data.toolName) : undefined,
				toolArguments: toolArgs,
				mcpServerName: e.data.mcpServerName,
				mcpToolName: e.data.mcpToolName,
				parentToolCallId: e.data.parentToolCallId,
			});
		});

		wrapper.onToolComplete(e => {
			const trackingKey = `${rawId}:${e.data.toolCallId}`;
			const tracked = this._activeToolCalls.get(trackingKey);
			if (!tracked) {
				return;
			}
			this._logService.info(`[Copilot:${rawId}] Tool completed: ${e.data.toolCallId}`);
			this._activeToolCalls.delete(trackingKey);
			const displayName = tracked.displayName;
			const toolOutput = e.data.error?.message ?? e.data.result?.content;

			const content: IToolResultContent[] = [];
			if (toolOutput !== undefined) {
				content.push({ type: ToolResultContentType.Text, text: toolOutput });
			}

			// File edit data was already prepared by the onPostToolUse hook
			const tracker = this._editTrackers.get(rawId);
			const filePath = isEditTool(tracked.toolName) ? getEditFilePath(tracked.parameters) : undefined;
			if (tracker && filePath) {
				const fileEdit = tracker.takeCompletedEdit(filePath);
				if (fileEdit) {
					content.push(fileEdit);
				}
			}

			this._onDidSessionProgress.fire({
				session,
				type: 'tool_complete',
				toolCallId: e.data.toolCallId,
				result: {
					success: e.data.success,
					pastTenseMessage: getPastTenseMessage(tracked.toolName, displayName, tracked.parameters, e.data.success),
					content: content.length > 0 ? content : undefined,
					error: e.data.error,
				},
				isUserRequested: e.data.isUserRequested,
				toolTelemetry: e.data.toolTelemetry !== undefined ? tryStringify(e.data.toolTelemetry) : undefined,
				parentToolCallId: e.data.parentToolCallId,
			});
		});

		wrapper.onIdle(() => {
			this._logService.info(`[Copilot:${rawId}] Session idle`);
			this._onDidSessionProgress.fire({ session, type: 'idle' });
		});

		wrapper.onSessionError(e => {
			this._logService.error(`[Copilot:${rawId}] Session error: ${e.data.errorType} - ${e.data.message}`);
			this._onDidSessionProgress.fire({
				session,
				type: 'error',
				errorType: e.data.errorType,
				message: e.data.message,
				stack: e.data.stack,
			});
		});

		wrapper.onUsage(e => {
			this._logService.trace(`[Copilot:${rawId}] Usage: model=${e.data.model}, in=${e.data.inputTokens ?? '?'}, out=${e.data.outputTokens ?? '?'}, cacheRead=${e.data.cacheReadTokens ?? '?'}`);
			this._onDidSessionProgress.fire({
				session,
				type: 'usage',
				inputTokens: e.data.inputTokens,
				outputTokens: e.data.outputTokens,
				model: e.data.model,
				cacheReadTokens: e.data.cacheReadTokens,
			});
		});

		wrapper.onReasoningDelta(e => {
			this._logService.trace(`[Copilot:${rawId}] Reasoning delta: ${e.data.deltaContent.length} chars`);
			this._onDidSessionProgress.fire({
				session,
				type: 'reasoning',
				content: e.data.deltaContent,
			});
		});

		this._subscribeForLogging(wrapper, rawId);

		this._sessions.set(rawId, wrapper);
		return wrapper;
	}

	private _subscribeForLogging(wrapper: CopilotSessionWrapper, sessionId: string): void {
		wrapper.onSessionStart(e => {
			this._logService.trace(`[Copilot:${sessionId}] Session started: model=${e.data.selectedModel ?? 'default'}, producer=${e.data.producer}`);
		});

		wrapper.onSessionResume(e => {
			this._logService.trace(`[Copilot:${sessionId}] Session resumed: eventCount=${e.data.eventCount}`);
		});

		wrapper.onSessionInfo(e => {
			this._logService.trace(`[Copilot:${sessionId}] Session info [${e.data.infoType}]: ${e.data.message}`);
		});

		wrapper.onSessionModelChange(e => {
			this._logService.trace(`[Copilot:${sessionId}] Model changed: ${e.data.previousModel ?? '(none)'} -> ${e.data.newModel}`);
		});

		wrapper.onSessionHandoff(e => {
			this._logService.trace(`[Copilot:${sessionId}] Session handoff: sourceType=${e.data.sourceType}, remoteSessionId=${e.data.remoteSessionId ?? '(none)'}`);
		});

		wrapper.onSessionTruncation(e => {
			this._logService.trace(`[Copilot:${sessionId}] Session truncation: removed ${e.data.tokensRemovedDuringTruncation} tokens, ${e.data.messagesRemovedDuringTruncation} messages`);
		});

		wrapper.onSessionSnapshotRewind(e => {
			this._logService.trace(`[Copilot:${sessionId}] Snapshot rewind: upTo=${e.data.upToEventId}, eventsRemoved=${e.data.eventsRemoved}`);
		});

		wrapper.onSessionShutdown(e => {
			this._logService.trace(`[Copilot:${sessionId}] Session shutdown: type=${e.data.shutdownType}, premiumRequests=${e.data.totalPremiumRequests}, apiDuration=${e.data.totalApiDurationMs}ms`);
		});

		wrapper.onSessionUsageInfo(e => {
			this._logService.trace(`[Copilot:${sessionId}] Usage info: ${e.data.currentTokens}/${e.data.tokenLimit} tokens, ${e.data.messagesLength} messages`);
		});

		wrapper.onSessionCompactionStart(() => {
			this._logService.trace(`[Copilot:${sessionId}] Compaction started`);
		});

		wrapper.onSessionCompactionComplete(e => {
			this._logService.trace(`[Copilot:${sessionId}] Compaction complete: success=${e.data.success}, tokensRemoved=${e.data.tokensRemoved ?? '?'}`);
		});

		wrapper.onUserMessage(e => {
			this._logService.trace(`[Copilot:${sessionId}] User message: ${e.data.content.length} chars, ${e.data.attachments?.length ?? 0} attachments`);
		});

		wrapper.onPendingMessagesModified(() => {
			this._logService.trace(`[Copilot:${sessionId}] Pending messages modified`);
		});

		wrapper.onTurnStart(e => {
			this._logService.trace(`[Copilot:${sessionId}] Turn started: ${e.data.turnId}`);
		});

		wrapper.onIntent(e => {
			this._logService.trace(`[Copilot:${sessionId}] Intent: ${e.data.intent}`);
		});

		wrapper.onReasoning(e => {
			this._logService.trace(`[Copilot:${sessionId}] Reasoning: ${e.data.content.length} chars`);
		});

		wrapper.onTurnEnd(e => {
			this._logService.trace(`[Copilot:${sessionId}] Turn ended: ${e.data.turnId}`);
		});

		wrapper.onAbort(e => {
			this._logService.trace(`[Copilot:${sessionId}] Aborted: ${e.data.reason}`);
		});

		wrapper.onToolUserRequested(e => {
			this._logService.trace(`[Copilot:${sessionId}] Tool user-requested: ${e.data.toolName} (${e.data.toolCallId})`);
		});

		wrapper.onToolPartialResult(e => {
			this._logService.trace(`[Copilot:${sessionId}] Tool partial result: ${e.data.toolCallId} (${e.data.partialOutput.length} chars)`);
		});

		wrapper.onToolProgress(e => {
			this._logService.trace(`[Copilot:${sessionId}] Tool progress: ${e.data.toolCallId} - ${e.data.progressMessage}`);
		});

		wrapper.onSkillInvoked(e => {
			this._logService.trace(`[Copilot:${sessionId}] Skill invoked: ${e.data.name} (${e.data.path})`);
		});

		wrapper.onSubagentStarted(e => {
			this._logService.trace(`[Copilot:${sessionId}] Subagent started: ${e.data.agentName} (${e.data.agentDisplayName})`);
		});

		wrapper.onSubagentCompleted(e => {
			this._logService.trace(`[Copilot:${sessionId}] Subagent completed: ${e.data.agentName}`);
		});

		wrapper.onSubagentFailed(e => {
			this._logService.error(`[Copilot:${sessionId}] Subagent failed: ${e.data.agentName} - ${e.data.error}`);
		});

		wrapper.onSubagentSelected(e => {
			this._logService.trace(`[Copilot:${sessionId}] Subagent selected: ${e.data.agentName}`);
		});

		wrapper.onHookStart(e => {
			this._logService.trace(`[Copilot:${sessionId}] Hook started: ${e.data.hookType} (${e.data.hookInvocationId})`);
		});

		wrapper.onHookEnd(e => {
			this._logService.trace(`[Copilot:${sessionId}] Hook ended: ${e.data.hookType} (${e.data.hookInvocationId}), success=${e.data.success}`);
		});

		wrapper.onSystemMessage(e => {
			this._logService.trace(`[Copilot:${sessionId}] System message [${e.data.role}]: ${e.data.content.length} chars`);
		});
	}

	private async _resumeSession(sessionId: string): Promise<CopilotSessionWrapper> {
		this._logService.info(`[Copilot:${sessionId}] Session not in memory, resuming...`);
		const client = await this._ensureClient();
		const raw = await client.resumeSession(sessionId, {
			onPermissionRequest: (request, invocation) => this._handlePermissionRequest(request, invocation),
			workingDirectory: this._sessionWorkingDirs.get(sessionId),
			hooks: this._createSessionHooks(),
		});
		return this._trackSession(raw, sessionId);
	}

	private _mapSessionEvents(session: URI, events: readonly SessionEvent[]): (IAgentMessageEvent | IAgentToolStartEvent | IAgentToolCompleteEvent)[] {
		const result: (IAgentMessageEvent | IAgentToolStartEvent | IAgentToolCompleteEvent)[] = [];
		const toolInfoByCallId = new Map<string, { toolName: string; parameters: Record<string, unknown> | undefined }>();

		for (const e of events) {
			if (e.type === 'assistant.message' || e.type === 'user.message') {
				const d = (e as SessionEventPayload<'assistant.message'>).data;
				result.push({
					session,
					type: 'message',
					role: e.type === 'user.message' ? 'user' : 'assistant',
					messageId: d?.messageId ?? '',
					content: d?.content ?? '',
					toolRequests: d?.toolRequests?.map((tr: { toolCallId: string; name: string; arguments?: unknown; type?: 'function' | 'custom' }) => ({
						toolCallId: tr.toolCallId,
						name: tr.name,
						arguments: tr.arguments !== undefined ? tryStringify(tr.arguments) : undefined,
						type: tr.type,
					})),
					reasoningOpaque: d?.reasoningOpaque,
					reasoningText: d?.reasoningText,
					encryptedContent: d?.encryptedContent,
					parentToolCallId: d?.parentToolCallId,
				});
			} else if (e.type === 'tool.execution_start') {
				const d = (e as SessionEventPayload<'tool.execution_start'>).data;
				if (isHiddenTool(d.toolName)) {
					continue;
				}
				const toolArgs = d.arguments !== undefined ? tryStringify(d.arguments) : undefined;
				let parameters: Record<string, unknown> | undefined;
				if (toolArgs) {
					try { parameters = JSON.parse(toolArgs) as Record<string, unknown>; } catch { /* ignore */ }
				}
				toolInfoByCallId.set(d.toolCallId, { toolName: d.toolName, parameters });
				const displayName = getToolDisplayName(d.toolName);
				const toolKind = getToolKind(d.toolName);
				result.push({
					session,
					type: 'tool_start',
					toolCallId: d.toolCallId,
					toolName: d.toolName,
					displayName,
					invocationMessage: getInvocationMessage(d.toolName, displayName, parameters),
					toolInput: getToolInputString(d.toolName, parameters, toolArgs),
					toolKind,
					language: toolKind === 'terminal' ? getShellLanguage(d.toolName) : undefined,
					toolArguments: toolArgs,
					mcpServerName: d.mcpServerName,
					mcpToolName: d.mcpToolName,
					parentToolCallId: d.parentToolCallId,
				});
			} else if (e.type === 'tool.execution_complete') {
				const d = (e as SessionEventPayload<'tool.execution_complete'>).data;
				const info = toolInfoByCallId.get(d.toolCallId);
				if (!info) {
					continue;
				}
				toolInfoByCallId.delete(d.toolCallId);
				const displayName = getToolDisplayName(info.toolName);
				const toolOutput = d.error?.message ?? d.result?.content;
				const content: IToolResultContent[] = [];
				if (toolOutput !== undefined) {
					content.push({ type: ToolResultContentType.Text, text: toolOutput });
				}
				result.push({
					session,
					type: 'tool_complete',
					toolCallId: d.toolCallId,
					result: {
						success: d.success,
						pastTenseMessage: getPastTenseMessage(info.toolName, displayName, info.parameters, d.success),
						content: content.length > 0 ? content : undefined,
						error: d.error,
					},
					isUserRequested: d.isUserRequested,
					toolTelemetry: d.toolTelemetry !== undefined ? tryStringify(d.toolTelemetry) : undefined,
				});
			}
		}
		return result;
	}

	override dispose(): void {
		this._denyPendingPermissions();
		this._client?.stop().catch(() => { /* best-effort */ });
		super.dispose();
	}

	private _denyPendingPermissions(): void {
		for (const [, entry] of this._pendingPermissions) {
			entry.deferred.complete(false);
		}
		this._pendingPermissions.clear();
	}

	private _denyPendingPermissionsForSession(sessionId: string): void {
		for (const [requestId, entry] of this._pendingPermissions) {
			if (entry.sessionId === sessionId) {
				entry.deferred.complete(false);
				this._pendingPermissions.delete(requestId);
			}
		}
	}
}
