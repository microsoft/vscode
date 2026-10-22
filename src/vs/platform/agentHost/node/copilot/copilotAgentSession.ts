/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { compactAutoModeResolved, compactContextAttribution, createLocalModelTurnExecutionMeta, isAiCreditsStatus, type UsageInfoMeta } from '../../common/meta/agentUsageMeta.js';
import type { ILocalTurnExecution } from '../../common/localModel.js';
import type { ILocalModelDirectRequestWait } from './localModelBridge/localModelProvider.js';
import type { AttributedPermissionResult, CopilotClient, CopilotSession, CurrentToolMetadata, ElicitationContext, ElicitationFieldValue, ElicitationResult, ElicitationSchema, ElicitationSchemaField, ExitPlanModeCompletedData, ExitPlanModeRequest, ExitPlanModeResult, JsonValue, MessageOptions, PermissionDecisionSource, PermissionHandler, PermissionMode, PermissionRequest, PermissionRequestResult, PermissionResult, SessionConfig, SessionEvent, SessionEventPayload, SessionHooks, SessionMode as CopilotSdkMode, Tool, ToolInvocation, ToolResultObject, McpServerStatus as SdkMcpServerStatus } from '@github/copilot-sdk';
import { attributePermissionResult, isPermissionDeniedKind, permissionResultToConfirmKind } from './copilotPermissionAttribution.js';
import { realpath as fsRealpath } from 'fs';
import { cp, rm } from 'fs/promises';
import { promisify } from 'util';
import { DeferredPromise, disposableTimeout, firstParallel, raceCancellation, raceCancellationError, raceTimeout, RunOnceScheduler, Sequencer, SequencerByKey, Throttler, timeout } from '../../../../base/common/async.js';
import { encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { CancellationError, getErrorMessage, isCancellationError } from '../../../../base/common/errors.js';
import { escapeMarkdownSyntaxTokens } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableMap, DisposableStore, dispose, type IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { LRUCache } from '../../../../base/common/map.js';
import { Schemas } from '../../../../base/common/network.js';
import { isAuthorizationProtectedResourceMetadata } from '../../../../base/common/oauth.js';
import { equals, safeStringify } from '../../../../base/common/objects.js';
import { waitForState } from '../../../../base/common/observable.js';
import { isAbsolute, join } from '../../../../base/common/path.js';
import { extUriBiasedIgnorePathCase, isEqual, normalizePath } from '../../../../base/common/resources.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { splitLinesIncludeSeparators } from '../../../../base/common/strings.js';
import { hasKey, isDefined, isObject, isString, type Mutable } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { FileOperationResult, FileSystemProviderCapabilities, IFileService, toFileOperationResult } from '../../../files/common/files.js';
import { gitHubMcpServerUrl } from '../../../github/common/githubEndpoints.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { ILogService, LogLevel } from '../../../log/common/log.js';
import product from '../../../product/common/product.js';
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import { ICopilotHomeService } from '../../../environment/common/copilotHome.js';
import { AgentHostCopilotExecutionSubagentEnabledSettingId, AgentHostCopilotExecutionSubagentModelSettingId, AgentHostHydraFusionEnabledSettingId, CopilotCliConfigKey, CopilotCliVSCodeAssignmentContextKey, copilotCliConfigSchema, isCopilotHydraFusionModelId } from '../../common/copilotCliConfig.js';
import { logSettingExperimentTrigger } from '../../../telemetry/common/experimentTrigger.js';
import { withCustomizationEnablement } from '../../common/customizationEnablement.js';
import { isAutoModeRoutingTier, isSupportedAutoModeTier } from '../../common/autoModeTiers.js';
import { getPlanActionDescription, type ChatInputRequestWithPlanReview, type IAgentHostPlanReviewAction } from '../../common/agentHostPlanReview.js';
import { ChatInputRequestPurpose, withChatInputRequestPurpose } from '../../common/meta/agentChatInputRequestMeta.js';
import { AgentSystemNotificationKind, AgentSystemNotificationSeverity, toAgentSystemNotificationMeta } from '../../common/meta/agentSystemNotificationMeta.js';
import { canStopBackgroundWork, toStoppableBackgroundWorkMeta } from '../../common/meta/agentHostBackgroundWorkStopMeta.js';
import { readCopilotShellAttachment, readCopilotShellId, toCopilotBackgroundShellMeta } from '../../common/meta/copilotBackgroundWorkMeta.js';
import { SAVE_SANDBOX_PATH, type ISandboxPathGrant } from '../../common/sandboxPathGrant.js';
import { getCopilotBrowserSandboxNetworkRestrictions } from './copilotSandboxPolicy.js';
import { AgentHostAutoApprovePolicyRestrictedConfigKey, AgentHostGlobalAutoApproveEnabledConfigKey, AgentHostAutoReplyAnswer, AgentHostAutoReplyEnabledConfigKey, AgentHostComputerUseEnabledConfigKey, AgentHostDisableRepoInfoTelemetryConfigKey, AgentHostMcpConnectorsEnabledConfigKey, AgentHostMcpSamplingAllowedServersConfigKey, AgentHostMcpToolRoutingEnabledConfigKey, platformRootSchema, platformSessionSchema, type IAgentHostWorkspaceTrust } from '../../common/agentHostSchema.js';
import { reconcileCopilotConnectors, type ICopilotConnectorServer, type ICopilotConnectorServers } from './copilotConnectors.js';
import { copilotConnectorsScope } from '../../../github/common/connectors/connectors.js';
import { createUnknownAgentHostClientTelemetryContext, type IAgentHostClientTelemetryContext, type IAgentProviderSendStageRecorder } from '../../common/agentHostTelemetry.js';
import { measureAgentProviderOperation } from '../../common/agentHostProviderTiming.js';
import { type AgentCanvasDefinitionSnapshot, AgentSession, type IAgentChatOwnerRef, type IAgentExtensionInfo, type IAgentManagedPluginRetryEntry, COPILOT_CLI_AGENT_PROVIDER_ID, AgentSignal, AgentWorkingDirectoryChangedError, AuthenticateParams, IMcpNotification, subagentChatTitle, type AgentCanvasExtensionSource, type AgentExtensionStatus, type AgentSubagentTaskModelSource, type AgentTurnProviderCallState, type IAgentCanvasCloseRequest, type IAgentCanvasOpenRequest, type IAgentPendingMessageSender, type IAgentPermissionResponseContext, type IAgentTelemetryContext, type IAgentToolPendingConfirmationSignal, type IAgentTurnDiagnosticSnapshot, type IAgentTurnTokenUsage } from '../../common/agent.js';
import { isReasoningEffortLevel } from '../../common/reasoningEffort.js';
import { agentModelConfigurationMetaKey, IAgentRuntimeModelConfiguration, readAgentRuntimeModelConfiguration } from '../../common/meta/agentModelConfigurationMeta.js';
import { agentModelConfigurationReportKey, type IAgentModelConfigurationReport } from '../../common/agentModelConfiguration.js';
import { createCopilotModelConfigurationReport } from './copilotManagedModelConfiguration.js';
import { ObservedTokenUsage } from './observedTokenUsage.js';
import { META_DIFF_BASE_BRANCH } from '../../common/agentHostGitService.js';
import { stripRedundantCdPrefix } from '../../common/commandLineHelpers.js';
import { getToolCallDurationMs, toToolCallMeta, type IToolCallMeta, type IToolCallUiMeta, type IToolSearchCandidate } from '../../common/meta/agentToolCallMeta.js';
import { OtelData, type OtelAttributeValue } from '../../common/otlp/otlpLogEmitter.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { CopilotSessionApprovalPolicy, fromCopilotPermissionMode } from './copilotApprovalPolicy.js';
import { isShellInitScriptList, type IShellInitScript } from '../../common/shellInitScript.js';
import { SEMANTIC_SEARCH_TOOL_NAME } from '../../common/semanticSearchConstants.js';
import { resolveCopilotConfigSlashCommandOnSend } from '../../common/copilotConfigSlashCommands.js';
import { STREAMING_TOOL_DISPLAY_INTERVAL_MS, streamingToolDisplayText } from '../../common/streamingToolCallDisplay.js';
import { isAgentFeedbackAnnotationsAttachment, renderAgentFeedbackAnnotationsAttachment } from '../../common/meta/agentFeedbackAttachments.js';
import { isHostSnapshotAttachment } from '../../common/meta/agentSnapshotAttachmentMeta.js';
import { ISessionDatabase, ISessionDataService, MAX_TERMINAL_OUTPUT_BYTES } from '../../common/sessionDataService.js';
import { IAgentHostOTelService } from '../../common/otel/agentHostOTelService.js';
import { BackgroundWorkKind, ConfirmationOptionKind, MessageAttachmentKind, ToolCallContributorKind, type BackgroundWork, type FileEdit, type MessageAttachment, type ModelSelection, type ToolCallContributor } from '../../common/state/protocol/state.js';
import { ActionType, isChatAction, type ChatAction, type ChatToolCallReadyAction, type SessionAction } from '../../common/state/sessionActions.js';
import { subagentChatUri } from '../../common/agentHostChatMinting.js';
import { MessageKind, ResponsePartKind, ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind, ChatInputResponseKind, ToolCallConfirmationReason, ToolCallRiskAssessmentKind, ToolCallRiskAssessmentStatus, ToolCallStatus, ToolResultContentType, TurnState, buildSubagentSessionUri, createErrorResponsePart, isSubagentSession, type CanvasState, type Customization, type Message, type PendingMessage, type ChatInputAnswer, type ChatInputOption, type ChatInputQuestion, type ChatInputRequest, type ToolCallResult, type ToolResultContent, type ToolResultTerminalContent, type Turn, type ITurnTokenTotal, type UsageInfo, type IContextAttributionData, type ISessionPromptCacheState } from '../../common/state/sessionState.js';
import { buildCanvasUri } from '../../common/canvasUri.js';
import { IAgentConfigurationService, type IAgentChatConfigurationChangeEvent, type IAgentChatConfigurationTarget } from '../agentConfigurationService.js';
import { CopilotSessionWrapper, type ICopilotByokSessionConfig, type ICopilotModelCallFinishedEvent } from './copilotSessionWrapper.js';
import { allowCopilotSdkExecution, restoreDeferredCopilotSdkExecution } from './copilotSessionExecutionMarker.js';
import { getCopilotSdkToolResourceUri } from './copilotSdkMeta.js';
import { isAutoModel } from './modelIdentifiers.js';
import { clientToolNamesFromSnapshot, composeByokSessionConfig, findLocalModelDirectFamily, getCopilotWorkingDirectoryTrust, isMcpServerExplicitlyProjected, resolveCopilotSessionManagedSettings, toSessionConfigMcpServers, type CopilotSessionLaunchPlan, type IActiveClientSnapshot, type ICopilotSessionLauncher, type ICopilotSessionRuntime } from './copilotSessionLauncher.js';
import { CLIENT_TOOL_SEARCH_REFERENCE_NAME, NON_DEFERRED_CLIENT_TOOL_NAMES, RUNTIME_TOOL_SEARCH_TOOL_NAME, searchToolsWithoutClient } from './toolSearchDeferral.js';
import { ActiveClientToolSet, structuralToolsEqual } from '../activeClientState.js';
import { AgentHostTelemetryReporter, toInitiatorTelemetry, type IAgentHostEventClassification, type IAgentHostEventTelemetry, type ICanvasExtensionsReadyEvent } from '../agentHostTelemetryReporter.js';
import { AgentHostRepoInfoTelemetry } from '../agentHostRepoInfoTelemetry.js';
import { PendingRequestRegistry } from '../../common/pendingRequestRegistry.js';
import { buildCopilotSystemNotification, getCopilotSubagentDisplayNames } from './copilotSystemNotification.js';
import { parseLeadingSlashCommand } from '../../common/agentHostSlashCommand.js';
import type { IUnsandboxedCommandConfirmationRequest, ShellManager } from './copilotShellTools.js';
import { NonPtyShellTerminalStreams, type INonPtyShellToolCompletion } from './copilotNonPtyShellTerminals.js';
import { readCopilotSessionEvents, restoreStoredShellOutputsForChat } from './copilotSessionHistory.js';
import { CopilotSessionSandbox } from './copilotSessionSandbox.js';
import { reportCopilotRuntimeRestart, type CopilotRuntimeMutation, type CopilotRuntimeRestartEvent } from './copilotRuntimeRestartTelemetry.js';
import type { CopilotSandboxCertificate } from './copilotSandboxCertificate.js';
import type { IAgentServerToolDefinition, IAgentServerToolHost } from '../../common/agentServerTools.js';
import { AGENT_MERGE_GITHUB_TOOL_RESTRICTION, getAgentMergeGitHubToolRestriction, isAgentMergeRestrictedMcpServer, isCopilotMcpToolName } from '../shared/agentMergeToolRestrictions.js';
import { GITHUB_MCP_SERVER_NAME } from '../shared/githubMcpServer.js';
import { AgentHostComputerUseEnabledSettingId, AgentHostGitHubMcpServerEnabledSettingId } from '../../common/agentService.js';
import { COMPUTER_USE_PLUGIN_NAME } from './copilotComputerUsePlugin.js';
import { CopilotComputerUseActivation } from './copilotComputerUseActivationTool.js';
import { classifyComputerUsePrompt, type CopilotComputerUsePermissionSetup, type ICopilotComputerUseSetupChat, type IComputerUsePermissionPrompt } from './copilotComputerUsePermissionSetup.js';
import { CopilotToolName, getEditFilePaths, getInvocationMessage, getPastTenseMessage, getPermissionDisplay, getSandboxPathGrantConfirmation, getSdkImageGenerationMetadata, getToolIntention, getShellLanguage, getStreamingInvocationMessage, getSubagentMetadata, getTaskCompleteMarkdown, getToolDisplayName, getToolInputString, getToolKind, getToolSummaryInputContract, isAgentCoordinationTool, isCopilotSdkToolOutputFile, isEditTool, isHiddenTool, isShellHelperTool, isShellTool, isTaskCompleteTool, parseCopilotStreamingToolInput, synthesizeSkillToolCall, tryStringify } from './copilotToolDisplay.js';
import { imageGenerationToolMetaKey } from '../../common/meta/agentImageGenerationMeta.js';
import { FileEditTracker } from '../shared/fileEditTracker.js';
import { ICopilotApiService, type IRestrictedTelemetryContext } from '../shared/copilotApiService.js';
import type { IAgentHostRestrictedTelemetryContext } from '../agentHostRestrictedTelemetry.js';
import { buildChatErrorInfoFromCopilotSdkFields } from './copilotSdkChatError.js';
import { buildMcpChannel, buildMcpTopLevelCustomizationId, getMcpServerCustomizations, McpCustomizationController, type IMcpServerProvenance, type ISdkMcpServer } from '../shared/mcpCustomizationController.js';
import { getSdkMcpServerEnablement, resolveCustomizationEnablement, targetForMcpServer } from '../shared/customizationEnablementGate.js';
import { appendSdkToolResultContent, getSdkToolResultContent, getSdkToolResultText, mapSessionEvents, persistSdkToolResultResources } from './mapSessionEvents.js';
import { withPermissionDiff } from '../../common/meta/agentPermissionRequestMeta.js';
import { COPILOT_FUSION_PHASE_AGENT_NAME, CopilotFusionProgress, formatFusionReviewContent, getFusionPhaseToolCallId, isProvisionalFusionConversationEvent, type CopilotFusionEvent, type FusionPhasePresentation, type ICopilotFusionProgressUpdate } from './copilotFusionProgress.js';
import { CopilotFusionRequestCorrelation, getFusionEventKey, getFusionEventSdkTurnId, isSyntheticUserMessage } from './copilotFusionEventIdentity.js';
import { CopilotFusionMessageChunks, isLastAssistantMessageChunk } from './copilotFusionMessageChunks.js';
import { addAttachmentDisplayKindToMimeType, addSimpleAttachmentDisplayKindToMimeType } from './copilotAttachmentUtils.js';
import { appendGeneratedImagePaths, getGeneratedImages, saveGeneratedImages } from './copilotGeneratedImages.js';
import { buildPendingEditContentUri } from './pendingEditContentStore.js';
import { IAgentHostCustomizationEnablementService } from '../agentHostCustomizationEnablementService.js';
import { describeDiscardedFileEdits, IAgentHostFileEditCoordinator } from '../agentHostFileEditCoordinator.js';
import { IAgentHostPromptCache } from '../agentHostPromptCache.js';
import { IAgentHostStorageService } from '../agentHostStorageService.js';
import { AgentHostClientType } from '../../common/agentHostClientInfo.js';
import { CustomizationEnablementKind, CustomizationType, McpAuthRequiredReason, McpServerStatus, type McpAuthRequirement, type McpServerCustomization, type McpServerState } from '../../common/state/protocol/channels-session/state.js';
import { AhpErrorCodes, ProtocolError } from '../../common/state/sessionProtocol.js';
import type { IAgentHostScopedCredential } from '../../common/agentHostCredentials.js';
import type { ErrorInfo, ProtectedResourceMetadata } from '../../common/state/protocol/common/state.js';
import { CopilotSlashCommandProvider } from './copilotSlashCommandProvider.js';
import { CopilotMcpToolRoutingCache, getMcpRoutingCacheKey, getMcpRoutingProxyName, type ICopilotMcpRoutingServer, type ICopilotMcpRoutingTool } from './copilotMcpToolRoutingCache.js';
import { readMcpRoutingServers, withMcpRoutingServers } from '../../common/meta/mcpCustomizationMeta.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../agentHostStateManager.js';
import { type CopilotPluginReloadReason, getCopilotCustomizationCommandHandler, installCopilotPlugin, type ICopilotPluginCommandApi, removeCopilotPluginMarketplace, uninstallCopilotPlugin } from './copilotCustomizationCommandDisplay.js';
import { renderCopilotSlashCommandOutput, type RuntimeSlashCommandInfo } from './copilotSlashCommand.js';
import { CopilotSandboxPolicyDisplay } from './copilotSandboxPolicyDisplay.js';
import { toSlashCommandResourceMeta } from '../../common/meta/agentSlashCommandOutputMeta.js';
import { createCopilotFailureCorrelation, reportCopilotModelCallFailure, reportCopilotSdkSessionError } from './copilotFailureTelemetry.js';
import { reportCopilotTodoStoreOperation } from './copilotTodoStoreTelemetry.js';
import { ModelCallTurnCorrelation } from './modelCallTurnCorrelation.js';
import { CopilotSubagentTracking } from './copilotSubagentTracking.js';
import { agentModelCallMetaKey, readAgentModelCallDiagnostics } from '../../common/meta/agentModelCallMeta.js';

type CopilotSdkAttachment = Required<MessageOptions>['attachments'][number];
type GitHubCredentialsUpdateResult = Awaited<ReturnType<CopilotSession['rpc']['gitHubAuth']['setCredentials']>>;
type McpAuthHandler = NonNullable<SessionConfig['onMcpAuthRequest']>;
type McpAuthRequest = Parameters<McpAuthHandler>[0];
type McpAuthResult = Awaited<ReturnType<McpAuthHandler>>;
type UserMcpServers = Awaited<ReturnType<CopilotClient['rpc']['mcp']['config']['list']>>['servers'];
type CopilotSdkExecutionOutcome<T> = { readonly kind: 'executed'; readonly value: T } | { readonly kind: 'skipped' };

interface IClientToolSdkPolicy {
	readonly overridesBuiltInTool?: true;
	readonly skipPermission?: true;
}

const DEFAULT_CLIENT_TOOL_SDK_POLICY: IClientToolSdkPolicy = {};
const CLIENT_TOOL_SDK_POLICIES: ReadonlyMap<string, IClientToolSdkPolicy> = new Map([
	[SEMANTIC_SEARCH_TOOL_NAME, { overridesBuiltInTool: true, skipPermission: true }],
]);

function readSubagentTaskModelSource(data: object): AgentSubagentTaskModelSource | undefined {
	// Runtime 1.0.84-2 emits taskModelSource before SDK 1.0.13 declares it; remove this cast once the generated SDK type includes it.
	const source = (data as { taskModelSource?: unknown }).taskModelSource;
	switch (source) {
		case 'task_argument':
		case 'subagent_configuration':
		case 'custom_agent_definition':
		case 'unset':
			return source;
		default:
			return undefined;
	}
}

/** The runtime-reported Auto tier, only while the model is Auto; never inferred or defaulted. */
function getCommittedAutoTier(model: string | undefined, autoTier: unknown): string | undefined {
	return isAutoModel(model) && (isAutoModeRoutingTier(autoTier) || isSupportedAutoModeTier(autoTier)) ? autoTier : undefined;
}

/** How the runtime settled an Auto resolution, for the info log: identifiers, flags and numbers only; `''` when none were reported. */
function formatAutoModeRoutingForLog(data: { readonly routingMethod?: string; readonly predictedLabel?: string; readonly stickyOverride?: boolean; readonly chosenShortfall?: number; readonly fallback?: boolean }): string {
	const identifier = (value: string | undefined) => value === undefined ? undefined : /^[A-Za-z0-9._:-]{1,64}$/.test(value) ? value : 'other';
	const fields = [
		['routingMethod', identifier(data.routingMethod)],
		['predictedLabel', identifier(data.predictedLabel)],
		['stickyOverride', data.stickyOverride],
		['chosenShortfall', typeof data.chosenShortfall === 'number' && Number.isFinite(data.chosenShortfall) ? data.chosenShortfall : undefined],
		['fallback', data.fallback],
	].filter(([, value]) => value !== undefined);
	return fields.length ? ` [${fields.map(([key, value]) => `${key}=${value}`).join(', ')}]` : '';
}

/** A known tier, or the pending runtime read for the configuration in effect when it was captured. */
type AutoTierSnapshot = string | undefined | Promise<string | undefined>;

const AUTO_TIER_READ_TIMEOUT = 5_000;

/** The runtime-reported HydraFusion model, only when it is one of the known HydraFusion models; never inferred from the picker. */
function getHydraFusionModel(syntheticModel: string | undefined): string | undefined {
	return isCopilotHydraFusionModelId(syntheticModel) ? syntheticModel : undefined;
}

function getClientToolSdkPolicy(toolName: string): IClientToolSdkPolicy {
	return CLIENT_TOOL_SDK_POLICIES.get(toolName) ?? DEFAULT_CLIENT_TOOL_SDK_POLICY;
}

interface CopilotExitPlanModeResponse extends ExitPlanModeResult {
	readonly autoApproveEdits?: ExitPlanModeCompletedData['autoApproveEdits'];
}

type PendingPermissionResponse =
	| { readonly kind: 'decision'; readonly result: PermissionRequestResult; readonly source?: PermissionDecisionSource }
	| { readonly kind: 'grant-sandbox-path'; readonly context: IAgentPermissionResponseContext };

function isCopilotSdkAuthRejection(error: { readonly errorType: string; readonly statusCode?: number }): boolean {
	return (error.errorType === 'authentication' || error.errorType === 'authorization') && error.statusCode === 401;
}

interface IPendingMcpAuthRequest {
	readonly serverName: string;
	readonly resource: ProtectedResourceMetadata;
	readonly requiredScopes: readonly string[];
	readonly toolCalls: IMcpAuthToolCall[];
	/**
	 * The server is owned by a Copilot Connector. The runtime authenticates it only with the session's GitHub
	 * credential, so a forwarded MCP token never satisfies it; the request is cancelled after Connector
	 * authorization rebinds that credential and the Connector is reconciled.
	 */
	readonly copilotConnector: boolean;
	completion?: Promise<McpAuthResult | null | undefined>;
}

type SubagentTurnOutcome =
	| { readonly kind: 'failed'; readonly message: string; readonly durationMs: number | undefined }
	| { readonly kind: 'cancelled'; readonly durationMs: number | undefined };

interface IMcpAuthToolCall {
	readonly turnId: string;
	readonly toolCallId: string;
	readonly parentToolCallId: string | undefined;
}

/** A server shown as restarting ahead of a forced Connector reconcile, with the state it replaced. */
interface IProvisionalMcpServerRestart {
	readonly previous: McpServerState;
	readonly provisional: McpServerState;
}

interface ILastMcpAuthRequirement {
	readonly requestId: string;
	readonly auth: McpAuthRequirement;
	readonly acceptsTokenCompletion: boolean;
}

interface ICopilotActiveToolCall {
	readonly turnId: string;
	readonly startedAt?: string;
	readonly toolName: string;
	readonly displayName: string;
	readonly parameters: Record<string, unknown> | undefined;
	readonly content: ToolResultContent[];
	readonly parentToolCallId: string | undefined;
	readonly mcpServerName: string | undefined;
	readonly contributor: ToolCallContributor | undefined;
	readonly intention: string | undefined;
	readonly autoTier: AutoTierSnapshot;
	/** The HydraFusion model (`hydrafusion` or `hydrafusion-max`) that routed this call, when the runtime attributed it to one. */
	readonly fusionModel: string | undefined;
	/** The concrete model the runtime attributed this call to within a HydraFusion phase. */
	readonly fusionSourceModel: string | undefined;
	meta: IToolCallMeta | undefined;
	pendingImageReady?: ChatToolCallReadyAction;
}

interface ICopilotStreamingToolCall {
	input: string;
	toolName: string | undefined;
	parentToolCallId: string | undefined;
	started: boolean;
	displayedInputLength: number;
	displayedMessage: string | undefined;
}

interface IMcpRoutingProxy {
	readonly server: ICopilotMcpRoutingServer;
}

const SESSION_STATE_DIRECTORY = 'session-state';
const DEBUG_LOG_COLLECTION_RETRY_ATTEMPTS = 50;
const DEBUG_LOG_COLLECTION_RETRY_DELAY_MS = 20;
const EMPTY_TOOL_RESULT_TEXT = '<empty />';
const MCP_ROUTING_PROXY_DESCRIPTION_MAX_LENGTH = 12_000;
const USER_DENIED_PERMISSION_RESULT = { kind: 'reject', feedback: 'The user denied permission.' } satisfies PermissionRequestResult;
const ALLOW_SAMPLING_ALWAYS_OPTION_ID = 'allow-sampling-always';

function isSamplingContent(value: unknown): value is { text?: unknown; content?: unknown } {
	return isObject(value);
}

function getSamplingContentCharacterCount(content: unknown): number {
	if (Array.isArray(content)) {
		return content.reduce((total: number, block: unknown) => total + getSamplingContentCharacterCount(block), 0);
	}
	if (!isSamplingContent(content)) {
		return 0;
	}
	if (isString(content.text)) {
		return content.text.length;
	}
	return getSamplingContentCharacterCount(content.content);
}

function getSamplingRequestCharacterCount(request: Record<string, unknown>): number {
	const messages: readonly unknown[] = Array.isArray(request.messages) ? request.messages : [];
	return (isString(request.systemPrompt) ? request.systemPrompt.length : 0) + messages.reduce<number>((total, message) =>
		total + (isSamplingContent(message) ? getSamplingContentCharacterCount(message.content) : 0), 0);
}

function getMcpRoutingProxyDescription(serverName: string, cachedTools: readonly ICopilotMcpRoutingTool[]): string {
	const activation = `Route to the MCP server named "${serverName}". This server is not currently available to the model. Calling this tool starts or connects to the server, may ask the user to authenticate, and then discovers its current tools. Call it only when the current task clearly needs capabilities likely provided by this server; do not call it speculatively.`;
	if (cachedTools.length === 0) {
		return `${activation} No cached tool metadata is available, so use the server name to judge relevance.`;
	}
	const catalog = cachedTools.map(tool => tool.description ? `${tool.name}: ${tool.description}` : tool.name).join('; ');
	return `${activation} Previously observed tool metadata follows. It is a routing hint only and may be stale: ${catalog}`;
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

/**
 * Names of launched MCP servers that reach GitHub, whose tools Agent Merge turns deny. SDK-discovered plugin servers
 * count regardless of launch enablement because the runtime can enable them later and resolves their name collisions.
 */
function getAgentMergeRestrictedMcpServerNames(plan: CopilotSessionLaunchPlan): ReadonlySet<string> {
	const launchedServers = [
		...Object.entries(toSessionConfigMcpServers(plan)),
		...plan.snapshot.plugins.flatMap(plugin => plugin.mcpServers.filter(server => !isMcpServerExplicitlyProjected(server)).map(server => [server.name, server.configuration] as const)),
	];
	return new Set([
		GITHUB_MCP_SERVER_NAME,
		...launchedServers.filter(([name, server]) => isAgentMergeRestrictedMcpServer(name, server)).map(([name]) => name),
	]);
}

type IMappedSessionEvents = { turns: Turn[]; subagentTurnsByToolCallId: ReadonlyMap<string, Turn[]> };

interface ICopilotResponsePartState {
	readonly markdownPartIds: Map<string, string>;
	readonly reasoningPartIds: Map<string, string>;
}

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

type UserInputHandler = NonNullable<SessionConfig['onUserInputRequest']>;
type UserInputRequest = Parameters<UserInputHandler>[0];
type UserInputResponse = Awaited<ReturnType<UserInputHandler>>;
type PreToolUseHookInput = Parameters<NonNullable<SessionHooks['onPreToolUse']>>[0];
type PreToolUseHookOutput = Awaited<ReturnType<NonNullable<SessionHooks['onPreToolUse']>>>;
type PostToolUseHookInput = Parameters<NonNullable<SessionHooks['onPostToolUse']>>[0];
type PostToolUseHookOutput = Awaited<ReturnType<NonNullable<SessionHooks['onPostToolUse']>>>;
type PostToolUseFailureHookInput = Parameters<NonNullable<SessionHooks['onPostToolUseFailure']>>[0];
type PostToolUseFailureHookOutput = Exclude<Awaited<ReturnType<NonNullable<SessionHooks['onPostToolUseFailure']>>>, void>;
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
function elicitationFieldToQuestion(fieldName: string, field: ElicitationSchemaField, required: boolean, isAskUser = false): ChatInputQuestion {
	const base = {
		id: fieldName,
		title: field.title ?? fieldName,
		message: field.description ?? field.title ?? fieldName,
		required,
	};

	switch (field.type) {
		case 'boolean':
			if (isAskUser) {
				// Boolean questions disable freeform input, but ask_user permits replies beyond True/False.
				return {
					...base,
					kind: ChatInputQuestionKind.SingleSelect,
					options: [
						{ id: 'true', label: localize('agentHost.askUser.true', "True") },
						{ id: 'false', label: localize('agentHost.askUser.false', "False") },
					],
					allowFreeformInput: true,
				};
			}
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

/**
 * Converts structured ask_user answers while preserving freeform replies and fractional numeric values.
 */
function askUserAnswerToFieldValue(field: ElicitationSchemaField, answer: ChatInputAnswer | undefined): ElicitationFieldValue | undefined {
	if (!answer || answer.state === ChatInputAnswerState.Skipped) {
		return undefined;
	}
	const value = answer.value;
	switch (value.kind) {
		case ChatInputAnswerValueKind.Text:
			if (field.type === 'array') {
				return value.value ? [value.value] : [];
			}
			if (field.type === 'boolean' && (value.value === 'true' || value.value === 'false')) {
				return value.value === 'true';
			}
			if ((field.type === 'number' || field.type === 'integer') && value.value.trim() !== '') {
				const number = Number(value.value);
				if (Number.isFinite(number)) {
					return number;
				}
			}
			return value.value;
		case ChatInputAnswerValueKind.Boolean:
			return field.type === 'boolean' ? value.value : undefined;
		case ChatInputAnswerValueKind.Number:
			return field.type === 'number' || field.type === 'integer' ? value.value : undefined;
		case ChatInputAnswerValueKind.Selected:
			if (field.type === 'array') {
				return value.value ? [value.value, ...(value.freeformValues ?? [])] : [...(value.freeformValues ?? [])];
			}
			if (value.freeformValues?.length) {
				return value.freeformValues[0];
			}
			if (field.type === 'boolean') {
				return value.value === 'true' ? true : value.value === 'false' ? false : value.value;
			}
			return field.type === 'string' ? value.value : undefined;
		case ChatInputAnswerValueKind.SelectedMany:
			return field.type === 'array' ? [...value.value, ...(value.freeformValues ?? [])] : undefined;
	}
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

const realpath = promisify(fsRealpath);
// A non-settling control RPC must not permanently block the per-chat sequencer.
const CONTROL_PLANE_RPC_TIMEOUT_MS = 30_000;
const CONNECTOR_REFRESH_TIMEOUT_MS = 60_000;
const SUBAGENT_TASK_COMPLETION_DELAY_MS = 250;
/** The longest a `tasks.readOutput` call may wait for a detached shell to write more output. */
const DETACHED_SHELL_OUTPUT_WAIT_MS = 30_000;
/** Type of the `session.info` and `session.warning` events about preparing plugins required by the organization. */
const MANAGED_PLUGINS_EVENT_TYPE = 'managed_plugins';
/** Type of the `session.info` event sent when plugins required by the organization are ready. */
const MANAGED_PLUGINS_COMPLETE_EVENT_TYPE = 'managed_plugins_complete';

function hasParentPathSegment(filePath: string): boolean {
	return filePath.split(/[\\/]/).includes('..');
}

async function isPathWithinDirectory(filePath: string, directory: URI, resolveRealPath: (path: string) => Promise<string>): Promise<boolean> {
	if (!isAbsolute(filePath) || hasParentPathSegment(filePath) || directory.scheme !== Schemas.file) {
		return false;
	}

	const resource = normalizePath(URI.file(filePath));
	const normalizedDirectory = normalizePath(directory);
	if (!extUriBiasedIgnorePathCase.isEqualOrParent(resource, normalizedDirectory)) {
		return false;
	}

	const [resolvedPath, resolvedDirectory] = await Promise.all([
		resolveRealPath(filePath),
		resolveRealPath(directory.fsPath),
	]);
	return extUriBiasedIgnorePathCase.isEqualOrParent(
		normalizePath(URI.file(resolvedPath)),
		normalizePath(URI.file(resolvedDirectory)),
	);
}

/**
 * Options for constructing a {@link CopilotAgentSession}.
 */
export interface ICopilotAgentSessionOptions {
	readonly onSessionEvent?: (event: SessionEvent) => void;
	/** The chat's owner, read at each use: it can change while this runtime lives. */
	readonly owner: IAgentChatOwnerRef;
	readonly chatChannelUri: URI;
	/** Exact persistence/config scope for this chat (`IAgentChatContext.resource` when supplied). */
	readonly resource?: URI;
	readonly rawSessionId: string;
	readonly onDidSessionProgress: Emitter<AgentSignal>;
	readonly sessionLauncher: ICopilotSessionLauncher;
	readonly launchPlan: CopilotSessionLaunchPlan;
	readonly sandboxCertificate: CopilotSandboxCertificate;
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
	/** Reads configured user servers before SDK launch, without waiting for their connection inventory. */
	readonly getUserMcpServers?: () => Promise<UserMcpServers>;
	/** Lists globally installed plugins, including disabled entries omitted from the live session inventory. */
	readonly getInstalledPlugins?: () => Promise<Awaited<ReturnType<ICopilotPluginCommandApi['list']>>['plugins']>;
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
	/** Overrides source-launch detection for deterministic tests. */
	readonly enableDevelopmentErrorInjection?: boolean;
	/** Overrides the quiet period before task status completes a subagent turn. */
	readonly subagentTaskCompletionDelay?: number;
	/** Captures provider account metadata when a turn starts. */
	readonly telemetryContext?: () => IAgentTelemetryContext | undefined;
	/**
	 * Invoked whenever this chat's in-flight turn ends — normal completion,
	 * abort, or error — leaving the chat idle, and again when its last
	 * in-flight subagent settles after the turn ended. Lets the agent run work
	 * that must not interrupt a live turn or subagent, notably a CLI client
	 * restart deferred while they were running. Called synchronously from the
	 * session's SDK event handling, so the agent must schedule anything that
	 * could dispose this session off the current stack.
	 */
	readonly onTurnEnded?: () => void;
	/** Invoked after a root SDK message or turn-start event establishes steering readiness. */
	readonly onSteeringReady?: (session: CopilotAgentSession) => void;
	/**
	 * The shared Computer Use permission setup, read at each use: the agent creates it only while Computer Use is offered
	 * by the local macOS Agent Host. Without it, the plugin's permission prompts keep the ordinary elicitation UI.
	 */
	readonly computerUsePermissionSetup?: () => CopilotComputerUsePermissionSetup | undefined;

	/**
	 * Platform used to compute the SDK sandbox policy. Defaults to
	 * `process.platform`; injectable so tests can exercise the per-OS gating
	 * (notably that the sandbox is ignored on Windows) deterministically.
	 */
	readonly platform?: NodeJS.Platform;
	/** Resolves symlinks for plugin resource permission checks. */
	readonly realpath?: (path: string) => Promise<string>;
	/** Overrides the control-plane RPC timeout for deterministic tests. */
	readonly controlPlaneRpcTimeoutMs?: number;
	/** Bounds one Connector reconciliation attempt; a timed-out request remains pending. */
	readonly connectorRefreshTimeoutMs?: number;
	/** Requests a later attempt after an abandoned Connector RPC settles. */
	readonly onConnectorRefreshRetryable?: (session: CopilotAgentSession) => void;
	/** Live canvases handed over by the runtime this session replaces during a configuration refresh. */
	readonly canvasHandoff?: ICopilotCanvasHandoff;
}

/** A live canvas channel and its current presentation state. */
interface ICopilotCanvasProjection {
	readonly resource: URI;
	readonly canvas: CanvasState;
}

/** Canvases a configuration refresh carries from a chat's previous runtime to its replacement. */
export interface ICopilotCanvasHandoff {
	readonly projections: readonly ICopilotCanvasProjection[];
}

/** A projected canvas; `handedOver` marks one seeded from a handoff that the replacement runtime has not reported since. */
interface ICanvasProjectionEntry extends ICopilotCanvasProjection {
	readonly handedOver?: true;
}

/** New canvases are projected once the runtime's extensions settle; no canvas events are projected after release. */
type CanvasProjectionPhase = 'starting' | 'live' | 'released';

export interface ICopilotWorkingDirectoryChangeTransaction {
	prepare(): Promise<void>;
	rollback(): Promise<void>;
	reconcile(authoritativeWorkingDirectory: URI): Promise<void>;
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
type McpLifecycleOrigin = 'statusChanged' | 'inventory';

/**
 * SDK-neutral fields carried into a lifecycle log record from a live
 * `session.mcp_server_status_changed` event or the `rpc.mcp.listConfigured` inventory.
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

type ConfiguredMcpServer = Awaited<ReturnType<CopilotSession['rpc']['mcp']['listConfigured']>>['servers'][number];
type McpServer = Awaited<ReturnType<CopilotSession['rpc']['mcp']['list']>>['servers'][number] & Partial<Pick<ConfiguredMcpServer, 'enabled' | 'live'>>;

/** Live enablement takes precedence over configuration, which is unchanged by runtime toggles. */
function getEffectiveMcpServerEnablement(enabled: boolean | undefined, status: SdkMcpServerStatus | undefined): boolean {
	return status !== undefined ? status !== 'disabled' && status !== 'not_configured' : enabled ?? true;
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
	timingRecorder: IAgentProviderSendStageRecorder | undefined;
	sdkSendInvoked = false;

	private _state: CopilotTurnState = 'pending';
	private _providerCallState: AgentTurnProviderCallState = 'notStarted';
	private _providerTurnStarted = false;
	private readonly _stopWatch = StopWatch.create(false);
	private readonly _pendingToolCompletions = new Set<Promise<void>>();

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
	readonly observedTokenUsage = new ObservedTokenUsage();

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

	/** Current markdown response part IDs for this root turn and its Fusion phase scopes. */
	readonly markdownPartIds = new Map<string, string>();

	/** Current reasoning response part IDs for this root turn and its Fusion phase scopes. */
	readonly reasoningPartIds = new Map<string, string>();

	readonly toolTitles = new Map<string, string>();
	readonly toolIntentions = new Map<string, string>();

	/**
	 * Per-turn tool-call aggregate accumulated across the turn's `assistant.message` rounds (main
	 * agent only), for the restricted `toolCallDetails` telemetry. `toolCounts` is keyed by tool name.
	 */
	readonly toolCounts = new Map<string, number>();
	readonly mainModelCallIds = new Set<string>();
	/** Root SDK correlations are valid only while their owning protocol turn is active. */
	readonly sdkTurnIds = new Set<string>();
	readonly interactionIds = new Set<string>();
	activeSdkTurnId: string | undefined;
	imageGenerationSdkTurnId: string | undefined;
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
		readonly telemetryContext: IAgentTelemetryContext | undefined,
		readonly providerInitiated = false,
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

	get hasPendingToolCompletions(): boolean { return this._pendingToolCompletions.size > 0; }

	trackToolCompletion(completion: Promise<void>): void {
		this._pendingToolCompletions.add(completion);
		const remove = () => this._pendingToolCompletions.delete(completion);
		void completion.then(remove, remove);
	}

	async drainToolCompletions(): Promise<void> {
		while (this.hasPendingToolCompletions && !this._store.isDisposed) {
			await Promise.allSettled(this._pendingToolCompletions);
		}
	}

	/**
	 * Rejects {@link eventId} before disposal so pending fork-boundary checks do not hang.
	 */
	override dispose(): void {
		this.sdkTurnIds.clear();
		this.interactionIds.clear();
		this.activeSdkTurnId = undefined;
		if (!this._eventId.isSettled) {
			this._eventId.error(new Error(`Turn ${this.id} was disposed before its SDK event id was recorded`));
		}
		super.dispose();
	}
}

interface IPendingSteering {
	readonly pendingMessage: PendingMessage;
	readonly sender: IAgentPendingMessageSender | undefined;
	/** Set once the message is handed to the SDK; identifies it for withdrawal. */
	sdkSend?: { readonly prompt: string; readonly messageId: Promise<string> };
	/** The SDK's id for the message once `send` returns; its `user.message` echo carries the same id. */
	sdkMessageId?: string;
	/**
	 * The host turn this message was promoted into before its `user.message` echo arrived. The entry stays
	 * pending until that echo (or the end of the turn) so the echo is not matched to another message.
	 */
	promotedTurnId?: string;
	/** Set while the user's withdrawal of the message awaits the SDK, so it is not promoted meanwhile. */
	withdrawing?: boolean;
}

/** Where a transient chat activity comes from; see `CopilotAgentSession._publishActivity` for the precedence. */
type CopilotActivitySource = 'intent' | 'command' | 'fusion' | 'localModel';

/** How long a rejected permission mode waits for managed settings to resolve before its single retry. */
const managedSettingsPermissionRetryTimeoutMs = 3000;
const MAX_PROJECTED_CANVASES = 8;

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
	/** Notes about the agent's changes that the user undid, sent once with its next tool result or prompt. */
	private _discardedEditNotes: string[] = [];
	readonly sessionId: string;
	readonly resourceUri: URI;
	private readonly _owner: IAgentChatOwnerRef;
	/**
	 * The owner this runtime was launched for. Everything that configures the
	 * running process reads it until the relaunch at the next turn boundary
	 * after an owner change: the launcher, sandbox policy, customization and MCP
	 * enablement, MCP customization ids and their publication, server tools,
	 * the config target and approval modes.
	 */
	readonly launchOwner: URI;
	private readonly _controlPlaneRpcTimeoutMs: number;
	private _controlPlaneDesynchronized = false;
	/** The chat's current owner, for per-turn identity: session actions, subagent chat URIs, terminal links and claims, edit attribution, telemetry. */
	private get _ownerSessionUri(): URI { return this._owner.get(); }
	get ownerSessionUri(): URI { return this._owner.get(); }
	get ownerRef(): IAgentChatOwnerRef { return this._owner; }
	/** @deprecated Compatibility alias for SDK callbacks; this is the exact persistence resource. */
	get sessionUri(): URI { return this.resourceUri; }
	private readonly _chatChannelUri: URI;
	/** Fixed persistence scope for this chat; never re-derived from the mutable routing channel. Config reads/writes go through {@link _configTarget} instead — peer chats share that scope but have distinct storage. */
	private readonly _storageUri: URI;

	get chatChannelUri(): URI {
		return this._chatChannelUri;
	}

	/** Working directory this session operates in, if any. */
	get workingDirectory(): URI | undefined { return this._workingDirectory; }

	/**
	 * Whether the trust the SDK session was created with for its working
	 * directory still matches what a create would grant under `trust` now. A
	 * resumed session never has a grant, so it matches only while no grant
	 * would be made.
	 */
	isWorkingDirectoryTrustCurrent(trust: IAgentHostWorkspaceTrust | undefined): boolean {
		return this._wrapper?.launchWorkingDirectoryTrust === getCopilotWorkingDirectoryTrust(this._launchPlan, trust);
	}

	async listPluginMarketplaces(): Promise<Awaited<ReturnType<CopilotSession['rpc']['plugins']['marketplaces']['list']>>['marketplaces']> {
		return (await this._wrapper.session.rpc.plugins.marketplaces.list()).marketplaces;
	}

	async installPlugin(source: string): Promise<void> {
		await installCopilotPlugin(this._wrapper.session.rpc.plugins, reason => this._reloadPlugins(reason), source);
	}

	/**
	 * Prepares the plugins the managed settings require now, even while the
	 * runtime pauses automatic retries after a failure. The runtime reloads
	 * plugins and reports progress and failures through the same
	 * `managed_plugins` events as automatic preparation, so a failure is
	 * still shown in a waiting turn or held for the next one. A retry in which
	 * no plugin failed drops a failure held from earlier, which is outdated.
	 */
	async retryManagedPlugins(): Promise<readonly IAgentManagedPluginRetryEntry[]> {
		this._logService.info(`[Copilot:${this.sessionId}] Retrying managed plugins`);
		this._recordRuntimeMutation('customizationsChanged');
		const { plugins } = await this._wrapper.session.rpc.plugins.retryManaged();
		if (!plugins.some(plugin => plugin.status === 'failed')) {
			this._unshownManagedPluginFailure = undefined;
		}
		return plugins.map(({ spec, status, error }) => error === undefined ? { spec, status } : { spec, status, error });
	}

	async uninstallPlugin(name: string, directSourceId?: string): Promise<void> {
		await uninstallCopilotPlugin(this._wrapper.session.rpc.plugins, reason => this._reloadPlugins(reason), name, directSourceId);
	}

	addPluginMarketplace(source: string) {
		return this._wrapper.session.rpc.plugins.marketplaces.add({ source });
	}

	async browsePluginMarketplace(name: string) {
		return (await this._wrapper.session.rpc.plugins.marketplaces.browse({ name })).plugins;
	}

	async removePluginMarketplace(name: string, force?: boolean) {
		return removeCopilotPluginMarketplace(this._wrapper.session.rpc.plugins, reason => this._reloadPlugins(reason), name, force);
	}

	/** Reloads installed plugins into the live SDK session, which can restart its MCP servers. */
	private async _reloadPlugins(reason: CopilotPluginReloadReason): Promise<void> {
		this._logService.info(`[Copilot:${this.sessionId}] Reloading plugins: reason=${reason}`);
		this._recordRuntimeMutation('customizationsChanged');
		await this._wrapper.session.rpc.plugins.reload();
	}

	async refreshPluginMarketplaces(name?: string) {
		return (await this._wrapper.session.rpc.plugins.marketplaces.refresh(name ? { name } : {})).results;
	}

	async listInstalledPlugins(): Promise<Awaited<ReturnType<CopilotSession['rpc']['plugins']['list']>>['plugins']> {
		return (await this._wrapper.session.rpc.plugins.list()).plugins;
	}

	async listPluginMarketplacePlugins(): Promise<readonly { readonly name: string; readonly marketplace: string }[]> {
		const marketplaces = (await this._wrapper.session.rpc.plugins.marketplaces.list()).marketplaces
			.filter(marketplace => marketplace.available !== false);
		const catalogs = await Promise.all(marketplaces.map(async marketplace => {
			try {
				return {
					marketplace: marketplace.name,
					plugins: (await this._wrapper.session.rpc.plugins.marketplaces.browse({ name: marketplace.name })).plugins,
				};
			} catch (error) {
				this._logService.warn(`[Copilot:${this.sessionId}] Failed to browse plugin marketplace '${marketplace.name}' for completions: ${getErrorMessage(error)}`);
				return { marketplace: marketplace.name, plugins: [] };
			}
		}));
		return catalogs.flatMap(catalog => catalog.plugins.map(plugin => ({
			name: plugin.name,
			marketplace: catalog.marketplace,
		})));
	}

	get extensionLaunchDirectories(): readonly URI[] {
		return [
			...(this._launchPlan.workingDirectory ? [this._launchPlan.workingDirectory] : []),
			...(this._launchPlan.additionalDirectories ?? []),
		];
	}

	setExtensionLaunchAdmission(admission: IDisposable): void {
		this._register(admission);
	}

	/** Tracks active tool invocations so we can produce past-tense messages on completion. */
	private readonly _activeToolCalls = new Map<string, ICopilotActiveToolCall>();
	private readonly _streamingToolCalls = new Map<string, ICopilotStreamingToolCall>();
	private readonly _streamingToolDisplaySchedulers = this._register(new DisposableMap<string, RunOnceScheduler>());
	private readonly _subagents = this._register(new CopilotSubagentTracking());
	private _subagentProgressSequencer = new SequencerByKey<string>();
	private readonly _pendingSubagentToolCompletions = new Map<string, DeferredPromise<AgentSignal | undefined>>();
	private readonly _subagentResponsePartState: ICopilotResponsePartState = {
		markdownPartIds: new Map<string, string>(),
		reasoningPartIds: new Map<string, string>(),
	};
	private readonly _resolveAgentName = (agentId: string) => this._subagents.getDisplayName(agentId);
	readonly modelCallTurnCorrelation = new ModelCallTurnCorrelation();
	private readonly _subagentDirectUsageByToolCallId = new Map<string, DirectUsageAccumulator>();
	private readonly _lastSubagentUsageByToolCallId = new Map<string, UsageInfo>();
	/**
	 * Auto's routing decision per subagent. Keyed by tool call rather than turn: a
	 * subagent outlives the root turn that spawned it when steering mints a new one.
	 */
	private readonly _autoModeResolvedByToolCallId = new Map<string, NonNullable<UsageInfoMeta['autoModeResolved']>>();
	private _committedAutoTier: AutoTierSnapshot;
	private readonly _committedAutoTierBySubagentToolCallId = new Map<string, string>();
	private readonly _subagentTaskCompletionSchedulers = this._register(new DisposableMap<string, RunOnceScheduler>());
	private readonly _pendingSubagentLifecycleCompletions = new Map<string, { readonly toolCallId: string; readonly activityRevision: number | undefined; readonly outcome?: SubagentTurnOutcome }>();
	private readonly _subagentTaskCompletionDelay: number;
	/** Bumped when a child starts a model round so a task snapshot taken earlier cannot complete it; entries are dropped on completion. */
	private readonly _subagentActivityRevisions = new Map<string, number>();
	private _backgroundTaskStatusRevision = 0;
	private readonly _backgroundTaskStatusRefreshThrottler = this._register(new Throttler());
	private readonly _backgroundWork = new Map<string, BackgroundWork>();
	private _backgroundWorkObservers = 0;
	private _republishBackgroundWork = false;
	private _refreshDetachedBackgroundShells = false;
	private readonly _backgroundShellRefresh = this._register(new RunOnceScheduler(() => this._refreshBackgroundTasks(true), 5000));
	private readonly _unroutableSubagentToolCallIds = new Set<string>();
	/** Correlates tool execution with the SDK permission lifecycle for `chat.toolApproval` telemetry. */
	private readonly _toolApprovalRecords = new Map<string, {
		permissionRequested: boolean;
		resolvedByHook: boolean;
		requestSandboxBypass: boolean;
		resultKind: PermissionResult['kind'] | undefined;
		decisionSource?: PermissionDecisionSource;
		toolName: string | undefined;
		mcpServerName: string | undefined;
		reported: boolean;
	}>();
	/** Pending permission requests awaiting a renderer-side decision. */
	private readonly _pendingPermissions = new PendingRequestRegistry<PendingPermissionResponse, {
		readonly managedApprovalRequired: boolean;
		readonly sandboxPathGrant?: ISandboxPathGrant;
		readonly samplingServerIdentity?: string;
	}>();
	/** Cancels callbacks that began before or during an SDK abort. */
	private readonly _abortCts = this._register(new MutableDisposable<CancellationTokenSource>());
	private readonly _lifetimeCts = this._register(new CancellationTokenSource());
	/** Delays cancelled callbacks until the SDK abort settles or the session is disposed. */
	private _abortBarrier: DeferredPromise<void> | undefined;
	/**
	 * Reuses one user approval for repeated native read/write/shell requests
	 * from the SDK's internal path and operation prompts. Grants are keyed by
	 * tool call ID and consumed once, only when the full {@link safeStringify}
	 * payload matches, including canonical paths and sandbox privileges.
	 * Managed approval requests never reuse an approval.
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
	private readonly _pendingOutputCaptures = new Set<Promise<void>>();
	/**
	 * The current protocol turn and its per-turn bookkeeping, or `undefined`
	 * when the session is idle (no active turn). Replaces the former set of
	 * loosely-coupled per-turn fields (`_turnId`, usage counter, streaming
	 * part-id maps) with a single object carrying an explicit
	 * {@link CopilotTurn.state} lifecycle. A {@link MutableDisposable}:
	 * replacing or clearing it disposes the old turn.
	 */
	private readonly _currentTurn = this._register(new MutableDisposable<CopilotTurn>());
	private readonly _idleWaiters = new Set<DeferredPromise<boolean>>();
	private readonly _completedTokenUsage = new Map<string, IAgentTurnTokenUsage>();
	private _hasCompletedTurn = false;
	private _completedTurnHistory: Promise<boolean> | undefined;
	private readonly _subagentObservedTokenUsage = new LRUCache<string, ObservedTokenUsage>(256);
	private readonly _observedUsageEventIds = new Set<string>();
	private _resumingTurnAwaitingProviderStart: CopilotTurn | undefined;
	private _abortingTurn: CopilotTurn | undefined;
	private _developmentRecoverableError: { readonly turnId: string; remainingFailures: number; readonly totalFailures: number } | undefined;
	private readonly _developmentErrorInjectionEnabled: boolean;
	private _dropLateRootTurnEvents = false;
	/**
	 * Set when a root `session.error` ends the protocol turn. The SDK still emits
	 * that failed execution's terminal `session.idle` afterwards, which can arrive
	 * after the client has already started the next turn.
	 */
	private _failedExecutionIdlePending = false;
	private _agentMergeTurn = false;
	/** MCP servers whose tools Agent Merge turns deny because they expose GitHub. */
	private readonly _agentMergeRestrictedMcpServerNames: ReadonlySet<string>;
	/** Monotonic 0-based ordinal assigned to each turn as it starts, for numeric `turnIndex` telemetry parity. */
	private _nextTurnOrdinal = 0;
	/** Dropped-tool count last surfaced by {@link reportByokToolsCapped}, to avoid repeating the same warning. */
	private _reportedByokDroppedToolCount: number | undefined;
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
	get hasCompletedTurn(): boolean { return this._hasCompletedTurn; }
	/** Reuses persisted history to distinguish restored chats from a chat's first turn. */
	get completedTurnHistory(): Promise<boolean> | undefined {
		return this._launchPlan.kind === 'resume'
			? this._completedTurnHistory ??= this._getMappedEvents().then(result => result.turns.some(turn => turn.state === TurnState.Complete))
			: undefined;
	}
	get hasRunningTurn(): boolean {
		const turn = this._currentTurn.value;
		return turn?.isRunning === true && turn.sdkSendInvoked && !this._abortToken.isCancellationRequested;
	}
	/**
	 * Whether a subagent is still in flight: started or resumed and not yet
	 * confirmed complete. A background subagent can still be finishing after
	 * the root turn goes idle, so work that tears down the SDK session must
	 * wait for it as well.
	 */
	get hasActiveSubagents(): boolean { return this._subagents.hasActiveAgents; }
	get usesStaticGitHubToken(): boolean { return this._launchPlan.githubCredentials.usesStaticToken; }

	installSandboxCertificate(scopeId: string): Promise<void> {
		return this._sandbox.installCertificate(scopeId);
	}

	rotateSandboxCertificate(scopeId: string): Promise<void> {
		return this._sandbox.rotateCertificate(scopeId);
	}

	removeSandboxCertificate(scopeId: string): Promise<void> {
		return this._sandbox.removeCertificate(scopeId);
	}

	refreshSandboxCertificate(): Promise<void> {
		return this._sandbox.refreshCertificateDiagnostics();
	}

	get usesScopedGitHubCredentials(): boolean { return this._launchPlan.githubCredentials.usesScopedCredential; }

	assertScopedCredential(credential: IAgentHostScopedCredential): void {
		if (!this._launchPlan.githubCredentials.isCurrentCredential(credential)) {
			throw new ProtocolError(AhpErrorCodes.AuthRequired, 'The Copilot runtime does not own the captured turn credential');
		}
		this._assertScopedGitHubCredential();
	}
	get chatUri(): URI { return this._chatChannelUri; }
	get currentTurnId(): string | undefined { return this._currentTurn.value?.id; }

	get isDisposed(): boolean { return this._store.isDisposed; }

	/** Waits for idle, or returns false if the runtime is disposed first. */
	async waitForIdle(token: CancellationToken = CancellationToken.None): Promise<boolean> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		if (this.isDisposed) {
			return false;
		}
		if (!this.hasActiveTurn) {
			return true;
		}
		const waiter = new DeferredPromise<boolean>();
		this._idleWaiters.add(waiter);
		try {
			return await raceCancellationError(waiter.p, token);
		} finally {
			this._idleWaiters.delete(waiter);
			waiter.complete(false);
		}
	}

	/**
	 * Starts the session's MCP servers ahead of the first message. Creating an
	 * SDK session leaves MCP lazy until the first message or the first
	 * `session.mcp.list`, while `rpc.mcp.listConfigured` deliberately does not
	 * start anything; listing is therefore what brings a pre-warmed session's
	 * servers, and any sign-in they require, up before the user sends.
	 */
	async startMcpServers(): Promise<void> {
		await this._wrapper.session.rpc.mcp.list();
	}

	/**
	 * Holds `agentHost.copilotSdkSessionError` reports until
	 * {@link releaseHeldSessionErrorTelemetry}. A pre-warmed session may never
	 * be used, so its errors only count once a send claims it; disposing the
	 * session without releasing drops them.
	 */
	holdSessionErrorTelemetry(): void {
		this._heldSessionErrorReports ??= [];
	}

	/** Reports the session errors held since {@link holdSessionErrorTelemetry} and stops holding. */
	releaseHeldSessionErrorTelemetry(): void {
		const held = this._heldSessionErrorReports;
		this._heldSessionErrorReports = undefined;
		for (const report of held ?? []) {
			report();
		}
	}

	markConnectorConfigurationChanged(forceConnectorName?: string): void {
		this._pendingConnectorRefreshes.set(forceConnectorName, ++this._connectorRefreshGeneration);
		if (forceConnectorName !== undefined && (this.hasActiveTurn || this.hasActiveSubagents)) {
			// Reconciliation waits for the turn, which may itself wait on these requests; release them so the
			// runtime retries with the session credential that was rebound before this refresh was requested.
			this._cancelStaleCopilotConnectorAuthRequests(this._pendingCopilotConnectorAuthRequestIds(forceConnectorName));
		}
	}

	get hasPendingConnectorRefresh(): boolean {
		return this._pendingConnectorRefreshes.size > 0;
	}

	/** Called under the provider's per-chat queue, or before the initialized session is registered. */
	refreshConnectors(token: CancellationToken = CancellationToken.None): Promise<void> {
		if (token.isCancellationRequested) {
			return Promise.resolve();
		}
		if (!this._connectorRefresh) {
			const cancellation = new CancellationTokenSource();
			this._connectorRefreshCancellation.value = cancellation;
			const timeoutHandle = disposableTimeout(() => cancellation.cancel(), this._connectorRefreshTimeoutMs);
			const refresh = this._doRefreshConnectors(cancellation.token).finally(() => {
				timeoutHandle.dispose();
				if (this._connectorRefreshCancellation.value === cancellation) {
					this._connectorRefreshCancellation.clear();
				}
				if (this._connectorRefresh === refresh) {
					this._connectorRefresh = undefined;
				}
			});
			this._connectorRefresh = refresh;
		}
		const listener = token.onCancellationRequested(() => this.cancelConnectorRefresh());
		return this._connectorRefresh.finally(() => listener.dispose());
	}

	cancelConnectorRefresh(): void {
		this._connectorRefreshCancellation.value?.cancel();
	}

	/** Releases callbacks for one server before Stop waits for ordered lifecycle work. */
	cancelMcpServerAuthentication(id: string): void {
		const serverName = this._mcpCustomizations.serverNameForCustomizationId(id);
		if (serverName) {
			this._cancelPendingMcpAuthRequestsForServer(serverName);
		}
	}

	private async _doRefreshConnectors(token: CancellationToken): Promise<void> {
		const canReconcile = () => !token.isCancellationRequested && !this.isDisposed && !this.hasActiveTurn && !this.hasActiveSubagents
			&& this._mcpServerControlOperations === 0
			&& this._configurationService.getRootValue(platformRootSchema, AgentHostMcpConnectorsEnabledConfigKey) === true;
		const canStart = () => canReconcile() && !this._outstandingConnectorReconcile;
		while (this.hasPendingConnectorRefresh && canStart()) {
			const generation = this._connectorRefreshGeneration;
			const requests = [...this._pendingConnectorRefreshes];
			for (const [forceConnectorName, requestGeneration] of requests) {
				if (!canStart()) {
					return;
				}
				let provisionalRestarts: ReadonlyMap<string, IProvisionalMcpServerRestart> | undefined;
				let reconciled = false;
				try {
					// Apply customization enablement before connector reconciliation checks for stopped servers.
					await raceCancellationError(this._reconcileMcpServerEnablement(), token);
					if (!canReconcile()) {
						return;
					}
					// Requests raised before a forced reconcile carry the credential the reconcile replaces.
					const staleAuthRequestIds = forceConnectorName !== undefined ? this._pendingCopilotConnectorAuthRequestIds(forceConnectorName) : [];
					provisionalRestarts = this._markCopilotConnectorServersRestarting(staleAuthRequestIds);
					const result = await reconcileCopilotConnectors(this._wrapper.session, this._logService, {
						forceConnectorName,
						canReconcile,
						preserveStoppedServers: true,
						token,
						onReconcileRequested: rpc => {
							this._recordRuntimeMutation('customizationsChanged');
							this._trackConnectorReconcile(rpc);
						},
					});
					reconciled = result.reconciled;
					if (reconciled) {
						// The runtime restarted these servers, so their requests are stale even if this refresh is now cancelled.
						this._cancelStaleCopilotConnectorAuthRequests(staleAuthRequestIds);
					}
					if (token.isCancellationRequested || this.isDisposed) {
						return;
					}
					// Resolve newly discovered names before publishing their inventory or tools.
					await raceCancellationError(this._reconcileMcpServerEnablement(), token);
					if (token.isCancellationRequested || this.isDisposed) {
						return;
					}
					if (result.connectorServers) {
						this._setCopilotConnectorServers(result.connectorServers);
					}
					await raceCancellationError(this._refreshMcpServersFromRpc(), token);
					if (token.isCancellationRequested || this.isDisposed) {
						return;
					}
					this._fireMcpToolsListChanged();
					if (result.reconciled && this._pendingConnectorRefreshes.get(forceConnectorName) === requestGeneration) {
						this._pendingConnectorRefreshes.delete(forceConnectorName);
					}
				} catch (error) {
					if (isCancellationError(error) && token.isCancellationRequested) {
						this._retryAfterConnectorReconcile ||= !!this._outstandingConnectorReconcile;
						this._logService.info(`[Copilot:${this.sessionId}] Connector MCP refresh was cancelled or timed out; retaining the request for retry`);
					} else {
						this._logService.warn(`[Copilot:${this.sessionId}] Failed to refresh Connector MCP state; retaining the request for retry`, error);
					}
					return;
				} finally {
					if (!reconciled && provisionalRestarts) {
						this._restoreProvisionalMcpServerRestarts(provisionalRestarts);
					}
				}
			}
			if (generation === this._connectorRefreshGeneration) {
				return;
			}
		}
	}

	private _pendingCopilotConnectorAuthRequestIds(connectorName: string): readonly string[] {
		const requestIds: string[] = [];
		for (const [requestId, pending] of this._pendingMcpAuthRequests.entries()) {
			if (this._copilotConnectorServers.get(pending.serverName)?.connectorName === connectorName) {
				requestIds.push(requestId);
			}
		}
		return requestIds;
	}

	/**
	 * A forced reconcile restarts these servers; show it rather than the challenge the restart supersedes. Returns
	 * the provisional states so they can be rolled back if reconciliation does not happen.
	 */
	private _markCopilotConnectorServersRestarting(requestIds: readonly string[]): ReadonlyMap<string, IProvisionalMcpServerRestart> {
		const restarts = new Map<string, IProvisionalMcpServerRestart>();
		const serverNames = new Set(requestIds.map(requestId => this._pendingMcpAuthRequests.getMetadata(requestId)?.serverName));
		for (const serverName of serverNames) {
			const previous = serverName !== undefined ? this._mcpCustomizations.stateForServer(serverName) : undefined;
			if (serverName === undefined || previous?.kind !== McpServerStatus.AuthRequired) {
				continue;
			}
			this._mcpCustomizations.applyOne({
				name: serverName,
				displayName: this._copilotConnectorServers.get(serverName)?.displayName,
				state: { kind: McpServerStatus.Starting },
				allowAuthRequiredToStarting: true,
			});
			const provisional = this._mcpCustomizations.stateForServer(serverName);
			if (provisional && provisional !== previous) {
				restarts.set(serverName, { previous, provisional });
			}
		}
		return restarts;
	}

	/**
	 * Restores the challenge of servers whose forced reconcile never ran. A server whose state changed since, or whose
	 * request no longer waits for authentication, already has a newer lifecycle and is left alone.
	 */
	private _restoreProvisionalMcpServerRestarts(restarts: ReadonlyMap<string, IProvisionalMcpServerRestart>): void {
		if (this.isDisposed) {
			return;
		}
		for (const [serverName, { previous, provisional }] of restarts) {
			if (this._mcpCustomizations.stateForServer(serverName) !== provisional || !this._hasPendingMcpAuthentication(serverName)) {
				continue;
			}
			this._logService.info(`[Copilot:${this.sessionId}] Restoring the authentication challenge of Connector-owned MCP server '${serverName}' because its reconciliation did not run`);
			this._mcpCustomizations.applyOne({
				name: serverName,
				displayName: this._copilotConnectorServers.get(serverName)?.displayName,
				state: previous,
			});
		}
	}

	/**
	 * The runtime drops its side of these requests when it restarts the Connector's servers with the session
	 * credential, so release them; requests raised by the restarted servers are kept.
	 */
	private _cancelStaleCopilotConnectorAuthRequests(requestIds: readonly string[]): void {
		for (const requestId of requestIds) {
			const pending = this._pendingMcpAuthRequests.getMetadata(requestId);
			if (!pending) {
				continue;
			}
			this._disableMcpTokenCompletion(pending.serverName, requestId);
			for (const toolCall of pending.toolCalls) {
				this._emitAction({
					type: ActionType.ChatToolCallAuthResolved,
					turnId: toolCall.turnId,
					toolCallId: toolCall.toolCallId,
				}, toolCall.parentToolCallId);
			}
			if (this._pendingMcpAuthRequests.respond(requestId, { kind: 'cancelled' })) {
				this._logService.info(`[Copilot:${this.sessionId}] Cancelled a stale authentication request from Connector-owned MCP server '${pending.serverName}' after Connector reconciliation`);
			}
		}
	}

	private _trackConnectorReconcile(rpc: Promise<unknown>): void {
		const outstanding = rpc.then(() => undefined, () => undefined).finally(() => {
			if (this._outstandingConnectorReconcile !== outstanding) {
				return;
			}
			this._outstandingConnectorReconcile = undefined;
			if (this._retryAfterConnectorReconcile) {
				this._retryAfterConnectorReconcile = false;
				if (!this.isDisposed && this.hasPendingConnectorRefresh) {
					this._onConnectorRefreshRetryable(this);
				}
			}
		});
		this._outstandingConnectorReconcile = outstanding;
	}

	/**
	 * Captures terminal-only observed usage, excluding descendants and restored history.
	 * Child snapshots are frozen by canonical turn id before their owning tool resumes.
	 */
	getTurnTokenUsage(turnId: string, parentToolCallId?: string): IAgentTurnTokenUsage | undefined {
		if (parentToolCallId) {
			const key = `${parentToolCallId}\0${turnId}`;
			const cached = this._completedTokenUsage.get(key);
			if (cached) {
				return cached;
			}
			const snapshot = this._subagentObservedTokenUsage.get(parentToolCallId)?.snapshot();
			if (snapshot) {
				this._cacheTokenUsage(key, snapshot);
			}
			return snapshot;
		}
		return this._currentTurn.value?.id === turnId
			? this._currentTurn.value.observedTokenUsage.snapshot()
			: this._completedTokenUsage.get(turnId);
	}

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
					processLogs: true,
					previousProcessLogLimit: 1,
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
	private _sessionAiCreditsStatus: NonNullable<UsageInfoMeta['copilotUsage']>['sessionAiCreditsStatus'];
	private readonly _toolUsageRequestIds = new Set<string>();
	private _promptCacheState: ISessionPromptCacheState | undefined;
	private _promptCacheRefreshGeneration = 0;
	/** Reads the latest retained host snapshot for this session. */
	private readonly _hostCustomizations: () => readonly Customization[];
	private readonly _getUserMcpServers: ICopilotAgentSessionOptions['getUserMcpServers'];
	private readonly _sdkExecutionSequencer = new Sequencer();
	private _sdkExecutionStarted = false;
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
	private readonly _wrapperDisposables = this._register(new DisposableStore());
	/** Session error reports deferred while this session is an unclaimed pre-warmed session. */
	private _heldSessionErrorReports: (() => void)[] | undefined;
	/** BYOK providers and models registered on {@link _wrapper}; seeded at launch and grown by {@link syncByokModels}. */
	private _registeredByokConfig: ICopilotByokSessionConfig = {};
	private readonly _byokSync = new Sequencer();
	/** The open on-device attribution turn; only with a local model provider. */
	private _localModelTurn: { readonly turnId: string; readonly generation: number } | undefined;
	/** The last root-scope usage reported for a turn; the attribution is merged into it (`ChatUsage` replaces usage). */
	private _lastRootUsage: { readonly turnId: string; readonly usage: UsageInfo } | undefined;
	/** The session's selected model id, for usage accounting of bound direct chats. */
	private _localModelSelection: string | undefined;
	private _workingDirectoryMutationInProgress = false;
	private _requiresRestartAfterWorkingDirectoryChange = false;
	private _requiresRestartAfterModelChange = false;
	private _requiresRestartAfterTelemetryRevocation = false;
	private readonly _slashCommandProvider: CopilotSlashCommandProvider;
	/** Last agent mode pushed to the SDK via {@link applyMode}, to elide redundant `rpc.mode.set` calls. */
	private _lastAppliedMode: CopilotSdkMode | undefined;
	/** Last SDK agent selection: null is deselected; undefined means a resumed selection is not yet known. */
	private _lastAppliedAgent: string | null | undefined;
	private _lastAppliedPermissionMode: PermissionMode | undefined;
	private readonly _approvalPolicy = new CopilotSessionApprovalPolicy();
	private _experimentalModeEnabled = false;
	private readonly _permissionModeSequencer = new Sequencer();
	/** Settles when this session observes the runtime's top-level `session.managed_settings_resolved` event. */
	private readonly _managedSettingsResolved = new DeferredPromise<void>();
	private readonly _sandbox: CopilotSessionSandbox;
	private readonly _mcpEnablementSequencer = new Sequencer();
	private readonly _mcpServerLifecycleSequencer = new SequencerByKey<string>();
	private _runtimeMutation: { cause: CopilotRuntimeMutation; sequence: number } | undefined;
	private readonly _mcpRestartStates = new Map<string, { sequence: number; running: boolean; connected: boolean; stopped: boolean }>();
	/** The opening launch, whose MCP lifecycle reaches only its launch-time event callback until the wrapper subscribes. */
	private _launchMcpRestartObserver: object | undefined;
	/** Restarts observed before the first wrapper attaches; resumed history, which needs the wrapper, decides their first-turn state. */
	private readonly _unattachedMcpRestarts: CopilotRuntimeRestartEvent[] = [];
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
	private readonly _pendingSteeringFlips = new Map<string, IPendingSteering>();

	/** Snapshot captured at session creation for refresh detection. */
	private readonly _appliedSnapshot: IActiveClientSnapshot;
	private readonly _appliedPluginSources: ReadonlySet<string>;
	private readonly _appliedPluginDirectories: readonly URI[];
	private readonly _projectedMcpServerLaunchEnablement: ReadonlyMap<string, boolean>;
	private readonly _declaredMcpServerNames: ReadonlySet<string>;
	private _mcpLaunchConfigurationDirty = false;
	private readonly _observedMcpEnablementOverrides = new Map<string, boolean>();
	private readonly _mcpConfiguredEnablement = new Map<string, boolean>();
	private readonly _mcpObservedEnablementRequestVersions = new Map<string, number>();
	private readonly _expectedMcpEnablementChanges = new Map<string, boolean>();
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
	private _clientToolNames: ReadonlySet<string>;
	/** Tool-search decision supplied by the launcher that built this SDK session. */
	private _toolSearchActive = false;
	/** Deferred promises for pending client tool calls, keyed by toolCallId. */
	private readonly _pendingClientToolCalls = new PendingRequestRegistry<ToolResultObject>();
	/** One-shot SDK callbacks, keyed by request id; answering one delivers a token but does not confirm acceptance. */
	private readonly _pendingMcpAuthRequests = new PendingRequestRegistry<McpAuthResult | null | undefined, IPendingMcpAuthRequest>();
	private _connectorRefreshGeneration = 0;
	private readonly _pendingConnectorRefreshes = new Map<string | undefined, number>();
	private _connectorRefresh: Promise<void> | undefined;
	private readonly _connectorRefreshCancellation = this._register(new MutableDisposable<CancellationTokenSource>());
	private _outstandingConnectorReconcile: Promise<void> | undefined;
	private _retryAfterConnectorReconcile = false;
	private readonly _connectorRefreshTimeoutMs: number;
	private readonly _onConnectorRefreshRetryable: (session: CopilotAgentSession) => void;
	private _mcpServerControlOperations = 0;
	private readonly _copilotConnectorServers = new Map<string, ICopilotConnectorServer>();
	private _copilotConnectorAuthorizationRequired = false;
	/**
	 * Retains challenge metadata and its latest callback id so token delivery can report Starting.
	 * Connected and needs-auth statuses remain the final lifecycle authority.
	 */
	private readonly _lastMcpAuthRequirements = new Map<string, ILastMcpAuthRequirement>();
	/** Latest SDK status per server, used to notice a server leaving `connected`. */
	private readonly _mcpSdkStatus = new Map<string, SdkMcpServerStatus>();
	/** Servers whose current connection has loaded tools, from lifecycle events or inventory `toolsLoaded`. */
	private readonly _mcpToolsLoaded = new Set<string>();
	/** Invalidates inventory snapshots when lifecycle events or authentication challenges arrive. */
	private _mcpLifecycleVersion = 0;
	private _mcpInventoryRequestVersion = 0;
	/**
	 * Servers reconnecting after an accepted OAuth token. The runtime reports their new connection's tools without a
	 * `connected` status change, so their next tools-loaded event is treated as connected.
	 */
	private readonly _mcpAwaitingOAuthReconnect = new Set<string>();
	/**
	 * Configuration knowledge that MCP provenance is derived from. Only inventory and configuration reads update
	 * these; lifecycle events never do, so a status change can never alter where a server appears to come from.
	 */
	private _mcpInventoryProvenance: ReadonlyMap<string, Pick<McpServer, 'source' | 'sourcePlugin' | 'url'>> = new Map();
	private _userMcpServers: UserMcpServers = {};
	private _userMcpServersRequestVersion = 0;
	/** `pending-edit-content:` URIs written during permission requests, keyed
	 *  by toolCallId. Cleaned up when the permission resolves or the session
	 *  is disposed. */
	private readonly _pendingEditContentUris = new Map<string, URI>();

	private readonly _onDidSessionProgress: Emitter<AgentSignal>;
	private readonly _sessionLauncher: ICopilotSessionLauncher;
	/** Last config materialized and pushed, so unchanged turns do no file I/O or RPC. */
	private _lastAppliedShellInitScripts: string | undefined;
	/** Path registered with the SDK, so content-only changes rewrite the file without an RPC. */
	private _registeredShellInitScriptPath: string | undefined;
	/** Set once a script file may exist; gates the sandbox grant and dispose-time cleanup. */
	private _shellInitScriptMaterialized = false;
	private readonly _shellInitScriptSequencer = new Sequencer();
	private readonly _imageGenerationSequencer = new Sequencer();
	private _appliedImageGenerationEnabled: boolean | undefined;
	private _appliedImageGenerationWatermark: boolean | undefined;
	private _shellInitScriptDisposing = false;
	/**
	 * Scopes this instance's script files so a disposed predecessor's queued
	 * cleanup for the same SDK session cannot delete a successor's live script.
	 */
	private readonly _shellInitScriptInstanceId = generateUuid().substring(0, 8);
	private readonly _launchPlan: CopilotSessionLaunchPlan;
	private readonly _modelConfigurationOwner = generateUuid();
	private _modelConfigurationGeneration = 0;
	private readonly _modelConfigurationRefresh = this._register(new Throttler());
	private _requestedModel: ModelSelection | undefined;
	private readonly _onSessionEvent: ((event: SessionEvent) => void) | undefined;
	private readonly _canvasByInstanceId = new Map<string, ICanvasProjectionEntry>();
	/** In-flight user closes by canvas channel, so concurrent requests from several clients share one RPC. */
	private readonly _canvasCloses = new Map<string, Promise<void>>();
	/** Closed events still expected, by instance ID, for closes applied when the runtime acknowledged them first. */
	private readonly _expectedCanvasClosedEvents = new Map<string, number>();
	private _canvasExtensions: SessionEventPayload<'session.extensions_loaded'>['data']['extensions'] | undefined;
	private _canvasRegistryGeneration = 0;
	private _canvasRegistrySettlementPending = false;
	private readonly _ignoredRestoredCanvasInstanceIds = new Set<string>();
	private _canvasPhase: CanvasProjectionPhase = 'starting';
	/** Canvases handed over by a configuration refresh; their membership stays unpublished until that refresh adopts this session. */
	private _pendingCanvasHandoff: ICopilotCanvasHandoff | undefined;
	private _detectInterruptedTurnOnRestore: boolean;
	/** Notifies the agent that this chat's turn ended. See {@link ICopilotAgentSessionOptions.onTurnEnded}. */
	private readonly _onTurnEnded: () => void;
	private readonly _onSteeringReady: ((session: CopilotAgentSession) => void) | undefined;
	private readonly _computerUseSetup: (() => CopilotComputerUsePermissionSetup | undefined) | undefined;
	/** This chat as the Computer Use setup sees it; one stable object, which the setup compares by identity. */
	private readonly _computerUseSetupChat: ICopilotComputerUseSetupChat;
	/** Lets the agent ask the user to turn on Computer Use; it outlives relaunches so a decline holds for the chat. */
	private readonly _computerUseActivation: CopilotComputerUseActivation;
	private readonly _shellManager: ShellManager | undefined;
	/** Streams runtime-executed shell output into output-only (non-pty) terminal channels. */
	private readonly _nonPtyShellTerminals: NonPtyShellTerminalStreams;
	private _workingDirectory: URI | undefined;
	private _customizationDirectory: URI | undefined;
	private readonly _serverToolHost: IAgentServerToolHost | undefined;
	/** Bridges SDK-reported MCP server state into AHP customization actions. */
	private readonly _mcpCustomizations: McpCustomizationController;
	private readonly _mcpToolRoutingCache: CopilotMcpToolRoutingCache;
	private readonly _mcpToolRoutingEnabled: boolean;
	private readonly _configuredMcpRoutingServers = new Map<string, ICopilotMcpRoutingServer>();
	private readonly _mcpRoutingProxies = new Map<string, IMcpRoutingProxy>();
	private readonly _mcpRoutingActivations = new Map<string, { readonly promise: Promise<void>; readonly cancellation: CancellationTokenSource }>();

	/**
	 * Fans MCP server notifications (today: `notifications/tools/list_changed`)
	 * up to the agent and on to the protocol server. Fired by the
	 * `onToolsUpdated` listener once per ready MCP channel.
	 */
	private readonly _onMcpNotification = this._register(new Emitter<IMcpNotification>());
	readonly onMcpNotification = this._onMcpNotification.event;
	private readonly _onDidRequireAuth = this._register(new Emitter<void>());
	readonly onDidRequireAuth = this._onDidRequireAuth.event;

	/** In-flight server and MCP App sampling executions, keyed by their SDK cancellation handle. */
	private readonly _pendingMcpSamplings = new Set<string>();
	private readonly _pendingSamplingRequests = this._register(new DisposableMap<string, { toolCallId: string; executionId: string; cancellation: CancellationTokenSource; completed: boolean } & IDisposable>());

	/** Maps SDK root-agent turn ids to their owning host protocol turn ids for Fusion event routing. */
	private readonly _hostTurnIdsBySdkTurnId = new Map<string, string>();
	private readonly _fusionProgress = new CopilotFusionProgress();
	private readonly _fusionRequestCorrelation = new CopilotFusionRequestCorrelation();
	/** Retains workflow ownership across turn resets because steering can reassign an SDK turn id. */
	private readonly _fusionEventTurnIds = new Map<string, string>();
	private readonly _reassignedFusionSdkTurnIds = new Set<string>();
	private readonly _pendingFusionEvents: CopilotFusionEvent[] = [];
	private _requiresFusionEventOwnership = false;
	private _fusionTurnCancelled = false;
	private readonly _pendingSettingExperimentTriggers = new Set<string>();
	private _hasFusionRootTurnBoundary = false;
	private readonly _activities: Record<CopilotActivitySource, string | undefined> = { intent: undefined, command: undefined, fusion: undefined, localModel: undefined };
	private _publishedActivity: string | undefined;
	/** Plugin preparation message shown while the current turn waits for its message to be admitted. */
	private _managedPluginActivity: string | undefined;
	/** Shown while launching this session waits on slow managed settings. */
	private _managedSettingsActivity: string | undefined;
	/** Last chat activity this session published for its launch and admission waits. */
	private _publishedWaitActivity: string | undefined;
	/** Plugin preparation failure reported while no turn was waiting; shown in the next sent turn. */
	private _unshownManagedPluginFailure: string | undefined;
	/**
	 * Provisional Fusion tool starts held back from the transcript until a
	 * phase chat, a permission request, or a client tool handler surfaces the tool, keyed by tool call id.
	 */
	private readonly _provisionalFusionToolStarts = new Map<string, SessionEventPayload<'tool.execution_start'>>();
	/**
	 * Provisional Fusion tool calls that were surfaced before commit and so
	 * already own their lifecycle; the committed re-emission is a duplicate.
	 */
	private readonly _surfacedProvisionalFusionToolCallIds = new Set<string>();
	/** Provisional Fusion messages already shown in a phase chat; their committed copies only update accounting unless they are the answer. */
	private readonly _shownProvisionalFusionMessageIds = new Set<string>();
	private readonly _provisionalFusionTaskSummaries = new Map<string, string>();
	private readonly _pendingFusionMessageChunks = new CopilotFusionMessageChunks();
	private readonly _provisionalInlineFusionMessageChunks = new CopilotFusionMessageChunks();
	private _surfaceProvisionalFusionToolStart: ((e: SessionEventPayload<'tool.execution_start'>) => void) | undefined;
	/** Labels of the phase tiles shown this workflow, keyed by phase tool call id; a phase gets a child chat only once an event is routed to it. */
	private readonly _fusionPhases = new Map<string, { readonly label: string; readonly presentation: FusionPhasePresentation }>();
	/** Phase tool call ids whose child chat is open; kept until the workflow ends because commit replays arrive after the phase. */
	private readonly _fusionPhaseChats = new Set<string>();
	/** The latest pending close per phase chat; a close whose drain finishes after a reopen or a newer close must not fire. */
	private readonly _pendingFusionPhaseChatCloses = new Map<string, number>();
	private _fusionPhaseChatCloseGeneration = 0;

	/**
	 * Last SDK-reported MCP status logged per server, suppressing duplicate
	 * records when live events and RPC inventory refreshes report the same state.
	 */
	private readonly _lastLoggedMcpStatus = new Map<string, SdkMcpServerStatus>();

	private readonly _realpath: (path: string) => Promise<string>;

	get mcpServerStates() {
		return this._mcpCustomizations.runtimeStates;
	}

	/** Stateless reporter used to emit restricted GH/MSFT telemetry for this session's model calls. */
	private readonly _telemetryReporter: AgentHostTelemetryReporter;
	private readonly _getTelemetryContext: () => IAgentTelemetryContext | undefined;
	private readonly _repoInfoTelemetry: AgentHostRepoInfoTelemetry;
	private _activeRepoInfoTurn: {
		readonly telemetryMessageId: string;
		readonly githubToken: string | undefined;
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
		@IAgentHostStorageService storageService: IAgentHostStorageService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ICopilotApiService private readonly _copilotApiService: ICopilotApiService,
		@IAgentHostOTelService private readonly _otelService: IAgentHostOTelService,
		@ICopilotHomeService private readonly _copilotHomeService: ICopilotHomeService,
		@IAgentHostFileEditCoordinator private readonly _fileEditCoordinator: IAgentHostFileEditCoordinator,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
	) {
		super();
		this._register(toDisposable(() => {
			this._completedTokenUsage.clear();
			this._subagentObservedTokenUsage.clear();
			this._observedUsageEventIds.clear();
			this.modelCallTurnCorrelation.clearTelemetryContexts();
		}));
		this._abortCts.value = new CancellationTokenSource();
		this._developmentErrorInjectionEnabled = options.enableDevelopmentErrorInjection ?? !product.commit;
		this._subagentTaskCompletionDelay = options.subagentTaskCompletionDelay ?? SUBAGENT_TASK_COMPLETION_DELAY_MS;
		this.sessionId = options.rawSessionId;
		this._owner = options.owner;
		this.launchOwner = options.owner.get();
		this._controlPlaneRpcTimeoutMs = options.controlPlaneRpcTimeoutMs ?? CONTROL_PLANE_RPC_TIMEOUT_MS;
		this._connectorRefreshTimeoutMs = options.connectorRefreshTimeoutMs ?? CONNECTOR_REFRESH_TIMEOUT_MS;
		this._onConnectorRefreshRetryable = options.onConnectorRefreshRetryable ?? (() => { });
		this.resourceUri = options.resource ?? this.launchOwner;
		this._chatChannelUri = options.chatChannelUri;
		this._storageUri = this.resourceUri;
		const sandboxPolicyDisplay = this._instantiationService.createInstance(CopilotSandboxPolicyDisplay, this.sessionId, this._storageUri);
		this._slashCommandProvider = new CopilotSlashCommandProvider(
			() => this._wrapper.session.rpc.commands.list({ includeBuiltins: true, includeSkills: true, includeClientCommands: true }).then(c => c.commands),
			{ getCommandHandler: command => sandboxPolicyDisplay.getHandler(command) ?? getCopilotCustomizationCommandHandler(command, { api: this._wrapper.session.rpc.plugins, reload: reason => this._reloadPlugins(reason) }, options.getInstalledPlugins) },
			this._logService,
		);
		this._onDidSessionProgress = options.onDidSessionProgress;
		this._pendingCanvasHandoff = options.canvasHandoff;
		for (const projection of options.canvasHandoff?.projections ?? []) {
			this._canvasByInstanceId.set(projection.canvas.instanceId, { ...projection, handedOver: true });
			// Withdraws any source published by a replacement the refresh discarded.
			this._publishCanvasState(projection);
		}
		this._sessionLauncher = options.sessionLauncher;
		this._launchPlan = options.launchPlan;
		this._requestedModel = options.launchPlan.kind === 'create' ? options.launchPlan.model : options.launchPlan.fallback.model;
		this._register(toDisposable(() => this._publishModelConfiguration(undefined)));
		this._register(toDisposable(() => this._disposeLocalModelState()));
		const directRequestWaits = options.launchPlan.localModelProvider?.onDidDirectRequestWait;
		if (directRequestWaits) {
			this._register(directRequestWaits(event => this._showLocalModelDirectRequestWait(event)));
		}
		this._onSessionEvent = options.onSessionEvent;
		this._sandbox = this._register(this._instantiationService.createInstance(CopilotSessionSandbox, {
			sessionId: this.sessionId,
			ownerSession: this.launchOwner,
			chat: options.chatChannelUri,
			storage: this._storageUri,
			getConfigWriteTarget: () => this._configWriteTarget(),
			platform: options.platform ?? process.platform,
			getSession: () => this._wrapper?.session,
			getHostSupport: () => this._launchPlan.client.rpc.sandbox.getHostSupport(),
			getCertificateStatus: config => options.sandboxCertificate.getStatus(this._launchPlan.client.rpc.sandbox.proxyCa, config),
			installCertificate: (getConfig, scopeId) => options.sandboxCertificate.install(this._launchPlan.client.rpc.sandbox.proxyCa, getConfig, scopeId),
			rotateCertificate: (getConfig, scopeId) => options.sandboxCertificate.rotate(this._launchPlan.client.rpc.sandbox.proxyCa, getConfig, scopeId),
			removeCertificate: async (scopeId, validate) => { await options.sandboxCertificate.remove(this._launchPlan.client.rpc.sandbox.proxyCa, scopeId, validate); },
			getShellInitDirectory: () => this._shellInitScriptMaterialized ? this._shellInitScriptDirectory() : undefined,
			shellManager: options.shellManager,
			onDidChangeRuntimeConfig: () => this._recordRuntimeMutation('sandboxUpdate'),
		}));
		this._detectInterruptedTurnOnRestore = options.launchPlan.kind === 'resume';
		this._onTurnEnded = options.onTurnEnded ?? (() => { });
		this._onSteeringReady = options.onSteeringReady;
		this._computerUseSetup = options.computerUsePermissionSetup;
		this._computerUseSetupChat = {
			chatUri: options.chatChannelUri.toString(),
			requestInput: request => this._emitAction({ type: ActionType.ChatInputRequested, request }),
			completeInput: (requestId, response) => this._emitAction({ type: ActionType.ChatInputCompleted, requestId, response }),
		};
		const getInstalledPlugins = options.getInstalledPlugins;
		this._computerUseActivation = new CopilotComputerUseActivation({
			// Only VS Code's setting registers the built-in plugin, and only in the shared runtime. Chats with their own GitHub credentials run without it.
			listPlugins: async () => getInstalledPlugins && !this.usesScopedGitHubCredentials && this._configurationService.getRootValue(platformRootSchema, AgentHostComputerUseEnabledConfigKey) === true ? await getInstalledPlugins() : [],
			enablePlugin: async () => { await this._wrapper.session.rpc.plugins.enable({ names: [COMPUTER_USE_PLUGIN_NAME] }); },
			// A card shows only in a running turn. A background subagent can call after the turn ended, or the turn can stop while the plugin is checked.
			canAskUser: () => this.hasActiveTurn && !this._abortToken.isCancellationRequested && !this._isAutopilotMode() && !this._isAutoReplyEnabled(),
			requestInput: request => this._emitAction({ type: ActionType.ChatInputRequested, request }),
		}, `[Copilot:${this.sessionId}]`, this._logService);
		this._shellManager = options.shellManager;
		this._nonPtyShellTerminals = this._register(this._instantiationService.createInstance(NonPtyShellTerminalStreams, options.owner, this._storageUri, options.chatChannelUri));
		this._workingDirectory = options.workingDirectory;
		this._customizationDirectory = options.customizationDirectory;
		this._serverToolHost = options.serverToolHost;
		this._mcpToolRoutingCache = new CopilotMcpToolRoutingCache(storageService, this._logService);
		this._mcpToolRoutingEnabled = this._configurationService.getRootValue(platformRootSchema, AgentHostMcpToolRoutingEnabledConfigKey) === true;
		this._hostCustomizations = options.hostCustomizations ?? (() => []);
		this._getUserMcpServers = options.getUserMcpServers;
		this._realpath = options.realpath ?? realpath;
		this._telemetryReporter = new AgentHostTelemetryReporter(this._telemetryService);
		this._getTelemetryContext = options.telemetryContext ?? (() => undefined);
		this._repoInfoTelemetry = this._register(this._instantiationService.createInstance(AgentHostRepoInfoTelemetry, this._telemetryReporter));

		this._appliedSnapshot = options.clientSnapshot ?? { discoveredAgents: [], additionalRootInstructions: [], tools: [], plugins: [], mcpServers: {} };
		this._declaredMcpServerNames = new Set([
			...Object.keys(this._appliedSnapshot.mcpServers),
			...this._appliedSnapshot.plugins.flatMap(plugin => plugin.mcpServers.map(server => server.name)),
		]);
		this._agentMergeRestrictedMcpServerNames = getAgentMergeRestrictedMcpServerNames(this._launchPlan);
		this._appliedPluginSources = new Set(this._appliedSnapshot.plugins.flatMap(plugin => plugin.sourceUri ? [plugin.sourceUri.toString()] : []));
		this._appliedPluginDirectories = this._appliedSnapshot.plugins.flatMap(plugin => {
			const directory = plugin.pluginDir ?? plugin.resourceDir;
			return directory?.scheme === Schemas.file ? [directory] : [];
		});
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
		const serverToolNames = new Set(this._getServerToolDefinitions().map(tool => tool.name));
		this._clientToolNames = new Set([...clientToolNamesFromSnapshot(this._appliedSnapshot)]
			.filter(name => !serverToolNames.has(name)));
		// Share the agent's live ActiveClientToolSet when provided so client
		// contributions (and owner identity) are observed at stamp time.
		// Standalone / test construction uses a fresh empty registry, which
		// leaves client tool calls unstamped (no owning client).
		this._activeClientToolSet = options.activeClientToolSet ?? new ActiveClientToolSet();
		this._clientReachesChat = options.clientReachesChat ?? (() => true);

		// Keep the connection warm; asynchronous consumers acquire their own references.
		this._register(this._sessionDataService.openDatabase(this._storageUri));
		this._editTracker = this._register(this._instantiationService.createInstance(
			FileEditTracker,
			this._storageUri.toString(),
			() => this._ownerSessionUri.toString(),
			COPILOT_CLI_AGENT_PROVIDER_ID,
		));
		// The edit tool calls wait for the host's changes of their files (see `_handlePreToolUse`),
		// so the user can undo changes while the agent works, and the agent is told.
		this._register(this._fileEditCoordinator.registerCoordinatedProvider(COPILOT_CLI_AGENT_PROVIDER_ID));
		this._register(this._fileEditCoordinator.onDidDiscardFileEdits(edits => {
			if (edits.storage === this._storageUri.toString()) {
				this._discardedEditNotes.push(describeDiscardedFileEdits(edits));
			}
		}));

		const pluginMcpServerSources = new Map((options.clientSnapshot?.plugins ?? []).flatMap(plugin => {
			const sourceUri = plugin.sourceUri;
			return sourceUri === undefined ? [] : plugin.mcpServers.map(server => [server.name, sourceUri.toString()] as const);
		}));
		this._mcpCustomizations = this._register(this._instantiationService.createInstance(McpCustomizationController, {
			provider: COPILOT_CLI_AGENT_PROVIDER_ID,
			chatUri: this._chatChannelUri,
			sessionUri: this.launchOwner,
			// MCP customization ids name the launch owner, so they are published there until the relaunch.
			emit: action => this._emitLaunchAction(action),
			pluginMcpServerSources: () => pluginMcpServerSources,
			resolveProvenance: serverName => this._resolveMcpServerProvenance(serverName, pluginMcpServerSources),
			resolveEnablement: (server, owningPluginUri) => {
				const resolution = this._customizationEnablementService.resolve(this.launchOwner.toString(), targetForMcpServer(server, owningPluginUri, false));
				return resolution.kind === 'resolved' ? resolution.enablement : undefined;
			},
			// The runtime adds its own GitHub server only while the setting is on; a server merely named the same
			// (user, workspace or plugin configured) is not the runtime's, and the setting cannot control it.
			controllingSetting: (serverName, provenance) => serverName === GITHUB_MCP_SERVER_NAME && provenance.source === 'builtin' && !provenance.sourcePlugin
				? AgentHostGitHubMcpServerEnabledSettingId
				: serverName === COMPUTER_USE_PLUGIN_NAME && provenance.source === 'builtin' && provenance.sourcePlugin === COMPUTER_USE_PLUGIN_NAME
					? AgentHostComputerUseEnabledSettingId
					: undefined,
			connectorName: serverName => this._copilotConnectorServers.get(serverName)?.connectorName,
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

	private _shouldDropLateRootTurnEvent(eventType: string, expectedAfterCancellation = false): boolean {
		if (!this._dropLateRootTurnEvents) {
			return false;
		}
		const message = `[Copilot:${this.sessionId}] ${eventType} emitted after cancellation; dropping`;
		if (expectedAfterCancellation) {
			this._logService.trace(message);
		} else {
			this._logService.error(message);
		}
		return true;
	}

	/**
	 * Emits an action about the running process's configuration: session actions go to the owner it launched for,
	 * and none once the chat moved to another session (Block 4, C6): they describe a configuration the new owner does
	 * not have, and its next turn relaunches the process with the new owner's.
	 */
	private _emitLaunchAction(action: SessionAction | ChatAction): void {
		if (isChatAction(action)) {
			this._emitAction(action);
			return;
		}
		if (!isEqual(this.launchOwner, this._owner.get())) {
			this._logService.trace(`[Copilot:${this.sessionId}] Dropping ${action.type} of a runtime launched for ${this.launchOwner.toString()}: its chat moved`);
			return;
		}
		this._onDidSessionProgress.fire({ kind: 'action', resource: this.launchOwner, action });
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
		if (action.type === ActionType.ChatUsage && !parentToolCallId && this._launchPlan.localModelProvider) {
			this._lastRootUsage = { turnId: action.turnId, usage: action.usage };
		}
		this._emitProgress({
			kind: 'action',
			resource: isChatAction(action) ? this._chatChannelUri : this._ownerSessionUri,
			action,
			parentToolCallId,
		});
	}

	/** Keeps child progress ordered while tool results are being persisted, without delaying SDK bookkeeping. */
	private _emitProgress(signal: AgentSignal): void {
		if (signal.kind === 'action' && signal.action.type === ActionType.ChatToolCallComplete) {
			const pending = this._pendingSubagentToolCompletions.get(signal.action.toolCallId);
			if (pending) {
				this._pendingSubagentToolCompletions.delete(signal.action.toolCallId);
				pending.complete(signal);
				return;
			}
		}
		let parentToolCallId: string | undefined;
		switch (signal.kind) {
			case 'subagent_started':
				parentToolCallId = signal.parentToolCallId && this._subagentProgressSequencer.peek(signal.parentToolCallId) ? signal.parentToolCallId : signal.toolCallId;
				break;
			case 'subagent_resumed':
			case 'subagent_completed':
				parentToolCallId = signal.toolCallId;
				break;
			case 'action':
			case 'model_call_completed':
			case 'model_call_finished':
			case 'pending_confirmation':
				parentToolCallId = signal.parentToolCallId;
				break;
		}
		if (parentToolCallId && this._subagentProgressSequencer.peek(parentToolCallId)) {
			const token = this._abortToken;
			const publication = this._subagentProgressSequencer.queue(parentToolCallId, async () => {
				if (!this._store.isDisposed && !token.isCancellationRequested) {
					this._onDidSessionProgress.fire(signal);
				}
			}).catch(error => this._logService.error(`[Copilot:${this.sessionId}] Failed to publish subagent progress`, error));
			if (signal.kind === 'subagent_started' && parentToolCallId !== signal.toolCallId) {
				void this._subagentProgressSequencer.queue(signal.toolCallId, () => publication);
			}
		} else {
			this._onDidSessionProgress.fire(signal);
		}
	}

	// #region On-device model attribution and usage accounting
	//
	// Provider-shaped: the ledger is keyed by the SDK session id the runtime
	// reports to the request handler, and the aggregate rides this session's
	// own usage reports. Persistence and restore are the `persistedTurnUsage`
	// chat contribution's job. Everything here is a no-op without a provider.

	/** Opens the attribution turn for `turnId` and refreshes this session's bound direct family. */
	private _beginLocalModelTurn(turnId: string): void {
		const provider = this._launchPlan.localModelProvider;
		if (!provider) {
			return;
		}
		this._localModelTurn = { turnId, generation: provider.beginTurn(this.sessionId) };
		// Re-reported at every turn so a replaced session instance that cleared the binding is corrected.
		provider.setSessionDirectFamily(this.sessionId, findLocalModelDirectFamily(provider, this._localModelSelection));
	}

	/** Closes the attribution turn `turnId` and returns its aggregate, if it is the open one. */
	private _endLocalModelTurn(turnId: string): ILocalTurnExecution | undefined {
		const open = this._localModelTurn;
		if (!open || open.turnId !== turnId) {
			return undefined;
		}
		this._localModelTurn = undefined;
		return this._launchPlan.localModelProvider?.endTurn(this.sessionId, open.generation);
	}

	/** Closes the attribution turn and reports how an on-device turn ran as `_meta['vscode.localModel']` on its usage; must run before the turn's terminal action, after which the reducer drops usage. */
	private _attributeLocalModelTurn(turnId: string, trustedRootTurn = false): void {
		const execution = this._endLocalModelTurn(turnId);
		if (!execution) {
			return;
		}
		const base = this._lastRootUsage?.turnId === turnId ? this._lastRootUsage.usage : undefined;
		this._emitAction({
			type: ActionType.ChatUsage,
			turnId,
			usage: { ...base, _meta: { ...base?._meta, ...createLocalModelTurnExecutionMeta(execution) } },
		}, undefined, trustedRootTurn);
	}

	/** Records the session's selected model and reports the direct family it binds the session to, if any. */
	private _reportLocalModelSelection(modelId: string | undefined): void {
		const provider = this._launchPlan.localModelProvider;
		if (!provider) {
			return;
		}
		this._localModelSelection = modelId;
		provider.setSessionDirectFamily(this.sessionId, findLocalModelDirectFamily(provider, modelId));
	}

	/** Session teardown: no longer bound to a direct family, and no attribution turn stays open. */
	private _disposeLocalModelState(): void {
		const provider = this._launchPlan.localModelProvider;
		if (!provider) {
			return;
		}
		if (this._localModelTurn) {
			this._endLocalModelTurn(this._localModelTurn.turnId);
		}
		provider.setSessionDirectFamily(this.sessionId, undefined);
	}

	/** Shows this session's on-device request waiting for its model, a slot or prompt reading as the chat's activity, until `done`; waits outside a turn aren't shown. */
	private _showLocalModelDirectRequestWait(event: ILocalModelDirectRequestWait): void {
		if (event.sessionId !== this.sessionId) {
			return;
		}
		if (event.kind === 'done' || !this._currentTurn.value) {
			this._publishActivity('localModel', undefined);
			return;
		}
		if (event.kind === 'queued') {
			this._publishActivity('localModel', localize('copilotAgentSession.localModelQueued', "Waiting for the local model ({0} in queue)…", event.position ?? 1));
			return;
		}
		if (event.kind === 'processing') {
			this._publishActivity('localModel', event.percent === undefined
				? localize('copilotAgentSession.localModelProcessing', "Reading the conversation…")
				: localize('copilotAgentSession.localModelProcessingPercent', "Reading the conversation… {0}%", event.percent));
			return;
		}
		const displayName = this._launchPlan.localModelProvider?.getModelRows().find(row => row.familyId === event.familyId)?.name;
		this._publishActivity('localModel', displayName
			? localize('copilotAgentSession.localModelLoading', "Loading {0}…", displayName)
			: localize('copilotAgentSession.localModelLoadingUnnamed', "Loading the local model…"));
	}

	// #endregion

	private _emitModelCallCompleted(turnId: string, modelCallId: string, parentToolCallId?: string): void {
		const turn = this._currentTurn.value;
		const rootContext = turn?.id === turnId ? turn.telemetryContext : undefined;
		const telemetryContext = parentToolCallId
			? this._subagents.getAccountContext(parentToolCallId)
			: rootContext;
		this.modelCallTurnCorrelation.recordTelemetryContext(modelCallId, telemetryContext);
		this._emitProgress({
			kind: 'model_call_completed',
			resource: this._chatChannelUri,
			turnId,
			modelCallId,
			parentToolCallId,
		});
	}

	private _emitModelCallFinished(event: ICopilotModelCallFinishedEvent): void {
		const parentToolCallId = this._parentToolCallIdForSubagentEvent(event);
		if (event.agentId && !parentToolCallId) {
			this._logService.trace(`[Copilot:${this.sessionId}] Ignoring unroutable subagent model.call_finished: agentId=${event.agentId}, sdkTurnId=${event.data.turnId}`);
			return;
		}
		const turn = this._currentTurn.value;
		let turnId: string | undefined;
		if (event.agentId) {
			turnId = this._turnId;
		} else if (event.data.interactionId) {
			turnId = turn?.interactionIds.has(event.data.interactionId) ? turn.id : undefined;
		} else {
			turnId = turn?.sdkTurnIds.has(event.data.turnId) ? turn.id : undefined;
		}
		// Fusion phase calls lack Fusion attribution and may belong to a cancelled run, so unmapped calls are dropped.
		if (!turnId) {
			this._logService.trace(`[Copilot:${this.sessionId}] Ignoring model.call_finished without a host turn mapping: sdkTurnId=${event.data.turnId}`);
			return;
		}
		if (!event.agentId && turn?.id === turnId) {
			turn.timingRecorder?.markMilestone?.('modelCallFinished');
		}
		this._emitProgress({
			kind: 'model_call_finished',
			resource: this._chatChannelUri,
			turnId,
			modelCallId: event.id,
			dispatchDurationMs: event.data.dispatchDurationMs,
			outcome: event.data.outcome,
			containsBuiltInFileEditRequest: event.data.containsBuiltInFileEditRequest,
			editClassifierVersion: event.data.editClassifierVersion,
			parentToolCallId,
		});
	}

	/**
	 * Promotes a pending steering message into its own protocol turn: closes
	 * the in-flight turn and dispatches {@link ActionType.ChatTurnStarted} with
	 * the steering content. The action's `queuedMessageId` atomically clears
	 * the corresponding pending steering message from session state.
	 *
	 * The active SDK turn association is transferred to the new
	 * {@link CopilotTurn}, so subsequent SDK events target the steering turn
	 * rather than being folded into the original turn.
	 */
	private _beginSteeringTurn(steering: IPendingSteering): void {
		const activeSdkTurnId = this._currentTurn.value?.activeSdkTurnId;
		this._completeActiveTurn();
		const newTurnId = generateUuid();
		steering.promotedTurnId = newTurnId;
		this._emitAction({
			type: ActionType.ChatTurnStarted,
			turnId: newTurnId,
			startedAt: new Date().toISOString(),
			message: steering.pendingMessage.message,
			queuedMessageId: steering.pendingMessage.id,
		});
		// Mirror `resetTurnState` so per-turn counters/mappings (usage total,
		// streaming part ids) don't bleed from the preempted turn into the new
		// steering turn. The SDK is already running the steering message (its
		// `user.message` echo arrived, or it was sent before the SDK went idle):
		// mark it `running` immediately rather than leaving it `pending`,
		// otherwise an abort during the steering turn would treat it as a
		// not-yet-started queued turn and leave it open.
		this.resetTurnState(newTurnId, steering.sender?.clientId, steering.sender?.clientContext.clientType, steering.sender?.clientContext);
		const turn = this._currentTurn.value;
		if (turn) {
			turn.messageCharLen = steering.pendingMessage.message.text.length;
			turn.markRunning();
		}
		if (activeSdkTurnId && turn) {
			turn.activeSdkTurnId = activeSdkTurnId;
			turn.sdkTurnIds.add(activeSdkTurnId);
		}
		if (activeSdkTurnId) {
			this._recordHostSdkTurn(activeSdkTurnId, newTurnId);
		}
	}

	/**
	 * Projects a root request started directly through the provider SDK into the
	 * owning chat. Extensions can call the public `session.send()` API without a
	 * preceding AHP `ChatTurnStarted`; without this bridge their tool calls and
	 * response execute, but the interaction remains invisible to the user.
	 */
	private _beginProviderInitiatedTurn(event: SessionEventPayload<'user.message'>): void {
		const { messageId, turnId: sdkTurnId } = event.data;
		if (!messageId || !sdkTurnId) {
			this._logService.warn(`[Copilot:${this.sessionId}] Ignoring provider-initiated user.message without messageId and turnId`);
			return;
		}

		const turnId = generateUuid();
		this._emitAction({
			type: ActionType.ChatTurnStarted,
			turnId,
			startedAt: event.timestamp,
			message: {
				text: event.data.content,
				origin: { kind: MessageKind.User },
			},
		});
		this.resetTurnState(turnId, undefined, AgentHostClientType.Unknown, undefined, true);
		const turn = this._currentTurn.value;
		if (turn) {
			turn.messageCharLen = event.data.content.length;
			turn.markRunning();
		}
	}

	/** Clears unpromoted steering, including messages still preparing, on abort or disposal. */
	private _drainPendingSteeringFlips(): void {
		if (this._pendingSteeringFlips.size === 0) {
			return;
		}
		// Promoted messages' rows were already cleared by their turn start.
		const ids = [...this._pendingSteeringFlips].filter(([, pending]) => !pending.promotedTurnId).map(([id]) => id);
		this._pendingSteeringFlips.clear();
		for (const id of ids) {
			this._fireSteeringConsumed(id);
		}
	}

	private _fireSteeringConsumed(id: string): void {
		this._onDidSessionProgress.fire({ kind: 'steering_consumed', chat: this._chatChannelUri, id });
	}

	/**
	 * Pops the buffered steering message delivered by the SDK `user.message`
	 * we just observed. The echo carries the id `send` returned, so an exact
	 * id match wins; that keeps identical texts apart, e.g. one being
	 * withdrawn while the other is delivered. Otherwise matches by content,
	 * skipping entries the SDK already identified as a different message.
	 * Matching by content (rather than just popping FIFO) keeps us robust
	 * against the SDK reordering or coalescing entries — concurrent steering
	 * messages with different texts are still matched to the correct one.
	 * Returns `undefined` if no buffered entry matches; the caller treats the
	 * `user.message` as an ordinary echo and skips the turn flip.
	 */
	private _takeMatchingPendingSteering(content: string, messageId: string | undefined): IPendingSteering | undefined {
		if (this._pendingSteeringFlips.size === 0) {
			return undefined;
		}
		if (messageId) {
			for (const [id, pending] of this._pendingSteeringFlips) {
				if (pending.sdkMessageId === messageId) {
					this._pendingSteeringFlips.delete(id);
					return pending;
				}
			}
		}
		let substringMatch: [string, IPendingSteering] | undefined;
		// A promoted message was dispatched before any other pending one, so its echo comes first.
		const entries = [...this._pendingSteeringFlips].sort(([, a], [, b]) => Number(!!b.promotedTurnId) - Number(!!a.promotedTurnId));
		for (const [id, pending] of entries) {
			if (messageId && pending.sdkMessageId) {
				continue;
			}
			if (pending.pendingMessage.message.text === content) {
				this._pendingSteeringFlips.delete(id);
				return pending;
			}
			if (pending.pendingMessage.message.text.length > 0
				&& content.includes(pending.pendingMessage.message.text)
				&& (!substringMatch || pending.pendingMessage.message.text.length > substringMatch[1].pendingMessage.message.text.length)) {
				substringMatch = [id, pending];
			}
		}
		if (substringMatch) {
			this._pendingSteeringFlips.delete(substringMatch[0]);
			return substringMatch[1];
		}
		return undefined;
	}

	private _parentToolCallIdForSubagentEvent(e: { readonly agentId?: string }): string | undefined {
		return e.agentId ? this._subagents.getToolCallId(e.agentId) : undefined;
	}

	/** Nests a root event from a Fusion phase under that phase, opening its chat; unattributed events belong to the running phase. */
	private _fusionPhaseParentToolCallId(agentId: string | undefined, fusion: { readonly fusionId: string; readonly phaseId?: string } | null | undefined): string | undefined {
		const toolCallId = this._fusionPhaseToolCallId(agentId, fusion);
		return toolCallId !== undefined ? this._fusionPhaseContentParentToolCallId(toolCallId) : undefined;
	}

	private _fusionPhaseContentParentToolCallId(phaseToolCallId: string): string | undefined {
		const phase = this._fusionPhases.get(phaseToolCallId);
		if (phase === undefined || phase.presentation === 'inline') {
			return undefined;
		}
		this._openFusionPhaseChat(phaseToolCallId, phase.label);
		return phaseToolCallId;
	}

	/** The phase a root Fusion event belongs to, without opening its chat. */
	private _fusionPhaseToolCallId(agentId: string | undefined, fusion: { readonly fusionId: string; readonly phaseId?: string } | null | undefined): string | undefined {
		if (agentId || this._dropLateRootTurnEvents) {
			return undefined;
		}
		const toolCallId = fusion?.phaseId ? getFusionPhaseToolCallId(fusion.fusionId, fusion.phaseId) : this._fusionProgress.runningPhaseToolCallId;
		return toolCallId !== undefined && this._fusionPhases.has(toolCallId) ? toolCallId : undefined;
	}

	private _updateSubagentModel(parentToolCallId: string, model: string | undefined, configuration?: IAgentRuntimeModelConfiguration): void {
		if (!model) {
			return;
		}
		const previous = this._lastSubagentUsageByToolCallId.get(parentToolCallId);
		const autoModeResolved = this._autoModeResolvedByToolCallId.get(parentToolCallId);
		const modelId = isAutoModel(model) ? autoModeResolved?.chosenModel ?? model : model;
		const metadata = { ...previous?._meta };
		if (configuration && (configuration.reasoningEffort !== undefined || configuration.contextTier !== undefined || readAgentRuntimeModelConfiguration(previous))) {
			metadata[agentModelConfigurationMetaKey] = configuration;
		}
		if (autoModeResolved) {
			metadata.autoModeResolved = autoModeResolved;
		} else {
			delete metadata.autoModeResolved;
		}
		const usage: UsageInfo = { ...previous, model: modelId };
		if (Object.keys(metadata).length > 0) {
			usage._meta = metadata;
		} else {
			delete usage._meta;
		}
		if (equals(previous, usage)) {
			return;
		}
		this._lastSubagentUsageByToolCallId.set(parentToolCallId, usage);
		this._emitAction({ type: ActionType.ChatUsage, turnId: this._turnId, usage }, parentToolCallId);
	}

	private _resumeSubagentForEvent(e: { readonly agentId?: string }, message?: Message): void {
		if (this._dropLateRootTurnEvents) {
			return;
		}
		if (!e.agentId) {
			return;
		}
		const parentToolCallId = this._subagents.getToolCallId(e.agentId);
		if (!parentToolCallId) {
			return;
		}
		const previousUsage = this._lastSubagentUsageByToolCallId.get(parentToolCallId);
		this._subagents.takeInitialPrompt(e.agentId);
		if (this._subagents.isActive(e.agentId)) {
			if (!message) {
				this._subagentTaskCompletionSchedulers.get(e.agentId)?.schedule();
				return;
			}
			const autoModeResolved = this._autoModeResolvedByToolCallId.get(parentToolCallId);
			this._subagents.deactivate(e.agentId);
			this._publishSubagentTurnCompletion(parentToolCallId);
			if (autoModeResolved) {
				this._autoModeResolvedByToolCallId.set(parentToolCallId, autoModeResolved);
			}
		}
		this._subagentTaskCompletionSchedulers.deleteAndDispose(e.agentId);
		this._pendingSubagentLifecycleCompletions.delete(e.agentId);
		this._subagents.resume(e.agentId, this._currentTurn.value?.id);
		this._subagentObservedTokenUsage.set(parentToolCallId, new ObservedTokenUsage());
		this._subagentActivityRevisions.set(e.agentId, (this._subagentActivityRevisions.get(e.agentId) ?? 0) + 1);
		this._emitProgress({
			kind: 'subagent_resumed',
			chat: this._chatChannelUri,
			toolCallId: parentToolCallId,
			message,
		});
		const usage = this._lastSubagentUsageByToolCallId.get(parentToolCallId);
		if (usage) {
			// Model routing can arrive before the child turn exists.
			this._emitAction({ type: ActionType.ChatUsage, turnId: this._turnId, usage }, parentToolCallId);
		} else {
			this._updateSubagentModel(parentToolCallId, previousUsage?.model, readAgentRuntimeModelConfiguration(previousUsage));
		}
	}

	private _completeSubagentTurn(agentId: string | undefined, toolCallId?: string): void {
		if (agentId) {
			this._subagentTaskCompletionSchedulers.deleteAndDispose(agentId);
			this._pendingSubagentLifecycleCompletions.delete(agentId);
			this._subagentActivityRevisions.delete(agentId);
			if (!this._subagents.deactivate(agentId)) {
				return;
			}
		} else if (!toolCallId) {
			return;
		}
		this._publishSubagentTurnCompletion(toolCallId ?? (agentId ? this._subagents.getToolCallId(agentId) : undefined));
		// A background subagent can settle after the root turn already went idle. Report idleness
		// again so work deferred while it ran, such as a CLI client restart, is not stranded.
		if (agentId && !this.hasActiveTurn && !this.hasActiveSubagents) {
			this._reportTurnEnded();
		}
	}

	private _publishSubagentTurnCompletion(parentToolCallId: string | undefined): void {
		if (!parentToolCallId) {
			return;
		}
		this._clearSubagentResponseParts(parentToolCallId);
		if (this._dropLateRootTurnEvents) {
			this._subagents.endTurn(parentToolCallId);
			this._subagentDirectUsageByToolCallId.delete(parentToolCallId);
			this._subagentObservedTokenUsage.delete(parentToolCallId);
			this._lastSubagentUsageByToolCallId.delete(parentToolCallId);
			this._autoModeResolvedByToolCallId.delete(parentToolCallId);
			return;
		}
		this._emitProgress({
			kind: 'subagent_completed',
			chat: this._chatChannelUri,
			toolCallId: parentToolCallId,
		});
		this._subagentObservedTokenUsage.delete(parentToolCallId);
		this._subagents.endTurn(parentToolCallId);
		this._subagentDirectUsageByToolCallId.delete(parentToolCallId);
		this._lastSubagentUsageByToolCallId.delete(parentToolCallId);
		this._autoModeResolvedByToolCallId.delete(parentToolCallId);
	}

	private _getOrCreateSubagentCompletionScheduler(agentId: string): RunOnceScheduler {
		let scheduler = this._subagentTaskCompletionSchedulers.get(agentId);
		if (!scheduler) {
			const confirmation = new RunOnceScheduler(() => {
				// Confirm against the task list so a child that resumed meanwhile stays active. A superseded
				// or failed confirmation re-arms itself until the child is completed or running again.
				this._reconcileBackgroundTasks().then(settled => {
					if (!settled && this._subagentTaskCompletionSchedulers.get(agentId) === confirmation) {
						confirmation.schedule();
					}
				}, err => {
					this._logService.warn(`[Copilot:${this.sessionId}] Failed to confirm subagent completion: ${getErrorMessage(err)}`);
					if (this._subagentTaskCompletionSchedulers.get(agentId) === confirmation) {
						confirmation.schedule();
					}
				});
			}, this._subagentTaskCompletionDelay);
			scheduler = confirmation;
			this._subagentTaskCompletionSchedulers.set(agentId, scheduler);
		}
		return scheduler;
	}

	private _scheduleSubagentTurnCompletion(agentId: string, toolCallId?: string, outcome?: SubagentTurnOutcome): void {
		if (!this._subagents.isActive(agentId)) {
			return;
		}
		const parentToolCallId = toolCallId ?? this._subagents.getToolCallId(agentId);
		if (!parentToolCallId) {
			return;
		}
		if (this._subagentTaskCompletionDelay <= 0) {
			this._settleSubagentTurn(agentId, parentToolCallId, outcome);
			return;
		}
		const scheduler = this._getOrCreateSubagentCompletionScheduler(agentId);
		scheduler.schedule();
	}

	private _scheduleSubagentLifecycleCompletion(agentId: string | undefined, toolCallId: string, outcome?: SubagentTurnOutcome): void {
		const mappedAgentId = agentId ?? this._subagents.getAgentId(toolCallId);
		if (!mappedAgentId) {
			if (this._subagents.hasRootTurn(toolCallId)) {
				this._emitSubagentOutcome(toolCallId, outcome);
				this._completeSubagentTurn(undefined, toolCallId);
			}
			return;
		}
		if (!this._subagents.isActive(mappedAgentId)) {
			return;
		}
		this._pendingSubagentLifecycleCompletions.set(mappedAgentId, {
			toolCallId,
			activityRevision: this._subagentActivityRevisions.get(mappedAgentId),
			outcome,
		});
		this._getOrCreateSubagentCompletionScheduler(mappedAgentId).schedule();
	}

	/** Completes an active child turn, first ending it as failed or cancelled when it did not succeed. */
	private _settleSubagentTurn(agentId: string, toolCallId: string, outcome: SubagentTurnOutcome | undefined): void {
		if (this._subagents.isActive(agentId)) {
			this._emitSubagentOutcome(toolCallId, outcome);
		}
		this._completeSubagentTurn(agentId, toolCallId);
	}

	/** Task status is authoritative; a pending lifecycle event only supplies details the status lacks. */
	private _taskOutcome(task: Extract<Awaited<ReturnType<CopilotSession['rpc']['tasks']['list']>>['tasks'][number], { type: 'agent' }>): SubagentTurnOutcome | undefined {
		const pending = this._pendingSubagentLifecycleCompletions.get(task.id)?.outcome;
		switch (task.status) {
			case 'failed':
				return pending?.kind === 'failed' ? pending : { kind: 'failed', message: task.error ?? localize('copilotAgent.subagentFailed', "Subagent failed."), durationMs: task.activeTimeMs };
			case 'cancelled':
				return pending?.kind === 'cancelled' ? pending : { kind: 'cancelled', durationMs: task.activeTimeMs };
			default:
				return undefined;
		}
	}

	/** Ends the child turn as failed or cancelled; the completion that follows then finds no active turn. */
	private _emitSubagentOutcome(toolCallId: string, outcome: SubagentTurnOutcome | undefined): void {
		if (outcome?.kind === 'failed') {
			this._emitAction({
				type: ActionType.ChatError,
				turnId: this._turnId,
				duration: outcome.durationMs ?? 0,
				part: createErrorResponsePart({ errorType: 'subagentFailed', message: outcome.message }),
			}, toolCallId);
		} else if (outcome?.kind === 'cancelled') {
			this._emitAction({
				type: ActionType.ChatTurnCancelled,
				turnId: this._turnId,
				duration: outcome.durationMs ?? 0,
			}, toolCallId);
		}
	}

	private _observeTokenUsage(parentToolCallId: string | undefined, eventId: string, model: string | undefined, scope: 'direct-model' | 'compaction', tokens: UsageContext, reasoningEffort?: string, apiCallId?: string): void {
		const recordId = apiCallId ? `api:${apiCallId}` : eventId ? `event:${eventId}` : undefined;
		const identity = recordId ? `${scope}\0${recordId}` : undefined;
		if (identity && this._observedUsageEventIds.has(identity)) {
			return;
		}
		let observed: ObservedTokenUsage | undefined;
		if (parentToolCallId) {
			observed = this._subagentObservedTokenUsage.get(parentToolCallId);
			if (!observed) {
				observed = new ObservedTokenUsage();
				this._subagentObservedTokenUsage.set(parentToolCallId, observed);
			}
		} else {
			observed = this._currentTurn.value?.observedTokenUsage;
		}
		if (!observed) {
			return;
		}
		if (identity) {
			this._observedUsageEventIds.add(identity);
			if (this._observedUsageEventIds.size > 4096) {
				this._observedUsageEventIds.delete(this._observedUsageEventIds.values().next().value!);
			}
		}
		// Use the call's reported effort, never the selected model's effort for a helper.
		const effort = isReasoningEffortLevel(reasoningEffort) ? reasoningEffort : undefined;
		observed.add(recordId, model, scope, tokens, effort);
	}

	private _cacheTokenUsage(key: string, snapshot: IAgentTurnTokenUsage): void {
		this._completedTokenUsage.set(key, snapshot);
		if (this._completedTokenUsage.size > 32) {
			this._completedTokenUsage.delete(this._completedTokenUsage.keys().next().value!);
		}
	}

	/** Resolves false when a newer reconcile superseded this one; the newest queued reconcile processes every task. */
	private _reconcileBackgroundTasks(): Promise<boolean> {
		const revision = ++this._backgroundTaskStatusRevision;
		return this._backgroundTaskStatusRefreshThrottler.queue(async () => {
			const activityRevisions = new Map(this._subagentActivityRevisions);
			if (this._refreshDetachedBackgroundShells) {
				this._refreshDetachedBackgroundShells = false;
				await this._wrapper.session.rpc.tasks.refresh();
			}
			const read = this._nonPtyShellTerminals.beginShellTaskRead();
			const tasks = await this._wrapper.session.rpc.tasks.list();
			if (this._store.isDisposed) {
				return false;
			}
			// Settling shells uses every read, because even a superseded one shows which shells had exited by then.
			this._nonPtyShellTerminals.reconcileBackgroundShells(new Set(tasks.tasks.flatMap(task => task.type === 'shell' && (task.status === 'running' || task.status === 'idle') ? [task.id] : [])), read);
			if (revision !== this._backgroundTaskStatusRevision) {
				return false;
			}
			this._publishBackgroundWork(tasks.tasks);
			const agentTaskIds = new Set<string>();
			for (const task of tasks.tasks) {
				if (task.type !== 'agent') {
					continue;
				}
				agentTaskIds.add(task.id);
				const displayName = subagentChatTitle(task.description, task.displayName);
				if (displayName) {
					this._subagents.seedDisplayName(task.id, displayName);
				}
				if (activityRevisions.get(task.id) !== this._subagentActivityRevisions.get(task.id)) {
					continue;
				}
				if (task.status === 'idle' || task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
					const scheduler = this._subagentTaskCompletionSchedulers.get(task.id);
					if (scheduler && !scheduler.isScheduled()) {
						this._settleSubagentTurn(task.id, task.toolCallId, this._taskOutcome(task));
					} else if (!scheduler) {
						this._scheduleSubagentTurnCompletion(task.id, task.toolCallId, this._taskOutcome(task));
					}
				} else {
					this._pendingSubagentLifecycleCompletions.delete(task.id);
					this._subagentTaskCompletionSchedulers.deleteAndDispose(task.id);
				}
			}
			for (const [agentId, pending] of this._pendingSubagentLifecycleCompletions) {
				if (agentTaskIds.has(agentId)) {
					continue;
				}
				if (pending.activityRevision !== this._subagentActivityRevisions.get(agentId)) {
					this._pendingSubagentLifecycleCompletions.delete(agentId);
					this._subagentTaskCompletionSchedulers.deleteAndDispose(agentId);
					continue;
				}
				const scheduler = this._subagentTaskCompletionSchedulers.get(agentId);
				if (scheduler && !scheduler.isScheduled()) {
					this._settleSubagentTurn(agentId, pending.toolCallId, pending.outcome);
				}
			}
			return true;
		});
	}

	private _refreshBackgroundTasks(refreshDetached = false): void {
		this._refreshDetachedBackgroundShells ||= refreshDetached;
		void this._reconcileBackgroundTasks().catch(err => {
			this._logService.warn(`[Copilot:${this.sessionId}] Failed to reconcile background task status: ${getErrorMessage(err)}`);
			if (!this._store.isDisposed && this._backgroundWorkObservers > 0) {
				this._backgroundShellRefresh.schedule();
			}
		});
	}

	/**
	 * Streams a detached shell's output into the terminal of the tool call
	 * that started it. A detached shell sends no `tool.shell_output`, so each
	 * read continues from the previous read's cursor and waits for more output
	 * until it reaches the end of the log of the exited shell.
	 */
	private _readDetachedShellOutput(toolCallId: string, shellId: string): void {
		const read = async () => {
			let cursor: string | undefined;
			while (this._nonPtyShellTerminals.isReadingDetachedShell(toolCallId)) {
				const page = await this._wrapper.session.rpc.tasks.readOutput({ id: shellId, cursor, waitMs: DETACHED_SHELL_OUTPUT_WAIT_MS });
				if (this._store.isDisposed) {
					return;
				}
				cursor = page.cursor;
				if (page.text) {
					this._nonPtyShellTerminals.appendDetachedShellOutput(toolCallId, page.text);
				}
				if (page.exit) {
					this._nonPtyShellTerminals.completeDetachedShell(toolCallId, page.exit.exitCode);
					// Remove the shell from the chat's background work without waiting for the next task read.
					this._refreshBackgroundTasks();
					return;
				}
			}
		};
		void read().catch(err => {
			if (!this._store.isDisposed) {
				this._logService.warn(`[Copilot:${this.sessionId}] Stopped reading detached shell ${shellId} output: ${getErrorMessage(err)}`);
				this._nonPtyShellTerminals.stopReadingDetachedShell(toolCallId);
			}
		});
	}

	observeBackgroundWork(published: readonly BackgroundWork[]): IDisposable {
		// A session that replaced another, for example after a client restart, starts from what
		// the chat shows so its first read removes entries the runtime no longer reports.
		for (const work of published) {
			if (!this._backgroundWork.has(work.id)) {
				this._backgroundWork.set(work.id, work);
			}
		}
		this._backgroundWorkObservers++;
		this._republishBackgroundWork = true;
		this._refreshBackgroundTasks(true);
		return toDisposable(() => {
			if (--this._backgroundWorkObservers === 0) {
				this._backgroundShellRefresh.cancel();
			}
		});
	}

	/**
	 * Stops a background shell this session published as stoppable. Resolves
	 * false when the entry is unknown or its command had already finished. The
	 * runtime then reports the change, which removes the shell's entry.
	 */
	async stopBackgroundWork(id: string): Promise<boolean> {
		const work = this._backgroundWork.get(id);
		const shellId = work?.kind === BackgroundWorkKind.Shell && canStopBackgroundWork(work) ? readCopilotShellId(work) : undefined;
		if (shellId === undefined) {
			return false;
		}
		const { cancelled } = await this._wrapper.session.rpc.tasks.cancel({ id: shellId });
		return cancelled;
	}

	private _publishBackgroundWork(tasks: Awaited<ReturnType<CopilotSession['rpc']['tasks']['list']>>['tasks']): void {
		const entries = new Map<string, BackgroundWork>();
		for (const task of tasks) {
			const work = this._toBackgroundWork(task);
			if (work) {
				entries.set(work.id, work);
			}
		}
		for (const id of this._backgroundWork.keys()) {
			if (!entries.has(id)) {
				this._emitAction({ type: ActionType.ChatBackgroundWorkRemoved, id });
				this._backgroundWork.delete(id);
			}
		}
		for (const [id, work] of entries) {
			if (this._republishBackgroundWork || !equals(this._backgroundWork.get(id), work)) {
				this._emitAction({ type: ActionType.ChatBackgroundWorkSet, work });
				this._backgroundWork.set(id, work);
			}
		}
		this._republishBackgroundWork = false;
		if (this._backgroundWorkObservers > 0 && [...entries.values()].some(work => work.kind === BackgroundWorkKind.Shell && readCopilotShellAttachment(work) === 'detached')) {
			if (!this._backgroundShellRefresh.isScheduled()) {
				this._backgroundShellRefresh.schedule();
			}
		} else {
			this._backgroundShellRefresh.cancel();
		}
	}

	private _toBackgroundWork(task: Awaited<ReturnType<CopilotSession['rpc']['tasks']['list']>>['tasks'][number]): BackgroundWork | undefined {
		if (task.type === 'shell' && task.executionMode !== 'sync' && (task.status === 'running' || task.status === 'idle')) {
			const id = `shell:${task.id}`;
			// A detached shell restored after a client restart can be listed without its description or command.
			const shown = this._backgroundWork.get(id);
			const shownShell = shown?.kind === BackgroundWorkKind.Shell ? shown : undefined;
			const terminal = this._nonPtyShellTerminals.getBackgroundShellTerminal(task.id);
			const attachment = task.attachmentMode === 'detached' ? 'detached' : 'attached';
			// Attached shells can always be stopped. Detached shells are stopped through
			// their process ID, so one restored without a recorded ID can't be.
			const stoppable = attachment === 'attached' || task.pid !== undefined;
			return {
				kind: BackgroundWorkKind.Shell,
				id,
				label: task.description || shownShell?.label || '',
				command: task.command || shownShell?.command || '',
				startedAt: task.startedAt,
				...(terminal ? { terminal } : {}),
				_meta: { ...toCopilotBackgroundShellMeta(task.id, attachment), ...(stoppable ? toStoppableBackgroundWorkMeta() : {}) },
			};
		}
		// An idle background agent has already reported back; only a running one will resume the chat.
		if (task.type === 'agent' && task.executionMode === 'background' && task.status === 'running') {
			return {
				kind: BackgroundWorkKind.Subagent,
				id: `subagent:${task.id}`,
				label: task.displayName?.trim() || task.description,
				startedAt: task.startedAt,
				chat: this._subagentChatUri(task.toolCallId),
			};
		}
		return undefined;
	}

	/** The id of the subagent chat spawned by `toolCallId` of this chat's conversation. */
	private _subagentChatUri(toolCallId: string): string {
		return subagentChatUri(this._owner.getSubagentChatUriFormat(), this._ownerSessionUri.toString(), this._chatChannelUri.toString(), toolCallId);
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
		if (!turn || (parentToolCallId && !this._subagents.belongsToRootTurn(parentToolCallId, turn.id))) {
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
		const applied = this._appliedSnapshot.tools.find(tool => tool.name === toolName);
		const provides = (clientId: string) => !!applied && this._activeClientToolSet.get(clientId)
			.some(tool => tool.name === toolName && structuralToolsEqual([applied], [tool]));
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
		const clientToolName = this._clientToolName(toolName);
		const networkRestrictions = this._clientToolNames.has(clientToolName)
			? getCopilotBrowserSandboxNetworkRestrictions(this._configurationService, { session: this.launchOwner.toString(), chat: this._chatChannelUri.toString() }, clientToolName) : undefined;
		return {
			...(networkRestrictions ? {
				'vscode.copilotSandboxNetworkRestrictions': networkRestrictions,
			} : {}),
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
			invocationMessage: getStreamingInvocationMessage(toolName, getToolDisplayName(toolName), partialInput, path => this._resolveEditFilePath(path), this._resolveAgentName),
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

	private _getResponsePartState(parentToolCallId: string | undefined): ICopilotResponsePartState | undefined {
		// Fusion phase content belongs to the root turn; retained subagent content does not.
		return parentToolCallId !== undefined && !this._fusionPhases.has(parentToolCallId)
			? this._subagentResponsePartState
			: this._currentTurn.value;
	}

	private _clearSubagentResponseParts(parentToolCallId: string): void {
		this._subagentResponsePartState.markdownPartIds.delete(parentToolCallId);
		this._subagentResponsePartState.reasoningPartIds.delete(parentToolCallId);
	}

	private _beginToolCallRound(parentToolCallId: string | undefined): void {
		const scope = parentToolCallId ?? '';
		const state = this._getResponsePartState(parentToolCallId);
		state?.markdownPartIds.delete(scope);
		state?.reasoningPartIds.delete(scope);
	}

	/**
	 * Starts a fresh `pending` turn, discarding any per-turn streaming state
	 * from a previous turn so the next text/reasoning chunk allocates a new
	 * response part. The turn becomes `running` on the first SDK event.
	 */
	resetTurnState(turnId: string, senderClientId?: string, clientType = AgentHostClientType.Unknown, clientContext = createUnknownAgentHostClientTelemetryContext(clientType), providerInitiated = false): void {
		this._clearPendingFusionEvents();
		this._fusionRequestCorrelation.clear();
		this._fusionTurnCancelled = false;
		this._hasFusionRootTurnBoundary = false;
		this._fusionProgress.reset();
		this._clearProvisionalFusionState();
		this._completeFusionPhaseChats();
		// Labels outlive a closed chat within the turn so a resumed workflow reopens it rather than routing to the root.
		this._fusionPhases.clear();
		this._clearActivity();
		this._setManagedPluginActivity(undefined);
		this._detectInterruptedTurnOnRestore = false;
		this._streamingToolCalls.clear();
		this._streamingToolDisplaySchedulers.clearAndDisposeAll();
		this._currentTurn.value = new CopilotTurn(turnId, this._nextTurnOrdinal++, senderClientId, clientContext, this._getTelemetryContext(), providerInitiated);
		this._beginLocalModelTurn(turnId);
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
				const meteredOperationCount = this._toolUsageRequestIds.size;
				const metrics = await this._wrapper.session.rpc.usage.getMetrics();
				const modelId = metrics.currentModel;
				if (!this._store.isDisposed && modelId && promptCacheRefreshGeneration === this._promptCacheRefreshGeneration) {
					const cacheExpiresAt = metrics.modelMetrics[modelId]?.cacheExpiresAt;
					this._setPromptCacheState(cacheExpiresAt ? { modelId, cacheExpiresAt } : undefined);
				}

				const total = metrics.totalNanoAiu;
				const rawMetrics: typeof metrics & { aiCreditsStatus?: unknown } = metrics;
				const status = isAiCreditsStatus(rawMetrics.aiCreditsStatus) ? rawMetrics.aiCreditsStatus : undefined;
				if (this._store.isDisposed || meteredOperationCount !== this._toolUsageRequestIds.size
					|| typeof total !== 'number' || !Number.isFinite(total) || total < 0
					|| (total === this._sessionTotalNanoAiu && status === this._sessionAiCreditsStatus)) {
					return false;
				}
				this._sessionTotalNanoAiu = total;
				this._sessionAiCreditsStatus = status;
				this._publishSessionUsage();
				return true;
			});
		} catch (err) {
			// Also covers the rejection from a throttler disposed mid-read.
			this._logService.trace(`[Copilot:${this.sessionId}] usage.getMetrics RPC failed: ${getErrorMessage(err)}`);
			return false;
		}
	}

	private _publishSessionUsage(): void {
		this._onDidSessionProgress.fire({
			kind: 'chat_usage',
			chat: this._chatChannelUri,
			usage: {
				totalNanoAiu: this._sessionTotalNanoAiu,
				...(this._sessionAiCreditsStatus !== undefined ? { aiCreditsStatus: this._sessionAiCreditsStatus } : {}),
			},
		});
	}

	/**
	 * The parent-scope Copilot billing metadata for the active turn: the turn's
	 * own accumulated cost plus the SDK's session-wide total. Absent until
	 * billed usage or its completeness has been reported.
	 */
	private _parentCopilotUsageMeta(): UsageInfoMeta['copilotUsage'] | undefined {
		const turnNanoAiu = this._currentTurn.value?.copilotNanoAiu ?? 0;
		const reportedTurnCost = this._currentTurn.value?.directUsage.copilotNanoAiu !== undefined;
		if (!turnNanoAiu && !reportedTurnCost && !this._sessionTotalNanoAiu && this._sessionAiCreditsStatus === undefined) {
			return undefined;
		}
		return {
			...(turnNanoAiu || reportedTurnCost ? { totalNanoAiu: turnNanoAiu } : {}),
			...(this._sessionTotalNanoAiu || this._sessionAiCreditsStatus !== undefined ? { sessionTotalNanoAiu: this._sessionTotalNanoAiu } : {}),
			...(this._sessionAiCreditsStatus !== undefined ? { sessionAiCreditsStatus: this._sessionAiCreditsStatus } : {}),
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
		return compactContextAttribution(attribution);
	}

	private _completeActiveTurn(trustedRootTurn = false): void {
		const turn = this._currentTurn.value;
		if (!turn) {
			return;
		}
		turn.markCompleted();
		this._hasCompletedTurn = true;
		this._reportToolCallDetails(turn, 'success');
		this._attributeLocalModelTurn(turn.id, trustedRootTurn);
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
		this._attributeLocalModelTurn(turn.id);
		this._emitAction({
			type: ActionType.ChatError,
			turnId: turn.id,
			duration: turn.duration,
			part: createErrorResponsePart(error, true),
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
		const turn = this._currentTurn.value;
		this._clearPendingFusionEvents();
		this._hasFusionRootTurnBoundary = false;
		this._fusionProgress.reset();
		this._clearProvisionalFusionState();
		this._clearActivity();
		this._setManagedPluginActivity(undefined);
		if (turn) {
			this._cacheTokenUsage(turn.id, turn.observedTokenUsage.snapshot());
			// Aborted, discarded or rejected turns report no attribution; just close the ledger turn.
			this._endLocalModelTurn(turn.id);
			// A promoted message whose turn ended without its echo will never be echoed into it.
			for (const [id, pending] of this._pendingSteeringFlips) {
				if (pending.promotedTurnId === turn.id) {
					this._pendingSteeringFlips.delete(id);
				}
			}
		}
		if (this._resumingTurnAwaitingProviderStart === this._currentTurn.value) {
			this._resumingTurnAwaitingProviderStart = undefined;
		}
		this._currentTurn.clear();
		this._computerUseSetup?.()?.cancelChat(this._computerUseSetupChat);
		this._computerUseActivation.cancel();
		this._settleIdleWaiters(true);
		this._agentMergeTurn = false;
		this._streamingToolCalls.clear();
		this._streamingToolDisplaySchedulers.clearAndDisposeAll();
		this._reportTurnEnded();
	}

	private _reportTurnEnded(): void {
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

	private _settleIdleWaiters(idle: boolean): void {
		for (const waiter of this._idleWaiters) {
			waiter.complete(idle);
		}
		this._idleWaiters.clear();
	}

	private _reportToolCallDetails(turn: CopilotTurn, responseType: 'success' | 'cancelled' | 'failed'): void {
		if (turn.toolCallDetailsReported) {
			return;
		}
		turn.toolCallDetailsReported = true;
		void this._telemetryReporter.toolCallDetails({
			clientContext: turn.clientContext,
			telemetryContext: turn.telemetryContext,
			provider: COPILOT_CLI_AGENT_PROVIDER_ID,
			session: this.resourceUri.toString(),
			owner: this._ownerSessionUri.toString(),
			chat: this._chatChannelUri.toString(),
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
		const confirmKind = permissionResultToConfirmKind(record?.resultKind, record?.decisionSource, record?.resolvedByHook === true);
		this._telemetryReporter.toolApproval({
			clientContext: this._currentTurn.value?.clientContext,
			telemetryContext: this._currentTurn.value?.telemetryContext,
			provider: COPILOT_CLI_AGENT_PROVIDER_ID,
			session: this.resourceUri.toString(),
			owner: this._ownerSessionUri.toString(),
			turnId: this._turnId,
			toolId: toolName,
			toolSourceKind: this._toolSourceKindFor(toolName, mcpServerName),
			confirmKind,
			decisionSource: record?.decisionSource,
			permissionResult: record?.resultKind,
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
		if (!trustedRootTurn && this._shouldDropLateRootTurnEvent('assistant.message_delta')) {
			return;
		}
		const state = this._getResponsePartState(parentToolCallId);
		if (!state) {
			this._logService.error(`[Copilot:${this.sessionId}] Markdown delta emitted with no active turn; dropping`);
			return;
		}
		const markdownScope = parentToolCallId ?? '';
		let partId = state.markdownPartIds.get(markdownScope);
		if (!partId) {
			partId = generateUuid();
			state.markdownPartIds.set(markdownScope, partId);
			this._emitAction({
				type: ActionType.ChatResponsePart,
				turnId: this._turnId,
				part: { kind: ResponsePartKind.Markdown, id: partId, content },
			}, parentToolCallId, trustedRootTurn);
			return;
		}
		this._emitAction({
			type: ActionType.ChatDelta,
			turnId: this._turnId,
			partId,
			content,
		}, parentToolCallId, trustedRootTurn);
	}

	private _emitSlashCommandOutput(content: string, meta?: Record<string, unknown>): void {
		const turn = this._currentTurn.value;
		if (!meta || !turn) {
			this._emitMarkdownDelta(content, undefined, true);
			return;
		}
		this._emitAction({
			type: ActionType.ChatResponsePart,
			turnId: turn.id,
			part: { kind: ResponsePartKind.SystemNotification, content: { markdown: content }, _meta: meta },
		}, undefined, true);
	}

	/** Emits a reasoning delta, similar to {@link _emitMarkdownDelta} but for reasoning parts. */
	private _emitReasoningDelta(content: string, parentToolCallId?: string): void {
		if (this._shouldDropLateRootTurnEvent('assistant.reasoning_delta')) {
			return;
		}
		const state = this._getResponsePartState(parentToolCallId);
		if (!state) {
			this._logService.error(`[Copilot:${this.sessionId}] Reasoning delta emitted with no active turn; dropping`);
			return;
		}
		const reasoningScope = parentToolCallId ?? '';
		let partId = state.reasoningPartIds.get(reasoningScope);
		if (!partId) {
			partId = generateUuid();
			state.reasoningPartIds.set(reasoningScope, partId);
			this._emitAction({
				type: ActionType.ChatResponsePart,
				turnId: this._turnId,
				part: { kind: ResponsePartKind.Reasoning, id: partId, content },
			}, parentToolCallId);
			return;
		}
		this._emitAction({
			type: ActionType.ChatReasoning,
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

	get requiresRestartAfterWorkingDirectoryChange(): boolean {
		return this._requiresRestartAfterWorkingDirectoryChange;
	}

	get requiresRestartAfterModelChange(): boolean {
		return this._requiresRestartAfterModelChange;
	}

	markModelChangeRequiresRestart(): void {
		this._requiresRestartAfterModelChange = true;
	}

	get requiresRestartAfterTelemetryRevocation(): boolean {
		return this._requiresRestartAfterTelemetryRevocation;
	}

	markTelemetryRevocationRequiresRestart(): void {
		this._requiresRestartAfterTelemetryRevocation = true;
	}

	get requiresMcpLaunchConfigurationRefresh(): boolean {
		this._markMcpLaunchConfigurationDirty();
		return this._mcpLaunchConfigurationDirty;
	}

	/**
	 * Set when a control-plane RPC timed out. Timing out abandons the await but
	 * cannot cancel the in-flight SDK request, so the model/agent/history state
	 * this session believes it applied may not match the SDK's. The next send
	 * discards and resumes the SDK session so a late-settling request lands on a
	 * session nothing is using rather than mutating live state.
	 */
	get requiresControlPlaneResync(): boolean {
		return this._controlPlaneDesynchronized;
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

	/** Whether this chat was launched workspace-less (its recorded per-chat decision). */
	get workspaceless(): boolean {
		return this._launchPlan.workspaceless === true;
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
	private _createClientSdkTools(toolSearchActive: boolean, hostToolNames?: ReadonlySet<string>): Tool<any>[] {
		this._toolSearchActive = toolSearchActive;
		if (hostToolNames) {
			this._clientToolNames = new Set([...this._clientToolNames].filter(name => !hostToolNames.has(name)));
		}
		const tools = this._appliedSnapshot.tools.filter(tool => this._clientToolNames.has(tool.name));
		if (tools.length === 0) {
			return [];
		}
		const sessionTools = toolSearchActive
			? tools
			: tools.filter(def => def.name !== CLIENT_TOOL_SEARCH_REFERENCE_NAME);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const sdkTools = sessionTools.map((def): Tool<any> => {
			if (toolSearchActive && def.name === CLIENT_TOOL_SEARCH_REFERENCE_NAME) {
				return {
					name: RUNTIME_TOOL_SEARCH_TOOL_NAME,
					description: def.description ?? '',
					parameters: def.inputSchema ?? { type: 'object' as const, properties: {} },
					overridesBuiltInTool: true,
					defer: 'never',
					skipPermission: true,
					handler: this._guarded(async (args: Record<string, unknown>, invocation) => {
						try {
							this._surfaceUnobservedClientToolStart(invocation);
							const candidates = this._toToolSearchCandidates(invocation.availableTools);
							const tracked = this._activeToolCalls.get(invocation.toolCallId);
							if (tracked && !tracked.contributor) {
								return this._searchToolsOnHost(args, candidates);
							}
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
				handler: this._guarded(async (_args: Record<string, unknown>, invocation) => {
					const { toolCallId } = invocation;
					try {
						this._surfaceUnobservedClientToolStart(invocation);
						return await this._pendingClientToolCalls.register(toolCallId);
					} catch (error) {
						this._logService.error(error, `[Copilot:${this.sessionId}] Failed in client tool handler: tool=${def.name}, toolCallId=${toolCallId}`);
						throw error;
					}
				}, this._toolSearchFailure('Tool call cancelled: session is aborting'), 'client-tool'),
			};
		});
		this._mcpRoutingProxies.clear();
		if (toolSearchActive) {
			sdkTools.push(...this._createMcpRoutingProxyTools());
		}
		const state = this._stateManager.getSessionState(this.launchOwner.toString());
		const chat = this._chatChannelUri.toString();
		const routingServers = [...this._mcpRoutingProxies.values()].map(proxy => proxy.server.serverName).sort();
		if (!equals([...readMcpRoutingServers(state, chat)].sort(), routingServers)) {
			this._emitLaunchAction({
				type: ActionType.SessionMetaChanged,
				_meta: withMcpRoutingServers(state?._meta, chat, routingServers),
			});
		}
		return sdkTools;
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private _createMcpRoutingProxyTools(): Tool<any>[] {
		this._mcpRoutingProxies.clear();
		if (!this._mcpToolRoutingEnabled) {
			return [];
		}
		const tools: Tool<Record<string, never>>[] = [];
		for (const server of this._configuredMcpRoutingServers.values()) {
			const cached = this._mcpToolRoutingCache.get(server);
			const name = getMcpRoutingProxyName(server);
			this._mcpRoutingProxies.set(name, { server });
			tools.push({
				name,
				description: getMcpRoutingProxyDescription(server.serverName, cached?.tools ?? []).slice(0, MCP_ROUTING_PROXY_DESCRIPTION_MAX_LENGTH),
				parameters: { type: 'object', properties: {}, additionalProperties: false },
				defer: 'auto',
				handler: this._guarded(async (_args, invocation) => {
					this._surfaceUnobservedClientToolStart(invocation);
					try {
						await this._activateMcpRoutingServer(server.serverName);
						const liveTools = await this._refreshMcpToolRoutingCache(server.serverName);
						return {
							resultType: 'success',
							textResultForLlm: `The ${server.serverName} MCP server is connected. Search tools again to use one of its current tools: ${JSON.stringify(liveTools.map(tool => tool.name))}`,
						};
					} catch (error) {
						const message = getErrorMessage(error);
						this._logService.error(error, `[Copilot:${this.sessionId}] Failed to activate cached MCP routing entry for '${server.serverName}'`);
						return this._toolSearchFailure(message);
					}
				}, this._toolSearchFailure('Tool call cancelled: session is aborting'), 'mcp-routing'),
			});
		}
		return tools;
	}

	private async _activateMcpRoutingServer(serverName: string): Promise<void> {
		const existing = this._mcpRoutingActivations.get(serverName);
		if (existing) {
			return existing.promise;
		}
		const cancellation = new CancellationTokenSource(this._abortToken);
		const activation = this._doActivateMcpRoutingServer(serverName, cancellation.token);
		this._mcpRoutingActivations.set(serverName, { promise: activation, cancellation });
		try {
			await activation;
		} finally {
			this._mcpRoutingActivations.delete(serverName);
			// waitForState only releases its cancellation listener when the token is cancelled.
			cancellation.dispose(true);
		}
	}

	private async _doActivateMcpRoutingServer(serverName: string, token: CancellationToken): Promise<void> {
		await raceCancellationError(this._refreshMcpServersFromRpc(), token);
		const authentication = this._adoptPendingMcpAuthentication(serverName);
		const state = this._mcpCustomizations.stateForServer(serverName);
		if (authentication) {
			await raceCancellationError(authentication, token);
		} else if (state?.kind !== McpServerStatus.Starting && state?.kind !== McpServerStatus.Ready) {
			await this._startMcpServer(serverName, token);
		}
		await raceCancellationError(this._refreshMcpServersFromRpc(), token);
		await waitForState(
			this._mcpCustomizations.runtimeStates.map(() => this._mcpCustomizations.stateForServer(serverName)),
			state => state?.kind === McpServerStatus.Ready,
			state => state?.kind === McpServerStatus.Error
				? new Error(state.error.message)
				: !state || state.kind === McpServerStatus.Stopped
					? new Error(`MCP server '${serverName}' stopped before its tools became available.`)
					: undefined,
			token,
		);
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
		for (const pending of this._pendingSubagentToolCompletions.values()) {
			pending.complete(undefined);
		}
		this._pendingSubagentToolCompletions.clear();
		this._subagentProgressSequencer = new SequencerByKey<string>();
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
				await this._abortBarrier?.p;
				this._logService.info(`[Copilot:${this.sessionId}] Discarding ${label} callback received while aborting`);
				return cancelled;
			}
			const result = await raceCancellation(handler(...args), token, cancelled);
			if (token.isCancellationRequested) {
				await this._abortBarrier?.p;
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
			.filter(tool => tool.deferLoading && this._isMcpRoutingProxyNeeded(tool.name, availableTools))
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
			invocationMessage: getInvocationMessage(tracked.toolName, tracked.displayName, tracked.parameters, path => this._resolveEditFilePath(path), this._resolveAgentName),
			toolInput: getToolInputString(tracked.toolName, tracked.parameters, tracked.parameters ? tryStringify(tracked.parameters) : undefined),
			confirmed: ToolCallConfirmationReason.NotNeeded,
			_meta: toToolCallMeta({ ...(tracked.meta ?? {}), toolSearchCandidates: candidates }),
		}, tracked.parentToolCallId);
	}

	private _emitPendingImageReady(tracked: ICopilotActiveToolCall): void {
		const ready = tracked.pendingImageReady;
		if (ready) {
			tracked.pendingImageReady = undefined;
			this._emitAction({ ...ready, _meta: toToolCallMeta(tracked.meta ?? {}) }, tracked.parentToolCallId);
		}
	}

	private _toolSearchFailure(message: string): ToolResultObject {
		return { textResultForLlm: message, resultType: 'failure', error: message, toolReferences: [] };
	}

	private _searchToolsOnHost(args: Record<string, unknown>, candidates: readonly IToolSearchCandidate[]): ToolResultObject {
		const query = isString(args.query) ? args.query.trim() : '';
		if (!query) {
			return this._toolSearchFailure('Error: query parameter is required');
		}
		const hostCandidates = candidates.filter(candidate => !this._clientToolNames.has(candidate.name));
		const { toolNames, textResultForLlm } = searchToolsWithoutClient(query, hostCandidates);
		this._logService.info(`[Copilot:${this.sessionId}] tool_search override: no connected client, matched [${toolNames.join(', ')}] among ${hostCandidates.length} host-runnable deferred tools`);
		return { textResultForLlm, resultType: 'success', toolReferences: [...toolNames] };
	}

	private _toToolSearchResult(clientResult: ToolResultObject, availableTools: readonly CurrentToolMetadata[] | undefined): ToolResultObject {
		const deferred = new Map<string, string>();
		for (const tool of availableTools ?? []) {
			if (tool.deferLoading && this._isMcpRoutingProxyNeeded(tool.name, availableTools)) {
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

	private _isMcpRoutingProxyNeeded(toolName: string, availableTools: readonly CurrentToolMetadata[] | undefined): boolean {
		const proxy = this._mcpRoutingProxies.get(toolName);
		if (!proxy) {
			return true;
		}
		const serverEnablement = this._mcpCustomizations.serverEnablement().find(server => server.serverName === proxy.server.serverName);
		return serverEnablement?.enabled !== false && !availableTools?.some(tool => tool.mcpServerName === proxy.server.serverName);
	}

	/** Builds routing hints without projecting SDK-owned user servers into the session configuration. */
	private _initializeMcpRoutingServers(): void {
		this._configuredMcpRoutingServers.clear();
		const disabled = new Set([
			...this._launchPlan.disabledRootMcpServers ?? [],
			...this._appliedSnapshot.plugins.flatMap(plugin => plugin.disabledMcpServers ?? []),
		]);
		for (const [serverName, configuration] of Object.entries({ ...this._userMcpServers, ...this._appliedSnapshot.mcpServers })) {
			if (!disabled.has(serverName)) {
				this._configuredMcpRoutingServers.set(serverName, { serverName, configuration });
			}
		}
		for (const plugin of this._appliedSnapshot.plugins) {
			for (const server of plugin.mcpServers) {
				if (!disabled.has(server.name) && (isMcpServerExplicitlyProjected(server) || !this._configuredMcpRoutingServers.has(server.name))) {
					this._configuredMcpRoutingServers.set(server.name, { serverName: server.name, configuration: server.configuration });
				}
			}
		}
	}

	private async _refreshMcpToolRoutingCache(serverName: string): Promise<readonly { readonly name: string; readonly description?: string }[]> {
		if (!this._mcpToolRoutingEnabled) {
			return [];
		}
		const server = this._configuredMcpRoutingServers.get(serverName);
		if (!server) {
			throw new Error(`MCP server '${serverName}' is not configured for this session.`);
		}
		const result = await this._wrapper.session.rpc.mcp.listTools({ serverName });
		const tools = result.tools.map(tool => ({ name: tool.name, ...(tool.description ? { description: tool.description } : {}) }));
		this._mcpToolRoutingCache.store(server, tools);
		return tools;
	}

	private _refreshReadyMcpToolRoutingCaches(): void {
		for (const { serverName } of this._mcpCustomizations.readyChannels()) {
			void this._refreshMcpToolRoutingCache(serverName).catch(error => {
				this._logService.warn(`[Copilot:${this.sessionId}] Failed to refresh MCP tool routing metadata for '${serverName}'`, error);
			});
		}
	}

	private _parseToolSearchNames(text: string): string[] | undefined {
		try {
			const parsed = JSON.parse(text);
			return Array.isArray(parsed) ? parsed.filter((name): name is string => typeof name === 'string') : undefined;
		} catch {
			return undefined;
		}
	}

	private _getServerToolDefinitions(): readonly IAgentServerToolDefinition[] {
		return (this._serverToolHost?.getDefinitionsForSession(this.launchOwner.toString()) ?? [])
			.filter(def => !this._launchPlan.isEphemeral || def.enabledForEphemeralSessions);
	}

	/**
	 * Builds SDK tool handlers for the agent host's server tools. Each handler
	 * executes the tool against this session's state via the
	 * {@link IAgentServerToolHost} and returns its textual result. Returns an
	 * empty list when no server-tool host is wired (e.g. test / standalone
	 * construction).
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private _createServerSdkTools(toolSearchActive = this._isToolSearchActive()): Tool<any>[] {
		const host = this._serverToolHost;
		if (!host) {
			return [];
		}
		return this._getServerToolDefinitions().map(def => ({
			name: def.name,
			description: def.description ?? '',
			parameters: def.inputSchema ?? { type: 'object' as const, properties: {} },
			defer: def.deferLoading !== false && toolSearchActive ? 'auto' as const : 'never' as const,
			handler: async (args: Record<string, unknown>, invocation: ToolInvocation): Promise<ToolResultObject> => {
				try {
					// Native SDK workers inherit tools but invocation payloads omit their agent identity.
					const toolCall = this._activeToolCalls.get(invocation.toolCallId);
					if (def.topLevelChatOnly && (!toolCall || toolCall.parentToolCallId || this._unroutableSubagentToolCallIds.has(invocation.toolCallId))) {
						throw new Error('This tool can only be called from a top-level chat with a known root tool-call origin.');
					}
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
			this.respondToPermissionRequest(toolCallId, true, { decisionSource: 'host_policy' });
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
	async initializeSession(token = CancellationToken.None): Promise<void> {
		this._assertScopedGitHubCredential();
		await this._customizationEnablementService.initializeSession(this.launchOwner.toString());
		await this._refreshUserMcpServers();
		if (this._mcpToolRoutingEnabled) {
			this._initializeMcpRoutingServers();
		}
		if (this._store.isDisposed) {
			throw new CancellationError();
		}
		this._register(this._customizationEnablementService.onDidChange(event => {
			if (!event.sessions.includes(this.launchOwner.toString())) {
				return;
			}
			this._markMcpLaunchConfigurationDirty();
			this._reconcileMcpServerEnablement().catch(error => this._logService.error(error, `[Copilot:${this.sessionId}] Failed to reconcile MCP enablement after customizations changed`));
		}));
		this._subscribeToPermissionConfigChanges();
		await this._initializeSdkWrapper(token);

		// Advertise the agent host's server tools for this session so clients
		// see them as server-provided. Execution happens in-process via the SDK
		// tool handlers built in `_createServerSdkTools`.
		this._serverToolHost?.advertise(this._storageUri.toString());
	}

	/**
	 * Re-launches the underlying SDK session if telemetry was revoked after
	 * {@link initializeSession} finished its launch loop (e.g. while
	 * `beforeRegistration` or `refreshConnectors` was running).
	 */
	async revalidateTelemetryBeforeRegistration(): Promise<void> {
		while (!this._store.isDisposed && this._requiresRestartAfterTelemetryRevocation) {
			await this._relaunchSdkWrapperForTelemetryRevocation();
		}
	}

	private async _initializeSdkWrapper(token = CancellationToken.None): Promise<void> {
		while (true) {
			this._requiresRestartAfterTelemetryRevocation = false;
			this._runtimeMutation = undefined;
			this._mcpRestartStates.clear();
			const launchCancellation = new CancellationTokenSource(this._lifetimeCts.token);
			const cancellation = token.onCancellationRequested(() => launchCancellation.cancel());
			let wrapper: CopilotSessionWrapper;
			try {
				if (token.isCancellationRequested) {
					throw new CancellationError();
				}
				wrapper = await this._sessionLauncher.launch(this._launchPlan, this._createRuntimeAdapter(launchCancellation.token));
			} finally {
				cancellation.dispose();
				launchCancellation.dispose();
			}
			if (this._store.isDisposed) {
				wrapper.dispose();
				throw new CancellationError();
			}
			if (this._requiresRestartAfterTelemetryRevocation) {
				await wrapper.disconnect().catch(() => { /* best-effort teardown */ });
				wrapper.dispose();
				if (this._store.isDisposed) {
					throw new CancellationError();
				}
				continue;
			}
			this._wrapperDisposables.clear();
			this._wrapper = this._wrapperDisposables.add(wrapper);
			this._mcpAwaitingOAuthReconnect.clear();
			this._lastAppliedAgent = this._launchPlan.kind === 'create' ? this._launchPlan.resolvedAgentName ?? null : undefined;
			this._registeredByokConfig = wrapper.launchByokConfig;
			this._reportLocalModelSelection(this._launchPlan.kind === 'create' ? this._launchPlan.model?.id : this._launchPlan.fallback.model?.id);
			this._canvasExtensions = undefined;
			this._ignoredRestoredCanvasInstanceIds.clear();
			if (this._launchPlan.kind === 'resume') {
				for (const canvas of wrapper.session.openCanvases) {
					if (!this._canvasByInstanceId.has(canvas.instanceId)) {
						this._ignoredRestoredCanvasInstanceIds.add(canvas.instanceId);
					}
				}
			}
			if (!wrapper.canvasRuntimeEnabled) {
				this._canvasByInstanceId.clear();
			}
			const samplingInterest = await wrapper.session.rpc.eventLog.registerInterest({ eventType: 'sampling.requested' });
			if (this._store.isDisposed) {
				throw new CancellationError();
			}
			wrapper.setBeforeDisconnect(async () => {
				await Promise.allSettled(this._pendingOutputCaptures);
				try {
					await this._awaitControlPlaneRpc('rpc.eventLog.releaseInterest', wrapper.session.rpc.eventLog.releaseInterest({ handle: samplingInterest.handle }));
				} catch (error) {
					this._logService.error(error, `[Copilot:${this.sessionId}] Failed to release sampling event interest`);
				}
			});
			this._launchMcpRestartObserver = undefined;
			for (const event of this._unattachedMcpRestarts.splice(0)) {
				void reportCopilotRuntimeRestart(this._telemetryService, event, this.completedTurnHistory);
			}
			this._subscribeToEvents(this._wrapperDisposables);
			this._subscribeToSdkEvents(this._wrapperDisposables);
			this._readCommittedAutoTier(wrapper);
			this._subscribeForMemoInvalidation(this._wrapperDisposables);
			this._subscribeForInstructionsCollectedTelemetry(this._wrapperDisposables);
			this._appliedImageGenerationEnabled = wrapper.launchImageGenerationEnabled;
			this._appliedImageGenerationWatermark = wrapper.launchImageGenerationWatermark;
			await this._syncImageGeneration();
			this.refreshModelConfiguration();
			await this._sandbox.updateDiagnostics();
			await this._waitForCanvasExtensions(wrapper);
			await this._reconcileCanvasHandoff(wrapper);
			await this._syncShellInitScript();
			this._promptCacheState = this._promptCache.read(this.resourceUri);
			if (this._launchPlan.kind === 'resume') {
				await this._refreshSessionUsageMetrics();
				if (this._store.isDisposed) {
					throw new CancellationError();
				}
				// Warm the persisted-event reconstruction so canonical subagent names are known before the next turn labels agent reads.
				this._getMappedEvents().catch(() => { /* surfaced to whichever caller reads the messages */ });
			}
			if (!this._requiresRestartAfterTelemetryRevocation) {
				return;
			}
			await this._disconnectAndClearWrapper();
		}
	}

	private async _relaunchSdkWrapperForTelemetryRevocation(): Promise<void> {
		const agent = this._lastAppliedAgent;
		void reportCopilotRuntimeRestart(this._telemetryService, {
			...createCopilotFailureCorrelation(this.resourceUri, this._chatChannelUri, this._turnId, this.sessionId, this.currentTurnClientContext),
			kind: 'sdkSession', cause: 'telemetryRevoked', firstTurn: !this.hasCompletedTurn, phase: 'idle',
		}, this.completedTurnHistory);
		await this._disconnectAndClearWrapper();
		if (this._store.isDisposed) {
			throw new CancellationError();
		}
		await this._initializeSdkWrapper();
		if (agent !== undefined) {
			await this.setAgent(agent ?? undefined);
		}
	}

	private async _disconnectAndClearWrapper(): Promise<void> {
		const wrapper = this._wrapper;
		if (wrapper) {
			await wrapper.disconnect().catch(() => { /* best-effort teardown */ });
		}
		this._wrapperDisposables.clear();
		this._lastAppliedShellInitScripts = undefined;
		this._registeredShellInitScriptPath = undefined;
	}

	/** Persists the host-owned catalog title through the runtime's naming API. */
	async synchronizeTitle(title: string): Promise<void> {
		const name = Array.from(title.trim()).slice(0, 100).join('');
		if (name && !this._store.isDisposed) {
			const completed = await raceTimeout(this._wrapper.session.rpc.name.set({ name }).then(() => true), this._controlPlaneRpcTimeoutMs);
			if (!completed) {
				throw new Error('Mission Control title synchronization timed out');
			}
		}
	}

	/** Refreshes inventory observers after registration without changing projected canvas membership. */
	publishCanvases(): void {
		if (this._wrapper.canvasRuntimeEnabled && this._canvasPhase === 'live') {
			this._publishCanvases();
		}
	}

	async listCanvases(): Promise<AgentCanvasDefinitionSnapshot> {
		if (!this._wrapper.canvasRuntimeEnabled) {
			throw new Error('Canvases are disabled for this session.');
		}
		const generation = this._canvasRegistryGeneration;
		const [result, extensions] = await Promise.all([
			this._awaitControlPlaneRpc('rpc.canvas.list', this._wrapper.session.rpc.canvas.list()),
			this._awaitControlPlaneRpc('rpc.extensions.list', this._wrapper.session.rpc.extensions.list()),
		]);
		if (generation !== this._canvasRegistryGeneration) {
			this.publishCanvases();
			return undefined;
		}
		if (extensions.extensions.some(extension => extension.status === 'starting')) {
			this._markCanvasRegistryUnsettled();
			return undefined;
		}
		this._publishSettledCanvasRegistry();
		const extensionSources = new Map(extensions.extensions.map(extension => [extension.id, this._canvasExtensionSource(extension.source)]));
		return result.canvases.map(canvas => ({
			canvasId: canvas.canvasId,
			extensionId: canvas.extensionId,
			extensionSource: extensionSources.get(canvas.extensionId) ?? 'unknown',
			...(canvas.extensionName ? { extensionName: canvas.extensionName } : {}),
			displayName: canvas.displayName,
			description: canvas.description,
			requiresInput: this._canvasRequiresInput(canvas.inputSchema),
			actionCount: canvas.actions?.length ?? 0,
		}));
	}

	async listExtensions(): Promise<readonly IAgentExtensionInfo[]> {
		const result = await this._awaitControlPlaneRpc('rpc.extensions.list', this._wrapper.session.rpc.extensions.list());
		if (!result || !Array.isArray(result.extensions)) {
			throw new Error('Copilot returned an invalid live extension inventory.');
		}
		return result.extensions.flatMap((extension, index) => {
			if (!extension || typeof extension !== 'object'
				|| typeof extension.id !== 'string' || !extension.id
				|| typeof extension.name !== 'string' || !extension.name
				|| typeof extension.source !== 'string'
				|| typeof extension.status !== 'string') {
				this._logService.warn(`[Copilot:${this.sessionId}] Ignoring invalid live extension inventory entry at index ${index}`);
				return [];
			}
			const source = this._canvasExtensionSource(extension.source);
			if (source === 'session') {
				return [];
			}
			if (source === 'unknown') {
				this._logService.warn(`[Copilot:${this.sessionId}] Ignoring live extension inventory entry with unsupported source '${extension.source}'`);
				return [];
			}
			return [{
				id: extension.id,
				name: extension.name,
				source,
				status: this._extensionStatus(extension.status),
			}];
		});
	}

	async openCanvas(request: IAgentCanvasOpenRequest): Promise<void> {
		if (!this._wrapper.canvasRuntimeEnabled) {
			throw new Error('Canvases are disabled for this session.');
		}
		await this._awaitControlPlaneRpc('rpc.canvas.open', this._wrapper.session.rpc.canvas.open(request));
	}

	/** Releases this session's canvases and hands them over without sources, so a replacement runtime can keep their channels. */
	takeCanvasProjection(): ICopilotCanvasHandoff | undefined {
		const projections = [...this._canvasByInstanceId.values()].map(({ resource, canvas: { url: _url, ...canvas } }) => ({ resource, canvas }));
		this._releaseCanvasRegistrySnapshot();
		this._canvasPhase = 'released';
		this._canvasByInstanceId.clear();
		this._ignoredRestoredCanvasInstanceIds.clear();
		this._expectedCanvasClosedEvents.clear();
		if (projections.length === 0) {
			return undefined;
		}
		for (const projection of projections) {
			this._publishCanvasState(projection);
		}
		return { projections };
	}

	/** Takes ownership of canvases handed to this session once its refresh keeps it, publishing membership changes made meanwhile. */
	adoptCanvasHandoff(handoff: ICopilotCanvasHandoff): boolean {
		if (this._store.isDisposed || this._pendingCanvasHandoff !== handoff) {
			return false;
		}
		this._pendingCanvasHandoff = undefined;
		this._publishAuthoritativeCanvasRegistry();
		return true;
	}

	/**
	 * Closes the canvas lifetime the request names if this chat still projects it;
	 * the runtime then notifies its provider. A request for a canvas that was since
	 * closed or reopened, or was never presented to clients, leaves canvases open.
	 */
	async closeCanvas(request: IAgentCanvasCloseRequest): Promise<void> {
		if (!this._wrapper.canvasRuntimeEnabled) {
			throw new Error('Canvases are disabled for this session.');
		}
		const projection = [...this._canvasByInstanceId.values()].find(candidate => isEqual(candidate.resource, request.resource));
		if (!projection) {
			return;
		}
		const key = projection.resource.toString();
		let closing = this._canvasCloses.get(key);
		if (!closing) {
			closing = this._closeProjectedCanvas(projection).finally(() => this._canvasCloses.delete(key));
			this._canvasCloses.set(key, closing);
		}
		await closing;
	}

	private async _closeProjectedCanvas(projection: ICopilotCanvasProjection): Promise<void> {
		const instanceId = projection.canvas.instanceId;
		await this._awaitControlPlaneRpc('rpc.canvas.close', this._wrapper.session.rpc.canvas.close({ instanceId }));
		// The runtime's closed event normally removes the projection first. If it has not
		// arrived yet, converge now and expect it, so it cannot remove a canvas projected
		// under the same instance ID before it arrives.
		const current = this._canvasByInstanceId.get(instanceId);
		if (current && isEqual(current.resource, projection.resource)) {
			this._canvasByInstanceId.delete(instanceId);
			this._expectedCanvasClosedEvents.set(instanceId, (this._expectedCanvasClosedEvents.get(instanceId) ?? 0) + 1);
			this._publishCanvases();
		}
	}

	/** Handles the runtime's closed event for an instance whose projection may belong to a later lifetime than the event. */
	private _handleCanvasClosed(wrapper: CopilotSessionWrapper, instanceId: string): void {
		const expected = this._expectedCanvasClosedEvents.get(instanceId);
		if (!expected) {
			if (this._canvasByInstanceId.delete(instanceId)) {
				this._publishCanvases();
			}
			return;
		}
		if (expected > 1) {
			this._expectedCanvasClosedEvents.set(instanceId, expected - 1);
		} else {
			this._expectedCanvasClosedEvents.delete(instanceId);
		}
		// The event may confirm a close this session already applied or end a canvas projected since.
		const projection = this._canvasByInstanceId.get(instanceId);
		if (projection) {
			void this._removeCanvasUnlessOpen(wrapper, projection);
		}
	}

	/** Removes a projection unless the runtime still reports its instance open. */
	private async _removeCanvasUnlessOpen(wrapper: CopilotSessionWrapper, projection: ICopilotCanvasProjection): Promise<void> {
		let openCanvases: CopilotSession['openCanvases'];
		try {
			({ openCanvases } = await this._awaitControlPlaneRpc('rpc.canvas.listOpen', wrapper.session.rpc.canvas.listOpen()));
		} catch (error) {
			this._logService.warn(`[Copilot:${this.sessionId}] Failed to confirm an open canvas after a closed event: ${getErrorMessage(error)}`);
			return;
		}
		const instanceId = projection.canvas.instanceId;
		const current = this._canvasByInstanceId.get(instanceId);
		if (this._store.isDisposed || !current || !isEqual(current.resource, projection.resource) || openCanvases.some(canvas => canvas.instanceId === instanceId)) {
			return;
		}
		this._canvasByInstanceId.delete(instanceId);
		this._publishCanvases();
	}

	private _canvasExtensionSource(source: string): AgentCanvasExtensionSource {
		switch (source) {
			case 'user': return 'user';
			case 'project': return 'project';
			case 'session': return 'session';
			case 'plugin': return 'plugin';
			default: return 'unknown';
		}
	}

	private _extensionStatus(status: string): AgentExtensionStatus {
		switch (status) {
			case 'running':
			case 'disabled':
			case 'failed':
			case 'starting':
				return status;
			default:
				return 'unknown';
		}
	}

	private _canvasRequiresInput(inputSchema: JsonValue | undefined): boolean {
		if (inputSchema === null || typeof inputSchema !== 'object' || Array.isArray(inputSchema)) {
			return false;
		}
		const required = inputSchema['required'];
		return Array.isArray(required) && required.some(value => typeof value === 'string' && value.trim().length > 0);
	}

	private async _waitForCanvasExtensions(wrapper: CopilotSessionWrapper): Promise<void> {
		if (!wrapper.canvasRuntimeEnabled) {
			return;
		}
		const settled = new DeferredPromise<boolean>();
		const listener = wrapper.onExtensionsLoaded(() => settled.complete(true));
		const stopwatch = StopWatch.create();
		let outcome: ICanvasExtensionsReadyEvent['outcome'] = 'alreadySettled';
		try {
			const extensionsBeforeRequest = this._canvasExtensions;
			const extensions = await wrapper.session.rpc.extensions.list();
			// Preserve only events received during this request, not older snapshots.
			if (this._canvasExtensions === extensionsBeforeRequest) {
				this._canvasExtensions = extensions.extensions;
			}
			if (extensions.extensions.some(extension => extension.status === 'starting')) {
				const ready = await raceTimeout(settled.p, 10_000);
				outcome = ready === true ? 'settled' : 'timeout';
				if (ready !== true) {
					this._logService.warn(`[Copilot:${this.sessionId}] Canvas extensions did not settle before the readiness deadline`);
				}
			}
			if (this._store.isDisposed) {
				throw new CancellationError();
			}
			await wrapper.session.rpc.canvas.list();
			if (this._store.isDisposed) {
				throw new CancellationError();
			}
			this._markCanvasProjectionLive();
		} catch (error) {
			outcome = this._store.isDisposed || isCancellationError(error) ? 'cancelled' : 'error';
			throw error;
		} finally {
			listener.dispose();
			this._telemetryReporter.canvasExtensionsReady({
				schemaVersion: 1,
				launchKind: this._launchPlan.kind,
				outcome,
				durationMs: stopwatch.elapsed(),
				...(this._canvasExtensions ? {
					extensionCount: this._canvasExtensions.length,
					failedExtensionCount: this._canvasExtensions.filter(extension => extension.status === 'failed').length,
				} : {}),
			});
		}
	}

	private _publishCanvases(): void {
		if (this._pendingCanvasHandoff) {
			return;
		}
		const canvases = [...this._canvasByInstanceId.values()];
		this._emitAction({
			type: ActionType.ChatCanvasesChanged,
			canvases: canvases.length > 0 ? canvases.map(canvas => ({ resource: canvas.resource.toString() })) : undefined,
		});
	}

	private _invalidateCanvasRegistrySnapshot(): void {
		this._canvasRegistryGeneration++;
	}

	private _markCanvasRegistryUnsettled(): void {
		this._canvasRegistrySettlementPending = true;
	}

	private _releaseCanvasRegistrySnapshot(): void {
		this._invalidateCanvasRegistrySnapshot();
		this._canvasRegistrySettlementPending = false;
	}

	private _publishAuthoritativeCanvasRegistry(): void {
		this._canvasRegistrySettlementPending = false;
		this._publishCanvases();
	}

	private _publishSettledCanvasRegistry(): void {
		if (!this._canvasRegistrySettlementPending || this._canvasPhase !== 'live' || this._pendingCanvasHandoff) {
			return;
		}
		this._publishAuthoritativeCanvasRegistry();
	}

	/** Reopens handed-over canvases the runtime restored and drops the ones it no longer has open. */
	private async _reconcileCanvasHandoff(wrapper: CopilotSessionWrapper): Promise<void> {
		if (!wrapper.canvasRuntimeEnabled || ![...this._canvasByInstanceId.values()].some(projection => projection.handedOver)) {
			return;
		}
		let openCanvases: CopilotSession['openCanvases'];
		try {
			({ openCanvases } = await this._awaitControlPlaneRpc('rpc.canvas.listOpen', wrapper.session.rpc.canvas.listOpen()));
		} catch (error) {
			this._logService.warn(`[Copilot:${this.sessionId}] Failed to reconcile handed-over canvases: ${getErrorMessage(error)}`);
			return;
		}
		if (this._store.isDisposed) {
			return;
		}
		const openByInstanceId = new Map(openCanvases.map(canvas => [canvas.instanceId, canvas]));
		// Canvases the runtime reported while the request was pending are no longer marked, so they keep that newer state.
		for (const projection of [...this._canvasByInstanceId.values()]) {
			if (!projection.handedOver) {
				continue;
			}
			const open = openByInstanceId.get(projection.canvas.instanceId);
			if (open) {
				this._projectOpenedCanvas(open);
			} else {
				this._canvasByInstanceId.delete(projection.canvas.instanceId);
			}
		}
	}

	private _publishCanvasState(projection: ICopilotCanvasProjection): void {
		this._onDidSessionProgress.fire({
			kind: 'canvas',
			chat: this._chatChannelUri,
			resource: projection.resource,
			state: projection.canvas,
		});
	}

	private _markCanvasProjectionLive(): void {
		if (this._canvasPhase === 'starting') {
			this._canvasPhase = 'live';
		}
	}

	private _projectsCanvasEvent(wrapper: CopilotSessionWrapper, agentId: string | undefined): boolean {
		return wrapper.canvasRuntimeEnabled && !agentId && this._canvasPhase !== 'released';
	}

	private _projectOpenedCanvas(data: SessionEventPayload<'session.canvas.opened'>['data']): void {
		const url = this._canvasSource(data.url);
		const existing = this._canvasByInstanceId.get(data.instanceId);
		if (existing
			&& existing.canvas.url === url
			&& existing.canvas.extensionId === data.extensionId
			&& existing.canvas.extensionName === data.extensionName
			&& existing.canvas.canvasId === data.canvasId
			&& existing.canvas.title === data.title
			&& existing.canvas.status === data.status) {
			if (existing.handedOver) {
				this._canvasByInstanceId.set(data.instanceId, { resource: existing.resource, canvas: existing.canvas });
			}
			return;
		}
		if (!existing && this._canvasByInstanceId.size >= MAX_PROJECTED_CANVASES) {
			const oldestInstanceId = this._canvasByInstanceId.keys().next().value;
			if (oldestInstanceId !== undefined) {
				this._canvasByInstanceId.delete(oldestInstanceId);
				this._logService.warn(`[Copilot:${this.sessionId}] Evicted oldest projected canvas after reaching the ${MAX_PROJECTED_CANVASES}-canvas limit`);
			}
		}
		const canvas: CanvasState = {
			instanceId: data.instanceId,
			extensionId: data.extensionId,
			...(data.extensionName !== undefined ? { extensionName: data.extensionName } : {}),
			canvasId: data.canvasId,
			...(data.title !== undefined ? { title: data.title } : {}),
			...(data.status !== undefined ? { status: data.status } : {}),
			...(url !== undefined ? { url } : {}),
		};
		const projection: ICopilotCanvasProjection = {
			resource: existing?.resource ?? buildCanvasUri(this._chatChannelUri, generateUuid()),
			canvas,
		};
		this._canvasByInstanceId.set(canvas.instanceId, projection);
		this._publishCanvasState(projection);
		if (!existing) {
			this._publishCanvases();
		}
	}

	private _clearCanvasProjection(): void {
		if (this._canvasPhase === 'released') {
			return;
		}
		this._releaseCanvasRegistrySnapshot();
		this._canvasPhase = 'released';
		const hadCanvases = this._canvasByInstanceId.size > 0;
		this._canvasByInstanceId.clear();
		this._ignoredRestoredCanvasInstanceIds.clear();
		this._expectedCanvasClosedEvents.clear();
		if (hadCanvases) {
			this._publishCanvases();
		}
	}

	private _canvasSource(url: string | undefined): string | undefined {
		if (url === undefined) {
			return undefined;
		}
		try {
			const source = URI.parse(url, true);
			if ((source.scheme === Schemas.http || source.scheme === Schemas.https) && source.authority !== '') {
				return source.toString(true);
			}
			this._logService.warn(`[Copilot:${this.sessionId}] Unsupported canvas source`);
			return undefined;
		} catch {
			this._logService.warn(`[Copilot:${this.sessionId}] Invalid canvas source URL`);
			return undefined;
		}
	}

	/** Updates the GitHub credentials used by this live SDK session. */
	async updateGitHubCredentials(host: string, token: string): Promise<GitHubCredentialsUpdateResult> {
		if (!this.usesStaticGitHubToken) {
			throw new Error('Cannot replace isolated or provider-backed GitHub credentials');
		}
		const result = await this._wrapper.session.rpc.gitHubAuth.setCredentials({
			credentials: { type: 'token', host, token },
		});
		if (result.success) {
			this._launchPlan.githubCredentials.updateStaticToken(token);
		}
		return result;
	}

	private _setPromptCacheState(promptCache: ISessionPromptCacheState | undefined): void {
		// `resourceUri` can be shared, so persist and re-read through the shared prompt-cache seam.
		this._promptCacheState = this._promptCache.write(this.resourceUri, promptCache);
	}

	private _recordSdkTiming(event: SessionEvent): void {
		const turn = this._currentTurn.value;
		if (!turn?.sdkSendInvoked || event.agentId || this._dropLateRootTurnEvents) {
			return;
		}
		const recorder = turn.timingRecorder;
		recorder?.markMilestone?.('sdkFirstEvent');
		switch (event.type) {
			case 'user.message': recorder?.markMilestone?.('sdkUserMessage'); break;
			case 'assistant.turn_start': recorder?.markMilestone?.('sdkAssistantTurnStart'); break;
			case 'assistant.message_delta':
				if (event.data.deltaContent.length > 0) {
					recorder?.markMilestone?.('sdkText');
				}
				break;
			case 'assistant.reasoning_delta':
				if (event.data.deltaContent.length > 0) {
					recorder?.markMilestone?.('sdkReasoning');
				}
				break;
			case 'assistant.message':
				if (event.data.content.length > 0) {
					recorder?.markMilestone?.('sdkText');
				}
				break;
			case 'assistant.reasoning':
				if (event.data.content.length > 0) {
					recorder?.markMilestone?.('sdkReasoning');
				}
				break;
			case 'tool.execution_start': recorder?.markMilestone?.('sdkTool'); break;
			case 'session.error': recorder?.markMilestone?.('sdkError'); break;
			case 'session.idle': recorder?.markMilestone?.('sdkIdle'); break;
		}
	}

	private _createRuntimeAdapter(cancellationToken: CancellationToken): ICopilotSessionRuntime {
		const launch = {};
		this._launchMcpRestartObserver = launch;
		return {
			cancellationToken,
			setApprovalPolicy: (resolved, bridged) => {
				this._approvalPolicy.setLaunchPolicy(resolved, bridged);
			},
			onSessionEvent: event => {
				if (!this._store.isDisposed) {
					if (event.type === 'session.managed_settings_resolved' && !event.agentId) {
						this._approvalPolicy.observeRuntimePolicy(event.data);
						this._computerUseActivation.observeManagedSettings(event.data.settings);
						const availableApprovalModes = this._approvalPolicy.getAvailableModes(this._getApprovalInputs());
						// A session key, written for the session that owns the chat now when the chat is its session-backed one.
						const owner = this._ownerSessionUri.toString();
						const current = this._configurationService.getSessionConfigValues(owner);
						if (current && isEqual(this.resourceUri, this._ownerSessionUri) && !equals(current.availableApprovalModes, availableApprovalModes)) {
							this._configurationService.updateSessionConfig(owner, { availableApprovalModes });
						}
						void this._managedSettingsResolved.complete();
					}
					if (this._launchMcpRestartObserver === launch && event.type === 'session.mcp_server_status_changed') {
						this._observeMcpRestart(event.data.serverName, event.data.status);
					}
					this._recordSdkTiming(event);
					this._onSessionEvent?.(event);
				}
			},
			chatUri: this._chatChannelUri,
			launchOwner: this.launchOwner,
			reportManagedSettingsActivity: activity => this._setManagedSettingsActivity(activity),
			getLaunchSandboxConfig: () => this._sandbox.getLaunchConfig(),
			applyLaunchSandbox: session => this._sandbox.applyLaunchConfig(session),
			handlePermissionRequest: this._guarded((request, invocation) => {
				const recorder = this._currentTurn.value?.timingRecorder;
				recorder?.markMilestone?.('permissionRequest');
				return measureAgentProviderOperation(recorder, 'permissionRequest', () => this._handlePermissionRequest(request, invocation));
			}, attributePermissionResult({ kind: 'reject' }, 'unattended_fallback'), 'permission'),
			handleExitPlanModeRequest: this._guarded((request, invocation) => {
				const recorder = this._currentTurn.value?.timingRecorder;
				recorder?.markMilestone?.('exitPlanModeRequest');
				return measureAgentProviderOperation(recorder, 'exitPlanModeRequest', () => this._handleExitPlanModeRequest(request, invocation));
			}, { approved: false } satisfies CopilotExitPlanModeResponse, 'exit-plan-mode'),
			handleUserInputRequest: this._guarded((request, invocation) => {
				const recorder = this._currentTurn.value?.timingRecorder;
				recorder?.markMilestone?.('userInputRequest');
				return measureAgentProviderOperation(recorder, 'userInputRequest', () => this._handleUserInputRequest(request, invocation));
			}, { answer: '', wasFreeform: true } satisfies UserInputResponse, 'user-input'),
			handleElicitationRequest: this._guarded(context => {
				const recorder = this._currentTurn.value?.timingRecorder;
				recorder?.markMilestone?.('elicitationRequest');
				return measureAgentProviderOperation(recorder, 'elicitationRequest', () => this._handleElicitationRequest(context));
			}, { action: 'cancel' } satisfies ElicitationResult, 'elicitation'),
			setCopilotConnectorServers: connectorServers => this._setCopilotConnectorServers(connectorServers),
			handleMcpAuthRequest: this._guarded(request => {
				const recorder = this._currentTurn.value?.timingRecorder;
				recorder?.markMilestone?.('mcpAuthRequest');
				return measureAgentProviderOperation(recorder, 'mcpAuthRequest', () => this._handleMcpAuthRequest(request));
			}, { kind: 'cancelled' } satisfies McpAuthResult, 'mcp-auth'),
			requestUnsandboxedCommandConfirmation: this._guarded(request => {
				const recorder = this._currentTurn.value?.timingRecorder;
				recorder?.markMilestone?.('unsandboxedConfirmation');
				return measureAgentProviderOperation(recorder, 'unsandboxedConfirmation', () => this._requestUnsandboxedCommandConfirmation(request));
			}, false, 'unsandboxed-command-confirmation'),
			createClientSdkTools: (toolSearchActive, hostToolNames) => this._createClientSdkTools(toolSearchActive, hostToolNames),
			createServerSdkTools: toolSearchActive => this._createServerSdkTools(toolSearchActive),
			createComputerUseActivationTools: () => this._computerUseActivation.createTools(),
			reloadExtensions: () => this.reloadExtensions(),
			handlePreToolUse: input => this._handlePreToolUse(input),
			handlePostToolUse: input => this._handlePostToolUse(input),
			handlePostToolUseFailure: input => this._handlePostToolUseFailure(input),
			handleUserPromptSubmitted: () => this.handleUserPromptSubmitted(),
		};
	}

	private _setCopilotConnectorServers(connectorServers: ICopilotConnectorServers): void {
		const previous = [...this._copilotConnectorServers.keys()];
		this._copilotConnectorServers.clear();
		for (const [serverName, server] of connectorServers.servers) {
			this._copilotConnectorServers.set(serverName, server);
		}
		this._copilotConnectorAuthorizationRequired = connectorServers.authorizationRequired;
		// Republish servers that stopped being Connector-owned too, so their Connector metadata is removed.
		for (const serverName of new Set([...previous, ...connectorServers.servers.keys()])) {
			const state = this._mcpCustomizations.stateForServer(serverName);
			if (state) {
				this._mcpCustomizations.applyOne({ name: serverName, displayName: this._copilotConnectorServers.get(serverName)?.displayName, state });
			}
		}
	}

	/**
	 * Whether a server is owned by a Copilot Connector, either as reported by Connector reconciliation or, when
	 * that is unavailable, because its challenge asks for the Connector authorization scope.
	 */
	private _isCopilotConnectorServer(serverName: string, requiredScopes: readonly string[] = []): boolean {
		return this._copilotConnectorServers.has(serverName) || requiredScopes.includes(copilotConnectorsScope);
	}

	/**
	 * Resolves matching pending SDK callbacks, restricted to the targeted MCP server when provided.
	 * Connector-owned servers keep using the session credential, never a forwarded MCP token.
	 */
	async resolveMcpAuthentication(params: AuthenticateParams): Promise<boolean> {
		const serverName = params.target ? this._mcpCustomizations.serverNameForCustomizationId(params.target.customizationId) : undefined;
		if (params.target && (serverName === undefined || !isEqual(this.ownerSessionUri, URI.parse(params.target.session)))) {
			return false;
		}
		let resolved = false;
		for (const [requestId, pending] of this._pendingMcpAuthRequests.entries()) {
			if (params.target && pending.serverName !== serverName) {
				continue;
			}
			if (pending.resource.resource !== params.resource || !this._scopesSatisfy(params.scopes, pending.requiredScopes)) {
				continue;
			}
			if (pending.copilotConnector || this._isCopilotConnectorServer(pending.serverName)) {
				this._logService.info(`[Copilot:${this.sessionId}] Ignoring an MCP token for Connector-owned server '${pending.serverName}'; it requires Copilot Connector authorization of the session account`);
				continue;
			}
			for (const toolCall of pending.toolCalls) {
				this._emitAction({
					type: ActionType.ChatToolCallAuthResolved,
					turnId: toolCall.turnId,
					toolCallId: toolCall.toolCallId,
				}, toolCall.parentToolCallId);
			}
			if (this._pendingMcpAuthRequests.respond(requestId, { kind: 'token', accessToken: params.token })) {
				resolved = true;
			}
		}
		return resolved;
	}

	private _hasPendingMcpAuthentication(serverName: string): boolean {
		for (const [, pending] of this._pendingMcpAuthRequests.entries()) {
			if (pending.serverName === serverName) {
				return true;
			}
		}
		return false;
	}

	private _adoptPendingMcpAuthentication(serverName: string): Promise<void> | undefined {
		const toolCalls = this._activeMcpToolCalls(serverName);
		const completions: Promise<McpAuthResult | null | undefined>[] = [];
		for (const [requestId, pending] of this._pendingMcpAuthRequests.entries()) {
			if (pending.serverName !== serverName || !pending.completion) {
				continue;
			}
			const requirement = this._lastMcpAuthRequirements.get(serverName);
			if (requirement?.requestId !== requestId) {
				continue;
			}
			for (const toolCall of toolCalls) {
				if (!pending.toolCalls.some(existing => existing.toolCallId === toolCall.toolCallId)) {
					pending.toolCalls.push(toolCall);
					this._emitAction({
						type: ActionType.ChatToolCallAuthRequired,
						turnId: toolCall.turnId,
						toolCallId: toolCall.toolCallId,
						auth: requirement.auth,
					}, toolCall.parentToolCallId);
				}
			}
			completions.push(pending.completion);
		}
		return completions.length ? Promise.all(completions).then(() => undefined) : undefined;
	}

	private async _handleMcpAuthRequest(request: McpAuthRequest): Promise<McpAuthResult | null | undefined> {
		const enabled = this._getDesiredMcpServerEnablementByName([request.serverName]).get(request.serverName);
		if (enabled === false) {
			this._logService.info(`[Copilot:${this.sessionId}] Suppressed authentication request from disabled MCP server '${request.serverName}'`);
			return null;
		}
		if (enabled === undefined) {
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
		const oauthClient: McpAuthRequirement['oauthClient'] = request.staticClientConfig?.clientSecret
			? { clientId: request.staticClientConfig.clientId, clientSecret: request.staticClientConfig.clientSecret }
			: request.staticClientConfig && request.staticClientConfig.publicClient !== false
				? { clientId: request.staticClientConfig.clientId }
				: undefined;
		const auth: McpAuthRequirement = {
			reason: this._mcpAuthRequiredReason(request.reason),
			...(oauthClient ? { oauthClient } : {}),
			resource,
			requiredScopes: requiredScopes.length ? [...requiredScopes] : undefined,
			description: request.wwwAuthenticateParams?.error,
		};
		this._mcpLifecycleVersion++;
		this._mcpAwaitingOAuthReconnect.delete(request.serverName);
		const toolCalls = this._activeMcpToolCalls(request.serverName);
		const copilotConnector = this._isCopilotConnectorServer(request.serverName, requiredScopes);
		const pending: IPendingMcpAuthRequest = {
			serverName: request.serverName,
			resource,
			requiredScopes,
			toolCalls,
			copilotConnector,
		};
		const result = this._pendingMcpAuthRequests.register(request.requestId, pending);
		pending.completion = result;
		this._lastMcpAuthRequirements.set(request.serverName, {
			requestId: request.requestId,
			auth,
			acceptsTokenCompletion: !copilotConnector,
		});
		this._mcpCustomizations.applyOne({
			name: request.serverName,
			displayName: this._copilotConnectorServers.get(request.serverName)?.displayName,
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
		this._logService.info(copilotConnector
			? `[Copilot:${this.sessionId}] Connector-owned MCP server '${request.serverName}' requires Copilot Connector authorization of the session account (${request.reason})`
			: `[Copilot:${this.sessionId}] MCP server '${request.serverName}' requires authentication for ${resource.resource}`);
		try {
			const outcome = await result;
			if (outcome && hasKey(outcome, { kind: true }) && outcome.kind === 'cancelled' && this._lastMcpAuthRequirements.get(request.serverName)?.requestId === request.requestId) {
				this._mcpRoutingActivations.get(request.serverName)?.cancellation.cancel();
			}
			return outcome;
		} catch (error) {
			this._disableMcpTokenCompletion(request.serverName, request.requestId);
			throw error;
		}
	}

	private _disableMcpTokenCompletion(serverName: string, requestId: string): void {
		const requirement = this._lastMcpAuthRequirements.get(serverName);
		if (requirement?.requestId === requestId && requirement.acceptsTokenCompletion) {
			this._lastMcpAuthRequirements.set(serverName, { ...requirement, acceptsTokenCompletion: false });
		}
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
		if (this.usesScopedGitHubCredentials) {
			return undefined;
		}
		const githubToken = this._currentGitHubToken;
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
		const requirement = this._lastMcpAuthRequirements.get(serverName);
		if (requirement) {
			this._disableMcpTokenCompletion(serverName, requirement.requestId);
		}
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

	setSessionApproveAll(enabled: boolean): Promise<void> {
		return this._permissionModeSequencer.queue(async () => {
			if (!this._wrapper || this._store.isDisposed) {
				throw new Error('Cannot set approval mode without an initialized session');
			}
			const mode = enabled ? 'allow-all' : 'manual';
			const selection = this._approvalPolicy.resolveSelection({
				...this._getApprovalInputs(), requested: enabled ? 'autoApprove' : 'default', globalAutoApprove: false,
			});
			if (selection.mode !== mode) {
				throw new Error('Auto approval is restricted by policy');
			}
			const applied = await this._trySetSdkPermissionMode(mode);
			if (!applied) {
				throw new Error(`Copilot SDK rejected permission mode '${mode}'`);
			}
			this._configurationService.updateChatConfig(this._configWriteTarget(), {
				[SessionConfigKey.AutoApprove]: fromCopilotPermissionMode(applied),
			});
		});
	}

	async getSessionPlan() {
		if (!this._wrapper) {
			throw new Error('Cannot read the plan before the session is initialized');
		}
		const [plan, todos] = await Promise.all([
			this._awaitControlPlaneRpc('rpc.plan.read', this._wrapper.session.rpc.plan.read()),
			this._awaitControlPlaneRpc('rpc.plan.readSqlTodosWithDependencies', this._wrapper.session.rpc.plan.readSqlTodosWithDependencies()),
		]);
		return {
			plan,
			todos: todos.rows.map(row => ({
				id: row.id ?? null, title: row.title ?? null, status: row.status ?? null, description: row.description ?? null,
			})),
			dependencies: todos.dependencies,
		};
	}

	async setWorkingDirectory(workingDirectory: URI, transaction: ICopilotWorkingDirectoryChangeTransaction): Promise<void> {
		if (!this._wrapper) {
			throw new Error('Cannot change the working directory before the session is initialized');
		}
		if (this.hasActiveTurn) {
			throw new Error('Cannot change the working directory while a turn is active');
		}
		if (this._workingDirectoryMutationInProgress) {
			throw new Error('Cannot change the working directory while another working directory change is in progress');
		}
		const previousWorkingDirectory = this._workingDirectory;
		if (!previousWorkingDirectory) {
			throw new Error('Cannot change the working directory for a session without an existing working directory');
		}
		this._shellManager?.assertCanSetWorkingDirectory();

		this._workingDirectoryMutationInProgress = true;
		try {
			try {
				await transaction.prepare();
			} catch (prepareError) {
				try {
					await transaction.rollback();
				} catch (rollbackError) {
					throw new Error(`Working directory preparation failed: ${getErrorMessage(prepareError)}; failed to roll back the prepared working directory: ${getErrorMessage(rollbackError)}`);
				}
				throw prepareError;
			}

			if (this.hasActiveTurn) {
				const activeTurnError = new Error('Cannot change the working directory while a turn is active');
				try {
					await transaction.rollback();
				} catch (rollbackError) {
					throw new Error(`${activeTurnError.message}; failed to roll back the prepared working directory: ${getErrorMessage(rollbackError)}`);
				}
				throw activeTurnError;
			}

			let result: Awaited<ReturnType<CopilotSession['rpc']['metadata']['setWorkingDirectory']>>;
			try {
				result = await this._wrapper.session.rpc.metadata.setWorkingDirectory({ workingDirectory: workingDirectory.fsPath });
			} catch (sdkError) {
				try {
					await transaction.rollback();
				} catch (rollbackError) {
					throw new Error(`Failed to change the SDK working directory: ${getErrorMessage(sdkError)}; failed to roll back the prepared working directory: ${getErrorMessage(rollbackError)}`);
				}
				throw sdkError;
			}

			const requestedUri = normalizePath(URI.file(workingDirectory.fsPath));
			const actualUri = normalizePath(URI.file(result.workingDirectory));
			let runtimeAlignmentError: string | undefined;
			try {
				const updateResult = await this._wrapper.session.rpc.options.update({ workingDirectory: actualUri.fsPath });
				if (!updateResult.success) {
					runtimeAlignmentError = 'the SDK rejected the runtime working directory update';
				}
			} catch (error) {
				runtimeAlignmentError = `failed to update the SDK runtime working directory: ${getErrorMessage(error)}`;
			}
			if (extUriBiasedIgnorePathCase.isEqual(actualUri, requestedUri)) {
				let shellAlignmentError: string | undefined;
				try {
					this._shellManager?.setWorkingDirectory(workingDirectory);
				} catch (error) {
					shellAlignmentError = `failed to align the local shell working directory: ${getErrorMessage(error)}`;
				} finally {
					this._workingDirectory = workingDirectory;
					this._customizationDirectory = workingDirectory;
					this._requiresRestartAfterWorkingDirectoryChange = true;
				}
				const alignmentErrors = [runtimeAlignmentError, shellAlignmentError].filter(isDefined);
				if (alignmentErrors.length > 0) {
					throw new AgentWorkingDirectoryChangedError(workingDirectory, `The SDK working directory changed to '${workingDirectory.fsPath}', but runtime alignment failed: ${alignmentErrors.join('; ')}`);
				}
				return;
			}

			const mismatchError = new Error(`The SDK returned working directory '${result.workingDirectory}' instead of '${workingDirectory.fsPath}'`);
			const alignmentErrors = runtimeAlignmentError ? [runtimeAlignmentError] : [];
			try {
				this._shellManager?.setWorkingDirectory(actualUri);
			} catch (shellError) {
				alignmentErrors.push(`failed to align the local shell working directory: ${getErrorMessage(shellError)}`);
			} finally {
				this._workingDirectory = actualUri;
				this._customizationDirectory = actualUri;
				this._requiresRestartAfterWorkingDirectoryChange = true;
			}
			try {
				await transaction.reconcile(actualUri);
			} catch (reconcileError) {
				alignmentErrors.push(`failed to reconcile the authoritative working directory: ${getErrorMessage(reconcileError)}`);
			}
			if (alignmentErrors.length > 0) {
				throw new AgentWorkingDirectoryChangedError(actualUri, `${mismatchError.message}; ${alignmentErrors.join('; ')}`);
			}
			throw new AgentWorkingDirectoryChangedError(actualUri, mismatchError.message);
		} finally {
			this._workingDirectoryMutationInProgress = false;
		}
	}

	async send(prompt: string, attachments?: readonly MessageAttachment[], turnId?: string, mode?: CopilotSdkMode, senderClientId?: string, clientType = AgentHostClientType.Unknown, hostInstructions?: readonly string[], clientContext = createUnknownAgentHostClientTelemetryContext(clientType), agentMergeTurn = false, stageRecorder?: IAgentProviderSendStageRecorder): Promise<void> {
		this._assertScopedGitHubCredential();
		if (this._workingDirectoryMutationInProgress) {
			throw new Error('Cannot start a turn while the working directory is changing');
		}
		this._resetAbortToken();
		this._agentMergeTurn = agentMergeTurn;
		if (turnId && this._currentTurn.value?.id !== turnId) {
			// Establish the `pending` turn for this message. Callers normally
			// call `resetTurnState` just before `send()`; this covers the
			// direct-send path and is a no-op when the turn already exists.
			this.resetTurnState(turnId, senderClientId, clientType, clientContext);
		}
		const currentTurn = this._currentTurn.value;
		if (currentTurn) {
			currentTurn.messageCharLen = prompt.length;
			currentTurn.timingRecorder = stageRecorder;
		}
		const turn = this._currentTurn.value;
		this._hostInstructions = hostInstructions;
		this._pendingSnapshotReminder = this._snapshotReadonlyReminder(attachments);
		if (this._tryStartDevelopmentRecoverableError(prompt)) {
			return;
		}
		try {
			await this._send(prompt, attachments, mode, stageRecorder);
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
		this._currentTurn.value?.timingRecorder?.markMilestone?.('promptHook');
		const parts = [
			...(this._hostInstructions ?? []),
			...(this._pendingSnapshotReminder ? [this._pendingSnapshotReminder] : []),
			// Changes the user undid since the agent's last tool result.
			...this._discardedEditNotes,
		];
		this._hostInstructions = undefined;
		this._pendingSnapshotReminder = undefined;
		this._discardedEditNotes = [];
		const additionalContext = parts.length > 0 ? parts.join('\n\n') : undefined;
		return additionalContext ? { additionalContext } : undefined;
	}

	async reloadExtensions(): Promise<void> {
		this._logService.info(`[Copilot:${this.sessionId}] Reloading extensions`);
		this._recordRuntimeMutation('extensionsReload');
		await this._wrapper.session.rpc.extensions.reload();
		this._logService.info(`[Copilot:${this.sessionId}] Extensions reloaded`);
	}

	async reconcileExtensions(): Promise<void> {
		await this._awaitControlPlaneRpc('rpc.extensions.reconcile', this._wrapper.session.rpc.extensions.reconcile());
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

	private _canSendTurn(turn: CopilotTurn | undefined, abortToken: CancellationToken): boolean {
		if (this._currentTurn.value !== turn) {
			this._logService.info(`[Copilot:${this.sessionId}] Turn changed during preparation; dropping send: turnId=${turn?.id}`);
			return false;
		}
		if (abortToken.isCancellationRequested) {
			this._logService.info(`[Copilot:${this.sessionId}] Turn cancelled during preparation; dropping send: turnId=${turn?.id}`);
			this.discardActiveTurn();
			return false;
		}
		return true;
	}

	private _assertScopedGitHubCredential(): void {
		if (this.usesScopedGitHubCredentials && !this._launchPlan.githubCredentials.token) {
			throw new ProtocolError(AhpErrorCodes.AuthRequired, 'The captured Copilot credential has expired');
		}
	}

	/** Clears recovery eligibility before execution; preflight alone must leave the backing recoverable. */
	private async _executeSdkOperation<T>(operation: () => Promise<T>, turn: CopilotTurn | undefined, abortToken: CancellationToken, providerCall?: CopilotTurn): Promise<CopilotSdkExecutionOutcome<T>> {
		const recorder = turn?.timingRecorder;
		const execute = async (): Promise<T> => {
			this._assertScopedGitHubCredential();
			providerCall?.markProviderCallPending();
			try {
				const value = await operation();
				providerCall?.markProviderCallResolved();
				return value;
			} catch (error) {
				providerCall?.markProviderCallRejected();
				throw error;
			}
		};
		const execution = await measureAgentProviderOperation(recorder, 'execution', async () => {
			if (!this._canSendTurn(turn, abortToken)) {
				return undefined;
			}
			if (!this._sdkExecutionStarted) {
				const marker = await measureAgentProviderOperation(recorder, 'executionMarker', () => allowCopilotSdkExecution(this._sessionDataService, this._storageUri, this.sessionId, this._logService));
				if (!this._canSendTurn(turn, abortToken)) {
					if (marker !== undefined) {
						await measureAgentProviderOperation(recorder, 'executionMarker', () => restoreDeferredCopilotSdkExecution(this._sessionDataService, this._storageUri, marker));
					}
					return undefined;
				}
				this._sdkExecutionStarted = true;
			}
			// Serialize marker changes and dispatch, but let SDK operations finish concurrently.
			return { result: execute() };
		}, this._sdkExecutionSequencer);
		return execution ? { kind: 'executed', value: await execution.result } : { kind: 'skipped' };
	}

	private async _send(prompt: string, attachments: readonly MessageAttachment[] | undefined, mode: CopilotSdkMode | undefined, stageRecorder?: IAgentProviderSendStageRecorder): Promise<void> {
		this._logService.info(`[Copilot:${this.sessionId}] sendMessage called: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}" (${attachments?.length ?? 0} attachments)`);

		// An aborted idle resets the live token; retain the pre-await token to preserve cancellation.
		const abortToken = this._abortToken;
		const sendingTurn = this._currentTurn.value;

		let displayPrompt: string | undefined;
		const slashCommand = parseLeadingSlashCommand(prompt);
		if (slashCommand?.command === 'compact') {
			try {
				if (!this._canSendTurn(sendingTurn, abortToken)) {
					return;
				}
				const execution = await this._executeSdkOperation(() => measureAgentProviderOperation(stageRecorder, 'command', () => this._wrapper.session.rpc.history.compact()), sendingTurn, abortToken);
				if (execution.kind === 'skipped') {
					return;
				}
				const result = execution.value;
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
			const runtimeSlashCommand = await measureAgentProviderOperation(stageRecorder, 'command', () => this._slashCommandProvider.resolveSlashCommand(slashCommand.command));
			if (!this._canSendTurn(sendingTurn, abortToken)) {
				return;
			}
			// TEMPORARY WORKAROUND (#8837): route built-in /fleet via fleet.start to keep the AHP turn open; this bypasses commands.invoke telemetry/gating and should be removed once invoke returns agent-prompt.
			if (runtimeSlashCommand && runtimeSlashCommand.kind === 'builtin' && runtimeSlashCommand.name === 'fleet') {
				await this._startFleet(slashCommand.rest, attachments, mode, abortToken, stageRecorder);
				return;
			}
			// Skills are routed through `commands.invoke` like every other runtime
			// command rather than passed through as raw prompt text. A skill with
			// `disable-model-invocation: true` is intentionally omitted from the
			// runtime's own model-facing skill listing, so the model itself would
			// never recognize a bare `/name` in the prompt and load it. `commands.invoke`
			// is the host-directed path that deterministically loads the skill
			// regardless of that model-invocation gating (see #331477).
			if (runtimeSlashCommand) {
				const invocation = runtimeSlashCommand.getInvocation?.(slashCommand.rawRest) ?? {
					name: runtimeSlashCommand.name,
					...(slashCommand.rawRest.length > 0 ? { input: slashCommand.rawRest } : {}),
				};
				// Apply the effective mode before invoking the runtime command so it runs
				// under the correct SDK mode (issue #8837). An `agent-prompt` result may
				// override the mode; that override is applied again before `session.send`.
				await this.applyMode(mode, stageRecorder);
				if (!this._canSendTurn(sendingTurn, abortToken)) {
					return;
				}
				let result: Awaited<ReturnType<CopilotSession['rpc']['commands']['invoke']>>;
				const commandProgressMessage = runtimeSlashCommand.getProgressMessage?.(slashCommand.rawRest);
				const showCommandProgressImmediately = commandProgressMessage && runtimeSlashCommand.showProgressImmediately?.(slashCommand.rawRest);
				if (showCommandProgressImmediately) {
					this._publishActivity('command', commandProgressMessage);
				}
				const commandProgressScheduler = commandProgressMessage && !showCommandProgressImmediately
					? new RunOnceScheduler(() => {
						if (this._currentTurn.value === sendingTurn && !abortToken.isCancellationRequested) {
							this._publishActivity('command', commandProgressMessage);
						}
					}, 1000)
					: undefined;
				commandProgressScheduler?.schedule();
				try {
					const execution = await this._executeSdkOperation(() => measureAgentProviderOperation(stageRecorder, 'command', async () => await runtimeSlashCommand.invoke?.(slashCommand.rawRest) ?? this._wrapper.session.rpc.commands.invoke(invocation)), sendingTurn, abortToken);
					if (execution.kind === 'skipped') {
						return;
					}
					result = execution.value;
				} catch (err) {
					const message = getErrorMessage(err);
					const commandErrorPrefix = 'Request session.commands.invoke failed with message: ';
					const commandError = message.startsWith(commandErrorPrefix)
						? new Error(message.slice(commandErrorPrefix.length), { cause: err })
						: err instanceof Error ? err : new Error(message, { cause: err });
					const errorOutput = await runtimeSlashCommand.getErrorOutput?.(slashCommand.rest, commandError);
					if (errorOutput) {
						this._logService.trace(`[Copilot:${this.sessionId}] rpc.commands.invoke(${slashCommand.command}) returned command guidance`);
						this._emitMarkdownDelta(renderCopilotSlashCommandOutput(errorOutput), undefined, true);
						this._completeActiveTurn(true);
						return;
					}
					this._logService.error(err, `[Copilot:${this.sessionId}] rpc.commands.invoke(${slashCommand.command}) failed`);
					throw commandError;
				} finally {
					commandProgressScheduler?.dispose();
					this._publishActivity('command', undefined);
				}
				const output = await runtimeSlashCommand.getOutput?.(slashCommand.rest, result);
				const renderedOutput = output ? renderCopilotSlashCommandOutput(output) : undefined;
				const outputMeta = output?.kind === 'link' && output.openInEditor
					? toSlashCommandResourceMeta(output.resource, output.preview === true)
					: undefined;
				switch (result.kind) {
					case 'text':
						this._emitSlashCommandOutput(renderedOutput ?? (result.markdown === true ? result.text : escapeMarkdownSyntaxTokens(result.text)), outputMeta);
						break;
					case 'completed': {
						const message = renderedOutput ?? result.message;
						if (message) {
							this._emitSlashCommandOutput(message, outputMeta);
						}
						break;
					}
					case 'agent-prompt': {
						const runtimeMode = toCopilotSdkMode(result.mode);
						if (runtimeMode) {
							mode = runtimeMode;
						}
						prompt = result.prompt;
						displayPrompt = result.displayPrompt;
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

		const sdkAttachments = await measureAgentProviderOperation(stageRecorder, 'attachments', () => this._toSdkAttachments(attachments));
		if (!this._canSendTurn(sendingTurn, abortToken)) {
			return;
		}

		await this._prepareSdkTurn(mode, stageRecorder);
		if (!this._canSendTurn(sendingTurn, abortToken)) {
			return;
		}
		const traceContext = this._otelService.getSessionTraceContext(this.sessionId, this.resourceUri.toString());
		const execution = await this._executeSdkOperation(() => this._otelService.withTraceContext(traceContext, () => {
			stageRecorder?.mark('modelResponse');
			return this._measureSdkSend(sendingTurn, stageRecorder, async () => {
				if (!this._environmentService.isBuilt && prompt === '$error') {
					await this._wrapper.session.rpc.sendMessages({
						messages: [{ prompt }],
						requestHeaders: { Authorization: '******' },
					});
				} else {
					await this._wrapper.session.send({ prompt, attachments: sdkAttachments?.length ? sdkAttachments : undefined, ...(displayPrompt ? { displayPrompt } : {}) });
				}
			});
		}), sendingTurn, abortToken, sendingTurn);
		if (execution.kind === 'skipped') {
			return;
		}
		this._logService.info(`[Copilot:${this.sessionId}] session.send() returned`);
	}

	private async _measureSdkSend<T>(turn: CopilotTurn | undefined, recorder: IAgentProviderSendStageRecorder | undefined, operation: () => Promise<T>): Promise<T> {
		if (turn) {
			turn.sdkSendInvoked = true;
		}
		recorder?.markMilestone?.('sdkSend');
		try {
			const result = await measureAgentProviderOperation(recorder, 'sdkSend', operation);
			recorder?.markMilestone?.('sdkSendReturned');
			return result;
		} catch (error) {
			recorder?.markMilestone?.('sdkSendRejected');
			throw error;
		}
	}

	private _syncObservedMcpServerEnablement(serverName: string, previousEnabled: boolean | undefined, enabled: boolean): void {
		if (previousEnabled === undefined || previousEnabled === enabled) {
			return;
		}
		const desired = this._getDesiredMcpServerEnablementByName().get(serverName);
		if (desired === undefined || desired === enabled) {
			return;
		}
		const server = this._mcpCustomizations.customizationForServer(serverName);
		if (!server) {
			this._logService.warn(`[Copilot:${this.sessionId}] Cannot record observed enablement for unknown MCP server ${serverName}`);
			return;
		}
		this._observedMcpEnablementOverrides.set(serverName, enabled);
		this._emitAction({
			type: ActionType.SessionCustomizationToggled,
			id: server.id,
			enablement: withCustomizationEnablement(
				server.enablement,
				CustomizationEnablementKind.Global,
				{ kind: CustomizationEnablementKind.Global, enabled },
			),
		});
	}

	private async _refreshObservedMcpServerEnablement(serverName: string, previousEnabled: boolean | undefined): Promise<void> {
		const requestVersion = (this._mcpObservedEnablementRequestVersions.get(serverName) ?? 0) + 1;
		this._mcpObservedEnablementRequestVersions.set(serverName, requestVersion);
		while (!this.isDisposed) {
			const lifecycleVersion = this._mcpLifecycleVersion;
			const { servers } = await this._wrapper.session.rpc.mcp.listConfigured();
			if (this.isDisposed || requestVersion !== this._mcpObservedEnablementRequestVersions.get(serverName)) {
				return;
			}
			if (lifecycleVersion !== this._mcpLifecycleVersion) {
				continue;
			}
			const server = servers.find(server => server.name === serverName);
			if (!server) {
				return;
			}
			this._mcpConfiguredEnablement.set(serverName, server.enabled);
			if (this._expectedMcpEnablementChanges.get(serverName) === server.enabled) {
				this._expectedMcpEnablementChanges.delete(serverName);
			} else {
				this._syncObservedMcpServerEnablement(serverName, previousEnabled, server.enabled);
			}
			return;
		}
	}

	async resume(turnId: string, mode?: CopilotSdkMode, senderClientId?: string, clientType = AgentHostClientType.Unknown, clientContext = createUnknownAgentHostClientTelemetryContext(clientType), agentMergeTurn = false, stageRecorder?: IAgentProviderSendStageRecorder): Promise<void> {
		this._assertScopedGitHubCredential();
		this._resetAbortToken();
		const abortToken = this._abortToken;
		this.resetTurnState(turnId, senderClientId, clientType, clientContext);
		this._agentMergeTurn = agentMergeTurn;
		const turn = this._currentTurn.value;
		if (turn) {
			turn.timingRecorder = stageRecorder;
		}
		if (this._tryContinueDevelopmentRecoverableError(turnId)) {
			return;
		}
		this._resumingTurnAwaitingProviderStart = turn;
		turn?.markProviderCallPending();
		try {
			await this._prepareSdkTurn(mode, stageRecorder);
			if (!this._canSendTurn(turn, abortToken)) {
				return;
			}
			const traceContext = this._otelService.getSessionTraceContext(this.sessionId, this.resourceUri.toString());
			const execution = await this._executeSdkOperation(
				() => this._otelService.withTraceContext(traceContext, () => this._measureSdkSend(turn, stageRecorder, () => this._wrapper.session.rpc.sendMessages({ messages: [] }))),
				turn, abortToken,
			);
			if (execution.kind === 'skipped') {
				return;
			}
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
			}, true),
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
	 * permission mode, sandbox, shell init script, and MCP enablement.
	 * Permission and sandbox failures prevent the turn from starting.
	 */
	private async _prepareSdkTurn(mode: CopilotSdkMode | undefined, recorder?: IAgentProviderSendStageRecorder): Promise<void> {
		this._assertScopedGitHubCredential();
		await this._syncImageGeneration();
		await this.applyMode(mode, recorder);
		await this.syncPermissionMode('turn-start', recorder);
		await this._sandbox.applyConfig(true, undefined, recorder);
		await this._syncShellInitScript(recorder);
		await this._reconcileMcpServerEnablement(recorder);
	}

	/**
	 * Temporary `/fleet` compatibility path (issue #8837): starts the SDK's fleet
	 * agent loop via the dedicated `rpc.fleet.start` RPC and keeps the AHP turn open
	 * until the SDK's terminal `session.idle`, rather than completing it as `commands.invoke`
	 * would. Remove once the runtime returns an `agent-prompt` result for `/fleet`.
	 */
	private async _startFleet(rest: string, attachments: readonly MessageAttachment[] | undefined, mode: CopilotSdkMode | undefined, abortToken: CancellationToken, recorder?: IAgentProviderSendStageRecorder): Promise<void> {
		if (attachments?.length) {
			// `rpc.fleet.start` accepts only a prompt; fail loudly rather than silently dropping attachments.
			throw new Error(localize('copilotAgent.fleet.attachmentsUnsupported', "Attachments are not supported with the /fleet command."));
		}
		const startingTurn = this._currentTurn.value;
		// `abortToken` is captured by the caller before the dispatch await (slash-command
		// resolution), so it reliably reflects an abort that raced that await: an aborted
		// `session.idle` resets the live token, so reading `this._abortToken` here could
		// observe a fresh post-abort token and miss the cancellation.
		await this._prepareSdkTurn(mode, recorder);
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
		try {
			const execution = await this._executeSdkOperation(
				() => this._otelService.withTraceContext(traceContext, () => this._measureSdkSend(startingTurn, recorder, () => this._wrapper.session.rpc.fleet.start(rest ? { prompt: rest } : {}))),
				startingTurn, abortToken, startingTurn,
			);
			if (execution.kind === 'skipped') {
				return;
			}
			result = execution.value;
		} catch (err) {
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
	async applyMode(mode: CopilotSdkMode | undefined, recorder?: IAgentProviderSendStageRecorder): Promise<void> {
		if (!mode || mode === this._lastAppliedMode) {
			return;
		}
		try {
			await measureAgentProviderOperation(recorder, 'mode', () => this._wrapper.session.rpc.mode.set({ mode }));
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
		return this._configurationService.getChatEffectiveValue(this._configTarget(), platformSessionSchema, SessionConfigKey.Mode) === 'autopilot';
	}

	/**
	 * Whether VS Code's auto-reply setting is enabled in the root config.
	 */
	private _isAutoReplyEnabled(): boolean {
		return this._configurationService.getRootValue(platformRootSchema, AgentHostAutoReplyEnabledConfigKey) === true;
	}

	/**
	 * Sends a steering message into the running turn. Resolves false, without consuming the message, when
	 * the turn it was meant to steer ended before the message could be sent; the caller owns it again.
	 */
	async sendSteering(steeringMessage: PendingMessage, sender?: IAgentPendingMessageSender): Promise<boolean> {
		if (this._steeringMessagesInFlight.has(steeringMessage.id) || this._pendingSteeringFlips.has(steeringMessage.id)) {
			return true;
		}
		const steeringTurn = this._currentTurn.value;
		const abortToken = this._abortToken;
		const pending: IPendingSteering = { pendingMessage: steeringMessage, sender };
		this._steeringMessagesInFlight.add(steeringMessage.id);
		this._pendingSteeringFlips.set(steeringMessage.id, pending);
		this._logService.info(`[Copilot:${this.sessionId}] Sending steering message: "${steeringMessage.message.text.substring(0, 100)}"`);
		try {
			await this._reconcileMcpServerEnablement();
			const sdkAttachments = await this._toSdkAttachments(steeringMessage.message.attachments);
			// Steering is injected into the active turn and never fires the SDK's `user-prompt-submitted`
			// hook, so the read-only snapshot signal can't ride `additionalContext` here. Fold it into the
			// prompt as a `<reminder>` block instead: the runtime forwards it to the model, and the host's
			// `stripPromptScaffolding` removes it from the displayed message (#331154).
			const snapshotReminder = this._snapshotReadonlyReminder(steeringMessage.message.attachments);
			const steeringPrompt = snapshotReminder
				? `${steeringMessage.message.text}\n\n<reminder>\n${snapshotReminder}\n</reminder>`
				: steeringMessage.message.text;
			const traceContext = this._otelService.getSessionTraceContext(this.sessionId, this.resourceUri.toString());
			const execution = await this._executeSdkOperation(
				async () => {
					if (this._pendingSteeringFlips.get(steeringMessage.id) !== pending) {
						this._logService.info(`[Copilot:${this.sessionId}] Steering message was withdrawn or cleared before it was sent: id=${steeringMessage.id}`);
						return undefined;
					}
					const messageId = this._otelService.withTraceContext(traceContext, () => this._wrapper.session.send({
						prompt: steeringPrompt,
						attachments: sdkAttachments?.length ? sdkAttachments : undefined,
						mode: 'immediate',
					}));
					pending.sdkSend = { prompt: steeringPrompt, messageId };
					// Keep dispatched entries in SDK send order, not attachment preparation order.
					this._pendingSteeringFlips.delete(steeringMessage.id);
					this._pendingSteeringFlips.set(steeringMessage.id, pending);
					return messageId;
				},
				steeringTurn, abortToken,
			);
			if (execution.kind === 'skipped' && this._pendingSteeringFlips.delete(steeringMessage.id)) {
				if (!abortToken.isCancellationRequested) {
					this._logService.info(`[Copilot:${this.sessionId}] Turn ended before steering message was sent; handing it back: id=${steeringMessage.id}`);
					return false;
				}
				this._fireSteeringConsumed(steeringMessage.id);
			} else if (execution.kind === 'executed' && execution.value !== undefined) {
				pending.sdkMessageId = execution.value;
			}
		} catch (err) {
			this._logService.error(`[Copilot:${this.sessionId}] Steering message failed`, err);
			if (pending.promotedTurnId) {
				if (this._currentTurn.value?.id === pending.promotedTurnId) {
					this.failActiveTurn({
						errorType: 'executionInterrupted',
						message: localize('copilotAgent.steeringFailed', "Failed to send the steering message: {0}", getErrorMessage(err)),
					});
				}
			} else if (this._pendingSteeringFlips.delete(steeringMessage.id)) {
				this._fireSteeringConsumed(steeringMessage.id);
			}
		} finally {
			this._steeringMessagesInFlight.delete(steeringMessage.id);
		}
		return true;
	}

	/**
	 * Withdraws a steering message the user removed. A message still being prepared is never sent; one
	 * the SDK holds is withdrawn from its steering queue. If the SDK already delivered it to the model,
	 * the entry is kept so its `user.message` echo still shows it as its own turn.
	 */
	async withdrawSteering(id: string): Promise<void> {
		const pending = this._pendingSteeringFlips.get(id);
		if (!pending || pending.promotedTurnId) {
			return;
		}
		if (!pending.sdkSend) {
			this._pendingSteeringFlips.delete(id);
			this._logService.info(`[Copilot:${this.sessionId}] Withdrew steering message before sending it: id=${id}`);
			return;
		}
		pending.withdrawing = true;
		try {
			const messageId = await pending.sdkSend.messageId;
			const result = await this._wrapper.session.rpc.queue.withdrawMessage({ messageId, expectedPrompt: pending.sdkSend.prompt });
			if (!result.removed) {
				this._logService.info(`[Copilot:${this.sessionId}] Steering message was already delivered and could not be withdrawn: id=${id}`);
				return;
			}
			if (this._pendingSteeringFlips.get(id) === pending) {
				this._pendingSteeringFlips.delete(id);
			}
			this._logService.info(`[Copilot:${this.sessionId}] Withdrew steering message: id=${id}`);
		} catch (err) {
			this._logService.warn(`[Copilot:${this.sessionId}] Failed to withdraw steering message: id=${id}: ${getErrorMessage(err)}`);
		} finally {
			pending.withdrawing = false;
		}
	}

	async getMessages(): Promise<readonly Turn[]> {
		const result = await this._getMappedEvents();
		return result.turns;
	}

	async getSubagentMessages(parentToolCallId: string): Promise<readonly Turn[]> {
		const result = await this._getMappedEvents('all');
		const turns = result.subagentTurnsByToolCallId.get(parentToolCallId) ?? [];
		return turns;
	}

	/** Parent restoration excludes child transcripts; the full interleaved replay is shared by child reads on demand. */
	private readonly _mappedEventsMemo = new Map<'primary' | 'all', Promise<IMappedSessionEvents>>();

	private _getMappedEvents(agentScope: 'primary' | 'all' = 'primary'): Promise<IMappedSessionEvents> {
		let pending = this._mappedEventsMemo.get(agentScope);
		if (!pending) {
			pending = this._computeMappedEvents(agentScope);
			this._mappedEventsMemo.set(agentScope, pending);
			// Don't cache a rejected reconstruction — let the next caller retry.
			pending.catch(() => {
				if (this._mappedEventsMemo.get(agentScope) === pending) {
					this._mappedEventsMemo.delete(agentScope);
				}
			});
		}
		return pending;
	}

	private async _computeMappedEvents(agentScope: 'primary' | 'all'): Promise<IMappedSessionEvents> {
		this._logService.trace(`[Copilot:${this.sessionId}] Reading persisted session events: scope=${agentScope}`);
		const events = await readCopilotSessionEvents(cursor => this._awaitControlPlaneRpc('rpc.eventLog.read', this._wrapper.session.rpc.eventLog.read({
			cursor, max: 1000, direction: 'backward', agentScope, includeEphemeral: false,
		})), this._lifetimeCts.token);
		this._seedSubagentDisplayNames(events);
		this._logService.trace(`[Copilot:${this.sessionId}] Read ${events.length} persisted event(s); reconstructing turns`);
		return this._withDatabase(async db => {
			const result = await mapSessionEvents(this._storageUri, db, events, this._chatChannelUri, this._ownerSessionUri, {
				workingDirectory: this._workingDirectory,
				clientToolNames: this._clientToolNames,
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
			this._hasCompletedTurn ||= result.turns.some(turn => turn.state === TurnState.Complete);
			await this._restoreStoredShellOutputs(result, db);
			this._logService.trace(`[Copilot:${this.sessionId}] Reconstructed ${result.turns.length} turn(s) from ${events.length} event(s)`);
			return result;
		});
	}

	private async _restoreStoredShellOutputs(mapped: IMappedSessionEvents, db: ISessionDatabase): Promise<void> {
		await restoreStoredShellOutputsForChat(mapped.turns, this._storageUri, this._ownerSessionUri, this._chatChannelUri, db);
		for (const [parentToolCallId, turns] of mapped.subagentTurnsByToolCallId) {
			await restoreStoredShellOutputsForChat(turns, this._storageUri, this._ownerSessionUri, URI.parse(this._subagentChatUri(parentToolCallId)), db);
		}
	}

	private _seedSubagentDisplayNames(events: readonly SessionEvent[]): void {
		for (const [agentId, displayName] of getCopilotSubagentDisplayNames(events)) {
			this._subagents.seedDisplayName(agentId, displayName);
		}
	}

	/** Drop the memoized event reconstruction; the next read rebuilds it. */
	private _invalidateMappedEvents(): void {
		this._mappedEventsMemo.clear();
	}

	async abort(): Promise<void> {
		this._logService.info(`[Copilot:${this.sessionId}] Aborting session...`);
		const abortingTurn = this._currentTurn.value;
		const resumingTurn = this._resumingTurnAwaitingProviderStart;
		const abortTarget = abortingTurn ?? resumingTurn;
		this._abortingTurn = abortTarget;
		if (abortTarget) {
			this._cancelFusionEvents(abortTarget.id);
		}
		let droppedBackgroundTaskReads = false;
		if (abortingTurn || this._subagents.hasActiveAgents) {
			this._dropLateRootTurnEvents = true;
			// Aborted children are not guaranteed to emit a terminal event before reuse.
			for (const agentId of this._subagents.activeAgentIds) {
				this._completeSubagentTurn(agentId);
			}
			this._subagentTaskCompletionSchedulers.clearAndDisposeAll();
			this._subagentActivityRevisions.clear();
			this._backgroundTaskStatusRevision++;
			droppedBackgroundTaskReads = true;
		}
		const abortBarrier = this._abortBarrier ??= new DeferredPromise<void>();
		try {
			this._beginAbort();
			this._drainPendingSteeringFlips();
			await this._wrapper.session.abort();
		} catch (error) {
			if (this._abortingTurn === abortTarget) {
				this._abortingTurn = undefined;
			}
			this._resetAbortToken();
			throw error;
		} finally {
			abortBarrier.complete();
			if (this._abortBarrier === abortBarrier) {
				this._abortBarrier = undefined;
			}
			if (droppedBackgroundTaskReads && !this._store.isDisposed) {
				// The bump discards any background task read in flight, possibly the detached shell poll,
				// and detached shells report no exit on their own, so read again to keep publishing.
				this._refreshBackgroundTasks(true);
			}
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
		this._clearCanvasProjection();
		this._lifetimeCts.cancel();
		this._invalidateMappedEvents();
		this._settleIdleWaiters(false);
		void this._editTracker.flushAttribution().catch(error => {
			this._logService.warn(`[Copilot:${this.sessionId}] Failed to flush edit attribution: ${error}`);
		});
		this._beginAbort();
		this._abortBarrier?.complete();
		this._abortBarrier = undefined;
		this._shellInitScriptDisposing = true;
		// Only a session that wrote a script has anything to remove; every other
		// session keeps the plain dispose path. Remove it once the SDK session's
		// disconnect has settled, so a command that is still running can source
		// it, and even when disconnect fails so nothing is left behind. A session
		// that failed before its wrapper existed has no script either, and
		// dispose must never throw ahead of the base disposal below.
		const wrapper: CopilotSessionWrapper | undefined = this._wrapper;
		if (wrapper && this._shellInitScriptMaterialized) {
			void wrapper.disconnect()
				.catch(error => this._logService.warn(`[Copilot:${this.sessionId}] Failed to disconnect before shell init cleanup: ${getErrorMessage(error)}`))
				.then(() => this._disposeShellInitScript());
		}
		super.dispose();
		this._pendingFusionEvents.length = 0;
		this._reassignedFusionSdkTurnIds.clear();
		this._fusionEventTurnIds.clear();
		this._fusionRequestCorrelation.clear();
	}

	/**
	 * Explicitly destroys the underlying SDK session and waits for cleanup
	 * to complete. Call this before {@link dispose} when you need to ensure
	 * the session's on-disk data is no longer locked (e.g. before
	 * truncation or fork operations that modify the session files).
	 */
	async destroySession(): Promise<void> {
		this._clearCanvasProjection();
		try {
			await this._editTracker.flushAttribution();
		} catch (error) {
			this._logService.warn(`[Copilot:${this.sessionId}] Failed to flush edit attribution: ${error}`);
		}
		await this._wrapper.disconnect();
		await this._disposeShellInitScript();
	}

	/**
	 * Registers BYOK models that the renderer reported after this SDK session
	 * launched, e.g. for a chat restored before the renderer's first BYOK
	 * snapshot reached the agent host. External BYOK is additive (see
	 * {@link composeByokSessionConfig}) and a no-op when nothing new was
	 * reported; the on-device rows are replaced by the provider's
	 * current contribution. Serialized so concurrent callers observe each
	 * other's registrations.
	 */
	syncByokModels(): Promise<void> {
		return this._byokSync.queue(async () => {
			const wrapper = this._wrapper;
			if (this._store.isDisposed || !wrapper) {
				return;
			}
			const current = await this._sessionLauncher.resolveByokSessionConfig(this.sessionId);
			const merged = composeByokSessionConfig(this._registeredByokConfig, current, this._launchPlan.localModelProvider?.contributeSessionConfig());
			// A restart across the await swapped in a wrapper with its own launch
			// config, so `merged` is no longer a valid basis for that session.
			if (!merged || this._store.isDisposed || this._wrapper !== wrapper) {
				return;
			}
			this._logService.info(`[Copilot:${this.sessionId}] Registering BYOK models on live session: models=${merged.models?.length ?? 0}, previouslyRegistered=${this._registeredByokConfig.models?.length ?? 0}`);
			await this._awaitControlPlaneRpc('rpc.provider.sync', wrapper.session.rpc.provider.sync(merged));
			this._registeredByokConfig = merged;
		});
	}

	async setModel(model: string, reasoningEffort?: SessionConfig['reasoningEffort'], contextTier?: SessionConfig['contextTier'], autoTier?: NonNullable<SessionConfig['capi']>['autoTier'] | null, requested?: ModelSelection): Promise<void> {
		// The runtime rejects a BYOK model that is not registered on the session.
		try {
			await this.syncByokModels();
		} catch (err) {
			// Deliberately non-fatal: let `setModel` report the runtime's own error
			// rather than this one. Note a timed-out `provider.sync` still marks the
			// session control-plane desynchronized, so the failure is not dropped.
			this._logService.warn(`[Copilot:${this.sessionId}] Failed to register BYOK models before changing model`, err);
		}
		this._logService.info(`[Copilot:${this.sessionId}] Changing model to: ${model}`);
		try {
			await this._awaitControlPlaneRpc('session.setModel', this._wrapper.session.setModel(model, {
				reasoningEffort,
				contextTier,
				...(autoTier !== undefined ? { autoTier } : {}),
			}));
			this._requestedModel = requested ?? { id: model };
		} finally {
			this.refreshModelConfiguration();
		}
		this._lastSeenModelId = model;
		this._reportLocalModelSelection(model);
	}

	refreshModelConfiguration(): void {
		if (this._store.isDisposed) {
			return;
		}
		const generation = ++this._modelConfigurationGeneration;
		void this._modelConfigurationRefresh.queue(() => this._refreshManagedModelConfiguration(generation)).catch(error => {
			if (!isCancellationError(error) && !this._store.isDisposed) {
				this._logService.error(error, '[Copilot] Failed to schedule model configuration refresh');
			}
		});
	}

	private async _refreshManagedModelConfiguration(generation: number): Promise<void> {
		if (!this._wrapper || this._store.isDisposed) {
			return;
		}
		try {
			const policy = await resolveCopilotSessionManagedSettings(this._launchPlan, this._lifetimeCts.token);
			if (this._store.isDisposed) {
				return;
			}
			await this._awaitControlPlaneRpc('session.model.list', this._wrapper.session.rpc.model.list());
			const current = await this._awaitControlPlaneRpc('session.model.getCurrent', this._wrapper.session.rpc.model.getCurrent());
			if (generation !== this._modelConfigurationGeneration || this._store.isDisposed) {
				return;
			}
			const models = this._launchPlan.modelPolicyModels?.() ?? [];
			this._publishModelConfiguration(createCopilotModelConfigurationReport(models, policy, current, this._requestedModel, this._logService));
		} catch (error) {
			if (generation === this._modelConfigurationGeneration && !this._store.isDisposed) {
				this._publishModelConfiguration(undefined);
				this._logService.error(error, '[Copilot] Failed to refresh session model configuration');
			}
		}
	}

	private _publishModelConfiguration(report: IAgentModelConfigurationReport | undefined): void {
		const owner = this._ownerSessionUri.toString();
		const chat = this._chatChannelUri.toString();
		const previous = this._configurationService.getSessionConfigValues(owner)?.[agentModelConfigurationReportKey];
		const reports: Record<string, unknown> = isObject(previous) ? { ...previous } : {};
		const current = reports[chat];
		const currentOwner: { owner?: unknown } = isObject(current) ? current : {};
		if (!report && currentOwner.owner !== this._modelConfigurationOwner) {
			return;
		}
		const next = report ? { ...report, owner: this._modelConfigurationOwner } : null;
		if (!equals(current, next)) {
			const updated = { ...reports };
			if (next) {
				updated[chat] = next;
			} else {
				delete updated[chat];
			}
			this._configurationService.updateSessionConfig(owner, { [agentModelConfigurationReportKey]: updated });
		}
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

	/**
	 * Starts a server or renews exhausted authentication callbacks via the SDK's OAuth reset.
	 * An existing callback needs only a token response; SDK lifecycle updates determine connection progress.
	 */
	async startMcpServer(id: string, token: CancellationToken = CancellationToken.None): Promise<void> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const serverName = this._mcpCustomizations.serverNameForCustomizationId(id);
		if (!serverName) {
			throw new Error(`Cannot start unknown MCP server customization ${id}`);
		}
		return this._startMcpServer(serverName, token);
	}

	private async _startMcpServer(serverName: string, token: CancellationToken): Promise<void> {
		return raceCancellationError(this._runMcpServerControl(() => this._mcpServerLifecycleSequencer.queue(serverName, async () => {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			const state = this._mcpCustomizations.stateForServer(serverName);
			if (state?.kind === McpServerStatus.AuthRequired) {
				this._mcpLifecycleVersion++;
				this._mcpCustomizations.applyOne({ name: serverName, state }, true);
				if (this._hasPendingMcpAuthentication(serverName)) {
					return;
				}
				try {
					this._recordRuntimeMutation('userRequested');
					await this._wrapper.session.rpc.mcp.oauth.authenticationStateChanged({ serverName });
				} finally {
					this._seedMcpServersFromRpc();
				}
				return;
			}
			try {
				this._logService.info(`[Copilot:${this.sessionId}] Starting MCP server '${serverName}' (state=${state?.kind})`);
				this._recordRuntimeMutation('userRequested');
				await this._wrapper.session.rpc.mcp.startServer({ serverName });
			} finally {
				// Reconcile against the SDK's real state. The live
				// `session.mcp_server_status_changed` stream already reports the
				// connect (`pending` -> `connected`/`failed`); this covers the case
				// where the start rejects before any status is emitted.
				this._seedMcpServersFromRpc();
			}
		})), token);
	}

	/** A control already in flight defers reconciliation; a later control wins over its final state. */
	private async _runMcpServerControl(operation: () => Promise<void>): Promise<void> {
		this._mcpServerControlOperations++;
		try {
			await this._connectorRefresh;
			if (this.isDisposed) {
				throw new CancellationError();
			}
			await operation();
		} finally {
			this._mcpServerControlOperations--;
		}
	}

	private _reconcileMcpServerEnablement(recorder?: IAgentProviderSendStageRecorder): Promise<void> {
		return measureAgentProviderOperation(recorder, 'mcp', () => this._doReconcileMcpServerEnablement(recorder), this._mcpEnablementSequencer);
	}

	private async _doReconcileMcpServerEnablement(recorder?: IAgentProviderSendStageRecorder): Promise<void> {
		this._markMcpLaunchConfigurationDirty();
		const { servers } = await measureAgentProviderOperation(recorder, 'mcpList', () => this._wrapper.session.rpc.mcp.listConfigured());
		this._markMcpLaunchConfigurationDirty();
		const desiredEnablement = this._getDesiredMcpServerEnablementByName(servers.map(server => server.name), false);
		if (desiredEnablement.size === 0) {
			return;
		}
		const observedEnablement = new Map(servers.map(server => [server.name, getEffectiveMcpServerEnablement(server.enabled, server.live?.status)] as const));
		const observedServers = new Map(servers.map(server => [server.name, server] as const));
		const logChange = (serverName: string, desired: boolean) => {
			const observed = observedServers.get(serverName);
			this._logService.info(`[Copilot:${this.sessionId}] Reconciling MCP server '${serverName}' enablement: ${desired ? 'enable' : 'disable'} (sdkEnabled=${observed?.enabled}, sdkStatus=${observed?.live?.status}, launchDirty=${this._mcpLaunchConfigurationDirty})`);
		};
		let changed = false;
		for (const [serverName, desired] of desiredEnablement) {
			const enabled = observedEnablement.get(serverName);
			try {
				if (desired) {
					const observed = observedServers.get(serverName);
					// A configured server the runtime has not loaded yet starts with that load; enabling it now races a second start.
					const awaitingLoad = observed?.enabled === true && observed.live?.status === 'not_configured';
					if (enabled !== false || awaitingLoad || (this._mcpLaunchConfigurationDirty && this._projectedMcpServerLaunchEnablement.has(serverName))) {
						continue;
					}
					// Re-enabling restarts the server. The SDK reports the
					// connect live (`pending` -> `connected`/`failed`), so no
					// optimistic state is written here.
					changed = true;
					logChange(serverName, true);
					await measureAgentProviderOperation(recorder, 'mcpEnable', () => this._enableMcpServer(serverName));
				} else {
					// `undefined`: the SDK does not configure this server (e.g. a child of a disabled plugin), so
					// there is nothing to disable; disabling an unknown name makes the runtime reload its MCP graph.
					if (enabled !== true) {
						continue;
					}
					logChange(serverName, false);
					await measureAgentProviderOperation(recorder, 'mcpDisable', () => this._disableMcpServer(serverName));
					changed = true;
				}
			} catch (e) {
				this._logService.error(e, `[Copilot:${this.sessionId}] Failed to ${desired ? 'enable' : 'disable'} MCP server ${serverName}`);
				if (!desired) {
					throw e;
				}
			}
		}
		if (changed) {
			this._seedMcpServersFromRpc();
		}
	}

	private _getDesiredMcpServerEnablementByName(configuredServerNames: readonly string[] = [], includeInheritedEnablement = true): ReadonlyMap<string, boolean> {
		const customizations = [...this._hostCustomizations()];
		const retainedNames = new Set(getMcpServerCustomizations(customizations).map(server => server.name));
		for (const server of this._mcpCustomizations.topLevelCustomizations()) {
			if (!retainedNames.has(server.name)) {
				customizations.push(server);
				retainedNames.add(server.name);
			}
		}
		for (const name of configuredServerNames) {
			if (!retainedNames.has(name)) {
				const id = buildMcpTopLevelCustomizationId(COPILOT_CLI_AGENT_PROVIDER_ID, AgentSession.id(this.launchOwner), name);
				customizations.push({ type: CustomizationType.McpServer, id, uri: id, name, state: { kind: McpServerStatus.Stopped } });
				retainedNames.add(name);
			}
		}
		const resolved = resolveCustomizationEnablement(
			this._customizationEnablementService,
			this.launchOwner,
			customizations,
			undefined,
			undefined,
			this._mcpCustomizations.pluginMcpServerSources,
		);
		const enabledById = getSdkMcpServerEnablement(resolved);
		const candidates = new Map<string, Array<{ readonly server: McpServerCustomization; readonly applied: boolean; readonly explicit: boolean }>>();
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
				const explicit = this._declaredMcpServerNames.has(server.name) || this._projectedMcpServerLaunchEnablement.has(server.name)
					|| (server.enablement?.length ?? 0) > 0
					|| (customization.type === CustomizationType.Plugin && (customization.enablement?.length ?? 0) > 0);
				namedCandidates.push({ server, applied, explicit });
			}
		}
		for (const [name, namedCandidates] of candidates) {
			const applicable = namedCandidates.some(candidate => candidate.applied)
				? namedCandidates.filter(candidate => candidate.applied)
				: namedCandidates;
			for (const candidate of applicable) {
				const enabled = enabledById.get(candidate.server.id) ?? false;
				if (enabled && !candidate.explicit && !includeInheritedEnablement) {
					continue;
				}
				result.set(name, (result.get(name) ?? true) && enabled);
			}
		}
		for (const name of this._launchPlan.disabledRootMcpServers ?? []) {
			if (!result.has(name)) {
				result.set(name, false);
			}
		}
		for (const [name, observed] of this._observedMcpEnablementOverrides) {
			if (result.get(name) === observed) {
				this._observedMcpEnablementOverrides.delete(name);
			} else {
				result.set(name, observed);
			}
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

	private _recordRuntimeMutation(cause: CopilotRuntimeMutation): void {
		this._runtimeMutation = { cause, sequence: (this._runtimeMutation?.sequence ?? 0) + 1 };
	}

	private _observeMcpRestart(serverName: string, status: SessionEventPayload<'session.mcp_server_status_changed'>['data']['status']): void {
		const previous = this._mcpRestartStates.get(serverName);
		const sequence = this._runtimeMutation?.sequence ?? 0;
		const running = status === 'pending' || status === 'connected' || status === 'needs-auth';
		// The runtime can also reconnect a connected server without reporting it as stopped first.
		const restarted = status === 'pending' && (previous?.stopped || previous?.connected);
		if (restarted) {
			const turn = this._currentTurn.value;
			const event: CopilotRuntimeRestartEvent = {
				...createCopilotFailureCorrelation(this.resourceUri, this._chatChannelUri, turn?.id, this.sessionId, turn?.clientContext),
				kind: 'mcpServer',
				cause: this._runtimeMutation && this._runtimeMutation.sequence > previous.sequence ? this._runtimeMutation.cause : 'runtime',
				firstTurn: !this.hasCompletedTurn,
				phase: !turn ? 'idle' : turn.activeSdkTurnId ? 'inTurn' : 'turnPrepare',
			};
			if (this._wrapper) {
				void reportCopilotRuntimeRestart(this._telemetryService, event, this.completedTurnHistory);
			} else {
				this._unattachedMcpRestarts.push(event);
			}
		}
		if (running) {
			this._mcpRestartStates.set(serverName, { sequence: previous?.running && !restarted ? previous.sequence : sequence, running: true, connected: status === 'connected', stopped: false });
		} else if (status === 'not_configured' || status === 'disabled') {
			this._mcpRestartStates.set(serverName, { sequence: previous?.sequence ?? sequence, running: false, connected: false, stopped: previous?.running === true || previous?.stopped === true });
		} else {
			this._mcpRestartStates.delete(serverName);
		}
	}

	private async _enableMcpServer(serverName: string): Promise<void> {
		this._expectedMcpEnablementChanges.set(serverName, true);
		try {
			this._recordRuntimeMutation('mcpEnable');
			await this._wrapper.session.rpc.mcp.enable({ serverName });
		} catch (error) {
			if (this._expectedMcpEnablementChanges.get(serverName) === true) {
				this._expectedMcpEnablementChanges.delete(serverName);
			}
			throw error;
		}
	}

	private async _disableMcpServer(serverName: string): Promise<void> {
		// disable() hangs until pending auth requests have resolved.
		// reported to the SDK folks though arguable whether it's a bug or not...
		this._cancelPendingMcpAuthRequestsForServer(serverName);
		this._expectedMcpEnablementChanges.set(serverName, false);
		try {
			this._recordRuntimeMutation('mcpDisable');
			await this._wrapper.session.rpc.mcp.disable({ serverName });
		} catch (error) {
			if (this._expectedMcpEnablementChanges.get(serverName) === false) {
				this._expectedMcpEnablementChanges.delete(serverName);
			}
			throw error;
		}
	}

	async stopMcpServer(id: string): Promise<void> {
		const serverName = this._mcpCustomizations.serverNameForCustomizationId(id);
		if (!serverName) {
			this._logService.warn(`[Copilot:${this.sessionId}] Cannot stop unknown MCP server customization ${id}`);
			return;
		}
		this._cancelPendingMcpAuthRequestsForServer(serverName);
		return this._runMcpServerControl(() => this._mcpServerLifecycleSequencer.queue(serverName, async () => {
			this._cancelPendingMcpAuthRequestsForServer(serverName);
			this._recordRuntimeMutation('userRequested');
			await this._wrapper.session.rpc.mcp.stopServer({ serverName });
			this._mcpLifecycleVersion++;
			this._mcpCustomizations.applyOne({ name: serverName, state: { kind: McpServerStatus.Stopped } });
		}));
	}

	async backgroundMcpServerStartup(): Promise<void> {
		const starting = this._mcpCustomizations.serverEnablement()
			.map(({ serverName }) => ({ name: serverName, state: this._mcpCustomizations.stateForServer(serverName) }));
		// The SDK backgrounds loading session-wide, not per server.
		const { movedToBackground } = await this._wrapper.session.rpc.mcp.moveLoadingToBackground();
		if (!movedToBackground) {
			this._logService.info(`[Copilot:${this.sessionId}] MCP loading was not moved to the background: movedToBackground=false, starting=[${starting.filter(s => s.state?.kind === McpServerStatus.Starting).map(s => s.name).join(', ')}]`);
			return;
		}
		if (this.isDisposed) {
			return;
		}
		this._mcpLifecycleVersion++;
		for (const server of starting) {
			if (server.state?.kind !== McpServerStatus.Starting || this._mcpCustomizations.stateForServer(server.name) !== server.state) {
				continue;
			}
			this._mcpCustomizations.applyOne({ name: server.name, state: { kind: McpServerStatus.Starting, blocking: false } });
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

		return this._executeMcpSampling({
			requestId: generateUuid(),
			serverName,
			mcpRequestId: generateUuid(),
			request: params,
		});
	}

	private async _executeMcpSampling(params: Parameters<CopilotSession['rpc']['mcp']['executeSampling']>[0], abortToken = this._abortToken) {
		const { requestId } = params;
		if (this.isDisposed || abortToken.isCancellationRequested) {
			throw new CancellationError();
		}
		this._pendingMcpSamplings.add(requestId);
		try {
			const result = await raceCancellationError(this._wrapper.session.rpc.mcp.executeSampling(params), abortToken);
			if (this.isDisposed || abortToken.isCancellationRequested || result.action === 'cancelled') {
				throw new CancellationError();
			}
			if (result.action === 'success' && result.result) {
				return result.result;
			}
			throw new Error(`sampling/createMessage ${result.action}${result.error ? `: ${result.error}` : ''}`);
		} finally {
			this._pendingMcpSamplings.delete(requestId);
		}
	}

	private _getSamplingServerIdentity(serverName: string): string {
		const identities: string[] = [];
		const configuration = this._appliedSnapshot.mcpServers[serverName];
		if (configuration) {
			identities.push(getMcpRoutingCacheKey({ serverName, configuration }, 'root'));
		}
		for (const plugin of this._appliedSnapshot.plugins) {
			for (const server of plugin.mcpServers) {
				if (server.name === serverName && !plugin.disabledMcpServers?.includes(serverName)) {
					identities.push(getMcpRoutingCacheKey({ serverName, configuration: server.configuration }, (plugin.sourceUri ?? server.uri).toString()));
				}
			}
		}
		const provenance = this._mcpInventoryProvenance.get(serverName);
		return identities.length || provenance?.source || provenance?.sourcePlugin
			? JSON.stringify([serverName, provenance?.source, provenance?.sourcePlugin, ...identities.sort()])
			: serverName;
	}

	private async _handleSamplingRequest(data: SessionEventPayload<'sampling.requested'>['data'] & { request?: Record<string, unknown> }): Promise<void> {
		const abortToken = this._abortToken;
		const turn = this._currentTurn.value;
		const cancellation = new CancellationTokenSource(abortToken);
		const pending = { toolCallId: generateUuid(), executionId: generateUuid(), cancellation, completed: false, dispose: () => cancellation.dispose(true) };
		this._pendingSamplingRequests.set(data.requestId, pending);
		let surfaced = false;
		let failure: string | undefined;
		let response: Parameters<CopilotSession['rpc']['ui']['handlePendingSampling']>[0]['response'];
		try {
			// The runtime sends raw MCP params, but the SDK's event schema does not yet declare them.
			if (!isObject(data.request) || !data.serverName || (typeof data.mcpRequestId !== 'string' && typeof data.mcpRequestId !== 'number')) {
				throw new Error('Invalid MCP sampling request');
			}
			const serverIdentity = this._getSamplingServerIdentity(data.serverName);
			const preapproved = this._configurationService.getRootValue(platformRootSchema, AgentHostMcpSamplingAllowedServersConfigKey)?.includes(serverIdentity) === true;
			if (turn && !this.isDisposed && !abortToken.isCancellationRequested && (preapproved || !this._isAutopilotMode())) {
				const approval = preapproved ? undefined : this._pendingPermissions.register(pending.toolCallId, {
					managedApprovalRequired: false,
					samplingServerIdentity: serverIdentity,
				});
				surfaced = true;
				this._emitAction({
					type: ActionType.ChatToolCallStart,
					turnId: turn.id,
					toolCallId: pending.toolCallId,
					toolName: 'mcp_sampling',
					displayName: localize('mcpSamplingDisplayName', "MCP Sampling"),
				});
				this._emitAction({
					type: ActionType.ChatToolCallReady,
					turnId: turn.id,
					toolCallId: pending.toolCallId,
					invocationMessage: localize('mcpSamplingRequest', "MCP server '{0}' wants to send a {1}-character long message to the language model.", data.serverName, getSamplingRequestCharacterCount(data.request)),
					...(preapproved ? { confirmed: ToolCallConfirmationReason.Setting } : {
						confirmationTitle: localize('mcpSamplingConfirmation', "Allow Sampling from {0}?", data.serverName),
						options: [
							{ id: 'allow-once', label: localize('mcpSamplingAllowOnce', "Allow Once"), kind: ConfirmationOptionKind.Approve },
							{ id: ALLOW_SAMPLING_ALWAYS_OPTION_ID, label: localize('mcpSamplingAllowAlways', "Always Allow for This Server"), kind: ConfirmationOptionKind.Approve, group: 1 },
							{ id: 'skip', label: localize('mcpSamplingSkip', "Skip"), kind: ConfirmationOptionKind.Deny, group: 2 },
						],
					}),
				});
				const result = await approval;
				const approved = preapproved || (result?.kind === 'decision' && result.result.kind === 'approve-once');
				if (approved && !pending.completed && !this.isDisposed && !abortToken.isCancellationRequested && this._currentTurn.value === turn) {
					response = await this._executeMcpSampling({
						requestId: pending.executionId,
						serverName: data.serverName,
						mcpRequestId: data.mcpRequestId,
						request: data.request,
					}, pending.cancellation.token);
				}
			} else if (!this.isDisposed && !abortToken.isCancellationRequested) {
				this._logService.warn(`[Copilot:${this.sessionId}] Rejecting sampling without an interactive turn or prior sampling approval: requestId=${data.requestId}`);
			}
		} catch (error) {
			if (!isCancellationError(error)) {
				failure = getErrorMessage(error);
				this._logService.error(error, `[Copilot:${this.sessionId}] Failed to serve sampling request: requestId=${data.requestId}`);
			}
		}
		try {
			if (pending.completed) {
				return;
			}
			const result = await this._wrapper.session.rpc.ui.handlePendingSampling({ requestId: data.requestId, ...(response ? { response } : {}) });
			if (!result.success) {
				response = undefined;
				this._logService.warn(`[Copilot:${this.sessionId}] Sampling request was no longer pending: requestId=${data.requestId}`);
			}
		} catch (error) {
			response = undefined;
			failure = getErrorMessage(error);
			this._logService.error(error, `[Copilot:${this.sessionId}] Failed to resolve sampling request: requestId=${data.requestId}`);
		} finally {
			this._pendingSamplingRequests.deleteAndDispose(data.requestId);
			if (surfaced && turn && !this.isDisposed && !abortToken.isCancellationRequested && this._currentTurn.value === turn) {
				this._emitAction({
					type: ActionType.ChatToolCallComplete,
					turnId: turn.id,
					toolCallId: pending.toolCallId,
					result: {
						success: !!response,
						pastTenseMessage: response
							? localize('mcpSamplingCompleted', "Sampled for {0}", data.serverName)
							: localize('mcpSamplingNotCompleted', "Sampling for {0} did not complete", data.serverName),
						...(response ? { content: [{ type: ToolResultContentType.Text, text: JSON.stringify(response, null, '\t') }] } : {}),
						...(failure ? { error: { message: failure } } : {}),
					},
				});
			}
		}
	}

	private _completeSamplingRequest(requestId: string): void {
		const pending = this._pendingSamplingRequests.get(requestId);
		if (!pending) {
			return;
		}
		pending.completed = true;
		pending.cancellation.cancel();
		this._pendingPermissions.respond(pending.toolCallId, { kind: 'decision', result: { kind: 'reject' }, source: 'unattended_fallback' });
		if (this._pendingMcpSamplings.delete(pending.executionId)) {
			void this._wrapper.session.rpc.mcp.cancelSamplingExecution({ requestId: pending.executionId }).catch(error => {
				this._logService.warn(`[Copilot:${this.sessionId}] Failed to cancel completed sampling request: requestId=${requestId}`, error);
			});
		}
	}

	/** Bounds a short SDK control-plane RPC so it cannot wedge the owning chat queue. */
	private async _awaitControlPlaneRpc<T>(operation: string, rpc: Promise<T>): Promise<T> {
		const result = await raceTimeout(rpc.then(value => ({ value })), this._controlPlaneRpcTimeoutMs);
		if (!result) {
			// The request is still in flight and may still mutate SDK state, so
			// mark the session for resync rather than continuing to use it.
			this._controlPlaneDesynchronized = true;
			const error = new Error(`[Copilot:${this.sessionId}] ${operation} timed out after ${this._controlPlaneRpcTimeoutMs}ms`);
			this._logService.error(error, `[Copilot:${this.sessionId}] Control-plane RPC timed out: ${operation}`);
			throw error;
		}
		return result.value;
	}

	/**
	 * Selects (or clears) a custom agent on the live SDK session.
	 * Mirrors the SDK's `rpc.agent.select` / `rpc.agent.deselect` pair.
	 */
	async setAgent(agentName?: string): Promise<void> {
		const selection = agentName || null;
		if (selection === this._lastAppliedAgent) {
			return;
		}
		if (agentName) {
			const name = agentName;
			this._logService.info(`[Copilot:${this.sessionId}] Selecting custom agent: ${name}`);
			try {
				this._recordRuntimeMutation('agentSelect');
				await this._awaitControlPlaneRpc('rpc.agent.select', this._wrapper.session.rpc.agent.select({ name }));
			} catch (err) {
				this._logService.error(err, `[Copilot:${this.sessionId}] rpc.agent.select failed: name=${name}`);
				throw err;
			}
		} else {
			this._logService.info(`[Copilot:${this.sessionId}] Clearing custom agent selection`);
			try {
				this._recordRuntimeMutation('agentSelect');
				await this._awaitControlPlaneRpc('rpc.agent.deselect', this._wrapper.session.rpc.agent.deselect());
			} catch (err) {
				this._logService.error(err, `[Copilot:${this.sessionId}] rpc.agent.deselect failed`);
				throw err;
			}
		}
		this._lastAppliedAgent = selection;
	}

	// ---- permission handling ------------------------------------------------

	/**
	 * Handles a permission request from the SDK by firing a `tool_ready` event
	 * (which transitions the tool to PendingConfirmation) and waiting for the
	 * side-effects layer to respond via {@link respondToPermissionRequest}.
	 */
	private async _handlePermissionRequest(
		request: PermissionRequest,
		invocation?: Parameters<PermissionHandler>[1],
	): Promise<PermissionRequestResult | AttributedPermissionResult> {
		let sandboxRequestId: string | undefined;
		let sandboxPathGrant: ISandboxPathGrant | undefined;
		try {
			const abortToken = this._abortToken;
			const toolCallId = request.toolCallId;
			if (!toolCallId) {
				// TODO: handle permission requests without a toolCallId by creating a synthetic tool call
				this._logService.warn(`[Copilot:${this.sessionId}] Permission request without toolCallId, auto-denying: kind=${request.kind}`);
				return attributePermissionResult({ kind: 'reject' }, 'host_policy');
			}
			if (this._unroutableSubagentToolCallIds.delete(toolCallId)) {
				this._logService.error(`[Copilot:${this.sessionId}] Rejecting permission request for unroutable subagent tool call: toolCallId=${toolCallId}, kind=${request.kind}`);
				return attributePermissionResult({ kind: 'reject' }, 'unattended_fallback');
			}

			const managedApprovalRequired = request.managedApprovalRequired === true;
			const requestSandboxBypass = request.kind === 'shell' || request.kind === 'write' || request.kind === 'read' || request.kind === 'url'
				? request.requestSandboxBypass
				: undefined;
			const requestSandboxPermissive = request.kind === 'shell' && requestSandboxBypass === true
				? request.requestSandboxPermissive === true
				: false;
			sandboxPathGrant = this._sandbox.beginPathGrant(toolCallId, request);
			if (!managedApprovalRequired && request.kind === 'custom-tool' && this._mcpRoutingProxies.has(request.toolName)) {
				this._logService.info(`[Copilot:${this.sessionId}] Auto-approving MCP routing proxy ${request.toolName}`);
				return attributePermissionResult({ kind: 'approve-once' }, 'host_policy');
			}
			const promptRequest = invocation?.promptRequest;
			const canUseAssistedApproval = !managedApprovalRequired || (promptRequest !== undefined
				&& (promptRequest.kind === 'commands' || promptRequest.kind === 'read' || promptRequest.kind === 'write' || promptRequest.kind === 'url' || promptRequest.kind === 'workflow')
				&& promptRequest.managedApprovalRequired !== true);
			const autoApproval = canUseAssistedApproval && this._lastAppliedPermissionMode === 'assisted'
				? promptRequest?.assistedApproval
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
					this._emitProgress({
						kind: 'pending_confirmation',
						chat: this._chatChannelUri,
						state: {
							status: ToolCallStatus.PendingConfirmation,
							toolCallId,
							toolName: request.toolName,
							displayName,
							invocationMessage: getInvocationMessage(request.toolName, displayName, parameters, path => this._resolveEditFilePath(path), this._resolveAgentName),
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
				return attributePermissionResult({ kind: 'approve-once' }, 'assisted_approval');
			}

			// The runtime recommends approving tools of trusted built-in MCP servers
			// (Computer Use, which gates each app with its own consent prompt). Deny
			// rules are evaluated before the host is consulted; managed approval and
			// a consulted assisted-approval judge still outrank the recommendation.
			if (!managedApprovalRequired && request.kind === 'mcp' && request.permissionRecommendation === 'approve' && autoApproval === undefined) {
				this._logService.info(`[Copilot:${this.sessionId}] Auto-approving ${request.serverName}/${request.toolName} on the runtime's recommendation`);
				return attributePermissionResult({ kind: 'approve-once' }, 'host_policy');
			}

			const approvedSignature = this._approvedDuplicablePermissionSignatures.get(toolCallId);
			if (approvedSignature !== undefined) {
				this._approvedDuplicablePermissionSignatures.delete(toolCallId);
				if (!managedApprovalRequired && !requestSandboxBypass && (request.kind === 'write' || request.kind === 'read' || request.kind === 'shell') && safeStringify(request) === approvedSignature) {
					this._logService.info(`[Copilot:${this.sessionId}] Auto-approving duplicate ${request.kind} permission request for tool call ${toolCallId}`);
					return attributePermissionResult({ kind: 'approve-once' }, 'host_policy');
				}
			}

			const sessionResourcePath = this._getInternalSessionResourcePath(request);
			if (!managedApprovalRequired && !requestSandboxBypass && sessionResourcePath) {
				this._logService.info(`[Copilot:${this.sessionId}] Auto-approving internal session resource ${sessionResourcePath}`);
				return attributePermissionResult({ kind: 'approve-once' }, 'host_policy');
			}

			// Auto-approve reads of large-tool-output temp files written by the
			// Copilot SDK itself. The SDK spills oversized tool results to
			// `os.tmpdir()/copilot-tool-output-…txt` and then asks the model
			// to read them back in a follow-up turn — no need to confirm.
			if (!managedApprovalRequired && !requestSandboxBypass && request.kind === 'read' && typeof request.path === 'string') {
				if (isCopilotSdkToolOutputTempFile(request.path, this._environmentService.tmpDir.fsPath)) {
					this._logService.info(`[Copilot:${this.sessionId}] Auto-approving Copilot SDK tool-output temp file ${request.path}`);
					return attributePermissionResult({ kind: 'approve-once' }, 'host_policy');
				}
			}

			// SDK plugin directories are discovery inputs, so the runtime does not otherwise trust their contents.
			if (!managedApprovalRequired && !requestSandboxBypass && request.kind === 'read' && typeof request.path === 'string') {
				if (await this._isReadWithinAppliedPluginDirectory(request.path)) {
					this._logService.info(`[Copilot:${this.sessionId}] Auto-approving read within an applied plugin directory: ${request.path}`);
					return attributePermissionResult({ kind: 'approve-once' }, 'host_policy');
				}
			}

			const serverToolHost = this._serverToolHost;
			const serverToolName = request.kind === 'custom-tool' && typeof request.toolName === 'string'
				&& this._getServerToolDefinitions().some(tool => tool.name === request.toolName)
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
					return attributePermissionResult({ kind: 'approve-once' }, 'host_policy');
				}
				// Server tools that never confirm only read or mutate the
				// session's own server-held state and never touch the workspace,
				// shell, or network, so prompting for them is redundant noise.
				if (!canRequireConfirmation && !managedApprovalRequired) {
					this._logService.info(`[Copilot:${this.sessionId}] Auto-approving server tool ${serverToolName}`);
					return attributePermissionResult({ kind: 'approve-once' }, 'host_policy');
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
			const trackedToolName = this._activeToolCalls.get(toolCallId)?.toolName ?? this._provisionalFusionToolStarts.get(toolCallId)?.data.toolName;
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
				return attributePermissionResult({ kind: 'approve-once' }, 'host_policy');
			}

			this._logService.info(`[Copilot:${this.sessionId}] Requesting confirmation for tool call: ${toolCallId}`);

			const pendingPermission = this._pendingPermissions.register(toolCallId, {
				managedApprovalRequired,
				sandboxPathGrant,
			});

			// Auto-approve shell commands that run sandboxed by default, since the
			// sandbox already contains them. Sandbox escalation requests
			// (`requestSandboxBypass`) are an elevation of privilege and must
			// fall through to the normal confirmation flow — otherwise enabling
			// `sandbox.allowBypass` would let the model escape the sandbox with no
			// prompt at all. A file-scoped surface (editor inline chat) is
			// likewise excluded: the sandbox contains a command to the workspace,
			// not to that surface's one file, so it can still edit other files.
			if (!managedApprovalRequired && !this._launchPlan.hasScopedEditSurface && isShellRequest && !requestSandboxBypass && await this._sandbox.isShellSandboxedByDefault()) {
				// Session may have been disposed while we awaited the engine
				// check; if so the deferred has already been settled and
				// removed, so leave it alone.
				if (this._pendingPermissions.has(toolCallId)) {
					this._pendingPermissions.respond(toolCallId, { kind: 'decision', result: { kind: 'approve-once' }, source: 'host_policy' });
					this._logService.info(`[Copilot:${this.sessionId}] Auto-approving sandboxed shell command for tool call ${toolCallId}`);
					return attributePermissionResult({ kind: 'approve-once' }, 'host_policy');
				}
				return attributePermissionResult({ kind: 'reject' }, 'unattended_fallback');
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
				return attributePermissionResult({ kind: 'reject' }, 'unattended_fallback');
			}

			// A tool from a provisional Fusion phase is hidden until it needs
			// the user; show it now so the confirmation has a row to land on
			// and its completion can close that same row.
			this._surfaceProvisionalFusionToolCall(toolCallId);

			const isNewFile = edits?.items.some(edit => !edit.before && !!edit.after);
			const trackedToolCall = this._activeToolCalls.get(toolCallId);
			const permissionDisplay = getPermissionDisplay(request, this._workingDirectory, isNewFile, this._appliedAdditionalDirectories, trackedToolCall?.parameters);
			// A server tool's confirmation as its group builds it with the host's state (e.g. linking only known sessions).
			const serverConfirmation = serverToolName && request.kind === 'custom-tool' ? serverToolHost?.getConfirmationDisplay(serverToolName, request.args) : undefined;
			const { permissionKind, permissionPath, shellCommand } = permissionDisplay;
			const confirmationTitle = serverConfirmation?.confirmationTitle ?? permissionDisplay.confirmationTitle;
			const invocationMessage = serverConfirmation?.confirmationMessage ?? permissionDisplay.invocationMessage;
			const toolInput = serverConfirmation?.hideConfirmationInput ? undefined : permissionDisplay.toolInput;

			// Fire a pending_confirmation signal to transition the tool to PendingConfirmation
			const toolName = request.kind === 'mcp' || request.kind === 'custom-tool' || request.kind === 'hook'
				? request.toolName ?? request.kind
				: request.kind;
			// Forward the tool's parentToolCallId (if any) so the host can
			// route the resulting ChatToolCallReady to the correct
			// subagent session — without it the action would land on the
			// parent session, which has no matching ChatToolCallStart.
			const parentToolCallId = trackedToolCall?.parentToolCallId;
			sandboxRequestId = this._sandbox.getPendingRequestId(toolCallId);
			const grantConfirmation = sandboxPathGrant && sandboxRequestId ? getSandboxPathGrantConfirmation(sandboxPathGrant) : undefined;
			const grantMeta = grantConfirmation && sandboxPathGrant ? this._sandbox.pathGrantForSettings(sandboxPathGrant) : undefined;
			if (trackedToolCall) {
				trackedToolCall.pendingImageReady = undefined;
			}
			this._emitProgress({
				kind: 'pending_confirmation',
				chat: this._chatChannelUri,
				state: {
					status: ToolCallStatus.PendingConfirmation,
					toolCallId,
					toolName,
					displayName: getToolDisplayName(toolName, request.kind === 'mcp' ? request : undefined),
					contributor: trackedToolCall?.contributor ?? this._getToolCallContributor(toolName, undefined),
					intention: trackedToolCall?.intention,
					_meta: withPermissionDiff(grantMeta ? { ...toToolCallMeta(trackedToolCall?.meta ?? (isShellRequest ? { toolKind: 'terminal', language: shellLanguage } : {})), 'vscode.sandboxPathGrant': grantMeta }
						: trackedToolCall?.meta
							? toToolCallMeta(trackedToolCall.meta)
							: isShellRequest ? toToolCallMeta({ toolKind: 'terminal', language: shellLanguage }) : undefined,
						request.kind === 'write' ? request.diff : undefined),
					invocationMessage,
					toolInput: request.kind === 'mcp' && trackedToolCall?.parameters
						? getToolInputString(trackedToolCall.toolName, trackedToolCall.parameters, undefined)
						: toolInput,
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
					...grantConfirmation,
				},
				permissionKind,
				permissionPath,
				managedApprovalRequired,
				requestSandboxBypass,
				requestSandboxPermissive,
				shellLanguage,
				shellCommand,
				parentToolCallId,
			});

			const result = await pendingPermission;
			if (result.kind === 'grant-sandbox-path') {
				return await this._sandbox.grantPathForPendingRequest(toolCallId, sandboxRequestId, sandboxPathGrant, result.context, abortToken);
			}
			this._logService.info(`[Copilot:${this.sessionId}] Permission response: toolCallId=${toolCallId}, result=${result.result.kind}`);
			if (!abortToken.isCancellationRequested && !managedApprovalRequired && result.result.kind === 'approve-once' && (request.kind === 'write' || request.kind === 'read' || request.kind === 'shell')) {
				this._approvedDuplicablePermissionSignatures.set(toolCallId, safeStringify(request));
			}
			return attributePermissionResult(result.result, result.source);
		} catch (error) {
			this._logService.error(error, `[Copilot:${this.sessionId}] Failed to handle permission request: kind=${request.kind}, toolCallId=${request.toolCallId ?? 'missing'}`);
			throw error;
		} finally {
			if (this._sandbox.finishPermissionRequest(request.toolCallId, sandboxRequestId, sandboxPathGrant) && !this._store.isDisposed) {
				void this._syncPermissionModeAfterConfigChange();
			}
		}
	}

	private async _isReadWithinAppliedPluginDirectory(filePath: string): Promise<boolean> {
		const match = await firstParallel(
			this._appliedPluginDirectories.map(async pluginDirectory => {
				try {
					return await isPathWithinDirectory(filePath, pluginDirectory, this._realpath);
				} catch (error) {
					this._logService.warn(`[Copilot:${this.sessionId}] Could not verify plugin resource containment: ${filePath}`, error);
					return false;
				}
			}),
			isMatch => isMatch,
			false,
		);
		return match === true;
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

		const sessionStateDir = normalizePath(URI.joinPath(this._copilotHomeService.home, SESSION_STATE_DIRECTORY));
		const sessionDir = normalizePath(URI.joinPath(sessionStateDir, this.sessionId));
		if (!extUriBiasedIgnorePathCase.isEqualOrParent(sessionDir, sessionStateDir)) {
			return undefined;
		}

		const permissionUri = normalizePath(URI.file(permissionPath));
		return extUriBiasedIgnorePathCase.isEqualOrParent(permissionUri, sessionDir) ? permissionPath : undefined;
	}

	/**
	 * Session-scoped root granted to the sandbox; stable across instances of
	 * the same SDK session so replacements do not churn the sandbox policy.
	 */
	private _shellInitScriptDirectory(): URI {
		const sessionId = this.sessionId.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').substring(0, 128) || 'session';
		return URI.joinPath(URI.file(this._environmentService.userDataPath), 'agentHost', 'shellInit', sessionId);
	}

	/**
	 * Where this instance writes and deletes its script. Instance-scoped because
	 * {@link dispose} queues the deletion without awaiting it: a resumed
	 * replacement for the same SDK session can register its script first, and a
	 * shared directory would let the stale cleanup remove the live file.
	 */
	private _shellInitScriptInstanceDirectory(): URI {
		return URI.joinPath(this._shellInitScriptDirectory(), this._shellInitScriptInstanceId);
	}

	private _getApprovalInputs() {
		return {
			requested: this._configurationService.getChatEffectiveValue(this._configTarget(), platformSessionSchema, SessionConfigKey.AutoApprove),
			legacyRestricted: this._configurationService.getRootValue(platformRootSchema, AgentHostAutoApprovePolicyRestrictedConfigKey) === true,
			globalAutoApprove: this._configurationService.getRootValue(platformRootSchema, AgentHostGlobalAutoApproveEnabledConfigKey) === true,
		};
	}

	private _getConfiguredAgentMode(): string {
		return this._configurationService.getChatEffectiveValue(this._configTarget(), platformSessionSchema, SessionConfigKey.Mode) ?? 'interactive';
	}

	private _isHydraFusionEnabled(): boolean {
		return this._configurationService.getRootValue(copilotCliConfigSchema, CopilotCliConfigKey.DynamicAutoTiers) === true
			|| this._configurationService.getRootValue(copilotCliConfigSchema, CopilotCliConfigKey.HydraFusion) === true;
	}

	/**
	 * Holds setting exposure until the workbench forwards its assignment context, because
	 * agent host telemetry cannot be attributed to an experiment before then.
	 */
	private _reportSettingExperimentTrigger(settingId: string): void {
		const defaultControlledKey = settingId === AgentHostCopilotExecutionSubagentEnabledSettingId
			? CopilotCliConfigKey.ExecutionSubagentDefaultControlled
			: settingId === AgentHostCopilotExecutionSubagentModelSettingId
				? CopilotCliConfigKey.ExecutionSubagentModelDefaultControlled
				: undefined;
		if (defaultControlledKey !== undefined && this._configurationService.getRootValue(copilotCliConfigSchema, defaultControlledKey) !== true) {
			this._pendingSettingExperimentTriggers.delete(settingId);
			return;
		}
		if (typeof this._configurationService.getRootConfigValues?.()[CopilotCliVSCodeAssignmentContextKey] !== 'string') {
			this._pendingSettingExperimentTriggers.add(settingId);
		} else {
			this._pendingSettingExperimentTriggers.delete(settingId);
			logSettingExperimentTrigger(this._telemetryService, settingId);
		}
	}

	private _subscribeToPermissionConfigChanges(): void {
		this._register(this._configurationService.onDidRootConfigChange(() => {
			void this._syncPermissionModeAfterConfigChange();
			void this._syncImageGenerationAfterConfigChange();
			// The forwarded shell init setting lives in root config.
			void this._syncShellInitScript();
			if (this._pendingSettingExperimentTriggers.size > 0) {
				// Deferred so that the listener installing the forwarded assignment context on telemetry runs first.
				queueMicrotask(() => {
					if (!this._store.isDisposed) {
						for (const settingId of this._pendingSettingExperimentTriggers) {
							this._reportSettingExperimentTrigger(settingId);
						}
					}
				});
			}
		}));
		this._register(this._configurationService.onDidChatConfigChange(event => {
			if (event.chat !== this._chatChannelUri.toString()) {
				return;
			}
			if (Object.hasOwn(event.config, SessionConfigKey.AutoApprove) || Object.hasOwn(event.config, SessionConfigKey.SandboxEnabled)) {
				void this._syncPermissionModeAfterConfigChange(event);
			}
			if (Object.hasOwn(event.config, SessionConfigKey.ShellInitScripts)) {
				void this._syncShellInitScript();
			}
		}));
	}

	private async _syncImageGenerationAfterConfigChange(): Promise<void> {
		if (!this._wrapper) {
			// Wrapper initialization applies the latest preference before the session becomes usable.
			return;
		}
		try {
			await this._syncImageGeneration();
		} catch (error) {
			this._logService.error(error, `[Copilot:${this.sessionId}] Failed to apply image generation setting`);
			const turn = this._currentTurn.value ?? this._resumingTurnAwaitingProviderStart;
			if (turn) {
				try {
					await this.abort();
				} catch (abortError) {
					this._logService.error(abortError, `[Copilot:${this.sessionId}] Failed to abort after image generation setting failure`);
				}
				// Abort quarantines late SDK content, not this host-owned terminal action.
				this._emitAction({
					type: ActionType.ChatError,
					turnId: turn.id,
					duration: turn.duration,
					part: createErrorResponsePart({
						errorType: 'imageGenerationConfiguration',
						message: localize('copilotAgent.imageGenerationConfigurationFailed', "The image generation setting could not be applied. Try again before continuing."),
					}),
				}, undefined, true);
				if (this._currentTurn.value === turn) {
					this._clearActiveTurn();
				}
			}
		}
	}

	private _syncImageGeneration(): Promise<void> {
		return this._imageGenerationSequencer.queue(async () => {
			const enabled = this._configurationService.getRootValue(copilotCliConfigSchema, CopilotCliConfigKey.ImageGeneration) === true;
			const watermark = this._configurationService.getRootValue(copilotCliConfigSchema, CopilotCliConfigKey.ImageGenerationWatermark) === true;
			if (enabled === this._appliedImageGenerationEnabled && watermark === this._appliedImageGenerationWatermark) {
				return;
			}
			const imageGeneration = { enabled, watermark };
			const result = await this._awaitControlPlaneRpc('image generation settings', this._wrapper.session.rpc.options.update({ imageGeneration }));
			if (!result.success) {
				throw new Error('The runtime did not apply the image generation setting.');
			}
			this._appliedImageGenerationEnabled = enabled;
			this._appliedImageGenerationWatermark = watermark;
		});
	}

	private _syncShellInitScript(recorder?: IAgentProviderSendStageRecorder): Promise<void> {
		if (this._shellInitScriptDisposing) {
			return Promise.resolve();
		}
		return measureAgentProviderOperation(recorder, 'shell', () => this._applyEffectiveShellInitScripts(recorder), this._shellInitScriptSequencer);
	}

	private _disposeShellInitScript(): Promise<void> {
		this._shellInitScriptDisposing = true;
		return this._shellInitScriptSequencer.queue(() => this._clearShellInitScript());
	}

	private async _syncPermissionModeAfterConfigChange(event?: IAgentChatConfigurationChangeEvent): Promise<void> {
		const sandboxChange = this._sandbox.prepareConfigChange(event);
		try {
			if (this.hasActiveTurn && (!sandboxChange.sessionCommand || (event && Object.hasOwn(event.config, SessionConfigKey.AutoApprove)))) {
				await this.syncPermissionMode('config-change');
			}
			await sandboxChange.apply();
		} catch (error) {
			this._logService.error(error, `[Copilot:${this.sessionId}] Failed to apply permission config change${this.hasActiveTurn ? '; aborting active turn' : ''}`);
			sandboxChange.reject(error);
			if (!this.hasActiveTurn) {
				return;
			}
			try {
				await this.abort();
			} catch (abortError) {
				this._logService.error(abortError, `[Copilot:${this.sessionId}] Failed to abort after permission config sync failure`);
			}
		}
	}

	syncPermissionMode(source: 'config-change' | 'turn-start', recorder?: IAgentProviderSendStageRecorder): Promise<void> {
		return measureAgentProviderOperation(recorder, 'permission', async () => {
			const { mode, configuredLevel } = this._approvalPolicy.resolveSelection(this._getApprovalInputs());
			this._logService.info(`[Copilot:${this.sessionId}] Syncing permission mode: source=${source}, agentMode=${this._getConfiguredAgentMode()}, configuredLevel=${configuredLevel}, sdkMode=${mode}, previousSdkMode=${this._lastAppliedPermissionMode ?? 'unknown'}, globalAutoApprove=${this._configurationService.getRootValue(platformRootSchema, AgentHostGlobalAutoApproveEnabledConfigKey) === true}`);
			const experimentalModeEnabled = mode === 'assisted' || this._isHydraFusionEnabled();
			if (this._experimentalModeEnabled !== experimentalModeEnabled) {
				const experimentalResult = await measureAgentProviderOperation(recorder, 'permissionOptions', () => this._wrapper.session.rpc.options.update({ isExperimentalMode: experimentalModeEnabled }));
				if (!experimentalResult.success) {
					throw new Error('Copilot SDK rejected experimental mode required by the current session configuration');
				}
				this._experimentalModeEnabled = experimentalModeEnabled;
				this._logService.info(`[Copilot:${this.sessionId}] ${experimentalModeEnabled ? 'Enabled' : 'Disabled'} SDK experimental mode`);
			}
			if (this._lastAppliedPermissionMode === mode) {
				this._acceptPermissionMode(mode);
				return;
			}
			const managedSettingsResolvedBeforeSet = this._managedSettingsResolved.isSettled;
			let applied = await measureAgentProviderOperation(recorder, 'permissionRpc', () => this._trySetSdkPermissionMode(mode));
			if (!applied && !managedSettingsResolvedBeforeSet) {
				// Mitigation: the runtime can reject a mode (e.g. `allow-all`) while it
				// is still resolving managed settings in the background. Give it a short
				// window to finish, then retry once before failing the turn.
				this._logService.warn(`[Copilot:${this.sessionId}] SDK rejected permission mode '${mode}' before managed settings resolved; retrying once`);
				await measureAgentProviderOperation(recorder, 'managedSettings', () => raceTimeout(this._managedSettingsResolved.p, managedSettingsPermissionRetryTimeoutMs));
				applied = await measureAgentProviderOperation(recorder, 'permissionRpc', () => this._trySetSdkPermissionMode(mode));
			}
			if (!applied) {
				throw new Error(`Copilot SDK rejected permission mode '${mode}'`);
			}
		}, this._permissionModeSequencer);
	}

	private async _trySetSdkPermissionMode(mode: PermissionMode): Promise<PermissionMode | undefined> {
		const result = await this._wrapper.session.rpc.permissions.setMode({ mode });
		if (!this._approvalPolicy.canAcceptRuntimeResult(mode, result)) {
			return undefined;
		}
		this._acceptPermissionMode(result.mode);
		return result.mode;
	}

	/**
	 * Reports the applied permission mode: the effective approval mode is this
	 * chat's own; the modes the policy makes available are the session's, which
	 * the session-backed chat reports. The session's effective approval mode is
	 * the one a chat that takes the session's approvals runs with under the same
	 * policy, which is what such a chat shows until it reports its own.
	 */
	private _acceptPermissionMode(mode: PermissionMode): void {
		this._lastAppliedPermissionMode = mode;
		const target = this._configWriteTarget();
		const current = this._configurationService.getChatConfigValues(target);
		const { availableApprovalModes, ...applied } = this._approvalPolicy.getAppliedConfig(mode);
		if (current && isEqual(this.resourceUri, this._ownerSessionUri) && !equals(current.availableApprovalModes, availableApprovalModes)) {
			this._configurationService.updateSessionConfig(target.session, { availableApprovalModes });
		}
		const session = this._configurationService.getSessionConfigValues(target.session);
		let sessionMode = session?.effectiveApprovalMode;
		if (session) {
			const requested = this._configurationService.getEffectiveValue(target.session, platformSessionSchema, SessionConfigKey.AutoApprove);
			sessionMode = this._approvalPolicy.getAppliedConfig(this._approvalPolicy.resolveSelection({ ...this._getApprovalInputs(), requested }).mode).effectiveApprovalMode;
			if (session.effectiveApprovalMode !== sessionMode) {
				this._configurationService.updateSessionConfig(target.session, { effectiveApprovalMode: sessionMode });
			}
		}
		// The chat shows its own mode, else the approvals it chose for itself, else the session's mode (see
		// getEffectiveChatConfig): record its own only when that would differ.
		const own = this._configurationService.getChatOwnConfigValues(target);
		const shown = own.effectiveApprovalMode ?? (Object.hasOwn(own, SessionConfigKey.AutoApprove) ? own[SessionConfigKey.AutoApprove] : sessionMode);
		if (current && shown !== applied.effectiveApprovalMode) {
			this._configurationService.updateChatConfig(target, applied);
		}
	}

	private _configTarget(): IAgentChatConfigurationTarget {
		// The running process is configured for its launch owner until the relaunch.
		return { session: this.launchOwner.toString(), chat: this._chatChannelUri.toString() };
	}

	/**
	 * Where write-backs of the chat's own config (mode, approvals) go: the chat
	 * under its current owner. They follow the chat, never the launch snapshot,
	 * so a write after an owner change does not land on the previous session.
	 */
	private _configWriteTarget(): IAgentChatConfigurationTarget {
		return { session: this._ownerSessionUri.toString(), chat: this._chatChannelUri.toString() };
	}

	/**
	 * Applies the transient shell init script published by the active client.
	 * Best-effort: failures are logged and retried on the next turn.
	 */
	private async _applyEffectiveShellInitScripts(recorder?: IAgentProviderSendStageRecorder): Promise<void> {
		if (this._shellInitScriptDisposing) {
			return;
		}
		try {
			// Off states are decided before the payload is looked at, so a stale
			// registration is always cleared: the forwarded setting is false, or
			// the custom terminal tool has replaced the SDK's built-in shell.
			const enabled = this._configurationService.getRootValue(copilotCliConfigSchema, CopilotCliConfigKey.EnableShellInitScript) === true
				&& !this._sandbox.isCustomTerminalToolEnabled();
			// Session-only by construction: root and parent-session values are
			// never consulted.
			const own = enabled ? this._configurationService.getSessionConfigValues(this.launchOwner.toString())?.[SessionConfigKey.ShellInitScripts] : undefined;
			if (own !== undefined && !isShellInitScriptList(own)) {
				// Keep the last valid registration rather than clearing it.
				this._logService.warn(`[Copilot:${this.sessionId}] Ignoring malformed shell init script config`);
				return;
			}
			const scripts = own ?? [];
			const serialized = JSON.stringify(scripts);
			if (this._lastAppliedShellInitScripts === serialized) {
				return;
			}
			if (scripts.length === 0) {
				// The file and its sandbox grant stay until dispose, so a command
				// that already captured the path can still source it.
				if (this._registeredShellInitScriptPath) {
					const result = await measureAgentProviderOperation(recorder, 'shellRpc', () => this._wrapper.session.rpc.options.update({ shell: { initScripts: [] } }));
					if (!result.success) {
						throw new Error('Copilot SDK rejected shell init script update');
					}
					this._registeredShellInitScriptPath = undefined;
				}
				this._lastAppliedShellInitScripts = serialized;
				return;
			}

			this._shellInitScriptMaterialized = true;
			const ref = await measureAgentProviderOperation(recorder, 'shellFile', () => this._materializeShellInitScript(scripts[0]));
			if (!ref) {
				// Leave the cache unchanged so the next turn retries.
				return;
			}
			// Changed content is rewritten in place and the runtime re-reads the
			// file before each command, so only a new path needs the RPC.
			if (ref.path !== this._registeredShellInitScriptPath) {
				// The SDK requires init scripts to be readable when registered.
				await this._sandbox.applyConfig(true, undefined, recorder);
				const result = await measureAgentProviderOperation(recorder, 'shellRpc', () => this._wrapper.session.rpc.options.update({ shell: { initScripts: [ref] } }));
				if (!result.success) {
					throw new Error('Copilot SDK rejected shell init script update');
				}
				this._registeredShellInitScriptPath = ref.path;
			}
			this._lastAppliedShellInitScripts = serialized;
			this._logService.trace(`[Copilot:${this.sessionId}] Applied shell init script`);
		} catch (err) {
			this._logService.warn(`[Copilot:${this.sessionId}] Failed to update shell init scripts`, err);
		}
	}

	private async _materializeShellInitScript(script: IShellInitScript): Promise<{ shell: IShellInitScript['shell']; path: string } | undefined> {
		const resource = URI.joinPath(this._shellInitScriptInstanceDirectory(), script.shell === 'powershell' ? 'init.ps1' : 'init.sh');
		const atomic = this._fileService.hasCapability(resource, FileSystemProviderCapabilities.FileAtomicWrite)
			? { postfix: '.vsctmp' }
			: false;
		try {
			await this._fileService.writeFile(resource, VSBuffer.fromString(script.script), { atomic });
			return { shell: script.shell, path: resource.fsPath };
		} catch (error) {
			this._logService.warn(`[Copilot:${this.sessionId}] Failed to write shell init script: ${getErrorMessage(error)}`);
			return undefined;
		}
	}

	/** Removes this instance's script directory. Runs only on dispose, after the SDK session disconnected. */
	private async _clearShellInitScript(): Promise<void> {
		if (!this._shellInitScriptMaterialized) {
			return;
		}
		try {
			await this._fileService.del(this._shellInitScriptInstanceDirectory(), { recursive: true });
		} catch (error) {
			if (!(error instanceof Error) || toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
				this._logService.warn(`[Copilot:${this.sessionId}] Failed to remove shell init script: ${getErrorMessage(error)}`);
			}
		}
		try {
			// Non-recursive, so the session directory is only pruned once empty;
			// while a successor instance still occupies it this fails, keeping
			// that instance's script intact.
			await this._fileService.del(this._shellInitScriptDirectory());
		} catch {
			// Occupied by a successor or already gone — both expected.
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

	respondToPermissionRequest(requestId: string, approved: boolean, context?: IAgentPermissionResponseContext): boolean {
		const metadata = this._pendingPermissions.getMetadata(requestId);
		if (approved && (context?.selectedOptionId === SAVE_SANDBOX_PATH || metadata?.sandboxPathGrant)) {
			if (!metadata?.sandboxPathGrant || metadata.managedApprovalRequired || context?.selectedOptionId !== SAVE_SANDBOX_PATH || context.decisionSource !== 'human_response') {
				this._logService.warn(`[Copilot:${this.sessionId}] Rejecting invalid sandbox path grant response: ${requestId}`);
				const responded = this._pendingPermissions.respond(requestId, { kind: 'decision', result: { kind: 'reject' }, source: 'host_policy' });
				if (responded) {
					this._deletePendingEditContent(requestId);
				}
				return responded;
			}
			const responded = this._pendingPermissions.respond(requestId, { kind: 'grant-sandbox-path', context });
			this._deletePendingEditContent(requestId);
			return responded;
		}
		const result = { kind: 'decision', result: approved ? { kind: 'approve-once' } as const : USER_DENIED_PERMISSION_RESULT, source: context?.decisionSource } as const;
		if (this._pendingPermissions.respond(requestId, result)) {
			if (approved && metadata?.samplingServerIdentity && context?.selectedOptionId === ALLOW_SAMPLING_ALWAYS_OPTION_ID) {
				const servers = this._configurationService.getRootValue(platformRootSchema, AgentHostMcpSamplingAllowedServersConfigKey) ?? [];
				if (!servers.includes(metadata.samplingServerIdentity)) {
					this._configurationService.updateRootConfig({ [AgentHostMcpSamplingAllowedServersConfigKey]: [...servers, metadata.samplingServerIdentity] });
				}
			}
			this._deletePendingEditContent(requestId);
			return true;
		}
		return false;
	}

	private async _requestUnsandboxedCommandConfirmation(request: IUnsandboxedCommandConfirmationRequest): Promise<boolean> {
		const policy = this._configurationService.getSessionSandboxPolicy(this.launchOwner.toString());
		if (policy?.allowBypass === false || (policy?.enabled && !policy.allowBypass)) {
			return false;
		}
		const managedApprovalRequired = policy?.enabled === true;
		const pendingPermission = this._pendingPermissions.register(request.toolCallId, { managedApprovalRequired });

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

		const trackedToolCall = this._activeToolCalls.get(request.toolCallId);
		const parentToolCallId = trackedToolCall?.parentToolCallId;
		this._emitProgress({
			kind: 'pending_confirmation',
			chat: this._chatChannelUri,
			state: {
				status: ToolCallStatus.PendingConfirmation,
				toolCallId: request.toolCallId,
				toolName: request.toolName,
				displayName,
				invocationMessage,
				intention: trackedToolCall?.intention,
				toolInput: getToolInputString(request.toolName, { ...trackedToolCall?.parameters, command: request.command }, undefined),
				confirmationTitle,
				_meta: toToolCallMeta(trackedToolCall?.meta ?? this._createToolCallMeta(request.toolName, undefined)),
			},
			// Intentionally omit `permissionKind: 'shell'`: that would route this
			// through the shell rule-based auto-approver and silently approve
			// common safe commands (`pwd`, `ls`, etc.) without prompting.
			// Mirrors the workbench's sandbox-aware analyzer, which forces
			// `isAutoApproveAllowed: false` whenever `requiresUnsandboxConfirmation`
			// is set.
			parentToolCallId,
			requestSandboxBypass: true,
			managedApprovalRequired,
		});

		const decision = await pendingPermission;
		const approved = decision.kind === 'decision' && decision.result.kind === 'approve-once';
		const currentPolicy = this._configurationService.getSessionSandboxPolicy(this.launchOwner.toString());
		return approved && currentPolicy?.allowBypass !== false && !(currentPolicy?.enabled && !currentPolicy.allowBypass);
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
		// Copilot Host clients classify simple user-input requests by this question ID.
		const questionId = 'answer';
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
	 * Projects structured ask_user and MCP elicitation requests into the question carousel.
	 * Ask-user replies are permissive; MCP forms retain their schema coercion and autopilot cancellation.
	 * Computer Use's macOS permission prompts go to the shared setup instead, when the host offers it.
	 */
	private async _handleElicitationRequest(context: ElicitationContext): Promise<ElicitationResult> {
		// The runtime supplies a source for MCP forms, but not for its built-in ask_user tool.
		const isAskUser = context.mode !== 'url' && !context.elicitationSource;
		const isAutopilot = this._isAutopilotMode();
		if (!isAskUser && isAutopilot) {
			return { action: 'cancel' };
		}
		const autoReply = isAskUser && (isAutopilot || this._isAutoReplyEnabled());
		if (!autoReply && !this.hasActiveTurn) {
			this._logService.warn(`[Copilot:${this.sessionId}] Rejecting elicitation request without an active turn`);
			return { action: 'decline' };
		}
		const computerUsePrompt = isAskUser ? undefined : this._routeComputerUsePrompt(context);

		const messagePreview = context.message.substring(0, 100);
		try {
			const requestId = generateUuid();
			this._logService.info(`[Copilot:${this.sessionId}] Elicitation request: requestId=${requestId}, mode=${context.mode ?? 'form'}, source=${context.elicitationSource ?? '<unknown>'}, message="${messagePreview}"`);

			const schema = context.mode === 'url' ? undefined : context.requestedSchema;
			const requiredSet = new Set(schema?.required ?? []);
			const questions: ChatInputQuestion[] | undefined = schema
				? Object.entries(schema.properties).map(([fieldName, field]) => elicitationFieldToQuestion(fieldName, field, requiredSet.has(fieldName), isAskUser))
				: undefined;

			const inputRequest: ChatInputRequest = {
				id: requestId,
				message: context.message,
				...(context.mode === 'url' && context.url ? { url: context.url } : {}),
				...(questions && questions.length > 0 ? { questions } : {}),
			};

			if (autoReply) {
				const answers: Record<string, ChatInputAnswer> = {};
				const content: Record<string, ElicitationFieldValue> = {};
				for (const questionId of questions?.map(question => question.id) ?? ['answer']) {
					answers[questionId] = {
						state: ChatInputAnswerState.Submitted,
						value: { kind: ChatInputAnswerValueKind.Text, value: AgentHostAutoReplyAnswer },
					};
					content[questionId] = AgentHostAutoReplyAnswer;
				}
				this._emitAction({ type: ActionType.ChatInputRequested, request: inputRequest });
				this._emitAction({ type: ActionType.ChatInputCompleted, requestId, response: ChatInputResponseKind.Accept, answers });
				return { action: 'accept', content };
			}

			if (computerUsePrompt) {
				return await computerUsePrompt.setup.handlePrompt(this._computerUseSetupChat, computerUsePrompt.offered, inputRequest);
			}

			const pendingElicitation = this._pendingElicitations.register(requestId, { schema });

			this._emitAction({
				type: ActionType.ChatInputRequested,
				request: withChatInputRequestPurpose(inputRequest, isAskUser ? ChatInputRequestPurpose.AskUser : ChatInputRequestPurpose.Elicitation),
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
			const answerToFieldValue = isAskUser ? askUserAnswerToFieldValue : elicitationAnswerToFieldValue;
			for (const [fieldName, field] of Object.entries(schema.properties)) {
				const value = answerToFieldValue(field, answers[fieldName]);
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

	/**
	 * Recognizes a macOS permission prompt of the built-in Computer Use plugin by its verified source and structured
	 * choices, for the shared setup to handle while the agent offers it. Any other prompt of that plugin keeps the
	 * ordinary elicitation UI: one that only comes once the plugin's permission check passed tells the setup so, and one
	 * that asks for permissions in an unrecognized form ends the setup without telling it anything about them.
	 */
	private _routeComputerUsePrompt(context: ElicitationContext): { readonly setup: CopilotComputerUsePermissionSetup; readonly offered: IComputerUsePermissionPrompt } | undefined {
		const setup = this._computerUseSetup?.();
		if (!setup || context.mode === 'url' || context.elicitationSource !== COMPUTER_USE_PLUGIN_NAME || !this._isBuiltinComputerUseServer()) {
			return undefined;
		}
		const prompt = classifyComputerUsePrompt(context.requestedSchema);
		switch (prompt.kind) {
			case 'permissions':
				return { setup, offered: prompt.offered };
			case 'unrecognizedPermissions':
				setup.onUnrecognizedPrompt(this._computerUseSetupChat);
				return undefined;
			case 'other':
				setup.onOtherPrompt(this._computerUseSetupChat);
				return undefined;
		}
	}

	/** Whether the runtime reports the `computer-use` server as the one the built-in Computer Use plugin contributes. */
	private _isBuiltinComputerUseServer(): boolean {
		const provenance = this._mcpInventoryProvenance.get(COMPUTER_USE_PLUGIN_NAME);
		return provenance?.source === 'builtin' && provenance.sourcePlugin === COMPUTER_USE_PLUGIN_NAME;
	}

	respondToUserInputRequest(requestId: string, response: ChatInputResponseKind, answers?: Record<string, ChatInputAnswer>): boolean {
		const pendingPlanReview = this._pendingPlanReviews.getMetadata(requestId);
		if (pendingPlanReview) {
			return this._pendingPlanReviews.respond(requestId, this._resolveExitPlanMode(pendingPlanReview, response, answers));
		}

		if (this._computerUseSetup?.()?.respondToInput(this._computerUseSetupChat, requestId, response, answers)) {
			return true;
		}

		if (this._computerUseActivation.respondToInput(requestId, response, answers)) {
			return true;
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
			...(isAutopilot && this._approvalPolicy.isBypassApprovals(this._getApprovalInputs()) ? { autoApproveEdits: true } : {}),
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

	private async _handlePreToolUse(input: PreToolUseHookInput): Promise<PreToolUseHookOutput> {
		try {
			const restriction = this._agentMergeTurn
				? getAgentMergeGitHubToolRestriction(input.toolName, input.toolArgs)
				?? (isCopilotMcpToolName(input.toolName, this._agentMergeRestrictedMcpServerNames) ? AGENT_MERGE_GITHUB_TOOL_RESTRICTION : undefined)
				: undefined;
			if (restriction) {
				this._logService.warn(`[Copilot:${this.sessionId}] Denying restricted Agent Merge tool: ${input.toolName}`);
				return {
					permissionDecision: 'deny',
					permissionDecisionReason: restriction,
					additionalContext: restriction,
				};
			}
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

	private async _handlePostToolUse(input: PostToolUseHookInput): Promise<PostToolUseHookOutput> {
		try {
			if (isEditTool(input.toolName, getToolCommand(input))) {
				const filePaths = this._getEditFilePaths(input.toolArgs);
				await Promise.all(filePaths.map(p => this._editTracker.completeEdit(p)));
			}
		} catch (error) {
			this._logService.error(error, `[Copilot:${this.sessionId}] Failed in onPostToolUse: tool=${input.toolName}`);
			throw error;
		}
		const result = input.toolName === CopilotToolName.ImageGeneration ? await this._saveGeneratedImages(input) : undefined;
		const discardedEdits = this._takeDiscardedEditNotes();
		return result ? { ...result, ...discardedEdits } : discardedEdits;
	}

	/**
	 * Saves generated images where the Copilot CLI does, in the session folder, and
	 * adds each file's path to the tool's result. The runtime gives the agent only an
	 * image ID, so without the path it searches for the file and finds none.
	 */
	private async _saveGeneratedImages(input: PostToolUseHookInput): Promise<PostToolUseHookOutput> {
		try {
			const sessionDirectory = URI.joinPath(this._copilotHomeService.home, SESSION_STATE_DIRECTORY, this.sessionId);
			const saved = await saveGeneratedImages(getGeneratedImages(input.toolResult), sessionDirectory, this._fileService, this._logService);
			if (saved.length) {
				return { modifiedResult: { resultType: input.toolResult.resultType, textResultForLlm: appendGeneratedImagePaths(input.toolResult.textResultForLlm, saved) } };
			}
		} catch (error) {
			this._logService.warn(`[Copilot:${this.sessionId}] Could not save generated images: ${getErrorMessage(error)}`);
		}
		return undefined;
	}

	/** The agent's edit may have failed because the user undid changes it built on, so it's told. */
	private _handlePostToolUseFailure(_input: PostToolUseFailureHookInput): PostToolUseFailureHookOutput | undefined {
		return this._takeDiscardedEditNotes();
	}

	private _takeDiscardedEditNotes(): { readonly additionalContext: string } | undefined {
		if (this._discardedEditNotes.length === 0) {
			return undefined;
		}
		const additionalContext = this._discardedEditNotes.join('\n');
		this._discardedEditNotes = [];
		return { additionalContext };
	}

	private async _beginRepoInfoTelemetry(telemetryMessageId: string, clientType: AgentHostClientType, githubToken: string | undefined, isCurrent: () => boolean): Promise<{ readonly context: IAgentHostRestrictedTelemetryContext; readonly baseBranch: string | undefined } | undefined> {
		let resolved: { readonly context: IAgentHostRestrictedTelemetryContext; readonly baseBranch: string | undefined } | undefined;
		try {
			resolved = await this._resolveRepoInfoTelemetryContext(githubToken);
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
		const isCurrent = () => !turn.cancelled && turn.githubToken !== undefined && this._isGitHubTokenCurrent(turn.githubToken);
		void turn.begin.then(resolved => this._endRepoInfoTelemetry(turn.telemetryMessageId, resolved, isCurrent));
	}

	private _isGitHubTokenCurrent(token: string): boolean {
		return this._launchPlan.githubCredentials.isCurrentToken(token);
	}

	private get _currentGitHubToken(): string | undefined {
		return this._launchPlan.githubCredentials.token;
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

	private async _resolveRepoInfoTelemetryContext(githubToken: string | undefined): Promise<{ readonly context: IAgentHostRestrictedTelemetryContext; readonly baseBranch: string | undefined } | undefined> {
		if (this._configurationService.getRootValue(platformRootSchema, AgentHostDisableRepoInfoTelemetryConfigKey) === true) {
			return undefined;
		}
		if (!githubToken) {
			return undefined;
		}
		const [rawContext, baseBranch] = await Promise.all([
			this._copilotApiService.resolveRestrictedTelemetryContext(githubToken),
			this._withDatabase(db => db.getMetadata(META_DIFF_BASE_BRANCH)),
		]);
		if (!rawContext.restrictedTelemetryEnabled && !rawContext.isInternal) {
			return undefined;
		}
		return { context: this._toRepoInfoTelemetryContext(rawContext), baseBranch };
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

	private _subscribeToEvents(store: DisposableStore = this._store): void {
		const wrapper = this._wrapper;
		const sessionId = this.sessionId;

		store.add(wrapper.onSystemNotification(e => {
			if (e.data.kind.type === 'shell_completed') {
				this._nonPtyShellTerminals.completeBackgroundShell(e.data.kind.shellId, e.data.kind.exitCode);
			}
			this._seedSubagentDisplayNames([e]);
			const notification = buildCopilotSystemNotification(e, this._resolveAgentName);
			if (!notification) {
				this._logService.trace(`[Copilot:${sessionId}] Ignoring system.notification kind=${e.data.kind.type}`);
				return;
			}

			this._logService.info(`[Copilot:${sessionId}] System notification received: kind=${e.data.kind.type}`);
			if (this._turnId) {
				// Later parent reasoning belongs after this notice; child reasoning keeps its own stream.
				this._currentTurn.value?.reasoningPartIds.delete('');
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
			this._failedExecutionIdlePending = false;
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

		// Route child messages before matching root steering or recording its SDK history boundary.
		store.add(wrapper.onUserMessage(e => {
			if (isSyntheticUserMessage(e)) {
				return;
			}
			if (e.agentId) {
				const initialPrompt = this._subagents.takeInitialPrompt(e.agentId);
				if (this._subagents.isActive(e.agentId) && initialPrompt === e.data.content
					&& e.data.delivery !== 'steering' && e.data.delivery !== 'queued') {
					return;
				}
				this._resumeSubagentForEvent(e, { text: e.data.content, origin: { kind: MessageKind.User } });
				return;
			}
			// A genuine root user-message echo is the provider boundary for a
			// normal send. Zero-message continuation has no such echo and remains
			// quarantined until assistant.turn_start instead.
			this._dropLateRootTurnEvents = false;
			this._failedExecutionIdlePending = false;
			// Show a failure held from between turns only now, so that a newer
			// failure from this message's own preparation replaces it.
			this._showUnshownManagedPluginFailure();
			// First SDK event for the loop: promote the turn out of `pending`.
			this._currentTurn.value?.markRunning();
			// The message is admitted only after required plugins are prepared.
			this._setManagedPluginActivity(undefined);
			const steering = this._takeMatchingPendingSteering(e.data.content, e.data.messageId);
			if (steering && !steering.promotedTurnId) {
				this._beginSteeringTurn(steering);
				if (e.data.interactionId) {
					this._currentTurn.value?.interactionIds.add(e.data.interactionId);
				}
			} else if (!this._currentTurn.value) {
				this._beginProviderInitiatedTurn(e);
			}
			if (this._turnId) {
				this._hasFusionRootTurnBoundary = true;
				const precedingResolution = this._fusionRequestCorrelation.getPrecedingResolution(e);
				if (precedingResolution && !this._fusionEventTurnIds.has(`fusion:${precedingResolution.fusionId}`)) {
					this._recordHostSdkTurn(precedingResolution.turnId, this._turnId);
				}
				if (e.data.turnId) {
					this._recordHostSdkTurn(e.data.turnId, this._turnId);
				}
				if (e.data.interactionId) {
					this._currentTurn.value?.interactionIds.add(e.data.interactionId);
				}
				void this._withDatabase(db => db.setTurnEventId(this._turnId, e.id)).catch(error =>
					this._logService.error(`[Copilot:${sessionId}] Failed to persist turn event id`, error));
				this._currentTurn.value?.completeEventId(e.id);
			}
			this._onSteeringReady?.(this);
		}));

		store.add(wrapper.onMessageDelta(e => {
			this._logService.trace(`[Copilot:${sessionId}] delta: ${e.data.deltaContent}`);
			this._resumeSubagentForEvent(e);
			if (this._shouldDropUnmappedSubagentEvent(e, 'assistant.message_delta')) {
				return;
			}
			this._emitMarkdownDelta(e.data.deltaContent, this._parentToolCallIdForSubagentEvent(e));
		}));

		const renderMessage = (e: SessionEventPayload<'assistant.message'>, contentParentToolCallId: string | undefined, isLastMessageChunk: boolean, isFusionMessage = false): void => {
			if (this._shouldDropLateRootTurnEvent('assistant.message')) {
				return;
			}
			const markdownScope = contentParentToolCallId ?? '';
			const state = this._getResponsePartState(contentParentToolCallId);
			const isEmptyFinalAnswer = isLastMessageChunk && e.data.phase === 'final_answer' && !e.data.content && !e.data.toolRequests?.length;
			// Fusion sends distinct complete chunks without preceding text deltas.
			if (e.data.content && (isFusionMessage || !state?.markdownPartIds.has(markdownScope))) {
				const partId = generateUuid();
				state?.markdownPartIds.set(markdownScope, partId);
				this._emitAction({
					type: ActionType.ChatResponsePart,
					turnId: this._turnId,
					part: { kind: ResponsePartKind.Markdown, id: partId, content: e.data.content },
				}, contentParentToolCallId);
			} else if (isEmptyFinalAnswer && !state?.markdownPartIds.has(markdownScope)) {
				// An empty final answer still ends the open thinking section; later text and reasoning start new parts.
				state?.reasoningPartIds.delete(markdownScope);
				this._emitAction({
					type: ActionType.ChatResponsePart,
					turnId: this._turnId,
					part: {
						kind: ResponsePartKind.SystemNotification,
						content: '',
						_meta: toAgentSystemNotificationMeta({ kind: AgentSystemNotificationKind.ResponseRoundEnded }),
					},
				}, contentParentToolCallId);
			}
			if (e.data.toolRequests?.length) {
				const turn = this._currentTurn.value;
				if (!contentParentToolCallId && turn && e.data.turnId && e.data.toolRequests.some(request => request.name === CopilotToolName.ImageGeneration)) {
					turn.imageGenerationSdkTurnId = e.data.turnId;
				}
				for (const request of e.data.toolRequests) {
					if (request.toolTitle) {
						this._currentTurn.value?.toolTitles.set(request.toolCallId, request.toolTitle);
					}
					const intention = request.intentionSummary?.trim();
					if (intention) {
						this._currentTurn.value?.toolIntentions.set(request.toolCallId, intention);
					}
				}
				// Wait for the full message boundary; clearing on an earlier tool delta would duplicate assembled markdown.
				this._beginToolCallRound(contentParentToolCallId);
			}
		};
		const renderCommittedFusionMessage = (e: SessionEventPayload<'assistant.message'>, phaseToolCallId: string): void => {
			const call = this._pendingFusionMessageChunks.accept(e, phaseToolCallId);
			if (!call) {
				return;
			}
			const isInlinePhase = this._fusionPhases.get(phaseToolCallId)?.presentation === 'inline';
			for (const chunk of call.messages) {
				if ((call.hasToolRequests || isInlinePhase) && this._shownProvisionalFusionMessageIds.has(chunk.data.messageId)) {
					this._logService.trace(`[Copilot:${sessionId}] Ignoring committed Fusion message already shown: ${chunk.data.messageId}`);
				} else if (!call.hasToolRequests) {
					renderMessage(chunk, undefined, isLastAssistantMessageChunk(chunk), true);
				} else {
					renderMessage(chunk, this._fusionPhaseContentParentToolCallId(phaseToolCallId), isLastAssistantMessageChunk(chunk), true);
				}
			}
		};
		store.add(wrapper.onMessage(e => {
			this._logService.info(`[Copilot:${sessionId}] Full message received: ${e.data.content.length} chars`);
			this._resumeSubagentForEvent(e);
			if (!e.agentId && this._shouldDropLateRootTurnEvent('assistant.message')) {
				return;
			}
			const stableModelCallId = e.data.apiCallId ?? e.data.clientRequestId;
			const isLastMessageChunk = isLastAssistantMessageChunk(e);
			// Model-less root messages (synthetic background reads) are not model calls; AHP subagents omit the model.
			const isModelResponse = !!e.agentId || stableModelCallId !== undefined || !!e.data.model;
			const isCompleteModelCall = isModelResponse && (stableModelCallId !== undefined || isLastMessageChunk);
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
			if (!e.agentId && isModelResponse) {
				const clientType = this._currentTurn.value?.clientType ?? AgentHostClientType.Unknown;
				void this._telemetryReporter.assistantMessageReceived(this.resourceUri.toString(), this._chatChannelUri.toString(), clientType, e.data.clientRequestId, this._appliedSnapshot.tools).catch(err => this._logService.trace(`[Copilot:${this.sessionId}] Telemetry emission failed: ${getErrorMessage(err)}`));
				// Restricted `conversation.messageText` (source=model): the model's raw response text.
				void this._telemetryReporter.modelMessageText(this.resourceUri.toString(), this._chatChannelUri.toString(), clientType, e.data.content, this._turnOrdinal, e.data.clientRequestId).catch(err => this._logService.trace(`[Copilot:${this.sessionId}] Telemetry emission failed: ${getErrorMessage(err)}`));
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
			if (this._shouldDropUnmappedSubagentEvent(e, 'assistant.message')) {
				return;
			}
			const phaseToolCallId = this._fusionPhaseToolCallId(e.agentId, e.data.fusion);
			if (parentToolCallId === undefined && phaseToolCallId !== undefined) {
				renderCommittedFusionMessage(e, phaseToolCallId);
				return;
			}
			renderMessage(e, parentToolCallId, isLastMessageChunk);
		}));

		store.add(wrapper.onSamplingRequested(e => {
			void this._handleSamplingRequest(e.data);
		}));
		store.add(wrapper.onSamplingCompleted(e => {
			this._completeSamplingRequest(e.data.requestId);
		}));

		store.add(wrapper.onPermissionRequested(e => {
			const toolCallId = e.data.permissionRequest.toolCallId;
			if (!toolCallId) {
				return;
			}
			const existing = this._toolApprovalRecords.get(toolCallId);
			const permissionRequest = e.data.permissionRequest as { requestSandboxBypass?: boolean; toolName?: string };
			if (permissionRequest.requestSandboxBypass && !e.data.resolvedByHook) {
				this._sandbox.setPendingRequest(toolCallId, e.data.requestId);
			}
			this._toolApprovalRecords.set(toolCallId, {
				permissionRequested: true,
				resolvedByHook: existing?.resolvedByHook || e.data.resolvedByHook === true,
				requestSandboxBypass: existing?.requestSandboxBypass || permissionRequest.requestSandboxBypass === true,
				resultKind: existing?.resultKind,
				decisionSource: undefined,
				toolName: existing?.toolName ?? permissionRequest.toolName,
				mcpServerName: existing?.mcpServerName,
				reported: existing?.reported ?? false,
			});
		}));

		store.add(wrapper.onPermissionCompleted(e => {
			const toolCallId = e.data.toolCallId;
			if (!toolCallId) {
				return;
			}
			this._sandbox.completePendingRequest(toolCallId, e.data.requestId);
			const existing = this._toolApprovalRecords.get(toolCallId);
			const record = {
				permissionRequested: existing?.permissionRequested ?? true,
				resolvedByHook: existing?.resolvedByHook ?? false,
				requestSandboxBypass: existing?.requestSandboxBypass ?? false,
				resultKind: e.data.result.kind,
				decisionSource: e.data.decisionSource,
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

		store.add(wrapper.onToolCallDelta(e => {
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
				streaming.parentToolCallId = this._parentToolCallIdForSubagentEvent(e) ?? this._fusionPhaseParentToolCallId(e.agentId, undefined);
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

		const handleToolStart = (e: SessionEventPayload<'tool.execution_start'>): void => {
			if (!e.agentId && this._shouldDropLateRootTurnEvent('tool.execution_start')) {
				return;
			}
			const toolTitle = this._currentTurn.value?.toolTitles.get(e.data.toolCallId) ?? e.data.toolTitle;
			this._currentTurn.value?.toolTitles.delete(e.data.toolCallId);
			const intentionSummary = this._currentTurn.value?.toolIntentions.get(e.data.toolCallId);
			this._currentTurn.value?.toolIntentions.delete(e.data.toolCallId);
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
			const routingProxy = this._mcpRoutingProxies.get(e.data.toolName);
			const mcpServerName = e.data.mcpServerName ?? routingProxy?.server.serverName;
			const displayName = routingProxy
				? localize('copilot.mcpRouting.connect', "Connect to {0}", routingProxy.server.serverName)
				: getToolDisplayName(e.data.toolName, { toolTitle, mcpToolName: e.data.mcpToolName });
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
			const parentToolCallId = streamed?.parentToolCallId ?? this._parentToolCallIdForSubagentEvent(e) ?? this._fusionPhaseParentToolCallId(e.agentId, e.data.fusion);
			const clientToolName = this._clientToolName(e.data.toolName);
			const isClientTool = this._clientToolNames.has(clientToolName);
			const isToolSearch = this._isToolSearchActive() && e.data.toolName === RUNTIME_TOOL_SEARCH_TOOL_NAME;
			const contributor = this._getToolCallContributor(e.data.toolName, mcpServerName);
			const intention = getToolIntention(e.data.toolName, parameters, intentionSummary);
			this._activeToolCalls.set(e.data.toolCallId, {
				turnId: this._turnId,
				startedAt: e.timestamp,
				toolName: e.data.toolName,
				displayName,
				parameters,
				content: [],
				parentToolCallId,
				mcpServerName,
				contributor,
				intention,
				autoTier: parentToolCallId && !this._fusionPhases.has(parentToolCallId)
					? this._committedAutoTierBySubagentToolCallId.get(parentToolCallId)
					: this._committedAutoTier,
				fusionModel: getHydraFusionModel(e.data.fusion?.syntheticModel ?? (this._fusionPhaseToolCallId(e.agentId, e.data.fusion) !== undefined || (parentToolCallId && this._fusionPhases.has(parentToolCallId)) ? this._fusionProgress.syntheticModel : undefined)),
				fusionSourceModel: getHydraFusionModel(e.data.fusion?.syntheticModel) ? e.data.fusion?.sourceModel || undefined : undefined,
				meta: undefined,
			});
			const existingApproval = this._toolApprovalRecords.get(e.data.toolCallId);
			const approvalRecord = {
				permissionRequested: existingApproval?.permissionRequested ?? false,
				resolvedByHook: existingApproval?.resolvedByHook ?? false,
				requestSandboxBypass: existingApproval?.requestSandboxBypass ?? false,
				resultKind: existingApproval?.resultKind,
				decisionSource: existingApproval?.decisionSource,
				toolName: e.data.toolName,
				mcpServerName,
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
			if (!isClientTool && !mcpServerName && !e.data.mcpToolName) {
				meta['vscode.toolInputContract'] = getToolSummaryInputContract(e.data.toolName);
			}
			if (mcpServerName) {
				meta.mcpServerName = mcpServerName;
			}
			if (e.data.mcpToolName) {
				meta.mcpToolName = e.data.mcpToolName;
			}
			const resourceUri = getCopilotSdkToolResourceUri(e.data.toolDescription);
			this._setToolCallUiMeta(meta, resourceUri, mcpServerName);

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
			if (isClientTool && !contributor && !isToolSearch) {
				this._logService.warn(`[Copilot:${sessionId}] Client tool '${e.data.toolName}' started with no connected client matching its advertised definition; failing it immediately.`);
				this._reportToolApprovalIfNoPermission(e.data.toolCallId);
				this._toolApprovalRecords.delete(e.data.toolCallId);
				this._activeToolCalls.delete(e.data.toolCallId);
				this._emitAction({
					type: ActionType.ChatToolCallReady,
					turnId: this._turnId,
					toolCallId: e.data.toolCallId,
					...(contributor ? { contributor } : {}),
					...(intention !== undefined ? { intention } : {}),
					invocationMessage: getInvocationMessage(e.data.toolName, displayName, parameters, path => this._resolveEditFilePath(path), this._resolveAgentName),
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
						error: { message: `No client with the advertised tool definition was connected to run ${displayName}` },
					},
				}, parentToolCallId);
				this._pendingClientToolCalls.respondOrBuffer(e.data.toolCallId, {
					textResultForLlm: `No client with the advertised tool definition was connected to run ${displayName}.`,
					resultType: 'failure',
					error: 'No matching client connected',
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

			const ready: ChatToolCallReadyAction = {
				type: ActionType.ChatToolCallReady,
				turnId: this._turnId,
				toolCallId: e.data.toolCallId,
				...(contributor ? { contributor } : {}),
				...(intention !== undefined ? { intention } : {}),
				invocationMessage: getInvocationMessage(e.data.toolName, displayName, parameters, path => this._resolveEditFilePath(path), this._resolveAgentName),
				toolInput: getToolInputString(e.data.toolName, parameters, toolArgs),
				confirmed: ToolCallConfirmationReason.NotNeeded,
				_meta: toToolCallMeta(clientToolAutoApproved ? { ...meta, autoApproveBySetting: true } : meta),
			};
			// Native image tool start precedes its permission request, not image generation.
			if (tracked && e.data.toolName === CopilotToolName.ImageGeneration && !isClientTool && !mcpServerName) {
				tracked.pendingImageReady = ready;
			} else {
				this._emitAction(ready, parentToolCallId);
			}
		};
		this._surfaceProvisionalFusionToolStart = handleToolStart;
		store.add(wrapper.onToolStart(e => {
			if (this._surfacedProvisionalFusionToolCallIds.has(e.data.toolCallId)) {
				// The committed re-emission of a tool call already shown from its provisional phase.
				this._logService.trace(`[Copilot:${sessionId}] Ignoring committed Fusion tool start already surfaced: ${e.data.toolCallId}`);
				return;
			}
			handleToolStart(e);
		}));

		const handleToolComplete = (e: SessionEventPayload<'tool.execution_complete'>): void => {
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
				reportCopilotTodoStoreOperation(this._telemetryService, telemetrySession, e.data.toolCallId, tracked.toolName, tracked.parameters, this._currentTurn.value?.clientContext, parentToolCallId && this._fusionPhases.has(parentToolCallId) ? 'fusionPhase' : undefined);
			}
			this._logService.info(`[Copilot:${sessionId}] Tool completed: ${e.data.toolCallId}`);
			this._reportToolApprovalIfNoPermission(e.data.toolCallId);
			this._activeToolCalls.delete(e.data.toolCallId);
			this._toolApprovalRecords.delete(e.data.toolCallId);
			const command = isString(tracked.parameters?.command) ? tracked.parameters.command : undefined;
			const filePaths = isEditTool(tracked.toolName, command) ? this._getEditFilePaths(tracked.parameters) : [];
			const turn = this._currentTurn.value;
			const turnId = tracked.turnId;
			const chatUri = parentToolCallId ? this._subagentChatUri(parentToolCallId) : this._chatChannelUri.toString();
			const modelId = tracked.fusionSourceModel ?? this._lastSeenModelId;
			// Recording an SDK edit must finish even when its turn no longer accepts display updates.
			const fileEdits = filePaths.map(filePath => this._editTracker.takeCompletedEdit(turnId, e.data.toolCallId, filePath, tracked.toolName, tracked.parameters, modelId, parentToolCallId !== undefined, turn?.clientContext, chatUri, tracked.autoTier, tracked.fusionModel)
				.catch(err => {
					this._logService.warn(`[Copilot:${sessionId}] Failed to take completed edit`, err);
					return undefined;
				}));
			if (tracked.mcpServerName === COMPUTER_USE_PLUGIN_NAME && this._isBuiltinComputerUseServer()) {
				this._computerUseSetup?.()?.onToolCallCompleted(this._computerUseSetupChat, e.data.success);
			}
			if (!parentToolCallId && !e.agentId && (tracked.turnId !== this._turnId || this._shouldDropLateRootTurnEvent('tool.execution_complete', true))) {
				return;
			}
			const displayName = tracked.displayName;
			const toolOutput = e.data.error?.message ?? e.data.result?.content;
			const rawCompletion: typeof e.data & { toolUsage?: unknown } = e.data;
			const imageGeneration = tracked.toolName === CopilotToolName.ImageGeneration ? getSdkImageGenerationMetadata(e.data.result, rawCompletion.toolUsage) : undefined;
			if (imageGeneration) {
				tracked.meta = { ...tracked.meta, [imageGenerationToolMetaKey]: imageGeneration };
			}
			if (tracked.toolName === CopilotToolName.ImageGeneration) {
				tracked.meta = { ...tracked.meta, 'vscode.toolCallDurationMs': getToolCallDurationMs(tracked.startedAt, e.timestamp) };
			}
			this._emitPendingImageReady(tracked);

			if (isTaskCompleteTool(tracked.toolName)) {
				const summary = getTaskCompleteMarkdown(tracked.parameters, toolOutput);
				if (summary) {
					const phaseToolCallId = isProvisionalFusionConversationEvent(e) ? this._fusionPhaseToolCallId(e.agentId, e.data.fusion) : undefined;
					const phaseChatToolCallId = phaseToolCallId !== undefined ? this._fusionPhaseContentParentToolCallId(phaseToolCallId) : undefined;
					if (phaseToolCallId !== undefined) {
						this._provisionalFusionTaskSummaries.set(e.data.toolCallId, summary);
					}
					if (phaseToolCallId === undefined || phaseChatToolCallId !== undefined) {
						this._emitAction({
							type: ActionType.ChatResponsePart,
							turnId: this._turnId,
							part: { kind: ResponsePartKind.Markdown, id: generateUuid(), content: summary },
						}, phaseChatToolCallId);
					}
				}
				return;
			}

			const content: ToolResultContent[] = [...tracked.content];
			const displayOutput = e.data.error?.message ?? getSdkToolResultText(e.data.result);
			if (displayOutput !== undefined) {
				content.push({ type: ToolResultContentType.Text, text: displayOutput });
			}

			// Attach the pty terminal reference for shell tools before folding in
			// SDK result content, so a `shell_exit` lands its completion data on
			// the terminal block (skip if any terminal block was already added
			// while the tool was running).
			const isShellCommandTool = isShellTool(tracked.toolName);
			if (isShellHelperTool(tracked.toolName)) {
				this._nonPtyShellTerminals.completeBackgroundShellFromHelperResult(toolOutput);
			}
			const ptyTerminalUri = isShellCommandTool ? this._shellManager?.getTerminalUriForToolCall(e.data.toolCallId) : undefined;
			let retireNonPtyShellTracking = !!ptyTerminalUri;
			if (ptyTerminalUri && !content.some(c => c.type === ToolResultContentType.Terminal)) {
				content.push({
					type: ToolResultContentType.Terminal,
					resource: ptyTerminalUri,
					title: tracked.displayName,
				});
			}

			const resultContent = getSdkToolResultContent(tracked.toolName, e.data.result);
			const hasResources = resultContent?.contents?.some(block => block.type === 'resource' || block.type === 'resource_link');
			const mcpChannel = tracked.mcpServerName ? buildMcpChannel(this._chatChannelUri, tracked.mcpServerName, COPILOT_CLI_AGENT_PROVIDER_ID) : undefined;
			const shellExit = appendSdkToolResultContent(
				content,
				hasResources ? resultContent?.contents?.filter(block => block.type === 'shell_exit') : resultContent?.contents,
				isShellCommandTool ? {
					storage: this._storageUri,
					session: this._ownerSessionUri,
					chat: this._chatChannelUri,
					toolCallId: e.data.toolCallId,
					title: tracked.displayName,
				} : undefined,
				hasResources ? undefined : resultContent?.binaryResultsForLlm,
				undefined,
				{ mcpChannel },
			);
			let nonPtyCompletion: INonPtyShellToolCompletion | undefined;
			if (isShellCommandTool && !ptyTerminalUri) {
				nonPtyCompletion = this._nonPtyShellTerminals.completeToolCall(e.data.toolCallId, toolOutput, shellExit);
				if (nonPtyCompletion?.backgroundShellId !== undefined) {
					if (nonPtyCompletion.detached) {
						this._readDetachedShellOutput(e.data.toolCallId, nonPtyCompletion.backgroundShellId);
					}
					// Republish background work so the shell's entry points at this call's live terminal.
					this._refreshBackgroundTasks();
				}
				if (nonPtyCompletion) {
					retireNonPtyShellTracking = nonPtyCompletion.shouldRetire;
					const terminalIndex = content.findIndex(c => c.type === ToolResultContentType.Terminal);
					if (terminalIndex === -1) {
						content.push({
							type: ToolResultContentType.Terminal,
							resource: nonPtyCompletion.uri,
							title: tracked.displayName,
							isPty: false,
							...(nonPtyCompletion.result ? { result: nonPtyCompletion.result } : {}),
						});
					} else if (nonPtyCompletion.result) {
						const terminalBlock = content[terminalIndex] as ToolResultTerminalContent;
						content[terminalIndex] = { ...terminalBlock, resource: nonPtyCompletion.uri, result: nonPtyCompletion.result };
					}
				}
			}

			const abortToken = this._abortToken;
			const isSubagent = parentToolCallId !== undefined && !this._fusionPhases.has(parentToolCallId);
			const isCurrent = () => !this._store.isDisposed && !abortToken.isCancellationRequested && (isSubagent || this._currentTurn.value === turn);
			let terminalOutputStored = false;
			let completionPublished = false;
			let publication: Promise<boolean> | undefined;
			const complete = (authoritativeOutput?: string) => {
				if (nonPtyCompletion?.shouldRetire) {
					this._nonPtyShellTerminals.finalizeToolCall(e.data.toolCallId, nonPtyCompletion.result?.exitCode, authoritativeOutput);
				}
				this._emitAction({
					type: ActionType.ChatToolCallComplete,
					turnId,
					toolCallId: e.data.toolCallId,
					result: {
						success: e.data.success,
						pastTenseMessage: getPastTenseMessage(tracked.toolName, displayName, tracked.parameters, e.data.success, e.data.success ? toolOutput : undefined, path => this._resolveEditFilePath(path), this._resolveAgentName, tracked.meta?.[imageGenerationToolMetaKey]),
						content: content.length > 0 ? content : undefined,
						structuredContent: e.data.result?.structuredContent as Record<string, unknown> | undefined,
						error: e.data.error,
					},
					_meta: tracked.meta ? toToolCallMeta(tracked.meta) : undefined,
				}, parentToolCallId);
				const onPublished = (published: boolean) => {
					completionPublished = published;
					if (published && retireNonPtyShellTracking) {
						// Preserve the result in chat state before removing its live output resource.
						this._nonPtyShellTerminals.retire(e.data.toolCallId);
					}
				};
				return publication ? publication.then(onPublished) : onPublished(true);
			};
			const outputFilePath = isShellCommandTool && !ptyTerminalUri ? shellExit?.outputFilePath : undefined;
			if (filePaths.length === 0 && !outputFilePath && !hasResources) {
				complete();
				return;
			}
			const outputDatabase = outputFilePath || hasResources ? this._sessionDataService.openDatabase(this._storageUri) : undefined;
			const deferred = isSubagent ? new DeferredPromise<AgentSignal | undefined>() : undefined;
			if (parentToolCallId && deferred) {
				this._pendingSubagentToolCompletions.set(e.data.toolCallId, deferred);
				publication = this._subagentProgressSequencer.queue(parentToolCallId, async () => {
					const signal = await raceCancellation(deferred.p, abortToken);
					if (!signal || this._store.isDisposed || abortToken.isCancellationRequested) {
						return false;
					}
					this._onDidSessionProgress.fire(signal);
					return true;
				});
			}
			const completion = (async () => {
				// The turn's existing completion tracking makes session.idle wait for these writes.
				if (hasResources && resultContent?.contents && outputDatabase) {
					const embedded = await persistSdkToolResultResources(resultContent.contents, this._storageUri.toString(), turnId, e.data.toolCallId, outputDatabase.object, this._logService);
					appendSdkToolResultContent(content, resultContent.contents.filter(block => block.type !== 'shell_exit'), undefined, resultContent.binaryResultsForLlm, undefined, { embedded, mcpChannel });
				}
				let authoritativeOutput: string | undefined;
				if (outputFilePath && outputDatabase) {
					try {
						const output = await this._fileService.readFile(URI.file(outputFilePath), { limits: { size: MAX_TERMINAL_OUTPUT_BYTES } }, abortToken);
						if (isCurrent()) {
							await outputDatabase.object.storeTerminalOutput(turnId, e.data.toolCallId, output.value.buffer);
							terminalOutputStored = true;
							if (isCurrent()) {
								authoritativeOutput = output.value.toString();
							}
						}
					} catch (error) {
						this._logService.warn(`[Copilot:${sessionId}] Failed to persist shell output for ${e.data.toolCallId}`, error);
					}
				}
				for (const fileEdit of await Promise.all(fileEdits)) {
					if (fileEdit) {
						content.push(fileEdit);
					}
				}
				if (isCurrent()) {
					await complete(authoritativeOutput);
				}
			})().catch(err => this._logService.error(`[Copilot:${sessionId}] Failed to complete tool call`, err)).finally(async () => {
				try {
					if (terminalOutputStored && !completionPublished && outputDatabase) {
						try {
							await outputDatabase.object.deleteTerminalOutput(e.data.toolCallId);
						} catch (error) {
							this._logService.warn(`[Copilot:${sessionId}] Failed to clean up unpublished shell output for ${e.data.toolCallId}`, error);
						}
					}
				} finally {
					outputDatabase?.dispose();
				}
				if (nonPtyCompletion?.shouldRetire) {
					this._nonPtyShellTerminals.finalizeToolCall(e.data.toolCallId, nonPtyCompletion.result?.exitCode);
				}
				if (retireNonPtyShellTracking) {
					this._nonPtyShellTerminals.retire(e.data.toolCallId);
				}
			}).finally(() => {
				if (deferred && !deferred.isSettled) {
					deferred.complete(undefined);
				}
				if (this._pendingSubagentToolCompletions.get(e.data.toolCallId) === deferred) {
					this._pendingSubagentToolCompletions.delete(e.data.toolCallId);
				}
			});
			if (outputFilePath || hasResources) {
				this._pendingOutputCaptures.add(completion);
				void completion.finally(() => this._pendingOutputCaptures.delete(completion));
			}
			turn?.trackToolCompletion(completion);
		};
		store.add(wrapper.onToolComplete(e => {
			// Billing survives cancellation; capture ownership before display cleanup removes the tool.
			handleMeteredToolUsage(e);
			if (this._surfacedProvisionalFusionToolCallIds.delete(e.data.toolCallId) && !this._activeToolCalls.has(e.data.toolCallId)) {
				this._logService.trace(`[Copilot:${sessionId}] Ignoring committed Fusion tool completion already surfaced: ${e.data.toolCallId}`);
				const summary = this._provisionalFusionTaskSummaries.get(e.data.toolCallId);
				this._provisionalFusionTaskSummaries.delete(e.data.toolCallId);
				if (summary && !this._shouldDropLateRootTurnEvent('tool.execution_complete', true)) {
					this._emitAction({
						type: ActionType.ChatResponsePart,
						turnId: this._turnId,
						part: { kind: ResponsePartKind.Markdown, id: generateUuid(), content: summary },
					});
				}
				return;
			}
			handleToolComplete(e);
		}));

		store.add(wrapper.onProvisionalFusionEvent(e => {
			if (e.type === 'tool.execution_complete') {
				handleMeteredToolUsage(e);
			}
			if (e.type === 'assistant.message') {
				// Review phases show their critique when they complete. Everything else a phase says belongs to its chat; only the committed answer becomes the response.
				if (e.agentId || e.data.fusion?.conversationScope === 'review') {
					return;
				}
				const phaseToolCallId = this._fusionPhaseToolCallId(undefined, e.data.fusion);
				if (phaseToolCallId === undefined) {
					return;
				}
				if (this._fusionPhases.get(phaseToolCallId)?.presentation === 'inline') {
					const call = this._provisionalInlineFusionMessageChunks.accept(e, phaseToolCallId);
					if (call?.messages.some(chunk => chunk.data.toolRequests?.some(request => !isTaskCompleteTool(request.name)))) {
						for (const chunk of call.messages) {
							this._shownProvisionalFusionMessageIds.add(chunk.data.messageId);
							renderMessage(chunk, undefined, isLastAssistantMessageChunk(chunk), true);
						}
					}
					return;
				}
				this._shownProvisionalFusionMessageIds.add(e.data.messageId);
				renderMessage(e, this._fusionPhaseContentParentToolCallId(phaseToolCallId), isLastAssistantMessageChunk(e), true);
				return;
			}
			if (e.type === 'tool.execution_start') {
				if (this._surfacedProvisionalFusionToolCallIds.has(e.data.toolCallId)) {
					return;
				}
				this._provisionalFusionToolStarts.set(e.data.toolCallId, e);
				// `assistant.tool_call_delta` carries no Fusion attribution, so a
				// provisional tool that streamed its input already has a visible row.
				// Otherwise it is shown live only when its phase chat can hold it.
				if (this._streamingToolCalls.get(e.data.toolCallId)?.started || this._fusionPhaseToolCallId(e.agentId, e.data.fusion) !== undefined) {
					this._surfaceProvisionalFusionToolCall(e.data.toolCallId);
				}
				return;
			}
			this._provisionalFusionToolStarts.delete(e.data.toolCallId);
			if (this._surfacedProvisionalFusionToolCallIds.has(e.data.toolCallId)) {
				// Keep the id so the committed re-emission is still recognized as a duplicate.
				handleToolComplete(e);
			}
		}));

		store.add(wrapper.onIdle(async e => {
			this._logService.info(`[Copilot:${sessionId}] Session idle`);
			const idleFromFailedExecution = !e.agentId && !e.data.aborted && this._failedExecutionIdlePending;
			if (!e.agentId) {
				this._failedExecutionIdlePending = false;
			}
			const abortingTurn = this._abortingTurn;
			this._abortingTurn = undefined;
			if (e.data.aborted) {
				if (!e.agentId) {
					this._cancelFusionEvents(abortingTurn?.id);
				}
				this._resetAbortToken();
			}
			if (!e.agentId) {
				if (e.data.aborted) {
					this._forgetFusionPhaseChats();
				} else {
					this._completeFusionPhaseChats();
				}
			}
			this._clearActivity();
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
			if (e.data.aborted && (!abortingTurn || turn === abortingTurn)) {
				if (!e.agentId) {
					this._setManagedPluginActivity(undefined);
				}
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
			if (e.data.aborted && !turn.isRunning) {
				this._logService.trace(`[Copilot:${sessionId}] Idle from abort; leaving ${turn.state} replacement turn ${turn.id} open`);
				return;
			}
			if (e.data.aborted) {
				this._logService.trace(`[Copilot:${sessionId}] Idle from abort reached running replacement turn ${turn.id}; completing replacement`);
			}
			if (turn === this._resumingTurnAwaitingProviderStart && !turn.providerTurnStarted) {
				this._logService.trace(`[Copilot:${sessionId}] Ignoring idle from the failed execution while resumed turn ${turn.id} awaits provider start`);
				return;
			}
			if (idleFromFailedExecution) {
				this._logService.trace(`[Copilot:${sessionId}] Ignoring idle from the preceding failed execution for turn ${turn.id}`);
				return;
			}
			// Only a `running` turn is completed by a normal idle. A `pending`
			// turn here means the SDK went idle before emitting any event for it
			// (a degenerate no-op send); complete it defensively so the session
			// does not hang.
			if (turn.hasPendingToolCompletions) {
				const abortToken = this._abortToken;
				await turn.drainToolCompletions();
				if (this._store.isDisposed || abortToken.isCancellationRequested || this._currentTurn.value !== turn) {
					return;
				}
			}
			this._completeActiveRepoInfoTelemetry();
			this._completeActiveTurn();
			if (!e.agentId && !e.data.aborted) {
				const steering = [...this._pendingSteeringFlips.values()].find(pending => pending.sdkSend && !pending.promotedTurnId && !pending.withdrawing);
				if (steering) {
					this._logService.info(`[Copilot:${sessionId}] Steering message was sent after the turn ended; starting it as its own turn: id=${steering.pendingMessage.id}`);
					this._beginSteeringTurn(steering);
				}
			}
		}));

		// The SDK emits a `skill` tool call (which we hide) and a richer
		// `skill.invoked` event with the resolved SKILL.md path. Synthesize a
		// tool-start/complete pair from the latter so the UI can render a
		// clickable file link, matching the `view`-tool display style.
		store.add(wrapper.onSkillInvoked(e => {
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
				toolInput: synth.toolInput,
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

		store.add(wrapper.onSubagentStarted(e => {
			if (this._dropLateRootTurnEvents) {
				this._logService.error(`[Copilot:${sessionId}] subagent.started emitted after cancellation; dropping`);
				return;
			}
			const tracked = this._activeToolCalls.get(e.data.toolCallId);
			const parentToolCallId = tracked?.parentToolCallId;
			const taskPrompt = typeof tracked?.parameters?.prompt === 'string' ? tracked.parameters.prompt : undefined;
			this._subagents.start({
				toolCallId: e.data.toolCallId,
				agentId: e.agentId,
				displayName: subagentChatTitle(tracked?.meta?.subagentDescription, e.data.agentDisplayName),
				taskPrompt,
				parentToolCallId: parentToolCallId && !this._fusionPhases.has(parentToolCallId) ? parentToolCallId : undefined,
				rootTurn: this._currentTurn.value,
			});
			if (e.agentId) {
				this._subagentTaskCompletionSchedulers.deleteAndDispose(e.agentId);
			}
			this._logService.info(`[Copilot:${sessionId}] Subagent started: toolCallId=${e.data.toolCallId}, agent=${e.data.agentName}`);
			this._emitProgress({
				kind: 'subagent_started',
				chat: this._chatChannelUri,
				toolCallId: e.data.toolCallId,
				agentName: e.data.agentName,
				agentDisplayName: e.data.agentDisplayName,
				agentDescription: e.data.agentDescription,
				taskModelSource: readSubagentTaskModelSource(e.data),
				// Use the spawning Task tool's short description as the subagent chat title.
				taskDescription: tracked?.meta?.subagentDescription,
				// Seed the subagent chat with the spawning tool's full delegated prompt.
				taskPrompt,
				// Preserve the immediate parent tool-call edge so discovery content routes to the right ancestor chat.
				parentToolCallId: tracked?.parentToolCallId,
			});
			this._updateSubagentModel(e.data.toolCallId, e.data.model);
		}));

		store.add(wrapper.onSubagentCompleted(e => {
			this._scheduleSubagentLifecycleCompletion(e.agentId, e.data.toolCallId, e.data.cancelled ? { kind: 'cancelled', durationMs: e.data.durationMs } : undefined);
		}));

		store.add(wrapper.onSubagentFailed(e => {
			this._scheduleSubagentLifecycleCompletion(e.agentId, e.data.toolCallId, { kind: 'failed', message: e.data.error, durationMs: e.data.durationMs });
		}));

		store.add(wrapper.onSubagentConfigured(e => {
			const parentToolCallId = this._parentToolCallIdForSubagentEvent(e);
			if (!parentToolCallId) {
				this._logService.warn(`[Copilot:${sessionId}] Unable to attribute model configuration for unknown subagent agentId=${e.agentId}`);
				return;
			}
			this._updateSubagentModel(parentToolCallId, e.data.model, {
				...(e.data.reasoningEffort ? { reasoningEffort: e.data.reasoningEffort } : {}),
				...(e.data.contextTier ? { contextTier: e.data.contextTier } : {}),
			});
		}));

		store.add(wrapper.onTurnStart(e => {
			if (!e.agentId || !e.data.model) {
				return;
			}
			this._resumeSubagentForEvent(e);
			const parentToolCallId = this._parentToolCallIdForSubagentEvent(e);
			if (parentToolCallId) {
				this._updateSubagentModel(parentToolCallId, e.data.model);
			}
		}));

		store.add(wrapper.onSessionError(e => {
			if (!e.agentId && this._shouldDropLateRootTurnEvent('session.error')) {
				return;
			}
			const turn = this._currentTurn.value;
			if (!e.agentId && turn && turn === this._resumingTurnAwaitingProviderStart && !turn.providerTurnStarted) {
				this._logService.trace(`[Copilot:${sessionId}] Ignoring error from the failed execution while resumed turn ${turn.id} awaits provider start`);
				return;
			}
			this._logService.error(`[Copilot:${sessionId}] Session error: ${e.data.errorType} - ${e.data.message}`);
			if (isCopilotSdkAuthRejection(e.data)) {
				this._onDidRequireAuth.fire();
			}
			const correlation = createCopilotFailureCorrelation(this.resourceUri, this._chatChannelUri, this._turnId, this.sessionId, this._currentTurn.value?.clientContext);
			const reportError = () => reportCopilotSdkSessionError(this._telemetryService, e, correlation);
			if (this._heldSessionErrorReports) {
				this._heldSessionErrorReports.push(reportError);
			} else {
				reportError();
			}
			const parentToolCallId = this._parentToolCallIdForSubagentEvent(e);
			if (turn) {
				this._reportToolCallDetails(turn, 'failed');
				if (!parentToolCallId) {
					this._attributeLocalModelTurn(turn.id);
				}
			}
			this._emitAction({
				type: ActionType.ChatError,
				turnId: this._turnId,
				duration: turn?.duration ?? 0,
				part: createErrorResponsePart(buildChatErrorInfoFromCopilotSdkFields(e.data), !e.agentId && turn !== undefined),
			}, parentToolCallId);
			if (!parentToolCallId) {
				if (!e.agentId) {
					this._completeFusionPhaseChats();
					this._failedExecutionIdlePending = true;
				}
				this._clearActiveTurn();
			}
		}));

		store.add(wrapper.onModelCallFailure(e => {
			reportCopilotModelCallFailure(this._telemetryService, e, createCopilotFailureCorrelation(this.resourceUri, this._chatChannelUri, this._turnId, this.sessionId, this._currentTurn.value?.clientContext));
		}));

		// Tracks the last parent-scope usage so the async attribution enrichment
		// can re-emit a complete action (with accumulated credits, quota, etc.).
		let lastParentUsage: UsageInfo | undefined;
		let lastParentUsageTurnId: string | undefined;
		let autoModeResolved: { readonly turnId: string; readonly data: NonNullable<UsageInfoMeta['autoModeResolved']> } | undefined;

		const handleMeteredToolUsage = (e: SessionEventPayload<'tool.execution_complete'>): void => {
			const rawCompletion: typeof e.data & { toolUsage?: unknown } = e.data;
			if (rawCompletion.toolUsage === undefined) {
				return;
			}
			const image = getSdkImageGenerationMetadata(e.data.result, rawCompletion.toolUsage);
			if (!image?.usage) {
				this._logService.warn(`[Copilot:${sessionId}] Invalid metered tool usage on ${e.data.toolCallId}`);
				return;
			}
			const usage = image.usage;
			if (this._toolUsageRequestIds.has(usage.requestId)) {
				return;
			}
			this._toolUsageRequestIds.add(usage.requestId);
			const tracked = this._activeToolCalls.get(e.data.toolCallId);
			const ownerTurnId = tracked?.turnId ?? (e.data.fusion ? this._fusionEventTurnIds.get(`fusion:${e.data.fusion.fusionId}`) : undefined);
			const parentToolCallId = tracked?.parentToolCallId ?? this._parentToolCallIdForSubagentEvent(e) ?? this._fusionPhaseToolCallId(e.agentId, e.data.fusion);
			// Fusion phase chats are root presentation scopes; SDK children retain their own root ownership.
			const owningRootTurn = this._owningRootTurn(parentToolCallId && this._fusionPhases.has(parentToolCallId) ? undefined : parentToolCallId);
			const turn = !this._dropLateRootTurnEvents && (!e.agentId || parentToolCallId)
				&& ownerTurnId !== undefined && owningRootTurn?.id === ownerTurnId ? owningRootTurn : undefined;
			const charge = usage.copilotUsage?.totalNanoAiu;
			if (turn && charge !== undefined) {
				turn.copilotNanoAiu += charge;
			}
			// Image tokens belong in consumption totals, not in the chat context window.
			const tokenModel = usage.inputTokens !== undefined && usage.outputTokens !== undefined ? image.requestedModel.id : undefined;
			turn?.addTokenTotals(tokenModel, usage);
			const liveChild = parentToolCallId && !this._dropLateRootTurnEvents
				&& (e.agentId ? this._subagents.isActive(e.agentId) : this._fusionPhaseChats.has(parentToolCallId));
			const directUsage = parentToolCallId
				? liveChild ? this._directUsageFor(parentToolCallId, ownerTurnId !== undefined) : undefined
				: turn?.directUsage;
			directUsage?.add(tokenModel, usage, charge);
			const previousStatus = this._sessionAiCreditsStatus;
			if (charge === undefined) {
				// A terminal error can precede the metrics RPC. The operation itself already
				// proves the previous total incomplete, without estimating its missing charge.
				this._sessionAiCreditsStatus = this._sessionAiCreditsStatus === 'complete' || this._sessionAiCreditsStatus === 'partial'
					|| this._sessionTotalNanoAiu > 0 || (turn?.copilotNanoAiu ?? 0) > 0 || directUsage?.copilotNanoAiu !== undefined
					? 'partial' : 'unavailable';
			} else if (this._sessionAiCreditsStatus === 'unavailable') {
				this._sessionAiCreditsStatus = 'partial';
			}
			if (previousStatus !== this._sessionAiCreditsStatus) {
				this._publishSessionUsage();
			}
			const emitUsage = () => {
				if (!turn || this._currentTurn.value !== turn || this._dropLateRootTurnEvents) {
					return;
				}
				const base = lastParentUsageTurnId === turn.id ? lastParentUsage : undefined;
				const updated: UsageInfo = {
					...base,
					model: base?.model ?? this._lastSeenModelId,
					_meta: {
						...base?._meta,
						copilotUsage: this._parentCopilotUsageMeta(),
						turnTokenTotals: turn.tokenTotals,
						directTurnTokenTotals: turn.directUsage.tokenTotals,
						...(turn.directUsage.copilotNanoAiu !== undefined ? { directCopilotUsage: { totalNanoAiu: turn.directUsage.copilotNanoAiu } } : {}),
					},
				};
				lastParentUsage = updated;
				lastParentUsageTurnId = turn.id;
				this._emitAction({ type: ActionType.ChatUsage, turnId: turn.id, usage: updated });
			};
			emitUsage();
			if (parentToolCallId && directUsage) {
				const previous = this._lastSubagentUsageByToolCallId.get(parentToolCallId);
				const scoped: UsageInfo = {
					...previous,
					_meta: {
						...previous?._meta,
						directTurnTokenTotals: directUsage.tokenTotals,
						...(directUsage.copilotNanoAiu !== undefined ? {
							copilotUsage: { totalNanoAiu: directUsage.copilotNanoAiu },
							directCopilotUsage: { totalNanoAiu: directUsage.copilotNanoAiu },
						} : {}),
					},
				};
				this._lastSubagentUsageByToolCallId.set(parentToolCallId, scoped);
				this._emitAction({ type: ActionType.ChatUsage, turnId: ownerTurnId ?? '', usage: scoped }, parentToolCallId);
			}
			const refresh = this._refreshSessionUsageMetrics().then(() => emitUsage());
			turn?.trackToolCompletion(refresh);
			void refresh.catch(error => this._logService.error(`[Copilot:${sessionId}] Failed to publish metered tool usage`, error));
		};
		store.add(wrapper.onAutoModeResolved(e => {
			if (!e.agentId && this._shouldDropLateRootTurnEvent('session.auto_mode_resolved')) {
				return;
			}
			this._lastSeenModelId = e.data.chosenModel;
			const turnId = this._turnId;
			this._logService.info(`[Copilot:${sessionId}] Auto mode resolved to ${e.data.chosenModel}${e.data.reasoningBucket ? ` (${e.data.reasoningBucket})` : ''}${formatAutoModeRoutingForLog(e.data)}`);
			// A subagent's routing is recorded against its tool call, so unlike the
			// parent's it does not need an active root turn to attach to.
			if (!turnId && !e.agentId) {
				return;
			}
			if (!e.agentId) {
				this._telemetryReporter.autoModeRouterDecision({
					session: this.resourceUri.toString(),
					chat: this._chatChannelUri.toString(),
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
			// Telemetry above reads the full decision; usage carries only what clients read.
			const resolved = compactAutoModeResolved(e.data);
			// Publish the child's routing before its model call, independently of parent usage.
			if (e.agentId) {
				const subagentToolCallId = this._parentToolCallIdForSubagentEvent(e);
				if (!subagentToolCallId) {
					this._logService.warn(`[Copilot:${sessionId}] Unable to attribute Auto mode resolution for unknown subagent agentId=${e.agentId}; leaving the parent turn's routing untouched`);
				} else {
					this._autoModeResolvedByToolCallId.set(subagentToolCallId, resolved);
					this._updateSubagentModel(subagentToolCallId, e.data.chosenModel);
				}
				return;
			}
			autoModeResolved = { turnId, data: resolved };
			const priorUsage = lastParentUsageTurnId === turnId ? lastParentUsage : undefined;
			const usage: UsageInfo = {
				...priorUsage,
				model: e.data.chosenModel,
				_meta: {
					...(priorUsage?._meta ?? {}),
					autoModeResolved: resolved,
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

		store.add(wrapper.onUsage(e => {
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
			if (!mappedParentToolCallId && e.data.parentToolCallId && this._currentTurn.value) {
				this._subagents.observeRootTurn(e.data.parentToolCallId, this._currentTurn.value.id);
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
			const modelCall = readAgentModelCallDiagnostics({
				_meta: {
					[agentModelCallMetaKey]: {
						schemaVersion: 1, sdkSessionId: wrapper.sessionId, eventId: e.id,
						apiCallId: e.data.apiCallId, providerCallId: e.data.providerCallId, serviceRequestId: e.data.serviceRequestId,
						agentId: e.agentId, model: e.data.model,
						turnId: e.data.apiCallId ? this.modelCallTurnCorrelation.getRecordedTurnId(e.data.apiCallId) : undefined,
						durationMs: e.data.duration, timeToFirstTokenMs: e.data.timeToFirstTokenMs, outputTtftMs: e.data.outputTtftMs,
						inputTokens: e.data.inputTokens, outputTokens: e.data.outputTokens, cacheReadTokens: e.data.cacheReadTokens,
					},
				},
			});

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
			// The wrapper drops provisional HydraFusion `assistant.message` copies, so only the committed
			// phase's replayed messages reach `onMessage`; discarded, cancelled, and review phases never
			// report their model calls there. Each phase call still bills an attributed `assistant.usage`
			// carrying the same `apiCallId`, so the turn's call set dedupes the committed replay. The
			// Fusion run must belong to this host turn, so a late call from an ended turn is not adopted.
			const fusion = e.data.fusion;
			if (turn && !e.agentId && !parentToolCallId && fusion?.phaseId && e.data.apiCallId && e.data.interactionType !== 'conversation-compaction'
				&& this._fusionEventTurnIds.get(`fusion:${fusion.fusionId}`) === turn.id) {
				this._emitModelCallCompleted(turn.id, e.data.apiCallId);
			}
			const directUsage = isUnmappedSubagent ? undefined : this._directUsageFor(parentToolCallId, true);
			directUsage?.add(eventContext.model, eventContext, copilotUsage?.totalNanoAiu);
			const isChildUsage = e.data.interactionType === 'conversation-subagent' || e.data.initiator === 'sub-agent';
			// Compaction is counted from compaction_complete only; assistant.usage can report the same work.
			if (!isUnmappedSubagent && (!isChildUsage || parentToolCallId) && e.data.interactionType !== 'conversation-compaction') {
				this._observeTokenUsage(parentToolCallId, e.id, eventContext.model, 'direct-model', eventContext, e.data.reasoningEffort, e.data.apiCallId);
			}

			// Builds a usage object carrying the given context's tokens/model plus
			// the credit total for the given scope. `copilotUsage` is the scope's
			// Copilot billing metadata, or `undefined` when nothing is billed yet.
			const buildUsage = (context: UsageContext, scopedCopilotUsage: UsageInfoMeta['copilotUsage'], isParentScope: boolean, directOwnerToolCallId: string | undefined): UsageInfo => {
				const metadata: UsageInfoMeta = {};
				const modelConfiguration = directOwnerToolCallId ? readAgentRuntimeModelConfiguration(this._lastSubagentUsageByToolCallId.get(directOwnerToolCallId)) : undefined;
				if (modelConfiguration) {
					metadata[agentModelConfigurationMetaKey] = modelConfiguration;
				}
				if (modelCall) {
					metadata[agentModelCallMetaKey] = modelCall;
				}
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
		store.add(wrapper.onUsage(async e => {
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
		store.add(wrapper.onSessionCompactionComplete(async e => {
			const observeUsage = () => {
				const observedParentToolCallId = this._parentToolCallIdForSubagentEvent(e);
				if ((!e.agentId || observedParentToolCallId) && !this._dropLateRootTurnEvents) {
					this._observeTokenUsage(observedParentToolCallId, e.id, e.data.compactionTokensUsed?.model, 'compaction', {
						inputTokens: e.data.compactionTokensUsed?.inputTokens,
						outputTokens: e.data.compactionTokensUsed?.outputTokens,
						cacheReadTokens: e.data.compactionTokensUsed?.cacheReadTokens,
					});
				}
			};
			if (e.data.success === false) {
				observeUsage();
				return;
			}
			this._resumeSubagentForEvent(e);
			observeUsage();
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

		store.add(wrapper.onReasoningDelta(e => {
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
		store.add(wrapper.onSessionModeChanged(e => {
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
		store.add(wrapper.onMcpServersLoaded(() => {
			// The SDK re-emits a cached loaded snapshot on later turns, not live connection state.
			this._logService.trace(`[Copilot:${sessionId}] MCP server inventory invalidated by session.mcp_servers_loaded; refreshing rpc.mcp.listConfigured`);
			void this._refreshMcpServersFromRpc().catch(err => {
				this._logService.warn(`[Copilot:${sessionId}] Failed to refresh MCP server inventory after session.mcp_servers_loaded`, err);
			});
		}));
		store.add(wrapper.onMcpServerToolsLoaded(e => {
			this._mcpLifecycleVersion++;
			this._markMcpToolsLoaded(e.data.serverName);
		}));
		store.add(wrapper.onMcpServerStatusChanged(e => {
			this._mcpLifecycleVersion++;
			if (e.data.status !== 'pending') {
				this._mcpAwaitingOAuthReconnect.delete(e.data.serverName);
			}
			this._observeMcpRestart(e.data.serverName, e.data.status);
			this._noteMcpSdkStatus(e.data.serverName, e.data.status);
			const requirement = this._lastMcpAuthRequirements.get(e.data.serverName);
			if (requirement && e.data.status !== 'pending') {
				this._lastMcpAuthRequirements.set(e.data.serverName, { ...requirement, acceptsTokenCompletion: false });
			}
			this._logMcpServerLifecycle({ name: e.data.serverName, status: e.data.status, error: e.data.error, origin: 'statusChanged' });
			const previousEnabled = this._mcpConfiguredEnablement.get(e.data.serverName);
			const server = this._toSdkMcpServer({
				name: e.data.serverName,
				status: e.data.status,
				error: e.data.error,
				enabled: this._mcpConfiguredEnablement.get(e.data.serverName),
			});
			if (!server) {
				this._mcpCustomizations.remove(e.data.serverName);
				return;
			}
			this._mcpCustomizations.applyOne(server);
			if (e.data.status === 'connected' && !this._mcpToolsLoaded.has(e.data.serverName)) {
				// Older runtimes never emit tools-loaded; inventory `toolsLoaded`, or its absence, decides readiness.
				void this._refreshMcpServersFromRpc().catch(error => {
					this._logService.warn(`[Copilot:${this.sessionId}] Failed to refresh MCP server inventory after '${e.data.serverName}' connected`, error);
				});
			}
			if (e.data.status === 'disabled' || previousEnabled === false) {
				void this._refreshObservedMcpServerEnablement(e.data.serverName, previousEnabled).catch(error => {
					this._logService.warn(`[Copilot:${this.sessionId}] Failed to refresh MCP enablement for '${e.data.serverName}'`, error);
				});
			}
			if (server.state.kind === McpServerStatus.Ready) {
				void this._refreshMcpToolRoutingCache(e.data.serverName).catch(error => {
					this._logService.warn(`[Copilot:${this.sessionId}] Failed to refresh MCP tool routing metadata for '${e.data.serverName}'`, error);
				});
			}
		}));
		store.add(wrapper.onMcpOAuthCompleted(e => {
			this._handleMcpOAuthCompleted(e.data.requestId, e.data.outcome);
		}));

		store.add(wrapper.onToolsUpdated(() => {
			this._slashCommandProvider.clearCache();
			this._refreshReadyMcpToolRoutingCaches();
			this._fireMcpToolsListChanged();
		}));
		store.add(wrapper.onCommandsChanged(() => {
			this._slashCommandProvider.clearCache();
		}));

		// Discover configured servers without starting them; loaded events invalidate this inventory.
		this._seedMcpServersFromRpc();
	}

	/**
	 * Seeds the authoritative RPC inventory; later loaded events repeat this
	 * best-effort refresh.
	 */
	private _seedMcpServersFromRpc(): void {
		this._refreshMcpServersFromRpc().catch(err => {
			this._logService.warn(`[Copilot:${this.sessionId}] Failed to seed MCP server inventory`, err);
		});
	}

	/** Refreshes inventory, retrying snapshots overtaken by lifecycle events without superseding a newer refresh. */
	private async _refreshMcpServersFromRpc(): Promise<void> {
		const mcpRpc = this._wrapper.session.rpc?.mcp;
		if (!mcpRpc) {
			return;
		}
		const requestVersion = ++this._mcpInventoryRequestVersion;
		while (!this._store.isDisposed) {
			const lifecycleVersion = this._mcpLifecycleVersion;
			const [result] = await Promise.all([
				mcpRpc.listConfigured(),
				this._refreshUserMcpServers(),
			]);
			if (this._store.isDisposed || requestVersion !== this._mcpInventoryRequestVersion) {
				return;
			}
			if (lifecycleVersion !== this._mcpLifecycleVersion) {
				this._logService.trace(`[Copilot:${this.sessionId}] Retrying MCP server inventory after a newer lifecycle update`);
				continue;
			}
			this._logMcpServersSnapshot(result.servers.map(s => ({
				name: s.name,
				status: s.live?.status ?? 'stopped',
				error: s.live?.error,
				source: s.source,
				pluginName: s.sourcePlugin,
				pluginVersion: s.sourcePluginVersion,
			})), 'inventory');
			for (const server of result.servers) {
				const status = server.live?.status ?? 'stopped';
				this._noteMcpSdkStatus(server.name, status);
				// The bundled SDK types predate inventory `toolsLoaded`; older runtimes use connected as ready.
				const toolsLoaded = (server.live as { readonly toolsLoaded?: boolean } | undefined)?.toolsLoaded;
				if (toolsLoaded === true || (toolsLoaded === undefined && status === 'connected')) {
					this._mcpToolsLoaded.add(server.name);
				} else if (toolsLoaded === false) {
					this._mcpToolsLoaded.delete(server.name);
				}
			}
			this._applyMcpServerList(result.servers.map(server => ({
				...server,
				status: server.live?.status ?? 'stopped',
				error: server.live?.error,
			})));
			for (const server of result.servers) {
				if (server.live?.status === 'connected' && this._mcpToolsLoaded.has(server.name)) {
					void this._refreshMcpToolRoutingCache(server.name).catch(error => {
						this._logService.warn(`[Copilot:${this.sessionId}] Failed to refresh MCP tool routing metadata for '${server.name}'`, error);
					});
				}
			}
			return;
		}
	}

	/** Reads user configuration independently of inventory RPCs that older SDKs may block on server startup. */
	private async _refreshUserMcpServers(): Promise<void> {
		if (!this._getUserMcpServers) {
			return;
		}
		const version = ++this._userMcpServersRequestVersion;
		try {
			const servers = await this._getUserMcpServers();
			if (this._store.isDisposed || version !== this._userMcpServersRequestVersion) {
				return;
			}
			this._userMcpServers = servers;
			this._mcpCustomizations.refreshProvenance();
		} catch (error) {
			this._logService.warn(`[Copilot:${this.sessionId}] Failed to refresh user MCP configuration sources`, error);
		}
	}

	private _noteMcpSdkStatus(serverName: string, status: SdkMcpServerStatus): void {
		if (this._mcpSdkStatus.get(serverName) === 'connected' && status !== 'connected') {
			this._mcpToolsLoaded.delete(serverName);
		}
		this._mcpSdkStatus.set(serverName, status);
	}

	/** Promotes a connected server from Starting to Ready once its current connection has loaded tools. */
	private _markMcpToolsLoaded(serverName: string): void {
		if (this._store.isDisposed) {
			return;
		}
		if (this._mcpAwaitingOAuthReconnect.delete(serverName)) {
			this._noteMcpSdkStatus(serverName, 'connected');
		} else if (this._mcpToolsLoaded.has(serverName)) {
			return;
		}
		this._mcpToolsLoaded.add(serverName);
		if (this._mcpSdkStatus.get(serverName) !== 'connected') {
			return;
		}
		const server = this._toSdkMcpServer({
			name: serverName,
			status: 'connected',
			enabled: this._mcpConfiguredEnablement.get(serverName),
		});
		this._mcpCustomizations.applyOne(server);
		void this._refreshMcpToolRoutingCache(serverName).catch(error => {
			this._logService.warn(`[Copilot:${this.sessionId}] Failed to refresh MCP tool routing metadata for '${serverName}'`, error);
		});
	}

	private _applyMcpServerList(servers: McpServer[]): void {
		const serverNames = new Set(servers.map(server => server.name));
		for (const serverName of this._lastMcpAuthRequirements.keys()) {
			if (!serverNames.has(serverName)) {
				this._lastMcpAuthRequirements.delete(serverName);
			}
		}
		this._mcpInventoryProvenance = new Map(servers.map(server => [server.name, { source: server.source, sourcePlugin: server.sourcePlugin, url: server.url }]));
		const sdkServers = servers.map(server => this._toSdkMcpServer(server));
		this._mcpCustomizations.applyAll(sdkServers);
		for (const server of servers) {
			if (server.enabled === undefined) {
				continue;
			}
			this._mcpConfiguredEnablement.set(server.name, server.enabled);
		}
		for (const name of this._mcpConfiguredEnablement.keys()) {
			if (!serverNames.has(name)) {
				this._mcpConfiguredEnablement.delete(name);
			}
		}
	}

	/** Promotes a delivered OAuth token to Starting, then refreshes inventory without treating it as Ready. */
	private _handleMcpOAuthCompleted(requestId: string, outcome: 'token' | 'cancelled'): void {
		if (this._store.isDisposed) {
			return;
		}
		const match = [...this._lastMcpAuthRequirements.entries()].find(([, requirement]) => requirement.requestId === requestId);
		if (!match) {
			return;
		}
		const [serverName, requirement] = match;
		if (outcome !== 'token') {
			this._disableMcpTokenCompletion(serverName, requestId);
			this._mcpRoutingActivations.get(serverName)?.cancellation.cancel();
			return;
		}
		if (!requirement.acceptsTokenCompletion || this._hasPendingMcpAuthentication(serverName) || this._mcpCustomizations.stateForServer(serverName)?.kind !== McpServerStatus.AuthRequired) {
			return;
		}
		this._mcpLifecycleVersion++;
		this._disableMcpTokenCompletion(serverName, requestId);
		// The reconnect is a new connection; tools from an earlier connection or a cached snapshot no longer count.
		this._mcpToolsLoaded.delete(serverName);
		this._mcpAwaitingOAuthReconnect.add(serverName);
		this._mcpCustomizations.applyOne({
			name: serverName,
			state: { kind: McpServerStatus.Starting },
			allowAuthRequiredToStarting: true,
		});
		void this._refreshMcpServersFromRpc().catch(error => {
			this._logService.warn(`[Copilot:${this.sessionId}] Failed to refresh MCP server inventory after OAuth token delivery`, error);
		});
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

		const state = this._toSdkMcpServer({
			name: server.name,
			status: server.status,
			error: server.error,
		}).state;
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
	 * Translates SDK status, preserving actionable authentication while a callback is pending.
	 * Only a callback-free SDK `pending` update, or `connected` while tools load, can replace a retained challenge with starting.
	 */
	private _toSdkMcpServer(server: McpServer): ISdkMcpServer {
		const hasPendingAuthentication = this._hasPendingMcpAuthentication(server.name);
		return {
			name: server.name,
			displayName: this._copilotConnectorServers.get(server.name)?.displayName,
			state: this._translateSdkMcpStatus(server.name, server.status, server.error, hasPendingAuthentication),
			...((server.status === 'pending' && !hasPendingAuthentication) || server.status === 'connected' ? { allowAuthRequiredToStarting: true } : {}),
			enabled: getEffectiveMcpServerEnablement(server.enabled, server.enabled === undefined ? server.status : server.live?.status),
		};
	}

	/**
	 * Derives where a server is configured from the latest inventory, the user configuration file and the
	 * plugins in this session's client snapshot. Pure with respect to that state; never reads published output.
	 */
	private _resolveMcpServerProvenance(serverName: string, pluginMcpServerSources: ReadonlyMap<string, string>): IMcpServerProvenance {
		const reported = this._mcpInventoryProvenance.get(serverName);
		const source = reported?.source
			?? (reported?.sourcePlugin || pluginMcpServerSources.has(serverName) ? 'plugin'
				: Object.hasOwn(this._userMcpServers, serverName) ? 'user'
					: undefined);
		return {
			source,
			sourcePlugin: reported?.sourcePlugin,
			sourceUri: source === 'user'
				? URI.joinPath(this._copilotHomeService.home, 'mcp-config.json').toString()
				: undefined,
		};
	}

	/** Translates SDK state while retaining the most recent challenge metadata for `needs-auth`. */
	private _translateSdkMcpStatus(name: string, status: SdkMcpServerStatus, error: string | undefined, hasPendingAuthentication: boolean): McpServerState {
		switch (status) {
			case 'connected': {
				if (this._mcpToolsLoaded.has(name)) {
					return { kind: McpServerStatus.Ready };
				}
				const previous = this._mcpCustomizations.stateForServer(name);
				return { kind: McpServerStatus.Starting, blocking: previous?.kind === McpServerStatus.Starting ? previous.blocking ?? true : true };
			}
			case 'failed':
				return {
					kind: McpServerStatus.Error,
					error: {
						errorType: 'mcp-server-failed',
						message: error ?? 'MCP server failed to start',
					},
				};
			case 'pending': {
				const previous = this._mcpCustomizations.stateForServer(name);
				if (hasPendingAuthentication && previous?.kind === McpServerStatus.AuthRequired) {
					return previous;
				}
				return { kind: McpServerStatus.Starting, blocking: previous?.kind === McpServerStatus.Starting ? previous.blocking ?? true : true };
			}
			case 'needs-auth': {
				const previous = this._mcpCustomizations.stateForServer(name);
				if (hasPendingAuthentication && previous?.kind === McpServerStatus.AuthRequired) {
					return previous;
				}
				const auth = this._lastMcpAuthRequirements.get(name)?.auth ?? this._copilotConnectorAuthRequirement(name);
				return auth ? { kind: McpServerStatus.AuthRequired, ...auth } : { kind: McpServerStatus.Starting };
			}
			case 'disabled':
			case 'not_configured':
				this._lastMcpAuthRequirements.delete(name);
				return { kind: McpServerStatus.Stopped };
			default:
				return { kind: McpServerStatus.Stopped };
		}
	}

	/**
	 * A runtime that classifies a Connector scope failure reports it on the Connector status instead of asking for
	 * an MCP token, so describe the requirement for a Connector-owned server that needs authentication.
	 */
	private _copilotConnectorAuthRequirement(serverName: string): McpAuthRequirement | undefined {
		const connector = this._copilotConnectorServers.get(serverName);
		if (!connector || !this._copilotConnectorAuthorizationRequired) {
			return undefined;
		}
		return {
			reason: McpAuthRequiredReason.InsufficientScope,
			resource: {
				resource: this._mcpInventoryProvenance.get(serverName)?.url ?? serverName,
				resource_name: connector.displayName,
				scopes_supported: [copilotConnectorsScope],
			},
			requiredScopes: [copilotConnectorsScope],
		};
	}

	/**
	 * Translates the SDK's three-mode space (`interactive` / `plan` /
	 * `autopilot`) to AHP's `mode` axis of this chat:
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
	 * propagate to all subscribed clients via `chat/configChanged` (or
	 * `session/configChanged` when the session's schema has no per-chat mode).
	 */
	private _syncAhpConfigFromSdkMode(sdkMode: CopilotSdkMode): void {
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
		this._configurationService.updateChatConfig(this._configWriteTarget(), patch);
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

	/** Invalidates both history scopes when persisted events change, while coalescing idle reads within each scope. */
	private _subscribeForMemoInvalidation(store: DisposableStore = this._store): void {
		const wrapper = this._wrapper;
		const invalidate = () => this._invalidateMappedEvents();
		// New content appended to the log.
		store.add(wrapper.onUserMessage(invalidate));
		store.add(wrapper.onTurnStart(invalidate));
		store.add(wrapper.onMessage(invalidate));
		store.add(wrapper.onToolStart(invalidate));
		store.add(wrapper.onToolComplete(invalidate));
		store.add(wrapper.onSubagentStarted(invalidate));
		store.add(wrapper.onSubagentCompleted(invalidate));
		store.add(wrapper.onSubagentFailed(invalidate));
		store.add(wrapper.onTurnEnd(invalidate));
		store.add(wrapper.onSessionError(invalidate));
		// In-place rewrites of the persisted log.
		store.add(wrapper.onSessionCompactionComplete(invalidate));
		store.add(wrapper.onSessionTruncation(invalidate));
		store.add(wrapper.onSessionSnapshotRewind(invalidate));
	}

	/**
	 * Emits `instructionsCollected` per user message.
	 * Attempts to match local chat's `ComputeAutomaticInstructions`
	 * emitter (`src/vs/workbench/contrib/chat/common/promptSyntax/computeAutomaticInstructions.ts`)
	 */
	private _subscribeForInstructionsCollectedTelemetry(store: DisposableStore = this._store): void {
		const wrapper = this._wrapper;
		const sessionId = this.sessionId;

		store.add(wrapper.onUserMessage(e => {
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

				type AgentHostInstructionsCollectedEvent = IAgentHostEventTelemetry & {
					provider: string;
					agentSessionId: string;
					isSubagentSession: boolean;
					totalInstructionsCount: number;
					agentInstructionsCount: number;
					applyingInstructionsCount: number;
					referencedInstructionsCount: number;
					claudeMdCount: number;
				};
				type AgentHostInstructionsCollectedClassification = IAgentHostEventClassification & {
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
					provider: COPILOT_CLI_AGENT_PROVIDER_ID,
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

	private _publishActivity(source: CopilotActivitySource, activity: string | undefined): void {
		this._activities[source] = activity;
		const effectiveActivity = this._activities.fusion ?? this._activities.command ?? this._activities.localModel ?? this._activities.intent;
		if (effectiveActivity !== this._publishedActivity) {
			this._publishedActivity = effectiveActivity;
			this._emitAction({ type: ActionType.SessionActivityChanged, activity: effectiveActivity });
		}
	}

	private _clearActivity(): void {
		this._activities.intent = undefined;
		this._activities.command = undefined;
		this._activities.localModel = undefined;
		this._publishActivity('fusion', undefined);
	}

	/**
	 * Publishes plugin preparation as chat activity, like worktree creation
	 * progress. The progress row of a waiting request reads chat activity;
	 * session activity does not reach it. The activity belongs to the waiting
	 * turn: a new turn, admission, a failure, or the end or abort of that turn
	 * clears it, but a late abort or idle from an earlier turn does not.
	 */
	private _setManagedPluginActivity(activity: string | undefined): void {
		this._managedPluginActivity = activity;
		this._publishWaitActivity();
	}

	/**
	 * Shows a launch that waits on slow managed settings as chat activity, in
	 * the same progress row as plugin preparation and worktree creation, so a
	 * turn waiting for its session shows why instead of a separate notification.
	 */
	private _setManagedSettingsActivity(activity: string | undefined): void {
		this._managedSettingsActivity = activity;
		this._publishWaitActivity();
	}

	private _publishWaitActivity(): void {
		const activity = this._managedPluginActivity ?? this._managedSettingsActivity;
		if (activity !== this._publishedWaitActivity) {
			this._publishedWaitActivity = activity;
			this._emitAction({ type: ActionType.ChatActivityChanged, activity });
		}
	}

	/**
	 * Returns the current turn while its message has not been admitted yet.
	 * Plugins required by the organization are prepared before a message is
	 * admitted, but also before custom agent requests that can arrive outside
	 * a turn; only preparation a turn waits on belongs in its transcript.
	 */
	private _getManagedPluginAdmissionTurn(): CopilotTurn | undefined {
		const turn = this._currentTurn.value;
		return turn?.isPending ? turn : undefined;
	}

	/** Shows the plugin preparation message as the waiting turn's activity. */
	private _reportManagedPluginProgress(message: string): void {
		if (this._getManagedPluginAdmissionTurn()) {
			this._setManagedPluginActivity(message);
		}
	}

	/**
	 * Ends the plugin preparation activity and adds the failure to the
	 * waiting turn. The turn continues without the plugins that could not be
	 * prepared. A failure reported while no turn is waiting, for example
	 * after a background policy refresh, is shown when the next message is
	 * admitted, unless that message's own preparation reports a newer one.
	 */
	private _reportManagedPluginFailure(message: string): void {
		this._setManagedPluginActivity(undefined);
		const turn = this._getManagedPluginAdmissionTurn();
		if (!turn) {
			this._unshownManagedPluginFailure = message;
			return;
		}
		this._unshownManagedPluginFailure = undefined;
		this._emitManagedPluginFailure(turn, message);
	}

	/** Shows a plugin preparation failure that was reported while no turn was waiting. */
	private _showUnshownManagedPluginFailure(): void {
		const message = this._unshownManagedPluginFailure;
		const turn = this._getManagedPluginAdmissionTurn();
		if (message === undefined || !turn) {
			return;
		}
		this._unshownManagedPluginFailure = undefined;
		this._emitManagedPluginFailure(turn, message);
	}

	private _emitManagedPluginFailure(turn: CopilotTurn, message: string): void {
		// The failure belongs to the turn waiting for admission, not to a late
		// event of an aborted turn, so it must not be dropped after an abort.
		this._emitAction({
			type: ActionType.ChatResponsePart,
			turnId: turn.id,
			part: {
				kind: ResponsePartKind.SystemNotification,
				content: message,
				_meta: toAgentSystemNotificationMeta({
					kind: AgentSystemNotificationKind.ManagedPluginPreparationFailure,
					severity: AgentSystemNotificationSeverity.Warning,
				}),
			},
		}, undefined, true);
	}

	private _emitFusionProgress(update: ICopilotFusionProgressUpdate, trustedRootTurn = false): void {
		const turn = this._currentTurn.value;
		if (!turn) {
			return;
		}
		if (update.part) {
			this._beginToolCallRound(undefined);
			this._emitAction({ type: ActionType.ChatResponsePart, turnId: turn.id, part: update.part }, undefined, trustedRootTurn);
		}
		if (update.phase) {
			const { toolCall, isNew, presentation } = update.phase;
			if (isNew && !this._dropLateRootTurnEvents) {
				this._fusionPhases.set(toolCall.toolCallId, { label: toolCall.displayName, presentation });
			}
		}
		if (update.phase?.presentation === 'childChat') {
			const { toolCall, isNew } = update.phase;
			if (isNew) {
				this._beginToolCallRound(undefined);
				this._emitAction({
					type: ActionType.ChatToolCallStart, turnId: turn.id, toolCallId: toolCall.toolCallId,
					toolName: toolCall.toolName, displayName: toolCall.displayName, _meta: toolCall._meta,
				}, undefined, trustedRootTurn);
			}
			// A terminal event can be the first observation of a phase. It still
			// needs to enter Running before Complete; repeat Ready refreshes live metadata.
			if (isNew || toolCall.status === ToolCallStatus.Running) {
				this._emitAction({
					type: ActionType.ChatToolCallReady, turnId: turn.id, toolCallId: toolCall.toolCallId,
					invocationMessage: toolCall.invocationMessage, confirmed: ToolCallConfirmationReason.NotNeeded,
					_meta: toolCall._meta,
				}, undefined, trustedRootTurn);
			}
			if (toolCall.status === ToolCallStatus.Completed) {
				this._emitAction({
					type: ActionType.ChatToolCallComplete, turnId: turn.id, toolCallId: toolCall.toolCallId,
					result: { success: toolCall.success, pastTenseMessage: toolCall.pastTenseMessage, content: toolCall.content },
					_meta: toolCall._meta,
				}, undefined, trustedRootTurn);
			}
		}
		this._publishActivity('fusion', update.activity);
	}

	private _recordHostSdkTurn(sdkTurnId: string, hostTurnId: string): void {
		const previous = this._hostTurnIdsBySdkTurnId.get(sdkTurnId);
		if (previous !== undefined && previous !== hostTurnId) {
			this._reassignedFusionSdkTurnIds.add(sdkTurnId);
		}
		this._hostTurnIdsBySdkTurnId.set(sdkTurnId, hostTurnId);
		for (const event of this._pendingFusionEvents.splice(0)) {
			this._acceptFusionEvent(event);
		}
	}

	private _clearPendingFusionEvents(): void {
		for (const event of this._pendingFusionEvents) {
			// Abandoned correlations must not be revived by a later request's SDK mapping.
			this._fusionEventTurnIds.set(getFusionEventKey(event), this._turnId);
		}
		this._pendingFusionEvents.length = 0;
	}

	private _clearProvisionalFusionState(): void {
		this._provisionalFusionToolStarts.clear();
		this._surfacedProvisionalFusionToolCallIds.clear();
		this._shownProvisionalFusionMessageIds.clear();
		this._provisionalFusionTaskSummaries.clear();
		this._pendingFusionMessageChunks.clear();
		this._provisionalInlineFusionMessageChunks.clear();
	}

	private _openFusionPhaseChat(toolCallId: string, label: string): void {
		if (this._fusionPhaseChats.has(toolCallId)) {
			return;
		}
		this._fusionPhaseChats.add(toolCallId);
		// Reopening supersedes a close still waiting on its drain.
		this._pendingFusionPhaseChatCloses.delete(toolCallId);
		// Usually opened after the phase tile completed, so the host's Subagent discovery block is rejected; clients follow the chat catalog, and restore links it.
		this._emitProgress({
			kind: 'subagent_started',
			chat: this._chatChannelUri,
			toolCallId,
			agentName: COPILOT_FUSION_PHASE_AGENT_NAME,
			agentDisplayName: label,
			taskDescription: label,
			subagentKind: 'fusionPhase',
			model: this._fusionProgress.getPhaseModel(toolCallId),
		});
	}

	/** Cancellation closes these chats as cancelled, so an abort only drops local routing. */
	private _forgetFusionPhaseChats(): void {
		this._fusionPhases.clear();
		this._fusionPhaseChats.clear();
		this._pendingFusionPhaseChatCloses.clear();
	}

	private _completeFusionPhaseChats(): void {
		if (this._fusionPhaseChats.size === 0) {
			return;
		}
		const toolCallIds = [...this._fusionPhaseChats];
		this._fusionPhaseChats.clear();
		const generation = ++this._fusionPhaseChatCloseGeneration;
		for (const toolCallId of toolCallIds) {
			this._pendingFusionPhaseChatCloses.set(toolCallId, generation);
		}
		const complete = () => {
			if (this._store.isDisposed) {
				return;
			}
			for (const toolCallId of toolCallIds) {
				// Only the latest close for a chat may fire; a reopen or a newer close has taken over.
				if (this._pendingFusionPhaseChatCloses.get(toolCallId) !== generation) {
					continue;
				}
				this._pendingFusionPhaseChatCloses.delete(toolCallId);
				this._emitProgress({ kind: 'subagent_completed', chat: this._chatChannelUri, toolCallId });
			}
		};
		// File-edit completions settle asynchronously and must land before their phase chat closes.
		const turn = this._currentTurn.value;
		if (turn?.hasPendingToolCompletions) {
			void turn.drainToolCompletions().then(complete, complete);
		} else {
			complete();
		}
	}

	/**
	 * Promotes a held-back provisional Fusion tool start into the transcript
	 * because the user or the client has to act on it. Returns false when
	 * the tool call is not a held-back provisional start.
	 */
	private _surfaceProvisionalFusionToolCall(toolCallId: string, synthesized = false): boolean {
		const start = this._provisionalFusionToolStarts.get(toolCallId);
		if (!start || this._activeToolCalls.has(toolCallId) || !this._surfaceProvisionalFusionToolStart) {
			return false;
		}
		this._provisionalFusionToolStarts.delete(toolCallId);
		this._surfacedProvisionalFusionToolCallIds.add(toolCallId);
		this._logService.info(synthesized
			? `[Copilot:${this.sessionId}] Surfacing client tool whose start Fusion staged: ${toolCallId} (${start.data.toolName})`
			: `[Copilot:${this.sessionId}] Surfacing provisional Fusion tool call: ${toolCallId}`);
		this._surfaceProvisionalFusionToolStart(start);
		return true;
	}

	/**
	 * A client tool only runs once the client sees its start. Fusion stages the
	 * phase's `tool.execution_start` until commit, so without this the SDK
	 * handler, the client, and the runtime all wait on each other.
	 */
	private _surfaceUnobservedClientToolStart(invocation: ToolInvocation): void {
		const { toolCallId } = invocation;
		if (this._activeToolCalls.has(toolCallId) || this._surfaceProvisionalFusionToolCall(toolCallId) || this._fusionProgress.runningPhaseToolCallId === undefined) {
			return;
		}
		const args = invocation.arguments;
		this._provisionalFusionToolStarts.set(toolCallId, {
			type: 'tool.execution_start',
			id: generateUuid(),
			timestamp: new Date().toISOString(),
			parentId: null,
			ephemeral: true,
			data: { toolCallId, toolName: invocation.toolName, ...(isObject(args) ? { arguments: args as JsonValue } : {}) },
		});
		this._surfaceProvisionalFusionToolCall(toolCallId, true);
	}

	private _cancelFusionEvents(turnId = this._turnId): void {
		this._requiresFusionEventOwnership = true;
		if (turnId === this._turnId) {
			this._fusionTurnCancelled = true;
			this._hasFusionRootTurnBoundary = false;
			this._clearPendingFusionEvents();
		}
	}

	private _bufferFusionEvent(event: CopilotFusionEvent): void {
		if (this._pendingFusionEvents.length >= 256) {
			this._logService.trace(`[Copilot:${this.sessionId}] Fusion ownership buffer full; dropping ${event.type}`);
			return;
		}
		// Keep progress metadata, never private model output or provider error details.
		if (event.type === 'assistant.fusion_phase_completed') {
			this._pendingFusionEvents.push({
				...event,
				data: { ...event.data, content: '', verdict: event.data.verdict === 'accept' || event.data.verdict === 'reject' ? event.data.verdict : null },
			});
		} else if (event.type === 'assistant.fusion_phase_failed') {
			this._pendingFusionEvents.push({ ...event, data: { ...event.data, errorMessage: undefined } });
		} else {
			this._pendingFusionEvents.push(event);
		}
	}

	private _acceptFusionEvent(event: CopilotFusionEvent): void {
		const turn = this._currentTurn.value;
		if (!turn || event.agentId || this._fusionTurnCancelled) {
			return;
		}
		const key = getFusionEventKey(event);
		const sdkTurnId = getFusionEventSdkTurnId(event);
		let ownerTurnId = this._fusionEventTurnIds.get(key);
		if (ownerTurnId === undefined && sdkTurnId) {
			if (this._reassignedFusionSdkTurnIds.has(sdkTurnId)) {
				this._logService.trace(`[Copilot:${this.sessionId}] Ignoring Fusion event with ambiguous SDK turn ownership: ${event.type}`);
				return;
			}
			ownerTurnId = this._hostTurnIdsBySdkTurnId.get(sdkTurnId);
		}
		// Routing has no SDK turn ID: only a start observed after the root boundary may claim a new attempt.
		if (ownerTurnId === undefined && event.type === 'session.fusion_route_started' && this._hasFusionRootTurnBoundary) {
			ownerTurnId = turn.id;
		}
		if (ownerTurnId === undefined && this._requiresFusionEventOwnership) {
			if (sdkTurnId || this._pendingFusionEvents.some(pending => getFusionEventKey(pending) === key)) {
				this._bufferFusionEvent(event);
			} else {
				this._logService.trace(`[Copilot:${this.sessionId}] Ignoring Fusion event without request ownership after cancellation: ${event.type}`);
			}
			return;
		}
		this._fusionEventTurnIds.set(key, ownerTurnId ?? turn.id);
		if (ownerTurnId !== undefined && ownerTurnId !== turn.id) {
			this._logService.trace(`[Copilot:${this.sessionId}] Ignoring Fusion event for an earlier turn: ${event.type}`);
			return;
		}
		if (this._shouldDropLateRootTurnEvent(event.type, true)) {
			return;
		}
		if (event.type === 'session.fusion_route_started') {
			this._reportSettingExperimentTrigger(AgentHostHydraFusionEnabledSettingId);
		}
		const update = this._fusionProgress.accept(event);
		if (update) {
			this._emitFusionProgress(update);
		}
		if (update?.phase && event.type === 'assistant.fusion_phase_completed' && event.data.conversationScope === 'review') {
			this._emitFusionReviewContent(event.data);
		}
	}

	/** Review phases run as one tool-free model call, so their critique arrives only on completion. */
	private _emitFusionReviewContent(data: SessionEventPayload<'assistant.fusion_phase_completed'>['data']): void {
		const content = formatFusionReviewContent(data.content);
		const parentToolCallId = content !== undefined ? this._fusionPhaseParentToolCallId(undefined, data) : undefined;
		if (content === undefined || parentToolCallId === undefined) {
			return;
		}
		this._emitAction({
			type: ActionType.ChatResponsePart,
			turnId: this._turnId,
			part: { kind: ResponsePartKind.Markdown, id: generateUuid(), content },
		}, parentToolCallId);
	}

	/**
	 * Warns in the active turn that the BYOK proxy dropped tools to stay within
	 * the model's tool limit. The turn continues with the kept tools. The warning
	 * repeats only when the number of dropped tools changes.
	 */
	reportByokToolsCapped(requestedToolCount: number, sentToolCount: number): void {
		const turn = this._currentTurn.value;
		const droppedToolCount = requestedToolCount - sentToolCount;
		if (!turn || droppedToolCount <= 0 || droppedToolCount === this._reportedByokDroppedToolCount) {
			return;
		}
		this._reportedByokDroppedToolCount = droppedToolCount;
		// Later parent reasoning belongs after this notice.
		turn.reasoningPartIds.delete('');
		this._emitAction({
			type: ActionType.ChatResponsePart,
			turnId: turn.id,
			part: {
				kind: ResponsePartKind.SystemNotification,
				content: localize(
					'agentHost.byokToolLimitExceeded',
					"The model only supports {0} tools, {1} tools were not provided to the model.",
					sentToolCount,
					droppedToolCount,
				),
				_meta: toAgentSystemNotificationMeta({
					kind: AgentSystemNotificationKind.ByokToolLimitExceeded,
					severity: AgentSystemNotificationSeverity.Warning,
				}),
			},
		});
	}

	/** `session.start`/`session.resume` fire before this session subscribes. A result superseded by a later model change resolves as unknown. */
	private _readCommittedAutoTier(wrapper: CopilotSessionWrapper): void {
		const result = new DeferredPromise<string | undefined>();
		const read = result.p;
		this._committedAutoTier = read;
		void (async () => {
			let tier: string | undefined;
			try {
				const current = await raceTimeout(wrapper.session.rpc.model.getCurrent(), AUTO_TIER_READ_TIMEOUT);
				tier = current && this._committedAutoTier === read && this._wrapper === wrapper ? getCommittedAutoTier(current.modelId, current.autoTier) : undefined;
			} catch (error) {
				this._logService.trace(`[Copilot:${this.sessionId}] Failed to read the committed Auto tier: ${getErrorMessage(error)}`);
			}
			if (this._committedAutoTier === read) {
				this._committedAutoTier = tier;
			}
			await result.complete(tier);
		})();
	}

	private _subscribeToSdkEvents(store: DisposableStore = this._store): void {
		const wrapper = this._wrapper;
		const sessionId = this.sessionId;

		store.add(wrapper.onEvent(event => {
			const ownerTurnId = event.type === 'session.fusion_resolved' ? this._fusionEventTurnIds.get(getFusionEventKey(event)) : undefined;
			this._fusionRequestCorrelation.observe(event, ownerTurnId !== undefined && ownerTurnId !== this._turnId);
		}));
		store.add(wrapper.onFusionEvent(event => this._acceptFusionEvent(event)));

		store.add(wrapper.onUnhandledEvent(e => {
			if (e.type === 'session.binary_asset') {
				this._logService.trace(`[Copilot:${sessionId}] Binary asset received: ${e.data.mimeType}, ${e.data.byteLength} bytes`);
				return;
			}
			// Fusion handoffs/internal events can contain model-visible prompts,
			// including event types not yet represented in the SDK union.
			const loggedEvent = e.type.startsWith('session.fusion_') || e.type.startsWith('assistant.fusion_')
				? { type: e.type, id: e.id, timestamp: e.timestamp, parentId: e.parentId, ephemeral: e.ephemeral, agentId: e.agentId }
				: e;
			this._logService.trace(`[Copilot:${sessionId}] Unhandled SDK event: ${safeStringify(loggedEvent)}`);
		}));

		store.add(wrapper.onIndexedSearch(e => {
			const data = e.data.kind === 'startup' || e.data.kind === 'server_error'
				? (({ errorMessage: _, ...data }) => data)(e.data)
				: e.data;
			this._logService.trace(`[Copilot:${sessionId}] session.indexed_search: ${safeStringify(data)}`);
		}));

		store.add(wrapper.onExtensionsLoaded(e => {
			if (wrapper.canvasRuntimeEnabled) {
				this._canvasExtensions = e.data.extensions;
				if (this._canvasPhase !== 'released') {
					this._invalidateCanvasRegistrySnapshot();
					this._markCanvasProjectionLive();
					this._publishSettledCanvasRegistry();
				}
			}
		}));

		store.add(wrapper.onCanvasRegistryChanged(() => {
			if (wrapper.canvasRuntimeEnabled && this._canvasPhase !== 'released') {
				this._invalidateCanvasRegistrySnapshot();
				this._markCanvasProjectionLive();
				this._publishCanvases();
			}
		}));

		store.add(wrapper.onUserMessage(e => {
			if (!e.agentId) {
				this._ignoredRestoredCanvasInstanceIds.clear();
			}
		}));

		// Only first opens emit recorded; opened also includes provider rehydration.
		store.add(wrapper.onCanvasRecorded(e => {
			if (!wrapper.canvasRuntimeEnabled || e.agentId) {
				return;
			}
			this._telemetryReporter.canvasOpened(
				'copilotcli',
				this._ownerSessionUri.toString(),
				this._canvasExtensions?.find(extension => extension.id === e.data.extensionId)?.source,
				this._currentTurn.value?.clientContext,
			);
		}));

		store.add(wrapper.onCanvasOpened(e => {
			if (!this._projectsCanvasEvent(wrapper, e.agentId)) {
				return;
			}
			const projected = this._canvasByInstanceId.has(e.data.instanceId);
			if (!projected && (this._canvasPhase !== 'live' || this._ignoredRestoredCanvasInstanceIds.has(e.data.instanceId))) {
				return;
			}
			this._projectOpenedCanvas(e.data);
		}));

		store.add(wrapper.onCanvasClosed(e => {
			if (this._projectsCanvasEvent(wrapper, e.agentId)) {
				this._handleCanvasClosed(wrapper, e.data.instanceId);
			}
		}));

		store.add(wrapper.onCanvasUnavailable(e => {
			if (!this._projectsCanvasEvent(wrapper, e.agentId)) {
				return;
			}
			const projection = this._canvasByInstanceId.get(e.data.instanceId);
			if (!projection) {
				return;
			}
			const { url, ...canvas } = projection.canvas;
			const unavailable: ICopilotCanvasProjection = { resource: projection.resource, canvas };
			this._canvasByInstanceId.set(canvas.instanceId, unavailable);
			if (url !== undefined) {
				this._publishCanvasState(unavailable);
			}
		}));

		store.add(wrapper.onSessionStart(e => {
			this._logService.trace(`[Copilot:${sessionId}] Session started: model=${e.data.selectedModel ?? 'default'}, producer=${e.data.producer}`);
		}));

		store.add(wrapper.onSessionResume(e => {
			this._logService.trace(`[Copilot:${sessionId}] Session resumed: eventCount=${e.data.eventCount}`);
		}));

		store.add(wrapper.onSessionInfo(e => {
			const attributes: Record<string, OtelAttributeValue> = { infoType: e.data.infoType };
			if (e.data.tip) {
				attributes.tip = e.data.tip;
			}
			const message = `[Copilot:${sessionId}] [${e.data.infoType}]: ${e.data.message}`;
			const otelData = new OtelData(attributes);
			if (e.data.infoType === 'mcp' || e.data.infoType === MANAGED_PLUGINS_EVENT_TYPE) {
				this._logService.info(message, otelData);
			} else {
				this._logService.trace(message, otelData);
			}
			if (e.data.infoType === MANAGED_PLUGINS_EVENT_TYPE && !e.agentId) {
				this._reportManagedPluginProgress(e.data.message);
			}
			if (e.data.infoType === MANAGED_PLUGINS_COMPLETE_EVENT_TYPE && !e.agentId) {
				this._unshownManagedPluginFailure = undefined;
			}
		}));

		store.add(wrapper.onSessionWarning(e => {
			this._logService.warn(`[Copilot:${sessionId}] ${e.data.message}`, new OtelData({ warningType: e.data.warningType }));
			if (e.data.warningType === MANAGED_PLUGINS_EVENT_TYPE && !e.agentId) {
				this._reportManagedPluginFailure(e.data.message);
			}
		}));

		store.add(wrapper.onSessionModelChange(e => {
			this._logService.trace(`[Copilot:${sessionId}] Model changed: ${e.data.previousModel ?? '(none)'} -> ${e.data.newModel}`);
			const committedAutoTier = getCommittedAutoTier(e.data.newModel, e.data.autoTier);
			// The runtime omits `autoTier` on Auto-to-Auto changes that keep its committed preference.
			const keepsAutoTier = e.data.autoTier === undefined && isAutoModel(e.data.previousModel) && isAutoModel(e.data.newModel);
			if (e.agentId) {
				const parentToolCallId = this._parentToolCallIdForSubagentEvent(e);
				if (parentToolCallId) {
					if (e.data.previousModel !== e.data.newModel) {
						this._autoModeResolvedByToolCallId.delete(parentToolCallId);
					}
					if (committedAutoTier) {
						this._committedAutoTierBySubagentToolCallId.set(parentToolCallId, committedAutoTier);
					} else if (!keepsAutoTier) {
						this._committedAutoTierBySubagentToolCallId.delete(parentToolCallId);
					}
					this._updateSubagentModel(parentToolCallId, e.data.newModel);
				}
			} else {
				if (!keepsAutoTier) {
					if (e.data.autoTier === undefined && isAutoModel(e.data.newModel)) {
						this._readCommittedAutoTier(wrapper);
					} else {
						this._committedAutoTier = committedAutoTier;
					}
				}
				this._promptCacheRefreshGeneration++;
				if (e.data.previousModel !== e.data.newModel) {
					this._setPromptCacheState(undefined);
				}
				void this._refreshSessionUsageMetrics();
				this.refreshModelConfiguration();
			}
		}));

		store.add(wrapper.onManagedSettingsResolved(e => {
			if (!e.agentId) {
				void this._managedSettingsResolved.complete();
				this.refreshModelConfiguration();
			}
			this._logService.info(`[Copilot:${sessionId}] Managed settings resolved: source=${e.data.source}, managedKeys=${e.data.managedKeys.join(',') || '(none)'}, bypassPermissionsDisabled=${e.data.bypassPermissionsDisabled}, failClosed=${e.data.failClosed}`);
		}));

		store.add(wrapper.onManagedSettingsEnforced(e => {
			this._logService.warn(`[Copilot:${sessionId}] Managed settings enforced: action=${e.data.action}, setting=${e.data.setting}, escalation=${e.data.escalation ?? '(none)'}, failClosed=${e.data.failClosed}, message=${e.data.message}`);
		}));

		store.add(wrapper.onSessionHandoff(e => {
			this._logService.trace(`[Copilot:${sessionId}] Session handoff: sourceType=${e.data.sourceType}, remoteSessionId=${e.data.remoteSessionId ?? '(none)'}`);
		}));

		store.add(wrapper.onSessionTruncation(e => {
			this._logService.trace(`[Copilot:${sessionId}] Session truncation: removed ${e.data.tokensRemovedDuringTruncation} tokens, ${e.data.messagesRemovedDuringTruncation} messages`);
		}));

		store.add(wrapper.onSessionSnapshotRewind(e => {
			this._logService.trace(`[Copilot:${sessionId}] Snapshot rewind: upTo=${e.data.upToEventId}, eventsRemoved=${e.data.eventsRemoved}`);
		}));

		store.add(wrapper.onSessionShutdown(e => {
			this._logService.trace(`[Copilot:${sessionId}] Session shutdown: type=${e.data.shutdownType}, apiDuration=${e.data.totalApiDurationMs}ms`);
		}));

		store.add(wrapper.onSessionUsageInfo(e => {
			this._logService.trace(`[Copilot:${sessionId}] Usage info: ${e.data.currentTokens}/${e.data.tokenLimit} tokens, ${e.data.messagesLength} messages`);
		}));

		store.add(wrapper.onSessionCompactionStart(() => {
			this._logService.trace(`[Copilot:${sessionId}] Compaction started`);
		}));

		store.add(wrapper.onSessionCompactionComplete(e => {
			this._logService.trace(`[Copilot:${sessionId}] Compaction complete: success=${e.data.success}, tokensRemoved=${e.data.tokensRemoved ?? '?'}`);
		}));

		store.add(wrapper.onUserMessage(e => {
			this._logService.trace(`[Copilot:${sessionId}] User message: ${e.data.content.length} chars, ${e.data.attachments?.length ?? 0} attachments`);
			// Restricted `conversation.messageText` (source=user): the raw user prompt text. Emit only
			// for genuine human prompts on the main agent — skip subagent turns (driven by the parent)
			// and SDK-injected synthetic messages (skill/harness injections carry a non-`user` source,
			// matching `isSyntheticUserMessage`) and provider-initiated root requests so generated
			// extension prompts are not reported as the user's text.
			if (!e.agentId && !this._currentTurn.value?.providerInitiated && (!e.data.source || e.data.source.toLowerCase() === 'user')) {
				void this._telemetryReporter.userMessageText(this.resourceUri.toString(), this._chatChannelUri.toString(), this._currentTurn.value?.clientType ?? AgentHostClientType.Unknown, e.data.content, this._turnOrdinal).catch(err => this._logService.trace(`[Copilot:${this.sessionId}] Telemetry emission failed: ${getErrorMessage(err)}`));
			}
		}));

		store.add(wrapper.onPendingMessagesModified(() => {
			this._logService.trace(`[Copilot:${sessionId}] Pending messages modified`);
		}));

		store.add(wrapper.onBackgroundTasksChanged(() => {
			this._refreshBackgroundTasks();
		}));

		store.add(wrapper.onTurnStart(e => {
			if (e.agentId) {
				this._subagentActivityRevisions.set(e.agentId, (this._subagentActivityRevisions.get(e.agentId) ?? 0) + 1);
				this._pendingSubagentLifecycleCompletions.delete(e.agentId);
				this._subagentTaskCompletionSchedulers.deleteAndDispose(e.agentId);
			}
			const turn = this._currentTurn.value;
			turn?.markProviderTurnStarted();
			turn?.markRunning();
			if (!e.agentId) {
				this._dropLateRootTurnEvents = false;
				// The SDK starts the next turn only after it has emitted the failed
				// execution's idle, so any idle from here on belongs to this turn.
				this._failedExecutionIdlePending = false;
				if (this._resumingTurnAwaitingProviderStart === turn) {
					this._resumingTurnAwaitingProviderStart = undefined;
				}
				// Continuations have no user-message echo to end plugin preparation.
				this._setManagedPluginActivity(undefined);
			}
			this._logService.trace(`[Copilot:${sessionId}] Turn started: ${e.data.turnId}`);
			this._resumeSubagentForEvent(e);
			if (!e.agentId) {
				if (this._currentTurn.value) {
					// Runtime assignments can override the enablement default. Include both
					// setting experiments without excluding unavailable-model treatments.
					this._reportSettingExperimentTrigger(AgentHostCopilotExecutionSubagentEnabledSettingId);
					this._reportSettingExperimentTrigger(AgentHostCopilotExecutionSubagentModelSettingId);
					this._currentTurn.value.activeSdkTurnId = e.data.turnId;
					this._currentTurn.value.sdkTurnIds.add(e.data.turnId);
					this._hasFusionRootTurnBoundary = true;
					this._recordHostSdkTurn(e.data.turnId, this._currentTurn.value.id);
					if (e.data.interactionId) {
						this._currentTurn.value.interactionIds.add(e.data.interactionId);
					}
				}
				this._onSteeringReady?.(this);
				const telemetryMessageId = this._currentTurn.value?.id ?? e.data.turnId;
				if (this._activeRepoInfoTurn?.telemetryMessageId === telemetryMessageId) {
					return;
				}
				this._cancelActiveRepoInfoTelemetry();
				const turn: NonNullable<CopilotAgentSession['_activeRepoInfoTurn']> = {
					telemetryMessageId,
					githubToken: this._currentGitHubToken,
					cancelled: false,
					begin: Promise.resolve(undefined),
				};
				const isCurrent = () => !turn.cancelled && turn.githubToken !== undefined && this._isGitHubTokenCurrent(turn.githubToken);
				turn.begin = this._beginRepoInfoTelemetry(telemetryMessageId, this._currentTurn.value?.clientType ?? AgentHostClientType.Unknown, turn.githubToken, isCurrent);
				this._activeRepoInfoTurn = turn;
			}
		}));

		store.add(wrapper.onModelCallFinished(e => {
			this._emitModelCallFinished(e);
		}));

		store.add(wrapper.onIntent(e => {
			this._logService.trace(`[Copilot:${sessionId}] Intent: ${e.data.intent}`);
			this._publishActivity('intent', e.data.intent || undefined);
		}));

		store.add(wrapper.onReasoning(e => {
			this._logService.trace(`[Copilot:${sessionId}] Reasoning: ${e.data.content.length} chars`);
		}));

		store.add(wrapper.onTurnEnd(e => {
			this._logService.trace(`[Copilot:${sessionId}] Turn ended: ${e.data.turnId}`);
			if (e.agentId) {
				this._refreshBackgroundTasks();
			}
			const turn = this._currentTurn.value;
			if (!e.agentId && turn?.imageGenerationSdkTurnId !== undefined && turn.imageGenerationSdkTurnId === e.data.turnId) {
				turn.imageGenerationSdkTurnId = undefined;
				this._emitAction({
					type: ActionType.ChatResponsePart,
					turnId: turn.id,
					part: {
						kind: ResponsePartKind.SystemNotification,
						content: '',
						_meta: toAgentSystemNotificationMeta({ kind: AgentSystemNotificationKind.ResponseRoundEnded }),
					},
				});
			}
			if (!e.agentId && turn?.activeSdkTurnId === e.data.turnId) {
				turn.activeSdkTurnId = undefined;
			}
		}));

		store.add(wrapper.onAbort(e => {
			this._logService.trace(`[Copilot:${sessionId}] Aborted: ${e.data.reason}`);
			if (!e.agentId) {
				this._cancelFusionEvents();
				const update = this._fusionProgress.interrupt(e.timestamp);
				this._clearActivity();
				if (!this._abortingTurn || this._abortingTurn === this._currentTurn.value) {
					this._setManagedPluginActivity(undefined);
				}
				if (update) {
					this._emitFusionProgress(update, true);
				}
				this._forgetFusionPhaseChats();
			}
			this._cancelActiveRepoInfoTelemetry();
			const turn = this._currentTurn.value;
			if (turn?.isRunning) {
				this._reportToolCallDetails(turn, 'cancelled');
			}
		}));

		store.add(wrapper.onToolUserRequested(e => {
			this._logService.trace(`[Copilot:${sessionId}] Tool user-requested: ${e.data.toolName} (${e.data.toolCallId})`);
		}));

		const appendShellOutput = (toolCallId: string, append: () => { uri: string; created: boolean } | undefined) => {
			const tracked = this._activeToolCalls.get(toolCallId);
			if (!tracked) {
				// A command that keeps running after its tool call returned still streams into that call's terminal.
				if (this._nonPtyShellTerminals.isStreamingInBackground(toolCallId)) {
					append();
				}
				return;
			}
			if (!isShellTool(tracked.toolName)) {
				return;
			}
			if (this._shellManager?.getTerminalUriForToolCall(toolCallId)) {
				// Client-hosted pty shell — its terminal channel streams live output itself.
				return;
			}
			const appended = append();
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
					toolCallId,
					content: tracked.content,
				}, tracked.parentToolCallId);
			}
		};

		store.add(wrapper.onToolPartialResult(e => {
			this._logService.trace(`[Copilot:${sessionId}] Tool partial result: ${e.data.toolCallId} (${e.data.partialOutput.length} chars)`);
			appendShellOutput(e.data.toolCallId, () => this._nonPtyShellTerminals.append(e.data.toolCallId, e.data.partialOutput));
		}));

		store.add(wrapper.onToolShellOutput(e => {
			this._logService.trace(`[Copilot:${sessionId}] Tool shell output: ${e.data.toolCallId} #${e.data.sequence} (${e.data.text.length} chars)`);
			appendShellOutput(e.data.toolCallId, () => this._nonPtyShellTerminals.appendChunk(e.data.toolCallId, e.data));
		}));

		store.add(wrapper.onToolProgress(e => {
			this._logService.trace(`[Copilot:${sessionId}] Tool progress: ${e.data.toolCallId} - ${e.data.progressMessage}`);
			const tracked = this._activeToolCalls.get(e.data.toolCallId);
			if (tracked?.toolName !== CopilotToolName.ImageGeneration) {
				return;
			}
			const imageGeneration = getSdkImageGenerationMetadata(e.data);
			if (!imageGeneration) {
				return;
			}
			const parentToolCallId = tracked.parentToolCallId ?? this._parentToolCallIdForSubagentEvent(e);
			if (!parentToolCallId && e.agentId) {
				this._logService.warn(`[Copilot:${sessionId}] Dropping image progress for unknown subagent agentId=${e.agentId}`);
				return;
			}
			tracked.meta = { ...tracked.meta, progressMessage: e.data.progressMessage, [imageGenerationToolMetaKey]: imageGeneration };
			this._emitPendingImageReady(tracked);
			this._emitAction({
				type: ActionType.ChatToolCallContentChanged,
				turnId: tracked.turnId,
				toolCallId: e.data.toolCallId,
				content: tracked.content,
				_meta: toToolCallMeta(tracked.meta),
			}, parentToolCallId);
		}));

		store.add(wrapper.onSkillInvoked(e => {
			this._logService.trace(`[Copilot:${sessionId}] Skill invoked: ${e.data.name} (${e.data.path})`);
		}));

		store.add(wrapper.onSubagentStarted(e => {
			this._logService.trace(`[Copilot:${sessionId}] Subagent started: ${e.data.agentName} (${e.data.agentDisplayName})`);
		}));

		store.add(wrapper.onSubagentCompleted(e => {
			this._seedSubagentDisplayNames([e]);
			this._logService.trace(`[Copilot:${sessionId}] Subagent completed: ${e.data.agentName}`);
		}));

		store.add(wrapper.onSubagentFailed(e => {
			this._seedSubagentDisplayNames([e]);
			this._logService.error(`[Copilot:${sessionId}] Subagent failed: ${e.data.agentName} - ${e.data.error}`);
		}));

		store.add(wrapper.onSubagentSelected(e => {
			this._logService.trace(`[Copilot:${sessionId}] Subagent selected: ${e.data.agentName}`);
		}));

		store.add(wrapper.onHookStart(e => {
			this._logService.trace(`[Copilot:${sessionId}] Hook started: ${e.data.hookType} (${e.data.hookInvocationId})`);
		}));

		store.add(wrapper.onHookEnd(e => {
			this._logService.trace(`[Copilot:${sessionId}] Hook ended: ${e.data.hookType} (${e.data.hookInvocationId}), success=${e.data.success}`);
		}));

		store.add(wrapper.onSystemMessage(e => {
			this._logService.trace(`[Copilot:${sessionId}] System message [${e.data.role}]: ${e.data.content.length} chars`);
		}));
	}

	// ---- SDK event ID tracking & truncation ---------------------------------

	/** Holds a database reference until the operation settles, independently of session disposal. */
	private async _withDatabase<T>(operation: (db: ISessionDatabase) => Promise<T>): Promise<T> {
		const ref = this._sessionDataService.openDatabase(this._storageUri);
		try {
			return await operation(ref.object);
		} finally {
			ref.dispose();
		}
	}

	/**
	 * Returns the SDK event ID for the turn inserted after the given turn,
	 * or `undefined` if it's the last turn.
	 */
	getNextTurnEventId(turnId: string): Promise<string | undefined> {
		return this._withDatabase(db => db.getNextTurnEventId(turnId));
	}

	/**
	 * Resolves the exclusive SDK event boundary for a fork after {@link turnId}.
	 */
	async getForkBoundaryEventId(turnId: string): Promise<string | undefined> {
		const activeTurn = this._currentTurn.value;
		const activeTurnId = activeTurn?.id;
		const activeTurnEventId = activeTurnId !== turnId ? activeTurn?.eventId : undefined;
		const persistedEventId = await this.getNextTurnEventId(turnId);
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
		return this._withDatabase(db => db.getTurnEventId(turnId));
	}

	/**
	 * Returns the SDK event ID of the earliest turn.
	 */
	getFirstTurnEventId(): Promise<string | undefined> {
		return this._withDatabase(db => db.getFirstTurnEventId());
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
		const result = await this._awaitControlPlaneRpc('rpc.history.truncate', this._wrapper.session.rpc.history.truncate({ eventId }));
		this._logService.info(`[Copilot:${this.sessionId}] SDK truncation removed ${result.eventsRemoved} events`);

		// Clean up stale turns from our DB so getNextTurnEventId doesn't
		// return event IDs for turns that no longer exist in the SDK.
		if (keepTurnId) {
			await this._withDatabase(db => db.deleteTurnsAfter(keepTurnId));
		} else {
			await this._withDatabase(db => db.deleteAllTurns());
		}
	}

	/**
	 * Bulk-remaps turn IDs in this session's database.
	 * Used after file-copying a source session's database for a fork.
	 */
	async remapTurnIds(mapping: ReadonlyMap<string, string>): Promise<void> {
		await this._withDatabase(db => db.remapTurnIds(mapping));
	}

	// ---- cleanup ------------------------------------------------------------

	/**
	 * Cancels every pending interaction for abort and dispose. This completes synchronously before any awaiter resumes, so ordering is not significant.
	 */
	private _cancelAllPendingInteractions(): void {
		this._denyPendingPermissions();
		this._cancelPendingUserInputs();
		this._cancelPendingElicitations();
		this._computerUseSetup?.()?.cancelChat(this._computerUseSetupChat);
		this._computerUseActivation.cancel();
		this._cancelPendingPlanReviews();
		this._cancelPendingMcpAuthRequests();
		this._cancelPendingMcpSamplings();
		this._cancelPendingClientToolCalls();
	}

	private _denyPendingPermissions(): void {
		for (const [toolCallId] of this._pendingPermissions.entries()) {
			this._deletePendingEditContent(toolCallId);
		}
		this._pendingPermissions.denyAll({ kind: 'decision', result: { kind: 'reject' }, source: 'unattended_fallback' });
		this._sandbox.clearPendingRequests();
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
			this._wrapper.session.rpc.mcp.cancelSamplingExecution({ requestId }).catch(error => {
				this._logService.warn(`[Copilot:${this.sessionId}] Failed to cancel sampling execution: requestId=${requestId}`, error);
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
