/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { withMessageRequestHiddenFromTranscript } from '../common/meta/agentMessageMeta.js';
import { decodeBase64, VSBuffer } from '../../../base/common/buffer.js';
import { Barrier, DeferredPromise, disposableTimeout, Limiter, raceTimeout, Sequencer, SequencerByKey, ThrottlerByKey } from '../../../base/common/async.js';
import { IAgentHostWorktreeDiskUsageService } from './worktreeDiskUsage.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { getErrorCode, isCancellationError } from '../../../base/common/errors.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableResourceMap, DisposableStore, IDisposable, IReference, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../base/common/map.js';
import { getExtensionForMimeType, getMediaMime } from '../../../base/common/mime.js';
import { Schemas } from '../../../base/common/network.js';
import { equals } from '../../../base/common/objects.js';
import { dirname as resourcesDirname, extname as resourcesExtname, extUriBiasedIgnorePathCase, isEqual, isEqualOrParent, joinPath, getComparisonKey } from '../../../base/common/resources.js';
import { StopWatch } from '../../../base/common/stopwatch.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { workspacelessChatsRoot } from '../common/workspacelessScratchDir.js';
import { getTelemetryMigrationErrorMessage, getTelemetryMigrationSessionId } from '../common/agentTelemetryCorrelation.js';
import { localize } from '../../../nls.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { FileChangeType, FileOperationResult, IFileChange, IFileService, toFileOperationResult, type FileChangesEvent } from '../../files/common/files.js';
import { parsePullRequestUrl } from '../../github/common/githubUrls.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import type { IMcpServerConfiguration } from '../../mcp/common/mcpPlatformTypes.js';
import { chatUriFormatOf, createChatUriError, mintDefaultChatUri, subagentChatUri } from '../common/agentHostChatMinting.js';
import { AgentChatMigrationDeferred, type AgentCanvasDefinitionSnapshot, AgentProvider, AgentSession, AgentSignal, CODEX_AGENT_PROVIDER_ID, IAgent, type IAgentAdoptedWorktree, type IAgentCanvasCloseRequest, type IAgentCanvasOpenRequest, IAgentChatContext, IAgentChatDataChange, IAgentChatMetadata, IAgentCreateChatOptions, IAgentCreateChatRequestOptions, IAgentCreateChatResult, IAgentCreateChatSideChatSelection, IAgentCreateChatSideChatSource, type IAgentCreateChatWorkspace, IAgentCreateSessionConfig, IAgentCreateSessionResult, IAgentCustomizationInstallation, IAgentCustomizationInstallationApplyResult, IAgentCustomizationInstallationRequest, IAgentCustomizationInstallationReview, IAgentCustomizationMarketplaceSearchRequest, IAgentCustomizationMarketplaceSearchResult, IAgentDiscoveredChat, IAgentLegacyChat, type IAgentManagedPluginRetryEntry, IAgentMaterializeChatEvent, IAgentModelInfo, type IAgentPluginInstallRequest, type IAgentPluginUninstallRequest, IAgentResolveSessionConfigParams, IAgentChatAdoptionResult, type AgentChatAdoptionReason, IAgentSessionConfigCompletionsParams, type IAgentSessionChatMetadata, IAgentSessionMetadata, IAgentSpawnChatEvent, AuthenticateParams, AuthenticateResult, SubagentChatSignal, subagentChatTitle } from '../common/agent.js';
import { getPendingSteeringMessages } from '../common/agentSessionMessage.js';
import { type AgentHostDebugLogsArtifactKind, type IAgentCreateChatInitialMessageContext, type IAgentHostDebugLogsArtifact, type IAgentHostDebugLogsChunk, IAgentHostManagedSettingsDiagnostics, IAgentHostNetworkDiagnosticsInfo, IAgentHostNetworkFetchResult, IAgentService, type IAgentServiceCreateSessionConfig } from '../common/agentService.js';
import { ISessionDatabase, ISessionDataService, ISessionStorageAccessCounts, SESSION_ATTACHMENTS_DIRNAME } from '../common/sessionDataService.js';
import { EDIT_ATTRIBUTION_RESOURCE_SCHEME, IAgentEditAttributionService } from '../common/fileEditAttribution.js';
import { MCP_RESOURCE_SCHEME, TOOL_RESULT_RESOURCE_SCHEME } from '../common/mcpResourceUri.js';
import { SESSION_DB_SCHEME } from '../common/sessionDbUri.js';
import { getPersistedSessionConfigValues, getSessionPullRequestUrl, omitTransientSessionConfigValues, SessionConfigKey } from '../common/sessionConfigKeys.js';
import { filterChatConfigValues, getSessionApprovalProperty, validateChatConfigWrite, validateSessionConfigWrite } from '../common/sessionConfigProperties.js';
import type { IAgentCustomizationSettingsRegistration } from '../common/agentCustomizationSettings.js';
import { buildAnnotationsUri, parseAnnotationsUri } from '../common/annotationsUri.js';
import { changesetSession, parseChangesetUri } from '../common/changesetUri.js';
import { ActionType, ActionEnvelope, AuthRequiredReason, INotification, isAnnotationsAction, isPassiveSessionMetadataAction, isSessionAction, type ChatAction, type ClientAutomationAction, type ClientAutomationRunAction, type IIsArchivedChangedAction, type IIsReadChangedAction, type IRootConfigChangedAction, type SessionAction, type SessionWorkingDirectoryAction, type TerminalAction, type ClientAnnotationsAction, type ClientChangesetAction } from '../common/state/sessionActions.js';
import { resolveSessionWorkingDirectoryAction } from '../common/state/sessionWorkingDirectories.js';
import type { CompletionsParams, CompletionsResult, CreateTerminalParams, ResolveSessionConfigResult, SessionConfigCompletionsResult, SessionConfigPropertySchema } from '../common/state/protocol/commands.js';
import { AHP_CANVAS_SCHEME } from '../common/canvasUri.js';
import type { AutomationCapabilities } from '../common/state/protocol/common/commands.js';
import type { FetchAutomationRunsParams, FetchAutomationRunsResult, ListAutomationTriggerDefinitionsParams, ListAutomationTriggerDefinitionsResult, RunAutomationParams, RunAutomationResult } from '../common/state/protocol/channels-automation/commands.js';
import type { InvokeChangesetOperationParams, InvokeChangesetOperationResult } from '../common/state/protocol/channels-changeset/commands.js';
import { AhpErrorCodes, AHP_SESSION_NOT_FOUND, AuthenticateTargetKind, ContentEncoding, JSON_RPC_INTERNAL_ERROR, JsonRpcErrorCodes, ProtocolError, ResourceChangeType, type CreateResourceWatchParams, type CreateResourceWatchResult, type ResourceCopyParams, type ResourceCopyResult, type ResourceDeleteParams, type ResourceDeleteResult, type ResourceListResult, type ResourceMkdirParams, type ResourceMkdirResult, type ResourceMoveParams, type ResourceMoveResult, type ResourceReadResult, type ResourceResolveParams, type ResourceResolveResult, type ResourceWatchState, type ResourceWriteParams, type ResourceWriteResult, type IStateSnapshot } from '../common/state/sessionProtocol.js';
import { ChangesSummary, ChatInteractivity, ChatOriginKind, MessageAttachmentKind, PendingMessageKind, TerminalClaimKind, TerminalLifecycleStatus, type Annotation, type AnnotationEntry, type AnnotationOrigin, type AnnotationsState, type ChatOrigin, type ChatState, type Customization, type Message, type MessageAttachment, type MessageResourceAttachment, type TerminalState, type TextRange, type ToolResultTerminalContent } from '../common/state/protocol/state.js';
import type { ChatConfigChangedAction, ChatIsArchivedChangedAction, ChatIsReadChangedAction, ChatPendingMessageSetAction, ChatTurnStartedAction, SessionConfigChangedAction } from '../common/state/protocol/actions.js';
import { getAgentHostChatId, isAhpAutomationCatalogChannel, isAhpAutomationRunChannel, ISessionGitState, MessageKind, ResponsePartKind, SESSION_META_GITHUB_KEY, SESSION_META_GIT_KEY, SESSION_META_MULTI_ROOT_KEY, SESSION_META_SOURCE_CONTROL_KEY, AH_META_AUTO_ARCHIVED_AT_DB_KEY, AH_META_CREATED_BY_SESSION_DB_KEY, readSessionCreationReference, readSessionComparisonMetadata, readSessionSpawnDepth, withSessionSpawnDepth, withSessionCreationReference, parseSessionCreationReference, SessionLifecycle, SessionStatus, ToolCallStatus, ToolResultContentType, TurnState, AH_META_HAS_WORKSPACE_TRANSITIONS_DB_KEY, AH_META_WORKSPACE_CONVERSION_QUARANTINED_DB_KEY, AH_META_WORKSPACELESS_DB_KEY, AH_META_EHCLI_ADOPTED_DB_KEY, AH_META_IS_ARCHIVED_DB_KEY, AH_META_IS_DONE_DB_KEY, AH_META_IS_READ_DB_KEY, AH_META_DEFAULT_CHAT_IS_READ_DB_KEY, buildResourceWatchChannelUri, buildSubagentSessionUriPrefix, getErrorResponsePart, getSessionChatResource, isAhpChatChannel, isChatInSessionReadAggregate, isChatReadOnly, isSessionChatArchived, isSessionStatusArchived, isSessionStatusRead, isSubagentSession, needsSessionGitStateRefresh, parseResourceWatchChannelUri, parseSessionGitData, parseSessionMultiRootMetadata, parseSubagentSessionUri, readSessionExternal, readSessionGitHubState, readSessionGitState, readSessionMultiRootMetadata, readSessionSourceControlState, readSessionWorkspaceless, readSessionScratchFolders, withSessionScratchFolders, withSessionExternal, withSessionGitData, withSessionGitHubState, withSessionGitState, withSessionHasWorkspaceTransitions, withSessionMultiRootMetadata, withSessionSourceControlState, withSessionStatusFlag, withSessionWorkspaceless, withSessionEhcliAdopted, withSessionEhcliLastMigratedTurn, AH_META_EHCLI_LAST_TURN_DB_KEY, withSessionFolderPickerDecision, readSessionFolderPickerDecision, parseSessionFolderPickerDecision, SESSION_META_FOLDER_PICKER_KEY, getAllSessionRelatedPullRequestUrls, readSessionEhcliAdoptable, readSessionEhcliAdopted, readSessionGitHubData, parseSessionGitHubData, parseSessionGitHubState, readSessionGitHubStateInput, withMigratedSessionGitHubState, withReplacedFolderGitHubState, withMostRecentRelatedSessionPullRequest, SESSION_META_GITHUB_DATA_KEY, withWorkingDirectoryKey, withWorkingDirectoryScopeId, type ISessionGitHubState, type ISessionSourceControlState, type ChatSummary, type ISessionWithDefaultChat, type ProjectInfo, type SessionConfigState, type SessionSummary, type SessionSummaryMeta, type ToolResultSubagentContent, type Turn } from '../common/state/sessionState.js';
import { readToolCallMeta } from '../common/meta/agentToolCallMeta.js';
import { isHostSnapshotAttachment, toHostSnapshotAttachmentMeta } from '../common/meta/agentSnapshotAttachmentMeta.js';
import { readEphemeralSessionMeta, withEphemeralSessionMeta } from '../common/meta/agentEphemeralSessionMeta.js';
import { IAgentMessageDelegationMeta, toAgentMessageDelegationMeta } from '../common/meta/agentMessageDelegationMeta.js';
import { toAgentMergeMessageMeta } from '../common/meta/agentMergeMessageMeta.js';
import { readChatSurfaceMeta, withChatSurfaceMeta } from '../common/meta/agentChatSurfaceMeta.js';
import { AH_META_DEV_CONTAINER_WORKTREE_DB_KEY, readAgentDevContainerWorktreeMetadata, withAgentDevContainerWorktreeMetadata } from '../common/meta/agentDevContainerWorktreeMeta.js';
import { readCodexSessionModel, withCodexSessionModel } from '../common/meta/codexSessionModel.js';
import { IRemoteSessionOrigin, parseRemoteSessionOrigin, readRemoteSessionOrigin, REMOTE_SESSION_ORIGIN_METADATA_KEY, withRemoteSessionOrigin } from '../common/meta/agentRemoteSessionMeta.js';
import { getLegacySessionInitiator, parseSessionInitiator, readSessionInitiator, SESSION_INITIATOR_METADATA_KEY, withSessionInitiator } from '../common/meta/agentSessionInitiatorMeta.js';
import { AgentConfigurationService } from './agentConfigurationService.js';
import { agentModelConfigurationReportKey } from '../common/agentModelConfiguration.js';
import { IAgentHostTerminalManager } from './agentHostTerminalManager.js';
import { parseNonPtyShellTerminalUri, type INonPtyShellTerminalUri } from '../common/nonPtyShellTerminalUri.js';
import { getWorkingDirectoryKey } from '../common/agentHostWorkingDirectories.js';
import { AgentHostStateManager, ChatRemovalReason, creationTimeChatStorageResource } from './agentHostStateManager.js';
import { IAgentHostSessionTitleController } from './agentHostSessionTitleController.js';
import { AgentHostSessionPrewarmer } from './agentHostSessionPrewarmer.js';
import { IAdditionalWorktreeLifecycleService } from './chatContributions/additionalWorktreeLifecycle/additionalWorktreeLifecycleService.js';
import { IAgentHostWorktreeCleanupService } from './agentHostWorktreeCleanupService.js';
import type { IScratchFolder } from './agentHostScratchFolderDatabase.js';
import type { WorktreeRemovalMode } from './agentHostWorktreeRemovalDatabase.js';
import { AgentHostAutomationService } from './agentHostAutomationService.js';
import { createAgentChatContext, createAgentChatCreationContext, inheritedChatFolders } from './agentChatContext.js';
import { captureCredentialSource, parseCredentialPrincipal, type IAgentHostAuthenticationScope, type IAgentHostCredentialSource } from '../common/agentHostCredentials.js';
import { AgentHostDebugLogsCollector, type IAgentHostDebugLogsEnvironment } from './agentHostDebugLogs.js';
import { withAgentHostDebugLogsProgress } from '../common/meta/agentHostDebugLogsMeta.js';
import { IAgentHostDatabase, IAgentHostDatabaseSessionOptions, type IAgentHostDatabaseCatalogSnapshotEntry, type IAgentHostDatabaseSessionsV2Exclusion } from './agentHostDatabase.js';
import { AgentSessionRegistry, IRegisteredSession, IStoredRegisteredSession } from './agentSessionRegistry.js';
import { IAgentHostSessionStateStore, type ISessionStateWorktreeListChanges, readSessionBaseBranch, SessionStateDeletedError, SessionStateMirrorFlush, sessionStatePatch, type SessionStateValuesPrefetch } from '../common/agentHostSessionStateStore.js';
import { getSessionStateValueKey } from './agentHostSessionStateMirror.js';
import { IAgentHostGitService, META_DIFF_BASE_BRANCH, resolveDefaultBaseBranchName, tryResolvePrimaryWorktreeRoot } from '../common/agentHostGitService.js';
import { resolveBranchChangesetScopeForOwner, resolveBranchChangesetScopeForSource, resolveChangesetOwnerScope, resolveGitHubStateFolder } from './agentHostBranchChangesetScope.js';
import { IAgentHostSubscriptionService, resolveAgentHostSession } from '../common/agentHostSubscriptionService.js';
import { deriveLegacyDefaultChat } from '../common/agentHostLegacyDefaultChat.js';
import { IAgentHostChatOwnershipService, usesStandardSessionUris, type IChatOwnerResolution } from './agentHostChatOwnershipService.js';
import { AgentHostAttachmentMigration } from './agentHostAttachmentMigration.js';
import { IAgentHostChatInputService } from './agentHostChatInputService.js';
import { AgentSideEffects, type IAgentSideEffectsOptions } from './agentSideEffects.js';
import { AgentHostLocalTurns, interleaveLocalTurns } from './agentHostLocalTurns.js';
import { AgentHostSavedChatService, type AgentHostSavedChatArchiveTarget } from './agentHostSavedChatService.js';
import type { IAgentHostSavedChat, IAgentHostSavedChatContinuation, IAgentHostSavedChatContinuationResult } from '../common/agentHostSavedChat.js';
import { hasSingleUserChat, ISessionWorkspaceConversionService } from './chatContributions/sessionWorkspaceConversion/sessionWorkspaceConversionService.js';
import { AgentSessionResidency } from './agentSessionResidency.js';
import { IAgentHostResourceProviders } from './agentHostResourceProviders.js';
import { GIT_BLOB_SCHEME } from './gitDiffContent.js';
import { EditAttributionResourceProvider } from './resourceProviders/editAttributionResourceProvider.js';
import { GitBlobResourceProvider } from './resourceProviders/gitBlobResourceProvider.js';
import { McpResourceLinkProvider } from './resourceProviders/mcpResourceLinkProvider.js';
import { SessionDbResourceProvider } from './resourceProviders/sessionDbResourceProvider.js';
import { ToolResultResourceProvider } from './resourceProviders/toolResultResourceProvider.js';
import { IAgentHostSessionOpenTelemetry, type IAgentHostSessionOpenTelemetryScope } from './agentHostSessionOpenTelemetry.js';
import { AgentServerToolHost } from './shared/agentServerToolHost.js';
import { type IAddSessionWorkingDirectoryOptions, type IAgentServiceSessionServerToolAccessor, type IPreparedChatWorkingDirectory, type IChatContextSnapshot, type IRenameTitleResult, type ISessionCreationDefaults, type ISessionServerToolMove, type SessionServerToolMoveAnchor, validateRenameTitle } from './shared/sessionServerTools.js';
import { AGENT_HOST_TITLE_SOURCE_AGENT, AGENT_HOST_TITLE_SOURCE_AUTO, AGENT_HOST_TITLE_SOURCE_USER, customChatTitleMetadataKey, customChatTitleSourceMetadataKey, parseSessionWorkingDirectories, persistSessionMetadataValues, SESSION_ARTIFACTS_KEY, SESSION_CUSTOM_TITLE_KEY, SESSION_CUSTOM_TITLE_SOURCE_KEY, SESSION_WORKING_DIRECTORIES_KEY } from './shared/persistSessionMetadata.js';
import { type IArtifactServerToolAccessor } from './shared/artifactServerTools.js';
import { SessionArtifacts } from './shared/sessionArtifacts.js';
import { readSessionAdditionalWorktrees, writeSessionAdditionalWorktrees, type ISessionAdditionalWorktree } from './shared/sessionAdditionalWorktrees.js';
import { sessionWorktreeFolderRepositoryRoot, WORKTREE_FOLDERS_KEY, withSessionWorktreeFolders } from './shared/sessionWorktreeFolders.js';
import { AgentHostWorktreeCoOwnership, type ISessionWorktreeRecords, type IWorktreeMoveDecisions, type IWorktreeWithholding, planWorktreeMove, presentedWorktreeFolders } from './agentHostWorktreeCoOwnership.js';
import { parseSessionArtifacts, readSessionArtifacts, SessionArtifactType, stringifySessionArtifacts, withSessionArtifacts, type ISessionArtifact } from '../common/sessionArtifacts.js';
import { SessionArtifactCollection } from '../common/sessionArtifactCollection.js';
import { AgentHostCatalogDatabaseReference, AgentHostCatalogSyncService, type AgentHostCatalogSyncResult, IAgentHostCatalogSyncRequest } from './agentHostCatalogSyncService.js';
import { AGENT_HOST_CATALOG_PAYLOAD_VERSION, AgentHostCatalogData, decodeAgentHostCatalogPayload, hashAgentHostCatalogPayload } from './agentHostCatalogProjection.js';
import { AgentHostCatalogReconciliationService, AgentHostCatalogReconciliationSourceResult, IAgentHostCatalogReconciliationOptions } from './agentHostCatalogReconciliationService.js';
import { IAgentHostStorageService } from './agentHostStorageService.js';
import { AgentHostCatalogListReader, type AgentHostCatalogListManyResult } from './agentHostCatalogListReader.js';
import { AgentHostSessionsV2CandidateResolution, AgentHostSessionsV2MigrationService, IAgentHostSessionsV2Candidate, type IAgentHostSessionsV2MigrationReport } from './agentHostSessionsV2MigrationService.js';

import { detachedWorktreeRecordUri, getPullRequestSessionBranchName, IAgentHostWorktreeIsolation, type IWorktreeHandOver, WORKTREE_META_REPOSITORY_ROOT, worktreeProjectFromRepositoryRoot } from './shared/worktreeIsolation.js';
import { IAgentHostProviderService } from './agentHostProviderService.js';
import { findMcpServerName } from './shared/mcpCustomizationController.js';
import type { IAgentHostSessionLifecycleCandidate } from './agentHostSessionLifecycle.js';
import { IAgentHostCheckpointService } from '../common/agentHostCheckpointService.js';
import { IAgentHostReviewService } from '../common/agentHostReviewService.js';
import { AgentHostChangesetCoordinator } from './agentHostChangesetCoordinator.js';
import { IAgentHostCompletions } from './agentHostCompletions.js';
import { AgentHostSkillCompletionProvider } from './agentHostSkillCompletionProvider.js';
import { SessionServerToolName } from '../common/serverToolNames.js';
import { ICopilotApiService } from './shared/copilotApiService.js';
import { INetworkDiagnosticsService } from './networkDiagnosticsService.js';
import { toAgentClientUri } from '../common/agentClientUri.js';
import { AgentHostClientType } from '../common/agentHostClientInfo.js';
import { IAgentHostClientConnectionService } from './agentHostClientConnectionService.js';
import { IAgentHostTurnTracker } from './agentHostTurnTracker.js';
import { resolveLastNonLocalTurnId } from '../common/agentHostConversationContext.js';
import { AgentHostLaunchKind, createUnknownAgentHostClientTelemetryContext, type IAgentHostClientTelemetryContext, type IAgentHostSessionSubscribeTelemetryContext } from '../common/agentHostTelemetry.js';
import { IAgentHostGitHubEndpointService } from './agentHostGitHubEndpointService.js';
import { AgentMergeController, type IAgentMergeControllerOptions } from './agentMergeController.js';
import { AgentHostChatMovability, chatSubtree } from './agentHostChatMovability.js';
import { AgentMergeConfigKey, agentMergeRootConfigSchema, getNonMergeSessionConfigValues, isAnyAgentMergeEnabled, mergeClientAgentMergeFolders, readAgentMergeChatInjectedConfigurations, readAgentMergeInjectedConfiguration, withoutAgentMergeElevation, readAgentMergeFolderStates } from '../common/agentMerge.js';
import { readChatSandboxState, withChatSandboxState } from '../common/meta/agentSandboxStateMeta.js';
import { AgentChatMoveRefusal, AgentChatMoveRefusedError, ChatMoveConfigKey, chatMoveRootConfigSchema, type AgentChatMoveDestination } from '../common/agentHostChatMove.js';
import { AgentSystemNotificationKind, toAgentSystemNotificationMeta } from '../common/meta/agentSystemNotificationMeta.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { IAgentHostStartupPerformance, type IAgentHostStartupMetrics, type IAgentHostStartupTiming } from './agentHostStartupPerformance.js';
import { IAgentHostOTelService } from '../common/otel/agentHostOTelService.js';
import { AgentHostAuthenticationService, SESSION_CREDENTIAL_PRINCIPAL_KEY } from './agentHostAuthenticationService.js';
import { updateAgentHostTelemetryLevelFromConfig } from './agentHostTelemetryService.js';
import type { IAgentHostCopilotSkuClassification, IAgentHostCopilotSkuTelemetry } from './agentHostTelemetryReporter.js';
import { AgentHostArtifactToolsConfigKey, AgentHostCanvasesEnabledConfigKey, AgentHostEditTelemetryEnabledConfigKey, AgentHostExternalSessionsMode, AgentHostMigrateLegacyCopilotCliEnabledConfigKey, AgentHostShowExternalSessionsConfigKey, platformRootSchema } from '../common/agentHostSchema.js';
import { supersedeTitleGenerationStrategyForLegacyUpdate } from '../common/titleGenerationConfiguration.js';
import { IAgentHostChangesetService, CHANGES_SUMMARY_METADATA_KEYS, getChatChangesSummaryMetadataKey, META_CHANGES_SUMMARY } from '../common/agentHostChangesetService.js';
import { GIT_DB_METADATA_KEYS, IAgentHostGitStateService, META_GIT_DATA_STATE, META_GIT_STATE, META_GITHUB_DATA_STATE, META_GITHUB_STATE, META_SOURCE_CONTROL_STATE } from '../common/agentHostGitStateService.js';
import { IAgentHostChangesetOperationService } from '../common/agentHostChangesetOperationService.js';
import { AgentHostCatalogSourceResolver, CHAT_BACKING_METADATA_KEY, chatCatalogV2ToCatalogChats, fromCatalogChatOrigin, isAgentHostChatBacking } from './agentHostCatalogSourceResolver.js';
import { AgentHostPeerChatStore, CHAT_PROVIDER_DATA_METADATA_KEY, CHAT_WORKING_DIRECTORIES_METADATA_KEY, IAgentHostPeerChatPersistenceService, IPersistedPeerChat, type IOlderBuildEditsImport } from './agentHostPeerChatStore.js';
import { chatCatalogAwaitsReprojection, migrateChatCatalogV2 } from './agentHostChatCatalogMigration.js';
import { IAgentHostChatContributions } from '../common/agentHostChatContributionsService.js';
import { IAgentHostTurnService, type IDeferredAgentHostTurn } from './agentHostTurnService.js';

/**
 * Grace period before an empty, unsubscribed session is garbage-collected
 * via {@link AgentService._runSessionGc}. Gives a disconnected client time
 * to reconnect (or a workspace switch to settle) before we tear down the
 * provider-side session, worktree, and on-disk state.
 */
/**
 * Whether a moved chat whose pre-move attachments are copied into its own storage (Block 4b) stops keeping its origin's
 * attachments. Off (decision B): provider-native tools still read the original paths, so the origin keeps them while
 * any moved chat lives; the copy protects them from deletions by older builds.
 */
const RELEASE_COPIED_ATTACHMENT_ORIGINS = false;

/**
 * How a session is loaded: in full, as when it is opened, or only its data, for a chat move (C15). A load for a move
 * reads what a full restore reads into the session's state except its default chat's conversation, and starts nothing
 * of its agent: no SDK session, MCP server, plugin client, changeset or server tool.
 */
type SessionLoad = { readonly kind: 'full' } | { readonly kind: 'dataForMove'; readonly registration: IRegisteredSession };

/** A session whose data can't be loaded without starting its agent: a move restores it in full instead (C15). */
class SessionDataUnavailableError extends Error {
	constructor(session: string, reason: string) {
		super(`The data of ${session} can't be loaded for a move: ${reason}`);
	}
}

/** A chat that can't be opened from the session state its owner has now: none recorded, or loaded for a move only (C15). */
class RestoredPeerChatUnavailableError extends Error {
	constructor(chat: string, reason: string) {
		super(`The chat ${chat} can't be opened: ${reason}`);
	}
}
const SESSION_GC_GRACE_MS = 30_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const EXTERNAL_SESSION_MAX_AGE_MS = 30 * DAY_MS;
const RECENT_EXTERNAL_SESSION_LIMIT = 2;

/**
 * The scratch folders a session publishes (`vscode.scratchFolders`): the primary folder of a workspace-less session
 * (its own scratch folder, the provider's workspace-less directory) and every recorded scratch folder among its and its chats' folders.
 */
function publishedScratchFolders(isRecordedScratchFolder: (folder: string) => boolean, workspaceless: boolean, folders: readonly string[], chatFolders: readonly string[]): string[] {
	const scratch: string[] = [];
	const collect = (folder: string, isScratch: boolean) => {
		if (isScratch && !scratch.includes(folder)) {
			scratch.push(folder);
		}
	};
	folders.forEach((folder, index) => collect(folder, (workspaceless && index === 0) || isRecordedScratchFolder(folder)));
	chatFolders.forEach(folder => collect(folder, isRecordedScratchFolder(folder)));
	return scratch;
}
/** `folder` or its nearest ancestor that `isScratchFolder` accepts, checked from `folder` up to its root. */
function findScratchFolderOrAncestor(folder: URI, isScratchFolder: (candidate: string) => boolean): URI | undefined {
	let candidate = folder;
	while (!isScratchFolder(candidate.toString())) {
		const parent = resourcesDirname(candidate);
		if (isEqual(parent, candidate)) {
			return undefined;
		}
		candidate = parent;
	}
	return candidate;
}

/** How a folder is named in messages: its file system path for a local folder, else its URI. */
function folderLabel(folder: URI): string {
	return folder.scheme === Schemas.file ? folder.fsPath : folder.toString();
}

const RECENT_LOCAL_SESSION_UPDATE_LIMIT = 2;
/** A scratch folder allocated for a chat being created: kept by `commit`, removed by `abort`. */
interface IAllocatedScratchFolder {
	readonly folder: URI;
	/** Called once the chat is published; a failure is only logged: the clean-up pass promotes the row of a chat that lists the folder. */
	commit(): Promise<void>;
	/** Called when the chat was not published. */
	abort(): Promise<void>;
}

/** The storage a peer chat's deletion removes (its own and its private descendants') and the session's other chats keep. */
interface IPeerChatDeletionStorage {
	readonly chat: string;
	readonly descendants: readonly { readonly chat: URI; readonly storage: string }[];
	readonly others: readonly string[];
	/** The sessions the chat and its descendants were created in, when they moved out of them (Block 4). */
	readonly movedFrom: readonly string[];
}

/** A move request {@link AgentService} accepted before preparing any catalog, with what its kind needs. */
type IChatMoveRequest =
	| { readonly kind: 'reorder' | 'move'; readonly destination: Extract<AgentChatMoveDestination, { readonly kind: 'session' }> }
	| { readonly kind: 'promote'; readonly provider: IAgent };

/** What a chat move validates against and plans its worktrees by (see `_readChatMoveInputs`). */
interface IChatMoveInputs {
	/** The chat and its host-managed descendants. */
	readonly moved: readonly string[];
	/** The chat's entry in its source's catalog. */
	readonly sourceSummary: ChatSummary | undefined;
	/** The folders the chat works in. */
	readonly chatFolders: readonly string[];
	/** The folders the chat and its moved descendants work in. */
	readonly subtreeFolders: readonly string[];
	readonly sourceWorktrees: ISessionWorktreeRecords;
	readonly targetPrimaryWorktree: string | undefined;
}

/** How often a move stages and converts a new session's chat catalog while concurrent writes dirty it (see `_normalizeCatalogForMove`). */
const CHAT_MOVE_CONVERSION_ATTEMPTS = 3;
/** Deferrals in a row, waiting for a session's re-projection, after which a chat catalog conversion is reported at warn. */
const CATALOG_MIGRATION_REPROJECTION_WARN_ATTEMPTS = 5;
const RECENT_LOCAL_SESSION_UPDATES_STORAGE_KEY = 'recentLocalSessionUpdates';
/** A catalog pass slower than this is logged at info, since it delays every session-list refresh. */
const SLOW_LIST_SESSIONS_THRESHOLD_MS = 1_000;


/** A recent update to one local Agent Host session. */
/**
 * Storage resources a normalized catalog snapshot records for its chats. A
 * normalized row without a storage resource is a legacy source that recorded
 * none, so its chat falls back to the creation-time rule.
 */
function recordedChatStorage(snapshot: IAgentHostDatabaseCatalogSnapshotEntry | undefined, logService: ILogService): ReadonlyMap<string, string> {
	const storage = new Map<string, string>();
	if (snapshot?.authorityVersion === 2) {
		for (const chat of snapshot.chats) {
			if (chat.storageResource !== undefined) {
				storage.set(chat.chat, chat.storageResource);
			} else {
				logService.trace(`[AgentService] Normalized chat ${chat.chat} has no recorded storage; using the creation-time rule`);
			}
		}
	}
	return storage;
}

/** What deleting a peer chat removes and keeps. */
interface IRecentLocalSessionUpdate {
	readonly session: string;
	readonly modifiedTime: number;
}

interface IListVisibleCatalogSource {
	readonly summary: SessionSummary;
	readonly state: ISessionWithDefaultChat;
}

interface IBackgroundCatalogStateWrite {
	promise: Promise<void>;
	trailing: boolean;
	trailingOverrides: Record<string, string>;
	trailingSource: IListVisibleCatalogSource | undefined;
}

interface IPassiveSessionMetadataUpdate {
	readonly kind: 'session';
	readonly key: string;
	readonly flag: SessionStatus;
	readonly set: boolean;
	readonly requestedSet: boolean;
}

/** A chat's read or archived state, applied to the catalog before any session read aggregate in the same batch. */
interface IPassiveChatFlagUpdate {
	readonly kind: 'chat';
	readonly key: string;
	readonly chat: string;
	readonly field: 'isRead' | 'archived';
	readonly set: boolean;
}

/** Detaches an archived chat's folders from the persisted session workspace, after the chat flags of the same batch. */
interface IPassiveChatFolderDetachUpdate {
	readonly kind: 'detachFolders';
	readonly key: string;
	readonly chat: string;
}

type PassiveCatalogMetadataUpdate = IPassiveSessionMetadataUpdate | IPassiveChatFlagUpdate | IPassiveChatFolderDetachUpdate;

interface IBackgroundPassiveSessionMetadataWrite {
	promise: Promise<void>;
	pending: Map<string, PassiveCatalogMetadataUpdate>;
}

const PASSIVE_METADATA_SHUTDOWN_REPLAY_TIMEOUT_MS = 250;

const UNMANAGEABLE_CHAT_ARCHIVE_REJECTION = 'Only a known independently manageable non-default chat can be archived.';

interface ISessionListComputation {
	epoch: number;
	readonly promise: Promise<readonly IAgentSessionMetadata[]>;
	trailing?: Promise<readonly IAgentSessionMetadata[]>;
}

interface IDiscoveryRegistrationObservation {
	outcome: 'success' | 'partial';
	readonly metrics?: Required<Pick<IAgentHostStartupMetrics, 'candidateSessionCount' | 'externalSessionCount' | 'registeredSessionCount' | 'filteredSessionCount' | 'failedSessionCount' | 'incompleteSessionCount'>>;
}

type AgentHostLegacyMigrationEvent = IAgentHostCopilotSkuTelemetry & {
	provider: string;
	outcome: 'migrated' | 'skipped' | 'failed' | 'declined';
	migrationSessionId: string;
	stage: 'adoption' | 'eligibility' | 'registration' | 'restore' | 'annotations' | 'complete';
	diagnosticCategory: 'notApplicable' | 'expectedExclusion' | 'configurationDisabled' | 'needsInvestigation' | 'unknown';
	advertisedAsAdoptable: boolean;
	eligible: boolean | undefined;
	markerStatus: NonNullable<IAgentChatAdoptionResult['diagnostics']>['markerStatus'] | 'notEvaluated' | 'notReported';
	provenance: NonNullable<IAgentChatAdoptionResult['diagnostics']>['provenance'] | 'notEvaluated';
	diagnosticDetail: 'settingDisabled' | 'invalidSessionId' | 'storageProbeFailed' | 'storageLayoutInvalid' | 'sessionStateRootMissing' | 'sessionDirectoryMissing' | 'markerMissingNonExtensionHostClient' | 'markerMissingWithEvents' | 'markerMissingWithoutEvents' | 'markerMissing' | 'markerReadError' | 'markerInvalid' | 'originUnrecognized' | 'originInvalidType' | 'originMissing' | 'externalOrigin' | 'legacyMarker' | 'legacyEligible' | 'adoptionThrew' | 'providerEvidenceUnavailable';
	markerOrigin: NonNullable<IAgentChatAdoptionResult['diagnostics']>['markerOrigin'] | 'notReported';
	sessionIdStatus: NonNullable<IAgentChatAdoptionResult['diagnostics']>['sessionIdStatus'] | 'notReported';
	copilotHomeSource: NonNullable<IAgentChatAdoptionResult['diagnostics']>['copilotHomeSource'] | 'notReported';
	sessionStateRootStatus: NonNullable<IAgentChatAdoptionResult['diagnostics']>['sessionStateRootStatus'] | 'notReported';
	sessionDirectoryStatus: NonNullable<IAgentChatAdoptionResult['diagnostics']>['sessionDirectoryStatus'] | 'notReported';
	eventsFileStatus: NonNullable<IAgentChatAdoptionResult['diagnostics']>['eventsFileStatus'] | 'notReported';
	workspaceMetadataStatus: NonNullable<IAgentChatAdoptionResult['diagnostics']>['workspaceMetadataStatus'] | 'notReported';
	lastKnownClient: NonNullable<IAgentChatAdoptionResult['diagnostics']>['lastKnownClient'] | 'notReported';
	markerFromCache: boolean | undefined;
	eligibilityErrorCode: string | undefined;
	eligibilityErrorMessage: string | undefined;
	errorCode: string | undefined;
	success: boolean;
	turnCount: number;
	durationMs: number;
	hasProject: boolean;
	hasWorktree: boolean;
	workingDirectoryCount: number;
	errorMessage: string | undefined;
	reason: string;
};

type AgentHostLegacyMigrationClassification = IAgentHostCopilotSkuClassification & {
	provider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The agent provider id whose legacy session was migrated (e.g. copilotcli).' };
	outcome: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Migration outcome: migrated, skipped (eligible but not adopted), declined (unregistered and not adoptable), or failed (adoption or restore threw).' };
	migrationSessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'SHA-1 of the backend session URI, shared with client probe/open diagnostics; identifies a session, not an individual retry.' };
	stage: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The migration stage reached: adoption, eligibility, registration, restore, annotations, or complete.' };
	diagnosticCategory: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Conservative triage: expectedExclusion covers positive external provenance, absent on-disk session directory or default storage root, or a known non-extension-host client in workspace metadata without a conflicting adoptable advertisement; needsInvestigation does not assert a code defect; missing evidence remains unknown.' };
	advertisedAsAdoptable: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the host advertised this session as adoptable before attempting adoption.' };
	eligible: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Provider eligibility decision; absent if adoption was not attempted or threw before returning.' };
	markerStatus: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the marker was valid, missing, invalid, unreadable, not evaluated, or not reported by the provider.' };
	provenance: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Legacy from marker or positive provider eligibility, explicitly external, unknown, or not evaluated. No raw origin value is collected.' };
	diagnosticDetail: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Code-defined diagnostic explanation distinguishing absent storage, invalid identifiers, ambiguous markers, and absent provider evidence; not a root-cause verdict.' };
	markerOrigin: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Bounded marker origin: vscode, other, missing, unrecognized, invalidType, unavailable, or notReported.' };
	sessionIdStatus: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Identifier shape only: opaque, empty, controlCharacters, pathSeparators, dotSegment, or notReported. No identifier is collected.' };
	copilotHomeSource: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the Copilot home came from environment or userHome, or was notReported. No path is collected.' };
	sessionStateRootStatus: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Storage root stat result: directory, file, other, missing, readError, notChecked, or notReported.' };
	sessionDirectoryStatus: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Session directory stat result: directory, file, other, missing, readError, notChecked, or notReported.' };
	eventsFileStatus: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Session events file stat result: directory, file, other, missing, readError, notChecked, or notReported. No content is read.' };
	workspaceMetadataStatus: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Bounded workspace metadata read: valid, missing, invalid, readError, tooLarge, notFile, notChecked, or notReported. No file content is collected.' };
	lastKnownClient: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Allowlisted persisted runtime client: vscode, vscode-agent-host, github-cli, github-autopilot, missing, unrecognized, invalidType, unavailable, or notReported. Can change on resume; not creator provenance.' };
	markerFromCache: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the marker evidence came from the in-memory cache rather than a fresh disk read.' };
	eligibilityErrorCode: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'Error code from reading the eligibility marker, separate from any later restore failure.' };
	eligibilityErrorMessage: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'Error reading the eligibility marker, cleaned by the telemetry service. Marker contents are never collected.' };
	errorCode: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'Exception or protocol error code when migration failed.' };
	success: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the migration completed with at least one restored turn.' };
	turnCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of turns restored from the migrated session.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time in milliseconds to adopt and restore the legacy session.' };
	hasProject: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the migrated session resolved to a project/repository.' };
	hasWorktree: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the migrated session ran in a pre-existing git worktree that was bridged during adoption.' };
	workingDirectoryCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of working directories associated with the migrated session.' };
	errorMessage: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'Error message when the migration failed; absent for migrated/skipped outcomes.' };
	reason: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Provider adoption reason (including markerUnavailable), settingDisabled for a frozen-off host, or unknown. This is separate from the stage and exception that may fail after adoption.' };
	owner: 'vijayupadya';
	comment: 'Tracks one-time adopt-on-open migration of legacy extension-host Copilot CLI sessions into the agent host to measure attempt, success, failure, and skipped rates.';
};

type AgentHostCatalogBulkReadFailureEvent = {
	errorMessage: string;
	requestedRowCount: number;
	recoveredRowCount: number;
	failedRowCount: number;
	fallbackDurationMs: number;
};

type AgentHostCatalogBulkReadFailureClassification = {
	errorMessage: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'The error reported by the failed bulk sessions_v2 catalog read.' };
	requestedRowCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of registered catalog rows requested when the bulk read failed.' };
	recoveredRowCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of requested rows recovered by bounded individual catalog reads.' };
	failedRowCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of bounded individual catalog reads that also failed.' };
	fallbackDurationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time in milliseconds spent on bounded individual catalog reads after the bulk read failed.' };
	owner: 'sandy081';
	comment: 'Measures failures of the Agent Host bulk session catalog read and the effectiveness and cost of bounded row-level recovery.';
};

/**
 * The GitHub state of a session created from a pull request
 * ({@link SessionConfigKey.PullRequestUrl}): the pull request is associated with
 * the session from the start, on the session branch its worktree checks out.
 */
function getPullRequestSessionGitHubState(session: URI, config: Record<string, unknown> | undefined): ISessionGitHubState | undefined {
	const pullRequestUrl = getSessionPullRequestUrl(config);
	const pullRequest = pullRequestUrl ? parsePullRequestUrl(pullRequestUrl) : undefined;
	if (!pullRequestUrl || !pullRequest) {
		return undefined;
	}
	const branchPrefix = config?.[SessionConfigKey.WorktreeBranchPrefix];
	const branchName = getPullRequestSessionBranchName(pullRequest.number, AgentSession.id(session), typeof branchPrefix === 'string' ? branchPrefix : undefined);
	return { owner: pullRequest.owner, repo: pullRequest.repo, ...withMostRecentRelatedSessionPullRequest(undefined, pullRequestUrl, branchName) };
}

const HOST_OWNED_SESSION_CONFIG_KEYS = [
	SessionConfigKey.AgentMerge,
	SessionConfigKey.AgentMergeController,
	SessionConfigKey.AgentMergeFolders,
	SessionConfigKey.AgentMergeControllerFolders,
	SessionConfigKey.AgentMergeInjectedConfiguration,
	SessionConfigKey.AgentMergeChatInjectedConfiguration,
	SessionConfigKey.Isolation,
	SessionConfigKey.Branch,
	SessionConfigKey.WorktreeBranchPrefix,
	SessionConfigKey.WorktreeIncludeFiles,
	SessionConfigKey.WorktreeSymlinkFolders,
	SessionConfigKey.PullRequestUrl,
] as const;

/** Host-derived authorization state and runtime reports that clients may never write. */
const HOST_WRITTEN_SESSION_CONFIG_KEYS = [
	SessionConfigKey.AgentMergeController,
	SessionConfigKey.AgentMergeControllerFolders,
	SessionConfigKey.AgentMergeInjectedConfiguration,
	agentModelConfigurationReportKey,
	SessionConfigKey.AgentMergeChatInjectedConfiguration,
] as const;

function omitHostOwnedSessionConfig<T>(config: Record<string, T>): Record<string, T> {
	const result = { ...config };
	for (const key of HOST_OWNED_SESSION_CONFIG_KEYS) {
		delete result[key];
	}
	return result;
}

function parsePersistedSourceControlState(value: string): ISessionSourceControlState {
	const state = readSessionSourceControlState({
		[SESSION_META_SOURCE_CONTROL_KEY]: JSON.parse(value),
	});
	if (!state) {
		throw new Error('Invalid persisted source-control state');
	}
	return state;
}

/**
 * Returns `meta` with the GitHub state of each session folder persisted in the
 * session database, migrating the original single-folder state (persisted, or
 * already in `meta`) to the session folder. Entries that fail to parse are
 * reported to `onError` and skipped.
 */
function withPersistedGitHubData(meta: SessionSummaryMeta | undefined, persisted: Readonly<Record<string, string | undefined>>, sessionWorkingDirectory: string | undefined, onError: (error: unknown) => void): SessionSummaryMeta | undefined {
	let next = meta;
	const persistedGitHubData = persisted[META_GITHUB_DATA_STATE];
	if (persistedGitHubData) {
		try {
			const folders = parseSessionGitHubData(JSON.parse(persistedGitHubData));
			if (folders.size > 0) {
				next = { ...next, [SESSION_META_GITHUB_DATA_KEY]: Object.fromEntries(new Map([...readSessionGitHubData(next), ...folders])) };
			}
		} catch (error) {
			onError(error);
		}
	}
	let legacyState = readSessionGitHubStateInput(next);
	const persistedLegacyState = persisted[META_GITHUB_STATE];
	if (persistedLegacyState) {
		try {
			legacyState = parseSessionGitHubState(JSON.parse(persistedLegacyState)) ?? legacyState;
		} catch (error) {
			onError(error);
		}
	}
	return withMigratedSessionGitHubState(next, sessionWorkingDirectory, legacyState);
}

/**
 * Grace period before an idle resource watch is torn down after its last
 * subscriber unsubscribes (mirrors {@link SESSION_GC_GRACE_MS}). Within
 * this window, a re-subscribe (or reconnect) reuses the still-running
 * {@link IFileService} watcher so transient drop-outs don't miss change
 * events. Resource watch action envelopes flow through the normal
 * envelope replay buffer for the same reason.
 */
const RESOURCE_WATCH_GRACE_MS = 30_000;

/** Bound on how long {@link AgentService.subscribe} waits for a pending subagent chat to register before giving up. */
const SUBAGENT_CHAT_PENDING_TIMEOUT_MS = 15_000;

const ANNOTATIONS_METADATA_KEY = 'annotations';

function annotationsWriteKey(storage: { readonly session: URI; readonly key: string }): string {
	return `${storage.session.toString()}\n${storage.key}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isRecentLocalSessionUpdate(value: unknown): value is IRecentLocalSessionUpdate {
	return isRecord(value)
		&& typeof value.session === 'string'
		&& Number.isFinite(value.modifiedTime);
}

function isPersistedAnnotationEntry(value: unknown): value is AnnotationEntry {
	if (!isRecord(value) || typeof value.id !== 'string') {
		return false;
	}
	return typeof value.text === 'string'
		|| (isRecord(value.text) && typeof value.text.markdown === 'string');
}

function isPersistedAnnotationOrigin(value: unknown): value is AnnotationOrigin {
	return isRecord(value)
		&& typeof value.session === 'string'
		&& (value.chat === undefined || typeof value.chat === 'string')
		&& (value.turnId === undefined || typeof value.turnId === 'string');
}

function isPersistedTextRange(value: unknown): value is TextRange {
	return isRecord(value)
		&& isRecord(value.start) && typeof value.start.line === 'number' && typeof value.start.character === 'number'
		&& isRecord(value.end) && typeof value.end.line === 'number' && typeof value.end.character === 'number';
}

/**
 * Reads one persisted annotation, migrating the pre-`origin` shape. Releases
 * before the annotation origin recorded a top-level `turnId` and no owning
 * session, so the session that is being restored supplies the origin.
 */
function readPersistedAnnotation(value: unknown, session: string): Annotation | undefined {
	if (!isRecord(value)
		|| typeof value.id !== 'string'
		|| typeof value.resource !== 'string'
		|| typeof value.resolved !== 'boolean'
		|| !Array.isArray(value.entries)
		|| value.entries.length === 0
		|| !value.entries.every(isPersistedAnnotationEntry)) {
		return undefined;
	}
	let origin: AnnotationOrigin;
	if (isPersistedAnnotationOrigin(value.origin)) {
		origin = value.origin;
	} else if (value.origin === undefined) {
		origin = { session, ...(typeof value.turnId === 'string' && value.turnId ? { turnId: value.turnId } : {}) };
	} else {
		return undefined;
	}
	const annotation: Annotation = {
		id: value.id,
		origin,
		resource: value.resource,
		resolved: value.resolved,
		entries: value.entries,
	};
	if (isPersistedTextRange(value.range)) {
		annotation.range = value.range;
	}
	if (isRecord(value._meta)) {
		annotation._meta = value._meta;
	}
	return annotation;
}

/**
 * Reads a persisted annotations state, migrating any legacy annotation into the
 * current shape. Returns `undefined` when the payload is not a valid state.
 */
function readPersistedAnnotationsState(value: unknown, session: string): AnnotationsState | undefined {
	if (!isRecord(value) || !Array.isArray(value.annotations)) {
		return undefined;
	}
	const annotations: Annotation[] = [];
	for (const entry of value.annotations) {
		const annotation = readPersistedAnnotation(entry, session);
		if (!annotation) {
			return undefined;
		}
		annotations.push(annotation);
	}
	return { annotations };
}

/** Opaque provider data for the session's default chat. */
const DEFAULT_CHAT_PROVIDER_DATA_METADATA_KEY = 'defaultChatProviderData';

interface ICatalogChat {
	readonly uri: string;
	readonly kind: 'default' | 'peer';
	readonly title?: string;
	readonly origin?: ChatOrigin;
	readonly interactivity?: ChatInteractivity;
	readonly archived?: boolean;
	readonly isRead?: boolean;
	readonly inheritedTurnId?: string;
	readonly workingDirectories?: readonly string[];
	readonly changes?: ChangesSummary;
}

interface ILegacyRegisteredSessionMetadata {
	readonly metadata: IAgentSessionMetadata;
	readonly persistedTitle?: string;
}

/**
 * Tracks one provider's in-flight external-chat discovery attempt. `promise` is
 * reassigned in place when a `force` request is chained onto an attempt that
 * is already running, so
 * callers that captured an earlier reference to the same `IProviderDiscoveryState`
 * still observe the chained, forced re-run.
 */
interface IProviderDiscoveryState {
	promise: Promise<void>;
	forceQueued: boolean;
}

class ProviderCatalogUnavailableError extends Error {
	constructor(readonly provider: AgentProvider) {
		super(`Provider ${provider} cannot enumerate its native session catalog yet`);
		this.name = 'ProviderCatalogUnavailableError';
	}
}

class SubagentTranscriptUnavailableError extends Error {
	constructor(chat: string) {
		super(`Subagent transcript is not available yet: ${chat}`);
		this.name = 'SubagentTranscriptUnavailableError';
	}
}

/**
 * Reconcile a session's working-directory set from a create-result /
 * materialization receipt. The resolved receipt is authoritative for the roots
 * it reports (index 0 = the resolved process root, e.g. a worktree); any
 * additional requested/current roots *beyond* the resolved set's length are
 * preserved. This is what lets a receipt that reports only the process root —
 * the resume path reads a single cwd from disk — keep the rest of the known set
 * instead of collapsing `[A, B, C]` to `[dir]`, while a receipt that carries the
 * full resolved set (the send/create path) is trusted verbatim (including a
 * remapped tail). A missing resolved set keeps the requested value as-is,
 * preserving the `undefined` (workspace-less / inherit) vs `[]` (explicitly none)
 * distinction.
 *
 * Returns the protocol form (`string[]`), since protocol URIs are strings.
 */
/**
 * Adds the folders chats still use to a restored session's working
 * directories, which must contain every chat folder. Providers only remember
 * the folders a session started with, not those added later for a chat.
 */
function withChatWorkingDirectories(sessionWorkingDirectories: readonly string[] | undefined, chats: readonly ICatalogChat[] | undefined): string[] | undefined {
	if (!sessionWorkingDirectories?.length) {
		return sessionWorkingDirectories?.slice();
	}
	const result = [...sessionWorkingDirectories];
	const keys = new Set(result.map(getWorkingDirectoryKey));
	// Archived chats are detached from the session workspace until they are unarchived.
	for (const directory of chats?.flatMap(chat => chat.archived ? [] : chat.workingDirectories ?? []) ?? []) {
		const key = getWorkingDirectoryKey(directory);
		if (!keys.has(key)) {
			keys.add(key);
			result.push(directory);
		}
	}
	return result;
}

function withPublishedWorkingDirectoryIdentities(meta: SessionSummaryMeta | undefined, workingDirectories: readonly string[] | undefined, chats: readonly { readonly workingDirectories?: readonly string[] }[] | undefined): SessionSummaryMeta | undefined {
	let next = meta;
	const publishScope = (scope: readonly string[] | undefined) => {
		if (!scope?.length) {
			return;
		}
		next = withWorkingDirectoryScopeId(next, scope);
		for (const directory of scope) {
			next = withWorkingDirectoryKey(next, directory);
		}
	};
	publishScope(workingDirectories);
	for (const chat of chats ?? []) {
		publishScope(chat.workingDirectories);
	}
	return next;
}

function reconcileWorkingDirectories(requested: readonly URI[] | undefined, resolved: readonly URI[] | undefined): string[] | undefined {
	if (resolved === undefined) {
		return requested?.map(d => d.toString());
	}
	const tail = (requested ?? []).slice(resolved.length);
	return [...resolved, ...tail].map(d => d.toString());
}

export interface IAgentServiceOptions {
	readonly rootConfigResource?: URI;
	readonly copilotApiService?: ICopilotApiService;
	readonly providerConfigurations?: readonly IAgentCustomizationSettingsRegistration[];
	readonly hostLaunchKind?: AgentHostLaunchKind;
	readonly storageResource?: URI;
	readonly orchestratorDatabase?: IAgentHostDatabase;
	readonly debugLogsEnvironment?: IAgentHostDebugLogsEnvironment;
	readonly sessionResidencyLimit?: number;
	readonly sessionReleaseRetryMs?: number;
	readonly catalogReconciliationOptions?: IAgentHostCatalogReconciliationOptions;
}

export interface IAgentServiceCallbacks {
	readonly canEvictChangeset: (changeset: string) => boolean;
	readonly startAgentMergeTurn: IAgentMergeControllerOptions['startTurn'];
	readonly cancelAgentMergeTurn: IAgentMergeControllerOptions['cancelTurn'];
	readonly postAgentMergeNotice: IAgentMergeControllerOptions['postNotice'];
	readonly resolveWorkingDirectoryBeforeSend: NonNullable<IAgentSideEffectsOptions['resolveWorkingDirectoryBeforeSend']>;
	readonly resolveChatAttachmentTurns: NonNullable<IAgentSideEffectsOptions['resolveChatAttachmentTurns']>;
	readonly sessionServerToolAccessor: IAgentServiceSessionServerToolAccessor;
	readonly artifactServerToolAccessor: IArtifactServerToolAccessor;
	/** Writes list-visible session metadata through the `sessions_v2` catalog and awaits the sync receipt. */
	readonly persistListVisibleSessionState: (session: string, values: Readonly<Record<string, string>>) => Promise<void>;
	/** Queues a background `sessions_v2` catalog sync for the session, optionally with metadata overrides. */
	readonly queueCatalogSync: (session: string, values: Readonly<Record<string, string>>) => void;
	readonly persistMetadata: (resource: string, values: Readonly<Record<string, string>>) => Promise<void>;
	readonly readNormalizedChat: IAgentHostPeerChatPersistenceService['readNormalizedChat'];
	/** Durably records a generated title for an unloaded surfaced session and schedules its central projection. */
	readonly persistSurfacedSessionTitle: (session: string, title: string) => Promise<void>;
}

export interface IAgentServiceCallbackBinder {
	bind(callbacks: IAgentServiceCallbacks): void;
}

export interface IAgentServiceCollaborators {
	readonly gitHubEndpointService: IAgentHostGitHubEndpointService;
	readonly gitStateService: IAgentHostGitStateService;
	readonly agentMergeController: AgentMergeController;
	readonly checkpointService: IAgentHostCheckpointService;
	readonly changesetOperationService: IAgentHostChangesetOperationService;
	readonly reviewService: IAgentHostReviewService;
	readonly changesets: IAgentHostChangesetService;
	readonly changesetCoordinator: AgentHostChangesetCoordinator;
	readonly completions: IAgentHostCompletions;
	readonly terminalManager: IAgentHostTerminalManager;
	readonly localTurns: AgentHostLocalTurns;
	readonly sideEffects: AgentSideEffects;
	readonly serverToolHost: AgentServerToolHost;
}

/** Core services that must exist before {@link AgentService} can be constructed. */
export interface IAgentServiceCore {
	readonly disposables: DisposableStore;
	readonly authenticationService: AgentHostAuthenticationService;
	readonly orchestratorDatabase: IAgentHostDatabase;
	readonly savedChats: AgentHostSavedChatService;
	readonly peerChatStore: AgentHostPeerChatStore;
	/** Shares worktrees between moved chats' sessions (Block 5); the peer chat store's older-build copy participant. */
	readonly worktreeCoOwnership: AgentHostWorktreeCoOwnership;
	readonly debugLogsCollector: AgentHostDebugLogsCollector | undefined;
	readonly sessionRegistry: AgentSessionRegistry;
	readonly stateManager: AgentHostStateManager;
	readonly configurationService: AgentConfigurationService;
	readonly callbackBinder: IAgentServiceCallbackBinder;
}

function findNonPtyTerminalContent(chat: ChatState, toolCallId: string, resource: URI): ToolResultTerminalContent | undefined {
	const turns = chat.activeTurn ? [...chat.turns, chat.activeTurn] : chat.turns;
	for (let turnIndex = turns.length - 1; turnIndex >= 0; turnIndex--) {
		const parts = turns[turnIndex].responseParts;
		for (let partIndex = parts.length - 1; partIndex >= 0; partIndex--) {
			const part = parts[partIndex];
			if (part.kind !== ResponsePartKind.ToolCall || part.toolCall.toolCallId !== toolCallId) {
				continue;
			}
			const content = part.toolCall.status === ToolCallStatus.Running
				|| part.toolCall.status === ToolCallStatus.PendingResultConfirmation
				|| part.toolCall.status === ToolCallStatus.Completed
				? part.toolCall.content
				: undefined;
			const terminal = content?.find((content): content is ToolResultTerminalContent => {
				if (content.type !== ToolResultContentType.Terminal || content.isPty !== false) {
					return false;
				}
				try {
					return isEqual(URI.parse(content.resource), resource);
				} catch {
					return false;
				}
			});
			if (terminal) {
				return terminal;
			}
		}
	}
	return undefined;
}

/** What a chat move committed: the chats in placement order, the target's resulting order and the moved chat's carried config. */
interface IMovedChats {
	readonly moved: readonly string[];
	readonly targetOrder: readonly string[];
	readonly config: Record<string, unknown>;
}

/**
 * The agent service implementation that runs inside the agent-host utility
 * process. Dispatches to registered {@link IAgent} instances based
 * on the provider identifier in the session configuration.
 */
export class AgentService extends Disposable implements IAgentService {
	declare readonly _serviceBrand: undefined;

	private readonly _chatCatalogMutationSequencer = new SequencerByKey<string>();
	/**
	 * Serializes read/archive metadata updates applied to an unloaded session
	 * without restoring it, so concurrent clients cannot publish a session read
	 * aggregate computed from stale chats. A restore drains it before reading.
	 */
	private readonly _passiveMetadataSequencer = new SequencerByKey<string>();
	private readonly _sessionCreationSequencer = new SequencerByKey<string>();
	private readonly _additionalWorktreeSequencer = new SequencerByKey<string>();
	private readonly _providerIdentityAdmissionSequencer = new SequencerByKey<AgentProvider>();

	/** Protocol: fires when state is mutated by an action. */
	private readonly _onDidAction = this._register(new Emitter<ActionEnvelope>());
	readonly onDidAction = this._onDidAction.event;

	/** Protocol: fires for ephemeral notifications (sessionAdded/Removed). */
	private readonly _onDidNotification = this._register(new Emitter<INotification>());
	readonly onDidNotification = this._onDidNotification.event;

	/** Protocol: fires for MCP server-originated notifications routed over `mcp://` channels. */
	readonly onMcpNotification: IAgentService['onMcpNotification'];
	/** Authoritative state manager for the sessions process protocol. */
	private readonly _stateManager: AgentHostStateManager;

	/**
	 * Orchestrator-owned durable index of known sessions. Populated alongside
	 * create/delete paths and, in Stage 1, exposed only for parity validation.
	 */
	private readonly _sessionRegistry: AgentSessionRegistry;
	private readonly _orchestratorDatabase: IAgentHostDatabase;

	/** Settles once the recorded scratch folders are known to the state manager, which per-chat workspace-less decisions read. */
	private readonly _scratchFoldersLoaded: Promise<void>;
	/** Settles once the startup release of orphaned scratch folders (see `_releaseOrphanedScratchFolders`) is done. */
	private _orphanedScratchFoldersReleased: Promise<void> = Promise.resolve();
	private readonly _savedChats: AgentHostSavedChatService;
	private readonly _catalogSyncService: AgentHostCatalogSyncService;
	/** Starts the runtime of new drafts before their first send, behind the prewarm experiment. */
	private readonly _sessionPrewarmer: AgentHostSessionPrewarmer;
	private readonly _catalogSourceResolver: AgentHostCatalogSourceResolver;
	private readonly _peerChatStore: AgentHostPeerChatStore;
	private readonly _worktreeCoOwnership: AgentHostWorktreeCoOwnership;
	private readonly _catalogReconciliationService: AgentHostCatalogReconciliationService;
	private readonly _catalogListReader: AgentHostCatalogListReader;
	private readonly _sessionsV2MigrationService: AgentHostSessionsV2MigrationService<IAgentSessionMetadata>;
	private readonly _catalogListRepair = this._register(new MutableDisposable<IDisposable>());
	private readonly _catalogSyncSuppressedSessions = new Set<string>();
	private readonly _deferredCatalogMetadataOverrides = new Map<string, Record<string, string>>();
	/** The latest annotations write per storage key, which a restore of the same annotations waits for. */
	private readonly _pendingAnnotationWrites = new Map<string, Promise<void>>();
	private readonly _backgroundCatalogStateWrites = new Map<string, IBackgroundCatalogStateWrite>();
	private readonly _backgroundPassiveSessionMetadataWrites = new Map<string, IBackgroundPassiveSessionMetadataWrite>();
	private readonly _pendingPassiveCatalogReplays = new Set<string>();
	private readonly _peerChatCleanupRepairs = this._register(new DisposableMap<string>());
	/** Serializes durable last-modified advances emitted by live session state. */
	private _sessionModifiedTimeWrites: Promise<void> = Promise.resolve();
	private readonly _recentLocalSessionUpdateSnapshot: readonly IRecentLocalSessionUpdate[];
	private _recentLocalSessionUpdates: readonly IRecentLocalSessionUpdate[];
	private readonly _externalReconciliationModifiedAt = new Map<string, string>();

	private readonly _providerMigrations = new Map<AgentProvider, IProviderDiscoveryState>();
	private readonly _initialProviderMigrations = new Map<AgentProvider, Promise<void>>();
	private readonly _providerDiscoveryRegistrations = new Map<AgentProvider, Promise<void>>();
	private readonly _deferredProviderMigrations = new Set<AgentProvider>();
	private readonly _readableProviderCatalogs = new Set<AgentProvider>();
	/**
	 * In-memory mirror of the durable provisional markers. Listing consults it
	 * after waiting for the initial marker load, so unloaded markers cannot
	 * expose provisional sessions.
	 */
	private readonly _provisionalSessionKeys = new Set<string>();
	private _provisionalSessionKeysLoaded: Promise<void> | undefined;
	private _movedChatOriginsLoaded: Promise<void> | undefined;
	/** Copies moved chats' pre-move attachments into their own storage (Block 4b). */
	private readonly _attachmentMigration: AgentHostAttachmentMigration;

	/**
	 * Backing-session URIs suppressed until `sessions_v2` acknowledges their
	 * backing state. This also suppresses backing sessions when the local
	 * marker cannot be persisted, so discovery never exposes them.
	 */
	private readonly _unpersistedChatBackings = new Set<string>();

	/**
	 * Sessions that have opted in to bring-up progress, keyed by provider id.
	 * A session is added here when its `createSession` carries a
	 * {@link IAgentCreateSessionConfig.progressToken} and removed once it
	 * materializes (the SDK is now resolved) or is disposed. The SDK download is
	 * host-level and shared across every session of a provider, so this only
	 * records *interest*: as long as one or more sessions of a provider is
	 * registered, {@link emitDownloadProgress} surfaces that provider's download as a single
	 * progress stream keyed by the download's own identity (the package id),
	 * rather than one stream per session.
	 */
	private readonly _downloadProgressInterest = new Map<AgentProvider, Set<string>>();
	/** AgentService-owned integrations installed for registered providers. */
	private readonly _providerSubscriptions = this._register(new DisposableMap<AgentProvider, DisposableStore>());
	private readonly _disposingPeerChats = new Set<string>();
	/** Chats {@link setChatWorkspace} is moving into a workspace: their first message waits until it settles. */
	private readonly _applyingChatWorkspaces = new Set<string>();
	/** Chats left without a provider backing by a failed workspace change: their next send creates it first. */
	private readonly _chatsNeedingBacking = new Set<string>();
	/** Folders reserved by chats being created or moved, by session (see {@link _reserveChatWorkingDirectories}). */
	private readonly _reservedChatWorkingDirectories = new Map<string, string[]>();
	/** Folders prepared for a chat that is not published yet, by session. */
	private readonly _preparedChatWorkingDirectories = new Map<string, { readonly directory: URI; readonly reservation: IDisposable }[]>();
	private readonly _chatMoveSequencer = new Sequencer();
	/** Sessions a chat move is changing; they stay resident until it ends. */
	private readonly _chatMoveSessions = new Set<string>();
	/** Loaded sessions a chat move uses, by the number of moves using them; they stay resident until those end. */
	private readonly _movePinnedSessions = new Map<string, number>();
	private readonly _chatMovability: AgentHostChatMovability;
	private readonly _defaultChatBackingWrites = new Map<string, Promise<void>>();
	private readonly _chatHistoryRefreshes = this._register(new ThrottlerByKey<string>());
	private readonly _chatWatches = this._register(new DisposableResourceMap());
	/** Owning session of each watched chat, recorded when the watch starts. */
	private readonly _chatWatchOwners = new ResourceMap<string>();
	/** External histories waiting for their chat's turn to end; delivered when its current owner goes idle (Block 4: the owner is read then). */
	private readonly _pendingChatHistories = new Map<string, { readonly provider: IAgent; readonly chat: URI; readonly turns: readonly Turn[] }>();
	private readonly _authService: AgentHostAuthenticationService;
	/** Shared side-effect handler for action dispatch and session lifecycle. */
	private readonly _sideEffects: AgentSideEffects;
	private readonly _agentMergeController: AgentMergeController;
	/** Owns static / per-turn changeset compute, publish, persist, restore. */
	private readonly _changesets: IAgentHostChangesetService;
	/** Shared active changeset subscription registry. */
	/** Owns changeset operation contributions and handler activation. */
	private readonly _changesetOperationService: IAgentHostChangesetOperationService;
	private readonly _reviewService: IAgentHostReviewService;
	/** Owns AgentService-side orchestration of the changeset feature. */
	private readonly _changesetCoordinator: AgentHostChangesetCoordinator;
	/** Owns session git-state probing and git-backed catalogue decoration. */
	private readonly _gitStateService: IAgentHostGitStateService;
	/** Manages PTY-backed terminals for the agent host protocol. */
	private readonly _terminalManager: IAgentHostTerminalManager;
	/** Persists host-injected `/rename` / `!command` turns for restore & fork/truncate. */
	private readonly _localTurns: AgentHostLocalTurns;
	/** Server-side host for the agent host's server tools. */
	private readonly _serverToolHost: AgentServerToolHost;
	private readonly _debugLogsCollector: AgentHostDebugLogsCollector | undefined;
	private readonly _configurationService: AgentConfigurationService;
	private readonly _automationService: AgentHostAutomationService;
	/** Captures baseline / per-turn git checkpoints backing the changeset pipeline. */
	private readonly _checkpointService: IAgentHostCheckpointService;
	/** Single source of truth for GitHub (Enterprise) endpoints and protected resources. */
	private readonly _gitHubEndpointService: IAgentHostGitHubEndpointService;
	/** Pluggable completion item providers (e.g. workspace file completions, agent-specific @-mentions). */
	private readonly _completions: IAgentHostCompletions;
	private _skillCompletionProviderRegistered = false;
	/**
	 * Authoritative server-side per-resource subscription refcount, keyed by
	 * resource URI string and valued by the set of subscribed protocol
	 * client IDs. Populated by {@link addSubscriber} after any in-flight release
	 * settles (or immediately for handshake fast-paths) and drained by
	 * {@link unsubscribe}. When a
	 * resource's set becomes empty, the resource is dropped from the map and
	 * session residency is reconciled against the MRU cap.
	 */
	private readonly _restoreSessionInFlight = new Map<string, Promise<void>>();
	private readonly _savedChatContinuations = new Map<string, Promise<IAgentHostSavedChatContinuationResult>>();
	private readonly _savedChatArchivePublications = new WeakSet<IIsArchivedChangedAction>();
	private readonly _restoreSubagentInFlight = new Map<string, Promise<void>>();
	private readonly _restoredSubagentAdmissionRetries = new Map<string, { run(): Promise<void>; cancel(): void; isCurrent(): boolean }>();
	private readonly _sessionResidency: AgentSessionResidency;

	/**
	 * Persisted-annotation reads in flight, keyed by session URI. Annotations
	 * snapshots are synthesized empty for any well-formed URI, so subscribers
	 * must await this rather than rely on session-state existence.
	 */
	private readonly _restoreAnnotationsInFlight = new Map<string, Promise<void>>();

	/** Subagent chats armed for a bounded wait (once execution is confirmed); resolved by {@link _onChatSpawned}, awaited by {@link subscribe}. */
	private readonly _pendingSubagentChats = new Map<string /* subagentChatUri */, DeferredPromise<void>>();
	private readonly _pendingSubagentChatTimeouts = this._register(new DisposableMap<string /* subagentChatUri */, IDisposable>());
	/** Subagent chats announced via `_meta.subagentChatUri` but still awaiting confirmation, keyed by `${channel}:${toolCallId}`. */
	private readonly _pendingSubagentToolCalls = new Map<string, string /* subagentChatUri */>();

	/**
	 * Pending {@link _runSessionGc} timers, keyed by session URI. A timer is
	 * armed when a session loses its last subscriber while still empty (no
	 * turns, no active turn) — see {@link _maybeScheduleSessionGc}. Cleared
	 * whenever any client subscribes again or the timer fires.
	 */
	private readonly _pendingSessionGc = this._register(new DisposableResourceMap<IDisposable>());

	/**
	 * Active resource watches keyed by the channel URI string
	 * (`ahp-resource-watch:/<encoded>`).
	 *
	 * Each entry owns the {@link IFileService} watcher together with the
	 * decoded descriptor, the subscriber refcount, and the optional
	 * grace-window dispose timer. The watch URI itself is fully
	 * self-describing — {@link createResourceWatch} just encodes the
	 * caller's params into the URI and returns it. State only exists
	 * here once at least one client has subscribed.
	 *
	 * Lifecycle:
	 * - First subscriber to a channel: {@link onResourceWatchSubscribed}
	 *   parses the URI, creates the {@link IFileService} watcher, and
	 *   installs the entry with `subscribers = 1`.
	 * - Subsequent subscribers bump the refcount and cancel any pending
	 *   grace-window dispose timer.
	 * - {@link onResourceWatchUnsubscribed} drops the refcount; when it
	 *   reaches zero we arm a {@link RESOURCE_WATCH_GRACE_MS} dispose
	 *   timer rather than tearing down immediately, giving disconnected
	 *   clients time to reconnect.
	 */
	private readonly _resourceWatches = this._register(new DisposableMap<string, IActiveResourceWatch>());

	constructor(
		core: IAgentServiceCore,
		collaborators: IAgentServiceCollaborators,
		options: IAgentServiceOptions,
		@ILogService private readonly _logService: ILogService,
		@IFileService private readonly _fileService: IFileService,
		@INativeEnvironmentService private readonly _environmentService: INativeEnvironmentService,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@IAgentHostSessionStateStore private readonly _sessionStateStore: IAgentHostSessionStateStore,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IAgentHostSessionOpenTelemetry private readonly _sessionOpenTelemetry: IAgentHostSessionOpenTelemetry,
		@IAgentHostChatContributions private readonly _chatContributions: IAgentHostChatContributions,
		@IAgentHostSubscriptionService private readonly _subscriptions: IAgentHostSubscriptionService,
		@IAgentHostChatOwnershipService private readonly _chatOwnership: IAgentHostChatOwnershipService,
		@IAgentHostChatInputService private readonly _chatInputService: IAgentHostChatInputService,
		@INetworkDiagnosticsService private readonly _networkDiagnostics: INetworkDiagnosticsService,
		@IAgentEditAttributionService private readonly _editAttributionService: IAgentEditAttributionService,
		@IAgentHostStorageService private readonly _storageService: IAgentHostStorageService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IAgentHostWorktreeIsolation private readonly _worktree: IAgentHostWorktreeIsolation,
		@IAgentHostWorktreeCleanupService private readonly _worktreeCleanup: IAgentHostWorktreeCleanupService,
		@IAgentHostProviderService private readonly _providerService: IAgentHostProviderService,
		@IAgentHostTurnService private readonly _turnService: IAgentHostTurnService,
		@ISessionWorkspaceConversionService private readonly _workspaceConversionService: ISessionWorkspaceConversionService,
		@IAgentHostOTelService private readonly _otelService: IAgentHostOTelService,
		@IAgentHostSessionTitleController private readonly _titleController: IAgentHostSessionTitleController,
		@IAdditionalWorktreeLifecycleService private readonly _additionalWorktreeLifecycleService: IAdditionalWorktreeLifecycleService,
		@IAgentHostStartupPerformance private readonly _startupPerformance: IAgentHostStartupPerformance,
		@IAgentHostClientConnectionService private readonly _clientConnections: IAgentHostClientConnectionService,
		@IAgentHostTurnTracker private readonly _turnTracker: IAgentHostTurnTracker,
		@IAgentHostResourceProviders private readonly _resourceProviders: IAgentHostResourceProviders,
		@IAgentHostWorktreeDiskUsageService private readonly _worktreeDiskUsage: IAgentHostWorktreeDiskUsageService,
	) {
		super();
		this._authService = core.authenticationService;
		this._orchestratorDatabase = core.orchestratorDatabase;
		this._scratchFoldersLoaded = this._orchestratorDatabase.listScratchFolders()
			.then(rows => {
				// A `removing` row still names a scratch folder a fork of the removed chat may use.
				for (const row of rows) {
					this._stateManager.setScratchFolder(row.folder, true);
				}
				// Sessions registered before the load landed published their identities without it.
				for (const session of this._stateManager.getSessionUris()) {
					this._publishWorkingDirectoryIdentities(session);
				}
				// Listings built before the load carry summaries without the scratch identities.
				this._invalidateSessionList();
				this._orphanedScratchFoldersReleased = this._releaseOrphanedScratchFolders(rows);
			})
			.catch(error => this._logService.warn('[AgentService] Failed to read the recorded scratch folders', error));
		this._savedChats = core.savedChats;
		this._debugLogsCollector = core.debugLogsCollector;
		this._sessionRegistry = core.sessionRegistry;
		void this._whenProvisionalSessionKeysLoaded();
		this._stateManager = core.stateManager;
		this._attachmentMigration = this._register(new AgentHostAttachmentMigration(this._orchestratorDatabase, this._stateManager, this._chatOwnership, this._fileService, this._sessionDataService, this._logService,
			origin => RELEASE_COPIED_ATTACHMENT_ORIGINS ? this._releaseOriginAttachments([origin]) : Promise.resolve()));
		// Loaded in the background: only clients that place a chat by its URI wait for it (see the protocol handler).
		void this._whenMovedChatOriginsLoaded();
		this._configurationService = core.configurationService;
		this._recentLocalSessionUpdateSnapshot = this._readRecentLocalSessionUpdates();
		this._recentLocalSessionUpdates = this._recentLocalSessionUpdateSnapshot;
		this.onMcpNotification = this._providerService.onMcpNotification;
		this._gitHubEndpointService = collaborators.gitHubEndpointService;
		this._gitStateService = collaborators.gitStateService;
		this._agentMergeController = collaborators.agentMergeController;
		this._checkpointService = collaborators.checkpointService;
		this._changesetOperationService = collaborators.changesetOperationService;
		this._reviewService = collaborators.reviewService;
		this._changesets = collaborators.changesets;
		this._changesetCoordinator = collaborators.changesetCoordinator;
		this._completions = collaborators.completions;
		this._terminalManager = collaborators.terminalManager;
		this._localTurns = collaborators.localTurns;
		this._sideEffects = collaborators.sideEffects;
		this._serverToolHost = collaborators.serverToolHost;
		this._catalogSyncService = new AgentHostCatalogSyncService(this._sessionDataService, this._orchestratorDatabase, this._sessionStateStore, this._logService);
		this._sessionPrewarmer = this._register(instantiationService.createInstance(AgentHostSessionPrewarmer, {
			getDefaultChatContext: (session, defaultChat) => this._chatContext(session, defaultChat, this._knownDefaultChatStorageResource(session, defaultChat) ?? this._newDefaultChatStorageResource(session, defaultChat)),
		}));
		this._catalogSourceResolver = new AgentHostCatalogSourceResolver({
			isUnpersistedChatBacking: session => this._unpersistedChatBackings.has(session.toString()),
			worktreeProjectFromRepositoryRoot,
			reportMalformedArtifacts: (session, error, dropped) => {
				if (error) {
					this._logService.warn(`[AgentService] Failed to parse artifacts for ${session}: ${toErrorMessage(error)}`);
				} else if (dropped > 0) {
					this._logService.warn(`[AgentService] Dropped ${dropped} malformed artifact entr${dropped === 1 ? 'y' : 'ies'} for ${session}`);
				}
			},
		});
		this._peerChatStore = core.peerChatStore;
		this._peerChatStore.setMetadataMigration((session, resource, values) => this._migrateChatMetadataWrite(session, resource, values));
		this._worktreeCoOwnership = core.worktreeCoOwnership;
		this._register(this._peerChatStore.onDidImportOlderBuildEdits(imported => {
			this._applyImportedOlderBuildEdits(imported).catch(error => this._logService.warn(`[AgentService] Failed to apply imported older-build chat edits of ${imported.session.toString()} to its live state`, error));
		}));
		this._sessionsV2MigrationService = new AgentHostSessionsV2MigrationService(
			this._orchestratorDatabase,
			this._sessionDataService,
			this._catalogSyncService,
			this._logService,
		);
		this._catalogListReader = new AgentHostCatalogListReader(this._orchestratorDatabase);
		this._automationService = this._register(instantiationService.createInstance(AgentHostAutomationService, {
			isSessionTemplateAvailable: (template, reader) => {
				const provider = this._providerService.resolveProvider(template.provider);
				return provider !== undefined && provider.isReadyForAutomation?.(template.model, reader) !== false;
			},
			createSession: (template, run, activeClient) => this.createSession({
				legacyChatUris: undefined,
				provider: template.provider,
				model: template.model,
				agent: template.agent,
				activeClient,
				workingDirectories: template.workingDirectories?.map(resource => URI.parse(resource)),
				config: template.config,
				_meta: {
					automation: run.automation,
					automationRun: run.resource,
				},
			}),
			startSession: (session, message) => this._startAutomationMessage(session, message),
			cancelSession: session => this._cancelAutomationSession(session),
			resumeTurn: (session, turnId) => this._resumeAutomationTurn(session, turnId),
		}));
		this._register(this._providerService.registerProviderInitializer(provider => this._initializeProvider(provider)));
		this._register(this._providerService.onDidRegisterProvider(provider => this._onDidRegisterProvider(provider)));
		this._sessionResidency = this._register(instantiationService.createInstance(
			AgentSessionResidency,
			this._stateManager,
			{
				isReleaseBlocked: session => this._restoreSessionInFlight.has(session.toString()) || this._savedChatContinuations.has(session.toString()) || this._chatMoveSessions.has(session.toString()) || this._movePinnedSessions.has(session.toString()),
				whenSessionDataIdle: session => this._whenSessionDataIdle(session),
				getSessionChats: session => this._getSessionChatsInTeardownOrder(session),
				createRelease: session => {
					const provider = this._providerService.getProviderForSession(session);
					return provider ? {
						canRelease: chats => this._canReleaseSession(provider, session, chats),
						release: chats => this._releaseSession(provider, session, chats),
					} : undefined;
				},
				evictSessionState: (session, chats) => this._evictSessionState(session, session.toString(), session.toString(), chats.map(chat => chat.toString())),
			},
			{
				limit: options.sessionResidencyLimit,
				releaseRetryMs: options.sessionReleaseRetryMs,
				holdsSession: session => this._agentMergeController.holdsSession(session),
				onDidReleaseHold: this._agentMergeController.onDidReleaseHold,
			},
		));
		this._register(this._resourceProviders.registerProvider(TOOL_RESULT_RESOURCE_SCHEME, instantiationService.createInstance(ToolResultResourceProvider)));
		this._register(this._resourceProviders.registerProvider(MCP_RESOURCE_SCHEME, instantiationService.createInstance(McpResourceLinkProvider, (session: URI, chat: URI) => this._restoreSessionChat(session, chat, 'MCP resource read'))));
		this._register(this._resourceProviders.registerProvider(SESSION_DB_SCHEME, instantiationService.createInstance(SessionDbResourceProvider)));
		this._register(this._resourceProviders.registerProvider(EDIT_ATTRIBUTION_RESOURCE_SCHEME, instantiationService.createInstance(EditAttributionResourceProvider)));
		this._register(this._resourceProviders.registerProvider(GIT_BLOB_SCHEME, instantiationService.createInstance(GitBlobResourceProvider, {
			readSavedWorkingDirectories: (session, resource) => this._savedChats.readWorkingDirectories(session, resource),
			restoreSession: session => this.restoreSession(session),
			reconcileResidency: () => { void this._sessionResidency.reconcile(); },
		})));
		core.callbackBinder.bind({
			canEvictChangeset: changeset => this._canEvictChangeset(changeset),
			startAgentMergeTurn: (chat, turnId, prompt, credentials) => this._startAgentMergePrompt(chat, turnId, prompt, credentials),
			cancelAgentMergeTurn: (chat, turnId) => this._cancelAgentMergePrompt(chat, turnId),
			postAgentMergeNotice: (chat, kind, content) => this._postAgentMergeNotice(chat, kind, content),
			resolveWorkingDirectoryBeforeSend: params => this._resolveWorkingDirectoryBeforeSend(params),
			resolveChatAttachmentTurns: resource => this._resolveChatAttachmentTurns(resource),
			sessionServerToolAccessor: this._createSessionServerToolAccessor(),
			artifactServerToolAccessor: this._createArtifactServerToolAccessor(),
			persistListVisibleSessionState: (session, values) => this._persistListVisibleSessionState(URI.parse(session), values),
			queueCatalogSync: (session, values) => this._queueCatalogSync(URI.parse(session), values),
			persistMetadata: async (resource, values) => this._peerChatStore.persistMetadata(
				URI.parse(isAhpChatChannel(resource) ? this._chatOwnership.requireChatOwner(resource) : resource), URI.parse(resource), values),
			readNormalizedChat: (session, chat) => this._peerChatStore.readNormalizedChat(session, chat),
			persistSurfacedSessionTitle: (session, title) => this._persistSurfacedSessionTitle(URI.parse(session), title),
		});
		this._logService.info('AgentService initialized');
		this._register(this._stateManager.onDidEmitEnvelope(e => this._onDidAction.fire(e)));
		this._register(toDisposable(() => {
			for (const entries of [...this._preparedChatWorkingDirectories.values()]) {
				for (const entry of [...entries]) {
					entry.reservation.dispose();
				}
			}
		}));
		this._register(this._stateManager.onDidRejectClientAction(e => this._onDidAction.fire(e)));
		this._register(this._stateManager.onDidEmitEnvelope(e => this._trackPendingSubagentChatFromEnvelope(e)));
		this._register(this._stateManager.onDidEmitEnvelope(e => this._persistAnnotations(e)));
		this._register(this._stateManager.onDidEmitEnvelope(e => {
			if (isAhpChatChannel(e.channel) && (e.action.type === ActionType.ChatTurnComplete || e.action.type === ActionType.ChatTurnCancelled || e.action.type === ActionType.ChatError)) {
				this._flushAgentMergeNotices(e.channel);
			} else if (e.action.type === ActionType.SessionChatRemoved && this._stateManager.chatRemovalReason(e.channel, e.action.chat) === ChatRemovalReason.Deleted) {
				// A moved chat keeps its own pending notices.
				const defaultChat = this._defaultChat(e.channel);
				if (defaultChat !== undefined) {
					this._moveAgentMergeNotices(e.action.chat, defaultChat);
				}
			}
		}));
		// Archiving is terminal for Agent Merge, so the index is cleared from the
		// action rather than from the controller's own disable.
		this._register(this._stateManager.onDidEmitEnvelope(e => {
			if (e.action.type === ActionType.SessionIsArchivedChanged && e.action.isArchived && !isAhpChatChannel(e.channel)) {
				this._clearAgentMergeIndex(URI.parse(e.channel));
				if (!this._savedChatArchivePublications.has(e.action)) {
					void this._sessionResidency.reconcile();
				}
			}
		}));
		this._register(this._stateManager.onDidEmitNotification(e => this._onDidNotification.fire(e)));
		this._register(this._sessionRegistry.onDidAdoptSession(session => {
			const key = session.toString();
			const state = this._stateManager.getSessionState(key);
			if (state) {
				this._stateManager.setSessionMeta(key, withSessionExternal(state._meta, false));
				this._stateManager.setSessionSummaryPublished(key, true);
			}
			this._externalReconciliationModifiedAt.delete(key);
			this._recordRecentLocalSessionUpdate(session, Date.now());
			this._invalidateSessionList();
			this._queueSessionListReconciliation();
		}));
		// A notice raised mid-turn waits for the agent to finish so it can own a
		// turn of its own and survive restore.
		this._register(this._stateManager.onDidChangeSessionActiveTurn(({ session, active }) => {
			if (!active) {
				this._flushAgentMergeNoticesForSession(session);
				for (const [key, pending] of this._pendingChatHistories) {
					if (this._chatOwnership.getChatOwner(key) === session) {
						this._pendingChatHistories.delete(key);
						void this._chatHistoryRefreshes.queue(key, () => this._refreshChatHistory(pending.provider, pending.chat, pending.turns)).catch(error => {
							this._logService.warn('[AgentService] Failed to apply pending external history', error);
						});
					}
				}
			}
		}));
		this._register(this._stateManager.onDidRemoveSession(session => {
			const sessionKey = session.toString();
			this._authService.releaseSessionCredentials(sessionKey);
			this._restoredSubagentAdmissionRetries.get(sessionKey)?.cancel();
			this._restoredSubagentAdmissionRetries.delete(sessionKey);
			// The chats of a removed session are no longer registered: their notices have no owner to wait for.
			for (const chat of [...this._pendingAgentMergeNotices.keys()]) {
				const owner = this._chatOwnership.getChatOwner(chat);
				if (owner === undefined || owner === session) {
					this._pendingAgentMergeNotices.delete(chat);
				}
			}
		}));
		// A watch ends with its owner: it follows a moved chat (Block 4).
		this._register(this._stateManager.onDidChangeChatOwner(({ chat, previous, current }) => {
			const watched = URI.parse(chat);
			if (this._chatWatchOwners.has(watched)) {
				this._chatWatchOwners.set(watched, current);
			}
			this._authService.moveChatCredentials(chat, previous, current);
		}));
		this._register(this._stateManager.onDidRemoveSession(removed => {
			for (const [chat, session] of this._chatWatchOwners) {
				if (session === removed) {
					this._chatWatches.deleteAndDispose(chat);
					this._chatWatchOwners.delete(chat);
					this._pendingChatHistories.delete(chat.toString());
				}
			}
		}));
		this._register(this._stateManager.onDidChangeSessionSummary(({ session, changes, previous }) => {
			const meta = this._stateManager.getSessionSummary(session)?._meta;
			if (changes.modifiedAt !== undefined) {
				const modifiedTime = Date.parse(changes.modifiedAt);
				if (!readSessionExternal(meta)
					&& !isSubagentSession(session)
					&& !this._stateManager.isEphemeralSession(session)
					&& !this._stateManager.isIdleProvisionalSession(session)) {
					this._recordRecentLocalSessionUpdate(URI.parse(session), modifiedTime);
				}
				this._writeSessionModifiedTime(URI.parse(session), modifiedTime);
			}
			if (changes.modifiedAt !== undefined
				&& this._getExternalSessionsMode() === AgentHostExternalSessionsMode.Recent
				&& readSessionExternal(meta)
				&& !readSessionEhcliAdoptable(meta)
				&& this._externalReconciliationModifiedAt.get(session) !== changes.modifiedAt) {
				this._externalReconciliationModifiedAt.set(session, changes.modifiedAt);
				this._queueSessionListReconciliation();
			}
			const catalogFlagsChanged = changes.status !== undefined
				&& ((changes.status ^ previous.status) & (SessionStatus.IsRead | SessionStatus.IsArchived)) !== 0;
			if (catalogFlagsChanged || Object.keys(changes).some(key => key !== 'activity' && key !== 'status')) {
				this._queueCatalogSync(URI.parse(session), {});
			}
		}));
		updateAgentHostTelemetryLevelFromConfig(this._telemetryService, this._stateManager.rootState.config?.values);
		this._register(this._stateManager.onDidChangeSessionConfig(({ session, previous, current }) => this._syncAgentMergeIndex(URI.parse(session), previous, current)));
		let externalSessionsMode = this._getExternalSessionsMode();
		let agentMergeEnabled = this._isAgentMergeEnabled();
		this._register(this._configurationService.onDidRootConfigChange(() => {
			const nextMode = this._getExternalSessionsMode();
			if (nextMode !== externalSessionsMode) {
				const previousMode = externalSessionsMode;
				externalSessionsMode = nextMode;
				this._logService.info(`[AgentService] ${AgentHostShowExternalSessionsConfigKey} changed '${previousMode}' -> '${nextMode}'; queueing session list reconciliation`);
				if (this._startupSettled.isOpen() && this._hidesAllExternalSessions(previousMode) && !this._hidesAllExternalSessions(nextMode)) {
					for (const provider of this._providerService.getProviders()) {
						this._startChatDiscovery(provider, 'external sessions were enabled');
					}
				}
				this._queueSessionListReconciliation(previousMode);
			}
			const nextAgentMergeEnabled = this._isAgentMergeEnabled();
			if (nextAgentMergeEnabled !== agentMergeEnabled) {
				agentMergeEnabled = nextAgentMergeEnabled;
				for (const session of this._stateManager.getSessionUris()) {
					this._serverToolHost.advertise(session);
				}
				// Turning the feature on resumes monitoring for persisted
				// enabled sessions that are not in memory.
				if (nextAgentMergeEnabled) {
					this._agentMergeRestore = this._agentMergeRestore
						.then(() => this._restoreAgentMergeMonitoredSessions())
						.catch(err => this._logService.warn('[AgentService] Failed to restore Agent-Merge-enabled sessions', err));
				}
			}
		}));
		this._register(this._gitHubEndpointService.onDidChange(() => {
			this._stateManager.emitAuthRequired({
				resource: this._gitHubEndpointService.getCopilotResource(),
				reason: AuthRequiredReason.Required,
			});
		}));
		this._editAttributionService.setEnabled(this._stateManager.rootState.config?.values[AgentHostEditTelemetryEnabledConfigKey] !== false);
		this._runWhenStartupSettled('external session prune', () => this._pruneStaleExternalSessions());
		this._catalogReconciliationService = this._register(new AgentHostCatalogReconciliationService(
			this._orchestratorDatabase,
			this._catalogSyncService,
			this._storageService,
			() => this._listRegisteredSessions(),
			(registered, database) => this._resolveCatalogReconciliationSource(registered, database),
			this._logService,
			{
				...options.catalogReconciliationOptions,
				canSchedule: () => this._startupSettled.isOpen(),
				isSourceAvailable: registered => !!this._providerService.getProvider(registered.provider),
				migrateChatCatalog: async (session, token) => { await this._migrateChatCatalog(session, token); },
				onDidMarkSessionsProvisional: sessions => {
					const readableProviders = new Set<AgentProvider>();
					for (const session of sessions) {
						this._provisionalSessionKeys.add(session);
						const provider = this._providerService.getProviderForSession(session)?.id;
						if (provider && this._readableProviderCatalogs.has(provider)) {
							readableProviders.add(provider);
						}
					}
					this._invalidateSessionList();
					for (const provider of readableProviders) {
						this._queuePublishedSessionListRefresh(provider);
					}
				},
			},
		));
		this._runWhenStartupSettled('catalog reconciliation', () => {
			this._catalogReconciliationService.schedule();
		});
		this._chatMovability = this._register(new AgentHostChatMovability(this._stateManager, this._configurationService, {
			conversions: this._workspaceConversionService,
			sessionState: this._sessionStateStore,
			catalogs: this._catalogReconciliationService,
		}));
		this._runWhenStartupSettled('worktree clean-up', () => this._worktreeCleanup.start());
		this._register(core.disposables);
	}

	/** Opens once startup settled: the host finished starting and the first listing was served. */
	private readonly _startupSettled = new Barrier();
	private _hostStartupComplete = false;
	private _firstListingServed = false;
	/** Serializes deferred work so background maintenance never overlaps. */
	private _deferredWork = Promise.resolve();

	/**
	 * Signals that host startup finished. Deferred work runs once this and the
	 * first session listing have both happened, so background maintenance never
	 * competes with startup. Called by the process mains; the service owns no
	 * ambient timer of its own.
	 */
	markStartupComplete(outcome: 'success' | 'error' = 'success'): void {
		if (this._hostStartupComplete) {
			return;
		}
		this._hostStartupComplete = true;
		this._startupPerformance.mark('hostReady', { since: 'processStart', outcome, ...this._getStartupContext() });
		this._openStartupSettled();
	}

	private _openStartupSettled(): void {
		if (this._hostStartupComplete && this._firstListingServed && !this._startupSettled.isOpen()) {
			this._startupPerformance.mark('startupSettled', { since: 'processStart', ...this._getStartupContext() });
			this._startupSettled.open();
		}
	}

	private _getStartupContext(): IAgentHostStartupMetrics {
		return {
			externalSessionsMode: this._getExternalSessionsMode(),
			migrateLegacyEnabled: this._migrateLegacyEnabledSnapshot,
			copilotRegistered: this._providerService.getProvider('copilotcli') !== undefined,
			claudeRegistered: this._providerService.getProvider('claude') !== undefined,
			codexRegistered: this._providerService.getProvider('codex') !== undefined,
		};
	}

	/**
	 * Runs `work` once startup has settled, serialized behind any deferred work
	 * queued before it. For maintenance that is fine to run late and must not
	 * compete with startup — pruning stale external sessions, titling external
	 * sessions a provider surfaced without a title, and similar.
	 */
	private _runWhenStartupSettled(name: string, work: () => void | Promise<void>): void {
		this._deferredWork = this._deferredWork
			.then(() => this._startupSettled.wait())
			.then(() => this._store.isDisposed ? undefined : work())
			.catch(error => this._logService.warn(`[AgentService] Deferred work '${name}' failed`, error));
	}

	/** Test surface: settles once the startup release of orphaned scratch folders (see `_releaseOrphanedScratchFolders`) has run. */
	async whenOrphanedScratchFoldersReleased(): Promise<void> {
		await this._scratchFoldersLoaded;
		await this._orphanedScratchFoldersReleased;
	}

	/** Test surface: settles once every discovered-chat registration queued so far, and any queued while waiting, has run. */
	async whenDiscoveredChatsRegistered(): Promise<void> {
		while (this._providerDiscoveryRegistrations.size > 0) {
			await Promise.all(this._providerDiscoveryRegistrations.values());
		}
	}

	/** Test surface: settles once all deferred work queued so far has run. */
	async whenDeferredWorkSettled(): Promise<void> {
		// The marker load runs outside the deferred-work chain, and listing reads
		// its mirror synchronously. Without joining it here a "settled" listing
		// could still miss suppression, so a test could pass on load ordering
		// rather than on the behaviour it asserts.
		await this._whenProvisionalSessionKeysLoaded();
		await this._deferredWork;
	}

	private async _pruneStaleExternalSessions(): Promise<void> {
		const now = Date.now();
		const registered = await this._listRegisteredSessions();
		const staleExternalSessions: URI[] = [];
		for (const entry of registered) {
			if (!entry.external) {
				continue;
			}
			const provider = this._providerService.getProvider(entry.provider);
			if (!provider) {
				continue;
			}
			let metadata: IAgentSessionMetadata | undefined;
			try {
				metadata = await this._registeredSessionMetadata(provider, entry.session, true);
			} catch (error) {
				this._logService.warn(`[AgentService] Failed to load metadata while pruning stale external session ${entry.session.toString()}`, error);
				continue;
			}
			if (!metadata) {
				continue;
			}
			if (readSessionEhcliAdoptable(metadata._meta)) {
				continue;
			}
			if (this._isExternalSessionOlderThanMaxAge(metadata.modifiedTime, now)) {
				staleExternalSessions.push(entry.session);
			}
		}

		for (const session of staleExternalSessions) {
			await this._sessionRegistry.unregister(session);
			await this._sessionStateStore.evict(session);
		}
		if (staleExternalSessions.length > 0) {
			this._invalidateSessionList();
			this._queueSessionListReconciliation();
		}
		this._logService.info(`[AgentService] pruned ${staleExternalSessions.length} stale external session row(s) older than ${EXTERNAL_SESSION_MAX_AGE_MS / DAY_MS} days`);
	}

	/** External sessions registered without a provider title, awaiting a generated one. */
	private readonly _untitledExternalSessions = new Map<string, IAgentSessionMetadata>();
	private _externalSessionTitlingQueued = false;
	private readonly _backgroundInitialMigrationRetries = new Map<AgentProvider, Promise<void>>();
	/** Why each session's last chat catalog migration ended without converting it, and how many times in a row. */
	private readonly _catalogMigrationDeferrals = new Map<string, { readonly reason: string; readonly attempts: number }>();
	private readonly _initialProviderMigrationsNeedingRetry = new Set<AgentProvider>();

	async whenCatalogReconciliationIdle(): Promise<void> {
		while (true) {
			try {
				// A session's summary changes persist its catalog when their debounced notification fires: emitted now, so
				// the writes they queue are waited for below rather than landing after this settles (and, after a restart,
				// under the next host's move).
				this._stateManager.flushPendingSessionSummaries();
				await this._catalogReconciliationService.whenIdle();
				await this._peerChatStore.whenIdle();
				if (this._backgroundCatalogStateWrites.size === 0 && this._backgroundPassiveSessionMetadataWrites.size === 0) {
					return;
				}
			} finally {
				while (this._backgroundCatalogStateWrites.size > 0 || this._backgroundPassiveSessionMetadataWrites.size > 0) {
					await Promise.allSettled([
						...[...this._backgroundCatalogStateWrites.values()].map(write => write.promise),
						...[...this._backgroundPassiveSessionMetadataWrites.values()].map(write => write.promise),
					]);
				}
			}
		}
	}

	/**
	 * Queues external sessions whose provider surfaced them without a title.
	 * Titling is deferred past startup and capped at the
	 * {@link RECENT_EXTERNAL_SESSION_LIMIT} most recently updated candidates, so
	 * a large provider catalog cannot trigger a burst of model calls.
	 */
	private _scheduleExternalSessionTitles(sessions: readonly IAgentSessionMetadata[]): void {
		for (const session of sessions) {
			this._untitledExternalSessions.set(session.session.toString(), session);
		}
		if (this._externalSessionTitlingQueued) {
			return;
		}
		this._externalSessionTitlingQueued = true;
		this._runWhenStartupSettled('external session titles', () => {
			this._externalSessionTitlingQueued = false;
			return this._titleUntitledExternalSessions();
		});
	}

	/** Titles the most recently updated queued sessions and drops the rest. */
	private async _titleUntitledExternalSessions(): Promise<void> {
		const candidates = [...this._untitledExternalSessions.values()]
			.sort((a, b) => b.modifiedTime - a.modifiedTime)
			.slice(0, RECENT_EXTERNAL_SESSION_LIMIT);
		this._untitledExternalSessions.clear();
		for (const candidate of candidates) {
			try {
				await this._generateExternalSessionTitle(candidate);
			} catch (error) {
				this._logService.warn(`[AgentService] Failed to title external session ${candidate.session.toString()}`, error);
			}
		}
	}

	/** Titles one external session from the first user prompt of its default chat. */
	private async _generateExternalSessionTitle(metadata: IAgentSessionMetadata): Promise<void> {
		if (readSessionEhcliAdoptable(metadata._meta)) {
			return;
		}
		const session = metadata.session;
		const agent = this._providerService.getProviderForSession(session);
		if (!agent) {
			return;
		}
		const chat = URI.parse(await this._readDefaultChat(session));
		const turns = await agent.chats.getMessages(chat, this._chatContext(session, chat, await this._resolveDefaultChatStorageResource(session, chat)));
		const prompt = turns[0]?.message.text.trim();
		if (prompt) {
			await this._sideEffects.generateExternalSessionTitle(session.toString(), prompt);
		}
	}

	// ---- provider registration ----------------------------------------------

	private _toProviderConfig<T extends { readonly config?: Record<string, unknown> }>(request: T): T {
		if (!this._worktree.supported || !request.config) {
			return request;
		}
		return { ...request, config: omitHostOwnedSessionConfig(request.config) };
	}

	/**
	 * Host-owned first-send hook (invoked by {@link AgentSideEffects} before the
	 * agent locks its subprocess cwd). Resolves the working directories the chat
	 * will actually run in and hands them to the agent at send time:
	 *  - index 0 is the process root: for `worktree` isolation the isolated
	 *    worktree (created here on the first send, see
	 *    {@link _resolveWorktreeBeforeSend}); for `folder` isolation the picked
	 *    folder; `undefined` (whole result) for workspace-less sessions.
	 *  - the tail carries any additional session roots as-is (only index 0 is
	 *    worktree-remapped; additional roots are passed through unchanged).
	 */
	private async _resolveWorkingDirectoryBeforeSend(params: { session: string; chat: string; turnId: string; prompt: string; credentials?: IAgentHostCredentialSource; agentMergeTurn?: boolean }): Promise<readonly URI[] | undefined> {
		if (params.credentials) {
			if (!params.agentMergeTurn) {
				await this._bindExecutionCredentials(params.session, params.credentials, params.chat);
			}
		} else if (this._authService.getSessionCredentialPrincipal(params.session)) {
			throw new ProtocolError(AhpErrorCodes.AuthRequired, 'An isolated turn requires an explicit credential sponsor');
		}
		await this._recreatePendingChatBacking(params.session, params.chat, params.credentials);
		const sessionId = AgentSession.id(params.session);
		const creationError = this._worktree.getCreationError(sessionId);
		if (creationError) {
			throw creationError;
		}
		const pickedFolders = this._configurationService.getEffectiveWorkingDirectories(params.chat);
		const pickedFolderUri = pickedFolders?.[0] ? URI.parse(pickedFolders[0]) : undefined;
		const tail = (pickedFolders ?? []).slice(1).map(d => URI.parse(d));

		// Only worktree-isolation sessions defer directory resolution to the first
		// send (so the prompt can name the branch); folder / workspace-less
		// sessions run directly in the picked folder.
		if (!this._worktree.isWorkingDirectoryPending(sessionId)) {
			if (!pickedFolderUri) {
				return undefined;
			}
			await this._recreateMissingScratchFolder(params.chat, pickedFolderUri);
			const resolved = await this._resolveWorkingDirectoryForResume(URI.parse(params.session), sessionId, pickedFolderUri);

			const config = this._configurationService.getSessionConfigValues(params.session);
			if (config?.[SessionConfigKey.Isolation] === 'folder') {
				const session = URI.parse(params.session);
				const scope = resolveBranchChangesetScopeForSource(this._stateManager, params.chat);
				const source = resolveBranchChangesetScopeForOwner(this._stateManager, scope.ownerUri)?.sourceUri ?? params.chat;
				const isDefaultChat = this._chatOwnership.isDefaultChat(params.session, source);
				const persistedBase = await this._sessionStateStore.readBaseBranchWithoutImport(session, isDefaultChat ? undefined : source);
				if (!persistedBase && (!isDefaultChat || resolveGitHubStateFolder(this._stateManager, source).isSessionFolder)) {
					const repositoryRoot = await this._gitService.getRepositoryRoot(resolved);
					if (repositoryRoot) {
						const defaultBranch = await this._gitService.getDefaultBranch2(repositoryRoot);
						const configuredBranch = config[SessionConfigKey.Branch];
						const fallbackBranch = typeof configuredBranch === 'string'
							? configuredBranch
							: await this._gitService.getCurrentBranch(repositoryRoot);
						const baseBranch = resolveDefaultBaseBranchName(defaultBranch, fallbackBranch);
						if (baseBranch) {
							await this._sessionStateStore.writeMetadata(session, isDefaultChat ? session : URI.parse(source), {
								[META_DIFF_BASE_BRANCH]: baseBranch,
							}, SessionStateMirrorFlush.Immediate);
							for (const chat of this._stateManager.getSessionState(params.session)?.chats ?? []) {
								this._changesets.refreshChangesetCatalog(chat.resource);
							}
						}
					}
				}
			}

			return [resolved, ...tail];
		}

		const resolved = await this._resolveWorktreeBeforeSend({ ...params, sessionId, pickedFolderUri });
		return resolved ? [resolved, ...tail] : undefined;
	}

	/** Recreates a recorded scratch folder of `chat` deleted while the host runs, as on restore. Never throws; any other missing folder stays missing. */
	private async _recreateMissingScratchFolder(chat: string, folder: URI): Promise<void> {
		try {
			if (!isEqualOrParent(folder, workspacelessChatsRoot(this._environmentService.userHome)) || await this._fileService.exists(folder)) {
				return;
			}
			if ((await this._orchestratorDatabase.listScratchFolders()).some(row => row.chatUri === chat && row.state !== 'removing' && isEqual(URI.parse(row.folder), folder))) {
				await this._fileService.createFolder(folder);
			}
		} catch (error) {
			this._logService.warn(`[AgentService] Failed to recreate the scratch folder ${folder.toString()} of chat ${chat}: ${toErrorMessage(error)}`);
		}
	}

	private async _resolveChatAttachmentTurns(resource: string): Promise<readonly Turn[]> {
		const readTurns = () => {
			const state = this._stateManager.getChatState(resource) ?? this._stateManager.getDefaultChatState(resource);
			return state?.turns;
		};
		const existing = readTurns();
		if (existing) {
			return existing;
		}

		const owner = isAhpChatChannel(resource) ? (await this._chatOwnership.resolveChatOwner(resource))?.owner : resource;
		if (owner === undefined) {
			throw new Error(`Cannot resolve peer chat attachment: ${resource}`);
		}
		const sessionUri = URI.parse(owner);
		if (!this._isSessionRestored(sessionUri.toString())) {
			await this.restoreSession(sessionUri);
		} else {
			const provider = this._providerService.getProviderForSession(sessionUri);
			if (provider) {
				await this._restorePeerChats(provider, sessionUri);
			}
		}
		if (isAhpChatChannel(resource)) {
			const state = await this._stateManager.resolveChatState(resource);
			if (state) {
				return state.turns;
			}
			throw new Error(`Cannot resolve peer chat attachment: ${resource}`);
		}
		const resolved = readTurns();
		if (resolved) {
			return resolved;
		}
		return [];
	}

	/** Creates the first-send worktree and announces success; failure ends the request through the normal chat error path. */
	private async _resolveWorktreeBeforeSend(params: { session: string; chat: string; turnId: string; prompt: string; sessionId: string; pickedFolderUri: URI | undefined; credentials?: IAgentHostCredentialSource }): Promise<URI | undefined> {
		const { sessionId, pickedFolderUri } = params;
		const worktree = this._worktree;
		let reportedActivity = false;
		try {
			await worktree.resolveOnFirstSend({
				sessionUri: URI.parse(params.session),
				sessionId,
				workingDirectory: pickedFolderUri,
				config: this._configurationService.getSessionConfigValues(params.session),
				prompt: params.prompt,
				...(params.credentials ? { credentialSource: params.credentials } : {}),
				githubToken: this._authService.getAuthToken({
					session: params.chat,
					resource: this._gitHubEndpointService.getCopilotResource().resource,
					scopes: this._gitHubEndpointService.getCopilotResource().scopes_supported,
				}),
				onProgress: activity => {
					reportedActivity = true;
					this._stateManager.dispatchServerAction(params.chat, { type: ActionType.ChatActivityChanged, activity });
				},
			});
		} finally {
			if (reportedActivity) {
				this._stateManager.dispatchServerAction(params.chat, { type: ActionType.ChatActivityChanged, activity: undefined });
			}
		}
		const announcement = worktree.takePendingAnnouncement(sessionId);
		if (announcement !== undefined) {
			this._stateManager.dispatchServerAction(params.chat, {
				type: ActionType.ChatResponsePart,
				turnId: params.turnId,
				part: { kind: ResponsePartKind.Markdown, id: generateUuid(), content: announcement },
			});
		}
		return worktree.getResolvedWorktree(sessionId);
	}

	private _initializeProvider(provider: IAgent): IDisposable {
		const subscriptions = new DisposableStore();
		try {
			this._invalidateSessionList();
			// A newly registered provider may resolve sessions that were parked
			// while it was absent or still downloading its SDK.
			this._catalogReconciliationService.wakeParkedSessions();
			this._catalogReconciliationService.schedule();
			provider.setServerToolHost?.(this._serverToolHost);
			provider.setKnownSessionsFilter?.(sessions => this._filterKnownSessions(provider.id, sessions));
			// Deterministic subagent membership ordering: apply a spawned subagent's
			// catalog membership (via the spawn-channel handlers) BEFORE
			// AgentSideEffects — registered next — handles the same signal and starts
			// a turn on the subagent chat, which requires that chat to already exist.
			// Registering this listener ahead of the side-effects listener makes the
			// ordering independent of when the agent registers its own subagent->spawn
			// bridge; addChat/removeChat are idempotent, so the overlap is safe.
			subscriptions.add(provider.onDidChatProgress(signal => this._sequenceSpawnedChat(signal)));
			subscriptions.add(this._sideEffects.registerProgressListener(provider));
			subscriptions.add(provider.onDidMaterializeChat(e => this._onDidMaterializeChat(e)));
			subscriptions.add(provider.onDidDiscoverChats(chats => {
				const previous = this._providerDiscoveryRegistrations.get(provider.id) ?? Promise.resolve();
				const registration = previous
					.then(() => this._migrateAndRegisterDiscoveredChats(provider, chats))
					.then(() => { }, err => this._logService.warn(`[AgentService] registering discovered chats for provider ${provider.id} failed`, err));
				this._providerDiscoveryRegistrations.set(provider.id, registration);
				void registration.finally(() => {
					if (this._providerDiscoveryRegistrations.get(provider.id) === registration) {
						this._providerDiscoveryRegistrations.delete(provider.id);
					}
				});
			}));
			this._setupChatDiscoveryForProvider(provider);
			subscriptions.add(provider.onDidChangeChatData(e => this._onChatDataChanged(e)));
			if (provider.onDidChangeChatHistory) {
				subscriptions.add(provider.onDidChangeChatHistory(event => {
					void this._chatHistoryRefreshes.queue(event.chat.toString(), () => this._refreshChatHistory(provider, event.chat, event.turns)).catch(error => {
						this._logService.warn('[AgentService] Failed to refresh external chat history', error);
					});
				}));
			}
			subscriptions.add(provider.onDidSpawnChat(e => this._onChatSpawned(e)));
			this._providerSubscriptions.set(provider.id, subscriptions);
			return toDisposable(() => {
				this._providerSubscriptions.deleteAndDispose(provider.id);
				this._deferredProviderMigrations.delete(provider.id);
				this._readableProviderCatalogs.delete(provider.id);
				this._initialProviderMigrationsNeedingRetry.delete(provider.id);
				this._startedChatDiscoveryProviders.delete(provider.id);
			});
		} catch (error) {
			subscriptions.dispose();
			throw error;
		}
	}

	private _setupChatDiscoveryForProvider(provider: IAgent): void {
		if (this._migrateLegacyEnabledSnapshot === true && provider.ensureChatAdopted) {
			this._startChatDiscovery(provider, 'legacy chat migration is enabled');
		} else {
			this._runWhenStartupSettled(`external session discovery for ${provider.id}`, () => {
				if (!this._hidesAllExternalSessions(this._getExternalSessionsMode())) {
					this._startChatDiscovery(provider, 'Agent Host startup settled with external sessions enabled');
				}
			});
		}
	}

	private _onDidRegisterProvider(provider: IAgent): void {
		this._registerSkillCompletionProvider();
		const initialMigration = this._trackInitialProviderMigration(provider, this._ensureSessionsV2Imported(provider));
		// Persisted enablement must resume without a client opening the session.
		this._agentMergeRestore = this._agentMergeRestore
			.then(() => initialMigration)
			.then(() => this._restoreAgentMergeMonitoredSessions())
			.catch(err => this._logService.warn('[AgentService] Failed to restore Agent-Merge-enabled sessions', err));
	}

	private _trackInitialProviderMigration(provider: IAgent, migration: Promise<void>): Promise<void> {
		this._initialProviderMigrations.set(provider.id, migration);
		void migration
			.then(() => this._automationService.handleAgentsChanged())
			.catch(err => this._logService.warn(`[AgentService] provider initialization failed before Automations could refresh for ${provider.id}`, err));
		return migration;
	}

	private _registerSkillCompletionProvider(): void {
		if (this._skillCompletionProviderRegistered) {
			return;
		}
		this._skillCompletionProviderRegistered = true;
		const provider = this._register(new AgentHostSkillCompletionProvider(
			session => this._providerService.getProviderForSession(session),
			async session => {
				const defaultChat = this._defaultChat(session);
				if (defaultChat === undefined) {
					return undefined;
				}
				const chat = URI.parse(defaultChat);
				return { chat, context: this._chatContext(session, chat, await this._resolveDefaultChatStorageResource(session, chat)) };
			},
			session => this._hostCustomizations(URI.isUri(session) ? session : URI.parse(session)),
		));
		this._register(this._completions.registerProvider(provider));
	}

	// ---- auth ---------------------------------------------------------------

	async authenticate(params: AuthenticateParams, scope?: IAgentHostAuthenticationScope): Promise<AuthenticateResult> {
		if (params.target) {
			if (params.target.kind !== AuthenticateTargetKind.McpServer) {
				throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Unsupported authentication target kind');
			}
			const state = isAhpChatChannel(params.target.session) ? undefined : this._stateManager.getSessionState(params.target.session);
			if (!state || findMcpServerName(state.customizations ?? [], params.target.customizationId) === undefined) {
				throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Authentication target must identify an MCP server in an existing session');
			}
		}
		const result = await this._providerService.authenticate(params, scope);
		if (result.authenticated && !scope && !params.target) {
			this._agentMergeController.refresh();
		}
		return result;
	}

	// ---- Changeset operation handlers --------------------------------------

	async invokeChangesetOperation(params: InvokeChangesetOperationParams, credentials?: IAgentHostCredentialSource): Promise<InvokeChangesetOperationResult> {
		const parsed = parseChangesetUri(params.channel);
		const session = parsed ? resolveChangesetOwnerScope(this._stateManager, parsed.ownerUri).sessionUri : undefined;
		if (session) {
			if (credentials && !this._isSessionRestored(session)) {
				credentials = await this._prepareColdRestoreCredentials(session, credentials);
				await this.restoreSession(URI.parse(session), undefined, credentials);
			}
			credentials = await this._resolveExecutionCredentials(session, credentials);
			if (credentials) {
				await this._persistCredentialPrincipal(session, credentials);
			}
		}
		return this._changesetOperationService.invokeChangesetOperation(params, credentials);
	}

	// ---- MCP `mcp://` channel routing --------------------------------------

	async handleMcpRequest(channel: string, method: string, params: Record<string, unknown> | undefined): Promise<unknown> {
		return this._providerService.handleMcpRequest(channel, method, params);
	}

	// ---- session management -------------------------------------------------

	/**
	 * Builds the dependency surface the session server-tool group needs, bound
	 * to this service so the group stays decoupled from the concrete host.
	 */
	private _createSessionServerToolAccessor(): IAgentServiceSessionServerToolAccessor {
		const isWorkspaceless = (session: URI) => readSessionWorkspaceless(this._stateManager.getSessionState(session.toString())?._meta);
		return {
			getCredentialSource: chat => this._getServerToolCredentialSource(chat),
			getAutomaticTitleGenerationStrategy: session => this._titleController.getAutomaticTitleGenerationStrategy(session),
			isWorkspaceless,
			canConvertWorkspace: session => this._providerService.getProviderForSession(session)?.agentHostCapabilities.workspaceConversion === true,
			supportsChatWorkingDirectories: session => !!this._providerService.getProviderForSession(session)?.getDescriptor().capabilities?.multipleWorkingDirectories,
			listSessions: () => this.listSessions(),
			getSession: session => this._getSessionMetadata(session),
			getWorktreeRoots: workspace => this._gitService.getWorktreeRoots(workspace),
			createSession: config => this.createSession({ ...config, legacyChatUris: undefined }),
			getModels: () => {
				const models: IAgentModelInfo[] = [];
				for (const provider of this._providerService.getProviders()) {
					models.push(...provider.models.get());
				}
				return models;
			},
			getCreationDefaults: source => this._getServerToolCreationDefaults(source),
			startPrompt: (session, chat, prompt, delegation, credentials) => this._startSessionPrompt(session, chat, prompt, delegation, credentials),
			createChat: (session, chat, options, credentials) => this.createChat(session, chat, (options?.title !== undefined || options?.model !== undefined || options?.workingDirectories !== undefined)
				? {
					...(options.title !== undefined ? { title: options.title } : {}),
					...(options.model !== undefined ? { model: options.model } : {}),
					...(options.workingDirectories !== undefined ? { workingDirectories: options.workingDirectories } : {}),
				}
				: undefined, credentials),
			prepareChatWorkingDirectory: (session, directory, options) => this.prepareChatWorkingDirectory(session, directory, options),
			renameChat: (session, chat, title) => this._renameChatFromTool(session, chat, title),
			reportToolError: (toolName, error) => this._logService.error(`[AgentService] ${toolName} failed after the tool returned: ${toErrorMessage(error)}`),
			deleteSession: session => this.disposeSession(session),
			getChatContext: (session, chatId) => this._getChatContext(session, chatId),
			// Reads the `create_session` spawn depth from a session's `_meta` (0 when absent).
			getSessionSpawnDepth: session => readSessionSpawnDepth(this._stateManager.getSessionSummary(session.toString())?._meta),
			// Stamps a session's `create_session` spawn depth into its `_meta` (merging existing keys).
			setSessionSpawnDepth: (session, depth) => this._stateManager.dispatchServerAction(session.toString(), {
				type: ActionType.SessionMetaChanged,
				_meta: withSessionSpawnDepth(this._stateManager.getSessionSummary(session.toString())?._meta, depth),
			}),
			isChatMoveEnabled: () => this._configurationService.getRootValue(chatMoveRootConfigSchema, ChatMoveConfigKey.Enabled) === true,
			supportsChatMoves: session => !!this._providerService.getProviderForSession(session)?.getDescriptor().capabilities?.multipleChats,
			// Queued like the moves themselves: the check restores sessions, which must not overlap a running move.
			checkChatMove: move => this._logRefusedServerToolMove(this._chatMoveSequencer.queue(() => this._withMoveLeases(leases => this._checkServerToolMove(move, leases)))),
			applyChatMove: move => this._logRefusedServerToolMove(this._applyServerToolMove(move)),
			isKnownSessionLink: (session, chatId) => {
				const key = session.toString();
				const state = this._stateManager.getSessionState(key);
				const summary = state ? undefined : this._stateManager.getSessionSummary(key) ?? this._stateManager.getSurfacedSessionSummary(key);
				if (!state && !summary) {
					return false;
				}
				// A loaded or listed session is known; a chat of it only among its recorded chats, which a single-chat summary may not list.
				return chatId === undefined || (state?.chats ?? summary?.chats ?? []).some(chat => chat.resource === chatId || getAgentHostChatId(chat.resource) === chatId);
			},
		};
	}

	/** Dependency surface for the artifact server-tool group. */
	private _createArtifactServerToolAccessor(): IArtifactServerToolAccessor {
		return {
			isEnabled: () => this._isArtifactToolsEnabled(),
			associatePullRequests: (chat, urls) => this._gitStateService.associateRecordedPullRequests?.(chat, urls) ?? Promise.resolve({ pending: [], unmatched: [...urls] }),
			removePendingPullRequest: (session, chat, url) => this._gitStateService.removePendingRecordedPullRequest?.(session, chat, url) ?? Promise.resolve(),
			reportAssociationError: error => this._logService.warn('[AgentService] Failed to reconcile a recorded pull request', error),
			persist: async (session, artifacts) => {
				try {
					// Artifacts are published only once persisted: a failure must leave them as published.
					await this._persistOrderedListVisibleSessionState(URI.parse(session), {
						[SESSION_ARTIFACTS_KEY]: stringifySessionArtifacts(artifacts),
					}, undefined, { rollbackOnFailure: true });
				} catch (error) {
					this._logService.error('[AgentService] Failed to persist session artifacts', error);
					throw error;
				}
			},
		};
	}

	async removeSessionArtifact(session: URI, artifactId: string): Promise<void> {
		await this.restoreSession(session);
		const recordedChat = readSessionArtifacts(this._stateManager.getSessionState(session.toString())?._meta).find(artifact => artifact.id === artifactId)?.chat;
		const chatUri = recordedChat && this._chatOwnership.getChatOwner(recordedChat) === session.toString() ? recordedChat : this._requireDefaultChat(session);
		await new SessionArtifacts(this._stateManager, session.toString(), chatUri, this._createArtifactServerToolAccessor().persist).remove(artifactId, async artifact => {
			if (artifact.type === SessionArtifactType.PullRequest && artifact.link) {
				try {
					await this._gitStateService.removePendingRecordedPullRequest?.(session.toString(), artifact.chat ?? chatUri, artifact.link);
				} catch (error) {
					this._logService.warn('[AgentService] Failed to remove pending pull request association', error);
				}
			}
		});
	}

	readSavedChat(session: URI, chat?: URI): Promise<IAgentHostSavedChat> {
		return this._savedChats.readSavedChat(session, chat);
	}

	completeSavedChatContinuation(request: IAgentHostSavedChatContinuation): Promise<IAgentHostSavedChatContinuationResult> {
		const key = request.session.toString();
		const restoring = this._restoreSessionInFlight.get(key);
		const previous = this._savedChatContinuations.get(key);
		const operation = (previous?.catch(() => undefined) ?? Promise.resolve()).then(async () => {
			await restoring?.catch(() => undefined);
			await this._sessionResidency.waitForRelease(request.session);
			await this._whenBackgroundCatalogStateWritesIdle(key);
			// The continuation changes the source session and checks the destination's catalog; no other session's writes matter.
			await this._peerChatStore.whenSessionsIdle([request.session, request.destination]);
			return this.runWithChatCatalogLock(request.session, async () => {
				if (this._catalogSyncService.isSessionDeletionFenced(request.session) || this._sessionResidency.isBeingDisposed(request.session)) {
					throw new Error('Saved session is being deleted');
				}
				return this._savedChats.completeSavedChatContinuation(request, (target, validate, previouslyArchived) => this._archiveSavedChatContinuation(request.session, target, validate, previouslyArchived));
			});
		});
		this._savedChatContinuations.set(key, operation);
		void operation.finally(() => {
			if (this._savedChatContinuations.get(key) === operation) {
				this._savedChatContinuations.delete(key);
			}
		}).catch(() => undefined);
		return operation;
	}

	private async _archiveSavedChatContinuation(session: URI, target: AgentHostSavedChatArchiveTarget, validate: () => Promise<void>, previouslyArchived: boolean): Promise<boolean> {
		const key = session.toString();
		const isCurrent = () => !this._store.isDisposed
			&& !this._sessionResidency.isBeingDisposed(session) && !this._catalogSyncService.isSessionDeletionFenced(session);
		const isIdle = () => isCurrent() && !this._stateManager.hasActiveTurn(key);
		if (!isIdle()) {
			if (target.kind === 'session' && previouslyArchived && isCurrent()) {
				await this._restorePublishedSavedArchiveState(session, previouslyArchived, isCurrent);
			}
			return false;
		}
		const validateArchive = async () => {
			await validate();
			if (!isIdle()) {
				throw new Error('Saved session became busy before archival');
			}
		};
		await validateArchive();
		if (target.kind === 'session') {
			let persisted: boolean;
			try {
				persisted = await this._synchronizePassiveSessionMetadata(session, [{
					kind: 'session', key: AH_META_IS_ARCHIVED_DB_KEY, flag: SessionStatus.IsArchived, set: true, requestedSet: true,
				}], { validate: validateArchive, isCurrent: isIdle });
			} catch (error) {
				try {
					await this._restorePublishedSavedArchiveState(session, previouslyArchived, isCurrent);
				} catch (compensationError) {
					throw new AggregateError([error, compensationError], `Saved chat archival failed: ${toErrorMessage(error)}. Restoring archive metadata also failed: ${toErrorMessage(compensationError)}`);
				}
				throw error;
			}
			if (!persisted || !isIdle()) {
				if (!isIdle()) {
					await this._restorePublishedSavedArchiveState(session, previouslyArchived, isCurrent);
				}
				return false;
			}
			if (this._stateManager.getSessionState(key)) {
				const action: IIsArchivedChangedAction = { type: ActionType.SessionIsArchivedChanged, isArchived: true };
				this._savedChatArchivePublications.add(action);
				try {
					this._additionalWorktreeLifecycleService.runWithPreservedWorktrees(session, () => this._stateManager.dispatchServerAction(key, action));
				} finally {
					this._savedChatArchivePublications.delete(action);
				}
			} else {
				this._stateManager.setSurfacedSessionStatusFlag(key, SessionStatus.IsArchived, true);
				this._clearAgentMergeIndex(session);
			}
		} else {
			await this._peerChatStore.archiveSavedChat(session, target.chat, validateArchive);
			const summary = this._stateManager.getSessionSummary(key) ?? this._stateManager.getSurfacedSessionSummary(key);
			const chats = summary?.chats?.map(chat => chat.resource === target.chat.toString() ? { ...chat, status: withSessionStatusFlag(chat.status ?? SessionStatus.Idle, SessionStatus.IsArchived, true) } : chat);
			if (this._stateManager.getChatState(target.chat.toString())) {
				this._stateManager.dispatchServerAction(target.chat.toString(), { type: ActionType.ChatIsArchivedChanged, isArchived: true });
			} else if (this._stateManager.getSessionState(key)) {
				const status = chats?.find(chat => chat.resource === target.chat.toString())?.status;
				this._stateManager.dispatchServerAction(key, { type: ActionType.SessionChatUpdated, chat: target.chat.toString(), changes: { status } });
			} else if (summary) {
				this._setSurfacedChatArchived(key, target.chat.toString(), true);
			}
			await this._markCatalogPayloadDirty(key);
			this._catalogReconciliationService.schedule();
		}
		this._invalidateSessionList();
		return true;
	}

	private async _restorePublishedSavedArchiveState(session: URI, previouslyArchived: boolean, isCurrent: () => boolean): Promise<void> {
		const summary = this._stateManager.getSessionSummary(session.toString()) ?? this._stateManager.getSurfacedSessionSummary(session.toString());
		const archived = summary ? isSessionStatusArchived(summary.status) : previouslyArchived;
		const restored = await this._synchronizePassiveSessionMetadata(session, [{
			kind: 'session', key: AH_META_IS_ARCHIVED_DB_KEY, flag: SessionStatus.IsArchived, set: archived, requestedSet: archived,
		}], {
			validate: async () => {
				if (!isCurrent()) {
					throw new Error('Saved session changed before archive metadata could be restored');
				}
			},
			isCurrent,
		});
		if (!restored) {
			throw new Error('Saved session archive metadata could not be restored');
		}
	}

	async importSession(session: URI): Promise<void> {
		await this.restoreSession(session);
		if (!await this._sessionRegistry.adoptExternalSession(session)) {
			throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session not found: ${session.toString()}`);
		}
	}

	async installSandboxCertificate(chat: string, scopeId: string): Promise<void> {
		await this._runSandboxCertificateOperation(chat, scopeId, 'installSandboxCertificate');
	}

	async rotateSandboxCertificate(chat: string, scopeId: string): Promise<void> {
		await this._runSandboxCertificateOperation(chat, scopeId, 'rotateSandboxCertificate');
	}

	async removeSandboxCertificate(chat: string, scopeId: string): Promise<void> {
		await this._runSandboxCertificateOperation(chat, scopeId, 'removeSandboxCertificate');
	}

	private async _runSandboxCertificateOperation(chat: string, scopeId: string, operation: 'installSandboxCertificate' | 'rotateSandboxCertificate' | 'removeSandboxCertificate'): Promise<void> {
		const owner = this._chatOwnership.getChatOwner(chat);
		const provider = owner === undefined ? undefined : this._providerService.getProviderForSession(URI.parse(owner));
		if (!provider?.[operation]) {
			throw new Error('Sandbox certificate management is unavailable for this chat.');
		}
		await provider[operation]!(chat, scopeId);
	}

	async stopBackgroundWork(chat: URI, id: string): Promise<boolean> {
		// A chat that lists background work is live, so there is nothing to restore first.
		const owner = this._chatOwnership.getChatOwner(chat.toString());
		if (owner === undefined) {
			this._logService.trace(`[AgentService] stopBackgroundWork ignored for unregistered chat: ${chat.toString()}`);
			return false;
		}
		return await this._providerService.getProviderForSession(URI.parse(owner))?.stopBackgroundWork?.(chat, id) ?? false;
	}

	private _isArtifactToolsEnabled(): boolean {
		return this._configurationService.getRootValue(platformRootSchema, AgentHostArtifactToolsConfigKey) === true;
	}

	/**
	 * Persists the GitHub state of each folder of a restored session that was
	 * recorded before each folder had its own state. The original single-folder
	 * entry is kept for older builds. Best effort: a failed write is retried on the next restore.
	 */
	private async _persistMigratedGitHubData(session: URI, meta: SessionSummaryMeta | undefined, sessionWorkingDirectory: string | undefined): Promise<void> {
		try {
			const gitHubData = readSessionGitHubData(meta);
			const migrated = sessionWorkingDirectory !== undefined && readSessionGitHubState(meta, sessionWorkingDirectory) !== undefined;
			if (!migrated) {
				return;
			}
			// The single-folder key is never deleted; a folder map entry takes precedence over it on read.
			if (gitHubData.size > 0) {
				await this._sessionStateStore.writeMetadata(session, session, {
					[META_GITHUB_DATA_STATE]: JSON.stringify(Object.fromEntries(gitHubData)),
				}, SessionStateMirrorFlush.Immediate);
			}
		} catch (error) {
			this._logService.warn(`[AgentService] Failed to migrate the GitHub state of ${session.toString()}: ${toErrorMessage(error)}`);
		}
	}

	/**
	 * Reads a session's persisted artifacts and references, warning when any are
	 * lost. A corrupt row would otherwise empty a session's artifacts pill with
	 * no trace of why the agent's recorded work disappeared.
	 */
	private _readPersistedArtifacts(value: string | undefined, session: string, logPrefix: string): readonly ISessionArtifact[] {
		const { artifacts, error, dropped } = parseSessionArtifacts(value);
		if (error) {
			this._logService.warn(`${logPrefix} Failed to parse artifacts for ${session}: ${toErrorMessage(error)}`);
		} else if (dropped > 0) {
			this._logService.warn(`${logPrefix} Dropped ${dropped} malformed artifact(s) for ${session}`);
		}
		return artifacts;
	}

	private _readPersistedSessionInitiator(value: string | undefined, session: string) {
		if (value === undefined) {
			return undefined;
		}
		try {
			return parseSessionInitiator(value);
		} catch (error) {
			this._logService.warn(`[AgentService] Failed to read session initiator for ${session}`, error);
			return undefined;
		}
	}

	private _readPersistedRemoteSessionOrigin(value: string | undefined, session: string): IRemoteSessionOrigin | undefined {
		if (value === undefined) {
			return undefined;
		}
		try {
			return parseRemoteSessionOrigin(value);
		} catch (error) {
			this._logService.warn(`[AgentService] Failed to read remote session origin for ${session}`, error);
			return undefined;
		}
	}

	private _getServerToolCreationDefaults(source: URI): ISessionCreationDefaults | undefined {
		const session = this._stateManager.getSessionState(source.toString());
		if (!session) {
			return undefined;
		}

		const model = session.activeTurn
			? session.activeTurn.message.model
			: session.draft
				? session.draft.model
				: session.turns.at(-1)?.message.model;
		const sourceConfig = getNonMergeSessionConfigValues(session.config?.values);
		const config = this._providerService.getProvider(session.provider)?.getInheritedChatConfig(sourceConfig);
		const isolation = sourceConfig[SessionConfigKey.Isolation];
		return {
			provider: session.provider,
			...(model !== undefined ? { model } : {}),
			...(config !== undefined ? { config } : {}),
			...(isolation === 'folder' || isolation === 'worktree' ? { isolation } : {}),
			...(session.project ? { project: URI.parse(session.project.uri) } : {}),
		};
	}

	/**
	 * Starts a turn requested by the session orchestration server tools
	 * (`create_session`, `send_message`) by dispatching a
	 * `ChatTurnStarted` and routing it through the same side-effects path a
	 * client-initiated turn takes (which sends the message to the provider).
	 */
	private async _startSessionPrompt(session: URI, chat: URI, prompt: string, delegation?: IAgentMessageDelegationMeta, credentials?: IAgentHostCredentialSource): Promise<void> {
		// The calling agent authored this prompt, not the user.
		const message: Message = {
			text: prompt,
			origin: { kind: MessageKind.Agent },
			...(delegation ? { _meta: toAgentMessageDelegationMeta(delegation) } : {}),
		};
		await this._startSessionMessage(chat, message, credentials);
	}

	private async _startAutomationMessage(session: URI, message: Message): Promise<void> {
		await this._startSessionMessage(URI.parse(this._requireDefaultChat(session)), message);
	}

	private async _startSessionMessage(chat: URI, message: Message, credentials?: IAgentHostCredentialSource): Promise<void> {
		this._turnService.startTurnMessage(chat, message, credentials);
	}

	private async _cancelAutomationSession(session: URI): Promise<boolean> {
		const chat = this._defaultChat(session);
		const activeTurn = chat === undefined ? undefined : this._stateManager.getChatState(chat)?.activeTurn;
		if (chat === undefined || !activeTurn || this._workspaceConversionService.isConversionTurn(chat, activeTurn.id)) {
			return false;
		}
		const startedAt = Date.parse(activeTurn.startedAt);
		const duration = Number.isFinite(startedAt) ? Math.max(0, Date.now() - startedAt) : 0;
		const action = { type: ActionType.ChatTurnCancelled, turnId: activeTurn.id, duration } as const;
		this._stateManager.dispatchServerAction(chat, action);
		this._sideEffects.handleAction(chat, action);
		return true;
	}

	private async _resumeAutomationTurn(session: URI, turnId: string): Promise<boolean> {
		const chat = this._defaultChat(session);
		if (chat === undefined) {
			return false;
		}
		const { turn, rejection } = this._getResumableTurn(chat, session.toString(), turnId);
		if (rejection !== undefined) {
			this._logService.info(`[AgentService] Cannot resume automation turn: chat=${chat}, turnId=${turnId}, reason=${rejection}`);
			return false;
		}
		const action = { type: ActionType.ChatTurnResume, turnId } as const;
		this._stateManager.dispatchServerAction(chat, action);
		this._sideEffects.handleAction(chat, action, undefined, AgentHostClientType.Unknown, turn);
		return true;
	}

	private _startAgentMergePrompt(chat: string, turnId: string, prompt: string, credentials?: IAgentHostCredentialSource): boolean {
		if (this._stateManager.getChatState(chat)?.activeTurn) {
			return false;
		}
		const message: Message = {
			text: prompt,
			origin: { kind: MessageKind.SystemNotification },
			_meta: toAgentMergeMessageMeta(),
		};
		const action = { type: ActionType.ChatTurnStarted, turnId, startedAt: new Date().toISOString(), message } as const;
		this._stateManager.dispatchServerAction(chat, action);
		this._sideEffects.handleAction(chat, action, undefined, AgentHostClientType.Unknown, undefined, false, undefined, credentials);
		return true;
	}

	/**
	 * Reports an Agent Merge state change in the folder's owning chat.
	 *
	 * The notice is dispatched as server state only — `AgentSideEffects` is
	 * deliberately not involved — so it reaches clients without ever being sent
	 * to the provider. It needs a turn of its own to live on, because the chat
	 * reducer drops response parts that no active turn claims; that turn's
	 * message is hidden so only the notice is rendered, and it is recorded as a
	 * local turn because the SDK transcript replayed on restore has never seen
	 * it.
	 *
	 * A notice raised while the agent holds a turn has to wait: starting a turn
	 * now would displace the running one, and appending to it would leave the
	 * notice on a turn the provider owns, so restore would replay that turn
	 * without it.
	 */
	private _postAgentMergeNotice(chat: string, kind: AgentSystemNotificationKind, content: string): void {
		if (this._stateManager.getChatState(chat)?.activeTurn) {
			const pending = this._pendingAgentMergeNotices.get(chat);
			if (pending) {
				pending.notices.push({ kind, content });
			} else {
				this._pendingAgentMergeNotices.set(chat, { notices: [{ kind, content }] });
			}
			this._logService.debug(`[AgentService] Deferring an Agent Merge notice until the chat is idle: chat=${chat}`);
			return;
		}
		this._writeAgentMergeNotice(chat, kind, content);
	}

	/** Emits the notices that were waiting for a chat's turn to end. */
	private _flushAgentMergeNotices(chat: string): void {
		const pending = this._pendingAgentMergeNotices.get(chat);
		if (!pending) {
			return;
		}
		this._pendingAgentMergeNotices.delete(chat);
		for (const { kind, content } of pending.notices) {
			this._writeAgentMergeNotice(chat, kind, content);
		}
	}

	/** Posts the notices that were waiting for a removed chat to another chat instead. */
	private _moveAgentMergeNotices(from: string, to: string): void {
		const pending = this._pendingAgentMergeNotices.get(from);
		if (!pending) {
			return;
		}
		this._pendingAgentMergeNotices.delete(from);
		for (const { kind, content } of pending.notices) {
			this._postAgentMergeNotice(to, kind, content);
		}
	}

	private _flushAgentMergeNoticesForSession(session: string): void {
		for (const chat of [...this._pendingAgentMergeNotices.keys()]) {
			if (this._chatOwnership.getChatOwner(chat) === session && !this._stateManager.getChatState(chat)?.activeTurn) {
				this._flushAgentMergeNotices(chat);
			}
		}
	}

	/** Writes one Agent Merge notice as a completed, host-owned local turn. */
	private _writeAgentMergeNotice(channel: string, kind: AgentSystemNotificationKind, content: string): void {
		const session = this._chatOwnership.getChatOwner(channel);
		const turnId = generateUuid();
		this._stateManager.dispatchServerAction(channel, {
			type: ActionType.ChatTurnStarted,
			turnId,
			startedAt: new Date().toISOString(),
			message: withMessageRequestHiddenFromTranscript({ text: content, origin: { kind: MessageKind.SystemNotification } }, true),
		});
		this._stateManager.dispatchServerAction(channel, {
			type: ActionType.ChatResponsePart,
			turnId,
			part: {
				kind: ResponsePartKind.SystemNotification,
				content,
				_meta: toAgentSystemNotificationMeta({ kind }),
			},
		});
		this._stateManager.dispatchServerAction(channel, { type: ActionType.ChatTurnComplete, turnId, duration: 0 });
		const turns = this._stateManager.getSessionState(channel)?.turns;
		const recorded = turns?.find(turn => turn.id === turnId);
		if (session !== undefined && turns && recorded) {
			this._localTurns.record(session, channel, recorded, this._localTurns.findAnchorTurnId(channel, turns, turnId));
		}
	}

	/**
	 * Cancels a repair turn this host started for Agent Merge, so a stopped or
	 * revoked controller cannot leave an autonomous turn running.
	 */
	private _cancelAgentMergePrompt(chat: string, turnId: string): void {
		const action = { type: ActionType.ChatTurnCancelled, turnId, duration: 0 } as const;
		this._stateManager.dispatchServerAction(chat, action);
		this._sideEffects.handleAction(chat, action);
	}

	/**
	 * Reads a point-in-time snapshot of a session's chat conversation for the
	 * `get_session_context` server tool. Targets the session's default chat, or a
	 * specific peer chat when `chatId` is provided. Returns `undefined` when no
	 * live conversation state exists (e.g. a cold/unsubscribed session).
	 */
	private async _getChatContext(session: URI, chatId?: string): Promise<IChatContextSnapshot | undefined> {
		let chatState: ChatState | undefined;
		if (chatId) {
			const chats = (await this._getSessionMetadata(session))?.chats ?? [];
			const chat = getSessionChatResource({ chats: chats.map(entry => ({ resource: entry.chat.toString() })) }, chatId, this._chatOwnership.getDefaultChat(session.toString()));
			chatState = chat === undefined ? undefined : await this._stateManager.resolveChatState(chat);
		} else {
			chatState = this._stateManager.getDefaultChatState(session.toString());
		}
		if (!chatState) {
			return undefined;
		}
		return {
			turns: chatState.turns,
			...(chatState.activeTurn ? { activeTurn: { message: chatState.activeTurn.message, responseParts: chatState.activeTurn.responseParts } } : {}),
			pendingMessages: [
				...getPendingSteeringMessages(chatState).map(pending => ({ kind: PendingMessageKind.Steering, pending })),
				...(chatState.queuedMessages?.filter(pending => pending.kind !== PendingMessageKind.Steering).map(pending => ({ kind: PendingMessageKind.Queued, pending })) ?? []),
			],
			hasMoreHistory: !!chatState.turnsNextCursor,
		};
	}

	private async _renameChatFromTool(session: URI, chat: URI, title: string): Promise<IRenameTitleResult> {
		validateRenameTitle(title, SessionServerToolName.RenameChat);
		const isDefaultChat = this._chatOwnership.isDefaultChat(session.toString(), chat.toString());
		if (!isDefaultChat && !await this._peerChatExists(session, chat)) {
			throw new Error(`Invalid ${SessionServerToolName.RenameChat} input: chat must match a known non-default chat.`);
		}

		if (isDefaultChat) {
			this._sideEffects.markTitleRenamed(session.toString());
		}
		this._sideEffects.markTitleRenamed(session.toString(), chat.toString());
		await this._peerChatStore.persistMetadata(session, chat, {
			[SESSION_CUSTOM_TITLE_KEY]: title,
			[SESSION_CUSTOM_TITLE_SOURCE_KEY]: AGENT_HOST_TITLE_SOURCE_AGENT,
		});
		await this._persistOrderedListVisibleSessionState(session, {
			[customChatTitleMetadataKey(chat.toString())]: title,
			[customChatTitleSourceMetadataKey(chat.toString())]: AGENT_HOST_TITLE_SOURCE_AGENT,
			...(isDefaultChat ? {
				[SESSION_CUSTOM_TITLE_KEY]: title,
				[SESSION_CUSTOM_TITLE_SOURCE_KEY]: AGENT_HOST_TITLE_SOURCE_AGENT,
			} : {}),
		});
		const state = this._stateManager.getSessionState(session.toString());
		if (state) {
			if (isDefaultChat && state.title !== title) {
				this._stateManager.dispatchServerAction(session.toString(), { type: ActionType.SessionTitleChanged, title });
			}
			this._stateManager.updateChatTitle(session.toString(), chat.toString(), title);
		}
		return { title };
	}

	private async _peerChatExists(session: URI, chat: URI): Promise<boolean> {
		if (this._stateManager.getSessionState(session.toString())?.chats.some(candidate => candidate.resource === chat.toString())) {
			return true;
		}
		const central = await this._readCentralChatCatalog(session);
		if (central) {
			return central.some(candidate => candidate.kind === 'peer' && candidate.uri === chat.toString());
		}
		const persisted = await this._peerChatStore.tryRead(session);
		return persisted?.some(candidate => candidate.uri === chat.toString()) === true;
	}

	private _toSessionMetadata(metadata: IAgentChatMetadata, session: URI, provider?: AgentProvider): IAgentSessionMetadata {
		const { chat: _chat, changesets: _changesets, ...rest } = metadata;
		return {
			...rest,
			session,
			provider: provider ?? this._providerService.getProviderForSession(session)?.id,
		};
	}

	/** `undefined` means the provider catalog is unavailable; deferred waits for external readiness. */
	private async _enumerateLegacyProviderSessions(provider: IAgent): Promise<readonly IAgentSessionMetadata[] | undefined | typeof AgentChatMigrationDeferred> {
		const chats = await provider.listChatsToMigrate();
		if (chats === AgentChatMigrationDeferred || chats === undefined) {
			return chats;
		}
		const sessions = chats.map(({ session, ...metadata }) => this._toSessionMetadata(metadata, session, provider.id));
		if (!usesStandardSessionUris(provider.id)) {
			return sessions;
		}
		const resolved = await this._sessionRegistry.resolveDiscoveredSessionIdentities(provider.id, sessions.map(metadata => metadata.session));
		return sessions.flatMap(metadata => {
			const identity = resolved.get(metadata.session.toString());
			if (identity?.status === 'conflict') {
				this._logService.warn(`[AgentService] ${identity.message}; preserving both identities without importing this backing`);
				return identity.sessions.map(session => ({ ...metadata, session }));
			}
			return [identity?.existing ? { ...metadata, session: identity.session } : metadata];
		});
	}

	/**
	 * Registry metadata for one session. The host offers its stable timestamps
	 * as a fallback, but the provider decides whether a passive metadata miss
	 * means "not initialized yet" or "not found".
	 */
	private async _registeredSessionMetadata(agent: IAgent, session: URI, external: boolean, fallback?: Pick<IRegisteredSession, 'startTime' | 'modifiedTime'>): Promise<IAgentSessionMetadata | undefined> {
		const backing = await this._readDefaultChatBacking(session);
		const chat = URI.parse(backing.chat);
		const metadata = await agent.getChatMetadata(
			chat,
			this._chatContext(session, chat, backing.storage),
			backing.providerData,
			fallback ? { registryFallback: { startTime: fallback.startTime, modifiedTime: fallback.modifiedTime } } : undefined,
		);
		if (!metadata) {
			return undefined;
		}
		if (fallback && metadata.modifiedTime > fallback.modifiedTime) {
			// This computation already returns the fresher metadata, and settled
			// list computations are not cached. Persist without invalidating the
			// in-flight computation into a redundant second pass.
			await this._advanceSessionModifiedTime(session, metadata.modifiedTime, false);
		}
		const sessionMetadata = this._toSessionMetadata(metadata, session, agent.id);
		return {
			...sessionMetadata,
			_meta: withSessionExternal(sessionMetadata._meta, external),
		};
	}

	/**
	 * Loads where moved chats came from (Block 4), which decides what older clients may see. Off the listing's path: older
	 * clients wait for it, others don't. A read is retried once; while it fails, the origins are unknown (older clients
	 * see no chat that may have moved) and the next session listing reads them again.
	 */
	private _whenMovedChatOriginsLoaded(): Promise<void> {
		if (!this._movedChatOriginsLoaded) {
			this._stateManager.beginMovedChatOriginsLoad();
		}
		return this._movedChatOriginsLoaded ??= (async () => {
			for (let attempt = 1; ; attempt++) {
				try {
					const origins = await this._orchestratorDatabase.listMovedChatsV2();
					this._stateManager.recordMovedChatOrigins(origins);
					this._stateManager.setMovedChatOriginsKnown(true);
					void this._attachmentMigration.resume(origins.keys());
					return;
				} catch (err) {
					if (attempt < 2) {
						this._logService.warn('[AgentService] Failed to read the origins of moved chats; retrying', err);
						continue;
					}
					this._logService.error('[AgentService] Failed to read the origins of moved chats; older clients see no chat that may have moved until they can be read', err);
					this._stateManager.setMovedChatOriginsKnown(false);
					this._movedChatOriginsLoaded = undefined;
					return;
				}
			}
		})();
	}

	/**
	 * Loads the durable provisional markers into {@link _provisionalSessionKeys}
	 * once. Started at construction and awaited before draft suppression;
	 * a read failure leaves the mirror empty, surfacing sessions rather than
	 * hiding them.
	 */
	private _whenProvisionalSessionKeysLoaded(): Promise<void> {
		return this._provisionalSessionKeysLoaded ??= (async () => {
			try {
				for (const session of await this._sessionRegistry.listProvisional()) {
					this._provisionalSessionKeys.add(session);
				}
			} catch (err) {
				this._logService.warn('[AgentService] Failed to read provisional session markers', err);
			}
		})();
	}

	/**
	 * Clears a session's provisional marker durably and in the mirror listing
	 * reads. Setting it happens in the registration transaction instead, so a
	 * crash cannot separate a registration from its marker.
	 */
	private async _clearSessionProvisional(session: URI): Promise<void> {
		await this._sessionRegistry.setProvisional(session, false);
		this._provisionalSessionKeys.delete(session.toString());
	}

	/**
	 * Drops sessions that are still marked provisional and whose provider cannot
	 * describe them: they stay hidden from listing until their backing can be
	 * confirmed, even when the provider's catalog is unavailable (#321269).
	 *
	 * A materialized session whose marker-clear never landed is kept visible
	 * when its provider confirms the backing, and the live-state overlay
	 * preserves sessions with turn activity.
	 */
	private async _withoutUnmaterializedProvisionalSessions(sessions: readonly IAgentSessionMetadata[], registered: readonly IRegisteredSession[]): Promise<readonly IAgentSessionMetadata[]> {
		if (sessions.length === 0 || this._provisionalSessionKeys.size === 0) {
			return sessions;
		}
		const registeredByKey = new Map(registered.map(entry => [entry.session.toString(), entry]));
		const unmaterialized = new Set<string>();
		await Promise.all(sessions.map(async metadata => {
			const key = metadata.session.toString();
			const entry = this._provisionalSessionKeys.has(key) ? registeredByKey.get(key) : undefined;
			if (!entry) {
				return;
			}
			const agent = this._providerService.getProvider(entry.provider);
			try {
				if (!agent || !await this._registeredSessionMetadata(agent, entry.session, entry.external)) {
					unmaterialized.add(key);
				}
			} catch (err) {
				// An erroring provider is not evidence that the backing is missing; hide the row until confirmation succeeds.
				unmaterialized.add(key);
				this._logService.warn(`[AgentService] listSessions: hiding unconfirmed provisional session ${key}`, err);
			}
		}));
		return unmaterialized.size === 0
			? sessions
			: sessions.filter(metadata => !unmaterialized.has(metadata.session.toString()));
	}

	/**
	 * Publishes the recorded scratch folders a listed session or its chats work in (`vscode.scratchFolders`).
	 * Payloads never persist them: like {@link _publishWorkingDirectoryIdentities}, they are computed at publish time.
	 */
	private _withListedScratchFolders(metadata: IAgentSessionMetadata, chatFolders: readonly string[]): IAgentSessionMetadata {
		const folders = publishedScratchFolders(folder => this._stateManager.isScratchFolder(folder), readSessionWorkspaceless(metadata._meta), metadata.workingDirectories?.map(folder => folder.toString()) ?? [], chatFolders);
		if (folders.length === 0 && readSessionScratchFolders(metadata._meta).length === 0) {
			return metadata;
		}
		return { ...metadata, _meta: withSessionScratchFolders(metadata._meta, folders) };
	}

	private async _legacyRegisteredSessionMetadata(registered: IRegisteredSession, prefetch: SessionStateValuesPrefetch): Promise<ILegacyRegisteredSessionMetadata | undefined> {
		const agent = this._providerService.getProvider(registered.provider);
		if (!agent) {
			return undefined;
		}
		const metadata = await this._registeredSessionMetadata(agent, registered.session, registered.external, registered);
		if (!metadata) {
			return undefined;
		}
		const sanitized = { ...metadata, _meta: withSessionMultiRootMetadata(metadata._meta, undefined) };
		try {
			const session = metadata.session.toString();
			const defaultChatTitleKey = customChatTitleMetadataKey(await this._readDefaultChat(metadata.session));
			const changesetKeys = this._changesetCoordinator.getListMetadataKeys(session);
			const metadataKeys: Record<string, true> = changesetKeys
				? { customTitle: true, configValues: true, [defaultChatTitleKey]: true, [AH_META_IS_READ_DB_KEY]: true, [AH_META_IS_ARCHIVED_DB_KEY]: true, [AH_META_IS_DONE_DB_KEY]: true, [AH_META_CREATED_BY_SESSION_DB_KEY]: true, [AH_META_WORKSPACELESS_DB_KEY]: true, [AH_META_EHCLI_ADOPTED_DB_KEY]: true, [AH_META_DEV_CONTAINER_WORKTREE_DB_KEY]: true, [SESSION_META_MULTI_ROOT_KEY]: true, [SESSION_META_FOLDER_PICKER_KEY]: true, [SESSION_ARTIFACTS_KEY]: true, [CHAT_BACKING_METADATA_KEY]: true, [WORKTREE_META_REPOSITORY_ROOT]: true, ...GIT_DB_METADATA_KEYS, ...changesetKeys }
				: { customTitle: true, [defaultChatTitleKey]: true, [AH_META_IS_READ_DB_KEY]: true, [AH_META_IS_ARCHIVED_DB_KEY]: true, [AH_META_IS_DONE_DB_KEY]: true, [AH_META_CREATED_BY_SESSION_DB_KEY]: true, [AH_META_WORKSPACELESS_DB_KEY]: true, [AH_META_EHCLI_ADOPTED_DB_KEY]: true, [AH_META_DEV_CONTAINER_WORKTREE_DB_KEY]: true, [SESSION_META_MULTI_ROOT_KEY]: true, [SESSION_META_FOLDER_PICKER_KEY]: true, [SESSION_ARTIFACTS_KEY]: true, [CHAT_BACKING_METADATA_KEY]: true, [WORKTREE_META_REPOSITORY_ROOT]: true, ...GIT_DB_METADATA_KEYS };
			metadataKeys[REMOTE_SESSION_ORIGIN_METADATA_KEY] = true;
			metadataKeys[SESSION_WORKING_DIRECTORIES_KEY] = true;
			metadataKeys[SESSION_INITIATOR_METADATA_KEY] = true;
			metadataKeys[WORKTREE_FOLDERS_KEY] = true;
			const [snapshot] = await this._orchestratorDatabase.readCatalogSnapshot([session]);
			if (snapshot?.authorityVersion === 2) {
				delete metadataKeys[defaultChatTitleKey];
			}
			const persisted: Record<string, string | undefined> = Object.fromEntries(await this._sessionStateStore.readWithoutImport(metadata.session, Object.keys(metadataKeys), prefetch));
			if (isAgentHostChatBacking(metadata.session, !!persisted[CHAT_BACKING_METADATA_KEY])) {
				return undefined;
			}
			let updated = sanitized;
			const workingDirectories = parseSessionWorkingDirectories(persisted[SESSION_WORKING_DIRECTORIES_KEY]);
			if (workingDirectories !== undefined) {
				updated = { ...updated, workingDirectories: workingDirectories.map(directory => URI.parse(directory)) };
			}
			const persistedTitle = persisted.customTitle
				|| await this._readDefaultChatTitle(metadata.session, persisted[defaultChatTitleKey]);
			if (persistedTitle) {
				updated = { ...updated, summary: persistedTitle };
			}
			if (persisted[AH_META_IS_READ_DB_KEY] !== undefined) {
				updated = { ...updated, status: withSessionStatusFlag(updated.status ?? SessionStatus.Idle, SessionStatus.IsRead, persisted[AH_META_IS_READ_DB_KEY] === 'true') };
			}
			const persistedArchived = persisted[AH_META_IS_ARCHIVED_DB_KEY] ?? persisted[AH_META_IS_DONE_DB_KEY];
			if (persistedArchived !== undefined && (!readSessionEhcliAdoptable(metadata._meta)
				|| readSessionEhcliAdopted(metadata._meta) || persisted[AH_META_EHCLI_ADOPTED_DB_KEY] === 'true')) {
				updated = { ...updated, status: withSessionStatusFlag(updated.status ?? SessionStatus.Idle, SessionStatus.IsArchived, persistedArchived === 'true') };
			}
			const creationReference = parseSessionCreationReference(persisted[AH_META_CREATED_BY_SESSION_DB_KEY]);
			if (creationReference) {
				updated = { ...updated, _meta: withSessionCreationReference(updated._meta, creationReference) };
			}
			const remoteOrigin = this._readPersistedRemoteSessionOrigin(persisted[REMOTE_SESSION_ORIGIN_METADATA_KEY], session);
			if (remoteOrigin) {
				updated = { ...updated, _meta: withRemoteSessionOrigin(updated._meta, remoteOrigin) };
			}
			const initiator = this._readPersistedSessionInitiator(persisted[SESSION_INITIATOR_METADATA_KEY], session);
			if (initiator) {
				updated = { ...updated, _meta: withSessionInitiator(updated._meta, initiator) };
			}
			if (persisted[META_GIT_STATE]) {
				try {
					const gitState = JSON.parse(persisted[META_GIT_STATE]) as ISessionGitState;
					updated = { ...updated, _meta: withSessionGitState(updated._meta, gitState) };
				} catch (error) {
					this._logService.warn(`[AgentService][listSessions] Failed to parse Git state for ${metadata.session}`, error);
				}
			}
			if (persisted[META_GIT_DATA_STATE]) {
				try {
					updated = { ...updated, _meta: withSessionGitData(updated._meta, parseSessionGitData(JSON.parse(persisted[META_GIT_DATA_STATE]))) };
				} catch (error) {
					this._logService.warn(`[AgentService][listSessions] Failed to parse folder-scoped Git state for ${metadata.session}`, error);
				}
			}
			updated = {
				...updated,
				_meta: withPersistedGitHubData(updated._meta, persisted, metadata.workingDirectories?.[0]?.toString(), error => {
					this._logService.warn(`[AgentService][listSessions] Failed to parse GitHub state for ${metadata.session}`, error);
				}),
			};
			if (persisted[META_SOURCE_CONTROL_STATE]) {
				try {
					const sourceControlState = parsePersistedSourceControlState(persisted[META_SOURCE_CONTROL_STATE]);
					updated = { ...updated, _meta: withSessionSourceControlState(updated._meta, sourceControlState) };
				} catch (error) {
					this._logService.warn(`[AgentService][listSessions] Failed to parse source-control state for ${metadata.session}`, error);
				}
			}
			if (persisted[AH_META_WORKSPACELESS_DB_KEY] !== undefined) {
				updated = { ...updated, _meta: withSessionWorkspaceless(updated._meta, persisted[AH_META_WORKSPACELESS_DB_KEY] === 'true') };
			}
			if (persisted[AH_META_EHCLI_ADOPTED_DB_KEY] !== undefined) {
				updated = { ...updated, _meta: withSessionEhcliAdopted(updated._meta, persisted[AH_META_EHCLI_ADOPTED_DB_KEY] === 'true') };
			}
			if (persisted[AH_META_DEV_CONTAINER_WORKTREE_DB_KEY]) {
				try {
					const devContainerWorktree = readAgentDevContainerWorktreeMetadata({
						[AH_META_DEV_CONTAINER_WORKTREE_DB_KEY]: JSON.parse(persisted[AH_META_DEV_CONTAINER_WORKTREE_DB_KEY]),
					});
					if (devContainerWorktree) {
						updated = { ...updated, _meta: withAgentDevContainerWorktreeMetadata(updated._meta, devContainerWorktree.handle) };
					}
				} catch { }
			}
			const multiRoot = parseSessionMultiRootMetadata(persisted[SESSION_META_MULTI_ROOT_KEY]);
			if (multiRoot) {
				updated = { ...updated, _meta: withSessionMultiRootMetadata(updated._meta, multiRoot) };
			}
			const artifacts = this._readPersistedArtifacts(persisted[SESSION_ARTIFACTS_KEY], session, '[AgentService][listSessions]');
			if (artifacts.length > 0) {
				updated = { ...updated, _meta: withSessionArtifacts(updated._meta, artifacts) };
			}
			const folderPickerDecision = parseSessionFolderPickerDecision(persisted[SESSION_META_FOLDER_PICKER_KEY]);
			if (folderPickerDecision) {
				updated = { ...updated, _meta: withSessionFolderPickerDecision(updated._meta, folderPickerDecision) };
			}
			// Its own recorded worktree, else a shared worktree a move recorded as its primary folder (Block 5).
			const worktreeProject = worktreeProjectFromRepositoryRoot(persisted[WORKTREE_META_REPOSITORY_ROOT]
				?? sessionWorktreeFolderRepositoryRoot(persisted[WORKTREE_FOLDERS_KEY], updated.workingDirectories?.[0]));
			if (worktreeProject) {
				updated = { ...updated, project: worktreeProject };
			}
			return {
				metadata: this._changesetCoordinator.decorateListEntry(updated, persisted as Record<string, string | undefined>, true),
				persistedTitle,
			};
		} catch (error) {
			this._logService.warn(`[AgentService] Failed to read session metadata overlay for ${metadata.session}`, error);
			return { metadata: sanitized, persistedTitle: await this._readPersistedSessionTitle(metadata.session, prefetch) };
		}
	}

	private async _getSessionMetadata(session: URI, registeredOverride?: IRegisteredSession): Promise<IAgentSessionMetadata | undefined> {
		const registered = registeredOverride ?? await this._sessionRegistry.get(session, entry => this._migrateRegisteredSession(entry));
		if (!registered) {
			return undefined;
		}
		const agent = this._providerService.getProvider(registered.provider);
		const liveSummary = this._stateManager.getSessionSummary(session.toString());
		if (liveSummary) {
			const metadata = (liveSummary.workingDirectories === undefined && agent
				? await this._registeredSessionMetadata(agent, session, registered.external, registered)
				: undefined) ?? {
				session,
				startTime: registered.startTime,
				modifiedTime: Date.parse(liveSummary.modifiedAt),
			};
			return this._withLiveSessionMetadata(metadata, liveSummary);
		}
		if (!agent) {
			return undefined;
		}
		return this._registeredSessionMetadata(agent, session, registered.external, registered);
	}

	private _withLiveSessionMetadata(metadata: IAgentSessionMetadata, liveSummary: SessionSummary, trustLiveMultiRoot = true, trustLiveTitle = true): IAgentSessionMetadata {
		let _meta = liveSummary._meta !== undefined || metadata._meta !== undefined
			? { ...metadata._meta, ...liveSummary._meta }
			: undefined;
		const liveMultiRoot = trustLiveMultiRoot
			? readSessionMultiRootMetadata(liveSummary._meta)
			: undefined;
		_meta = withSessionMultiRootMetadata(_meta, liveMultiRoot ?? readSessionMultiRootMetadata(metadata._meta));
		return {
			...metadata,
			provider: liveSummary.provider,
			summary: trustLiveTitle ? liveSummary.title || metadata.summary : metadata.summary || liveSummary.title,
			status: liveSummary.status,
			activity: liveSummary.activity,
			modifiedTime: Date.parse(liveSummary.modifiedAt),
			project: liveSummary.project
				? { uri: URI.parse(liveSummary.project.uri), displayName: liveSummary.project.displayName }
				: metadata.project,
			workingDirectories: liveSummary.workingDirectories !== undefined
				? liveSummary.workingDirectories.map(directory => URI.parse(directory))
				: metadata.workingDirectories,
			changes: liveSummary.changes ?? metadata.changes,
			changesets: this._stateManager.getSessionState(metadata.session.toString())?.changesets ?? metadata.changesets,
			chats: this._sessionChatsFromSummary(liveSummary, this._defaultChat(metadata.session)) ?? metadata.chats,
			...(_meta !== undefined ? { _meta } : {}),
		};
	}

	private _sessionChatsFromSummary(summary: SessionSummary, defaultChat: string | undefined): IAgentSessionChatMetadata[] | undefined {
		return summary.chats?.map(chat => ({
			chat: URI.parse(chat.resource),
			summary: chat.title,
			kind: defaultChat === chat.resource ? 'default' : 'peer',
			origin: chat.origin,
			...(chat.interactivity !== undefined ? { interactivity: chat.interactivity } : {}),
			...(chat.status !== undefined ? {
				status: chat.status,
				archived: isSessionStatusArchived(chat.status),
				isRead: isSessionStatusRead(chat.status),
			} : {}),
			...(isSessionChatArchived(chat) ? { archived: true } : {}),
			...(chat.changes !== undefined ? { changes: chat.changes } : {}),
		}));
	}

	private _queueCatalogSync(session: URI, metadataOverrides: Readonly<Record<string, string>>): void {
		const sessionKey = session.toString();
		if (this._catalogSyncService.isSessionDeletionFenced(session)) {
			return;
		}
		if (this._catalogSyncSuppressedSessions.has(sessionKey)) {
			if (Object.keys(metadataOverrides).length > 0) {
				this._deferredCatalogMetadataOverrides.set(sessionKey, {
					...this._deferredCatalogMetadataOverrides.get(sessionKey),
					...metadataOverrides,
				});
			}
			return;
		}
		const source = this._captureListVisibleCatalogSource(sessionKey);
		if (this._stateManager.getSurfacedSessionSummary(sessionKey) || !source) {
			return;
		}
		const pending = this._backgroundCatalogStateWrites.get(sessionKey);
		if (pending) {
			pending.trailing = true;
			Object.assign(pending.trailingOverrides, metadataOverrides);
			pending.trailingSource = source;
			return;
		}
		const write: IBackgroundCatalogStateWrite = {
			promise: Promise.resolve(),
			trailing: false,
			trailingOverrides: {},
			trailingSource: undefined,
		};
		this._backgroundCatalogStateWrites.set(sessionKey, write);
		write.promise = this._drainBackgroundCatalogStateWrites(session, metadataOverrides, source, write);
	}

	private async _drainBackgroundCatalogStateWrites(session: URI, initialOverrides: Readonly<Record<string, string>>, initialSource: IListVisibleCatalogSource, write: IBackgroundCatalogStateWrite): Promise<void> {
		const sessionKey = session.toString();
		const operationId = generateUuid();
		const stopWatch = StopWatch.create();
		let iteration = 0;
		let metadataOverrides = initialOverrides;
		let source = initialSource;
		try {
			while (true) {
				iteration++;
				this._logService.trace(`[AgentService] catalogStateWrite: ${sessionKey}, operationId=${operationId}, iteration=${iteration}, stage=started, elapsedMs=${Math.round(stopWatch.elapsed())}`);
				try {
					await this._persistListVisibleSessionStateNow(session, metadataOverrides, undefined, source);
				} catch (error) {
					this._logService.warn(`[AgentService] Failed to persist list-visible session state for ${sessionKey}`, error);
				}
				this._logService.trace(`[AgentService] catalogStateWrite: ${sessionKey}, operationId=${operationId}, iteration=${iteration}, stage=settled, trailing=${write.trailing}, elapsedMs=${Math.round(stopWatch.elapsed())}`);
				if (!write.trailing) {
					return;
				}
				metadataOverrides = write.trailingOverrides;
				source = write.trailingSource!;
				write.trailingOverrides = {};
				write.trailingSource = undefined;
				write.trailing = false;
			}
		} finally {
			if (this._backgroundCatalogStateWrites.get(sessionKey) === write) {
				this._backgroundCatalogStateWrites.delete(sessionKey);
			}
		}
	}

	private async _persistListVisibleSessionState(session: URI, metadataOverrides: Readonly<Record<string, string>>, chatsOverride?: readonly ICatalogChat[]): Promise<void> {
		await this._persistListVisibleSessionStateNow(session, metadataOverrides, chatsOverride);
	}

	private async _persistSurfacedSessionTitle(session: URI, title: string): Promise<void> {
		await this._peerChatStore.persistMetadata(session, session, {
			[SESSION_CUSTOM_TITLE_KEY]: title,
			[SESSION_CUSTOM_TITLE_SOURCE_KEY]: AGENT_HOST_TITLE_SOURCE_AUTO,
		});
		try {
			const [snapshot] = await this._orchestratorDatabase.readCatalogSnapshot([session.toString()]);
			await this._peerChatStore.persistMetadata(session, URI.parse(this._resolveDefaultChat(session, snapshot, undefined)), {
				[SESSION_CUSTOM_TITLE_KEY]: title,
				[SESSION_CUSTOM_TITLE_SOURCE_KEY]: AGENT_HOST_TITLE_SOURCE_AUTO,
			});
		} catch (error) {
			this._logService.warn(`[AgentService] Failed to mirror generated surfaced-session title to its default chat for ${session.toString()}`, error);
		}
		await this._markCatalogPayloadDirty(session.toString());
		this._catalogReconciliationService.schedule();
	}

	/**
	 * Persists a mutation its caller publishes only once this resolves. With `rollbackOnFailure`, a failed
	 * persistence undoes the owned values it already wrote, so central state and session.db keep showing what is
	 * published; callers that published before persisting leave it off and let reconciliation roll forward.
	 */
	private async _persistOrderedListVisibleSessionState(session: URI, metadataOverrides: Readonly<Record<string, string>>, chatsOverride?: readonly ICatalogChat[], options?: { readonly rollbackOnFailure?: boolean }): Promise<void> {
		const sessionKey = session.toString();
		const source = this._captureListVisibleCatalogSource(sessionKey);
		if (!source) {
			throw new Error(`Cannot persist list-visible state for unknown session ${sessionKey}`);
		}
		const deferredOverrides = this._deferredCatalogMetadataOverrides.get(sessionKey);
		this._deferredCatalogMetadataOverrides.delete(sessionKey);
		const previous = this._backgroundCatalogStateWrites.get(sessionKey);
		const write: IBackgroundCatalogStateWrite = {
			promise: Promise.resolve(),
			trailing: false,
			trailingOverrides: {},
			trailingSource: undefined,
		};
		this._backgroundCatalogStateWrites.set(sessionKey, write);
		write.promise = this._drainOrderedCatalogStateWrite(
			session,
			{ ...deferredOverrides, ...metadataOverrides },
			metadataOverrides,
			chatsOverride,
			source,
			previous?.promise,
			write,
			options?.rollbackOnFailure ?? false,
		);
		await write.promise;
	}

	/**
	 * Persists an ordered catalog mutation, then the background writes queued
	 * while it was in flight. Ordered callers publish their mutation to the
	 * state manager only after it was persisted, so the sources of those
	 * trailing writes cannot reflect it yet: a successful mutation's
	 * `unpublishedOverrides` are therefore carried into each trailing write,
	 * below the trailing write's own, newer overrides. With `rollbackOnFailure`,
	 * a failed mutation undoes its own owned values before the trailing writes run.
	 */
	private async _drainOrderedCatalogStateWrite(
		session: URI,
		metadataOverrides: Readonly<Record<string, string>>,
		unpublishedOverrides: Readonly<Record<string, string>>,
		chatsOverride: readonly ICatalogChat[] | undefined,
		source: IListVisibleCatalogSource,
		previous: Promise<void> | undefined,
		write: IBackgroundCatalogStateWrite,
		rollbackOnFailure: boolean,
	): Promise<void> {
		const sessionKey = session.toString();
		let orderedError: unknown;
		let orderedFailed = false;
		try {
			try {
				if (previous) {
					await Promise.allSettled([previous]);
				}
				await this._persistListVisibleSessionStateNow(session, metadataOverrides, chatsOverride, source, rollbackOnFailure ? unpublishedOverrides : undefined);
			} catch (error) {
				orderedError = error;
				orderedFailed = true;
			}
			while (write.trailing) {
				const trailingOverrides = write.trailingOverrides;
				const trailingSource = write.trailingSource!;
				write.trailingOverrides = {};
				write.trailingSource = undefined;
				write.trailing = false;
				try {
					await this._persistListVisibleSessionStateNow(session, orderedFailed ? trailingOverrides : { ...unpublishedOverrides, ...trailingOverrides }, undefined, trailingSource);
				} catch (error) {
					this._logService.warn(`[AgentService] Failed to persist list-visible session state for ${sessionKey}`, error);
				}
			}
			if (orderedFailed) {
				throw orderedError;
			}
		} finally {
			if (this._backgroundCatalogStateWrites.get(sessionKey) === write) {
				this._backgroundCatalogStateWrites.delete(sessionKey);
			}
		}
	}

	private _flushDeferredCatalogMetadataOverrides(session: URI): void {
		const sessionKey = session.toString();
		const deferredOverrides = this._deferredCatalogMetadataOverrides.get(sessionKey);
		if (!deferredOverrides) {
			return;
		}
		this._deferredCatalogMetadataOverrides.delete(sessionKey);
		this._queueCatalogSync(session, deferredOverrides);
	}

	private _captureListVisibleCatalogSource(sessionKey: string): IListVisibleCatalogSource | undefined {
		const summary = this._stateManager.getSessionSummary(sessionKey);
		const state = this._stateManager.getSessionState(sessionKey);
		return summary && state ? { summary, state } : undefined;
	}

	/** @param rollbackOverrides owned overrides to undo, when they are still what this write left, if the synchronization fails. */
	private async _persistListVisibleSessionStateNow(session: URI, metadataOverrides: Readonly<Record<string, string>>, chatsOverride?: readonly ICatalogChat[], source?: IListVisibleCatalogSource, rollbackOverrides?: Readonly<Record<string, string>>): Promise<void> {
		const sessionKey = session.toString();
		source ??= this._captureListVisibleCatalogSource(sessionKey);
		if (!source) {
			throw new Error(`Cannot persist list-visible state for unknown session ${sessionKey}`);
		}
		const { summary, state } = source;
		const readValue = metadataOverrides[AH_META_IS_READ_DB_KEY];
		if (readValue !== undefined) {
			const readable = state.chats.filter(chat => isChatInSessionReadAggregate(chat.resource, chat.origin, chat.interactivity));
			if (readable.length === 1) {
				await this._peerChatStore.setRead(session, URI.parse(readable[0].resource), readValue === 'true');
			}
		}
		const ownedOverrides = Object.fromEntries(Object.entries(metadataOverrides).filter(([key]) => key !== AH_META_IS_READ_DB_KEY && getSessionStateValueKey(key)));
		const rollbackKeys = rollbackOverrides ? Object.keys(ownedOverrides).filter(key => rollbackOverrides[key] === ownedOverrides[key]) : [];
		// Filled before the owned write commits, so a failure after the commit (recording the mirror) still rolls it back.
		const previousOwned = new Map<string, string | undefined>();
		const ownedWrite = Object.keys(ownedOverrides).length === 0
			? Promise.resolve()
			: (rollbackKeys.length > 0
				? this._swapOwnedSessionValues(session, ownedOverrides, rollbackKeys, previousOwned)
				: persistSessionMetadataValues(this._sessionStateStore, sessionKey, ownedOverrides)
			).catch(error => this._logService.warn(`[AgentService] Failed to persist owned list-visible state for ${sessionKey}`, error));
		let attempted: Readonly<Record<string, string>> | undefined;
		let result: AgentHostCatalogSyncResult;
		try {
			// The request is built from this session's catalog alone.
			await this._peerChatStore.whenIdle(session);
			result = await this._catalogSyncService.synchronizeWithFactory(session, async database => {
				await ownedWrite;
				const [snapshot] = await this._orchestratorDatabase.readCatalogSnapshot([sessionKey]);
				const normalized = snapshot?.authorityVersion === 2 ? snapshot : undefined;
				if (normalized && !normalized.header) {
					throw new Error(`Missing normalized catalog header for ${sessionKey}`);
				}
				const request = await this._buildListVisibleCatalogSyncRequest(session, metadataOverrides, chatsOverride, database, normalized, {}, { summary, state });
				attempted = request.legacyMetadata;
				return request;
			});
		} catch (error) {
			// A synchronization that committed the catalog but could not acknowledge its receipt reports pending instead of throwing.
			await ownedWrite;
			if (previousOwned.size > 0) {
				await this._rollBackOwnedSessionValues(session, ownedOverrides, attempted, previousOwned)
					.catch(rollbackError => this._logService.error(`[AgentService] Failed to roll back owned list-visible state for ${sessionKey}`, rollbackError));
			}
			throw error;
		}
		if (result.status === 'pending') {
			this._logService.warn(`[AgentService] Catalog synchronization for ${sessionKey} remains pending: ${result.reason}`);
			await this._markCatalogPayloadDirty(sessionKey);
			this._catalogReconciliationService.schedule();
		}
	}

	/**
	 * Writes owned session values (mirrored to session.db before returning) after recording into `previous` what
	 * `rollbackKeys` held, read in the same exclusive section before the write commits. The central write marks the
	 * catalog payload dirty in the same agent-host.db transaction, so a crash before any rollback recovers to these
	 * values everywhere.
	 */
	private async _swapOwnedSessionValues(session: URI, values: Readonly<Record<string, string>>, rollbackKeys: readonly string[], previous: Map<string, string | undefined>): Promise<void> {
		await this._sessionStateStore.runExclusive(session, async exclusive => {
			for (const key of rollbackKeys) {
				previous.set(key, exclusive.snapshot.values.get(key));
			}
			await exclusive.write(sessionStatePatch({ values }), SessionStateMirrorFlush.Immediate);
		});
	}

	/**
	 * Restores `previous` for each key that still holds what the failed write left: its own value or the value its
	 * synchronization adopted (`attempted`). A newer write stands. Mirrored to session.db before returning.
	 */
	private _rollBackOwnedSessionValues(session: URI, written: Readonly<Record<string, string>>, attempted: Readonly<Record<string, string>> | undefined, previous: ReadonlyMap<string, string | undefined>): Promise<void> {
		return this._sessionStateStore.runExclusive(session, async exclusive => {
			const values: Record<string, string | null> = {};
			for (const [key, value] of previous) {
				const current = exclusive.snapshot.values.get(key);
				if (current !== value && (current === written[key] || current === attempted?.[key])) {
					values[key] = value ?? null;
				}
			}
			await exclusive.write(sessionStatePatch({ values }), SessionStateMirrorFlush.Immediate);
		});
	}

	private async _buildListVisibleCatalogSyncRequest(
		session: URI,
		metadataOverrides: Readonly<Record<string, string>>,
		chatsOverride: readonly ICatalogChat[] | undefined,
		database: AgentHostCatalogDatabaseReference | undefined,
		normalized?: IAgentHostDatabaseCatalogSnapshotEntry,
		metadataFallbacks: Readonly<Record<string, string>> = {},
		source?: IListVisibleCatalogSource,
	): Promise<IAgentHostCatalogSyncRequest> {
		const sessionKey = session.toString();
		const summary = source?.summary ?? this._stateManager.getSessionSummary(sessionKey);
		const state = source?.state ?? this._stateManager.getSessionState(sessionKey);
		if (!summary || !state) {
			throw new Error(`Cannot persist list-visible state for unknown session ${sessionKey}`);
		}
		return this._catalogSourceResolver.buildCatalogSyncRequest(session, {
			modifiedTime: Date.parse(summary.modifiedAt),
			title: summary.title,
			status: summary.status,
			project: summary.project,
			workingDirectories: summary.workingDirectories ?? [],
			changes: summary.changes,
			meta: summary._meta,
			chats: chatsOverride ?? this._catalogChatsFromState(state, this._requireDefaultChat(sessionKey)),
		}, metadataOverrides, false, database, metadataFallbacks, normalized && chatCatalogV2ToCatalogChats(normalized), normalized?.header?.revision);
	}

	private async _registerNewChatCatalog(session: URI, providerData: string | undefined): Promise<void> {
		if (this._stateManager.isEphemeralSession(session.toString())) {
			return;
		}
		const [snapshot] = await this._orchestratorDatabase.readCatalogSnapshot([session.toString()]);
		if (snapshot?.header || (await this._orchestratorDatabase.getSessionV2(session.toString()))?.verified) {
			await this._sessionStateStore.noteCatalogNormalized(session);
			return;
		}
		const state = this._stateManager.getSessionState(session.toString());
		const chat = state?.chats.find(chat => chat.resource === state.defaultChat);
		if (!state || !chat) {
			throw new Error(`Missing default chat while registering ${session.toString()}`);
		}
		const result = await this._orchestratorDatabase.registerChatCatalogV2(session.toString(), {
			defaultChat: {
				chat: chat.resource,
				order: 0,
				// No catalog records the session yet (that is what registers one), so no move recorded another storage.
				storageResource: this._knownDefaultChatStorageResource(session, URI.parse(chat.resource)) ?? this._newDefaultChatStorageResource(session, URI.parse(chat.resource)),
				providerData,
				workingDirectories: chat.workingDirectories,
				isRead: isSessionStatusRead(chat.status ?? state.status),
				metadata: { summary: chat.title || undefined, interactivity: chat.interactivity },
			},
			peers: [],
			privateDescendants: [],
		});
		if (result.status === 'notReady') {
			this._logService.trace(`[AgentService] Deferring normalized catalog registration for ${session.toString()}: ${result.reason}`);
			this._catalogReconciliationService.schedule();
			return;
		}
		// A conflict is a verified source or a catalog recorded since the check above, by a concurrent synchronization
		// (such as the sessions_v2 migration picking up the session being created): as if the check had found it.
		if (result.status !== 'applied' && result.status !== 'replayed' && result.status !== 'alreadyNormalized' && result.status !== 'conflict') {
			throw new Error(`Failed to register normalized chat catalog for ${session.toString()}: ${result.status}`);
		}
		await this._sessionStateStore.noteCatalogNormalized(session);
	}

	/** The recorded default chat of a session, or `undefined` when none is recorded. */
	private _defaultChat(session: URI | string): string | undefined {
		return this._chatOwnership.getDefaultChat(session.toString());
	}

	/** The recorded default chat of a session that must be known. */
	private _requireDefaultChat(session: URI | string): string {
		const defaultChat = this._defaultChat(session);
		if (defaultChat === undefined) {
			throw new Error(`Unknown default chat of session ${session.toString()}`);
		}
		return defaultChat;
	}

	/**
	 * The default chat of a session that may not be resident: the catalog
	 * header (required for a normalized catalog), the live, evicted or
	 * announced record, or the default entry of the catalog payload the caller
	 * read. Only a legacy source that records none falls back to
	 * {@link deriveLegacyDefaultChat}.
	 */
	private _resolveDefaultChat(session: URI, snapshot: IAgentHostDatabaseCatalogSnapshotEntry | undefined, payloadDefaultChat: string | undefined): string {
		if (snapshot?.authorityVersion === 2) {
			if (!snapshot.header?.defaultChatUri) {
				throw new Error(`Missing normalized default chat of ${session.toString()}`);
			}
			return snapshot.header.defaultChatUri;
		}
		return snapshot?.header?.defaultChatUri ?? this._defaultChat(session) ?? payloadDefaultChat ?? deriveLegacyDefaultChat(session);
	}

	/** {@link _resolveDefaultChat} for a session whose catalog the caller has not read. */
	private async _readDefaultChat(session: URI): Promise<string> {
		const recorded = this._defaultChat(session);
		if (recorded !== undefined) {
			return recorded;
		}
		const [snapshot] = await this._orchestratorDatabase.readCatalogSnapshot([session.toString()]);
		return this._resolveDefaultChat(session, snapshot, undefined);
	}

	private async _migrateChatMetadataWrite(session: URI, resource: URI, values: Readonly<Record<string, string>>): Promise<Readonly<Record<string, string>>> {
		// A conversion is not ready while the aggregate is unverified or awaits its re-projection: one read, not a
		// conversion attempt per write (which would also delay the write and mark the payload dirty each time).
		const readiness = await this._readChatCatalogConversionReadiness(session);
		if (readiness === 'normalized') {
			return values;
		}
		if (readiness === 'awaitsReprojection') {
			this._catalogReconciliationService.convertAfterReprojection(session.toString());
			return values;
		}
		let prepared: ReturnType<AgentHostPeerChatStore['prepareMetadataMutation']> | undefined;
		const result = await this._migrateChatCatalog(session, CancellationToken.None, candidate => {
			prepared = this._peerChatStore.prepareMetadataMutation(session, resource, values, candidate);
			return prepared.mutation;
		});
		if (prepared && (result?.status === 'applied' || result?.status === 'replayed')) {
			return prepared.remaining;
		}
		if (result?.status === 'notReady') {
			this._catalogReconciliationService.schedule();
		}
		return values;
	}

	/**
	 * Whether a session's chat catalog is normalized, can convert, or must wait for its aggregate (unverified, or its
	 * re-projection pending), from central state alone: deciding this never opens the session's database.
	 */
	private async _readChatCatalogConversionReadiness(session: URI): Promise<'normalized' | 'awaitsReprojection' | 'ready'> {
		const [snapshot] = await this._orchestratorDatabase.readCatalogSnapshot([session.toString()]);
		if (snapshot?.authorityVersion === 2) {
			return 'normalized';
		}
		const source = await this._orchestratorDatabase.getSessionV2(session.toString());
		return !source?.verified || source.payloadDirty !== 0 ? 'awaitsReprojection' : 'ready';
	}

	private async _migrateChatCatalog(
		session: URI,
		token: CancellationToken,
		mutation?: Parameters<typeof migrateChatCatalogV2>[3],
		catalogOverrideFactory?: () => Promise<{ readonly chats: readonly ICatalogChat[]; readonly metadataFallbacks: Readonly<Record<string, string>> } | undefined>,
		lifetimeValidator?: () => boolean,
	): Promise<Awaited<ReturnType<typeof migrateChatCatalogV2>> | undefined> {
		if (token.isCancellationRequested || lifetimeValidator && !lifetimeValidator()) {
			return;
		}
		// A conversion that can only end not ready opens no session database, writes nothing and wakes nothing: the
		// re-projection it waits for is already owed (an unverified or dirty aggregate is one), and converts it right after.
		// A catalog override stages its own aggregate first. The check under the session's lock below stays authoritative.
		if (!catalogOverrideFactory && await this._readChatCatalogConversionReadiness(session) === 'awaitsReprojection') {
			this._catalogReconciliationService.convertAfterReprojection(session.toString());
			this._reportCatalogMigration(session, chatCatalogAwaitsReprojection);
			return chatCatalogAwaitsReprojection;
		}
		await this._peerChatStore.reconcileLegacy(session);
		if (lifetimeValidator && !lifetimeValidator()) {
			return;
		}
		const validateLifetime = lifetimeValidator ? async (): Promise<void> => {
			if (!lifetimeValidator()) {
				throw new Error(`Chat catalog migration lifetime ended for ${session.toString()}`);
			}
		} : undefined;
		let restorePayloadDirty = false;
		try {
			return await this._catalogSyncService.runMigrationExclusive(session, async (database, synchronize) => {
				return this._peerChatStore.runExclusive(session, async () => {
					if (token.isCancellationRequested || lifetimeValidator && !lifetimeValidator()) {
						return;
					}
					const catalogOverride = await catalogOverrideFactory?.();
					if (catalogOverrideFactory && !catalogOverride) {
						return;
					}
					if (catalogOverride) {
						const [snapshot] = await this._orchestratorDatabase.readCatalogSnapshot([session.toString()]);
						if (snapshot?.authorityVersion !== 2) {
							const previousDirtyRevision = await this._orchestratorDatabase.getSessionV2PayloadDirty(session.toString());
							const dirtyRevision = await this._orchestratorDatabase.markSessionV2PayloadDirty(session.toString());
							const synchronized = await synchronize(await this._buildListVisibleCatalogSyncRequest(
								session,
								{},
								catalogOverride.chats,
								database,
								undefined,
								catalogOverride.metadataFallbacks,
							), validateLifetime, lifetimeValidator);
							if (synchronized.status === 'pending') {
								this._catalogReconciliationService.schedule();
								throw new Error(`Failed to stage restored chat catalog for ${session.toString()}: ${synchronized.reason}`);
							}
							if (dirtyRevision === undefined || !await this._orchestratorDatabase.markSessionV2PayloadClean(session.toString(), dirtyRevision)) {
								this._catalogReconciliationService.schedule();
								throw new Error(`Failed to stage restored chat catalog for ${session.toString()}: superseded`);
							}
							restorePayloadDirty = previousDirtyRevision !== undefined && previousDirtyRevision > 0;
						}
					}
					const result = await migrateChatCatalogV2(this._orchestratorDatabase, this._sessionDataService, session, mutation, lifetimeValidator);
					if (result.status === 'notReady') {
						await this._markCatalogPayloadDirty(session.toString());
						if (result.awaitsReprojection) {
							this._catalogReconciliationService.convertAfterReprojection(session.toString());
						}
					} else if (result.status === 'applied' || result.status === 'replayed') {
						this._invalidateSessionList();
					}
					this._reportCatalogMigration(session, result);
					return result;
				});
			});
		} finally {
			// Also after a migration that committed and then stopped: the store refreshes only a catalog that is now normalized, and never fails.
			await this._sessionStateStore.noteCatalogNormalized(session);
			if (restorePayloadDirty) {
				await this._markCatalogPayloadDirty(session.toString());
				this._catalogReconciliationService.schedule();
			}
		}
	}

	/**
	 * Logs a chat catalog migration that ended without converting the session, with why, so a conversion is never left
	 * silent: at warn the first time a session is deferred for a reason in this process, at trace after. A wait for the
	 * session's re-projection resolves itself (the conversion is retried right after it), so it warns only once it has
	 * deferred {@link CATALOG_MIGRATION_REPROJECTION_WARN_ATTEMPTS} attempts in a row; a provisional session never warns.
	 */
	private _reportCatalogMigration(session: URI, result: Awaited<ReturnType<typeof migrateChatCatalogV2>>): void {
		const key = session.toString();
		if (result.status === 'applied' || result.status === 'replayed' || result.status === 'alreadyNormalized') {
			this._catalogMigrationDeferrals.delete(key);
			return;
		}
		const reason = result.status === 'notReady' ? `notReady: ${result.reason}` : result.status;
		const previous = this._catalogMigrationDeferrals.get(key);
		const attempts = previous?.reason === reason ? previous.attempts + 1 : 1;
		this._catalogMigrationDeferrals.set(key, { reason, attempts });
		const warn = this._provisionalSessionKeys.has(key)
			? false
			: result.status === 'notReady' && result.awaitsReprojection
				? attempts === CATALOG_MIGRATION_REPROJECTION_WARN_ATTEMPTS
				: attempts === 1;
		const message = `[AgentService] Chat catalog migration of ${key} ended without converting it: ${reason}${attempts > 1 ? ` (${attempts} attempts in a row)` : ''}`;
		if (warn) {
			this._logService.warn(message);
		} else {
			this._logService.trace(message);
		}
	}

	private async _resolveCatalogReconciliationSource(registered: IRegisteredSession, database: AgentHostCatalogDatabaseReference | undefined): Promise<AgentHostCatalogReconciliationSourceResult> {
		const [snapshot] = await this._orchestratorDatabase.readCatalogSnapshot([registered.session.toString()]);
		const agent = this._providerService.getProvider(registered.provider);
		let reconciliationMetadata: IAgentSessionMetadata | undefined;
		if (snapshot?.authorityVersion === 2 && !snapshot.header) {
			throw new Error(`Missing normalized catalog header for ${registered.session.toString()}`);
		}
		if (snapshot?.authorityVersion === 2) {
			const source = await this._orchestratorDatabase.getSessionV2(registered.session.toString());
			if (source?.verified && source.payloadDirty !== 0 && agent) {
				reconciliationMetadata = await this._getCatalogReconciliationMetadata(agent, registered, () => this._isChatBacking(registered.session, this._chatOwnership.createRecordedOwnerLookup()));
			}
			if (source?.verified && !reconciliationMetadata) {
				const decoded = decodeAgentHostCatalogPayload(source.payload);
				if (!decoded.ok || !snapshot.header) {
					throw new Error(`Invalid normalized session aggregate for ${registered.session.toString()}: ${decoded.ok ? 'missing header' : decoded.error}`);
				}
				const data = decoded.value.data;
				const summary = this._stateManager.getSessionSummary(registered.session.toString());
				return {
					status: 'available',
					request: await this._catalogSourceResolver.buildCatalogSyncRequest(registered.session, {
						modifiedTime: summary ? Date.parse(summary.modifiedAt) : data.modifiedTime,
						title: summary ? summary.title : data.summary,
						status: summary?.status ?? ((data.isRead ? SessionStatus.IsRead : SessionStatus.Idle) | (data.isArchived ? SessionStatus.IsArchived : SessionStatus.Idle)),
						project: summary ? summary.project : data.project,
						workingDirectories: summary ? summary.workingDirectories ?? [] : data.workingDirectories,
						changes: summary ? summary.changes : data.changes,
						meta: summary ? summary._meta : data._meta,
						chats: [],
					}, {}, true, database, this._catalogMetadataFallbacks(data), chatCatalogV2ToCatalogChats(snapshot), snapshot.header.revision),
				};
			}
		}
		if (!agent) {
			return { status: 'providerUnavailable' };
		}
		const metadata = reconciliationMetadata ?? await this._getCatalogReconciliationMetadata(agent, registered, () => this._isChatBacking(registered.session, this._chatOwnership.createRecordedOwnerLookup()));
		if (!metadata) {
			if (!this._readableProviderCatalogs.has(registered.provider)) {
				return { status: 'providerUnavailable' };
			}
			// The provider is registered but cannot vouch for this session, so
			// there is nothing authoritative to project. Reported distinctly from
			// an unregistered provider so reconciliation can park it instead of
			// re-opening its storage on every pass.
			return { status: 'sourceUnresolvable' };
		}
		let status = metadata.status ?? SessionStatus.Idle;
		let metadataFallbacks: Readonly<Record<string, string>> = {};
		let meta = metadata._meta;
		let centralMeta: AgentHostCatalogData['_meta'];
		const hasLiveState = this._stateManager.getSessionState(registered.session.toString()) !== undefined;
		const peers = snapshot?.authorityVersion === 2 ? [] : database
			? await this._readOrMigrateLegacyPeerChatCatalog(agent, registered.session, database)
			: await this._readOrImportPeerChatCatalogWithoutLocalDatabase(agent, registered.session);
		const central = await this._orchestratorDatabase.getSessionV2(registered.session.toString());
		const decoded = central && decodeAgentHostCatalogPayload(central.payload);
		const defaultChat = this._resolveDefaultChat(registered.session, snapshot, decoded?.ok ? decoded.value.data.chats.find(chat => chat.kind === 'default')?.uri : undefined);
		const defaultChatMetadata = snapshot?.authorityVersion === 2 ? undefined
			: await this._readLegacyDefaultChatMetadata(registered.session, defaultChat, decoded?.ok ? decoded.value.data : undefined);
		if (!database) {
			if (decoded?.ok) {
				status = decoded.value.data.isRead ? status | SessionStatus.IsRead : status & ~SessionStatus.IsRead;
				if (!readSessionEhcliAdoptable(metadata._meta) || readSessionEhcliAdopted(metadata._meta)) {
					status = decoded.value.data.isArchived ? status | SessionStatus.IsArchived : status & ~SessionStatus.IsArchived;
				}
				metadataFallbacks = hasLiveState ? {} : this._catalogMetadataFallbacks(decoded.value.data);
				if (!hasLiveState && metadata.summary && decoded.value.data.titleSource === AGENT_HOST_TITLE_SOURCE_AUTO) {
					metadataFallbacks = { ...metadataFallbacks, [SESSION_CUSTOM_TITLE_KEY]: metadata.summary };
				}
				centralMeta = hasLiveState ? undefined : decoded.value.data._meta;
				meta = { ...centralMeta, ...metadata._meta };
			}
		}
		return {
			status: 'available',
			request: await this._catalogSourceResolver.buildCatalogSyncRequest(registered.session, {
				modifiedTime: metadata.modifiedTime,
				title: metadata.summary,
				status,
				project: metadata.project ? { uri: metadata.project.uri.toString(), displayName: metadata.project.displayName } : undefined,
				workingDirectories: metadata.workingDirectories?.map(directory => directory.toString()) ?? [],
				changes: await this._migrateLegacyChangesetAggregate(registered.session, metadata, database),
				meta: registered.external ? withSessionMultiRootMetadata(meta, undefined) : meta,
				chats: [
					{
						uri: defaultChat,
						kind: 'default',
						title: metadata.summary,
						isRead: metadata.chats?.find(chat => chat.kind === 'default')?.isRead,
						origin: defaultChatMetadata?.origin,
						inheritedTurnId: defaultChatMetadata?.inheritedTurnId,
						...(defaultChatMetadata?.workingDirectories !== undefined ? { workingDirectories: defaultChatMetadata.workingDirectories } : {}),
					},
					...peers.map(peer => ({
						uri: peer.uri,
						kind: 'peer' as const,
						origin: peer.origin,
						archived: peer.archived,
						isRead: peer.isRead,
						inheritedTurnId: peer.inheritedTurnId,
						workingDirectories: peer.workingDirectories,
					})),
				],
			}, {}, true, database, metadataFallbacks,
				snapshot?.authorityVersion === 2 ? chatCatalogV2ToCatalogChats(snapshot) : undefined,
				snapshot?.authorityVersion === 2 ? snapshot.header?.revision : undefined),
		};
	}

	/**
	 * Resolves the changeset aggregate for a catalog payload, migrating legacy
	 * per-kind blobs into the modern changes summary while the reconciliation
	 * database is already open. Listing itself stays database-free, so this is
	 * where the migration that the provider/session fallback performs happens
	 * for catalog-served rows.
	 */
	private async _migrateLegacyChangesetAggregate(session: URI, metadata: IAgentSessionMetadata, database: AgentHostCatalogDatabaseReference | undefined, prefetch?: SessionStateValuesPrefetch): Promise<ChangesSummary | undefined> {
		if (metadata.changes !== undefined || !database) {
			return metadata.changes;
		}
		const changesetKeys = this._changesetCoordinator.getListMetadataKeys(session.toString());
		if (!changesetKeys) {
			return metadata.changes;
		}
		try {
			const persisted: Record<string, string | undefined> = {
				...await database.object.getMetadataObject(changesetKeys),
				configValues: (await this._sessionStateStore.readWithoutImport(session, ['configValues'], prefetch)).get('configValues'),
			};
			return this._changesetCoordinator.decorateListEntry(metadata, persisted, false).changes;
		} catch (error) {
			this._logService.warn(`[AgentService] Failed to resolve changeset aggregate for ${session.toString()}`, error);
			return metadata.changes;
		}
	}

	/**
	 * `isChatBacking` is resolved lazily: it reads session storage, and a
	 * session whose provider returns no metadata never reaches the branch that
	 * needs it.
	 */
	private async _getCatalogReconciliationMetadata(agent: IAgent, registered: IRegisteredSession, isChatBacking: () => Promise<boolean>): Promise<IAgentSessionMetadata | undefined> {
		const providerMetadata = await this._registeredSessionMetadata(agent, registered.session, registered.external);
		const liveSummary = this._stateManager.getSessionSummary(registered.session.toString());
		if (!providerMetadata) {
			return liveSummary ? this._withLiveSessionMetadata({
				session: registered.session,
				startTime: registered.startTime,
				modifiedTime: Date.parse(liveSummary.modifiedAt),
			}, liveSummary) : undefined;
		}
		if (!liveSummary || await isChatBacking()) {
			return providerMetadata;
		}
		return this._withLiveSessionMetadata(providerMetadata, liveSummary, false, !this._stateManager.getSurfacedSessionSummary(registered.session.toString()));
	}

	private _catalogChatsFromState(state: NonNullable<ReturnType<AgentHostStateManager['getSessionState']>>, defaultChat: string): ICatalogChat[] {
		return state.chats
			.map(chat => ({
				uri: chat.resource,
				kind: defaultChat === chat.resource ? 'default' : 'peer',
				title: chat.title,
				origin: chat.origin,
				...(chat.origin?.kind === ChatOriginKind.Tool
					? { interactivity: ChatInteractivity.Hidden }
					: chat.interactivity !== undefined ? { interactivity: chat.interactivity } : {}),
				...(isSessionStatusArchived(chat.status) && defaultChat !== chat.resource ? { archived: true } : {}),
				isRead: isSessionStatusRead(chat.status),
				inheritedTurnId: this._stateManager.getChatInheritedTurnId(chat.resource),
				workingDirectories: chat.workingDirectories,
				changes: chat.changes,
			}));
	}

	private _agentMergeRestore: Promise<void> = Promise.resolve();
	private _agentMergeIndexWrites: Promise<void> = Promise.resolve();
	/** Agent Merge notices waiting for a session's in-flight turn to finish. */
	/** Agent Merge notices waiting for their chat's turn to end; flushed when its current owner goes idle (Block 4: the owner is read then). */
	private readonly _pendingAgentMergeNotices = new Map<string, { readonly notices: { readonly kind: AgentSystemNotificationKind; readonly content: string }[] }>();

	/** Test surface: settles once the startup Agent Merge restore pass and the index writes it enqueued have run. */
	async whenAgentMergeSessionsRestored(): Promise<void> {
		// The restore pass enqueues index writes of its own, so alternate until
		// both chains are quiescent.
		for (let i = 0; i < 3; i++) {
			await this._agentMergeIndexWrites;
			await this._agentMergeRestore;
		}
	}

	/**
	 * Materializes persisted Agent-Merge-enabled sessions so monitoring resumes
	 * without a client opening them. The index is authoritative, so this never
	 * opens a database for a session that is not monitored.
	 */
	private async _restoreAgentMergeMonitoredSessions(): Promise<void> {
		if (!this._isAgentMergeEnabled()) {
			return;
		}
		// A pending toggle must land before the index is read as authoritative.
		await this._agentMergeIndexWrites;
		const enabled = await this._sessionRegistry.listAgentMergeEnabled();
		if (enabled.length === 0) {
			return;
		}
		const limiter = new Limiter<void>(4);
		const prefetch = this._pagePrefetch(() => enabled);
		await Promise.all(enabled.map(session => limiter.queue(async () => {
			const sessionStr = session.toString();
			if (this._stateManager.getSessionState(sessionStr)) {
				return;
			}
			try {
				// A single-row registry lookup, so the pass costs one query per
				// indexed session rather than a full registry enumeration.
				const registered = await this._sessionRegistry.get(session, async entry => this._migrateRegisteredSession(entry, entry.external === undefined ? await prefetch() : undefined));
				// Deleted or unregistered since it was indexed, or archived by a
				// pass that could not clear the index (e.g. a crash).
				if (!registered || await this._isPersistedSessionArchived(session, await prefetch())) {
					await this._sessionRegistry.setAgentMergeEnabled(session, false);
					return;
				}
				// A session of a provider that registers later is picked up by
				// that provider's own pass.
				if (!this._providerService.getProvider(registered.provider)) {
					return;
				}
				this._logService.info(`[AgentService] Restoring Agent-Merge-enabled session for monitoring: ${sessionStr}`);
				await this.restoreSession(session);
			} catch (err) {
				this._logService.warn(`[AgentService] Failed to restore Agent-Merge-enabled session ${sessionStr}`, err);
			}
		})));
	}

	/**
	 * One central-state read for the unloaded sessions of a pass, made on first
	 * use: a pass then costs one agent-host.db query plus each session's own
	 * session.db read, as on main, rather than one extra query per session.
	 */
	private _pagePrefetch(sessions: () => readonly URI[]): () => Promise<SessionStateValuesPrefetch> {
		let prefetch: Promise<SessionStateValuesPrefetch> | undefined;
		return () => prefetch ??= this._sessionStateStore.prefetchWithoutImport(sessions()).catch((error): SessionStateValuesPrefetch => {
			this._logService.warn('[AgentService] Failed to prefetch session state; reading per session', error);
			return new Map();
		});
	}

	/**
	 * Deletes a removed peer's title, title source and changes summary keys from a legacy-catalog session's database, where
	 * main cleared them; older builds read a missing key as empty. A normalized-catalog session keeps them, as on main.
	 */
	private async _deletePeerChatSummaryKeys(session: URI, chat: string): Promise<void> {
		const [snapshot] = await this._orchestratorDatabase.readCatalogSnapshot([session.toString()]);
		if (snapshot?.authorityVersion === 2) {
			return;
		}
		await this._sessionStateStore.writeMetadata(session, session, {
			[customChatTitleMetadataKey(chat)]: null,
			[customChatTitleSourceMetadataKey(chat)]: null,
			[getChatChangesSummaryMetadataKey(chat)]: null,
		}, SessionStateMirrorFlush.Immediate);
	}

	/** Whether a page prefetch recorded central state for `session`; `undefined` when it does not cover it. */
	private async _prefetchedImported(prefetch: () => Promise<SessionStateValuesPrefetch>, session: URI): Promise<boolean | undefined> {
		const values = await prefetch();
		return values.has(session.toString()) ? values.get(session.toString()) !== undefined : undefined;
	}

	/** Archive check for the few indexed sessions, so a terminal session is never re-held. */
	private async _isPersistedSessionArchived(session: URI, prefetch?: SessionStateValuesPrefetch): Promise<boolean> {
		const metadata = await this._sessionStateStore.readWithoutImport(session, [AH_META_IS_ARCHIVED_DB_KEY, AH_META_IS_DONE_DB_KEY], prefetch);
		return (metadata.get(AH_META_IS_ARCHIVED_DB_KEY) ?? metadata.get(AH_META_IS_DONE_DB_KEY)) === 'true';
	}

	/** Mirrors a session's Agent Merge enablement into the host-owned index. */
	private _syncAgentMergeIndex(session: URI, previous: SessionConfigState | undefined, current: SessionConfigState | undefined): void {
		const sessionState = this._stateManager.getSessionState(session.toString());
		const sessionFolderKey = sessionState?.workingDirectories?.[0] ? getWorkingDirectoryKey(sessionState.workingDirectories[0]) : undefined;
		const wasEnabled = isAnyAgentMergeEnabled(previous?.values, sessionFolderKey);
		const isEnabled = isAnyAgentMergeEnabled(current?.values, sessionFolderKey);
		if (wasEnabled === isEnabled) {
			return;
		}
		this._writeAgentMergeIndex(session, isEnabled);
	}

	/** Drops a session from the index when it reaches a terminal state (archived or deleted). */
	private _clearAgentMergeIndex(session: URI): void {
		this._writeAgentMergeIndex(session, false);
	}

	private _writeAgentMergeIndex(session: URI, enabled: boolean): void {
		// A dropped enable write would silently stop the session resuming after
		// a restart, so this retries like the other registry mutations.
		this._agentMergeIndexWrites = this._agentMergeIndexWrites
			.then(() => this._retryRegistryMutation(
				() => this._sessionRegistry.setAgentMergeEnabled(session, enabled),
				`Agent Merge index write for ${session.toString()}`,
			))
			.catch(err => this._logService.warn(`[AgentService] Failed to update the Agent Merge index for ${session.toString()}`, err));
	}

	/** Awaits provider discovery only when no persisted registry can serve the first list. */
	private async _awaitInitialProviderMigration(): Promise<void> {
		await Promise.all(this._providerService.getProviders().map(provider => this._awaitInitialProviderMigrationForProvider(provider)));
	}

	private _retryInitialProviderMigrationsInBackground(shouldRetry: (provider: AgentProvider) => boolean): void {
		for (const provider of this._providerService.getProviders()) {
			if (!shouldRetry(provider.id) || this._backgroundInitialMigrationRetries.has(provider.id)) {
				continue;
			}
			if (!this._firstListingServed && this._deferredProviderMigrations.has(provider.id)) {
				continue;
			}
			if (this._providerMigrations.has(provider.id) && !this._initialProviderMigrationsNeedingRetry.has(provider.id)) {
				continue;
			}
			const migration = this._initialProviderMigrationsNeedingRetry.has(provider.id)
				? this._trackInitialProviderMigration(provider, this._ensureSessionsV2Imported(provider, true))
				: this._awaitInitialProviderMigrationForProvider(provider);
			const retry = migration.then(
				() => { },
				error => {
					this._logService.warn(`[AgentService] Background catalog migration retry failed for ${provider.id}`, error);
				},
			);
			const tracked = retry.finally(() => {
				if (this._backgroundInitialMigrationRetries.get(provider.id) === tracked) {
					this._backgroundInitialMigrationRetries.delete(provider.id);
				}
			});
			this._backgroundInitialMigrationRetries.set(provider.id, tracked);
		}
	}

	/**
	 * Awaits the registration-time direct import for a single provider,
	 * retrying once if that initial catalog pass was unavailable. Rejects only if
	 * the retry also fails. Restore uses this to wait for its own provider's
	 * catalog before reading per-session metadata.
	 */
	private async _awaitInitialProviderMigrationForProvider(provider: IAgent, requireReadableCatalog = false): Promise<boolean> {
		const migration = this._initialProviderMigrations.get(provider.id);
		if (!migration) {
			if (requireReadableCatalog || this._deferredProviderMigrations.has(provider.id)) {
				await this._ensureSessionsV2Imported(provider, requireReadableCatalog);
			}
			return this._readableProviderCatalogs.has(provider.id);
		}
		try {
			await migration;
		} catch (err) {
			this._logService.warn(`[AgentService] initial provider catalog for ${provider.id} was unavailable; retrying before accessing sessions`, err);
			await this._replaceFailedInitialProviderMigration(provider, migration);
		}
		if (requireReadableCatalog && !this._readableProviderCatalogs.has(provider.id)) {
			await this._ensureSessionsV2Imported(provider, true);
		} else if (this._firstListingServed && this._deferredProviderMigrations.has(provider.id)) {
			await this._ensureSessionsV2Imported(provider);
		}
		await this._providerDiscoveryRegistrations.get(provider.id);
		return this._readableProviderCatalogs.has(provider.id);
	}

	private async _migrateAndRegisterDiscoveredChats(provider: IAgent, chats: readonly IAgentDiscoveredChat[]): Promise<void> {
		const wasDeferred = this._deferredProviderMigrations.has(provider.id);
		const initialMigration = this._initialProviderMigrations.get(provider.id);
		if (initialMigration) {
			try {
				await initialMigration;
			} catch (err) {
				this._logService.warn(`[AgentService] initial provider catalog for ${provider.id} was unavailable before chat discovery`, err);
				try {
					await this._replaceFailedInitialProviderMigration(provider, initialMigration);
				} catch (retryError) {
					this._logService.warn(`[AgentService] provider catalog retry for ${provider.id} failed before chat discovery; registering the delivered discovery batch`, retryError);
				}
			}
		}
		if (this._deferredProviderMigrations.has(provider.id) && (wasDeferred || chats.length > 0)) {
			try {
				await this._ensureSessionsV2Imported(provider, true);
			} catch (err) {
				this._logService.warn(`[AgentService] registry migration: failed for provider ${provider.id} after chat discovery`, err);
			}
		}
		await this._providerIdentityAdmissionSequencer.queue(provider.id, () => this._registerDiscoveredChatsWithStartupTelemetry(provider, chats));
	}

	private async _registerDiscoveredChatsWithStartupTelemetry(provider: IAgent, chats: readonly IAgentDiscoveredChat[]): Promise<void> {
		const isCurrentProvider = () => !this._store.isDisposed && this._providerService.getProvider(provider.id) === provider;
		const timing = isCurrentProvider() ? this._startupPerformance.start('sessionDiscoveryRegistration', provider.id) : undefined;
		const firstCompletionPending = isCurrentProvider() && this._startupPerformance.isPending('firstSessionDiscoveryRegistration', provider.id);
		const observation: IDiscoveryRegistrationObservation | undefined = timing || firstCompletionPending ? {
			outcome: 'success',
			metrics: this._startupPerformance.isEnabled ? this._getDiscoveryRegistrationMetrics(chats) : undefined,
		} : undefined;
		if (observation?.metrics) {
			timing?.setMetrics({ candidateSessionCount: observation.metrics.candidateSessionCount, externalSessionCount: observation.metrics.externalSessionCount });
		}
		try {
			await this._registerDiscoveredChats(provider, chats, false, observation);
			const outcome = isCurrentProvider() ? observation?.outcome ?? 'success' : 'cancelled';
			timing?.complete(outcome, observation?.metrics);
			if (outcome === 'success' && firstCompletionPending) {
				this._startupPerformance.mark('firstSessionDiscoveryRegistration', { provider: provider.id, since: 'processStart', ...observation?.metrics });
			}
		} catch (error) {
			timing?.complete(!isCurrentProvider() || isCancellationError(error) ? 'cancelled' : 'error', observation?.metrics);
			throw error;
		}
	}

	private _getDiscoveryRegistrationMetrics(chats: readonly IAgentDiscoveredChat[]): NonNullable<IDiscoveryRegistrationObservation['metrics']> {
		return {
			candidateSessionCount: chats.length,
			externalSessionCount: chats.reduce((count, chat) => count + (chat.external ? 1 : 0), 0),
			registeredSessionCount: 0,
			filteredSessionCount: 0,
			failedSessionCount: 0,
			incompleteSessionCount: 0,
		};
	}

	private _recordDiscoveryRegistrationProgress(observation: IDiscoveryRegistrationObservation | undefined, result: 'registered' | 'filtered' | 'failed' | 'incomplete' | 'partial'): void {
		if (!observation) {
			return;
		}
		if (result === 'failed' || result === 'incomplete' || result === 'partial') {
			observation.outcome = 'partial';
		}
		if (observation.metrics && result !== 'partial') {
			observation.metrics[`${result}SessionCount`]++;
		}
	}

	private _replaceFailedInitialProviderMigration(provider: IAgent, failed: Promise<void>): Promise<void> {
		const current = this._initialProviderMigrations.get(provider.id);
		if (current !== failed) {
			return current ?? Promise.resolve();
		}
		const retry = this._ensureSessionsV2Imported(provider, true);
		return this._trackInitialProviderMigration(provider, retry);
	}

	/**
	 * Runs one provider discovery at most once concurrently, sharing the
	 * in-flight attempt across callers and clearing it on settle so failures
	 * retry on the next trigger. `force` requests a fresh pass after an
	 * provider catalog trigger.
	 *
	 * A `force` request that arrives while a sweep — forced or not, freshly
	 * started or already chained — is already in-flight is never dropped: it
	 * is chained to run again immediately after the in-flight attempt settles
	 * (regardless of whether that attempt succeeded or failed), so the
	 * provider's on-disk set is re-read fresh instead of silently reusing a
	 * sweep that may predate the change the `force` caller is reacting to.
	 * `forceQueued` tracks only whether a follow-up is currently queued on the
	 * entry — never whether the entry's own in-flight attempt happened to be
	 * invoked with `force` — so a freshly-created entry always starts with
	 * `forceQueued: false` even when its own first attempt is itself forced.
	 * `forceQueued` is reset the moment a chained attempt actually *starts*
	 * running (not merely once it is scheduled), so a second `force` that
	 * arrives while a chained (or freshly-forced) attempt is still in flight
	 * is likewise chained onto a further follow-up rather than being
	 * coalesced away as a supposed duplicate.
	 */
	private _ensureSessionsV2Imported(provider: IAgent, force = false): Promise<void> {
		return this._ensureProviderCatalog(provider, this._providerMigrations, force, runForce =>
			this._providerIdentityAdmissionSequencer.queue(provider.id, async () => {
				const timing = this._startupPerformance.start('sessionMigration', provider.id);
				timing?.setMetrics({ migrationState: 'unknown', migrationForced: runForce });
				try {
					await this._importProviderSessionsV2(provider, runForce, timing);
				} catch (error) {
					timing?.complete('error');
					throw error;
				}
			}));
	}

	private _ensureProviderCatalog(
		provider: IAgent,
		states: Map<AgentProvider, IProviderDiscoveryState>,
		force: boolean,
		run: (force: boolean) => Promise<void>,
	): Promise<void> {
		const existing = states.get(provider.id);
		if (existing) {
			if (force && !existing.forceQueued) {
				existing.forceQueued = true;
				const chained = existing.promise
					.catch(() => { /* the queued forced re-run must still happen even if the in-flight attempt failed */ })
					.then(() => {
						existing.forceQueued = false;
						return run(true);
					});
				existing.promise = chained;
				this._armProviderCatalogCleanup(provider, states, existing, chained);
			}
			return existing.promise;
		}
		// `forceQueued` tracks whether a *follow-up* attempt has been queued
		// onto this entry, not whether the attempt currently running was
		// itself invoked with `force`. Seeding it from `force` here would
		// make a fresh forced attempt look like it already has a follow-up
		// queued, causing a second `force` that arrives while this fresh
		// attempt is still in flight to be silently dropped instead of
		// chaining its own follow-up.
		const state: IProviderDiscoveryState = { promise: Promise.resolve(), forceQueued: false };
		const attempt = run(force);
		state.promise = attempt;
		states.set(provider.id, state);
		this._armProviderCatalogCleanup(provider, states, state, attempt);
		return attempt;
	}

	/**
	 * Clears `provider`'s in-flight discovery entry once `promise` (the entry's
	 * current attempt) settles, but only if the entry still points at that
	 * exact promise — a `force` chain may have replaced it with a follow-up
	 * attempt in the meantime, which arms its own cleanup in turn.
	 */
	private _armProviderCatalogCleanup(provider: IAgent, states: Map<AgentProvider, IProviderDiscoveryState>, state: IProviderDiscoveryState, promise: Promise<void>): void {
		const clear = () => {
			if (state.promise === promise && states.get(provider.id) === state) {
				states.delete(provider.id);
			}
		};
		void promise.then(clear, clear);
	}

	/**
	 * Additively discovers one provider's native top-level chats. Internal chat backings are
	 * filtered out, subagent sessions are filtered out, and explicitly-deleted
	 * sessions are never resurrected: registration goes through
	 * {@link AgentSessionRegistry.register}, which atomically declines to
	 * (re-)register a session that is (or concurrently becomes)
	 * tombstoned, rather than trusting a separate up-front tombstone check that
	 * could race a concurrent {@link disposeSession}.
	 *
	 * `undefined` from the provider means it cannot enumerate yet (its SDK may
	 * not be downloaded/started) — not an authoritative empty result — so its
	 * next readiness signal retries.
	 */

	private async _registerDiscoveredChats(provider: IAgent, chats: readonly IAgentDiscoveredChat[], awaitReconciliation = true, observation?: IDiscoveryRegistrationObservation): Promise<boolean> {
		const providerMetadata = chats.map(({ external, session, ...metadata }) => ({
			external,
			metadata: this._toSessionMetadata(metadata, session, provider.id),
		}));
		const findChatBackingOwner = this._chatOwnership.createRecordedOwnerLookup();
		const resolvedIdentities = usesStandardSessionUris(provider.id)
			? await this._sessionRegistry.resolveDiscoveredSessionIdentities(provider.id, providerMetadata.map(candidate => candidate.metadata.session))
			: new Map();
		const candidates = providerMetadata.map(candidate => {
			const resolution = readSessionEhcliAdoptable(candidate.metadata._meta)
				? undefined
				: resolvedIdentities.get(candidate.metadata.session.toString());
			return {
				...candidate,
				providerSession: candidate.metadata.session,
				resolution,
				metadata: resolution?.status === 'resolved' ? { ...candidate.metadata, session: resolution.session } : candidate.metadata,
			};
		});
		// Keys only: discovery arrives in batches, and the full listing re-runs the
		// per-row provenance migration for every registered session each time.
		const discoveredSessionKeys = provider.id === CODEX_AGENT_PROVIDER_ID
			? candidates.map(candidate => candidate.metadata.session)
			: [];
		const [runtimeCompatibleKeys, registeredRecency, persistedExclusions, codexCatalogRows] = await Promise.all([
			this._sessionRegistry.listRuntimeCompatibleSessionKeys(),
			this._sessionRegistry.listSessionModifiedTimes(),
			this._sessionRegistry.listSessionsV2Exclusions(provider.id),
			discoveredSessionKeys.length > 0 ? this._orchestratorDatabase.listSessionsV2(discoveredSessionKeys) : [],
		]);
		const codexCatalogModels = new Map<string, string | undefined>();
		for (const row of codexCatalogRows) {
			const decoded = decodeAgentHostCatalogPayload(row.payload);
			codexCatalogModels.set(row.session, decoded.ok ? readCodexSessionModel(decoded.value.data)?.id : undefined);
		}
		const registeredKeys = new Set(runtimeCompatibleKeys);
		const exclusions = new Map(persistedExclusions.map(exclusion => [exclusion.session, exclusion]));
		const exclusionsToMark: IAgentHostDatabaseSessionsV2Exclusion[] = [];
		const queueExclusion = (exclusion: IAgentHostDatabaseSessionsV2Exclusion): void => {
			const existing = exclusions.get(exclusion.session);
			if (existing?.reason === exclusion.reason && existing.fingerprint === exclusion.fingerprint) {
				return;
			}
			exclusions.set(exclusion.session, exclusion);
			exclusionsToMark.push(exclusion);
		};
		const discoveryLimiter = new Limiter<boolean>(4);
		const prefetch = this._pagePrefetch(() => candidates.map(candidate => candidate.providerSession));
		let suppressed = 0;
		let skippedAsStale = 0;
		let registeredExternal = false;
		let alreadyRegistered = 0;
		let registryChanged = false;
		let surfacedMetadataChanged = false;
		const changedMetadataSessions: string[] = [];
		const untitledExternal: IAgentSessionMetadata[] = [];
		const modifiedTimeAdvances: { readonly session: URI; readonly modifiedTime: number }[] = [];
		const results = await Promise.all(candidates.map(({ external: reportedExternal, metadata: sessionMetadata, providerSession, resolution }) => discoveryLimiter.queue(async () => {
			const session = sessionMetadata.session;
			try {
				if (resolution?.status === 'conflict') {
					this._logService.warn(`[AgentService] ${resolution.message}; skipping discovery for ${providerSession.toString()}`);
					this._recordDiscoveryRegistrationProgress(observation, 'failed');
					return false;
				}
				// Registered identities retain provenance; only changed restored titles need per-session I/O.
				if (resolution?.registered || registeredKeys.has(session.toString())) {
					alreadyRegistered++;
					const live = this._stateManager.getSessionSummary(session.toString());
					if (live && readSessionExternal(live._meta) && !this._stateManager.hasActiveTurn(session.toString())) {
						await this._refreshDiscoveredSessionMetadata(sessionMetadata, live);
					}
					const surfaced = this._stateManager.getSurfacedSessionSummary(session.toString());
					const titleChanged = sessionMetadata.summary !== undefined && surfaced?.title !== sessionMetadata.summary;
					const directoriesChanged = sessionMetadata.workingDirectories !== undefined
						&& !equals(surfaced?.workingDirectories, sessionMetadata.workingDirectories.map(directory => directory.toString()));
					const projectChanged = sessionMetadata.project !== undefined
						&& !equals(surfaced?.project, { uri: sessionMetadata.project.uri.toString(), displayName: sessionMetadata.project.displayName });
					const metaChanged = sessionMetadata._meta !== undefined
						&& !equals(surfaced?._meta, { ...surfaced?._meta, ...sessionMetadata._meta });
					const codexModelChanged = provider.id === CODEX_AGENT_PROVIDER_ID
						&& codexCatalogModels.get(session.toString()) !== readCodexSessionModel(sessionMetadata)?.id;
					if (codexModelChanged || (surfaced && (titleChanged || directoriesChanged || projectChanged || metaChanged))) {
						surfacedMetadataChanged = true;
						changedMetadataSessions.push(session.toString());
					}
					const stored = registeredRecency.get(session.toString());
					if (Number.isFinite(sessionMetadata.modifiedTime) && (stored === undefined || sessionMetadata.modifiedTime > stored)) {
						modifiedTimeAdvances.push({ session, modifiedTime: sessionMetadata.modifiedTime });
					}
					this._recordDiscoveryRegistrationProgress(observation, 'filtered');
					return false;
				}
				if (isSubagentSession(providerSession.toString())) {
					queueExclusion({
						provider: provider.id,
						session: providerSession.toString(),
						reason: 'subagent',
						fingerprint: 'uri-v1',
					});
					suppressed++;
					this._recordDiscoveryRegistrationProgress(observation, 'filtered');
					return false;
				}
				const persistedExclusion = exclusions.get(providerSession.toString()) ?? exclusions.get(session.toString());
				if (persistedExclusion?.reason === 'backing' || await this._isChatBacking(providerSession, findChatBackingOwner)) {
					queueExclusion({
						provider: provider.id,
						session: providerSession.toString(),
						reason: 'backing',
						fingerprint: 'backing-v1',
					});
					suppressed++;
					this._recordDiscoveryRegistrationProgress(observation, 'filtered');
					return false;
				}
				const registrationFacts = await this._readSessionRegistrationFacts(providerSession, findChatBackingOwner, prefetch);
				if (registrationFacts.chatBacking) {
					suppressed++;
					this._recordDiscoveryRegistrationProgress(observation, 'filtered');
					return false;
				}
				const external = reportedExternal && !registrationFacts.hostCreated;
				if (external && !readSessionEhcliAdoptable(sessionMetadata._meta) && this._isExternalSessionOlderThanMaxAge(sessionMetadata.modifiedTime, Date.now())) {
					queueExclusion({
						provider: provider.id,
						session: session.toString(),
						reason: 'staleExternal',
						fingerprint: String(sessionMetadata.modifiedTime),
					});
					skippedAsStale++;
					this._recordDiscoveryRegistrationProgress(observation, 'filtered');
					return false;
				}
				if (!isEqual(session, providerSession) && await this._sessionRegistry.isTombstoned(providerSession)) {
					this._recordDiscoveryRegistrationProgress(observation, 'filtered');
					return false;
				}
				if (this._orchestratorDatabase.prepareSessionStorage && resolution?.status === 'resolved' && !resolution.existing) {
					try {
						await this._fileService.stat(this._sessionDataService.getSessionDataDir(session));
					} catch (error) {
						if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
							throw error;
						}
						await this._orchestratorDatabase.prepareSessionStorage(session.toString(), provider.id);
					}
				}
				const identity: IRegisteredSession = { session, provider: provider.id, startTime: sessionMetadata.startTime, modifiedTime: sessionMetadata.modifiedTime, external, source: external ? 'discovery' : 'restore' };
				const registered = await this._retryRegistryMutation(
					() => this._sessionRegistry.registerDiscovered(session, providerSession, identity),
					`discovery registration for ${session.toString()}`,
				);
				if (registered) {
					this._recordDiscoveryRegistrationProgress(observation, 'registered');
					const effectiveIdentity = await this._sessionRegistry.get(session, entry => this._migrateRegisteredSession(entry));
					if (!effectiveIdentity) {
						throw new Error(`Missing registered identity for discovered session ${session.toString()}`);
					}
					if (effectiveIdentity.provider !== provider.id) {
						this._recordDiscoveryRegistrationProgress(observation, 'failed');
						this._logService.warn(`[AgentService] Discovered session ${session.toString()} belongs to provider ${effectiveIdentity.provider}, not ${provider.id}; skipping catalog synchronization`);
						return false;
					}
					const effectiveExternal = effectiveIdentity.external;
					registryChanged = true;
					const requestFactory = async (database: AgentHostCatalogDatabaseReference | undefined) =>
						this._buildImportedCatalogSyncRequest(provider, sessionMetadata, effectiveExternal, true, database, undefined, await prefetch());
					// Legacy discovery must not claim local storage before explicit adoption.
					const syncResult = readSessionEhcliAdoptable(sessionMetadata._meta)
						? await this._catalogSyncService.synchronizeMigrationWithFactory(session, requestFactory)
						: await this._catalogSyncService.synchronizeWithFactory(session, requestFactory, undefined, undefined, await this._prefetchedImported(prefetch, session));
					if (syncResult.status === 'pending') {
						this._recordDiscoveryRegistrationProgress(observation, 'incomplete');
						this._logService.warn(`[AgentService] Discovered session ${session.toString()} remains incomplete: ${syncResult.reason}`);
					}
					registeredKeys.add(session.toString());
					if (effectiveExternal && !sessionMetadata.summary) {
						untitledExternal.push(sessionMetadata);
					}
					if (effectiveExternal && !readSessionEhcliAdoptable(sessionMetadata._meta)) {
						registeredExternal = true;
					} else {
						await this._announceSurfacedSession({ ...sessionMetadata, _meta: withSessionExternal(sessionMetadata._meta, effectiveExternal) }, provider.id);
					}
				} else {
					this._recordDiscoveryRegistrationProgress(observation, 'filtered');
					this._logService.trace(`[AgentService] discovery: ${session.toString()} was not registered (tombstoned)`);
				}
				return registered;
			} catch (err) {
				this._recordDiscoveryRegistrationProgress(observation, 'failed');
				this._logService.warn(`[AgentService] Failed to register discovered chat ${session.toString()} for provider ${provider.id}`, err);
				return false;
			}
		})));
		if (modifiedTimeAdvances.length > 0) {
			try {
				await this._retryRegistryMutation(
					() => this._sessionRegistry.updateModifiedTimes(modifiedTimeAdvances),
					`batched modified-time update for ${modifiedTimeAdvances.length} session(s)`,
				);
				this._invalidateSessionList();
			} catch (error) {
				this._recordDiscoveryRegistrationProgress(observation, 'partial');
				this._logService.warn(`[AgentService] Failed to persist ${modifiedTimeAdvances.length} discovered session modified time(s); continuing discovery post-processing`, error);
			}
			this._catalogReconciliationService.schedule();
		}
		try {
			await this._sessionRegistry.markSessionsV2ExcludedBatch(exclusionsToMark);
		} catch (error) {
			this._recordDiscoveryRegistrationProgress(observation, 'partial');
			this._logService.warn(`[AgentService] Failed to persist ${exclusionsToMark.length} discovery exclusion(s) for provider ${provider.id}; retrying on the next discovery pass`, error);
		}
		const registered = results.filter(changed => changed).length;
		if (changedMetadataSessions.length > 0) {
			try {
				await this._orchestratorDatabase.markSessionsV2PayloadsDirty(changedMetadataSessions);
			} catch (error) {
				this._recordDiscoveryRegistrationProgress(observation, 'partial');
				this._logService.warn('[AgentService] Failed to mark discovered metadata changes dirty', error);
			}
			// Wake after marking dirty so a concurrent parking decision observes the newer revision.
			for (const session of changedMetadataSessions) {
				this._catalogReconciliationService.wakeParkedSessions(session);
			}
		}
		if (registryChanged || surfacedMetadataChanged) {
			this._invalidateSessionList();
			this._catalogReconciliationService.schedule();
		}
		if (registeredExternal || surfacedMetadataChanged || (modifiedTimeAdvances.length > 0 && !this._hidesAllExternalSessions(this._getExternalSessionsMode()))) {
			this._queueSessionListReconciliation();
			if (awaitReconciliation && (registeredExternal || surfacedMetadataChanged)) {
				await this._sessionListReconciliation;
			}
		}
		if (untitledExternal.length > 0) {
			this._scheduleExternalSessionTitles(untitledExternal);
		}
		this._logService.info(`[AgentService] discovery for provider ${provider.id}: ${chats.length} candidate(s) (${chats.filter(chat => chat.external).length} external), ${registered} registered, ${alreadyRegistered} already registered, ${suppressed} suppressed as subagent/chat backing, ${skippedAsStale} skipped as older than ${EXTERNAL_SESSION_MAX_AGE_MS / DAY_MS} days`);
		return registered > 0;
	}

	/** Discovery refreshes idle external rows while explicit host title overrides remain authoritative. */
	private async _refreshDiscoveredSessionMetadata(metadata: IAgentSessionMetadata, previous: SessionSummary): Promise<void> {
		const key = metadata.session.toString();
		const title = metadata.summary !== undefined && metadata.summary !== previous.title
			? await this._readPersistedSessionTitle(metadata.session) ?? metadata.summary
			: undefined;
		const current = this._stateManager.getSessionSummary(key);
		if (!current || current.title !== previous.title || this._stateManager.hasActiveTurn(key) || !readSessionExternal(current._meta)) {
			return;
		}
		if (title !== undefined && title !== current.title) {
			this._stateManager.dispatchServerAction(key, { type: ActionType.SessionTitleChanged, title });
		}
		this._stateManager.updateSessionModifiedTime(key, metadata.modifiedTime);
	}

	private async _importProviderSessionsV2(provider: IAgent, force = false, timing?: IAgentHostStartupTiming): Promise<void> {
		let deferred = false;
		// The import runs at most once per provider per payload version, so this
		// is the only opportunity to record what the migration cost a user. A
		// session-list report that arrives after the marker is set can never
		// reproduce it.
		const startedAt = Date.now();
		const storageAccessesAtStart = this._storageAccessCounts();
		const findChatBackingOwner = this._chatOwnership.createRecordedOwnerLookup();
		let enumerated: readonly URI[] = [];
		const prefetch = this._pagePrefetch(() => enumerated);
		const report = await this._sessionsV2MigrationService.migrateProvider(
			provider.id,
			async () => {
				const sessions = await this._enumerateLegacyProviderSessions(provider);
				if (sessions === AgentChatMigrationDeferred) {
					deferred = true;
					return undefined;
				}
				enumerated = sessions?.map(session => session.session) ?? [];
				return sessions?.map(session => ({
					session: session.session,
					startTime: session.startTime,
					fingerprint: String(session.modifiedTime),
					value: session,
				}));
			},
			candidate => isSubagentSession(candidate.session.toString())
				? { reason: 'subagent', fingerprint: 'uri-v1' }
				: candidate.catalog && isAgentHostChatBacking(candidate.session, candidate.catalog.isChatBacking)
					? { reason: 'backing', fingerprint: candidate.catalog.payloadHash }
					: undefined,
			candidate => this._resolveSessionsV2ImportCandidate(provider, candidate, findChatBackingOwner, prefetch),
			force,
			timing ? wasBackfilled => timing.setMetrics({ migrationState: wasBackfilled ? 'backfilled' : 'required' }) : undefined,
		);
		if (!report) {
			timing?.complete(deferred ? 'deferred' : 'unavailable');
			if (deferred) {
				this._deferredProviderMigrations.add(provider.id);
				this._readableProviderCatalogs.delete(provider.id);
				return;
			}
			this._readableProviderCatalogs.delete(provider.id);
			if (!await this._sessionRegistry.isSessionsV2Backfilled(provider.id, AGENT_HOST_CATALOG_PAYLOAD_VERSION)) {
				throw new ProviderCatalogUnavailableError(provider.id);
			}
			return;
		}
		if (report.synchronized + report.excluded + report.incomplete + report.failed + report.staleExclusions + report.skipped > 0) {
			this._invalidateSessionList();
		}
		if (report.incomplete + report.failed + report.staleExclusions > 0) {
			this._catalogReconciliationService.schedule();
		}
		const untitledExternal: IAgentSessionMetadata[] = [];
		let importedExternal = false;
		for (const imported of report.imported) {
			const metadata = { ...imported.value, _meta: withSessionExternal(imported.value._meta, imported.external) };
			if (imported.external) {
				importedExternal = true;
				if (!metadata.summary && !readSessionEhcliAdoptable(metadata._meta)) {
					untitledExternal.push(metadata);
				}
			}
			if (!imported.external || readSessionEhcliAdoptable(metadata._meta)) {
				await this._announceSurfacedSession(metadata, provider.id);
			}
		}
		this._deferredProviderMigrations.delete(provider.id);
		const readableTransition = !this._readableProviderCatalogs.has(provider.id);
		this._readableProviderCatalogs.add(provider.id);
		if (readableTransition) {
			this._queuePublishedSessionListRefresh(provider.id);
			// The provider can vouch for its sessions now: those parked while it could not are re-projected (and converted).
			if (this._catalogReconciliationService.wakeParkedProviderSessions(provider.id)) {
				this._catalogReconciliationService.schedule();
			}
		}
		if (report.marked) {
			this._initialProviderMigrationsNeedingRetry.delete(provider.id);
		} else {
			// The provider answered, but an unmarked pass still needs a future
			// retry because candidates were left unimported.
			this._initialProviderMigrationsNeedingRetry.add(provider.id);
		}
		if (!await this._sessionRegistry.isProviderBackfilled(provider.id)) {
			this._startChatDiscovery(provider, 'legacy migration enumerated the provider catalog');
		}
		if (importedExternal) {
			this._queueSessionListReconciliation();
		}
		if (untitledExternal.length > 0) {
			this._scheduleExternalSessionTitles(untitledExternal);
		}
		const storageAccesses = this._storageAccessCounts();
		this._logService.info(`[AgentService] sessions_v2 import for provider ${provider.id}: ${report.synchronized} synchronized, ${report.skipped} current, ${report.excluded} excluded, ${report.staleExclusions} stale exclusions, ${report.incomplete} incomplete, ${report.failed} failed, marker ${report.marked ? 'set' : 'not set'} in ${Date.now() - startedAt}ms (${storageAccesses.opens - storageAccessesAtStart.opens} db opens, ${storageAccesses.stats - storageAccessesAtStart.stats} db stats)`);
		timing?.complete(report.marked ? 'success' : 'partial', this._getSessionMigrationStartupMetrics(report, storageAccessesAtStart, storageAccesses));
	}

	private _getSessionMigrationStartupMetrics(
		report: IAgentHostSessionsV2MigrationReport<IAgentSessionMetadata>,
		storageAccessesAtStart: ISessionStorageAccessCounts,
		storageAccesses: ISessionStorageAccessCounts,
	): IAgentHostStartupMetrics {
		return {
			synchronizedSessionCount: report.synchronized,
			skippedSessionCount: report.skipped,
			excludedSessionCount: report.excluded,
			incompleteSessionCount: report.incomplete + report.staleExclusions,
			failedSessionCount: report.failed,
			...(this._sessionDataService.storageAccessCounts ? this._getStartupStorageMetrics(storageAccessesAtStart, storageAccesses) : undefined),
		};
	}

	private async _resolveSessionsV2ImportCandidate(provider: IAgent, candidate: IAgentHostSessionsV2Candidate<IAgentSessionMetadata>, findChatBackingOwner: (chat: string) => Promise<string | undefined>, prefetch: () => Promise<SessionStateValuesPrefetch>): Promise<AgentHostSessionsV2CandidateResolution<IAgentSessionMetadata>> {
		const session = candidate.session;
		const facts = await this._readSessionRegistrationFacts(session, findChatBackingOwner, prefetch);
		if (facts.chatBacking) {
			return { status: 'excluded', reason: 'backing', fingerprint: 'backing-v1' };
		}
		let storedIdentity = candidate.current ?? candidate.legacy;
		if (storedIdentity && storedIdentity.external === undefined) {
			const external = !facts.hostCreated;
			await this._orchestratorDatabase.updateRuntimeSessionExternal([{ session: session.toString(), external }]);
			storedIdentity = {
				...storedIdentity,
				external,
				source: external ? 'discovery' : storedIdentity.source,
			};
		}
		const external = storedIdentity?.external ?? !facts.hostCreated;
		const identity: IAgentHostDatabaseSessionOptions = storedIdentity
			? {
				provider: storedIdentity.provider,
				startTime: storedIdentity.startTime,
				modifiedTime: storedIdentity.modifiedTime,
				source: storedIdentity.external === undefined ? (external ? 'discovery' : 'restore') : storedIdentity.source,
			}
			: {
				provider: provider.id,
				startTime: candidate.provider?.startTime ?? Date.now(),
				modifiedTime: candidate.provider?.startTime ?? Date.now(),
				source: external ? 'discovery' : 'restore',
			};
		const metadata = candidate.current
			? await this._getSessionMetadata(session, { session, ...identity, modifiedTime: identity.modifiedTime ?? identity.startTime, external })
			?? candidate.provider?.value
			?? (candidate.legacy && candidate.current.external === undefined
				? await this._registeredSessionMetadata(provider, session, external, { startTime: identity.startTime, modifiedTime: identity.modifiedTime ?? identity.startTime })
				: undefined)
			: candidate.provider?.value ?? await this._registeredSessionMetadata(provider, session, external);
		if (!metadata) {
			return { status: 'incomplete' };
		}
		const liveSummary = this._stateManager.getSessionSummary(session.toString());
		const canonicalMetadata = !candidate.current && liveSummary ? this._withLiveSessionMetadata(metadata, liveSummary) : metadata;
		if (external && !readSessionEhcliAdoptable(canonicalMetadata._meta) && this._isExternalSessionOlderThanMaxAge(canonicalMetadata.modifiedTime, Date.now())) {
			return { status: 'excluded', reason: 'staleExternal', fingerprint: String(canonicalMetadata.modifiedTime) };
		}
		let existingCatalog;
		try {
			existingCatalog = candidate.catalog ? await this._orchestratorDatabase.getSessionV2(session.toString()) : undefined;
		} catch (error) {
			this._logService.warn(`[AgentService] Failed to read existing catalog state for ${session.toString()}`, error);
			return { status: 'incomplete' };
		}
		const decodedCatalog = existingCatalog ? decodeAgentHostCatalogPayload(existingCatalog.payload) : undefined;
		const existingCatalogData = decodedCatalog?.ok ? decodedCatalog.value.data : undefined;
		return {
			status: 'ready',
			identity,
			external,
			requestFactory: async database => this._buildImportedCatalogSyncRequest(provider, canonicalMetadata, external, !candidate.current && !candidate.legacy, database, existingCatalogData, await prefetch()),
			valueFromRequest: request => request.data.summary === canonicalMetadata.summary
				? canonicalMetadata
				: { ...canonicalMetadata, summary: request.data.summary },
		};
	}

	private async _buildImportedCatalogSyncRequest(provider: IAgent, metadata: IAgentSessionMetadata, external: boolean, seedExternalRead: boolean, database: AgentHostCatalogDatabaseReference | undefined, existingCatalogData?: AgentHostCatalogData, prefetch?: SessionStateValuesPrefetch): Promise<IAgentHostCatalogSyncRequest> {
		const [snapshot] = await this._orchestratorDatabase.readCatalogSnapshot([metadata.session.toString()]);
		const authoritativeChats = snapshot?.authorityVersion === 2 ? chatCatalogV2ToCatalogChats(snapshot) : undefined;
		const shouldSeedExternalRead = external && seedExternalRead;
		const preserveCentralRead = !database && existingCatalogData !== undefined;
		const preserveCentralMetadata = preserveCentralRead && !this._stateManager.getSessionState(metadata.session.toString());
		const baseStatus = metadata.status ?? SessionStatus.Idle;
		const status = !preserveCentralRead
			? shouldSeedExternalRead ? baseStatus | SessionStatus.IsRead : baseStatus
			: existingCatalogData.isRead ? baseStatus | SessionStatus.IsRead : baseStatus & ~SessionStatus.IsRead;
		const peers = authoritativeChats !== undefined ? [] : database
			? await this._readOrMigrateLegacyPeerChatCatalog(provider, metadata.session, database)
			: await this._readOrImportPeerChatCatalogWithoutLocalDatabase(provider, metadata.session);
		const defaultChat = this._resolveDefaultChat(metadata.session, snapshot, existingCatalogData?.chats.find(chat => chat.kind === 'default')?.uri);
		const defaultChatMetadata = authoritativeChats !== undefined || existingCatalogData === undefined ? undefined
			: await this._readLegacyDefaultChatMetadata(metadata.session, defaultChat, existingCatalogData);
		const meta = preserveCentralMetadata
			? { ...existingCatalogData._meta, ...metadata._meta }
			: metadata._meta;
		return this._catalogSourceResolver.buildCatalogSyncRequest(metadata.session, {
			modifiedTime: metadata.modifiedTime,
			title: metadata.summary,
			status,
			project: metadata.project ? { uri: metadata.project.uri.toString(), displayName: metadata.project.displayName } : undefined,
			workingDirectories: metadata.workingDirectories?.map(directory => directory.toString()) ?? [],
			changes: await this._migrateLegacyChangesetAggregate(metadata.session, metadata, database, prefetch),
			meta: withSessionInitiator(
				withSessionExternal(withSessionMultiRootMetadata(meta, undefined), external),
				readSessionInitiator({ _meta: meta }) ?? getLegacySessionInitiator(provider.id, external),
			),
			chats: [
				{
					uri: defaultChat,
					kind: 'default',
					title: metadata.summary,
					isRead: metadata.chats?.find(chat => chat.kind === 'default')?.isRead,
					origin: defaultChatMetadata?.origin,
					inheritedTurnId: defaultChatMetadata?.inheritedTurnId,
					workingDirectories: defaultChatMetadata?.workingDirectories,
				},
				...peers.map(peer => ({
					uri: peer.uri,
					kind: 'peer' as const,
					origin: peer.origin,
					archived: peer.archived,
					isRead: peer.isRead,
					inheritedTurnId: peer.inheritedTurnId,
				})),
			],
		}, shouldSeedExternalRead ? { [AH_META_IS_READ_DB_KEY]: 'true' } : {}, true, database,
			preserveCentralMetadata ? this._catalogMetadataFallbacks(existingCatalogData) : {}, authoritativeChats,
			snapshot?.authorityVersion === 2 ? snapshot.header?.revision : undefined);
	}

	private async _readLegacyDefaultChatMetadata(session: URI, defaultChat: string, source: AgentHostCatalogData | undefined): Promise<IPersistedPeerChat> {
		const persistedDefault = source?.chats.find(chat => chat.kind === 'default');
		const [metadata] = await this._peerChatStore.readLocalChatMetadata(session, [{
			uri: defaultChat,
			origin: fromCatalogChatOrigin(persistedDefault?.origin),
			inheritedTurnId: persistedDefault?.inheritedTurnId,
			workingDirectories: persistedDefault?.workingDirectories,
		}]);
		return metadata;
	}

	private _catalogMetadataFallbacks(data: AgentHostCatalogData): Readonly<Record<string, string>> {
		const metadata: Record<string, string> = {
			[AH_META_IS_READ_DB_KEY]: String(data.isRead),
			[AH_META_IS_ARCHIVED_DB_KEY]: String(data.isArchived),
		};
		// An empty cached list means "not known yet" and must not mask the provider's folders.
		if (data.workingDirectories.length > 0) {
			metadata[SESSION_WORKING_DIRECTORIES_KEY] = JSON.stringify(data.workingDirectories);
		}
		if (data.summary !== undefined) {
			metadata[SESSION_CUSTOM_TITLE_KEY] = data.summary;
		}
		if (data.titleSource !== undefined) {
			metadata[SESSION_CUSTOM_TITLE_SOURCE_KEY] = data.titleSource;
		}
		for (const chat of data.chats) {
			if (chat.summary !== undefined) {
				metadata[customChatTitleMetadataKey(chat.uri)] = chat.summary;
			}
			if (chat.titleSource !== undefined) {
				metadata[customChatTitleSourceMetadataKey(chat.uri)] = chat.titleSource;
			}
			if (chat.changes !== undefined) {
				metadata[getChatChangesSummaryMetadataKey(chat.uri)] = JSON.stringify(chat.changes);
			}
		}
		return metadata;
	}

	private async _readOrImportPeerChatCatalogWithoutLocalDatabase(agent: IAgent, session: URI): Promise<IPersistedPeerChat[]> {
		const central = await this._peerChatStore.tryRead(session, false);
		if (central !== undefined) {
			return central;
		}
		const cached = await this._readCachedChatCatalog(session);
		const cachedPeers = cached?.filter(chat => chat.kind === 'peer');
		let legacy: readonly IAgentLegacyChat[] | undefined;
		if (cachedPeers?.length !== 0 && agent.listLegacyChatBackings) {
			try {
				legacy = await agent.listLegacyChatBackings(session);
			} catch (error) {
				this._logService.warn(`[AgentService] Failed to enumerate peer-chat membership for ${session.toString()}`, error);
				throw error;
			}
		}
		const providerData = new Map(legacy?.map(chat => [chat.uri.toString(), chat.providerData]) ?? []);
		const entries: IPersistedPeerChat[] | undefined = cachedPeers
			? cachedPeers.map(chat => {
				const matchingProviderData = providerData.get(chat.uri);
				return {
					uri: chat.uri,
					...(matchingProviderData !== undefined ? { providerData: matchingProviderData } : {}),
					...(chat.origin !== undefined ? { origin: chat.origin } : {}),
					...(chat.archived === true ? { archived: true } : {}),
					...(chat.isRead !== undefined ? { isRead: chat.isRead } : {}),
					...(chat.inheritedTurnId !== undefined ? { inheritedTurnId: chat.inheritedTurnId } : {}),
				};
			})
			: legacy?.map(chat => ({
				uri: chat.uri.toString(),
				...(chat.providerData !== undefined ? { providerData: chat.providerData } : {}),
			}));
		if (entries === undefined) {
			return [];
		}
		await this._peerChatStore.replaceForMigration(session, entries);
		return entries;
	}

	private async _isExternalProviderChat(session: URI, prefetch?: SessionStateValuesPrefetch): Promise<boolean> {
		const metadata = await this._sessionStateStore.readWithoutImport(session, [AH_META_WORKSPACELESS_DB_KEY], prefetch);
		return metadata.get(AH_META_WORKSPACELESS_DB_KEY) === undefined;
	}

	/**
	 * Both facts discovery and registry backfill need about a session, from a
	 * single database open — they ask for both per session, and a large catalogue
	 * makes a second open the dominant cost of the pass.
	 */
	private async _readSessionRegistrationFacts(session: URI, findChatBackingOwner: (chat: string) => Promise<string | undefined>, prefetch?: () => Promise<SessionStateValuesPrefetch>): Promise<{ readonly chatBacking: boolean; readonly hostCreated: boolean }> {
		if (this._unpersistedChatBackings.has(session.toString())) {
			return { chatBacking: true, hostCreated: false };
		}
		// A read failure is deliberately not caught: registering on a guess would
		// durably mark a host-created session external, whereas failing the pass
		// leaves it unmarked and retried.
		const metadata = await this._sessionStateStore.readWithoutImport(session, [CHAT_BACKING_METADATA_KEY, AH_META_WORKSPACELESS_DB_KEY], await prefetch?.());
		// The workspace-less marker is written when the host creates a session,
		// so its presence is what identifies a host-created session.
		return { chatBacking: !!metadata.get(CHAT_BACKING_METADATA_KEY) && await this._isChatBacking(session, findChatBackingOwner), hostCreated: metadata.get(AH_META_WORKSPACELESS_DB_KEY) !== undefined };
	}

	private async _migrateRegisteredSession(entry: IStoredRegisteredSession, prefetch?: SessionStateValuesPrefetch): Promise<IRegisteredSession | undefined> {
		if (entry.external !== undefined) {
			return undefined;
		}
		const external = await this._isExternalProviderChat(entry.session, prefetch);
		return {
			...entry,
			external,
			source: external ? 'discovery' : entry.source,
		};
	}

	private _inFlightRegisteredSessions: Promise<readonly IRegisteredSession[]> | undefined;

	private _listRegisteredSessions(): Promise<readonly IRegisteredSession[]> {
		if (!this._inFlightRegisteredSessions) {
			let prefetch: (() => Promise<SessionStateValuesPrefetch>) | undefined;
			const operation = this._sessionRegistry.list(async (entry, entries) => {
				if (entry.external === undefined) {
					prefetch ??= this._pagePrefetch(() => entries.flatMap(candidate => candidate.external === undefined ? [candidate.session] : []));
				}
				return this._migrateRegisteredSession(entry, prefetch && await prefetch());
			}).then(sessions => {
				for (const session of sessions) {
					this._providerService.associateSession(session.session, session.provider);
				}
				return sessions;
			});
			const inFlight = operation.finally(() => {
				if (this._inFlightRegisteredSessions === inFlight) {
					this._inFlightRegisteredSessions = undefined;
				}
			});
			this._inFlightRegisteredSessions = inFlight;
		}
		return this._inFlightRegisteredSessions;
	}

	private async _advanceSessionModifiedTime(session: URI, modifiedTime: number, invalidate = true): Promise<void> {
		if (!Number.isFinite(modifiedTime)) {
			return;
		}
		const changed = await this._retryRegistryMutation(
			() => this._sessionRegistry.updateModifiedTime(session, modifiedTime),
			`modified-time update for ${session.toString()}`,
		);
		if (changed && invalidate) {
			this._invalidateSessionList();
		}
	}

	private _writeSessionModifiedTime(session: URI, modifiedTime: number): void {
		this._sessionModifiedTimeWrites = this._sessionModifiedTimeWrites
			.then(() => this._advanceSessionModifiedTime(session, modifiedTime))
			.catch(err => this._logService.warn(`[AgentService] Failed to persist the modified time for ${session.toString()}`, err));
	}

	private async _retryRegistryMutation<T>(operation: () => Promise<T>, description: string): Promise<T> {
		try {
			return await operation();
		} catch (err) {
			this._logService.warn(`[AgentService] Retrying failed session registry ${description}`, err);
			return operation();
		}
	}

	/** Returns registered candidates. Tombstones remain candidates so registration can reject them atomically. */
	private async _filterKnownSessions(provider: AgentProvider, sessions: readonly URI[]): Promise<ReadonlySet<string>> {
		const registered = await this._sessionRegistry.listSessionKeys();
		const resolutions = usesStandardSessionUris(provider)
			? await this._sessionRegistry.resolveDiscoveredSessionIdentities(provider, sessions)
			: new Map();
		const known = new Set<string>();
		const findChatBackingOwner = this._chatOwnership.createRecordedOwnerLookup();
		for (const session of sessions) {
			const key = session.toString();
			const sessionProvider = AgentSession.provider(session);
			const exclusion = sessionProvider ? await this._sessionRegistry.getSessionsV2Exclusion(sessionProvider, session) : undefined;
			const resolution = resolutions.get(key);
			if (resolution?.status === 'conflict') {
				this._logService.warn(`[AgentService] ${resolution.message}; suppressing discovery candidate ${key}`);
				known.add(key);
			} else if (registered.has(key) || resolution?.registered || exclusion?.reason === 'backing' || await this._isChatBacking(session, findChatBackingOwner)) {
				known.add(key);
			}
		}
		return known;
	}

	/**
	 * Whether a session is marked as an internal chat backing, either durably
	 * or in `_unpersistedChatBackings`.
	 */
	private async _isChatBacking(session: URI, findOwner: (chat: string) => Promise<string | undefined>): Promise<boolean> {
		if (!isAgentHostChatBacking(session, true)) {
			return false;
		}
		const sessionKey = session.toString();
		if (this._unpersistedChatBackings.has(sessionKey)) {
			return true;
		}

		try {
			const ref = await this._sessionDataService.tryOpenDatabase(session);
			if (ref) {
				try {
					const marker = await ref.object.getMetadata(CHAT_BACKING_METADATA_KEY);
					if (marker) {
						const legacyProvider = AgentSession.provider(session);
						let provider = await ref.object.getMetadata(`${CHAT_BACKING_METADATA_KEY}Provider`);
						if (provider === undefined && marker !== 'true') {
							// Only markers written before the provider was recorded need their owner.
							const owningSession = await findOwner(marker);
							provider = owningSession ? this._providerService.getProviderForSession(owningSession)?.id : undefined;
						} else if (provider === undefined && legacyProvider) {
							provider = this._providerService.getProviderForSession(session)?.id;
						}
						if (provider !== undefined && provider === legacyProvider) {
							return true;
						}
					}
				} finally {
					ref.dispose();
				}
			}
		} catch (error) {
			this._logService.warn(`[AgentService] Failed to read chat-backing metadata for ${sessionKey}; checking the central projection`, error);
		}
		try {
			return (await this._orchestratorDatabase.getSessionV2(sessionKey))?.isChatBacking === true;
		} catch (error) {
			this._logService.warn(`[AgentService] Failed to read central chat-backing projection for ${sessionKey}`, error);
			return false;
		}
	}

	/** Active list computations and their optional trailing refresh, shared per mode. */
	private readonly _inFlightListSessions = new Map<AgentHostExternalSessionsMode, ISessionListComputation>();

	private _registryEpoch = 0;

	private _invalidateSessionList(): void {
		this._registryEpoch++;
	}

	async getSessionCount(): Promise<number> {
		return (await this._sessionRegistry.listSessionKeys()).size;
	}

	async listSessions(mode = this._getExternalSessionsMode()): Promise<IAgentSessionMetadata[]> {
		const epoch = this._registryEpoch;
		const inFlight = this._inFlightListSessions.get(mode);
		if (!inFlight) {
			return [...await this._startSessionListComputation(mode).promise];
		}
		if (inFlight.epoch === epoch) {
			return [...await inFlight.promise];
		}
		if (!inFlight.trailing) {
			const startTrailing = () => this._startSessionListComputation(mode).promise;
			const trailing = inFlight.promise.then(
				result => inFlight.epoch === epoch ? result : startTrailing(),
				startTrailing,
			);
			inFlight.trailing = trailing;
			// `clear()` deliberately keeps a settled entry alive while a trailing
			// hand-off is attached, so concurrent callers await that hand-off
			// instead of each starting their own recomputation. Once the hand-off
			// itself settles nobody can join it any more, so the entry has to go:
			// otherwise it stays in the map as a permanently settled result and
			// every later listing is served from it without ever recomputing.
			// `startTrailing()` replaces the map entry with its own computation,
			// so the identity check leaves that fresh entry alone.
			const clearTrailing = () => {
				if (this._inFlightListSessions.get(mode) === inFlight) {
					this._inFlightListSessions.delete(mode);
				}
			};
			void trailing.then(clearTrailing, clearTrailing);
		}
		return [...await inFlight.trailing];
	}

	/**
	 * Enumerates only the persisted facts needed by merged-session cleanup.
	 * This deliberately avoids provider metadata, transcript materialization,
	 * presentation overlays, and the shared `listSessions()` computation.
	 */
	async listSessionLifecycleCandidates(archiveCutoff: number | undefined, deleteCutoff: number | undefined): Promise<readonly IAgentHostSessionLifecycleCandidate[]> {
		const registered = (await this._listRegisteredSessions()).filter(entry => !entry.external);
		const pending: { readonly session: URI; readonly modifiedTime: number; archived: boolean | undefined; pullRequestUrls: readonly string[] }[] = [];
		for (const entry of registered) {
			const liveSummary = this._stateManager.getSessionSummary(entry.session.toString());
			const modifiedTime = liveSummary ? Date.parse(liveSummary.modifiedAt) : entry.modifiedTime;
			const liveStatus = liveSummary?.status;
			if (liveStatus !== undefined && (liveStatus & SessionStatus.InProgress) !== 0) {
				continue;
			}
			const archived = liveStatus !== undefined ? isSessionStatusArchived(liveStatus) : undefined;
			if (archived === false && (archiveCutoff === undefined || !Number.isFinite(modifiedTime) || modifiedTime > archiveCutoff)) {
				continue;
			}
			if (archived === true && deleteCutoff === undefined) {
				continue;
			}
			if (archived === undefined
				&& deleteCutoff === undefined
				&& (archiveCutoff === undefined || !Number.isFinite(modifiedTime) || modifiedTime > archiveCutoff)) {
				continue;
			}
			// Pull requests from every folder, matching the lifecycle's re-check.
			pending.push({ session: entry.session, modifiedTime, archived, pullRequestUrls: getAllSessionRelatedPullRequestUrls(liveSummary?._meta) });
		}

		// One central read for the whole sweep and at most one session.db read per session; never imports.
		const needsMetadata = pending.filter(candidate => candidate.archived === undefined || candidate.archived || candidate.pullRequestUrls.length === 0);
		const prefetch = await this._sessionStateStore.prefetchWithoutImport(needsMetadata.map(candidate => candidate.session));
		const limiter = new Limiter<readonly [string, ReadonlyMap<string, string>]>(4);
		const persisted = new Map(await Promise.all(needsMetadata.map(candidate => limiter.queue(async () => [candidate.session.toString(), await this._sessionStateStore.readWithoutImport(candidate.session, [
			AH_META_IS_ARCHIVED_DB_KEY,
			AH_META_IS_DONE_DB_KEY,
			AH_META_AUTO_ARCHIVED_AT_DB_KEY,
			META_GITHUB_STATE,
			META_GITHUB_DATA_STATE,
		], prefetch)] as const))));
		const candidates: IAgentHostSessionLifecycleCandidate[] = [];
		for (const candidate of pending) {
			const sessionKey = candidate.session.toString();
			let { archived, pullRequestUrls } = candidate;
			let autoArchivedAt: number | undefined;
			const metadata = persisted.get(sessionKey);
			if (metadata) {
				if (archived === undefined) {
					archived = (metadata.get(AH_META_IS_ARCHIVED_DB_KEY) ?? metadata.get(AH_META_IS_DONE_DB_KEY)) === 'true';
				}
				if (archived) {
					const rawAutoArchivedAt = metadata.get(AH_META_AUTO_ARCHIVED_AT_DB_KEY);
					const value = rawAutoArchivedAt ? Number(rawAutoArchivedAt) : Number.NaN;
					autoArchivedAt = Number.isFinite(value) ? value : undefined;
				}
				if (pullRequestUrls.length === 0) {
					// A session that was not restored since each folder got its own state still has the original entry.
					const persistedMeta: { [key: string]: unknown } = {};
					for (const [metadataKey, metaKey] of [[META_GITHUB_DATA_STATE, SESSION_META_GITHUB_DATA_KEY], [META_GITHUB_STATE, SESSION_META_GITHUB_KEY]] as const) {
						const value = metadata.get(metadataKey);
						try {
							persistedMeta[metaKey] = value ? JSON.parse(value) : undefined;
						} catch (error) {
							this._logService.warn(`[AgentService] Failed to parse lifecycle GitHub state for ${sessionKey}: ${toErrorMessage(error)}`);
						}
					}
					pullRequestUrls = getAllSessionRelatedPullRequestUrls(persistedMeta);
				}
			}

			const action = archived
				? 'delete'
				: archiveCutoff !== undefined && Number.isFinite(candidate.modifiedTime) && candidate.modifiedTime <= archiveCutoff
					? 'archive' : undefined;
			if (!action || (action === 'delete' && (deleteCutoff === undefined || autoArchivedAt === undefined || autoArchivedAt > deleteCutoff))) {
				continue;
			}
			if (pullRequestUrls.length > 0) {
				candidates.push({ session: candidate.session, pullRequestUrls, action });
			}
		}
		return candidates;
	}

	private _startSessionListComputation(mode: AgentHostExternalSessionsMode): ISessionListComputation {
		const timing = this._startupPerformance.start('sessionList');
		const collectStartupMetrics = timing !== undefined || (!this._firstListingServed && this._startupPerformance.isEnabled);
		const storageAccessesAtStart = collectStartupMetrics ? this._sessionDataService.storageAccessCounts : undefined;
		let startupMetrics: IAgentHostStartupMetrics | undefined;
		const entry: ISessionListComputation = {
			epoch: this._registryEpoch,
			promise: this._computeSessions(mode, this._registryEpoch, collectStartupMetrics ? metrics => {
				startupMetrics = metrics;
				timing?.setMetrics(metrics);
			} : undefined),
		};
		this._inFlightListSessions.set(mode, entry);
		const clear = () => {
			if (!entry.trailing && this._inFlightListSessions.get(mode) === entry) {
				this._inFlightListSessions.delete(mode);
			}
		};
		void entry.promise.then(
			() => {
				clear();
				this._recordSessionListCompleted(timing, startupMetrics, storageAccessesAtStart);
			},
			() => {
				clear();
				timing?.complete('error');
			},
		);
		return entry;
	}

	private _recordSessionListCompleted(timing: IAgentHostStartupTiming | undefined, metrics: IAgentHostStartupMetrics | undefined, storageAccessesAtStart: ISessionStorageAccessCounts | undefined): void {
		if (timing || !this._firstListingServed) {
			const storageAccesses = storageAccessesAtStart ? this._sessionDataService.storageAccessCounts : undefined;
			const completedMetrics = { ...metrics, ...this._getStartupStorageMetrics(storageAccessesAtStart, storageAccesses) };
			timing?.complete('success', completedMetrics);
			if (!this._firstListingServed) {
				this._startupPerformance.mark('firstSessionList', { since: 'processStart', ...this._getStartupContext(), ...completedMetrics });
			}
		}
		this._firstListingServed = true;
		this._openStartupSettled();
	}

	private async _computeSessions(mode: AgentHostExternalSessionsMode, epoch = this._registryEpoch, collectStartupMetrics?: (metrics: IAgentHostStartupMetrics) => void): Promise<readonly IAgentSessionMetadata[]> {
		this._logService.trace('[AgentService] listSessions computation started');
		const startedAt = Date.now();
		// Which chats moved decides only what older clients see, and they wait for it themselves: read it again after a failure.
		void this._whenMovedChatOriginsLoaded();
		// Session-storage accesses are the dominant cost of a listing that cannot
		// be served from the catalog, and unlike a duration they compare across
		// machines. Capture the baseline so the summary below can report what this
		// listing itself cost rather than the process total.
		const storageAccessesAtStart = this._storageAccessCounts();
		// The registry is the source of truth for top-level sessions. Internal
		// chat backings and subagent sessions never enter it; ephemeral sessions
		// are tombstoned at creation. A transiently missing provider snapshot no
		// longer evicts a session.
		let allRegistered = await this._listRegisteredSessions();
		if (allRegistered.length === 0) {
			await this._awaitInitialProviderMigration();
			allRegistered = await this._listRegisteredSessions();
		}
		// External sessions that the current mode hides outright are dropped
		// before any provider or database read. On a large catalogue these are
		// most of the registry, and each one otherwise costs a provider metadata
		// round-trip plus several session-database opens. Their keys are kept so
		// the state-manager overlay below cannot re-surface them as fallbacks.
		const hiddenExternal = this._hidesAllExternalSessions(mode)
			? new Set(allRegistered.filter(entry => entry.external).map(entry => entry.session.toString()))
			: new Set<string>();
		const registered = hiddenExternal.size > 0
			? allRegistered.filter(entry => !hiddenExternal.has(entry.session.toString()))
			: allRegistered;
		const providersWithRegistrations = new Set(allRegistered.map(entry => entry.provider));
		this._retryInitialProviderMigrationsInBackground(provider => !providersWithRegistrations.has(provider));
		const catalogCandidates = (await Promise.all(registered.map(async registeredSession => {
			const { session } = registeredSession;
			if (isSubagentSession(session) || this._stateManager.isIdleProvisionalSession(session.toString()) || await this._isCatalogBackingProjectionPending(session)) {
				return undefined;
			}
			return registeredSession;
		}))).filter((registeredSession): registeredSession is IRegisteredSession => registeredSession !== undefined);
		const catalogReadStartedAt = Date.now();
		// Rows publish their scratch folders: the recorded set, read once at startup, lands alongside the catalog read.
		const [centralRead] = await Promise.all([this._catalogListReader.readMany(catalogCandidates), this._scratchFoldersLoaded]);
		const catalogReadPhaseMs = Date.now() - catalogReadStartedAt;
		if (centralRead.bulkReadError) {
			this._reportCatalogBulkReadFailure(centralRead);
		}
		const catalogResults = catalogCandidates.map((registeredSession, index) => {
			return {
				registeredSession,
				central: centralRead.results[index],
			};
		});
		const providersWithEligibleCatalogs = new Set(catalogResults
			.filter(result => result !== undefined && (result.central.eligible || result.central.chatBacking))
			.map(result => result!.registeredSession.provider));
		const visibleProviders = new Set(registered.map(entry => entry.provider));
		this._retryInitialProviderMigrationsInBackground(provider =>
			visibleProviders.has(provider)
			&& !providersWithEligibleCatalogs.has(provider));
		const fallbackProviders = new Map<AgentProvider, { agent: IAgent; sessionCount: number }>();
		for (const result of catalogResults) {
			if (!result || result.central.eligible || result.central.chatBacking) {
				continue;
			}
			const fallback = fallbackProviders.get(result.registeredSession.provider);
			if (fallback) {
				fallback.sessionCount++;
				continue;
			}
			const agent = this._providerService.getProvider(result.registeredSession.provider);
			if (agent?.prewarmSessionMetadata) {
				fallbackProviders.set(result.registeredSession.provider, { agent, sessionCount: 1 });
			}
		}
		const prewarmDisposables: IDisposable[] = [];
		await Promise.all([...fallbackProviders.values()].map(async ({ agent, sessionCount }) => {
			try {
				prewarmDisposables.push(await agent.prewarmSessionMetadata!(sessionCount));
			} catch (err) {
				this._logService.warn(`[AgentService] listSessions: failed to prewarm metadata for provider ${agent.id}`, err);
			}
		}));
		const repairSessions = new Set<string>();
		// Comparable across both catalog modes: `catalogServed` rows cost no provider
		// or session-database read, `providerFallback` rows cost both. The split is the
		// measurement that makes a with/without-flag comparison meaningful.
		let catalogServed = 0;
		let providerFallback = 0;
		const persistedFallbackTitles = new Map<string, string>();
		const fallbackLimiter = new Limiter<IAgentSessionMetadata | undefined>(4);
		// One central read for every session the page falls back for, so each costs one session.db read as before.
		const fallbackPrefetch = this._sessionStateStore.prefetchWithoutImport(catalogResults.flatMap(result => result && !result.central.eligible && !result.central.chatBacking ? [result.registeredSession.session] : []))
			.catch((error): SessionStateValuesPrefetch => {
				this._logService.warn('[AgentService] listSessions: failed to prefetch session state; reading per session', error);
				return new Map();
			});
		let results: readonly (IAgentSessionMetadata | undefined)[];
		const resolvePhaseStartedAt = Date.now();
		try {
			results = await Promise.all(catalogResults.map(result => fallbackLimiter.queue(async (): Promise<IAgentSessionMetadata | undefined> => {
				if (!result) {
					return undefined;
				}
				const { registeredSession, central } = result;
				const { session } = registeredSession;
				if (central.eligible) {
					catalogServed++;
					return this._withListedScratchFolders(central.metadata, central.data.chats.flatMap(chat => chat.workingDirectories ?? []));
				}
				if (central.chatBacking) {
					return undefined;
				}
				providerFallback++;
				if (!central.error) {
					repairSessions.add(session.toString());
				}
				if (central.error) {
					if (!centralRead.bulkReadError) {
						this._logService.warn(`[AgentService] Failed to read central catalog row for ${session.toString()}`, central.error);
					}
				} else {
					this._logService.trace(`[AgentService] Central catalog row for ${session.toString()} is ineligible: ${central.detail}`);
				}

				try {
					const fallback = await this._legacyRegisteredSessionMetadata(registeredSession, await fallbackPrefetch);
					if (!fallback) {
						return undefined;
					}
					if (fallback.persistedTitle) {
						persistedFallbackTitles.set(session.toString(), fallback.persistedTitle);
					}
					return this._withListedScratchFolders(fallback.metadata, []);
				} catch (err) {
					this._logService.warn(`[AgentService] listSessions: failed to read metadata for ${session}`, err);
					return undefined;
				}
			})));
		} finally {
			for (const disposable of prewarmDisposables) {
				disposable.dispose();
			}
		}
		const resolvePhaseMs = Date.now() - resolvePhaseStartedAt;
		// A late listing can still find catalog misses after disposal (a
		// queued reconciliation resolves after teardown); scheduling a repair
		// then would leak the timer, since a disposed holder drops its value.
		if (repairSessions.size > 0 && !this._store.isDisposed) {
			this._catalogListRepair.value = disposableTimeout(() => {
				this._catalogListRepair.clear();
				void Promise.allSettled([...repairSessions].map(session => this._markCatalogPayloadDirty(session))).then(() => {
					if (!this._store.isDisposed) {
						this._catalogReconciliationService.start();
					}
				});
			}, 0);
		}
		const result = results.filter((s): s is IAgentSessionMetadata => s !== undefined);
		await this._whenProvisionalSessionKeysLoaded();
		const materialized = this._provisionalSessionKeys.size === 0
			? result
			: await this._withoutUnmaterializedProvisionalSessions(result, registered);

		// Overlay live session state from the state manager.
		// For the title, prefer the state manager's value when it is
		// non-empty, so SDK-sourced titles are not overwritten by the
		// initial empty placeholder. Compact aggregate changes remain on the
		// session summary while selectable catalogues live on subscribed chat
		// state, so a fresh `listSessions` call only needs the aggregate.
		const withStatus = materialized.map(s => {
			const liveSummary = this._stateManager.getSessionSummary(s.session.toString());
			const metadata = liveSummary
				? this._withLiveSessionMetadata(s, liveSummary, false, !this._stateManager.getSurfacedSessionSummary(s.session.toString()))
				: s;
			const persistedTitle = persistedFallbackTitles.get(s.session.toString());
			return persistedTitle && !this._stateManager.getSessionState(s.session.toString())
				? { ...metadata, summary: persistedTitle }
				: metadata;
		});

		// Overlay any session known to state but missing from the providers'
		// `listSessions` snapshot, so renderer-side caches don't evict a
		// live/active session (which would close the chat view holding the
		// in-flight response bubble). Two cases need this: a provider can
		// transiently drop a session (e.g. `CopilotAgent.listSessions` returns
		// an empty array right after `session/turnComplete`), and a provisional
		// session (created but not yet materialized — see `createSession`) that
		// has had any turn activity must stay visible until it materializes.
		// Idle provisional sessions are deliberately *not* overlaid so the
		// new-session composer's eagerly-created session doesn't leak into the
		// list before its first message (#321269).
		const known = new Set(hiddenExternal);
		for (const session of withStatus) {
			known.add(session.session.toString());
		}
		const additions: IAgentSessionMetadata[] = [];
		for (const summary of this._stateManager.getOverlaySessionSummaries()) {
			if (known.has(summary.resource)) {
				continue;
			}
			// Subagent sessions are nested under their parent and must never
			// surface as top-level entries in the session list.
			if (isSubagentSession(summary.resource)) {
				continue;
			}

			const summaryWorkingDirs = summary.workingDirectories;
			const summaryMeta = this._stateManager.getSurfacedSessionSummary(summary.resource)
				? withSessionMultiRootMetadata(summary._meta, undefined)
				: summary._meta;
			additions.push({
				session: URI.parse(summary.resource),
				provider: summary.provider,
				startTime: Date.parse(summary.createdAt),
				modifiedTime: Date.parse(summary.modifiedAt),
				summary: summary.title,
				status: summary.status,
				activity: summary.activity,
				workingDirectories: summaryWorkingDirs?.map(d => URI.parse(d)),
				...(summary.project ? { project: { uri: URI.parse(summary.project.uri), displayName: summary.project.displayName } } : {}),
				changes: summary.changes,
				// This overlay path never opens the session database (unlike the
				// provider-returned sessions handled above), so carry the
				// in-memory `summary._meta` directly. It holds the live state
				// (e.g. the GitHub state published when a PR is created), so a
				// freshly-created session that the provider transiently omits
				// still reports it here.
				...(summaryMeta !== undefined ? { _meta: summaryMeta } : {}),
			});
		}
		const combined = additions.length > 0 ? [...withStatus, ...additions] : withStatus;
		const now = Date.now();
		const recentSessionKeys = mode === AgentHostExternalSessionsMode.Recent
			? this._getRecentSessionKeys(combined, now)
			: undefined;
		const visible: IAgentSessionMetadata[] = [];
		// Adoptable-legacy rows are withheld by migrate-legacy, not by the external mode.
		// Sessions skipped above were hidden by the mode too, so they still count.
		let hiddenByExternalMode = hiddenExternal.size;
		for (const session of combined) {
			if (this._shouldIncludeSession(session, mode, now, recentSessionKeys)) {
				visible.push(session);
			} else if (!readSessionEhcliAdoptable(session._meta)) {
				hiddenByExternalMode++;
			}
		}
		const total = combined.length + hiddenExternal.size;
		this._logHiddenSessions(hiddenByExternalMode, total, mode);

		// Legacy rows and per-session fallbacks can open session databases, so listing can still be slow.
		const duration = Date.now() - startedAt;
		// Emitted identically in both catalog modes so a with/without-flag run can be
		// compared directly: `catalogServed` rows are cache reads, `providerFallback`
		// rows each cost a provider round-trip plus session-database reads. The
		// storage-access deltas are the machine-independent measure of that cost.
		const storageAccesses = this._storageAccessCounts();
		const message = `[AgentService] listSessions computed ${visible.length} of ${total} session(s) for mode '${mode}' in ${duration}ms (${catalogServed} catalog-served, ${providerFallback} provider fallback, catalog read ${catalogReadPhaseMs}ms, resolve ${resolvePhaseMs}ms, ${storageAccesses.opens - storageAccessesAtStart.opens} db opens, ${storageAccesses.stats - storageAccessesAtStart.stats} db stats, ${additions.length} state-manager fallback)`;
		if (duration >= SLOW_LIST_SESSIONS_THRESHOLD_MS) {
			this._logService.info(message);
		} else {
			this._logService.trace(message);
		}
		if (epoch !== this._registryEpoch) {
			const currentRegistered = await this._listRegisteredSessions();
			if (!this._sameSessionRegistrations(allRegistered, currentRegistered)) {
				const refreshEpoch = this._registryEpoch;
				const refreshed = await this._computeSessions(mode, refreshEpoch, collectStartupMetrics);
				const inFlight = this._inFlightListSessions.get(mode);
				if (inFlight?.epoch === epoch) {
					inFlight.epoch = refreshEpoch;
				}
				return refreshed;
			}
		}
		collectStartupMetrics?.(this._getSessionListStartupMetrics(allRegistered, {
			visibleSessionCount: visible.length,
			hiddenSessionCount: hiddenByExternalMode,
			catalogServedCount: catalogServed,
			providerFallbackCount: providerFallback,
			stateFallbackCount: additions.length,
			externalSessionsMode: mode,
		}));
		return visible;
	}

	private _getSessionListStartupMetrics(registered: readonly IRegisteredSession[], metrics: IAgentHostStartupMetrics): IAgentHostStartupMetrics {
		const counts = { copilotSessionCount: 0, claudeSessionCount: 0, codexSessionCount: 0, otherSessionCount: 0 };
		for (const entry of registered) {
			switch (entry.provider) {
				case 'copilotcli': counts.copilotSessionCount++; break;
				case 'claude': counts.claudeSessionCount++; break;
				case 'codex': counts.codexSessionCount++; break;
				default: counts.otherSessionCount++; break;
			}
		}
		return {
			...metrics,
			...counts,
			registeredSessionCount: registered.length,
		};
	}

	private _reportCatalogBulkReadFailure(result: Extract<AgentHostCatalogListManyResult, { bulkReadError: Error }>): void {
		this._logService.warn(`[AgentService] Bulk session catalog read failed; bounded row recovery read ${result.fallbackRecoveredRowCount} of ${result.fallbackReadCount} row(s) in ${result.fallbackDurationMs}ms (${result.fallbackReadFailureCount} failed)`, result.bulkReadError);
		this._telemetryService.publicLogError2<AgentHostCatalogBulkReadFailureEvent, AgentHostCatalogBulkReadFailureClassification>('agentHost.catalogBulkReadFailure', {
			errorMessage: result.bulkReadError.message,
			requestedRowCount: result.fallbackReadCount,
			recoveredRowCount: result.fallbackRecoveredRowCount,
			failedRowCount: result.fallbackReadFailureCount,
			fallbackDurationMs: result.fallbackDurationMs,
		});
	}

	private _sameSessionRegistrations(first: readonly IRegisteredSession[], second: readonly IRegisteredSession[]): boolean {
		if (first.length !== second.length) {
			return false;
		}
		const secondBySession = new Map(second.map(session => [session.session.toString(), session]));
		return first.every(session => {
			const candidate = secondBySession.get(session.session.toString());
			return candidate?.provider === session.provider
				&& candidate.external === session.external
				&& candidate.source === session.source
				&& candidate.modifiedTime === session.modifiedTime;
		});
	}

	/** Last `hidden/total/mode` triple reported by {@link _logHiddenSessions}, so a steady state is logged once instead of on every refresh. */
	private _lastHiddenSessionsLog: string | undefined;

	/**
	 * Surfaces how many sessions the external-sessions setting is holding back.
	 * Without this, a session that a provider discovered but the current mode
	 * filters out is indistinguishable from one that was never discovered.
	 * `hidden` counts only rows the mode itself excluded, never the
	 * adoptable-legacy rows gated on the separate migrate-legacy setting.
	 */
	private _logHiddenSessions(hidden: number, total: number, mode: AgentHostExternalSessionsMode): void {
		const signature = `${hidden}/${total}/${mode}`;
		if (signature === this._lastHiddenSessionsLog) {
			return;
		}
		this._lastHiddenSessionsLog = signature;
		if (hidden > 0) {
			this._logService.info(`[AgentService] listSessions hid ${hidden} of ${total} session(s) (${AgentHostShowExternalSessionsConfigKey}: '${mode}')`);
		}
	}

	private _getExternalSessionsMode(): AgentHostExternalSessionsMode {
		const rootValue = this._configurationService.getRootConfigValues()?.[AgentHostShowExternalSessionsConfigKey];
		if (rootValue === 'all') {
			return AgentHostExternalSessionsMode.Last30Days;
		}
		return this._configurationService.getRootValue(platformRootSchema, AgentHostShowExternalSessionsConfigKey) ?? AgentHostExternalSessionsMode.None;
	}

	private readonly _startedChatDiscoveryProviders = new Set<AgentProvider>();

	private _startChatDiscovery(provider: IAgent, reason: string): void {
		if (!provider.startChatDiscovery || this._startedChatDiscoveryProviders.has(provider.id)) {
			return;
		}
		this._startedChatDiscoveryProviders.add(provider.id);
		void provider.startChatDiscovery().catch(error => {
			this._startedChatDiscoveryProviders.delete(provider.id);
			this._logService.warn(`[AgentService] Chat discovery for provider ${provider.id} failed after ${reason}`, error);
		});
	}

	private _isExternalSessionOlderThanMaxAge(modifiedTime: number, now: number): boolean {
		return modifiedTime < now - EXTERNAL_SESSION_MAX_AGE_MS;
	}

	private _getRecentSessionKeys(sessions: readonly IAgentSessionMetadata[], now: number): ReadonlySet<string> {
		const supersededBefore = this._getRecentLocalSessionUpdateCutoff(now);
		const recentExternalSessions = sessions
			.filter(session => readSessionExternal(session._meta)
				&& !readSessionEhcliAdoptable(session._meta)
				&& session.modifiedTime >= now - 7 * DAY_MS
				&& session.modifiedTime >= supersededBefore)
			.sort((a, b) => {
				const timeDifference = b.modifiedTime - a.modifiedTime;
				if (timeDifference !== 0) {
					return timeDifference;
				}
				const aKey = a.session.toString();
				const bKey = b.session.toString();
				return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
			})
			.slice(0, RECENT_EXTERNAL_SESSION_LIMIT);
		return new Set(recentExternalSessions.map(session => session.session.toString()));
	}

	private _getRecentLocalSessionUpdateCutoff(now: number): number {
		return this._recentLocalSessionUpdateSnapshot[RECENT_LOCAL_SESSION_UPDATE_LIMIT - 1]?.modifiedTime ?? now - 7 * DAY_MS;
	}

	private _recordRecentLocalSessionUpdate(session: URI, modifiedTime: number): void {
		if (!Number.isFinite(modifiedTime)) {
			return;
		}

		const sessionKey = session.toString();
		const existing = this._recentLocalSessionUpdates.find(entry => entry.session === sessionKey);
		if (existing && existing.modifiedTime >= modifiedTime) {
			return;
		}

		const next = [
			...this._recentLocalSessionUpdates.filter(entry => entry.session !== sessionKey),
			{ session: sessionKey, modifiedTime },
		]
			.sort((a, b) => b.modifiedTime - a.modifiedTime || a.session.localeCompare(b.session))
			.slice(0, RECENT_LOCAL_SESSION_UPDATE_LIMIT);
		if (next.length === this._recentLocalSessionUpdates.length
			&& next.every((entry, index) => entry.session === this._recentLocalSessionUpdates[index].session
				&& entry.modifiedTime === this._recentLocalSessionUpdates[index].modifiedTime)) {
			return;
		}

		this._recentLocalSessionUpdates = next;
		if (!this._storageService.loadError) {
			this._storageService.set(RECENT_LOCAL_SESSION_UPDATES_STORAGE_KEY, next);
		}
	}

	private _readRecentLocalSessionUpdates(): readonly IRecentLocalSessionUpdate[] {
		if (this._storageService.loadError) {
			this._logService.warn('[AgentService] Recent local session updates could not be restored because Agent Host storage failed to load.');
			return [];
		}
		const stored = this._storageService.get<unknown>(RECENT_LOCAL_SESSION_UPDATES_STORAGE_KEY);
		if (stored === undefined) {
			return [];
		}
		if (!Array.isArray(stored)
			|| stored.length > RECENT_LOCAL_SESSION_UPDATE_LIMIT
			|| !stored.every(isRecentLocalSessionUpdate)) {
			this._logService.warn('[AgentService] Ignoring invalid persisted recent local session updates.');
			return [];
		}
		const updates: readonly IRecentLocalSessionUpdate[] = stored;
		if (new Set(updates.map(entry => entry.session)).size !== updates.length) {
			this._logService.warn('[AgentService] Ignoring persisted recent local session updates with duplicate sessions.');
			return [];
		}
		return updates.toSorted((a, b) => b.modifiedTime - a.modifiedTime || a.session.localeCompare(b.session));
	}

	private _shouldIncludeSession(
		session: IAgentSessionMetadata,
		mode = this._getExternalSessionsMode(),
		now = Date.now(),
		recentSessionKeys?: ReadonlySet<string>,
	): boolean {
		// An un-adopted adoptable-legacy session belongs to the extension-host provider
		// until it is opened (and thereby adopted), except for archived legacy sessions
		// which are surfaced directly in the Archived section so they remain accessible
		// once the extension-host provider is retired. Adoption clears this marker (and
		// sets `ehcliAdopted`), so an adopted session surfaces normally below.
		if (readSessionEhcliAdoptable(session._meta)) {
			return this._isMigrateLegacyEnabled() && isSessionStatusArchived(session.status);
		}
		if (!readSessionExternal(session._meta)) {
			return true;
		}
		switch (mode) {
			case AgentHostExternalSessionsMode.Recent:
				return session.modifiedTime >= now - 7 * DAY_MS
					&& (recentSessionKeys === undefined || recentSessionKeys.has(session.session.toString()));
			case AgentHostExternalSessionsMode.Last24Hours:
				return session.modifiedTime >= now - DAY_MS;
			case AgentHostExternalSessionsMode.Last7Days:
				return session.modifiedTime >= now - 7 * DAY_MS;
			case AgentHostExternalSessionsMode.Last30Days:
				return !this._isExternalSessionOlderThanMaxAge(session.modifiedTime, now);
			case AgentHostExternalSessionsMode.None:
				return false;
		}
	}

	/**
	 * Whether {@link _shouldIncludeSession} is guaranteed to reject every
	 * external session under `mode`, letting {@link _computeSessions} drop them
	 * on the registry's `external` flag alone.
	 *
	 * `None` is the only mode that rejects external sessions outright. Adoptable-legacy
	 * rows are always excluded now (they belong to the extension host until opened), so
	 * they can never keep an external session visible.
	 */
	private _hidesAllExternalSessions(mode: AgentHostExternalSessionsMode): boolean {
		return mode === AgentHostExternalSessionsMode.None;
	}

	/**
	 * Stage-1 validation surface for the session URIs currently held by the
	 * orchestrator-owned {@link AgentSessionRegistry}.
	 */
	async getRegisteredSessions(): Promise<URI[]> {
		return (await this._listRegisteredSessions()).map(s => s.session);
	}

	/** Test surface for the durable per-provider discovery marker. */
	async isProviderRegistryBackfilled(provider: AgentProvider): Promise<boolean> {
		return this._sessionRegistry.isProviderBackfilled(provider);
	}

	/**
	 * Test surface for the legacy global backfill marker. Never written by the
	 * per-provider discovery — see the removal of automatic mirroring in
	 * {@link AgentSessionRegistry}'s class doc comment.
	 */
	async isLegacyRegistryBackfilled(): Promise<boolean> {
		return this._sessionRegistry.isBackfilled();
	}

	/** Session keys already announced this AH lifetime, so provider signals do not re-announce them. */
	private readonly _announcedSurfacedKeys = new Set<string>();
	private readonly _broadcastExternalSessions = new Set<string>();
	private _sessionListReconciliation = Promise.resolve();
	/** Coalescing state for storm-driven (mode-agnostic) reconciliations. */
	private _reconciliationInFlight = false;
	private _reconciliationDirty = false;
	private _reconciliationForceCatalogRefresh = false;

	private _migrateLegacyEnabledSnapshot: boolean | undefined;

	/**
	 * Freezes the migrate-legacy gate at host startup. The host is a shared
	 * process that survives window reloads, so a setting toggled without a full
	 * restart is live-propagated into its config; capturing the value once at
	 * bootstrap (before any such live change can arrive) is what makes the
	 * "requires a restart" contract hold. Called once from {@link agentHostBootstrap};
	 * tests never call it and keep the lazy first-read fallback.
	 */
	primeMigrateLegacyGate(): void {
		this._isMigrateLegacyEnabled();
	}

	private _isMigrateLegacyEnabled(): boolean {
		// Frozen at host startup (see `primeMigrateLegacyGate`): the gate never
		// flips mid-process, so there is no live discovery re-run / retract storm
		// to reconcile.
		return this._migrateLegacyEnabledSnapshot ??= this._configurationService.getRootValue(platformRootSchema, AgentHostMigrateLegacyCopilotCliEnabledConfigKey) === true;
	}

	/** Diagnostics-only; an implementation that owns no files reports nothing. */
	private _storageAccessCounts(): ISessionStorageAccessCounts {
		return this._sessionDataService.storageAccessCounts ?? { opens: 0, stats: 0 };
	}

	private _getStartupStorageMetrics(start: ISessionStorageAccessCounts | undefined, end: ISessionStorageAccessCounts | undefined): IAgentHostStartupMetrics | undefined {
		return start && end ? {
			databaseOpenCount: end.opens - start.opens,
			databaseStatCount: end.stats - start.stats,
		} : undefined;
	}

	private _isAgentMergeEnabled(): boolean {
		return this._configurationService.getRootValue(agentMergeRootConfigSchema, AgentMergeConfigKey.Enabled) === true;
	}

	private _queueSessionListReconciliation(previousMode?: AgentHostExternalSessionsMode, forceCatalogRefresh = previousMode !== undefined): void {
		if (previousMode !== undefined) {
			this._sessionListReconciliation = this._sessionListReconciliation
				.then(() => this._runSessionListReconciliation(previousMode, forceCatalogRefresh))
				.catch(error => this._logService.warn('[AgentService] External session reconciliation failed', error));
			return;
		}
		// Storm-driven reconciliations (discovery batches, adoptions, prune, summary
		// changes) all recompute the same current-state list, so a burst can collapse
		// to a single trailing run instead of one O(catalog) pass per trigger: while
		// one is in flight, further requests just mark it dirty to re-run once after.
		if (this._reconciliationInFlight) {
			this._reconciliationDirty = true;
			this._reconciliationForceCatalogRefresh ||= forceCatalogRefresh;
			return;
		}
		this._reconciliationInFlight = true;
		this._reconciliationDirty = false;
		const runForceCatalogRefresh = forceCatalogRefresh;
		this._sessionListReconciliation = this._sessionListReconciliation
			.then(() => this._runSessionListReconciliation(undefined, runForceCatalogRefresh))
			.catch(error => this._logService.warn('[AgentService] External session reconciliation failed', error))
			.finally(() => {
				this._reconciliationInFlight = false;
				if (this._reconciliationDirty) {
					const trailingForceCatalogRefresh = this._reconciliationForceCatalogRefresh;
					this._reconciliationDirty = false;
					this._reconciliationForceCatalogRefresh = false;
					this._queueSessionListReconciliation(undefined, trailingForceCatalogRefresh);
				}
			});
	}

	/**
	 * Recomputes and republishes a provider's list after its catalog becomes
	 * readable or sessions are marked provisional, so previously published rows
	 * that suppression now hides are retracted (#321269).
	 *
	 * The transition is one-shot, so the decision cannot depend on what happens
	 * to be published at this instant: a listing may still be
	 * computing (publication happens inside `prepareSessionSummariesForListing`)
	 * and the marker mirror loads asynchronously. Either being unpopulated here
	 * would drop the refresh and leave the stale row with nothing left to
	 * retract it, so the marker load is awaited and the exposed set is snapshot
	 * only after the fresh listing has published.
	 */
	private _queuePublishedSessionListRefresh(provider: AgentProvider): void {
		this._sessionListReconciliation = this._sessionListReconciliation
			.then(() => this._refreshPublishedSessionList(provider))
			.catch(error => this._logService.warn(`[AgentService] Published session-list refresh failed for provider ${provider}`, error));
	}

	private async _refreshPublishedSessionList(provider: AgentProvider): Promise<void> {
		await this._whenProvisionalSessionKeysLoaded();
		const provisional = [...this._provisionalSessionKeys].filter(session => this._providerService.getProviderForSession(session)?.id === provider);
		if (provisional.length === 0) {
			return;
		}
		const exposed = this._stateManager.getExposedSessionKeys().filter(session => provisional.includes(session));
		if (exposed.length === 0) {
			return;
		}
		this._invalidateSessionList();
		const visible = new Set((await this.listSessions())
			.filter(metadata => metadata.provider === provider)
			.map(metadata => metadata.session.toString()));
		for (const session of this._stateManager.getExposedSessionKeys().filter(session => provisional.includes(session))) {
			if (!visible.has(session)) {
				this._stateManager.retractSurfacedSession(session);
			}
		}
	}

	private async _runSessionListReconciliation(previousMode: AgentHostExternalSessionsMode | undefined, forceCatalogRefresh: boolean): Promise<void> {
		await this._reconcileExternalSessions(previousMode, forceCatalogRefresh);
	}

	private async _reconcileExternalSessions(previousMode: AgentHostExternalSessionsMode | undefined, forceCatalogRefresh = false): Promise<void> {
		const startedAt = Date.now();
		if ((forceCatalogRefresh || this._startupSettled.isOpen())
			&& this._getExternalSessionsMode() !== AgentHostExternalSessionsMode.None) {
			try {
				await (forceCatalogRefresh
					? this._catalogReconciliationService.runFullPass()
					: this._catalogReconciliationService.runPass());
			} catch (error) {
				this._logService.warn('[AgentService] Catalog verification before external session reconciliation failed; continuing with cached rows', error);
			}
		}
		const previouslyBroadcast = new Set(this._broadcastExternalSessions);
		const previouslyExposed = new Set(previouslyBroadcast);
		for (const session of this._stateManager.getExposedExternalSessionKeys()) {
			previouslyExposed.add(session);
		}
		const listed = previousMode !== undefined
			? this._resolveModeChangeVisibility(await this.listSessions(AgentHostExternalSessionsMode.Last30Days), previousMode, previouslyExposed)
			: await this.listSessions();
		const visible = new Set<string>();
		const visibleExternal = new Set<string>();
		let published = 0;
		for (const metadata of listed) {
			const key = metadata.session.toString();
			const external = readSessionExternal(metadata._meta);
			if (!external && !previouslyExposed.has(key)) {
				continue;
			}
			visible.add(key);
			if (external) {
				visibleExternal.add(key);
			}
			if (!previouslyBroadcast.has(key)) {
				published++;
			}
			if (this._stateManager.getSessionState(key)) {
				this._stateManager.setSessionSummaryPublished(key, true);
			} else {
				const provider = metadata.provider ?? this._providerService.getProviderForSession(metadata.session)?.id;
				if (provider) {
					await this._announceSurfacedSession(metadata, provider);
				}
			}
		}
		let retracted = 0;
		for (const key of previouslyExposed) {
			if (!visible.has(key)) {
				const summary = this._stateManager.getSessionSummary(key) ?? this._stateManager.getSurfacedSessionSummary(key);
				if (summary && !readSessionExternal(summary._meta)) {
					continue;
				}
				retracted++;
				if (this._stateManager.getSessionState(key)) {
					this._stateManager.setSessionSummaryPublished(key, false);
				} else {
					this._stateManager.retractSurfacedSession(key);
				}
				this._announcedSurfacedKeys.delete(key);
			}
		}
		this._broadcastExternalSessions.clear();
		for (const key of visibleExternal) {
			this._broadcastExternalSessions.add(key);
		}
		const duration = Date.now() - startedAt;
		const message = `[AgentService] External session reconciliation done in ${duration}ms (mode: '${this._getExternalSessionsMode()}'${previousMode !== undefined ? `, previous: '${previousMode}'` : ''}): ${published} published, ${retracted} retracted, ${visibleExternal.size} visible`;
		// A prompt no-op pass is steady-state noise.
		if (published > 0 || retracted > 0 || duration >= SLOW_LIST_SESSIONS_THRESHOLD_MS) {
			this._logService.info(message);
		} else {
			this._logService.trace(message);
		}
	}

	/**
	 * Derives both the previous and current mode's visible sets from one catalog
	 * pass, since {@link AgentHostExternalSessionsMode.Last30Days} is a superset of every
	 * mode and the mode is just a parameter to {@link _shouldIncludeSession}.
	 * Adds what `previousMode` had exposed into `previouslyExposed`.
	 */
	private _resolveModeChangeVisibility(
		superset: readonly IAgentSessionMetadata[],
		previousMode: AgentHostExternalSessionsMode,
		previouslyExposed: Set<string>,
	): IAgentSessionMetadata[] {
		const now = Date.now();
		const mode = this._getExternalSessionsMode();
		const recentKeysFor = (candidate: AgentHostExternalSessionsMode) => candidate === AgentHostExternalSessionsMode.Recent
			? this._getRecentSessionKeys(superset, now)
			: undefined;

		const previousRecentKeys = recentKeysFor(previousMode);
		for (const session of superset) {
			if (readSessionExternal(session._meta) && this._shouldIncludeSession(session, previousMode, now, previousRecentKeys)) {
				previouslyExposed.add(session.session.toString());
			}
		}

		const recentKeys = recentKeysFor(mode);
		const visible = superset.filter(session => this._shouldIncludeSession(session, mode, now, recentKeys));
		// The pass ran as `Last30Days`, so report the mode actually in effect instead.
		this._logHiddenSessions(superset.length - visible.length, superset.length, mode);
		return visible;
	}

	private async _announceSurfacedSession(meta: IAgentSessionMetadata, provider: string): Promise<void> {
		const key = meta.session.toString();
		if (!this._shouldIncludeSession(meta) || this._stateManager.getSessionState(key)) {
			return;
		}
		if (this._announcedSurfacedKeys.has(key)) {
			const { title, modifiedAt, project, workingDirectories, _meta } = this._surfacedSessionSummary(meta, provider);
			this._stateManager.updateSurfacedSessionMetadata(key, { title, modifiedAt, project, workingDirectories, _meta });
			return;
		}
		this._announcedSurfacedKeys.add(key);
		try {
			if (await this._sessionRegistry.isTombstoned(meta.session)) {
				this._announcedSurfacedKeys.delete(key);
				return;
			}
			const title = await this._resolveSurfacedSessionTitle(meta);
			const effectiveMetadata = title ? { ...meta, summary: title } : meta;
			// The external-sessions mode may have changed during the await above; re-check so a row that is no longer visible is not surfaced.
			if (!this._shouldIncludeSession(effectiveMetadata)) {
				this._announcedSurfacedKeys.delete(key);
				return;
			}
			this._stateManager.announceSurfacedSession(this._surfacedSessionSummary(effectiveMetadata, provider));
			if (readSessionExternal(effectiveMetadata._meta)) {
				this._broadcastExternalSessions.add(key);
			}
		} catch (err) {
			this._announcedSurfacedKeys.delete(key);
			throw err;
		}
	}

	private async _resolveSurfacedSessionTitle(metadata: IAgentSessionMetadata): Promise<string | undefined> {
		const registered = await this._sessionRegistry.get(metadata.session);
		if (registered) {
			const central = await this._catalogListReader.read(registered);
			if (central.eligible) {
				return central.metadata.summary;
			}
		}
		return this._readPersistedSessionTitle(metadata.session);
	}

	private async _readPersistedSessionTitle(session: URI, prefetch?: SessionStateValuesPrefetch): Promise<string | undefined> {
		const [snapshot] = await this._orchestratorDatabase.readCatalogSnapshot([session.toString()]);
		const normalized = snapshot?.authorityVersion === 2;
		const defaultChat = this._resolveDefaultChat(session, snapshot, undefined);
		const defaultChatTitleKey = customChatTitleMetadataKey(defaultChat);
		let mirroredChatTitle: string | undefined;
		try {
			const metadata = await this._sessionStateStore.readWithoutImport(session, [SESSION_CUSTOM_TITLE_KEY, ...(normalized ? [] : [defaultChatTitleKey])], prefetch);
			mirroredChatTitle = metadata.get(defaultChatTitleKey);
			const sessionTitle = metadata.get(SESSION_CUSTOM_TITLE_KEY);
			if (sessionTitle) {
				return sessionTitle;
			}
		} catch (error) {
			this._logService.warn(`[AgentService] Failed to read session title metadata for ${session.toString()}`, error);
		}
		return this._readDefaultChatTitle(session, mirroredChatTitle);
	}

	private async _readDefaultChatTitle(session: URI, fallback?: string): Promise<string | undefined> {
		const [snapshot] = await this._orchestratorDatabase.readCatalogSnapshot([session.toString()]);
		if (snapshot?.authorityVersion === 2) {
			const metadata = snapshot.chats.find(chat => chat.chat === snapshot.header?.defaultChatUri)?.metadata;
			return metadata?.titleSource === 'user' || metadata?.titleSource === 'agent' ? metadata.summary : undefined;
		}
		try {
			const ref = await this._sessionDataService.tryOpenDatabase(URI.parse(this._resolveDefaultChat(session, snapshot, undefined)));
			if (!ref) {
				return fallback;
			}
			try {
				return await ref.object.getMetadata(SESSION_CUSTOM_TITLE_KEY) || fallback;
			} finally {
				ref.dispose();
			}
		} catch (error) {
			this._logService.warn(`[AgentService] Failed to read default chat title for ${session.toString()}`, error);
			return fallback;
		}
	}

	/** Synthesizes the minimal {@link SessionSummary} for a provider session surfaced outside the normal list response. */
	private _surfacedSessionSummary(meta: IAgentSessionMetadata, provider: string): SessionSummary {
		return {
			resource: meta.session.toString(),
			provider,
			title: meta.summary ?? '',
			// Surfaced legacy sessions predate agent-host read ownership, which has
			// no per-session read flag for them yet. Default them to read: the
			// client trusts the provider's read state once it owns it, so an
			// unflagged summary would otherwise flip every previously-seen session
			// to unread the moment migration is turned on.
			status: withSessionStatusFlag(meta.status ?? SessionStatus.Idle, SessionStatus.IsRead, true),
			createdAt: new Date(meta.startTime).toISOString(),
			modifiedAt: new Date(meta.modifiedTime).toISOString(),
			...(meta.project ? { project: { uri: meta.project.uri.toString(), displayName: meta.project.displayName } } : {}),
			workingDirectories: meta.workingDirectories?.map(d => d.toString()),
			_meta: meta._meta,
		};
	}

	async createSession(config: IAgentServiceCreateSessionConfig | undefined): Promise<URI> {
		const provider = this._providerService.resolveProvider(config?.provider);
		if (provider && config?.session && this._providerService.getProviderForSession(config.session) === provider) {
			this._cancelPendingSessionGc(config.session);
		}
		return config?.session
			? this._sessionCreationSequencer.queue(AgentSession.id(config.session), () => this._createSession(config))
			: this._createSession(config);
	}

	private async _createSession(config: IAgentServiceCreateSessionConfig | undefined): Promise<URI> {
		const provider = this._providerService.resolveProvider(config?.provider);
		const isEphemeral = config ? readEphemeralSessionMeta(config).isEphemeral === true : false;
		if (!provider) {
			throw new Error(`No agent provider registered for: ${config?.provider ?? '(none)'}`);
		}
		if (config?.credentials) {
			this._requireProviderCredentials(provider, config.credentials);
		}
		if (config?.session?.scheme === 'ahp-session') {
			const requested = config.session;
			const registered = await this._orchestratorDatabase.getSessionV2Registration(requested.toString());
			if (registered && registered.provider !== provider.id) {
				throw new Error(`Session ${requested.toString()} is already owned by ${registered.provider}`);
			}
			if (!registered) {
				const keys = await this._sessionRegistry.listRuntimeCompatibleSessionKeys();
				if ([...keys].some(key => AgentSession.id(key) === AgentSession.id(requested))
					|| await this._fileService.exists(this._sessionDataService.getSessionDataDir(requested))
					|| await this._sessionRegistry.isTombstoned(requested)) {
					throw new Error(`Session storage identity is already in use: ${requested.toString()}`);
				}
			}
		} else if (config?.session && !await this._orchestratorDatabase.getSessionV2Registration(config.session.toString())) {
			const requestedId = AgentSession.id(config.session);
			const keys = await this._sessionRegistry.listRuntimeCompatibleSessionKeys();
			if ([...keys].some(key => URI.parse(key).scheme === 'ahp-session' && AgentSession.id(key) === requestedId)) {
				throw new Error(`Session storage identity is already in use: ${config.session.toString()}`);
			}
		}
		if (config?.session) {
			this._cancelPendingSessionGc(config.session);
			this._sessionResidency.touch(config.session);
			this._otelService.setSessionComparisonMetadata(config.session.toString(), readSessionComparisonMetadata(config._meta));
		}

		// Capability gate: only a provider that advertises
		// `multipleWorkingDirectories` accepts more than one working directory.
		// For a provider that does not, keep the primary (index 0 = the process
		// root) and drop the rest so the plural plumbing cannot forward an
		// unsupported set — the agent still launches in the user's chosen folder.
		// This is a create-time-only grant: runtime add/remove of directories is
		// still rejected in the dispatch path, so a provider that opts in accepts
		// the set at creation but its members remain fixed for the session.
		if (config?.workingDirectories && config.workingDirectories.length > 1) {
			const supportsMultiple = !!provider.getDescriptor().capabilities?.multipleWorkingDirectories;
			if (!supportsMultiple) {
				this._logService.warn(`[AgentService] Provider '${provider.id}' does not advertise multipleWorkingDirectories; truncating ${config.workingDirectories.length} working directories to 1.`);
				config = { ...config, workingDirectories: [config.workingDirectories[0]] };
			}
		}

		// When importing a conversation, assign fresh UUID turn ids up front so
		// the provider seeds an event log whose ids match the protocol turns we
		// seed below — keeping edit / fork / truncate addressable at the SDK
		// boundary.
		if (config?.importConversation) {
			const importedTurns = config.importConversation.turns.map(t => ({ ...t, id: generateUuid() }));
			config = { ...config, importConversation: { ...config.importConversation, turns: importedTurns } };
		}

		// Resolve host-owned isolation before provider creation. Providers such as
		// Codex may schedule eager prewarming from createSession; marking a
		// client-chosen worktree session pending first prevents that prewarm from
		// materializing in the picked folder before the host creates the worktree.
		const initializeSideEffects = this._sideEffects.initialize();
		const sessionConfig = await this._resolveCreatedSessionConfig(provider, config);
		const agentMergeEnabled = isAnyAgentMergeEnabled(sessionConfig?.values, config?.workingDirectories?.[0] ? getWorkingDirectoryKey(config.workingDirectories[0].toString()) : undefined);
		// A pull request session always gets a worktree, and fails rather than
		// falling back to the folder when its working directory is not a repository.
		const deferWorktreeCreation = (sessionConfig?.values?.[SessionConfigKey.Isolation] === 'worktree' || getSessionPullRequestUrl(sessionConfig?.values) !== undefined) && !config?.importConversation;

		this._logService.trace(`[AgentService] createSession: initializing auto-approver and creating session...`);
		const [, created] = await Promise.all([
			initializeSideEffects,
			this._createProviderSession(provider, config, deferWorktreeCreation, agentMergeEnabled),
		]);
		const session = created.session;
		const isIdleProvisional = created.provisional === true && !config?.importConversation;
		this._logService.trace(`[AgentService] createSession: initialization complete`);
		const creationReference = readSessionCreationReference(config?._meta);
		const devContainerWorktree = readAgentDevContainerWorktreeMetadata(config?._meta);
		const remoteOrigin = readRemoteSessionOrigin(config);
		const initiator = readSessionInitiator(config)
			?? (creationReference ? readSessionInitiator(this._stateManager.getSessionSummary(creationReference.session)) : undefined)
			?? getLegacySessionInitiator(provider.id, false);
		config = { ...config, legacyChatUris: config?.legacyChatUris, _meta: withSessionInitiator(config?._meta, initiator) };
		if (isEphemeral) {
			try {
				await this._retryRegistryMutation(
					() => this._sessionRegistry.tombstone(session),
					`tombstoning ephemeral session ${session.toString()}`,
				);
				if (!isIdleProvisional) {
					this._invalidateSessionList();
				}
			} catch (err) {
				await this._rollbackProviderSession(provider, session, created.defaultChat);
				throw err;
			}
		} else {
			try {
				const registeredAt = Date.now();
				// The provider deferred this session's backing, so nothing exists on
				// its side until the first send. That fact is recorded durably in the
				// same transaction as the registration: the in-memory
				// `isIdleProvisionalSession` guard reports `false` for a session it no
				// longer tracks, so after a crash it stops hiding this registration and
				// the session surfaces as a row that can never be described (#321269).
				// Writing the marker separately would leave a window where a crash
				// produces exactly the unmarked orphan this marker exists to catch.
				await this._retryRegistryMutation(
					() => this._sessionRegistry.register(session, { provider: provider.id, startTime: registeredAt, modifiedTime: registeredAt, source: 'explicit' }, { checkTombstone: false, provisional: isIdleProvisional }),
					`registration for ${session.toString()}`,
				);
				const metadata: Record<string, string> = { [SESSION_INITIATOR_METADATA_KEY]: JSON.stringify(initiator) };
				if (creationReference) {
					metadata[AH_META_CREATED_BY_SESSION_DB_KEY] = JSON.stringify(creationReference);
				}
				if (devContainerWorktree) {
					metadata[AH_META_DEV_CONTAINER_WORKTREE_DB_KEY] = JSON.stringify(devContainerWorktree);
				}
				if (remoteOrigin) {
					metadata[REMOTE_SESSION_ORIGIN_METADATA_KEY] = JSON.stringify(remoteOrigin);
				}
				if (config?.credentials?.principal) {
					metadata[SESSION_CREDENTIAL_PRINCIPAL_KEY] = JSON.stringify(config.credentials.principal);
				}
				// The central write is the commit: its failure rolls the session back. The old-format mirror is
				// written (and retried) in the background, so a mirror-only failure must not undo a committed session.
				// A crash before this write leaves a registered session without markers, which restore treats as
				// absent (initiator falls back to the legacy one).
				await this._sessionStateStore.writeMetadata(session, session, metadata, SessionStateMirrorFlush.Coalesced);
				if (isIdleProvisional) {
					this._provisionalSessionKeys.add(session.toString());
				} else {
					this._invalidateSessionList();
				}
			} catch (err) {
				await this._rollbackProviderSession(provider, session, created.defaultChat);
				throw err;
			}
		}

		// Cancel any pending GC armed for this URI. A client may be
		// re-issuing `createSession` for an existing URI mid-grace (e.g.
		// during a reconnect that returned `missing`); without this, the
		// timer would still fire and dispose the just-revived session
		// before the follow-up `subscribe` arrives.
		this._cancelPendingSessionGc(session);
		this._sessionResidency.touch(session);

		this._logService.trace(`[AgentService] createSession: provider=${provider.id} model=${config?.model?.id ?? '(default)'}`);
		this._providerService.associateSession(session.toString(), provider.id);

		// Record this session's opt-in so a cold SDK download triggered at
		// materialization (first message) is surfaced as progress. The download
		// is provider-global, so we only track interest here; emission is keyed
		// by the download's own identity, not this token. Cleared on
		// materialize/dispose.
		if (config?.progressToken) {
			let sessions = this._downloadProgressInterest.get(provider.id);
			if (!sessions) {
				sessions = new Set<string>();
				this._downloadProgressInterest.set(provider.id, sessions);
			}
			sessions.add(session.toString());
		}
		this._logService.trace(`[AgentService] createSession returned: ${session.toString()}`);

		// Provisional sessions deliberately suppress their `sessionAdded`
		// notification until materialization, so it is safe — and important — to
		// create their in-memory state before asking the provider for its initial
		// customization snapshot. Providers may publish incremental plugin load
		// updates while resolving that snapshot; without a state entry those
		// actions are rejected as targeting an unknown session and custom agents
		// can disappear from the picker permanently.
		const provisionalState = isIdleProvisional
			? (() => {
				const summary = this._buildInitialSummary(provider, session, config, created, '');
				const state = this._stateManager.createSession(summary, { emitNotification: false });
				state.config = sessionConfig;
				state.activeClients = config?.activeClient ? [config.activeClient] : [];
				return state;
			})()
			: undefined;

		// Resolve config and seed the initial customization set in parallel so
		// both are available before we register the session in the state
		// manager. Seeding `state.customizations` directly (instead of
		// dispatching `SessionCustomizationsChanged` after the fact) means
		// the very first snapshot a subscriber sees already contains
		// host/global customizations and the custom agents they contribute,
		// so the agent picker doesn't have to wait for a follow-up republish
		// (`RootConfigChanged`, plugin reload, or the first message's
		// `setClientCustomizations`). Subsequent updates flow through the
		// existing `SessionCustomizationsChanged` / `SessionCustomizationUpdated`
		// actions published by `PluginController`.
		const defaultChat = created.defaultChat;
		const workingDirectories = config?.workingDirectories;
		const [initialCustomizations, folderPickerDecision] = await Promise.all([
			provider.getChatCustomizations(defaultChat, this._chatContext(session, defaultChat, this._newDefaultChatStorageResource(session, defaultChat)), this._hostCustomizations(session)).catch(err => {
				this._logService.error('[AgentService] createSession: failed to resolve initial customizations', err);
				return undefined;
			}),
			// The harness owns the Folder-picker decision (it is provider-specific),
			// derived from the ordered working-directory set. Only meaningful for a
			// fresh (non-import) multi-root session — the picker never
			// shows with a single folder — and seeded into `_meta` below.
			workingDirectories && workingDirectories.length > 1 && !config?.importConversation && provider.computeFolderPickerDecision
				? provider.computeFolderPickerDecision(workingDirectories).catch(err => {
					// Fail open: on an indeterminate scan error, show the picker rather
					// than silently hiding it and pinning the default (index 0) folder.
					this._logService.error('[AgentService] createSession: failed to compute folder-picker decision', err);
					return { hidden: false };
				})
				: Promise.resolve(undefined),
		]);

		if (config?.importConversation) {
			// An imported conversation arrives with pre-existing turns (assigned
			// fresh UUID ids above). Seed them into the new session's protocol
			// state so the client renders the imported history immediately; the
			// provider has already seeded the matching SDK event log so those
			// turns are editable / forkable / truncatable.
			const importedTurns = [...config.importConversation.turns];
			const retainedTitle = config.importConversation.title?.trim() ? config.importConversation.title : undefined;
			const importedTitle = retainedTitle ?? this._buildImportedTitle(importedTurns);
			const summary = this._buildInitialSummary(provider, session, config, created, importedTitle);
			const state = this._stateManager.createSession(summary);
			state.config = sessionConfig;
			this._stateManager.seedDefaultChatTurns(summary.resource, importedTurns);
			state.activeClients = config.activeClient ? [config.activeClient] : [];

			// Keep the imported fallback title and record the imported turn count
			// as the deferred boundary. The first new successful response can then
			// refine the title without treating imported history as a new turn.
			if (retainedTitle !== undefined) {
				this._sideEffects.markTitleRenamed(summary.resource);
			} else if (importedTurns.length > 0) {
				this._sideEffects.generateForkedTitle(summary.resource, undefined, importedTurns, importedTitle);
			}
		} else {
			// Provisional sessions do not emit `sessionAdded` or `SessionReady`
			// until `onDidMaterializeChat`, but their in-memory state exists
			// immediately so clients can stream config and model changes first.
			const summary = this._buildInitialSummary(provider, session, config, created, '');
			const state = provisionalState ?? this._stateManager.createSession(summary, { emitNotification: true });
			if (!provisionalState) {
				state.config = sessionConfig;
				state.activeClients = config?.activeClient ? [config.activeClient] : [];
			}
		}
		// Discovery is asynchronous, so publish the result for clients that subscribed while it was in flight.
		if (initialCustomizations && initialCustomizations.length > 0) {
			this._stateManager.dispatchServerAction(session.toString(), { type: ActionType.SessionCustomizationsChanged, customizations: [...initialCustomizations] });
		}
		// Seed the harness-owned Folder-picker decision into the session's `_meta`.
		// Read the current `_meta` and merge synchronously (full-object replacement
		// on the wire) so concurrent slot writers (git/prompt-cache) are preserved,
		// and keep this out of the customizations path so a `_meta`-only change is
		// never dropped by the customization dedup.
		if (folderPickerDecision) {
			this._stateManager.setSessionMeta(session.toString(), withSessionFolderPickerDecision(this._stateManager.getSessionState(session.toString())?._meta, folderPickerDecision));
		}
		this._publishWorkingDirectoryIdentities(session.toString());
		// Seeded config bypasses `onDidChangeSessionConfig`, so index a session
		// created with Agent Merge already enabled.
		this._syncAgentMergeIndex(session, undefined, sessionConfig);
		this._serverToolHost.advertise(session.toString());
		// Persist resolved config values for restore. Mid-session updates are
		// persisted by `AgentSideEffects` on `SessionConfigChanged`.
		if (sessionConfig?.values && Object.keys(sessionConfig.values).length > 0 && !created.provisional) {
			this._persistConfigValues(session, sessionConfig.values);
		}

		this._changesetCoordinator.onSessionCreated(session.toString());

		if (!created.provisional) {
			await this._registerNewChatCatalog(session, created.chat?.providerData);
			const retainedTitle = config?.importConversation?.title;
			if (retainedTitle?.trim()) {
				await this._peerChatStore.persistMetadata(session, defaultChat, {
					[SESSION_CUSTOM_TITLE_KEY]: retainedTitle,
					[SESSION_CUSTOM_TITLE_SOURCE_KEY]: AGENT_HOST_TITLE_SOURCE_USER,
				});
				await this._peerChatStore.persistMetadata(session, session, {
					[SESSION_CUSTOM_TITLE_KEY]: retainedTitle,
					[SESSION_CUSTOM_TITLE_SOURCE_KEY]: AGENT_HOST_TITLE_SOURCE_USER,
				});
				await this._persistOrderedListVisibleSessionState(session, {
					[SESSION_CUSTOM_TITLE_KEY]: retainedTitle,
					[SESSION_CUSTOM_TITLE_SOURCE_KEY]: AGENT_HOST_TITLE_SOURCE_USER,
					[customChatTitleMetadataKey(defaultChat.toString())]: retainedTitle,
					[customChatTitleSourceMetadataKey(defaultChat.toString())]: AGENT_HOST_TITLE_SOURCE_USER,
				});
			}
			// Persist the host-owned workspace-less marker once the session DB
			// exists; provisional sessions defer this to `_onDidMaterializeChat`.
			try {
				await this._persistOrderedListVisibleSessionState(session, this._creationMetadataOverrides(this._stateManager.getSessionState(session.toString())?._meta));
			} catch (error) {
				this._logService.warn(`[AgentService] Initial catalog synchronization for ${session.toString()} failed after creation; scheduling repair`, error);
				await this._markCatalogPayloadDirty(session.toString());
				this._catalogReconciliationService.schedule();
			}

			// `SessionReady` means the agent has a live SDK session. Provisional
			// sessions defer it to {@link _onDidMaterializeChat}.
			this._stateManager.dispatchServerAction(session.toString(), { type: ActionType.SessionReady });
			this._changesetCoordinator.onSessionReady(session.toString());
			const readySummary = this._stateManager.getSessionSummary(session.toString());
			const gitHubState = readSessionGitHubState(readySummary?._meta, readySummary?.workingDirectories?.[0]);
			if (gitHubState) {
				await this._gitStateService.setSessionGitHubState(session.toString(), gitHubState);
			}
		}

		const workingDirectory = created.resolvedWorkingDirectory ?? config?.workingDirectories?.[0];
		void this._gitStateService.refreshSessionGitState(session.toString(), workingDirectory);

		this._sessionResidency.touch(session);
		await this._sessionResidency.reconcile();
		// Only an idle draft can run its provider before the first send. An
		// ephemeral one is short-lived by design and launches with MCP disabled,
		// so warming it would start nothing worth having.
		// A dispose that arrived during creation is waiting for it (see
		// `disposeSession`); warming that draft would outlive it.
		if (isIdleProvisional && !isEphemeral && !this._sessionResidency.isBeingDisposed(session)) {
			this._sessionPrewarmer.onProvisionalSessionCreated({ provider, session, defaultChat, workingDirectories: config?.workingDirectories });
		}
		return session;
	}

	async createDetachedWorktree(session: URI, prompt: string): Promise<{ handle: string; worktree: URI }> {
		const sessionChannel = session.toString();
		const state = this._stateManager.getSessionState(sessionChannel);
		if (state?.lifecycle !== SessionLifecycle.Creating) {
			throw new Error(`Cannot create detached worktree for non-creating session: ${sessionChannel}`);
		}

		const sessionId = AgentSession.id(session);
		if (!this._worktree.isWorkingDirectoryPending(sessionId)) {
			throw new Error(`Session is not configured for worktree isolation: ${sessionChannel}`);
		}

		const workingDirectories = this._configurationService.getEffectiveWorkingDirectories(sessionChannel);
		const workingDirectory = workingDirectories?.[0] ? URI.parse(workingDirectories[0]) : undefined;
		if (!workingDirectory) {
			throw new Error(`Cannot create detached worktree without a working directory: ${sessionChannel}`);
		}

		const credentials = await this._resolveExecutionCredentials(sessionChannel);
		return this._worktree.createDetachedWorktree({
			workingDirectory,
			config: this._configurationService.getSessionConfigValues(sessionChannel),
			prompt,
			...(credentials ? { credentialSource: credentials } : {}),
			githubToken: this._authService.getAuthToken({
				session: sessionChannel,
				resource: this._gitHubEndpointService.getCopilotResource().resource,
				scopes: this._gitHubEndpointService.getCopilotResource().scopes_supported,
			}, credentials),
		});
	}

	setDetachedWorktreeArchived(handle: string, archived: boolean): Promise<void> {
		return this._worktreeCleanup.setDetachedWorktreeArchived(handle, archived);
	}

	claimDetachedWorktree(handle: string): Promise<void> {
		return this._worktreeCleanup.claimDetachedWorktree(handle);
	}

	deleteDetachedWorktree(handle: string): Promise<void> {
		return this._worktreeCleanup.deleteDetachedWorktree(handle);
	}

	reconcileDetachedWorktrees(scope: string, activeHandles: readonly string[]): Promise<void> {
		return this._worktreeCleanup.reconcileDetachedWorktrees(scope, activeHandles);
	}

	async refreshCopilotConnectorSessions(forceConnectorName?: string): Promise<void> {
		await Promise.all(this._providerService.getProviders().map(provider => provider.refreshConnectorSessions?.(forceConnectorName)));
	}

	async uninstallPlugin(providerId: AgentProvider, request: IAgentPluginUninstallRequest, session?: URI, chat?: URI): Promise<void> {
		const provider = this._providerService.getProvider(providerId);
		if (!provider?.uninstallPlugin) {
			throw new Error(`Plugin uninstall is unavailable for provider '${providerId}'.`);
		}
		await provider.uninstallPlugin(request, session, chat);
	}

	async listSessionCanvases(session: URI, chat: URI): Promise<AgentCanvasDefinitionSnapshot> {
		this._assertCanvasesEnabled();
		await this._restoreSessionChat(session, chat, 'Canvas operation');
		const provider = this._providerService.getProviderForSession(session);
		if (!provider?.listSessionCanvases) {
			throw new Error(`Canvas inventory is unavailable for session '${session.toString()}'.`);
		}
		return provider.listSessionCanvases(session, chat, this._chatContext(session, chat, this._chatStorageResource(session, chat)));
	}

	async openSessionCanvas(session: URI, request: IAgentCanvasOpenRequest, chat: URI): Promise<void> {
		this._assertCanvasesEnabled();
		await this._restoreSessionChat(session, chat, 'Canvas operation');
		const provider = this._providerService.getProviderForSession(session);
		if (!provider?.openSessionCanvas) {
			throw new Error(`Opening canvases is unavailable for session '${session.toString()}'.`);
		}
		const credentials = await this._resolveExecutionCredentials(session.toString());
		await provider.openSessionCanvas(session, request, chat, {
			...this._chatContext(session, chat, this._chatStorageResource(session, chat)),
			...(credentials ? { credentials } : {}),
		});
	}

	async closeSessionCanvas(session: URI, request: IAgentCanvasCloseRequest, chat: URI): Promise<void> {
		this._assertCanvasesEnabled();
		// Only a resident session's live chat presents canvases, so closing one never
		// restores a session or resolves chat state, which could resume a cold chat.
		if (!this._stateManager.getSessionState(session.toString())) {
			return;
		}
		this._assertSessionOwnsChat(session, chat, 'Canvas operation');
		const provider = this._providerService.getProviderForSession(session);
		if (!provider?.closeSessionCanvas) {
			throw new Error(`Closing canvases is unavailable for session '${session.toString()}'.`);
		}
		await provider.closeSessionCanvas(session, request, chat, this._chatContext(session, chat, this._chatStorageResource(session, chat)));
	}

	private _assertCanvasesEnabled(): void {
		if (this._configurationService.getRootValue(platformRootSchema, AgentHostCanvasesEnabledConfigKey) !== true) {
			throw new Error('Canvases are disabled.');
		}
	}

	/** Restores a session and materializes one of its chats, including lazily restored peer chats. */
	private async _restoreSessionChat(session: URI, chat: URI, operation: string): Promise<void> {
		await this.restoreSession(session);
		this._assertSessionOwnsChat(session, chat, operation);
		await this._stateManager.resolveChatState(chat.toString());
	}

	private _assertSessionOwnsChat(session: URI, chat: URI, operation: string): void {
		const ownsChat = this._stateManager.getSessionState(session.toString())?.chats.some(candidate => isEqual(URI.parse(candidate.resource), chat)) === true;
		if (!ownsChat) {
			throw new Error(`${operation} targeted a chat outside session '${session.toString()}'.`);
		}
	}

	async installPlugin(providerId: AgentProvider, request: IAgentPluginInstallRequest, session?: URI, chat?: URI): Promise<void> {
		const provider = this._providerService.getProvider(providerId);
		if (!provider?.installPlugin) {
			throw new Error(`Plugin install is unavailable for provider '${providerId}'.`);
		}
		await provider.installPlugin(request, session, chat);
	}

	async retryManagedPlugins(providerId: AgentProvider, session: URI, chat?: URI): Promise<readonly IAgentManagedPluginRetryEntry[]> {
		const provider = this._providerService.getProvider(providerId);
		if (!provider?.retryManagedPlugins) {
			throw new Error(`Managed plugin retry is unavailable for provider '${providerId}'.`);
		}
		return provider.retryManagedPlugins(session, chat);
	}

	listPluginMarketplaces(providerId: AgentProvider, session: URI, chat?: URI) {
		const provider = this._providerService.getProvider(providerId);
		if (!provider?.listPluginMarketplaces) {
			throw new Error(`Plugin marketplace inventory is unavailable for provider '${providerId}'.`);
		}
		return provider.listPluginMarketplaces(session, chat);
	}

	addPluginMarketplace(providerId: AgentProvider, session: URI, source: string, chat?: URI) {
		const provider = this._providerService.getProvider(providerId);
		if (!provider?.addPluginMarketplace) {
			throw new Error(`Plugin marketplace registration is unavailable for provider '${providerId}'.`);
		}
		return provider.addPluginMarketplace(session, source, chat);
	}

	browsePluginMarketplace(providerId: AgentProvider, session: URI, name: string, chat?: URI) {
		const provider = this._providerService.getProvider(providerId);
		if (!provider?.browsePluginMarketplace) {
			throw new Error(`Plugin marketplace browse is unavailable for provider '${providerId}'.`);
		}
		return provider.browsePluginMarketplace(session, name, chat);
	}

	removePluginMarketplace(providerId: AgentProvider, session: URI, name: string, force?: boolean, chat?: URI) {
		const provider = this._providerService.getProvider(providerId);
		if (!provider?.removePluginMarketplace) {
			throw new Error(`Plugin marketplace removal is unavailable for provider '${providerId}'.`);
		}
		return provider.removePluginMarketplace(session, name, force, chat);
	}

	refreshPluginMarketplaces(providerId: AgentProvider, session: URI, name?: string, chat?: URI) {
		const provider = this._providerService.getProvider(providerId);
		if (!provider?.refreshPluginMarketplaces) {
			throw new Error(`Plugin marketplace refresh is unavailable for provider '${providerId}'.`);
		}
		return provider.refreshPluginMarketplaces(session, name, chat);
	}

	searchCustomizationMarketplace(providerId: AgentProvider, session: URI, request: IAgentCustomizationMarketplaceSearchRequest): Promise<IAgentCustomizationMarketplaceSearchResult> {
		const provider = this._providerService.getProvider(providerId);
		if (!provider?.searchCustomizationMarketplace) {
			return Promise.resolve({ kind: 'unavailable', reason: 'unsupported' });
		}
		return provider.searchCustomizationMarketplace(session, request);
	}

	listCustomizationInstallations(providerId: AgentProvider, session: URI): Promise<readonly IAgentCustomizationInstallation[]> {
		const provider = this._providerService.getProvider(providerId);
		if (!provider?.listCustomizationInstallations) {
			throw new Error(`Customization installation inventory is unavailable for provider '${providerId}'.`);
		}
		return provider.listCustomizationInstallations(session);
	}

	prepareCustomizationInstallation(providerId: AgentProvider, session: URI, request: IAgentCustomizationInstallationRequest | { readonly installationId: string }): Promise<IAgentCustomizationInstallationReview> {
		const provider = this._providerService.getProvider(providerId);
		if (!provider?.prepareCustomizationInstallation) {
			throw new Error(`Customization installation preparation is unavailable for provider '${providerId}'.`);
		}
		return provider.prepareCustomizationInstallation(session, request);
	}

	async applyCustomizationInstallation(providerId: AgentProvider, operationId: string): Promise<IAgentCustomizationInstallationApplyResult | undefined> {
		const provider = this._providerService.getProvider(providerId);
		if (!provider?.applyCustomizationInstallation) {
			throw new Error(`Customization installation apply is unavailable for provider '${providerId}'.`);
		}
		return provider.applyCustomizationInstallation(operationId);
	}

	recoverCustomizationInstallations(providerId: AgentProvider, session: URI): Promise<readonly IAgentCustomizationInstallation[]> {
		const provider = this._providerService.getProvider(providerId);
		if (!provider?.recoverCustomizationInstallations) {
			throw new Error(`Customization installation recovery is unavailable for provider '${providerId}'.`);
		}
		return provider.recoverCustomizationInstallations(session);
	}

	async addMcpServerConfiguration(providerId: AgentProvider, name: string, config: IMcpServerConfiguration): Promise<void> {
		const provider = this._providerService.getProvider(providerId);
		if (!provider?.addMcpServerConfiguration) {
			throw new Error(`MCP server configuration is unavailable for provider '${providerId}'.`);
		}
		await provider.addMcpServerConfiguration(name, config);
	}

	async createChat(session: URI, chat: URI, options?: IAgentCreateChatRequestOptions, credentials?: IAgentHostCredentialSource, initialMessageContext?: IAgentCreateChatInitialMessageContext): Promise<void> {
		const reservations = new DisposableStore();
		const { workspace, ...requestOptions } = options ?? {};
		// The requested workspace is host-owned: it resolves into the chat's working directories and never reaches providers.
		const chatOptions = workspace ? requestOptions : options;
		let scratch: IAllocatedScratchFolder | undefined;
		let prepared: IPreparedChatWorkingDirectory | undefined;
		try {
			await this._scratchFoldersLoaded;
			if (workspace?.kind === 'folder') {
				await this._requireNonScratchChatFolder(session, workspace.folder, 'createChat');
				prepared = await this._prepareRequestedChatFolder(session, chat, requestOptions, workspace, credentials);
			} else {
				scratch = await this._allocateScratchFolder(session, chat, chatOptions, workspace?.kind === 'scratch');
			}
			const directory = prepared?.directory ?? scratch?.folder;
			await this._createChatWithReservations(session, chat, directory ? { ...chatOptions, workingDirectories: [directory] } : chatOptions, reservations, credentials, initialMessageContext);
		} catch (error) {
			// Reservations hold the folder attached to the session, so they end before the detach in abort() and release().
			reservations.dispose();
			await scratch?.abort();
			await this._releasePreparedChatFolder(prepared);
			// The folders are final again: republish which are scratch folders, or clients show a released one as a workspace.
			this._publishWorkingDirectoryIdentities(session.toString());
			throw error;
		} finally {
			reservations.dispose();
		}
		// Outside the try: the chat is published, so a failure here never removes the folder under it.
		await scratch?.commit();
	}

	/**
	 * Refuses a requested chat workspace the session cannot honor: combined with folders, a fork or a side chat,
	 * for the default chat, or with a provider without chats or per-chat folders. Returns the session's provider.
	 */
	private _requireChatWorkspaceSupport(session: URI, chat: URI, options: IAgentCreateChatRequestOptions | undefined, operation: 'createChat' | 'setChatWorkspace' = 'createChat'): IAgent {
		if (options?.workingDirectories !== undefined || options?.fork !== undefined || options?.sideChat !== undefined) {
			throw new Error(`[AgentService] ${operation}: a chat workspace cannot be combined with working directories, a fork or a side chat`);
		}
		const provider = this._providerService.getProviderForSession(session);
		if (!provider) {
			throw new Error(`[AgentService] ${operation}: no provider for session ${session.toString()}`);
		}
		if (!provider.getDescriptor().capabilities?.multipleWorkingDirectories) {
			throw new Error(`[AgentService] ${operation}: provider ${provider.id} does not support a workspace per chat`);
		}
		if (!this._supportsChats(provider)) {
			throw new Error(`[AgentService] ${operation}: provider ${provider.id} does not support multiple chats`);
		}
		if (chat.toString() === this._requireDefaultChat(session)) {
			throw new Error(`[AgentService] ${operation}: the default chat cannot get a workspace of its own`);
		}
		return provider;
	}

	/** Releases a prepared folder or worktree after a failure, logging (never throwing) a failed clean-up so the failure itself surfaces. */
	private async _releasePreparedChatFolder(prepared: IPreparedChatWorkingDirectory | undefined): Promise<void> {
		try {
			await prepared?.release();
		} catch (error) {
			this._logService.error(`[AgentService] Failed to release chat folder ${prepared?.directory.toString()}: ${toErrorMessage(error)}`);
		}
	}

	/** Adds a requested folder to the session, as is or in a new worktree, for a new chat to work in. */
	private async _prepareRequestedChatFolder(session: URI, chat: URI, options: IAgentCreateChatRequestOptions, workspace: Extract<IAgentCreateChatWorkspace, { kind: 'folder' }>, credentials: IAgentHostCredentialSource | undefined, operation: 'createChat' | 'setChatWorkspace' = 'createChat'): Promise<IPreparedChatWorkingDirectory> {
		this._requireChatWorkspaceSupport(session, chat, options, operation);
		const prepared = await this.prepareChatWorkingDirectory(session, workspace.folder, {
			...(workspace.isolation === 'worktree'
				? { isolation: 'worktree', prompt: workspace.prompt, forceNewWorktree: true, ...(workspace.baseBranch !== undefined ? { baseBranch: workspace.baseBranch } : {}) }
				: { isolation: 'folder' }),
			...(credentials ? { credentialSource: credentials } : {}),
		});
		try {
			await prepared.associateWithChat?.(chat);
		} catch (error) {
			await this._releasePreparedChatFolder(prepared);
			throw error;
		}
		return prepared;
	}

	async setChatWorkspace(session: URI, chat: URI, workspace: IAgentCreateChatWorkspace, credentials?: IAgentHostCredentialSource): Promise<void> {
		const sessionKey = session.toString();
		const chatKey = chat.toString();
		await this._scratchFoldersLoaded;
		const provider = this._requireChatWorkspaceTarget(session, chat);
		if (this._applyingChatWorkspaces.has(chatKey)) {
			throw new Error(`[AgentService] setChatWorkspace: a workspace is already being applied to chat ${chatKey}`);
		}
		// Added before any await: a first message sent while the workspace is prepared is refused (see `_getWorkspaceConversionRejection`).
		this._applyingChatWorkspaces.add(chatKey);
		// Captured before any await, so a chat closed or replaced while its workspace is prepared is never rebound.
		const isCurrentChat = this._stateManager.captureChatValidity(chatKey);
		let scratch: IAllocatedScratchFolder | undefined;
		let prepared: IPreparedChatWorkingDirectory | undefined;
		let directory: URI | undefined;
		let previousDirectories: readonly string[];
		try {
			if (workspace.kind === 'folder') {
				await this._requireNonScratchChatFolder(session, workspace.folder, 'setChatWorkspace');
			}
			if (workspace.kind === 'scratch' && await this._ownScratchFolder(session, chat) !== undefined) {
				// The chat already works in a scratch folder of its own.
				return;
			}
			if (workspace.kind === 'folder' && workspace.isolation === 'folder' && this._isChatWorkingOnlyIn(session, chat, workspace.folder)) {
				// The chat already works in this folder only.
				return;
			}
			credentials = await this._resolveExecutionCredentials(sessionKey, credentials);
			if (workspace.kind === 'folder') {
				prepared = await this._prepareRequestedChatFolder(session, chat, {}, workspace, credentials, 'setChatWorkspace');
			} else {
				scratch = await this._allocateScratchFolder(session, chat, undefined, true, 'setChatWorkspace');
			}
			directory = prepared?.directory ?? scratch?.folder;
			if (!directory) {
				throw new Error(`[AgentService] setChatWorkspace: no folder was prepared for chat ${chatKey}`);
			}
			const gitState = await this._gitService.getSessionGitState(directory);
			const target = directory;
			previousDirectories = await this._chatCatalogMutationSequencer.queue(sessionKey, () => this._rebindChatWorkingDirectory(session, chat, provider, target, gitState, isCurrentChat, credentials));
		} catch (error) {
			await scratch?.abort();
			await this._releasePreparedChatFolder(prepared);
			// The folders are final again: republish which are scratch folders, or clients show a released one as a workspace.
			this._publishWorkingDirectoryIdentities(sessionKey);
			throw error;
		} finally {
			this._applyingChatWorkspaces.delete(chatKey);
		}
		// Outside the try: the chat works in the folder now, so a failure here never removes it, and none is thrown.
		await scratch?.commit();
		await this._retireReplacedScratchFolders(session, chat, directory);
		await this._releaseReplacedChatFolders(session, chat, previousDirectories, directory);
		// The folders are final: publish which are scratch folders, or clients show the chat's scratch folder as its own workspace.
		this._publishWorkingDirectoryIdentities(sessionKey);
	}

	/**
	 * Refuses a requested chat folder that is, or is inside, a chat's own scratch folder, as {@link publishedScratchFolders}
	 * defines them (recorded folders, including those of the session's chats, and the primary folder of a workspace-less
	 * session). A scratch folder belongs to one chat, so no other chat may adopt it, or a folder in it, as its workspace.
	 */
	private async _requireNonScratchChatFolder(session: URI, folder: URI, operation: 'createChat' | 'setChatWorkspace'): Promise<void> {
		const recorded = new Set((await this._orchestratorDatabase.listScratchFolders()).map(row => row.folder));
		const isRecordedScratchFolder = (candidate: string) => recorded.has(candidate) || this._stateManager.isScratchFolder(candidate);
		const sessionKey = session.toString();
		const state = this._stateManager.getSessionState(sessionKey);
		const sessionScratchFolders = [
			...publishedScratchFolders(
				isRecordedScratchFolder,
				readSessionWorkspaceless(state?._meta),
				this._stateManager.getSessionSummary(sessionKey)?.workingDirectories ?? state?.workingDirectories ?? [],
				state?.chats.flatMap(chat => chat.workingDirectories ?? []) ?? []),
			...readSessionScratchFolders(state?._meta),
		].map(scratch => URI.parse(scratch));
		// The scratch folder that refuses `folder`, in order: a scratch folder of this session that is `folder` itself; the
		// nearest recorded scratch folder of any chat, of this session or another, that is `folder` or one of its
		// ancestors; then a scratch folder of this session that contains `folder`, such as its workspace-less primary.
		const scratch = sessionScratchFolders.find(candidate => isEqual(candidate, folder))
			?? findScratchFolderOrAncestor(folder, isRecordedScratchFolder)
			?? sessionScratchFolders.find(candidate => isEqualOrParent(folder, candidate));
		if (scratch) {
			if (isEqual(scratch, folder)) {
				this._logService.info(`[AgentService] ${operation}: refused ${folder.toString()}, a chat's own scratch folder`);
				throw new Error(`'${folderLabel(folder)}' is a chat's own scratch folder; pick No Workspace for a scratch folder of its own.`);
			}
			this._logService.info(`[AgentService] ${operation}: refused ${folder.toString()}, inside the chat's own scratch folder ${scratch.toString()}`);
			throw new Error(`'${folderLabel(folder)}' is inside '${folderLabel(scratch)}', a chat's own scratch folder; pick No Workspace for a scratch folder of its own.`);
		}
	}

	/** Whether `chat` works in `folder` and no other folder. */
	private _isChatWorkingOnlyIn(session: URI, chat: URI, folder: URI): boolean {
		const directories = this._stateManager.getSessionState(session.toString())?.chats.find(candidate => candidate.resource === chat.toString())?.workingDirectories;
		return directories?.length === 1 && isEqual(URI.parse(directories[0]), folder);
	}

	/**
	 * Refuses a {@link setChatWorkspace} the chat can't take: one the session doesn't own, a forked, side or spawned
	 * chat, one with a turn or a pending message, the default chat, or a provider without chats or per-chat folders.
	 */
	private _requireChatWorkspaceTarget(session: URI, chat: URI): IAgent {
		const sessionKey = session.toString();
		const chatKey = chat.toString();
		const summary = this._stateManager.getSessionState(sessionKey)?.chats.find(candidate => candidate.resource === chatKey);
		if (!summary || this._chatOwnership.getChatOwner(chatKey) !== sessionKey) {
			throw new Error(`[AgentService] setChatWorkspace: chat ${chatKey} does not belong to session ${sessionKey}`);
		}
		const provider = this._requireChatWorkspaceSupport(session, chat, undefined, 'setChatWorkspace');
		const origin = this._stateManager.getChatOrigin(chatKey) ?? summary.origin;
		if (origin !== undefined && origin.kind !== ChatOriginKind.User) {
			throw new Error(`[AgentService] setChatWorkspace: a ${origin.kind} chat works in the workspace of the chat it came from`);
		}
		this._assertChatHasNotStarted(chat);
		if (this._workspaceConversionService.isPending(this._requireDefaultChat(session), true)) {
			throw new Error('Wait for workspace setup to finish before changing the workspace of a chat.');
		}
		return provider;
	}

	/** Throws unless `chat` has no turn, active turn or pending message: its provider backing is replaced then. */
	private _assertChatHasNotStarted(chat: URI): void {
		const state = this._stateManager.getChatState(chat.toString());
		if (!state || state.turns.length > 0 || state.turnsNextCursor !== undefined || state.activeTurn !== undefined
			|| this._stateManager.getActiveTurnId(chat.toString()) !== undefined || state.steeringMessage !== undefined || (state.queuedMessages?.length ?? 0) > 0) {
			throw new Error(`[AgentService] setChatWorkspace: chat ${chat.toString()} has already started`);
		}
	}

	/** The scratch folder `chat` owns and works in only, if any. */
	private async _ownScratchFolder(session: URI, chat: URI): Promise<string | undefined> {
		const directories = this._stateManager.getSessionState(session.toString())?.chats.find(candidate => candidate.resource === chat.toString())?.workingDirectories;
		if (directories?.length !== 1 || !this._stateManager.isScratchFolder(directories[0])) {
			return undefined;
		}
		const rows = await this._orchestratorDatabase.listScratchFolders();
		return rows.some(row => row.folder === directories[0] && row.chatUri === chat.toString() && row.state !== 'removing') ? directories[0] : undefined;
	}

	/**
	 * Replaces the provider backing of `chat`, which has not started, by one working in `directory` (already attached to
	 * the session) and publishes the folder. Runs under the session's catalog lock. The chat's folders are persisted
	 * last; when anything fails the chat's persisted and published folders and a backing in them are restored, and the
	 * original failure is thrown. A chat whose backing can't be restored either gets one on its next send
	 * ({@link _recreatePendingChatBacking}). Returns the folders the chat worked in before.
	 */
	private async _rebindChatWorkingDirectory(session: URI, chat: URI, provider: IAgent, directory: URI, gitState: ISessionGitState | undefined, isCurrentChat: () => boolean, credentials: IAgentHostCredentialSource | undefined): Promise<readonly string[]> {
		const sessionKey = session.toString();
		const chatKey = chat.toString();
		const assertCurrentChat = () => {
			if (!isCurrentChat()) {
				throw new Error(localize('agentHost.chatWorkspaceTargetChanged', "The chat was removed or replaced while changing its workspace."));
			}
		};
		assertCurrentChat();
		this._assertChatHasNotStarted(chat);
		const summary = this._stateManager.getSessionState(sessionKey)?.chats.find(candidate => candidate.resource === chatKey);
		const origin = summary?.origin;
		// `undefined` when the chat has no folders of its own: it works in its session's, and does so again when this fails.
		const ownDirectories = summary?.workingDirectories;
		const previousDirectories = ownDirectories ?? [];
		const carried = this._carriedChatCreateOptions(chatKey);
		const workingDirectories = this._resolveChatWorkingDirectories(session, provider, [directory]);
		const directories = [workingDirectories[0].toString()];
		await this._disposeChat(provider, session, chat);
		let rebound = false;
		let persisting = false;
		try {
			await this._recordChatBacking(session, chat, origin, await this._createChat(provider, chat, session, { ...carried, workingDirectories }, credentials));
			rebound = true;
			this._assertChatHasNotStarted(chat);
			assertCurrentChat();
			const sessionDirectories = this._stateManager.getSessionSummary(sessionKey)?.workingDirectories;
			if (!sessionDirectories?.includes(directories[0])) {
				throw new Error(`Cannot assign an unattached working directory to chat ${chatKey}.`);
			}
			await this._gitStateService.setFolderGitState(sessionKey, directories, gitState);
			assertCurrentChat();
			await this._persistListVisibleSessionState(session, { [SESSION_WORKING_DIRECTORIES_KEY]: JSON.stringify(sessionDirectories) });
			persisting = true;
			await this._persistChatWorkingDirectories(session, chat, directories, previousDirectories.length ? previousDirectories : sessionDirectories, assertCurrentChat);
			// Published last, when nothing can fail any more: clients can't be told that a chat has no folders of its own again.
			this._applyChatWorkingDirectories(session, chat, directories, previousDirectories);
			this._consumePreparedChatWorkingDirectories(session, directories);
			this._chatsNeedingBacking.delete(chatKey);
			return previousDirectories;
		} catch (error) {
			if (persisting) {
				try {
					if (ownDirectories) {
						await this._persistChatWorkingDirectories(session, chat, ownDirectories, directories, () => { });
					} else {
						await this._peerChatStore.updateWorkingDirectories(session, chat, undefined);
						await this._recordLaunchDirectories(session, [{ chat: chatKey, isDefault: false }], this._stateManager.getSessionState(sessionKey)?.workingDirectories ?? []);
					}
				} catch (restoreError) {
					this._logService.error(`[AgentService] Failed to restore the persisted folders of chat ${chatKey} after a failed workspace change: ${toErrorMessage(restoreError)}`);
				}
			}
			try {
				if (rebound) {
					await this._disposeChat(provider, session, chat);
				}
				// A chat without folders of its own gets its backing as on its creation: in the folders its session gives it.
				const restored = ownDirectories
					? { ...carried, workingDirectories: ownDirectories.map(previous => URI.parse(previous)) }
					: carried;
				await this._recordChatBacking(session, chat, origin, await this._createChat(provider, chat, session, restored, credentials));
			} catch (restoreError) {
				// Recoverable: the next send creates the backing in the chat's recorded folders before anything else.
				this._chatsNeedingBacking.add(chatKey);
				this._logService.error(`[AgentService] Failed to restore the backing of chat ${chatKey} after a failed workspace change; it is created on the next send: ${toErrorMessage(restoreError)}`);
			}
			throw error;
		}
	}

	/** Records a re-created provider backing of a peer chat: in memory, persisted, and its backing session. */
	private async _recordChatBacking(session: URI, chat: URI, origin: ChatOrigin | undefined, result: IAgentCreateChatResult | void): Promise<void> {
		this._stateManager.updateChatProviderData(chat.toString(), result?.providerData);
		await this._peerChatStore.upsert(session, chat, result?.providerData, origin);
		if (result?.backingSession) {
			await this._markChatBacking(result.backingSession, session, chat);
		}
	}

	/**
	 * The creation options a re-created backing of `chat` keeps from the chat: its title and the model of its draft.
	 * Its own config values are registered with the chat, so the provider sees them as on creation.
	 */
	private _carriedChatCreateOptions(chat: string): Pick<IAgentCreateChatOptions, 'title' | 'model'> {
		const state = this._stateManager.getChatState(chat);
		const title = state?.title.trim();
		const model = state?.draft?.model;
		return {
			...(title ? { title } : {}),
			...(model ? { model } : {}),
		};
	}

	/**
	 * Creates the provider backing of a chat whose restore failed after a failed workspace change, in its recorded
	 * folders, before its next turn is sent. A failure keeps it pending and fails the send.
	 */
	private async _recreatePendingChatBacking(sessionKey: string, chatKey: string, credentials: IAgentHostCredentialSource | undefined): Promise<void> {
		if (!this._chatsNeedingBacking.delete(chatKey)) {
			return;
		}
		try {
			const session = URI.parse(sessionKey);
			const chat = URI.parse(chatKey);
			const provider = this._providerService.getProviderForSession(session);
			if (!provider) {
				throw new Error(`[AgentService] no provider for session ${sessionKey}`);
			}
			const summary = this._stateManager.getSessionState(sessionKey)?.chats.find(candidate => candidate.resource === chatKey);
			const directories = summary?.workingDirectories;
			const options = {
				...this._carriedChatCreateOptions(chatKey),
				...(directories?.length ? { workingDirectories: directories.map(directory => URI.parse(directory)) } : {}),
			};
			await this._recordChatBacking(session, chat, summary?.origin, await this._createChat(provider, chat, session, options, credentials));
		} catch (error) {
			this._chatsNeedingBacking.add(chatKey);
			this._logService.error(`[AgentService] Failed to create the backing of chat ${chatKey} before its turn: ${toErrorMessage(error)}`);
			throw error;
		}
	}

	/**
	 * Schedules the removal of the scratch folders `chat` owned and no longer works in, now that it works in `directory`:
	 * detached from the session when no other chat uses them, marked `removing` for the clean-up pass. Never throws.
	 */
	private async _retireReplacedScratchFolders(session: URI, chat: URI, directory: URI): Promise<void> {
		const chatKey = chat.toString();
		try {
			const replaced = (await this._orchestratorDatabase.listScratchFolders())
				.filter(row => row.chatUri === chatKey && row.state !== 'removing' && !isEqual(URI.parse(row.folder), directory))
				.map(row => row.folder);
			if (!replaced.length) {
				return;
			}
			await this._detachDeletedChatWorkingDirectories(session, chatKey, replaced);
			for (const folder of replaced) {
				await this._orchestratorDatabase.markScratchFolderRemoving(folder);
			}
			this._worktreeCleanup.schedule();
		} catch (error) {
			this._logService.error(`[AgentService] Failed to retire the replaced scratch folders of chat ${chatKey}: ${toErrorMessage(error)}`);
		}
	}

	/**
	 * Releases the folders other than scratch folders (see {@link _retireReplacedScratchFolders}) that `chat` worked in
	 * before it moved to `directory`. A worktree created for the chat is deleted with its record, unless it holds changes
	 * (uncommitted, or commits its base branch doesn't have): that one is kept, attached. Any other folder is detached as
	 * a deleted chat's would be: unless it is the primary folder or another chat uses it. Never throws.
	 */
	private async _releaseReplacedChatFolders(session: URI, chat: URI, previousDirectories: readonly string[], directory: URI): Promise<void> {
		const chatKey = chat.toString();
		const replaced = previousDirectories.filter(previous => !isEqual(URI.parse(previous), directory) && !this._stateManager.isScratchFolder(previous));
		if (!replaced.length) {
			return;
		}
		try {
			const records = await readSessionAdditionalWorktrees(this._sessionStateStore, session);
			const folders: string[] = [];
			for (const folder of replaced) {
				const worktree = records.find(record => record.chat === chatKey && isEqual(URI.parse(record.workingDirectory), URI.parse(folder)));
				if (!worktree) {
					folders.push(folder);
				} else if (await this._hasWorktreeChanges(URI.parse(folder))) {
					this._logService.info(`[AgentService] Keeping worktree ${folder}, which chat ${chatKey} no longer works in: it has changes`);
				} else {
					await this._releaseChatWorkingDirectory(session, URI.parse(folder), worktree);
				}
			}
			if (folders.length) {
				await this._detachDeletedChatWorkingDirectories(session, chatKey, folders);
			}
		} catch (error) {
			this._logService.error(`[AgentService] Failed to release the replaced folders of chat ${chatKey}: ${toErrorMessage(error)}`);
		}
	}

	/** Whether `worktree` has uncommitted changes or commits its base branch doesn't have; also when that can't be told. */
	private async _hasWorktreeChanges(worktree: URI): Promise<boolean> {
		try {
			if (await this._gitService.hasUncommittedChanges(worktree)) {
				return true;
			}
			const gitState = await this._gitService.getSessionGitState(worktree);
			return !gitState || gitState.hasBaseBranchChanges === true || (gitState.outgoingChanges ?? 0) > 0;
		} catch {
			return true;
		}
	}

	/**
	 * Gives a new nested chat its own scratch folder: records the row, creates the folder, attaches it to the session
	 * and pins the chat to it. Unless `requested`, only nested chats of a workspace-less session get one; forks (they
	 * share their source's folder), side chats, the default chat, chats naming folders and providers without per-chat
	 * folders are left alone. A `requested` scratch folder is allocated in any session, or refused.
	 */
	/**
	 * Once at startup, marks `removing` the owned scratch folders whose chat was deleted while the row named it in
	 * another spelling than its chat catalog row (written by earlier builds), so the tombstone missed them. Only
	 * recorded data decides: no live chat under any recorded spelling of the row's chat, and nothing live lists the folder.
	 */
	private async _releaseOrphanedScratchFolders(rows: readonly IScratchFolder[]): Promise<void> {
		let released = false;
		for (const row of rows) {
			if (row.state !== 'owned') {
				continue;
			}
			try {
				released = await this._orchestratorDatabase.markOrphanedScratchFolderRemoving(row.folder, [row.chatUri]) || released;
			} catch (error) {
				this._logService.warn(`[AgentService] Failed to release the orphaned scratch folder ${row.folder}: ${toErrorMessage(error)}`);
			}
		}
		if (released) {
			this._worktreeCleanup.schedule();
		}
	}

	private async _allocateScratchFolder(session: URI, chat: URI, options: IAgentCreateChatRequestOptions | undefined, requested = false, operation: 'createChat' | 'setChatWorkspace' = 'createChat'): Promise<IAllocatedScratchFolder | undefined> {
		const sessionKey = session.toString();
		let provider: IAgent | undefined;
		if (requested) {
			provider = this._requireChatWorkspaceSupport(session, chat, options, operation);
		} else {
			if (options?.workingDirectories !== undefined || options?.fork !== undefined || options?.sideChat !== undefined) {
				return undefined;
			}
			provider = this._providerService.getProviderForSession(session);
			if (!provider?.getDescriptor().capabilities?.multipleWorkingDirectories || !this._supportsChats(provider)
				|| !readSessionWorkspaceless(this._stateManager.getSessionState(sessionKey)?._meta) || chat.toString() === this._requireDefaultChat(session)) {
				return undefined;
			}
		}
		const folder = joinPath(workspacelessChatsRoot(this._environmentService.userHome), generateUuid());
		const folderKey = folder.toString();
		// Until the allocation settles no clean-up pass may reclaim the folder, whatever the row's age.
		const inFlight = this._worktreeCleanup.trackScratchAllocation(folderKey);
		try {
			// The row names the chat as its chat catalog row will, so the chat's tombstone releases the folder: a chat
			// about to be created gets its storage identity now (a known chat keeps it; the default chat has one).
			if (chat.toString() !== this._defaultChat(session)) {
				this._orchestratorDatabase.recordChatStorageIdentity(sessionKey, chat.toString(), { kind: 'peer' });
			}
			await this._orchestratorDatabase.insertScratchFolder({ folder: folderKey, chatUri: chat.toString(), provider: provider.id, requestedAt: Date.now() });
		} catch (error) {
			inFlight.dispose();
			throw error;
		}
		let release: (() => Promise<void>) | undefined;
		const abort = async () => {
			try {
				await release?.();
				await this._fileService.del(folder, { recursive: true, useTrash: false }).catch(error => {
					if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
						throw error;
					}
				});
				await this._orchestratorDatabase.deleteScratchFolder(folderKey);
			} catch (error) {
				// The row stays `allocating`: the clean-up pass reclaims the folder, as nothing is in flight any more.
				this._logService.warn(`[AgentService] Failed to clean up scratch folder ${folderKey}: ${toErrorMessage(error)}`);
			} finally {
				this._stateManager.setScratchFolder(folderKey, false);
				inFlight.dispose();
				this._worktreeCleanup.schedule();
			}
		};
		try {
			await this._fileService.createFolder(folder);
			this._stateManager.setScratchFolder(folderKey, true);
			const prepared = await this.prepareChatWorkingDirectory(session, folder, { isolation: 'folder' });
			release = prepared.release;
		} catch (error) {
			await abort();
			throw error;
		}
		return {
			folder,
			commit: async () => {
				try {
					await this._orchestratorDatabase.markScratchFolderOwned(folderKey);
				} catch (error) {
					this._logService.warn(`[AgentService] Failed to record scratch folder ${folderKey} as owned: ${toErrorMessage(error)}`);
				} finally {
					inFlight.dispose();
					this._worktreeCleanup.schedule();
				}
			},
			abort,
		};
	}

	/** Creates a chat, reserving its folders in `reservations` from their validation until it is published. */
	private async _createChatWithReservations(session: URI, chat: URI, options: IAgentCreateChatRequestOptions | undefined, reservations: DisposableStore, credentials?: IAgentHostCredentialSource, initialMessageContext?: IAgentCreateChatInitialMessageContext): Promise<void> {
		const sessionKey = session.toString();
		const initiallyArchived = isSessionStatusArchived(this._stateManager.getSessionSummary(sessionKey)?.status);
		credentials = await this._resolveExecutionCredentials(sessionKey, credentials);
		if (credentials) {
			await this._bindExecutionCredentials(sessionKey, credentials, chat.toString());
		}
		const initialPrimaryDirectory = this._stateManager.getSessionSummary(sessionKey)?.workingDirectories?.[0];
		const defaultChat = this._requireDefaultChat(session);
		const chatUriError = createChatUriError(defaultChat, this._stateManager.getSessionState(sessionKey)?.chats.map(existing => existing.resource) ?? [], chat.toString());
		if (chatUriError !== undefined) {
			throw new Error(`[AgentService] createChat: ${chatUriError}`);
		}
		if (this._workspaceConversionService.isPending(defaultChat, true)) {
			throw new Error('Wait for workspace setup to finish before creating another chat.');
		}
		const creationError = this._worktree.getCreationError(AgentSession.id(session));
		if (creationError) {
			throw creationError;
		}
		const provider = this._providerService.getProviderForSession(session);
		if (!provider) {
			throw new Error(`[AgentService] createChat: no provider for session ${sessionKey}`);
		}
		// When forking, resolve the source chat's turns up to the fork point and
		// mint fresh turn IDs for the new chat. The agent uses the mapping to
		// remap per-turn data in the forked chat; the seeded turns make
		// the new chat surface the forked history immediately.
		let forkedTurns: Turn[] | undefined;
		let forkedTitle: string | undefined;
		let forkedSourceTitle: string | undefined;
		let persistForkedLocalTurnsAfterDuplicateCheck: (() => void) | undefined;
		const { sideChat, title: requestedTitle, initialMessage, ...providerOptions } = options ?? {};
		if (initialMessage && !initialMessageContext) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'An initial chat message requires trusted submitting-client context.');
		}
		if (initialMessage && initialMessage.origin?.kind !== MessageKind.User) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'An initial chat message must have user origin.');
		}
		const initialFork = initialMessage !== undefined && providerOptions.fork !== undefined;
		if (chat.toString() === defaultChat && initialMessage && initialMessageContext) {
			if (initialFork) {
				await this._chatCatalogMutationSequencer.queue(sessionKey, async () => {
					this._throwIfInitialForkTargetExists(sessionKey, chat, defaultChat);
				});
			}
			await this._acceptInitialMessage(sessionKey, chat, initialMessage, initialMessageContext, credentials);
			return;
		}
		if (!this._supportsChats(provider)) {
			throw new Error(`[AgentService] createChat: provider ${provider.id} does not support multiple chats`);
		}
		this._orchestratorDatabase.recordChatStorageIdentity(sessionKey, chat.toString(), { kind: 'peer' });
		const explicitTitle = requestedTitle?.trim() || undefined;
		const normalizedProviderOptions: IAgentCreateChatOptions = {
			...providerOptions,
			...(explicitTitle !== undefined ? { title: explicitTitle } : {}),
		};
		let createOptions: IAgentCreateChatOptions | undefined = normalizedProviderOptions;
		// Persist exhaustive provenance for peer chats. Fresh user-created chats
		// leave this undefined and default to `ChatOriginKind.User`.
		let peerChatOrigin: ChatOrigin | undefined;
		if (sideChat) {
			const resolvedSideChat = await this._resolveSideChatOrigin(session, sideChat);
			peerChatOrigin = resolvedSideChat.origin;
			createOptions = {
				...normalizedProviderOptions,
				...(resolvedSideChat.shouldFork
					? {
						fork: {
							source: URI.parse(resolvedSideChat.sourceChat),
							turnId: resolvedSideChat.anchorTurnId ?? sideChat.turnId,
							independentQueue: true,
						},
					}
					: {
						// Active turns run on per-chat queues, so this fresh creation cannot wait behind the source turn.
						fork: undefined,
					}),
			};
		}
		if (createOptions.workingDirectories !== undefined) {
			const workingDirectories = this._resolveChatWorkingDirectories(session, provider, createOptions.workingDirectories);
			reservations.add(this._reserveChatWorkingDirectories(session, workingDirectories.map(directory => directory.toString())));
			createOptions = { ...createOptions, workingDirectories };
		}
		if (createOptions?.fork && !sideChat) {
			const fork = createOptions.fork;
			const { sourceChatKey, sourceSessionKey, sourceState } = await this._resolveSessionSourceChat(fork.source);
			if (this._stateManager.getChatOrigin(sourceChatKey)?.kind === ChatOriginKind.Tool) {
				throw new Error(`[AgentService] createChat: cannot fork provider-spawned chat ${sourceChatKey}`);
			}
			// A chat scoped to some of the session's folders keeps that scope in its
			// fork. A chat that inherits every session folder, or a provider without
			// per-chat folders, leaves the fork inheriting them too.
			const sourceWorkingDirectories = provider.getDescriptor().capabilities?.multipleWorkingDirectories
				? this._stateManager.getChatState(sourceChatKey)?.workingDirectories
				: undefined;
			createOptions = {
				...createOptions,
				...(sourceWorkingDirectories !== undefined
					? { workingDirectories: this._resolveChatWorkingDirectories(session, provider, sourceWorkingDirectories.map(directory => URI.parse(directory))) }
					: {}),
			};
			if (sourceWorkingDirectories !== undefined) {
				reservations.add(this._reserveChatWorkingDirectories(session, sourceWorkingDirectories));
			}
			const sourceTurns = sourceState?.turns ?? [];
			// Hoisted: narrowing on `createOptions` does not survive into the callback.
			const forkTurnId = fork.turnId;
			const forkIndex = sourceTurns.findIndex(t => t.id === forkTurnId);
			if (forkIndex < 0) {
				// The fork point is unknown, so a fork is indistinguishable from a
				// fresh chat. Drop the fork to avoid the provider inheriting the
				// whole backend chat while the UI is seeded with no turns.
				createOptions = { ...createOptions, fork: undefined };
			} else {
				const slice = sourceTurns.slice(0, forkIndex + 1);
				const turnIdMapping = new Map<string, string>();
				for (const t of slice) {
					turnIdMapping.set(t.id, generateUuid());
				}
				forkedTurns = slice.map(t => ({ ...t, id: turnIdMapping.get(t.id) ?? generateUuid() }));

				// Record the fork boundary in host terms: the concrete source chat URI
				// and the requested host-visible turn id, not the provider-specific
				// one below.
				peerChatOrigin = { kind: ChatOriginKind.Fork, chat: sourceChatKey, turnId: fork.turnId };

				// Carry forked host-injected local turns (`/rename`, `!command`)
				// into the new chat so they survive reload and anchor future
				// fork/truncate. A composed fork first reserves its target in the
				// serialized catalog path, so a rejected repeat cannot rewrite an
				// existing target's local-turn metadata.
				const persistForkedLocalTurns = () => this._persistForkedLocalTurns(sessionKey, sourceChatKey, chat.toString(), slice, forkedTurns!, turnIdMapping);
				if (initialFork) {
					persistForkedLocalTurnsAfterDuplicateCheck = persistForkedLocalTurns;
				} else {
					persistForkedLocalTurns();
				}

				const forkedTitlePrefix = localize('agentHost.forkedTitlePrefix', "Forked: ");
				forkedSourceTitle = sourceState?.title || this._stateManager.getSessionState(sourceSessionKey)?.title;
				forkedTitle = forkedSourceTitle
					? (forkedSourceTitle.startsWith(forkedTitlePrefix) ? forkedSourceTitle : `${forkedTitlePrefix}${forkedSourceTitle}`)
					: localize('agentHost.forkedChatFallback', "Forked Chat");
				// The SDK fork boundary must be a concrete (SDK-backed) turn. When
				// the client forked at a host-injected local turn, redirect the
				// agent to the preceding concrete turn (the local turns are still
				// seeded into the new chat's protocol state above).
				const concreteForkTurnId = this._localTurns.resolveConcreteTurnId(sourceChatKey, fork.turnId);
				createOptions = {
					...createOptions,
					fork: {
						...fork,
						source: URI.parse(sourceChatKey),
						turnIdMapping,
						...(concreteForkTurnId !== undefined ? { turnId: concreteForkTurnId } : {}),
					},
				};
			}
		}

		const createResult = await this._chatCatalogMutationSequencer.queue(sessionKey, async () => {
			if (initialFork) {
				this._throwIfInitialForkTargetExists(sessionKey, chat, defaultChat);
			}
			if (!initiallyArchived && isSessionStatusArchived(this._stateManager.getSessionSummary(sessionKey)?.status)) {
				throw new Error(localize('agentHost.sessionArchivedWhilePreparingChat', "The session was archived while preparing the new chat. Unarchive it before trying again."));
			}
			if (this._workspaceConversionService.isPending(defaultChat, true)
				|| this._stateManager.getSessionSummary(sessionKey)?.workingDirectories?.[0] !== initialPrimaryDirectory) {
				throw new Error('The session workspace changed while preparing the new chat. Try creating the chat again.');
			}
			// The seed makes a new chat's own config values visible to the provider while it creates the chat.
			const configSeed = this._configurationService.seedChatConfig(chat.toString(), this._initialChatConfig(sessionKey, chat.toString(), peerChatOrigin));
			try {
				persistForkedLocalTurnsAfterDuplicateCheck?.();
				// Create the backing chat before publishing `session/chatAdded` so
				// subscribers only see a chat that can already receive messages.
				const createResult = await this._createChat(provider, chat, session, createOptions, credentials);
				const providerData = createResult?.providerData;
				const title = explicitTitle ?? forkedTitle;
				const selectedTitleSource = explicitTitle !== undefined
					? AGENT_HOST_TITLE_SOURCE_USER
					: forkedTitle !== undefined ? AGENT_HOST_TITLE_SOURCE_AUTO : undefined;
				const sessionState = this._stateManager.getSessionState(sessionKey);
				if (!sessionState) {
					await provider.chats.disposeChat(chat, this._chatContext(session, chat, this._chatStorageResource(session, chat)));
					throw new Error(`[AgentService] createChat: session state disappeared for ${sessionKey}`);
				}
				const existingCatalogChats = this._catalogChatsFromState(sessionState, defaultChat).map(existing => (
					existing.kind === 'default' && !existing.title && sessionState.title
						? { ...existing, title: sessionState.title }
						: existing
				));
				const newCatalogChat = {
					uri: chat.toString(),
					kind: 'peer' as const,
					...(title !== undefined ? { title } : {}),
					...(peerChatOrigin !== undefined ? { origin: peerChatOrigin } : {}),
					...(createOptions?.workingDirectories !== undefined ? { workingDirectories: createOptions.workingDirectories.map(directory => directory.toString()) } : {}),
				};
				const existingIndex = existingCatalogChats.findIndex(existing => existing.uri === newCatalogChat.uri);
				const catalogChats = existingIndex < 0
					? [...existingCatalogChats, newCatalogChat]
					: existingCatalogChats.map((existing, index) => index === existingIndex
						? { ...existing, ...newCatalogChat, kind: existing.kind }
						: existing);
				this._catalogSyncSuppressedSessions.add(sessionKey);
				try {
					await this._peerChatStore.upsert(
						session,
						chat,
						providerData,
						peerChatOrigin,
						createResult?.inheritedTurnId,
						createOptions?.workingDirectories?.map(directory => directory.toString()),
					);
					if (peerChatOrigin?.kind !== ChatOriginKind.Tool) {
						await this._recordLaunchDirectories(session, [{ chat: chat.toString(), isDefault: false }], createOptions?.workingDirectories?.map(directory => directory.toString()) ?? this._sessionFoldersOfChatWithoutOwn(sessionKey));
					}
					if (title !== undefined) {
						await this._peerChatStore.persistMetadata(session, chat, {
							[SESSION_CUSTOM_TITLE_KEY]: title,
							[SESSION_CUSTOM_TITLE_SOURCE_KEY]: selectedTitleSource ?? AGENT_HOST_TITLE_SOURCE_AUTO,
						});
					}
					await this._persistOrderedListVisibleSessionState(session, title === undefined ? {} : {
						[customChatTitleMetadataKey(chat.toString())]: title,
						[customChatTitleSourceMetadataKey(chat.toString())]: selectedTitleSource ?? AGENT_HOST_TITLE_SOURCE_AUTO,
					}, catalogChats);
					// A fork or side chat's copied values are persisted before it is announced; a failure fails the creation.
					const initialConfig = configSeed.values;
					if (Object.keys(initialConfig).length > 0) {
						await this._sessionStateStore.chatRows.setChatConfig(session, chat, initialConfig);
					}
					this._stateManager.addChat(sessionKey, chat.toString(), creationTimeChatStorageResource(sessionKey, chat.toString(), this._defaultChat(sessionKey)), {
						...(title !== undefined ? { title } : {}),
						...(forkedTurns !== undefined ? { turns: forkedTurns } : {}),
						...(providerData !== undefined ? { providerData } : {}),
						...(peerChatOrigin !== undefined ? { origin: peerChatOrigin } : {}),
						...(createResult?.inheritedTurnId !== undefined ? { inheritedTurnId: createResult.inheritedTurnId } : {}),
						...(createOptions?.workingDirectories !== undefined ? { workingDirectories: createOptions.workingDirectories.map(directory => directory.toString()) } : {}),
						...(Object.keys(initialConfig).length > 0 ? { config: { values: initialConfig } } : {}),
					});
					// The registered chat owns its values from here on.
					configSeed.dispose();
					this._consumePreparedChatWorkingDirectories(session, createOptions?.workingDirectories?.map(directory => directory.toString()) ?? []);
					this._publishWorkingDirectoryIdentities(sessionKey);
				} catch (error) {
					const rollbackErrors: Error[] = [];
					if (existingIndex < 0) {
						// Captured before the rollback unregisters the chat: the storage its data was written to.
						const storage = URI.parse(this._chatStorageResource(session, chat));
						try {
							await this._peerChatStore.remove(session, chat);
						} catch (rollbackError) {
							rollbackErrors.push(rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError)));
						}
						try {
							await provider.chats.disposeChat(chat, this._chatContext(session, chat, this._chatStorageResource(session, chat)));
						} catch (rollbackError) {
							rollbackErrors.push(rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError)));
						}
						try {
							await this._sessionDataService.deleteSessionData(storage);
						} catch (rollbackError) {
							rollbackErrors.push(rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError)));
						}
					}
					if (rollbackErrors.length > 0) {
						throw new AggregateError([error, ...rollbackErrors], `Failed to persist and roll back chat ${chat.toString()}: ${toErrorMessage(error)}`);
					}
					throw error;
				} finally {
					this._catalogSyncSuppressedSessions.delete(sessionKey);
					this._flushDeferredCatalogMetadataOverrides(session);
				}
				return createResult;
			} finally {
				configSeed.dispose();
			}
		});
		this._sessionResidency.touch(session);
		void this._sessionResidency.reconcile();

		// If the agent exposes this chat as its own SDK session, mark that
		// backing so it stays out of the top-level session list. `_markChatBacking`
		// retries durably and falls back to in-process suppression on continued
		// failure, so it never throws here — this must never turn an
		// already-created, already-announced chat into a failed `createChat`.
		if (createResult?.backingSession) {
			await this._markChatBacking(createResult.backingSession, session, chat);
		}
		// A prompt-bearing fork must establish its one strategy-owned title path
		// before the first new turn is admitted. Explicit titles remain user-owned.
		if (explicitTitle === undefined && forkedTurns && forkedTurns.length > 0 && forkedTitle !== undefined) {
			this._sideEffects.generateForkedTitle(
				sessionKey,
				chat.toString(),
				forkedTurns,
				forkedTitle,
				forkedSourceTitle,
				initialMessage?.text,
			);
		}
		if (initialMessage && initialMessageContext) {
			await this._acceptInitialMessage(sessionKey, chat, initialMessage, initialMessageContext, credentials);
		}

	}

	private _throwIfInitialForkTargetExists(session: string, chat: URI, defaultChat: string): void {
		const state = this._stateManager.getSessionState(session);
		if (chat.toString() === defaultChat || (state !== undefined && this._catalogChatsFromState(state, defaultChat).some(candidate => candidate.uri === chat.toString()))) {
			throw new ProtocolError(AhpErrorCodes.AlreadyExists, `Chat already exists: ${chat.toString()}`);
		}
	}

	private async _acceptInitialMessage(session: string, chat: URI, message: Message, context: IAgentCreateChatInitialMessageContext, credentials?: IAgentHostCredentialSource): Promise<void> {
		const action: ChatTurnStartedAction = {
			type: ActionType.ChatTurnStarted,
			turnId: generateUuid(),
			startedAt: new Date().toISOString(),
			message,
		};
		let rewritten: ChatTurnStartedAction;
		try {
			rewritten = await this._rewriteUserMessageAttachments(session, chat.toString(), action, context.clientId, true);
		} catch (error) {
			let turn: IDeferredAgentHostTurn;
			try {
				turn = this._turnService.beginDeferredTurnMessage(chat, message, credentials);
			} catch {
				throw error;
			}
			if (!this._turnService.failDeferredTurnMessage(chat, turn, {
				errorType: 'attachmentPreparationFailed',
				message: toErrorMessage(error),
			})) {
				this._logService.info(`[AgentService] The initial turn for ${chat.toString()} ended before its attachment failure could be reported.`);
			}
			return;
		}
		// The submitting client cleared its composer once `createChat` resolved,
		// so a rejection here is the only surviving record of the prompt.
		this._turnService.startClientTurn(chat, rewritten, context.clientId, context.telemetryContext, credentials, { recoverableRejection: false });
	}

	/**
	 * Validates a side chat's source and returns its {@link ChatOriginKind.SideChat}
	 * origin. Throws when the source chat is not part of `session` or when the
	 * referenced completed or active turn is absent.
	 */
	private async _resolveSideChatOrigin(session: URI, sideChat: IAgentCreateChatSideChatSource): Promise<{ origin: ChatOrigin; sourceChat: string; selection?: IAgentCreateChatSideChatSelection; anchorTurnId?: string; shouldFork: boolean }> {
		const sessionKey = session.toString();
		const sourceKey = sideChat.source.toString();
		const { sourceChatKey, sourceSessionKey, sourceState } = await this._resolveSessionSourceChat(sideChat.source);
		// The source chat MUST belong to the target session. Older callers may
		// still address the main chat by session URI; synced AHP clients send the
		// actual default-chat URI.
		if (sourceSessionKey !== sessionKey) {
			throw new Error(`[AgentService] createChat: side chat source ${sourceKey} does not belong to session ${sessionKey}`);
		}
		// The bounded turn must be a real completed or currently-active turn.
		const activeTurn = sourceState?.activeTurn?.id === sideChat.turnId ? sourceState.activeTurn : undefined;
		const hasCompletedTurn = sourceState?.turns.some(t => t.id === sideChat.turnId) ?? false;
		if (!hasCompletedTurn && !activeTurn) {
			throw new Error(`[AgentService] createChat: side chat source turn ${sideChat.turnId} not found in ${sourceKey}`);
		}
		const sourceHasProviderFork = this._stateManager.getChatOrigin(sourceChatKey)?.kind !== ChatOriginKind.Tool;
		let anchorTurnId: string | undefined;
		if (activeTurn) {
			anchorTurnId = resolveLastNonLocalTurnId(sourceState?.turns ?? [], turnId => this._localTurns.isLocal(sourceChatKey, turnId));
		} else if (this._localTurns.isLocal(sourceChatKey, sideChat.turnId)) {
			anchorTurnId = this._localTurns.resolveConcreteTurnId(sourceChatKey, sideChat.turnId);
		}
		const selection = sideChat.selection?.text.trim()
			? sideChat.selection
			: sideChat.selection
				? (() => { throw new Error('[AgentService] createChat: side chat selection text must be non-empty'); })()
				: undefined;
		return {
			origin: {
				kind: ChatOriginKind.SideChat,
				chat: sourceChatKey,
				turnId: sideChat.turnId,
				...(selection ? { selection } : {}),
			},
			sourceChat: sourceChatKey,
			shouldFork: sourceHasProviderFork && (!activeTurn || anchorTurnId !== undefined),
			...(selection ? { selection } : {}),
			...(anchorTurnId ? { anchorTurnId } : {}),
		};
	}

	private async _resolveSessionSourceChat(source: URI): Promise<{ sourceChatKey: string; sourceSessionKey: string; sourceState: ReturnType<AgentHostStateManager['getChatState']> | undefined }> {
		const sourceKey = source.toString();
		const sourceSessionKey = isAhpChatChannel(sourceKey) ? (await this._chatOwnership.resolveChatOwner(sourceKey))?.owner : sourceKey;
		if (sourceSessionKey === undefined) {
			throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Source chat not found: ${sourceKey}`);
		}
		const defaultChatKey = this._stateManager.getSessionState(sourceSessionKey)?.defaultChat ?? this._defaultChat(sourceSessionKey);
		const isDefaultSource = sourceKey === sourceSessionKey || this._chatOwnership.isDefaultChat(sourceSessionKey, sourceKey);
		const sourceChatKey = isDefaultSource ? defaultChatKey : sourceKey;
		if (sourceChatKey === undefined) {
			throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Source session not found: ${sourceSessionKey}`);
		}
		return {
			sourceSessionKey,
			sourceChatKey,
			sourceState: isDefaultSource
				? (this._stateManager.getChatState(sourceChatKey) ?? this._stateManager.getDefaultChatState(sourceSessionKey))
				: await this._stateManager.resolveChatState(sourceChatKey),
		};
	}

	private async _resolveWorkingDirectoryForResume(session: URI, sessionId: string, workingDirectory: URI): Promise<URI> {
		const additionalWorktrees = await readSessionAdditionalWorktrees(this._sessionStateStore, session);
		const additionalWorktree = additionalWorktrees.find(candidate => isEqual(URI.parse(candidate.workingDirectory), workingDirectory));
		if (additionalWorktree) {
			return this._worktree.resolveWorkingDirectoryForResume(detachedWorktreeRecordUri(additionalWorktree.handle), additionalWorktree.handle, workingDirectory);
		}
		return this._worktree.resolveWorkingDirectoryForResume(session, sessionId, workingDirectory);
	}

	async disposeChat(session: URI, chat: URI): Promise<void> {
		this._chatWatches.deleteAndDispose(chat);
		this._chatWatchOwners.delete(chat);
		this._pendingChatHistories.delete(chat.toString());
		this._chatsNeedingBacking.delete(chat.toString());
		const sessionKey = session.toString();
		const chatKey = chat.toString();
		if (!this._isSessionRestored(sessionKey)) {
			// Loaded so the deleted chat's folders can be detached from the session workspace.
			try {
				await this.restoreSession(session);
			} catch (error) {
				this._logService.warn(`[AgentService] Failed to restore session ${sessionKey} before deleting chat ${chatKey}; its folders stay attached: ${toErrorMessage(error)}`);
			}
		}
		const provider = this._providerService.getProviderForSession(session);
		this._disposingPeerChats.add(chatKey);
		let deletedChatDirectories: readonly string[] | undefined;
		try {
			await this._chatCatalogMutationSequencer.queue(sessionKey, async () => {
				this._catalogSyncSuppressedSessions.add(sessionKey);
				let membershipRemoved = false;
				let ancillaryCleanupSucceeded = false;
				// Read before the chat leaves the catalog, which removes its recorded storage.
				const storage = await this._peerChatStorageForDeletion(session, chat);
				try {
					await this._checkpointService.discardChatTurnStartCheckpoints(session, chat);
					if (provider) {
						await this._disposeChat(provider, session, chat);
					}
					// The chat's writes are queued under its session, and under its recorded owner if that is another one.
					const owner = this._chatOwnership.getChatOwner(chatKey);
					await this._peerChatStore.whenSessionsIdle(owner && owner !== sessionKey ? [session, URI.parse(owner)] : [session]);
					await this._peerChatStore.remove(session, chat);
					membershipRemoved = true;
					await this._clearChatDraft(session, chat);
					await this._deletePeerChatData(session, chat, storage);
					await this._deletePeerChatSummaryKeys(session, chatKey);
					const state = this._stateManager.getSessionState(sessionKey);
					if (state) {
						await this._persistOrderedListVisibleSessionState(
							session,
							{},
							this._catalogChatsFromState(state, this._requireDefaultChat(sessionKey)).filter(candidate => candidate.uri !== chatKey),
						);
					}
					ancillaryCleanupSucceeded = true;
				} finally {
					if (membershipRemoved) {
						const chatsBeforeRemoval = this._stateManager.getSessionState(sessionKey)?.chats ?? [];
						deletedChatDirectories = this._getChatFamilyWorkingDirectories(chatsBeforeRemoval, chatKey, true);
						this._sideEffects.cancelSubagentSessions(chatKey);
						this._sideEffects.clearChannelTelemetry(chatKey);
						this._chatContributions.disposeChatState(chatKey);
						this._stateManager.removeChat(sessionKey, chatKey);
						await this._markCatalogPayloadDirty(sessionKey);
						this._catalogReconciliationService.schedule();
						if (!ancillaryCleanupSucceeded) {
							this._schedulePeerChatCleanupRepair(session, chat, storage);
						}
					}
					this._catalogSyncSuppressedSessions.delete(sessionKey);
					this._flushDeferredCatalogMetadataOverrides(session);
				}
			});
		} finally {
			this._disposingPeerChats.delete(chatKey);
			// Also after a failed ancillary clean-up: the chat has left the catalog by then.
			if (deletedChatDirectories?.length) {
				try {
					await this._detachDeletedChatWorkingDirectories(session, chatKey, deletedChatDirectories);
				} catch (error) {
					this._logService.error(`[AgentService] Failed to detach the folders of deleted chat ${chatKey}: ${toErrorMessage(error)}`);
				}
			}
		}
	}

	async moveChat(session: URI, chat: URI, destination: AgentChatMoveDestination): Promise<URI> {
		// One move at a time: moves are rare and short, and two moves never renumber or add folders concurrently.
		return this._chatMoveSequencer.queue(() => this._withMoveLeases(leases => this._moveChat(session, chat, destination, false, leases)));
	}

	moveSession(session: URI, destination: URI, after: URI | undefined): Promise<URI> {
		return this._chatMoveSequencer.queue(() => this._withMoveLeases(async leases => this._moveChat(session, await this._movedSessionChat(session, leases), { kind: 'session', session: destination, after }, true, leases)));
	}

	/** Runs a move with the sessions it loads only for itself held in `leases` until it ends; they are dropped then (C15). */
	private async _withMoveLeases<T>(move: (leases: DisposableStore) => Promise<T>): Promise<T> {
		const leases = new DisposableStore();
		try {
			return await move(leases);
		} finally {
			leases.dispose();
		}
	}

	/**
	 * The chat a session that moves under another session takes along: its default chat, which must be its only one.
	 * The host knows a session's default chat only once it has loaded the session, so it loads one it hasn't, held in
	 * `leases` (C15).
	 */
	private async _movedSessionChat(session: URI, leases: DisposableStore): Promise<URI> {
		const sourceKey = session.toString();
		this._assertChatMovesEnabled();
		await this._restoreForMove(session, AgentChatMoveRefusal.NotMovable, leases, true);
		const defaultChat = this._stateManager.getSessionState(sourceKey)?.defaultChat ?? this._defaultChat(sourceKey);
		if (defaultChat === undefined) {
			throw new AgentChatMoveRefusedError(AgentChatMoveRefusal.NotMovable, `Session ${sourceKey} is not available.`);
		}
		return URI.parse(defaultChat);
	}

	private _assertChatMovesEnabled(): void {
		if (this._configurationService.getRootValue(chatMoveRootConfigSchema, ChatMoveConfigKey.Enabled) !== true) {
			throw new AgentChatMoveRefusedError(AgentChatMoveRefusal.Disabled, 'Moving chats is not enabled.');
		}
	}

	/**
	 * Loads `session` for a move if the host hasn't loaded it, refusing with `refusal` when it can't be loaded. With
	 * `dataOnly`, a session that can be is loaded with its data only (C15): no client sees it, nothing of its agent
	 * starts, and it is held in `leases` until the move ends and dropped then, so opening it later restores it in full.
	 * Otherwise, or when its data can't be loaded alone, it is restored in full. Returns whether it is loaded data-only.
	 */
	private async _restoreForMove(session: URI, refusal: AgentChatMoveRefusal, leases: DisposableStore, dataOnly: boolean): Promise<boolean> {
		const sessionKey = session.toString();
		try {
			while (true) {
				const held = this._sessionResidency.isHeldForMove(session);
				if (!held && this._stateManager.getSessionState(sessionKey)) {
					leases.add(this._pinForMove(sessionKey));
					return false;
				}
				if (dataOnly && !this._restoreSessionInFlight.has(sessionKey) && (held || await this._canLoadDataForMove(session))) {
					// Checked again after the reads above, right before holding it: only one kind of load runs for a session.
					if (this._restoreSessionInFlight.has(sessionKey) || (this._stateManager.getSessionState(sessionKey) && !this._sessionResidency.isHeldForMove(session))) {
						continue;
					}
					const hold = this._sessionResidency.holdForMove(session, () => this._loadSessionDataForMove(session));
					if (!hold) {
						// Being dropped after an earlier move.
						await this._sessionResidency.waitForRelease(session);
						continue;
					}
					leases.add(hold);
					try {
						await hold.loaded;
						return true;
					} catch (error) {
						leases.delete(hold);
						if (!(error instanceof SessionDataUnavailableError)) {
							throw error;
						}
						this._logService.info(`[AgentService] ${error.message}; restoring it in full`);
						dataOnly = false;
						continue;
					}
				}
				// Pinned before it loads: a restore releases sessions over the residency limit as it ends, which mustn't be this one.
				leases.add(this._pinForMove(sessionKey));
				await this.restoreSession(session);
				return false;
			}
		} catch (error) {
			if (error instanceof AgentChatMoveRefusedError) {
				throw error;
			}
			throw new AgentChatMoveRefusedError(refusal, `Session ${sessionKey} can't be opened: ${toErrorMessage(error)}`);
		}
	}

	/** Keeps a loaded session a move uses resident until the move ends: releasing it meanwhile would refuse the move. */
	private _pinForMove(session: string): IDisposable {
		this._movePinnedSessions.set(session, (this._movePinnedSessions.get(session) ?? 0) + 1);
		return toDisposable(() => {
			const remaining = (this._movePinnedSessions.get(session) ?? 1) - 1;
			if (remaining > 0) {
				this._movePinnedSessions.set(session, remaining);
			} else {
				this._movePinnedSessions.delete(session);
				void this._sessionResidency.reconcile();
			}
		});
	}

	/**
	 * Whether a move can load `session` with its data only (C15): a registered session of the host whose chat list is
	 * normalized. Anything else (a legacy catalog, an external or unregistered session, one whose registration awaits its
	 * provider's migration) is restored in full, which knows how to adopt, migrate or refuse it.
	 */
	private async _canLoadDataForMove(session: URI): Promise<boolean> {
		const sessionKey = session.toString();
		if (this._orchestratorDatabase.toRuntimeSession(sessionKey) !== sessionKey) {
			return false;
		}
		const registration = await this._sessionRegistry.get(session, entry => this._migrateRegisteredSession(entry));
		if (!registration || registration.external) {
			return false;
		}
		const unresolvedRegistration = await this._orchestratorDatabase.getSessionV2Registration(sessionKey);
		if (unresolvedRegistration && unresolvedRegistration.external === undefined) {
			return false;
		}
		const [catalog] = await this._orchestratorDatabase.readCatalogSnapshot([sessionKey]);
		return catalog?.authorityVersion === 2;
	}

	/** Loads the data of `session` for a move ({@link _restoreForMove}): what {@link _doRestoreSession} loads, short of starting its agent. */
	private async _loadSessionDataForMove(session: URI): Promise<void> {
		const sessionKey = session.toString();
		const load = (async () => {
			// A passive metadata update in progress finishes before this load reads the state it writes.
			await this._passiveMetadataSequencer.queue(sessionKey, async () => { });
			if (await this._sessionRegistry.isTombstoned(session)) {
				throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session was explicitly deleted: ${sessionKey}`);
			}
			if (await this._isWorkspaceConversionQuarantined(session)) {
				throw new AgentChatMoveRefusedError(AgentChatMoveRefusal.SessionQuarantined, `Session ${sessionKey} can't run turns until its workspace is fixed.`);
			}
			const registration = await this._sessionRegistry.get(session, entry => this._migrateRegisteredSession(entry));
			const agent = registration && this._providerService.getProvider(registration.provider);
			if (!registration || registration.external || !agent) {
				throw new SessionDataUnavailableError(sessionKey, 'it is not a registered session of an available agent');
			}
			this._providerService.associateSession(session, registration.provider);
			await this._restoreSessionState(agent, session, sessionKey, { kind: 'dataForMove', registration }, false, false, registration.source, async () => false, true, undefined, undefined);
		})();
		this._chatOwnership.trackRestore(load);
		await load;
	}

	/**
	 * Applies a `move_session` move through {@link _moveChat}, the operation AHP `moveChat` and `vscode/moveSession`
	 * run on, so it is validated like them, and in one step of the same sequencer: placing a chat at the end reads,
	 * and may load, its destination in that step, so no other move runs between that and the move. The sessions it
	 * loads are held in the move's `leases`, so the move uses them as loaded and they are dropped when it ends (C15).
	 */
	private _applyServerToolMove(move: ISessionServerToolMove): Promise<URI> {
		return this._chatMoveSequencer.queue(() => this._withMoveLeases(async leases => {
			if (move.kind === 'session') {
				const chat = await this._movedSessionChat(move.session, leases);
				return this._moveChat(move.session, chat, { kind: 'session', session: move.destination, after: await this._resolveServerToolMoveAnchor(move.session, move.destination, move.after, chat, leases) }, true, leases);
			}
			const destination = move.destination;
			if (destination.kind === 'newSession') {
				return this._moveChat(move.session, move.chat, destination, false, leases);
			}
			return this._moveChat(move.session, move.chat, { kind: 'session', session: destination.session, after: await this._resolveServerToolMoveAnchor(move.session, destination.session, destination.after, move.chat, leases) }, false, leases);
		}));
	}

	/** Logs why the host refused a `move_session` move: the agent gets only the refusal's actionable sentence. */
	private async _logRefusedServerToolMove<T>(move: Promise<T>): Promise<T> {
		try {
			return await move;
		} catch (error) {
			if (error instanceof AgentChatMoveRefusedError) {
				this._logService.info(`[AgentService] move_session refused (${error.reason}): ${error.message}`);
			}
			throw error;
		}
	}

	/**
	 * The chat a moved chat is placed after: the given one, or for `end` the destination's last visible chat other than
	 * the moved one. To read that, it loads the destination as the move then does, held in the move's `leases` (C15): its
	 * data only when the source's is too, which it loads first for that. The move uses both as loaded.
	 */
	private async _resolveServerToolMoveAnchor(source: URI, session: URI, after: SessionServerToolMoveAnchor, moved: URI | undefined, leases: DisposableStore): Promise<URI | undefined> {
		if (after !== 'end') {
			return after;
		}
		const sessionKey = session.toString();
		try {
			this._assertChatMovesEnabled();
			const sourceDataOnly = await this._restoreForMove(source, AgentChatMoveRefusal.SessionNotReady, leases, true);
			await this._restoreForMove(session, AgentChatMoveRefusal.DestinationNotFound, leases, sourceDataOnly);
		} catch (error) {
			// The move refuses a source or destination it can't load, with its own reason.
			this._logService.trace(`[AgentService] Can't load ${sessionKey} to place a moved chat at its end: ${toErrorMessage(error)}`);
			return undefined;
		}
		const last = this._stateManager.getSessionState(sessionKey)?.chats
			.filter(candidate => candidate.origin?.kind !== ChatOriginKind.Tool && candidate.interactivity !== ChatInteractivity.Hidden && candidate.resource !== moved?.toString())
			.at(-1);
		return last && URI.parse(last.resource);
	}

	/**
	 * Refuses a `move_session` move the host would refuse now, without changing anything. It runs the same checks as
	 * {@link _moveChat} and {@link _promoteChat} ({@link _checkChatMoveRequest}, {@link _checkPromotable} and
	 * {@link _validateChatMoveInputs}), short of preparing catalogs and committing. A move of the calling chat runs them
	 * when it is requested, so its refusals reach its agent then; the move checks everything again when it is applied.
	 */
	private async _checkServerToolMove(move: ISessionServerToolMove, leases: DisposableStore): Promise<void> {
		const sessionMove = move.kind === 'session';
		const chat = move.kind === 'session' ? await this._movedSessionChat(move.session, leases) : move.chat;
		const requested = move.kind === 'session' ? { kind: 'session' as const, session: move.destination, after: move.after } : move.destination;
		// An anchor `move_session` places at the end is resolved when the move is applied; any anchor is valid until then.
		const destination: AgentChatMoveDestination = requested.kind === 'newSession'
			? requested
			: { kind: 'session', session: requested.session, after: requested.after === 'end' ? undefined : requested.after };
		const sourceKey = move.session.toString();
		const chatKey = chat.toString();
		const request = await this._checkChatMoveRequest(move.session, chatKey, destination, sessionMove, leases);
		if (request.kind === 'reorder') {
			return;
		}
		if (request.kind === 'promote') {
			await this._checkPromotable(chatKey);
		}
		const target = destination.kind === 'session' ? destination.session : undefined;
		const inputs = await this._readChatMoveInputs(move.session, chatKey, target);
		this._validateChatMoveInputs(sourceKey, target?.toString(), chatKey, inputs, destination.kind === 'session' ? destination.after?.toString() : undefined, sessionMove);
	}

	/**
	 * The checks every move, reorder, promotion and session move makes before it prepares any catalog, in this order.
	 * Shared by {@link _moveChat}, {@link _promoteChat} and the `move_session` pre-check ({@link _checkServerToolMove}),
	 * so they can't drift apart. Loads a source or destination that isn't loaded, held in `leases` (C15).
	 */
	private async _checkChatMoveRequest(session: URI, chat: string, destination: AgentChatMoveDestination, sessionMove: boolean, leases: DisposableStore): Promise<IChatMoveRequest> {
		const refuse = (reason: AgentChatMoveRefusal, message: string): never => {
			throw new AgentChatMoveRefusedError(reason, message);
		};
		this._assertChatMovesEnabled();
		const sourceKey = session.toString();
		// A session the host hasn't loaded since it started: its chats aren't registered until it is loaded.
		const sourceDataOnly = await this._restoreForMove(session, AgentChatMoveRefusal.SessionNotReady, leases, true);
		if (destination.kind === 'newSession') {
			this._checkMovedChat(sourceKey, chat);
			const provider = this._providerService.getProviderForSession(session);
			if (!provider) {
				return refuse(AgentChatMoveRefusal.SessionNotReady, `Session ${sourceKey} has no agent.`);
			}
			return { kind: 'promote', provider };
		}
		if (sessionMove) {
			this._checkMovedSession(sourceKey, chat);
		} else {
			this._checkMovedChat(sourceKey, chat);
		}
		const after = destination.after?.toString();
		if (after === chat) {
			refuse(AgentChatMoveRefusal.InvalidAnchor, 'A chat can\'t be placed after itself.');
		}
		const target = destination.session;
		const targetKey = target.toString();
		if (targetKey === sourceKey) {
			if (sessionMove) {
				refuse(AgentChatMoveRefusal.DestinationNotFound, 'A session can\'t move under itself.');
			}
			this._checkReorderAnchor(sourceKey, after);
			return { kind: 'reorder', destination };
		}
		const listedTarget = this._stateManager.getSessionSummary(targetKey) ?? this._stateManager.getSurfacedSessionSummary(targetKey);
		if (listedTarget && isSessionStatusArchived(listedTarget.status)) {
			refuse(AgentChatMoveRefusal.SessionArchived, `Session ${targetKey} is archived.`);
		}
		// Its data only when the source's is too: a chat of a loaded source may be opened while it moves (C15b).
		await this._restoreForMove(target, AgentChatMoveRefusal.DestinationNotFound, leases, sourceDataOnly);
		return { kind: 'move', destination };
	}

	/**
	 * Refuses promoting a chat without a conversation of its own: one with no recorded backing, or whose first turn
	 * hasn't started. Like a brand-new session, a chat is durable as a session only once its conversation exists: no
	 * agent persists one before the chat's first turn starts, and a session whose default chat has none can't be restored.
	 */
	private async _checkPromotable(chat: string): Promise<void> {
		if ((await this._orchestratorDatabase.getChatV2ProviderDetail(chat))?.providerData === undefined) {
			// Without its own backing, a session's default chat names the session's conversation, which the new session has none of.
			throw new AgentChatMoveRefusedError(AgentChatMoveRefusal.Unsupported, `Chat ${chat} has no recorded conversation of its own to take into a new session.`);
		}
		const started = this._hasStartedTurn(await this._resolveChatForMove(chat));
		if (!started) {
			throw new AgentChatMoveRefusedError(AgentChatMoveRefusal.NotStarted, `Chat ${chat} has no turns yet; send a message before moving it to its own session.`);
		}
	}

	/** What a move validates against and plans its worktrees by, read before validating; `target` is `undefined` for a promotion. */
	private async _readChatMoveInputs(session: URI, chat: string, target: URI | undefined): Promise<IChatMoveInputs> {
		const sourceKey = session.toString();
		const moved = chatSubtree(this._stateManager, sourceKey, chat);
		const sourceSummary = this._stateManager.getSessionState(sourceKey)?.chats.find(candidate => candidate.resource === chat);
		const chatFolders = await this._movedChatFolders(session, chat);
		const subtreeFolders = await this._movedSubtreeFolders(sourceKey, chat, moved, chatFolders);
		await this._checkMovedFoldersExist(chat, subtreeFolders);
		const sourceWorktrees = await this._worktreeCoOwnership.readSessionWorktrees(session);
		const targetPrimaryWorktree = target ? await this._worktreeCoOwnership.readPrimaryWorktree(target) : undefined;
		return { moved, sourceSummary, chatFolders, subtreeFolders, sourceWorktrees, targetPrimaryWorktree };
	}

	/**
	 * Validates a move against the current state ({@link _validateChatMove}) and plans its worktrees; `target` is
	 * `undefined` for a promotion, whose new session has no older-build copy of its session values.
	 */
	private _validateChatMoveInputs(source: string, target: string | undefined, chat: string, inputs: IChatMoveInputs, after: string | undefined, sessionMove: boolean): IWorktreeMoveDecisions {
		this._validateChatMove(source, target, chat, inputs.moved, after, inputs.chatFolders, sessionMove);
		return this._planMoveWorktrees(source, chat, inputs.moved, inputs.subtreeFolders, inputs.sourceWorktrees, inputs.targetPrimaryWorktree, sessionMove, target !== undefined && this._hasOlderBuildSessionCopy(target));
	}

	/**
	 * Moves `chat` and its descendants out of `session`. With `sessionMove` (Block 4, VS Code-internal), `chat` is the
	 * session's default chat and only chat: it becomes a peer of the destination and the session ends.
	 */
	private async _moveChat(session: URI, chat: URI, destination: AgentChatMoveDestination, sessionMove: boolean, leases: DisposableStore): Promise<URI> {
		const refuse = (reason: AgentChatMoveRefusal, message: string): never => {
			throw new AgentChatMoveRefusedError(reason, message);
		};
		const sourceKey = session.toString();
		const chatKey = chat.toString();
		const request = await this._checkChatMoveRequest(session, chatKey, destination, sessionMove, leases);
		if (request.kind === 'promote') {
			return this._promoteChat(session, chat, request.provider);
		}
		const target = request.destination.session;
		const targetKey = target.toString();
		const after = request.destination.after?.toString();
		if (request.kind === 'reorder') {
			await this._reorderChat(session, chatKey, after);
			return session;
		}
		const checkMoved = () => sessionMove ? this._checkMovedSession(sourceKey, chatKey) : this._checkMovedChat(sourceKey, chatKey);
		await this._prepareCatalogsForMove([sourceKey, targetKey]);
		// Read before validating: the database refuses the move if either catalog changes after this point.
		const catalogs = new Map((await this._orchestratorDatabase.readCatalogSnapshot([sourceKey, targetKey])).map(entry => [entry.session, entry.header?.revision ?? 0]));
		if (!this._stateManager.getSessionState(sourceKey) || !this._stateManager.getSessionState(targetKey)) {
			return refuse(AgentChatMoveRefusal.DestinationNotFound, `Session ${this._stateManager.getSessionState(sourceKey) ? targetKey : sourceKey} is not available.`);
		}
		const inputs = await this._readChatMoveInputs(session, chatKey, target);
		const { moved, sourceSummary, chatFolders, targetPrimaryWorktree } = inputs;
		const validate = () => {
			checkMoved();
			return this._validateChatMoveInputs(sourceKey, targetKey, chatKey, inputs, after, sessionMove);
		};
		validate();
		const targetFolders = this._stateManager.getSessionSummary(targetKey)?.workingDirectories ?? [];
		const missingFolders = chatFolders.filter(folder => !targetFolders.some(existing => isEqual(URI.parse(existing), URI.parse(folder))));

		// Queued turns of the moved chats wait for the move, so they start in the target; both sessions stay resident.
		const admission = this._stateManager.holdChatAdmission(moved);
		// The folders the chat brings are in transit until the target lists it: archiving or deleting a target chat meanwhile doesn't detach them.
		// A folder the move prepares in the target is also reserved by its preparation; reservations are counted per holder, so each ends independently.
		const transit = this._reserveChatWorkingDirectories(target, chatFolders);
		this._chatMoveSessions.add(sourceKey);
		this._chatMoveSessions.add(targetKey);
		const credentialOwners = this._authService.holdSessionCredentialOwners([sourceKey, targetKey]);
		try {
			// The target gets the moved chat's folders before anything else changes; its other chats keep their own (PIN).
			const releases: (() => Promise<void>)[] = [];
			let restoreConfig: (() => Promise<void>) | undefined;
			let restoreScratchRow: (() => Promise<void>) | undefined;
			let committed: IMovedChats;
			let worktreePlan: IWorktreeMoveDecisions;
			const withholdings: IWorktreeWithholding[] = [];
			let handOver: IWorktreeHandOver | undefined;
			try {
				for (const folder of missingFolders) {
					const prepared = await this.prepareChatWorkingDirectory(target, URI.parse(folder), { isolation: 'folder' });
					releases.push(prepared.release);
				}
				if (missingFolders.length > 0) {
					// Adding the folders changed the target's catalog; the checks below cover the time since this read.
					const [targetCatalog] = await this._orchestratorDatabase.readCatalogSnapshot([targetKey]);
					catalogs.set(targetKey, targetCatalog?.header?.revision ?? 0);
				}
				// Re-validated after the awaits above, right before committing.
				const current = chatSubtree(this._stateManager, sourceKey, chatKey);
				if (current.length !== moved.length || current.some(candidate => !moved.includes(candidate))) {
					refuse(AgentChatMoveRefusal.Conflict, `Chat ${chatKey} changed while it was being moved; try again.`);
				}
				worktreePlan = validate();
				const plan = worktreePlan;
				// Before the commit, so no older build can remove a worktree once it is shared; undone if the move is refused.
				if (plan.withholdSource) {
					withholdings.push(await this._worktreeCoOwnership.withhold(session));
				}
				if (plan.withholdTarget) {
					withholdings.push(await this._worktreeCoOwnership.withhold(target));
				}
				if (plan.handOver) {
					handOver = await this._worktree.prepareWorktreeHandOver(session, AgentSession.id(session));
				}
				if (sessionMove) {
					// The ending session's own scratch folder becomes its chat's, so deleting the chat still removes it.
					const recorded = await this._recordMovedSessionScratchFolder(session, chatKey, chatFolders);
					if (recorded) {
						restoreScratchRow = recorded;
					}
				}
				const config = this._movedChatConfig(sourceKey, targetKey, chatKey);
				if (Object.keys(config).length > 0) {
					// Persisted before the commit, in the chat's own database: its values in the source don't change by it, and
					// a crash after the commit keeps them. A refused move restores the chat's previous values.
					const previousConfig = this._stateManager.getChatConfig(chatKey)?.values ?? {};
					await this._sessionStateStore.chatRows.setChatConfig(session, chat, { ...previousConfig, ...config });
					restoreConfig = () => this._sessionStateStore.chatRows.setChatConfig(session, chat, previousConfig);
				}
				// Read when committing, so a retry after importing older-build edits sees the chats and folders they added.
				const commit = async () => {
					const sourceFolders = this._stateManager.getSessionSummary(sourceKey)?.workingDirectories ?? [];
					const inheritedFolders = this._sessionFoldersOfChatWithoutOwn(sourceKey);
					const folders = {
						source: sourceFolders,
						target: this._stateManager.getSessionSummary(targetKey)?.workingDirectories ?? targetFolders,
						chat: chatFolders,
						chatHadOwnFolders: sourceSummary?.workingDirectories !== undefined,
						remaining: sessionMove ? [] : (this._stateManager.getSessionState(sourceKey)?.chats ?? [])
							.filter(candidate => !moved.includes(candidate.resource) && candidate.origin?.kind !== ChatOriginKind.Tool)
							.map(candidate => candidate.workingDirectories ?? inheritedFolders),
					};
					const move = {
						source: session,
						target,
						chat,
						after: after === undefined ? undefined : URI.parse(after),
						expectedSourceCatalogRevision: catalogs.get(sourceKey) ?? 0,
						expectedTargetCatalogRevision: catalogs.get(targetKey) ?? 0,
						folders,
						coOwnedWorktrees: plan.coOwned,
						worktreeLists: this._movedWorktreeLists(chatKey, plan, handOver, sessionMove, targetPrimaryWorktree),
					};
					return sessionMove ? this._sessionStateStore.moveSession(move) : this._sessionStateStore.moveChat(move);
				};
				let result = await commit();
				if (result.status === 'olderBuildEdits') {
					// An older build edited either chat list since the move read it: import its edits, then try once more.
					await this._prepareCatalogsForMove([sourceKey, targetKey]);
					for (const entry of await this._orchestratorDatabase.readCatalogSnapshot([sourceKey, targetKey])) {
						catalogs.set(entry.session, entry.header?.revision ?? 0);
					}
					const imported = chatSubtree(this._stateManager, sourceKey, chatKey);
					if (imported.length !== moved.length || imported.some(candidate => !moved.includes(candidate))) {
						refuse(AgentChatMoveRefusal.Conflict, `Chat ${chatKey} changed while it was being moved; try again.`);
					}
					this._checkWorktreePlan(chatKey, validate(), plan);
					result = await commit();
				}
				if (result.status !== 'applied') {
					return refuse(this._moveRefusalOf(result.status), `Chat ${chatKey} couldn't be moved (${result.status}); try again.`);
				}
				committed = { ...result, config };
				// Committed: the co-owner rows keep the branches withheld from now on.
				withholdings.forEach(withholding => withholding.done());
			} catch (error) {
				await restoreConfig?.().catch(restoreError => this._logService.warn(`[AgentService] Failed to restore the config of ${chatKey} after a refused move`, restoreError));
				await restoreScratchRow?.().catch(restoreError => this._logService.warn(`[AgentService] Failed to undo the scratch folder record of ${chatKey} after a refused move`, restoreError));
				await this._undoWorktreeMovePreparation(withholdings, handOver, chatKey);
				// A pinned target chat keeps the target's folders as its own; the release removes only a folder no chat uses.
				// The chat isn't coming, so its folders are no longer in transit.
				transit.dispose();
				for (const release of releases.reverse()) {
					await release().catch(releaseError => this._logService.warn(`[AgentService] Failed to undo a folder a chat move added to ${targetKey}`, releaseError));
				}
				if (error instanceof SessionStateDeletedError) {
					refuse(AgentChatMoveRefusal.SessionNotReady, error.message);
				}
				throw error;
			}

			// Committed: the move is reported as done whatever happens to memory below; the database is authoritative.
			// The target lists a handed-over worktree now, so reconciliation may see its record.
			handOver?.dispose();
			try {
				this._transferMovedChats(sourceKey, targetKey, chatKey, committed, after, sourceSummary?.workingDirectories === undefined ? chatFolders : undefined, sessionMove);
			} catch (error) {
				this._logService.error(error, `[AgentService] Chat ${chatKey} moved to ${targetKey}, but its in-memory move failed; it shows up after the sessions reload`);
				await this._reloadAfterFailedMove([sourceKey, targetKey]);
			}
			await this._completeMovedWorktrees(session, target, worktreePlan, handOver, sessionMove);
			// The target lists the chat now, so the folders prepared for it are in use rather than reserved.
			this._consumePreparedChatWorkingDirectories(target, chatFolders);
			if (!sessionMove) {
				await this._detachMovedChatWorkingDirectories(session, chatKey, chatFolders);
			}
			// The folder sets are final: publish which of them are scratch folders, or clients show them as the chat's own workspace.
			for (const key of sessionMove ? [targetKey] : [sourceKey, targetKey]) {
				this._publishWorkingDirectoryIdentities(key);
			}
			// Its pre-move attachments are copied into its own storage in the background (Block 4b).
			this._attachmentMigration.schedule(committed.moved);
			// Older builds see the chats where they are now (Block 4a); a session that ended has no copy to publish.
			for (const key of sessionMove ? [targetKey] : [sourceKey, targetKey]) {
				this._peerChatStore.scheduleOlderBuildCopyPublish(URI.parse(key));
			}
			// MCP entries a moved runtime published under its source, and the chat's folder customizations, follow it (C6). A
			// session loaded for a move only has no runtime: it computes its customizations when it is opened (C15).
			for (const key of [sourceKey, targetKey]) {
				if (!this._stateManager.isDataOnlySession(key)) {
					this._sideEffects.republishSessionCustomizations(key);
				}
			}
			this._invalidateSessionList();
			return target;
		} finally {
			transit.dispose();
			this._chatMoveSessions.delete(sourceKey);
			this._chatMoveSessions.delete(targetKey);
			credentialOwners.dispose();
			admission.dispose();
		}
	}

	/**
	 * Records the primary scratch folder of a workspace-less session that is moving under another session as an owned
	 * folder of its default chat (the session ends, so nothing else would remove it). Only host-allocated folders
	 * under the chats root are recorded; a provider-managed folder (Codex) stays with the provider. Returns how to undo
	 * a newly written row, or `undefined` when nothing was written.
	 */
	private async _recordMovedSessionScratchFolder(session: URI, chat: string, chatFolders: readonly string[]): Promise<(() => Promise<void>) | undefined> {
		const folder = chatFolders[0];
		const provider = this._providerService.getProviderForSession(session);
		if (folder === undefined || !provider || !readSessionWorkspaceless(this._stateManager.getSessionState(session.toString())?._meta)
			|| !isEqualOrParent(URI.parse(folder), workspacelessChatsRoot(this._environmentService.userHome))
			|| await this._orchestratorDatabase.hasScratchFolder(folder)) {
			return undefined;
		}
		await this._orchestratorDatabase.insertScratchFolder({ folder, chatUri: chat, provider: provider.id, requestedAt: Date.now() });
		await this._orchestratorDatabase.markScratchFolderOwned(folder);
		this._stateManager.setScratchFolder(folder, true);
		return async () => {
			await this._orchestratorDatabase.deleteScratchFolder(folder);
			this._stateManager.setScratchFolder(folder, false);
		};
	}

	/**
	 * Moves the committed chats in memory, synchronously: nothing runs between them leaving the source and joining
	 * the target. Memory follows the database's placement; an anchor no longer in memory is replaced by the nearest
	 * chat before the moved one that is.
	 */
	private _transferMovedChats(source: string, target: string, chat: string, committed: IMovedChats, after: string | undefined, inheritedFolders: readonly string[] | undefined, sessionMove: boolean): void {
		const inMemory = committed.moved.filter(candidate => this._chatOwnership.getChatOwner(candidate) === source && this._stateManager.isChatRegistered(candidate));
		const targetChats = new Set(this._stateManager.getSessionState(target)?.chats.map(candidate => candidate.resource));
		let anchor = after;
		if (anchor !== undefined && !targetChats.has(anchor)) {
			const preceding = committed.targetOrder.slice(0, Math.max(0, committed.targetOrder.indexOf(chat)));
			anchor = preceding.reverse().find(candidate => targetChats.has(candidate));
		}
		if (sessionMove) {
			// The session ends with the move: its applied sandbox states are read first.
			const sandboxStates = inMemory.map(candidate => [candidate, readChatSandboxState(this._stateManager.getSessionState(source), candidate)] as const);
			// No longer its session's default chat, the chat joins the target as the peer it now is: announced movable, never as a transient non-movable chat.
			this._stateManager.transferSession(source, target, inMemory, anchor, this._chatMovability.isMovableIn(chat, target) ?? false);
			for (const [candidate, applied] of sandboxStates) {
				if (applied) {
					this._configurationService.setChatSandboxEnabled({ session: target, chat: candidate }, applied.enabled, applied.error);
				}
			}
		} else {
			this._stateManager.transferChats(source, target, inMemory, anchor);
			this._transferChatSandboxStates(source, target, inMemory);
		}
		if (inheritedFolders !== undefined && inMemory.includes(chat)) {
			// The chat inherited the source's folders; it keeps exactly those in the target.
			// A chat not opened yet takes them with its summary, which its state starts from when it is opened (C15).
			if (this._stateManager.getChatState(chat)) {
				for (const folder of inheritedFolders) {
					this._stateManager.dispatchServerAction(chat, { type: ActionType.ChatWorkingDirectorySet, directory: folder });
				}
			}
			this._stateManager.dispatchServerAction(target, { type: ActionType.SessionChatUpdated, chat, changes: { workingDirectories: [...inheritedFolders] } });
		}
		if (Object.keys(committed.config).length > 0 && inMemory.includes(chat)) {
			// The chat keeps working as it did: its source's values become its own (3b); its subagents inherit them.
			this._stateManager.dispatchServerAction(chat, { type: ActionType.ChatConfigChanged, config: committed.config });
		}
	}

	/**
	 * The values a moved chat takes along: its effective value in the source for every property it may set for
	 * itself in the target. Host-owned (read-only) values are recomputed by the target.
	 */
	private _movedChatConfig(source: string, target: string, chat: string): Record<string, unknown> {
		const schema = this._stateManager.getSessionState(target)?.config?.schema;
		const effective = this._configurationService.getChatConfigValues({ session: source, chat }) ?? {};
		return Object.fromEntries(Object.entries(filterChatConfigValues(schema, effective)).filter(([key]) => schema?.properties[key]?.readOnly !== true));
	}

	/**
	 * Prepares the sessions a move, promotion or reorder re-projects, as 4a's contract for two-session writes asks
	 * (agentHostChatCatalogV2.md): waits for their in-flight peer-store writes, converts a legacy chat catalog to
	 * normalized authority, and brings each older-build copy in sync (imports what older builds changed, publishes the
	 * pending copy). Runs before the write reads the revisions it validates against.
	 */
	private async _prepareCatalogsForMove(sessions: readonly string[]): Promise<void> {
		await this._peerChatStore.whenSessionsIdle(sessions.map(session => URI.parse(session)));
		for (const session of sessions) {
			await this._normalizeCatalogForMove(session);
			try {
				await this._peerChatStore.reconcileOlderBuildCopy(URI.parse(session));
			} catch (error) {
				this._logService.warn(`[AgentService] Failed to import older-build chat edits of ${session} before moving chats`, error);
				throw new AgentChatMoveRefusedError(AgentChatMoveRefusal.Conflict, `The chat list of ${session} kept changing; try again.`);
			}
		}
	}

	/** The refusal a move, promotion or reorder the database didn't apply reports. */
	private _moveRefusalOf(status: 'conflict' | 'notReady' | 'notImported' | 'missingSession' | 'tombstoned' | 'olderBuildEdits' | 'alreadyNormalized' | 'cancelled'): AgentChatMoveRefusal {
		switch (status) {
			// A catalog that is no longer normalized after it was prepared: preparing it again may convert it.
			case 'notReady': return AgentChatMoveRefusal.SessionNotReady;
			case 'tombstoned': return AgentChatMoveRefusal.SessionNotReady;
			// Older-build edits refused twice, or any other concurrent change: the move can be retried.
			default: return AgentChatMoveRefusal.Conflict;
		}
	}

	/**
	 * Converts a legacy (authority-1) chat catalog to normalized authority (Block 4a), so its chats can move. A session
	 * that is legacy only because it is new (its default chat materialized after it was created, or its aggregate
	 * awaits a re-projection the background reconciliation hasn't run yet) is converted now: as 4a does on restore, its
	 * aggregate is staged from its live state, which is authoritative while it is loaded, and then converted. A session
	 * whose reconciliation is parked (its provider can't vouch for it) is refused as `legacyCatalog`; one that still
	 * can't be converted is refused as not ready. A normalized catalog costs one snapshot read.
	 *
	 * The session's own activity writes its state concurrently: after a turn, its read state, changes summary or source
	 * control state. Such a write marks its aggregate dirty without the catalog-sync queue the conversion holds, so it can
	 * land between staging the aggregate and converting it, which 4a then refuses as awaiting a re-projection. Staged
	 * again from live state, which includes that write, the conversion is tried {@link CHAT_MOVE_CONVERSION_ATTEMPTS} times.
	 */
	private async _normalizeCatalogForMove(session: string): Promise<void> {
		const isNormalized = async () => (await this._orchestratorDatabase.readCatalogSnapshot([session]))[0]?.authorityVersion === 2;
		if (await isNormalized()) {
			return;
		}
		if (this._catalogReconciliationService.isParked(session)) {
			throw new AgentChatMoveRefusedError(AgentChatMoveRefusal.LegacyCatalog, `Session ${session} can't be prepared for moving chats: its chats can't be verified.`);
		}
		const resource = URI.parse(session);
		const result = await this._migrateChatCatalog(resource, CancellationToken.None);
		let why = result?.status === 'notReady' ? `${result.status}: ${result.reason}` : result?.status ?? 'not attempted';
		for (let attempt = 0; attempt < CHAT_MOVE_CONVERSION_ATTEMPTS && !await isNormalized() && this._stateManager.getSessionState(session) && !this._catalogReconciliationService.isParked(session); attempt++) {
			try {
				// Read before the conversion holds the session's peer store exclusively.
				const persisted = await this._peerChatStore.tryRead(resource);
				const staged = await this._migrateChatCatalog(resource, CancellationToken.None, undefined, async () => this._liveCatalogOverride(session, persisted));
				why = staged?.status === 'notReady' ? `${staged.status}: ${staged.reason}` : staged?.status ?? 'not attempted';
				// Only a concurrent write is worth staging again; any other reason stays until the session itself changes.
				if (staged?.status === 'notReady' && !staged.awaitsReprojection) {
					break;
				}
			} catch (error) {
				// Staging is superseded when a concurrent write marks the aggregate dirty while it is staged.
				why = toErrorMessage(error);
			}
		}
		if (!await isNormalized()) {
			throw this._catalogReconciliationService.isParked(session)
				? new AgentChatMoveRefusedError(AgentChatMoveRefusal.LegacyCatalog, `Session ${session} can't be prepared for moving chats: its chats can't be verified.`)
				: new AgentChatMoveRefusedError(AgentChatMoveRefusal.SessionNotReady, `Session ${session} can't be prepared for moving chats yet (${why}); try again.`);
		}
	}

	/**
	 * The chat catalog of a loaded session, from its live state, to stage its aggregate from (see
	 * {@link _normalizeCatalogForMove}). A peer's recorded origin and folders are those it was persisted with (a peer
	 * created without an origin is listed with the default one), which the conversion checks its own database against.
	 */
	private _liveCatalogOverride(session: string, persisted: readonly IPersistedPeerChat[] | undefined): { readonly chats: readonly ICatalogChat[]; readonly metadataFallbacks: Readonly<Record<string, string>> } | undefined {
		const state = this._stateManager.getSessionState(session);
		const defaultChat = this._defaultChat(session);
		if (!state || defaultChat === undefined) {
			return undefined;
		}
		const recorded = new Map(persisted?.map(entry => [entry.uri, entry]));
		const chats = this._catalogChatsFromState(state, defaultChat).map(chat => {
			const entry = recorded.get(chat.uri);
			return entry ? { ...chat, origin: entry.origin, workingDirectories: chat.workingDirectories ?? entry.workingDirectories } : chat;
		});
		return { chats, metadataFallbacks: {} };
	}

	/**
	 * Promotes a peer chat and its descendants into a new session of the same agent (AHP `moveChat` to a new session,
	 * Block 4): the chat becomes its default chat and keeps its runtime, which relaunches with the new session's
	 * configuration at its next turn (3c). The new session starts with the source's config and the chat's own values
	 * over it, the chat's folders and the folder state it carries. Runs once {@link _checkChatMoveRequest} accepted the
	 * request, with the source's agent it resolved as `provider`.
	 */
	private async _promoteChat(session: URI, chat: URI, provider: IAgent): Promise<URI> {
		const refuse = (reason: AgentChatMoveRefusal, message: string): never => {
			throw new AgentChatMoveRefusedError(reason, message);
		};
		const sourceKey = session.toString();
		const chatKey = chat.toString();
		await this._prepareCatalogsForMove([sourceKey]);
		await this._checkPromotable(chatKey);
		// Read before validating: the database refuses the promotion if the catalog changes after this point.
		const [catalog] = await this._orchestratorDatabase.readCatalogSnapshot([sourceKey]);
		let expectedSourceCatalogRevision = catalog?.header?.revision ?? 0;
		const inputs = await this._readChatMoveInputs(session, chatKey, undefined);
		const { moved, sourceSummary, chatFolders } = inputs;
		// A promoted chat's session has no older-build copy of its session values: its default chat keeps its own storage.
		const validate = () => this._validateChatMoveInputs(sourceKey, undefined, chatKey, inputs, undefined, false);
		// The new session is a worktree session when its primary folder is a worktree the promotion shares or transfers (Block 5).
		const promotedWorktreeFolders = withSessionWorktreeFolders(undefined, presentedWorktreeFolders(validate().presented, undefined));
		const promotedRepository = sessionWorktreeFolderRepositoryRoot(promotedWorktreeFolders ?? undefined, chatFolders[0]);
		const carried = await this._sessionStateStore.readWithoutImport(session, ['customizationEnablement', SESSION_INITIATOR_METADATA_KEY]);
		const target = await this._allocatePromotedSession(provider);
		const targetKey = target.toString();
		// A chat working in a recorded scratch folder stays workspace-less (a quick chat) as a session of its own; a chat with a folder doesn't.
		const promotedWorkspaceless = chatFolders[0] !== undefined && this._stateManager.isScratchFolder(chatFolders[0]);

		const admission = this._stateManager.holdChatAdmission(moved);
		this._chatMoveSessions.add(sourceKey);
		const credentialOwners = this._authService.holdSessionCredentialOwners([sourceKey, targetKey]);
		try {
			let committed: readonly string[];
			let worktreePlan: IWorktreeMoveDecisions;
			const withholdings: IWorktreeWithholding[] = [];
			const sourceConfig = this._stateManager.getSessionState(sourceKey)?.config;
			// The chat's own values become the new session's: its future chats start from them.
			const config: SessionConfigState | undefined = sourceConfig && { schema: sourceConfig.schema, values: { ...sourceConfig.values, ...this._movedChatConfig(sourceKey, sourceKey, chatKey), ...this._promotedIsolationConfig(sourceConfig, session, chatKey, promotedRepository) } };
			try {
				this._checkMovedChat(sourceKey, chatKey);
				const current = chatSubtree(this._stateManager, sourceKey, chatKey);
				if (current.length !== moved.length || current.some(candidate => !moved.includes(candidate))) {
					refuse(AgentChatMoveRefusal.Conflict, `Chat ${chatKey} changed while it was being promoted; try again.`);
				}
				worktreePlan = validate();
				const plan = worktreePlan;
				if (!this._hasStartedTurn(this._stateManager.getChatState(chatKey))) {
					refuse(AgentChatMoveRefusal.Conflict, `Chat ${chatKey} changed while it was being promoted; try again.`);
				}
				// Before the commit, so no older build can remove a worktree once it is shared; undone if the promotion is refused.
				if (plan.withholdSource) {
					withholdings.push(await this._worktreeCoOwnership.withhold(session));
				}
				const sourceFolders = this._stateManager.getSessionSummary(sourceKey)?.workingDirectories ?? [];
				const values: Record<string, string> = { [SESSION_WORKING_DIRECTORIES_KEY]: JSON.stringify(chatFolders) };
				if (promotedWorkspaceless) {
					values[AH_META_WORKSPACELESS_DB_KEY] = 'true';
				}
				for (const [key, value] of carried) {
					values[key] = value;
				}
				// The new session inherits the chat's credential owner. It is written to the session's own database before the commit
				// creates the session, so a committed promotion always has it on disk (for older builds too) and a failed write
				// refuses the promotion with nothing changed; the orphan left by a failed commit belongs to no session (this path does not remove it; no session lists it).
				const credentialPrincipal = this._authService.getSessionCredentialPrincipal(sourceKey);
				if (credentialPrincipal) {
					try {
						// Straight to the session's own database: the state store would create central state for a session that doesn't exist yet.
						const reference = this._sessionDataService.openDatabase(target);
						try {
							await reference.object.setMetadataValues({ [SESSION_CREDENTIAL_PRINCIPAL_KEY]: JSON.stringify(credentialPrincipal) });
						} finally {
							reference.dispose();
						}
					} catch (error) {
						this._logService.error(error, `[AgentService] The credential owner of chat ${chatKey} couldn't be persisted for its new session`);
						refuse(AgentChatMoveRefusal.Conflict, `Chat ${chatKey} couldn't be promoted: its credential owner couldn't be saved; try again.`);
					}
				}
				if (config) {
					values.configValues = JSON.stringify(getPersistedSessionConfigValues(config.values, this._configurationService.getSessionSandboxEnabled(sourceKey), undefined));
				}
				const commit = async () => {
					const inheritedFolders = this._sessionFoldersOfChatWithoutOwn(sourceKey);
					return this._sessionStateStore.promoteChat({
						source: session,
						target,
						chat,
						provider: provider.id,
						startTime: Date.now(),
						expectedSourceCatalogRevision,
						values,
						folders: {
							source: sourceFolders,
							chat: chatFolders,
							chatHadOwnFolders: sourceSummary?.workingDirectories !== undefined,
							remaining: (this._stateManager.getSessionState(sourceKey)?.chats ?? [])
								.filter(candidate => !moved.includes(candidate.resource) && candidate.origin?.kind !== ChatOriginKind.Tool)
								.map(candidate => candidate.workingDirectories ?? inheritedFolders),
						},
						coOwnedWorktrees: plan.coOwned,
						worktreeLists: this._movedWorktreeLists(chatKey, plan, undefined, false, undefined),
					});
				};
				let result = await commit();
				if (result.status === 'olderBuildEdits') {
					// An older build edited the source's chat list since the promotion read it: import its edits, then try once more.
					await this._prepareCatalogsForMove([sourceKey]);
					const [refreshed] = await this._orchestratorDatabase.readCatalogSnapshot([sourceKey]);
					expectedSourceCatalogRevision = refreshed?.header?.revision ?? 0;
					const imported = chatSubtree(this._stateManager, sourceKey, chatKey);
					if (imported.length !== moved.length || imported.some(candidate => !moved.includes(candidate))) {
						refuse(AgentChatMoveRefusal.Conflict, `Chat ${chatKey} changed while it was being promoted; try again.`);
					}
					this._checkWorktreePlan(chatKey, validate(), plan);
					result = await commit();
				}
				if (result.status !== 'applied') {
					return refuse(this._moveRefusalOf(result.status), `Chat ${chatKey} couldn't be promoted (${result.status}); try again.`);
				}
				committed = result.moved;
				withholdings.forEach(withholding => withholding.done());
			} catch (error) {
				await this._undoWorktreeMovePreparation(withholdings, undefined, chatKey);
				if (error instanceof SessionStateDeletedError) {
					refuse(AgentChatMoveRefusal.SessionNotReady, error.message);
				}
				throw error;
			}

			// Committed: the promotion is reported as done whatever happens to memory below; the database is authoritative.
			// A rename not persisted yet is known in memory only, while the chat is still the source's.
			const renamed = this._sideEffects.isTitleRenamed(sourceKey, chatKey);
			try {
				const project = worktreeProjectFromRepositoryRoot(promotedRepository);
				this._promoteMovedChats(provider, sourceKey, targetKey, chatKey, committed, chatFolders, config, sourceSummary?.workingDirectories === undefined, promotedWorkspaceless, project && { uri: project.uri.toString(), displayName: project.displayName });
			} catch (error) {
				this._logService.error(error, `[AgentService] Chat ${chatKey} was promoted to ${targetKey}, but its in-memory move failed; it shows up after the sessions reload`);
				// Fail closed meanwhile: the chat's credentials resolve under the new session, never to the ambient token.
				this._authService.moveChatCredentials(chatKey, sourceKey, targetKey);
				await this._reloadAfterFailedMove([sourceKey, targetKey]);
			}
			await this._persistPromotedSessionTitle(target, chatKey, renamed);
			await this._completeMovedWorktrees(session, target, worktreePlan, undefined, false);
			// The new session is created with the chat's folders, so none were in transit; the source lets go of those no other chat uses.
			await this._detachMovedChatWorkingDirectories(session, chatKey, chatFolders);
			this._attachmentMigration.schedule(committed);
			for (const key of [sourceKey, targetKey]) {
				this._peerChatStore.scheduleOlderBuildCopyPublish(URI.parse(key));
			}
			// MCP entries a moved runtime published under its source, and the chat's folder customizations, follow it (C6). A
			// session loaded for a move only has no runtime: it computes its customizations when it is opened (C15).
			for (const key of [sourceKey, targetKey]) {
				if (!this._stateManager.isDataOnlySession(key)) {
					this._sideEffects.republishSessionCustomizations(key);
				}
			}
			this._invalidateSessionList();
			return target;
		} finally {
			this._chatMoveSessions.delete(sourceKey);
			credentialOwners.dispose();
			admission.dispose();
		}
	}

	/**
	 * Allocates the address of a promoted chat's new session. Deliberately native (`ahp-session:/<uuid>` on disk, no
	 * compatibility identity), unlike a session created for a client (#340980). Giving it one is preparing its storage
	 * here (`prepareSessionStorage`) before the promotion commits; the database translates the address either way.
	 */
	private _allocatePromotedSession(provider: IAgent): Promise<URI> {
		return this._mintSessionUri(provider, undefined);
	}

	/**
	 * Persists a promoted session's title, its chat's, with the chat's title source (user, agent or auto): restore, the
	 * session list and older builds read the session's own title, and would otherwise show the agent's summary (B4-1).
	 * Never fails the promotion.
	 */
	private async _persistPromotedSessionTitle(target: URI, chat: string, renamed: boolean): Promise<void> {
		const targetKey = target.toString();
		const title = this._stateManager.getSessionState(targetKey)?.title;
		if (!title) {
			return;
		}
		try {
			const [catalog] = await this._orchestratorDatabase.readCatalogSnapshot([targetKey]);
			const recorded = catalog?.chats.find(candidate => candidate.chat === chat)?.metadata?.titleSource;
			const titleSource = recorded === AGENT_HOST_TITLE_SOURCE_USER || recorded === AGENT_HOST_TITLE_SOURCE_AGENT
				? recorded
				: renamed ? AGENT_HOST_TITLE_SOURCE_USER : AGENT_HOST_TITLE_SOURCE_AUTO;
			if (this._stateManager.getSessionState(targetKey)?.title !== title) {
				// The new session was renamed meanwhile, which persisted its own title.
				return;
			}
			await this._persistOrderedListVisibleSessionState(target, {
				[SESSION_CUSTOM_TITLE_KEY]: title,
				[SESSION_CUSTOM_TITLE_SOURCE_KEY]: titleSource,
			});
		} catch (error) {
			this._logService.warn(`[AgentService] Failed to persist the title of promoted session ${targetKey}`, error);
		}
	}

	/** Creates the promoted chat's new session in memory and moves the committed chats into it, synchronously. */
	private _promoteMovedChats(provider: IAgent, source: string, target: string, chat: string, committed: readonly string[], chatFolders: readonly string[], config: SessionConfigState | undefined, inheritedFolders: boolean, workspaceless: boolean, project: ProjectInfo | undefined): void {
		const inMemory = committed.filter(candidate => this._chatOwnership.getChatOwner(candidate) === source && this._stateManager.isChatRegistered(candidate));
		if (inMemory[0] !== chat) {
			throw new Error(`Promoted chat ${chat} is not loaded`);
		}
		this._providerService.associateSession(target, provider.id);
		const chatSummary = this._stateManager.getSessionState(source)?.chats.find(candidate => candidate.resource === chat);
		const sourceSummary = this._stateManager.getSessionSummary(source);
		const now = new Date().toISOString();
		let meta = withSessionExternal(undefined, false);
		const initiator = readSessionInitiator(sourceSummary);
		if (initiator) {
			meta = withSessionInitiator(meta, initiator);
		}
		if (workspaceless) {
			meta = withSessionWorkspaceless(meta, true) ?? meta;
		}
		this._stateManager.promoteChats(source, {
			resource: target,
			provider: provider.id,
			title: chatSummary?.title || sourceSummary?.title || '',
			status: SessionStatus.Idle,
			createdAt: now,
			modifiedAt: now,
			workingDirectories: [...chatFolders],
			// A promoted worktree chat's session is a worktree session: it groups under the worktree's repository.
			...(project ? { project } : {}),
			_meta: withPublishedWorkingDirectoryIdentities(meta, chatFolders, undefined),
			defaultChat: chat,
		}, config, inMemory);
		this._transferChatSandboxStates(source, target, inMemory);
		if (inheritedFolders) {
			// The chat inherited the source's folders; as the new session's default chat it keeps exactly those.
			for (const folder of chatFolders) {
				this._stateManager.dispatchServerAction(chat, { type: ActionType.ChatWorkingDirectorySet, directory: folder });
			}
			this._stateManager.dispatchServerAction(target, { type: ActionType.SessionChatUpdated, chat, changes: { workingDirectories: [...chatFolders] } });
		}
		if (this._stateManager.getChatConfig(chat) !== undefined) {
			// Its own values are the new session's now, so the session's later changes reach it.
			this._stateManager.dispatchServerAction(chat, { type: ActionType.ChatConfigChanged, config: {}, replace: true });
		}
		this._sessionResidency.touch(URI.parse(target));
		this._changesetCoordinator.onSessionCreated(target);
		this._publishWorkingDirectoryIdentities(target);
		this._serverToolHost.advertise(target);
		this._queueCatalogSync(URI.parse(target), {});
		this._queueCatalogSync(URI.parse(source), {});
	}

	/** Drops the loaded state of sessions whose committed move memory could not follow, so it loads from the database on next use. */
	/** Drops the loaded state of `sessions` so they reload from the database, which a move committed to; never throws. */
	private async _reloadAfterFailedMove(sessions: readonly string[]): Promise<void> {
		const results = await Promise.allSettled(sessions.map(session => this._sessionStateStore.evict(URI.parse(session))));
		results.forEach((result, index) => {
			if (result.status === 'rejected') {
				this._logService.warn(`[AgentService] Failed to evict ${sessions[index]} after a failed move`, result.reason);
			}
		});
	}

	/** Moves the applied sandbox state of moved chats with them (Block 4); the default chat's is also the new session's. */
	private _transferChatSandboxStates(source: string, target: string, chats: readonly string[]): void {
		const sourceState = this._stateManager.getSessionState(source);
		let meta = sourceState?._meta;
		let changed = false;
		for (const chat of chats) {
			const applied = readChatSandboxState(sourceState, chat);
			if (applied) {
				this._configurationService.setChatSandboxEnabled({ session: target, chat }, applied.enabled, applied.error);
				meta = withChatSandboxState(meta, chat, undefined);
				changed = true;
			}
		}
		if (changed) {
			this._stateManager.setSessionMeta(source, meta);
		}
	}

	/** Refuses a session that is no longer one that can move under another session (Block 4): `chat` is its default and only chat. */
	/** Whether a chat has a turn in its history or one running. */
	private _hasStartedTurn(state: ChatState | undefined): boolean {
		return !!state && (state.turns.length > 0 || state.activeTurn !== undefined);
	}

	private _checkMovedSession(source: string, chat: string): void {
		if (this._chatOwnership.getChatOwner(chat) !== source || !this._stateManager.isChatRegistered(chat) || !this._stateManager.isDefaultChat(source, chat)) {
			throw new AgentChatMoveRefusedError(AgentChatMoveRefusal.NotMovable, `Session ${source} can't be moved.`);
		}
		const moved = chatSubtree(this._stateManager, source, chat);
		if (this._stateManager.getSessionState(source)?.chats.some(candidate => !moved.includes(candidate.resource))) {
			throw new AgentChatMoveRefusedError(AgentChatMoveRefusal.NotSingleChat, `Session ${source} has other chats.`);
		}
	}

	/** Refuses a chat that is no longer a movable chat of `source`. */
	private _checkMovedChat(source: string, chat: string): void {
		if (this._chatOwnership.getChatOwner(chat) !== source || !this._stateManager.isChatRegistered(chat)) {
			throw new AgentChatMoveRefusedError(AgentChatMoveRefusal.NotMovable, `Chat ${chat} is not a chat of ${source}.`);
		}
		// Checked now rather than read from `movable`, which also reflects the chat's state: a move refuses that with its own reason.
		if (!this._chatMovability.isStructurallyMovable(chat, source)) {
			throw new AgentChatMoveRefusedError(AgentChatMoveRefusal.NotMovable, `Chat ${chat} can't be moved.`);
		}
	}

	/** Resolves a chat a move reads, refusing as not ready when its backing can't be loaded (for example its working directory is gone). */
	private async _resolveChatForMove(chat: string): Promise<ChatState | undefined> {
		try {
			return await this._stateManager.resolveChatState(chat);
		} catch (error) {
			throw new AgentChatMoveRefusedError(AgentChatMoveRefusal.SessionNotReady, `Chat ${chat}'s history couldn't be read: ${toErrorMessage(error)}`);
		}
	}

	/**
	 * The folders a moved chat works in: its own, else its source's. Read without opening the chat (C15): what its
	 * state would start with is on its registration, as are its own config values.
	 */
	private async _movedChatFolders(source: URI, chat: string): Promise<readonly string[]> {
		const sourceKey = source.toString();
		const chatState = this._stateManager.getChatState(chat);
		return chatState?.workingDirectories
			?? this._stateManager.getSessionState(sourceKey)?.chats.find(candidate => candidate.resource === chat)?.workingDirectories
			?? this._sessionFoldersOfChatWithoutOwn(sourceKey);
	}

	/** The folders a chat without folders of its own works in (see {@link inheritedChatFolders}): never another chat's scratch folder. */
	private _sessionFoldersOfChatWithoutOwn(sessionKey: string): readonly string[] {
		return inheritedChatFolders(this._stateManager, this._stateManager.getSessionSummary(sessionKey)?.workingDirectories ?? [], readSessionWorkspaceless(this._stateManager.getSessionState(sessionKey)?._meta));
	}

	/**
	 * The folders a moved chat and its moved descendants work in: the chat's, and those a descendant set for itself (one
	 * without folders of its own follows its session's, the target's once it moves). What a move plans its worktrees by.
	 */
	private async _movedSubtreeFolders(sourceKey: string, chat: string, moved: readonly string[], chatFolders: readonly string[]): Promise<readonly string[]> {
		const folders = [...chatFolders];
		const summaries = this._stateManager.getSessionState(sourceKey)?.chats ?? [];
		for (const descendant of moved) {
			if (descendant === chat) {
				continue;
			}
			const own = this._stateManager.getChatState(descendant)?.workingDirectories ?? summaries.find(candidate => candidate.resource === descendant)?.workingDirectories ?? [];
			for (const folder of own) {
				if (!folders.some(existing => isEqual(URI.parse(existing), URI.parse(folder)))) {
					folders.push(folder);
				}
			}
		}
		return folders;
	}

	/**
	 * Refuses moving a chat a folder of which no longer exists on disk (for example a deleted worktree), before anything
	 * changes: the target would get a folder it can't work in. Opening the chat repairs a recorded worktree, after which
	 * it can move. A folder whose file system the host can't check isn't refused.
	 */
	private async _checkMovedFoldersExist(chat: string, folders: readonly string[]): Promise<void> {
		for (const folder of folders) {
			const resource = URI.parse(folder);
			// The root check is a guard so a recorded, host-owned folder is never treated as a user folder; it never derives an owner.
			// A host-allocated scratch folder is recreated by its provider when the chat next runs; a provider-managed one (Codex) can't be.
			if (this._stateManager.isScratchFolder(folder) && isEqualOrParent(resource, workspacelessChatsRoot(this._environmentService.userHome))) {
				continue;
			}
			if (this._fileService.hasProvider(resource) && !await this._fileService.exists(resource)) {
				throw new AgentChatMoveRefusedError(AgentChatMoveRefusal.SessionNotReady, `Chat ${chat}'s folder ${resource.scheme === Schemas.file ? resource.fsPath : folder} no longer exists; open the chat to repair it, then move it.`);
			}
		}
	}

	/**
	 * What a move does with the worktrees of its source (Block 5, {@link planWorktreeMove}); refuses a chat's own
	 * additional worktree that a chat staying in the source also uses (D2). Synchronous, from what was read before
	 * validating and the source's chats in memory, so a move runs it again right before committing.
	 */
	private _planMoveWorktrees(sourceKey: string, chat: string, moved: readonly string[], subtreeFolders: readonly string[], worktrees: ISessionWorktreeRecords, targetPrimary: string | undefined, sessionMove: boolean, targetHasOlderBuildCopy: boolean): IWorktreeMoveDecisions {
		const inheritedFolders = this._sessionFoldersOfChatWithoutOwn(sourceKey);
		const plan = planWorktreeMove({
			kind: sessionMove ? 'session' : 'chat',
			chat,
			moved,
			chatFolders: subtreeFolders,
			remainingFolders: (this._stateManager.getSessionState(sourceKey)?.chats ?? [])
				.filter(candidate => !moved.includes(candidate.resource) && candidate.origin?.kind !== ChatOriginKind.Tool)
				.map(candidate => candidate.workingDirectories ?? inheritedFolders),
			source: worktrees,
			targetPrimary,
			targetHasOlderBuildCopy,
		});
		if (plan.refused !== undefined) {
			throw new AgentChatMoveRefusedError(AgentChatMoveRefusal.WorktreeFolder, `Chat ${chat} works in its own worktree ${plan.refused}, which another chat of ${sourceKey} also uses.`);
		}
		return plan;
	}

	/**
	 * The isolation a promoted chat's new session reports (Block 5): `worktree`, with the chat's base branch, when its
	 * primary folder is a recorded worktree; `folder` otherwise. Only where the source's schema offers isolation.
	 */
	private _promotedIsolationConfig(sourceConfig: SessionConfigState, source: URI, chat: string, promotedRepository: string | undefined): Record<string, unknown> {
		const properties = sourceConfig.schema.properties;
		if (!properties?.[SessionConfigKey.Isolation]) {
			return {};
		}
		if (promotedRepository === undefined) {
			return { [SessionConfigKey.Isolation]: 'folder' };
		}
		const snapshot = this._sessionStateStore.peek(source);
		const baseBranch = snapshot && readSessionBaseBranch(snapshot, chat);
		return {
			[SessionConfigKey.Isolation]: 'worktree',
			...(baseBranch !== undefined && properties[SessionConfigKey.Branch] ? { [SessionConfigKey.Branch]: baseBranch } : {}),
		};
	}

	/**
	 * Whether older builds read `session`'s values from its database: its default chat stores there (Q8a). A promoted
	 * session's default chat keeps its own storage, so older builds get no copy of its session values.
	 */
	private _hasOlderBuildSessionCopy(session: string): boolean {
		const defaultChat = this._stateManager.getSessionState(session)?.defaultChat;
		const storage = defaultChat === undefined ? undefined : this._stateManager.getChatStorageResource(defaultChat);
		return storage === undefined || storage === session;
	}

	/** A move retried after importing older-build edits keeps the worktree decisions it prepared, or is refused. */
	private _checkWorktreePlan(chat: string, current: IWorktreeMoveDecisions, prepared: IWorktreeMoveDecisions): void {
		const key = (plan: IWorktreeMoveDecisions) => JSON.stringify([plan.transfers.map(transfer => transfer.handle), plan.coOwned.map(folder => folder.worktreePath), plan.presented.map(folder => folder.worktreePath), plan.withholdSource, plan.withholdTarget, plan.handOver]);
		if (key(current) !== key(prepared)) {
			throw new AgentChatMoveRefusedError(AgentChatMoveRefusal.Conflict, `Chat ${chat} changed while it was being moved; try again.`);
		}
	}

	/**
	 * The worktree list changes a move makes (Block 5): transferred records leave the source and join the target (with
	 * a handed-over worktree), and the target records the shared worktrees it presents. The store applies them to the
	 * lists as they are when it commits, never to a copy read before.
	 */
	private _movedWorktreeLists(chat: string, plan: IWorktreeMoveDecisions, handOver: IWorktreeHandOver | undefined, sessionMove: boolean, targetPrimary: string | undefined): ISessionStateWorktreeListChanges {
		return {
			// A session that ends by the move keeps none: its central state is tombstoned in the same transaction.
			fromSource: sessionMove ? [] : plan.transfers.map(transfer => transfer.handle),
			toTarget: [...plan.transfers, ...(handOver ? [{ handle: handOver.handle, workingDirectory: handOver.workingDirectory, repositoryRoot: handOver.repositoryRoot, chat }] : [])],
			targetFolders: presentedWorktreeFolders(plan.presented, targetPrimary),
		};
	}

	/** Undoes what a refused move prepared for its worktrees: older builds see a branch it withheld again, and a hand-over record is dropped. */
	private async _undoWorktreeMovePreparation(withholdings: readonly IWorktreeWithholding[], handOver: IWorktreeHandOver | undefined, chat: string): Promise<void> {
		for (const withholding of withholdings) {
			await withholding.undo().catch(error => this._logService.warn(`[AgentService] Failed to undo withholding a worktree branch after the refused move of ${chat}`, error));
		}
		if (handOver) {
			await this._worktree.deleteDetachedWorktreeRecord(handOver.handle).catch(error => this._logService.warn(`[AgentService] Failed to drop the hand-over record of a worktree after the refused move of ${chat}`, error));
			handOver.dispose();
		}
	}

	/** After a committed move: transferred worktree records name the target, in the order older builds rely on. Repaired at startup if this fails. */
	private async _completeMovedWorktrees(source: URI, target: URI, plan: IWorktreeMoveDecisions, handOver: IWorktreeHandOver | undefined, sessionMove: boolean): Promise<void> {
		try {
			await this._worktreeCoOwnership.completeTransfers(source, target, plan.transfers, handOver, sessionMove);
		} catch (error) {
			this._logService.error(error, `[AgentService] Moved worktree records of ${source.toString()} to ${target.toString()}, but couldn't hand them over; startup reconciliation repairs them`);
		}
	}

	/**
	 * Refuses a move the host does not support (Block 4 design, section 1.5). Synchronous, so a move runs it again
	 * right before committing; nothing has changed when it throws.
	 */
	private _validateChatMove(sourceKey: string, targetKey: string | undefined, chat: string, moved: readonly string[], after: string | undefined, chatFolders: readonly string[], sessionMove = false): void {
		const refuse = (reason: AgentChatMoveRefusal, message: string): never => {
			throw new AgentChatMoveRefusedError(reason, message);
		};
		const sourceState = this._stateManager.getSessionState(sourceKey);
		const targetState = targetKey === undefined ? undefined : this._stateManager.getSessionState(targetKey);
		if (!sourceState || (targetKey !== undefined && !targetState)) {
			return refuse(AgentChatMoveRefusal.DestinationNotFound, `Session ${sourceState ? targetKey : sourceKey} is not available.`);
		}
		if (after !== undefined) {
			const anchor = targetState?.chats.find(candidate => candidate.resource === after);
			if (!anchor || anchor.origin?.kind === ChatOriginKind.Tool || anchor.interactivity === ChatInteractivity.Hidden) {
				refuse(AgentChatMoveRefusal.InvalidAnchor, `Chat ${after} is not a visible chat of ${targetKey}.`);
			}
		}
		const source = URI.parse(sourceKey);
		const target = targetKey === undefined ? undefined : URI.parse(targetKey);
		if (target && this._providerService.getProviderForSession(source)?.id !== this._providerService.getProviderForSession(target)?.id) {
			refuse(AgentChatMoveRefusal.DifferentProvider, 'Chats can only move between sessions of the same agent.');
		}
		if (target && !this._authService.hasSameCredentialOwner(sourceKey, targetKey!)) {
			refuse(AgentChatMoveRefusal.DifferentCredentialOwner, 'Sessions with different credential owners can\'t be combined; pick a destination that uses the same account, or move it to its own session.');
		}
		const sessions = [[sourceKey, sourceState] as const, ...(targetKey !== undefined && targetState ? [[targetKey, targetState] as const] : [])];
		for (const [key, state] of sessions) {
			if (isSessionStatusArchived(state.status)) {
				refuse(AgentChatMoveRefusal.SessionArchived, `Session ${key} is archived.`);
			}
			// A chat moves out of a new session whose default chat hasn't run yet (created provisional, recorded as such):
			// the session stays as it was. A session that moves, or one a chat moves into, must be durable.
			const provisionalSource = key === sourceKey && !sessionMove && state.lifecycle === SessionLifecycle.Creating && this._provisionalSessionKeys.has(key);
			if ((state.lifecycle !== SessionLifecycle.Ready && !provisionalSource) || (this._stateManager.isIdleProvisionalSession(key) && !provisionalSource) || this._sessionResidency.isBeingDisposed(key)) {
				refuse(AgentChatMoveRefusal.SessionNotReady, `Session ${key} is not ready.`);
			}
			if (this._workspaceConversionService.isPending(key, true)) {
				refuse(AgentChatMoveRefusal.SessionQuarantined, `Session ${key} is changing its workspace or can't run turns.`);
			}
		}
		if (moved.some(candidate => this._workspaceConversionService.isPending(candidate))) {
			refuse(AgentChatMoveRefusal.ConversionInProgress, `Chat ${chat} is changing its workspace.`);
		}
		if (!chatFolders.length) {
			refuse(AgentChatMoveRefusal.Workspaceless, `Chat ${chat} has no folder.`);
		}
		if (!sessionMove && this._chatMovability.sharesScratchFolder(chat, sourceKey, chatFolders)) {
			refuse(AgentChatMoveRefusal.Workspaceless, `Chat ${chat} works in a scratch folder that another chat of ${sourceKey} also uses.`);
		}
		const sourceFolders = this._stateManager.getSessionSummary(sourceKey)?.workingDirectories ?? [];
		const sessionFolderKey = sourceFolders[0] === undefined ? undefined : getWorkingDirectoryKey(sourceFolders[0]);
		for (const folder of readAgentMergeFolderStates(sourceState.config?.values, sessionFolderKey).values()) {
			// A session that moves takes its own Agent Merge along: it stays.
			if (folder.enabled && ((folder.chat !== undefined && moved.includes(folder.chat)) || (sessionMove && folder.chat === undefined))) {
				refuse(AgentChatMoveRefusal.AgentMergeOwner, `Chat ${chat} runs Agent Merge for a folder of ${sourceKey}.`);
			}
		}
		if (target === undefined) {
			// A new session takes the chat's folders.
			if (chatFolders.length > 1 && !this._providerService.getProviderForSession(source)?.getDescriptor().capabilities?.multipleWorkingDirectories) {
				refuse(AgentChatMoveRefusal.DestinationSingleFolder, `A new session of ${sourceKey}'s agent can't take more than one folder.`);
			}
			return;
		}
		const targetFolders = this._stateManager.getSessionSummary(targetKey!)?.workingDirectories ?? [];
		const missing = chatFolders.some(folder => !targetFolders.some(existing => isEqual(URI.parse(existing), URI.parse(folder))));
		if (missing && !this._providerService.getProviderForSession(target)?.getDescriptor().capabilities?.multipleWorkingDirectories) {
			refuse(AgentChatMoveRefusal.DestinationSingleFolder, `Session ${targetKey} can't take another folder.`);
		}
	}

	/** Refuses placing a chat after `after` in `session` unless `after` is a visible chat of it (`undefined` places it first). */
	private _checkReorderAnchor(session: string, after: string | undefined): void {
		const state = this._stateManager.getSessionState(session);
		if (after !== undefined && !state?.chats.some(candidate => candidate.resource === after && candidate.origin?.kind !== ChatOriginKind.Tool && candidate.interactivity !== ChatInteractivity.Hidden)) {
			throw new AgentChatMoveRefusedError(AgentChatMoveRefusal.InvalidAnchor, `Chat ${after} is not a visible chat of ${session}.`);
		}
	}

	/** Places a chat after `after` (first when `undefined`) within its own session; {@link _checkChatMoveRequest} checked the anchor. */
	private async _reorderChat(session: URI, chat: string, after: string | undefined): Promise<void> {
		const sessionKey = session.toString();
		const checkAnchor = () => this._checkReorderAnchor(sessionKey, after);
		const reorder = async () => {
			await this._prepareCatalogsForMove([sessionKey]);
			// Importing older-build edits may have removed the anchor: an invalid anchor, not a conflict to retry.
			checkAnchor();
			const [snapshot] = await this._orchestratorDatabase.readCatalogSnapshot([sessionKey]);
			if (snapshot?.authorityVersion !== 2 || !snapshot.header) {
				throw new AgentChatMoveRefusedError(AgentChatMoveRefusal.SessionNotReady, `Session ${sessionKey} can't reorder its chats yet.`);
			}
			return this._orchestratorDatabase.reorderChatV2(sessionKey, chat, after, snapshot.header.revision);
		};
		let result = await reorder();
		if (result.status === 'olderBuildEdits') {
			// An older build edited the chat list since it was read: preparing again imports its edits; then once more.
			result = await reorder();
		}
		if (result.status !== 'applied' && result.status !== 'replayed') {
			throw new AgentChatMoveRefusedError(this._moveRefusalOf(result.status), `Chat ${chat} couldn't be reordered (${result.status}); try again.`);
		}
		if (result.status === 'applied') {
			this._peerChatStore.scheduleOlderBuildCopyPublish(session);
		}
		const order = (this._stateManager.getSessionState(sessionKey)?.chats ?? []).map(candidate => candidate.resource).filter(candidate => candidate !== chat);
		order.splice(after === undefined ? 0 : order.indexOf(after) + 1, 0, chat);
		this._stateManager.dispatchServerAction(sessionKey, { type: ActionType.SessionChatsReordered, chats: order });
	}

	/** A peer chat's recorded storage, that of the session's other chats, which its deletion keeps, and the sessions it and its descendants moved out of. */
	private async _peerChatStorageForDeletion(session: URI, chat: URI): Promise<IPeerChatDeletionStorage> {
		const sessionKey = session.toString();
		const [catalog] = await this._orchestratorDatabase.readCatalogSnapshot([sessionKey]);
		const defaultChat = this._resolveDefaultChat(session, catalog, undefined);
		const { storage } = await this._readChatsForDeletion(session, catalog, defaultChat, this._stateManager.getSessionState(sessionKey)?.chats.map(entry => entry.resource) ?? []);
		const chatKey = chat.toString();
		// The chat's private descendants (its subagents) are removed with it, so their storage goes too.
		const removed = new Set([chatKey]);
		for (let expanded = true; expanded;) {
			expanded = false;
			for (const row of catalog?.authorityVersion === 2 ? catalog.chats : []) {
				if (row.order === undefined && row.parentChat !== undefined && removed.has(row.parentChat) && !removed.has(row.chat)) {
					removed.add(row.chat);
					expanded = true;
				}
			}
		}
		removed.delete(chatKey);
		return {
			chat: storage.get(chatKey) ?? this._chatStorageResource(session, chat),
			descendants: [...removed].map(descendant => ({ chat: URI.parse(descendant), storage: storage.get(descendant) ?? this._chatStorageResource(session, URI.parse(descendant)) })),
			others: [...storage].filter(([other]) => other !== chatKey && !removed.has(other)).map(([, resource]) => resource),
			movedFrom: await this._movedChatOriginsOf([chatKey, ...removed]),
		};
	}

	/** Deletes a peer chat's central rows, its row copies in the session database and its storage, with its private descendants'. */
	private async _deletePeerChatData(session: URI, chat: URI, storage: IPeerChatDeletionStorage): Promise<void> {
		await this._sessionStateStore.deleteChat(session, chat);
		this._stateManager.forgetMovedChatOrigins([chat.toString(), ...storage.descendants.map(descendant => descendant.chat.toString())]);
		await this._deleteChatStorage(session, [{ chat, storage: storage.chat }, ...storage.descendants], storage.others);
		await this._releaseOriginAttachments(storage.movedFrom);
		// Deleting the chat marked its scratch folders for removal.
		this._worktreeCleanup.schedule();
	}

	/**
	 * The sessions that the chats among `chats` that moved were created in (Block 4), as recorded (`chats_v2.origin_session_uri`,
	 * loaded at startup and kept on move). Read before the chats are deleted.
	 */
	private async _movedChatOriginsOf(chats: Iterable<string>): Promise<readonly string[]> {
		await this._whenMovedChatOriginsLoaded();
		const origins = new Set<string>();
		for (const chat of chats) {
			const origin = this._stateManager.getMovedChatOrigin(chat);
			if (origin !== undefined) {
				origins.add(origin);
			}
		}
		return [...origins];
	}

	/**
	 * Whether a live chat that moved out of `session` may still read the attachments it took there (Block 4): the chats a
	 * deleted session keeps its attachments for. Read from the central catalog; when it can't be read, they are kept.
	 */
	private async _isAttachmentOrigin(session: string): Promise<boolean> {
		try {
			await this._whenMovedChatOriginsLoaded();
			if (this._stateManager.movedChatOriginsKnown && !this._stateManager.hasChatsMovedOutOf(session)) {
				// Every moved chat's origin is known in memory, and none is this session: nothing to read.
				return false;
			}
			return RELEASE_COPIED_ATTACHMENT_ORIGINS
				// A chat whose attachments copy is complete reads them from its own storage (Block 4b).
				? (await this._orchestratorDatabase.listAttachmentOriginsV2()).has(session)
				: [...(await this._orchestratorDatabase.listMovedChatsV2()).values()].includes(session);
		} catch (error) {
			this._logService.warn(`[AgentService] Keeping the attachments of ${session}: can't read which chats moved out of it`, error);
			return true;
		}
	}

	/** Deletes the attachments that deleted sessions among `origins` kept for chats that moved out of them, once no live chat did (Block 4). */
	private async _releaseOriginAttachments(origins: readonly string[]): Promise<void> {
		for (const origin of origins) {
			try {
				const session = URI.parse(origin);
				if (await this._sessionRegistry.isTombstoned(session) && !await this._isAttachmentOrigin(origin)) {
					await this._sessionDataService.deleteSessionData(session);
				}
			} catch (error) {
				this._logService.warn(`[AgentService] Failed to delete the attachments ${origin} kept for the chats that moved out of it`, error);
			}
		}
	}

	private _schedulePeerChatCleanupRepair(session: URI, chat: URI, storage: IPeerChatDeletionStorage): void {
		const chatKey = chat.toString();
		this._peerChatCleanupRepairs.set(chatKey, disposableTimeout(() => {
			this._peerChatCleanupRepairs.deleteAndDispose(chatKey);
			void (async () => {
				try {
					await this._clearChatDraft(session, chat);
					await this._deletePeerChatData(session, chat, storage);
					await this._deletePeerChatSummaryKeys(session, chatKey);
					const state = this._stateManager.getSessionState(session.toString());
					if (state) {
						await this._persistOrderedListVisibleSessionState(
							session,
							{},
							this._catalogChatsFromState(state, this._requireDefaultChat(session)).filter(candidate => candidate.uri !== chatKey),
						);
					}
				} catch (error) {
					this._logService.warn(`[AgentService] Failed to repair ancillary state for removed chat ${chatKey}`, error);
				}
			})();
		}, 1000));
	}

	// ---- Chat dispatch adapter ---------------------------------------------
	//
	// The orchestrator owns the feature-level `(session, chat)` →
	// `(agent, session, chat)` mapping. It dispatches against an agent's
	// chat-addressed surface ({@link IAgent.chats}) and session lifecycle
	// ({@link IAgent.createSession}/{@link IAgent.disposeSession}).

	/** Whether `provider` can host additional (peer) chats. */
	private _supportsChats(provider: IAgent): boolean {
		// Gate additional chats on the advertised `multipleChats` capability,
		// not merely on the presence of a `chats` surface.
		return !!provider.getDescriptor().capabilities?.multipleChats;
	}

	private _chatContext(session: URI, chat: URI, storageResource: string): IAgentChatContext {
		return createAgentChatContext(this._stateManager, this._authService, session, chat, storageResource, this._sessionStateStore.peek(session));
	}

	private _getServerToolCredentialSource(chat: URI): IAgentHostCredentialSource | undefined {
		const source = this._authService.getSessionCredentialSource(chat.toString());
		if (source) {
			return source;
		}
		const owner = this._chatOwnership.getChatOwner(chat.toString());
		if ((!owner && !this._stateManager.getSessionState(chat.toString()))
			|| (owner !== undefined && this._authService.getSessionCredentialPrincipal(owner))) {
			throw new ProtocolError(AhpErrorCodes.AuthRequired, 'The calling chat has no live execution sponsor');
		}
		return undefined;
	}

	private _requiresExecutionCredentials(session: string, action: SessionAction | ChatAction | TerminalAction | ClientChangesetAction | ClientAnnotationsAction | IRootConfigChangedAction): boolean {
		switch (action.type) {
			case ActionType.ChatTurnStarted:
			case ActionType.ChatTurnResume:
			case ActionType.ChatTruncated:
			case ActionType.SessionWorkingDirectorySet:
			case ActionType.SessionWorkingDirectoryReplaced:
			case ActionType.ChatWorkingDirectorySet:
			case ActionType.SessionCustomizationToggled:
			case ActionType.SessionMcpServerStartRequested:
			case ActionType.SessionMcpServerBackgroundRequested:
				return true;
			case ActionType.ChatPendingMessageSet:
				return action.kind === PendingMessageKind.Queued;
			case ActionType.SessionConfigChanged:
				return this._agentMergeController.requiresConfigurationCredentialSponsor(session, action.config);
			default:
				return false;
		}
	}

	private _checkCredentialPrincipal(session: string, source: IAgentHostCredentialSource | undefined): void {
		const principal = this._authService.getSessionCredentialPrincipal(session);
		if (source && principal && (!source.principal
			|| source.principal.apiOrigin !== principal.apiOrigin || source.principal.userId !== principal.userId)) {
			throw new ProtocolError(AhpErrorCodes.PermissionDenied, 'The action sponsor does not match the isolated session owner');
		}
	}

	private _requireProviderCredentials(provider: IAgent, credentials: IAgentHostCredentialSource): void {
		if (provider.supportsScopedCredentials !== true) {
			throw new ProtocolError(AhpErrorCodes.PermissionDenied, 'This provider cannot safely execute with client-owned credentials');
		}
		for (const resource of provider.getProtectedResources()) {
			if ((resource.required !== false || resource.resource === credentials.principal?.apiOrigin)
				&& !credentials.getCredential({ resource: resource.resource, scopes: resource.scopes_supported })) {
				throw new ProtocolError(AhpErrorCodes.AuthRequired, 'The requesting client must authenticate for this operation', { resources: [resource] });
			}
		}
	}

	private async _restoreCredentialPrincipal(session: string): Promise<void> {
		const reference = await this._sessionDataService.tryOpenDatabase(URI.parse(session));
		if (!reference) {
			return;
		}
		try {
			const metadata = await reference.object.getMetadataObject({ [SESSION_CREDENTIAL_PRINCIPAL_KEY]: true });
			const serialized = metadata[SESSION_CREDENTIAL_PRINCIPAL_KEY];
			if (serialized !== undefined) {
				this._authService.restorePersistedCredentialPrincipal(session, parseCredentialPrincipal(serialized));
			}
		} finally {
			reference.dispose();
		}
	}

	private async _resolveExecutionCredentials(session: string, credentials?: IAgentHostCredentialSource): Promise<IAgentHostCredentialSource | undefined> {
		if (!this._stateManager.getSessionState(session) && !this._authService.getSessionCredentialPrincipal(session)) {
			await this._restoreCredentialPrincipal(session);
		}
		const principal = this._authService.getSessionCredentialPrincipal(session);
		if (!principal && !credentials) {
			return undefined;
		}
		const registration = await this._orchestratorDatabase.getSessionV2Registration(session);
		const provider = this._providerService.getProviderForSession(session) ?? (registration ? this._providerService.getProvider(registration.provider) : undefined);
		if (principal && !credentials) {
			if (!provider) {
				throw new ProtocolError(AhpErrorCodes.AuthRequired, 'The isolated session provider is unavailable');
			}
			credentials = await this._authService.createLocalCredentialSource(principal, provider.getProtectedResources());
		}
		if (credentials) {
			if (!provider) {
				throw new ProtocolError(AhpErrorCodes.AuthRequired, 'The isolated session provider is unavailable');
			}
			this._requireProviderCredentials(provider, credentials);
		}
		return credentials;
	}

	private async _bindExecutionCredentials(session: string, credentials: IAgentHostCredentialSource, chat?: string): Promise<void> {
		const provider = this._providerService.getProviderForSession(session);
		if (!provider) {
			throw new ProtocolError(AhpErrorCodes.AuthRequired, 'The isolated session provider is unavailable');
		}
		this._requireProviderCredentials(provider, credentials);
		if (!credentials.principal) {
			throw new ProtocolError(AhpErrorCodes.AuthRequired, 'The session sponsor has no validated GitHub owner');
		}
		this._authService.restoreSessionCredentialPrincipal(session, credentials.principal);
		this._authService.bindSessionCredentials(session, credentials, chat);
		if (chat !== undefined && this._chatOwnership.isDefaultChat(session, chat)) {
			this._authService.bindSessionCredentials(session, credentials);
		}
		await this._persistCredentialPrincipal(session, credentials);
		this._requireProviderCredentials(provider, credentials);
	}

	private async _persistCredentialPrincipal(session: string, credentials: IAgentHostCredentialSource): Promise<void> {
		if (!credentials.principal) {
			throw new ProtocolError(AhpErrorCodes.AuthRequired, 'The session sponsor has no validated GitHub owner');
		}
		this._authService.restoreSessionCredentialPrincipal(session, credentials.principal);
		await persistSessionMetadataValues(this._sessionStateStore, session, {
			[SESSION_CREDENTIAL_PRINCIPAL_KEY]: JSON.stringify(credentials.principal),
		});
	}

	private async _prepareColdRestoreCredentials(session: string, credentials: IAgentHostCredentialSource): Promise<IAgentHostCredentialSource> {
		await this._restoreCredentialPrincipal(session);
		const registration = await this._orchestratorDatabase.getSessionV2Registration(session);
		const provider = registration ? this._providerService.getProvider(registration.provider) : this._providerService.getProviderForSession(session);
		if (!provider) {
			throw new ProtocolError(AhpErrorCodes.AuthRequired, 'The isolated session provider is unavailable');
		}
		this._requireProviderCredentials(provider, credentials);
		if (!credentials.principal) {
			throw new ProtocolError(AhpErrorCodes.AuthRequired, 'History restoration requires a validated GitHub owner');
		}
		this._authService.restoreSessionCredentialPrincipal(session, credentials.principal);
		for (const chat of (await this._readRecordedChatStorage(session)).keys()) {
			this._authService.restoreSessionCredentialPrincipal(session, credentials.principal, chat);
		}
		const defaultChat = this._chatOwnership.getDefaultChat(session);
		if (defaultChat !== undefined) {
			this._authService.restoreSessionCredentialPrincipal(session, credentials.principal, defaultChat);
		}
		return captureCredentialSource(credentials, provider.getProtectedResources());
	}

	/** The recorded storage of a registered chat, or the creation-time rule for one not registered yet. */
	private _chatStorageResource(session: URI, chat: URI): string {
		return this._chatOwnership.resolveChatStorageResource(session.toString(), chat.toString());
	}

	/** The storage of a default chat being created: nothing records it yet, so the creation-time rule decides. */
	private _newDefaultChatStorageResource(session: URI, defaultChat: URI): string {
		return creationTimeChatStorageResource(session.toString(), defaultChat.toString(), defaultChat.toString());
	}

	/**
	 * The recorded storage of a session's default chat when it is known without reading the catalog: the chat is
	 * registered, or its session's state is loaded. Never the creation-time rule, which is wrong for a promoted chat
	 * (Block 4: it stores in its own database); use {@link _resolveDefaultChatStorageResource} otherwise.
	 */
	private _knownDefaultChatStorageResource(session: URI, defaultChat: URI): string | undefined {
		return this._chatOwnership.getChatStorageResource(defaultChat.toString())
			?? this._sessionStateStore.peek(session)?.chats.get(defaultChat.toString())?.storage;
	}

	/** The storage of a session's default chat, also for a session whose state is not loaded: its catalog records it. */
	private async _resolveDefaultChatStorageResource(session: URI, defaultChat: URI): Promise<string> {
		const known = this._knownDefaultChatStorageResource(session, defaultChat);
		if (known !== undefined) {
			return known;
		}
		const [snapshot] = await this._orchestratorDatabase.readCatalogSnapshot([session.toString()]);
		// A session no catalog records storage for was created before chats could move: the creation-time rule recorded it.
		return recordedChatStorage(snapshot, this._logService).get(defaultChat.toString()) ?? this._newDefaultChatStorageResource(session, defaultChat);
	}

	/** Storage resources the normalized catalog records for a session's chats. */
	private async _readRecordedChatStorage(session: string): Promise<ReadonlyMap<string, string>> {
		const [snapshot] = await this._orchestratorDatabase.readCatalogSnapshot([session]);
		return recordedChatStorage(snapshot, this._logService);
	}

	/**
	 * Last host-published customization snapshot for the session, passed
	 * explicitly to providers. `undefined` means "no snapshot yet", not "an
	 * empty customization list".
	 */
	private _hostCustomizations(session: URI): readonly Customization[] | undefined {
		return this._stateManager.getSessionState(session.toString())?.customizations;
	}

	/** The client that initiated session creation: the source turn's initiator for a fork or side chat, otherwise the active client. */
	private _creatingClientId(config: IAgentCreateSessionConfig | undefined): string | undefined {
		const source = readSessionCreationReference(config?._meta);
		const sourceChat = source?.chat ?? (source ? this._defaultChat(source.session) : undefined);
		const turnId = source?.turnId ?? (sourceChat ? this._stateManager.getChatState(sourceChat)?.activeTurn?.id : undefined);
		return sourceChat && turnId ? this._turnTracker.getInitiatorClientId(sourceChat, turnId) : config?.activeClient?.clientId;
	}

	/** Whether the creator cannot address opaque chat URIs. No creating client means a host-internal creation, which is opaque. */
	private _creatorUsesLegacyChatUris(config: IAgentServiceCreateSessionConfig | undefined): boolean {
		if (config?.legacyChatUris !== undefined) {
			return config.legacyChatUris;
		}
		const clientId = this._creatingClientId(config);
		return clientId !== undefined && this._clientConnections.usesLegacyChatUris(clientId);
	}

	/** Mints the session URI before the collapsed `createChat` path derives its default-chat URI. */
	private async _mintSessionUri(provider: IAgent, config: IAgentServiceCreateSessionConfig | undefined): Promise<URI> {
		const clientId = this._creatingClientId(config);
		const legacy = clientId !== undefined && this._clientConnections.usesLegacySessionUris(clientId);
		if (!usesStandardSessionUris(provider.id)) {
			return AgentSession.uri(provider.id, generateUuid());
		}
		const registeredIds = new Set([...await this._sessionRegistry.listRuntimeCompatibleSessionKeys()].map(key => AgentSession.id(key)));
		let session: URI;
		do {
			session = AgentSession.uri(legacy ? provider.id : 'ahp-session', generateUuid());
		} while (registeredIds.has(AgentSession.id(session))
		|| await this._sessionRegistry.isTombstoned(session)
			|| await this._fileService.exists(this._sessionDataService.getSessionDataDir(session)));
		return session;
	}

	private async _createProviderSession(provider: IAgent, config: IAgentServiceCreateSessionConfig | undefined, deferWorktreeCreation: boolean, agentMergeEnabled: boolean): Promise<IAgentCreateSessionResult & { readonly defaultChat: URI }> {
		const requestedSessionId = deferWorktreeCreation && config?.session ? AgentSession.id(config.session) : undefined;
		if (requestedSessionId) {
			this._worktree.notePending(requestedSessionId);
		}

		const session = config?.session ?? await this._mintSessionUri(provider, config);
		let created: (IAgentCreateSessionResult & { readonly defaultChat: URI }) | undefined;
		try {
			if (config?.credentials) {
				this._authService.bindSessionCredentials(session.toString(), config.credentials);
			}
			await this._orchestratorDatabase.prepareSessionStorage?.(session.toString(), provider.id);
			const providerConfig = config ? this._toProviderConfig(config) : undefined;
			const generation = await this._sessionRegistry.isTombstoned(session) ? generateUuid() : undefined;
			const defaultChatUri = URI.parse(mintDefaultChatUri(this._creatorUsesLegacyChatUris(config) ? 'shaped' : 'opaque', session.toString(), generation));
			this._orchestratorDatabase.recordChatStorageIdentity(session.toString(), defaultChatUri.toString(), { kind: 'default', generation });
			if (config?.credentials) {
				this._authService.bindSessionCredentials(session.toString(), config.credentials, defaultChatUri.toString());
				if (agentMergeEnabled) {
					this._agentMergeController.bindCredentialSponsor(session.toString(), defaultChatUri.toString(), config.credentials);
				}
			}
			// No catalog records the minted default chat yet; the session state store imports it as the default chat.
			this._sessionStateStore.noteCreatedSession(session, defaultChatUri);
			const boundConfig: IAgentCreateSessionConfig = { ...(providerConfig ?? {}), session };
			const context = this._chatContext(session, defaultChatUri, this._newDefaultChatStorageResource(session, defaultChatUri));
			const result = await provider.chats.createChat(defaultChatUri, config?.credentials ? { ...context, credentials: config.credentials } : context, this._toCreateChatOptions(boundConfig));
			created = {
				session,
				defaultChat: defaultChatUri,
				...(result?.project ? { project: result.project } : {}),
				...(result?.resolvedWorkingDirectory ? { resolvedWorkingDirectory: result.resolvedWorkingDirectory } : {}),
				...(result?.provisional ? { provisional: true } : {}),
				...(result ? { chat: result } : {}),
			};
			if (deferWorktreeCreation && created.provisional) {
				this._worktree.notePending(AgentSession.id(created.session));
			}
			await this._persistDefaultChatBacking(created);
			return created;
		} catch (err) {
			if (created) {
				await this._rollbackProviderSession(provider, created.session, created.defaultChat);
			} else {
				this._titleController.clearSession(session.toString(), []);
			}
			throw err;
		} finally {
			const returnedPendingSessionId = created?.provisional ? AgentSession.id(created.session) : undefined;
			if (requestedSessionId && requestedSessionId !== returnedPendingSessionId) {
				this._worktree.clearPending(requestedSessionId);
			}
		}
	}

	/**
	 * Best-effort rollback for a partially-created provider session. Creation
	 * only provisions the default chat, so rollback disposes that one chat and
	 * the caller rethrows the original error.
	 */
	private async _rollbackProviderSession(provider: IAgent, session: URI, defaultChatUri: URI): Promise<void> {
		try {
			await provider.chats.disposeChat(defaultChatUri, this._chatContext(session, defaultChatUri, this._newDefaultChatStorageResource(session, defaultChatUri)));
		} catch (disposeError) {
			this._logService.error(disposeError, `[AgentService] Failed to roll back default chat of provider session ${session.toString()}`);
		} finally {
			this._titleController.clearSession(session.toString(), [defaultChatUri.toString()]);
		}
	}

	private _getSessionChatsInTeardownOrder(session: URI): URI[] {
		const state = this._stateManager.getSessionState(session.toString());
		return this._orderSessionChatsForTeardown(session, state?.chats.map(chat => chat.resource) ?? [], this._defaultChat(session));
	}

	private _orderSessionChatsForTeardown(session: URI, chats: readonly string[], defaultChat: string | undefined): URI[] {
		const result: URI[] = [];
		const seen = new Set<string>();
		for (const chat of chats) {
			if (chat !== defaultChat && !seen.has(chat)) {
				seen.add(chat);
				result.push(URI.parse(chat.toString()));
			}
		}
		if (defaultChat !== undefined && !seen.has(defaultChat)) {
			result.push(URI.parse(defaultChat));
		}
		return result;
	}

	/**
	 * Records the storage of a legacy-catalog session's private (spawned or
	 * tool) chat in its central chat state, so deleting the session finds it.
	 * A normalized catalog records its private chats itself. Never throws.
	 */
	private async _recordLegacyPrivateChatStorage(session: URI, chat: URI): Promise<void> {
		try {
			const [catalog] = await this._orchestratorDatabase.readCatalogSnapshot([session.toString()]);
			if (catalog?.authorityVersion !== 1) {
				return;
			}
			await this._sessionStateStore.write(session, sessionStatePatch({
				chats: [{ chat: chat.toString(), isDefault: false, fields: { storage: this._chatStorageResource(session, chat) } }],
			}), SessionStateMirrorFlush.Coalesced);
		} catch (error) {
			this._logService.warn(`[AgentService] Failed to record the storage of private chat ${chat.toString()}: ${toErrorMessage(error)}`);
		}
	}

	/**
	 * Every chat of a session being deleted with its recorded storage, read
	 * without importing the session's central state: live registrations, the
	 * normalized catalog (private chats included), the central chat state of a
	 * legacy-catalog session (which records its private and tool chats), else
	 * the creation-time rule. Private chats come with their provider data.
	 */
	private async _readChatsForDeletion(session: URI, catalog: IAgentHostDatabaseCatalogSnapshotEntry | undefined, defaultChat: string, knownChats: readonly string[]): Promise<{ readonly storage: ReadonlyMap<string, string>; readonly privateChats: readonly IPersistedPeerChat[] }> {
		const sessionKey = session.toString();
		const normalizedStorage = recordedChatStorage(catalog, this._logService);
		const centralStorage = new Map<string, string | undefined>();
		const loaded = this._sessionStateStore.peek(session);
		if (loaded) {
			for (const [chat, entry] of loaded.chats) {
				centralStorage.set(chat, entry.storage);
			}
		} else {
			for (const chat of (await this._orchestratorDatabase.readSessionState(sessionKey))?.chats ?? []) {
				centralStorage.set(chat.chat, chat.storageResource);
			}
		}
		const privateChats: IPersistedPeerChat[] = [];
		if (catalog?.authorityVersion === 2) {
			for (const row of catalog.chats) {
				if (row.order === undefined && row.chat !== defaultChat) {
					const providerData = (await this._orchestratorDatabase.getChatV2ProviderDetail(row.chat))?.providerData;
					privateChats.push({ uri: row.chat, ...(providerData !== undefined ? { providerData } : {}) });
				}
			}
		}
		const storage = new Map<string, string>();
		for (const chat of new Set([defaultChat, ...knownChats, ...normalizedStorage.keys(), ...centralStorage.keys(), ...privateChats.map(entry => entry.uri)])) {
			// A default chat records its storage too: a promoted chat keeps its own database (Block 4).
			storage.set(chat, this._chatOwnership.getChatStorageResource(chat) ?? normalizedStorage.get(chat) ?? centralStorage.get(chat) ?? creationTimeChatStorageResource(sessionKey, chat, defaultChat));
		}
		return { storage, privateChats };
	}

	/**
	 * Deletes the data of deleted chats: each chat's recorded storage and the
	 * database older builds' mirrors address by its URI, never the session's own
	 * directory nor one in `keep`, and only when no other live session or chat
	 * still records it.
	 */
	private async _deleteChatStorage(session: URI, chats: readonly { readonly chat: URI; readonly storage: string }[], keep: readonly string[] = []): Promise<void> {
		const directoryKey = (resource: URI) => getComparisonKey(this._sessionDataService.getSessionDataDir(resource));
		const visited = new Set([directoryKey(session), ...keep.map(resource => directoryKey(URI.parse(resource)))]);
		for (const { chat, storage } of chats) {
			for (const candidate of [URI.parse(storage), chat]) {
				const key = directoryKey(candidate);
				if (visited.has(key)) {
					continue;
				}
				visited.add(key);
				const references = await this._orchestratorDatabase.countStorageReferences(candidate.toString(), session.toString());
				if (references > 0) {
					this._logService.info(`[AgentService] Keeping the data of ${candidate.toString()} for chat ${chat.toString()}: ${references} other reference(s) record it`);
					continue;
				}
				// A moved session's chat stores in that session's directory, whose attachments other chats moved out of it may still read (Block 4).
				if (await this._isAttachmentOrigin(candidate.toString())) {
					await this._sessionDataService.deleteSessionDataExcept(candidate, [SESSION_ATTACHMENTS_DIRNAME]);
				} else {
					await this._sessionDataService.deleteSessionData(candidate);
				}
			}
		}
	}

	/**
	 * Destructively tears a session down: dispose peer chats first and the
	 * default chat last, and still visit every chat if one rejects.
	 */
	private async _disposeSession(provider: IAgent, session: URI, persistedPeers: readonly IPersistedPeerChat[] | undefined, defaultChat: string, privateChats: readonly IPersistedPeerChat[] = []): Promise<readonly URI[]> {
		await this._defaultChatBackingWrites.get(session.toString())?.catch(() => { });
		const state = this._stateManager.getSessionState(session.toString());
		const catalog = persistedPeers ?? (!state ? await provider.listLegacyChatBackings?.(session) : undefined);
		// A private chat has a backing to release when it is live or recorded provider data.
		const privateBackings = privateChats.filter(chat => chat.providerData !== undefined || this._stateManager.getChatState(chat.uri));
		const chats = this._orderSessionChatsForTeardown(session, [
			...(state?.chats.map(chat => chat.resource) ?? []),
			...(catalog?.map(chat => chat.uri.toString()) ?? []),
			...privateBackings.map(chat => chat.uri),
		], defaultChat);
		const defaultChatStorage = await this._resolveDefaultChatStorageResource(session, URI.parse(defaultChat));
		const storageOf = (chat: URI) => chat.toString() === defaultChat ? defaultChatStorage : this._chatStorageResource(session, chat);
		for (const chat of chats) {
			const persisted = catalog?.find(entry => isEqual(URI.parse(entry.uri.toString()), chat)) ?? privateBackings.find(entry => entry.uri === chat.toString());
			if (!this._stateManager.getChatState(chat.toString()) && (chat.toString() === defaultChat || persisted)) {
				const providerData = chat.toString() === defaultChat ? await this._readDefaultChatProviderData(session) : persisted?.providerData;
				await provider.materializeChat(chat, this._chatContext(session, chat, storageOf(chat)), providerData);
			}
		}
		let firstError: unknown;
		for (const chat of chats) {
			try {
				await provider.chats.disposeChat(chat, this._chatContext(session, chat, storageOf(chat)));
			} catch (err) {
				firstError ??= err;
			}
		}
		if (firstError !== undefined) {
			throw firstError;
		}
		return chats;
	}

	/**
	 * Releases a session's in-memory footprint without deleting durable data.
	 * Idle eviction must use {@link IAgentChats.releaseChat}, not destructive
	 * session finalization, so the session remains resumable.
	 */
	private async _canReleaseSession(provider: IAgent, session: URI, chats: readonly URI[]): Promise<boolean> {
		for (const chat of chats) {
			if (provider.chats.canReleaseChat && !await provider.chats.canReleaseChat(chat, this._chatContext(session, chat, this._chatStorageResource(session, chat)))) {
				return false;
			}
		}
		return true;
	}

	private async _releaseSession(provider: IAgent, session: URI, chats: readonly URI[]): Promise<void> {
		await this._defaultChatBackingWrites.get(session.toString())?.catch(() => { });
		// Still release every catalog chat if one rejects; otherwise an idle-evicted
		// session could leave a chat resident indefinitely.
		let firstError: unknown;
		for (const chat of chats) {
			try {
				await provider.chats.releaseChat(chat, this._chatContext(session, chat, this._chatStorageResource(session, chat)));
			} catch (err) {
				firstError ??= err;
			}
		}
		if (firstError !== undefined) {
			throw firstError;
		}
	}

	/**
	 * Reconstruct the turns for a chat. `chat` is the concrete chat channel URI,
	 * except for legacy restore paths that still address subagent sessions.
	 *
	 * `origin` is only supplied by restore paths that reconstruct a chat's turns
	 * *before* the chat is registered in the catalog, so the host-owned context
	 * cannot supply it yet. It takes precedence over the catalog value for
	 * exactly that window; every other caller relies on the exhaustive origin
	 * {@link _chatContext} stamps.
	 */
	private async _getChatMessages(provider: IAgent, chat: URI, session: URI, isDefaultChat: boolean, storage: URI, origin?: ChatOrigin, workspaceTransitionsPromise?: Promise<ReadonlyMap<string, string> | undefined>, credentials?: IAgentHostCredentialSource): Promise<readonly Turn[]> {
		const context = { ...this._chatContext(session, chat, storage.toString()), ...(origin ? { origin } : {}), ...(credentials ? { credentials } : {}) };
		const transitionsPromise = workspaceTransitionsPromise ?? this._loadWorkspaceTransitions(storage);
		this._logService.trace(`[AgentService] getChatMessages start: chat=${chat.toString()}`);
		const [providerTurns, workspaceTransitions] = await Promise.all([
			provider.chats.getMessages(chat, context),
			transitionsPromise,
		]);
		this._logService.trace(`[AgentService] getChatMessages: provider returned ${providerTurns.length} turn(s) for chat=${chat.toString()}`);
		return this._chatContributions.hydrateTurns({ session: session.toString(), chat: chat.toString(), isDefaultChat, storageResource: storage.toString(), workspaceTransitions }, providerTurns);
	}

	/** Routes a passive provider snapshot through normal hydration while retaining host-owned turns. */
	private async _refreshChatHistory(provider: IAgent, chat: URI, providerTurns: readonly Turn[]): Promise<void> {
		const owner = this._chatOwnership.getChatOwner(chat.toString());
		if (owner === undefined) {
			return;
		}
		const session = URI.parse(owner);
		await this._restoreSessionInFlight.get(session.toString());
		const previous = this._stateManager.getChatState(chat.toString());
		const watch = this._chatWatches.get(chat);
		if (!previous || this._store.isDisposed || this._providerService.getProviderForSession(session) !== provider || !this._subscriptions.hasSubscribers(chat)) {
			return;
		}
		if (previous.activeTurn) {
			this._pendingChatHistories.set(chat.toString(), { provider, chat, turns: providerTurns });
			return;
		}
		const storage = this._chatStorageResource(session, chat);
		const hydrated = await this._chatContributions.hydrateTurns({ session: session.toString(), chat: chat.toString(), isDefaultChat: this._chatOwnership.isDefaultChat(session.toString(), chat.toString()), storageResource: storage, workspaceTransitions: await this._loadWorkspaceTransitions(URI.parse(storage)) }, providerTurns);
		const turns = await this._interleaveLocalTurns(session.toString(), chat.toString(), hydrated);
		const byId = new Map(turns.map(turn => [turn.id, turn]));
		const refreshed = previous.turns.map(turn => byId.get(turn.id) ?? turn);
		const existing = new Set(previous.turns.map(turn => turn.id));
		refreshed.push(...turns.filter(turn => !existing.has(turn.id)));
		if (!this._store.isDisposed && this._providerService.getProviderForSession(session) === provider && this._subscriptions.hasSubscribers(chat) && this._chatWatches.get(chat) === watch) {
			const current = this._stateManager.getChatState(chat.toString());
			if (current?.activeTurn) {
				this._pendingChatHistories.set(chat.toString(), { provider, chat, turns: providerTurns });
			} else if (current && current.turns !== previous.turns) {
				void this._chatHistoryRefreshes.queue(chat.toString(), () => this._refreshChatHistory(provider, chat, providerTurns)).catch(error => this._logService.warn('[AgentService] Failed to reconcile external history', error));
			} else {
				this._stateManager.refreshChatHistory(chat.toString(), previous.turns, refreshed);
			}
		}
	}

	private async _loadWorkspaceTransitions(storage: URI): Promise<ReadonlyMap<string, string> | undefined> {
		try {
			const database = await this._sessionDataService.tryOpenDatabase(storage);
			return database ? this._readWorkspaceTransitions(database, storage, true) : undefined;
		} catch (error) {
			this._logService.warn(`[AgentService] Failed to open workspace transition storage for ${storage.toString()}`, error);
			return undefined;
		}
	}

	private async _readWorkspaceTransitions(database: IReference<ISessionDatabase>, storage: URI, requireMarker = false): Promise<ReadonlyMap<string, string> | undefined> {
		try {
			if (requireMarker && await database.object.getMetadata(AH_META_HAS_WORKSPACE_TRANSITIONS_DB_KEY) !== 'true') {
				return undefined;
			}
			return await database.object.getTurnWorkspaceTransitions();
		} catch (error) {
			this._logService.warn(`[AgentService] Failed to restore workspace transitions for ${storage.toString()}`, error);
			return undefined;
		} finally {
			database.dispose();
		}
	}

	/**
	 * Merges persisted host-injected local turns (`/rename`, `!command`) for
	 * `chatUri` back into that chat's SDK-derived `turns`, positioned after
	 * their anchor turn (the concrete turn they were recorded after). Locals
	 * anchored before any real turn are prepended; locals whose anchor is absent
	 * from the SDK turns (e.g. truncated away) are dropped. Also seeds the
	 * in-memory local-turn index so fork/truncate resolve correctly before the
	 * next reload.
	 */
	private async _interleaveLocalTurns(sessionStr: string, chatUri: string, turns: readonly Turn[]): Promise<Turn[]> {
		const records = await this._localTurns.loadForChat(sessionStr, chatUri, new Set(turns.map(turn => turn.id)));
		return interleaveLocalTurns(turns, records, this._logService);
	}

	/**
	 * Re-persists forked host-injected local turns (`/rename`, `!command`) into
	 * a newly forked chat so they survive reload and anchor future
	 * fork/truncate. `originalSlice[i]` and `forkedTurns[i]` are the source turn
	 * and its remapped copy (same length, 1:1); `mapping` is the old→new turn id
	 * map used to remap each local turn's anchor. `persistSession` owns the
	 * destination database; `sourceChatUri` / `newChatUri` key the source and
	 * destination local-turn indexes.
	 *
	 * Shared by the {@link createSession} (default-chat) and {@link createChat}
	 * (peer-chat) fork paths.
	 */
	private _persistForkedLocalTurns(persistSession: string, sourceChatUri: string, newChatUri: string, originalSlice: readonly Turn[], forkedTurns: readonly Turn[], mapping: ReadonlyMap<string, string>): void {
		for (let i = 0; i < originalSlice.length; i++) {
			const original = originalSlice[i];
			if (!this._localTurns.isLocal(sourceChatUri, original.id)) {
				continue;
			}
			const originalAnchor = this._localTurns.resolveConcreteTurnId(sourceChatUri, original.id);
			const newAnchor = originalAnchor !== undefined ? mapping.get(originalAnchor) : undefined;
			this._localTurns.record(persistSession, newChatUri, forkedTurns[i], newAnchor);
		}
	}

	/**
	 * Create (or fork) the peer chat `chat` within `session`. `chat` is
	 * always a peer URI here (the default chat is created implicitly with
	 * the session), so no default-chat resolution is needed.
	 */
	private async _createChat(provider: IAgent, chat: URI, session: URI, options: IAgentCreateChatOptions | undefined, credentials?: IAgentHostCredentialSource): Promise<IAgentCreateChatResult | void> {
		const placement = this._buildChatPlacement(session);
		const isEphemeral = this._stateManager.isEphemeralSession(session.toString());
		const convOptions: IAgentCreateChatOptions | undefined = (options?.title !== undefined || options?.model !== undefined || options?.workingDirectories !== undefined || placement || isEphemeral)
			? {
				...(isEphemeral ? { isEphemeral: true } : {}),
				...(options?.title !== undefined ? { title: options.title } : {}),
				...(options?.model !== undefined ? { model: options.model } : {}),
				...(options?.workingDirectories !== undefined
					? { workingDirectories: options.workingDirectories }
					: placement?.workingDirectories ? { workingDirectories: placement.workingDirectories } : {}),
				...(placement?.project ? { project: placement.project } : {}),
				...(placement?.config ? { config: placement.config } : {}),
			}
			: undefined;
		// The folders the chat is created in decide its context: nothing is recorded for a new chat yet, and a re-created backing replaces its folders.
		const chatContext = options?.workingDirectories
			? createAgentChatCreationContext(this._stateManager, this._authService, session, chat, this._chatStorageResource(session, chat), this._sessionStateStore.peek(session), options.workingDirectories)
			: this._chatContext(session, chat, this._chatStorageResource(session, chat));
		const context = credentials ? { ...chatContext, credentials } : chatContext;
		const result = await provider.chats.createChat(chat, context, options?.fork ? { ...convOptions, fork: options.fork } : convOptions);
		return result;
	}

	private _resolveChatWorkingDirectories(session: URI, provider: IAgent, requested: readonly URI[]): readonly URI[] {
		if (!provider.getDescriptor().capabilities?.multipleWorkingDirectories) {
			throw new Error(`[AgentService] createChat: provider ${provider.id} does not support chat working directories`);
		}
		const sessionDirectories = this._stateManager.getSessionSummary(session.toString())?.workingDirectories ?? [];
		const resolved: URI[] = [];
		for (const directory of requested) {
			const match = sessionDirectories.find(candidate => isEqual(URI.parse(candidate), directory));
			if (!match) {
				throw new Error(`[AgentService] createChat: working directory ${directory.toString()} does not belong to session ${session.toString()}`);
			}
			const canonicalDirectory = URI.parse(match);
			if (resolved.some(candidate => isEqual(candidate, canonicalDirectory))) {
				throw new Error('[AgentService] createChat: working directories must be unique');
			}
			resolved.push(canonicalDirectory);
		}
		return resolved;
	}

	private _toCreateChatOptions(config: IAgentCreateSessionConfig): IAgentCreateChatOptions {
		return {
			...(config.session && this._stateManager.isEphemeralSession(config.session.toString()) ? { isEphemeral: true } : {}),
			...(readChatSurfaceMeta(config)?.surface === 'editorInline' ? { hasScopedEditSurface: true } : {}),
			...(config.model ? { model: config.model } : {}),
			...(config.agent ? { agent: config.agent } : {}),
			...(config.workingDirectories ? { workingDirectories: config.workingDirectories } : {}),
			...(config.config ? { config: config.config } : {}),
			...(config.activeClient ? { activeClient: config.activeClient } : {}),
			...(!config.importConversation ? { deferBacking: true } : {}),
			...(config.importConversation ? { importConversation: config.importConversation } : {}),
		};
	}

	/** Resolves the owning session context for creating an additional chat. */
	private _buildChatPlacement(session: URI): Pick<IAgentCreateChatOptions, 'workingDirectories' | 'project' | 'config'> | undefined {
		const state = this._stateManager.getSessionState(session.toString());
		const workingDirectories = state?.workingDirectories?.map(directory => typeof directory === 'string' ? URI.parse(directory) : directory) ?? [];
		const resolvedPrimary = this._worktree.getResolvedWorktree(AgentSession.id(session));
		if (resolvedPrimary) {
			workingDirectories[0] = resolvedPrimary;
		}
		if (workingDirectories.length === 0) {
			return undefined;
		}
		const config = this._configurationService.getSessionConfigValues(session.toString());
		return {
			workingDirectories,
			...(state?.project ? { project: { uri: URI.parse(state.project.uri), displayName: state.project.displayName } } : {}),
			...(config && Object.keys(config).length > 0 ? { config } : {}),
		};
	}

	private async _disposeChat(provider: IAgent, session: URI, chat: URI): Promise<void> {
		await provider.chats.disposeChat(chat, this._chatContext(session, chat, this._chatStorageResource(session, chat)));
	}

	/**
	 * Derives a placeholder title for an imported session from its first user
	 * turn (imports seed pre-existing turns, so the normal first-message title
	 * generation never fires). Deliberately unprefixed: an imported session is a
	 * continuation of the source chat, not a distinct kind of session, so it
	 * should read like any other. The placeholder is later refined into a
	 * generated title (see the `importConversation` branch in `createSession`),
	 * but a neutral non-empty fallback is kept so the session still reads like a
	 * normal chat when generation is unavailable or fails.
	 */
	private _buildImportedTitle(turns: readonly Turn[]): string {
		const firstText = turns.find(t => t.message?.text?.trim())?.message.text.trim();
		if (!firstText) {
			return localize('agentHost.importedSessionFallback', "New Session");
		}
		const MAX = 60;
		return firstText.length > MAX ? `${firstText.slice(0, MAX)}...` : firstText;
	}

	private _buildInitialSummary(provider: IAgent, session: URI, config: IAgentCreateSessionConfig | undefined, created: { defaultChat: URI; project?: { uri: URI; displayName: string }; resolvedWorkingDirectory?: URI }, title: string): SessionSummary & { readonly defaultChat: string } {
		const now = new Date().toISOString();
		// The provider resolved only its process root (index 0), which may
		// differ from the requested primary (e.g. a workspace-less scratch dir).
		// Assemble the session set by overriding the requested primary with it
		// and keeping the requested tail; the fully-resolved multi-root set
		// arrives later via the materialization receipt.
		const workingDirectories = reconcileWorkingDirectories(config?.workingDirectories, created.resolvedWorkingDirectory ? [created.resolvedWorkingDirectory] : undefined);
		const pullRequestGitHubState = getPullRequestSessionGitHubState(session, config?.config);
		const explicitGitHubState = pullRequestGitHubState ?? readSessionGitHubStateInput(config?._meta);
		const explicitMultiRoot = readSessionMultiRootMetadata(config?._meta);
		let _meta = withSessionGitHubState(undefined, workingDirectories?.[0], explicitGitHubState);
		const pullRequestUrl = pullRequestGitHubState?.pullRequestUrls?.[0];
		if (pullRequestUrl) {
			const { artifacts } = new SessionArtifactCollection().addOrPromoteArtifact({
				type: SessionArtifactType.PullRequest,
				label: pullRequestUrl,
				isArtifact: true,
				link: pullRequestUrl,
			}, generateUuid);
			_meta = withSessionArtifacts(_meta, artifacts.map(artifact => ({ ...artifact, chat: created.defaultChat.toString() })));
		}
		_meta = withSessionMultiRootMetadata(_meta, explicitMultiRoot);
		_meta = withEphemeralSessionMeta(_meta, config ? readEphemeralSessionMeta(config).isEphemeral : undefined);
		_meta = withChatSurfaceMeta(_meta, readChatSurfaceMeta(config ?? {}));
		_meta = withSessionExternal(_meta, false);
		const initiator = readSessionInitiator(config);
		if (initiator) {
			_meta = withSessionInitiator(_meta, initiator);
		}
		const creationReference = readSessionCreationReference(config?._meta);
		_meta = creationReference ? withSessionCreationReference(_meta, creationReference) : _meta;
		const devContainerWorktree = readAgentDevContainerWorktreeMetadata(config?._meta);
		_meta = devContainerWorktree ? withAgentDevContainerWorktreeMetadata(_meta, devContainerWorktree.handle) : _meta;
		const remoteOrigin = readRemoteSessionOrigin(config);
		_meta = remoteOrigin ? withRemoteSessionOrigin(_meta, remoteOrigin) : _meta;
		_meta = !config?.workingDirectories
			? withSessionWorkspaceless(_meta, true)
			: _meta;
		_meta = withPublishedWorkingDirectoryIdentities(_meta, workingDirectories, undefined);
		if (provider.id === CODEX_AGENT_PROVIDER_ID) {
			_meta = withCodexSessionModel(_meta, provider.chats.getModel?.(created.defaultChat, this._chatContext(session, created.defaultChat, session.toString())) ?? config?.model);
		}
		return {
			resource: session.toString(),
			provider: provider.id,
			defaultChat: created.defaultChat.toString(),
			title,
			status: SessionStatus.Idle,
			createdAt: now,
			modifiedAt: now,
			...(created.project ? { project: { uri: created.project.uri.toString(), displayName: created.project.displayName } } : {}),
			workingDirectories,
			// Workspace-less is inferred at create from an absent input
			// `workingDirectories` (the host assigns a scratch cwd, so it can't be
			// re-inferred later) and tagged on the generic `_meta` bag. Use
			// `=== undefined` so an explicit empty set (`[]`) is NOT treated as
			// workspace-less.
			...(_meta ? { _meta } : {}),
		};
	}

	/**
	 * Listen for an agent transitioning a provisional session into a fully
	 * materialized SDK session. The agent has already created the worktree
	 * (if any) and persisted on-disk metadata; we need to:
	 * - Refresh the in-memory summary with the resolved working directory
	 *   and project metadata.
	 * - Persist any config values now that we have a real on-disk session.
	 * - Emit the deferred `notify/sessionAdded` so other clients learn of
	 *   the session.
	 * - Dispatch `SessionReady` so subscribers see the lifecycle transition.
	 * - Lazily attach git state for the (possibly new) working directory.
	 */
	private _onDidMaterializeChat(e: IAgentMaterializeChatEvent): void {
		const owner = this._chatOwnership.getChatOwner(e.chat.toString());
		if (owner === undefined) {
			this._logService.warn(`[AgentService] onDidMaterializeChat for unknown chat: ${e.chat.toString()}`);
			return;
		}
		const session = URI.parse(owner);
		const sessionKey = session.toString();
		// The session is now materialized — its SDK is resolved (any cold
		// download already finished), so no further progress is expected for it.
		this._clearDownloadProgressInterest(sessionKey);
		this._sessionPrewarmer.onDraftEnded(session);
		const state = this._stateManager.getSessionState(sessionKey);
		if (!state) {
			this._logService.warn(`[AgentService] onDidMaterializeChat for unknown session: ${sessionKey}`);
			return;
		}
		const currentSummary = this._stateManager.getSessionSummary(sessionKey);
		if (!currentSummary) {
			this._logService.warn(`[AgentService] onDidMaterializeChat missing summary for session: ${sessionKey}`);
			return;
		}
		if (!this._chatOwnership.isDefaultChat(sessionKey, e.chat.toString())) {
			if (!state.chats.some(chat => chat.resource.toString() === e.chat.toString())) {
				return;
			}
			if (e.result?.providerData !== undefined) {
				this._onChatDataChanged({ chat: e.chat, providerData: e.result.providerData });
			}
			if (e.result?.backingSession) {
				void this._markChatBacking(e.result.backingSession, session, e.chat);
			}
			return;
		}
		if (e.result) {
			const write = this._persistDefaultChatBacking({ session, chat: e.result, defaultChat: e.chat });
			this._defaultChatBackingWrites.set(sessionKey, write);
			void write.catch(err => this._logService.error(err, `[AgentService] Failed to persist materialized default-chat backing for ${sessionKey}`));
			const clearWrite = () => {
				if (this._defaultChatBackingWrites.get(sessionKey) === write) {
					this._defaultChatBackingWrites.delete(sessionKey);
				}
			};
			void write.then(clearWrite, clearWrite);
		}
		// The agent no longer knows about worktrees; the host's worktree project
		// (created in the first-send hook) wins for worktree-isolated sessions, and
		// falls back to whatever the agent reported for folder sessions.
		const worktreeInfo = this._worktree.sessionWorktreeInfo(AgentSession.id(session));
		const project = worktreeInfo?.project ?? e.project;
		const materializedMeta = worktreeInfo
			? this._gitStateService.getMaterializedWorktreeMeta(sessionKey, worktreeInfo.branchName)
			: currentSummary._meta;
		const currentSet = currentSummary.workingDirectories?.map(d => URI.parse(d));
		// The materialize receipt is authoritative for the roots it reports
		// (index 0 = the resolved process root, e.g. a worktree). A send-path
		// receipt carries the full resolved set; a resume-path receipt reports
		// only the process root, so the rest of the current set is preserved.
		const workingDirectories = reconcileWorkingDirectories(currentSet, e.workingDirectories);
		const previousWorkingDirectory = currentSummary.workingDirectories?.[0];
		const materializedWorkingDirectory = workingDirectories?.[0];
		const workingDirectoryReplacement = previousWorkingDirectory && materializedWorkingDirectory && previousWorkingDirectory !== materializedWorkingDirectory
			? { directory: previousWorkingDirectory, replacement: materializedWorkingDirectory }
			: undefined;
		// The session folder's GitHub state moves with its checkout.
		let summaryMeta = workingDirectoryReplacement
			? withReplacedFolderGitHubState(materializedMeta, workingDirectoryReplacement.directory, workingDirectoryReplacement.replacement)
			: materializedMeta;
		summaryMeta = withPublishedWorkingDirectoryIdentities(summaryMeta, workingDirectories, state.chats);
		const summary: SessionSummary = {
			...currentSummary,
			...(project ? { project: { uri: project.uri.toString(), displayName: project.displayName } } : {}),
			workingDirectories,
			...(summaryMeta !== undefined ? { _meta: summaryMeta } : {}),
		};
		const configValues = state.config?.values;
		if (configValues && Object.keys(configValues).length > 0) {
			this._persistConfigValues(session, configValues);
		}
		// Persist the AH-owned workspace-less marker now that the session has a
		// real on-disk database (deferred from create for provisional sessions).
		this._queueCatalogSync(session, this._creationMetadataOverrides(state._meta));
		// The provider now has a real backing for this session, so it is no longer
		// provisional. Clearing is retried but still best-effort: a clear that never
		// lands leaves the marker set, which is why suppression additionally
		// requires that the provider cannot describe the session — a materialized
		// session it can describe is never hidden by a stale marker.
		void this._retryRegistryMutation(
			() => this._clearSessionProvisional(session),
			`provisional clearing for ${sessionKey}`,
		).catch(err => this._logService.error(err, `[AgentService] Failed to clear the provisional marker for ${sessionKey}`));
		// `markSessionPersisted` writes the summary into state and fires
		// the deferred `SessionAdded` notification atomically so subscribers
		// see consistent state through both paths.
		this._stateManager.markSessionPersisted(sessionKey, summary);
		if (state.lifecycle !== SessionLifecycle.Ready) {
			this._stateManager.dispatchServerAction(sessionKey, { type: ActionType.SessionReady });
		}
		if (workingDirectoryReplacement) {
			this._stateManager.dispatchServerAction(sessionKey, {
				type: ActionType.SessionWorkingDirectoryReplaced,
				...workingDirectoryReplacement,
			});
		}
		this._publishWorkingDirectoryIdentities(sessionKey);
		const gitHubState = readSessionGitHubState(summary._meta, materializedWorkingDirectory);
		if (gitHubState) {
			void this._gitStateService.setSessionGitHubState(sessionKey, gitHubState);
		}

		// Attach git state for the resolved process root (index 0), if present.
		void this._gitStateService.refreshSessionGitState(sessionKey, e.workingDirectories?.[0]);

		// If a client subscribed to this session's uncommitted changeset
		// before the working directory was known, recompute the current
		// subscriptions now that the working directory is set.
		this._changesetCoordinator.onSessionMaterialized(sessionKey);
	}

	/** Drop a session's download-progress opt-in, if any. */
	private _clearDownloadProgressInterest(sessionKey: string): void {
		for (const [provider, sessions] of this._downloadProgressInterest) {
			if (sessions.delete(sessionKey) && sessions.size === 0) {
				this._downloadProgressInterest.delete(provider);
			}
		}
	}

	/**
	 * Surface a host-level SDK download as client progress. The downloader fires
	 * process-global frames keyed by package id (which equals the provider id);
	 * because the download is shared across every session of that provider, we
	 * emit a SINGLE `progress` stream keyed by that package id — not one per
	 * session — so the client shows exactly one indicator no matter how many
	 * sessions of the provider are awaiting it. Frames are emitted while at least
	 * one session has opted in (supplied a
	 * {@link IAgentCreateSessionConfig.progressToken} on `createSession`) or a
	 * user-initiated flow has explicitly requested progress. A
	 * terminal frame reports `total === progress` (using `receivedBytes` when the
	 * size was never known) so the client dismisses the indicator deterministically.
	 *
	 * `displayName` is the provider's brand noun (e.g. `Claude`). It is woven
	 * into the notification's localized, human-readable `message` (e.g.
	 * "Downloading Claude Agent") so a generic client can render the indicator
	 * verbatim without knowing the resource is an agent SDK. No trailing
	 * ellipsis: clients render progress as "<title>: <percent>", so an ellipsis
	 * would read as an unusual "…:" (see #324455).
	 */
	emitDownloadProgress(packageId: string, displayName: string, receivedBytes: number, totalBytes: number | undefined, terminal: boolean, explicitlyRequested = false): void {
		const sessions = this._downloadProgressInterest.get(packageId);
		if ((!sessions || sessions.size === 0) && !explicitlyRequested) {
			return;
		}
		// On terminal frames force `progress === total` so clients dismiss the
		// indicator in both determinate and indeterminate cases.
		const total = terminal ? receivedBytes : totalBytes;
		const message = localize('agentHost.download.agentSdkTitle', "Downloading {0} Agent", displayName);
		// `progressToken` is the download's own stable identity (the package id),
		// shared by every session of the provider, so the client coalesces all
		// frames into one indicator and dismisses it on the terminal frame.
		this._stateManager.emitProgress({ progressToken: packageId, progress: receivedBytes, total, message });
		if (terminal) {
			this._downloadProgressInterest.delete(packageId);
		}
	}

	private _creationMetadataOverrides(meta: SessionSummary['_meta']): Readonly<Record<string, string>> {
		const overrides: Record<string, string> = {
			[AH_META_WORKSPACELESS_DB_KEY]: readSessionWorkspaceless(meta) ? 'true' : 'false',
		};
		const multiRoot = readSessionMultiRootMetadata(meta);
		if (multiRoot) {
			overrides[SESSION_META_MULTI_ROOT_KEY] = JSON.stringify(multiRoot);
		}
		const folderPicker = readSessionFolderPickerDecision(meta);
		if (folderPicker) {
			overrides[SESSION_META_FOLDER_PICKER_KEY] = JSON.stringify(folderPicker);
		}
		const artifacts = readSessionArtifacts(meta);
		if (artifacts.length > 0) {
			overrides[SESSION_ARTIFACTS_KEY] = stringifySessionArtifacts(artifacts);
		}
		return overrides;
	}

	private _persistConfigValues(session: URI, values: Record<string, unknown>): void {
		const appliedSandboxEnabled = this._configurationService.getSessionSandboxEnabled(session.toString());
		this._sessionStateStore.update(session, 'configValues', previous => JSON.stringify(getPersistedSessionConfigValues(values, appliedSandboxEnabled, previous)), SessionStateMirrorFlush.Immediate).catch(err => {
			this._logService.warn(`[AgentService] Failed to persist configValues for ${session.toString()}: ${toErrorMessage(err)}`);
		});
	}

	private _persistAnnotations(envelope: ActionEnvelope): void {
		if (!isAnnotationsAction(envelope.action)) {
			return;
		}
		const parsed = parseAnnotationsUri(envelope.channel);
		const state = this._stateManager.getAnnotationsState(envelope.channel);
		if (!parsed || !state) {
			return;
		}

		const session = URI.parse(parsed.sessionUri);
		const storage = this._annotationsStorage(session);
		try {
			const serialized = JSON.stringify(state);
			const ref = this._sessionDataService.openDatabase(storage.session);
			const writeKey = annotationsWriteKey(storage);
			const write = ref.object.setMetadata(storage.key, serialized).catch(err => {
				this._logService.warn(`[AgentService] Failed to persist annotations for ${parsed.sessionUri}: ${toErrorMessage(err)}`);
			}).finally(() => {
				ref.dispose();
				if (this._pendingAnnotationWrites.get(writeKey) === write) {
					this._pendingAnnotationWrites.delete(writeKey);
				}
			});
			this._pendingAnnotationWrites.set(writeKey, write);
		} catch (err) {
			this._logService.warn(`[AgentService] Failed to persist annotations for ${parsed.sessionUri}: ${toErrorMessage(err)}`);
		}
	}

	private _annotationsStorage(session: URI): { session: URI; key: string } {
		const subagent = parseSubagentSessionUri(session);
		return subagent
			? { session: subagent.parentSession, key: `${ANNOTATIONS_METADATA_KEY}:${session.toString()}` }
			: { session, key: ANNOTATIONS_METADATA_KEY };
	}

	private async _resolveCreatedSessionConfig(provider: IAgent, config: IAgentCreateSessionConfig | undefined, restoring = false): Promise<SessionConfigState | undefined> {
		if (provider.id !== 'copilotcli' && !config?.config && config?.workingDirectories === undefined) {
			return undefined;
		}
		const params: IAgentResolveSessionConfigParams = {
			provider: provider.id,
			// `resolveSessionConfig` is a pre-session, single-context API:
			// resolve against the session's primary (index 0).
			workingDirectory: config?.workingDirectories?.[0],
			config: config?.config,
		};
		try {
			const resolved = await this._withHostSessionConfigContributions(provider.resolveChatConfig(this._toProviderConfig(params)), params);
			return { schema: resolved.schema, values: resolved.values };
		} catch (err) {
			this._logService.error(`[AgentService] Failed to resolve created session config for provider ${provider.id}`, err);
			if (provider.id === 'copilotcli' && !restoring) {
				throw err;
			}
			return config?.config ? { schema: { type: 'object', properties: {} }, values: config.config } : undefined;
		}
	}

	async resolveSessionConfig(params: IAgentResolveSessionConfigParams): Promise<ResolveSessionConfigResult> {
		const provider = this._providerService.resolveProvider(params.provider);
		if (!provider) {
			throw new Error(`No agent provider registered for: ${params.provider ?? '(none)'}`);
		}
		return this._withHostSessionConfigContributions(provider.resolveChatConfig(this._toProviderConfig(params)), params);
	}

	/** Resolves provider and host configuration concurrently before composing their contributions. */
	private async _withHostSessionConfigContributions(providerConfig: Promise<ResolveSessionConfigResult>, params: IAgentResolveSessionConfigParams): Promise<ResolveSessionConfigResult> {
		const result = await this._withWorktreeConfigContribution(providerConfig, params);
		return this._withAgentMergeConfigContribution(result, params.config);
	}

	private async _withWorktreeConfigContribution(providerConfig: Promise<ResolveSessionConfigResult>, params: IAgentResolveSessionConfigParams): Promise<ResolveSessionConfigResult> {
		const [result, iso] = await Promise.all([
			providerConfig,
			this._worktree.resolveIsolationConfig({ workingDirectory: params.workingDirectory, config: params.config }),
		]);
		if (!iso) {
			return result;
		}
		const properties: Record<string, SessionConfigPropertySchema> = {
			[SessionConfigKey.Isolation]: iso.isolationProperty.protocol,
			...omitHostOwnedSessionConfig(result.schema.properties),
		};
		if (iso.branchProperty) {
			properties[SessionConfigKey.Branch] = iso.branchProperty.protocol;
		}
		if (iso.worktreeBranchPrefixProperty) {
			properties[SessionConfigKey.WorktreeBranchPrefix] = iso.worktreeBranchPrefixProperty.protocol;
		}
		if (iso.worktreeIncludeFilesProperty) {
			properties[SessionConfigKey.WorktreeIncludeFiles] = iso.worktreeIncludeFilesProperty.protocol;
		}
		if (iso.worktreeSymlinkFoldersProperty) {
			properties[SessionConfigKey.WorktreeSymlinkFolders] = iso.worktreeSymlinkFoldersProperty.protocol;
		}
		properties[SessionConfigKey.PullRequestUrl] = iso.pullRequestUrlProperty.protocol;
		const values = omitHostOwnedSessionConfig(result.values);
		values[SessionConfigKey.Isolation] = iso.isolationValue;
		if (iso.branchProperty && iso.branchValue !== undefined) {
			values[SessionConfigKey.Branch] = iso.branchValue;
		}
		if (iso.worktreeBranchPrefixProperty && typeof params.config?.[SessionConfigKey.WorktreeBranchPrefix] === 'string') {
			values[SessionConfigKey.WorktreeBranchPrefix] = params.config[SessionConfigKey.WorktreeBranchPrefix];
		}
		const pullRequestUrl = getSessionPullRequestUrl(params.config);
		if (pullRequestUrl !== undefined) {
			values[SessionConfigKey.PullRequestUrl] = pullRequestUrl;
		}
		if (iso.worktreeIncludeFilesProperty
			&& Array.isArray(params.config?.[SessionConfigKey.WorktreeIncludeFiles])
			&& params.config[SessionConfigKey.WorktreeIncludeFiles].every(pattern => typeof pattern === 'string')) {
			values[SessionConfigKey.WorktreeIncludeFiles] = params.config[SessionConfigKey.WorktreeIncludeFiles];
		}
		if (iso.worktreeSymlinkFoldersProperty
			&& Array.isArray(params.config?.[SessionConfigKey.WorktreeSymlinkFolders])
			&& params.config[SessionConfigKey.WorktreeSymlinkFolders].every(pattern => typeof pattern === 'string')) {
			values[SessionConfigKey.WorktreeSymlinkFolders] = params.config[SessionConfigKey.WorktreeSymlinkFolders];
		}
		return { schema: { ...result.schema, properties }, values };
	}

	private _withAgentMergeConfigContribution(result: ResolveSessionConfigResult, config: Record<string, unknown> | undefined): ResolveSessionConfigResult {
		const values = { ...result.values };
		for (const key of [SessionConfigKey.AgentMerge, SessionConfigKey.AgentMergeController, SessionConfigKey.AgentMergeFolders, SessionConfigKey.AgentMergeControllerFolders, SessionConfigKey.AgentMergeInjectedConfiguration]) {
			if (config && Object.hasOwn(config, key)) {
				values[key] = config[key];
			}
		}
		return { ...result, values };
	}

	async sessionConfigCompletions(params: IAgentSessionConfigCompletionsParams): Promise<SessionConfigCompletionsResult> {
		// The host owns branch completions for every agent (they share the same
		// git-backed branch list); all other properties stay provider-specific.
		if (params.property === SessionConfigKey.Branch && this._worktree.supported) {
			return this._worktree.branchCompletions(params.workingDirectory);
		}
		const provider = this._providerService.resolveProvider(params.provider);
		if (!provider) {
			throw new Error(`No agent provider registered for: ${params.provider ?? '(none)'}`);
		}
		return provider.chatConfigCompletions(this._toProviderConfig(params));
	}

	async completions(params: CompletionsParams): Promise<CompletionsResult> {
		return this._completions.completions(params);
	}

	get automationCapabilities(): AutomationCapabilities | undefined {
		return this._automationService.capabilities;
	}

	async listAutomationTriggerDefinitions(params: ListAutomationTriggerDefinitionsParams): Promise<ListAutomationTriggerDefinitionsResult> {
		return this._automationService.listTriggerDefinitions(params);
	}

	async runAutomation(params: RunAutomationParams): Promise<RunAutomationResult> {
		return this._automationService.runAutomation(params);
	}

	async fetchAutomationRuns(params: FetchAutomationRunsParams): Promise<FetchAutomationRunsResult> {
		return this._automationService.fetchAutomationRuns(params);
	}

	async getCompletionTriggerCharacters(): Promise<readonly string[]> {
		return this._completions.triggerCharacters;
	}

	/**
	 * Disposes a session once a `createSession` for it that was requested
	 * earlier has settled, so the provider has registered what it must tear
	 * down. Creation never disposes its own session, so this cannot wait on itself.
	 */
	async disposeSession(session: URI): Promise<void> {
		this._logService.trace(`[AgentService] disposeSession: ${session.toString()}`);
		const creation = this._sessionCreationSequencer.peek(AgentSession.id(session));
		await this._sessionResidency.runDisposal(session, async () => {
			await creation?.catch(() => undefined);
			await this._doDisposeSession(session, 'delete');
		});
	}

	/**
	 * Automatic deletion: deletes the session when `validate` and `canCommit`
	 * agree. Its worktrees are removed later, and only while their branches
	 * are synced.
	 */
	async disposeSessionIf(session: URI, validate: () => Promise<boolean>, canCommit: () => boolean): Promise<boolean> {
		this._logService.trace(`[AgentService] disposeSessionIf: ${session.toString()}`);
		const creation = this._sessionCreationSequencer.peek(AgentSession.id(session));
		return this._sessionResidency.runDisposal(session, async () => {
			await creation?.catch(() => undefined);
			if (!await validate() || !canCommit()) {
				return false;
			}
			await this._doDisposeSession(session, 'synced');
			return true;
		});
	}

	async canAutomaticallyDeleteArchivedSession(session: URI): Promise<boolean> {
		if (!await this._worktree.canAutomaticallyDeleteArchivedSession(session)) {
			return false;
		}
		const additionalWorktrees = await readSessionAdditionalWorktrees(this._sessionStateStore, session);
		for (const worktree of additionalWorktrees) {
			if (!await this._worktree.canAutomaticallyDeleteDetachedWorktree(worktree.handle)) {
				return false;
			}
		}
		return true;
	}

	archiveSession(session: URI): void {
		const channel = session.toString();
		const action = {
			type: ActionType.SessionIsArchivedChanged,
			isArchived: true,
		} as const;
		this._additionalWorktreeLifecycleService.runWithAutomaticArchive(session, () => this._stateManager.dispatchServerAction(channel, action));
		this._sideEffects.handleAction(channel, action, undefined, AgentHostClientType.Unknown, undefined, true);
		this._queueCatalogSync(session, { [AH_META_IS_ARCHIVED_DB_KEY]: 'true' });
	}

	private async _doDisposeSession(session: URI, worktreeRemovalMode: Extract<WorktreeRemovalMode, 'delete' | 'synced'>): Promise<void> {
		const sessionKey = session.toString();
		const operationId = generateUuid();
		const stopWatch = StopWatch.create();
		const traceStage = (stage: string) => this._logService.trace(`[AgentService] disposeSession: ${sessionKey}, operationId=${operationId}, stage=${stage}, elapsedMs=${Math.round(stopWatch.elapsed())}`);
		this._cancelPendingSessionGc(session);
		this._sessionPrewarmer.onDraftEnded(session);
		this._stateManager.invalidateSessionChatResolutions(sessionKey);
		traceStage('readRegistration');
		const registered = await this._orchestratorDatabase.getSessionV2Registration(sessionKey);
		const provider = registered ? this._providerService.getProvider(registered.provider) : this._providerService.getProviderForSession(session);
		if (registered && !provider) {
			throw new Error(`No agent provider registered for: ${registered.provider}`);
		}
		if (registered && provider) {
			this._providerService.associateSession(session, registered.provider);
		}
		const catalogDeletionFence = this._catalogSyncService.beginSessionDeletion(session);
		let peerChatDeletionBegun = false;
		let sessionStateDeletion: { dispose(): void } | undefined;
		try {
			const isEphemeral = this._stateManager.isEphemeralSession(sessionKey);
			const isIdleProvisional = this._stateManager.isIdleProvisionalSession(sessionKey);
			const sessionChats = this._stateManager.getSessionState(session.toString())?.chats ?? [];
			for (const chat of sessionChats) {
				this._sideEffects.clearChannelTelemetry(chat.resource);
			}
			this._sideEffects.clearChannelTelemetry(session.toString());
			// Resolve the working directories up front and pass them explicitly:
			// the checkpoint and review services need them to locate the
			// repositories holding this session's refs, and reading them from
			// session state would silently break the moment `deleteSession` below
			// is reordered ahead of the data deletion.
			traceStage('readPeerChats');
			const [chatCatalog] = await this._orchestratorDatabase.readCatalogSnapshot([sessionKey]);
			if (chatCatalog?.authorityVersion === 2 && !chatCatalog.header?.defaultChatUri) {
				throw new Error(`Missing normalized default while deleting ${sessionKey}`);
			}
			const defaultChat = this._resolveDefaultChat(session, chatCatalog, undefined);
			const persistedPeerChats = await this._peerChatStore.tryRead(session);
			// Captured before tombstoning, which removes the session's central rows.
			const recordedChats = await this._readChatsForDeletion(session, chatCatalog, defaultChat, [
				...sessionChats.map(chat => chat.resource),
				...(persistedPeerChats?.map(chat => chat.uri) ?? []),
			]);
			const movedChatOrigins = await this._movedChatOriginsOf([...recordedChats.storage.keys()]);
			const configuredWorkingDirectories = [
				...(this._configurationService.getEffectiveWorkingDirectories(session.toString()) ?? []),
				...sessionChats.flatMap(chat => this._configurationService.getEffectiveWorkingDirectories(chat.resource) ?? []),
				...(persistedPeerChats?.flatMap(chat => chat.workingDirectories ?? []) ?? []),
			];
			const workingDirectories: string[] = [];
			for (const directory of configuredWorkingDirectories) {
				const uri = URI.parse(directory, true);
				if (!workingDirectories.some(existing => extUriBiasedIgnorePathCase.isEqual(URI.parse(existing, true), uri))) {
					workingDirectories.push(directory);
				}
			}
			traceStage('readAdditionalWorktrees');
			const additionalWorktrees = await readSessionAdditionalWorktrees(this._sessionStateStore, session);
			// The worktrees are removed in the background; deletion only records that, with the tombstone.
			traceStage('readWorktreeMetadata');
			const worktreeRemovals = await this._worktreeCleanup.prepareSessionDeletion(session, additionalWorktrees.map(worktree => worktree.handle), worktreeRemovalMode);
			const worktree = worktreeRemovals.find(removal => removal.kind === 'session');
			const candidateCleanupWorkingDirectoryUris = (worktree
				? [worktree.repositoryRoot, ...(workingDirectories?.slice(1) ?? [])]
				: workingDirectories ?? []).map(directory => URI.parse(directory, true));
			const cleanupWorkingDirectoryUris: URI[] = [];
			for (const directory of candidateCleanupWorkingDirectoryUris) {
				if (!cleanupWorkingDirectoryUris.some(existing => extUriBiasedIgnorePathCase.isEqual(existing, directory))) {
					cleanupWorkingDirectoryUris.push(directory);
				}
			}
			for (const additionalWorktree of additionalWorktrees) {
				const workingDirectory = URI.parse(additionalWorktree.workingDirectory, true);
				const repositoryRoot = URI.parse(additionalWorktree.repositoryRoot, true);
				const index = cleanupWorkingDirectoryUris.findIndex(directory => isEqual(directory, workingDirectory));
				if (index !== -1) {
					cleanupWorkingDirectoryUris[index] = repositoryRoot;
				} else if (!cleanupWorkingDirectoryUris.some(directory => isEqual(directory, repositoryRoot))) {
					cleanupWorkingDirectoryUris.push(repositoryRoot);
				}
			}
			const cleanupWorkingDirectories = cleanupWorkingDirectoryUris.length > 0
				? cleanupWorkingDirectoryUris.map(directory => directory.toString())
				: undefined;
			traceStage('drainPeerChatWrites');
			await this._peerChatStore.beginSessionDeletion(session);
			peerChatDeletionBegun = true;
			let chatsToDelete = this._orderSessionChatsForTeardown(session, [...recordedChats.storage.keys()], defaultChat);
			// Providers may read host-owned session metadata (including workspaceless) during disposal.
			traceStage('drainCatalogStateWrites');
			await this._whenBackgroundCatalogStateWritesIdle(sessionKey);
			traceStage('drainCatalogSync');
			await catalogDeletionFence.whenDrained;
			if (provider) {
				traceStage('disposeProviderChats');
				const disposed = await this._disposeSession(provider, session, persistedPeerChats, defaultChat, recordedChats.privateChats);
				chatsToDelete = this._orderSessionChatsForTeardown(session, [...disposed.map(chat => chat.toString()), ...recordedChats.storage.keys()], defaultChat);
			}
			traceStage('drainSessionState');
			const stateDeletion = this._sessionStateStore.beginDeletion(session);
			sessionStateDeletion = stateDeletion;
			await stateDeletion.whenDrained;
			if (!isEphemeral) {
				traceStage('tombstone');
				await this._retryRegistryMutation(
					() => this._sessionRegistry.tombstone(session, worktreeRemovals),
					`unregistration for ${session.toString()}`,
				);
			} else {
				for (const removal of worktreeRemovals) {
					await this._orchestratorDatabase.upsertPendingWorktreeRemoval(removal);
				}
			}
			// Also when the session records no removal: it may have kept another session's worktree in use.
			this._worktreeCleanup.schedule();
			// The sessions it shared worktrees with may no longer share them: their older-build copy follows (Block 5).
			const sharedWorktrees = worktreeRemovals.filter(removal => removal.kind === 'coOwned').map(removal => removal.worktreePath);
			for (const coOwner of await this._worktreeCoOwnership.sessionsSharing(sharedWorktrees).catch(() => [])) {
				this._peerChatStore.scheduleOlderBuildCopyPublish(coOwner);
			}
			if (!isIdleProvisional) {
				this._invalidateSessionList();
			}
			if (provider) {
				this._providerService.releaseSession(session.toString());
				this._clearDownloadProgressInterest(session.toString());
			}
			this._sideEffects.clearSessionTitleState(session.toString(), sessionChats.map(chat => chat.resource));
			this._chatContributions.disposeSessionState(session.toString());
			traceStage('drainSessionData');
			await this._whenSessionDataIdle(session);
			traceStage('deleteChatData');
			await this._deleteChatStorage(session, chatsToDelete.map(chat => ({
				chat,
				storage: recordedChats.storage.get(chat.toString()) ?? creationTimeChatStorageResource(sessionKey, chat.toString(), defaultChat),
			})));
			// Remove the VS Code per-session data directory (metadata DB + checkpoints) to mirror the SDK-side cleanup
			// performed by the provider above. No-op when the directory does not exist.
			//
			// Subscribers of the will-delete event drop this session's git refs
			// in the repositories of `cleanupWorkingDirectories`, which name a
			// worktree's repository rather than the worktree, so the refs never
			// depend on the worktree folder the clean-up removes later.
			traceStage('deleteSessionData');
			// Checked after the tombstone, so a chat deleted concurrently either still counts here or sees this session deleted.
			if (await this._isAttachmentOrigin(sessionKey)) {
				await this._sessionDataService.deleteSessionDataExcept(session, [SESSION_ATTACHMENTS_DIRNAME], cleanupWorkingDirectories);
			} else {
				await this._sessionDataService.deleteSessionData(session, cleanupWorkingDirectories);
			}
			this._worktree.forgetSession(AgentSession.id(session));
			this._stateManager.forgetMovedChatOrigins(recordedChats.storage.keys());
			await this._releaseOriginAttachments(movedChatOrigins);
			this._changesetCoordinator.onSessionDisposed(session.toString());
			this._sideEffects.clearInputRequestsForSession(session.toString());
			// Remove all subagent sessions for this parent
			this._sideEffects.removeSubagentSessions(session.toString());
			this._stateManager.deleteSession(session.toString());
			this._pendingPassiveCatalogReplays.delete(sessionKey);
			this._externalReconciliationModifiedAt.delete(sessionKey);
			// The durable marker is dropped with the registration itself; keep the
			// mirror listing reads in step with it.
			this._provisionalSessionKeys.delete(sessionKey);
			if (isEphemeral) {
				traceStage('clearEphemeralTombstone');
				await this._retryRegistryMutation(
					() => this._sessionRegistry.clearTombstone(session),
					`clearing ephemeral session tombstone for ${session.toString()}`,
				);
			}
		} finally {
			if (peerChatDeletionBegun) {
				this._peerChatStore.endSessionDeletion(session);
			}
			catalogDeletionFence.dispose();
			sessionStateDeletion?.dispose();
		}
		traceStage('complete');
	}

	private async _whenBackgroundCatalogStateWritesIdle(sessionKey: string): Promise<void> {
		while (true) {
			const write = this._backgroundCatalogStateWrites.get(sessionKey);
			const passiveWrite = this._backgroundPassiveSessionMetadataWrites.get(sessionKey);
			if (!write && !passiveWrite) {
				return;
			}
			await Promise.allSettled([
				...(write ? [write.promise] : []),
				...(passiveWrite ? [passiveWrite.promise] : []),
			]);
		}
	}

	private async _whenSessionDataIdle(session: URI): Promise<void> {
		await this._peerChatStore.whenSessionIdle(session);
		await this._whenBackgroundCatalogStateWritesIdle(session.toString());
		const ref = this._sessionDataService.openDatabase(session);
		try {
			// A released session's pending older-build copy is published while its database is still held.
			await this._peerChatStore.releaseSession(session, ref);
			await ref.object.whenIdle();
		} finally {
			ref.dispose();
		}
	}

	/**
	 * Resolves a retained (non-PTY) terminal link through the chat it names:
	 * the chat's current owner and its recorded storage. The `session` and
	 * `storage` the link embeds are written for older builds only and are
	 * never read here, so a link keeps opening after its chat changes owner.
	 */
	private async _resolveRetainedTerminalState(
		resource: URI,
		parsed: INonPtyShellTerminalUri,
		restoreSession: (session: URI) => Promise<void>,
		restorationSource: (session: URI) => Promise<IAgentHostCredentialSource | undefined>,
	): Promise<TerminalState | undefined> {
		const chatKey = parsed.chat.toString();
		if (!isAhpChatChannel(chatKey)) {
			return undefined;
		}
		const chatOwner = await this._resolveChatOwnerAfterMoves(chatKey);
		if (!chatOwner) {
			return undefined;
		}
		const owner = URI.parse(chatOwner.owner);
		await this._restoreChatOwnerSession(chatOwner.owner, restoreSession, restorationSource);
		const credentials = this._authService.getSessionCredentialPrincipal(chatOwner.owner) ? await restorationSource(owner) : undefined;
		let chat = this._stateManager.getChatState(chatKey);
		if (!chat) {
			await this._stateManager.resolveChatState(chatKey, credentials);
			chat = this._stateManager.getChatState(chatKey);
		}
		if (!chat && chatOwner.spawnedBy !== undefined) {
			await this._restoreSubagentChat(chatKey, owner, chatOwner.spawnedBy.toolCallId, credentials);
			chat = this._stateManager.getChatState(chatKey);
		}
		if (!chat) {
			return undefined;
		}
		// Read the owner again: restoring may have taken a while, and the chat is reported under its owner now.
		const currentOwner = this._chatOwnership.getChatOwner(chatKey) ?? chatOwner.owner;
		const storage = URI.parse(this._chatOwnership.resolveChatStorageResource(currentOwner, chatKey));

		const terminal = findNonPtyTerminalContent(chat, parsed.toolCallId, resource);
		if (!terminal?.result) {
			return undefined;
		}

		let storedOutput: Uint8Array | undefined;
		const database = await this._sessionDataService.tryOpenDatabase(storage);
		try {
			storedOutput = await database?.object.readTerminalOutput(parsed.toolCallId);
		} finally {
			database?.dispose();
		}
		if (terminal.result.truncated === true && storedOutput === undefined) {
			return undefined;
		}
		const output = storedOutput === undefined
			? terminal.result.preview ?? ''
			: VSBuffer.wrap(storedOutput).toString();
		return {
			title: terminal.title,
			content: output ? [{ type: 'unclassified', value: output }] : [],
			lifecycle: terminal.result.exitCode === undefined
				? { status: TerminalLifecycleStatus.Exited }
				: { status: TerminalLifecycleStatus.Exited, exitCode: terminal.result.exitCode },
			claim: {
				kind: TerminalClaimKind.Session,
				session: currentOwner,
				chat: chatKey,
				toolCallId: parsed.toolCallId,
			},
			isPty: false,
		};
	}

	// ---- Protocol methods ---------------------------------------------------

	async createTerminal(params: CreateTerminalParams, clientType = AgentHostClientType.Unknown): Promise<void> {
		await this._terminalManager.createTerminal(params, {
			vscodeTerminalIdentity: clientType !== AgentHostClientType.Unknown,
		});
	}

	async disposeTerminal(terminal: URI): Promise<void> {
		this._terminalManager.disposeTerminal(terminal.toString());
	}

	async subscribe(resource: URI, clientId: string, isActive?: () => boolean, credentials?: IAgentHostCredentialSource, telemetryContext?: IAgentHostSessionSubscribeTelemetryContext): Promise<IStateSnapshot> {
		if (resource.scheme === AHP_CANVAS_SCHEME) {
			if (this._store.isDisposed || (isActive && !isActive())) {
				throw new Error(`Subscription cancelled: ${resource.toString()}`);
			}
			await this._sessionResidency.waitForRelease(resource);
			if (this._store.isDisposed || (isActive && !isActive())) {
				throw new Error(`Subscription cancelled: ${resource.toString()}`);
			}
			const snapshot = this._stateManager.getSnapshot(resource.toString());
			if (!snapshot) {
				throw new ProtocolError(AhpErrorCodes.NotFound, `Canvas is no longer available: ${resource.toString()}`);
			}
			this.addSubscriber(resource, clientId);
			return snapshot;
		}
		this._logService.trace(`[AgentService] subscribe: ${resource.toString()}`);
		const resourceStr = resource.toString();
		const subscribe = async (telemetry: IAgentHostSessionOpenTelemetryScope): Promise<IStateSnapshot> => {
			const restorationSource = async (session: URI): Promise<IAgentHostCredentialSource | undefined> => {
				await this._restoreCredentialPrincipal(session.toString());
				if (!this._authService.getSessionCredentialPrincipal(session.toString())) {
					return undefined;
				}
				this._checkCredentialPrincipal(session.toString(), credentials);
				return credentials;
			};
			const restoreSession = async (session: URI) => {
				let restorationCredentials: IAgentHostCredentialSource | undefined;
				if (!this._isSessionRestored(session.toString())) {
					restorationCredentials = await restorationSource(session);
				}
				return this.restoreSession(session, joinedRestore => telemetry.restoreStarted(joinedRestore), restorationCredentials);
			};
			const restoreChangesetOwner = async (owner: string, session: string | undefined): Promise<string | undefined> => {
				const containing = session ?? (await this._resolveChatOwnerAfterMoves(owner))?.owner;
				if (containing === undefined) {
					this._logService.trace(`[AgentService] subscribe: no owner recorded for changeset owner ${owner}`);
				} else if (!this._isSessionRestored(containing)) {
					await restoreSession(URI.parse(containing));
				}
				return containing;
			};
			await this._sessionResidency.waitForRelease(resource);
			if (this._store.isDisposed || (isActive && !isActive())) {
				throw new Error(`Subscription cancelled: ${resourceStr}`);
			}
			// Register after an in-flight release settles so a successful release
			// can evict cached state and this subscribe reconstructs it. The
			// handshake fast path calls addSubscriber directly and therefore pins
			// its already-returned snapshot instead.
			this.addSubscriber(resource, clientId);
			// Check for terminal state
			const terminalState = this._terminalManager.getTerminalState(resourceStr);
			if (terminalState) {
				telemetry.setServedFromMemory(true);
				return { resource: resourceStr, state: terminalState, fromSeq: this._stateManager.serverSeq };
			}
			const parsedRetainedTerminal = parseNonPtyShellTerminalUri(resource);
			if (parsedRetainedTerminal) {
				const retainedTerminalState = await this._resolveRetainedTerminalState(resource, parsedRetainedTerminal, restoreSession, restorationSource);
				if (!retainedTerminalState) {
					throw new Error(`Cannot subscribe to unknown resource: ${resourceStr}`);
				}
				// The link is routed by its chat's owner, which can differ from the session it embeds.
				const terminalOwner = this._chatOwnership.getChatOwner(parsedRetainedTerminal.chat.toString());
				if (terminalOwner !== undefined) {
					this._subscriptions.setSubscriptionOwner(resource, terminalOwner);
				}
				telemetry.restoreCompleted();
				return { resource: resourceStr, state: retainedTerminalState, fromSeq: this._stateManager.serverSeq };
			}

			let snapshot = this._stateManager.getSnapshot(resourceStr);
			telemetry.setServedFromMemory(!!snapshot);
			const parsedChangeset = parseChangesetUri(resourceStr);
			if (snapshot && parsedChangeset) {
				await this._changesetCoordinator.restoreSessionIfChangesetSubscription(resource, restoreChangesetOwner);
				snapshot = this._stateManager.getSnapshot(resourceStr);
			}
			const parsedAnnotations = parseAnnotationsUri(resourceStr);
			if (snapshot && parsedAnnotations) {
				await this._ensureAnnotationsRestored(parsedAnnotations.sessionUri);
				snapshot = this._stateManager.getSnapshot(resourceStr);
			}
			let chatOwner: IChatOwnerResolution | undefined;
			if (!snapshot && !parsedChangeset && isAhpChatChannel(resourceStr)) {
				// The chat snapshot only materializes once its owning session is
				// restored (which seeds the default chat state), so restore the
				// owner rather than the chat itself. This makes the chat-channel
				// subscribe self-sufficient and independent of whether the
				// session channel was subscribed first.
				chatOwner = await this._resolveChatOwnerAfterMoves(resourceStr);
				if (chatOwner !== undefined) {
					telemetry.setSession(URI.parse(chatOwner.owner));
					this._subscriptions.setSubscriptionOwner(resource, chatOwner.owner);
					this._cancelPendingSessionGc(URI.parse(chatOwner.owner));
					await this._restoreChatOwnerSession(chatOwner.owner, restoreSession, restorationSource);
					snapshot = this._stateManager.getSnapshot(resourceStr);
				} else {
					this._logService.trace(`[AgentService] subscribe: no owner recorded for chat ${resourceStr}`);
				}
			}
			if (!snapshot && !parsedChangeset && isAhpChatChannel(resourceStr)) {
				let restorationCredentials: IAgentHostCredentialSource | undefined;
				if (chatOwner && this._authService.getSessionCredentialPrincipal(chatOwner.owner)) {
					restorationCredentials = await restorationSource(URI.parse(chatOwner.owner));
				}
				await this._stateManager.resolveChatState(resourceStr, restorationCredentials);
				this._changesetCoordinator.onChatAvailable(resourceStr);
				snapshot = this._stateManager.getSnapshot(resourceStr);
			}
			if (!snapshot) {
				const subagentOwner = isAhpChatChannel(resourceStr) ? chatOwner ?? await this._chatOwnership.resolveChatOwner(resourceStr) : undefined;
				if (this._pendingSubagentChats.has(resourceStr) || subagentOwner?.spawnedBy !== undefined) {
					snapshot = await this._awaitPendingSubagentChat(resourceStr);
					if (!snapshot && subagentOwner?.spawnedBy !== undefined) {
						telemetry.setSession(URI.parse(subagentOwner.owner));
						const owner = URI.parse(subagentOwner.owner);
						await this._restoreSubagentChat(resourceStr, owner, subagentOwner.spawnedBy.toolCallId, await restorationSource(owner));
						snapshot = this._stateManager.getSnapshot(resourceStr);
					}
				} else {
					// Changeset URIs are routed through the coordinator (which
					// owns its URI shape, the unknown-id early throw, and turn
					// / static seeding). Other URIs fall through to the
					// subagent / session-default path below.
					const handled = await this._changesetCoordinator.tryHandleSubscribe(resource, restoreChangesetOwner);
					if (handled) {
						snapshot = this._stateManager.getSnapshot(resourceStr);
					} else {
						// Try subagent restore before regular session restore
						const parsedSubagent = parseSubagentSessionUri(resource);
						if (parsedSubagent) {
							await this._restoreSubagentSession(resourceStr, parsedSubagent.parentSession, await restorationSource(parsedSubagent.parentSession));
						} else if (!isAhpChatChannel(resourceStr)) {
							await restoreSession(resource);
						}
						snapshot = this._stateManager.getSnapshot(resourceStr);
					}
				}
			}
			if (!snapshot) {
				throw new Error(`Cannot subscribe to unknown resource: ${resourceStr}`);
			}
			if (this._store.isDisposed || (isActive && !isActive())) {
				throw new Error(`Subscription cancelled: ${resourceStr}`);
			}
			this._recordSubscriptionOwner(resource);
			this._sessionResidency.touch(resource);
			void this._sessionResidency.reconcile();
			this._watchChatUpdates(resource);
			if (isAhpChatChannel(resourceStr)) {
				await this._chatInputService.prepareChat(resource);
				if (this._store.isDisposed || (isActive && !isActive())) {
					throw new Error(`Subscription cancelled: ${resourceStr}`);
				}
				snapshot = this._stateManager.getSnapshot(resourceStr);
				if (!snapshot) {
					throw new Error(`Chat removed while subscribing: ${resourceStr}`);
				}
			}

			// Ensure git state has been computed for this session. When the snapshot
			// already existed (e.g. seeded by list query, or restored earlier), the
			// restore path that normally calls `_attachGitState` is skipped — so
			// trigger it lazily here for the first subscriber. `_attachGitState`
			// is async and updates `_meta.git` once ready, which clients see via
			// the normal state-update stream. State that does not describe a
			// usable checkout counts as missing too: a failed probe can persist
			// a branch-less remnant, and it would otherwise mask the very
			// repair this lazy refresh exists to perform.
			const sessionState = this._stateManager.getSessionState(resourceStr);
			if (!parsedChangeset && sessionState && !isAhpChatChannel(resourceStr)) {
				this._changesetCoordinator.ensureSessionSubscription(resourceStr);
			}
			if (!parsedChangeset && !isAhpChatChannel(resourceStr) && sessionState && needsSessionGitStateRefresh(readSessionGitState(sessionState._meta))) {
				const workingDirectory = sessionState.workingDirectories?.[0]
					? URI.parse(sessionState.workingDirectories[0])
					: undefined;
				void this._gitStateService.refreshSessionGitState(resourceStr, workingDirectory);
			}

			this._logService.trace(`[AgentService] subscribe done: ${resourceStr} (servedFromMemory=${telemetry.servedFromMemory})`);
			telemetry.restoreCompleted();
			return snapshot;
		};
		try {
			return await this._sessionOpenTelemetry.withSubscription(resource, subscribe, telemetryContext, () => !this._store.isDisposed && (isActive?.() ?? true));
		} catch (error) {
			const subscriptionIsActive = isActive?.() ?? true;
			if (subscriptionIsActive) {
				this.unsubscribe(resource, clientId);
			}
			// When inactive, the protocol handler already removed this request's
			// registration. Do not let an older request clean up a newer one.
			throw error;
		}
	}

	/** Maps a subscribable resource to its owning session; a chat resolves through the live registry only. */
	private readonly _getChatOwner = (chat: string) => this._chatOwnership.getChatOwner(chat);

	/** Records the registry owner of a subscribed chat while the chat is still registered. */
	private _recordSubscriptionOwner(resource: URI): void {
		const session = this._resolveResourceSession(resource);
		if (session) {
			this._subscriptions.setSubscriptionOwner(resource, session.toString());
		}
	}

	private _resolveResourceSession(resource: URI): URI | undefined {
		return resolveAgentHostSession(resource, this._getChatOwner);
	}

	/** Waits for an armed subagent chat to register (or its wait to time out); returns `undefined` if not armed or never registered. */
	private async _awaitPendingSubagentChat(subagentChatUri: string): Promise<IStateSnapshot | undefined> {
		const pending = this._pendingSubagentChats.get(subagentChatUri);
		if (!pending) {
			return undefined;
		}
		await pending.p;
		return this._stateManager.getSnapshot(subagentChatUri);
	}

	addSubscriber(resource: URI, clientId: string): void {
		// A new subscriber means the session is being observed again; cancel
		// any pending GC armed while it had no subscribers.
		this._cancelPendingSessionGc(resource);
		this._cancelPendingEphemeralSessionGc(resource);
		// 0→1 transition — covers both the full subscribe path AND the
		// handshake fast-path used by `ProtocolServerHandler` when state is
		// already cached. The coordinator decides whether the URI is one
		// it cares about (e.g. uncommitted changeset → trigger refresh).
		const firstSubscriber = this._subscriptions.addSubscriber(resource, clientId);
		this._recordSubscriptionOwner(resource);
		if (firstSubscriber) {
			this._changesetCoordinator.onFirstSubscriber(resource);
			this._watchChatUpdates(resource);
		}
		this._sessionResidency.touch(resource);
	}

	unsubscribe(resource: URI, clientId: string): void {
		if (this._store.isDisposed) {
			return;
		}
		// Captured before the subscription is dropped: the chat may already have left the registry.
		const session = this._subscriptions.resolveSubscribedSession(resource);
		if (!this._subscriptions.removeSubscriber(resource, clientId)) {
			return;
		}
		this._chatWatches.deleteAndDispose(resource);
		this._chatWatchOwners.delete(resource);
		this._pendingChatHistories.delete(resource.toString());
		if (isAhpChatChannel(resource.toString()) && session) {
			this._chatInputService.clear(session.toString(), resource.toString());
		}
		this._changesetCoordinator.onLastSubscriber(resource);
		this._stateManager.onChangesetLivenessChanged();
		if (!session) {
			this._logService.trace(`[AgentService] unsubscribe: no owner recorded for ${resource.toString()}`);
		} else if (this._maybeScheduleEphemeralSessionGc(session)) {
			return;
		} else {
			// Annotation subscribers block destructive GC, but must not suppress residency reconciliation.
			this._maybeScheduleSessionGc(session);
		}
		void this._sessionResidency.reconcile();
	}

	private _watchChatUpdates(chat: URI): void {
		if (!isAhpChatChannel(chat.toString()) || !this._subscriptions.hasSubscribers(chat) || !this._stateManager.getChatState(chat.toString()) || this._chatWatches.has(chat)) {
			return;
		}
		const owner = this._chatOwnership.requireChatOwner(chat.toString());
		const provider = this._providerService.getProviderForSession(URI.parse(owner));
		if (provider?.watchChatHistory || provider?.watchChatBackgroundWork) {
			const watches = new DisposableStore();
			this._chatWatches.set(chat, watches);
			this._chatWatchOwners.set(chat, owner);
			const history = provider.watchChatHistory?.(chat);
			if (history) {
				watches.add(history);
			}
			const backgroundWork = provider.watchChatBackgroundWork?.(chat, () => this._stateManager.getChatState(chat.toString())?.backgroundWork ?? []);
			if (backgroundWork) {
				watches.add(backgroundWork);
			}
		}
	}

	/**
	 * Schedules full cleanup for a throwaway surface after all its session and
	 * chat subscriptions are gone, regardless of whether it has completed turns.
	 */
	private _maybeScheduleEphemeralSessionGc(session: URI): boolean {
		const sessionKey = session.toString();
		if (!this._stateManager.isEphemeralSession(sessionKey)) {
			return false;
		}
		if (this._subscriptions.hasSessionSubscribers(session)) {
			return true;
		}
		this._pendingSessionGc.set(session, disposableTimeout(() => {
			this._pendingSessionGc.deleteAndDispose(session);
			void this._runEphemeralSessionGc(session).catch(err => {
				this._logService.error(err, `[AgentService] GC failed for ephemeral session ${sessionKey}`);
			});
		}, SESSION_GC_GRACE_MS));
		return true;
	}

	/**
	 * If `resource` names a session that no client is still subscribed to and
	 * that has produced no turns (and has no active turn), schedule a delayed
	 * {@link _runSessionGc} to fully tear it down — provider session, worktree,
	 * persisted state and all. Sessions with at least one turn are left to the
	 * residency path which only drops cached
	 * state and lets the session be restored from disk later.
	 *
	 * GC is restricted to sessions that are still unused drafts. A session that
	 * was restored from durable storage, or that has ever had a turn, is never
	 * a candidate however empty it looks now — an empty state is also what a
	 * failed history load and a truncate-to-zero leave behind.
	 *
	 * The delay ({@link SESSION_GC_GRACE_MS}) gives a disconnected client time
	 * to reconnect or a workspace switch to settle. Any subsequent subscribe
	 * (or createSession on the same URI) cancels the timer via
	 * {@link _cancelPendingSessionGc}.
	 */
	private _maybeScheduleSessionGc(session: URI): void {
		if (this._subscriptions.hasSessionSubscribers(session)) {
			return;
		}
		const key = session.toString();
		const state = this._stateManager.getSessionState(key);
		if (!state) {
			return;
		}
		if (state.turns.length > 0 || state.activeTurn !== undefined) {
			return;
		}
		if (this._stateManager.isUnusedDraft(key) !== true) {
			this._logService.trace(`[AgentService] Skipping GC for session that is not an unused draft: ${key}`);
			return;
		}
		// Never tear down a session Agent Merge is holding.
		if (this._agentMergeController.holdsSession(key)) {
			return;
		}
		this._pendingSessionGc.set(session, disposableTimeout(() => {
			this._pendingSessionGc.deleteAndDispose(session);
			this._runSessionGc(session).catch(err => {
				this._logService.error(err, `[AgentService] GC failed for ${key}`);
			});
		}, SESSION_GC_GRACE_MS));
	}

	private _cancelPendingSessionGc(resource: URI): void {
		const session = this._resolveResourceSession(resource);
		if (session) {
			this._pendingSessionGc.deleteAndDispose(session);
		}
	}

	private _cancelPendingEphemeralSessionGc(resource: URI): void {
		const session = this._resolveResourceSession(resource);
		if (session && this._stateManager.isEphemeralSession(session.toString())) {
			this._pendingSessionGc.deleteAndDispose(session);
		}
	}

	private async _runEphemeralSessionGc(session: URI): Promise<void> {
		if (this._subscriptions.hasSessionSubscribers(session)) {
			return;
		}
		this._logService.info(`[AgentService] GC: disposing unsubscribed ephemeral session ${session.toString()}`);
		await this.disposeSession(session);
	}

	/**
	 * Fires {@link SESSION_GC_GRACE_MS} after a session lost its last
	 * subscriber while empty. Re-checks the invariants (still no subscribers,
	 * still empty, still an unused draft) before tearing the session down via
	 * {@link disposeSession}. The cached state may already have been evicted by
	 * residency reconciliation; in that case we still proceed because
	 * "evicted + no resubscribe" implies no client is observing the session.
	 */
	private async _runSessionGc(resource: URI): Promise<void> {
		const key = resource.toString();
		if (this._subscriptions.hasSessionSubscribers(resource)) {
			return;
		}
		const state = this._stateManager.getSessionState(key);
		if (state && (state.turns.length > 0 || state.activeTurn !== undefined)) {
			return;
		}
		// The session may have been rehydrated or used during the grace window.
		// An *absent* entry means it was evicted and never came back, which is
		// still a valid target — so only an explicit non-draft aborts.
		if (this._stateManager.isUnusedDraft(key) === false) {
			this._logService.trace(`[AgentService] GC aborted, session is no longer an unused draft: ${key}`);
			return;
		}
		this._logService.info(`[AgentService] GC: disposing empty unsubscribed session ${key}`);
		await this.disposeSession(resource);
	}

	private _evictSessionState(evictionTarget: URI, evictionTargetKey: string, triggerKey: string, chats: readonly string[]): void {
		this._logService.info(`[AgentService] Evicting idle session: ${evictionTargetKey} (triggered by unsubscribe of ${triggerKey})`);
		const subagentPrefix = buildSubagentSessionUriPrefix(evictionTarget);
		for (const cachedKey of this._stateManager.getSessionUrisWithPrefix(subagentPrefix)) {
			this._stateManager.removeSession(cachedKey);
		}
		this._sideEffects.clearSessionTitleState(evictionTargetKey, chats);
		this._chatContributions.disposeSessionState(evictionTargetKey);
		this._stateManager.removeSession(evictionTargetKey);
	}

	/** Returns true when a changeset is safe to drop from the in-memory cache. */
	private _canEvictChangeset(changeset: string): boolean {
		const changesetUri = URI.parse(changeset);
		// A direct changeset subscriber is rendering this expanded URI. Keep
		// the state alive so future envelopes still target an existing object.
		if (this._subscriptions.hasSubscribers(changesetUri)) {
			return false;
		}
		const parsed = parseChangesetUri(changeset);
		// This guard only handles recognized changeset URIs; leave anything else alone.
		if (!parsed) {
			return false;
		}
		const containingSession = changesetSession(parsed, chat => this._chatOwnership.getChatOwner(chat));
		// A changeset whose chat is no longer registered has no session left to pin it.
		if (containingSession === undefined) {
			return true;
		}
		const sessionUri = URI.parse(containingSession);
		// A parent-session subscriber can still receive catalogue count updates
		// from this changeset, so keep the backing state while the session is observed.
		if (this._subscriptions.hasSubscribers(sessionUri)) {
			return false;
		}
		// Subagent views are backed by the parent session tree; treat any
		// subscribed descendant as a parent-session pin for cache eviction.
		for (const subscribedUri of this._subscriptions.subscribedResources) {
			if (this._isSubagentDescendantOf(subscribedUri, sessionUri)) {
				return false;
			}
		}
		// If a git/session/uncommitted changeset recompute is currently running for this changeset URI,
		// do not evict its cached state yet. Once the compute is done,
		// it is safe to evict because the state is just a cache and can be recreated later.
		return !this._changesets.isStaticChangesetComputeActive(changeset);
	}

	/**
	 * Restores the session that owns a chat, as recorded by the ownership
	 * service. A legacy subagent session (older data only) is restored
	 * through the parent session its URI names.
	 */
	private async _restoreChatOwnerSession(owner: string, restoreSession: (session: URI) => Promise<void>, restorationSource: (session: URI) => Promise<IAgentHostCredentialSource | undefined>): Promise<void> {
		if (this._isSessionRestored(owner)) {
			return;
		}
		const ownerUri = URI.parse(owner);
		const legacySubagent = parseSubagentSessionUri(ownerUri);
		if (legacySubagent) {
			await this._restoreSubagentSession(owner, legacySubagent.parentSession, await restorationSource(legacySubagent.parentSession));
		} else {
			await restoreSession(ownerUri);
		}
	}

	/**
	 * Whether `session` is restored in full: loaded, and not with its data only for a move (C15). A session a move holds
	 * is restored by {@link restoreSession} once the move ends, so a caller that would use its state restores it instead.
	 *
	 * Sites still reading loaded state directly, on purpose: archiving and read/archive toggles
	 * ({@link archiveSession}, the saved-chat archive and {@link _queuePassiveMetadataUpdate}) apply to the state a
	 * move loaded, which only persists them and is dropped when the move ends; canvases, which a session loaded for a
	 * move never presents; and the guards of work only a restore queues (subagent admission retries).
	 */
	private _isSessionRestored(session: string): boolean {
		return !!this._stateManager.getSessionState(session) && !this._sessionResidency.isSessionHeldForMove(session);
	}

	/**
	 * The recorded owner of `chat` once no move holds it (C15). A move holds the sessions it loads with their data only
	 * until it ends, and may change the chat's owner meanwhile, so the owner is read again after it.
	 */
	private async _resolveChatOwnerAfterMoves(chat: string): Promise<IChatOwnerResolution | undefined> {
		let resolution = await this._chatOwnership.resolveChatOwner(chat);
		while (resolution && this._sessionResidency.isHeldForMove(URI.parse(resolution.owner))) {
			await this._sessionResidency.waitForRelease(URI.parse(resolution.owner));
			resolution = await this._chatOwnership.resolveChatOwner(chat);
		}
		return resolution;
	}

	private _isSubagentDescendantOf(resource: URI, parent: URI): boolean {
		let parsed = parseSubagentSessionUri(resource);
		while (parsed) {
			if (isEqual(parsed.parentSession, parent)) {
				return true;
			}
			parsed = parseSubagentSessionUri(parsed.parentSession);
		}
		return false;
	}

	/**
	 * Per-client sequencer that serialises action dispatches whose
	 * processing requires an asynchronous prelude (e.g. resolving a restored
	 * peer chat or snapshotting user-message attachments before the action is
	 * reduced into state). Actions that don't need any asynchronous prelude
	 * bypass the queue entirely as long as no earlier action from the same
	 * client is still pending.
	 *
	 * todo@connor4312: we can drop this when sending a message become a command
	 */
	private readonly _clientDispatchQueues = new Map<string, Promise<void>>();

	/**
	 * Runs `apply` for an unloaded session inside {@link _passiveMetadataSequencer}.
	 * Returns `'live'` instead when the session is resident, after waiting for a
	 * restore that started before `apply` could run: that restore may have read
	 * the state before this update, so the caller applies it to live state.
	 */
	private async _queuePassiveMetadataUpdate<T>(session: string, apply: () => Promise<T>): Promise<T | 'live'> {
		while (true) {
			const result = await this._passiveMetadataSequencer.queue(session, async (): Promise<T | 'live' | 'retry'> => {
				if (this._stateManager.getSessionState(session)) {
					return 'live';
				}
				// A restore already past its drain reads the state this update would write.
				return this._restoreSessionInFlight.has(session) ? 'retry' : apply();
			});
			if (result !== 'retry') {
				return result;
			}
			await this._restoreSessionInFlight.get(session)?.catch(() => undefined);
		}
	}

	/**
	 * Applies a read/archive toggle to a session that is not currently
	 * materialized, by writing the flag to the session database and publishing
	 * the catalogue delta on the root channel.
	 *
	 * Restoring instead cannot work: restore reopens the working directory, and
	 * for a missing one only an *already* archived session resumes read-only —
	 * so archiving, the very thing that would archive it, could never land.
	 *
	 * Returns the accepted action with any aggregate read clamp, or `undefined`
	 * for an unknown session, which the caller must drop: creating
	 * `agentSessionData/<id>` is how Agent Host claims ownership,
	 * never a side effect of a metadata toggle. Callers must rule out live state
	 * first, so an absent surfaced summary can only mean "unknown".
	 */
	private async _isRegisteredAdoptableSession(session: URI): Promise<boolean> {
		const row = await this._orchestratorDatabase.getSessionV2(session.toString());
		if (!row) {
			return false;
		}
		const decoded = decodeAgentHostCatalogPayload(row.payload);
		return decoded.ok && readSessionEhcliAdoptable(decoded.value.data._meta);
	}

	private async _applyPassiveSessionMetadata(session: string, action: IIsArchivedChangedAction | IIsReadChangedAction): Promise<IIsArchivedChangedAction | IIsReadChangedAction | undefined> {
		const summary = this._stateManager.getSurfacedSessionSummary(session);
		if (!summary) {
			return undefined;
		}
		const sessionUri = URI.parse(session);
		const [key, flag, requestedSet] = action.type === ActionType.SessionIsArchivedChanged
			? [AH_META_IS_ARCHIVED_DB_KEY, SessionStatus.IsArchived, action.isArchived] as const
			: [AH_META_IS_READ_DB_KEY, SessionStatus.IsRead, action.isRead] as const;
		const aggregateChats = action.type === ActionType.SessionIsReadChanged
			? summary.chats?.filter(chat => isChatInSessionReadAggregate(chat.resource, chat.origin, chat.interactivity)) ?? []
			: [];
		const set = requestedSet && aggregateChats.length > 1 && aggregateChats.some(chat => chat.status !== undefined && !isSessionStatusRead(chat.status))
			? false
			: requestedSet;
		const soleChat = aggregateChats.length === 1 ? aggregateChats[0] : undefined;
		await persistSessionMetadataValues(this._sessionStateStore, session, {
			[key]: set ? 'true' : '',
			...(action.type === ActionType.SessionIsArchivedChanged && !action.isArchived ? { [AH_META_AUTO_ARCHIVED_AT_DB_KEY]: '' } : {}),
		});
		// A concurrent passive update may have changed the summary while this one was persisting.
		const current = this._stateManager.getSurfacedSessionSummary(session) ?? summary;
		if (soleChat) {
			void this._peerChatStore.setRead(sessionUri, URI.parse(soleChat.resource), set).catch(error =>
				this._logService.error(error, `[AgentService] Failed to persist passive chat read state for ${soleChat.resource}`));
		}
		this._invalidateSessionList();
		const chats = soleChat
			? current.chats?.map(chat => chat.resource === soleChat.resource
				? { ...chat, status: withSessionStatusFlag(chat.status ?? current.status, SessionStatus.IsRead, set) }
				: chat)
			: undefined;
		this._stateManager.setSurfacedSessionStatusAndChats(session, withSessionStatusFlag(current.status, flag, set), chats);
		const payloadDirty = this._markCatalogPayloadDirty(session);
		this._queuePassiveSessionMetadataSynchronization(sessionUri, { kind: 'session', key, flag, set, requestedSet });
		await payloadDirty;
		return action.type === ActionType.SessionIsReadChanged ? { ...action, isRead: set } : action;
	}

	/**
	 * Applies a chat read or archive toggle to a chat of a session that is not
	 * currently materialized: persists the chat's flag, publishes it on the
	 * surfaced summary and synchronizes the session read aggregate, without
	 * restoring the session. A restore costs as much as loading the whole
	 * session, and every later action from the same client queues behind it.
	 * Archiving an unread chat also marks it read, as for a loaded chat.
	 *
	 * Returns `'restore'`, leaving the caller to restore, when its surfaced
	 * summary does not list the chat; `'deleting'`, writing nothing, when the
	 * session is being deleted; and `'unmanageable'`, writing nothing, for an
	 * archive toggle on a default, tool or side chat. Callers must run it
	 * through {@link _queuePassiveMetadataUpdate} and resolve `session` from
	 * the chat's recorded owner.
	 */
	private async _applyPassiveChatFlags(session: string, chat: string, action: ChatIsReadChangedAction | ChatIsArchivedChangedAction): Promise<'applied' | 'restore' | 'deleting' | 'unmanageable'> {
		const summary = this._stateManager.getSurfacedSessionSummary(session);
		const target = summary?.chats?.find(candidate => candidate.resource === chat);
		if (!summary || !target || readSessionEhcliAdoptable(summary._meta)) {
			return 'restore';
		}
		if (action.type === ActionType.ChatIsArchivedChanged
			&& (this._chatOwnership.isDefaultChat(session, chat) || target.origin?.kind === ChatOriginKind.Tool || target.origin?.kind === ChatOriginKind.SideChat)) {
			return 'unmanageable';
		}
		const sessionUri = URI.parse(session);
		// Writing would recreate the data a deletion is removing.
		if (this._catalogSyncService.isSessionDeletionFenced(sessionUri) || this._sessionResidency.isBeingDisposed(session)) {
			return 'deleting';
		}
		const chatUri = URI.parse(chat);
		const chatWasRead = isSessionStatusRead(target.status ?? summary.status);
		if (action.type === ActionType.ChatIsArchivedChanged) {
			await this._peerChatStore.setArchived(sessionUri, chatUri, action.isArchived);
			// A legacy central payload still lists the previous flags; synchronize them before any aggregate update reads them.
			this._queuePassiveSessionMetadataSynchronization(sessionUri, { kind: 'chat', key: `chatArchived:${chat}`, chat, field: 'archived', set: action.isArchived });
			this._setSurfacedChatArchived(session, chat, action.isArchived);
			if (action.isArchived) {
				this._queuePassiveSessionMetadataSynchronization(sessionUri, { kind: 'detachFolders', key: `chatFolders:${chat}`, chat });
			}
		}
		const isRead = action.type === ActionType.ChatIsReadChanged ? action.isRead : action.isArchived && !chatWasRead ? true : undefined;
		let aggregateChanged = false;
		if (isRead !== undefined) {
			await this._peerChatStore.setRead(sessionUri, chatUri, isRead);
			this._queuePassiveSessionMetadataSynchronization(sessionUri, { kind: 'chat', key: `chatRead:${chat}`, chat, field: 'isRead', set: isRead });
			const current = this._stateManager.getSurfacedSessionSummary(session);
			if (current?.chats) {
				const chats = current.chats.map(candidate => candidate.resource === chat
					? { ...candidate, status: withSessionStatusFlag(candidate.status ?? current.status, SessionStatus.IsRead, isRead) }
					: candidate);
				this._stateManager.setSurfacedSessionStatusAndChats(session, current.status, chats);
				if (isChatInSessionReadAggregate(target.resource, target.origin, target.interactivity)) {
					const sessionIsRead = isSessionStatusRead(current.status);
					const lastUnreadChatRead = isRead && !chatWasRead && !sessionIsRead && chats
						.filter(candidate => isChatInSessionReadAggregate(candidate.resource, candidate.origin, candidate.interactivity))
						.every(candidate => isSessionStatusRead(candidate.status ?? current.status));
					if (lastUnreadChatRead || (!isRead && sessionIsRead)) {
						aggregateChanged = true;
						const applied = await this._applyPassiveSessionMetadata(session, { type: ActionType.SessionIsReadChanged, isRead });
						if (applied) {
							this._stateManager.dispatchServerAction(session, applied);
						}
					}
				}
			}
		}
		this._invalidateSessionList();
		if (!aggregateChanged) {
			// An aggregate update has already marked the payload dirty.
			await this._markCatalogPayloadDirty(session);
		}
		return 'applied';
	}

	/** Publishes a chat's archived flag on an unloaded session's surfaced summary, including the AHP 0.9 `archived` field. */
	private _setSurfacedChatArchived(session: string, chat: string, archived: boolean): void {
		const current = this._stateManager.getSurfacedSessionSummary(session);
		if (!current?.chats) {
			return;
		}
		this._stateManager.setSurfacedSessionStatusAndChats(session, current.status, current.chats.map(candidate => {
			if (candidate.resource !== chat) {
				return candidate;
			}
			const { archived: _archived, ...rest } = candidate as typeof candidate & { readonly archived?: boolean };
			const status = withSessionStatusFlag(candidate.status ?? current.status, SessionStatus.IsArchived, archived);
			return archived ? { ...rest, status, archived: true } : { ...rest, status };
		}));
	}

	private _queuePassiveSessionMetadataSynchronization(session: URI, update: PassiveCatalogMetadataUpdate): void {
		if (this._catalogSyncService.isSessionDeletionFenced(session)) {
			return;
		}
		const sessionKey = session.toString();
		const existing = this._backgroundPassiveSessionMetadataWrites.get(sessionKey);
		if (existing) {
			existing.pending.set(update.key, update);
			return;
		}
		const write: IBackgroundPassiveSessionMetadataWrite = {
			promise: Promise.resolve(),
			pending: new Map([[update.key, update]]),
		};
		this._backgroundPassiveSessionMetadataWrites.set(sessionKey, write);
		write.promise = this._drainPassiveSessionMetadataSynchronization(session, write);
	}

	private async _drainPassiveSessionMetadataSynchronization(session: URI, write: IBackgroundPassiveSessionMetadataWrite): Promise<void> {
		const sessionKey = session.toString();
		try {
			while (write.pending.size > 0) {
				const updates = [...write.pending.values()];
				write.pending.clear();
				try {
					await this._synchronizePassiveSessionMetadata(session, updates);
				} catch (error) {
					this._logService.warn(`[AgentService] Failed to synchronize passive session metadata for ${sessionKey}`, error);
				}
			}
			this._catalogReconciliationService.schedule();
			this._invalidateSessionList();
		} finally {
			if (this._backgroundPassiveSessionMetadataWrites.get(sessionKey) === write) {
				this._backgroundPassiveSessionMetadataWrites.delete(sessionKey);
			}
		}
	}

	/**
	 * The session workspace of an unloaded session without the folders only the archived
	 * `chat` and its spawned chats use, as {@link _detachChatWorkingDirectories} computes
	 * for a loaded one. `undefined` when nothing is detached. Unarchiving needs no
	 * counterpart: a restore attaches the folders of unarchived chats ({@link withChatWorkingDirectories}).
	 */
	private _getPassiveRemainingWorkingDirectories(session: URI, data: AgentHostCatalogData, chat: string): string[] | undefined {
		if (!this._providerService.getProviderForSession(session)?.getDescriptor().capabilities?.multipleWorkingDirectories) {
			return undefined;
		}
		const chats = data.chats.map((catalogChat): ChatSummary => ({
			resource: catalogChat.uri,
			title: catalogChat.summary ?? '',
			status: withSessionStatusFlag(SessionStatus.Idle, SessionStatus.IsArchived, catalogChat.archived === true),
			modifiedAt: '',
			origin: fromCatalogChatOrigin(catalogChat.origin),
			workingDirectories: catalogChat.workingDirectories?.slice(),
		}));
		const chatDirectories = this._getChatFamilyWorkingDirectories(chats, chat, true);
		const usedScopes = this._getWorkingDirectoriesInUse(chats, chat, inheritedChatFolders(this._stateManager, data.workingDirectories, readSessionWorkspaceless(data._meta)));
		if (!data.workingDirectories.length || !chatDirectories.length || usedScopes.some(scope => scope === undefined)) {
			return undefined;
		}
		const remaining = data.workingDirectories.filter((directory, index) => index === 0
			|| !chatDirectories.some(candidate => isEqual(URI.parse(candidate), URI.parse(directory)))
			|| usedScopes.some(scope => scope?.some(other => isEqual(URI.parse(other), URI.parse(directory))))
			|| this._isChatWorkingDirectoryReserved(session, URI.parse(directory)));
		return remaining.length === data.workingDirectories.length ? undefined : remaining;
	}

	private async _synchronizePassiveSessionMetadata(session: URI, updates: readonly PassiveCatalogMetadataUpdate[], savedContinuation?: { readonly validate: () => Promise<void>; readonly isCurrent: () => boolean }): Promise<boolean> {
		let requestUnavailable = false;
		try {
			// The request is built from this session's catalog alone.
			await this._peerChatStore.whenIdle(session);
			const result = await this._catalogSyncService.synchronizeWithFactory(session, async database => {
				const sessionKey = session.toString();
				const catalog = await this._orchestratorDatabase.getSessionV2(sessionKey);
				const snapshot = await database.object.getCatalogSyncSnapshot();
				const pending = snapshot?.state === 'pending'
					&& snapshot.projectionVersion === AGENT_HOST_CATALOG_PAYLOAD_VERSION
					&& (!catalog || (snapshot.sessionGeneration === catalog.sessionGeneration && snapshot.sourceRevision >= catalog.sourceRevision))
					? snapshot : undefined;
				let request: IAgentHostCatalogSyncRequest | undefined;
				for (const candidate of [pending, catalog]) {
					if (!candidate) {
						continue;
					}
					// A failed central write must not be discarded by the next flag update.
					const decoded = decodeAgentHostCatalogPayload(candidate.payload);
					if (decoded.ok && (candidate !== pending
						|| (decoded.value.payload === pending.payload && hashAgentHostCatalogPayload(pending.payload) === pending.payloadHash))) {
						request = {
							data: decoded.value.data,
							legacyMetadata: {},
						};
						break;
					}
					if (candidate === pending) {
						this._logService.warn(`[AgentService] Invalid pending catalog payload for ${sessionKey}; falling back to the central payload`);
					}
				}
				if (!request && !savedContinuation) {
					const registered = await this._sessionRegistry.get(session, entry => this._migrateRegisteredSession(entry));
					if (registered) {
						const source = await this._resolveCatalogReconciliationSource(registered, database);
						if (source.status === 'available') {
							request = source.request;
						}
					}
				}
				if (!request) {
					requestUnavailable = true;
					throw new Error(`No catalog synchronization source is available for passive session metadata ${sessionKey}`);
				}
				let data = request.data;
				const [normalized] = await this._orchestratorDatabase.readCatalogSnapshot([sessionKey]);
				if (normalized?.authorityVersion === 2) {
					data = { ...data, chats: chatCatalogV2ToCatalogChats(normalized) };
				}
				const legacyMetadata = { ...request.legacyMetadata };
				for (const update of updates) {
					if (update.kind !== 'chat') {
						continue;
					}
					data = {
						...data, chats: data.chats.map(chat => {
							if (chat.uri !== update.chat) {
								return chat;
							}
							if (update.field === 'isRead') {
								return { ...chat, isRead: update.set };
							}
							const { archived: _archived, ...rest } = chat;
							return update.set ? { ...rest, archived: true } : rest;
						}),
					};
				}
				for (const update of updates) {
					if (update.kind === 'detachFolders') {
						const remaining = this._getPassiveRemainingWorkingDirectories(session, data, update.chat);
						if (remaining) {
							data = { ...data, workingDirectories: remaining };
							legacyMetadata[SESSION_WORKING_DIRECTORIES_KEY] = JSON.stringify(remaining);
						}
					}
				}
				for (const update of updates) {
					if (update.kind !== 'session') {
						continue;
					}
					if (update.flag === SessionStatus.IsRead) {
						const aggregateChats = data.chats.filter(chat => {
							const isToolChat = typeof chat.origin === 'object'
								&& chat.origin !== null
								&& !Array.isArray(chat.origin)
								&& chat.origin.kind === ChatOriginKind.Tool;
							return !isToolChat && isChatInSessionReadAggregate(chat.uri, undefined, chat.interactivity);
						});
						const set = update.requestedSet && aggregateChats.length > 1 && aggregateChats.some(chat => chat.isRead === false)
							? false
							: update.set;
						const soleChat = aggregateChats.length === 1 ? aggregateChats[0] : undefined;
						data = {
							...data,
							isRead: set,
							...(soleChat ? {
								chats: data.chats.map(chat => chat.uri === soleChat.uri ? { ...chat, isRead: set } : chat),
							} : {}),
						};
						legacyMetadata[update.key] = set ? 'true' : '';
						if (soleChat?.kind === 'default' && normalized?.authorityVersion !== 2) {
							legacyMetadata[AH_META_DEFAULT_CHAT_IS_READ_DB_KEY] = set ? 'true' : '';
						}
						continue;
					}
					data = {
						...data,
						isArchived: update.set,
					};
					legacyMetadata[update.key] = update.set ? 'true' : '';
				}
				return {
					data,
					legacyMetadata,
					chatCatalogRevision: normalized?.authorityVersion === 2 ? normalized.header?.revision : request.chatCatalogRevision,
				};
			}, savedContinuation?.validate, savedContinuation?.isCurrent);
			if (result.status === 'pending') {
				this._pendingPassiveCatalogReplays.add(session.toString());
				this._logService.warn(`[AgentService] Catalog synchronization for passive session metadata ${session.toString()} remains pending: ${result.reason}`);
			} else {
				this._pendingPassiveCatalogReplays.delete(session.toString());
			}
			return result.status !== 'pending' || result.reason !== 'cancelled';
		} catch (error) {
			if (requestUnavailable) {
				return false;
			}
			throw error;
		}
	}

	private async _replayPendingPassiveSessionMetadata(): Promise<void> {
		if (this._pendingPassiveCatalogReplays.size === 0) {
			return;
		}
		const store = new DisposableStore();
		const cancellation = store.add(new CancellationTokenSource());
		try {
			await raceTimeout((async () => {
				for (const session of [...this._pendingPassiveCatalogReplays]) {
					if (cancellation.token.isCancellationRequested) {
						return;
					}
					try {
						const outcome = await this._catalogSyncService.replayPending(URI.parse(session), cancellation.token);
						if (!outcome || outcome.status === 'succeeded') {
							this._pendingPassiveCatalogReplays.delete(session);
						} else if (!cancellation.token.isCancellationRequested) {
							this._logService.warn(`[AgentService] Passive metadata replay for ${session} remains pending during shutdown: ${outcome.reason}`);
						}
					} catch (error) {
						this._logService.warn(`[AgentService] Failed to replay passive metadata for ${session} during shutdown`, error);
					}
				}
			})(), PASSIVE_METADATA_SHUTDOWN_REPLAY_TIMEOUT_MS, () => {
				cancellation.cancel();
				this._logService.warn('[AgentService] Timed out replaying passive metadata during shutdown; retaining pending snapshots');
			});
		} finally {
			cancellation.cancel();
			store.dispose();
		}
	}

	private _isAutomationAction(action: SessionAction | ChatAction | TerminalAction | ClientChangesetAction | ClientAnnotationsAction | IRootConfigChangedAction | ClientAutomationAction | ClientAutomationRunAction): action is ClientAutomationAction {
		return action.type === ActionType.AutomationCreateRequested
			|| action.type === ActionType.AutomationUpdateRequested
			|| action.type === ActionType.AutomationRemoved;
	}

	private _isAutomationRunAction(action: SessionAction | ChatAction | TerminalAction | ClientChangesetAction | ClientAnnotationsAction | IRootConfigChangedAction | ClientAutomationAction | ClientAutomationRunAction): action is ClientAutomationRunAction {
		return action.type === ActionType.AutomationRunCancelRequested;
	}

	dispatchAction(channel: string, action: SessionAction | ChatAction | TerminalAction | ClientChangesetAction | ClientAnnotationsAction | IRootConfigChangedAction | ClientAutomationAction | ClientAutomationRunAction, clientId: string, clientSeq: number, clientContextOrType: IAgentHostClientTelemetryContext | AgentHostClientType = AgentHostClientType.Unknown, credentials?: IAgentHostCredentialSource): void | Promise<void> {
		const clientContext = typeof clientContextOrType === 'string'
			? createUnknownAgentHostClientTelemetryContext(clientContextOrType)
			: clientContextOrType;
		this._logService.trace(`[AgentService] dispatchAction: type=${action.type}, clientId=${clientId}, clientSeq=${clientSeq}`, action);
		if (this._isAutomationAction(action)) {
			const origin = { clientId, clientSeq };
			if (credentials) {
				this._stateManager.rejectClientAction(channel, action, origin, 'Automations do not support client-owned credentials.');
				return;
			}
			if (!isAhpAutomationCatalogChannel(channel)) {
				this._stateManager.rejectClientAction(channel, action, origin, 'Automation actions require the automation catalogue channel.');
				return;
			}

			return this._dispatchAutomationAction(action, clientId).catch(error => {
				const message = toErrorMessage(error);
				this._logService.error(`[AgentService] automation action failed: ${message}`);
				this._stateManager.rejectClientAction(channel, action, origin, message);
			});
		}
		if (this._isAutomationRunAction(action)) {
			const origin = { clientId, clientSeq };
			if (!isAhpAutomationRunChannel(channel)) {
				this._stateManager.rejectClientAction(channel, action, origin, 'Automation run actions require an automation-run channel.');
				return;
			}
			return this._automationService.handleCancel(channel, action).catch(error => {
				const message = toErrorMessage(error);
				this._logService.error(`[AgentService] automation run action failed: ${message}`);
				this._stateManager.rejectClientAction(channel, action, origin, message);
			});
		}

		// Clients dispatch chat (chat) actions against a chat channel
		// URI. Keep that chat channel for the optimistic state apply and for
		// per-chat routing in side effects, while deriving the owning session
		// URI for all session-scoped work (attachment snapshotting, agent
		// lookup, telemetry, permissions — all keyed by session).
		const changesetChannel = parseChangesetUri(channel);
		const chatChannel = !changesetChannel && isAhpChatChannel(channel) ? channel : undefined;
		const knownSessionChannel = changesetChannel?.sessionUri ?? (chatChannel ? this._chatOwnership.getChatOwner(chatChannel) : channel);
		const requiresSessionRestore = knownSessionChannel === undefined || ((chatChannel !== undefined || isSessionAction(action)) && !this._isSessionRestored(knownSessionChannel));
		const requiresCredentialResolution = credentials !== undefined || (knownSessionChannel !== undefined
			&& this._authService.getSessionCredentialPrincipal(knownSessionChannel) !== undefined && this._requiresExecutionCredentials(knownSessionChannel, action));
		const requiresPeerResolution = chatChannel !== undefined && !this._stateManager.getChatState(chatChannel) && !this._appliesWithoutChatState(chatChannel, action);
		const requiresKnownAttachmentRewrite = knownSessionChannel !== undefined && this._needsAsyncRewrite(knownSessionChannel, channel, action);
		const requiresReviewStateUpdate = action.type === ActionType.ChangesetFilesReviewChanged;
		const requiresAnnotationsRestore = isAnnotationsAction(action);
		const requiresWorkspacePin = action.type === ActionType.SessionWorkingDirectorySet;

		const pending = this._clientDispatchQueues.get(clientId);
		if (!pending && knownSessionChannel !== undefined && !requiresSessionRestore && !requiresPeerResolution && !requiresKnownAttachmentRewrite && !requiresReviewStateUpdate && !requiresAnnotationsRestore && !requiresWorkspacePin && !requiresCredentialResolution) {
			this._dispatchActionNow(channel, knownSessionChannel, action, clientId, clientSeq, clientContext, credentials);
			return;
		}

		const next = (pending ?? Promise.resolve()).then(async () => {
			const sessionChannel = knownSessionChannel ?? (await this._chatOwnership.resolveChatOwner(channel))?.owner;
			if (sessionChannel === undefined) {
				this._logService.trace(`[AgentService] dispatchAction: no owner recorded for chat ${channel}; ${action.type} has no effect`);
				if (!this._rejectUnknownChatAction(channel, action, { clientId, clientSeq })) {
					this._stateManager.dispatchClientAction(channel, action, { clientId, clientSeq }, clientContext);
				}
				return;
			}
			const requiresAttachmentRewrite = this._needsAsyncRewrite(sessionChannel, channel, action);
			const sessionUri = URI.parse(sessionChannel);
			const subagent = parseSubagentSessionUri(sessionUri);
			let passiveMetadataAction: IIsArchivedChangedAction | IIsReadChangedAction | undefined;
			if (requiresAnnotationsRestore) {
				const annotations = parseAnnotationsUri(channel);
				if (!annotations) {
					throw new Error(`Invalid annotations channel: ${channel}`);
				}
				await this._ensureAnnotationsRestored(annotations.sessionUri);
			}
			// Evaluated here rather than from the entry-time `requiresSessionRestore`:
			// this callback is queued behind earlier dispatches, so the session may
			// since have been restored or evicted. Joining an in-flight restore also
			// stops this write racing the metadata read that builds the restored summary.
			let adoptedForArchiveToggle = false;
			if (isPassiveSessionMetadataAction(action) && !subagent) {
				await this._restoreSessionInFlight.get(sessionChannel)?.catch(() => undefined);
				if (!this._stateManager.getSessionState(sessionChannel)) {
					const surfacedSummary = this._stateManager.getSurfacedSessionSummary(sessionChannel);
					const adoptable = readSessionEhcliAdoptable(surfacedSummary?._meta)
						|| (!surfacedSummary && action.type === ActionType.SessionIsArchivedChanged && await this._isRegisteredAdoptableSession(sessionUri));
					if (adoptable) {
						if (action.type === ActionType.SessionIsReadChanged) {
							// Dropped so listing / scrolling can't adopt an un-opened legacy session; only an explicit open or archive toggle adopts.
							return;
						}
						await this.restoreSession(sessionUri);
						adoptedForArchiveToggle = true;
					} else {
						// Falls through so the envelope and its side effects (worktree
						// cleanup, `onArchivedChanged`, Agent Merge sync) still run.
						const applied = await this._queuePassiveMetadataUpdate(sessionChannel, () => this._applyPassiveSessionMetadata(sessionChannel, action));
						if (applied !== 'live') {
							if (!applied) {
								return;
							}
							passiveMetadataAction = applied;
						}
					}
				}
			} else if ((action.type === ActionType.ChatIsReadChanged || action.type === ActionType.ChatIsArchivedChanged) && chatChannel !== undefined && !subagent && requiresSessionRestore) {
				const outcome = await this._queuePassiveMetadataUpdate(sessionChannel, () => this._applyPassiveChatFlags(sessionChannel, chatChannel, action));
				if (outcome === 'deleting' || outcome === 'unmanageable') {
					this._stateManager.rejectClientAction(channel, action, { clientId, clientSeq }, outcome === 'unmanageable'
						? UNMANAGEABLE_CHAT_ARCHIVE_REJECTION
						: action.type === ActionType.ChatIsReadChanged
							? 'Cannot change the read state of a chat while its session is being deleted.'
							: 'Cannot change the archived state of a chat while its session is being deleted.');
					return;
				}
				if (outcome === 'restore') {
					await this.restoreSession(sessionUri);
				} else if (outcome === 'applied' && !this._stateManager.getSessionState(sessionChannel)) {
					// The chat has no registered state to reduce into; the envelope acknowledges the client.
					this._stateManager.dispatchClientAction(chatChannel, action, { clientId, clientSeq }, clientContext);
					return;
				}
			} else if (requiresSessionRestore) {
				if (!subagent) {
					credentials = await this._resolveExecutionCredentials(sessionChannel, credentials);
					if (credentials) {
						credentials = await this._prepareColdRestoreCredentials(sessionChannel, credentials);
					}
				}
				if (subagent) {
					await this._restoreSubagentSession(sessionChannel, subagent.parentSession);
				} else {
					await this.restoreSession(sessionUri, undefined, credentials);
				}
			}
			this._checkCredentialPrincipal(sessionChannel, credentials);
			if (this._requiresExecutionCredentials(sessionChannel, action)
				&& (credentials || this._authService.getSessionCredentialPrincipal(sessionChannel))) {
				credentials = await this._resolveExecutionCredentials(sessionChannel, credentials);
			}
			if ((action.type === ActionType.ChatTurnStarted || action.type === ActionType.ChatTurnResume) && credentials
				&& !this._stateManager.getActiveTurnId(channel)) {
				await this._bindExecutionCredentials(sessionChannel, credentials, channel);
			}
			if (credentials && action.type === ActionType.SessionConfigChanged
				&& this._agentMergeController.requiresConfigurationCredentialSponsor(sessionChannel, action.config)) {
				const provider = this._providerService.getProviderForSession(sessionChannel);
				if (!provider) {
					throw new ProtocolError(AhpErrorCodes.AuthRequired, 'The isolated session provider is unavailable');
				}
				credentials = captureCredentialSource(credentials, provider.getProtectedResources());
				await this._persistCredentialPrincipal(sessionChannel, credentials);
				this._requireProviderCredentials(provider, credentials);
			}
			if (chatChannel && requiresPeerResolution && !this._appliesWithoutChatState(chatChannel, action)) {
				await this._stateManager.resolveChatState(chatChannel, credentials);
			}
			let rewritten: SessionAction | ChatAction | TerminalAction | ClientChangesetAction | ClientAnnotationsAction | IRootConfigChangedAction = requiresAttachmentRewrite
				? await this._rewriteUserMessageAttachments(sessionChannel, channel, action, clientId)
				: passiveMetadataAction ?? action;
			if (rewritten.type === ActionType.SessionWorkingDirectorySet
				&& clientContext.clientType === AgentHostClientType.EditorWindow
				&& channel === sessionChannel) {
				rewritten = this._prepareWorkingDirectoryAction(sessionChannel, rewritten);
				const workingDirectories = this._stateManager.getSessionSummary(sessionChannel)?.workingDirectories ?? [];
				if (!workingDirectories.includes(rewritten.directory)) {
					await this._pinInheritedChatWorkingDirectories(URI.parse(sessionChannel), workingDirectories);
				}
			}
			if (rewritten.type === ActionType.ChangesetFilesReviewChanged) {
				await this._reviewService.setReviewState(channel, rewritten.files, rewritten.reviewed);
				const changeset = parseChangesetUri(channel);
				if (!changeset) {
					throw new Error(`Invalid changeset URI: ${channel}`);
				}
				this._changesets.refreshBranchChangeset(changeset.ownerUri);
			}
			this._dispatchActionNow(channel, sessionChannel, rewritten, clientId, clientSeq, clientContext, credentials);
			if (adoptedForArchiveToggle && action.type === ActionType.SessionIsArchivedChanged) {
				this._queueCatalogSync(sessionUri, {
					[AH_META_IS_ARCHIVED_DB_KEY]: action.isArchived ? 'true' : '',
					...(!action.isArchived ? { [AH_META_AUTO_ARCHIVED_AT_DB_KEY]: '' } : {}),
				});
			}
		}).catch(err => {
			this._logService.error(`[AgentService] async dispatchAction failed: ${toErrorMessage(err)}`);
			this._stateManager.rejectClientAction(channel, action, { clientId, clientSeq }, toErrorMessage(err));
		}).finally(() => {
			if (this._clientDispatchQueues.get(clientId) === next) {
				this._clientDispatchQueues.delete(clientId);
			}
		});

		this._clientDispatchQueues.set(clientId, next);
		return next;
	}

	private async _dispatchAutomationAction(action: ClientAutomationAction, clientId: string): Promise<void> {
		switch (action.type) {
			case ActionType.AutomationCreateRequested:
				return this._automationService.handleCreate(action, clientId);
			case ActionType.AutomationUpdateRequested:
				return this._automationService.handleUpdate(action, clientId);
			case ActionType.AutomationRemoved:
				return this._automationService.handleRemove(action);
		}
	}

	/**
	 * Authoritative gate for every client working-directory action. Throws when
	 * the session or its provider cannot accept the change — including a removal
	 * of the primary directory for a provider that pins it — so the caller can
	 * reject the action. Returns the canonicalized action on success.
	 */
	private _prepareWorkingDirectoryAction(session: string, action: SessionWorkingDirectoryAction): SessionWorkingDirectoryAction {
		const state = this._stateManager.getSessionState(session.toString());
		const workingDirectories = this._stateManager.getSessionSummary(session)?.workingDirectories;
		if (!state || state.lifecycle !== SessionLifecycle.Ready || !workingDirectories?.length) {
			throw new Error(`Session is not ready for working-directory changes: ${session}`);
		}
		if (!readSessionMultiRootMetadata(state._meta)
			|| readSessionWorkspaceless(state._meta)
			|| state.config?.values[SessionConfigKey.Isolation] === 'worktree'
			|| state.chats.length !== 1
			|| !state.defaultChat
			|| state.defaultChat !== state.chats[0].resource) {
			throw new Error(`Session does not support dynamic working-directory changes: ${session}`);
		}

		const sessionUri = URI.parse(session);
		const provider = this._providerService.getProviderForSession(sessionUri);
		const capability = provider?.getDescriptor().capabilities?.multipleWorkingDirectories;
		if (!provider || !capability) {
			throw new Error(`Provider does not support dynamic working-directory changes: ${AgentSession.provider(sessionUri) ?? '(unknown)'}`);
		}

		const resolved = resolveSessionWorkingDirectoryAction(action, workingDirectories, {
			immutablePrimary: capability.immutablePrimary === true,
			primaryReplacement: capability.primaryReplacement === true,
		});
		if (resolved.type === ActionType.SessionWorkingDirectoryRemoved) {
			const removed = URI.parse(resolved.directory);
			const owningChat = state.chats.find(chat => chat.workingDirectories?.some(directory => isEqual(URI.parse(directory), removed)));
			if (owningChat) {
				throw new Error(`Cannot remove working directory ${removed.toString()} because chat ${owningChat.resource} is scoped to it.`);
			}
		}
		return resolved;
	}

	/**
	 * Prepares a folder for a new chat and adds its effective checkout to the
	 * aggregate session workspace. The caller assigns the returned directory to
	 * the chat when creating it.
	 */
	async addSessionWorkingDirectoryForChat(session: URI, directory: URI, options: IAddSessionWorkingDirectoryOptions): Promise<URI> {
		return (await this._prepareChatWorkingDirectory(session, directory, options)).directory;
	}

	/**
	 * Like {@link addSessionWorkingDirectoryForChat}, and returns a release that
	 * undoes the preparation when the chat cannot be created.
	 */
	async prepareChatWorkingDirectory(session: URI, directory: URI, options: IAddSessionWorkingDirectoryOptions): Promise<IPreparedChatWorkingDirectory> {
		const prepared = await this._prepareChatWorkingDirectory(session, directory, options, true);
		const createdWorktree = prepared.createdWorktree;
		const reservation = prepared.reservation && this._trackPreparedChatWorkingDirectory(session, prepared.directory, prepared.reservation);
		return {
			directory: prepared.directory,
			...(createdWorktree ? {
				associateWithChat: chat => this._associateAdditionalWorktreeWithChat(session, createdWorktree.handle, chat),
			} : {}),
			release: () => {
				reservation?.dispose();
				return prepared.added ? this._releaseChatWorkingDirectory(session, prepared.directory, createdWorktree) : Promise.resolve();
			},
		};
	}

	/**
	 * Reserves folders a chat being created or moved will work in, so they are
	 * not detached from the session workspace before the chat is published.
	 */
	private _reserveChatWorkingDirectories(session: URI, directories: readonly string[]): IDisposable {
		const sessionKey = session.toString();
		const reserved = this._reservedChatWorkingDirectories.get(sessionKey) ?? [];
		reserved.push(...directories);
		this._reservedChatWorkingDirectories.set(sessionKey, reserved);
		return toDisposable(() => {
			for (const directory of directories) {
				const index = reserved.indexOf(directory);
				if (index >= 0) {
					reserved.splice(index, 1);
				}
			}
			if (reserved.length === 0 && this._reservedChatWorkingDirectories.get(sessionKey) === reserved) {
				this._reservedChatWorkingDirectories.delete(sessionKey);
			}
		});
	}

	private _isChatWorkingDirectoryReserved(session: URI, directory: URI): boolean {
		return this._reservedChatWorkingDirectories.get(session.toString())?.some(reserved => isEqual(URI.parse(reserved), directory)) ?? false;
	}

	/** Keeps a prepared folder reserved until it is released or a chat working in it is published ({@link _consumePreparedChatWorkingDirectories}). */
	private _trackPreparedChatWorkingDirectory(session: URI, directory: URI, reservation: IDisposable): IDisposable {
		const sessionKey = session.toString();
		const entries = this._preparedChatWorkingDirectories.get(sessionKey) ?? [];
		this._preparedChatWorkingDirectories.set(sessionKey, entries);
		const entry = {
			directory,
			reservation: toDisposable(() => {
				reservation.dispose();
				entries.splice(entries.indexOf(entry), 1);
				if (entries.length === 0 && this._preparedChatWorkingDirectories.get(sessionKey) === entries) {
					this._preparedChatWorkingDirectories.delete(sessionKey);
				}
			}),
		};
		entries.push(entry);
		return entry.reservation;
	}

	/** Ends the preparation reservations of folders a published chat now works in. */
	private _consumePreparedChatWorkingDirectories(session: URI, directories: readonly string[]): void {
		for (const directory of directories) {
			this._preparedChatWorkingDirectories.get(session.toString())?.find(candidate => isEqual(candidate.directory, URI.parse(directory)))?.reservation.dispose();
		}
	}

	runWithChatCatalogLock<T>(session: URI, operation: () => Promise<T>): Promise<T> {
		return this._chatCatalogMutationSequencer.queue(session.toString(), operation);
	}

	async setChatWorkingDirectory(session: URI, chat: URI, directory: URI, replaceSessionWorkspace = false, expectedSessionDirectories?: readonly string[]): Promise<void> {
		const isCurrentChat = this._stateManager.captureChatValidity(chat.toString());
		const previousSessionDirectories = expectedSessionDirectories ?? this._stateManager.getSessionSummary(session.toString())?.workingDirectories;
		const gitState = await this._gitService.getSessionGitState(directory);
		const update = () => {
			if (replaceSessionWorkspace && !equals(this._stateManager.getSessionSummary(session.toString())?.workingDirectories ?? [], previousSessionDirectories ?? [])) {
				throw new Error('The session changed while preparing its replacement workspace.');
			}
			return this._setChatWorkingDirectory(session, chat, directory, replaceSessionWorkspace, gitState, isCurrentChat);
		};
		if (replaceSessionWorkspace) {
			// Exclusive conversion already holds the catalog lock across provider mutation.
			await update();
		} else {
			await this.runWithChatCatalogLock(session, update);
		}
		// The chat left the scratch folder it owned: detach it from the session and let the clean-up pass reclaim it.
		await this._retireReplacedScratchFolders(session, chat, directory);
		this._publishWorkingDirectoryIdentities(session.toString());
	}

	private async _setChatWorkingDirectory(session: URI, chat: URI, directory: URI, replaceSessionWorkspace: boolean, gitState: ISessionGitState | undefined, isCurrentChat: () => boolean): Promise<void> {
		const assertCurrentChat = () => {
			if (!isCurrentChat()) {
				throw new Error(localize('agentHost.chatWorkspaceTargetChanged', "The chat was removed or replaced while changing its workspace."));
			}
		};
		assertCurrentChat();
		const directories = [directory.toString()];
		const state = this._stateManager.getSessionState(session.toString());
		const summary = state?.chats.find(candidate => candidate.resource === chat.toString());
		const sessionDirectories = this._stateManager.getSessionSummary(session.toString())?.workingDirectories;
		if (!state || !summary || (replaceSessionWorkspace
			? !hasSingleUserChat(state.chats) || !this._chatOwnership.isDefaultChat(session.toString(), chat.toString()) || !sessionDirectories?.length
			: !sessionDirectories?.includes(directories[0]))) {
			throw new Error(`Cannot assign an unattached working directory to chat ${chat.toString()}.`);
		}
		await this._persistChatWorkingDirectories(session, chat, directories, summary.workingDirectories ?? sessionDirectories, assertCurrentChat);
		assertCurrentChat();
		await this._gitStateService.setFolderGitState(session.toString(), directories, gitState);
		assertCurrentChat();
		if (replaceSessionWorkspace) {
			if (!hasSingleUserChat(this._stateManager.getSessionState(session.toString())?.chats ?? [])
				|| !equals(this._stateManager.getSessionSummary(session.toString())?.workingDirectories, sessionDirectories)) {
				throw new Error('The session changed while changing its workspace.');
			}
			this._applySessionWorkspace(session, sessionDirectories!, directories[0], gitState);
		}
		this._applyChatWorkingDirectories(session, chat, directories, summary.workingDirectories ?? state.workingDirectories ?? []);
		this._consumePreparedChatWorkingDirectories(session, directories);
		await this._persistListVisibleSessionState(session, {
			[SESSION_WORKING_DIRECTORIES_KEY]: JSON.stringify(replaceSessionWorkspace ? directories : sessionDirectories),
		});
	}

	/**
	 * Persists a chat's folders: the visible list and the launch folders a
	 * provider resumes the chat in. Neither is a session-workspace change.
	 */
	private async _persistChatWorkingDirectories(session: URI, chat: URI, directories: readonly string[], previousDirectories: readonly string[] | undefined, assertCurrentChat: () => void): Promise<void> {
		const isDefault = this._chatOwnership.isDefaultChat(session.toString(), chat.toString());
		if (isDefault) {
			await this._peerChatStore.persistMetadata(session, chat, {
				[CHAT_WORKING_DIRECTORIES_METADATA_KEY]: JSON.stringify(directories),
			});
		} else {
			if (!equals(previousDirectories, directories)) {
				// Forked chats can inherit a baseline from their previous checkout.
				await this._sessionStateStore.writeMetadata(session, chat, { [META_DIFF_BASE_BRANCH]: '' }, SessionStateMirrorFlush.Immediate);
			}
			assertCurrentChat();
			await this._peerChatStore.updateWorkingDirectories(session, chat, directories);
		}
		await this._recordLaunchDirectories(session, [{ chat: chat.toString(), isDefault }], directories);
	}

	/** Replaces the session workspace by `replacement`, dropping the other folders. */
	private _applySessionWorkspace(session: URI, previousDirectories: readonly string[], replacement: string, gitState: ISessionGitState | undefined): void {
		this._stateManager.setSessionMeta(session.toString(), withSessionGitState(this._stateManager.getSessionState(session.toString())?._meta, gitState));
		this._stateManager.dispatchServerAction(session.toString(), {
			type: ActionType.SessionWorkingDirectoryReplaced,
			directory: previousDirectories[0],
			replacement,
		});
		for (const previous of previousDirectories.slice(1)) {
			if (previous !== replacement) {
				this._stateManager.dispatchServerAction(session.toString(), { type: ActionType.SessionWorkingDirectoryRemoved, directory: previous });
			}
		}
	}

	/** Publishes a chat's folders to clients. */
	private _applyChatWorkingDirectories(session: URI, chat: URI, directories: readonly string[], previousDirectories: readonly string[]): void {
		for (const previous of previousDirectories) {
			this._stateManager.dispatchServerAction(chat.toString(), { type: ActionType.ChatWorkingDirectoryRemoved, directory: previous });
		}
		for (const directory of directories) {
			this._stateManager.dispatchServerAction(chat.toString(), { type: ActionType.ChatWorkingDirectorySet, directory });
		}
		this._stateManager.dispatchServerAction(session.toString(), {
			type: ActionType.SessionChatUpdated, chat: chat.toString(), changes: { workingDirectories: [...directories] },
		});
	}

	/** Records where a provider launches the chats, without publishing anything. Ephemeral sessions persist nothing. */
	private async _recordLaunchDirectories(session: URI, chats: readonly { readonly chat: string; readonly isDefault: boolean }[], directories: readonly string[]): Promise<void> {
		if (!directories.length || !chats.length || this._stateManager.isEphemeralSession(session.toString())) {
			return;
		}
		await this._sessionStateStore.write(session, sessionStatePatch({
			chats: chats.map(({ chat, isDefault }) => ({ chat, isDefault, fields: { launchWorkingDirectories: [...directories] } })),
		}), SessionStateMirrorFlush.Immediate);
	}

	private async _prepareChatWorkingDirectory(session: URI, directory: URI, options: IAddSessionWorkingDirectoryOptions, reserve = false): Promise<{ readonly directory: URI; readonly added: boolean; readonly createdWorktree?: ISessionAdditionalWorktree; readonly reservation?: IDisposable }> {
		const credentials = options.credentialSource ?? await this._resolveExecutionCredentials(session.toString());
		let createdWorktree: ISessionAdditionalWorktree | undefined;
		let previousWorkingDirectories: readonly string[] = [];
		const prepare = async (): Promise<URI> => {
			const { workingDirectories } = this._getChatWorkingDirectoryContext(session);
			previousWorkingDirectories = workingDirectories;
			const existing = workingDirectories.find(candidate => isEqual(URI.parse(candidate), directory));
			if (existing !== undefined && !(options.isolation === 'worktree' && options.forceNewWorktree)) {
				return URI.parse(existing);
			}
			if (options.isolation === 'folder') {
				return this._attachSessionWorkingDirectoryForChat(session, directory);
			}

			const checkoutRoot = await this._gitService.getRepositoryRoot(directory, { refreshIfNone: true });
			if (!checkoutRoot) {
				throw new Error(`Cannot create an additional worktree because ${directory.toString()} is not in a Git repository.`);
			}
			const repositoryRoot = await tryResolvePrimaryWorktreeRoot(this._gitService, checkoutRoot) ?? checkoutRoot;
			const records = await readSessionAdditionalWorktrees(this._sessionStateStore, session);
			if (!options.forceNewWorktree) {
				const ownedWorktree = records.find(record => isEqual(URI.parse(record.repositoryRoot), repositoryRoot));
				if (ownedWorktree) {
					return this._attachSessionWorkingDirectoryForChat(session, URI.parse(ownedWorktree.workingDirectory));
				}

				const worktreeRoots = await this._gitService.getWorktreeRoots(checkoutRoot);
				const existingWorktree = workingDirectories.find(candidate =>
					worktreeRoots.slice(1).some(worktree => isEqual(worktree, URI.parse(candidate))));
				if (existingWorktree !== undefined) {
					return URI.parse(existingWorktree);
				}
			}

			if (options.baseBranch !== undefined && !await this._gitService.getBranch(checkoutRoot, options.baseBranch)) {
				throw new Error(localize('agentHost.worktreeBaseBranchMissing', "Branch '{0}' does not exist in {1}.", options.baseBranch, repositoryRoot.fsPath));
			}
			const selectedBranch = options.baseBranch
				?? (await this._gitService.getDefaultBranch(repositoryRoot))?.name
				?? await this._gitService.getCurrentBranch(repositoryRoot)
				?? 'HEAD';
			const detached = await this._worktree.createDetachedWorktree({
				workingDirectory: checkoutRoot,
				config: {
					...this._configurationService.getSessionConfigValues(session.toString()),
					[SessionConfigKey.Isolation]: 'worktree',
					[SessionConfigKey.Branch]: selectedBranch,
					// An additional folder is a different repository than the session's pull request.
					[SessionConfigKey.PullRequestUrl]: undefined,
				},
				prompt: options.prompt,
				...(credentials ? { credentialSource: credentials } : {}),
				githubToken: this._authService.getAuthToken({
					session: session.toString(),
					resource: this._gitHubEndpointService.getCopilotResource().resource,
					scopes: this._gitHubEndpointService.getCopilotResource().scopes_supported,
				}, credentials),
			});
			const record: ISessionAdditionalWorktree = {
				handle: detached.handle,
				workingDirectory: detached.worktree.toString(),
				repositoryRoot: repositoryRoot.toString(),
			};
			let recorded = false;
			try {
				await writeSessionAdditionalWorktrees(this._sessionStateStore, session, [...records, record]);
				recorded = true;
				await this._worktree.claimDetachedWorktree(detached.handle);
				const attached = await this._attachSessionWorkingDirectoryForChat(session, detached.worktree);
				createdWorktree = record;
				return attached;
			} catch (error) {
				try {
					await this._worktreeCleanup.deleteDetachedWorktree(detached.handle);
					if (recorded) {
						const current = await readSessionAdditionalWorktrees(this._sessionStateStore, session);
						await writeSessionAdditionalWorktrees(this._sessionStateStore, session, current.filter(candidate => candidate.handle !== detached.handle));
					}
				} catch (cleanupError) {
					this._logService.error(`[AgentService] Failed to clean up additional worktree ${detached.handle}: ${toErrorMessage(cleanupError)}`);
				}
				throw error;
			}
		};
		let reservation: IDisposable | undefined;
		const effective = await this._additionalWorktreeSequencer.queue(session.toString(), async () => {
			const prepared = await prepare();
			// Reserved before a queued folder removal can run, until the folder's chat is created or the preparation released.
			reservation = reserve ? this._reserveChatWorkingDirectories(session, [prepared.toString()]) : undefined;
			return prepared;
		});
		const added = !previousWorkingDirectories.some(candidate => isEqual(URI.parse(candidate), effective));
		return { directory: effective, added, ...(added && createdWorktree ? { createdWorktree } : {}), ...(reservation ? { reservation } : {}) };
	}

	private _associateAdditionalWorktreeWithChat(session: URI, handle: string, chat: URI): Promise<void> {
		return this._additionalWorktreeSequencer.queue(session.toString(), async () => {
			const records = await readSessionAdditionalWorktrees(this._sessionStateStore, session);
			const index = records.findIndex(record => record.handle === handle);
			if (index === -1) {
				throw new Error(`Cannot associate unknown additional worktree '${handle}' with chat ${chat.toString()}.`);
			}
			const next = records.slice();
			next[index] = { ...records[index], chat: chat.toString() };
			await writeSessionAdditionalWorktrees(this._sessionStateStore, session, next);
		});
	}

	/**
	 * Removes a folder added for a chat that could not be created, together with
	 * the worktree created for it. The folder stays when a chat uses it by then,
	 * including a chat that inherits the complete session workspace.
	 */
	private _releaseChatWorkingDirectory(session: URI, directory: URI, createdWorktree: ISessionAdditionalWorktree | undefined): Promise<void> {
		const sessionKey = session.toString();
		return this._additionalWorktreeSequencer.queue(sessionKey, async () => {
			try {
				const state = this._stateManager.getSessionState(sessionKey);
				const workingDirectories = this._stateManager.getSessionSummary(sessionKey)?.workingDirectories;
				const isDirectory = (candidate: string) => isEqual(URI.parse(candidate), directory);
				if (!state || !workingDirectories?.some(isDirectory)
					|| this._getWorkingDirectoriesInUse(state.chats, undefined, this._sessionFoldersOfChatWithoutOwn(sessionKey)).some(scope => scope === undefined || scope.some(isDirectory))
					|| this._isChatWorkingDirectoryReserved(session, directory)) {
					return;
				}
				const { capability } = this._getChatWorkingDirectoryContext(session);
				this._stateManager.dispatchServerAction(sessionKey, resolveSessionWorkingDirectoryAction({
					type: ActionType.SessionWorkingDirectoryRemoved,
					directory: directory.toString(),
				}, workingDirectories, capability));
				if (createdWorktree) {
					await this._worktreeCleanup.deleteDetachedWorktree(createdWorktree.handle);
					const records = await readSessionAdditionalWorktrees(this._sessionStateStore, session);
					await writeSessionAdditionalWorktrees(this._sessionStateStore, session, records.filter(record => record.handle !== createdWorktree.handle));
				}
			} catch (error) {
				this._logService.error(`[AgentService] Failed to release working directory ${directory.toString()} of session ${sessionKey}: ${toErrorMessage(error)}`);
			}
		});
	}

	/**
	 * Detaches an archived chat's folders from the aggregate session workspace,
	 * or attaches them back when the chat is unarchived. The folders of the
	 * subagents and side chats it spawned are detached with it; on unarchive,
	 * its own and its side chats' folders are attached back, as a subagent's
	 * folders are never considered. The chats keep their own folders either
	 * way. A folder stays attached while it is the primary folder or another
	 * unarchived chat uses it, including a chat that inherits the complete
	 * session workspace. Worktrees are never deleted.
	 */
	setArchivedChatWorkspaceAttached(session: URI, chat: URI, attached: boolean): Promise<void> {
		const sessionKey = session.toString();
		return this._additionalWorktreeSequencer.queue(sessionKey, async () => {
			const state = this._stateManager.getSessionState(sessionKey);
			const workingDirectories = this._stateManager.getSessionSummary(sessionKey)?.workingDirectories;
			const chatSummary = state?.chats.find(candidate => candidate.resource === chat.toString());
			if (!state || state.lifecycle !== SessionLifecycle.Ready || !workingDirectories?.length || !chatSummary
				|| isSessionChatArchived(chatSummary) === attached) {
				return;
			}
			const provider = this._providerService.getProviderForSession(session);
			if (!provider?.getDescriptor().capabilities?.multipleWorkingDirectories) {
				return;
			}
			const chatDirectories = this._getChatFamilyWorkingDirectories(state.chats, chatSummary.resource, !attached);
			if (!chatDirectories.length) {
				return;
			}
			const isAttached = (directory: string) => workingDirectories.some(candidate => isEqual(URI.parse(candidate), URI.parse(directory)));
			if (attached) {
				const missing = chatDirectories.filter(directory => !isAttached(directory));
				for (const directory of missing) {
					await this._attachSessionWorkingDirectoryForChat(session, URI.parse(directory));
				}
				if (missing.length) {
					this._publishWorkingDirectoryIdentities(sessionKey);
					await this._persistSessionWorkingDirectories(session);
				}
				return;
			}

			await this._detachChatWorkingDirectories(session, state.chats, chatSummary.resource, chatDirectories);
		});
	}

	/**
	 * The folders of `chat` and of the subagents and side chats it spawned,
	 * directly or through other spawned chats. A subagent's folders are only
	 * included with `includeSubagents`, as they are never considered in use.
	 */
	private _getChatFamilyWorkingDirectories(chats: readonly ChatSummary[], chat: string, includeSubagents: boolean): string[] {
		const byResource = new Map(chats.map(candidate => [candidate.resource, candidate]));
		const isSpawnedBy = (candidate: ChatSummary) => {
			const visited = new Set<string>();
			let current: ChatSummary | undefined = candidate;
			while (current && !visited.has(current.resource)) {
				if (current.resource === chat) {
					return true;
				}
				visited.add(current.resource);
				if (current.origin?.kind !== ChatOriginKind.Tool && current.origin?.kind !== ChatOriginKind.SideChat) {
					return false;
				}
				// Checked before the lookup, as a deleted chat is no longer listed.
				if (current.origin.chat === chat) {
					return true;
				}
				current = byResource.get(current.origin.chat);
			}
			return false;
		};
		const result: string[] = [];
		for (const candidate of chats) {
			if ((!includeSubagents && candidate.origin?.kind === ChatOriginKind.Tool) || !isSpawnedBy(candidate)) {
				continue;
			}
			for (const directory of candidate.workingDirectories ?? []) {
				if (!result.some(existing => isEqual(URI.parse(existing), URI.parse(directory)))) {
					result.push(directory);
				}
			}
		}
		return result;
	}

	/**
	 * Detaches the folders a chat that moved out of `session` worked in that no remaining chat uses, as for a deleted
	 * chat: their Git and GitHub state went with the chat (`chatMoveFolderTransfers`). The move doesn't fail with it.
	 */
	private async _detachMovedChatWorkingDirectories(session: URI, chat: string, chatDirectories: readonly string[]): Promise<void> {
		if (!chatDirectories.length) {
			return;
		}
		try {
			await this._detachDeletedChatWorkingDirectories(session, chat, chatDirectories);
		} catch (error) {
			this._logService.error(`[AgentService] Failed to detach the folders of chat ${chat}, which moved out of ${session.toString()}: ${toErrorMessage(error)}`);
		}
	}

	/**
	 * Detaches the folders of a deleted chat and of the chats it spawned that no
	 * remaining chat uses from the aggregate session workspace, as for an archived chat.
	 */
	private _detachDeletedChatWorkingDirectories(session: URI, chat: string, chatDirectories: readonly string[]): Promise<void> {
		const sessionKey = session.toString();
		return this._additionalWorktreeSequencer.queue(sessionKey, async () => {
			const state = this._stateManager.getSessionState(sessionKey);
			if (!state || state.lifecycle !== SessionLifecycle.Ready || !this._providerService.getProviderForSession(session)?.getDescriptor().capabilities?.multipleWorkingDirectories) {
				return;
			}
			await this._detachChatWorkingDirectories(session, state.chats, chat, chatDirectories);
		});
	}

	/** Removes `chatDirectories` from the session workspace unless one is the primary folder or another chat in use works in it. */
	private async _detachChatWorkingDirectories(session: URI, chats: readonly ChatSummary[], chat: string, chatDirectories: readonly string[]): Promise<void> {
		const sessionKey = session.toString();
		const workingDirectories = this._stateManager.getSessionSummary(sessionKey)?.workingDirectories;
		if (!workingDirectories?.length) {
			return;
		}
		const { capability } = this._getChatWorkingDirectoryContext(session);
		const usedScopes = this._getWorkingDirectoriesInUse(chats, chat, this._sessionFoldersOfChatWithoutOwn(sessionKey));
		if (usedScopes.some(scope => scope === undefined)) {
			return;
		}
		const primary = URI.parse(workingDirectories[0]);
		let removed = false;
		for (const directory of chatDirectories) {
			const uri = URI.parse(directory);
			const current = this._stateManager.getSessionSummary(sessionKey)?.workingDirectories ?? [];
			if (isEqual(uri, primary) || !current.some(candidate => isEqual(URI.parse(candidate), uri))
				|| usedScopes.some(scope => scope?.some(other => isEqual(URI.parse(other), uri)))
				|| this._isChatWorkingDirectoryReserved(session, uri)) {
				continue;
			}
			this._stateManager.dispatchServerAction(sessionKey, resolveSessionWorkingDirectoryAction({
				type: ActionType.SessionWorkingDirectoryRemoved,
				directory,
			}, current, capability));
			removed = true;
		}
		if (removed) {
			this._publishWorkingDirectoryIdentities(sessionKey);
			await this._persistSessionWorkingDirectories(session);
		}
	}

	/**
	 * The folder scopes of the session's unarchived chats other than `excludedChat`.
	 * A subagent's own folders are never considered: it works in the folders of
	 * the chat that spawned it. A side chat works in its own folders, or else in
	 * those of its spawning chat. Both are in use only while their spawning chat
	 * is. A chat without folders of its own works in `inheritedFolders` (see
	 * {@link inheritedChatFolders}). `undefined` marks a chat whose spawning chat is unknown.
	 */
	private _getWorkingDirectoriesInUse(chats: readonly ChatSummary[], excludedChat: string | undefined, inheritedFolders: readonly string[]): readonly (readonly string[] | undefined)[] {
		const byResource = new Map(chats.map(chat => [chat.resource, chat]));
		const ownWorkingDirectories = (chat: ChatSummary | undefined) => chat?.origin?.kind === ChatOriginKind.Tool ? undefined : chat?.workingDirectories;
		const scopes: (readonly string[] | undefined)[] = [];
		for (const chat of chats) {
			let workingDirectories = ownWorkingDirectories(chat);
			let owner: ChatSummary | undefined = chat;
			let ownerResource = chat.resource;
			const visited = new Set<string>();
			while (owner && (owner.origin?.kind === ChatOriginKind.Tool || owner.origin?.kind === ChatOriginKind.SideChat) && !visited.has(owner.resource)) {
				visited.add(owner.resource);
				ownerResource = owner.origin.chat;
				owner = byResource.get(ownerResource);
				workingDirectories ??= ownWorkingDirectories(owner);
			}
			// A chat a workspace is applied to has not started: without folders of its own it holds none of the session's.
			if (ownerResource === excludedChat || (owner && isSessionChatArchived(owner)) || (workingDirectories === undefined && this._applyingChatWorkspaces.has(ownerResource))) {
				continue;
			}
			scopes.push(workingDirectories ?? (owner ? inheritedFolders : undefined));
		}
		return scopes;
	}

	private async _persistSessionWorkingDirectories(session: URI): Promise<void> {
		if (this._stateManager.isEphemeralSession(session.toString())) {
			return;
		}
		await this._persistListVisibleSessionState(session, {
			[SESSION_WORKING_DIRECTORIES_KEY]: JSON.stringify(this._stateManager.getSessionSummary(session.toString())?.workingDirectories ?? []),
		});
	}

	private async _attachSessionWorkingDirectoryForChat(session: URI, directory: URI): Promise<URI> {
		const sessionKey = session.toString();
		const { workingDirectories, capability } = this._getChatWorkingDirectoryContext(session);
		const action = resolveSessionWorkingDirectoryAction({
			type: ActionType.SessionWorkingDirectorySet,
			directory: directory.toString(),
		}, workingDirectories, capability);
		const canonicalDirectory = URI.parse(action.directory);
		if (workingDirectories.includes(action.directory)) {
			return canonicalDirectory;
		}

		await this._pinInheritedChatWorkingDirectories(session, workingDirectories);
		this._stateManager.dispatchServerAction(sessionKey, action);
		return canonicalDirectory;
	}

	private _getChatWorkingDirectoryContext(session: URI): { workingDirectories: readonly string[]; capability: { immutablePrimary: boolean; primaryReplacement: boolean } } {
		const sessionKey = session.toString();
		const state = this._stateManager.getSessionState(sessionKey);
		const workingDirectories = this._stateManager.getSessionSummary(sessionKey)?.workingDirectories;
		if (!state || state.lifecycle !== SessionLifecycle.Ready || !workingDirectories?.length) {
			throw new Error(`Session is not ready for working-directory changes: ${sessionKey}`);
		}
		const provider = this._providerService.getProviderForSession(session);
		const capability = provider?.getDescriptor().capabilities?.multipleWorkingDirectories;
		if (!provider || !capability) {
			throw new Error(`Provider does not support chat working directories: ${AgentSession.provider(session) ?? '(unknown)'}`);
		}
		return {
			workingDirectories,
			capability: {
				immutablePrimary: capability.immutablePrimary === true,
				primaryReplacement: capability.primaryReplacement === true,
			},
		};
	}

	private async _pinInheritedChatWorkingDirectories(session: URI, sessionFolders: readonly string[]): Promise<void> {
		const sessionKey = session.toString();
		await this._restoredSubagentAdmissionRetries.get(sessionKey)?.run();
		const state = this._stateManager.getSessionState(sessionKey);
		if (!state) {
			throw new Error(`Session is not ready for working-directory changes: ${sessionKey}`);
		}
		// What they work in now: never another chat's scratch folder, which pinning would make their own.
		const workingDirectories = inheritedChatFolders(this._stateManager, sessionFolders, readSessionWorkspaceless(state._meta));
		// A chat a workspace is applied to gets a folder of its own, or keeps none when that fails: it is never pinned.
		const inheritingChats = state.chats.filter(chat => chat.workingDirectories === undefined && !this._disposingPeerChats.has(chat.resource) && !this._applyingChatWorkspaces.has(chat.resource));
		// A session a move loaded with its data only (C15) opens none of its chats: a chat not opened is pinned on its
		// summary, which its state starts from when it is opened.
		const dataOnly = this._stateManager.isDataOnlySession(sessionKey);
		const resolvedChats = await Promise.all(inheritingChats.map(async chat => ({
			summary: chat,
			state: dataOnly ? this._stateManager.getChatState(chat.resource) : await this._stateManager.resolveChatState(chat.resource),
		})));
		const unresolvedChat = dataOnly ? undefined : resolvedChats.find(chat => chat.state === undefined);
		if (unresolvedChat) {
			throw new Error(`Cannot preserve the working directories of chat ${unresolvedChat.summary.resource}.`);
		}

		for (const chat of resolvedChats) {
			if (chat.state?.workingDirectories !== undefined || this._disposingPeerChats.has(chat.summary.resource)
				|| !this._stateManager.getSessionState(sessionKey)?.chats.some(current => current.resource === chat.summary.resource)) {
				continue;
			}
			if (this._chatOwnership.isDefaultChat(sessionKey, chat.summary.resource)) {
				await this._peerChatStore.persistMetadata(session, URI.parse(chat.summary.resource), {
					[CHAT_WORKING_DIRECTORIES_METADATA_KEY]: JSON.stringify(workingDirectories),
				});
			} else {
				await this._peerChatStore.updateWorkingDirectories(session, URI.parse(chat.summary.resource), workingDirectories);
			}
			await this._recordLaunchDirectories(session, [{ chat: chat.summary.resource, isDefault: this._chatOwnership.isDefaultChat(sessionKey, chat.summary.resource) }], workingDirectories);
		}
		this._stateManager.runWithBatchedWorkingDirectoryChanges(() => {
			for (const chat of resolvedChats) {
				if (chat.state?.workingDirectories !== undefined || this._disposingPeerChats.has(chat.summary.resource)
					|| !this._stateManager.getSessionState(sessionKey)?.chats.some(current => current.resource === chat.summary.resource)) {
					continue;
				}
				for (const workingDirectory of chat.state ? workingDirectories : []) {
					this._stateManager.dispatchServerAction(chat.summary.resource, {
						type: ActionType.ChatWorkingDirectorySet,
						directory: workingDirectory,
					});
				}
				this._stateManager.dispatchServerAction(sessionKey, {
					type: ActionType.SessionChatUpdated,
					chat: chat.summary.resource,
					changes: { workingDirectories: [...workingDirectories] },
				});
			}
		});
	}

	/**
	 * Carries host-written session config through a client replacement. A client
	 * may legitimately replace its own config wholesale, but omitting a host-owned
	 * key must not clear it, since that would reset Agent Merge authorization state.
	 * The client's Agent Merge settings are carried too unless the replacement
	 * sets them: the host changes them as well (a self-disable, a demoted merge
	 * choice), which a client's copy may not reflect yet.
	 */
	private _withPreservedHostWrittenSessionConfig(session: string, action: SessionConfigChangedAction): SessionConfigChangedAction {
		const values = this._stateManager.getSessionState(session.toString())?.config?.values;
		if (!values) {
			return action;
		}
		let preserved: Record<string, unknown> | undefined;
		const clientAgentMergeKeys = [SessionConfigKey.AgentMerge, SessionConfigKey.AgentMergeFolders].filter(key => !Object.hasOwn(action.config, key));
		for (const key of [...HOST_WRITTEN_SESSION_CONFIG_KEYS, ...clientAgentMergeKeys]) {
			if (Object.hasOwn(values, key)) {
				preserved ??= {};
				preserved[key] = values[key];
			}
		}
		return preserved ? { ...action, config: { ...action.config, ...preserved } } : action;
	}

	/**
	 * Validates a client's change of a chat's own config. Only properties the
	 * session's schema lets a chat set are accepted, and never host-written or
	 * read-only ones. A subagent inherits its config from the chat that spawned
	 * it and has none of its own. A replacement keeps the host-written values.
	 */
	private _prepareChatConfigAction(chat: string, session: string, action: ChatConfigChangedAction): ChatConfigChangedAction {
		if (!isAhpChatChannel(chat) || this._chatOwnership.getChatOwner(chat) !== session) {
			throw new Error('Chat config can only be changed on a registered chat.');
		}
		if (this._stateManager.getChatOrigin(chat)?.kind === ChatOriginKind.Tool) {
			throw new Error('A subagent chat inherits its config from the chat that spawned it.');
		}
		const schema = this._stateManager.getSessionState(session)?.config?.schema;
		if (!schema) {
			throw new Error('The session has no config.');
		}
		const target = { session, chat };
		const values = this._configurationService.getChatConfigValues(target) ?? {};
		const hostWritten = (key: string) => (HOST_WRITTEN_SESSION_CONFIG_KEYS as readonly string[]).includes(key) || schema.properties[key]?.readOnly === true;
		for (const [key, value] of Object.entries(action.config)) {
			if (hostWritten(key)) {
				throw new Error(`Chat config '${key}' is host-owned and cannot be set by a client.`);
			}
			validateChatConfigWrite(schema, values, key, value);
		}
		const own = this._configurationService.getChatOwnConfigValues(target);
		// The chat's reported approval mode described its previous approvals: a client choosing others drops it,
		// so the chat shows its choice until its runtime reports the mode it applies.
		const approvalKey = getSessionApprovalProperty(schema)?.key;
		const staleMode = approvalKey !== undefined && Object.hasOwn(action.config, approvalKey) && Object.hasOwn(own, 'effectiveApprovalMode')
			&& !equals(own[approvalKey], action.config[approvalKey]);
		if (!action.replace && !staleMode) {
			return action;
		}
		const kept = Object.fromEntries(Object.entries(own).filter(([key]) => (action.replace ? hostWritten(key) : true) && !(staleMode && key === 'effectiveApprovalMode')));
		return Object.keys(kept).length === 0 && !staleMode ? action : { ...action, config: { ...kept, ...action.config }, replace: true };
	}

	/**
	 * A client writes only the Agent Merge folders it changes, so its write is
	 * merged into the current folders rather than replacing them; see
	 * {@link mergeClientAgentMergeFolders}.
	 */
	/**
	 * The config values a new chat starts with as its own. A fork or side chat
	 * copies its source chat's own values. Any other chat (D1, as before chats
	 * had their own values) starts with what the default chat currently uses
	 * for the properties a chat may set: its own values, else the session's;
	 * read-only properties are host-reported and not copied. Agent Merge's
	 * elevation belongs to the chat it runs in (or the session), not to a copy.
	 */
	private _initialChatConfig(session: string, chat: string, origin: ChatOrigin | undefined): Readonly<Record<string, unknown>> {
		if (origin?.kind === ChatOriginKind.Fork || origin?.kind === ChatOriginKind.SideChat) {
			const sourceSession = this._stateManager.getChatOwner(origin.chat) ?? session;
			return withoutAgentMergeElevation(
				this._configurationService.getChatOwnConfigValues({ session: sourceSession, chat: origin.chat }),
				readAgentMergeChatInjectedConfigurations(this._configurationService.getSessionConfigValues(sourceSession)).get(origin.chat),
			);
		}
		const defaultChat = this._stateManager.getDefaultChat(session);
		const config = this._stateManager.getSessionState(session)?.config;
		if (origin?.kind === ChatOriginKind.Tool || defaultChat === undefined || defaultChat === chat || !config) {
			return {};
		}
		const effective = this._configurationService.getChatConfigValues({ session, chat: defaultChat }) ?? {};
		const seed = Object.fromEntries(Object.entries(filterChatConfigValues(config.schema, effective)).filter(([key]) => config.schema.properties[key]?.readOnly !== true));
		const sessionValues = this._configurationService.getSessionConfigValues(session);
		return withoutAgentMergeElevation(
			withoutAgentMergeElevation(seed, readAgentMergeChatInjectedConfigurations(sessionValues).get(defaultChat)),
			readAgentMergeInjectedConfiguration(sessionValues),
		);
	}

	private _withMergedClientAgentMergeFolders(session: string, action: SessionConfigChangedAction): SessionConfigChangedAction {
		const state = this._stateManager.getSessionState(session);
		const defaultChat = this._defaultChat(session);
		// The session's folders and each chat's, as a chat may work in a folder the session was not created with.
		const sessionWorkingDirectories = [
			...(this._stateManager.getSessionSummary(session)?.workingDirectories ?? []),
			...(state?.chats.flatMap(chat => chat.workingDirectories ?? []) ?? []),
		];
		const sessionFolders = new Set(sessionWorkingDirectories.map(getWorkingDirectoryKey));
		const folders = mergeClientAgentMergeFolders(state?.config?.values, action.config[SessionConfigKey.AgentMergeFolders],
			folderKey => sessionFolders.has(folderKey),
			chat => chat === defaultChat || state?.chats.some(candidate => candidate.resource === chat) === true);
		let meta = state?._meta;
		for (const workingDirectory of sessionWorkingDirectories) {
			meta = withWorkingDirectoryKey(meta, workingDirectory);
		}
		if (meta !== state?._meta) {
			this._stateManager.setSessionMeta(session, meta);
		}
		return { ...action, config: { ...action.config, [SessionConfigKey.AgentMergeFolders]: folders } };
	}

	/** Client actions that would end or detach the host-owned turn an in-flight workspace conversion depends on. */
	private _getWorkspaceConversionRejection(channel: string, action: SessionAction | ChatAction | TerminalAction | ClientChangesetAction | ClientAnnotationsAction | IRootConfigChangedAction): string | undefined {
		const isConversionChat = (chat: string) => {
			const activeTurnId = this._stateManager.getActiveTurnId(chat);
			return !!activeTurnId && this._workspaceConversionService.isConversionTurn(chat, activeTurnId);
		};
		switch (action.type) {
			case ActionType.ChatTurnCancelled:
				return this._workspaceConversionService.isConversionTurn(channel, action.turnId)
					? localize('agentHost.cannotCancelWorkspaceChange', "Cannot cancel while the workspace is changing.")
					: undefined;
			case ActionType.ChatPendingMessageSet:
				if (this._applyingChatWorkspaces.has(channel)) {
					return localize('agentHost.cannotQueueChatWorkspaceChange', "Cannot send a message while the chat's workspace is changing.");
				}
				return action.kind === PendingMessageKind.Steering && isConversionChat(channel)
					? localize('agentHost.cannotSteerWorkspaceChange', "Cannot steer while the workspace is changing.")
					: undefined;
			case ActionType.ChatTurnStarted:
				if (this._applyingChatWorkspaces.has(channel)) {
					return localize('agentHost.cannotStartTurnChatWorkspaceChange', "Cannot send a message while the chat's workspace is changing.");
				}
				return isConversionChat(channel)
					? localize('agentHost.cannotStartTurnWorkspaceChange', "Cannot send a message while the workspace is changing.")
					: undefined;
			case ActionType.ChatTruncated:
				return isConversionChat(channel)
					? localize('agentHost.cannotTruncateWorkspaceChange', "Cannot clear history while the workspace is changing.")
					: undefined;
			case ActionType.ChatIsArchivedChanged:
				return action.isArchived && isConversionChat(channel)
					? localize('agentHost.cannotArchiveChatWorkspaceChange', "Cannot archive a chat while its workspace is changing.")
					: undefined;
			case ActionType.SessionIsArchivedChanged:
				return action.isArchived && this._stateManager.getSessionState(channel)?.chats.some(chat => isConversionChat(chat.resource))
					? localize('agentHost.cannotArchiveSessionWorkspaceChange', "Cannot archive a session while a workspace is changing.")
					: undefined;
			default:
				return undefined;
		}
	}

	/** Rejects chat metadata actions that only a known (and, for archiving, independently manageable) chat accepts. */
	private _rejectUnknownChatAction(channel: string, action: SessionAction | ChatAction | TerminalAction | ClientChangesetAction | ClientAnnotationsAction | IRootConfigChangedAction, origin: { readonly clientId: string; readonly clientSeq: number }): boolean {
		if (action.type !== ActionType.ChatIsArchivedChanged && action.type !== ActionType.ChatIsReadChanged) {
			return false;
		}
		const owner = this._chatOwnership.getChatOwner(channel);
		// The origin is recorded on the chat summary, so a chat whose history is not materialized is checked too.
		const chatOrigin = this._stateManager.getChatOrigin(channel);
		if (action.type === ActionType.ChatIsArchivedChanged
			&& (owner === undefined || this._chatOwnership.isDefaultChat(owner, channel) || chatOrigin?.kind === ChatOriginKind.Tool || chatOrigin?.kind === ChatOriginKind.SideChat)) {
			this._stateManager.rejectClientAction(channel, action, origin, UNMANAGEABLE_CHAT_ARCHIVE_REJECTION);
			return true;
		}
		if (action.type === ActionType.ChatIsReadChanged && owner === undefined) {
			this._stateManager.rejectClientAction(channel, action, origin, 'Only a known chat can change its read state.');
			return true;
		}
		return false;
	}

	/** Whether a chat action reduces into a registered chat's summary, so its history need not be resolved first. */
	private _appliesWithoutChatState(chat: string, action: SessionAction | ChatAction | TerminalAction | ClientChangesetAction | ClientAnnotationsAction | IRootConfigChangedAction): boolean {
		return (action.type === ActionType.ChatIsReadChanged || action.type === ActionType.ChatIsArchivedChanged) && this._chatOwnership.getChatOwner(chat) !== undefined;
	}

	/** Returns the latest errored turn of a chat if `chat/turnResume` may restart it, or why it may not. */
	private _getResumableTurn(channel: string, sessionChannel: string, turnId: string): { readonly turn: Turn; readonly rejection?: undefined } | { readonly turn?: undefined; readonly rejection: string } {
		if (!isAhpChatChannel(channel)) {
			return { rejection: 'Turn resume requires a chat channel.' };
		}
		if (this._workspaceConversionService.isPending(channel)) {
			return { rejection: 'Cannot resume while workspace setup is pending or blocked.' };
		}
		const chatState = this._stateManager.getChatState(channel);
		const sessionState = this._stateManager.getSessionState(sessionChannel);
		const sessionArchived = ((sessionState?.status ?? 0) & SessionStatus.IsArchived) === SessionStatus.IsArchived;
		const turn = chatState?.turns.at(-1);
		const errorPart = getErrorResponsePart(turn);
		const provider = this._providerService.getProviderForSession(sessionChannel);
		if (chatState?.activeTurn) {
			return { rejection: 'Cannot resume while a turn is active.' };
		}
		if (isChatReadOnly(chatState?.interactivity, sessionArchived)) {
			return { rejection: 'Cannot resume a read-only or archived chat.' };
		}
		if (!turn || turn.id !== turnId || turn.state !== TurnState.Error || errorPart?.resumable !== true) {
			return { rejection: 'The requested turn is not the latest resumable errored turn.' };
		}
		if (!provider?.chats.resumeTurn) {
			return { rejection: 'The session provider does not support turn resume.' };
		}
		return { turn };
	}

	private _dispatchActionNow(channel: string, sessionChannel: string, action: SessionAction | ChatAction | TerminalAction | ClientChangesetAction | ClientAnnotationsAction | IRootConfigChangedAction, clientId: string, clientSeq: number, clientContext: IAgentHostClientTelemetryContext, credentials?: IAgentHostCredentialSource): void {
		const origin = { clientId, clientSeq };
		if (action.type === ActionType.ChatPendingMessageSet || action.type === ActionType.ChatPendingMessageRemoved) {
			const id = action.id;
			const state = this._stateManager.getChatState(channel);
			const existing = state?.queuedMessages?.find(message => message.id === id);
			if (action.type === ActionType.ChatPendingMessageSet && action.kind === PendingMessageKind.Steering && !this._providerService.getProviderForSession(sessionChannel)?.sendSteeringMessage) {
				this._stateManager.rejectClientAction(channel, action, origin, 'The session provider does not support steering messages.');
				return;
			}
			// Steering handed to the provider cannot be edited, and can be removed only if the provider can withdraw it.
			if (state?.activeTurn && existing?.kind === PendingMessageKind.Steering
				&& (action.type === ActionType.ChatPendingMessageRemoved
					? action.kind === PendingMessageKind.Steering && !this._providerService.getProviderForSession(sessionChannel)?.withdrawSteeringMessage
					: action.kind !== existing.kind || !equals(existing.message, action.message))) {
				this._stateManager.rejectClientAction(channel, action, origin, 'Cannot change a steering message while it is being processed.');
				return;
			}
		}
		if (this._rejectUnknownChatAction(channel, action, origin)) {
			return;
		}
		if (action.type === ActionType.SessionIsArchivedChanged && !action.isArchived && this._sessionResidency.isBeingDisposed(sessionChannel)) {
			this._stateManager.rejectClientAction(channel, action, origin, 'Cannot unarchive a session while it is being deleted.');
			return;
		}
		if (action.type === ActionType.ChatIsArchivedChanged && !action.isArchived && this._sessionResidency.isBeingDisposed(sessionChannel)) {
			this._stateManager.rejectClientAction(channel, action, origin, 'Cannot unarchive a chat while its session is being deleted.');
			return;
		}
		const conversionRejection = this._getWorkspaceConversionRejection(channel, action);
		if (conversionRejection) {
			this._stateManager.rejectClientAction(channel, action, origin, conversionRejection);
			return;
		}
		if (action.type === ActionType.ChatTurnCancelled) {
			// Match the turn before reduction so stale no-ops cannot trigger a chat-wide abort.
			if (this._stateManager.getChatState(channel)?.activeTurn?.id !== action.turnId) {
				this._logService.trace(`[AgentService] Ignoring cancellation of an inactive turn: channel=${channel}, turnId=${action.turnId}`);
				this._stateManager.dispatchClientAction(channel, action, origin, clientContext);
				return;
			}
			const resumedDuration = this._sideEffects.getResumedTurnDuration(channel, action.turnId);
			if (resumedDuration !== undefined) {
				action = { ...action, duration: resumedDuration };
			}
		}
		let resumedTurn: Turn | undefined;
		if (action.type === ActionType.ChatTurnResume) {
			const { turn, rejection } = this._getResumableTurn(channel, sessionChannel, action.turnId);
			if (rejection !== undefined) {
				this._stateManager.rejectClientAction(channel, action, origin, rejection);
				return;
			}
			resumedTurn = turn;
		}
		// Client replacements must neither overwrite nor drop host-owned authorization state or runtime reports.
		if (action.type === ActionType.SessionConfigChanged) {
			const configAction = action as SessionConfigChangedAction;
			const current = this._stateManager.getSessionState(sessionChannel)?.config;
			if (current?.schema.properties.availableApprovalModes?.readOnly === true) {
				try {
					if (['availableApprovalModes', 'effectiveApprovalMode'].some(key => Object.hasOwn(configAction.config, key) && !equals(configAction.config[key], current.values[key]))) {
						throw new Error('Reported permission modes are host-owned.');
					}
					const approvalKey = getSessionApprovalProperty(current.schema)?.key ?? SessionConfigKey.AutoApprove;
					if (Object.hasOwn(configAction.config, approvalKey)) {
						if (current.schema.properties[approvalKey]?.readOnly) {
							throw new Error('Session approval mode is read-only.');
						}
						validateSessionConfigWrite(current.schema, current.values, approvalKey, configAction.config[approvalKey], false);
					}
				} catch (error) {
					this._stateManager.rejectClientAction(channel, action, origin, toErrorMessage(error));
					return;
				}
				if (configAction.replace) {
					action = {
						...configAction, config: {
							...configAction.config,
							availableApprovalModes: current.values.availableApprovalModes,
							...(current.values.effectiveApprovalMode === undefined ? {} : { effectiveApprovalMode: current.values.effectiveApprovalMode }),
						}
					};
				}
			}
			const forbidden = HOST_WRITTEN_SESSION_CONFIG_KEYS.filter(key => Object.hasOwn(configAction.config, key));
			if (forbidden.length > 0) {
				this._stateManager.rejectClientAction(channel, action, origin, `Session config keys are host-owned and cannot be set by a client: ${forbidden.join(', ')}.`);
				return;
			}
			if (Object.hasOwn(configAction.config, SessionConfigKey.AgentMergeFolders)) {
				action = this._withMergedClientAgentMergeFolders(sessionChannel, action as SessionConfigChangedAction);
			}
			if (configAction.replace) {
				action = this._withPreservedHostWrittenSessionConfig(sessionChannel, action as SessionConfigChangedAction);
			}
		}
		if (action.type === ActionType.ChatConfigChanged) {
			try {
				action = this._prepareChatConfigAction(channel, sessionChannel, action as ChatConfigChangedAction);
			} catch (error) {
				this._stateManager.rejectClientAction(channel, action, origin, toErrorMessage(error));
				return;
			}
		}
		// `session/workingDirectoryReplaced` is client-dispatchable in the
		// protocol, but no provider advertises `primaryReplacement` and the host
		// has no backend side effect for it. Reject it rather than let the
		// reducer apply an unvalidated, uncanonicalized mutation.
		if (action.type === ActionType.SessionWorkingDirectoryReplaced) {
			this._stateManager.rejectClientAction(channel, action, origin, 'Session working-directory replacement is not supported.');
			return;
		}
		if (action.type === ActionType.SessionWorkingDirectorySet
			|| action.type === ActionType.SessionWorkingDirectoryRemoved) {
			if (clientContext.clientType !== AgentHostClientType.EditorWindow) {
				this._stateManager.rejectClientAction(channel, action, origin, 'Session working-directory actions require an Editor Window client.');
				return;
			}
			if (channel !== sessionChannel) {
				this._stateManager.rejectClientAction(channel, action, origin, 'Session working-directory actions require a session channel.');
				return;
			}
			try {
				action = this._prepareWorkingDirectoryAction(sessionChannel, action);
			} catch (error) {
				this._stateManager.rejectClientAction(channel, action, origin, toErrorMessage(error));
				return;
			}
		}
		if (action.type === ActionType.RootConfigChanged) {
			action = supersedeTitleGenerationStrategyForLegacyUpdate(this._stateManager.rootState.config?.values, action);
		}
		const dispatch = () => this._stateManager.dispatchClientAction(channel, action, origin, clientContext);
		if (credentials && action.type === ActionType.SessionConfigChanged
			&& (action.config[SessionConfigKey.AgentMerge] !== undefined || action.config[SessionConfigKey.AgentMergeFolders] !== undefined)) {
			this._agentMergeController.dispatchConfigurationWithCredentials(sessionChannel, action.config, credentials, dispatch);
		} else {
			dispatch();
		}
		if (action.type === ActionType.RootConfigChanged) {
			this._configurationService.persistRootConfig();
			const editTelemetryEnabled = action.config[AgentHostEditTelemetryEnabledConfigKey];
			if (typeof editTelemetryEnabled === 'boolean') {
				this._editAttributionService.setEnabled(editTelemetryEnabled);
			}
			void this._automationService.handleConfigurationChanged().catch(error => {
				this._logService.error(`[AgentService] Failed to apply Automation configuration: ${toErrorMessage(error)}`);
			});
		}
		if (action.type === ActionType.SessionWorkingDirectorySet
			|| action.type === ActionType.SessionWorkingDirectoryRemoved
			|| action.type === ActionType.SessionChatAdded
			|| action.type === ActionType.SessionChatUpdated
			|| action.type === ActionType.ChatWorkingDirectorySet
			|| action.type === ActionType.ChatWorkingDirectoryRemoved) {
			this._publishWorkingDirectoryIdentities(sessionChannel);
		}
		this._sideEffects.handleAction(channel, action, clientId, clientContext, resumedTurn, false, clientSeq, credentials);
	}

	private _publishWorkingDirectoryIdentities(sessionChannel: string): void {
		const state = this._stateManager.getSessionState(sessionChannel);
		if (!state) {
			return;
		}
		const folders = this._stateManager.getSessionSummary(sessionChannel)?.workingDirectories ?? state.workingDirectories;
		const nextMeta = withSessionScratchFolders(
			withPublishedWorkingDirectoryIdentities(state._meta, folders, state.chats),
			publishedScratchFolders(folder => this._stateManager.isScratchFolder(folder), readSessionWorkspaceless(state._meta), folders ?? [], state.chats.flatMap(chat => chat.workingDirectories ?? [])));
		if (!equals(state._meta, nextMeta)) {
			this._stateManager.setSessionMeta(sessionChannel, nextMeta);
		}
	}
	private _needsAsyncRewrite(sessionURI: string, channel: string, action: SessionAction | ChatAction | TerminalAction | ClientChangesetAction | ClientAnnotationsAction | IRootConfigChangedAction): action is ChatTurnStartedAction | ChatPendingMessageSetAction {
		if (action.type !== ActionType.ChatTurnStarted && action.type !== ActionType.ChatPendingMessageSet) {
			return false;
		}
		const { known } = this._attachmentRoots(sessionURI, channel);
		return !!action.message.attachments?.some(a =>
			this._isRewritableAttachment(a, known) || this._isUntaggedSnapshotResource(a, known));
	}
	private _isRewritableAttachment(attachment: MessageAttachment, attachmentsRoots: readonly URI[]): boolean {
		if (attachment.type === MessageAttachmentKind.EmbeddedResource) {
			return true;
		}
		if (attachment.type === MessageAttachmentKind.Resource) {
			// Don't try to fetch directories or already-rewritten attachments
			// (whose URIs already point under our session attachments folder).
			if (attachment.displayKind === 'directory') {
				return false;
			}
			if (this._isUnderAttachmentsRoot(attachment.uri, attachmentsRoots)) {
				return false;
			}
			return true;
		}
		return false;
	}

	/**
	 * A {@link MessageAttachmentKind.Resource} that already points inside our session attachments
	 * folder but is not yet tagged as a host snapshot. This happens when a previously snapshotted
	 * copy is re-attached (e.g. the user opens the copy, or implicit context captures it). It must
	 * not be re-snapshotted, but it must still be tagged so downstream providers treat it as
	 * read-only rather than an editable file (#331154).
	 */
	private _isUntaggedSnapshotResource(attachment: MessageAttachment, attachmentsRoots: readonly URI[]): boolean {
		return attachment.type === MessageAttachmentKind.Resource
			&& attachment.displayKind !== 'directory'
			&& this._isUnderAttachmentsRoot(attachment.uri, attachmentsRoots)
			&& !isHostSnapshotAttachment(attachment);
	}

	/**
	 * Whether an attachment URI points at the session attachments directory or a descendant. Uses URI
	 * containment (not a string-prefix check) so a sibling such as `.../attachments-backup/file` is not
	 * matched, and — on case-insensitive filesystems — a real snapshot whose path casing differs is
	 * still recognised. Mirrors the write-deny classifier (`isSessionAttachmentPath`).
	 */
	private _isUnderAttachmentsRoot(attachmentUri: string, attachmentsRoots: readonly URI[]): boolean {
		return attachmentsRoots.some(root => extUriBiasedIgnorePathCase.isEqualOrParent(URI.parse(attachmentUri), root));
	}

	/**
	 * Where a chat's attachment snapshots are written: the data directory of its recorded storage (the session's for
	 * its default chat), so they stay with the chat when it moves and go when it is deleted (Block 4). `known` are all
	 * the directories it keeps snapshots in: also its session's and, for a moved chat, the session it came from.
	 */
	private _attachmentRoots(session: string, channel: string): { readonly write: URI; readonly known: readonly URI[] } {
		const chat = isAhpChatChannel(channel) ? channel : undefined;
		const storage = chat === undefined ? session : this._chatOwnership.getChatStorageResource(chat) ?? this._chatOwnership.resolveChatStorageResource(session, chat);
		const scopes = [...new Set([storage, session, ...(chat !== undefined ? this._stateManager.getChatAttachmentScopes(chat) ?? [] : [])])];
		const root = (scope: string) => joinPath(this._sessionDataService.getSessionDataDir(URI.parse(scope)), SESSION_ATTACHMENTS_DIRNAME);
		return { write: root(storage), known: scopes.map(root) };
	}

	/**
	 * Snapshot inline / client-resident attachment payloads onto disk
	 * under the session's data directory and rewrite the action to
	 * reference them via local `file:` URIs. Keeps potentially large
	 * blobs (e.g. pasted text or images) out of the in-memory state tree while
	 * letting the agent consume them via the standard {@link IFileService}
	 * surface — no special URI scheme or blob round-tripping needed.
	 *
	 * Failures are isolated per-attachment: if a rewrite cannot be
	 * performed (no client connection registered, `resourceRead` rejects,
	 * etc.) the original attachment is preserved so the agent still has a
	 * chance to make use of it.
	 */
	private async _rewriteUserMessageAttachments<T extends ChatTurnStartedAction | ChatPendingMessageSetAction>(channel: string, chatChannel: string, action: T, clientId: string, throwOnFailure = false): Promise<T> {
		const attachments = action.message.attachments;
		if (!attachments?.length) {
			return action;
		}
		const roots = this._attachmentRoots(channel, chatChannel);
		const rewritten = await Promise.all(attachments.map(a => this._rewriteSingleAttachment(a, roots, clientId, throwOnFailure)));
		return {
			...action,
			message: { ...action.message, attachments: rewritten },
		};
	}

	private async _rewriteSingleAttachment(attachment: MessageAttachment, roots: { readonly write: URI; readonly known: readonly URI[] }, clientId: string, throwOnFailure: boolean): Promise<MessageAttachment> {
		try {
			if (attachment.type === MessageAttachmentKind.EmbeddedResource) {
				const bytes = decodeBase64(attachment.data).buffer;
				const basename = this._attachmentBasename(attachment.label, attachment.contentType);
				return this._writeAndRewrite(attachment, bytes, basename, roots.write, attachment.contentType);
			}
			if (attachment.type === MessageAttachmentKind.Resource) {
				// A snapshot re-attached from our own attachments folder (e.g. the user opened the
				// copy, or implicit context captured it) must still be tagged read-only so providers
				// don't treat it as an editable file (#331154), but must not be re-snapshotted.
				if (this._isUntaggedSnapshotResource(attachment, roots.known)) {
					return this._tagSnapshotAttachment(attachment, getMediaMime(URI.parse(attachment.uri).path));
				}
				if (this._isRewritableAttachment(attachment, roots.known)) {
					const originalUri = URI.parse(attachment.uri);
					// If the attachment references a file that already exists on the agent
					// host side, leave it untouched rather than snapshotting a client copy (#319314).
					if (originalUri.scheme === Schemas.file && await this._fileExistsSafe(originalUri)) {
						return attachment;
					}

					const contentType = getMediaMime(originalUri.path);
					const bytes = await this._readClientResource(originalUri, clientId);
					const basename = this._attachmentBasename(attachment.label, contentType);
					return this._writeAndRewrite(attachment, bytes, basename, roots.write, contentType);
				}
			}
		} catch (err) {
			this._logService.warn(`[AgentService] Failed to rewrite attachment '${attachment.label}': ${toErrorMessage(err)}`);
			if (throwOnFailure) {
				throw err;
			}
		}
		return attachment;
	}

	/**
	 * Tag an existing {@link MessageResourceAttachment} as a host snapshot (read-only) without
	 * re-writing its bytes. Used for copies re-attached from the session attachments folder.
	 */
	private _tagSnapshotAttachment(attachment: MessageResourceAttachment, contentType: string | undefined): MessageResourceAttachment {
		return {
			...attachment,
			_meta: { ...attachment._meta, ...toHostSnapshotAttachmentMeta(contentType) },
		};
	}

	/**
	 * Like {@link IFileService.exists} but never throws (e.g. when no provider
	 * is registered for the URI scheme), returning `false` in that case.
	 */
	private async _fileExistsSafe(uri: URI): Promise<boolean> {
		try {
			return await this._fileService.exists(uri);
		} catch {
			return false;
		}
	}

	/**
	 * Reads `originalUri` through the `vscode-agent-client` filesystem
	 * provider so it is fetched from the originating client. Falls back to
	 * a direct read against `originalUri` when no client filesystem
	 * authority is registered for `clientId` (e.g. unit tests, in-process
	 * agent host with a local URI).
	 */
	private async _readClientResource(originalUri: URI, clientId: string): Promise<Uint8Array> {
		const proxiedUri = clientId ? toAgentClientUri(originalUri, clientId) : originalUri;
		try {
			const contents = await this._fileService.readFile(proxiedUri);
			return contents.value.buffer;
		} catch (err) {
			if (proxiedUri !== originalUri) {
				try {
					const contents = await this._fileService.readFile(originalUri);
					return contents.value.buffer;
				} catch {
					// ignore
				}
			}
			throw err;
		}
	}

	private async _writeAndRewrite(
		original: MessageAttachment,
		bytes: Uint8Array,
		basename: string,
		attachmentsRoot: URI,
		contentType: string | undefined,
	): Promise<MessageResourceAttachment> {
		const id = generateUuid();
		const target = joinPath(attachmentsRoot, id, basename);
		await this._fileService.writeFile(target, VSBuffer.wrap(bytes));
		const rewritten: MessageResourceAttachment = {
			type: MessageAttachmentKind.Resource,
			uri: target.toString(),
			label: original.label,
			displayKind: original.displayKind,
			range: original.range,
			// Tag the on-disk copy as a read-only host snapshot so downstream providers present it
			// as content (not an editable file) and never let the model edit the copy (#331154).
			_meta: { ...original._meta, ...toHostSnapshotAttachmentMeta(contentType) },
		};
		if (original.type === MessageAttachmentKind.Resource && original.selection) {
			rewritten.selection = original.selection;
		}
		return rewritten;
	}

	/**
	 * Pick a sensible on-disk basename for the snapshotted attachment,
	 * preserving a usable extension where possible so the SDK and other
	 * downstream consumers can detect the right type from the path alone.
	 */
	private _attachmentBasename(label: string, contentType: string | undefined): string {
		const safeLabel = (label || 'attachment').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_');
		if (resourcesExtname(URI.file(safeLabel))) {
			return safeLabel;
		}
		const ext = contentType ? getExtensionForMimeType(contentType) : undefined;
		return ext ? `${safeLabel}${ext}` : safeLabel;
	}

	async resourceList(uri: URI): Promise<ResourceListResult> {
		return this._resourceProviders.list(uri);
	}

	async restoreSession(session: URI, onRestoreStart?: (joinedRestore: boolean) => void, credentials?: IAgentHostCredentialSource): Promise<void> {
		// An identity-mapped session is one session; restoring its storage spelling would register a second state that peers and catalog ownership are not recorded under.
		const runtimeSession = this._orchestratorDatabase.toRuntimeSession(session.toString());
		if (runtimeSession !== session.toString()) {
			return this.restoreSession(URI.parse(runtimeSession), onRestoreStart, credentials);
		}
		const sessionStr = session.toString();
		await this._scratchFoldersLoaded;
		await this._savedChatContinuations.get(sessionStr)?.catch(() => undefined);
		this._cancelPendingSessionGc(session);
		this._sessionResidency.touch(session);
		await this._sessionResidency.waitForRelease(session);
		for (let completing = this._savedChatContinuations.get(sessionStr); completing; completing = this._savedChatContinuations.get(sessionStr)) {
			await completing.catch(() => undefined);
		}
		// A session a move loaded with its data only is never restored in place: it is restored in full once the move
		// dropped it (C15). Nothing awaits between here and claiming the restore, so a move can't start loading it meanwhile.
		while (this._sessionResidency.isHeldForMove(session)) {
			await this._sessionResidency.waitForRelease(session);
		}

		const inFlight = this._restoreSessionInFlight.get(sessionStr);
		if (inFlight) {
			onRestoreStart?.(true);
			this._logService.trace(`[AgentService] restoreSession: joining in-flight restore for ${sessionStr}`);
			return inFlight;
		}

		if (this._stateManager.getSessionState(sessionStr)) {
			this._sessionResidency.touch(session);
			await this._sessionResidency.reconcile();
			return;
		}

		onRestoreStart?.(false);
		this._logService.trace(`[AgentService] restoreSession start: ${sessionStr}`);
		const restore = this._doRestoreSession(session, sessionStr, credentials);
		this._restoreSessionInFlight.set(sessionStr, restore);
		this._chatOwnership.trackRestore(restore);
		try {
			await restore;
			// A restore is evidence its source resolves: the provider vouched for the session through its own lookup, which
			// can succeed while the provider's whole catalog stays unreadable. A session parked meanwhile is released, so its
			// catalog is re-projected (and converted) from its live state.
			if (this._catalogReconciliationService.isParked(sessionStr)) {
				this._catalogReconciliationService.wakeParkedSessions(sessionStr);
				this._catalogReconciliationService.schedule();
			}
			// Copies of moved chats' attachments that waited to read the chats' messages (Block 4b).
			this._attachmentMigration.resumeSession(sessionStr);
			this._sessionResidency.touch(session);
			await this._sessionResidency.reconcile();
			this._logService.trace(`[AgentService] restoreSession done: ${sessionStr}`);
		} finally {
			if (this._restoreSessionInFlight.get(sessionStr) === restore) {
				this._restoreSessionInFlight.delete(sessionStr);
			}
		}
	}

	/** Emits one {@link AgentHostLegacyMigrationEvent} for a legacy-session adoption attempt. */
	private _reportLegacyMigration(
		session: URI,
		provider: string,
		outcome: AgentHostLegacyMigrationEvent['outcome'],
		startTime: number,
		stage: AgentHostLegacyMigrationEvent['stage'],
		extra: { advertisedAsAdoptable: boolean; adoption?: IAgentChatAdoptionResult; turnCount?: number; hasProject?: boolean; hasWorktree?: boolean; workingDirectoryCount?: number; error?: unknown; reason?: AgentChatAdoptionReason | 'settingDisabled' },
	): void {
		const diagnostics = extra.adoption?.diagnostics;
		const invalidSessionId = diagnostics?.sessionIdStatus !== undefined && diagnostics.sessionIdStatus !== 'opaque';
		const storageError = [diagnostics?.sessionStateRootStatus, diagnostics?.sessionDirectoryStatus, diagnostics?.eventsFileStatus].includes('readError');
		const storageLayoutInvalid = [diagnostics?.sessionStateRootStatus, diagnostics?.sessionDirectoryStatus].some(status => status === 'file' || status === 'other')
			|| diagnostics?.eventsFileStatus === 'directory' || diagnostics?.eventsFileStatus === 'other';
		const environmentRootMissing = diagnostics?.sessionStateRootStatus === 'missing' && diagnostics.copilotHomeSource === 'environment';
		const missingSessionStorage = (diagnostics?.sessionStateRootStatus === 'missing' && diagnostics.copilotHomeSource !== 'environment')
			|| diagnostics?.sessionDirectoryStatus === 'missing';
		const nonExtensionHostClient = diagnostics?.markerStatus === 'missing'
			&& diagnostics.workspaceMetadataStatus === 'valid'
			&& (diagnostics.lastKnownClient === 'vscode-agent-host' || diagnostics.lastKnownClient === 'github-cli' || diagnostics.lastKnownClient === 'github-autopilot');
		let diagnosticCategory: AgentHostLegacyMigrationEvent['diagnosticCategory'] = 'unknown';
		if (outcome === 'migrated') {
			diagnosticCategory = 'notApplicable';
		} else if (extra.reason === 'settingDisabled') {
			diagnosticCategory = 'configurationDisabled';
		} else if (outcome === 'failed' || extra.advertisedAsAdoptable || extra.adoption?.eligible || invalidSessionId || storageError || storageLayoutInvalid || environmentRootMissing || diagnostics?.markerStatus === 'invalid' || diagnostics?.markerStatus === 'readError') {
			diagnosticCategory = 'needsInvestigation';
		} else if ((diagnostics?.markerStatus === 'valid' && diagnostics.provenance === 'external') || missingSessionStorage || nonExtensionHostClient) {
			diagnosticCategory = 'expectedExclusion';
		}
		let diagnosticDetail: AgentHostLegacyMigrationEvent['diagnosticDetail'];
		if (extra.reason === 'settingDisabled') {
			diagnosticDetail = 'settingDisabled';
		} else if (invalidSessionId) {
			diagnosticDetail = 'invalidSessionId';
		} else if (storageError) {
			diagnosticDetail = 'storageProbeFailed';
		} else if (storageLayoutInvalid) {
			diagnosticDetail = 'storageLayoutInvalid';
		} else if (diagnostics?.sessionStateRootStatus === 'missing') {
			diagnosticDetail = 'sessionStateRootMissing';
		} else if (diagnostics?.sessionDirectoryStatus === 'missing') {
			diagnosticDetail = 'sessionDirectoryMissing';
		} else if (nonExtensionHostClient) {
			diagnosticDetail = 'markerMissingNonExtensionHostClient';
		} else if (diagnostics?.markerStatus === 'missing') {
			diagnosticDetail = diagnostics.eventsFileStatus === 'file' ? 'markerMissingWithEvents' : diagnostics.eventsFileStatus === 'missing' ? 'markerMissingWithoutEvents' : 'markerMissing';
		} else if (diagnostics?.markerStatus === 'readError') {
			diagnosticDetail = 'markerReadError';
		} else if (diagnostics?.markerStatus === 'invalid') {
			diagnosticDetail = 'markerInvalid';
		} else if (diagnostics?.markerOrigin === 'unrecognized') {
			diagnosticDetail = 'originUnrecognized';
		} else if (diagnostics?.markerOrigin === 'invalidType') {
			diagnosticDetail = 'originInvalidType';
		} else if (diagnostics?.markerOrigin === 'missing' && diagnostics.provenance === 'unknown') {
			diagnosticDetail = 'originMissing';
		} else if (diagnostics?.provenance === 'external') {
			diagnosticDetail = 'externalOrigin';
		} else if (diagnostics?.provenance === 'legacy') {
			diagnosticDetail = 'legacyMarker';
		} else if (extra.adoption?.eligible) {
			diagnosticDetail = 'legacyEligible';
		} else {
			diagnosticDetail = stage === 'adoption' && outcome === 'failed' ? 'adoptionThrew' : 'providerEvidenceUnavailable';
		}
		const data: AgentHostLegacyMigrationEvent = {
			provider,
			outcome,
			migrationSessionId: getTelemetryMigrationSessionId(session),
			stage,
			diagnosticCategory,
			advertisedAsAdoptable: extra.advertisedAsAdoptable,
			eligible: extra.adoption?.eligible,
			markerStatus: diagnostics?.markerStatus ?? (extra.reason === 'settingDisabled' ? 'notEvaluated' : 'notReported'),
			provenance: diagnostics?.provenance ?? (extra.reason === 'settingDisabled' ? 'notEvaluated' : extra.adoption?.eligible ? 'legacy' : 'unknown'),
			diagnosticDetail,
			markerOrigin: diagnostics?.markerOrigin ?? 'notReported',
			sessionIdStatus: diagnostics?.sessionIdStatus ?? 'notReported',
			copilotHomeSource: diagnostics?.copilotHomeSource ?? 'notReported',
			sessionStateRootStatus: diagnostics?.sessionStateRootStatus ?? 'notReported',
			sessionDirectoryStatus: diagnostics?.sessionDirectoryStatus ?? 'notReported',
			eventsFileStatus: diagnostics?.eventsFileStatus ?? 'notReported',
			workspaceMetadataStatus: diagnostics?.workspaceMetadataStatus ?? 'notReported',
			lastKnownClient: diagnostics?.lastKnownClient ?? 'notReported',
			markerFromCache: diagnostics?.markerFromCache,
			eligibilityErrorCode: diagnostics?.errorCode,
			eligibilityErrorMessage: getTelemetryMigrationErrorMessage(diagnostics?.errorMessage === undefined ? undefined : { message: diagnostics.errorMessage, code: diagnostics.errorCode }, session),
			success: outcome === 'migrated' && (extra.turnCount ?? 0) > 0,
			turnCount: extra.turnCount ?? 0,
			durationMs: Date.now() - startTime,
			hasProject: extra.hasProject ?? false,
			hasWorktree: extra.hasWorktree ?? false,
			workingDirectoryCount: extra.workingDirectoryCount ?? 0,
			errorCode: getErrorCode(extra.error),
			errorMessage: getTelemetryMigrationErrorMessage(extra.error, session),
			reason: extra.reason ?? 'unknown',
		};
		if (extra.error !== undefined || diagnostics?.errorMessage !== undefined) {
			this._telemetryService.publicLogError2<AgentHostLegacyMigrationEvent, AgentHostLegacyMigrationClassification>('agentHost.legacyCopilotCliMigration', data);
		} else {
			this._telemetryService.publicLog2<AgentHostLegacyMigrationEvent, AgentHostLegacyMigrationClassification>('agentHost.legacyCopilotCliMigration', data);
		}
	}

	private async _doRestoreSession(session: URI, sessionStr: string, credentials?: IAgentHostCredentialSource): Promise<void> {
		// A passive metadata update in progress finishes before this restore reads the state it writes.
		await this._passiveMetadataSequencer.queue(sessionStr, async () => { });
		if (this._stateManager.getSessionState(sessionStr)) {
			return;
		}
		// A session explicitly deleted (tombstoned) must not be revived by a
		// stale restore request — e.g. a client re-subscribing to a URI it
		// still remembers after the session was deleted. Failing fast here
		// (before any provider-side restoration work) also avoids the
		// registration below silently declining later and leaving state
		// partially hydrated.
		if (await this._sessionRegistry.isTombstoned(session)) {
			throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session was explicitly deleted: ${sessionStr}`);
		}
		const unresolvedRegistration = await this._orchestratorDatabase.getSessionV2Registration(sessionStr);
		if (unresolvedRegistration && unresolvedRegistration.external === undefined) {
			const migrationProvider = this._providerService.getProvider(unresolvedRegistration.provider);
			if (migrationProvider) {
				await this._awaitInitialProviderMigrationForProvider(migrationProvider);
			}
		}
		if (await this._isWorkspaceConversionQuarantined(session)) {
			throw new ProtocolError(JSON_RPC_INTERNAL_ERROR, `Session is unavailable because its provider could not be detached from an untrusted working directory: ${sessionStr}`);
		}
		let registeredSession = await this._sessionRegistry.get(session, entry => this._migrateRegisteredSession(entry));
		if (registeredSession) {
			this._providerService.associateSession(session, registeredSession.provider);
		}
		const agent = registeredSession
			? this._providerService.getProvider(registeredSession.provider)
			: this._providerService.getProviderForSession(session);
		if (!agent) {
			throw new ProtocolError(AHP_SESSION_NOT_FOUND, `No agent for session: ${sessionStr}`);
		}
		// Warming the provider catalogue is O(catalogue) — ~48s on a large
		// `~/.copilot` — and the only decision that needs it is whether a metadata
		// miss is authoritative (#331648). Defer it so a session that resolves from
		// its own per-session lookup never pays for the whole catalogue.
		let catalogReadable: Promise<boolean> | undefined;
		const awaitCatalogReadable = () => catalogReadable ??= (async () => {
			let readable: boolean;
			try {
				readable = await this._awaitInitialProviderMigrationForProvider(agent, !registeredSession);
			} catch (err) {
				readable = false;
				this._logService.warn(`[AgentService] restore: initial catalog migration for provider ${agent.id} failed; a metadata miss will be reported as unavailable, not missing`, err);
			}
			// This wait can be lengthy, so re-check that a delete has not landed meanwhile.
			if (await this._sessionRegistry.isTombstoned(session)) {
				throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session was explicitly deleted: ${sessionStr}`);
			}
			return readable;
		})();
		let external = registeredSession?.external ?? false;
		this._logService.trace(`[AgentService] restore: catalog and registry resolved for ${sessionStr} (registered=${!!registeredSession}, external=${external})`);

		// Adopt-on-open for a surfaced un-adopted legacy Copilot CLI session, strictly gated on the startup-frozen migrate setting (a no-op for native / already-adopted sessions).
		const migrateLegacyEnabled = this._isMigrateLegacyEnabled();
		const migrationStartTime = Date.now();
		const advertisedAsAdoptable = readSessionEhcliAdoptable(this._stateManager.getSurfacedSessionSummary(sessionStr)?._meta);
		let adoption: IAgentChatAdoptionResult = { adopted: false, eligible: false };
		if (!external && migrateLegacyEnabled && agent.ensureChatAdopted) {
			try {
				const [catalog] = await this._orchestratorDatabase.readCatalogSnapshot([sessionStr]);
				const defaultChat = URI.parse(this._resolveDefaultChat(session, catalog, undefined));
				const defaultChatStorage = recordedChatStorage(catalog, this._logService).get(defaultChat.toString()) ?? creationTimeChatStorageResource(sessionStr, defaultChat.toString(), defaultChat.toString());
				adoption = await agent.ensureChatAdopted(defaultChat, this._chatContext(session, defaultChat, defaultChatStorage));
			} catch (err) {
				// Adoption itself threw — a genuine migration failure worth surfacing.
				this._reportLegacyMigration(session, agent.id, 'failed', migrationStartTime, 'adoption', { advertisedAsAdoptable, error: err });
				throw err;
			}
		}
		const adopted = adoption.adopted;

		// A session the registry does not know is only restorable when it is ours:
		// either an adoptable legacy chat, or one that already has Agent Host
		// metadata whose registry entry was lost. `external` defaults to false for
		// unknown sessions, so without this an external chat (e.g. one the GitHub app
		// created, hidden while `showExternalSessions` is `none`) would be
		// materialized here and thereby claimed away from the extension host's list.
		// Refuse an unregistered chat that is neither an adoptable legacy chat nor
		// one that already has Agent Host metadata. This is independent of the
		// migrate gate: while migration is frozen off, adoption is never attempted
		// above, so a client that still probes the twin (e.g. the setting was toggled
		// on without the required window reload) is cleanly declined and opens the
		// legacy session unmigrated, rather than materializing an unowned session.
		if (!registeredSession && agent.ensureChatAdopted && !adoption.eligible && !adoption.native) {
			// The registry was read before the deferred catalog wait, so absence is only authoritative once that catalog is readable (#331721).
			await awaitCatalogReadable();
			registeredSession = await this._sessionRegistry.get(session, entry => this._migrateRegisteredSession(entry));
			external = registeredSession?.external ?? external;
			if (!registeredSession) {
				this._logService.info(`[AgentService] restore refused for unregistered ${sessionStr}: not an adoptable legacy chat (reason=${adoption.reason ?? 'unknown'})`);
				const reason = migrateLegacyEnabled ? adoption.reason : 'settingDisabled';
				this._reportLegacyMigration(session, agent.id, 'declined', migrationStartTime, 'eligibility', { advertisedAsAdoptable, adoption: migrateLegacyEnabled ? adoption : undefined, reason });
				throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session is not an adoptable legacy chat (reason=${reason ?? 'unknown'}): ${sessionStr}`);
			}
		}

		// From here the whole restore is wrapped so `migrated` is reported only
		// after every required step succeeds, and any failure after a successful
		// adoption is surfaced as a migration failure.
		let registeredAfterAdoption = !!registeredSession;
		let migrationStage: AgentHostLegacyMigrationEvent['stage'] = 'registration';
		try {
			// Adoption has already claimed the chat on disk, which is what stops the
			// extension host listing it. Register it before restoring so a later restore
			// failure (e.g. a worktree whose branch is gone) leaves a session that
			// reports an error like any native one, instead of one that exists in no
			// list at all. A registration that cannot be made durable fails the
			// migration: continuing would leave exactly the orphan this prevents.
			if (adopted && !registeredSession) {
				const registeredAt = Date.now();
				await this._retryRegistryMutation(
					() => this._sessionRegistry.register(session, { provider: agent.id, startTime: registeredAt, modifiedTime: registeredAt, source: 'restore' }, { checkTombstone: true }),
					`adoption registration for ${sessionStr}`,
				);
				registeredAfterAdoption = true;
				this._invalidateSessionList();
				// Surface-before-retract: adoption already wrote `session.db`, which is
				// what makes the extension-host list drop this chat. Announce the adopted
				// row now — before the slower `_restoreSessionState` — so the session is
				// never absent from both lists during the handoff.
				try {
					const surfaced = await this._registeredSessionMetadata(agent, session, /* external */ false);
					if (surfaced) {
						await this._announceSurfacedSession(surfaced, agent.id);
					}
				} catch (err) {
					this._logService.warn(`[AgentService] Failed to surface adopted session ${sessionStr} before restore`, err);
				}
			}
			migrationStage = 'restore';
			const facts = await this._restoreSessionState(agent, session, sessionStr, { kind: 'full' }, adopted, external, registeredSession?.source ?? 'restore', awaitCatalogReadable, !!registeredSession, adoption.worktree, adoption.listVisible, credentials);
			migrationStage = 'annotations';
			await this._restoreAnnotations(session);
			if (adopted) {
				// Discovery never surfaced this chat when migration was enabled after
				// startup, so clients have no entry for it and a restore alone stays
				// silent. Publishing announces it with the adopted summary.
				this._stateManager.setSessionSummaryPublished(sessionStr, true);
				this._reportLegacyMigration(session, agent.id, 'migrated', migrationStartTime, 'complete', { ...facts, advertisedAsAdoptable, adoption, reason: adoption.reason });
			} else if (adoption.eligible) {
				// Migrate setting on and a genuine legacy candidate, but not adopted
				// this pass (e.g. its on-disk working directory could not be resolved).
				this._logService.info(`[AgentService] legacy session ${sessionStr} was a migration candidate but was not adopted (reason=${adoption.reason ?? 'unknown'})`);
				this._reportLegacyMigration(session, agent.id, 'skipped', migrationStartTime, 'complete', { advertisedAsAdoptable, adoption, hasProject: facts.hasProject, workingDirectoryCount: facts.workingDirectoryCount, reason: adoption.reason });
			}
		} catch (err) {
			if (adopted) {
				this._logService.error(registeredAfterAdoption
					? `[AgentService] legacy session ${sessionStr} was adopted but its restore failed; it is registered so it surfaces with an error rather than disappearing`
					: `[AgentService] legacy session ${sessionStr} was adopted but could not be registered; the extension host no longer lists it, so it will not appear until the next successful restore`, err);
			}
			if (adopted || adoption.eligible) {
				this._reportLegacyMigration(session, agent.id, 'failed', migrationStartTime, migrationStage, { advertisedAsAdoptable, adoption, error: err, reason: adoption.reason });
			}
			throw err;
		}
	}

	private async _restoreAnnotations(session: URI): Promise<void> {
		const sessionStr = session.toString();
		if (this._stateManager.getAnnotationsState(buildAnnotationsUri(sessionStr))) {
			return;
		}
		const inFlight = this._restoreAnnotationsInFlight.get(sessionStr);
		if (inFlight) {
			await inFlight;
			return;
		}
		const restore = this._doRestoreAnnotations(session);
		this._restoreAnnotationsInFlight.set(sessionStr, restore);
		try {
			await restore;
		} finally {
			if (this._restoreAnnotationsInFlight.get(sessionStr) === restore) {
				this._restoreAnnotationsInFlight.delete(sessionStr);
			}
		}
	}

	/**
	 * Ensures a session's persisted annotations are in state before its
	 * annotations channel serves a snapshot, awaiting any restore that is
	 * already populating the session.
	 */
	private async _ensureAnnotationsRestored(sessionUri: string): Promise<void> {
		await this._validateAnnotationsOwner(sessionUri);
		if (this._stateManager.getAnnotationsState(buildAnnotationsUri(sessionUri))) {
			return;
		}
		await this._restoreSessionInFlight.get(sessionUri);
		await this._restoreSubagentInFlight.get(sessionUri);
		const session = URI.parse(sessionUri);
		// Read the independent annotations store without restoring provider history or affecting session recency.
		await this._restoreAnnotations(session);
		await this._validateAnnotationsOwner(sessionUri);
	}

	private async _validateAnnotationsOwner(sessionUri: string): Promise<void> {
		const owner = this._resolveResourceSession(URI.parse(sessionUri));
		if (!owner) {
			throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session not found: ${sessionUri}`);
		}
		const ownerKey = owner.toString();
		// Live throwaway sessions are deliberately tombstoned to exclude them from discovery.
		if (this._stateManager.isEphemeralSession(ownerKey)) {
			return;
		}
		if (await this._sessionRegistry.isTombstoned(owner)) {
			throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session was explicitly deleted: ${ownerKey}`);
		}
		if (!this._stateManager.getSessionState(ownerKey) && !await this._sessionRegistry.get(owner)) {
			throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session not found: ${ownerKey}`);
		}
	}

	/** Reads persisted annotations into state. */
	private async _doRestoreAnnotations(session: URI): Promise<void> {
		const storage = this._annotationsStorage(session);
		// A session dropped from memory right after an annotation change must not restore what was stored before it.
		await this._pendingAnnotationWrites.get(annotationsWriteKey(storage));
		const refPromise = this._sessionDataService.tryOpenDatabase?.(storage.session);
		if (!refPromise) {
			return;
		}
		try {
			const ref = await refPromise;
			if (!ref) {
				return;
			}
			try {
				const raw = await ref.object.getMetadata(storage.key);
				if (!raw) {
					return;
				}
				const state: unknown = JSON.parse(raw);
				const annotations = readPersistedAnnotationsState(state, session.toString());
				if (!annotations) {
					throw new Error('Invalid annotations state');
				}
				this._stateManager.restoreAnnotations(session.toString(), annotations);
			} finally {
				ref.dispose();
			}
		} catch (err) {
			this._logService.warn(`[AgentService] Failed to restore annotations for ${session.toString()}: ${toErrorMessage(err)}`);
		}
	}

	/**
	 * Hydrates a restored (or freshly-adopted) session into the state manager and
	 * completes all required restore work (turns, metadata, peer chats, config).
	 * Returns the facts used for migration telemetry; throws if any required step
	 * fails so the caller can report the outcome accurately.
	 */
	private async _restoreSessionState(agent: IAgent, session: URI, sessionStr: string, load: SessionLoad, adopted: boolean, external: boolean, registrationSource: IRegisteredSession['source'], awaitCatalogReadable: () => Promise<boolean>, sessionKnownToRegistry: boolean, adoptionWorktree: IAgentAdoptedWorktree | undefined, adoptionListVisible: IAgentChatAdoptionResult['listVisible'], credentials?: IAgentHostCredentialSource): Promise<{ turnCount: number; hasProject: boolean; hasWorktree: boolean; workingDirectoryCount: number }> {
		await this._restoreCredentialPrincipal(sessionStr);
		if ((adoptionListVisible?.title === undefined) !== (adoptionListVisible?.titleSource === undefined)) {
			throw new Error(`Adoption title and source must be provided together for ${sessionStr}`);
		}
		this._logService.trace(`[AgentService] restore: reading provider metadata for ${sessionStr}`);
		let meta = load.kind === 'dataForMove'
			? await this._readSessionMetadataForMove(agent, session, load.registration)
			: await this._getSessionMetadataForRestore(agent, session, external);
		if (!meta && load.kind === 'dataForMove') {
			// Reading it passively said nothing (a lazy provider not started yet); a full restore may start it.
			throw new SessionDataUnavailableError(sessionStr, 'its agent has no metadata for it without starting');
		}
		if (meta && load.kind === 'dataForMove' && !meta.workingDirectories?.length) {
			// A lazy provider's passive answer (registry timestamps only) isn't what a restore reads: its folders decide the
			// session's workspace and config, so a session whose agent reports none without starting is restored in full.
			throw new SessionDataUnavailableError(sessionStr, 'its agent reports no folders for it without starting');
		}
		if (!meta) {
			// Only a miss needs the catalogue: it decides whether the session is
			// genuinely absent, and warming it may enumerate thousands of sessions.
			const catalogReadable = await awaitCatalogReadable();
			meta = await this._getSessionMetadataForRestore(agent, session, external);
			// The registry is backfilled by that same pass, so re-read it before
			// concluding the session is unknown.
			const knownToRegistry = sessionKnownToRegistry || (await this._listRegisteredSessions()).some(entry => entry.session.toString() === sessionStr);
			if (!meta) {
				// A session still marked provisional never materialized, so its
				// provider never created a backing for it to describe — but only a
				// readable catalog makes that miss authoritative. An unreadable one
				// returns `undefined` without throwing, which says nothing about
				// whether the session exists, and a materialized session whose
				// marker-clear never landed would otherwise be reported as absent.
				await this._whenProvisionalSessionKeysLoaded();
				if (catalogReadable && this._provisionalSessionKeys.has(sessionStr)) {
					throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session was never created on the backend: ${sessionStr}`);
				}
				// Authoritative absence only when the catalog was readable this run and
				// the registry has no record of the session; a miss for a known
				// (registered) session, or while the catalog was unavailable, is
				// transient — e.g. a provider whose SDK is not downloaded yet (#331648).
				throw catalogReadable && !knownToRegistry
					? new ProtocolError(AHP_SESSION_NOT_FOUND, `Session not found on backend: ${sessionStr}`)
					: new ProtocolError(JSON_RPC_INTERNAL_ERROR, `Provider ${agent.id} is not ready to open ${sessionStr}; it may still be starting, so try again shortly`);
			}
		}
		this._logService.trace(`[AgentService] restore: provider metadata resolved for ${sessionStr}`);
		const cachedChatCatalogPromise = this._readCachedChatCatalog(session);

		// A freshly-adopted legacy session whose working directory is a
		// pre-existing git worktree keeps no worktree metadata (adoption seeds
		// `isolation: folder` in place). Bridge it now so the session groups under
		// its repository and diffs against the right base, matching native
		// worktree-isolated sessions. No-op for folder / primary-checkout cwds.
		let adoptedWorktree = false;
		if (adopted && this._worktree.supported) {
			// The predecessor recorded this worktree; seed the same metadata a native
			// session persists at creation. When its checkout is gone this is the only
			// way to recover it (resume recreates it from the branch); when the checkout
			// still exists this carries the authoritatively recorded base branch, which
			// the probe-based bridge below could not recover without a remote (#333642).
			if (adoptionWorktree) {
				try {
					await this._worktree.recordAdoptedWorktreeMetadata(session, adoptionWorktree);
					adoptedWorktree = true;
					const worktreeProject = await this._worktree.resolveWorktreeProject(session);
					if (worktreeProject) {
						meta = { ...meta, project: worktreeProject };
					}
				} catch (err) {
					this._logService.warn(`[AgentService] adopt: recording recorded worktree metadata failed for ${sessionStr}`, err);
				}
			}
			const adoptedWorkingDirectory = meta.workingDirectories?.[0];
			if (!adoptedWorktree && adoptedWorkingDirectory) {
				try {
					if (await this._worktree.adoptExistingWorktreeMetadata(session, adoptedWorkingDirectory)) {
						adoptedWorktree = true;
						const worktreeProject = await this._worktree.resolveWorktreeProject(session);
						if (worktreeProject) {
							meta = { ...meta, project: worktreeProject };
						}
					}
				} catch (err) {
					this._logService.warn(`[AgentService] adopt: worktree metadata bridge failed for ${sessionStr}`, err);
				}
			}
		}
		if (!meta.project && !readSessionWorkspaceless(meta._meta) && this._worktree.supported) {
			const workingDirectory = meta.workingDirectories?.[0];
			if (workingDirectory) {
				try {
					const project = await this._worktree.recordExternalWorktreeProject(session, workingDirectory);
					if (project) {
						adoptedWorktree = true;
						meta = { ...meta, project };
					}
				} catch (err) {
					this._logService.warn(`[AgentService] restore: external worktree project discovery failed for ${sessionStr}`, err);
				}
			}
		}

		const [chatSnapshot] = await this._orchestratorDatabase.readCatalogSnapshot([sessionStr]);
		// Loaded with the snapshot just read, before anything reads chat rows through the store, so it is not read again.
		await this._sessionStateStore.loadWithCatalog(session, chatSnapshot);
		const normalizedCatalog = chatSnapshot?.authorityVersion === 2 ? chatSnapshot : undefined;
		const normalizedDefault = normalizedCatalog?.chats.find(chat => chat.chat === normalizedCatalog.header?.defaultChatUri);
		if (normalizedCatalog && !normalizedDefault) {
			throw new Error(`Missing normalized default chat while restoring ${sessionStr}`);
		}
		if (load.kind === 'dataForMove' && !normalizedCatalog) {
			throw new SessionDataUnavailableError(sessionStr, 'its chat list is not normalized');
		}
		const cachedChatCatalog = await cachedChatCatalogPromise;
		const cachedDefaultChat = cachedChatCatalog?.find(chat => chat.kind === 'default');
		const defaultChatUri = URI.parse(normalizedDefault?.chat ?? this._resolveDefaultChat(session, chatSnapshot, cachedDefaultChat?.uri));
		const restoreCredentials = this._authService.getSessionCredentialSource(sessionStr);
		if (restoreCredentials) {
			this._authService.bindSessionCredentials(sessionStr, restoreCredentials, defaultChatUri.toString());
		}
		const recordedStorage = recordedChatStorage(normalizedCatalog, this._logService);
		const defaultChatStorage = recordedStorage.get(defaultChatUri.toString()) ?? creationTimeChatStorageResource(sessionStr, defaultChatUri.toString(), defaultChatUri.toString());
		const defaultChatWorkingDirectories = normalizedDefault
			? normalizedDefault.workingDirectories
			: await this._readDefaultChatWorkingDirectories(session, defaultChatUri) ?? cachedDefaultChat?.workingDirectories;
		// Restore host-owned tool strategy before the provider materializes its tool inventory.
		const { draft: defaultDraft, title: defaultChatTitle, config: defaultChatConfig } = await this._chatContributions.hydrateChat({
			session: sessionStr,
			chat: defaultChatUri.toString(),
			isDefaultChat: true,
			storageResource: defaultChatStorage,
		}, {});
		const defaultChatProviderData = await this._readDefaultChatProviderData(session);
		// Default-chat restore always goes through {@link IAgent.materializeChat};
		// there is no identity-reuse fallback. Always offer the persisted blob,
		// including `undefined`, so legacy sessions can recover their backing from
		// provider storage and, if they do, persist it once for later restores.
		// If no backing exists, restore the history but leave the missing live
		// backing explicit.
		const chatContext = this._chatContext(session, defaultChatUri, defaultChatStorage);
		// A load for a move leaves the default chat's backing to whoever opens it (C15): its provider never sees it.
		if (load.kind === 'full') {
			const recoveredDefaultChat = !normalizedCatalog && !external && defaultChatProviderData === undefined
				? await agent.recoverLegacyChat?.(defaultChatUri, chatContext)
				: undefined;
			if (recoveredDefaultChat?.providerData !== undefined) {
				await this._persistDefaultChatBacking({ session, chat: recoveredDefaultChat, defaultChat: defaultChatUri });
			}
			const providerData = defaultChatProviderData ?? recoveredDefaultChat?.providerData;
			const materializedDefaultChat = await agent.materializeChat(defaultChatUri, chatContext, providerData);
			if (providerData === undefined && materializedDefaultChat?.providerData !== undefined) {
				await this._persistDefaultChatBacking({ session, chat: materializedDefaultChat, defaultChat: defaultChatUri });
			}
			if (providerData === undefined && materializedDefaultChat?.providerData === undefined) {
				this._logService.warn(`[AgentService] Restoring default chat ${defaultChatUri.toString()} with no persisted or recovered provider backing (agent=${agent.id})`);
			}
		}
		// Check for persisted metadata in the session database
		let title = meta.summary ?? 'Session';
		let isRead: boolean | undefined;
		let defaultChatIsRead: boolean | undefined;
		let isArchived: boolean | undefined;
		let persistedConfigValues: Record<string, unknown> | undefined;
		let changes: ChangesSummary | undefined;
		let gitMetadata: Record<string, string | undefined> | undefined;
		let sessionMetadata: Record<string, unknown> | undefined;
		let persistedWorkspaceless: boolean | undefined;
		let persistedWorkingDirectories: string | undefined;
		// A default chat stored outside its session database keeps its workspace transitions in its own storage.
		let workspaceTransitionsPromise: Promise<ReadonlyMap<string, string> | undefined> = defaultChatStorage === sessionStr || load.kind === 'dataForMove'
			? Promise.resolve(undefined)
			: this._loadWorkspaceTransitions(URI.parse(defaultChatStorage));
		const restoreKeys: Record<string, true> = {
			customTitle: true,
			[SESSION_WORKING_DIRECTORIES_KEY]: true,
			[AH_META_IS_READ_DB_KEY]: true,
			...(normalizedCatalog ? {} : { [AH_META_DEFAULT_CHAT_IS_READ_DB_KEY]: true }),
			[AH_META_IS_ARCHIVED_DB_KEY]: true,
			[AH_META_IS_DONE_DB_KEY]: true,
			configValues: true,
			[AH_META_HAS_WORKSPACE_TRANSITIONS_DB_KEY]: true,
			[AH_META_WORKSPACELESS_DB_KEY]: true,
			[AH_META_EHCLI_ADOPTED_DB_KEY]: true,
			[AH_META_EHCLI_LAST_TURN_DB_KEY]: true,
			[AH_META_CREATED_BY_SESSION_DB_KEY]: true,
			[REMOTE_SESSION_ORIGIN_METADATA_KEY]: true,
			[SESSION_INITIATOR_METADATA_KEY]: true,
			[AH_META_DEV_CONTAINER_WORKTREE_DB_KEY]: true,
			[SESSION_META_MULTI_ROOT_KEY]: true,
			[SESSION_ARTIFACTS_KEY]: true,
			[SESSION_META_FOLDER_PICKER_KEY]: true,
			...GIT_DB_METADATA_KEYS,
			...CHANGES_SUMMARY_METADATA_KEYS,
		};
		// Metadata writes still in flight for this session (a rename persisted fire-and-forget just before a release) land
		// first: restore must not read what they are about to replace, and the restored state would then persist it.
		await this._peerChatStore.whenSessionsIdle([session]);
		const centralMetadata = this._sessionStateStore.legacyMetadata(session, Object.keys(restoreKeys));
		const unownedKeys = Object.fromEntries(centralMetadata.unowned.map(key => [key, true] as const));
		const ref = this._sessionDataService.tryOpenDatabase?.(session);
		if (ref) {
			try {
				const db = await ref;
				if (db) {
					let retainedForWorkspaceTransitions = false;
					try {
						const m: Record<string, string | undefined> = { ...(centralMetadata.unowned.length > 0 ? await db.object.getMetadataObject(unownedKeys) : {}), ...centralMetadata.values };
						if (m[AH_META_HAS_WORKSPACE_TRANSITIONS_DB_KEY] === 'true' && defaultChatStorage === sessionStr && load.kind === 'full') {
							retainedForWorkspaceTransitions = true;
							workspaceTransitionsPromise = this._readWorkspaceTransitions(db, session);
						}
						if (m.customTitle) {
							title = m.customTitle;
						}
						persistedWorkingDirectories = m[SESSION_WORKING_DIRECTORIES_KEY];
						if (m[AH_META_IS_READ_DB_KEY] !== undefined) {
							isRead = m[AH_META_IS_READ_DB_KEY] === 'true';
						}
						if (m[AH_META_DEFAULT_CHAT_IS_READ_DB_KEY] !== undefined) {
							defaultChatIsRead = m[AH_META_DEFAULT_CHAT_IS_READ_DB_KEY] === 'true';
						}
						const persistedArchived = m[AH_META_IS_ARCHIVED_DB_KEY] ?? m[AH_META_IS_DONE_DB_KEY];
						if (persistedArchived !== undefined) {
							isArchived = persistedArchived === 'true';
						}

						const persistedChangesSummary = m[META_CHANGES_SUMMARY];
						if (persistedChangesSummary) {
							try {
								changes = JSON.parse(persistedChangesSummary);
							} catch (err) {
								this._logService.warn(`[AgentService] Failed to parse changes summary for ${sessionStr}: ${toErrorMessage(err)}`);
							}
						}

						gitMetadata = m as Record<string, string | undefined>;

						if (gitMetadata[META_GIT_STATE]) {
							try {
								const gitState = JSON.parse(gitMetadata[META_GIT_STATE]);
								sessionMetadata = { [SESSION_META_GIT_KEY]: gitState };
							} catch (err) {
								this._logService.warn(`[AgentService] Failed to parse Git state for ${sessionStr}: ${toErrorMessage(err)}`);
							}
						}
						if (gitMetadata[META_GIT_DATA_STATE]) {
							try {
								sessionMetadata = withSessionGitData(sessionMetadata, parseSessionGitData(JSON.parse(gitMetadata[META_GIT_DATA_STATE])));
							} catch (err) {
								this._logService.warn(`[AgentService] Failed to parse folder-scoped Git state for ${sessionStr}: ${toErrorMessage(err)}`);
							}
						}

						sessionMetadata = withPersistedGitHubData(sessionMetadata, gitMetadata, meta.workingDirectories?.[0]?.toString(), err => {
							this._logService.warn(`[AgentService] Failed to parse GitHub state for ${sessionStr}: ${toErrorMessage(err)}`);
						});
						if (gitMetadata[META_GITHUB_STATE]) {
							await this._persistMigratedGitHubData(session, sessionMetadata, meta.workingDirectories?.[0]?.toString());
						}

						if (gitMetadata[META_SOURCE_CONTROL_STATE]) {
							try {
								sessionMetadata = withSessionSourceControlState(sessionMetadata, parsePersistedSourceControlState(gitMetadata[META_SOURCE_CONTROL_STATE]));
							} catch (err) {
								this._logService.warn(`[AgentService] Failed to parse source-control state for ${sessionStr}: ${toErrorMessage(err)}`);
							}
						}

						if (m[AH_META_WORKSPACELESS_DB_KEY] !== undefined) {
							persistedWorkspaceless = m[AH_META_WORKSPACELESS_DB_KEY] === 'true';
							sessionMetadata = withSessionWorkspaceless(sessionMetadata, persistedWorkspaceless);
						}
						if (m[AH_META_HAS_WORKSPACE_TRANSITIONS_DB_KEY] !== undefined) {
							sessionMetadata = withSessionHasWorkspaceTransitions(sessionMetadata, m[AH_META_HAS_WORKSPACE_TRANSITIONS_DB_KEY] === 'true');
						}
						if (m[AH_META_EHCLI_ADOPTED_DB_KEY] !== undefined) {
							sessionMetadata = withSessionEhcliAdopted(sessionMetadata, m[AH_META_EHCLI_ADOPTED_DB_KEY] === 'true');
						}
						if (m[AH_META_EHCLI_LAST_TURN_DB_KEY] !== undefined) {
							sessionMetadata = withSessionEhcliLastMigratedTurn(sessionMetadata, m[AH_META_EHCLI_LAST_TURN_DB_KEY]);
						}
						const creationReference = parseSessionCreationReference(m[AH_META_CREATED_BY_SESSION_DB_KEY]);
						if (creationReference) {
							sessionMetadata = withSessionCreationReference(sessionMetadata, creationReference);
						}
						const remoteOrigin = this._readPersistedRemoteSessionOrigin(m[REMOTE_SESSION_ORIGIN_METADATA_KEY], sessionStr);
						if (remoteOrigin) {
							sessionMetadata = withRemoteSessionOrigin(sessionMetadata, remoteOrigin);
						}
						const initiator = this._readPersistedSessionInitiator(m[SESSION_INITIATOR_METADATA_KEY], sessionStr);
						if (initiator) {
							sessionMetadata = withSessionInitiator(sessionMetadata, initiator);
						}
						if (m[AH_META_DEV_CONTAINER_WORKTREE_DB_KEY]) {
							try {
								const metadata = readAgentDevContainerWorktreeMetadata({
									[AH_META_DEV_CONTAINER_WORKTREE_DB_KEY]: JSON.parse(m[AH_META_DEV_CONTAINER_WORKTREE_DB_KEY]),
								});
								if (metadata) {
									sessionMetadata = withAgentDevContainerWorktreeMetadata(sessionMetadata, metadata.handle);
								}
							} catch (err) {
								this._logService.warn(`[AgentService] Failed to parse Dev Container worktree metadata for ${sessionStr}: ${toErrorMessage(err)}`);
							}
						}
						sessionMetadata = withSessionMultiRootMetadata(sessionMetadata, parseSessionMultiRootMetadata(m[SESSION_META_MULTI_ROOT_KEY]));
						sessionMetadata = withSessionArtifacts(sessionMetadata, this._readPersistedArtifacts(m[SESSION_ARTIFACTS_KEY], sessionStr, '[AgentService]'));
						sessionMetadata = withSessionFolderPickerDecision(sessionMetadata, parseSessionFolderPickerDecision(m[SESSION_META_FOLDER_PICKER_KEY]));

						if (m.configValues) {
							try {
								const parsed: unknown = JSON.parse(m.configValues);
								if (isRecord(parsed)) {
									persistedConfigValues = omitTransientSessionConfigValues(parsed);
								} else {
									this._logService.warn(`[AgentService] Ignoring persisted configValues with an invalid shape for ${sessionStr}`);
								}
							} catch (err) {
								this._logService.warn(`[AgentService] Failed to parse persisted configValues for ${sessionStr}: ${toErrorMessage(err)}`);
							}
						}
					} finally {
						if (!retainedForWorkspaceTransitions) {
							db.dispose();
						}
					}
				}
			} catch {
				// Best-effort: fall back to agent-provided metadata
			}
		}
		this._logService.trace(`[AgentService] restore: persisted session metadata read for ${sessionStr}`);
		if (adoptionListVisible?.title !== undefined) {
			title = adoptionListVisible.title;
		}
		if (adoptionListVisible?.isRead !== undefined) {
			isRead = adoptionListVisible.isRead;
			defaultChatIsRead ??= adoptionListVisible.isRead;
		}
		defaultChatIsRead ??= isRead;

		// Reading a conversation starts its agent's runtime (an SDK session resume, its MCP servers): a move needs none (C15).
		let turns: readonly Turn[] = [];
		if (load.kind === 'full') {
			try {
				turns = await this._getChatMessages(agent, defaultChatUri, session, true, URI.parse(defaultChatStorage), undefined, workspaceTransitionsPromise, credentials);
			} catch (err) {
				if (err instanceof ProtocolError) {
					throw err;
				}
				const message = err instanceof Error ? err.message : String(err);
				throw new ProtocolError(JSON_RPC_INTERNAL_ERROR, `Failed to restore session ${sessionStr}: ${message}`);
			}
		}

		// Encode isRead/isArchived as status bitmask flags
		let status: SessionStatus = SessionStatus.Idle;
		if (isRead) {
			status |= SessionStatus.IsRead;
		}
		if (isArchived) {
			status |= SessionStatus.IsArchived;
		}

		const providerMeta = withSessionMultiRootMetadata(meta._meta, undefined);
		let restoredMeta = (sessionMetadata || providerMeta) ? { ...(providerMeta ?? {}), ...(sessionMetadata ?? {}) } : undefined;
		restoredMeta = withSessionMultiRootMetadata(restoredMeta, readSessionMultiRootMetadata(sessionMetadata));
		// A persisted `false` is the absence of the marker, so the spread above cannot override a provider's stale `true`.
		if (persistedWorkspaceless !== undefined) {
			restoredMeta = withSessionWorkspaceless(restoredMeta, persistedWorkspaceless);
		}
		restoredMeta = withSessionExternal(restoredMeta, external);
		const centralChatCatalog = await this._readCentralChatCatalog(session) ?? cachedChatCatalog;
		const restoredChats = cachedChatCatalog?.map(chat => ({
			resource: chat.uri,
			title: chat.title ?? '',
			...(chat.origin !== undefined ? { origin: chat.origin } : {}),
			...(chat.interactivity !== undefined ? { interactivity: chat.interactivity } : {}),
			// An archived chat keeps its read state; dropping it would restore the session unread.
			...(chat.archived === true ? { status: withSessionStatusFlag(SessionStatus.IsArchived, SessionStatus.IsRead, chat.isRead !== false) } : {}),
			...(chat.changes !== undefined ? { changes: chat.changes } : {}),
		}));
		const workingDirectories = withChatWorkingDirectories(parseSessionWorkingDirectories(persistedWorkingDirectories) ?? meta.workingDirectories?.map(d => d.toString()), centralChatCatalog);
		restoredMeta = withPublishedWorkingDirectoryIdentities(restoredMeta, workingDirectories, centralChatCatalog);
		// Scratch folders are never persisted: a restored session publishes the recorded ones its and its chats' folders include, as a listing does.
		const restoredScratchFolders = publishedScratchFolders(folder => this._stateManager.isScratchFolder(folder), readSessionWorkspaceless(restoredMeta), workingDirectories ?? [], centralChatCatalog?.flatMap(chat => chat.workingDirectories ?? []) ?? []);
		if (restoredScratchFolders.length > 0) {
			restoredMeta = withSessionScratchFolders(restoredMeta, restoredScratchFolders);
		}
		if (agent.id === CODEX_AGENT_PROVIDER_ID) {
			restoredMeta = withCodexSessionModel(restoredMeta, agent.chats.getModel?.(defaultChatUri, this._chatContext(session, defaultChatUri, defaultChatStorage)) ?? meta.model);
		}
		const currentRegistration = await this._sessionRegistry.get(session, entry => this._migrateRegisteredSession(entry));
		const effectiveRegistrationSource = currentRegistration?.source ?? registrationSource;
		const sessionStartTime = currentRegistration?.startTime ?? meta.startTime;
		const sessionModifiedTime = Math.max(currentRegistration?.modifiedTime ?? meta.modifiedTime, meta.modifiedTime);
		const summary: SessionSummary & { readonly defaultChat: string } = {
			resource: sessionStr,
			provider: agent.id,
			title,
			status,
			createdAt: new Date(sessionStartTime).toISOString(),
			modifiedAt: new Date(sessionModifiedTime).toISOString(),
			...(meta.project ? { project: { uri: meta.project.uri.toString(), displayName: meta.project.displayName } } : {}),
			changes: meta.changes ?? changes,
			workingDirectories,
			...(restoredChats !== undefined ? { chats: restoredChats } : {}),
			defaultChat: defaultChatUri.toString(),
			_meta: restoredMeta,
		};

		// This overlay stays here rather than moving into `ChatDraftContribution`: it seeds
		// the draft's model from `IAgent`-supplied session metadata, so it is provider-shaped,
		// and moving it would put provider metadata into `IHydrationContext` for one consumer.
		const restoredDraft = meta.model
			? { ...(defaultDraft ?? { text: '', origin: { kind: MessageKind.User } }), model: meta.model }
			: defaultDraft;
		const mergedTurns = load.kind === 'full' ? await this._interleaveLocalTurns(sessionStr, defaultChatUri.toString(), turns) : [];
		const defaultChatModifiedAt = new Date(meta.modifiedTime).toISOString();
		const registered = await this._retryRegistryMutation(
			() => this._sessionRegistry.register(session, { provider: agent.id, startTime: meta.startTime, modifiedTime: meta.modifiedTime, source: effectiveRegistrationSource }, { checkTombstone: true }),
			`registration for restored session ${session.toString()}`,
		);
		if (!registered) {
			// Tombstoned between the early check in `_doRestoreSession` and
			// here (e.g. a concurrent `disposeSession` landed while this
			// restore was reading turns/metadata). Fail the same way an
			// up-front tombstone would, before any state-manager mutation.
			throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session was explicitly deleted: ${sessionStr}`);
		}
		this._invalidateSessionList();
		const chatStorageResource = (session: string, chat: string, defaultChat: string) => recordedStorage.get(chat) ?? creationTimeChatStorageResource(session, chat, defaultChat);
		if (load.kind === 'full') {
			this._stateManager.restoreSession(summary, mergedTurns, chatStorageResource, {
				draft: restoredDraft,
				defaultChatTitle,
				defaultChatModifiedAt,
				defaultChatWorkingDirectories,
				defaultChatIsRead: normalizedDefault ? normalizedDefault.isRead : defaultChatIsRead,
				defaultChatConfig,
			});
		} else {
			// Registered like a restored peer chat: once a move made it another session's chat, it resolves as one.
			this._stateManager.restoreSessionData(summary, chatStorageResource, {
				title: defaultChatTitle,
				modifiedAt: defaultChatModifiedAt,
				workingDirectories: defaultChatWorkingDirectories,
				isRead: normalizedDefault ? normalizedDefault.isRead : defaultChatIsRead,
				draft: restoredDraft,
				config: defaultChatConfig,
				providerData: defaultChatProviderData,
				resolver: (providerData, storageResource, credentials) => this._materializeRestoredPeerChat(defaultChatUri, providerData, storageResource, credentials),
			});
		}
		if (normalizedDefault?.metadata?.changes !== undefined) {
			this._stateManager.setChatSummaryChanges(normalizedDefault.chat, normalizedDefault.metadata.changes);
		}
		if (adopted || adoptionListVisible) {
			const adoptionMetadata: Record<string, string> = {};
			if (adoptionListVisible?.title !== undefined) {
				adoptionMetadata[SESSION_CUSTOM_TITLE_KEY] = adoptionListVisible.title;
				adoptionMetadata[SESSION_CUSTOM_TITLE_SOURCE_KEY] = adoptionListVisible.titleSource;
			}
			if (adoptionListVisible?.isRead !== undefined) {
				adoptionMetadata[AH_META_IS_READ_DB_KEY] = adoptionListVisible.isRead ? 'true' : '';
				adoptionMetadata[AH_META_DEFAULT_CHAT_IS_READ_DB_KEY] = adoptionListVisible.isRead ? 'true' : '';
			}
			await this._persistListVisibleSessionState(session, adoptionMetadata);
		}
		this._logService.trace(`[AgentService] restore: hydrated state for ${sessionStr} with ${mergedTurns.length} turn(s)`);
		if (load.kind === 'full') {
			this._serverToolHost.advertise(sessionStr);
		}

		// A freshly-adopted legacy session bridges its git checkpoints into the
		// agent-host namespace once its turns are restored. Isolated so a failure
		// here cannot break the restore.
		if (adopted && this._checkpointService.adoptLegacyCheckpoints) {
			try {
				const checkpointWorkingDirectory = meta.workingDirectories?.[0];
				if (checkpointWorkingDirectory) {
					await this._checkpointService.adoptLegacyCheckpoints(session, checkpointWorkingDirectory, AgentSession.id(session), mergedTurns.map(t => t.id));
				}
			} catch (err) {
				this._logService.warn(`[AgentService] adopt: checkpoint bridge failed for ${sessionStr}`, err);
			}
		}

		const promises: Promise<unknown>[] = [];
		// Discovered from the default chat's turns, which a load for a move doesn't read: a move takes a chat's private
		// chats by their recorded parent in the database, and those not loaded load with the session later (C15).
		if (load.kind === 'full') {
			try {
				await this._registerRestoredSubagentSummaries(agent, session, mergedTurns, recordedStorage);
			} catch (error) {
				this._logService.warn(`[AgentService] Restored private chat admission deferred for ${sessionStr}`, error);
				this._queueRestoredSubagentAdmissionRetry(agent, session, mergedTurns, recordedStorage);
			}
		}

		// Register persisted peer-chat catalog metadata. Their provider backings
		// and histories are restored when a peer chat is first requested.
		promises.push(this._restorePeerChats(agent, session, cachedChatCatalog));

		// Register the static changeset URIs; their contents are computed live.
		// The coordinator
		// publishes the selectable catalogue on chat state and drains any
		// uncommitted refresh deferred by an earlier `addSubscriber` —
		// `addSubscriber`'s 0→1 trigger may have fired for
		// `<session>/changeset/uncommitted` before this restore ran (e.g.
		// active-session autorun subscribing in parallel with the
		// chat-view); now that `summary.workingDirectory` is populated,
		// re-triggering the refresh dispatches to the compute path.
		if (load.kind === 'full') {
			this._changesetCoordinator.onSessionRestored(sessionStr);
		}

		// Restore persisted `_meta` (e.g. git state) onto the new session
		// state. This dispatches a SessionMetaChanged action.
		if (summary._meta) {
			this._stateManager.setSessionMeta(sessionStr, summary._meta);
		}

		// Resolve the session config so clients (e.g. the running-session
		// auto-approve picker) can render session-mutable properties for
		// sessions that were not created in the current process lifetime.
		// Overlay any values the user previously selected (persisted via
		// `SessionConfigChanged`) on top of the provider's resolved defaults.
		const restoredConfigValues = meta.workingDirectories?.length
			? { [SessionConfigKey.Isolation]: 'folder', ...persistedConfigValues }
			: persistedConfigValues;
		const [restoredConfig, restoredCustomizations] = await Promise.all([
			this._resolveCreatedSessionConfig(agent, {
				workingDirectories: meta.workingDirectories,
				config: restoredConfigValues,
			}, true),
			// Discovering customizations starts the agent's plugin client for the session's folders.
			load.kind === 'full' ? agent.getChatCustomizations(defaultChatUri, chatContext, this._hostCustomizations(session)).catch(err => {
				this._logService.error('[AgentService] restoreSession: failed to resolve chat customizations', err);
				return undefined;
			}) : undefined,
			...promises
		]);
		if (load.kind === 'dataForMove') {
			if (restoredConfig) {
				this._configurationService.restoreSessionConfig(sessionStr, restoredConfig);
			}
			this._logService.info(`[AgentService] Loaded the data of session ${sessionStr} for a move`);
			return { turnCount: 0, hasProject: !!meta.project, hasWorktree: adoptedWorktree, workingDirectoryCount: meta.workingDirectories?.length ?? 0 };
		}
		if (restoredConfig) {
			const previousConfig = this._stateManager.getSessionState(sessionStr)?.config;
			this._configurationService.restoreSessionConfig(sessionStr, restoredConfig);
			this._changesetCoordinator.onSessionConfigRestored(sessionStr, previousConfig);
			// Seeded config bypasses `onDidChangeSessionConfig`, so heal the
			// index for a session enabled before it was introduced.
			this._syncAgentMergeIndex(session, undefined, restoredConfig);
		}
		this._agentMergeController.onSessionAvailable(sessionStr);
		// Seed restored session customizations into state so the very first
		// snapshot after selecting an existing session contains effective
		// instructions/agents without waiting for a follow-up republish.
		if (restoredCustomizations && restoredCustomizations.length > 0) {
			this._stateManager.setSessionCustomizations(sessionStr, restoredCustomizations);
		}
		this._chatContributions.didRestoreSession(sessionStr);

		this._logService.info(`[AgentService] Restored session ${sessionStr} with ${turns.length} turns`);

		void this._gitStateService.attachSessionGitHubPullRequest(sessionStr, meta.workingDirectories?.[0]);
		void this._gitStateService.reconcilePendingRecordedPullRequests?.(sessionStr, true).catch(error =>
			this._logService.warn(`[AgentService] Failed to reconcile pending pull requests after restoring ${sessionStr}`, error));

		return {
			turnCount: mergedTurns.length,
			hasProject: !!meta.project,
			hasWorktree: adoptedWorktree,
			workingDirectoryCount: meta.workingDirectories?.length ?? 0,
		};
	}

	/** Restores authoritative central peer membership after importing cooling-period legacy changes. */
	private async _restorePeerChats(agent: IAgent, session: URI, cachedChats?: readonly ICatalogChat[]): Promise<void> {
		let [snapshot] = await this._orchestratorDatabase.readCatalogSnapshot([session.toString()]);
		let normalizedEntries: readonly IPersistedPeerChat[] | undefined;
		if (snapshot?.authorityVersion === 2) {
			// Imports what older builds changed in the session's older-build copy before restoring from it, reading the
			// session database's copy too (restore opens it anyway): 1.140 renames a peer there without touching the list
			// or its revision, so nothing in agent-host.db shows the edit.
			const sessionDatabase = await this._sessionDataService.tryOpenDatabase(session);
			try {
				normalizedEntries = await this._peerChatStore.reconcileLegacy(session, sessionDatabase);
			} finally {
				sessionDatabase?.dispose();
			}
			const peers = snapshot.chats.filter(chat => chat.order !== undefined && chat.chat !== snapshot?.header?.defaultChatUri).map(chat => chat.chat);
			if (!equals(peers, normalizedEntries?.map(entry => entry.uri) ?? [])) {
				[snapshot] = await this._orchestratorDatabase.readCatalogSnapshot([session.toString()]);
			}
		}
		// A legacy catalog records no storage, and migrating it records only the
		// creation-time rule, so the storage this snapshot records holds for both paths.
		const recordedStorage = recordedChatStorage(snapshot, this._logService);
		if (snapshot?.authorityVersion === 2) {
			const normalized = snapshot;
			const entries = normalizedEntries;
			if (!entries) {
				throw new Error(`Missing normalized peer membership for ${session.toString()}`);
			}
			this._removeChatsMissingFromCatalog(session, new Set(normalized.chats.map(chat => chat.chat)));
			const chats = normalized.chats.filter(chat => chat.order !== undefined).map(chat => ({
				uri: chat.chat,
				kind: normalized.header?.defaultChatUri === chat.chat ? 'default' as const : 'peer' as const,
				title: chat.metadata?.summary,
				interactivity: chat.metadata?.interactivity,
				changes: chat.metadata?.changes,
				workingDirectories: chat.workingDirectories,
			}));
			await this._restorePeerChatsFromCatalog(session, entries, recordedStorage, chats);
			// Before persisting what is listed: a move or a reorder may have placed a chat before the default chat.
			this._applyRecordedChatOrder(session.toString(), snapshot.chats
				.filter(chat => chat.order !== undefined)
				.sort((a, b) => a.order! - b.order!)
				.map(chat => chat.chat));
			await this._persistOrderedListVisibleSessionState(session, {});
			return;
		}
		const cached = cachedChats ?? await this._readCachedChatCatalog(session);
		let entries: readonly IPersistedPeerChat[];
		try {
			entries = await this._readOrMigrateLegacyPeerChatCatalog(agent, session);
		} catch (error) {
			const cachedPeers = cached?.filter(chat => chat.kind === 'peer');
			if (!cachedPeers?.length) {
				throw error;
			}
			this._logService.warn(`[AgentService] Restoring cached peer-chat membership without backing enrichment for ${session.toString()}`, error);
			entries = await this._peerChatStore.readLocalChatMetadata(session, cachedPeers.map(chat => ({
				uri: chat.uri,
				...(chat.origin !== undefined ? { origin: chat.origin } : {}),
				...(chat.archived === true ? { archived: true } : {}),
				...(chat.inheritedTurnId !== undefined ? { inheritedTurnId: chat.inheritedTurnId } : {}),
				...(chat.workingDirectories !== undefined ? { workingDirectories: chat.workingDirectories } : {}),
			})));
		}
		const entriesWithReadState = entries.map(entry => entry.isRead === undefined ? { ...entry, isRead: true } : entry);
		const cachedWorkingDirectories = new Map(cached?.filter(chat => chat.kind === 'peer' && chat.workingDirectories !== undefined).map(chat => [chat.uri, chat.workingDirectories]));
		const enrichedEntries = entriesWithReadState.map(entry => entry.workingDirectories === undefined && cachedWorkingDirectories.get(entry.uri) !== undefined
			? { ...entry, workingDirectories: cachedWorkingDirectories.get(entry.uri) }
			: entry);
		const toolChatUris = new Set([
			...enrichedEntries.filter(entry => entry.origin?.kind === ChatOriginKind.Tool).map(entry => entry.uri),
			...cached?.filter(chat => chat.origin?.kind === ChatOriginKind.Tool).map(chat => chat.uri) ?? [],
			...this._stateManager.getSessionState(session.toString())?.chats.filter(chat => chat.origin?.kind === ChatOriginKind.Tool).map(chat => chat.resource) ?? [],
		]);
		const restoredEntries = enrichedEntries.filter(entry => !toolChatUris.has(entry.uri));
		if (restoredEntries.length !== entries.length || restoredEntries.some((entry, index) => entry !== entries[index])) {
			await this._peerChatStore.replace(session, restoredEntries);
		}
		const restoredPeerUris = new Set(restoredEntries.map(entry => entry.uri));
		this._removeChatsMissingFromCatalog(session, restoredPeerUris);
		await this._restorePeerChatsFromCatalog(session, restoredEntries, recordedStorage, cached);
		await this._persistOrderedListVisibleSessionState(session, {});
	}

	/**
	 * Brings a loaded session's live state to what an import of older-build edits changed centrally, through the
	 * actions a local change dispatches: a chat's title, archived and read state, its draft, and the peers added or
	 * removed. A session that is not loaded reads them when it is restored.
	 */
	private async _applyImportedOlderBuildEdits(imported: IOlderBuildEditsImport): Promise<void> {
		const sessionKey = imported.session.toString();
		const state = this._stateManager.getSessionState(sessionKey);
		if (!state) {
			return;
		}
		const added: string[] = [];
		for (const [chat, edit] of imported.chats) {
			const summary = state.chats.find(candidate => candidate.resource === chat);
			if (edit.membership === 'added') {
				if (!summary) {
					added.push(chat);
				}
				continue;
			}
			if (!summary) {
				continue;
			}
			if (edit.membership === 'removed') {
				this._removeChatsMissingFromCatalog(imported.session, new Set(state.chats.map(candidate => candidate.resource).filter(candidate => candidate !== chat)));
				continue;
			}
			if (edit.title !== undefined && edit.title.title !== summary.title) {
				if (edit.title.titleSource === AGENT_HOST_TITLE_SOURCE_USER) {
					this._sideEffects.markTitleRenamed(sessionKey, chat);
				}
				this._stateManager.updateChatTitle(sessionKey, chat, edit.title.title);
			}
			const resolved = this._stateManager.getChatState(chat) !== undefined;
			for (const [value, flag, type] of [
				[edit.archived, SessionStatus.IsArchived, ActionType.ChatIsArchivedChanged],
				[edit.isRead, SessionStatus.IsRead, ActionType.ChatIsReadChanged],
			] as const) {
				const current = this._stateManager.getSessionState(sessionKey)?.chats.find(candidate => candidate.resource === chat)?.status ?? SessionStatus.Idle;
				if (value === undefined || ((current & flag) !== 0) === value) {
					continue;
				}
				// A read change applies to a chat not opened yet too, and keeps the session's read aggregate in step.
				if (resolved || type === ActionType.ChatIsReadChanged) {
					this._stateManager.dispatchServerAction(chat, type === ActionType.ChatIsArchivedChanged ? { type, isArchived: value } : { type, isRead: value });
				} else {
					// A restored chat not opened yet has only its summary.
					this._stateManager.dispatchServerAction(sessionKey, { type: ActionType.SessionChatUpdated, chat, changes: { status: withSessionStatusFlag(current, flag, value) } });
				}
			}
			if (edit.draft !== undefined) {
				if (resolved) {
					this._stateManager.dispatchServerAction(chat, { type: ActionType.ChatDraftChanged, draft: edit.draft ?? undefined });
				} else {
					// Also a cleared draft: the cached one would otherwise come back when the chat is opened.
					this._stateManager.setUnresolvedChatDraft(chat, edit.draft ?? undefined);
				}
			}
		}
		if (!added.length) {
			return;
		}
		const [snapshot] = await this._orchestratorDatabase.readCatalogSnapshot([sessionKey]);
		const entries = (await this._peerChatStore.tryRead(imported.session, false))?.filter(entry => added.includes(entry.uri) && !this._stateManager.getChatState(entry.uri)) ?? [];
		if (!snapshot || !entries.length || !this._stateManager.getSessionState(sessionKey)) {
			return;
		}
		await this._restorePeerChatsFromCatalog(imported.session, entries, recordedChatStorage(snapshot, this._logService), snapshot.chats.filter(chat => added.includes(chat.chat)).map(chat => ({
			uri: chat.chat,
			kind: 'peer' as const,
			title: chat.metadata?.summary,
			interactivity: chat.metadata?.interactivity,
			changes: chat.metadata?.changes,
			workingDirectories: chat.workingDirectories,
		})));
		for (const chat of added) {
			const summary = this._stateManager.getSessionState(sessionKey)?.chats.find(candidate => candidate.resource === chat);
			if (summary) {
				// Registered silently, as restoring does: announced as a local creation is.
				this._stateManager.dispatchServerAction(sessionKey, { type: ActionType.SessionChatAdded, summary });
			}
		}
	}

	/** Removes the live peers a restored catalog no longer lists, such as peers an older build deleted. Tool chats stay. */
	private _removeChatsMissingFromCatalog(session: URI, peers: ReadonlySet<string>): void {
		for (const chat of this._stateManager.getSessionState(session.toString())?.chats ?? []) {
			if (!this._chatOwnership.isDefaultChat(session.toString(), chat.resource) && chat.origin?.kind !== ChatOriginKind.Tool && !peers.has(chat.resource)) {
				this._stateManager.removeChat(session.toString(), chat.resource);
			}
		}
	}

	private async _readCentralChatCatalog(session: URI): Promise<readonly ICatalogChat[] | undefined> {
		const [snapshot] = await this._orchestratorDatabase.readCatalogSnapshot([session.toString()]);
		if (snapshot?.authorityVersion === 2) {
			return this._readCachedChatCatalog(session);
		}
		const peers = await this._peerChatStore.tryRead(session);
		if (peers !== undefined) {
			const defaultChatUri = this._resolveDefaultChat(session, snapshot, undefined);
			const defaultChatWorkingDirectories = await this._readDefaultChatWorkingDirectories(session, URI.parse(defaultChatUri));
			return [
				{
					uri: defaultChatUri,
					...(defaultChatWorkingDirectories !== undefined ? { workingDirectories: defaultChatWorkingDirectories } : {}),
					kind: 'default',
				},
				...peers.filter(peer => peer.origin?.kind !== ChatOriginKind.Tool).map(peer => ({
					uri: peer.uri,
					kind: 'peer' as const,
					origin: peer.origin,
					archived: peer.archived,
					inheritedTurnId: peer.inheritedTurnId,
					workingDirectories: peer.workingDirectories,
				})),
			];
		}
		return this._readCachedChatCatalog(session);
	}

	private async _readCachedChatCatalog(session: URI): Promise<readonly ICatalogChat[] | undefined> {
		const registered = await this._sessionRegistry.get(session, entry => this._migrateRegisteredSession(entry));
		if (!registered) {
			return undefined;
		}
		const result = await this._catalogListReader.read(registered);
		if (!result.eligible) {
			if (result.chatBacking) {
				this._logService.trace(`[AgentService] Central chat catalog for ${session.toString()} is a chat backing`);
			} else if (result.error) {
				this._logService.warn(`[AgentService] Failed to read central chat catalog for ${session.toString()}`, result.error);
			} else {
				this._logService.trace(`[AgentService] Central chat catalog for ${session.toString()} is ineligible: ${result.detail}`);
			}
			return undefined;
		}
		return result.data.chats.map(chat => ({
			uri: chat.uri.toString(),
			kind: chat.kind,
			title: chat.summary,
			origin: fromCatalogChatOrigin(chat.origin),
			...(chat.interactivity !== undefined ? { interactivity: chat.interactivity } : {}),
			...(chat.archived === true ? { archived: true } : {}),
			...(chat.isRead !== undefined ? { isRead: chat.isRead } : {}),
			inheritedTurnId: chat.inheritedTurnId,
			workingDirectories: chat.workingDirectories,
			...(chat.changes !== undefined ? { changes: chat.changes } : {}),
		}));
	}

	private async _readOrMigrateLegacyPeerChatCatalog(agent: IAgent, session: URI, database?: AgentHostCatalogDatabaseReference): Promise<IPersistedPeerChat[]> {
		const persisted = await this._peerChatStore.reconcileLegacy(session, database);
		if (persisted !== undefined) {
			return persisted;
		}
		const cached = await this._readCachedChatCatalog(session);
		if (cached?.some(chat => chat.kind === 'peer')) {
			const projectedPeers: IPersistedPeerChat[] = cached.filter(chat => chat.kind === 'peer').map(chat => ({
				uri: chat.uri,
				isRead: chat.isRead !== false,
				...(chat.origin !== undefined ? { origin: chat.origin } : {}),
				...(chat.archived === true ? { archived: true } : {}),
				...(chat.inheritedTurnId !== undefined ? { inheritedTurnId: chat.inheritedTurnId } : {}),
				...(chat.workingDirectories !== undefined ? { workingDirectories: chat.workingDirectories } : {}),
			}));
			let legacy: readonly IAgentLegacyChat[] = [];
			try {
				legacy = await agent.listLegacyChatBackings?.(session) ?? [];
			} catch (error) {
				this._logService.warn(`[AgentService] Failed to enrich cached peer-chat membership for ${session.toString()}`, error);
				throw error;
			}
			const legacyProviderData = new Map(legacy.map(chat => [chat.uri.toString(), chat.providerData]));
			const enrichedPeers = projectedPeers.map(peer => {
				const providerData = legacyProviderData.get(peer.uri);
				return providerData !== undefined ? { ...peer, providerData } : peer;
			});
			const peers = await this._peerChatStore.readLocalChatMetadata(session, enrichedPeers);
			return this._peerChatStore.initialize(session, peers, database);
		}
		let legacy: readonly IAgentLegacyChat[] | undefined;
		try {
			legacy = await agent.listLegacyChatBackings?.(session);
		} catch (error) {
			this._logService.warn(`[AgentService] Failed to enumerate peer-chat membership for ${session.toString()}`, error);
			throw error;
		}
		if (legacy === undefined) {
			return [];
		}
		const entries: IPersistedPeerChat[] = legacy.map(chat => ({
			uri: chat.uri.toString(),
			isRead: true,
			...(chat.providerData !== undefined ? { providerData: chat.providerData } : {}),
		}));
		return this._peerChatStore.initialize(session, entries, database);
	}

	/**
	 * Registers a set of peer chats from an enumerated catalog in catalog order.
	 * Titles and drafts are metadata-only reads; backing sessions and histories
	 * are loaded on the first content request.
	 */
	/**
	 * Orders a restored session's visible chats as its catalog records them (`chats_v2.chat_order`, default chat
	 * included). Chats the order doesn't list (subagents, hidden chats) keep their places.
	 */
	private _applyRecordedChatOrder(session: string, recorded: readonly string[]): void {
		const current = this._stateManager.getSessionState(session)?.chats.map(chat => chat.resource) ?? [];
		const present = new Set(current);
		const visible = recorded.filter(chat => present.has(chat));
		const visibleSet = new Set(visible);
		let next = 0;
		const ordered = current.map(chat => visibleSet.has(chat) ? visible[next++] : chat);
		if (ordered.some((chat, index) => chat !== current[index])) {
			this._stateManager.dispatchServerAction(session, { type: ActionType.SessionChatsReordered, chats: ordered });
		}
	}

	private async _restorePeerChatsFromCatalog(session: URI, entries: readonly IPersistedPeerChat[], recordedStorage: ReadonlyMap<string, string>, cachedChats?: readonly ICatalogChat[]): Promise<void> {
		const restored = await Promise.all(entries.map(async (entry) => {
			let chatUri: URI;
			try {
				chatUri = URI.parse(entry.uri);
			} catch (err) {
				this._logService.warn(`[AgentService] Skipping malformed persisted peer chat URI '${entry.uri}': ${toErrorMessage(err)}`);
				return undefined;
			}
			const cachedChat = cachedChats?.find(chat => chat.uri === entry.uri);
			const cachedTitle = cachedChat?.title;
			// A legacy catalog records no storage, so its chats follow the creation-time rule.
			const storageResource = recordedStorage.get(chatUri.toString()) ?? creationTimeChatStorageResource(session.toString(), chatUri.toString(), this._defaultChat(session));
			const { title, draft, config } = await this._chatContributions.hydrateChat({
				session: session.toString(),
				chat: chatUri.toString(),
				isDefaultChat: false,
				storageResource,
			}, cachedTitle ? { title: cachedTitle } : {});
			return {
				chatUri,
				storageResource,
				title,
				draft,
				config,
				providerData: entry.providerData,
				origin: entry.origin,
				interactivity: cachedChat?.interactivity,
				inheritedTurnId: entry.inheritedTurnId,
				workingDirectories: entry.workingDirectories ?? cachedChat?.workingDirectories,
				archived: entry.archived,
				isRead: entry.isRead,
				changes: cachedChat?.changes,
			};
		}));
		for (const item of restored) {
			if (!item) {
				continue;
			}
			const { chatUri, storageResource, title, draft, config, providerData, origin, interactivity, inheritedTurnId, workingDirectories, archived, isRead, changes } = item;
			if (this._stateManager.getChatState(chatUri.toString())) {
				continue;
			}
			this._stateManager.registerRestoredChatSummary(session.toString(), chatUri.toString(), {
				storageResource,
				title,
				draft,
				config,
				providerData,
				origin,
				interactivity,
				inheritedTurnId,
				workingDirectories,
				archived,
				isRead,
				changes,
				resolver: (currentProviderData, storageResource, credentials) => this._materializeRestoredPeerChat(chatUri, currentProviderData, storageResource, credentials),
			});
		}
	}

	private async _readDefaultChatWorkingDirectories(session: URI, defaultChat: URI): Promise<readonly string[] | undefined> {
		const normalized = await this._peerChatStore.readNormalizedChat(session, defaultChat);
		if (normalized.normalized) {
			if (!normalized.chat) {
				throw new Error(`Missing normalized default chat ${defaultChat.toString()}`);
			}
			return normalized.chat.workingDirectories;
		}
		const ref = await this._sessionDataService.tryOpenDatabase?.(defaultChat);
		if (!ref) {
			return undefined;
		}
		let raw: string | undefined;
		try {
			raw = await ref.object.getMetadata(CHAT_WORKING_DIRECTORIES_METADATA_KEY);
		} finally {
			ref.dispose();
		}
		if (!raw) {
			return undefined;
		}
		try {
			const parsed: unknown = JSON.parse(raw);
			if (!Array.isArray(parsed) || !parsed.every(directory => typeof directory === 'string')) {
				throw new Error('expected an array of working-directory URIs');
			}
			return parsed;
		} catch (error) {
			this._logService.warn(`[AgentService] Ignoring malformed default-chat working directories for ${defaultChat.toString()}: ${toErrorMessage(error)}`);
			return undefined;
		}
	}

	/**
	 * Materializes provider backing and history for the state-manager-owned
	 * restored chat entry. This callback never mutates state manager state.
	 *
	 * `materializeChat` may report a fresh `backingSession` for a peer chat
	 * being restored (the same field used at create time to trigger
	 * `_markChatBacking`); when it does, this marks it the same way create
	 * does, with the same retry/suppression semantics, so a restored peer
	 * chat's backing session cannot leak into the top-level session list.
	 *
	 * The chat resolves for the session that owns it when it resolves, as recorded: a chat moved before it was
	 * resolved (C15) resolves in its new session. The default chat of a session loaded for a move only is never
	 * resolved there; once a move makes it a peer of another session, it resolves as one.
	 */
	private async _materializeRestoredPeerChat(chat: URI, providerData: string | undefined, storageResource: string, credentials?: IAgentHostCredentialSource): Promise<{ turns: Turn[]; draft?: Message }> {
		const chatKey = chat.toString();
		const owner = this._chatOwnership.getChatOwner(chatKey);
		if (owner === undefined) {
			throw new RestoredPeerChatUnavailableError(chatKey, 'it has no recorded owner');
		}
		if (this._stateManager.isDataOnlySession(owner) && this._chatOwnership.isDefaultChat(owner, chatKey)) {
			throw new RestoredPeerChatUnavailableError(chatKey, `it is the default chat of ${owner}, loaded for a move only until its session is opened`);
		}
		const session = URI.parse(owner);
		const agent = this._providerService.getProviderForSession(session);
		if (!agent) {
			throw new Error(`No agent provider for restored peer chat: ${chatKey}`);
		}
		try {
			const [persisted, draft] = await Promise.all([
				providerData === undefined ? this._peerChatStore.find(session, chat) : undefined,
				this._getChatDraft(session, chat),
			]);
			const effectiveProviderData = providerData ?? persisted?.providerData;
			const context = { ...this._chatContext(session, chat, storageResource), ...(credentials ? { credentials } : {}) };
			const result = await agent.materializeChat(chat, context, effectiveProviderData);
			if (result?.backingSession) {
				await this._markChatBacking(result.backingSession, session, chat);
			}
			const turns = await this._getChatMessages(agent, chat, session, false, URI.parse(storageResource), undefined, undefined, credentials);
			return { turns: await this._interleaveLocalTurns(session.toString(), chatKey, turns), draft };
		} catch (err) {
			this._logService.warn(`[AgentService] Failed to materialize peer chat ${chatKey}: ${toErrorMessage(err)}`);
			throw err;
		}
	}

	/**
	 * Re-persists a peer chat's opaque `providerData` blob when the agent
	 * reports it changed (e.g. per-chat model switch or fork remap).
	 */
	private _onChatDataChanged(e: IAgentChatDataChange): void {
		const sessionStr = this._chatOwnership.getChatOwner(e.chat.toString());
		if (sessionStr === undefined) {
			this._logService.warn(`[AgentService] onDidChangeChatData for unknown chat: ${e.chat.toString()}`);
			return;
		}
		if (this._chatOwnership.isDefaultChat(sessionStr, e.chat.toString())) {
			void this._persistDefaultChatBacking({ session: URI.parse(sessionStr), chat: e, defaultChat: e.chat })
				.catch(err => this._logService.error(err, `[AgentService] Failed to persist default-chat backing for ${e.chat.toString()}`));
			return;
		}
		const session = this._stateManager.getSessionState(sessionStr);
		const chat = session?.chats.find(chat => chat.resource.toString() === e.chat.toString());
		if (this._disposingPeerChats.has(e.chat.toString()) || !chat || chat.origin?.kind === ChatOriginKind.Tool) {
			if (chat && !this._disposingPeerChats.has(e.chat.toString())) {
				void this._peerChatStore.persistPrivateChat(URI.parse(sessionStr), {
					chat: e.chat.toString(), providerData: e.providerData,
					metadata: { interactivity: ChatInteractivity.Hidden },
				}).catch(error => this._logService.error(error, `[AgentService] Failed to persist private provider data for ${e.chat.toString()}`));
			}
			return;
		}
		this._stateManager.updateChatProviderData(e.chat.toString(), e.providerData);
		void this._peerChatStore.upsert(URI.parse(sessionStr), e.chat, e.providerData, chat.origin)
			.catch(err => this._logService.error(err, `[AgentService] Failed to persist peer-chat backing for ${e.chat.toString()}`));
	}

	/**
	 * Keeps agent-spawned chats in the catalog early enough for their first turn:
	 * a `subagent_started` progress signal feeds the same handler as
	 * {@link IAgent.onDidSpawnChat}. Completion is ignored here because spawned
	 * chats stay live until session teardown, and overlap with the agent's own
	 * spawn bridge is safe because `addChat` is idempotent.
	 */
	private _sequenceSpawnedChat(signal: AgentSignal): void {
		const spawn = SubagentChatSignal.toSpawnEvent(signal, chat => {
			const owner = this._chatOwnership.getChatOwner(chat);
			return owner === undefined ? undefined : { owner, format: chatUriFormatOf(this._chatOwnership.getDefaultChat(owner)) };
		});
		if (spawn) {
			this._onChatSpawned(spawn);
		}
	}

	/** Marks a subagent chat as pending once its confirmed tool call reaches (or is about to reach) `Running`. */
	private _trackPendingSubagentChatFromEnvelope(envelope: ActionEnvelope): void {
		const { channel, action } = envelope;
		if (action.type === ActionType.ChatToolCallStart || action.type === ActionType.ChatToolCallDelta || action.type === ActionType.ChatToolCallReady) {
			const key = `${channel}:${action.toolCallId}`;
			// Providers stamp `toolKind`/`subagentChatUri` on whichever action
			// first reveals it (Copilot at Start, Claude at Ready) — later
			// actions for the same tool call don't repeat it, so fall back to
			// what we already recorded for this tool call.
			const subagentChatUri = readToolCallMeta(action).subagentChatUri ?? this._pendingSubagentToolCalls.get(key);
			if (subagentChatUri === undefined) {
				return;
			}
			if (action.type === ActionType.ChatToolCallReady && action.confirmed) {
				// Goes straight to Running — arm the bounded wait now.
				this._pendingSubagentToolCalls.delete(key);
				this._armPendingSubagentChat(subagentChatUri);
				return;
			}
			// Still streaming or awaiting confirmation. Remember the URI so a
			// later ChatToolCallConfirmed can arm the wait once (if ever)
			// confirmed, without timing out while the user is still deciding.
			this._pendingSubagentToolCalls.set(key, subagentChatUri);
			return;
		}
		if (action.type === ActionType.ChatToolCallConfirmed) {
			const key = `${channel}:${action.toolCallId}`;
			const subagentChatUri = this._pendingSubagentToolCalls.get(key);
			if (subagentChatUri === undefined) {
				return;
			}
			this._pendingSubagentToolCalls.delete(key);
			if (action.approved) {
				this._armPendingSubagentChat(subagentChatUri);
			}
			// Denied: the subagent will never spawn; nothing to resolve since
			// the wait was never armed while awaiting confirmation.
			return;
		}
		if (action.type === ActionType.ChatToolCallComplete) {
			// Defensive cleanup: a tool call can complete without ever being
			// confirmed (e.g. cancelled by other means) while still tracked.
			this._pendingSubagentToolCalls.delete(`${channel}:${action.toolCallId}`);
		}
	}

	private _armPendingSubagentChat(subagentChatUri: string): void {
		if (this._pendingSubagentChats.has(subagentChatUri) || this._stateManager.getSnapshot(subagentChatUri)) {
			return;
		}
		const deferred = new DeferredPromise<void>();
		this._pendingSubagentChats.set(subagentChatUri, deferred);
		this._pendingSubagentChatTimeouts.set(subagentChatUri, disposableTimeout(() => {
			this._pendingSubagentChats.delete(subagentChatUri);
			this._pendingSubagentChatTimeouts.deleteAndDispose(subagentChatUri);
			deferred.complete();
		}, SUBAGENT_CHAT_PENDING_TIMEOUT_MS));
	}

	private _resolvePendingSubagentChat(resource: string): void {
		const deferred = this._pendingSubagentChats.get(resource);
		if (!deferred) {
			return;
		}
		this._pendingSubagentChats.delete(resource);
		this._pendingSubagentChatTimeouts.deleteAndDispose(resource);
		deferred.complete();
	}

	/**
	 * Spawned chats remain outside persisted public peer membership and are re-derived from parent logs on restore.
	 * Normalized catalogs retain their private lifecycle metadata, including the parent edge.
	 */
	private _onChatSpawned(e: IAgentSpawnChatEvent): void {
		if (e.parent) {
			this._orchestratorDatabase.recordChatStorageIdentity(e.session.toString(), e.chat.toString(), { kind: 'subagent', toolCallId: e.parent.toolCallId });
		}
		// A spawned chat is brand new, so its storage follows the creation-time rule.
		this._stateManager.addChat(e.session.toString(), e.chat.toString(), creationTimeChatStorageResource(e.session.toString(), e.chat.toString(), this._defaultChat(e.session)), {
			...(e.title !== undefined ? { title: e.title } : {}),
			...(e.parent ? {
				origin: { kind: ChatOriginKind.Tool, chat: e.parent.chat.toString(), toolCallId: e.parent.toolCallId },
				// Subagent worker chats are observable but not directly steerable:
				// the user watches them and steers the lead chat. Mark read-only so
				// the UI hides the composer and shows a lock (the agent-team pattern).
				interactivity: ChatInteractivity.ReadOnly,
			} : {}),
		});
		this._resolvePendingSubagentChat(e.chat.toString());
		const summary = this._stateManager.getSessionState(e.session.toString())?.chats.find(chat => chat.resource === e.chat.toString());
		void this._recordLegacyPrivateChatStorage(e.session, e.chat);
		void this._peerChatStore.persistPrivateChat(e.session, {
			chat: e.chat.toString(),
			parentChat: e.parent?.chat.toString(),
			origin: summary?.origin === undefined ? undefined : JSON.stringify(summary.origin),
			workingDirectories: summary?.workingDirectories,
			metadata: { ...(e.title !== undefined ? { summary: e.title } : {}), interactivity: ChatInteractivity.Hidden },
		}).catch(error => this._logService.error(error, `[AgentService] Failed to persist spawned chat ${e.chat.toString()}`));
	}

	/**
	 * Persists a freshly-created (or recovered) default chat's durable state:
	 * its opaque `providerData` blob and, separately, its backing-session
	 * marker. The two writes are independent — a failure persisting
	 * `providerData` must not skip marking the backing
	 * session, since that marker is what keeps the backing session out of the
	 * top-level list; `_markChatBacking` has its own retry/suppression and
	 * never throws. The provider-data failure is rethrown after the marker
	 * attempt so creation can roll back instead of reporting a session whose
	 * concrete backing cannot be restored.
	 */
	private async _persistDefaultChatBacking(created: IAgentCreateSessionResult & { readonly defaultChat: URI }): Promise<void> {
		const providerData = created.chat?.providerData;
		const defaultChat = created.defaultChat;
		let providerDataError: Error | undefined;
		if (providerData !== undefined) {
			try {
				await this._peerChatStore.persistMetadata(created.session, defaultChat, { [CHAT_PROVIDER_DATA_METADATA_KEY]: providerData });
			} catch (err) {
				this._logService.warn(`[AgentService] failed to persist default-chat provider data for ${created.session.toString()}`, err);
				providerDataError = err instanceof Error ? err : new Error(String(err));
			}
			try {
				if (!(await this._peerChatStore.readNormalizedChat(created.session, defaultChat)).normalized) {
					await this._peerChatStore.persistMetadata(created.session, created.session, { [DEFAULT_CHAT_PROVIDER_DATA_METADATA_KEY]: providerData });
				}
			} catch (err) {
				this._logService.warn(`[AgentService] failed to mirror default-chat provider data for ${created.session.toString()}`, err);
			}
		}
		if (created.chat?.backingSession) {
			await this._markChatBacking(created.chat.backingSession, created.session, defaultChat);
		}
		if (providerDataError) {
			throw providerDataError;
		}
	}

	private async _readDefaultChatProviderData(session: URI): Promise<string | undefined> {
		return (await this._readDefaultChatBacking(session)).providerData;
	}

	/**
	 * A session's default chat, its persisted provider data and its storage, from one catalog read. The storage is
	 * the recorded one (a promoted chat keeps its own, Block 4), else the default chat's registered or creation-time one.
	 */
	private async _readDefaultChatBacking(session: URI): Promise<{ readonly chat: string; readonly providerData: string | undefined; readonly storage: string }> {
		const [snapshot] = await this._orchestratorDatabase.readCatalogSnapshot([session.toString()]);
		const chat = this._resolveDefaultChat(session, snapshot, undefined);
		const storage = recordedChatStorage(snapshot, this._logService).get(chat)
			?? this._knownDefaultChatStorageResource(session, URI.parse(chat))
			?? this._newDefaultChatStorageResource(session, URI.parse(chat));
		return { chat, providerData: await this._readDefaultChatBackingProviderData(session, snapshot, chat), storage };
	}

	private async _readDefaultChatBackingProviderData(session: URI, snapshot: IAgentHostDatabaseCatalogSnapshotEntry | undefined, chat: string): Promise<string | undefined> {
		if (snapshot?.authorityVersion === 2) {
			return (await this._orchestratorDatabase.getChatV2ProviderDetail(chat))?.providerData;
		}
		const defaultChat = URI.parse(chat);
		const chatRef = await this._sessionDataService.tryOpenDatabase?.(defaultChat);
		if (chatRef) {
			try {
				const providerData = await chatRef.object.getMetadata(CHAT_PROVIDER_DATA_METADATA_KEY);
				if (providerData !== undefined) {
					return providerData || undefined;
				}
			} finally {
				chatRef.dispose();
			}
		}
		const ref = await this._sessionDataService.tryOpenDatabase?.(session);
		if (!ref) {
			return undefined;
		}
		try {
			return await ref.object.getMetadata(DEFAULT_CHAT_PROVIDER_DATA_METADATA_KEY);
		} finally {
			ref.dispose();
		}
	}

	private async _isWorkspaceConversionQuarantined(session: URI): Promise<boolean> {
		const metadata = await this._sessionStateStore.readWithoutImport(session, [AH_META_WORKSPACE_CONVERSION_QUARANTINED_DB_KEY]);
		return metadata.get(AH_META_WORKSPACE_CONVERSION_QUARANTINED_DB_KEY) === 'true';
	}

	/**
	 * Marks a chat's backing SDK session so legacy discovery cannot register
	 * it as a standalone top-level session. Best-effort and never throws:
	 * callers (chat creation / restore) must not fail just because this
	 * durable write did. In-process suppression starts before the write and is
	 * cleared only after the central catalog acknowledges the backing state.
	 */
	private async _markChatBacking(backingSession: URI, session: URI, chat: URI): Promise<void> {
		const backingSessionStr = backingSession.toString();
		this._unpersistedChatBackings.add(backingSessionStr);
		const write = async (): Promise<void> => {
			const provider = AgentSession.provider(backingSession);
			if (!provider) {
				throw new Error(`Chat backing has no provider: ${backingSessionStr}`);
			}
			if (!isEqual(this._sessionDataService.getSessionDataDir(backingSession), this._sessionDataService.getSessionDataDir(session))) {
				const ref = this._sessionDataService.openDatabase(backingSession);
				try {
					await ref.object.setMetadata(CHAT_BACKING_METADATA_KEY, chat.toString());
					await ref.object.setMetadata(`${CHAT_BACKING_METADATA_KEY}Provider`, provider);
				} finally {
					ref.dispose();
				}
			}
			await this._sessionRegistry.markSessionsV2Excluded({ provider, session: backingSessionStr, reason: 'backing', fingerprint: 'backing-v1' });
		};
		try {
			await write();
			await this._markCatalogPayloadDirty(backingSessionStr);
			this._catalogReconciliationService.schedule();
		} catch (err) {
			this._logService.warn(`[AgentService] failed to mark backing session ${backingSessionStr} for chat ${chat.toString()}, retrying`, err);
			try {
				await write();
				await this._markCatalogPayloadDirty(backingSessionStr);
				this._catalogReconciliationService.schedule();
			} catch (retryErr) {
				this._logService.warn(`[AgentService] retry failed to mark backing session ${backingSessionStr} for chat ${chat.toString()}; suppressing it in-process instead`, retryErr);
				this._unpersistedChatBackings.add(backingSessionStr);
			}
		}
	}

	private async _isCatalogBackingProjectionPending(session: URI): Promise<boolean> {
		const sessionKey = session.toString();
		if (!this._unpersistedChatBackings.has(sessionKey)) {
			return false;
		}
		try {
			if ((await this._orchestratorDatabase.getSessionV2(sessionKey))?.isChatBacking) {
				this._unpersistedChatBackings.delete(sessionKey);
				return false;
			}
		} catch (error) {
			this._logService.warn(`[AgentService] Failed to verify central backing projection for ${sessionKey}`, error);
		}
		return true;
	}

	private async _markCatalogPayloadDirty(session: string): Promise<void> {
		try {
			await this._orchestratorDatabase.markSessionV2PayloadDirty(session);
		} catch (error) {
			this._logService.warn(`[AgentService] Failed to mark catalog payload dirty for ${session}`, error);
		}
		// A mutation is fresh evidence about this session, so a parked row must
		// be re-attempted rather than waiting for the periodic verification. The
		// wake follows the dirty write so a pass that is concurrently deciding to
		// park this session observes the newer revision and declines.
		this._catalogReconciliationService.wakeParkedSessions(session);
	}

	private _getChatDraft(session: URI, chatUri: URI): Promise<Message | undefined> {
		return this._sessionStateStore.chatRows.getDraft(session, chatUri);
	}

	private _clearChatDraft(session: URI, chatUri: URI): Promise<void> {
		return this._sessionStateStore.chatRows.setDraft(session, chatUri, undefined);
	}

	/** A session's metadata as the session list reads it, without starting its agent (C15); `undefined` when that says nothing. */
	private async _readSessionMetadataForMove(agent: IAgent, session: URI, registration: IRegisteredSession): Promise<IAgentSessionMetadata | undefined> {
		try {
			return await this._withWorktreeProject(session, await this._registeredSessionMetadata(agent, session, false, registration));
		} catch (error) {
			this._logService.warn(`[AgentService] Failed to read the metadata of ${session.toString()} for a move`, error);
			return undefined;
		}
	}

	private async _getSessionMetadataForRestore(agent: IAgent, session: URI, external: boolean): Promise<IAgentSessionMetadata | undefined> {
		const sessionStr = session.toString();
		try {
			const backing = await this._readDefaultChatBacking(session);
			const chat = URI.parse(backing.chat);
			const metadata = await agent.getChatMetadata(chat, this._chatContext(session, chat, backing.storage), backing.providerData, { activation: 'restore' });
			return await this._withWorktreeProject(session, metadata ? this._toSessionMetadata(metadata, session, agent.id) : undefined);
		} catch (err) {
			if (err instanceof ProtocolError) {
				throw err;
			}
			try {
				return await this._withWorktreeProject(session, await this._getSessionMetadataFromCatalog(agent, session, external));
			} catch (fallbackErr) {
				if (fallbackErr instanceof ProtocolError) {
					const message = err instanceof Error ? err.message : String(err);
					throw new ProtocolError(fallbackErr.code, `Failed to get chat metadata for ${sessionStr}: ${message}; ${fallbackErr.message}`, fallbackErr.data);
				}
				throw fallbackErr;
			}
		}
	}

	/**
	 * Merges the repository project for a worktree-isolated session onto its
	 * restored metadata so the session groups under the repository (not the
	 * `<repo>.worktrees/<name>` directory) in the sessions UI. No-op for folder
	 * sessions and for `undefined` metadata. Host-owned so agents stay unaware.
	 */
	private async _withWorktreeProject(session: URI, meta: IAgentSessionMetadata | undefined): Promise<IAgentSessionMetadata | undefined> {
		if (!meta) {
			return meta;
		}
		const primary = meta.workingDirectories?.[0];
		// Its own recorded worktree, else a shared worktree a move recorded as its primary folder (Block 5); read on restore only.
		const project = await this._worktree.resolveWorktreeProject(session)
			?? (primary && worktreeProjectFromRepositoryRoot(sessionWorktreeFolderRepositoryRoot((await this._sessionStateStore.readWithoutImport(session, [WORKTREE_FOLDERS_KEY])).get(WORKTREE_FOLDERS_KEY), primary)));
		return project ? { ...meta, project } : meta;
	}

	private async _getSessionMetadataFromCatalog(agent: IAgent, session: URI, external: boolean): Promise<IAgentSessionMetadata | undefined> {
		const sessionStr = session.toString();
		let allSessions;
		try {
			if (external) {
				return undefined;
			}
			allSessions = await this._enumerateLegacyProviderSessions(agent);
		} catch (err) {
			if (err instanceof ProtocolError) {
				throw err;
			}
			const message = err instanceof Error ? err.message : String(err);
			throw new ProtocolError(JSON_RPC_INTERNAL_ERROR, `Failed to list sessions for ${sessionStr}: ${message}`);
		}
		return allSessions === AgentChatMigrationDeferred ? undefined : allSessions?.find(candidate => candidate.session.toString() === sessionStr);
	}

	async resourceRead(uri: URI, encoding: ContentEncoding = ContentEncoding.Utf8): Promise<ResourceReadResult> {
		try {
			return await this._resourceProviders.read(uri, encoding);
		} catch (error) {
			// A moved chat's pre-move attachment its origin no longer has (deleted, also by an older build) is read from the
			// chat's own copy (Block 4b).
			const copy = this._attachmentMigration.resolveFallback(uri);
			if (copy && !await this._fileService.exists(uri)) {
				return this._resourceProviders.read(copy, encoding);
			}
			throw error;
		}
	}

	async resourceWrite(params: ResourceWriteParams): Promise<ResourceWriteResult> {
		return this._resourceProviders.write(params);
	}

	async resourceCopy(params: ResourceCopyParams): Promise<ResourceCopyResult> {
		return this._resourceProviders.copy(params);
	}

	async resourceDelete(params: ResourceDeleteParams): Promise<ResourceDeleteResult> {
		return this._resourceProviders.delete(params);
	}

	async resourceMove(params: ResourceMoveParams): Promise<ResourceMoveResult> {
		return this._resourceProviders.move(params);
	}

	async resourceResolve(params: ResourceResolveParams): Promise<ResourceResolveResult> {
		return this._resourceProviders.resolve(params);
	}

	measureWorktreeDiskUsage(root: URI, token: CancellationToken): Promise<number | undefined> {
		return this._worktreeDiskUsage.measure(root, token);
	}

	async resourceMkdir(params: ResourceMkdirParams): Promise<ResourceMkdirResult> {
		return this._resourceProviders.mkdir(params);
	}

	async createResourceWatch(params: CreateResourceWatchParams): Promise<CreateResourceWatchResult> {
		const root = typeof params.uri === 'string' ? URI.parse(params.uri) : URI.revive(params.uri);
		// Verify the URI exists before we mint a channel; spec requires
		// `NotFound` when the URI is missing rather than silently producing
		// a watcher that will never fire. The watcher itself is not
		// attached here — encoding the descriptor into the channel URI
		// lets `subscribe` materialise the underlying IFileService
		// watcher lazily on the first subscriber, and tear it down again
		// after the last unsubscribe (with a grace window).
		try {
			await this._fileService.stat(root);
		} catch (e) {
			if (toFileOperationResult(e as Error) === FileOperationResult.FILE_PERMISSION_DENIED) {
				throw new ProtocolError(AhpErrorCodes.PermissionDenied, `Permission denied: ${root.toString()}`);
			}
			throw new ProtocolError(AhpErrorCodes.NotFound, `Resource not found: ${root.toString()}`);
		}

		const channel = buildResourceWatchChannelUri({
			root: root.toString(),
			recursive: params.recursive === true,
			excludes: params.excludes,
			includes: params.includes,
		});
		return { channel };
	}

	/**
	 * Notifies the agent service that a client subscribed to a resource
	 * watch channel. On the first subscriber the underlying
	 * {@link IFileService} watcher is attached; subsequent subscribers
	 * bump the refcount and cancel any pending grace dispose. Returns
	 * the decoded descriptor for use as the subscribe snapshot, or
	 * `undefined` when `channel` is not a recognisable
	 * `ahp-resource-watch:` URI.
	 */
	onResourceWatchSubscribed(channel: string): ResourceWatchState | undefined {
		const descriptor = parseResourceWatchChannelUri(channel);
		if (!descriptor) {
			return undefined;
		}
		const existing = this._resourceWatches.get(channel);
		if (existing) {
			existing.subscribers++;
			if (existing.pendingGc) {
				existing.pendingGc.clear();
			}
			return existing.descriptor;
		}
		// First subscriber — materialise the IFileService watcher.
		const disposables = new DisposableStore();
		try {
			const root = URI.parse(descriptor.root);
			const watchOptions = {
				recursive: descriptor.recursive,
				excludes: descriptor.excludes?.items ?? [],
				includes: descriptor.includes?.items,
			};
			if (descriptor.recursive) {
				// Correlated watchers are non-recursive only, so register
				// an uncorrelated recursive watch and filter the global
				// stream by descendants of the watched root.
				disposables.add(this._fileService.watch(root, watchOptions));
				disposables.add(this._fileService.onDidFilesChange(event => {
					const filtered = collectChangesUnderRoot(event, root);
					if (filtered.length > 0) {
						this._dispatchResourceWatchChanges(channel, filtered);
					}
				}));
			} else {
				const watcher = this._fileService.createWatcher(root, { ...watchOptions, recursive: false });
				disposables.add(watcher);
				disposables.add(watcher.onDidChange(event => {
					this._dispatchResourceWatchChanges(channel, collectChanges(event));
				}));
			}
		} catch (e) {
			disposables.dispose();
			this._logService.warn(`[AgentService] Failed to start IFileService watcher for ${channel}: ${e instanceof Error ? e.message : String(e)}`);
			return undefined;
		}
		this._resourceWatches.set(channel, {
			channel,
			descriptor,
			subscribers: 1,
			disposables,
			pendingGc: disposables.add(new MutableDisposable()),
			dispose: () => disposables.dispose(),
		});
		return descriptor;
	}

	/**
	 * Counterpart to {@link onResourceWatchSubscribed}. Decrements the
	 * subscriber refcount for a watch channel; when it reaches zero the
	 * watcher is held for {@link RESOURCE_WATCH_GRACE_MS} before being
	 * disposed, giving a transient disconnect time to resubscribe.
	 */
	onResourceWatchUnsubscribed(channel: string): boolean {
		const entry = this._resourceWatches.get(channel);
		if (!entry) {
			return false;
		}
		entry.subscribers = Math.max(0, entry.subscribers - 1);
		if (entry.subscribers > 0) {
			return true;
		}
		entry.pendingGc.value = disposableTimeout(() => {
			const current = this._resourceWatches.get(channel);
			if (!current || current.subscribers > 0) {
				return;
			}
			this._resourceWatches.deleteAndDispose(channel);
		}, RESOURCE_WATCH_GRACE_MS);
		return true;
	}

	private _dispatchResourceWatchChanges(channel: string, raw: readonly IFileChange[]): void {
		if (raw.length === 0) {
			return;
		}
		const items = raw.map(c => ({
			uri: c.resource.toString(),
			type: c.type === FileChangeType.ADDED ? ResourceChangeType.Added
				: c.type === FileChangeType.DELETED ? ResourceChangeType.Deleted
					: ResourceChangeType.Updated,
		}));
		this._stateManager.dispatchServerAction(channel, {
			type: ActionType.ResourceWatchChanged,
			changes: { items },
		});
	}

	async shutdown(): Promise<void> {
		this._logService.info('AgentService: shutting down all providers...');
		this._catalogReconciliationService.dispose();
		try {
			try {
				while (this._clientDispatchQueues.size > 0) {
					await Promise.allSettled([...this._clientDispatchQueues.values()]);
				}
				await this.whenCatalogReconciliationIdle();
			} finally {
				await this._providerService.shutdown();
			}
		} finally {
			try {
				await this.whenCatalogReconciliationIdle();
			} finally {
				await this._replayPendingPassiveSessionMetadata();
				await this._debugLogsCollector?.cleanup();
				try {
					await this._peerChatStore.flushCompatibilityPublishes(undefined, undefined);
				} catch (error) {
					this._logService.error(error, '[AgentService] Failed to publish peer-chat compatibility state before shutdown');
				}
				try {
					// Session state writes are fire-and-forget for their callers: let every queued write and pending mirror land before the database closes.
					await this._sessionStateStore.whenIdle(undefined);
				} catch (error) {
					this._logService.error(error, '[AgentService] Failed to flush session state before shutdown');
				}
				await this._orchestratorDatabase.close();
				this._downloadProgressInterest.clear();
			}
		}
	}

	async getNetworkDiagnosticsInfo(): Promise<IAgentHostNetworkDiagnosticsInfo> {
		const { endpoints, account } = await this._providerService.getNetworkDiagnostics();
		return this._networkDiagnostics.getInfo(endpoints, account);
	}

	async getManagedSettingsDiagnostics(): Promise<readonly IAgentHostManagedSettingsDiagnostics[]> {
		return this._providerService.getManagedSettingsDiagnostics();
	}

	async diagnosticsFetch(url: string): Promise<IAgentHostNetworkFetchResult> {
		return this._networkDiagnostics.fetch(url);
	}

	async getSessionStateFile(session: URI, chat?: URI): Promise<URI | undefined> {
		return this._providerService.getProviderForSession(session)?.getSessionStateFile?.(session, chat);
	}

	getSessionPlanFile(session: URI, chat: URI): URI | undefined {
		return this._providerService.getProviderForSession(session)?.getSessionPlanFile?.(session, chat);
	}

	async collectDebugLogs(session: URI | undefined, kind: AgentHostDebugLogsArtifactKind, chat?: URI, progressToken?: string): Promise<IAgentHostDebugLogsArtifact> {
		if (!this._debugLogsCollector) {
			throw new Error('Agent Host debug log collection is unavailable');
		}
		const providers = session
			? [this._providerService.getProviderForSession(session)].filter((provider): provider is IAgent => provider !== undefined)
			: this._providerService.getProviders();
		if (providers.length === 0) {
			throw new Error(session
				? `No Agent Host provider is available for session ${session.toString()}`
				: 'No Agent Host providers are available for debug-log collection');
		}
		let lastProgress = 0;
		try {
			return await this._debugLogsCollector.collect(providers, session, kind, chat, progressToken, progressToken ? (progress, total, message) => {
				lastProgress = progress;
				this._stateManager.emitProgress(withAgentHostDebugLogsProgress({ progressToken, progress, total: total > 0 ? total : undefined, message }));
			} : undefined);
		} finally {
			if (progressToken) {
				this._stateManager.emitProgress(withAgentHostDebugLogsProgress({ progressToken, progress: lastProgress, total: lastProgress }));
			}
		}
	}

	async cancelDebugLogs(progressToken: string): Promise<void> {
		this._debugLogsCollector?.cancel(progressToken);
	}

	async readDebugLogsChunk(resource: URI, position: number): Promise<IAgentHostDebugLogsChunk> {
		if (!this._debugLogsCollector) {
			throw new Error('Agent Host debug log collection is unavailable');
		}
		return this._debugLogsCollector.readArtifactChunk(resource, position);
	}

	// ---- helpers ------------------------------------------------------------

	/**
	 * Restores a subagent session from its parent session's event history.
	 * Loads the parent's raw messages, filters for events belonging to
	 * the subagent (by `parentToolCallId`), and builds the child session's
	 * turns from those events.
	 */
	private async _restoreSubagentChat(chatUri: string, parentSession: URI, toolCallId: string, credentials?: IAgentHostCredentialSource): Promise<void> {
		if (this._stateManager.getChatState(chatUri)) {
			return;
		}
		const inFlight = this._restoreSubagentInFlight.get(chatUri);
		if (inFlight) {
			return inFlight;
		}
		const restore = this._doRestoreSubagentChat(chatUri, parentSession, toolCallId, credentials);
		this._restoreSubagentInFlight.set(chatUri, restore);
		this._chatOwnership.trackRestore(restore);
		try {
			await restore;
		} finally {
			if (this._restoreSubagentInFlight.get(chatUri) === restore) {
				this._restoreSubagentInFlight.delete(chatUri);
			}
		}
	}

	private async _doRestoreSubagentChat(chatUri: string, parentSession: URI, toolCallId: string, credentials?: IAgentHostCredentialSource): Promise<void> {
		const parentSessionKey = parentSession.toString();
		try {
			await this._restoreSessionInFlight.get(parentSessionKey);
			if (!this._isSessionRestored(parentSessionKey)) {
				await this.restoreSession(parentSession, undefined, credentials);
			}
		} catch {
			this._logService.warn(`[AgentService] Cannot restore parent session for subagent chat: ${parentSessionKey}`);
			return;
		}
		const parentState = this._stateManager.getSessionState(parentSessionKey);
		const agent = this._providerService.getProviderForSession(parentSession);
		if (!parentState || !agent) {
			return;
		}
		// A subagent can be spawned from any chat in the session, including peer
		// chats and nested subagents, so restore must find the chat that ran the
		// spawning tool call instead of assuming the default chat.
		const spawnPoint = this._findSubagentSpawnPoint(parentSessionKey, chatUri, toolCallId);
		const origin = {
			kind: ChatOriginKind.Tool,
			chat: spawnPoint?.chat ?? parentState.defaultChat ?? this._requireDefaultChat(parentSession),
			toolCallId,
		} as const;
		// A subagent without a recorded storage resource (a legacy one) follows the creation-time rule.
		const storageResource = this._chatOwnership.getChatStorageResource(chatUri)
			?? (await this._readRecordedChatStorage(parentSessionKey)).get(chatUri)
			?? creationTimeChatStorageResource(parentSessionKey, chatUri, this._defaultChat(parentSessionKey));
		const childTurns = await this._getChatMessages(agent, URI.parse(chatUri), parentSession, false, URI.parse(storageResource), origin, undefined, credentials);
		if (childTurns.length === 0) {
			return;
		}
		const mergedTurns = await this._interleaveLocalTurns(parentSessionKey, chatUri, childTurns);
		this._stateManager.addChat(parentSessionKey, chatUri, storageResource, {
			title: spawnPoint?.title ?? 'Subagent',
			turns: mergedTurns,
			origin,
			interactivity: ChatInteractivity.ReadOnly,
		});
	}

	/**
	 * Finds the chat whose tool call spawned a subagent and reads the title that
	 * tool call reported. It scans every hydrated chat in the parent session so
	 * peer-chat and nested-subagent spawns resolve to their real parent; chats
	 * without hydrated state are skipped on restore instead of being materialized
	 * just to place one spawn edge.
	 */
	private _findSubagentSpawnPoint(parentSessionKey: string, subagentChatUri: string, toolCallId: string): { readonly chat: string; readonly title?: string } | undefined {
		const parentState = this._stateManager.getSessionState(parentSessionKey);
		if (!parentState) {
			return undefined;
		}
		const defaultChat = parentState.defaultChat ?? this._requireDefaultChat(parentSessionKey);
		const candidates: { chat: string; turns: readonly Turn[]; activeTurn: Turn | undefined }[] = [
			{ chat: defaultChat, turns: parentState.turns, activeTurn: parentState.activeTurn as Turn | undefined },
		];
		for (const chat of parentState.chats) {
			if (chat.resource === defaultChat || chat.resource === subagentChatUri) {
				continue;
			}
			const chatState = this._stateManager.getChatState(chat.resource);
			if (chatState) {
				candidates.push({ chat: chat.resource, turns: chatState.turns, activeTurn: chatState.activeTurn as Turn | undefined });
			}
		}
		for (const candidate of candidates) {
			for (const turn of [...candidate.turns, ...(candidate.activeTurn ? [candidate.activeTurn] : [])]) {
				for (const part of turn.responseParts) {
					if (part.kind !== ResponsePartKind.ToolCall || part.toolCall.toolCallId !== toolCallId) {
						continue;
					}
					const content = part.toolCall.status === ToolCallStatus.Completed || part.toolCall.status === ToolCallStatus.Running
						? part.toolCall.content
						: undefined;
					const subagent = content?.find((item): item is ToolResultSubagentContent => item.type === ToolResultContentType.Subagent);
					return { chat: candidate.chat, ...(subagent?.title ? { title: subagent.title } : {}) };
				}
			}
		}
		return undefined;
	}

	private async _restoreSubagentSession(subagentUri: string, parentSession: URI, credentials?: IAgentHostCredentialSource): Promise<void> {
		if (this._stateManager.getSessionState(subagentUri)) {
			return;
		}

		const inFlight = this._restoreSubagentInFlight.get(subagentUri);
		if (inFlight) {
			return inFlight;
		}

		const restore = this._doRestoreSubagentSession(subagentUri, parentSession, credentials);
		this._restoreSubagentInFlight.set(subagentUri, restore);
		this._chatOwnership.trackRestore(restore);
		try {
			await restore;
		} finally {
			if (this._restoreSubagentInFlight.get(subagentUri) === restore) {
				this._restoreSubagentInFlight.delete(subagentUri);
			}
		}
	}

	private async _doRestoreSubagentSession(subagentUri: string, parentSession: URI, credentials?: IAgentHostCredentialSource): Promise<void> {
		// Ensure the parent session is loaded first
		const parentSessionKey = parentSession.toString();
		if (!this._isSessionRestored(parentSessionKey)) {
			try {
				await this.restoreSession(parentSession, undefined, credentials);
			} catch {
				this._logService.warn(`[AgentService] Cannot restore parent session for subagent: ${parentSessionKey}`);
				return;
			}
		}

		const parentState = this._stateManager.getSessionState(parentSessionKey);
		if (!parentState) {
			return;
		}

		// Search completed turns and active turn for the subagent content metadata
		const allTurns = [...parentState.turns];
		if (parentState.activeTurn) {
			allTurns.push(parentState.activeTurn as Turn);
		}

		let subagentContent: ToolResultSubagentContent | undefined;
		for (const turn of allTurns) {
			for (const part of turn.responseParts) {
				if (part.kind === ResponsePartKind.ToolCall) {
					const tc = part.toolCall;
					// Check both completed and running tool calls — running
					// tool calls receive subagent content via ContentChanged
					const content = tc.status === ToolCallStatus.Completed
						? tc.content
						: (tc.status === ToolCallStatus.Running ? tc.content : undefined);
					if (content) {
						for (const c of content) {
							if (c.type === ToolResultContentType.Subagent && c.resource === subagentUri) {
								subagentContent = c;
								break;
							}
						}
					}
				}
			}
			if (subagentContent) {
				break;
			}
		}

		// Load the subagent's turns from the agent (which knows how to
		// extract them from the parent session's event log).
		let childTurns: readonly Turn[] = [];
		const agent = this._providerService.getProviderForSession(parentSession);
		if (agent) {
			try {
				const parsedSubagent = parseSubagentSessionUri(URI.parse(subagentUri));
				const origin = parentState.chats.find(chat => chat.resource === subagentUri)?.origin
					?? (parsedSubagent ? {
						kind: ChatOriginKind.Tool,
						chat: parentState.defaultChat ?? this._requireDefaultChat(parentSession),
						toolCallId: parsedSubagent.toolCallId,
					} : undefined);
				// A registered subagent reads from its recorded storage. An unregistered
				// legacy subagent session records none, so it follows the creation-time
				// rule and has no workspace transitions to load.
				const recordedStorage = this._chatOwnership.getChatStorageResource(subagentUri);
				const storage = recordedStorage ?? creationTimeChatStorageResource(parentSession.toString(), subagentUri, this._defaultChat(parentSession));
				childTurns = await this._getChatMessages(agent, URI.parse(subagentUri), parentSession, false, URI.parse(storage), origin, recordedStorage === undefined ? Promise.resolve(undefined) : undefined, credentials);
			} catch (err) {
				this._logService.warn(`[AgentService] Failed to load subagent turns for ${subagentUri}`, err);
			}
		}

		// Use metadata from subagent content if available, otherwise synthesize
		const title = subagentContent?.title ?? 'Subagent';

		const subagentNow = new Date().toISOString();
		// Local turns for a subagent chat are persisted in the parent session's
		// database (its chat URI resolves to the parent session), keyed by the
		// subagent chat URI.
		const mergedChildTurns = await this._interleaveLocalTurns(parentSession.toString(), subagentUri, childTurns);
		this._stateManager.restoreSession(
			{
				resource: subagentUri,
				provider: 'subagent',
				title,
				status: SessionStatus.Idle,
				createdAt: subagentNow,
				modifiedAt: subagentNow,
				...(parentState?.project ? { project: parentState.project } : {}),
				// A legacy subagent session records no default chat.
				defaultChat: this._defaultChat(subagentUri) ?? deriveLegacyDefaultChat(subagentUri),
			},
			mergedChildTurns,
			// A legacy subagent session records no storage.
			creationTimeChatStorageResource,
		);
		await this._restoreAnnotations(URI.parse(subagentUri));
		this._logService.info(`[AgentService] Restored subagent session: ${subagentUri} with ${childTurns.length} turn(s)`);
	}

	private _queueRestoredSubagentAdmissionRetry(agent: IAgent, parentSession: URI, turns: readonly Turn[], recordedStorage: ReadonlyMap<string, string>): void {
		const sessionKey = parentSession.toString();
		const existing = this._restoredSubagentAdmissionRetries.get(sessionKey);
		if (existing?.isCurrent()) {
			void existing.run();
			return;
		}
		existing?.cancel();
		if (!this._stateManager.getSessionState(sessionKey)) {
			this._logService.warn(`[AgentService] Cannot queue restored private chat admission without owner state for ${sessionKey}`);
			return;
		}
		let current: Promise<void> | undefined;
		let cancelled = false;
		const admission = {
			run: (): Promise<void> => {
				if (!admission.isCurrent()) {
					return Promise.resolve();
				}
				if (current) {
					return current;
				}
				const retry = this._catalogReconciliationService.runPass()
					.then(async () => {
						if (admission.isCurrent()) {
							await this._registerRestoredSubagentSummaries(agent, parentSession, turns, recordedStorage, admission.isCurrent);
						}
					});
				current = retry;
				void retry.then(() => {
					if (this._restoredSubagentAdmissionRetries.get(sessionKey) === admission) {
						this._restoredSubagentAdmissionRetries.delete(sessionKey);
					}
				}, error => {
					if (current === retry) {
						current = undefined;
					}
					this._logService.warn(`[AgentService] Restored private chat admission retry failed for ${sessionKey}`, error);
				});
				return retry;
			},
			cancel: (): void => {
				cancelled = true;
			},
			isCurrent: (): boolean => !cancelled
				&& this._restoredSubagentAdmissionRetries.get(sessionKey) === admission
				&& this._stateManager.getSessionState(sessionKey) !== undefined,
		};
		this._restoredSubagentAdmissionRetries.set(sessionKey, admission);
		void admission.run();
	}

	/**
	 * `recordedStorage` is the storage the restore's catalog snapshot records.
	 * Admission only adds private rows without storage, so it stays current.
	 */
	private async _registerRestoredSubagentSummaries(agent: IAgent, parentSession: URI, turns: readonly Turn[], recordedStorage: ReadonlyMap<string, string>, isCurrent: () => boolean = () => true): Promise<void> {
		const parentSessionStr = parentSession.toString();
		const parentChat = this._defaultChat(parentSession);
		if (parentChat === undefined) {
			return;
		}
		const discovered = new Map<string, { title: string; toolCallId: string }>();
		for (const turn of turns) {
			for (const part of turn.responseParts) {
				if (part.kind !== ResponsePartKind.ToolCall) {
					continue;
				}
				const content = part.toolCall.status === ToolCallStatus.Completed || part.toolCall.status === ToolCallStatus.Running
					? part.toolCall.content
					: undefined;
				const subagent = content?.find((item): item is ToolResultSubagentContent => item.type === ToolResultContentType.Subagent);
				if (subagent) {
					discovered.set(part.toolCall.toolCallId, {
						title: subagentChatTitle(readToolCallMeta(part.toolCall).subagentDescription, subagent.title),
						toolCallId: part.toolCall.toolCallId,
					});
				}
			}
		}
		if (!isCurrent()) {
			return;
		}
		const restored = [...discovered.values()].map(child => {
			const chatUri = subagentChatUri(chatUriFormatOf(parentChat), parentSessionStr, parentChat, child.toolCallId);
			const origin = { kind: ChatOriginKind.Tool, chat: parentChat, toolCallId: child.toolCallId } as const;
			const existing = this._stateManager.getSessionState(parentSessionStr)?.chats.find(chat => chat.resource === chatUri);
			return { ...child, chatUri, origin, existing };
		});
		const normalized = await this._peerChatStore.readNormalizedChat(parentSession, URI.parse(parentChat));
		// A subagent without a recorded private row follows the creation-time rule.
		const storageOf = (chat: string) => recordedStorage.get(chat) ?? creationTimeChatStorageResource(parentSessionStr, chat, parentChat);
		for (const child of restored) {
			if (!isCurrent()) {
				return;
			}
			// The chat's storage spelling (a no-op unless compatibility-backed).
			this._orchestratorDatabase.recordChatStorageIdentity(parentSessionStr, child.chatUri, { kind: 'subagent', toolCallId: child.toolCallId });
			await this._peerChatStore.persistPrivateChat(parentSession, {
				chat: child.chatUri,
				parentChat,
				origin: JSON.stringify(child.origin),
				metadata: { interactivity: ChatInteractivity.Hidden },
			}, true, isCurrent);
			const { title } = await this._chatContributions.hydrateChat({
				session: parentSessionStr,
				chat: child.chatUri,
				isDefaultChat: false,
				storageResource: storageOf(child.chatUri),
			}, {});
			if (!isCurrent()) {
				return;
			}
			child.title = title ?? child.title;
		}
		if (!normalized.normalized && restored.length > 0) {
			let result: Awaited<ReturnType<typeof migrateChatCatalogV2>> | undefined;
			try {
				result = await this._migrateChatCatalog(parentSession, CancellationToken.None, undefined, async () => {
					if (!isCurrent()) {
						return;
					}
					const state = this._stateManager.getSessionState(parentSessionStr);
					if (!state) {
						throw new Error(`Missing restored owner state for ${parentSessionStr}`);
					}
					const source = await this._orchestratorDatabase.getSessionV2(parentSessionStr);
					if (!isCurrent()) {
						return;
					}
					const decoded = source && decodeAgentHostCatalogPayload(source.payload);
					if (!decoded || !decoded.ok) {
						throw new Error(`Missing restored catalog source for ${parentSessionStr}`);
					}
					const metadataFallbacks: Record<string, string> = {};
					const chats = new Map<string, ICatalogChat>();
					for (const chat of decoded.value.data.chats) {
						if (chat.summary !== undefined) {
							metadataFallbacks[customChatTitleMetadataKey(chat.uri)] = chat.summary;
						}
						if (chat.titleSource !== undefined) {
							metadataFallbacks[customChatTitleSourceMetadataKey(chat.uri)] = chat.titleSource;
						}
						chats.set(chat.uri, {
							uri: chat.uri,
							kind: chat.kind,
							title: chat.summary,
							origin: fromCatalogChatOrigin(chat.origin),
							interactivity: chat.interactivity,
							archived: chat.archived,
							isRead: chat.isRead,
							inheritedTurnId: chat.inheritedTurnId,
							workingDirectories: chat.workingDirectories,
							changes: chat.changes,
						});
					}
					for (const chat of this._catalogChatsFromState(state, parentChat)) {
						chats.set(chat.uri, chat);
					}
					for (const child of restored) {
						const existing = chats.get(child.chatUri);
						chats.set(child.chatUri, {
							...existing,
							uri: child.chatUri,
							kind: 'peer',
							title: existing?.title || child.title,
							origin: child.origin,
							interactivity: ChatInteractivity.Hidden,
						});
					}
					if (!isCurrent()) {
						return;
					}
					return {
						chats: [...chats.values()],
						metadataFallbacks,
					};
				}, isCurrent);
			} catch (error) {
				if (!isCurrent()) {
					return;
				}
				throw error;
			}
			if (!isCurrent()) {
				return;
			}
			if (!result || (result.status !== 'applied' && result.status !== 'replayed' && result.status !== 'alreadyNormalized')) {
				throw new Error(`Failed to activate restored private chats for ${parentSessionStr}: ${result?.status ?? 'unavailable'}`);
			}
			for (const child of restored) {
				if (!isCurrent()) {
					return;
				}
				await this._peerChatStore.persistPrivateChat(parentSession, {
					chat: child.chatUri,
					parentChat,
					origin: JSON.stringify(child.origin),
					metadata: { interactivity: ChatInteractivity.Hidden },
				}, true, isCurrent);
			}
		}
		for (const child of restored) {
			if (!isCurrent()) {
				return;
			}
			this._stateManager.registerRestoredChatSummary(parentSessionStr, child.chatUri, {
				storageResource: storageOf(child.chatUri),
				title: child.title,
				origin: child.origin,
				interactivity: ChatInteractivity.ReadOnly,
				resolver: async (_providerData, storageResource, credentials) => ({
					turns: [...await this._resolveRestoredSubagentTurns(agent, parentSession, child.chatUri, child.origin, storageResource, credentials)],
				}),
			});
			if (child.existing && (!child.existing.title || child.existing.title === subagentChatTitle(undefined, undefined))) {
				this._stateManager.updateChatTitle(parentSessionStr, child.chatUri, child.title);
			}
		}
	}

	private async _resolveRestoredSubagentTurns(agent: IAgent, parentSession: URI, chatUri: string, origin: { readonly kind: ChatOriginKind.Tool; readonly chat: string; readonly toolCallId: string }, storageResource: string, credentials?: IAgentHostCredentialSource): Promise<readonly Turn[]> {
		const childTurns = await this._getChatMessages(agent, URI.parse(chatUri), parentSession, false, URI.parse(storageResource), origin, undefined, credentials);
		if (childTurns.length === 0) {
			throw new SubagentTranscriptUnavailableError(chatUri);
		}
		return this._interleaveLocalTurns(parentSession.toString(), chatUri, childTurns);
	}

	override dispose(): void {
		// Unblocks pending deferred work so its chain drains; the disposal guard
		// in `_runWhenStartupSettled` keeps the work itself from running.
		this._startupSettled.open();
		super.dispose();
	}
}

/**
 * Runtime owner of an active resource watch — pairs the {@link IFileService}
 * watcher disposables with the subscriber refcount and the optional
 * grace-window timer used to delay disposal after the last unsubscribe.
 */
interface IActiveResourceWatch extends IDisposable {
	readonly channel: string;
	readonly descriptor: ResourceWatchState;
	subscribers: number;
	readonly disposables: DisposableStore;
	pendingGc: MutableDisposable<IDisposable>;
}

/**
 * Flatten a {@link FileChangesEvent} into a synthetic {@link IFileChange}
 * list. The event stores only URI arrays publicly (the underlying
 * `IFileChange[]` is private), so we reconstruct one entry per URI per
 * change type. The synthetic shape is sufficient for translation into
 * `ResourceWatchChangedAction` items.
 */
function collectChanges(event: FileChangesEvent): IFileChange[] {
	const out: IFileChange[] = [];
	for (const resource of event.rawAdded) {
		out.push({ resource, type: FileChangeType.ADDED });
	}
	for (const resource of event.rawUpdated) {
		out.push({ resource, type: FileChangeType.UPDATED });
	}
	for (const resource of event.rawDeleted) {
		out.push({ resource, type: FileChangeType.DELETED });
	}
	return out;
}

/**
 * Variant of {@link collectChanges} that restricts the output to changes
 * inside `root` (inclusive). Used for the recursive watch fallback,
 * which feeds off the uncorrelated global stream and must filter out
 * unrelated events.
 */
function collectChangesUnderRoot(event: FileChangesEvent, root: URI): IFileChange[] {
	const out: IFileChange[] = [];
	const accept = (resource: URI, type: FileChangeType) => {
		if (isEqualOrParent(resource, root)) {
			out.push({ resource, type });
		}
	};
	for (const resource of event.rawAdded) { accept(resource, FileChangeType.ADDED); }
	for (const resource of event.rawUpdated) { accept(resource, FileChangeType.UPDATED); }
	for (const resource of event.rawDeleted) { accept(resource, FileChangeType.DELETED); }
	return out;
}
