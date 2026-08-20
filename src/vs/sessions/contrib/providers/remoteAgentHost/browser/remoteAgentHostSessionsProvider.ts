/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { constObservable, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { basename, dirname } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { agentHostUri } from '../../../../../platform/agentHost/common/agentHostFileSystemProvider.js';
import { AGENT_HOST_SCHEME, agentHostAuthority, fromAgentHostUri, toAgentHostUri } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { AgentSession, type IAgentSessionMetadata } from '../../../../../platform/agentHost/common/agent.js';
import { type IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import type { ISessionGitState } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IDialogService, IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IAgentHostActiveClientService } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostActiveClientService.js';
import { IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionsService } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ILanguageModelsService } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { IAgentHostConnectProgress } from '../../../../common/agentHostSessionsProvider.js';
import { buildAgentHostSessionWorkspace, readBranchProtectionPatterns } from '../../../../common/agentHostSessionWorkspace.js';
import { IGitHubInfo, ISession, ISessionType, ISessionWorkspace, ISessionWorkspaceBrowseAction, SESSION_WORKSPACE_GROUP_REMOTE } from '../../../../services/sessions/common/session.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IGitHubService } from '../../../github/browser/githubService.js';
import { BaseAgentHostSessionsProvider } from '../../agentHost/browser/baseAgentHostSessionsProvider.js';
import { remoteAgentHostSessionTypeId } from '../../../../../platform/agentHost/common/agentHostSessionType.js';

/** Storage key prefix for cached session summaries, per remote address. */
const CACHED_SESSIONS_STORAGE_PREFIX = 'remoteAgentHost.cachedSessions.v2.';
// TODO@sandy081 Remove this legacy cache-key cleanup after 2026-10-14.
const CACHED_SESSIONS_STORAGE_PREFIX_LEGACY = 'remoteAgentHost.cachedSessions.';

function toLocalProjectUri(uri: URI, connectionAuthority: string): URI {
	return uri.scheme === Schemas.file ? toAgentHostUri(uri, connectionAuthority) : uri;
}

export interface IRemoteAgentHostSessionsProviderConfig {
	readonly address: string;
	readonly name: string;
	/**
	 * Stable preference key for this host (see
	 * {@link IAgentHostSessionsProvider.remoteLocationPreferenceKey}), when
	 * it differs from {@link address} — e.g. an SSH host's
	 * `computeSSHConnectionKey()` result versus its live forwarded address.
	 * Defaults to {@link address} when omitted.
	 */
	readonly preferenceKey?: string;
	/** Optional hook to establish a connection on demand (e.g. tunnel relay). */
	readonly connectOnDemand?: () => Promise<void>;
	/** Optional hook to tear down the active connection on demand (e.g. tunnel relay). */
	readonly disconnectOnDemand?: () => Promise<void>;
	/** Optional progress messages during on-demand connect. */
	readonly onDidReportConnectProgress?: Event<IAgentHostConnectProgress>;
	/**
	 * Set when the host addresses sessions under a scheme that differs from its agent provider, as
	 * the cloud sandbox host does (sessions are `ahp-session:/<id>` while the agent is `copilot`).
	 * The provider derives both directions from this pair, so they cannot drift apart.
	 */
	readonly sessionSchemeAlias?: ISessionSchemeAlias;
	/**
	 * Suppresses the `[host]` suffix that otherwise disambiguates this host's workspaces from
	 * identically-named ones on other hosts. Set by hosts whose label names a task rather than a
	 * location, where the suffix would put every session in a workspace group of one.
	 */
	readonly omitHostFromWorkspaceLabel?: boolean;
	/** Type icon for this host's workspaces. See {@link ISessionWorkspace.typeIcon}. */
	readonly workspaceTypeIcon?: ThemeIcon;
}

/**
 * The two names a session goes by when the host's session scheme differs from its agent provider.
 * The raw session id is shared, so only the scheme is translated.
 */
