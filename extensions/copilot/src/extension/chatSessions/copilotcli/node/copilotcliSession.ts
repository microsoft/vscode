/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Attachment, SendOptions, Session, SessionOptions } from '@github/copilot/sdk';
import * as l10n from '@vscode/l10n';
import * as cp from 'child_process';
import * as crypto from 'crypto';
import type * as vscode from 'vscode';
import type { ChatParticipantToolToken } from 'vscode';
import { IAuthenticationService } from '../../../../platform/authentication/common/authentication';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { PermissiveAuthRequiredError } from '../../../../platform/github/common/githubService';
import { ILogService } from '../../../../platform/log/common/logService';
import { GenAiMetrics } from '../../../../platform/otel/common/genAiMetrics';
import { CopilotChatAttr, GenAiAttr, GenAiOperationName, IOTelService, ISpanHandle, SpanKind, SpanStatusCode, truncateForOTel, resolveWorkspaceOTelMetadata, workspaceMetadataToOTelAttributes } from '../../../../platform/otel/common/index';
import { CapturingToken } from '../../../../platform/requestLogger/common/capturingToken';
import { IRequestLogger, LoggedRequestKind } from '../../../../platform/requestLogger/common/requestLogger';
import { PromptTokenCategory, PromptTokenLabel } from '../../../../platform/tokenizer/node/promptTokenDetails';
import { IGitService } from '../../../../platform/git/common/gitService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { raceCancellation } from '../../../../util/vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from '../../../../util/vs/base/common/cancellation';
import { Codicon } from '../../../../util/vs/base/common/codicons';
import { Emitter } from '../../../../util/vs/base/common/event';
import { DisposableStore, IDisposable, toDisposable } from '../../../../util/vs/base/common/lifecycle';
import { truncate } from '../../../../util/vs/base/common/strings';
import { ThemeIcon } from '../../../../util/vs/base/common/themables';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { ChatResponseMarkdownPart, ChatResponseThinkingProgressPart, ChatSessionStatus, ChatToolInvocationPart, EventEmitter, MarkdownString, Uri } from '../../../../vscodeTypes';
import { IToolsService } from '../../../tools/common/toolsService';
import { IChatSessionMetadataStore } from '../../common/chatSessionMetadataStore';
import { ExternalEditTracker } from '../../common/externalEditTracker';
import { getWorkingDirectory, isIsolationEnabled, IWorkspaceInfo } from '../../common/workspaceInfo';
import { clearTodoList, enrichToolInvocationWithSubagentMetadata, isCopilotCliEditToolCall, isCopilotCLIToolThatCouldRequirePermissions, isTodoRelatedSqlQuery, processToolExecutionComplete, processToolExecutionStart, stripReminders, ToolCall, updateTodoListFromSqlItems } from '../common/copilotCLITools';
import { clearPendingCopilotCLIRequestContext, setPendingCopilotCLIRequestContext } from '../common/pendingRequestContext';
import { getCopilotCLISessionDir } from './cliHelpers';
import { SessionIdForCLI } from '../common/utils';
import type { CopilotCliBridgeSpanProcessor } from './copilotCliBridgeSpanProcessor';
import { ICopilotCLIImageSupport } from './copilotCLIImageSupport';
import { handleExitPlanMode } from './exitPlanModeHandler';
import { type McCommand, type McEvent, type McSessionCreateResult, MissionControlApiClient } from './missionControlApiClient';
import { handleMcpPermission, handleReadPermission, handleShellPermission, handleWritePermission, type PermissionRequest, type PermissionRequestResult, showInteractivePermissionPrompt } from './permissionHelpers';
import { TodoSqlQuery } from './todoSqlQuery';
import { IQuestion, IQuestionAnswer, IUserQuestionHandler } from './userInputHelpers';

/**
 * Known commands that can be sent to a CopilotCLI session instead of a free-form prompt.
 */
export type CopilotCLICommand = 'compact' | 'plan' | 'fleet' | 'remote';

/**
 * The set of all known CopilotCLI commands.  Used by callers that need to
 * distinguish a slash-command from a regular prompt at runtime.
 */
export const copilotCLICommands: readonly CopilotCLICommand[] = ['compact', 'plan', 'fleet', 'remote'] as const;

/**
 * Shared Mission Control state keyed by SDK session ID.
 * CopilotCLISession instances are recreated per request, so MC state
 * must be stored externally to persist across turns.
 */
interface McSharedState {
	mcSessionId: string;
	mcFrontendUrl?: string;
	mcEventBuffer: McEvent[];
	mcCompletedCommandIds: string[];
	mcPendingPermissionRequests: Map<string, { resolve(result: PermissionRequestResult): void }>;
	mcPendingUserInputRequests?: Set<McPendingUserInputRequest>;
	mcFlushInterval: ReturnType<typeof setInterval> | undefined;
	mcPollInterval: ReturnType<typeof setInterval> | undefined;
	mcLastEventId: string | null;
	mcLastSubmitAttemptTimeMs: number;
	mcProcessedCommandIds: Set<string>;
	mcPendingCommandCompletionIds?: Set<string>;
	/** Reference to the SDK session for steering from the command poller. */
	mcSdkSession: Session;
	/** Dispose function for the persistent on('*') listener for MC events. */
	mcEventListenerDispose: (() => void) | undefined;
	/** VS Code session resource URI for routing steering through the chat UI. */
	mcSessionResource: import('vscode').Uri;
}
const mcStateBySessionId = new Map<string, McSharedState>();

const MISSION_CONTROL_KEEPALIVE_INTERVAL_MS = 10_000;

interface McPermissionResponseCommandData {
	readonly promptId?: string;
	readonly approved?: boolean;
	readonly scope?: 'once' | 'session';
}

interface UserInputResponse {
	readonly answer: string;
	readonly wasFreeform: boolean;
}

interface McPendingUserInputRequest {
	readonly requestId: string;
	readonly toolCallId?: string;
	resolve(result: UserInputResponse | undefined): void;
}

interface McAskUserResponsePayload {
	readonly requestId?: string;
	readonly promptId?: string;
	readonly toolCallId?: string;
	readonly answer?: string;
	readonly wasFreeform?: boolean;
	readonly freeText?: string | null;
	readonly selected?: readonly string[];
	readonly skipped?: boolean;
	readonly response?: {
		readonly answer?: string;
		readonly wasFreeform?: boolean;
		readonly freeText?: string | null;
		readonly selected?: readonly string[];
		readonly skipped?: boolean;
	};
}

const skippedMissionControlEventTypes = new Set([
	'assistant.message_delta',
	'assistant.streaming_delta',
	'session.shutdown',
	'session.error',
	'session.usage_info',
	'assistant.usage',
	'pending_messages.modified',
	'session.mcp_server_status_changed',
	'session.mcp_servers_loaded',
	'session.skills_loaded',
	'session.tools_updated',
]);

function shouldForwardMissionControlEvent(event: { type?: string; data?: unknown }): boolean {
	const eventType = event.type ?? 'unknown';
	if (skippedMissionControlEventTypes.has(eventType)) {
		return false;
	}

	if (eventType === 'tool.execution_start' || eventType === 'tool.execution_complete') {
		const toolName = typeof event.data === 'object' && event.data !== null && 'toolName' in event.data
			? event.data.toolName
			: undefined;
		if (toolName === 'report_intent') {
			return false;
		}
	}

	return true;
}

function getMissionControlCommandIdFromEvent(event: { type?: string; data?: unknown }): string | undefined {
	if (event.type !== 'user.message') {
		return undefined;
	}

	const source = typeof event.data === 'object' && event.data !== null && 'source' in event.data
		? event.data.source
		: undefined;
	return typeof source === 'string' && source.startsWith('command-')
		? source.slice('command-'.length)
		: undefined;
}

function getMissionControlSessionTitleFromEvent(event: { type?: string; data?: unknown }): string | undefined {
	if (event.type !== 'session.title_changed') {
		return undefined;
	}

	const title = typeof event.data === 'object' && event.data !== null && 'title' in event.data
		? event.data.title
		: undefined;
	return typeof title === 'string' && title.trim().length > 0 ? title : undefined;
}

function getMissionControlEventData(event: { type?: string; data?: unknown }): Record<string, unknown> {
	if (!event.data || typeof event.data !== 'object') {
		return {};
	}

	const data = event.data as Record<string, unknown>;
	if (event.type === 'user.message') {
		const content = data.content;
		if (typeof content !== 'string') {
			return data;
		}

		const sanitizedContent = stripReminders(content);
		return sanitizedContent === content ? data : { ...data, content: sanitizedContent };
	}

	if (event.type !== 'tool.execution_start') {
		return data;
	}

	const toolName = data.toolName;
	if (toolName !== 'bash' && toolName !== 'powershell' && toolName !== 'task') {
		return data;
	}

	const args = data.arguments;
	if (!args || typeof args !== 'object' || !('description' in args)) {
		return data;
	}

	const { description: _description, ...sanitizedArgs } = args as Record<string, unknown>;
	return { ...data, arguments: sanitizedArgs };
}

function getMissionControlPendingCommandCompletionIds(state: McSharedState): Set<string> {
	state.mcPendingCommandCompletionIds ??= new Set();
	return state.mcPendingCommandCompletionIds;
}

function getMissionControlPendingUserInputRequests(state: McSharedState): Set<McPendingUserInputRequest> {
	state.mcPendingUserInputRequests ??= new Set();
	return state.mcPendingUserInputRequests;
}

function getMissionControlPendingUserInputRequest(state: McSharedState, payload: McAskUserResponsePayload | undefined): McPendingUserInputRequest | undefined {
	const pendingRequests = [...getMissionControlPendingUserInputRequests(state)];
	const identifiers = [
		payload?.requestId,
		payload?.promptId,
		payload?.toolCallId,
	].filter((value): value is string => typeof value === 'string' && value.length > 0);

	if (identifiers.length > 0) {
		return pendingRequests.find(request =>
			identifiers.includes(request.requestId) ||
			(typeof request.toolCallId === 'string' && identifiers.includes(request.toolCallId))
		);
	}

	return pendingRequests.length === 1 ? pendingRequests[0] : undefined;
}

function toSdkUserInputResponse(answer: IQuestionAnswer | undefined): UserInputResponse {
	if (!answer) {
		return { answer: '', wasFreeform: false };
	}

	if (answer.freeText) {
		return { answer: answer.freeText, wasFreeform: true };
	}

	return { answer: answer.selected.join(', '), wasFreeform: false };
}

function getMcAskUserResponse(payload: McAskUserResponsePayload | undefined, rawContent: string): UserInputResponse | undefined {
	const response = payload?.response ?? payload;
	const answer = typeof response?.answer === 'string'
		? response.answer
		: typeof response?.freeText === 'string'
			? response.freeText
			: Array.isArray(response?.selected)
				? response.selected.filter((value): value is string => typeof value === 'string').join(', ')
				: response?.skipped
					? ''
					: payload === undefined
						? rawContent
						: undefined;

	if (answer === undefined) {
		return undefined;
	}

	return {
		answer,
		wasFreeform: typeof response?.wasFreeform === 'boolean'
			? response.wasFreeform
			: typeof response?.freeText === 'string',
	};
}

