/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * LocalAgent: IAgent implementation backed by the local agent loop.
 *
 * This is the glue between the core agent loop (a stateless function) and the
 * agent host IPC protocol. It manages sessions, translates AgentLoopEvents
 * to IAgentProgressEvents, and delegates auth to CopilotApiService.
 */

import { CancellationTokenSource } from '../../../base/common/cancellation.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { ILogService } from '../../log/common/log.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import {
	AgentProvider,
	AgentSession,
	IAgent,
	IAgentAttachment,
	IAgentCreateSessionConfig,
	IAgentDescriptor,
	IAgentHostInitData,
	IAgentMessageEvent,
	IAgentModelInfo,
	IAgentProgressEvent,
	IAgentSessionMetadata,
	IAgentToolCompleteEvent,
	IAgentToolStartEvent,
} from '../../agent/common/agentService.js';
import { AgentLoop, IAgentLoopConfig } from '../common/agentLoop.js';
import {
	createUserMessage,
	IConversationMessage,
} from '../common/conversation.js';
import { AgentLoopEvent } from '../common/events.js';
import { IAgentTool } from '../common/tools.js';
import { IMiddleware } from '../common/middleware.js';
import type { SessionEntry } from '../common/sessionTypes.js';
import { CAPIRequestType, ICopilotApiService, ICAPIModelsResponse } from './copilotToken.js';
import { createAnthropicFactory, createOpenAIFactory, ModelProviderService } from './modelProviderService.js';
import { AllowAllPolicy, PermissionMiddleware } from './middleware/permissionMiddleware.js';
import { ContextWindowMiddleware } from './middleware/contextWindow.js';
import { ToolOutputTruncationMiddleware } from './middleware/toolOutputTruncation.js';
import { BashTool } from './tools/bashTool.js';
import { ReadFileTool } from './tools/readFileTool.js';
import { SessionStorage } from './sessionStorage.js';
import { LocalSession } from './localSession.js';

// -- Agent implementation -----------------------------------------------------

const PROVIDER_ID: AgentProvider = 'local';
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_SYSTEM_PROMPT = `You are a coding assistant. You help users with programming tasks by reading files, running commands, and providing information. Be concise and helpful.`;

export class LocalAgent extends Disposable implements IAgent {
	readonly id = PROVIDER_ID;

	private readonly _onDidSessionProgress = this._register(new Emitter<IAgentProgressEvent>());
	readonly onDidSessionProgress = this._onDidSessionProgress.event;

