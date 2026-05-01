/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { PermissionRequestResult, SessionConfig, Tool, ToolResultObject } from '@github/copilot-sdk';
import { DeferredPromise } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, IReference, toDisposable } from '../../../../base/common/lifecycle.js';
import { join } from '../../../../base/common/path.js';
import { extUriBiasedIgnorePathCase, normalizePath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import type { IParsedPlugin } from '../../../agentPlugins/common/pluginParsers.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { IFileService } from '../../../files/common/files.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../log/common/log.js';
import { platformSessionSchema } from '../../common/agentHostSchema.js';
import { AgentSignal, IAgentAttachment } from '../../common/agentService.js';
import { stripRedundantCdPrefix } from '../../common/commandLineHelpers.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { ISessionDatabase, ISessionDataService } from '../../common/sessionDataService.js';
import type { FileEdit, ToolDefinition } from '../../common/state/protocol/state.js';
import { ActionType, type SessionAction } from '../../common/state/sessionActions.js';
import { ResponsePartKind, SessionInputAnswerState, SessionInputAnswerValueKind, SessionInputQuestionKind, SessionInputResponseKind, ToolCallConfirmationReason, ToolCallStatus, ToolResultContentType, type PendingMessage, type URI as ProtocolURI, type SessionInputAnswer, type SessionInputRequest, type ToolCallResult, type ToolResultContent, type Turn } from '../../common/state/sessionState.js';
import { IAgentConfigurationService } from '../agentConfigurationService.js';
import type { IExitPlanModeRequestParams, IExitPlanModeResponse } from './copilotAgent.js';
import { CopilotSessionWrapper } from './copilotSessionWrapper.js';
import type { ShellManager } from './copilotShellTools.js';
import { getEditFilePath, getInvocationMessage, getPastTenseMessage, getPermissionDisplay, getShellLanguage, getSubagentMetadata, getToolDisplayName, getToolInputString, getToolKind, isEditTool, isHiddenTool, isShellTool, synthesizeSkillToolCall, tryStringify, type ITypedPermissionRequest } from './copilotToolDisplay.js';
import { FileEditTracker } from './fileEditTracker.js';
import { mapSessionEvents } from './mapSessionEvents.js';
import { buildPendingEditContentUri } from './pendingEditContentStore.js';

/**
 * The full set of agent modes the Copilot SDK accepts. Wider than the
 * {@link SessionMode} the AHP exposes — the SDK has a first-class
 * `'autopilot'` mode while AHP models that as
 * `mode='interactive', autoApprove='autopilot'`. The Copilot agent
 * translates between the two views in {@link CopilotAgentSession.send}
 * and the `session.mode_changed` listener.
 */
export type CopilotSdkMode = 'interactive' | 'plan' | 'autopilot';

const COPILOT_HOME_DIRECTORY = '.copilot';
const SESSION_STATE_DIRECTORY = join(COPILOT_HOME_DIRECTORY, 'session-state');

/**
 * Display labels and descriptions for the SDK's `exit_plan_mode` action ids.
 * Keys not present here fall back to the raw action id.
 */
function getPlanActionDescription(actionId: string): { label: string; description: string } | undefined {
	switch (actionId) {
		case 'autopilot':
			return {
				label: localize('agentHost.planReview.autopilot.label', "Implement with Autopilot"),
				description: localize('agentHost.planReview.autopilot.description', "Auto-approve all tool calls and continue until done."),
			};
		case 'autopilot_fleet':
			return {
				label: localize('agentHost.planReview.autopilotFleet.label', "Implement with Autopilot Fleet"),
				description: localize('agentHost.planReview.autopilotFleet.description', "Auto-approve all tool calls, including fleet management actions, and continue until done."),
			};
		case 'interactive':
			return {
				label: localize('agentHost.planReview.interactive.label', "Implement Plan"),
				description: localize('agentHost.planReview.interactive.description', "Implement the plan, asking for input and approval for each action."),
			};
		case 'exit_only':
			return {
				label: localize('agentHost.planReview.exitOnly.label', "Approve Plan Only"),
				description: localize('agentHost.planReview.exitOnly.description', "Approve the plan without executing it. I will implement it myself."),
			};
		default:
			return undefined;
	}
}

type UserInputHandler = NonNullable<SessionConfig['onUserInputRequest']>;
type UserInputRequest = Parameters<UserInputHandler>[0];
type UserInputResponse = Awaited<ReturnType<UserInputHandler>>;
type SessionHooks = NonNullable<SessionConfig['hooks']>;
type PreToolUseHookInput = Parameters<NonNullable<SessionHooks['onPreToolUse']>>[0];
type PostToolUseHookInput = Parameters<NonNullable<SessionHooks['onPostToolUse']>>[0];

function getCopilotCLISessionStateDir(userHome: string): string {
	const xdgHome = process.env['XDG_STATE_HOME'];
	return xdgHome ? join(xdgHome, SESSION_STATE_DIRECTORY) : join(userHome, SESSION_STATE_DIRECTORY);
}

/**
 * Immutable snapshot of the active client's contributions at session creation
 * time. Used to detect when the session needs to be refreshed.
 */
export interface IActiveClientSnapshot {
	readonly clientId: string;
	readonly tools: readonly ToolDefinition[];
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
	readonly onUserInputRequest: (request: UserInputRequest, invocation: { sessionId: string }) => Promise<UserInputResponse>;
	readonly hooks: {
		readonly onPreToolUse: (input: PreToolUseHookInput) => Promise<void>;
		readonly onPostToolUse: (input: PostToolUseHookInput) => Promise<void>;
	};
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	readonly clientTools: Tool<any>[];
}) => Promise<CopilotSessionWrapper>;

/**
 * Options for constructing a {@link CopilotAgentSession}.
 */