function maybeAcknowledgeMissionControlCommandFromEvent(state: McSharedState, event: { type?: string; data?: unknown }): void {
	const commandId = getMissionControlCommandIdFromEvent(event);
	if (!commandId) {
		return;
	}

	if (getMissionControlPendingCommandCompletionIds(state).delete(commandId)) {
		state.mcCompletedCommandIds.push(commandId);
	}
}

export { builtinSlashCommands as builtinSlashSCommands } from '../../common/builtinSlashCommands';

/**
 * Either a free-form prompt **or** a known command.
 */
export type CopilotCLISessionInput =
	| { readonly prompt: string; readonly source?: SendOptions['source'] }
	| { readonly prompt?: string; readonly command: CopilotCLICommand; readonly source?: SendOptions['source'] };

function getPromptLabel(input: CopilotCLISessionInput): string {
	if ('command' in input) {
		const prompt = input.prompt ?? '';
		return prompt ? `/${input.command} ${prompt}` : `/${input.command}`;
	}
	return input.prompt;
}

export interface ICopilotCLISession extends IDisposable {
	readonly sessionId: string;
	readonly title?: string;
	readonly createdPullRequestUrl: string | undefined;
	readonly onDidChangeTitle: vscode.Event<string>;
	readonly status: vscode.ChatSessionStatus | undefined;
	readonly onDidChangeStatus: vscode.Event<vscode.ChatSessionStatus | undefined>;
	readonly workspace: IWorkspaceInfo;
	readonly additionalWorkspaces: IWorkspaceInfo[];
	readonly pendingPrompt: string | undefined;
	attachStream(stream: vscode.ChatResponseStream): IDisposable;
	setPermissionLevel(level: string | undefined): void;
	handleRequest(
		request: { id: string; toolInvocationToken: ChatParticipantToolToken; sessionResource?: vscode.Uri },
		input: CopilotCLISessionInput,
		attachments: Attachment[],
		model: { model: string; reasoningEffort?: string } | undefined,
		authInfo: NonNullable<SessionOptions['authInfo']>,
		token: vscode.CancellationToken
	): Promise<void>;
	addUserMessage(content: string): void;
	addUserAssistantMessage(content: string): void;
	getSelectedModelId(): Promise<string | undefined>;
}

export class CopilotCLISession extends DisposableStore implements ICopilotCLISession {
	public readonly sessionId: string;
	private _createdPullRequestUrl: string | undefined;
	public get createdPullRequestUrl(): string | undefined {
		return this._createdPullRequestUrl;
	}
	private _status?: vscode.ChatSessionStatus;
	public get status(): vscode.ChatSessionStatus | undefined {
		return this._status;
	}
	private readonly _statusChange = this.add(new EventEmitter<vscode.ChatSessionStatus | undefined>());

	public readonly onDidChangeStatus = this._statusChange.event;

	private _title?: string;
	public get title(): string | undefined {
		return this._title;
	}
	private _onDidChangeTitle = this.add(new Emitter<string>());
	public onDidChangeTitle = this._onDidChangeTitle.event;
	private _stream?: vscode.ChatResponseStream;
	private _toolInvocationToken?: ChatParticipantToolToken;
	public get sdkSession() {
		return this._sdkSession;
	}
	public get workspace() {
		return this._workspaceInfo;
	}
	public get additionalWorkspaces() {
		return this._additionalWorkspaces;
	}
	private _lastUsedModel: string | undefined;
	private _permissionLevel: string | undefined;
	private _pendingPrompt: string | undefined;
	private _bridgeProcessor: CopilotCliBridgeSpanProcessor | undefined;
	private readonly _todoSqlQuery = new TodoSqlQuery();
	private readonly _missionControlApiClient: MissionControlApiClient;

	/** Get or create shared MC state for this SDK session. */
	private get _mcState(): McSharedState | undefined {
		return mcStateBySessionId.get(this.sessionId);
	}

	/** Callback to propagate trace context to the SDK's OtelLifecycle. */
	private _updateSdkTraceContext: ((traceparent?: string, tracestate?: string) => void) | undefined;
	public get pendingPrompt(): string | undefined {
		return this._pendingPrompt;
	}
	/** Set the bridge processor for forwarding SDK spans to the debug panel. */
	setBridgeProcessor(bridge: CopilotCliBridgeSpanProcessor | undefined): void {
		this._bridgeProcessor = bridge;
	}
	/** Set the SDK OTel trace context updater (pre-bound with sessionId). */
	setSdkTraceContextUpdater(updater: ((traceparent?: string, tracestate?: string) => void) | undefined): void {
		this._updateSdkTraceContext = updater;
	}
	constructor(
		private readonly _workspaceInfo: IWorkspaceInfo,
		private readonly _agentName: string | undefined,
		private readonly _sdkSession: Session,
		private readonly _additionalWorkspaces: IWorkspaceInfo[],
		@ILogService private readonly logService: ILogService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@IChatSessionMetadataStore private readonly _chatSessionMetadataStore: IChatSessionMetadataStore,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IRequestLogger private readonly _requestLogger: IRequestLogger,
		@ICopilotCLIImageSupport private readonly _imageSupport: ICopilotCLIImageSupport,
		@IToolsService private readonly _toolsService: IToolsService,
		@IUserQuestionHandler private readonly _userQuestionHandler: IUserQuestionHandler,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IOTelService private readonly _otelService: IOTelService,
		@IGitService private readonly _gitService: IGitService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
	) {
		super();
		this.sessionId = _sdkSession.sessionId;
		this._missionControlApiClient = this.instantiationService.createInstance(MissionControlApiClient);
		this.add(toDisposable(() => this._todoSqlQuery.dispose()));
	}

	attachStream(stream: vscode.ChatResponseStream): IDisposable {
		this._stream = stream;
		return toDisposable(() => {
			if (this._stream === stream) {
				this._stream = undefined;
			}
		});
	}

	public setPermissionLevel(level: string | undefined): void {
		this._permissionLevel = level;
	}

	// TODO: This should be pre-populated when we restore a session based on its original context.
	// E.g. if we're resuming a session, and it tries to read a file, we shouldn't prompt for permissions again.
	/**
	 * Accumulated attachments across all requests in this session.
	 * Used for permission auto-approval: if a file was attached by the user in any
	 * request, read access is auto-approved for that file in subsequent turns.
	 */
	private readonly attachments: Attachment[] = [];
	/**
	 * Promise chain that serialises request completion tracking.
	 * When a steering request arrives while a previous request is still running,
	 * the steering handler awaits both `previousRequest` and its own SDK send so
	 * that the steering message does not resolve until the original request finishes.
	 */
	private previousRequest: Promise<unknown> = Promise.resolve();

	/**
	 * Entry point for every chat request against this session.
	 *
	 * **Steering behaviour**: if the session is already busy (`InProgress` or
	 * `NeedsInput`), the incoming message is treated as a *steering* request.
	 * Steering sends the new prompt to the SDK with `mode: 'immediate'` so it is
	 * injected into the running conversation as additional context. The steering
	 * request only resolves once *both* the steering send and the original
	 * in-flight request have completed, keeping the session's promise chain
	 * consistent.
	 *
	 * When the session is idle, a normal full request is started instead.
	 */
	public async handleRequest(
		request: { id: string; toolInvocationToken: ChatParticipantToolToken; sessionResource?: vscode.Uri },
		input: CopilotCLISessionInput,
		attachments: Attachment[],
		model: { model: string; reasoningEffort?: string } | undefined,
		authInfo: NonNullable<SessionOptions['authInfo']>,
		token: vscode.CancellationToken
	): Promise<void> {
		if (this.isDisposed) {
			throw new Error('Session disposed');
		}
		const label = getPromptLabel(input);
		const promptLabel = truncate(label, 50);
		const capturingToken = new CapturingToken(`Copilot CLI | ${promptLabel}`, 'worktree', undefined, undefined, this.sessionId);
		const isAlreadyBusyWithAnotherRequest = !!this._status && (this._status === ChatSessionStatus.InProgress || this._status === ChatSessionStatus.NeedsInput);
		this._toolInvocationToken = request.toolInvocationToken;

		const previousRequestSnapshot = this.previousRequest;

		const handled = this._requestLogger.captureInvocation(capturingToken, async () => {
			await this.updateModel(model?.model, model?.reasoningEffort, authInfo, token);

			if (isAlreadyBusyWithAnotherRequest) {
				return this._handleRequestSteering(input, attachments, model, previousRequestSnapshot, token);
			} else {
				return this._handleRequestImpl(request, input, attachments, model, token);
			}
		});

		this.previousRequest = this.previousRequest.then(() => handled);
		return handled;
	}

	/**
	 * Handles a steering request - a message sent while the session is already
	 * busy with a previous request.
	 *
	 * The steering prompt is sent to the SDK with `mode: 'immediate'` (via
	 * {@link sendRequestInternal}) so the SDK injects it into the running
	 * conversation as additional user context. The SDK send itself typically
	 * completes quickly (it only enqueues the message), but we also await
	 * `previousRequestPromise` so that this method does not resolve until the
	 * original in-flight request is fully done. This ensures callers see the
	 * correct session state when the returned promise settles.
	 *
	 * @param previousRequestPromise A snapshot of `this.previousRequest` captured
	 *   *before* the promise chain was extended with the current call. Using the
	 *   snapshot avoids a circular await that would deadlock.
	 */
	private async _handleRequestSteering(
		input: CopilotCLISessionInput,
		attachments: Attachment[],
		model: { model: string; reasoningEffort?: string } | undefined,
		previousRequestPromise: Promise<unknown>,
		token: vscode.CancellationToken,
	): Promise<void> {
		this.attachments.push(...attachments);
		const prompt = getPromptLabel(input);
		this._pendingPrompt = prompt;
		this.logService.info(`[CopilotCLISession] Steering session ${this.sessionId}`);
		const disposables = new DisposableStore();
		const logStartTime = Date.now();
		disposables.add(token.onCancellationRequested(() => {
			this._sdkSession.abort();
		}));
		disposables.add(toDisposable(() => this._sdkSession.abort()));

		try {
			// Send the steering prompt (completes quickly) and also wait for the
			// previous request to finish, so this promise settles only once all
			// in-flight work is done.
			await Promise.all([previousRequestPromise, this.sendRequestInternal(input, attachments, true, logStartTime)]);
			this._logConversation(prompt, '', model?.model || '', attachments, logStartTime, 'Completed');
		} catch (error) {
			this._logConversation(prompt, '', model?.model || '', attachments, logStartTime, 'Failed', error instanceof Error ? error.message : String(error));
			throw error;
		} finally {
			disposables.dispose();
		}
	}

