/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EffortLevel, McpServerConfig, Options, PermissionMode, Query, SDKUserMessage, SdkPluginConfig } from '@anthropic-ai/claude-agent-sdk';
import Anthropic from '@anthropic-ai/sdk';
import * as l10n from '@vscode/l10n';
import type * as vscode from 'vscode';
import { IChatDebugFileLoggerService } from '../../../../platform/chat/common/chatDebugFileLoggerService';
import { INativeEnvService } from '../../../../platform/env/common/envService';
import { ILogService } from '../../../../platform/log/common/logService';
import { IMcpService } from '../../../../platform/mcp/common/mcpService';
import { IOTelService, type ISpanHandle, SpanStatusCode, type TraceContext } from '../../../../platform/otel/common/index';
import { deriveClaudeOTelEnv } from '../../../../platform/otel/common/agentOTelEnv';
import { CapturingToken } from '../../../../platform/requestLogger/common/capturingToken';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { DeferredPromise } from '../../../../util/vs/base/common/async';
import { Disposable, DisposableMap } from '../../../../util/vs/base/common/lifecycle';
import { isWindows } from '../../../../util/vs/base/common/platform';
import { URI } from '../../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { LanguageModelToolMCPSource } from '../../../../vscodeTypes';
import { IClaudePluginService } from './claudeSkills';
import { ExternalEditTracker } from '../../common/externalEditTracker';
import { buildMcpServersFromRegistry } from '../common/claudeMcpServerRegistry';
import { dispatchMessage, KnownClaudeError } from '../common/claudeMessageDispatch';
import { IClaudeRuntimeDataService } from '../common/claudeRuntimeDataService';
import { ClaudeSessionUri } from '../common/claudeSessionUri';
import { IClaudeToolPermissionService } from '../common/claudeToolPermissionService';
import { IClaudeCodeSdkService } from './claudeCodeSdkService';
import { ClaudeLanguageModelServer, IClaudeLanguageModelServerConfig } from './claudeLanguageModelServer';
import { resolvePromptToContentBlocks } from './claudePromptResolver';
import { ClaudeSettingsChangeTracker } from './claudeSettingsChangeTracker';
import { ParsedClaudeModelId } from '../common/claudeModelId';
import { IClaudeSessionStateService } from '../common/claudeSessionStateService';
import { ClaudeOTelTracker } from './claudeOTelTracker';

// Manages Claude Code agent interactions and language model server lifecycle
export class ClaudeAgentManager extends Disposable {
	private _langModelServer: ClaudeLanguageModelServer | undefined;
	private _sessions = this._register(new DisposableMap<string, ClaudeCodeSession>());

	private async getLangModelServer(): Promise<ClaudeLanguageModelServer> {
		if (!this._langModelServer) {
			this._langModelServer = this.instantiationService.createInstance(ClaudeLanguageModelServer);
			await this._langModelServer.start();
		}

		return this._langModelServer;
	}

	constructor(
		@ILogService private readonly logService: ILogService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IClaudeSessionStateService private readonly sessionStateService: IClaudeSessionStateService,
	) {
		super();
	}

