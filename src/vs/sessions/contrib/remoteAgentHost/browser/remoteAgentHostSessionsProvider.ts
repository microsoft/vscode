/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { basename, dirname } from '../../../../base/common/resources.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';
import { isWeb } from '../../../../base/common/platform.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { agentHostUri } from '../../../../platform/agentHost/common/agentHostFileSystemProvider.js';
import { AGENT_HOST_SCHEME, agentHostAuthority, toAgentHostUri } from '../../../../platform/agentHost/common/agentHostUri.js';
import { AgentSession, type IAgentConnection, type IAgentSessionMetadata } from '../../../../platform/agentHost/common/agentService.js';
import type { ISessionGitState } from '../../../../platform/agentHost/common/state/sessionState.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionsService } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { AgentHostSessionAdapter, BaseAgentHostSessionsProvider } from '../../agentHost/browser/baseAgentHostSessionsProvider.js';
import { buildAgentHostSessionWorkspace, readBranchProtectionPatterns } from '../../../common/agentHostSessionWorkspace.js';
import { ISession, ISessionType, ISessionWorkspace, ISessionWorkspaceBrowseAction, SESSION_WORKSPACE_GROUP_REMOTE } from '../../../services/sessions/common/session.js';
import { remoteAgentHostSessionTypeId } from '../common/remoteAgentHostSessionType.js';

/** Storage key prefix for cached session summaries, per remote address. */
const CACHED_SESSIONS_STORAGE_PREFIX = 'remoteAgentHost.cachedSessions.';

/** Maximum number of cached session summaries persisted per host. */
const CACHED_SESSIONS_MAX_PER_HOST = 100;

/**
 * Serialized shape of an {@link IAgentSessionMetadata} suitable for
 * persisting via {@link IStorageService}. URIs are stored as strings
 * and diffs are intentionally omitted (they are re-populated when the
 * connection refreshes sessions).
 */
interface ISerializedSessionMetadata {
	readonly session: string;
	readonly startTime: number;
	readonly modifiedTime: number;
	readonly summary?: string;
	readonly model?: IAgentSessionMetadata['model'];
	readonly workingDirectory?: string;
	readonly isRead?: boolean;
	readonly isArchived?: boolean;
	/** @deprecated Legacy name for `isArchived`. */
	readonly isDone?: boolean;
	readonly project?: { readonly uri: string; readonly displayName: string };
}

function serializeMetadata(meta: IAgentSessionMetadata): ISerializedSessionMetadata {
	return {
		session: meta.session.toString(),
		startTime: meta.startTime,
		modifiedTime: meta.modifiedTime,
		summary: meta.summary,
		model: meta.model,
		workingDirectory: meta.workingDirectory?.toString(),
		isRead: meta.isRead,
		isArchived: meta.isArchived,
		project: meta.project ? { uri: meta.project.uri.toString(), displayName: meta.project.displayName } : undefined,
	};
}

function deserializeMetadata(raw: ISerializedSessionMetadata): IAgentSessionMetadata | undefined {
	try {
		return {
			session: URI.parse(raw.session),
			startTime: raw.startTime,
			modifiedTime: raw.modifiedTime,
			summary: raw.summary,
			model: raw.model,
			workingDirectory: raw.workingDirectory ? URI.parse(raw.workingDirectory) : undefined,
			isRead: raw.isRead,
			isArchived: raw.isArchived ?? raw.isDone,
			project: raw.project ? { uri: URI.parse(raw.project.uri), displayName: raw.project.displayName } : undefined,
		};
	} catch {
		return undefined;
	}
}

function toLocalProjectUri(uri: URI, connectionAuthority: string): URI {
	return uri.scheme === Schemas.file ? toAgentHostUri(uri, connectionAuthority) : uri;
}

export interface IRemoteAgentHostSessionsProviderConfig {
	readonly address: string;
	readonly name: string;
	/** Optional hook to establish a connection on demand (e.g. tunnel relay). */
	readonly connectOnDemand?: () => Promise<void>;
	/** Optional hook to tear down the active connection on demand (e.g. tunnel relay). */
	readonly disconnectOnDemand?: () => Promise<void>;
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
 *   session URI (`copilot:///abc123`), reconstructed via {@link AgentSession.uri}.
 */
export class RemoteAgentHostSessionsProvider extends BaseAgentHostSessionsProvider {

	readonly id: string;
	readonly label: string;
	readonly icon: ThemeIcon = Codicon.remote;
	readonly remoteAddress: string;
	readonly browseActions: readonly ISessionWorkspaceBrowseAction[];

	private _outputChannelId: string | undefined;
	get outputChannelId(): string | undefined { return this._outputChannelId; }