export interface ISessionSchemeAlias {
	/** Scheme the UI routes by — the agent provider (e.g. `copilot`). */
	readonly ui: string;
	/** Scheme the host's session registry is keyed by (e.g. `ahp-session`). */
	readonly backend: string;
}

/**
 * Sessions provider for a remote agent host connection. A thin subclass of
 * {@link BaseAgentHostSessionsProvider} that adds the connection-lifecycle
 * surface (`setConnection`/`clearConnection`), sticky authentication-pending
 * tracking, the well-known session-type mapping, and a remote folder picker.
 *
 * **URI/ID scheme:**
 * - **rawId** - unique session identifier (e.g. `abc123`), used as the cache key.
 * - **resource** - `{resourceScheme}:///{rawId}`. The scheme is the unique
 *   per-connection id and routes the chat service to the correct
 *   {@link AgentHostSessionHandler}.
 * - **sessionType** - the logical session type (e.g. `copilotcli` for copilot
 *   agents, or the per-connection id for other agents). Distinct from the
 *   resource scheme.
 * - **sessionId** - `{providerId}:{resource}` - the provider-scoped ID used by
 *   {@link ISessionsProvider} methods.
 * - Protocol operations (e.g. `disposeSession`) use the canonical agent
 *   session URI (`copilot:///abc123`), reconstructed via `AgentSession.uri`.
 */
export class RemoteAgentHostSessionsProvider extends BaseAgentHostSessionsProvider {

	readonly id: string;
	readonly label: string;
	readonly icon: ThemeIcon = Codicon.remote;
	readonly remoteAddress: string;
	readonly remoteLocationPreferenceKey: string;
	readonly browseActions: readonly ISessionWorkspaceBrowseAction[];
	readonly canConnectOnDemand: boolean;
	readonly onDidReportConnectProgress: Event<IAgentHostConnectProgress> | undefined;

	private readonly _connectionStatus = observableValue<RemoteAgentHostConnectionStatus>('connectionStatus', RemoteAgentHostConnectionStatus.disconnected);
	/**
	 * Forces this host's sessions read-only. Distinct from `disconnected`: a disconnected host may
	 * come back, so its sessions stay writable and queue on reconnect, whereas this marks a host
	 * that is gone and whose sessions exist only as replayed history.
	 */
	private readonly _readOnly = observableValue<boolean>('providerReadOnly', false);
	readonly connectionStatus: IObservable<RemoteAgentHostConnectionStatus> = this._connectionStatus;

	/**
	 * `true` while we are still resolving and pushing tokens for the host's
	 * `protectedResources`. Defaults to `true` so that sessions surface as
	 * loading until the first authentication pass settles.
	 */
	private readonly _authenticationPending = observableValue('authenticationPending', true);
	private _authenticationSettled = false;

	private readonly _onDidDisconnect = this._register(new Emitter<void>());
	protected override get onConnectionLost(): Event<void> { return this._onDidDisconnect.event; }

	/**
	 * Overridable seam so tests can exercise both the web and non-web
	 * branches of the label/description gating without depending on the
	 * ambient {@link isWeb} constant (the browser test runner always
	 * reports `isWeb === true`).
	 */
	protected get isWebPlatform(): boolean { return isWeb; }

	private _connection: IAgentConnection | undefined;
	private _defaultDirectory: string | undefined;
	private readonly _connectionListeners = this._register(new DisposableStore());
	private readonly _connectionAuthority: string;
	private readonly _connectOnDemand: (() => Promise<void>) | undefined;
	private readonly _disconnectOnDemand: (() => Promise<void>) | undefined;
	private readonly _sessionSchemeAlias: ISessionSchemeAlias | undefined;
	private readonly _omitHostFromWorkspaceLabel: boolean;
	private readonly _workspaceTypeIcon: ThemeIcon | undefined;
	/** Storage key used for persisting {@link _sessionCache} snapshots. */
	private readonly _storageKey: string;
	/**
	 * When `true`, the provider has been marked unreachable and sessions are
	 * hidden from {@link getSessions}, even though {@link _sessionCache} and
	 * persistent storage are retained. Cleared when a new connection is wired
	 * up in {@link setConnection}, at which point the cached entries are
	 * re-announced so the UI can repopulate.
	 */
	private _unpublished = false;


