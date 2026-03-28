/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { basename } from '../../../../base/common/resources.js';
import { ISettableObservable, observableValue } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { agentHostUri } from '../../../../platform/agentHost/common/agentHostFileSystemProvider.js';
import { AGENT_HOST_SCHEME, agentHostAuthority, toAgentHostUri } from '../../../../platform/agentHost/common/agentHostUri.js';
import { AgentSession, type IAgentConnection, type IAgentSessionMetadata } from '../../../../platform/agentHost/common/agentService.js';
import { isSessionAction } from '../../../../platform/agentHost/common/state/sessionActions.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { IChatSendRequestOptions, IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionFileChange, IChatSessionsService } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ChatAgentLocation, ChatModeKind } from '../../../../workbench/contrib/chat/common/constants.js';
import { ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { ISessionChangeEvent, ISendRequestOptions, ISessionsBrowseAction, ISessionsProvider, ISessionType } from '../../sessions/browser/sessionsProvider.js';
import { CopilotCLISessionType } from '../../sessions/browser/sessionTypes.js';
import { ISessionData, ISessionPullRequest, ISessionWorkspace, SessionStatus } from '../../sessions/common/sessionData.js';
import { IRemoteAgentHostConnectionInfo } from '../../../../platform/agentHost/common/remoteAgentHostService.js';

export interface IRemoteAgentHostSessionsProviderConfig {
	readonly connectionInfo: IRemoteAgentHostConnectionInfo;
	readonly connection: IAgentConnection;
}

/**
 * Adapts agent host session metadata into the {@link ISessionData} facade.
 */
class RemoteSessionAdapter implements ISessionData {

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
	readonly description: ISettableObservable<string | undefined>;
	readonly lastTurnEnd: ISettableObservable<Date | undefined>;
	readonly pullRequest = observableValue<ISessionPullRequest | undefined>('pullRequest', undefined);

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
		this.description = observableValue('description', providerLabel);
		this.workspace = observableValue('workspace', metadata.workingDirectory
			? RemoteAgentHostSessionsProvider.buildWorkspace(metadata.workingDirectory, providerLabel, connectionAuthority)
			: undefined);
	}

	update(metadata: IAgentSessionMetadata): void {
		this.title.set(metadata.summary ?? this.title.get(), undefined);
		this.updatedAt.set(new Date(metadata.modifiedTime), undefined);
		this.lastTurnEnd.set(metadata.modifiedTime ? new Date(metadata.modifiedTime) : undefined, undefined);
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

	private readonly _onDidChangeSessions = this._register(new Emitter<ISessionChangeEvent>());
	readonly onDidChangeSessions: Event<ISessionChangeEvent> = this._onDidChangeSessions.event;

	readonly browseActions: readonly ISessionsBrowseAction[];

	/** Cache of adapted sessions, keyed by raw session ID. */
	private readonly _sessionCache = new Map<string, RemoteSessionAdapter>();

	/** Selected model for the current new session. */
	private _selectedModelId: string | undefined;

	private readonly _connectionInfo: IRemoteAgentHostConnectionInfo;
	private readonly _connection: IAgentConnection;
	private readonly _connectionAuthority: string;

	constructor(
		config: IRemoteAgentHostSessionsProviderConfig,
		@IFileDialogService private readonly _fileDialogService: IFileDialogService,
		@IChatSessionsService private readonly _chatSessionsService: IChatSessionsService,
		@IChatService private readonly _chatService: IChatService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
	) {
		super();

		this._connectionInfo = config.connectionInfo;
		this._connection = config.connection;
		this._connectionAuthority = agentHostAuthority(config.connectionInfo.address);
		const displayName = config.connectionInfo.name || config.connectionInfo.address;

		this.id = `agenthost-${this._connectionAuthority}`;
		this.label = displayName;

		this.sessionTypes = [CopilotCLISessionType];

		this.browseActions = [{
			label: localize('folders', "Folders"),
			// label: localize('browseRemote', "Browse Folders ({0})...", displayName),
			icon: Codicon.remote,
			providerId: this.id,
			execute: () => this._browseForFolder(),
		}];

		// Listen for session notifications from the connection
		this._register(this._connection.onDidNotification(n => {
			if (n.type === 'notify/sessionAdded') {
				this._handleSessionAdded(n.summary);
			} else if (n.type === 'notify/sessionRemoved') {
				this._handleSessionRemoved(n.session);
			}
		}));

		// Refresh on turnComplete actions for metadata updates (title, timing)
		this._register(this._connection.onDidAction(e => {
			if (e.action.type === 'session/turnComplete' && isSessionAction(e.action)) {
				const cts = new CancellationTokenSource();
				this._refreshSessions(cts.token).finally(() => cts.dispose());
			}
		}));
	}

	// -- Workspaces --

	/**
	 * Builds workspace metadata from a working directory path on the remote host.
	 */
	static buildWorkspace(workingDirectory: string, providerLabel: string, connectionAuthority: string): ISessionWorkspace {
		const directoryUri = URI.file(workingDirectory);
		const folderName = basename(directoryUri) || workingDirectory;
		const uri = toAgentHostUri(directoryUri, connectionAuthority);
		return {
			label: `${folderName} [${providerLabel}]`,
			icon: Codicon.remote,
			repositories: [{ uri, workingDirectory: undefined, detail: providerLabel, baseBranchName: undefined, baseBranchProtected: undefined }],
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

	getSessionTypes(_chat: ISessionData): ISessionType[] {
		return [...this.sessionTypes];
	}

	getSessions(): ISessionData[] {
		this._ensureSessionCache();
		return Array.from(this._sessionCache.values());
	}

	// -- Session Lifecycle --

	private _currentNewSession: ISessionData | undefined;

	getUntitledSession(): ISessionData | undefined {
		return this._currentNewSession;
	}

	createNewSession(workspace: ISessionWorkspace): ISessionData {
		const workspaceUri = workspace.repositories[0]?.uri;
		if (!workspaceUri) {
			throw new Error('Workspace has no repository URI');
		}

		// Reset draft state from any prior unsent session
		this._currentNewSession = undefined;
		this._selectedModelId = undefined;

		const resource = URI.from({ scheme: this._sessionTypeForProvider('copilot'), path: `/untitled-${generateUuid()}` });
		const session: ISessionData = {
			id: `${this.id}:${resource.toString()}`,
			resource,
			providerId: this.id,
			sessionType: this.sessionTypes[0].id,
			icon: Codicon.remote,
			createdAt: new Date(),
			workspace: observableValue(this, workspace),
			title: observableValue(this, ''),
			updatedAt: observableValue(this, new Date()),
			status: observableValue(this, SessionStatus.Untitled),
			changes: observableValue<readonly IChatSessionFileChange[]>(this, []),
			modelId: observableValue(this, undefined),
			mode: observableValue(this, undefined),
			loading: observableValue(this, false),
			isArchived: observableValue(this, false),
			isRead: observableValue(this, true),
			description: observableValue(this, undefined),
			lastTurnEnd: observableValue(this, undefined),
			pullRequest: observableValue(this, undefined),
		};
		this._currentNewSession = session;
		return session;
	}

	createNewSessionFrom(_chatId: string): ISessionData {
		throw new Error('Remote agent host sessions do not support forking');
	}

	setSessionType(_chatId: string, _type: ISessionType): ISessionData {
		throw new Error('Remote agent host sessions do not support changing session type');
	}

	setModel(chatId: string, modelId: string): void {
		if (this._currentNewSession?.id === chatId) {
			this._selectedModelId = modelId;
		}
	}

	// -- Session Actions --

	async archiveSession(_sessionId: string): Promise<void> {
		// Agent host sessions don't support archiving
	}

	async unarchiveSession(_sessionId: string): Promise<void> {
		// Agent host sessions don't support unarchiving
	}

	async deleteSession(chatId: string): Promise<void> {
		const rawId = this._rawIdFromChatId(chatId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		if (cached && rawId) {
			await this._connection.disposeSession(AgentSession.uri(cached.agentProvider, rawId));
			this._sessionCache.delete(rawId);
			this._onDidChangeSessions.fire({ added: [], removed: [cached], changed: [] });
		}
	}

	async renameSession(_sessionId: string, _title: string): Promise<void> {
		// Agent host sessions don't support renaming
	}

	setRead(chatId: string, read: boolean): void {
		const rawId = this._rawIdFromChatId(chatId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		if (cached) {
			cached.isRead.set(read, undefined);
		}
	}

	async sendRequest(chatId: string, options: ISendRequestOptions): Promise<ISessionData> {
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

		// Track existing sessions before sending so we can detect the new one
		const existingKeys = new Set(this._sessionCache.keys());

		// Send request through the chat service, which delegates to the
		// AgentHostSessionHandler content provider for turn handling
		const result = await this._chatService.sendRequest(session.resource, query, sendOptions);
		if (result.kind === 'rejected') {
			throw new Error(`[RemoteAgentHost] sendRequest rejected: ${result.reason}`);
		}

		// After sending, the session handler creates the backend session.
		this._currentNewSession = undefined;
		this._selectedModelId = undefined;

		// Wait for the new session to appear via notification or refresh
		const newSession = await this._waitForNewSession(existingKeys);
		return newSession ?? session;
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
		try {
			const sessions = await this._connection.listSessions();
			const currentKeys = new Set<string>();
			const added: ISessionData[] = [];
			const changed: ISessionData[] = [];

			for (const meta of sessions) {
				const rawId = AgentSession.id(meta.session);
				const provider = AgentSession.provider(meta.session) ?? 'copilot';
				currentKeys.add(rawId);

				const existing = this._sessionCache.get(rawId);
				if (existing) {
					existing.update(meta);
					changed.push(existing);
				} else {
					const cached = new RemoteSessionAdapter(meta, this.id, this._sessionTypeForProvider(provider), this.sessionTypes[0].id, this.label, this._connectionAuthority);
					this._sessionCache.set(rawId, cached);
					added.push(cached);
				}
			}

			const removed: ISessionData[] = [];
			for (const [key, cached] of this._sessionCache) {
				if (!currentKeys.has(key)) {
					this._sessionCache.delete(key);
					removed.push(cached);
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
	 */
	private async _waitForNewSession(existingKeys: Set<string>): Promise<ISessionData | undefined> {
		// First, try an immediate refresh
		await this._refreshSessions(CancellationToken.None);
		for (const [key, cached] of this._sessionCache) {
			if (!existingKeys.has(key)) {
				return cached;
			}
		}

		// If not found yet, wait for the next onDidChangeSessions event
		return new Promise<ISessionData | undefined>(resolve => {
			const listener = this._onDidChangeSessions.event(e => {
				const newSession = e.added.find(s => {
					const rawId = s.resource.path.substring(1);
					return !existingKeys.has(rawId);
				});
				if (newSession) {
					listener.dispose();
					resolve(newSession);
				}
			});
		});
	}

	private _handleSessionAdded(summary: { resource: string; provider: string; title: string; createdAt: number; modifiedAt: number; workingDirectory?: string }): void {
		const sessionUri = URI.parse(summary.resource);
		const rawId = AgentSession.id(sessionUri);
		if (this._sessionCache.has(rawId)) {
			return;
		}

		const provider = AgentSession.provider(sessionUri) ?? 'copilot';
		const workingDir = typeof summary.workingDirectory === 'string' ? summary.workingDirectory : undefined;
		const meta: IAgentSessionMetadata = {
			session: sessionUri,
			startTime: summary.createdAt,
			modifiedTime: summary.modifiedAt,
			summary: summary.title,
			workingDirectory: workingDir,
		};
		const cached = new RemoteSessionAdapter(meta, this.id, this._sessionTypeForProvider(provider), this.sessionTypes[0].id, this.label, this._connectionAuthority);
		this._sessionCache.set(rawId, cached);
		this._onDidChangeSessions.fire({ added: [cached], removed: [], changed: [] });
	}

	private _handleSessionRemoved(session: URI | string): void {
		const rawId = AgentSession.id(session);
		const cached = this._sessionCache.get(rawId);
		if (cached) {
			this._sessionCache.delete(rawId);
			this._onDidChangeSessions.fire({ added: [], removed: [cached], changed: [] });
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
		const authority = agentHostAuthority(this._connectionInfo.address);
		const defaultUri = agentHostUri(authority, this._connectionInfo.defaultDirectory ?? '/');

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
