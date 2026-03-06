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
import {
	AgentProvider,
	AgentSession,
	IAgent,
	IAgentAttachment,
	IAgentCreateSessionConfig,
	IAgentDescriptor,
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
	getAssistantText,
	getToolCalls,
	IConversationMessage,
} from '../common/conversation.js';
import { AgentLoopEvent } from '../common/events.js';
import { IAgentTool } from '../common/tools.js';
import { IMiddleware } from '../common/middleware.js';
import { CAPIRequestType, CopilotApiService, ICAPIModelsResponse } from './copilotToken.js';
import { createAnthropicFactory, ModelProviderService } from './modelProviderService.js';
import { AllowAllPolicy, PermissionMiddleware } from './middleware/permissionMiddleware.js';
import { ContextWindowMiddleware } from './middleware/contextWindow.js';
import { ToolOutputTruncationMiddleware } from './middleware/toolOutputTruncation.js';
import { getInvocationMessage, getPastTenseMessage, getShellLanguage, getToolDisplayName, getToolInputString, getToolKind } from './localToolDisplay.js';
import { BashTool } from './tools/bashTool.js';
import { ReadFileTool } from './tools/readFileTool.js';

// -- Session state ------------------------------------------------------------

interface ILocalSession {
	readonly uri: URI;
	readonly model: string;
	readonly workingDirectory: string;
	readonly messages: IConversationMessage[];
	readonly history: (IAgentMessageEvent | IAgentToolStartEvent | IAgentToolCompleteEvent)[];
	/** Tracks active tool calls so we have args at completion time. */
	readonly activeToolCalls: Map<string, { toolName: string; args: Record<string, unknown> }>;
	/** Current assistant message ID for correlating delta events. */
	currentAssistantMessageId: string | undefined;
	readonly startTime: number;
	modifiedTime: number;
	cts: CancellationTokenSource;
	running: boolean;
}

// -- Agent implementation -----------------------------------------------------

const PROVIDER_ID: AgentProvider = 'local';
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_SYSTEM_PROMPT = `You are a coding assistant. You help users with programming tasks by reading files, running commands, and providing information. Be concise and helpful.`;

export class LocalAgent extends Disposable implements IAgent {
	readonly id = PROVIDER_ID;

	private readonly _onDidSessionProgress = this._register(new Emitter<IAgentProgressEvent>());
	readonly onDidSessionProgress = this._onDidSessionProgress.event;

	private readonly _sessions = this._register(new DisposableMap<string, CancellationTokenSource>());
	private readonly _sessionState = new Map<string, ILocalSession>();
	private readonly _apiService: CopilotApiService;
	private readonly _modelProviderService: ModelProviderService;
	private readonly _tools: readonly IAgentTool[];

	constructor(
		private readonly _logService: ILogService,
	) {
		super();
		this._apiService = new CopilotApiService(_logService);
		this._modelProviderService = new ModelProviderService();
		this._modelProviderService.registerFactory(createAnthropicFactory(this._apiService, _logService));
		this._tools = [new ReadFileTool(), new BashTool()];
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
		return [...this._sessionState.values()].map(s => ({
			session: s.uri,
			startTime: s.startTime,
			modifiedTime: s.modifiedTime,
		}));
	}

	async createSession(config?: IAgentCreateSessionConfig): Promise<URI> {
		const rawId = generateUuid();
		const sessionUri = config?.session ?? AgentSession.uri(PROVIDER_ID, rawId);
		const model = config?.model ?? DEFAULT_MODEL;
		const workingDirectory = config?.workingDirectory ?? '';
		const cts = new CancellationTokenSource();

		const session: ILocalSession = {
			uri: sessionUri,
			model,
			workingDirectory,
			messages: [],
			history: [],
			activeToolCalls: new Map(),
			currentAssistantMessageId: undefined,
			startTime: Date.now(),
			modifiedTime: Date.now(),
			cts,
			running: false,
		};

		this._sessionState.set(sessionUri.toString(), session);
		this._sessions.set(sessionUri.toString(), cts);

		this._logService.info(`[LocalAgent] Created session ${rawId}, model=${model}`);
		return sessionUri;
	}

	async sendMessage(sessionUri: URI, prompt: string, _attachments?: IAgentAttachment[]): Promise<void> {
		const session = this._getSession(sessionUri);
		if (session.running) {
			throw new Error('Session is already running');
		}

		session.running = true;
		session.modifiedTime = Date.now();

		// Append user message
		const userMessage = createUserMessage(prompt);
		session.messages.push(userMessage);
		session.history.push({
			type: 'message',
			session: sessionUri,
			role: 'user',
			messageId: generateUuid(),
			content: prompt,
		});

		try {
			await this._runLoop(session);
		} finally {
			session.running = false;
			session.modifiedTime = Date.now();
		}
	}

