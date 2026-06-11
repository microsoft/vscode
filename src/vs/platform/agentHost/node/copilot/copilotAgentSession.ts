/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ExitPlanModeRequest, MessageOptions, PermissionRequestResult, SessionConfig, Tool, ToolResultObject, McpServerStatus as SdkMcpServerStatus } from '@github/copilot-sdk';
import { DeferredPromise } from '../../../../base/common/async.js';
import { encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter } from '../../../../base/common/event.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Disposable, IReference, toDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { isAbsolute, join } from '../../../../base/common/path.js';
import { extUriBiasedIgnorePathCase, normalizePath } from '../../../../base/common/resources.js';
import { splitLinesIncludeSeparators } from '../../../../base/common/strings.js';
import { hasKey, isDefined, isObject, isString } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { IFileService } from '../../../files/common/files.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../log/common/log.js';
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import { AgentHostConfigKey, agentHostCustomizationConfigSchema } from '../../common/agentHostCustomizationConfig.js';
import { platformSessionSchema } from '../../common/agentHostSchema.js';
import { AgentSignal, IMcpNotification } from '../../common/agentService.js';
import { stripRedundantCdPrefix } from '../../common/commandLineHelpers.js';
import type { LanguageModelToolInvokedClassification, LanguageModelToolInvokedEvent } from '../../../telemetry/common/languageModelToolTelemetry.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { ISessionDatabase, ISessionDataService, SESSION_ATTACHMENTS_DIRNAME } from '../../common/sessionDataService.js';
import { MessageAttachmentKind, ToolCallContributorKind, type FileEdit, type MessageAttachment } from '../../common/state/protocol/state.js';
import { ActionType, type SessionAction } from '../../common/state/sessionActions.js';
import { MessageKind, ResponsePartKind, SessionInputAnswerState, SessionInputAnswerValueKind, SessionInputQuestionKind, SessionInputResponseKind, ToolCallConfirmationReason, ToolCallStatus, ToolResultContentType, type PendingMessage, type SessionInputAnswer, type SessionInputOption, type SessionInputQuestion, type SessionInputRequest, type ToolCallResult, type ToolResultContent, type Turn, type UsageInfo } from '../../common/state/sessionState.js';
import { IAgentConfigurationService } from '../agentConfigurationService.js';
import type { IExitPlanModeResponse } from './copilotAgent.js';
import { CopilotSessionWrapper } from './copilotSessionWrapper.js';
import type { CopilotSessionLaunchPlan, IActiveClientSnapshot, ICopilotSessionLauncher, ICopilotSessionRuntime } from './copilotSessionLauncher.js';
import { ActiveClientState } from '../activeClientState.js';
import { PendingRequestRegistry } from '../../common/pendingRequestRegistry.js';
import { buildCopilotSystemNotification } from './copilotSystemNotification.js';
import { parseLeadingSlashCommand } from './copilotSlashCommandCompletionProvider.js';
import type { IUnsandboxedCommandConfirmationRequest, ShellManager } from './copilotShellTools.js';
import { getEditFilePaths, getInvocationMessage, getPastTenseMessage, getPermissionDisplay, getShellLanguage, getSubagentMetadata, getToolDisplayName, getToolInputString, getToolKind, isEditTool, isHiddenTool, isShellTool, synthesizeSkillToolCall, tryStringify, type ITypedPermissionRequest } from './copilotToolDisplay.js';
import { FileEditTracker } from '../shared/fileEditTracker.js';
import { McpCustomizationController, type ISdkMcpServer } from '../shared/mcpCustomizationController.js';
import { mapSessionEvents } from './mapSessionEvents.js';
import { buildPendingEditContentUri } from './pendingEditContentStore.js';
import { McpServerStatus, type McpServerState } from '../../common/state/protocol/channels-session/state.js';

/**
 * The full set of agent modes the Copilot SDK accepts. Wider than the
 * {@link SessionMode} the AHP exposes — the SDK has a first-class
 * `'autopilot'` mode while AHP models that as
 * `mode='interactive', autoApprove='autopilot'`. The Copilot agent
 * translates between the two views in {@link CopilotAgentSession.send}
 * and the `session.mode_changed` listener.
 */
export type CopilotSdkMode = 'interactive' | 'plan' | 'autopilot';
type CopilotSdkAttachment = Required<MessageOptions>['attachments'][number];

const COPILOT_HOME_DIRECTORY = '.copilot';
const SESSION_STATE_DIRECTORY = join(COPILOT_HOME_DIRECTORY, 'session-state');
const EMPTY_TOOL_RESULT_TEXT = '<empty />';

function getEmptyToolResultText(binaryResults: readonly { readonly type: 'image' | 'resource' }[] | undefined): string {
	if (!binaryResults?.length) {
		return EMPTY_TOOL_RESULT_TEXT;
	}

	const hasImage = binaryResults.some(result => result.type === 'image');
	const hasFile = binaryResults.some(result => result.type === 'resource');
	if (hasImage && hasFile) {
		return 'Tool produced the attached image and file';
	}
	if (hasImage) {
		return 'Tool produced the attached image';
	}
	return 'Tool produced the attached file';
}

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
type ElicitationHandler = NonNullable<SessionConfig['onElicitationRequest']>;
type ElicitationContext = Parameters<ElicitationHandler>[0];
type ElicitationResult = Awaited<ReturnType<ElicitationHandler>>;
type ElicitationSchema = NonNullable<ElicitationContext['requestedSchema']>;
type ElicitationSchemaField = ElicitationSchema['properties'][string];
type ElicitationFieldValue = NonNullable<ElicitationResult['content']>[string];
type SessionHooks = NonNullable<SessionConfig['hooks']>;
type PreToolUseHookInput = Parameters<NonNullable<SessionHooks['onPreToolUse']>>[0];
type PostToolUseHookInput = Parameters<NonNullable<SessionHooks['onPostToolUse']>>[0];
type ToolUseHookInput = PreToolUseHookInput | PostToolUseHookInput;

function getToolCommand(input: ToolUseHookInput): string | undefined {
	const command = isObject(input.toolArgs) ? Reflect.get(input.toolArgs, 'command') : undefined;
	return isString(command) ? command : undefined;
}

/**
 * Projects an {@link ElicitationSchema} field into a
 * {@link SessionInputQuestion}. The schema's property key becomes the
 * question id so we can route the answer back by field name.
 */
function elicitationFieldToQuestion(fieldName: string, field: ElicitationSchemaField, required: boolean): SessionInputQuestion {
	const base = {
		id: fieldName,
		title: field.title ?? fieldName,
		message: field.description ?? field.title ?? fieldName,
		required,
	};

	switch (field.type) {
		case 'boolean':
			return { ...base, kind: SessionInputQuestionKind.Boolean, defaultValue: field.default };
		case 'integer':
		case 'number':
			return {
				...base,
				kind: field.type === 'integer' ? SessionInputQuestionKind.Integer : SessionInputQuestionKind.Number,
				min: field.minimum,
				max: field.maximum,
				defaultValue: field.default,
			};
		case 'array': {
			const options: SessionInputOption[] = hasKey(field.items, { enum: true })
				? field.items.enum.map(value => ({ id: value, label: value }))
				: field.items.anyOf.map(option => ({ id: option.const, label: option.title }));
			return {
				...base,
				kind: SessionInputQuestionKind.MultiSelect,
				options,
				min: field.minItems,
				max: field.maxItems,
			};
		}
		case 'string': {
			if (hasKey(field, { enum: true })) {
				const enumNames = field.enumNames;
				const options: SessionInputOption[] = field.enum.map((value, idx) => ({ id: value, label: enumNames?.[idx] ?? value }));
				return { ...base, kind: SessionInputQuestionKind.SingleSelect, options };
			}
			if (hasKey(field, { oneOf: true })) {
				const options: SessionInputOption[] = field.oneOf.map(option => ({ id: option.const, label: option.title }));
				return { ...base, kind: SessionInputQuestionKind.SingleSelect, options };
			}
			return {
				...base,
				kind: SessionInputQuestionKind.Text,
				format: field.format,
				min: field.minLength,
				max: field.maxLength,
				defaultValue: field.default,
			};
		}
	}
}

/**
 * Projects a {@link SessionInputAnswer} back into the
 * {@link ElicitationFieldValue} shape expected by the SDK for the given
 * schema field. Returns `undefined` when the answer is missing/skipped or
 * cannot be coerced to the field's declared type.
 */