	private readonly _connectionStatus = observableValue<RemoteAgentHostConnectionStatus>('connectionStatus', RemoteAgentHostConnectionStatus.Disconnected);
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
	/** Storage key used for persisting {@link _sessionCache} snapshots. */
	private readonly _storageKey: string;
	/**
	 * Set when {@link _sessionCache} has changed since the last persist.
	 * The actual write happens on the next `onWillSaveState` signal from
	 * {@link IStorageService} so that bursts of notifications do not
	 * repeatedly re-serialize the whole cache.
	 */
	private _cacheDirty = false;
	/**
	 * Snapshot of the source metadata for each adapter in {@link _sessionCache},
	 * keyed by raw session ID. Captured in {@link createAdapter} and re-used by
	 * {@link _persistCache} to serialize sessions without having to reconstruct
	 * every `IAgentSessionMetadata` field from observables.
	 */
	private readonly _metaByRawId = new Map<string, IAgentSessionMetadata>();
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
		@IStorageService private readonly _storageService: IStorageService,
		@IChatSessionsService chatSessionsService: IChatSessionsService,
		@IChatService chatService: IChatService,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
		@ILanguageModelsService languageModelsService: ILanguageModelsService,
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
		@ILabelService private readonly _labelService: ILabelService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super(chatSessionsService, chatService, chatWidgetService, languageModelsService);

		this._connectionAuthority = agentHostAuthority(config.address);
		this._connectOnDemand = config.connectOnDemand;
		this._disconnectOnDemand = config.disconnectOnDemand;
		const displayName = config.name || config.address;

		this.id = `agenthost-${this._connectionAuthority}`;
		this.label = displayName;
		this.remoteAddress = config.address;
		this._storageKey = `${CACHED_SESSIONS_STORAGE_PREFIX}${this._connectionAuthority}`;

		this.browseActions = [{
			label: localize('folders', "Folders"),
			description: displayName,
			group: SESSION_WORKSPACE_GROUP_REMOTE,
			icon: Codicon.remote,
			providerId: this.id,
			run: () => this._browseForFolder(),
		}];

		this._loadCachedSessions();

		this._register(this._onDidChangeSessions.event(e => {
			if (this._unpublished) {
				return;
			}
			if (e.added.length > 0 || e.removed.length > 0 || e.changed.length > 0) {
				this._cacheDirty = true;
			}
			for (const removed of e.removed) {
				const rawId = this._rawIdFromChatId(removed.sessionId);
				if (rawId) {
					this._metaByRawId.delete(rawId);
				}
			}
		}));

		this._register(this._storageService.onWillSaveState(() => {
			if (this._cacheDirty) {
				this._persistCache();
				this._cacheDirty = false;
			}
		}));
	}

	// -- BaseAgentHostSessionsProvider hooks ---------------------------------

	protected get connection(): IAgentConnection | undefined { return this._connection; }

	protected get authenticationPending(): IObservable<boolean> { return this._authenticationPending; }

	protected override createAdapter(meta: IAgentSessionMetadata): AgentHostSessionAdapter {
		this._metaByRawId.set(AgentSession.id(meta.session), meta);
		return super.createAdapter(meta);
	}