	public async handleRequest(
		claudeSessionId: string,
		request: vscode.ChatRequest,
		_context: vscode.ChatContext,
		stream: vscode.ChatResponseStream,
		token: vscode.CancellationToken,
		isNewSession: boolean,
		yieldRequested?: () => boolean
	): Promise<vscode.ChatResult & { claudeSessionId?: string }> {
		try {
			// Read UI state from session state service
			const modelId = this.sessionStateService.getModelIdForSession(claudeSessionId);
			const permissionMode = this.sessionStateService.getPermissionModeForSession(claudeSessionId);
			const folderInfo = this.sessionStateService.getFolderInfoForSession(claudeSessionId);

			if (!modelId || !folderInfo) {
				throw new Error(`Session state not found for session ${claudeSessionId}. State must be committed before calling handleRequest.`);
			}

			// Get server config, start server if needed
			const langModelServer = await this.getLangModelServer();
			const serverConfig = langModelServer.getConfig();

			this.logService.trace(`[ClaudeAgentManager] Handling request for sessionId=${claudeSessionId}, modelId=${modelId.toEndpointModelId()}, permissionMode=${permissionMode}.`);
			let session: ClaudeCodeSession;
			if (this._sessions.has(claudeSessionId)) {
				this.logService.trace(`[ClaudeAgentManager] Reusing Claude session ${claudeSessionId}.`);
				session = this._sessions.get(claudeSessionId)!;
			} else {
				this.logService.trace(`[ClaudeAgentManager] Creating Claude session for sessionId=${claudeSessionId}.`);
				const newSession = this.instantiationService.createInstance(ClaudeCodeSession, serverConfig, langModelServer, claudeSessionId, modelId, permissionMode, isNewSession);
				this._sessions.set(claudeSessionId, newSession);
				session = newSession;
			}

			await session.invoke(
				request,
				await resolvePromptToContentBlocks(request),
				request.toolInvocationToken,
				stream,
				token,
				yieldRequested
			);

			return {
				claudeSessionId: session.sessionId
			};
		} catch (invokeError) {
			// Check if this is an abort/cancellation error - don't show these as errors to the user
			const isAbortError = invokeError instanceof Error && (
				invokeError.name === 'AbortError' ||
				invokeError.message?.includes('aborted') ||
				invokeError.message?.includes('cancelled') ||
				invokeError.message?.includes('canceled')
			);
			if (isAbortError) {
				this.logService.trace('[ClaudeAgentManager] Request was aborted/cancelled');
				return { claudeSessionId };
			}

			this.logService.error(invokeError as Error);
			const errorMessage = (invokeError instanceof KnownClaudeError) ? invokeError.message : l10n.t('Claude CLI Error: {0}', invokeError.message);
			stream.markdown(l10n.t('Error: {0}', errorMessage));
			return {
				// This currently can't be used by the sessions API https://github.com/microsoft/vscode/issues/263111
				errorDetails: { message: errorMessage },
			};
		}
	}
}

/**
 * Represents a queued chat request waiting to be processed by the Claude session
 */
interface QueuedRequest {
	readonly prompt: Anthropic.ContentBlockParam[];
	readonly stream: vscode.ChatResponseStream;
	readonly toolInvocationToken: vscode.ChatParticipantToolToken;
	readonly token: vscode.CancellationToken;
	readonly yieldRequested?: () => boolean;
	readonly messageId: string;
	readonly deferred: DeferredPromise<void>;
}

/**
 * Represents the currently active request being processed
 */
interface CurrentRequest {
	readonly stream: vscode.ChatResponseStream;
	readonly toolInvocationToken: vscode.ChatParticipantToolToken;
	readonly token: vscode.CancellationToken;
	readonly yieldRequested?: () => boolean;
}

export class ClaudeCodeSession extends Disposable {
	private static readonly GATEWAY_IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

	private _queryGenerator: Query | undefined;
	private _promptQueue: QueuedRequest[] = [];
	private _currentRequest: CurrentRequest | undefined;
	private _pendingPrompt: DeferredPromise<QueuedRequest> | undefined;
	private _abortController = new AbortController();
	private _editTracker: ExternalEditTracker;
	private _settingsChangeTracker: ClaudeSettingsChangeTracker;
	private _currentModelId: ParsedClaudeModelId;
	private _currentPermissionMode: PermissionMode;
	private _currentEffort: EffortLevel | undefined;
	private _isResumed: boolean;
	private _yieldInProgress = false;
	private _sessionStarting: Promise<void> | undefined;
	private _currentToolNames: ReadonlySet<string> | undefined;
	private _gateway: vscode.McpGateway | undefined;
	private _gatewayIdleTimeout: ReturnType<typeof setTimeout> | undefined;
	private _otelTracker: ClaudeOTelTracker | undefined;