function elicitationAnswerToFieldValue(field: ElicitationSchemaField, answer: SessionInputAnswer | undefined): ElicitationFieldValue | undefined {
	if (!answer || answer.state === SessionInputAnswerState.Skipped) {
		return undefined;
	}
	const value = answer.value;
	if (field.type === 'boolean') {
		if (value.kind === SessionInputAnswerValueKind.Boolean) { return value.value; }
		if (value.kind === SessionInputAnswerValueKind.Text) {
			if (value.value === 'true') { return true; }
			if (value.value === 'false') { return false; }
			return undefined;
		}
		return undefined;
	}
	if (field.type === 'number' || field.type === 'integer') {
		if (value.kind === SessionInputAnswerValueKind.Number) {
			return field.type === 'integer' ? Math.trunc(value.value) : value.value;
		}
		if (value.kind === SessionInputAnswerValueKind.Text) {
			if (value.value.trim() === '') { return undefined; }
			const n = Number(value.value);
			return Number.isFinite(n) ? (field.type === 'integer' ? Math.trunc(n) : n) : undefined;
		}
		return undefined;
	}
	if (field.type === 'array') {
		if (value.kind === SessionInputAnswerValueKind.SelectedMany) {
			return [...value.value, ...(value.freeformValues ?? [])];
		}
		if (value.kind === SessionInputAnswerValueKind.Selected) {
			return value.value ? [value.value, ...(value.freeformValues ?? [])] : [...(value.freeformValues ?? [])];
		}
		if (value.kind === SessionInputAnswerValueKind.Text) {
			return value.value ? [value.value] : [];
		}
		return undefined;
	}
	// field.type === 'string'
	if (value.kind === SessionInputAnswerValueKind.Text) { return value.value; }
	if (value.kind === SessionInputAnswerValueKind.Selected) { return value.value; }
	return undefined;
}

function getCopilotCLISessionStateDir(userHome: string): string {
	const xdgHome = process.env['XDG_STATE_HOME'];
	return xdgHome ? join(xdgHome, SESSION_STATE_DIRECTORY) : join(userHome, SESSION_STATE_DIRECTORY);
}

/**
 * Matches the temp file names the Copilot SDK uses when spilling large tool
 * results to disk. The SDK writes these into `os.tmpdir()` and references the
 * path back to the model so it can read the output in a follow-up turn.
 *
 * Two layouts are emitted by the SDK depending on the codepath:
 *  - `<timestamp>-copilot-tool-output-<6-char-id>.txt` (large tool result)
 *  - `copilot-tool-output-<timestamp>-<6-char-id>.txt` (streaming output buffer)
 *
 * Both live directly inside `os.tmpdir()`, so we additionally require the
 * file's parent directory to be the OS temp directory before auto-approving.
 */
const COPILOT_SDK_TOOL_OUTPUT_BASENAME_RE = /^(?:\d{10,}-copilot-tool-output-[a-z0-9]{6}|copilot-tool-output-\d{10,}-[a-z0-9]{6})\.txt$/i;

function isCopilotSdkToolOutputTempFile(filePath: string, tmpDir: string): boolean {
	const fileUri = normalizePath(URI.file(filePath));
	const tmpDirUri = normalizePath(URI.file(tmpDir));
	const parentUri = normalizePath(URI.joinPath(fileUri, '..'));
	if (!extUriBiasedIgnorePathCase.isEqual(parentUri, tmpDirUri)) {
		return false;
	}
	const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
	const basename = lastSlash >= 0 ? filePath.substring(lastSlash + 1) : filePath;
	return COPILOT_SDK_TOOL_OUTPUT_BASENAME_RE.test(basename);
}

/**
 * Options for constructing a {@link CopilotAgentSession}.
 */
export interface ICopilotAgentSessionOptions {
	readonly sessionUri: URI;
	readonly rawSessionId: string;
	readonly onDidSessionProgress: Emitter<AgentSignal>;
	readonly sessionLauncher: ICopilotSessionLauncher;
	readonly launchPlan: CopilotSessionLaunchPlan;
	readonly shellManager: ShellManager | undefined;
	/** Working directory associated with the session, used to strip redundant `cd` prefixes from shell commands. */
	readonly workingDirectory?: URI;
	/** Directory used to resolve workspace-scoped customizations for this session. */
	readonly customizationDirectory?: URI;
	/** Snapshot of the active client's tools and plugins at session creation time. */
	readonly clientSnapshot?: IActiveClientSnapshot;
	/**
	 * Looks up the AHP id of an existing child MCP customization by
	 * server name, so SDK MCP state events can target plugin-derived
	 * entries narrowly. Returns `undefined` for SDK servers that have
	 * no corresponding plugin entry — the session surfaces those as
	 * bare top-level customizations via {@link CopilotAgentSession.topLevelMcpCustomizations}.
	 */
	readonly resolveMcpChildId: (serverName: string) => string | undefined;
	/**
	 * Live holder of the owning client's identity, shared by reference with
	 * the agent's per-session {@link ActiveClient}. Read at tool-call stamp
	 * time so a window reload (new `clientId`, identical tools) stamps with
	 * the current id. When omitted, a fresh state seeded from
	 * {@link clientSnapshot} is used (test / standalone path).
	 */
	readonly activeClientState?: ActiveClientState;
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
	private readonly _activeToolCalls = new Map<string, { toolName: string; displayName: string; parameters: Record<string, unknown> | undefined; content: ToolResultContent[]; parentToolCallId: string | undefined; startTimeMs: number; mcpServerName: string | undefined }>();
	private readonly _parentToolCallIdsByAgentId = new Map<string, string>();
	/** Pending permission requests awaiting a renderer-side decision. */
	private readonly _pendingPermissions = new Map<string, DeferredPromise<boolean>>();
	/** Pending user input requests awaiting a renderer-side answer. */
	private readonly _pendingUserInputs = new Map<string, { deferred: DeferredPromise<{ response: SessionInputResponseKind; answers?: Record<string, SessionInputAnswer> }>; questionId: string }>();
	/**
	 * Pending elicitation requests awaiting a renderer-side answer. Keyed
	 * by request id; the schema is retained so the completion handler can
	 * project the submitted {@link SessionInputAnswer}s back into the
	 * SDK's {@link ElicitationResult.content} shape.
	 */
	private readonly _pendingElicitations = new Map<string, {
		readonly deferred: DeferredPromise<{ response: SessionInputResponseKind; answers?: Record<string, SessionInputAnswer> }>;
		readonly schema: ElicitationSchema | undefined;
	}>();
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
	/** On-disk root for per-session data (database, attachments, …). */
	private readonly _sessionDataDir: URI;
	/** Protocol turn ID set by {@link send}, used for file edit tracking. */
	private _turnId = '';
	/** SDK session wrapper, set by {@link initializeSession}. */
	private _wrapper!: CopilotSessionWrapper;
	/** Last agent mode pushed to the SDK via {@link applyMode}, to elide redundant `rpc.mode.set` calls. */
	private _lastAppliedMode: CopilotSdkMode | undefined;
	private readonly _steeringMessagesInFlight = new Set<string>();
	/**
	 * Steering messages that have been accepted by the SDK but not yet
	 * surfaced to the chat UI as a separate user message. When the SDK
	 * echoes a steering through a `user.message` event whose `content`
	 * matches one of these entries, we finalize the in-flight turn and
	 * dispatch a new {@link ActionType.SessionTurnStarted} whose
	 * `userMessage` is the steering content. The reducer also removes
	 * the pending steering via the action's `queuedMessageId`.
	 *
	 * Entries left here at abort/dispose time are flushed as
	 * `steering_consumed` signals so the chat UI's pending state still
	 * clears in cleanup paths where we never observe the echo.
	 */
	private readonly _pendingSteeringFlips = new Map<string, PendingMessage>();

	/** Snapshot captured at session creation for refresh detection. */
	private readonly _appliedSnapshot: IActiveClientSnapshot;
	/**
	 * Live owning-client identity, read at tool-call stamp time so a window
	 * reload that re-pushes identical tools with a new `clientId` stamps
	 * subsequent client tool calls with the current id rather than the one
	 * frozen into {@link _appliedSnapshot}.
	 */
	private readonly _activeClientState: ActiveClientState;
	/** Tool names that are client-provided, derived from snapshot. */
	private readonly _clientToolNames: ReadonlySet<string>;
	/** Deferred promises for pending client tool calls, keyed by toolCallId. */
	private readonly _pendingClientToolCalls = new PendingRequestRegistry<ToolResultObject>();
	/** `pending-edit-content:` URIs written during permission requests, keyed
	 *  by toolCallId. Cleaned up when the permission resolves or the session
	 *  is disposed. */
	private readonly _pendingEditContentUris = new Map<string, URI>();

	private readonly _onDidSessionProgress: Emitter<AgentSignal>;
	private readonly _sessionLauncher: ICopilotSessionLauncher;
	private readonly _launchPlan: CopilotSessionLaunchPlan;
	private readonly _shellManager: ShellManager | undefined;
	private readonly _workingDirectory: URI | undefined;
	private readonly _customizationDirectory: URI | undefined;
	/** Bridges SDK-reported MCP server state into AHP customization actions. */
	private readonly _mcpCustomizations: McpCustomizationController;

	/**
	 * Fans MCP server notifications (today: `notifications/tools/list_changed`)
	 * up to the agent and on to the protocol server. Fired by the
	 * `onToolsUpdated` listener once per ready MCP channel.
	 */
	private readonly _onMcpNotification = this._register(new Emitter<IMcpNotification>());
	readonly onMcpNotification = this._onMcpNotification.event;