	private async _handleRequestImpl(
		request: { id: string; toolInvocationToken: ChatParticipantToolToken },
		input: CopilotCLISessionInput,
		attachments: Attachment[],
		model: { model: string; reasoningEffort?: string } | undefined,
		token: vscode.CancellationToken
	): Promise<void> {
		const modelId = model?.model;
		const promptLabel = getPromptLabel(input);
		return this._otelService.startActiveSpan(
			'invoke_agent copilotcli',
			{
				kind: SpanKind.INTERNAL,
				attributes: {
					[GenAiAttr.OPERATION_NAME]: GenAiOperationName.INVOKE_AGENT,
					[GenAiAttr.AGENT_NAME]: 'copilotcli',
					[GenAiAttr.PROVIDER_NAME]: 'github',
					[GenAiAttr.CONVERSATION_ID]: this.sessionId,
					[CopilotChatAttr.SESSION_ID]: this.sessionId,
					[CopilotChatAttr.CHAT_SESSION_ID]: this.sessionId,
					...(modelId ? { [GenAiAttr.REQUEST_MODEL]: modelId } : {}),
					[CopilotChatAttr.USER_REQUEST]: truncateForOTel(promptLabel),
					...workspaceMetadataToOTelAttributes(resolveWorkspaceOTelMetadata(this._gitService)),
				},
			},
			async span => {
				// Emit user_message event so chronicle can extract turns and summary
				span.addEvent('user_message', { content: truncateForOTel(promptLabel) });

				// Register the trace context so the bridge processor can inject CHAT_SESSION_ID
				const traceCtx = span.getSpanContext();
				if (traceCtx && this._bridgeProcessor) {
					this._bridgeProcessor.registerTrace(traceCtx.traceId, this.sessionId);
				}
				// Propagate trace context to SDK so its spans are children of this span
				if (traceCtx && this._updateSdkTraceContext) {
					const traceparent = `00-${traceCtx.traceId}-${traceCtx.spanId}-01`;
					this._updateSdkTraceContext(traceparent);
				}
				try {
					return await this._handleRequestImplInner(span, request, input, attachments, modelId, token);
				} finally {
					if (traceCtx && this._bridgeProcessor) {
						this._bridgeProcessor.unregisterTrace(traceCtx.traceId);
					}
					// Clear SDK trace context so it doesn't leak to next request
					if (this._updateSdkTraceContext) {
						this._updateSdkTraceContext(undefined);
					}
				}
			},
		);
	}

