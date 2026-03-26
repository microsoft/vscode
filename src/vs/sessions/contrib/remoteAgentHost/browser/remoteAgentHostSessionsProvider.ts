/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IObservable, observableValue, transaction } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ISessionData, ISessionWorkspace, SessionStatus } from '../../sessions/common/sessionData.js';
import { ISendRequestOptions, ISessionsBrowseAction, ISessionsChangeEvent, ISessionsProvider, ISessionType } from '../../sessions/browser/sessionsProvider.js';
import { IChatSessionFileChange, IChatSessionsService } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { agentHostUri } from '../../../../platform/agentHost/common/agentHostFileSystemProvider.js';
import { AGENT_HOST_SCHEME, agentHostAuthority, toAgentHostUri } from '../../../../platform/agentHost/common/agentHostUri.js';
import { AgentSessionProviders } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { AgentSession, type IAgentConnection, type IAgentSessionMetadata } from '../../../../platform/agentHost/common/agentService.js';
import { isSessionAction } from '../../../../platform/agentHost/common/state/sessionActions.js';
import type { ISessionSummary } from '../../../../platform/agentHost/common/state/sessionState.js';
import { ChatAgentLocation, ChatModeKind } from '../../../../workbench/contrib/chat/common/constants.js';
import { IChatService, IChatSendRequestOptions } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';

export interface IRemoteAgentHostSessionsProviderConfig {
	readonly address: string;
	readonly connectionName: string | undefined;
	readonly defaultDirectory: string | undefined;
	readonly connection: IAgentConnection;
}

const CopilotCLISessionType: ISessionType = {
	id: AgentSessionProviders.AgentHostCopilot,
	label: localize('copilotCLI', "Copilot"),
	icon: Codicon.copilot,
	requiresWorkspaceTrust: true,
};

/**
 * Adapts an {@link IAgentSessionMetadata} from the agent host connection
 * into the {@link ISessionData} facade.
 */
class RemoteSessionAdapter implements ISessionData {

	readonly sessionId: string;
	readonly resource: URI;
	readonly providerId: string;
	readonly sessionType: string;
	readonly icon: ThemeIcon;
	readonly createdAt: Date;

	private readonly _workspace: ReturnType<typeof observableValue<ISessionWorkspace | undefined>>;
	readonly workspace: IObservable<ISessionWorkspace | undefined>;

	private readonly _title: ReturnType<typeof observableValue<string>>;
	readonly title: IObservable<string>;

	private readonly _updatedAt: ReturnType<typeof observableValue<Date>>;
	readonly updatedAt: IObservable<Date>;

	private readonly _status: ReturnType<typeof observableValue<SessionStatus>>;
	readonly status: IObservable<SessionStatus>;

	private readonly _changes: ReturnType<typeof observableValue<readonly IChatSessionFileChange[]>>;
	readonly changes: IObservable<readonly IChatSessionFileChange[]>;

	readonly modelId: IObservable<string | undefined>;
	readonly mode: IObservable<{ readonly id: string; readonly kind: string } | undefined>;
	readonly loading: IObservable<boolean>;

	private readonly _isArchived: ReturnType<typeof observableValue<boolean>>;
	readonly isArchived: IObservable<boolean>;

	private readonly _isRead: ReturnType<typeof observableValue<boolean>>;
	readonly isRead: IObservable<boolean>;

	readonly description: IObservable<string | undefined>;
	readonly lastTurnEnd: IObservable<Date | undefined>;
	readonly pullRequestUri: IObservable<URI | undefined>;

	/** Backend agent session URI for protocol operations (e.g. disposeSession). */
	readonly backendSessionUri: URI;