	/**
	 * Sets the model on the active SDK session, or stores it for the next session start.
	 */
	private async _setModel(modelId: ParsedClaudeModelId): Promise<void> {
		if (modelId === this._currentModelId) {
			return;
		}
		this._currentModelId = modelId;
		if (this._queryGenerator) {
			const sdkId = modelId.toSdkModelId();
			this.logService.trace(`[ClaudeCodeSession] Setting model to ${sdkId} on active session`);
			await this._queryGenerator.setModel(sdkId);
		}
	}

	/**
	 * Sets the permission mode on the active SDK session, or stores it for the next session start.
	 */
	private async _setPermissionMode(mode: PermissionMode): Promise<void> {
		if (mode === this._currentPermissionMode) {
			return;
		}
		this._currentPermissionMode = mode;
		if (this._queryGenerator) {
			this.logService.trace(`[ClaudeCodeSession] Setting permission mode to ${mode} on active session`);
			await this._queryGenerator.setPermissionMode(mode);
		}
	}

	constructor(
		private readonly serverConfig: IClaudeLanguageModelServerConfig,
		private readonly langModelServer: ClaudeLanguageModelServer,
		public readonly sessionId: string,
		initialModelId: ParsedClaudeModelId,
		initialPermissionMode: PermissionMode,
		isNewSession: boolean,
		@ILogService private readonly logService: ILogService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@INativeEnvService private readonly envService: INativeEnvService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IClaudeCodeSdkService private readonly claudeCodeService: IClaudeCodeSdkService,
		@IClaudeToolPermissionService private readonly toolPermissionService: IClaudeToolPermissionService,
		@IClaudeSessionStateService private readonly sessionStateService: IClaudeSessionStateService,
		@IClaudeRuntimeDataService private readonly runtimeDataService: IClaudeRuntimeDataService,
		@IMcpService private readonly mcpService: IMcpService,
		@IClaudePluginService private readonly claudePluginService: IClaudePluginService,
		@IOTelService private readonly _otelService: IOTelService,
		@IChatDebugFileLoggerService private readonly _debugFileLogger: IChatDebugFileLoggerService,
	) {
		super();
		this._currentModelId = initialModelId;
		this._currentPermissionMode = initialPermissionMode;
		this._isResumed = !isNewSession;
		this._otelTracker = new ClaudeOTelTracker(this.sessionId, this._otelService, this.sessionStateService);
		this._debugFileLogger.startSession(this.sessionId).catch(err => {
			this.logService.error('[ClaudeCodeSession] Failed to start debug log session', err);
		});
		this._register({
			dispose: () => {
				this._debugFileLogger.endSession(this.sessionId).catch(err => {
					this.logService.error('[ClaudeCodeSession] Failed to end debug log session', err);
				});
			}
		});
		// Initialize edit tracker with plan directory as ignored
		const planDirUri = URI.joinPath(this.envService.userHome, '.claude', 'plans');
		this._editTracker = new ExternalEditTracker([planDirUri]);
		this._settingsChangeTracker = this._createSettingsChangeTracker();
	}

	/**
	 * Creates and configures the settings change tracker with path resolvers.
	 * Add additional path resolvers here for new file types to track.
	 */
	private _createSettingsChangeTracker(): ClaudeSettingsChangeTracker {
		const tracker = this.instantiationService.createInstance(ClaudeSettingsChangeTracker);

		// Track CLAUDE.md files
		tracker.registerPathResolver(() => {
			const paths: URI[] = [];
			// User-level CLAUDE.md
			paths.push(URI.joinPath(this.envService.userHome, '.claude', 'CLAUDE.md'));
			// Project-level CLAUDE.md files
			for (const folder of this.workspaceService.getWorkspaceFolders()) {
				paths.push(URI.joinPath(folder, '.claude', 'CLAUDE.md'));
				paths.push(URI.joinPath(folder, '.claude', 'CLAUDE.local.md'));
				paths.push(URI.joinPath(folder, 'CLAUDE.md'));
				paths.push(URI.joinPath(folder, 'CLAUDE.local.md'));
			}
			return paths;
		});

		// Track settings/hooks files
		tracker.registerPathResolver(() => {
			const paths: URI[] = [];
			// User-level settings
			paths.push(URI.joinPath(this.envService.userHome, '.claude', 'settings.json'));
			// Project-level settings files
			for (const folder of this.workspaceService.getWorkspaceFolders()) {
				paths.push(URI.joinPath(folder, '.claude', 'settings.json'));
				paths.push(URI.joinPath(folder, '.claude', 'settings.local.json'));
			}
			return paths;
		});

		// Track agent files in agents directories
		tracker.registerDirectoryResolver(() => {
			const dirs: URI[] = [];
			// User-level agents directory
			dirs.push(URI.joinPath(this.envService.userHome, '.claude', 'agents'));
			// Project-level agents directory
			for (const folder of this.workspaceService.getWorkspaceFolders()) {
				dirs.push(URI.joinPath(folder, '.claude', 'agents'));
			}
			return dirs;
		}, '.md');

		return tracker;
	}