	private async _handleRequestImplInner(
		invokeAgentSpan: ISpanHandle,
		request: { id: string; toolInvocationToken: ChatParticipantToolToken },
		input: CopilotCLISessionInput,
		attachments: Attachment[],
		modelId: string | undefined,
		token: vscode.CancellationToken
	): Promise<void> {
		this.attachments.push(...attachments);
		const prompt = getPromptLabel(input);
		this._pendingPrompt = prompt;
		this.logService.info(`[CopilotCLISession] Invoking session ${this.sessionId}`);
		const disposables = new DisposableStore();
		const logStartTime = Date.now();
		disposables.add(token.onCancellationRequested(() => {
			this._sdkSession.abort();
		}));
		disposables.add(toDisposable(() => this._sdkSession.abort()));

		this._status = ChatSessionStatus.InProgress;
		this._statusChange.fire(this._status);


		const pendingToolInvocations = new Map<string, [ChatToolInvocationPart | ChatResponseMarkdownPart | ChatResponseThinkingProgressPart, toolData: ToolCall, parentToolCallId: string | undefined]>();

		const editToolIds = new Set<string>();
		const toolCalls = new Map<string, ToolCall>();
		const editTracker = new ExternalEditTracker();
		let sdkRequestId: string | undefined;
		const toolIdEditMap = new Map<string, Promise<string | undefined>>();
		clearTodoList(this._toolsService, request.toolInvocationToken, token).catch(err => {
			this.logService.error(err, '[CopilotCLISession] Failed to clear todo list at start of session');
		});
		/**
		 * The sequence of events from the SDK is as follows:
		 * tool.start 			-> About to run a terminal command
		 * permission request 	-> Asks user for permission to run the command
		 * tool.complete 		-> Command has completed running, contains the output or error
		 *
		 * There's a problem with this flow, we end up displaying the UI about execution in progress, even before we asked for permissions.
		 * This looks weird because we display two UI elements in sequence, one for "Running command..." and then immediately after "Permission requested: Allow running this command?".
		 * To fix this, we delay showing the "Running command..." UI until after the permission request is resolved. If the permission request is approved, we then show the "Running command..." UI. If the permission request is denied, we show a message indicating that the command was not run due to lack of permissions.
		 * & if we don't get a permission request, but get some other event, then we show the "Running command..." UI immediately as before.
		 */
		const toolCallWaitingForPermissions: [ChatToolInvocationPart, ToolCall][] = [];
		const flushPendingInvocationMessages = () => {
			for (const [invocationMessage,] of toolCallWaitingForPermissions) {
				this._stream?.push(invocationMessage);
			}
			toolCallWaitingForPermissions.length = 0;
		};
		// Flush only the tool invocation matching the given toolCallId, leaving other
		// pending tools in the array. This prevents parallel tool calls from being
		// prematurely pushed to the stream when only one of them has been approved.
		const flushPendingInvocationMessageForToolCallId = (toolCallId: string | undefined) => {
			if (!toolCallId) {
				flushPendingInvocationMessages();
				return;
			}
			const index = toolCallWaitingForPermissions.findIndex(([, tc]) => tc.toolCallId === toolCallId);
			if (index !== -1) {
				const [[invocationMessage]] = toolCallWaitingForPermissions.splice(index, 1);
				this._stream?.push(invocationMessage);
			}
		};

		const chunkMessageIds = new Set<string>();
		const assistantMessageChunks: string[] = [];
		let lastUsageInfo: UsageInfoData | undefined;
		const reportUsage = (promptTokens: number, completionTokens: number) => {
			if (token.isCancellationRequested || !this._stream) {
				return;
			}
			this._stream.usage({
				promptTokens,
				completionTokens,
				promptTokenDetails: buildPromptTokenDetails(lastUsageInfo),
			});
		};
		const updateUsageInfo = (async () => {
			const metrics = await this._sdkSession.usage.getMetrics();
			const promptTokens = lastUsageInfo?.currentTokens || metrics.lastCallInputTokens;
			reportUsage(promptTokens, metrics.lastCallOutputTokens);
		})();
		try {
			const shouldHandleExitPlanModeRequests = this.configurationService.getConfig(ConfigKey.Advanced.CLIPlanExitModeEnabled);
			disposables.add(toDisposable(this._sdkSession.on('*', (event) => {
				this.logService.trace(`[CopilotCLISession] CopilotCLI Event: ${JSON.stringify(event, null, 2)}`);
				this.logService.info(`[CopilotCLISession] on(*) fired: ${event.type}`);
				// Forward events to Mission Control if remote control is active
				this._bufferMcEvent(event);
			})));
			disposables.add(toDisposable(this._sdkSession.on('permission.requested', async (event) => {
				const permissionRequest = event.data.permissionRequest;
				const requestId = event.data.requestId;

				// Auto-approve all requests when the permission level allows it.
				if (this._permissionLevel === 'autoApprove' || this._permissionLevel === 'autopilot') {
					this.logService.trace(`[CopilotCLISession] Auto Approving ${permissionRequest.kind} request (permission level: ${this._permissionLevel})`);
					this._sdkSession.respondToPermission(requestId, { kind: 'approved' });
					return;
				}

				// Resolve tool call data for the permission request.
				const toolData = permissionRequest.toolCallId ? toolCalls.get(permissionRequest.toolCallId) : undefined;
				const pendingData = permissionRequest.toolCallId ? pendingToolInvocations.get(permissionRequest.toolCallId) : undefined;
				const toolParentCallId = pendingData ? pendingData[2] : undefined;
				const toolInvocationToken = this._toolInvocationToken as unknown as never;
				const resolveLocalPermissionResponse = (permissionToken: CancellationToken): Promise<PermissionRequestResult> => {
					switch (permissionRequest.kind) {
						case 'read':
							return handleReadPermission(
								this.sessionId, permissionRequest, toolParentCallId,
								this.attachments, this._imageSupport, this.workspace, this.workspaceService,
								this._toolsService, toolInvocationToken, this.logService, permissionToken,
							);
						case 'write':
							return handleWritePermission(
								this.sessionId, permissionRequest, toolData, toolParentCallId,
								this._stream, editTracker, this.workspace, this.workspaceService,
								this.instantiationService, this._toolsService, toolInvocationToken, this.logService, permissionToken,
							);
						case 'shell':
							return handleShellPermission(
								permissionRequest, toolParentCallId,
								this.workspace, this._toolsService, toolInvocationToken, this.logService, permissionToken,
							);
						case 'mcp':
							return handleMcpPermission(
								permissionRequest, toolParentCallId,
								this._toolsService, toolInvocationToken, this.logService, permissionToken,
							);
						default:
							return showInteractivePermissionPrompt(
								permissionRequest, toolParentCallId,
								this._toolsService, toolInvocationToken, this.logService, permissionToken,
							);
					}
				};

				try {
					let response: PermissionRequestResult;
					if (this._permissionLevel === 'autoApprove' || this._permissionLevel === 'autopilot') {
						this.logService.trace(`[CopilotCLISession] Auto Approving ${permissionRequest.kind} request (permission level: ${this._permissionLevel})`);
						response = { kind: 'approved' };
					} else if (this._mcState) {
						const permissionResolutionTokenSource = new CancellationTokenSource(token);
						try {
							response = await Promise.race([
								resolveLocalPermissionResponse(permissionResolutionTokenSource.token),
								this._waitForMcPermissionResponse(this._mcState, permissionRequest, requestId, permissionResolutionTokenSource.token),
							]);
						} finally {
							permissionResolutionTokenSource.dispose(true);
						}
					} else {
						response = await resolveLocalPermissionResponse(token);
					}

					flushPendingInvocationMessageForToolCallId(permissionRequest.toolCallId);

					this._requestLogger.addEntry({
						type: LoggedRequestKind.MarkdownContentRequest,
						debugName: `Permission Request`,
						startTimeMs: Date.now(),
						icon: Codicon.question,
						markdownContent: this._renderPermissionToMarkdown(permissionRequest, response.kind),
						isConversationRequest: true
					});

					this._sdkSession.respondToPermission(requestId, response);
				}
				catch (error) {
					this.logService.error(error, `[CopilotCLISession] Error handling permission request of kind ${permissionRequest.kind}`);
					flushPendingInvocationMessageForToolCallId(permissionRequest.toolCallId);
					this._sdkSession.respondToPermission(requestId, { kind: 'denied-interactively-by-user' });
				}
			})));
			if (shouldHandleExitPlanModeRequests) {
				disposables.add(toDisposable(this._sdkSession.on('exit_plan_mode.requested', async (event) => {
					this.updateArtifacts();
					try {
						const response = await handleExitPlanMode(
							event.data,
							this._sdkSession,
							this._permissionLevel,
							this._toolInvocationToken,
							this.workspaceService,
							this.logService,
							this._toolsService,
							token,
						);
						flushPendingInvocationMessages();

						this._sdkSession.respondToExitPlanMode(event.data.requestId, response);
					} catch (error) {
						this.logService.error(error, '[CopilotCLISession] Error handling exit plan mode');
						this._sdkSession.respondToExitPlanMode(event.data.requestId, { approved: false });
					}
				})));
			}
			disposables.add(toDisposable(this._sdkSession.on('user_input.requested', async (event) => {
				if (!(this._toolInvocationToken as unknown)) {
					this.logService.warn('[AskQuestionsTool] No tool invocation token available, cannot show question carousel');
					this._sdkSession.respondToUserInput(event.data.requestId, { answer: '', wasFreeform: false });
					return;
				}
				const userInputRequest: IQuestion = {
					question: event.data.question,
					options: (event.data.choices ?? []).map(c => ({ label: c })),
					allowFreeformInput: event.data.allowFreeform,
					header: event.data.question,
				};
				let response: UserInputResponse;
				if (this._mcState) {
					const userInputResolutionTokenSource = new CancellationTokenSource(token);
					const localQuestionPromise = this._userQuestionHandler.askUserQuestion(userInputRequest, this._toolInvocationToken as unknown as never, userInputResolutionTokenSource.token, event.data.toolCallId);
					const remoteQuestionPromise = this._waitForMcUserInputResponse(this._mcState, event.data.requestId, event.data.toolCallId, userInputResolutionTokenSource.token);
					try {
						const result = await Promise.race([
							localQuestionPromise.then(answer => ({ source: 'local' as const, response: toSdkUserInputResponse(answer) })),
							remoteQuestionPromise.then(result => ({ source: 'remote' as const, response: result })),
						]);
						if (result.source === 'remote' && result.response && event.data.toolCallId) {
							await this._userQuestionHandler.notifyQuestionCarouselAnswer?.(event.data.toolCallId, userInputRequest, result.response);
						}
						response = result.response ?? { answer: '', wasFreeform: false };
					} finally {
						userInputResolutionTokenSource.dispose(true);
					}
				} else {
					response = toSdkUserInputResponse(await this._userQuestionHandler.askUserQuestion(userInputRequest, this._toolInvocationToken as unknown as never, token, event.data.toolCallId));
				}
				flushPendingInvocationMessages();
				this._sdkSession.respondToUserInput(event.data.requestId, response);
			})));
			disposables.add(toDisposable(this._sdkSession.on('session.title_changed', (event) => {
				this._title = event.data.title;
				this._onDidChangeTitle.fire(event.data.title);
			})));
			disposables.add(toDisposable(this._sdkSession.on('user.message', (event) => {
				sdkRequestId = sdkRequestId ?? event.id;
			})));
			disposables.add(toDisposable(this._sdkSession.on('assistant.usage', (event) => {
				if (this._stream && typeof event.data.outputTokens === 'number' && typeof event.data.inputTokens === 'number') {
					reportUsage(event.data.inputTokens, event.data.outputTokens);
				}
			})));
			disposables.add(toDisposable(this._sdkSession.on('session.usage_info', (event) => {
				lastUsageInfo = {
					currentTokens: event.data.currentTokens,
					systemTokens: event.data.systemTokens,
					conversationTokens: event.data.conversationTokens,
					toolDefinitionsTokens: event.data.toolDefinitionsTokens,
					tokenLimit: event.data.tokenLimit,
				};
				reportUsage(lastUsageInfo.currentTokens, 0);
			})));
			disposables.add(toDisposable(this._sdkSession.on('assistant.message_delta', (event) => {
				// Support for streaming delta messages.
				if (typeof event.data.deltaContent === 'string' && event.data.deltaContent.length) {
					// Ensure pending invocation messages are flushed even if we skip sub-agent markdown
					flushPendingInvocationMessages();
					// Skip sub-agent markdown — it will be captured in the subagent tool's result
					if (event.data.parentToolCallId) {
						return;
					}
					chunkMessageIds.add(event.data.messageId);
					assistantMessageChunks.push(event.data.deltaContent);
					this._stream?.markdown(event.data.deltaContent);
				}
			})));
			disposables.add(toDisposable(this._sdkSession.on('assistant.message', (event) => {
				if (typeof event.data.content === 'string' && event.data.content.length && !chunkMessageIds.has(event.data.messageId)) {
					// Skip sub-agent markdown — it will be captured in the subagent tool's result
					if (event.data.parentToolCallId) {
						return;
					}
					assistantMessageChunks.push(event.data.content);
					flushPendingInvocationMessages();
					this._stream?.markdown(event.data.content);
				}
			})));
			disposables.add(toDisposable(this._sdkSession.on('tool.execution_start', (event) => {
				toolCalls.set(event.data.toolCallId, event.data as unknown as ToolCall);

				if (isCopilotCliEditToolCall(event.data)) {
					flushPendingInvocationMessages();
					editToolIds.add(event.data.toolCallId);
				} else {
					const responsePart = processToolExecutionStart(event, pendingToolInvocations, getWorkingDirectory(this.workspace));
					if (responsePart instanceof ChatResponseThinkingProgressPart) {
						flushPendingInvocationMessages();
						this._stream?.push(responsePart);
						this._stream?.push(new ChatResponseThinkingProgressPart('', '', { vscodeReasoningDone: true }));
					} else if (responsePart instanceof ChatResponseMarkdownPart) {
						// Wait for completion to push into stream.
					} else if (responsePart instanceof ChatToolInvocationPart) {
						responsePart.enablePartialUpdate = true;

						if (isCopilotCLIToolThatCouldRequirePermissions(event)) {
							toolCallWaitingForPermissions.push([responsePart, event.data as ToolCall]);
						} else {
							flushPendingInvocationMessages();
							this._stream?.push(responsePart);
						}
					}
				}
				this.logService.trace(`[CopilotCLISession] Start Tool ${event.data.toolName || '<unknown>'}`);
			})));
			disposables.add(toDisposable(this._sdkSession.on('tool.execution_complete', (event) => {
				const toolName = toolCalls.get(event.data.toolCallId)?.toolName || '<unknown>';
				if (toolName.endsWith('create_pull_request') && event.data.success) {
					const pullRequestUrl = extractPullRequestUrlFromToolResult(event.data.result);
					if (pullRequestUrl) {
						this._createdPullRequestUrl = pullRequestUrl;
						this.logService.trace(`[CopilotCLISession] Captured pull request URL: ${pullRequestUrl}`);
						GenAiMetrics.incrementPullRequestCount(this._otelService);
					}
				}
				// Log tool call to request logger
				const eventError = event.data.error ? { ...event.data.error, code: event.data.error.code || '' } : undefined;
				const eventData = { ...event.data, error: eventError };
				this._logToolCall(event.data.toolCallId, toolName, toolCalls.get(event.data.toolCallId)?.arguments, eventData);

				// Mark the end of the edit if this was an edit tool.
				toolIdEditMap.set(event.data.toolCallId, editTracker.completeEdit(event.data.toolCallId));
				if (editToolIds.has(event.data.toolCallId)) {
					this.logService.trace(`[CopilotCLISession] Completed edit tracking for toolCallId ${event.data.toolCallId}`);
					return;
				}

				// Just complete the tool invocation - the part was already pushed with partial updates enabled
				const [responsePart,] = processToolExecutionComplete(event, pendingToolInvocations, this.logService, getWorkingDirectory(this.workspace)) ?? [];
				if (responsePart) {
					flushPendingInvocationMessageForToolCallId(event.data.toolCallId);
					if (responsePart instanceof ChatToolInvocationPart) {
						responsePart.enablePartialUpdate = true;
					}
					this._stream?.push(responsePart);
				}

				const success = `success: ${event.data.success}`;
				const error = event.data.error ? `error: ${event.data.error.code},${event.data.error.message}` : '';
				const result = event.data.result ? `result: ${event.data.result?.content}` : '';
				const parts = [success, error, result].filter(part => part.length > 0).join(', ');

				// When a sql tool execution completes that modifies the todos table,
				// query the session database and update the todo list widget.
				if (toolName === 'sql' && event.data.success) {
					const toolCallData = toolCalls.get(event.data.toolCallId);
					try {
						const query = (toolCallData?.arguments as { query?: string } | undefined)?.query ?? '';
						if (isTodoRelatedSqlQuery(query)) {
							const sessionDir = getCopilotCLISessionDir(this.sessionId);
							this._todoSqlQuery.queryTodos(sessionDir).then(items => {
								if (token.isCancellationRequested) {
									return;
								}
								return updateTodoListFromSqlItems(items, this._toolsService, request.toolInvocationToken, token);
							}).catch(err => {
								this.logService.error(err, '[CopilotCLISession] Failed to query todos from session database');
							});
						}
					} catch (ex) {
						this.logService.error(ex, `[CopilotCLISession] Failed to process completed sql tool call for todos`);
					}
				}

				this.logService.trace(`[CopilotCLISession]Complete Tool ${toolName}, ${parts}`);
			})));
			disposables.add(toDisposable(this._sdkSession.on('session.error', (event) => {
				flushPendingInvocationMessages();
				this.logService.error(`[CopilotCLISession]CopilotCLI error: (${event.data.errorType}), ${event.data.message}`);
				this._stream?.markdown(l10n.t('\n\nError: ({0}) {1}', event.data.errorType, event.data.message));

				const errorMarkdown = [`# Error Details`, `Type: ${event.data.errorType}`, `Message: ${event.data.message}`, `## Stack`, event.data.stack || ''].join('\n');
				this._requestLogger.addEntry({
					type: LoggedRequestKind.MarkdownContentRequest,
					debugName: `Session Error`,
					startTimeMs: Date.now(),
					icon: Codicon.error,
					markdownContent: errorMarkdown,
					isConversationRequest: true
				});
			})));
			disposables.add(toDisposable(this._sdkSession.on('subagent.started', (event) => {
				this.logService.trace(`[CopilotCLISession] Subagent started: ${event.data.agentDisplayName} (toolCallId: ${event.data.toolCallId})`);
				enrichToolInvocationWithSubagentMetadata(
					event.data.toolCallId,
					event.data.agentDisplayName,
					event.data.agentDescription,
					pendingToolInvocations
				);
			})));
			disposables.add(toDisposable(this._sdkSession.on('subagent.completed', (event) => {
				this.logService.trace(`[CopilotCLISession] Subagent completed: ${event.data.agentDisplayName} (toolCallId: ${event.data.toolCallId})`);
			})));
			disposables.add(toDisposable(this._sdkSession.on('subagent.failed', (event) => {
				this.logService.trace(`[CopilotCLISession] Subagent failed: ${event.data.agentDisplayName} (toolCallId: ${event.data.toolCallId})`);
			})));
			// Stash hook event data on the bridge processor so SDK hook spans
			// are enriched with input/output details for the debug panel.
			disposables.add(toDisposable(this._sdkSession.on('hook.start', (event) => {
				this.logService.trace(`[CopilotCLISession] Hook ${event.data.hookType} started (${event.data.hookInvocationId})`);
				let input: string | undefined;
				try {
					input = truncateForOTel(JSON.stringify(event.data.input));
				} catch { /* swallow serialization errors */ }
				this._bridgeProcessor?.stashHookInput(event.data.hookInvocationId, event.data.hookType, input);
			})));
			disposables.add(toDisposable(this._sdkSession.on('hook.end', (event) => {
				this.logService.trace(`[CopilotCLISession] Hook ${event.data.hookType} ended (${event.data.hookInvocationId}), success=${event.data.success}`);
				const resultKind = event.data.success ? 'success' as const : 'error' as const;
				let output: string | undefined;
				if (event.data.success) {
					try {
						output = truncateForOTel(JSON.stringify(event.data.output));
					} catch { /* swallow serialization errors */ }
				}
				this._bridgeProcessor?.stashHookEnd(
					event.data.hookInvocationId,
					event.data.hookType,
					output,
					resultKind,
					event.data.error?.message,
				);
			})));

			if (!token.isCancellationRequested) {
				await this.sendRequestInternal(input, attachments, false, logStartTime);
			}
			this.logService.trace(`[CopilotCLISession] Invoking session (completed) ${this.sessionId}`);
			const resolvedToolIdEditMap: Record<string, string> = {};
			await Promise.all(Array.from(toolIdEditMap.entries()).map(async ([toolId, editFilePromise]) => {
				const editId = await editFilePromise.catch(() => undefined);
				if (editId) {
					resolvedToolIdEditMap[toolId] = editId;
				}
			}));
			if (sdkRequestId) {
				await this._chatSessionMetadataStore.updateRequestDetails(this.sessionId, [{
					vscodeRequestId: request.id,
					copilotRequestId: sdkRequestId,
					toolIdEditMap: resolvedToolIdEditMap,
					agentId: this._agentName,
				}]).catch(error => {
					this.logService.error(`[CopilotCLISession] Failed to update chat session metadata store for request ${request.id}`, error);
				});
			}
			await updateUsageInfo.catch(error => {
				this.logService.error(`[CopilotCLISession] Failed to update usage info after request ${request.id}`, error);
			});
			this._status = ChatSessionStatus.Completed;
			this._statusChange.fire(this._status);

			// Log the completed conversation
			this._logConversation(prompt, assistantMessageChunks.join(''), modelId || '', attachments, logStartTime, 'Completed');
		} catch (error) {
			this._status = ChatSessionStatus.Failed;
			this._statusChange.fire(this._status);
			this.logService.error(`[CopilotCLISession] Invoking session (error) ${this.sessionId}`, error);
			this._stream?.markdown(l10n.t('\n\nError: {0}', error instanceof Error ? error.message : String(error)));

			invokeAgentSpan.setStatus(SpanStatusCode.ERROR, error instanceof Error ? error.message : String(error));
			if (error instanceof Error) {
				invokeAgentSpan.recordException(error);
			}

			// Log the failed conversation
			this._logConversation(prompt, assistantMessageChunks.join(''), modelId || '', attachments, logStartTime, 'Failed', error instanceof Error ? error.message : String(error));
		} finally {
			// End the invoke_agent wrapper span
			const durationSec = (Date.now() - logStartTime) / 1000;
			invokeAgentSpan.setAttribute('copilot_chat.duration_sec', durationSec);
			invokeAgentSpan.end();

			this._pendingPrompt = undefined;
			disposables.dispose();

			this.updateArtifacts();
		}
	}

