/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { open, unlink, type FileHandle } from 'fs/promises';
import { decodeBase64, encodeBase64, VSBuffer } from '../../../base/common/buffer.js';
import { Barrier, DeferredPromise, disposableTimeout, Limiter, ResourceQueue } from '../../../base/common/async.js';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableResourceMap, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { getExtensionForMimeType, getMediaMime, getMediaOrTextMime } from '../../../base/common/mime.js';
import { Schemas } from '../../../base/common/network.js';
import { dirname as resourcesDirname, extname as resourcesExtname, extUriBiasedIgnorePathCase, isEqual, isEqualOrParent, joinPath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { hasKey } from '../../../base/common/types.js';
import { localize } from '../../../nls.js';
import { FileChangeType, FileOperationResult, IFileChange, IFileService, toFileOperationResult, type FileChangesEvent } from '../../files/common/files.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { AgentChatMigrationDeferred, AgentProvider, AgentSession, AgentSignal, IAgent, type IAgentAdoptedWorktree, IAgentChatContext, IAgentChatDataChange, IAgentChatMetadata, IAgentCreateChatOptions, IAgentCreateChatRequestOptions, IAgentCreateChatResult, IAgentCreateChatSideChatSelection, IAgentCreateChatSideChatSource, IAgentCreateSessionConfig, IAgentCreateSessionResult, IAgentDiscoveredChat, IAgentMaterializeChatEvent, IAgentModelInfo, IAgentResolveSessionConfigParams, IAgentChatAdoptionResult, type AgentChatAdoptionReason, IAgentSessionConfigCompletionsParams, IAgentSessionMetadata, IAgentSpawnChatEvent, AuthenticateParams, AuthenticateResult, SubagentChatSignal, subagentChatTitle } from '../common/agent.js';
import { type AgentHostDebugLogsArtifactKind, type IAgentHostDebugLogsArtifact, type IAgentHostDebugLogsChunk, IAgentHostManagedSettingsDiagnostics, IAgentHostNetworkDiagnosticsInfo, IAgentHostNetworkFetchResult, IAgentService } from '../common/agentService.js';
import { ISessionDataService, SESSION_ATTACHMENTS_DIRNAME } from '../common/sessionDataService.js';
import { IAgentEditAttributionService, ICancelEditAttributionFlushParams, ICommitEditAttributionFlushParams, IEditAttributionFlushResult, IPrepareEditAttributionFlushParams, IPreparedEditAttributionFlush, parseEditAttributionResource } from '../common/fileEditAttribution.js';
import { SessionConfigKey } from '../common/sessionConfigKeys.js';
import type { IAgentCustomizationSettingsRegistration } from '../common/agentCustomizationSettings.js';
import { buildAnnotationsUri, parseAnnotationsUri } from '../common/annotationsUri.js';
import { AGENT_HOST_AUTOMATION_MIGRATION_CONFIG_KEY, isAgentHostAutomationMigrationCompletion } from '../common/automationMigration.js';
import { parseChangesetUri } from '../common/changesetUri.js';
import { ActionType, ActionEnvelope, AuthRequiredReason, INotification, isAnnotationsAction, isPassiveSessionMetadataAction, isSessionAction, type ChatAction, type ClientAutomationAction, type ClientAutomationRunAction, type IIsArchivedChangedAction, type IIsReadChangedAction, type IRootConfigChangedAction, type SessionAction, type SessionWorkingDirectoryAction, type TerminalAction, type ClientAnnotationsAction, type ClientChangesetAction } from '../common/state/sessionActions.js';
import { resolveSessionWorkingDirectoryAction } from '../common/state/sessionWorkingDirectories.js';
import type { CompletionsParams, CompletionsResult, CreateTerminalParams, ResolveSessionConfigResult, SessionConfigCompletionsResult, SessionConfigPropertySchema } from '../common/state/protocol/commands.js';
import type { AutomationCapabilities } from '../common/state/protocol/common/commands.js';
import type { FetchAutomationRunsParams, FetchAutomationRunsResult, ListAutomationTriggerDefinitionsParams, ListAutomationTriggerDefinitionsResult, RunAutomationParams, RunAutomationResult } from '../common/state/protocol/channels-automation/commands.js';
import type { InvokeChangesetOperationParams, InvokeChangesetOperationResult } from '../common/state/protocol/channels-changeset/commands.js';
import { AhpErrorCodes, AHP_SESSION_NOT_FOUND, ContentEncoding, JSON_RPC_INTERNAL_ERROR, ProtocolError, ResourceChangeType, ResourceType, ResourceWriteMode, type CreateResourceWatchParams, type CreateResourceWatchResult, type DirectoryEntry, type ResourceCopyParams, type ResourceCopyResult, type ResourceDeleteParams, type ResourceDeleteResult, type ResourceListResult, type ResourceMkdirParams, type ResourceMkdirResult, type ResourceMoveParams, type ResourceMoveResult, type ResourceReadResult, type ResourceResolveParams, type ResourceResolveResult, type ResourceWatchState, type ResourceWriteParams, type ResourceWriteResult, type IStateSnapshot } from '../common/state/sessionProtocol.js';
import { ChangesSummary, ChatInteractivity, ChatOriginKind, MessageAttachmentKind, type Annotation, type AnnotationEntry, type AnnotationOrigin, type AnnotationsState, type ChatOrigin, type Customization, type Message, type MessageAttachment, type MessageResourceAttachment, type TextRange } from '../common/state/protocol/state.js';
import type { ChatPendingMessageSetAction, ChatTurnStartedAction, SessionConfigChangedAction } from '../common/state/protocol/actions.js';
import { isAhpAutomationCatalogChannel, isAhpAutomationRunChannel, ISessionGitHubState, ISessionGitState, MessageKind, ResponsePartKind, SESSION_META_GITHUB_KEY, SESSION_META_GIT_KEY, SESSION_META_MULTI_ROOT_KEY, SESSION_META_SOURCE_CONTROL_KEY, AH_META_CREATED_BY_SESSION_DB_KEY, readSessionCreationReference, readSessionSpawnDepth, withSessionSpawnDepth, withSessionCreationReference, parseSessionCreationReference, SessionLifecycle, SessionStatus, ToolCallStatus, ToolResultContentType, TurnState, AH_META_WORKSPACELESS_DB_KEY, AH_META_EHCLI_ADOPTED_DB_KEY, AH_META_IS_ARCHIVED_DB_KEY, AH_META_IS_DONE_DB_KEY, AH_META_IS_READ_DB_KEY, buildChatUri, buildDefaultChatUri, buildResourceWatchChannelUri, buildSubagentChatUri, buildSubagentSessionUriPrefix, getErrorResponsePart, isAhpChatChannel, isChatReadOnly, isDefaultChatUri, isSubagentChatUri, isSubagentSession, needsSessionGitStateRefresh, parseChatUri, parseDefaultChatUri, parseRequiredSessionUriFromChatUri, parseResourceWatchChannelUri, parseSessionMultiRootMetadata, parseSubagentSessionUri, readSessionExternal, readSessionGitHubState, readSessionGitState, readSessionMultiRootMetadata, readSessionSourceControlState, readSessionWorkspaceless, withMessageHiddenFromTranscript, withSessionExternal, withSessionGitHubState, withSessionGitState, withSessionMultiRootMetadata, withSessionSourceControlState, withSessionStatusFlag, withSessionWorkspaceless, withSessionEhcliAdopted, withSessionEhcliLastMigratedTurn, AH_META_EHCLI_LAST_TURN_DB_KEY, withSessionFolderPickerDecision, readSessionFolderPickerDecision, parseSessionFolderPickerDecision, SESSION_META_FOLDER_PICKER_KEY, readSessionEhcliAdoptable, type ISessionSourceControlState, type SessionConfigState, type SessionSummary, type ToolResultSubagentContent, type Turn } from '../common/state/sessionState.js';
import { readToolCallMeta } from '../common/meta/agentToolCallMeta.js';
import { isHostSnapshotAttachment, toHostSnapshotAttachmentMeta } from '../common/meta/agentSnapshotAttachmentMeta.js';
import { readEphemeralSessionMeta, withEphemeralSessionMeta } from '../common/meta/agentEphemeralSessionMeta.js';
import { IAgentMessageDelegationMeta, toAgentMessageDelegationMeta } from '../common/meta/agentMessageDelegationMeta.js';
import { toAgentMergeMessageMeta } from '../common/meta/agentMergeMessageMeta.js';
import { readChatSurfaceMeta, withChatSurfaceMeta } from '../common/meta/agentChatSurfaceMeta.js';
import { AH_META_DEV_CONTAINER_WORKTREE_DB_KEY, readAgentDevContainerWorktreeMetadata, withAgentDevContainerWorktreeMetadata } from '../common/meta/agentDevContainerWorktreeMeta.js';
import { AgentConfigurationService, getEffectiveWorkingDirectories } from './agentConfigurationService.js';
import { IAgentHostTerminalManager } from './agentHostTerminalManager.js';
import { ISessionDbUriFields, parseSessionDbUri } from '../common/sessionDbUri.js';
import { IGitBlobUriFields, parseGitBlobUri } from './gitDiffContent.js';
import { resolveSessionRepositories } from './agentHostSessionRepositories.js';
import { findDeepestContainingWorkingDirectory, isMultiRootSession } from '../common/agentHostWorkingDirectories.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';
import { type IAgentHostAutomationExecution, IAgentHostAutomationService } from './agentHostAutomationService.js';
import { createAgentChatContext } from './agentChatContext.js';
import { AgentHostDebugLogsCollector, type IAgentHostDebugLogsEnvironment } from './agentHostDebugLogs.js';
import { IAgentHostDatabase } from './agentHostDatabase.js';
import { AgentSessionRegistry, IRegisteredSession, IStoredRegisteredSession } from './agentSessionRegistry.js';
import { IAgentHostGitService } from '../common/agentHostGitService.js';
import { IAgentHostSubscriptionService, resolveAgentHostSession } from '../common/agentHostSubscriptionService.js';
import { AgentSideEffects, type IAgentSideEffectsOptions } from './agentSideEffects.js';
import { AgentHostLocalTurns } from './agentHostLocalTurns.js';
import { AgentSessionResidency } from './agentSessionResidency.js';
import { IAgentHostSessionOpenTelemetry, type IAgentHostSessionOpenTelemetryScope } from './agentHostSessionOpenTelemetry.js';
import { AgentServerToolHost } from './shared/agentServerToolHost.js';
import { type IChatContextSnapshot, type IRenameTitleResult, type ISessionCreationDefaults, type ISessionServerToolAccessor, validateRenameTitle } from './shared/sessionServerTools.js';
import { AGENT_HOST_TITLE_SOURCE_AGENT, customChatTitleMetadataKey, customChatTitleSourceMetadataKey, persistSessionMetadata, persistSessionMetadataValues, SESSION_ARTIFACTS_KEY, SESSION_CUSTOM_TITLE_KEY, SESSION_CUSTOM_TITLE_SOURCE_KEY } from './shared/persistSessionMetadata.js';
import { type IArtifactServerToolAccessor } from './shared/artifactServerTools.js';
import { parseSessionArtifacts, stringifySessionArtifacts, withSessionArtifacts, type ISessionArtifact } from '../common/sessionArtifacts.js';

import { buildWorktreeFailureNotification, IAgentHostWorktreeIsolation, WORKTREE_META_REPOSITORY_ROOT, worktreeProjectFromRepositoryRoot } from './shared/worktreeIsolation.js';
import { IAgentHostProviderService } from './agentHostProviderService.js';
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
import { resolveLastNonLocalTurnId } from '../common/agentHostConversationContext.js';
import { AgentHostLaunchKind, createUnknownAgentHostClientTelemetryContext, type IAgentHostClientTelemetryContext } from '../common/agentHostTelemetry.js';
import { IAgentHostGitHubEndpointService } from './agentHostGitHubEndpointService.js';
import { AgentMergeController, type IAgentMergeControllerOptions } from './agentMergeController.js';
import { AgentMergeConfigKey, agentMergeRootConfigSchema, getNonMergeSessionConfigValues, readAgentMergeSessionState } from '../common/agentMerge.js';
import { AgentSystemNotificationKind, toAgentSystemNotificationMeta } from '../common/meta/agentSystemNotificationMeta.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { AgentHostAuthenticationService } from './agentHostAuthenticationService.js';
import { updateAgentHostTelemetryLevelFromConfig } from './agentHostTelemetryService.js';
import { AgentHostActiveAgentTitleGenerationConfigKey, AgentHostArtifactToolsConfigKey, AgentHostEditTelemetryEnabledConfigKey, AgentHostExternalSessionsMode, AgentHostMigrateLegacyCopilotCliEnabledConfigKey, AgentHostShowExternalSessionsConfigKey, platformRootSchema } from '../common/agentHostSchema.js';
import { IAgentHostChangesetService, CHANGESET_DB_METADATA_KEYS, META_CHANGES_SUMMARY } from '../common/agentHostChangesetService.js';
import { GIT_DB_METADATA_KEYS, IAgentHostGitStateService, META_GIT_STATE, META_GITHUB_STATE, META_SOURCE_CONTROL_STATE } from '../common/agentHostGitStateService.js';
import { IAgentHostChangesetOperationService } from '../common/agentHostChangesetOperationService.js';
import { IAgentHostChatContributions } from '../common/agentHostChatContributionsService.js';
import { IAgentHostStorageService } from './agentHostStorageService.js';

/**
 * Grace period before an empty, unsubscribed session is garbage-collected
 * via {@link AgentService._runSessionGc}. Gives a disconnected client time
 * to reconnect (or a workspace switch to settle) before we tear down the
 * provider-side session, worktree, and on-disk state.
 */
const SESSION_GC_GRACE_MS = 30_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const EXTERNAL_SESSION_MAX_AGE_MS = 30 * DAY_MS;
const RECENT_EXTERNAL_SESSION_LIMIT = 2;
const RECENT_LOCAL_SESSION_UPDATE_LIMIT = 2;
const RECENT_LOCAL_SESSION_UPDATES_STORAGE_KEY = 'recentLocalSessionUpdates';
/** A catalog pass slower than this is logged at info, since it delays every session-list refresh. */
const SLOW_LIST_SESSIONS_THRESHOLD_MS = 1_000;

/** A recent update to one local Agent Host session. */
interface IRecentLocalSessionUpdate {
	readonly session: string;
	readonly modifiedTime: number;
}

interface ISessionListComputation {
	readonly epoch: number;
	readonly promise: Promise<readonly IAgentSessionMetadata[]>;
	trailing?: Promise<readonly IAgentSessionMetadata[]>;
}

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
	reason: string;
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
	reason: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Why adoption ended as it did: adopted, alreadyNative, notLegacyChat, workingDirectoryMissing, or unknown. Separates a skipped session that was never ours from one whose working directory vanished, which need different fixes.' };
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
	SessionConfigKey.WorktreeCreateNewBranch,
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
 * Session-database metadata key for the orchestrator-owned catalog of
 * additional peer chats. When absent, the session predates this persistence
 * and a one-time migration drains the agent's legacy `*.chats` state.
 */
const PEER_CHATS_METADATA_KEY = 'peerChats';
const ANNOTATIONS_METADATA_KEY = 'annotations';

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
	readonly inheritedTurnId?: string;
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
}