export interface ICopilotAgentSessionOptions {
	readonly sessionUri: URI;
	readonly rawSessionId: string;
	readonly onDidSessionProgress: Emitter<AgentSignal>;
	readonly wrapperFactory: SessionWrapperFactory;
	readonly shellManager: ShellManager | undefined;
	/** Working directory associated with the session, used to strip redundant `cd` prefixes from shell commands. */
	readonly workingDirectory?: URI;
	/** Directory used to resolve workspace-scoped customizations for this session. */
	readonly customizationDirectory?: URI;
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
	private readonly _activeToolCalls = new Map<string, { toolName: string; displayName: string; parameters: Record<string, unknown> | undefined; content: ToolResultContent[]; parentToolCallId: string | undefined }>();
	/** Pending permission requests awaiting a renderer-side decision. */
	private readonly _pendingPermissions = new Map<string, DeferredPromise<boolean>>();
	/** Pending user input requests awaiting a renderer-side answer. */
	private readonly _pendingUserInputs = new Map<string, { deferred: DeferredPromise<{ response: SessionInputResponseKind; answers?: Record<string, SessionInputAnswer> }>; questionId: string }>();
	/**
	 * Pending plan-review requests originating from the CLI's
	 * `exitPlanMode.request` RPC. Tracked separately from
	 * {@link _pendingUserInputs} so the completion handler can resolve the
	 * RPC with a structured {@link IExitPlanModeResponse} (which the CLI
	 * forwards to `session.respondToExitPlanMode`) rather than feeding it
	 * back through the SDK's `ask_user` callback.
	 */
	private readonly _pendingPlanReviews = new Map<string, {
		readonly actions: readonly string[];
		readonly recommendedAction: string;
		readonly questionId: string;
		readonly deferred: DeferredPromise<IExitPlanModeResponse>;
	}>();
	/** File edit tracker for this session. */
	private readonly _editTracker: FileEditTracker;
	/** Session database reference. */
	private readonly _databaseRef: IReference<ISessionDatabase>;
	/** Protocol turn ID set by {@link send}, used for file edit tracking. */
	private _turnId = '';
	/** SDK session wrapper, set by {@link initializeSession}. */
	private _wrapper!: CopilotSessionWrapper;
	/** Last agent mode pushed to the SDK via {@link applyMode}, to elide redundant `rpc.mode.set` calls. */
	private _lastAppliedMode: CopilotSdkMode | undefined;

	/** Snapshot captured at session creation for refresh detection. */
	private readonly _appliedSnapshot: IActiveClientSnapshot;
	/** Tool names that are client-provided, derived from snapshot. */
	private readonly _clientToolNames: ReadonlySet<string>;
	/** Deferred promises for pending client tool calls, keyed by toolCallId. */
	private readonly _pendingClientToolCalls = new Map<string, DeferredPromise<ToolResultObject>>();
	/** `pending-edit-content:` URIs written during permission requests, keyed
	 *  by toolCallId. Cleaned up when the permission resolves or the session
	 *  is disposed. */
	private readonly _pendingEditContentUris = new Map<string, URI>();

	private readonly _onDidSessionProgress: Emitter<AgentSignal>;
	private readonly _wrapperFactory: SessionWrapperFactory;
	private readonly _shellManager: ShellManager | undefined;
	private readonly _workingDirectory: URI | undefined;
	private readonly _customizationDirectory: URI | undefined;

	/**
	 * Current markdown response part ID for the active turn. Streaming text
	 * deltas append to this part; the first delta of a turn allocates a new
	 * part ID. Reset on each new turn (in {@link send}) and invalidated when
	 * a tool call begins so subsequent text creates a fresh part.
	 */
	private _currentMarkdownPartId: string | undefined;
	/** Current reasoning response part ID for the active turn. Reset on each new turn. */
	private _currentReasoningPartId: string | undefined;
	/** Tracks whether a non-empty activity has been published, so we only emit a clear when needed. */
	private _hasReportedActivity = false;