	private async updateModel(modelId: string | undefined, reasoningEffort: string | undefined, authInfo: NonNullable<SessionOptions['authInfo']>, token: CancellationToken): Promise<void> {
		// Where possible try to avoid an extra call to getSelectedModel by using cached value.
		let currentModel: string | undefined = undefined;
		if (modelId) {
			if (this._lastUsedModel) {
				currentModel = this._lastUsedModel;
			} else {
				currentModel = await raceCancellation(this._sdkSession.getSelectedModel(), token);
			}
		}
		if (token.isCancellationRequested) {
			return;
		}
		if (authInfo) {
			this._sdkSession.setAuthInfo(authInfo);
		}
		if (modelId) {
			if (modelId !== currentModel) {
				this._lastUsedModel = modelId;
				if (this.configurationService.getConfig(ConfigKey.Advanced.CLIThinkingEffortEnabled)) {
					await raceCancellation(this._sdkSession.setSelectedModel(modelId, reasoningEffort), token);
				} else {
					await raceCancellation(this._sdkSession.setSelectedModel(modelId), token);
				}
			} else if (reasoningEffort && this._sdkSession.getReasoningEffort() !== reasoningEffort && this.configurationService.getConfig(ConfigKey.Advanced.CLIThinkingEffortEnabled)) {
				await raceCancellation(this._sdkSession.setSelectedModel(modelId, reasoningEffort), token);
			}
		}
	}

	private updateArtifacts() {
		const shouldHandleExitPlanModeRequests = this.configurationService.getConfig(ConfigKey.Advanced.CLIPlanExitModeEnabled);

		if (!shouldHandleExitPlanModeRequests || !this._toolsService.getTool('setArtifacts') || !this._toolInvocationToken) {
			return;
		}

		const artifacts: { label: string; uri: string; type: 'devServer' | 'screenshot' | 'plan' }[] = [];
		const planPath = this._sdkSession.getPlanPath();
		if (planPath) {
			artifacts.push({ label: l10n.t('Plan'), uri: Uri.file(planPath).toString(), type: 'plan' });
		}
		Promise.resolve(this._toolsService
			.invokeTool('setArtifacts', { input: { artifacts }, toolInvocationToken: this._toolInvocationToken }, CancellationToken.None))
			.catch(error => {
				this.logService.error(error, '[CopilotCLISession] Failed to update artifacts');
			});
	}
	/**
	 * Sends a request to the underlying SDK session.
	 *
	 * @param steering When `true`, the SDK send uses `mode: 'immediate'` so the
	 *   prompt is injected into the already-running conversation rather than
	 *   starting a new turn. This is the mechanism behind session steering.
	 */
	private async sendRequestInternal(input: CopilotCLISessionInput, attachments: Attachment[], steering = false, logStartTime: number): Promise<void> {
		const prompt = getPromptLabel(input);
		this._logRequest(prompt, this._lastUsedModel || '', attachments, logStartTime);

		if ('command' in input && input.command !== 'plan') {
			switch (input.command) {
				case 'compact': {
					this._stream?.progress(l10n.t('Compacting conversation...'));
					await this._sdkSession.initializeAndValidateTools();
					this._sdkSession.currentMode = 'interactive';
					const result = await this._sdkSession.compactHistory();
					if (result.success) {
						this._stream?.markdown(l10n.t('Compacted conversation.'));
					} else {
						this._stream?.markdown(l10n.t('Unable to compact conversation.'));
					}
					break;
				}
				case 'fleet': {
					await this._startFleetAndWaitForIdle(input);
					break;
				}
				case 'remote': {
					await this._handleRemoteControl(input);
					break;
				}
			}
		} else {
			if ('command' in input && input.command === 'plan') {
				this._sdkSession.currentMode = 'plan';
			} else if (this._permissionLevel === 'autopilot') {
				this._sdkSession.currentMode = 'autopilot';
			} else {
				this._sdkSession.currentMode = 'interactive';
			}
			const sendOptions: SendOptions = { prompt: input.prompt ?? '', attachments, agentMode: this._sdkSession.currentMode };
			if (steering) {
				sendOptions.mode = 'immediate';
			}
			if (input.source) {
				sendOptions.source = input.source;
			}
			await this._sdkSession.send(sendOptions);
		}
	}

	private async _startFleetAndWaitForIdle(input: CopilotCLISessionInput): Promise<void> {
		const prompt = 'prompt' in input ? input.prompt : undefined;
		try {
			const promise = new Promise<void>((resolve) => {
				const off = this._sdkSession.on('session.idle', () => {
					resolve();
					off();
				});
			});
			if (this._permissionLevel === 'autopilot') {
				this._sdkSession.currentMode = 'autopilot';
			} else {
				this._sdkSession.currentMode = 'interactive';
			}
			const result = await this._sdkSession.fleet.start({ prompt });
			if (!result.started) {
				this.logService.info('[CopilotCLISession] Fleet mode not started');
				return;
			}
			await promise;
		} catch (error) {
			this.logService.error(`[CopilotCLISession] Fleet error: ${error}`);
		}
	}

