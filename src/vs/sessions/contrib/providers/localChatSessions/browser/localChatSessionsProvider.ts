/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableMap, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { autorun, constObservable, IObservable, IReader, ISettableObservable, observableFromEvent, observableValue, transaction } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI, UriComponents } from '../../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatService, IChatSendRequestOptions, IChatDetail, convertLegacyChatSessionTiming } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionFileChange2, IChatSessionProviderOptionItem, SessionType } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ISession, IChat, ISessionGitRepository, ISessionFolder, ISessionWorkspace, SessionStatus, ISessionType, ISessionFileChange, toSessionId, SESSION_WORKSPACE_GROUP_LOCAL, IChatCheckpoints, ChatInteractivity } from '../../../../services/sessions/common/session.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind, ChatPermissionLevel, isChatPermissionLevel } from '../../../../../workbench/contrib/chat/common/constants.js';
import { basename, dirname, isEqual } from '../../../../../base/common/resources.js';
import { IDeleteChatOptions, ISendRequestOptions, ISessionChangeEvent, ISessionModelPickerOptions, ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { isBuiltinChatMode, IChatMode } from '../../../../../workbench/contrib/chat/common/chatModes.js';
import { IChatModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { IGitService } from '../../../../../workbench/contrib/git/common/gitService.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../../../workbench/contrib/chat/common/languageModels.js';
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

export const LOCAL_PROVIDER_ID = 'local-chat';
const STORAGE_KEY_SESSIONS = 'sessions.localChat.sessions';
const STORAGE_KEY_MIGRATED = 'sessions.localChat.migrated';

interface IStoredLocalSession {
	readonly uri: UriComponents;
	readonly title: string;
	readonly createdAt: number;
	readonly lastMessageDate: number;
	readonly workingDirectory: UriComponents;
	readonly archived?: boolean;
	readonly isRead?: boolean;
	/**
	 * Resource of the primary (parent) chat when this entry is a subsequent
	 * chat in a multi-chat session. `undefined`/absent for primary chats.
	 * This is how the chat hierarchy is persisted in the provider metadata.
	 */
	readonly parentUri?: UriComponents;
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
		interactivity: constObservable(ChatInteractivity.Full),
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

	/**
	 * Resource of the primary (parent) chat when this session is a subsequent
	 * chat in a multi-chat group. `undefined` for primary chats.
	 */
	private _parentResource: URI | undefined;
	get parentResource(): URI | undefined { return this._parentResource; }
	setParentResource(resource: URI | undefined): void { this._parentResource = resource; }

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
	private readonly _isRead = observableValue(this, true);
	readonly isRead: IObservable<boolean> = this._isRead;
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

	setRead(isRead: boolean): void {
		this._isRead.set(isRead, undefined);
	}

	private readonly _modelTracker = this._register(new MutableDisposable());

	private _wasRequestInProgress = false;

	/**
	 * Subscribe to live updates from the given chat model. Subsequent calls
	 * replace any prior subscription. Disposed automatically with the session.
	 */
	trackModel(model: IChatModel, onChange: () => void): void {
		this._modelTracker.value = autorun(reader => {
			const inProgress = model.requestInProgress.read(reader);
			this._status.set(inProgress ? SessionStatus.InProgress : SessionStatus.Completed, undefined);
			// A completed turn (in-progress → idle) marks the session unread.
			if (this._wasRequestInProgress && !inProgress) {
				this._isRead.set(false, undefined);
			}
			this._wasRequestInProgress = inProgress;
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
	readonly label = localize('localChatSessionsProvider', "Copilot Chat");
	readonly icon = Codicon.vm;
	readonly order = 0;
	readonly browseActions: readonly [] = [];
	readonly supportsLocalWorkspaces = true;

	readonly sessionTypes: readonly ISessionType[] = [LocalSessionType];
	readonly onDidChangeSessionTypes: Event<void> = Event.None;

	private readonly _onDidChangeSessions = this._register(new Emitter<ISessionChangeEvent>());
	readonly onDidChangeSessions: Event<ISessionChangeEvent> = this._onDidChangeSessions.event;

	/** Cache of sessions, keyed by resource URI string. Holds every chat (primary and children). */
	private readonly _sessionCache = new Map<string, LocalSession>();

	/** Aggregated multi-chat session wrappers, keyed by group (primary) session id. */
	private readonly _sessionGroupCache = new Map<string, ISession>();

	/** Fires when the set of chats in a group changes (chat added or removed). */
	private readonly _onDidChangeGroupMembership = this._register(new Emitter<{ readonly groupKey: string }>());

	private readonly _newSessions = this._register(new DisposableMap<string, LocalSession>());

	constructor(
		@IChatService private readonly chatService: IChatService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@ILanguageModelToolsService private readonly toolsService: ILanguageModelToolsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILabelService private readonly labelService: ILabelService,
		@ILogService private readonly logService: ILogService,
		@IStorageService private readonly storageService: IStorageService,
		@IDialogService private readonly dialogService: IDialogService,
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
		// Only primary chats surface as sessions; children are aggregated into
		// their primary's group.
		const sessions: ISession[] = [];
		for (const session of this._sessionCache.values()) {
			if (session.parentResource) {
				continue;
			}
			sessions.push(this._toISession(session));
		}
		return sessions;
	}

	/**
	 * Loads sessions from our own persisted storage. No calls to
	 * {@link IChatService} are needed — all metadata is stored inline.
	 *
	 * All chats are loaded into the cache first so that the chat hierarchy
	 * (children referencing their primary via `parentUri`) can be resolved.
	 * A child whose primary is missing from storage is treated as a primary
	 * (its `parentResource` is left unset) so it is never lost.
	 */
	private _loadPersistedSessions(): void {
		const storedSessions = this._readStoredSessions();
		if (storedSessions.length === 0) {
			return;
		}

		const storedKeys = new Set(storedSessions.map(s => URI.revive(s.uri).toString()));
		const loaded: LocalSession[] = [];

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
			// Entries persisted before `isRead` existed default to unread, so the
			// additive migration can promote genuinely-read legacy sessions.
			session.setRead(stored.isRead ?? false);
			// Only honour the parent link when the primary is also present in
			// storage; otherwise promote this orphan child to a primary.
			if (stored.parentUri) {
				const parentUri = URI.revive(stored.parentUri);
				if (storedKeys.has(parentUri.toString())) {
					session.setParentResource(parentUri);
				}
			}
			this._sessionCache.set(key, session);
			loaded.push(session);
		}

		// Fire `added` only for sessions that surface in `getSessions()`.
		const added: ISession[] = [];
		for (const session of loaded) {
			if (session.parentResource) {
				continue;
			}
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
			parentUri: session.parentResource?.toJSON(),
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
				isRead: session.isRead.get(),
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
		this._newSessions.set(session.sessionId, session);
		return this._toISession(session);
	}

	createQuickChat(_sessionTypeId: string): ISession {
		// This provider is workspace-bound and does not advertise
		// `supportsQuickChats`; callers must gate on that capability.
		throw new Error('LocalChatSessionsProvider does not support quick chats');
	}

	deleteNewSession(sessionId: string): void {
		if (this._newSessions.has(sessionId)) {
			this._newSessions.deleteAndDispose(sessionId);
		}
	}

	get onDidChangeModels(): Event<void> {
		return Event.signal(this.languageModelsService.onDidChangeLanguageModels);
	}

	getModels(_sessionId: string): readonly ILanguageModelChatMetadataAndIdentifier[] {
		// Local (in-process VS Code chat) sessions use general-purpose models
		// (those without a `targetChatSessionType`) that are user-selectable —
		// no extension registers models specifically targeting the 'local'
		// session type.
		return this.languageModelsService.getLanguageModelIds()
			.map((id): ILanguageModelChatMetadataAndIdentifier | undefined => {
				const metadata = this.languageModelsService.lookupLanguageModel(id);
				return metadata && !metadata.targetChatSessionType && metadata.isUserSelectable ? { identifier: id, metadata } : undefined;
			})
			.filter((m): m is ILanguageModelChatMetadataAndIdentifier => !!m);
	}

	getModelPickerOptions(_sessionId: string): ISessionModelPickerOptions {
		// Local (in-process VS Code chat) sessions offer the "Manage Models"
		// action so users can configure the general-purpose model set.
		return {
			useGroupedModelPicker: true,
			showFeatured: true,
			showUnavailableFeatured: false,
			showManageModelsAction: true,
		};
	}

	setModel(sessionId: string, modelId: string): void {
		const newSession = this._newSessions.get(sessionId);
		if (newSession) {
			newSession.setModelId(modelId);
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

	async setSessionReadState(sessionId: string, isRead: boolean): Promise<void> {
		const session = this._findSession(sessionId);
		if (!session) {
			return;
		}
		// A group's read state aggregates across every chat, so update them all.
		const primary = this._resolvePrimary(session);
		let changed = false;
		for (const chat of this._getGroupChats(primary)) {
			if (chat.isRead.get() !== isRead) {
				chat.setRead(isRead);
				this._updateStoredSession(chat);
				changed = true;
			}
		}
		if (changed) {
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._toISession(primary)] });
		}
	}

	async deleteSession(sessionId: string): Promise<void> {
		const session = this._findSession(sessionId);
		if (!session) {
			return;
		}

		// Resolve the group: deleting a session removes its primary chat and
		// all child chats. If a child id was passed, resolve to its primary.
		const primary = this._resolvePrimary(session);
		const group = this._getGroupChats(primary);

		const groupISession = this._toISession(primary);

		for (const chat of group) {
			await this.chatService.removeHistoryEntry(chat.resource);
			this._sessionCache.delete(chat.resource.toString());
			this._removeStoredSession(chat.resource);
			chat.dispose();
		}

		this._sessionGroupCache.delete(primary.sessionId);
		if (this._newSessions.has(sessionId)) {
			this._newSessions.deleteAndDispose(sessionId);
		}
		this._onDidChangeSessions.fire({ added: [], removed: [groupISession], changed: [] });
	}

	async deleteSessions(sessionIds: readonly string[]): Promise<void> {
		for (const sessionId of sessionIds) {
			await this.deleteSession(sessionId);
		}
	}

	async deleteChat(sessionId: string, chatUri: URI, options?: IDeleteChatOptions): Promise<boolean> {
		const primary = this._findSession(sessionId);
		if (!primary || primary.parentResource) {
			return false;
		}

		const group = this._getGroupChats(primary);
		const target = group.find(chat => isEqual(chat.resource, chatUri));

		// Unknown chat (e.g. a stale or incorrect URI): do nothing rather than
		// risk wiping the whole session.
		if (!target) {
			return false;
		}

		// Deleting the only chat or the primary chat removes the whole session
		// (and any children).
		if (group.length <= 1 || isEqual(target.resource, primary.resource)) {
			await this.deleteSession(sessionId);
			return true;
		}

		// Confirm before deleting a sub chat from a multi-chat session, unless the
		// caller opted out (e.g. discarding a transient untitled draft).
		if (!options?.skipConfirmation) {
			const confirmed = await this.dialogService.confirm({
				message: localize('deleteChat.confirm', "Are you sure you want to delete this chat?"),
				detail: localize('deleteChat.detail', "This action cannot be undone."),
				primaryButton: localize('deleteChat.delete', "Delete")
			});
			if (!confirmed.confirmed) {
				return false;
			}
		}

		await this.chatService.removeHistoryEntry(target.resource);
		this._sessionCache.delete(target.resource.toString());
		this._removeStoredSession(target.resource);
		target.dispose();

		this._onDidChangeGroupMembership.fire({ groupKey: primary.sessionId });
		this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._toISession(primary)] });
		return true;
	}

	async forkChat(sessionId: string, _sourceChat: URI, _turnId: string): Promise<IChat> {
		throw new Error(`Session '${sessionId}' does not support forking into a chat`);
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

	async renameSession(sessionId: string, title: string): Promise<void> {
		const session = this._findSession(sessionId);
		if (session) {
			await this.renameChat(sessionId, session.resource, title);
		}
	}

	async createNewChat(sessionId: string, _prompt?: string): Promise<IChat> {
		const currentNewSession = this._newSessions.get(sessionId);
		if (currentNewSession) {
			const session = currentNewSession;
			const chat = buildChat(session);
			session.mainChat.set(chat, undefined);
			return chat;
		}

		const primary = this._findSession(sessionId);
		if (primary && !primary.parentResource) {
			return this._createNewSubsequentChat(primary);
		}

		throw new Error(`Session '${sessionId}' not found or is not the current new session`);
	}

	/**
	 * Creates a subsequent chat within an existing multi-chat session. The new
	 * chat is linked to the primary chat via {@link LocalSession.parentResource}
	 * and added to the cache so it appears in the session's `chats` group. It is
	 * not persisted until its first {@link sendRequest} succeeds.
	 */
	private _createNewSubsequentChat(primary: LocalSession): IChat {
		const workspace = primary.workspace.get();
		if (!workspace) {
			throw new Error('Cannot create a new chat — primary session has no workspace');
		}

		const child = this.instantiationService.createInstance(LocalSession, undefined, workspace, this.id);
		child.setParentResource(primary.resource);
		child.setPermissionLevel(this._defaultPermissionLevel());
		child.setModelId(primary.modelId.get());
		child.setTitle(localize('newChat', "New Chat"));

		this._sessionCache.set(child.resource.toString(), child);
		this._onDidChangeGroupMembership.fire({ groupKey: primary.sessionId });
		this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._toISession(primary)] });

		return buildChat(child);
	}

	// -- Send Request --

	async sendRequest(sessionId: string, chatResource: URI, options: ISendRequestOptions): Promise<ISession> {
		// First chat of a brand-new session.
		const newSession = this._newSessions.get(sessionId);
		if (newSession) {
			if (chatResource.toString() !== newSession.resource.toString()) {
				throw new Error(`Chat resource ${chatResource.toString()} does not match session resource ${newSession.resource.toString()}`);
			}
			return this._sendFirstChat(newSession, chatResource, options);
		}

		// Subsequent chat in an existing multi-chat session. The management
		// service sends with the group (primary) session id and the child's
		// chat resource.
		const primary = this._findSession(sessionId);
		const child = this._sessionCache.get(chatResource.toString());
		if (primary && !primary.parentResource && child && child.parentResource && isEqual(child.parentResource, primary.resource)) {
			return this._sendChildChat(primary, child, chatResource, options);
		}

		throw new Error(`Session '${sessionId}' not found`);
	}

	private async _sendFirstChat(newSession: LocalSession, chatResource: URI, options: ISendRequestOptions): Promise<ISession> {
		newSession.setTitle(options.query.split('\n')[0].substring(0, 100) || localize('newSession', "New Session"));
		newSession.setStatus(SessionStatus.InProgress);

		const newISession = this._toISession(newSession);
		this._onDidChangeSessions.fire({ added: [newISession], removed: [], changed: [] });

		this.logService.debug(`[LocalChatSessionsProvider] Sending request for session ${newSession.sessionId}`);

		const result = await this._dispatchSend(newSession, chatResource, options);
		if (result.kind === 'rejected') {
			this._newSessions.deleteAndLeak(newSession.sessionId);
			this._sessionGroupCache.delete(newSession.sessionId);
			this._onDidChangeSessions.fire({ added: [], removed: [newISession], changed: [] });
			newSession.dispose();
			throw new Error(`[LocalChatSessionsProvider] sendRequest rejected: ${result.reason}`);
		}

		// Put the new session into the cache and persist its URI.
		this._sessionCache.set(newSession.resource.toString(), newSession);
		this._addStoredSession(newSession);
		this._newSessions.deleteAndLeak(newSession.sessionId);

		// Track the live model now, while the first turn is still in progress,
		// so a background completion/error marks the session unread even if the
		// user navigates away before it settles.
		if (result.kind === 'sent') {
			this._syncSessionFromModel(newSession);
			result.data.responseCompletePromise.then(() => {
				newSession.setStatus(SessionStatus.Completed);
			}, error => {
				this.logService.error(`[LocalChatSessionsProvider] Response failed for session ${newSession.sessionId}:`, error);
				newSession.setStatus(SessionStatus.Completed);
				this._updateStoredSession(newSession);
				this._onDidChangeSessions.fire({ added: [], removed: [], changed: [newISession] });
			});
		}

		this._onDidChangeSessions.fire({ added: [], removed: [], changed: [newISession] });
		return newISession;
	}

	private async _sendChildChat(primary: LocalSession, child: LocalSession, chatResource: URI, options: ISendRequestOptions): Promise<ISession> {
		child.setTitle(options.query.split('\n')[0].substring(0, 100) || localize('newChat', "New Chat"));
		child.setStatus(SessionStatus.InProgress);

		const groupISession = this._toISession(primary);
		this._onDidChangeSessions.fire({ added: [], removed: [], changed: [groupISession] });

		this.logService.debug(`[LocalChatSessionsProvider] Sending request for chat ${child.sessionId} in session ${primary.sessionId}`);

		const result = await this._dispatchSend(child, chatResource, options);
		if (result.kind === 'rejected') {
			// Roll back the unsent child so it does not linger in the group.
			this._sessionCache.delete(child.resource.toString());
			this._onDidChangeGroupMembership.fire({ groupKey: primary.sessionId });
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [groupISession] });
			child.dispose();
			throw new Error(`[LocalChatSessionsProvider] sendRequest rejected: ${result.reason}`);
		}

		// Persist the now-committed child chat with its parent link.
		this._addStoredSession(child);

		if (result.kind === 'sent') {
			result.data.responseCompletePromise.then(() => {
				child.setStatus(SessionStatus.Completed);
				this._syncSessionFromModel(child);
			}, error => {
				this.logService.error(`[LocalChatSessionsProvider] Response failed for chat ${child.sessionId}:`, error);
				child.setStatus(SessionStatus.Completed);
				this._updateStoredSession(child);
				this._onDidChangeSessions.fire({ added: [], removed: [], changed: [groupISession] });
			});
		}

		this._onDidChangeSessions.fire({ added: [], removed: [], changed: [groupISession] });
		return groupISession;
	}

	/**
	 * Applies pre-send configuration to the chat model and dispatches the
	 * request to {@link IChatService}. Returns the raw send result; commit and
	 * rollback bookkeeping is left to the caller.
	 */
	private async _dispatchSend(session: LocalSession, chatResource: URI, options: ISendRequestOptions): ReturnType<IChatService['sendRequest']> {
		const { query, attachedContext } = options;

		// Resolve mode
		const modeKind = session.chatMode?.kind ?? ChatModeKind.Agent;
		const modeIsBuiltin = session.chatMode ? isBuiltinChatMode(session.chatMode) : true;

		const rawModeInstructions = session.chatMode?.modeInstructions?.get();
		const modeInstructions = rawModeInstructions ? {
			name: session.chatMode!.name.get(),
			content: rawModeInstructions.content,
			toolReferences: this.toolsService.toToolReferences(rawModeInstructions.toolReferences),
			metadata: rawModeInstructions.metadata,
		} : undefined;

		const permissionLevel = session.permissionLevel.get();

		const sendOptions: IChatSendRequestOptions = {
			location: ChatAgentLocation.Chat,
			userSelectedModelId: session.selectedModelId,
			modeInfo: {
				kind: modeKind,
				isBuiltin: modeIsBuiltin,
				modeInstructions,
				telemetryModeId: modeIsBuiltin ? modeKind : 'custom',
				applyCodeBlockSuggestionId: undefined,
				permissionLevel,
			},
			attachedContext,
		};

		// Set model/mode/permission state on the chat model before sending
		const modelRef = await this._updateChatSessionState(chatResource, session);
		try {
			return await this.chatService.sendRequest(chatResource, query, sendOptions);
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
		this._sessionGroupCache.clear();
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
		const newSession = this._newSessions.get(sessionId);
		if (newSession) {
			return newSession;
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
		for (const session of this._newSessions.values()) {
			if (session.resource.toString() === resource.toString()) {
				return session;
			}
		}
		return undefined;
	}

	/** Resolves the primary (parent) chat of a session's group. */
	private _resolvePrimary(session: LocalSession): LocalSession {
		if (session.parentResource) {
			return this._sessionCache.get(session.parentResource.toString()) ?? session;
		}
		return session;
	}

	/** Returns the primary chat followed by its children, ordered by creation time. */
	private _getGroupChats(primary: LocalSession): LocalSession[] {
		const children: LocalSession[] = [];
		for (const session of this._sessionCache.values()) {
			if (session.parentResource && isEqual(session.parentResource, primary.resource)) {
				children.push(session);
			}
		}
		children.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
		return [primary, ...children];
	}

	private _toISession(session: LocalSession): ISession {
		const primary = this._resolvePrimary(session);

		const cached = this._sessionGroupCache.get(primary.sessionId);
		if (cached) {
			return cached;
		}

		const groupISession = this._buildGroupISession(primary);
		this._sessionGroupCache.set(primary.sessionId, groupISession);
		return groupISession;
	}

	/**
	 * Wraps a primary {@link LocalSession} and its child chats into an
	 * aggregated {@link ISession}. The `chats` observable re-derives whenever
	 * group membership changes; per-chat state flows through each chat's own
	 * observables captured by {@link buildChat}.
	 */
	private _buildGroupISession(primary: LocalSession): ISession {
		const groupKey = primary.sessionId;

		const chatsObs: IObservable<readonly IChat[]> = observableFromEvent(
			this,
			Event.filter(this._onDidChangeGroupMembership.event, e => e.groupKey === groupKey),
			() => this._getGroupChats(primary).map(buildChat),
		);

		const changesets = createChangesets(primary.sessionType, primary.workspace, chatsObs, this.instantiationService);

		return {
			sessionId: primary.sessionId,
			resource: primary.resource,
			providerId: primary.providerId,
			sessionType: primary.sessionType,
			icon: primary.icon,
			createdAt: primary.createdAt,
			workspace: primary.workspace,
			title: primary.title,
			updatedAt: chatsObs.map((chats, reader) => this._latestDate(chats, c => c.updatedAt.read(reader)) ?? primary.updatedAt.read(reader)),
			status: chatsObs.map((chats, reader) => this._aggregateStatus(chats, reader)),
			changesets,
			changes: primary.changes,
			modelId: primary.modelId,
			mode: primary.mode,
			loading: primary.loading,
			isArchived: primary.isArchived,
			isRead: chatsObs.map((chats, reader) => chats.every(c => c.isRead.read(reader))),
			description: primary.description,
			lastTurnEnd: chatsObs.map((chats, reader) => this._latestDate(chats, c => c.lastTurnEnd.read(reader))),
			chats: chatsObs,
			mainChat: primary.mainChat,
			capabilities: constObservable({
				supportsMultipleChats: true,
				supportsRename: true,
				supportsDelete: true,
			}),
		};
	}

	private _latestDate(chats: readonly IChat[], getter: (chat: IChat) => Date | undefined): Date | undefined {
		let latest: Date | undefined;
		for (const chat of chats) {
			const date = getter(chat);
			if (date && (!latest || date > latest)) {
				latest = date;
			}
		}
		return latest;
	}

	private _aggregateStatus(chats: readonly IChat[], reader: IReader): SessionStatus {
		for (const chat of chats) {
			if (chat.status.read(reader) === SessionStatus.NeedsInput) {
				return SessionStatus.NeedsInput;
			}
		}
		for (const chat of chats) {
			if (chat.status.read(reader) === SessionStatus.InProgress) {
				return SessionStatus.InProgress;
			}
		}
		return chats[0].status.read(reader);
	}
}
