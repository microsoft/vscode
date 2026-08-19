/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { open, unlink, type FileHandle } from 'fs/promises';
import { decodeBase64, encodeBase64, VSBuffer } from '../../../base/common/buffer.js';
import { DeferredPromise, disposableTimeout, Limiter, Promises, ResourceQueue } from '../../../base/common/async.js';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { Emitter, type Event } from '../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableResourceMap, DisposableStore, IDisposable, MutableDisposable } from '../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../base/common/map.js';
import { getExtensionForMimeType, getMediaMime, getMediaOrTextMime } from '../../../base/common/mime.js';
import { Schemas } from '../../../base/common/network.js';
import { IObservable, observableValue } from '../../../base/common/observable.js';
import { dirname as resourcesDirname, extname as resourcesExtname, extUriBiasedIgnorePathCase, isEqual, isEqualOrParent, joinPath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { hasKey } from '../../../base/common/types.js';
import { localize } from '../../../nls.js';
import { FileChangeType, FileOperationResult, IFileChange, IFileService, toFileOperationResult, type FileChangesEvent } from '../../files/common/files.js';
import { InstantiationService } from '../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../instantiation/common/serviceCollection.js';
import { ILogService } from '../../log/common/log.js';
import { AgentProvider, AgentSession, AgentSignal, IAgent, IAgentChatContext, IAgentChatDataChange, IAgentChatMetadata, IAgentCreateChatOptions, IAgentCreateChatResult, IAgentCreateChatSideChatSelection, IAgentCreateChatSideChatSource, IAgentCreateSessionConfig, IAgentCreateSessionResult, IAgentDiscoveredChat, IAgentHostAuthTokenRequest, IAgentHostNetworkEndpoint, IAgentMaterializeChatEvent, IAgentModelInfo, IAgentResolveSessionConfigParams, IAgentChatAdoptionResult, IAgentSessionConfigCompletionsParams, IAgentSessionMetadata, IAgentSpawnChatEvent, AuthenticateParams, AuthenticateResult, IMcpNotification, SubagentChatSignal, subagentChatTitle } from '../common/agent.js';
import { AgentHostSessionReleaseGraceMsEnvVar, type AgentHostDebugLogsArtifactKind, type IAgentHostDebugLogsArtifact, type IAgentHostDebugLogsChunk, IAgentHostManagedSettingsDiagnostics, IAgentHostNetworkDiagnosticsInfo, IAgentHostNetworkFetchResult, IAgentService } from '../common/agentService.js';
import { ISessionDataService, SESSION_ATTACHMENTS_DIRNAME } from '../common/sessionDataService.js';
import { IAgentEditAttributionService, ICancelEditAttributionFlushParams, ICommitEditAttributionFlushParams, IEditAttributionFlushResult, IPrepareEditAttributionFlushParams, IPreparedEditAttributionFlush, parseEditAttributionResource } from '../common/fileEditAttribution.js';
import { SessionConfigKey } from '../common/sessionConfigKeys.js';
import type { IAgentCustomizationSettingsRegistration } from '../common/agentCustomizationSettings.js';
import { buildAnnotationsUri, parseAnnotationsUri } from '../common/annotationsUri.js';
import { parseChangesetUri } from '../common/changesetUri.js';
import { ActionType, ActionEnvelope, AuthRequiredReason, INotification, isAnnotationsAction, isSessionAction, type ChatAction, type IRootConfigChangedAction, type SessionAction, type SessionWorkingDirectoryAction, type TerminalAction, type ClientAnnotationsAction, type ClientChangesetAction } from '../common/state/sessionActions.js';
import { resolveSessionWorkingDirectoryAction } from '../common/state/sessionWorkingDirectories.js';
import type { CompletionsParams, CompletionsResult, CreateTerminalParams, ResolveSessionConfigResult, SessionConfigCompletionsResult, SessionConfigPropertySchema } from '../common/state/protocol/commands.js';
import type { InvokeChangesetOperationParams, InvokeChangesetOperationResult } from '../common/state/protocol/channels-changeset/commands.js';
import { AhpErrorCodes, AHP_SESSION_NOT_FOUND, ContentEncoding, JSON_RPC_INTERNAL_ERROR, ProtocolError, ResourceChangeType, ResourceType, ResourceWriteMode, type CreateResourceWatchParams, type CreateResourceWatchResult, type DirectoryEntry, type ResourceCopyParams, type ResourceCopyResult, type ResourceDeleteParams, type ResourceDeleteResult, type ResourceListResult, type ResourceMkdirParams, type ResourceMkdirResult, type ResourceMoveParams, type ResourceMoveResult, type ResourceReadResult, type ResourceResolveParams, type ResourceResolveResult, type ResourceWatchState, type ResourceWriteParams, type ResourceWriteResult, type IStateSnapshot } from '../common/state/sessionProtocol.js';
import { ChangesSummary, ChatInteractivity, ChatOriginKind, MessageAttachmentKind, type Annotation, type AnnotationEntry, type AnnotationsState, type ChatOrigin, type Customization, type Message, type MessageAttachment, type MessageResourceAttachment } from '../common/state/protocol/state.js';
import type { ChatPendingMessageSetAction, ChatTurnStartedAction, SessionConfigChangedAction } from '../common/state/protocol/actions.js';
import { ISessionGitHubState, ISessionGitState, MessageKind, ResponsePartKind, SESSION_META_GITHUB_KEY, SESSION_META_GIT_KEY, SESSION_META_MULTI_ROOT_KEY, SESSION_META_SOURCE_CONTROL_KEY, AH_META_ORCHESTRATION_DB_KEY, readSessionSpawnDepth, parseSessionOrchestration, withSessionSpawnDepth, withSessionOrchestration, SessionLifecycle, SessionStatus, ToolCallStatus, ToolResultContentType, AH_META_WORKSPACELESS_DB_KEY, AH_META_IS_ARCHIVED_DB_KEY, AH_META_IS_DONE_DB_KEY, AH_META_IS_READ_DB_KEY, buildChatUri, buildDefaultChatUri, buildResourceWatchChannelUri, buildSubagentChatUri, buildSubagentSessionUriPrefix, hostBuildInfoFromProduct, isAhpChatChannel, isDefaultChatUri, isSubagentChatUri, isSubagentSession, parseChatUri, parseDefaultChatUri, parseRequiredSessionUriFromChatUri, parseResourceWatchChannelUri, parseSessionMultiRootMetadata, parseSubagentSessionUri, readSessionExternal, readSessionGitHubState, readSessionGitState, readSessionMultiRootMetadata, readSessionSourceControlState, readSessionWorkspaceless, withSessionExternal, withSessionGitHubState, withSessionGitState, withSessionMultiRootMetadata, withSessionSourceControlState, withSessionStatusFlag, withSessionWorkspaceless, withSessionFolderPickerDecision, readSessionFolderPickerDecision, parseSessionFolderPickerDecision, SESSION_META_FOLDER_PICKER_KEY, readSessionEhcliAdoptable, type ISessionSourceControlState, type SessionConfigState, type SessionSummary, type ToolResultSubagentContent, type Turn, type UsageInfo, chatStorageUri, hasReportedUsage } from '../common/state/sessionState.js';
import { readToolCallMeta } from '../common/meta/agentToolCallMeta.js';
import { IProductService } from '../../product/common/productService.js';
import { buildBoundedSideChatSourceContext, getSideChatPartialResponse } from './agentPeerChats.js';
import { AgentConfigurationService, getEffectiveWorkingDirectories, IAgentConfigurationService } from './agentConfigurationService.js';
import { AgentHostManagedSettingsService, type IAgentHostManagedSettingsService } from './agentHostManagedSettingsService.js';
import { AgentHostTerminalManager, IAgentHostTerminalManager } from './agentHostTerminalManager.js';
import { ISessionDbUriFields, parseSessionDbUri } from '../common/sessionDbUri.js';
import { IGitBlobUriFields, parseGitBlobUri } from './gitDiffContent.js';
import { resolveSessionRepositories } from './agentHostSessionRepositories.js';
import { findDeepestContainingWorkingDirectory, isMultiRootSession } from '../common/agentHostWorkingDirectories.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';
import { createAgentChatContext } from './agentChatContext.js';
import { AgentHostPromptCache, IAgentHostPromptCache } from './agentHostPromptCache.js';
import { AgentHostSessionTitleSignal, IAgentHostSessionTitleSignal } from './agentHostSessionTitleSignal.js';
import { AgentHostDebugLogsCollector, type IAgentHostDebugLogsEnvironment } from './agentHostDebugLogs.js';
import { AgentHostDatabase, IAgentHostDatabase } from './agentHostDatabase.js';
import { AgentSessionRegistry, IRegisteredSession, IStoredRegisteredSession } from './agentSessionRegistry.js';
import { IAgentHostGitService } from '../common/agentHostGitService.js';
import { AgentSideEffects } from './agentSideEffects.js';
import { AgentHostLocalTurns } from './agentHostLocalTurns.js';
import { AgentServerToolHost } from './shared/agentServerToolHost.js';
import { buildServerToolGroups } from './shared/serverToolGroups.js';
import { type IChatContextSnapshot, type IRenameTitleResult, type ISessionCreationDefaults, type ISessionServerToolAccessor, validateRenameTitle } from './shared/sessionServerTools.js';
import { AGENT_HOST_TITLE_SOURCE_AGENT, customChatTitleMetadataKey, customChatTitleSourceMetadataKey, persistSessionMetadataValues, SESSION_CUSTOM_TITLE_KEY, SESSION_CUSTOM_TITLE_SOURCE_KEY } from './shared/persistSessionMetadata.js';

import { buildWorktreeFailureNotification, WorktreeIsolation, WORKTREE_META_REPOSITORY_ROOT, worktreeProjectFromRepositoryRoot } from './shared/worktreeIsolation.js';
import { AgentHostChangesetService } from './agentHostChangesetService.js';
import { AgentHostFileMonitorService, IAgentHostFileMonitorService } from './agentHostFileMonitorService.js';
import { IAgentHostCheckpointService } from '../common/agentHostCheckpointService.js';
import { IAgentHostReviewService } from '../common/agentHostReviewService.js';
import { AgentHostChangesetCoordinator } from './agentHostChangesetCoordinator.js';
import { AgentHostCompletions, IAgentHostCompletions } from './agentHostCompletions.js';
import { AgentHostChatCompletionProvider } from './agentHostChatCompletionProvider.js';
import { AgentHostFileCompletionProvider } from './agentHostFileCompletionProvider.js';
import { AgentHostRenameCompletionProvider } from './agentHostRenameCommand.js';
import { AgentHostSkillCompletionProvider } from './agentHostSkillCompletionProvider.js';
import { AgentHostWorkspaceFiles } from './agentHostWorkspaceFiles.js';
import { SessionServerToolName } from '../common/serverToolNames.js';
import { CodexCompactCompletionProvider } from './codexCompactCommand.js';
import { CopilotApiService, ICopilotApiService } from './shared/copilotApiService.js';
import { INetworkDiagnosticsService } from './networkDiagnosticsService.js';
import { parseMcpChannelUri } from './shared/mcpCustomizationController.js';
import { toAgentClientUri } from '../common/agentClientUri.js';
import { AgentHostClientType } from '../common/agentHostClientInfo.js';
import { AgentHostLaunchKind, createUnknownAgentHostClientTelemetryContext, type IAgentHostClientTelemetryContext } from '../common/agentHostTelemetry.js';
import { AgentHostChangesetOperationService } from './agentHostChangesetOperationService.js';
import { AgentHostGitStateService } from './agentHostGitStateService.js';
import { AgentHostGitHubEndpointService, IAgentHostGitHubEndpointService } from './agentHostGitHubEndpointService.js';
import { AgentMergeController } from './agentMergeController.js';
import { AgentMergeConfigKey, agentMergeRootConfigSchema } from '../common/agentMerge.js';
import { AgentMergeTools } from './agentMergeTools.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../telemetry/common/telemetryUtils.js';
import { AgentHostAuthenticationService } from './agentHostAuthenticationService.js';
import { updateAgentHostTelemetryLevelFromConfig } from './agentHostTelemetryService.js';
import { AgentHostActiveAgentTitleGenerationConfigKey, AgentHostEditTelemetryEnabledConfigKey, AgentHostExternalSessionsMode, AgentHostMigrateLegacyCopilotCliEnabledConfigKey, AgentHostShowExternalSessionsConfigKey, platformRootSchema } from '../common/agentHostSchema.js';
import { AgentHostCustomizationEnablementService, IAgentHostCustomizationEnablementService } from './agentHostCustomizationEnablementService.js';
import { AgentHostStorageService, IAgentHostStorageService } from './agentHostStorageService.js';
import { SessionCoordinationService } from './sessionCoordination.js';
import { AgentHostOctoKitService, IAgentHostOctoKitService } from './shared/agentHostOctoKitService.js';
import { GitHubService, IGitHubService } from '../../github/common/githubService.js';
import { IAgentHostChangesetService, CHANGESET_DB_METADATA_KEYS, META_CHANGES_SUMMARY } from '../common/agentHostChangesetService.js';
import { IAgentHostChangesetSubscriptionService } from '../common/agentHostChangesetSubscriptionService.js';
import { AgentHostChangesetSubscriptionService } from './agentHostChangesetSubscriptionService.js';
import { GIT_DB_METADATA_KEYS, IAgentHostGitStateService, META_GIT_STATE, META_GITHUB_STATE, META_SOURCE_CONTROL_STATE } from '../common/agentHostGitStateService.js';
import { IAgentHostChangesetOperationService } from '../common/agentHostChangesetOperationService.js';
import { AgentHostCommitOperationContribution } from './agentHostCommitOperationProvider.js';
import { AgentHostDiscardChangesOperationContribution } from './agentHostDiscardChangesOperationProvider.js';
import { AgentHostMergeOperationContribution } from './agentHostMergeOperationProvider.js';
import { AgentHostPullRequestOperationContribution } from './agentHostPullRequestOperationProvider.js';
import { AgentHostSyncOperationContribution } from './agentHostSyncOperationProvider.js';
import { AgentHostReviewService } from './agentHostReviewService.js';
import { AgentHostCheckpointService } from './agentHostCheckpointService.js';

/**
 * Grace period before an empty, unsubscribed session is garbage-collected
 * via {@link AgentService._runSessionGc}. Gives a disconnected client time
 * to reconnect (or a workspace switch to settle) before we tear down the
 * provider-side session, worktree, and on-disk state.
 */
const SESSION_GC_GRACE_MS = 30_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_EXTERNAL_SESSION_LIMIT = 2;
/** A catalog pass slower than this is logged at info, since it delays every session-list refresh. */
const SLOW_LIST_SESSIONS_THRESHOLD_MS = 1_000;

type AgentHostLegacyMigrationEvent = {
	provider: string;
	outcome: 'migrated' | 'skipped' | 'failed';
	success: boolean;
	turnCount: number;
	durationMs: number;
	hasProject: boolean;
	hasWorktree: boolean;
	workingDirectoryCount: number;
	errorMessage: string | undefined;
};

type AgentHostLegacyMigrationClassification = {
	provider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The agent provider id whose legacy session was migrated (e.g. copilotcli).' };
	outcome: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Migration outcome: migrated (adoption + restore completed), skipped (eligible legacy session not adopted this pass, e.g. migrate flag not yet applied), or failed (adoption or restore threw).' };
	success: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the migration completed with at least one restored turn.' };
	turnCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of turns restored from the migrated session.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time in milliseconds to adopt and restore the legacy session.' };
	hasProject: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the migrated session resolved to a project/repository.' };
	hasWorktree: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the migrated session ran in a pre-existing git worktree that was bridged during adoption.' };
	workingDirectoryCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of working directories associated with the migrated session.' };
	errorMessage: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'Error message when the migration failed; absent for migrated/skipped outcomes.' };
	owner: 'vijayupadya';
	comment: 'Tracks one-time adopt-on-open migration of legacy extension-host Copilot CLI sessions into the agent host to measure attempt, success, failure, and skipped rates.';
};

const HOST_OWNED_SESSION_CONFIG_KEYS = [
	SessionConfigKey.AgentMerge,
	SessionConfigKey.AgentMergeController,
	SessionConfigKey.Isolation,
	SessionConfigKey.Branch,
	SessionConfigKey.WorktreeBranchPrefix,
	SessionConfigKey.WorktreeIncludeFiles,
	SessionConfigKey.WorktreeBranchTrack,
] as const;

/**
 * Host-owned session config a client may never write. These carry Agent Merge
 * authorization state (bound pull request, feedback watermark, attempt budgets)
 * that the host derives itself.
 */
