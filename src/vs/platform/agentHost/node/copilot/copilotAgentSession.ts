/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotSession, CurrentToolMetadata, ElicitationContext, ElicitationFieldValue, ElicitationResult, ElicitationSchema, ElicitationSchemaField, ExitPlanModeCompletedData, ExitPlanModeRequest, ExitPlanModeResult, JsonValue, McpServersLoadedServer, MessageOptions, PermissionMode, PermissionAssistedApproval, PermissionRequest, PermissionRequestResult, PermissionResult, SessionConfig, SessionHooks, SessionMode as CopilotSdkMode, Tool, ToolResultObject, McpServerStatus as SdkMcpServerStatus } from '@github/copilot-sdk';
import { cp, rm } from 'fs/promises';
import { DeferredPromise, raceCancellation, RunOnceScheduler, Sequencer, SequencerByKey, Throttler, timeout } from '../../../../base/common/async.js';
import { encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { CancellationError, getErrorMessage } from '../../../../base/common/errors.js';
import { escapeMarkdownSyntaxTokens } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableMap, IReference, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
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
import product from '../../../product/common/product.js';
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import { getCopilotHomePath } from '../../common/copilotHome.js';
import { CopilotCliConfigKey, copilotCliConfigSchema } from '../../common/copilotCliConfig.js';
import type { AutoModeTier } from '../../common/autoModeTiers.js';
import type { ChatInputRequestWithPlanReview, IAgentHostPlanReviewAction } from '../../common/agentHostPlanReview.js';
import { ChatInputRequestPurpose, withChatInputRequestPurpose } from '../../common/meta/agentChatInputRequestMeta.js';
import { gitHubMcpServerUrl } from '../../common/githubEndpoints.js';
import { AgentHostSandboxConfigKey, sandboxConfigSchema } from '../../common/sandboxConfigSchema.js';
import { AgentHostGlobalAutoApproveEnabledConfigKey, AgentHostAutoReplyAnswer, AgentHostAutoReplyEnabledConfigKey, AgentHostDisableRepoInfoTelemetryConfigKey, platformRootSchema, platformSessionSchema } from '../../common/agentHostSchema.js';
import { createUnknownAgentHostClientTelemetryContext, type IAgentHostClientTelemetryContext } from '../../common/agentHostTelemetry.js';
import { AgentSession, AgentSignal, AuthenticateParams, IMcpNotification, type AgentTurnProviderCallState, type IAgentToolPendingConfirmationSignal, type IAgentTurnDiagnosticSnapshot } from '../../common/agent.js';
import { META_DIFF_BASE_BRANCH } from '../../common/agentHostGitService.js';
import { stripRedundantCdPrefix } from '../../common/commandLineHelpers.js';
import { toToolCallMeta, type IToolCallMeta, type IToolCallUiMeta, type IToolSearchCandidate } from '../../common/meta/agentToolCallMeta.js';
import { OtelData, type OtelAttributeValue } from '../../common/otlp/otlpLogEmitter.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { SEMANTIC_SEARCH_TOOL_NAME } from '../../common/semanticSearchConstants.js';
import { resolveCopilotConfigSlashCommandOnSend } from '../../common/copilotConfigSlashCommands.js';
import { STREAMING_TOOL_DISPLAY_INTERVAL_MS, streamingToolDisplayText } from '../../common/streamingToolCallDisplay.js';
import { isAgentFeedbackAnnotationsAttachment, renderAgentFeedbackAnnotationsAttachment } from '../../common/meta/agentFeedbackAttachments.js';
import { isHostSnapshotAttachment } from '../../common/meta/agentSnapshotAttachmentMeta.js';
import { ISessionDatabase, ISessionDataService } from '../../common/sessionDataService.js';
import { IAgentHostOTelService } from '../../common/otel/agentHostOTelService.js';
import { MessageAttachmentKind, ToolCallContributorKind, type FileEdit, type MessageAttachment, type ToolCallContributor } from '../../common/state/protocol/state.js';
import { ActionType, isChatAction, type ChatAction, type SessionAction } from '../../common/state/sessionActions.js';
import { MessageKind, ResponsePartKind, ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind, ChatInputResponseKind, ToolCallConfirmationReason, ToolCallRiskAssessmentKind, ToolCallRiskAssessmentStatus, ToolCallStatus, ToolResultContentType, buildSubagentSessionUri, createErrorResponsePart, isSubagentSession, parseRequiredSessionUriFromChatUri, type Customization, type Message, type PendingMessage, type ChatInputAnswer, type ChatInputOption, type ChatInputQuestion, type ChatInputRequest, type ToolCallResult, type ToolResultContent, type ToolResultTerminalContent, type Turn, type ITurnTokenTotal, type UsageInfo, type UsageInfoMeta, type IContextAttributionData, type ISessionPromptCacheState } from '../../common/state/sessionState.js';
import { IAgentConfigurationService } from '../agentConfigurationService.js';
import { CopilotSessionWrapper } from './copilotSessionWrapper.js';
import { clientToolNamesFromSnapshot, isMcpServerExplicitlyProjected, type CopilotSessionLaunchPlan, type IActiveClientSnapshot, type ICopilotSessionLauncher, type ICopilotSessionRuntime } from './copilotSessionLauncher.js';
import { CLIENT_TOOL_SEARCH_REFERENCE_NAME, NON_DEFERRED_CLIENT_TOOL_NAMES, RUNTIME_TOOL_SEARCH_TOOL_NAME } from './toolSearchDeferral.js';
import { ActiveClientToolSet } from '../activeClientState.js';
import { AgentHostTelemetryReporter, toInitiatorTelemetry, type IAgentHostInitiatorClassification, type IAgentHostInitiatorTelemetry } from '../agentHostTelemetryReporter.js';
import { AgentHostRepoInfoTelemetry } from '../agentHostRepoInfoTelemetry.js';
import { PendingRequestRegistry } from '../../common/pendingRequestRegistry.js';
import { buildCopilotSystemNotification } from './copilotSystemNotification.js';
import { parseLeadingSlashCommand } from '../../common/agentHostSlashCommand.js';
import type { IUnsandboxedCommandConfirmationRequest, ShellManager } from './copilotShellTools.js';
import { NonPtyShellTerminalStreams } from './copilotNonPtyShellTerminals.js';
import { buildSandboxConfigForSdk, type SandboxConfig } from './sandboxConfigForSdk.js';
import type { IAgentServerToolHost } from '../../common/agentServerTools.js';
import { getEditFilePaths, getInvocationMessage, getPastTenseMessage, getPermissionDisplay, getShellIntention, getShellLanguage, getStreamingInvocationMessage, getSubagentMetadata, getTaskCompleteMarkdown, getToolDisplayName, getToolInputString, getToolKind, isAgentCoordinationTool, isCopilotSdkToolOutputFile, isEditTool, isHiddenTool, isShellTool, isTaskCompleteTool, parseCopilotStreamingToolInput, synthesizeSkillToolCall, tryStringify } from './copilotToolDisplay.js';
import { FileEditTracker } from '../shared/fileEditTracker.js';
import { ICopilotApiService, type IRestrictedTelemetryContext } from '../shared/copilotApiService.js';
import type { IAgentHostRestrictedTelemetryContext } from '../agentHostRestrictedTelemetry.js';
import { buildChatErrorInfoFromCopilotSdkFields } from './copilotSdkChatError.js';
import { McpCustomizationController, type ISdkMcpServer } from '../shared/mcpCustomizationController.js';
import { getSdkMcpServerEnablement, resolveCustomizationEnablement, targetForMcpServer } from '../shared/customizationEnablementGate.js';
import { appendSdkToolResultContent, mapSessionEvents } from './mapSessionEvents.js';
import { addAttachmentDisplayKindToMimeType, addSimpleAttachmentDisplayKindToMimeType } from './copilotAttachmentUtils.js';
import { buildPendingEditContentUri } from './pendingEditContentStore.js';
import { IAgentHostCustomizationEnablementService } from '../agentHostCustomizationEnablementService.js';
import { IAgentHostPromptCache } from '../agentHostPromptCache.js';
import { AgentHostClientType } from '../../common/agentHostClientInfo.js';
import { CustomizationType, McpAuthRequiredReason, McpServerStatus, type McpAuthRequirement, type McpServerCustomization, type McpServerState } from '../../common/state/protocol/channels-session/state.js';
import type { ErrorInfo, ProtectedResourceMetadata } from '../../common/state/protocol/common/state.js';
import { CopilotSlashCommandProvider } from './copilotSlashCommandProvider.js';
import { createCopilotFailureCorrelation, reportCopilotModelCallFailure, reportCopilotSdkSessionError } from './copilotFailureTelemetry.js';
import { reportCopilotTodoStoreOperation } from './copilotTodoStoreTelemetry.js';
import { ModelCallTurnCorrelation } from './modelCallTurnCorrelation.js';

type CopilotSdkAttachment = Required<MessageOptions>['attachments'][number];
type CopilotCommandInvocationResult = Awaited<ReturnType<CopilotSession['rpc']['commands']['invoke']>>;
type RuntimeSlashCommandInfo = Awaited<ReturnType<CopilotSession['rpc']['commands']['list']>>['commands'][number];
type GitHubCredentialsUpdateResult = Awaited<ReturnType<CopilotSession['rpc']['gitHubAuth']['setCredentials']>>;
type McpAuthHandler = NonNullable<SessionConfig['onMcpAuthRequest']>;
type McpAuthRequest = Parameters<McpAuthHandler>[0];
type McpAuthResult = Awaited<ReturnType<McpAuthHandler>>;

interface IClientToolSdkPolicy {
	readonly overridesBuiltInTool?: true;
	readonly skipPermission?: true;
}

const DEFAULT_CLIENT_TOOL_SDK_POLICY: IClientToolSdkPolicy = {};
const CLIENT_TOOL_SDK_POLICIES: ReadonlyMap<string, IClientToolSdkPolicy> = new Map([
	[SEMANTIC_SEARCH_TOOL_NAME, { overridesBuiltInTool: true, skipPermission: true }],
]);

function getClientToolSdkPolicy(toolName: string): IClientToolSdkPolicy {
	return CLIENT_TOOL_SDK_POLICIES.get(toolName) ?? DEFAULT_CLIENT_TOOL_SDK_POLICY;
}

interface CopilotExitPlanModeResponse extends ExitPlanModeResult {
	readonly autoApproveEdits?: ExitPlanModeCompletedData['autoApproveEdits'];
}

function isCopilotSdkAuthRejection(error: { readonly errorType: string; readonly statusCode?: number }): boolean {
	return (error.errorType === 'authentication' || error.errorType === 'authorization') && error.statusCode === 401;
}

interface IPendingMcpAuthRequest {
	readonly serverName: string;
	readonly resource: ProtectedResourceMetadata;
	readonly requiredScopes: readonly string[];
	readonly toolCalls: IMcpAuthToolCall[];
}

interface IMcpAuthToolCall {
	readonly turnId: string;
	readonly toolCallId: string;
	readonly parentToolCallId: string | undefined;
}

interface ICopilotActiveToolCall {
	readonly toolName: string;
	readonly displayName: string;
	readonly parameters: Record<string, unknown> | undefined;
	readonly content: ToolResultContent[];
	readonly parentToolCallId: string | undefined;
	readonly mcpServerName: string | undefined;
	readonly contributor: ToolCallContributor | undefined;
	readonly intention: string | undefined;
	meta: IToolCallMeta | undefined;
}

interface ICopilotStreamingToolCall {
	input: string;
	toolName: string | undefined;
	parentToolCallId: string | undefined;
	started: boolean;
	displayedInputLength: number;
	displayedMessage: string | undefined;
}

const SESSION_STATE_DIRECTORY = 'session-state';
const DEBUG_LOG_COLLECTION_RETRY_ATTEMPTS = 50;
const DEBUG_LOG_COLLECTION_RETRY_DELAY_MS = 20;
const EMPTY_TOOL_RESULT_TEXT = '<empty />';
const USER_DENIED_PERMISSION_RESULT = { kind: 'reject', feedback: 'The user denied permission.' } satisfies PermissionRequestResult;

function isPermissionDeniedKind(kind: PermissionResult['kind'] | undefined): boolean {
	switch (kind) {
		case 'cancelled':
		case 'denied-by-rules':
		case 'denied-no-approval-rule-and-could-not-request-from-user':
		case 'denied-interactively-by-user':
		case 'denied-by-content-exclusion-policy':
		case 'denied-by-permission-request-hook':
			return true;
		default:
			return false;
	}
}

function mapPermissionResultToConfirmKind(kind: PermissionResult['kind'] | undefined, resolvedByHook: boolean): 'userAction' | 'setting' | 'confirmationNotNeeded' | 'denied' {
	if (kind === undefined) {
		return 'confirmationNotNeeded';
	}
	if (isPermissionDeniedKind(kind)) {
		return 'denied';
	}
	if (kind === 'approved-for-session' || kind === 'approved-for-location') {
		return 'setting';
	}
	return resolvedByHook ? 'confirmationNotNeeded' : 'userAction';
}


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
type PreToolUseHookInput = Parameters<NonNullable<SessionHooks['onPreToolUse']>>[0];
type PostToolUseHookInput = Parameters<NonNullable<SessionHooks['onPostToolUse']>>[0];
type ToolUseHookInput = PreToolUseHookInput | PostToolUseHookInput;

function getToolCommand(input: ToolUseHookInput): string | undefined {
	const command = isObject(input.toolArgs) ? Reflect.get(input.toolArgs, 'command') : undefined;
	return isString(command) ? command : undefined;
}

function toCopilotSdkMode(mode: string | undefined): CopilotSdkMode | undefined {
	mode = mode?.toLowerCase() === 'goal' ? 'plan' : mode;
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
	return join(getCopilotHomePath(userHome, process.env), SESSION_STATE_DIRECTORY);
}

function isCopilotSdkToolOutputTempFile(filePath: string, tmpDir: string): boolean {
	const fileUri = normalizePath(URI.file(filePath));
	const tmpDirUri = normalizePath(URI.file(tmpDir));
	const parentUri = normalizePath(URI.joinPath(fileUri, '..'));
	if (!extUriBiasedIgnorePathCase.isEqual(parentUri, tmpDirUri)) {
		return false;
	}
	return isCopilotSdkToolOutputFile(filePath);
}

/**
 * Options for constructing a {@link CopilotAgentSession}.
 */
export interface ICopilotAgentSessionOptions {
	readonly sessionUri: URI;
	readonly chatChannelUri: URI;
	/** Exact persistence/config scope for this chat (`IAgentChatContext.resource` when supplied). */
	readonly resource?: URI;
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
	/** Returns whether a host-published client membership includes this chat. */
	readonly clientReachesChat?: (clientId: string, chat: URI) => boolean;
	/** Reads the retained host snapshot this session uses for MCP enablement reconcile. */
	readonly hostCustomizations?: () => readonly Customization[];
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
	/** Returns whether the token that launched this session is still the active account token. */
	readonly isLaunchTokenCurrent?: () => boolean;
	/** Overrides source-launch detection for deterministic tests. */
	readonly enableDevelopmentErrorInjection?: boolean;

	/**
	 * Invoked whenever this chat's in-flight turn ends — normal completion,
	 * abort, or error — leaving the chat idle. Lets the agent run work that
	 * must not interrupt a live turn, notably a CLI client restart deferred
	 * while the turn was running. Called synchronously from the session's SDK
	 * event handling, so the agent must schedule anything that could dispose
	 * this session off the current stack.
	 */
	readonly onTurnEnded?: () => void;

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

class DirectUsageAccumulator {
	private readonly _tokenTotalsByModel = new Map<string, Mutable<ITurnTokenTotal>>();
	private _copilotNanoAiu: number | undefined;

	add(model: string | undefined, tokens: UsageContext, copilotNanoAiu: number | undefined): void {
		if (model) {
			let total = this._tokenTotalsByModel.get(model);
			if (!total) {
				total = { model, inputTokens: 0, cachedTokens: 0, outputTokens: 0 };
				this._tokenTotalsByModel.set(model, total);
			}
			total.inputTokens += toTokenCount(tokens.inputTokens);
			total.cachedTokens += toTokenCount(tokens.cacheReadTokens);
			total.outputTokens += toTokenCount(tokens.outputTokens);
		}
		if (typeof copilotNanoAiu === 'number') {
			this._copilotNanoAiu = (this._copilotNanoAiu ?? 0) + copilotNanoAiu;
		}
	}

	get tokenTotals(): readonly ITurnTokenTotal[] | undefined {
		return this._tokenTotalsByModel.size > 0
			? [...this._tokenTotalsByModel.values()].map(total => ({ ...total }))
			: undefined;
	}

	get copilotNanoAiu(): number | undefined {
		return this._copilotNanoAiu;
	}
}

class CopilotTurn extends Disposable {

	private _state: CopilotTurnState = 'pending';
	private _providerCallState: AgentTurnProviderCallState = 'notStarted';
	private _providerTurnStarted = false;
	private readonly _stopWatch = StopWatch.create(false);

	/**
	 * This turn's own Copilot cost in nano-AIU, summed from the `copilotUsage`
	 * carried by the model calls the turn caused — its own, every subagent's,
	 * and any compaction that ran mid-turn.
	 *
	 * Accumulated synchronously as each event arrives rather than derived from
	 * the SDK's session-wide total: that total is read asynchronously, and the
	 * terminal `session.idle` can close the turn while a read is in flight,
	 * which would drop the turn's last model call from its reported cost.
	 */
	copilotNanoAiu = 0;

	readonly directUsage = new DirectUsageAccumulator();

	/**
	 * Whole-turn token consumption keyed by model id. Every model call in the
	 * turn contributes — the parent agent's calls, every subagent's calls, and
	 * the summarization call a compaction performs — so the totals describe what
	 * the turn as a whole consumed rather than just its last call. Subagents may
	 * run on a different model than the parent, hence the per-model keying.
	 */
	private readonly _tokenTotalsByModel = new Map<string, Mutable<ITurnTokenTotal>>();

	/**
	 * Folds one model call's token counts into the turn's per-model totals.
	 * Calls without a model id are ignored: they cannot be attributed, and every
	 * usage-reporting path this session has carries one.
	 */
	addTokenTotals(model: string | undefined, tokens: { inputTokens?: number; outputTokens?: number; cacheReadTokens?: number }): void {
		this._addTokenTotals(this._tokenTotalsByModel, model, tokens);
	}

	private _addTokenTotals(totals: Map<string, Mutable<ITurnTokenTotal>>, model: string | undefined, tokens: { inputTokens?: number; outputTokens?: number; cacheReadTokens?: number }): void {
		if (!model) {
			return;
		}
		let total = totals.get(model);
		if (!total) {
			total = { model, inputTokens: 0, cachedTokens: 0, outputTokens: 0 };
			totals.set(model, total);
		}
		total.inputTokens += toTokenCount(tokens.inputTokens);
		total.cachedTokens += toTokenCount(tokens.cacheReadTokens);
		total.outputTokens += toTokenCount(tokens.outputTokens);
	}

	/**
	 * The turn's per-model totals, or `undefined` when nothing has been recorded.
	 * Rows are cloned: the map keeps mutating its own copies as further calls are
	 * recorded, and an already-emitted or already-compared usage object must not
	 * change retroactively underneath its consumers.
	 */
	get tokenTotals(): readonly ITurnTokenTotal[] | undefined {
		return this._cloneTokenTotals(this._tokenTotalsByModel);
	}

	private _cloneTokenTotals(totals: ReadonlyMap<string, ITurnTokenTotal> | undefined): readonly ITurnTokenTotal[] | undefined {
		return totals?.size
			? [...totals.values()].map(total => ({ ...total }))
			: undefined;
	}

	/**
	 * The parent (main-agent) turn's own last context usage — model plus token
	 * counts and per-event cost. A subagent's model call contributes to the
	 * turn's credits (the SDK's session metrics already include it) but must not
	 * overwrite the parent turn's model/context-token usage. Retaining the
	 * parent's own last values lets each subagent usage event refresh the parent
	 * aggregate's credit total while preserving the model that produced the
	 * parent response.
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
	readonly mainModelCallIds = new Set<string>();
	toolCallRounds = 0;
	totalToolCalls = 0;
	parallelToolCallRounds = 0;
	parallelToolCallsTotal = 0;
	toolCallDetailsReported = false;
	messageCharLen: number | undefined;
	/** Model of the most recent round, reported as the turn's model. */
	lastModel: string | undefined;

	private readonly _eventId = new DeferredPromise<string>();

	/**
	 * Resolves with this turn's SDK event id once recorded via
	 * {@link completeEventId}, or rejects on disposal if it never was.
	 */
	public get eventId() {
		return this._eventId.p;
	}

	constructor(
		readonly id: string,
		readonly ordinal: number,
		readonly senderClientId: string | undefined,
		readonly clientContext: IAgentHostClientTelemetryContext,
	) {
		super();
		// Most turns are never waited on; avoid an uncaught rejection.
		this._eventId.p.catch(() => { });
	}

	get clientType(): AgentHostClientType { return this.clientContext.clientType; }
	get state(): CopilotTurnState { return this._state; }
	get isPending(): boolean { return this._state === 'pending'; }
	get isRunning(): boolean { return this._state === 'running'; }
	get duration(): number { return Math.max(0, this._stopWatch.elapsed()); }
	get providerCallState(): AgentTurnProviderCallState { return this._providerCallState; }
	get providerTurnStarted(): boolean { return this._providerTurnStarted; }

	markProviderCallPending(): void { this._providerCallState = 'pending'; }
	markProviderCallResolved(): void { this._providerCallState = 'resolved'; }
	markProviderCallRejected(): void { this._providerCallState = 'rejected'; }
	markProviderTurnStarted(): void { this._providerTurnStarted = true; }

	/** Transition `pending → running` on the first SDK event. No-op once running/finished. */
	markRunning(): void {
		if (this._state === 'pending') {
			this._state = 'running';
		}
	}

	/** Records this turn's SDK event id. Idempotent: only the first call (the root `user.message`) counts. */
	completeEventId(eventId: string): void {
		if (!this._eventId.isSettled) {
			this._eventId.complete(eventId);
		}
	}

	markCompleted(): void { this._state = 'completed'; }
	markAborted(): void { this._state = 'aborted'; }

	/**
	 * Rejects {@link eventId} before disposal so pending fork-boundary checks do not hang.
	 */
	override dispose(): void {
		if (!this._eventId.isSettled) {
			this._eventId.error(new Error(`Turn ${this.id} was disposed before its SDK event id was recorded`));
		}
		super.dispose();
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
	private _hostInstructions: readonly string[] | undefined;
	private _pendingSnapshotReminder: string | undefined;
	readonly sessionId: string;
	readonly resourceUri: URI;
	private readonly _ownerSessionUri: URI;
	get ownerSessionUri(): URI { return this._ownerSessionUri; }
	/** @deprecated Compatibility alias for SDK callbacks; this is the exact persistence resource. */
	get sessionUri(): URI { return this.resourceUri; }
	private readonly _chatChannelUri: URI;
	/** Fixed persistence scope for this chat; never re-derived from the mutable routing channel. Config reads/writes must use {@link _ownerSessionUri} instead — peer chats share that scope but have distinct storage. */
	private readonly _storageUri: URI;

	get chatChannelUri(): URI {
		return this._chatChannelUri;
	}

	/** Working directory this session operates in, if any. */
	get workingDirectory(): URI | undefined { return this._workingDirectory; }

	/** Tracks active tool invocations so we can produce past-tense messages on completion. */
	private readonly _activeToolCalls = new Map<string, ICopilotActiveToolCall>();
	private readonly _streamingToolCalls = new Map<string, ICopilotStreamingToolCall>();
	private readonly _streamingToolDisplaySchedulers = this._register(new DisposableMap<string, RunOnceScheduler>());
	/**
	 * Maps a subagent's stable `agentId` to its parent tool call id. Completion
	 * ends the current subagent turn, but steering can start another turn with
	 * the same id, so mappings live until session teardown.
	 */
	private readonly _parentToolCallIdsByAgentId = new Map<string, string>();
	private readonly _rootTurnIdBySubagentToolCallId = new Map<string, string>();
	readonly modelCallTurnCorrelation = new ModelCallTurnCorrelation();
	private readonly _subagentDirectUsageByToolCallId = new Map<string, DirectUsageAccumulator>();
	private readonly _lastSubagentUsageByToolCallId = new Map<string, UsageInfo>();
	/**
	 * Auto's routing decision per subagent. Keyed by tool call rather than turn: a
	 * subagent outlives the root turn that spawned it when steering mints a new one.
	 */
	private readonly _autoModeResolvedByToolCallId = new Map<string, NonNullable<UsageInfoMeta['autoModeResolved']>>();
	private readonly _activeSubagentAgentIds = new Set<string>();
	private readonly _unroutableSubagentToolCallIds = new Set<string>();
	private readonly _autoApprovals = new Map<string, PermissionAssistedApproval | null>();
	private readonly _pendingAutoApprovals = new PendingRequestRegistry<PermissionAssistedApproval | undefined>();
	/** Correlates tool execution with the SDK permission lifecycle for `chat.toolApproval` telemetry. */
	private readonly _toolApprovalRecords = new Map<string, {
		permissionRequested: boolean;
		resolvedByHook: boolean;
		requestSandboxBypass: boolean;
		resultKind: PermissionResult['kind'] | undefined;
		toolName: string | undefined;
		mcpServerName: string | undefined;
		reported: boolean;
	}>();
	/** Pending permission requests awaiting a renderer-side decision. */
	private readonly _pendingPermissions = new PendingRequestRegistry<PermissionRequestResult, {
		readonly managedApprovalRequired: boolean;
	}>();
	/** Cancels callbacks that began before or during an SDK abort. */
	private readonly _abortCts = this._register(new MutableDisposable<CancellationTokenSource>());
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
	private readonly _pendingUserInputs = new PendingRequestRegistry<
		{ response: ChatInputResponseKind; answers?: Record<string, ChatInputAnswer> },
		{ questionId: string }
	>();
	/**
	 * Pending elicitation requests awaiting a renderer-side answer. Keyed
	 * by request id; the schema is retained so the completion handler can
	 * project the submitted {@link ChatInputAnswer}s back into the
	 * SDK's {@link ElicitationResult.content} shape.
	 */
	private readonly _pendingElicitations = new PendingRequestRegistry<
		{ response: ChatInputResponseKind; answers?: Record<string, ChatInputAnswer> },
		{ schema: ElicitationSchema | undefined }
	>();
	/**
	 * Pending plan-review requests originating from the CLI's
	 * `exitPlanMode.request` RPC. Tracked separately from
	 * {@link _pendingUserInputs} so the completion handler can resolve the
	 * RPC with a structured {@link CopilotExitPlanModeResponse} (which the CLI
	 * forwards to `session.respondToExitPlanMode`) rather than feeding it
	 * back through the SDK's `ask_user` callback.
	 */
	private readonly _pendingPlanReviews = new PendingRequestRegistry<
		CopilotExitPlanModeResponse,
		{
			readonly actions: readonly string[];
			readonly recommendedAction: string;
			readonly questionId: string;
		}
	>();
	/** File edit tracker for this session. */
	private readonly _editTracker: FileEditTracker;
	/** Session database reference. */
	private readonly _databaseRef: IReference<ISessionDatabase>;
	/**
	 * The current protocol turn and its per-turn bookkeeping, or `undefined`
	 * when the session is idle (no active turn). Replaces the former set of
	 * loosely-coupled per-turn fields (`_turnId`, usage counter, streaming
	 * part-id maps) with a single object carrying an explicit
	 * {@link CopilotTurn.state} lifecycle. A {@link MutableDisposable}:
	 * replacing or clearing it disposes the old turn.
	 */
	private readonly _currentTurn = this._register(new MutableDisposable<CopilotTurn>());
	private _resumingTurnAwaitingProviderStart: CopilotTurn | undefined;
	private _developmentRecoverableError: { readonly turnId: string; remainingFailures: number; readonly totalFailures: number } | undefined;
	private readonly _developmentErrorInjectionEnabled: boolean;
	private _dropLateRootTurnEvents = false;
	/** Monotonic 0-based ordinal assigned to each turn as it starts, for numeric `turnIndex` telemetry parity. */
	private _nextTurnOrdinal = 0;
	/**
	 * Protocol turn ID of the active turn, or `''` when idle. Used by file
	 * edit tracking and emitted on per-turn actions.
	 */
	private get _turnId(): string { return this._currentTurn.value?.id ?? ''; }
	/** 0-based ordinal of the active turn within the session, or `0` when idle. */
	private get _turnOrdinal(): number { return this._currentTurn.value?.ordinal ?? 0; }
	/**
	 * Whether the session currently has an in-flight turn. Used by
	 * non-destructive idle release to avoid disconnecting mid-turn.
	 */
	get hasActiveTurn(): boolean { return this._currentTurn.value !== undefined; }
	get chatUri(): URI { return this._chatChannelUri; }
	get currentTurnId(): string | undefined { return this._currentTurn.value?.id; }

	getTurnDiagnosticSnapshot(turnId: string): IAgentTurnDiagnosticSnapshot | undefined {
		const currentTurn = this._currentTurn.value;
		const turn = currentTurn?.id === turnId ? currentTurn : undefined;
		if (!turn) {
			return undefined;
		}
		return {
			state: 'available',
			providerCallState: turn.providerCallState,
			providerTurnStarted: turn.providerTurnStarted,
			providerSessionState: this._wrapper.lifecycleState,
		};
	}
	get currentTurnClientType(): AgentHostClientType { return this._currentTurn.value?.clientType ?? AgentHostClientType.Unknown; }
	get currentTurnClientContext(): IAgentHostClientTelemetryContext | undefined { return this._currentTurn.value?.clientContext; }

	async collectDebugLogs(outputDirectory: URI, includeSessionLogs: boolean): Promise<boolean> {
		let result: Awaited<ReturnType<CopilotSession['rpc']['debug']['collectLogs']>>;
		// The SDK can publish session.idle before its events journal is visible on disk.
		for (let attempt = 0; ; attempt++) {
			result = await this._wrapper.session.rpc.debug.collectLogs({
				destination: { kind: 'directory', outputDirectory: outputDirectory.fsPath },
				include: {
					events: includeSessionLogs,
					processLogs: false,
					shellLogs: includeSessionLogs,
				},
			});
			const eventLogPending = includeSessionLogs && result.skippedEntries?.some(entry => entry.bundlePath === 'events.jsonl' && entry.reason === 'not found');
			if (!eventLogPending || attempt === DEBUG_LOG_COLLECTION_RETRY_ATTEMPTS - 1) {
				break;
			}
			if (result.kind === 'directory' && result.path !== outputDirectory.fsPath) {
				await rm(result.path, { recursive: true, force: true });
			}
			await timeout(DEBUG_LOG_COLLECTION_RETRY_DELAY_MS);
		}
		if (result.kind !== 'directory' || result.path === outputDirectory.fsPath) {
			return result.entries.length > 0;
		}
		try {
			await cp(result.path, outputDirectory.fsPath, { recursive: true });
		} finally {
			await rm(result.path, { recursive: true, force: true });
		}
		return result.entries.length > 0;
	}

	/**
	 * Last model id seen on the SDK's per-LLM-call `Usage` event (or a
	 * direct {@link setModel} call). We rely on the
	 * `Usage` event rather than the tool-call event itself because
	 * tool-call events don't carry the model id; the `Usage` event for
	 * an LLM turn precedes that turn's `tool_use` events.
	 */
	private _lastSeenModelId: string | undefined;
	/**
	 * Latest session-wide nano-AIU total reported by the SDK's usage metrics
	 * (`rpc.usage.getMetrics`), which is authoritative for what the session as a
	 * whole has been billed: it folds in every model call plus compaction,
	 * covers work billed while no turn was active, and survives resume.
	 *
	 * Deliberately *not* used to derive per-turn cost. It is session-scoped and
	 * read asynchronously, so differencing it against a previous reading races
	 * turn boundaries — the SDK's terminal `session.idle` can close a turn while
	 * a read is still in flight. Per-turn cost comes from the synchronous
	 * per-event `copilotUsage` instead (see {@link CopilotTurn.copilotNanoAiu}).
	 */
	private _sessionTotalNanoAiu = 0;
	private _promptCacheState: ISessionPromptCacheState | undefined;
	private _promptCacheRefreshGeneration = 0;
	/** Reads the latest retained host snapshot for this session. */
	private readonly _hostCustomizations: () => readonly Customization[];
	/**
	 * Serializes the metrics reads behind {@link _refreshSessionUsageMetrics}. Several
	 * handlers refresh the total, so without this their RPCs overlap and an older
	 * one resolving last would publish a session cost that visibly regresses. A
	 * high-water mark cannot be used to reject stale reads instead, because the
	 * total is legitimately non-monotonic (see the truncation note below). Keeping
	 * one read in flight makes out-of-order resolution impossible, and coalesces
	 * the redundant reads that a burst of usage events would otherwise issue.
	 */
	private readonly _sessionUsageMetricsRefreshThrottler = this._register(new Throttler());
	/** SDK session wrapper, set by {@link initializeSession}. */
	private _wrapper!: CopilotSessionWrapper;
	private readonly _slashCommandProvider: CopilotSlashCommandProvider;
	/** Last agent mode pushed to the SDK via {@link applyMode}, to elide redundant `rpc.mode.set` calls. */
	private _lastAppliedMode: CopilotSdkMode | undefined;
	private _lastAppliedPermissionMode: PermissionMode | undefined;
	private _autoApprovalExperimentalModeEnabled = false;
	private readonly _permissionModeSequencer = new Sequencer();
	private readonly _mcpEnablementSequencer = new Sequencer();
	private readonly _mcpServerLifecycleSequencer = new SequencerByKey<string>();
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
	private readonly _appliedPluginSources: ReadonlySet<string>;
	private readonly _projectedMcpServerLaunchEnablement: ReadonlyMap<string, boolean>;
	private _mcpLaunchConfigurationDirty = false;
	/** Secondary filesystem roots successfully applied by the launch transaction. */
	private readonly _appliedAdditionalDirectories: readonly URI[];
	/**
	 * Live owning-client identity, read at tool-call stamp time so a window
	 * reload that re-pushes identical tools with a new `clientId` stamps
	 * subsequent client tool calls with the current id rather than the one
	 * frozen into {@link _appliedSnapshot}.
	 */
	private readonly _activeClientToolSet: ActiveClientToolSet;
	/** Whether a client's host-published membership includes this chat. */
	private readonly _clientReachesChat: (clientId: string, chat: URI) => boolean;
	/** Tool names that are client-provided, derived from snapshot. */
	private readonly _clientToolNames: ReadonlySet<string>;
	/** Tool-search decision supplied by the launcher that built this SDK session. */
	private _toolSearchActive = false;
	/** Deferred promises for pending client tool calls, keyed by toolCallId. */
	private readonly _pendingClientToolCalls = new PendingRequestRegistry<ToolResultObject>();
	/** Pending SDK MCP auth handler promises, keyed by SDK auth request id. */
	private readonly _pendingMcpAuthRequests = new PendingRequestRegistry<McpAuthResult | null | undefined, IPendingMcpAuthRequest>();
	/** `pending-edit-content:` URIs written during permission requests, keyed
	 *  by toolCallId. Cleaned up when the permission resolves or the session
	 *  is disposed. */
	private readonly _pendingEditContentUris = new Map<string, URI>();

	private readonly _onDidSessionProgress: Emitter<AgentSignal>;
	private readonly _sessionLauncher: ICopilotSessionLauncher;
	private readonly _launchPlan: CopilotSessionLaunchPlan;
	private _detectInterruptedTurnOnRestore: boolean;
	private readonly _isLaunchTokenStillCurrent: () => boolean;
	/** Notifies the agent that this chat's turn ended. See {@link ICopilotAgentSessionOptions.onTurnEnded}. */
	private readonly _onTurnEnded: () => void;
	private readonly _shellManager: ShellManager | undefined;
	/** Streams runtime-executed shell output into output-only (non-pty) terminal channels. */
	private readonly _nonPtyShellTerminals: NonPtyShellTerminalStreams;
	private readonly _workingDirectory: URI | undefined;
	private readonly _customizationDirectory: URI | undefined;
	private readonly _serverToolHost: IAgentServerToolHost | undefined;
	/** Bridges SDK-reported MCP server state into AHP customization actions. */
	private readonly _mcpCustomizations: McpCustomizationController;

	/**
	 * Fans MCP server notifications (today: `notifications/tools/list_changed`)
	 * up to the agent and on to the protocol server. Fired by the
	 * `onToolsUpdated` listener once per ready MCP channel.
	 */
	private readonly _onMcpNotification = this._register(new Emitter<IMcpNotification>());
	readonly onMcpNotification = this._onMcpNotification.event;
	private readonly _onDidRequireAuth = this._register(new Emitter<void>());
	readonly onDidRequireAuth = this._onDidRequireAuth.event;

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
	private readonly _repoInfoTelemetry: AgentHostRepoInfoTelemetry;
	private _activeRepoInfoTurn: {
		readonly telemetryMessageId: string;
		cancelled: boolean;
		begin: Promise<{ readonly context: IAgentHostRestrictedTelemetryContext; readonly baseBranch: string | undefined } | undefined>;
	} | undefined;

	constructor(
		options: ICopilotAgentSessionOptions,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@IFileService private readonly _fileService: IFileService,
		@INativeEnvironmentService private readonly _environmentService: INativeEnvironmentService,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
		@IAgentHostCustomizationEnablementService private readonly _customizationEnablementService: IAgentHostCustomizationEnablementService,
		@IAgentHostPromptCache private readonly _promptCache: IAgentHostPromptCache,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ICopilotApiService private readonly _copilotApiService: ICopilotApiService,
		@IAgentHostOTelService private readonly _otelService: IAgentHostOTelService,
	) {
		super();
		this._abortCts.value = new CancellationTokenSource();
		this._developmentErrorInjectionEnabled = options.enableDevelopmentErrorInjection ?? !product.commit;
		this.sessionId = options.rawSessionId;
		this._ownerSessionUri = options.sessionUri;
		this.resourceUri = options.resource ?? options.sessionUri;
		this._slashCommandProvider = new CopilotSlashCommandProvider(() => this._wrapper.session.rpc.commands.list({ includeBuiltins: true, includeSkills: true, includeClientCommands: true }).then(c => c.commands), this._logService);
		this._chatChannelUri = options.chatChannelUri;
		this._storageUri = this.resourceUri;
		this._onDidSessionProgress = options.onDidSessionProgress;
		this._sessionLauncher = options.sessionLauncher;
		this._launchPlan = options.launchPlan;
		this._detectInterruptedTurnOnRestore = options.launchPlan.kind === 'resume';
		this._isLaunchTokenStillCurrent = options.isLaunchTokenCurrent ?? (() => true);
		this._onTurnEnded = options.onTurnEnded ?? (() => { });
		this._shellManager = options.shellManager;
		this._nonPtyShellTerminals = this._register(this._instantiationService.createInstance(NonPtyShellTerminalStreams, options.sessionUri, options.chatChannelUri));
		this._workingDirectory = options.workingDirectory;
		this._customizationDirectory = options.customizationDirectory;
		this._serverToolHost = options.serverToolHost;
		this._hostCustomizations = options.hostCustomizations ?? (() => []);
		this._platform = options.platform ?? process.platform;
		this._telemetryReporter = new AgentHostTelemetryReporter(this._telemetryService);
		this._repoInfoTelemetry = this._register(this._instantiationService.createInstance(AgentHostRepoInfoTelemetry, this._telemetryReporter));

		this._appliedSnapshot = options.clientSnapshot ?? { tools: [], plugins: [], mcpServers: {} };
		this._appliedPluginSources = new Set(this._appliedSnapshot.plugins.flatMap(plugin => plugin.sourceUri ? [plugin.sourceUri.toString()] : []));
		const disabledMcpServers = new Set([
			...this._appliedSnapshot.plugins.flatMap(plugin => plugin.disabledMcpServers ?? []),
			...(this._launchPlan.disabledRootMcpServers ?? []),
		]);
		this._projectedMcpServerLaunchEnablement = new Map(this._appliedSnapshot.plugins.flatMap(plugin =>
			plugin.mcpServers
				.filter(isMcpServerExplicitlyProjected)
				.map(server => [server.name, !disabledMcpServers.has(server.name)] as const)
		));
		this._appliedAdditionalDirectories = [...(this._launchPlan.additionalDirectories ?? [])];
		// Routing keeps the unfiltered set — the runtime is the enforcement point.
		this._clientToolNames = clientToolNamesFromSnapshot(this._appliedSnapshot);
		// Share the agent's live ActiveClientToolSet when provided so client
		// contributions (and owner identity) are observed at stamp time.
		// Standalone / test construction uses a fresh empty registry, which
		// leaves client tool calls unstamped (no owning client).
		this._activeClientToolSet = options.activeClientToolSet ?? new ActiveClientToolSet();
		this._clientReachesChat = options.clientReachesChat ?? (() => true);

		this._databaseRef = this._sessionDataService.openDatabase(this._storageUri);
		this._register(toDisposable(() => this._databaseRef.dispose()));
		this._editTracker = this._instantiationService.createInstance(
			FileEditTracker,
			this._storageUri.toString(),
			this._databaseRef.object,
		);

		const pluginMcpServerSources = new Map((options.clientSnapshot?.plugins ?? []).flatMap(plugin => {
			const sourceUri = plugin.sourceUri;
			return sourceUri === undefined ? [] : plugin.mcpServers.map(server => [server.name, sourceUri.toString()] as const);
		}));
		this._mcpCustomizations = this._register(this._instantiationService.createInstance(McpCustomizationController, {
			chatUri: this._chatChannelUri,
			emit: action => this._emitAction(action),
			pluginMcpServerSources: () => pluginMcpServerSources,
			resolveEnablement: (server, owningPluginUri) => {
				const resolution = this._customizationEnablementService.resolve(this._ownerSessionUri.toString(), targetForMcpServer(server, owningPluginUri, false));
				return resolution.kind === 'resolved' ? resolution.enablement : undefined;
			},
		}));

		this._register(toDisposable(() => this._cancelAllPendingInteractions()));
		this._register(toDisposable(() => this._shellManager?.dispose()));
		this._register(toDisposable(() => this._drainPendingSteeringFlips()));

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
	}

	// ---- AgentSignal helpers ------------------------------------------------

	private _shouldDropLateRootTurnEvent(eventType: string): boolean {
		if (!this._dropLateRootTurnEvents) {
			return false;
		}
		this._logService.error(`[Copilot:${this.sessionId}] ${eventType} emitted after cancellation; dropping`);
		return true;
	}

	/** Wraps a {@link SessionAction} in an {@link AgentSignal} envelope and emits it. */
	/** todo@connor4312: AHP is missing a chat activity update action which is needed to drop `SessionAction` here */
	private _emitAction(action: SessionAction | ChatAction, parentToolCallId?: string, trustedRootTurn = false): void {
		if (!trustedRootTurn
			&& this._dropLateRootTurnEvents
			&& isChatAction(action)
			&& hasKey(action, { turnId: true })
			&& action.type !== ActionType.ChatTurnStarted) {
			this._logService.error(`[Copilot:${this.sessionId}] ${action.type} emitted after cancellation; dropping`);
			return;
		}
		this._onDidSessionProgress.fire({
			kind: 'action',
			resource: isChatAction(action) ? this._chatChannelUri : this._ownerSessionUri,
			action,
			parentToolCallId,
		});
	}

	private _emitModelCallCompleted(turnId: string, modelCallId: string, parentToolCallId?: string): void {
		this._onDidSessionProgress.fire({
			kind: 'model_call_completed',
			resource: this._chatChannelUri,
			turnId,
			modelCallId,
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
		this._completeActiveTurn();
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
		const turn = this._currentTurn.value;
		if (turn) {
			turn.messageCharLen = steering.message.text.length;
			turn.markRunning();
		}
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
	 * Pops the buffered steering message whose text is contained in the SDK
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
		let substringMatch: [string, PendingMessage] | undefined;
		for (const [id, msg] of this._pendingSteeringFlips) {
			if (msg.message.text === content) {
				this._pendingSteeringFlips.delete(id);
				return msg;
			}
			if (msg.message.text.length > 0
				&& content.includes(msg.message.text)
				&& (!substringMatch || msg.message.text.length > substringMatch[1].message.text.length)) {
				substringMatch = [id, msg];
			}
		}
		if (substringMatch) {
			this._pendingSteeringFlips.delete(substringMatch[0]);
			return substringMatch[1];
		}
		return undefined;
	}

	private _parentToolCallIdForSubagentEvent(e: { readonly agentId?: string }): string | undefined {
		return e.agentId ? this._parentToolCallIdsByAgentId.get(e.agentId) : undefined;
	}

	private _resumeSubagentForEvent(e: { readonly agentId?: string }, message?: Message): void {
		if (this._dropLateRootTurnEvents) {
			return;
		}
		if (!e.agentId || this._activeSubagentAgentIds.has(e.agentId)) {
			return;
		}
		const parentToolCallId = this._parentToolCallIdsByAgentId.get(e.agentId);
		if (!parentToolCallId) {
			return;
		}
		if (this._currentTurn.value) {
			this._rootTurnIdBySubagentToolCallId.set(parentToolCallId, this._currentTurn.value.id);
		}
		this._activeSubagentAgentIds.add(e.agentId);
		this._onDidSessionProgress.fire({
			kind: 'subagent_resumed',
			chat: this._chatChannelUri,
			toolCallId: parentToolCallId,
			message,
		});
	}

	private _completeSubagentTurn(agentId: string | undefined, toolCallId?: string): void {
		if (agentId) {
			if (!this._activeSubagentAgentIds.delete(agentId)) {
				return;
			}
		} else if (!toolCallId) {
			return;
		}
		const parentToolCallId = toolCallId ?? (agentId ? this._parentToolCallIdsByAgentId.get(agentId) : undefined);
		if (!parentToolCallId) {
			return;
		}
		if (this._dropLateRootTurnEvents) {
			this._rootTurnIdBySubagentToolCallId.delete(parentToolCallId);
			this._subagentDirectUsageByToolCallId.delete(parentToolCallId);
			this._lastSubagentUsageByToolCallId.delete(parentToolCallId);
			this._autoModeResolvedByToolCallId.delete(parentToolCallId);
			return;
		}
		this._onDidSessionProgress.fire({
			kind: 'subagent_completed',
			chat: this._chatChannelUri,
			toolCallId: parentToolCallId,
		});
		this._rootTurnIdBySubagentToolCallId.delete(parentToolCallId);
		this._subagentDirectUsageByToolCallId.delete(parentToolCallId);
		this._lastSubagentUsageByToolCallId.delete(parentToolCallId);
		this._autoModeResolvedByToolCallId.delete(parentToolCallId);
	}

	private _directUsageFor(parentToolCallId: string | undefined, create: boolean): DirectUsageAccumulator | undefined {
		if (!parentToolCallId) {
			return this._currentTurn.value?.directUsage;
		}
		let usage = this._subagentDirectUsageByToolCallId.get(parentToolCallId);
		if (!usage && create) {
			usage = new DirectUsageAccumulator();
			this._subagentDirectUsageByToolCallId.set(parentToolCallId, usage);
		}
		return usage;
	}

	private _owningRootTurn(parentToolCallId: string | undefined): CopilotTurn | undefined {
		const turn = this._currentTurn.value;
		if (!turn || (parentToolCallId && this._rootTurnIdBySubagentToolCallId.get(parentToolCallId) !== turn.id)) {
			return undefined;
		}
		return turn;
	}

	private _shouldDropUnmappedSubagentEvent(e: { readonly agentId?: string }, eventName: string): boolean {
		const parentToolCallId = this._parentToolCallIdForSubagentEvent(e);
		if (!parentToolCallId && e.agentId) {
			this._logService.warn(`[Copilot:${this.sessionId}] Dropping ${eventName} for unknown subagent agentId=${e.agentId}`);
			return true;
		}
		return false;
	}

	/** Resolves the owning client for a chat-scoped tool call, honoring host-published chat membership. */
	private _resolveClientToolOwner(toolName: string): string | undefined {
		const chat = this._chatChannelUri;
		const provides = (clientId: string) => this._activeClientToolSet.get(clientId).some(tool => tool.name === toolName);
		const preferred = this._currentTurn.value?.senderClientId;
		if (preferred && this._clientReachesChat(preferred, chat) && provides(preferred)) {
			return preferred;
		}
		for (const clientId of this._activeClientToolSet.clientIds()) {
			if (this._clientReachesChat(clientId, chat) && provides(clientId)) {
				return clientId;
			}
		}
		return undefined;
	}

	private _getToolCallContributor(toolName: string, mcpServerName: string | undefined): ToolCallContributor | undefined {
		const clientToolName = this._clientToolName(toolName);
		if (this._clientToolNames.has(clientToolName)) {
			const clientId = this._resolveClientToolOwner(clientToolName);
			return clientId ? { kind: ToolCallContributorKind.Client, clientId } : undefined;
		}
		if (mcpServerName) {
			const customizationId = this._mcpCustomizations.customizationIdForServer(mcpServerName);
			return customizationId ? { kind: ToolCallContributorKind.MCP, customizationId } : undefined;
		}
		return undefined;
	}

	private _createToolCallMeta(toolName: string, parameters: Record<string, unknown> | undefined): Mutable<IToolCallMeta> {
		const toolKind = getToolKind(toolName, parameters);
		const subagentMeta = toolKind === 'subagent' ? getSubagentMetadata(parameters) : undefined;
		return {
			toolKind,
			language: toolKind === 'terminal' ? getShellLanguage(toolName) : undefined,
			subagentDescription: subagentMeta?.description,
			subagentAgentName: subagentMeta?.agentName,
		};
	}

	private _getStreamingToolCallDisplay(toolName: string, input: string) {
		const partialInput = parseCopilotStreamingToolInput(input);
		const parameters = partialInput !== null && typeof partialInput === 'object' && !Array.isArray(partialInput)
			? partialInput as Record<string, unknown>
			: undefined;
		return {
			parameters,
			meta: this._createToolCallMeta(toolName, parameters),
			invocationMessage: getStreamingInvocationMessage(toolName, getToolDisplayName(toolName), partialInput, path => this._resolveEditFilePath(path)),
		};
	}

	private _emitStreamingToolCallDisplay(toolCallId: string, streaming: ICopilotStreamingToolCall): void {
		if (!streaming.toolName) {
			return;
		}
		const display = this._getStreamingToolCallDisplay(streaming.toolName, streaming.input);
		streaming.displayedInputLength = streaming.input.length;
		const message = streamingToolDisplayText(display.invocationMessage);
		if (message === streaming.displayedMessage) {
			return;
		}
		streaming.displayedMessage = message;
		this._emitAction({
			type: ActionType.ChatToolCallDelta,
			turnId: this._turnId,
			toolCallId,
			content: '',
			invocationMessage: display.invocationMessage,
			_meta: toToolCallMeta(display.meta),
		}, streaming.parentToolCallId);
	}

	private _scheduleStreamingToolCallDisplay(toolCallId: string): void {
		let scheduler = this._streamingToolDisplaySchedulers.get(toolCallId);
		if (!scheduler) {
			scheduler = new RunOnceScheduler(() => {
				const streaming = this._streamingToolCalls.get(toolCallId);
				if (!streaming?.started || !streaming.toolName) {
					return;
				}
				if (streaming.displayedInputLength === streaming.input.length) {
					return;
				}
				this._emitStreamingToolCallDisplay(toolCallId, streaming);
			}, STREAMING_TOOL_DISPLAY_INTERVAL_MS);
			this._streamingToolDisplaySchedulers.set(toolCallId, scheduler);
		}
		if (!scheduler.isScheduled()) {
			scheduler.schedule();
		}
	}

	private _beginToolCallRound(parentToolCallId: string | undefined): void {
		const scope = parentToolCallId ?? '';
		this._currentTurn.value?.markdownPartIds.delete(scope);
		this._currentTurn.value?.reasoningPartIds.delete(scope);
	}

	/**
	 * Starts a fresh `pending` turn, discarding any per-turn streaming state
	 * from a previous turn so the next text/reasoning chunk allocates a new
	 * response part. The turn becomes `running` on the first SDK event.
	 */
	resetTurnState(turnId: string, senderClientId?: string, clientType = AgentHostClientType.Unknown, clientContext = createUnknownAgentHostClientTelemetryContext(clientType)): void {
		this._detectInterruptedTurnOnRestore = false;
		this._streamingToolCalls.clear();
		this._streamingToolDisplaySchedulers.clearAndDisposeAll();
		this._currentTurn.value = new CopilotTurn(turnId, this._nextTurnOrdinal++, senderClientId, clientContext);
	}

	async hasRunningDetachedShells(): Promise<boolean> {
		try {
			await this._wrapper.session.rpc.tasks.refresh();
			const tasks = await this._wrapper.session.rpc.tasks.list();
			return tasks.tasks.some(task => task.type === 'shell'
				&& task.attachmentMode === 'detached'
				&& (task.status === 'running' || task.status === 'idle'));
		} catch (err) {
			this._logService.warn(`[Copilot:${this.sessionId}] Failed to read detached shell state; deferring release: ${getErrorMessage(err)}`);
			return true;
		}
	}

	/** Refreshes prompt-cache state and the session-wide nano-AIU total from the SDK's authoritative usage metrics. */
	private async _refreshSessionUsageMetrics(): Promise<boolean> {
		try {
			return await this._sessionUsageMetricsRefreshThrottler.queue(async () => {
				const promptCacheRefreshGeneration = this._promptCacheRefreshGeneration;
				const metrics = await this._wrapper.session.rpc.usage.getMetrics();
				const modelId = metrics.currentModel;
				if (!this._store.isDisposed && modelId && promptCacheRefreshGeneration === this._promptCacheRefreshGeneration) {
					const cacheExpiresAt = metrics.modelMetrics[modelId]?.cacheExpiresAt;
					this._setPromptCacheState(cacheExpiresAt ? { modelId, cacheExpiresAt } : undefined);
				}

				const total = metrics.totalNanoAiu;
				if (typeof total !== 'number' || !Number.isFinite(total) || total < 0 || total === this._sessionTotalNanoAiu) {
					return false;
				}
				this._sessionTotalNanoAiu = total;
				return true;
			});
		} catch (err) {
			// Also covers the rejection from a throttler disposed mid-read.
			this._logService.trace(`[Copilot:${this.sessionId}] usage.getMetrics RPC failed: ${getErrorMessage(err)}`);
			return false;
		}
	}

	/**
	 * The parent-scope Copilot billing metadata for the active turn: the turn's
	 * own accumulated cost plus the SDK's session-wide total. Absent until
	 * something has actually been billed.
	 */
	private _parentCopilotUsageMeta(): UsageInfoMeta['copilotUsage'] | undefined {
		const turnNanoAiu = this._currentTurn.value?.copilotNanoAiu ?? 0;
		if (!turnNanoAiu && !this._sessionTotalNanoAiu) {
			return undefined;
		}
		return {
			...(turnNanoAiu ? { totalNanoAiu: turnNanoAiu } : {}),
			...(this._sessionTotalNanoAiu ? { sessionTotalNanoAiu: this._sessionTotalNanoAiu } : {}),
		};
	}

	/** Reads the SDK's per-source context-window attribution, or `undefined` when unavailable. */
	private async _readContextAttribution(): Promise<IContextAttributionData | undefined> {
		let attribution: IContextAttributionData | undefined;
		try {
			attribution = (await this._wrapper.session.rpc.metadata.getContextAttribution())?.contextAttribution ?? undefined;
		} catch (err) {
			this._logService.trace(`[Copilot:${this.sessionId}] contextAttribution RPC failed: ${getErrorMessage(err)}`);
			return undefined;
		}
		if (!attribution) {
			this._logService.trace(`[Copilot:${this.sessionId}] contextAttribution: null/empty`);
			return undefined;
		}
		if (this._logService.getLevel() <= LogLevel.Trace) {
			this._logService.trace(`[Copilot:${this.sessionId}] contextAttribution: totalTokens=${attribution.totalTokens}, entries=${JSON.stringify(attribution.entries.map(e => ({ kind: e.kind, id: e.id, label: e.label, tokens: e.tokens, parentId: e.parentId })))}`);
		}
		return attribution;
	}

	private _completeActiveTurn(trustedRootTurn = false): void {
		const turn = this._currentTurn.value;
		if (!turn) {
			return;
		}
		turn.markCompleted();
		this._reportToolCallDetails(turn, 'success');
		this._emitAction({
			type: ActionType.ChatTurnComplete,
			turnId: turn.id,
			duration: turn.duration,
		}, undefined, trustedRootTurn);
		this._clearActiveTurn();
	}

	failActiveTurn(error: ErrorInfo): string | undefined {
		const turn = this._currentTurn.value;
		if (!turn) {
			return undefined;
		}
		this._reportToolCallDetails(turn, 'failed');
		this._emitAction({
			type: ActionType.ChatError,
			turnId: turn.id,
			duration: turn.duration,
			part: createErrorResponsePart(error),
		});
		this._clearActiveTurn();
		return turn.id;
	}

	discardActiveTurn(): void {
		if (this._currentTurn.value) {
			this._clearActiveTurn();
		}
	}

	/**
	 * Drops the active turn and reports that this chat is now idle. Every
	 * transition out of an in-flight turn must go through here so work the
	 * agent defers while a turn runs — notably a pending CLI client restart —
	 * is not stranded waiting on a turn that already ended.
	 */
	private _clearActiveTurn(): void {
		if (this._resumingTurnAwaitingProviderStart === this._currentTurn.value) {
			this._resumingTurnAwaitingProviderStart = undefined;
		}
		this._currentTurn.clear();
		this._streamingToolCalls.clear();
		this._streamingToolDisplaySchedulers.clearAndDisposeAll();
		try {
			this._onTurnEnded();
		} catch (err) {
			// The turn is already cleared, so the session's own state is
			// consistent. Contain the failure to the agent's bookkeeping rather
			// than letting it escape into SDK event handling — or, on the
			// `send()` failure path, replace the error we are propagating.
			this._logService.error(err, `[Copilot:${this.sessionId}] onTurnEnded callback failed`);
		}
	}

	private _reportToolCallDetails(turn: CopilotTurn, responseType: 'success' | 'cancelled' | 'failed'): void {
		if (turn.toolCallDetailsReported) {
			return;
		}
		turn.toolCallDetailsReported = true;
		void this._telemetryReporter.toolCallDetails({
			clientContext: turn.clientContext,
			provider: this._ownerSessionUri.scheme,
			session: this.resourceUri.toString(),
			turnId: turn.id,
			clientType: turn.clientType,
			model: turn.lastModel,
			responseType,
			toolCounts: Object.fromEntries(turn.toolCounts),
			availableTools: this._appliedSnapshot.tools.map(tool => tool.name),
			numRequests: turn.toolCallRounds,
			turnIndex: turn.ordinal,
			turnDuration: turn.duration,
			messageCharLen: turn.messageCharLen,
			totalToolCalls: turn.totalToolCalls,
			parallelToolCallRounds: turn.parallelToolCallRounds,
			parallelToolCallsTotal: turn.parallelToolCallsTotal,
		}).catch(err => this._logService.trace(`[Copilot:${this.sessionId}] Telemetry emission failed: ${getErrorMessage(err)}`));
	}

	private _reportToolApproval(toolCallId: string, toolName: string | undefined, mcpServerName: string | undefined): void {
		const record = this._toolApprovalRecords.get(toolCallId);
		if (!toolName || isHiddenTool(toolName) || record?.reported) {
			return;
		}
		const confirmKind = mapPermissionResultToConfirmKind(record?.resultKind, record?.resolvedByHook === true);
		this._telemetryReporter.toolApproval({
			clientContext: this._currentTurn.value?.clientContext,
			provider: this._ownerSessionUri.scheme,
			session: this.resourceUri.toString(),
			turnId: this._turnId,
			toolId: toolName,
			toolSourceKind: this._toolSourceKindFor(toolName, mcpServerName),
			confirmKind,
			confirmationNotNeededReason: confirmKind === 'confirmationNotNeeded' && record?.resolvedByHook ? 'other' : undefined,
			requestUnsandboxedExecution: record?.requestSandboxBypass ? true : undefined,
		});
		if (record) {
			record.reported = true;
		}
	}

	private _reportToolApprovalIfNoPermission(toolCallId: string): void {
		const record = this._toolApprovalRecords.get(toolCallId);
		if (record && !record.permissionRequested) {
			this._reportToolApproval(toolCallId, record.toolName, record.mcpServerName);
		}
	}
	private _toolSourceKindFor(toolName: string, mcpServerName: string | undefined): string {
		if (mcpServerName) {
			return 'mcp';
		}
		if (this._clientToolNames.has(this._clientToolName(toolName))) {
			return 'client';
		}
		return 'internal';
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
	emitInitialMarkdown(content: string, trustedRootTurn = false): void {
		this._emitMarkdownDelta(content, undefined, trustedRootTurn);
	}

	/**
	 * Emits a streaming text delta. The first delta of a turn allocates a
	 * markdown response part; subsequent deltas append to it.
	 */
	private _emitMarkdownDelta(content: string, parentToolCallId?: string, trustedRootTurn = false): void {
		if (parentToolCallId === undefined && !trustedRootTurn && this._shouldDropLateRootTurnEvent('assistant.message_delta')) {
			return;
		}
		const turn = this._currentTurn.value;
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
			}, parentToolCallId, trustedRootTurn);
			return;
		}
		this._emitAction({
			type: ActionType.ChatDelta,
			turnId: turn.id,
			partId,
			content,
		}, parentToolCallId, trustedRootTurn);
	}

	/** Emits a reasoning delta, similar to {@link _emitMarkdownDelta} but for reasoning parts. */
	private _emitReasoningDelta(content: string, parentToolCallId?: string): void {
		if (parentToolCallId === undefined && this._shouldDropLateRootTurnEvent('assistant.reasoning_delta')) {
			return;
		}
		const turn = this._currentTurn.value;
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

	get requiresMcpLaunchConfigurationRefresh(): boolean {
		this._markMcpLaunchConfigurationDirty();
		return this._mcpLaunchConfigurationDirty;
	}

	get appliedDisabledRootMcpServers(): readonly string[] {
		return this._launchPlan.disabledRootMcpServers ?? [];
	}

	/**
	 * Secondary roots granted when this live SDK session was created or resumed.
	 * The primary process root is immutable and therefore excluded.
	 */
	get appliedAdditionalDirectories(): readonly URI[] {
		return this._appliedAdditionalDirectories;
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
	private _createClientSdkTools(toolSearchActive: boolean): Tool<any>[] {
		this._toolSearchActive = toolSearchActive;
		const tools = this._appliedSnapshot.tools;
		if (tools.length === 0) {
			return [];
		}
		const sessionTools = toolSearchActive
			? tools
			: tools.filter(def => def.name !== CLIENT_TOOL_SEARCH_REFERENCE_NAME);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return sessionTools.map((def): Tool<any> => {
			if (toolSearchActive && def.name === CLIENT_TOOL_SEARCH_REFERENCE_NAME) {
				return {
					name: RUNTIME_TOOL_SEARCH_TOOL_NAME,
					description: def.description ?? '',
					parameters: def.inputSchema ?? { type: 'object' as const, properties: {} },
					overridesBuiltInTool: true,
					defer: 'never',
					skipPermission: true,
					handler: this._guarded(async (_args: Record<string, unknown>, invocation) => {
						try {
							const candidates = this._toToolSearchCandidates(invocation.availableTools);
							const clientResult = await this._pendingClientToolCalls.registerAndFire(
								invocation.toolCallId,
								() => this._emitToolSearchReady(invocation.toolCallId, candidates),
							);
							return this._toToolSearchResult(clientResult, invocation.availableTools);
						} catch (error) {
							this._logService.error(error, `[Copilot:${this.sessionId}] Failed in tool-search handler: toolCallId=${invocation.toolCallId}`);
							return this._toolSearchFailure(getErrorMessage(error));
						}
					}, this._toolSearchFailure('Tool call cancelled: session is aborting'), 'tool-search'),
				};
			}
			const defer: 'auto' | 'never' | undefined = toolSearchActive
				? (NON_DEFERRED_CLIENT_TOOL_NAMES.has(def.name) ? 'never' : 'auto')
				: undefined;
			const sdkPolicy = getClientToolSdkPolicy(def.name);
			return {
				name: def.name,
				description: def.description ?? '',
				parameters: def.inputSchema ?? { type: 'object' as const, properties: {} },
				defer,
				...sdkPolicy,
				handler: this._guarded(async (_args: Record<string, unknown>, { toolCallId }) => {
					try {
						return await this._pendingClientToolCalls.register(toolCallId);
					} catch (error) {
						this._logService.error(error, `[Copilot:${this.sessionId}] Failed in client tool handler: tool=${def.name}, toolCallId=${toolCallId}`);
						throw error;
					}
				}, this._toolSearchFailure('Tool call cancelled: session is aborting'), 'client-tool'),
			};
		});
	}

	private _isToolSearchActive(): boolean {
		return this._toolSearchActive;
	}

	private get _abortToken(): CancellationToken {
		return this._abortCts.value?.token ?? CancellationToken.Cancelled;
	}

	private _beginAbort(): void {
		if (this._abortToken.isCancellationRequested) {
			return;
		}
		this._abortCts.value?.cancel();
		this._cancelAllPendingInteractions();
	}

	private _resetAbortToken(): void {
		this._abortCts.value = new CancellationTokenSource();
	}

	/**
	 * Guards SDK callbacks against aborts: the synchronous pre-check avoids the `shortcutEvent` macrotask for already-cancelled tokens, while the race releases callbacks that park after the abort sweep.
	 * The post-race check catches handler completions that win the cancellation macrotask because promise continuations run as microtasks.
	 */
	private _guarded<A extends unknown[], R>(handler: (...args: A) => Promise<R>, cancelled: R, label: string): (...args: A) => Promise<R> {
		return async (...args) => {
			const token = this._abortToken;
			if (token.isCancellationRequested) {
				this._logService.info(`[Copilot:${this.sessionId}] Discarding ${label} callback received while aborting`);
				return cancelled;
			}
			const result = await raceCancellation(handler(...args), token, cancelled);
			if (token.isCancellationRequested) {
				this._logService.info(`[Copilot:${this.sessionId}] Discarding ${label} callback result after abort`);
				return cancelled;
			}
			return result;
		};
	}

	private _clientToolName(toolName: string): string {
		return this._isToolSearchActive()
			&& toolName === RUNTIME_TOOL_SEARCH_TOOL_NAME
			? CLIENT_TOOL_SEARCH_REFERENCE_NAME
			: toolName;
	}

	private _toToolSearchCandidates(availableTools: readonly CurrentToolMetadata[] | undefined): readonly IToolSearchCandidate[] {
		return (availableTools ?? [])
			.filter(tool => tool.deferLoading)
			.map(tool => ({
				name: tool.name,
				description: tool.description ?? '',
			}));
	}

	private _emitToolSearchReady(toolCallId: string, candidates: readonly IToolSearchCandidate[]): void {
		const tracked = this._activeToolCalls.get(toolCallId);
		if (!tracked) {
			throw new Error(`Tool-search call '${toolCallId}' was not tracked.`);
		}
		this._emitAction({
			type: ActionType.ChatToolCallReady,
			turnId: this._turnId,
			toolCallId,
			...(tracked.contributor ? { contributor: tracked.contributor } : {}),
			...(tracked.intention !== undefined ? { intention: tracked.intention } : {}),
			invocationMessage: getInvocationMessage(tracked.toolName, tracked.displayName, tracked.parameters, path => this._resolveEditFilePath(path)),
			toolInput: getToolInputString(tracked.toolName, tracked.parameters, tracked.parameters ? tryStringify(tracked.parameters) : undefined),
			confirmed: ToolCallConfirmationReason.NotNeeded,
			_meta: toToolCallMeta({ ...(tracked.meta ?? {}), toolSearchCandidates: candidates }),
		}, tracked.parentToolCallId);
	}

	private _toolSearchFailure(message: string): ToolResultObject {
		return { textResultForLlm: message, resultType: 'failure', error: message, toolReferences: [] };
	}

	private _toToolSearchResult(clientResult: ToolResultObject, availableTools: readonly CurrentToolMetadata[] | undefined): ToolResultObject {
		const deferred = new Map<string, string>();
		for (const tool of availableTools ?? []) {
			if (tool.deferLoading) {
				deferred.set(tool.name, tool.name);
				if (tool.namespacedName) {
					deferred.set(tool.namespacedName, tool.name);
				}
			}
		}
		const parsedClientNames = this._parseToolSearchNames(clientResult.textResultForLlm);
		const clientNames = parsedClientNames ?? [];
		const toolReferences = [...new Set(clientNames.map(name => deferred.get(name)).filter(isDefined))];
		this._logService.info(`[Copilot:${this.sessionId}] tool_search override: availableTools=${availableTools?.length ?? 0}, deferred=${deferred.size}, clientMatched=[${clientNames.join(', ')}] -> toolReferences=[${toolReferences.join(', ')}]`);
		return {
			...clientResult,
			...(clientResult.resultType === 'success' && parsedClientNames !== undefined ? { textResultForLlm: JSON.stringify(toolReferences) } : {}),
			toolReferences,
		};
	}

	private _parseToolSearchNames(text: string): string[] | undefined {
		try {
			const parsed = JSON.parse(text);
			return Array.isArray(parsed) ? parsed.filter((name): name is string => typeof name === 'string') : undefined;
		} catch {
			return undefined;
		}
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
		const sessionUri = parseRequiredSessionUriFromChatUri(this._chatChannelUri.toString());
		return host.getDefinitionsForSession(sessionUri).filter(def => !this._launchPlan.isEphemeral || def.enabledForEphemeralSessions).map(def => ({
			name: def.name,
			description: def.description ?? '',
			parameters: def.inputSchema ?? { type: 'object' as const, properties: {} },
			defer: 'never' as const,
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
		if (this._pendingPermissions.getMetadata(toolCallId)?.managedApprovalRequired !== true) {
			this.respondToPermissionRequest(toolCallId, true);
		}
	}

	private _cancelMcpAuthenticationForToolCall(toolCallId: string): boolean {
		for (const [requestId, pending] of this._pendingMcpAuthRequests.entries()) {
			const toolCallIndex = pending.toolCalls.findIndex(toolCall => toolCall.toolCallId === toolCallId);
			if (toolCallIndex === -1) {
				continue;
			}
			pending.toolCalls.splice(toolCallIndex, 1);
			if (pending.toolCalls.length === 0) {
				this._pendingMcpAuthRequests.respond(requestId, { kind: 'cancelled' });
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
		await this._customizationEnablementService.initializeSession(this._ownerSessionUri.toString());
		const wrapper = await this._sessionLauncher.launch(this._launchPlan, this._createRuntimeAdapter());
		// The session may have been disposed while we were awaiting the
		// launcher. If so, dispose the freshly-created wrapper and
		// skip subscribing — registering on a disposed store would leak.
		if (this._store.isDisposed) {
			wrapper.dispose();
			throw new CancellationError();
		}
		const samplingInterest = await wrapper.session.rpc.eventLog.registerInterest({ eventType: 'sampling.requested' });
		if (this._store.isDisposed) {
			await wrapper.session.rpc.eventLog.releaseInterest({ handle: samplingInterest.handle });
			wrapper.dispose();
			throw new CancellationError();
		}
		this._register(toDisposable(() => {
			void wrapper.session.rpc.eventLog.releaseInterest({ handle: samplingInterest.handle }).catch(error => {
				this._logService.error(error, `[Copilot:${this.sessionId}] Failed to release sampling event interest`);
			});
		}));
		this._wrapper = this._register(wrapper);
		this._register(this._customizationEnablementService.onDidChange(event => {
			if (!event.sessions.includes(this._ownerSessionUri.toString())) {
				return;
			}
			this._markMcpLaunchConfigurationDirty();
			this._reconcileMcpServerEnablement().catch(error => this._logService.error(error, `[Copilot:${this.sessionId}] Failed to reconcile MCP enablement after customizations changed`));
		}));
		this._subscribeToEvents();
		this._subscribeForLogging();
		this._subscribeForMemoInvalidation();
		this._subscribeForInstructionsCollectedTelemetry();
		this._subscribeToPermissionConfigChanges();
		this._promptCacheState = this._promptCache.read(this.resourceUri);
		if (this._launchPlan.kind === 'resume') {
			await this._refreshSessionUsageMetrics();
			if (this._store.isDisposed) {
				throw new CancellationError();
			}
		}

		// Advertise the agent host's server tools for this session so clients
		// see them as server-provided. Execution happens in-process via the SDK
		// tool handlers built in `_createServerSdkTools`.
		this._serverToolHost?.advertise(this._storageUri.toString());
	}

	/** Updates the GitHub credentials used by this live SDK session. */
	async updateGitHubCredentials(host: string, token: string): Promise<GitHubCredentialsUpdateResult> {
		return this._wrapper.session.rpc.gitHubAuth.setCredentials({
			credentials: { type: 'token', host, token },
		});
	}

	private _setPromptCacheState(promptCache: ISessionPromptCacheState | undefined): void {
		// `resourceUri` can be shared, so persist and re-read through the shared prompt-cache seam.
		this._promptCacheState = this._promptCache.write(this.resourceUri, promptCache);
	}

	private _createRuntimeAdapter(): ICopilotSessionRuntime {
		return {
			chatUri: this._chatChannelUri,
			handlePermissionRequest: this._guarded(request => this._handlePermissionRequest(request), { kind: 'reject' } satisfies PermissionRequestResult, 'permission'),
			handleExitPlanModeRequest: this._guarded((request, invocation) => this._handleExitPlanModeRequest(request, invocation), { approved: false } satisfies CopilotExitPlanModeResponse, 'exit-plan-mode'),
			handleUserInputRequest: this._guarded((request, invocation) => this._handleUserInputRequest(request, invocation), { answer: '', wasFreeform: true } satisfies UserInputResponse, 'user-input'),
			handleElicitationRequest: this._guarded(context => this._handleElicitationRequest(context), { action: 'cancel' } satisfies ElicitationResult, 'elicitation'),
			handleMcpAuthRequest: this._guarded(request => this._handleMcpAuthRequest(request), { kind: 'cancelled' } satisfies McpAuthResult, 'mcp-auth'),
			requestUnsandboxedCommandConfirmation: this._guarded(request => this._requestUnsandboxedCommandConfirmation(request), false, 'unsandboxed-command-confirmation'),
			createClientSdkTools: toolSearchActive => this._createClientSdkTools(toolSearchActive),
			createServerSdkTools: () => this._createServerSdkTools(),
			handlePreToolUse: input => this._handlePreToolUse(input),
			handlePostToolUse: input => this._handlePostToolUse(input),
			handleUserPromptSubmitted: () => this.handleUserPromptSubmitted(),
		};
	}

	async resolveMcpAuthentication(params: AuthenticateParams): Promise<boolean> {
		let resolved = false;
		for (const [requestId, pending] of this._pendingMcpAuthRequests.entries()) {
			if (pending.resource.resource !== params.resource || !this._scopesSatisfy(params.scopes, pending.requiredScopes)) {
				continue;
			}
			for (const toolCall of pending.toolCalls) {
				this._emitAction({
					type: ActionType.ChatToolCallAuthResolved,
					turnId: toolCall.turnId,
					toolCallId: toolCall.toolCallId,
				}, toolCall.parentToolCallId);
			}
			resolved = this._pendingMcpAuthRequests.respond(requestId, { kind: 'token', accessToken: params.token }) || resolved;
		}
		return resolved;
	}

	private async _handleMcpAuthRequest(request: McpAuthRequest): Promise<McpAuthResult | null | undefined> {
		const customizationId = this._mcpCustomizations.customizationIdForServer(request.serverName);
		const enablement = getSdkMcpServerEnablement(resolveCustomizationEnablement(
			this._customizationEnablementService,
			this._ownerSessionUri,
			this._hostCustomizations(),
			undefined,
			undefined,
			this._mcpCustomizations.pluginMcpServerSources,
		));
		if (customizationId !== undefined && enablement.get(customizationId) === false) {
			this._logService.info(`[Copilot:${this.sessionId}] Suppressed authentication request from disabled MCP server '${request.serverName}'`);
			return null;
		}
		if (customizationId === undefined || enablement.get(customizationId) === undefined) {
			this._logService.trace(`[Copilot:${this.sessionId}] Allowing authentication request from MCP server '${request.serverName}' without resolved enablement`);
		}
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
		const result = this._pendingMcpAuthRequests.register(request.requestId, {
			serverName: request.serverName,
			resource,
			requiredScopes,
			toolCalls,
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
		return result;
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
		this._pendingMcpAuthRequests.denyAll({ kind: 'cancelled' });
	}

	private _cancelPendingMcpAuthRequestsForServer(serverName: string): void {
		for (const [requestId, pending] of this._pendingMcpAuthRequests.entries()) {
			if (pending.serverName !== serverName) {
				continue;
			}
			for (const toolCall of pending.toolCalls) {
				this._emitAction({
					type: ActionType.ChatToolCallAuthResolved,
					turnId: toolCall.turnId,
					toolCallId: toolCall.toolCallId,
				}, toolCall.parentToolCallId);
			}
			this._pendingMcpAuthRequests.respond(requestId, { kind: 'cancelled' });
		}
	}

	// ---- session operations -------------------------------------------------

	async send(prompt: string, attachments?: readonly MessageAttachment[], turnId?: string, mode?: CopilotSdkMode, senderClientId?: string, clientType = AgentHostClientType.Unknown, hostInstructions?: readonly string[], clientContext = createUnknownAgentHostClientTelemetryContext(clientType)): Promise<void> {
		this._resetAbortToken();
		if (turnId && this._currentTurn.value?.id !== turnId) {
			// Establish the `pending` turn for this message. Callers normally
			// call `resetTurnState` just before `send()`; this covers the
			// direct-send path and is a no-op when the turn already exists.
			this.resetTurnState(turnId, senderClientId, clientType, clientContext);
		}
		const currentTurn = this._currentTurn.value;
		if (currentTurn) {
			currentTurn.messageCharLen = prompt.length;
		}
		const turn = this._currentTurn.value;
		this._hostInstructions = hostInstructions;
		this._pendingSnapshotReminder = this._snapshotReadonlyReminder(attachments);
		if (this._tryStartDevelopmentRecoverableError(prompt)) {
			return;
		}
		try {
			await this._send(prompt, attachments, mode);
		} catch (err) {
			// A rejected send never reaches the SDK's agentic loop, so no
			// `session.idle` will ever arrive to close this turn. The host turns
			// the rejection into a `ChatError` that finalizes the protocol turn,
			// so drop our handle to match: leaving it set makes the chat look
			// busy forever, which blocks idle eviction and parks any deferred
			// client restart for the rest of the process's life.
			if (turn && this._currentTurn.value === turn) {
				this._clearActiveTurn();
			}
			this._hostInstructions = undefined;
			this._pendingSnapshotReminder = undefined;
			throw err;
		}
	}

	handleUserPromptSubmitted(): { readonly additionalContext: string } | undefined {
		const parts = [
			...(this._hostInstructions ?? []),
			...(this._pendingSnapshotReminder ? [this._pendingSnapshotReminder] : []),
		];
		this._hostInstructions = undefined;
		this._pendingSnapshotReminder = undefined;
		const additionalContext = parts.length > 0 ? parts.join('\n\n') : undefined;
		return additionalContext ? { additionalContext } : undefined;
	}

	/**
	 * Build a read-only reminder naming each host-created snapshot attachment
	 * (pasted content, unsaved editor, git: diff, …) so the model treats the
	 * on-disk copy as read-only context and does not edit it (#331154). Returns
	 * `undefined` when no attachment is a snapshot. The read-only signal rides
	 * the prompt (as `additionalContext` on the main turn, a `<reminder>` note
	 * on steering) rather than the attachment, because the runtime drops a file
	 * attachment's `displayName` for text snapshots.
	 */
	private _snapshotReadonlyReminder(attachments: readonly MessageAttachment[] | undefined): string | undefined {
		if (!attachments?.length) {
			return undefined;
		}
		const paths: string[] = [];
		for (const attachment of attachments) {
			if (attachment.type !== MessageAttachmentKind.Resource || !isHostSnapshotAttachment(attachment)) {
				continue;
			}
			const uri = URI.parse(attachment.uri);
			paths.push(uri.scheme === 'file' ? uri.fsPath : uri.toString());
		}
		if (paths.length === 0) {
			return undefined;
		}
		return 'The following attached files are read-only snapshots of content the user shared '
			+ '(pasted text, an unsaved editor, or a diff view) and must not be edited:\n'
			+ paths.map(path => `- ${path}`).join('\n');
	}

	private async _send(prompt: string, attachments: readonly MessageAttachment[] | undefined, mode: CopilotSdkMode | undefined): Promise<void> {
		this._logService.info(`[Copilot:${this.sessionId}] sendMessage called: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}" (${attachments?.length ?? 0} attachments)`);

		// Capture the turn's abort token before any dispatch await. Resolving a slash
		// command awaits `rpc.commands.list`; an abort during that await drives a terminal
		// `session.idle` that resets the live token (and leaves a `pending` turn open).
		// Reading `this._abortToken` afterwards — e.g. inside `_startFleet` — would then
		// observe a fresh, uncancelled token and miss the abort, starting an autonomous
		// fleet loop after cancellation. The captured reference reliably reflects it.
		const abortToken = this._abortToken;

		const slashCommand = parseLeadingSlashCommand(prompt);
		if (slashCommand?.command === 'compact') {
			try {
				const result = await this._wrapper.session.rpc.history.compact();
				// Compaction reduces the number of tokens currently occupying the context window. Report the
				// new occupancy so the context-usage widget refreshes immediately. Emitted before
				// `_completeActiveTurn` since the reducer drops usage for a non-active turn.
				const usedTokens = result.contextWindow?.currentTokens;
				if (typeof usedTokens === 'number') {
					// `session.compaction_complete` has already folded the summarization call's
					// cost into the turn by the time this RPC resolves; refresh the session total
					// so the report carries both.
					await this._refreshSessionUsageMetrics();
					const copilotUsage = this._parentCopilotUsageMeta();
					// This emit replaces the turn's usage in the reducer, so carry the
					// whole-turn token totals accumulated so far too.
					const turnTokenTotals = this._currentTurn.value?.tokenTotals;
					const directTurnTokenTotals = this._currentTurn.value?.directUsage.tokenTotals;
					const directNanoAiu = this._currentTurn.value?.directUsage.copilotNanoAiu;
					const meta: UsageInfoMeta = {
						...(copilotUsage ? { copilotUsage } : {}),
						...(turnTokenTotals ? { turnTokenTotals } : {}),
						...(directTurnTokenTotals ? { directTurnTokenTotals } : {}),
						...(directNanoAiu !== undefined ? { directCopilotUsage: { totalNanoAiu: directNanoAiu } } : {}),
					};
					this._emitAction({
						type: ActionType.ChatUsage,
						turnId: this._turnId,
						usage: {
							inputTokens: usedTokens,
							outputTokens: 0,
							model: this._lastSeenModelId,
							...(Object.keys(meta).length > 0 ? { _meta: meta } : {}),
						},
					}, undefined, true);
				}
				this.emitInitialMarkdown(localize('copilotAgent.compactionCompleted', "Compaction completed"), true);
			} catch (err) {
				if (getErrorMessage(err).toLowerCase().includes('nothing to compact')) {
					this.emitInitialMarkdown(localize('copilotAgent.compactionCompleted', "Compaction completed"), true);
					this._completeActiveTurn(true);
					return;
				}
				this._logService.error(err, `[Copilot:${this.sessionId}] rpc.history.compact failed`);
				throw err;
			}
			// `/compact` is handled inline via the history RPC rather than by
			// driving an SDK turn, so the SDK never fires `onIdle` to close the
			// turn. Complete the turn here so the session returns to idle
			// instead of spinning forever.
			this._completeActiveTurn(true);
			return;
		}
		const configAction = slashCommand ? resolveCopilotConfigSlashCommandOnSend(slashCommand.command, slashCommand.rawRest) : undefined;
		if (configAction) {
			// Workbench config-action command (permission/mode toggle, e.g.
			// `/autopilot <prompt>`, `/plan`, `/yolo`). The config is applied
			// client-side on accept via the session provider; here we re-apply the
			// mode for this turn (belt-and-suspenders) and strip the command token
			// so it is not dispatched to the runtime as a runtime command.
			// `autoApprove` changes are already reflected in the session config and
			// applied by `syncPermissionMode('turn-start')` below.
			const sdkMode = toCopilotSdkMode(configAction.applyConfig[SessionConfigKey.Mode]);
			if (sdkMode) {
				mode = sdkMode;
			}
			prompt = configAction.strippedPrompt;
		} else if (slashCommand) {
			const runtimeSlashCommand = await this._slashCommandProvider.resolveSlashCommand(slashCommand.command);
			// TEMPORARY WORKAROUND (#8837): route built-in /fleet via fleet.start to keep the AHP turn open; this bypasses commands.invoke telemetry/gating and should be removed once invoke returns agent-prompt.
			if (runtimeSlashCommand && runtimeSlashCommand.kind === 'builtin' && runtimeSlashCommand.name === 'fleet') {
				await this._startFleet(slashCommand.rest, attachments, mode, abortToken);
				return;
			}
			// Skills can be passed as is to the runtime.
			if (runtimeSlashCommand && runtimeSlashCommand.kind !== 'skill') {
				// Apply the effective mode before invoking the runtime command so it runs
				// under the correct SDK mode (issue #8837). An `agent-prompt` result may
				// override the mode; that override is applied again before `session.send`.
				await this.applyMode(mode);
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
						this._emitMarkdownDelta(result.markdown === true ? result.text : escapeMarkdownSyntaxTokens(result.text), undefined, true);
						break;
					case 'completed':
						if (result.message) {
							this._emitMarkdownDelta(result.message, undefined, true);
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
						), undefined, true);
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
					this._completeActiveTurn(true);
					return;
				}
			}
		}

		const sdkAttachments = await this._toSdkAttachments(attachments);

		await this._prepareSdkTurn(mode);
		const traceContext = this._otelService.getSessionTraceContext(this.sessionId, this.resourceUri.toString());
		const sendingTurn = this._currentTurn.value;
		sendingTurn?.markProviderCallPending();
		try {
			await this._otelService.withTraceContext(traceContext, () => {
				if (!this._environmentService.isBuilt && prompt === '$error') {
					return this._wrapper.session.rpc.sendMessages({
						messages: [{ prompt }],
						requestHeaders: { Authorization: '******' },
					});
				}
				return this._wrapper.session.send({ prompt, attachments: sdkAttachments?.length ? sdkAttachments : undefined });
			});
			sendingTurn?.markProviderCallResolved();
		} catch (error) {
			sendingTurn?.markProviderCallRejected();
			throw error;
		}
		this._logService.info(`[Copilot:${this.sessionId}] session.send() returned`);
	}

	async resume(turnId: string, mode?: CopilotSdkMode, senderClientId?: string, clientType = AgentHostClientType.Unknown, clientContext = createUnknownAgentHostClientTelemetryContext(clientType)): Promise<void> {
		this._resetAbortToken();
		this.resetTurnState(turnId, senderClientId, clientType, clientContext);
		if (this._tryContinueDevelopmentRecoverableError(turnId)) {
			return;
		}
		const turn = this._currentTurn.value;
		this._resumingTurnAwaitingProviderStart = turn;
		turn?.markProviderCallPending();
		try {
			await this._prepareSdkTurn(mode);
			const traceContext = this._otelService.getSessionTraceContext(this.sessionId, this.resourceUri.toString());
			await this._otelService.withTraceContext(traceContext, () => this._wrapper.session.rpc.sendMessages({ messages: [] }));
			turn?.markProviderCallResolved();
			this._logService.info(`[Copilot:${this.sessionId}] zero-message continuation returned`);
		} catch (error) {
			if (this._resumingTurnAwaitingProviderStart === turn) {
				this._resumingTurnAwaitingProviderStart = undefined;
			}
			if (turn && this._currentTurn.value === turn) {
				turn.markProviderCallRejected();
				this._clearActiveTurn();
			}
			throw error;
		}
	}

	private _tryStartDevelopmentRecoverableError(prompt: string): boolean {
		if (!this._developmentErrorInjectionEnabled) {
			return false;
		}
		const match = /^\$error-ui(?<tool>-tool)?(?::(?<count>[1-9]))?$/.exec(prompt);
		const turn = this._currentTurn.value;
		if (!match || !turn) {
			return false;
		}
		const totalFailures = match.groups?.count ? Number(match.groups.count) : 1;
		this._developmentRecoverableError = {
			turnId: turn.id,
			remainingFailures: totalFailures - 1,
			totalFailures,
		};
		this._hostInstructions = undefined;
		this._pendingSnapshotReminder = undefined;
		if (match.groups?.tool) {
			this._emitDevelopmentCompletedToolCall(turn);
		}
		this._emitDevelopmentRecoverableError(turn, 1, totalFailures);
		return true;
	}

	private _tryContinueDevelopmentRecoverableError(turnId: string): boolean {
		const state = this._developmentRecoverableError;
		const turn = this._currentTurn.value;
		if (!state || state.turnId !== turnId || !turn) {
			return false;
		}
		if (state.remainingFailures > 0) {
			const attempt = state.totalFailures - state.remainingFailures + 1;
			state.remainingFailures--;
			this._emitDevelopmentRecoverableError(turn, attempt, state.totalFailures);
			return true;
		}
		this._developmentRecoverableError = undefined;
		this._emitMarkdownDelta(localize('copilotAgent.developmentRecoverableErrorRecovered', "Recovered after {0} injected failure(s).", state.totalFailures), undefined, true);
		this._completeActiveTurn(true);
		return true;
	}

	private _emitDevelopmentRecoverableError(turn: CopilotTurn, attempt: number, totalFailures: number): void {
		this._emitAction({
			type: ActionType.ChatError,
			turnId: turn.id,
			duration: turn.duration,
			part: createErrorResponsePart({
				errorType: 'developmentRecoverableError',
				message: localize('copilotAgent.developmentRecoverableError', "Injected recoverable development error ({0}/{1}).", attempt, totalFailures),
			}),
		});
		this._clearActiveTurn();
	}

	private _emitDevelopmentCompletedToolCall(turn: CopilotTurn): void {
		const toolCallId = `${turn.id}-development-tool`;
		this._emitAction({
			type: ActionType.ChatToolCallStart,
			turnId: turn.id,
			toolCallId,
			toolName: 'view',
			displayName: 'Read',
			intention: 'Read README.md before the injected failure',
		});
		this._emitAction({
			type: ActionType.ChatToolCallReady,
			turnId: turn.id,
			toolCallId,
			invocationMessage: 'Reading README.md',
			toolInput: '{"path":"README.md"}',
			confirmed: ToolCallConfirmationReason.NotNeeded,
		});
		this._emitAction({
			type: ActionType.ChatToolCallComplete,
			turnId: turn.id,
			toolCallId,
			result: {
				success: true,
				pastTenseMessage: 'Read README.md',
				content: [{ type: ToolResultContentType.Text, text: 'Captured tool output before the injected failure.' }],
			},
		});
	}

	/**
	 * Applies the per-turn SDK configuration shared by every operation that starts
	 * an agent loop (normal `session.send` and the `/fleet` start path): agent mode,
	 * permission mode, sandbox, and MCP enablement. Mode and sandbox keep their
	 * existing best-effort semantics.
	 */
	private async _prepareSdkTurn(mode: CopilotSdkMode | undefined): Promise<void> {
		await this.applyMode(mode);
		await this.syncPermissionMode('turn-start');
		await this._applyEffectiveSandboxConfig();
		await this._reconcileMcpServerEnablement();
	}

	/**
	 * Temporary `/fleet` compatibility path (issue #8837): starts the SDK's fleet
	 * agent loop via the dedicated `rpc.fleet.start` RPC and keeps the AHP turn open
	 * until the SDK's terminal `session.idle`, rather than completing it as `commands.invoke`
	 * would. Remove once the runtime returns an `agent-prompt` result for `/fleet`.
	 */
	private async _startFleet(rest: string, attachments: readonly MessageAttachment[] | undefined, mode: CopilotSdkMode | undefined, abortToken: CancellationToken): Promise<void> {
		if (attachments?.length) {
			// `rpc.fleet.start` accepts only a prompt; fail loudly rather than silently dropping attachments.
			throw new Error(localize('copilotAgent.fleet.attachmentsUnsupported', "Attachments are not supported with the /fleet command."));
		}
		const startingTurn = this._currentTurn.value;
		// `abortToken` is captured by the caller before the dispatch await (slash-command
		// resolution), so it reliably reflects an abort that raced that await: an aborted
		// `session.idle` resets the live token, so reading `this._abortToken` here could
		// observe a fresh post-abort token and miss the cancellation.
		await this._prepareSdkTurn(mode);
		// Preflight awaits several RPCs; if an abort or terminal idle raced it, do not
		// start the fleet loop at all — starting it would orphan an autonomous run.
		if (!startingTurn || this._currentTurn.value !== startingTurn) {
			this._logService.warn(`[Copilot:${this.sessionId}] fleet turn ended during preflight; not starting fleet`);
			return;
		}
		if (abortToken.isCancellationRequested) {
			this._logService.warn(`[Copilot:${this.sessionId}] aborted during fleet preflight; not starting fleet`);
			this.discardActiveTurn();
			return;
		}
		const traceContext = this._otelService.getSessionTraceContext(this.sessionId, this.resourceUri.toString());
		let result: { started: boolean };
		startingTurn.markProviderCallPending();
		try {
			result = await this._otelService.withTraceContext(traceContext, () => this._wrapper.session.rpc.fleet.start(rest ? { prompt: rest } : {}));
			startingTurn.markProviderCallResolved();
		} catch (err) {
			startingTurn.markProviderCallRejected();
			// A terminal `session.idle` already ended this turn while the RPC was in
			// flight — idle is authoritative, so never emit a second terminal action.
			if (!startingTurn || this._currentTurn.value !== startingTurn) {
				this._logService.warn(`[Copilot:${this.sessionId}] rpc.fleet.start rejected after its turn already ended`, err);
				return;
			}
			// An abort raced the RPC; the client already finalized the protocol turn via
			// cancellation, so drop our handle rather than surfacing another error.
			if (abortToken.isCancellationRequested) {
				this._logService.warn(`[Copilot:${this.sessionId}] rpc.fleet.start rejected after abort; discarding turn`, err);
				this.discardActiveTurn();
				return;
			}
			throw err;
		}
		if (!startingTurn || this._currentTurn.value !== startingTurn) {
			// A terminal `session.idle` already ended this turn while the RPC was in flight.
			if (!result.started) {
				this._logService.warn(`[Copilot:${this.sessionId}] rpc.fleet.start returned started=false after its turn already ended`);
			}
			return;
		}
		if (abortToken.isCancellationRequested) {
			// An abort raced the RPC and left this turn `pending` (the idle handler keeps
			// pending turns open), so it will never receive a completing idle. Drop the
			// handle instead of promoting it to `running`, which would strand the chat.
			this._logService.warn(`[Copilot:${this.sessionId}] rpc.fleet.start settled after abort; discarding turn`);
			this.discardActiveTurn();
			return;
		}
		if (result.started) {
			// `fleet.start` only acknowledges activation; the SDK agent loop keeps
			// running and the existing `session.idle` handler completes this turn.
			// Promote the turn to `running` now so an abort before the first SDK event
			// tears it down instead of stranding a `pending` turn.
			startingTurn.markRunning();
			this._logService.info(`[Copilot:${this.sessionId}] rpc.fleet.start succeeded; retaining turn until session idle`);
			return;
		}
		throw new Error(localize('copilotAgent.fleet.notStarted', "Fleet could not be started."));

	}

	private async _toSdkAttachments(attachments: readonly MessageAttachment[] | undefined): Promise<CopilotSdkAttachment[] | undefined> {
		const sdkAttachments = attachments?.length
			? (await Promise.all(attachments.map(attachment => this._toSdkAttachment(attachment)))).filter(isDefined)
			: undefined;
		if (sdkAttachments?.length) {
			this._logService.trace(`[Copilot:${this.sessionId}] Attachments: ${JSON.stringify(sdkAttachments.map(attachment => ({ type: attachment.type })))}`);
		}
		return sdkAttachments;
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
				mimeType: addAttachmentDisplayKindToMimeType(attachment.displayKind),
				displayName: attachment.label,
			};
		}
		if (attachment.type === MessageAttachmentKind.Simple) {
			if (attachment.modelRepresentation) {
				return {
					type: 'blob' as const,
					data: encodeBase64(VSBuffer.fromString(attachment.modelRepresentation)),
					mimeType: addSimpleAttachmentDisplayKindToMimeType(attachment),
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
		// A host-created snapshot (pasted content, unsaved editor, git: diff, …) is shaped like any other
		// resource here (file or selection). Its read-only signal is carried separately on the prompt — via
		// `additionalContext` on the main turn and a `<reminder>` note on steering (see
		// `_snapshotReadonlyReminder`) — because the runtime drops a file attachment's `displayName` for text
		// snapshots, rendering only the path in `<tagged_files>` (#331154). Selected snapshots therefore keep
		// the selection path below so the model still receives the selected text and range.
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
		return this._configurationService.getEffectiveValue(this._ownerSessionUri.toString(), platformSessionSchema, SessionConfigKey.Mode) === 'autopilot';
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
			this._pendingSteeringFlips.set(steeringMessage.id, steeringMessage);
			const sdkAttachments = await this._toSdkAttachments(steeringMessage.message.attachments);
			// Steering is injected into the active turn and never fires the SDK's `user-prompt-submitted`
			// hook, so the read-only snapshot signal can't ride `additionalContext` here. Fold it into the
			// prompt as a `<reminder>` block instead: the runtime forwards it to the model, and the host's
			// `stripPromptScaffolding` removes it from the displayed message (#331154).
			const snapshotReminder = this._snapshotReadonlyReminder(steeringMessage.message.attachments);
			const steeringPrompt = snapshotReminder
				? `${steeringMessage.message.text}\n\n<reminder>\n${snapshotReminder}\n</reminder>`
				: steeringMessage.message.text;
			await this._wrapper.session.send({
				prompt: steeringPrompt,
				attachments: sdkAttachments?.length ? sdkAttachments : undefined,
				mode: 'immediate',
			});
		} catch (err) {
			this._pendingSteeringFlips.delete(steeringMessage.id);
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
	 * Memoized `getEvents()` + {@link mapSessionEvents} result, shared by
	 * {@link getMessages} and {@link getSubagentMessages}. A single session open reads and
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
		this._logService.trace(`[Copilot:${this.sessionId}] Reading persisted session events`);
		const events = await this._wrapper.session.getEvents();
		this._logService.trace(`[Copilot:${this.sessionId}] Read ${events.length} persisted event(s); reconstructing turns`);
		let db: ISessionDatabase | undefined;
		try {
			db = this._databaseRef.object;
		} catch {
			// Database may not exist yet — that's fine
		}
		const result = await mapSessionEvents(this._storageUri, db, events, this._chatChannelUri, {
			workingDirectory: this._workingDirectory,
			model: this._launchPlan.kind === 'create'
				? this._launchPlan.model
				: this._launchPlan.fallback.model,
			...(this._detectInterruptedTurnOnRestore ? {
				interruptedTurnError: {
					errorType: 'executionInterrupted',
					message: localize('copilotAgent.interruptedTurn', "The agent was interrupted before this request finished."),
				},
			} : {}),
		});
		this._logService.trace(`[Copilot:${this.sessionId}] Reconstructed ${result.turns.length} turn(s) from ${events.length} event(s)`);
		return result;
	}

	/** Drop the memoized event reconstruction; the next read rebuilds it. */
	private _invalidateMappedEvents(): void {
		this._mappedEventsMemo = undefined;
	}

	async abort(): Promise<void> {
		this._logService.info(`[Copilot:${this.sessionId}] Aborting session...`);
		const abortingTurn = this._currentTurn.value;
		const resumingTurn = this._resumingTurnAwaitingProviderStart;
		if (abortingTurn) {
			this._dropLateRootTurnEvents = true;
		}
		this._beginAbort();
		this._drainPendingSteeringFlips();
		try {
			await this._wrapper.session.abort();
		} catch (error) {
			this._resetAbortToken();
			throw error;
		}
		if (resumingTurn && this._resumingTurnAwaitingProviderStart === resumingTurn && this._currentTurn.value === resumingTurn && !resumingTurn.providerTurnStarted) {
			resumingTurn.markAborted();
			this._clearActiveTurn();
		}
	}

	/**
	 * Aborts before tearing down so that in-flight {@link _guarded} callbacks
	 * settle rather than hang: disposing the {@link _abortCts} would drop each
	 * racing `onCancellationRequested` listener without ever firing it, leaving
	 * a callback that parks its deferred after the teardown sweep with nothing
	 * left to resolve it. The sweep registered in the constructor stays as the
	 * backstop, since {@link _beginAbort} no-ops when already aborted.
	 */
	override dispose(): void {
		void this._editTracker.flushAttribution().catch(error => {
			this._logService.warn(`[Copilot:${this.sessionId}] Failed to flush edit attribution: ${error}`);
		});
		this._beginAbort();
		super.dispose();
	}

	/**
	 * Explicitly destroys the underlying SDK session and waits for cleanup
	 * to complete. Call this before {@link dispose} when you need to ensure
	 * the session's on-disk data is no longer locked (e.g. before
	 * truncation or fork operations that modify the session files).
	 */
	async destroySession(): Promise<void> {
		try {
			await this._editTracker.flushAttribution();
		} catch (error) {
			this._logService.warn(`[Copilot:${this.sessionId}] Failed to flush edit attribution: ${error}`);
		}
		await this._wrapper.disconnect();
	}

	/**
	 * The Auto routing profile this session launched with, which the runtime fixes for the session's
	 * lifetime. Read from the frozen plan so a later gate flip cannot change what it reports.
	 */
	get launchAutoTier(): AutoModeTier | undefined {
		return this._launchPlan.kind === 'create' ? this._launchPlan.autoTier : this._launchPlan.fallback.autoTier;
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
				const args = isObject(rawArgs) ? rawArgs as Record<string, JsonValue> : undefined;
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
		return this._mcpServerLifecycleSequencer.queue(serverName, async () => {
			try {
				await this._wrapper.session.rpc.mcp.startServer({ serverName });
			} finally {
				// Reconcile against the SDK's real state. The live
				// `session.mcp_server_status_changed` stream already reports the
				// connect (`pending` -> `connected`/`failed`); this covers the case
				// where the start rejects before any status is emitted.
				this._seedMcpServersFromRpc();
			}
		});
	}

	private _reconcileMcpServerEnablement(): Promise<void> {
		return this._mcpEnablementSequencer.queue(() => this._doReconcileMcpServerEnablement());
	}

	private async _doReconcileMcpServerEnablement(): Promise<void> {
		this._markMcpLaunchConfigurationDirty();
		const desiredEnablement = this._getDesiredMcpServerEnablementByName();
		if (desiredEnablement.size === 0) {
			return;
		}
		await this._refreshMcpServersFromRpc();
		let changed = false;
		for (const server of this._mcpCustomizations.serverEnablement()) {
			const desired = desiredEnablement.get(server.serverName);
			if (desired === undefined || desired === server.enabled) {
				continue;
			}
			try {
				if (desired) {
					if (this._mcpLaunchConfigurationDirty && this._projectedMcpServerLaunchEnablement.has(server.serverName)) {
						continue;
					}
					// Re-enabling restarts the server. The SDK reports the
					// connect live (`pending` -> `connected`/`failed`), so no
					// optimistic state is written here. Mark `changed` now
					// (before the enable) so the trailing refresh always runs
					// even if the enable rejects.
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

	private _getDesiredMcpServerEnablementByName(): ReadonlyMap<string, boolean> {
		const resolved = resolveCustomizationEnablement(
			this._customizationEnablementService,
			this._ownerSessionUri,
			this._hostCustomizations(),
			undefined,
			undefined,
			this._mcpCustomizations.pluginMcpServerSources,
		);
		const enabledById = getSdkMcpServerEnablement(resolved);
		const candidates = new Map<string, Array<{ readonly server: McpServerCustomization; readonly applied: boolean }>>();
		const result = new Map<string, boolean>();
		for (const customization of resolved.customizations) {
			const servers = customization.type === CustomizationType.McpServer
				? [customization]
				: (customization.children ?? []).filter((child): child is McpServerCustomization => child.type === CustomizationType.McpServer);
			for (const server of servers) {
				const owningPluginSource = this._mcpCustomizations.pluginMcpServerSources?.get(server.name);
				const source = customization.type === CustomizationType.Plugin ? customization.uri : owningPluginSource;
				const applied = source === undefined || this._appliedPluginSources.has(URI.parse(source).toString());
				let namedCandidates = candidates.get(server.name);
				if (!namedCandidates) {
					namedCandidates = [];
					candidates.set(server.name, namedCandidates);
				}
				namedCandidates.push({ server, applied });
			}
		}
		for (const [name, namedCandidates] of candidates) {
			const applicable = namedCandidates.some(candidate => candidate.applied)
				? namedCandidates.filter(candidate => candidate.applied)
				: namedCandidates;
			for (const candidate of applicable) {
				const enabled = enabledById.get(candidate.server.id) ?? false;
				result.set(name, (result.get(name) ?? true) && enabled);
			}
		}
		for (const name of this._launchPlan.disabledRootMcpServers ?? []) {
			result.set(name, false);
		}
		return result;
	}

	private _markMcpLaunchConfigurationDirty(): void {
		if (this._mcpLaunchConfigurationDirty || this._projectedMcpServerLaunchEnablement.size === 0) {
			return;
		}
		const desiredEnablement = this._getDesiredMcpServerEnablementByName();
		for (const [serverName, launchEnabled] of this._projectedMcpServerLaunchEnablement) {
			const desired = desiredEnablement.get(serverName);
			if (launchEnabled !== undefined && desired !== undefined && desired !== launchEnabled) {
				this._mcpLaunchConfigurationDirty = true;
				return;
			}
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
		return this._mcpServerLifecycleSequencer.queue(serverName, async () => {
			await this._wrapper.session.rpc.mcp.stopServer({ serverName });
			this._mcpCustomizations.applyOne({ name: serverName, state: { kind: McpServerStatus.Stopped } });
		});
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

	private async _rejectSamplingRequest(requestId: string): Promise<void> {
		try {
			const result = await this._wrapper.session.rpc.ui.handlePendingSampling({ requestId });
			if (!result.success) {
				this._logService.warn(`[Copilot:${this.sessionId}] Sampling request was no longer pending: requestId=${requestId}`);
			}
		} catch (error) {
			this._logService.error(error, `[Copilot:${this.sessionId}] Failed to reject sampling request: requestId=${requestId}`);
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
		request: PermissionRequest,
	): Promise<PermissionRequestResult> {
		try {
			const toolCallId = request.toolCallId;
			if (!toolCallId) {
				// TODO: handle permission requests without a toolCallId by creating a synthetic tool call
				this._logService.warn(`[Copilot:${this.sessionId}] Permission request without toolCallId, auto-denying: kind=${request.kind}`);
				return { kind: 'reject' };
			}
			if (this._unroutableSubagentToolCallIds.delete(toolCallId)) {
				this._logService.error(`[Copilot:${this.sessionId}] Rejecting permission request for unroutable subagent tool call: toolCallId=${toolCallId}, kind=${request.kind}`);
				return { kind: 'reject' };
			}

			const managedApprovalRequired = request.managedApprovalRequired === true;
			const requestSandboxBypass = request.kind === 'shell' || request.kind === 'write' || request.kind === 'read' || request.kind === 'url'
				? request.requestSandboxBypass
				: undefined;
			const autoApproval = !managedApprovalRequired && this._lastAppliedPermissionMode === 'assisted'
				? await this._takeAutoApproval(toolCallId)
				: undefined;
			const recommendation = autoApproval?.recommendation;
			if (recommendation === 'approve' && !requestSandboxBypass) {
				if (request.kind === 'custom-tool'
					&& typeof request.toolName === 'string'
					&& this._clientToolNames.has(this._clientToolName(request.toolName))
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
							invocationMessage: getInvocationMessage(request.toolName, displayName, parameters, path => this._resolveEditFilePath(path)),
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
				if (!managedApprovalRequired && (request.kind === 'write' || request.kind === 'read') && safeStringify(request) === approvedSignature) {
					this._logService.info(`[Copilot:${this.sessionId}] Auto-approving duplicate ${request.kind} permission request for tool call ${toolCallId}`);
					return { kind: 'approve-once' };
				}
			}

			const sessionResourcePath = this._getInternalSessionResourcePath(request);
			if (!managedApprovalRequired && sessionResourcePath) {
				this._logService.info(`[Copilot:${this.sessionId}] Auto-approving internal session resource ${sessionResourcePath}`);
				return { kind: 'approve-once' };
			}

			// Auto-approve reads of large-tool-output temp files written by the
			// Copilot SDK itself. The SDK spills oversized tool results to
			// `os.tmpdir()/copilot-tool-output-…txt` and then asks the model
			// to read them back in a follow-up turn — no need to confirm.
			if (!managedApprovalRequired && request.kind === 'read' && typeof request.path === 'string') {
				if (isCopilotSdkToolOutputTempFile(request.path, this._environmentService.tmpDir.fsPath)) {
					this._logService.info(`[Copilot:${this.sessionId}] Auto-approving Copilot SDK tool-output temp file ${request.path}`);
					return { kind: 'approve-once' };
				}
			}

			const serverToolHost = this._serverToolHost;
			const serverToolName = request.kind === 'custom-tool' && typeof request.toolName === 'string'
				&& serverToolHost?.toolNames.includes(request.toolName)
				? request.toolName
				: undefined;
			if (serverToolHost && serverToolName) {
				const canRequireConfirmation = serverToolHost.canRequireConfirmation(serverToolName);
				// A tool that normally confirms but has nothing to confirm right
				// now poses no question to the user, so it runs without prompting
				// even under managed approval.
				if (canRequireConfirmation
					&& !serverToolHost.requiresConfirmation(this._chatChannelUri.toString(), serverToolName)
				) {
					this._logService.info(`[Copilot:${this.sessionId}] Auto-approving server tool ${serverToolName} because it has nothing to confirm`);
					return { kind: 'approve-once' };
				}
				// Server tools that never confirm only read or mutate the
				// session's own server-held state and never touch the workspace,
				// shell, or network, so prompting for them is redundant noise.
				if (!canRequireConfirmation && !managedApprovalRequired) {
					this._logService.info(`[Copilot:${this.sessionId}] Auto-approving server tool ${serverToolName}`);
					return { kind: 'approve-once' };
				}
			}

			// The SDK's built-in terminal reports `kind: 'shell'`. The Agent Host's
			// terminal override is registered as an SDK custom tool named `bash` or
			// `powershell`, so it reports `kind: 'custom-tool'` instead.
			const customShellToolName = request.kind === 'custom-tool'
				&& typeof request.toolName === 'string'
				&& isShellTool(request.toolName)
				? request.toolName
				: undefined;
			const isShellRequest = request.kind === 'shell' || customShellToolName !== undefined;
			const trackedToolName = this._activeToolCalls.get(toolCallId)?.toolName;
			const shellToolName = request.kind === 'shell'
				? trackedToolName
				: customShellToolName;
			// Only emit a language when the executing shell tool is known.
			// Missing language fails closed in SessionPermissionManager.
			const shellLanguage: IAgentToolPendingConfirmationSignal['shellLanguage'] =
				isShellRequest && (shellToolName === 'bash' || shellToolName === 'powershell')
					? shellToolName
					: undefined;
			if (isShellRequest && shellLanguage === undefined) {
				this._logService.warn(`[Copilot:${this.sessionId}] Shell permission request has no recognized shell tool name; requiring confirmation: toolCallId=${toolCallId}, toolName=${shellToolName ?? '(missing)'}`);
			}

			if (!managedApprovalRequired && request.kind === 'custom-tool'
				&& typeof request.toolName === 'string'
				&& this._clientToolNames.has(this._clientToolName(request.toolName))
				&& this._pendingClientToolCalls.hasBufferedResult(toolCallId)
			) {
				this._logService.info(`[Copilot:${this.sessionId}] Auto-approving client tool ${request.toolName} because its result arrived before the permission request`);
				return { kind: 'approve-once' };
			}

			this._logService.info(`[Copilot:${this.sessionId}] Requesting confirmation for tool call: ${toolCallId}`);

			const pendingPermission = this._pendingPermissions.register(toolCallId, { managedApprovalRequired });

			// Auto-approve shell commands that run sandboxed by default, since the
			// sandbox already contains them. Commands that opted OUT of the sandbox
			// (`requestSandboxBypass`) are an elevation of privilege and must
			// fall through to the normal confirmation flow — otherwise enabling
			// `sandbox.allowBypass` would let the model escape the sandbox with no
			// prompt at all. A file-scoped surface (editor inline chat) is
			// likewise excluded: the sandbox contains a command to the workspace,
			// not to that surface's one file, so it can still edit other files.
			if (!managedApprovalRequired && !this._launchPlan.hasScopedEditSurface && isShellRequest && !requestSandboxBypass && await this._isShellSandboxedByDefault()) {
				// Session may have been disposed while we awaited the engine
				// check; if so the deferred has already been settled and
				// removed, so leave it alone.
				if (this._pendingPermissions.has(toolCallId)) {
					this._pendingPermissions.respond(toolCallId, { kind: 'approve-once' });
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
			const { confirmationTitle, invocationMessage, toolInput, permissionKind, permissionPath } = getPermissionDisplay(request, this._workingDirectory, isNewFile, this._appliedAdditionalDirectories);

			// Fire a pending_confirmation signal to transition the tool to PendingConfirmation
			const toolName = request.kind === 'mcp' || request.kind === 'custom-tool' || request.kind === 'hook'
				? request.toolName ?? request.kind
				: request.kind;
			// Forward the tool's parentToolCallId (if any) so the host can
			// route the resulting ChatToolCallReady to the correct
			// subagent session — without it the action would land on the
			// parent session, which has no matching ChatToolCallStart.
			const trackedToolCall = this._activeToolCalls.get(toolCallId);
			const parentToolCallId = trackedToolCall?.parentToolCallId;
			this._onDidSessionProgress.fire({
				kind: 'pending_confirmation',
				chat: this._chatChannelUri,
				state: {
					status: ToolCallStatus.PendingConfirmation,
					toolCallId,
					toolName,
					displayName: getToolDisplayName(toolName),
					contributor: trackedToolCall?.contributor,
					intention: trackedToolCall?.intention,
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
				managedApprovalRequired,
				requestSandboxBypass,
				shellLanguage,
				parentToolCallId,
			});

			const result = await pendingPermission;
			this._logService.info(`[Copilot:${this.sessionId}] Permission response: toolCallId=${toolCallId}, result=${result.kind}`);
			if (!managedApprovalRequired && result.kind === 'approve-once' && (request.kind === 'write' || request.kind === 'read')) {
				this._approvedDuplicablePermissionSignatures.set(toolCallId, safeStringify(request));
			}
			return result;
		} catch (error) {
			this._logService.error(error, `[Copilot:${this.sessionId}] Failed to handle permission request: kind=${request.kind}, toolCallId=${request.toolCallId ?? 'missing'}`);
			throw error;
		}
	}

	private _getInternalSessionResourcePath(request: PermissionRequest): string | undefined {
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
	private _computeSdkSandboxConfig(): SandboxConfig | undefined {
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
		return this._configurationService.getEffectiveValue(this._ownerSessionUri.toString(), platformSessionSchema, SessionConfigKey.AutoApprove) === 'autoApprove';
	}

	private _getSdkPermissionMode(): PermissionMode {
		if (this._isBypassApprovals()) {
			return 'allow-all';
		}
		return this._getConfiguredApprovalLevel() === 'assisted'
			? 'assisted'
			: 'manual';
	}

	private _getConfiguredApprovalLevel(): string {
		return this._configurationService.getEffectiveValue(this._ownerSessionUri.toString(), platformSessionSchema, SessionConfigKey.AutoApprove) ?? 'default';
	}

	private _getConfiguredAgentMode(): string {
		return this._configurationService.getEffectiveValue(this._ownerSessionUri.toString(), platformSessionSchema, SessionConfigKey.Mode) ?? 'interactive';
	}

	private _subscribeToPermissionConfigChanges(): void {
		this._register(this._configurationService.onDidRootConfigChange(() => {
			void this._syncPermissionModeAfterConfigChange();
		}));
		this._register(this._configurationService.onDidSessionConfigChange(event => {
			if (event.session === this._ownerSessionUri.toString() && Object.hasOwn(event.config, SessionConfigKey.AutoApprove)) {
				void this._syncPermissionModeAfterConfigChange();
			}
		}));
	}

	private async _syncPermissionModeAfterConfigChange(): Promise<void> {
		if (!this.hasActiveTurn) {
			return;
		}
		try {
			await this.syncPermissionMode('config-change');
			await this._applyEffectiveSandboxConfig(true);
		} catch (error) {
			this._logService.error(error, `[Copilot:${this.sessionId}] Failed to apply permission config change; aborting active turn`);
			try {
				await this.abort();
			} catch (abortError) {
				this._logService.error(abortError, `[Copilot:${this.sessionId}] Failed to abort after permission config sync failure`);
			}
		}
	}

	private async _takeAutoApproval(toolCallId: string): Promise<PermissionAssistedApproval | undefined> {
		if (this._autoApprovals.has(toolCallId)) {
			const autoApproval = this._autoApprovals.get(toolCallId) ?? undefined;
			this._autoApprovals.delete(toolCallId);
			return autoApproval;
		}
		return this._pendingAutoApprovals.register(toolCallId);
	}

	private _recordAutoApproval(toolCallId: string, autoApproval: PermissionAssistedApproval | undefined): void {
		if (this._pendingAutoApprovals.respond(toolCallId, autoApproval)) {
			return;
		}
		this._autoApprovals.set(toolCallId, autoApproval ?? null);
	}

	syncPermissionMode(source: 'config-change' | 'turn-start'): Promise<void> {
		return this._permissionModeSequencer.queue(async () => {
			const mode = this._getSdkPermissionMode();
			const configuredLevel = this._getConfiguredApprovalLevel();
			this._logService.info(`[Copilot:${this.sessionId}] Syncing permission mode: source=${source}, agentMode=${this._getConfiguredAgentMode()}, configuredLevel=${configuredLevel}, sdkMode=${mode}, previousSdkMode=${this._lastAppliedPermissionMode ?? 'unknown'}, globalAutoApprove=${this._configurationService.getRootValue(platformRootSchema, AgentHostGlobalAutoApproveEnabledConfigKey) === true}`);
			const experimentalModeEnabled = mode === 'assisted';
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
			const result = await this._wrapper.session.rpc.permissions.setMode({ mode });
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
	 * built-in shell is unused). Otherwise it always pushes the effective state.
	 */
	private async _applyEffectiveSandboxConfig(failOnError = false): Promise<void> {
		if (this._isCustomTerminalToolEnabled()) {
			return;
		}
		const sandbox = this._configurationService.getRootValue(sandboxConfigSchema, AgentHostSandboxConfigKey.Sandbox);
		const base = buildSandboxConfigForSdk(this._platform, sandbox);
		const sandboxConfig: SandboxConfig = base ?? { enabled: false };
		try {
			const result = await this._wrapper.session.rpc.options.update({ sandboxConfig });
			if (!result.success) {
				throw new Error('Copilot SDK rejected sandbox config update');
			}
		} catch (err) {
			if (failOnError) {
				throw err;
			}
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
	private async _buildEditsForPermission(request: PermissionRequest, toolCallId: string): Promise<{ items: FileEdit[] } | undefined> {
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
		if (this._pendingPermissions.respond(requestId, approved ? { kind: 'approve-once' } : USER_DENIED_PERMISSION_RESULT)) {
			this._deletePendingEditContent(requestId);
			return true;
		}
		return false;
	}

	private async _requestUnsandboxedCommandConfirmation(request: IUnsandboxedCommandConfirmationRequest): Promise<boolean> {
		const pendingPermission = this._pendingPermissions.register(request.toolCallId, { managedApprovalRequired: false });

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

		return (await pendingPermission).kind === 'approve-once';
	}

	// ---- user input handling ------------------------------------------------

	/**
	 * Handles a user input request from the SDK (ask_user tool). Auto-answers when the user is unavailable; otherwise waits for the renderer to respond via {@link respondToUserInputRequest}.
	 */
	private async _handleUserInputRequest(
		request: UserInputRequest,
		_invocation: { sessionId: string },
	): Promise<UserInputResponse> {
		const requestId = generateUuid();
		const questionId = generateUuid();
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

		const isAutopilot = this._isAutopilotMode();
		if (isAutopilot || this._isAutoReplyEnabled()) {
			this._emitAction({
				type: ActionType.ChatInputRequested,
				request: inputRequest,
			});
			this._emitAction({
				type: ActionType.ChatInputCompleted,
				requestId,
				response: ChatInputResponseKind.Accept,
				answers: {
					[questionId]: {
						state: ChatInputAnswerState.Submitted,
						value: {
							kind: ChatInputAnswerValueKind.Text,
							value: AgentHostAutoReplyAnswer,
						},
					},
				},
			});
			return {
				answer: AgentHostAutoReplyAnswer,
				wasFreeform: true,
			};
		}
		if (!this.hasActiveTurn) {
			this._logService.warn(`[Copilot:${this.sessionId}] Rejecting user input request without an active turn`);
			return { answer: 'No active turn', wasFreeform: true };
		}

		const questionPreview = request.question.substring(0, 100);
		try {
			this._logService.info(`[Copilot:${this.sessionId}] User input request: requestId=${requestId}, question="${questionPreview}"`);

			const pendingInput = this._pendingUserInputs.register(requestId, { questionId });

			this._emitAction({
				type: ActionType.ChatInputRequested,
				request: withChatInputRequestPurpose(inputRequest, ChatInputRequestPurpose.AskUser),
			});

			const result = await pendingInput;
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

			const pendingElicitation = this._pendingElicitations.register(requestId, { schema });

			const inputRequest = withChatInputRequestPurpose<ChatInputRequest>({
				id: requestId,
				message: context.message,
				...(context.mode === 'url' && context.url ? { url: context.url } : {}),
				...(questions && questions.length > 0 ? { questions } : {}),
			}, ChatInputRequestPurpose.Elicitation);

			this._emitAction({
				type: ActionType.ChatInputRequested,
				request: inputRequest,
			});

			const result = await pendingElicitation;
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
		const pendingPlanReview = this._pendingPlanReviews.getMetadata(requestId);
		if (pendingPlanReview) {
			return this._pendingPlanReviews.respond(requestId, this._resolveExitPlanMode(pendingPlanReview, response, answers));
		}

		if (this._pendingElicitations.respond(requestId, { response, answers })) {
			return true;
		}

		if (this._pendingUserInputs.respond(requestId, { response, answers })) {
			return true;
		}
		return false;
	}

	/**
	 * Maps an `exit_plan_mode` input response back to an
	 * {@link CopilotExitPlanModeResponse} that the CLI can feed into
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
	): CopilotExitPlanModeResponse {
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
				const mode = this._getConfiguredAgentMode();
				await Promise.all(filePaths.map(p => this._editTracker.trackEditStart(p, mode)));
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

	private async _beginRepoInfoTelemetry(telemetryMessageId: string, clientType: AgentHostClientType, isCurrent: () => boolean): Promise<{ readonly context: IAgentHostRestrictedTelemetryContext; readonly baseBranch: string | undefined } | undefined> {
		let resolved: { readonly context: IAgentHostRestrictedTelemetryContext; readonly baseBranch: string | undefined } | undefined;
		try {
			resolved = await this._resolveRepoInfoTelemetryContext();
		} catch (error) {
			this._logService.warn(`[Copilot:${this.sessionId}] Failed to resolve repository info telemetry context: ${getErrorMessage(error)}`);
			return undefined;
		}
		if (!resolved || this._store.isDisposed || !isCurrent()) {
			return undefined;
		}
		await this._repoInfoTelemetry.reportBegin(resolved.context, this.resourceUri.toString(), telemetryMessageId, clientType, this._workingDirectory, resolved.baseBranch, isCurrent, paths => this._wrapper.session.rpc.contentExclusion.checkPaths({ paths: [...paths] }));
		return resolved;
	}

	private async _endRepoInfoTelemetry(telemetryMessageId: string, resolved: { readonly context: IAgentHostRestrictedTelemetryContext; readonly baseBranch: string | undefined } | undefined, isCurrent: () => boolean): Promise<void> {
		if (!resolved || this._store.isDisposed || !isCurrent()) {
			return;
		}
		await this._repoInfoTelemetry.reportEnd(resolved.context, this.resourceUri.toString(), telemetryMessageId, this._workingDirectory, resolved.baseBranch, isCurrent, paths => this._wrapper.session.rpc.contentExclusion.checkPaths({ paths: [...paths] }));
	}

	private _completeActiveRepoInfoTelemetry(): void {
		const turn = this._activeRepoInfoTurn;
		if (!turn) {
			return;
		}
		this._activeRepoInfoTurn = undefined;
		const isCurrent = () => !turn.cancelled && this._isLaunchTokenCurrent();
		void turn.begin.then(resolved => this._endRepoInfoTelemetry(turn.telemetryMessageId, resolved, isCurrent));
	}

	private _cancelActiveRepoInfoTelemetry(): void {
		const turn = this._activeRepoInfoTurn;
		if (!turn) {
			return;
		}
		this._activeRepoInfoTurn = undefined;
		turn.cancelled = true;
		void turn.begin.finally(() => this._repoInfoTelemetry.clearTurn(turn.telemetryMessageId));
	}

	private async _resolveRepoInfoTelemetryContext(): Promise<{ readonly context: IAgentHostRestrictedTelemetryContext; readonly baseBranch: string | undefined } | undefined> {
		if (this._configurationService.getRootValue(platformRootSchema, AgentHostDisableRepoInfoTelemetryConfigKey) === true) {
			return undefined;
		}
		const githubToken = this._launchPlan.githubToken;
		if (!githubToken) {
			return undefined;
		}
		const [rawContext, baseBranch] = await Promise.all([
			this._copilotApiService.resolveRestrictedTelemetryContext(githubToken),
			this._databaseRef.object.getMetadata(META_DIFF_BASE_BRANCH),
		]);
		if (!rawContext.restrictedTelemetryEnabled && !rawContext.isInternal) {
			return undefined;
		}
		return { context: this._toRepoInfoTelemetryContext(rawContext), baseBranch };
	}

	private _isLaunchTokenCurrent(): boolean {
		return this._launchPlan.githubToken !== undefined && this._isLaunchTokenStillCurrent();
	}

	private _toRepoInfoTelemetryContext(context: IRestrictedTelemetryContext): IAgentHostRestrictedTelemetryContext {
		return {
			restrictedTelemetryEnabled: context.restrictedTelemetryEnabled,
			trackingId: context.trackingId,
			telemetryEndpoint: context.telemetryEndpoint ? `${context.telemetryEndpoint.replace(/\/+$/, '')}/telemetry` : undefined,
			isInternal: context.isInternal === true,
			userName: context.userName,
			isVscodeTeamMember: context.isVscodeTeamMember === true,
			copilotIgnoreEnabled: context.copilotIgnoreEnabled,
		};
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

			// A turn-starting notification is an authoritative new root boundary,
			// even though it completes without an assistant.turn_start event.
			this._dropLateRootTurnEvents = false;
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
			if (e.agentId) {
				this._resumeSubagentForEvent(e, { text: e.data.content, origin: { kind: MessageKind.User } });
				return;
			}
			if (e.data.source && e.data.source.toLowerCase() !== 'user') {
				return;
			}
			// A genuine root user-message echo is the provider boundary for a
			// normal send. Zero-message continuation has no such echo and remains
			// quarantined until assistant.turn_start instead.
			this._dropLateRootTurnEvents = false;
			// First SDK event for the loop: promote the turn out of `pending`.
			this._currentTurn.value?.markRunning();
			const steering = this._takeMatchingPendingSteering(e.data.content);
			if (steering) {
				this._beginSteeringTurn(steering);
			}
			if (this._turnId) {
				this._databaseRef.object.setTurnEventId(this._turnId, e.id);
				this._currentTurn.value?.completeEventId(e.id);
			}
		}));

		this._register(wrapper.onMessageDelta(e => {
			this._logService.trace(`[Copilot:${sessionId}] delta: ${e.data.deltaContent}`);
			this._resumeSubagentForEvent(e);
			if (this._shouldDropUnmappedSubagentEvent(e, 'assistant.message_delta')) {
				return;
			}
			this._emitMarkdownDelta(e.data.deltaContent, this._parentToolCallIdForSubagentEvent(e));
		}));

		this._register(wrapper.onMessage(e => {
			this._logService.info(`[Copilot:${sessionId}] Full message received: ${e.data.content.length} chars`);
			this._resumeSubagentForEvent(e);
			if (!e.agentId && this._shouldDropLateRootTurnEvent('assistant.message')) {
				return;
			}
			const stableModelCallId = e.data.apiCallId ?? e.data.clientRequestId;
			const isCompleteModelCall = stableModelCallId !== undefined
				|| e.data.chunkCount === undefined
				|| e.data.chunkCount <= 1
				|| e.data.chunkIndex === e.data.chunkCount - 1;
			const modelCallId = stableModelCallId ?? e.data.messageId;
			const parentToolCallId = this._parentToolCallIdForSubagentEvent(e);
			if (isCompleteModelCall && (!e.agentId || parentToolCallId)) {
				this._emitModelCallCompleted(this._turnId, modelCallId, parentToolCallId);
			}
			// Report the enhanced GH `request.options.tools` event for this model call — parity with
			// the Copilot extension, which emits it per LLM request. `assistant.message` is the
			// agent-host's per-model-call boundary; we correlate on its client-minted `x-request-id`.
			// Main agent only: `_appliedSnapshot.tools` is the session's tool set, which does not
			// describe a subagent's model call, so subagent messages (mapped or dropped) are skipped.
			if (!e.agentId) {
				const clientType = this._currentTurn.value?.clientType ?? AgentHostClientType.Unknown;
				void this._telemetryReporter.assistantMessageReceived(this.resourceUri.toString(), clientType, e.data.clientRequestId, this._appliedSnapshot.tools).catch(err => this._logService.trace(`[Copilot:${this.sessionId}] Telemetry emission failed: ${getErrorMessage(err)}`));
				// Restricted `conversation.messageText` (source=model): the model's raw response text.
				void this._telemetryReporter.modelMessageText(this.resourceUri.toString(), clientType, e.data.content, this._turnOrdinal, e.data.clientRequestId).catch(err => this._logService.trace(`[Copilot:${this.sessionId}] Telemetry emission failed: ${getErrorMessage(err)}`));
				// Accumulate the per-turn tool-call aggregate for the restricted `toolCallDetails` event.
				// Every main-agent `assistant.message` is one model-call round (matches the extension's
				// `numRequests = toolCallRounds.length`, which counts the final tool-free response round
				// too); the tool-count stats only apply to rounds that carried tool requests.
				const turn = this._currentTurn.value;
				if (turn) {
					if (isCompleteModelCall && !turn.mainModelCallIds.has(modelCallId)) {
						turn.mainModelCallIds.add(modelCallId);
						turn.toolCallRounds++;
					}
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
			if (this._shouldDropUnmappedSubagentEvent(e, 'assistant.message')) {
				return;
			}
			const markdownScope = parentToolCallId ?? '';
			if (e.data.content && !this._currentTurn.value?.markdownPartIds.has(markdownScope)) {
				const partId = generateUuid();
				this._currentTurn.value?.markdownPartIds.set(markdownScope, partId);
				this._emitAction({
					type: ActionType.ChatResponsePart,
					turnId: this._turnId,
					part: { kind: ResponsePartKind.Markdown, id: partId, content: e.data.content },
				}, parentToolCallId);
			}
			if (e.data.toolRequests?.length) {
				// Wait for the full message boundary; clearing on an earlier tool delta would duplicate assembled markdown.
				this._beginToolCallRound(parentToolCallId);
			}
		}));

		this._register(wrapper.onSamplingRequested(e => {
			void this._rejectSamplingRequest(e.data.requestId);
		}));

		// TODO@connor4312: Remove this correlation once the SDK permission callback includes auto-approval data.
		this._register(wrapper.onPermissionRequested(e => {
			const toolCallId = e.data.permissionRequest.toolCallId;
			if (!toolCallId) {
				return;
			}
			this._recordAutoApproval(toolCallId, e.data.promptRequest?.assistedApproval);
			const existing = this._toolApprovalRecords.get(toolCallId);
			const permissionRequest = e.data.permissionRequest as { requestSandboxBypass?: boolean; toolName?: string };
			this._toolApprovalRecords.set(toolCallId, {
				permissionRequested: true,
				resolvedByHook: existing?.resolvedByHook || e.data.resolvedByHook === true,
				requestSandboxBypass: existing?.requestSandboxBypass || permissionRequest.requestSandboxBypass === true,
				resultKind: existing?.resultKind,
				toolName: existing?.toolName ?? permissionRequest.toolName,
				mcpServerName: existing?.mcpServerName,
				reported: existing?.reported ?? false,
			});
		}));

		this._register(wrapper.onPermissionCompleted(e => {
			const toolCallId = e.data.toolCallId;
			if (!toolCallId) {
				return;
			}
			const existing = this._toolApprovalRecords.get(toolCallId);
			const record = {
				permissionRequested: existing?.permissionRequested ?? true,
				resolvedByHook: existing?.resolvedByHook ?? false,
				requestSandboxBypass: existing?.requestSandboxBypass ?? false,
				resultKind: e.data.result.kind,
				toolName: existing?.toolName,
				mcpServerName: existing?.mcpServerName,
				reported: existing?.reported ?? false,
			};
			this._toolApprovalRecords.set(toolCallId, record);
			this._reportToolApproval(toolCallId, record.toolName, record.mcpServerName);
			if (isPermissionDeniedKind(record.resultKind)) {
				this._toolApprovalRecords.delete(toolCallId);
			}
		}));

		this._register(wrapper.onToolCallDelta(e => {
			this._logService.trace(`[Copilot:${sessionId}] Tool call delta: ${e.data.toolName ?? '<pending>'} (${e.data.toolCallId})`);
			this._resumeSubagentForEvent(e);
			if (!e.agentId && this._shouldDropLateRootTurnEvent('assistant.tool_call_delta')) {
				return;
			}
			if (this._shouldDropUnmappedSubagentEvent(e, 'assistant.tool_call_delta')) {
				return;
			}

			const existing = this._streamingToolCalls.get(e.data.toolCallId);
			const streaming = existing ?? {
				input: '',
				toolName: undefined,
				parentToolCallId: undefined,
				started: false,
				displayedInputLength: 0,
				displayedMessage: undefined,
			};
			streaming.input += e.data.inputDelta;
			if (e.data.toolName) {
				if (streaming.toolName && streaming.toolName !== e.data.toolName) {
					this._logService.warn(`[Copilot:${sessionId}] Tool call ${e.data.toolCallId} changed name while streaming from ${streaming.toolName} to ${e.data.toolName}`);
				} else {
					streaming.toolName = e.data.toolName;
				}
			}
			this._streamingToolCalls.set(e.data.toolCallId, streaming);

			const toolName = streaming.toolName;
			if (!toolName || isHiddenTool(toolName) || isTaskCompleteTool(toolName) || this._clientToolNames.has(this._clientToolName(toolName))) {
				return;
			}
			if (!streaming.started) {
				streaming.parentToolCallId = this._parentToolCallIdForSubagentEvent(e);
			}

			if (!streaming.started) {
				streaming.started = true;
				this._emitAction({
					type: ActionType.ChatToolCallStart,
					turnId: this._turnId,
					toolCallId: e.data.toolCallId,
					toolName,
					displayName: getToolDisplayName(toolName),
					contributor: this._getToolCallContributor(toolName, undefined),
					_meta: toToolCallMeta(this._createToolCallMeta(toolName, undefined)),
				}, streaming.parentToolCallId);
				this._emitStreamingToolCallDisplay(e.data.toolCallId, streaming);
				return;
			}
			this._scheduleStreamingToolCallDisplay(e.data.toolCallId);
		}));

		this._register(wrapper.onToolStart(e => {
			if (!e.agentId && this._shouldDropLateRootTurnEvent('tool.execution_start')) {
				return;
			}
			if (isHiddenTool(e.data.toolName)) {
				this._streamingToolDisplaySchedulers.deleteAndDispose(e.data.toolCallId);
				this._streamingToolCalls.delete(e.data.toolCallId);
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
			const streamed = this._streamingToolCalls.get(e.data.toolCallId);
			this._streamingToolDisplaySchedulers.deleteAndDispose(e.data.toolCallId);
			if (streamed?.started && streamed.displayedInputLength < streamed.input.length) {
				this._emitStreamingToolCallDisplay(e.data.toolCallId, streamed);
			}
			this._streamingToolCalls.delete(e.data.toolCallId);
			if (streamed?.toolName && streamed.toolName !== e.data.toolName) {
				this._logService.warn(`[Copilot:${sessionId}] Tool call ${e.data.toolCallId} started as ${e.data.toolName} after streaming as ${streamed.toolName}`);
			}
			this._resumeSubagentForEvent(e);
			if (!streamed?.started && this._shouldDropUnmappedSubagentEvent(e, 'tool.execution_start')) {
				this._unroutableSubagentToolCallIds.add(e.data.toolCallId);
				return;
			}
			const parentToolCallId = streamed?.parentToolCallId ?? this._parentToolCallIdForSubagentEvent(e);
			const clientToolName = this._clientToolName(e.data.toolName);
			const isClientTool = this._clientToolNames.has(clientToolName);
			const isToolSearch = this._isToolSearchActive() && e.data.toolName === RUNTIME_TOOL_SEARCH_TOOL_NAME;
			const contributor = this._getToolCallContributor(e.data.toolName, e.data.mcpServerName);
			const intention = getShellIntention(e.data.toolName, parameters);
			this._activeToolCalls.set(e.data.toolCallId, {
				toolName: e.data.toolName,
				displayName,
				parameters,
				content: [],
				parentToolCallId,
				mcpServerName: e.data.mcpServerName,
				contributor,
				intention,
				meta: undefined,
			});
			const existingApproval = this._toolApprovalRecords.get(e.data.toolCallId);
			const approvalRecord = {
				permissionRequested: existingApproval?.permissionRequested ?? false,
				resolvedByHook: existingApproval?.resolvedByHook ?? false,
				requestSandboxBypass: existingApproval?.requestSandboxBypass ?? false,
				resultKind: existingApproval?.resultKind,
				toolName: e.data.toolName,
				mcpServerName: e.data.mcpServerName,
				reported: existingApproval?.reported ?? false,
			};
			this._toolApprovalRecords.set(e.data.toolCallId, approvalRecord);
			if (approvalRecord.resultKind !== undefined) {
				this._reportToolApproval(e.data.toolCallId, e.data.toolName, e.data.mcpServerName);
			}
			if (isShellTool(e.data.toolName)) {
				this._nonPtyShellTerminals.track(e.data.toolCallId, displayName);
			}
			if (isTaskCompleteTool(e.data.toolName)) {
				this._beginToolCallRound(parentToolCallId);
				return;
			}

			if (!streamed?.started) {
				this._beginToolCallRound(parentToolCallId);
			}

			const meta = this._createToolCallMeta(e.data.toolName, parameters);
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

			if (!streamed?.started) {
				this._emitAction({
					type: ActionType.ChatToolCallStart,
					turnId: this._turnId,
					toolCallId: e.data.toolCallId,
					toolName: e.data.toolName,
					displayName,
					intention,
					contributor,
					_meta: toToolCallMeta(meta),
				}, parentToolCallId);
			}

			// No client is connected to run this client tool. Fail it
			// immediately instead of leaving it pending until the
			// server-side disconnect timeout fires. We emit the completion
			// ourselves and drop the active-tool entry so the SDK's own
			// tool.execution_complete for this id is suppressed.
			if (isClientTool && !contributor) {
				this._logService.warn(`[Copilot:${sessionId}] Client tool '${e.data.toolName}' started with no connected client; failing it immediately.`);
				this._reportToolApprovalIfNoPermission(e.data.toolCallId);
				this._toolApprovalRecords.delete(e.data.toolCallId);
				this._activeToolCalls.delete(e.data.toolCallId);
				this._emitAction({
					type: ActionType.ChatToolCallReady,
					turnId: this._turnId,
					toolCallId: e.data.toolCallId,
					...(contributor ? { contributor } : {}),
					...(intention !== undefined ? { intention } : {}),
					invocationMessage: getInvocationMessage(e.data.toolName, displayName, parameters, path => this._resolveEditFilePath(path)),
					toolInput: getToolInputString(e.data.toolName, parameters, toolArgs),
					confirmed: ToolCallConfirmationReason.NotNeeded,
					_meta: toToolCallMeta(meta),
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

			const clientToolAutoApproved = contributor?.kind === ToolCallContributorKind.Client && this._lastAppliedPermissionMode === 'allow-all';
			if (isToolSearch && clientToolAutoApproved) {
				meta.autoApproveBySetting = true;
			}
			const sdkPolicy = getClientToolSdkPolicy(e.data.toolName);
			const shouldWaitForClientToolReady = contributor?.kind === ToolCallContributorKind.Client
				&& !isAgentCoordinationTool(e.data.toolName)
				&& (isToolSearch || (!sdkPolicy.skipPermission && !clientToolAutoApproved));
			if (shouldWaitForClientToolReady) {
				return;
			}

			this._emitAction({
				type: ActionType.ChatToolCallReady,
				turnId: this._turnId,
				toolCallId: e.data.toolCallId,
				...(contributor ? { contributor } : {}),
				...(intention !== undefined ? { intention } : {}),
				invocationMessage: getInvocationMessage(e.data.toolName, displayName, parameters, path => this._resolveEditFilePath(path)),
				toolInput: getToolInputString(e.data.toolName, parameters, toolArgs),
				confirmed: ToolCallConfirmationReason.NotNeeded,
				_meta: toToolCallMeta(clientToolAutoApproved ? { ...meta, autoApproveBySetting: true } : meta),
			}, parentToolCallId);
		}));

		this._register(wrapper.onToolComplete(async e => {
			this._approvedDuplicablePermissionSignatures.delete(e.data.toolCallId);
			const tracked = this._activeToolCalls.get(e.data.toolCallId);
			if (!tracked) {
				this._unroutableSubagentToolCallIds.delete(e.data.toolCallId);
				return;
			}
			const parentToolCallId = tracked.parentToolCallId ?? this._parentToolCallIdForSubagentEvent(e);
			if (!parentToolCallId && e.agentId) {
				this._logService.warn(`[Copilot:${this.sessionId}] Dropping tool.execution_complete for unknown subagent agentId=${e.agentId}`);
				return;
			}
			if (e.data.success && tracked.contributor === undefined) {
				const telemetrySession = parentToolCallId
					? URI.parse(buildSubagentSessionUri(this._storageUri.toString(), parentToolCallId))
					: this.resourceUri;
				reportCopilotTodoStoreOperation(this._telemetryService, telemetrySession, e.data.toolCallId, tracked.toolName, tracked.parameters, this._currentTurn.value?.clientContext);
			}
			this._logService.info(`[Copilot:${sessionId}] Tool completed: ${e.data.toolCallId}`);
			this._reportToolApprovalIfNoPermission(e.data.toolCallId);
			this._activeToolCalls.delete(e.data.toolCallId);
			this._autoApprovals.delete(e.data.toolCallId);
			this._toolApprovalRecords.delete(e.data.toolCallId);
			this._pendingAutoApprovals.respond(e.data.toolCallId, undefined);
			if (!parentToolCallId && !e.agentId && this._shouldDropLateRootTurnEvent('tool.execution_complete')) {
				return;
			}
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

			// Attach the pty terminal reference for shell tools before folding in
			// SDK result content, so a `shell_exit` lands its completion data on
			// the terminal block (skip if any terminal block was already added
			// while the tool was running).
			const isShellCommandTool = isShellTool(tracked.toolName);
			const ptyTerminalUri = isShellCommandTool ? this._shellManager?.getTerminalUriForToolCall(e.data.toolCallId) : undefined;
			let retireNonPtyShellTracking = !!ptyTerminalUri;
			if (ptyTerminalUri && !content.some(c => c.type === ToolResultContentType.Terminal)) {
				content.push({
					type: ToolResultContentType.Terminal,
					resource: ptyTerminalUri,
					title: tracked.displayName,
				});
			}

			const shellExit = appendSdkToolResultContent(
				content,
				e.data.result?.contents,
				isShellCommandTool ? { session: this.resourceUri, toolCallId: e.data.toolCallId, title: tracked.displayName } : undefined,
			);
			if (isShellCommandTool && !ptyTerminalUri) {
				const completion = this._nonPtyShellTerminals.completeToolCall(e.data.toolCallId, toolOutput, shellExit);
				if (completion) {
					retireNonPtyShellTracking = completion.shouldRetire;
					const terminalIndex = content.findIndex(c => c.type === ToolResultContentType.Terminal);
					if (terminalIndex === -1) {
						content.push({
							type: ToolResultContentType.Terminal,
							resource: completion.uri,
							title: tracked.displayName,
							isPty: false,
							...(completion.result ? { result: completion.result } : {}),
						});
					} else if (completion.result) {
						const terminalBlock = content[terminalIndex] as ToolResultTerminalContent;
						content[terminalIndex] = { ...terminalBlock, result: completion.result };
					}
				}
			}

			const command = isString(tracked.parameters?.command) ? tracked.parameters.command : undefined;
			const filePaths = isEditTool(tracked.toolName, command) ? this._getEditFilePaths(tracked.parameters) : [];
			for (const filePath of filePaths) {
				try {
					const fileEdit = await this._editTracker.takeCompletedEdit(this._turnId, e.data.toolCallId, filePath, tracked.toolName, tracked.parameters, this._lastSeenModelId, this._currentTurn.value?.clientContext);
					if (fileEdit) {
						content.push(fileEdit);
					}
				} catch (err) {
					this._logService.warn(`[Copilot:${sessionId}] Failed to take completed edit`, err);
				}
			}

			this._emitAction({
				type: ActionType.ChatToolCallComplete,
				turnId: this._turnId,
				toolCallId: e.data.toolCallId,
				result: {
					success: e.data.success,
					pastTenseMessage: getPastTenseMessage(tracked.toolName, displayName, tracked.parameters, e.data.success, e.data.success ? toolOutput : undefined, path => this._resolveEditFilePath(path)),
					content: content.length > 0 ? content : undefined,
					error: e.data.error,
				},
				_meta: tracked.meta ? toToolCallMeta(tracked.meta) : undefined,
			}, parentToolCallId);
			if (retireNonPtyShellTracking) {
				// Preserve the terminal result in chat state before removing its
				// now-redundant live output resource from the host.
				this._nonPtyShellTerminals.retire(e.data.toolCallId);
			}
		}));

		this._register(wrapper.onIdle(e => {
			this._logService.info(`[Copilot:${sessionId}] Session idle`);
			if (e.data.aborted) {
				this._resetAbortToken();
			}
			if (this._hasActivity) {
				this._hasActivity = false;
				this._emitAction({
					type: ActionType.SessionActivityChanged,
					activity: undefined,
				});
			}
			const turn = this._currentTurn.value;
			if (!turn) {
				return;
			}
			// An abort drives the loop to idle. That terminal idle must never
			// complete a turn:
			//  - if `turn` is the aborted (running) turn, the client-dispatched
			//    `ChatTurnCancelled` finalizes the protocol turn; drop our handle
			//    so a later idle can't complete it.
			//  - if `turn` is the pending failed-turn continuation being aborted,
			//    drop it before the provider starts.
			//  - any other pending turn is a queued message started after the
			//    abort; leave it open for its own non-abort idle.
			if (e.data.aborted) {
				this._cancelActiveRepoInfoTelemetry();
				if (turn.isRunning || turn === this._resumingTurnAwaitingProviderStart) {
					this._logService.trace(`[Copilot:${sessionId}] Idle from abort; tearing down cancelled turn ${turn.id}`);
					if (turn.isRunning) {
						this._reportToolCallDetails(turn, 'cancelled');
					}
					this._dropLateRootTurnEvents = true;
					turn.markAborted();
					this._clearActiveTurn();
				} else {
					this._logService.trace(`[Copilot:${sessionId}] Idle from abort; leaving ${turn.state} turn ${turn.id} open`);
				}
				return;
			}
			if (turn === this._resumingTurnAwaitingProviderStart && !turn.providerTurnStarted) {
				this._logService.trace(`[Copilot:${sessionId}] Ignoring idle from the failed execution while resumed turn ${turn.id} awaits provider start`);
				return;
			}
			// Only a `running` turn is completed by a normal idle. A `pending`
			// turn here means the SDK went idle before emitting any event for it
			// (a degenerate no-op send); complete it defensively so the session
			// does not hang.
			this._completeActiveRepoInfoTelemetry();
			this._completeActiveTurn();
		}));

		// The SDK emits a `skill` tool call (which we hide) and a richer
		// `skill.invoked` event with the resolved SKILL.md path. Synthesize a
		// tool-start/complete pair from the latter so the UI can render a
		// clickable file link, matching the `view`-tool display style.
		this._register(wrapper.onSkillInvoked(e => {
			this._logService.info(`[Copilot:${sessionId}] Skill invoked: ${e.data.name} (${e.data.path})`);
			this._resumeSubagentForEvent(e);
			if (this._shouldDropUnmappedSubagentEvent(e, 'skill.invoked')) {
				return;
			}
			// Restricted `skillContentRead`: which skill file was loaded. Main-agent only, like the other restricted events.
			if (!e.agentId) {
				this._telemetryReporter.skillContentRead({
					clientType: this._currentTurn.value?.clientType ?? AgentHostClientType.Unknown,
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
			if (this._dropLateRootTurnEvents) {
				this._logService.error(`[Copilot:${sessionId}] subagent.started emitted after cancellation; dropping`);
				return;
			}
			if (e.agentId) {
				this._parentToolCallIdsByAgentId.set(e.agentId, e.data.toolCallId);
				this._activeSubagentAgentIds.add(e.agentId);
			}
			if (this._currentTurn.value) {
				this._rootTurnIdBySubagentToolCallId.set(e.data.toolCallId, this._currentTurn.value.id);
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
				// Use the spawning Task tool's short description as the subagent chat title.
				taskDescription: tracked?.meta?.subagentDescription,
				// Seed the subagent chat with the spawning tool's full delegated prompt.
				taskPrompt: typeof tracked?.parameters?.prompt === 'string' ? tracked.parameters.prompt : undefined,
				// Preserve the immediate parent tool-call edge so discovery content routes to the right ancestor chat.
				parentToolCallId: tracked?.parentToolCallId,
			});
		}));

		this._register(wrapper.onSessionError(e => {
			this._logService.error(`[Copilot:${sessionId}] Session error: ${e.data.errorType} - ${e.data.message}`);
			if (!e.agentId && this._shouldDropLateRootTurnEvent('session.error')) {
				return;
			}
			if (isCopilotSdkAuthRejection(e.data)) {
				this._onDidRequireAuth.fire();
			}
			reportCopilotSdkSessionError(this._telemetryService, e, createCopilotFailureCorrelation(this.resourceUri, this._chatChannelUri, this._turnId, this.sessionId, this._currentTurn.value?.clientContext));
			const parentToolCallId = this._parentToolCallIdForSubagentEvent(e);
			const turn = this._currentTurn.value;
			if (turn) {
				this._reportToolCallDetails(turn, 'failed');
			}
			this._emitAction({
				type: ActionType.ChatError,
				turnId: this._turnId,
				duration: turn?.duration ?? 0,
				part: createErrorResponsePart(buildChatErrorInfoFromCopilotSdkFields(e.data)),
			}, parentToolCallId);
			if (!parentToolCallId) {
				this._clearActiveTurn();
			}
		}));

		this._register(wrapper.onModelCallFailure(e => {
			reportCopilotModelCallFailure(this._telemetryService, e, createCopilotFailureCorrelation(this.resourceUri, this._chatChannelUri, this._turnId, this.sessionId, this._currentTurn.value?.clientContext));
		}));

		// Tracks the last parent-scope usage so the async attribution enrichment
		// can re-emit a complete action (with accumulated credits, quota, etc.).
		let lastParentUsage: UsageInfo | undefined;
		let lastParentUsageTurnId: string | undefined;
		let autoModeResolved: { readonly turnId: string; readonly data: NonNullable<UsageInfoMeta['autoModeResolved']> } | undefined;

		this._register(wrapper.onAutoModeResolved(e => {
			if (!e.agentId && this._shouldDropLateRootTurnEvent('session.auto_mode_resolved')) {
				return;
			}
			this._lastSeenModelId = e.data.chosenModel;
			const turnId = this._turnId;
			this._logService.info(`[Copilot:${sessionId}] Auto mode resolved to ${e.data.chosenModel}${e.data.reasoningBucket ? ` (${e.data.reasoningBucket})` : ''}`);
			// A subagent's routing is recorded against its tool call, so unlike the
			// parent's it does not need an active root turn to attach to.
			if (!turnId && !e.agentId) {
				return;
			}
			if (!e.agentId) {
				this._telemetryReporter.autoModeRouterDecision({
					session: this.resourceUri.toString(),
					turnId,
					clientType: this._currentTurn.value?.clientType ?? AgentHostClientType.Unknown,
					chosenModel: e.data.chosenModel,
					predictedLabel: e.data.predictedLabel,
					confidence: e.data.confidence,
					candidateModels: e.data.candidateModels,
					categoryScores: e.data.categoryScores,
					routingMethod: e.data.routingMethod,
					availableModels: e.data.availableModels,
					fallback: e.data.fallback,
					fallbackReason: e.data.fallbackReason,
					stickyOverride: e.data.stickyOverride,
					routerLatencyMs: e.data.routerLatencyMs,
					endToEndLatencyMs: e.data.endToEndLatencyMs,
					chosenShortfall: e.data.chosenShortfall,
					hasImage: e.data.hasImage,
				});
			}
			// A subagent routes its own model calls, so record the decision against the
			// subagent rather than letting it describe the parent turn. Auto routes
			// before the model call, so the usage event that follows picks this up.
			if (e.agentId) {
				const subagentToolCallId = this._parentToolCallIdForSubagentEvent(e);
				if (!subagentToolCallId) {
					this._logService.warn(`[Copilot:${sessionId}] Unable to attribute Auto mode resolution for unknown subagent agentId=${e.agentId}; leaving the parent turn's routing untouched`);
				} else {
					this._autoModeResolvedByToolCallId.set(subagentToolCallId, e.data);
				}
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
			this._resumeSubagentForEvent(e);
			if (!e.agentId && this._shouldDropLateRootTurnEvent('assistant.usage')) {
				return;
			}
			// Usage events for a subagent's model calls carry the subagent's
			// `agentId`. Every model call — the parent's own and every subagent's —
			// is folded into the turn's cost below, so such an event additionally
			// needs only the subagent's own running component total emitted to its
			// child session (via `parentToolCallId`) for the subagent tool to show
			// its own cost.
			const mappedParentToolCallId = this._parentToolCallIdForSubagentEvent(e);
			const parentToolCallId = mappedParentToolCallId ?? e.data.parentToolCallId;
			const isUnmappedSubagent = !!e.agentId && !parentToolCallId;
			// Never re-own an already-mapped child; that would fold an old child into a new root.
			if (!mappedParentToolCallId && e.data.parentToolCallId && this._currentTurn.value
				&& !this._rootTurnIdBySubagentToolCallId.has(e.data.parentToolCallId)) {
				this._rootTurnIdBySubagentToolCallId.set(e.data.parentToolCallId, this._currentTurn.value.id);
			}
			if (isUnmappedSubagent) {
				this._logService.warn(`[Copilot:${sessionId}] Unable to attribute direct assistant.usage for unknown subagent agentId=${e.agentId}; retaining inclusive root usage`);
			}
			if (!parentToolCallId && !e.agentId) {
				this._promptCacheRefreshGeneration++;
				if (e.data.model && e.data.cacheExpiresAt) {
					this._setPromptCacheState({ modelId: e.data.model, cacheExpiresAt: e.data.cacheExpiresAt });
				} else if (e.data.model && this._promptCacheState?.modelId !== e.data.model) {
					this._setPromptCacheState(undefined);
				}
			}
			// `copilotUsage` is marked `asInternal` in the SDK schema so it is not exposed on the generated
			// `AssistantUsageData` type, but it is present at runtime. Read it dynamically.
			const copilotUsage = readCopilotUsage(e.data);
			// `quotaSnapshots` is likewise `asInternal` in the SDK schema (not on the generated type) but is
			// present at runtime. Forward the per-category snapshots on `_meta` so the client can keep the
			// account quota UI current. Mirrors the extension-host CLI path, which feeds these into its quota service.
			const quotaSnapshots = normalizeQuotaSnapshots((e.data as unknown as Record<string, unknown>).quotaSnapshots);
			const turn = isUnmappedSubagent ? this._currentTurn.value : this._owningRootTurn(parentToolCallId);

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

			// Fold this model call into the turn's whole-turn per-model totals.
			// Done once per event, before the usage objects are built, so a
			// subagent call counts toward the turn under its own model without
			// being counted twice by the parent and subagent emits below.
			turn?.addTokenTotals(eventContext.model, eventContext);
			const directUsage = isUnmappedSubagent ? undefined : this._directUsageFor(parentToolCallId, true);
			directUsage?.add(eventContext.model, eventContext, copilotUsage?.totalNanoAiu);

			// Builds a usage object carrying the given context's tokens/model plus
			// the credit total for the given scope. `copilotUsage` is the scope's
			// Copilot billing metadata, or `undefined` when nothing is billed yet.
			const buildUsage = (context: UsageContext, scopedCopilotUsage: UsageInfoMeta['copilotUsage'], isParentScope: boolean, directOwnerToolCallId: string | undefined): UsageInfo => {
				const metadata: UsageInfoMeta = {};
				if (typeof context.cost === 'number') {
					metadata.cost = context.cost;
				}
				if (isParentScope && autoModeResolved?.turnId === this._turnId) {
					metadata.autoModeResolved = autoModeResolved.data;
				} else if (!isParentScope && directOwnerToolCallId) {
					const subagentAutoMode = this._autoModeResolvedByToolCallId.get(directOwnerToolCallId);
					if (subagentAutoMode) {
						metadata.autoModeResolved = subagentAutoMode;
					}
				}
				if (scopedCopilotUsage) {
					metadata.copilotUsage = scopedCopilotUsage;
				}
				if (quotaSnapshots) {
					metadata.quotaSnapshots = quotaSnapshots;
				}
				// Only the parent scope reports whole-turn totals; a subagent's
				// own usage describes just its component of the turn.
				const turnTokenTotals = isParentScope ? turn?.tokenTotals : undefined;
				if (turnTokenTotals) {
					metadata.turnTokenTotals = turnTokenTotals;
				}
				const directUsage = this._directUsageFor(directOwnerToolCallId, false);
				const directTurnTokenTotals = directUsage?.tokenTotals;
				if (directTurnTokenTotals) {
					metadata.directTurnTokenTotals = directTurnTokenTotals;
				}
				const directNanoAiu = directUsage?.copilotNanoAiu;
				if (directNanoAiu !== undefined) {
					metadata.directCopilotUsage = { totalNanoAiu: directNanoAiu };
				}
				return {
					inputTokens: context.inputTokens,
					outputTokens: context.outputTokens,
					model: context.model,
					cacheReadTokens: context.cacheReadTokens,
					...(Object.keys(metadata).length > 0 ? { _meta: metadata } : {}),
				};
			};

			// Fold this call's cost into the turn before building any report, so the
			// emission below already carries it. Every model call the turn caused
			// counts toward it, subagents included. Done synchronously here rather
			// than from the SDK's session total, which is read across an await that
			// the terminal `session.idle` can beat.
			if (turn && copilotUsage) {
				turn.copilotNanoAiu += copilotUsage.totalNanoAiu;
			}

			// Parent turn aggregate: a subagent event must not replace the parent
			// turn's own model/context-token usage, so preserve the parent's context.
			if (turn) {
				const parentContext = (parentToolCallId || isUnmappedSubagent) ? (turn.parentContextUsage ?? {}) : eventContext;
				const parentUsage = buildUsage(parentContext, this._parentCopilotUsageMeta(), true, undefined);
				lastParentUsage = parentUsage;
				lastParentUsageTurnId = this._turnId;
				this._emitAction({
					type: ActionType.ChatUsage,
					turnId: this._turnId,
					usage: parentUsage,
				});
			}

			// Subagent component: additionally report the subagent's own running
			// total to its child session. The SDK's session metrics carry no
			// per-agent breakdown, so this is the only source for it.
			if (parentToolCallId) {
				const scopedTotal = directUsage?.copilotNanoAiu;
				const subagentCopilotUsage = copilotUsage && scopedTotal !== undefined
					? { ...copilotUsage, totalNanoAiu: scopedTotal }
					: undefined;
				const subagentUsage = buildUsage(eventContext, subagentCopilotUsage, false, parentToolCallId);
				this._lastSubagentUsageByToolCallId.set(parentToolCallId, subagentUsage);
				this._emitAction({
					type: ActionType.ChatUsage,
					turnId: this._turnId,
					usage: subagentUsage,
				}, parentToolCallId);
			}
		}));

		// After each usage event, asynchronously refresh the SDK's session-wide total
		// (authoritative for the session, and the only source that sees work billed
		// outside a turn) and re-emit the parent aggregate with it. For main-agent
		// calls the per-source context-window attribution is fetched and merged in
		// too — a subagent runs against its own context, so its events must not
		// rewrite the parent's attribution. The reducer replaces `activeTurn.usage`,
		// so the widget picks up the update on the next render cycle.
		//
		// Losing this re-emit to a turn that ended mid-flight costs only the session
		// total's freshness; the turn's own cost was already reported synchronously.
		this._register(wrapper.onUsage(async e => {
			if (!e.agentId && this._shouldDropLateRootTurnEvent('assistant.usage')) {
				return;
			}
			const isSubagentEvent = !!this._parentToolCallIdForSubagentEvent(e);
			const turnId = this._turnId;
			// Capture the base usage before the await boundary so concurrent
			// usage events don't overwrite what we merge into.
			const baseUsage = lastParentUsageTurnId === turnId ? lastParentUsage : undefined;
			const usage: UsageInfo = baseUsage ?? {
				inputTokens: e.data.inputTokens,
				outputTokens: e.data.outputTokens,
				model: e.data.model,
				cacheReadTokens: e.data.cacheReadTokens,
			};
			await this._refreshSessionUsageMetrics();
			const attribution = isSubagentEvent ? undefined : await this._readContextAttribution();
			if (!turnId) {
				return;
			}
			// If the turn changed while we were awaiting, don't pollute the
			// new turn's state with stale data. Likewise, guard against a newer
			// usage event having arrived — only enrich if baseUsage is current.
			if (turnId !== this._turnId || usage !== lastParentUsage || lastParentUsageTurnId !== turnId) {
				return;
			}
			const copilotUsage = this._parentCopilotUsageMeta();
			if (!attribution && !copilotUsage) {
				return;
			}
			const enriched: UsageInfo = {
				...usage,
				_meta: {
					...(usage._meta ?? {}),
					...(copilotUsage ? { copilotUsage } : {}),
					...(attribution ? { contextAttribution: attribution } : {}),
				},
			};
			lastParentUsage = enriched;
			lastParentUsageTurnId = turnId;
			this._emitAction({
				type: ActionType.ChatUsage,
				turnId,
				usage: enriched,
			});
		}));

		// Compaction (manual `/compact` or automatic) runs its own summarization model call, which the
		// SDK bills on `session.compaction_complete` rather than as an `assistant.usage` event.
		//
		// A compaction that runs *during* a turn is that turn's cost, so fold it in like any other
		// call. One that runs between turns belongs to no turn: it is reflected in the session total
		// only, rather than being carried onto whatever runs next and inflating an unrelated
		// response footer by what is often the session's single most expensive call.
		this._register(wrapper.onSessionCompactionComplete(async e => {
			if (e.data.success === false) {
				return;
			}
			this._resumeSubagentForEvent(e);
			const parentToolCallId = this._parentToolCallIdForSubagentEvent(e);
			if (e.agentId && !parentToolCallId) {
				return;
			}
			const copilotUsage = readCopilotUsage(e.data.compactionTokensUsed);
			const turn = this._owningRootTurn(parentToolCallId);
			const compactionTokens = e.data.compactionTokensUsed;
			const model = compactionTokens?.model ?? this._lastSeenModelId;
			const usageContext: UsageContext = {
				inputTokens: compactionTokens?.inputTokens,
				outputTokens: compactionTokens?.outputTokens,
				cacheReadTokens: compactionTokens?.cacheReadTokens,
			};
			turn?.addTokenTotals(model, usageContext);
			const directUsage = this._directUsageFor(parentToolCallId, true);
			directUsage?.add(model, usageContext, copilotUsage?.totalNanoAiu);
			if (turn && copilotUsage) {
				turn.copilotNanoAiu += copilotUsage.totalNanoAiu;
			}
			// Report the turn's cost before awaiting anything. The terminal `session.idle`
			// can arrive while the metrics read is in flight and close the turn, after
			// which the reducer drops usage for it — so a compaction whose turn ends
			// immediately (e.g. one followed by a failing model call) would never be
			// persisted if this waited.
			const emitParentUsage = (): string | undefined => {
				const turnId = this._turnId;
				const parentCopilotUsage = this._parentCopilotUsageMeta();
				const turnTokenTotals = this._currentTurn.value?.tokenTotals;
				const directTurnTokenTotals = this._currentTurn.value?.directUsage.tokenTotals;
				const directNanoAiu = this._currentTurn.value?.directUsage.copilotNanoAiu;
				if (!turnId || (!parentCopilotUsage && !turnTokenTotals && !directTurnTokenTotals && directNanoAiu === undefined)) {
					return undefined;
				}
				// Preserve the parent turn's own model/context tokens: the compaction call's tokens describe
				// the summarization request, not the conversation, so they must not replace what is shown.
				const base = lastParentUsageTurnId === turnId ? lastParentUsage : undefined;
				const usage: UsageInfo = {
					...base,
					model: base?.model ?? this._lastSeenModelId,
					_meta: {
						...(base?._meta ?? {}),
						...(parentCopilotUsage ? { copilotUsage: parentCopilotUsage } : {}),
						...(turnTokenTotals ? { turnTokenTotals } : {}),
						...(directTurnTokenTotals ? { directTurnTokenTotals } : {}),
						...(directNanoAiu !== undefined ? { directCopilotUsage: { totalNanoAiu: directNanoAiu } } : {}),
					},
				};
				lastParentUsage = usage;
				lastParentUsageTurnId = turnId;
				this._emitAction({
					type: ActionType.ChatUsage,
					turnId,
					usage,
				});
				return turnId;
			};

			if (parentToolCallId && directUsage) {
				const priorUsage = this._lastSubagentUsageByToolCallId.get(parentToolCallId);
				const metadata: UsageInfoMeta = { ...(priorUsage?._meta ?? {}) };
				// A compaction can be the first usage this subagent reports, so carry
				// its routing across rather than describing it by a concrete model.
				metadata.autoModeResolved ??= this._autoModeResolvedByToolCallId.get(parentToolCallId);
				if (directUsage.tokenTotals) {
					metadata.directTurnTokenTotals = directUsage.tokenTotals;
				}
				if (directUsage.copilotNanoAiu !== undefined) {
					metadata.directCopilotUsage = { totalNanoAiu: directUsage.copilotNanoAiu };
					metadata.copilotUsage = {
						...(metadata.copilotUsage ?? {}),
						...(copilotUsage ?? {}),
						totalNanoAiu: directUsage.copilotNanoAiu,
					};
				}
				const usage: UsageInfo = {
					...priorUsage,
					model: priorUsage?.model ?? model,
					...(Object.keys(metadata).length > 0 ? { _meta: metadata } : {}),
				};
				this._lastSubagentUsageByToolCallId.set(parentToolCallId, usage);
				this._emitAction({
					type: ActionType.ChatUsage,
					turnId: this._turnId,
					usage,
				}, parentToolCallId);
			}
			if (turn) {
				emitParentUsage();
			}
			// Then pick up the session-wide total, which also covers a compaction billed
			// while no turn was active, and re-emit so the widget reflects it.
			const turnIdBeforeRefresh = this._turnId;
			if (await this._refreshSessionUsageMetrics() && turnIdBeforeRefresh === this._turnId) {
				emitParentUsage();
			}
		}));

		this._register(wrapper.onReasoningDelta(e => {
			this._logService.trace(`[Copilot:${sessionId}] Reasoning delta: ${e.data.deltaContent.length} chars`);
			this._resumeSubagentForEvent(e);
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
			this._logMcpServersSnapshot(e.data.servers.map((s: McpServersLoadedServer) => ({
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

	mcpServerOwners(): ReadonlyMap<string, string> | undefined {
		return this._mcpCustomizations.pluginMcpServerSources;
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
		const sessionUri = this._ownerSessionUri.toString();
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
	 * resolved {@link CopilotExitPlanModeResponse} flows back to the CLI, which
	 * calls `session.respondToExitPlanMode` internally — that resumes the
	 * paused `exit_plan_mode` tool call and (on accept) updates the SDK's
	 * `currentMode` so the model can continue with implementation.
	 */
	private async _handleExitPlanModeRequest(data: ExitPlanModeRequest, _invocation: { sessionId: string }): Promise<CopilotExitPlanModeResponse> {
		const turnId = this._currentTurn.value?.id;
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
		if (this._currentTurn.value?.id !== turnId) {
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

		const inputRequest: ChatInputRequestWithPlanReview = withChatInputRequestPurpose({
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
		}, ChatInputRequestPurpose.PlanReview);

		const pendingPlanReview = this._pendingPlanReviews.register(requestId, {
			actions: data.actions,
			recommendedAction: data.recommendedAction,
			questionId,
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
			return await pendingPlanReview;
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
		this._register(wrapper.onSessionError(invalidate));
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
			const clientContext = this._currentTurn.value?.clientContext;
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

				type AgentHostInstructionsCollectedEvent = IAgentHostInitiatorTelemetry & {
					provider: string;
					agentSessionId: string;
					isSubagentSession: boolean;
					totalInstructionsCount: number;
					agentInstructionsCount: number;
					applyingInstructionsCount: number;
					referencedInstructionsCount: number;
					claudeMdCount: number;
				};
				type AgentHostInstructionsCollectedClassification = IAgentHostInitiatorClassification & {
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
					...toInitiatorTelemetry(clientContext),
					provider: this.resourceUri.scheme,
					agentSessionId: AgentSession.id(this.resourceUri),
					isSubagentSession: isSubagentSession(this.resourceUri),
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
			if (!e.agentId) {
				this._promptCacheRefreshGeneration++;
				if (e.data.previousModel !== e.data.newModel) {
					this._setPromptCacheState(undefined);
				}
				void this._refreshSessionUsageMetrics();
			}
		}));

		this._register(wrapper.onManagedSettingsResolved(e => {
			this._logService.info(`[Copilot:${sessionId}] Managed settings resolved: source=${e.data.source}, managedKeys=${e.data.managedKeys.join(',') || '(none)'}, bypassPermissionsDisabled=${e.data.bypassPermissionsDisabled}, failClosed=${e.data.failClosed}`);
		}));

		this._register(wrapper.onManagedSettingsEnforced(e => {
			this._logService.warn(`[Copilot:${sessionId}] Managed settings enforced: action=${e.data.action}, setting=${e.data.setting}, escalation=${e.data.escalation ?? '(none)'}, failClosed=${e.data.failClosed}, message=${e.data.message}`);
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
				void this._telemetryReporter.userMessageText(this.resourceUri.toString(), this._currentTurn.value?.clientType ?? AgentHostClientType.Unknown, e.data.content, this._turnOrdinal).catch(err => this._logService.trace(`[Copilot:${this.sessionId}] Telemetry emission failed: ${getErrorMessage(err)}`));
			}
		}));

		this._register(wrapper.onPendingMessagesModified(() => {
			this._logService.trace(`[Copilot:${sessionId}] Pending messages modified`);
		}));

		this._register(wrapper.onTurnStart(e => {
			const turn = this._currentTurn.value;
			turn?.markProviderTurnStarted();
			turn?.markRunning();
			if (!e.agentId) {
				this._dropLateRootTurnEvents = false;
				if (this._resumingTurnAwaitingProviderStart === turn) {
					this._resumingTurnAwaitingProviderStart = undefined;
				}
			}
			this._logService.trace(`[Copilot:${sessionId}] Turn started: ${e.data.turnId}`);
			if (!e.agentId) {
				const telemetryMessageId = this._currentTurn.value?.id ?? e.data.turnId;
				if (this._activeRepoInfoTurn?.telemetryMessageId === telemetryMessageId) {
					return;
				}
				this._cancelActiveRepoInfoTelemetry();
				const turn: NonNullable<CopilotAgentSession['_activeRepoInfoTurn']> = {
					telemetryMessageId,
					cancelled: false,
					begin: Promise.resolve(undefined),
				};
				const isCurrent = () => !turn.cancelled && this._isLaunchTokenCurrent();
				turn.begin = this._beginRepoInfoTelemetry(telemetryMessageId, this._currentTurn.value?.clientType ?? AgentHostClientType.Unknown, isCurrent);
				this._activeRepoInfoTurn = turn;
			}
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
			this._cancelActiveRepoInfoTelemetry();
			const turn = this._currentTurn.value;
			if (turn?.isRunning) {
				this._reportToolCallDetails(turn, 'cancelled');
			}
		}));

		this._register(wrapper.onToolUserRequested(e => {
			this._logService.trace(`[Copilot:${sessionId}] Tool user-requested: ${e.data.toolName} (${e.data.toolCallId})`);
		}));

		this._register(wrapper.onToolPartialResult(e => {
			this._logService.trace(`[Copilot:${sessionId}] Tool partial result: ${e.data.toolCallId} (${e.data.partialOutput.length} chars)`);
			const tracked = this._activeToolCalls.get(e.data.toolCallId);
			if (!tracked || !isShellTool(tracked.toolName)) {
				return;
			}
			if (this._shellManager?.getTerminalUriForToolCall(e.data.toolCallId)) {
				// Client-hosted pty shell — its terminal channel streams live output itself.
				return;
			}
			const appended = this._nonPtyShellTerminals.append(e.data.toolCallId, e.data.partialOutput);
			if (appended?.created) {
				const { uri } = appended;
				tracked.content.push({
					type: ToolResultContentType.Terminal,
					resource: uri,
					title: tracked.displayName,
					isPty: false,
				});
				this._emitAction({
					type: ActionType.ChatToolCallContentChanged,
					turnId: this._turnId,
					toolCallId: e.data.toolCallId,
					content: tracked.content,
				}, tracked.parentToolCallId);
			}
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
			this._completeSubagentTurn(e.agentId, e.data.toolCallId);
			this._logService.trace(`[Copilot:${sessionId}] Subagent completed: ${e.data.agentName}`);
		}));

		this._register(wrapper.onSubagentFailed(e => {
			this._completeSubagentTurn(e.agentId, e.data.toolCallId);
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
			if (e.data.hookType === 'agentStop') {
				this._completeSubagentTurn(e.agentId);
			}
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
	 * Resolves the exclusive SDK event boundary for a fork after {@link turnId}.
	 */
	async getForkBoundaryEventId(turnId: string): Promise<string | undefined> {
		const activeTurn = this._currentTurn.value;
		const activeTurnId = activeTurn?.id;
		const activeTurnEventId = activeTurnId !== turnId ? activeTurn?.eventId : undefined;
		const persistedEventId = await this._databaseRef.object.getNextTurnEventId(turnId);
		if (persistedEventId || !activeTurnEventId) {
			return persistedEventId;
		}

		this._logService.info(`[Copilot:${this.sessionId}] Fork boundary after turn ${turnId} is active turn ${activeTurnId}; waiting for its SDK event id`);
		try {
			return await activeTurnEventId;
		} catch (err) {
			throw new Error(`its next turn (${activeTurnId}) never produced an SDK event id: ${getErrorMessage(err)}`);
		}
	}

	/**
	 * Returns the SDK event ID associated with the given protocol turn.
	 */
	getTurnEventId(turnId: string): Promise<string | undefined> {
		return this._databaseRef.object.getTurnEventId(turnId);
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

	/**
	 * Cancels every pending interaction for abort and dispose. This completes synchronously before any awaiter resumes, so ordering is not significant.
	 */
	private _cancelAllPendingInteractions(): void {
		this._cancelPendingAutoApprovals();
		this._denyPendingPermissions();
		this._cancelPendingUserInputs();
		this._cancelPendingElicitations();
		this._cancelPendingPlanReviews();
		this._cancelPendingMcpAuthRequests();
		this._cancelPendingMcpSamplings();
		this._cancelPendingClientToolCalls();
	}

	private _cancelPendingAutoApprovals(): void {
		this._pendingAutoApprovals.denyAll(undefined);
		this._autoApprovals.clear();
	}

	private _denyPendingPermissions(): void {
		for (const [toolCallId] of this._pendingPermissions.entries()) {
			this._deletePendingEditContent(toolCallId);
		}
		this._pendingPermissions.denyAll({ kind: 'reject' });
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
		this._pendingUserInputs.denyAll({ response: ChatInputResponseKind.Cancel });
	}

	private _cancelPendingElicitations(): void {
		this._pendingElicitations.denyAll({ response: ChatInputResponseKind.Cancel });
	}

	private _cancelPendingPlanReviews(): void {
		this._pendingPlanReviews.denyAll({ approved: false });
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
 * Reads the SDK's internal `copilotUsage` billing payload, carried on both the `assistant.usage`
 * event and `session.compaction_complete`'s `compactionTokensUsed`. It is marked `asInternal` in
 * the SDK schema, so it is absent from the generated types (`AssistantUsageData`,
 * `CompactionCompleteCompactionTokensUsed`) even though it is present at runtime — hence the
 * dynamic read. This is the source for per-turn and per-subagent cost, accumulated synchronously
 * as each event arrives; only the session-wide total comes from the SDK's usage metrics.
 * Returns `undefined` when the payload carries no usable nano-AIU total.
 */
function readCopilotUsage(raw: unknown): { totalNanoAiu: number } & Record<string, unknown> | undefined {
	if (!raw || typeof raw !== 'object') {
		return undefined;
	}
	const usage = (raw as Record<string, unknown>).copilotUsage;
	if (!usage || typeof usage !== 'object') {
		return undefined;
	}
	const totalNanoAiu = (usage as Record<string, unknown>).totalNanoAiu;
	if (typeof totalNanoAiu !== 'number' || !Number.isFinite(totalNanoAiu) || totalNanoAiu < 0) {
		return undefined;
	}
	return { ...(usage as Record<string, unknown>), totalNanoAiu };
}

/**
 * Normalizes one reported token count into a value safe to accumulate. The SDK
 * types the fields as numbers, but they are absent on some events and this
 * guards against a malformed runtime payload skewing the turn's totals.
 */
function toTokenCount(value: number | undefined): number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : 0;
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
			tokenBasedBilling: typeof v.tokenBasedBilling === 'boolean' ? v.tokenBasedBilling : undefined,
			overageEntitlement: typeof v.overageEntitlement === 'number' ? v.overageEntitlement : undefined,
		};
		hasAny = true;
	}
	return hasAny ? result : undefined;
}
