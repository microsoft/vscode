/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { PermissionRequestResult, Tool, ToolResultObject } from '@github/copilot-sdk';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, IReference, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../log/common/log.js';
import { IAgentAttachment, IAgentMessageEvent, IAgentProgressEvent, IAgentSubagentStartedEvent, IAgentToolCompleteEvent, IAgentToolStartEvent } from '../../common/agentService.js';
import { ISessionDatabase, ISessionDataService } from '../../common/sessionDataService.js';
import { SessionInputAnswerState, SessionInputAnswerValueKind, SessionInputQuestionKind, SessionInputResponseKind, ToolResultContentType, type ISessionInputAnswer, type ISessionInputRequest, type IPendingMessage, type IToolCallResult, type IToolResultContent } from '../../common/state/sessionState.js';
import { CopilotSessionWrapper } from './copilotSessionWrapper.js';
import { getEditFilePath, getInvocationMessage, getPastTenseMessage, getPermissionDisplay, getShellLanguage, getToolDisplayName, getToolInputString, getToolKind, isEditTool, isHiddenTool, isShellTool, tryStringify, type ITypedPermissionRequest } from './copilotToolDisplay.js';
import { FileEditTracker } from './fileEditTracker.js';
import { mapSessionEvents } from './mapSessionEvents.js';
import type { ShellManager } from './copilotShellTools.js';
import type { IToolDefinition } from '../../common/state/protocol/state.js';
import type { IParsedPlugin } from '../../../agentPlugins/common/pluginParsers.js';

/**
 * Immutable snapshot of the active client's contributions at session creation
 * time. Used to detect when the session needs to be refreshed.
 */
export interface IActiveClientSnapshot {
	readonly clientId: string;
	readonly tools: readonly IToolDefinition[];
	readonly plugins: readonly IParsedPlugin[];
}

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
	readonly onPermissionRequest: (request: ITypedPermissionRequest) => Promise<PermissionRequestResult>;
	readonly onUserInputRequest: (request: IUserInputRequest, invocation: { sessionId: string }) => Promise<IUserInputResponse>;
	readonly hooks: {
		readonly onPreToolUse: (input: { toolName: string; toolArgs: unknown }) => Promise<void>;
		readonly onPostToolUse: (input: { toolName: string; toolArgs: unknown }) => Promise<void>;
	};
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	readonly clientTools: Tool<any>[];
}) => Promise<CopilotSessionWrapper>;

/** Matches the SDK's `UserInputRequest` which is not re-exported from the package entry point. */
interface IUserInputRequest {
	question: string;
	choices?: string[];
	allowFreeform?: boolean;
}

/** Matches the SDK's `UserInputResponse` which is not re-exported from the package entry point. */
interface IUserInputResponse {
	answer: string;
	wasFreeform: boolean;
}

/**
 * Options for constructing a {@link CopilotAgentSession}.
 */
export interface ICopilotAgentSessionOptions {
	readonly sessionUri: URI;
	readonly rawSessionId: string;
	readonly onDidSessionProgress: Emitter<IAgentProgressEvent>;
	readonly wrapperFactory: SessionWrapperFactory;
	readonly shellManager: ShellManager | undefined;
	/** Snapshot of the active client's tools and plugins at session creation time. */
	readonly clientSnapshot?: IActiveClientSnapshot;
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
	private readonly _activeToolCalls = new Map<string, { toolName: string; displayName: string; parameters: Record<string, unknown> | undefined; content: IToolResultContent[] }>();
	/** Pending permission requests awaiting a renderer-side decision. */
	private readonly _pendingPermissions = new Map<string, DeferredPromise<boolean>>();
	/** Pending user input requests awaiting a renderer-side answer. */
	private readonly _pendingUserInputs = new Map<string, { deferred: DeferredPromise<{ response: SessionInputResponseKind; answers?: Record<string, ISessionInputAnswer> }>; questionId: string }>();
	/** File edit tracker for this session. */
	private readonly _editTracker: FileEditTracker;
	/** Session database reference. */
	private readonly _databaseRef: IReference<ISessionDatabase>;
	/** Protocol turn ID set by {@link send}, used for file edit tracking. */
	private _turnId = '';
	/** SDK session wrapper, set by {@link initializeSession}. */
	private _wrapper!: CopilotSessionWrapper;