	constructor(
		metadata: IAgentSessionMetadata,
		providerId: string,
		resourceScheme: string,
		logicalSessionType: string,
		providerLabel: string,
		connectionAuthority: string,
	) {
		const rawId = AgentSession.id(metadata.session);
		this.resource = URI.from({ scheme: resourceScheme, path: `/${rawId}` });
		this.backendSessionUri = AgentSession.uri(AgentSession.provider(metadata.session) ?? 'copilot', rawId);
		this.sessionId = `${providerId}:${this.resource.toString()}`;
		this.providerId = providerId;
		this.sessionType = logicalSessionType;
		this.icon = Codicon.remote;
		this.createdAt = new Date(metadata.startTime);

		// Build workspace from working directory if available
		const workspaceData = metadata.workingDirectory
			? this._buildWorkspace(metadata.workingDirectory, providerLabel, connectionAuthority)
			: undefined;

		this._workspace = observableValue(this, workspaceData);
		this.workspace = this._workspace;

		this._title = observableValue(this, metadata.summary ?? `Session ${rawId.substring(0, 8)}`);
		this.title = this._title;

		this._updatedAt = observableValue(this, new Date(metadata.modifiedTime));
		this.updatedAt = this._updatedAt;

		this._status = observableValue(this, SessionStatus.Completed);
		this.status = this._status;

		this._changes = observableValue<readonly IChatSessionFileChange[]>(this, []);
		this.changes = this._changes;

		this.modelId = observableValue(this, undefined);
		this.mode = observableValue(this, undefined);
		this.loading = observableValue(this, false);

		this._isArchived = observableValue(this, false);
		this.isArchived = this._isArchived;
		this._isRead = observableValue(this, true);
		this.isRead = this._isRead;

		this.description = observableValue(this, providerLabel);
		this.lastTurnEnd = observableValue(this, metadata.modifiedTime ? new Date(metadata.modifiedTime) : undefined);
		this.pullRequestUri = observableValue(this, undefined);
	}

	/**
	 * Update reactive properties from refreshed metadata.
	 */
	update(metadata: IAgentSessionMetadata): void {
		transaction(tx => {
			this._title.set(metadata.summary ?? this._title.get(), tx);
			this._updatedAt.set(new Date(metadata.modifiedTime), tx);
		});
	}

	private _buildWorkspace(workingDirectory: string, providerLabel: string, connectionAuthority: string): ISessionWorkspace {
		const label = workingDirectory.split('/').pop() || workingDirectory;
		const uri = toAgentHostUri(URI.file(workingDirectory), connectionAuthority);
		return {
			label,
			icon: Codicon.remote,
			repositories: [{ uri, workingDirectory: undefined, detail: providerLabel, baseBranchProtected: undefined }],
		};
	}
}

/**
 * A sessions provider for a single agent on a remote agent host connection.
 * One instance is created per agent discovered on a connection.
 *
 * Fully implements {@link ISessionsProvider}:
 * - Session listing via {@link IAgentConnection.listSessions} with incremental updates
 * - Session creation and initial request sending via {@link IChatService}
 * - Session actions (delete, rename, etc.) where supported by the protocol
 */
export class RemoteAgentHostSessionsProvider extends Disposable implements ISessionsProvider {

	readonly id: string;
	readonly label: string;
	readonly icon: ThemeIcon = Codicon.remote;
	readonly sessionTypes: readonly ISessionType[];

	private readonly _onDidChangeSessions = this._register(new Emitter<ISessionsChangeEvent>());
	readonly onDidChangeSessions: Event<ISessionsChangeEvent> = this._onDidChangeSessions.event;

	readonly browseActions: readonly ISessionsBrowseAction[];

	/** Cache of adapted sessions, keyed by raw session ID. */
	private readonly _sessionCache = new Map<string, RemoteSessionAdapter>();

	/** Selected model for the current new session. */
	private _selectedModelId: string | undefined;

	private readonly _address: string;
	private readonly _defaultDirectory: string | undefined;
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

		this._address = config.address;
		this._defaultDirectory = config.defaultDirectory;
		this._connection = config.connection;
		this._connectionAuthority = agentHostAuthority(config.address);
		const displayName = config.connectionName || config.address;

		this.id = `agenthost-${this._connectionAuthority}`;
		this.label = displayName;

		this.sessionTypes = [CopilotCLISessionType];

		this.browseActions = [{
			label: localize('browseRemote', "Browse Folders ({0})...", displayName),
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

	resolveWorkspace(repositoryUri: URI): ISessionWorkspace {
		return {
			label: repositoryUri.path.split('/').pop() || repositoryUri.path,
			icon: Codicon.remote,
			repositories: [{ uri: repositoryUri, workingDirectory: undefined, detail: this.label, baseBranchProtected: undefined }],
		};
	}

	// -- Sessions --

	getSessionTypes(_session: ISessionData): ISessionType[] {
		return [...this.sessionTypes];
	}

	getSessions(): ISessionData[] {
		this._ensureSessionCache();
		return Array.from(this._sessionCache.values());
	}

	// -- Session Lifecycle --

	private _currentNewSession: ISessionData | undefined;

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
			sessionId: `${this.id}:${resource.toString()}`,
			resource,
			providerId: this.id,
			sessionType: this.sessionTypes[0].id,
			icon: Codicon.remote,
			createdAt: new Date(),
			workspace: observableValue(this, {
				label: workspaceUri.path.split('/').pop() || workspaceUri.path,
				icon: Codicon.remote,
				repositories: [{ uri: workspaceUri, workingDirectory: undefined, detail: this.label, baseBranchProtected: undefined }],
			}),
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
			pullRequestUri: observableValue(this, undefined),
		};
		this._currentNewSession = session;
		return session;
	}

