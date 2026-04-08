/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IMarkdownString, MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { basename } from '../../../../base/common/resources.js';
import { constObservable, IObservable, ISettableObservable, observableValue } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { agentHostUri } from '../../../../platform/agentHost/common/agentHostFileSystemProvider.js';
import { AGENT_HOST_SCHEME, agentHostAuthority, toAgentHostUri } from '../../../../platform/agentHost/common/agentHostUri.js';
import { AgentSession, type IAgentConnection, type IAgentSessionMetadata } from '../../../../platform/agentHost/common/agentService.js';
import { RemoteAgentHostConnectionStatus } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ActionType, isSessionAction } from '../../../../platform/agentHost/common/state/sessionActions.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { IChatSendRequestOptions, IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionFileChange, IChatSessionsService } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ChatAgentLocation, ChatModeKind } from '../../../../workbench/contrib/chat/common/constants.js';
import { ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { ISessionChangeEvent, ISendRequestOptions, ISessionsProvider } from '../../../services/sessions/common/sessionsProvider.js';
import { ISession, IChat, IGitHubInfo, ISessionWorkspace, ISessionWorkspaceBrowseAction, SessionStatus, CopilotCLISessionType, ISessionType } from '../../../services/sessions/common/session.js';

interface IChatData {
	/** Globally unique session ID (`providerId:localId`). */
	readonly id: string;
	/** Resource URI identifying this session. */
	readonly resource: URI;
	/** ID of the provider that owns this session. */
	readonly providerId: string;
	/** Session type ID (e.g., 'copilot-cli', 'copilot-cloud'). */
	readonly sessionType: string;
	/** Icon for this session. */
	readonly icon: ThemeIcon;
	/** When the session was created. */
	readonly createdAt: Date;
	/** Workspace this session operates on. */
	readonly workspace: IObservable<ISessionWorkspace | undefined>;

	// Reactive properties

	/** Session display title (changes when auto-titled or renamed). */
	readonly title: IObservable<string>;
	/** When the session was last updated. */
	readonly updatedAt: IObservable<Date>;
	/** Current session status. */
	readonly status: IObservable<SessionStatus>;
	/** File changes produced by the session. */
	readonly changes: IObservable<readonly IChatSessionFileChange[]>;
	/** Currently selected model identifier. */
	readonly modelId: IObservable<string | undefined>;
	/** Currently selected mode identifier and kind. */
	readonly mode: IObservable<{ readonly id: string; readonly kind: string } | undefined>;
	/** Whether the session is still initializing (e.g., resolving git repository). */
	readonly loading: IObservable<boolean>;
	/** Whether the session is archived. */
	readonly isArchived: IObservable<boolean>;
	/** Whether the session has been read. */
	readonly isRead: IObservable<boolean>;
	/** Status description shown while the session is active (e.g., current agent action). */
	readonly description: IObservable<IMarkdownString | undefined>;
	/** Timestamp of when the last agent turn ended, if any. */
	readonly lastTurnEnd: IObservable<Date | undefined>;
	/** GitHub information associated with this session, if any. */
	readonly gitHubInfo: IObservable<IGitHubInfo | undefined>;
}

export interface IRemoteAgentHostSessionsProviderConfig {
	readonly address: string;
	readonly name: string;
	/** Optional hook to establish a connection on demand (e.g. tunnel relay). */
	readonly connectOnDemand?: () => Promise<void>;
}

/**
 * Adapts agent host session metadata into the {@link IChatData} facade.
 */
class RemoteSessionAdapter implements IChatData {

	readonly id: string;
	readonly resource: URI;
	readonly providerId: string;
	readonly sessionType: string;
	readonly icon = Codicon.remote;
	readonly createdAt: Date;
	readonly workspace: ISettableObservable<ISessionWorkspace | undefined>;
	readonly title: ISettableObservable<string>;
	readonly updatedAt: ISettableObservable<Date>;
	readonly status = observableValue<SessionStatus>('status', SessionStatus.Completed);
	readonly changes = observableValue<readonly IChatSessionFileChange[]>('changes', []);
	readonly modelId = observableValue<string | undefined>('modelId', undefined);
	readonly mode = observableValue<{ readonly id: string; readonly kind: string } | undefined>('mode', undefined);
	readonly loading = observableValue('loading', false);
	readonly isArchived = observableValue('isArchived', false);
	readonly isRead = observableValue('isRead', true);
	readonly description: ISettableObservable<IMarkdownString | undefined>;
	readonly lastTurnEnd: ISettableObservable<Date | undefined>;
	readonly gitHubInfo = observableValue<IGitHubInfo | undefined>('gitHubInfo', undefined);

	/** The agent provider name (e.g. 'copilot') for constructing backend URIs. */
	readonly agentProvider: string;

	constructor(
		metadata: IAgentSessionMetadata,
		providerId: string,
		resourceScheme: string,
		logicalSessionType: string,
		providerLabel: string,
		connectionAuthority: string,
	) {
		const rawId = AgentSession.id(metadata.session);
		this.agentProvider = AgentSession.provider(metadata.session) ?? 'copilot';
		this.resource = URI.from({ scheme: resourceScheme, path: `/${rawId}` });
		this.id = `${providerId}:${this.resource.toString()}`;
		this.providerId = providerId;
		this.sessionType = logicalSessionType;
		this.createdAt = new Date(metadata.startTime);
		this.title = observableValue('title', metadata.summary ?? `Session ${rawId.substring(0, 8)}`);
		this.updatedAt = observableValue('updatedAt', new Date(metadata.modifiedTime));
		this.lastTurnEnd = observableValue('lastTurnEnd', metadata.modifiedTime ? new Date(metadata.modifiedTime) : undefined);
		this.description = observableValue('description', new MarkdownString().appendText(providerLabel));
		this.workspace = observableValue('workspace', metadata.workingDirectory
			? RemoteAgentHostSessionsProvider.buildWorkspace(metadata.workingDirectory, providerLabel, connectionAuthority)
			: undefined);

		if (metadata.isRead === false) {
			this.isRead.set(false, undefined);
		}
		if (metadata.isDone) {
			this.isArchived.set(true, undefined);
		}
	}

	update(metadata: IAgentSessionMetadata): void {
		this.title.set(metadata.summary ?? this.title.get(), undefined);
		this.updatedAt.set(new Date(metadata.modifiedTime), undefined);
		this.lastTurnEnd.set(metadata.modifiedTime ? new Date(metadata.modifiedTime) : undefined, undefined);
		if (metadata.isRead !== undefined) {
			this.isRead.set(metadata.isRead, undefined);
		}
		if (metadata.isDone !== undefined) {
			this.isArchived.set(metadata.isDone, undefined);
		}
	}
}

/**
 * Sessions provider for a remote agent host connection.
 * One instance is created per connection and handles all agents on it.
 *
 * Fully implements {@link ISessionsProvider}:
 * - Session listing via {@link IAgentConnection.listSessions} with incremental updates
 * - Session creation and initial request sending via {@link IChatService}
 * - Session actions (delete, rename, etc.) where supported by the protocol
 *
 * **URI/ID scheme:**
 * - **rawId** - unique session identifier (e.g. `abc123`), used as the cache key.
 * - **resource** - `{sessionType}:///{rawId}` (e.g. `remote-host__4321-copilot:///abc123`).
 *   The scheme routes the chat service to the correct {@link AgentHostSessionHandler}.
 * - **sessionId** - `{providerId}:{resource}` - the provider-scoped ID used by
 *   {@link ISessionsProvider} methods. The rawId can be extracted from the resource path.
 * - Protocol operations (e.g. `disposeSession`) use the canonical agent session URI
 *   (`copilot:///abc123`), reconstructed via {@link AgentSession.uri}.
 */
export class RemoteAgentHostSessionsProvider extends Disposable implements ISessionsProvider {

	readonly id: string;
	readonly label: string;
	readonly icon: ThemeIcon = Codicon.remote;
	readonly sessionTypes: readonly ISessionType[];
	readonly capabilities = { multipleChatsPerSession: false };
	readonly remoteAddress: string;
	private _outputChannelId: string | undefined;
	get outputChannelId(): string | undefined { return this._outputChannelId; }

	private readonly _connectionStatus = observableValue<RemoteAgentHostConnectionStatus>('connectionStatus', RemoteAgentHostConnectionStatus.Disconnected);
	readonly connectionStatus: IObservable<RemoteAgentHostConnectionStatus> = this._connectionStatus;

	private readonly _onDidChangeSessions = this._register(new Emitter<ISessionChangeEvent>());
	readonly onDidChangeSessions: Event<ISessionChangeEvent> = this._onDidChangeSessions.event;

	private readonly _onDidReplaceSession = this._register(new Emitter<{ readonly from: ISession; readonly to: ISession }>());
	readonly onDidReplaceSession: Event<{ readonly from: ISession; readonly to: ISession }> = this._onDidReplaceSession.event;

	readonly browseActions: readonly ISessionWorkspaceBrowseAction[];

	/** Cache of adapted sessions, keyed by raw session ID. */
	private readonly _sessionCache = new Map<string, RemoteSessionAdapter>();

	/**
	 * Temporary session that has been sent (first turn dispatched) but not yet
	 * committed to a real backend session. Shown in the session list until the
	 * server creates the backend session, at which point it is replaced via
	 * {@link _onDidReplaceSession}.
	 */
	private _pendingSession: ISession | undefined;

	/** Selected model for the current new session. */
	private _selectedModelId: string | undefined;
	/** Settable status for the current new session, kept to avoid unsafe cast from IObservable. */
	private _currentNewSessionStatus: ISettableObservable<SessionStatus> | undefined;

	private _connection: IAgentConnection | undefined;
	private _defaultDirectory: string | undefined;
	private readonly _connectionListeners = this._register(new DisposableStore());
	private readonly _onDidDisconnect = this._register(new Emitter<void>());
	private readonly _connectionAuthority: string;
	private readonly _connectOnDemand: (() => Promise<void>) | undefined;

	constructor(
		config: IRemoteAgentHostSessionsProviderConfig,
		@IFileDialogService private readonly _fileDialogService: IFileDialogService,
		@IChatSessionsService private readonly _chatSessionsService: IChatSessionsService,
		@IChatService private readonly _chatService: IChatService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@INotificationService private readonly _notificationService: INotificationService,
	) {
		super();

		this._connectionAuthority = agentHostAuthority(config.address);
		this._connectOnDemand = config.connectOnDemand;
		const displayName = config.name || config.address;

		this.id = `agenthost-${this._connectionAuthority}`;
		this.label = displayName;
		this.remoteAddress = config.address;

		this.sessionTypes = [CopilotCLISessionType];

		this.browseActions = [{
			label: localize('folders', "Folders"),
			// label: localize('browseRemote', "Browse Folders ({0})...", displayName),
			icon: Codicon.remote,
			providerId: this.id,
			run: () => this._browseForFolder(),
		}];
	}

	/**
	 * Update the connection status for this provider.
	 * Called by the contribution when connection state changes.
	 */
	setConnectionStatus(status: RemoteAgentHostConnectionStatus): void {
		this._connectionStatus.set(status, undefined);
	}

	/**
	 * Set the output channel ID for this provider's IPC log.
	 */
	setOutputChannelId(id: string): void {
		this._outputChannelId = id;
	}

	// -- Connection Management --

	/**
	 * Wire a live connection to this provider, enabling session operations and folder browsing.
	 */
	setConnection(connection: IAgentConnection, defaultDirectory?: string): void {
		if (this._connection === connection && this._defaultDirectory === defaultDirectory) {
			return;
		}

		this._connectionListeners.clear();
		this._connection = connection;
		this._defaultDirectory = defaultDirectory;

		this._connectionListeners.add(connection.onDidNotification(n => {
			if (n.type === 'notify/sessionAdded') {
				this._handleSessionAdded(n.summary);
			} else if (n.type === 'notify/sessionRemoved') {
				this._handleSessionRemoved(n.session);
			}
		}));

		// Handle session state changes from the server
		this._connectionListeners.add(this._connection.onDidAction(e => {
			if (e.action.type === ActionType.SessionTurnComplete && isSessionAction(e.action)) {
				const cts = new CancellationTokenSource();
				this._refreshSessions(cts.token).finally(() => cts.dispose());
			} else if (e.action.type === ActionType.SessionTitleChanged && isSessionAction(e.action)) {
				this._handleTitleChanged(e.action.session, e.action.title);
			} else if (e.action.type === ActionType.SessionIsReadChanged && isSessionAction(e.action)) {
				this._handleIsReadChanged(e.action.session, e.action.isRead);
			} else if (e.action.type === ActionType.SessionIsDoneChanged && isSessionAction(e.action)) {
				this._handleIsDoneChanged(e.action.session, e.action.isDone);
			}
		}));

		// Always refresh sessions when a connection is (re)established
		const cts = new CancellationTokenSource();
		this._cacheInitialized = true;
		this._refreshSessions(cts.token).finally(() => cts.dispose());
	}

	/**
	 * Clear the connection, e.g. when the remote host disconnects.
	 * Retains the provider registration so it remains visible in the UI.
	 */
	clearConnection(): void {
		this._connectionListeners.clear();
		this._onDidDisconnect.fire();
		this._connection = undefined;
		this._defaultDirectory = undefined;

		const removed: ISession[] = Array.from(this._sessionCache.values()).map(cached => this._chatToSession(cached));
		if (this._pendingSession) {
			removed.push(this._pendingSession);
			this._pendingSession = undefined;
		}
		this._sessionCache.clear();
		this._cacheInitialized = false;
		if (removed.length > 0) {
			this._onDidChangeSessions.fire({ added: [], removed, changed: [] });
		}
	}

	// -- Workspaces --

	/**
	 * Builds workspace metadata from a working directory path on the remote host.
	 */
	static buildWorkspace(workingDirectory: URI, providerLabel: string, _connectionAuthority: string): ISessionWorkspace {
		const folderName = basename(workingDirectory) || workingDirectory.path;
		return {
			label: `${folderName} [${providerLabel}]`,
			icon: Codicon.remote,
			repositories: [{ uri: workingDirectory, workingDirectory: undefined, detail: providerLabel, baseBranchName: undefined, baseBranchProtected: undefined }],
			requiresWorkspaceTrust: false,
		};
	}

	private _buildWorkspaceFromUri(uri: URI): ISessionWorkspace {
		const folderName = basename(uri) || uri.path;
		return {
			label: `${folderName} [${this.label}]`,
			icon: Codicon.remote,
			repositories: [{ uri, workingDirectory: undefined, detail: this.label, baseBranchName: undefined, baseBranchProtected: undefined }],
			requiresWorkspaceTrust: true,
		};
	}

	resolveWorkspace(repositoryUri: URI): ISessionWorkspace {
		return this._buildWorkspaceFromUri(repositoryUri);
	}

	// -- Sessions --

	getSessionTypes(_sessionId: string): ISessionType[] {
		return [...this.sessionTypes];
	}

	getSessions(): ISession[] {
		this._ensureSessionCache();
		const sessions: ISession[] = Array.from(this._sessionCache.values()).map(cached => this._chatToSession(cached));
		if (this._pendingSession) {
			sessions.push(this._pendingSession);
		}
		return sessions;
	}

	// -- Session Lifecycle --

	private _currentNewSession: IChatData | undefined;

	createNewSession(workspace: ISessionWorkspace): ISession {
		if (!this._connection) {
			throw new Error(localize('notConnectedSession', "Cannot create session: not connected to remote agent host '{0}'.", this.label));
		}

		const workspaceUri = workspace.repositories[0]?.uri;
		if (!workspaceUri) {
			throw new Error('Workspace has no repository URI');
		}

		// Reset draft state from any prior unsent session
		this._currentNewSession = undefined;
		this._selectedModelId = undefined;

		const resource = URI.from({ scheme: this._sessionTypeForProvider('copilot'), path: `/untitled-${generateUuid()}` });
		const status = observableValue<SessionStatus>(this, SessionStatus.Untitled);
		const session: IChatData = {
			id: `${this.id}:${resource.toString()}`,
			resource,
			providerId: this.id,
			sessionType: this.sessionTypes[0].id,
			icon: Codicon.remote,
			createdAt: new Date(),
			workspace: observableValue(this, workspace),
			title: observableValue(this, ''),
			updatedAt: observableValue(this, new Date()),
			status,
			changes: observableValue<readonly IChatSessionFileChange[]>(this, []),
			modelId: observableValue(this, undefined),
			mode: observableValue(this, undefined),
			loading: observableValue(this, false),
			isArchived: observableValue(this, false),
			isRead: observableValue(this, true),
			description: observableValue(this, undefined),
			lastTurnEnd: observableValue(this, undefined),
			gitHubInfo: observableValue(this, undefined),
		};
		this._currentNewSession = session;
		this._currentNewSessionStatus = status;
		return this._chatToSession(session);
	}

	setSessionType(_sessionId: string, _type: ISessionType): ISession {
		throw new Error('Remote agent host sessions do not support changing session type');
	}

	setModel(sessionId: string, modelId: string): void {
		if (this._currentNewSession?.id === sessionId) {
			this._selectedModelId = modelId;
		}
	}

	// -- Session Actions --

	async archiveSession(sessionId: string): Promise<void> {
		const rawId = this._rawIdFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		if (cached && rawId) {
			cached.isArchived.set(true, undefined);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._chatToSession(cached)] });
			if (this._connection) {
				const action = { type: ActionType.SessionIsDoneChanged as const, session: AgentSession.uri(cached.agentProvider, rawId).toString(), isDone: true };
				this._connection.dispatch(action);
			}
		}
	}

	async unarchiveSession(sessionId: string): Promise<void> {
		const rawId = this._rawIdFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		if (cached && rawId) {
			cached.isArchived.set(false, undefined);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._chatToSession(cached)] });
			if (this._connection) {
				const action = { type: ActionType.SessionIsDoneChanged as const, session: AgentSession.uri(cached.agentProvider, rawId).toString(), isDone: false };
				this._connection.dispatch(action);
			}
		}
	}

	async deleteSession(sessionId: string): Promise<void> {
		const rawId = this._rawIdFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		if (cached && rawId && this._connection) {
			await this._connection.disposeSession(AgentSession.uri(cached.agentProvider, rawId));
			this._sessionCache.delete(rawId);
			this._onDidChangeSessions.fire({ added: [], removed: [this._chatToSession(cached)], changed: [] });
		}
	}

	async renameChat(sessionId: string, _chatUri: URI, _title: string): Promise<void> {
		const rawId = this._rawIdFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		if (cached && rawId && this._connection) {
			cached.title.set(_title, undefined);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._chatToSession(cached)] });
			const action = { type: ActionType.SessionTitleChanged as const, session: AgentSession.uri(cached.agentProvider, rawId).toString(), title: _title };
			this._connection.dispatch(action);
		}
	}

	async deleteChat(_sessionId: string, _chatUri: URI): Promise<void> {
		// Agent host sessions don't support deleting individual chats
	}

	setRead(sessionId: string, read: boolean): void {
		const rawId = this._rawIdFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		if (cached) {
			cached.isRead.set(read, undefined);
			if (this._connection && rawId) {
				const action = { type: ActionType.SessionIsReadChanged as const, session: AgentSession.uri(cached.agentProvider, rawId).toString(), isRead: read };
				this._connection.dispatch(action);
			}
		}
	}

	async sendAndCreateChat(chatId: string, options: ISendRequestOptions): Promise<ISession> {
		if (!this._connection) {
			throw new Error(localize('notConnectedSend', "Cannot send request: not connected to remote agent host '{0}'.", this.label));
		}

		const session = this._currentNewSession;
		if (!session || session.id !== chatId) {
			throw new Error(`Session '${chatId}' not found or not a new session`);
		}

		const { query, attachedContext } = options;

		const contribution = this._chatSessionsService.getChatSessionContribution(this._sessionTypeForProvider('copilot'));

		const sendOptions: IChatSendRequestOptions = {
			location: ChatAgentLocation.Chat,
			userSelectedModelId: this._selectedModelId,
			modeInfo: {
				kind: ChatModeKind.Agent,
				isBuiltin: true,
				modeInstructions: undefined,
				modeId: 'agent',
				applyCodeBlockSuggestionId: undefined,
				permissionLevel: undefined,
			},
			agentIdSilent: contribution?.type,
			attachedContext,
		};

		// Open chat widget
		await this._chatSessionsService.getOrCreateChatSession(session.resource, CancellationToken.None);
		const chatWidget = await this._chatWidgetService.openSession(session.resource, ChatViewPaneTarget);
		if (!chatWidget) {
			throw new Error('[RemoteAgentHost] Failed to open chat widget');
		}

		// Load session model and apply selected model
		const modelRef = await this._chatService.acquireOrLoadSession(session.resource, ChatAgentLocation.Chat, CancellationToken.None);
		if (modelRef) {
			if (this._selectedModelId) {
				const languageModel = this._languageModelsService.lookupLanguageModel(this._selectedModelId);
				if (languageModel) {
					modelRef.object.inputModel.setState({ selectedModel: { identifier: this._selectedModelId, metadata: languageModel } });
				}
			}
			modelRef.dispose();
		}

		// Capture existing session keys before sending so we can detect the new
		// backend session. Must be captured before sendRequest because the
		// backend session may be created during the send and arrive via
		// notification before sendRequest resolves.
		const existingKeys = new Set(this._sessionCache.keys());

		// Send request through the chat service, which delegates to the
		// AgentHostSessionHandler content provider for turn handling
		const result = await this._chatService.sendRequest(session.resource, query, sendOptions);
		if (result.kind === 'rejected') {
			throw new Error(`[RemoteAgentHost] sendRequest rejected: ${result.reason}`);
		}

		// Add the untitled session to the pending set so it stays visible in the
		// session list while the turn is in progress. It will be replaced
		// by the committed session once the backend session appears.
		this._currentNewSessionStatus?.set(SessionStatus.InProgress, undefined);
		const newSession = this._chatToSession(session);
		this._pendingSession = newSession;
		this._onDidChangeSessions.fire({ added: [newSession], removed: [], changed: [] });

		this._selectedModelId = undefined;
		this._currentNewSessionStatus = undefined;

		// Wait for the real backend session to appear (via server notification
		// after the handler creates it), then replace the temporary entry.
		try {
			const committedSession = await this._waitForNewSession(existingKeys);
			if (committedSession) {
				this._currentNewSession = undefined;
				this._onDidReplaceSession.fire({ from: newSession, to: committedSession });
				return committedSession;
			}
		} catch {
			// Connection lost or timeout — clean up
		} finally {
			this._pendingSession = undefined;
		}

		// Fallback: keep the temp session visible
		this._currentNewSession = undefined;
		return newSession;
	}

	// -- Private: Session Cache --

	private _cacheInitialized = false;

	private _ensureSessionCache(): void {
		if (this._cacheInitialized) {
			return;
		}
		this._cacheInitialized = true;
		const cts = new CancellationTokenSource();
		this._refreshSessions(cts.token).finally(() => cts.dispose());
	}

	private async _refreshSessions(_token: unknown): Promise<void> {
		if (!this._connection) {
			return;
		}
		try {
			const sessions = await this._connection.listSessions();
			const currentKeys = new Set<string>();
			const added: ISession[] = [];
			const changed: ISession[] = [];

			for (const meta of sessions) {
				const rawId = AgentSession.id(meta.session);
				const provider = AgentSession.provider(meta.session) ?? 'copilot';
				currentKeys.add(rawId);

				const existing = this._sessionCache.get(rawId);
				if (existing) {
					existing.update(meta);
					changed.push(this._chatToSession(existing));
				} else {
					const cached = new RemoteSessionAdapter(meta, this.id, this._sessionTypeForProvider(provider), this.sessionTypes[0].id, this.label, this._connectionAuthority);
					this._sessionCache.set(rawId, cached);
					added.push(this._chatToSession(cached));
				}
			}

			const removed: ISession[] = [];
			for (const [key, cached] of this._sessionCache) {
				if (!currentKeys.has(key)) {
					this._sessionCache.delete(key);
					removed.push(this._chatToSession(cached));
				}
			}

			if (added.length > 0 || removed.length > 0 || changed.length > 0) {
				this._onDidChangeSessions.fire({ added, removed, changed });
			}
		} catch {
			// Connection may not be ready yet
		}
	}

	/**
	 * Wait for a new session to appear in the cache that wasn't present before.
	 * Tries an immediate refresh, then listens for the session-added notification.
	 * Returns `undefined` if the connection is lost or a timeout expires.
	 */
	private async _waitForNewSession(existingKeys: Set<string>): Promise<ISession | undefined> {
		// First, try an immediate refresh
		await this._refreshSessions(CancellationToken.None);
		for (const [key, cached] of this._sessionCache) {
			if (!existingKeys.has(key)) {
				return this._chatToSession(cached);
			}
		}

		// If not found yet, wait for the next onDidChangeSessions event,
		// bounded by a timeout and aborted on disconnect.
		const waitDisposables = new DisposableStore();
		try {
			const sessionPromise = new Promise<ISession | undefined>((resolve) => {
				waitDisposables.add(this._onDidChangeSessions.event(e => {
					const newSession = e.added.find(s => {
						const rawId = s.resource.path.substring(1);
						return !existingKeys.has(rawId);
					});
					if (newSession) {
						resolve(newSession);
					}
				}));
				waitDisposables.add(this._onDidDisconnect.event(() => resolve(undefined)));
			});
			return await raceTimeout(sessionPromise, 30_000);
		} finally {
			waitDisposables.dispose();
		}
	}

	private _handleSessionAdded(summary: { resource: string; provider: string; title: string; createdAt: number; modifiedAt: number; workingDirectory?: string; isRead?: boolean; isDone?: boolean }): void {
		const sessionUri = URI.parse(summary.resource);
		const rawId = AgentSession.id(sessionUri);
		if (this._sessionCache.has(rawId)) {
			return;
		}

		const provider = AgentSession.provider(sessionUri) ?? 'copilot';
		const workingDir = typeof summary.workingDirectory === 'string'
			? toAgentHostUri(URI.parse(summary.workingDirectory), this._connectionAuthority)
			: undefined;
		const meta: IAgentSessionMetadata = {
			session: sessionUri,
			startTime: summary.createdAt,
			modifiedTime: summary.modifiedAt,
			summary: summary.title,
			workingDirectory: workingDir,
			isRead: summary.isRead,
			isDone: summary.isDone,
		};
		const cached = new RemoteSessionAdapter(meta, this.id, this._sessionTypeForProvider(provider), this.sessionTypes[0].id, this.label, this._connectionAuthority);
		this._sessionCache.set(rawId, cached);
		this._onDidChangeSessions.fire({ added: [this._chatToSession(cached)], removed: [], changed: [] });
	}

	private _handleSessionRemoved(session: URI | string): void {
		const rawId = AgentSession.id(session);
		const cached = this._sessionCache.get(rawId);
		if (cached) {
			this._sessionCache.delete(rawId);
			this._onDidChangeSessions.fire({ added: [], removed: [this._chatToSession(cached)], changed: [] });
		}
	}

	private _handleTitleChanged(session: string, title: string): void {
		const rawId = AgentSession.id(session);
		const cached = this._sessionCache.get(rawId);
		if (cached) {
			cached.title.set(title, undefined);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._chatToSession(cached)] });
		}
	}

	private _handleIsReadChanged(session: string, isRead: boolean): void {
		const rawId = AgentSession.id(session);
		const cached = this._sessionCache.get(rawId);
		if (cached) {
			cached.isRead.set(isRead, undefined);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._chatToSession(cached)] });
		}
	}

	private _handleIsDoneChanged(session: string, isDone: boolean): void {
		const rawId = AgentSession.id(session);
		const cached = this._sessionCache.get(rawId);
		if (cached) {
			cached.isArchived.set(isDone, undefined);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._chatToSession(cached)] });
		}
	}

	private _rawIdFromChatId(chatId: string): string | undefined {
		const prefix = `${this.id}:`;
		const resourceStr = chatId.startsWith(prefix) ? chatId.substring(prefix.length) : chatId;
		try {
			return URI.parse(resourceStr).path.substring(1) || undefined;
		} catch {
			return undefined;
		}
	}

	private _sessionTypeForProvider(provider: string): string {
		return `remote-${this._connectionAuthority}-${provider}`;
	}

	// -- Private: Browse --

	private async _browseForFolder(): Promise<ISessionWorkspace | undefined> {
		// Establish connection on demand if a hook is provided (e.g. tunnel relay)
		if (!this._connection && this._connectOnDemand) {
			await this._connectOnDemand();
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

	private _chatToSession(chat: IChatData): ISession {
		const mainChat: IChat = {
			resource: chat.resource,
			createdAt: chat.createdAt,
			title: chat.title,
			updatedAt: chat.updatedAt,
			status: chat.status,
			changes: chat.changes,
			modelId: chat.modelId,
			mode: chat.mode,
			isArchived: chat.isArchived,
			isRead: chat.isRead,
			description: chat.description,
			lastTurnEnd: chat.lastTurnEnd,
		};
		const session: ISession = {
			sessionId: chat.id,
			resource: chat.resource,
			providerId: chat.providerId,
			sessionType: chat.sessionType,
			icon: chat.icon,
			createdAt: chat.createdAt,
			workspace: chat.workspace,
			title: chat.title,
			updatedAt: chat.updatedAt,
			status: chat.status,
			changes: chat.changes,
			modelId: chat.modelId,
			mode: chat.mode,
			loading: chat.loading,
			isArchived: chat.isArchived,
			isRead: chat.isRead,
			description: chat.description,
			lastTurnEnd: chat.lastTurnEnd,
			gitHubInfo: chat.gitHubInfo,
			chats: constObservable([mainChat]),
			mainChat,
		};
		return session;
	}
}
