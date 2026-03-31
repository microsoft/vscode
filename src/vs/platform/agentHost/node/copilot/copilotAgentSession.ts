/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { PermissionRequest, PermissionRequestResult } from '@github/copilot-sdk';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, IReference, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { extUriBiasedIgnorePathCase, normalizePath } from '../../../../base/common/resources.js';
import { IFileService } from '../../../files/common/files.js';
import { ILogService } from '../../../log/common/log.js';
import { localize } from '../../../../nls.js';
import { IAgentAttachment, IAgentMessageEvent, IAgentProgressEvent, IAgentToolCompleteEvent, IAgentToolStartEvent } from '../../common/agentService.js';
import { ISessionDatabase, ISessionDataService } from '../../common/sessionDataService.js';
import { ToolResultContentType, type IPendingMessage, type IToolResultContent } from '../../common/state/sessionState.js';
import { CopilotSessionWrapper } from './copilotSessionWrapper.js';
import { getEditFilePath, getInvocationMessage, getPastTenseMessage, getShellLanguage, getToolDisplayName, getToolInputString, getToolKind, isEditTool, isHiddenTool } from './copilotToolDisplay.js';
import { FileEditTracker } from './fileEditTracker.js';
import { mapSessionEvents } from './mapSessionEvents.js';

/**
 * Factory function that produces a {@link CopilotSessionWrapper}.
 * Called by {@link CopilotAgentSession.initializeSession} with the
 * session's permission handler and edit-tracking hooks so the factory
 * can wire them into the SDK session it creates.
 *
 * In production, the factory calls `CopilotClient.createSession()` or
 * `resumeSession()`. In tests, it returns a mock wrapper directly.
 */
export type SessionWrapperFactory = (callbacks: {
	readonly onPermissionRequest: (request: PermissionRequest) => Promise<PermissionRequestResult>;
	readonly hooks: {
		readonly onPreToolUse: (input: { toolName: string; toolArgs: unknown }) => Promise<void>;
		readonly onPostToolUse: (input: { toolName: string; toolArgs: unknown }) => Promise<void>;
	};
}) => Promise<CopilotSessionWrapper>;

function tryStringify(value: unknown): string | undefined {
	try {
		return JSON.stringify(value);
	} catch {
		return undefined;
	}
}

/**
 * Derives display fields from a permission request for the tool confirmation UI.
 */