	public override dispose(): void {
		this._cancelGatewayIdleTimer();
		this._disposeGateway();
		this._abortController.abort();
		this._promptQueue.forEach(req => req.deferred.error(new Error('Session disposed')));
		this._promptQueue = [];
		this._pendingPrompt?.error(new Error('Session disposed'));
		this._pendingPrompt = undefined;
		super.dispose();
	}

	/**
	 * Invokes the Claude Code session with a user prompt
	 * @param request The full chat request
	 * @param prompt The user's prompt as an array of content blocks
	 * @param toolInvocationToken Token for invoking tools
	 * @param stream Response stream for sending results back to VS Code
	 * @param token Cancellation token for request cancellation
	 * @param yieldRequested Function to check if the user has requested to interrupt
	 */
	public async invoke(
		request: vscode.ChatRequest,
		prompt: Anthropic.ContentBlockParam[],
		toolInvocationToken: vscode.ChatParticipantToolToken,
		stream: vscode.ChatResponseStream,
		token: vscode.CancellationToken,
		yieldRequested?: () => boolean
	): Promise<void> {
		if (this._store.isDisposed) {
			throw new Error('Session disposed');
		}

		this._cancelGatewayIdleTimer();

		// Check if settings files have changed since session started
		if (this._queryGenerator && await this._settingsChangeTracker.hasChanges()) {
			this.logService.trace('[ClaudeCodeSession] Settings files changed, restarting session with resume');
			this._restartSession();
		}

		// Check if the set of enabled tools has changed since the last request
		if (this._queryGenerator && this._hasToolsChanged(request.tools)) {
			this.logService.trace('[ClaudeCodeSession] Tools changed, restarting session with resume');
			this._restartSession();
		}
		this._snapshotTools(request.tools);

		// Read current model and permission mode from session state service
		// Do this BEFORE starting a session so the Options are correct from the start
		const modelId = this.sessionStateService.getModelIdForSession(this.sessionId);
		const permissionMode = this.sessionStateService.getPermissionModeForSession(this.sessionId);
		const effortLevel = this.sessionStateService.getReasoningEffortForSession(this.sessionId);

		if (effortLevel !== this._currentEffort) {
			this._currentEffort = effortLevel;
			// Effort doesn't have a direct setter on the query generator, so we need to restart the session
			if (this._queryGenerator) {
				this._restartSession();
			}
		}
		// Update model and permission mode on active session if they changed
		if (modelId) {
			await this._setModel(modelId);
		}
		await this._setPermissionMode(permissionMode);

		if (!this._queryGenerator) {
			await this._startSession(token);
		}

		// Add this request to the queue and wait for completion
		const deferred = new DeferredPromise<void>();
		const queuedRequest: QueuedRequest = {
			prompt,
			stream,
			toolInvocationToken,
			token,
			yieldRequested,
			messageId: request.id,
			deferred
		};

		this._promptQueue.push(queuedRequest);

		// If there's a pending prompt request, fulfill it immediately
		if (this._pendingPrompt) {
			const pendingPrompt = this._pendingPrompt;
			this._pendingPrompt = undefined;
			pendingPrompt.complete(queuedRequest);
		}

		return deferred.p;
	}