	setSessionType(_sessionId: string, _type: ISessionType): ISessionData {
		throw new Error('Remote agent host sessions do not support changing session type');
	}

	setModel(sessionId: string, modelId: string): void {
		if (this._currentNewSession?.sessionId === sessionId) {
			this._selectedModelId = modelId;
		}
	}

	// -- Session Actions --

	async archiveSession(_sessionId: string): Promise<void> {
		// Agent host protocol does not support archiving
	}

	async unarchiveSession(_sessionId: string): Promise<void> {
		// Agent host protocol does not support unarchiving
	}

	async deleteSession(sessionId: string): Promise<void> {
		const adapter = this._findAdapter(sessionId);
		if (adapter) {
			// Use the backend agent session URI, not the UI resource
			await this._connection.disposeSession(adapter.backendSessionUri);
			const rawId = adapter.resource.path.substring(1);
			this._sessionCache.delete(rawId);
			this._onDidChangeSessions.fire({ added: [], removed: [adapter], changed: [] });
		}
	}

	async renameSession(_sessionId: string, _title: string): Promise<void> {
		// Agent host protocol does not support renaming
	}

	setRead(sessionId: string, read: boolean): void {
		const adapter = this._findAdapter(sessionId);
		if (adapter) {
			// Track read state locally since the protocol doesn't support it
			(adapter.isRead as ReturnType<typeof observableValue<boolean>>).set(read, undefined);
		}
	}

	// -- Send --

	async sendRequest(sessionId: string, options: ISendRequestOptions): Promise<ISessionData> {
		const session = this._currentNewSession;
		if (!session || session.sessionId !== sessionId) {
			throw new Error(`Session '${sessionId}' not found or not a new session`);
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

	private async _refreshSessions(_token: CancellationToken): Promise<void> {
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
					const adapter = new RemoteSessionAdapter(meta, this.id, this._sessionTypeForProvider(provider), this.sessionTypes[0].id, this.label, this._connectionAuthority);
					this._sessionCache.set(rawId, adapter);
					added.push(adapter);
				}
			}

			const removed: ISessionData[] = [];
			for (const [key, adapter] of this._sessionCache) {
				if (!currentKeys.has(key)) {
					this._sessionCache.delete(key);
					removed.push(adapter);
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
		for (const [key, adapter] of this._sessionCache) {
			if (!existingKeys.has(key)) {
				return adapter;
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

	private _handleSessionAdded(summary: ISessionSummary): void {
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
		const adapter = new RemoteSessionAdapter(meta, this.id, this._sessionTypeForProvider(provider), this.sessionTypes[0].id, this.label, this._connectionAuthority);
		this._sessionCache.set(rawId, adapter);
		this._onDidChangeSessions.fire({ added: [adapter], removed: [], changed: [] });
	}

	private _handleSessionRemoved(session: URI | string): void {
		const rawId = AgentSession.id(session);
		const adapter = this._sessionCache.get(rawId);
		if (adapter) {
			this._sessionCache.delete(rawId);
			this._onDidChangeSessions.fire({ added: [], removed: [adapter], changed: [] });
		}
	}

	private _findAdapter(sessionId: string): RemoteSessionAdapter | undefined {
		const prefix = `${this.id}:`;
		const localId = sessionId.startsWith(prefix) ? sessionId.substring(prefix.length) : sessionId;
		for (const adapter of this._sessionCache.values()) {
			if (adapter.sessionId === sessionId || adapter.resource.toString() === localId) {
				return adapter;
			}
		}
		return undefined;
	}

	/**
	 * Builds the chat session type string for a given agent provider on this connection.
	 * E.g. `remote-localhost_4321-copilot` for provider `copilot` on `localhost:4321`.
	 */
	private _sessionTypeForProvider(provider: string): string {
		return `remote-${this._connectionAuthority}-${provider}`;
	}

	// -- Private: Browse --

	private async _browseForFolder(): Promise<ISessionWorkspace | undefined> {
		const authority = agentHostAuthority(this._address);
		const defaultUri = agentHostUri(authority, this._defaultDirectory ?? '/');

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
				const uri = selected[0];
				const label = uri.path.split('/').pop() || uri.path;
				return {
					label,
					icon: Codicon.remote,
					repositories: [{ uri, workingDirectory: undefined, detail: this.label, baseBranchProtected: undefined }],
				};
			}
		} catch {
			// dialog was cancelled or failed
		}
		return undefined;
	}
}
