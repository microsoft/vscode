/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64, VSBuffer } from '../../../base/common/buffer.js';
import { disposableTimeout } from '../../../base/common/async.js';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableResourceMap, DisposableStore, IDisposable, MutableDisposable } from '../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../base/common/map.js';
import { getExtensionForMimeType, getMediaMime } from '../../../base/common/mime.js';
import { Schemas } from '../../../base/common/network.js';
import { observableValue } from '../../../base/common/observable.js';
import { extname as resourcesExtname, isEqual, isEqualOrParent, joinPath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { localize } from '../../../nls.js';
import { FileChangeType, FileOperationError, FileOperationResult, FileSystemProviderErrorCode, IFileChange, IFileService, toFileOperationResult, toFileSystemProviderErrorCode, type FileChangesEvent } from '../../files/common/files.js';
import { InstantiationService } from '../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../instantiation/common/serviceCollection.js';
import { ILogService } from '../../log/common/log.js';
import { AgentProvider, AgentSession, AgentSignal, AgentHostSessionReleaseGraceMsEnvVar, IAgent, IAgentChatDataChange, IAgentCreateChatOptions, IAgentCreateChatResult, IAgentCreateSessionConfig, IAgentCreateSessionResult, IAgentHostAuthTokenRequest, IAgentMaterializeSessionEvent, IAgentModelInfo, IAgentResolveSessionConfigParams, IAgentService, IAgentSessionConfigCompletionsParams, IAgentSessionMetadata, IAgentSpawnChatEvent, AuthenticateParams, AuthenticateResult, IMcpNotification, IRestoredSubagentSession, SubagentChatSignal } from '../common/agentService.js';
import { ISessionDataService, SESSION_ATTACHMENTS_DIRNAME } from '../common/sessionDataService.js';
import { parseChangesetUri } from '../common/changesetUri.js';
import { ActionType, ActionEnvelope, AuthRequiredReason, INotification, type ChatAction, type IRootConfigChangedAction, type SessionAction, type TerminalAction, type ClientAnnotationsAction, type ClientChangesetAction } from '../common/state/sessionActions.js';
import type { CompletionsParams, CompletionsResult, CreateTerminalParams, ResolveSessionConfigResult, SessionConfigCompletionsResult } from '../common/state/protocol/commands.js';
import type { InvokeChangesetOperationParams, InvokeChangesetOperationResult } from '../common/state/protocol/channels-changeset/commands.js';
import { AhpErrorCodes, AHP_SESSION_NOT_FOUND, ContentEncoding, JSON_RPC_INTERNAL_ERROR, ProtocolError, ResourceChangeType, ResourceType, ResourceWriteMode, type CreateResourceWatchParams, type CreateResourceWatchResult, type DirectoryEntry, type ResourceCopyParams, type ResourceCopyResult, type ResourceDeleteParams, type ResourceDeleteResult, type ResourceListResult, type ResourceMkdirParams, type ResourceMkdirResult, type ResourceMoveParams, type ResourceMoveResult, type ResourceReadResult, type ResourceResolveParams, type ResourceResolveResult, type ResourceWatchState, type ResourceWriteParams, type ResourceWriteResult, type IStateSnapshot } from '../common/state/sessionProtocol.js';
import { ChangesSummary, ChatInteractivity, ChatOriginKind, MessageAttachmentKind, type Message, type MessageAttachment, type MessageResourceAttachment } from '../common/state/protocol/state.js';
import type { ChatPendingMessageSetAction, ChatTurnStartedAction } from '../common/state/protocol/actions.js';
import { ISessionGitHubState, ISessionGitState, MessageKind, ResponsePartKind, SESSION_META_GITHUB_KEY, SESSION_META_GIT_KEY, readSessionSpawnDepth, withSessionSpawnDepth, SessionStatus, ToolCallStatus, ToolResultContentType, AH_META_WORKSPACELESS_DB_KEY, AH_META_IS_ARCHIVED_DB_KEY, AH_META_IS_DONE_DB_KEY, buildChatUri, buildDefaultChatUri, buildResourceWatchChannelUri, buildSubagentChatUri, buildSubagentSessionUriPrefix, hostBuildInfoFromProduct, isAhpChatChannel, isSubagentSession, parseDefaultChatUri, parseRequiredSessionUriFromChatUri, parseResourceWatchChannelUri, parseSubagentSessionUri, readSessionGitState, readSessionWorkspaceless, withSessionGitHubState, withSessionGitState, withSessionWorkspaceless, type SessionConfigState, type SessionSummary, type ToolResultSubagentContent, type Turn } from '../common/state/sessionState.js';
import { IProductService } from '../../product/common/productService.js';
import { AgentConfigurationService, IAgentConfigurationService } from './agentConfigurationService.js';
import { AgentHostTerminalManager, IAgentHostTerminalManager } from './agentHostTerminalManager.js';
import { ISessionDbUriFields, parseSessionDbUri } from './shared/fileEditTracker.js';
import { IGitBlobUriFields, parseGitBlobUri } from './gitDiffContent.js';
import { AgentHostStateManager } from './agentHostStateManager.js';
import { IAgentHostGitService } from '../common/agentHostGitService.js';
import { AgentSideEffects } from './agentSideEffects.js';
import { AgentHostLocalTurns } from './agentHostLocalTurns.js';
import { AgentServerToolHost } from './shared/agentServerToolHost.js';
import { buildServerToolGroups } from './shared/serverToolGroups.js';
import { type IChatContextSnapshot, type ISessionServerToolAccessor } from './shared/sessionServerTools.js';
import { AgentHostChangesetService } from './agentHostChangesetService.js';
import { AgentHostFileMonitorService, IAgentHostFileMonitorService } from './agentHostFileMonitorService.js';
import { IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE } from '../common/agentHostCheckpointService.js';
import { IAgentHostReviewService } from '../common/agentHostReviewService.js';
import { AgentHostChangesetCoordinator } from './agentHostChangesetCoordinator.js';
import { AgentHostCompletions, IAgentHostCompletions } from './agentHostCompletions.js';
import { AgentHostFileCompletionProvider } from './agentHostFileCompletionProvider.js';
import { AgentHostRenameCompletionProvider } from './agentHostRenameCommand.js';
import { AgentHostSkillCompletionProvider } from './agentHostSkillCompletionProvider.js';
import { AgentHostWorkspaceFiles } from './agentHostWorkspaceFiles.js';
import { CopilotApiService, ICopilotApiService } from './shared/copilotApiService.js';
import { parseMcpChannelUri } from './shared/mcpCustomizationController.js';
import { toAgentClientUri } from '../common/agentClientUri.js';
import { AgentHostChangesetOperationService } from './agentHostChangesetOperationService.js';
import { AgentHostGitStateService } from './agentHostGitStateService.js';
import { AgentHostGitHubEndpointService, IAgentHostGitHubEndpointService } from './agentHostGitHubEndpointService.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../telemetry/common/telemetryUtils.js';
import { AgentHostAuthenticationService } from './agentHostAuthenticationService.js';
import { updateAgentHostTelemetryLevelFromConfig } from './agentHostTelemetryService.js';
import { AgentHostOctoKitService, IAgentHostOctoKitService } from './shared/agentHostOctoKitService.js';
import { IAgentHostChangesetService, CHANGESET_DB_METADATA_KEYS, META_CHANGES_SUMMARY } from '../common/agentHostChangesetService.js';
import { IAgentHostChangesetSubscriptionService } from '../common/agentHostChangesetSubscriptionService.js';
import { AgentHostChangesetSubscriptionService } from './agentHostChangesetSubscriptionService.js';
import { GIT_DB_METADATA_KEYS, IAgentHostGitStateService, META_GIT_STATE, META_GITHUB_STATE } from '../common/agentHostGitStateService.js';
import { IAgentHostChangesetOperationService } from '../common/agentHostChangesetOperationService.js';
import { AgentHostCommitOperationContribution } from './agentHostCommitOperationProvider.js';
import { AgentHostDiscardChangesOperationContribution } from './agentHostDiscardChangesOperationProvider.js';
import { AgentHostPullRequestOperationContribution } from './agentHostPullRequestOperationProvider.js';
import { AgentHostSyncOperationContribution } from './agentHostSyncOperationProvider.js';
import { AgentHostReviewService } from './agentHostReviewService.js';

/**
 * Grace period before an empty, unsubscribed session is garbage-collected
 * via {@link AgentService._runSessionGc}. Gives a disconnected client time
 * to reconnect (or a workspace switch to settle) before we tear down the
 * provider-side session, worktree, and on-disk state.
 */
const SESSION_GC_GRACE_MS = 30_000;
/**
 * Grace period before an idle resource watch is torn down after its last
 * subscriber unsubscribes (mirrors {@link SESSION_GC_GRACE_MS}). Within
 * this window, a re-subscribe (or reconnect) reuses the still-running
 * {@link IFileService} watcher so transient drop-outs don't miss change
 * events. Resource watch action envelopes flow through the normal
 * envelope replay buffer for the same reason.
 */
const RESOURCE_WATCH_GRACE_MS = 30_000;

/**
 * Grace period before an idle session (one with turns, no remaining
 * subscribers) is released from memory via {@link AgentService._maybeEvictIdleSession}.
 * Deferring the release aligns it with the client disconnect-grace window: a
 * client that disconnects and quickly reconnects (or a rapid unsubscribe/
 * re-subscribe) reuses the live provider SDK session instead of forcing an
 * immediate {@link IAgent.releaseSession} (SDK `disconnect`) followed by a
 * resume-from-disk. Releasing synchronously on every last-unsubscribe churns
 * the shared provider runtime and races concurrent session operations.
 *
 * Overridable via {@link AgentHostSessionReleaseGraceMsEnvVar} (test hook).
 */
const SESSION_RELEASE_GRACE_MS = (() => {
	const raw = process.env[AgentHostSessionReleaseGraceMsEnvVar];
	const parsed = raw !== undefined ? parseInt(raw, 10) : NaN;
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : 30_000;
})();

/**
 * Session-database metadata key under which the orchestrator persists its own
 * catalog of additional (non-default) peer chats for a session. The value is a
 * JSON array of {@link IPersistedPeerChat}. This is the orchestrator's single
 * source of truth for peer-chat enumeration on restore. When the key is absent
 * the session predates orchestrator-owned persistence and a one-time migration
 * drains the agent's legacy `*.chats` (see
 * {@link AgentService._migrateLegacyPeerChats}).
 */
const PEER_CHATS_METADATA_KEY = 'peerChats';

/**
 * Session-database metadata key written on a peer chat's *backing* SDK session
 * (see {@link IAgentCreateChatResult.backingSession}). Its presence marks that
 * session as an internal peer-chat backing that must never surface as a
 * top-level session; the value is the owning peer chat's channel URI string.
 * Persisted, so it survives a host restart without re-stamping.
 */
const PEER_CHAT_BACKING_METADATA_KEY = 'peerChatBacking';

/**
 * A single entry in the orchestrator's persisted peer-chat catalog. `uri` is
 * the peer chat's channel URI; `providerData` is the opaque, agent-owned blob
 * (see {@link IAgentCreateChatResult.providerData}) handed back to the agent on
 * restore — the orchestrator never parses it. `providerData` may be omitted,
 * in which case the agent recovers its backing from its own persistence on
 * {@link IAgent.materializeChat}.
 */
interface IPersistedPeerChat {
	readonly uri: string;
	readonly providerData?: string;
}


/**
 * The agent service implementation that runs inside the agent-host utility
 * process. Dispatches to registered {@link IAgent} instances based
 * on the provider identifier in the session configuration.
 */
export class AgentService extends Disposable implements IAgentService {
	declare readonly _serviceBrand: undefined;

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

	/** Exposes the state manager for co-hosting a WebSocket protocol server. */
	get stateManager(): AgentHostStateManager { return this._stateManager; }

	/** Exposes the configuration service so agent providers can share root config plumbing. */
	get configurationService(): IAgentConfigurationService { return this._configurationService; }

	/** Exposes the GitHub endpoint service so agent providers share GitHub (Enterprise) resource resolution. */
	get gitHubEndpointService(): IAgentHostGitHubEndpointService { return this._gitHubEndpointService; }

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
	private readonly _authService: AgentHostAuthenticationService;
	/** Default provider used when no explicit provider is specified. */
	private _defaultProvider: AgentProvider | undefined;
	/** Observable registered agents, drives `root/agentsChanged` via {@link AgentSideEffects}. */
	private readonly _agents = observableValue<readonly IAgent[]>('agents', []);
	/** Shared side-effect handler for action dispatch and session lifecycle. */
	private readonly _sideEffects: AgentSideEffects;
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
	private readonly _configurationService: IAgentConfigurationService;
	/** Single source of truth for GitHub (Enterprise) endpoints and protected resources. */
	private readonly _gitHubEndpointService: IAgentHostGitHubEndpointService;
	/** Pluggable completion item providers (e.g. workspace file completions, agent-specific @-mentions). */
	private readonly _completions: IAgentHostCompletions;
	private _skillCompletionProviderRegistered = false;

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
	private readonly _restoreSessionInFlight = new Map<string, Promise<void>>();
	private readonly _restoreSubagentInFlight = new Map<string, Promise<void>>();

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
		private readonly _checkpointService: IAgentHostCheckpointService = NULL_CHECKPOINT_SERVICE,
		private readonly _rootConfigResource?: URI,
		private readonly _telemetryService: ITelemetryService = NullTelemetryService,
		_fileMonitorService?: IAgentHostFileMonitorService,
		copilotApiService?: ICopilotApiService,
	) {
		super();
		this._logService.info('AgentService initialized');
		this._authService = new AgentHostAuthenticationService(_logService);
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
		this._register(this._stateManager.onDidEmitNotification(e => this._onDidNotification.fire(e)));

		// Build a local instantiation scope so downstream components can
		// consume {@link IAgentConfigurationService} (and later {@link ILogService})
		// via DI rather than being plumbed plain-class references.
		const configurationService: IAgentConfigurationService = this._register(new AgentConfigurationService(this._stateManager, this._logService, this._rootConfigResource));
		this._configurationService = configurationService;
		const fileMonitorService = _fileMonitorService ?? this._register(new AgentHostFileMonitorService(this._fileService, this._logService));
		updateAgentHostTelemetryLevelFromConfig(this._telemetryService, this._stateManager.rootState.config?.values);
		const services = new ServiceCollection(
			[ILogService, this._logService],
			[IAgentService, this],
			[IProductService, this._productService],
			[IAgentConfigurationService, configurationService],
			[IAgentHostFileMonitorService, fileMonitorService],
			[IAgentHostGitService, this._gitService],
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
				resource: this._gitHubEndpointService.getCopilotResource().resource,
				reason: AuthRequiredReason.Required,
			});
		}));
		const agentHostOctoKitService = instantiationService.createInstance(AgentHostOctoKitService, undefined);
		services.set(IAgentHostOctoKitService, agentHostOctoKitService);
		const effectiveCopilotApiService = copilotApiService ?? instantiationService.createInstance(CopilotApiService, undefined);
		services.set(ICopilotApiService, effectiveCopilotApiService);

		this._gitStateService = this._register(instantiationService.createInstance(AgentHostGitStateService, this._stateManager));
		services.set(IAgentHostGitStateService, this._gitStateService);

		// The checkpoint service is constructed in the outer agent-host
		// DI scope and passed via {@link _checkpointService}; register it
		// in the inner service collection so the changeset service /
		// side effects can resolve it via DI.
		services.set(IAgentHostCheckpointService, this._checkpointService);

		// The subscription service manages the lifecycle of changeset subscriptions. The service
		// is also consulted by other services when refreshing changesets and changeset operations.
		this._changesetSubscriptions = instantiationService.createInstance(AgentHostChangesetSubscriptionService);
		services.set(IAgentHostChangesetSubscriptionService, this._changesetSubscriptions);

		// The operation contribution service manages the lifecycle of changeset operations.
		this._changesetOperationService = this._register(instantiationService.createInstance(AgentHostChangesetOperationService, this._stateManager));
		services.set(IAgentHostChangesetOperationService, this._changesetOperationService);

		// The changes review service is responsible for managing review/unreview state for changeset changes.
		this._reviewService = this._register(instantiationService.createInstance(AgentHostReviewService, this._stateManager));
		services.set(IAgentHostReviewService, this._reviewService);

		// The changeset service is responsible for computing, publishing, and persisting changesets.
		this._changesets = this._register(instantiationService.createInstance(AgentHostChangesetService, this._stateManager));
		services.set(IAgentHostChangesetService, this._changesets);

		// The coordinator owns all AgentService-side orchestration of the changeset feature: lifecycle
		// hooks, listSessions overlay, subscription URI routing, and the deferred-refresh state machine.
		this._changesetCoordinator = this._register(instantiationService.createInstance(AgentHostChangesetCoordinator, this._stateManager));
		this._register(this._stateManager.onDidChangeSessionActiveTurn(e => this._changesetCoordinator.onSessionTurnActiveChanged(e.session, e.active)));

		// Register the changeset operation contributions.
		this._register(this._changesetOperationService.registerContribution(instantiationService.createInstance(AgentHostCommitOperationContribution, this._stateManager)));
		this._register(this._changesetOperationService.registerContribution(instantiationService.createInstance(AgentHostPullRequestOperationContribution, this._stateManager)));
		this._register(this._changesetOperationService.registerContribution(instantiationService.createInstance(AgentHostSyncOperationContribution, this._stateManager)));
		this._register(this._changesetOperationService.registerContribution(instantiationService.createInstance(AgentHostDiscardChangesOperationContribution, this._stateManager)));

		this._completions = this._register(instantiationService.createInstance(AgentHostCompletions));
		// Built-in generic provider: completes files in the session's workspace folder.
		const workspaceFiles = this._register(instantiationService.createInstance(AgentHostWorkspaceFiles));
		this._register(this._completions.registerProvider(
			new AgentHostFileCompletionProvider(this._stateManager, workspaceFiles),
		));
		// Built-in generic provider: offers the `/rename` slash command for any
		// session that already has history. Execution is handled server-side in
		// AgentSideEffects (redirected to a SessionTitleChanged action).
		this._register(this._completions.registerProvider(
			new AgentHostRenameCompletionProvider(
				session => (this._stateManager.getSessionState(session)?.turns.length ?? 0) > 0,
			),
		));

		// Terminal management — the terminal manager listens to the state
		// manager's action stream and dispatches PTY output back through it.
		// Created before AgentSideEffects and registered in the local scope so
		// AgentSideEffects can consume it via DI (for inline `!command`
		// execution).
		this._terminalManager = this._register(instantiationService.createInstance(AgentHostTerminalManager, this._stateManager));
		services.set(IAgentHostTerminalManager, this._terminalManager);

		this._localTurns = new AgentHostLocalTurns(this._sessionDataService, this._logService);

		this._sideEffects = this._register(instantiationService.createInstance(AgentSideEffects, this._stateManager, {
			getAgent: session => this._findProviderForSession(session),
			sessionDataService: this._sessionDataService,
			localTurns: this._localTurns,
			agents: this._agents,
			copilotApiService: effectiveCopilotApiService,
			getGitHubCopilotToken: () => {
				return this.getAuthToken({
					resource: this._gitHubEndpointService.getCopilotResource().resource,
					scopes: this._gitHubEndpointService.getCopilotResource().scopes_supported,
				});
			},
			onTurnComplete: async session => {
				// Refresh the git state for the session.
				const workingDirStr = this._stateManager.getSessionState(session)?.workingDirectory;
				void this._gitStateService.refreshSessionGitState(session, workingDirStr ? URI.parse(workingDirStr) : undefined);

				// Check for a GitHub pull request associated with the session's branch.
				void this._gitStateService.attachSessionGitHubPullRequest(session.toString());
			},
		}));

		// Server-side tools, executed in-process against each session's own
		// state. The set of groups (and their display) is the single source of
		// truth in `serverToolGroups.ts`; the session-management group's runtime
		// dependency (this service) is injected via the accessor.
		this._serverToolHost = new AgentServerToolHost(this._stateManager, buildServerToolGroups(this._createSessionServerToolAccessor()));
	}

	// ---- provider registration ----------------------------------------------

	registerProvider(provider: IAgent): void {
		if (this._providers.has(provider.id)) {
			throw new Error(`Agent provider already registered: ${provider.id}`);
		}
		this._logService.info(`Registering agent provider: ${provider.id}`);
		this._providers.set(provider.id, provider);
		provider.setServerToolHost?.(this._serverToolHost);
		// Deterministic subagent membership ordering: apply a spawned subagent's
		// catalog membership (via the spawn-channel handlers) BEFORE
		// AgentSideEffects — registered next — handles the same signal and starts
		// a turn on the subagent chat, which requires that chat to already exist.
		// Registering this listener ahead of the side-effects listener makes the
		// ordering independent of when the agent registers its own subagent->spawn
		// bridge; addChat/removeChat are idempotent, so the overlap is safe.
		this._providerSubscriptions.add(provider.onDidSessionProgress(signal => this._sequenceSpawnedChat(signal)));
		this._providerSubscriptions.add(this._sideEffects.registerProgressListener(provider));
		if (provider.onDidMaterializeSession) {
			this._providerSubscriptions.add(provider.onDidMaterializeSession(e => this._onDidMaterializeSession(e)));
		}
		if (provider.onMcpNotification) {
			this._providerSubscriptions.add(provider.onMcpNotification(e => this._onMcpNotification.fire(e)));
		}
		if (provider.onDidChangeChatData) {
			this._providerSubscriptions.add(provider.onDidChangeChatData(e => this._onChatDataChanged(e)));
		}
		if (provider.onDidSpawnChat) {
			this._providerSubscriptions.add(provider.onDidSpawnChat(e => this._onChatSpawned(e)));
		}
		this._registerSkillCompletionProvider();
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
		));
		this._register(this._completions.registerProvider(provider));
	}

	// ---- auth ---------------------------------------------------------------

	async authenticate(params: AuthenticateParams): Promise<AuthenticateResult> {
		return this._authService.authenticate(params, this._providers.values());
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
		const sessionUri = AgentSession.uri(route.providerId, route.sessionId);
		return provider.handleMcpRequest(sessionUri, route.serverName, method, params);
	}

	// ---- session management -------------------------------------------------

	/**
	 * Builds the dependency surface the session server-tool group needs, bound
	 * to this service so the group stays decoupled from the concrete host.
	 */
	private _createSessionServerToolAccessor(): ISessionServerToolAccessor {
		return {
			listSessions: () => this.listSessions(),
			createSession: config => this.createSession(config),
			getModels: () => {
				const models: IAgentModelInfo[] = [];
				for (const provider of this._providers.values()) {
					models.push(...provider.models.get());
				}
				return models;
			},
			startPrompt: (session, chat, prompt) => this._startSessionPrompt(session, chat, prompt),
			createChat: (session, chat, options) => this.createChat(session, chat, (options?.title !== undefined || options?.model !== undefined)
				? { ...(options.title !== undefined ? { title: options.title } : {}), ...(options.model !== undefined ? { model: { id: options.model.id } } : {}) }
				: undefined),
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

	/**
	 * Starts the first turn on a freshly-created session by dispatching a
	 * `ChatTurnStarted` and routing it through the same side-effects path a
	 * client-initiated turn takes (which sends the message to the provider).
	 */
	private async _startSessionPrompt(session: URI, chat: URI, prompt: string): Promise<void> {
		const message: Message = { text: prompt, origin: { kind: MessageKind.User } };
		const action = { type: ActionType.ChatTurnStarted, turnId: generateUuid(), message } as const;
		this._stateManager.dispatchServerAction(chat.toString(), action);
		this._sideEffects.handleAction(chat.toString(), action);
	}

	/**
	 * Reads a point-in-time snapshot of a session's chat conversation for the
	 * `get_session_context` server tool. Targets the session's default chat, or a
	 * specific peer chat when `chatId` is provided. Returns `undefined` when no
	 * live conversation state exists (e.g. a cold/unsubscribed session).
	 */
	private _getChatContext(session: URI, chatId?: string): IChatContextSnapshot | undefined {
		const chatState = chatId
			? this._stateManager.getChatState(buildChatUri(session.toString(), chatId))
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

	async listSessions(): Promise<IAgentSessionMetadata[]> {
		this._logService.trace('[AgentService] listSessions called');
		const results = await Promise.all(
			[...this._providers.values()].map(p => p.listSessions())
		);
		const flat = results.flat();

		// Overlay persisted custom titles from per-session databases.
		const overlaid = await Promise.all(flat.map(async (s): Promise<IAgentSessionMetadata | undefined> => {
			try {
				const ref = await this._sessionDataService.tryOpenDatabase(s.session);
				if (!ref) {
					return s;
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
						? { customTitle: true, isRead: true, [AH_META_IS_ARCHIVED_DB_KEY]: true, [AH_META_IS_DONE_DB_KEY]: true, [AH_META_WORKSPACELESS_DB_KEY]: true, [PEER_CHAT_BACKING_METADATA_KEY]: true, ...GIT_DB_METADATA_KEYS, ...changesetKeys }
						: { customTitle: true, isRead: true, [AH_META_IS_ARCHIVED_DB_KEY]: true, [AH_META_IS_DONE_DB_KEY]: true, [AH_META_WORKSPACELESS_DB_KEY]: true, [PEER_CHAT_BACKING_METADATA_KEY]: true, ...GIT_DB_METADATA_KEYS };
					const m = await ref.object.getMetadataObject(metadataKeys);
					// This session is an internal peer-chat backing (e.g. a
					// Claude peer chat's SDK session, enumerated by the agent's
					// own `listSessions`). Drop it so it never leaks as a
					// standalone top-level session — mirrors the subagent filter
					// on the state-manager overlay path below.
					if (m[PEER_CHAT_BACKING_METADATA_KEY]) {
						return undefined;
					}
					let updated = s;
					if (m.customTitle) {
						updated = { ...updated, summary: m.customTitle };
					}
					if (m.isRead !== undefined) {
						updated = { ...updated, isRead: m.isRead === 'true' };
					}
					if (m[AH_META_IS_ARCHIVED_DB_KEY] !== undefined) {
						updated = { ...updated, isArchived: m[AH_META_IS_ARCHIVED_DB_KEY] === 'true' };
					} else if (m[AH_META_IS_DONE_DB_KEY] !== undefined) {
						updated = { ...updated, isArchived: m[AH_META_IS_DONE_DB_KEY] === 'true' };
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

					if (m[AH_META_WORKSPACELESS_DB_KEY] !== undefined) {
						updated = { ...updated, _meta: withSessionWorkspaceless(updated._meta, m[AH_META_WORKSPACELESS_DB_KEY] === 'true') };
					}

					return this._changesetCoordinator.decorateListEntry(updated, m as Record<string, string | undefined>);
				} finally {
					ref.dispose();
				}
			} catch (e) {
				this._logService.warn(`[AgentService] Failed to read session metadata overlay for ${s.session}`, e);
			}
			return s;
		}));
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
				// Overlay the live `_meta` over the DB-derived value. The live
				// `_meta` is the freshest source (e.g. the GitHub state is
				// published here as soon as a PR is created), so a freshly-created
				// session that has not yet persisted its state to its session
				// database still reports it here. Keep the DB value as the base so
				// any keys absent from the live `_meta` are preserved.
				const _meta = liveSummary._meta !== undefined || s._meta !== undefined
					? { ...s._meta, ...liveSummary._meta }
					: undefined;
				return {
					...s,
					summary: liveSummary.title || s.summary,
					status: liveSummary.status,
					activity: liveSummary.activity,
					modifiedTime: Date.parse(liveSummary.modifiedAt),
					project: liveSummary.project
						? { uri: URI.parse(liveSummary.project.uri), displayName: liveSummary.project.displayName }
						: s.project,
					workingDirectory: typeof liveSummary.workingDirectory === 'string'
						? URI.parse(liveSummary.workingDirectory)
						: s.workingDirectory,
					changes: liveSummary.changes ?? s.changes,
					changesets: this._stateManager.getSessionState(s.session.toString())?.changesets ?? s.changesets,
					...(_meta !== undefined ? { _meta } : {}),
				};
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

			additions.push({
				session: URI.parse(summary.resource),
				startTime: Date.parse(summary.createdAt),
				modifiedTime: Date.parse(summary.modifiedAt),
				summary: summary.title,
				status: summary.status,
				activity: summary.activity,
				workingDirectory: typeof summary.workingDirectory === 'string' ? URI.parse(summary.workingDirectory) : undefined,
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

		this._logService.trace(`[AgentService] listSessions returned ${combined.length} sessions (${additions.length} state-manager fallback)`);
		return combined;
	}

	async createSession(config?: IAgentCreateSessionConfig): Promise<URI> {
		const providerId = config?.provider ?? this._defaultProvider;
		const provider = providerId ? this._providers.get(providerId) : undefined;
		if (!provider) {
			throw new Error(`No agent provider registered for: ${providerId ?? '(none)'}`);
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
					fork: { ...config.fork, turnIdMapping, ...(concreteForkTurnId !== undefined ? { turnId: concreteForkTurnId } : {}) },
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

		// Ensure the command auto-approver is ready before any session events
		// can arrive. This makes shell command auto-approval fully synchronous.
		// Safe to run in parallel with createSession since no events flow until
		// sendMessage() is called.
		this._logService.trace(`[AgentService] createSession: initializing auto-approver and creating session...`);
		const [, created] = await Promise.all([
			this._sideEffects.initialize(),
			this._createSession(provider, config),
		]);
		const session = created.session;
		this._logService.trace(`[AgentService] createSession: initialization complete`);

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
		const [sessionConfig, initialCustomizations] = await Promise.all([
			this._resolveCreatedSessionConfig(provider, config),
			provider.getSessionCustomizations
				? provider.getSessionCustomizations(session).catch(err => {
					this._logService.error('[AgentService] createSession: failed to resolve initial customizations', err);
					return undefined;
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
			if (initialCustomizations && initialCustomizations.length > 0) {
				state.customizations = [...initialCustomizations];
			}

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
			if (initialCustomizations && initialCustomizations.length > 0) {
				state.customizations = [...initialCustomizations];
			}

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
			// Provisional sessions defer the `sessionAdded` notification and
			// the `SessionReady` lifecycle transition until the agent fires
			// {@link IAgent.onDidMaterializeSession} (typically on first
			// `sendMessage`). Until then, the state exists in memory so
			// clients can subscribe and stream config / model changes that
			// the agent will pick up at materialization time.
			const summary = this._buildInitialSummary(provider, session, config, created, '');
			const state = this._stateManager.createSession(summary, { emitNotification: !created.provisional });
			state.config = sessionConfig;
			state.activeClients = config?.activeClient ? [config.activeClient] : [];
			if (initialCustomizations && initialCustomizations.length > 0) {
				state.customizations = [...initialCustomizations];
			}
		}
		// Persist initial config values so a subsequent `restoreSession` can
		// re-hydrate them. We persist the full resolved values (not just the
		// user's input) so clients can render them on restore without having
		// to re-resolve. Mid-session changes are persisted by `AgentSideEffects`
		// when handling `SessionConfigChanged`.
		if (sessionConfig?.values && Object.keys(sessionConfig.values).length > 0 && !created.provisional) {
			this._persistConfigValues(session, sessionConfig.values);
		}

		this._changesetCoordinator.onSessionCreated(session.toString());

		if (!created.provisional) {
			// Persist the AH-owned workspace-less marker now that the session DB
			// exists, from the value `_buildInitialSummary` inferred. Provisional
			// sessions defer this to `_onDidMaterializeSession`.
			this._persistWorkspaceless(session, readSessionWorkspaceless(this._stateManager.getSessionSummary(session.toString())?._meta));

			// `SessionReady` transitions the session lifecycle from
			// `Creating` to `Ready`. For provisional sessions we defer
			// this to {@link _onDidMaterializeSession} so subscribers
			// don't see `Ready` until the agent actually has an SDK
			// session, working directory, etc.
			this._stateManager.dispatchServerAction(session.toString(), { type: ActionType.SessionReady });

			// Refresh the git state for the session.
			const workingDirectory = created.workingDirectory ?? config?.workingDirectory;
			void this._gitStateService.refreshSessionGitState(session.toString(), workingDirectory);
		}

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
		if (options?.fork) {
			const sourceKey = options.fork.source.toString();
			const peerState = this._stateManager.getChatState(sourceKey);
			const sourceState = peerState ?? this._stateManager.getDefaultChatState(sourceKey);
			// Canonical chat URI the source's local turns are keyed by: when the
			// source was found as a peer chat it is `sourceKey`; otherwise it was
			// addressed by session URI and its default chat URI is canonical.
			const sourceChatUri = peerState ? sourceKey : buildDefaultChatUri(sourceKey);
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

				// Carry forked host-injected local turns (`/rename`, `!command`)
				// into the new chat so they survive reload and anchor future
				// fork/truncate.
				this._persistForkedLocalTurns(sessionKey, sourceChatUri, chat.toString(), slice, forkedTurns, turnIdMapping);

				const forkedTitlePrefix = localize('agentHost.forkedTitlePrefix', "Forked: ");
				forkedSourceTitle = sourceState?.title || this._stateManager.getSessionState(sessionKey)?.title;
				forkedTitle = forkedSourceTitle
					? (forkedSourceTitle.startsWith(forkedTitlePrefix) ? forkedSourceTitle : `${forkedTitlePrefix}${forkedSourceTitle}`)
					: localize('agentHost.forkedChatFallback', "Forked Chat");
				// The SDK fork boundary must be a concrete (SDK-backed) turn. When
				// the client forked at a host-injected local turn, redirect the
				// agent to the preceding concrete turn (the local turns are still
				// seeded into the new chat's protocol state above).
				const concreteForkTurnId = this._localTurns.resolveConcreteTurnId(sourceChatUri, options.fork.turnId);
				createOptions = { ...options, fork: { ...options.fork, turnIdMapping, ...(concreteForkTurnId !== undefined ? { turnId: concreteForkTurnId } : {}) } };
			}
		}

		// Spin up the backing chat in the harness first, then register
		// the chat in the catalog so a `session/chatAdded` only reaches
		// subscribers once the chat can actually receive messages. The agent
		// returns the opaque `providerData` blob the orchestrator persists for
		// restore (it never parses it); single-chat-only agents return `void`.
		const createResult = await this._createChat(provider, chat, createOptions);
		const providerData = createResult?.providerData;
		this._stateManager.addChat(sessionKey, chat.toString(), {
			...(forkedTitle !== undefined ? { title: forkedTitle } : options?.title !== undefined ? { title: options.title } : {}),
			...(forkedTurns !== undefined ? { turns: forkedTurns } : {}),
			...(providerData !== undefined ? { providerData } : {}),
		});

		// Persist the new peer chat into the orchestrator-owned catalog so it is
		// re-enumerated and re-materialized on the next restore without asking
		// the agent.
		void this._persistPeerChat(session, chat, providerData);

		// When the agent backs this peer chat with its own separately-enumerable
		// SDK session (e.g. Claude), mark that session so it is filtered out of
		// the top-level session list instead of leaking as a standalone session.
		if (createResult?.backingSession) {
			this._markPeerChatBacking(createResult.backingSession, chat);
		}

		// Refine the forked chat's placeholder `Forked: …` title into one
		// derived from the inherited chat. Forks seed pre-existing
		// turns, so the normal first-message/first-turn title generation never
		// fires for them — this is the fork-time equivalent.
		if (forkedTurns && forkedTurns.length > 0 && forkedTitle !== undefined) {
			this._sideEffects.generateForkedTitle(sessionKey, chat.toString(), forkedTurns, forkedTitle, forkedSourceTitle);
		}
	}

	async disposeChat(session: URI, chat: URI): Promise<void> {
		const sessionKey = session.toString();
		const provider = this._findProviderForSession(session);
		this._stateManager.removeChat(sessionKey, chat.toString());
		// Drop the chat from the orchestrator-owned catalog so it isn't
		// re-materialized on the next restore.
		void this._removePersistedPeerChat(session, chat);
		if (provider) {
			await this._disposeChat(provider, chat);
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
		return !!provider.chats;
	}

	private _createSession(provider: IAgent, config: IAgentCreateSessionConfig | undefined): Promise<IAgentCreateSessionResult> {
		return provider.createSession(config);
	}

	private async _disposeSession(provider: IAgent, session: URI): Promise<void> {
		await provider.disposeSession(session);
	}

	/**
	 * Reconstruct the turns for a chat. `chat` is the concrete chat channel URI,
	 * except for legacy restore paths that still address subagent sessions.
	 */
	private _getChatMessages(provider: IAgent, chat: URI): Promise<readonly Turn[]> {
		return provider.chats.getMessages(chat);
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
	private _createChat(provider: IAgent, chat: URI, options: IAgentCreateChatOptions | undefined): Promise<IAgentCreateChatResult | void> {
		const convOptions: IAgentCreateChatOptions | undefined = options && (options.title !== undefined || options.model !== undefined)
			? { ...(options.title !== undefined ? { title: options.title } : {}), ...(options.model !== undefined ? { model: options.model } : {}) }
			: undefined;
		return options?.fork
			? provider.chats.fork(chat, options.fork, convOptions)
			: provider.chats.createChat(chat, convOptions);
	}

	private async _disposeChat(provider: IAgent, chat: URI): Promise<void> {
		await provider.chats.disposeChat(chat);
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

	private _buildInitialSummary(provider: IAgent, session: URI, config: IAgentCreateSessionConfig | undefined, created: { project?: { uri: URI; displayName: string }; workingDirectory?: URI }, title: string): SessionSummary {
		const now = new Date().toISOString();
		return {
			resource: session.toString(),
			provider: provider.id,
			title,
			status: SessionStatus.Idle,
			createdAt: now,
			modifiedAt: now,
			...(created.project ? { project: { uri: created.project.uri.toString(), displayName: created.project.displayName } } : {}),
			workingDirectory: (created.workingDirectory ?? config?.workingDirectory)?.toString(),
			// Workspace-less is inferred at create from an absent input
			// `workingDirectory` (the host assigns a scratch cwd, so it can't be
			// re-inferred later) and tagged on the generic `_meta` bag.
			...(config && !config.fork && !config.workingDirectory ? { _meta: withSessionWorkspaceless(undefined, true) } : {}),
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
	private _onDidMaterializeSession(e: IAgentMaterializeSessionEvent): void {
		const sessionKey = e.session.toString();
		// The session is now materialized — its SDK is resolved (any cold
		// download already finished), so no further progress is expected for it.
		this._clearDownloadProgressInterest(sessionKey);
		const state = this._stateManager.getSessionState(sessionKey);
		if (!state) {
			this._logService.warn(`[AgentService] onDidMaterializeSession for unknown session: ${sessionKey}`);
			return;
		}
		const currentSummary = this._stateManager.getSessionSummary(sessionKey);
		if (!currentSummary) {
			this._logService.warn(`[AgentService] onDidMaterializeSession missing summary for session: ${sessionKey}`);
			return;
		}
		const summary: SessionSummary = {
			...currentSummary,
			...(e.project ? { project: { uri: e.project.uri.toString(), displayName: e.project.displayName } } : {}),
			workingDirectory: e.workingDirectory?.toString() ?? currentSummary.workingDirectory,
			modifiedAt: new Date().toISOString(),
		};
		const configValues = state.config?.values;
		if (configValues && Object.keys(configValues).length > 0) {
			this._persistConfigValues(e.session, configValues);
		}
		// Persist the AH-owned workspace-less marker now that the session has a
		// real on-disk database (deferred from create for provisional sessions).
		this._persistWorkspaceless(e.session, readSessionWorkspaceless(summary._meta));
		// `markSessionPersisted` writes the summary into state and fires
		// the deferred `SessionAdded` notification atomically so subscribers
		// see consistent state through both paths.
		this._stateManager.markSessionPersisted(sessionKey, summary);
		this._stateManager.dispatchServerAction(sessionKey, { type: ActionType.SessionReady });

		// Attach git state for the working directory (if present)
		void this._gitStateService.refreshSessionGitState(e.session.toString(), e.workingDirectory);

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
	 * sessions of the provider are awaiting it. Frames are only emitted while at
	 * least one session has opted in (supplied a
	 * {@link IAgentCreateSessionConfig.progressToken} on `createSession`). A
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
	emitDownloadProgress(packageId: string, displayName: string, receivedBytes: number, totalBytes: number | undefined, terminal: boolean): void {
		const sessions = this._downloadProgressInterest.get(packageId);
		if (!sessions || sessions.size === 0) {
			return;
		}
		// On a terminal frame force `progress === total` so clients treat the
		// operation as complete (covers both the determinate case and the
		// indeterminate one where `totalBytes` was never known, plus failures —
		// the real error surfaces via the session-failure path).
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

	private async _resolveCreatedSessionConfig(provider: IAgent, config: IAgentCreateSessionConfig | undefined): Promise<SessionConfigState | undefined> {
		if (!config?.config && !config?.workingDirectory) {
			return undefined;
		}
		try {
			const resolved = await provider.resolveSessionConfig({
				provider: provider.id,
				workingDirectory: config.workingDirectory,
				config: config.config,
			});
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
		return provider.resolveSessionConfig(params);
	}

	async sessionConfigCompletions(params: IAgentSessionConfigCompletionsParams): Promise<SessionConfigCompletionsResult> {
		const providerId = params.provider ?? this._defaultProvider;
		const provider = providerId ? this._providers.get(providerId) : undefined;
		if (!provider) {
			throw new Error(`No agent provider registered for: ${providerId ?? '(none)'}`);
		}
		return provider.sessionConfigCompletions(params);
	}

	async completions(params: CompletionsParams): Promise<CompletionsResult> {
		return this._completions.completions(params);
	}

	async getCompletionTriggerCharacters(): Promise<readonly string[]> {
		return this._completions.triggerCharacters;
	}

	async disposeSession(session: URI): Promise<void> {
		this._logService.trace(`[AgentService] disposeSession: ${session.toString()}`);
		const provider = this._findProviderForSession(session);
		if (provider) {
			await this._disposeSession(provider, session);
			this._sessionToProvider.delete(session.toString());
			this._clearDownloadProgressInterest(session.toString());
		}
		this._changesetCoordinator.onSessionDisposed(session.toString());
		this._sideEffects.cancelSessionTitleGeneration(session.toString());
		// Remove all subagent sessions for this parent
		this._sideEffects.removeSubagentSessions(session.toString());
		this._stateManager.deleteSession(session.toString());
		// Remove the VS Code per-session data directory (metadata DB + checkpoints) to mirror the SDK-side cleanup
		// performed by the provider above. No-op when the directory does not exist.
		await this._sessionDataService.deleteSessionData(session);
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
		// Register the subscriber up front so a concurrent unsubscribe cannot
		// evict the session state while we are awaiting restore. On any failure
		// path below we must roll the registration back, otherwise the leaked
		// refcount would permanently pin (or block eviction of) the resource.
		// {@link addSubscriber} is the single point that triggers the
		// uncommitted-changeset refresh on the 0→1 transition (covers both
		// the cold-snapshot path here and the handshake fast-path used by
		// {@link ProtocolServerHandler} when state is already cached).
		this.addSubscriber(resource, clientId);
		try {
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
			if (!snapshot) {
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
				const workingDirectory = sessionState.workingDirectory
					? URI.parse(sessionState.workingDirectory)
					: undefined;
				void this._gitStateService.refreshSessionGitState(resourceStr, workingDirectory);
			}

			return snapshot;
		} catch (err) {
			this.unsubscribe(resource, clientId);
			throw err;
		}
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
		this._pendingSessionRelease.set(resource, disposableTimeout(() => {
			this._pendingSessionRelease.deleteAndDispose(resource);
			this._maybeEvictIdleSession(resource);
		}, SESSION_RELEASE_GRACE_MS));
	}

	private _cancelPendingSessionRelease(resource: URI): void {
		this._pendingSessionRelease.deleteAndDispose(resource);
	}

	/**
	 * If `resource` names a session that no client is still subscribed to and
	 * that has produced no turns (and has no active turn), schedule a delayed
	 * {@link _runSessionGc} to fully tear it down — provider session, worktree,
	 * persisted state and all. Sessions with at least one turn are left to the
	 * existing {@link _maybeEvictIdleSession} path which only drops cached
	 * state and lets the session be restored from disk later.
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
	 * subscriber while empty. Re-checks both invariants (still no subscribers,
	 * still empty) before tearing the session down via {@link disposeSession}.
	 * The cached state may already have been evicted by
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
		this._logService.info(`[AgentService] GC: disposing empty unsubscribed session ${key}`);
		await this.disposeSession(resource);
	}

	/**
	 * If `resource` names an idle session and no client is still subscribed to
	 * it (or, for a subagent URI, no sibling subagent under the same parent is
	 * still subscribed), release its in-memory footprint: drop the cached AHP
	 * state from the state manager AND ask the provider to release the session's
	 * SDK resources ({@link IAgent.releaseSession}). Subagent URIs evict the
	 * parent session entry; the parent owns the materialized turn tree that
	 * backs every subagent view. Nothing durable is deleted — the next subscribe
	 * rehydrates the session via {@link restoreSession} and the provider resumes
	 * the SDK session on demand.
	 */
	private _maybeEvictIdleSession(resource: URI): void {
		const key = resource.toString();
		if (this._resourceSubscribers.has(resource)) {
			return;
		}
		// Walk up the subagent ancestry: the SDK session and its turn tree are
		// owned by the root session, so eviction must target the root.
		let evictionTarget = resource;
		{
			let parsed;
			while ((parsed = parseSubagentSessionUri(evictionTarget))) {
				evictionTarget = parsed.parentSession;
			}
		}
		// Don't evict if the root or any of its subagent descendants still has subscribers.
		if (this._resourceSubscribers.has(evictionTarget)) {
			return;
		}
		for (const subscribedUri of this._resourceSubscribers.keys()) {
			if (this._isSubagentDescendantOf(subscribedUri, evictionTarget)) {
				return;
			}
		}
		const evictionTargetKey = evictionTarget.toString();
		// A restore/resume racing this unsubscribe means a client is about to
		// observe the session again; releasing now would tear down state that
		// the in-flight rehydrate is populating.
		if (this._restoreSessionInFlight.has(evictionTargetKey)) {
			return;
		}
		const targetState = this._stateManager.getSessionState(evictionTargetKey);
		if (!targetState || targetState.activeTurn !== undefined) {
			return;
		}
		this._logService.info(`[AgentService] Evicting idle session: ${evictionTargetKey} (triggered by unsubscribe of ${key})`);
		// Also evict any sibling subagent entries cached under the parent: their
		// authoritative state is the parent's turn tree, and dropping the parent
		// would leave them orphaned.
		const subagentPrefix = buildSubagentSessionUriPrefix(evictionTarget);
		for (const cachedKey of this._stateManager.getSessionUrisWithPrefix(subagentPrefix)) {
			this._stateManager.removeSession(cachedKey);
		}
		this._stateManager.removeSession(evictionTargetKey);
		// Release the provider's in-memory SDK session in lockstep with the
		// cached state. Non-destructive: durable data is preserved so the
		// session resumes transparently on the next access. Fire-and-forget —
		// the provider sequences the release internally and re-checks its own
		// invariants (e.g. a turn that started after this call).
		const provider = this._findProviderForSession(evictionTarget);
		provider?.releaseSession?.(evictionTarget).catch(err => {
			this._logService.error(err, `[AgentService] Failed to release idle session ${evictionTargetKey}`);
		});
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
	 * processing requires an asynchronous prelude (e.g. snapshotting
	 * user-message attachments into the session database before the
	 * action is reduced into state). Actions that don't need any
	 * asynchronous prelude bypass the queue entirely as long as no
	 * earlier action from the same client is still pending.
	 *
	 * todo@connor4312: we can drop this when sending a message become a command
	 */
	private readonly _clientDispatchQueues = new Map<string, Promise<void>>();

	dispatchAction(channel: string, action: SessionAction | ChatAction | TerminalAction | ClientChangesetAction | ClientAnnotationsAction | IRootConfigChangedAction, clientId: string, clientSeq: number): void {
		this._logService.trace(`[AgentService] dispatchAction: type=${action.type}, clientId=${clientId}, clientSeq=${clientSeq}`, action);

		// Clients dispatch chat (chat) actions against a chat channel
		// URI. Keep that chat channel for the optimistic state apply and for
		// per-chat routing in side effects, while deriving the owning session
		// URI for all session-scoped work (attachment snapshotting, agent
		// lookup, telemetry, permissions — all keyed by session).
		const chatChannel = isAhpChatChannel(channel) ? channel : undefined;
		const sessionChannel = chatChannel ? parseRequiredSessionUriFromChatUri(chatChannel) : channel;

		const pending = this._clientDispatchQueues.get(clientId);
		if (!pending && !this._needsAsyncRewrite(sessionChannel, action)) {
			this._dispatchActionNow(channel, sessionChannel, action, clientId, clientSeq);
			return;
		}
		const next = (pending ?? Promise.resolve()).then(async () => {
			const rewritten: SessionAction | ChatAction | TerminalAction | ClientChangesetAction | ClientAnnotationsAction | IRootConfigChangedAction = this._needsAsyncRewrite(sessionChannel, action)
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
			this._dispatchActionNow(channel, sessionChannel, rewritten, clientId, clientSeq);
		}).catch(err => {
			this._logService.error(`[AgentService] async dispatchAction failed: ${toErrorMessage(err)}`);
		});

		this._clientDispatchQueues.set(clientId, next.finally(() => {
			if (this._clientDispatchQueues.get(clientId) === next) {
				this._clientDispatchQueues.delete(clientId);
			}
		}));
	}

	private _dispatchActionNow(channel: string, sessionChannel: string, action: SessionAction | ChatAction | TerminalAction | ClientChangesetAction | ClientAnnotationsAction | IRootConfigChangedAction, clientId: string, clientSeq: number): void {
		const origin = { clientId, clientSeq };
		this._stateManager.dispatchClientAction(channel, action, origin);
		if (action.type === ActionType.RootConfigChanged) {
			this._configurationService.persistRootConfig();
		}
		this._sideEffects.handleAction(channel, action, clientId);
	}

	private _needsAsyncRewrite(channel: string, action: SessionAction | ChatAction | TerminalAction | ClientChangesetAction | ClientAnnotationsAction | IRootConfigChangedAction): action is ChatTurnStartedAction | ChatPendingMessageSetAction {
		if (action.type !== ActionType.ChatTurnStarted && action.type !== ActionType.ChatPendingMessageSet) {
			return false;
		}
		const attachmentsRootStr = this._attachmentsRoot(channel).toString();
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

	private _attachmentsRoot(session: string): URI {
		return joinPath(this._sessionDataService.getSessionDataDir(URI.parse(session)), SESSION_ATTACHMENTS_DIRNAME);
	}

	/**
	 * Snapshot inline / client-resident attachment payloads onto disk
	 * under the session's data directory and rewrite the action to
	 * reference them via local `file:` URIs. Keeps potentially large
	 * blobs (e.g. pasted images) out of the in-memory state tree while
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

		// Already in state manager - nothing to do.
		if (this._stateManager.getSessionState(sessionStr)) {
			return;
		}

		const inFlight = this._restoreSessionInFlight.get(sessionStr);
		if (inFlight) {
			return inFlight;
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

	private async _doRestoreSession(session: URI, sessionStr: string): Promise<void> {
		if (this._stateManager.getSessionState(sessionStr)) {
			return;
		}

		const agent = this._findProviderForSession(session);
		if (!agent) {
			throw new ProtocolError(AHP_SESSION_NOT_FOUND, `No agent for session: ${sessionStr}`);
		}

		const meta = await this._getSessionMetadataForRestore(agent, session);
		if (!meta) {
			throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session not found on backend: ${sessionStr}`);
		}

		const defaultChatUri = URI.parse(buildDefaultChatUri(sessionStr));
		let turns: readonly Turn[];
		try {
			turns = await this._getChatMessages(agent, defaultChatUri);
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
							isRead: true,
							[AH_META_IS_ARCHIVED_DB_KEY]: true,
							[AH_META_IS_DONE_DB_KEY]: true,
							configValues: true,
							[AH_META_WORKSPACELESS_DB_KEY]: true,
							...GIT_DB_METADATA_KEYS,
							...CHANGESET_DB_METADATA_KEYS,
						});
						if (m.customTitle) {
							title = m.customTitle;
						}
						if (m.isRead !== undefined) {
							isRead = m.isRead === 'true';
						}
						if (m[AH_META_IS_ARCHIVED_DB_KEY] !== undefined) {
							isArchived = m[AH_META_IS_ARCHIVED_DB_KEY] === 'true';
						} else if (m[AH_META_IS_DONE_DB_KEY] !== undefined) {
							isArchived = m[AH_META_IS_DONE_DB_KEY] === 'true';
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

						if (m[AH_META_WORKSPACELESS_DB_KEY] !== undefined) {
							sessionMetadata = withSessionWorkspaceless(sessionMetadata, m[AH_META_WORKSPACELESS_DB_KEY] === 'true');
						}

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

		const summary: SessionSummary = {
			resource: sessionStr,
			provider: agent.id,
			title,
			status,
			createdAt: new Date(meta.startTime).toISOString(),
			modifiedAt: new Date(meta.modifiedTime).toISOString(),
			...(meta.project ? { project: { uri: meta.project.uri.toString(), displayName: meta.project.displayName } } : {}),
			changes: meta.changes ?? changes,
			workingDirectory: meta.workingDirectory?.toString(),
			_meta: (sessionMetadata || meta._meta) ? { ...(meta._meta ?? {}), ...(sessionMetadata ?? {}) } : undefined,
		};

		const [defaultDraft, defaultChatTitle] = await Promise.all([
			this._getChatDraft(session, defaultChatUri),
			this._readPersistedChatTitle(session, defaultChatUri),
		]);
		const mergedTurns = await this._interleaveLocalTurns(sessionStr, defaultChatUri.toString(), turns);
		this._stateManager.restoreSession(summary, mergedTurns, { draft: defaultDraft, defaultChatTitle });

		const promises: Promise<unknown>[] = [];
		// Eagerly register subagent child sessions discovered in the event log
		// so the client's per-subagent subscriptions resolve from in-memory
		// state (hitting `restoreSubagent skipped existing`) instead of each
		// re-fetching and re-reconstructing the full parent event log. The
		// agent serves these from the same reconstruction it already produced
		// for the parent turns above, so this adds no extra event-log reads.
		promises.push((async () => {
			if (agent.getSubagentSessions) {
				try {
					const children = await agent.getSubagentSessions(session);
					for (const child of children) {
						this._registerRestoredSubagent(child, summary, sessionStr);
					}
				} catch (err) {
					this._logService.warn(`[AgentService] restoreSession failed to eagerly register subagents session=${sessionStr}`, err);
				}
			}
		})());

		// Restore any additional (non-default) peer chats the provider has
		// persisted for this session, seeding each with its own history and
		// persisted title so they reappear after a process restart.
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
		if (meta._meta) {
			this._stateManager.setSessionMeta(sessionStr, meta._meta);
		}

		// Resolve the session config so clients (e.g. the running-session
		// auto-approve picker) can render session-mutable properties for
		// sessions that were not created in the current process lifetime.
		// Overlay any values the user previously selected (persisted via
		// `SessionConfigChanged`) on top of the provider's resolved defaults.
		const [restoredConfig, restoredCustomizations] = await Promise.all([
			this._resolveCreatedSessionConfig(agent, {
				workingDirectory: meta.workingDirectory,
				config: persistedConfigValues,
			}),
			agent.getSessionCustomizations
				? agent.getSessionCustomizations(session).catch(err => {
					this._logService.error('[AgentService] restoreSession: failed to resolve session customizations', err);
					return undefined;
				})
				: Promise.resolve(undefined),
			...promises
		]);
		if (restoredConfig) {
			this._stateManager.setSessionConfig(sessionStr, restoredConfig);
		}
		// Seed restored session customizations into state so the very first
		// snapshot after selecting an existing session contains effective
		// instructions/agents without waiting for a follow-up republish.
		if (restoredCustomizations && restoredCustomizations.length > 0) {
			this._stateManager.setSessionCustomizations(sessionStr, restoredCustomizations);
		}

		this._logService.info(`[AgentService] Restored session ${sessionStr} with ${turns.length} turns`);

		// Refresh the git state for the session.
		void this._gitStateService.refreshSessionGitState(sessionStr, meta.workingDirectory);

		// Check for a GitHub pull request associated with the session's branch.
		void this._gitStateService.attachSessionGitHubPullRequest(sessionStr);
	}

	/**
	 * Restores the additional (non-default) peer chats for a session.
	 *
	 * Enumeration is driven by the orchestrator's OWN persisted catalog (the
	 * {@link PEER_CHATS_METADATA_KEY} blob). For each catalog entry the agent's
	 * in-memory backing is re-attached via
	 * {@link IAgent.materializeChat} (handing back the opaque
	 * `providerData` blob) BEFORE its history is read, then the chat is
	 * re-registered in the state manager with its persisted title and draft so
	 * it reappears after a process restart. Best-effort: a chat whose history
	 * fails to load is restored with no turns rather than dropped.
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
			await this._restorePeerChatsFromCatalog(agent, session, persisted);
			return;
		}
		// No orchestrator catalog yet: one-time migration from legacy `*.chats`.
		await this._migrateLegacyPeerChats(agent, session);
	}

	/**
	 * One-time migration for sessions persisted before the orchestrator owned
	 * the peer-chat catalog: enumerate the agent's legacy `*.chats`
	 * ({@link IAgent.listLegacyChats}), restore them via the same path as the
	 * new catalog, then write the orchestrator {@link PEER_CHATS_METADATA_KEY}
	 * blob so subsequent restores read the new catalog and never consult the
	 * legacy read again. No-op when the agent has no legacy enumeration or none
	 * is persisted.
	 */
	private async _migrateLegacyPeerChats(agent: IAgent, session: URI): Promise<void> {
		const legacy = await agent.listLegacyChats?.(session);
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
		await this._restorePeerChatsFromCatalog(agent, session, entries);
		// Single atomic write: the key is absent before and complete after, so no
		// partial catalog can survive a crash mid-migration (which would make
		// `_readPersistedPeerChatCatalog` return a proper subset and permanently
		// skip re-migration). The callback takes no parameter so `entries` here is
		// the full migrated set, not the (absent) current catalog.
		await this._enqueuePeerChatCatalogWrite(session, () => [...entries]);
	}

	/**
	 * Restores a set of peer chats from an enumerated catalog. Loads each
	 * chat's history in parallel (after re-attaching its backing) but restores
	 * them in catalog order, so the catalog never reorders by which chat's
	 * history/title happened to resolve first.
	 */
	private async _restorePeerChatsFromCatalog(agent: IAgent, session: URI, entries: readonly IPersistedPeerChat[]): Promise<void> {
		const restored = await Promise.all(entries.map(async (entry) => {
			let chatUri: URI;
			try {
				chatUri = URI.parse(entry.uri);
			} catch (err) {
				this._logService.warn(`[AgentService] Skipping malformed persisted peer chat URI '${entry.uri}': ${toErrorMessage(err)}`);
				return undefined;
			}
			// Re-attach the agent's in-memory backing for the chat BEFORE
			// reading its history, so `getSessionMessages` can resolve the
			// chat. Best-effort: a corrupt/unknown blob must not abort
			// the restore — the chat is then surfaced with history but no live
			// backing.
			if (agent.materializeChat) {
				try {
					await agent.materializeChat(chatUri, entry.providerData);
				} catch (err) {
					this._logService.warn(`[AgentService] Failed to materialize peer chat ${entry.uri}: ${toErrorMessage(err)}`);
				}
			}
			let turns: readonly Turn[] = [];
			try {
				turns = await this._getChatMessages(agent, chatUri);
			} catch (err) {
				this._logService.warn(`[AgentService] Failed to load history for peer chat ${chatUri.toString()}: ${toErrorMessage(err)}`);
			}
			const [title, draft] = await Promise.all([
				this._readPersistedChatTitle(session, chatUri),
				this._getChatDraft(session, chatUri),
			]);
			const mergedTurns = await this._interleaveLocalTurns(session.toString(), chatUri.toString(), turns);
			return { chatUri, title, turns: mergedTurns, draft, providerData: entry.providerData };
		}));
		for (const item of restored) {
			if (!item) {
				continue;
			}
			const { chatUri, title, turns, draft, providerData } = item;
			this._stateManager.restoreChat(session.toString(), chatUri.toString(), {
				title,
				turns,
				draft,
				...(providerData !== undefined ? { providerData } : {}),
			});
		}
	}

	/**
	 * Re-persists a peer chat's opaque `providerData` blob when the agent
	 * reports it changed (e.g. per-chat model switch, fork remap). The
	 * orchestrator never parses the blob; it stores whatever it is handed.
	 */
	private _onChatDataChanged(e: IAgentChatDataChange): void {
		const sessionStr = parseDefaultChatUri(e.chat);
		if (sessionStr === undefined) {
			this._logService.warn(`[AgentService] onDidChangeChatData for malformed chat URI: ${e.chat.toString()}`);
			return;
		}
		void this._persistPeerChat(URI.parse(sessionStr), e.chat, e.providerData);
	}

	/**
	 * Deterministic membership sequencer for agent-spawned chats,
	 * driven off {@link IAgent.onDidSessionProgress}: a `subagent_started` adds
	 * the subagent chat to the catalog via the same spawn-channel handler
	 * ({@link _onChatSpawned}) used by {@link IAgent.onDidSpawnChat}.
	 * A completed subagent chat stays live and subscribable, so completion is
	 * not sequenced here; subagent chats are removed only on session teardown.
	 * Registered before {@link AgentSideEffects} so the subagent chat exists
	 * before its turn starts; addChat is idempotent so overlapping with the
	 * agent's own spawn bridge is safe.
	 */
	private _sequenceSpawnedChat(signal: AgentSignal): void {
		const spawn = SubagentChatSignal.toSpawnEvent(signal);
		if (spawn) {
			this._onChatSpawned(spawn);
		}
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
				.map(entry => ({ uri: entry.uri, ...(typeof entry.providerData === 'string' ? { providerData: entry.providerData } : {}) }));
		} catch (err) {
			this._logService.warn(`[AgentService] Failed to read peer-chat catalog for ${session.toString()}: ${toErrorMessage(err)}`);
			return undefined;
		} finally {
			ref.dispose();
		}
	}

	/**
	 * Marks a peer chat's backing SDK session (in that session's own DB) so
	 * {@link listSessions} filters it out of the top-level session list. The
	 * marker is persisted, so it survives a host restart. Best-effort: a failure
	 * only means the backing session may transiently reappear in the list.
	 */
	private _markPeerChatBacking(backingSession: URI, chat: URI): void {
		let ref;
		try {
			ref = this._sessionDataService.openDatabase(backingSession);
		} catch (err) {
			this._logService.warn(`[AgentService] Failed to open backing session database to mark peer-chat backing for ${backingSession.toString()}: ${toErrorMessage(err)}`);
			return;
		}
		ref.object.setMetadata(PEER_CHAT_BACKING_METADATA_KEY, chat.toString()).catch(err => {
			this._logService.warn(`[AgentService] Failed to mark peer-chat backing for ${backingSession.toString()}: ${toErrorMessage(err)}`);
		}).finally(() => {
			ref.dispose();
		});
	}

	/**
	 * Inserts or updates a single peer chat in the orchestrator's persisted
	 * catalog, recording its opaque `providerData` verbatim (or clearing it when
	 * `undefined`). Serialized per session via {@link _enqueuePeerChatCatalogWrite}.
	 */
	private _persistPeerChat(session: URI, chat: URI, providerData: string | undefined): Promise<void> {
		const chatUri = chat.toString();
		return this._enqueuePeerChatCatalogWrite(session, entries => {
			const next = entries.filter(entry => entry.uri !== chatUri);
			next.push({ uri: chatUri, ...(providerData !== undefined ? { providerData } : {}) });
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
		this._peerChatCatalogWrites.set(key, next.finally(() => {
			if (this._peerChatCatalogWrites.get(key) === next) {
				this._peerChatCatalogWrites.delete(key);
			}
		}));
		return next;
	}

	private async _applyPeerChatCatalogWrite(session: URI, mutate: (entries: IPersistedPeerChat[]) => IPersistedPeerChat[]): Promise<void> {
		const ref = await this._sessionDataService.tryOpenDatabase?.(session);
		if (!ref) {
			return;
		}
		try {
			let current: IPersistedPeerChat[] = [];
			try {
				const raw = await ref.object.getMetadata(PEER_CHATS_METADATA_KEY);
				if (raw !== undefined) {
					const parsed = JSON.parse(raw);
					if (Array.isArray(parsed)) {
						current = parsed.filter((entry): entry is IPersistedPeerChat => typeof entry?.uri === 'string');
					}
				}
			} catch (err) {
				this._logService.warn(`[AgentService] Replacing malformed peer-chat catalog for ${session.toString()}: ${toErrorMessage(err)}`);
			}
			const updated = mutate(current);
			await ref.object.setMetadata(PEER_CHATS_METADATA_KEY, JSON.stringify(updated));
		} catch (err) {
			this._logService.warn(`[AgentService] Failed to persist peer-chat catalog for ${session.toString()}: ${toErrorMessage(err)}`);
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

	private async _getSessionMetadataForRestore(agent: IAgent, session: URI): Promise<IAgentSessionMetadata | undefined> {
		const sessionStr = session.toString();
		if (agent.getSessionMetadata) {
			try {
				return await agent.getSessionMetadata(session);
			} catch (err) {
				if (err instanceof ProtocolError) {
					throw err;
				}
				try {
					return await this._getSessionMetadataFromCatalog(agent, session);
				} catch (fallbackErr) {
					if (fallbackErr instanceof ProtocolError) {
						const message = err instanceof Error ? err.message : String(err);
						throw new ProtocolError(fallbackErr.code, `Failed to get session metadata for ${sessionStr}: ${message}; ${fallbackErr.message}`, fallbackErr.data);
					}
					throw fallbackErr;
				}
			}
		}

		// Older providers only expose catalog enumeration. Keep the fallback so
		// restore remains compatible, but providers with a direct lookup avoid
		// blocking session open on a full catalog refresh.
		return this._getSessionMetadataFromCatalog(agent, session);
	}

	private async _getSessionMetadataFromCatalog(agent: IAgent, session: URI): Promise<IAgentSessionMetadata | undefined> {
		const sessionStr = session.toString();
		let allSessions;
		try {
			allSessions = await agent.listSessions();
		} catch (err) {
			if (err instanceof ProtocolError) {
				throw err;
			}
			const message = err instanceof Error ? err.message : String(err);
			throw new ProtocolError(JSON_RPC_INTERNAL_ERROR, `Failed to list sessions for ${sessionStr}: ${message}`);
		}
		return allSessions.find(s => s.session.toString() === sessionStr);
	}

	async resourceRead(uri: URI): Promise<ResourceReadResult> {
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
				data: content.value.toString(),
				encoding: ContentEncoding.Utf8,
				contentType: 'text/plain',
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

	async resourceWrite(params: ResourceWriteParams): Promise<ResourceWriteResult> {
		const fileUri = typeof params.uri === 'string' ? URI.parse(params.uri) : URI.revive(params.uri);
		let content: VSBuffer;
		if (params.encoding === ContentEncoding.Base64) {
			content = decodeBase64(params.data);
		} else {
			content = VSBuffer.fromString(params.data);
		}
		const mode = params.mode ?? ResourceWriteMode.Truncate;
		const position = params.position ?? 0;
		try {
			if (params.ifMatch !== undefined || mode !== ResourceWriteMode.Truncate || position !== 0) {
				await this._resourceWriteWithMode(fileUri, content, mode, position, params);
			} else if (params.createOnly) {
				await this._fileService.createFile(fileUri, content, { overwrite: false });
			} else {
				await this._fileService.writeFile(fileUri, content);
			}
			return {};
		} catch (e) {
			if (e instanceof ProtocolError) {
				throw e;
			}
			if (e instanceof FileOperationError && e.fileOperationResult === FileOperationResult.FILE_MODIFIED_SINCE) {
				throw new ProtocolError(AhpErrorCodes.Conflict, `ifMatch precondition failed for: ${fileUri.toString()}`);
			}
			const code = toFileSystemProviderErrorCode(e as Error);
			if (code === FileSystemProviderErrorCode.FileExists) {
				throw new ProtocolError(AhpErrorCodes.AlreadyExists, `File already exists: ${fileUri.toString()}`);
			}
			if (code === FileSystemProviderErrorCode.NoPermissions) {
				throw new ProtocolError(AhpErrorCodes.PermissionDenied, `Permission denied: ${fileUri.toString()}`);
			}
			throw new ProtocolError(AhpErrorCodes.NotFound, `Failed to write file: ${fileUri.toString()}`);
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
		try {
			const file = await this._fileService.readFile(fileUri);
			existing = file.value;
			currentEtag = file.etag;
		} catch (e) {
			const code = toFileSystemProviderErrorCode(e as Error);
			if (code !== FileSystemProviderErrorCode.FileNotFound) {
				throw e;
			}
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
		await this._fileService.writeFile(fileUri, next, { etag: currentEtag });
	}

	async resourceCopy(params: ResourceCopyParams): Promise<ResourceCopyResult> {
		const source = URI.parse(params.source);
		const destination = URI.parse(params.destination);
		try {
			await this._fileService.copy(source, destination, !params.failIfExists);
			return {};
		} catch (e) {
			const code = toFileSystemProviderErrorCode(e as Error);
			if (code === FileSystemProviderErrorCode.FileExists) {
				throw new ProtocolError(AhpErrorCodes.AlreadyExists, `Destination already exists: ${destination.toString()}`);
			}
			if (code === FileSystemProviderErrorCode.NoPermissions) {
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
			const code = toFileSystemProviderErrorCode(e as Error);
			if (code === FileSystemProviderErrorCode.NoPermissions) {
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
			const code = toFileSystemProviderErrorCode(e as Error);
			if (code === FileSystemProviderErrorCode.FileExists) {
				throw new ProtocolError(AhpErrorCodes.AlreadyExists, `Destination already exists: ${destination.toString()}`);
			}
			if (code === FileSystemProviderErrorCode.NoPermissions) {
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
			const code = toFileSystemProviderErrorCode(e as Error);
			if (code === FileSystemProviderErrorCode.NoPermissions) {
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
			const code = toFileSystemProviderErrorCode(e as Error);
			if (code === FileSystemProviderErrorCode.NoPermissions) {
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
			const code = toFileSystemProviderErrorCode(e as Error);
			if (code === FileSystemProviderErrorCode.NoPermissions) {
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
		await Promise.all(promises);
		this._sessionToProvider.clear();
		this._downloadProgressInterest.clear();
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
		const workingDirectory = this._stateManager.getSessionState(fields.sessionUri)?.workingDirectory;
		if (!workingDirectory) {
			throw new ProtocolError(AhpErrorCodes.NotFound, `Session has no working directory for git-blob URI: ${fields.sessionUri}`);
		}
		const blob = await this._gitService.showBlob(URI.parse(workingDirectory), fields.sha, fields.repoRelativePath);
		if (!blob) {
			throw new ProtocolError(AhpErrorCodes.NotFound, `git blob not found: ${fields.sha}:${fields.repoRelativePath}`);
		}
		return {
			data: blob.toString(),
			encoding: ContentEncoding.Utf8,
			contentType: 'text/plain',
		};
	}

	/**
	 * Restores a subagent session from its parent session's event history.
	 * Loads the parent's raw messages, filters for events belonging to
	 * the subagent (by `parentToolCallId`), and builds the child session's
	 * turns from those events.
	 */
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
				childTurns = await this._getChatMessages(agent, URI.parse(subagentUri));
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
		this._logService.info(`[AgentService] Restored subagent session: ${subagentUri} with ${childTurns.length} turn(s)`);
	}

	/**
	 * Registers a subagent child session's state up-front from data the agent
	 * already reconstructed for the parent, so a later subscribe-driven
	 * {@link _restoreSubagentSession} finds it present and returns early
	 * instead of re-reading the parent event log. No-op if already registered.
	 */
	private _registerRestoredSubagent(child: IRestoredSubagentSession, parentSummary: SessionSummary, parentSessionStr: string): void {
		const resourceStr = child.resource.toString();
		if (this._stateManager.getSessionState(resourceStr)) {
			return;
		}
		const registeredNow = new Date().toISOString();
		this._stateManager.restoreSession(
			{
				resource: resourceStr,
				provider: 'subagent',
				title: child.title,
				status: SessionStatus.Idle,
				createdAt: registeredNow,
				modifiedAt: registeredNow,
				...(parentSummary.project ? { project: parentSummary.project } : {}),
			},
			[...child.turns],
		);

		// Mirror the live `_handleSubagentStarted` flow on restore: surface the
		// subagent as a read-only peer chat in the PARENT session's catalog so it
		// reappears as a tab (and the inline "Open Agent" link can reveal it)
		// after a restart. Uses the same `ahp-chat://subagent/...` chat URI form
		// as the live path so the sessions provider parses and surfaces it.
		const subagentChatUri = buildSubagentChatUri(parentSessionStr, child.toolCallId);
		this._stateManager.addChat(parentSessionStr, subagentChatUri, {
			title: child.title,
			turns: [...child.turns],
			origin: { kind: ChatOriginKind.Tool, chat: buildDefaultChatUri(parentSessionStr), toolCallId: child.toolCallId },
			interactivity: ChatInteractivity.ReadOnly,
		});
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