	protected _adapterOptions() {
		const web = this.isWebPlatform;
		return {
			description: web ? undefined : new MarkdownString().appendText(this.label),
			buildWorkspace: (project: IAgentSessionMetadata['project'], workingDirectory: URI | undefined, gitState: ISessionGitState | undefined) => {
				const uriForDescription = project?.uri ?? workingDirectory;
				const description = uriForDescription ? this._labelService.getUriLabel(dirname(uriForDescription), { relative: false }) : undefined;
				const branchProtectionPatterns = readBranchProtectionPatterns(this._configurationService, workingDirectory ?? project?.uri);
				return RemoteAgentHostSessionsProvider.buildWorkspace(project, workingDirectory, web ? undefined : this.label, gitState, description, branchProtectionPatterns);
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

	/** Set the output channel ID for this provider's IPC log. */
	setOutputChannelId(id: string): void {
		this._outputChannelId = id;
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
	}

	/**
	 * Wire a live connection to this provider, enabling session operations and folder browsing.
	 */
	setConnection(connection: IAgentConnection, defaultDirectory?: string): void {
		if (this._connection === connection && this._defaultDirectory === defaultDirectory) {
			return;
		}

		this._connectionListeners.clear();
		this._sessionStateSubscriptions.clearAndDisposeAll();
		this._connection = connection;
		this._defaultDirectory = defaultDirectory;
		this._unpublished = false;

		// Dynamically discover session types from the host's advertised agents.
		const rootStateValue = connection.rootState.value;
		if (rootStateValue && !(rootStateValue instanceof Error)) {
			this._syncSessionTypesFromRootState(rootStateValue);
			this._syncRootConfigFromRootState(rootStateValue);
		}
		this._connectionListeners.add(connection.rootState.onDidChange(rootState => {
			this._syncSessionTypesFromRootState(rootState);
			this._syncRootConfigFromRootState(rootState);
		}));

		this._attachConnectionListeners(connection, this._connectionListeners);

		// Always refresh sessions when a connection is (re)established
		this._cacheInitialized = true;
		this._refreshSessions();
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
		if (this._currentNewSession) {
			this._clearNewSessionConfig(this._currentNewSession.sessionId);
			this._currentNewSession = undefined;
		}
		this._currentNewSessionStatus = undefined;
		this._currentNewSessionModelId = undefined;
		this._currentNewSessionLoading = undefined;
		this._selectedModelId = undefined;

		if (this._sessionTypes.length > 0) {
			this._sessionTypes = [];
			this._onDidChangeSessionTypes.fire();
		}

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
		const removed: ISession[] = Array.from(this._sessionCache.values());
		if (removed.length > 0) {
			this._onDidChangeSessions.fire({ added: [], removed, changed: [] });
		}
	}

	/** Load persisted session summaries into {@link _sessionCache}. */
	private _loadCachedSessions(): void {
		const parsed = this._storageService.getObject(this._storageKey, StorageScope.APPLICATION);
		if (!Array.isArray(parsed)) {
			return;
		}
		for (const entry of parsed as readonly ISerializedSessionMetadata[]) {
			const meta = deserializeMetadata(entry);
			if (!meta) {
				continue;
			}
			const rawId = AgentSession.id(meta.session);
			if (this._sessionCache.has(rawId)) {
				continue;
			}
			const cached = this.createAdapter(meta);
			this._sessionCache.set(rawId, cached);
		}
	}

	/**
	 * Persist the current {@link _sessionCache} to storage, capping at
	 * {@link CACHED_SESSIONS_MAX_PER_HOST} most-recently-modified entries.
	 * Mutable fields are read from each adapter's observables and overlaid on
	 * top of the original metadata snapshot captured in {@link _metaByRawId}.
	 */
	private _persistCache(): void {
		const entries: ISerializedSessionMetadata[] = [];
		for (const [rawId, adapter] of this._sessionCache) {
			const base = this._metaByRawId.get(rawId);
			if (!base) {
				continue;
			}
			entries.push(serializeMetadata({
				...base,
				summary: adapter.title.get() || base.summary,
				modifiedTime: adapter.updatedAt.get().getTime(),
				model: adapter.modelSelection ?? base.model,
				isRead: adapter.isRead.get(),
				isArchived: adapter.isArchived.get(),
			}));
		}
		if (entries.length === 0) {
			this._storageService.remove(this._storageKey, StorageScope.APPLICATION);
			return;
		}
		entries.sort((a, b) => b.modifiedTime - a.modifiedTime);
		const limited = entries.slice(0, CACHED_SESSIONS_MAX_PER_HOST);
		this._storageService.store(this._storageKey, JSON.stringify(limited), StorageScope.APPLICATION, StorageTarget.USER);
	}

	// -- Session-type sync ---------------------------------------------------

	protected _formatSessionTypeLabel(agentLabel: string): string {
		return `${agentLabel} [${this.label}]`;
	}

	// -- Workspaces ----------------------------------------------------------

	static buildWorkspace(project: IAgentSessionMetadata['project'], workingDirectory: URI | undefined, providerLabel: string | undefined, gitState: ISessionGitState | undefined, description?: string, branchProtectionPatterns?: readonly string[]): ISessionWorkspace | undefined {
		return buildAgentHostSessionWorkspace(project, workingDirectory, { providerLabel, fallbackIcon: Codicon.remote, requiresWorkspaceTrust: false, description, branchProtectionPatterns, group: SESSION_WORKSPACE_GROUP_REMOTE }, gitState);
	}

	private _buildWorkspaceFromUri(uri: URI): ISessionWorkspace {
		const folderName = basename(uri) || uri.path;
		return {
			label: this.isWebPlatform ? folderName : `${folderName} [${this.label}]`,
			description: this._labelService.getUriLabel(dirname(uri), { relative: false }),
			group: SESSION_WORKSPACE_GROUP_REMOTE,
			icon: Codicon.remote,
			repositories: [{ uri, workingDirectory: undefined, detail: undefined, baseBranchName: undefined }],
			requiresWorkspaceTrust: true,
		};
	}

	resolveWorkspace(repositoryUri: URI): ISessionWorkspace | undefined {
		if (repositoryUri.scheme !== AGENT_HOST_SCHEME) {
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
}
