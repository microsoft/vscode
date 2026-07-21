/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotSession, ExitPlanModeRequest, MessageOptions, PermissionAllowAllMode, PermissionAutoApproval, PermissionRequestResult, SessionConfig, Tool, ToolResultObject, McpServerStatus as SdkMcpServerStatus } from '@github/copilot-sdk';
import { DeferredPromise, Sequencer } from '../../../../base/common/async.js';
import { encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter } from '../../../../base/common/event.js';
import { CancellationError, getErrorMessage } from '../../../../base/common/errors.js';
import { escapeMarkdownSyntaxTokens } from '../../../../base/common/htmlContent.js';
import { Disposable, IReference, toDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { isAuthorizationProtectedResourceMetadata } from '../../../../base/common/oauth.js';
import { safeStringify } from '../../../../base/common/objects.js';
import { isAbsolute, join } from '../../../../base/common/path.js';
import { extUriBiasedIgnorePathCase, normalizePath } from '../../../../base/common/resources.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { splitLinesIncludeSeparators } from '../../../../base/common/strings.js';
import { hasKey, isDefined, isObject, isString, type Mutable } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { IFileService } from '../../../files/common/files.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { ILogService, LogLevel } from '../../../log/common/log.js';
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import { CopilotCliConfigKey, copilotCliConfigSchema } from '../../common/copilotCliConfig.js';
import type { ChatInputRequestWithPlanReview, IAgentHostPlanReviewAction } from '../../common/agentHostPlanReview.js';
import { gitHubMcpServerUrl } from '../../common/githubEndpoints.js';
import { AgentHostSandboxConfigKey, sandboxConfigSchema } from '../../common/sandboxConfigSchema.js';
import { AgentHostGlobalAutoApproveEnabledConfigKey, AgentHostAutoReplyEnabledConfigKey, platformRootSchema, platformSessionSchema } from '../../common/agentHostSchema.js';
import { AgentSession, AgentSignal, AuthenticateParams, IMcpNotification, IRestoredSubagentSession, subagentChatTitle } from '../../common/agentService.js';
import { stripRedundantCdPrefix } from '../../common/commandLineHelpers.js';
import { readToolCallMeta, toToolCallMeta, type IToolCallMeta, type IToolCallUiMeta } from '../../common/meta/agentToolCallMeta.js';
import { OtelData, type OtelAttributeValue } from '../../common/otlp/otlpLogEmitter.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { isAgentFeedbackAnnotationsAttachment, renderAgentFeedbackAnnotationsAttachment } from '../../common/meta/agentFeedbackAttachments.js';
import { ISessionDatabase, ISessionDataService, SESSION_ATTACHMENTS_DIRNAME } from '../../common/sessionDataService.js';
import { MessageAttachmentKind, ToolCallContributorKind, type FileEdit, type MessageAttachment } from '../../common/state/protocol/state.js';
import { ActionType, isChatAction, type ChatAction, type SessionAction } from '../../common/state/sessionActions.js';
import { MessageKind, ResponsePartKind, ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind, ChatInputResponseKind, ToolCallConfirmationReason, ToolCallRiskAssessmentKind, ToolCallRiskAssessmentStatus, ToolCallStatus, ToolResultContentType, buildSubagentSessionUri, getToolSubagentContent, isDefaultChatUri, isSubagentSession, type PendingMessage, type ChatInputAnswer, type ChatInputOption, type ChatInputQuestion, type ChatInputRequest, type ToolCallResult, type ToolResultContent, type Turn, type UsageInfo, type UsageInfoMeta } from '../../common/state/sessionState.js';
import { IAgentConfigurationService } from '../agentConfigurationService.js';
import type { IExitPlanModeResponse } from './copilotAgent.js';
import { CopilotSessionWrapper } from './copilotSessionWrapper.js';
import { clientToolNamesFromSnapshot, type CopilotSessionLaunchPlan, type IActiveClientSnapshot, type ICopilotSessionLauncher, type ICopilotSessionRuntime } from './copilotSessionLauncher.js';
import { ActiveClientToolSet } from '../activeClientState.js';
import { AgentHostTelemetryReporter } from '../agentHostTelemetryReporter.js';
import { PendingRequestRegistry } from '../../common/pendingRequestRegistry.js';
import { buildCopilotSystemNotification } from './copilotSystemNotification.js';
import { parseLeadingSlashCommand } from './copilotSlashCommandCompletionProvider.js';
import type { IUnsandboxedCommandConfirmationRequest, ShellManager } from './copilotShellTools.js';
import { buildSandboxConfigForSdk, type ISdkSandboxConfig } from './sandboxConfigForSdk.js';
import type { IAgentServerToolHost } from '../../common/agentServerTools.js';
import { getEditFilePaths, getInvocationMessage, getPastTenseMessage, getPermissionDisplay, getShellIntention, getShellLanguage, getSubagentMetadata, getTaskCompleteMarkdown, getToolDisplayName, getToolInputString, getToolKind, isAgentCoordinationTool, isEditTool, isHiddenTool, isShellTool, isTaskCompleteTool, synthesizeSkillToolCall, tryStringify, type ITypedPermissionRequest } from './copilotToolDisplay.js';
import { FileEditTracker } from '../shared/fileEditTracker.js';
import { ICopilotApiService } from '../shared/copilotApiService.js';
import { stripProxyErrorMarker, tryBuildChatErrorMeta, tryBuildChatErrorMetaFromFields } from '../shared/forwardedChatError.js';
import { getEffectiveMcpServerCustomizations, McpCustomizationController, type ISdkMcpServer } from '../shared/mcpCustomizationController.js';
import { appendSdkToolResultContent, mapSessionEvents } from './mapSessionEvents.js';
import { buildPendingEditContentUri } from './pendingEditContentStore.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../agentHostStateManager.js';
import { McpAuthRequiredReason, McpServerStatus, type McpAuthRequirement, type McpServerState } from '../../common/state/protocol/channels-session/state.js';
import type { ProtectedResourceMetadata } from '../../common/state/protocol/common/state.js';
import { CopilotSlashCommandProvider } from './copilotSlashCommandProvider.js';

/**
 * The full set of agent modes the Copilot SDK accepts. AHP now exposes the
 * same three modes (`interactive` / `plan` / `autopilot`) on its `mode` axis,
 * so the Copilot agent maps between the two views directly in
 * {@link CopilotAgentSession.send} and the `session.mode_changed` listener.
 */
export type CopilotSdkMode = 'interactive' | 'plan' | 'autopilot';
type CopilotSdkAttachment = Required<MessageOptions>['attachments'][number];
type CopilotCommandInvocationResult = Awaited<ReturnType<CopilotSession['rpc']['commands']['invoke']>>;
type RuntimeSlashCommandInfo = Awaited<ReturnType<CopilotSession['rpc']['commands']['list']>>['commands'][number];
type McpAuthHandler = NonNullable<SessionConfig['onMcpAuthRequest']>;
type McpAuthRequest = Parameters<McpAuthHandler>[0];
type McpAuthResult = Awaited<ReturnType<McpAuthHandler>>;

interface IPendingMcpAuthRequest {
	readonly serverName: string;
	readonly resource: ProtectedResourceMetadata;
	readonly requiredScopes: readonly string[];
	readonly toolCalls: IMcpAuthToolCall[];
	readonly deferred: DeferredPromise<McpAuthResult | null | undefined>;
}

interface IMcpAuthToolCall {
	readonly turnId: string;
	readonly toolCallId: string;
	readonly parentToolCallId: string | undefined;
}

const COPILOT_HOME_DIRECTORY = '.copilot';
const SESSION_STATE_DIRECTORY = join(COPILOT_HOME_DIRECTORY, 'session-state');
const EMPTY_TOOL_RESULT_TEXT = '<empty />';

function normalizeMcpServerUrl(value: string): string | undefined {
	if (!URL.canParse(value)) {
		return undefined;
	}
	const url = new URL(value);
	url.hash = '';
	url.pathname = url.pathname.replace(/\/+$/, '');
	return url.href;
}

type IMappedSessionEvents = { turns: Turn[]; subagentTurnsByToolCallId: ReadonlyMap<string, Turn[]> };

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
				description: localize('agentHost.planReview.autopilot.description', "Continue autonomously until done, using the selected approval level."),
			};
		case 'autopilot_fleet':
			return {
				label: localize('agentHost.planReview.autopilotFleet.label', "Implement with Autopilot Fleet"),
				description: localize('agentHost.planReview.autopilotFleet.description', "Continue autonomously with fleet management, using the selected approval level."),
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

function toCopilotSdkMode(mode: string | undefined): CopilotSdkMode | undefined {
	switch (mode) {
		case 'interactive':
		case 'plan':
		case 'autopilot':
			return mode;
		default:
			return undefined;
	}
}

/**
 * Projects an {@link ElicitationSchema} field into a
 * {@link ChatInputQuestion}. The schema's property key becomes the
 * question id so we can route the answer back by field name.
 */
function elicitationFieldToQuestion(fieldName: string, field: ElicitationSchemaField, required: boolean): ChatInputQuestion {
	const base = {
		id: fieldName,
		title: field.title ?? fieldName,
		message: field.description ?? field.title ?? fieldName,
		required,
	};

	switch (field.type) {
		case 'boolean':
			return { ...base, kind: ChatInputQuestionKind.Boolean, defaultValue: field.default };
		case 'integer':
		case 'number':
			return {
				...base,
				kind: field.type === 'integer' ? ChatInputQuestionKind.Integer : ChatInputQuestionKind.Number,
				min: field.minimum,
				max: field.maximum,
				defaultValue: field.default,
			};
		case 'array': {
			const options: ChatInputOption[] = hasKey(field.items, { enum: true })
				? field.items.enum.map(value => ({ id: value, label: value }))
				: field.items.anyOf.map(option => ({ id: option.const, label: option.title }));
			return {
				...base,
				kind: ChatInputQuestionKind.MultiSelect,
				options,
				min: field.minItems,
				max: field.maxItems,
			};
		}
		case 'string': {
			if (hasKey(field, { enum: true })) {
				const enumNames = field.enumNames;
				const options: ChatInputOption[] = field.enum.map((value, idx) => ({ id: value, label: enumNames?.[idx] ?? value }));
				return { ...base, kind: ChatInputQuestionKind.SingleSelect, options };
			}
			if (hasKey(field, { oneOf: true })) {
				const options: ChatInputOption[] = field.oneOf.map(option => ({ id: option.const, label: option.title }));
				return { ...base, kind: ChatInputQuestionKind.SingleSelect, options };
			}
			return {
				...base,
				kind: ChatInputQuestionKind.Text,
				format: field.format,
				min: field.minLength,
				max: field.maxLength,
				defaultValue: field.default,
			};
		}
	}
}

/**
 * Projects a {@link ChatInputAnswer} back into the
 * {@link ElicitationFieldValue} shape expected by the SDK for the given
 * schema field. Returns `undefined` when the answer is missing/skipped or
 * cannot be coerced to the field's declared type.
 */
function elicitationAnswerToFieldValue(field: ElicitationSchemaField, answer: ChatInputAnswer | undefined): ElicitationFieldValue | undefined {
	if (!answer || answer.state === ChatInputAnswerState.Skipped) {
		return undefined;
	}
	const value = answer.value;
	if (field.type === 'boolean') {
		if (value.kind === ChatInputAnswerValueKind.Boolean) { return value.value; }
		if (value.kind === ChatInputAnswerValueKind.Text) {
			if (value.value === 'true') { return true; }
			if (value.value === 'false') { return false; }
			return undefined;
		}
		return undefined;
	}
	if (field.type === 'number' || field.type === 'integer') {
		if (value.kind === ChatInputAnswerValueKind.Number) {
			return field.type === 'integer' ? Math.trunc(value.value) : value.value;
		}
		if (value.kind === ChatInputAnswerValueKind.Text) {
			if (value.value.trim() === '') { return undefined; }
			const n = Number(value.value);
			return Number.isFinite(n) ? (field.type === 'integer' ? Math.trunc(n) : n) : undefined;
		}
		return undefined;
	}
	if (field.type === 'array') {
		if (value.kind === ChatInputAnswerValueKind.SelectedMany) {
			return [...value.value, ...(value.freeformValues ?? [])];
		}
		if (value.kind === ChatInputAnswerValueKind.Selected) {
			return value.value ? [value.value, ...(value.freeformValues ?? [])] : [...(value.freeformValues ?? [])];
		}
		if (value.kind === ChatInputAnswerValueKind.Text) {
			return value.value ? [value.value] : [];
		}
		return undefined;
	}
	// field.type === 'string'
	if (value.kind === ChatInputAnswerValueKind.Text) { return value.value; }
	if (value.kind === ChatInputAnswerValueKind.Selected) { return value.value; }
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
	readonly chatChannelUri: URI;
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
	 * Live registry of every active client's tool contributions, shared by
	 * reference with the agent's per-session {@link ActiveClient}. Read at
	 * tool-call stamp time so a window reload (new `clientId`, identical
	 * tools) stamps with the current owning id, and so each tool call is
	 * attributed to whichever client contributed it. When omitted, a fresh
	 * empty registry is used (test / standalone path) and client tool calls
	 * are left unstamped.
	 */
	readonly activeClientToolSet?: ActiveClientToolSet;
	/**
	 * Server-side host for the agent host's server tools. When provided, the
	 * session advertises the server tools (feedback "comments" today, more in
	 * the future) and exposes SDK tool handlers that execute them in-process.
	 */
	readonly serverToolHost?: IAgentServerToolHost;

	/**
	 * Platform used to compute the SDK sandbox policy. Defaults to
	 * `process.platform`; injectable so tests can exercise the per-OS gating
	 * (notably that the sandbox is ignored on Windows) deterministically.
	 */
	readonly platform?: NodeJS.Platform;
}

/**
 * Lifecycle state of a {@link CopilotTurn}.
 *
 *  - `pending`   — the host has dispatched the message (`send()`), but the SDK
 *                  has not yet emitted any event for this turn's agentic loop.
 *  - `running`   — the SDK has emitted at least one event for this turn.
 *  - `completed` — the turn finished normally (the loop went idle).
 *  - `aborted`   — the turn's loop was cancelled via an abort.
 */
type CopilotTurnState = 'pending' | 'running' | 'completed' | 'aborted';

/**
 * Encapsulates all per-turn bookkeeping for a single protocol turn, plus an
 * explicit lifecycle {@link CopilotTurn.state}. Holding this state on one
 * object (created fresh per turn) rather than as a handful of mutable session
 * fields means there is a single, atomic notion of "the current turn": there
 * is no set of counters/maps that must be reset in lockstep, and turn
 * transitions (running/completed/aborted) are explicit and checkable.
 *
 * The `pending → running` distinction guards turn completion against a stray
 * idle: an abort's terminal `session.idle` finds a queued message's turn still
 * `pending` (the SDK has not begun it) and leaves it open, rather than
 * completing it and orphaning its real response. A non-abort idle still
 * completes a `pending` turn defensively, so a degenerate no-op send cannot
 * hang the session.
 */

/**
 * The token/model/cost context for a single model call, used to build a
 * `UsageInfo`. All fields are optional so a partial or empty context (e.g. a
 * subagent usage event seen before the parent's own context) is representable.
 */
interface UsageContext {
	inputTokens?: number;
	outputTokens?: number;
	model?: string;
	cacheReadTokens?: number;
	cost?: number;
}

/** Which SDK source produced an MCP lifecycle log record. */
type McpLifecycleOrigin = 'loaded' | 'statusChanged' | 'inventory';

/**
 * SDK-neutral fields carried into a single MCP lifecycle log record. The
 * `session.mcp_servers_loaded` event, the `session.mcp_server_status_changed`
 * event, and the `rpc.mcp.list` inventory each populate the subset they carry.
 */
interface IMcpLifecycleLogInfo {
	readonly name: string;
	readonly status: SdkMcpServerStatus;
	readonly error?: string;
	readonly source?: string;
	readonly transport?: string;
	readonly pluginName?: string;
	readonly pluginVersion?: string;
}

class CopilotTurn {

	private _state: CopilotTurnState = 'pending';
	private readonly _stopWatch = StopWatch.create(false);

	/**
	 * Accumulated Copilot usage for this turn, in nano-AIU, keyed by scope.
	 * Scope `''` is the parent turn aggregate (parent agent calls plus every
	 * subagent call), so the parent turn's reported cost is the full turn
	 * total. Each subagent additionally accumulates under its `parentToolCallId`
	 * so its own component cost can be reported on the subagent's child session.
	 */
	readonly copilotUsageTotalNanoAiuByScope = new Map<string, number>();

	/**
	 * The parent (main-agent) turn's own last context usage — model plus token
	 * counts and per-event cost. Subagent usage events are folded into the
	 * parent aggregate for credit purposes only, so they must not overwrite the
	 * parent turn's model/context-token usage. Retaining the parent's own last
	 * values lets each subagent usage event refresh the parent aggregate's
	 * credit total while preserving the model that produced the parent response.
	 */
	parentContextUsage: UsageContext | undefined;

	/**
	 * Current markdown response part IDs for this turn, keyed by
	 * `parentToolCallId ?? ''`. Parent and subagent text stream through the
	 * same SDK session but land in different AHP sessions, so their markdown
	 * part state must not mask or append to each other.
	 */
	readonly markdownPartIds = new Map<string, string>();

	/** Current reasoning response part IDs for this turn, keyed by `parentToolCallId ?? ''`. */
	readonly reasoningPartIds = new Map<string, string>();

	/**
	 * Per-turn tool-call aggregate accumulated across the turn's `assistant.message` rounds (main
	 * agent only), for the restricted `toolCallDetails` telemetry. `toolCounts` is keyed by tool name.
	 */
	readonly toolCounts = new Map<string, number>();
	toolCallRounds = 0;
	totalToolCalls = 0;
	parallelToolCallRounds = 0;
	parallelToolCallsTotal = 0;
	/** Model of the most recent round, reported as the turn's model. */
	lastModel: string | undefined;

	constructor(readonly id: string, readonly ordinal: number, readonly senderClientId: string | undefined) { }

	get state(): CopilotTurnState { return this._state; }
	get isPending(): boolean { return this._state === 'pending'; }
	get isRunning(): boolean { return this._state === 'running'; }
	get duration(): number { return Math.max(0, this._stopWatch.elapsed()); }

	/** Transition `pending → running` on the first SDK event. No-op once running/finished. */
	markRunning(): void {
		if (this._state === 'pending') {
			this._state = 'running';
		}
	}

	markCompleted(): void { this._state = 'completed'; }
	markAborted(): void { this._state = 'aborted'; }
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
	private readonly _chatChannelUri: URI;

	/** Working directory this session operates in, if any. */
	get workingDirectory(): URI | undefined { return this._workingDirectory; }

	/** Tracks active tool invocations so we can produce past-tense messages on completion. */
	private readonly _activeToolCalls = new Map<string, { toolName: string; displayName: string; parameters: Record<string, unknown> | undefined; content: ToolResultContent[]; parentToolCallId: string | undefined; mcpServerName: string | undefined; meta: IToolCallMeta | undefined }>();
	/**
	 * Maps a running subagent's `agentId` to its parent tool call id. Session-
	 * scoped rather than per-turn: a subagent's lifetime is bounded by its
	 * `subagent.started` / `subagent.completed` events (and background
	 * subagents can outlive the parent tool call), so this routing must not be
	 * cleared on turn boundaries.
	 */
	private readonly _parentToolCallIdsByAgentId = new Map<string, string>();
	private readonly _autoApprovals = new Map<string, PermissionAutoApproval | null>();
	private readonly _pendingAutoApprovals = new Map<string, DeferredPromise<PermissionAutoApproval | undefined>>();
	/** Pending permission requests awaiting a renderer-side decision. */
	private readonly _pendingPermissions = new Map<string, DeferredPromise<PermissionRequestResult>>();
	/**
	 * Signatures ({@link safeStringify}) of user-approved `read`/`write`
	 * permission requests, keyed by tool call id. The Copilot CLI runtime emits
	 * two identical `permission.requested` events for a single file read or
	 * write (an internal `path` prompt followed by a `read`/`write` prompt), so
	 * without this the user would be asked to approve the same operation twice
	 * (issue #324477). An entry is single-use: it auto-approves exactly one
	 * subsequent request that is byte-identical to the approved one, then is
	 * removed, so approval never carries across a different tool call, a changed
	 * path/diff/contents, or a different kind.
	 */
	private readonly _approvedDuplicablePermissionSignatures = new Map<string, string>();
	/** Pending user input requests awaiting a renderer-side answer. */
	private readonly _pendingUserInputs = new Map<string, { deferred: DeferredPromise<{ response: ChatInputResponseKind; answers?: Record<string, ChatInputAnswer> }>; questionId: string }>();
	/**
	 * Pending elicitation requests awaiting a renderer-side answer. Keyed
	 * by request id; the schema is retained so the completion handler can
	 * project the submitted {@link ChatInputAnswer}s back into the
	 * SDK's {@link ElicitationResult.content} shape.
	 */
	private readonly _pendingElicitations = new Map<string, {
		readonly deferred: DeferredPromise<{ response: ChatInputResponseKind; answers?: Record<string, ChatInputAnswer> }>;
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
	/**
	 * The current protocol turn and its per-turn bookkeeping, or `undefined`
	 * when the session is idle (no active turn). Replaces the former set of
	 * loosely-coupled per-turn fields (`_turnId`, usage counter, streaming
	 * part-id maps) with a single object carrying an explicit
	 * {@link CopilotTurn.state} lifecycle. Created (`pending`) by
	 * {@link resetTurnState}, finalized by {@link _completeActiveTurn}.
	 */
	private _currentTurn: CopilotTurn | undefined;
	/** Monotonic 0-based ordinal assigned to each turn as it starts, for numeric `turnIndex` telemetry parity. */
	private _nextTurnOrdinal = 0;
	/**
	 * Protocol turn ID of the active turn, or `''` when idle. Used by file
	 * edit tracking and emitted on per-turn actions.
	 */
	private get _turnId(): string { return this._currentTurn?.id ?? ''; }
	/** 0-based ordinal of the active turn within the session, or `0` when idle. */
	private get _turnOrdinal(): number { return this._currentTurn?.ordinal ?? 0; }
	/**
	 * Whether the session currently has an in-flight turn. Used by
	 * non-destructive idle release to avoid disconnecting mid-turn.
	 */
	get hasActiveTurn(): boolean { return this._currentTurn !== undefined; }
	/**
	 * Last model id seen on the SDK's per-LLM-call `Usage` event (or a
	 * direct {@link setModel} call). We rely on the
	 * `Usage` event rather than the tool-call event itself because
	 * tool-call events don't carry the model id; the `Usage` event for
	 * an LLM turn precedes that turn's `tool_use` events.
	 */
	private _lastSeenModelId: string | undefined;
	/** SDK session wrapper, set by {@link initializeSession}. */
	private _wrapper!: CopilotSessionWrapper;
	private readonly _slashCommandProvider: CopilotSlashCommandProvider;
	/** Last agent mode pushed to the SDK via {@link applyMode}, to elide redundant `rpc.mode.set` calls. */
	private _lastAppliedMode: CopilotSdkMode | undefined;
	private _lastAppliedPermissionMode: PermissionAllowAllMode | undefined;
	private _autoApprovalExperimentalModeEnabled = false;
	private readonly _permissionModeSequencer = new Sequencer();
	private readonly _steeringMessagesInFlight = new Set<string>();
	/**
	 * Steering messages that have been accepted by the SDK but not yet
	 * surfaced to the chat UI as a separate user message. When the SDK
	 * echoes a steering through a `user.message` event whose `content`
	 * matches one of these entries, we finalize the in-flight turn and
	 * dispatch a new {@link ActionType.ChatTurnStarted} whose
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
	private readonly _activeClientToolSet: ActiveClientToolSet;
	/** Tool names that are client-provided, derived from snapshot. */
	private readonly _clientToolNames: ReadonlySet<string>;
	/** Deferred promises for pending client tool calls, keyed by toolCallId. */
	private readonly _pendingClientToolCalls = new PendingRequestRegistry<ToolResultObject>();
	/** Pending SDK MCP auth handler promises, keyed by SDK auth request id. */
	private readonly _pendingMcpAuthRequests = new Map<string, IPendingMcpAuthRequest>();
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
	private readonly _serverToolHost: IAgentServerToolHost | undefined;
	/** Bridges SDK-reported MCP server state into AHP customization actions. */
	private readonly _mcpCustomizations: McpCustomizationController;

	private get _storageUri(): URI {
		return isDefaultChatUri(this._chatChannelUri) ? this.sessionUri : this._chatChannelUri;
	}

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

	/** Tracks whether a non-empty activity has been published, so we only emit a clear when needed. */
	private _hasActivity = false;

	/**
	 * Last SDK-reported MCP status logged for each server (keyed by server
	 * name). Used to suppress duplicate lifecycle log records when the SDK
	 * re-reports an unchanged status — the `rpc.mcp.list` seed and the
	 * `session.mcp_servers_loaded` event routinely carry the same snapshot.
	 */
	private readonly _lastLoggedMcpStatus = new Map<string, SdkMcpServerStatus>();

	/** Platform used to compute the SDK sandbox policy (injectable for tests). */
	private readonly _platform: NodeJS.Platform;

	get mcpServerStates() {
		return this._mcpCustomizations.runtimeStates;
	}

	/** Stateless reporter used to emit restricted GH/MSFT telemetry for this session's model calls. */
	private readonly _telemetryReporter: AgentHostTelemetryReporter;

	constructor(
		options: ICopilotAgentSessionOptions,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
		@ISessionDataService sessionDataService: ISessionDataService,
		@IFileService private readonly _fileService: IFileService,
		@INativeEnvironmentService private readonly _environmentService: INativeEnvironmentService,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ICopilotApiService private readonly _copilotApiService: ICopilotApiService,
	) {
		super();
		this.sessionId = options.rawSessionId;
		this.sessionUri = options.sessionUri;
		this._slashCommandProvider = new CopilotSlashCommandProvider(() => this._wrapper.session.rpc.commands.list({ includeBuiltins: true, includeSkills: true, includeClientCommands: true }).then(c => c.commands), this._logService);
		this._chatChannelUri = options.chatChannelUri;
		this._onDidSessionProgress = options.onDidSessionProgress;
		this._sessionLauncher = options.sessionLauncher;
		this._launchPlan = options.launchPlan;
		this._shellManager = options.shellManager;
		this._workingDirectory = options.workingDirectory;
		this._customizationDirectory = options.customizationDirectory;
		this._serverToolHost = options.serverToolHost;
		this._platform = options.platform ?? process.platform;
		this._telemetryReporter = new AgentHostTelemetryReporter(this._telemetryService);

		this._appliedSnapshot = options.clientSnapshot ?? { tools: [], plugins: [], mcpServers: {} };
		this._clientToolNames = clientToolNamesFromSnapshot(this._appliedSnapshot);
		// Share the agent's live ActiveClientToolSet when provided so client
		// contributions (and owner identity) are observed at stamp time.
		// Standalone / test construction uses a fresh empty registry, which
		// leaves client tool calls unstamped (no owning client).
		this._activeClientToolSet = options.activeClientToolSet ?? new ActiveClientToolSet();

		this._databaseRef = sessionDataService.openDatabase(this._storageUri);
		this._register(toDisposable(() => this._databaseRef.dispose()));
		this._sessionDataDir = sessionDataService.getSessionDataDir(this._storageUri);

		this._editTracker = this._instantiationService.createInstance(FileEditTracker, this._storageUri.toString(), this._databaseRef.object);

		this._mcpCustomizations = this._register(this._instantiationService.createInstance(McpCustomizationController, {
			providerId: this.sessionUri.scheme,
			sessionId: this.sessionId,
			sessionUri: this.sessionUri,
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
		this._register(toDisposable(() => this._cancelPendingMcpAuthRequests()));

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
					type: ActionType.ChatToolCallContentChanged,
					turnId: this._turnId,
					toolCallId,
					content: tracked.content,
				});
			}));
		}
		this._register(toDisposable(() => this._cancelPendingClientToolCalls()));
		this._register(toDisposable(() => {
			for (const pending of this._pendingAutoApprovals.values()) {
				pending.complete(undefined);
			}
			this._pendingAutoApprovals.clear();
		}));
	}

	// ---- AgentSignal helpers ------------------------------------------------

	/** Wraps a {@link SessionAction} in an {@link AgentSignal} envelope and emits it. */
	/** todo@connor4312: AHP is missing a chat activity update action which is needed to drop `SessionAction` here */
	private _emitAction(action: SessionAction | ChatAction, parentToolCallId?: string): void {
		this._onDidSessionProgress.fire({
			kind: 'action',
			resource: isChatAction(action) ? this._chatChannelUri : this.sessionUri,
			action,
			parentToolCallId,
		});
	}

	/**
	 * Promotes a pending steering message into its own protocol turn:
	 * closes the in-flight turn (so its responseParts settle into history)
	 * and dispatches {@link ActionType.ChatTurnStarted} for a fresh
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
			const previousDuration = this._currentTurn?.duration ?? 0;
			this._emitAction({
				type: ActionType.ChatTurnComplete,
				turnId: previousTurnId,
				duration: previousDuration,
			});
		}
		const newTurnId = generateUuid();
		this._emitAction({
			type: ActionType.ChatTurnStarted,
			turnId: newTurnId,
			startedAt: new Date().toISOString(),
			message: steering.message,
			queuedMessageId: steering.id,
		});
		// Mirror `resetTurnState` so per-turn counters/mappings (usage total,
		// streaming part ids) don't bleed from the preempted turn into the new
		// steering turn. The steering turn is created mid-loop in response to an
		// SDK `user.message` event, so the SDK is already actively producing its
		// response: mark it `running` immediately rather than leaving it
		// `pending`, otherwise an abort during the steering turn would treat it
		// as a not-yet-started queued turn and leave it open.
		this.resetTurnState(newTurnId);
		this._currentTurn?.markRunning();
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
				chat: this._chatChannelUri,
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
	 * Starts a fresh `pending` turn, discarding any per-turn streaming state
	 * from a previous turn so the next text/reasoning chunk allocates a new
	 * response part. The turn becomes `running` on the first SDK event.
	 */
	resetTurnState(turnId: string, senderClientId?: string): void {
		this._currentTurn = new CopilotTurn(turnId, this._nextTurnOrdinal++, senderClientId);
	}

	private _completeActiveTurn(): void {
		const turn = this._currentTurn;
		if (!turn) {
			return;
		}
		turn.markCompleted();
		// Emit the restricted per-turn tool-call aggregate before the turn is cleared. Main agent
		// only: `_appliedSnapshot.tools` and this turn's accumulator describe the main session's turn.
		// No-ops (in the reporter) when the turn made no tool calls.
		this._telemetryReporter.toolCallDetails({
			session: this.sessionUri.toString(),
			turnId: turn.id,
			model: turn.lastModel,
			responseType: 'success',
			toolCounts: Object.fromEntries(turn.toolCounts),
			availableTools: this._appliedSnapshot.tools.map(tool => tool.name),
			numRequests: turn.toolCallRounds,
			totalToolCalls: turn.totalToolCalls,
			parallelToolCallRounds: turn.parallelToolCallRounds,
			parallelToolCallsTotal: turn.parallelToolCallsTotal,
		});
		this._emitAction({
			type: ActionType.ChatTurnComplete,
			turnId: turn.id,
			duration: turn.duration,
		});
		this._currentTurn = undefined;
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
		const turn = this._currentTurn;
		if (!turn) {
			// A markdown delta should only ever arrive while a turn is active.
			// Without a turn we can't persist the part id (so every delta would
			// allocate a fresh part) and the action would carry an empty turnId.
			// Drop it and surface the unexpected state.
			this._logService.error(`[Copilot:${this.sessionId}] Markdown delta emitted with no active turn; dropping`);
			return;
		}
		const markdownScope = parentToolCallId ?? '';
		let partId = turn.markdownPartIds.get(markdownScope);
		if (!partId) {
			partId = generateUuid();
			turn.markdownPartIds.set(markdownScope, partId);
			this._emitAction({
				type: ActionType.ChatResponsePart,
				turnId: turn.id,
				part: { kind: ResponsePartKind.Markdown, id: partId, content },
			}, parentToolCallId);
			return;
		}
		this._emitAction({
			type: ActionType.ChatDelta,
			turnId: turn.id,
			partId,
			content,
		}, parentToolCallId);
	}

	/** Emits a reasoning delta, similar to {@link _emitMarkdownDelta} but for reasoning parts. */
	private _emitReasoningDelta(content: string, parentToolCallId?: string): void {
		const turn = this._currentTurn;
		if (!turn) {
			this._logService.error(`[Copilot:${this.sessionId}] Reasoning delta emitted with no active turn; dropping`);
			return;
		}
		const reasoningScope = parentToolCallId ?? '';
		let partId = turn.reasoningPartIds.get(reasoningScope);
		if (!partId) {
			partId = generateUuid();
			turn.reasoningPartIds.set(reasoningScope, partId);
			this._emitAction({
				type: ActionType.ChatResponsePart,
				turnId: turn.id,
				part: { kind: ResponsePartKind.Reasoning, id: partId, content },
			}, parentToolCallId);
			return;
		}
		this._emitAction({
			type: ActionType.ChatReasoning,
			turnId: turn.id,
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
	 * Builds SDK tool handlers for the agent host's server tools. Each handler
	 * executes the tool against this session's state via the
	 * {@link IAgentServerToolHost} and returns its textual result. Returns an
	 * empty list when no server-tool host is wired (e.g. test / standalone
	 * construction).
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private _createServerSdkTools(): Tool<any>[] {
		const host = this._serverToolHost;
		if (!host) {
			return [];
		}
		return host.definitions.map(def => ({
			name: def.name,
			description: def.description ?? '',
			parameters: def.inputSchema ?? { type: 'object' as const, properties: {} },
			handler: async (args: Record<string, unknown>): Promise<ToolResultObject> => {
				try {
					const text = host.executeTool(this._chatChannelUri.toString(), def.name, args);
					return { textResultForLlm: await text, resultType: 'success' };
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					this._logService.error(error, `[Copilot:${this.sessionId}] Failed in server tool handler: tool=${def.name}`);
					return { textResultForLlm: message, resultType: 'failure', error: message };
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
		this._approvedDuplicablePermissionSignatures.delete(toolCallId);
		if (!result.success && this._cancelMcpAuthenticationForToolCall(toolCallId)) {
			this._activeToolCalls.delete(toolCallId);
			return;
		}
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

		// Still pending permission, so this call may have errored while getting permission.
		// Go ahead and allow the call which will immediately see the buffered value.
		this.respondToPermissionRequest(toolCallId, true);
	}

	private _cancelMcpAuthenticationForToolCall(toolCallId: string): boolean {
		for (const [requestId, pending] of this._pendingMcpAuthRequests) {
			const toolCallIndex = pending.toolCalls.findIndex(toolCall => toolCall.toolCallId === toolCallId);
			if (toolCallIndex === -1) {
				continue;
			}
			pending.toolCalls.splice(toolCallIndex, 1);
			if (pending.toolCalls.length === 0) {
				this._pendingMcpAuthRequests.delete(requestId);
				pending.deferred.complete({ kind: 'cancelled' });
			}
			return true;
		}
		return false;
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
		this._subscribeForMemoInvalidation();
		this._subscribeForInstructionsCollectedTelemetry();
		this._subscribeToPermissionConfigChanges();

		// Advertise the agent host's server tools for this session so clients
		// see them as server-provided. Execution happens in-process via the SDK
		// tool handlers built in `_createServerSdkTools`.
		this._serverToolHost?.advertise(this._storageUri.toString());
	}

	private _createRuntimeAdapter(): ICopilotSessionRuntime {
		return {
			handlePermissionRequest: request => this._handlePermissionRequest(request),
			handleExitPlanModeRequest: (request, invocation) => this._handleExitPlanModeRequest(request, invocation),
			handleUserInputRequest: (request, invocation) => this._handleUserInputRequest(request, invocation),
			handleElicitationRequest: context => this._handleElicitationRequest(context),
			handleMcpAuthRequest: request => this._handleMcpAuthRequest(request),
			requestUnsandboxedCommandConfirmation: request => this._requestUnsandboxedCommandConfirmation(request),
			createClientSdkTools: () => this._createClientSdkTools(),
			createServerSdkTools: () => this._createServerSdkTools(),
			handlePreToolUse: input => this._handlePreToolUse(input),
			handlePostToolUse: input => this._handlePostToolUse(input),
		};
	}

	async resolveMcpAuthentication(params: AuthenticateParams): Promise<boolean> {
		let resolved = false;
		for (const [requestId, pending] of this._pendingMcpAuthRequests) {
			if (pending.resource.resource !== params.resource || !this._scopesSatisfy(params.scopes, pending.requiredScopes)) {
				continue;
			}
			this._pendingMcpAuthRequests.delete(requestId);
			for (const toolCall of pending.toolCalls) {
				this._emitAction({
					type: ActionType.ChatToolCallAuthResolved,
					turnId: toolCall.turnId,
					toolCallId: toolCall.toolCallId,
				}, toolCall.parentToolCallId);
			}
			pending.deferred.complete({ kind: 'token', accessToken: params.token });
			resolved = true;
		}
		return resolved;
	}

	private async _handleMcpAuthRequest(request: McpAuthRequest): Promise<McpAuthResult | null | undefined> {
		const githubToken = request.reason === 'initial' && this._scopesFromChallenge(request.wwwAuthenticateParams?.scope).length === 0
			? await this._initialGitHubMcpToken(request)
			: undefined;
		if (githubToken) {
			this._logService.info(`[Copilot:${this.sessionId}] Reusing the existing GitHub token for initial GitHub MCP authentication`);
			return { kind: 'token', accessToken: githubToken };
		}
		const resource = this._protectedResourceFromMcpAuthRequest(request);
		const requiredScopes = this._scopesFromChallenge(request.wwwAuthenticateParams?.scope);
		const oauthClient: McpAuthRequirement['oauthClient'] = request.staticClientConfig?.publicClient
			? { clientId: request.staticClientConfig.clientId }
			: request.staticClientConfig?.clientSecret
				? { clientId: request.staticClientConfig.clientId, clientSecret: request.staticClientConfig.clientSecret }
				: undefined;
		const auth: McpAuthRequirement = {
			reason: this._mcpAuthRequiredReason(request.reason),
			...(oauthClient ? { oauthClient } : {}),
			resource,
			requiredScopes: requiredScopes.length ? [...requiredScopes] : undefined,
			description: request.wwwAuthenticateParams?.error,
		};
		const toolCalls = this._activeMcpToolCalls(request.serverName);
		const deferred = new DeferredPromise<McpAuthResult | null | undefined>();
		this._pendingMcpAuthRequests.set(request.requestId, {
			serverName: request.serverName,
			resource,
			requiredScopes,
			toolCalls,
			deferred,
		});
		this._mcpCustomizations.applyOne({
			name: request.serverName,
			state: {
				kind: McpServerStatus.AuthRequired,
				...auth,
			},
		});
		for (const toolCall of toolCalls) {
			this._emitAction({
				type: ActionType.ChatToolCallAuthRequired,
				turnId: toolCall.turnId,
				toolCallId: toolCall.toolCallId,
				auth,
			}, toolCall.parentToolCallId);
		}
		this._logService.info(`[Copilot:${this.sessionId}] MCP server '${request.serverName}' requires authentication for ${resource.resource}`);
		return deferred.p.finally(() => this._pendingMcpAuthRequests.delete(request.requestId));
	}

	private _activeMcpToolCalls(serverName: string): IMcpAuthToolCall[] {
		if (!this._turnId) {
			return [];
		}
		const result: IMcpAuthToolCall[] = [];
		for (const [toolCallId, toolCall] of this._activeToolCalls) {
			if (toolCall.mcpServerName === serverName) {
				result.push({ turnId: this._turnId, toolCallId, parentToolCallId: toolCall.parentToolCallId });
			}
		}
		return result;
	}

	private async _initialGitHubMcpToken(request: McpAuthRequest): Promise<string | undefined> {
		const githubToken = this._launchPlan.githubToken;
		const requestUrl = normalizeMcpServerUrl(request.serverUrl);
		if (!githubToken || requestUrl === undefined) {
			return undefined;
		}
		const configuredUrls = [gitHubMcpServerUrl(undefined)];
		try {
			const resolvedUrl = gitHubMcpServerUrl(await this._copilotApiService.resolveApiEndpoint(githubToken));
			if (resolvedUrl) {
				configuredUrls.push(resolvedUrl);
			}
		} catch (error) {
			this._logService.warn(`[Copilot:${this.sessionId}] Failed to resolve the GitHub MCP server URL: ${getErrorMessage(error)}`);
			return undefined;
		}
		return configuredUrls.some(u => u && requestUrl === normalizeMcpServerUrl(u)) ? githubToken : undefined;
	}

	private _protectedResourceFromMcpAuthRequest(request: McpAuthRequest): ProtectedResourceMetadata {
		if (request.resourceMetadata) {
			try {
				const parsed = JSON.parse(request.resourceMetadata);
				if (isAuthorizationProtectedResourceMetadata(parsed)) {
					return parsed;
				}
				this._logService.warn(`[Copilot:${this.sessionId}] Ignoring invalid MCP protected-resource metadata for '${request.serverName}'`);
			} catch (err) {
				this._logService.warn(`[Copilot:${this.sessionId}] Failed to parse MCP protected-resource metadata for '${request.serverName}'`, err);
			}
		}
		const scopes = this._scopesFromChallenge(request.wwwAuthenticateParams?.scope);
		return {
			resource: request.serverUrl,
			resource_name: request.serverName,
			scopes_supported: scopes.length ? scopes.slice() : undefined,
		};
	}

	private _scopesFromChallenge(scope: string | undefined): readonly string[] {
		return scope?.split(/\s+/).map(s => s.trim()).filter(s => s.length > 0) ?? [];
	}

	private _mcpAuthRequiredReason(reason: McpAuthRequest['reason']): McpAuthRequiredReason {
		switch (reason) {
			case 'refresh':
			case 'reauth':
				return McpAuthRequiredReason.Expired;
			case 'upscope':
				return McpAuthRequiredReason.InsufficientScope;
			case 'initial':
			default:
				return McpAuthRequiredReason.Required;
		}
	}

	private _scopesSatisfy(provided: readonly string[] | undefined, required: readonly string[]): boolean {
		if (required.length === 0 || provided === undefined) {
			return true;
		}
		const providedSet = new Set(provided);
		return required.every(scope => providedSet.has(scope));
	}

	private _cancelPendingMcpAuthRequests(): void {
		for (const pending of this._pendingMcpAuthRequests.values()) {
			pending.deferred.complete({ kind: 'cancelled' });
		}
		this._pendingMcpAuthRequests.clear();
	}

	private _cancelPendingMcpAuthRequestsForServer(serverName: string): void {
		for (const [requestId, pending] of this._pendingMcpAuthRequests) {
			if (pending.serverName !== serverName) {
				continue;
			}
			this._pendingMcpAuthRequests.delete(requestId);
			for (const toolCall of pending.toolCalls) {
				this._emitAction({
					type: ActionType.ChatToolCallAuthResolved,
					turnId: toolCall.turnId,
					toolCallId: toolCall.toolCallId,
				}, toolCall.parentToolCallId);
			}
			pending.deferred.complete({ kind: 'cancelled' });
		}
	}

	// ---- session operations -------------------------------------------------

	async send(prompt: string, attachments?: readonly MessageAttachment[], turnId?: string, mode?: CopilotSdkMode, senderClientId?: string): Promise<void> {
		if (turnId && this._currentTurn?.id !== turnId) {
			// Establish the `pending` turn for this message. Callers normally
			// call `resetTurnState` just before `send()`; this covers the
			// direct-send path and is a no-op when the turn already exists.
			this.resetTurnState(turnId, senderClientId);
		}
		this._logService.info(`[Copilot:${this.sessionId}] sendMessage called: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}" (${attachments?.length ?? 0} attachments)`);

		const slashCommand = parseLeadingSlashCommand(prompt);
		if (slashCommand?.command === 'compact') {
			try {
				const result = await this._wrapper.session.rpc.history.compact();
				// Compaction reduces the number of tokens currently occupying the context window. Report the
				// new occupancy so the context-usage widget refreshes immediately. Emitted before
				// `_completeActiveTurn` since the reducer drops usage for a non-active turn.
				const usedTokens = result.contextWindow?.currentTokens;
				if (typeof usedTokens === 'number') {
					this._emitAction({
						type: ActionType.ChatUsage,
						turnId: this._turnId,
						usage: { inputTokens: usedTokens, outputTokens: 0, model: this._lastSeenModelId },
					});
				}
				this.emitInitialMarkdown(localize('copilotAgent.compactionCompleted', "Compaction completed"));
			} catch (err) {
				if (getErrorMessage(err).toLowerCase().includes('nothing to compact')) {
					this.emitInitialMarkdown(localize('copilotAgent.compactionCompleted', "Compaction completed"));
					this._completeActiveTurn();
					return;
				}
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
		if (slashCommand?.command === 'plan') {
			mode = 'plan';
			prompt = slashCommand.rest;
		} else if (slashCommand?.command === 'rubber-duck') {
			if (this._configurationService.getRootValue(copilotCliConfigSchema, CopilotCliConfigKey.RubberDuck) !== true) {
				// Feature not enabled — pass the remaining text through as a plain
				// message rather than injecting agent instructions for an unavailable agent.
				prompt = slashCommand.rest;
			} else {
				const userPrompt = slashCommand.rest;
				prompt = userPrompt
					? `The user has requested a rubber duck review via the /rubber-duck command. Use the task tool with agent_type: "rubber-duck" to get an independent critique of your current approach, plan, or recent work. Summarize the relevant context for the rubber duck agent so it has what it needs to evaluate it.\n\nAdditional instructions: ${userPrompt}`
					: 'The user has requested a rubber duck review via the /rubber-duck command. Use the task tool with agent_type: "rubber-duck" to get an independent critique of your current approach, plan, or recent work. Summarize the relevant context for the rubber duck agent so it has what it needs to evaluate it.';
			}
		} else if (slashCommand) {
			const runtimeSlashCommand = await this._slashCommandProvider.resolveSlashCommand(slashCommand.command);
			// Skills can be passed as is to the runtime.
			if (runtimeSlashCommand && runtimeSlashCommand.kind !== 'skill') {
				let result: CopilotCommandInvocationResult;
				try {
					result = await this._wrapper.session.rpc.commands.invoke({
						name: runtimeSlashCommand.name,
						...(slashCommand.rawRest.length > 0 ? { input: slashCommand.rawRest } : {}),
					});
				} catch (err) {
					this._logService.error(err, `[Copilot:${this.sessionId}] rpc.commands.invoke(${slashCommand.command}) failed`);
					throw err;
				}
				switch (result.kind) {
					case 'text':
						this._emitMarkdownDelta(result.markdown === true ? result.text : escapeMarkdownSyntaxTokens(result.text));
						break;
					case 'completed':
						if (result.message) {
							this._emitMarkdownDelta(result.message);
						}
						break;
					case 'agent-prompt': {
						const runtimeMode = toCopilotSdkMode(result.mode);
						if (runtimeMode) {
							mode = runtimeMode;
						}
						prompt = result.prompt;
						break;
					}
					case 'select-subcommand':
						this._emitMarkdownDelta(localize(
							'copilotSlashCommand.selectSubcommandResult',
							"The /{0} command requires selecting a subcommand. Available options: {1}",
							result.command,
							result.options.map(option => option.name).join(', '),
						));
						break;
					default:
						// The runtime can be newer than these compiled SDK types, so an
						// unknown kind must be logged rather than silently swallowed (the
						// turn would otherwise complete with no user-facing output).
						this._logService.warn(`[Copilot:${this.sessionId}] Unhandled slash command result kind: ${(result as { kind: string }).kind}`);
						break;
				}
				if (result.runtimeSettingsChanged === true) {
					this._slashCommandProvider.clearCache();
				}
				if (result.kind !== 'agent-prompt') {
					this._completeActiveTurn();
					return;
				}
			}
		}

		const sdkAttachments = attachments?.length
			? (await Promise.all(attachments.map(a => this._toSdkAttachment(a)))).filter(isDefined)
			: undefined;
		if (sdkAttachments?.length) {
			this._logService.trace(`[Copilot:${this.sessionId}] Attachments: ${JSON.stringify(sdkAttachments.map(a => ({ type: a.type })))}`);
		}

		await this.applyMode(mode);
		await this.syncPermissionMode('turn-start');
		await this._applyEffectiveSandboxConfig();
		await this._reconcileMcpServerEnablement();
		this._markEnabledMcpServersStarting();
		await this._wrapper.session.send({ prompt, attachments: sdkAttachments?.length ? sdkAttachments : undefined });
		this._logService.info(`[Copilot:${this.sessionId}] session.send() returned`);
	}

	async hasRuntimeSlashCommand(command: string): Promise<boolean> {
		try {
			return !!(await this._slashCommandProvider.resolveSlashCommand(command));
		} catch (err) {
			this._logService.warn(`[Copilot:${this.sessionId}] rpc.commands.list failed`, err);
			return false;
		}
	}

	async getRuntimeSlashCommands(options?: { readonly maxWaitMs?: number }): Promise<readonly RuntimeSlashCommandInfo[]> {
		try {
			return await this._slashCommandProvider.getSlashCommands(options);
		} catch (err) {
			this._logService.warn(`[Copilot:${this.sessionId}] rpc.commands.list failed`, err);
			return [];
		}
	}

	/**
	 * Translate a protocol {@link MessageAttachment} into the Copilot CLI SDK's `attachments` payload shape. Resource
	 * attachments map to the SDK's reference-style `file`/`directory`/`selection` variants (the
	 * {@link MessageAttachmentBase.displayKind} advisory hint controls which one). Embedded resources (e.g. inline
	 * image bytes, or unsaved editor content) map to the SDK's `blob` variant, and simple attachments with a model
	 * representation map to `text/plain` blob attachments.
	 *
	 * Any Resource attachment carrying a {@link TextSelection} (e.g. `displayKind === 'selection'` or `'symbol'`) is
	 * mapped to the SDK's `selection` variant so the range survives the round-trip — keying off the `selection` field
	 * rather than just `displayKind` avoids symbol attachments degrading to a plain file reference (#315193). For those
	 * we read the resource content from disk and slice it by the carried range (the protocol's {@link TextSelection}
	 * only carries the range, not the inline text); on read failure the selection downgrades to a plain file reference.
	 * A textual embedded resource already carries the exact inline text to send (the whole live buffer for a document,
	 * or just the selected text for a selection), so it is forwarded as-is without further slicing.
	 */
	private async _toSdkAttachment(attachment: MessageAttachment): Promise<CopilotSdkAttachment | undefined> {
		if (isAgentFeedbackAnnotationsAttachment(attachment)) {
			const rendered = renderAgentFeedbackAnnotationsAttachment(attachment);
			if (!rendered) {
				return undefined;
			}
			return {
				type: 'blob' as const,
				data: encodeBase64(VSBuffer.fromString(rendered)),
				mimeType: 'text/plain',
				displayName: attachment.label,
			};
		}
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
		if (attachment.selection) {
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

	/**
	 * `true` when the session's effective `mode` is `autopilot` — the
	 * autonomous, continue-until-done mode in which no user is available to
	 * answer questions or fill in elicitation forms.
	 */
	private _isAutopilotMode(): boolean {
		return this._configurationService.getEffectiveValue(this._storageUri.toString(), platformSessionSchema, SessionConfigKey.Mode) === 'autopilot';
	}

	/**
	 * Whether VS Code's auto-reply setting is enabled in the root config.
	 */
	private _isAutoReplyEnabled(): boolean {
		return this._configurationService.getRootValue(platformRootSchema, AgentHostAutoReplyEnabledConfigKey) === true;
	}

	async sendSteering(steeringMessage: PendingMessage): Promise<void> {
		if (this._steeringMessagesInFlight.has(steeringMessage.id) || this._pendingSteeringFlips.has(steeringMessage.id)) {
			return;
		}
		this._steeringMessagesInFlight.add(steeringMessage.id);
		this._logService.info(`[Copilot:${this.sessionId}] Sending steering message: "${steeringMessage.message.text.substring(0, 100)}"`);
		try {
			await this._reconcileMcpServerEnablement();
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
		const result = await this._getMappedEvents();
		return result.turns;
	}

	async getSubagentMessages(parentToolCallId: string): Promise<readonly Turn[]> {
		const result = await this._getMappedEvents();
		const turns = result.subagentTurnsByToolCallId.get(parentToolCallId) ?? [];
		return turns;
	}

	/**
	 * Returns the subagent child sessions discoverable in this session's event
	 * log, derived from the same {@link mapSessionEvents} reconstruction used
	 * for {@link getMessages}/{@link getSubagentMessages}. Lets a parent
	 * restore register every child up-front instead of each child re-fetching
	 * and re-reconstructing the full parent event log.
	 */
	async getSubagentSessions(): Promise<readonly IRestoredSubagentSession[]> {
		const result = await this._getMappedEvents();
		if (result.subagentTurnsByToolCallId.size === 0) {
			return [];
		}
		const parentSessionStr = this._storageUri.toString();
		const out: IRestoredSubagentSession[] = [];
		for (const turn of result.turns) {
			for (const rp of turn.responseParts) {
				if (rp.kind !== ResponsePartKind.ToolCall) {
					continue;
				}
				const tc = rp.toolCall;
				const childTurns = result.subagentTurnsByToolCallId.get(tc.toolCallId);
				if (!childTurns || childTurns.length === 0) {
					continue;
				}
				const content = (tc as { content?: readonly ToolResultContent[] }).content;
				const subagentContent = content ? getToolSubagentContent({ content }) : undefined;
				// Prefer the spawning Task tool's short `description` (captured on
				// the parent tool call's `_meta`) so restored peer tabs match the
				// live path's concise, per-task naming; fall back to the agent
				// type's display name.
				const taskDescription = readToolCallMeta(tc).subagentDescription;
				out.push({
					resource: URI.parse(buildSubagentSessionUri(parentSessionStr, tc.toolCallId)),
					toolCallId: tc.toolCallId,
					title: subagentChatTitle(taskDescription, subagentContent?.title),
					turns: childTurns,
				});
			}
		}
		return out;
	}

	/**
	 * Memoized `getEvents()` + {@link mapSessionEvents} result, shared by
	 * {@link getMessages}, {@link getSubagentMessages} and
	 * {@link getSubagentSessions}. A single session open reads and
	 * reconstructs the full parent event log once instead of once per
	 * subagent. The memo is scoped to the resume/restore wave: it is dropped
	 * whenever the persisted event log could change (see
	 * {@link _invalidateMappedEvents}) and on dispose, so it never serves
	 * stale turns for an actively-running session.
	 */
	private _mappedEventsMemo: Promise<IMappedSessionEvents> | undefined;

	private _getMappedEvents(): Promise<IMappedSessionEvents> {
		if (!this._mappedEventsMemo) {
			const pending = this._computeMappedEvents();
			this._mappedEventsMemo = pending;
			// Don't cache a rejected reconstruction — let the next caller retry.
			pending.catch(() => {
				if (this._mappedEventsMemo === pending) {
					this._mappedEventsMemo = undefined;
				}
			});
		}
		return this._mappedEventsMemo;
	}

	private async _computeMappedEvents(): Promise<IMappedSessionEvents> {
		const events = await this._wrapper.session.getEvents();
		let db: ISessionDatabase | undefined;
		try {
			db = this._databaseRef.object;
		} catch {
			// Database may not exist yet — that's fine
		}
		const result = await mapSessionEvents(this._storageUri, db, events, {
			workingDirectory: this._workingDirectory,
			model: this._launchPlan.kind === 'create'
				? this._launchPlan.model
				: this._launchPlan.fallback.model,
		});
		return result;
	}

	/** Drop the memoized event reconstruction; the next read rebuilds it. */
	private _invalidateMappedEvents(): void {
		this._mappedEventsMemo = undefined;
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

	async setModel(model: string, reasoningEffort?: SessionConfig['reasoningEffort'], contextTier?: SessionConfig['contextTier']): Promise<void> {
		this._logService.info(`[Copilot:${this.sessionId}] Changing model to: ${model}`);
		this._lastSeenModelId = model;
		await this._wrapper.session.setModel(model, { reasoningEffort, contextTier });
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

	async startMcpServer(id: string): Promise<void> {
		const serverName = this._mcpCustomizations.serverNameForCustomizationId(id);
		if (!serverName) {
			this._logService.warn(`[Copilot:${this.sessionId}] Cannot start unknown MCP server customization ${id}`);
			return;
		}
		// stopServer leaves inline session MCP servers not_configured; disable->enable is the validated restart path.
		await this._disableMcpServer(serverName);
		// The SDK reconnects in the background on enable with no live "starting"
		// event, so surface Starting optimistically until the seed below settles it.
		this._mcpCustomizations.markStarting([serverName]);
		try {
			await this._wrapper.session.rpc.mcp.enable({ serverName });
			await this._wrapper.session.rpc.mcp.listTools({ serverName });
		} finally {
			// Always reconcile against the SDK's real state -- on success this
			// settles Starting -> Ready/AuthRequired, and on failure it clears the
			// optimistic Starting instead of leaving the UI stuck.
			this._seedMcpServersFromRpc();
		}
	}

	private async _reconcileMcpServerEnablement(): Promise<void> {
		const desiredCustomizations = this._stateManager.getSessionState(this.sessionUri.toString())?.customizations ?? [];
		const desiredServers = getEffectiveMcpServerCustomizations(desiredCustomizations);
		if (desiredServers.length === 0) {
			return;
		}
		await this._refreshMcpServersFromRpc();
		let changed = false;
		for (const server of this._mcpCustomizations.serverEnablement()) {
			const desired = desiredServers.find(customization => customization.id === server.customizationId)?.enabled;
			if (desired === undefined || desired === server.enabled) {
				continue;
			}
			try {
				if (desired) {
					// Re-enabling restarts the server. The SDK connects it in the
					// background with no live "starting" event, so surface Starting
					// optimistically. Mark `changed` now (before the enable) so the
					// trailing refresh always runs and settles/clears this optimistic
					// Starting even if the enable rejects.
					this._mcpCustomizations.markStarting([server.serverName]);
					changed = true;
					await this._wrapper.session.rpc.mcp.enable({ serverName: server.serverName });
				} else {
					await this._disableMcpServer(server.serverName);
					changed = true;
				}
			} catch (e) {
				this._logService.error(e, `[Copilot:${this.sessionId}] Failed to ${desired ? 'enable' : 'disable'} MCP server ${server.serverName}`);
			}
		}
		if (changed) {
			await this._refreshMcpServersFromRpc();
		}
	}

	/**
	 * Optimistically marks the session's enabled MCP servers as Starting for the
	 * turn that is about to begin. Sending a message makes the SDK connect
	 * enabled servers in the background with no live "starting" event, so without
	 * this a connecting server would read as its last settled state (e.g. the
	 * seeded Stopped) until the connection resolves. Already-running servers are
	 * left untouched by the controller; the subsequent SDK status settles each
	 * server.
	 */
	private _markEnabledMcpServersStarting(): void {
		const customizations = this._stateManager.getSessionState(this.sessionUri.toString())?.customizations ?? [];
		const enabled = getEffectiveMcpServerCustomizations(customizations).filter(server => server.enabled);
		if (enabled.length > 0) {
			this._mcpCustomizations.markStarting(enabled.map(server => server.name));
		}
	}

	private async _disableMcpServer(serverName: string): Promise<void> {
		// disable() hangs until pending auth requests have resolved.
		// reported to the SDK folks though arguable whether it's a bug or not...
		this._cancelPendingMcpAuthRequestsForServer(serverName);
		await this._wrapper.session.rpc.mcp.disable({ serverName });
	}

	async stopMcpServer(id: string): Promise<void> {
		const serverName = this._mcpCustomizations.serverNameForCustomizationId(id);
		if (!serverName) {
			this._logService.warn(`[Copilot:${this.sessionId}] Cannot stop unknown MCP server customization ${id}`);
			return;
		}
		await this._wrapper.session.rpc.mcp.stopServer({ serverName });
		this._mcpCustomizations.applyOne({ name: serverName, state: { kind: McpServerStatus.Stopped } });
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
			type McpExecuteSamplingParams = Parameters<typeof this._wrapper.session.rpc.mcp.executeSampling>[0];
			const result = await this._wrapper.session.rpc.mcp.executeSampling({
				requestId,
				serverName,
				mcpRequestId: mcpRequestId as unknown as McpExecuteSamplingParams['mcpRequestId'],
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
		try {
			const toolCallId = request.toolCallId;
			if (!toolCallId) {
				// TODO: handle permission requests without a toolCallId by creating a synthetic tool call
				this._logService.warn(`[Copilot:${this.sessionId}] Permission request without toolCallId, auto-denying: kind=${request.kind}`);
				return { kind: 'reject' };
			}

			const autoApproval = this._lastAppliedPermissionMode === 'auto'
				? await this._takeAutoApproval(toolCallId)
				: undefined;
			const recommendation = autoApproval?.recommendation;
			if (recommendation === 'approve' && !request.requestSandboxBypass) {
				if (request.kind === 'custom-tool'
					&& typeof request.toolName === 'string'
					&& this._clientToolNames.has(request.toolName)
				) {
					const trackedToolCall = this._activeToolCalls.get(toolCallId);
					const displayName = trackedToolCall?.displayName ?? getToolDisplayName(request.toolName);
					const parameters = trackedToolCall?.parameters;
					const parentToolCallId = trackedToolCall?.parentToolCallId;
					this._onDidSessionProgress.fire({
						kind: 'pending_confirmation',
						chat: this._chatChannelUri,
						state: {
							status: ToolCallStatus.PendingConfirmation,
							toolCallId,
							toolName: request.toolName,
							displayName,
							invocationMessage: getInvocationMessage(request.toolName, displayName, parameters),
							toolInput: getToolInputString(request.toolName, parameters, tryStringify(parameters)),
							riskAssessment: autoApproval?.reason
								? {
									kind: ToolCallRiskAssessmentKind.Judge,
									status: ToolCallRiskAssessmentStatus.Complete,
									reason: autoApproval.reason,
									safety: 1,
								}
								: undefined,
						},
						parentToolCallId,
					});
				}
				return { kind: 'approve-once' };
			}

			const approvedSignature = this._approvedDuplicablePermissionSignatures.get(toolCallId);
			if (approvedSignature !== undefined) {
				this._approvedDuplicablePermissionSignatures.delete(toolCallId);
				if ((request.kind === 'write' || request.kind === 'read') && safeStringify(request) === approvedSignature) {
					this._logService.info(`[Copilot:${this.sessionId}] Auto-approving duplicate ${request.kind} permission request for tool call ${toolCallId}`);
					return { kind: 'approve-once' };
				}
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

			// Auto-approve the agent host's server tools. They only read or
			// mutate the session's own server-held state and never touch the
			// workspace, shell, or network, so prompting for them is redundant
			// noise. Tools that explicitly require confirmation (e.g. revealing
			// unreviewed review comments) are excluded so the user is prompted.
			if (request.kind === 'custom-tool' && typeof request.toolName === 'string'
				&& this._serverToolHost?.toolNames.includes(request.toolName)
				&& !this._serverToolHost.requiresConfirmation(request.toolName)
			) {
				this._logService.info(`[Copilot:${this.sessionId}] Auto-approving server tool ${request.toolName}`);
				return { kind: 'approve-once' };
			}

			const isShellRequest = request.kind === 'shell'
				|| (request.kind === 'custom-tool' && typeof request.toolName === 'string' && isShellTool(request.toolName));

			if (request.kind === 'custom-tool'
				&& typeof request.toolName === 'string'
				&& this._clientToolNames.has(request.toolName)
				&& this._pendingClientToolCalls.hasBufferedResult(toolCallId)
			) {
				this._logService.info(`[Copilot:${this.sessionId}] Auto-approving client tool ${request.toolName} because its result arrived before the permission request`);
				return { kind: 'approve-once' };
			}

			this._logService.info(`[Copilot:${this.sessionId}] Requesting confirmation for tool call: ${toolCallId}`);

			const deferred = new DeferredPromise<PermissionRequestResult>();
			this._pendingPermissions.set(toolCallId, deferred);

			// Auto-approve shell commands that run sandboxed by default, since the
			// sandbox already contains them. Commands that opted OUT of the sandbox
			// (`requestSandboxBypass`) are an elevation of privilege and must
			// fall through to the normal confirmation flow — otherwise enabling
			// `sandbox.allowBypass` would let the model escape the sandbox with no
			// prompt at all.
			if (isShellRequest && !request.requestSandboxBypass && await this._isShellSandboxedByDefault()) {
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

			// For write permission requests, build a FileEdit preview so the
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

			const isNewFile = edits?.items.some(edit => !edit.before && !!edit.after);
			const { confirmationTitle, invocationMessage, toolInput, permissionKind, permissionPath } = getPermissionDisplay(request, this._workingDirectory, isNewFile);

			// Fire a pending_confirmation signal to transition the tool to PendingConfirmation
			const toolName = request.toolName ?? request.kind;
			// Forward the tool's parentToolCallId (if any) so the host can
			// route the resulting ChatToolCallReady to the correct
			// subagent session — without it the action would land on the
			// parent session, which has no matching ChatToolCallStart.
			const parentToolCallId = this._activeToolCalls.get(toolCallId)?.parentToolCallId;
			this._onDidSessionProgress.fire({
				kind: 'pending_confirmation',
				chat: this._chatChannelUri,
				state: {
					status: ToolCallStatus.PendingConfirmation,
					toolCallId,
					toolName,
					displayName: getToolDisplayName(toolName),
					invocationMessage,
					toolInput,
					confirmationTitle,
					riskAssessment: autoApproval?.reason
						? {
							kind: ToolCallRiskAssessmentKind.Judge,
							status: ToolCallRiskAssessmentStatus.Complete,
							reason: autoApproval.reason,
							safety: recommendation === 'approve' ? 1 : 0,
						}
						: undefined,
					edits,
				},
				permissionKind,
				permissionPath,
				requestSandboxBypass: request.requestSandboxBypass,
				parentToolCallId,
			});

			const result = await deferred.p;
			this._logService.info(`[Copilot:${this.sessionId}] Permission response: toolCallId=${toolCallId}, result=${result.kind}`);
			if (result.kind === 'approve-once' && (request.kind === 'write' || request.kind === 'read')) {
				this._approvedDuplicablePermissionSignatures.set(toolCallId, safeStringify(request));
			}
			return result;
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
	 * Returns true when shell commands run inside a sandbox by default — either
	 * through the AgentHost's own {@link TerminalSandboxEngine} (when the custom
	 * terminal tool is enabled) or through the SDK's built-in shell tool wrapped
	 * by the `sandboxConfig` we pushed via `session.options.update`.
	 *
	 * Callers use this to auto-approve shell permission prompts that the sandbox
	 * already contains. Commands that explicitly opt out of the sandbox
	 * (`requestSandboxBypass`) are excluded by the caller, since the
	 * sandbox no longer contains them.
	 *
	 * Returns false when neither sandbox path is configured, so the standard
	 * confirmation flow is preserved.
	 */
	private async _isShellSandboxedByDefault(): Promise<boolean> {
		if (this._isCustomTerminalToolEnabled()) {
			if (!this._shellManager) {
				return false;
			}
			return this._shellManager.getOrCreateSandboxEngine().isEnabled();
		}
		// SDK-managed shell path: gate on the same host config that
		// `CopilotSessionLauncher` reads when forwarding `sandboxConfig` to
		// the SDK, so the two stay in lock-step.
		return this._computeSdkSandboxConfig() !== undefined;
	}

	/**
	 * `true` when the AgentHost's own shell tools (wrapped by
	 * {@link TerminalSandboxEngine}) replace the SDK's built-in shell. In that
	 * mode the SDK sandbox config is unused, so we neither forward nor toggle it.
	 */
	private _isCustomTerminalToolEnabled(): boolean {
		return this._configurationService.getRootValue(copilotCliConfigSchema, CopilotCliConfigKey.EnableCustomTerminalTool) === true;
	}

	/**
	 * The SDK-shaped sandbox policy for this session, mirroring
	 * {@link CopilotSessionLauncher}'s computation: `undefined` when the custom
	 * terminal tool is enabled (the host's own terminal sandbox engine handles
	 * containment) or when the host sandbox config evaluates to disabled
	 * (including on Windows, where the sandbox is not supported).
	 */
	private _computeSdkSandboxConfig(): ISdkSandboxConfig | undefined {
		if (this._isCustomTerminalToolEnabled()) {
			return undefined;
		}
		const sandbox = this._configurationService.getRootValue(sandboxConfigSchema, AgentHostSandboxConfigKey.Sandbox);
		return buildSandboxConfigForSdk(this._platform, sandbox);
	}

	/**
	 * `true` when the session runs with bypass approvals — either the global
	 * auto-approve setting or the session's `autoApprove` ("Allow All")
	 * level. Agent mode is an orthogonal axis and does not affect approvals.
	 */
	private _isBypassApprovals(): boolean {
		if (this._configurationService.getRootValue(platformRootSchema, AgentHostGlobalAutoApproveEnabledConfigKey) === true) {
			return true;
		}
		return this._configurationService.getEffectiveValue(this._storageUri.toString(), platformSessionSchema, SessionConfigKey.AutoApprove) === 'autoApprove';
	}

	private _getSdkPermissionMode(): PermissionAllowAllMode {
		if (this._isBypassApprovals()) {
			return 'on';
		}
		return this._getConfiguredApprovalLevel() === 'assisted'
			? 'auto'
			: 'off';
	}

	private _getConfiguredApprovalLevel(): string {
		return this._configurationService.getEffectiveValue(this._storageUri.toString(), platformSessionSchema, SessionConfigKey.AutoApprove) ?? 'default';
	}

	private _getConfiguredAgentMode(): string {
		return this._configurationService.getEffectiveValue(this._storageUri.toString(), platformSessionSchema, SessionConfigKey.Mode) ?? 'interactive';
	}

	private _subscribeToPermissionConfigChanges(): void {
		this._register(this._configurationService.onDidRootConfigChange(() => {
			void this._syncPermissionModeAfterConfigChange();
		}));
		this._register(this._configurationService.onDidSessionConfigChange(event => {
			if (event.session === this._storageUri.toString() && Object.hasOwn(event.config, SessionConfigKey.AutoApprove)) {
				void this._syncPermissionModeAfterConfigChange();
			}
		}));
	}

	private async _syncPermissionModeAfterConfigChange(): Promise<void> {
		try {
			await this.syncPermissionMode('config-change');
		} catch (error) {
			this._logService.error(error, `[Copilot:${this.sessionId}] Failed to apply permission config change; aborting active turn`);
			try {
				await this.abort();
			} catch (abortError) {
				this._logService.error(abortError, `[Copilot:${this.sessionId}] Failed to abort after permission config sync failure`);
			}
		}
	}

	private async _takeAutoApproval(toolCallId: string): Promise<PermissionAutoApproval | undefined> {
		if (this._autoApprovals.has(toolCallId)) {
			const autoApproval = this._autoApprovals.get(toolCallId) ?? undefined;
			this._autoApprovals.delete(toolCallId);
			return autoApproval;
		}
		const pending = new DeferredPromise<PermissionAutoApproval | undefined>();
		this._pendingAutoApprovals.set(toolCallId, pending);
		try {
			return await pending.p;
		} finally {
			this._pendingAutoApprovals.delete(toolCallId);
		}
	}

	private _recordAutoApproval(toolCallId: string, autoApproval: PermissionAutoApproval | undefined): void {
		const pending = this._pendingAutoApprovals.get(toolCallId);
		if (pending) {
			pending.complete(autoApproval);
			return;
		}
		this._autoApprovals.set(toolCallId, autoApproval ?? null);
	}

	syncPermissionMode(source: 'config-change' | 'turn-start'): Promise<void> {
		return this._permissionModeSequencer.queue(async () => {
			const mode = this._getSdkPermissionMode();
			const configuredLevel = this._getConfiguredApprovalLevel();
			this._logService.info(`[Copilot:${this.sessionId}] Syncing permission mode: source=${source}, agentMode=${this._getConfiguredAgentMode()}, configuredLevel=${configuredLevel}, sdkMode=${mode}, previousSdkMode=${this._lastAppliedPermissionMode ?? 'unknown'}, globalAutoApprove=${this._configurationService.getRootValue(platformRootSchema, AgentHostGlobalAutoApproveEnabledConfigKey) === true}`);
			const experimentalModeEnabled = mode === 'auto';
			if (this._autoApprovalExperimentalModeEnabled !== experimentalModeEnabled) {
				const experimentalResult = await this._wrapper.session.rpc.options.update({ isExperimentalMode: experimentalModeEnabled });
				if (!experimentalResult.success) {
					throw new Error(`Copilot SDK rejected experimental mode update required by permission mode '${mode}'`);
				}
				this._autoApprovalExperimentalModeEnabled = experimentalModeEnabled;
				this._logService.info(`[Copilot:${this.sessionId}] ${experimentalModeEnabled ? 'Enabled' : 'Disabled'} SDK experimental mode for permission mode '${mode}'`);
			}
			if (this._lastAppliedPermissionMode === mode) {
				return;
			}
			const result = await this._wrapper.session.rpc.permissions.setAllowAll({ mode });
			if (!result.success || (result.mode !== undefined && result.mode !== mode)) {
				throw new Error(`Copilot SDK rejected permission mode '${mode}'`);
			}
			this._lastAppliedPermissionMode = mode;
		});
	}

	/**
	 * Apply the SDK sandbox policy for the request that is about to be sent.
	 *
	 * Skips the SDK sandbox entirely when the custom terminal tool is enabled
	 * (the host's own terminal sandbox engine handles containment and the SDK's
	 * built-in shell is unused). Otherwise it always pushes the effective state
	 * so the SDK never retains a stale or auto-discovered sandbox: the
	 * configured policy unless the request runs with bypass approvals, or an
	 * explicitly disabled sandbox when no sandbox is configured (setting off,
	 * or Windows).
	 */
	private async _applyEffectiveSandboxConfig(): Promise<void> {
		if (this._isCustomTerminalToolEnabled()) {
			return;
		}
		const sandbox = this._configurationService.getRootValue(sandboxConfigSchema, AgentHostSandboxConfigKey.Sandbox);
		const base = buildSandboxConfigForSdk(this._platform, sandbox);
		const sandboxConfig: ISdkSandboxConfig | { enabled: false } = (base && !this._isBypassApprovals()) ? base : { enabled: false };
		try {
			await this._wrapper.session.rpc.options.update({ sandboxConfig });
		} catch (err) {
			this._logService.warn(`[Copilot:${this.sessionId}] Failed to update sandbox config for request`, err);
		}
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

		const afterUri = buildPendingEditContentUri(this._storageUri.toString(), toolCallId, filePath);
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
			deferred.complete(approved ? { kind: 'approve-once' } : { kind: 'denied-interactively-by-user' });
			return true;
		}
		return false;
	}

	private async _requestUnsandboxedCommandConfirmation(request: IUnsandboxedCommandConfirmationRequest): Promise<boolean> {
		const deferred = new DeferredPromise<PermissionRequestResult>();
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

		const parentToolCallId = this._activeToolCalls.get(request.toolCallId)?.parentToolCallId;
		this._onDidSessionProgress.fire({
			kind: 'pending_confirmation',
			chat: this._chatChannelUri,
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
			parentToolCallId,
		});

		return (await deferred.p).kind === 'approve-once';
	}

	// ---- user input handling ------------------------------------------------

	/**
	 * Handles a user input request from the SDK (ask_user tool). Auto-answers when the user is unavailable; otherwise waits for the renderer to respond via {@link respondToUserInputRequest}.
	 */
	private async _handleUserInputRequest(
		request: UserInputRequest,
		_invocation: { sessionId: string },
	): Promise<UserInputResponse> {
		const isAutopilot = this._isAutopilotMode();
		if (isAutopilot || this._isAutoReplyEnabled()) {
			return {
				answer: 'The user is not available to answer your question. Choose a pragmatic option best aligned with the context of the request.',
				wasFreeform: true,
			};
		}
		if (!this.hasActiveTurn) {
			this._logService.warn(`[Copilot:${this.sessionId}] Rejecting user input request without an active turn`);
			return { answer: 'No active turn', wasFreeform: true };
		}

		const questionPreview = request.question.substring(0, 100);
		try {
			const requestId = generateUuid();
			const questionId = generateUuid();
			this._logService.info(`[Copilot:${this.sessionId}] User input request: requestId=${requestId}, question="${questionPreview}"`);

			const deferred = new DeferredPromise<{ response: ChatInputResponseKind; answers?: Record<string, ChatInputAnswer> }>();
			this._pendingUserInputs.set(requestId, { deferred, questionId });

			// Build the protocol ChatInputRequest from the SDK's simple format
			const inputRequest: ChatInputRequest = {
				id: requestId,
				questions: [request.choices && request.choices.length > 0
					? {
						kind: ChatInputQuestionKind.SingleSelect,
						id: questionId,
						message: request.question,
						required: true,
						options: request.choices.map(c => ({ id: c, label: c })),
						allowFreeformInput: request.allowFreeform ?? true,
					}
					: {
						kind: ChatInputQuestionKind.Text,
						id: questionId,
						message: request.question,
						required: true,
					},
				],
			};

			this._emitAction({
				type: ActionType.ChatInputRequested,
				request: inputRequest,
			});

			const result = await deferred.p;
			this._logService.info(`[Copilot:${this.sessionId}] User input response: requestId=${requestId}, response=${result.response}`);

			if (result.response !== ChatInputResponseKind.Accept || !result.answers) {
				return { answer: '', wasFreeform: true };
			}

			// Extract the answer for our single question
			const answer = result.answers[questionId];
			if (!answer || answer.state === ChatInputAnswerState.Skipped) {
				return { answer: '', wasFreeform: true };
			}

			const { value: val } = answer;
			if (val.kind === ChatInputAnswerValueKind.Text) {
				return { answer: val.value, wasFreeform: true };
			} else if (val.kind === ChatInputAnswerValueKind.Selected) {
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
	 *   {@link ChatInputQuestion}s.
	 * - `url` mode requests surface as a question-less input request whose
	 *   {@link ChatInputRequest.url} drives the renderer's "open URL"
	 *   affordance.
	 *
	 * Under autopilot the request is auto-cancelled — there is no user
	 * available to fill in a form, and accepting with empty content would
	 * be misleading to the MCP server.
	 */
	private async _handleElicitationRequest(context: ElicitationContext): Promise<ElicitationResult> {
		const isAutopilot = this._isAutopilotMode();
		if (isAutopilot) {
			return { action: 'cancel' };
		}
		if (!this.hasActiveTurn) {
			this._logService.warn(`[Copilot:${this.sessionId}] Rejecting elicitation request without an active turn`);
			return { action: 'decline' };
		}

		const messagePreview = context.message.substring(0, 100);
		try {
			const requestId = generateUuid();
			this._logService.info(`[Copilot:${this.sessionId}] Elicitation request: requestId=${requestId}, mode=${context.mode ?? 'form'}, source=${context.elicitationSource ?? '<unknown>'}, message="${messagePreview}"`);

			const schema = context.mode === 'url' ? undefined : context.requestedSchema;
			const requiredSet = new Set(schema?.required ?? []);
			const questions: ChatInputQuestion[] | undefined = schema
				? Object.entries(schema.properties).map(([fieldName, field]) => elicitationFieldToQuestion(fieldName, field, requiredSet.has(fieldName)))
				: undefined;

			const deferred = new DeferredPromise<{ response: ChatInputResponseKind; answers?: Record<string, ChatInputAnswer> }>();
			this._pendingElicitations.set(requestId, { deferred, schema });

			const inputRequest: ChatInputRequest = {
				id: requestId,
				message: context.message,
				...(context.mode === 'url' && context.url ? { url: context.url } : {}),
				...(questions && questions.length > 0 ? { questions } : {}),
			};

			this._emitAction({
				type: ActionType.ChatInputRequested,
				request: inputRequest,
			});

			const result = await deferred.p;
			this._logService.info(`[Copilot:${this.sessionId}] Elicitation response: requestId=${requestId}, response=${result.response}`);

			if (result.response === ChatInputResponseKind.Decline) {
				return { action: 'decline' };
			}
			if (result.response !== ChatInputResponseKind.Accept) {
				return { action: 'cancel' };
			}
			const answers = result.answers ?? {};
			if (!schema) {
				const freeform = answers.answer;
				if (freeform && freeform.state !== ChatInputAnswerState.Skipped && freeform.value.kind === ChatInputAnswerValueKind.Text) {
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

	respondToUserInputRequest(requestId: string, response: ChatInputResponseKind, answers?: Record<string, ChatInputAnswer>): boolean {
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
		response: ChatInputResponseKind,
		answers?: Record<string, ChatInputAnswer>,
	): IExitPlanModeResponse {
		if (response !== ChatInputResponseKind.Accept) {
			return { approved: false };
		}
		const answer = answers?.[pending.questionId];
		if (!answer || answer.state === ChatInputAnswerState.Skipped) {
			return { approved: false };
		}
		const value = answer.value;

		// Determine the selected action and any freeform feedback. The
		// `single-select` question may carry both (when the user picks an
		// option AND types feedback), or just freeform text (when the
		// user types instead of picking). Normalize to one shape.
		let candidateAction: string | undefined;
		let feedback: string | undefined;
		if (value.kind === ChatInputAnswerValueKind.Selected) {
			candidateAction = value.value;
			const freeform = value.freeformValues?.find(s => s.trim().length > 0)?.trim();
			feedback = freeform;
		} else if (value.kind === ChatInputAnswerValueKind.Text) {
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

		// Reflect the chosen implementation path on the AHP `mode` axis right
		// away so the mode picker updates as soon as the user approves the
		// plan (e.g. Plan → Autopilot when they pick "Implement with
		// Autopilot"). The SDK also fires `session.mode_changed`, but that is
		// async; writing here makes the UI update deterministic. The patch is
		// idempotent, so the later event is a no-op.
		this._syncAhpModeFromExitPlanAction(selectedAction);

		const isAutopilot = selectedAction === 'autopilot' || selectedAction === 'autopilot_fleet';
		return {
			approved: true,
			selectedAction,
			...(isAutopilot && this._isBypassApprovals() ? { autoApproveEdits: true } : {}),
		};
	}

	/**
	 * Translates an approved `exit_plan_mode` action into the AHP `mode` axis
	 * and writes it so the mode picker reflects the choice immediately:
	 *
	 *  - `autopilot` / `autopilot_fleet` → `mode='autopilot'`.
	 *  - `interactive` → `mode='interactive'`.
	 *  - `exit_only` (approve plan without executing) leaves the mode untouched.
	 */
	private _syncAhpModeFromExitPlanAction(selectedAction: string): void {
		switch (selectedAction) {
			case 'autopilot':
			case 'autopilot_fleet':
				this._syncAhpConfigFromSdkMode('autopilot');
				break;
			case 'interactive':
				this._syncAhpConfigFromSdkMode('interactive');
				break;
		}
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
					type: ActionType.ChatResponsePart,
					turnId: this._turnId,
					part: {
						kind: ResponsePartKind.SystemNotification,
						content: notification.messageText,
					},
				});
				return;
			}
			if (!notification.startsTurn) {
				this._logService.trace(`[Copilot:${sessionId}] Ignoring passive system.notification kind=${e.data.kind.type} without an active turn`);
				return;
			}

			const turnId = generateUuid();
			this.resetTurnState(turnId);
			this._emitAction({
				type: ActionType.ChatTurnStarted,
				turnId,
				startedAt: new Date().toISOString(),
				message: {
					text: notification.messageText,
					origin: { kind: MessageKind.SystemNotification },
				},
			});
		}));

		// Handle `user.message` events with three responsibilities:
		//
		// 1. Skip subagent and SDK-injected (`source !== 'user'`) messages
		//    outright — neither represents a root user turn and neither may
		//    be associated with the root turn boundary.
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
			if (e.agentId || (e.data.source && e.data.source.toLowerCase() !== 'user')) {
				return;
			}
			// First SDK event for the loop: promote the turn out of `pending`.
			this._currentTurn?.markRunning();
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
			// Report the enhanced GH `request.options.tools` event for this model call — parity with
			// the Copilot extension, which emits it per LLM request. `assistant.message` is the
			// agent-host's per-model-call boundary; we correlate on its `x-copilot-service-request-id`.
			// Main agent only: `_appliedSnapshot.tools` is the session's tool set, which does not
			// describe a subagent's model call, so subagent messages (mapped or dropped) are skipped.
			if (!e.agentId) {
				this._telemetryReporter.assistantMessageReceived(this.sessionUri.toString(), e.data.serviceRequestId, this._appliedSnapshot.tools);
				// Restricted `conversation.messageText` (source=model): the model's raw response text.
				this._telemetryReporter.modelMessageText(this.sessionUri.toString(), e.data.content, this._turnOrdinal, e.data.serviceRequestId);
				// Accumulate the per-turn tool-call aggregate for the restricted `toolCallDetails` event.
				// Every main-agent `assistant.message` is one model-call round (matches the extension's
				// `numRequests = toolCallRounds.length`, which counts the final tool-free response round
				// too); the tool-count stats only apply to rounds that carried tool requests.
				const turn = this._currentTurn;
				if (turn) {
					turn.toolCallRounds++;
					if (e.data.model) {
						turn.lastModel = e.data.model;
					}
					const toolRequests = e.data.toolRequests;
					if (toolRequests?.length) {
						turn.totalToolCalls += toolRequests.length;
						if (toolRequests.length > 1) {
							turn.parallelToolCallRounds++;
							turn.parallelToolCallsTotal += toolRequests.length;
						}
						for (const req of toolRequests) {
							turn.toolCounts.set(req.name, (turn.toolCounts.get(req.name) ?? 0) + 1);
						}
					}
				}
			}
			// The SDK fires a `message` event with the full assembled content after
			// streaming deltas. If deltas already created a markdown part for this
			// turn, the live state is up to date and we skip. Only emit a fresh
			// part when no deltas preceded the message (e.g. text after tool calls
			// where the SDK delivered the full message at once).
			//
			// Other fields (toolRequests, reasoningText, encryptedContent) are
			// only used for history reconstruction and live tool calls fire their
			// own tool_start events, so we can safely drop them here.
			if (!e.data.content) {
				return;
			}
			if (this._shouldDropUnmappedSubagentEvent(e, 'assistant.message')) {
				return;
			}
			const parentToolCallId = this._parentToolCallIdForSubagentEvent(e);
			const markdownScope = parentToolCallId ?? '';
			if (this._currentTurn?.markdownPartIds.has(markdownScope)) {
				return;
			}
			const partId = generateUuid();
			this._currentTurn?.markdownPartIds.set(markdownScope, partId);
			this._emitAction({
				type: ActionType.ChatResponsePart,
				turnId: this._turnId,
				part: { kind: ResponsePartKind.Markdown, id: partId, content: e.data.content },
			}, parentToolCallId);
		}));

		// TODO@connor4312: Remove this correlation once the SDK permission callback includes auto-approval data.
		this._register(wrapper.onPermissionRequested(e => {
			const toolCallId = e.data.permissionRequest.toolCallId;
			if (toolCallId) {
				this._recordAutoApproval(toolCallId, e.data.promptRequest?.autoApproval);
			}
		}));

		this._register(wrapper.onToolStart(e => {
			if (isHiddenTool(e.data.toolName)) {
				this._logService.trace(`[Copilot:${sessionId}] Tool started (hidden): ${e.data.toolName}`);
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
			this._activeToolCalls.set(e.data.toolCallId, { toolName: e.data.toolName, displayName, parameters, content: [], parentToolCallId, mcpServerName: e.data.mcpServerName, meta: undefined });
			if (isTaskCompleteTool(e.data.toolName)) {
				const scope = parentToolCallId ?? '';
				this._currentTurn?.markdownPartIds.delete(scope);
				this._currentTurn?.reasoningPartIds.delete(scope);
				return;
			}
			const toolKind = getToolKind(e.data.toolName);
			const subagentMeta = toolKind === 'subagent' ? getSubagentMetadata(parameters) : undefined;

			let contributor: { readonly kind: ToolCallContributorKind.Client; readonly clientId: string } | { readonly kind: ToolCallContributorKind.MCP; readonly customizationId: string } | undefined;
			const isClientTool = this._clientToolNames.has(e.data.toolName);
			const ownerClientId = isClientTool ? this._activeClientToolSet.ownerOf(e.data.toolName, this._currentTurn?.senderClientId) : undefined;
			if (ownerClientId) {
				contributor = { kind: ToolCallContributorKind.Client, clientId: ownerClientId };
			} else if (e.data.mcpServerName) {
				const customizationId = this._mcpCustomizations.customizationIdForServer(e.data.mcpServerName);
				if (customizationId !== undefined) {
					contributor = { kind: ToolCallContributorKind.MCP, customizationId };
				}
			}

			// A new tool call invalidates the current markdown and reasoning
			// parts so the next text/reasoning delta after the tool call
			// starts a fresh part. Without invalidating reasoning here, a
			// later round of reasoning (after tool_start/tool_complete)
			// would silently append to the pre-tool-call reasoning block.
			this._currentTurn?.markdownPartIds.delete(parentToolCallId ?? '');
			this._currentTurn?.reasoningPartIds.delete(parentToolCallId ?? '');

			const meta: Mutable<IToolCallMeta> = { toolKind, language: toolKind === 'terminal' ? getShellLanguage(e.data.toolName) : undefined };
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
			// eslint-disable-next-line local/code-no-untyped-meta-access -- Copilot SDK's own typed `_meta`, not the AHP protocol bag.
			const resourceUri = e.data.toolDescription?._meta?.ui?.resourceUri;
			this._setToolCallUiMeta(meta, resourceUri, e.data.mcpServerName);

			// Stash the start-time meta on the tracked tool call so the
			// `tool.execution_complete` emission below can merge any
			// additional namespaces (e.g. `ui`) on top without dropping
			// what we already published at start time.
			const tracked = this._activeToolCalls.get(e.data.toolCallId);
			if (tracked) {
				tracked.meta = meta;
			}

			this._emitAction({
				type: ActionType.ChatToolCallStart,
				turnId: this._turnId,
				toolCallId: e.data.toolCallId,
				toolName: e.data.toolName,
				displayName,
				intention: getShellIntention(e.data.toolName, parameters),
				contributor,
				_meta: toToolCallMeta(meta),
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
					type: ActionType.ChatToolCallReady,
					turnId: this._turnId,
					toolCallId: e.data.toolCallId,
					invocationMessage: getInvocationMessage(e.data.toolName, displayName, parameters),
					toolInput: getToolInputString(e.data.toolName, parameters, toolArgs),
					confirmed: ToolCallConfirmationReason.NotNeeded,
				}, parentToolCallId);
				this._emitAction({
					type: ActionType.ChatToolCallComplete,
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

			const shouldWaitForClientToolReady = contributor?.kind === ToolCallContributorKind.Client
				&& !isAgentCoordinationTool(e.data.toolName)
				&& this._lastAppliedPermissionMode !== 'on';
			if (shouldWaitForClientToolReady) {
				return;
			}

			this._emitAction({
				type: ActionType.ChatToolCallReady,
				turnId: this._turnId,
				toolCallId: e.data.toolCallId,
				invocationMessage: getInvocationMessage(e.data.toolName, displayName, parameters),
				toolInput: getToolInputString(e.data.toolName, parameters, toolArgs),
				confirmed: ToolCallConfirmationReason.NotNeeded,
			}, parentToolCallId);
		}));

		this._register(wrapper.onToolComplete(async e => {
			this._approvedDuplicablePermissionSignatures.delete(e.data.toolCallId);
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
			this._autoApprovals.delete(e.data.toolCallId);
			this._pendingAutoApprovals.get(e.data.toolCallId)?.complete(undefined);
			const displayName = tracked.displayName;
			const toolOutput = e.data.error?.message ?? e.data.result?.content;

			if (isTaskCompleteTool(tracked.toolName)) {
				const summary = getTaskCompleteMarkdown(tracked.parameters, toolOutput);
				if (summary) {
					this._emitAction({
						type: ActionType.ChatResponsePart,
						turnId: this._turnId,
						part: { kind: ResponsePartKind.Markdown, id: generateUuid(), content: summary },
					});
				}
				return;
			}

			const content: ToolResultContent[] = [...tracked.content];
			if (toolOutput !== undefined) {
				content.push({ type: ToolResultContentType.Text, text: toolOutput });
			}
			appendSdkToolResultContent(content, e.data.result?.contents);

			const command = isString(tracked.parameters?.command) ? tracked.parameters.command : undefined;
			const filePaths = isEditTool(tracked.toolName, command) ? this._getEditFilePaths(tracked.parameters) : [];
			for (const filePath of filePaths) {
				try {
					const fileEdit = await this._editTracker.takeCompletedEdit(this._turnId, e.data.toolCallId, filePath, tracked.toolName, tracked.parameters, this._lastSeenModelId);
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
				type: ActionType.ChatToolCallComplete,
				turnId: this._turnId,
				toolCallId: e.data.toolCallId,
				result: {
					success: e.data.success,
					pastTenseMessage: getPastTenseMessage(tracked.toolName, displayName, tracked.parameters, e.data.success, e.data.success ? toolOutput : undefined),
					content: content.length > 0 ? content : undefined,
					error: e.data.error,
				},
				_meta: tracked.meta ? toToolCallMeta(tracked.meta) : undefined,
			}, parentToolCallId);
		}));

		this._register(wrapper.onIdle(e => {
			this._logService.info(`[Copilot:${sessionId}] Session idle`);
			if (this._hasActivity) {
				this._hasActivity = false;
				this._emitAction({
					type: ActionType.SessionActivityChanged,
					activity: undefined,
				});
			}
			const turn = this._currentTurn;
			if (!turn) {
				return;
			}
			// An abort drives the loop to idle. That terminal idle must never
			// complete a turn:
			//  - if `turn` is the aborted (running) turn, the client-dispatched
			//    `ChatTurnCancelled` finalizes the protocol turn; drop our handle
			//    so a later idle can't complete it.
			//  - if `turn` is still `pending`, a queued message started it after
			//    the abort and the SDK has not run it yet; completing it would
			//    emit an empty `ChatTurnComplete` and orphan its real response.
			//    Leave it open for its own (non-abort) idle.
			// The structural `pending` guard below already protects the
			// queued-message case; reading `e.data.aborted` is the authoritative
			// SDK signal that lets us also tear down the aborted running turn.
			if (e.data.aborted) {
				if (turn.isRunning) {
					this._logService.trace(`[Copilot:${sessionId}] Idle from abort; tearing down running turn ${turn.id}`);
					turn.markAborted();
					this._currentTurn = undefined;
				} else {
					this._logService.trace(`[Copilot:${sessionId}] Idle from abort; leaving ${turn.state} turn ${turn.id} open`);
				}
				return;
			}
			// Only a `running` turn is completed by a normal idle. A `pending`
			// turn here means the SDK went idle before emitting any event for it
			// (a degenerate no-op send); complete it defensively so the session
			// does not hang.
			this._completeActiveTurn();
		}));

		// The SDK emits a `skill` tool call (which we hide) and a richer
		// `skill.invoked` event with the resolved SKILL.md path. Synthesize a
		// tool-start/complete pair from the latter so the UI can render a
		// clickable file link, matching the `view`-tool display style.
		this._register(wrapper.onSkillInvoked(e => {
			this._logService.info(`[Copilot:${sessionId}] Skill invoked: ${e.data.name} (${e.data.path})`);
			if (this._shouldDropUnmappedSubagentEvent(e, 'skill.invoked')) {
				return;
			}
			// Restricted `skillContentRead`: which skill file was loaded. Main-agent only, like the other restricted events.
			if (!e.agentId) {
				this._telemetryReporter.skillContentRead({
					name: e.data.name,
					path: e.data.path,
					content: e.data.content,
					source: e.data.source,
					pluginName: e.data.pluginName,
					pluginVersion: e.data.pluginVersion,
				});
			}
			const parentToolCallId = this._parentToolCallIdForSubagentEvent(e);
			const synth = synthesizeSkillToolCall(e.data, e.id);
			this._emitAction({
				type: ActionType.ChatToolCallStart,
				turnId: this._turnId,
				toolCallId: synth.toolCallId,
				toolName: synth.toolName,
				displayName: synth.displayName,
			}, parentToolCallId);
			this._emitAction({
				type: ActionType.ChatToolCallReady,
				turnId: this._turnId,
				toolCallId: synth.toolCallId,
				invocationMessage: synth.invocationMessage,
				confirmed: ToolCallConfirmationReason.NotNeeded,
			}, parentToolCallId);
			this._emitAction({
				type: ActionType.ChatToolCallComplete,
				turnId: this._turnId,
				toolCallId: synth.toolCallId,
				result: {
					success: true,
					pastTenseMessage: synth.pastTenseMessage,
				},
			}, parentToolCallId);
		}));

		this._register(wrapper.onSubagentStarted(e => {
			if (e.agentId) {
				this._parentToolCallIdsByAgentId.set(e.agentId, e.data.toolCallId);
			}
			this._logService.info(`[Copilot:${sessionId}] Subagent started: toolCallId=${e.data.toolCallId}, agent=${e.data.agentName}`);
			const tracked = this._activeToolCalls.get(e.data.toolCallId);
			this._onDidSessionProgress.fire({
				kind: 'subagent_started',
				chat: this._chatChannelUri,
				toolCallId: e.data.toolCallId,
				agentName: e.data.agentName,
				agentDisplayName: e.data.agentDisplayName,
				agentDescription: e.data.agentDescription,
				// The spawning Task tool's short `description` input (captured on
				// tool start) is the concise per-task tab title for the subagent's
				// read-only peer chat — distinct even for same-type subagents.
				taskDescription: tracked?.meta?.subagentDescription,
				// The full delegated instruction (the spawning tool's `prompt`
				// argument) seeds the subagent peer chat's opening request.
				taskPrompt: typeof tracked?.parameters?.prompt === 'string' ? tracked.parameters.prompt : undefined,
				// When the spawning tool call is itself an inner tool of
				// another subagent, its recorded parent is the tool call one
				// level up — the tool call in whose (subagent) chat this
				// spawning tool lives. The host uses it to route the
				// discovery content block to that immediate parent chat, at
				// any nesting depth.
				parentToolCallId: tracked?.parentToolCallId,
			});
		}));

		this._register(wrapper.onSessionError(e => {
			this._logService.error(`[Copilot:${sessionId}] Session error: ${e.data.errorType} - ${e.data.message}`);
			// Prefer the structured SDK fields (the Copilot CLI classifies its own
			// CAPI errors); fall back to decoding a forwarded marker from the message.
			const meta = tryBuildChatErrorMetaFromFields(e.data) ?? tryBuildChatErrorMeta(e.data.message);
			this._emitAction({
				type: ActionType.ChatError,
				turnId: this._turnId,
				duration: this._currentTurn?.duration ?? 0,
				error: {
					errorType: e.data.errorType,
					message: stripProxyErrorMarker(e.data.message),
					stack: e.data.stack,
					...(meta ? { _meta: meta } : {}),
				},
			});
		}));

		// Tracks the last parent-scope usage so the async attribution enrichment
		// can re-emit a complete action (with accumulated credits, quota, etc.).
		let lastParentUsage: UsageInfo | undefined;
		let lastParentUsageTurnId: string | undefined;
		let autoModeResolved: { readonly turnId: string; readonly data: NonNullable<UsageInfoMeta['autoModeResolved']> } | undefined;

		this._register(wrapper.onAutoModeResolved(e => {
			this._lastSeenModelId = e.data.chosenModel;
			const turnId = this._turnId;
			this._logService.info(`[Copilot:${sessionId}] Auto mode resolved to ${e.data.chosenModel}${e.data.reasoningBucket ? ` (${e.data.reasoningBucket})` : ''}`);
			if (!turnId) {
				return;
			}
			autoModeResolved = { turnId, data: e.data };
			const priorUsage = lastParentUsageTurnId === turnId ? lastParentUsage : undefined;
			const usage: UsageInfo = {
				...priorUsage,
				model: e.data.chosenModel,
				_meta: {
					...(priorUsage?._meta ?? {}),
					autoModeResolved: e.data,
				},
			};
			lastParentUsage = usage;
			lastParentUsageTurnId = turnId;
			this._emitAction({
				type: ActionType.ChatUsage,
				turnId,
				usage,
			});
		}));

		this._register(wrapper.onUsage(e => {
			// Usage events for a subagent's model calls carry the subagent's
			// `agentId`. Such an event is reported twice:
			//  1. Folded into the parent turn (scope `''`) so the parent turn's
			//     reported cost stays the full turn aggregate (parent + every
			//     subagent), and
			//  2. Emitted to the subagent's own child session (via
			//     `parentToolCallId`) carrying just that subagent's running
			//     component total, so the subagent tool can show its own cost.
			// Main-agent (or unmapped subagent) events only contribute to the
			// parent aggregate.
			const parentToolCallId = this._parentToolCallIdForSubagentEvent(e);
			// TODO: `copilotUsage` is marked `asInternal` in the SDK schema so it is not exposed on the generated
			// `AssistantUsageData` type, but it is present at runtime. Read it dynamically.
			const copilotUsage = (e.data as unknown as Record<string, unknown>).copilotUsage as { totalNanoAiu?: number } | undefined;
			// `quotaSnapshots` is likewise `asInternal` in the SDK schema (not on the generated type) but is
			// present at runtime. Forward the per-category snapshots on `_meta` so the client can keep the
			// account quota UI current. Mirrors the extension-host CLI path, which feeds these into its quota service.
			const quotaSnapshots = normalizeQuotaSnapshots((e.data as unknown as Record<string, unknown>).quotaSnapshots);
			const turn = this._currentTurn;

			if (typeof e.data.model === 'string' && e.data.model) {
				this._lastSeenModelId = e.data.model;
			}

			// This event's own context usage (the model call that produced it).
			const eventContext = {
				inputTokens: e.data.inputTokens,
				outputTokens: e.data.outputTokens,
				model: e.data.model,
				cacheReadTokens: e.data.cacheReadTokens,
				...(typeof e.data.cost === 'number' ? { cost: e.data.cost } : {}),
			};

			// Record the parent agent's own context usage so subagent events
			// don't overwrite the model/context tokens shown for the parent turn.
			if (!parentToolCallId && turn) {
				turn.parentContextUsage = eventContext;
			}

			// Builds a usage object carrying the given context's tokens/model
			// and the running credit total for the given scope.
			const buildUsage = (scope: string, context: UsageContext): UsageInfo => {
				const metadata: UsageInfoMeta = {};
				if (typeof context.cost === 'number') {
					metadata.cost = context.cost;
				}
				if (scope === '' && autoModeResolved?.turnId === this._turnId) {
					metadata.autoModeResolved = autoModeResolved.data;
				}
				if (turn && typeof copilotUsage?.totalNanoAiu === 'number') {
					const scopedTotal = (turn.copilotUsageTotalNanoAiuByScope.get(scope) ?? 0) + copilotUsage.totalNanoAiu;
					turn.copilotUsageTotalNanoAiuByScope.set(scope, scopedTotal);
					metadata.copilotUsage = {
						...copilotUsage,
						totalNanoAiu: scopedTotal,
					};
				}
				if (quotaSnapshots) {
					metadata.quotaSnapshots = quotaSnapshots;
				}
				return {
					inputTokens: context.inputTokens,
					outputTokens: context.outputTokens,
					model: context.model,
					cacheReadTokens: context.cacheReadTokens,
					...(Object.keys(metadata).length > 0 ? { _meta: metadata } : {}),
				};
			};

			// Parent turn aggregate (scope `''`): every model call contributes
			// its credits, but a subagent event must not replace the parent
			// turn's own model/context-token usage. Fold subagent credits into
			// the parent aggregate while preserving the parent's context.
			const parentContext = parentToolCallId ? (turn?.parentContextUsage ?? {}) : eventContext;
			const parentUsage = buildUsage('', parentContext);
			lastParentUsage = parentUsage;
			lastParentUsageTurnId = this._turnId;
			this._emitAction({
				type: ActionType.ChatUsage,
				turnId: this._turnId,
				usage: parentUsage,
			});

			// Subagent component: additionally report the subagent's own running
			// total to its child session.
			if (parentToolCallId) {
				this._emitAction({
					type: ActionType.ChatUsage,
					turnId: this._turnId,
					usage: buildUsage(parentToolCallId, eventContext),
				}, parentToolCallId);
			}
		}));

		// After each usage event, asynchronously fetch the per-source context-
		// window attribution from the SDK and re-emit the usage action enriched
		// with the attribution data. The reducer replaces `activeTurn.usage` so
		// the widget picks up the detailed breakdown on the next render cycle.
		this._register(wrapper.onUsage(async e => {
			// Only enrich the parent-turn aggregate (not subagent scopes).
			if (this._parentToolCallIdForSubagentEvent(e)) {
				return;
			}
			const turnId = this._turnId;
			// Capture the base usage before the await boundary so concurrent
			// usage events don't overwrite what we merge into.
			const baseUsage = lastParentUsageTurnId === turnId ? lastParentUsage : undefined;
			const usage = baseUsage ?? {
				inputTokens: e.data.inputTokens,
				outputTokens: e.data.outputTokens,
				model: e.data.model,
				cacheReadTokens: e.data.cacheReadTokens,
			};
			try {
				const result = await this._wrapper.session.rpc.metadata.getContextAttribution();
				const attribution = result?.contextAttribution;
				if (!attribution || !turnId) {
					this._logService.trace(`[Copilot:${sessionId}] contextAttribution: null/empty (turnId=${turnId})`);
					return;
				}
				// If the turn changed while we were awaiting, don't pollute the
				// new turn's state with stale attribution data.
				if (turnId !== this._turnId) {
					return;
				}
				// Guard against a newer usage event having arrived while we
				// were awaiting — only enrich if baseUsage is still current.
				if (usage !== lastParentUsage || lastParentUsageTurnId !== turnId) {
					return;
				}
				if (this._logService.getLevel() <= LogLevel.Trace) {
					this._logService.trace(`[Copilot:${sessionId}] contextAttribution: totalTokens=${attribution.totalTokens}, entries=${JSON.stringify(attribution.entries.map(e => ({ kind: e.kind, id: e.id, label: e.label, tokens: e.tokens, parentId: e.parentId })))}`);
				}
				// Re-emit the usage action preserving the captured parent-scope
				// usage (with accumulated credits) but adding the attribution.
				const enriched: UsageInfo = {
					...usage,
					_meta: {
						...(usage._meta ?? {}),
						contextAttribution: attribution,
					},
				};
				lastParentUsage = enriched;
				lastParentUsageTurnId = turnId;
				this._emitAction({
					type: ActionType.ChatUsage,
					turnId,
					usage: enriched,
				});
			} catch (err) {
				this._logService.trace(`[Copilot:${sessionId}] contextAttribution RPC failed: ${(err as Error)?.message ?? err}`);
			}
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
		// before sending). The SDK and AHP share the same three modes
		// (`interactive` / `plan` / `autopilot`), so we map directly.
		this._register(wrapper.onSessionModeChanged(e => {
			// Sub-agents (e.g. a `task` tool sub-agent running in plan mode)
			// emit their own `session.mode_changed` events carrying an
			// `agentId`.
			if (e.agentId) {
				this._logService.trace(`[Copilot:${sessionId}] Ignoring subagent session.mode_changed: agentId=${e.agentId}, ${e.data.previousMode} -> ${e.data.newMode}`);
				return;
			}
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
		// bare top-level entry (`SessionCustomizationUpdated`). Each state
		// change is also logged (with structured metadata) so it flows to the
		// agent host's OTLP log stream and the per-server Output channels.
		this._register(wrapper.onMcpServersLoaded(e => {
			this._logMcpServersSnapshot(e.data.servers.map(s => ({
				name: s.name,
				status: s.status,
				error: s.error,
				source: s.source,
				transport: s.transport,
				pluginName: s.pluginName,
				pluginVersion: s.pluginVersion,
			})), 'loaded');
			this._applyMcpServerList(e.data.servers);
		}));
		this._register(wrapper.onMcpServerStatusChanged(e => {
			this._logMcpServerLifecycle({ name: e.data.serverName, status: e.data.status, error: e.data.error, origin: 'statusChanged' });
			const server = this._toSdkMcpServer(e.data.serverName, e.data.status, e.data.error);
			if (!server) {
				this._mcpCustomizations.remove(e.data.serverName);
				return;
			}
			this._mcpCustomizations.applyOne(server);
		}));

		this._register(wrapper.onToolsUpdated(() => {
			this._slashCommandProvider.clearCache();
			this._fireMcpToolsListChanged();
		}));
		this._register(wrapper.onCommandsChanged(() => {
			this._slashCommandProvider.clearCache();
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
		this._refreshMcpServersFromRpc().catch(err => {
			this._logService.warn(`[Copilot:${this.sessionId}] Failed to seed MCP server inventory`, err);
		});
	}

	private async _refreshMcpServersFromRpc(): Promise<void> {
		const mcpRpc = this._wrapper.session.rpc?.mcp;
		if (!mcpRpc) {
			return;
		}
		const result = await mcpRpc.list();
		if (!this._store.isDisposed) {
			this._logMcpServersSnapshot(result.servers.map(s => ({
				name: s.name,
				status: s.status,
				error: s.error,
				source: s.source,
				pluginName: s.sourcePlugin,
				pluginVersion: s.sourcePluginVersion,
			})), 'inventory');
			this._applyMcpServerList(result.servers);
		}
	}

	private _applyMcpServerList(servers: readonly { readonly name: string; readonly status: SdkMcpServerStatus; readonly error?: string }[]): void {
		const sdkServers = servers
			.map(s => this._toSdkMcpServer(s.name, s.status, s.error));
		this._mcpCustomizations.applyAll(sdkServers);
	}

	/**
	 * Logs a full MCP inventory snapshot ({@link _logMcpServerLifecycle} per
	 * server), then forgets the dedup entry for any server that dropped out of
	 * the snapshot so a later re-add re-logs its arrival.
	 */
	private _logMcpServersSnapshot(servers: readonly IMcpLifecycleLogInfo[], origin: McpLifecycleOrigin): void {
		const seen = new Set<string>();
		for (const server of servers) {
			seen.add(server.name);
			this._logMcpServerLifecycle({ ...server, origin });
		}
		for (const name of [...this._lastLoggedMcpStatus.keys()]) {
			if (!seen.has(name)) {
				this._lastLoggedMcpStatus.delete(name);
			}
		}
	}

	/**
	 * Emits a single structured MCP lifecycle log record for `server`,
	 * deduplicated by SDK status so an unchanged re-report stays quiet. Failed
	 * servers log at `error` (carrying the failure text in the body and an
	 * `errorType` attribute); every other transition logs at `info`. Records
	 * flow through {@link ILogService} to the agent host's OTLP log stream.
	 */
	private _logMcpServerLifecycle(server: IMcpLifecycleLogInfo & { readonly origin: McpLifecycleOrigin }): void {
		if (this._lastLoggedMcpStatus.get(server.name) === server.status) {
			return;
		}
		this._lastLoggedMcpStatus.set(server.name, server.status);

		const state = this._translateSdkMcpStatus(server.name, server.status, server.error);
		const attributes: Record<string, OtelAttributeValue> = {
			mcpEvent: server.origin,
			mcpServer: server.name,
			mcpStatus: server.status,
			mcpState: state.kind,
		};
		if (server.source) { attributes.mcpSource = server.source; }
		if (server.transport) { attributes.mcpTransport = server.transport; }
		if (server.pluginName) { attributes.mcpPlugin = server.pluginName; }
		if (server.pluginVersion) { attributes.mcpPluginVersion = server.pluginVersion; }
		if (state.kind === McpServerStatus.Error) { attributes.errorType = state.error.errorType; }

		const detail = server.error ? `: ${server.error}` : '';
		const message = `[Copilot:${this.sessionId}] MCP server '${server.name}' ${server.status} (${state.kind})${detail}`;
		if (server.status === 'failed') {
			this._logService.error(message, new OtelData(attributes));
		} else {
			this._logService.info(message, new OtelData(attributes));
		}
	}

	private _setToolCallUiMeta(meta: Mutable<IToolCallMeta>, resourceUri: string | undefined, mcpServerName: string | undefined): void {
		if (!resourceUri) {
			return;
		}
		const ui: Mutable<IToolCallUiMeta> = { resourceUri };
		if (mcpServerName) {
			const channel = this._mcpCustomizations.channelForServer(mcpServerName);
			if (channel !== undefined) {
				ui.channel = channel;
			}
		}
		meta.ui = ui;
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
	 * {@link McpServerState} union.
	 */
	private _toSdkMcpServer(name: string, status: SdkMcpServerStatus, error?: string): ISdkMcpServer {
		return {
			name,
			state: this._translateSdkMcpStatus(name, status, error),
			enabled: status !== 'disabled',
		};
	}

	private _translateSdkMcpStatus(name: string, status: SdkMcpServerStatus, error?: string): McpServerState {
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
			case 'needs-auth': {
				const previous = this._mcpCustomizations.stateForServer(name);
				if (previous?.kind === McpServerStatus.AuthRequired) {
					return previous;
				}
				return { kind: McpServerStatus.Starting };
			}
			case 'disabled':
			case 'not_configured':
				return { kind: McpServerStatus.Stopped };
			default:
				return { kind: McpServerStatus.Stopped };
		}
	}

	/**
	 * Translates the SDK's three-mode space (`interactive` / `plan` /
	 * `autopilot`) to AHP's `mode` axis directly:
	 *
	 *  - SDK `plan` → AHP `mode='plan'`.
	 *  - SDK `interactive` → AHP `mode='interactive'`.
	 *  - SDK `autopilot` → AHP `mode='autopilot'`.
	 *
	 * Autopilot lives on the `mode` axis; the orthogonal `autoApprove` axis
	 * (Default / Bypass) is left untouched so the user's chosen
	 * approval level is preserved across SDK mode transitions.
	 *
	 * Patches that already match the current AHP values are still
	 * dispatched (the reducer is a no-op in that case) but written values
	 * propagate to all subscribed clients via `session/configChanged`.
	 */
	private _syncAhpConfigFromSdkMode(sdkMode: CopilotSdkMode): void {
		const sessionUri = this._storageUri.toString();
		const patch: Record<string, unknown> = {};
		switch (sdkMode) {
			case 'plan':
				patch[SessionConfigKey.Mode] = 'plan';
				break;
			case 'autopilot':
				patch[SessionConfigKey.Mode] = 'autopilot';
				break;
			case 'interactive':
				patch[SessionConfigKey.Mode] = 'interactive';
				break;
		}
		this._configurationService.updateSessionConfig(sessionUri, patch);
	}

	/**
	 * Handles the CLI's `exitPlanMode.request` RPC by surfacing it as a
	 * {@link ChatInputRequest} and awaiting the client's response. The
	 * resolved {@link IExitPlanModeResponse} flows back to the CLI, which
	 * calls `session.respondToExitPlanMode` internally — that resumes the
	 * paused `exit_plan_mode` tool call and (on accept) updates the SDK's
	 * `currentMode` so the model can continue with implementation.
	 */
	private async _handleExitPlanModeRequest(data: ExitPlanModeRequest, _invocation: { sessionId: string }): Promise<IExitPlanModeResponse> {
		const turnId = this._currentTurn?.id;
		if (!turnId) {
			this._logService.warn(`[Copilot:${this.sessionId}] Rejecting plan review request without an active turn`);
			return { approved: false };
		}
		const requestId = generateUuid();
		const questionId = generateUuid();
		this._logService.info(`[Copilot:${this.sessionId}] exitPlanMode.request: rpcId=${requestId}, actions=[${data.actions.join(',')}], recommended=${data.recommendedAction}`);

		let planPath: string | null = null;
		try {
			const planRead = await this._wrapper.session.rpc.plan.read();
			planPath = planRead.path ?? null;
		} catch (err) {
			this._logService.warn(`[Copilot:${this.sessionId}] rpc.plan.read failed for exit_plan_mode: ${err instanceof Error ? err.message : String(err)}`);
		}
		if (this._currentTurn?.id !== turnId) {
			this._logService.warn(`[Copilot:${this.sessionId}] Rejecting plan review request after its turn ended`);
			return { approved: false };
		}

		const options = data.actions.map(actionId => {
			const desc = getPlanActionDescription(actionId);
			return {
				id: actionId,
				label: desc?.label ?? actionId,
				description: desc?.description,
				recommended: actionId === data.recommendedAction,
			};
		});

		const actions: IAgentHostPlanReviewAction[] = options.map(option => ({
			id: option.id,
			label: option.label,
			...(option.description ? { description: option.description } : {}),
			...(option.recommended ? { default: true } : {}),
		}));

		const inputRequest: ChatInputRequestWithPlanReview = {
			id: requestId,
			planReview: {
				title: localize('agentHost.planReview.title', "Review Plan"),
				content: data.summary || localize('agentHost.planReview.fallbackSummary', "A plan is ready for review."),
				actions,
				canProvideFeedback: true,
				answerQuestionId: questionId,
				...(planPath ? { planUri: URI.file(planPath).toString() } : {}),
			},
			questions: [{
				kind: ChatInputQuestionKind.SingleSelect,
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
			resource: this._chatChannelUri,
			action: {
				type: ActionType.ChatInputRequested,
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

	/**
	 * Drop the memoized event reconstruction whenever the persisted event log
	 * could have changed, so {@link _getMappedEvents} never serves stale turns
	 * once the session resumes activity. While the session is idle (e.g. during
	 * a historical session open) none of these fire, so the whole restore wave
	 * coalesces to a single reconstruction.
	 */
	private _subscribeForMemoInvalidation(): void {
		const wrapper = this._wrapper;
		const invalidate = () => this._invalidateMappedEvents();
		// New content appended to the log.
		this._register(wrapper.onUserMessage(invalidate));
		this._register(wrapper.onTurnStart(invalidate));
		this._register(wrapper.onMessage(invalidate));
		this._register(wrapper.onToolStart(invalidate));
		this._register(wrapper.onToolComplete(invalidate));
		this._register(wrapper.onSubagentStarted(invalidate));
		this._register(wrapper.onSubagentCompleted(invalidate));
		this._register(wrapper.onSubagentFailed(invalidate));
		this._register(wrapper.onTurnEnd(invalidate));
		// In-place rewrites of the persisted log.
		this._register(wrapper.onSessionCompactionComplete(invalidate));
		this._register(wrapper.onSessionTruncation(invalidate));
		this._register(wrapper.onSessionSnapshotRewind(invalidate));
	}

	/**
	 * Emits `instructionsCollected` per user message.
	 * Attempts to match local chat's `ComputeAutomaticInstructions`
	 * emitter (`src/vs/workbench/contrib/chat/common/promptSyntax/computeAutomaticInstructions.ts`)
	 */
	private _subscribeForInstructionsCollectedTelemetry(): void {
		const wrapper = this._wrapper;
		const sessionId = this.sessionId;

		this._register(wrapper.onUserMessage(e => {
			// Skip subagent and SDK-injected messages (matches guard on this event above).
			if (e.agentId || (e.data.source && e.data.source.toLowerCase() !== 'user')) {
				return;
			}
			void (async () => {
				let sources;
				try {
					sources = (await wrapper.session.rpc.instructions.getSources()).sources;
				} catch (err) {
					this._logService.trace(`[Copilot:${sessionId}] Failed to fetch instruction sources for telemetry: ${getErrorMessage(err)}`);
					return;
				}

				let agentInstructionsCount = 0;
				let applyingInstructionsCount = 0;
				let referencedInstructionsCount = 0;
				let claudeMdCount = 0;
				for (const s of sources) {
					// The SDK marks copilot-instructions.md (home/repo) and root-level
					// AGENTS.md / CLAUDE.md / GEMINI.md as `home`/`repo`/`model`
					if (s.type === 'home' || s.type === 'repo' || s.type === 'model') {
						agentInstructionsCount++;
					}

					if (s.applyTo && s.applyTo.length > 0) {
						applyingInstructionsCount++;
					}

					if (s.type === 'child-instructions' || s.type === 'nested-agents') {
						referencedInstructionsCount++;
					}

					const lastSep = Math.max(s.sourcePath.lastIndexOf('/'), s.sourcePath.lastIndexOf('\\'));
					const filename = lastSep >= 0 ? s.sourcePath.slice(lastSep + 1) : s.sourcePath;
					if (filename === 'CLAUDE.md') {
						claudeMdCount++;
					}
				}

				type AgentHostInstructionsCollectedEvent = {
					provider: string;
					agentSessionId: string;
					isSubagentSession: boolean;
					totalInstructionsCount: number;
					agentInstructionsCount: number;
					applyingInstructionsCount: number;
					referencedInstructionsCount: number;
					claudeMdCount: number;
				};
				type AgentHostInstructionsCollectedClassification = {
					provider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The Agent Host provider that emitted this event (e.g. copilotcli). Absent on local rows; use presence to distinguish AH from local.' };
					agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The Agent Host session identifier. Absent on local rows.' };
					isSubagentSession: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the emission was from a subagent session.' };
					totalInstructionsCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of instruction sources loaded by the Agent Host session.' };
					agentInstructionsCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of top-level agent instruction files (copilot-instructions.md, AGENTS.md, CLAUDE.md, GEMINI.md) among the loaded sources.' };
					applyingInstructionsCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of loaded instruction sources that carry an applyTo glob pattern. Semantic shift from the local field, which counts sources whose applyTo matched the current request context.' };
					referencedInstructionsCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of loaded instruction sources discovered transitively (child-instructions via subdirectory walk, or nested AGENTS.md). Semantic shift from the local field, which counts sources added via explicit <file> references in other instruction files.' };
					claudeMdCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of CLAUDE.md files among the loaded sources.' };
					owner: 'amunger';
					comment: 'Agent Host emission of agentHost.instructionsCollected. Carries the subset of the local shape that can be honestly (or close-analogously) computed from the SDK\'s InstructionSource list; other fields are intentionally omitted (see source comment).';
				};
				this._telemetryService.publicLog2<AgentHostInstructionsCollectedEvent, AgentHostInstructionsCollectedClassification>('agentHost.instructionsCollected', {
					provider: this.sessionUri.scheme,
					agentSessionId: AgentSession.id(this.sessionUri),
					isSubagentSession: isSubagentSession(this.sessionUri),
					totalInstructionsCount: sources.length,
					agentInstructionsCount,
					applyingInstructionsCount,
					referencedInstructionsCount,
					claudeMdCount,
				});
			})().catch(err => {
				this._logService.trace(`[Copilot:${sessionId}] instructionsCollected telemetry failed: ${getErrorMessage(err)}`);
			});
		}));
	}

	private _subscribeForLogging(): void {
		const wrapper = this._wrapper;
		const sessionId = this.sessionId;

		this._register(wrapper.onUnhandledEvent(e => {
			this._logService.trace(`[Copilot:${sessionId}] Unhandled SDK event: ${safeStringify(e)}`);
		}));

		this._register(wrapper.onSessionStart(e => {
			this._logService.trace(`[Copilot:${sessionId}] Session started: model=${e.data.selectedModel ?? 'default'}, producer=${e.data.producer}`);
		}));

		this._register(wrapper.onSessionResume(e => {
			this._logService.trace(`[Copilot:${sessionId}] Session resumed: eventCount=${e.data.eventCount}`);
		}));

		this._register(wrapper.onSessionInfo(e => {
			const attributes: Record<string, OtelAttributeValue> = { infoType: e.data.infoType };
			if (e.data.tip) {
				attributes.tip = e.data.tip;
			}
			const message = `[Copilot:${sessionId}] [${e.data.infoType}]: ${e.data.message}`;
			const otelData = new OtelData(attributes);
			if (e.data.infoType === 'mcp') {
				this._logService.info(message, otelData);
			} else {
				this._logService.trace(message, otelData);
			}
		}));

		this._register(wrapper.onSessionWarning(e => {
			this._logService.warn(`[Copilot:${sessionId}] ${e.data.message}`, new OtelData({ warningType: e.data.warningType }));
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
			// Restricted `conversation.messageText` (source=user): the raw user prompt text. Emit only
			// for genuine human prompts on the main agent — skip subagent turns (driven by the parent)
			// and SDK-injected synthetic messages (skill/harness injections carry a non-`user` source,
			// matching `isSyntheticUserMessage`) so injected content is not reported as the user's prompt.
			if (!e.agentId && (!e.data.source || e.data.source.toLowerCase() === 'user')) {
				this._telemetryReporter.userMessageText(this.sessionUri.toString(), e.data.content, this._turnOrdinal);
			}
		}));

		this._register(wrapper.onPendingMessagesModified(() => {
			this._logService.trace(`[Copilot:${sessionId}] Pending messages modified`);
		}));

		this._register(wrapper.onTurnStart(e => {
			this._currentTurn?.markRunning();
			this._logService.trace(`[Copilot:${sessionId}] Turn started: ${e.data.turnId}`);
		}));

		this._register(wrapper.onIntent(e => {
			this._logService.trace(`[Copilot:${sessionId}] Intent: ${e.data.intent}`);
			const activity = e.data.intent || undefined;
			if (activity === undefined && !this._hasActivity) {
				return;
			}
			this._hasActivity = activity !== undefined;
			this._emitAction({
				type: ActionType.SessionActivityChanged,
				activity,
			});
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
				chat: this._chatChannelUri,
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
				chat: this._chatChannelUri,
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
			deferred.complete({ kind: 'reject' });
		}
		this._pendingPermissions.clear();
		this._approvedDuplicablePermissionSignatures.clear();
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
			pending.deferred.complete({ response: ChatInputResponseKind.Cancel });
		}
		this._pendingUserInputs.clear();
	}

	private _cancelPendingElicitations(): void {
		for (const [, pending] of this._pendingElicitations) {
			pending.deferred.complete({ response: ChatInputResponseKind.Cancel });
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

/**
 * Normalizes the SDK's internal `quotaSnapshots` field — present on the `assistant.usage` event at
 * runtime but absent from the generated `AssistantUsageData` type — into the serializable shape
 * carried on {@link UsageInfoMeta.quotaSnapshots}. Returns `undefined` when no usable snapshot is present.
 */
function normalizeQuotaSnapshots(raw: unknown): UsageInfoMeta['quotaSnapshots'] | undefined {
	if (!raw || typeof raw !== 'object') {
		return undefined;
	}
	const result: NonNullable<UsageInfoMeta['quotaSnapshots']> = {};
	let hasAny = false;
	for (const [quotaType, value] of Object.entries(raw as Record<string, unknown>)) {
		if (!value || typeof value !== 'object') {
			continue;
		}
		const v = value as Record<string, unknown>;
		const resetDateRaw = v.resetDate;
		const resetDate = typeof resetDateRaw === 'string'
			? resetDateRaw
			: resetDateRaw instanceof Date
				? resetDateRaw.toISOString()
				: undefined;
		result[quotaType] = {
			isUnlimitedEntitlement: typeof v.isUnlimitedEntitlement === 'boolean' ? v.isUnlimitedEntitlement : undefined,
			entitlementRequests: typeof v.entitlementRequests === 'number' ? v.entitlementRequests : undefined,
			usedRequests: typeof v.usedRequests === 'number' ? v.usedRequests : undefined,
			remainingPercentage: typeof v.remainingPercentage === 'number' ? v.remainingPercentage : undefined,
			overage: typeof v.overage === 'number' ? v.overage : undefined,
			overageAllowedWithExhaustedQuota: typeof v.overageAllowedWithExhaustedQuota === 'boolean' ? v.overageAllowedWithExhaustedQuota : undefined,
			resetDate,
		};
		hasAny = true;
	}
	return hasAny ? result : undefined;
}
