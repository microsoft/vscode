/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CopilotClient, CopilotSession, type SessionEvent, type SessionEventPayload } from '@github/copilot-sdk';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ILogService } from '../../../log/common/log.js';
import { IAgentCreateSessionConfig, IAgentModelInfo, IAgentProgressEvent, IAgentMessageEvent, IAgent, IAgentSessionMetadata, IAgentToolStartEvent, IAgentToolCompleteEvent, AgentSession, IAgentDescriptor } from '../../common/agentService.js';
import { getInvocationMessage, getPastTenseMessage, getShellLanguage, getToolDisplayName, getToolInputString, getToolKind, isHiddenTool } from './copilotToolDisplay.js';
import { CopilotSessionWrapper } from './copilotSessionWrapper.js';

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

	constructor(
		private readonly _logService: ILogService,
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

	async setAuthToken(token: string): Promise<void> {
		const tokenChanged = this._githubToken !== token;
		this._githubToken = token;
		this._logService.info(`[Copilot] Auth token ${tokenChanged ? 'updated' : 'unchanged'} (${token.substring(0, 4)}...)`);
		if (tokenChanged && this._client && this._sessions.size === 0) {
			this._logService.info('[Copilot] Restarting CopilotClient with new token');
			const client = this._client;
			this._client = undefined;
			this._clientStarting = undefined;
			await client.stop();
		}
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
			this._logService.info(`[Copilot] Starting CopilotClient... ${this._githubToken ? '(with token)' : '(using logged-in user)'}`);
			const client = new CopilotClient({
				githubToken: this._githubToken,
				useLoggedInUser: !this._githubToken,
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
		const result = sessions.map(s => ({
			session: AgentSession.uri(this.id, s.sessionId),
			startTime: s.startTime.getTime(),
			modifiedTime: s.modifiedTime.getTime(),
			summary: s.summary,
		}));
		this._logService.info(`[Copilot] Found ${result.length} sessions`);
		return result;
	}

	async listModels(): Promise<IAgentModelInfo[]> {
		this._logService.info('[Copilot] Listing models...');
		const client = await this._ensureClient();
		const models = await client.listModels();
		const result = models.map(m => ({
			id: m.id,
			name: m.name,
			maxContextWindow: m.capabilities.limits.max_context_window_tokens,
			supportsVision: m.capabilities.supports.vision,
			supportsReasoningEffort: m.capabilities.supports.reasoningEffort,
			supportedReasoningEfforts: m.supportedReasoningEfforts,
			defaultReasoningEffort: m.defaultReasoningEffort,
			policyState: m.policy?.state,
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
		});

		const wrapper = this._trackSession(raw);
		const session = AgentSession.uri(this.id, wrapper.sessionId);
		this._logService.info(`[Copilot] Session created: ${session.toString()}`);
		return session;
	}

	async sendMessage(session: URI, prompt: string): Promise<void> {
		const sessionId = AgentSession.id(session);
		this._logService.info(`[Copilot:${sessionId}] sendMessage called: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}"`);
		const entry = this._sessions.get(sessionId) ?? await this._resumeSession(sessionId);
		this._logService.info(`[Copilot:${sessionId}] Found session wrapper, calling session.send()...`);
		await entry.session.send({ prompt });
		this._logService.info(`[Copilot:${sessionId}] session.send() returned`);
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
	}

	async shutdown(): Promise<void> {
		this._logService.info('[Copilot] Shutting down...');
		this._sessions.clearAndDisposeAll();
		this._activeToolCalls.clear();
		await this._client?.stop();
		this._client = undefined;
	}

	/**
	 * Returns true if this provider owns the given session ID.
	 */
	hasSession(session: URI): boolean {
		return this._sessions.has(AgentSession.id(session));
	}

	// ---- helpers ------------------------------------------------------------

	private _clearToolCallsForSession(sessionId: string): void {
		const prefix = `${sessionId}:`;
		for (const key of this._activeToolCalls.keys()) {
			if (key.startsWith(prefix)) {
				this._activeToolCalls.delete(key);
			}
		}
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
				totalResponseSizeBytes: e.data.totalResponseSizeBytes,
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
			this._onDidSessionProgress.fire({
				session,
				type: 'tool_complete',
				toolCallId: e.data.toolCallId,
				success: e.data.success,
				pastTenseMessage: getPastTenseMessage(tracked?.toolName ?? '', displayName, tracked?.parameters, e.data.success),
				toolOutput,
				isUserRequested: e.data.isUserRequested,
				result: e.data.result,
				error: e.data.error,
				toolTelemetry: e.data.toolTelemetry !== undefined ? tryStringify(e.data.toolTelemetry) : undefined,
				parentToolCallId: e.data.parentToolCallId,
			});
		});

		wrapper.onIdle(() => {
			this._logService.info(`[Copilot:${rawId}] Session idle`);
			this._onDidSessionProgress.fire({ session, type: 'idle' });
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

		wrapper.onSessionError(e => {
			this._logService.error(`[Copilot:${sessionId}] Session error: ${e.data.errorType} - ${e.data.message}`);
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

		wrapper.onReasoningDelta(e => {
			this._logService.trace(`[Copilot:${sessionId}] Reasoning delta: ${e.data.deltaContent.length} chars`);
		});

		wrapper.onTurnEnd(e => {
			this._logService.trace(`[Copilot:${sessionId}] Turn ended: ${e.data.turnId}`);
		});

		wrapper.onUsage(e => {
			this._logService.trace(`[Copilot:${sessionId}] Usage: model=${e.data.model}, in=${e.data.inputTokens ?? '?'}, out=${e.data.outputTokens ?? '?'}, cacheRead=${e.data.cacheReadTokens ?? '?'}`);
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
		const raw = await client.resumeSession(sessionId);
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
				result.push({
					session,
					type: 'tool_complete',
					toolCallId: d.toolCallId,
					success: d.success,
					pastTenseMessage: getPastTenseMessage(info.toolName, displayName, info.parameters, d.success),
					toolOutput: d.error?.message ?? d.result?.content,
					isUserRequested: d.isUserRequested,
					result: d.result,
					error: d.error,
					toolTelemetry: d.toolTelemetry !== undefined ? tryStringify(d.toolTelemetry) : undefined,
				});
			}
		}
		return result;
	}

	override dispose(): void {
		this._client?.stop().catch(() => { /* best-effort */ });
		super.dispose();
	}
}