	/**
	 * Handle `/remote` command — prints status or enables/disables Mission
	 * Control remote control for this session by calling the Copilot API directly.
	 */
	private async _handleRemoteControl(input: CopilotCLISessionInput): Promise<void> {
		if (!this.configurationService.getConfig(ConfigKey.Advanced.CLIRemoteEnabled)) {
			this._stream?.markdown(l10n.t('The /remote command is experimental and not enabled. Set `github.copilot.chat.cli.remote.enabled` to `true` in settings to use it.'));
			return;
		}

		const args = ('prompt' in input ? input.prompt : '')?.trim().toLowerCase();
		const isCurrentlyActive = !!this._mcState;
		if (!args) {
			this._showRemoteControlStatus();
			return;
		}
		if (args !== 'on' && args !== 'off') {
			this._stream?.markdown(l10n.t('Usage: /remote, /remote on, /remote off'));
			return;
		}
		if (args === 'on' && isCurrentlyActive) {
			this._showRemoteControlStatus();
			return;
		}
		if (args === 'off' && !isCurrentlyActive) {
			this._showRemoteControlStatus();
			return;
		}

		try {
			if (args === 'off') {
				await this._teardownRemoteControl();
				this._stream?.markdown(l10n.t('Remote control disabled.'));
				return;
			}

			this._stream?.progress(l10n.t('Enabling remote control...'));

			// Step 1: Get GitHub token
			const session = await this._authenticationService.getGitHubSession('any', { silent: true });
			if (!session?.accessToken) {
				this._stream?.markdown(l10n.t('Unable to enable remote control: no GitHub authentication available.'));
				return;
			}
			const githubToken = session.accessToken;

			// Step 2: Resolve git context (owner/repo)
			const workingDir = getWorkingDirectory(this._workspaceInfo);
			if (!workingDir) {
				this._stream?.markdown(l10n.t('Unable to enable remote control: no workspace folder found.'));
				return;
			}

			const nwo = await this._resolveGitHubNwo(workingDir);
			if (!nwo) {
				this._stream?.markdown(l10n.t('Unable to enable remote control: this workspace is not a GitHub repository.'));
				return;
			}

			// Step 3: Resolve numeric owner/repo IDs via GitHub API
			const repoResponse = await fetch(`https://api.github.com/repos/${nwo.owner}/${nwo.repo}`, {
				headers: { 'Authorization': `token ${githubToken}`, 'Accept': 'application/json' },
			});
			if (!repoResponse.ok) {
				this._stream?.markdown(l10n.t('Unable to enable remote control: could not resolve repository {0}/{1}.', nwo.owner, nwo.repo));
				return;
			}
			const repoData = await repoResponse.json() as { id: number; owner: { id: number } };

			// Step 4: Create Mission Control session
			const agentTaskId = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
			this.logService.info('[CopilotCLISession] Creating MC session');

			let mcData: McSessionCreateResult;
			try {
				mcData = await this._missionControlApiClient.createSession(repoData.owner.id, repoData.id, agentTaskId, {});
			} catch (err) {
				if (err instanceof PermissiveAuthRequiredError) {
					this._stream?.markdown(l10n.t('Unable to enable remote control: additional GitHub permissions are required.'));
					return;
				}
				throw err;
			}

			const taskId = mcData.taskId;

			// Step 5: Store MC state in the shared map (keyed by SDK session ID)
			// so it persists across CopilotCLISession instances.
			const sharedState: McSharedState = {
				mcSessionId: mcData.id,
				mcFrontendUrl: undefined,
				mcEventBuffer: [],
				mcCompletedCommandIds: [],
				mcPendingPermissionRequests: new Map(),
				mcFlushInterval: undefined,
				mcPollInterval: undefined,
				mcLastEventId: null,
				mcLastSubmitAttemptTimeMs: Date.now(),
				mcProcessedCommandIds: new Set(),
				mcPendingCommandCompletionIds: new Set(),
				mcSdkSession: this._sdkSession,
				mcEventListenerDispose: undefined,
				mcSessionResource: SessionIdForCLI.getResource(this.sessionId),
			};
			mcStateBySessionId.set(this.sessionId, sharedState);
			this.logService.info(`[CopilotCLISession] Set shared MC state for session ${this.sessionId}, mcSessionId=${mcData.id}`);

			// Step 6: Send the initial session.start event — MC requires this to
			// transition out of "Fueling the runtime engines..." loading state.
			const sessionStartEvent = this._createMcEvent('session.start', {
				sessionId: sharedState.mcSessionId,
				version: 1,
				producer: 'copilot-developer-cli',
				copilotVersion: '1.0.0',
				startTime: new Date().toISOString(),
				remoteSteerable: true,
				context: {
					cwd: workingDir,
					gitRoot: workingDir,
					repository: `${nwo.owner}/${nwo.repo}`,
				},
			});
			sharedState.mcEventBuffer.push(sessionStartEvent);

			// Also send a session.remote_steerable_changed event to explicitly
			// enable steering on the MC web UI.
			sharedState.mcEventBuffer.push(this._createMcEvent('session.remote_steerable_changed', {
				remoteSteerable: true,
			}));

			const sessionTitle = await this._getMissionControlSessionTitle();
			if (sessionTitle) {
				sharedState.mcEventBuffer.push(this._createMcEvent('session.title_changed', {
					title: sessionTitle,
				}, true));
			}

			// Step 7b: Replay existing conversation history so the MC web UI
			// shows all messages that occurred before /remote was invoked.
			// Only replay conversation-content events — skip session lifecycle
			// events that would override the remoteSteerable state we just set.
			const replayableTypes = new Set([
				'user.message', 'assistant.message', 'assistant.turn_start',
				'assistant.turn_complete', 'tool.execution_start',
				'tool.execution_complete',
			]);
			const existingEvents = this._sdkSession.getEvents();
			let replayed = 0;
			for (const event of existingEvents) {
				const e = event as { type?: string; data?: unknown; id?: string; timestamp?: string; parentId?: string | null };
				if (e.type && replayableTypes.has(e.type)) {
					this._bufferMcEvent(e);
					replayed++;
				}
			}
			this.logService.info(`[CopilotCLISession] Replayed ${replayed}/${existingEvents.length} existing events to MC`);

			await this._flushMcEvents();

			// Step 7c: Register a persistent on('*') listener on the SDK session
			// so that events emitted between requests (e.g. from MC steering sends)
			// are captured and forwarded to MC. Per-request listeners are disposed
			// after each request completes, so this persistent listener fills the gap.
			const sessionId = this.sessionId;
			sharedState.mcEventListenerDispose = this._sdkSession.on('*', (event) => {
				const state = mcStateBySessionId.get(sessionId);
				if (!state) { return; }
				// Use the static helper instead of this._bufferMcEvent to avoid
				// relying on the instance that started MC (it may be stale).
				const eventType = (event as { type?: string }).type ?? 'unknown';
				const e = event as { type?: string; data?: unknown; id?: string; timestamp?: string; parentId?: string | null; ephemeral?: boolean };
				if (!shouldForwardMissionControlEvent(e)) {
					return;
				}
				const updatedTitle = getMissionControlSessionTitleFromEvent(e);
				if (updatedTitle) {
					this._title = updatedTitle;
				}
				maybeAcknowledgeMissionControlCommandFromEvent(state, e);
				if (e.id && e.timestamp) {
					state.mcEventBuffer.push({
						id: e.id,
						timestamp: e.timestamp,
						parentId: e.parentId ?? state.mcLastEventId ?? null,
						ephemeral: e.ephemeral,
						type: eventType,
						data: getMissionControlEventData(e),
					});
					state.mcLastEventId = e.id;
				} else {
					const id = crypto.randomUUID();
					state.mcEventBuffer.push({
						id,
						timestamp: new Date().toISOString(),
						parentId: state.mcLastEventId ?? null,
						type: eventType,
						data: getMissionControlEventData(e),
					});
					state.mcLastEventId = id;
				}
			});

			// Step 8: Construct and display the frontend URL
			const frontendUrl = `https://github.com/${nwo.owner}/${nwo.repo}/tasks/${taskId}`;
			sharedState.mcFrontendUrl = frontendUrl;
			this.logService.info(`[CopilotCLISession] MC session created, URL: ${frontendUrl}`);

			// Render a persistent inline info banner using the proposed
			// `stream.info()` API (blue background + blue info icon, matches
			// the native chat info notification style). The button uses
			// `vscode.open` so it opens the URL externally without invoking
			// the model, and the banner stays visible after click.
			const banner = new MarkdownString(
				`**${l10n.t('Remote control is enabled.')}** ` +
				l10n.t('You can open this session from any device.')
			);
			this._stream?.info(banner);
			this._stream?.button({
				command: 'vscode.open',
				arguments: [Uri.parse(frontendUrl)],
				title: l10n.t('Open on GitHub'),
			});

			// Step 9: Start continuous event exporter and command poller
			this._startMcEventExporter();
			this._startMcCommandPoller();
		} catch (error) {
			this.logService.error(`[CopilotCLISession] Remote control error: ${error}`);
			this._stream?.markdown(l10n.t('Unable to enable remote control: {0}', error instanceof Error ? error.message : String(error)));
		}
	}

	private _showRemoteControlStatus(): void {
		const state = this._mcState;
		if (!state) {
			this._stream?.markdown(l10n.t('Remote control is disabled. Use /remote on to enable it.'));
			return;
		}

		const message = state.mcFrontendUrl
			? l10n.t('Remote control is enabled. Use /remote off to disable it. Session URL: {0}', state.mcFrontendUrl)
			: l10n.t('Remote control is enabled. Use /remote off to disable it.');
		this._stream?.markdown(message);
		if (state.mcFrontendUrl) {
			this._stream?.button({
				command: 'vscode.open',
				arguments: [Uri.parse(state.mcFrontendUrl)],
				title: l10n.t('Open on GitHub'),
			});
		}
	}

	/**
	 * Disable remote control for an active Mission Control session.
	 */
	private async _teardownRemoteControl(): Promise<void> {
		// Stop local scheduling first so no more commands or periodic flushes race
		// with the final disabled-state transition we send to Mission Control.
		this._stopMcCommandPoller();
		this._stopMcEventExporter(false);

		const state = this._mcState;
		if (!state) {
			this.logService.info('[CopilotCLISession] No active MC session to tear down');
			return;
		}

		// Clean up the persistent event listener
		if (state.mcEventListenerDispose) {
			state.mcEventListenerDispose();
			state.mcEventListenerDispose = undefined;
		}
		for (const pendingRequest of state.mcPendingPermissionRequests.values()) {
			pendingRequest.resolve({ kind: 'denied-interactively-by-user' });
		}
		state.mcPendingPermissionRequests.clear();
		for (const pendingRequest of getMissionControlPendingUserInputRequests(state)) {
			pendingRequest.resolve(undefined);
		}
		getMissionControlPendingUserInputRequests(state).clear();

		state.mcEventBuffer.push(this._createMcEvent('session.remote_steerable_changed', {
			remoteSteerable: false,
		}));
		state.mcEventBuffer.push(this._createMcEvent('session.idle', {}));
		await this._flushMcEvents();

		mcStateBySessionId.delete(this.sessionId);
		this.logService.info(`[CopilotCLISession] Disabled MC remote control for session ${state.mcSessionId}`);
	}

	/**
	 * Parse owner/repo from the git remote URL of a working directory.
	 */
	private _resolveGitHubNwo(workingDirectory: vscode.Uri): Promise<{ owner: string; repo: string } | undefined> {
		return new Promise((resolve) => {
			cp.execFile('git', ['remote', 'get-url', 'origin'], { cwd: workingDirectory.fsPath, timeout: 5000 }, (_error, stdout) => {
				if (!stdout) {
					resolve(undefined);
					return;
				}
				const url = stdout.trim();
				const match = url.match(/github\.com[:/](?<owner>[^/]+)\/(?<repo>[^/]+?)(?:\.git)?$/);
				if (match?.groups) {
					resolve({ owner: match.groups.owner, repo: match.groups.repo });
				} else {
					resolve(undefined);
				}
			});
		});
	}

	// -- Mission Control event exporter -----------------------------------

	/**
	 * Start listening to SDK events and flushing them to Mission Control.
	 * Events are batched and sent every 500ms.
	 */
	private _startMcEventExporter(): void {
		this._stopMcEventExporter();
		const state = this._mcState;
		if (!state) { return; }

		// Event buffering is handled by _bufferMcEvent(), which is called from
		// the per-send on('*') handler. We only need the flush interval here.
		state.mcFlushInterval = setInterval(() => {
			this._flushMcEvents().catch(err => {
				this.logService.warn(`[CopilotCLISession] MC event flush failed: ${err}`);
			});
		}, 500);

		this.logService.info('[CopilotCLISession] MC event exporter started');
	}

	/** Stop the MC event exporter. */
	private _stopMcEventExporter(clearBuffer = true): void {
		const state = this._mcState;
		if (state?.mcFlushInterval) {
			clearInterval(state.mcFlushInterval);
			state.mcFlushInterval = undefined;
		}
		if (state && clearBuffer) {
			state.mcEventBuffer.length = 0;
		}
	}

	/**
	 * Buffer an SDK event for Mission Control. Called from the per-send
	 * on('*') handler so that events are captured on every turn.
	 */
	private _bufferMcEvent(event: { type?: string; data?: unknown; id?: string; timestamp?: string; parentId?: string | null; ephemeral?: boolean }): void {
		const state = this._mcState;
		const eventType = event.type ?? 'unknown';
		if (!state) {
			return;
		}
		if (!shouldForwardMissionControlEvent(event)) {
			return;
		}
		const updatedTitle = getMissionControlSessionTitleFromEvent(event);
		if (updatedTitle) {
			this._title = updatedTitle;
		}
		maybeAcknowledgeMissionControlCommandFromEvent(state, event);
		this.logService.trace(`[CopilotCLISession] MC buffered event: ${eventType}`);

		// If the SDK event already has a UUID id, pass it through directly
		// to preserve the event identity chain. Otherwise create a new event.
		if (event.id && event.timestamp) {
			const mcEvent: McEvent = {
				id: event.id,
				timestamp: event.timestamp,
				parentId: event.parentId ?? state.mcLastEventId ?? null,
				ephemeral: event.ephemeral,
				type: eventType,
				data: getMissionControlEventData(event),
			};
			state.mcLastEventId = event.id;
			state.mcEventBuffer.push(mcEvent);
		} else {
			state.mcEventBuffer.push(this._createMcEvent(eventType, getMissionControlEventData(event)));
		}
	}