	constructor(
		options: ICopilotAgentSessionOptions,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
		@ISessionDataService sessionDataService: ISessionDataService,
		@IFileService private readonly _fileService: IFileService,
		@INativeEnvironmentService private readonly _environmentService: INativeEnvironmentService,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
	) {
		super();
		this.sessionId = options.rawSessionId;
		this.sessionUri = options.sessionUri;
		this._onDidSessionProgress = options.onDidSessionProgress;
		this._wrapperFactory = options.wrapperFactory;
		this._shellManager = options.shellManager;
		this._workingDirectory = options.workingDirectory;
		this._customizationDirectory = options.customizationDirectory;

		this._appliedSnapshot = options.clientSnapshot ?? { clientId: '', tools: [], plugins: [] };
		this._clientToolNames = new Set(this._appliedSnapshot.tools.map(t => t.name));

		this._databaseRef = sessionDataService.openDatabase(options.sessionUri);
		this._register(toDisposable(() => this._databaseRef.dispose()));

		this._editTracker = this._instantiationService.createInstance(FileEditTracker, options.sessionUri.toString(), this._databaseRef.object);

		this._register(toDisposable(() => this._denyPendingPermissions()));
		this._register(toDisposable(() => this._shellManager?.dispose()));
		this._register(toDisposable(() => this._cancelPendingUserInputs()));
		this._register(toDisposable(() => this._cancelPendingPlanReviews()));

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

				this._emitAction({
					type: ActionType.SessionToolCallContentChanged,
					session: this._protocolSession(),
					turnId: this._turnId,
					toolCallId,
					content: tracked.content,
				});
			}));
		}
		this._register(toDisposable(() => this._cancelPendingClientToolCalls()));
	}

	// ---- AgentSignal helpers ------------------------------------------------

	private _protocolSession(): ProtocolURI {
		return this.sessionUri.toString();
	}

	/** Wraps a {@link SessionAction} in an {@link AgentSignal} envelope and emits it. */
	private _emitAction(action: SessionAction, parentToolCallId?: string): void {
		this._onDidSessionProgress.fire({
			kind: 'action',
			session: this.sessionUri,
			action,
			parentToolCallId,
		});
	}

	/**
	 * Resets per-turn streaming state so the next text/reasoning chunk
	 * allocates a fresh response part. Called by the agent when a new turn
	 * starts (typically right before {@link send}).
	 */
	resetTurnState(turnId: string): void {
		this._turnId = turnId;
		this._currentMarkdownPartId = undefined;
		this._currentReasoningPartId = undefined;
	}

	/**
	 * Emits a synthetic markdown content block for the active turn and
	 * makes it the current markdown response part so that subsequent SDK
	 * deltas append to it. Used by the agent to surface one-shot host
	 * messages (e.g. the worktree-created announcement) at the top of the
	 * first response.
	 */
	emitInitialMarkdown(content: string): void {
		this._emitMarkdownDelta(content);
	}

	/**
	 * Emits a streaming text delta. The first delta of a turn allocates a
	 * markdown response part; subsequent deltas append to it.
	 */
	private _emitMarkdownDelta(content: string, parentToolCallId?: string): void {
		const session = this._protocolSession();
		let partId = this._currentMarkdownPartId;
		if (!partId) {
			partId = generateUuid();
			this._currentMarkdownPartId = partId;
			this._emitAction({
				type: ActionType.SessionResponsePart,
				session,
				turnId: this._turnId,
				part: { kind: ResponsePartKind.Markdown, id: partId, content },
			}, parentToolCallId);
			return;
		}
		this._emitAction({
			type: ActionType.SessionDelta,
			session,
			turnId: this._turnId,
			partId,
			content,
		}, parentToolCallId);
	}

	/** Emits a reasoning delta, similar to {@link _emitMarkdownDelta} but for reasoning parts. */
	private _emitReasoningDelta(content: string): void {
		const session = this._protocolSession();
		let partId = this._currentReasoningPartId;
		if (!partId) {
			partId = generateUuid();
			this._currentReasoningPartId = partId;
			this._emitAction({
				type: ActionType.SessionResponsePart,
				session,
				turnId: this._turnId,
				part: { kind: ResponsePartKind.Reasoning, id: partId, content },
			});
			return;
		}
		this._emitAction({
			type: ActionType.SessionReasoning,
			session,
			turnId: this._turnId,
			partId,
			content,
		});
	}

	/**
	 * The snapshot of client contributions captured when this session was
	 * created. Used by the agent to detect when the session is 1stale.
	 */
	get appliedSnapshot(): IActiveClientSnapshot {
		return this._appliedSnapshot;
	}

	get customizationDirectory(): URI | undefined {
		return this._customizationDirectory;
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
			handler: async (_args: Record<string, unknown>, { toolCallId }) => {
				try {
					let deferred = this._pendingClientToolCalls.get(toolCallId);
					if (!deferred) {
						deferred = new DeferredPromise<ToolResultObject>();
						this._pendingClientToolCalls.set(toolCallId, deferred);
					}
					const result = await deferred.p;
					this._pendingClientToolCalls.delete(toolCallId);
					return result;
				} catch (error) {
					this._logService.error(error, `[Copilot:${this.sessionId}] Failed in client tool handler: tool=${def.name}, toolCallId=${toolCallId}`);
					throw error;
				}
			},
		}));
	}

	/**
	 * Resolves a pending client tool call. Returns `true` if the
	 * toolCallId was found and handled.
	 */
	handleClientToolCallComplete(toolCallId: string, result: ToolCallResult) {
		let deferred = this._pendingClientToolCalls.get(toolCallId);
		if (!deferred) {
			deferred = new DeferredPromise<ToolResultObject>();
			this._pendingClientToolCalls.set(toolCallId, deferred);
		}

		const textContent = result.content
			?.filter(c => c.type === ToolResultContentType.Text)
			.map(c => c.text)
			.join('\n') ?? '';

		const binaryResults = result.content
			?.filter(c => c.type === ToolResultContentType.EmbeddedResource)
			.map(c => {
				return { data: c.data, mimeType: c.contentType, type: c.contentType };
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
				onPreToolUse: input => this._handlePreToolUse(input),
				onPostToolUse: input => this._handlePostToolUse(input),
			},
		}));
		this._subscribeToEvents();
		this._subscribeForLogging();
	}

	// ---- session operations -------------------------------------------------

	async send(prompt: string, attachments?: IAgentAttachment[], turnId?: string, mode?: CopilotSdkMode): Promise<void> {
		if (turnId) {
			this._turnId = turnId;
		}
		this._logService.info(`[Copilot:${this.sessionId}] sendMessage called: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}" (${attachments?.length ?? 0} attachments)`);

		const sdkAttachments = attachments?.map(a => {
			const path = a.uri.scheme === 'file' ? a.uri.fsPath : a.uri.toString();
			if (a.type === 'selection') {
				return { type: 'selection' as const, filePath: path, displayName: a.displayName ?? path, text: a.text, selection: a.selection };
			}
			return { type: a.type, path, displayName: a.displayName };
		});
		if (sdkAttachments?.length) {
			this._logService.trace(`[Copilot:${this.sessionId}] Attachments: ${JSON.stringify(sdkAttachments.map(a => ({ type: a.type, path: a.type === 'selection' ? a.filePath : a.path })))}`);
		}

		await this.applyMode(mode);
		await this._wrapper.session.send({ prompt, attachments: sdkAttachments });
		this._logService.info(`[Copilot:${this.sessionId}] session.send() returned`);
	}

	/**
	 * Pushes `mode` to the SDK via `rpc.mode.set` if it differs from the
	 * last applied value. Failures are logged and swallowed so that mode
	 * propagation does not block the turn.
	 */
	async applyMode(mode: CopilotSdkMode | undefined): Promise<void> {
		if (!mode || mode === this._lastAppliedMode) {
			return;
		}
		try {
			await this._wrapper.session.rpc.mode.set({ mode });
			this._lastAppliedMode = mode;
			this._logService.info(`[Copilot:${this.sessionId}] rpc.mode.set succeeded: mode=${mode}`);
		} catch (err) {
			this._logService.error(err, `[Copilot:${this.sessionId}] rpc.mode.set failed: mode=${mode}`);
		}
	}

	async sendSteering(steeringMessage: PendingMessage): Promise<void> {
		this._logService.info(`[Copilot:${this.sessionId}] Sending steering message: "${steeringMessage.userMessage.text.substring(0, 100)}"`);
		try {
			await this._wrapper.session.send({
				prompt: steeringMessage.userMessage.text,
				mode: 'immediate',
			});
			this._onDidSessionProgress.fire({
				kind: 'steering_consumed',
				session: this.sessionUri,
				id: steeringMessage.id,
			});
		} catch (err) {
			this._logService.error(`[Copilot:${this.sessionId}] Steering message failed`, err);
		}
	}

	async getMessages(): Promise<readonly Turn[]> {
		const events = await this._wrapper.session.getMessages();
		let db: ISessionDatabase | undefined;
		try {
			db = this._databaseRef.object;
		} catch {
			// Database may not exist yet — that's fine
		}
		const result = await mapSessionEvents(this.sessionUri, db, events, this._workingDirectory);
		return result.turns;
	}

	async getSubagentMessages(parentToolCallId: string, childSessionUri: string): Promise<readonly Turn[]> {
		const events = await this._wrapper.session.getMessages();
		let db: ISessionDatabase | undefined;
		try {
			db = this._databaseRef.object;
		} catch {
			// Database may not exist yet — that's fine
		}
		const result = await mapSessionEvents(this.sessionUri, db, events, this._workingDirectory);
		return result.subagentTurnsByToolCallId.get(parentToolCallId) ?? [];
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

	async setModel(model: string, reasoningEffort?: SessionConfig['reasoningEffort']): Promise<void> {
		this._logService.info(`[Copilot:${this.sessionId}] Changing model to: ${model}`);
		await this._wrapper.session.setModel(model, { reasoningEffort });
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

		try {
			const toolCallId = request.toolCallId;
			if (!toolCallId) {
				// TODO: handle permission requests without a toolCallId by creating a synthetic tool call
				this._logService.warn(`[Copilot:${this.sessionId}] Permission request without toolCallId, auto-denying: kind=${request.kind}`);
				return { kind: 'reject' };
			}

			const sessionResourcePath = this._getInternalSessionResourcePath(request);
			if (sessionResourcePath) {
				this._logService.info(`[Copilot:${this.sessionId}] Auto-approving internal session resource ${sessionResourcePath}`);
				return { kind: 'approve-once' };
			}

			this._logService.info(`[Copilot:${this.sessionId}] Requesting confirmation for tool call: ${toolCallId}`);

			const deferred = new DeferredPromise<boolean>();
			this._pendingPermissions.set(toolCallId, deferred);

			// Derive display information from the permission request kind
			const { confirmationTitle, invocationMessage, toolInput, permissionKind, permissionPath } = getPermissionDisplay(request, this._workingDirectory);

			// For write permission requests, build an FileEdit preview so the
			// client can show a diff before the user approves or denies. This
			// awaits async filesystem operations; the SDK already calls
			// `handlePermissionRequest` from an arbitrary async context, so the
			// extra await here is fine.
			const edits = await this._buildEditsForPermission(request, toolCallId);

			// If the session was aborted/disposed while we were building the
			// preview, the deferred has already been resolved and the
			// `pending-edit-content:` entry has been cleaned up. Bail without
			// firing tool_ready.
			if (!this._pendingPermissions.has(toolCallId)) {
				return { kind: 'reject' };
			}

			// Fire a pending_confirmation signal to transition the tool to PendingConfirmation
			const toolName = request.toolName ?? request.kind;
			// Forward the tool's parentToolCallId (if any) so the host can
			// route the resulting SessionToolCallReady to the correct
			// subagent session — without it the action would land on the
			// parent session, which has no matching SessionToolCallStart.
			const parentToolCallId = this._activeToolCalls.get(toolCallId)?.parentToolCallId;
			this._onDidSessionProgress.fire({
				kind: 'pending_confirmation',
				session: this.sessionUri,
				state: {
					status: ToolCallStatus.PendingConfirmation,
					toolCallId,
					toolName,
					displayName: getToolDisplayName(toolName),
					invocationMessage,
					toolInput,
					confirmationTitle,
					edits,
				},
				permissionKind,
				permissionPath,
				parentToolCallId,
			});

			const approved = await deferred.p;
			this._logService.info(`[Copilot:${this.sessionId}] Permission response: toolCallId=${toolCallId}, approved=${approved}`);
			return { kind: approved ? 'approve-once' : 'reject' };
		} catch (error) {
			this._logService.error(error, `[Copilot:${this.sessionId}] Failed to handle permission request: kind=${request.kind}, toolCallId=${request.toolCallId ?? 'missing'}`);
			throw error;
		}
	}

	private _getInternalSessionResourcePath(request: ITypedPermissionRequest): string | undefined {
		let permissionPath: string | undefined;
		if (request.kind === 'read') {
			permissionPath = typeof request.path === 'string' ? request.path : undefined;
		} else if (request.kind === 'write') {
			permissionPath = typeof request.fileName === 'string' ? request.fileName : undefined;
		}

		if (!permissionPath) {
			return undefined;
		}

		const sessionStateDir = normalizePath(URI.file(getCopilotCLISessionStateDir(this._environmentService.userHome.fsPath)));
		const sessionDir = normalizePath(URI.joinPath(sessionStateDir, this.sessionId));
		if (!extUriBiasedIgnorePathCase.isEqualOrParent(sessionDir, sessionStateDir)) {
			return undefined;
		}

		const permissionUri = normalizePath(URI.file(permissionPath));
		return extUriBiasedIgnorePathCase.isEqualOrParent(permissionUri, sessionDir) ? permissionPath : undefined;
	}

	/**
	 * Builds an {@link FileEdit} preview for a write permission request.
	 *
	 * The `before` side references the existing file on disk directly (if it
	 * exists); the `after` side is written to the `pending-edit-content:`
	 * in-memory filesystem so the client can fetch it via `resourceRead`.
	 *
	 * Returns `undefined` for permission kinds that don't describe file
	 * edits or when the request is missing the fields needed to build a
	 * preview. If the permission request is no longer pending by the time
	 * the in-memory write completes (e.g. the session was aborted), the
	 * just-written entry is deleted so it cannot leak.
	 */
	private async _buildEditsForPermission(request: ITypedPermissionRequest, toolCallId: string): Promise<{ items: FileEdit[] } | undefined> {
		if (request.kind !== 'write') {
			return undefined;
		}
		const filePath = typeof request.fileName === 'string' ? request.fileName : undefined;
		const newFileContents = typeof request.newFileContents === 'string' ? request.newFileContents : undefined;
		if (!filePath || newFileContents === undefined) {
			return undefined;
		}

		const fileUri = URI.file(filePath);
		const fileUriStr = fileUri.toString();

		let beforeExists = false;
		try {
			beforeExists = await this._fileService.exists(fileUri);
		} catch (err) {
			this._logService.warn(`[Copilot:${this.sessionId}] Failed to check file for edit preview: ${filePath}`, err);
		}

		const afterUri = buildPendingEditContentUri(this.sessionUri.toString(), toolCallId, filePath);
		try {
			await this._fileService.writeFile(afterUri, VSBuffer.fromString(newFileContents));
		} catch (err) {
			this._logService.warn(`[Copilot:${this.sessionId}] Failed to write pending edit content for ${filePath}`, err);
			return undefined;
		}

		// If the request was already resolved (aborted/disposed) while we
		// were awaiting the write, drop the in-memory entry immediately;
		// `_deletePendingEditContent` has already run and won't run again.
		if (!this._pendingPermissions.has(toolCallId)) {
			this._fileService.del(afterUri).catch(err => {
				this._logService.warn(`[Copilot:${this.sessionId}] Failed to delete orphaned pending edit content: ${afterUri.toString()}`, err);
			});
			return undefined;
		}
		this._pendingEditContentUris.set(toolCallId, afterUri);

		const diffCounts = typeof request.diff === 'string' ? countUnifiedDiffLines(request.diff) : undefined;

		const edit: FileEdit = {
			...(beforeExists ? { before: { uri: fileUriStr, content: { uri: fileUriStr } } } : {}),
			after: { uri: fileUriStr, content: { uri: afterUri.toString() } },
			...(diffCounts ? { diff: diffCounts } : {}),
		};
		return { items: [edit] };
	}

	respondToPermissionRequest(requestId: string, approved: boolean): boolean {
		const deferred = this._pendingPermissions.get(requestId);
		if (deferred) {
			this._pendingPermissions.delete(requestId);
			this._deletePendingEditContent(requestId);
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
		request: UserInputRequest,
		_invocation: { sessionId: string },
	): Promise<UserInputResponse> {
		const isAutopilot = this._configurationService.getEffectiveValue(this.sessionUri.toString(), platformSessionSchema, SessionConfigKey.AutoApprove) === 'autopilot';
		if (isAutopilot) {
			return {
				answer: 'The user is not available to answer your question. Choose a pragmatic option best aligned with the context of the request.',
				wasFreeform: true,
			};
		}

		const questionPreview = request.question.substring(0, 100);
		try {
			const requestId = generateUuid();
			const questionId = generateUuid();
			this._logService.info(`[Copilot:${this.sessionId}] User input request: requestId=${requestId}, question="${questionPreview}"`);

			const deferred = new DeferredPromise<{ response: SessionInputResponseKind; answers?: Record<string, SessionInputAnswer> }>();
			this._pendingUserInputs.set(requestId, { deferred, questionId });

			// Build the protocol SessionInputRequest from the SDK's simple format
			const inputRequest: SessionInputRequest = {
				id: requestId,
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

			this._emitAction({
				type: ActionType.SessionInputRequested,
				session: this._protocolSession(),
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
		} catch (error) {
			this._logService.error(error, `[Copilot:${this.sessionId}] Failed to handle user input request: question="${questionPreview}"`);
			throw error;
		}
	}

	respondToUserInputRequest(requestId: string, response: SessionInputResponseKind, answers?: Record<string, SessionInputAnswer>): boolean {
		const pendingPlanReview = this._pendingPlanReviews.get(requestId);
		if (pendingPlanReview) {
			this._pendingPlanReviews.delete(requestId);
			pendingPlanReview.deferred.complete(this._resolveExitPlanMode(pendingPlanReview, response, answers));
			return true;
		}

		const pending = this._pendingUserInputs.get(requestId);
		if (pending) {
			this._pendingUserInputs.delete(requestId);
			pending.deferred.complete({ response, answers });
			return true;
		}
		return false;
	}

	/**
	 * Maps an `exit_plan_mode` input response back to an
	 * {@link IExitPlanModeResponse} that the CLI can feed into
	 * `session.respondToExitPlanMode`. Mapping rules:
	 *
	 *  - Decline / Cancel / no answer → `{ approved: false }` (model gets a
	 *    rejection result and stays in plan mode).
	 *  - Accept + freeform feedback → `{ approved: false, feedback, selectedAction? }`
	 *    (the SDK treats this as a revision request and re-emits
	 *    `exit_plan_mode.requested` after revising the plan).
	 *  - Accept + selected option → `{ approved: true, selectedAction, autoApproveEdits }`
	 *    where `autoApproveEdits` is set for the autopilot variants.
	 *
	 * `selectedAction` is validated against the SDK's offered `actions`; an
	 * unknown value is treated as a decline so the SDK isn't fed a value it
	 * cannot handle.
	 */
	private _resolveExitPlanMode(
		pending: { actions: readonly string[]; recommendedAction: string; questionId: string },
		response: SessionInputResponseKind,
		answers?: Record<string, SessionInputAnswer>,
	): IExitPlanModeResponse {
		if (response !== SessionInputResponseKind.Accept) {
			return { approved: false };
		}
		const answer = answers?.[pending.questionId];
		if (!answer || answer.state === SessionInputAnswerState.Skipped) {
			return { approved: false };
		}
		const value = answer.value;

		// Determine the selected action and any freeform feedback. The
		// `single-select` question may carry both (when the user picks an
		// option AND types feedback), or just freeform text (when the
		// user types instead of picking). Normalize to one shape.
		let candidateAction: string | undefined;
		let feedback: string | undefined;
		if (value.kind === SessionInputAnswerValueKind.Selected) {
			candidateAction = value.value;
			const freeform = value.freeformValues?.find(s => s.trim().length > 0)?.trim();
			feedback = freeform;
		} else if (value.kind === SessionInputAnswerValueKind.Text) {
			feedback = value.value.trim() || undefined;
		} else {
			return { approved: false };
		}

		// Clamp `selectedAction` to the SDK's offered set. Anything else
		// (including freeform text smuggled into the `value` field) falls
		// back to the recommended action so we never feed the SDK a value
		// it can't act on.
		const selectedAction = candidateAction && pending.actions.includes(candidateAction)
			? candidateAction
			: pending.actions.includes(pending.recommendedAction)
				? pending.recommendedAction
				: undefined;

		// Freeform feedback => revision request. The SDK semantics are
		// `approved: false` with a non-empty `feedback`; it will revise
		// the plan and re-emit `exit_plan_mode.requested`.
		if (feedback) {
			return {
				approved: false,
				feedback,
				...(selectedAction ? { selectedAction } : {}),
			};
		}

		// No selectable action and no feedback — nothing actionable.
		if (!selectedAction) {
			return { approved: false };
		}

		const isAutopilot = selectedAction === 'autopilot' || selectedAction === 'autopilot_fleet';
		return {
			approved: true,
			selectedAction,
			...(isAutopilot ? { autoApproveEdits: true } : {}),
		};
	}

	private async _handlePreToolUse(input: PreToolUseHookInput): Promise<void> {
		try {
			if (isEditTool(input.toolName)) {
				const filePath = getEditFilePath(input.toolArgs);
				if (filePath) {
					await this._editTracker.trackEditStart(filePath);
				}
			}
		} catch (error) {
			this._logService.error(error, `[Copilot:${this.sessionId}] Failed in onPreToolUse: tool=${input.toolName}`);
			throw error;
		}
	}

	private async _handlePostToolUse(input: PostToolUseHookInput): Promise<void> {
		try {
			if (isEditTool(input.toolName)) {
				const filePath = getEditFilePath(input.toolArgs);
				if (filePath) {
					await this._editTracker.completeEdit(filePath);
				}
			}
		} catch (error) {
			this._logService.error(error, `[Copilot:${this.sessionId}] Failed in onPostToolUse: tool=${input.toolName}`);
			throw error;
		}
	}

	// ---- event wiring -------------------------------------------------------

	private _subscribeToEvents(): void {
		const wrapper = this._wrapper;
		const sessionId = this.sessionId;

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
			this._emitMarkdownDelta(e.data.deltaContent, e.data.parentToolCallId);
		}));

		this._register(wrapper.onMessage(e => {
			this._logService.info(`[Copilot:${sessionId}] Full message received: ${e.data.content.length} chars`);
			// The SDK fires a `message` event with the full assembled content after
			// streaming deltas. If deltas already created a markdown part for this
			// turn, the live state is up to date and we skip. Only emit a fresh
			// part when no deltas preceded the message (e.g. text after tool calls
			// where the SDK delivered the full message at once).
			//
			// Other fields (toolRequests, reasoningText, encryptedContent) are
			// only used for history reconstruction and live tool calls fire
			// their own tool_start events, so we can safely drop them here.
			if (!e.data.content) {
				return;
			}
			if (this._currentMarkdownPartId) {
				return;
			}
			const partId = generateUuid();
			this._currentMarkdownPartId = partId;
			this._emitAction({
				type: ActionType.SessionResponsePart,
				session: this._protocolSession(),
				turnId: this._turnId,
				part: { kind: ResponsePartKind.Markdown, id: partId, content: e.data.content },
			}, e.data.parentToolCallId);
		}));

		this._register(wrapper.onToolStart(e => {
			if (isHiddenTool(e.data.toolName)) {
				this._logService.trace(`[Copilot:${sessionId}] Tool started (hidden): ${e.data.toolName}`);
				// The CLI uses the `report_intent` tool to signal what the
				// agent is currently doing. Surface this as session activity
				// so the UI can show a live "what is the agent doing now?"
				// hint while the turn is in progress.
				if (e.data.toolName === 'report_intent') {
					const intent = (e.data.arguments as { intent?: unknown } | undefined)?.intent;
					if (typeof intent === 'string' && intent.length > 0) {
						this._hasReportedActivity = true;
						this._emitAction({
							type: ActionType.SessionActivityChanged,
							session: this._protocolSession(),
							activity: intent,
						});
					}
				}
				return;
			}
			this._logService.info(`[Copilot:${sessionId}] Tool started: ${e.data.toolName}`);
			let toolArgs = e.data.arguments !== undefined ? tryStringify(e.data.arguments) : undefined;
			let parameters: Record<string, unknown> | undefined;
			if (toolArgs) {
				try { parameters = JSON.parse(toolArgs) as Record<string, unknown>; } catch { /* ignore */ }
			}
			// Strip redundant `cd <workingDirectory> && …` prefixes from shell tool
			// commands so clients see the simplified form. Mirrors the logic in
			// mapSessionEvents (which handles the history-replay path).
			if (stripRedundantCdPrefix(e.data.toolName, parameters, this._workingDirectory)) {
				toolArgs = tryStringify(parameters);
			}
			const displayName = getToolDisplayName(e.data.toolName);
			this._activeToolCalls.set(e.data.toolCallId, { toolName: e.data.toolName, displayName, parameters, content: [], parentToolCallId: e.data.parentToolCallId });
			const toolKind = getToolKind(e.data.toolName);
			const subagentMeta = toolKind === 'subagent' ? getSubagentMetadata(parameters) : undefined;
			const toolClientId = this._clientToolNames.has(e.data.toolName) ? this._appliedSnapshot.clientId : undefined;
			const parentToolCallId = e.data.parentToolCallId;

			// A new tool call invalidates the current markdown and reasoning
			// parts so the next text/reasoning delta after the tool call
			// starts a fresh part. Without invalidating reasoning here, a
			// later round of reasoning (after tool_start/tool_complete)
			// would silently append to the pre-tool-call reasoning block.
			this._currentMarkdownPartId = undefined;
			this._currentReasoningPartId = undefined;

			const meta: Record<string, unknown> = { toolKind, language: toolKind === 'terminal' ? getShellLanguage(e.data.toolName) : undefined };
			if (subagentMeta?.description) {
				meta.subagentDescription = subagentMeta.description;
			}
			if (subagentMeta?.agentName) {
				meta.subagentAgentName = subagentMeta.agentName;
			}
			if (toolArgs !== undefined) {
				meta.toolArguments = toolArgs;
			}
			if (e.data.mcpServerName) {
				meta.mcpServerName = e.data.mcpServerName;
			}
			if (e.data.mcpToolName) {
				meta.mcpToolName = e.data.mcpToolName;
			}

			const protocolSession = this._protocolSession();
			this._emitAction({
				type: ActionType.SessionToolCallStart,
				session: protocolSession,
				turnId: this._turnId,
				toolCallId: e.data.toolCallId,
				toolName: e.data.toolName,
				displayName,
				toolClientId,
				_meta: meta,
			}, parentToolCallId);

			// For client tools, do NOT auto-ready — the tool handler will fire
			// a separate tool_ready signal once the deferred is in place (or
			// the permission flow fires it first).
			if (toolClientId) {
				return;
			}

			this._emitAction({
				type: ActionType.SessionToolCallReady,
				session: protocolSession,
				turnId: this._turnId,
				toolCallId: e.data.toolCallId,
				invocationMessage: getInvocationMessage(e.data.toolName, displayName, parameters),
				toolInput: getToolInputString(e.data.toolName, parameters, toolArgs),
				confirmed: ToolCallConfirmationReason.NotNeeded,
			}, parentToolCallId);
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

			const content: ToolResultContent[] = [...tracked.content];
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

			this._emitAction({
				type: ActionType.SessionToolCallComplete,
				session: this._protocolSession(),
				turnId: this._turnId,
				toolCallId: e.data.toolCallId,
				result: {
					success: e.data.success,
					pastTenseMessage: getPastTenseMessage(tracked.toolName, displayName, tracked.parameters, e.data.success),
					content: content.length > 0 ? content : undefined,
					error: e.data.error,
				},
			}, e.data.parentToolCallId);
		}));

		this._register(wrapper.onIdle(() => {
			this._logService.info(`[Copilot:${sessionId}] Session idle`);
			// Clear any in-progress activity description set during the
			// turn (e.g. via the `report_intent` tool) — the agent is no
			// longer doing anything once the turn completes.
			if (this._hasReportedActivity) {
				this._hasReportedActivity = false;
				this._emitAction({
					type: ActionType.SessionActivityChanged,
					session: this._protocolSession(),
					activity: undefined,
				});
			}
			this._emitAction({
				type: ActionType.SessionTurnComplete,
				session: this._protocolSession(),
				turnId: this._turnId,
			});
		}));

		// The SDK emits a `skill` tool call (which we hide) and a richer
		// `skill.invoked` event with the resolved SKILL.md path. Synthesize a
		// tool-start/complete pair from the latter so the UI can render a
		// clickable file link, matching the `view`-tool display style.
		this._register(wrapper.onSkillInvoked(e => {
			this._logService.info(`[Copilot:${sessionId}] Skill invoked: ${e.data.name} (${e.data.path})`);
			const synth = synthesizeSkillToolCall(e.data, e.id);
			const protocolSession = this._protocolSession();
			this._emitAction({
				type: ActionType.SessionToolCallStart,
				session: protocolSession,
				turnId: this._turnId,
				toolCallId: synth.toolCallId,
				toolName: synth.toolName,
				displayName: synth.displayName,
			});
			this._emitAction({
				type: ActionType.SessionToolCallReady,
				session: protocolSession,
				turnId: this._turnId,
				toolCallId: synth.toolCallId,
				invocationMessage: synth.invocationMessage,
				confirmed: ToolCallConfirmationReason.NotNeeded,
			});
			this._emitAction({
				type: ActionType.SessionToolCallComplete,
				session: protocolSession,
				turnId: this._turnId,
				toolCallId: synth.toolCallId,
				result: {
					success: true,
					pastTenseMessage: synth.pastTenseMessage,
				},
			});
		}));

		this._register(wrapper.onSubagentStarted(e => {
			this._logService.info(`[Copilot:${sessionId}] Subagent started: toolCallId=${e.data.toolCallId}, agent=${e.data.agentName}`);
			this._onDidSessionProgress.fire({
				kind: 'subagent_started',
				session: this.sessionUri,
				toolCallId: e.data.toolCallId,
				agentName: e.data.agentName,
				agentDisplayName: e.data.agentDisplayName,
				agentDescription: e.data.agentDescription,
			});
		}));

		this._register(wrapper.onSessionError(e => {
			this._logService.error(`[Copilot:${sessionId}] Session error: ${e.data.errorType} - ${e.data.message}`);
			this._emitAction({
				type: ActionType.SessionError,
				session: this._protocolSession(),
				turnId: this._turnId,
				error: {
					errorType: e.data.errorType,
					message: e.data.message,
					stack: e.data.stack,
				},
			});
		}));

		this._register(wrapper.onUsage(e => {
			this._logService.trace(`[Copilot:${sessionId}] Usage: model=${e.data.model}, in=${e.data.inputTokens ?? '?'}, out=${e.data.outputTokens ?? '?'}, cacheRead=${e.data.cacheReadTokens ?? '?'}`);
			this._emitAction({
				type: ActionType.SessionUsage,
				session: this._protocolSession(),
				turnId: this._turnId,
				usage: {
					inputTokens: e.data.inputTokens,
					outputTokens: e.data.outputTokens,
					model: e.data.model,
					cacheReadTokens: e.data.cacheReadTokens,
				},
			});
		}));

		this._register(wrapper.onReasoningDelta(e => {
			this._logService.trace(`[Copilot:${sessionId}] Reasoning delta: ${e.data.deltaContent.length} chars`);
			this._emitReasoningDelta(e.data.deltaContent);
		}));

		// Sync the AHP session config when the SDK's `currentMode` changes
		// (e.g. after the model approves a plan, or after we set the mode
		// before sending). The SDK has three modes (`interactive` / `plan` /
		// `autopilot`); AHP only models `interactive` / `plan` and treats
		// autopilot as `mode='interactive', autoApprove='autopilot'`, so we
		// translate before writing.
		this._register(wrapper.onSessionModeChanged(e => {
			this._logService.info(`[Copilot:${sessionId}] session.mode_changed: ${e.data.previousMode} -> ${e.data.newMode}`);
			const newMode = e.data.newMode;
			if (newMode !== 'interactive' && newMode !== 'plan' && newMode !== 'autopilot') {
				return;
			}
			this._lastAppliedMode = newMode;
			this._syncAhpConfigFromSdkMode(newMode);
		}));
	}

	/**
	 * Translates the SDK's three-mode space (`interactive` / `plan` /
	 * `autopilot`) to AHP's two-axis model:
	 *
	 *  - SDK `plan` → AHP `mode='plan'`.
	 *  - SDK `interactive` → AHP `mode='interactive'`.
	 *  - SDK `autopilot` → AHP `mode='interactive', autoApprove='autopilot'`.
	 *    Autopilot is exposed in AHP as the highest auto-approval level on
	 *    the orthogonal `autoApprove` axis, not as a mode value.
	 *
	 * Patches that already match the current AHP values are still
	 * dispatched (the reducer is a no-op in that case) but written values
	 * propagate to all subscribed clients via `session/configChanged`.
	 */
	private _syncAhpConfigFromSdkMode(sdkMode: CopilotSdkMode): void {
		const sessionUri = this.sessionUri.toString();
		const patch: Record<string, unknown> = {};
		switch (sdkMode) {
			case 'plan':
				patch[SessionConfigKey.Mode] = 'plan';
				break;
			case 'autopilot':
				patch[SessionConfigKey.Mode] = 'interactive';
				patch[SessionConfigKey.AutoApprove] = 'autopilot';
				break;
			case 'interactive':
				patch[SessionConfigKey.Mode] = 'interactive';
				break;
		}
		this._configurationService.updateSessionConfig(sessionUri, patch);
	}

	/**
	 * Handles the CLI's `exitPlanMode.request` RPC by surfacing it as a
	 * {@link SessionInputRequest} and awaiting the client's response. The
	 * resolved {@link IExitPlanModeResponse} flows back to the CLI, which
	 * calls `session.respondToExitPlanMode` internally — that resumes the
	 * paused `exit_plan_mode` tool call and (on accept) updates the SDK's
	 * `currentMode` so the model can continue with implementation.
	 */
	async handleExitPlanModeRequest(data: IExitPlanModeRequestParams): Promise<IExitPlanModeResponse> {
		const requestId = generateUuid();
		const questionId = generateUuid();
		this._logService.info(`[Copilot:${this.sessionId}] exitPlanMode.request: rpcId=${requestId}, actions=[${data.actions.join(',')}], recommended=${data.recommendedAction}`);

		// When the session's effective auto-approval level is `autopilot`,
		// approve the plan automatically without surfacing a question to
		// the user. Mirrors the "autopilot fast-path" in the Copilot CLI's
		// own plan-mode handler.
		const autoApprove = this._configurationService.getEffectiveValue(this.sessionUri.toString(), platformSessionSchema, SessionConfigKey.AutoApprove);
		if (autoApprove === 'autopilot') {
			const response = autoApproveExitPlanMode(data);
			this._logService.info(`[Copilot:${this.sessionId}] exitPlanMode.request auto-accepted (autoApprove=autopilot): selectedAction=${response.selectedAction ?? '(none)'}`);
			return response;
		}

		// Resolve the plan file path so we can embed a markdown link.
		let planPath: string | null = null;
		try {
			const planRead = await this._wrapper.session.rpc.plan.read();
			planPath = planRead.path ?? null;
		} catch (err) {
			this._logService.warn(`[Copilot:${this.sessionId}] rpc.plan.read failed for exit_plan_mode: ${err instanceof Error ? err.message : String(err)}`);
		}

		// Build the input-request markdown: summary + link to the plan file.
		let message = data.summary || localize('agentHost.planReview.fallbackSummary', "A plan is ready for review.");
		if (planPath) {
			const planUri = URI.file(planPath);
			message += `\n\n[${localize('agentHost.planReview.viewPlanLink', "View full plan")}](${planUri.toString()})`;
		}

		this._emitMarkdownDelta(message);

		const options = data.actions.map(actionId => {
			const desc = getPlanActionDescription(actionId);
			return {
				id: actionId,
				label: desc?.label ?? actionId,
				description: desc?.description,
				recommended: actionId === data.recommendedAction,
			};
		});

		const inputRequest: SessionInputRequest = {
			id: requestId,
			questions: [{
				kind: SessionInputQuestionKind.SingleSelect,
				id: questionId,
				title: localize('agentHost.planReview.title', "Review Plan"),
				message: localize('agentHost.planReview.questionMessage', "How would you like to proceed?"),
				required: true,
				options,
				allowFreeformInput: true,
			}],
		};

		const deferred = new DeferredPromise<IExitPlanModeResponse>();
		this._pendingPlanReviews.set(requestId, {
			actions: data.actions,
			recommendedAction: data.recommendedAction,
			questionId,
			deferred,
		});

		this._onDidSessionProgress.fire({
			kind: 'action',
			session: this.sessionUri,
			action: {
				type: ActionType.SessionInputRequested,
				session: this.sessionUri.toString(),
				request: inputRequest,
			}
		});

		try {
			return await deferred.p;
		} catch (err) {
			this._logService.error(err, `[Copilot:${this.sessionId}] exitPlanMode.request handler failed: rpcId=${requestId}`);
			return { approved: false };
		}
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
		for (const [toolCallId, deferred] of this._pendingPermissions) {
			this._deletePendingEditContent(toolCallId);
			deferred.complete(false);
		}
		this._pendingPermissions.clear();
	}

	/**
	 * Removes any `pending-edit-content:` entries associated with a resolved
	 * (approved, denied, or cancelled) permission request.
	 */
	private _deletePendingEditContent(toolCallId: string): void {
		const uri = this._pendingEditContentUris.get(toolCallId);
		if (!uri) {
			return;
		}
		this._pendingEditContentUris.delete(toolCallId);
		this._fileService.del(uri).catch(err => {
			this._logService.warn(`[Copilot:${this.sessionId}] Failed to delete pending edit content: ${uri.toString()}`, err);
		});
	}

	private _cancelPendingUserInputs(): void {
		for (const [, pending] of this._pendingUserInputs) {
			pending.deferred.complete({ response: SessionInputResponseKind.Cancel });
		}
		this._pendingUserInputs.clear();
	}

	private _cancelPendingPlanReviews(): void {
		for (const [, pending] of this._pendingPlanReviews) {
			pending.deferred.complete({ approved: false });
		}
		this._pendingPlanReviews.clear();
	}

	private _cancelPendingClientToolCalls(): void {
		for (const [, deferred] of this._pendingClientToolCalls) {
			deferred.complete({ textResultForLlm: 'Tool call cancelled: session ended', resultType: 'failure', error: 'Session ended' });
		}
		this._pendingClientToolCalls.clear();
	}
}

/**
 * Builds the {@link IExitPlanModeResponse} used when the session is in
 * autopilot and we approve the plan without user interaction.
 *
 * Selection priority mirrors the Copilot CLI's own autopilot handler.
 *
 * 1. If the SDK's `recommendedAction` is offered, take it.
 * 2. Otherwise fall back to `autopilot` → `autopilot_fleet` → `interactive`
 *    → `exit_only`.
 * 3. As a last resort, approve without picking a `selectedAction` (the SDK
 *    keeps `currentMode='interactive'` in that case).
 *
 * `autoApproveEdits: true` is set whenever the chosen action is one of the
 * autopilot variants, mirroring the CLI behavior.
 */
function autoApproveExitPlanMode(data: IExitPlanModeRequestParams): IExitPlanModeResponse {
	const choices = data.actions ?? [];
	const isAutopilotAction = (action: string) => action === 'autopilot' || action === 'autopilot_fleet';

	if (data.recommendedAction && choices.includes(data.recommendedAction)) {
		const selectedAction = data.recommendedAction;
		return {
			approved: true,
			selectedAction,
			...(isAutopilotAction(selectedAction) ? { autoApproveEdits: true } : {}),
		};
	}

	for (const action of ['autopilot', 'autopilot_fleet', 'interactive', 'exit_only']) {
		if (choices.includes(action)) {
			return {
				approved: true,
				selectedAction: action,
				...(isAutopilotAction(action) ? { autoApproveEdits: true } : {}),
			};
		}
	}

	return { approved: true, autoApproveEdits: true };
}

/**
 * Counts added/removed lines in a unified diff string. Ignores the `+++` and
 * `---` header rows and any non-hunk context.
 */
function countUnifiedDiffLines(diff: string): { added: number; removed: number } | undefined {
	let added = 0;
	let removed = 0;
	for (const line of diff.split('\n')) {
		if (line.startsWith('+++') || line.startsWith('---')) {
			continue;
		}
		if (line.startsWith('+')) {
			added++;
		} else if (line.startsWith('-')) {
			removed++;
		}
	}
	if (added === 0 && removed === 0) {
		return undefined;
	}
	return { added, removed };
}