const HOST_WRITTEN_SESSION_CONFIG_KEYS = [
	SessionConfigKey.AgentMergeController,
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

/**
 * Grace period before an idle session is released from memory via
 * {@link AgentService._maybeEvictIdleSession}. This lets a quick reconnect
 * reuse the live SDK session instead of forcing an immediate release/resume
 * cycle. Overridable via {@link AgentHostSessionReleaseGraceMsEnvVar} in tests.
 */
const SESSION_RELEASE_GRACE_MS = (() => {
	const raw = process.env[AgentHostSessionReleaseGraceMsEnvVar];
	const parsed = raw !== undefined ? parseInt(raw, 10) : NaN;
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : 30_000;
})();

/**
 * Session-database metadata key for the orchestrator-owned catalog of
 * additional peer chats. When absent, the session predates this persistence
 * and a one-time migration drains the agent's legacy `*.chats` state.
 */
const PEER_CHATS_METADATA_KEY = 'peerChats';
const ANNOTATIONS_METADATA_KEY = 'annotations';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isPersistedAnnotationEntry(value: unknown): value is AnnotationEntry {
	if (!isRecord(value) || typeof value.id !== 'string') {
		return false;
	}
	return typeof value.text === 'string'
		|| (isRecord(value.text) && typeof value.text.markdown === 'string');
}

function isPersistedAnnotation(value: unknown): value is Annotation {
	return isRecord(value)
		&& typeof value.id === 'string'
		&& typeof value.turnId === 'string'
		&& typeof value.resource === 'string'
		&& typeof value.resolved === 'boolean'
		&& Array.isArray(value.entries)
		&& value.entries.length > 0
		&& value.entries.every(isPersistedAnnotationEntry);
}

function isPersistedAnnotationsState(value: unknown): value is AnnotationsState {
	return isRecord(value)
		&& Array.isArray(value.annotations)
		&& value.annotations.every(isPersistedAnnotation);
}

/** Opaque provider data for the session's default chat. */
const DEFAULT_CHAT_PROVIDER_DATA_METADATA_KEY = 'defaultChatProviderData';

/**
 * Session-database metadata key written on a chat's backing SDK session.
 * Marks that session as an internal chat backing so legacy enumeration never
 * surfaces it as a top-level session; the value is the owning chat URI.
 */
const CHAT_BACKING_METADATA_KEY = 'peerChatBacking';

/**
 * A single entry in the orchestrator's persisted peer-chat catalog. `uri` is
 * the peer chat's channel URI; `providerData` is the opaque, agent-owned blob
 * (see {@link IAgentCreateChatResult.providerData}) handed back to the agent on
 * restore — the orchestrator never parses it. `providerData` may be omitted,
 * in which case the agent recovers its backing from its own persistence on
 * {@link IAgent.materializeChat}. `origin` records the chat's provenance
 * (currently only {@link ChatOriginKind.SideChat}, carrying the source chat and
 * stable source turn id) so it survives a restart; omitted for plain peer chats.
 */
interface IPersistedPeerChat {
	readonly uri: string;
	readonly providerData?: string;
	readonly origin?: ChatOrigin;
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
function reconcileWorkingDirectories(requested: readonly URI[] | undefined, resolved: readonly URI[] | undefined): string[] | undefined {
	if (resolved === undefined) {
		return requested?.map(d => d.toString());
	}
	const tail = (requested ?? []).slice(resolved.length);
	return [...resolved, ...tail].map(d => d.toString());
}

/**
 * The agent service implementation that runs inside the agent-host utility
 * process. Dispatches to registered {@link IAgent} instances based
 * on the provider identifier in the session configuration.
 */
export class AgentService extends Disposable implements IAgentService {
	declare readonly _serviceBrand: undefined;

	private readonly _resourceWriteQueue = this._register(new ResourceQueue());

	/** Protocol: fires when state is mutated by an action. */
	private readonly _onDidAction = this._register(new Emitter<ActionEnvelope>());
	readonly onDidAction = this._onDidAction.event;

	/** Protocol: fires for ephemeral notifications (sessionAdded/Removed). */
	private readonly _onDidNotification = this._register(new Emitter<INotification>());
	readonly onDidNotification = this._onDidNotification.event;

	/** Protocol: fires for MCP server-originated notifications routed over `mcp://` channels. */
	private readonly _onMcpNotification = this._register(new Emitter<IMcpNotification>());
	readonly onMcpNotification = this._onMcpNotification.event;

	/** Authoritative state manager for the sessions process protocol. */
	private readonly _stateManager: AgentHostStateManager;
	private readonly _sessionCoordination: SessionCoordinationService;
	private readonly _managedSettingsService = this._register(new AgentHostManagedSettingsService());

	/**
	 * Orchestrator-owned durable index of known sessions. Populated alongside
	 * create/delete paths and, in Stage 1, exposed only for parity validation.
	 */
	private readonly _sessionRegistry: AgentSessionRegistry;
	private readonly _orchestratorDatabase: IAgentHostDatabase;

	private readonly _providerMigrations = new Map<AgentProvider, IProviderDiscoveryState>();
	private readonly _initialProviderMigrations = new Map<AgentProvider, Promise<void>>();

	/**
	 * Backing-session URIs (as strings) whose {@link CHAT_BACKING_METADATA_KEY}
	 * durable marker write kept failing after a retry in `createChat`. The chat
	 * itself was already created and announced successfully, so this in-process
	 * suppression stands in for the durable marker: it is consulted by
	 * {@link _isChatBacking} (used by external discovery) and by `listSessions`'s overlay
	 * filter, so the backing session is still never surfaced as a standalone
	 * top-level session for the lifetime of this process, even though its
	 * on-disk marker never persisted. A later successful write (e.g. from a
	 * differently-timed retry) removes the entry; a stale entry for a since
	 * deleted session is harmless — that URI is never reachable again.
	 */
	private readonly _unpersistedChatBackings = new Set<string>();

	/** Exposes the state manager for co-hosting a WebSocket protocol server. */
	get stateManager(): AgentHostStateManager { return this._stateManager; }

	/** Exposes the configuration service so agent providers can share root config plumbing. */
	get configurationService(): IAgentConfigurationService { return this._configurationService; }

	/** Exposes host-owned persistent storage to process-level DI. */
	get storageService(): IAgentHostStorageService { return this._storageService; }

	/** Exposes customization enablement to process-level DI. */
	get customizationEnablementService(): IAgentHostCustomizationEnablementService { return this._customizationEnablementService; }

	get managedSettingsService(): IAgentHostManagedSettingsService { return this._managedSettingsService; }

	/** Exposes the GitHub endpoint service so agent providers share GitHub (Enterprise) resource resolution. */
	get gitHubEndpointService(): IAgentHostGitHubEndpointService { return this._gitHubEndpointService; }

	/** Exposes the checkpoint service so agent providers can capture session baselines. */
	get checkpointService(): IAgentHostCheckpointService { return this._checkpointService; }

	/** Exposes prompt-cache metadata without exposing the whole state manager. */
	get promptCache(): IAgentHostPromptCache { return this._promptCache; }

	/** Exposes host-owned session-title changes without exposing the whole state manager. */
	get sessionTitleSignal(): IAgentHostSessionTitleSignal { return this._sessionTitleSignal; }

	/** Registered providers keyed by their {@link AgentProvider} id. */
	private readonly _providers = new Map<AgentProvider, IAgent>();
	/** Maps each active session URI (toString) to its owning provider. */
	private readonly _sessionToProvider = new Map<string, AgentProvider>();
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
	/** Subscriptions to provider progress events; cleared when providers change. */
	private readonly _providerSubscriptions = this._register(new DisposableStore());
	/**
	 * Per-session tail of in-flight persisted peer-chat catalog writes, keyed by
	 * session URI string. Read-modify-write updates to the {@link
	 * PEER_CHATS_METADATA_KEY} blob are chained per session so a `createChat`,
	 * `disposeChat`, and `onDidChangeChatData` racing for the same
	 * session can't clobber each other's edits.
	 */
	private readonly _peerChatCatalogWrites = new Map<string, Promise<void>>();
	private readonly _disposingPeerChats = new Set<string>();
	private readonly _defaultChatBackingWrites = new Map<string, Promise<void>>();
	private readonly _authService: AgentHostAuthenticationService;
	/** Default provider used when no explicit provider is specified. */
	private _defaultProvider: AgentProvider | undefined;
	/** Observable registered agents, drives `root/agentsChanged` via {@link AgentSideEffects}. */
	private readonly _agents = observableValue<readonly IAgent[]>('agents', []);
	/** Shared side-effect handler for action dispatch and session lifecycle. */
	private readonly _sideEffects: AgentSideEffects;
	private readonly _agentMergeController: AgentMergeController;
	/** Owns static / per-turn changeset compute, publish, persist, restore. */
	private readonly _changesets: IAgentHostChangesetService;
	/** Shared active changeset subscription registry. */
	private readonly _changesetSubscriptions: IAgentHostChangesetSubscriptionService;
	/** Owns changeset operation contributions and handler activation. */
	private readonly _changesetOperationService: IAgentHostChangesetOperationService;
	private readonly _reviewService: IAgentHostReviewService;
	/** Owns AgentService-side orchestration of the changeset feature. */
	private readonly _changesetCoordinator: AgentHostChangesetCoordinator;
	/** Owns session git-state probing and git-backed catalogue decoration. */
	private readonly _gitStateService: IAgentHostGitStateService;
	/** Manages PTY-backed terminals for the agent host protocol. */
	private readonly _terminalManager: AgentHostTerminalManager;
	/** Persists host-injected `/rename` / `!command` turns for restore & fork/truncate. */
	private readonly _localTurns: AgentHostLocalTurns;
	/** Server-side host for the agent host's server tools. */
	private readonly _serverToolHost: AgentServerToolHost;
	private readonly _debugLogsCollector: AgentHostDebugLogsCollector | undefined;
	private readonly _configurationService: AgentConfigurationService;
	private readonly _storageService: AgentHostStorageService;
	private readonly _customizationEnablementService: AgentHostCustomizationEnablementService;
	/** Captures baseline / per-turn git checkpoints backing the changeset pipeline. */
	private readonly _checkpointService: IAgentHostCheckpointService;
	private readonly _promptCache: IAgentHostPromptCache;
	private readonly _sessionTitleSignal: IAgentHostSessionTitleSignal;
	/**
	 * Host-owned worktree isolation controller. Set post-construction via
	 * {@link setWorktreeIsolation} after host startup constructs the Copilot API
	 * dependencies. All worktree behavior — schema contribution, first-send
	 * resolution, project / announcement, archive, and cleanup — is driven from
	 * the host so individual agents stay unaware of the folder-vs-worktree
	 * distinction.
	 */
	private _worktree: WorktreeIsolation | undefined;
	/** Single source of truth for GitHub (Enterprise) endpoints and protected resources. */
	private readonly _gitHubEndpointService: IAgentHostGitHubEndpointService;
	/** Pluggable completion item providers (e.g. workspace file completions, agent-specific @-mentions). */
	private readonly _completions: IAgentHostCompletions;
	private _skillCompletionProviderRegistered = false;
	/** Backs {@link getNetworkDiagnosticsInfo} / {@link diagnosticsFetch}; wired via {@link setNetworkDiagnosticsService}. */
	private _networkDiagnostics: INetworkDiagnosticsService | undefined;
	private _editAttributionService: IAgentEditAttributionService | undefined;

	/**
	 * Authoritative server-side per-resource subscription refcount, keyed by
	 * resource URI string and valued by the set of subscribed protocol
	 * client IDs. Populated by {@link subscribe} (or {@link addSubscriber}
	 * for handshake fast-paths) and drained by {@link unsubscribe}. When a
	 * resource's set becomes empty, the resource is dropped from the map and
	 * {@link _maybeEvictIdleSession} is invoked to release any cached state
	 * for it.
	 */
	private readonly _resourceSubscribers = new ResourceMap<Set<string>>();
	private readonly _releaseSessionInFlight = new Map<string, Promise<void>>();
	private readonly _restoreSessionInFlight = new Map<string, Promise<void>>();
	private readonly _restoreSubagentInFlight = new Map<string, Promise<void>>();

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
	 * Pending {@link _maybeEvictIdleSession} timers, keyed by session URI. A
	 * timer is armed when an idle session (with turns) loses its last subscriber
	 * — see {@link unsubscribe}. Cleared when any client subscribes again
	 * ({@link addSubscriber}) or the timer fires. Deferring the release avoids
	 * churning the provider SDK session on rapid disconnect/reconnect cycles.
	 */
	private readonly _pendingSessionRelease = this._register(new DisposableResourceMap<IDisposable>());

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

	/** Exposes the terminal manager for use by agent providers. */
	get terminalManager(): IAgentHostTerminalManager { return this._terminalManager; }

	/** Exposes the completions service for use by agent providers (e.g. to register agent-scoped completion item providers). */
	get completionsService(): IAgentHostCompletions { return this._completions; }

	/**
	 * Trigger characters announced to clients via `InitializeResult.completionTriggerCharacters`.
	 * Aggregated from all registered {@link IAgentHostCompletionItemProvider}s.
	 */
	get completionTriggerCharacters(): readonly string[] { return this._completions.triggerCharacters; }

	constructor(
		private readonly _logService: ILogService,
		private readonly _fileService: IFileService,
		private readonly _sessionDataService: ISessionDataService,
		private readonly _productService: IProductService,
		private readonly _gitService: IAgentHostGitService,
		private readonly _rootConfigResource?: URI,
		private readonly _telemetryService: ITelemetryService = NullTelemetryService,
		_fileMonitorService?: IAgentHostFileMonitorService,
		copilotApiService?: ICopilotApiService,
		fetchFn?: typeof globalThis.fetch,
		providerConfigurations: readonly IAgentCustomizationSettingsRegistration[] = [],
		private readonly _hostLaunchKind = AgentHostLaunchKind.Unknown,
		storageResource?: URI,
		orchestratorDatabase?: IAgentHostDatabase,
		private readonly _now: () => number = Date.now,
		debugLogsEnvironment?: IAgentHostDebugLogsEnvironment,
	) {
		super();
		this._logService.info('AgentService initialized');
		this._authService = new AgentHostAuthenticationService(_logService);
		const databasePath = this._rootConfigResource
			? joinPath(resourcesDirname(this._rootConfigResource), 'agent-host.db').fsPath
			: ':memory:';
		this._orchestratorDatabase = this._register(orchestratorDatabase ?? new AgentHostDatabase(databasePath));
		this._debugLogsCollector = debugLogsEnvironment ? this._register(new AgentHostDebugLogsCollector(debugLogsEnvironment, this._logService)) : undefined;
		this._sessionRegistry = this._register(new AgentSessionRegistry(this._orchestratorDatabase));
		this._stateManager = this._register(new AgentHostStateManager(_logService, {
			hostBuildInfo: hostBuildInfoFromProduct(this._productService),
			changesetStateRetention: {
				// The cache calls this lazily after construction. If a future state-manager
				// initialization path registers changesets before `_changesets` is assigned,
				// keep the entry pinned rather than evicting with incomplete liveness data.
				canEvict: changeset => this._changesets ? this._isChangesetEvictable(changeset) : false,
			},
		}));
		this._register(this._stateManager.onDidEmitEnvelope(e => this._onDidAction.fire(e)));
		this._register(this._stateManager.onDidEmitEnvelope(e => this._trackPendingSubagentChatFromEnvelope(e)));
		this._register(this._stateManager.onDidEmitEnvelope(e => this._persistAnnotations(e)));
		this._register(this._stateManager.onDidEmitNotification(e => this._onDidNotification.fire(e)));
		this._register(this._stateManager.onDidChangeSessionSummary(({ session, changes }) => {
			const meta = this._stateManager.getSessionSummary(session)?._meta;
			if (changes.modifiedAt !== undefined
				&& this._getExternalSessionsMode() === AgentHostExternalSessionsMode.Recent
				&& readSessionExternal(meta)
				&& !readSessionEhcliAdoptable(meta)) {
				this._queueSessionListReconciliation();
			}
		}));
		// Build a local instantiation scope so downstream components can
		// consume {@link IAgentConfigurationService} (and later {@link ILogService})
		// via DI rather than being plumbed plain-class references.
		const configurationService = this._register(new AgentConfigurationService(this._stateManager, this._logService, this._rootConfigResource, providerConfigurations));
		this._configurationService = configurationService;
		let externalSessionsMode = this._getExternalSessionsMode();
		this._lastMigrateLegacyEnabled = this._isMigrateLegacyEnabled();
		let agentMergeEnabled = this._isAgentMergeEnabled();
		this._register(configurationService.onDidRootConfigChange(() => {
			const nextMode = this._getExternalSessionsMode();
			if (nextMode !== externalSessionsMode) {
				const previousMode = externalSessionsMode;
				externalSessionsMode = nextMode;
				this._logService.info(`[AgentService] ${AgentHostShowExternalSessionsConfigKey} changed '${previousMode}' -> '${nextMode}'; queueing session list reconciliation`);
				this._queueSessionListReconciliation(previousMode);
			}
			// Agent Merge tools are only advertised while the feature is on, so a
			// toggle has to reach sessions that were advertised under the old value.
			const nextAgentMergeEnabled = this._isAgentMergeEnabled();
			if (nextAgentMergeEnabled !== agentMergeEnabled) {
				agentMergeEnabled = nextAgentMergeEnabled;
				for (const session of this._stateManager.getSessionUris()) {
					this._serverToolHost.advertise(session);
				}
			}
			this._onMigrateLegacySettingChanged();
		}));
		const fileMonitorService = _fileMonitorService ?? this._register(new AgentHostFileMonitorService(this._fileService, this._logService));
		this._storageService = this._register(new AgentHostStorageService(storageResource, this._logService));
		updateAgentHostTelemetryLevelFromConfig(this._telemetryService, this._stateManager.rootState.config?.values);
		const services = new ServiceCollection(
			[ILogService, this._logService],
			[IAgentService, this],
			[IProductService, this._productService],
			[IAgentConfigurationService, configurationService],
			[IAgentHostStateManager, this._stateManager],
			[IAgentHostFileMonitorService, fileMonitorService],
			[IAgentHostGitService, this._gitService],
			[IAgentHostStorageService, this._storageService],
			[ITelemetryService, this._telemetryService],
			// The outer agent-host process DI registers `ISessionDataService`,
			// but this nested strict `InstantiationService` does not inherit it.
			// Add it explicitly so `@ISessionDataService` injection into the
			// changeset service (and any future sibling) resolves correctly.
			[ISessionDataService, this._sessionDataService],
		);
		const instantiationService = this._register(new InstantiationService(services, /*strict*/ true));
		this._gitHubEndpointService = this._register(instantiationService.createInstance(AgentHostGitHubEndpointService));
		services.set(IAgentHostGitHubEndpointService, this._gitHubEndpointService);
		// A GitHub Enterprise URI change repoints every agent's GitHub resource
		// identity to a different authorization server, so the client must obtain a
		// token for the new resource. One root-channel `auth/required` covers all
		// agents (the URI is host-level config).
		this._register(this._gitHubEndpointService.onDidChange(() => {
			this._stateManager.emitAuthRequired({
				resource: this._gitHubEndpointService.getCopilotResource(),
				reason: AuthRequiredReason.Required,
			});
		}));
		const agentHostOctoKitService = instantiationService.createInstance(AgentHostOctoKitService, fetchFn);
		services.set(IAgentHostOctoKitService, agentHostOctoKitService);
		const gitHubService = this._register(instantiationService.createInstance(GitHubService, {
			endpoint: this._gitHubEndpointService,
			tokenProvider: {
				getToken: () => {
					const resource = this._gitHubEndpointService.getRepoResource();
					return this._authService.getAuthToken({
						resource: resource.resource,
						scopes: resource.scopes_supported,
					});
				},
			},
			fetch: fetchFn,
		}));
		services.set(IGitHubService, gitHubService);
		const effectiveCopilotApiService = copilotApiService ?? instantiationService.createInstance(CopilotApiService, fetchFn);
		services.set(ICopilotApiService, effectiveCopilotApiService);
		this._customizationEnablementService = this._register(instantiationService.createInstance(AgentHostCustomizationEnablementService));
		services.set(IAgentHostCustomizationEnablementService, this._customizationEnablementService);

		this._gitStateService = this._register(instantiationService.createInstance(AgentHostGitStateService));
		services.set(IAgentHostGitStateService, this._gitStateService);
		this._agentMergeController = this._register(instantiationService.createInstance(AgentMergeController, {
			startTurn: (session, turnId, prompt) => this._startAgentMergePrompt(session, turnId, prompt),
			cancelTurn: (session, turnId) => this._cancelAgentMergePrompt(session, turnId),
			getAutonomousSessionConfig: (session, config) => this._findProviderForSession(session)?.getAutonomousSessionConfig?.(config),
		}));

		this._checkpointService = this._register(instantiationService.createInstance(AgentHostCheckpointService));
		services.set(IAgentHostCheckpointService, this._checkpointService);

		this._promptCache = instantiationService.createInstance(AgentHostPromptCache);
		services.set(IAgentHostPromptCache, this._promptCache);
		this._sessionTitleSignal = this._register(instantiationService.createInstance(AgentHostSessionTitleSignal));
		services.set(IAgentHostSessionTitleSignal, this._sessionTitleSignal);

		// The subscription service manages the lifecycle of changeset subscriptions. The service
		// is also consulted by other services when refreshing changesets and changeset operations.
		this._changesetSubscriptions = instantiationService.createInstance(AgentHostChangesetSubscriptionService);
		services.set(IAgentHostChangesetSubscriptionService, this._changesetSubscriptions);

		// The operation contribution service manages the lifecycle of changeset operations.
		this._changesetOperationService = this._register(instantiationService.createInstance(AgentHostChangesetOperationService));
		services.set(IAgentHostChangesetOperationService, this._changesetOperationService);

		// The changes review service is responsible for managing review/unreview state for changeset changes.
		this._reviewService = this._register(instantiationService.createInstance(AgentHostReviewService));
		services.set(IAgentHostReviewService, this._reviewService);

		// The changeset service is responsible for computing, publishing, and persisting changesets.
		this._changesets = this._register(instantiationService.createInstance(AgentHostChangesetService));
		services.set(IAgentHostChangesetService, this._changesets);

		// The coordinator owns all AgentService-side orchestration of the changeset feature: lifecycle
		// hooks, listSessions overlay, subscription URI routing, and the deferred-refresh state machine.
		this._changesetCoordinator = this._register(instantiationService.createInstance(AgentHostChangesetCoordinator));
		this._register(this._stateManager.onDidChangeSessionActiveTurn(e => this._changesetCoordinator.onSessionTurnActiveChanged(e.session, e.active)));

		// Register the changeset operation contributions.
		this._register(this._changesetOperationService.registerContribution(instantiationService.createInstance(AgentHostCommitOperationContribution)));
		this._register(this._changesetOperationService.registerContribution(instantiationService.createInstance(AgentHostPullRequestOperationContribution)));
		this._register(this._changesetOperationService.registerContribution(instantiationService.createInstance(AgentHostMergeOperationContribution)));
		this._register(this._changesetOperationService.registerContribution(instantiationService.createInstance(AgentHostSyncOperationContribution)));
		this._register(this._changesetOperationService.registerContribution(instantiationService.createInstance(AgentHostDiscardChangesOperationContribution)));

		this._completions = this._register(instantiationService.createInstance(AgentHostCompletions));
		// Built-in generic provider: completes files in the session's workspace folder.
		const workspaceFiles = this._register(instantiationService.createInstance(AgentHostWorkspaceFiles));
		this._register(this._completions.registerProvider(
			new AgentHostFileCompletionProvider(this._stateManager, workspaceFiles, this._logService),
		));
		// Built-in generic provider: completes `#chat:<title>` references to other
		// chats in the same session, attaching a chat transcript attachment.
		this._register(this._completions.registerProvider(
			new AgentHostChatCompletionProvider(this._stateManager),
		));
		// Built-in generic provider: offers the `/rename` slash command for any
		// session that already has history. Execution is handled server-side in
		// AgentSideEffects (redirected to a SessionTitleChanged action).
		this._register(this._completions.registerProvider(
			new AgentHostRenameCompletionProvider(
				session => (this._stateManager.getSessionState(session)?.turns.length ?? 0) > 0,
			),
		));
		this._register(this._completions.registerProvider(
			new CodexCompactCompletionProvider(
				session => (this._stateManager.getSessionState(session)?.turns.length ?? 0) > 0,
			),
		));

		// Terminal management — the terminal manager listens to the state
		// manager's action stream and dispatches PTY output back through it.
		// Created before AgentSideEffects and registered in the local scope so
		// AgentSideEffects can consume it via DI (for inline `!command`
		// execution).
		this._terminalManager = this._register(instantiationService.createInstance(AgentHostTerminalManager));
		services.set(IAgentHostTerminalManager, this._terminalManager);

		this._localTurns = new AgentHostLocalTurns(this._sessionDataService, this._logService);

		this._sideEffects = this._register(instantiationService.createInstance(AgentSideEffects, this._stateManager, this._customizationEnablementService, {
			getAgent: session => this._findProviderForSession(session),
			sessionDataService: this._sessionDataService,
			localTurns: this._localTurns,
			agents: this._agents,
			hostLaunchKind: this._hostLaunchKind,
			copilotApiService: effectiveCopilotApiService,
			getGitHubCopilotToken: () => {
				return this.getAuthToken({
					resource: this._gitHubEndpointService.getCopilotResource().resource,
					scopes: this._gitHubEndpointService.getCopilotResource().scopes_supported,
				});
			},
			getGitHubToken: () => {
				return this.getAuthToken({
					resource: this._gitHubEndpointService.getRepoResource().resource,
					scopes: this._gitHubEndpointService.getRepoResource().scopes_supported,
				});
			},
			getGitHubHost: () => this._gitHubEndpointService.getEnterpriseHost() ?? 'github.com',
			octoKitService: agentHostOctoKitService,
			resolveWorkingDirectoryBeforeSend: params => this._resolveWorkingDirectoryBeforeSend(params),
			resolveChatAttachmentTurns: resource => this._resolveChatAttachmentTurns(resource),
			onTurnComplete: session => {
				const workingDirStr = this._stateManager.getSessionState(session)?.workingDirectories?.[0];
				void this._gitStateService.attachSessionGitHubPullRequest(session, workingDirStr ? URI.parse(workingDirStr) : undefined);
			},
			onUserMessage: (session, text) => {
				void this._gitStateService.attachSessionGitHubReferences(session.toString(), text);
			},
		}));
		this._sessionCoordination = this._register(new SessionCoordinationService(
			this._stateManager,
			this._sessionDataService,
			this._logService,
			{
				getSessionMetadata: session => this._getSessionMetadata(session),
				restoreSession: session => this.restoreSession(session),
				handleAction: (chat, action) => this._sideEffects.handleAction(chat, action),
			},
		));

		// Server-side tools, executed in-process against each session's own
		// state. The set of groups (and their display) is the single source of
		// truth in `serverToolGroups.ts`; the session-management group's runtime
		// dependency (this service) is injected via the accessor.
		const agentMergeTools = instantiationService.createInstance(
			AgentMergeTools,
			() => this._agentMergeController.isEnabled(),
			session => this._agentMergeController.getTurnContext(session),
		);
		this._serverToolHost = new AgentServerToolHost(this._stateManager, buildServerToolGroups(this._createSessionServerToolAccessor(), agentMergeTools));
	}

	/**
	 * The registered providers. Exposed so process-lifetime background jobs
	 * (notably {@link AgentModelRefreshScheduler}) can observe registrations
	 * without this service owning an ambient recurring timer of its own.
	 */
	get agents(): IObservable<readonly IAgent[]> {
		return this._agents;
	}

	/**
	 * Fires with the provider id whenever a turn starts. Exposed alongside
	 * {@link agents} so {@link AgentModelRefreshScheduler} can gate its periodic
	 * refresh on real agent usage rather than polling an idle host.
	 */
	get onDidStartTurn(): Event<string> {
		return this._sideEffects.onDidStartTurn;
	}

	// ---- provider registration ----------------------------------------------

	/**
	 * Injects the host-owned {@link WorktreeIsolation} controller and forwards it
	 * to the collaborators that consult it. Called once at startup (from
	 * agentHostMain / agentHostServerMain) after the Copilot API dependencies
	 * have been wired.
	 */
	setWorktreeIsolation(worktree: WorktreeIsolation): void {
		this._worktree = worktree;
		this._configurationService.setWorktreeIsolation(worktree);
		this._sideEffects.setWorktreeIsolation(worktree);
		this._customizationEnablementService.setWorktreeIsolation(worktree);
	}

	private _toProviderConfig<T extends { readonly config?: Record<string, unknown> }>(request: T): T {
		if (!this._worktree || !request.config) {
			return request;
		}
		return { ...request, config: omitHostOwnedSessionConfig(request.config) };
	}

	/**
	 * Host-owned first-send hook (invoked by {@link AgentSideEffects} before the
	 * agent locks its subprocess cwd). Resolves the working directories the session
	 * will actually run in and hands them to the agent at send time:
	 *  - index 0 is the process root: for `worktree` isolation the isolated
	 *    worktree (created here on the first send, see
	 *    {@link _resolveWorktreeBeforeSend}); for `folder` isolation the picked
	 *    folder; `undefined` (whole result) for workspace-less sessions.
	 *  - the tail carries any additional session roots as-is (only index 0 is
	 *    worktree-remapped; additional roots are passed through unchanged).
	 */
	private async _resolveWorkingDirectoryBeforeSend(params: { session: string; chat: string; turnId: string; prompt: string }): Promise<readonly URI[] | undefined> {
		const sessionId = AgentSession.id(params.session);
		const pickedFolders = this._configurationService.getEffectiveWorkingDirectories(params.session);
		const pickedFolderUri = pickedFolders?.[0] ? URI.parse(pickedFolders[0]) : undefined;
		const tail = (pickedFolders ?? []).slice(1).map(d => URI.parse(d));

		// Only worktree-isolation sessions defer directory resolution to the first
		// send (so the prompt can name the branch); folder / workspace-less
		// sessions run directly in the picked folder.
		if (!this._worktree?.isWorkingDirectoryPending(sessionId)) {
			if (!pickedFolderUri) {
				return undefined;
			}
			const resolved = await this._configurationService.resolveWorkingDirectoryForResume(params.session, pickedFolderUri);
			return [resolved, ...tail];
		}

		// Fall back to the picked folder when worktree creation failed so the
		// session still materializes in the user's folder rather than nowhere.
		const resolved = await this._resolveWorktreeBeforeSend({ ...params, sessionId, pickedFolderUri }) ?? pickedFolderUri;
		return resolved ? [resolved, ...tail] : undefined;
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

		const sessionUri = URI.parse(isAhpChatChannel(resource) ? parseRequiredSessionUriFromChatUri(resource) : resource);
		if (!this._stateManager.getSessionState(sessionUri.toString())) {
			await this.restoreSession(sessionUri);
		} else {
			const provider = this._findProviderForSession(sessionUri);
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

	/**
	 * Creates the session's isolated worktree on the first send (deferred so the
	 * user's prompt can name the branch), reports creation progress as the chat's
	 * activity, surfaces the "Created isolated worktree" announcement as the first
	 * markdown response part or a durable fallback warning, and returns the created worktree URI.
	 * Idempotent; safe to call once the worktree exists. Returns `undefined` when
	 * worktree creation failed. Only invoked for sessions whose worktree is still
	 * pending (see {@link _resolveWorkingDirectoryBeforeSend}).
	 */
	private async _resolveWorktreeBeforeSend(params: { session: string; chat: string; turnId: string; prompt: string; sessionId: string; pickedFolderUri: URI | undefined }): Promise<URI | undefined> {
		const { sessionId, pickedFolderUri } = params;
		const worktree = this._worktree;
		if (!worktree) {
			return undefined;
		}
		let reportedActivity = false;
		let failureDiagnostic: string | undefined;
		try {
			await worktree.resolveOnFirstSend({
				sessionUri: URI.parse(params.session),
				sessionId,
				workingDirectory: pickedFolderUri,
				config: this._configurationService.getSessionConfigValues(params.session),
				prompt: params.prompt,
				githubToken: this.getAuthToken({
					resource: this._gitHubEndpointService.getCopilotResource().resource,
					scopes: this._gitHubEndpointService.getCopilotResource().scopes_supported,
				}),
				onProgress: activity => {
					reportedActivity = true;
					this._stateManager.dispatchServerAction(params.chat, { type: ActionType.ChatActivityChanged, activity });
				},
			});
		} catch (err) {
			failureDiagnostic = toErrorMessage(err);
			this._logService.warn(`[AgentService] worktree resolution failed for ${params.session}: ${failureDiagnostic}`);
		}
		// Clear on every exit path so a failed creation can't strand the chat
		// on a stale "Creating isolated worktree" activity.
		if (reportedActivity) {
			this._stateManager.dispatchServerAction(params.chat, { type: ActionType.ChatActivityChanged, activity: undefined });
		}
		const resolvedWorktree = worktree.getResolvedWorktree(sessionId);
		if (!resolvedWorktree) {
			try {
				await worktree.persistCreationFailure(URI.parse(params.session), sessionId, failureDiagnostic);
			} catch (err) {
				this._logService.warn(`[AgentService] failed to persist worktree creation failure for ${params.session}: ${toErrorMessage(err)}`);
			}
			this._stateManager.dispatchServerAction(params.chat, {
				type: ActionType.ChatResponsePart,
				turnId: params.turnId,
				part: buildWorktreeFailureNotification(failureDiagnostic),
			});
			return undefined;
		}
		const announcement = worktree.takePendingAnnouncement(sessionId);
		if (announcement !== undefined) {
			this._stateManager.dispatchServerAction(params.chat, {
				type: ActionType.ChatResponsePart,
				turnId: params.turnId,
				part: { kind: ResponsePartKind.Markdown, id: generateUuid(), content: announcement },
			});
		}
		return resolvedWorktree;
	}

	registerProvider(provider: IAgent): void {
		if (this._providers.has(provider.id)) {
			throw new Error(`Agent provider already registered: ${provider.id}`);
		}
		this._logService.info(`Registering agent provider: ${provider.id}`);
		this._providers.set(provider.id, provider);
		this._invalidateSessionList();
		provider.setServerToolHost?.(this._serverToolHost);
		provider.setKnownSessionsFilter?.(sessions => this._filterKnownSessions(sessions));
		void this._authService.replay(provider);
		// Deterministic subagent membership ordering: apply a spawned subagent's
		// catalog membership (via the spawn-channel handlers) BEFORE
		// AgentSideEffects — registered next — handles the same signal and starts
		// a turn on the subagent chat, which requires that chat to already exist.
		// Registering this listener ahead of the side-effects listener makes the
		// ordering independent of when the agent registers its own subagent->spawn
		// bridge; addChat/removeChat are idempotent, so the overlap is safe.
		this._providerSubscriptions.add(provider.onDidChatProgress(signal => this._sequenceSpawnedChat(signal)));
		this._providerSubscriptions.add(this._sideEffects.registerProgressListener(provider));
		this._providerSubscriptions.add(provider.onDidMaterializeChat(e => this._onDidMaterializeChat(e)));
		this._providerSubscriptions.add(provider.onDidDiscoverChats(chats => {
			void this._registerDiscoveredChats(provider, chats).catch(err =>
				this._logService.warn(`[AgentService] registering discovered chats for provider ${provider.id} failed`, err));
		}));
		if (provider.onMcpNotification) {
			this._providerSubscriptions.add(provider.onMcpNotification(e => this._onMcpNotification.fire(e)));
		}
		this._providerSubscriptions.add(provider.onDidChangeChatData(e => this._onChatDataChanged(e)));
		this._providerSubscriptions.add(provider.onDidSpawnChat(e => this._onChatSpawned(e)));
		this._registerSkillCompletionProvider();
		const initialMigration = this._ensureLegacyChatsMigrated(provider);
		this._initialProviderMigrations.set(provider.id, initialMigration);
		void initialMigration.catch(err =>
			this._logService.warn(`[AgentService] registry migration: failed for late-registered provider ${provider.id}`, err));
		if (!this._defaultProvider) {
			this._defaultProvider = provider.id;
		}

		// Update root state with current agents list
		this._updateAgents();
	}

	private _registerSkillCompletionProvider(): void {
		if (this._skillCompletionProviderRegistered) {
			return;
		}
		this._skillCompletionProviderRegistered = true;
		const provider = this._register(new AgentHostSkillCompletionProvider(
			session => this._findProviderForSession(session),
			session => this._hostCustomizations(URI.isUri(session) ? session : URI.parse(session)),
		));
		this._register(this._completions.registerProvider(provider));
	}

	// ---- auth ---------------------------------------------------------------

	async authenticate(params: AuthenticateParams): Promise<AuthenticateResult> {
		const result = await this._authService.authenticate(params, this._providers.values());
		if (result.authenticated) {
			this._agentMergeController.refresh();
		}
		return result;
	}

	getAuthToken(request: IAgentHostAuthTokenRequest): string | undefined {
		return this._authService.getAuthToken(request);
	}

	// ---- Changeset operation handlers --------------------------------------

	async invokeChangesetOperation(params: InvokeChangesetOperationParams): Promise<InvokeChangesetOperationResult> {
		return this._changesetOperationService.invokeChangesetOperation(params);
	}

	// ---- MCP `mcp://` channel routing --------------------------------------

	async handleMcpRequest(channel: string, method: string, params: Record<string, unknown> | undefined): Promise<unknown> {
		const route = parseMcpChannelUri(channel);
		if (!route) {
			throw new Error(`Method not found: invalid mcp:// channel ${channel}`);
		}
		const provider = this._providers.get(route.providerId);
		if (!provider || !provider.handleMcpRequest) {
			throw new Error(`Method not found: no provider for mcp:// channel ${channel}`);
		}
		return provider.handleMcpRequest(route.chatUri, route.serverName, method, params);
	}

	// ---- session management -------------------------------------------------

	/**
	 * Builds the dependency surface the session server-tool group needs, bound
	 * to this service so the group stays decoupled from the concrete host.
	 */
	private _createSessionServerToolAccessor(): ISessionServerToolAccessor {
		return {
			isActiveAgentTitleGenerationEnabled: () => this._isActiveAgentTitleGenerationEnabled(),
			listSessions: () => this.listSessions(),
			getSession: session => this._getSessionMetadata(session),
			createSession: config => this.createSession(config),
			getModels: () => {
				const models: IAgentModelInfo[] = [];
				for (const provider of this._providers.values()) {
					models.push(...provider.models.get());
				}
				return models;
			},
			getCreationDefaults: source => this._getServerToolCreationDefaults(source),
			startPrompt: (session, chat, prompt) => this._startSessionPrompt(session, chat, prompt),
			createChat: (session, chat, options) => this.createChat(session, chat, (options?.title !== undefined || options?.model !== undefined)
				? { ...(options.title !== undefined ? { title: options.title } : {}), ...(options.model !== undefined ? { model: options.model } : {}) }
				: undefined),
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
			setSessionOrchestration: (session, orchestration) => this._sessionCoordination.setOrchestration(session.toString(), orchestration),
		};
	}

	private _isActiveAgentTitleGenerationEnabled(): boolean {
		return this._configurationService.getRootValue(platformRootSchema, AgentHostActiveAgentTitleGenerationConfigKey) === true;
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
		const config = this._providers.get(session.provider)?.getInheritedChatConfig(session.config?.values ?? {});
		return {
			provider: session.provider,
			...(model !== undefined ? { model } : {}),
			...(config !== undefined ? { config } : {}),
		};
	}

	/**
	 * Starts the first turn on a freshly-created session by dispatching a
	 * `ChatTurnStarted` and routing it through the same side-effects path a
	 * client-initiated turn takes (which sends the message to the provider).
	 */
	private async _startSessionPrompt(session: URI, chat: URI, prompt: string): Promise<void> {
		const message: Message = { text: prompt, origin: { kind: MessageKind.User } };
		const action = { type: ActionType.ChatTurnStarted, turnId: generateUuid(), startedAt: new Date().toISOString(), message } as const;
		this._stateManager.dispatchServerAction(chat.toString(), action);
		this._sideEffects.handleAction(chat.toString(), action);
	}

	private _startAgentMergePrompt(session: string, turnId: string, prompt: string): boolean {
		if (this._stateManager.hasActiveTurn(session)) {
			return false;
		}
		const chat = buildDefaultChatUri(session).toString();
		const message: Message = {
			text: prompt,
			origin: { kind: MessageKind.SystemNotification },
		};
		const action = { type: ActionType.ChatTurnStarted, turnId, startedAt: new Date().toISOString(), message } as const;
		this._stateManager.dispatchServerAction(chat, action);
		this._sideEffects.handleAction(chat, action);
		return true;
	}

	/**
	 * Cancels a repair turn this host started for Agent Merge, so a stopped or
	 * revoked controller cannot leave an autonomous turn running.
	 */
	private _cancelAgentMergePrompt(session: string, turnId: string): void {
		const chat = buildDefaultChatUri(session).toString();
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
		const chatState = chatId
			? await this._stateManager.resolveChatState(buildChatUri(session.toString(), chatId))
			: this._stateManager.getDefaultChatState(session.toString());
		if (!chatState) {
			return undefined;
		}
		return {
			turns: chatState.turns,
			...(chatState.activeTurn ? { activeTurn: { message: chatState.activeTurn.message, responseParts: chatState.activeTurn.responseParts } } : {}),
			hasMoreHistory: !!chatState.turnsNextCursor,
		};
	}

	private async _renameChatFromTool(session: URI, chat: URI, title: string): Promise<IRenameTitleResult> {
		validateRenameTitle(title, SessionServerToolName.RenameChat);
		const isDefaultChat = isDefaultChatUri(chat.toString());
		if (isDefaultChat && await this._isOnlySessionChat(session)) {
			await persistSessionMetadataValues(this._sessionDataService, session.toString(), {
				[SESSION_CUSTOM_TITLE_KEY]: title,
				[SESSION_CUSTOM_TITLE_SOURCE_KEY]: AGENT_HOST_TITLE_SOURCE_AGENT,
			});
			if (this._stateManager.getSessionState(session.toString())?.title !== title) {
				this._stateManager.dispatchServerAction(session.toString(), { type: ActionType.SessionTitleChanged, title });
			}
			this._sideEffects.markTitleRenamed(session.toString());
			return { title };
		}
		if (!isDefaultChat && !await this._peerChatExists(session, chat)) {
			throw new Error(`Invalid ${SessionServerToolName.RenameChat} input: chat must match a known non-default chat.`);
		}

		await persistSessionMetadataValues(this._sessionDataService, session.toString(), {
			[customChatTitleMetadataKey(chat.toString())]: title,
			[customChatTitleSourceMetadataKey(chat.toString())]: AGENT_HOST_TITLE_SOURCE_AGENT,
		});
		if (this._stateManager.getSessionState(session.toString())) {
			this._stateManager.updateChatTitle(session.toString(), chat.toString(), title);
		}
		this._sideEffects.markTitleRenamed(session.toString(), chat.toString());
		return { title };
	}

	private async _isOnlySessionChat(session: URI): Promise<boolean> {
		const state = this._stateManager.getSessionState(session.toString());
		if (state) {
			return state.chats.length === 1;
		}
		const persisted = await this._readPersistedPeerChatCatalog(session);
		return persisted?.length === 0;
	}

	private async _peerChatExists(session: URI, chat: URI): Promise<boolean> {
		if (this._stateManager.getSessionState(session.toString())?.chats.some(candidate => candidate.resource === chat.toString())) {
			return true;
		}
		const persisted = await this._readPersistedPeerChatCatalog(session);
		return persisted?.some(candidate => candidate.uri === chat.toString()) === true;
	}

	private _toSessionMetadata(metadata: IAgentChatMetadata): IAgentSessionMetadata {
		const { chat, ...rest } = metadata;
		return {
			...rest,
			session: URI.parse(parseRequiredSessionUriFromChatUri(chat)),
		};
	}

	/** `undefined` means the provider cannot enumerate its native chats yet. */
	private async _enumerateLegacyProviderSessions(provider: IAgent): Promise<readonly IAgentSessionMetadata[] | undefined> {
		const chats = await provider.listChatsToMigrate();
		return chats?.map(metadata => this._toSessionMetadata(metadata));
	}

	/**
	 * Registry metadata for one session. Returns `undefined` when the agent
	 * cannot describe the session yet; {@link listSessions} still overlays
	 * active provisional sessions from state-manager data.
	 */
	private async _registeredSessionMetadata(agent: IAgent, session: URI, external: boolean): Promise<IAgentSessionMetadata | undefined> {
		const chat = URI.parse(buildDefaultChatUri(session));
		const metadata = await agent.getChatMetadata(chat, this._chatContext(session, chat), await this._readDefaultChatProviderData(session));
		if (!metadata) {
			return undefined;
		}
		const sessionMetadata = this._toSessionMetadata(metadata);
		return {
			...sessionMetadata,
			_meta: withSessionExternal(sessionMetadata._meta, external),
		};
	}

	private async _getSessionMetadata(session: URI): Promise<IAgentSessionMetadata | undefined> {
		const registered = await this._sessionRegistry.get(session, entry => this._migrateRegisteredSession(entry));
		if (!registered) {
			return undefined;
		}
		const agent = this._providers.get(registered.provider);
		const liveSummary = this._stateManager.getSessionSummary(session.toString());
		if (liveSummary) {
			const metadata = (liveSummary.workingDirectories === undefined && agent
				? await this._registeredSessionMetadata(agent, session, registered.external)
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
		return this._registeredSessionMetadata(agent, session, registered.external);
	}

	private _withLiveSessionMetadata(metadata: IAgentSessionMetadata, liveSummary: SessionSummary): IAgentSessionMetadata {
		let _meta = liveSummary._meta !== undefined || metadata._meta !== undefined
			? { ...metadata._meta, ...liveSummary._meta }
			: undefined;
		_meta = withSessionMultiRootMetadata(_meta, readSessionMultiRootMetadata(liveSummary._meta) ?? readSessionMultiRootMetadata(metadata._meta));
		return {
			...metadata,
			summary: liveSummary.title || metadata.summary,
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
			...(_meta !== undefined ? { _meta } : {}),
		};
	}

	/**
	 * Awaits legacy migration started at provider registration. Provider-owned
	 * discovery is independent and surfaces unknown chats additively.
	 */
	private async _awaitInitialProviderMigration(): Promise<void> {
		const providers = [...this._providers.values()];
		const results = await Promise.allSettled(providers.map(provider => this._initialProviderMigrations.get(provider.id) ?? Promise.resolve()));
		const retries: Promise<void>[] = [];
		for (let index = 0; index < results.length; index++) {
			const result = results[index];
			if (result.status === 'rejected') {
				const provider = providers[index];
				this._logService.warn(`[AgentService] initial provider catalog for ${provider.id} was unavailable; retrying before listing sessions`, result.reason);
				const retry = this._ensureLegacyChatsMigrated(provider, true);
				this._initialProviderMigrations.set(provider.id, retry);
				retries.push(retry);
			}
		}
		await Promise.all(retries);
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
	private _ensureLegacyChatsMigrated(provider: IAgent, force = false): Promise<void> {
		return this._ensureProviderCatalog(provider, this._providerMigrations, force, runForce => this._migrateLegacyProviderChats(provider, runForce));
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

	private async _registerDiscoveredChats(provider: IAgent, chats: readonly IAgentDiscoveredChat[]): Promise<boolean> {
		const existing = new Map((await this._listRegisteredSessions()).map(session => [session.session.toString(), session.external]));
		const discoveryLimiter = new Limiter<boolean>(4);
		let suppressed = 0;
		let registeredExternal = false;
		let alreadyRegistered = 0;
		let registryChanged = false;
		const results = await Promise.all(chats.map(({ external, ...metadata }) => discoveryLimiter.queue(async () => {
			const sessionMetadata = this._toSessionMetadata(metadata);
			const session = sessionMetadata.session;
			try {
				// Matching registry entries need no per-session I/O.
				const known = existing.get(session.toString());
				if (known !== undefined) {
					alreadyRegistered++;
					return false;
				}
				if (isSubagentSession(session.toString()) || await this._isChatBacking(session)) {
					suppressed++;
					return false;
				}
				const identity: IRegisteredSession = { session, provider: provider.id, startTime: metadata.startTime, external, source: external ? 'discovery' : 'restore' };
				const registered = await this._retryRegistryMutation(
					() => this._sessionRegistry.register(session, identity, { checkTombstone: true }),
					`discovery registration for ${session.toString()}`,
				);
				if (registered) {
					registryChanged = true;
					if (external && existing.get(session.toString()) !== true) {
						await this._initializeExternalSessionReadState(session);
					}
					existing.set(session.toString(), external);
					if (external && !readSessionEhcliAdoptable(sessionMetadata._meta)) {
						registeredExternal = true;
					} else {
						await this._announceSurfacedSession({ ...sessionMetadata, _meta: withSessionExternal(sessionMetadata._meta, external) }, provider.id);
					}
				} else {
					this._logService.trace(`[AgentService] discovery: ${session.toString()} was not registered (tombstoned)`);
				}
				return registered;
			} catch (err) {
				this._logService.warn(`[AgentService] Failed to register discovered chat ${session.toString()} for provider ${provider.id}`, err);
				return false;
			}
		})));
		const registered = results.filter(changed => changed).length;
		if (registryChanged) {
			this._invalidateSessionList();
		}
		if (registeredExternal) {
			this._queueSessionListReconciliation();
		}
		this._logService.info(`[AgentService] discovery for provider ${provider.id}: ${chats.length} candidate(s) (${chats.filter(chat => chat.external).length} external), ${registered} registered, ${alreadyRegistered} already registered, ${suppressed} suppressed as subagent/chat backing`);
		return registered > 0;
	}

	private async _migrateLegacyProviderChats(provider: IAgent, force = false): Promise<void> {
		if (!force) {
			if (await this._sessionRegistry.isProviderBackfilled(provider.id)) {
				return;
			}
			if (await this._sessionRegistry.isBackfilled()) {
				await this._sessionRegistry.markProviderBackfilled(provider.id);
				return;
			}
		}
		const sessions = await this._enumerateLegacyProviderSessions(provider);
		if (sessions === undefined) {
			throw new Error(`Provider ${provider.id} cannot enumerate its native session catalog yet`);
		}
		const existing = new Map((await this._listRegisteredSessions()).map(session => [session.session.toString(), session.external]));
		const migrationLimiter = new Limiter<IRegisteredSession | undefined>(4);
		const identities = await Promise.all(sessions.map(s => migrationLimiter.queue(async (): Promise<IRegisteredSession | undefined> => {
			if (isSubagentSession(s.session.toString()) || await this._isChatBacking(s.session)) {
				return undefined;
			}
			const external = await this._isExternalProviderChat(s.session);
			return { session: s.session, provider: provider.id, startTime: s.startTime, external, source: external ? 'discovery' : 'restore' };
		})));
		let registeredExternal = false;
		for (let index = 0; index < identities.length; index++) {
			const identity = identities[index];
			if (!identity) {
				continue;
			}
			const registered = await this._sessionRegistry.register(identity.session, identity, { checkTombstone: true });
			if (registered) {
				this._invalidateSessionList();
				const metadata = sessions[index];
				if (identity.external && existing.get(identity.session.toString()) !== true) {
					await this._initializeExternalSessionReadState(identity.session);
				}
				existing.set(identity.session.toString(), identity.external);
				if (identity.external && !readSessionEhcliAdoptable(metadata._meta)) {
					registeredExternal = true;
				} else {
					await this._announceSurfacedSession({ ...metadata, _meta: withSessionExternal(metadata._meta, identity.external) }, provider.id);
				}
			}
		}
		await this._sessionRegistry.markProviderBackfilled(provider.id);
		if (registeredExternal) {
			this._queueSessionListReconciliation();
		}
	}

	/** Seeds external sessions as read. Avoiding this DB requires a durable registry default. */
	private async _initializeExternalSessionReadState(session: URI): Promise<void> {
		const ref = this._sessionDataService.openDatabase(session);
		try {
			await ref.object.setMetadata(AH_META_IS_READ_DB_KEY, 'true');
		} finally {
			ref.dispose();
		}
	}

	private async _isExternalProviderChat(session: URI): Promise<boolean> {
		const ref = await this._sessionDataService.tryOpenDatabase(session);
		if (!ref) {
			return true;
		}

		try {
			return await ref.object.getMetadata(AH_META_WORKSPACELESS_DB_KEY) === undefined;
		} finally {
			ref.dispose();
		}
	}

	private async _migrateRegisteredSession(entry: IStoredRegisteredSession): Promise<IRegisteredSession | undefined> {
		if (entry.external !== undefined) {
			return undefined;
		}
		const external = await this._isExternalProviderChat(entry.session);
		return {
			...entry,
			external,
			source: external ? 'discovery' : entry.source,
		};
	}

	private _listRegisteredSessions(): Promise<readonly IRegisteredSession[]> {
		return this._sessionRegistry.list(entry => this._migrateRegisteredSession(entry));
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
	private async _filterKnownSessions(sessions: readonly URI[]): Promise<ReadonlySet<string>> {
		const registered = await this._sessionRegistry.listSessionKeys();
		const known = new Set<string>();
		for (const session of sessions) {
			const key = session.toString();
			if (registered.has(key)) {
				known.add(key);
			}
		}
		return known;
	}

	/**
	 * Whether a session is marked as an internal chat backing, either durably
	 * or in `_unpersistedChatBackings`.
	 */
	private async _isChatBacking(session: URI): Promise<boolean> {
		if (this._unpersistedChatBackings.has(session.toString())) {
			return true;
		}
		try {
			const ref = await this._sessionDataService.tryOpenDatabase(session);
			if (!ref) {
				return false;
			}
			try {
				return !!(await ref.object.getMetadata(CHAT_BACKING_METADATA_KEY));
			} finally {
				ref.dispose();
			}
		} catch {
			return false;
		}
	}
	/** In-flight list computations, shared per mode until they settle or the registry changes. */
	private readonly _inFlightListSessions = new Map<AgentHostExternalSessionsMode, { readonly epoch: number; readonly promise: Promise<readonly IAgentSessionMetadata[]> }>();

	private _registryEpoch = 0;

	private _invalidateSessionList(): void {
		this._registryEpoch++;
		this._inFlightListSessions.clear();
	}

	async listSessions(mode = this._getExternalSessionsMode()): Promise<IAgentSessionMetadata[]> {
		const epoch = this._registryEpoch;
		const inFlight = this._inFlightListSessions.get(mode);
		if (inFlight && inFlight.epoch === epoch) {
			// Callers own their array; the shared result must not be mutable by one of them.
			return [...await inFlight.promise];
		}
		const promise = this._computeSessions(mode);
		const entry = { epoch, promise };
		this._inFlightListSessions.set(mode, entry);
		const clear = () => {
			if (this._inFlightListSessions.get(mode) === entry) {
				this._inFlightListSessions.delete(mode);
			}
		};
		void promise.then(clear, clear);
		return [...await promise];
	}

	private async _computeSessions(mode: AgentHostExternalSessionsMode): Promise<readonly IAgentSessionMetadata[]> {
		this._logService.trace('[AgentService] listSessions computation started');
		const startedAt = Date.now();
		// The first list waits for registration-time legacy migration if it is still in flight.
		await this._awaitInitialProviderMigration();
		// The registry is the source of truth for top-level sessions. Internal
		// chat backings and subagent sessions never enter it, and a transiently
		// missing provider snapshot no longer evicts a session.
		const registered = await this._listRegisteredSessions();
		const metadataLimiter = new Limiter<IAgentSessionMetadata | undefined>(4);
		const results = await Promise.all(registered.map(registeredSession => metadataLimiter.queue(async (): Promise<IAgentSessionMetadata | undefined> => {
			const { session, provider, external } = registeredSession;
			// Idle provisional sessions stay hidden until they materialize or gain
			// turn activity (#321269). The state-manager overlay below re-surfaces
			// them then.
			if (this._stateManager.isIdleProvisionalSession(session.toString())) {
				return undefined;
			}

			const agent = this._providers.get(provider);
			if (!agent) {
				return undefined;
			}
			try {
				return await this._registeredSessionMetadata(agent, session, external);
			} catch (err) {
				this._logService.warn(`[AgentService] listSessions: failed to read metadata for ${session}`, err);
				return undefined;
			}
		})));
		const flat = results.filter((s): s is IAgentSessionMetadata => s !== undefined);

		// Overlay persisted custom titles from per-session databases.
		const overlayLimiter = new Limiter<IAgentSessionMetadata | undefined>(4);
		const overlaid = await Promise.all(flat.map(s => overlayLimiter.queue(async (): Promise<IAgentSessionMetadata | undefined> => {
			const sanitized = { ...s, _meta: withSessionMultiRootMetadata(s._meta, undefined) };
			// A backing session whose durable marker write kept failing is
			// suppressed in-process (see `_unpersistedChatBackings`); check
			// this before touching the DB so it is filtered the same way
			// whether or not the marker ever made it to disk.
			if (this._unpersistedChatBackings.has(s.session.toString())) {
				return undefined;
			}
			try {
				const ref = await this._sessionDataService.tryOpenDatabase(s.session);
				if (!ref) {
					return sanitized;
				}
				try {
					// Batch the always-required keys (title / read / archive
					// flags) with any keys the changeset coordinator asks for
					// so the session DB is hit exactly once. The coordinator
					// returns `undefined` when a live source can already
					// answer the catalogue question, avoiding the
					// potentially-large persisted blobs entirely.
					const sessionStr = s.session.toString();
					const changesetKeys = this._changesetCoordinator.getListMetadataKeys(sessionStr);
					const metadataKeys: Record<string, true> = changesetKeys
						? { customTitle: true, [AH_META_IS_READ_DB_KEY]: true, [AH_META_IS_ARCHIVED_DB_KEY]: true, [AH_META_IS_DONE_DB_KEY]: true, [AH_META_ORCHESTRATION_DB_KEY]: true, [AH_META_WORKSPACELESS_DB_KEY]: true, [SESSION_META_MULTI_ROOT_KEY]: true, [SESSION_META_FOLDER_PICKER_KEY]: true, [CHAT_BACKING_METADATA_KEY]: true, [WORKTREE_META_REPOSITORY_ROOT]: true, ...GIT_DB_METADATA_KEYS, ...changesetKeys }
						: { customTitle: true, [AH_META_IS_READ_DB_KEY]: true, [AH_META_IS_ARCHIVED_DB_KEY]: true, [AH_META_IS_DONE_DB_KEY]: true, [AH_META_ORCHESTRATION_DB_KEY]: true, [AH_META_WORKSPACELESS_DB_KEY]: true, [SESSION_META_MULTI_ROOT_KEY]: true, [SESSION_META_FOLDER_PICKER_KEY]: true, [CHAT_BACKING_METADATA_KEY]: true, [WORKTREE_META_REPOSITORY_ROOT]: true, ...GIT_DB_METADATA_KEYS };
					const m = await ref.object.getMetadataObject(metadataKeys);
					// This session is an internal peer-chat backing (e.g. a
					// Claude peer chat's SDK session, enumerated by the agent's
					// own `listSessions`). Drop it so it never leaks as a
					// standalone top-level session — mirrors the subagent filter
					// on the state-manager overlay path below.
					if (m[CHAT_BACKING_METADATA_KEY]) {
						return undefined;
					}
					let updated = sanitized;
					if (m.customTitle) {
						updated = { ...updated, summary: m.customTitle };
					}
					// `isDone` is the legacy key for `isArchived`.
					if (m[AH_META_IS_READ_DB_KEY] !== undefined) {
						updated = { ...updated, status: withSessionStatusFlag(updated.status ?? SessionStatus.Idle, SessionStatus.IsRead, m[AH_META_IS_READ_DB_KEY] === 'true') };
					}
					const persistedArchived = m[AH_META_IS_ARCHIVED_DB_KEY] ?? m[AH_META_IS_DONE_DB_KEY];
					if (persistedArchived !== undefined) {
						updated = { ...updated, status: withSessionStatusFlag(updated.status ?? SessionStatus.Idle, SessionStatus.IsArchived, persistedArchived === 'true') };
					}
					const orchestration = parseSessionOrchestration(m[AH_META_ORCHESTRATION_DB_KEY]);
					if (orchestration) {
						updated = { ...updated, _meta: withSessionOrchestration(updated._meta, orchestration) };
					}
					if (m[META_GIT_STATE]) {
						try {
							const gitState = JSON.parse(m[META_GIT_STATE]) as ISessionGitState;
							updated = { ...updated, _meta: withSessionGitState(updated._meta, gitState) };
						} catch (e) {
							this._logService.warn(`[AgentService][listSessions] Failed to parse Git state for ${s.session}`, e);
						}
					}
					if (m[META_GITHUB_STATE]) {
						try {
							const gitHubState = JSON.parse(m[META_GITHUB_STATE]) as ISessionGitHubState;
							updated = { ...updated, _meta: withSessionGitHubState(updated._meta, gitHubState) };
						} catch (e) {
							this._logService.warn(`[AgentService][listSessions] Failed to parse GitHub state for ${s.session}`, e);
						}
					}
					if (m[META_SOURCE_CONTROL_STATE]) {
						try {
							const sourceControlState = parsePersistedSourceControlState(m[META_SOURCE_CONTROL_STATE]);
							updated = { ...updated, _meta: withSessionSourceControlState(updated._meta, sourceControlState) };
						} catch (e) {
							this._logService.warn(`[AgentService][listSessions] Failed to parse source-control state for ${s.session}`, e);
						}
					}

					if (m[AH_META_WORKSPACELESS_DB_KEY] !== undefined) {
						updated = { ...updated, _meta: withSessionWorkspaceless(updated._meta, m[AH_META_WORKSPACELESS_DB_KEY] === 'true') };
					}
					const multiRoot = parseSessionMultiRootMetadata(m[SESSION_META_MULTI_ROOT_KEY]);
					if (multiRoot) {
						updated = { ...updated, _meta: withSessionMultiRootMetadata(updated._meta, multiRoot) };
					}
					const folderPickerDecision = parseSessionFolderPickerDecision(m[SESSION_META_FOLDER_PICKER_KEY]);
					if (folderPickerDecision) {
						updated = { ...updated, _meta: withSessionFolderPickerDecision(updated._meta, folderPickerDecision) };
					}

					// Use the persisted root as-is to keep listing off Git; the metadata reader re-canonicalizes it on open.
					const worktreeProject = worktreeProjectFromRepositoryRoot(m[WORKTREE_META_REPOSITORY_ROOT]);
					if (worktreeProject) {
						updated = { ...updated, project: worktreeProject };
					}

					return this._changesetCoordinator.decorateListEntry(updated, m as Record<string, string | undefined>);
				} finally {
					ref.dispose();
				}
			} catch (e) {
				this._logService.warn(`[AgentService] Failed to read session metadata overlay for ${s.session}`, e);
			}
			return sanitized;
		})));
		const result = overlaid.filter((s): s is IAgentSessionMetadata => s !== undefined);

		// Overlay live session state from the state manager.
		// For the title, prefer the state manager's value when it is
		// non-empty, so SDK-sourced titles are not overwritten by the
		// initial empty placeholder. The default changeset catalogue lives
		// on `state.changesets` (seeded after `createSession` /
		// `restoreSession` and refreshed after each compute pass) and the
		// chip aggregate on the catalog summary's `changes`; both must be
		// surfaced here so a fresh `listSessions` call returns the same values
		// subscribers see via the per-session action stream and
		// `notify/sessionSummaryChanged`.
		const withStatus = result.map(s => {
			const liveSummary = this._stateManager.getSessionSummary(s.session.toString());
			if (liveSummary) {
				return this._withLiveSessionMetadata(s, liveSummary);
			}
			return s;
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
		const known = new Set(withStatus.map(s => s.session.toString()));
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
			additions.push({
				session: URI.parse(summary.resource),
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
				...(summary._meta !== undefined ? { _meta: summary._meta } : {}),
			});
		}
		const combined = additions.length > 0 ? [...withStatus, ...additions] : withStatus;
		const now = this._now();
		const recentSessionKeys = mode === AgentHostExternalSessionsMode.Recent
			? this._getRecentSessionKeys(combined, now)
			: undefined;
		const visible: IAgentSessionMetadata[] = [];
		// Adoptable-legacy rows are withheld by migrate-legacy, not by the external mode.
		let hiddenByExternalMode = 0;
		for (const session of combined) {
			if (this._shouldIncludeSession(session, mode, now, recentSessionKeys)) {
				visible.push(session);
			} else if (!readSessionEhcliAdoptable(session._meta)) {
				hiddenByExternalMode++;
			}
		}
		this._logHiddenSessions(hiddenByExternalMode, combined.length, mode);

		// A catalog pass opens every registered session's database, so it can be slow.
		const duration = Date.now() - startedAt;
		const message = `[AgentService] listSessions computed ${visible.length} of ${combined.length} session(s) for mode '${mode}' in ${duration}ms (${additions.length} state-manager fallback)`;
		if (duration >= SLOW_LIST_SESSIONS_THRESHOLD_MS) {
			this._logService.info(message);
		} else {
			this._logService.trace(message);
		}
		return visible;
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
		return this._configurationService.getRootValue(platformRootSchema, AgentHostShowExternalSessionsConfigKey) ?? AgentHostExternalSessionsMode.None;
	}

	private _getRecentSessionKeys(sessions: readonly IAgentSessionMetadata[], now: number): ReadonlySet<string> {
		const recentExternalSessions = sessions
			.filter(session => readSessionExternal(session._meta)
				&& !readSessionEhcliAdoptable(session._meta)
				&& session.modifiedTime >= now - 7 * DAY_MS)
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

	private _shouldIncludeSession(
		session: IAgentSessionMetadata,
		mode = this._getExternalSessionsMode(),
		now = this._now(),
		recentSessionKeys?: ReadonlySet<string>,
	): boolean {
		// While migration is off, un-adopted adoptable-legacy sessions belong to the extension-host provider — exclude so a refresh cannot re-surface an unopenable row.
		if (readSessionEhcliAdoptable(session._meta) && !this._isMigrateLegacyEnabled()) {
			return false;
		}
		if (!readSessionExternal(session._meta) || readSessionEhcliAdoptable(session._meta)) {
			return true;
		}
		switch (mode) {
			case AgentHostExternalSessionsMode.Recent:
				return session.modifiedTime >= now - 7 * DAY_MS
					&& (recentSessionKeys === undefined || recentSessionKeys.has(session.session.toString()));
			case AgentHostExternalSessionsMode.All:
				return true;
			case AgentHostExternalSessionsMode.Last24Hours:
				return session.modifiedTime >= now - DAY_MS;
			case AgentHostExternalSessionsMode.Last7Days:
				return session.modifiedTime >= now - 7 * DAY_MS;
			case AgentHostExternalSessionsMode.None:
				return false;
		}
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

	/** Tracks the migrate-legacy setting so the config listener acts only on transitions. */
	private _lastMigrateLegacyEnabled = false;

	private _isMigrateLegacyEnabled(): boolean {
		return this._configurationService.getRootValue(platformRootSchema, AgentHostMigrateLegacyCopilotCliEnabledConfigKey) === true;
	}

	private _isAgentMergeEnabled(): boolean {
		return this._configurationService.getRootValue(agentMergeRootConfigSchema, AgentMergeConfigKey.Enabled) === true;
	}

	/** Retracts un-opened adoptable-legacy entries when migration is turned off (deletes no data). */
	private _onMigrateLegacySettingChanged(): void {
		const enabled = this._isMigrateLegacyEnabled();
		if (enabled === this._lastMigrateLegacyEnabled) {
			return;
		}
		this._lastMigrateLegacyEnabled = enabled;
		if (enabled) {
			return; // turning on re-surfaces through the normal discovery / list path
		}
		for (const key of [...this._announcedSurfacedKeys]) {
			if (this._stateManager.getSessionState(key)) {
				continue; // already adopted / restored — keep it
			}
			if (!readSessionEhcliAdoptable(this._stateManager.getSurfacedSessionSummary(key)?._meta)) {
				continue; // only retract adoptable-legacy entries, never native / external ones
			}
			this._announcedSurfacedKeys.delete(key);
			this._broadcastExternalSessions.delete(key);
			this._stateManager.retractSurfacedSession(key);
		}
	}

	private _queueSessionListReconciliation(previousMode?: AgentHostExternalSessionsMode): void {
		this._sessionListReconciliation = this._sessionListReconciliation
			.then(() => this._reconcileExternalSessions(previousMode))
			.catch(error => this._logService.warn('[AgentService] External session reconciliation failed', error));
	}

	private async _reconcileExternalSessions(previousMode?: AgentHostExternalSessionsMode): Promise<void> {
		const startedAt = Date.now();
		const previouslyBroadcast = new Set(this._broadcastExternalSessions);
		const listed = previousMode !== undefined
			? this._resolveModeChangeVisibility(await this.listSessions(AgentHostExternalSessionsMode.All), previousMode, previouslyBroadcast)
			: await this.listSessions();
		const visible = new Set<string>();
		let published = 0;
		for (const metadata of listed) {
			if (!readSessionExternal(metadata._meta)) {
				continue;
			}
			const key = metadata.session.toString();
			visible.add(key);
			if (!previouslyBroadcast.has(key)) {
				published++;
				if (this._stateManager.getSessionState(key)) {
					this._stateManager.setSessionSummaryPublished(key, true);
				} else {
					const provider = AgentSession.provider(metadata.session);
					if (provider) {
						await this._announceSurfacedSession(metadata, provider);
					}
				}
			}
		}
		let retracted = 0;
		for (const key of previouslyBroadcast) {
			if (!visible.has(key)) {
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
		for (const key of visible) {
			this._broadcastExternalSessions.add(key);
		}
		const duration = Date.now() - startedAt;
		const message = `[AgentService] External session reconciliation done in ${duration}ms (mode: '${this._getExternalSessionsMode()}'${previousMode !== undefined ? `, previous: '${previousMode}'` : ''}): ${published} published, ${retracted} retracted, ${visible.size} visible`;
		// A prompt no-op pass is steady-state noise.
		if (published > 0 || retracted > 0 || duration >= SLOW_LIST_SESSIONS_THRESHOLD_MS) {
			this._logService.info(message);
		} else {
			this._logService.trace(message);
		}
	}

	/**
	 * Derives both the previous and current mode's visible sets from one catalog
	 * pass, since {@link AgentHostExternalSessionsMode.All} is a superset of every
	 * mode and the mode is just a parameter to {@link _shouldIncludeSession}.
	 * Adds what `previousMode` had published into `previouslyBroadcast`.
	 */
	private _resolveModeChangeVisibility(
		superset: readonly IAgentSessionMetadata[],
		previousMode: AgentHostExternalSessionsMode,
		previouslyBroadcast: Set<string>,
	): IAgentSessionMetadata[] {
		const now = this._now();
		const recentKeysFor = (mode: AgentHostExternalSessionsMode) => mode === AgentHostExternalSessionsMode.Recent
			? this._getRecentSessionKeys(superset, now)
			: undefined;

		const previousRecentKeys = recentKeysFor(previousMode);
		for (const session of superset) {
			if (readSessionExternal(session._meta) && this._shouldIncludeSession(session, previousMode, now, previousRecentKeys)) {
				previouslyBroadcast.add(session.session.toString());
			}
		}

		const mode = this._getExternalSessionsMode();
		const recentKeys = recentKeysFor(mode);
		const visible = superset.filter(session => this._shouldIncludeSession(session, mode, now, recentKeys));
		// The pass ran as `All`, so report the mode actually in effect instead.
		this._logHiddenSessions(superset.length - visible.length, superset.length, mode);
		return visible;
	}

	private async _announceSurfacedSession(meta: IAgentSessionMetadata, provider: string): Promise<void> {
		const key = meta.session.toString();
		if (!this._shouldIncludeSession(meta) || this._announcedSurfacedKeys.has(key) || this._stateManager.getSessionState(key)) {
			return;
		}
		this._announcedSurfacedKeys.add(key);
		try {
			if (await this._sessionRegistry.isTombstoned(meta.session)) {
				this._announcedSurfacedKeys.delete(key);
				return;
			}
			// The migrate setting may have flipped off during the await above; re-check so an adoptable-legacy session is never surfaced while migration is off.
			if (!this._shouldIncludeSession(meta)) {
				this._announcedSurfacedKeys.delete(key);
				return;
			}
			this._stateManager.announceSurfacedSession(this._surfacedSessionSummary(meta, provider));
			if (readSessionExternal(meta._meta)) {
				this._broadcastExternalSessions.add(key);
			}
		} catch (err) {
			this._announcedSurfacedKeys.delete(key);
			throw err;
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

	async createSession(config?: IAgentCreateSessionConfig): Promise<URI> {
		const providerId = config?.provider ?? this._defaultProvider;
		const provider = providerId ? this._providers.get(providerId) : undefined;
		if (!provider) {
			throw new Error(`No agent provider registered for: ${providerId ?? '(none)'}`);
		}
		if (config?.session) {
			this._cancelPendingSessionGc(config.session);
			this._cancelPendingSessionRelease(config.session);
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
				this._logService.warn(`[AgentService] Provider '${providerId}' does not advertise multipleWorkingDirectories; truncating ${config.workingDirectories.length} working directories to 1.`);
				config = { ...config, workingDirectories: [config.workingDirectories[0]] };
			}
		}

		// When forking, build the old→new turn ID mapping before creating the
		// session so the agent can use it to remap per-turn data. If the
		// source has no turns to copy (e.g. a still-provisional session), a
		// "fork" is indistinguishable from a fresh session, so we drop the
		// fork parameter and fall through to the regular create path.
		if (config?.fork) {
			const sourceState = this._stateManager.getSessionState(config.fork.session.toString());
			const sourceTurns = sourceState?.turns.slice(0, config.fork.turnIndex + 1) ?? [];
			if (sourceTurns.length === 0) {
				config = { ...config, fork: undefined };
			} else {
				const turnIdMapping = new Map<string, string>();
				for (const t of sourceTurns) {
					turnIdMapping.set(t.id, generateUuid());
				}
				// The SDK fork boundary must be a concrete (SDK-backed) turn.
				// When the client forked at a host-injected local turn
				// (`/rename` / `!command`), redirect the agent to the preceding
				// concrete turn while still seeding the local turns up to the
				// fork point into the new session's protocol state below.
				const concreteForkTurnId = this._localTurns.resolveConcreteTurnId(buildDefaultChatUri(config.fork.session).toString(), config.fork.turnId);
				config = {
					...config,
					fork: {
						...config.fork,
						chat: URI.parse(buildDefaultChatUri(config.fork.session)),
						turnIdMapping,
						...(concreteForkTurnId !== undefined ? { turnId: concreteForkTurnId } : {}),
					},
				};
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
		const deferWorktreeCreation = sessionConfig?.values?.[SessionConfigKey.Isolation] === 'worktree' && !config?.fork && !config?.importConversation;

		this._logService.trace(`[AgentService] createSession: initializing auto-approver and creating session...`);
		const [, created] = await Promise.all([
			initializeSideEffects,
			this._createProviderSession(provider, config, deferWorktreeCreation),
		]);
		const session = created.session;
		this._logService.trace(`[AgentService] createSession: initialization complete`);
		try {
			await this._retryRegistryMutation(
				() => this._sessionRegistry.register(session, { provider: provider.id, startTime: Date.now(), source: 'explicit' }, { checkTombstone: false }),
				`registration for ${session.toString()}`,
			);
			this._invalidateSessionList();
		} catch (err) {
			await this._rollbackProviderSession(provider, session);
			throw err;
		}

		// Cancel any pending GC armed for this URI. A client may be
		// re-issuing `createSession` for an existing URI mid-grace (e.g.
		// during a reconnect that returned `missing`); without this, the
		// timer would still fire and dispose the just-revived session
		// before the follow-up `subscribe` arrives.
		this._cancelPendingSessionGc(session);
		this._cancelPendingSessionRelease(session);

		this._logService.trace(`[AgentService] createSession: provider=${provider.id} model=${config?.model?.id ?? '(default)'}`);
		this._sessionToProvider.set(session.toString(), provider.id);

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
		const provisionalState = created.provisional && !config?.fork && !config?.importConversation
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
		const defaultChat = URI.parse(buildDefaultChatUri(session));
		const workingDirectories = config?.workingDirectories;
		const [initialCustomizations, folderPickerDecision] = await Promise.all([
			provider.getChatCustomizations(defaultChat, this._chatContext(session, defaultChat), this._hostCustomizations(session)).catch(err => {
				this._logService.error('[AgentService] createSession: failed to resolve initial customizations', err);
				return undefined;
			}),
			// The harness owns the Folder-picker decision (it is provider-specific),
			// derived from the ordered working-directory set. Only meaningful for a
			// fresh (non-fork, non-import) multi-root session — the picker never
			// shows with a single folder — and seeded into `_meta` below.
			workingDirectories && workingDirectories.length > 1 && !config?.fork && !config?.importConversation && provider.computeFolderPickerDecision
				? provider.computeFolderPickerDecision(workingDirectories).catch(err => {
					// Fail open: on an indeterminate scan error, show the picker rather
					// than silently hiding it and pinning the default (index 0) folder.
					this._logService.error('[AgentService] createSession: failed to compute folder-picker decision', err);
					return { hidden: false };
				})
				: Promise.resolve(undefined),
		]);

		// When forking, populate the new session's protocol state with
		// the source session's turns so the client sees the forked history.
		if (config?.fork) {
			const sourceState = this._stateManager.getSessionState(config.fork.session.toString());
			const sourceChatUri = buildDefaultChatUri(config.fork.session).toString();
			const newChatUri = buildDefaultChatUri(session).toString();
			let sourceTurns: Turn[] = [];
			if (sourceState && config.fork.turnIdMapping) {
				const originalSlice = sourceState.turns.slice(0, config.fork.turnIndex + 1);
				const mapping = config.fork.turnIdMapping;
				sourceTurns = originalSlice.map(t => ({ ...t, id: mapping.get(t.id) ?? generateUuid() }));
				// Re-persist forked local turns (`/rename`, `!command`) under the
				// new session's default chat. `record` (keyed by turn id)
				// overwrites any rows a DB copy carried with the SOURCE chat URI,
				// and seeds the in-memory index for same-process fork/truncate.
				this._persistForkedLocalTurns(session.toString(), sourceChatUri, newChatUri, originalSlice, sourceTurns, mapping);
			}

			// Prefix the forked session's title so consumers (sidebar, chat
			// model) can distinguish it from the source without each surface
			// reinventing the convention. Avoid double-prefixing when a user
			// forks an already-forked session.
			const forkedTitlePrefix = localize('agentHost.forkedTitlePrefix', "Forked: ");
			const sourceTitle = sourceState?.title;
			const forkedTitle = sourceTitle
				? (sourceTitle.startsWith(forkedTitlePrefix) ? sourceTitle : `${forkedTitlePrefix}${sourceTitle}`)
				: localize('agentHost.forkedSessionFallback', "Forked Session");
			const summary = this._buildInitialSummary(provider, session, config, created, forkedTitle);
			const state = this._stateManager.createSession(summary);
			state.config = sessionConfig;
			this._stateManager.seedDefaultChatTurns(summary.resource, sourceTurns);
			state.activeClients = config.activeClient ? [config.activeClient] : [];

			// Refine the forked session's placeholder `Forked: …` title into one
			// derived from the inherited chat. Forks seed pre-existing
			// turns, so the normal first-message/first-turn title generation
			// never fires for them — this is the fork-time equivalent.
			if (sourceTurns.length > 0) {
				this._sideEffects.generateForkedTitle(summary.resource, undefined, sourceTurns, forkedTitle, sourceTitle);
			}
		} else if (config?.importConversation) {
			// An imported conversation arrives with pre-existing turns (assigned
			// fresh UUID ids above). Seed them into the new session's protocol
			// state so the client renders the imported history immediately; the
			// provider has already seeded the matching SDK event log so those
			// turns are editable / forkable / truncatable.
			const importedTurns = [...config.importConversation.turns];
			const importedTitle = this._buildImportedTitle(importedTurns);
			const summary = this._buildInitialSummary(provider, session, config, created, importedTitle);
			const state = this._stateManager.createSession(summary);
			state.config = sessionConfig;
			this._stateManager.seedDefaultChatTurns(summary.resource, importedTurns);
			state.activeClients = config.activeClient ? [config.activeClient] : [];

			// Refine the placeholder title into one generated from the imported
			// conversation, mirroring forks. Imports seed pre-existing turns, so
			// the normal first-message title generation never fires; without this
			// the session would keep showing the raw first-message clip while
			// sibling sessions show clean generated titles — making imports look
			// like a different kind of session.
			if (importedTurns.length > 0) {
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
		this._serverToolHost.advertise(session.toString());
		// Persist resolved config values for restore. Mid-session updates are
		// persisted by `AgentSideEffects` on `SessionConfigChanged`.
		if (sessionConfig?.values && Object.keys(sessionConfig.values).length > 0 && !created.provisional) {
			this._persistConfigValues(session, sessionConfig.values);
		}

		this._changesetCoordinator.onSessionCreated(session.toString());

		if (!created.provisional) {
			// Persist the host-owned workspace-less marker once the session DB
			// exists; provisional sessions defer this to `_onDidMaterializeChat`.
			this._persistWorkspaceless(session, readSessionWorkspaceless(this._stateManager.getSessionSummary(session.toString())?._meta));
			this._persistMultiRoot(session, readSessionMultiRootMetadata(this._stateManager.getSessionSummary(session.toString())?._meta));
			this._persistFolderPickerDecision(session, readSessionFolderPickerDecision(this._stateManager.getSessionSummary(session.toString())?._meta));

			// `SessionReady` means the agent has a live SDK session. Provisional
			// sessions defer it to {@link _onDidMaterializeChat}.
			this._stateManager.dispatchServerAction(session.toString(), { type: ActionType.SessionReady });
			const gitHubState = readSessionGitHubState(this._stateManager.getSessionSummary(session.toString())?._meta);
			if (gitHubState) {
				await this._gitStateService.setSessionGitHubState(session.toString(), gitHubState);
			}
		}

		const workingDirectory = created.resolvedWorkingDirectory ?? config?.workingDirectories?.[0];
		void this._gitStateService.refreshSessionGitState(session.toString(), workingDirectory);

		return session;
	}

	async createChat(session: URI, chat: URI, options?: IAgentCreateChatOptions): Promise<void> {
		const sessionKey = session.toString();
		const provider = this._findProviderForSession(session);
		if (!provider) {
			throw new Error(`[AgentService] createChat: no provider for session ${sessionKey}`);
		}
		if (!this._supportsChats(provider)) {
			throw new Error(`[AgentService] createChat: provider ${provider.id} does not support multiple chats`);
		}
		// When forking, resolve the source chat's turns up to the fork point and
		// mint fresh turn IDs for the new chat. The agent uses the mapping to
		// remap per-turn data in the forked chat; the seeded turns make
		// the new chat surface the forked history immediately.
		let forkedTurns: Turn[] | undefined;
		let forkedTitle: string | undefined;
		let forkedSourceTitle: string | undefined;
		let createOptions = options;
		// Persist exhaustive provenance for peer chats. Fresh user-created chats
		// leave this undefined and default to `ChatOriginKind.User`.
		let peerChatOrigin: ChatOrigin | undefined;
		if (options?.sideChat) {
			const resolvedSideChat = await this._resolveSideChatOrigin(session, options.sideChat);
			peerChatOrigin = resolvedSideChat.origin;
			createOptions = {
				...options,
				sideChat: {
					...options.sideChat,
					source: URI.parse(resolvedSideChat.sourceChat),
					...(resolvedSideChat.providerAnchorTurnId ? { providerAnchorTurnId: resolvedSideChat.providerAnchorTurnId } : {}),
					...(resolvedSideChat.sourceContext ? { sourceContext: resolvedSideChat.sourceContext } : {}),
					...(resolvedSideChat.partialResponse ? { partialResponse: resolvedSideChat.partialResponse } : {}),
				},
			};
		}
		if (options?.fork) {
			const { sourceChatKey, sourceSessionKey, sourceState } = await this._resolveSessionSourceChat(options.fork.source);
			if (this._stateManager.getChatOrigin(sourceChatKey)?.kind === ChatOriginKind.Tool) {
				throw new Error(`[AgentService] createChat: cannot fork provider-spawned chat ${sourceChatKey}`);
			}
			const sourceTurns = sourceState?.turns ?? [];
			const forkIndex = sourceTurns.findIndex(t => t.id === options.fork!.turnId);
			if (forkIndex < 0) {
				// The fork point is unknown, so a fork is indistinguishable from a
				// fresh chat. Drop the fork to avoid the provider inheriting the
				// whole backend chat while the UI is seeded with no turns.
				createOptions = { ...options, fork: undefined };
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
				peerChatOrigin = { kind: ChatOriginKind.Fork, chat: sourceChatKey, turnId: options.fork.turnId };

				// Carry forked host-injected local turns (`/rename`, `!command`)
				// into the new chat so they survive reload and anchor future
				// fork/truncate.
				this._persistForkedLocalTurns(sessionKey, sourceChatKey, chat.toString(), slice, forkedTurns, turnIdMapping);

				const forkedTitlePrefix = localize('agentHost.forkedTitlePrefix', "Forked: ");
				forkedSourceTitle = sourceState?.title || this._stateManager.getSessionState(sourceSessionKey)?.title;
				forkedTitle = forkedSourceTitle
					? (forkedSourceTitle.startsWith(forkedTitlePrefix) ? forkedSourceTitle : `${forkedTitlePrefix}${forkedSourceTitle}`)
					: localize('agentHost.forkedChatFallback', "Forked Chat");
				// The SDK fork boundary must be a concrete (SDK-backed) turn. When
				// the client forked at a host-injected local turn, redirect the
				// agent to the preceding concrete turn (the local turns are still
				// seeded into the new chat's protocol state above).
				const concreteForkTurnId = this._localTurns.resolveConcreteTurnId(sourceChatKey, options.fork.turnId);
				createOptions = {
					...options,
					fork: {
						...options.fork,
						source: URI.parse(sourceChatKey),
						turnIdMapping,
						...(concreteForkTurnId !== undefined ? { turnId: concreteForkTurnId } : {}),
					},
				};
			}
		}

		// Create the backing chat before publishing `session/chatAdded` so
		// subscribers only see a chat that can already receive messages.
		const createResult = await this._createChat(provider, chat, session, createOptions);
		const providerData = createResult?.providerData;
		try {
			await this._persistPeerChat(session, chat, providerData, peerChatOrigin);
		} catch (error) {
			try {
				await provider.chats.disposeChat(chat, this._chatContext(session, chat));
			} catch (rollbackError) {
				throw new AggregateError([error, rollbackError], `Failed to persist and roll back chat ${chat.toString()}`);
			}
			throw error;
		}

		this._stateManager.addChat(sessionKey, chat.toString(), {
			...(forkedTitle !== undefined ? { title: forkedTitle } : options?.title !== undefined ? { title: options.title } : {}),
			...(forkedTurns !== undefined ? { turns: forkedTurns } : {}),
			...(providerData !== undefined ? { providerData } : {}),
			...(peerChatOrigin !== undefined ? { origin: peerChatOrigin } : {}),
		});

		// If the agent exposes this chat as its own SDK session, mark that
		// backing so it stays out of the top-level session list. `_markChatBacking`
		// retries durably and falls back to in-process suppression on continued
		// failure, so it never throws here — this must never turn an
		// already-created, already-announced chat into a failed `createChat`.
		if (createResult?.backingSession) {
			await this._markChatBacking(createResult.backingSession, chat);
		}

		// Refine the forked chat's placeholder `Forked: …` title into one
		// derived from the inherited chat. Forks seed pre-existing
		// turns, so the normal first-message/first-turn title generation never
		// fires for them — this is the fork-time equivalent.
		if (forkedTurns && forkedTurns.length > 0 && forkedTitle !== undefined) {
			this._sideEffects.generateForkedTitle(sessionKey, chat.toString(), forkedTurns, forkedTitle, forkedSourceTitle);
		}
	}

	/**
	 * Validates a side chat's source and returns its {@link ChatOriginKind.SideChat}
	 * origin. Throws when the source chat is not part of `session` or when the
	 * referenced completed or active turn is absent.
	 */
	private async _resolveSideChatOrigin(session: URI, sideChat: IAgentCreateChatSideChatSource): Promise<{ origin: ChatOrigin; sourceChat: string; selection?: IAgentCreateChatSideChatSelection; providerAnchorTurnId?: string; sourceContext?: string; partialResponse?: string }> {
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
		const isLocalSourceTurn = !activeTurn && this._localTurns.isLocal(sourceChatKey, sideChat.turnId);
		const providerAnchorTurnId = isLocalSourceTurn ? this._localTurns.resolveConcreteTurnId(sourceChatKey, sideChat.turnId) : undefined;
		const partialResponse = getSideChatPartialResponse(activeTurn);
		const sourceContext = (activeTurn || isLocalSourceTurn)
			? buildBoundedSideChatSourceContext(sourceState?.turns ?? [], sideChat.turnId, activeTurn)
			: undefined;
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
			...(selection ? { selection } : {}),
			...(providerAnchorTurnId ? { providerAnchorTurnId } : {}),
			...(sourceContext ? { sourceContext } : {}),
			...(partialResponse ? { partialResponse } : {}),
		};
	}

	private async _resolveSessionSourceChat(source: URI): Promise<{ sourceChatKey: string; sourceSessionKey: string; sourceState: ReturnType<AgentHostStateManager['getChatState']> | undefined }> {
		const sourceKey = source.toString();
		const sourceSessionKey = isAhpChatChannel(sourceKey) ? parseRequiredSessionUriFromChatUri(sourceKey) : sourceKey;
		const defaultChatKey = this._stateManager.getSessionState(sourceSessionKey)?.defaultChat ?? buildDefaultChatUri(sourceSessionKey);
		const isDefaultSource = sourceKey === sourceSessionKey || isDefaultChatUri(sourceKey);
		const sourceChatKey = isDefaultSource ? defaultChatKey : sourceKey;
		return {
			sourceSessionKey,
			sourceChatKey,
			sourceState: isDefaultSource
				? (this._stateManager.getChatState(defaultChatKey) ?? this._stateManager.getDefaultChatState(sourceSessionKey))
				: await this._stateManager.resolveChatState(sourceChatKey),
		};
	}

	async disposeChat(session: URI, chat: URI): Promise<void> {
		const sessionKey = session.toString();
		const chatKey = chat.toString();
		const provider = this._findProviderForSession(session);
		this._disposingPeerChats.add(chatKey);
		try {
			await this._checkpointService.discardChatTurnStartCheckpoints(session, chat);
			if (provider) {
				await this._disposeChat(provider, chat);
			}
			await this._removePersistedPeerChat(session, chat);
			this._sideEffects.clearQueuedMessageSenders(chatKey);
			this._sideEffects.cancelSubagentSessions(chatKey);
			this._sideEffects.clearChannelTelemetry(chatKey);
			this._stateManager.removeChat(sessionKey, chatKey);
		} finally {
			this._disposingPeerChats.delete(chatKey);
		}
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

	private _chatContext(session: URI, chat: URI): IAgentChatContext {
		return createAgentChatContext(this._stateManager, session, chat);
	}

	/**
	 * Last host-published customization snapshot for the session, passed
	 * explicitly to providers. `undefined` means "no snapshot yet", not "an
	 * empty customization list".
	 */
	private _hostCustomizations(session: URI): readonly Customization[] | undefined {
		return this._stateManager.getSessionState(session.toString())?.customizations;
	}

	/** Mints the session URI before the collapsed `createChat` path derives its default-chat URI. */
	private _mintSessionUri(provider: IAgent): URI {
		return AgentSession.uri(provider.id, generateUuid());
	}

	private async _createProviderSession(provider: IAgent, config: IAgentCreateSessionConfig | undefined, deferWorktreeCreation: boolean): Promise<IAgentCreateSessionResult> {
		const requestedSessionId = deferWorktreeCreation && config?.session ? AgentSession.id(config.session) : undefined;
		if (requestedSessionId) {
			this._worktree?.notePending(requestedSessionId);
		}

		let created: IAgentCreateSessionResult | undefined;
		try {
			const providerConfig = config ? this._toProviderConfig(config) : undefined;
			const session = config?.session ?? this._mintSessionUri(provider);
			const defaultChatUri = URI.parse(buildDefaultChatUri(session));
			const boundConfig: IAgentCreateSessionConfig = { ...(providerConfig ?? {}), session };
			const result = await provider.chats.createChat(defaultChatUri, this._chatContext(session, defaultChatUri), this._toCreateChatOptions(boundConfig));
			created = {
				session,
				...(result?.project ? { project: result.project } : {}),
				...(result?.resolvedWorkingDirectory ? { resolvedWorkingDirectory: result.resolvedWorkingDirectory } : {}),
				...(result?.provisional ? { provisional: true } : {}),
				...(result ? { chat: result } : {}),
			};
			if (deferWorktreeCreation && created.provisional) {
				this._worktree?.notePending(AgentSession.id(created.session));
			}
			await this._persistDefaultChatBacking(created);
			return created;
		} catch (err) {
			if (created) {
				await this._rollbackProviderSession(provider, created.session);
			}
			throw err;
		} finally {
			const returnedPendingSessionId = created?.provisional ? AgentSession.id(created.session) : undefined;
			if (requestedSessionId && requestedSessionId !== returnedPendingSessionId) {
				this._worktree?.clearPending(requestedSessionId);
			}
		}
	}

	/**
	 * Best-effort rollback for a partially-created provider session. Creation
	 * only provisions the default chat, so rollback disposes that one chat and
	 * the caller rethrows the original error.
	 */
	private async _rollbackProviderSession(provider: IAgent, session: URI): Promise<void> {
		const defaultChatUri = URI.parse(buildDefaultChatUri(session));
		try {
			await provider.chats.disposeChat(defaultChatUri, this._chatContext(session, defaultChatUri));
		} catch (disposeError) {
			this._logService.error(disposeError, `[AgentService] Failed to roll back default chat of provider session ${session.toString()}`);
		}
	}

	private _getSessionChatsInTeardownOrder(session: URI): URI[] {
		const state = this._stateManager.getSessionState(session.toString());
		const defaultChat = state?.defaultChat ?? buildDefaultChatUri(session.toString());
		const result: URI[] = [];
		const seen = new Set<string>();
		for (const summary of state?.chats ?? []) {
			if (summary.resource !== defaultChat && !seen.has(summary.resource)) {
				seen.add(summary.resource);
				result.push(URI.parse(summary.resource));
			}
		}
		if (!seen.has(defaultChat)) {
			result.push(URI.parse(defaultChat));
		}
		return result;
	}

	/**
	 * Destructively tears a session down: dispose peer chats first and the
	 * default chat last, and still visit every chat if one rejects.
	 */
	private async _disposeSession(provider: IAgent, session: URI): Promise<void> {
		await this._defaultChatBackingWrites.get(session.toString())?.catch(() => { });
		let firstError: unknown;
		for (const chat of this._getSessionChatsInTeardownOrder(session)) {
			try {
				await provider.chats.disposeChat(chat, this._chatContext(session, chat));
			} catch (err) {
				firstError ??= err;
			}
		}
		if (firstError !== undefined) {
			throw firstError;
		}
	}

	/**
	 * Releases a session's in-memory footprint without deleting durable data.
	 * Idle eviction must use {@link IAgentChats.releaseChat}, not destructive
	 * session finalization, so the session remains resumable.
	 */
	private async _canReleaseSession(provider: IAgent, session: URI, chats: readonly URI[]): Promise<boolean> {
		for (const chat of chats) {
			if (provider.chats.canReleaseChat && !await provider.chats.canReleaseChat(chat, this._chatContext(session, chat))) {
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
				await provider.chats.releaseChat(chat, this._chatContext(session, chat));
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
	private async _getChatMessages(provider: IAgent, chat: URI, session: URI, origin?: ChatOrigin): Promise<readonly Turn[]> {
		const context = { ...this._chatContext(session, chat), ...(origin ? { origin } : {}) };
		const turns = await this._applyPersistedTurnUsage(chat, await provider.chats.getMessages(chat, context));
		// Host-owned worktree restore announcement: re-inject the "Created isolated
		// worktree" message at the top of the default chat's first turn from
		// persisted metadata. No-op for folder sessions and non-default chats (peer
		// / subagent). Agents stay unaware of worktrees.
		if (this._worktree && isDefaultChatUri(chat)) {
			return this._worktree.applyRestoreAnnouncement(URI.parse(parseRequiredSessionUriFromChatUri(chat.toString())), turns);
		}
		return turns;
	}

	/**
	 * Re-attaches persisted per-turn {@link UsageInfo} to reconstructed turns.
	 *
	 * Agent backends don't durably record token/credit usage — the Copilot
	 * SDK's `assistant.usage` event is explicitly ephemeral and the Claude
	 * transcript replay produces none — so restored turns come back without it.
	 * Without this the chat's context-usage gauge stays hidden after a reload
	 * and the session cost total restarts from zero. Usage recorded live by
	 * {@link AgentSideEffects} is looked up by turn id (or the turn's SDK event
	 * id, which is what a restored turn is keyed by).
	 *
	 * NOTE: the lookup only lands for providers that record the bridge between
	 * the live protocol turn id (a host-generated uuid) and the id a restored
	 * turn is keyed by. Today only Copilot does, via `setTurnEventId`. Claude
	 * restores turns keyed by transcript uuid and never populates
	 * `turns.event_id`, so its rows are written but never matched; giving it a
	 * gauge after reload needs that bridge recorded first.
	 */
	private async _applyPersistedTurnUsage(chat: URI, turns: readonly Turn[]): Promise<readonly Turn[]> {
		if (turns.length === 0 || turns.every(turn => hasReportedUsage(turn.usage)) || isSubagentChatUri(chat.toString())) {
			return turns;
		}
		// Same storage the writer used; see `chatStorageUri`.
		const storage = chatStorageUri(chat);
		if (!storage) {
			return turns;
		}
		let usages: Map<string, string>;
		const ref = await this._sessionDataService.tryOpenDatabase(storage);
		if (!ref) {
			return turns;
		}
		try {
			usages = await ref.object.getTurnUsages();
		} catch (err) {
			this._logService.warn(`[AgentService] Failed to read persisted turn usage for ${storage.toString()}`, err);
			return turns;
		} finally {
			ref.dispose();
		}
		if (usages.size === 0) {
			return turns;
		}
		return turns.map(turn => {
			const raw = hasReportedUsage(turn.usage) ? undefined : usages.get(turn.id);
			if (!raw) {
				return turn;
			}
			try {
				const parsed: unknown = JSON.parse(raw);
				// Never spread an untyped payload blind: a corrupted column
				// holding a string or array would splat index keys onto the
				// turn's usage and flow that malformed shape to the renderer.
				if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
					return turn;
				}
				const persisted = parsed as UsageInfo;
				// Merge rather than replace: a turn that ran on Auto already
				// carries a token-less stub holding `_meta.autoModeResolved`
				// (see `mapSessionEvents`), which drives the "Auto (model)"
				// label. Persisted values win; the stub fills what they lack.
				const meta = { ...turn.usage?._meta, ...persisted._meta };
				return {
					...turn,
					usage: {
						...turn.usage,
						...persisted,
						...(Object.keys(meta).length > 0 ? { _meta: meta } : {}),
					},
				};
			} catch {
				return turn;
			}
		});
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
		const records = await this._localTurns.loadForChat(sessionStr, chatUri);
		if (records.length === 0) {
			return [...turns];
		}
		const knownIds = new Set(turns.map(t => t.id));
		const byAnchor = new Map<string, Turn[]>();
		const head: Turn[] = [];
		for (const record of records) {
			let turn: Turn;
			try {
				turn = JSON.parse(record.payload) as Turn;
			} catch {
				continue;
			}
			if (record.anchorTurnId === undefined) {
				head.push(turn);
			} else if (knownIds.has(record.anchorTurnId)) {
				const list = byAnchor.get(record.anchorTurnId) ?? [];
				list.push(turn);
				byAnchor.set(record.anchorTurnId, list);
			}
			// else: orphaned (anchor truncated away) → drop.
		}
		const merged: Turn[] = [...head];
		for (const turn of turns) {
			merged.push(turn);
			const locals = byAnchor.get(turn.id);
			if (locals) {
				merged.push(...locals);
			}
		}
		return merged;
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
	private async _createChat(provider: IAgent, chat: URI, session: URI, options: IAgentCreateChatOptions | undefined): Promise<IAgentCreateChatResult | void> {
		const placement = this._buildChatPlacement(session);
		const convOptions: IAgentCreateChatOptions | undefined = (options?.title !== undefined || options?.model !== undefined || options?.sideChat !== undefined || placement)
			? {
				...(options?.title !== undefined ? { title: options.title } : {}),
				...(options?.model !== undefined ? { model: options.model } : {}),
				...(options?.sideChat !== undefined ? { sideChat: options.sideChat } : {}),
				...(placement?.workingDirectories ? { workingDirectories: placement.workingDirectories } : {}),
				...(placement?.project ? { project: placement.project } : {}),
				...(placement?.config ? { config: placement.config } : {}),
			}
			: undefined;
		const context = this._chatContext(session, chat);
		const result = await provider.chats.createChat(chat, context, options?.fork ? { ...convOptions, fork: options.fork } : convOptions);
		return result;
	}

	private _toCreateChatOptions(config: IAgentCreateSessionConfig): IAgentCreateChatOptions {
		return {
			...(config.model ? { model: config.model } : {}),
			...(config.agent ? { agent: config.agent } : {}),
			...(config.workingDirectories ? { workingDirectories: config.workingDirectories } : {}),
			...(config.config ? { config: config.config } : {}),
			...(config.activeClient ? { activeClient: config.activeClient } : {}),
			...(!config.fork && !config.importConversation ? { deferBacking: true } : {}),
			...(config.importConversation ? { importConversation: config.importConversation } : {}),
			...(config.fork ? {
				fork: {
					source: config.fork.chat,
					turnIndex: config.fork.turnIndex,
					turnId: config.fork.turnId,
					turnIdMapping: config.fork.turnIdMapping,
				},
			} : {}),
		};
	}

	/** Resolves the owning session context for creating an additional chat. */
	private _buildChatPlacement(session: URI): Pick<IAgentCreateChatOptions, 'workingDirectories' | 'project' | 'config'> | undefined {
		const state = this._stateManager.getSessionState(session.toString());
		const workingDirectories = state?.workingDirectories?.map(directory => typeof directory === 'string' ? URI.parse(directory) : directory) ?? [];
		const resolvedPrimary = this._worktree?.getResolvedWorktree(AgentSession.id(session));
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

	private async _disposeChat(provider: IAgent, chat: URI): Promise<void> {
		const session = URI.parse(parseRequiredSessionUriFromChatUri(chat));
		await provider.chats.disposeChat(chat, this._chatContext(session, chat));
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

	private _buildInitialSummary(provider: IAgent, session: URI, config: IAgentCreateSessionConfig | undefined, created: { project?: { uri: URI; displayName: string }; resolvedWorkingDirectory?: URI }, title: string): SessionSummary {
		const now = new Date().toISOString();
		const explicitGitHubState = readSessionGitHubState(config?._meta);
		const explicitMultiRoot = readSessionMultiRootMetadata(config?._meta);
		const inheritedMultiRoot = config?.fork
			? readSessionMultiRootMetadata(this._stateManager.getSessionSummary(config.fork.session.toString())?._meta)
			: undefined;
		let _meta = withSessionGitHubState(undefined, explicitGitHubState);
		_meta = withSessionMultiRootMetadata(_meta, explicitMultiRoot ?? inheritedMultiRoot);
		_meta = withSessionExternal(_meta, false);
		_meta = !config?.fork && !config?.workingDirectories
			? withSessionWorkspaceless(_meta, true)
			: _meta;
		return {
			resource: session.toString(),
			provider: provider.id,
			title,
			status: SessionStatus.Idle,
			createdAt: now,
			modifiedAt: now,
			...(created.project ? { project: { uri: created.project.uri.toString(), displayName: created.project.displayName } } : {}),
			// The provider resolved only its process root (index 0), which may
			// differ from the requested primary (e.g. a workspace-less scratch dir).
			// Assemble the session set by overriding the requested primary with it
			// and keeping the requested tail; the fully-resolved multi-root set
			// arrives later via the materialization receipt.
			workingDirectories: reconcileWorkingDirectories(config?.workingDirectories, created.resolvedWorkingDirectory ? [created.resolvedWorkingDirectory] : undefined),
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
		const session = URI.parse(parseRequiredSessionUriFromChatUri(e.chat));
		const sessionKey = session.toString();
		// The session is now materialized — its SDK is resolved (any cold
		// download already finished), so no further progress is expected for it.
		this._clearDownloadProgressInterest(sessionKey);
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
		if (e.chat.toString() !== state.defaultChat) {
			return;
		}
		if (e.result) {
			const write = this._persistDefaultChatBacking({ session, chat: e.result });
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
		const project = this._worktree?.sessionWorktreeProject(AgentSession.id(session)) ?? e.project;
		const currentSet = currentSummary.workingDirectories?.map(d => URI.parse(d));
		const summary: SessionSummary = {
			...currentSummary,
			...(project ? { project: { uri: project.uri.toString(), displayName: project.displayName } } : {}),
			// The materialize receipt is authoritative for the roots it reports
			// (index 0 = the resolved process root, e.g. a worktree). A send-path
			// receipt carries the full resolved set; a resume-path receipt reports
			// only the process root, so the rest of the current set is preserved.
			workingDirectories: reconcileWorkingDirectories(currentSet, e.workingDirectories),
			modifiedAt: new Date().toISOString(),
		};
		const configValues = state.config?.values;
		if (configValues && Object.keys(configValues).length > 0) {
			this._persistConfigValues(session, configValues);
		}
		// Persist the AH-owned workspace-less marker now that the session has a
		// real on-disk database (deferred from create for provisional sessions).
		this._persistWorkspaceless(session, readSessionWorkspaceless(summary._meta));
		this._persistMultiRoot(session, readSessionMultiRootMetadata(summary._meta));
		this._persistFolderPickerDecision(session, readSessionFolderPickerDecision(summary._meta));
		// `markSessionPersisted` writes the summary into state and fires
		// the deferred `SessionAdded` notification atomically so subscribers
		// see consistent state through both paths.
		this._stateManager.markSessionPersisted(sessionKey, summary);
		this._stateManager.dispatchServerAction(sessionKey, { type: ActionType.SessionReady });
		const gitHubState = readSessionGitHubState(summary._meta);
		if (gitHubState) {
			void this._gitStateService.setSessionGitHubState(sessionKey, gitHubState);
		}

		// Attach git state for the resolved process root (index 0), if present.
		void this._gitStateService.refreshSessionGitState(sessionKey, e.workingDirectories?.[0]);

		// If a client subscribed to this session's uncommitted changeset
		// before the working directory was known, the coordinator drains
		// the deferred refresh now that the working directory is set.
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
	 * "Downloading Claude agent") so a generic client can render the indicator
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
		const message = localize('agentHost.download.agentSdkTitle', "Downloading {0} agent", displayName);
		// `progressToken` is the download's own stable identity (the package id),
		// shared by every session of the provider, so the client coalesces all
		// frames into one indicator and dismisses it on the terminal frame.
		this._stateManager.emitProgress({ progressToken: packageId, progress: receivedBytes, total, message });
		if (terminal) {
			this._downloadProgressInterest.delete(packageId);
		}
	}

	private _persistWorkspaceless(session: URI, workspaceless: boolean): void {
		let ref;
		try {
			ref = this._sessionDataService.openDatabase(session);
		} catch (err) {
			this._logService.warn(`[AgentService] Failed to open session database to persist workspaceless for ${session.toString()}: ${toErrorMessage(err)}`);
			return;
		}
		ref.object.setMetadata(AH_META_WORKSPACELESS_DB_KEY, workspaceless ? 'true' : 'false').catch(err => {
			this._logService.warn(`[AgentService] Failed to persist workspaceless for ${session.toString()}: ${toErrorMessage(err)}`);
		}).finally(() => {
			ref.dispose();
		});
	}

	private _persistMultiRoot(session: URI, multiRoot: ReturnType<typeof readSessionMultiRootMetadata>): void {
		if (!multiRoot) {
			return;
		}
		let ref;
		try {
			ref = this._sessionDataService.openDatabase(session);
		} catch (err) {
			this._logService.warn(`[AgentService] Failed to open session database to persist multi-root metadata for ${session.toString()}: ${toErrorMessage(err)}`);
			return;
		}
		ref.object.setMetadata(SESSION_META_MULTI_ROOT_KEY, JSON.stringify(multiRoot)).catch(err => {
			this._logService.warn(`[AgentService] Failed to persist multi-root metadata for ${session.toString()}: ${toErrorMessage(err)}`);
		}).finally(() => {
			ref.dispose();
		});
	}

	/**
	 * Persists the harness-owned Folder-picker decision so it survives reload as
	 * a frozen creation-time fact: a session created with the picker hidden stays
	 * hidden on reopen, and one created with it shown stays shown. Deferred to
	 * {@link _onDidMaterializeChat} for provisional sessions (no DB yet at
	 * create), mirroring {@link _persistMultiRoot}.
	 */
	private _persistFolderPickerDecision(session: URI, decision: ReturnType<typeof readSessionFolderPickerDecision>): void {
		if (!decision) {
			return;
		}
		let ref;
		try {
			ref = this._sessionDataService.openDatabase(session);
		} catch (err) {
			this._logService.warn(`[AgentService] Failed to open session database to persist folder-picker decision for ${session.toString()}: ${toErrorMessage(err)}`);
			return;
		}
		ref.object.setMetadata(SESSION_META_FOLDER_PICKER_KEY, JSON.stringify(decision)).catch(err => {
			this._logService.warn(`[AgentService] Failed to persist folder-picker decision for ${session.toString()}: ${toErrorMessage(err)}`);
		}).finally(() => {
			ref.dispose();
		});
	}

	private _persistConfigValues(session: URI, values: Record<string, unknown>): void {
		let ref;
		try {
			ref = this._sessionDataService.openDatabase(session);
		} catch (err) {
			this._logService.warn(`[AgentService] Failed to open session database to persist configValues for ${session.toString()}: ${toErrorMessage(err)}`);
			return;
		}
		ref.object.setMetadata('configValues', JSON.stringify(values)).catch(err => {
			this._logService.warn(`[AgentService] Failed to persist configValues for ${session.toString()}: ${toErrorMessage(err)}`);
		}).finally(() => {
			ref.dispose();
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
			ref.object.setMetadata(storage.key, serialized).catch(err => {
				this._logService.warn(`[AgentService] Failed to persist annotations for ${parsed.sessionUri}: ${toErrorMessage(err)}`);
			}).finally(() => {
				ref.dispose();
			});
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

	private async _resolveCreatedSessionConfig(provider: IAgent, config: IAgentCreateSessionConfig | undefined): Promise<SessionConfigState | undefined> {
		if (!config?.config && config?.workingDirectories === undefined) {
			return undefined;
		}
		const params: IAgentResolveSessionConfigParams = {
			provider: provider.id,
			// `resolveSessionConfig` is a pre-session, single-context API:
			// resolve against the session's primary (index 0).
			workingDirectory: config.workingDirectories?.[0],
			config: config.config,
		};
		try {
			const resolved = await this._withHostSessionConfigContributions(await provider.resolveChatConfig(this._toProviderConfig(params)), params);
			return { schema: resolved.schema, values: resolved.values };
		} catch (err) {
			this._logService.error(`[AgentService] Failed to resolve created session config for provider ${provider.id}`, err);
			return config.config ? { schema: { type: 'object', properties: {} }, values: config.config } : undefined;
		}
	}

	async resolveSessionConfig(params: IAgentResolveSessionConfigParams): Promise<ResolveSessionConfigResult> {
		const providerId = params.provider ?? this._defaultProvider;
		const provider = providerId ? this._providers.get(providerId) : undefined;
		if (!provider) {
			throw new Error(`No agent provider registered for: ${providerId ?? '(none)'}`);
		}
		return this._withHostSessionConfigContributions(await provider.resolveChatConfig(this._toProviderConfig(params)), params);
	}

	/**
	 * Applies host-owned session configuration contributions after the provider
	 * resolves its configuration.
	 */
	private async _withHostSessionConfigContributions(result: ResolveSessionConfigResult, params: IAgentResolveSessionConfigParams): Promise<ResolveSessionConfigResult> {
		result = await this._withWorktreeConfigContribution(result, params);
		result = this._withAgentMergeConfigContribution(result, params.config);
		return result;
	}

	private async _withWorktreeConfigContribution(result: ResolveSessionConfigResult, params: IAgentResolveSessionConfigParams): Promise<ResolveSessionConfigResult> {
		if (!this._worktree) {
			return result;
		}
		const iso = await this._worktree.resolveIsolationConfig({ workingDirectory: params.workingDirectory, config: params.config });
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
		if (iso.worktreeBranchTrackProperty) {
			properties[SessionConfigKey.WorktreeBranchTrack] = iso.worktreeBranchTrackProperty.protocol;
		}
		if (iso.worktreeIncludeFilesProperty) {
			properties[SessionConfigKey.WorktreeIncludeFiles] = iso.worktreeIncludeFilesProperty.protocol;
		}
		const values = omitHostOwnedSessionConfig(result.values);
		values[SessionConfigKey.Isolation] = iso.isolationValue;
		if (iso.branchProperty && iso.branchValue !== undefined) {
			values[SessionConfigKey.Branch] = iso.branchValue;
		}
		if (iso.worktreeBranchPrefixProperty && typeof params.config?.[SessionConfigKey.WorktreeBranchPrefix] === 'string') {
			values[SessionConfigKey.WorktreeBranchPrefix] = params.config[SessionConfigKey.WorktreeBranchPrefix];
		}
		if (iso.worktreeBranchTrackProperty && typeof params.config?.[SessionConfigKey.WorktreeBranchTrack] === 'boolean') {
			values[SessionConfigKey.WorktreeBranchTrack] = params.config[SessionConfigKey.WorktreeBranchTrack];
		}
		if (iso.worktreeIncludeFilesProperty
			&& Array.isArray(params.config?.[SessionConfigKey.WorktreeIncludeFiles])
			&& params.config[SessionConfigKey.WorktreeIncludeFiles].every(pattern => typeof pattern === 'string')) {
			values[SessionConfigKey.WorktreeIncludeFiles] = params.config[SessionConfigKey.WorktreeIncludeFiles];
		}
		return { schema: { ...result.schema, properties }, values };
	}

	private _withAgentMergeConfigContribution(result: ResolveSessionConfigResult, config: Record<string, unknown> | undefined): ResolveSessionConfigResult {
		const values = { ...result.values };
		for (const key of [SessionConfigKey.AgentMerge, SessionConfigKey.AgentMergeController]) {
			if (config && Object.hasOwn(config, key)) {
				values[key] = config[key];
			}
		}
		return { ...result, values };
	}

	async sessionConfigCompletions(params: IAgentSessionConfigCompletionsParams): Promise<SessionConfigCompletionsResult> {
		// The host owns branch completions for every agent (they share the same
		// git-backed branch list); all other properties stay provider-specific.
		if (params.property === SessionConfigKey.Branch && this._worktree) {
			return this._worktree.branchCompletions(params.workingDirectory, params.query);
		}
		const providerId = params.provider ?? this._defaultProvider;
		const provider = providerId ? this._providers.get(providerId) : undefined;
		if (!provider) {
			throw new Error(`No agent provider registered for: ${providerId ?? '(none)'}`);
		}
		return provider.chatConfigCompletions(this._toProviderConfig(params));
	}

	async completions(params: CompletionsParams): Promise<CompletionsResult> {
		return this._completions.completions(params);
	}

	async getCompletionTriggerCharacters(): Promise<readonly string[]> {
		return this._completions.triggerCharacters;
	}

	async disposeSession(session: URI): Promise<void> {
		this._logService.trace(`[AgentService] disposeSession: ${session.toString()}`);
		this._stateManager.invalidateSessionChatResolutions(session.toString());
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
		const workingDirectories = this._configurationService.getEffectiveWorkingDirectories(session.toString());
		const sessionId = AgentSession.id(session);
		const worktree = await this._worktree?.prepareSessionDeletion(session, sessionId);
		const provider = this._findProviderForSession(session);
		if (provider) {
			await this._disposeSession(provider, session);
		}
		await this._retryRegistryMutation(
			() => this._sessionRegistry.unregister(session),
			`unregistration for ${session.toString()}`,
		);
		this._invalidateSessionList();
		if (provider) {
			this._sessionToProvider.delete(session.toString());
			this._clearDownloadProgressInterest(session.toString());
		}
		this._sideEffects.clearSessionTitleState(session.toString(), sessionChats.map(chat => chat.resource));
		await this._whenSessionDataIdle(session);
		// Remove the VS Code per-session data directory (metadata DB + checkpoints) to mirror the SDK-side cleanup
		// performed by the provider above. No-op when the directory does not exist.
		//
		// Runs before the worktree is removed: subscribers of the will-delete
		// event drop this session's git refs, and for a worktree-isolated
		// session the working directory *is* the worktree, so once it is gone
		// the repository can no longer be resolved and the refs would leak
		// into the main repository (`refs/agents/*` is shared, not per-worktree).
		await this._sessionDataService.deleteSessionData(session, workingDirectories);
		await this._worktree?.removeSessionWorktree(sessionId, worktree);
		this._changesetCoordinator.onSessionDisposed(session.toString());
		for (const chat of this._stateManager.getSessionState(session.toString())?.chats ?? []) {
			this._sideEffects.clearQueuedMessageSenders(chat.resource);
		}
		this._sideEffects.clearInputRequestsForSession(session.toString());
		// Remove all subagent sessions for this parent
		this._sideEffects.removeSubagentSessions(session.toString());
		this._stateManager.deleteSession(session.toString());
	}

	private async _whenSessionDataIdle(session: URI): Promise<void> {
		const ref = this._sessionDataService.openDatabase(session);
		try {
			await ref.object.whenIdle();
		} finally {
			ref.dispose();
		}
	}

	// ---- Protocol methods ---------------------------------------------------

	async createTerminal(params: CreateTerminalParams): Promise<void> {
		await this._terminalManager.createTerminal(params);
	}

	async disposeTerminal(terminal: URI): Promise<void> {
		this._terminalManager.disposeTerminal(terminal.toString());
	}

	async subscribe(resource: URI, clientId: string): Promise<IStateSnapshot> {
		this._logService.trace(`[AgentService] subscribe: ${resource.toString()}`);
		const resourceStr = resource.toString();
		try {
			await this._releaseSessionInFlight.get(this._sessionReleaseKey(resource));
			// Register after an in-flight release settles so a successful release
			// can evict cached state and this subscribe reconstructs it. The
			// handshake fast path calls addSubscriber directly and therefore pins
			// its already-returned snapshot instead.
			this.addSubscriber(resource, clientId);
			// Check for terminal state
			const terminalState = this._terminalManager.getTerminalState(resourceStr);
			if (terminalState) {
				return { resource: resourceStr, state: terminalState, fromSeq: this._stateManager.serverSeq };
			}

			let snapshot = this._stateManager.getSnapshot(resourceStr);
			const parsedChangeset = parseChangesetUri(resourceStr);
			if (snapshot && parsedChangeset && !this._stateManager.getSessionState(parsedChangeset.sessionUri)) {
				await this._changesetCoordinator.restoreSessionIfChangesetSubscription(resource, s => this.restoreSession(s));
				snapshot = this._stateManager.getSnapshot(resourceStr);
			}
			const parsedAnnotations = parseAnnotationsUri(resourceStr);
			if (snapshot && parsedAnnotations) {
				await this._ensureAnnotationsRestored(parsedAnnotations.sessionUri);
				snapshot = this._stateManager.getSnapshot(resourceStr);
			}
			if (!snapshot) {
				// Chat channel URIs carry their owning session URI. The chat
				// snapshot only materializes once that session is restored
				// (which seeds the default chat state), so restore the parent
				// session rather than the chat URI itself. This makes the
				// chat-channel subscribe self-sufficient and independent of
				// whether the session channel was subscribed first.
				const parsedChatSession = parseDefaultChatUri(resourceStr);
				if (parsedChatSession !== undefined) {
					if (!this._stateManager.getSessionState(parsedChatSession)) {
						const parentUri = URI.parse(parsedChatSession);
						const parsedSubagentParent = parseSubagentSessionUri(parentUri);
						if (parsedSubagentParent) {
							await this._restoreSubagentSession(parsedChatSession, parsedSubagentParent.parentSession);
						} else {
							await this.restoreSession(parentUri);
						}
					}
					snapshot = this._stateManager.getSnapshot(resourceStr);
				}
			}
			if (!snapshot && isAhpChatChannel(resourceStr)) {
				await this._stateManager.resolveChatState(resourceStr);
				snapshot = this._stateManager.getSnapshot(resourceStr);
			}
			if (!snapshot) {
				if (isSubagentChatUri(resource)) {
					snapshot = await this._awaitPendingSubagentChat(resourceStr);
					if (!snapshot) {
						const parsed = parseChatUri(resource);
						if (parsed?.chatId.startsWith('subagent/')) {
							await this._restoreSubagentChat(resourceStr, URI.parse(parsed.session), parsed.chatId.slice('subagent/'.length));
							snapshot = this._stateManager.getSnapshot(resourceStr);
						}
					}
				} else {
					// Changeset URIs are routed through the coordinator (which
					// owns its URI shape, the unknown-id early throw, and turn
					// / static seeding). Other URIs fall through to the
					// subagent / session-default path below.
					const handled = await this._changesetCoordinator.tryHandleSubscribe(resource, s => this.restoreSession(s));
					if (handled) {
						snapshot = this._stateManager.getSnapshot(resourceStr);
					} else {
						// Try subagent restore before regular session restore
						const parsedSubagent = parseSubagentSessionUri(resource);
						if (parsedSubagent) {
							await this._restoreSubagentSession(resourceStr, parsedSubagent.parentSession);
						} else {
							await this.restoreSession(resource);
						}
						snapshot = this._stateManager.getSnapshot(resourceStr);
					}
				}
			}
			if (!snapshot) {
				throw new Error(`Cannot subscribe to unknown resource: ${resourceStr}`);
			}

			// Ensure git state has been computed for this session. When the snapshot
			// already existed (e.g. seeded by list query, or restored earlier), the
			// restore path that normally calls `_attachGitState` is skipped — so
			// trigger it lazily here for the first subscriber. `_attachGitState`
			// is async and updates `_meta.git` once ready, which clients see via
			// the normal state-update stream.
			const sessionState = this._stateManager.getSessionState(resourceStr);
			if (!isAhpChatChannel(resourceStr) && sessionState && readSessionGitState(sessionState._meta) === undefined) {
				const workingDirectory = sessionState.workingDirectories?.[0]
					? URI.parse(sessionState.workingDirectories[0])
					: undefined;
				void this._gitStateService.refreshSessionGitState(resourceStr, workingDirectory);
			}

			return snapshot;
		} catch (err) {
			this.unsubscribe(resource, clientId);
			throw err;
		}
	}

	private _sessionReleaseKey(resource: URI): string {
		const resourceString = resource.toString();
		const changesetSession = parseChangesetUri(resourceString)?.sessionUri;
		const chatSession = parseDefaultChatUri(resourceString);
		let session = URI.parse(changesetSession ?? chatSession ?? resourceString);
		let subagent;
		while ((subagent = parseSubagentSessionUri(session))) {
			session = subagent.parentSession;
		}
		return session.toString();
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
		let set = this._resourceSubscribers.get(resource);
		const wasUnsubscribed = !set || set.size === 0;
		if (!set) {
			set = new Set();
			this._resourceSubscribers.set(resource, set);
		}
		set.add(clientId);
		// A new subscriber means the session is being observed again; cancel
		// any pending GC or idle-release armed while it had no subscribers.
		this._cancelPendingSessionGc(resource);
		this._cancelPendingSessionRelease(resource);
		// 0→1 transition — covers both the full subscribe path AND the
		// handshake fast-path used by `ProtocolServerHandler` when state is
		// already cached. The coordinator decides whether the URI is one
		// it cares about (e.g. uncommitted changeset → trigger refresh).
		if (wasUnsubscribed) {
			this._changesetCoordinator.onFirstSubscriber(resource);
		}
	}

	unsubscribe(resource: URI, clientId: string): void {
		const set = this._resourceSubscribers.get(resource);
		if (!set) {
			return;
		}
		set.delete(clientId);
		if (set.size > 0) {
			return;
		}
		this._resourceSubscribers.delete(resource);
		this._changesetCoordinator.onLastSubscriber(resource);
		this._stateManager.onChangesetLivenessChanged();
		// An empty session whose last subscriber dropped is a candidate for
		// full GC (provider session, worktree, on-disk state). Sessions with
		// at least one turn fall through to {@link _maybeEvictIdleSession},
		// which only drops the in-memory cache and lets the session be
		// restored from disk later. Skipping eviction here for empty
		// sessions ensures their state stays observable so a re-subscribe
		// can re-arm GC.
		if (this._maybeScheduleSessionGc(resource)) {
			return;
		}
		// Defer the idle-session release behind a grace window rather than
		// releasing synchronously. A client that reconnects (or re-subscribes)
		// within the window cancels this via {@link _cancelPendingSessionRelease}
		// and keeps the live provider SDK session, avoiding a disconnect/resume
		// churn cycle that races concurrent session operations on the shared
		// provider runtime. A zero grace releases on the next tick.
		this._scheduleSessionRelease(resource);
	}

	private _cancelPendingSessionRelease(resource: URI): void {
		this._pendingSessionRelease.deleteAndDispose(this._sessionReleaseResource(resource));
	}

	private _scheduleSessionRelease(resource: URI): void {
		const session = this._sessionReleaseResource(resource);
		this._pendingSessionRelease.set(session, disposableTimeout(() => {
			this._pendingSessionRelease.deleteAndDispose(session);
			void this._maybeEvictIdleSession(session).catch(err => {
				this._logService.error(err, `[AgentService] Failed to evict idle session ${session.toString()}`);
			});
		}, SESSION_RELEASE_GRACE_MS));
	}

	private _sessionReleaseResource(resource: URI): URI {
		return URI.parse(this._sessionReleaseKey(resource));
	}

	/**
	 * If `resource` names a session that no client is still subscribed to and
	 * that has produced no turns (and has no active turn), schedule a delayed
	 * {@link _runSessionGc} to fully tear it down — provider session, worktree,
	 * persisted state and all. Sessions with at least one turn are left to the
	 * existing {@link _maybeEvictIdleSession} path which only drops cached
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
	 *
	 * Returns `true` if a GC timer was armed (existing or newly scheduled),
	 * so callers can skip alternative cleanup paths.
	 */
	private _maybeScheduleSessionGc(resource: URI): boolean {
		// Subagent URIs are backed by the parent session; the parent's GC is
		// scheduled when its own subscriber count reaches zero.
		if (parseSubagentSessionUri(resource)) {
			return false;
		}
		const key = resource.toString();
		const state = this._stateManager.getSessionState(key);
		if (!state) {
			return false;
		}
		if (state.turns.length > 0 || state.activeTurn !== undefined) {
			return false;
		}
		if (this._stateManager.isUnusedDraft(key) !== true) {
			this._logService.trace(`[AgentService] Skipping GC for session that is not an unused draft: ${key}`);
			return false;
		}
		this._pendingSessionGc.set(resource, disposableTimeout(() => {
			this._pendingSessionGc.deleteAndDispose(resource);
			this._runSessionGc(resource).catch(err => {
				this._logService.error(err, `[AgentService] GC failed for ${key}`);
			});
		}, SESSION_GC_GRACE_MS));
		return true;
	}

	private _cancelPendingSessionGc(resource: URI): void {
		this._pendingSessionGc.deleteAndDispose(resource);
	}

	/**
	 * Fires {@link SESSION_GC_GRACE_MS} after a session lost its last
	 * subscriber while empty. Re-checks the invariants (still no subscribers,
	 * still empty, still an unused draft) before tearing the session down via
	 * {@link disposeSession}. The cached state may already have been evicted by
	 * {@link _maybeEvictIdleSession}; in that case we still proceed because
	 * "evicted + no resubscribe" implies no client is observing the session.
	 */
	private async _runSessionGc(resource: URI): Promise<void> {
		const key = resource.toString();
		if (this._resourceSubscribers.has(resource)) {
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

	/**
	 * If `resource` names an idle session with no remaining subscribers, drop its
	 * cached state and release its SDK chats. Subagent URIs evict the parent
	 * session entry because the parent owns the materialized turn tree. Durable
	 * data stays intact; the next subscribe restores the session on demand.
	 */
	private async _maybeEvictIdleSession(resource: URI): Promise<void> {
		const key = resource.toString();
		const evictionTarget = this._sessionReleaseResource(resource);
		const evictionTargetKey = evictionTarget.toString();
		if (this._hasSessionSubscribers(evictionTarget)) {
			return;
		}
		// A restore/resume racing this unsubscribe means a client is about to
		// observe the session again; releasing now would tear down state that
		// the in-flight rehydrate is populating.
		if (this._restoreSessionInFlight.has(evictionTargetKey)) {
			return;
		}
		const targetState = this._stateManager.getSessionState(evictionTargetKey);
		if (!targetState) {
			return;
		}
		if (this._stateManager.hasActiveTurn(evictionTargetKey)) {
			this._scheduleSessionRelease(evictionTarget);
			return;
		}
		if (this._releaseSessionInFlight.has(evictionTargetKey)) {
			return;
		}
		const chats = this._getSessionChatsInTeardownOrder(evictionTarget);
		await this._whenSessionDataIdle(evictionTarget);
		if (this._hasSessionSubscribers(evictionTarget) || this._restoreSessionInFlight.has(evictionTargetKey) || this._releaseSessionInFlight.has(evictionTargetKey)) {
			return;
		}
		const settledState = this._stateManager.getSessionState(evictionTargetKey);
		if (!settledState) {
			return;
		}
		if (this._stateManager.hasActiveTurn(evictionTargetKey)) {
			this._scheduleSessionRelease(evictionTarget);
			return;
		}
		const provider = this._findProviderForSession(evictionTarget);
		if (!provider) {
			return;
		}
		const trackedRelease = (async () => {
			try {
				if (!await this._canReleaseSession(provider, evictionTarget, chats)) {
					if (!this._hasSessionSubscribers(evictionTarget)) {
						this._scheduleSessionRelease(evictionTarget);
					}
					return;
				}
				const currentState = this._stateManager.getSessionState(evictionTargetKey);
				if (this._hasSessionSubscribers(evictionTarget)) {
					return;
				}
				if (this._restoreSessionInFlight.has(evictionTargetKey) || this._stateManager.hasActiveTurn(evictionTargetKey)) {
					this._scheduleSessionRelease(evictionTarget);
					return;
				}
				if (currentState) {
					this._evictSessionState(evictionTarget, evictionTargetKey, key, currentState.chats.map(chat => chat.resource));
				}
				await this._releaseSession(provider, evictionTarget, chats);
			} catch (err) {
				this._logService.error(err, `[AgentService] Failed to release idle session ${evictionTargetKey}`);
				if (!this._hasSessionSubscribers(evictionTarget)) {
					this._scheduleSessionRelease(evictionTarget);
				}
			}
		})();
		this._releaseSessionInFlight.set(evictionTargetKey, trackedRelease);
		void trackedRelease.then(() => {
			if (this._releaseSessionInFlight.get(evictionTargetKey) === trackedRelease) {
				this._releaseSessionInFlight.delete(evictionTargetKey);
			}
		});
	}

	private _hasSessionSubscribers(session: URI): boolean {
		const sessionKey = this._sessionReleaseKey(session);
		for (const subscribedUri of this._resourceSubscribers.keys()) {
			if (this._sessionReleaseKey(subscribedUri) === sessionKey) {
				return true;
			}
		}
		return false;
	}

	private _evictSessionState(evictionTarget: URI, evictionTargetKey: string, triggerKey: string, chats: readonly string[]): void {
		this._logService.info(`[AgentService] Evicting idle session: ${evictionTargetKey} (triggered by unsubscribe of ${triggerKey})`);
		const subagentPrefix = buildSubagentSessionUriPrefix(evictionTarget);
		for (const cachedKey of this._stateManager.getSessionUrisWithPrefix(subagentPrefix)) {
			this._stateManager.removeSession(cachedKey);
		}
		this._sideEffects.clearSessionTitleState(evictionTargetKey, chats);
		this._stateManager.removeSession(evictionTargetKey);
	}

	// Returns true when a changeset is safe to drop from the in-memory cache.
	private _isChangesetEvictable(changeset: string): boolean {
		const changesetUri = URI.parse(changeset);
		// A direct changeset subscriber is rendering this expanded URI. Keep
		// the state alive so future envelopes still target an existing object.
		if (this._resourceSubscribers.has(changesetUri)) {
			return false;
		}
		const parsed = parseChangesetUri(changeset);
		// This guard only handles recognized changeset URIs; leave anything else alone.
		if (!parsed) {
			return false;
		}
		const sessionUri = URI.parse(parsed.sessionUri);
		// A parent-session subscriber can still receive catalogue count updates
		// from this changeset, so keep the backing state while the session is observed.
		if (this._resourceSubscribers.has(sessionUri)) {
			return false;
		}
		// Subagent views are backed by the parent session tree; treat any
		// subscribed descendant as a parent-session pin for cache eviction.
		for (const subscribedUri of this._resourceSubscribers.keys()) {
			if (this._isSubagentDescendantOf(subscribedUri, sessionUri)) {
				return false;
			}
		}
		// If a git/session/uncommitted changeset recompute is currently running for this changeset URI,
		// do not evict its cached state yet. Once the compute is done,
		// it is safe to evict because the state is just a cache and can be recreated later.
		return !this._changesets.isStaticChangesetComputeActive(changeset);
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

	/** A read/archive toggle carries no intent to open, so it must not trigger legacy adoption on an un-loaded session. */
	private _isPassiveMetadataAction(action: SessionAction | ChatAction | TerminalAction | ClientChangesetAction | ClientAnnotationsAction | IRootConfigChangedAction): boolean {
		return action.type === ActionType.SessionIsReadChanged || action.type === ActionType.SessionIsArchivedChanged;
	}

	dispatchAction(channel: string, action: SessionAction | ChatAction | TerminalAction | ClientChangesetAction | ClientAnnotationsAction | IRootConfigChangedAction, clientId: string, clientSeq: number, clientContextOrType: IAgentHostClientTelemetryContext | AgentHostClientType = AgentHostClientType.Unknown): void {
		const clientContext = typeof clientContextOrType === 'string'
			? createUnknownAgentHostClientTelemetryContext(clientContextOrType)
			: clientContextOrType;
		this._logService.trace(`[AgentService] dispatchAction: type=${action.type}, clientId=${clientId}, clientSeq=${clientSeq}`, action);

		// Clients dispatch chat (chat) actions against a chat channel
		// URI. Keep that chat channel for the optimistic state apply and for
		// per-chat routing in side effects, while deriving the owning session
		// URI for all session-scoped work (attachment snapshotting, agent
		// lookup, telemetry, permissions — all keyed by session).
		const chatChannel = isAhpChatChannel(channel) ? channel : undefined;
		const sessionChannel = chatChannel ? parseRequiredSessionUriFromChatUri(chatChannel) : channel;
		const requiresSessionRestore = (chatChannel !== undefined || isSessionAction(action)) && !this._stateManager.getSessionState(sessionChannel);
		const requiresPeerResolution = chatChannel !== undefined && !this._stateManager.getChatState(chatChannel);
		const requiresTurnOwnerResolution = action.type === ActionType.ChatTurnStarted && (requiresSessionRestore || (this._getUnresolvedPeerChats(sessionChannel)?.length ?? 0) > 0);
		const requiresAttachmentRewrite = this._needsAsyncRewrite(sessionChannel, action);
		const requiresReviewStateUpdate = action.type === ActionType.ChangesetFilesReviewChanged;

		const pending = this._clientDispatchQueues.get(clientId);
		if (!pending && !requiresSessionRestore && !requiresPeerResolution && !requiresTurnOwnerResolution && !requiresAttachmentRewrite && !requiresReviewStateUpdate) {
			this._dispatchActionNow(channel, sessionChannel, action, clientId, clientSeq, clientContext);
			return;
		}
		const next = (pending ?? Promise.resolve()).then(async () => {
			if (requiresSessionRestore) {
				const sessionUri = URI.parse(sessionChannel);
				const subagent = parseSubagentSessionUri(sessionUri);
				if (subagent) {
					await this._restoreSubagentSession(sessionChannel, subagent.parentSession);
				} else if (this._isPassiveMetadataAction(action) && readSessionEhcliAdoptable(this._stateManager.getSurfacedSessionSummary(sessionChannel)?._meta)) {
					// Dropped so listing / scrolling can't adopt an un-opened legacy session; only an explicit open (subscribe) adopts.
					return;
				} else {
					await this.restoreSession(sessionUri);
				}
			}
			if (chatChannel && requiresPeerResolution) {
				await this._stateManager.resolveChatState(chatChannel);
			}
			if (action.type === ActionType.ChatTurnStarted && requiresTurnOwnerResolution) {
				await this._resolvePeerChatsForTurnValidation(sessionChannel);
			}
			const rewritten: SessionAction | ChatAction | TerminalAction | ClientChangesetAction | ClientAnnotationsAction | IRootConfigChangedAction = requiresAttachmentRewrite
				? await this._rewriteUserMessageAttachments(sessionChannel, action, clientId)
				: action;
			if (rewritten.type === ActionType.ChangesetFilesReviewChanged) {
				await this._reviewService.setReviewState(channel, rewritten.files, rewritten.reviewed);
				const changeset = parseChangesetUri(channel);
				if (!changeset) {
					throw new Error(`Invalid changeset URI: ${channel}`);
				}
				this._changesets.refreshBranchChangeset(changeset.sessionUri);
			}
			this._dispatchActionNow(channel, sessionChannel, rewritten, clientId, clientSeq, clientContext);
		}).catch(err => {
			this._logService.error(`[AgentService] async dispatchAction failed: ${toErrorMessage(err)}`);
			this._stateManager.rejectClientAction(channel, action, { clientId, clientSeq }, toErrorMessage(err));
		}).finally(() => {
			if (this._clientDispatchQueues.get(clientId) === next) {
				this._clientDispatchQueues.delete(clientId);
			}
		});

		this._clientDispatchQueues.set(clientId, next);
	}

	/**
	 * Authoritative gate for every client working-directory action. Throws when
	 * the session or its provider cannot accept the change — including a removal
	 * of the primary directory for a provider that pins it — so the caller can
	 * reject the action. Returns the canonicalized action on success.
	 */
	private _prepareWorkingDirectoryAction(session: string, action: SessionWorkingDirectoryAction): SessionWorkingDirectoryAction {
		const state = this._stateManager.getSessionState(session);
		if (!state || state.lifecycle !== SessionLifecycle.Ready || !state.workingDirectories?.length) {
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
		const provider = this._findProviderForSession(sessionUri);
		const capability = provider?.getDescriptor().capabilities?.multipleWorkingDirectories;
		if (!provider || !capability) {
			throw new Error(`Provider does not support dynamic working-directory changes: ${AgentSession.provider(sessionUri) ?? '(unknown)'}`);
		}

		return resolveSessionWorkingDirectoryAction(action, state.workingDirectories, capability.immutablePrimary === true);
	}

	/**
	 * Carries host-written session config through a client replacement. A client
	 * may legitimately replace its own config wholesale, but omitting a host-owned
	 * key must not clear it, since that would reset Agent Merge authorization state.
	 */
	private _withPreservedHostWrittenSessionConfig(session: string, action: SessionConfigChangedAction): SessionConfigChangedAction {
		const values = this._stateManager.getSessionState(session)?.config?.values;
		if (!values) {
			return action;
		}
		let preserved: Record<string, unknown> | undefined;
		for (const key of HOST_WRITTEN_SESSION_CONFIG_KEYS) {
			if (Object.hasOwn(values, key)) {
				preserved ??= {};
				preserved[key] = values[key];
			}
		}
		return preserved ? { ...action, config: { ...action.config, ...preserved } } : action;
	}

	private _dispatchActionNow(channel: string, sessionChannel: string, action: SessionAction | ChatAction | TerminalAction | ClientChangesetAction | ClientAnnotationsAction | IRootConfigChangedAction, clientId: string, clientSeq: number, clientContext: IAgentHostClientTelemetryContext): void {
		const origin = { clientId, clientSeq };
		if (action.type === ActionType.ChatTurnStarted && this._isTurnIdUsedByAnotherChat(sessionChannel, channel, action.turnId)) {
			this._stateManager.rejectClientAction(channel, action, origin, 'Turn id is already used by another chat in this session.');
			return;
		}
		// Host-owned session config carries merge authorization (bound pull request,
		// watermark, attempt budgets), so a client must never be able to write it, and
		// a wholesale replacement must not drop it either.
		if (action.type === ActionType.SessionConfigChanged) {
			const configAction = action as SessionConfigChangedAction;
			const forbidden = HOST_WRITTEN_SESSION_CONFIG_KEYS.filter(key => Object.hasOwn(configAction.config, key));
			if (forbidden.length > 0) {
				this._stateManager.rejectClientAction(channel, action, origin, `Session config keys are host-owned and cannot be set by a client: ${forbidden.join(', ')}.`);
				return;
			}
			if (configAction.replace) {
				action = this._withPreservedHostWrittenSessionConfig(sessionChannel, configAction);
			}
		}
		if (action.type === ActionType.SessionWorkingDirectorySet || action.type === ActionType.SessionWorkingDirectoryRemoved) {
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
		this._stateManager.dispatchClientAction(channel, action, origin, clientContext);
		if (action.type === ActionType.RootConfigChanged) {
			this._configurationService.persistRootConfig();
			const editTelemetryEnabled = action.config[AgentHostEditTelemetryEnabledConfigKey];
			if (typeof editTelemetryEnabled === 'boolean') {
				this._editAttributionService?.setEnabled(editTelemetryEnabled);
			}
		}
		this._sideEffects.handleAction(channel, action, clientId, clientContext);
	}
	private _getUnresolvedPeerChats(sessionChannel: string): readonly string[] | undefined {
		return this._stateManager.getSessionState(sessionChannel)?.chats.filter(chat => !isDefaultChatUri(chat.resource) && !this._stateManager.getChatState(chat.resource)).map(chat => chat.resource);
	}

	private async _resolvePeerChatsForTurnValidation(sessionChannel: string): Promise<void> {
		while (true) {
			const unresolvedChats = this._getUnresolvedPeerChats(sessionChannel);
			if (!unresolvedChats) { throw new Error('Cannot validate turn id for unknown session'); }
			if (unresolvedChats.length === 0) { return; }
			await Promise.all(unresolvedChats.map(async chat => {
				if (!await this._stateManager.resolveChatState(chat)) { throw new Error('Cannot resolve peer chat for turn id validation'); }
			}));
		}
	}
	private _isTurnIdUsedByAnotherChat(sessionChannel: string, chatChannel: string, turnId: string): boolean {
		const sessionState = this._stateManager.getSessionState(sessionChannel);
		if (!sessionState) { return false; }
		if (sessionState.defaultChat !== chatChannel && (sessionState.activeTurn?.id === turnId || (sessionState.turns ?? []).some(turn => turn.id === turnId))) { return true; }
		for (const chat of sessionState.chats ?? []) {
			if (chat.resource === chatChannel || isDefaultChatUri(chat.resource)) { continue; }
			const chatState = this._stateManager.getChatState(chat.resource);
			if (chatState?.activeTurn?.id === turnId || chatState?.turns.some(turn => turn.id === turnId)) { return true; }
		}
		return false;
	}

	private _needsAsyncRewrite(sessionURI: string, action: SessionAction | ChatAction | TerminalAction | ClientChangesetAction | ClientAnnotationsAction | IRootConfigChangedAction): action is ChatTurnStartedAction | ChatPendingMessageSetAction {
		if (action.type !== ActionType.ChatTurnStarted && action.type !== ActionType.ChatPendingMessageSet) {
			return false;
		}
		const attachmentsRootStr = this._attachmentsRoot(sessionURI).toString();
		return !!action.message.attachments?.some(a => this._isRewritableAttachment(a, attachmentsRootStr));
	}
	private _isRewritableAttachment(attachment: MessageAttachment, attachmentsRootStr: string): boolean {
		if (attachment.type === MessageAttachmentKind.EmbeddedResource) {
			return true;
		}
		if (attachment.type === MessageAttachmentKind.Resource) {
			// Don't try to fetch directories or already-rewritten attachments
			// (whose URIs already point under our session attachments folder).
			if (attachment.displayKind === 'directory') {
				return false;
			}
			if (attachment.uri.startsWith(attachmentsRootStr)) {
				return false;
			}
			return true;
		}
		return false;
	}

	private _attachmentsRoot(sessionURI: string): URI {
		return joinPath(this._sessionDataService.getSessionDataDir(URI.parse(sessionURI)), SESSION_ATTACHMENTS_DIRNAME);
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
	private async _rewriteUserMessageAttachments<T extends ChatTurnStartedAction | ChatPendingMessageSetAction>(channel: string, action: T, clientId: string): Promise<T> {
		const attachments = action.message.attachments;
		if (!attachments?.length) {
			return action;
		}
		const attachmentsRoot = this._attachmentsRoot(channel);
		const attachmentsRootStr = attachmentsRoot.toString();
		const rewritten = await Promise.all(attachments.map(a => this._rewriteSingleAttachment(a, attachmentsRoot, attachmentsRootStr, clientId)));
		return {
			...action,
			message: { ...action.message, attachments: rewritten },
		};
	}

	private async _rewriteSingleAttachment(attachment: MessageAttachment, attachmentsRoot: URI, attachmentsRootStr: string, clientId: string): Promise<MessageAttachment> {
		try {
			if (attachment.type === MessageAttachmentKind.EmbeddedResource) {
				const bytes = decodeBase64(attachment.data).buffer;
				const basename = this._attachmentBasename(attachment.label, attachment.contentType);
				return this._writeAndRewrite(attachment, bytes, basename, attachmentsRoot);
			}
			if (attachment.type === MessageAttachmentKind.Resource && this._isRewritableAttachment(attachment, attachmentsRootStr)) {
				const originalUri = URI.parse(attachment.uri);
				// If the attachment references a file that already exists on the agent
				// host side, leave it untouched rather than snapshotting a client copy (#319314).
				if (originalUri.scheme === Schemas.file && await this._fileExistsSafe(originalUri)) {
					return attachment;
				}

				const bytes = await this._readClientResource(originalUri, clientId);
				const basename = this._attachmentBasename(attachment.label, getMediaMime(originalUri.path));
				return this._writeAndRewrite(attachment, bytes, basename, attachmentsRoot);
			}
		} catch (err) {
			this._logService.warn(`[AgentService] Failed to rewrite attachment '${attachment.label}': ${toErrorMessage(err)}`);
		}
		return attachment;
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
			_meta: original._meta,
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
		let stat;
		try {
			stat = await this._fileService.resolve(uri);
		} catch {
			throw new ProtocolError(AhpErrorCodes.NotFound, `Directory not found: ${uri.toString()}`);
		}

		if (!stat.isDirectory) {
			throw new ProtocolError(AhpErrorCodes.NotFound, `Not a directory: ${uri.toString()}`);
		}

		const entries: DirectoryEntry[] = (stat.children ?? []).map(child => ({
			name: child.name,
			type: child.isDirectory ? 'directory' : 'file',
		}));
		return { entries };
	}

	async restoreSession(session: URI): Promise<void> {
		const sessionStr = session.toString();
		this._cancelPendingSessionGc(session);
		this._cancelPendingSessionRelease(session);
		await this._releaseSessionInFlight.get(sessionStr);

		const inFlight = this._restoreSessionInFlight.get(sessionStr);
		if (inFlight) {
			return inFlight;
		}

		if (this._stateManager.getSessionState(sessionStr)) {
			return;
		}

		const restore = this._doRestoreSession(session, sessionStr);
		this._restoreSessionInFlight.set(sessionStr, restore);
		try {
			await restore;
		} finally {
			if (this._restoreSessionInFlight.get(sessionStr) === restore) {
				this._restoreSessionInFlight.delete(sessionStr);
			}
		}
	}

	/** Emits one {@link AgentHostLegacyMigrationEvent} for a legacy-session adoption attempt. */
	private _reportLegacyMigration(
		provider: string,
		outcome: AgentHostLegacyMigrationEvent['outcome'],
		startTime: number,
		extra: { turnCount?: number; hasProject?: boolean; hasWorktree?: boolean; workingDirectoryCount?: number; errorMessage?: string },
	): void {
		this._telemetryService.publicLog2<AgentHostLegacyMigrationEvent, AgentHostLegacyMigrationClassification>('agentHost.legacyCopilotCliMigration', {
			provider,
			outcome,
			success: outcome === 'migrated' && (extra.turnCount ?? 0) > 0,
			turnCount: extra.turnCount ?? 0,
			durationMs: Date.now() - startTime,
			hasProject: extra.hasProject ?? false,
			hasWorktree: extra.hasWorktree ?? false,
			workingDirectoryCount: extra.workingDirectoryCount ?? 0,
			errorMessage: extra.errorMessage,
		});
	}

	private async _doRestoreSession(session: URI, sessionStr: string): Promise<void> {
		if (this._stateManager.getSessionState(sessionStr)) {
			return;
		}
		const agent = this._findProviderForSession(session);
		if (!agent) {
			throw new ProtocolError(AHP_SESSION_NOT_FOUND, `No agent for session: ${sessionStr}`);
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
		const registeredSession = (await this._listRegisteredSessions()).find(entry => entry.session.toString() === sessionStr);
		const external = registeredSession?.external ?? false;

		// Adopt-on-open for a surfaced un-adopted legacy Copilot CLI session, strictly gated on the live migrate setting (a no-op for native / already-adopted sessions).
		const migrateLegacyEnabled = this._configurationService.getRootValue(platformRootSchema, AgentHostMigrateLegacyCopilotCliEnabledConfigKey) === true;
		const migrationStartTime = Date.now();
		let adoption: IAgentChatAdoptionResult = { adopted: false, eligible: false };
		if (!external && migrateLegacyEnabled && agent.ensureChatAdopted) {
			try {
				const defaultChat = URI.parse(buildDefaultChatUri(session));
				adoption = await agent.ensureChatAdopted(defaultChat, this._chatContext(session, defaultChat));
			} catch (err) {
				// Adoption itself threw — a genuine migration failure worth surfacing.
				this._reportLegacyMigration(agent.id, 'failed', migrationStartTime, { errorMessage: toErrorMessage(err) });
				throw err;
			}
		}
		const adopted = adoption.adopted;

		// From here the whole restore is wrapped so `migrated` is reported only
		// after every required step succeeds, and any failure after a successful
		// adoption is surfaced as a migration failure.
		try {
			const facts = await this._restoreSessionState(agent, session, sessionStr, adopted, external, registeredSession?.source ?? 'restore');
			await this._restoreAnnotations(session);
			if (adopted) {
				this._reportLegacyMigration(agent.id, 'migrated', migrationStartTime, facts);
			} else if (adoption.eligible) {
				// Migrate setting on and a genuine legacy candidate, but not adopted
				// this pass (e.g. its on-disk working directory could not be resolved).
				this._reportLegacyMigration(agent.id, 'skipped', migrationStartTime, { hasProject: facts.hasProject, workingDirectoryCount: facts.workingDirectoryCount });
			}
		} catch (err) {
			if (adopted) {
				this._reportLegacyMigration(agent.id, 'failed', migrationStartTime, { errorMessage: toErrorMessage(err) });
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
		if (this._stateManager.getAnnotationsState(buildAnnotationsUri(sessionUri))) {
			return;
		}
		await this._restoreSessionInFlight.get(sessionUri);
		await this._restoreSubagentInFlight.get(sessionUri);
		const session = URI.parse(sessionUri);
		if (!this._stateManager.getSessionState(sessionUri)) {
			const parsedSubagent = parseSubagentSessionUri(session);
			if (parsedSubagent) {
				await this._restoreSubagentSession(sessionUri, parsedSubagent.parentSession);
			} else {
				await this.restoreSession(session);
			}
		}
		await this._restoreAnnotations(session);
	}

	/** Reads persisted annotations into state. */
	private async _doRestoreAnnotations(session: URI): Promise<void> {
		const storage = this._annotationsStorage(session);
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
				if (!isPersistedAnnotationsState(state)) {
					throw new Error('Invalid annotations state');
				}
				this._stateManager.restoreAnnotations(session.toString(), state);
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
	private async _restoreSessionState(agent: IAgent, session: URI, sessionStr: string, adopted: boolean, external: boolean, registrationSource: IRegisteredSession['source']): Promise<{ turnCount: number; hasProject: boolean; hasWorktree: boolean; workingDirectoryCount: number }> {
		let meta = await this._getSessionMetadataForRestore(agent, session, external);
		if (!meta) {
			throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session not found on backend: ${sessionStr}`);
		}

		// A freshly-adopted legacy session whose working directory is a
		// pre-existing git worktree keeps no worktree metadata (adoption seeds
		// `isolation: folder` in place). Bridge it now so the session groups under
		// its repository and diffs against the right base, matching native
		// worktree-isolated sessions. No-op for folder / primary-checkout cwds.
		let adoptedWorktree = false;
		if (adopted && this._worktree) {
			const adoptedWorkingDirectory = meta.workingDirectories?.[0];
			if (adoptedWorkingDirectory) {
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
		if (!meta.project && !readSessionWorkspaceless(meta._meta) && this._worktree) {
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

		const defaultChatUri = URI.parse(buildDefaultChatUri(sessionStr));
		const defaultChatProviderData = await this._readDefaultChatProviderData(session);
		// Default-chat restore always goes through {@link IAgent.materializeChat};
		// there is no identity-reuse fallback. Always offer the persisted blob,
		// including `undefined`, so legacy sessions can recover their backing from
		// provider storage and, if they do, persist it once for later restores.
		// If no backing exists, restore the history but leave the missing live
		// backing explicit.
		const chatContext = this._chatContext(session, defaultChatUri);
		const recoveredDefaultChat = !external && defaultChatProviderData === undefined
			? await agent.recoverLegacyChat?.(defaultChatUri, chatContext)
			: undefined;
		if (recoveredDefaultChat?.providerData !== undefined) {
			await this._persistDefaultChatBacking({ session, chat: recoveredDefaultChat });
		}
		const providerData = defaultChatProviderData ?? recoveredDefaultChat?.providerData;
		const materializedDefaultChat = await agent.materializeChat(defaultChatUri, chatContext, providerData);
		if (providerData === undefined && materializedDefaultChat?.providerData !== undefined) {
			await this._persistDefaultChatBacking({ session, chat: materializedDefaultChat });
		}
		if (providerData === undefined && materializedDefaultChat?.providerData === undefined) {
			this._logService.warn(`[AgentService] Restoring default chat ${defaultChatUri.toString()} with no persisted or recovered provider backing (agent=${agent.id})`);
		}
		let turns: readonly Turn[];
		try {
			turns = await this._getChatMessages(agent, defaultChatUri, session);
		} catch (err) {
			if (err instanceof ProtocolError) {
				throw err;
			}
			const message = err instanceof Error ? err.message : String(err);
			throw new ProtocolError(JSON_RPC_INTERNAL_ERROR, `Failed to restore session ${sessionStr}: ${message}`);
		}

		// Check for persisted metadata in the session database
		let title = meta.summary ?? 'Session';
		let isRead: boolean | undefined;
		let isArchived: boolean | undefined;
		let persistedConfigValues: Record<string, string> | undefined;
		let changes: ChangesSummary | undefined;
		let gitMetadata: Record<string, string | undefined> | undefined;
		let changesetMetadata: Record<string, string | undefined> | undefined;
		let sessionMetadata: Record<string, unknown> | undefined;
		const ref = this._sessionDataService.tryOpenDatabase?.(session);
		if (ref) {
			try {
				const db = await ref;
				if (db) {
					try {
						const m = await db.object.getMetadataObject({
							customTitle: true,
							[AH_META_IS_READ_DB_KEY]: true,
							[AH_META_IS_ARCHIVED_DB_KEY]: true,
							[AH_META_IS_DONE_DB_KEY]: true,
							configValues: true,
							[AH_META_WORKSPACELESS_DB_KEY]: true,
							[AH_META_ORCHESTRATION_DB_KEY]: true,
							[SESSION_META_MULTI_ROOT_KEY]: true,
							[SESSION_META_FOLDER_PICKER_KEY]: true,
							...GIT_DB_METADATA_KEYS,
							...CHANGESET_DB_METADATA_KEYS,
						});
						if (m.customTitle) {
							title = m.customTitle;
						}
						if (m[AH_META_IS_READ_DB_KEY] !== undefined) {
							isRead = m[AH_META_IS_READ_DB_KEY] === 'true';
						}
						const persistedArchived = m[AH_META_IS_ARCHIVED_DB_KEY] ?? m[AH_META_IS_DONE_DB_KEY];
						if (persistedArchived !== undefined) {
							isArchived = persistedArchived === 'true';
						}

						changesetMetadata = m as Record<string, string | undefined>;
						if (changesetMetadata[META_CHANGES_SUMMARY]) {
							try {
								changes = JSON.parse(changesetMetadata[META_CHANGES_SUMMARY]);
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

						if (gitMetadata[META_GITHUB_STATE]) {
							try {
								const githubState = JSON.parse(gitMetadata[META_GITHUB_STATE]);
								sessionMetadata = {
									...(sessionMetadata ? sessionMetadata : {}),
									[SESSION_META_GITHUB_KEY]: githubState
								};
							} catch (err) {
								this._logService.warn(`[AgentService] Failed to parse GitHub state for ${sessionStr}: ${toErrorMessage(err)}`);
							}
						}

						if (gitMetadata[META_SOURCE_CONTROL_STATE]) {
							try {
								sessionMetadata = withSessionSourceControlState(sessionMetadata, parsePersistedSourceControlState(gitMetadata[META_SOURCE_CONTROL_STATE]));
							} catch (err) {
								this._logService.warn(`[AgentService] Failed to parse source-control state for ${sessionStr}: ${toErrorMessage(err)}`);
							}
						}

						if (m[AH_META_WORKSPACELESS_DB_KEY] !== undefined) {
							sessionMetadata = withSessionWorkspaceless(sessionMetadata, m[AH_META_WORKSPACELESS_DB_KEY] === 'true');
						}
						const orchestration = parseSessionOrchestration(m[AH_META_ORCHESTRATION_DB_KEY]);
						if (orchestration) {
							sessionMetadata = withSessionOrchestration(sessionMetadata, orchestration);
						}
						sessionMetadata = withSessionMultiRootMetadata(sessionMetadata, parseSessionMultiRootMetadata(m[SESSION_META_MULTI_ROOT_KEY]));
						sessionMetadata = withSessionFolderPickerDecision(sessionMetadata, parseSessionFolderPickerDecision(m[SESSION_META_FOLDER_PICKER_KEY]));

						if (m.configValues) {
							try {
								persistedConfigValues = JSON.parse(m.configValues);
							} catch (err) {
								this._logService.warn(`[AgentService] Failed to parse persisted configValues for ${sessionStr}: ${toErrorMessage(err)}`);
							}
						}
					} finally {
						db.dispose();
					}
				}
			} catch {
				// Best-effort: fall back to agent-provided metadata
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
		restoredMeta = withSessionExternal(restoredMeta, external);
		const summary: SessionSummary = {
			resource: sessionStr,
			provider: agent.id,
			title,
			status,
			createdAt: new Date(meta.startTime).toISOString(),
			modifiedAt: new Date(meta.modifiedTime).toISOString(),
			...(meta.project ? { project: { uri: meta.project.uri.toString(), displayName: meta.project.displayName } } : {}),
			changes: meta.changes ?? changes,
			workingDirectories: meta.workingDirectories?.map(d => d.toString()),
			_meta: restoredMeta,
		};

		const [defaultDraft, defaultChatTitle] = await Promise.all([
			this._getChatDraft(session, defaultChatUri),
			this._readPersistedChatTitle(session, defaultChatUri),
		]);
		const restoredDraft = meta.model
			? { ...(defaultDraft ?? { text: '', origin: { kind: MessageKind.User } }), model: meta.model }
			: defaultDraft;
		const mergedTurns = await this._interleaveLocalTurns(sessionStr, defaultChatUri.toString(), turns);
		const registered = await this._retryRegistryMutation(
			() => this._sessionRegistry.register(session, { provider: agent.id, startTime: meta.startTime, source: registrationSource }, { checkTombstone: true }),
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
		this._stateManager.restoreSession(summary, mergedTurns, { draft: restoredDraft, defaultChatTitle });
		this._serverToolHost.advertise(sessionStr);

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
		await this._registerRestoredSubagentSummaries(agent, session, mergedTurns);

		// Register persisted peer-chat catalog metadata. Their provider backings
		// and histories are restored when a peer chat is first requested.
		promises.push(this._restorePeerChats(agent, session));

		// Register the static changeset URIs and reseed them from any
		// persisted file lists in the batched metadata read. The catalogue
		// itself is seeded on `state.changesets` synchronously by the
		// `setSessionChangesets` call above. The coordinator drains any
		// uncommitted refresh deferred by an earlier `addSubscriber` —
		// `addSubscriber`'s 0→1 trigger may have fired for
		// `<session>/changeset/uncommitted` before this restore ran (e.g.
		// active-session autorun subscribing in parallel with the
		// chat-view); now that `summary.workingDirectory` is populated,
		// re-triggering the refresh dispatches to the compute path.
		this._changesetCoordinator.onSessionRestored(sessionStr, changesetMetadata ?? {});

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
			}),
			agent.getChatCustomizations(defaultChatUri, chatContext, this._hostCustomizations(session)).catch(err => {
				this._logService.error('[AgentService] restoreSession: failed to resolve chat customizations', err);
				return undefined;
			}),
			...promises
		]);
		if (restoredConfig) {
			this._stateManager.setSessionConfig(sessionStr, restoredConfig);
		}
		this._agentMergeController.onSessionAvailable(sessionStr);
		// Seed restored session customizations into state so the very first
		// snapshot after selecting an existing session contains effective
		// instructions/agents without waiting for a follow-up republish.
		if (restoredCustomizations && restoredCustomizations.length > 0) {
			this._stateManager.setSessionCustomizations(sessionStr, restoredCustomizations);
		}

		this._logService.info(`[AgentService] Restored session ${sessionStr} with ${turns.length} turns`);

		void this._gitStateService.attachSessionGitHubPullRequest(sessionStr, meta.workingDirectories?.[0]);

		return {
			turnCount: mergedTurns.length,
			hasProject: !!meta.project,
			hasWorktree: adoptedWorktree,
			workingDirectoryCount: meta.workingDirectories?.length ?? 0,
		};
	}

	/**
	 * Restores the additional (non-default) peer chats for a session.
	 *
	 * Enumeration is driven by the orchestrator's OWN persisted catalog (the
	 * {@link PEER_CHATS_METADATA_KEY} blob). Each catalog entry is registered
	 * immediately with its persisted title, draft, origin, and provider data.
	 * Its backing and history remain unloaded until the peer chat is requested.
	 *
	 * When the orchestrator catalog is absent ({@link _readPersistedPeerChatCatalog}
	 * returns `undefined`) the session predates orchestrator-owned persistence:
	 * a one-time migration ({@link _migrateLegacyPeerChats}) drains the agent's
	 * legacy `*.chats` enumeration into the catalog so it is never consulted
	 * again.
	 */
	private async _restorePeerChats(agent: IAgent, session: URI): Promise<void> {
		const persisted = await this._readPersistedPeerChatCatalog(session);
		if (persisted !== undefined) {
			// The orchestrator owns the catalog: enumerate from it.
			await this._restorePeerChatsFromCatalog(session, persisted);
			return;
		}
		// No orchestrator catalog yet: one-time migration from legacy `*.chats`.
		await this._migrateLegacyPeerChats(agent, session);
	}

	/**
	 * One-time migration for sessions persisted before the orchestrator owned
	 * the peer-chat catalog: enumerate the agent's legacy `*.chats`
	 * ({@link IAgent.listLegacyChatBackings}), register them via the same path as the
	 * new catalog, then write the orchestrator {@link PEER_CHATS_METADATA_KEY}
	 * blob so subsequent restores read the new catalog and never consult the
	 * legacy read again. No-op when the agent has no legacy enumeration or none
	 * is persisted.
	 */
	private async _migrateLegacyPeerChats(agent: IAgent, session: URI): Promise<void> {
		const legacy = await agent.listLegacyChatBackings?.(session);
		if (!legacy || legacy.length === 0) {
			// Write an empty catalog sentinel so `_readPersistedPeerChatCatalog`
			// returns `[]` on subsequent restores and this migration never re-runs.
			await this._enqueuePeerChatCatalogWrite(session, () => []);
			return;
		}
		const entries: IPersistedPeerChat[] = legacy.map(chat => ({
			uri: chat.uri.toString(),
			...(chat.providerData !== undefined ? { providerData: chat.providerData } : {}),
		}));
		await this._restorePeerChatsFromCatalog(session, entries);
		// Single atomic write: the key is absent before and complete after, so no
		// partial catalog can survive a crash mid-migration (which would make
		// `_readPersistedPeerChatCatalog` return a proper subset and permanently
		// skip re-migration). The callback takes no parameter so `entries` here is
		// the full migrated set, not the (absent) current catalog.
		await this._enqueuePeerChatCatalogWrite(session, () => [...entries]);
	}

	/**
	 * Registers a set of peer chats from an enumerated catalog in catalog order.
	 * Titles and drafts are metadata-only reads; backing sessions and histories
	 * are loaded on the first content request.
	 */
	private async _restorePeerChatsFromCatalog(session: URI, entries: readonly IPersistedPeerChat[]): Promise<void> {
		const restored = await Promise.all(entries.map(async (entry) => {
			let chatUri: URI;
			try {
				chatUri = URI.parse(entry.uri);
			} catch (err) {
				this._logService.warn(`[AgentService] Skipping malformed persisted peer chat URI '${entry.uri}': ${toErrorMessage(err)}`);
				return undefined;
			}
			const [title, draft] = await Promise.all([
				this._readPersistedChatTitle(session, chatUri),
				this._getChatDraft(session, chatUri),
			]);
			return { chatUri, title, draft, providerData: entry.providerData, origin: entry.origin };
		}));
		for (const item of restored) {
			if (!item) {
				continue;
			}
			const { chatUri, title, draft, providerData, origin } = item;
			if (this._stateManager.getChatState(chatUri.toString())) {
				continue;
			}
			this._stateManager.registerRestoredChatSummary(session.toString(), chatUri.toString(), {
				title,
				draft,
				providerData,
				origin,
				resolver: currentProviderData => this._materializeRestoredPeerChat(session, chatUri, currentProviderData),
			});
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
	 */
	private async _materializeRestoredPeerChat(session: URI, chat: URI, providerData: string | undefined): Promise<{ turns: Turn[] }> {
		const chatKey = chat.toString();
		const agent = this._findProviderForSession(session);
		if (!agent) {
			throw new Error(`No agent provider for restored peer chat: ${chatKey}`);
		}
		try {
			const result = await agent.materializeChat(chat, this._chatContext(session, chat), providerData);
			if (result?.backingSession) {
				await this._markChatBacking(result.backingSession, chat);
			}
			const turns = await this._getChatMessages(agent, chat, session);
			return { turns: await this._interleaveLocalTurns(session.toString(), chatKey, turns) };
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
		const sessionStr = parseDefaultChatUri(e.chat);
		if (sessionStr === undefined) {
			this._logService.warn(`[AgentService] onDidChangeChatData for malformed chat URI: ${e.chat.toString()}`);
			return;
		}
		if (isDefaultChatUri(e.chat)) {
			void this._persistDefaultChatBacking({ session: URI.parse(sessionStr), chat: e })
				.catch(err => this._logService.error(err, `[AgentService] Failed to persist default-chat backing for ${e.chat.toString()}`));
			return;
		}
		const session = this._stateManager.getSessionState(sessionStr);
		if (this._disposingPeerChats.has(e.chat.toString()) || !session?.chats.some(chat => chat.resource.toString() === e.chat.toString())) {
			return;
		}
		this._stateManager.updateChatProviderData(e.chat.toString(), e.providerData);
		void this._persistPeerChat(URI.parse(sessionStr), e.chat, e.providerData)
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
		const spawn = SubagentChatSignal.toSpawnEvent(signal);
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
	 * Routes an agent-spawned chat (e.g. a sub-agent delegated by a tool
	 * call) straight into the chat catalog via {@link IAgentHostStateManager.addChat},
	 * so harness-spawned chats and user-driven chats share ONE membership path.
	 * The {@link IAgentSpawnChatEvent.parent} spawn edge is recorded as
	 * the chat's {@link ChatOriginKind.Tool} origin. Spawned chats are
	 * not written to the orchestrator's persisted peer-chat catalog — they are
	 * transient children re-derived from the parent's event log on restore.
	 */
	private _onChatSpawned(e: IAgentSpawnChatEvent): void {
		this._stateManager.addChat(e.session.toString(), e.chat.toString(), {
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
	private async _persistDefaultChatBacking(created: IAgentCreateSessionResult): Promise<void> {
		const providerData = created.chat?.providerData;
		let providerDataError: Error | undefined;
		if (providerData !== undefined) {
			const ref = this._sessionDataService.openDatabase(created.session);
			try {
				await ref.object.setMetadata(DEFAULT_CHAT_PROVIDER_DATA_METADATA_KEY, providerData);
			} catch (err) {
				this._logService.warn(`[AgentService] failed to persist default-chat provider data for ${created.session.toString()}`, err);
				providerDataError = err instanceof Error ? err : new Error(String(err));
			} finally {
				ref.dispose();
			}
		}
		if (created.chat?.backingSession) {
			await this._markChatBacking(created.chat.backingSession, URI.parse(buildDefaultChatUri(created.session)));
		}
		if (providerDataError) {
			throw providerDataError;
		}
	}

	private async _readDefaultChatProviderData(session: URI): Promise<string | undefined> {
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

	/**
	 * Reads the orchestrator's persisted peer-chat catalog for a session.
	 * Returns `undefined` when the session has no catalog yet (a legacy session
	 * predating orchestrator-owned persistence, or a corrupt blob); the caller
	 * then performs a one-time migration from the agent's legacy `*.chats`
	 * enumeration (see {@link _restorePeerChats} / {@link _migrateLegacyPeerChats}).
	 * An empty array means the session is known to have no peer chats, so
	 * migration is skipped.
	 */
	private async _readPersistedPeerChatCatalog(session: URI): Promise<IPersistedPeerChat[] | undefined> {
		const ref = await this._sessionDataService.tryOpenDatabase?.(session);
		if (!ref) {
			return undefined;
		}
		try {
			const raw = await ref.object.getMetadata(PEER_CHATS_METADATA_KEY);
			if (raw === undefined) {
				return undefined;
			}
			const parsed = JSON.parse(raw);
			if (!Array.isArray(parsed)) {
				this._logService.warn(`[AgentService] Ignoring malformed peer-chat catalog for ${session.toString()}`);
				return undefined;
			}
			return parsed
				.filter((entry): entry is IPersistedPeerChat => typeof entry?.uri === 'string')
				.map(entry => ({
					uri: entry.uri,
					...(typeof entry.providerData === 'string' ? { providerData: entry.providerData } : {}),
					...(entry.origin !== undefined ? { origin: entry.origin } : {}),
				}));
		} catch (err) {
			this._logService.warn(`[AgentService] Failed to read peer-chat catalog for ${session.toString()}: ${toErrorMessage(err)}`);
			return undefined;
		} finally {
			ref.dispose();
		}
	}

	/**
	 * Marks a chat's backing SDK session so legacy discovery cannot register
	 * it as a standalone top-level session. Best-effort and never throws:
	 * callers (chat creation / restore) must not fail just because this
	 * durable write did. The write is retried once; if it still fails, the
	 * backing session is added to `_unpersistedChatBackings` so
	 * `_isChatBacking` (external discovery) and `listSessions`'s overlay filter keep
	 * suppressing it for the rest of this process's lifetime even without a
	 * persisted marker. A later successful call for the same session (e.g. a
	 * retried caller) clears any stale suppression entry.
	 */
	private async _markChatBacking(backingSession: URI, chat: URI): Promise<void> {
		const backingSessionStr = backingSession.toString();
		const write = async (): Promise<void> => {
			const ref = this._sessionDataService.openDatabase(backingSession);
			try {
				await ref.object.setMetadata(CHAT_BACKING_METADATA_KEY, chat.toString());
			} finally {
				ref.dispose();
			}
		};
		try {
			await write();
			this._unpersistedChatBackings.delete(backingSessionStr);
		} catch (err) {
			this._logService.warn(`[AgentService] failed to mark backing session ${backingSessionStr} for chat ${chat.toString()}, retrying`, err);
			try {
				await write();
				this._unpersistedChatBackings.delete(backingSessionStr);
			} catch (retryErr) {
				this._logService.warn(`[AgentService] retry failed to mark backing session ${backingSessionStr} for chat ${chat.toString()}; suppressing it in-process instead`, retryErr);
				this._unpersistedChatBackings.add(backingSessionStr);
			}
		}
	}

	/**
	 * Inserts or updates a single peer chat in the orchestrator's persisted
	 * catalog, recording its opaque `providerData` verbatim (or clearing it when
	 * `undefined`). When `origin` is supplied it is stored as the chat's
	 * provenance; when omitted (e.g. a provider-driven `providerData` refresh via
	 * {@link _onChatDataChanged}) any previously persisted origin is preserved so
	 * a data refresh never drops a side chat's source boundary. Serialized per
	 * session via {@link _enqueuePeerChatCatalogWrite}.
	 */
	private _persistPeerChat(session: URI, chat: URI, providerData: string | undefined, origin?: ChatOrigin): Promise<void> {
		const chatUri = chat.toString();
		return this._enqueuePeerChatCatalogWrite(session, entries => {
			const existing = entries.find(entry => entry.uri === chatUri);
			const effectiveOrigin = origin ?? existing?.origin;
			const next = entries.filter(entry => entry.uri !== chatUri);
			next.push({
				uri: chatUri,
				...(providerData !== undefined ? { providerData } : {}),
				...(effectiveOrigin !== undefined ? { origin: effectiveOrigin } : {}),
			});
			return next;
		});
	}

	/**
	 * Removes a peer chat from the orchestrator's persisted catalog. Serialized
	 * per session via {@link _enqueuePeerChatCatalogWrite}.
	 */
	private _removePersistedPeerChat(session: URI, chat: URI): Promise<void> {
		const chatUri = chat.toString();
		return this._enqueuePeerChatCatalogWrite(session, entries => entries.filter(entry => entry.uri !== chatUri));
	}

	/**
	 * Chains a read-modify-write of a session's persisted peer-chat catalog
	 * behind any in-flight write for the same session, so concurrent
	 * create/dispose/data-change updates can't clobber each other.
	 */
	private _enqueuePeerChatCatalogWrite(session: URI, mutate: (entries: IPersistedPeerChat[]) => IPersistedPeerChat[]): Promise<void> {
		const key = session.toString();
		const previous = this._peerChatCatalogWrites.get(key) ?? Promise.resolve();
		const next = previous
			.catch(() => { /* a failed prior write must not block later ones */ })
			.then(() => this._applyPeerChatCatalogWrite(session, mutate));
		const clear = () => {
			if (this._peerChatCatalogWrites.get(key) === tracked) {
				this._peerChatCatalogWrites.delete(key);
			}
		};
		const tracked = next.then(clear, error => {
			clear();
			throw error;
		});
		this._peerChatCatalogWrites.set(key, tracked);
		return tracked;
	}

	private async _applyPeerChatCatalogWrite(session: URI, mutate: (entries: IPersistedPeerChat[]) => IPersistedPeerChat[]): Promise<void> {
		const ref = this._sessionDataService.openDatabase(session);
		try {
			let current: IPersistedPeerChat[] = [];
			try {
				const raw = await ref.object.getMetadata(PEER_CHATS_METADATA_KEY);
				if (raw !== undefined) {
					const parsed = JSON.parse(raw);
					if (Array.isArray(parsed)) {
						current = parsed
							.filter((entry): entry is IPersistedPeerChat => typeof entry?.uri === 'string')
							.map(entry => ({
								uri: entry.uri,
								...(typeof entry.providerData === 'string' ? { providerData: entry.providerData } : {}),
								...(entry.origin !== undefined ? { origin: entry.origin } : {}),
							}));
					}
				}
			} catch (err) {
				this._logService.warn(`[AgentService] Replacing malformed peer-chat catalog for ${session.toString()}: ${toErrorMessage(err)}`);
			}
			const updated = mutate(current);
			await ref.object.setMetadata(PEER_CHATS_METADATA_KEY, JSON.stringify(updated));
		} finally {
			ref.dispose();
		}
	}

	/** Reads a chat's persisted custom title (default or peer chat), if any. */
	private async _readPersistedChatTitle(session: URI, chatUri: URI): Promise<string | undefined> {
		const ref = await this._sessionDataService.tryOpenDatabase?.(session);
		if (!ref) {
			return undefined;
		}
		try {
			return (await ref.object.getMetadata(`customChatTitle:${chatUri.toString()}`)) ?? undefined;
		} catch {
			return undefined;
		} finally {
			ref.dispose();
		}
	}

	private async _getChatDraft(session: URI, chatUri: URI): Promise<Message | undefined> {
		const ref = await this._sessionDataService.tryOpenDatabase(session);
		if (!ref) {
			return undefined;
		}
		try {
			return await ref.object.getChatDraft(chatUri);
		} finally {
			ref.dispose();
		}
	}

	private async _getSessionMetadataForRestore(agent: IAgent, session: URI, external: boolean): Promise<IAgentSessionMetadata | undefined> {
		const sessionStr = session.toString();
		const chat = URI.parse(buildDefaultChatUri(session));
		try {
			const metadata = await agent.getChatMetadata(chat, this._chatContext(session, chat), await this._readDefaultChatProviderData(session));
			return await this._withWorktreeProject(session, metadata ? this._toSessionMetadata(metadata) : undefined);
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
		if (!meta || !this._worktree) {
			return meta;
		}
		const project = await this._worktree.resolveWorktreeProject(session);
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
		return allSessions?.find(candidate => candidate.session.toString() === sessionStr);
	}

	async resourceRead(uri: URI, encoding: ContentEncoding = ContentEncoding.Utf8): Promise<ResourceReadResult> {
		const editAttributionRequest = parseEditAttributionResource(uri);
		if (editAttributionRequest?.kind === 'prepare') {
			const prepared = await this.prepareEditAttributionFlush(editAttributionRequest.params);
			return {
				data: JSON.stringify(prepared ?? null),
				encoding: ContentEncoding.Utf8,
				contentType: 'application/json',
			};
		}
		if (editAttributionRequest?.kind === 'commit') {
			const result = await this.commitEditAttributionFlush(editAttributionRequest.params);
			return {
				data: JSON.stringify(result),
				encoding: ContentEncoding.Utf8,
				contentType: 'application/json',
			};
		}
		if (editAttributionRequest?.kind === 'cancel') {
			const result = await this.cancelEditAttributionFlush(editAttributionRequest.params);
			return {
				data: JSON.stringify(result),
				encoding: ContentEncoding.Utf8,
				contentType: 'application/json',
			};
		}

		// Handle session-db: URIs that reference file-edit content stored
		// in a per-session SQLite database.
		const dbFields = parseSessionDbUri(uri.toString());
		if (dbFields) {
			return this._fetchSessionDbContent(dbFields);
		}

		// Handle git-blob: URIs that reference file content at a specific
		// git commit (the merge-base used as diff baseline). The URI
		// encodes the session it belongs to so we can find the right
		// working directory to run `git show` from.
		const blobFields = parseGitBlobUri(uri.toString());
		if (blobFields) {
			return this._fetchGitBlobContent(blobFields);
		}

		try {
			const content = await this._fileService.readFile(uri);
			return {
				data: encoding === ContentEncoding.Base64 ? encodeBase64(content.value) : content.value.toString(),
				encoding,
				contentType: getMediaOrTextMime(uri.path) ?? 'application/octet-stream',
			};
		} catch (e) {
			const error = e instanceof Error ? e : new Error(String(e));
			const result = toFileOperationResult(error);
			if (result === FileOperationResult.FILE_NOT_FOUND) {
				throw new ProtocolError(AhpErrorCodes.NotFound, `Content not found: ${uri.toString()}`);
			}
			if (result === FileOperationResult.FILE_PERMISSION_DENIED) {
				throw new ProtocolError(AhpErrorCodes.PermissionDenied, `Permission denied: ${uri.toString()}`);
			}
			throw new ProtocolError(JSON_RPC_INTERNAL_ERROR, `Failed to read content: ${uri.toString()}: ${toErrorMessage(error)}`);
		}
	}

	prepareEditAttributionFlush(params: IPrepareEditAttributionFlushParams): Promise<IPreparedEditAttributionFlush | undefined> {
		return this._editAttributionService?.prepareFlush(params) ?? Promise.resolve(undefined);
	}

	commitEditAttributionFlush(params: ICommitEditAttributionFlushParams): Promise<IEditAttributionFlushResult> {
		return this._editAttributionService?.commitFlush(params) ?? Promise.resolve({ outcome: 'missing', agentModifiedCount: 0 });
	}

	cancelEditAttributionFlush(params: ICancelEditAttributionFlushParams): Promise<IEditAttributionFlushResult> {
		return this._editAttributionService?.cancelFlush(params) ?? Promise.resolve({ outcome: 'missing', agentModifiedCount: 0 });
	}

	async resourceWrite(params: ResourceWriteParams): Promise<ResourceWriteResult> {
		const fileUri = typeof params.uri === 'string' ? URI.parse(params.uri) : URI.revive(params.uri);
		try {
			const parent = await this._fileService.stat(resourcesDirname(fileUri));
			if (!parent.isDirectory) {
				throw new ProtocolError(AhpErrorCodes.NotFound, `Parent directory not found: ${fileUri.toString()}`);
			}
		} catch (e) {
			if (e instanceof ProtocolError) {
				throw e;
			}
			const result = toFileOperationResult(e as Error);
			if (result === FileOperationResult.FILE_PERMISSION_DENIED) {
				throw new ProtocolError(AhpErrorCodes.PermissionDenied, `Permission denied: ${fileUri.toString()}`);
			}
			throw new ProtocolError(AhpErrorCodes.NotFound, `Parent directory not found: ${fileUri.toString()}`);
		}
		let content: VSBuffer;
		if (params.encoding === ContentEncoding.Base64) {
			content = decodeBase64(params.data);
		} else {
			content = VSBuffer.fromString(params.data);
		}
		const mode = params.mode ?? ResourceWriteMode.Truncate;
		const position = params.position ?? 0;
		try {
			await this._resourceWriteQueue.queueFor(fileUri, async () => {
				if (params.ifMatch !== undefined || mode !== ResourceWriteMode.Truncate || position !== 0) {
					await this._resourceWriteWithMode(fileUri, content, mode, position, params);
				} else if (params.createOnly) {
					await this._createFileExclusive(fileUri, content);
				} else {
					await this._fileService.writeFile(fileUri, content);
				}
			}, extUriBiasedIgnorePathCase);
			return {};
		} catch (e) {
			if (e instanceof ProtocolError) {
				throw e;
			}
			const result = toFileOperationResult(e as Error);
			if (params.createOnly && (result === FileOperationResult.FILE_MODIFIED_SINCE || result === FileOperationResult.FILE_MOVE_CONFLICT)) {
				throw new ProtocolError(AhpErrorCodes.AlreadyExists, `File already exists: ${fileUri.toString()}`);
			}
			if (result === FileOperationResult.FILE_MODIFIED_SINCE) {
				const message = params.ifMatch !== undefined
					? `ifMatch precondition failed for: ${fileUri.toString()}`
					: `File changed while writing: ${fileUri.toString()}`;
				throw new ProtocolError(AhpErrorCodes.Conflict, message);
			}
			if (result === FileOperationResult.FILE_MOVE_CONFLICT) {
				throw new ProtocolError(AhpErrorCodes.AlreadyExists, `File already exists: ${fileUri.toString()}`);
			}
			if (result === FileOperationResult.FILE_PERMISSION_DENIED) {
				throw new ProtocolError(AhpErrorCodes.PermissionDenied, `Permission denied: ${fileUri.toString()}`);
			}
			throw new ProtocolError(AhpErrorCodes.NotFound, `Failed to write file: ${fileUri.toString()}`);
		}
	}

	private async _createFileExclusive(fileUri: URI, content: VSBuffer): Promise<void> {
		if (fileUri.scheme !== Schemas.file) {
			await this._fileService.createFile(fileUri, content, { overwrite: false });
			return;
		}

		let handle: FileHandle;
		try {
			handle = await open(fileUri.fsPath, 'wx');
		} catch (error) {
			if (isErrorWithCode(error, 'EEXIST')) {
				throw new ProtocolError(AhpErrorCodes.AlreadyExists, `File already exists: ${fileUri.toString()}`);
			}
			throw error;
		}

		let failure: unknown;
		try {
			await handle.writeFile(content.buffer);
		} catch (error) {
			failure = error;
		}
		try {
			await handle.close();
		} catch (error) {
			failure = failure ? new AggregateError([failure, error]) : error;
		}
		if (failure) {
			try {
				await unlink(fileUri.fsPath);
			} catch (cleanupError) {
				throw new AggregateError([failure, cleanupError], `Failed to create and clean up file: ${fileUri.toString()}`);
			}
			throw failure;
		}
	}

	/**
	 * Slow-path for {@link resourceWrite} when the caller requested a
	 * non-default {@link ResourceWriteMode}, supplied a `position`, or
	 * provided an `ifMatch` etag precondition. Reads the current file
	 * contents (when needed) and produces a single `writeFile` call that
	 * realises the requested splice. A missing file is treated as
	 * empty for `append` and `insert` (so the operation behaves like a
	 * create); for `truncate` it falls through to a normal write.
	 */
	private async _resourceWriteWithMode(
		fileUri: URI,
		data: VSBuffer,
		mode: ResourceWriteMode,
		position: number,
		params: ResourceWriteParams,
	): Promise<void> {
		let existing: VSBuffer | undefined;
		let currentEtag: string | undefined;
		let currentMtime: number | undefined;
		try {
			const file = await this._fileService.readFile(fileUri);
			existing = file.value;
			currentEtag = file.etag;
			currentMtime = file.mtime;
		} catch (e) {
			if (toFileOperationResult(e as Error) !== FileOperationResult.FILE_NOT_FOUND) {
				throw e;
			}
		}

		if (params.createOnly && existing !== undefined) {
			throw new ProtocolError(AhpErrorCodes.AlreadyExists, `File already exists: ${fileUri.toString()}`);
		}

		if (params.ifMatch !== undefined) {
			// Missing file with an ifMatch is always a conflict (the caller
			// believed they had the etag for an existing file).
			if (existing === undefined || currentEtag !== params.ifMatch) {
				throw new ProtocolError(AhpErrorCodes.Conflict, `ifMatch precondition failed for: ${fileUri.toString()}`);
			}
		}

		const base = existing ?? VSBuffer.alloc(0);
		let next: VSBuffer;
		switch (mode) {
			case ResourceWriteMode.Append: {
				const eof = base.byteLength;
				const splitAt = Math.max(0, eof - position);
				next = VSBuffer.concat([base.slice(0, splitAt), data, base.slice(splitAt, eof)]);
				break;
			}
			case ResourceWriteMode.Insert: {
				const splitAt = Math.min(position, base.byteLength);
				next = VSBuffer.concat([base.slice(0, splitAt), data, base.slice(splitAt, base.byteLength)]);
				break;
			}
			case ResourceWriteMode.Truncate:
			default: {
				const splitAt = Math.min(position, base.byteLength);
				next = VSBuffer.concat([base.slice(0, splitAt), data]);
				break;
			}
		}
		if (params.createOnly) {
			await this._createFileExclusive(fileUri, next);
		} else {
			await this._fileService.writeFile(fileUri, next, { etag: currentEtag, mtime: currentMtime });
		}
	}

	async resourceCopy(params: ResourceCopyParams): Promise<ResourceCopyResult> {
		const source = URI.parse(params.source);
		const destination = URI.parse(params.destination);
		try {
			await this._fileService.copy(source, destination, !params.failIfExists);
			return {};
		} catch (e) {
			const result = toFileOperationResult(e as Error);
			if (result === FileOperationResult.FILE_MOVE_CONFLICT) {
				throw new ProtocolError(AhpErrorCodes.AlreadyExists, `Destination already exists: ${destination.toString()}`);
			}
			if (result === FileOperationResult.FILE_PERMISSION_DENIED) {
				throw new ProtocolError(AhpErrorCodes.PermissionDenied, `Permission denied: ${source.toString()}`);
			}
			throw new ProtocolError(AhpErrorCodes.NotFound, `Source not found: ${source.toString()}`);
		}
	}

	async resourceDelete(params: ResourceDeleteParams): Promise<ResourceDeleteResult> {
		const fileUri = URI.parse(params.uri);
		try {
			await this._fileService.del(fileUri, { recursive: params.recursive });
			return {};
		} catch (e) {
			if (toFileOperationResult(e as Error) === FileOperationResult.FILE_PERMISSION_DENIED) {
				throw new ProtocolError(AhpErrorCodes.PermissionDenied, `Permission denied: ${fileUri.toString()}`);
			}
			throw new ProtocolError(AhpErrorCodes.NotFound, `Resource not found: ${fileUri.toString()}`);
		}
	}

	async resourceMove(params: ResourceMoveParams): Promise<ResourceMoveResult> {
		const source = URI.parse(params.source);
		const destination = URI.parse(params.destination);
		try {
			await this._fileService.move(source, destination, !params.failIfExists);
			return {};
		} catch (e) {
			const result = toFileOperationResult(e as Error);
			if (result === FileOperationResult.FILE_MOVE_CONFLICT) {
				throw new ProtocolError(AhpErrorCodes.AlreadyExists, `Destination already exists: ${destination.toString()}`);
			}
			if (result === FileOperationResult.FILE_PERMISSION_DENIED) {
				throw new ProtocolError(AhpErrorCodes.PermissionDenied, `Permission denied: ${source.toString()}`);
			}
			throw new ProtocolError(AhpErrorCodes.NotFound, `Source not found: ${source.toString()}`);
		}
	}

	async resourceResolve(params: ResourceResolveParams): Promise<ResourceResolveResult> {
		const uri = typeof params.uri === 'string' ? URI.parse(params.uri) : URI.revive(params.uri);
		try {
			const stat = await this._fileService.stat(uri);
			let type: ResourceType;
			if (stat.isSymbolicLink && params.followSymlinks === false) {
				// `IFileService.stat` always follows symlinks in its
				// type-classification logic, so `followSymlinks: false`
				// only changes how we report the result — we surface the
				// link itself rather than the target.
				type = ResourceType.Symlink;
			} else if (stat.isDirectory) {
				type = ResourceType.Directory;
			} else {
				type = ResourceType.File;
			}
			const result: ResourceResolveResult = {
				uri: uri.toString(),
				type,
				...(stat.size !== undefined ? { size: stat.size } : {}),
				...(stat.mtime !== undefined ? { mtime: new Date(stat.mtime).toISOString() } : {}),
				...(stat.ctime !== undefined ? { ctime: new Date(stat.ctime).toISOString() } : {}),
				...(stat.etag ? { etag: stat.etag } : {}),
			};
			return result;
		} catch (e) {
			if (toFileOperationResult(e as Error) === FileOperationResult.FILE_PERMISSION_DENIED) {
				throw new ProtocolError(AhpErrorCodes.PermissionDenied, `Permission denied: ${uri.toString()}`);
			}
			throw new ProtocolError(AhpErrorCodes.NotFound, `Resource not found: ${uri.toString()}`);
		}
	}

	async resourceMkdir(params: ResourceMkdirParams): Promise<ResourceMkdirResult> {
		const uri = typeof params.uri === 'string' ? URI.parse(params.uri) : URI.revive(params.uri);
		try {
			// `IFileService.createFolder` is idempotent for an existing
			// directory and creates parents as needed, matching the
			// `mkdir -p` semantics required by the spec.
			const existing = await this._fileService.stat(uri).catch(() => undefined);
			if (existing && !existing.isDirectory) {
				throw new ProtocolError(AhpErrorCodes.AlreadyExists, `Path exists and is not a directory: ${uri.toString()}`);
			}
			await this._fileService.createFolder(uri);
			return {};
		} catch (e) {
			if (e instanceof ProtocolError) {
				throw e;
			}
			if (toFileOperationResult(e as Error) === FileOperationResult.FILE_PERMISSION_DENIED) {
				throw new ProtocolError(AhpErrorCodes.PermissionDenied, `Permission denied: ${uri.toString()}`);
			}
			throw new ProtocolError(AhpErrorCodes.NotFound, `Failed to create directory: ${uri.toString()}`);
		}
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
		const promises: Promise<void>[] = [];
		for (const provider of this._providers.values()) {
			promises.push(provider.shutdown());
		}
		try {
			await Promises.settled(promises);
		} finally {
			await this._debugLogsCollector?.cleanup();
			await this._orchestratorDatabase.close();
			this._sessionToProvider.clear();
			this._downloadProgressInterest.clear();
		}
	}

	/**
	 * Wire the network diagnostics service backing {@link getNetworkDiagnosticsInfo}
	 * and {@link diagnosticsFetch}. A setter rather than a constructor argument
	 * because the service depends on the agent-host proxy resolver, which the
	 * remote server constructs lazily — after this service.
	 */
	setNetworkDiagnosticsService(service: INetworkDiagnosticsService): void {
		this._networkDiagnostics = service;
	}

	setEditAttributionService(service: IAgentEditAttributionService): void {
		this._editAttributionService = service;
		service.setEnabled(this._stateManager.rootState.config?.values[AgentHostEditTelemetryEnabledConfigKey] !== false);
	}

	async getNetworkDiagnosticsInfo(): Promise<IAgentHostNetworkDiagnosticsInfo> {
		if (!this._networkDiagnostics) {
			throw new Error('Network diagnostics unavailable: service not wired');
		}
		const providers = [...this._providers.values()];
		const contributions = await Promise.all(providers.map(async provider => {
			try {
				return await provider.getNetworkDiagnosticsEndpoints?.() ?? [];
			} catch (error) {
				this._logService.warn(`[AgentService] Failed to resolve network diagnostics endpoints for ${provider.id}: ${error instanceof Error ? error.message : String(error)}`);
				return [];
			}
		}));
		const accounts = await Promise.all(providers.map(async provider => {
			try {
				return await provider.getNetworkDiagnosticsAccount?.();
			} catch (error) {
				this._logService.warn(`[AgentService] Failed to resolve network diagnostics account for ${provider.id}: ${error instanceof Error ? error.message : String(error)}`);
				return undefined;
			}
		}));
		const endpoints: IAgentHostNetworkEndpoint[] = [];
		const seen = new Set<string>();
		for (const endpoint of contributions.flat()) {
			let key: string;
			try {
				key = new URL(endpoint.url).toString();
			} catch {
				key = endpoint.url;
			}
			if (!seen.has(key)) {
				seen.add(key);
				endpoints.push(endpoint);
			}
		}
		return this._networkDiagnostics.getInfo(endpoints, accounts.find(account => !!account));
	}

	async getManagedSettingsDiagnostics(): Promise<readonly IAgentHostManagedSettingsDiagnostics[]> {
		const providers = [...this._providers.values()].filter(provider => provider.getManagedSettingsDiagnostics);
		return Promise.all(providers.map(async provider => {
			try {
				return { provider: provider.id, snapshot: await provider.getManagedSettingsDiagnostics!() };
			} catch (error) {
				return { provider: provider.id, error: error instanceof Error ? error.message : String(error) };
			}
		}));
	}

	async diagnosticsFetch(url: string): Promise<IAgentHostNetworkFetchResult> {
		if (!this._networkDiagnostics) {
			throw new Error('Network diagnostics unavailable: service not wired');
		}
		return this._networkDiagnostics.fetch(url);
	}

	async collectDebugLogs(session: URI | undefined, kind: AgentHostDebugLogsArtifactKind): Promise<IAgentHostDebugLogsArtifact> {
		if (!this._debugLogsCollector) {
			throw new Error('Agent Host debug log collection is unavailable');
		}
		const providers = session
			? [this._findProviderForSession(session)].filter((provider): provider is IAgent => provider !== undefined)
			: [...this._providers.values()];
		if (providers.length === 0) {
			throw new Error(session
				? `No Agent Host provider is available for session ${session.toString()}`
				: 'No Agent Host providers are available for debug-log collection');
		}
		return this._debugLogsCollector.collect(providers, session, kind);
	}

	async readDebugLogsChunk(resource: URI, position: number): Promise<IAgentHostDebugLogsChunk> {
		if (!this._debugLogsCollector) {
			throw new Error('Agent Host debug log collection is unavailable');
		}
		return this._debugLogsCollector.readArtifactChunk(resource, position);
	}

	// ---- helpers ------------------------------------------------------------

	private async _fetchSessionDbContent(fields: ISessionDbUriFields): Promise<ResourceReadResult> {
		const sessionUri = URI.parse(fields.sessionUri);
		const ref = this._sessionDataService.openDatabase(sessionUri);
		try {
			const content = await ref.object.readFileEditContent(fields.toolCallId, fields.filePath);
			if (!content) {
				throw new ProtocolError(AhpErrorCodes.NotFound, `File edit not found: toolCallId=${fields.toolCallId}, filePath=${fields.filePath}`);
			}
			const bytes = fields.part === 'before' ? content.beforeContent : content.afterContent;
			if (!bytes) {
				throw new ProtocolError(AhpErrorCodes.NotFound, `No ${fields.part} content for: toolCallId=${fields.toolCallId}, filePath=${fields.filePath}`);
			}
			return {
				data: new TextDecoder().decode(bytes),
				encoding: ContentEncoding.Utf8,
				contentType: 'text/plain',
			};
		} finally {
			ref.dispose();
		}
	}

	private async _fetchGitBlobContent(fields: IGitBlobUriFields): Promise<ResourceReadResult> {
		if (!this._gitService) {
			throw new ProtocolError(AhpErrorCodes.NotFound, `git service unavailable for: ${fields.repoRelativePath}`);
		}
		const owningSession = this._sessionReleaseResource(URI.parse(fields.sessionUri));
		const wasRestored = !!this._stateManager.getSessionState(owningSession.toString());
		try {
			if (!wasRestored) {
				await this.restoreSession(owningSession);
			}
			const workingDirectory = await this._resolveGitBlobWorkingDirectory(fields, owningSession);
			if (!workingDirectory) {
				throw new ProtocolError(AhpErrorCodes.NotFound, `No session repository resolves git-blob path: ${fields.absolutePath || fields.repoRelativePath}`);
			}
			const blob = await this._gitService.showBlob(workingDirectory, fields.sha, fields.repoRelativePath);
			if (!blob) {
				throw new ProtocolError(AhpErrorCodes.NotFound, `git blob not found: ${fields.sha}:${fields.repoRelativePath}`);
			}
			return {
				data: blob.toString(),
				encoding: ContentEncoding.Utf8,
				contentType: 'text/plain',
			};
		} finally {
			if (!wasRestored && this._stateManager.getSessionState(owningSession.toString()) && !this._hasSessionSubscribers(owningSession)) {
				this._scheduleSessionRelease(owningSession);
			}
		}
	}

	/**
	 * Picks the working directory to run `git show` from for a `git-blob:` URI.
	 *
	 * The directory is chosen only from the session's own, server-trusted working
	 * directories — never from anything client-supplied — so opening a diff can
	 * never be steered into an arbitrary repository. `fields.absolutePath` (the
	 * file's absolute path, carried in the URI) is used only to *select* which
	 * repo to run in; it is never used as the cwd itself.
	 *
	 * Selection rules:
	 * - Single-folder session: return the one working directory directly, without
	 *   a containment check (preserves legacy behavior for relocated/remapped
	 *   worktrees whose stored path no longer sits under the current root).
	 * - Multi-root session: resolve each working directory to its repo root and
	 *   return the deepest root that contains `absolutePath`; if none contains it,
	 *   return `undefined` (→ NotFound) rather than reading from the wrong repo.
	 * - Legacy URI with no `absolutePath` (`''`): fall back to the primary
	 *   working directory, since there is no path to match.
	 *
	 * Examples (roots index 0 = primary):
	 *   [/work/app]                    + /work/app/src/a.ts   → /work/app
	 *   [/work/app]                    + /elsewhere/x.ts      → /work/app
	 *   [/work/app, /work/app/pkgs/ui] + /work/app/pkgs/ui/b  → /work/app/pkgs/ui
	 *   [/work/app, /work/lib]         + /outside/c.ts        → undefined (NotFound)
	 *   [/work/app, /work/lib]         + ''  (legacy)         → /work/app
	 */
	private async _resolveGitBlobWorkingDirectory(fields: IGitBlobUriFields, owningSession: URI): Promise<URI | undefined> {
		const gitService = this._gitService;
		if (!gitService) {
			return undefined;
		}
		const workingDirectories = getEffectiveWorkingDirectories(this._stateManager, fields.sessionUri)
			?? getEffectiveWorkingDirectories(this._stateManager, owningSession.toString());
		// Backwards-compat: no resolvable absolute path means we cannot match a
		// repository root, so fall back to today's primary-directory behavior.
		if (!fields.absolutePath) {
			const primary = workingDirectories?.[0];
			return primary ? URI.parse(primary) : undefined;
		}
		if (!workingDirectories?.length) {
			return undefined;
		}
		// Single-folder sessions keep today's behavior EXACTLY: run against the
		// one working directory directly, without the multi-root path-containment
		// check. This preserves AC-1.1 (single-folder unchanged) — e.g. a
		// git-blob URI whose stored absolute path no longer sits under the
		// current root (a remapped/relocated worktree) still resolves against the
		// primary directory as it did before multi-root support.
		if (!isMultiRootSession(workingDirectories)) {
			return URI.parse(workingDirectories[0]);
		}
		const { gitRepositories } = await resolveSessionRepositories(workingDirectories.map(directory => URI.parse(directory)), gitService);
		if (!gitRepositories.length) {
			return undefined;
		}
		// The absolute path was stored as a bare path (its scheme/authority were
		// dropped when the URI was built); rebuild it against the session roots'
		// own scheme/authority so it lines up with the repository roots.
		const blobResource = gitRepositories[0].with({ path: fields.absolutePath });
		return findDeepestContainingWorkingDirectory(blobResource, gitRepositories);
	}

	/**
	 * Restores a subagent session from its parent session's event history.
	 * Loads the parent's raw messages, filters for events belonging to
	 * the subagent (by `parentToolCallId`), and builds the child session's
	 * turns from those events.
	 */
	private async _restoreSubagentChat(chatUri: string, parentSession: URI, toolCallId: string): Promise<void> {
		if (this._stateManager.getChatState(chatUri)) {
			return;
		}
		const inFlight = this._restoreSubagentInFlight.get(chatUri);
		if (inFlight) {
			return inFlight;
		}
		const restore = this._doRestoreSubagentChat(chatUri, parentSession, toolCallId);
		this._restoreSubagentInFlight.set(chatUri, restore);
		try {
			await restore;
		} finally {
			if (this._restoreSubagentInFlight.get(chatUri) === restore) {
				this._restoreSubagentInFlight.delete(chatUri);
			}
		}
	}

	private async _doRestoreSubagentChat(chatUri: string, parentSession: URI, toolCallId: string): Promise<void> {
		const parentSessionKey = parentSession.toString();
		try {
			await this._restoreSessionInFlight.get(parentSessionKey);
			if (!this._stateManager.getSessionState(parentSessionKey)) {
				await this.restoreSession(parentSession);
			}
		} catch {
			this._logService.warn(`[AgentService] Cannot restore parent session for subagent chat: ${parentSessionKey}`);
			return;
		}
		const parentState = this._stateManager.getSessionState(parentSessionKey);
		const agent = this._findProviderForSession(parentSession);
		if (!parentState || !agent) {
			return;
		}
		// A subagent can be spawned from any chat in the session, including peer
		// chats and nested subagents, so restore must find the chat that ran the
		// spawning tool call instead of assuming the default chat.
		const spawnPoint = this._findSubagentSpawnPoint(parentSessionKey, chatUri, toolCallId);
		const origin = {
			kind: ChatOriginKind.Tool,
			chat: spawnPoint?.chat ?? parentState.defaultChat ?? buildDefaultChatUri(parentSession),
			toolCallId,
		} as const;
		const childTurns = await this._getChatMessages(agent, URI.parse(chatUri), parentSession, origin);
		if (childTurns.length === 0) {
			return;
		}
		const mergedTurns = await this._interleaveLocalTurns(parentSessionKey, chatUri, childTurns);
		this._stateManager.addChat(parentSessionKey, chatUri, {
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
		const defaultChat = parentState.defaultChat ?? buildDefaultChatUri(parentSessionKey);
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

	private async _restoreSubagentSession(subagentUri: string, parentSession: URI): Promise<void> {
		if (this._stateManager.getSessionState(subagentUri)) {
			return;
		}

		const inFlight = this._restoreSubagentInFlight.get(subagentUri);
		if (inFlight) {
			return inFlight;
		}

		const restore = this._doRestoreSubagentSession(subagentUri, parentSession);
		this._restoreSubagentInFlight.set(subagentUri, restore);
		try {
			await restore;
		} finally {
			if (this._restoreSubagentInFlight.get(subagentUri) === restore) {
				this._restoreSubagentInFlight.delete(subagentUri);
			}
		}
	}

	private async _doRestoreSubagentSession(subagentUri: string, parentSession: URI): Promise<void> {
		// Ensure the parent session is loaded first
		const parentSessionKey = parentSession.toString();
		if (!this._stateManager.getSessionState(parentSessionKey)) {
			try {
				await this.restoreSession(parentSession);
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
		const agent = this._findProviderForSession(parentSession);
		if (agent) {
			try {
				const parsedSubagent = parseSubagentSessionUri(URI.parse(subagentUri));
				const origin = parentState.chats.find(chat => chat.resource === subagentUri)?.origin
					?? (parsedSubagent ? {
						kind: ChatOriginKind.Tool,
						chat: parentState.defaultChat ?? buildDefaultChatUri(parentSession),
						toolCallId: parsedSubagent.toolCallId,
					} : undefined);
				childTurns = await this._getChatMessages(agent, URI.parse(subagentUri), parentSession, origin);
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
			},
			mergedChildTurns,
		);
		await this._restoreAnnotations(URI.parse(subagentUri));
		this._logService.info(`[AgentService] Restored subagent session: ${subagentUri} with ${childTurns.length} turn(s)`);
	}

	private async _registerRestoredSubagentSummaries(agent: IAgent, parentSession: URI, turns: readonly Turn[]): Promise<void> {
		const parentSessionStr = parentSession.toString();
		const parentChat = buildDefaultChatUri(parentSession);
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
		for (const child of discovered.values()) {
			const chatUri = buildSubagentChatUri(parentSessionStr, child.toolCallId);
			if (this._stateManager.getChatState(chatUri)) {
				continue;
			}
			const origin = { kind: ChatOriginKind.Tool, chat: parentChat, toolCallId: child.toolCallId } as const;
			const existing = this._stateManager.getSessionState(parentSessionStr)?.chats.find(chat => chat.resource === chatUri);
			const persistedTitle = await this._readPersistedChatTitle(parentSession, URI.parse(chatUri));
			const title = persistedTitle ?? child.title;
			this._stateManager.registerRestoredChatSummary(parentSessionStr, chatUri, {
				title,
				origin,
				interactivity: ChatInteractivity.ReadOnly,
				resolver: async () => ({
					turns: [...await this._resolveRestoredSubagentTurns(agent, parentSession, chatUri, origin)],
				}),
			});
			if (existing && (!existing.title || existing.title === subagentChatTitle(undefined, undefined))) {
				this._stateManager.updateChatTitle(parentSessionStr, chatUri, title);
			}
		}
	}

	private async _resolveRestoredSubagentTurns(agent: IAgent, parentSession: URI, chatUri: string, origin: { readonly kind: ChatOriginKind.Tool; readonly chat: string; readonly toolCallId: string }): Promise<readonly Turn[]> {
		const childTurns = await this._getChatMessages(agent, URI.parse(chatUri), parentSession, origin);
		if (childTurns.length === 0) {
			throw new Error(`Subagent transcript is not available yet: ${chatUri}`);
		}
		return this._interleaveLocalTurns(parentSession.toString(), chatUri, childTurns);
	}

	private _findProviderForSession(session: URI | string): IAgent | undefined {
		const key = typeof session === 'string' ? session : session.toString();
		const providerId = this._sessionToProvider.get(key);
		if (providerId) {
			return this._providers.get(providerId);
		}
		const schemeProvider = AgentSession.provider(session);
		if (schemeProvider) {
			return this._providers.get(schemeProvider);
		}
		// Fallback: try the default provider (handles resumed sessions not yet tracked)
		if (this._defaultProvider) {
			return this._providers.get(this._defaultProvider);
		}
		return undefined;
	}

	/**
	 * Sets the agents observable to trigger model re-fetch and
	 * `root/agentsChanged` via the autorun in {@link AgentSideEffects}.
	 */
	private _updateAgents(): void {
		this._agents.set([...this._providers.values()], undefined);
	}

	override dispose(): void {
		for (const provider of this._providers.values()) {
			provider.dispose();
		}
		this._providers.clear();
		super.dispose();
	}
}

function isErrorWithCode(error: unknown, code: string): boolean {
	return error instanceof Error && hasErrorCode(error, code);
}

function hasErrorCode(error: Error | { code: unknown }, code: string): boolean {
	return hasKey(error, { code: true }) && error.code === code;
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