	/** Create an MC event with a UUID v4 ID and parentId chain. */
	private _createMcEvent(type: string, data: Record<string, unknown>, ephemeral?: boolean): McEvent {
		const state = this._mcState;
		const id = crypto.randomUUID();
		const event: McEvent = {
			id,
			timestamp: new Date().toISOString(),
			parentId: state?.mcLastEventId ?? null,
			ephemeral,
			type,
			data,
		};
		if (state) {
			state.mcLastEventId = id;
		}
		return event;
	}

	private async _getMissionControlSessionTitle(): Promise<string | undefined> {
		const liveTitle = this._title?.trim();
		if (liveTitle) {
			return liveTitle;
		}

		const sessionEvents = this._sdkSession.getEvents() as readonly { type?: string; data?: unknown }[];
		for (let i = sessionEvents.length - 1; i >= 0; i--) {
			const eventTitle = getMissionControlSessionTitleFromEvent(sessionEvents[i]);
			if (eventTitle) {
				return eventTitle;
			}
		}

		const customTitle = (await this._chatSessionMetadataStore.getCustomTitle(this.sessionId))?.trim();
		if (customTitle) {
			return customTitle;
		}

		for (const event of sessionEvents) {
			if (event.type !== 'user.message') {
				continue;
			}
			const content = typeof event.data === 'object' && event.data !== null && 'content' in event.data
				? event.data.content
				: undefined;
			if (typeof content === 'string') {
				const sanitizedContent = stripReminders(content).trim();
				if (sanitizedContent.length > 0) {
					return sanitizedContent;
				}
			}
		}

		const pendingTitle = this._pendingPrompt?.trim();
		return pendingTitle || undefined;
	}

	private _waitForMcPermissionResponse(
		state: McSharedState,
		permissionRequest: PermissionRequest,
		requestId: string,
		token: CancellationToken,
	): Promise<PermissionRequestResult> {
		const promptId = permissionRequest.toolCallId ?? requestId;
		return new Promise<PermissionRequestResult>(resolve => {
			let settled = false;
			const cancellationListener = token.onCancellationRequested(() => {
				complete({ kind: 'denied-interactively-by-user' });
			});
			const complete = (result: PermissionRequestResult) => {
				if (settled) {
					return;
				}
				settled = true;
				state.mcPendingPermissionRequests.delete(promptId);
				cancellationListener?.dispose();
				resolve(result);
			};

			state.mcPendingPermissionRequests.set(promptId, { resolve: complete });
		});
	}

	private _waitForMcUserInputResponse(
		state: McSharedState,
		requestId: string,
		toolCallId: string | undefined,
		token: CancellationToken,
	): Promise<UserInputResponse | undefined> {
		return new Promise<UserInputResponse | undefined>(resolve => {
			let settled = false;
			const complete = (result: UserInputResponse | undefined) => {
				if (settled) {
					return;
				}
				settled = true;
				getMissionControlPendingUserInputRequests(state).delete(pendingRequest);
				cancellationListener?.dispose();
				resolve(result);
			};
			const pendingRequest: McPendingUserInputRequest = {
				requestId,
				toolCallId,
				resolve: complete,
			};
			const cancellationListener = token.onCancellationRequested(() => {
				complete(undefined);
			});

			getMissionControlPendingUserInputRequests(state).add(pendingRequest);
		});
	}

	/**
	 * Flush buffered events to the Mission Control API.
	 */
	private async _flushMcEvents(): Promise<void> {
		const state = this._mcState;
		if (!state || !state.mcSessionId) {
			return;
		}

		const completedCommandIds = state.mcCompletedCommandIds.splice(0);
		const shouldSendKeepAlive =
			state.mcEventBuffer.length === 0 &&
			completedCommandIds.length === 0 &&
			Date.now() - state.mcLastSubmitAttemptTimeMs >= MISSION_CONTROL_KEEPALIVE_INTERVAL_MS;
		if (state.mcEventBuffer.length === 0 && completedCommandIds.length === 0 && !shouldSendKeepAlive) {
			return;
		}

		state.mcLastSubmitAttemptTimeMs = Date.now();
		const events = state.mcEventBuffer.splice(0, 500);

		const eventTypes = events.map(e => e.type).join(', ');
		this.logService.info(`[CopilotCLISession] Flushing ${events.length} MC event(s): [${eventTypes}]${completedCommandIds.length ? ` with ${completedCommandIds.length} completed command(s)` : ''}${shouldSendKeepAlive ? ' (keepalive)' : ''}`);

		try {
			const success = await this._missionControlApiClient.submitEvents(state.mcSessionId, events, completedCommandIds);
			if (!success) {
				// Re-queue events on failure (but don't grow unbounded)
				if (state.mcEventBuffer.length < 2000) {
					state.mcEventBuffer.unshift(...events);
				}
				state.mcCompletedCommandIds.unshift(...completedCommandIds);
			} else {
				this.logService.info(`[CopilotCLISession] MC event flush OK: ${events.length} event(s)`);
			}
		} catch (err) {
			state.mcCompletedCommandIds.unshift(...completedCommandIds);
			this.logService.warn(`[CopilotCLISession] MC event submission error: ${err}`);
		}
	}

	// -- Mission Control command poller -----------------------------------

	/**
	 * Start polling Mission Control for steering commands from the web UI.
	 * Polls every 3 seconds.
	 */
	private _startMcCommandPoller(): void {
		this._stopMcCommandPoller();
		const state = this._mcState;
		if (!state) { return; }

		// Capture sessionId for use in the closure — avoid relying on `this`
		// which may be a stale CopilotCLISession instance.
		const sessionId = this.sessionId;
		const logService = this.logService;
		const missionControlApiClient = this._missionControlApiClient;

		state.mcPollInterval = setInterval(() => {
			const currentState = mcStateBySessionId.get(sessionId);
			if (!currentState || !currentState.mcSessionId) {
				return;
			}
			CopilotCLISession._pollMcCommandsStatic(sessionId, currentState, missionControlApiClient, logService).catch(err => {
				logService.warn(`[CopilotCLISession] MC command poll failed: ${err}`);
			});
		}, 3000);

		this.logService.info('[CopilotCLISession] MC command poller started');
	}

	/** Stop the MC command poller. */
	private _stopMcCommandPoller(): void {
		const state = this._mcState;
		if (state?.mcPollInterval) {
			clearInterval(state.mcPollInterval);
			state.mcPollInterval = undefined;
		}
	}

	/**
	 * Poll Mission Control for pending commands and process them.
	 * Static method to avoid capturing a stale `this` reference.
	 */
	private static async _pollMcCommandsStatic(sessionId: string, state: McSharedState, missionControlApiClient: MissionControlApiClient, logService: { info(msg: string): void; warn(msg: string): void }): Promise<void> {
		try {
			const commands = await missionControlApiClient.getPendingCommands(state.mcSessionId);
			const pendingCommandIds = new Set(commands.map(cmd => cmd.id));
			for (const processedId of state.mcProcessedCommandIds) {
				if (!pendingCommandIds.has(processedId)) {
					state.mcProcessedCommandIds.delete(processedId);
				}
			}

			for (const cmd of commands) {
				if (cmd.state !== 'in_progress' || state.mcProcessedCommandIds.has(cmd.id)) {
					continue;
				}
				state.mcProcessedCommandIds.add(cmd.id);
				logService.info(`[CopilotCLISession] Processing MC command: ${cmd.type ?? 'user_message'} (${cmd.id})`);

				switch (cmd.type) {
					case 'abort':
						for (const pendingRequest of state.mcPendingPermissionRequests.values()) {
							pendingRequest.resolve({ kind: 'denied-interactively-by-user' });
						}
						state.mcPendingPermissionRequests.clear();
						for (const pendingRequest of getMissionControlPendingUserInputRequests(state)) {
							pendingRequest.resolve(undefined);
						}
						getMissionControlPendingUserInputRequests(state).clear();
						state.mcSdkSession.abort();
						break;
					case 'ask_user_response': {
						let responsePayload: McAskUserResponsePayload | undefined;
						const trimmedContent = cmd.content.trim();
						if (trimmedContent.startsWith('{')) {
							try {
								const parsed = JSON.parse(trimmedContent) as unknown;
								if (parsed && typeof parsed === 'object') {
									responsePayload = parsed as McAskUserResponsePayload;
								}
							} catch (error) {
								logService.warn(`[CopilotCLISession] Failed to parse MC ask_user_response payload (${cmd.id}): ${error}`);
							}
						}

						const pendingRequest = getMissionControlPendingUserInputRequest(state, responsePayload);
						if (!pendingRequest) {
							logService.warn(`[CopilotCLISession] No pending MC ask_user request found for command ${cmd.id}`);
							break;
						}

						const response = getMcAskUserResponse(responsePayload, trimmedContent);
						if (!response) {
							logService.warn(`[CopilotCLISession] MC ask_user response missing answer payload (${cmd.id})`);
							break;
						}

						pendingRequest.resolve(response);
						break;
					}
					case 'permission_response': {
						const responseData = CopilotCLISession._parseMcJsonCommand<McPermissionResponseCommandData>(cmd, logService);
						const promptId = responseData?.promptId;
						if (!promptId) {
							logService.warn(`[CopilotCLISession] MC permission response missing promptId (${cmd.id})`);
							break;
						}
						const pendingRequest = state.mcPendingPermissionRequests.get(promptId);
						if (!pendingRequest) {
							logService.warn(`[CopilotCLISession] No pending MC permission request found for prompt ${promptId}`);
							break;
						}
						pendingRequest.resolve(responseData?.approved ? { kind: 'approved' } : { kind: 'denied-interactively-by-user' });
						break;
					}
					case 'user_message':
					default: {
						// Route steering messages through the VS Code chat UI so
						// they appear in the chat panel with proper rendering.
						const vsCodeApi = require('vscode') as typeof import('vscode');
						getMissionControlPendingCommandCompletionIds(state).add(cmd.id);
						setPendingCopilotCLIRequestContext(sessionId, {
							prompt: cmd.content,
							attachments: [],
							source: `command-${cmd.id}`,
						});
						vsCodeApi.commands.executeCommand(
							'workbench.action.chat.openSessionWithPrompt.copilotcli',
							{
								resource: state.mcSessionResource,
								prompt: cmd.content,
							}
						).then(undefined, err => {
							clearPendingCopilotCLIRequestContext(sessionId);
							getMissionControlPendingCommandCompletionIds(state).delete(cmd.id);
							state.mcCompletedCommandIds.push(cmd.id);
							logService.warn(`[CopilotCLISession] MC steering send failed: ${err}`);
						});
						break;
					}
				}

				if (cmd.type !== 'user_message' && cmd.type !== undefined) {
					state.mcCompletedCommandIds.push(cmd.id);
				}
			}
		} catch {
			// Silently ignore polling errors
		}
	}

	private static _parseMcJsonCommand<T extends object>(cmd: McCommand, logService: { warn(msg: string): void }): T | undefined {
		try {
			const parsed = JSON.parse(cmd.content) as unknown;
			if (parsed && typeof parsed === 'object') {
				return parsed as T;
			}
		} catch (error) {
			logService.warn(`[CopilotCLISession] Failed to parse MC command payload (${cmd.id}): ${error}`);
		}
		return undefined;
	}

