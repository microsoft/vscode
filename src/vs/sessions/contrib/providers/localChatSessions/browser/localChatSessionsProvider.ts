/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { autorun, constObservable, IObservable, ISettableObservable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI, UriComponents } from '../../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatService, IChatSendRequestOptions, IChatDetail, convertLegacyChatSessionTiming } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionFileChange2, IChatSessionProviderOptionItem, SessionType } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ISession, IChat, ISessionGitRepository, ISessionFolder, ISessionWorkspace, SessionStatus, ISessionType, ISessionFileChange, toSessionId, SESSION_WORKSPACE_GROUP_LOCAL, IChatCheckpoints } from '../../../../services/sessions/common/session.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind, ChatPermissionLevel, isChatPermissionLevel } from '../../../../../workbench/contrib/chat/common/constants.js';
import { basename, dirname } from '../../../../../base/common/resources.js';
import { ISendRequestOptions, ISessionChangeEvent, ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { isBuiltinChatMode, IChatMode } from '../../../../../workbench/contrib/chat/common/chatModes.js';
import { IChatModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { IGitService } from '../../../../../workbench/contrib/git/common/gitService.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ILanguageModelsService } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { ILanguageModelToolsService } from '../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { createChangesets } from '../../copilotChatSessions/browser/copilotChatSessionsChangesets.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';

/** Local session type — in-process VS Code chat, no background agent or worktree. */
export const LocalSessionType: ISessionType = {
	id: 'local',
	label: localize('localSession', "Local"),
	icon: Codicon.vm,
};

/** Setting key controlling whether Local VS Code chat sessions are available in the Agents app. */
export const LOCAL_SESSION_ENABLED_SETTING = 'sessions.chat.localAgent.enabled';

const LOCAL_PROVIDER_ID = 'local-chat';
const STORAGE_KEY_SESSIONS = 'sessions.localChat.sessions';
const STORAGE_KEY_MIGRATED = 'sessions.localChat.migrated';

interface IStoredLocalSession {
	readonly uri: UriComponents;
	readonly title: string;
	readonly createdAt: number;
	readonly lastMessageDate: number;
	readonly workingDirectory: UriComponents;
	readonly archived?: boolean;
}

/**
 * Builds an {@link IChat} snapshot from a {@link LocalSession}.
 */
function buildChat(session: LocalSession): IChat {
	return {
		resource: session.resource,
		createdAt: session.createdAt,
		title: session.title,
		updatedAt: session.updatedAt,
		status: session.status,
		changes: session.changes,
		checkpoints: session.checkpoints,
		modelId: session.modelId,
		mode: session.mode,
		isArchived: session.isArchived,
		isRead: session.isRead,
		description: session.description,
		lastTurnEnd: session.lastTurnEnd,
	};
}

/**
 * A local chat session. Manages observable state and provides mutation
 * methods used by the provider.
 *
 * Constructed in two ways:
 * - **New session** (`detail` is `undefined`): creates a fresh chat model
 *   through {@link IChatService.startNewLocalSession} and resolves git state.
 * - **History session** (`detail` is provided): restores from a persisted
 *   {@link IChatDetail} without owning a chat model reference.
 */
class LocalSession extends Disposable {

	readonly resource: URI;
	readonly sessionId: string;
	readonly providerId: string;
	readonly sessionType = SessionType.Local;
	readonly icon: ThemeIcon;
	readonly createdAt: Date;

	private readonly _title = observableValue(this, '');
	readonly title: IObservable<string> = this._title;

	private readonly _updatedAt = observableValue(this, new Date());
	readonly updatedAt: IObservable<Date> = this._updatedAt;

	private readonly _status = observableValue(this, SessionStatus.Untitled);
	readonly status: IObservable<SessionStatus> = this._status;

	private readonly _permissionLevel = observableValue(this, ChatPermissionLevel.Default);
	readonly permissionLevel: IObservable<ChatPermissionLevel> = this._permissionLevel;

	private readonly _workspaceData = observableValue<ISessionWorkspace | undefined>(this, undefined);
	readonly workspace: IObservable<ISessionWorkspace | undefined> = this._workspaceData;

	readonly checkpoints: IObservable<IChatCheckpoints | undefined> = constObservable(undefined);

	private readonly _changes = observableValue<readonly ISessionFileChange[]>(this, []);
	readonly changes: IObservable<readonly ISessionFileChange[]> = this._changes;

	private readonly _modelIdObservable = observableValue<string | undefined>(this, undefined);
	readonly modelId: IObservable<string | undefined> = this._modelIdObservable;

	private readonly _modeObservable = observableValue<{ readonly id: string; readonly kind: string } | undefined>(this, undefined);
	readonly mode: IObservable<{ readonly id: string; readonly kind: string } | undefined> = this._modeObservable;

	readonly loading: IObservable<boolean> = constObservable(false);

	private readonly _isArchived = observableValue(this, false);
	readonly isArchived: IObservable<boolean> = this._isArchived;
	readonly isRead: IObservable<boolean> = constObservable(true);
	readonly description: IObservable<IMarkdownString | undefined> = constObservable(undefined);

	private readonly _lastTurnEnd = observableValue<Date | undefined>(this, undefined);
	readonly lastTurnEnd: IObservable<Date | undefined> = this._lastTurnEnd;

	readonly mainChat: ISettableObservable<IChat>;

	// -- Pre-send configuration --

	private _modelId: string | undefined;
	private _mode: IChatMode | undefined;

	readonly selectedOptions = new Map<string, IChatSessionProviderOptionItem>();

	get selectedModelId(): string | undefined { return this._modelId; }
	get chatMode(): IChatMode | undefined { return this._mode; }

	/**
	 * Creates a session from persisted chat history.
	 */
	static fromHistory(
		detail: IChatDetail,
		providerId: string,
		workspace: ISessionWorkspace | undefined,
		instantiationService: IInstantiationService,
	): LocalSession {
		return instantiationService.createInstance(LocalSession, detail, workspace, providerId);
	}

	constructor(
		detail: IChatDetail | undefined,
		workspace: ISessionWorkspace | undefined,
		providerId: string,
		@IGitService private readonly gitService: IGitService,
		@IChatService private readonly chatService: IChatService,
		@IFileService private readonly fileService: IFileService,
	) {
		super();

		this.providerId = providerId;
		this.icon = LocalSessionType.icon;

		if (detail) {
			// History session — restore from persisted data
			const timing = convertLegacyChatSessionTiming(detail.timing);
			this.resource = detail.sessionResource;
			this.createdAt = new Date(timing.created);

			const lastUpdate = detail.lastMessageDate || timing.lastRequestEnded || timing.lastRequestStarted || timing.created;
			this._title.set(detail.title, undefined);
			this._updatedAt.set(new Date(lastUpdate), undefined);
			this._status.set(detail.isActive ? SessionStatus.InProgress : SessionStatus.Completed, undefined);
			this._lastTurnEnd.set(timing.lastRequestEnded ? new Date(timing.lastRequestEnded) : undefined, undefined);

			if (workspace) {
				this._workspaceData.set(workspace, undefined);
			}
		} else {
			// New session — create a fresh chat model
			const modelRef = this._register(this.chatService.startNewLocalSession(
				ChatAgentLocation.Chat,
				{ debugOwner: 'LocalChatSessionsProvider#createNewSession' },
			));
			if (workspace && workspace.folders.length > 0) {
				modelRef.object.setWorkingDirectory(workspace.folders[0]?.root);
			}
			this.resource = modelRef.object.sessionResource;
			this.createdAt = new Date();

			if (workspace) {
				this._workspaceData.set(workspace, undefined);
				this._resolveGitState(workspace);
			}
		}

		this.sessionId = toSessionId(providerId, this.resource);
		this.mainChat = observableValue<IChat>(this, buildChat(this));
	}

	private async _resolveGitState(workspace: ISessionWorkspace): Promise<void> {
		const repoUri = workspace.folders[0]?.root;
		if (!repoUri) {
			return;
		}

		try {
			const repo = await this.gitService.openRepository(repoUri);
			if (!repo) {
				return;
			}

			const folder = workspace.folders[0];
			const baseGitRepo: ISessionGitRepository = folder.gitRepository ?? {
				uri: folder.root,
				workTreeUri: undefined,
				baseBranchName: undefined,
				gitHubInfo: constObservable(undefined),
			};

			// Monotonically increasing version used to discard stale diff results.
			let diffVersion = 0;

			this._register(autorun((reader) => {
				const state = repo.state.read(reader);
				const head = state.HEAD;
				const branchName = head?.commit ? head.name : undefined;
				const upstreamBranchName = head?.upstream
					? `${head.upstream.remote}/${head.upstream.name}`
					: undefined;
				const uncommittedChanges = state.workingTreeChanges.length + state.untrackedChanges.length + state.indexChanges.length;

				this._workspaceData.set({
					...workspace,
					folders: [{
						...folder,
						gitRepository: {
							...baseGitRepo,
							branchName,
							upstreamBranchName,
							uncommittedChanges,
						},
					}],
				}, undefined);

				const allStateChanges = [...state.workingTreeChanges, ...state.untrackedChanges, ...state.indexChanges];

				const version = ++diffVersion;
				repo.diffBetweenWithStats2('HEAD').then(async diffChanges => {
					if (this._store.isDisposed || version !== diffVersion) {
						return;
					}
					const trackedUris = new Set(diffChanges.map(el => el.uri.toString()));
					const changes: IChatSessionFileChange2[] = diffChanges.map(el => ({
						uri: el.uri,
						originalUri: el.originalUri,
						modifiedUri: el.modifiedUri ?? el.uri,
						insertions: el.insertions,
						deletions: el.deletions,
					}));
					const untrackedFiles = allStateChanges.filter(el => !trackedUris.has(el.uri.toString()));
					const lineCountPromises = untrackedFiles.map(async el => {
						let insertions = 0;
						try {
							const stat = await this.fileService.stat(el.uri);
							if (!stat.isDirectory) {
								const content = await this.fileService.readFile(el.uri);
								const text = content.value.toString();
								insertions = text.length > 0 ? text.split('\n').length : 0;
							}
						} catch {
							// File may have been deleted between state snapshot and read
						}
						return {
							uri: el.uri,
							originalUri: undefined,
							modifiedUri: el.modifiedUri ?? el.uri,
							insertions,
							deletions: 0,
						} satisfies IChatSessionFileChange2;
					});
					const untrackedChanges = await Promise.all(lineCountPromises);
					if (this._store.isDisposed || version !== diffVersion) {
						return;
					}
					changes.push(...untrackedChanges);
					this._changes.set(changes, undefined);
				}, () => {
					if (this._store.isDisposed || version !== diffVersion) {
						return;
					}
					this._changes.set(allStateChanges.map<IChatSessionFileChange2>(el => ({
						uri: el.uri,
						originalUri: el.originalUri,
						modifiedUri: el.modifiedUri ?? el.uri,
						insertions: 0,
						deletions: 0,
					})), undefined);
				});
			}));
		} catch {
			// No git repository available — workspace stays as-is
		}
	}

	setPermissionLevel(level: ChatPermissionLevel): void {
		this._permissionLevel.set(level, undefined);
	}

	setModelId(modelId: string | undefined): void {
		this._modelId = modelId;
		this._modelIdObservable.set(modelId, undefined);
	}

	setTitle(title: string): void {
		this._title.set(title, undefined);
	}

	setUpdatedAt(date: Date): void {
		this._updatedAt.set(date, undefined);
	}

	setStatus(status: SessionStatus): void {
		this._status.set(status, undefined);
	}

	setArchived(archived: boolean): void {
		this._isArchived.set(archived, undefined);
	}

	private readonly _modelTracker = this._register(new MutableDisposable());

	/**
	 * Subscribe to live updates from the given chat model. Subsequent calls
	 * replace any prior subscription. Disposed automatically with the session.
	 */
	trackModel(model: IChatModel, onChange: () => void): void {
		this._modelTracker.value = autorun(reader => {
			const inProgress = model.requestInProgress.read(reader);
			this._status.set(inProgress ? SessionStatus.InProgress : SessionStatus.Completed, undefined);
			onChange();
		});
	}

	setMode(mode: IChatMode | undefined): void {
		this._mode = mode;
		if (mode) {
			this._modeObservable.set({ id: mode.id, kind: mode.kind }, undefined);
		} else {
			this._modeObservable.set(undefined, undefined);
		}
	}

	/**
	 * Update this session from a persisted history detail.
	 */
	updateFromHistory(detail: IChatDetail): void {
		const timing = convertLegacyChatSessionTiming(detail.timing);
		const lastUpdate = detail.lastMessageDate || timing.lastRequestEnded || timing.lastRequestStarted || timing.created;
		transaction(tx => {
			this._title.set(detail.title, tx);
			this._updatedAt.set(new Date(lastUpdate), tx);
			this._status.set(detail.isActive ? SessionStatus.InProgress : SessionStatus.Completed, tx);
			this._lastTurnEnd.set(timing.lastRequestEnded ? new Date(timing.lastRequestEnded) : undefined, tx);
		});
	}
}

/**
 * Sessions provider that wraps local in-process chat sessions
 * (using {@link IChatService} directly) into the {@link ISessionsProvider} interface.
 */
export class LocalChatSessionsProvider extends Disposable implements ISessionsProvider {

	readonly id = LOCAL_PROVIDER_ID;
	readonly label = localize('localChatSessionsProvider', "Local Chat");
	readonly icon = Codicon.vm;
	readonly browseActions: readonly [] = [];
	readonly supportsLocalWorkspaces = true;

	readonly sessionTypes: readonly ISessionType[] = [LocalSessionType];
	readonly onDidChangeSessionTypes: Event<void> = Event.None;

	private readonly _onDidChangeSessions = this._register(new Emitter<ISessionChangeEvent>());
	readonly onDidChangeSessions: Event<ISessionChangeEvent> = this._onDidChangeSessions.event;

	/** Cache of sessions, keyed by resource URI string. */
	private readonly _sessionCache = new Map<string, LocalSession>();

	private readonly _currentNewSession = this._register(new MutableDisposable<LocalSession>());

	constructor(
		@IChatService private readonly chatService: IChatService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@ILanguageModelToolsService private readonly toolsService: ILanguageModelToolsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILabelService private readonly labelService: ILabelService,
		@ILogService private readonly logService: ILogService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();

		// Track requests on our sessions to update last message date,
		// title, and persisted metadata when the chat widget sends
		// subsequent messages directly (not via our sendRequest).
		this._register(this.chatService.onDidSubmitRequest(e => {
			const session = this._sessionCache.get(e.chatSessionResource.toString());
			if (session) {
				this._syncSessionFromModel(session);
			}
		}));

		// One-time migration: import existing local chat history into our storage
		this._migrateFromHistory().finally(() => {
			// Load persisted local sessions on initialization
			this._loadPersistedSessions();
		});
	}

	/**
	 * One-time migration that imports existing local chat sessions from
	 * {@link IChatService.getLocalSessionHistory} into our own persisted
	 * storage. Only sessions with a working directory are migrated, since
	 * a working directory is mandatory for {@link LocalSession}. Sessions
	 * that are already in our storage are skipped.
	 */
	private async _migrateFromHistory(): Promise<void> {
		if (this.storageService.getBoolean(STORAGE_KEY_MIGRATED, StorageScope.PROFILE, false)) {
			return;
		}

		try {
			const history = await this.chatService.getLocalSessionHistory();
			const sessions = this._readStoredSessions();
			const existingKeys = new Set(sessions.map(s => URI.revive(s.uri).toString()));
			let changed = false;

			for (const detail of history) {
				if (!detail.workingDirectory) {
					continue;
				}
				const key = detail.sessionResource.toString();
				if (existingKeys.has(key)) {
					continue;
				}
				const timing = convertLegacyChatSessionTiming(detail.timing);
				const lastUpdate = detail.lastMessageDate || timing.lastRequestEnded || timing.lastRequestStarted || timing.created;
				sessions.push({
					uri: detail.sessionResource.toJSON(),
					title: detail.title,
					createdAt: timing.created,
					lastMessageDate: lastUpdate,
					workingDirectory: detail.workingDirectory.toJSON(),
				});
				changed = true;
			}

			if (changed) {
				this._writeStoredSessions(sessions);
			}
			this.storageService.store(STORAGE_KEY_MIGRATED, true, StorageScope.PROFILE, StorageTarget.MACHINE);
		} catch (e) {
			this.logService.error('[LocalChatSessionsProvider] Failed to migrate local chat history', e);
			// Do not mark migration complete on failure so it can be retried next time.
		}
	}

	/**
	 * Reads current title/timing from the live chat model, updates the
	 * cached session, persists changes, and sets up reactive tracking
	 * so subsequent status changes propagate automatically.
	 */
	private _syncSessionFromModel(session: LocalSession): void {
		const model = this.chatService.getSession(session.resource);
		if (!model) {
			return;
		}
		session.trackModel(model, () => {
			const timing = model.timing;
			const lastUpdate = timing.lastRequestEnded ?? timing.lastRequestStarted ?? timing.created;
			session.setTitle(model.title);
			session.setUpdatedAt(new Date(lastUpdate));
			this._updateStoredSession(session);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._toISession(session)] });
		});
	}

	// -- Session types --

	getSessionTypes(_workspaceUri: URI): ISessionType[] {
		return [LocalSessionType];
	}

	// -- Sessions --

	getSessions(): ISession[] {
		return Array.from(this._sessionCache.values()).map(session => this._toISession(session));
	}

	/**
	 * Loads sessions from our own persisted storage. No calls to
	 * {@link IChatService} are needed — all metadata is stored inline.
	 */
	private _loadPersistedSessions(): void {
		const storedSessions = this._readStoredSessions();
		if (storedSessions.length === 0) {
			return;
		}

		const added: ISession[] = [];

		for (const stored of storedSessions) {
			const uri = URI.revive(stored.uri);
			const key = uri.toString();
			if (this._sessionCache.has(key)) {
				continue;
			}

			const workingDirectory = URI.revive(stored.workingDirectory);
			const detail: IChatDetail = {
				sessionResource: uri,
				title: stored.title,
				lastMessageDate: stored.lastMessageDate,
				timing: { created: stored.createdAt, lastRequestStarted: undefined, lastRequestEnded: stored.lastMessageDate },
				isActive: false,
				lastResponseState: 0 /* ResponseModelState.Complete */,
				workingDirectory,
			};

			const workspace = this.resolveWorkspace(workingDirectory);
			const session = LocalSession.fromHistory(detail, this.id, workspace, this.instantiationService);
			if (stored.archived) {
				session.setArchived(true);
			}
			this._sessionCache.set(key, session);
			added.push(this._toISession(session));
		}

		if (added.length > 0) {
			this._onDidChangeSessions.fire({ added, removed: [], changed: [] });
		}
	}

	// -- Storage helpers --

	private _readStoredSessions(): IStoredLocalSession[] {
		const raw = this.storageService.get(STORAGE_KEY_SESSIONS, StorageScope.PROFILE);
		if (!raw) {
			return [];
		}
		try {
			const parsed = JSON.parse(raw);
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			return [];
		}
	}

	private _addStoredSession(session: LocalSession): void {
		const sessions = this._readStoredSessions();
		const key = session.resource.toString();
		if (sessions.some(s => URI.revive(s.uri).toString() === key)) {
			return;
		}
		const workingDirectory = session.workspace.get()?.folders[0]?.root;
		if (!workingDirectory) {
			this.logService.warn(`[LocalChatSessionsProvider] Cannot persist session ${key} — no working directory`);
			return;
		}
		sessions.push({
			uri: session.resource.toJSON(),
			title: session.title.get(),
			createdAt: session.createdAt.getTime(),
			lastMessageDate: session.updatedAt.get().getTime(),
			workingDirectory: workingDirectory.toJSON(),
		});
		this._writeStoredSessions(sessions);
	}

	private _updateStoredSession(session: LocalSession): void {
		const sessions = this._readStoredSessions();
		const key = session.resource.toString();
		const idx = sessions.findIndex(s => URI.revive(s.uri).toString() === key);
		if (idx >= 0) {
			sessions[idx] = {
				...sessions[idx],
				title: session.title.get(),
				lastMessageDate: session.updatedAt.get().getTime(),
				archived: session.isArchived.get(),
			};
			this._writeStoredSessions(sessions);
		}
	}

	private _removeStoredSession(resource: URI): void {
		const sessions = this._readStoredSessions();
		const key = resource.toString();
		const filtered = sessions.filter(s => URI.revive(s.uri).toString() !== key);
		if (filtered.length !== sessions.length) {
			this._writeStoredSessions(filtered);
		}
	}

	private _writeStoredSessions(sessions: IStoredLocalSession[]): void {
		this.storageService.store(
			STORAGE_KEY_SESSIONS,
			JSON.stringify(sessions),
			StorageScope.PROFILE,
			StorageTarget.MACHINE,
		);
	}

	// -- Workspace --

	resolveWorkspace(uri: URI): ISessionWorkspace | undefined {
		if (uri.scheme !== Schemas.file) {
			return undefined;
		}
		const folder: ISessionFolder = {
			root: uri,
			workingDirectory: uri,
			name: basename(uri),
			description: undefined,
			gitRepository: undefined,
		};
		return {
			uri,
			label: basename(uri),
			description: this.labelService.getUriLabel(dirname(uri), { relative: false }),
			group: SESSION_WORKSPACE_GROUP_LOCAL,
			icon: Codicon.folder,
			folders: [folder],
			requiresWorkspaceTrust: true,
			isVirtualWorkspace: false,
		};
	}

	// -- Session Lifecycle --

	createNewSession(workspaceUri: URI, sessionTypeId: string): ISession {
		if (sessionTypeId !== LocalSessionType.id) {
			throw new Error(`Unsupported session type '${sessionTypeId}' for local provider`);
		}

		const workspace = this.resolveWorkspace(workspaceUri);
		if (!workspace) {
			throw new Error(`Cannot resolve workspace for URI: ${workspaceUri.toString()}`);
		}

		const session = this.instantiationService.createInstance(LocalSession, undefined, workspace, this.id);
		session.setPermissionLevel(this._defaultPermissionLevel());
		this._currentNewSession.value = session;
		return this._toISession(session);
	}

	setModel(sessionId: string, modelId: string): void {
		if (this._currentNewSession.value?.sessionId === sessionId) {
			this._currentNewSession.value.setModelId(modelId);
		}
	}

	// -- Session Actions --

	async archiveSession(sessionId: string): Promise<void> {
		const session = this._findSession(sessionId);
		if (session) {
			session.setArchived(true);
			this._updateStoredSession(session);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._toISession(session)] });
		}
	}

	async unarchiveSession(sessionId: string): Promise<void> {
		const session = this._findSession(sessionId);
		if (session) {
			session.setArchived(false);
			this._updateStoredSession(session);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._toISession(session)] });
		}
	}

	async deleteSession(sessionId: string): Promise<void> {
		const session = this._findSession(sessionId);
		if (!session) {
			return;
		}

		await this.chatService.removeHistoryEntry(session.resource);
		this._sessionCache.delete(session.resource.toString());
		this._removeStoredSession(session.resource);
		if (this._currentNewSession.value?.sessionId === sessionId) {
			this._currentNewSession.clear();
		}
		this._onDidChangeSessions.fire({ added: [], removed: [this._toISession(session)], changed: [] });
		session.dispose();
	}

	async deleteChat(sessionId: string, _chatUri: URI): Promise<void> {
		// Local sessions have a single chat — deleting the chat deletes the session
		return this.deleteSession(sessionId);
	}

	async renameChat(_sessionId: string, chatUri: URI, title: string): Promise<void> {
		this.chatService.setSessionTitle(chatUri, title);
		const session = this._findSessionByResource(chatUri);
		if (session) {
			session.setTitle(title);
			this._updateStoredSession(session);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._toISession(session)] });
		}
	}

	async createNewChat(sessionId: string, _prompt?: string): Promise<IChat> {
		if (this._currentNewSession.value?.sessionId === sessionId) {
			const session = this._currentNewSession.value;
			const chat = buildChat(session);
			session.mainChat.set(chat, undefined);
			return chat;
		}
		throw new Error(`Session '${sessionId}' not found or is not the current new session`);
	}

	// -- Send Request --

	async sendRequest(sessionId: string, chatResource: URI, options: ISendRequestOptions): Promise<ISession> {
		const newSession = this._currentNewSession.value;
		if (!newSession || newSession.sessionId !== sessionId) {
			throw new Error(`Session '${sessionId}' not found`);
		}
		if (chatResource.toString() !== newSession.resource.toString()) {
			throw new Error(`Chat resource ${chatResource.toString()} does not match session resource ${newSession.resource.toString()}`);
		}

		const { query, attachedContext } = options;

		newSession.setTitle(query.split('\n')[0].substring(0, 100) || localize('newSession', "New Session"));
		newSession.setStatus(SessionStatus.InProgress);

		const newISession = this._toISession(newSession);
		this._onDidChangeSessions.fire({ added: [newISession], removed: [], changed: [] });

		// Resolve mode
		const modeKind = newSession.chatMode?.kind ?? ChatModeKind.Agent;
		const modeIsBuiltin = newSession.chatMode ? isBuiltinChatMode(newSession.chatMode) : true;
		const modeId: 'ask' | 'agent' | 'edit' | 'custom' | undefined = modeIsBuiltin ? modeKind : 'custom';

		const rawModeInstructions = newSession.chatMode?.modeInstructions?.get();
		const modeInstructions = rawModeInstructions ? {
			name: newSession.chatMode!.name.get(),
			content: rawModeInstructions.content,
			toolReferences: this.toolsService.toToolReferences(rawModeInstructions.toolReferences),
			metadata: rawModeInstructions.metadata,
		} : undefined;

		const permissionLevel = newSession.permissionLevel.get();

		const sendOptions: IChatSendRequestOptions = {
			location: ChatAgentLocation.Chat,
			userSelectedModelId: newSession.selectedModelId,
			modeInfo: {
				kind: modeKind,
				isBuiltin: modeIsBuiltin,
				modeInstructions,
				modeId,
				applyCodeBlockSuggestionId: undefined,
				permissionLevel,
			},
			attachedContext,
		};

		// Set model/mode/permission state on the chat model before sending
		const modelRef = await this._updateChatSessionState(chatResource, newSession);
		this.logService.debug(`[LocalChatSessionsProvider] Sending request for session ${newSession.sessionId}`);

		try {
			const result = await this.chatService.sendRequest(chatResource, query, sendOptions);
			if (result.kind === 'rejected') {
				this._currentNewSession.clearAndLeak();
				this._onDidChangeSessions.fire({ added: [], removed: [newISession], changed: [] });
				newSession.dispose();
				throw new Error(`[LocalChatSessionsProvider] sendRequest rejected: ${result.reason}`);
			}

			// Put the new session into the cache and persist its URI.
			this._sessionCache.set(newSession.resource.toString(), newSession);
			this._addStoredSession(newSession);
			this._currentNewSession.clearAndLeak();

			// Track response completion to update session status and persist title
			if (result.kind === 'sent') {
				result.data.responseCompletePromise.then(() => {
					newSession.setStatus(SessionStatus.Completed);
					this._syncSessionFromModel(newSession);
				}, error => {
					// Response failed — still mark session completed so it doesn't appear stuck.
					this.logService.error(`[LocalChatSessionsProvider] Response failed for session ${newSession.sessionId}:`, error);
					newSession.setStatus(SessionStatus.Completed);
					this._updateStoredSession(newSession);
					this._onDidChangeSessions.fire({ added: [], removed: [], changed: [newISession] });
				});
			}

			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [newISession] });
			return newISession;
		} catch (error) {
			this.logService.error(`[LocalChatSessionsProvider] Failed to send request for session ${newSession.sessionId}:`, error);
			throw error;
		} finally {
			modelRef?.dispose();
		}
	}

	// -- Private helpers --

	override dispose(): void {
		for (const session of this._sessionCache.values()) {
			session.dispose();
		}
		this._sessionCache.clear();
		super.dispose();
	}

	/**
	 * Resolves the initial permission level for a brand-new session from
	 * `chat.permissions.default`, clamped to `Default` when enterprise policy
	 * disables global auto-approval.
	 */
	private _defaultPermissionLevel(): ChatPermissionLevel {
		const policyRestricted = this.configurationService.inspect<boolean>(ChatConfiguration.GlobalAutoApprove).policyValue === false;
		if (policyRestricted) {
			return ChatPermissionLevel.Default;
		}
		const level = this.configurationService.getValue<string>(ChatConfiguration.DefaultPermissionLevel);
		return isChatPermissionLevel(level) ? level : ChatPermissionLevel.Default;
	}

	/**
	 * Updates the chat model state (model, mode, permission level) before sending.
	 */
	private async _updateChatSessionState(resource: URI, session: LocalSession): Promise<{ dispose(): void } | undefined> {
		const modelRef = await this.chatService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, CancellationToken.None);
		if (!modelRef) {
			return undefined;
		}
		const model = modelRef.object;
		if (session.selectedModelId) {
			const languageModel = this.languageModelsService.lookupLanguageModel(session.selectedModelId);
			if (languageModel) {
				model.inputModel.setState({ selectedModel: { identifier: session.selectedModelId, metadata: languageModel } });
			}
		}
		if (session.chatMode) {
			model.inputModel.setState({ mode: { id: session.chatMode.id, kind: session.chatMode.kind } });
		}
		const permissionLevel = session.permissionLevel.get();
		if (permissionLevel) {
			model.inputModel.setState({ permissionLevel });
		}
		return modelRef;
	}

	private _findSession(sessionId: string): LocalSession | undefined {
		if (this._currentNewSession.value?.sessionId === sessionId) {
			return this._currentNewSession.value;
		}
		for (const session of this._sessionCache.values()) {
			if (session.sessionId === sessionId) {
				return session;
			}
		}
		return undefined;
	}

	private _findSessionByResource(resource: URI): LocalSession | undefined {
		const cached = this._sessionCache.get(resource.toString());
		if (cached) {
			return cached;
		}
		if (this._currentNewSession.value?.resource.toString() === resource.toString()) {
			return this._currentNewSession.value;
		}
		return undefined;
	}

	private _toISession(session: LocalSession): ISession {
		const mainChat = session.mainChat;
		const chatsObs = mainChat.map(c => [c] as readonly IChat[]);
		const changesets = createChangesets(session.sessionType, session.workspace, chatsObs, this.instantiationService);

		return {
			sessionId: session.sessionId,
			resource: session.resource,
			providerId: session.providerId,
			sessionType: session.sessionType,
			icon: session.icon,
			createdAt: session.createdAt,
			workspace: session.workspace,
			title: session.title,
			updatedAt: session.updatedAt,
			status: session.status,
			changesets,
			changes: session.changes,
			modelId: session.modelId,
			mode: session.mode,
			loading: session.loading,
			isArchived: session.isArchived,
			isRead: session.isRead,
			description: session.description,
			lastTurnEnd: session.lastTurnEnd,
			chats: chatsObs,
			mainChat,
			capabilities: {
				supportsMultipleChats: false,
			},
		};
	}
}