	constructor(
		config: IRemoteAgentHostSessionsProviderConfig,
		@IFileDialogService private readonly _fileDialogService: IFileDialogService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IStorageService storageService: IStorageService,
		@IChatSessionsService chatSessionsService: IChatSessionsService,
		@IChatService chatService: IChatService,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
		@ILanguageModelsService languageModelsService: ILanguageModelsService,
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
		@ILabelService private readonly _labelService: ILabelService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILogService logService: ILogService,
		@IGitHubService gitHubService: IGitHubService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ISessionsService sessionsService: ISessionsService,
		@IAgentHostActiveClientService activeClientService: IAgentHostActiveClientService,
		@IDialogService dialogService: IDialogService,
		@IWorkspaceTrustManagementService workspaceTrustManagementService: IWorkspaceTrustManagementService,
	) {
		super(chatSessionsService, chatService, chatWidgetService, languageModelsService, _configurationService, logService, gitHubService, instantiationService, sessionsService, activeClientService, storageService, dialogService, workspaceTrustManagementService);

		this._connectionAuthority = agentHostAuthority(config.address);
		this._connectOnDemand = config.connectOnDemand;
		this._disconnectOnDemand = config.disconnectOnDemand;
		this._sessionSchemeAlias = config.sessionSchemeAlias;
		this._omitHostFromWorkspaceLabel = config.omitHostFromWorkspaceLabel === true;
		this._workspaceTypeIcon = config.workspaceTypeIcon;
		this.onDidReportConnectProgress = config.onDidReportConnectProgress;
		this.canConnectOnDemand = !!config.connectOnDemand;
		const displayName = config.name || config.address;

		this.id = `agenthost-${this._connectionAuthority}`;
		this.label = displayName;
		this.remoteAddress = config.address;
		this.remoteLocationPreferenceKey = config.preferenceKey ?? config.address;
		this._storageKey = `${CACHED_SESSIONS_STORAGE_PREFIX}${this._connectionAuthority}`;

		this.browseActions = [{
			label: localize('folders', "Folders"),
			description: displayName,
			group: SESSION_WORKSPACE_GROUP_REMOTE,
			icon: Codicon.remote,
			providerId: this.id,
			run: () => this._browseForFolder(),
			listFolders: (query, token) => this._listRemoteFolders(query, token),
		}];

		this._enableSessionCachePersistence(this._storageKey, `${CACHED_SESSIONS_STORAGE_PREFIX_LEGACY}${this._connectionAuthority}`);
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('git.branchProtection')) {
				this._refreshSessionWorkspaces();
			}
		}));
	}

	// -- BaseAgentHostSessionsProvider hooks ---------------------------------

	protected get connection(): IAgentConnection | undefined { return this._connection; }

	protected get authenticationPending(): IObservable<boolean> { return this._authenticationPending; }

	/**
	 * Suspend cache-change tracking while sessions are unpublished (offline) so
	 * the on-disk snapshot survives an unreachable host. See
	 * {@link unpublishCachedSessions}.
	 */
	protected override _shouldTrackSessionCacheChanges(): boolean {
		return !this._unpublished;
	}

	protected _adapterOptions() {
		const hostLabel = this._workspaceHostLabel;
		const typeIcon = this._workspaceTypeIcon;
		return {
			readOnly: this._readOnly,
			buildWorkspace: (project: IAgentSessionMetadata['project'], workingDirectories: readonly URI[] | undefined, gitHubInfo: IObservable<IGitHubInfo | undefined>, gitState: ISessionGitState | undefined) => {
				const primary = workingDirectories?.[0];
				const uriForDescription = project?.uri ?? primary;
				const description = uriForDescription ? this._labelService.getUriLabel(dirname(uriForDescription), { relative: false }) : undefined;
				const branchProtectionPatterns = readBranchProtectionPatterns(this._configurationService, primary ?? project?.uri);
				return RemoteAgentHostSessionsProvider.buildWorkspace(project, workingDirectories, hostLabel, gitHubInfo, gitState, description, branchProtectionPatterns, typeIcon);
			},
		};
	}

	protected resourceSchemeForProvider(provider: string): string {
		return remoteAgentHostSessionTypeId(this._connectionAuthority, provider);
	}

	override getSessions(): ISession[] {
		return this._unpublished ? [] : super.getSessions();
	}

	protected override mapWorkingDirectoryUri(uri: URI): URI {
		return toAgentHostUri(uri, this._connectionAuthority);
	}

	protected override mapProjectUri(uri: URI): URI {
		return toLocalProjectUri(uri, this._connectionAuthority);
	}

	protected override _diffUriMapper(): (uri: URI) => URI {
		return uri => toAgentHostUri(uri, this._connectionAuthority);
	}

	protected override _validateBeforeCreate(_sessionType: ISessionType): void {
		if (!this._connection) {
			throw new Error(localize('notConnectedSession', "Cannot create session: not connected to remote agent host '{0}'.", this.label));
		}
	}

	protected override _noAgentsErrorMessage(): string {
		return localize('noAgents', "Remote agent host '{0}' has not advertised any agents yet.", this.label);
	}

	protected override _notConnectedSendErrorMessage(): string {
		return localize('notConnectedSend', "Cannot send request: not connected to remote agent host '{0}'.", this.label);
	}

	// -- Connection lifecycle ------------------------------------------------

	/**
	 * Establish (or re-establish) the connection for this host on demand.
	 * Tunnel-backed providers use their relay hook; other providers fall
	 * back to the generic remote agent host reconnect path.
	 */
	async connect(): Promise<void> {
		if (this._connectOnDemand) {
			await this._connectOnDemand();
			return;
		}
		this._remoteAgentHostService.reconnect(this.remoteAddress);
	}

	/**
	 * Tear down the active connection for this host. Tunnel-backed providers
	 * use their relay hook; other providers fall back to the generic remote
	 * agent host disconnect path. Cached sessions are hidden from the UI so
	 * the sessions list reflects the disconnected state; the persisted cache
	 * is retained so sessions can be restored on reconnect.
	 */
	async disconnect(): Promise<void> {
		this.unpublishCachedSessions();
		if (this._disconnectOnDemand) {
			await this._disconnectOnDemand();
			return;
		}
		await this._remoteAgentHostService.removeRemoteAgentHost(this.remoteAddress);
	}

	/** Update the connection status for this provider. */
	setConnectionStatus(status: RemoteAgentHostConnectionStatus): void {
		this._connectionStatus.set(status, undefined);
	}

	/**
	 * Forces every session on this host to be read-only.
	 *
	 * Set when the host is permanently unreachable and its sessions are being served from
	 * persisted history: the conversation is genuine, but there is no host left to send to, so the
	 * composer must be hidden rather than accept input that can never be delivered.
	 */
	setReadOnly(readOnly: boolean): void {
		this._readOnly.set(readOnly, undefined);
	}

	/**
	 * Seed discovered session summaries into the cache so they surface in the sessions list
	 * **before** a connection is established (lazy discovery).
	 *
	 * An entry that already exists keeps everything the host has told us, except for a missing
	 * project: the repository name is resolved over the network and that lookup can fail, so
	 * filling it in on a later pass is what makes retrying worth anything. Opening a seeded session
	 * triggers `connectOnDemand`, after which `_refreshSessions` reconciles against the host.
	 */
	seedSessions(metas: readonly IAgentSessionMetadata[]): void {
		const added: ISession[] = [];
		const changed: ISession[] = [];
		for (const rawMeta of metas) {
			const meta = this._adoptSessionMeta(rawMeta);
			const rawId = AgentSession.id(meta.session);
			const existing = this._sessionCache.get(rawId);
			if (existing) {
				// Announcing the change also marks the session cache dirty, so the filled-in
				// project reaches the next persisted snapshot.
				if (meta.project && !existing.project && existing.backfillProject(meta.project)) {
					changed.push(existing);
				}
				continue;
			}
			const adapter = this.createAdapter(meta);
			this._sessionCache.set(rawId, adapter);
			added.push(adapter);
		}
		if (added.length > 0 || changed.length > 0) {
			this._onDidChangeSessions.fire({ added, removed: [], changed });
		}
	}

	/**
	 * Map a host-reported session URI onto the UI scheme, so the session routes to the agent's
	 * content provider. The raw id is preserved, so cache keys are unaffected.
	 */
	protected override _adoptSessionMeta(meta: IAgentSessionMetadata): IAgentSessionMetadata {
		const alias = this._sessionSchemeAlias;
		if (!alias || meta.session.scheme !== alias.backend) {
			return meta;
		}
		return { ...meta, session: meta.session.with({ scheme: alias.ui }) };
	}

	/**
	 * Inverse of {@link _adoptSessionMeta}: map the UI scheme back to the one the host's session
	 * registry is keyed by, so backend calls address the URI the host knows.
	 */
	protected override _backendSessionScheme(agentProvider: string): string {
		const alias = this._sessionSchemeAlias;
		return alias && agentProvider === alias.ui ? alias.backend : agentProvider;
	}

	setAuthenticationPending(pending: boolean): void {
		// Sticky: once the first authentication pass settles, never surface
		// pending again. Subsequent re-auths happen silently in the background.
		if (this._authenticationSettled) {
			return;
		}
		if (!pending) {
			this._authenticationSettled = true;
		}
		this._authenticationPending.set(pending, undefined);
		if (!pending) {
			this._resumeNewSessionAfterAuthenticationSettles();
		}
	}

	/**
	 * Wire a live connection to this provider, enabling session operations and folder browsing.
	 */
	setConnection(connection: IAgentConnection, defaultDirectory?: string): void {
		if (this._connection === connection && this._defaultDirectory === defaultDirectory) {
			return;
		}

		const wasUnpublished = this._unpublished;
		this._connectionListeners.clear();
		this._sessionStateSubscriptions.clearAndDisposeAll();
		this._connection = connection;
		this._defaultDirectory = defaultDirectory;
		this._unpublished = false;

		this._syncRootState(connection.rootState.value);
		this._connectionListeners.add(connection.rootState.onDidChange(() => {
			this._syncRootState(connection.rootState.value);
		}));
		if (connection.rootState.onDidError) {
			this._connectionListeners.add(connection.rootState.onDidError(error => {
				this._syncRootState(error);
			}));
		}

		this._attachConnectionListeners(connection, this._connectionListeners);

		// Always refresh sessions when a connection is (re)established.
		// `_refreshSessions` owns `_cacheInitialized` (set on a successful
		// list) and arms a backoff retry if the first attempt fails.
		this._refreshSessions(wasUnpublished);
	}

	/**
	 * Clear the connection, e.g. when the remote host disconnects.
	 * Retains the provider registration so it remains visible in the UI,
	 * and **preserves** the cached session list so previously loaded
	 * sessions stay visible while we're offline. Callers that know the
	 * host is unreachable should follow up with {@link unpublishCachedSessions}.
	 */
	clearConnection(): void {
		this._connectionListeners.clear();
		this._sessionStateSubscriptions.clearAndDisposeAll();
		this._onDidDisconnect.fire();
		this._connection = undefined;
		this._defaultDirectory = undefined;
		this._disposeAllNewSessions();
		this._syncRootState(undefined);

		// Drop only the transient pending/draft session; keep the persisted
		// cache so the workspace picker keeps showing offline sessions.
		if (this._pendingSession) {
			const pending = this._pendingSession;
			this._pendingSession = undefined;
			this._onDidChangeSessions.fire({ added: [], removed: [pending], changed: [] });
		}

		// Reset the in-memory cache-initialized flag so a fresh connection
		// triggers a full list refresh (which will reconcile against the
		// persisted entries we keep on disk).
		this._cacheInitialized = false;
		this._cancelSessionRefreshRetry();
	}

	/**
	 * Hide cached sessions from the UI without discarding them. Called by the
	 * host-tracking contributions when they determine the remote host is
	 * unreachable (tunnel offline or SSH reconnect failed). The in-memory
	 * cache and persisted storage are left intact so the sessions can be
	 * restored if the host comes back online in this session, or on the next
	 * launch. The next {@link setConnection} call re-announces the cached
	 * entries.
	 */
	unpublishCachedSessions(): void {
		if (this._unpublished) {
			return;
		}
		this._unpublished = true;
		if (this._sessionCache.size > 0) {
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [] });
		}
	}

	// -- Session-type sync ---------------------------------------------------

	protected _formatSessionTypeLabel(agentLabel: string): string {
		// In web (vscode.dev/agents) the workbench is already scoped to a
		// single host via the host picker, so there's no need to disambiguate
		// the session-type label with the host name.
		if (this.isWebPlatform) {
			return agentLabel;
		}
		return `${agentLabel} [${this.label}]`;
	}

	// -- Workspaces ----------------------------------------------------------

	/**
	 * The host name appended to this host's workspace labels, or `undefined` when it would add
	 * nothing — in web the workbench is already scoped to a single host by the host picker.
	 */
	private get _workspaceHostLabel(): string | undefined {
		return this.isWebPlatform || this._omitHostFromWorkspaceLabel ? undefined : this.label;
	}

	static buildWorkspace(project: IAgentSessionMetadata['project'], workingDirectories: readonly URI[] | undefined, providerLabel: string | undefined, gitHubInfo: IObservable<IGitHubInfo | undefined>, gitState: ISessionGitState | undefined, description?: string, branchProtectionPatterns?: readonly string[], typeIcon?: ThemeIcon): ISessionWorkspace | undefined {
		return buildAgentHostSessionWorkspace(project, workingDirectories, { providerLabel, fallbackIcon: Codicon.remote, requiresWorkspaceTrust: true, description, branchProtectionPatterns, group: SESSION_WORKSPACE_GROUP_REMOTE, typeIcon }, gitHubInfo, gitState);
	}

	private _buildWorkspaceFromUri(uri: URI): ISessionWorkspace {
		const folderName = basename(uri) || uri.path;
		const hostLabel = this._workspaceHostLabel;
		return {
			uri,
			label: hostLabel ? `${folderName} [${hostLabel}]` : folderName,
			description: this._labelService.getUriLabel(dirname(uri), { relative: false }),
			group: SESSION_WORKSPACE_GROUP_REMOTE,
			icon: Codicon.remote,
			folders: [{
				root: uri,
				workingDirectory: uri,
				name: folderName,
				description: undefined,
				gitRepository: { uri, workTreeUri: undefined, baseBranchName: undefined, gitHubInfo: constObservable(undefined) },
			}],
			requiresWorkspaceTrust: true,
			isVirtualWorkspace: false,
		};
	}

	resolveWorkspace(repositoryUri: URI): ISessionWorkspace | undefined {
		if (repositoryUri.scheme !== AGENT_HOST_SCHEME) {
			return undefined;
		}
		// Only claim URIs that belong to *this* connection. Without this
		// check, every agent-host provider matches every agent-host URI
		// and the workspace picker's first-match-wins lookup attributes
		// the folder to whichever provider is iterated first — so a folder
		// picked from WSL ends up labelled with another host's name.
		if (repositoryUri.authority !== this._connectionAuthority) {
			return undefined;
		}
		return this._buildWorkspaceFromUri(repositoryUri);
	}

	// -- Browse --------------------------------------------------------------

	private async _browseForFolder(): Promise<ISessionWorkspace | undefined> {
		// Establish connection on demand if a hook is provided (e.g. tunnel relay)
		if (!this._connection && this._connectOnDemand) {
			try {
				await this._connectOnDemand();
			} catch (err) {
				this._notificationService.error(localize('connectFailed', "Failed to connect to remote agent host '{0}': {1}", this.label, err instanceof Error ? err.message : String(err)));
				return undefined;
			}
		}

		if (!this._connection) {
			this._notificationService.error(localize('notConnected', "Unable to connect to remote agent host '{0}'.", this.label));
			return undefined;
		}

		const defaultUri = agentHostUri(this._connectionAuthority, this._defaultDirectory ?? '/');

		try {
			const selected = await this._fileDialogService.showOpenDialog({
				canSelectFiles: false,
				canSelectFolders: true,
				canSelectMany: false,
				title: localize('selectRemoteFolder', "Select Folder on {0}", this.label),
				availableFileSystems: [AGENT_HOST_SCHEME],
				defaultUri,
			});
			if (selected?.[0]) {
				return this._buildWorkspaceFromUri(selected[0]);
			}
		} catch {
			// dialog was cancelled or failed
		}
		return undefined;
	}

	/**
	 * Enumerate subdirectories below {@link _defaultDirectory}, filtered
	 * by a case-insensitive substring query. Backs the inline folder
	 * list rendered by the mobile workspace picker sheet so users can
	 * pick a folder without opening a separate file-dialog.
	 *
	 * The query supports light path navigation: a `/` in the query is
	 * treated as a path delimiter, listing children of `<default>/<prefix>`
	 * and matching the part after the last slash. So typing `projects/`
	 * drills into the `projects` directory, and `projects/foo` lists
	 * children of `projects` whose name contains `foo`.
	 *
	 * Hidden directories (those starting with `.`) are omitted, results
	 * are sorted by name, and the cancellation token is honored before
	 * and after the network round-trip so stale queries don't surface
	 * after the user has typed more characters.
	 */
	private async _listRemoteFolders(query: string, token: CancellationToken): Promise<readonly ISessionWorkspace[]> {
		// Establish a connection on demand if a hook is available; if it
		// fails or is unavailable, return empty so the sheet renders an
		// empty result rather than throwing.
		if (!this._connection && this._connectOnDemand) {
			try {
				await this._connectOnDemand();
			} catch {
				return [];
			}
		}
		if (!this._connection || token.isCancellationRequested) {
			return [];
		}

		const rootAgentHostUri = agentHostUri(this._connectionAuthority, this._defaultDirectory ?? '/');

		// Parse path navigation out of the query. Anything before the
		// last `/` is a relative directory we descend into; the part
		// after is the filter we apply to that directory's children.
		const trimmed = query.trim();
		const lastSlash = trimmed.lastIndexOf('/');
		let listingAgentHostUri = rootAgentHostUri;
		let filter = trimmed;
		if (lastSlash >= 0) {
			const subPath = trimmed.slice(0, lastSlash).replace(/^\/+|\/+$/g, '');
			filter = trimmed.slice(lastSlash + 1);
			if (subPath) {
				listingAgentHostUri = URI.joinPath(rootAgentHostUri, subPath);
			}
		}
		const listingOriginalUri = fromAgentHostUri(listingAgentHostUri);

		let entries;
		try {
			const result = await this._connection.resourceList(listingOriginalUri);
			entries = result.entries;
		} catch {
			return [];
		}
		if (token.isCancellationRequested) {
			return [];
		}

		const lowerFilter = filter.toLocaleLowerCase();
		const folders: ISessionWorkspace[] = [];
		for (const entry of entries) {
			if (entry.type !== 'directory') {
				continue;
			}
			if (entry.name.startsWith('.')) {
				continue;
			}
			if (lowerFilter && !entry.name.toLocaleLowerCase().includes(lowerFilter)) {
				continue;
			}
			const childUri = URI.joinPath(listingAgentHostUri, entry.name);
			// Use a folder icon for inline list rows — `Codicon.remote`
			// is the right choice for the host-level browse action,
			// but per-folder rows read better as folder glyphs.
			folders.push({ ...this._buildWorkspaceFromUri(childUri), icon: Codicon.folder });
		}
		folders.sort((a, b) => a.label.localeCompare(b.label));
		return folders;
	}
}