	addUserMessage(content: string) {
		this._sdkSession.emit('user.message', { content });
	}

	addUserAssistantMessage(content: string) {
		this._sdkSession.emit('assistant.message', {
			messageId: `msg_${Date.now()}`,
			content
		});
	}

	public getSelectedModelId() {
		return this._sdkSession.getSelectedModel();
	}

	private _logRequest(userPrompt: string, modelId: string, attachments: Attachment[], startTimeMs: number): void {
		const markdownContent = this._renderRequestToMarkdown(userPrompt, modelId, attachments, startTimeMs);
		this._requestLogger.addEntry({
			type: LoggedRequestKind.MarkdownContentRequest,
			debugName: `Copilot CLI | ${truncate(userPrompt, 30)}`,
			startTimeMs,
			icon: ThemeIcon.fromId('worktree'),
			markdownContent,
			isConversationRequest: true
		});
	}

	private _logConversation(userPrompt: string, assistantResponse: string, modelId: string, attachments: Attachment[], startTimeMs: number, status: 'Completed' | 'Failed', errorMessage?: string): void {
		const markdownContent = this._renderConversationToMarkdown(userPrompt, assistantResponse, modelId, attachments, startTimeMs, status, errorMessage);
		this._requestLogger.addEntry({
			type: LoggedRequestKind.MarkdownContentRequest,
			debugName: `Copilot CLI | ${truncate(userPrompt, 30)}`,
			startTimeMs,
			icon: ThemeIcon.fromId('worktree'),
			markdownContent,
			isConversationRequest: true
		});
	}

	private _renderAttachments(attachments: Attachment[]): string[] {
		const lines: string[] = [];
		for (const attachment of attachments) {
			if (attachment.type === 'github_reference') {
				lines.push(`- ${attachment.title}: (${attachment.number}, ${attachment.type}, ${attachment.referenceType})`);
			} else if (attachment.type === 'blob') {
				lines.push(`- ${attachment.displayName ?? 'blob'} (${attachment.type}, ${attachment.mimeType})`);
			} else {
				lines.push(`- ${attachment.displayName} (${attachment.type}, ${attachment.type === 'selection' ? attachment.filePath : attachment.path})`);
			}
		}
		return lines;
	}

	private _renderRequestToMarkdown(userPrompt: string, modelId: string, attachments: Attachment[], startTimeMs: number): string {
		const result: string[] = [];
		result.push(`# Copilot CLI Session`);
		result.push(``);
		result.push(`## Metadata`);
		result.push(`~~~`);
		result.push(`sessionId    : ${this.sessionId}`);
		result.push(`modelId      : ${modelId}`);
		result.push(`isolation    : ${isIsolationEnabled(this.workspace) ? 'enabled' : 'disabled'}`);
		result.push(`working dir  : ${getWorkingDirectory(this.workspace)?.fsPath || '<not set>'}`);
		result.push(`startTime    : ${new Date(startTimeMs).toISOString()}`);
		result.push(`~~~`);
		result.push(``);
		result.push(`## User Prompt`);
		result.push(`~~~`);
		result.push(userPrompt);
		result.push(`~~~`);
		result.push(``);
		result.push(`## Attachments`);
		result.push(`~~~`);
		result.push(...this._renderAttachments(attachments));
		result.push(`~~~`);
		result.push(``);
		return result.join('\n');
	}

	private _renderPermissionToMarkdown(permissionRequest: PermissionRequest, response: string): string {
		const result: string[] = [];
		result.push(`# Permission Request`);
		result.push(``);
		result.push(`## Metadata`);
		result.push(`~~~`);
		result.push(`sessionId    : ${this.sessionId}`);
		result.push(`kind         : ${permissionRequest.kind}`);
		result.push(`toolCallId   : ${permissionRequest.toolCallId || ''}`);
		result.push(`~~~`);
		result.push(``);
		switch (permissionRequest.kind) {
			case 'read':
				result.push(`## Read Permission Details`);
				result.push(`~~~`);
				result.push(`path         : ${permissionRequest.path}`);
				result.push(`intention    : ${permissionRequest.intention}`);
				result.push(`~~~`);
				break;
			case 'write':
				result.push(`## Write Permission Details`);
				result.push(`~~~`);
				result.push(`path         : ${permissionRequest.fileName}`);
				result.push(`intention    : ${permissionRequest.intention}`);
				result.push(`diff         : ${permissionRequest.diff}`);
				result.push(`~~~`);
				break;
			case 'mcp':
				result.push(`## MCP Permission Details`);
				result.push(`~~~`);
				result.push(`server       : ${permissionRequest.serverName}`);
				result.push(`tool         : ${permissionRequest.toolName} (${permissionRequest.toolTitle})`);
				result.push(`readOnly     : ${permissionRequest.readOnly}`);
				result.push(`args         : ${permissionRequest.args !== undefined ? (typeof permissionRequest.args === 'string' ? permissionRequest.args : JSON.stringify(permissionRequest.args, undefined, 2)) : ''}`);
				result.push(`~~~`);
				break;
			case 'shell':
				result.push(`## Shell Permission Details`);
				result.push(`~~~`);
				result.push(`command : ${permissionRequest.fullCommandText}`);
				result.push(`intention    : ${permissionRequest.intention}`);
				result.push(`paths        : ${permissionRequest.possiblePaths}`);
				result.push(`urls         : ${permissionRequest.possibleUrls}`);
				result.push(`~~~`);
				break;
			case 'url':
				result.push(`## URL Permission Details`);
				result.push(`~~~`);
				result.push(`url      : ${permissionRequest.url}`);
				result.push(`intention    : ${permissionRequest.intention}`);
				result.push(`~~~`);
				break;
		}
		result.push(``);
		result.push(`## Response`);
		result.push(`~~~`);
		result.push(response);
		result.push(``);
		return result.join('\n');
	}

	private _renderConversationToMarkdown(userPrompt: string, assistantResponse: string, modelId: string, attachments: Attachment[], startTimeMs: number, status: 'Completed' | 'Failed', errorMessage?: string): string {
		const result: string[] = [];
		result.push(`# Copilot CLI Session`);
		result.push(``);
		result.push(`## Metadata`);
		result.push(`~~~`);
		result.push(`sessionId    : ${this.sessionId}`);
		result.push(`status       : ${status}`);
		result.push(`modelId      : ${modelId}`);
		result.push(`isolation    : ${isIsolationEnabled(this.workspace) ? 'enabled' : 'disabled'}`);
		result.push(`working dir  : ${getWorkingDirectory(this.workspace)?.fsPath || '<not set>'}`);
		result.push(`startTime    : ${new Date(startTimeMs).toISOString()}`);
		result.push(`endTime      : ${new Date().toISOString()}`);
		result.push(`duration     : ${Date.now() - startTimeMs}ms`);
		if (errorMessage) {
			result.push(`error        : ${errorMessage}`);
		}
		result.push(`~~~`);
		result.push(``);
		result.push(`## User Prompt`);
		result.push(`~~~`);
		result.push(userPrompt);
		result.push(`~~~`);
		result.push(``);
		result.push(`## Attachments`);
		result.push(`~~~`);
		result.push(...this._renderAttachments(attachments));
		result.push(`~~~`);
		result.push(``);
		result.push(`## Assistant Response`);
		result.push(`~~~`);
		result.push(assistantResponse || '(no response)');
		result.push(`~~~`);
		return result.join('\n');
	}

	private _logToolCall(toolCallId: string, toolName: string, args: unknown, eventData: { success: boolean; error?: { code: string; message: string }; result?: { content: string } }): void {
		const argsStr = args !== undefined ? (typeof args === 'string' ? args : JSON.stringify(args, undefined, 2)) : '';
		const resultStr = eventData.result?.content ?? '';
		const errorStr = eventData.error ? `Error: ${eventData.error.code} - ${eventData.error.message}` : '';

		const markdownContent = [
			`# Tool Call: ${toolName}`,
			``,
			`## Metadata`,
			`~~~`,
			`toolCallId   : ${toolCallId}`,
			`toolName     : ${toolName}`,
			`success      : ${eventData.success}`,
			`~~~`,
			``,
			`## Arguments`,
			`~~~`,
			argsStr,
			`~~~`,
			``,
			`## Result`,
			`~~~`,
			eventData.success ? resultStr : errorStr,
			`~~~`,
		].join('\n');

		this._requestLogger.addEntry({
			type: LoggedRequestKind.MarkdownContentRequest,
			debugName: `Tool: ${toolName}`,
			startTimeMs: Date.now(),
			icon: Codicon.tools,
			markdownContent,
			isConversationRequest: true
		});
	}
}

function extractPullRequestUrlFromToolResult(result: unknown): string | undefined {
	if (!result || typeof result !== 'object') {
		return undefined;
	}

	const { content } = result as { content?: unknown };
	const text = typeof content === 'string' ? content : JSON.stringify(content);

	try {
		const parsed: unknown = JSON.parse(text);
		if (parsed && typeof parsed === 'object' && 'url' in parsed) {
			const url = (parsed as { url: unknown }).url;
			if (typeof url === 'string' && isHttpUrl(url)) {
				return url;
			}
		}
	} catch {
		// not JSON
	}

	const urlMatch = text.match(/https?:\/\/[^\s"'`,;)\]}>]+/);
	if (urlMatch) {
		const cleaned = urlMatch[0].replace(/[.)\]}>]+$/, '');
		if (isHttpUrl(cleaned)) {
			return cleaned;
		}
	}

	return undefined;
}

function isHttpUrl(value: string): boolean {
	try {
		const parsed = new URL(value);
		return parsed.protocol === 'https:' || parsed.protocol === 'http:';
	} catch {
		return false;
	}
}

interface UsageInfoData {
	readonly currentTokens: number;
	readonly systemTokens?: number;
	readonly conversationTokens?: number;
	readonly toolDefinitionsTokens?: number;
	readonly tokenLimit?: number;
}

function buildPromptTokenDetails(usageInfo: UsageInfoData | undefined): { category: string; label: string; percentageOfPrompt: number }[] | undefined {
	if (!usageInfo || usageInfo.currentTokens <= 0) {
		return undefined;
	}
	const details: { category: string; label: string; percentageOfPrompt: number }[] = [];
	const total = usageInfo.currentTokens;
	if (usageInfo.systemTokens && usageInfo.systemTokens > 0) {
		details.push({
			category: PromptTokenCategory.System,
			label: PromptTokenLabel.SystemInstructions,
			percentageOfPrompt: Math.round((usageInfo.systemTokens / total) * 100),
		});
	}
	if (usageInfo.toolDefinitionsTokens && usageInfo.toolDefinitionsTokens > 0) {
		details.push({
			category: PromptTokenCategory.System,
			label: PromptTokenLabel.Tools,
			percentageOfPrompt: Math.round((usageInfo.toolDefinitionsTokens / total) * 100),
		});
	}
	if (usageInfo.conversationTokens && usageInfo.conversationTokens > 0) {
		details.push({
			category: PromptTokenCategory.UserContext,
			label: PromptTokenLabel.Messages,
			percentageOfPrompt: Math.round((usageInfo.conversationTokens / total) * 100),
		});
	}
	return details.length > 0 ? details : undefined;
}