export interface IAgentServiceCallbacks {
	readonly automationExecution: IAgentHostAutomationExecution;
	readonly canEvictChangeset: (changeset: string) => boolean;
	readonly startAgentMergeTurn: IAgentMergeControllerOptions['startTurn'];
	readonly cancelAgentMergeTurn: IAgentMergeControllerOptions['cancelTurn'];
	readonly postAgentMergeNotice: IAgentMergeControllerOptions['postNotice'];
	readonly getAutonomousSessionConfig: IAgentMergeControllerOptions['getAutonomousSessionConfig'];
	readonly resolveWorkingDirectoryBeforeSend: NonNullable<IAgentSideEffectsOptions['resolveWorkingDirectoryBeforeSend']>;
	readonly resolveChatAttachmentTurns: NonNullable<IAgentSideEffectsOptions['resolveChatAttachmentTurns']>;
	readonly getSessionMetadata: (session: URI) => Promise<IAgentSessionMetadata | undefined>;
	readonly restoreSession: (session: URI) => Promise<void>;
	readonly sessionServerToolAccessor: ISessionServerToolAccessor;
	readonly artifactServerToolAccessor: IArtifactServerToolAccessor;
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
	readonly automationService: IAgentHostAutomationService;
}

/** Core services that must exist before {@link AgentService} can be constructed. */
export interface IAgentServiceCore {
	readonly disposables: DisposableStore;
	readonly authenticationService: AgentHostAuthenticationService;
	readonly orchestratorDatabase: IAgentHostDatabase;
	readonly debugLogsCollector: AgentHostDebugLogsCollector | undefined;
	readonly sessionRegistry: AgentSessionRegistry;
	readonly stateManager: AgentHostStateManager;
	readonly configurationService: AgentConfigurationService;
	readonly callbackBinder: IAgentServiceCallbackBinder;
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
	readonly onMcpNotification: IAgentService['onMcpNotification'];

	/** Authoritative state manager for the sessions process protocol. */
	private readonly _stateManager: AgentHostStateManager;

	/**
	 * Orchestrator-owned durable index of known sessions. Populated alongside
	 * create/delete paths and, in Stage 1, exposed only for parity validation.
	 */
	private readonly _sessionRegistry: AgentSessionRegistry;
	private readonly _orchestratorDatabase: IAgentHostDatabase;
	/** Serializes durable last-modified advances emitted by live session state. */
	private _sessionModifiedTimeWrites: Promise<void> = Promise.resolve();
	private readonly _recentLocalSessionUpdateSnapshot: readonly IRecentLocalSessionUpdate[];
	private _recentLocalSessionUpdates: readonly IRecentLocalSessionUpdate[];