	/** Snapshot captured at session creation for refresh detection. */
	private readonly _appliedSnapshot: IActiveClientSnapshot;
	/** Tool names that are client-provided, derived from snapshot. */
	private readonly _clientToolNames: ReadonlySet<string>;
	/** Deferred promises for pending client tool calls, keyed by toolCallId. */
	private readonly _pendingClientToolCalls = new Map<string, DeferredPromise<ToolResultObject>>();

	private readonly _onDidSessionProgress: Emitter<IAgentProgressEvent>;
	private readonly _wrapperFactory: SessionWrapperFactory;
	private readonly _shellManager: ShellManager | undefined;

	constructor(
		options: ICopilotAgentSessionOptions,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
		@ISessionDataService sessionDataService: ISessionDataService,
	) {
		super();
		this.sessionId = options.rawSessionId;
		this.sessionUri = options.sessionUri;
		this._onDidSessionProgress = options.onDidSessionProgress;
		this._wrapperFactory = options.wrapperFactory;
		this._shellManager = options.shellManager;

		this._appliedSnapshot = options.clientSnapshot ?? { clientId: '', tools: [], plugins: [] };
		this._clientToolNames = new Set(this._appliedSnapshot.tools.map(t => t.name));

		this._databaseRef = sessionDataService.openDatabase(options.sessionUri);
		this._register(toDisposable(() => this._databaseRef.dispose()));

		this._editTracker = this._instantiationService.createInstance(FileEditTracker, options.sessionUri.toString(), this._databaseRef.object);

		this._register(toDisposable(() => this._denyPendingPermissions()));
		this._register(toDisposable(() => this._shellManager?.dispose()));
		this._register(toDisposable(() => this._cancelPendingUserInputs()));

		// When a shell tool associates a terminal with a tool call, fire a
		// tool_content_changed event so the UI can connect to the terminal
		// while the command is still running.
		if (this._shellManager) {
			this._register(this._shellManager.onDidAssociateTerminal(({ toolCallId, terminalUri, displayName }) => {
				const tracked = this._activeToolCalls.get(toolCallId);
				if (!tracked) {
					return;
				}

				tracked.content.push({
					type: ToolResultContentType.Terminal,
					resource: terminalUri,
					title: displayName,
				});

				this._onDidSessionProgress.fire({
					session: this.sessionUri,
					type: 'tool_content_changed',
					toolCallId,
					content: tracked.content,
				});
			}));
		}
		this._register(toDisposable(() => this._cancelPendingClientToolCalls()));
	}

	/**
	 * The snapshot of client contributions captured when this session was
	 * created. Used by the agent to detect when the session is 1stale.
	 */
	get appliedSnapshot(): IActiveClientSnapshot {
		return this._appliedSnapshot;
	}

