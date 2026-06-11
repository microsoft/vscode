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
import { FileChangeType, FileOperationError, FileOperationResult, FileSystemProviderErrorCode, IFileChange, IFileService, toFileSystemProviderErrorCode, type FileChangesEvent } from '../../files/common/files.js';
import { InstantiationService } from '../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../instantiation/common/serviceCollection.js';
import { ILogService } from '../../log/common/log.js';
import { AgentProvider, AgentSession, GITHUB_COPILOT_PROTECTED_RESOURCE, IAgent, IAgentCreateSessionConfig, IAgentHostAuthTokenRequest, IAgentMaterializeSessionEvent, IAgentResolveSessionConfigParams, IAgentService, IAgentSessionConfigCompletionsParams, IAgentSessionMetadata, AuthenticateParams, AuthenticateResult, IMcpNotification } from '../common/agentService.js';
import { ISessionDataService, SESSION_ATTACHMENTS_DIRNAME } from '../common/sessionDataService.js';
import { buildDefaultChangesetCatalogue, parseChangesetUri } from '../common/changesetUri.js';
import { ActionType, ActionEnvelope, INotification, type IRootConfigChangedAction, type SessionAction, type TerminalAction } from '../common/state/sessionActions.js';
import type { CompletionsParams, CompletionsResult, CreateTerminalParams, ResolveSessionConfigResult, SessionConfigCompletionsResult } from '../common/state/protocol/commands.js';
import type { InvokeChangesetOperationParams, InvokeChangesetOperationResult } from '../common/state/protocol/channels-changeset/commands.js';
import { AhpErrorCodes, AHP_SESSION_NOT_FOUND, ContentEncoding, JSON_RPC_INTERNAL_ERROR, ProtocolError, ResourceChangeType, ResourceType, ResourceWriteMode, type CreateResourceWatchParams, type CreateResourceWatchResult, type DirectoryEntry, type ResourceCopyParams, type ResourceCopyResult, type ResourceDeleteParams, type ResourceDeleteResult, type ResourceListResult, type ResourceMkdirParams, type ResourceMkdirResult, type ResourceMoveParams, type ResourceMoveResult, type ResourceReadResult, type ResourceResolveParams, type ResourceResolveResult, type ResourceWatchState, type ResourceWriteParams, type ResourceWriteResult, type IStateSnapshot } from '../common/state/sessionProtocol.js';
import { ChangesSummary, MessageAttachmentKind, type MessageAttachment, type MessageResourceAttachment } from '../common/state/protocol/state.js';
import type { SessionPendingMessageSetAction, SessionTurnStartedAction } from '../common/state/protocol/actions.js';
import { ResponsePartKind, SessionStatus, ToolCallStatus, ToolResultContentType, buildResourceWatchChannelUri, buildSubagentSessionUriPrefix, hostBuildInfoFromProduct, isSubagentSession, parseResourceWatchChannelUri, parseSubagentSessionUri, readSessionGitState, type SessionConfigState, type SessionSummary, type ToolResultSubagentContent, type Turn } from '../common/state/sessionState.js';
import { IProductService } from '../../product/common/productService.js';
import { AgentConfigurationService, IAgentConfigurationService } from './agentConfigurationService.js';
import { AgentHostTerminalManager, type IAgentHostTerminalManager } from './agentHostTerminalManager.js';
import { ISessionDbUriFields, parseSessionDbUri } from './shared/fileEditTracker.js';
import { IGitBlobUriFields, parseGitBlobUri } from './gitDiffContent.js';
import { AgentHostStateManager } from './agentHostStateManager.js';
import { IAgentHostGitService } from './agentHostGitService.js';
import { AgentSideEffects } from './agentSideEffects.js';
import { AgentHostChangesetService, IAgentHostChangesetService, META_CHANGES_SUMMARY } from './agentHostChangesetService.js';
import { AgentHostFileMonitorService, IAgentHostFileMonitorService } from './agentHostFileMonitorService.js';
import { IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE } from '../common/agentHostCheckpointService.js';
import { CHANGESET_DB_METADATA_KEYS, ChangesetSessionCoordinator } from './agentHostChangesetCoordinator.js';
import { AgentHostCompletions, IAgentHostCompletions } from './agentHostCompletions.js';
import { AgentHostFileCompletionProvider } from './agentHostFileCompletionProvider.js';
import { AgentHostRenameCompletionProvider } from './agentHostRenameCommand.js';
import { AgentHostSkillCompletionProvider } from './agentHostSkillCompletionProvider.js';
import { AgentHostWorkspaceFiles } from './agentHostWorkspaceFiles.js';
import { CopilotApiService, ICopilotApiService } from './shared/copilotApiService.js';
import { parseMcpChannelUri } from './shared/mcpCustomizationController.js';
import { toAgentClientUri } from '../common/agentClientUri.js';
import { AgentHostChangesetOperationContributionService } from './agentHostChangesetOperationContributionService.js';
import { registerDefaultChangesetOperationContributions } from './agentHostChangesetOperationContributions.js';
import { AgentHostSessionGitStateService } from './agentHostSessionGitStateService.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../telemetry/common/telemetryUtils.js';
import { AgentHostAuthenticationService } from './agentHostAuthenticationService.js';
import { updateAgentHostTelemetryLevelFromConfig } from './agentHostTelemetryService.js';
import { AgentHostOctoKitService, IAgentHostOctoKitService } from './shared/agentHostOctoKitService.js';

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

	/** Registered providers keyed by their {@link AgentProvider} id. */
	private readonly _providers = new Map<AgentProvider, IAgent>();
	/** Maps each active session URI (toString) to its owning provider. */
	private readonly _sessionToProvider = new Map<string, AgentProvider>();
	/** Subscriptions to provider progress events; cleared when providers change. */
	private readonly _providerSubscriptions = this._register(new DisposableStore());
	private readonly _authService: AgentHostAuthenticationService;
	/** Default provider used when no explicit provider is specified. */
	private _defaultProvider: AgentProvider | undefined;
	/** Observable registered agents, drives `root/agentsChanged` via {@link AgentSideEffects}. */
	private readonly _agents = observableValue<readonly IAgent[]>('agents', []);
	/** Shared side-effect handler for action dispatch and session lifecycle. */
	private readonly _sideEffects: AgentSideEffects;
	/** Owns static / per-turn changeset compute, publish, persist, restore. */
	private readonly _changesets: IAgentHostChangesetService;
	/** Owns AgentService-side orchestration of the changeset feature. */
	private readonly _changesetCoordinator: ChangesetSessionCoordinator;
	/** Owns session git-state probing and git-backed catalogue decoration. */
	private readonly _sessionGitStateService: AgentHostSessionGitStateService;
	/** Owns changeset operation contributions and handler activation. */
	private readonly _changesetOperationContributionService: AgentHostChangesetOperationContributionService;
	/** Manages PTY-backed terminals for the agent host protocol. */
	private readonly _terminalManager: AgentHostTerminalManager;
	private readonly _configurationService: IAgentConfigurationService;
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
		const agentHostOctoKitService = instantiationService.createInstance(AgentHostOctoKitService, undefined);
		services.set(IAgentHostOctoKitService, agentHostOctoKitService);
		const effectiveCopilotApiService = copilotApiService ?? instantiationService.createInstance(CopilotApiService, undefined);
		services.set(ICopilotApiService, effectiveCopilotApiService);
		this._sessionGitStateService = this._register(instantiationService.createInstance(AgentHostSessionGitStateService, this._stateManager));
		this._changesetOperationContributionService = this._register(instantiationService.createInstance(AgentHostChangesetOperationContributionService, this._stateManager, this._sessionGitStateService));

		// The checkpoint service is constructed in the outer agent-host
		// DI scope and passed via {@link _checkpointService}; register it
		// in the inner service collection so the changeset service /
		// side effects can resolve it via DI.
		services.set(IAgentHostCheckpointService, this._checkpointService);

		// The changeset service owns the entire static / per-turn changeset
		// pipeline (compute, publish, persist, restore). Constructed locally
		// rather than via `registerSingleton` to match the construction
		// model of the rest of the agent-host node services
		// (`AgentHostStateManager` is similarly owned by `AgentService`).
		// `AgentHostStateManager` is passed as a plain ctor argument because
		// it has no decorator today; the git / log / session-data services
		// are DI-injected. Registered in the local collection BEFORE
		// `AgentSideEffects` is constructed so its `@IAgentHostChangesetService`
		// constructor injection resolves naturally.
		this._changesets = this._register(instantiationService.createInstance(AgentHostChangesetService, this._stateManager));
		services.set(IAgentHostChangesetService, this._changesets);
		this._register(registerDefaultChangesetOperationContributions(this._changesetOperationContributionService, instantiationService, this._stateManager));

		// The coordinator owns all AgentService-side orchestration of the
		// changeset feature: lifecycle hooks, listSessions overlay,
		// subscription URI routing, and the deferred-refresh state machine.
		this._changesetCoordinator = this._register(instantiationService.createInstance(ChangesetSessionCoordinator, this._stateManager));
		this._register(this._stateManager.onDidChangeSessionActiveTurn(e => this._changesetCoordinator.onSessionTurnActiveChanged(e.session, e.active)));

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

		this._sideEffects = this._register(instantiationService.createInstance(AgentSideEffects, this._stateManager, {
			getAgent: session => this._findProviderForSession(session),
			sessionDataService: this._sessionDataService,
			agents: this._agents,
			copilotApiService: effectiveCopilotApiService,
			getGitHubCopilotToken: () => {
				return this.getAuthToken({
					resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource,
					scopes: GITHUB_COPILOT_PROTECTED_RESOURCE.scopes_supported,
				});
			},
			onTurnComplete: session => {
				const workingDirStr = this._stateManager.getSessionState(session)?.summary.workingDirectory;
				this._attachGitState(URI.parse(session), workingDirStr ? URI.parse(workingDirStr) : undefined);
			},
		}));

		// Terminal management — the terminal manager listens to the state
		// manager's action stream and dispatches PTY output back through it.
		this._terminalManager = this._register(instantiationService.createInstance(AgentHostTerminalManager, this._stateManager));
	}

	// ---- provider registration ----------------------------------------------

	registerProvider(provider: IAgent): void {
		if (this._providers.has(provider.id)) {
			throw new Error(`Agent provider already registered: ${provider.id}`);
		}
		this._logService.info(`Registering agent provider: ${provider.id}`);
		this._providers.set(provider.id, provider);
		this._providerSubscriptions.add(this._sideEffects.registerProgressListener(provider));
		if (provider.onDidMaterializeSession) {
			this._providerSubscriptions.add(provider.onDidMaterializeSession(e => this._onDidMaterializeSession(e)));
		}
		if (provider.onMcpNotification) {
			this._providerSubscriptions.add(provider.onMcpNotification(e => this._onMcpNotification.fire(e)));
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
		return this._changesetOperationContributionService.invokeChangesetOperation(params);
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

	async listSessions(): Promise<IAgentSessionMetadata[]> {
		this._logService.trace('[AgentService] listSessions called');
		const results = await Promise.all(
			[...this._providers.values()].map(p => p.listSessions())
		);
		const flat = results.flat();

		// Overlay persisted custom titles from per-session databases.
		const result = await Promise.all(flat.map(async s => {
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
						? { customTitle: true, isRead: true, isArchived: true, isDone: true, ...changesetKeys }
						: { customTitle: true, isRead: true, isArchived: true, isDone: true };
					const m = await ref.object.getMetadataObject(metadataKeys);
					let updated = s;
					if (m.customTitle) {
						updated = { ...updated, summary: m.customTitle };
					}
					if (m.isRead !== undefined) {
						updated = { ...updated, isRead: m.isRead === 'true' };
					}
					if (m.isArchived !== undefined) {
						updated = { ...updated, isArchived: m.isArchived === 'true' };
					} else if (m.isDone !== undefined) {
						updated = { ...updated, isArchived: m.isDone === 'true' };
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

		// Overlay live session state from the state manager.
		// For the title, prefer the state manager's value when it is
		// non-empty, so SDK-sourced titles are not overwritten by the
		// initial empty placeholder. The default changeset catalogue lives
		// on `state.changesets` (seeded after `createSession` /
		// `restoreSession` and refreshed after each compute pass) and the
		// chip aggregate on `state.summary.changes`; both must be surfaced
		// here so a fresh `listSessions` call returns the same values
		// subscribers see via the per-session action stream and
		// `notify/sessionSummaryChanged`.
		const withStatus = result.map(s => {
			const liveState = this._stateManager.getSessionState(s.session.toString());
			if (liveState) {
				return {
					...s,
					summary: liveState.summary.title || s.summary,
					status: liveState.summary.status,
					activity: liveState.summary.activity,
					model: liveState.summary.model ?? s.model,
					agent: liveState.summary.agent ?? s.agent,
					changes: liveState.summary.changes ?? s.changes,
					changesets: liveState.changesets ?? s.changesets,
				};
			}
			return s;
		});

		// Overlay any session known to state but missing from the providers'
		// `listSessions` snapshot, so renderer-side caches don't evict a
		// live/active session (which would close the chat view holding the
		// in-flight response bubble). Two cases need this: a provider can
		// transiently drop a session (e.g. `CopilotAgent.listSessions` returns
		// an empty array right after `session/turnComplete`), and a
		// provisional session (created but not yet materialized — see
		// `createSession`) is absent for its entire provisional window. We use
		// *all* tracked summaries (not just announced ones) to cover the latter.
		const known = new Set(withStatus.map(s => s.session.toString()));
		const additions: IAgentSessionMetadata[] = [];
		for (const summary of this._stateManager.getAllSessionSummaries()) {
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
				startTime: summary.createdAt,
				modifiedTime: summary.modifiedAt,
				summary: summary.title,
				status: summary.status,
				activity: summary.activity,
				model: summary.model,
				agent: summary.agent,
				workingDirectory: typeof summary.workingDirectory === 'string' ? URI.parse(summary.workingDirectory) : undefined,
				...(summary.project ? { project: { uri: URI.parse(summary.project.uri), displayName: summary.project.displayName } } : {}),
				changes: summary.changes,
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
				config = {
					...config,
					fork: { ...config.fork, turnIdMapping },
				};
			}
		}

		// Ensure the command auto-approver is ready before any session events
		// can arrive. This makes shell command auto-approval fully synchronous.
		// Safe to run in parallel with createSession since no events flow until
		// sendMessage() is called.
		this._logService.trace(`[AgentService] createSession: initializing auto-approver and creating session...`);
		const [, created] = await Promise.all([
			this._sideEffects.initialize(),
			provider.createSession(config),
		]);
		const session = created.session;
		this._logService.trace(`[AgentService] createSession: initialization complete`);

		// Cancel any pending GC armed for this URI. A client may be
		// re-issuing `createSession` for an existing URI mid-grace (e.g.
		// during a reconnect that returned `missing`); without this, the
		// timer would still fire and dispose the just-revived session
		// before the follow-up `subscribe` arrives.
		this._cancelPendingSessionGc(session);

		this._logService.trace(`[AgentService] createSession: provider=${provider.id} model=${config?.model?.id ?? '(default)'}`);
		this._sessionToProvider.set(session.toString(), provider.id);
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
			let sourceTurns: Turn[] = [];
			if (sourceState && config.fork.turnIdMapping) {
				sourceTurns = sourceState.turns.slice(0, config.fork.turnIndex + 1)
					.map(t => ({ ...t, id: config!.fork!.turnIdMapping!.get(t.id) ?? generateUuid() }));
			}

			// Prefix the forked session's title so consumers (sidebar, chat
			// model) can distinguish it from the source without each surface
			// reinventing the convention. Avoid double-prefixing when a user
			// forks an already-forked session.
			const forkedTitlePrefix = localize('agentHost.forkedTitlePrefix', "Forked: ");
			const sourceTitle = sourceState?.summary.title;
			const forkedTitle = sourceTitle
				? (sourceTitle.startsWith(forkedTitlePrefix) ? sourceTitle : `${forkedTitlePrefix}${sourceTitle}`)
				: localize('agentHost.forkedSessionFallback', "Forked Session");
			const summary = this._buildInitialSummary(provider, session, config, created, forkedTitle);
			const state = this._stateManager.createSession(summary);
			state.config = sessionConfig;
			state.turns = sourceTurns;
			state.activeClient = config.activeClient;
			if (initialCustomizations && initialCustomizations.length > 0) {
				state.customizations = [...initialCustomizations];
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
			state.activeClient = config?.activeClient;
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

		// Initial changeset state is established as part of session creation,
		// never deferred to materialization. Two halves: (1) the catalogue
		// is seeded on `state.changesets` via `setSessionChangesets` right
		// after `createSession`; (2) the backing per-changeset states are
		// registered by `_changesetCoordinator.onSessionCreated` here. Both
		// run before `SessionReady` is dispatched. Any future change must
		// keep both halves at create time so client subscriptions resolve
		// `_attachGitState` strips them once the git probe confirms the
		// resolved working directory is not a git repo. Pinned by item-2
		// regression tests in `agentService.test.ts`.
		const changesets = buildDefaultChangesetCatalogue(session.toString());
		this._stateManager.setSessionChangesets(session.toString(), changesets);

		this._changesetCoordinator.onSessionCreated(session.toString());

		if (!created.provisional) {
			// `SessionReady` transitions the session lifecycle from
			// `Creating` to `Ready`. For provisional sessions we defer
			// this to {@link _onDidMaterializeSession} so subscribers
			// don't see `Ready` until the agent actually has an SDK
			// session, working directory, etc.
			this._stateManager.dispatchServerAction(session.toString(), { type: ActionType.SessionReady });

			// Lazily compute git state for sessions with a working directory;
			// attaches under `state._meta.git` once ready.
			this._attachGitState(session, created.workingDirectory ?? config?.workingDirectory);
		}

		return session;
	}

	/**
	 * Builds the {@link SessionSummary} we seed into the state manager when a
	 * new session is created. The fork and non-fork paths only differ in
	 * `title`; everything else is identical.
	 */
	private _buildInitialSummary(provider: IAgent, session: URI, config: IAgentCreateSessionConfig | undefined, created: { project?: { uri: URI; displayName: string }; workingDirectory?: URI }, title: string): SessionSummary {
		const now = Date.now();
		return {
			resource: session.toString(),
			provider: provider.id,
			title,
			status: SessionStatus.Idle,
			createdAt: now,
			modifiedAt: now,
			...(created.project ? { project: { uri: created.project.uri.toString(), displayName: created.project.displayName } } : {}),
			model: config?.model,
			agent: config?.agent,
			workingDirectory: (created.workingDirectory ?? config?.workingDirectory)?.toString(),
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
		const state = this._stateManager.getSessionState(sessionKey);
		if (!state) {
			this._logService.warn(`[AgentService] onDidMaterializeSession for unknown session: ${sessionKey}`);
			return;
		}
		const summary: SessionSummary = {
			...state.summary,
			...(e.project ? { project: { uri: e.project.uri.toString(), displayName: e.project.displayName } } : {}),
			workingDirectory: e.workingDirectory?.toString() ?? state.summary.workingDirectory,
			modifiedAt: Date.now(),
		};
		const configValues = state.config?.values;
		if (configValues && Object.keys(configValues).length > 0) {
			this._persistConfigValues(e.session, configValues);
		}
		// `markSessionPersisted` writes the summary into state and fires
		// the deferred `SessionAdded` notification atomically so subscribers
		// see consistent state through both paths.
		this._stateManager.markSessionPersisted(sessionKey, summary);
		this._stateManager.dispatchServerAction(sessionKey, { type: ActionType.SessionReady });

		// Attach git state for the working directory (if present)
		this._attachGitState(e.session, e.workingDirectory);

		// Initialize the session's changesets from the catalogue
		const changesets = buildDefaultChangesetCatalogue(sessionKey);
		this._stateManager.setSessionChangesets(sessionKey, changesets);

		// If a client subscribed to this session's uncommitted changeset
		// before the working directory was known, the coordinator drains
		// the deferred refresh now that the working directory is set.
		this._changesetCoordinator.onSessionMaterialized(sessionKey);
	}

	/**
	 * Fire-and-forget probe that resolves the session's git state for its
	 * working directory (if any) and merges it into `state._meta.git` via
	 * the state manager. Failures are logged; sessions simply remain without
	 * git state.
	 *
	 * Also gates the two git-only default catalogue entries
	 * (`Branch Changes`, `Uncommitted Changes`): when the working
	 * directory is resolved AND the git probe confirms it is not a git
	 * repo, those entries are stripped from `summary.changesets`, leaving
	 * only `This Turn`. An absent working directory is treated as
	 * transient (provisional / pre-materialize / pre-restore) — we do NOT
	 * strip in that case because there is no path that re-adds the
	 * entries when a subsequent `onSessionMaterialized` / restore call
	 * resolves the working directory and the probe succeeds. The
	 * entries' counts remain unset until a real compute lands, so chip
	 * rendering naturally skips them in the meantime.
	 */
	private _attachGitState(session: URI, workingDirectory: URI | undefined): void {
		const sessionKey = session.toString();
		this._sessionGitStateService.attachGitState(session, workingDirectory).then(
			gitState => {
				if (!gitState) {
					return;
				}
				this._changesetCoordinator.onSessionGitStateChanged(sessionKey);
				this._changesetOperationContributionService.updateOperations(sessionKey, gitState);
			},
			e => {
				this._logService.warn(`[AgentService] Failed to compute git state for ${session}`, e);
			},
		);
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
			await provider.disposeSession(session);
			this._sessionToProvider.delete(session.toString());
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
			if (sessionState && readSessionGitState(sessionState._meta) === undefined) {
				const wd = sessionState.summary?.workingDirectory;
				this._attachGitState(resource, wd ? URI.parse(wd) : undefined);
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
		// any pending GC armed while it had no subscribers.
		this._cancelPendingSessionGc(resource);
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
		this._maybeEvictIdleSession(resource);
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
	 * still subscribed), drop its cached state from the state manager. Subagent
	 * URIs evict the parent session entry; the parent owns the materialized
	 * turn tree that backs every subagent view. The next subscribe will
	 * rehydrate the session via {@link restoreSession}.
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
		const targetState = this._stateManager.getSessionState(evictionTargetKey);
		if (!targetState || targetState.activeTurn !== undefined) {
			return;
		}
		this._logService.trace(`[AgentService] Evicting idle session: ${evictionTargetKey} (triggered by unsubscribe of ${key})`);
		// Also evict any sibling subagent entries cached under the parent: their
		// authoritative state is the parent's turn tree, and dropping the parent
		// would leave them orphaned.
		const subagentPrefix = buildSubagentSessionUriPrefix(evictionTarget);
		for (const cachedKey of this._stateManager.getSessionUrisWithPrefix(subagentPrefix)) {
			this._stateManager.removeSession(cachedKey);
		}
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
	 * processing requires an asynchronous prelude (e.g. snapshotting
	 * user-message attachments into the session database before the
	 * action is reduced into state). Actions that don't need any
	 * asynchronous prelude bypass the queue entirely as long as no
	 * earlier action from the same client is still pending.
	 *
	 * todo@connor4312: we can drop this when sending a message become a command
	 */
	private readonly _clientDispatchQueues = new Map<string, Promise<void>>();

	dispatchAction(channel: string, action: SessionAction | TerminalAction | IRootConfigChangedAction, clientId: string, clientSeq: number): void {
		this._logService.trace(`[AgentService] dispatchAction: type=${action.type}, clientId=${clientId}, clientSeq=${clientSeq}`, action);

		const pending = this._clientDispatchQueues.get(clientId);
		if (!pending && !this._needsAsyncRewrite(channel, action)) {
			this._dispatchActionNow(channel, action, clientId, clientSeq);
			return;
		}
		const next = (pending ?? Promise.resolve()).then(async () => {
			const rewritten: SessionAction | TerminalAction | IRootConfigChangedAction = this._needsAsyncRewrite(channel, action)
				? await this._rewriteUserMessageAttachments(channel, action, clientId)
				: action;
			this._dispatchActionNow(channel, rewritten, clientId, clientSeq);
		}).catch(err => {
			this._logService.error(`[AgentService] async dispatchAction failed: ${toErrorMessage(err)}`);
		});

		this._clientDispatchQueues.set(clientId, next.finally(() => {
			if (this._clientDispatchQueues.get(clientId) === next) {
				this._clientDispatchQueues.delete(clientId);
			}
		}));
	}

	private _dispatchActionNow(channel: string, action: SessionAction | TerminalAction | IRootConfigChangedAction, clientId: string, clientSeq: number): void {
		const origin = { clientId, clientSeq };
		this._stateManager.dispatchClientAction(channel, action, origin);
		if (action.type === ActionType.RootConfigChanged) {
			this._configurationService.persistRootConfig();
		}
		this._sideEffects.handleAction(channel, action);
	}

	private _needsAsyncRewrite(channel: string, action: SessionAction | TerminalAction | IRootConfigChangedAction): action is SessionTurnStartedAction | SessionPendingMessageSetAction {
		if (action.type !== ActionType.SessionTurnStarted && action.type !== ActionType.SessionPendingMessageSet) {
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
	private async _rewriteUserMessageAttachments<T extends SessionTurnStartedAction | SessionPendingMessageSetAction>(channel: string, action: T, clientId: string): Promise<T> {
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

		const agent = this._findProviderForSession(session);
		if (!agent) {
			throw new ProtocolError(AHP_SESSION_NOT_FOUND, `No agent for session: ${sessionStr}`);
		}

		const meta = await this._getSessionMetadataForRestore(agent, session);
		if (!meta) {
			throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session not found on backend: ${sessionStr}`);
		}

		let turns: readonly Turn[];
		try {
			turns = await agent.getSessionMessages(session);
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
		let changesetMetadata: Record<string, string | undefined> | undefined;
		const ref = this._sessionDataService.tryOpenDatabase?.(session);
		if (ref) {
			try {
				const db = await ref;
				if (db) {
					try {
						const m = await db.object.getMetadataObject({
							customTitle: true,
							isRead: true,
							isArchived: true,
							isDone: true,
							configValues: true,
							...CHANGESET_DB_METADATA_KEYS,
						});
						if (m.customTitle) {
							title = m.customTitle;
						}
						if (m.isRead !== undefined) {
							isRead = m.isRead === 'true';
						}
						if (m.isArchived !== undefined) {
							isArchived = m.isArchived === 'true';
						} else if (m.isDone !== undefined) {
							isArchived = m.isDone === 'true';
						}

						changesetMetadata = m as Record<string, string | undefined>;
						if (changesetMetadata[META_CHANGES_SUMMARY]) {
							try {
								changes = JSON.parse(changesetMetadata[META_CHANGES_SUMMARY]);
							} catch (err) {
								this._logService.warn(`[AgentService] Failed to parse changes summary for ${sessionStr}: ${toErrorMessage(err)}`);
							}
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
			createdAt: meta.startTime,
			modifiedAt: meta.modifiedTime,
			...(meta.project ? { project: { uri: meta.project.uri.toString(), displayName: meta.project.displayName } } : {}),
			model: meta.model,
			agent: meta.agent,
			changes: meta.changes ?? changes,
			workingDirectory: meta.workingDirectory?.toString(),
		};

		this._stateManager.restoreSession(summary, [...turns]);

		const changesets = buildDefaultChangesetCatalogue(sessionStr);
		this._stateManager.setSessionChangesets(sessionStr, changesets);

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
		const restoredConfig = await this._resolveCreatedSessionConfig(agent, {
			workingDirectory: meta.workingDirectory,
			config: persistedConfigValues,
		});
		if (restoredConfig) {
			const restoredState = this._stateManager.getSessionState(sessionStr);
			if (restoredState) {
				restoredState.config = restoredConfig;
			}
		}

		this._logService.info(`[AgentService] Restored session ${sessionStr} with ${turns.length} turns`);

		// Lazily compute git state for sessions with a working directory;
		// attaches under `state._meta.git` once ready.
		this._attachGitState(session, meta.workingDirectory);
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
		} catch (_e) {
			throw new ProtocolError(AhpErrorCodes.NotFound, `Content not found: ${uri.toString()}`);
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
		const workingDirectory = this._stateManager.getSessionState(fields.sessionUri)?.summary.workingDirectory;
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
				childTurns = await agent.getSessionMessages(URI.parse(subagentUri));
			} catch (err) {
				this._logService.warn(`[AgentService] Failed to load subagent turns for ${subagentUri}`, err);
			}
		}

		// Use metadata from subagent content if available, otherwise synthesize
		const title = subagentContent?.title ?? 'Subagent';

		this._stateManager.restoreSession(
			{
				resource: subagentUri,
				provider: 'subagent',
				title,
				status: SessionStatus.Idle,
				createdAt: Date.now(),
				modifiedAt: Date.now(),
				...(parentState?.summary.project ? { project: parentState.summary.project } : {}),
			},
			[...childTurns],
		);
		this._logService.info(`[AgentService] Restored subagent session: ${subagentUri} with ${childTurns.length} turn(s)`);
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
