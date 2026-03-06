/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * NativeAgent: IAgent implementation backed by the native agent loop.
 *
 * This is the glue between the core agent loop (a stateless function) and the
 * agent host IPC protocol. It manages sessions, translates AgentLoopEvents
 * to IAgentProgressEvents, and delegates auth to CopilotTokenService.
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
import { IAgentLoopConfig, runAgentLoop } from '../common/agentLoop.js';
import {
	createUserMessage,
	IAssistantContentPart,
	IConversationMessage,
	IModelIdentity,
} from '../common/conversation.js';
import { AgentLoopEvent } from '../common/events.js';
import { IAgentTool } from '../common/tools.js';
import { IMiddleware } from '../common/middleware.js';
import { AnthropicModelProvider } from './anthropicProvider.js';
import { CopilotTokenService } from './copilotToken.js';
import { AllowAllPolicy, PermissionMiddleware } from './middleware/permissionMiddleware.js';
import { ToolOutputTruncationMiddleware } from './middleware/toolOutputTruncation.js';
import { getInvocationMessage, getPastTenseMessage, getShellLanguage, getToolDisplayName, getToolInputString, getToolKind } from './nativeToolDisplay.js';
import { BashTool } from './tools/bashTool.js';
import { ReadFileTool } from './tools/readFileTool.js';

// -- Session state ------------------------------------------------------------

interface INativeSession {
	readonly uri: URI;
	readonly model: string;
	readonly workingDirectory: string;
	readonly messages: IConversationMessage[];
	readonly history: (IAgentMessageEvent | IAgentToolStartEvent | IAgentToolCompleteEvent)[];
	readonly startTime: number;
	modifiedTime: number;
	cts: CancellationTokenSource;
	running: boolean;
}

// -- Agent implementation -----------------------------------------------------

const PROVIDER_ID: AgentProvider = 'native';
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_SYSTEM_PROMPT = `You are a coding assistant. You help users with programming tasks by reading files, running commands, and providing information. Be concise and helpful.`;

export class NativeAgent extends Disposable implements IAgent {
	readonly id = PROVIDER_ID;

	private readonly _onDidSessionProgress = this._register(new Emitter<IAgentProgressEvent>());
	readonly onDidSessionProgress = this._onDidSessionProgress.event;

	private readonly _sessions = this._register(new DisposableMap<string, CancellationTokenSource>());
	private readonly _sessionState = new Map<string, INativeSession>();
	private readonly _tokenService: CopilotTokenService;
	private readonly _tools: readonly IAgentTool[];
	/** Tracks active tool calls so we have args at completion time. */
	private readonly _activeToolCalls = new Map<string, { toolName: string; args: Record<string, unknown> }>();

	constructor(
		private readonly _logService: ILogService,
	) {
		super();
		this._tokenService = new CopilotTokenService(_logService);
		this._tools = [new ReadFileTool(), new BashTool()];
	}

	// ---- IAgent implementation ----------------------------------------------

	getDescriptor(): IAgentDescriptor {
		return {
			provider: PROVIDER_ID,
			displayName: 'Native Agent',
			description: 'Native agent loop with direct CAPI model calls',
			requiresAuth: true,
		};
	}

	async setAuthToken(token: string): Promise<void> {
		this._tokenService.setGitHubToken(token);
	}

	async listModels(): Promise<IAgentModelInfo[]> {
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

		const session: INativeSession = {
			uri: sessionUri,
			model,
			workingDirectory,
			messages: [],
			history: [],
			startTime: Date.now(),
			modifiedTime: Date.now(),
			cts,
			running: false,
		};

		this._sessionState.set(sessionUri.toString(), session);
		this._sessions.set(sessionUri.toString(), cts);

		this._logService.info(`[NativeAgent] Created session ${rawId}, model=${model}`);
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
		this._logService.info(`[NativeAgent] Disposed session ${AgentSession.id(sessionUri)}`);
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
			// Auto-approve all tool calls for now. The permission system will be
			// wired to the IAgentPermissionRequestEvent flow in a later phase.
			new PermissionMiddleware(new AllowAllPolicy(), () => Promise.resolve(true)),
			// Truncate large tool outputs to prevent context window exhaustion.
			new ToolOutputTruncationMiddleware(),
		];
	}

	private _getSession(uri: URI): INativeSession {
		const session = this._sessionState.get(uri.toString());
		if (!session) {
			throw new Error(`Session not found: ${uri.toString()}`);
		}
		return session;
	}

	private async _runLoop(session: INativeSession): Promise<void> {
		const modelIdentity: IModelIdentity = { provider: 'anthropic', modelId: session.model };
		const modelProvider = new AnthropicModelProvider(
			session.model,
			this._tokenService,
			this._logService,
		);

		const config: IAgentLoopConfig = {
			modelProvider,
			modelIdentity,
			systemPrompt: DEFAULT_SYSTEM_PROMPT,
			tools: [...this._tools],
			requestConfig: {
				providerOptions: { workingDirectory: session.workingDirectory },
			},
			middleware: this._buildMiddleware(),
		};

		try {
			for await (const event of runAgentLoop(session.messages, config, session.cts.token)) {
				this._processEvent(event, session);
			}

			// Emit idle
			this._onDidSessionProgress.fire({
				type: 'idle',
				session: session.uri,
			});
		} catch (err) {
			this._logService.error('[NativeAgent] Loop error:', err);
			this._onDidSessionProgress.fire({
				type: 'error',
				session: session.uri,
				errorType: err instanceof Error ? err.constructor.name : 'Error',
				message: err instanceof Error ? err.message : String(err),
			});
			this._onDidSessionProgress.fire({
				type: 'idle',
				session: session.uri,
			});
		}
	}

	private _processEvent(event: AgentLoopEvent, session: INativeSession): void {
		switch (event.type) {
			case 'assistant-delta': {
				this._onDidSessionProgress.fire({
					type: 'delta',
					session: session.uri,
					messageId: generateUuid(),
					content: event.text,
				});
				break;
			}
			case 'assistant-message': {
				const msg = event.message;
				const text = msg.content
					.filter(p => p.type === 'text')
					.map(p => (p as { text: string }).text)
					.join('');

				// Add the assistant message to conversation history
				session.messages.push(msg);

				const toolRequests = msg.content
					.filter(p => p.type === 'tool-call')
					.map(p => {
						const tc = p as IAssistantContentPart & { type: 'tool-call'; toolCallId: string; toolName: string; arguments: Record<string, unknown> };
						return {
							toolCallId: tc.toolCallId,
							name: tc.toolName,
							arguments: JSON.stringify(tc.arguments),
						};
					});

				session.history.push({
					type: 'message',
					session: session.uri,
					role: 'assistant',
					messageId: generateUuid(),
					content: text,
					toolRequests: toolRequests.length > 0 ? toolRequests : undefined,
				});
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

				// Track so we have args at completion time
				this._activeToolCalls.set(event.toolCallId, { toolName: event.toolName, args: event.arguments });

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
				const tracked = this._activeToolCalls.get(event.toolCallId);
				this._activeToolCalls.delete(event.toolCallId);
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