	async getSessionMessages(sessionUri: URI): Promise<(IAgentMessageEvent | IAgentToolStartEvent | IAgentToolCompleteEvent)[]> {
		const session = this._getSession(sessionUri);
		return [...session.history];
	}

	async disposeSession(sessionUri: URI): Promise<void> {
		const key = sessionUri.toString();
		this._sessionState.delete(key);
		this._sessions.deleteAndDispose(key);
		this._logService.info(`[LocalAgent] Disposed session ${AgentSession.id(sessionUri)}`);
	}

	async abortSession(sessionUri: URI): Promise<void> {
		const session = this._sessionState.get(sessionUri.toString());
		if (session) {
			session.cts.cancel();
			session.cts = new CancellationTokenSource();
			this._sessions.set(sessionUri.toString(), session.cts);
		}
	}

	respondToPermissionRequest(_requestId: string, _approved: boolean): void {
		// Permission system not yet implemented
	}

	async shutdown(): Promise<void> {
		for (const session of this._sessionState.values()) {
			session.cts.cancel();
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

	private _getSession(uri: URI): ILocalSession {
		const session = this._sessionState.get(uri.toString());
		if (!session) {
			throw new Error(`Session not found: ${uri.toString()}`);
		}
		return session;
	}

	private async _runLoop(session: ILocalSession): Promise<void> {
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
			for await (const event of loop.run(session.messages, session.cts.token)) {
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

	private _processEvent(event: AgentLoopEvent, session: ILocalSession): void {
		switch (event.type) {
			case 'model-call-start': {
				// Allocate a message ID for correlating delta events
				session.currentAssistantMessageId = generateUuid();
				break;
			}
			case 'assistant-delta': {
				this._onDidSessionProgress.fire({
					type: 'delta',
					session: session.uri,
					messageId: session.currentAssistantMessageId ?? generateUuid(),
					content: event.text,
				});
				break;
			}
			case 'assistant-message': {
				const msg = event.message;
				const text = getAssistantText(msg);

				// Add the assistant message to conversation history
				session.messages.push(msg);

				const calls = getToolCalls(msg);
				const toolRequests = calls.map(tc => ({
					toolCallId: tc.toolCallId,
					name: tc.toolName,
					arguments: JSON.stringify(tc.arguments),
				}));

				session.history.push({
					type: 'message',
					session: session.uri,
					role: 'assistant',
					messageId: session.currentAssistantMessageId ?? generateUuid(),
					content: text,
					toolRequests: toolRequests.length > 0 ? toolRequests : undefined,
				});
				session.currentAssistantMessageId = undefined;
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
				const displayName = getToolDisplayName(event.toolName);
				const invocationMessage = getInvocationMessage(event.toolName, event.arguments);
				const toolInput = getToolInputString(event.toolName, event.arguments);
				const toolKind = getToolKind(event.toolName);
				const language = getShellLanguage(event.toolName);

				// Track so we have args at completion time (per-session)
				session.activeToolCalls.set(event.toolCallId, { toolName: event.toolName, args: event.arguments });

				const startEvent: IAgentToolStartEvent = {
					type: 'tool_start',
					session: session.uri,
					toolCallId: event.toolCallId,
					toolName: event.toolName,
					displayName,
					invocationMessage,
					toolInput,
					toolKind,
					language,
				};
				session.history.push(startEvent);
				this._onDidSessionProgress.fire(startEvent);
				break;
			}
			case 'tool-complete': {
				const tracked = session.activeToolCalls.get(event.toolCallId);
				session.activeToolCalls.delete(event.toolCallId);
				const toolArgs = tracked?.args ?? {};
				const pastTenseMessage = getPastTenseMessage(event.toolName, toolArgs);

				// Add tool result to conversation
				const toolResultMsg = {
					role: 'tool-result' as const,
					toolCallId: event.toolCallId,
					toolName: event.toolName,
					content: event.result,
					isError: event.isError || undefined,
				};
				session.messages.push(toolResultMsg);

				const completeEvent: IAgentToolCompleteEvent = {
					type: 'tool_complete',
					session: session.uri,
					toolCallId: event.toolCallId,
					success: !event.isError,
					pastTenseMessage,
					toolOutput: event.result,
				};
				session.history.push(completeEvent);
				this._onDidSessionProgress.fire(completeEvent);
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
}