	/**
	 * Pending MCP `sampling/createMessage` requests received over the
	 * AHP `mcp://` channel, keyed by the cancellation handle we passed
	 * into {@link rpc.mcp.executeSampling}. Tracked so that session
	 * teardown can issue a best-effort
	 * {@link rpc.mcp.cancelSamplingExecution} for each one instead of
	 * leaving the SDK-side promise (and the upstream App) hanging.
	 */
	private readonly _pendingMcpSamplings = new Set<string>();

	/**
	 * Current markdown response part IDs for the active turn, keyed by
	 * `parentToolCallId ?? ''`. Parent and subagent text stream through the
	 * same SDK session but land in different AHP sessions, so their markdown
	 * part state must not mask or append to each other.
	 */
	private readonly _currentMarkdownPartIds = new Map<string, string>();
	/** Current reasoning response part IDs for the active turn, keyed by `parentToolCallId ?? ''`. */
	private readonly _currentReasoningPartIds = new Map<string, string>();
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
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super();
		this.sessionId = options.rawSessionId;
		this.sessionUri = options.sessionUri;
		this._onDidSessionProgress = options.onDidSessionProgress;
		this._sessionLauncher = options.sessionLauncher;
		this._launchPlan = options.launchPlan;
		this._shellManager = options.shellManager;
		this._workingDirectory = options.workingDirectory;
		this._customizationDirectory = options.customizationDirectory;

		this._appliedSnapshot = options.clientSnapshot ?? { tools: [], plugins: [] };
		this._clientToolNames = new Set(this._appliedSnapshot.tools.map(t => t.name));
		// Share the agent's live ActiveClientState when provided so clientId
		// changes are observed at stamp time. Standalone / test construction
		// seeds a private instance with the applied tools and no owning client.
		if (options.activeClientState) {
			this._activeClientState = options.activeClientState;
		} else {
			this._activeClientState = new ActiveClientState();
			this._activeClientState.update(undefined, this._appliedSnapshot.tools);
		}

		this._databaseRef = sessionDataService.openDatabase(options.sessionUri);
		this._register(toDisposable(() => this._databaseRef.dispose()));
		this._sessionDataDir = sessionDataService.getSessionDataDir(options.sessionUri);

		this._editTracker = this._instantiationService.createInstance(FileEditTracker, options.sessionUri.toString(), this._databaseRef.object);

		this._mcpCustomizations = this._register(new McpCustomizationController({
			providerId: this.sessionUri.scheme,
			sessionId: this.sessionId,
			resolveChildId: options.resolveMcpChildId,
			emit: action => this._emitAction(action),
		}));