	private readonly _providerMigrations = new Map<AgentProvider, IProviderDiscoveryState>();
	private readonly _initialProviderMigrations = new Map<AgentProvider, Promise<void>>();
	private readonly _deferredProviderMigrations = new Set<AgentProvider>();
	private readonly _readableProviderCatalogs = new Set<AgentProvider>();

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
	private readonly _automationService: IAgentHostAutomationService;
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
	private readonly _restoreSubagentInFlight = new Map<string, Promise<void>>();
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
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IAgentHostSessionOpenTelemetry private readonly _sessionOpenTelemetry: IAgentHostSessionOpenTelemetry,
		@IAgentHostChatContributions private readonly _chatContributions: IAgentHostChatContributions,
		@IAgentHostSubscriptionService private readonly _subscriptions: IAgentHostSubscriptionService,
		@INetworkDiagnosticsService private readonly _networkDiagnostics: INetworkDiagnosticsService,
		@IAgentEditAttributionService private readonly _editAttributionService: IAgentEditAttributionService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IAgentHostWorktreeIsolation private readonly _worktree: IAgentHostWorktreeIsolation,
		@IAgentHostProviderService private readonly _providerService: IAgentHostProviderService,
		@IAgentHostStorageService private readonly _storageService: IAgentHostStorageService,
	) {
		super();
		this._authService = core.authenticationService;
		this._orchestratorDatabase = core.orchestratorDatabase;
		this._debugLogsCollector = core.debugLogsCollector;
		this._sessionRegistry = core.sessionRegistry;
		this._stateManager = core.stateManager;
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
		this._automationService = collaborators.automationService;
		this._register(this._providerService.registerProviderInitializer(provider => this._initializeProvider(provider)));
		this._register(this._providerService.onDidRegisterProvider(provider => this._onDidRegisterProvider(provider)));
		this._sessionResidency = this._register(instantiationService.createInstance(
			AgentSessionResidency,
			this._stateManager,
			{
				isReleaseBlocked: session => this._restoreSessionInFlight.has(session.toString()),
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
		core.callbackBinder.bind({
			automationExecution: {
				isSessionTemplateAvailable: template => this._providerService.resolveProvider(template.provider) !== undefined,
				createSession: (template, run) => this.createSession({
					provider: template.provider,
					model: template.model,
					agent: template.agent,
					workingDirectories: template.workingDirectories?.map(resource => URI.parse(resource)),
					config: template.config,
					_meta: {
						automation: run.automation,
						automationRun: run.resource,
					},
				}),
				startSession: (session, message) => this._startAutomationMessage(session, message),
				cancelSession: session => this._cancelAutomationSession(session),
			},
			canEvictChangeset: changeset => this._canEvictChangeset(changeset),
			startAgentMergeTurn: (session, turnId, prompt) => this._startAgentMergePrompt(session, turnId, prompt),
			cancelAgentMergeTurn: (session, turnId) => this._cancelAgentMergePrompt(session, turnId),
			postAgentMergeNotice: (session, kind, content) => this._postAgentMergeNotice(session, kind, content),
			getAutonomousSessionConfig: (session, config) => this._providerService.getProviderForSession(session)?.getAutonomousSessionConfig?.(config),
			resolveWorkingDirectoryBeforeSend: params => this._resolveWorkingDirectoryBeforeSend(params),
			resolveChatAttachmentTurns: resource => this._resolveChatAttachmentTurns(resource),
			getSessionMetadata: session => this._getSessionMetadata(session),
			restoreSession: session => this.restoreSession(session),
			sessionServerToolAccessor: this._createSessionServerToolAccessor(),
			artifactServerToolAccessor: this._createArtifactServerToolAccessor(),
		});
		this._logService.info('AgentService initialized');
		this._register(this._stateManager.onDidEmitEnvelope(e => this._onDidAction.fire(e)));
		this._register(this._stateManager.onDidEmitEnvelope(e => this._trackPendingSubagentChatFromEnvelope(e)));
		this._register(this._stateManager.onDidEmitEnvelope(e => this._persistAnnotations(e)));
		// Archiving is terminal for Agent Merge, so the index is cleared from the
		// action rather than from the controller's own disable.
		this._register(this._stateManager.onDidEmitEnvelope(e => {
			if (e.action.type === ActionType.SessionIsArchivedChanged && e.action.isArchived && !isAhpChatChannel(e.channel)) {
				this._clearAgentMergeIndex(URI.parse(e.channel));
				void this._sessionResidency.reconcile();
			}
		}));
		this._register(this._stateManager.onDidEmitNotification(e => this._onDidNotification.fire(e)));
		// A notice raised mid-turn waits for the agent to finish so it can own a
		// turn of its own and survive restore.
		this._register(this._stateManager.onDidChangeSessionActiveTurn(({ session, active }) => {
			if (!active) {
				this._flushAgentMergeNotices(session);
			}
		}));
		this._register(this._stateManager.onDidRemoveSession(session => this._pendingAgentMergeNotices.delete(session)));
		this._register(this._stateManager.onDidChangeSessionSummary(({ session, changes }) => {
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
				&& !readSessionEhcliAdoptable(meta)) {
				this._queueSessionListReconciliation();
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
	markStartupComplete(): void {
		if (this._hostStartupComplete) {
			return;
		}
		this._hostStartupComplete = true;
		this._openStartupSettled();
	}

	private _openStartupSettled(): void {
		if (this._hostStartupComplete && this._firstListingServed) {
			this._startupSettled.open();
		}
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

	/** Test surface: settles once all deferred work queued so far has run. */
	async whenDeferredWorkSettled(): Promise<void> {
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
		const session = metadata.session;
		const agent = this._providerService.getProviderForSession(session);
		if (!agent) {
			return;
		}
		const chat = URI.parse(buildDefaultChatUri(session));
		const turns = await agent.chats.getMessages(chat, this._chatContext(session, chat));
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
		if (!this._worktree.isWorkingDirectoryPending(sessionId)) {
			if (!pickedFolderUri) {
				return undefined;
			}
			const resolved = await this._worktree.resolveWorkingDirectoryForResume(URI.parse(params.session), sessionId, pickedFolderUri);
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
		let reportedActivity = false;
		let failureDiagnostic: string | undefined;
		try {
			await worktree.resolveOnFirstSend({
				sessionUri: URI.parse(params.session),
				sessionId,
				workingDirectory: pickedFolderUri,
				config: this._configurationService.getSessionConfigValues(params.session),
				prompt: params.prompt,
				githubToken: this._authService.getAuthToken({
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

	private _initializeProvider(provider: IAgent): IDisposable {
		const subscriptions = new DisposableStore();
		try {
			this._invalidateSessionList();
			provider.setServerToolHost?.(this._serverToolHost);
			provider.setKnownSessionsFilter?.(sessions => this._filterKnownSessions(sessions));
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
				void this._migrateAndRegisterDiscoveredChats(provider, chats).catch(err =>
					this._logService.warn(`[AgentService] registering discovered chats for provider ${provider.id} failed`, err));
			}));
			this._setupChatDiscoveryForProvider(provider);
			subscriptions.add(provider.onDidChangeChatData(e => this._onChatDataChanged(e)));
			subscriptions.add(provider.onDidSpawnChat(e => this._onChatSpawned(e)));
			this._providerSubscriptions.set(provider.id, subscriptions);
			return toDisposable(() => {
				this._providerSubscriptions.deleteAndDispose(provider.id);
				this._deferredProviderMigrations.delete(provider.id);
				this._readableProviderCatalogs.delete(provider.id);
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
		const initialMigration = this._ensureLegacyChatsMigrated(provider);
		this._trackInitialProviderMigration(provider, initialMigration);
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
			session => this._hostCustomizations(URI.isUri(session) ? session : URI.parse(session)),
		));
		this._register(this._completions.registerProvider(provider));
	}

	// ---- auth ---------------------------------------------------------------

	async authenticate(params: AuthenticateParams): Promise<AuthenticateResult> {
		const result = await this._providerService.authenticate(params);
		if (result.authenticated) {
			this._agentMergeController.refresh();
		}
		return result;
	}

	// ---- Changeset operation handlers --------------------------------------

	async invokeChangesetOperation(params: InvokeChangesetOperationParams): Promise<InvokeChangesetOperationResult> {
		return this._changesetOperationService.invokeChangesetOperation(params);
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
	private _createSessionServerToolAccessor(): ISessionServerToolAccessor {
		return {
			isActiveAgentTitleGenerationEnabled: () => this._isActiveAgentTitleGenerationEnabled(),
			listSessions: () => this.listSessions(),
			getSession: session => this._getSessionMetadata(session),
			createSession: config => this.createSession(config),
			getModels: () => {
				const models: IAgentModelInfo[] = [];
				for (const provider of this._providerService.getProviders()) {
					models.push(...provider.models.get());
				}
				return models;
			},
			getCreationDefaults: source => this._getServerToolCreationDefaults(source),
			startPrompt: (session, chat, prompt, delegation) => this._startSessionPrompt(session, chat, prompt, delegation),
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
		};
	}

	private _isActiveAgentTitleGenerationEnabled(): boolean {
		return this._configurationService.getRootValue(platformRootSchema, AgentHostActiveAgentTitleGenerationConfigKey) === true;
	}

	/** Dependency surface for the artifact server-tool group. */
	private _createArtifactServerToolAccessor(): IArtifactServerToolAccessor {
		return {
			isEnabled: () => this._isArtifactToolsEnabled(),
			persist: (session, artifacts) => persistSessionMetadata(this._sessionDataService, this._logService, session, SESSION_ARTIFACTS_KEY, stringifySessionArtifacts(artifacts)),
		};
	}

	private _isArtifactToolsEnabled(): boolean {
		return this._configurationService.getRootValue(platformRootSchema, AgentHostArtifactToolsConfigKey) === true;
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
	private async _startSessionPrompt(session: URI, chat: URI, prompt: string, delegation?: IAgentMessageDelegationMeta): Promise<void> {
		// The calling agent authored this prompt, not the user.
		const message: Message = {
			text: prompt,
			origin: { kind: MessageKind.Agent },
			...(delegation ? { _meta: toAgentMessageDelegationMeta(delegation) } : {}),
		};
		await this._startSessionMessage(chat, message);
	}

	private async _startAutomationMessage(session: URI, message: Message): Promise<void> {
		await this._startSessionMessage(URI.parse(buildDefaultChatUri(session)), message);
	}

	private async _startSessionMessage(chat: URI, message: Message): Promise<void> {
		const action = { type: ActionType.ChatTurnStarted, turnId: generateUuid(), startedAt: new Date().toISOString(), message } as const;
		this._stateManager.dispatchServerAction(chat.toString(), action);
		this._sideEffects.handleAction(chat.toString(), action);
	}

	private async _cancelAutomationSession(session: URI): Promise<boolean> {
		const chat = buildDefaultChatUri(session);
		const activeTurn = this._stateManager.getChatState(chat)?.activeTurn;
		if (!activeTurn) {
			return false;
		}
		const startedAt = Date.parse(activeTurn.startedAt);
		const duration = Number.isFinite(startedAt) ? Math.max(0, Date.now() - startedAt) : 0;
		const action = { type: ActionType.ChatTurnCancelled, turnId: activeTurn.id, duration } as const;
		this._stateManager.dispatchServerAction(chat, action);
		this._sideEffects.handleAction(chat, action);
		return true;
	}

	private _startAgentMergePrompt(session: string, turnId: string, prompt: string): boolean {
		if (this._stateManager.hasActiveTurn(session)) {
			return false;
		}
		const chat = buildDefaultChatUri(session).toString();
		const message: Message = {
			text: prompt,
			origin: { kind: MessageKind.SystemNotification },
			_meta: toAgentMergeMessageMeta(),
		};
		const action = { type: ActionType.ChatTurnStarted, turnId, startedAt: new Date().toISOString(), message } as const;
		this._stateManager.dispatchServerAction(chat, action);
		this._sideEffects.handleAction(chat, action);
		return true;
	}

	/**
	 * Reports an Agent Merge state change in the session's default chat.
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
	private _postAgentMergeNotice(session: string, kind: AgentSystemNotificationKind, content: string): void {
		if (this._stateManager.hasActiveTurn(session)) {
			const pending = this._pendingAgentMergeNotices.get(session);
			if (pending) {
				pending.push({ kind, content });
			} else {
				this._pendingAgentMergeNotices.set(session, [{ kind, content }]);
			}
			this._logService.debug(`[AgentService] Deferring an Agent Merge notice until the session is idle: session=${session}`);
			return;
		}
		this._writeAgentMergeNotice(session, kind, content);
	}

	/** Emits the notices that were waiting for a session's turn to end. */
	private _flushAgentMergeNotices(session: string): void {
		const pending = this._pendingAgentMergeNotices.get(session);
		if (!pending) {
			return;
		}
		this._pendingAgentMergeNotices.delete(session);
		for (const { kind, content } of pending) {
			this._writeAgentMergeNotice(session, kind, content);
		}
	}

	/** Writes one Agent Merge notice as a completed, host-owned local turn. */
	private _writeAgentMergeNotice(session: string, kind: AgentSystemNotificationKind, content: string): void {
		const chat = buildDefaultChatUri(session);
		const channel = chat.toString();
		const turnId = generateUuid();
		this._stateManager.dispatchServerAction(channel, {
			type: ActionType.ChatTurnStarted,
			turnId,
			startedAt: new Date().toISOString(),
			message: withMessageHiddenFromTranscript({ text: content, origin: { kind: MessageKind.SystemNotification } }, true),
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
		const turns = this._stateManager.getSessionState(chat)?.turns;
		const recorded = turns?.find(turn => turn.id === turnId);
		if (turns && recorded) {
			this._localTurns.record(session, channel, recorded, this._localTurns.findAnchorTurnId(channel, turns, turnId));
		}
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
		if (!isDefaultChat && !await this._peerChatExists(session, chat)) {
			throw new Error(`Invalid ${SessionServerToolName.RenameChat} input: chat must match a known non-default chat.`);
		}

		await persistSessionMetadataValues(this._sessionDataService, session.toString(), {
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
		if (isDefaultChat) {
			this._sideEffects.markTitleRenamed(session.toString());
		}
		this._sideEffects.markTitleRenamed(session.toString(), chat.toString());
		return { title };
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

	/** `undefined` means the provider catalog is unavailable; deferred waits for external readiness. */
	private async _enumerateLegacyProviderSessions(provider: IAgent): Promise<readonly IAgentSessionMetadata[] | undefined | typeof AgentChatMigrationDeferred> {
		const chats = await provider.listChatsToMigrate();
		return chats === AgentChatMigrationDeferred ? chats : chats?.map(metadata => this._toSessionMetadata(metadata));
	}

	/**
	 * Registry metadata for one session. The host offers its stable timestamps
	 * as a fallback, but the provider decides whether a passive metadata miss
	 * means "not initialized yet" or "not found".
	 */
	private async _registeredSessionMetadata(agent: IAgent, session: URI, external: boolean, fallback?: Pick<IRegisteredSession, 'startTime' | 'modifiedTime'>): Promise<IAgentSessionMetadata | undefined> {
		const chat = URI.parse(buildDefaultChatUri(session));
		const metadata = await agent.getChatMetadata(
			chat,
			this._chatContext(session, chat),
			await this._readDefaultChatProviderData(session),
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

	private _agentMergeRestore: Promise<void> = Promise.resolve();
	private _agentMergeIndexWrites: Promise<void> = Promise.resolve();
	/** Agent Merge notices waiting for a session's in-flight turn to finish. */
	private readonly _pendingAgentMergeNotices = new Map<string, { readonly kind: AgentSystemNotificationKind; readonly content: string }[]>();

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
		await Promise.all(enabled.map(session => limiter.queue(async () => {
			const sessionStr = session.toString();
			if (this._stateManager.getSessionState(sessionStr)) {
				return;
			}
			try {
				// A single-row registry lookup, so the pass costs one query per
				// indexed session rather than a full registry enumeration.
				const registered = await this._sessionRegistry.get(session, entry => this._migrateRegisteredSession(entry));
				// Deleted or unregistered since it was indexed, or archived by a
				// pass that could not clear the index (e.g. a crash).
				if (!registered || await this._isPersistedSessionArchived(session)) {
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

	/** Archive check for the few indexed sessions, so a terminal session is never re-held. */
	private async _isPersistedSessionArchived(session: URI): Promise<boolean> {
		const ref = await this._sessionDataService.tryOpenDatabase(session);
		if (!ref) {
			return false;
		}
		try {
			const metadata = await ref.object.getMetadataObject({
				[AH_META_IS_ARCHIVED_DB_KEY]: true,
				[AH_META_IS_DONE_DB_KEY]: true,
			});
			return (metadata[AH_META_IS_ARCHIVED_DB_KEY] ?? metadata[AH_META_IS_DONE_DB_KEY]) === 'true';
		} finally {
			ref.dispose();
		}
	}

	/** Mirrors a session's Agent Merge enablement into the host-owned index. */
	private _syncAgentMergeIndex(session: URI, previous: SessionConfigState | undefined, current: SessionConfigState | undefined): void {
		const wasEnabled = readAgentMergeSessionState(previous?.values)?.enabled === true;
		const isEnabled = readAgentMergeSessionState(current?.values)?.enabled === true;
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

	/**
	 * Awaits legacy migration started at provider registration. Provider-owned
	 * discovery is independent and surfaces unknown chats additively.
	 */
	private async _awaitInitialProviderMigration(): Promise<void> {
		await Promise.all(this._providerService.getProviders().map(provider => this._awaitInitialProviderMigrationForProvider(provider)));
	}

	/**
	 * Awaits the registration-time legacy migration for a single provider,
	 * retrying once if that initial catalog pass was unavailable. Rejects only if
	 * the retry also fails. Restore uses this to wait for its own provider's
	 * catalog before reading per-session metadata, mirroring what
	 * {@link _awaitInitialProviderMigration} does for `listSessions`.
	 */
	private async _awaitInitialProviderMigrationForProvider(provider: IAgent, requireReadableCatalog = false): Promise<boolean> {
		const migration = this._initialProviderMigrations.get(provider.id);
		if (!migration) {
			if (requireReadableCatalog || this._deferredProviderMigrations.has(provider.id)) {
				await this._ensureLegacyChatsMigrated(provider, requireReadableCatalog);
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
			await this._ensureLegacyChatsMigrated(provider, true);
		} else if (this._firstListingServed && this._deferredProviderMigrations.has(provider.id)) {
			await this._ensureLegacyChatsMigrated(provider);
		}
		return this._readableProviderCatalogs.has(provider.id);
	}

	private async _migrateAndRegisterDiscoveredChats(provider: IAgent, chats: readonly IAgentDiscoveredChat[]): Promise<void> {
		if (this._deferredProviderMigrations.has(provider.id)) {
			try {
				await this._ensureLegacyChatsMigrated(provider, true);
			} catch (err) {
				this._logService.warn(`[AgentService] registry migration: failed for provider ${provider.id} after chat discovery`, err);
			}
		}
		await this._registerDiscoveredChats(provider, chats);
	}

	private _replaceFailedInitialProviderMigration(provider: IAgent, failed: Promise<void>): Promise<void> {
		const current = this._initialProviderMigrations.get(provider.id);
		if (current !== failed) {
			return current ?? Promise.resolve();
		}
		const retry = this._ensureLegacyChatsMigrated(provider, true);
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
		// Keys only: discovery arrives in batches, and the full listing re-runs the
		// per-row provenance migration for every registered session each time.
		const registeredKeys = new Set(await this._sessionRegistry.listSessionKeys());
		const discoveryLimiter = new Limiter<boolean>(4);
		let suppressed = 0;
		let skippedAsStale = 0;
		let registeredExternal = false;
		let alreadyRegistered = 0;
		let registryChanged = false;
		const untitledExternal: IAgentSessionMetadata[] = [];
		const results = await Promise.all(chats.map(({ external, ...metadata }) => discoveryLimiter.queue(async () => {
			const sessionMetadata = this._toSessionMetadata(metadata);
			const session = sessionMetadata.session;
			try {
				// Matching registry entries still advance their durable recency from
				// the provider catalog, but need no per-session metadata I/O.
				if (registeredKeys.has(session.toString())) {
					alreadyRegistered++;
					await this._advanceSessionModifiedTime(session, sessionMetadata.modifiedTime);
					return false;
				}
				if (isSubagentSession(session.toString()) || await this._isChatBacking(session)) {
					suppressed++;
					return false;
				}
				if (external && !readSessionEhcliAdoptable(sessionMetadata._meta) && this._isExternalSessionOlderThanMaxAge(sessionMetadata.modifiedTime, Date.now())) {
					skippedAsStale++;
					return false;
				}
				const identity: IRegisteredSession = { session, provider: provider.id, startTime: metadata.startTime, modifiedTime: metadata.modifiedTime, external, source: external ? 'discovery' : 'restore' };
				const registered = await this._retryRegistryMutation(
					() => this._sessionRegistry.register(session, identity, { checkTombstone: true }),
					`discovery registration for ${session.toString()}`,
				);
				if (registered) {
					registryChanged = true;
					// Only reached for a session the registry did not already hold, so its
					// external read state has never been seeded.
					if (external) {
						await this._initializeExternalSessionReadState(session);
					}
					registeredKeys.add(session.toString());
					if (external && !sessionMetadata.summary) {
						untitledExternal.push(sessionMetadata);
					}
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
		if (untitledExternal.length > 0) {
			this._scheduleExternalSessionTitles(untitledExternal);
		}
		this._logService.info(`[AgentService] discovery for provider ${provider.id}: ${chats.length} candidate(s) (${chats.filter(chat => chat.external).length} external), ${registered} registered, ${alreadyRegistered} already registered, ${suppressed} suppressed as subagent/chat backing, ${skippedAsStale} skipped as older than ${EXTERNAL_SESSION_MAX_AGE_MS / DAY_MS} days`);
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
			this._readableProviderCatalogs.delete(provider.id);
			throw new ProviderCatalogUnavailableError(provider.id);
		}
		if (sessions === AgentChatMigrationDeferred) {
			this._deferredProviderMigrations.add(provider.id);
			this._readableProviderCatalogs.delete(provider.id);
			return;
		}
		const existing = new Map((await this._listRegisteredSessions()).map(session => [session.session.toString(), session.external]));
		const migrationLimiter = new Limiter<IRegisteredSession | undefined>(4);
		const identities = await Promise.all(sessions.map(s => migrationLimiter.queue(async (): Promise<IRegisteredSession | undefined> => {
			if (isSubagentSession(s.session.toString())) {
				return undefined;
			}
			const facts = await this._readSessionRegistrationFacts(s.session);
			if (facts.chatBacking) {
				return undefined;
			}
			const external = !facts.hostCreated;
			return { session: s.session, provider: provider.id, startTime: s.startTime, modifiedTime: s.modifiedTime, external, source: external ? 'discovery' : 'restore' };
		})));
		let registeredExternal = false;
		const untitledExternal: IAgentSessionMetadata[] = [];
		for (let index = 0; index < identities.length; index++) {
			const identity = identities[index];
			if (!identity) {
				continue;
			}
			const metadata = sessions[index];
			if (identity.external && !readSessionEhcliAdoptable(metadata._meta) && this._isExternalSessionOlderThanMaxAge(metadata.modifiedTime, Date.now())) {
				continue;
			}
			const registered = await this._sessionRegistry.register(identity.session, identity, { checkTombstone: true });
			if (registered) {
				this._invalidateSessionList();
				if (identity.external && existing.get(identity.session.toString()) !== true) {
					await this._initializeExternalSessionReadState(identity.session);
				}
				existing.set(identity.session.toString(), identity.external);
				if (identity.external && !metadata.summary) {
					untitledExternal.push(metadata);
				}
				if (identity.external && !readSessionEhcliAdoptable(metadata._meta)) {
					registeredExternal = true;
				} else {
					await this._announceSurfacedSession({ ...metadata, _meta: withSessionExternal(metadata._meta, identity.external) }, provider.id);
				}
			}
		}
		await this._sessionRegistry.markProviderBackfilled(provider.id);
		this._deferredProviderMigrations.delete(provider.id);
		this._readableProviderCatalogs.add(provider.id);
		this._startChatDiscovery(provider, 'legacy migration enumerated the provider catalog');
		if (registeredExternal) {
			this._queueSessionListReconciliation();
		}
		if (untitledExternal.length > 0) {
			this._scheduleExternalSessionTitles(untitledExternal);
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

	/**
	 * Both facts registry backfill needs about a session, from a single database
	 * open — it asks for both per session, and a large catalogue makes the second
	 * open the dominant cost of the pass.
	 */
	private async _readSessionRegistrationFacts(session: URI): Promise<{ readonly chatBacking: boolean; readonly hostCreated: boolean }> {
		if (this._unpersistedChatBackings.has(session.toString())) {
			return { chatBacking: true, hostCreated: false };
		}
		// A read failure is deliberately not caught: registering on a guess would
		// durably mark a host-created session external, whereas failing the pass
		// leaves it unmarked and retried.
		const ref = await this._sessionDataService.tryOpenDatabase(session);
		if (!ref) {
			return { chatBacking: false, hostCreated: false };
		}
		try {
			const metadata = await ref.object.getMetadataObject({ [CHAT_BACKING_METADATA_KEY]: true, [AH_META_WORKSPACELESS_DB_KEY]: true });
			// The workspace-less marker is written when the host creates a session,
			// so its presence is what identifies a host-created session.
			return { chatBacking: !!metadata[CHAT_BACKING_METADATA_KEY], hostCreated: metadata[AH_META_WORKSPACELESS_DB_KEY] !== undefined };
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

	/** Active list computations and their optional trailing refresh, shared per mode. */
	private readonly _inFlightListSessions = new Map<AgentHostExternalSessionsMode, ISessionListComputation>();

	private _registryEpoch = 0;

	private _invalidateSessionList(): void {
		this._registryEpoch++;
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
			inFlight.trailing = inFlight.promise.then(startTrailing, startTrailing);
		}
		return [...await inFlight.trailing];
	}

	private _startSessionListComputation(mode: AgentHostExternalSessionsMode): ISessionListComputation {
		const entry: ISessionListComputation = {
			epoch: this._registryEpoch,
			promise: this._computeSessions(mode),
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
				// Only a served listing ends startup: a failed one is retried, and
				// deferred work must not compete with that retry.
				this._firstListingServed = true;
				this._openStartupSettled();
			},
			clear,
		);
		return entry;
	}

	private async _computeSessions(mode: AgentHostExternalSessionsMode): Promise<readonly IAgentSessionMetadata[]> {
		this._logService.trace('[AgentService] listSessions computation started');
		const startedAt = Date.now();
		// The first list waits for registration-time legacy migration if it is still in flight.
		await this._awaitInitialProviderMigration();
		// The registry is the source of truth for top-level sessions. Internal
		// chat backings and subagent sessions never enter it; ephemeral sessions
		// are tombstoned at creation. A transiently missing provider snapshot no
		// longer evicts a session.
		const allRegistered = await this._listRegisteredSessions();
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
		const metadataLimiter = new Limiter<IAgentSessionMetadata | undefined>(4);
		const results = await Promise.all(registered.map(registeredSession => metadataLimiter.queue(async (): Promise<IAgentSessionMetadata | undefined> => {
			const { session, provider, external } = registeredSession;
			// Idle provisional sessions stay hidden until they materialize or gain
			// turn activity (#321269). The state-manager overlay below re-surfaces
			// them then.
			if (this._stateManager.isIdleProvisionalSession(session.toString())) {
				return undefined;
			}

			const agent = this._providerService.getProvider(provider);
			if (!agent) {
				return undefined;
			}
			try {
				return await this._registeredSessionMetadata(agent, session, external, registeredSession);
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
						? { customTitle: true, [AH_META_IS_READ_DB_KEY]: true, [AH_META_IS_ARCHIVED_DB_KEY]: true, [AH_META_IS_DONE_DB_KEY]: true, [AH_META_CREATED_BY_SESSION_DB_KEY]: true, [AH_META_DEV_CONTAINER_WORKTREE_DB_KEY]: true, [AH_META_WORKSPACELESS_DB_KEY]: true, [AH_META_EHCLI_ADOPTED_DB_KEY]: true, [AH_META_EHCLI_LAST_TURN_DB_KEY]: true, [SESSION_META_MULTI_ROOT_KEY]: true, [SESSION_META_FOLDER_PICKER_KEY]: true, [SESSION_ARTIFACTS_KEY]: true, [CHAT_BACKING_METADATA_KEY]: true, [WORKTREE_META_REPOSITORY_ROOT]: true, ...GIT_DB_METADATA_KEYS, ...changesetKeys }
						: { customTitle: true, [AH_META_IS_READ_DB_KEY]: true, [AH_META_IS_ARCHIVED_DB_KEY]: true, [AH_META_IS_DONE_DB_KEY]: true, [AH_META_CREATED_BY_SESSION_DB_KEY]: true, [AH_META_DEV_CONTAINER_WORKTREE_DB_KEY]: true, [AH_META_WORKSPACELESS_DB_KEY]: true, [AH_META_EHCLI_ADOPTED_DB_KEY]: true, [AH_META_EHCLI_LAST_TURN_DB_KEY]: true, [SESSION_META_MULTI_ROOT_KEY]: true, [SESSION_META_FOLDER_PICKER_KEY]: true, [SESSION_ARTIFACTS_KEY]: true, [CHAT_BACKING_METADATA_KEY]: true, [WORKTREE_META_REPOSITORY_ROOT]: true, ...GIT_DB_METADATA_KEYS };
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
					const creationReference = parseSessionCreationReference(m[AH_META_CREATED_BY_SESSION_DB_KEY]);
					if (creationReference) {
						updated = { ...updated, _meta: withSessionCreationReference(updated._meta, creationReference) };
					}
					if (m[AH_META_DEV_CONTAINER_WORKTREE_DB_KEY]) {
						try {
							const metadata = readAgentDevContainerWorktreeMetadata({
								[AH_META_DEV_CONTAINER_WORKTREE_DB_KEY]: JSON.parse(m[AH_META_DEV_CONTAINER_WORKTREE_DB_KEY]),
							});
							if (metadata) {
								updated = { ...updated, _meta: withAgentDevContainerWorktreeMetadata(updated._meta, metadata.handle) };
							}
						} catch (err) {
							this._logService.warn(`[AgentService][listSessions] Failed to parse Dev Container worktree metadata for ${s.session}`, err);
						}
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
					if (m[AH_META_EHCLI_ADOPTED_DB_KEY] !== undefined) {
						updated = { ...updated, _meta: withSessionEhcliAdopted(updated._meta, m[AH_META_EHCLI_ADOPTED_DB_KEY] === 'true') };
					}
					if (m[AH_META_EHCLI_LAST_TURN_DB_KEY] !== undefined) {
						updated = { ...updated, _meta: withSessionEhcliLastMigratedTurn(updated._meta, m[AH_META_EHCLI_LAST_TURN_DB_KEY]) };
					}
					const multiRoot = parseSessionMultiRootMetadata(m[SESSION_META_MULTI_ROOT_KEY]);
					if (multiRoot) {
						updated = { ...updated, _meta: withSessionMultiRootMetadata(updated._meta, multiRoot) };
					}
					const artifacts = this._readPersistedArtifacts(m[SESSION_ARTIFACTS_KEY], sessionStr, '[AgentService][listSessions]');
					if (artifacts.length > 0) {
						updated = { ...updated, _meta: withSessionArtifacts(updated._meta, artifacts) };
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

		// A catalog pass opens every registered session's database, so it can be slow.
		const duration = Date.now() - startedAt;
		const message = `[AgentService] listSessions computed ${visible.length} of ${total} session(s) for mode '${mode}' in ${duration}ms (${additions.length} state-manager fallback)`;
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
		const rootValue = this._configurationService.getRootConfigValues()?.[AgentHostShowExternalSessionsConfigKey];
		if (rootValue === 'all') {
			return AgentHostExternalSessionsMode.Last30Days;
		}
		return this._configurationService.getRootValue(platformRootSchema, AgentHostShowExternalSessionsConfigKey) ?? AgentHostExternalSessionsMode.None;
	}

	private _startChatDiscovery(provider: IAgent, reason: string): void {
		void provider.startChatDiscovery?.().catch(error =>
			this._logService.warn(`[AgentService] Chat discovery for provider ${provider.id} failed after ${reason}`, error));
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
		// until it is opened (and thereby adopted): the agent host never surfaces it, so it
		// keeps showing under the legacy Copilot CLI provider. Adoption clears this marker
		// (and sets `ehcliAdopted`), so an adopted session surfaces normally below.
		if (readSessionEhcliAdoptable(session._meta)) {
			return false;
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

	private _isAgentMergeEnabled(): boolean {
		return this._configurationService.getRootValue(agentMergeRootConfigSchema, AgentMergeConfigKey.Enabled) === true;
	}

	private _queueSessionListReconciliation(previousMode?: AgentHostExternalSessionsMode): void {
		// A mode change carries specific previous-mode state and is rare/user-driven,
		// so run it directly rather than collapsing it into a coalesced pass.
		if (previousMode !== undefined) {
			this._sessionListReconciliation = this._sessionListReconciliation
				.then(() => this._reconcileExternalSessions(previousMode))
				.catch(error => this._logService.warn('[AgentService] External session reconciliation failed', error));
			return;
		}
		// Storm-driven reconciliations (discovery batches, adoptions, prune, summary
		// changes) all recompute the same current-state list, so a burst can collapse
		// to a single trailing run instead of one O(catalog) pass per trigger: while
		// one is in flight, further requests just mark it dirty to re-run once after.
		if (this._reconciliationInFlight) {
			this._reconciliationDirty = true;
			return;
		}
		this._reconciliationInFlight = true;
		this._reconciliationDirty = false;
		this._sessionListReconciliation = this._sessionListReconciliation
			.then(() => this._reconcileExternalSessions())
			.catch(error => this._logService.warn('[AgentService] External session reconciliation failed', error))
			.finally(() => {
				this._reconciliationInFlight = false;
				if (this._reconciliationDirty) {
					this._reconciliationDirty = false;
					this._queueSessionListReconciliation();
				}
			});
	}

	private async _reconcileExternalSessions(previousMode?: AgentHostExternalSessionsMode): Promise<void> {
		const startedAt = Date.now();
		const previouslyBroadcast = new Set(this._broadcastExternalSessions);
		const previouslyExposed = new Set(previouslyBroadcast);
		for (const session of this._stateManager.getExposedExternalSessionKeys()) {
			previouslyExposed.add(session);
		}
		const listed = previousMode !== undefined
			? this._resolveModeChangeVisibility(await this.listSessions(AgentHostExternalSessionsMode.Last30Days), previousMode, previouslyExposed)
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
			}
			if (this._stateManager.getSessionState(key)) {
				this._stateManager.setSessionSummaryPublished(key, true);
			} else {
				const provider = AgentSession.provider(metadata.session);
				if (provider) {
					await this._announceSurfacedSession(metadata, provider);
				}
			}
		}
		let retracted = 0;
		for (const key of previouslyExposed) {
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
		if (!this._shouldIncludeSession(meta) || this._announcedSurfacedKeys.has(key) || this._stateManager.getSessionState(key)) {
			return;
		}
		this._announcedSurfacedKeys.add(key);
		try {
			if (await this._sessionRegistry.isTombstoned(meta.session)) {
				this._announcedSurfacedKeys.delete(key);
				return;
			}
			// The external-sessions mode may have changed during the await above; re-check so a row that is no longer visible is not surfaced.
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
		const provider = this._providerService.resolveProvider(config?.provider);
		const isEphemeral = config ? readEphemeralSessionMeta(config).isEphemeral === true : false;
		if (!provider) {
			throw new Error(`No agent provider registered for: ${config?.provider ?? '(none)'}`);
		}
		if (config?.session) {
			this._cancelPendingSessionGc(config.session);
			this._sessionResidency.touch(config.session);
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
		const deferWorktreeCreation = sessionConfig?.values?.[SessionConfigKey.Isolation] === 'worktree' && !config?.importConversation;

		this._logService.trace(`[AgentService] createSession: initializing auto-approver and creating session...`);
		const [, created] = await Promise.all([
			initializeSideEffects,
			this._createProviderSession(provider, config, deferWorktreeCreation),
		]);
		const session = created.session;
		const isIdleProvisional = created.provisional === true && !config?.importConversation;
		this._logService.trace(`[AgentService] createSession: initialization complete`);
		const creationReference = readSessionCreationReference(config?._meta);
		const devContainerWorktree = readAgentDevContainerWorktreeMetadata(config?._meta);
		if ((creationReference || devContainerWorktree) && !isEphemeral) {
			try {
				const metadata: Record<string, string> = {};
				if (creationReference) {
					metadata[AH_META_CREATED_BY_SESSION_DB_KEY] = JSON.stringify(creationReference);
				}
				if (devContainerWorktree) {
					metadata[AH_META_DEV_CONTAINER_WORKTREE_DB_KEY] = JSON.stringify(devContainerWorktree);
				}
				await persistSessionMetadataValues(this._sessionDataService, session.toString(), metadata);
			} catch (err) {
				await this._rollbackProviderSession(provider, session);
				throw err;
			}
		}
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
				await this._rollbackProviderSession(provider, session);
				throw err;
			}
		} else {
			try {
				const registeredAt = Date.now();
				await this._retryRegistryMutation(
					() => this._sessionRegistry.register(session, { provider: provider.id, startTime: registeredAt, modifiedTime: registeredAt, source: 'explicit' }, { checkTombstone: false }),
					`registration for ${session.toString()}`,
				);
				if (!isIdleProvisional) {
					this._invalidateSessionList();
				}
			} catch (err) {
				await this._rollbackProviderSession(provider, session);
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
		const defaultChat = URI.parse(buildDefaultChatUri(session));
		const workingDirectories = config?.workingDirectories;
		const [initialCustomizations, folderPickerDecision] = await Promise.all([
			provider.getChatCustomizations(defaultChat, this._chatContext(session, defaultChat), this._hostCustomizations(session)).catch(err => {
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
			const importedTitle = this._buildImportedTitle(importedTurns);
			const summary = this._buildInitialSummary(provider, session, config, created, importedTitle);
			const state = this._stateManager.createSession(summary);
			state.config = sessionConfig;
			this._stateManager.seedDefaultChatTurns(summary.resource, importedTurns);
			state.activeClients = config.activeClient ? [config.activeClient] : [];

			// Refine the placeholder title into one generated from the imported
			// conversation. Imports seed pre-existing turns, so
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

		this._sessionResidency.touch(session);
		await this._sessionResidency.reconcile();
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

		return this._worktree.createDetachedWorktree({
			workingDirectory,
			config: this._configurationService.getSessionConfigValues(sessionChannel),
			prompt,
			githubToken: this._authService.getAuthToken({
				resource: this._gitHubEndpointService.getCopilotResource().resource,
				scopes: this._gitHubEndpointService.getCopilotResource().scopes_supported,
			}),
		});
	}

	setDetachedWorktreeArchived(handle: string, archived: boolean): Promise<void> {
		return this._worktree.setDetachedWorktreeArchived(handle, archived);
	}

	claimDetachedWorktree(handle: string): Promise<void> {
		return this._worktree.claimDetachedWorktree(handle);
	}

	deleteDetachedWorktree(handle: string): Promise<void> {
		return this._worktree.deleteDetachedWorktree(handle);
	}

	reconcileDetachedWorktrees(scope: string, activeHandles: readonly string[]): Promise<void> {
		return this._worktree.reconcileDetachedWorktrees(scope, activeHandles);
	}

	async createChat(session: URI, chat: URI, options?: IAgentCreateChatRequestOptions): Promise<void> {
		const sessionKey = session.toString();
		const provider = this._providerService.getProviderForSession(session);
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
		const { sideChat, ...providerOptions } = options ?? {};
		let createOptions: IAgentCreateChatOptions | undefined = providerOptions;
		// Persist exhaustive provenance for peer chats. Fresh user-created chats
		// leave this undefined and default to `ChatOriginKind.User`.
		let peerChatOrigin: ChatOrigin | undefined;
		if (sideChat) {
			const resolvedSideChat = await this._resolveSideChatOrigin(session, sideChat);
			peerChatOrigin = resolvedSideChat.origin;
			createOptions = {
				...providerOptions,
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
		if (createOptions?.fork && !sideChat) {
			const { sourceChatKey, sourceSessionKey, sourceState } = await this._resolveSessionSourceChat(createOptions.fork.source);
			if (this._stateManager.getChatOrigin(sourceChatKey)?.kind === ChatOriginKind.Tool) {
				throw new Error(`[AgentService] createChat: cannot fork provider-spawned chat ${sourceChatKey}`);
			}
			const sourceTurns = sourceState?.turns ?? [];
			// Hoisted: narrowing on `createOptions` does not survive into the callback.
			const forkTurnId = createOptions.fork.turnId;
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
				peerChatOrigin = { kind: ChatOriginKind.Fork, chat: sourceChatKey, turnId: createOptions.fork.turnId };

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
				const concreteForkTurnId = this._localTurns.resolveConcreteTurnId(sourceChatKey, createOptions.fork.turnId);
				createOptions = {
					...createOptions,
					fork: {
						...createOptions.fork,
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
			await this._persistPeerChat(session, chat, providerData, peerChatOrigin, createResult?.inheritedTurnId);
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
			...(createResult?.inheritedTurnId !== undefined ? { inheritedTurnId: createResult.inheritedTurnId } : {}),
		});
		this._sessionResidency.touch(session);
		void this._sessionResidency.reconcile();

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
			shouldFork: !activeTurn || anchorTurnId !== undefined,
			...(selection ? { selection } : {}),
			...(anchorTurnId ? { anchorTurnId } : {}),
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
		const provider = this._providerService.getProviderForSession(session);
		this._disposingPeerChats.add(chatKey);
		try {
			await this._checkpointService.discardChatTurnStartCheckpoints(session, chat);
			if (provider) {
				await this._disposeChat(provider, chat);
			}
			await this._removePersistedPeerChat(session, chat);
			this._sideEffects.cancelSubagentSessions(chatKey);
			this._sideEffects.clearChannelTelemetry(chatKey);
			this._chatContributions.disposeChatState(chatKey);
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
			this._worktree.notePending(requestedSessionId);
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
				this._worktree.notePending(AgentSession.id(created.session));
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
				this._worktree.clearPending(requestedSessionId);
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
		return this._orderSessionChatsForTeardown(session, state?.chats.map(chat => chat.resource) ?? []);
	}

	private async _getSessionChatsForDisposal(provider: IAgent, session: URI): Promise<URI[]> {
		const state = this._stateManager.getSessionState(session.toString());
		if (state) {
			return this._getSessionChatsInTeardownOrder(session);
		}
		const persisted = await this._readPersistedPeerChatCatalog(session);
		const peerChats = persisted?.map(chat => chat.uri)
			?? (await provider.listLegacyChatBackings?.(session))?.map(chat => chat.uri.toString())
			?? [];
		return this._orderSessionChatsForTeardown(session, peerChats);
	}

	private _orderSessionChatsForTeardown(session: URI, chats: readonly string[]): URI[] {
		const defaultChat = buildDefaultChatUri(session.toString());
		const result: URI[] = [];
		const seen = new Set<string>();
		for (const chat of chats) {
			if (chat !== defaultChat && !seen.has(chat)) {
				seen.add(chat);
				result.push(URI.parse(chat));
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
		for (const chat of await this._getSessionChatsForDisposal(provider, session)) {
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
		this._logService.trace(`[AgentService] getChatMessages start: chat=${chat.toString()}`);
		const providerTurns = await provider.chats.getMessages(chat, context);
		this._logService.trace(`[AgentService] getChatMessages: provider returned ${providerTurns.length} turn(s) for chat=${chat.toString()}`);
		return this._chatContributions.hydrateTurns({ session: session.toString(), chat: chat.toString() }, providerTurns);
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
		const convOptions: IAgentCreateChatOptions | undefined = (options?.title !== undefined || options?.model !== undefined || placement)
			? {
				...(options?.title !== undefined ? { title: options.title } : {}),
				...(options?.model !== undefined ? { model: options.model } : {}),
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
		let _meta = withSessionGitHubState(undefined, explicitGitHubState);
		_meta = withSessionMultiRootMetadata(_meta, explicitMultiRoot);
		_meta = withEphemeralSessionMeta(_meta, config ? readEphemeralSessionMeta(config).isEphemeral : undefined);
		_meta = withChatSurfaceMeta(_meta, readChatSurfaceMeta(config ?? {}));
		_meta = withSessionExternal(_meta, false);
		const creationReference = readSessionCreationReference(config?._meta);
		_meta = creationReference ? withSessionCreationReference(_meta, creationReference) : _meta;
		const devContainerWorktree = readAgentDevContainerWorktreeMetadata(config?._meta);
		_meta = devContainerWorktree ? withAgentDevContainerWorktreeMetadata(_meta, devContainerWorktree.handle) : _meta;
		_meta = !config?.workingDirectories
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
			if (!state.chats.some(chat => chat.resource.toString() === e.chat.toString())) {
				return;
			}
			if (e.result?.providerData !== undefined) {
				this._onChatDataChanged({ chat: e.chat, providerData: e.result.providerData });
			}
			if (e.result?.backingSession) {
				void this._markChatBacking(e.result.backingSession, e.chat);
			}
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
		const project = this._worktree.sessionWorktreeProject(AgentSession.id(session)) ?? e.project;
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
		const provider = this._providerService.resolveProvider(params.provider);
		if (!provider) {
			throw new Error(`No agent provider registered for: ${params.provider ?? '(none)'}`);
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
		const iso = await this._worktree.resolveIsolationConfig({ workingDirectory: params.workingDirectory, config: params.config });
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
		if (iso.worktreeBranchTrackProperty) {
			properties[SessionConfigKey.WorktreeBranchTrack] = iso.worktreeBranchTrackProperty.protocol;
		}
		if (iso.worktreeCreateNewBranchProperty) {
			properties[SessionConfigKey.WorktreeCreateNewBranch] = iso.worktreeCreateNewBranchProperty.protocol;
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
		if (iso.worktreeCreateNewBranchProperty && typeof params.config?.[SessionConfigKey.WorktreeCreateNewBranch] === 'boolean') {
			values[SessionConfigKey.WorktreeCreateNewBranch] = params.config[SessionConfigKey.WorktreeCreateNewBranch];
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
		if (params.property === SessionConfigKey.Branch && this._worktree.supported) {
			return this._worktree.branchCompletions(params.workingDirectory, params.query);
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

	async disposeSession(session: URI): Promise<void> {
		this._logService.trace(`[AgentService] disposeSession: ${session.toString()}`);
		await this._sessionResidency.runDisposal(session, () => this._doDisposeSession(session));
	}

	private async _doDisposeSession(session: URI): Promise<void> {
		const sessionKey = session.toString();
		this._cancelPendingSessionGc(session);
		const isEphemeral = this._stateManager.isEphemeralSession(sessionKey);
		const isIdleProvisional = this._stateManager.isIdleProvisionalSession(sessionKey);
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
		const worktree = await this._worktree.prepareSessionDeletion(session, sessionId);
		const provider = this._providerService.getProviderForSession(session);
		if (provider) {
			await this._disposeSession(provider, session);
		}
		if (!isEphemeral) {
			await this._retryRegistryMutation(
				() => this._sessionRegistry.tombstone(session),
				`unregistration for ${session.toString()}`,
			);
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
		await this._worktree.removeSessionWorktree(sessionId, worktree);
		this._changesetCoordinator.onSessionDisposed(session.toString());
		this._sideEffects.clearInputRequestsForSession(session.toString());
		// Remove all subagent sessions for this parent
		this._sideEffects.removeSubagentSessions(session.toString());
		this._stateManager.deleteSession(session.toString());
		if (isEphemeral) {
			await this._retryRegistryMutation(
				() => this._sessionRegistry.clearTombstone(session),
				`clearing ephemeral session tombstone for ${session.toString()}`,
			);
		}
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

	async subscribe(resource: URI, clientId: string, isActive?: () => boolean): Promise<IStateSnapshot> {
		this._logService.trace(`[AgentService] subscribe: ${resource.toString()}`);
		const resourceStr = resource.toString();
		const subscribe = async (telemetry: IAgentHostSessionOpenTelemetryScope): Promise<IStateSnapshot> => {
			const restoreSession = (session: URI) => this.restoreSession(session, joinedRestore => telemetry.restoreStarted(joinedRestore));
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

			let snapshot = this._stateManager.getSnapshot(resourceStr);
			telemetry.setServedFromMemory(!!snapshot);
			const parsedChangeset = parseChangesetUri(resourceStr);
			if (snapshot && parsedChangeset && !this._stateManager.getSessionState(parsedChangeset.sessionUri)) {
				await this._changesetCoordinator.restoreSessionIfChangesetSubscription(resource, restoreSession);
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
							await restoreSession(parentUri);
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
					const handled = await this._changesetCoordinator.tryHandleSubscribe(resource, restoreSession);
					if (handled) {
						snapshot = this._stateManager.getSnapshot(resourceStr);
					} else {
						// Try subagent restore before regular session restore
						const parsedSubagent = parseSubagentSessionUri(resource);
						if (parsedSubagent) {
							await this._restoreSubagentSession(resourceStr, parsedSubagent.parentSession);
						} else {
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
			this._sessionResidency.touch(resource);
			void this._sessionResidency.reconcile();

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
			if (!isAhpChatChannel(resourceStr) && sessionState && needsSessionGitStateRefresh(readSessionGitState(sessionState._meta))) {
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
			return await this._sessionOpenTelemetry.withSubscription(resource, subscribe);
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
		// any pending GC or idle-release armed while it had no subscribers.
		this._cancelPendingSessionGc(resource);
		this._cancelPendingEphemeralSessionGc(resource);
		// 0→1 transition — covers both the full subscribe path AND the
		// handshake fast-path used by `ProtocolServerHandler` when state is
		// already cached. The coordinator decides whether the URI is one
		// it cares about (e.g. uncommitted changeset → trigger refresh).
		if (this._subscriptions.addSubscriber(resource, clientId)) {
			this._changesetCoordinator.onFirstSubscriber(resource);
		}
		this._sessionResidency.touch(resource);
	}

	unsubscribe(resource: URI, clientId: string): void {
		if (this._store.isDisposed) {
			return;
		}
		if (!this._subscriptions.removeSubscriber(resource, clientId)) {
			return;
		}
		this._changesetCoordinator.onLastSubscriber(resource);
		this._stateManager.onChangesetLivenessChanged();
		if (this._maybeScheduleEphemeralSessionGc(resource)) {
			return;
		}
		// An empty session whose last subscriber dropped is a candidate for
		// full GC (provider session, worktree, on-disk state). Sessions with
		// at least one turn participate in residency reconciliation, which only
		// drops the in-memory cache and lets the session be restored from disk
		// later. Skipping eviction here for empty
		// sessions ensures their state stays observable so a re-subscribe
		// can re-arm GC.
		if (this._maybeScheduleSessionGc(resource)) {
			return;
		}
		void this._sessionResidency.reconcile();
	}

	/**
	 * Schedules full cleanup for a throwaway surface after all its session and
	 * chat subscriptions are gone, regardless of whether it has completed turns.
	 */
	private _maybeScheduleEphemeralSessionGc(resource: URI): boolean {
		const session = resolveAgentHostSession(resource);
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
	 *
	 * Returns `true` if a GC timer was armed (existing or newly scheduled),
	 * so callers can skip alternative cleanup paths.
	 */
	private _maybeScheduleSessionGc(resource: URI): boolean {
		const session = resolveAgentHostSession(resource);
		if (this._subscriptions.hasSessionSubscribers(session)) {
			return true;
		}
		const key = session.toString();
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
		// Never tear down a session Agent Merge is holding.
		if (this._agentMergeController.holdsSession(key)) {
			return false;
		}
		this._pendingSessionGc.set(session, disposableTimeout(() => {
			this._pendingSessionGc.deleteAndDispose(session);
			this._runSessionGc(session).catch(err => {
				this._logService.error(err, `[AgentService] GC failed for ${key}`);
			});
		}, SESSION_GC_GRACE_MS));
		return true;
	}

	private _cancelPendingSessionGc(resource: URI): void {
		this._pendingSessionGc.deleteAndDispose(resolveAgentHostSession(resource));
	}

	private _cancelPendingEphemeralSessionGc(resource: URI): void {
		const session = resolveAgentHostSession(resource);
		if (this._stateManager.isEphemeralSession(session.toString())) {
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
		const sessionUri = URI.parse(parsed.sessionUri);
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
	 * Applies a read/archive toggle to a session that is not currently
	 * materialized, by writing the flag to the session database and publishing
	 * the catalogue delta on the root channel.
	 *
	 * Restoring instead cannot work: restore reopens the working directory, and
	 * for a missing one only an *already* archived session resumes read-only —
	 * so archiving, the very thing that would archive it, could never land.
	 *
	 * Returns `false` for a session the host does not know, which the caller must
	 * drop: creating `agentSessionData/<id>` is how Agent Host claims ownership,
	 * never a side effect of a metadata toggle. Callers must rule out live state
	 * first, so an absent surfaced summary can only mean "unknown".
	 */
	private async _applyPassiveSessionMetadata(session: string, action: IIsArchivedChangedAction | IIsReadChangedAction): Promise<boolean> {
		if (!this._stateManager.getSurfacedSessionSummary(session)) {
			return false;
		}
		const [key, flag, set] = action.type === ActionType.SessionIsArchivedChanged
			? [AH_META_IS_ARCHIVED_DB_KEY, SessionStatus.IsArchived, action.isArchived] as const
			: [AH_META_IS_READ_DB_KEY, SessionStatus.IsRead, action.isRead] as const;
		await persistSessionMetadataValues(this._sessionDataService, session, { [key]: set ? 'true' : '' });
		this._stateManager.setSurfacedSessionStatusFlag(session, flag, set);
		return true;
	}

	private _isAutomationAction(action: SessionAction | ChatAction | TerminalAction | ClientChangesetAction | ClientAnnotationsAction | IRootConfigChangedAction | ClientAutomationAction | ClientAutomationRunAction): action is ClientAutomationAction {
		return action.type === ActionType.AutomationCreateRequested
			|| action.type === ActionType.AutomationUpdateRequested
			|| action.type === ActionType.AutomationRemoved;
	}

	private _isAutomationRunAction(action: SessionAction | ChatAction | TerminalAction | ClientChangesetAction | ClientAnnotationsAction | IRootConfigChangedAction | ClientAutomationAction | ClientAutomationRunAction): action is ClientAutomationRunAction {
		return action.type === ActionType.AutomationRunCancelRequested;
	}

	dispatchAction(channel: string, action: SessionAction | ChatAction | TerminalAction | ClientChangesetAction | ClientAnnotationsAction | IRootConfigChangedAction | ClientAutomationAction | ClientAutomationRunAction, clientId: string, clientSeq: number, clientContextOrType: IAgentHostClientTelemetryContext | AgentHostClientType = AgentHostClientType.Unknown): void {
		const clientContext = typeof clientContextOrType === 'string'
			? createUnknownAgentHostClientTelemetryContext(clientContextOrType)
			: clientContextOrType;
		this._logService.trace(`[AgentService] dispatchAction: type=${action.type}, clientId=${clientId}, clientSeq=${clientSeq}`, action);
		if (action.type === ActionType.RootConfigChanged && Object.hasOwn(action.config, AGENT_HOST_AUTOMATION_MIGRATION_CONFIG_KEY)) {
			const migration = action.config[AGENT_HOST_AUTOMATION_MIGRATION_CONFIG_KEY];
			const origin = { clientId, clientSeq };
			if (!isAgentHostAutomationMigrationCompletion(migration)) {
				this._stateManager.rejectClientAction(channel, action, origin, 'Invalid automation migration completion payload.');
				return;
			}
			if (Object.keys(action.config).length !== 1 || action.replace) {
				this._stateManager.rejectClientAction(channel, action, origin, 'Automation migration completion must be dispatched as an isolated root-config patch.');
				return;
			}
			this._dispatchAutomationMigrationAction(channel, action, clientId, clientSeq, clientContext);
			return;
		}
		if (this._isAutomationAction(action)) {
			const origin = { clientId, clientSeq };
			if (!isAhpAutomationCatalogChannel(channel)) {
				this._stateManager.rejectClientAction(channel, action, origin, 'Automation actions require the automation catalogue channel.');
				return;
			}

			void this._dispatchAutomationAction(action).catch(error => {
				const message = toErrorMessage(error);
				this._logService.error(`[AgentService] automation action failed: ${message}`);
				this._stateManager.rejectClientAction(channel, action, origin, message);
			});
			return;
		}
		if (this._isAutomationRunAction(action)) {
			const origin = { clientId, clientSeq };
			if (!isAhpAutomationRunChannel(channel)) {
				this._stateManager.rejectClientAction(channel, action, origin, 'Automation run actions require an automation-run channel.');
				return;
			}
			void this._automationService.handleCancel(channel, action).catch(error => {
				const message = toErrorMessage(error);
				this._logService.error(`[AgentService] automation run action failed: ${message}`);
				this._stateManager.rejectClientAction(channel, action, origin, message);
			});
			return;
		}

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
			const sessionUri = URI.parse(sessionChannel);
			const subagent = parseSubagentSessionUri(sessionUri);
			// Evaluated here rather than from the entry-time `requiresSessionRestore`:
			// this callback is queued behind earlier dispatches, so the session may
			// since have been restored or evicted. Joining an in-flight restore also
			// stops this write racing the metadata read that builds the restored summary.
			if (isPassiveSessionMetadataAction(action) && !subagent) {
				await this._restoreSessionInFlight.get(sessionChannel)?.catch(() => undefined);
				if (!this._stateManager.getSessionState(sessionChannel)) {
					if (readSessionEhcliAdoptable(this._stateManager.getSurfacedSessionSummary(sessionChannel)?._meta)) {
						// Dropped so listing / scrolling can't adopt an un-opened legacy session; only an explicit open (subscribe) adopts.
						return;
					}
					// Falls through so the envelope and its side effects (worktree
					// cleanup, `onArchivedChanged`, Agent Merge sync) still run.
					if (!await this._applyPassiveSessionMetadata(sessionChannel, action)) {
						return;
					}
				}
			} else if (requiresSessionRestore) {
				if (subagent) {
					await this._restoreSubagentSession(sessionChannel, subagent.parentSession);
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

	private _dispatchAutomationMigrationAction(channel: string, action: IRootConfigChangedAction, clientId: string, clientSeq: number, clientContext: IAgentHostClientTelemetryContext): void {
		const pending = this._clientDispatchQueues.get(clientId);
		const next = (pending ?? Promise.resolve()).then(async () => {
			const migration = action.config[AGENT_HOST_AUTOMATION_MIGRATION_CONFIG_KEY];
			if (!isAgentHostAutomationMigrationCompletion(migration)) {
				throw new Error('Invalid automation migration completion payload.');
			}
			await this._automationService.completeMigration(migration.resources);
			this._dispatchActionNow(channel, channel, action, clientId, clientSeq, clientContext);
		}).catch(error => {
			const message = toErrorMessage(error);
			this._logService.error(`[AgentService] Failed to complete automation migration: ${message}`);
			this._stateManager.rejectClientAction(channel, action, { clientId, clientSeq }, message);
		}).finally(() => {
			if (this._clientDispatchQueues.get(clientId) === next) {
				this._clientDispatchQueues.delete(clientId);
			}
		});
		this._clientDispatchQueues.set(clientId, next);
	}

	private async _dispatchAutomationAction(action: ClientAutomationAction): Promise<void> {
		switch (action.type) {
			case ActionType.AutomationCreateRequested:
				return this._automationService.handleCreate(action);
			case ActionType.AutomationUpdateRequested:
				return this._automationService.handleUpdate(action);
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
		const provider = this._providerService.getProviderForSession(sessionUri);
		const capability = provider?.getDescriptor().capabilities?.multipleWorkingDirectories;
		if (!provider || !capability) {
			throw new Error(`Provider does not support dynamic working-directory changes: ${AgentSession.provider(sessionUri) ?? '(unknown)'}`);
		}

		return resolveSessionWorkingDirectoryAction(action, state.workingDirectories, {
			immutablePrimary: capability.immutablePrimary === true,
			primaryReplacement: capability.primaryReplacement === true,
		});
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
		if (action.type === ActionType.ChatTurnCancelled) {
			const resumedDuration = this._sideEffects.getResumedTurnDuration(channel, action.turnId);
			if (resumedDuration !== undefined) {
				action = { ...action, duration: resumedDuration };
			}
		}
		let resumedTurn: Turn | undefined;
		if (action.type === ActionType.ChatTurnResume) {
			if (!isAhpChatChannel(channel)) {
				this._stateManager.rejectClientAction(channel, action, origin, 'Turn resume requires a chat channel.');
				return;
			}
			const chatState = this._stateManager.getChatState(channel);
			const sessionState = this._stateManager.getSessionState(sessionChannel);
			const sessionArchived = ((sessionState?.status ?? 0) & SessionStatus.IsArchived) === SessionStatus.IsArchived;
			const turn = chatState?.turns.at(-1);
			const errorPart = getErrorResponsePart(turn);
			const provider = this._providerService.getProviderForSession(sessionChannel);
			if (chatState?.activeTurn) {
				this._stateManager.rejectClientAction(channel, action, origin, 'Cannot resume while a turn is active.');
				return;
			}
			if (isChatReadOnly(chatState?.interactivity, sessionArchived)) {
				this._stateManager.rejectClientAction(channel, action, origin, 'Cannot resume a read-only or archived chat.');
				return;
			}
			if (!turn || turn.id !== action.turnId || turn.state !== TurnState.Error || errorPart?.resumable !== true) {
				this._stateManager.rejectClientAction(channel, action, origin, 'The requested turn is not the latest resumable errored turn.');
				return;
			}
			if (!provider?.chats.resumeTurn) {
				this._stateManager.rejectClientAction(channel, action, origin, 'The session provider does not support turn resume.');
				return;
			}
			resumedTurn = turn;
		}
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
		const automationMigration = action.type === ActionType.RootConfigChanged
			? action.config[AGENT_HOST_AUTOMATION_MIGRATION_CONFIG_KEY]
			: undefined;
		if (automationMigration !== undefined && !isAgentHostAutomationMigrationCompletion(automationMigration)) {
			this._stateManager.rejectClientAction(channel, action, origin, 'Invalid automation migration completion payload.');
			return;
		}
		this._stateManager.dispatchClientAction(channel, action, origin, clientContext);
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
		this._sideEffects.handleAction(channel, action, clientId, clientContext, resumedTurn);
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
		const attachmentsRoot = this._attachmentsRoot(sessionURI);
		return !!action.message.attachments?.some(a =>
			this._isRewritableAttachment(a, attachmentsRoot) || this._isUntaggedSnapshotResource(a, attachmentsRoot));
	}
	private _isRewritableAttachment(attachment: MessageAttachment, attachmentsRoot: URI): boolean {
		if (attachment.type === MessageAttachmentKind.EmbeddedResource) {
			return true;
		}
		if (attachment.type === MessageAttachmentKind.Resource) {
			// Don't try to fetch directories or already-rewritten attachments
			// (whose URIs already point under our session attachments folder).
			if (attachment.displayKind === 'directory') {
				return false;
			}
			if (this._isUnderAttachmentsRoot(attachment.uri, attachmentsRoot)) {
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
	private _isUntaggedSnapshotResource(attachment: MessageAttachment, attachmentsRoot: URI): boolean {
		return attachment.type === MessageAttachmentKind.Resource
			&& attachment.displayKind !== 'directory'
			&& this._isUnderAttachmentsRoot(attachment.uri, attachmentsRoot)
			&& !isHostSnapshotAttachment(attachment);
	}

	/**
	 * Whether an attachment URI points at the session attachments directory or a descendant. Uses URI
	 * containment (not a string-prefix check) so a sibling such as `.../attachments-backup/file` is not
	 * matched, and — on case-insensitive filesystems — a real snapshot whose path casing differs is
	 * still recognised. Mirrors the write-deny classifier (`isSessionAttachmentPath`).
	 */
	private _isUnderAttachmentsRoot(attachmentUri: string, attachmentsRoot: URI): boolean {
		return extUriBiasedIgnorePathCase.isEqualOrParent(URI.parse(attachmentUri), attachmentsRoot);
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
		const rewritten = await Promise.all(attachments.map(a => this._rewriteSingleAttachment(a, attachmentsRoot, clientId)));
		return {
			...action,
			message: { ...action.message, attachments: rewritten },
		};
	}

	private async _rewriteSingleAttachment(attachment: MessageAttachment, attachmentsRoot: URI, clientId: string): Promise<MessageAttachment> {
		try {
			if (attachment.type === MessageAttachmentKind.EmbeddedResource) {
				const bytes = decodeBase64(attachment.data).buffer;
				const basename = this._attachmentBasename(attachment.label, attachment.contentType);
				return this._writeAndRewrite(attachment, bytes, basename, attachmentsRoot, attachment.contentType);
			}
			if (attachment.type === MessageAttachmentKind.Resource) {
				// A snapshot re-attached from our own attachments folder (e.g. the user opened the
				// copy, or implicit context captured it) must still be tagged read-only so providers
				// don't treat it as an editable file (#331154), but must not be re-snapshotted.
				if (this._isUntaggedSnapshotResource(attachment, attachmentsRoot)) {
					return this._tagSnapshotAttachment(attachment, getMediaMime(URI.parse(attachment.uri).path));
				}
				if (this._isRewritableAttachment(attachment, attachmentsRoot)) {
					const originalUri = URI.parse(attachment.uri);
					// If the attachment references a file that already exists on the agent
					// host side, leave it untouched rather than snapshotting a client copy (#319314).
					if (originalUri.scheme === Schemas.file && await this._fileExistsSafe(originalUri)) {
						return attachment;
					}

					const contentType = getMediaMime(originalUri.path);
					const bytes = await this._readClientResource(originalUri, clientId);
					const basename = this._attachmentBasename(attachment.label, contentType);
					return this._writeAndRewrite(attachment, bytes, basename, attachmentsRoot, contentType);
				}
			}
		} catch (err) {
			this._logService.warn(`[AgentService] Failed to rewrite attachment '${attachment.label}': ${toErrorMessage(err)}`);
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

	async restoreSession(session: URI, onRestoreStart?: (joinedRestore: boolean) => void): Promise<void> {
		const sessionStr = session.toString();
		this._cancelPendingSessionGc(session);
		this._sessionResidency.touch(session);
		await this._sessionResidency.waitForRelease(session);

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
		const restore = this._doRestoreSession(session, sessionStr);
		this._restoreSessionInFlight.set(sessionStr, restore);
		try {
			await restore;
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
		provider: string,
		outcome: AgentHostLegacyMigrationEvent['outcome'],
		startTime: number,
		extra: { turnCount?: number; hasProject?: boolean; hasWorktree?: boolean; workingDirectoryCount?: number; errorMessage?: string; reason?: AgentChatAdoptionReason },
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
			reason: extra.reason ?? 'unknown',
		});
	}

	private async _doRestoreSession(session: URI, sessionStr: string): Promise<void> {
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
				throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session is not an adoptable legacy chat: ${sessionStr}`);
			}
		}

		// From here the whole restore is wrapped so `migrated` is reported only
		// after every required step succeeds, and any failure after a successful
		// adoption is surfaced as a migration failure.
		let registeredAfterAdoption = !!registeredSession;
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
			const facts = await this._restoreSessionState(agent, session, sessionStr, adopted, external, registeredSession?.source ?? 'restore', awaitCatalogReadable, !!registeredSession, adoption.worktree);
			await this._restoreAnnotations(session);
			if (adopted) {
				// Discovery never surfaced this chat when migration was enabled after
				// startup, so clients have no entry for it and a restore alone stays
				// silent. Publishing announces it with the adopted summary.
				this._stateManager.setSessionSummaryPublished(sessionStr, true);
				this._reportLegacyMigration(agent.id, 'migrated', migrationStartTime, { ...facts, reason: adoption.reason });
			} else if (adoption.eligible) {
				// Migrate setting on and a genuine legacy candidate, but not adopted
				// this pass (e.g. its on-disk working directory could not be resolved).
				this._logService.info(`[AgentService] legacy session ${sessionStr} was a migration candidate but was not adopted (reason=${adoption.reason ?? 'unknown'})`);
				this._reportLegacyMigration(agent.id, 'skipped', migrationStartTime, { hasProject: facts.hasProject, workingDirectoryCount: facts.workingDirectoryCount, reason: adoption.reason });
			}
		} catch (err) {
			if (adopted) {
				this._logService.error(registeredAfterAdoption
					? `[AgentService] legacy session ${sessionStr} was adopted but its restore failed; it is registered so it surfaces with an error rather than disappearing`
					: `[AgentService] legacy session ${sessionStr} was adopted but could not be registered; the extension host no longer lists it, so it will not appear until the next successful restore`, err);
				this._reportLegacyMigration(agent.id, 'failed', migrationStartTime, { errorMessage: toErrorMessage(err), reason: adoption.reason });
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
	private async _restoreSessionState(agent: IAgent, session: URI, sessionStr: string, adopted: boolean, external: boolean, registrationSource: IRegisteredSession['source'], awaitCatalogReadable: () => Promise<boolean>, sessionKnownToRegistry: boolean, adoptionWorktree: IAgentAdoptedWorktree | undefined): Promise<{ turnCount: number; hasProject: boolean; hasWorktree: boolean; workingDirectoryCount: number }> {
		this._logService.trace(`[AgentService] restore: reading provider metadata for ${sessionStr}`);
		let meta = await this._getSessionMetadataForRestore(agent, session, external);
		if (!meta) {
			// Only a miss needs the catalogue: it decides whether the session is
			// genuinely absent, and warming it may enumerate thousands of sessions.
			const catalogReadable = await awaitCatalogReadable();
			meta = await this._getSessionMetadataForRestore(agent, session, external);
			// The registry is backfilled by that same pass, so re-read it before
			// concluding the session is unknown.
			const knownToRegistry = sessionKnownToRegistry || (await this._listRegisteredSessions()).some(entry => entry.session.toString() === sessionStr);
			if (!meta) {
				// Authoritative absence only when the catalog was readable this run and
				// the registry has no record of the session; a miss for a known
				// (registered) session, or while the catalog was unavailable, is
				// transient — e.g. a provider whose SDK is not downloaded yet (#331648).
				throw catalogReadable && !knownToRegistry
					? new ProtocolError(AHP_SESSION_NOT_FOUND, `Session not found on backend: ${sessionStr}`)
					: new ProtocolError(JSON_RPC_INTERNAL_ERROR, `Provider ${agent.id} could not describe ${sessionStr} yet`);
			}
		}
		this._logService.trace(`[AgentService] restore: provider metadata resolved for ${sessionStr}`);

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
							[AH_META_EHCLI_ADOPTED_DB_KEY]: true,
							[AH_META_EHCLI_LAST_TURN_DB_KEY]: true,
							[AH_META_CREATED_BY_SESSION_DB_KEY]: true,
							[AH_META_DEV_CONTAINER_WORKTREE_DB_KEY]: true,
							[SESSION_META_MULTI_ROOT_KEY]: true,
							[SESSION_ARTIFACTS_KEY]: true,
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
		this._logService.trace(`[AgentService] restore: persisted session metadata read for ${sessionStr}`);

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

		const { draft: defaultDraft, title: defaultChatTitle } = await this._chatContributions.hydrateChat({
			session: sessionStr,
			chat: defaultChatUri.toString(),
		}, {});
		// This overlay stays here rather than moving into `ChatDraftContribution`: it seeds
		// the draft's model from `IAgent`-supplied session metadata, so it is provider-shaped,
		// and moving it would put provider metadata into `IHydrationContext` for one consumer.
		const restoredDraft = meta.model
			? { ...(defaultDraft ?? { text: '', origin: { kind: MessageKind.User } }), model: meta.model }
			: defaultDraft;
		const mergedTurns = await this._interleaveLocalTurns(sessionStr, defaultChatUri.toString(), turns);
		const registered = await this._retryRegistryMutation(
			() => this._sessionRegistry.register(session, { provider: agent.id, startTime: meta.startTime, modifiedTime: meta.modifiedTime, source: registrationSource }, { checkTombstone: true }),
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
		this._logService.trace(`[AgentService] restore: hydrated state for ${sessionStr} with ${mergedTurns.length} turn(s)`);
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
			const { title, draft } = await this._chatContributions.hydrateChat({
				session: session.toString(),
				chat: chatUri.toString(),
			}, {});
			return { chatUri, title, draft, providerData: entry.providerData, origin: entry.origin, inheritedTurnId: entry.inheritedTurnId };
		}));
		for (const item of restored) {
			if (!item) {
				continue;
			}
			const { chatUri, title, draft, providerData, origin, inheritedTurnId } = item;
			if (this._stateManager.getChatState(chatUri.toString())) {
				continue;
			}
			this._stateManager.registerRestoredChatSummary(session.toString(), chatUri.toString(), {
				title,
				draft,
				providerData,
				origin,
				inheritedTurnId,
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
		const agent = this._providerService.getProviderForSession(session);
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
					...(typeof entry.inheritedTurnId === 'string' ? { inheritedTurnId: entry.inheritedTurnId } : {}),
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
	private _persistPeerChat(session: URI, chat: URI, providerData: string | undefined, origin?: ChatOrigin, inheritedTurnId?: string): Promise<void> {
		const chatUri = chat.toString();
		return this._enqueuePeerChatCatalogWrite(session, entries => {
			const existing = entries.find(entry => entry.uri === chatUri);
			const effectiveOrigin = origin ?? existing?.origin;
			const effectiveInheritedTurnId = inheritedTurnId ?? existing?.inheritedTurnId;
			const next = entries.filter(entry => entry.uri !== chatUri);
			next.push({
				uri: chatUri,
				...(providerData !== undefined ? { providerData } : {}),
				...(effectiveOrigin !== undefined ? { origin: effectiveOrigin } : {}),
				...(effectiveInheritedTurnId !== undefined ? { inheritedTurnId: effectiveInheritedTurnId } : {}),
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
								...(typeof entry.inheritedTurnId === 'string' ? { inheritedTurnId: entry.inheritedTurnId } : {}),
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

	private async _getSessionMetadataForRestore(agent: IAgent, session: URI, external: boolean): Promise<IAgentSessionMetadata | undefined> {
		const sessionStr = session.toString();
		const chat = URI.parse(buildDefaultChatUri(session));
		try {
			const metadata = await agent.getChatMetadata(chat, this._chatContext(session, chat), await this._readDefaultChatProviderData(session), { activation: 'restore' });
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
		if (!meta) {
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
		return allSessions === AgentChatMigrationDeferred ? undefined : allSessions?.find(candidate => candidate.session.toString() === sessionStr);
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
		return this._editAttributionService.prepareFlush(params);
	}

	commitEditAttributionFlush(params: ICommitEditAttributionFlushParams): Promise<IEditAttributionFlushResult> {
		return this._editAttributionService.commitFlush(params);
	}

	cancelEditAttributionFlush(params: ICancelEditAttributionFlushParams): Promise<IEditAttributionFlushResult> {
		return this._editAttributionService.cancelFlush(params);
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
		try {
			await this._providerService.shutdown();
		} finally {
			await this._debugLogsCollector?.cleanup();
			await this._orchestratorDatabase.close();
			this._downloadProgressInterest.clear();
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

	async collectDebugLogs(session: URI | undefined, kind: AgentHostDebugLogsArtifactKind, chat?: URI): Promise<IAgentHostDebugLogsArtifact> {
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
		return this._debugLogsCollector.collect(providers, session, kind, chat);
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
		const owningSession = resolveAgentHostSession(URI.parse(fields.sessionUri));
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
			if (!wasRestored && this._stateManager.getSessionState(owningSession.toString()) && !this._subscriptions.hasSessionSubscribers(owningSession)) {
				void this._sessionResidency.reconcile();
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
		const agent = this._providerService.getProviderForSession(parentSession);
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
			const { title: persistedTitle } = await this._chatContributions.hydrateChat({
				session: parentSessionStr,
				chat: chatUri,
			}, {});
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

	override dispose(): void {
		// Unblocks pending deferred work so its chain drains; the disposal guard
		// in `_runWhenStartupSettled` keeps the work itself from running.
		this._startupSettled.open();
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
