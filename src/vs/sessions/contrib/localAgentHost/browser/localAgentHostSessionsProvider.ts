/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IMarkdownString, MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { constObservable, IObservable, ISettableObservable, observableValue } from '../../../../base/common/observable.js';
import { basename } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { AgentSession, IAgentHostService, type IAgentSessionMetadata } from '../../../../platform/agentHost/common/agentService.js';
import { ActionType, isSessionAction } from '../../../../platform/agentHost/common/state/sessionActions.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { IChatSendRequestOptions, IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionFileChange, IChatSessionsService } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ChatAgentLocation, ChatModeKind } from '../../../../workbench/contrib/chat/common/constants.js';
import { ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { ISendRequestOptions, ISessionChangeEvent, ISessionsProvider } from '../../../services/sessions/common/sessionsProvider.js';
import { IChat, ISession, ISessionWorkspace, ISessionWorkspaceBrowseAction, SessionStatus, type IGitHubInfo, ISessionType } from '../../../services/sessions/common/session.js';

const LOCAL_PROVIDER_ID = 'local-agent-host';

/** Default provider when session metadata does not carry one. */
const DEFAULT_AGENT_PROVIDER = 'copilot';

/**
 * Derives the session type / URI scheme from an agent provider name.
 * Must match the type string registered by AgentHostContribution
 * (`agent-host-${agent.provider}`).
 */
function sessionTypeForProvider(provider: string): string {
	return `agent-host-${provider}`;
}

/** Session type for the local agent host. ID matches the targetChatSessionType on language models. */
const LocalAgentHostSessionType: ISessionType = {
	id: sessionTypeForProvider(DEFAULT_AGENT_PROVIDER),
	label: localize('localAgentHost', "Local Agent Host"),
	icon: Codicon.vm,
};

/**
 * Adapts agent host session metadata into an {@link ISession} for the
 * local agent host. Also exposes settable observables so the cache
 * layer can push live updates.
 */
class LocalSessionAdapter implements ISession {

	readonly sessionId: string;
	readonly resource: URI;
	readonly providerId: string;
	readonly sessionType: string;
	readonly icon = Codicon.vm;
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

	readonly mainChat: IChat;
	readonly chats: IObservable<readonly IChat[]>;

	readonly agentProvider: string;

	constructor(
		metadata: IAgentSessionMetadata,
		providerId: string,
		resourceScheme: string,
		logicalSessionType: string,
	) {
		const rawId = AgentSession.id(metadata.session);
		this.agentProvider = AgentSession.provider(metadata.session) ?? DEFAULT_AGENT_PROVIDER;
		this.resource = URI.from({ scheme: resourceScheme, path: `/${rawId}` });
		this.sessionId = `${providerId}:${this.resource.toString()}`;
		this.providerId = providerId;
		this.sessionType = logicalSessionType;
		this.createdAt = new Date(metadata.startTime);
		this.title = observableValue('title', metadata.summary ?? `Session ${rawId.substring(0, 8)}`);
		this.updatedAt = observableValue('updatedAt', new Date(metadata.modifiedTime));
		this.lastTurnEnd = observableValue('lastTurnEnd', metadata.modifiedTime ? new Date(metadata.modifiedTime) : undefined);
		this.description = observableValue('description', new MarkdownString().appendText(localize('localAgentHostDescription', "Local")));
		this.workspace = observableValue('workspace', metadata.workingDirectory
			? LocalAgentHostSessionsProvider.buildWorkspace(metadata.workingDirectory)
			: undefined);

		if (metadata.isRead === false) {
			this.isRead.set(false, undefined);
		}
		if (metadata.isDone) {
			this.isArchived.set(true, undefined);
		}

		this.mainChat = {
			resource: this.resource,
			createdAt: this.createdAt,
			title: this.title,
			updatedAt: this.updatedAt,
			status: this.status,
			changes: this.changes,
			modelId: this.modelId,
			mode: this.mode,
			isArchived: this.isArchived,
			isRead: this.isRead,
			description: this.description,
			lastTurnEnd: this.lastTurnEnd,
		};
		this.chats = constObservable([this.mainChat]);
	}

	update(metadata: IAgentSessionMetadata): boolean {
		let didChange = false;

		const summary = metadata.summary;
		if (summary !== undefined && summary !== this.title.get()) {
			this.title.set(summary, undefined);
			didChange = true;
		}

		const modifiedTime = metadata.modifiedTime;
		if (this.updatedAt.get().getTime() !== modifiedTime) {
			this.updatedAt.set(new Date(modifiedTime), undefined);
			didChange = true;
		}

		const currentLastTurnEndTime = this.lastTurnEnd.get()?.getTime();
		const nextLastTurnEndTime = modifiedTime ? modifiedTime : undefined;
		if (currentLastTurnEndTime !== nextLastTurnEndTime) {
			this.lastTurnEnd.set(nextLastTurnEndTime !== undefined ? new Date(nextLastTurnEndTime) : undefined, undefined);
			didChange = true;
		}

		if (metadata.isRead !== undefined && metadata.isRead !== this.isRead.get()) {
			this.isRead.set(metadata.isRead, undefined);
			didChange = true;
		}

		if (metadata.isDone !== undefined && metadata.isDone !== this.isArchived.get()) {
			this.isArchived.set(metadata.isDone, undefined);
			didChange = true;
		}

		return didChange;
	}
}

/**
 * Sessions provider for the local agent host.
 *
 * Implements {@link ISessionsProvider} to surface local agent host sessions
 * in the Sessions app's session list, workspace picker, and session management UI.
 *
 * The heavy lifting (agent discovery, session handlers, language model providers,
 * customization harness) is handled by the existing {@link AgentHostContribution}
 * which is already active in the Sessions app. This provider only bridges the
 * session listing and lifecycle to the {@link ISessionsProvidersService} layer.
 *
 * **URI/ID scheme:**
 * - **rawId** - unique session identifier (e.g. `abc123`), used as the cache key.
 * - **resource** - `agent-host-{provider}:///{rawId}` (e.g. `agent-host-copilot:///abc123`).
 *   The scheme routes the chat service to the correct {@link AgentHostSessionHandler}.
 * - **sessionId** - `local-agent-host:agent-host-{provider}:///{rawId}` — the
 *   provider-scoped ID used by {@link ISessionsProvider}.
 */
export class LocalAgentHostSessionsProvider extends Disposable implements ISessionsProvider {

	readonly id = LOCAL_PROVIDER_ID;
	readonly label: string;
	readonly icon: ThemeIcon = Codicon.vm;
	readonly sessionTypes: readonly ISessionType[];
	readonly capabilities = { multipleChatsPerSession: false };

	readonly browseActions: readonly ISessionWorkspaceBrowseAction[];

	private readonly _onDidChangeSessions = this._register(new Emitter<ISessionChangeEvent>());
	readonly onDidChangeSessions: Event<ISessionChangeEvent> = this._onDidChangeSessions.event;

	private readonly _onDidReplaceSession = this._register(new Emitter<{ readonly from: ISession; readonly to: ISession }>());
	readonly onDidReplaceSession: Event<{ readonly from: ISession; readonly to: ISession }> = this._onDidReplaceSession.event;

	/** Cache of adapted sessions, keyed by raw session ID. */
	private readonly _sessionCache = new Map<string, LocalSessionAdapter>();

	private _pendingSession: ISession | undefined;
	private _selectedModelId: string | undefined;
	private _currentNewSession: ISession | undefined;
	private _currentNewSessionStatus: ISettableObservable<SessionStatus> | undefined;

	private _cacheInitialized = false;

	constructor(
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IFileDialogService private readonly _fileDialogService: IFileDialogService,
		@IChatSessionsService private readonly _chatSessionsService: IChatSessionsService,
		@IChatService private readonly _chatService: IChatService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
	) {
		super();

		this.label = localize('localAgentHostLabel', "Local Agent Host");

		this.sessionTypes = [LocalAgentHostSessionType];

		this.browseActions = [{
			label: localize('folders', "Folders"),
			icon: Codicon.folderOpened,
			providerId: this.id,
			run: () => this._browseForFolder(),
		}];

		// Listen for notifications from the agent host to update the session list
		this._register(this._agentHostService.onDidNotification(n => {
			if (n.type === 'notify/sessionAdded') {
				this._handleSessionAdded(n.summary);
			} else if (n.type === 'notify/sessionRemoved') {
				this._handleSessionRemoved(n.session);
			}
		}));

		this._register(this._agentHostService.onDidAction(e => {
			if (e.action.type === ActionType.SessionTurnComplete && isSessionAction(e.action)) {
				this._refreshSessions();
			} else if (e.action.type === ActionType.SessionTitleChanged && isSessionAction(e.action)) {
				this._handleTitleChanged(e.action.session, e.action.title);
			} else if (e.action.type === ActionType.SessionIsReadChanged && isSessionAction(e.action)) {
				this._handleIsReadChanged(e.action.session, e.action.isRead);
			} else if (e.action.type === ActionType.SessionIsDoneChanged && isSessionAction(e.action)) {
				this._handleIsDoneChanged(e.action.session, e.action.isDone);
			}
		}));
	}

	// -- Workspaces --

	static buildWorkspace(workingDirectory: URI): ISessionWorkspace {
		const folderName = basename(workingDirectory) || workingDirectory.path;
		return {
			label: folderName,
			icon: Codicon.folder,
			repositories: [{ uri: workingDirectory, workingDirectory: undefined, detail: undefined, baseBranchName: undefined, baseBranchProtected: undefined }],
			requiresWorkspaceTrust: true,
		};
	}

	resolveWorkspace(repositoryUri: URI): ISessionWorkspace {
		const folderName = basename(repositoryUri) || repositoryUri.path;
		return {
			label: folderName,
			icon: Codicon.folder,
			repositories: [{ uri: repositoryUri, workingDirectory: undefined, detail: undefined, baseBranchName: undefined, baseBranchProtected: undefined }],
			requiresWorkspaceTrust: true,
		};
	}

	// -- Sessions --

	getSessionTypes(_sessionId: string): ISessionType[] {
		return [...this.sessionTypes];
	}

	getSessions(): ISession[] {
		this._ensureSessionCache();
		const sessions: ISession[] = [...this._sessionCache.values()];
		if (this._pendingSession) {
			sessions.push(this._pendingSession);
		}
		return sessions;
	}

	// -- Session Lifecycle --

	createNewSession(workspace: ISessionWorkspace): ISession {
		const workspaceUri = workspace.repositories[0]?.uri;
		if (!workspaceUri) {
			throw new Error('Workspace has no repository URI');
		}

		this._currentNewSession = undefined;
		this._selectedModelId = undefined;

		const resource = URI.from({ scheme: sessionTypeForProvider(DEFAULT_AGENT_PROVIDER), path: `/untitled-${generateUuid()}` });
		const status = observableValue<SessionStatus>(this, SessionStatus.Untitled);
		const title = observableValue(this, '');
		const updatedAt = observableValue(this, new Date());
		const changes = observableValue<readonly IChatSessionFileChange[]>(this, []);
		const modelId = observableValue<string | undefined>(this, undefined);
		const mode = observableValue<{ readonly id: string; readonly kind: string } | undefined>(this, undefined);
		const isArchived = observableValue(this, false);
		const isRead = observableValue(this, true);
		const description = observableValue<IMarkdownString | undefined>(this, undefined);
		const lastTurnEnd = observableValue<Date | undefined>(this, undefined);
		const createdAt = new Date();

		const mainChat: IChat = {
			resource, createdAt, title, updatedAt, status,
			changes, modelId, mode, isArchived, isRead, description, lastTurnEnd,
		};

		const session: ISession = {
			sessionId: `${this.id}:${resource.toString()}`,
			resource,
			providerId: this.id,
			sessionType: this.sessionTypes[0].id,
			icon: Codicon.vm,
			createdAt,
			workspace: observableValue(this, workspace),
			title,
			updatedAt,
			status,
			changes,
			modelId,
			mode,
			loading: observableValue(this, false),
			isArchived,
			isRead,
			description,
			lastTurnEnd,
			gitHubInfo: observableValue(this, undefined),
			mainChat,
			chats: constObservable([mainChat]),
		};
		this._currentNewSession = session;
		this._currentNewSessionStatus = status;
		return session;
	}

	setSessionType(_sessionId: string, _type: ISessionType): ISession {
		throw new Error('Local agent host sessions do not support changing session type');
	}

	setModel(sessionId: string, modelId: string): void {
		if (this._currentNewSession?.sessionId === sessionId) {
			this._selectedModelId = modelId;
		}
	}

	// -- Session Actions --

	async archiveSession(sessionId: string): Promise<void> {
		const rawId = this._rawIdFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		if (cached && rawId) {
			cached.isArchived.set(true, undefined);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
			const action = { type: ActionType.SessionIsDoneChanged as const, session: AgentSession.uri(cached.agentProvider, rawId).toString(), isDone: true };
			this._agentHostService.dispatch(action);
		}
	}

	async unarchiveSession(sessionId: string): Promise<void> {
		const rawId = this._rawIdFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		if (cached && rawId) {
			cached.isArchived.set(false, undefined);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
			const action = { type: ActionType.SessionIsDoneChanged as const, session: AgentSession.uri(cached.agentProvider, rawId).toString(), isDone: false };
			this._agentHostService.dispatch(action);
		}
	}

	async deleteSession(sessionId: string): Promise<void> {
		const rawId = this._rawIdFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		if (cached && rawId) {
			await this._agentHostService.disposeSession(AgentSession.uri(cached.agentProvider, rawId));
			this._sessionCache.delete(rawId);
			this._onDidChangeSessions.fire({ added: [], removed: [cached], changed: [] });
		}
	}

	async renameChat(sessionId: string, _chatUri: URI, title: string): Promise<void> {
		const rawId = this._rawIdFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		if (cached && rawId) {
			cached.title.set(title, undefined);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
			const action = { type: ActionType.SessionTitleChanged as const, session: AgentSession.uri(cached.agentProvider, rawId).toString(), title };
			this._agentHostService.dispatch(action);
		}
	}

	async deleteChat(_sessionId: string, _chatUri: URI): Promise<void> {
		// Agent host sessions don't support deleting individual chats
	}

	setRead(sessionId: string, read: boolean): void {
		const rawId = this._rawIdFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		if (cached && rawId) {
			cached.isRead.set(read, undefined);
			const action = { type: ActionType.SessionIsReadChanged as const, session: AgentSession.uri(cached.agentProvider, rawId).toString(), isRead: read };
			this._agentHostService.dispatch(action);
		}
	}

	async sendAndCreateChat(chatId: string, options: ISendRequestOptions): Promise<ISession> {
		const session = this._currentNewSession;
		if (!session || session.sessionId !== chatId) {
			throw new Error(`Session '${chatId}' not found or not a new session`);
		}

		const { query, attachedContext } = options;

		const sessionType = session.resource.scheme;
		const contribution = this._chatSessionsService.getChatSessionContribution(sessionType);

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

		// Open chat widget — getOrCreateChatSession will wait for the session
		// handler to become available via canResolveChatSession internally.
		await this._chatSessionsService.getOrCreateChatSession(session.resource, CancellationToken.None);
		const chatWidget = await this._chatWidgetService.openSession(session.resource, ChatViewPaneTarget);
		if (!chatWidget) {
			throw new Error('[LocalAgentHost] Failed to open chat widget');
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

		this._ensureSessionCache();
		const existingKeys = new Set(this._sessionCache.keys());

		const result = await this._chatService.sendRequest(session.resource, query, sendOptions);
		if (result.kind === 'rejected') {
			throw new Error(`[LocalAgentHost] sendRequest rejected: ${result.reason}`);
		}

		this._currentNewSessionStatus?.set(SessionStatus.InProgress, undefined);
		const newSession = session;
		this._pendingSession = newSession;
		this._onDidChangeSessions.fire({ added: [newSession], removed: [], changed: [] });

		this._selectedModelId = undefined;
		this._currentNewSessionStatus = undefined;

		try {
			const committedSession = await this._waitForNewSession(existingKeys);
			if (committedSession) {
				this._currentNewSession = undefined;
				this._onDidReplaceSession.fire({ from: newSession, to: committedSession });
				return committedSession;
			}
		} catch {
			// Timeout — clean up
		} finally {
			this._pendingSession = undefined;
		}

		this._currentNewSession = undefined;
		return newSession;
	}

	// -- Private: Session Cache --

	private _ensureSessionCache(): void {
		if (this._cacheInitialized) {
			return;
		}
		this._cacheInitialized = true;
		this._refreshSessions();
	}

	private async _refreshSessions(): Promise<void> {
		try {
			const sessions = await this._agentHostService.listSessions();
			const currentKeys = new Set<string>();
			const added: ISession[] = [];
			const changed: ISession[] = [];

			for (const meta of sessions) {
				const rawId = AgentSession.id(meta.session);
				const provider = AgentSession.provider(meta.session) ?? DEFAULT_AGENT_PROVIDER;
				currentKeys.add(rawId);

				const existing = this._sessionCache.get(rawId);
				if (existing) {
					if (existing.update(meta)) {
						changed.push(existing);
					}
				} else {
					const cached = new LocalSessionAdapter(meta, this.id, sessionTypeForProvider(provider), this.sessionTypes[0].id);
					this._sessionCache.set(rawId, cached);
					added.push(cached);
				}
			}

			const removed: ISession[] = [];
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
			// Agent host may not be ready yet
		}
	}

	private async _waitForNewSession(existingKeys: Set<string>): Promise<ISession | undefined> {
		await this._refreshSessions();
		for (const [key, cached] of this._sessionCache) {
			if (!existingKeys.has(key)) {
				return cached;
			}
		}

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

		const workingDir = typeof summary.workingDirectory === 'string'
			? URI.parse(summary.workingDirectory)
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
		const provider = AgentSession.provider(sessionUri) ?? DEFAULT_AGENT_PROVIDER;
		const cached = new LocalSessionAdapter(meta, this.id, sessionTypeForProvider(provider), this.sessionTypes[0].id);
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

	private _handleTitleChanged(session: string, title: string): void {
		const rawId = AgentSession.id(session);
		const cached = this._sessionCache.get(rawId);
		if (cached) {
			cached.title.set(title, undefined);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
		}
	}

	private _handleIsReadChanged(session: string, isRead: boolean): void {
		const rawId = AgentSession.id(session);
		const cached = this._sessionCache.get(rawId);
		if (cached) {
			cached.isRead.set(isRead, undefined);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
		}
	}

	private _handleIsDoneChanged(session: string, isDone: boolean): void {
		const rawId = AgentSession.id(session);
		const cached = this._sessionCache.get(rawId);
		if (cached) {
			cached.isArchived.set(isDone, undefined);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
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

	// -- Private: Browse --

	private async _browseForFolder(): Promise<ISessionWorkspace | undefined> {
		try {
			const selected = await this._fileDialogService.showOpenDialog({
				canSelectFiles: false,
				canSelectFolders: true,
				canSelectMany: false,
				title: localize('selectLocalFolder', "Select Folder"),
			});
			if (selected?.[0]) {
				return this.resolveWorkspace(selected[0]);
			}
		} catch {
			// dialog was cancelled or failed
		}
		return undefined;
	}
}