	private readonly _sessions = this._register(new DisposableMap<string, CancellationTokenSource>());
	private readonly _sessionState = new Map<string, LocalSession>();
	/** Per-session message ID for correlating streaming deltas with the final assistant message. */
	private readonly _pendingMessageIds = new Map<string, string>();
	private readonly _modelProviderService: ModelProviderService;
	private readonly _tools: readonly IAgentTool[];
	private readonly _storage: SessionStorage;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@ICopilotApiService private readonly _apiService: ICopilotApiService,
		@INativeEnvironmentService environmentService: INativeEnvironmentService,
	) {
		super();
		this._modelProviderService = new ModelProviderService();
		this._modelProviderService.registerFactory(createAnthropicFactory(this._apiService, _logService));
		this._modelProviderService.registerFactory(createOpenAIFactory(this._apiService, _logService));
		this._tools = [new ReadFileTool(), new BashTool()];
		this._storage = new SessionStorage(environmentService.userDataPath, _logService);
	}

	override dispose(): void {
		for (const session of this._sessionState.values()) {
			session.dispose();
		}
		this._sessionState.clear();
		super.dispose();
	}


	// ---- IAgent implementation ----------------------------------------------

	getDescriptor(): IAgentDescriptor {
		return {
			provider: PROVIDER_ID,
			displayName: 'Local Agent',
			description: 'Local agent loop with direct CAPI model calls',
			requiresAuth: true,
		};
	}

	async setAuthToken(token: string): Promise<void> {
		this._logService.info('[LocalAgent] Auth token received');
		this._apiService.setGitHubToken(token);
	}

	async initialize(initData: IAgentHostInitData): Promise<void> {
		this._logService.info('[LocalAgent] Initialized with identity data');
		this._apiService.setIdentity({
			machineId: initData.machineId,
			vscodeVersion: initData.vscodeVersion,
			buildType: (initData.quality === 'stable' || initData.quality === 'insider') ? 'prod' : 'dev',
		});
	}

	async listModels(): Promise<IAgentModelInfo[]> {
		try {
			const response = await this._apiService.sendRequest<ICAPIModelsResponse>(
				{ type: CAPIRequestType.Models },
			);

			return response.data
				.filter(m => m.capabilities.type === 'chat' && m.model_picker_enabled)
				.map(m => ({
					provider: PROVIDER_ID,
					id: m.id,
					name: m.name,
					maxContextWindow: m.capabilities.limits?.max_context_window_tokens ?? 200_000,
					supportsVision: m.capabilities.supports.vision ?? false,
					supportsReasoningEffort: (m.capabilities.supports.thinking ?? false) || (m.capabilities.supports.adaptive_thinking ?? false),
					policyState: m.policy?.state,
					billingMultiplier: m.billing?.multiplier,
				}));
		} catch (err) {
			this._logService.warn('[LocalAgent] Failed to fetch models from CAPI, returning defaults', err);
			return [{
				provider: PROVIDER_ID,
				id: DEFAULT_MODEL,
				name: 'Claude Sonnet 4',
				maxContextWindow: 200_000,
				supportsVision: true,
				supportsReasoningEffort: true,
				supportedReasoningEfforts: ['low', 'medium', 'high'],
				defaultReasoningEffort: 'medium',
			}];
		}
	}

	async listSessions(): Promise<IAgentSessionMetadata[]> {
		// Include in-memory sessions
		const inMemory = [...this._sessionState.values()].map(s => s.toMetadata());

		// Merge with persisted sessions (persisted ones not currently loaded)
		const persisted = await this._storage.listSessions();
		const inMemoryKeys = new Set(inMemory.map(s => s.session.toString()));
		const additional = persisted.filter(s => !inMemoryKeys.has(s.session.toString()));

		return [...inMemory, ...additional];
	}

	async createSession(config?: IAgentCreateSessionConfig): Promise<URI> {
		const rawId = generateUuid();
		const sessionUri = config?.session ?? AgentSession.uri(PROVIDER_ID, rawId);
		const model = config?.model ?? DEFAULT_MODEL;
		const workingDirectory = config?.workingDirectory ?? '';

		const session = new LocalSession(sessionUri, model, workingDirectory, this._storage.baseDir, this._logService);
		this._sessionState.set(sessionUri.toString(), session);
		this._sessions.set(sessionUri.toString(), session.cts);

		await session.persistCreation();

		this._logService.info(`[LocalAgent] Created session ${rawId}, model=${model}`);
		return sessionUri;
	}

	async sendMessage(sessionUri: URI, prompt: string, _attachments?: IAgentAttachment[]): Promise<void> {
		const session = this._getSession(sessionUri);
		if (session.running) {
			throw new Error('Session is already running');
		}

		session.beginTurn();
		session.addUserMessage(prompt);

		try {
			await this._runLoop(session);
		} finally {
			session.endTurn();
		}
	}

	async getSessionMessages(sessionUri: URI): Promise<(IAgentMessageEvent | IAgentToolStartEvent | IAgentToolCompleteEvent)[]> {
		// In-memory session takes priority
		const session = this._sessionState.get(sessionUri.toString());
		const entries = session?.entries
			?? (await this._storage.findAndRestoreSession(sessionUri))?.entries
			?? [];
		return this._entriesToIpcEvents(sessionUri, entries);
	}

	async disposeSession(sessionUri: URI): Promise<void> {
		const key = sessionUri.toString();
		const session = this._sessionState.get(key);
		if (session) {
			await session.flush();
			session.dispose();
		}
		this._sessionState.delete(key);
		this._sessions.deleteAndDispose(key);
		this._logService.info(`[LocalAgent] Disposed session ${AgentSession.id(sessionUri)}`);
	}

	async abortSession(sessionUri: URI): Promise<void> {
		const session = this._sessionState.get(sessionUri.toString());
		if (session) {
			session.abort();
			this._sessions.set(sessionUri.toString(), session.cts);
		}
	}

	respondToPermissionRequest(_requestId: string, _approved: boolean): void {
		// Permission system not yet implemented
	}

	async shutdown(): Promise<void> {
		const flushPromises: Promise<void>[] = [];
		for (const session of this._sessionState.values()) {
			session.cts.cancel();
			flushPromises.push(session.flush());
		}
		await Promise.all(flushPromises);
		for (const session of this._sessionState.values()) {
			session.dispose();
		}
		this._sessionState.clear();
		this._sessions.clearAndDisposeAll();
	}

	// ---- Internal -----------------------------------------------------------

	private _buildMiddleware(): IMiddleware[] {
		return [
			// Context window management: prune old tool outputs when approaching limit
			new ContextWindowMiddleware({ maxContextTokens: 200_000 }),
			// Auto-approve all tool calls for now. The permission system will be
			// wired to the IAgentPermissionRequestEvent flow in a later phase.
			new PermissionMiddleware(new AllowAllPolicy(), () => Promise.resolve(true)),
			// Truncate large tool outputs to prevent context window exhaustion.
			new ToolOutputTruncationMiddleware(),
		];
	}

	private _getSession(uri: URI): LocalSession {
		const session = this._sessionState.get(uri.toString());
		if (!session) {
			throw new Error(`Session not found: ${uri.toString()}`);
		}
		return session;
	}

	private async _runLoop(session: LocalSession): Promise<void> {
		const { provider: modelProvider, identity: modelIdentity } = this._modelProviderService.resolve(session.model);

		const config: IAgentLoopConfig = {
			modelProvider,
			modelIdentity,
			systemPrompt: DEFAULT_SYSTEM_PROMPT,
			tools: [...this._tools],
			workingDirectory: session.workingDirectory,
			middleware: this._buildMiddleware(),
		};

		try {
			const loop = new AgentLoop(config);
			const messages = this._buildConversationMessages(session);
			for await (const event of loop.run(messages, session.cts.token)) {
				this._processEvent(event, session);
			}

			// Emit idle
			this._onDidSessionProgress.fire({
				type: 'idle',
				session: session.uri,
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			const stack = err instanceof Error ? err.stack : undefined;
			this._logService.error(`[LocalAgent] Loop error: ${message}`, stack);
			this._onDidSessionProgress.fire({
				type: 'error',
				session: session.uri,
				errorType: err instanceof Error ? err.constructor.name : 'Error',
				message,
				stack,
			});
			this._onDidSessionProgress.fire({
				type: 'idle',
				session: session.uri,
			});
		}
	}

	private _processEvent(event: AgentLoopEvent, session: LocalSession): void {
		const sessionKey = session.uri.toString();

		switch (event.type) {
			case 'model-call-start': {
				this._pendingMessageIds.set(sessionKey, generateUuid());
				break;
			}
			case 'assistant-delta': {
				this._onDidSessionProgress.fire({
					type: 'delta',
					session: session.uri,
					messageId: this._pendingMessageIds.get(sessionKey) ?? generateUuid(),
					content: event.text,
				});
				break;
			}
			case 'assistant-message': {
				const messageId = this._pendingMessageIds.get(sessionKey) ?? generateUuid();
				this._pendingMessageIds.delete(sessionKey);
				session.addAssistantMessage(event.message, messageId);
				break;
			}
			case 'reasoning-delta': {
				this._onDidSessionProgress.fire({
					type: 'reasoning',
					session: session.uri,
					content: event.text,
				});
				break;
			}
			case 'tool-start': {
				const entry = session.addToolStart(event.toolCallId, event.toolName, event.arguments);
				this._onDidSessionProgress.fire({
					...entry,
					type: 'tool_start',
					session: session.uri,
				});
				break;
			}
			case 'tool-complete': {
				const entry = session.addToolComplete(event.toolCallId, event.toolName, event.result, event.isError);
				this._onDidSessionProgress.fire({
					...entry,
					type: 'tool_complete',
					session: session.uri,
				});
				break;
			}
			case 'usage': {
				this._onDidSessionProgress.fire({
					type: 'usage',
					session: session.uri,
					inputTokens: event.inputTokens,
					outputTokens: event.outputTokens,
					model: event.modelIdentity.modelId,
					cacheReadTokens: event.cacheReadTokens,
				});
				break;
			}
			case 'error': {
				this._onDidSessionProgress.fire({
					type: 'error',
					session: session.uri,
					errorType: event.error.constructor.name,
					message: event.error.message,
				});
				break;
			}
		}
	}

	/**
	 * Build the conversation message array that the model provider needs
	 * from the session's entries. This is the only place where session
	 * entries are translated into the provider-neutral conversation format.
	 */
	private _buildConversationMessages(session: LocalSession): IConversationMessage[] {
		const messages: IConversationMessage[] = [];
		for (const entry of session.entries) {
			switch (entry.type) {
				case 'user-message':
					messages.push(createUserMessage(entry.content));
					break;
				case 'assistant-message':
					messages.push({
						role: 'assistant',
						content: entry.contentParts,
						modelIdentity: entry.modelIdentity,
						providerMetadata: entry.providerMetadata,
					});
					break;
				case 'tool-complete':
					messages.push({
						role: 'tool-result' as const,
						toolCallId: entry.toolCallId,
						toolName: entry.toolName,
						content: entry.toolOutput,
						isError: !entry.success || undefined,
					});
					break;
			}
		}
		return messages;
	}

	/**
	 * Translates session entries to IPC event types for getSessionMessages().
	 */
	private _entriesToIpcEvents(
		sessionUri: URI,
		entries: readonly SessionEntry[],
	): (IAgentMessageEvent | IAgentToolStartEvent | IAgentToolCompleteEvent)[] {
		const result: (IAgentMessageEvent | IAgentToolStartEvent | IAgentToolCompleteEvent)[] = [];
		for (const entry of entries) {
			switch (entry.type) {
				case 'user-message':
					result.push({ type: 'message', session: sessionUri, role: 'user', messageId: entry.messageId, content: entry.content });
					break;
				case 'assistant-message': {
					const text = entry.contentParts
						.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
						.map(p => p.text)
						.join('');
					const toolRequests = entry.contentParts
						.filter((p): p is { type: 'tool-call'; toolCallId: string; toolName: string; arguments: Record<string, unknown> } => p.type === 'tool-call')
						.map(p => ({ toolCallId: p.toolCallId, name: p.toolName, arguments: JSON.stringify(p.arguments) }));
					result.push({
						type: 'message', session: sessionUri, role: 'assistant', messageId: entry.messageId,
						content: text,
						toolRequests: toolRequests.length > 0 ? toolRequests : undefined,
					});
					break;
				}
				case 'tool-start':
					result.push({ ...entry, type: 'tool_start', session: sessionUri });
					break;
				case 'tool-complete':
					result.push({ ...entry, type: 'tool_complete', session: sessionUri });
					break;
			}
		}
		return result;
	}
}
