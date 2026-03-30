/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { IObservable, IReader, autorun, observableFromEvent, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { COPILOT_CLI_SESSION_TYPE } from './sessionTypes.js';
import { ISessionsProvidersService } from './sessionsProvidersService.js';
import { ISessionType, ISendRequestOptions, ISessionChangeEvent } from './sessionsProvider.js';
import { SessionsGroupModel } from './sessionsGroupModel.js';
import { ISession, ISessionWorkspace, ISessionData, IChat, SessionStatus } from '../common/sessionData.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';

/**
 * Configuration properties available on new/pending sessions.
 * Not part of the public {@link ISession} contract but present on
 * concrete session implementations (CopilotCLISession, RemoteNewSession, AgentHostNewSession).
 */

export const IsNewChatSessionContext = new RawContextKey<boolean>('isNewChatSession', true);

/**
 * The provider ID of the active session (e.g., 'default-copilot', 'agenthost-hostA').
 */
export const ActiveSessionProviderIdContext = new RawContextKey<string>('activeSessionProviderId', '', localize('activeSessionProviderId', "The provider ID of the active session"));

/**
 * The session type of the active session (e.g., 'copilotcli', 'cloud').
 */
export const ActiveSessionTypeContext = new RawContextKey<string>('activeSessionType', '', localize('activeSessionType', "The session type of the active session"));

export const IsActiveSessionBackgroundProviderContext = new RawContextKey<boolean>('isActiveSessionBackgroundProvider', false, localize('isActiveSessionBackgroundProvider', "Whether the active session uses the background agent provider"));

//#region Active Session Service

const LAST_SELECTED_SESSION_KEY = 'agentSessions.lastSelectedSession';
const ACTIVE_PROVIDER_KEY = 'sessions.activeProviderId';

/**
 * Event fired when sessions change within a provider.
 */
export interface ISessionsChangeEvent {
	readonly added: readonly ISession[];
	readonly removed: readonly ISession[];
	readonly changed: readonly ISession[];
}

/**
 * An active session item extends IChatSessionItem with repository information.
 * - For agent session items: repository is the workingDirectory from metadata
 * - For new sessions: repository comes from the session option with id 'repository'
 */
export interface ISessionsManagementService {
	readonly _serviceBrand: undefined;

	// -- Sessions --

	/**
	 * Get all sessions from all registered providers.
	 */
	getSessions(): ISession[];

	/**
	 * Get a session by its resource URI.
	 */
	getSession(resource: URI): ISession | undefined;

	/**
	 * Get all session types from all registered providers.
	 */
	getSessionTypes(session: ISession): ISessionType[];

	/**
	 * Get all session types from all registered providers.
	 */
	getAllSessionTypes(): ISessionType[];

	/**
	 * Fires when available session types change (providers added/removed).
	 */
	readonly onDidChangeSessionTypes: Event<void>;

	/**
	 * Fires when sessions change across any provider.
	 */
	readonly onDidChangeSessions: Event<ISessionsChangeEvent>;

	// -- Active Session --

	/**
	 * Observable for the currently active session as {@link ISession}.
	 */
	readonly activeSession: IObservable<ISession | undefined>;

	/**
	 * Observable for the currently active sessions provider ID.
	 * When only one provider exists, it is selected automatically.
	 */
	readonly activeProviderId: IObservable<string | undefined>;

	/**
	 * Set the active sessions provider by ID.
	 */
	setActiveProvider(providerId: string): void;

	/**
	 * Select an existing session as the active session.
	 * Sets `isNewChatSession` context to false and opens the active chat belonging to the session.
	 */
	openSession(sessionResource: URI, options?: { preserveFocus?: boolean }): Promise<void>;

	/**
	 * Select an existing session as the active session.
	 * Sets `isNewChatSession` context to false and opens the session.
	 */
	openChat(chatResource: URI): Promise<void>;

	/**
	 * Switch to the new-session view.
	 * No-op if the current session is already a new session.
	 */
	openNewSessionView(): void;

	/**
	 * Create a new session for the given workspace.
	 * Delegates to the provider identified by providerId.
	 */
	createNewSession(providerId: string, workspace: ISessionWorkspace): ISession;

	/**
	 * Send a request to an existing session
	 */
	sendAndCreateChat(options: ISendRequestOptions, session: ISession): Promise<void>;

	/**
	 * Send the initial request for a session.
	 */
	sendRequest(chat: IChat, options: ISendRequestOptions, session?: ISession): Promise<void>;

	/**
	 * Update the session type for a new session.
	 * The provider may recreate the session object.
	 * If the session is the active session, the active session data is updated.
	 */
	setSessionType(chat: IChat, type: ISessionType): Promise<void>;

	// -- Session Actions --

	/** Archive a session. */
	archiveSession(session: ISession): Promise<void>;
	/** Unarchive a session. */
	unarchiveSession(session: ISession): Promise<void>;
	/** Delete a session. */
	deleteSession(session: ISession): Promise<void>;
	/** Delete a single chat from a session. */
	deleteChat(chat: IChat): Promise<void>;
	/** Rename a chat. */
	renameChat(chat: IChat, title: string): Promise<void>;
	/** Mark a session as read or unread. */
	setRead(session: ISession, read: boolean): void;
}

export const ISessionsManagementService = createDecorator<ISessionsManagementService>('sessionsManagementService');

function toChat(data: ISessionData): IChat {
	return {
		chatId: data.id,
		resource: data.resource,
		providerId: data.providerId,
		sessionType: data.sessionType,
		icon: data.icon,
		createdAt: data.createdAt,
		workspace: data.workspace,
		title: data.title,
		updatedAt: data.updatedAt,
		status: data.status,
		changes: data.changes,
		modelId: data.modelId,
		mode: data.mode,
		loading: data.loading,
		isArchived: data.isArchived,
		isRead: data.isRead,
		description: data.description,
		lastTurnEnd: data.lastTurnEnd,
		gitHubInfo: data.gitHubInfo,
	};
}

function latestDateAcrossChats(chats: readonly IChat[], getter: (chat: IChat) => Date | undefined): Date | undefined {
	let latest: Date | undefined;
	for (const chat of chats) {
		const d = getter(chat);
		if (d && (!latest || d > latest)) {
			latest = d;
		}
	}
	return latest;
}

function aggregateStatusAcrossChats(chats: readonly IChat[], reader: IReader): SessionStatus {
	for (const c of chats) {
		if (c.status.read(reader) === SessionStatus.NeedsInput) {
			return SessionStatus.NeedsInput;
		}
	}
	for (const c of chats) {
		if (c.status.read(reader) === SessionStatus.InProgress) {
			return SessionStatus.InProgress;
		}
	}
	return chats[0].status.read(reader);
}

export class SessionsManagementService extends Disposable implements ISessionsManagementService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeSessions = this._register(new Emitter<ISessionsChangeEvent>());
	readonly onDidChangeSessions: Event<ISessionsChangeEvent> = this._onDidChangeSessions.event;

	private readonly _onDidChangeSessionTypes = this._register(new Emitter<void>());
	readonly onDidChangeSessionTypes: Event<void> = this._onDidChangeSessionTypes.event;

	private _sessionTypes: readonly ISessionType[] = [];

	private readonly _activeSession = observableValue<ISession | undefined>(this, undefined);
	readonly activeSession: IObservable<ISession | undefined> = this._activeSession;
	private readonly _activeProviderId = observableValue<string | undefined>(this, undefined);
	readonly activeProviderId: IObservable<string | undefined> = this._activeProviderId;
	private lastSelectedSession: URI | undefined;
	private readonly isNewChatSessionContext: IContextKey<boolean>;
	private readonly _activeSessionProviderId: IContextKey<string>;
	private readonly _activeSessionType: IContextKey<string>;
	private readonly _isBackgroundProvider: IContextKey<boolean>;
	private readonly _groupModel: SessionsGroupModel;
	private readonly _sessionDataCache = new Map<string, ISession>();
	private _activeSessionDisposables = this._register(new DisposableStore());

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
	) {
		super();

		// Bind context key to active session state.
		// isNewSession is false when there are any established sessions in the model.
		this.isNewChatSessionContext = IsNewChatSessionContext.bindTo(contextKeyService);
		this._activeSessionProviderId = ActiveSessionProviderIdContext.bindTo(contextKeyService);
		this._activeSessionType = ActiveSessionTypeContext.bindTo(contextKeyService);
		this._isBackgroundProvider = IsActiveSessionBackgroundProviderContext.bindTo(contextKeyService);

		// Load last selected session
		this.lastSelectedSession = this.loadLastSelectedSession();

		// Initialize group model
		this._groupModel = this._register(new SessionsGroupModel(storageService));

		// Save on shutdown
		this._register(this.storageService.onWillSaveState(() => this.saveLastSelectedSession()));

		// Forward session change events from providers and update active session
		this._register(this.sessionsProvidersService.onDidChangeSessions(e => this.onDidChangeSessionsFromSessionsProviders(e)));

		// When a provider replaces a temp session with a committed one, update the active session
		this._register(this.sessionsProvidersService.onDidReplaceSession(e => this.onDidReplaceSession(e.from, e.to)));

		// Restore or auto-select active provider
		this._initActiveProvider();
		this._register(this.sessionsProvidersService.onDidChangeProviders(() => {
			this._initActiveProvider();
			this._updateSessionTypes();
		}));

		// Track active chat in the group model when the focused session changes in the chat widget
		this._register(this.chatWidgetService.onDidChangeFocusedSession(() => this._syncActiveChatFromWidget()));
		// The chat might have been added to the widget before it was added to the model due to the async approach of the current send implemenation
		this._register(this._groupModel.onDidAddChatToSession(() => this._syncActiveChatFromWidget()));
	}

	private _syncActiveChatFromWidget(): void {
		const widget = this.chatWidgetService.lastFocusedWidget;
		const sessionResource = widget?.viewModel?.sessionResource;
		if (!sessionResource) {
			return;
		}

		// Find the chat data matching this session resource
		const chat = this._getSessionData(sessionResource);
		if (!chat) {
			return;
		}

		// Update the group model's active chat
		this._groupModel.setActiveChatId(chat.id);
	}

	private _initActiveProvider(): void {
		const providers = this.sessionsProvidersService.getProviders();
		if (providers.length === 0) {
			return;
		}

		// If already set and still valid, keep it
		const current = this._activeProviderId.get();
		if (current && providers.some(p => p.id === current)) {
			return;
		}

		// Try to restore from storage
		const stored = this.storageService.get(ACTIVE_PROVIDER_KEY, StorageScope.PROFILE);
		if (stored && providers.some(p => p.id === stored)) {
			this._activeProviderId.set(stored, undefined);
			return;
		}

		// Auto-select the first (or only) provider
		this._activeProviderId.set(providers[0].id, undefined);
	}

	setActiveProvider(providerId: string): void {
		this._activeProviderId.set(providerId, undefined);
		this.storageService.store(ACTIVE_PROVIDER_KEY, providerId, StorageScope.PROFILE, StorageTarget.MACHINE);
	}

	/**
	 * Convert an array of session data into deduplicated sessions using the group model.
	 * Multiple session data entries may map to the same session group; this returns one
	 * {@link ISession} per unique group.
	 */
	private _sessionDataToSessions(chats: readonly ISessionData[]): ISession[] {
		const seen = new Set<string>();
		const sessions: ISession[] = [];
		for (const chat of chats) {
			const groupId = this._groupModel.getSessionIdForChat(chat.id) ?? chat.id;
			if (!seen.has(groupId)) {
				seen.add(groupId);
				sessions.push(this._chatToSession(chat));
			}
		}
		return sessions;
	}

	private onDidReplaceSession(from: ISessionData, to: ISessionData): void {
		if (this._activeSession.get()?.sessionId === this._chatToSession(from).sessionId) {
			this.setActiveSession(this._chatToSession(to));
			this.onDidChangeSessionsFromSessionsProviders({
				added: [],
				removed: [from],
				changed: [to],
			});
		}
	}

	private onDidChangeSessionsFromSessionsProviders(e: ISessionChangeEvent): void {
		const sessionEvent: ISessionsChangeEvent = {
			added: this._sessionDataToSessions(e.added),
			removed: this._sessionDataToSessions(e.removed),
			changed: this._sessionDataToSessions(e.changed),
		};
		this._onDidChangeSessions.fire(sessionEvent);
		const currentActive = this._activeSession.get();

		// Remove chats from the group model and clean up session cache
		for (const removed of e.removed) {
			const sessionId = this._groupModel.getSessionIdForChat(removed.id);
			this._groupModel.removeChat(removed.id);
			if (sessionId && this._groupModel.getChatIds(sessionId).length === 0) {
				this._sessionDataCache.delete(sessionId);
			}
		}

		if (!currentActive) {
			return;
		}

		if (e.removed.length) {
			if (e.removed.some(r => currentActive.chats.get().find(c => c.chatId === r.id))) {
				// Only open new session view if the group has no remaining chats
				if (this._groupModel.getChatIds(currentActive.sessionId).length === 0) {
					this.openNewSessionView();
				}
				return;
			}
		}
	}

	getSessions(): ISession[] {
		const allChats = this.sessionsProvidersService.getSessions();
		const chatById = new Map<string, ISessionData>();
		for (const chat of allChats) {
			chatById.set(chat.id, chat);
		}

		const groupedChats = new Map<string, ISessionData[]>();

		for (const chat of allChats) {
			let groupId = this._groupModel.getSessionIdForChat(chat.id);
			if (!groupId) {
				// No group exists — create a single-chat group
				groupId = chat.id;
				this._groupModel.addChat(groupId, chat.id);
			}
			if (!groupedChats.has(groupId)) {
				groupedChats.set(groupId, []);
			}
		}

		// Order chats within each group according to the group model
		const sessions: ISession[] = [];
		for (const [groupId, chats] of groupedChats) {
			const orderedChatIds = this._groupModel.getChatIds(groupId);
			for (const chatId of orderedChatIds) {
				const chat = chatById.get(chatId);
				if (chat) {
					chats.push(chat);
				}
			}
			if (chats.length > 0) {
				sessions.push(this._chatToSession(chats[0]));
			}
		}
		return sessions;
	}

	private _getSessionData(resource: URI): ISessionData | undefined {
		return this.sessionsProvidersService.getSessions().find(s => this.uriIdentityService.extUri.isEqual(s.resource, resource));
	}

	getSession(resource: URI): ISession | undefined {
		const sessionData = this._getSessionData(resource);
		return sessionData ? this._chatToSession(sessionData) : undefined;
	}

	getSessionTypes(session: ISession): ISessionType[] {
		const provider = this.sessionsProvidersService.getProviders().find(p => p.id === session.providerId);
		if (!provider) {
			return [];
		}
		return provider.getSessionTypes(session.activeChat.get().chatId);
	}

	getAllSessionTypes(): ISessionType[] {
		return [...this._sessionTypes];
	}

	private _collectSessionTypes(): ISessionType[] {
		const types: ISessionType[] = [];
		const seen = new Set<string>();
		for (const provider of this.sessionsProvidersService.getProviders()) {
			for (const type of provider.sessionTypes) {
				if (!seen.has(type.id)) {
					seen.add(type.id);
					types.push(type);
				}
			}
		}
		return types;
	}

	private _updateSessionTypes(): void {
		const newTypes = this._collectSessionTypes();
		const oldIds = new Set(this._sessionTypes.map(t => t.id));
		const newIds = new Set(newTypes.map(t => t.id));
		if (oldIds.size !== newIds.size || [...oldIds].some(id => !newIds.has(id))) {
			this._sessionTypes = newTypes;
			this._onDidChangeSessionTypes.fire();
		}
	}

	async openChat(chatResource: URI): Promise<void> {
		const sessionData = this.getSession(chatResource);
		const chat = this._getSessionData(chatResource);

		this.logService.info(`[SessionsManagement] openChat: ${chatResource.toString()} provider=${chat?.providerId}`);
		this.isNewChatSessionContext.set(false);
		this.setActiveSession(sessionData);

		await this.chatWidgetService.openSession(chatResource, ChatViewPaneTarget);
	}

	async openSession(sessionResource: URI, options?: { preserveFocus?: boolean }): Promise<void> {
		const sessionData = this.getSession(sessionResource);
		if (!sessionData) {
			this.logService.warn(`[SessionsManagement] openSession: session not found: ${sessionResource.toString()}`);
			throw new Error(`Session with resource ${sessionResource.toString()} not found`);
		}
		this.logService.info(`[SessionsManagement] openSession: ${sessionResource.toString()} provider=${sessionData.providerId}`);
		this.isNewChatSessionContext.set(false);
		this.setActiveSession(sessionData);

		const activeChatResource = sessionData.activeChat.get().resource;
		await this.chatWidgetService.openSession(activeChatResource, ChatViewPaneTarget, { preserveFocus: options?.preserveFocus });
	}

	createNewSession(providerId: string, workspace: ISessionWorkspace): ISession {
		if (!this.isNewChatSessionContext.get()) {
			this.isNewChatSessionContext.set(true);
		}

		const provider = this.sessionsProvidersService.getProviders().find(p => p.id === providerId);
		if (!provider) {
			throw new Error(`Sessions provider '${providerId}' not found`);
		}

		const chatData = provider.createNewSession(workspace);
		const sessionData = this._chatToSession(chatData);

		this.setActiveSession(sessionData);
		return sessionData;
	}

	async setSessionType(chat: IChat, type: ISessionType): Promise<void> {
		const provider = this.sessionsProvidersService.getProviders().find(p => p.id === chat.providerId);
		if (!provider) {
			throw new Error(`Sessions provider '${chat.providerId}' not found`);
		}

		const updatedChat = provider.setSessionType(chat.chatId, type);
		const updatedSession = this._chatToSession(updatedChat);

		const activeSession = this._activeSession.get();
		if (activeSession && activeSession.sessionId === updatedSession.sessionId) {
			this.setActiveSession(updatedSession);
		}
	}

	async sendAndCreateChat(options: ISendRequestOptions, session: ISession): Promise<void> {
		const provider = this.sessionsProvidersService.getProviders().find(p => p.id === session.providerId);
		if (!provider) {
			throw new Error(`Sessions provider '${session.providerId}' not found`);
		}

		const chatData = provider.createNewSessionFrom(session.chats.get()[0].chatId);

		const newChat = await provider.sendRequest(chatData.id, options);

		// Set the new agent session as active
		if (newChat) {
			// It's likely that the provider has already added the new chat to the group before provider.sendRequest returns.
			// This will cause a new group to be created for the new chat which actually belongs to the same session.
			if (this._groupModel.hasGroupForSession(newChat.id)) {
				this._groupModel.deleteSession(newChat.id);
			}
			// Add the new chat to the session's group
			this._groupModel.addChat(session.sessionId, newChat.id);
		}

		this._onDidChangeSessions.fire({ added: [], removed: [], changed: [session] });
	}

	async sendRequest(chat: IChat, options: ISendRequestOptions): Promise<void> {
		this.isNewChatSessionContext.set(false);

		const provider = this.sessionsProvidersService.getProviders().find(p => p.id === chat.providerId);
		if (!provider) {
			throw new Error(`Sessions provider '${chat.providerId}' not found`);
		}

		// Delegate to the provider. The temp session appears in the list immediately
		// via the provider's added event. sendRequest resolves with the committed session
		// once the first turn completes and the session is persisted.
		const newChat = await provider.sendRequest(chat.chatId, options);

		// Set the new agent session as active
		if (newChat) {
			// Add the committed chat to the session's group and set it as active
			this._groupModel.addChat(newChat.id, newChat.id);
			this.setActiveSession(this._chatToSession(newChat));
		}
	}

	openNewSessionView(): void {
		// No-op if the current session is already a new session
		if (this.isNewChatSessionContext.get()) {
			return;
		}
		this.setActiveSession(undefined);
		this.isNewChatSessionContext.set(true);
	}

	private setActiveSession(session: ISession | undefined): void {
		if (this._activeSession.get()?.sessionId === session?.sessionId) {
			return;
		}

		// Update context keys from session data
		this._activeSessionProviderId.set(session?.providerId ?? '');
		this._activeSessionType.set(session?.sessionType ?? '');
		this._isBackgroundProvider.set(session?.sessionType === COPILOT_CLI_SESSION_TYPE);

		if (session && session.status.get() !== SessionStatus.Untitled) {
			this.lastSelectedSession = session.resource;
		}

		if (session) {
			this.logService.info(`[ActiveSessionService] Active session changed: ${session.resource.toString()}`);
		} else {
			this.logService.trace('[ActiveSessionService] Active session cleared');
		}

		this._activeSession.set(session, undefined);

		this._activeSessionDisposables.clear();
		// Listen for the active session becoming archived
		if (session && !session.isArchived.get()) {
			this._activeSessionDisposables.add(autorun(reader => {
				if (session.isArchived.read(reader)) {
					this.openNewSessionView();
				}
			}));
		}
	}

	/**
	 * Wraps a primary {@link ISessionData} and its sibling sessions into an {@link ISession}.
	 * Uses `Object.create` so that all properties of the primary session are inherited
	 * through the prototype chain, avoiding issues with class getters.
	 *
	 * The `chats` and `activeChat` observables are derived from the group model
	 * and update automatically when the group model fires a change event.
	 */
	private _chatToSession(chat: ISessionData): ISession {
		const sessionId = this._groupModel.getSessionIdForChat(chat.id) ?? chat.id;

		/* const cached = this._sessionDataCache.get(sessionId);
		if (cached) {
			return cached;
		} */

		const chatsObs = observableFromEvent(
			this,
			Event.filter(this._groupModel.onDidChange, e => e.sessionId === sessionId),
			() => {
				const chatIds = this._groupModel.getChatIds(sessionId);
				if (chatIds.length === 0) {
					return [toChat(chat)];
				}
				const provider = this.sessionsProvidersService.getProviders().find(p => p.id === chat.providerId);
				const providerChats = provider?.getSessions() || [];
				const chatById = new Map(providerChats.map(c => [c.id, c]));
				const chatOrder = new Map(chatIds.map((id, index) => [id, index]));
				const resolved = chatIds.map(id => chatById.get(id)).filter((c): c is ISessionData => !!c);
				if (resolved.length === 0) {
					return [toChat(chat)];
				}
				return resolved.sort((a, b) => (chatOrder.get(a.id) ?? Infinity) - (chatOrder.get(b.id) ?? Infinity)).map(toChat);
			},
		);
		const activeChatObs = chatsObs.map(chats => {
			if (!this._groupModel.hasGroupForSession(sessionId)) {
				return toChat(chat); //new Sessions might not be in the group model
			}
			const activeChatId = this._groupModel.getActiveChatId(sessionId);
			const activeChat = chats.find(c => c.chatId === activeChatId);
			if (!activeChat) {
				throw new Error(`Active chat with ID ${activeChatId} not found in session ${sessionId}`);
			}
			return activeChat;
		});

		const updatedAtObs = chatsObs.map((chats, reader) => latestDateAcrossChats(chats, c => c.updatedAt.read(reader))!);
		const lastTurnEndObs = chatsObs.map((chats, reader) => latestDateAcrossChats(chats, c => c.lastTurnEnd.read(reader)));
		const statusObs = chatsObs.map((chats, reader) => aggregateStatusAcrossChats(chats, reader));
		const isReadObs = chatsObs.map((chats, reader) => chats.every(c => c.isRead.read(reader)));

		const mainChat = chatsObs.get()[0];
		const sessionData: ISession = {
			...mainChat, // Inherit properties from the primary chat
			sessionId,
			status: statusObs,
			updatedAt: updatedAtObs,
			lastTurnEnd: lastTurnEndObs,
			isRead: isReadObs,
			chats: chatsObs,
			activeChat: activeChatObs,
			mainChat,
		};
		this._sessionDataCache.set(sessionId, sessionData);
		return sessionData;
	}

	private loadLastSelectedSession(): URI | undefined {
		const cached = this.storageService.get(LAST_SELECTED_SESSION_KEY, StorageScope.WORKSPACE);
		if (!cached) {
			return undefined;
		}

		try {
			return URI.parse(cached);
		} catch {
			return undefined;
		}
	}

	private saveLastSelectedSession(): void {
		if (this.lastSelectedSession) {
			this.storageService.store(LAST_SELECTED_SESSION_KEY, this.lastSelectedSession.toString(), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}
	}

	// -- Session Actions --

	async archiveSession(session: ISession): Promise<void> {
		for (const chat of session.chats.get()) {
			await this.sessionsProvidersService.archiveSession(chat.chatId);
		}
	}

	async unarchiveSession(session: ISession): Promise<void> {
		for (const chat of session.chats.get()) {
			await this.sessionsProvidersService.unarchiveSession(chat.chatId);
		}
	}

	async deleteSession(session: ISession): Promise<void> {
		this._sessionDataCache.delete(session.sessionId);
		for (const chat of session.chats.get()) {
			// Clear the chat widget before removing from storage
			await this.chatWidgetService.getWidgetBySessionResource(chat.resource)?.clear();
			await this.sessionsProvidersService.deleteSession(chat.chatId);
		}
	}

	async deleteChat(chat: IChat): Promise<void> {
		const session = this.getSession(chat.resource);
		if (!session) {
			throw new Error(`Session for chat ${chat.chatId} not found`);
		}
		if (session.mainChat.chatId === chat.chatId) {
			throw new Error('Cannot delete the main chat of a session. Use deleteSession to delete the entire session.');
		}
		await this.chatWidgetService.getWidgetBySessionResource(chat.resource)?.clear();
		await this.sessionsProvidersService.deleteSession(chat.chatId);
		if (this.activeSession.get()?.sessionId === session.sessionId) {
			await this.openSession(session.mainChat.resource);
		}
	}

	async renameChat(chat: IChat, title: string): Promise<void> {
		await this.sessionsProvidersService.renameSession(chat.chatId, title);
	}

	setRead(session: ISession, read: boolean): void {
		for (const chat of session.chats.get()) {
			this.sessionsProvidersService.setRead(chat.chatId, read);
		}
	}
}

//#endregion