function getPermissionDisplay(request: { kind: string;[key: string]: unknown }): {
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

/**
 * Encapsulates a single Copilot SDK session and all its associated bookkeeping.
 *
 * Created by {@link CopilotAgent}, one instance per active session. Disposing
 * this class tears down all per-session resources (SDK wrapper, edit tracker,
 * database reference, pending permissions).
 */
export class CopilotAgentSession extends Disposable {
	readonly sessionId: string;
	readonly sessionUri: URI;

	/** Tracks active tool invocations so we can produce past-tense messages on completion. */
	private readonly _activeToolCalls = new Map<string, { toolName: string; displayName: string; parameters: Record<string, unknown> | undefined }>();
	/** Pending permission requests awaiting a renderer-side decision. */
	private readonly _pendingPermissions = new Map<string, DeferredPromise<boolean>>();
	/** File edit tracker for this session. */
	private readonly _editTracker: FileEditTracker;
	/** Session database reference. */
	private readonly _databaseRef: IReference<ISessionDatabase>;
	/** Turn ID tracked across tool events. */
	private _turnId = '';
	/** SDK session wrapper, set by {@link initializeSession}. */
	private _wrapper!: CopilotSessionWrapper;

	private readonly _workingDirectory: URI | undefined;

	constructor(
		sessionUri: URI,
		rawSessionId: string,
		workingDirectory: URI | undefined,
		private readonly _onDidSessionProgress: Emitter<IAgentProgressEvent>,
		private readonly _wrapperFactory: SessionWrapperFactory,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
		@ISessionDataService sessionDataService: ISessionDataService,
	) {
		super();
		this.sessionId = rawSessionId;
		this.sessionUri = sessionUri;
		this._workingDirectory = workingDirectory;

		this._databaseRef = sessionDataService.openDatabase(sessionUri);
		this._register(toDisposable(() => this._databaseRef.dispose()));

		this._editTracker = new FileEditTracker(sessionUri.toString(), this._databaseRef.object, this._fileService, this._logService);

		this._register(toDisposable(() => this._denyPendingPermissions()));
	}

	/**
	 * Creates (or resumes) the SDK session via the injected factory and
	 * wires up all event listeners. Must be called exactly once after
	 * construction before using the session.
	 */
	async initializeSession(): Promise<void> {
		this._wrapper = this._register(await this._wrapperFactory({
			onPermissionRequest: request => this.handlePermissionRequest(request),
			hooks: {
				onPreToolUse: async input => {
					if (isEditTool(input.toolName)) {
						const filePath = getEditFilePath(input.toolArgs);
						if (filePath) {
							await this._editTracker.trackEditStart(filePath);
						}
					}
				},
				onPostToolUse: async input => {
					if (isEditTool(input.toolName)) {
						const filePath = getEditFilePath(input.toolArgs);
						if (filePath) {
							await this._editTracker.completeEdit(filePath);
						}
					}
				},
			},
		}));
		this._subscribeToEvents();
		this._subscribeForLogging();
	}

	// ---- session operations -------------------------------------------------

	async send(prompt: string, attachments?: IAgentAttachment[]): Promise<void> {
		this._logService.info(`[Copilot:${this.sessionId}] sendMessage called: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}" (${attachments?.length ?? 0} attachments)`);

		const sdkAttachments = attachments?.map(a => {
			if (a.type === 'selection') {
				return { type: 'selection' as const, filePath: a.path, displayName: a.displayName ?? a.path, text: a.text, selection: a.selection };
			}
			return { type: a.type, path: a.path, displayName: a.displayName };
		});
		if (sdkAttachments?.length) {
			this._logService.trace(`[Copilot:${this.sessionId}] Attachments: ${JSON.stringify(sdkAttachments.map(a => ({ type: a.type, path: a.type === 'selection' ? a.filePath : a.path })))}`);
		}

		await this._wrapper.session.send({ prompt, attachments: sdkAttachments });
		this._logService.info(`[Copilot:${this.sessionId}] session.send() returned`);
	}

	async sendSteering(steeringMessage: IPendingMessage): Promise<void> {
		this._logService.info(`[Copilot:${this.sessionId}] Sending steering message: "${steeringMessage.userMessage.text.substring(0, 100)}"`);
		try {
			await this._wrapper.session.send({
				prompt: steeringMessage.userMessage.text,
				mode: 'immediate',
			});
			this._onDidSessionProgress.fire({
				session: this.sessionUri,
				type: 'steering_consumed',
				id: steeringMessage.id,
			});
		} catch (err) {
			this._logService.error(`[Copilot:${this.sessionId}] Steering message failed`, err);
		}
	}

	async getMessages(): Promise<(IAgentMessageEvent | IAgentToolStartEvent | IAgentToolCompleteEvent)[]> {
		const events = await this._wrapper.session.getMessages();
		let db: ISessionDatabase | undefined;
		try {
			db = this._databaseRef.object;
		} catch {
			// Database may not exist yet — that's fine
		}
		return mapSessionEvents(this.sessionUri, db, events);
	}

	async abort(): Promise<void> {
		this._logService.info(`[Copilot:${this.sessionId}] Aborting session...`);
		this._denyPendingPermissions();
		await this._wrapper.session.abort();
	}

	async setModel(model: string): Promise<void> {
		this._logService.info(`[Copilot:${this.sessionId}] Changing model to: ${model}`);
		await this._wrapper.session.setModel(model);
	}

	// ---- permission handling ------------------------------------------------

	/**
	 * Handles a permission request from the SDK by firing a `tool_ready` event
	 * (which transitions the tool to PendingConfirmation) and waiting for the
	 * side-effects layer to respond via {@link respondToPermissionRequest}.
	 */
	async handlePermissionRequest(
		request: PermissionRequest,
	): Promise<PermissionRequestResult> {
		this._logService.info(`[Copilot:${this.sessionId}] Permission request: kind=${request.kind}`);

		// Auto-approve reads inside the working directory
		if (request.kind === 'read') {
			const requestPath = typeof request.path === 'string' ? request.path : undefined;
			if (requestPath && this._workingDirectory && extUriBiasedIgnorePathCase.isEqualOrParent(normalizePath(URI.file(requestPath)), this._workingDirectory)) {
				this._logService.trace(`[Copilot:${this.sessionId}] Auto-approving read inside working directory: ${requestPath}`);
				return { kind: 'approved' };
			}
		}

		const toolCallId = request.toolCallId;
		if (!toolCallId) {
			// TODO: handle permission requests without a toolCallId by creating a synthetic tool call
			this._logService.warn(`[Copilot:${this.sessionId}] Permission request without toolCallId, auto-denying: kind=${request.kind}`);
			return { kind: 'denied-interactively-by-user' };
		}

		this._logService.info(`[Copilot:${this.sessionId}] Requesting confirmation for tool call: ${toolCallId}`);

		const deferred = new DeferredPromise<boolean>();
		this._pendingPermissions.set(toolCallId, deferred);

		// Derive display information from the permission request kind
		const { confirmationTitle, invocationMessage, toolInput } = getPermissionDisplay(request);

		// Fire a tool_ready event to transition the tool to PendingConfirmation
		this._onDidSessionProgress.fire({
			session: this.sessionUri,
			type: 'tool_ready',
			toolCallId,
			invocationMessage,
			toolInput,
			confirmationTitle,
			permissionKind: request.kind,
			permissionPath: typeof request.path === 'string' ? request.path : (typeof request.fileName === 'string' ? request.fileName : undefined),
		});

		const approved = await deferred.p;
		this._logService.info(`[Copilot:${this.sessionId}] Permission response: toolCallId=${toolCallId}, approved=${approved}`);
		return { kind: approved ? 'approved' : 'denied-interactively-by-user' };
	}

	respondToPermissionRequest(requestId: string, approved: boolean): boolean {
		const deferred = this._pendingPermissions.get(requestId);
		if (deferred) {
			this._pendingPermissions.delete(requestId);
			deferred.complete(approved);
			return true;
		}
		return false;
	}

	// ---- event wiring -------------------------------------------------------

	private _subscribeToEvents(): void {
		const wrapper = this._wrapper;
		const sessionId = this.sessionId;
		const session = this.sessionUri;

		this._register(wrapper.onMessageDelta(e => {
			this._logService.trace(`[Copilot:${sessionId}] delta: ${e.data.deltaContent}`);
			this._onDidSessionProgress.fire({
				session,
				type: 'delta',
				messageId: e.data.messageId,
				content: e.data.deltaContent,
				parentToolCallId: e.data.parentToolCallId,
			});
		}));

		this._register(wrapper.onMessage(e => {
			this._logService.info(`[Copilot:${sessionId}] Full message received: ${e.data.content.length} chars`);
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
		}));

		this._register(wrapper.onToolStart(e => {
			if (isHiddenTool(e.data.toolName)) {
				this._logService.trace(`[Copilot:${sessionId}] Tool started (hidden): ${e.data.toolName}`);
				return;
			}
			this._logService.info(`[Copilot:${sessionId}] Tool started: ${e.data.toolName}`);
			const toolArgs = e.data.arguments !== undefined ? tryStringify(e.data.arguments) : undefined;
			let parameters: Record<string, unknown> | undefined;
			if (toolArgs) {
				try { parameters = JSON.parse(toolArgs) as Record<string, unknown>; } catch { /* ignore */ }
			}
			const displayName = getToolDisplayName(e.data.toolName);
			this._activeToolCalls.set(e.data.toolCallId, { toolName: e.data.toolName, displayName, parameters });
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
		}));

		this._register(wrapper.onTurnStart(e => {
			this._turnId = e.data.turnId;
		}));

		this._register(wrapper.onToolComplete(e => {
			const tracked = this._activeToolCalls.get(e.data.toolCallId);
			if (!tracked) {
				return;
			}
			this._logService.info(`[Copilot:${sessionId}] Tool completed: ${e.data.toolCallId}`);
			this._activeToolCalls.delete(e.data.toolCallId);
			const displayName = tracked.displayName;
			const toolOutput = e.data.error?.message ?? e.data.result?.content;

			const content: IToolResultContent[] = [];
			if (toolOutput !== undefined) {
				content.push({ type: ToolResultContentType.Text, text: toolOutput });
			}

			// File edit data was already prepared by the onPostToolUse hook
			const filePath = isEditTool(tracked.toolName) ? getEditFilePath(tracked.parameters) : undefined;
			if (filePath) {
				const fileEdit = this._editTracker.takeCompletedEdit(this._turnId, e.data.toolCallId, filePath);
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
		}));

		this._register(wrapper.onIdle(() => {
			this._logService.info(`[Copilot:${sessionId}] Session idle`);
			this._onDidSessionProgress.fire({ session, type: 'idle' });
		}));

		this._register(wrapper.onSessionError(e => {
			this._logService.error(`[Copilot:${sessionId}] Session error: ${e.data.errorType} - ${e.data.message}`);
			this._onDidSessionProgress.fire({
				session,
				type: 'error',
				errorType: e.data.errorType,
				message: e.data.message,
				stack: e.data.stack,
			});
		}));

		this._register(wrapper.onUsage(e => {
			this._logService.trace(`[Copilot:${sessionId}] Usage: model=${e.data.model}, in=${e.data.inputTokens ?? '?'}, out=${e.data.outputTokens ?? '?'}, cacheRead=${e.data.cacheReadTokens ?? '?'}`);
			this._onDidSessionProgress.fire({
				session,
				type: 'usage',
				inputTokens: e.data.inputTokens,
				outputTokens: e.data.outputTokens,
				model: e.data.model,
				cacheReadTokens: e.data.cacheReadTokens,
			});
		}));

		this._register(wrapper.onReasoningDelta(e => {
			this._logService.trace(`[Copilot:${sessionId}] Reasoning delta: ${e.data.deltaContent.length} chars`);
			this._onDidSessionProgress.fire({
				session,
				type: 'reasoning',
				content: e.data.deltaContent,
			});
		}));
	}

	private _subscribeForLogging(): void {
		const wrapper = this._wrapper;
		const sessionId = this.sessionId;

		this._register(wrapper.onSessionStart(e => {
			this._logService.trace(`[Copilot:${sessionId}] Session started: model=${e.data.selectedModel ?? 'default'}, producer=${e.data.producer}`);
		}));

		this._register(wrapper.onSessionResume(e => {
			this._logService.trace(`[Copilot:${sessionId}] Session resumed: eventCount=${e.data.eventCount}`);
		}));

		this._register(wrapper.onSessionInfo(e => {
			this._logService.trace(`[Copilot:${sessionId}] Session info [${e.data.infoType}]: ${e.data.message}`);
		}));

		this._register(wrapper.onSessionModelChange(e => {
			this._logService.trace(`[Copilot:${sessionId}] Model changed: ${e.data.previousModel ?? '(none)'} -> ${e.data.newModel}`);
		}));

		this._register(wrapper.onSessionHandoff(e => {
			this._logService.trace(`[Copilot:${sessionId}] Session handoff: sourceType=${e.data.sourceType}, remoteSessionId=${e.data.remoteSessionId ?? '(none)'}`);
		}));

		this._register(wrapper.onSessionTruncation(e => {
			this._logService.trace(`[Copilot:${sessionId}] Session truncation: removed ${e.data.tokensRemovedDuringTruncation} tokens, ${e.data.messagesRemovedDuringTruncation} messages`);
		}));

		this._register(wrapper.onSessionSnapshotRewind(e => {
			this._logService.trace(`[Copilot:${sessionId}] Snapshot rewind: upTo=${e.data.upToEventId}, eventsRemoved=${e.data.eventsRemoved}`);
		}));

		this._register(wrapper.onSessionShutdown(e => {
			this._logService.trace(`[Copilot:${sessionId}] Session shutdown: type=${e.data.shutdownType}, premiumRequests=${e.data.totalPremiumRequests}, apiDuration=${e.data.totalApiDurationMs}ms`);
		}));

		this._register(wrapper.onSessionUsageInfo(e => {
			this._logService.trace(`[Copilot:${sessionId}] Usage info: ${e.data.currentTokens}/${e.data.tokenLimit} tokens, ${e.data.messagesLength} messages`);
		}));

		this._register(wrapper.onSessionCompactionStart(() => {
			this._logService.trace(`[Copilot:${sessionId}] Compaction started`);
		}));

		this._register(wrapper.onSessionCompactionComplete(e => {
			this._logService.trace(`[Copilot:${sessionId}] Compaction complete: success=${e.data.success}, tokensRemoved=${e.data.tokensRemoved ?? '?'}`);
		}));

		this._register(wrapper.onUserMessage(e => {
			this._logService.trace(`[Copilot:${sessionId}] User message: ${e.data.content.length} chars, ${e.data.attachments?.length ?? 0} attachments`);
		}));

		this._register(wrapper.onPendingMessagesModified(() => {
			this._logService.trace(`[Copilot:${sessionId}] Pending messages modified`);
		}));

		this._register(wrapper.onTurnStart(e => {
			this._logService.trace(`[Copilot:${sessionId}] Turn started: ${e.data.turnId}`);
		}));

		this._register(wrapper.onIntent(e => {
			this._logService.trace(`[Copilot:${sessionId}] Intent: ${e.data.intent}`);
		}));

		this._register(wrapper.onReasoning(e => {
			this._logService.trace(`[Copilot:${sessionId}] Reasoning: ${e.data.content.length} chars`);
		}));

		this._register(wrapper.onTurnEnd(e => {
			this._logService.trace(`[Copilot:${sessionId}] Turn ended: ${e.data.turnId}`);
		}));

		this._register(wrapper.onAbort(e => {
			this._logService.trace(`[Copilot:${sessionId}] Aborted: ${e.data.reason}`);
		}));

		this._register(wrapper.onToolUserRequested(e => {
			this._logService.trace(`[Copilot:${sessionId}] Tool user-requested: ${e.data.toolName} (${e.data.toolCallId})`);
		}));

		this._register(wrapper.onToolPartialResult(e => {
			this._logService.trace(`[Copilot:${sessionId}] Tool partial result: ${e.data.toolCallId} (${e.data.partialOutput.length} chars)`);
		}));

		this._register(wrapper.onToolProgress(e => {
			this._logService.trace(`[Copilot:${sessionId}] Tool progress: ${e.data.toolCallId} - ${e.data.progressMessage}`);
		}));

		this._register(wrapper.onSkillInvoked(e => {
			this._logService.trace(`[Copilot:${sessionId}] Skill invoked: ${e.data.name} (${e.data.path})`);
		}));

		this._register(wrapper.onSubagentStarted(e => {
			this._logService.trace(`[Copilot:${sessionId}] Subagent started: ${e.data.agentName} (${e.data.agentDisplayName})`);
		}));

		this._register(wrapper.onSubagentCompleted(e => {
			this._logService.trace(`[Copilot:${sessionId}] Subagent completed: ${e.data.agentName}`);
		}));

		this._register(wrapper.onSubagentFailed(e => {
			this._logService.error(`[Copilot:${sessionId}] Subagent failed: ${e.data.agentName} - ${e.data.error}`);
		}));

		this._register(wrapper.onSubagentSelected(e => {
			this._logService.trace(`[Copilot:${sessionId}] Subagent selected: ${e.data.agentName}`);
		}));

		this._register(wrapper.onHookStart(e => {
			this._logService.trace(`[Copilot:${sessionId}] Hook started: ${e.data.hookType} (${e.data.hookInvocationId})`);
		}));

		this._register(wrapper.onHookEnd(e => {
			this._logService.trace(`[Copilot:${sessionId}] Hook ended: ${e.data.hookType} (${e.data.hookInvocationId}), success=${e.data.success}`);
		}));

		this._register(wrapper.onSystemMessage(e => {
			this._logService.trace(`[Copilot:${sessionId}] System message [${e.data.role}]: ${e.data.content.length} chars`);
		}));
	}

	// ---- cleanup ------------------------------------------------------------

	private _denyPendingPermissions(): void {
		for (const [, deferred] of this._pendingPermissions) {
			deferred.complete(false);
		}
		this._pendingPermissions.clear();
	}
}