		this._register(toDisposable(() => this._denyPendingPermissions()));
		this._register(toDisposable(() => this._shellManager?.dispose()));
		this._register(toDisposable(() => this._cancelPendingUserInputs()));
		this._register(toDisposable(() => this._cancelPendingElicitations()));
		this._register(toDisposable(() => this._cancelPendingPlanReviews()));
		this._register(toDisposable(() => this._drainPendingSteeringFlips()));
		this._register(toDisposable(() => this._cancelPendingMcpSamplings()));

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
					turnId: this._turnId,
					toolCallId,
					content: tracked.content,
				});
			}));
		}
		this._register(toDisposable(() => this._cancelPendingClientToolCalls()));
	}

	// ---- AgentSignal helpers ------------------------------------------------

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
	 * Promotes a pending steering message into its own protocol turn:
	 * closes the in-flight turn (so its responseParts settle into history)
	 * and dispatches {@link ActionType.SessionTurnStarted} for a fresh
	 * turn whose user message is the steering content. The action's
	 * `queuedMessageId` atomically clears the corresponding pending
	 * steering message from the session state.
	 *
	 * All subsequent SDK events (message deltas, tool calls, …) emitted
	 * by the agent now reference the new `_turnId`, so the steering
	 * response lands in the new turn rather than being folded into the
	 * original.
	 *
	 * Returns the new turn id so callers (notably the `user.message`
	 * handler) can associate the SDK event id with the steering turn for
	 * history.truncate / sessions.fork mapping.
	 */
	private _beginSteeringTurn(steering: PendingMessage): string {
		const previousTurnId = this._turnId;
		if (previousTurnId) {
			this._emitAction({
				type: ActionType.SessionTurnComplete,
				turnId: previousTurnId,
			});
		}
		const newTurnId = generateUuid();
		this._emitAction({
			type: ActionType.SessionTurnStarted,
			turnId: newTurnId,
			message: steering.message,
			queuedMessageId: steering.id,
		});
		// Mirror `resetTurnState` so per-turn counters/mappings (usage
		// total, streaming part ids, subagent agentId map) don't bleed
		// from the preempted turn into the new steering turn.
		this.resetTurnState(newTurnId);
		return newTurnId;
	}

	/**
	 * Drains any steering messages we acknowledged to the SDK but never
	 * promoted to their own turn (e.g. on abort or session dispose). Fires
	 * `steering_consumed` so the chat UI removes the lingering pending
	 * steering bubble even when no fresh `user.message` arrives.
	 */
	private _drainPendingSteeringFlips(): void {
		if (this._pendingSteeringFlips.size === 0) {
			return;
		}
		const ids = [...this._pendingSteeringFlips.keys()];
		this._pendingSteeringFlips.clear();
		for (const id of ids) {
			this._onDidSessionProgress.fire({
				kind: 'steering_consumed',
				session: this.sessionUri,
				id,
			});
		}
	}

	/**
	 * Pops the buffered steering message whose text matches the SDK
	 * `user.message` content we just observed. Matching by content (rather
	 * than just popping FIFO) keeps us robust against the SDK reordering
	 * or coalescing entries — concurrent steering messages with different
	 * texts are still matched to the correct one. Returns `undefined` if
	 * no buffered entry matches; the caller treats the `user.message` as
	 * an ordinary echo and skips the turn flip.
	 */
	private _takeMatchingPendingSteering(content: string): PendingMessage | undefined {
		if (this._pendingSteeringFlips.size === 0) {
			return undefined;
		}
		for (const [id, msg] of this._pendingSteeringFlips) {
			if (msg.message.text === content) {
				this._pendingSteeringFlips.delete(id);
				return msg;
			}
		}
		return undefined;
	}

	private _parentToolCallIdForSubagentEvent(e: { readonly agentId?: string }): string | undefined {
		return e.agentId ? this._parentToolCallIdsByAgentId.get(e.agentId) : undefined;
	}

	private _shouldDropUnmappedSubagentEvent(e: { readonly agentId?: string }, eventName: string): boolean {
		const parentToolCallId = this._parentToolCallIdForSubagentEvent(e);
		if (!parentToolCallId && e.agentId) {
			this._logService.warn(`[Copilot:${this.sessionId}] Dropping ${eventName} for unknown subagent agentId=${e.agentId}`);
			return true;
		}
		return false;
	}

	/**
	 * Resets per-turn streaming state so the next text/reasoning chunk
	 * allocates a fresh response part for the new turn.
	 */
	resetTurnState(turnId: string): void {
		this._turnId = turnId;
		this._currentMarkdownPartIds.clear();
		this._currentReasoningPartIds.clear();
		this._parentToolCallIdsByAgentId.clear();
	}

	private _completeActiveTurn(): void {
		if (!this._turnId) {
			return;
		}
		const turnId = this._turnId;
		this._emitAction({
			type: ActionType.SessionTurnComplete,
			turnId,
		});
		this._turnId = '';
		this._currentMarkdownPartIds.clear();
		this._currentReasoningPartIds.clear();
		this._parentToolCallIdsByAgentId.clear();
	}

	private _getEditFilePaths(parameters: unknown): string[] {
		return getEditFilePaths(parameters).map(path => this._resolveEditFilePath(path));
	}

	private _resolveEditFilePath(path: string): string {
		if (isAbsolute(path) || !this._workingDirectory || this._workingDirectory.scheme !== Schemas.file) {
			return path;
		}
		return join(this._workingDirectory.fsPath, path);
	}

	private _sendToolInvokedTelemetry(success: boolean, errorCode: string | undefined, toolCall: { readonly toolName: string; readonly startTimeMs: number; readonly mcpServerName: string | undefined }): void {
		let result: LanguageModelToolInvokedEvent['result'];
		if (success) {
			result = 'success';
		} else if (errorCode === 'rejected' || errorCode === 'denied' || errorCode === 'cancelled') {
			result = 'userCancelled';
		} else {
			result = 'error';
		}

		const isClientTool = this._clientToolNames.has(toolCall.toolName);
		const toolSourceKind = toolCall.mcpServerName ? 'mcp' : isClientTool ? 'client' : 'agentHost';
		const invocationTimeMs = Date.now() - toolCall.startTimeMs;

		this._telemetryService.publicLog2<LanguageModelToolInvokedEvent, LanguageModelToolInvokedClassification>('languageModelToolInvoked', {
			result,
			chatSessionId: this.sessionUri.toString(),
			toolId: toolCall.toolName,
			toolExtensionId: undefined,
			toolSourceKind,
			invocationTimeMs,
		});
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
		const markdownScope = parentToolCallId ?? '';
		let partId = this._currentMarkdownPartIds.get(markdownScope);
		if (!partId) {
			partId = generateUuid();
			this._currentMarkdownPartIds.set(markdownScope, partId);
			this._emitAction({
				type: ActionType.SessionResponsePart,
				turnId: this._turnId,
				part: { kind: ResponsePartKind.Markdown, id: partId, content },
			}, parentToolCallId);
			return;
		}
		this._emitAction({
			type: ActionType.SessionDelta,
			turnId: this._turnId,
			partId,
			content,
		}, parentToolCallId);
	}

	/** Emits a reasoning delta, similar to {@link _emitMarkdownDelta} but for reasoning parts. */
	private _emitReasoningDelta(content: string, parentToolCallId?: string): void {
		const reasoningScope = parentToolCallId ?? '';
		let partId = this._currentReasoningPartIds.get(reasoningScope);
		if (!partId) {
			partId = generateUuid();
			this._currentReasoningPartIds.set(reasoningScope, partId);
			this._emitAction({
				type: ActionType.SessionResponsePart,
				turnId: this._turnId,
				part: { kind: ResponsePartKind.Reasoning, id: partId, content },
			}, parentToolCallId);
			return;
		}
		this._emitAction({
			type: ActionType.SessionReasoning,
			turnId: this._turnId,
			partId,
			content,
		}, parentToolCallId);
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
	 * applied snapshot. The handler parks a request in
	 * {@link _pendingClientToolCalls} and waits for the client to dispatch
	 * `session/toolCallComplete`.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private _createClientSdkTools(): Tool<any>[] {
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
					// The completion may legitimately arrive before this handler
					// registers; the registry buffers early results so register()
					// resolves immediately in that case.
					return await this._pendingClientToolCalls.register(toolCallId);
				} catch (error) {
					this._logService.error(error, `[Copilot:${this.sessionId}] Failed in client tool handler: tool=${def.name}, toolCallId=${toolCallId}`);
					throw error;
				}
			},
		}));
	}

	/**
	 * Resolves a pending client tool call. If the SDK handler has not yet
	 * registered for `toolCallId`, the result is buffered so the handler
	 * resolves immediately once it does.
	 */
	handleClientToolCallComplete(toolCallId: string, result: ToolCallResult) {
		const textContent = result.content
			?.filter(c => c.type === ToolResultContentType.Text)
			.map(c => c.text)
			.join('\n') ?? '';

		const binaryResults = result.content
			?.filter(c => c.type === ToolResultContentType.EmbeddedResource)
			.map(c => ({ data: c.data, mimeType: c.contentType, type: (/^image(\/|$)/.test(c.contentType) ? 'image' : 'resource') as 'image' | 'resource' }));
		const textResultForLlm = textContent.trim() ? textContent : getEmptyToolResultText(binaryResults);

		if (result.success) {
			this._pendingClientToolCalls.respondOrBuffer(toolCallId, {
				textResultForLlm,
				resultType: 'success',
				binaryResultsForLlm: binaryResults?.length ? binaryResults : undefined,
			});
		} else {
			this._pendingClientToolCalls.respondOrBuffer(toolCallId, {
				textResultForLlm: textContent.trim() ? textContent : result.error?.message || 'Tool call failed',
				resultType: 'failure',
				error: result.error?.message,
				binaryResultsForLlm: binaryResults?.length ? binaryResults : undefined,
			});
		}
	}

	/**
	 * Creates (or resumes) the SDK session via the injected launcher and
	 * wires up all event listeners. Must be called exactly once after
	 * construction before using the session.
	 */
	async initializeSession(): Promise<void> {
		const wrapper = await this._sessionLauncher.launch(this._launchPlan, this._createRuntimeAdapter());
		// The session may have been disposed while we were awaiting the
		// launcher. If so, dispose the freshly-created wrapper and
		// skip subscribing — registering on a disposed store would leak.
		if (this._store.isDisposed) {
			wrapper.dispose();
			throw new CancellationError();
		}
		this._wrapper = this._register(wrapper);
		this._subscribeToEvents();
		this._subscribeForLogging();
	}

	private _createRuntimeAdapter(): ICopilotSessionRuntime {
		return {
			handlePermissionRequest: request => this._handlePermissionRequest(request),
			handleExitPlanModeRequest: (request, invocation) => this._handleExitPlanModeRequest(request, invocation),
			handleUserInputRequest: (request, invocation) => this._handleUserInputRequest(request, invocation),
			handleElicitationRequest: context => this._handleElicitationRequest(context),
			requestUnsandboxedCommandConfirmation: request => this._requestUnsandboxedCommandConfirmation(request),
			createClientSdkTools: () => this._createClientSdkTools(),
			handlePreToolUse: input => this._handlePreToolUse(input),
			handlePostToolUse: input => this._handlePostToolUse(input),
		};
	}

	// ---- session operations -------------------------------------------------

	async send(prompt: string, attachments?: readonly MessageAttachment[], turnId?: string, mode?: CopilotSdkMode): Promise<void> {
		if (turnId) {
			this._turnId = turnId;
		}
		this._logService.info(`[Copilot:${this.sessionId}] sendMessage called: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}" (${attachments?.length ?? 0} attachments)`);

		const slashCommand = parseLeadingSlashCommand(prompt);
		if (slashCommand?.command === 'compact') {
			try {
				await this._wrapper.session.rpc.history.compact();
			} catch (err) {
				this._logService.error(err, `[Copilot:${this.sessionId}] rpc.history.compact failed`);
				throw err;
			}
			// `/compact` is handled inline via the history RPC rather than by
			// driving an SDK turn, so the SDK never fires `onIdle` to close the
			// turn. Complete the turn here so the session returns to idle
			// instead of spinning forever.
			this._completeActiveTurn();
			return;
		}
		if (slashCommand?.command === 'research') {
			prompt = slashCommand.rest ? `/research ${slashCommand.rest}` : '/research';
		}
		if (slashCommand?.command === 'plan') {
			mode = 'plan';
			prompt = slashCommand.rest;
		}
		if (slashCommand?.command === 'rubber-duck') {
			if (this._configurationService.getRootValue(agentHostCustomizationConfigSchema, AgentHostConfigKey.RubberDuck) !== true) {
				// Feature not enabled — pass the remaining text through as a plain
				// message rather than injecting agent instructions for an unavailable agent.
				prompt = slashCommand.rest;
			} else {
				const userPrompt = slashCommand.rest;
				prompt = userPrompt
					? `The user has requested a rubber duck review via the /rubber-duck command. Use the task tool with agent_type: "rubber-duck" to get an independent critique of your current approach, plan, or recent work. Summarize the relevant context for the rubber duck agent so it has what it needs to evaluate it.\n\nAdditional instructions: ${userPrompt}`
					: 'The user has requested a rubber duck review via the /rubber-duck command. Use the task tool with agent_type: "rubber-duck" to get an independent critique of your current approach, plan, or recent work. Summarize the relevant context for the rubber duck agent so it has what it needs to evaluate it.';
			}
		}

		const sdkAttachments = attachments?.length
			? (await Promise.all(attachments.map(a => this._toSdkAttachment(a)))).filter(isDefined)
			: undefined;
		if (sdkAttachments?.length) {
			this._logService.trace(`[Copilot:${this.sessionId}] Attachments: ${JSON.stringify(sdkAttachments.map(a => ({ type: a.type })))}`);
		}

		await this.applyMode(mode);
		await this._wrapper.session.send({ prompt, attachments: sdkAttachments?.length ? sdkAttachments : undefined });
		this._logService.info(`[Copilot:${this.sessionId}] session.send() returned`);
	}

	/**
	 * Translate a protocol {@link MessageAttachment} into the Copilot CLI
	 * SDK's `attachments` payload shape. Resource attachments map to the
	 * SDK's reference-style `file`/`directory`/`selection` variants (the
	 * {@link MessageAttachmentBase.displayKind} advisory hint controls
	 * which one). Embedded resources (e.g. inline image bytes) map to the
	 * SDK's `blob` variant.
	 * Simple attachments with a model representation map to `text/plain`
	 * blob attachments.
	 *
	 * For selections we read the resource content from disk and slice it
	 * by the carried range (the protocol's {@link TextSelection} only
	 * carries the range, not the inline text). On read failure the
	 * selection downgrades to a plain file reference.
	 */
	private async _toSdkAttachment(attachment: MessageAttachment): Promise<CopilotSdkAttachment | undefined> {
		if (attachment.type === MessageAttachmentKind.Simple) {
			if (attachment.modelRepresentation) {
				return {
					type: 'blob' as const,
					data: encodeBase64(VSBuffer.fromString(attachment.modelRepresentation)),
					mimeType: 'text/plain',
					displayName: attachment.label,
				};
			}
			return undefined;
		}
		if (attachment.type === MessageAttachmentKind.EmbeddedResource) {
			return { type: 'blob' as const, data: attachment.data, mimeType: attachment.contentType, displayName: attachment.label };
		}
		if (attachment.type !== MessageAttachmentKind.Resource) {
			return undefined;
		}
		const uri = URI.parse(attachment.uri);
		const path = uri.scheme === 'file' ? uri.fsPath : uri.toString();
		const displayName = attachment.label ?? path;
		if (attachment.displayKind === 'selection' && attachment.selection) {
			try {
				const text = await this._readSelectedText(uri, attachment.selection.range);
				return { type: 'selection' as const, filePath: path, displayName, text, selection: attachment.selection.range };
			} catch (err) {
				this._logService.warn(`[Copilot:${this.sessionId}] Failed to read selected text for ${uri.toString()}: ${err}`);
				return { type: 'file' as const, path, displayName };
			}
		}
		if (attachment.displayKind === 'selection') {
			return { type: 'file' as const, path, displayName };
		}
		const type = attachment.displayKind === 'directory' ? 'directory' : 'file';
		return { type, path, displayName };
	}

	private async _readSelectedText(uri: URI, range: { readonly start: { readonly line: number; readonly character: number }; readonly end: { readonly line: number; readonly character: number } }): Promise<string> {
		const content = await this._fileService.readFile(uri);
		const text = content.value.toString();
		// AHP carries the resource range; the public SDK can carry the selected text too.
		// This reads the resource URI, so unsaved editor changes are not included.
		const lines = splitLinesIncludeSeparators(text);
		const start = this._getOffsetAt(lines, range.start);
		const end = this._getOffsetAt(lines, range.end);
		return text.substring(start, Math.max(start, end));
	}

	private _getOffsetAt(lines: readonly string[], position: { readonly line: number; readonly character: number }): number {
		const line = Math.max(0, Math.min(position.line, lines.length - 1));
		let offset = 0;
		for (let i = 0; i < line; i++) {
			offset += lines[i].length;
		}
		const lineText = lines[line].replace(/\r\n|\r|\n$/, '');
		return offset + Math.max(0, Math.min(position.character, lineText.length));
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
		if (this._steeringMessagesInFlight.has(steeringMessage.id) || this._pendingSteeringFlips.has(steeringMessage.id)) {
			return;
		}
		this._steeringMessagesInFlight.add(steeringMessage.id);
		this._logService.info(`[Copilot:${this.sessionId}] Sending steering message: "${steeringMessage.message.text.substring(0, 100)}"`);
		try {
			await this._wrapper.session.send({
				prompt: steeringMessage.message.text,
				mode: 'immediate',
			});
			this._pendingSteeringFlips.set(steeringMessage.id, steeringMessage);
		} catch (err) {
			this._logService.error(`[Copilot:${this.sessionId}] Steering message failed`, err);
		} finally {
			this._steeringMessagesInFlight.delete(steeringMessage.id);
		}
	}

	async getMessages(): Promise<readonly Turn[]> {
		const events = await this._wrapper.session.getEvents();
		let db: ISessionDatabase | undefined;
		try {
			db = this._databaseRef.object;
		} catch {
			// Database may not exist yet — that's fine
		}
		const result = await mapSessionEvents(this.sessionUri, db, events, this._workingDirectory);
		return result.turns;
	}

	async getSubagentMessages(parentToolCallId: string): Promise<readonly Turn[]> {
		const events = await this._wrapper.session.getEvents();
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
		this._drainPendingSteeringFlips();
		await this._wrapper.session.abort();
	}

	/**
	 * Explicitly destroys the underlying SDK session and waits for cleanup
	 * to complete. Call this before {@link dispose} when you need to ensure
	 * the session's on-disk data is no longer locked (e.g. before
	 * truncation or fork operations that modify the session files).
	 */
	async destroySession(): Promise<void> {
		await this._wrapper.session.disconnect();
	}

	async setModel(model: string, reasoningEffort?: SessionConfig['reasoningEffort']): Promise<void> {
		this._logService.info(`[Copilot:${this.sessionId}] Changing model to: ${model}`);
		await this._wrapper.session.setModel(model, { reasoningEffort });
	}

	/**
	 * Dispatches an MCP JSON-RPC method received on the `mcp://` side
	 * channel to the Copilot SDK's `session.rpc.mcp.*` surface.
	 *
	 * Mapping:
	 *  - `tools/list` → `rpc.mcp.apps.listTools`
	 *  - `tools/call` → `rpc.mcp.apps.callTool`
	 *  - `resources/read` → `rpc.mcp.apps.readResource`
	 *  - `resources/list` → `rpc.mcp.apps.listResources` (empty list fallback)
	 *  - `resources/templates/list` → `rpc.mcp.apps.listResourceTemplates` (empty list fallback)
	 *  - `sampling/createMessage` → `rpc.mcp.executeSampling`
	 *
	 * Other MCP methods are rejected with `Method not found` (the caller
	 * translates that into a JSON-RPC `-32601`).
	 */
	async handleMcpRequest(serverName: string, method: string, params: Record<string, unknown> | undefined): Promise<unknown> {
		const apps = this._wrapper.session.rpc.mcp.apps;
		switch (method) {
			case 'tools/list':
				return apps.listTools({ serverName, originServerName: serverName });
			case 'tools/call': {
				const name = params && typeof params['name'] === 'string' ? params['name'] : undefined;
				if (!name) {
					throw new Error(`tools/call missing 'name' parameter`);
				}
				const rawArgs = params ? params['arguments'] : undefined;
				const args = isObject(rawArgs) ? rawArgs as Record<string, unknown> : undefined;
				return apps.callTool({ serverName, toolName: name, arguments: args, originServerName: serverName });
			}
			case 'resources/read': {
				const uri = params && typeof params['uri'] === 'string' ? params['uri'] : undefined;
				if (!uri) {
					throw new Error(`resources/read missing 'uri' parameter`);
				}
				return apps.readResource({ serverName, uri });
			}
			case 'resources/list': {
				// Not implemented in the SDK yet
				return { resources: [] };
			}
			case 'resources/templates/list': {
				// Not implemented in the SDK yet
				return { resourceTemplates: [] };
			}
			case 'sampling/createMessage':
				return this._handleSamplingCreateMessage(serverName, params);
			default:
				throw new Error(`Method not found: ${method}`);
		}
	}

	/**
	 * Forwards an App→host `sampling/createMessage` request received
	 * over the AHP `mcp://` channel to `rpc.mcp.executeSampling`. The
	 * Copilot runtime owns the MCP→chat-completion conversion and the
	 * sampling response shape, so we pass the raw MCP params through
	 * untouched and return the SDK's result directly.
	 *
	 * Resolves the JSON-RPC request with the `CreateMessageResult` on
	 * success and rejects on failure/cancellation, mirroring the
	 * `sampling/createMessage` MCP contract.
	 */
	private async _handleSamplingCreateMessage(serverName: string, params: Record<string, unknown> | undefined): Promise<unknown> {
		if (!params) {
			throw new Error(`sampling/createMessage missing params`);
		}

		const requestId = generateUuid();
		const mcpRequestId = generateUuid();
		this._pendingMcpSamplings.add(requestId);
		try {
			const result = await this._wrapper.session.rpc.mcp.executeSampling({
				requestId,
				serverName,
				mcpRequestId,
				request: params,
			});
			if (result.action === 'success') {
				return result.result ?? null;
			}
			throw new Error(`sampling/createMessage ${result.action}${result.error ? `: ${result.error}` : ''}`);
		} finally {
			this._pendingMcpSamplings.delete(requestId);
		}
	}

	/**
	 * Selects (or clears) a custom agent on the live SDK session.
	 * Mirrors the SDK's `rpc.agent.select` / `rpc.agent.deselect` pair.
	 */
	async setAgent(agentName?: string): Promise<void> {
		if (agentName) {
			const name = agentName;
			this._logService.info(`[Copilot:${this.sessionId}] Selecting custom agent: ${name}`);
			try {
				await this._wrapper.session.rpc.agent.select({ name });
			} catch (err) {
				this._logService.error(err, `[Copilot:${this.sessionId}] rpc.agent.select failed: name=${name}`);
				throw err;
			}
		} else {
			this._logService.info(`[Copilot:${this.sessionId}] Clearing custom agent selection`);
			try {
				await this._wrapper.session.rpc.agent.deselect();
			} catch (err) {
				this._logService.error(err, `[Copilot:${this.sessionId}] rpc.agent.deselect failed`);
				throw err;
			}
		}
	}

	// ---- permission handling ------------------------------------------------

	/**
	 * Handles a permission request from the SDK by firing a `tool_ready` event
	 * (which transitions the tool to PendingConfirmation) and waiting for the
	 * side-effects layer to respond via {@link respondToPermissionRequest}.
	 */
	private async _handlePermissionRequest(
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

			// Auto-approve reads of files under the session's attachments
			// directory. The agent host writes user-message attachments
			// (pasted images, snapshotted client-side files, etc.) there
			// before dispatching the turn; the agent ends up needing to
			// read those same files back, and prompting the user to
			// approve a read of bytes they themselves attached is
			// redundant.
			if (request.kind === 'read' && typeof request.path === 'string'
				&& this._isSessionAttachmentPath(request.path)
			) {
				this._logService.info(`[Copilot:${this.sessionId}] Auto-approving session attachment ${request.path}`);
				return { kind: 'approve-once' };
			}

			// Auto-approve reads of large-tool-output temp files written by the
			// Copilot SDK itself. The SDK spills oversized tool results to
			// `os.tmpdir()/copilot-tool-output-…txt` and then asks the model
			// to read them back in a follow-up turn — no need to confirm.
			if (request.kind === 'read' && typeof request.path === 'string') {
				if (isCopilotSdkToolOutputTempFile(request.path, this._environmentService.tmpDir.fsPath)) {
					this._logService.info(`[Copilot:${this.sessionId}] Auto-approving Copilot SDK tool-output temp file ${request.path}`);
					return { kind: 'approve-once' };
				}
			}

			const isShellRequest = request.kind === 'shell'
				|| (request.kind === 'custom-tool' && typeof request.toolName === 'string' && isShellTool(request.toolName));

			this._logService.info(`[Copilot:${this.sessionId}] Requesting confirmation for tool call: ${toolCallId}`);

			const deferred = new DeferredPromise<boolean>();
			this._pendingPermissions.set(toolCallId, deferred);

			if (isShellRequest && await this._isShellSandboxedByDefault()) {
				// Session may have been disposed while we awaited the engine
				// check; if so the deferred has already been settled and
				// removed, so leave it alone.
				if (this._pendingPermissions.get(toolCallId) === deferred) {
					this._pendingPermissions.delete(toolCallId);
					this._logService.info(`[Copilot:${this.sessionId}] Auto-approving sandboxed shell command for tool call ${toolCallId}`);
					return { kind: 'approve-once' };
				}
				return { kind: 'reject' };
			}

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
	 * Returns true when `permissionPath` lives under this session's
	 * `<sessionDataDir>/attachments` directory — i.e. the bytes were
	 * written by the agent host's user-message attachment rewriter and so
	 * are already user-supplied content that does not need to be
	 * re-confirmed via a permission prompt.
	 */
	private _isSessionAttachmentPath(permissionPath: string): boolean {
		const attachmentsDir = normalizePath(URI.joinPath(this._sessionDataDir, SESSION_ATTACHMENTS_DIRNAME));
		const permissionUri = normalizePath(URI.file(permissionPath));
		return extUriBiasedIgnorePathCase.isEqualOrParent(permissionUri, attachmentsDir);
	}

	/**
	 * Returns true when our custom shell tool is registered and the
	 * {@link TerminalSandboxEngine} reports sandboxing is enabled — i.e.
	 * shell commands run inside the sandbox by default. The shell tool
	 * prompts on its own when escalating to unsandboxed execution, so the
	 * SDK's pre-call permission prompt is redundant in that case.
	 *
	 * Returns false when shell tools are not registered (the SDK's built-in
	 * terminal runs unsandboxed unless `AgentHostConfigKey.EnableCustomTerminalTool`
	 * is set)
	 * so the standard confirmation flow is preserved.
	 */
	private async _isShellSandboxedByDefault(): Promise<boolean> {
		if (!this._shellManager) {
			return false;
		}
		if (this._configurationService.getRootValue(agentHostCustomizationConfigSchema, AgentHostConfigKey.EnableCustomTerminalTool) !== true) {
			return false;
		}
		return this._shellManager.getOrCreateSandboxEngine().isEnabled();
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

	private async _requestUnsandboxedCommandConfirmation(request: IUnsandboxedCommandConfirmationRequest): Promise<boolean> {
		const deferred = new DeferredPromise<boolean>();
		this._pendingPermissions.set(request.toolCallId, deferred);

		const displayName = getToolDisplayName(request.toolName);
		const blockedDomains = request.blockedDomains?.length ? request.blockedDomains.join(', ') : undefined;
		const confirmationTitle = blockedDomains
			? localize('agentHost.unsandboxedCommandConfirmation.title.blockedDomains', "Run Command Outside the Sandbox to Access {0}?", blockedDomains)
			: localize('agentHost.unsandboxedCommandConfirmation.title.generic', "Run Command Outside the Sandbox?");
		const invocationMessage = request.reason
			? localize('agentHost.unsandboxedCommandConfirmation.reason', "Reason for leaving the sandbox: {0}", request.reason)
			: blockedDomains
				? localize('agentHost.unsandboxedCommandConfirmation.blockedDomains', "This command needs to access blocked network domain(s): {0}.", blockedDomains)
				: localize('agentHost.unsandboxedCommandConfirmation.generic', "This command needs to run outside the sandbox.");

		this._onDidSessionProgress.fire({
			kind: 'pending_confirmation',
			session: this.sessionUri,
			state: {
				status: ToolCallStatus.PendingConfirmation,
				toolCallId: request.toolCallId,
				toolName: request.toolName,
				displayName,
				invocationMessage,
				toolInput: request.command,
				confirmationTitle,
			},
			// Intentionally omit `permissionKind: 'shell'`: that would route this
			// through the shell rule-based auto-approver and silently approve
			// common safe commands (`pwd`, `ls`, etc.) without prompting.
			// Mirrors the workbench's sandbox-aware analyzer, which forces
			// `isAutoApproveAllowed: false` whenever `requiresUnsandboxConfirmation`
			// is set.
			parentToolCallId: this._activeToolCalls.get(request.toolCallId)?.parentToolCallId,
		});

		return deferred.p;
	}

	// ---- user input handling ------------------------------------------------

	/**
	 * Handles a user input request from the SDK (ask_user tool) by firing a
	 * `user_input_request` progress event and waiting for the renderer to
	 * respond via {@link respondToUserInputRequest}.
	 */
	private async _handleUserInputRequest(
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

	/**
	 * Handles an elicitation request from the SDK (MCP server / tool prompt)
	 * by firing a `session/inputRequested` action and waiting for the
	 * renderer to respond via {@link respondToUserInputRequest}.
	 *
	 * - `form` mode requests are projected from the SDK's
	 *   {@link ElicitationSchema} into a list of
	 *   {@link SessionInputQuestion}s.
	 * - `url` mode requests surface as a question-less input request whose
	 *   {@link SessionInputRequest.url} drives the renderer's "open URL"
	 *   affordance.
	 *
	 * Under autopilot the request is auto-cancelled — there is no user
	 * available to fill in a form, and accepting with empty content would
	 * be misleading to the MCP server.
	 */
	private async _handleElicitationRequest(context: ElicitationContext): Promise<ElicitationResult> {
		const isAutopilot = this._configurationService.getEffectiveValue(this.sessionUri.toString(), platformSessionSchema, SessionConfigKey.AutoApprove) === 'autopilot';
		if (isAutopilot) {
			return { action: 'cancel' };
		}

		const messagePreview = context.message.substring(0, 100);
		try {
			const requestId = generateUuid();
			this._logService.info(`[Copilot:${this.sessionId}] Elicitation request: requestId=${requestId}, mode=${context.mode ?? 'form'}, source=${context.elicitationSource ?? '<unknown>'}, message="${messagePreview}"`);

			const schema = context.mode === 'url' ? undefined : context.requestedSchema;
			const requiredSet = new Set(schema?.required ?? []);
			const questions: SessionInputQuestion[] | undefined = schema
				? Object.entries(schema.properties).map(([fieldName, field]) => elicitationFieldToQuestion(fieldName, field, requiredSet.has(fieldName)))
				: undefined;

			const deferred = new DeferredPromise<{ response: SessionInputResponseKind; answers?: Record<string, SessionInputAnswer> }>();
			this._pendingElicitations.set(requestId, { deferred, schema });

			const inputRequest: SessionInputRequest = {
				id: requestId,
				message: context.message,
				...(context.mode === 'url' && context.url ? { url: context.url } : {}),
				...(questions && questions.length > 0 ? { questions } : {}),
			};

			this._emitAction({
				type: ActionType.SessionInputRequested,
				request: inputRequest,
			});

			const result = await deferred.p;
			this._logService.info(`[Copilot:${this.sessionId}] Elicitation response: requestId=${requestId}, response=${result.response}`);

			if (result.response === SessionInputResponseKind.Decline) {
				return { action: 'decline' };
			}
			if (result.response !== SessionInputResponseKind.Accept) {
				return { action: 'cancel' };
			}
			const answers = result.answers ?? {};
			if (!schema) {
				const freeform = answers.answer;
				if (freeform && freeform.state !== SessionInputAnswerState.Skipped && freeform.value.kind === SessionInputAnswerValueKind.Text) {
					return { action: 'accept', content: { answer: freeform.value.value } };
				}
				return { action: 'accept' };
			}
			const content: Record<string, ElicitationFieldValue> = {};
			for (const [fieldName, field] of Object.entries(schema.properties)) {
				const value = elicitationAnswerToFieldValue(field, answers[fieldName]);
				if (value !== undefined) {
					content[fieldName] = value;
				}
			}
			return { action: 'accept', content };
		} catch (error) {
			this._logService.error(error, `[Copilot:${this.sessionId}] Failed to handle elicitation request: message="${messagePreview}"`);
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

		const pendingElicitation = this._pendingElicitations.get(requestId);
		if (pendingElicitation) {
			this._pendingElicitations.delete(requestId);
			pendingElicitation.deferred.complete({ response, answers });
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
			if (isEditTool(input.toolName, getToolCommand(input))) {
				const filePaths = this._getEditFilePaths(input.toolArgs);
				await Promise.all(filePaths.map(p => this._editTracker.trackEditStart(p)));
			}
		} catch (error) {
			this._logService.error(error, `[Copilot:${this.sessionId}] Failed in onPreToolUse: tool=${input.toolName}`);
			throw error;
		}
	}

	private async _handlePostToolUse(input: PostToolUseHookInput): Promise<void> {
		try {
			if (isEditTool(input.toolName, getToolCommand(input))) {
				const filePaths = this._getEditFilePaths(input.toolArgs);
				await Promise.all(filePaths.map(p => this._editTracker.completeEdit(p)));
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

		this._register(wrapper.onSystemNotification(e => {
			const notification = buildCopilotSystemNotification(e);
			if (!notification) {
				this._logService.trace(`[Copilot:${sessionId}] Ignoring system.notification kind=${e.data.kind.type}`);
				return;
			}

			this._logService.info(`[Copilot:${sessionId}] System notification received: kind=${e.data.kind.type}`);
			if (this._turnId) {
				this._emitAction({
					type: ActionType.SessionResponsePart,
					turnId: this._turnId,
					part: {
						kind: ResponsePartKind.SystemNotification,
						content: notification.content,
					},
				});
				return;
			}

			const turnId = generateUuid();
			this.resetTurnState(turnId);
			this._emitAction({
				type: ActionType.SessionTurnStarted,
				turnId,
				message: {
					text: notification.messageText,
					origin: { kind: MessageKind.SystemNotification },
				},
			});
		}));

		// Handle `user.message` events with three responsibilities:
		//
		// 1. Skip SDK-injected (`source !== 'user'`) messages outright —
		//    they are skill content / harness injections that must not
		//    surface to the user and must not be associated with a turn
		//    boundary (the SDK's truncate/fork mapping keys off the
		//    user-visible message's event id).
		//
		// 2. If the content matches a steering message we acknowledged
		//    via {@link sendSteering}, promote it to its own protocol
		//    turn (closing the in-flight turn) BEFORE step 3 so the
		//    event id is recorded against the new steering turn rather
		//    than the preempted one.
		//
		// 3. Record the SDK event id against the current turn so the
		//    `history.truncate` / `sessions.fork` RPCs can target the
		//    right boundary. The DB only sets `event_id` when it's NULL,
		//    so doing this for synthetic injections would permanently
		//    pin the wrong event to the turn.
		this._register(wrapper.onUserMessage(e => {
			if (e.data.source && e.data.source.toLowerCase() !== 'user') {
				return;
			}
			const steering = this._takeMatchingPendingSteering(e.data.content);
			if (steering) {
				this._beginSteeringTurn(steering);
			}
			if (this._turnId) {
				this._databaseRef.object.setTurnEventId(this._turnId, e.id);
			}
		}));

		this._register(wrapper.onMessageDelta(e => {
			this._logService.trace(`[Copilot:${sessionId}] delta: ${e.data.deltaContent}`);
			if (this._shouldDropUnmappedSubagentEvent(e, 'assistant.message_delta')) {
				return;
			}
			this._emitMarkdownDelta(e.data.deltaContent, this._parentToolCallIdForSubagentEvent(e));
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
			if (this._shouldDropUnmappedSubagentEvent(e, 'assistant.message')) {
				return;
			}
			const parentToolCallId = this._parentToolCallIdForSubagentEvent(e);
			const markdownScope = parentToolCallId ?? '';
			if (this._currentMarkdownPartIds.has(markdownScope)) {
				return;
			}
			const partId = generateUuid();
			this._currentMarkdownPartIds.set(markdownScope, partId);
			this._emitAction({
				type: ActionType.SessionResponsePart,
				turnId: this._turnId,
				part: { kind: ResponsePartKind.Markdown, id: partId, content: e.data.content },
			}, parentToolCallId);
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
			if (this._shouldDropUnmappedSubagentEvent(e, 'tool.execution_start')) {
				return;
			}
			const parentToolCallId = this._parentToolCallIdForSubagentEvent(e);
			this._activeToolCalls.set(e.data.toolCallId, { toolName: e.data.toolName, displayName, parameters, content: [], parentToolCallId, startTimeMs: Date.now(), mcpServerName: e.data.mcpServerName });
			const toolKind = getToolKind(e.data.toolName);
			const subagentMeta = toolKind === 'subagent' ? getSubagentMetadata(parameters) : undefined;

			let contributor: { readonly kind: ToolCallContributorKind.Client; readonly clientId: string } | undefined;
			const isClientTool = this._clientToolNames.has(e.data.toolName);
			if (isClientTool && this._activeClientState.clientId) {
				contributor = { kind: ToolCallContributorKind.Client, clientId: this._activeClientState.clientId };
			}

			// A new tool call invalidates the current markdown and reasoning
			// parts so the next text/reasoning delta after the tool call
			// starts a fresh part. Without invalidating reasoning here, a
			// later round of reasoning (after tool_start/tool_complete)
			// would silently append to the pre-tool-call reasoning block.
			this._currentMarkdownPartIds.delete(parentToolCallId ?? '');
			this._currentReasoningPartIds.delete(parentToolCallId ?? '');

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

			this._emitAction({
				type: ActionType.SessionToolCallStart,
				turnId: this._turnId,
				toolCallId: e.data.toolCallId,
				toolName: e.data.toolName,
				displayName,
				contributor,
				_meta: meta,
			}, parentToolCallId);

			// No client is connected to run this client tool. Fail it
			// immediately instead of leaving it pending until the
			// server-side disconnect timeout fires. We emit the completion
			// ourselves and drop the active-tool entry so the SDK's own
			// tool.execution_complete for this id is suppressed.
			if (isClientTool && !contributor) {
				this._logService.warn(`[Copilot:${sessionId}] Client tool '${e.data.toolName}' started with no connected client; failing it immediately.`);
				this._activeToolCalls.delete(e.data.toolCallId);
				this._emitAction({
					type: ActionType.SessionToolCallReady,
					turnId: this._turnId,
					toolCallId: e.data.toolCallId,
					invocationMessage: getInvocationMessage(e.data.toolName, displayName, parameters),
					toolInput: getToolInputString(e.data.toolName, parameters, toolArgs),
					confirmed: ToolCallConfirmationReason.NotNeeded,
				}, parentToolCallId);
				this._emitAction({
					type: ActionType.SessionToolCallComplete,
					turnId: this._turnId,
					toolCallId: e.data.toolCallId,
					result: {
						success: false,
						pastTenseMessage: `${displayName} failed`,
						error: { message: `No client was connected to run ${displayName}` },
					},
				}, parentToolCallId);
				this._pendingClientToolCalls.respondOrBuffer(e.data.toolCallId, {
					textResultForLlm: `No client was connected to run ${displayName}.`,
					resultType: 'failure',
					error: 'No client connected',
				});
				return;
			}

			// For client tools, do NOT auto-ready — the tool handler will fire
			// a separate tool_ready signal once the deferred is in place (or
			// the permission flow fires it first).
			if (contributor) {
				return;
			}

			this._emitAction({
				type: ActionType.SessionToolCallReady,
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
			const parentToolCallId = tracked.parentToolCallId ?? this._parentToolCallIdForSubagentEvent(e);
			if (!parentToolCallId && e.agentId) {
				this._logService.warn(`[Copilot:${this.sessionId}] Dropping tool.execution_complete for unknown subagent agentId=${e.agentId}`);
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

			const command = isString(tracked.parameters?.command) ? tracked.parameters.command : undefined;
			const filePaths = isEditTool(tracked.toolName, command) ? this._getEditFilePaths(tracked.parameters) : [];
			for (const filePath of filePaths) {
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

			this._sendToolInvokedTelemetry(e.data.success, e.data.error?.code, tracked);
			this._emitAction({
				type: ActionType.SessionToolCallComplete,
				turnId: this._turnId,
				toolCallId: e.data.toolCallId,
				result: {
					success: e.data.success,
					pastTenseMessage: getPastTenseMessage(tracked.toolName, displayName, tracked.parameters, e.data.success),
					content: content.length > 0 ? content : undefined,
					error: e.data.error,
				},
			}, parentToolCallId);
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
					activity: undefined,
				});
			}
			this._completeActiveTurn();
		}));

		// The SDK emits a `skill` tool call (which we hide) and a richer
		// `skill.invoked` event with the resolved SKILL.md path. Synthesize a
		// tool-start/complete pair from the latter so the UI can render a
		// clickable file link, matching the `view`-tool display style.
		this._register(wrapper.onSkillInvoked(e => {
			this._logService.info(`[Copilot:${sessionId}] Skill invoked: ${e.data.name} (${e.data.path})`);
			const synth = synthesizeSkillToolCall(e.data, e.id);
			this._emitAction({
				type: ActionType.SessionToolCallStart,
				turnId: this._turnId,
				toolCallId: synth.toolCallId,
				toolName: synth.toolName,
				displayName: synth.displayName,
			});
			this._emitAction({
				type: ActionType.SessionToolCallReady,
				turnId: this._turnId,
				toolCallId: synth.toolCallId,
				invocationMessage: synth.invocationMessage,
				confirmed: ToolCallConfirmationReason.NotNeeded,
			});
			this._emitAction({
				type: ActionType.SessionToolCallComplete,
				turnId: this._turnId,
				toolCallId: synth.toolCallId,
				result: {
					success: true,
					pastTenseMessage: synth.pastTenseMessage,
				},
			});
		}));

		this._register(wrapper.onSubagentStarted(e => {
			if (e.agentId) {
				this._parentToolCallIdsByAgentId.set(e.agentId, e.data.toolCallId);
			}
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
				turnId: this._turnId,
				error: {
					errorType: e.data.errorType,
					message: e.data.message,
					stack: e.data.stack,
				},
			});
		}));

		this._register(wrapper.onUsage(e => {
			const metadata: Record<string, unknown> = {};
			if (typeof e.data.cost === 'number') {
				metadata.cost = e.data.cost;
			}
			this._logService.trace(`[Copilot:${sessionId}] Usage: model=${e.data.model}, in=${e.data.inputTokens ?? '?'}, out=${e.data.outputTokens ?? '?'}, cacheRead=${e.data.cacheReadTokens ?? '?'}, cost=${e.data.cost ?? '?'}`);
			const usage: UsageInfo = {
				inputTokens: e.data.inputTokens,
				outputTokens: e.data.outputTokens,
				model: e.data.model,
				cacheReadTokens: e.data.cacheReadTokens,
				...(Object.keys(metadata).length > 0 ? { _meta: metadata } : {}),
			};
			this._emitAction({
				type: ActionType.SessionUsage,
				turnId: this._turnId,
				usage,
			});
		}));

		this._register(wrapper.onReasoningDelta(e => {
			this._logService.trace(`[Copilot:${sessionId}] Reasoning delta: ${e.data.deltaContent.length} chars`);
			if (this._shouldDropUnmappedSubagentEvent(e, 'assistant.reasoning_delta')) {
				return;
			}
			this._emitReasoningDelta(e.data.deltaContent, this._parentToolCallIdForSubagentEvent(e));
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

		// Translate SDK-reported MCP server lifecycle into AHP customization
		// actions. The controller decides whether each server is a
		// plugin-derived child (narrow `SessionMcpServerStateChanged`) or a
		// bare top-level entry (`SessionCustomizationUpdated`).
		this._register(wrapper.onMcpServersLoaded(e => {
			this._applyMcpServerList(e.data.servers);
		}));
		this._register(wrapper.onMcpServerStatusChanged(e => {
			const server = this._toSdkMcpServer(e.data.serverName, e.data.status, e.data.error);
			if (!server) {
				this._mcpCustomizations.remove(e.data.serverName);
				return;
			}
			this._mcpCustomizations.applyOne(server);
		}));

		this._register(wrapper.onToolsUpdated(() => {
			this._fireMcpToolsListChanged();
		}));

		// Seed the inventory with any servers the SDK has already loaded by
		// the time we attach. The `session.mcp_servers_loaded` event may
		// have fired before our subscription (e.g. for restored sessions or
		// when servers are configured at session-creation time), and there
		// is no replay. Subsequent `applyAll` calls from the event are
		// idempotent, so this safely converges either way.
		this._seedMcpServersFromRpc();
	}

	/**
	 * One-shot fetch of `rpc.mcp.list` at subscription time. Best-effort:
	 * any failure is logged and the inventory simply stays empty until the
	 * next live event arrives.
	 */
	private _seedMcpServersFromRpc(): void {
		const mcpRpc = this._wrapper.session.rpc?.mcp;
		if (!mcpRpc) {
			// Older SDKs (and test mocks) may not expose the MCP RPC surface.
			return;
		}
		mcpRpc.list().then(result => {
			if (this._store.isDisposed) {
				return;
			}
			this._applyMcpServerList(result.servers);
		}, err => {
			this._logService.warn(`[Copilot:${this.sessionId}] Failed to seed MCP server inventory`, err);
		});
	}

	private _applyMcpServerList(servers: readonly { readonly name: string; readonly status: SdkMcpServerStatus; readonly error?: string }[]): void {
		const sdkServers = servers
			.map(s => this._toSdkMcpServer(s.name, s.status, s.error))
			.filter(isDefined);
		this._mcpCustomizations.applyAll(sdkServers);
	}

	/**
	 * Broadcasts `notifications/tools/list_changed` for every MCP server
	 * currently in the `Ready` state. The SDK's `session.tools_updated`
	 * event is a coarse "tools refreshed" hint that doesn't identify
	 * which server changed, so we fan out to all ready channels. Clients
	 * are expected to refetch `tools/list` on each notification.
	 */
	private _fireMcpToolsListChanged(): void {
		for (const { channel } of this._mcpCustomizations.readyChannels()) {
			this._onMcpNotification.fire({
				channel,
				method: 'notifications/tools/list_changed',
			});
		}
	}

	/** Snapshot of MCP servers that have no plugin-derived child entry. */
	topLevelMcpCustomizations() {
		return this._mcpCustomizations.topLevelCustomizations();
	}

	/**
	 * Translates the SDK's flat MCP status string into AHP's discriminated
	 * {@link McpServerState} union. Returns `undefined` for
	 * `not_configured`, which has no AHP equivalent — the server is
	 * dropped from the inventory.
	 *
	 * V1 maps `needs-auth` to {@link McpServerStatus.Starting}: OAuth
	 * handling is intentionally out of scope, so authRequired transitions
	 * are masked as "still connecting" until the auth pipeline lands.
	 */
	private _toSdkMcpServer(name: string, status: SdkMcpServerStatus, error?: string): ISdkMcpServer | undefined {
		const state = this._translateSdkMcpStatus(status, error);
		if (!state) {
			return undefined;
		}
		return { name, state };
	}

	private _translateSdkMcpStatus(status: SdkMcpServerStatus, error?: string): McpServerState | undefined {
		switch (status) {
			case 'connected':
				return { kind: McpServerStatus.Ready };
			case 'failed':
				return {
					kind: McpServerStatus.Error,
					error: {
						errorType: 'mcp-server-failed',
						message: error ?? 'MCP server failed to start',
					},
				};
			case 'pending':
			case 'needs-auth':
				// TODO: surface `needs-auth` as McpServerStatus.AuthRequired
				// once OAuth wiring is in place.
				return { kind: McpServerStatus.Starting };
			case 'disabled':
				return { kind: McpServerStatus.Stopped };
			case 'not_configured':
				return undefined;
			default:
				return undefined;
		}
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
	private async _handleExitPlanModeRequest(data: ExitPlanModeRequest, _invocation: { sessionId: string }): Promise<IExitPlanModeResponse> {
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
			this._logService.trace(`[Copilot:${sessionId}] Session shutdown: type=${e.data.shutdownType}, apiDuration=${e.data.totalApiDurationMs}ms`);
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
			if (e.agentId) {
				this._parentToolCallIdsByAgentId.delete(e.agentId);
			}
			this._logService.trace(`[Copilot:${sessionId}] Subagent completed: ${e.data.agentName}`);
			this._onDidSessionProgress.fire({
				kind: 'subagent_completed',
				session: this.sessionUri,
				toolCallId: e.data.toolCallId,
			});
		}));

		this._register(wrapper.onSubagentFailed(e => {
			if (e.agentId) {
				this._parentToolCallIdsByAgentId.delete(e.agentId);
			}
			this._logService.error(`[Copilot:${sessionId}] Subagent failed: ${e.data.agentName} - ${e.data.error}`);
			this._onDidSessionProgress.fire({
				kind: 'subagent_completed',
				session: this.sessionUri,
				toolCallId: e.data.toolCallId,
			});
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

	private _cancelPendingElicitations(): void {
		for (const [, pending] of this._pendingElicitations) {
			pending.deferred.complete({ response: SessionInputResponseKind.Cancel });
		}
		this._pendingElicitations.clear();
	}

	private _cancelPendingPlanReviews(): void {
		for (const [, pending] of this._pendingPlanReviews) {
			pending.deferred.complete({ approved: false });
		}
		this._pendingPlanReviews.clear();
	}

	private _cancelPendingMcpSamplings(): void {
		const pending = Array.from(this._pendingMcpSamplings);
		this._pendingMcpSamplings.clear();
		for (const requestId of pending) {
			this._wrapper.session.rpc.mcp.cancelSamplingExecution({ requestId }).catch(() => {
				// Best-effort: SDK may have already torn down.
			});
		}
	}

	private _cancelPendingClientToolCalls(): void {
		this._pendingClientToolCalls.denyAll({ textResultForLlm: 'Tool call cancelled: session ended', resultType: 'failure', error: 'Session ended' });
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
function autoApproveExitPlanMode(data: ExitPlanModeRequest): IExitPlanModeResponse {
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