	/**
	 * Starts a new Claude Code session with the configured options.
	 * Guards against concurrent starts (e.g., from yield restart racing with a new invoke).
	 */
	private async _startSession(token: vscode.CancellationToken): Promise<void> {
		// If a session start is already in progress, wait for it rather than starting a second
		if (this._sessionStarting) {
			await this._sessionStarting;
			return;
		}

		const startPromise = this._doStartSession(token);
		this._sessionStarting = startPromise;
		try {
			await startPromise;
		} finally {
			this._sessionStarting = undefined;
		}
	}

	private async _doStartSession(token: vscode.CancellationToken): Promise<void> {
		const folderInfo = this.sessionStateService.getFolderInfoForSession(this.sessionId);
		if (!folderInfo) {
			throw new Error(`No folder info found for session ${this.sessionId}`);
		}
		const { cwd, additionalDirectories } = folderInfo;

		// Build options for the Claude Code SDK
		this.logService.trace(`appRoot: ${this.envService.appRoot}`);
		const pathSep = isWindows ? ';' : ':';
		const mcpServers: Record<string, McpServerConfig> = await buildMcpServersFromRegistry(this.instantiationService) ?? {};

		// Create or reuse the MCP gateway for this session
		try {
			this._gateway ??= await this.mcpService.startMcpGateway(ClaudeSessionUri.forSessionId(this.sessionId)) ?? undefined;
			if (this._gateway) {
				for (const server of this._gateway.servers) {
					const serverId = server.label.toLowerCase().replace(/[^a-z0-9_-]/g, '_').replace(/^_+|_+$/g, '') || `vscode-mcp-server-${Object.keys(mcpServers).length}`;
					mcpServers[serverId] = {
						type: 'http',
						url: server.address.toString(),
					};
				}
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? (error.stack ?? error.message) : String(error);
			this.logService.warn(`[ClaudeCodeSession] Failed to start MCP gateway: ${errorMessage}`);
		}

		// Build plugins from skill directories
		const plugins: SdkPluginConfig[] = [];
		try {
			const pluginLocations = await this.claudePluginService.getPluginLocations(token);
			for (const pluginLocation of pluginLocations) {
				plugins.push({ type: 'local', path: pluginLocation.fsPath });
			}
			if (plugins.length > 0) {
				this.logService.info(`[ClaudeCodeSession] Passing ${plugins.length} plugin(s) from skill locations`);
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? (error.stack ?? error.message) : String(error);
			this.logService.warn(`[ClaudeCodeSession] Failed to resolve skill locations for plugins: ${errorMessage}`);
		}

		const options: Options = {
			cwd,
			additionalDirectories,
			// We allow this because we handle the visibility of
			// the permission mode ourselves in the options
			allowDangerouslySkipPermissions: true,
			abortController: this._abortController,
			effort: this._currentEffort,
			executable: process.execPath as 'node', // get it to fork the EH node process
			// TODO: CAPI does not yet support the WebSearch tool
			// Once it does, we can re-enable it.
			disallowedTools: ['WebSearch'],
			// Use sessionId for new sessions, resume for existing ones (mutually exclusive)
			...(this._isResumed
				? { resume: this.sessionId }
				: { sessionId: this.sessionId }),
			// Pass the model selection to the SDK
			model: this._currentModelId.toSdkModelId(),
			// Pass the permission mode to the SDK
			permissionMode: this._currentPermissionMode,
			includeHookEvents: true,
			mcpServers,
			plugins,
			settings: {
				env: {
					ANTHROPIC_BASE_URL: `http://localhost:${this.serverConfig.port}`,
					ANTHROPIC_AUTH_TOKEN: `${this.serverConfig.nonce}.${this.sessionId}`,
					CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
					USE_BUILTIN_RIPGREP: '0',
					PATH: `${this.envService.appRoot}/node_modules/@vscode/ripgrep/bin${pathSep}${process.env.PATH}`,
					// Forward OTel configuration to the Claude SDK subprocess
					...deriveClaudeOTelEnv(this._otelService.config),
				},
				attribution: {
					commit: '',
					pr: '',
				},
			},
			canUseTool: async (name, input) => {
				if (!this._currentRequest) {
					return { behavior: 'deny', message: 'No active request' };
				}
				this.logService.trace(`[ClaudeCodeSession]: canUseTool: ${name}(${JSON.stringify(input)})`);
				return this.toolPermissionService.canUseTool(name, input, {
					toolInvocationToken: this._currentRequest.toolInvocationToken,
					permissionMode: this._currentPermissionMode,
					stream: this._currentRequest.stream
				});
			},
			systemPrompt: {
				type: 'preset',
				preset: 'claude_code'
			},
			settingSources: ['user', 'project', 'local'],
			stderr: data => this.logService.error(`claude-agent-sdk stderr: ${data}`)
		};

		this.logService.trace(`claude-agent-sdk: Starting query`);
		this._queryGenerator = await this.claudeCodeService.query({
			prompt: this._createPromptIterable(),
			options
		});

		// Cache runtime data (agents, etc.) for the customization provider.
		// Fire-and-forget to avoid blocking session startup — error handling is inside the service.
		void this.runtimeDataService.update(this._queryGenerator);

		// Take a snapshot of settings files so we can detect changes
		await this._settingsChangeTracker.takeSnapshot();

		// Start the message processing loop (fire-and-forget, but _processMessages
		// handles all errors internally via try/catch → _cleanup)
		void this._processMessages().catch(err => {
			this.logService.error('[ClaudeCodeSession] Unhandled error in message processing loop', err);
		});
	}

	private async *_createPromptIterable(): AsyncIterable<SDKUserMessage> {
		while (true) {
			// Wait for a request to be available
			const request = await this._getNextRequest();

			this._currentRequest = {
				stream: request.stream,
				toolInvocationToken: request.toolInvocationToken,
				token: request.token,
				yieldRequested: request.yieldRequested
			};

			// Increment user-initiated message count for this model
			// This is used by the language model server to track which requests are user-initiated
			this.langModelServer.incrementUserInitiatedMessageCount(this._currentModelId.toEndpointModelId());

			// Create a capturing token for this request to group tool calls under the request
			// we use the last text block in the prompt as the label for the token, since that is most representative of the user's intent
			const promptLabel = request.prompt.filter(p => p.type === 'text').at(-1)?.text ?? 'Claude Session Prompt';
			this.sessionStateService.setCapturingTokenForSession(
				this.sessionId,
				new CapturingToken(promptLabel, 'claude', undefined, undefined, this.sessionId)
			);

			// Start OTel tracking for this request
			const modelId = this._currentModelId.toEndpointModelId();
			this._otelTracker!.startRequest(modelId);

			// Emit user_message span event for the debug panel
			this._otelTracker!.emitUserMessage(promptLabel);

			yield {
				type: 'user',
				message: {
					role: 'user',
					content: request.prompt
				},
				parent_tool_use_id: null,
				session_id: this.sessionId,
				// NOTE: messageId seems to be in the format request_<uuid> but it doesn't seem
				// to be a problem to use as the message ID for the SDK.
				uuid: request.messageId as `${string}-${string}-${string}-${string}-${string}`
			};

			// Wait for this request to complete before yielding the next one
			await request.deferred.p;
		}
	}

	/**
	 * Gets the next request from the queue or waits for one to be available
	 * @returns Promise that resolves with the next queued request
	 */
	private async _getNextRequest(): Promise<QueuedRequest> {
		if (this._promptQueue.length > 0) {
			return this._promptQueue[0]; // Don't shift yet, keep for resolution
		}

		// Wait for a request to be queued
		this._pendingPrompt = new DeferredPromise<QueuedRequest>();
		return this._pendingPrompt.p;
	}

	/**
	 * Processes messages from the Claude Code query generator
	 * Routes messages to appropriate handlers and manages request completion
	 */
	private async _processMessages(): Promise<void> {
		const otelToolSpans = new Map<string, ISpanHandle>();
		const otelHookSpans = new Map<string, ISpanHandle>();
		const subagentTraceContexts = new Map<string, TraceContext>();
		try {
			const unprocessedToolCalls = new Map<string, Anthropic.Beta.Messages.BetaToolUseBlock>();
			for await (const message of this._queryGenerator!) {
				// Check if current request was cancelled
				if (this._currentRequest?.token.isCancellationRequested) {
					throw new Error('Request was cancelled');
				}

				// Mark session as resumed after first SDK message confirms session exists on disk.
				// This ensures future restarts (yield, settings change) use `resume` instead of `sessionId`.
				if (message.session_id && !this._isResumed) {
					this._isResumed = true;
				}

				// Check yield before processing to avoid streaming partial responses
				if (await this._checkYieldRequested()) {
					continue;
				}

				// Skip if no current request (e.g., after yield cleared it)
				if (!this._currentRequest) {
					this.logService.trace('[ClaudeCodeSession] Skipping message - no current request');
					continue;
				}

				// Track OTel metrics from SDK messages
				this._otelTracker!.onMessage(message, subagentTraceContexts);

				this.logService.trace(`claude-agent-sdk Message: ${JSON.stringify(message, null, 2)}`);

				const result = this.instantiationService.invokeFunction(dispatchMessage, message, this.sessionId, {
					stream: this._currentRequest.stream,
					toolInvocationToken: this._currentRequest.toolInvocationToken,
					editTracker: this._editTracker,
					token: this._currentRequest.token,
				}, {
					unprocessedToolCalls,
					otelToolSpans,
					otelHookSpans,
					parentTraceContext: this._otelTracker!.traceContext,
					subagentTraceContexts,
				});

				if (result?.requestComplete) {
					// End the invoke_agent span for this request
					this._otelTracker!.endRequest();
					// Clear the capturing token so subsequent requests get their own
					this.sessionStateService.setCapturingTokenForSession(this.sessionId, undefined);
					// Resolve and remove the completed request
					if (this._promptQueue.length > 0) {
						const completedRequest = this._promptQueue.shift()!;
						await completedRequest.deferred.complete();
					}
					this._currentRequest = undefined;
					this._startGatewayIdleTimer();
					subagentTraceContexts.clear();
				}
			}
			// Generator ended normally - clean up so next invoke starts fresh
			this._cleanup(new Error('Session ended unexpectedly'));
		} catch (error) {
			this._cleanup(error as Error);
		} finally {
			// Clean up any remaining OTel spans
			for (const [, span] of otelToolSpans) {
				span.setStatus(SpanStatusCode.ERROR, 'session ended before tool completed');
				span.end();
			}
			otelToolSpans.clear();
			for (const [, span] of otelHookSpans) {
				span.setStatus(SpanStatusCode.ERROR, 'session ended before hook completed');
				span.end();
			}
			otelHookSpans.clear();
			// End any lingering invoke_agent span
			this._otelTracker!.endRequestWithError('session ended');
		}
	}

	private _cleanup(error: Error): void {
		// Clear the capturing token so it doesn't leak across sessions or error boundaries
		this.sessionStateService.setCapturingTokenForSession(this.sessionId, undefined);
		// End invoke_agent span with error if still open
		this._otelTracker!.endRequestWithError(error.message);
		this._resetSessionState();

		const wasYielding = this._yieldInProgress;
		this._yieldInProgress = false;

		if (wasYielding) {
			this._restartAfterYield();
		} else {
			this._rejectPendingRequests(error);
		}
	}

	/**
	 * Resets session state so the next session start can begin fresh.
	 * Preserves the sessionId for SDK resume.
	 */
	private _resetSessionState(): void {
		this._queryGenerator = undefined;
		this._abortController = new AbortController();
		this._currentRequest = undefined;
		this._currentEffort = undefined;
	}

	/**
	 * After a yield, preserves the queue and restarts the session to process
	 * any pending requests (e.g., the steering message).
	 */
	private _restartAfterYield(): void {
		this.logService.trace(`[ClaudeCodeSession] Yield cleanup, sessionId=${this.sessionId}, pending requests=${this._promptQueue.length}`);

		if (this._promptQueue.length > 0) {
			const nextRequest = this._promptQueue[0];
			void this._startSession(nextRequest.token).catch(err => {
				this.logService.error('[ClaudeCodeSession] Failed to restart session after yield', err);
				this._rejectPendingRequests(err);
			});
		}
	}

	/**
	 * Rejects all pending requests and clears the queue.
	 */
	private _rejectPendingRequests(error: Error): void {
		this._promptQueue.forEach(req => {
			if (!req.deferred.isSettled) {
				req.deferred.error(error);
			}
		});
		this._promptQueue = [];
		if (this._pendingPrompt && !this._pendingPrompt.isSettled) {
			this._pendingPrompt.error(error);
		}
		this._pendingPrompt = undefined;
	}

	/**
	 * Checks if the user has requested to interrupt the current request.
	 * If so, completes the current request gracefully and aborts the SDK to allow the next message.
	 * @returns true if a yield was detected and handled, false otherwise
	 */
	private async _checkYieldRequested(): Promise<boolean> {
		if (!this._currentRequest?.yieldRequested?.()) {
			return false;
		}

		this.logService.trace('[ClaudeCodeSession] Yield requested - interrupting session to allow user interruption');
		this._yieldInProgress = true;

		// Complete the current request gracefully
		if (this._promptQueue.length > 0) {
			const completedRequest = this._promptQueue.shift()!;
			await completedRequest.deferred.complete();
		}
		this._currentRequest = undefined;

		// Signal the SDK to stop generating
		this._abortController.abort();

		return true;
	}

	/**
	 * Restarts the session to pick up settings changes.
	 * Clears the query generator but preserves the session ID for resume.
	 */
	private _restartSession(): void {
		// Clear the generator so _startSession will be called with resume
		this._queryGenerator = undefined;
		this._abortController.abort();
		this._abortController = new AbortController();
		this._isResumed = true;
		// Note: We don't clear the prompt queue or pending prompts here
		// because we're not erroring out, just restarting for settings reload
	}

	// #region Gateway Lifecycle

	private _cancelGatewayIdleTimer(): void {
		if (this._gatewayIdleTimeout !== undefined) {
			clearTimeout(this._gatewayIdleTimeout);
			this._gatewayIdleTimeout = undefined;
		}
	}

	private _startGatewayIdleTimer(): void {
		this._cancelGatewayIdleTimer();
		this._gatewayIdleTimeout = setTimeout(() => {
			this._gatewayIdleTimeout = undefined;
			this._disposeGateway();
			this._restartSession();
		}, ClaudeCodeSession.GATEWAY_IDLE_TIMEOUT_MS);
	}

	private _disposeGateway(): void {
		this._gateway?.dispose();
		this._gateway = undefined;
	}

	// #endregion

	/**
	 * Takes a snapshot of the current tools for later comparison.
	 */
	private _snapshotTools(tools: vscode.ChatRequest['tools']): void {
		// TODO: Handle the enabled/disabled (true/false) state per tool once we have UI for it
		this._currentToolNames = new Set(
			[...tools]
				.filter(([tool]) => tool.source instanceof LanguageModelToolMCPSource)
				.map(([tool]) => tool.name)
		);
	}

	/**
	 * Checks whether the set of enabled tools has changed since the last snapshot.
	 */
	private _hasToolsChanged(tools: vscode.ChatRequest['tools']): boolean {
		if (!this._currentToolNames) {
			return false;
		}

		// TODO: Handle the enabled/disabled (true/false) state per tool once we have UI for it
		const newToolNames = new Set(
			[...tools]
				.filter(([tool]) => tool.source instanceof LanguageModelToolMCPSource)
				.map(([tool]) => tool.name)
		);

		if (newToolNames.size !== this._currentToolNames.size) {
			return true;
		}

		for (const name of newToolNames) {
			if (!this._currentToolNames.has(name)) {
				return true;
			}
		}

		return false;
	}

}