	/**
	 * Creates SDK {@link Tool} objects for the client-provided tools in the
	 * applied snapshot. The handler creates a {@link DeferredPromise} and waits
	 * for the client to dispatch `session/toolCallComplete`.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	createClientSdkTools(): Tool<any>[] {
		const tools = this._appliedSnapshot.tools;
		if (tools.length === 0) {
			return [];
		}
		return tools.map(def => ({
			name: def.name,
			description: def.description ?? '',
			parameters: def.inputSchema ?? { type: 'object' as const, properties: {} },
			handler: async (_args: unknown, invocation: { toolCallId: string }) => {
				const deferred = new DeferredPromise<ToolResultObject>();
				this._pendingClientToolCalls.set(invocation.toolCallId, deferred);
				return deferred.p;
			},
		}));
	}

	/**
	 * Resolves a pending client tool call. Returns `true` if the
	 * toolCallId was found and handled.
	 */
	handleClientToolCallComplete(toolCallId: string, result: IToolCallResult): boolean {
		const deferred = this._pendingClientToolCalls.get(toolCallId);
		if (!deferred) {
			return false;
		}
		this._pendingClientToolCalls.delete(toolCallId);

		const textContent = result.content
			?.filter(c => c.type === 'text')
			.map(c => (c as { text: string }).text)
			.join('\n') ?? '';

		const binaryResults = result.content
			?.filter(c => c.type === 'embeddedResource')
			.map(c => {
				const embedded = c as { data: string; contentType: string };
				return { data: embedded.data, mimeType: embedded.contentType, type: embedded.contentType };
			});

		if (result.success) {
			deferred.complete({
				textResultForLlm: textContent,
				resultType: 'success',
				binaryResultsForLlm: binaryResults?.length ? binaryResults : undefined,
			});
		} else {
			deferred.complete({
				textResultForLlm: textContent || result.error?.message || 'Tool call failed',
				resultType: 'failure',
				error: result.error?.message,
				binaryResultsForLlm: binaryResults?.length ? binaryResults : undefined,
			});
		}
		return true;
	}

