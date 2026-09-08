/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CCAModel } from '@vscode/copilot-api';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import { CancellationError } from '../../../../base/common/errors.js';
import { DeferredPromise, disposableTimeout, Limiter, raceCancellationError, raceTimeout, retry, Sequencer, SequencerByKey } from '../../../../base/common/async.js';
import { fetchResourceMetadata } from '../../../../base/common/oauth.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { type IObservable, observableValue } from '../../../../base/common/observable.js';
import { basename, dirname, isAbsolute, join, normalize, resolve, sep } from '../../../../base/common/path.js';
import { extUriBiasedIgnorePathCase, isEqual } from '../../../../base/common/resources.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { createSchema, platformRootSchema, platformSessionSchema, schemaProperty, AgentHostAutoApprovePolicyRestrictedConfigKey, AgentHostCodexMultiRootEnabledConfigKey, AgentHostGitHubMcpServerEnabledConfigKey, AgentHostMcpServersConfigKey, type ISchemaProperty, type SessionMode } from '../../common/agentHostSchema.js';
import { createPricingMetaFromBilling, normalizeCAPIBilling } from '../../common/agentModelPricing.js';
import { CHATGPT_SUBSCRIPTION_MODEL_SOURCE_ID, createAgentModelGroupMeta, createAgentModelSourceMeta } from '../../common/agentModelSource.js';
import { AgentSystemNotificationKind, toAgentSystemNotificationMeta } from '../../common/meta/agentSystemNotificationMeta.js';
import { AgentHostConfigKey, agentHostCustomizationConfigSchema } from '../../common/agentHostCustomizationConfig.js';
import { AgentSdkSetupChannel } from '../agentSdkSetupChannel.js';
import { CODEX_ACCOUNT_META_KEY, CODEX_ACCOUNT_SIGN_IN_REQUEST_KEY, CODEX_ACCOUNT_SIGN_OUT_REQUEST_KEY, type ICodexAccountInfo } from '../../common/codexAccount.js';
import { getReasoningEffortDescription, getReasoningEffortLabel, resolveDefaultReasoningEffort } from '../../common/reasoningEffort.js';
import { AgentChatMigrationDeferred, type AgentChatMigrationResult, AgentSession, AgentSignal, CODEX_AGENT_PROVIDER_ID, IActiveClient, IAgent, IAgentChatConfigCompletionsParams, IAgentChatContext, IAgentChatDataChange, IAgentChatMetadata, type IAgentChatMetadataOptions, IAgentChats, IAgentCreateChatForkSource, IAgentCreateChatResult, IAgentCreateChatOptions, IAgentDescriptor, IAgentDiscoveredChat, IAgentMaterializeChatEvent, IAgentModelInfo, IAgentResolveChatConfigParams, IAgentSpawnChatEvent, IMcpNotification, resolveAgentChatContext, resolveAgentHostInstructions, type AgentProvider, type AuthenticateParams } from '../../common/agent.js';
import { AgentHostCodexAgentBinaryArgsEnvVar, AgentHostCodexAgentCodexHomeEnvVar, AgentHostCodexAgentSdkRootEnvVar } from '../../common/agentService.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { AHP_AUTH_REQUIRED, ProtocolError } from '../../common/state/sessionProtocol.js';
import { ActionType, isChatAction, type SessionAction, type ChatAction } from '../../common/state/sessionActions.js';
import { parseLeadingSlashCommand } from '../../common/agentHostSlashCommand.js';
import type { ConfigSchema, ModelSelection, ProtectedResourceMetadata, ToolDefinition, AgentSelection } from '../../common/state/protocol/state.js';
import type { ResolveSessionConfigResult, SessionConfigCompletionsResult } from '../../common/state/protocol/commands.js';
import { buildDefaultChatUri, chatStorageUri, createErrorResponsePart, isDefaultChatUri, parseRequiredSessionUriFromChatUri, withSessionWorkspaceless, CustomizationType, type ClientPluginCustomization, type DirectoryCustomization, type ISessionFolderPickerDecision, type McpServerCustomization, type MessageAttachment, type PendingMessage, type ChatInputAnswer, ChatInputResponseKind, type PluginCustomization, type PolicyState, type ToolCallResult, ToolResultContentType, type Turn, ResponsePartKind } from '../../common/state/sessionState.js';
import type { IAgentServerToolHost } from '../../common/agentServerTools.js';
import { ActiveClientToolSet } from '../activeClientState.js';
import { McpCustomizationController } from '../shared/mcpCustomizationController.js';
import { buildCodexMcpReadResult, CodexMcpInventory, codexMcpListToInventory, codexMcpServersFromConfig, codexMcpToolsChanged, codexStartupErrorNeedsAuth, injectCodexMcpAuthTokens, inventoryToSdkServers, normalizeCodexMcpResourceUrl, toCodexMcpServerJson, translateCodexMcpStartupState, type ICodexMcpServerConfigJson } from './codexMcpServers.js';
import { codexHooksToContainers, codexSelectedCapabilityRootCandidates, codexSkillsToContainers, discoverCodexWorkspaceAgents, discoverCodexWorkspaceInstructions, discoverCodexWorkspaceSkills, excludeCodexWorkspaceSkillDuplicates } from './codexCustomizations.js';
import { CodexClientCustomizationStore, codexAgentRoleToml, codexCustomizationConfig, codexMcpServersFromDefinitions, codexMcpServersFromPlugins, codexPluginMcpServerSources, codexSkillCapabilityRoots, codexSkillRootsFromPlugins, parsedPluginChildren, type ICodexClientPlugin } from './codexClientCustomizations.js';
import { IAgentHostCustomizationEnablementService, targetForUnownedMcpServer } from '../agentHostCustomizationEnablementService.js';
import { isCustomizationSdkEligible, resolveCustomizationEnablement, targetForMcpServer } from '../shared/customizationEnablementGate.js';
import { isCustomizationEnabled } from '../../common/customizationEnablement.js';
import { buildElicitationRequest, cancelledElicitationResponse, declinedElicitationResponse, elicitationResponseFromAnswers } from './codexElicitationMapper.js';
import { McpAuthRequiredReason, McpServerStatus, type AhpMcpUiHostCapabilities, type Customization, type McpServerState } from '../../common/state/protocol/channels-session/state.js';
import { IAgentConfigurationService } from '../agentConfigurationService.js';
import { AgentHostClientType } from '../../common/agentHostClientInfo.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../files/common/files.js';
import { McpServerType, type IMcpServerConfiguration } from '../../../mcp/common/mcpPlatformTypes.js';
import { computeFolderPickerDecisionForRoots } from '../shared/folderPickerDecision.js';
import { codexDirectoryHasHooks } from './codexFolderPickerCriteria.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { IAgentPluginManager, type ISyncedCustomization } from '../../common/agentPluginManager.js';
import { parsePlugin } from '../../../agentPlugins/common/pluginParsers.js';
import { SessionMcpDiscovery } from '../shared/sessionMcpDiscovery.js';
import { IAgentHostGitHubEndpointService } from '../agentHostGitHubEndpointService.js';
import { IAgentHostSessionTitleSignal } from '../agentHostSessionTitleSignal.js';
import { IAgentHostProxyResolver } from '../agentHostProxyResolver.js';
import { MODEL_REFRESH_BASE_DELAY_MS, MODEL_REFRESH_MAX_ATTEMPTS, MODEL_REFRESH_MAX_DELAY_MS, modelRefreshBackoff } from '../shared/modelRefreshRetry.js';
import { IAgentHostCheckpointService } from '../../common/agentHostCheckpointService.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { ICopilotApiService } from '../shared/copilotApiService.js';
import { extractForwardedErrorInfo } from '../shared/proxyChatError.js';
import { IAgentHostWorktreeIsolation, type IAgentHostWorktreePendingState } from '../shared/worktreeIsolation.js';
import { getServerToolDisplay } from '../shared/serverToolGroups.js';
import { IAgentSdkDownloader, IAgentSdkPackage } from '../agentSdkDownloader.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { PendingRequestRegistry } from '../../common/pendingRequestRegistry.js';
import { IAgentHostOTelService } from '../../common/otel/agentHostOTelService.js';
import { CodexAppServerClient, JsonRpcError, transportFromChildProcess, type ICodexAppServerClient, type ServerRequestHandlerResult } from './codexAppServerClient.js';
import { ICodexProxyService, type ICodexProxyHandle } from './codexProxyService.js';
import { GITHUB_MCP_SERVER_NAME, resolveGitHubMcpServerConfiguration } from '../shared/githubMcpServer.js';
import { AGENT_MERGE_GITHUB_TOOL_RESTRICTION, getAgentMergeGitHubToolRestriction, isGitHubMcpToolName } from '../shared/agentMergeToolRestrictions.js';
import { createCodexSessionMapState, extractUserInputText, finalizeCodexTurnMapState, mapAgentMessageDelta, mapCommandExecutionOutputDelta, mapFileChangeOutputDelta, mapFileChangePatchUpdated, mapItemCompleted, mapItemStarted, mapMcpToolCallProgress, mapReasoningSummaryPartAdded, mapReasoningSummaryTextDelta, mapReasoningTextDelta, mapTokenUsageModelCallCompleted, mapTokenUsageUpdated, mapTurnCompleted, mapTurnStarted, type ICodexSessionMapState } from './codexMapAppServerEvents.js';
import type { ThreadTokenUsageUpdatedNotification } from './protocol/generated/v2/ThreadTokenUsageUpdatedNotification.js';
import { unwrapShellInvocation } from './codexShellCommand.js';
import { planForkedTurnIdMap, resolveForkBoundary } from './codexForkPlan.js';
import { resolveCodexInput } from './codexPromptResolver.js';
import { buildUserInputRequest, emptyUserInputResponse, userInputResponseFromAnswers } from './codexUserInputMapper.js';
import { replayThreadToTurns } from './codexReplayMapper.js';
import { CodexSessionMetadataStore } from './codexSessionMetadataStore.js';
import { buildCodexLaunchConfig, buildCodexResumeParams } from './codexLaunchConfig.js';
import { codexDelegationDisplayText } from './codexDelegation.js';
import { THREAD_LIST_MAX_PAGES, collectThreadListPages } from './codexThreadList.js';
import { ICodexRolloutMetadata, ICodexRolloutModel, readCodexRolloutMetadata } from './codexRolloutMetadata.js';
import { codexAccountRateLimitFromResponse, codexAccountStateFromResponse, type ICodexAccountState } from './codexAccountState.js';
import { CodexProfileImageStore, fetchCodexProfileImage } from './codexProfileImage.js';
import { CodexSessionConfigKey, CODEX_DEFAULT_PERMISSIONS_PRESET, CODEX_PERMISSIONS_PRESETS, collaborationModeKind, getCodexAutonomousSessionConfig, migrateCodexPermissionValues, narrowAdditionalDirectories, narrowBoolean, narrowPersonality, narrowReasoningEffort, narrowReasoningSummary, narrowWebSearchMode, resolveCodexPermissions, type CodexApprovalPolicy, type CodexPermissionsPreset, type ICodexResolvedPermissions } from './codexSessionConfigKeys.js';
import type { ReasoningEffort } from './protocol/generated/ReasoningEffort.js';
import type { ReasoningSummary } from './protocol/generated/ReasoningSummary.js';
import type { Personality } from './protocol/generated/Personality.js';
import type { WebSearchMode } from './protocol/generated/WebSearchMode.js';
import type { SandboxMode } from './protocol/generated/v2/SandboxMode.js';
import type { SandboxPolicy } from './protocol/generated/v2/SandboxPolicy.js';
import type { SelectedCapabilityRoot } from './protocol/generated/v2/SelectedCapabilityRoot.js';
import type { CommandExecutionApprovalDecision } from './protocol/generated/v2/CommandExecutionApprovalDecision.js';
import type { CommandExecutionRequestApprovalParams } from './protocol/generated/v2/CommandExecutionRequestApprovalParams.js';
import type { CommandExecutionRequestApprovalResponse } from './protocol/generated/v2/CommandExecutionRequestApprovalResponse.js';
import type { FileChangeApprovalDecision } from './protocol/generated/v2/FileChangeApprovalDecision.js';
import type { FileChangeRequestApprovalParams } from './protocol/generated/v2/FileChangeRequestApprovalParams.js';
import type { FileChangeRequestApprovalResponse } from './protocol/generated/v2/FileChangeRequestApprovalResponse.js';
import type { PermissionsRequestApprovalParams } from './protocol/generated/v2/PermissionsRequestApprovalParams.js';
import type { PermissionsRequestApprovalResponse } from './protocol/generated/v2/PermissionsRequestApprovalResponse.js';
import type { DynamicToolSpec } from './protocol/generated/v2/DynamicToolSpec.js';
import type { DynamicToolCallParams } from './protocol/generated/v2/DynamicToolCallParams.js';
import type { DynamicToolCallResponse } from './protocol/generated/v2/DynamicToolCallResponse.js';
import type { DynamicToolCallOutputContentItem } from './protocol/generated/v2/DynamicToolCallOutputContentItem.js';
import type { ToolRequestUserInputParams } from './protocol/generated/v2/ToolRequestUserInputParams.js';
import type { ToolRequestUserInputQuestion } from './protocol/generated/v2/ToolRequestUserInputQuestion.js';
import type { ToolRequestUserInputResponse } from './protocol/generated/v2/ToolRequestUserInputResponse.js';
import type { JsonValue } from './protocol/generated/serde_json/JsonValue.js';
import type { GetAccountResponse } from './protocol/generated/v2/GetAccountResponse.js';
import type { GetAccountRateLimitsResponse } from './protocol/generated/v2/GetAccountRateLimitsResponse.js';
import type { GetAuthStatusResponse } from './protocol/generated/GetAuthStatusResponse.js';
import type { LoginAccountResponse } from './protocol/generated/v2/LoginAccountResponse.js';
import type { ModelListResponse } from './protocol/generated/v2/ModelListResponse.js';
import type { Thread } from './protocol/generated/v2/Thread.js';
import type { ThreadListResponse } from './protocol/generated/v2/ThreadListResponse.js';
import type { ThreadReadResponse } from './protocol/generated/v2/ThreadReadResponse.js';
import type { ThreadTurnsListResponse } from './protocol/generated/v2/ThreadTurnsListResponse.js';
import type { ThreadForkResponse } from './protocol/generated/v2/ThreadForkResponse.js';
import type { ThreadStartResponse } from './protocol/generated/v2/ThreadStartResponse.js';
import type { ThreadResumeResponse } from './protocol/generated/v2/ThreadResumeResponse.js';
import type { TurnCompletedNotification } from './protocol/generated/v2/TurnCompletedNotification.js';
import type { TurnStartedNotification } from './protocol/generated/v2/TurnStartedNotification.js';
import type { ItemStartedNotification } from './protocol/generated/v2/ItemStartedNotification.js';
import type { ItemCompletedNotification } from './protocol/generated/v2/ItemCompletedNotification.js';
import type { TurnStartParams } from './protocol/generated/v2/TurnStartParams.js';
import type { UserInput } from './protocol/generated/v2/UserInput.js';
import type { ListMcpServerStatusResponse } from './protocol/generated/v2/ListMcpServerStatusResponse.js';
import type { McpServerToolCallResponse } from './protocol/generated/v2/McpServerToolCallResponse.js';
import type { McpResourceReadResponse } from './protocol/generated/v2/McpResourceReadResponse.js';
import type { McpServerStartupState } from './protocol/generated/v2/McpServerStartupState.js';
import type { McpServerElicitationRequestParams } from './protocol/generated/v2/McpServerElicitationRequestParams.js';
import type { McpServerElicitationRequestResponse } from './protocol/generated/v2/McpServerElicitationRequestResponse.js';
import type { SkillsListResponse } from './protocol/generated/v2/SkillsListResponse.js';
import type { HooksListResponse } from './protocol/generated/v2/HooksListResponse.js';
import type { ItemGuardianApprovalReviewCompletedNotification } from './protocol/generated/v2/ItemGuardianApprovalReviewCompletedNotification.js';
import type { GuardianWarningNotification } from './protocol/generated/v2/GuardianWarningNotification.js';
import type { ThreadApproveGuardianDeniedActionResponse } from './protocol/generated/v2/ThreadApproveGuardianDeniedActionResponse.js';
import type { ConfigReadResponse } from './protocol/generated/v2/ConfigReadResponse.js';
import type { ConfigWriteResponse } from './protocol/generated/v2/ConfigWriteResponse.js';
import { formatGuardianDenialNotification, formatGuardianReviewStatusNotification, summarizeGuardianReviewAction, toGuardianAssessmentEventJson } from './codexGuardianReview.js';
import { CODEX_COMPACT_SLASH_COMMAND } from '../codexCompactCommand.js';

const CLIENT_INFO = {
	name: 'vscode_agent_host',
	title: 'VS Code Agent Host',
	// The codex `clientInfo.version` is informational. Hardcoded to a
	// non-empty placeholder; bumping it isn't required when our code
	// changes.
	version: '0.1.0',
};

const CODEX_DESKTOP_ROLLOUT_PREFIX_LENGTH = 16 * 1024;
const CODEX_DESKTOP_ROLLOUT_PREFIX_CONCURRENCY = 8;
const CODEX_COLD_SESSION_READ_CONCURRENCY = 8;
const CODEX_THREAD_TURNS_PAGE_SIZE = 100;
const CODEX_STARTUP_ACCOUNT_PROBE_TIMEOUT_MS = 30_000;
const CODEX_DESKTOP_WORKSPACE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CODEX_DESKTOP_SESSION_META_PATTERN = /"type"\s*:\s*"session_meta".*"payload"\s*:\s*\{[^}]*"originator"\s*:\s*"Codex Desktop"/s;
const CODEX_GUARDIAN_TURN_INTERRUPTION_PREFIX = 'Automatic approval review rejected too many approval requests for this turn';

function isCodexDesktopGeneratedWorkspace(cwd: string, userHome: URI): boolean {
	const relativePath = extUriBiasedIgnorePathCase.relativePath(userHome, URI.file(cwd));
	const segments = relativePath?.split('/');
	return segments?.length === 4
		&& segments[0].toLowerCase() === 'documents'
		&& segments[1].toLowerCase() === 'codex'
		&& CODEX_DESKTOP_WORKSPACE_DATE_PATTERN.test(segments[2])
		&& segments[3].length > 0;
}

const CODEX_THINKING_LEVEL_KEY = 'thinkingLevel';

/**
 * User-agent prefix applied to the Codex agent's outbound CAPI calls (e.g. the
 * model-list fetch) so the traffic is identifiable server-side. Mirrors
 * `claudeAgent.ts` and the `vscode_codex` prefix used by `codexProxyService.ts`
 * and `oaiLanguageModelServer.ts`.
 */
const USER_AGENT_PREFIX = 'vscode_codex';

/** Where a user finishes setting Codex up outside the app; the workbench labels the link. */
const CODEX_SETUP_DOCS_URL = 'https://learn.chatgpt.com/codex/auth';

/**
 * The account the in-app sign-in signs into. A proper noun rather than a
 * translatable string, so publishing it keeps user-facing text out of the host —
 * the workbench interpolates it into its own localized sentence.
 */
const CODEX_SIGN_IN_PROVIDER_NAME = 'ChatGPT';

const CODEX_REASONING_EFFORTS: readonly ReasoningEffort[] = ['minimal', 'low', 'medium', 'high'];

/**
 * MCP App capabilities advertised on every codex MCP server. Mirrors
 * {@link DEFAULT_MCP_APP_CAPABILITIES} but omits `sampling`: codex owns
 * the model connection (through the `vscode-proxy` provider) and exposes
 * no app-server RPC for App-initiated `sampling/createMessage`, so the
 * host cannot serve that capability for codex.
 */
const CODEX_MCP_APP_CAPABILITIES: AhpMcpUiHostCapabilities = {
	serverTools: { listChanged: true },
	serverResources: {},
};

/**
 * Codex surfaces an MCP tool-call approval as a `request_user_input`
 * question whose id is `mcp_tool_call_approval_<callId>` (the `<callId>`
 * matches the `mcpToolCall` item id). The host intercepts these and renders
 * them on the normal tool-approval card instead of a chat-input question;
 * see {@link CodexAgent._handleMcpToolApprovalViaCard}.
 *
 * Codex decodes the answer string back into a decision: `Allow` accepts the
 * call, the synthetic `__codex_mcp_decline__` rejects it (anything else is
 * treated as a cancel). These mirror the constants in codex
 * `core/src/mcp_tool_call.rs`.
 */
const MCP_TOOL_APPROVAL_QUESTION_ID_PREFIX = 'mcp_tool_call_approval_';
const MCP_TOOL_APPROVAL_ANSWER_ALLOW = 'Allow';
const MCP_TOOL_APPROVAL_ANSWER_DECLINE = '__codex_mcp_decline__';

/**
 * `supported_endpoints` value (on a Copilot CAPI {@link CCAModel}) that marks
 * a model as reachable through CAPI's OpenAI-shaped Responses endpoint. Codex
 * only drives models via this endpoint (the `vscode-proxy` provider uses
 * `wire_api="responses"`), so the model picker is filtered to models that
 * advertise it. Confirmed against the live CAPI catalog: gpt-5.x / gpt-5*-codex
 * / mai-code carry `/responses`; Anthropic models carry `/v1/messages` and
 * chat-only models carry `/chat/completions` (neither is usable by codex).
 */
const CODEX_RESPONSES_ENDPOINT = '/responses';
const CODEX_COPILOT_MODEL_PROVIDER = 'vscode-proxy';
const CODEX_COPILOT_MODEL_GROUP = 'copilot';
const CODEX_OPENAI_MODEL_PROVIDER = 'openai';
const CODEX_MODEL_SELECTION_PREFIX = '@provider=';

/**
 * The Codex harness relies on OpenAI Responses semantics beyond the endpoint
 * shape. Other vendors can advertise `/responses` without supporting the full
 * Codex request lifecycle, so only publish OpenAI's picker-eligible models.
 */
function isCodexCompatibleCopilotModel(model: CCAModel): boolean {
	return model.vendor.toLowerCase() === CODEX_OPENAI_MODEL_PROVIDER
		&& !!model.model_picker_enabled
		&& !!model.supported_endpoints?.includes(CODEX_RESPONSES_ENDPOINT);
}

export function toCodexModelSelectionId(modelProvider: string, modelId: string): string {
	return `${CODEX_MODEL_SELECTION_PREFIX}${encodeURIComponent(modelProvider)}:${encodeURIComponent(modelId)}`;
}

export function parseCodexModelSelection(selection: ModelSelection): { readonly modelProvider: string; readonly modelId: string } {
	if (!selection.id.startsWith(CODEX_MODEL_SELECTION_PREFIX)) {
		return { modelProvider: CODEX_COPILOT_MODEL_PROVIDER, modelId: selection.id };
	}
	const separator = selection.id.indexOf(':', CODEX_MODEL_SELECTION_PREFIX.length);
	if (separator < CODEX_MODEL_SELECTION_PREFIX.length) {
		return { modelProvider: CODEX_COPILOT_MODEL_PROVIDER, modelId: selection.id };
	}
	try {
		return {
			modelProvider: decodeURIComponent(selection.id.slice(CODEX_MODEL_SELECTION_PREFIX.length, separator)),
			modelId: decodeURIComponent(selection.id.slice(separator + 1)),
		};
	} catch {
		return { modelProvider: CODEX_COPILOT_MODEL_PROVIDER, modelId: selection.id };
	}
}

/**
 * Codex's Agent Mode schema, derived from the platform-generic Mode schema but
 * with "Autopilot" removed. Codex has only two native collaboration modes —
 * `plan` and `default` (see {@link ModeKind}) — so "Autopilot" would map to
 * `default`, identical to "Interactive", and offering it in the picker would be
 * a no-op duplicate. Labels and descriptions are sliced by index so they stay
 * in sync with the platform schema.
 */
function createCodexModeSchema(): ISchemaProperty<SessionMode> {
	const base = platformSessionSchema.definition[SessionConfigKey.Mode].protocol;
	const kept = (base.enum ?? []).flatMap((value, index) => value === 'autopilot' ? [] : [index]);
	return schemaProperty<SessionMode>({
		...base,
		enum: kept.map(index => base.enum![index]),
		enumLabels: base.enumLabels && kept.map(index => base.enumLabels![index]),
		enumDescriptions: base.enumDescriptions && kept.map(index => base.enumDescriptions![index]),
	});
}

const codexSessionConfigSchema = createSchema({
	[CodexSessionConfigKey.PermissionsPreset]: schemaProperty<CodexPermissionsPreset>({
		type: 'string',
		title: localize('codex.sessionConfig.permissionsPreset', "Approvals"),
		description: localize('codex.sessionConfig.permissionsPresetDescription', "How much Codex can do on its own before asking for approval."),
		enum: [...CODEX_PERMISSIONS_PRESETS],
		enumLabels: [
			localize('codex.sessionConfig.permissionsPreset.default', "Default Permissions"),
			localize('codex.sessionConfig.permissionsPreset.autoReview', "Auto-Review"),
			localize('codex.sessionConfig.permissionsPreset.fullAccess', "Full Access"),
		],
		enumDescriptions: [
			localize('codex.sessionConfig.permissionsPreset.defaultDescription', "Codex can read and edit files in the workspace and run routine local commands. It asks before using the internet or going beyond the workspace."),
			localize('codex.sessionConfig.permissionsPreset.autoReviewDescription', "Same workspace access as Default, but approval requests are routed through the auto-reviewer instead of prompting you."),
			localize('codex.sessionConfig.permissionsPreset.fullAccessDescription', "Codex can edit files outside the workspace and use the internet without asking. Use only when you want full machine access."),
		],
		default: CODEX_DEFAULT_PERMISSIONS_PRESET,
		sessionMutable: true,
	}),
	[CodexSessionConfigKey.ApprovalPolicy]: schemaProperty<CodexApprovalPolicy>({
		type: 'string',
		title: localize('codex.sessionConfig.approvalPolicy', "Approvals"),
		description: localize('codex.sessionConfig.approvalPolicyDescription', "How Codex requests approval for tool calls."),
		enum: ['never', 'on-request', 'untrusted'],
		enumLabels: [
			localize('codex.sessionConfig.approvalPolicy.never', "No Escalations"),
			localize('codex.sessionConfig.approvalPolicy.onRequest', "Ask When Needed"),
			localize('codex.sessionConfig.approvalPolicy.untrusted', "Ask More Often"),
		],
		enumDescriptions: [
			localize('codex.sessionConfig.approvalPolicy.neverDescription', "Never ask for elevated permission; commands that cannot run in the sandbox are rejected."),
			localize('codex.sessionConfig.approvalPolicy.onRequestDescription', "Ask only when Codex determines a command needs elevated permission."),
			localize('codex.sessionConfig.approvalPolicy.untrustedDescription', "Ask before more command categories so you can review actions more closely."),
		],
		default: 'on-request',
		sessionMutable: true,
	}),
	[CodexSessionConfigKey.SandboxMode]: schemaProperty<SandboxMode>({
		type: 'string',
		title: localize('codex.sessionConfig.sandboxMode', "Sandbox"),
		description: localize('codex.sessionConfig.sandboxModeDescription', "Filesystem and network restrictions applied to tool calls."),
		enum: ['read-only', 'workspace-write', 'danger-full-access'],
		enumLabels: [
			localize('codex.sessionConfig.sandboxMode.readOnly', "Read-Only"),
			localize('codex.sessionConfig.sandboxMode.workspaceWrite', "Workspace Write"),
			localize('codex.sessionConfig.sandboxMode.dangerFullAccess', "Full Access (Dangerous)"),
		],
		enumDescriptions: [
			localize('codex.sessionConfig.sandboxMode.readOnlyDescription', "Tool calls can read the workspace but cannot modify files."),
			localize('codex.sessionConfig.sandboxMode.workspaceWriteDescription', "Tool calls can read and write within the workspace; network is controlled separately."),
			localize('codex.sessionConfig.sandboxMode.dangerFullAccessDescription', "Tool calls have unrestricted disk and network access."),
		],
		default: 'workspace-write',
		sessionMutable: true,
	}),
	[CodexSessionConfigKey.WebSearchMode]: schemaProperty<WebSearchMode>({
		type: 'string',
		title: localize('codex.sessionConfig.webSearchMode', "Web Search"),
		description: localize('codex.sessionConfig.webSearchModeDescription', "Web-search tool availability for the model."),
		enum: ['disabled', 'cached', 'live'],
		enumLabels: [
			localize('codex.sessionConfig.webSearchMode.disabled', "Disabled"),
			localize('codex.sessionConfig.webSearchMode.cached', "Cached Only"),
			localize('codex.sessionConfig.webSearchMode.live', "Live"),
		],
		default: 'disabled',
		sessionMutable: false,
	}),
	[CodexSessionConfigKey.ModelReasoningEffort]: schemaProperty<ReasoningEffort>({
		type: 'string',
		title: localize('codex.sessionConfig.modelReasoningEffort', "Reasoning Effort"),
		description: localize('codex.sessionConfig.modelReasoningEffortDescription', "Controls how much reasoning effort Codex uses."),
		enum: [...CODEX_REASONING_EFFORTS],
		enumLabels: CODEX_REASONING_EFFORTS.map(getReasoningEffortLabel),
		enumDescriptions: CODEX_REASONING_EFFORTS.map(effort => getReasoningEffortDescription(effort) ?? ''),
		default: 'medium',
		sessionMutable: true,
	}),
	[SessionConfigKey.Mode]: createCodexModeSchema(),
	[CodexSessionConfigKey.Personality]: schemaProperty<Personality>({
		type: 'string',
		title: localize('codex.sessionConfig.personality', "Personality"),
		description: localize('codex.sessionConfig.personalityDescription', "Tone Codex uses when communicating."),
		enum: ['none', 'friendly', 'pragmatic'],
		enumLabels: [
			localize('codex.sessionConfig.personality.none', "Default"),
			localize('codex.sessionConfig.personality.friendly', "Friendly"),
			localize('codex.sessionConfig.personality.pragmatic', "Pragmatic"),
		],
		enumDescriptions: [
			localize('codex.sessionConfig.personality.noneDescription', "Use Codex's built-in default tone."),
			localize('codex.sessionConfig.personality.friendlyDescription', "Warmer, more conversational tone."),
			localize('codex.sessionConfig.personality.pragmaticDescription', "Terse, no-nonsense tone focused on actions."),
		],
		default: 'none',
		sessionMutable: true,
	}),
	[CodexSessionConfigKey.ReasoningSummary]: schemaProperty<ReasoningSummary>({
		type: 'string',
		title: localize('codex.sessionConfig.reasoningSummary', "Reasoning Summary"),
		description: localize('codex.sessionConfig.reasoningSummaryDescription', "How Codex summarizes its reasoning in the response stream."),
		enum: ['auto', 'concise', 'detailed', 'none'],
		enumLabels: [
			localize('codex.sessionConfig.reasoningSummary.auto', "Auto"),
			localize('codex.sessionConfig.reasoningSummary.concise', "Concise"),
			localize('codex.sessionConfig.reasoningSummary.detailed', "Detailed"),
			localize('codex.sessionConfig.reasoningSummary.none', "None"),
		],
		default: 'auto',
		sessionMutable: true,
	}),
	[CodexSessionConfigKey.AdditionalDirectories]: schemaProperty<string[]>({
		type: 'array',
		title: localize('codex.sessionConfig.additionalDirectories', "Additional Writable Directories"),
		description: localize('codex.sessionConfig.additionalDirectoriesDescription', "Absolute paths the sandbox is allowed to write to, in addition to the workspace. Only applies when Sandbox is Workspace Write."),
		items: { type: 'string', title: localize('codex.sessionConfig.additionalDirectories.item', "Directory") },
		enumDynamic: true,
		default: [],
		sessionMutable: true,
	}),
	[CodexSessionConfigKey.NetworkAccessEnabled]: schemaProperty<boolean>({
		type: 'boolean',
		title: localize('codex.sessionConfig.networkAccessEnabled', "Network"),
		description: localize('codex.sessionConfig.networkAccessEnabledDescription', "Allow sandboxed tool calls to make outbound network requests. Only applies when Sandbox is Workspace Write."),
		default: false,
		sessionMutable: true,
	}),
	[SessionConfigKey.Permissions]: platformSessionSchema.definition[SessionConfigKey.Permissions],
});

const codexVisibleSessionConfigSchema = createSchema({
	[SessionConfigKey.Mode]: codexSessionConfigSchema.definition[SessionConfigKey.Mode],
	[CodexSessionConfigKey.PermissionsPreset]: codexSessionConfigSchema.definition[CodexSessionConfigKey.PermissionsPreset],
	[SessionConfigKey.Permissions]: platformSessionSchema.definition[SessionConfigKey.Permissions],
});

interface ICodexSessionConfigDefaults {
	readonly [CodexSessionConfigKey.PermissionsPreset]: CodexPermissionsPreset;
	readonly [CodexSessionConfigKey.ApprovalPolicy]: CodexApprovalPolicy;
	readonly [CodexSessionConfigKey.SandboxMode]: SandboxMode;
	readonly [CodexSessionConfigKey.WebSearchMode]: WebSearchMode;
	readonly [CodexSessionConfigKey.ModelReasoningEffort]: ReasoningEffort;
	readonly [CodexSessionConfigKey.AdditionalDirectories]: string[];
	readonly [CodexSessionConfigKey.NetworkAccessEnabled]: boolean;
	readonly [SessionConfigKey.Mode]: SessionMode;
	readonly [CodexSessionConfigKey.Personality]: Personality;
	readonly [CodexSessionConfigKey.ReasoningSummary]: ReasoningSummary;
}

const codexSessionConfigDefaults: ICodexSessionConfigDefaults = {
	[CodexSessionConfigKey.PermissionsPreset]: CODEX_DEFAULT_PERMISSIONS_PRESET,
	[CodexSessionConfigKey.ApprovalPolicy]: 'on-request',
	[CodexSessionConfigKey.SandboxMode]: 'workspace-write',
	[CodexSessionConfigKey.WebSearchMode]: 'disabled',
	[CodexSessionConfigKey.ModelReasoningEffort]: 'medium',
	[CodexSessionConfigKey.AdditionalDirectories]: [],
	[CodexSessionConfigKey.NetworkAccessEnabled]: false,
	[SessionConfigKey.Mode]: 'interactive',
	[CodexSessionConfigKey.Personality]: 'none',
	[CodexSessionConfigKey.ReasoningSummary]: 'auto',
};

function distinctAbsolutePaths(paths: readonly string[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const path of paths) {
		const normalized = normalize(path);
		const key = filesystemPathComparisonKey(normalized);
		if (key && !seen.has(key)) {
			seen.add(key);
			result.push(normalized);
		}
	}
	return result;
}

function distinctWorkingDirectories(directories: readonly URI[] | undefined): readonly URI[] | undefined {
	if (!directories) {
		return undefined;
	}
	const seen = new Set<string>();
	const result: URI[] = [];
	for (const directory of directories) {
		const path = normalize(directory.fsPath);
		const key = filesystemPathComparisonKey(path);
		if (key && !seen.has(key)) {
			seen.add(key);
			result.push(directory);
		}
	}
	return result.length > 0 ? result : undefined;
}

function filesystemPathComparisonKey(path: string): string | undefined {
	if (!isAbsolute(path)) {
		return undefined;
	}
	const resource = extUriBiasedIgnorePathCase.removeTrailingPathSeparator(URI.file(path));
	return extUriBiasedIgnorePathCase.getComparisonKey(resource);
}

const CodexPrewarmTtlMs = 60_000;

/**
 * Per-session bookkeeping. The codex thread is owned by the shared
 * connection in {@link CodexAgent}; this struct only tracks what the
 * `IAgent` surface needs.
 */
/** Resolved user-input answer captured from the client's `chat/inputCompleted`. */
interface ICodexUserInputResult {
	readonly response: ChatInputResponseKind;
	readonly answers?: Record<string, ChatInputAnswer>;
}

/**
 * The exact chat a Codex runtime is bound to.
 */
interface ICodexTargetChat {
	readonly resource: URI;
	readonly configurationResource: URI;
}

interface ICodexSession {
	/** Caller-facing session id used in the `codex:/<id>` URI; may differ from the codex thread id. */
	readonly sessionId: string;
	/**
	 * Codex app-server thread id used in JSON-RPC `thread/*` and `turn/*` calls.
	 * Undefined until the runtime has been materialized (first `sendMessage`
	 * triggers `thread/start`). Decoupling materialization from
	 * {@link IAgentChats.createChat} mirrors the Claude harness's
	 * provisional/materialize split and avoids spawning an orphan codex thread
	 * when the workbench rebinds a provisional URI after a chip-selection.
	 */
	threadId: string | undefined;
	/**
	 * This runtime's own address, and the single source of truth for reaching
	 * it: `AgentSession.id(sessionUri)` is always the {@link CodexAgent}
	 * `_sessions` key this entry is registered under. Every path that starts
	 * from an entry and ends in a map read — firing an action, tearing the
	 * runtime down, reading its persisted overlay — round-trips through it, so
	 * stamping an entry with a different session's URI (e.g. the host session
	 * that owns a re-keyed chat) silently unaddresses the runtime. Construction
	 * derives it from {@link sessionId} so that cannot happen.
	 */
	readonly sessionUri: URI;
	/**
	 * When this conversation began and when it last saw activity, in epoch ms.
	 * Answers {@link CodexAgent.getChatMetadata} for a live runtime without
	 * an app-server round trip, so both must be real clock values: `0` would
	 * date every live session to 1970 and silently invert the host's
	 * created-before / created-after session filters. Seeded at construction
	 * and replaced with the backing thread's own timestamps when a restore
	 * reads them.
	 */
	startTime: number;
	modifiedTime: number;
	/**
	 * Last summary read from the backing Codex thread. A cold metadata lookup
	 * hydrates a live runtime, and every later lookup must preserve that title
	 * while answering from memory; dropping it makes Agent Host replace an
	 * existing session title with its generic "Session" fallback.
	 */
	summary: string | undefined;
	/** Concrete host chat URI once bound; undefined only for direct create/fork before AH binds it. */
	chatChannel: URI | undefined;
	/** Owning Agent Host session resource used for session-scoped configuration and server tools. */
	configurationResource: URI;
	/**
	 * Effective working directory. Starts as the folder Agent Host resolved for
	 * {@link IAgentChats.createChat}; at first materialization it is
	 * replaced with the host-resolved working directory (the isolated worktree
	 * for worktree-isolation sessions) before `thread/start` locks the codex
	 * subprocess `cwd`. When the client supplies none (e.g. an editor window
	 * with no workspace folder open), a managed temp folder is lazily created
	 * as a fallback at materialize time (tracked by
	 * {@link managedWorkingDirectory} for cleanup). Mutable so both the
	 * worktree swap and the lazy assignment can happen after a provisional
	 * creation.
	 */
	workingDirectory: URI | undefined;
	/**
	 * The current full working-directory set (index 0 = the process root,
	 * mirrored in {@link workingDirectory}; the tail carries additional session
	 * roots). Workspace-folder reconciliation can replace the tail before a
	 * turn; `turn/start.runtimeWorkspaceRoots` applies the latest set to the
	 * existing thread.
	 */
	workingDirectories?: readonly URI[];
	readonly multiRootEnabled: boolean;
	/**
	 * Set to the temp folder created for this session when no working
	 * directory was supplied, so the chat-dispose ref-tracking reclaim
	 * (see {@link CodexAgent._reclaimManagedWorkingDirectoryIfNotLive}) can
	 * remove it. `undefined` when the client supplied a working directory.
	 */
	managedWorkingDirectory: URI | undefined;
	readonly mapState: ICodexSessionMapState;
	/**
	 * Phase 4: parked deferreds for `item/commandExecution/requestApproval`,
	 * keyed by the host-side toolCallId. Resolved by
	 * {@link CodexAgent.respondToPermissionRequest}.
	 */
	readonly pendingCommandApprovals: PendingRequestRegistry<CommandExecutionApprovalDecision>;
	/**
	 * Per-session set of "accept for session" decisions. When the user
	 * picks Accept-for-Session in a previous approval, subsequent
	 * approval requests on the same session resolve automatically.
	 */
	readonly acceptedForSession: Set<string>;
	/**
	 * Guardian (auto-review) `reviewId`s whose terminal outcome has already
	 * been surfaced. Guards against acting twice on the same review if the
	 * completed notification is redelivered.
	 */
	readonly handledGuardianReviews: Set<string>;
	/**
	 * Host-side toolCallIds of the synthetic "Approve anyway" cards created for
	 * guardian (auto-review) denials that are still awaiting a user decision.
	 * Unlike codex's blocking command approvals, these cards live inside the
	 * active turn but codex does *not* wait on them — so when the turn ends
	 * (often via the auto-review circuit-breaker interrupt) the reducer cancels
	 * the card. We use this set to unwind the parked deferred on turn end so the
	 * suspended {@link CodexAgent._handleGuardianReviewCompleted} frame doesn't
	 * leak.
	 */
	readonly pendingGuardianReviewCards: Set<string>;
	/**
	 * Steering messages handed to codex via `turn/steer` that are awaiting
	 * the matching `userMessage` item echo, which promotes them into their
	 * own visible turn. Keyed by {@link PendingMessage.id}. Drained (with a
	 * `steering_consumed` signal) on turn completion, abort, dispose, or a
	 * `turn/steer` rejection so the chat UI's pending bubble never sticks.
	 */
	readonly pendingSteeringFlips: Map<string, PendingMessage>;
	/**
	 * Client-provided tool definitions for this session, keyed by the
	 * contributing workbench client. The merged set is registered with codex
	 * as `dynamicTools` at `thread/start`. Empty until the first active client
	 * sets its tools.
	 */
	readonly clientToolSet: ActiveClientToolSet;
	/**
	 * Parked deferreds for in-flight client-tool calls (codex
	 * `item/tool/call`), keyed by the host-side toolCallId. Resolved by
	 * {@link CodexAgent.onClientToolCallComplete}.
	 */
	readonly pendingClientToolCalls: PendingRequestRegistry<ToolCallResult>;
	/**
	 * Parked deferreds for in-flight user-input requests (codex
	 * `item/tool/requestUserInput`, i.e. the model's `ask_user`), keyed by a
	 * host-generated requestId. Resolved by
	 * {@link CodexAgent.respondToUserInputRequest}.
	 */
	readonly pendingUserInputs: PendingRequestRegistry<ICodexUserInputResult>;
	/**
	 * Signature of the {@link clientTools} the codex thread was started
	 * with. Codex only accepts `dynamicTools` at `thread/start`, so if the
	 * tools change before the first turn (e.g. the prewarmed thread started
	 * before {@link setClientTools} arrived) the thread is restarted to pick
	 * them up. `undefined` until materialized.
	 */
	materializedToolsSig: string | undefined;
	/**
	 * Signature of the `mcp_servers` (root config + client plugins) the codex
	 * thread was started with. Codex only accepts `config.mcp_servers` at
	 * `thread/start`, so if the set changes before the first turn the thread is
	 * restarted to pick them up. `undefined` until materialized.
	 */
	materializedMcpSig: string | undefined;
	/** Signature of custom agents, instructions, and skill capability roots applied to the thread. */
	materializedCustomizationsSig: string | undefined;
	/** Model provider backing the current materialized thread. */
	materializedModelProvider: string | undefined;
	/** True once a turn has been started on the (materialized) thread. */
	firstTurnSent: boolean;
	model: ModelSelection | undefined;
	agent: AgentSelection | undefined;
	customizationDirectory: URI | undefined;
	/** Workbench-facing turn id for the active turn. */
	currentTurnId: string | undefined;
	/** Whether the active turn must use only the dedicated Agent Merge GitHub tools. */
	agentMergeTurn?: boolean;
	/** Cumulative token-usage identity last observed for model-call deduplication. */
	lastModelCallUsageId?: string;
	/** Local monotonic timer for the active workbench-facing turn. */
	turnStopWatch: StopWatch | undefined;
	/** Codex app-server turn id for the active turn. */
	currentAppTurnId: string | undefined;
	/** Codex app-server turn id -> workbench-facing turn id. */
	readonly hostTurnIdByAppTurnId: Map<string, string>;
	/**
	 * Workbench-facing turn id -> codex app-server turn id, retained across
	 * turn completion so {@link CodexAgent.truncateChat} can translate a
	 * live host turn id to a `thread/rollback` target.
	 */
	readonly codexTurnIdByHostTurnId: Map<string, string>;
	/** Set when this session was restored (Phase 3) and needs `thread/resume` before the first `turn/start`. */
	needsResume: boolean;
	/**
	 * Set when launch-only settings changed on a subscribed live thread. Codex
	 * ignores `thread/resume` overrides for such a thread, so release the live
	 * subscription before resuming its persisted history with the new settings.
	 */
	unsubscribeBeforeResume: boolean;
	/** In-flight resume shared by history loading and the first send. */
	resumePromise: Promise<void> | undefined;
	/** Most recent user prompt sent on this session — used as fallback userMessage text in `turn/started`. */
	lastPromptText: string;
	/** True once the workbench has disposed this session. Guards background prewarm continuations. */
	disposed: boolean;
	/** In-flight background or foreground materialization, shared across callers. */
	materializePromise: Promise<void> | undefined;
	/** Whether the workbench-facing materialize event has been emitted for the current backing. */
	materializedEventFired: boolean;
	/** TTL timer for a materialized-but-unused prewarmed thread. */
	prewarmTimer: ReturnType<typeof setTimeout> | undefined;
	/** True once the prewarmed session has been claimed by a user turn. */
	prewarmClaimed: boolean;
	/** Configuration resource on which the agent host's server tools were most recently advertised. */
	serverToolsAdvertisement: string | undefined;
	/** Directory customization ids last published for workspace agents, skills, and hooks. */
	readonly publishedDirectoryCustomizationIds: Set<string>;
	/**
	 * Per-session MCP customization surface. Created lazily the first time
	 * the session needs to surface codex's MCP servers (either via
	 * {@link CodexAgent.getChatCustomizations} or when the connection's
	 * MCP inventory is applied). Disposed when the session is removed.
	 */
	mcpController: McpCustomizationController | undefined;
	/**
	 * Store of client-pushed ("Open Plugin") customizations synced to this
	 * session. Their MCP servers are attached per-thread at `thread/start`
	 * and their skills feed codex's process-global `skills/extraRoots/set`.
	 */
	readonly clientCustomizations: CodexClientCustomizationStore;
}

type ICodexSessionRead = ThreadReadResponse & {
	readonly persistedWorkingDirectories?: readonly URI[];
	readonly persistedModelId?: string;
	readonly rolloutMetadata?: ICodexRolloutMetadata;
};

function toRolloutModelSelection(model: ICodexRolloutModel | undefined): ModelSelection | undefined {
	return model ? { id: toCodexModelSelectionId(model.modelProvider, model.modelId) } : undefined;
}

function toRolloutTurnModels(metadata: ICodexRolloutMetadata | undefined): ReadonlyMap<string, ModelSelection> | undefined {
	if (!metadata || metadata.modelsByTurnId.size === 0) {
		return undefined;
	}
	return new Map([...metadata.modelsByTurnId].map(([turnId, model]) => [turnId, { id: toCodexModelSelectionId(model.modelProvider, model.modelId) }]));
}

/**
 * A live Codex collab-agent (subagent) child thread. Codex runs each spawned
 * subagent as its own app-server thread that emits a full item/turn event
 * stream (`turn/started`, `item/*`, `turn/completed`) under the child thread
 * id — it is not flattened onto the parent thread. We render that stream in a
 * read-only child conversation by routing the child thread's notifications
 * through the shared mappers with an isolated {@link ICodexSession} and firing
 * each resulting action tagged with the parent `spawnAgent` tool call as its
 * `parentToolCallId`, so the shared orchestrator ({@link AgentSideEffects})
 * lands them in the subagent conversation.
 */
interface ICodexSubagent {
	/** Caller-facing sessionId of the parent session that spawned this subagent. */
	readonly parentSessionId: string;
	/** Host-side toolCallId of the parent `spawnAgent` collab tool call (routing key). */
	readonly toolCallId: string;
	/**
	 * Isolated session used to run the shared event mappers for the child
	 * thread. Shares the parent's `sessionUri` and `acceptedForSession` memo so
	 * side effects target the parent's working tree and the accept-for-session
	 * decision spans parent + subagents, but keeps its own map/turn state.
	 */
	readonly session: ICodexSession;
}

/**
 * Persistent connection state machine. The Codex process is retained only
 * after a Codex-backed session is created or restored.
 */
type ConnectionState =
	| { readonly kind: 'idle' }
	| { readonly kind: 'starting'; readonly promise: Promise<IConnectionReady>; readonly cancellation: CancellationTokenSource }
	| ({ readonly kind: 'ready' } & IConnectionReady);

interface IConnectionReady {
	readonly client: ICodexAppServerClient;
	readonly proxyHandle: ICodexProxyHandle;
	readonly child: ChildProcessWithoutNullStreams;
	/** Event/request registrations owned by this particular persistent client. */
	readonly subscriptions?: DisposableStore;
}

/** Internal retry signal for work that was prepared against a replaced app-server. */
class CodexConnectionReplacedError extends Error {
	constructor(message = 'Codex app-server was replaced during a thread operation') {
		super(message);
	}
}

interface ICodexCustomizationLaunch {
	readonly config: Record<string, JsonValue>;
	readonly developerInstructions?: string;
	readonly selectedCapabilityRoots: SelectedCapabilityRoot[];
	readonly signature: string;
}

/**
 * `IAgent` implementation backed by `codex app-server`.
 *
 * Phase 2 surface: initializing `chats.createChat` (provisional; `thread/start` is
 * deferred), `chats.sendMessage` (one `turn/start`, streams `agentMessage`
 * deltas), setPendingMessages (steering via `turn/steer`), `chats.abort`
 * (`turn/interrupt`), `chats.disposeChat` (`thread/unsubscribe`, no process
 * kill) followed by ref-counted managed-working-directory reclaim once a
 * chat's configuration scope has no chats left registered.
 *
 * Decisions 3 (shared process), 6 (on-demand spawn), 7 (session id == threadId),
 * 10 (no cwd → reject), 15 (cancel, keep streamed content), 16 (steering),
 * 17 (attachments), 18 (apikey auth).
 */

/**
 * `@openai/codex` distribution descriptor. Lives in this file because it
 * encodes Codex-specific knowledge — the env-var name and the fact that
 * Codex's Linux binaries are statically musl-linked and ship as a single
 * `linux-*` SKU regardless of host libc.
 */
export const CodexSdkPackage: IAgentSdkPackage = {
	id: 'codex',
	displayName: 'Codex',
	devOverrideEnvVar: AgentHostCodexAgentSdkRootEnvVar,
	hasSeparateMuslLinuxPackage: false,
};

/**
 * Convert a workbench {@link ToolCallResult} into the codex
 * {@link DynamicToolCallResponse} returned for an `item/tool/call` request.
 * Text content maps to `inputText`; when there is no text content the
 * tool's past-tense summary is used so codex never receives an empty body.
 */
function dynamicToolResponseFromResult(result: ToolCallResult): DynamicToolCallResponse {
	const contentItems: DynamicToolCallOutputContentItem[] = [];
	for (const c of result.content ?? []) {
		if (c.type === ToolResultContentType.Text) {
			contentItems.push({ type: 'inputText', text: c.text });
		}
	}
	if (contentItems.length === 0) {
		// Codex rejects an empty tool body, so always send a non-empty
		// `inputText`: prefer the tool's past-tense summary, otherwise a
		// generic completion marker keyed off success.
		const summary = typeof result.pastTenseMessage === 'string' && result.pastTenseMessage.length > 0
			? result.pastTenseMessage
			: (result.success ? 'Tool completed with no output.' : 'Tool failed with no output.');
		contentItems.push({ type: 'inputText', text: summary });
	}
	return { contentItems, success: result.success };
}

function toolsSignature(tools: readonly ToolDefinition[] | undefined): string {
	if (!tools || tools.length === 0) {
		return '';
	}
	return tools
		.map(t => `${t.name}\u0000${t.description ?? ''}\u0000${JSON.stringify(t.inputSchema ?? null)}`)
		.sort()
		.join('\u0001');
}

/**
 * Stable signature of the `mcp_servers` object a thread was started with, used
 * to detect when the merged (root config + client plugin) MCP set changed so
 * the thread can be restarted before its first turn to pick up the new servers.
 */
function mcpServersSignature(servers: Record<string, ICodexMcpServerConfigJson>): string {
	const names = Object.keys(servers).sort();
	return names.map(name => `${name}\u0000${JSON.stringify(servers[name])}`).join('\u0001');
}

/**
 * Opaque per-chat backing blob the orchestrator persists (in the session's
 * default-chat record or its peer-chat catalog) and hands back to
 * {@link CodexAgent.materializeChat} / {@link CodexAgent.getChatMetadata}
 * on restore, together with the chat's model so a cold restore re-attaches the
 * exact conversation without re-enumerating.
 *
 * `sessionId` is the id of the **runtime** backing the chat — the key its
 * {@link ICodexSession} is registered under — and never the app-server thread
 * id. The two coincide for a chat whose runtime is identified by the thread it
 * minted (Codex's session-id == thread-id convention) but NOT for a chat whose
 * runtime adopted the owning session's identity, which keeps the host-minted
 * session id it was provisioned with and decouples its thread id into the
 * metadata overlay. Recording the thread id there instead would re-key the
 * restored runtime under an id no host-addressed call ever uses, and it would
 * go stale the moment a rematerialization mints a new thread.
 */
interface ICodexPersistedChat {
	readonly sessionId: string;
	readonly model?: ModelSelection;
	readonly ownsManagedWorkingDirectory?: boolean;
}

function encodeCodexChat(chat: ICodexPersistedChat): string {
	return JSON.stringify(chat);
}

function decodeCodexChat(data: string | undefined): ICodexPersistedChat | undefined {
	if (data === undefined) {
		return undefined;
	}
	try {
		const parsed = JSON.parse(data);
		if (parsed && typeof parsed.sessionId === 'string') {
			return parsed as ICodexPersistedChat;
		}
	} catch {
		// fall through
	}
	return undefined;
}

/**
 * Codex active-client handle for exactly one exact chat. Writes flow into
 * that chat's backing runtime's {@link ActiveClientToolSet} (tools) and its
 * {@link CodexClientCustomizationStore} (customizations); the runtime is
 * resolved lazily on every write, so writes that arrive before (or after) it
 * exists are gracefully dropped, matching the prior `setClientTools`
 * early-return behavior. Assigning `customizations` caches the inputs (so the
 * getter echoes them) and kicks off the agent's async sync. There is no
 * cross-chat propagation: a handle never reaches into a sibling chat's
 * runtime, so the owning {@link CodexAgent} re-invokes
 * {@link CodexAgent.getOrCreateActiveClient} once per addressed chat instead.
 */
class CodexActiveClientHandle implements IActiveClient {
	private _tools: readonly ToolDefinition[] = [];
	private _customizations: readonly ClientPluginCustomization[] = [];

	constructor(
		private readonly _resolveSession: () => ICodexSession | undefined,
		readonly clientId: string,
		readonly displayName: string | undefined,
		private readonly _onToolsSet: (tools: readonly ToolDefinition[]) => void,
		private readonly _syncCustomizations: (session: ICodexSession, customizations: readonly ClientPluginCustomization[], isCurrent: () => boolean) => void,
		private readonly _removeCustomizations: (session: ICodexSession, customizations: readonly ClientPluginCustomization[]) => void,
	) { }

	private _customizationsRevision = 0;

	get tools(): readonly ToolDefinition[] {
		return this._tools;
	}
	set tools(tools: readonly ToolDefinition[]) {
		this._tools = tools;
		this._resolveSession()?.clientToolSet.set(this.clientId, tools);
		this._onToolsSet(tools);
	}

	get customizations(): readonly ClientPluginCustomization[] {
		return this._customizations;
	}
	set customizations(customizations: readonly ClientPluginCustomization[]) {
		this._customizations = customizations;
		const revision = ++this._customizationsRevision;
		const session = this._resolveSession();
		if (session) {
			this._syncCustomizations(session, customizations, () => revision === this._customizationsRevision);
		}
	}

	/** Cache customizations whose initial async sync was awaited by the creator. */
	commitCustomizations(customizations: readonly ClientPluginCustomization[]): void {
		this._customizations = customizations;
		this._customizationsRevision++;
	}

	remove(): void {
		this._customizationsRevision++;
		const session = this._resolveSession();
		if (session) {
			session.clientToolSet.delete(this.clientId);
			this._removeCustomizations(session, this._customizations);
		}
	}
}

/**
 * Map a resolved approval decision to the {@link FileChangeApprovalDecision}
 * subset. The host's boolean response only yields `accept`/`decline`; the
 * command-only amendment variants are treated as a decline for file changes.
 */
function narrowFileChangeDecision(decision: CommandExecutionApprovalDecision): FileChangeApprovalDecision {
	switch (decision) {
		case 'accept':
		case 'acceptForSession':
		case 'decline':
		case 'cancel':
			return decision;
		default:
			return 'decline';
	}
}

export class CodexAgent extends Disposable implements IAgent {

	readonly id: AgentProvider = CODEX_AGENT_PROVIDER_ID;
	readonly agentHostCapabilities = { workspaceConversion: false } as const;

	private readonly _onDidChatProgress = this._register(new Emitter<AgentSignal>());
	readonly onDidChatProgress = this._onDidChatProgress.event;

	private readonly _onDidMaterializeChat = this._register(new Emitter<IAgentMaterializeChatEvent>());
	readonly onDidMaterializeChat = this._onDidMaterializeChat.event;

	/** Codex's peer-chat backing blob never changes after creation, so this never fires. */
	readonly onDidChangeChatData: Event<IAgentChatDataChange> = Event.None;

	/**
	 * Codex subagent spawns are detected from the `subagent_started` signal on
	 * {@link onDidChatProgress} (see {@link SubagentChatSignal}), so the agent
	 * never fires this membership channel itself.
	 */
	readonly onDidSpawnChat: Event<IAgentSpawnChatEvent> = Event.None;

	private readonly _onMcpNotification = this._register(new Emitter<IMcpNotification>());
	readonly onMcpNotification = this._onMcpNotification.event;

	private readonly _models = observableValue<readonly IAgentModelInfo[]>(this, []);
	readonly models: IObservable<readonly IAgentModelInfo[]> = this._models;
	private readonly _desktopThreadIds = new Set<string>();
	private readonly _desktopRolloutPrefixLimiter = this._register(new Limiter<string | null>(CODEX_DESKTOP_ROLLOUT_PREFIX_CONCURRENCY));
	private readonly _coldSessionReadLimiter = this._register(new Limiter<ICodexSessionRead | undefined>(CODEX_COLD_SESSION_READ_CONCURRENCY));
	private _openAIAccountState: ICodexAccountState = { usageSource: 'openai', status: 'unknown' };
	private readonly _accountRefreshSequencer = new Sequencer();
	private _openAIAccountRateLimit: ICodexAccountInfo['rateLimit'];
	private _openAIAccountRateLimitRequest = 0;
	private _openAIAccountProfileImage: ICodexAccountInfo['profileImage'];
	private _openAIAccountProfileImageRequest = 0;
	private _profileImageStore: CodexProfileImageStore | undefined;
	private _providerConfigurationValues: Record<string, unknown> = {};
	private _providerConfigurationWrite = Promise.resolve();
	private _providerConfigurationReady = false;
	private _providerConfigurationRefresh: Promise<void> | undefined;

	/** Keyed by caller-facing sessionId (the URI host). */
	private readonly _sessions = new Map<string, ICodexSession>();
	/** Keyed by `${chat.toString()}\u0000${clientId}` — exact-chat, exact-client membership; no session- or sibling-level entries. */
	private readonly _activeClientHandles = new Map<string, CodexActiveClientHandle>();
	/** Host-supplied chat URI to Codex session id routing. */
	private readonly _sessionIdByChatUri = new Map<string, string>();
	/** Inverse map: codex threadId → caller-facing sessionId, for routing codex notifications back to sessions. */
	private readonly _sessionIdByThreadId = new Map<string, string>();
	/** Managed directories retained by non-destructively released sessions. */
	private readonly _releasedManagedWorkingDirectories = new Map<string, URI>();
	/**
	 * Chats currently registered under each host session's configuration
	 * scope ({@link IAgentChatContext.configurationResource}), keyed by the
	 * scope's URI string. Used purely to detect when the last chat for a
	 * scope has been disposed so the scope's managed working directory (if
	 * any) can be reclaimed — Agent Host owns chat roles, so Codex never
	 * infers "this is the default chat" here, only bare membership.
	 */
	private readonly _configScopeChats = new Map<string, Set<string>>();
	/**
	 * Inverse of {@link _configScopeChats}: the exact scope key a chat was
	 * registered under, keyed by chat URI string. Recorded at track time so
	 * untracking always agrees with the original registration even when a
	 * chat's runtime binding (its backing thread id) differs from the scope
	 * it was created under — e.g. a peer chat backed by its own thread.
	 */
	private readonly _configScopeByChat = new Map<string, string>();
	/**
	 * Live subagent (collab-agent) child threads, keyed by the child codex
	 * thread id. Populated when a parent session's `spawnAgent` collab tool
	 * call completes (carrying the child `receiverThreadIds`); the child's
	 * subsequent `turn/*` and `item/*` notifications route here instead of
	 * {@link _sessionIdByThreadId}. Removed on the child's `turn/completed`.
	 */
	private readonly _subagentsByThreadId = new Map<string, ICodexSubagent>();
	private readonly _mcpInventory = new CodexMcpInventory();
	private readonly _mcpPublisherSessionIdByConfiguration = new Map<string, string>();
	private readonly _publishedMcpTopLevelIdsByConfiguration = new Map<string, Set<string>>();
	private readonly _customizationReconcileSequencers = new WeakMap<ICodexSession, Sequencer>();
	private readonly _directoryCustomizationSequencers = new WeakMap<ICodexSession, Sequencer>();
	private readonly _skillExtraRootsSequencer = new Sequencer();
	private readonly _sessionMcpDiscoveries = new Map<string, { readonly rootsSignature: string; readonly discovery: SessionMcpDiscovery; dispose(): void }>();
	private readonly _pendingMcpStartupStatuses = new Map<string, Array<{ readonly client: ICodexAppServerClient; readonly name: string; readonly status: McpServerStartupState; readonly error: string | null }>>();
	/**
	 * OAuth bearer tokens acquired for auth-gated http MCP servers, keyed by
	 * the server's {@link normalizeCodexMcpResourceUrl | normalized URL}.
	 * Populated by {@link handleAuthenticationToken} after the workbench
	 * completes the sign-in, then injected into the per-thread `http_headers`
	 * by {@link _buildSessionMcpServers}. Process-global: a token for a given
	 * server URL applies to every session/thread that uses it (codex runs one
	 * shared app-server).
	 */
	private readonly _mcpAuthTokens = new Map<string, string>();
	/**
	 * Association from a normalized OAuth `resource` (what the workbench
	 * authenticates) to the normalized MCP server URL(s) it unlocks. RFC 9728
	 * discovery can return a `resource` that differs from the configured server
	 * URL (e.g. root `https://host/` for a `https://host/mcp` endpoint), so the
	 * token the workbench pushes back is keyed by the resource, not the server
	 * URL. Recorded in {@link _surfaceMcpAuthRequired} at discovery time and
	 * read by {@link handleAuthenticationToken} to route the token to the right
	 * server(s).
	 */
	private readonly _mcpAuthServerUrlsByResource = new Map<string, Set<string>>();
	private _githubToken: string | undefined;
	private _gitHubMcpServerConfiguration: IMcpServerConfiguration | undefined;
	private _githubAuthenticationGeneration = 0;
	private _githubMcpServerEnabled = true;
	/**
	 * Whether the user has explicitly entered a Codex flow in this host process.
	 * Provider registration, authentication replay, and ambient session listing
	 * must not start the app-server: doing so can use a shared ChatGPT login and
	 * contact OpenAI before the user selects Codex.
	 */
	private _activated = false;
	private _isShuttingDown = false;
	private _connection: ConnectionState = { kind: 'idle' };
	private _connectionGeneration = 0;
	/** Makes cleanup idempotent across shutdown and connection-loss races. */
	private readonly _disposedConnections = new WeakSet<IConnectionReady>();
	/** Serializes persistent startup behind the one-off account probe. */
	private readonly _startupAccountProbe = new DeferredPromise<void>();
	/** Cancels startup before a partially initialized one-off process can outlive this agent. */
	private readonly _startupAccountProbeCancellation = this._register(new CancellationTokenSource());
	/** One-off account/catalogue actions share one process at a time. */
	private readonly _onDemandConnectionSequencer = new Sequencer();
	/** Orders create/release/dispose so one exact chat cannot race its own backing lifecycle. */
	private readonly _chatLifecycleSequencer = new SequencerByKey<string>();
	/** Settles when the currently-running one-off action has released its process. */
	private _transientConnectionOperation: Promise<void> | undefined;
	/** A deliberately short-lived connection used by an explicit account action. */
	private _transientAccountConnection: IConnectionReady | undefined;
	/** Owns a one-off connection even while its initialize handshake is pending. */
	private _transientConnectionCancellation: CancellationTokenSource | undefined;
	private readonly _onDidDiscoverChats = this._register(new Emitter<readonly IAgentDiscoveredChat[]>());
	readonly onDidDiscoverChats = this._onDidDiscoverChats.event;
	private _chatDiscoveryRequested = false;
	private _codexChatDiscovery: Promise<void> | undefined;
	private _modelsRefreshPromise: Promise<void> | undefined;
	private readonly _modelRefreshSequencer = new Sequencer();
	/**
	 * Bounded retry for transient Copilot catalog failures. Without this, a
	 * failed request triggered by sign-in leaves the picker stale until another
	 * external refresh trigger or a full restart.
	 */
	protected readonly _modelRefreshMaxAttempts = MODEL_REFRESH_MAX_ATTEMPTS;
	protected readonly _modelRefreshBaseDelayMs = MODEL_REFRESH_BASE_DELAY_MS;
	protected readonly _modelRefreshMaxDelayMs = MODEL_REFRESH_MAX_DELAY_MS;
	protected readonly _startupAccountProbeTimeoutMs = CODEX_STARTUP_ACCOUNT_PROBE_TIMEOUT_MS;
	private readonly _modelRefreshRetry = this._register(new MutableDisposable());
	private readonly _skillHookCustomizationRefresh = this._register(new MutableDisposable());
	/** Invalidates retries that belong to an older Copilot token or endpoint. */
	private _modelCatalogGeneration = 0;
	private _copilotModels: readonly IAgentModelInfo[] = [];
	private _codexModels: readonly IAgentModelInfo[] = [];
	private readonly _metadataStore: CodexSessionMetadataStore;
	private _lastSignInRequest: string | undefined;
	private _lastSignOutRequest: string | undefined;
	private readonly _worktree: IAgentHostWorktreePendingState;

	/**
	 * The agent host's server-tool host (feedback "comments" today, more in the
	 * future). Server tools execute in-process against the session's own state
	 * — unlike client tools, which round-trip to the workbench. `undefined`
	 * until {@link setServerToolHost} is called during registration; remains
	 * `undefined` in test / standalone construction.
	 */
	private _serverToolHost: IAgentServerToolHost | undefined;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@ICopilotApiService private readonly _copilotApiService: ICopilotApiService,
		@ICodexProxyService private readonly _codexProxyService: ICodexProxyService,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
		@IAgentHostGitHubEndpointService private readonly _gitHubEndpointService: IAgentHostGitHubEndpointService,
		@IAgentHostCheckpointService private readonly _checkpointService: IAgentHostCheckpointService,
		@IAgentSdkDownloader private readonly _agentSdkDownloader: IAgentSdkDownloader,
		@IProductService private readonly _productService: IProductService,
		@IAgentPluginManager private readonly _pluginManager: IAgentPluginManager,
		@IFileService private readonly _fileService: IFileService,
		@INativeEnvironmentService private readonly _environmentService: INativeEnvironmentService,
		@IAgentHostProxyResolver private readonly _proxyResolver: IAgentHostProxyResolver,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IAgentHostOTelService private readonly _otelService: IAgentHostOTelService,
		@IAgentHostCustomizationEnablementService private readonly _customizationEnablementService: IAgentHostCustomizationEnablementService,
		@IAgentHostSessionTitleSignal sessionTitleSignal: IAgentHostSessionTitleSignal,
		@IAgentHostWorktreeIsolation worktree: IAgentHostWorktreeIsolation,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
	) {
		super();
		this._worktree = worktree;
		this._metadataStore = this._instantiationService.createInstance(CodexSessionMetadataStore);
		this._githubMcpServerEnabled = this._isGitHubMcpServerEnabled();
		this._publishAccountInfo({ status: 'unknown' });

		// Session titles are host-owned; Codex only observes them to correlate a
		// rename with its conversation in OTel. The seam already filters to this
		// provider's sessions and precomputes the conversation id, so no shared
		// host state is read here.
		this._register(sessionTitleSignal.onDidChangeSessionTitle(({ provider, session, conversationId, title }) => {
			if (provider === this.id) {
				this._otelService.emitSessionTitleChanged(conversationId, session.toString(), title);
			}
		}));
		this._register(this._gitHubEndpointService.onDidChange(() => this._handleGitHubEndpointChange()));
		this._register(this._customizationEnablementService.onDidChange(event => {
			const affectedConfigurations = new Map<string, URI>();
			for (const session of this._sessions.values()) {
				if (!event.sessions.includes(session.configurationResource.toString())) {
					continue;
				}
				affectedConfigurations.set(session.configurationResource.toString(), session.configurationResource);
				const controller = session.mcpController;
				if (controller) {
					controller.applyAll(inventoryToSdkServers(this._mcpInventory.forThread(session.threadId)));
				}
				session.materializedMcpSig = undefined;
				if (session.firstTurnSent) {
					this._markSessionForReload(session);
				}
			}
			for (const configurationResource of affectedConfigurations.values()) {
				this._publishClientCustomizationsForConfiguration(configurationResource);
			}
			void this._refreshSkillExtraRoots();
		}));

		this._register(this._configurationService.onDidRootConfigChange(() => {
			const githubMcpServerEnabled = this._isGitHubMcpServerEnabled();
			if (this._githubMcpServerEnabled !== githubMcpServerEnabled) {
				this._githubMcpServerEnabled = githubMcpServerEnabled;
				for (const session of this._sessions.values()) {
					void this._reconcileMaterializedCustomizations(session);
				}
			}
			const signInRequest = this._configurationService.getRootConfigValues?.()[CODEX_ACCOUNT_SIGN_IN_REQUEST_KEY];
			if (typeof signInRequest === 'string' && signInRequest !== this._lastSignInRequest) {
				this._lastSignInRequest = signInRequest;
				this._configurationService.updateRootConfig({ [CODEX_ACCOUNT_SIGN_IN_REQUEST_KEY]: undefined });
				void this._signInToChatGPT(signInRequest);
			}
			const signOutRequest = this._configurationService.getRootConfigValues?.()[CODEX_ACCOUNT_SIGN_OUT_REQUEST_KEY];
			if (typeof signOutRequest === 'string' && signOutRequest !== this._lastSignOutRequest) {
				this._lastSignOutRequest = signOutRequest;
				this._configurationService.updateRootConfig({ [CODEX_ACCOUNT_SIGN_OUT_REQUEST_KEY]: undefined });
				void this._signOutOfChatGPT();
			}
			this._startModelRefreshWhenSdkIsLocal();
			this._queueProviderConfigurationWrite();
		}));
		this._sdkSetupChannel = this._register(new AgentSdkSetupChannel({
			id: this.id,
			sdkPackage: CodexSdkPackage,
			setupInfo: {
				setupDocsUrl: CODEX_SETUP_DOCS_URL,
				// ChatGPT sign-in is a control request the app server answers, so the
				// banner can start it in-window. An API key still has to be established
				// outside — hence the docs link alongside it.
				signInProviderName: CODEX_SIGN_IN_PROVIDER_NAME,
			},
			isSdkLocal: () => this._isSdkResolvableWithoutDownload(),
			downloadSdk: async () => { await this._resolveSdkRoot(); },
			restartChatDiscovery: () => this._restartChatDiscovery(),
			refreshModels: () => this.refreshModels(),
		}, this._configurationService, this._agentSdkDownloader, this._logService));
		queueMicrotask(async () => {
			try {
				await this._probeAccountAtStartup();
			} finally {
				await this._startupAccountProbe.complete(undefined);
			}
		});
	}

	/**
	 * Publishes whether the SDK is on disk — and nothing about the account, which
	 * the workbench derives from the model list already flowing over AHP (`ready`
	 * + zero models → no account). Distinct from {@link _publishAccountInfo}'s
	 * `vscode.codexAccount` channel, which drives the ChatGPT account menu.
	 */
	private readonly _sdkSetupChannel: AgentSdkSetupChannel;

	private _setOpenAIAccountState(state: ICodexAccountState, _publish = true): void {
		const previousState = this._openAIAccountState;
		this._openAIAccountState = state;
		const sameChatGPTAccount = previousState.status === 'signedIn'
			&& previousState.authType === 'chatgpt'
			&& state.status === 'signedIn'
			&& state.authType === 'chatgpt'
			&& previousState.email === state.email;
		if (!sameChatGPTAccount) {
			this._openAIAccountRateLimit = undefined;
			this._openAIAccountRateLimitRequest++;
			this._openAIAccountProfileImage = undefined;
			void this._profileImageStore?.clear();
			this._openAIAccountProfileImageRequest++;
		}
		if (_publish) {
			this._publishAccountInfo(this._toAccountInfo(state));
		}
	}

	private _publishAccountInfo(account: ICodexAccountInfo): void {
		this._configurationService.publishRootTransientValues?.({ [CODEX_ACCOUNT_META_KEY]: account });
	}

	private async _signInToChatGPT(request: string): Promise<void> {
		const progressInterest = this._agentSdkDownloader.acquireDownloadProgressInterest(CodexSdkPackage);
		try {
			if (!(await this._isSdkResolvableWithoutDownload())) {
				this._publishAccountInfo({ status: 'downloading' });
			}
			await this._withOnDemandConnection(async (client, transient) => {
				const account = await this._refreshAccount(client, true, transient);
				if (account.status === 'signedIn' && account.authType === 'chatgpt') {
					return;
				}

				// A standalone sign-in connection lives only until this login attempt
				// completes. A session-owned connection already has its permanent
				// account/login/completed handler, so it can return after publishing the URL.
				const loginCompleted = new DeferredPromise<{ readonly success: boolean; readonly error: string | null }>();
				let loginId: string | undefined;
				let earlyLoginCompletions: Array<{ readonly loginId: string | null; readonly success: boolean; readonly error: string | null }> = [];
				const completionListener = transient ? client.onNotification('account/login/completed', params => {
					if (loginId === undefined) {
						earlyLoginCompletions.push(params);
						return;
					}
					if (params.loginId !== loginId) {
						return;
					}
					void loginCompleted.complete(params);
				}) : undefined;
				try {
					const response = await client.request<'account/login/start', LoginAccountResponse>('account/login/start', { type: 'chatgpt' });
					if (response.type !== 'chatgpt') {
						return;
					}
					loginId = response.loginId;
					const earlyCompletion = earlyLoginCompletions.find(completion => completion.loginId === loginId);
					earlyLoginCompletions = [];
					if (earlyCompletion) {
						await loginCompleted.complete(earlyCompletion);
					}
					// A persistent connection's global completion handler can finish its
					// account refresh before login/start returns. Do not put the obsolete
					// authorization URL back onto an account that is already signed in.
					if (this._openAIAccountState.status === 'signedIn' && this._openAIAccountState.authType === 'chatgpt') {
						this._publishAccountInfo(this._toAccountInfo(this._openAIAccountState));
						return;
					}
					this._publishAccountInfo({ ...this._toAccountInfo(this._openAIAccountState), authUrl: response.authUrl, authUrlNonce: request });
					if (transient) {
						const result = await Promise.race([
							loginCompleted.p,
							Event.toPromise(client.onExit).then(event => { throw new Error(`Codex app-server exited during ChatGPT sign-in (code=${event.code}, signal=${event.signal})`); }),
						]);
						if (!result.success) {
							throw new Error(result.error ?? 'ChatGPT sign-in failed');
						}
						await this._refreshAccount(client, true, true);
					}
				} finally {
					completionListener?.dispose();
				}
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this._setOpenAIAccountState({ usageSource: 'openai', status: 'error', error: message });
		} finally {
			progressInterest.dispose();
		}
	}

	private async _signOutOfChatGPT(): Promise<void> {
		try {
			await this._withOnDemandConnection(async (client, transient) => {
				await client.request<'account/logout'>('account/logout', undefined);
				await this._refreshAccount(client, true, transient);
				if (!transient) {
					this._queueModelRefresh();
				}
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this._setOpenAIAccountState({ usageSource: 'openai', status: 'error', error: message });
		}
	}

	private _toAccountInfo(state: ICodexAccountState): ICodexAccountInfo {
		return {
			status: state.status,
			email: state.authType === 'chatgpt' ? state.email : undefined,
			planType: state.authType === 'chatgpt' ? state.planType : undefined,
			profileImage: state.authType === 'chatgpt' ? this._openAIAccountProfileImage : undefined,
			requiresOpenaiAuth: state.requiresOpenaiAuth,
			rateLimit: state.authType === 'chatgpt' ? this._openAIAccountRateLimit : undefined,
		};
	}

	private async _resetSessionForModelProviderChange(session: ICodexSession, modelProvider: string): Promise<void> {
		if (session.threadId === undefined) {
			return;
		}
		const oldThreadId = session.threadId;
		this._logService.info(`[Codex:${session.sessionId}] replacing thread ${oldThreadId} with a fresh ${modelProvider} thread`);
		this._removeThreadRouteIfOwned(oldThreadId, session.sessionId);
		this._mcpInventory.deleteThread(oldThreadId);
		session.threadId = undefined;
		this._applyMcpInventoryToSession(session);
		session.materializePromise = undefined;
		session.materializedToolsSig = undefined;
		session.materializedMcpSig = undefined;
		session.materializedCustomizationsSig = undefined;
		session.materializedModelProvider = undefined;
		session.needsResume = false;
		session.hostTurnIdByAppTurnId.clear();
		session.codexTurnIdByHostTurnId.clear();
		const connection = this._connection;
		if (connection.kind === 'ready') {
			try {
				await connection.client.request<'thread/unsubscribe'>('thread/unsubscribe', { threadId: oldThreadId });
			} catch (error) {
				this._logService.info(`[Codex:${oldThreadId}] thread/unsubscribe during model-provider change failed: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
	}

	// #region Auth

	getProtectedResources(): ProtectedResourceMetadata[] {
		// Always listed, always optional — matching Claude. Listing it is what lets
		// the host forward a token to an already-signed-in user (matching ignores
		// `required`); the unconditional `required: false` is what stops
		// `resolveSignedOutWindowGate` walling off the whole Agents window before
		// the user reaches a surface that could explain itself.
		const copilotResource = this._gitHubEndpointService.getCopilotResource();
		return [
			{ ...copilotResource, required: false },
			this._gitHubEndpointService.getRepoResource(),
		];
	}

	async authenticate(resource: string, token: string): Promise<boolean> {
		if (resource === this._gitHubEndpointService.getRepoResource().resource) {
			return true;
		}
		if (resource !== this._gitHubEndpointService.getCopilotResource().resource) {
			return false;
		}
		const normalizedToken = token || undefined;
		const generation = ++this._githubAuthenticationGeneration;
		const changed = this._githubToken !== normalizedToken;
		const gitHubMcpServerConfiguration = changed
			? await this._resolveGitHubMcpServerConfiguration(normalizedToken)
			: this._gitHubMcpServerConfiguration;
		if (generation !== this._githubAuthenticationGeneration) {
			return true;
		}
		this._githubToken = normalizedToken;
		this._gitHubMcpServerConfiguration = gitHubMcpServerConfiguration;
		if (changed) {
			this._modelCatalogGeneration++;
		}
		if (changed && this._connection.kind === 'ready' && this._connection.proxyHandle) {
			// The app-server stays running. The proxy reads the new token from its
			// own cell, while MCP-backed threads reconcile their per-thread config.
			this._connection.proxyHandle.setToken(normalizedToken ?? '');
			this._queueModelRefresh();
		} else if (changed) {
			// Defer model refresh until the connection comes up.
			this._queueModelRefresh();
		}
		if (changed) {
			for (const session of this._sessions.values()) {
				await this._reconcileMaterializedCustomizations(session);
			}
		}
		this._logService.info(normalizedToken ? '[Codex] Auth token updated' : '[Codex] Auth token cleared');
		void this._refreshProviderConfiguration();
		return true;
	}

	private _isGitHubMcpServerEnabled(): boolean {
		return this._configurationService.getRootValue(platformRootSchema, AgentHostGitHubMcpServerEnabledConfigKey) !== false;
	}

	private async _resolveGitHubMcpServerConfiguration(token: string | undefined): Promise<IMcpServerConfiguration | undefined> {
		try {
			return await resolveGitHubMcpServerConfiguration(this._copilotApiService, token);
		} catch (error) {
			this._logService.warn(`[Codex] Failed to resolve the GitHub MCP server endpoint: ${error instanceof Error ? error.message : String(error)}`);
			return undefined;
		}
	}

	private _handleGitHubEndpointChange(): void {
		this._githubAuthenticationGeneration++;
		this._modelCatalogGeneration++;
		this._githubToken = undefined;
		this._gitHubMcpServerConfiguration = undefined;
		if (this._connection.kind === 'ready' && this._connection.proxyHandle) {
			this._connection.proxyHandle.setToken('');
		}
		this._queueModelRefresh();
		for (const session of this._sessions.values()) {
			void this._reconcileMaterializedCustomizations(session);
		}
	}

	/**
	 * Receives a bearer token the workbench acquired for a protected resource
	 * (the `authenticate` command is fanned out to every agent). If the
	 * resource maps to one or more configured auth-gated http MCP servers
	 * (via the association recorded at discovery time, or a direct URL match),
	 * store the token per server URL (so {@link _buildSessionMcpServers} injects
	 * it) and reconnect the affected threads so codex picks it up. This is the
	 * codex end of the *same* OAuth mechanism the Copilot agent uses: the
	 * workbench does the sign-in, the agent injects the resulting bearer.
	 * Returns whether the token was consumed by an MCP server (the GitHub agent
	 * token flows through {@link authenticate} instead).
	 */
	async handleAuthenticationToken(params: AuthenticateParams): Promise<boolean> {
		const normalizedResource = normalizeCodexMcpResourceUrl(params.resource);
		if (normalizedResource === undefined) {
			return false;
		}
		// The workbench authenticates the OAuth `resource`, which RFC 9728
		// discovery may report as different from the configured server URL.
		// Resolve the server URL(s) this resource unlocks: the association
		// recorded at discovery time, plus a direct match when the resource IS
		// a configured server URL (discovery returned the URL unchanged, or was
		// skipped).
		const serverUrls = new Set(this._mcpAuthServerUrlsByResource.get(normalizedResource) ?? []);
		if (this._isConfiguredHttpServerUrl(normalizedResource)) {
			serverUrls.add(normalizedResource);
		}
		if (serverUrls.size === 0) {
			return false;
		}
		let changed = false;
		for (const serverUrl of serverUrls) {
			if (this._mcpAuthTokens.get(serverUrl) !== params.token) {
				this._mcpAuthTokens.set(serverUrl, params.token);
				changed = true;
			}
		}
		if (!changed) {
			return true;
		}
		this._logService.info(`[Codex] stored MCP auth token for ${params.resource}; reconnecting affected sessions`);
		await this._reconnectSessionsForMcpAuth(serverUrls);
		return true;
	}

	/** Whether `normalizedUrl` is a currently-configured http MCP server (root config or any session's client plugins). */
	private _isConfiguredHttpServerUrl(normalizedUrl: string): boolean {
		if (Object.values(codexMcpServersFromConfig(this._configurationService.getRootValue(platformRootSchema, AgentHostMcpServersConfigKey)))
			.some(server => server.url !== undefined && normalizeCodexMcpResourceUrl(server.url) === normalizedUrl)) {
			return true;
		}
		return [...this._sessions.values()].some(session =>
			[...this._httpMcpServerUrls(session).values()].includes(normalizedUrl),
		);
	}

	/**
	 * Reconnects every materialized session whose merged MCP servers include one
	 * of `normalizedUrls` so codex re-reads `config.mcp_servers` with the
	 * injected `Authorization` header. A thread that has not yet committed a
	 * turn is restarted (`thread/start`, lossless); one with history is resumed
	 * (`thread/resume` carries the same `config` field, loading history from the
	 * rollout) on its next turn via {@link ICodexSession.needsResume}.
	 */
	private async _reconnectSessionsForMcpAuth(normalizedUrls: ReadonlySet<string>): Promise<void> {
		for (const session of this._sessions.values()) {
			if (session.disposed || session.threadId === undefined) {
				continue;
			}
			if (![...this._httpMcpServerUrls(session).values()].some(url => normalizedUrls.has(url))) {
				continue;
			}
			if (!session.firstTurnSent) {
				try {
					await this._restartThreadWithCurrentTools(session);
				} catch (err) {
					this._logService.warn(`[Codex:${session.sessionId}] reconnect after MCP auth failed: ${err instanceof Error ? err.message : String(err)}`);
				}
			} else {
				// A thread with history is resumed (with the current config) on
				// its next turn rather than restarted, so nothing is lost.
				this._markSessionForReload(session);
			}
		}
	}

	/**
	 * {@link IAgent.refreshModels}. Coalesces onto an in-flight refresh — from
	 * an account change or an earlier tick — rather than issuing a
	 * second enumeration, and never rejects: {@link _refreshModels} logs and
	 * applies its own stale-write guards on failure.
	 */
	refreshModels(): Promise<void> {
		if (this._isShuttingDown || this._store.isDisposed) {
			return Promise.resolve();
		}
		return this._modelsRefreshPromise ?? this._queueModelRefresh();
	}

	private _queueModelRefresh(attempt = 0, generation = this._modelCatalogGeneration): Promise<void> {
		if (this._isShuttingDown || this._store.isDisposed) {
			return Promise.resolve();
		}
		const refreshPromise = this._modelRefreshSequencer.queue(() => this._refreshModels(attempt, generation)).finally(() => {
			if (this._modelsRefreshPromise === refreshPromise) {
				this._modelsRefreshPromise = undefined;
			}
		});
		this._modelsRefreshPromise = refreshPromise;
		return refreshPromise;
	}

	private _ensureModelProviderAuthenticated(model: ModelSelection | undefined): void {
		const modelProvider = model ? parseCodexModelSelection(model).modelProvider : CODEX_COPILOT_MODEL_PROVIDER;
		if (modelProvider !== CODEX_COPILOT_MODEL_PROVIDER) {
			return;
		}
		const token = this._githubToken;
		if (!token) {
			throw new ProtocolError(
				AHP_AUTH_REQUIRED,
				'Authentication is required to use Codex',
				this.getProtectedResources(),
			);
		}
	}

	private _imageGenerationEnabledForModelProvider(modelProvider: string): boolean {
		return modelProvider === CODEX_OPENAI_MODEL_PROVIDER
			&& this._openAIAccountState.status === 'signedIn'
			&& this._openAIAccountState.authType === 'chatgpt';
	}

	private _defaultModel(): ModelSelection | undefined {
		const models = this._models.get();
		const chosen = models[0];
		return chosen ? { id: chosen.id } : undefined;
	}

	private _supportedModelOrUndefined(model: ModelSelection | undefined): ModelSelection | undefined {
		if (model && this._models.get().some(m => m.id === model.id)) {
			return model;
		}
		if (model) {
			this._logService.warn(`[Codex] Unknown model '${model.id}'`);
			return undefined;
		}
		return this._defaultModel();
	}

	private async _resolveModel(session: ICodexSession): Promise<ModelSelection> {
		// Ensure the catalog is populated before validating the selection so a
		// model picked before models finished loading isn't dropped. Authentication
		// can queue a newer refresh while the current one is finishing, so follow
		// the latest queued refresh until the sequencer is idle.
		if (this._models.get().length === 0) {
			let refresh: Promise<void> | undefined = this.refreshModels();
			while (refresh) {
				await refresh;
				refresh = this._modelsRefreshPromise;
			}
		}
		const selected = this._supportedModelOrUndefined(session.model);
		if (selected) {
			session.model = selected;
			return selected;
		}
		throw new Error('Codex has no available models.');
	}

	private _createReasoningEffortConfigSchema(
		supportedEfforts: readonly { readonly reasoningEffort: string; readonly description?: string }[] | undefined,
		declaredDefault?: string,
		modelId?: string,
	): ConfigSchema | undefined {
		if (!supportedEfforts?.length) {
			return undefined;
		}
		const efforts = supportedEfforts.map(option => option.reasoningEffort);
		return {
			type: 'object',
			properties: {
				[CODEX_THINKING_LEVEL_KEY]: {
					type: 'string',
					title: localize('codex.modelThinkingLevel.title', "Thinking Level"),
					description: localize('codex.modelThinkingLevel.description', "Controls how much reasoning effort Codex uses."),
					default: resolveDefaultReasoningEffort(efforts, declaredDefault, modelId),
					enum: efforts,
					enumLabels: efforts.map(getReasoningEffortLabel),
					enumDescriptions: supportedEfforts.map(option => option.description || getReasoningEffortDescription(option.reasoningEffort) || ''),
				},
			},
		};
	}

	private _getReasoningEffort(session: ICodexSession, configResource: URI): ReasoningEffort | undefined {
		const modelConfigEffort = narrowReasoningEffort(session.model?.config?.[CODEX_THINKING_LEVEL_KEY]);
		if (modelConfigEffort) {
			return modelConfigEffort;
		}
		const config = this._configurationService.getSessionConfigValues(configResource.toString());
		return narrowReasoningEffort(config?.[CodexSessionConfigKey.ModelReasoningEffort]) ?? codexSessionConfigDefaults[CodexSessionConfigKey.ModelReasoningEffort];
	}

	private _readSessionConfig(configResource: URI): ReturnType<typeof codexSessionConfigSchema.validateOrDefault> {
		return codexSessionConfigSchema.validateOrDefault(
			this._configurationService.getSessionConfigValues(configResource.toString()),
			codexSessionConfigDefaults,
		);
	}

	/**
	 * Resolve the Codex security axes (approval policy, sandbox, reviewer) for a
	 * live or restored session from its RAW persisted config values.
	 *
	 * The raw values are normalized through {@link migrateCodexPermissionValues}
	 * (the same migration the restore path applies) before resolving, so the
	 * axes we send to the app-server always match the preset the "Approvals" chip
	 * displays. This matters for two legacy shapes:
	 * - a session that persisted only `sandboxMode = 'read-only'` is preserved
	 *   verbatim, so it is NOT silently escalated back to `workspace-write` on
	 *   resume (the chip over-promises, but the session stays more locked down);
	 * - a session that persisted `approvalPolicy = 'never'` + `workspace-write`
	 *   (which the chip renders as "Default Permissions") is snapped onto the
	 *   `default` preset's `on-request` policy so it actually prompts, instead of
	 *   running commands unprompted while the chip claims it would ask.
	 */
	private _resolveSessionPermissions(configResource: URI): ICodexResolvedPermissions {
		const rawValues = this._configurationService.getSessionConfigValues(configResource.toString());
		const defaults = {
			approvalPolicy: codexSessionConfigDefaults[CodexSessionConfigKey.ApprovalPolicy],
			sandboxMode: codexSessionConfigDefaults[CodexSessionConfigKey.SandboxMode],
		};
		return resolveCodexPermissions(migrateCodexPermissionValues(rawValues, defaults), defaults);
	}

	private _sandboxPolicy(session: ICodexSession, config: ReturnType<typeof codexSessionConfigSchema.validateOrDefault>, mode: SandboxMode): SandboxPolicy {
		if (mode === 'danger-full-access') {
			return { type: 'dangerFullAccess' };
		}
		const networkAccess = narrowBoolean(config[CodexSessionConfigKey.NetworkAccessEnabled]) ?? codexSessionConfigDefaults[CodexSessionConfigKey.NetworkAccessEnabled];
		if (mode === 'read-only') {
			return { type: 'readOnly', networkAccess: false };
		}
		const additionalDirectories = narrowAdditionalDirectories(config[CodexSessionConfigKey.AdditionalDirectories]) ?? [];
		const writableRoots = this._isMultiRootActive(session)
			? distinctAbsolutePaths([
				...this._runtimeWorkspaceRoots(session),
				...additionalDirectories,
			])
			: [
				...(session.workingDirectory ? [session.workingDirectory.fsPath] : []),
				...additionalDirectories,
			];
		return {
			type: 'workspaceWrite',
			writableRoots,
			networkAccess,
			excludeTmpdirEnvVar: false,
			excludeSlashTmp: false,
		};
	}

	private _turnStartOptions(session: ICodexSession, modelId: string, developerInstructions?: string, configResource: URI = session.sessionUri): Pick<TurnStartParams, 'approvalPolicy' | 'sandboxPolicy' | 'approvalsReviewer' | 'effort' | 'runtimeWorkspaceRoots' | 'personality' | 'summary' | 'collaborationMode'> {
		const config = this._readSessionConfig(configResource);
		const resolvedPermissions = this._resolveSessionPermissions(configResource);
		const approvalPolicy = session.agentMergeTurn ? 'on-request' : resolvedPermissions.approvalPolicy;
		const sandboxMode = session.agentMergeTurn && resolvedPermissions.sandboxMode === 'danger-full-access' ? 'workspace-write' : resolvedPermissions.sandboxMode;
		const approvalsReviewer = resolvedPermissions.approvalsReviewer;
		const resolvedSandboxPolicy = this._sandboxPolicy(session, config, sandboxMode);
		const sandboxPolicy = session.agentMergeTurn && resolvedSandboxPolicy.type === 'workspaceWrite'
			? { ...resolvedSandboxPolicy, networkAccess: false }
			: resolvedSandboxPolicy;
		const runtimeWorkspaceRoots = this._isMultiRootActive(session)
			? this._runtimeWorkspaceRoots(session)
			: (sandboxPolicy.type === 'workspaceWrite' ? sandboxPolicy.writableRoots : undefined);
		const effort = this._getReasoningEffort(session, configResource);
		const personality = narrowPersonality(config[CodexSessionConfigKey.Personality]) ?? codexSessionConfigDefaults[CodexSessionConfigKey.Personality];
		const summary = narrowReasoningSummary(config[CodexSessionConfigKey.ReasoningSummary]) ?? codexSessionConfigDefaults[CodexSessionConfigKey.ReasoningSummary];
		// Map the platform-generic Agent Mode to codex's native collaboration
		// mode. Always send it (even for `default`) so switching Plan → Interactive
		// resets the sticky thread mode. `collaborationMode.settings` carries the
		// model + effort because codex treats it as authoritative over the
		// top-level fields when a collaboration mode is set.
		const mode = collaborationModeKind(config[SessionConfigKey.Mode]);
		const collaborationMode: TurnStartParams['collaborationMode'] = {
			mode,
			settings: { model: modelId, reasoning_effort: effort ?? null, developer_instructions: developerInstructions ?? null },
		};
		return {
			approvalPolicy,
			sandboxPolicy,
			approvalsReviewer,
			effort,
			personality,
			summary,
			collaborationMode,
			...(runtimeWorkspaceRoots ? { runtimeWorkspaceRoots } : {}),
		};
	}

	private _workingDirectories(session: ICodexSession): readonly URI[] {
		return session.workingDirectories ?? (session.workingDirectory ? [session.workingDirectory] : []);
	}

	private _runtimeWorkspaceRoots(session: ICodexSession): string[] {
		return distinctAbsolutePaths(this._workingDirectories(session).map(directory => directory.fsPath));
	}

	private _isMultiRootActive(session: ICodexSession): boolean {
		return session.multiRootEnabled && (session.workingDirectories?.length ?? 0) > 1;
	}

	private async _selectedCapabilityRoots(session: ICodexSession): Promise<SelectedCapabilityRoot[]> {
		const candidates = codexSelectedCapabilityRootCandidates(session.workingDirectories ?? []);
		const resolved = await Promise.all(candidates.map(async candidate => {
			try {
				const stat = await this._fileService.stat(URI.file(candidate.location.path));
				return stat.isDirectory ? candidate : undefined;
			} catch (error) {
				const result = toFileOperationResult(error);
				if (result !== FileOperationResult.FILE_NOT_FOUND) {
					this._logService.warn(`[Codex] selected capability root metadata lookup failed: id=${candidate.id}, result=${result}`);
				}
				return undefined;
			}
		}));
		return resolved.filter(candidate => candidate !== undefined);
	}

	private async _buildCustomizationLaunch(session: ICodexSession): Promise<ICodexCustomizationLaunch> {
		const plugins = this._enabledClientPlugins(session);
		const [workspaceAgents, workspaceSkills] = await Promise.all([
			discoverCodexWorkspaceAgents(this._workingDirectories(session), this._fileService),
			discoverCodexWorkspaceSkills(this._workingDirectories(session), this._fileService),
		]);
		const customization = await codexCustomizationConfig(workspaceAgents.agents, plugins, session.agent, this._fileService);
		const config: Record<string, JsonValue> = {};
		if (customization.agentRoles.length > 0) {
			const root = session.customizationDirectory?.fsPath
				?? await fs.promises.mkdtemp(join(os.tmpdir(), 'vscode-agent-codex-customizations-'));
			const agentsDirectory = join(root, 'agents');
			await fs.promises.mkdir(agentsDirectory, { recursive: true });
			const agents: Record<string, JsonValue> = {};
			for (const [index, role] of customization.agentRoles.entries()) {
				const rolePath = join(agentsDirectory, `${index}.toml`);
				await fs.promises.writeFile(rolePath, codexAgentRoleToml(role), 'utf8');
				agents[role.name] = { description: role.description, config_file: rolePath };
			}
			config.agents = agents;
			session.customizationDirectory ??= URI.file(root);
		}

		const selectedCapabilityRoots = [
			...workspaceSkills.map((container): SelectedCapabilityRoot => ({
				id: container.id,
				location: { type: 'environment', environmentId: 'local', path: URI.parse(container.uri).fsPath },
			})),
			...codexSkillCapabilityRoots(plugins).map((uri, index): SelectedCapabilityRoot => ({
				id: `client-plugin-skills-${index}-${uri.fsPath}`,
				location: { type: 'environment', environmentId: 'local', path: uri.fsPath },
			})),
		];
		const signature = JSON.stringify({
			agent: session.agent?.uri,
			agentRoles: customization.agentRoles,
			developerInstructions: customization.developerInstructions,
			selectedCapabilityRoots: selectedCapabilityRoots.map(root => root.location.path),
		});
		return {
			config,
			...(customization.developerInstructions ? { developerInstructions: customization.developerInstructions } : {}),
			selectedCapabilityRoots,
			signature,
		};
	}

	private _enabledClientPlugins(session: ICodexSession): readonly ICodexClientPlugin[] {
		const { plugins, candidates, resolution } = this._resolveClientCustomizationEnablement(session);
		const enabled: ICodexClientPlugin[] = [];
		for (const [index, plugin] of plugins.entries()) {
			const customization = resolution.customizations[index];
			if (plugin.parsed !== undefined
				&& customization.type === CustomizationType.Plugin
				&& isCustomizationSdkEligible(resolution, candidates[index])) {
				const resolved = { ...plugin, customization };
				if (session.clientCustomizations.isEnabled(resolved)) {
					enabled.push(resolved);
				}
			}
		}
		return enabled;
	}

	private _resolveClientCustomizationEnablement(session: ICodexSession) {
		const plugins = session.clientCustomizations.plugins();
		const candidates = plugins.map(plugin => ({
			...plugin.synced.customization,
			...(plugin.parsed ? { children: parsedPluginChildren(plugin.parsed) } : {}),
		}));
		const clientPlugins = new Map<string, ClientPluginCustomization>();
		const childEnablement = new Map<string, NonNullable<ClientPluginCustomization['childEnablement']>>();
		for (const plugin of plugins) {
			if (plugin.input !== undefined) {
				clientPlugins.set(plugin.input.uri, plugin.input);
				if (plugin.input.childEnablement !== undefined) {
					childEnablement.set(plugin.input.uri, plugin.input.childEnablement);
				}
			}
		}
		const resolution = resolveCustomizationEnablement(
			this._customizationEnablementService,
			session.configurationResource,
			candidates,
			childEnablement,
			clientPlugins,
		);
		return { plugins, candidates, resolution };
	}

	private async _refreshModels(attempt = 0, generation = this._modelCatalogGeneration): Promise<void> {
		if (this._isShuttingDown || this._store.isDisposed) {
			return;
		}
		// A fresh refresh or the retry itself supersedes the pending timer.
		this._modelRefreshRetry.clear();
		const [copilotError] = await Promise.all([this._refreshCopilotModels(), this._refreshCodexModels()]);
		if (generation !== this._modelCatalogGeneration || this._isShuttingDown || this._store.isDisposed) {
			return;
		}
		this._models.set([...this._copilotModels, ...this._codexModels], undefined);
		// Last, never first: announcing `ready` before the catalog lands is how the
		// window renders "no account found".
		this._sdkSetupChannel.refresh();

		if (!copilotError) {
			return;
		}
		if (attempt + 1 < this._modelRefreshMaxAttempts) {
			const delay = modelRefreshBackoff(attempt, this._modelRefreshBaseDelayMs, this._modelRefreshMaxDelayMs);
			this._logService.warn(`[Codex] Failed to refresh models (attempt ${attempt + 1}), retrying in ${delay}ms: ${copilotError.message}`);
			this._modelRefreshRetry.value = disposableTimeout(() => {
				if (generation === this._modelCatalogGeneration && !this._isShuttingDown && !this._store.isDisposed) {
					void this._queueModelRefresh(attempt + 1, generation);
				}
			}, delay);
			return;
		}
		this._logService.warn(`[Codex] Failed to refresh models after ${attempt + 1} attempts: ${copilotError.message}`);
	}

	/**
	 * Re-read the authoritative catalog after an activated Codex provider's root
	 * configuration changes, but only when asking is free — i.e. the SDK is
	 * already on disk.
	 *
	 * Replaces a `~/.codex/auth.json` sniff that was wrong in both directions: it
	 * missed API-key setups established through the environment, and claimed a
	 * setup from a stale token file. Only the app server can answer whether this
	 * user can run Codex without GitHub. The activation guard is the consent
	 * boundary: authentication replay and ambient configuration changes alone do
	 * not start the app-server.
	 */
	private _startModelRefreshWhenSdkIsLocal(): void {
		const allowSignedOutWhenUsable = this._configurationService.getRootValue(agentHostCustomizationConfigSchema, AgentHostConfigKey.AllowSignedOutWhenUsable) === true;
		if (this._isShuttingDown || this._store.isDisposed || !this._activated || !allowSignedOutWhenUsable || this._codexModels.length > 0) {
			return;
		}
		queueMicrotask(async () => {
			if (this._isShuttingDown || this._store.isDisposed || !(await this._isSdkResolvableWithoutDownload()) || this._isShuttingDown || this._store.isDisposed) {
				return;
			}
			await this.refreshModels();
		});
	}

	private async _refreshCopilotModels(): Promise<Error | undefined> {
		const token = this._githubToken;
		if (!token) {
			this._copilotModels = [];
			return undefined;
		}
		try {
			const userAgent = `${USER_AGENT_PREFIX}/${this._productService.version}`;
			const all = await this._copilotApiService.models(token, { headers: { 'User-Agent': userAgent }, suppressIntegrationId: true });
			if (this._githubToken !== token) {
				return undefined;
			}
			// Codex talks to every model through the `vscode-proxy` custom model
			// provider with `wire_api="responses"` (see CodexProxyService), so it
			// can only drive picker-eligible models that expose Copilot CAPI's
			// OpenAI-shaped Responses endpoint. The chosen id is forwarded straight
			// through; CAPI remains the authority on what the token may actually use.
			const models = all
				.filter(isCodexCompatibleCopilotModel)
				.sort((a, b) => Number(b.is_chat_default) - Number(a.is_chat_default))
				.map((m): IAgentModelInfo => ({
					provider: CODEX_AGENT_PROVIDER_ID,
					id: toCodexModelSelectionId(CODEX_COPILOT_MODEL_PROVIDER, m.id),
					name: m.name ?? m.id,
					maxContextWindow: m.capabilities?.limits?.max_context_window_tokens,
					maxOutputTokens: m.capabilities?.limits?.max_output_tokens,
					maxPromptTokens: m.capabilities?.limits?.max_prompt_tokens,
					supportsVision: !!m.capabilities?.supports?.vision,
					configSchema: this._createReasoningEffortConfigSchema(
						(m.capabilities?.supports as { readonly reasoning_effort?: readonly string[] } | undefined)?.reasoning_effort?.map(reasoningEffort => ({ reasoningEffort })),
						undefined,
						m.id,
					),
					policyState: m.policy?.state as PolicyState | undefined,
					_meta: {
						...createPricingMetaFromBilling(
							normalizeCAPIBilling(m.billing),
							typeof m.model_picker_price_category === 'string'
								? m.model_picker_price_category
								: undefined,
						),
						...createAgentModelGroupMeta(CODEX_COPILOT_MODEL_GROUP),
					},
				}));
			this._copilotModels = models;
			return undefined;
		} catch (err) {
			// Keep the last known-good catalog; a transient periodic failure must
			// not make every model disappear.
			if (this._githubToken !== token) {
				return undefined;
			}
			return err instanceof Error ? err : new Error(String(err));
		}
	}

	private async _refreshCodexModels(): Promise<void> {
		try {
			// A refresh must never be what pulls the SDK down — the download is an
			// explicit gesture now — so with no local SDK this reports the honest
			// empty catalog and the banner offers it. A live connection already
			// proves the SDK is on disk, so it short-circuits the stat.
			const sdkReady = this._connection.kind !== 'idle' || await this._isSdkResolvableWithoutDownload();
			if (!sdkReady) {
				this._codexModels = [];
				return;
			}
			// Account/model enumeration belongs to a selected Codex session. Ambient
			// model refreshes may still publish SDK readiness and Copilot models, but
			// must not turn the startup account probe into a persistent connection.
			if (!this._activated && this._connection.kind === 'idle') {
				this._codexModels = [];
				return;
			}
			const connection = await this._ensureConnection();
			const account = await this._refreshAccount(connection.client, false);
			if (!this._isCurrentConnection(connection)) {
				return;
			}
			if (account.status === 'signedOut' || account.status === 'error') {
				this._codexModels = [];
				return;
			}
			const configResponse = await connection.client.request<'config/read', ConfigReadResponse>('config/read', { includeLayers: false });
			if (!this._isCurrentConnection(connection)) {
				return;
			}
			const modelProvider = configResponse.config.model_provider ?? CODEX_OPENAI_MODEL_PROVIDER;
			const usesChatGPTSubscription = modelProvider === CODEX_OPENAI_MODEL_PROVIDER && account.status === 'signedIn' && account.authType === 'chatgpt';
			const pickerProvider = usesChatGPTSubscription ? 'chatgpt' : modelProvider;
			const data = [] as ModelListResponse['data'];
			let cursor: string | null = null;
			do {
				const response: ModelListResponse = await connection.client.request<'model/list', ModelListResponse>('model/list', { cursor, limit: 100, includeHidden: false });
				if (!this._isCurrentConnection(connection)) {
					return;
				}
				data.push(...response.data);
				cursor = response.nextCursor;
			} while (cursor !== null);
			const models = data
				.sort((left, right) => Number(right.isDefault) - Number(left.isDefault))
				.map((model): IAgentModelInfo => ({
					provider: CODEX_AGENT_PROVIDER_ID,
					id: toCodexModelSelectionId(modelProvider, model.model),
					name: model.displayName,
					supportsVision: model.inputModalities.includes('image'),
					configSchema: this._createReasoningEffortConfigSchema(model.supportedReasoningEfforts, model.defaultReasoningEffort, model.model),
					_meta: {
						...createAgentModelSourceMeta(usesChatGPTSubscription ? CHATGPT_SUBSCRIPTION_MODEL_SOURCE_ID : undefined),
						...createAgentModelGroupMeta(pickerProvider),
					},
				}));
			if (this._isCurrentConnection(connection)) {
				this._codexModels = models;
			}
		} catch (err) {
			this._logService.warn(`[Codex] Failed to refresh OpenAI models: ${err instanceof Error ? err.message : String(err)}`);
			// Keep the last known-good catalog; a transient periodic failure must
			// not make every model disappear.
		}
	}

	// #endregion

	// #region Connection lifecycle

	private _throwIfShuttingDown(): void {
		if (this._isShuttingDown || this._store.isDisposed) {
			throw new CancellationError();
		}
	}

	/**
	 * Cross the one process-lifetime activation boundary for Codex. Only session
	 * creation or restoration may retain a persistent app-server connection.
	 */
	private _activate(): void {
		this._throwIfShuttingDown();
		if (this._activated) {
			return;
		}
		this._activated = true;
		this._logService.info('[Codex] Activating app-server after explicit Codex use');
		// Deliberately queue rather than coalesce: an ambient refresh already in
		// flight may have observed the inactive state and skipped Codex models.
		void this._queueModelRefresh();
		void this._refreshProviderConfiguration();
		if (this._chatDiscoveryRequested) {
			void this._startCodexChatDiscovery();
		}
	}

	/**
	 * Run a standalone Codex action on the session-owned connection when Codex is
	 * active, or on a connection that is always torn down after the action.
	 * Passive catalogue actions and account controls must not cross the
	 * persistent activation boundary by themselves.
	 */
	private async _withOnDemandConnection<T>(operation: (client: ICodexAppServerClient, transient: boolean) => Promise<T>): Promise<T> {
		return this._onDemandConnectionSequencer.queue(async () => {
			this._throwIfShuttingDown();
			await this._startupAccountProbe.p;
			this._throwIfShuttingDown();
			// Recheck after waiting for earlier one-off work: selecting Codex while
			// this action was queued moves it onto the retained connection.
			if (this._activated || this._connection.kind !== 'idle') {
				return operation((await this._ensureConnection()).client, false);
			}
			const settled = new DeferredPromise<void>();
			this._transientConnectionOperation = settled.p;
			const cancellation = new CancellationTokenSource();
			this._transientConnectionCancellation = cancellation;
			let connection: IConnectionReady | undefined;
			try {
				connection = await this._startRawConnection(this._startupAccountProbeTimeoutMs, cancellation.token);
				this._transientAccountConnection = connection;
				return await operation(connection.client, true);
			} finally {
				if (connection && this._transientAccountConnection === connection) {
					this._transientAccountConnection = undefined;
					this._disposeConnectionResources(connection);
				}
				if (this._transientConnectionCancellation === cancellation) {
					this._transientConnectionCancellation = undefined;
				}
				cancellation.dispose();
				if (this._transientConnectionOperation === settled.p) {
					this._transientConnectionOperation = undefined;
				}
				await settled.complete(undefined);
			}
		});
	}

	/**
	 * Resolve the account indicator once at startup without downloading the SDK
	 * or retaining any app-server resources.
	 */
	private async _probeAccountAtStartup(): Promise<void> {
		let connection: IConnectionReady | undefined;
		try {
			if (this._isShuttingDown || this._store.isDisposed || !(await this._isSdkResolvableWithoutDownload()) || this._isShuttingDown || this._store.isDisposed) {
				return;
			}
			this._logService.info('[Codex] starting one-off startup account probe');
			const probeConnection = connection = await this._startRawConnection(this._startupAccountProbeTimeoutMs, this._startupAccountProbeCancellation.token);
			this._transientAccountConnection = probeConnection;
			const account = await raceTimeout((async () => {
				const state = await this._refreshAccountState(probeConnection.client, true);
				if (state.status === 'signedIn' && state.authType === 'chatgpt' && this._isCurrentChatGPTAccountClient(probeConnection.client, state.email)) {
					const profileImageRequest = ++this._openAIAccountProfileImageRequest;
					await Promise.all([
						this._refreshAccountRateLimits(probeConnection.client, state.email),
						this._readAccountProfileImageAuthentication(probeConnection.client, state.email, profileImageRequest).then(authentication => {
							if (authentication) {
								// The access token is all the profile request needs from the
								// app-server. Let the network/image work continue after the
								// one-off native process has been released.
								void this._refreshAccountProfileImageFromAuthentication(authentication, state.email, profileImageRequest);
							}
						}),
					]);
				}
				return state;
			})(),
				this._startupAccountProbeTimeoutMs,
				() => this._logService.warn(`[Codex] startup account probe timed out after ${this._startupAccountProbeTimeoutMs}ms`),
			);
			if (account === undefined) {
				return;
			}
		} catch (error) {
			if (!(error instanceof CancellationError)) {
				this._logService.warn(`[Codex] startup account probe failed: ${error instanceof Error ? error.message : String(error)}`);
			}
		} finally {
			if (connection) {
				if (this._transientAccountConnection === connection) {
					this._transientAccountConnection = undefined;
					this._disposeConnectionResources(connection);
					this._logService.info('[Codex] stopped one-off startup account probe');
				}
			}
		}
	}

	/**
	 * Lazily spawn the codex app-server, initialize the connection,
	 * authenticate via apiKey, and return the ready connection. Idempotent
	 * — concurrent callers share the same promise.
	 */
	private async _ensureConnection(): Promise<IConnectionReady> {
		this._throwIfShuttingDown();
		if (this._connection.kind === 'ready') {
			return Promise.resolve(this._connection);
		}
		if (this._connection.kind === 'starting') {
			return this._connection.promise;
		}
		const generation = this._connectionGeneration;
		const cancellation = new CancellationTokenSource();
		const startPromise = (async () => {
			await this._startupAccountProbe.p;
			this._throwIfShuttingDown();
			if (cancellation.token.isCancellationRequested) {
				throw new CancellationError();
			}
			const transientOperation = this._transientConnectionOperation;
			if (transientOperation) {
				await transientOperation;
			}
			this._throwIfShuttingDown();
			return this._startConnection(generation, cancellation.token);
		})();
		const promise = startPromise.then(async ready => {
			if (generation !== this._connectionGeneration) {
				this._disposeConnectionResources(ready);
				throw new CodexConnectionReplacedError('Codex app-server was replaced while starting');
			}
			// Authentication can complete while the connection is starting; apply the latest token before publishing ready.
			ready.proxyHandle.setToken(this._githubToken ?? '');
			// Skill roots are process-global app-server state. Seed every new process
			// before exposing it to thread/start or thread/resume, including a
			// replacement process after an unexpected disconnect.
			await this._queueSkillExtraRootsForClient(ready.client);
			if (generation !== this._connectionGeneration) {
				this._disposeConnectionResources(ready);
				throw new CodexConnectionReplacedError('Codex app-server was replaced while starting');
			}
			this._connection = { kind: 'ready', ...ready };
			void this._refreshAccount(ready.client);
			void this._refreshMcpInventory(ready.client, null);
			return ready;
		}).catch(err => {
			if (generation === this._connectionGeneration) {
				this._connection = { kind: 'idle' };
			}
			throw err;
		}).finally(() => cancellation.dispose());
		this._connection = { kind: 'starting', promise, cancellation };
		return promise;
	}

	/**
	 * Resolve the Codex SDK root — the directory whose
	 * `node_modules/@openai/codex-<target>/…` holds the native binary.
	 *
	 * Mirrors the three-tier resolution in `ClaudeAgentSdkService._loadSdk`:
	 *   1. dev override / product download, via the downloader, when the SDK
	 *      `isAvailable` (env override || `product.agentSdks.codex`);
	 *   2. dev fallback to this repo's `node_modules`, where `@openai/codex`
	 *      and its per-host binary package are devDependencies — this is what
	 *      lets running-from-source (and dev smoke tests) spawn Codex without
	 *      an env-var override.
	 *
	 * `isAvailable` is already false in dev, so it discriminates the two
	 * without injecting `INativeEnvironmentService`. When neither path
	 * resolves we defer to the downloader so callers get its actionable
	 * "not configured" diagnostic.
	 */
	private async _resolveSdkRoot(token: CancellationToken = CancellationToken.None): Promise<string> {
		if (this._agentSdkDownloader.isAvailable(CodexSdkPackage)) {
			return this._agentSdkDownloader.loadSdkRoot(CodexSdkPackage, token);
		}
		const devRoot = await resolveCodexDevSdkRoot();
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		if (devRoot) {
			this._logService.info(`[Codex] resolving SDK from repo node_modules (dev fallback): ${devRoot}`);
			return devRoot;
		}
		return this._agentSdkDownloader.loadSdkRoot(CodexSdkPackage, token);
	}

	private async _isSdkResolvableWithoutDownload(): Promise<boolean> {
		if (this._agentSdkDownloader.isAvailable(CodexSdkPackage)) {
			return this._agentSdkDownloader.isSdkResolvableWithoutDownload(CodexSdkPackage);
		}
		return (await resolveCodexDevSdkRoot()) !== undefined;
	}

	/** Spawn and initialize an app-server without retaining it as the agent's connection. */
	private async _startRawConnection(initializationTimeoutMs?: number, token: CancellationToken = CancellationToken.None): Promise<IConnectionReady> {
		// Resolve the Codex SDK root: dev override / product download via the
		// downloader, or this repo's `node_modules` in a source checkout (see
		// `_resolveSdkRoot`). We spawn the native codex binary inside the
		// platform package directly (the same shape the JS shim at
		// `node_modules/@openai/codex/bin/codex.js` would resolve to) — going
		// through the shim adds a launcher hop and forces an
		// `ELECTRON_RUN_AS_NODE` round-trip when the agent host runs as an
		// Electron utility process.
		const root = await this._resolveSdkRoot(token);
		const codexTarget = codexPackageSuffix(process.platform, process.arch);
		if (!codexTarget) {
			throw new Error(`Codex: unsupported platform ${process.platform}-${process.arch}`);
		}
		const triple = codexBinaryTriple(codexTarget);
		if (!triple) {
			throw new Error(`Codex: no binary triple known for sdkTarget '${codexTarget}'`);
		}
		const binaryName = process.platform === 'win32' ? 'codex.exe' : 'codex';
		const binaryPath = join(root, 'node_modules', `@openai/codex-${codexTarget}`, 'vendor', triple, 'bin', binaryName);
		try {
			fs.accessSync(binaryPath, fs.constants.X_OK);
		} catch (err) {
			throw new Error(`Codex binary not executable: ${binaryPath} (${err instanceof Error ? err.message : String(err)})`);
		}

		const proxyStart = this._codexProxyService.start(this._githubToken ?? '');
		let proxyHandle: ICodexProxyHandle;
		try {
			proxyHandle = await raceCancellationError(proxyStart, token);
		} catch (error) {
			// The proxy API has no cancellation input. If its start finishes after
			// this connection was cancelled, release that late handle immediately.
			void proxyStart.then(handle => handle.dispose(), () => { });
			throw error;
		}
		let child: ChildProcessWithoutNullStreams | undefined;
		let client: CodexAppServerClient | undefined;
		try {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			const extraArgs = parseBinaryArgs(process.env[AgentHostCodexAgentBinaryArgsEnvVar]);
			const telemetry = await this._otelService.getNativeSdkTelemetryConfig();
			const launchConfig = buildCodexLaunchConfig(process.env, proxyHandle, extraArgs, telemetry);
			const env = launchConfig.env;
			const userCodexHome = process.env[AgentHostCodexAgentCodexHomeEnvVar];
			if (userCodexHome) {
				env.CODEX_HOME = userCodexHome;
			}

			const args = [...launchConfig.args];
			// Launch overrides can contain user-supplied arguments and telemetry
			// exporter headers. Keep them out of the persistent agent-host log.
			this._logService.info(`[Codex] spawning app-server from ${binaryPath}`);
			child = spawn(binaryPath, args, { env, stdio: ['pipe', 'pipe', 'pipe'] });

			// Surface stderr to the log channel — codex writes useful startup
			// diagnostics there. Mirror Claude's pattern.
			child.stderr.setEncoding('utf8');
			child.stderr.on('data', chunk => this._logService.info(`[Codex stderr] ${String(chunk).trimEnd()}`));

			const transport = transportFromChildProcess(child);
			client = new CodexAppServerClient(transport, (level, msg) => {
				this._logService.info(`[CodexClient ${level}] ${msg}`);
			});

			// Initialize handshake. Failure here is fatal for this connection.
			const initialize = raceCancellationError(client.request<'initialize'>('initialize', {
				clientInfo: CLIENT_INFO,
				capabilities: { experimentalApi: true, requestAttestation: false, optOutNotificationMethods: null },
			}), token);
			if (initializationTimeoutMs === undefined) {
				await initialize;
			} else if (await raceTimeout(initialize, initializationTimeoutMs) === undefined) {
				throw new Error(`Codex app-server initialization timed out after ${initializationTimeoutMs}ms`);
			}
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			client.notify<'initialized'>('initialized', undefined as never);
			return { client, proxyHandle, child };
		} catch (err) {
			client?.dispose();
			proxyHandle.dispose();
			try { child?.kill('SIGKILL'); } catch { /* already dead */ }
			throw err;
		}
	}

	/** Start and retain the fully-wired connection used by Codex sessions. */
	private async _startConnection(generation: number, token: CancellationToken): Promise<IConnectionReady> {
		const raw = await this._startRawConnection(undefined, token);
		const subscriptions = new DisposableStore();
		const ready: IConnectionReady = { ...raw, subscriptions };
		const { client } = ready;

		// Tear everything down if the persistent child dies on its own.
		subscriptions.add(client.onExit(e => {
			this._logService.warn(`[Codex] app-server exited code=${e.code} signal=${e.signal}`);
			this._handleConnectionLost(ready, generation);
		}));
		subscriptions.add(client.onTransportError(err => {
			this._logService.error(`[Codex] transport error: ${err.message}`);
			this._handleConnectionLost(ready, generation);
		}));
		// The raw initialize response can win a race with the child exiting. An
		// exit that happened before the listeners above were attached is not
		// replayed by Node's EventEmitter, so inspect the child after subscribing
		// and reject instead of publishing a permanently dead ready connection.
		const exitCode = raw.child.exitCode;
		const signalCode = raw.child.signalCode;
		if ((exitCode !== null && exitCode !== undefined) || (signalCode !== null && signalCode !== undefined)) {
			this._disposeConnectionResources(ready);
			throw new Error(`Codex app-server exited before persistent startup completed (code=${exitCode ?? 'null'}, signal=${signalCode ?? 'null'})`);
		}

		// Wire global notification → SessionAction dispatch.
		this._registerIgnoredNotifications(client, subscriptions);
		subscriptions.add(client.onNotification('account/login/completed', () => {
			void this._refreshAccount(client).then(() => this._queueModelRefresh());
		}));
		subscriptions.add(client.onNotification('account/updated', () => {
			if (this._connection.kind === 'ready' && this._connection.client === client) {
				void this._refreshAccount(client);
				this._queueModelRefresh();
			}
		}));
		subscriptions.add(client.onNotification('account/rateLimits/updated', () => {
			if (this._connection.kind === 'ready' && this._connection.client === client && this._openAIAccountState.status === 'signedIn' && this._openAIAccountState.authType === 'chatgpt') {
				void this._refreshAccountRateLimits(client);
			}
		}));
		subscriptions.add(client.onNotification('skills/changed', () => this._queueSkillHookCustomizationRefresh(client)));
		subscriptions.add(client.onNotification('turn/started', params => this._dispatchByThread(params.threadId, s => this._handleTurnStartedNotification(s, params))));
		subscriptions.add(client.onNotification('item/started', params => this._dispatchByThread(params.threadId, s => this._handleItemStarted(s, params))));
		subscriptions.add(client.onNotification('item/agentMessage/delta', params => this._dispatchByThread(params.threadId, s => mapAgentMessageDelta(s.mapState, this._withHostTurnId(s, params)))));
		subscriptions.add(client.onNotification('item/commandExecution/outputDelta', params => this._dispatchByThread(params.threadId, s => mapCommandExecutionOutputDelta(s.mapState, this._withHostTurnId(s, params)))));
		subscriptions.add(client.onNotification('item/fileChange/patchUpdated', params => this._dispatchByThread(params.threadId, s => mapFileChangePatchUpdated(s.mapState, this._withHostTurnId(s, params)))));
		subscriptions.add(client.onNotification('item/fileChange/outputDelta', params => this._dispatchByThread(params.threadId, s => mapFileChangeOutputDelta(s.mapState, this._withHostTurnId(s, params)))));
		subscriptions.add(client.onNotification('item/mcpToolCall/progress', params => this._dispatchByThread(params.threadId, s => mapMcpToolCallProgress(s.mapState, this._withHostTurnId(s, params)))));
		subscriptions.add(client.onNotification('item/reasoning/summaryPartAdded', params => this._dispatchByThread(params.threadId, s => mapReasoningSummaryPartAdded(s.mapState, this._withHostTurnId(s, params)))));
		subscriptions.add(client.onNotification('item/reasoning/summaryTextDelta', params => this._dispatchByThread(params.threadId, s => mapReasoningSummaryTextDelta(s.mapState, this._withHostTurnId(s, params)))));
		subscriptions.add(client.onNotification('item/reasoning/textDelta', params => this._dispatchByThread(params.threadId, s => mapReasoningTextDelta(s.mapState, this._withHostTurnId(s, params)))));
		subscriptions.add(client.onNotification('thread/tokenUsage/updated', params => this._dispatchTokenUsageUpdated(params)));
		subscriptions.add(client.onNotification('item/completed', params => this._dispatchItemCompleted(params)));
		subscriptions.add(client.onNotification('turn/completed', params => this._dispatchTurnCompleted(params)));
		// Auto-review (guardian) surfacing. The guardian turn-interruption warning
		// is shown as a system notification; terminal review failures are surfaced
		// from the structured completion event, and a denied review also gets a
		// retroactive "Approve anyway" tool-call card. The review lifecycle is
		// non-blocking (codex does not wait on us), so the completed handler is async
		// and resolves its session directly rather than via _dispatchByThread.
		subscriptions.add(client.onNotification('guardianWarning', params => this._dispatchByThread(params.threadId, s => this._handleGuardianWarning(s, params))));
		subscriptions.add(client.onNotification('item/autoApprovalReview/completed', params => { void this._handleGuardianReviewCompleted(client, params); }));

		// The notification's thread id scopes per-session MCP configurations.
		subscriptions.add(client.onNotification('mcpServer/startupStatus/updated', params => this._handleMcpStartupStatus(client, params.threadId, params.name, params.status, params.error)));

		// Phase 4: command-execution approval requests. Park on a
		// per-session deferred, emit `ChatToolCallReady` in the
		// PendingConfirmation state, and answer codex when the user
		// (or accept-for-session memoization) decides.
		subscriptions.add(client.onRequest<'item/commandExecution/requestApproval'>(
			'item/commandExecution/requestApproval',
			params => this._handleCommandApprovalRequestRpc(params),
		));

		// File-change and permission-escalation approval requests (raised in
		// non-`danger-full-access` sandboxes / on the on-request approval
		// policy). Surface them through the same pending-confirmation flow.
		subscriptions.add(client.onRequest<'item/fileChange/requestApproval'>(
			'item/fileChange/requestApproval',
			params => this._handleFileChangeApprovalRequestRpc(params),
		));
		subscriptions.add(client.onRequest<'item/permissions/requestApproval'>(
			'item/permissions/requestApproval',
			params => this._handlePermissionsApprovalRequestRpc(params),
		));

		// Client-provided (dynamic) tool execution requests. Codex asks the
		// host to run a tool registered via `thread/start.dynamicTools`; we
		// route the call to the owning workbench client and answer with its
		// result.
		subscriptions.add(client.onRequest<'item/tool/call'>(
			'item/tool/call',
			params => this._handleDynamicToolCallRpc(params),
		));

		// User-input requests (the model's `ask_user`). Surface the questions
		// as a chat input request and answer codex with the user's response.
		subscriptions.add(client.onRequest<'item/tool/requestUserInput'>(
			'item/tool/requestUserInput',
			params => this._handleUserInputRequestRpc(params),
		));

		// MCP elicitation requests. An MCP server (relayed by codex) asks the
		// user for structured input mid-tool-call. Surface it through the same
		// chat-input flow as `ask_user` and answer codex with accept/decline/cancel.
		subscriptions.add(client.onRequest<'mcpServer/elicitation/request'>(
			'mcpServer/elicitation/request',
			params => this._handleElicitationRequestRpc(params),
		));

		return ready;
	}

	/**
	 * Builds the `mcp_servers` object for a session's `thread/start.config`:
	 * the workbench's root `mcpServers` config merged with the session's
	 * enabled client-plugin MCP servers. Passing them per-thread (rather than
	 * as process-global `-c` spawn overrides) means each new session picks up
	 * the current root config without restarting the shared app-server, and it
	 * merges with (leaves intact) the user's global `~/.codex/config.toml`.
	 * Client-plugin servers win a name collision with the root config. Any
	 * OAuth bearer token acquired for an auth-gated http server (see
	 * {@link handleAuthenticationToken}) is injected as an `Authorization`
	 * header so codex connects authenticated.
	 */
	private _buildSessionMcpServers(session: ICodexSession): Record<string, ICodexMcpServerConfigJson> {
		const configuredRoot = codexMcpServersFromConfig(this._configurationService.getRootValue(platformRootSchema, AgentHostMcpServersConfigKey));
		const root = Object.fromEntries(
			Object.entries(configuredRoot)
				.filter(([name]) => this._isMcpServerEnabledForSdk(session, name)),
		);
		const workspace = codexMcpServersFromDefinitions(this._sessionMcpDiscoveries.get(session.sessionId)?.discovery.definitions ?? []);
		const enabledWorkspace = Object.fromEntries(Object.entries(workspace).filter(([name]) => this._isMcpServerEnabledForSdk(session, name)));
		const clientPlugins = codexMcpServersFromPlugins(this._enabledClientPlugins(session), session.workingDirectory);
		const enabledConfiguredServers = session.agentMergeTurn ? {} : { ...root, ...enabledWorkspace, ...clientPlugins };
		const builtInGitHub = this._builtInGitHubMcpServer(session, enabledConfiguredServers);
		return injectCodexMcpAuthTokens({ ...builtInGitHub, ...enabledConfiguredServers }, this._mcpAuthTokens);
	}

	private _builtInGitHubMcpServer(session: ICodexSession, configuredServers: Record<string, ICodexMcpServerConfigJson>): Record<string, ICodexMcpServerConfigJson> {
		if (session.agentMergeTurn
			|| !this._githubMcpServerEnabled
			|| !this._githubToken
			|| !this._gitHubMcpServerConfiguration
			|| !this._isMcpServerEnabledForSdk(session, GITHUB_MCP_SERVER_NAME)
			|| this._hasConfiguredGitHubMcpServer(configuredServers)) {
			return {};
		}
		return { [GITHUB_MCP_SERVER_NAME]: toCodexMcpServerJson(this._gitHubMcpServerConfiguration) };
	}

	private _hasConfiguredGitHubMcpServer(configuredServers: Record<string, ICodexMcpServerConfigJson>): boolean {
		return Object.entries(configuredServers).some(([name, server]) => this._isGitHubMcpServer(name, server));
	}

	private _isGitHubMcpServer(name: string, server: ICodexMcpServerConfigJson): boolean {
		const builtInUrl = this._gitHubMcpServerConfiguration?.type === McpServerType.REMOTE
			? normalizeCodexMcpResourceUrl(this._gitHubMcpServerConfiguration.url)
			: undefined;
		return name === GITHUB_MCP_SERVER_NAME
			|| builtInUrl !== undefined && server.url !== undefined && normalizeCodexMcpResourceUrl(server.url) === builtInUrl;
	}

	private async _refreshSessionMcpDiscovery(session: ICodexSession): Promise<void> {
		const roots = session.workingDirectories?.length
			? session.workingDirectories
			: session.workingDirectory ? [session.workingDirectory] : [];
		if (roots.length === 0) {
			return;
		}
		const rootsSignature = JSON.stringify(roots.map(root => root.toString()));
		let entry = this._sessionMcpDiscoveries.get(session.sessionId);
		if (entry?.rootsSignature !== rootsSignature) {
			entry?.dispose();
			const store = new DisposableStore();
			const discovery = store.add(new SessionMcpDiscovery(roots, this._fileService));
			store.add(discovery.onDidChange(() => {
				session.materializedMcpSig = undefined;
				if (session.firstTurnSent) {
					this._markSessionForReload(session);
				}
			}));
			entry = { rootsSignature, discovery, dispose: () => store.dispose() };
			this._sessionMcpDiscoveries.set(session.sessionId, entry);
		}
		await entry.discovery.refresh();
	}

	private _isMcpServerEnabledForSdk(session: ICodexSession, name: string): boolean {
		const resolution = this._customizationEnablementService.resolve(session.configurationResource.toString(), targetForUnownedMcpServer(name));
		return resolution.kind === 'resolved' && resolution.enabled;
	}

	/**
	 * The normalized URLs of every configured http MCP server (root config +
	 * the session's client plugins), keyed by server name. Used to (a) surface
	 * an auth-required server's resource for the workbench sign-in and (b)
	 * match a workbench-acquired token back to the server(s) it unlocks.
	 * Computed from a token-free build so the URLs are the bare server URLs.
	 */
	private _httpMcpServerUrls(session: ICodexSession): Map<string, string> {
		const root = Object.fromEntries(
			Object.entries(codexMcpServersFromConfig(this._configurationService.getRootValue(platformRootSchema, AgentHostMcpServersConfigKey)))
				.filter(([name]) => this._isMcpServerEnabledForSdk(session, name)),
		);
		const workspace = codexMcpServersFromDefinitions(this._sessionMcpDiscoveries.get(session.sessionId)?.discovery.definitions ?? []);
		const enabledWorkspace = Object.fromEntries(Object.entries(workspace).filter(([name]) => this._isMcpServerEnabledForSdk(session, name)));
		const clientPlugins = codexMcpServersFromPlugins(this._enabledClientPlugins(session), session.workingDirectory);
		const configuredServers = { ...root, ...enabledWorkspace, ...clientPlugins };
		const builtInGitHub = this._builtInGitHubMcpServer(session, configuredServers);
		const urls = new Map<string, string>();
		for (const [name, server] of Object.entries({ ...builtInGitHub, ...configuredServers })) {
			const normalized = server.url !== undefined ? normalizeCodexMcpResourceUrl(server.url) : undefined;
			if (normalized !== undefined) {
				urls.set(name, normalized);
			}
		}
		return urls;
	}

	private _mcpServerUrlForName(threadId: string, name: string): string | undefined {
		const session = this._sessionForMcpThread(threadId);
		return session ? this._buildSessionMcpServers(session)[name]?.url : undefined;
	}

	private _sessionForMcpThread(threadId: string): ICodexSession | undefined {
		const sessionId = this._sessionIdByThreadId.get(threadId);
		return sessionId === undefined ? undefined : this._sessions.get(sessionId);
	}

	/**
	 * Map the session's tools into codex `dynamicTools` specs: the agent host's
	 * server tools (executed in-process) plus the workbench client's tools
	 * (round-tripped to the client). Both are registered with codex the same
	 * way — at `thread/start` — and dispatched apart in
	 * {@link _handleDynamicToolCallRpc} by name.
	 */
	private _buildDynamicTools(session: ICodexSession): DynamicToolSpec[] | undefined {
		const serverTools = this._serverToolHost?.getDefinitionsForSession(session.configurationResource.toString()) ?? [];
		const clientTools = session.clientToolSet.merged();
		// Server tools first; a server tool name shadows a colliding client tool
		// (the agent host owns those names) and matches the routing order below.
		const seen = new Set<string>();
		const all: ToolDefinition[] = [];
		for (const t of [...serverTools, ...clientTools]) {
			if (seen.has(t.name)) {
				continue;
			}
			seen.add(t.name);
			all.push(t);
		}
		if (all.length === 0) {
			return undefined;
		}
		return all.map(t => ({
			type: 'function' as const,
			name: t.name,
			description: t.description ?? '',
			inputSchema: (t.inputSchema ?? { type: 'object' }) as JsonValue,
		}));
	}

	private async _handleDynamicToolCallRpc(params: DynamicToolCallParams): Promise<ServerRequestHandlerResult<DynamicToolCallResponse>> {
		const sessionId = this._sessionIdByThreadId.get(params.threadId);
		const session = sessionId ? this._sessions.get(sessionId) : undefined;
		if (!session) {
			return { result: this._toolFailure(`Codex tool call for unknown thread ${params.threadId}`) };
		}
		if (session.agentMergeTurn && isGitHubMcpToolName(params.tool)) {
			this._logService.warn(`[Codex:${session.sessionId}] Denying restricted Agent Merge tool: ${params.tool}`);
			return { result: this._toolFailure(AGENT_MERGE_GITHUB_TOOL_RESTRICTION) };
		}
		// Server tools are executed in-process against the session's own state
		// (no workbench round-trip). We register them under their bare name, so
		// codex calls back with `namespace === null`. Dispatch them here before
		// the client-tool path below.
		const host = this._serverToolHost;
		if (host && params.namespace === null && host.toolNames.includes(params.tool)) {
			try {
				const chatChannel = session.chatChannel?.toString();
				if (!chatChannel) {
					return { result: this._toolFailure(`No chat channel for server tool ${params.tool}`) };
				}
				if (host.requiresConfirmation(chatChannel, params.tool)) {
					const entry = session.mapState.itemToToolCall.get(params.callId);
					if (!entry) {
						return { result: this._toolFailure(`No pending server tool call for ${params.tool} (callId ${params.callId})`) };
					}
					const display = getServerToolDisplay(params.tool, params.arguments);
					const invocationMessage = display?.confirmationMessage ?? display?.invocationMessage ?? `Calling ${params.tool}`;
					const decision = await session.pendingCommandApprovals.registerAndFire(entry.toolCallId, () => {
						this._fire(session.sessionUri, {
							type: ActionType.ChatToolCallReady,
							turnId: entry.turnId,
							toolCallId: entry.toolCallId,
							invocationMessage,
							confirmationTitle: display?.confirmationTitle ?? localize('codex.serverToolConfirmation.title', "Allow tool call?"),
						});
					});
					if (decision !== 'accept' && decision !== 'acceptForSession') {
						return { result: this._toolFailure(`Server tool ${params.tool} was not approved`) };
					}
				}
				const text = host.executeTool(chatChannel, params.tool, params.arguments);
				return { result: { contentItems: [{ type: 'inputText', text: await text }], success: true } };
			} catch (err) {
				return { result: this._toolFailure(`Server tool ${params.tool} failed: ${err instanceof Error ? err.message : String(err)}`) };
			}
		}
		// `item/started` for the `dynamicToolCall` (id === callId) is delivered
		// before this request and seeds the host toolCallId + ChatToolCallReady
		// the owning client reacts to. Look it up so the client's completion
		// (keyed by that toolCallId) resolves this request.
		const toolCallId = session.mapState.itemToToolCall.get(params.callId)?.toolCallId;
		if (toolCallId === undefined) {
			return { result: this._toolFailure(`No pending client tool call for ${params.tool} (callId ${params.callId})`) };
		}
		if (session.clientToolSet.size === 0) {
			return { result: this._toolFailure(`No client available to run ${params.tool}`) };
		}
		try {
			// `register` consumes any result the client already delivered (the
			// display path emits ChatToolCallReady before this request, so the
			// completion can race ahead — PendingRequestRegistry buffers it).
			const result = await session.pendingClientToolCalls.register(toolCallId);
			return { result: dynamicToolResponseFromResult(result) };
		} catch (err) {
			if (err instanceof CancellationError) {
				return { result: this._toolFailure(`Client tool ${params.tool} was cancelled`) };
			}
			return { result: this._toolFailure(`Client tool ${params.tool} failed: ${err instanceof Error ? err.message : String(err)}`) };
		}
	}

	private _toolFailure(message: string): DynamicToolCallResponse {
		this._logService.warn(`[Codex] dynamic tool call failed: ${message}`);
		return { contentItems: [{ type: 'inputText', text: message }], success: false };
	}

	private async _handleUserInputRequestRpc(params: ToolRequestUserInputParams): Promise<ServerRequestHandlerResult<ToolRequestUserInputResponse>> {
		const sessionId = this._sessionIdByThreadId.get(params.threadId);
		const session = sessionId ? this._sessions.get(sessionId) : undefined;
		if (!session) {
			return { result: emptyUserInputResponse(params.questions) };
		}
		if (!session.currentTurnId) {
			this._logService.warn(`[Codex] user input request without an active turn for threadId=${params.threadId}; returning empty answers`);
			return { result: emptyUserInputResponse(params.questions) };
		}
		// MCP tool-call approvals arrive as a single `request_user_input`
		// question id'd `mcp_tool_call_approval_<callId>`. Render them on the
		// normal tool-approval card (mirroring shell/file approvals) instead of
		// a chat-input question, when the originating `mcpToolCall` item's host
		// tool call is known. Falls through to the chat-input path otherwise.
		const approvalQuestion = params.questions.length === 1 && params.questions[0].id.startsWith(MCP_TOOL_APPROVAL_QUESTION_ID_PREFIX)
			? params.questions[0]
			: undefined;
		if (approvalQuestion) {
			const callId = approvalQuestion.id.slice(MCP_TOOL_APPROVAL_QUESTION_ID_PREFIX.length);
			const entry = session.mapState.itemToToolCall.get(callId);
			if (entry) {
				return this._handleMcpToolApprovalViaCard(session, approvalQuestion, entry);
			}
		}
		const requestId = generateUuid();
		const request = buildUserInputRequest(requestId, params.questions);
		try {
			const result = await session.pendingUserInputs.registerAndFire(requestId, () => {
				this._fire(session.sessionUri, { type: ActionType.ChatInputRequested, request });
			});
			return { result: userInputResponseFromAnswers(params.questions, result.response, result.answers) };
		} catch (err) {
			// Session disposed / connection lost while awaiting; answer codex
			// with empty answers so the turn unwinds instead of hanging.
			return { result: emptyUserInputResponse(params.questions) };
		}
	}

	/**
	 * Renders an MCP tool-call approval on the normal tool-approval card
	 * (a pending-confirmation `ChatToolCallReady` on the originating
	 * `mcpToolCall` host tool call) rather than as a chat-input question.
	 * The user's Allow/Deny decision is mapped back to the answer string
	 * codex expects (`Allow` / `__codex_mcp_decline__`). Mirrors the shell
	 * command approval flow ({@link CodexAgent._handleCommandApprovalRequest}).
	 */
	private async _handleMcpToolApprovalViaCard(
		session: ICodexSession,
		question: ToolRequestUserInputQuestion,
		entry: { readonly toolCallId: string; readonly turnId: string },
	): Promise<{ readonly result: ToolRequestUserInputResponse }> {
		const confirmationTitle = question.question || question.header || 'Run MCP tool';
		let decision: CommandExecutionApprovalDecision;
		try {
			decision = await session.pendingCommandApprovals.registerAndFire(entry.toolCallId, () => {
				this._fire(session.sessionUri, {
					type: ActionType.ChatToolCallReady,
					turnId: entry.turnId,
					toolCallId: entry.toolCallId,
					invocationMessage: confirmationTitle,
					toolInput: confirmationTitle,
					confirmationTitle,
				});
			});
		} catch (err) {
			// Session disposed / connection lost while awaiting; decline so the
			// codex-side MCP tool call unwinds instead of hanging.
			decision = 'decline';
		}
		const allow = decision === 'accept' || decision === 'acceptForSession';
		const answer = allow ? MCP_TOOL_APPROVAL_ANSWER_ALLOW : MCP_TOOL_APPROVAL_ANSWER_DECLINE;
		return { result: { answers: { [question.id]: { answers: [answer] } } } };
	}

	private async _handleElicitationRequestRpc(params: McpServerElicitationRequestParams): Promise<ServerRequestHandlerResult<McpServerElicitationRequestResponse>> {
		const sessionId = this._sessionIdByThreadId.get(params.threadId);
		const session = sessionId ? this._sessions.get(sessionId) : undefined;
		this._logService.info(`[Codex] elicitation request threadId=${params.threadId} mode=${params.mode} server=${params.serverName} session=${session ? session.sessionId : 'NONE'}`);
		if (!session) {
			this._logService.warn(`[Codex] elicitation request for unknown threadId=${params.threadId}; declining`);
			return { result: declinedElicitationResponse() };
		}
		if (!session.currentTurnId) {
			this._logService.warn(`[Codex] elicitation request without an active turn for threadId=${params.threadId}; declining`);
			return { result: declinedElicitationResponse() };
		}
		const requestId = generateUuid();
		const request = buildElicitationRequest(requestId, params);
		try {
			const result = await session.pendingUserInputs.registerAndFire(requestId, () => {
				this._fire(session.sessionUri, { type: ActionType.ChatInputRequested, request });
			});
			this._logService.info(`[Codex] elicitation resolved requestId=${requestId} response=${result.response}`);
			return { result: elicitationResponseFromAnswers(params, result.response, result.answers) };
		} catch (err) {
			// Session disposed / connection lost while awaiting; cancel the
			// elicitation so the MCP server's request unwinds.
			this._logService.info(`[Codex] elicitation cancelled requestId=${requestId}: ${err instanceof Error ? err.message : String(err)}`);
			return { result: cancelledElicitationResponse() };
		}
	}

	private _hostTurnId(session: ICodexSession, appTurnId: string): string {
		return session.hostTurnIdByAppTurnId.get(appTurnId) ?? appTurnId;
	}

	private _withHostTurnId<T extends { readonly turnId: string }>(session: ICodexSession, params: T): T {
		const turnId = this._hostTurnId(session, params.turnId);
		return turnId === params.turnId ? params : { ...params, turnId };
	}

	private _withHostTurn<T extends { readonly turn: { readonly id: string } }>(session: ICodexSession, params: T): T {
		const appTurnId = params.turn.id;
		const hostTurnId = session.currentTurnId ?? this._hostTurnId(session, appTurnId);
		session.hostTurnIdByAppTurnId.set(appTurnId, hostTurnId);
		session.currentAppTurnId = appTurnId;
		return hostTurnId === appTurnId ? params : { ...params, turn: { ...params.turn, id: hostTurnId } };
	}

	private _handleTurnStartedNotification(session: ICodexSession, params: TurnStartedNotification): (SessionAction | ChatAction)[] {
		// The workbench already dispatched the canonical turn start before sendMessage.
		// Codex's event only establishes app-server turn id correlation for later items.
		const appTurnId = params.turn.id;
		const mapped = this._withHostTurn(session, params);
		this._persistTurnEventId(session, mapped.turn.id, appTurnId);
		mapTurnStarted(session.mapState, mapped, session.lastPromptText);
		return [];
	}

	private _persistTurnEventId(session: ICodexSession, hostTurnId: string, appTurnId: string): void {
		// Copilot already records this bridge, while Claude reuses the host turn id as its transcript uuid.
		const storage = session.chatChannel ? chatStorageUri(session.chatChannel) : undefined;
		if (!storage) {
			return;
		}
		const ref = this._sessionDataService.openDatabase(storage);
		ref.object.setTurnEventId(hostTurnId, appTurnId).catch(error => {
			this._logService.warn(`[Codex:${session.threadId}] Failed to persist turn id mapping ${hostTurnId} -> ${appTurnId}`, error);
		}).finally(() => ref.dispose());
	}

	private _handleTurnCompletedNotification(session: ICodexSession, params: TurnCompletedNotification): (SessionAction | ChatAction)[] {
		const appTurnId = params.turn.id;
		const hostTurnId = this._hostTurnId(session, appTurnId);
		const out = mapTurnCompleted(session.mapState, this._withHostTurn(session, params), this._clearTurnStopWatch(session));
		// Remember which codex (app-server) turn each workbench turn maps to so
		// truncateChat can translate a host turn id to a thread rollback even
		// after the live correlation below is cleared.
		session.codexTurnIdByHostTurnId.set(hostTurnId, appTurnId);
		// Codex reports app-server turn ids, while the workbench owns host turn ids.
		// Clear the correlation after completion so later turns cannot reuse stale ids.
		if (session.currentAppTurnId === appTurnId || session.currentTurnId === hostTurnId) {
			session.currentTurnId = undefined;
			session.currentAppTurnId = undefined;
			session.agentMergeTurn = false;
		}
		session.hostTurnIdByAppTurnId.delete(appTurnId);
		// Any steering still buffered was never echoed as a `userMessage`
		// item; clear the pending bubble now that the turn is over.
		this._drainPendingSteering(session);
		// Unwind any still-pending "Approve anyway" guardian cards. codex does not
		// block on them, so the reducer cancels the card when the turn ends; here
		// we resolve the parked deferred (`cancel`) so the suspended
		// {@link _handleGuardianReviewCompleted} frame unwinds instead of leaking
		// until session dispose. The durable denial notification already emitted
		// remains in the transcript.
		if (session.pendingGuardianReviewCards.size > 0) {
			for (const guardianToolCallId of [...session.pendingGuardianReviewCards]) {
				session.pendingCommandApprovals.respond(guardianToolCallId, 'cancel');
			}
		}
		return out;
	}

	/**
	 * Dispatch a codex `item/started` notification. `userMessage` items are
	 * intercepted here (rather than in the pure mapper) because steering
	 * promotion needs the agent's per-session turn-correlation state; all
	 * other item kinds defer to {@link mapItemStarted}.
	 */
	private _handleItemStarted(session: ICodexSession, params: ItemStartedNotification): (SessionAction | ChatAction)[] {
		if (params.item.type === 'userMessage') {
			return this._handleSteeredUserMessage(session, params.item.content);
		}
		return mapItemStarted(session.mapState, this._withHostTurnId(session, params));
	}

	/**
	 * Codex echoes every user message — the turn opener (already shown by
	 * the workbench before `sendMessage`) and any steered input — as a
	 * `userMessage` item. Only steered input is buffered in
	 * {@link ICodexSession.pendingSteeringFlips}; a buffered match is
	 * promoted into its own visible turn and everything else is dropped.
	 */
	private _handleSteeredUserMessage(session: ICodexSession, content: readonly UserInput[]): (SessionAction | ChatAction)[] {
		const text = extractUserInputText(content);
		const steering = this._takeMatchingPendingSteering(session, text);
		if (!steering) {
			return [];
		}
		return this._beginSteeringTurn(session, steering);
	}

	/**
	 * Pop the buffered steering message whose text matches the echoed
	 * `userMessage` content. Matching by content (not FIFO) keeps the
	 * mapping correct when several steering messages with different texts
	 * are in flight.
	 */
	private _takeMatchingPendingSteering(session: ICodexSession, text: string): PendingMessage | undefined {
		for (const [id, msg] of session.pendingSteeringFlips) {
			if (msg.message.text === text) {
				session.pendingSteeringFlips.delete(id);
				return msg;
			}
		}
		return undefined;
	}

	/**
	 * Promote a steered message into its own protocol turn: complete the
	 * in-flight turn (so its response parts settle into history) and open a
	 * fresh turn whose user message is the steering content. The
	 * `queuedMessageId` clears the corresponding pending steering bubble.
	 * Subsequent codex items for the same app-server turn are re-mapped to
	 * the new host turn id so the steering response lands there.
	 */
	private _beginSteeringTurn(session: ICodexSession, steering: PendingMessage): (SessionAction | ChatAction)[] {
		const actions: (SessionAction | ChatAction)[] = [];
		const appTurnId = session.currentAppTurnId;
		const previousHostTurnId = session.currentTurnId ?? (appTurnId ? this._hostTurnId(session, appTurnId) : undefined);
		actions.push(...finalizeCodexTurnMapState(session.mapState, 'Turn was superseded by a steering message before the tool reported completion'));
		if (previousHostTurnId) {
			actions.push({ type: ActionType.ChatTurnComplete, turnId: previousHostTurnId, duration: this._clearTurnStopWatch(session) });
		}
		const newHostTurnId = generateUuid();
		if (appTurnId) {
			session.hostTurnIdByAppTurnId.set(appTurnId, newHostTurnId);
		}
		session.currentTurnId = newHostTurnId;
		actions.push({
			type: ActionType.ChatTurnStarted,
			turnId: newHostTurnId,
			startedAt: new Date().toISOString(),
			message: steering.message,
			queuedMessageId: steering.id,
		});
		this._startTurnStopWatch(session);
		return actions;
	}

	/**
	 * Clear any steering messages still buffered (never echoed by codex)
	 * and fire `steering_consumed` for each so the chat UI removes the
	 * lingering pending bubble. Called on turn completion, abort, dispose,
	 * and connection loss.
	 */
	private _drainPendingSteering(session: ICodexSession): void {
		if (session.pendingSteeringFlips.size === 0) {
			return;
		}
		const ids = [...session.pendingSteeringFlips.keys()];
		session.pendingSteeringFlips.clear();
		for (const id of ids) {
			this._fireSteeringConsumed(session, id);
		}
	}

	private _fireSteeringConsumed(session: ICodexSession, id: string): void {
		this._onDidChatProgress.fire({ kind: 'steering_consumed', chat: session.chatChannel!, id });
	}

	private _registerIgnoredNotifications(client: ICodexAppServerClient, subscriptions: DisposableStore): void {
		const ignored = [
			'thread/started', // thread/start response is authoritative for session materialization.
			'thread/status/changed', // Codex thread status is not surfaced in Agent Host state yet.
			'thread/settings/updated', // VS Code owns session config; Codex settings echoes are not consumed yet.
			'thread/goal/updated', // Goals are not surfaced in the Agent Host UI yet.
			'thread/goal/cleared', // Goals are not surfaced in the Agent Host UI yet.
			'thread/compacted', // Deprecated completion echo; the contextCompaction item owns UI progress.
			'remoteControl/status/changed', // Remote-control state is not part of the VS Code integration.
			'serverRequest/resolved', // We resolve requests through JSON-RPC responses, so this echo is informational.
			'item/autoApprovalReview/started', // Informational; the completed notification drives the denied-action card.
		] as const;
		for (const method of ignored) {
			subscriptions.add(client.onNotification(method, () => { /* intentionally ignored */ }));
		}
	}

	private async _refreshAccount(client: ICodexAppServerClient, publish = true, awaitDetails = false): Promise<ICodexAccountState> {
		const state = await this._refreshAccountState(client, publish);
		if (publish && state.status === 'signedIn' && state.authType === 'chatgpt' && this._isCurrentChatGPTAccountClient(client, state.email)) {
			const details = Promise.all([
				this._refreshAccountRateLimits(client, state.email),
				this._refreshAccountProfileImage(client, state.email),
			]);
			if (awaitDetails) {
				await details;
			} else {
				void details;
			}
		}
		return state;
	}

	private _refreshAccountState(client: ICodexAppServerClient, publish: boolean): Promise<ICodexAccountState> {
		return this._accountRefreshSequencer.queue(() => this._doRefreshAccount(client, publish));
	}

	private async _doRefreshAccount(client: ICodexAppServerClient, publish: boolean): Promise<ICodexAccountState> {
		try {
			const response = await client.request<'account/read', GetAccountResponse>('account/read', { refreshToken: false });
			const state = codexAccountStateFromResponse(response);
			if (!this._isActiveAccountClient(client)) {
				return state;
			}
			this._setOpenAIAccountState(state, publish);
			this._logService.info(`[Codex] account/read accountType=${response.account?.type ?? 'none'} requiresOpenaiAuth=${response.requiresOpenaiAuth}${state.planType ? ` planType=${state.planType}` : ''}`);
			return state;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this._logService.warn(`[Codex] account/read failed: ${message}`);
			const state: ICodexAccountState = { usageSource: 'openai', status: 'error', error: message };
			if (this._isActiveAccountClient(client)) {
				this._setOpenAIAccountState(state, publish);
			}
			return state;
		}
	}

	private async _refreshAccountProfileImage(client: ICodexAppServerClient, accountEmail = this._openAIAccountState.email): Promise<void> {
		const request = ++this._openAIAccountProfileImageRequest;
		const authentication = await this._readAccountProfileImageAuthentication(client, accountEmail, request);
		if (authentication) {
			await this._refreshAccountProfileImageFromAuthentication(authentication, accountEmail, request);
		}
	}

	private async _readAccountProfileImageAuthentication(client: ICodexAppServerClient, accountEmail: string | undefined, request: number): Promise<{ readonly authToken: string | null } | undefined> {
		try {
			const response = await client.request<'getAuthStatus', GetAuthStatusResponse>('getAuthStatus', { includeToken: true, refreshToken: false });
			if (request !== this._openAIAccountProfileImageRequest || !this._isCurrentChatGPTAccountClient(client, accountEmail)) {
				return undefined;
			}
			return { authToken: response.authToken };
		} catch (error) {
			this._logService.warn(`[Codex] ChatGPT profile image authentication refresh failed: ${error instanceof Error ? error.message : String(error)}`);
			return undefined;
		}
	}

	private async _refreshAccountProfileImageFromAuthentication(authentication: { readonly authToken: string | null }, accountEmail: string | undefined, request: number): Promise<void> {
		try {
			const profileImage = authentication.authToken
				? await fetchCodexProfileImage(authentication.authToken, (input, init) => this._proxyResolver.fetch(input, init))
				: undefined;
			if (request !== this._openAIAccountProfileImageRequest || !this._isCurrentChatGPTAccount(accountEmail)) {
				return;
			}
			const profileImageReference = profileImage
				? await this._getProfileImageStore().update(profileImage)
				: undefined;
			if (!profileImage) {
				await this._profileImageStore?.clear();
			}
			if (request !== this._openAIAccountProfileImageRequest || !this._isCurrentChatGPTAccount(accountEmail)) {
				return;
			}
			if (profileImageReference?.nonce === this._openAIAccountProfileImage?.nonce) {
				return;
			}
			this._openAIAccountProfileImage = profileImageReference;
			this._publishAccountInfo(this._toAccountInfo(this._openAIAccountState));
		} catch (error) {
			this._logService.warn(`[Codex] ChatGPT profile image refresh failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	private _getProfileImageStore(): CodexProfileImageStore {
		return this._profileImageStore ??= this._register(new CodexProfileImageStore(this._fileService));
	}

	private async _refreshAccountRateLimits(client: ICodexAppServerClient, accountEmail = this._openAIAccountState.email): Promise<void> {
		const request = ++this._openAIAccountRateLimitRequest;
		try {
			const response = await client.request<'account/rateLimits/read', GetAccountRateLimitsResponse>('account/rateLimits/read', undefined);
			if (request !== this._openAIAccountRateLimitRequest || !this._isCurrentChatGPTAccountClient(client, accountEmail)) {
				return;
			}
			this._openAIAccountRateLimit = codexAccountRateLimitFromResponse(response);
			this._publishAccountInfo(this._toAccountInfo(this._openAIAccountState));
		} catch (error) {
			this._logService.warn(`[Codex] account/rateLimits/read failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	private _isCurrentChatGPTAccountClient(client: ICodexAppServerClient, accountEmail: string | undefined): boolean {
		return this._isActiveAccountClient(client)
			&& this._isCurrentChatGPTAccount(accountEmail);
	}

	private _isCurrentChatGPTAccount(accountEmail: string | undefined): boolean {
		return !this._isShuttingDown
			&& !this._store.isDisposed
			&& this._openAIAccountState.status === 'signedIn'
			&& this._openAIAccountState.authType === 'chatgpt'
			&& this._openAIAccountState.email === accountEmail;
	}

	private _isActiveAccountClient(client: ICodexAppServerClient): boolean {
		return (this._connection.kind === 'ready' && this._connection.client === client)
			|| this._transientAccountConnection?.client === client;
	}

	private async _readProviderConfiguration(): Promise<{ readonly connection: IConnectionReady; readonly values: Record<string, unknown> }> {
		const connection = await this._ensureConnection();
		const response = await connection.client.request<'config/read', ConfigReadResponse>('config/read', { includeLayers: true });
		const userLayer = response.layers?.find(layer => layer.name.type === 'user' && layer.name.profile === null) ?? response.layers?.find(layer => layer.name.type === 'user');
		const config = userLayer?.config && typeof userLayer.config === 'object' && !Array.isArray(userLayer.config) ? userLayer.config as Record<string, unknown> : {};
		return {
			connection, values: {
				'codex.personality': this._readConfigurationValue(config, 'personality') ?? 'default',
				'codex.autoReviewPolicy': this._readConfigurationValue(config, 'auto_review.policy') ?? '',
			}
		};
	}

	private async _writeProviderConfiguration(key: string, value: unknown): Promise<void> {
		const connection = await this._ensureConnection();
		await connection.client.request<'config/batchWrite', ConfigWriteResponse>('config/batchWrite', {
			edits: key === 'codex.autoReviewPolicy' && value === ''
				? [{ keyPath: 'auto_review', value: null, mergeStrategy: 'replace' }]
				: key === 'codex.personality' && value === 'default'
					? [{ keyPath: 'personality', value: null, mergeStrategy: 'replace' }]
					: [{ keyPath: key === 'codex.personality' ? 'personality' : 'auto_review.policy', value: value as string, mergeStrategy: 'replace' }],
			expectedVersion: null,
			reloadUserConfig: true,
		});
	}

	private _refreshProviderConfiguration(): Promise<void> {
		if (!this._activated) {
			return Promise.resolve();
		}
		return this._providerConfigurationRefresh ??= (async () => {
			try {
				if (this._connection.kind === 'idle' && !(await this._isSdkResolvableWithoutDownload())) {
					return;
				}
				const result = await this._readProviderConfiguration();
				if (!this._isCurrentConnection(result.connection)) {
					return;
				}
				this._providerConfigurationValues = result.values;
				this._providerConfigurationReady = true;
				this._configurationService.updateRootConfig(this._providerConfigurationValues);
			} catch (error) {
				this._logService.warn(`[Codex] Failed to read config.toml: ${error instanceof Error ? error.message : String(error)}`);
			} finally {
				this._providerConfigurationRefresh = undefined;
			}
		})();
	}

	private _queueProviderConfigurationWrite(): void {
		if (!this._providerConfigurationReady) {
			return;
		}
		const values = this._configurationService.getRootConfigValues?.() ?? {};
		for (const key of ['codex.personality', 'codex.autoReviewPolicy']) {
			if (values[key] === this._providerConfigurationValues[key]) { continue; }
			const value = values[key];
			if (value === undefined) { continue; }
			this._providerConfigurationWrite = this._providerConfigurationWrite.then(async () => {
				if (this._providerConfigurationValues[key] === value) {
					return;
				}
				await this._writeProviderConfiguration(key, value);
				this._providerConfigurationValues[key] = value;
			}).catch(error => this._logService.error(`[Codex] Failed to update config.toml: ${error instanceof Error ? error.message : String(error)}`));
		}
	}

	private _readConfigurationValue(config: Record<string, unknown>, keyPath: string): unknown {
		let value: unknown = config;
		for (const segment of keyPath.split('.')) {
			if (!value || Array.isArray(value) || typeof value !== 'object') {
				return undefined;
			}
			value = (value as Record<string, unknown>)[segment];
		}
		return value;
	}

	/**
	 * Route a restored app-server thread to the session that should receive its
	 * notifications. Ambient discovery can describe a thread after a registered
	 * host chat has already restored and bound that same thread; an unbound
	 * discovery entry must not steal the established chat route.
	 */
	private _routeRestoredThreadToSession(threadId: string, sessionId: string): void {
		const currentSessionId = this._sessionIdByThreadId.get(threadId);
		const currentSession = currentSessionId ? this._sessions.get(currentSessionId) : undefined;
		const candidateSession = this._sessions.get(sessionId);
		if (currentSession?.chatChannel && !candidateSession?.chatChannel) {
			return;
		}
		this._sessionIdByThreadId.set(threadId, sessionId);
	}

	/** Remove a notification route only when it is still owned by this runtime. */
	private _removeThreadRouteIfOwned(threadId: string, sessionId: string): void {
		if (this._sessionIdByThreadId.get(threadId) === sessionId) {
			this._sessionIdByThreadId.delete(threadId);
		}
	}

	private _dispatchByThread(threadId: string, mapFn: (s: ICodexSession) => ReturnType<typeof mapTurnStarted>): void {
		// Collab-agent (subagent) child threads emit their own full event
		// stream; route them to the isolated subagent session and fire each
		// action tagged with the parent `spawnAgent` tool call so the shared
		// orchestrator lands them in the read-only child conversation.
		const subagent = this._subagentsByThreadId.get(threadId);
		if (subagent) {
			const actions = mapFn(subagent.session);
			for (const action of actions) {
				this._fireSubagent(subagent, action);
			}
			return;
		}
		const sessionId = this._sessionIdByThreadId.get(threadId);
		const session = sessionId ? this._sessions.get(sessionId) : undefined;
		if (!session) {
			// Usually an unclaimed prewarm; ignore.
			this._logService.trace(`[Codex] Ignoring notification for untracked threadId=${threadId}; likely unclaimed prewarm`);
			return;
		}
		const actions = mapFn(session);
		for (const action of actions) {
			this._fire(session.sessionUri, action);
		}
	}

	private _dispatchTokenUsageUpdated(params: ThreadTokenUsageUpdatedNotification): void {
		const subagent = this._subagentsByThreadId.get(params.threadId);
		if (subagent) {
			const mapped = this._withHostTurnId(subagent.session, params);
			for (const action of mapTokenUsageUpdated(mapped, subagent.session.model?.id)) {
				this._fireSubagent(subagent, action);
			}
			const modelCall = mapTokenUsageModelCallCompleted(mapped, subagent.session.chatChannel!);
			if (subagent.session.lastModelCallUsageId !== modelCall.modelCallId) {
				subagent.session.lastModelCallUsageId = modelCall.modelCallId;
				this._onDidChatProgress.fire({ ...modelCall, parentToolCallId: subagent.toolCallId });
			}
			return;
		}
		const sessionId = this._sessionIdByThreadId.get(params.threadId);
		const session = sessionId ? this._sessions.get(sessionId) : undefined;
		if (!session?.chatChannel) {
			this._logService.trace(`[Codex] Ignoring token usage for inactive threadId=${params.threadId}`);
			return;
		}
		const mapped = this._withHostTurnId(session, params);
		const modelCall = mapTokenUsageModelCallCompleted(mapped, session.chatChannel);
		const isNewModelCall = session.lastModelCallUsageId !== modelCall.modelCallId;
		session.lastModelCallUsageId = modelCall.modelCallId;
		if (!session.currentTurnId) {
			return;
		}
		for (const action of mapTokenUsageUpdated(mapped, session.model?.id)) {
			this._fire(session.sessionUri, action);
		}
		if (isNewModelCall) {
			this._onDidChatProgress.fire(modelCall);
		}
	}

	/**
	 * `item/completed` dispatch. In addition to the normal per-thread mapping,
	 * a parent session's completed `spawnAgent` collab tool call now carries
	 * the child `receiverThreadIds`, so we register each spawned subagent and
	 * emit a `subagent_started` signal (before mapping the completion, so the
	 * shared orchestrator has attached the subagent-chat block to the parent
	 * tool call by the time it completes).
	 */
	private _dispatchItemCompleted(params: ItemCompletedNotification): void {
		const subagent = this._subagentsByThreadId.get(params.threadId);
		if (subagent) {
			const actions = mapItemCompleted(subagent.session.mapState, this._withHostTurnId(subagent.session, params));
			for (const action of actions) {
				this._fireSubagent(subagent, action);
			}
			return;
		}
		const sessionId = this._sessionIdByThreadId.get(params.threadId);
		const session = sessionId ? this._sessions.get(sessionId) : undefined;
		if (!session) {
			this._logService.trace(`[Codex] Ignoring item/completed for untracked threadId=${params.threadId}; likely unclaimed prewarm`);
			return;
		}
		// Detect subagent spawns BEFORE mapping the completion: the host
		// toolCallId lives in the parent's itemToToolCall map (which the mapper
		// may clear), and firing `subagent_started` first lets the orchestrator
		// attach the child-conversation block to the still-open parent tool call.
		this._maybeRegisterSubagents(session, params);
		const actions = mapItemCompleted(session.mapState, this._withHostTurnId(session, params));
		for (const action of actions) {
			this._fire(session.sessionUri, action);
		}
	}

	/**
	 * `turn/completed` dispatch. For a subagent child thread, route the turn's
	 * flush/orphan actions to the child conversation but suppress its
	 * `ChatTurnComplete` — the child conversation's turn is closed cleanly
	 * (without the parent's checkpoint/changeset/title side effects) by the
	 * `subagent_completed` signal, which also tears down the child-thread
	 * tracking.
	 */
	private _dispatchTurnCompleted(params: TurnCompletedNotification): void {
		const subagent = this._subagentsByThreadId.get(params.threadId);
		if (subagent) {
			const actions = this._handleTurnCompletedNotification(subagent.session, params);
			for (const action of actions) {
				if (action.type === ActionType.ChatTurnComplete) {
					continue;
				}
				this._fireSubagent(subagent, action);
			}
			this._subagentsByThreadId.delete(params.threadId);
			subagent.session.pendingCommandApprovals.denyAll('decline');
			this._onDidChatProgress.fire({
				kind: 'subagent_completed',
				chat: subagent.session.chatChannel!,
				toolCallId: subagent.toolCallId,
			});
			return;
		}
		this._dispatchByThread(params.threadId, s => this._handleTurnCompletedNotification(s, params));
	}

	/**
	 * When a parent session's `spawnAgent` collab tool call completes it
	 * carries the child thread id(s) in `receiverThreadIds`. Register an
	 * isolated subagent session for each new child thread and emit a
	 * `subagent_started` signal so the shared orchestrator opens the read-only
	 * child conversation and attaches its discovery block to the parent tool
	 * call.
	 */
	private _maybeRegisterSubagents(session: ICodexSession, params: ItemCompletedNotification): void {
		const item = params.item;
		if (item.type !== 'collabAgentToolCall' || item.tool !== 'spawnAgent') {
			return;
		}
		const entry = session.mapState.itemToToolCall.get(item.id);
		if (!entry) {
			return;
		}
		const parentChat = session.chatChannel!;
		const model = item.model || undefined;
		const taskDescription = item.prompt || undefined;
		for (const childThreadId of item.receiverThreadIds) {
			if (this._subagentsByThreadId.has(childThreadId)) {
				continue;
			}
			const subSession = this._createSubagentSession(session, childThreadId);
			this._subagentsByThreadId.set(childThreadId, {
				parentSessionId: session.sessionId,
				toolCallId: entry.toolCallId,
				session: subSession,
			});
			this._onDidChatProgress.fire({
				kind: 'subagent_started',
				chat: parentChat,
				toolCallId: entry.toolCallId,
				agentName: model ?? 'codex',
				agentDisplayName: model ?? 'Subagent',
				taskDescription,
				// Codex surfaces the full delegated instruction as `item.prompt`.
				taskPrompt: typeof item.prompt === 'string' && item.prompt.length > 0 ? item.prompt : undefined,
			});
			this._logService.trace(`[Codex:${session.sessionId}] subagent spawned thread=${childThreadId} toolCall=${entry.toolCallId} model=${model ?? '(default)'}`);
		}
	}

	/**
	 * Build an isolated {@link ICodexSession} used to run the shared event
	 * mappers for a subagent child thread. It shares the parent's `sessionUri`
	 * (so side effects target the parent's working tree and the fired actions
	 * resolve to the parent chat channel) and `acceptedForSession` memo (so the
	 * accept-for-session decision spans parent + subagents), but has its own
	 * fresh map/turn state and approval registry so the child's events don't
	 * collide with the parent's.
	 */
	private _createSubagentSession(parent: ICodexSession, childThreadId: string): ICodexSession {
		const clientToolSet = new ActiveClientToolSet();
		return {
			sessionId: parent.sessionId,
			threadId: childThreadId,
			sessionUri: parent.sessionUri,
			startTime: parent.startTime,
			modifiedTime: parent.modifiedTime,
			summary: parent.summary,
			chatChannel: parent.chatChannel,
			configurationResource: parent.configurationResource,
			workingDirectory: parent.workingDirectory,
			workingDirectories: parent.workingDirectories,
			multiRootEnabled: parent.multiRootEnabled,
			managedWorkingDirectory: undefined,
			mapState: createCodexSessionMapState(new Set(this._serverToolHost?.toolNames ?? []), clientToolSet),
			pendingCommandApprovals: new PendingRequestRegistry<CommandExecutionApprovalDecision>(),
			acceptedForSession: parent.acceptedForSession,
			handledGuardianReviews: new Set<string>(),
			pendingGuardianReviewCards: new Set<string>(),
			pendingSteeringFlips: new Map<string, PendingMessage>(),
			clientToolSet,
			pendingClientToolCalls: new PendingRequestRegistry<ToolCallResult>(),
			pendingUserInputs: new PendingRequestRegistry<ICodexUserInputResult>(),
			materializedToolsSig: undefined,
			materializedMcpSig: undefined,
			materializedCustomizationsSig: undefined,
			materializedModelProvider: parent.materializedModelProvider,
			firstTurnSent: true,
			model: parent.model,
			agent: parent.agent,
			customizationDirectory: undefined,
			currentTurnId: undefined,
			agentMergeTurn: parent.agentMergeTurn,
			turnStopWatch: undefined,
			currentAppTurnId: undefined,
			hostTurnIdByAppTurnId: new Map<string, string>(),
			codexTurnIdByHostTurnId: new Map<string, string>(),
			needsResume: false,
			unsubscribeBeforeResume: false,
			resumePromise: undefined,
			lastPromptText: '',
			disposed: false,
			materializePromise: undefined,
			materializedEventFired: true,
			prewarmTimer: undefined,
			prewarmClaimed: true,
			serverToolsAdvertisement: parent.serverToolsAdvertisement,
			publishedDirectoryCustomizationIds: new Set<string>(),
			mcpController: undefined,
			clientCustomizations: new CodexClientCustomizationStore(),
		};
	}

	/**
	 * Fire a subagent action tagged with the parent `spawnAgent` tool call.
	 * The `resource` is the parent chat channel (the key the subagent
	 * conversation is registered under in the orchestrator); `parentToolCallId`
	 * routes the action into the child's read-only conversation.
	 */
	private _fireSubagent(subagent: ICodexSubagent, action: SessionAction | ChatAction): void {
		this._onDidChatProgress.fire({
			kind: 'action',
			resource: subagent.session.chatChannel!,
			action,
			parentToolCallId: subagent.toolCallId,
		});
	}

	/**
	 * Phase 4: handle `item/commandExecution/requestApproval` from
	 * codex. Look up the host-side tool call for the item, emit a
	 * `ChatToolCallReady` in PendingConfirmation, park on a deferred
	 * keyed by toolCallId, and resolve when the user (or the
	 * accept-for-session memo) decides. Unknown sessions / items
	 * decline silently so codex stops blocking.
	 */
	private async _handleCommandApprovalRequestRpc(params: CommandExecutionRequestApprovalParams): Promise<{ readonly result: CommandExecutionRequestApprovalResponse }> {
		// The request handler must return Codex's JSON-RPC result wrapper; keep
		// the approval method below focused on the host-side permission decision.
		const decision = await this._handleCommandApprovalRequest(params);
		return { result: { decision } };
	}

	private async _handleCommandApprovalRequest(params: {
		readonly threadId: string;
		readonly turnId: string;
		readonly itemId: string;
		readonly command?: string | null;
		readonly reason?: string | null;
	}): Promise<CommandExecutionApprovalDecision> {
		const target = this._resolveApprovalTarget(params.threadId);
		if (!target) {
			this._logService.warn(`[Codex] commandExecution/requestApproval for unknown threadId=${params.threadId}; declining`);
			return 'decline';
		}
		const session = target.session;
		const entry = session.mapState.itemToToolCall.get(params.itemId);
		if (!entry) {
			this._logService.warn(`[Codex:${session.sessionId}] commandExecution/requestApproval for unknown itemId=${params.itemId}; declining`);
			return 'decline';
		}
		const command = params.command ?? '';
		// Peel the OS shell wrapper (`/bin/zsh -lc '…'`) off for display so the
		// approval card matches the terminal pill, but keep the raw command as
		// the accept-for-session memo key so it stays byte-identical to what
		// Codex re-sends on the next request for the same command.
		const displayCommand = unwrapShellInvocation(command);
		const restriction = session.agentMergeTurn ? getAgentMergeGitHubToolRestriction('shell', { command: displayCommand }) : undefined;
		if (restriction) {
			this._logService.warn(`[Codex:${session.sessionId}] Denying restricted Agent Merge shell command`);
			return 'decline';
		}
		// Accept-for-session memo: if the user previously accepted this
		// exact command for the session, auto-accept without prompting.
		if (command && session.acceptedForSession.has(command)) {
			return 'acceptForSession';
		}
		const confirmationTitle = params.reason ?? 'Run shell command';
		// Atomically register the deferred and fire the
		// PendingConfirmation signal so a synchronous responder can't
		// miss the registration.
		const decision = await session.pendingCommandApprovals.registerAndFire(entry.toolCallId, () => {
			this._fireApproval(target, {
				type: ActionType.ChatToolCallReady,
				turnId: entry.turnId,
				toolCallId: entry.toolCallId,
				invocationMessage: displayCommand,
				toolInput: displayCommand,
				confirmationTitle,
			});
		});
		// Track accept-for-session decisions for the next request.
		if (decision === 'acceptForSession' && command) {
			session.acceptedForSession.add(command);
		}
		return decision;
	}

	private async _handleFileChangeApprovalRequestRpc(params: FileChangeRequestApprovalParams): Promise<{ readonly result: FileChangeRequestApprovalResponse }> {
		const decision = await this._requestItemApproval(params.threadId, params.itemId, params.reason ?? 'Apply file changes');
		return { result: { decision: narrowFileChangeDecision(decision) } };
	}

	private async _handlePermissionsApprovalRequestRpc(params: PermissionsRequestApprovalParams): Promise<{ readonly result: PermissionsRequestApprovalResponse }> {
		const target = this._resolveApprovalTarget(params.threadId);
		if (target?.session.agentMergeTurn && params.permissions.network !== undefined && params.permissions.network !== null) {
			this._logService.warn(`[Codex:${target.session.sessionId}] Denying network escalation during Agent Merge turn`);
			return { result: { permissions: {}, scope: 'turn' } };
		}
		const decision = await this._requestItemApproval(params.threadId, params.itemId, params.reason ?? 'Grant elevated permissions');
		const granted = decision === 'accept' || decision === 'acceptForSession';
		return {
			result: {
				// Grant exactly what was requested on accept; nothing on decline.
				permissions: granted
					? { network: params.permissions.network ?? undefined, fileSystem: params.permissions.fileSystem ?? undefined }
					: {},
				scope: decision === 'acceptForSession' ? 'session' : 'turn',
			},
		};
	}

	/**
	 * Shared approval flow for item-scoped `requestApproval` requests that
	 * don't carry their own command string: look up the host tool call for
	 * the item, fire a pending-confirmation `ChatToolCallReady`, and resolve
	 * when the user (via {@link respondToPermissionRequest}) decides. Declines
	 * if the session or item is unknown.
	 */
	private async _requestItemApproval(threadId: string, itemId: string, confirmationTitle: string): Promise<CommandExecutionApprovalDecision> {
		const target = this._resolveApprovalTarget(threadId);
		if (!target) {
			this._logService.warn(`[Codex] approval request for unknown threadId=${threadId}; declining`);
			return 'decline';
		}
		const session = target.session;
		const entry = session.mapState.itemToToolCall.get(itemId);
		if (!entry) {
			this._logService.warn(`[Codex:${session.sessionId}] approval request for unknown itemId=${itemId}; declining`);
			return 'decline';
		}
		return session.pendingCommandApprovals.registerAndFire(entry.toolCallId, () => {
			this._fireApproval(target, {
				type: ActionType.ChatToolCallReady,
				turnId: entry.turnId,
				toolCallId: entry.toolCallId,
				invocationMessage: confirmationTitle,
				toolInput: confirmationTitle,
				confirmationTitle,
			});
		});
	}

	/**
	 * Resolve the {@link ICodexSession} that owns a codex thread for an
	 * approval request, plus the subagent wrapper when the thread is a
	 * collab-agent child. A subagent tool call's pending-confirmation
	 * `ChatToolCallReady` must be fired with the parent `spawnAgent` tool call
	 * as its `parentToolCallId` (via {@link _fireApproval}) so it lands in the
	 * child's read-only conversation — where the matching
	 * `ChatToolCallStart` lives — instead of on the parent session.
	 */
	private _resolveApprovalTarget(threadId: string): { readonly session: ICodexSession; readonly subagent?: ICodexSubagent } | undefined {
		const subagent = this._subagentsByThreadId.get(threadId);
		if (subagent) {
			return { session: subagent.session, subagent };
		}
		const sessionId = this._sessionIdByThreadId.get(threadId);
		const session = sessionId ? this._sessions.get(sessionId) : undefined;
		return session ? { session } : undefined;
	}

	/** Fire an approval action to the parent session or the subagent conversation. */
	private _fireApproval(target: { readonly session: ICodexSession; readonly subagent?: ICodexSubagent }, action: SessionAction | ChatAction): void {
		if (target.subagent) {
			this._fireSubagent(target.subagent, action);
		} else {
			this._fire(target.session.sessionUri, action);
		}
	}

	private _handleGuardianWarning(session: ICodexSession, params: GuardianWarningNotification): ChatAction[] {
		// Individual review outcomes are handled by the structured review event. The
		// warning channel is only needed when the review circuit breaker ends a turn.
		if (!params.message.startsWith(CODEX_GUARDIAN_TURN_INTERRUPTION_PREFIX)) {
			return [];
		}
		const turnId = session.currentTurnId;
		if (turnId === undefined) {
			this._logService.trace(`[Codex:${session.sessionId}] guardianWarning without active turn; ignoring`);
			return [];
		}
		return [{
			type: ActionType.ChatResponsePart,
			turnId,
			part: {
				kind: ResponsePartKind.SystemNotification,
				content: params.message,
				_meta: toAgentSystemNotificationMeta({ kind: AgentSystemNotificationKind.AutomaticApprovalReviewInterrupted }),
			},
		}];
	}

	private async _handleGuardianReviewCompleted(client: ICodexAppServerClient, params: ItemGuardianApprovalReviewCompletedNotification): Promise<void> {
		const sessionId = this._sessionIdByThreadId.get(params.threadId);
		const session = sessionId ? this._sessions.get(sessionId) : undefined;
		if (!session) {
			this._logService.trace(`[Codex] autoApprovalReview/completed for unknown threadId=${params.threadId}; ignoring`);
			return;
		}
		const status = params.review.status;
		if (status === 'approved' || status === 'inProgress') {
			return;
		}
		if (session.handledGuardianReviews.has(params.reviewId)) {
			return;
		}
		// Bind review surfacing to the review's OWN turn (mapped app→host),
		// not whatever turn happens to be current. An `autoApprovalReview/completed`
		// that arrives out of order — after its turn ended, or once a later turn is
		// active — must not mis-attribute its notice to a different turn. A denied
		// review's override also stops being actionable after its turn ends.
		const turnId = this._hostTurnId(session, params.turnId);
		if (session.currentTurnId !== turnId) {
			this._logService.trace(`[Codex:${sessionId}] autoApprovalReview/completed for non-current turn ${turnId} (current=${session.currentTurnId ?? '(none)'}); ignoring reviewId=${params.reviewId}`);
			return;
		}

		session.handledGuardianReviews.add(params.reviewId);

		const summary = summarizeGuardianReviewAction(params.action);
		if (status === 'timedOut' || status === 'aborted') {
			const kind = status === 'timedOut'
				? AgentSystemNotificationKind.AutomaticApprovalReviewTimedOut
				: AgentSystemNotificationKind.AutomaticApprovalReviewAborted;
			this._fire(session.sessionUri, {
				type: ActionType.ChatResponsePart,
				turnId,
				part: {
					kind: ResponsePartKind.SystemNotification,
					content: formatGuardianReviewStatusNotification(summary, status, params.review.rationale),
					_meta: toAgentSystemNotificationMeta({ kind }),
				},
			});
			return;
		}

		// Durable record: a Markdown response part survives turn completion AND is
		// rendered by the live streaming path (unlike a system-notification part,
		// which the workbench maps to a transient progress message and never emits
		// mid-turn). The auto-review circuit-breaker interrupts the turn after
		// repeated denials — cancelling the tool-call card below — so without this
		// the user could be left with no feedback at all. Surfacing the reviewer
		// rationale here mirrors the manual-approval feedback the Default
		// permissions preset provides.
		this._fire(session.sessionUri, {
			type: ActionType.ChatResponsePart,
			turnId,
			part: {
				kind: ResponsePartKind.Markdown,
				id: generateUuid(),
				content: formatGuardianDenialNotification(summary, params.review.rationale),
			},
		});

		// Best-effort in-turn override: while the turn is still running (before the
		// circuit-breaker interrupt) the model keeps trying safer paths, so
		// approving here lets codex retry the exact denied action. codex does not
		// block on this card, so if the turn ends first the reducer cancels it and
		// {@link _handleTurnCompletedNotification} unwinds the parked deferred.
		const toolCallId = generateUuid();
		const invocationMessage = summary.detail || summary.title;
		const confirmationTitle = 'Approve anyway';
		// Deliberately render this as a PLAIN confirmation card, NOT a terminal
		// pill: the denied action already appears as its real commandExecution
		// terminal box (streamed by the app-server) and again in the denial
		// blockquote above. Tagging the card with a terminal `toolKind` + a
		// `toolInput` would make the adapter draw a *second* terminal box for the
		// same command (see stateToProgressAdapter `shouldRenderAsTerminal`),
		// which is the duplicate the user reported. Omitting both keeps the card
		// to just its title/message + "Approve anyway" button. The button still
		// works because the reducer keys PendingConfirmation off confirmationTitle
		// (with `confirmed` unset), independent of toolInput/meta.
		session.pendingGuardianReviewCards.add(toolCallId);
		let decision: CommandExecutionApprovalDecision;
		try {
			decision = await session.pendingCommandApprovals.registerAndFire(toolCallId, () => {
				this._fire(session.sessionUri, {
					type: ActionType.ChatToolCallStart,
					turnId,
					toolCallId,
					toolName: 'auto_review_denied',
					displayName: summary.title,
					intention: invocationMessage,
				});
				this._fire(session.sessionUri, {
					type: ActionType.ChatToolCallReady,
					turnId,
					toolCallId,
					invocationMessage,
					confirmationTitle,
				});
			});
		} catch (err) {
			// The parked approval was rejected (session dispose / cancellation);
			// there is no card lifecycle left to finalize.
			this._logService.trace(`[Codex:${sessionId}] guardian approval cancelled for reviewId=${params.reviewId}: ${err instanceof Error ? err.message : String(err)}`);
			return;
		} finally {
			session.pendingGuardianReviewCards.delete(toolCallId);
		}

		if (decision !== 'accept' && decision !== 'acceptForSession') {
			// Declined, cancelled, or unwound by turn completion: the action stays
			// blocked by codex. When the user declined, the UI already transitioned
			// the card off the ChatToolCallConfirmed it dispatched; when the turn
			// ended, the reducer cancelled it. Either way there is nothing to send.
			return;
		}

		// If the turn ended between the user's approval and here, the card was
		// already cancelled by the reducer and codex is no longer waiting on this
		// action within the turn — skip the round-trip.
		if (session.currentTurnId !== turnId) {
			this._logService.trace(`[Codex:${sessionId}] turn ended before guardian approval could be applied for reviewId=${params.reviewId}`);
			return;
		}

		try {
			await client.request<'thread/approveGuardianDeniedAction', ThreadApproveGuardianDeniedActionResponse>('thread/approveGuardianDeniedAction', {
				threadId: params.threadId,
				event: toGuardianAssessmentEventJson(params),
			});
			this._fire(session.sessionUri, {
				type: ActionType.ChatToolCallComplete,
				turnId,
				toolCallId,
				result: {
					success: true,
					pastTenseMessage: 'Approved anyway',
				},
			});
		} catch (err) {
			// The user approved but the app-server rejected the round-trip; finalize
			// the card as failed so it does not hang in the running state forever.
			const message = err instanceof Error ? err.message : String(err);
			this._logService.warn(`[Codex:${sessionId}] approveGuardianDeniedAction failed for reviewId=${params.reviewId}: ${message}`);
			this._fire(session.sessionUri, {
				type: ActionType.ChatToolCallComplete,
				turnId,
				toolCallId,
				result: {
					success: false,
					pastTenseMessage: 'Approval failed',
					error: { message },
				},
			});
		}
	}

	private _handleConnectionLost(connection: IConnectionReady, generation: number): void {
		if (generation !== this._connectionGeneration) {
			return;
		}
		const state = this._connection;
		if (state.kind === 'idle' || (state.kind === 'ready' && state.client !== connection.client)) {
			return;
		}
		// Invalidate the pending publication of a connection that died between
		// initialization and `_ensureConnection` promoting it to `ready`.
		this._connectionGeneration++;
		this._modelCatalogGeneration++;
		this._connection = { kind: 'idle' };
		this._skillHookCustomizationRefresh.clear();
		this._pendingMcpStartupStatuses.clear();
		this._mcpInventory.clear();
		this._applyGlobalMcpInventoryToSessions();
		if (state.kind === 'starting') {
			this._disposeConnectionResources(connection);
			return;
		}
		// Notify every known session with a single ChatError + complete
		// pair so the UI surfaces "agent disconnected" cleanly.
		for (const session of this._sessions.values()) {
			// A replacement app-server has no in-memory copy of any thread that
			// was materialized on this connection. The next operation must resume
			// it before issuing a turn or another thread-scoped request.
			if (session.threadId !== undefined) {
				session.needsResume = true;
				session.unsubscribeBeforeResume = false;
			}
			// Unpark any pending approvals so awaiters unwind.
			session.pendingCommandApprovals.denyAll('decline');
			// Reject in-flight client tool calls so their handlers unwind.
			session.pendingClientToolCalls.rejectAll(new CancellationError());
			session.pendingUserInputs.rejectAll(new CancellationError());
			// Clear any buffered steering so its pending bubble doesn't leak.
			this._drainPendingSteering(session);
			const turnId = session.currentTurnId;
			const appTurnId = session.currentAppTurnId;
			session.currentTurnId = undefined;
			session.currentAppTurnId = undefined;
			session.agentMergeTurn = false;
			if (appTurnId) {
				session.hostTurnIdByAppTurnId.delete(appTurnId);
			}
			if (turnId) {
				const duration = this._clearTurnStopWatch(session);
				this._fire(session.sessionUri, {
					type: ActionType.ChatError,
					turnId,
					duration,
					part: createErrorResponsePart({ errorType: 'CodexDisconnected', message: 'Codex app-server disconnected; session must restart.' }),
				});
				this._fire(session.sessionUri, { type: ActionType.ChatTurnComplete, turnId, duration });
			}
		}
		for (const subagent of this._subagentsByThreadId.values()) {
			subagent.session.pendingCommandApprovals.denyAll('decline');
			subagent.session.pendingClientToolCalls.rejectAll(new CancellationError());
			subagent.session.pendingUserInputs.rejectAll(new CancellationError());
			subagent.session.currentTurnId = undefined;
			subagent.session.currentAppTurnId = undefined;
		}
		this._subagentsByThreadId.clear();
		// Release resources. The proxy handle is refcounted and drops
		// the underlying server once everyone releases.
		this._disposeConnectionResources(connection);
	}

	private _disposeConnection(): void {
		const connection = this._connection;
		this._connectionGeneration++;
		this._connection = { kind: 'idle' };
		this._pendingMcpStartupStatuses.clear();
		if (connection.kind === 'starting') {
			connection.cancellation.dispose(true);
			return;
		}
		if (connection.kind === 'idle') {
			return;
		}
		this._disposeConnectionResources(connection);
	}

	private _disposeTransientAccountConnection(): void {
		this._transientConnectionCancellation?.dispose(true);
		this._transientConnectionCancellation = undefined;
		const connection = this._transientAccountConnection;
		this._transientAccountConnection = undefined;
		if (connection) {
			this._disposeConnectionResources(connection);
		}
	}

	private _disposeConnectionResources(connection: IConnectionReady): void {
		if (this._disposedConnections.has(connection)) {
			return;
		}
		this._disposedConnections.add(connection);
		try { connection.subscriptions?.dispose(); } catch { /* ignore */ }
		try { connection.client.dispose(); } catch { /* ignore */ }
		try { connection.proxyHandle.dispose(); } catch { /* ignore */ }
		try { connection.child.kill('SIGKILL'); } catch { /* already dead */ }
	}

	// #endregion

	// #region IAgent methods

	getDescriptor(): IAgentDescriptor {
		return {
			provider: this.id,
			displayName: localize('codexAgent.displayName', "Codex"),
			description: localize('codexAgent.description', "Codex agent using session-selected model providers"),
			capabilities: {
				multipleChats: { fork: true, sideChat: true },
				...(this._isMultiRootEnabled() ? { multipleWorkingDirectories: { immutablePrimary: true } } : {}),
			},
		};
	}

	private _isMultiRootEnabled(): boolean {
		return this._configurationService.getRootValue(platformRootSchema, AgentHostCodexMultiRootEnabledConfigKey) === true;
	}

	async setWorkingDirectory(_chat: URI, _context: URI | IAgentChatContext, _workingDirectory: URI): Promise<void> {
		throw new Error('Codex does not support changing the working directory of an existing session.');
	}

	/**
	 * Hides the multi-root Folder picker unless several working directories carry
	 * a Codex `.codex/hooks.json` hook manifest (see
	 * {@link codexDirectoryHasHooks}). With one qualifying directory it pins that
	 * folder; with several it shows the picker so the user chooses. This only
	 * reads files to decide the picker — it never surfaces them as customizations.
	 */
	async computeFolderPickerDecision(workingDirectories: readonly URI[], token: CancellationToken = CancellationToken.None): Promise<ISessionFolderPickerDecision | undefined> {
		if (!this._isMultiRootEnabled()) {
			return undefined;
		}
		return computeFolderPickerDecisionForRoots(workingDirectories, (directory, t) => codexDirectoryHasHooks(this._fileService, directory, t), token);
	}

	/**
	 * Resolve a host-addressed Codex chat to the session of the runtime backing
	 * it. The binding this agent recorded when the chat was provisioned or
	 * restored is the only source of runtime identity. In particular,
	 * `context.configurationResource` names the chat's configuration scope, not
	 * its backing thread: using it as a fallback for an unbound peer can route a
	 * dispose, model change, history read, or turn to the owning session's
	 * different conversation. An unaddressable chat therefore surfaces as
	 * `undefined` instead of silently routing to some other conversation.
	 */
	private _resolveConversationSession(address: URI, _sessionOrContext?: URI | IAgentChatContext): URI | undefined {
		const sessionId = this._sessionIdByChatUri.get(address.toString());
		if (sessionId) {
			return AgentSession.uri(this.id, sessionId);
		}
		return undefined;
	}

	/**
	 * Resolve the configuration scope `chat` is (or was) registered under, for
	 * ref-tracking only. Always prefers the scope this agent itself recorded
	 * when the chat was tracked (see {@link _trackConfigScopeChat}) — a peer
	 * chat's backing runtime can be keyed by its own thread id, which differs
	 * from the session/config scope it was created under, so re-deriving the
	 * scope from the runtime binding (as {@link _resolveConversationSession}
	 * does) would disagree with the scope it was originally counted against.
	 * Only for a chat this agent never tracked (e.g. a legacy-recovered or
	 * subagent chat) does this fall back to the host-supplied context, and
	 * finally to the chat's own address.
	 */
	private _configScope(chat: URI, context?: URI | IAgentChatContext): URI {
		const tracked = this._configScopeByChat.get(chat.toString());
		if (tracked) {
			return URI.parse(tracked);
		}
		if (context) {
			return resolveAgentChatContext(context, chat).configurationResource;
		}
		return this._resolveConversationSession(chat) ?? chat;
	}

	/**
	 * Registers `chat` as live under `configurationResource`'s ref-tracked
	 * scope. When an already-bound chat moves between scopes, remove its old
	 * membership before publishing the new inverse entry. Returns the old
	 * scope when that move emptied it so its resources can be reclaimed.
	 */
	private _trackConfigScopeChat(configurationResource: URI, chat: URI): URI | undefined {
		const key = configurationResource.toString();
		const chatKey = chat.toString();
		const previousKey = this._configScopeByChat.get(chatKey);
		if (previousKey === key) {
			return undefined;
		}
		let emptiedPreviousScope: URI | undefined;
		if (previousKey !== undefined) {
			const previousChats = this._configScopeChats.get(previousKey);
			previousChats?.delete(chatKey);
			if (previousChats?.size === 0) {
				this._configScopeChats.delete(previousKey);
				emptiedPreviousScope = URI.parse(previousKey);
			}
		}
		let chats = this._configScopeChats.get(key);
		if (!chats) {
			chats = new Set<string>();
			this._configScopeChats.set(key, chats);
		}
		chats.add(chatKey);
		this._configScopeByChat.set(chatKey, key);
		return emptiedPreviousScope;
	}

	private async _moveConfigScopeChat(configurationResource: URI, chat: URI): Promise<void> {
		const emptiedPreviousScope = this._trackConfigScopeChat(configurationResource, chat);
		if (emptiedPreviousScope) {
			await this._reclaimManagedWorkingDirectoryIfNotLive(emptiedPreviousScope);
		}
	}

	/**
	 * Drops `chat` from its configuration scope's ref set. Returns `true` once
	 * every chat ever registered under that scope has been disposed — the
	 * signal that it is safe to reclaim scope-level resources — or `false`
	 * while others remain.
	 */
	private _untrackConfigScopeChat(configurationResource: URI, chat: URI): boolean {
		this._configScopeByChat.delete(chat.toString());
		const key = configurationResource.toString();
		const chats = this._configScopeChats.get(key);
		if (!chats) {
			return true;
		}
		chats.delete(chat.toString());
		if (chats.size > 0) {
			return false;
		}
		this._configScopeChats.delete(key);
		return true;
	}

	/**
	 * Reclaims a configuration scope's managed working directory once its ref
	 * count has dropped to zero and the scope's own runtime identity
	 * (`AgentSession.id(configurationResource)`) is not currently live —
	 * mirroring the reclaim a live runtime already performs on its own
	 * destructive teardown ({@link _teardownSessionInMemory}), for the case
	 * where that runtime was never (or no longer) resident in memory. Every
	 * caller of this method (`_disposeChat`'s scope release, and
	 * `_disposeRuntimeSession`'s destructive path for an already-gone
	 * runtime) is on a destructive-only path, so this also releases the
	 * scope's OTel trace context — `sessionUri` here round-trips to the exact
	 * key `_traceContext` acquired it under whenever this scope was the
	 * runtime's own adopted identity (see {@link ICodexSession.threadId}).
	 */
	private async _reclaimManagedWorkingDirectoryIfNotLive(sessionUri: URI): Promise<void> {
		const sessionId = AgentSession.id(sessionUri);
		if (this._hasSessionBacking(sessionId)) {
			return;
		}
		this._otelService.releaseSessionTraceContext(sessionUri.toString());
		const overlay = await this._metadataStore.read(sessionUri);
		// Only the explicit path is ever trusted here — `overlay.cwd` is the
		// session's current working directory whether or not this agent ever
		// managed it, and a legacy `ownsManagedWorkingDirectory` flag with no
		// explicit path recorded (an overlay written before this field
		// existed) must be left alone rather than guessed at.
		const managedWorkingDirectory = this._releasedManagedWorkingDirectories.get(sessionId)
			?? overlay.managedWorkingDirectory;
		if (managedWorkingDirectory) {
			await this._removeManagedWorkingDirectory(managedWorkingDirectory);
		}
		this._releasedManagedWorkingDirectories.delete(sessionId);
	}

	/**
	 * Untracks `chat` from its configuration scope's ref count and, once no
	 * chat remains registered under that scope, reclaims the scope's managed
	 * working directory. Driven entirely by the ref count reaching zero —
	 * never by whether `chat` happens to be "the default chat" or by an
	 * Agent-Host-guaranteed teardown order.
	 */
	private async _releaseConfigScopeIfDone(chat: URI, context: URI | IAgentChatContext): Promise<void> {
		const configurationResource = this._configScope(chat, context);
		if (this._untrackConfigScopeChat(configurationResource, chat)) {
			await this._reclaimManagedWorkingDirectoryIfNotLive(configurationResource);
		}
	}

	/**
	 * Record the concrete host chat URI that addresses this runtime.
	 */
	private _recordChatTarget(chat: URI, sessionUri: URI): void {
		const sessionId = AgentSession.id(sessionUri);
		const session = this._sessions.get(sessionId);
		if (session) {
			session.chatChannel = chat;
		}
		this._sessionIdByChatUri.set(chat.toString(), sessionId);
	}

	// ---- Chat surface ------------------------------------------------------
	//
	// Codex supports multiple chats per session, and every one of them — the
	// chat a session is provisioned with as much as any later one, fresh or
	// forked — is created through the one `createChat` seam and backed by its
	// own top-level Codex thread bound to the concrete chat URI AH supplies.
	// While the owning session has no backing yet, the chat's runtime adopts the
	// session's own identity so every session-addressed call keeps resolving;
	// any further chat is identified by the thread it mints and reports it as a
	// `backingSession` so the orchestrator suppresses it from the top-level
	// session list. Addressed operations resolve only through an explicit
	// binding or transient host context.

	/**
	 * The chat-addressed operation surface for the conversations within a
	 * session. Creation is one method running one algorithm
	 * ({@link _createChat}) for every form — fresh or forked
	 * ({@link IAgentCreateChatOptions.fork}), a session's first chat or an
	 * additional one — so there is no caller-visible chat classification and no
	 * second creation entry point. The remaining methods operate on the concrete
	 * chat URI AH has already bound to a runtime.
	 */
	readonly chats: IAgentChats = {
		createChat: (chat: URI, context: URI | IAgentChatContext, options?: IAgentCreateChatOptions): Promise<IAgentCreateChatResult> => {
			return this._chatLifecycleSequencer.queue(chat.toString(), () => this._createChat(chat, resolveAgentChatContext(context, chat), options));
		},
		disposeChat: (chat: URI, context: URI | IAgentChatContext): Promise<void> => this._chatLifecycleSequencer.queue(chat.toString(), () => this._disposeChat(chat, context)),
		releaseChat: (chat: URI, context: URI | IAgentChatContext): Promise<void> => this._chatLifecycleSequencer.queue(chat.toString(), () => this._releaseChat(chat, context)),
		sendMessage: (chat: URI, prompt: string, workingDirectoriesOrDirectory: readonly URI[] | URI | undefined, attachments?: readonly MessageAttachment[], turnId?: string, _senderClientId?: string, clientTypeOrContext?: AgentHostClientType | URI | IAgentChatContext, context?: URI | IAgentChatContext): Promise<void> => {
			const workingDirectories = Array.isArray(workingDirectoriesOrDirectory) ? workingDirectoriesOrDirectory : workingDirectoriesOrDirectory ? [workingDirectoriesOrDirectory] : undefined;
			const operationContext = context ?? (typeof clientTypeOrContext === 'string' ? undefined : clientTypeOrContext);
			return this._sendMessage(chat, prompt, attachments, turnId, workingDirectories, operationContext);
		},
		abort: (chat: URI, context: URI | IAgentChatContext): Promise<void> => {
			return this._abort(chat, context);
		},
		getModel: (chat: URI, context: URI | IAgentChatContext): ModelSelection | undefined => {
			const session = this._resolveConversationSession(chat, context);
			return session ? this._sessions.get(AgentSession.id(session))?.model : undefined;
		},
		changeModel: (chat: URI, model: ModelSelection, context: URI | IAgentChatContext): Promise<void> => {
			return this._changeModel(chat, model, context);
		},
		changeAgent: (chat: URI, agent: AgentSelection | undefined, context: URI | IAgentChatContext): Promise<void> => this._changeAgent(chat, agent, context),
		getMessages: (chat: URI, context: URI | IAgentChatContext): Promise<readonly Turn[]> => {
			return this._getChatMessages(chat, context);
		},
	};

	private async _changeAgent(chat: URI, agent: AgentSelection | undefined, context: URI | IAgentChatContext): Promise<void> {
		const operationContext = resolveAgentChatContext(context, chat);
		const sessionUri = this._resolveConversationSession(chat, operationContext);
		if (!sessionUri) {
			throw new Error(`Codex conversation is not bound: ${chat.toString()}`);
		}
		const session = this._sessions.get(AgentSession.id(sessionUri));
		if (!session) {
			await this._metadataStore.write(sessionUri, { agent: agent ?? null });
			return;
		}
		session.agent = agent;
		await this._metadataStore.write(sessionUri, { agent: agent ?? null });
		if (session.threadId === undefined) {
			return;
		}
		if (!session.firstTurnSent) {
			await this._restartThreadWithCurrentTools(session);
			this._persistMaterializedSession(session);
		} else {
			this._markSessionForReload(session);
		}
	}

	/**
	 * Single creation path for every Codex chat (fresh or forked, first or
	 * additional). Records the chat→backing binding as part of this call, not
	 * as a follow-up assignment.
	 *
	 * Identity of the new backing: while the owning session has no backing
	 * yet, the runtime adopts the session's own identity (kept provisional,
	 * see {@link ICodexSession.threadId}); otherwise it is identified by the
	 * thread it mints and started eagerly.
	 *
	 * A fresh create (not a rebind of an already-bound chat) is transactional:
	 * a failure anywhere after the config-scope ref is registered — import
	 * rejection, model resolution, fork/start-backing, the eager active-client
	 * seed, or the server-tool advertise — rolls back every bit of state that
	 * step (or an earlier one in this same call) may have committed: the
	 * config-scope ref count and any managed working directory it alone was
	 * keeping alive, plus, once a runtime was actually registered, that
	 * runtime itself, its active-client handle, and its timers. A caller that
	 * retries after a failed create must see a clean slate, never a
	 * half-registered chat piling onto the next attempt.
	 */
	private async _createChat(chat: URI, context: IAgentChatContext, options?: IAgentCreateChatOptions): Promise<IAgentCreateChatResult> {
		this._activate();
		const target: ICodexTargetChat = { resource: chat, configurationResource: context.configurationResource };
		const owningSessionId = AgentSession.id(context.configurationResource);

		// A create for a chat that already has a backing — a workbench rebind
		// after a chip-selection change, or a retried create. Refresh the
		// resolved options onto that backing and hand it back, so a second
		// create never mints a thread the first one is orphaned by. A rebind
		// failure leaves the existing binding exactly as it was — the chat was
		// never new, so there is nothing here to roll back.
		const boundSessionId = this._sessionIdByChatUri.get(chat.toString());
		if (boundSessionId !== undefined) {
			const result = await this._rebindChat(boundSessionId, context, target, options);
			// Commit the scope move only after the rebind succeeds. Otherwise a
			// failed active-client refresh would strand the existing chat in the
			// new scope even though its rebind was rejected.
			await this._moveConfigScopeChat(context.configurationResource, chat);
			return result;
		}

		// Fresh creations are registered before any fallible work so the catch
		// below can release the exact scope ref they acquired.
		this._trackConfigScopeChat(context.configurationResource, chat);

		try {
			// Codex has no SDK-level conversation-import primitive: unlike fork
			// (a `thread/fork` of an existing thread), there is no way to seed a
			// brand-new thread's history from arbitrary caller-supplied turns.
			// Reject explicitly rather than silently falling through to a fresh,
			// empty chat and dropping the imported turns.
			if (options?.importConversation) {
				throw new Error('Codex does not support importing an existing conversation into a new chat.');
			}

			// Selecting the Codex harness activates it. Populate the catalog before
			// any path validates a model selection, so a model picked before models
			// finished loading isn't dropped.
			if (this._models.get().length === 0) {
				await this.refreshModels();
			}
			this._throwIfShuttingDown();
			const adoptedSessionId = this._hasSessionBacking(owningSessionId) ? undefined : owningSessionId;
			const session = options?.fork
				? await this._forkChatBacking(options.fork, options, adoptedSessionId, target)
				: adoptedSessionId !== undefined
					? this._deferChatBacking(adoptedSessionId, options, target)
					: await this._startChatBacking(context, options, target);

			try {
				this._throwIfShuttingDown();
				// Seed the eager active client over the exact chat this call binds
				// — the agent never invents a chat URI to stand in for it — before
				// the prewarm below reads the client's tools into a `thread/start`.
				await this._seedEagerActiveClient(session.sessionUri, chat, context, options?.activeClient);
				this._throwIfShuttingDown();
				if (session.threadId === undefined) {
					this._schedulePrewarm(session);
				}
				// Server tools are session-scoped, so they are advertised on the
				// session Agent Host addressed — the only URI it knows this chat by.
				this._advertiseServerTools(session, context.configurationResource);
			} catch (err) {
				// The backing (and, if this was its adopted identity, the session
				// itself) is already registered at this point — undo it exactly as
				// a destructive dispose would, so nothing it created outlives this
				// failed call.
				await this._rollbackRegisteredChatCreation(session, chat);
				throw err;
			}
			this._logService.info(`[Codex] created chat ${chat.toString()} backed by ${session.sessionUri.toString()} thread=${session.threadId ?? '(deferred)'} (session ${context.configurationResource.toString()})`);
			return this._createChatResult(context, session);
		} catch (err) {
			await this._releaseConfigScopeIfDone(chat, context);
			throw err;
		}
	}

	/**
	 * Undo a runtime this same {@link _createChat} call just registered, once
	 * a later step in that call (the eager active-client seed or the
	 * server-tool advertise) fails. Mirrors the destructive
	 * {@link _disposeChat} path exactly — same active-client handle removal,
	 * same {@link _teardownSessionInMemory} teardown (pending registries,
	 * MCP controller, timers, managed working directory, OTel trace context) —
	 * but first archives a backing thread minted by the failed call. The host
	 * never committed that chat, so leaving its rollout merely unsubscribed
	 * would surface an orphan through native thread discovery later.
	 */
	private async _rollbackRegisteredChatCreation(session: ICodexSession, chat: URI): Promise<void> {
		this._removeActiveClientHandlesForChat(chat);
		if (session.threadId !== undefined) {
			await this._archiveThreadBestEffort(session.threadId, 'chat creation failed');
		}
		await this._teardownSessionInMemory(session, session.sessionId, true);
		this._sessionIdByChatUri.delete(chat.toString());
	}

	/**
	 * Hand back the backing already bound to a chat, refreshed with the
	 * caller's resolved options. Creation is idempotent: a second create for an
	 * already-bound chat must neither mint a second thread nor leave the
	 * runtime unbound.
	 */
	private async _rebindChat(sessionId: string, context: IAgentChatContext, target: ICodexTargetChat, options?: IAgentCreateChatOptions): Promise<IAgentCreateChatResult> {
		const existing = this._sessions.get(sessionId);
		if (!existing) {
			// The runtime was released — a release is non-destructive and keeps
			// the binding — so its durable backing is untouched. Report that
			// backing unchanged and let `materializeChat` re-attach it.
			const backingSession = AgentSession.uri(this.id, sessionId);
			const managedWorkingDirectory = this._releasedManagedWorkingDirectories.get(sessionId);
			return {
				...(isEqual(backingSession, context.configurationResource) ? {} : { backingSession }),
				providerData: encodeCodexChat({
					sessionId,
					...(managedWorkingDirectory ? { ownsManagedWorkingDirectory: true } : {}),
				}),
			};
		}
		// Validate the requested model before changing the live runtime. The eager
		// client seed needs to observe the replacement configuration scope while it
		// syncs customizations, but that sync is fallible, so every provisional
		// field change below must be restored if it rejects.
		const model = options?.model ? this._resolveCreationModel(options.model) : existing.model;
		const previous = {
			model: existing.model,
			agent: existing.agent,
			configurationResource: existing.configurationResource,
			chatChannel: existing.chatChannel,
			serverToolsAdvertisement: existing.serverToolsAdvertisement,
		};
		try {
			existing.model = model;
			if (options?.agent) {
				existing.agent = options.agent;
			}
			existing.configurationResource = context.configurationResource;
			this._recordChatTarget(target.resource, existing.sessionUri);
			await this._seedEagerActiveClient(existing.sessionUri, target.resource, context, options?.activeClient);
			this._throwIfShuttingDown();
			this._advertiseServerTools(existing, context.configurationResource);
		} catch (error) {
			existing.model = previous.model;
			existing.agent = previous.agent;
			existing.configurationResource = previous.configurationResource;
			existing.chatChannel = previous.chatChannel;
			existing.serverToolsAdvertisement = previous.serverToolsAdvertisement;
			throw error;
		}
		return this._createChatResult(context, existing);
	}

	/**
	 * Whether a runtime already backs `sessionId` — live, or released but still
	 * bound to a chat. A creation adopts the owning session's identity only
	 * while it is free; every later chat mints a backing thread of its own.
	 */
	private _hasSessionBacking(sessionId: string): boolean {
		if (this._sessions.has(sessionId)) {
			return true;
		}
		for (const boundSessionId of this._sessionIdByChatUri.values()) {
			if (boundSessionId === sessionId) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Resolve the model a creation runs with: the caller's explicit selection
	 * when the catalog knows it, else the `fallback` a forked chat inherits
	 * from its source, else Codex's default. An explicitly requested model the
	 * catalog does not know is rejected rather than silently replaced, and the
	 * resolved model's provider must be authenticated before any thread work.
	 */
	private _resolveCreationModel(requested: ModelSelection | undefined, fallback?: ModelSelection): ModelSelection | undefined {
		const selection = requested ?? fallback;
		const model = this._supportedModelOrUndefined(selection);
		if (selection && !model) {
			throw new Error(`Codex model '${selection.id}' is not available.`);
		}
		this._ensureModelProviderAuthenticated(model);
		return model;
	}

	/**
	 * Describe the exact backing this creation bound to the chat.
	 *
	 * `backingSession` names the app-server thread whenever that thread is a
	 * record of its own, so the orchestrator can suppress it from the top-level
	 * session list; the session's own record is never reported as an internal
	 * chat backing, since that marker would hide the session itself. The
	 * result never reports which identity the backing adopted — the
	 * orchestrator already owns that session URI and never needs it echoed
	 * back.
	 */
	private _createChatResult(context: IAgentChatContext, session: ICodexSession): IAgentCreateChatResult {
		const backingSession = AgentSession.uri(this.id, session.threadId ?? session.sessionId);
		const managedWorkingDirectory = session.managedWorkingDirectory ?? this._releasedManagedWorkingDirectories.get(session.sessionId);
		return {
			...(session.workingDirectory ? { resolvedWorkingDirectory: session.workingDirectory } : {}),
			...(session.threadId === undefined ? { provisional: true } : {}),
			...(isEqual(backingSession, context.configurationResource) ? {} : { backingSession }),
			providerData: encodeCodexChat({
				sessionId: session.sessionId,
				...(session.model ? { model: session.model } : {}),
				...(managedWorkingDirectory ? { ownsManagedWorkingDirectory: true } : {}),
			}),
		};
	}

	/**
	 * Register a backing whose codex thread is deferred (see
	 * {@link ICodexSession.threadId} for why). `thread/start` happens on
	 * prewarm, the first `sendMessage`, or `getChatMetadata` for restore — by
	 * which point a managed temp folder can be created lazily if the client
	 * gave no working directory, instead of rejecting the creation.
	 */
	private _deferChatBacking(sessionId: string, options: IAgentCreateChatOptions | undefined, target: ICodexTargetChat): ICodexSession {
		const model = this._resolveCreationModel(options?.model);
		const multiRootEnabled = this._isMultiRootEnabled();
		const workingDirectories = multiRootEnabled && (options?.workingDirectories?.length ?? 0) > 1
			? distinctWorkingDirectories(options?.workingDirectories)
			: undefined;
		const clientToolSet = new ActiveClientToolSet();
		const now = Date.now();
		const session: ICodexSession = {
			sessionId,
			threadId: undefined,
			sessionUri: AgentSession.uri(this.id, sessionId),
			startTime: now,
			modifiedTime: now,
			summary: undefined,
			chatChannel: target.resource,
			configurationResource: target.configurationResource,
			workingDirectory: options?.workingDirectories?.[0],
			workingDirectories,
			multiRootEnabled,
			managedWorkingDirectory: undefined,
			mapState: createCodexSessionMapState(new Set(this._serverToolHost?.toolNames ?? []), clientToolSet),
			pendingCommandApprovals: new PendingRequestRegistry<CommandExecutionApprovalDecision>(),
			acceptedForSession: new Set<string>(),
			handledGuardianReviews: new Set<string>(),
			pendingGuardianReviewCards: new Set<string>(),
			pendingSteeringFlips: new Map<string, PendingMessage>(),
			clientToolSet,
			pendingClientToolCalls: new PendingRequestRegistry<ToolCallResult>(),
			pendingUserInputs: new PendingRequestRegistry<ICodexUserInputResult>(),
			materializedToolsSig: undefined,
			materializedMcpSig: undefined,
			materializedCustomizationsSig: undefined,
			materializedModelProvider: undefined,
			firstTurnSent: false,
			model,
			agent: options?.agent,
			customizationDirectory: undefined,
			currentTurnId: undefined,
			turnStopWatch: undefined,
			currentAppTurnId: undefined,
			hostTurnIdByAppTurnId: new Map<string, string>(),
			codexTurnIdByHostTurnId: new Map<string, string>(),
			needsResume: false,
			unsubscribeBeforeResume: false,
			resumePromise: undefined,
			lastPromptText: '',
			disposed: false,
			materializePromise: undefined,
			materializedEventFired: false,
			prewarmTimer: undefined,
			prewarmClaimed: false,
			serverToolsAdvertisement: undefined,
			publishedDirectoryCustomizationIds: new Set<string>(),
			mcpController: undefined,
			clientCustomizations: new CodexClientCustomizationStore(),
		};
		this._sessions.set(sessionId, session);
		// Record the exact-chat binding as part of registration, so the runtime
		// is never observably unbound between construction and a caller awaiting
		// the create result.
		this._sessionIdByChatUri.set(target.resource.toString(), sessionId);
		return session;
	}

	/**
	 * Start a backing thread now and register the runtime it identifies. Used
	 * when the owning session's identity is already taken: the new chat is a
	 * top-level codex thread of its own (session id == thread id), so the
	 * thread has to exist before the creation can name it as the chat's exact
	 * backing. It runs in the host-resolved working directory, or in a managed
	 * temp folder when the session has none, and inherits nothing from the
	 * parent session beyond the resolved options and its live active clients.
	 */
	private async _startChatBacking(context: IAgentChatContext, options: IAgentCreateChatOptions | undefined, target: ICodexTargetChat): Promise<ICodexSession> {
		const owningSessionId = AgentSession.id(context.configurationResource);
		const model = this._resolveCreationModel(options?.model);
		if (!model) {
			throw new Error('Codex has no available models.');
		}
		const hostWorkingDirectory = options?.workingDirectories?.[0];
		const managedWorkingDirectory = hostWorkingDirectory
			? undefined
			: await this._createManagedWorkingDirectory(`chat-${generateUuid()}`);
		const workingDirectory = hostWorkingDirectory ?? managedWorkingDirectory;
		if (!workingDirectory) {
			throw new Error(`[Codex] createChat: failed to resolve a working directory for session ${context.configurationResource.toString()}`);
		}

		try {
			// Permissions and settings come from the orchestrator-supplied
			// config, never read back from the owning session's own state.
			const resolvedConfig = options?.config ?? {};
			const permissionDefaults = {
				approvalPolicy: codexSessionConfigDefaults[CodexSessionConfigKey.ApprovalPolicy],
				sandboxMode: codexSessionConfigDefaults[CodexSessionConfigKey.SandboxMode],
			};
			const { approvalPolicy, sandboxMode, approvalsReviewer } = resolveCodexPermissions(
				migrateCodexPermissionValues(resolvedConfig, permissionDefaults),
				permissionDefaults,
			);

			// A scratch entry (never registered) lets the MCP/dynamic-tool helpers
			// compute the thread/start params while the new chat's own client state
			// is empty; they read root config + server tools, not session config.
			const scratch = this._createResumedSessionEntry(owningSessionId, '', workingDirectory, model, target);
			const mcpServers = this._buildSessionMcpServers(scratch);
			const dynamicTools = this._buildDynamicTools(scratch);
			const validatedConfig = codexSessionConfigSchema.validateOrDefault(resolvedConfig, codexSessionConfigDefaults);
			const threadConfig: Record<string, JsonValue> = {
				web_search: narrowWebSearchMode(validatedConfig[CodexSessionConfigKey.WebSearchMode]) ?? codexSessionConfigDefaults[CodexSessionConfigKey.WebSearchMode],
			};
			if (Object.keys(mcpServers).length > 0) {
				threadConfig.mcp_servers = mcpServers as JsonValue;
			}

			const conn = await this._ensureConnection();
			const resolvedModel = parseCodexModelSelection(model);
			const startResult = await conn.client.request<'thread/start', { thread: { id: string } }>('thread/start', {
				cwd: workingDirectory.fsPath,
				model: resolvedModel.modelId,
				modelProvider: resolvedModel.modelProvider,
				approvalPolicy,
				sandbox: sandboxMode,
				approvalsReviewer,
				config: threadConfig,
				dynamicTools,
			});
			const threadId = startResult.thread.id;
			const startedOnCurrentConnection = this._isCurrentConnection(conn);

			// The freshly started thread is live and subscribed, so build a
			// materialized (not resumed) entry keyed by the thread id.
			const session = this._createResumedSessionEntry(threadId, threadId, workingDirectory, model, target, undefined, undefined, options?.agent);
			session.needsResume = !startedOnCurrentConnection;
			session.firstTurnSent = false;
			session.materializedEventFired = false;
			session.materializedMcpSig = mcpServersSignature(mcpServers);
			session.materializedToolsSig = toolsSignature(session.clientToolSet.merged());
			session.managedWorkingDirectory = managedWorkingDirectory;
			this._sessions.set(threadId, session);
			this._sessionIdByThreadId.set(threadId, threadId);
			this._sessionIdByChatUri.set(target.resource.toString(), threadId);
			this._flushPendingMcpStartupStatuses(threadId);
			this._applyMcpInventoryToSession(session);
			this._persistMaterializedSession(session);
			return session;
		} catch (err) {
			if (managedWorkingDirectory) {
				await this._removeManagedWorkingDirectory(managedWorkingDirectory);
			}
			throw err;
		}
	}

	/**
	 * Re-attach a chat's backing thread on restore. The orchestrator
	 * hands back the opaque `providerData` produced by
	 * {@link _createChat}; we rebuild a resumable session entry keyed
	 * by the backing thread id and bind it to the chat URI before its history is
	 * read. Its first send issues a `thread/resume`.
	 */
	materializeChat(chat: URI, context: URI | IAgentChatContext, providerData: string | undefined): Promise<IAgentCreateChatResult | void> {
		return this._chatLifecycleSequencer.queue(chat.toString(), () => this._materializeChat(chat, context, providerData));
	}

	private async _materializeChat(chat: URI, context: URI | IAgentChatContext, providerData: string | undefined): Promise<IAgentCreateChatResult | void> {
		this._activate();
		const operationContext = resolveAgentChatContext(context, chat);
		const target: ICodexTargetChat = { resource: chat, configurationResource: operationContext.configurationResource };
		let decoded: ICodexPersistedChat | undefined;
		if (providerData === undefined) {
			if (!isDefaultChatUri(chat)) {
				return;
			}
			decoded = { sessionId: AgentSession.id(operationContext.configurationResource) };
		} else {
			decoded = decodeCodexChat(providerData);
			if (!decoded) {
				this._logService.warn(`[Codex] materializeChat: dropping corrupt providerData for ${chat.toString()}`);
				return;
			}
		}
		const previousScope = this._configScopeByChat.get(chat.toString());
		const previousBinding = this._sessionIdByChatUri.get(chat.toString());
		const sessionId = decoded.sessionId;
		let existing: ICodexSession | undefined;
		let previousExistingState: { readonly chatChannel: URI | undefined; readonly configurationResource: URI; readonly serverToolsAdvertisement: string | undefined } | undefined;
		let session: ICodexSession | undefined;
		try {
			await this._moveConfigScopeChat(operationContext.configurationResource, chat);
			this._throwIfShuttingDown();
			existing = this._sessions.get(sessionId);
			if (existing) {
				previousExistingState = {
					chatChannel: existing.chatChannel,
					configurationResource: existing.configurationResource,
					serverToolsAdvertisement: existing.serverToolsAdvertisement,
				};
				existing.chatChannel = chat;
				existing.configurationResource = operationContext.configurationResource;
				this._sessionIdByChatUri.set(chat.toString(), existing.sessionId);
				if (existing.threadId) {
					this._routeRestoredThreadToSession(existing.threadId, existing.sessionId);
				}
				this._advertiseServerTools(existing, operationContext.configurationResource);
				return providerData === undefined ? { providerData: encodeCodexChat(decoded) } : undefined;
			}
			const sessionUri = AgentSession.uri(this.id, sessionId);
			const overlay = await this._metadataStore.read(sessionUri);
			this._throwIfShuttingDown();
			const threadId = overlay.threadId ?? sessionId;
			// The explicit path is the only thing a destructive teardown may ever
			// delete; `overlay.cwd` is the session's current working directory
			// regardless of who picked it and must never be treated as a managed
			// folder on the strength of a (possibly stale) ownership flag alone.
			const managedWorkingDirectory = this._releasedManagedWorkingDirectories.get(sessionId) ?? overlay.managedWorkingDirectory;
			const workingDirectory = overlay.cwd ?? managedWorkingDirectory;
			if (this._models.get().length === 0) {
				await this.refreshModels();
			}
			this._throwIfShuttingDown();
			const model = this._supportedModelOrUndefined(overlay.modelId ? { id: overlay.modelId } : decoded.model);
			// Codex's session id == thread id convention: the backing thread already
			// exists on the app-server, so the entry resumes on first send.
			session = this._createResumedSessionEntry(sessionId, threadId, workingDirectory, model, target, undefined, undefined, overlay.agent);
			if (managedWorkingDirectory) {
				session.managedWorkingDirectory = managedWorkingDirectory;
			}
			this._releasedManagedWorkingDirectories.delete(sessionId);
			this._sessions.set(sessionId, session);
			this._routeRestoredThreadToSession(threadId, sessionId);
			this._sessionIdByChatUri.set(chat.toString(), sessionId);
			this._advertiseServerTools(session, operationContext.configurationResource);
			if (providerData === undefined) {
				return { providerData: encodeCodexChat(decoded) };
			}
		} catch (error) {
			if (existing && previousExistingState) {
				existing.chatChannel = previousExistingState.chatChannel;
				existing.configurationResource = previousExistingState.configurationResource;
				existing.serverToolsAdvertisement = previousExistingState.serverToolsAdvertisement;
			}
			if (session && this._sessions.get(sessionId) === session) {
				if (session.managedWorkingDirectory) {
					this._releasedManagedWorkingDirectories.set(sessionId, session.managedWorkingDirectory);
				}
				await this._teardownSessionInMemory(session, sessionId, false);
			}
			if (previousBinding === undefined) {
				this._sessionIdByChatUri.delete(chat.toString());
			} else {
				this._sessionIdByChatUri.set(chat.toString(), previousBinding);
			}
			const currentScope = this._configScopeByChat.get(chat.toString());
			if (currentScope !== undefined) {
				this._untrackConfigScopeChat(URI.parse(currentScope), chat);
			}
			if (previousScope !== undefined) {
				this._trackConfigScopeChat(URI.parse(previousScope), chat);
			}
			throw error;
		}
	}

	async recoverLegacyChat(chat: URI, context: URI | IAgentChatContext): Promise<IAgentCreateChatResult> {
		this._activate();
		const operationContext = resolveAgentChatContext(context, chat);
		const sessionId = AgentSession.id(operationContext.configurationResource);
		this._recordChatTarget(chat, AgentSession.uri(this.id, sessionId));
		return { providerData: encodeCodexChat({ sessionId }) };
	}

	/**
	 * Seed the active client supplied with {@link IAgentChats.createChat} before the agent
	 * host asks for the initial customization snapshot. The initial state is
	 * assigned directly rather than dispatched as `session/activeClientSet`, so
	 * without this step Codex would not receive the client's tools or
	 * customizations until a later turn happened to re-register the client.
	 *
	 * `chat` is the one exact chat this seed applies to — the chat the
	 * creating call is binding. The agent never invents a chat URI to stand in
	 * for it, and never propagates the seed to any sibling chat.
	 */
	private async _seedEagerActiveClient(sessionUri: URI, chat: URI, context: IAgentChatContext, activeClient: IAgentCreateChatOptions['activeClient']): Promise<void> {
		if (!activeClient) {
			return;
		}
		const key = `${chat.toString()}\u0000${activeClient.clientId}`;
		const hadHandle = this._activeClientHandles.has(key);
		const handle = this.getOrCreateActiveClient(chat, context, { clientId: activeClient.clientId, displayName: activeClient.displayName });
		const previousTools = handle.tools;
		try {
			handle.tools = activeClient.tools;
			if (activeClient.customizations !== undefined) {
				await this._syncClientCustomizations(sessionUri, activeClient.clientId, activeClient.customizations, { quiet: true });
				handle.commitCustomizations(activeClient.customizations);
			}
		} catch (error) {
			handle.tools = previousTools;
			if (!hadHandle) {
				handle.remove();
				this._activeClientHandles.delete(key);
			}
			throw error;
		}
	}

	/**
	 * Build an {@link ICodexSession} entry for a thread that already exists on
	 * the app-server (a restored session or a freshly forked one). Such a
	 * session skips materialization — its first {@link _sendMessage} issues a
	 * `thread/resume` (`needsResume: true`) — so the prewarm/first-turn flags
	 * are pre-set to their post-materialization values.
	 *
	 * `sessionUri` is *derived* from `sessionId` rather than supplied — see
	 * {@link ICodexSession.sessionUri} for why that must always hold.
	 */
	private _createResumedSessionEntry(sessionId: string, threadId: string, workingDirectory: URI | undefined, model: ModelSelection | undefined, target?: ICodexTargetChat, workingDirectories?: readonly URI[], multiRootEnabled?: boolean, agent?: AgentSelection, materializedModelProvider?: string): ICodexSession {
		const clientToolSet = new ActiveClientToolSet();
		const effectiveWorkingDirectories = distinctWorkingDirectories(workingDirectories);
		const now = Date.now();
		return {
			sessionId,
			threadId,
			sessionUri: AgentSession.uri(this.id, sessionId),
			startTime: now,
			modifiedTime: now,
			summary: undefined,
			chatChannel: target?.resource,
			configurationResource: target?.configurationResource ?? AgentSession.uri(this.id, sessionId),
			workingDirectory: effectiveWorkingDirectories?.[0] ?? workingDirectory,
			workingDirectories: effectiveWorkingDirectories,
			multiRootEnabled: multiRootEnabled ?? (effectiveWorkingDirectories?.length ?? 0) > 1,
			managedWorkingDirectory: undefined,
			mapState: createCodexSessionMapState(new Set(this._serverToolHost?.toolNames ?? []), clientToolSet),
			pendingCommandApprovals: new PendingRequestRegistry<CommandExecutionApprovalDecision>(),
			acceptedForSession: new Set<string>(),
			handledGuardianReviews: new Set<string>(),
			pendingGuardianReviewCards: new Set<string>(),
			pendingSteeringFlips: new Map<string, PendingMessage>(),
			clientToolSet,
			pendingClientToolCalls: new PendingRequestRegistry<ToolCallResult>(),
			pendingUserInputs: new PendingRequestRegistry<ICodexUserInputResult>(),
			materializedToolsSig: undefined,
			materializedMcpSig: undefined,
			materializedCustomizationsSig: undefined,
			materializedModelProvider,
			firstTurnSent: true,
			model,
			agent,
			customizationDirectory: undefined,
			currentTurnId: undefined,
			turnStopWatch: undefined,
			currentAppTurnId: undefined,
			hostTurnIdByAppTurnId: new Map<string, string>(),
			codexTurnIdByHostTurnId: new Map<string, string>(),
			needsResume: true,
			unsubscribeBeforeResume: false,
			resumePromise: undefined,
			lastPromptText: '',
			disposed: false,
			materializePromise: undefined,
			materializedEventFired: true,
			prewarmTimer: undefined,
			prewarmClaimed: true,
			serverToolsAdvertisement: undefined,
			publishedDirectoryCustomizationIds: new Set<string>(),
			mcpController: undefined,
			clientCustomizations: new CodexClientCustomizationStore(),
		};
	}

	/**
	 * Fork the exact source chat's backing thread into a new backing for the
	 * chat being created.
	 *
	 * `fork.source` resolves solely through the exact-chat binding this agent
	 * recorded when the source chat was created or materialized — never
	 * through a host-supplied session hint or chat-URI shape. An unbound
	 * source therefore fails fast rather than guessing its owning session.
	 *
	 * We `thread/fork` the source thread — which copies its full history — then
	 * `thread/rollback` the trailing turns so the fork retains only the turns up
	 * to and including `fork.turnId`. The forked thread already exists on the
	 * app-server, so the runtime is registered as resumable (its first send
	 * issues a `thread/resume`).
	 *
	 * `adoptedSessionId`, when set, is the owning session's identity this
	 * backing adopts (the session's runtime is stood up by this fork); otherwise
	 * the runtime is keyed by the forked thread id, preserving the Codex
	 * convention that a chat-owned session id equals its thread id.
	 */
	private async _forkChatBacking(fork: IAgentCreateChatForkSource, options: IAgentCreateChatOptions | undefined, adoptedSessionId: string | undefined, target: ICodexTargetChat): Promise<ICodexSession> {
		const sourceSessionUri = this._resolveConversationSession(fork.source);
		if (!sourceSessionUri) {
			throw new Error(`Cannot fork codex chat ${fork.source.toString()}: backing thread could not be resolved`);
		}
		const sourceSession = this._sessions.get(AgentSession.id(sourceSessionUri));
		if (sourceSession?.needsResume) {
			await this._resumeSession(sourceSession);
		}
		const sourceRead = await this._readSession(sourceSessionUri);
		if (!sourceRead) {
			throw new Error(`Cannot fork codex chat ${fork.source.toString()}: source thread could not be read`);
		}
		const sourceThreadId = sourceRead.thread.id;
		const sourceTurns = sourceRead.thread.turns ?? [];
		const sourceOverlay = sourceSession ? undefined : await this._metadataStore.read(sourceSessionUri);
		const sourceManagedWorkingDirectory = sourceSession?.managedWorkingDirectory
			?? this._releasedManagedWorkingDirectories.get(AgentSession.id(sourceSessionUri))
			?? sourceOverlay?.managedWorkingDirectory;
		const sourcePrimary = sourceRead.thread.cwd ? URI.file(sourceRead.thread.cwd) : options?.workingDirectories?.[0];
		const sourceStoredWorkingDirectories = sourceSession?.workingDirectories ?? sourceRead.persistedWorkingDirectories;
		const inheritedWorkingDirectories = sourcePrimary
			? distinctWorkingDirectories([sourcePrimary, ...(sourceStoredWorkingDirectories?.slice(1) ?? [])])
			: undefined;
		const multiRootEnabled = sourceSession?.multiRootEnabled ?? (inheritedWorkingDirectories?.length ?? 0) > 1;
		const runtimeWorkspaceRoots = multiRootEnabled && inheritedWorkingDirectories && inheritedWorkingDirectories.length > 1
			? distinctAbsolutePaths(inheritedWorkingDirectories.map(directory => directory.fsPath))
			: undefined;

		// Resolve how many trailing turns to drop so the fork keeps turns up to
		// and including `fork.turnId`. A live source maps host turn ids to codex
		// turn ids; a restored source already uses codex ids. Fall back to the
		// caller-supplied `turnIndex` when the id can't be resolved.
		const codexTurnId = sourceSession?.codexTurnIdByHostTurnId.get(fork.turnId) ?? fork.turnId;
		// Reject an unresolvable fork boundary rather than silently keeping the
		// full history: if neither the mapped codex turn id nor the caller's
		// `turnIndex` lands inside the source turns, a `numTurnsToDrop` of 0 would
		// branch from the wrong point (the tip instead of the requested turn).
		// A chat-fork source may carry no positional index; the turn id then
		// resolves the boundary alone, and an unresolvable id is rejected.
		const fallbackTurnIndex = fork.turnIndex ?? -1;
		const boundary = resolveForkBoundary(sourceTurns.map(t => t.id), codexTurnId, fallbackTurnIndex);
		if (!boundary.resolved) {
			throw new Error(`Cannot fork codex session ${sourceThreadId}: unable to resolve fork boundary for turn ${fork.turnId} (turnIndex=${fallbackTurnIndex}, turns=${sourceTurns.length})`);
		}
		const { keepThroughIndex, numTurnsToDrop } = boundary;

		const inheritedModel = sourceSession?.model
			?? (sourceRead.persistedModelId ? { id: sourceRead.persistedModelId } : undefined)
			?? this._models.get().find(candidate => parseCodexModelSelection(candidate).modelProvider === sourceRead.thread.modelProvider);
		const model = this._resolveCreationModel(options?.model, inheritedModel);
		const resolvedModel = model ? parseCodexModelSelection(model) : undefined;
		// Inherit the source session's effective permissions so forking an
		// auto-review / full-access / read-only session doesn't silently reset the
		// fork back to the Default preset. Fork callers typically pass an empty
		// `config`; any explicit override there still wins.
		const sourceConfigValues = this._configurationService.getSessionConfigValues(sourceSessionUri.toString());
		const forkDefaults = {
			approvalPolicy: codexSessionConfigDefaults[CodexSessionConfigKey.ApprovalPolicy],
			sandboxMode: codexSessionConfigDefaults[CodexSessionConfigKey.SandboxMode],
		};
		const { approvalPolicy, sandboxMode, approvalsReviewer } = resolveCodexPermissions(
			migrateCodexPermissionValues({ ...sourceConfigValues, ...options?.config }, forkDefaults),
			forkDefaults,
		);
		const forkManagedWorkingDirectory = sourceManagedWorkingDirectory
			? await this._createManagedWorkingDirectory(`fork-${generateUuid()}`)
			: undefined;
		if (forkManagedWorkingDirectory && sourceManagedWorkingDirectory) {
			try {
				await fs.promises.cp(sourceManagedWorkingDirectory.fsPath, forkManagedWorkingDirectory.fsPath, { recursive: true });
			} catch (err) {
				await this._removeManagedWorkingDirectory(forkManagedWorkingDirectory);
				throw err;
			}
		}
		let forkResult: ThreadForkResponse;
		let forkConnection: IConnectionReady;
		try {
			// Directory preparation and source inspection above may outlive the
			// app-server that resumed the source. Revalidate immediately before the
			// thread-scoped request so a replacement is resumed first.
			forkConnection = sourceSession
				? (await this._ensureThreadConnection(sourceSession)).connection
				: await this._ensureConnection();
			forkResult = await forkConnection.client.request<'thread/fork', ThreadForkResponse>('thread/fork', {
				threadId: sourceThreadId,
				...(forkManagedWorkingDirectory ? {
					cwd: forkManagedWorkingDirectory.fsPath,
				} : runtimeWorkspaceRoots?.length ? {
					cwd: runtimeWorkspaceRoots[0],
					runtimeWorkspaceRoots,
				} : {}),
				...(resolvedModel ? { model: resolvedModel.modelId, modelProvider: resolvedModel.modelProvider } : {}),
				config: { 'features.image_generation': this._imageGenerationEnabledForModelProvider(resolvedModel?.modelProvider ?? sourceRead.thread.modelProvider) },
				approvalPolicy,
				sandbox: sandboxMode,
				approvalsReviewer,
			});
		} catch (err) {
			if (forkManagedWorkingDirectory) {
				await this._removeManagedWorkingDirectory(forkManagedWorkingDirectory);
			}
			throw err;
		}
		const newThreadId = forkResult.thread.id;

		// The fork copies the full source history; drop the trailing turns so
		// the new thread ends at the requested fork point. A failed rollback
		// would leave the fork carrying the very turns the user asked to branch
		// away from, so treat it as a hard failure: archive the orphaned fork
		// and reject rather than returning a session with the wrong history.
		if (numTurnsToDrop > 0) {
			try {
				await forkConnection.client.request<'thread/rollback'>('thread/rollback', { threadId: newThreadId, numTurns: numTurnsToDrop });
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				this._logService.warn(`[Codex:${newThreadId}] fork rollback failed (numTurns=${numTurnsToDrop}); discarding fork: ${message}`);
				await this._archiveThreadBestEffort(newThreadId, 'fork rollback failed', forkConnection);
				if (forkManagedWorkingDirectory) {
					await this._removeManagedWorkingDirectory(forkManagedWorkingDirectory);
				}
				throw new Error(`Failed to fork codex session ${sourceThreadId}: could not roll back forked thread ${newThreadId} to the requested turn (${message})`);
			}
		}

		// The runtime's durable id: the owning session's when this fork stands
		// that session up (so every session-addressed call keeps resolving), and
		// otherwise the forked thread id — the Codex convention that a
		// chat-owned session id equals its thread id. Either way the thread id
		// itself is decoupled into the metadata overlay by
		// `_persistMaterializedSession`, so a restore round-trips.
		const sessionId = adoptedSessionId ?? newThreadId;
		const workingDirectory = forkManagedWorkingDirectory
			?? (forkResult.cwd
				? URI.file(forkResult.cwd)
				: (sourceRead.thread.cwd ? URI.file(sourceRead.thread.cwd) : options?.workingDirectories?.[0]));
		const forkWorkingDirectories = multiRootEnabled
			? distinctWorkingDirectories(
				forkResult.runtimeWorkspaceRoots?.length
					? forkResult.runtimeWorkspaceRoots.map(path => URI.file(path))
					: inheritedWorkingDirectories,
			)
			: undefined;

		const session = this._createResumedSessionEntry(
			sessionId,
			newThreadId,
			workingDirectory,
			model,
			target,
			forkWorkingDirectories,
			multiRootEnabled,
			options?.agent ?? sourceSession?.agent,
			forkResult.thread.modelProvider ?? resolvedModel?.modelProvider ?? sourceRead.thread.modelProvider,
		);
		session.managedWorkingDirectory = forkManagedWorkingDirectory;
		this._sessions.set(sessionId, session);
		this._sessionIdByThreadId.set(newThreadId, sessionId);
		// Record the exact-chat binding at registration time, mirroring the
		// deferred path: the fork must never be observably unbound between the
		// runtime entering `_sessions` and a caller awaiting the result.
		this._sessionIdByChatUri.set(target.resource.toString(), sessionId);
		this._flushPendingMcpStartupStatuses(newThreadId);
		this._applyMcpInventoryToSession(session);
		void this._refreshMcpInventory(forkConnection.client, newThreadId);
		this._persistMaterializedSession(session);

		// Seed the host→codex turn-id map for the copied turns so a later
		// edit/truncate of an inherited turn can resolve its app-server turn id.
		// Without this, `truncateChat` can't map the host id and skips the
		// rollback. `thread/fork` may regenerate turn ids, so read the forked
		// thread's authoritative kept turns and pair them, in order, with the new
		// host turn ids from `fork.turnIdMapping`. Best-effort: a failed read just
		// leaves the map unseeded (same as before), never blocking the fork.
		if (fork.turnIdMapping && fork.turnIdMapping.size > 0) {
			try {
				const forkedRead = await this._readSession(session.sessionUri);
				const forkedTurns = forkedRead?.thread.turns ?? [];
				const entries = planForkedTurnIdMap(
					sourceTurns.map(t => t.id),
					forkedTurns.map(t => t.id),
					keepThroughIndex,
					sourceSession?.hostTurnIdByAppTurnId,
					fork.turnIdMapping,
				);
				for (const [hostTurnId, forkedCodexTurnId] of entries) {
					session.codexTurnIdByHostTurnId.set(hostTurnId, forkedCodexTurnId);
				}
			} catch (err) {
				this._logService.warn(`[Codex:${newThreadId}] failed to seed forked turn-id map: ${err instanceof Error ? err.message : String(err)}`);
			}
		}

		this._logService.info(`[Codex] forked chat ${target.resource.toString()} from ${fork.source.toString()}: thread ${sourceThreadId} → ${newThreadId} (kept ${sourceTurns.length - numTurnsToDrop}/${sourceTurns.length} turns)`);
		// A fork is materialized on return, so it never emits the first-send
		// materialize receipt that carries a fresh backing — the create result
		// is the host's only chance to persist one. Without it the fork restores
		// with no backing at all and its runtime comes back unbound from the
		// chat Agent Host addresses it by.
		return session;
	}

	/**
	 * Lazily start (or resume) a codex thread for `session`. Idempotent:
	 * if `threadId` is already populated, just returns. Called from
	 * `sendMessage` before the first `turn/start`.
	 */
	private async _materializeIfNeeded(session: ICodexSession, configResource: URI = session.configurationResource, fireMaterializedEvent = true): Promise<void> {
		if (session.disposed || !session.chatChannel) {
			return;
		}
		this._advertiseServerTools(session, configResource);
		if (session.threadId !== undefined) {
			if (fireMaterializedEvent) {
				this._fireMaterialized(session);
			}
			return;
		}
		if (session.materializePromise) {
			await session.materializePromise;
			if (fireMaterializedEvent) {
				this._fireMaterialized(session);
			}
			return;
		}
		session.materializePromise = this._materialize(session, configResource).finally(() => {
			session.materializePromise = undefined;
		});
		await session.materializePromise;
		if (fireMaterializedEvent) {
			this._fireMaterialized(session);
		}
	}

	private _traceContext(session: ICodexSession) {
		return this._otelService.getSessionTraceContext(session.sessionId, session.sessionUri.toString());
	}

	private async _createManagedWorkingDirectory(ownerId: string): Promise<URI> {
		const directory = URI.file(join(os.tmpdir(), 'vscode-agent-codex', ownerId));
		await fs.promises.mkdir(directory.fsPath, { recursive: true });
		return directory;
	}

	private async _removeManagedWorkingDirectory(directory: URI): Promise<void> {
		try {
			await fs.promises.rm(directory.fsPath, { recursive: true, force: true });
		} catch (err) {
			this._logService.info(`[Codex] failed to remove managed temp folder ${directory.fsPath}: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	/**
	 * Abandon this session's own managed temp folder ahead of adopting a
	 * different (host- or user-supplied) working directory. Clears the
	 * in-memory field, removes the folder from disk via its known explicit
	 * path, and persists the clear so a later reclaim — this process or a
	 * future one restored from the same overlay — never has to infer a
	 * managed path from `cwd` again. Must run before `session.workingDirectory`
	 * is overwritten, so the folder being abandoned is never confused with the
	 * folder being adopted.
	 */
	private async _abandonManagedWorkingDirectory(session: ICodexSession): Promise<void> {
		const directory = session.managedWorkingDirectory;
		if (!directory) {
			return;
		}
		session.managedWorkingDirectory = undefined;
		await this._removeManagedWorkingDirectory(directory);
		await this._metadataStore.write(session.sessionUri, { managedWorkingDirectory: null, ownsManagedWorkingDirectory: false });
	}

	private async _materialize(session: ICodexSession, configResource: URI): Promise<void> {
		if (session.disposed || !session.chatChannel) {
			return;
		}
		await this._customizationEnablementService.initializeSession(configResource.toString());
		if (session.disposed || !session.chatChannel) {
			return;
		}
		if (!session.workingDirectory) {
			// No working directory was supplied (e.g. an editor window with no
			// workspace folder open). Codex requires one, so create a managed
			// per-session temp folder and remember it for cleanup on dispose.
			const managedWorkingDirectory = await this._createManagedWorkingDirectory(session.sessionId);
			if (session.disposed || !session.chatChannel) {
				await this._removeManagedWorkingDirectory(managedWorkingDirectory);
				return;
			}
			session.workingDirectory = managedWorkingDirectory;
			session.managedWorkingDirectory = managedWorkingDirectory;
			this._logService.info(`[Codex] no working directory supplied for session=${session.sessionUri.toString()}; using managed temp folder ${session.workingDirectory.fsPath}`);
		}
		await this._refreshSessionMcpDiscovery(session);
		if (session.disposed || !session.chatChannel) {
			return;
		}
		const config = this._readSessionConfig(configResource);
		const model = await this._resolveModel(session);
		if (session.disposed || !session.chatChannel) {
			return;
		}
		const { approvalPolicy, sandboxMode, approvalsReviewer } = this._resolveSessionPermissions(configResource);
		// Attach the session's MCP servers per-thread (verified: codex starts
		// them for this thread only): the workbench's root `mcpServers` config
		// merged with this session's enabled client-plugin servers. Passing them
		// per-thread means a new session always reflects the current root config.
		// Mid-session MCP enablement changes apply only when Codex starts or resumes a thread.
		const mcpServers = this._buildSessionMcpServers(session);
		const customizationLaunch = await this._buildCustomizationLaunch(session);
		if (session.disposed || !session.chatChannel) {
			return;
		}
		const resolvedModel = parseCodexModelSelection(model);
		const threadConfig: Record<string, JsonValue> = {
			web_search: narrowWebSearchMode(config[CodexSessionConfigKey.WebSearchMode]) ?? codexSessionConfigDefaults[CodexSessionConfigKey.WebSearchMode],
			...customizationLaunch.config,
			'features.image_generation': this._imageGenerationEnabledForModelProvider(resolvedModel.modelProvider),
		};
		const mcpServerNames = Object.keys(mcpServers);
		if (mcpServerNames.length > 0) {
			threadConfig.mcp_servers = mcpServers as JsonValue;
			this._logService.info(`[Codex] thread/start for session=${session.sessionUri.toString()} with ${mcpServerNames.length} MCP server(s): ${mcpServerNames.join(', ')}`);
		}
		const multiRootActive = this._isMultiRootActive(session);
		const runtimeWorkspaceRoots = multiRootActive ? this._runtimeWorkspaceRoots(session) : undefined;
		const selectedCapabilityRoots = [
			...(multiRootActive ? await this._selectedCapabilityRoots(session) : []),
			...customizationLaunch.selectedCapabilityRoots,
		];
		if (session.disposed || !session.chatChannel) {
			return;
		}
		// Resolve the process only after every filesystem/configuration await so a
		// connection that died during preparation is never used for thread/start.
		const conn = await this._ensureConnection();
		const startResult = await conn.client.request<'thread/start', ThreadStartResponse>('thread/start', {
			cwd: session.workingDirectory.fsPath,
			...(runtimeWorkspaceRoots?.length ? { runtimeWorkspaceRoots } : {}),
			...(selectedCapabilityRoots.length ? { selectedCapabilityRoots } : {}),
			model: resolvedModel.modelId,
			modelProvider: resolvedModel.modelProvider,
			approvalPolicy,
			sandbox: sandboxMode,
			approvalsReviewer,
			config: threadConfig,
			developerInstructions: customizationLaunch.developerInstructions,
			dynamicTools: this._buildDynamicTools(session),
		}, this._traceContext(session));
		const threadId = startResult.thread.id;
		const startedOnCurrentConnection = this._isCurrentConnection(conn);
		if (multiRootActive && !session.workingDirectories && startResult.runtimeWorkspaceRoots?.length) {
			session.workingDirectories = startResult.runtimeWorkspaceRoots.map(path => URI.file(path));
			session.workingDirectory = session.workingDirectories[0];
		}
		if (session.disposed) {
			// A provisional runtime is only marked disposed by destructive chat
			// deletion; idle release deliberately leaves it resident. The late
			// thread therefore has no durable host chat and must be archived, not
			// merely unsubscribed (which would expose an orphan in discovery).
			await this._archiveThreadBestEffort(threadId, 'chat was disposed while thread/start was in flight', conn);
			return;
		}
		session.threadId = threadId;
		session.needsResume = !startedOnCurrentConnection;
		session.materializedMcpSig = mcpServersSignature(mcpServers);
		session.materializedCustomizationsSig = customizationLaunch.signature;
		session.materializedToolsSig = toolsSignature(session.clientToolSet.merged());
		session.materializedModelProvider = resolvedModel.modelProvider;
		this._sessionIdByThreadId.set(session.threadId, session.sessionId);
		this._flushPendingMcpStartupStatuses(session.threadId);
		this._applyMcpInventoryToSession(session);
		// Advertise the agent host's server tools on this session so clients see
		// them as server-provided. Execution happens in-process via
		// `_handleDynamicToolCallRpc`; the tools were registered with codex in
		// the `dynamicTools` of the `thread/start` above.
		this._advertiseServerTools(session, configResource);
		// Surface workspace agents and the skills/hooks codex loaded for this
		// working directory in the Customizations view now that the connection is
		// ready and the cwd is known. Best-effort and fire-and-forget.
		void this._refreshSkillHookCustomizations(session);
		// Re-apply the client-plugin skill roots against the now-ready
		// connection (they may have been synced before it came up).
		void this._refreshSkillExtraRoots();
	}

	/**
	 * Restarts a pre-turn Codex thread so current `dynamicTools`, MCP servers, and customizations are applied at `thread/start`.
	 * Only safe before history exists; the first send remains responsible for publishing materialization.
	 */
	private async _restartThreadWithCurrentTools(session: ICodexSession, configResource: URI = session.configurationResource): Promise<void> {
		const conn = this._connection;
		const oldThreadId = session.threadId;
		this._logService.info(`[Codex:${session.sessionId}] restarting thread ${oldThreadId} to apply client tools [${session.clientToolSet.merged().map(t => t.name).join(', ') || '(none)'}]`);
		if (oldThreadId !== undefined) {
			this._removeThreadRouteIfOwned(oldThreadId, session.sessionId);
			this._mcpInventory.deleteThread(oldThreadId);
			if (conn.kind === 'ready') {
				try {
					await conn.client.request<'thread/unsubscribe'>('thread/unsubscribe', { threadId: oldThreadId });
				} catch (err) {
					this._logService.info(`[Codex:${oldThreadId}] thread/unsubscribe during tool restart failed: ${err instanceof Error ? err.message : String(err)}`);
				}
			}
		}
		session.threadId = undefined;
		this._applyMcpInventoryToSession(session);
		session.materializePromise = undefined;
		await this._materializeIfNeeded(session, configResource, false);
	}

	private _fireMaterialized(session: ICodexSession): void {
		if (session.disposed || !session.chatChannel) {
			return;
		}
		if (session.materializedEventFired) {
			return;
		}
		session.materializedEventFired = true;
		// Emit the resolved set (index 0 = process root); the host preserves the
		// session set's tail via an index-0 replacement.
		const chat = session.chatChannel;
		this._onDidMaterializeChat.fire({
			chat,
			project: undefined,
			workingDirectories: session.workingDirectories ?? (session.workingDirectory ? [session.workingDirectory] : undefined),
			// providerData records the runtime's own durable id, not the
			// app-server thread id — see {@link ICodexPersistedChat}. The
			// thread id is still reported as `backingSession`.
			...(session.threadId ? {
				result: {
					providerData: encodeCodexChat({
						sessionId: session.sessionId,
						...(session.model ? { model: session.model } : {}),
						...(session.managedWorkingDirectory ? { ownsManagedWorkingDirectory: true } : {}),
					}),
					backingSession: AgentSession.uri(this.id, session.threadId),
				},
			} : {}),
		});
	}

	private _schedulePrewarm(session: ICodexSession): void {
		if (!session.workingDirectory) {
			return;
		}
		// Defer prewarm while the host has not finalized the working directory
		// (a fresh worktree session whose worktree is created on the first send).
		// Prewarming would otherwise materialize a thread in the picked folder
		// before the worktree exists.
		if (this._worktree.isWorkingDirectoryPending(AgentSession.id(session.sessionUri))) {
			return;
		}
		void (async () => {
			// Prewarm is a background latency optimization, not a user action,
			// so it must NOT trigger a cold SDK download. When the SDK isn't
			// local yet, skip prewarm; the first `sendMessage` materializes the
			// thread and fires the (host-level progress-reported) download then.
			if (!(await this._isSdkResolvableWithoutDownload())) {
				this._logService.info(`[Codex] SDK not downloaded yet; skipping prewarm for session=${session.sessionUri.toString()} until a message triggers the download`);
				return;
			}
			await this._materializeIfNeeded(session, session.configurationResource, false);
			if (session.prewarmClaimed || session.threadId === undefined) {
				return;
			}
			this._logService.info(`[Codex] prewarm ready session=${session.sessionUri.toString()} threadId=${session.threadId}`);
			const prewarmTimer = setTimeout(() => {
				void this._expirePrewarm(session);
			}, CodexPrewarmTtlMs);
			session.prewarmTimer = prewarmTimer;
		})().catch(err => {
			this._logService.warn(`[Codex] prewarm failed session=${session.sessionUri.toString()}: ${err instanceof Error ? err.message : String(err)}`);
		});
	}

	private async _expirePrewarm(session: ICodexSession): Promise<void> {
		if (session.disposed || session.prewarmClaimed || session.threadId === undefined) {
			return;
		}
		const threadId = session.threadId;
		session.threadId = undefined;
		this._removeThreadRouteIfOwned(threadId, session.sessionId);
		this._mcpInventory.deleteThread(threadId);
		this._applyMcpInventoryToSession(session);
		try {
			const conn = await this._ensureConnection();
			await conn.client.request<'thread/unsubscribe'>('thread/unsubscribe', { threadId });
			this._logService.info(`[Codex] prewarm TTL eviction session=${session.sessionUri.toString()} threadId=${threadId}`);
		} catch (err) {
			this._logService.warn(`[Codex] prewarm TTL eviction failed session=${session.sessionUri.toString()} threadId=${threadId}: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	private _persistMaterializedSession(session: ICodexSession): void {
		if (session.disposed || !session.threadId || !session.prewarmClaimed) {
			return;
		}
		// Persist only once the prewarmed thread is claimed by a turn. This
		// avoids restoring an expired, never-used prewarm as a live session.
		const multiRootActive = this._isMultiRootActive(session);
		const fields = {
			threadId: session.threadId,
			cwd: session.workingDirectory,
			modelId: session.model?.id,
			agent: session.agent,
			workingDirectories: multiRootActive ? session.workingDirectories : undefined,
			ownsManagedWorkingDirectory: session.managedWorkingDirectory !== undefined,
			managedWorkingDirectory: session.managedWorkingDirectory ?? null,
		};
		void this._metadataStore.write(session.sessionUri, fields);
		if (multiRootActive) {
			const canonicalSessionUri = AgentSession.uri(this.id, session.threadId);
			if (!isEqual(session.sessionUri, canonicalSessionUri)) {
				void this._metadataStore.write(canonicalSessionUri, fields);
			}
		}
	}

	private async _persistSessionModel(session: ICodexSession): Promise<void> {
		if (session.disposed || !session.model) {
			return;
		}
		const fields = { modelId: session.model.id };
		await this._metadataStore.write(session.sessionUri, fields);
		if (this._isMultiRootActive(session)) {
			const canonicalSessionUri = AgentSession.uri(this.id, session.threadId ?? session.sessionId);
			if (canonicalSessionUri.toString() !== session.sessionUri.toString()) {
				await this._metadataStore.write(canonicalSessionUri, fields);
			}
		}
	}

	private _claimPrewarm(session: ICodexSession): void {
		session.prewarmClaimed = true;
		if (session.prewarmTimer) {
			clearTimeout(session.prewarmTimer);
			session.prewarmTimer = undefined;
		}
	}

	private async _adoptWorkingDirectoryBeforeSend(session: ICodexSession, workingDirectory: URI | undefined): Promise<void> {
		if (!workingDirectory || isEqual(session.workingDirectory, workingDirectory)) {
			return;
		}
		if (session.prewarmClaimed) {
			if (session.threadId === undefined && !session.materializePromise) {
				await this._abandonManagedWorkingDirectory(session);
				session.workingDirectory = workingDirectory;
				if (this._isMultiRootActive(session)) {
					session.workingDirectories = distinctWorkingDirectories([
						workingDirectory,
						...(session.workingDirectories?.slice(1) ?? []),
					]);
				}
			}
			return;
		}

		this._claimPrewarm(session);
		const materializePromise = session.materializePromise;
		if (materializePromise) {
			try {
				await materializePromise;
			} catch (err) {
				this._logService.info(`[Codex] stale prewarm failed before working directory changed for session=${session.sessionUri.toString()}: ${err instanceof Error ? err.message : String(err)}`);
			}
		}

		const threadId = session.threadId;
		if (threadId !== undefined) {
			session.threadId = undefined;
			this._removeThreadRouteIfOwned(threadId, session.sessionId);
			this._mcpInventory.deleteThread(threadId);
			const conn = this._connection;
			if (conn.kind === 'ready') {
				try {
					await conn.client.request<'thread/unsubscribe'>('thread/unsubscribe', { threadId });
				} catch (err) {
					this._logService.warn(`[Codex] stale prewarm unsubscribe failed session=${session.sessionUri.toString()} threadId=${threadId}: ${err instanceof Error ? err.message : String(err)}`);
				}
			}
		}
		await this._abandonManagedWorkingDirectory(session);
		session.workingDirectory = workingDirectory;
	}

	private _startTurnStopWatch(session: ICodexSession): StopWatch {
		const stopWatch = StopWatch.create(false);
		session.turnStopWatch = stopWatch;
		return stopWatch;
	}

	private _clearTurnStopWatch(session: ICodexSession): number {
		const elapsed = session.turnStopWatch?.elapsed();
		session.turnStopWatch = undefined;
		return typeof elapsed === 'number' && Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
	}

	private async _sendMessage(chat: URI, prompt: string, attachments?: readonly MessageAttachment[], turnId?: string, workingDirectories?: readonly URI[], context?: URI | IAgentChatContext): Promise<void> {
		const operationContext = context ? resolveAgentChatContext(context, chat) : undefined;
		const sessionUri = this._resolveConversationSession(chat, context);
		if (!sessionUri) {
			throw new Error(`Codex conversation is not bound: ${chat.toString()}`);
		}
		const sessionId = AgentSession.id(sessionUri);
		const session = this._sessions.get(sessionId);
		if (!session) {
			throw new Error(`Codex session not found: ${sessionUri.toString()} (chat=${chat.toString()}, binding=${this._sessionIdByChatUri.get(chat.toString()) ?? 'none'}, sessions=${[...this._sessions.keys()].join(',') || 'none'})`);
		}
		const configResource = operationContext?.configurationResource ?? sessionUri;
		session.agentMergeTurn = operationContext?.agentMergeTurn === true;
		this._ensureModelProviderAuthenticated(session.model);
		// The host hands us the complete resolved snapshot (index 0 = the process
		// root) on every send. Adopt index 0 before first materialization locks the
		// subprocess cwd; an existing thread keeps its cwd and receives the full
		// replacement below through native turn/start options.
		await this._adoptWorkingDirectoryBeforeSend(session, workingDirectories?.[0]);
		// Record the full set OUTSIDE the adoption path: a prewarm may have
		// already materialized the thread, yet the receipt is fired on this first
		// send and must still carry the resolved set. Replace, rather than merge,
		// the previous snapshot before any start, resume, or turn request is
		// constructed. A missing snapshot is retained only for legacy cold-resume
		// callers that rely on restored metadata.
		if (workingDirectories) {
			session.workingDirectories = session.multiRootEnabled && workingDirectories.length > 1
				? distinctWorkingDirectories([
					session.workingDirectory ?? workingDirectories[0],
					...workingDirectories.slice(1),
				])
				: workingDirectories;
		}
		await this._refreshSessionMcpDiscovery(session);
		const effectiveTurnId = turnId ?? generateUuid();

		// Materialize the addressed Codex thread on first send.
		try {
			this._claimPrewarm(session);
			await this._materializeIfNeeded(session, configResource, true);
			this._persistMaterializedSession(session);
		} catch (err) {
			session.agentMergeTurn = false;
			const message = err instanceof Error ? err.message : String(err);
			this._logService.error(`[Codex:${sessionId}] materialize failed: ${message}`);
			const duration = this._clearTurnStopWatch(session);
			this._fire(sessionUri, {
				type: ActionType.ChatError,
				turnId: effectiveTurnId,
				duration,
				part: createErrorResponsePart({ errorType: 'CodexMaterializeFailed', message }),
			});
			this._fire(sessionUri, { type: ActionType.ChatTurnComplete, turnId: effectiveTurnId, duration });
			return;
		}
		// Materialization acquires its own connection and may race with a process
		// exit. Resolve the connection only after it completes so the remainder of
		// this send never retains the pre-materialization client.
		let conn = await this._ensureConnection();

		// Check needsResume before the resume block clears it so restored sessions never receive a late baseline.
		if (!session.firstTurnSent && !session.needsResume) {
			const baselineWorkingDirectories = session.workingDirectories ?? (session.workingDirectory ? [session.workingDirectory] : undefined);
			this._checkpointService.captureBaselineCheckpoint(configResource, baselineWorkingDirectories).catch(err => {
				this._logService.warn(`[Codex:${sessionId}] Baseline checkpoint capture failed: ${err instanceof Error ? err.message : String(err)}`);
			});
		}

		// Codex registers client tools and MCP servers only at `thread/start`.
		// If the thread was prewarmed (or otherwise started) before the current
		// client tools / MCP servers were known, restart it now — before any
		// turn commits history, so nothing is lost — so the tools land in
		// `dynamicTools` and the servers in `config.mcp_servers`.
		const customizationLaunch = await this._buildCustomizationLaunch(session);
		const toolsChanged = toolsSignature(session.clientToolSet.merged()) !== session.materializedToolsSig;
		const mcpChanged = mcpServersSignature(this._buildSessionMcpServers(session)) !== session.materializedMcpSig;
		const customizationsChanged = customizationLaunch.signature !== session.materializedCustomizationsSig;
		if (session.firstTurnSent && mcpChanged) {
			this._markSessionForReload(session);
		}
		if (!session.firstTurnSent && !session.needsResume && (toolsChanged || mcpChanged || customizationsChanged)) {
			try {
				await this._restartThreadWithCurrentTools(session, configResource);
				this._persistMaterializedSession(session);
			} catch (err) {
				session.agentMergeTurn = false;
				const message = err instanceof Error ? err.message : String(err);
				this._logService.error(`[Codex:${sessionId}] tool re-materialize failed: ${message}`);
				const duration = this._clearTurnStopWatch(session);
				this._fire(sessionUri, {
					type: ActionType.ChatError,
					turnId: effectiveTurnId,
					duration,
					part: createErrorResponsePart({ errorType: 'CodexMaterializeFailed', message }),
				});
				this._fire(sessionUri, { type: ActionType.ChatTurnComplete, turnId: effectiveTurnId, duration });
				return;
			}
		} else if (session.firstTurnSent && !session.needsResume && customizationsChanged) {
			// Workspace agents have no client-push event to reconcile them. A
			// send-time signature change must resume the existing thread so Codex
			// reloads its roles and developer instructions without losing history.
			this._markSessionForReload(session);
		}
		try {
			if (session.needsResume) {
				await this._resumeSession(session, conn);
			}
			// `_resumeSession` may have retried on a replacement process. Carry the
			// exact connection that now owns the loaded thread into turn preparation.
			conn = (await this._ensureThreadConnection(session, conn)).connection;
		} catch (err) {
			session.agentMergeTurn = false;
			const duration = this._clearTurnStopWatch(session);
			this._fire(sessionUri, {
				type: ActionType.ChatError,
				turnId: effectiveTurnId,
				duration,
				part: createErrorResponsePart({
					errorType: 'CodexResumeFailed',
					message: err instanceof Error ? err.message : String(err),
				}),
			});
			this._fire(sessionUri, { type: ActionType.ChatTurnComplete, turnId: effectiveTurnId, duration });
			return;
		}

		let cleanupPaths: readonly string[] = [];
		let turnRequestStarted = false;
		const isCompactCommand = parseLeadingSlashCommand(prompt)?.command === CODEX_COMPACT_SLASH_COMMAND;
		try {
			if (isCompactCommand) {
				await this._ensureCurrentLaunchBeforeTurn(session, configResource, conn);
				conn = (await this._ensureThreadConnection(session, conn)).connection;
				const threadId = session.threadId!;
				// Claim the host turn only once every reconnect-prone preparation step
				// has completed. From here, connection-loss handling owns finalization.
				session.lastPromptText = prompt;
				session.currentTurnId = effectiveTurnId;
				session.modifiedTime = Date.now();
				this._startTurnStopWatch(session);
				turnRequestStarted = true;
				await conn.client.request<'thread/compact/start'>('thread/compact/start', { threadId }, this._traceContext(session));
				session.firstTurnSent = true;
				return;
			}
			const resolvedInput = resolveCodexInput(prompt, attachments);
			cleanupPaths = resolvedInput.cleanupPaths;
			const model = await this._resolveModel(session);
			const resolvedModel = parseCodexModelSelection(model);
			const currentCustomizationLaunch = await this._ensureCurrentLaunchBeforeTurn(session, configResource, conn);
			conn = (await this._ensureThreadConnection(session, conn)).connection;
			const threadId = session.threadId!;
			const turnOptions = this._turnStartOptions(session, resolvedModel.modelId, currentCustomizationLaunch.developerInstructions, configResource);
			const hostInstructions = resolveAgentHostInstructions(operationContext);
			session.lastPromptText = prompt;
			session.currentTurnId = effectiveTurnId;
			session.modifiedTime = Date.now();
			this._startTurnStopWatch(session);
			turnRequestStarted = true;
			await conn.client.request<'turn/start'>('turn/start', {
				threadId,
				input: resolvedInput.input.slice(),
				model: resolvedModel.modelId,
				...turnOptions,
				...(hostInstructions?.length ? {
					additionalContext: {
						'vscode.agentHost': { kind: 'application', value: hostInstructions.join('\n\n') },
					},
				} : {}),
			}, this._traceContext(session));
			// The thread now has committed history; client tools are locked to
			// what was registered at `thread/start` and won't be re-applied.
			session.firstTurnSent = true;
			// We don't await turn completion here — the notification
			// stream emits ChatTurnComplete asynchronously.
		} catch (err) {
			// A transport exit finalizes and clears an owned turn in
			// `_handleConnectionLost`. Do not start or complete it a second time.
			if (turnRequestStarted && session.currentTurnId !== effectiveTurnId) {
				return;
			}
			session.agentMergeTurn = false;
			if (turnRequestStarted) {
				session.currentTurnId = undefined;
				session.currentAppTurnId = undefined;
			}
			if (err instanceof CancellationError) {
				this._fire(sessionUri, { type: ActionType.ChatTurnCancelled, turnId: effectiveTurnId, duration: this._clearTurnStopWatch(session) });
				return;
			}
			const message = err instanceof Error ? err.message : String(err);
			const operation = isCompactCommand ? 'thread/compact/start' : 'turn/start';
			this._logService.error(`[Codex:${sessionId}] ${operation} error: ${message}`);
			const duration = this._clearTurnStopWatch(session);
			this._fire(sessionUri, {
				type: ActionType.ChatError,
				turnId: effectiveTurnId,
				duration,
				part: createErrorResponsePart({ errorType: isCompactCommand ? 'CodexCompactionError' : 'CodexTurnError', ...extractForwardedErrorInfo(message) }),
			});
			this._fire(sessionUri, { type: ActionType.ChatTurnComplete, turnId: effectiveTurnId, duration });
		} finally {
			// Best-effort temp-file cleanup. Image-on-localImage will be
			// re-read by codex synchronously during the turn so this is
			// safe to defer slightly; we delete after a generous grace.
			if (cleanupPaths.length > 0) {
				setTimeout(() => {
					for (const p of cleanupPaths) {
						try { fs.unlinkSync(p); } catch { /* ignore */ }
					}
				}, 30_000);
			}
		}

	}

	private async _ensureCurrentLaunchBeforeTurn(session: ICodexSession, configResource: URI, conn: IConnectionReady): Promise<ICodexCustomizationLaunch> {
		let previousUnresolvedState: string | undefined;
		while (true) {
			if (session.disposed) {
				throw new CancellationError();
			}
			const customizationLaunch = await this._buildCustomizationLaunch(session);
			if (session.disposed) {
				throw new CancellationError();
			}
			const mcpSignature = mcpServersSignature(this._buildSessionMcpServers(session));
			const toolSignature = toolsSignature(session.clientToolSet.merged());
			if (mcpSignature === session.materializedMcpSig
				&& (session.firstTurnSent || toolSignature === session.materializedToolsSig)
				&& customizationLaunch.signature === session.materializedCustomizationsSig) {
				return customizationLaunch;
			}
			const unresolvedState = JSON.stringify({
				threadId: session.threadId,
				materializedMcp: session.materializedMcpSig,
				materializedTools: session.materializedToolsSig,
				materializedCustomizations: session.materializedCustomizationsSig,
				targetMcp: mcpSignature,
				targetTools: toolSignature,
				targetCustomizations: customizationLaunch.signature,
			});
			if (unresolvedState === previousUnresolvedState) {
				throw new Error(`Codex launch configuration did not converge for session ${session.sessionId}`);
			}
			previousUnresolvedState = unresolvedState;
			if (session.firstTurnSent) {
				this._markSessionForReload(session);
				await this._resumeSession(session, conn);
			} else {
				await this._restartThreadWithCurrentTools(session, configResource);
				this._persistMaterializedSession(session);
			}
			if (session.disposed) {
				throw new CancellationError();
			}
		}
	}

	setPendingMessages(chat: URI, steeringMessage: PendingMessage | undefined, _queuedMessages: readonly PendingMessage[]): void {
		// Queued messages are consumed server-side (AgentSideEffects drives a
		// fresh turn per `idle`); only the single steering message reaches the
		// agent for mid-turn injection.
		if (!steeringMessage) {
			return;
		}
		// Steering is always addressed by a concrete chat channel URI, which
		// resolves through the binding recorded when that chat was provisioned
		// or restored — never through URI shape.
		const sessionUri = this._resolveConversationSession(chat);
		if (!sessionUri) {
			return;
		}
		const sessionId = AgentSession.id(sessionUri);
		const session = this._sessions.get(sessionId);
		if (!session) {
			return;
		}
		// `_syncPendingMessages` re-sends the current steering message on every
		// pending-state change; ignore a steering message already in flight.
		if (session.pendingSteeringFlips.has(steeringMessage.id)) {
			return;
		}
		const appTurnId = session.currentAppTurnId;
		const conn = this._connection;
		const text = steeringMessage.message.text;
		const hasContent = text.length > 0 || (steeringMessage.message.attachments?.length ?? 0) > 0;
		// Steering only makes sense mid-turn. Without an active codex turn, a
		// ready connection, a thread, or any content we cannot steer — clear
		// the pending bubble so it doesn't stick (the model never saw it).
		if (!appTurnId || conn.kind !== 'ready' || session.threadId === undefined || !hasContent) {
			this._fireSteeringConsumed(session, steeringMessage.id);
			return;
		}
		const { input } = resolveCodexInput(text, steeringMessage.message.attachments);
		const threadId = session.threadId;
		// Buffer so the codex `userMessage` echo can promote this into a
		// visible turn (see {@link _handleSteeredUserMessage}).
		session.pendingSteeringFlips.set(steeringMessage.id, steeringMessage);
		void conn.client.request<'turn/steer'>('turn/steer', {
			threadId,
			input: input.slice(),
			expectedTurnId: appTurnId,
		}).catch(err => {
			// Steer rejected (commonly an `expectedTurnId` mismatch because the
			// turn just completed). Drop the buffered entry and clear the
			// pending bubble so it doesn't stick.
			if (session.pendingSteeringFlips.delete(steeringMessage.id)) {
				this._fireSteeringConsumed(session, steeringMessage.id);
			}
			if (err instanceof JsonRpcError) {
				this._logService.info(`[Codex:${sessionId}] turn/steer skipped: ${err.message}`);
				return;
			}
			this._logService.warn(`[Codex:${sessionId}] turn/steer failed: ${err instanceof Error ? err.message : String(err)}`);
		});
	}

	private async _abort(chat: URI, context: URI | IAgentChatContext): Promise<void> {
		const operationContext = resolveAgentChatContext(context, chat);
		const sessionUri = this._resolveConversationSession(chat, operationContext);
		if (!sessionUri) {
			return;
		}
		const sessionId = AgentSession.id(sessionUri);
		const session = this._sessions.get(sessionId);
		if (!session) {
			return;
		}
		// Clear any steering buffered for the turn we're aborting so its
		// pending bubble doesn't outlive the turn.
		this._drainPendingSteering(session);
		if (!session.currentAppTurnId || session.threadId === undefined) {
			return;
		}
		const threadId = session.threadId;
		const conn = this._connection;
		if (conn.kind !== 'ready') {
			return;
		}
		try {
			await conn.client.request<'turn/interrupt'>('turn/interrupt', {
				threadId,
				turnId: session.currentAppTurnId,
			});
		} catch (err) {
			this._logService.warn(`[Codex:${sessionId}] turn/interrupt failed: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	/**
	 * Drop the active-client handles addressed to exactly this chat. Called
	 * on disposal so a departing chat never leaks its handles in
	 * {@link _activeClientHandles} — there is no sibling inference, so a
	 * sibling chat's handles are left untouched.
	 */
	private _removeActiveClientHandlesForChat(chat: URI): void {
		const prefix = `${chat.toString()}\u0000`;
		for (const [key, handle] of this._activeClientHandles) {
			if (key.startsWith(prefix)) {
				handle.remove();
				this._activeClientHandles.delete(key);
			}
		}
	}

	private async _disposeChat(chat: URI, context: URI | IAgentChatContext): Promise<void> {
		const operationContext = resolveAgentChatContext(context, chat);
		const runtimeSession = this._resolveConversationSession(chat, operationContext);
		this._removeActiveClientHandlesForChat(chat);
		// Stop new chat-addressed work from reaching this runtime before checking
		// whether its released resources are still retained by a durable binding.
		// In particular, `_reclaimManagedWorkingDirectoryIfNotLive` deliberately
		// treats a binding as live, so destructive disposal must drop it first.
		if (runtimeSession) {
			this._sessionIdByChatUri.delete(chat.toString());
		}
		// Configuration-scope ref tracking is independent of whether a
		// runtime is currently resolvable for `chat` — an unaddressable chat
		// still occupied a slot in its scope's ref set when it was created.
		await this._releaseConfigScopeIfDone(chat, operationContext);
		if (!runtimeSession) {
			return;
		}
		await this._disposeRuntimeSession(runtimeSession, true);
	}

	private async _releaseChat(chat: URI, context: URI | IAgentChatContext): Promise<void> {
		const operationContext = resolveAgentChatContext(context, chat);
		const runtimeSession = this._resolveConversationSession(chat, operationContext);
		if (!runtimeSession) {
			return;
		}
		await this._disposeRuntimeSession(runtimeSession, false);
	}

	/**
	 * Tear down the runtime backing a chat, addressed by the runtime's own
	 * session URI. `deleteManagedWorkingDirectory` distinguishes the
	 * destructive {@link IAgentChats.disposeChat} path from the
	 * non-destructive {@link IAgentChats.releaseChat} (idle-eviction) path.
	 *
	 * Only a release (`deleteManagedWorkingDirectory === false`) no-ops for
	 * runtimes with nothing durable to resume from (provisional runtimes whose
	 * codex thread was never started — evicting them from memory would lose
	 * their only copy of state) and for runtimes with a turn in flight —
	 * `thread/unsubscribe` mid-turn would drop live progress. A destructive
	 * dispose has no durable state to preserve either way, so it always tears
	 * a provisional runtime down; leaving one behind would leak its pending
	 * registries, MCP controller, prewarm timer, and (once claimed) managed
	 * working directory, and would let a still-running prewarm continuation
	 * materialize a thread for a chat the host already considers gone.
	 */
	private async _disposeRuntimeSession(sessionUri: URI, deleteManagedWorkingDirectory: boolean): Promise<void> {
		const sessionId = AgentSession.id(sessionUri);
		const session = this._sessions.get(sessionId);
		if (!session) {
			if (deleteManagedWorkingDirectory) {
				await this._reclaimManagedWorkingDirectoryIfNotLive(sessionUri);
			}
			return;
		}
		if (!deleteManagedWorkingDirectory) {
			// Provisional sessions have no codex thread on disk to resume from;
			// releasing them would lose their in-memory state. Leave them in
			// place. Likewise a defensive active-turn guard: the orchestrator
			// already skips eviction while a turn is active, but one could have
			// started between that check and this call.
			if (session.threadId === undefined || session.currentTurnId !== undefined) {
				return;
			}
		}
		if (session.threadId !== undefined) {
			this._logService.info(`[Codex:${session.threadId}] Releasing idle session from memory (durable state preserved)`);
		} else {
			this._logService.info(`[Codex] Disposing provisional session ${session.sessionUri.toString()} (codex thread never started)`);
		}
		if (!deleteManagedWorkingDirectory && session.managedWorkingDirectory) {
			this._releasedManagedWorkingDirectories.set(sessionId, session.managedWorkingDirectory);
		}
		await this._teardownSessionInMemory(session, sessionId, deleteManagedWorkingDirectory);
	}

	/**
	 * Shared in-memory teardown for a codex session: drops the tracked entry,
	 * disposes its MCP controller, unparks pending approvals / client tool calls
	 * / user inputs, and unsubscribes the codex thread (`thread/unsubscribe`).
	 * The codex thread's on-disk rollout is always preserved (there is no
	 * app-server delete), so a released session can still be resumed later —
	 * but a destructive `deleteManagedWorkingDirectory` also releases this
	 * runtime's retained OTel trace context (see {@link _traceContext}), since
	 * that context is scoped to this exact runtime's lifetime, not to its
	 * durable rollout. Idle eviction must not release it: a released runtime
	 * is expected to be re-addressed later and should keep the same trace
	 * parent when it is. Shared by the destructive chat-dispose path (which
	 * the orchestrator pairs with durable deletion) and the non-destructive
	 * chat-release (idle eviction) path.
	 */
	private async _teardownSessionInMemory(session: ICodexSession, sessionId: string, deleteManagedWorkingDirectory: boolean): Promise<void> {
		session.disposed = true;
		this._claimPrewarm(session);
		this._sessions.delete(sessionId);
		this._releaseMcpPublisher(session);
		session.mcpController?.dispose();
		this._sessionMcpDiscoveries.get(sessionId)?.dispose();
		this._sessionMcpDiscoveries.delete(sessionId);
		// If the session contributed client-plugin skills, drop them from the
		// process-global skill-root union now that it is gone.
		if (!session.clientCustomizations.isEmpty()) {
			void this._refreshSkillExtraRoots();
		}
		// Remove the managed temp folder created for a session that had no
		// client-supplied working directory. Best-effort; the OS temp dir is
		// reclaimed anyway, but clean up proactively so it doesn't accumulate.
		if (deleteManagedWorkingDirectory && session.managedWorkingDirectory) {
			await this._removeManagedWorkingDirectory(session.managedWorkingDirectory);
		}
		if (deleteManagedWorkingDirectory) {
			this._releasedManagedWorkingDirectories.delete(sessionId);
			// Key must match the exact acquisition key in `_traceContext`: this
			// runtime's own `sessionUri`, never the config scope or chat channel
			// it happens to be addressed by.
			this._otelService.releaseSessionTraceContext(session.sessionUri.toString());
		}
		if (session.customizationDirectory) {
			const dir = session.customizationDirectory.fsPath;
			fs.promises.rm(dir, { recursive: true, force: true }).catch(err => {
				this._logService.info(`[Codex] failed to remove customization folder ${dir}: ${err instanceof Error ? err.message : String(err)}`);
			});
		}
		if (session.threadId !== undefined) {
			this._removeThreadRouteIfOwned(session.threadId, sessionId);
			this._mcpInventory.deleteThread(session.threadId);
		}
		// Unpark any pending approvals so codex doesn't deadlock waiting
		// on a response we will never deliver.
		session.pendingCommandApprovals.denyAll('decline');
		// Reject any in-flight client tool calls so their `item/tool/call`
		// handlers unwind instead of awaiting a response that won't arrive.
		session.pendingClientToolCalls.rejectAll(new CancellationError());
		session.pendingUserInputs.rejectAll(new CancellationError());
		// Clear any buffered steering so its pending bubble doesn't leak.
		this._drainPendingSteering(session);
		// Tear down any live subagent child threads spawned by this session so
		// their parked approvals unwind and their tracking doesn't leak. The
		// orchestrator closes the child conversations as part of session teardown.
		for (const [childThreadId, subagent] of this._subagentsByThreadId) {
			if (subagent.parentSessionId === sessionId) {
				subagent.session.pendingCommandApprovals.denyAll('decline');
				this._subagentsByThreadId.delete(childThreadId);
			}
		}
		const conn = this._connection;
		if (conn.kind === 'ready' && session.threadId !== undefined) {
			const threadId = session.threadId;
			// `thread/unsubscribe` is the codex-native way to release a
			// session. Codex evicts after its 30-minute idle grace.
			try {
				await conn.client.request<'thread/unsubscribe'>('thread/unsubscribe', { threadId });
			} catch (err) {
				this._logService.info(`[Codex:${threadId}] thread/unsubscribe failed: ${err instanceof Error ? err.message : String(err)}`);
			}
		}
	}

	private async _changeModel(chat: URI, model: ModelSelection, context: URI | IAgentChatContext): Promise<void> {
		const operationContext = resolveAgentChatContext(context, chat);
		const sessionUri = this._resolveConversationSession(chat, operationContext);
		if (!sessionUri) {
			return;
		}
		const supported = this._supportedModelOrUndefined(model);
		if (!supported) {
			throw new Error(`Codex model '${model.id}' is not available.`);
		}
		this._ensureModelProviderAuthenticated(supported);
		const session = this._sessions.get(AgentSession.id(sessionUri));
		if (!session) {
			// Idle eviction drops only the in-memory runtime; its exact chat binding
			// remains. Persist the selection so reopening that chat restores the
			// model the user just chose instead of silently retaining the old one.
			await this._metadataStore.write(sessionUri, { modelId: supported.id });
			return;
		}
		const previousProvider = session.materializedModelProvider ?? (session.model ? parseCodexModelSelection(session.model).modelProvider : undefined);
		const nextProvider = parseCodexModelSelection(supported).modelProvider;
		session.model = supported;
		if (previousProvider !== undefined && previousProvider !== nextProvider) {
			await this._resetSessionForModelProviderChange(session, nextProvider);
		}
		await this._persistSessionModel(session);
		this._persistMaterializedSession(session);
	}

	/**
	 * Truncate the chat Agent Host addresses, not the session it belongs to.
	 *
	 * Codex backs every chat with its own thread, so the rollback target is the
	 * runtime bound to `chat` — resolved through the recorded binding, never by
	 * re-deriving membership from its configuration scope or URI shape.
	 *
	 * Codex rolls back by a count of trailing turns. Resolve how many turns
	 * follow `turnId` (or all of them when omitted) from the persisted thread,
	 * whose turn ids match the workbench's restored turn ids (see
	 * {@link replayThreadToTurns}). Unknown ids no-op to avoid data loss.
	 */
	async truncateChat(chat: URI, turnId?: string, context?: URI | IAgentChatContext): Promise<void> {
		const targetUri = this._resolveConversationSession(chat, context);
		if (!targetUri) {
			return;
		}
		const targetSession = this._sessions.get(AgentSession.id(targetUri));
		if (targetSession?.needsResume) {
			await this._resumeSession(targetSession);
		}
		const read = await this._readSession(targetUri);
		if (!read) {
			return;
		}
		const turns = read.thread.turns ?? [];
		if (turns.length === 0) {
			return;
		}
		let numTurns: number;
		if (turnId === undefined) {
			numTurns = turns.length;
		} else {
			// A live session's workbench turn id maps to a codex turn id; a
			// restored session already uses codex turn ids, so fall back to the
			// id as-is on a miss.
			const codexTurnId = targetSession?.codexTurnIdByHostTurnId.get(turnId) ?? turnId;
			const index = turns.findIndex(t => t.id === codexTurnId);
			if (index === -1) {
				this._logService.warn(`[Codex] truncateChat: turnId ${turnId} not found in thread ${read.thread.id}; skipping`);
				return;
			}
			numTurns = turns.length - (index + 1);
		}
		if (numTurns <= 0) {
			return;
		}
		try {
			const conn = targetSession
				? (await this._ensureThreadConnection(targetSession)).connection
				: await this._ensureConnection();
			await conn.client.request<'thread/rollback'>('thread/rollback', { threadId: read.thread.id, numTurns });
		} catch (err) {
			this._logService.warn(`[Codex:${read.thread.id}] thread/rollback failed: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	async onArchivedChanged(sessionUri: URI, isArchived: boolean): Promise<void> {
		const threadId = await this._resolveThreadId(sessionUri);
		if (threadId === undefined) {
			return;
		}
		try {
			await this._withOnDemandConnection(async client => {
				if (isArchived) {
					await client.request<'thread/archive'>('thread/archive', { threadId });
				} else {
					await client.request<'thread/unarchive'>('thread/unarchive', { threadId });
				}
			});
		} catch (err) {
			this._logService.warn(`[Codex:${threadId}] thread/${isArchived ? 'archive' : 'unarchive'} failed: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	/** Resolve the codex thread id for a session: in-memory → persisted overlay → legacy URI identity. */
	private async _resolveThreadId(sessionUri: URI): Promise<string | undefined> {
		const existing = this._sessions.get(AgentSession.id(sessionUri));
		if (existing?.threadId !== undefined) {
			return existing.threadId;
		}
		const overlay = await this._metadataStore.read(sessionUri);
		return overlay.threadId ?? AgentSession.id(sessionUri);
	}

	respondToPermissionRequest(requestId: string, approved: boolean): void {
		// `requestId` is the host-side toolCallId; iterate sessions (including
		// live subagent child sessions, whose command approvals live on their
		// own registry) and resolve the first match. Mirrors Claude/Copilot.
		const sessions = [
			...this._sessions.values(),
			...[...this._subagentsByThreadId.values()].map(s => s.session),
		];
		for (const session of sessions) {
			if (session.pendingCommandApprovals.respond(requestId, approved ? 'accept' : 'decline')) {
				if (!approved) {
					// Remember the decline so the tool's `item/completed` (which
					// codex reports as a generic failure) maps to `userCancelled`.
					session.mapState.declinedToolCalls.add(requestId);
				}
				return;
			}
		}
		this._logService.info(`[Codex] respondToPermissionRequest: unknown requestId=${requestId}`);
	}

	respondToUserInputRequest(requestId: string, response: ChatInputResponseKind, answers?: Record<string, ChatInputAnswer>): void {
		// `requestId` was minted per request; find the owning session and
		// resolve its parked deferred. Mirrors respondToPermissionRequest.
		for (const session of this._sessions.values()) {
			if (session.pendingUserInputs.respond(requestId, { response, answers })) {
				return;
			}
		}
		this._logService.info(`[Codex] respondToUserInputRequest: unknown requestId=${requestId}`);
	}

	/**
	 * Reconstruct the turns of an addressed chat from its backing thread's
	 * persisted rollout. Chat-addressed only: the owning session comes from the
	 * recorded binding or the host-supplied context, never from the URI.
	 */
	private async _getChatMessages(chat: URI, context: URI | IAgentChatContext): Promise<readonly Turn[]> {
		const operationContext = resolveAgentChatContext(context, chat);
		const sessionUri = this._resolveConversationSession(chat, operationContext);
		if (!sessionUri) {
			return [];
		}
		const session = this._sessions.get(AgentSession.id(sessionUri));
		if (session?.needsResume) {
			try {
				await this._resumeSession(session);
			} catch (error) {
				if (!(error instanceof JsonRpcError) || !/no rollout found for thread id/i.test(error.message)) {
					throw error;
				}
				await this._replaceMissingRolloutBacking(session, operationContext.configurationResource);
			}
		}
		const read = await this._readSession(sessionUri);
		return read
			? replayThreadToTurns(read.thread, toRolloutTurnModels(read.rolloutMetadata), read.rolloutMetadata?.threadCoordinationByTurnId)
			: [];
	}

	/**
	 * Replace a restored thread that app-server never persisted. `thread/start`
	 * assigns an id before the first provider turn, but no rollout exists until
	 * that turn begins. A host-only peer transcript can therefore outlive its
	 * empty backing across a restart. Keep the stable host runtime identity and
	 * mint a fresh thread; there is no provider history to discard.
	 */
	private async _replaceMissingRolloutBacking(session: ICodexSession, configurationResource: URI): Promise<void> {
		const missingThreadId = session.threadId;
		if (!missingThreadId) {
			return;
		}
		this._logService.info(`[Codex:${session.sessionId}] replacing unpersisted thread ${missingThreadId}`);
		this._removeThreadRouteIfOwned(missingThreadId, session.sessionId);
		this._mcpInventory.deleteThread(missingThreadId);
		session.threadId = undefined;
		session.needsResume = false;
		session.unsubscribeBeforeResume = false;
		session.firstTurnSent = false;
		session.materializePromise = undefined;
		session.materializedToolsSig = undefined;
		session.materializedMcpSig = undefined;
		session.materializedCustomizationsSig = undefined;
		session.materializedModelProvider = undefined;
		session.materializedEventFired = false;
		session.hostTurnIdByAppTurnId.clear();
		session.codexTurnIdByHostTurnId.clear();
		this._applyMcpInventoryToSession(session);
		await this._materializeIfNeeded(session, configurationResource, true);
		this._persistMaterializedSession(session);
	}

	private async _resumeSession(session: ICodexSession, connection?: IConnectionReady): Promise<void> {
		while (session.needsResume || session.resumePromise) {
			if (session.resumePromise) {
				try {
					await session.resumePromise;
				} catch (error) {
					if (error instanceof CodexConnectionReplacedError) {
						connection = undefined;
						continue;
					}
					throw error;
				}
				continue;
			}
			const unsubscribeBeforeResume = session.unsubscribeBeforeResume;
			session.needsResume = false;
			session.unsubscribeBeforeResume = false;
			const preferredConnection = connection;
			connection = undefined;
			let resumeConnection: IConnectionReady | undefined;
			session.resumePromise = (async () => {
				const threadId = session.threadId;
				if (!threadId) {
					throw new Error(`Cannot resume Codex session ${session.sessionId}: no backing thread`);
				}
				if (session.disposed) {
					throw new CancellationError();
				}
				const conn = preferredConnection && this._isCurrentConnection(preferredConnection)
					? preferredConnection
					: await this._ensureConnection();
				resumeConnection = conn;
				await this._refreshSessionMcpDiscovery(session);
				this._assertCurrentConnection(conn);
				if (unsubscribeBeforeResume) {
					// `thread/resume` deliberately rejoins a loaded subscribed thread and
					// ignores conflicting overrides. Unsubscribe first so app-server
					// reloads the persisted history with the current launch-only config.
					await conn.client.request<'thread/unsubscribe'>('thread/unsubscribe', { threadId });
				}
				const mcpServers = this._buildSessionMcpServers(session);
				const customizationLaunch = await this._buildCustomizationLaunch(session);
				const multiRootActive = this._isMultiRootActive(session);
				const runtimeWorkspaceRoots = multiRootActive ? this._runtimeWorkspaceRoots(session) : undefined;
				const resolvedModel = parseCodexModelSelection(await this._resolveModel(session));
				if (session.disposed) {
					throw new CancellationError();
				}
				this._assertCurrentConnection(conn);
				const resumeResult = await conn.client.request<'thread/resume', ThreadResumeResponse>(
					'thread/resume',
					buildCodexResumeParams(
						resolvedModel.modelProvider,
						threadId,
						mcpServers,
						runtimeWorkspaceRoots,
						customizationLaunch.config,
						customizationLaunch.developerInstructions,
						this._imageGenerationEnabledForModelProvider(resolvedModel.modelProvider),
					),
					this._traceContext(session),
				);
				this._assertCurrentConnection(conn);
				if (session.disposed) {
					try {
						await conn.client.request<'thread/unsubscribe'>('thread/unsubscribe', { threadId });
					} catch (err) {
						this._logService.info(`[Codex:${threadId}] thread/unsubscribe after disposed resume failed: ${err instanceof Error ? err.message : String(err)}`);
					}
					throw new CancellationError();
				}
				if (multiRootActive && !session.workingDirectories && resumeResult.runtimeWorkspaceRoots?.length) {
					session.workingDirectories = resumeResult.runtimeWorkspaceRoots.map(path => URI.file(path));
					session.workingDirectory = session.workingDirectories[0];
				}
				session.materializedMcpSig = mcpServersSignature(mcpServers);
				session.materializedCustomizationsSig = customizationLaunch.signature;
				void this._refreshMcpInventory(conn.client, threadId);
			})().catch(err => {
				if (!session.disposed) {
					session.needsResume = true;
					session.unsubscribeBeforeResume ||= unsubscribeBeforeResume;
				}
				if (err instanceof CodexConnectionReplacedError || (resumeConnection !== undefined && !this._isCurrentConnection(resumeConnection))) {
					throw new CodexConnectionReplacedError();
				}
				throw err;
			}).finally(() => {
				session.resumePromise = undefined;
			});
			try {
				await session.resumePromise;
			} catch (error) {
				if (error instanceof CodexConnectionReplacedError) {
					continue;
				}
				throw error;
			}
		}
	}

	/**
	 * Return a thread id together with the exact persistent connection on which
	 * that thread is loaded. A reconnect between resume and the caller's request
	 * restarts the loop instead of handing an unloaded replacement to the caller.
	 */
	private async _ensureThreadConnection(session: ICodexSession, preferredConnection?: IConnectionReady): Promise<{ readonly threadId: string; readonly connection: IConnectionReady }> {
		while (true) {
			if (session.disposed) {
				throw new CancellationError();
			}
			const threadId = session.threadId;
			if (!threadId) {
				throw new Error(`Cannot use Codex session ${session.sessionId}: no backing thread`);
			}
			const connection = preferredConnection && this._isCurrentConnection(preferredConnection)
				? preferredConnection
				: await this._ensureConnection();
			preferredConnection = undefined;
			if (session.needsResume || session.resumePromise) {
				await this._resumeSession(session, connection);
			}
			if (this._isCurrentConnection(connection) && !session.needsResume && !session.resumePromise && session.threadId === threadId) {
				return { threadId, connection };
			}
		}
	}

	private _isCurrentConnection(connection: IConnectionReady): boolean {
		return this._connection.kind === 'ready' && this._connection.client === connection.client;
	}

	private _assertCurrentConnection(connection: IConnectionReady): void {
		if (!this._isCurrentConnection(connection)) {
			throw new CodexConnectionReplacedError();
		}
	}

	/**
	 * Archive a thread that the host never committed, retrying once on the
	 * replacement app-server when the connection that created it has gone away.
	 * Cleanup is best-effort so its failure never hides the original create,
	 * fork, or disposal error.
	 */
	private async _archiveThreadBestEffort(threadId: string, reason: string, preferredConnection?: IConnectionReady): Promise<void> {
		let lastError = 'unknown error';
		for (let attempt = 0; attempt < 2; attempt++) {
			let connection: IConnectionReady | undefined;
			try {
				connection = attempt === 0 && preferredConnection && this._isCurrentConnection(preferredConnection)
					? preferredConnection
					: await this._ensureConnection();
				await connection.client.request<'thread/archive'>('thread/archive', { threadId });
				return;
			} catch (error) {
				lastError = error instanceof Error ? error.message : String(error);
				if (attempt === 0 && connection && !this._isCurrentConnection(connection) && !this._isShuttingDown && !this._store.isDisposed) {
					continue;
				}
				break;
			}
		}
		this._logService.warn(`[Codex:${threadId}] failed to archive backing after ${reason}: ${lastError}`);
	}

	private _markSessionForReload(session: ICodexSession): void {
		session.unsubscribeBeforeResume = true;
		session.needsResume = true;
	}

	/**
	 * Describe a host-addressed chat. `providerData` is the opaque backing
	 * this agent minted for the chat, so it — not the addressed chat URI —
	 * names the runtime to restore (they coincide for a session-backing
	 * runtime and differ for anything re-keyed onto another conversation).
	 *
	 * The registered entry is deliberately keyed and addressed by that backing
	 * id: `_createResumedSessionEntry` derives its `sessionUri`, so this can
	 * never mint an entry whose key and URI disagree. The *addressed* chat
	 * URI stays host-facing only — it labels the returned metadata, while the
	 * context's `configurationResource` names the session the host's server
	 * tools are advertised on.
	 */
	async getChatMetadata(chat: URI, context: URI | IAgentChatContext, providerData?: string, options?: IAgentChatMetadataOptions): Promise<IAgentChatMetadata | undefined> {
		// Session listing calls this method too, so metadata reads are passive by
		// default. A restore is the host's explicit boundary for reopening an
		// existing Codex session and may retain the app-server it needs.
		if (options?.activation === 'restore') {
			this._activate();
		}
		const session = resolveAgentChatContext(context, chat).configurationResource;
		const backing = providerData ? decodeCodexChat(providerData) : undefined;
		const sessionId = backing?.sessionId ?? AgentSession.id(session);
		// A live runtime answers from memory. `thread/read` would otherwise
		// re-enter the app-server, which cannot answer while one of its own
		// threads is blocked waiting on a dynamic tool call — exactly the state
		// a session server tool (`get_current_session`) runs in.
		const live = this._sessions.get(sessionId);
		if (live) {
			this._advertiseServerTools(live, session);
			return {
				chat,
				startTime: live.startTime,
				modifiedTime: live.modifiedTime,
				summary: live.summary,
				workingDirectories: live.workingDirectories ?? (live.workingDirectory ? [live.workingDirectory] : undefined),
				...(live.model ? { model: live.model } : {}),
			};
		}
		// Session listing is ambient. The host-owned registry supplies a stable
		// fallback row that this lazy provider explicitly accepts until the user
		// opens this Codex session; only then may the app-server be asked for
		// authoritative thread metadata.
		if (!this._activated) {
			return options?.registryFallback ? { chat, ...options.registryFallback } : undefined;
		}
		const backingUri = backing ? AgentSession.uri(this.id, backing.sessionId) : session;
		const read = await this._readSession(backingUri, false);
		if (!read) {
			return undefined;
		}
		// Register the session in our map so subsequent sendMessage triggers
		// thread/resume (Decision 8). The threadId came from the metadata
		// overlay or from `thread/list` (when the session was materialized
		// in a prior process); `_readSession` returns the resolved id.
		const metadata = this._withWorkingDirectories(
			await this._threadToMetadata(read.thread, chat, read.rolloutMetadata),
			read.persistedWorkingDirectories,
		);
		if (!this._sessions.has(sessionId)) {
			const workingDirectory = read.thread.cwd ? URI.file(read.thread.cwd) : undefined;
			const threadId = read.thread.id;
			const overlay = await this._metadataStore.read(backingUri);
			const restoredModel = metadata.model ?? (read.persistedModelId ? { id: read.persistedModelId } : undefined);
			const materializedModelProvider = read.rolloutMetadata?.selectedModel?.modelProvider
				?? read.rolloutMetadata?.originModelProvider
				?? read.thread.modelProvider;
			const restored = this._createResumedSessionEntry(sessionId, threadId, workingDirectory, restoredModel, undefined, metadata.workingDirectories, undefined, overlay.agent, materializedModelProvider);
			// Adopt the backing thread's own timestamps so a later live lookup
			// reports when the conversation actually started, not when this
			// process happened to re-attach to it. A thread that reports none
			// keeps the construction time rather than falling back to 1970.
			restored.startTime = metadata.startTime || restored.startTime;
			restored.modifiedTime = metadata.modifiedTime || restored.modifiedTime;
			restored.summary = metadata.summary;
			// Require our own recorded explicit path to positively corroborate
			// the app-server's ground-truth cwd before adopting it as managed:
			// `read.thread.cwd` is authoritative for "what is this thread's
			// cwd" but not for "did we create it", and a stale
			// `ownsManagedWorkingDirectory` flag alone must never resurrect a
			// real user folder as something a later reclaim may delete.
			if (overlay.managedWorkingDirectory && workingDirectory && isEqual(overlay.managedWorkingDirectory, workingDirectory)) {
				restored.managedWorkingDirectory = workingDirectory;
			}
			this._sessions.set(sessionId, restored);
			this._routeRestoredThreadToSession(threadId, sessionId);
			if (restoredModel && parseCodexModelSelection(restoredModel).modelProvider !== materializedModelProvider) {
				this._pendingMcpStartupStatuses.delete(threadId);
				await this._resetSessionForModelProviderChange(restored, parseCodexModelSelection(restoredModel).modelProvider);
			} else {
				this._flushPendingMcpStartupStatuses(threadId);
				this._applyMcpInventoryToSession(restored);
			}
			// Compatible restored threads skip materialization because the thread
			// already exists. Incompatible ones rematerialize on the next send.
			// Either way, advertise server tools now for client-side parity —
			// on the session the host addressed, which is the only URI it knows.
			this._advertiseServerTools(restored, session);
		}
		return metadata;
	}

	private _readSession(session: URI, includeTurns = true): Promise<ICodexSessionRead | undefined> {
		const readFromCurrentConnection = async (): Promise<ICodexSessionRead | undefined> => {
			while (!this._store.isDisposed) {
				try {
					return await this._doReadSession(session, includeTurns);
				} catch (error) {
					if (!(error instanceof CodexConnectionReplacedError)) {
						throw error;
					}
				}
			}
			return undefined;
		};
		return this._sessions.has(AgentSession.id(session))
			? readFromCurrentConnection()
			: this._coldSessionReadLimiter.queue(readFromCurrentConnection);
	}

	private async _doReadSession(session: URI, includeTurns: boolean): Promise<ICodexSessionRead | undefined> {
		// Resolve the codex thread id for this session URI. Resolution
		// order: in-memory session → persisted metadata overlay → URI host.
		// The final `?? sessionId` is a LEGACY-COMPAT shim, not an active I3
		// invariant: fresh sessions always decouple sessionId from the
		// app-server-assigned threadId (recorded in the overlay by
		// `_persistMaterializedSession`), so this fallback only fires for
		// pre-existing sessions enumerated as `codex:/<threadId>`, where the
		// thread id genuinely IS the session's persisted identity. Removing it
		// would require migrating those sessions (disallowed), so it stays.
		const sessionId = AgentSession.id(session);
		const existing = this._sessions.get(sessionId);
		let threadId = existing?.threadId;
		let persistedWorkingDirectories = existing?.workingDirectories;
		let persistedModelId = existing?.model?.id;
		if (threadId === undefined) {
			const overlay = await this._metadataStore.read(session);
			threadId = overlay.threadId ?? sessionId;
			persistedWorkingDirectories = overlay.workingDirectories;
			persistedModelId = overlay.modelId;
		}
		const conn = existing?.threadId
			? (await this._ensureThreadConnection(existing)).connection
			: await this._ensureConnection();
		const readThread = async (candidateThreadId: string): Promise<ICodexSessionRead> => {
			const response = await conn.client.request<'thread/read', ThreadReadResponse>('thread/read', {
				threadId: candidateThreadId,
				includeTurns: false,
			});
			this._assertCurrentConnection(conn);
			let thread = response.thread;
			if (includeTurns && thread.historyMode === 'paginated') {
				const turns: Thread['turns'] = [];
				const seenCursors = new Set<string>();
				let cursor: string | null = null;
				do {
					const page: ThreadTurnsListResponse = await conn.client.request<'thread/turns/list', ThreadTurnsListResponse>('thread/turns/list', {
						threadId: candidateThreadId,
						cursor,
						limit: CODEX_THREAD_TURNS_PAGE_SIZE,
						sortDirection: 'asc',
						itemsView: 'full',
					});
					this._assertCurrentConnection(conn);
					turns.push(...page.data);
					if (page.nextCursor !== null && seenCursors.has(page.nextCursor)) {
						throw new Error(`thread/turns/list returned a repeated cursor for thread ${candidateThreadId}`);
					}
					if (page.nextCursor !== null) {
						seenCursors.add(page.nextCursor);
					}
					cursor = page.nextCursor;
				} while (cursor !== null);
				thread = { ...thread, turns };
			} else if (includeTurns) {
				const historyResponse = await conn.client.request<'thread/read', ThreadReadResponse>('thread/read', {
					threadId: candidateThreadId,
					includeTurns: true,
				});
				this._assertCurrentConnection(conn);
				thread = historyResponse.thread;
			}
			const rolloutMetadata = await this._readCodexRolloutMetadata(thread);
			this._assertCurrentConnection(conn);
			return { ...response, thread, persistedWorkingDirectories, persistedModelId, rolloutMetadata };
		};
		try {
			if (!existing && threadId !== sessionId) {
				try {
					const original = await readThread(sessionId);
					if (original.rolloutMetadata?.isDesktop) {
						const originalModel = toRolloutModelSelection(original.rolloutMetadata.selectedModel);
						await this._metadataStore.write(session, {
							threadId: original.thread.id,
							cwd: original.thread.cwd ? URI.file(original.thread.cwd) : undefined,
							modelId: originalModel?.id,
						});
						return {
							...original,
							persistedWorkingDirectories: undefined,
							persistedModelId: originalModel?.id,
						};
					}
				} catch (error) {
					if (error instanceof CodexConnectionReplacedError) {
						throw error;
					}
					// The session URI is not itself a persisted Codex Desktop thread.
				}
			}
			const read = await readThread(threadId);
			if (read.rolloutMetadata?.isDesktop) {
				const originalModel = toRolloutModelSelection(read.rolloutMetadata.selectedModel);
				await this._metadataStore.write(session, {
					threadId: read.thread.id,
					cwd: read.thread.cwd ? URI.file(read.thread.cwd) : undefined,
					modelId: originalModel?.id,
				});
				return {
					...read,
					persistedWorkingDirectories: undefined,
					persistedModelId: originalModel?.id,
				};
			}
			return read;
		} catch (err) {
			if (err instanceof CodexConnectionReplacedError) {
				throw err;
			}
			const message = err instanceof Error ? err.message : String(err);
			// `thread not loaded` is app-server's expected response for any
			// thread we have not yet resumed in this process; sendMessage's
			// `thread/resume` path will handle it. Log at info level.
			if (/thread not loaded/i.test(message)) {
				this._logService.info(`[Codex:${threadId}] thread/read: not loaded yet (will resume on first send)`);
			} else {
				this._logService.warn(`[Codex:${threadId}] thread/read failed: ${message}`);
			}
			return undefined;
		}
	}

	private async _listCodexChats(): Promise<IAgentChatMetadata[] | undefined> {
		// Provider-native threads are continuously discovered into the
		// orchestrator-owned registry. Threads with no live in-memory session are
		// mapped to `codex:/<threadId>` below.
		try {
			const conn = await this._ensureConnection();
			const threads = await collectThreadListPages<Thread>(
				request => conn.client.request<'thread/list', ThreadListResponse>('thread/list', request),
				collected => this._logService.warn(`[Codex] thread/list hit the ${THREAD_LIST_MAX_PAGES}-page cap after ${collected} threads; some sessions may be missing`),
			);
			if (!this._isCurrentConnection(conn)) {
				return undefined;
			}
			// Map persisted threads back to the URI the workbench already
			// knows them by. After `_materializeIfNeeded` runs, the codex
			// thread is persisted to disk under its thread id but the
			// workbench/state-manager keyed the session by its provisional
			// URI (`codex:/<provisional-uuid>`). If we returned a fresh
			// `codex:/<threadId>` URI here, the registry would treat the
			// provisional URI as missing and evict the live session the user
			// is actively viewing.
			const liveUriByThreadId = new Map<string, URI>();
			for (const s of this._sessions.values()) {
				if (s.threadId !== undefined) {
					liveUriByThreadId.set(s.threadId, s.sessionUri);
				}
			}
			const metadata = await Promise.all(threads.map(async thread => {
				const sessionUri = liveUriByThreadId.get(thread.id) ?? AgentSession.uri(this.id, thread.id);
				const liveWorkingDirectories = this._sessions.get(AgentSession.id(sessionUri))?.workingDirectories;
				const isDesktop = thread.modelProvider === CODEX_OPENAI_MODEL_PROVIDER
					? (await this._desktopRolloutPrefixLimiter.queue(() => this._readCodexDesktopRolloutPrefix(thread))) !== null
					: this._desktopThreadIds.has(thread.id);
				const chat = URI.parse(buildDefaultChatUri(sessionUri));
				return this._withWorkingDirectories(await this._threadToMetadata(thread, chat, undefined, isDesktop), liveWorkingDirectories);
			}));
			return this._isCurrentConnection(conn) ? metadata : undefined;
		} catch (err) {
			// Discovery runs independently for every provider; a rejection here
			// should not take a sibling provider's discovery
			// down with it. `undefined` signals "can't enumerate yet" so the
			// orchestrator retries later instead of treating this as an
			// authoritative empty result.
			this._logService.warn(`[Codex] thread/list failed: ${err instanceof Error ? err.message : String(err)}`);
			return undefined;
		}
	}

	async listChatsToMigrate(): Promise<AgentChatMigrationResult> {
		// Registration-time migration is ambient. Defer until explicit Codex use
		// rather than claiming an authoritative empty catalog without enumerating.
		if (!this._activated) {
			return AgentChatMigrationDeferred;
		}
		if (!(await this._isSdkResolvableWithoutDownload())) {
			this._logService.info('[Codex] SDK not downloaded yet; deferring the migratable chat list');
			return AgentChatMigrationDeferred;
		}
		const chats = await this._listCodexChats();
		if (!chats) {
			return undefined;
		}
		const limiter = new Limiter<IAgentChatMetadata | undefined>(4);
		const known = await Promise.all(chats.map(chat => limiter.queue(async () => {
			return await this._isKnownCodexChat(chat) ? chat : undefined;
		})));
		return known.filter((chat): chat is IAgentChatMetadata => chat !== undefined);
	}

	startChatDiscovery(): Promise<void> {
		this._chatDiscoveryRequested = true;
		return this._startCodexChatDiscovery();
	}

	private _startCodexChatDiscovery(): Promise<void> {
		if (this._isShuttingDown || this._store.isDisposed || !this._activated) {
			return Promise.resolve();
		}
		if (!this._codexChatDiscovery) {
			this._codexChatDiscovery = retry(async () => {
				if (this._isShuttingDown || this._store.isDisposed) {
					return;
				}
				// Waits for the SDK rather than pulling it down — see
				// {@link listChatsToMigrate}. Returning leaves the retry loop happy,
				// since no amount of retrying will make the user press Download.
				if (!(await this._isSdkResolvableWithoutDownload())) {
					this._logService.info('[Codex] SDK not downloaded yet; deferring chat discovery');
					return;
				}
				if (this._isShuttingDown || this._store.isDisposed) {
					return;
				}
				if (!(await this._emitCodexChats())) {
					throw new Error('Codex chat catalog is not available');
				}
			}, 5000, 3)
				.catch(err => this._logService.warn(`[Codex] Chat discovery failed: ${err instanceof Error ? err.message : String(err)}`));
		}
		return this._codexChatDiscovery;
	}

	/** Runs discovery again for whoever is still subscribed, after it deferred for want of an SDK. */
	private _restartChatDiscovery(): void {
		if (this._isShuttingDown || this._store.isDisposed) {
			return;
		}
		if (this._codexChatDiscovery) {
			this._codexChatDiscovery = undefined;
			void this._startCodexChatDiscovery();
		}
	}

	private async _emitCodexChats(): Promise<boolean> {
		try {
			const chats = await this._listCodexChats();
			if (chats && !this._isShuttingDown && !this._store.isDisposed) {
				const limiter = new Limiter<IAgentDiscoveredChat>(4);
				const discovered = await Promise.all(chats.map(chat => limiter.queue(async () => {
					return { ...chat, external: !(await this._isKnownCodexChat(chat)) };
				})));
				if (this._isShuttingDown || this._store.isDisposed) {
					return true;
				}
				this._onDidDiscoverChats.fire(discovered);
				return true;
			}
		} catch (err) {
			this._logService.warn(`[Codex] Failed to emit discovered chats: ${err instanceof Error ? err.message : String(err)}`);
		}
		return false;
	}

	private async _isKnownCodexChat(chat: IAgentChatMetadata): Promise<boolean> {
		try {
			const session = URI.parse(parseRequiredSessionUriFromChatUri(chat.chat));
			return await this._metadataStore.hasKnownSession(session);
		} catch (err) {
			this._logService.warn(`[Codex] Failed to inspect stored metadata for ${chat.chat.toString()}: ${err instanceof Error ? err.message : String(err)}`);
			return false;
		}
	}

	private async _threadToMetadata(thread: Thread, chat: URI, rolloutMetadata?: ICodexRolloutMetadata, isDesktopHint?: boolean): Promise<IAgentChatMetadata> {
		const generatedWorkspace = isCodexDesktopGeneratedWorkspace(thread.cwd, this._environmentService.userHome);
		let isDesktop = rolloutMetadata?.isDesktop ?? isDesktopHint;
		if (generatedWorkspace && isDesktop === undefined) {
			isDesktop = (await this._desktopRolloutPrefixLimiter.queue(() => this._readCodexDesktopRolloutPrefix(thread))) !== null;
		}
		const model = toRolloutModelSelection(rolloutMetadata?.selectedModel);
		return {
			chat,
			// Codex returns Unix seconds; the agent host expects ms.
			startTime: (thread.createdAt ?? 0) * 1000,
			modifiedTime: (thread.updatedAt ?? thread.createdAt ?? 0) * 1000,
			summary: codexDelegationDisplayText(thread.name) ?? codexDelegationDisplayText(thread.preview),
			workingDirectories: thread.cwd ? [URI.file(thread.cwd)] : undefined,
			...(model ? { model } : {}),
			...(generatedWorkspace && isDesktop ? { _meta: withSessionWorkspaceless(undefined, true) } : {}),
		};
	}

	private async _readCodexRolloutMetadata(thread: Thread): Promise<ICodexRolloutMetadata | undefined> {
		if (thread.source !== 'vscode' || !thread.path) {
			return undefined;
		}
		try {
			const metadata = await readCodexRolloutMetadata(this._fileService, thread.path);
			if (metadata.isDesktop) {
				this._desktopThreadIds.add(thread.id);
			}
			return metadata;
		} catch (error) {
			this._logService.warn(`[Codex] Failed to read desktop rollout metadata for ${thread.id}: result=${toFileOperationResult(error)}`);
			return undefined;
		}
	}

	private async _readCodexDesktopRolloutPrefix(thread: Thread): Promise<string | null> {
		if (thread.source !== 'vscode' || !thread.path) {
			return null;
		}

		try {
			const prefix = await this._fileService.readFile(URI.file(thread.path), { length: CODEX_DESKTOP_ROLLOUT_PREFIX_LENGTH });
			const value = prefix.value.toString();
			if (!CODEX_DESKTOP_SESSION_META_PATTERN.test(value)) {
				return null;
			}
			this._desktopThreadIds.add(thread.id);
			return value;
		} catch (error) {
			this._logService.warn(`[Codex] Failed to inspect desktop session metadata for ${thread.id}: result=${toFileOperationResult(error)}`);
			return null;
		}
	}

	private _withWorkingDirectories(metadata: IAgentChatMetadata, storedWorkingDirectories: readonly URI[] | undefined): IAgentChatMetadata {
		const primary = metadata.workingDirectories?.[0];
		if (!primary || !storedWorkingDirectories || storedWorkingDirectories.length <= 1) {
			return metadata;
		}
		const workingDirectories = distinctWorkingDirectories([
			primary,
			...storedWorkingDirectories.slice(1),
		]);
		return workingDirectories && workingDirectories.length > 1
			? { ...metadata, workingDirectories }
			: metadata;
	}

	setServerToolHost(host: IAgentServerToolHost): void {
		this._serverToolHost = host;
	}

	private _advertiseServerTools(session: ICodexSession, configurationResource: URI): void {
		const resource = configurationResource.toString();
		if (!this._serverToolHost || session.serverToolsAdvertisement === resource) {
			return;
		}
		this._serverToolHost.advertise(resource);
		session.serverToolsAdvertisement = resource;
	}

	/**
	 * `chat` is the one exact chat this handle contributes to — no fan-out to
	 * chat-array membership or sibling inference; Agent Host calls this once
	 * per addressed chat. `context` only resolves the chat's backing runtime
	 * when it has no live binding yet, mirroring
	 * {@link _resolveConversationSession}. `hostCustomizations` is unused:
	 * Codex reconciles pushed plugin customizations via
	 * {@link _syncClientCustomizations}.
	 */
	getOrCreateActiveClient(chat: URI, context: URI | IAgentChatContext, client: { readonly clientId: string; readonly displayName?: string }, _hostCustomizations?: readonly Customization[]): CodexActiveClientHandle {
		const key = `${chat.toString()}\u0000${client.clientId}`;
		const existing = this._activeClientHandles.get(key);
		if (existing) {
			return existing;
		}
		const resolveSession = (): ICodexSession | undefined => {
			const runtimeUri = this._resolveConversationSession(chat, context);
			return runtimeUri ? this._sessions.get(AgentSession.id(runtimeUri)) : undefined;
		};
		const handle = new CodexActiveClientHandle(
			resolveSession,
			client.clientId,
			client.displayName,
			tools => this._logService.info(`[Codex] active client ${client.clientId} tools=[${tools.map(t => t.name).join(', ') || '(none)'}] chat=${chat.toString()}`),
			(session, customizations, isCurrent) => {
				void this._syncClientCustomizations(session.sessionUri, client.clientId, [...customizations], { quiet: false, isCurrent })
					.catch(err => this._logService.error(`[Codex] failed to sync customizations for client ${client.clientId}: ${err instanceof Error ? err.message : String(err)}`));
			},
			(session, customizations) => {
				void this._removeClientCustomizations(session, client.clientId, customizations)
					.catch(err => this._logService.error(`[Codex] failed to remove customizations for client ${client.clientId}: ${err instanceof Error ? err.message : String(err)}`));
			},
		);
		this._activeClientHandles.set(key, handle);
		return handle;
	}

	removeActiveClient(chat: URI, _context: URI | IAgentChatContext, clientId: string): void {
		const key = `${chat.toString()}\u0000${clientId}`;
		const handle = this._activeClientHandles.get(key);
		this._activeClientHandles.delete(key);
		if (!handle) {
			return;
		}
		handle.remove();
	}

	onClientToolCallComplete(chat: URI, toolCallId: string, result: ToolCallResult, context?: IAgentChatContext): void {
		const runtime = this._resolveConversationSession(chat, context);
		const sess = runtime ? this._sessions.get(AgentSession.id(runtime)) : undefined;
		// `AgentSideEffects` forwards every `ChatToolCallComplete` envelope
		// (including codex-owned tools like shell); a miss is the expected path.
		sess?.pendingClientToolCalls.respondOrBuffer(toolCallId, result);
	}

	// ---- Client-pushed plugin customizations -------------------------------

	/**
	 * Materialize + parse a client's pushed plugin customizations and store
	 * them on the session. Mirrors the Claude client-plugin path: the shared
	 * {@link IAgentPluginManager} copies each plugin to local disk (nonce
	 * cached), we parse the resulting directory into its
	 * {@link IParsedPlugin | components}, publish the customization surface,
	 * and refresh the process-global skill roots. MCP servers are attached
	 * per-thread at the next {@link _materialize}.
	 */
	private async _syncClientCustomizations(sessionUri: URI, clientId: string, customizations: readonly ClientPluginCustomization[], options?: { readonly quiet?: boolean; readonly isCurrent?: () => boolean }): Promise<void> {
		const session = this._sessions.get(AgentSession.id(sessionUri));
		if (!session) {
			return;
		}
		await this._customizationEnablementService.initializeSession(session.configurationResource.toString());
		const synced = await this._pluginManager.syncCustomizations(
			clientId,
			[...customizations],
			status => {
				if (!options?.quiet && options?.isCurrent?.() !== false) {
					this._fire(session.configurationResource, { type: ActionType.SessionCustomizationUpdated, customization: status });
				}
			},
		);
		if (session.disposed || options?.isCurrent?.() === false) {
			return;
		}
		const inputs = new Map(customizations.map(customization => [customization.uri, customization]));
		const plugins = await Promise.all(synced.map(item => this._parseClientPlugin(session, item, inputs.get(item.customization.uri))));
		if (session.disposed || options?.isCurrent?.() === false) {
			return;
		}
		const previousIds = session.clientCustomizations.toCustomizations().map(customization => customization.id);
		session.clientCustomizations.setClient(clientId, plugins);
		if (!options?.quiet) {
			this._reconcilePublishedClientCustomizations(session.configurationResource, new Set([
				...previousIds,
				...session.clientCustomizations.toCustomizations().map(customization => customization.id),
			]));
		}
		await this._refreshSkillExtraRoots();
		await this._reconcileMaterializedCustomizations(session);
	}

	private async _removeClientCustomizations(session: ICodexSession, clientId: string, inputs: readonly ClientPluginCustomization[]): Promise<void> {
		const storedIds = session.clientCustomizations.toCustomizations().map(customization => customization.id);
		const removed = session.clientCustomizations.removeClient(clientId);
		const previousIds = new Set([
			...(removed ? storedIds : []),
			...inputs.map(customization => customization.id),
		]);
		this._reconcilePublishedClientCustomizations(session.configurationResource, previousIds);
		if (!removed) {
			return;
		}
		await this._refreshSkillExtraRoots();
		await this._reconcileMaterializedCustomizations(session);
	}

	private _reconcileMaterializedCustomizations(session: ICodexSession): Promise<void> {
		let sequencer = this._customizationReconcileSequencers.get(session);
		if (!sequencer) {
			sequencer = new Sequencer();
			this._customizationReconcileSequencers.set(session, sequencer);
		}
		return sequencer.queue(() => this._doReconcileMaterializedCustomizations(session));
	}

	private _queueDirectoryCustomizationOperation<T>(session: ICodexSession, operation: () => Promise<T>): Promise<T> {
		let sequencer = this._directoryCustomizationSequencers.get(session);
		if (!sequencer) {
			sequencer = new Sequencer();
			this._directoryCustomizationSequencers.set(session, sequencer);
		}
		return sequencer.queue(operation);
	}

	private async _doReconcileMaterializedCustomizations(session: ICodexSession): Promise<void> {
		if (session.disposed) {
			return;
		}
		if (session.threadId === undefined) {
			return;
		}
		const launch = await this._buildCustomizationLaunch(session);
		const mcpSignature = mcpServersSignature(this._buildSessionMcpServers(session));
		if (launch.signature === session.materializedCustomizationsSig && mcpSignature === session.materializedMcpSig) {
			return;
		}
		if (!session.firstTurnSent) {
			await this._restartThreadWithCurrentTools(session);
			this._persistMaterializedSession(session);
		} else {
			this._markSessionForReload(session);
		}
	}

	/** Parse one synced plugin directory into its components (best-effort). */
	private async _parseClientPlugin(session: ICodexSession, synced: ISyncedCustomization, input: ClientPluginCustomization | undefined): Promise<ICodexClientPlugin> {
		if (!synced.pluginDir) {
			return { synced, parsed: undefined, input };
		}
		try {
			const parsed = await parsePlugin(synced.pluginDir, this._fileService, session.workingDirectory, this._environmentService.userHome, synced.pluginDir);
			const candidate = { ...synced.customization, children: parsedPluginChildren(parsed) };
			const clientPlugins = input ? new Map([[input.uri, input]]) : undefined;
			const resolution = resolveCustomizationEnablement(this._customizationEnablementService, session.configurationResource, [candidate], input?.childEnablement ? new Map([[input.uri, input.childEnablement]]) : undefined, clientPlugins);
			const resolved = resolution.customizations[0];
			return {
				synced,
				parsed,
				input,
				customization: resolved.type === CustomizationType.Plugin ? resolved : candidate,
			};
		} catch (err) {
			this._logService.warn(`[Codex] failed to parse client plugin ${synced.customization.uri}: ${err instanceof Error ? err.message : String(err)}`);
			return { synced, parsed: undefined, input };
		}
	}

	/** Publish the session's client-plugin customizations as upsert actions. */
	private _publishClientCustomizationsForConfiguration(configurationResource: URI): void {
		for (const customization of this._resolvedClientCustomizationsForConfiguration(configurationResource)) {
			this._fire(configurationResource, { type: ActionType.SessionCustomizationUpdated, customization });
		}
	}

	private _reconcilePublishedClientCustomizations(configurationResource: URI, affectedIds: ReadonlySet<string>): void {
		const survivingCustomizations = this._resolvedClientCustomizationsForConfiguration(configurationResource);
		const currentIds = new Set(survivingCustomizations.map(customization => customization.id));
		for (const id of affectedIds) {
			if (!currentIds.has(id)) {
				this._fire(configurationResource, { type: ActionType.SessionCustomizationRemoved, id });
			}
		}
		for (const customization of survivingCustomizations) {
			if (affectedIds.has(customization.id)) {
				this._fire(configurationResource, { type: ActionType.SessionCustomizationUpdated, customization });
			}
		}
	}

	private _resolvedClientCustomizationsForConfiguration(configurationResource: URI): PluginCustomization[] {
		const sessions = [...this._sessions.values()]
			.filter(session => !session.disposed && isEqual(session.configurationResource, configurationResource))
			.sort((a, b) => {
				const owningRuntimeOrder = Number(!isEqual(a.sessionUri, configurationResource)) - Number(!isEqual(b.sessionUri, configurationResource));
				return owningRuntimeOrder || a.sessionId.localeCompare(b.sessionId);
			});
		const byId = new Map<string, PluginCustomization>();
		for (const session of sessions) {
			for (const customization of this._resolveClientCustomizationEnablement(session).resolution.customizations) {
				if (customization.type === CustomizationType.Plugin && !byId.has(customization.id)) {
					byId.set(customization.id, customization);
				}
			}
		}
		return [...byId.values()];
	}

	private _queueSkillHookCustomizationRefresh(client: ICodexAppServerClient): void {
		if (this._connection.kind !== 'ready' || this._connection.client !== client) {
			return;
		}
		// One extra-roots update can produce several catalog notifications. Coalesce
		// them before issuing the cwd-scoped skills/list and hooks/list requests.
		this._skillHookCustomizationRefresh.value = disposableTimeout(() => {
			if (this._connection.kind !== 'ready' || this._connection.client !== client) {
				return;
			}
			for (const session of this._sessions.values()) {
				// Only threads loaded into this app-server have a live catalog to
				// refresh. Cold restored sessions refresh when they are resumed.
				if (!session.disposed && session.threadId !== undefined && !session.needsResume) {
					void this._refreshSkillHookCustomizations(session);
				}
			}
		}, 100);
	}

	/**
	 * Recompute the process-global skill roots from every live session's
	 * enabled client plugins and push them to codex via `skills/extraRoots/set`.
	 * codex's extra skill roots are a single shared list (there is no per-thread
	 * equivalent), so we send the union across all sessions — which matches the
	 * global nature of client plugin choices. No-op when the connection is not
	 * ready; the next {@link _materialize} re-applies.
	 */
	private async _refreshSkillExtraRoots(): Promise<void> {
		return this._skillExtraRootsSequencer.queue(async () => {
			if (this._connection.kind !== 'ready') {
				return;
			}
			await this._applySkillExtraRoots(this._connection.client);
		});
	}

	private _queueSkillExtraRootsForClient(client: ICodexAppServerClient): Promise<void> {
		return this._skillExtraRootsSequencer.queue(() => this._applySkillExtraRoots(client));
	}

	private async _applySkillExtraRoots(client: ICodexAppServerClient): Promise<void> {
		const plugins: ICodexClientPlugin[] = [];
		for (const session of this._sessions.values()) {
			if (!session.disposed) {
				plugins.push(...this._enabledClientPlugins(session));
			}
		}
		const roots = codexSkillRootsFromPlugins(plugins);
		try {
			await client.request<'skills/extraRoots/set'>('skills/extraRoots/set', { extraRoots: roots });
			if (roots.length > 0) {
				this._logService.info(`[Codex] applied ${roots.length} client-plugin skill root(s)`);
			}
		} catch (err) {
			this._logService.warn(`[Codex] skills/extraRoots/set failed: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	// ---- MCP servers -------------------------------------------------------

	/**
	 * Surfaces codex's MCP servers to AHP clients as per-session
	 * customizations. Codex has no plugin/directory customization layer, so
	 * every server is a bare top-level {@link McpServerCustomization}. The
	 * returned snapshot reflects the current connection-global inventory;
	 * subsequent lifecycle transitions arrive as customization actions
	 * emitted by the session's {@link McpCustomizationController}.
	 * `hostCustomizations` is unused: codex reconciles a client's pushed
	 * plugin customizations directly (see {@link _syncClientCustomizations}),
	 * so the host's copy carries nothing this method needs.
	 */
	async getChatCustomizations(chat: URI, context: URI | IAgentChatContext, _hostCustomizations?: readonly Customization[]): Promise<readonly Customization[]> {
		const sessionUri = this._resolveConversationSession(chat, context);
		if (!sessionUri) {
			return [];
		}
		const session = this._sessions.get(AgentSession.id(sessionUri));
		if (!session) {
			return [];
		}
		return this._queueDirectoryCustomizationOperation(session, async () => {
			if (session.disposed) {
				return [];
			}
			const catalogConnection = this._connection.kind === 'ready' ? this._connection : undefined;
			const controller = this._getOrCreateMcpController(session);
			if (controller) {
				controller.applyAll(inventoryToSdkServers(this._mcpInventory.forThread(session.threadId)));
				this._refreshMcpCustomizationIds(session, controller);
			}
			const [workspaceAgents, workspaceInstructions, workspaceSkills, nativeSkillHookContainers] = await Promise.all([
				discoverCodexWorkspaceAgents(this._workingDirectories(session), this._fileService),
				discoverCodexWorkspaceInstructions(this._workingDirectories(session), this._fileService),
				discoverCodexWorkspaceSkills(this._workingDirectories(session), this._fileService),
				this._fetchSkillHookContainers(session),
			]);
			if (session.disposed || (catalogConnection !== undefined && !this._isCurrentConnection(catalogConnection))) {
				return [];
			}
			const skillHookContainers = excludeCodexWorkspaceSkillDuplicates(nativeSkillHookContainers, workspaceSkills);
			const directoryCustomizations = [...workspaceAgents.containers, ...workspaceInstructions, ...workspaceSkills, ...skillHookContainers];
			session.publishedDirectoryCustomizationIds.clear();
			for (const customization of directoryCustomizations) {
				session.publishedDirectoryCustomizationIds.add(customization.id);
			}
			// Workspace custom agents come from the Agent Host's session-scoped
			// scan. Client-pushed customizations remain for plugins/extensions, then
			// codex's own MCP, skill, and hook catalogs complete the surface.
			return [
				...workspaceAgents.containers,
				...workspaceInstructions,
				...workspaceSkills,
				...this._resolveClientCustomizationEnablement(session).resolution.customizations,
				...(controller?.topLevelCustomizations() ?? []),
				...skillHookContainers,
			];
		});
	}

	/**
	 * Fetches the skills and hooks codex has loaded for `session`'s working
	 * directory (`skills/list` + `hooks/list`, both cwd-scoped) and projects
	 * them into {@link DirectoryCustomization} containers. Best-effort: returns
	 * an empty array when no connection is ready, no working directory is known,
	 * or the app-server rejects the request.
	 */
	private async _fetchSkillHookContainers(session: ICodexSession): Promise<DirectoryCustomization[]> {
		if (this._connection.kind !== 'ready' || !session.workingDirectory) {
			return [];
		}
		const cwd = session.workingDirectory.fsPath;
		const client = this._connection.client;
		const [skills, hooks] = await Promise.all([
			client.request<'skills/list', SkillsListResponse>('skills/list', { cwds: [cwd] })
				.catch(err => { this._logService.warn(`[Codex] skills/list failed: ${err instanceof Error ? err.message : String(err)}`); return undefined; }),
			client.request<'hooks/list', HooksListResponse>('hooks/list', { cwds: [cwd] })
				.catch(err => { this._logService.warn(`[Codex] hooks/list failed: ${err instanceof Error ? err.message : String(err)}`); return undefined; }),
		]);
		return [...codexSkillsToContainers(skills), ...codexHooksToContainers(hooks)];
	}

	/**
	 * Re-fetches this session's workspace agent, skill, and hook customizations and upserts each
	 * container into session state via {@link ActionType.SessionCustomizationUpdated}.
	 * Called after materialization (when the connection is ready and the cwd is
	 * known) so the workbench Customizations surface reflects workspace agents
	 * and what codex loaded from the working directory's `.agents`/`.codex`
	 * folders. Upserts (keyed by customization id) leave MCP customizations
	 * untouched.
	 */
	private async _refreshSkillHookCustomizations(session: ICodexSession): Promise<void> {
		return this._queueDirectoryCustomizationOperation(session, () => this._doRefreshSkillHookCustomizations(session));
	}

	private async _doRefreshSkillHookCustomizations(session: ICodexSession): Promise<void> {
		if (session.disposed) {
			return;
		}
		const catalogConnection = this._connection.kind === 'ready' ? this._connection : undefined;
		const [workspaceAgents, workspaceInstructions, workspaceSkills, nativeSkillHookContainers] = await Promise.all([
			discoverCodexWorkspaceAgents(this._workingDirectories(session), this._fileService),
			discoverCodexWorkspaceInstructions(this._workingDirectories(session), this._fileService),
			discoverCodexWorkspaceSkills(this._workingDirectories(session), this._fileService),
			this._fetchSkillHookContainers(session),
		]);
		if (session.disposed || (catalogConnection !== undefined && !this._isCurrentConnection(catalogConnection))) {
			return;
		}
		const skillHookContainers = excludeCodexWorkspaceSkillDuplicates(nativeSkillHookContainers, workspaceSkills);
		const containers = [...workspaceAgents.containers, ...workspaceInstructions, ...workspaceSkills, ...skillHookContainers];
		const nextIds = new Set(containers.map(container => container.id));
		for (const id of session.publishedDirectoryCustomizationIds) {
			if (!nextIds.has(id)) {
				this._fire(session.configurationResource, { type: ActionType.SessionCustomizationRemoved, id });
			}
		}
		for (const container of containers) {
			this._fire(session.configurationResource, { type: ActionType.SessionCustomizationUpdated, customization: container });
		}
		session.publishedDirectoryCustomizationIds.clear();
		for (const id of nextIds) {
			session.publishedDirectoryCustomizationIds.add(id);
		}
	}

	/**
	 * Routes an MCP request received on this session's `mcp://` side channel
	 * to codex. Read-only methods (`tools/list`, `resources/list`,
	 * `resources/templates/list`) are answered from the cached inventory;
	 * `tools/call` and `resources/read` round-trip to the app-server with the
	 * session's thread id. Unknown servers / methods reject with
	 * `Method not found` so the protocol server maps them to JSON-RPC
	 * `-32601`.
	 */
	async handleMcpRequest(chat: URI, serverName: string, method: string, params: Record<string, unknown> | undefined): Promise<unknown> {
		const sessionId = this._sessionIdByChatUri.get(chat.toString());
		if (!sessionId) {
			throw new Error(`Method not found: no active chat ${chat.toString()}`);
		}
		const session = this._sessions.get(sessionId);
		if (!session || !session.chatChannel || !isEqual(session.chatChannel, chat)) {
			throw new Error(`Method not found: no active chat ${chat.toString()}`);
		}
		const entry = this._mcpInventory.forThread(session.threadId).get(serverName);
		if (!entry) {
			throw new Error(`Method not found: unknown MCP server '${serverName}'`);
		}
		const read = buildCodexMcpReadResult(method, entry);
		if (read.handled) {
			return read.result;
		}
		switch (method) {
			case 'tools/call': {
				const tool = params && typeof params['name'] === 'string' ? params['name'] : undefined;
				if (!tool) {
					throw new Error(`tools/call missing 'name' parameter`);
				}
				const { threadId, connection: conn } = await this._ensureMaterializedThreadConnection(session);
				return conn.client.request<'mcpServer/tool/call', McpServerToolCallResponse>('mcpServer/tool/call', {
					threadId,
					server: serverName,
					tool,
					arguments: (params ? params['arguments'] : undefined) as JsonValue,
				});
			}
			case 'resources/read': {
				const uri = params && typeof params['uri'] === 'string' ? params['uri'] : undefined;
				if (!uri) {
					throw new Error(`resources/read missing 'uri' parameter`);
				}
				const { threadId, connection: conn } = await this._ensureMaterializedThreadConnection(session);
				return conn.client.request<'mcpServer/resource/read', McpResourceReadResponse>('mcpServer/resource/read', {
					threadId,
					server: serverName,
					uri,
				});
			}
			default:
				throw new Error(`Method not found: ${method}`);
		}
	}

	async startMcpServer(sessionUri: URI, id: string): Promise<void> {
		const session = this._sessionForMcpControl(sessionUri);
		const serverName = session ? this._resolveMcpServerName(session, id) : undefined;
		if (!session || !serverName) {
			this._logService.warn(`[Codex] Cannot start unknown MCP server customization ${id}`);
			return;
		}
		const { threadId, connection: conn } = await this._ensureMaterializedThreadConnection(session);
		await conn.client.request<'config/mcpServer/reload'>('config/mcpServer/reload', undefined);
		await this._refreshMcpInventory(conn.client, threadId);
	}

	async stopMcpServer(sessionUri: URI, id: string): Promise<void> {
		const session = this._sessionForMcpControl(sessionUri);
		const serverName = session ? this._resolveMcpServerName(session, id) : undefined;
		if (!session || !serverName) {
			this._logService.warn(`[Codex] Cannot stop unknown MCP server customization ${id}`);
			return;
		}
		// TODO: Wire this when Codex exposes a typed MCP server stop request.
	}

	private _sessionForMcpControl(resource: URI): ICodexSession | undefined {
		const publisherSessionId = this._mcpPublisherSessionIdByConfiguration.get(resource.toString());
		return (publisherSessionId === undefined ? undefined : this._sessions.get(publisherSessionId))
			?? this._sessions.get(AgentSession.id(resource));
	}

	private _resolveMcpServerName(session: ICodexSession, id: string): string | undefined {
		const controller = this._getOrCreateMcpController(session);
		if (!controller) {
			return undefined;
		}
		controller.applyAll(inventoryToSdkServers(this._mcpInventory.forThread(session.threadId)));
		this._refreshMcpCustomizationIds(session, controller);
		return controller.serverNameForCustomizationId(id);
	}

	private _preferredMcpPublisher(configurationResource: URI): ICodexSession | undefined {
		return [...this._sessions.values()]
			.filter(session => !session.disposed && session.mcpController !== undefined && isEqual(session.configurationResource, configurationResource))
			.sort((a, b) => {
				const owningRuntimeOrder = Number(!isEqual(a.sessionUri, configurationResource)) - Number(!isEqual(b.sessionUri, configurationResource));
				return owningRuntimeOrder || a.sessionId.localeCompare(b.sessionId);
			})[0];
	}

	private _emitMcpCustomizationAction(session: ICodexSession, action: SessionAction): void {
		if (this._preferredMcpPublisher(session.configurationResource) !== session) {
			return;
		}
		this._switchMcpPublisher(session);
		const key = session.configurationResource.toString();
		const publishedIds = this._publishedMcpTopLevelIdsByConfiguration.get(key)!;
		if (action.type === ActionType.SessionCustomizationUpdated && action.customization.type === CustomizationType.McpServer) {
			publishedIds.add(action.customization.id);
		} else if (action.type === ActionType.SessionCustomizationRemoved) {
			publishedIds.delete(action.id);
		}
		this._fire(session.configurationResource, action);
	}

	private _switchMcpPublisher(session: ICodexSession): void {
		const key = session.configurationResource.toString();
		const previousPublisher = this._mcpPublisherSessionIdByConfiguration.get(key);
		if (previousPublisher === session.sessionId) {
			return;
		}
		const previousRuntimeStates = previousPublisher === undefined ? undefined : this._sessions.get(previousPublisher)?.mcpController?.runtimeStates.get();
		const currentRuntimeStates = session.mcpController?.runtimeStates.get();
		for (const id of previousRuntimeStates?.keys() ?? []) {
			if (!currentRuntimeStates?.has(id)) {
				this._fire(session.configurationResource, {
					type: ActionType.SessionMcpServerStateChanged,
					id,
					state: { kind: McpServerStatus.Stopped },
				});
			}
		}
		for (const id of this._publishedMcpTopLevelIdsByConfiguration.get(key) ?? []) {
			this._fire(session.configurationResource, { type: ActionType.SessionCustomizationRemoved, id });
		}
		this._publishedMcpTopLevelIdsByConfiguration.set(key, new Set());
		this._mcpPublisherSessionIdByConfiguration.set(key, session.sessionId);
	}

	private _releaseMcpPublisher(session: ICodexSession): void {
		const key = session.configurationResource.toString();
		if (this._mcpPublisherSessionIdByConfiguration.get(key) !== session.sessionId) {
			return;
		}
		for (const id of this._publishedMcpTopLevelIdsByConfiguration.get(key) ?? []) {
			this._fire(session.configurationResource, { type: ActionType.SessionCustomizationRemoved, id });
		}
		this._publishedMcpTopLevelIdsByConfiguration.delete(key);
		this._mcpPublisherSessionIdByConfiguration.delete(key);

		const preferred = this._preferredMcpPublisher(session.configurationResource);
		const preferredRuntimeStates = preferred?.mcpController?.runtimeStates.get();
		for (const id of session.mcpController?.runtimeStates.get().keys() ?? []) {
			if (!preferredRuntimeStates?.has(id)) {
				this._fire(session.configurationResource, {
					type: ActionType.SessionMcpServerStateChanged,
					id,
					state: { kind: McpServerStatus.Stopped },
				});
			}
		}
		if (preferred?.mcpController) {
			preferred.mcpController.applyAll(inventoryToSdkServers(this._mcpInventory.forThread(preferred.threadId)));
		}
	}

	/**
	 * Lazily create the per-session {@link McpCustomizationController}. Not
	 * registered on the agent (sessions come and go) — disposed explicitly
	 * when the session is removed.
	 */
	private _getOrCreateMcpController(session: ICodexSession): McpCustomizationController | undefined {
		if (!session.chatChannel) {
			return undefined;
		}
		if (!session.mcpController) {
			session.mcpController = this._instantiationService.createInstance(McpCustomizationController, {
				chatUri: session.chatChannel,
				emit: action => this._emitMcpCustomizationAction(session, action),
				capabilities: CODEX_MCP_APP_CAPABILITIES,
				pluginMcpServerSources: () => codexPluginMcpServerSources(session.clientCustomizations.plugins()),
				resolveEnablement: (server, owningPluginUri) => {
					const resolution = this._customizationEnablementService.resolve(session.configurationResource.toString(), targetForMcpServer(server, owningPluginUri, false));
					return resolution.kind === 'resolved' ? resolution.enablement : undefined;
				},
			});
			if (this._preferredMcpPublisher(session.configurationResource) === session) {
				this._switchMcpPublisher(session);
			}
		}
		return session.mcpController;
	}

	private _applyMcpInventoryToSession(session: ICodexSession): void {
		if (session.disposed) {
			return;
		}
		const controller = this._getOrCreateMcpController(session);
		if (!controller) {
			return;
		}
		controller.applyAll(inventoryToSdkServers(this._mcpInventory.forThread(session.threadId)));
		this._refreshMcpCustomizationIds(session, controller);
	}

	private _applyGlobalMcpInventoryToSessions(): void {
		for (const session of this._sessions.values()) {
			this._applyMcpInventoryToSession(session);
		}
	}

	/**
	 * Refreshes the session's mapper snapshot of server name → customization id
	 * (read when stamping the MCP contributor on tool calls). Plain data, owned
	 * here — the mapper never reaches back into the controller. Must run on every
	 * inventory change because MCP servers are discovered asynchronously, after a
	 * session (and possibly its first tool call) already exists.
	 */
	private _refreshMcpCustomizationIds(session: ICodexSession, controller: McpCustomizationController): void {
		const ids = session.mapState.mcpCustomizationIds;
		ids.clear();
		for (const serverName of this._mcpInventory.forThread(session.threadId).keys()) {
			const id = controller.customizationIdForServer(serverName);
			if (id !== undefined) {
				ids.set(serverName, id);
			}
		}
	}

	private async _refreshMcpInventory(client: ICodexAppServerClient, threadId: string | null): Promise<void> {
		let data: ListMcpServerStatusResponse['data'] = [];
		try {
			let cursor: string | null | undefined = null;
			do {
				const response: ListMcpServerStatusResponse = await client.request<'mcpServerStatus/list', ListMcpServerStatusResponse>('mcpServerStatus/list', { cursor, detail: 'full', threadId });
				data = data.concat(response.data ?? []);
				cursor = response.nextCursor;
			} while (cursor);
		} catch (err) {
			this._logService.warn(`[Codex] Failed to list MCP servers for ${threadId ?? 'global config'}: ${err instanceof Error ? err.message : String(err)}`);
			return;
		}
		// Drop the result if the connection was replaced while we were listing.
		if (this._connection.kind !== 'ready' || this._connection.client !== client) {
			return;
		}
		const session = threadId === null ? undefined : this._sessionForMcpThread(threadId);
		if (threadId !== null && !session) {
			return;
		}
		const configuredNames = session ? new Set(Object.keys(this._buildSessionMcpServers(session))) : undefined;
		const next = codexMcpListToInventory(data);
		const previous = this._mcpInventory.forScope(threadId);
		const toolsChanged: string[] = [];
		for (const [name, entry] of next) {
			const prev = previous.get(name);
			if (prev && codexMcpToolsChanged(prev, entry)) {
				toolsChanged.push(name);
			}
		}
		for (const [name, entry] of previous) {
			if (!next.has(name) && entry.state.kind !== McpServerStatus.Ready && (!configuredNames || configuredNames.has(name))) {
				next.set(name, entry);
			}
		}
		this._mcpInventory.replace(threadId, next);
		this._logService.info(`[Codex] MCP inventory refreshed for ${threadId ?? 'global config'}: ${next.size === 0 ? '(none)' : [...next].map(([name, entry]) => `${name} [${entry.state.kind}, ${entry.tools.length} tool(s)]`).join(', ')}`);
		if (threadId === null) {
			this._applyGlobalMcpInventoryToSessions();
		} else if (session) {
			this._applyMcpInventoryToSession(session);
		}
		for (const name of toolsChanged) {
			this._fireMcpToolsListChanged(threadId, name);
		}
	}

	/**
	 * Handles a `mcpServer/startupStatus/updated` notification. `ready`
	 * triggers a full inventory refresh (to pull the now-loaded tools);
	 * other transitions update the cached state in place so the UI sees the
	 * server settle into starting/error/stopped promptly.
	 */
	private _handleMcpStartupStatus(client: ICodexAppServerClient, threadId: string | null, name: string, status: McpServerStartupState, error: string | null): void {
		if (this._connection.kind !== 'ready' || this._connection.client !== client) {
			return;
		}
		if (threadId !== null && !this._sessionForMcpThread(threadId)) {
			const pending = this._pendingMcpStartupStatuses.get(threadId) ?? [];
			if (pending.length === 16) {
				pending.shift();
			}
			pending.push({ client, name, status, error });
			this._pendingMcpStartupStatuses.set(threadId, pending);
			if (this._pendingMcpStartupStatuses.size > 64) {
				const oldestThreadId = this._pendingMcpStartupStatuses.keys().next().value;
				if (oldestThreadId !== undefined) {
					this._pendingMcpStartupStatuses.delete(oldestThreadId);
				}
			}
			return;
		}
		this._logService.info(`[Codex] MCP server '${name}' startup status for ${threadId ?? 'global config'}: ${status}${error ? ` (${error})` : ''}`);
		if (status === 'ready') {
			void this._refreshMcpInventory(client, threadId);
			return;
		}
		// An auth-gated http server whose sign-in we can drive: discover its
		// OAuth metadata asynchronously (codex's failure notification omits it)
		// and then surface `AuthRequired`. The server stays in its current
		// (starting) state until discovery resolves.
		if (threadId !== null && status === 'failed' && codexStartupErrorNeedsAuth(error)) {
			const url = this._mcpServerUrlForName(threadId, name);
			const normalized = url !== undefined ? normalizeCodexMcpResourceUrl(url) : undefined;
			if (url !== undefined && normalized !== undefined) {
				// A token we already injected was rejected (expired/revoked/
				// insufficient scopes). Drop it so the user is re-prompted
				// instead of getting stuck on a terminal error with no way to
				// re-authenticate.
				if (this._mcpAuthTokens.delete(normalized)) {
					this._logService.info(`[Codex] MCP server '${name}' rejected the stored token; clearing it to allow re-authentication`);
				}
				void this._surfaceMcpAuthRequired(client, threadId, name, url, error);
				return;
			}
		}
		this._setMcpServerState(threadId, name, translateCodexMcpStartupState(status, error));
	}

	private _flushPendingMcpStartupStatuses(threadId: string): void {
		const pending = this._pendingMcpStartupStatuses.get(threadId);
		if (!pending) {
			return;
		}
		this._pendingMcpStartupStatuses.delete(threadId);
		for (const item of pending) {
			this._handleMcpStartupStatus(item.client, threadId, item.name, item.status, item.error);
		}
	}

	private _setMcpServerState(threadId: string | null, name: string, state: McpServerState): void {
		this._mcpInventory.setState(threadId, name, state);
		if (threadId === null) {
			this._applyGlobalMcpInventoryToSessions();
			return;
		}
		const session = this._sessionForMcpThread(threadId);
		if (session) {
			this._applyMcpInventoryToSession(session);
		}
	}

	/**
	 * Surfaces an auth-gated http MCP server as {@link McpServerStatus.AuthRequired}
	 * so the workbench runs the *same* OAuth sign-in it uses for the Copilot
	 * agent. codex's `failed` notification carries no RFC 9728 metadata, and the
	 * workbench's `resolveMcpServerAuthentication` needs the resource's
	 * `authorization_servers` to know where to sign in — so we discover the
	 * Protected Resource Metadata (`<url>/.well-known/oauth-protected-resource`)
	 * here, mirroring the discovery the Copilot SDK does internally. On
	 * discovery failure we still surface `AuthRequired` with bare metadata (the
	 * server genuinely needs auth); the one-click sign-in just can't complete
	 * without the authorization server, which is logged.
	 */
	private async _surfaceMcpAuthRequired(client: ICodexAppServerClient, threadId: string, name: string, url: string, error: string | null): Promise<void> {
		const session = this._sessionForMcpThread(threadId);
		if (!session) {
			return;
		}
		const configuredChildren = session.clientCustomizations.toCustomizations()
			.flatMap(plugin => plugin.children ?? [])
			.filter((child): child is McpServerCustomization => child.type === CustomizationType.McpServer && child.name === name);
		if ((configuredChildren.length > 0 && configuredChildren.every(child => !isCustomizationEnabled(child)))
			|| (configuredChildren.length === 0 && !this._isMcpServerEnabledForSdk(session, name))) {
			this._logService.info(`[Codex] Suppressed authentication request from disabled MCP server '${name}'`);
			return;
		}
		let resource: ProtectedResourceMetadata = { resource: url, resource_name: name };
		let requiredScopes: string[] | undefined;
		try {
			const discovered = await raceTimeout(fetchResourceMetadata(url, undefined), 15_000);
			if (discovered) {
				resource = discovered.metadata;
				requiredScopes = discovered.metadata.scopes_supported;
				this._logService.info(`[Codex] discovered OAuth metadata for MCP server '${name}': authorization_servers=[${(discovered.metadata.authorization_servers ?? []).join(', ')}]`);
			} else {
				this._logService.warn(`[Codex] timed out discovering OAuth metadata for MCP server '${name}' at ${url}; the Authenticate action may not be able to complete`);
			}
		} catch (err) {
			this._logService.warn(`[Codex] failed to discover OAuth metadata for MCP server '${name}' at ${url}; the Authenticate action may not be able to complete: ${err instanceof Error ? err.message : String(err)}`);
		}
		// Drop the result if the connection was replaced while discovering.
		if (this._connection.kind !== 'ready' || this._connection.client !== client) {
			return;
		}
		if (this._mcpServerUrlForName(threadId, name) !== url) {
			return;
		}
		// Record which server URL this OAuth resource unlocks: discovery can
		// return a `resource` that differs from the configured server URL, and
		// the token the workbench later pushes back is keyed by that resource.
		const normalizedServer = normalizeCodexMcpResourceUrl(url);
		const normalizedResource = normalizeCodexMcpResourceUrl(resource.resource) ?? normalizedServer;
		if (normalizedServer !== undefined && normalizedResource !== undefined) {
			const servers = this._mcpAuthServerUrlsByResource.get(normalizedResource) ?? new Set<string>();
			servers.add(normalizedServer);
			this._mcpAuthServerUrlsByResource.set(normalizedResource, servers);
		}
		this._logService.info(`[Codex] MCP server '${name}' requires authentication for ${url}`);
		this._setMcpServerState(threadId, name, {
			kind: McpServerStatus.AuthRequired,
			reason: McpAuthRequiredReason.Required,
			resource,
			requiredScopes: requiredScopes && requiredScopes.length > 0 ? requiredScopes : undefined,
			description: error ?? undefined,
		});
	}

	private _fireMcpToolsListChanged(threadId: string | null, serverName: string): void {
		const sessions = threadId === null
			? this._sessions.values()
			: [this._sessionForMcpThread(threadId)].filter((session): session is ICodexSession => session !== undefined);
		for (const session of sessions) {
			if (threadId === null && session.threadId !== undefined && this._mcpInventory.hasThreadEntry(session.threadId, serverName)) {
				continue;
			}
			const channel = session.mcpController?.channelForServer(serverName);
			if (channel) {
				this._onMcpNotification.fire({ channel, method: 'notifications/tools/list_changed' });
			}
		}
	}

	/**
	 * Ensures the session has a materialized codex thread and returns its id.
	 * MCP tool calls (`mcpServer/tool/call`) are thread-scoped, so a call
	 * arriving before the first turn lazily starts the thread.
	 */
	private async _ensureMaterializedThreadConnection(session: ICodexSession): Promise<{ readonly threadId: string; readonly connection: IConnectionReady }> {
		await this._materializeIfNeeded(session, session.configurationResource, false);
		if (session.threadId === undefined) {
			throw new Error(`Cannot run MCP tool: codex session ${session.sessionId} is not materialized`);
		}
		return this._ensureThreadConnection(session);
	}

	private _clearRuntimeState(): void {
		for (const s of this._sessions.values()) {
			s.disposed = true;
			if (s.prewarmTimer) {
				clearTimeout(s.prewarmTimer);
				s.prewarmTimer = undefined;
			}
			s.pendingCommandApprovals.denyAll('decline');
			s.pendingClientToolCalls.rejectAll(new CancellationError());
			s.pendingUserInputs.rejectAll(new CancellationError());
			s.mcpController?.dispose();
		}
		for (const subagent of this._subagentsByThreadId.values()) {
			subagent.session.disposed = true;
			if (subagent.session.prewarmTimer) {
				clearTimeout(subagent.session.prewarmTimer);
				subagent.session.prewarmTimer = undefined;
			}
			subagent.session.pendingCommandApprovals.denyAll('decline');
			subagent.session.pendingClientToolCalls.rejectAll(new CancellationError());
			subagent.session.pendingUserInputs.rejectAll(new CancellationError());
		}
		for (const entry of this._sessionMcpDiscoveries.values()) {
			entry.dispose();
		}

		this._desktopThreadIds.clear();
		this._sessions.clear();
		this._activeClientHandles.clear();
		this._sessionIdByChatUri.clear();
		this._sessionIdByThreadId.clear();
		this._releasedManagedWorkingDirectories.clear();
		this._configScopeChats.clear();
		this._configScopeByChat.clear();
		this._subagentsByThreadId.clear();
		this._sessionMcpDiscoveries.clear();
		this._pendingMcpStartupStatuses.clear();
		this._mcpInventory.clear();
		this._mcpPublisherSessionIdByConfiguration.clear();
		this._publishedMcpTopLevelIdsByConfiguration.clear();
		this._mcpAuthTokens.clear();
		this._mcpAuthServerUrlsByResource.clear();
	}

	private _stopRuntime(): void {
		if (this._isShuttingDown) {
			return;
		}
		this._isShuttingDown = true;
		this._modelCatalogGeneration++;
		this._modelRefreshRetry.clear();
		this._skillHookCustomizationRefresh.clear();
		this._startupAccountProbeCancellation.dispose(true);
		this._disposeTransientAccountConnection();
		this._disposeConnection();
		this._clearRuntimeState();
	}

	async shutdown(): Promise<void> {
		this._stopRuntime();
	}

	resolveChatConfig(params: IAgentResolveChatConfigParams): Promise<ResolveSessionConfigResult> {
		const values = codexSessionConfigSchema.validateOrDefault(params.config, codexSessionConfigDefaults);
		const schema = codexVisibleSessionConfigSchema.toProtocol();
		// Preserve every value the caller previously persisted. This return
		// REPLACES the stored session config on restore (see
		// `AgentService._resolveCreatedSessionConfig`), so cherry-picking only
		// the visible keys here would reset all the others (reasoning effort,
		// personality, sandbox axes, …) back to their defaults on resume.
		const resolvedValues: Record<string, unknown> = {
			...params.config,
			[SessionConfigKey.Mode]: values[SessionConfigKey.Mode],
		};
		// Migrate the permission axes off the raw config. `validateOrDefault`
		// always materializes `permissionsPreset='default'`, but blindly storing
		// that would silently escalate a legacy session that persisted only the
		// individual `sandboxMode`/`approvalPolicy` axes (e.g. `read-only`) —
		// `resolveCodexPermissions` checks the preset first. Drop all three
		// permission keys, then re-apply only the ones the migration decides are
		// safe (an explicit or exactly-equivalent preset, else the raw axes).
		delete resolvedValues[CodexSessionConfigKey.PermissionsPreset];
		delete resolvedValues[CodexSessionConfigKey.ApprovalPolicy];
		delete resolvedValues[CodexSessionConfigKey.SandboxMode];
		Object.assign(resolvedValues, migrateCodexPermissionValues(params.config, {
			approvalPolicy: codexSessionConfigDefaults[CodexSessionConfigKey.ApprovalPolicy],
			sandboxMode: codexSessionConfigDefaults[CodexSessionConfigKey.SandboxMode],
		}));
		return Promise.resolve({ values: resolvedValues, schema });
	}

	getInheritedChatConfig(config: Readonly<Record<string, unknown>>): Record<string, unknown> | undefined {
		const inherited: Record<string, unknown> = migrateCodexPermissionValues(config, {
			approvalPolicy: codexSessionConfigDefaults[CodexSessionConfigKey.ApprovalPolicy],
			sandboxMode: codexSessionConfigDefaults[CodexSessionConfigKey.SandboxMode],
		});
		if (config[SessionConfigKey.Permissions] !== undefined) {
			inherited[SessionConfigKey.Permissions] = config[SessionConfigKey.Permissions];
		}
		return Object.keys(inherited).length > 0 ? inherited : undefined;
	}

	getAutonomousSessionConfig(_config: Readonly<Record<string, unknown>>): Record<string, unknown> | undefined {
		return getCodexAutonomousSessionConfig(this._configurationService.getRootValue(platformRootSchema, AgentHostAutoApprovePolicyRestrictedConfigKey) === true);
	}

	async chatConfigCompletions(params: IAgentChatConfigCompletionsParams): Promise<SessionConfigCompletionsResult> {
		if (params.property !== CodexSessionConfigKey.AdditionalDirectories) {
			return { items: [] };
		}
		const query = params.query?.trim();
		if (!query) {
			return { items: [] };
		}
		const workingDirectory = params.workingDirectory?.fsPath;
		const resolved = isAbsolute(query)
			? query
			: resolve(workingDirectory ?? process.cwd(), query);
		const parent = query.endsWith(sep) ? resolved : dirname(resolved);
		const prefix = query.endsWith(sep) ? '' : basename(resolved).toLowerCase();
		try {
			const entries = await fs.promises.readdir(parent, { withFileTypes: true });
			return {
				items: entries
					.filter(entry => entry.isDirectory() && entry.name.toLowerCase().startsWith(prefix))
					.slice(0, 50)
					.map(entry => {
						const value = join(parent, entry.name);
						return { value, label: entry.name, description: value };
					}),
			};
		} catch {
			return { items: [] };
		}
	}

	// #endregion

	private _fire(sessionUri: URI, action: SessionAction | ChatAction): void {
		if (isChatAction(action)) {
			const chatChannel = this._sessions.get(AgentSession.id(sessionUri))?.chatChannel;
			if (!chatChannel) {
				throw new Error(`Codex session ${sessionUri.toString()} has no bound chat channel`);
			}
			this._onDidChatProgress.fire({ kind: 'action', resource: chatChannel, action });
			return;
		}
		this._onDidChatProgress.fire({ kind: 'action', resource: sessionUri, action });
	}

	override dispose(): void {
		this._stopRuntime();
		super.dispose();
	}
}

function parseBinaryArgs(json: string | undefined): string[] {
	if (!json) {
		return [];
	}
	try {
		const parsed = JSON.parse(json);
		return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
	} catch {
		return [];
	}
}

/**
 * The suffix Codex uses for its platform `optionalDependencies` packages
 * (`@openai/codex-${suffix}`). Codex's Linux binaries are statically
 * musl-linked and ship under the same `linux-<arch>` package regardless of
 * host libc, so this never returns a `-musl` suffix.
 *
 * Returns undefined for unsupported `(platform, arch)` combinations — the
 * caller surfaces the error.
 */
export function codexPackageSuffix(platform: NodeJS.Platform, arch: string): string | undefined {
	if ((platform !== 'linux' && platform !== 'darwin' && platform !== 'win32') ||
		(arch !== 'x64' && arch !== 'arm64')) {
		return undefined;
	}
	return `${platform}-${arch}`;
}

/**
 * Mirrors the triple table inside `@openai/codex/bin/codex.js` so we can spawn
 * the native binary at `vendor/<triple>/bin/codex` directly without going
 * through the JS shim launcher.
 */
export function codexBinaryTriple(sdkTarget: string): string | undefined {
	switch (sdkTarget) {
		case 'linux-x64': return 'x86_64-unknown-linux-musl';
		case 'linux-arm64': return 'aarch64-unknown-linux-musl';
		case 'darwin-x64': return 'x86_64-apple-darwin';
		case 'darwin-arm64': return 'aarch64-apple-darwin';
		case 'win32-x64': return 'x86_64-pc-windows-msvc';
		case 'win32-arm64': return 'aarch64-pc-windows-msvc';
		default: return undefined;
	}
}

/**
 * Locate the SDK root for the dev (running-from-source) fallback by resolving
 * `@openai/codex` — a devDependency in source checkouts — out of this repo's
 * `node_modules`. Returns the directory that *contains* that `node_modules`
 * (i.e. the value `_startConnection` joins `node_modules/@openai/codex-<target>`
 * onto), or undefined when the package can't be resolved (e.g. a built product
 * where it isn't shipped). `@openai/codex` declares no `exports` map, so its
 * `package.json` is resolvable.
 *
 * `resolvePackageJsonPath` is a seam for tests; production resolves the path
 * via {@link defaultResolveCodexPackageJsonPath}.
 */
export async function resolveCodexDevSdkRoot(
	resolvePackageJsonPath: () => string | Promise<string> = defaultResolveCodexPackageJsonPath,
): Promise<string | undefined> {
	try {
		const pkgJson = await resolvePackageJsonPath();
		// <root>/node_modules/@openai/codex/package.json → <root>
		return dirname(dirname(dirname(dirname(pkgJson))));
	} catch {
		return undefined;
	}
}

async function defaultResolveCodexPackageJsonPath(): Promise<string> {
	// Dynamic import of `node:module` (not a static top-level import): the
	// unit-test electron renderer that loads this module for
	// `codexPackagePaths.test` cannot fetch a static `node:module` import, so
	// the sibling WSL/SSH host services resolve `createRequire` the same way
	// for the same reason.
	const { createRequire } = await import('node:module');
	return createRequire(import.meta.url).resolve('@openai/codex/package.json');
}