	/**
	 * Creates (or resumes) the SDK session via the injected factory and
	 * wires up all event listeners. Must be called exactly once after
	 * construction before using the session.
	 */
	async initializeSession(): Promise<void> {
		this._wrapper = this._register(await this._wrapperFactory({
			onPermissionRequest: request => this.handlePermissionRequest(request),
			onUserInputRequest: (request, invocation) => this.handleUserInputRequest(request, invocation),
			clientTools: this.createClientSdkTools(),
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

	async send(prompt: string, attachments?: IAgentAttachment[], turnId?: string): Promise<void> {
		if (turnId) {
			this._turnId = turnId;
		}
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

	async getMessages(): Promise<(IAgentMessageEvent | IAgentToolStartEvent | IAgentToolCompleteEvent | IAgentSubagentStartedEvent)[]> {
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

	/**
	 * Explicitly destroys the underlying SDK session and waits for cleanup
	 * to complete. Call this before {@link dispose} when you need to ensure
	 * the session's on-disk data is no longer locked (e.g. before
	 * truncation or fork operations that modify the session files).
	 */
	async destroySession(): Promise<void> {
		await this._wrapper.session.destroy();
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
		request: ITypedPermissionRequest,
	): Promise<PermissionRequestResult> {
		this._logService.info(`[Copilot:${this.sessionId}] Permission request: kind=${request.kind}`);

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
		const { confirmationTitle, invocationMessage, toolInput, permissionKind, permissionPath } = getPermissionDisplay(request);

		// Fire a tool_ready event to transition the tool to PendingConfirmation
		this._onDidSessionProgress.fire({
			session: this.sessionUri,
			type: 'tool_ready',
			toolCallId,
			invocationMessage,
			toolInput,
			confirmationTitle,
			permissionKind,
			permissionPath,
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

	// ---- user input handling ------------------------------------------------

	/**
	 * Handles a user input request from the SDK (ask_user tool) by firing a
	 * `user_input_request` progress event and waiting for the renderer to
	 * respond via {@link respondToUserInputRequest}.
	 */
	async handleUserInputRequest(
		request: IUserInputRequest,
		_invocation: { sessionId: string },
	): Promise<IUserInputResponse> {
		const requestId = generateUuid();
		const questionId = generateUuid();
		this._logService.info(`[Copilot:${this.sessionId}] User input request: requestId=${requestId}, question="${request.question.substring(0, 100)}"`);

		const deferred = new DeferredPromise<{ response: SessionInputResponseKind; answers?: Record<string, ISessionInputAnswer> }>();
		this._pendingUserInputs.set(requestId, { deferred, questionId });

		// Build the protocol ISessionInputRequest from the SDK's simple format
		const inputRequest: ISessionInputRequest = {
			id: requestId,
			message: request.question,
			questions: [request.choices && request.choices.length > 0
				? {
					kind: SessionInputQuestionKind.SingleSelect,
					id: questionId,
					message: request.question,
					required: true,
					options: request.choices.map(c => ({ id: c, label: c })),
					allowFreeformInput: request.allowFreeform ?? true,
				}
				: {
					kind: SessionInputQuestionKind.Text,
					id: questionId,
					message: request.question,
					required: true,
				},
			],
		};

		this._onDidSessionProgress.fire({
			session: this.sessionUri,
			type: 'user_input_request',
			request: inputRequest,
		});

		const result = await deferred.p;
		this._logService.info(`[Copilot:${this.sessionId}] User input response: requestId=${requestId}, response=${result.response}`);

		if (result.response !== SessionInputResponseKind.Accept || !result.answers) {
			return { answer: '', wasFreeform: true };
		}

		// Extract the answer for our single question
		const answer = result.answers[questionId];
		if (!answer || answer.state === SessionInputAnswerState.Skipped) {
			return { answer: '', wasFreeform: true };
		}

		const { value: val } = answer;
		if (val.kind === SessionInputAnswerValueKind.Text) {
			return { answer: val.value, wasFreeform: true };
		} else if (val.kind === SessionInputAnswerValueKind.Selected) {
			const wasFreeform = !request.choices?.includes(val.value);
			return { answer: val.value, wasFreeform };
		}

		return { answer: '', wasFreeform: true };
	}

	respondToUserInputRequest(requestId: string, response: SessionInputResponseKind, answers?: Record<string, ISessionInputAnswer>): boolean {
		const pending = this._pendingUserInputs.get(requestId);
		if (pending) {
			this._pendingUserInputs.delete(requestId);
			pending.deferred.complete({ response, answers });
			return true;
		}
		return false;
	}

	// ---- event wiring -------------------------------------------------------

	private _subscribeToEvents(): void {
		const wrapper = this._wrapper;
		const sessionId = this.sessionId;
		const session = this.sessionUri;

		// Capture SDK event IDs for each user.message event so we can map
		// protocol turn indices to the event IDs needed by the SDK's
		// history.truncate and sessions.fork RPCs.
		this._register(wrapper.onUserMessage(e => {
			if (this._turnId) {
				this._databaseRef.object.setTurnEventId(this._turnId, e.id);
			}
		}));

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
			this._activeToolCalls.set(e.data.toolCallId, { toolName: e.data.toolName, displayName, parameters, content: [] });
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
				toolClientId: this._clientToolNames.has(e.data.toolName) ? this._appliedSnapshot.clientId : undefined,
			});
		}));

		this._register(wrapper.onToolComplete(async e => {
			const tracked = this._activeToolCalls.get(e.data.toolCallId);
			if (!tracked) {
				return;
			}
			this._logService.info(`[Copilot:${sessionId}] Tool completed: ${e.data.toolCallId}`);
			this._activeToolCalls.delete(e.data.toolCallId);
			const displayName = tracked.displayName;
			const toolOutput = e.data.error?.message ?? e.data.result?.content;

			const content: IToolResultContent[] = [...tracked.content];
			if (toolOutput !== undefined) {
				content.push({ type: ToolResultContentType.Text, text: toolOutput });
			}

			const filePath = isEditTool(tracked.toolName) ? getEditFilePath(tracked.parameters) : undefined;
			if (filePath) {
				try {
					const fileEdit = await this._editTracker.takeCompletedEdit(this._turnId, e.data.toolCallId, filePath);
					if (fileEdit) {
						content.push(fileEdit);
					}
				} catch (err) {
					this._logService.warn(`[Copilot:${sessionId}] Failed to take completed edit`, err);
				}
			}

			// Add terminal content reference for shell tools (skip if already
			// added during onDidAssociateTerminal while the tool was running)
			if (isShellTool(tracked.toolName) && this._shellManager) {
				const terminalUri = this._shellManager.getTerminalUriForToolCall(e.data.toolCallId);
				if (terminalUri && !content.some(c => c.type === ToolResultContentType.Terminal && c.resource === terminalUri)) {
					content.push({
						type: ToolResultContentType.Terminal,
						resource: terminalUri,
						title: tracked.displayName,
					});
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

		this._register(wrapper.onSubagentStarted(e => {
			this._logService.info(`[Copilot:${sessionId}] Subagent started: toolCallId=${e.data.toolCallId}, agent=${e.data.agentName}`);
			this._onDidSessionProgress.fire({
				session,
				type: 'subagent_started',
				toolCallId: e.data.toolCallId,
				agentName: e.data.agentName,
				agentDisplayName: e.data.agentDisplayName,
				agentDescription: e.data.agentDescription,
			});
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

	// ---- SDK event ID tracking & truncation ---------------------------------

	/**
	 * Returns the SDK event ID for the turn inserted after the given turn,
	 * or `undefined` if it's the last turn.
	 */
	getNextTurnEventId(turnId: string): Promise<string | undefined> {
		return this._databaseRef.object.getNextTurnEventId(turnId);
	}

	/**
	 * Returns the SDK event ID of the earliest turn.
	 */
	getFirstTurnEventId(): Promise<string | undefined> {
		return this._databaseRef.object.getFirstTurnEventId();
	}

	/**
	 * Truncates the session history via the SDK's RPC and cleans up
	 * stale turns from the session database.
	 *
	 * @param eventId The SDK event ID at which to truncate. This event
	 *        and all events after it are removed.
	 * @param keepTurnId If provided, turns inserted after this turn are
	 *        deleted from the DB. If omitted, all turns are deleted.
	 */
	async truncateAtEventId(eventId: string, keepTurnId?: string): Promise<void> {
		this._logService.info(`[Copilot:${this.sessionId}] Truncating via SDK RPC at eventId=${eventId}`);
		const result = await this._wrapper.session.rpc.history.truncate({ eventId });
		this._logService.info(`[Copilot:${this.sessionId}] SDK truncation removed ${result.eventsRemoved} events`);

		// Clean up stale turns from our DB so getNextTurnEventId doesn't
		// return event IDs for turns that no longer exist in the SDK.
		if (keepTurnId) {
			await this._databaseRef.object.deleteTurnsAfter(keepTurnId);
		} else {
			await this._databaseRef.object.deleteAllTurns();
		}
	}

	/**
	 * Bulk-remaps turn IDs in this session's database.
	 * Used after file-copying a source session's database for a fork.
	 */
	async remapTurnIds(mapping: ReadonlyMap<string, string>): Promise<void> {
		await this._databaseRef.object.remapTurnIds(mapping);
	}

	// ---- cleanup ------------------------------------------------------------

	private _denyPendingPermissions(): void {
		for (const [, deferred] of this._pendingPermissions) {
			deferred.complete(false);
		}
		this._pendingPermissions.clear();
	}

	private _cancelPendingUserInputs(): void {
		for (const [, pending] of this._pendingUserInputs) {
			pending.deferred.complete({ response: SessionInputResponseKind.Cancel });
		}
		this._pendingUserInputs.clear();
	}

	private _cancelPendingClientToolCalls(): void {
		for (const [, deferred] of this._pendingClientToolCalls) {
			deferred.complete({ textResultForLlm: 'Tool call cancelled: session ended', resultType: 'failure', error: 'Session ended' });
		}
		this._pendingClientToolCalls.clear();
	}
}
