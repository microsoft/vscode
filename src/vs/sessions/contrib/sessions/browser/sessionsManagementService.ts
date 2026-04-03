/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { IObservable, ISettableObservable, autorun, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { COPILOT_CLI_SESSION_TYPE } from './sessionTypes.js';
import { ISessionsProvidersService } from './sessionsProvidersService.js';
import { ISessionType, ISendRequestOptions, ISessionChangeEvent } from './sessionsProvider.js';
import { ISession, IChat, ISessionWorkspace, SessionStatus } from '../common/sessionData.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { ActiveSessionProviderIdContext, ActiveSessionTypeContext, IsActiveSessionBackgroundProviderContext, IsNewChatSessionContext } from '../../../common/contextkeys.js';

export const ActiveSessionSupportsMultiChatContext = new RawContextKey<boolean>('activeSessionSupportsMultiChat', false, localize('activeSessionSupportsMultiChat', "Whether the active session's provider supports multiple chats per session"));

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
 * An active session extends {@link ISession} with the currently focused chat.
 */
export interface IActiveSession extends ISession {
	/** The currently active chat within this session. */
	readonly activeChat: IObservable<IChat>;
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
	 * Observable for the currently active session as {@link IActiveSession}.
	 */
	readonly activeSession: IObservable<IActiveSession | undefined>;

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
	 * Open a specific chat within a session.
	 * Sets `isNewChatSession` context to false and opens the chat.
	 */
	openChat(session: ISession, chatUri: URI): Promise<void>;

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
	 * Send a request, creating a new chat in the session.
	 */
	sendAndCreateChat(session: ISession, options: ISendRequestOptions): Promise<void>;

	/**
	 * Update the session type for a new session.
	 */
	setSessionType(session: ISession, type: ISessionType): Promise<void>;

	// -- Session Actions --

	/** Archive a session. */
	archiveSession(session: ISession): Promise<void>;
	/** Unarchive a session. */
	unarchiveSession(session: ISession): Promise<void>;
	/** Delete a session. */
	deleteSession(session: ISession): Promise<void>;
	/** Delete a single chat from a session by its URI. */
	deleteChat(session: ISession, chatUri: URI): Promise<void>;
	/** Rename a chat within a session. */
	renameChat(session: ISession, chatUri: URI, title: string): Promise<void>;
	/** Mark a session as read or unread. */
	setRead(session: ISession, read: boolean): void;
}

export const ISessionsManagementService = createDecorator<ISessionsManagementService>('sessionsManagementService');

export class SessionsManagementService extends Disposable implements ISessionsManagementService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeSessions = this._register(new Emitter<ISessionsChangeEvent>());
	readonly onDidChangeSessions: Event<ISessionsChangeEvent> = this._onDidChangeSessions.event;

	private readonly _onDidChangeSessionTypes = this._register(new Emitter<void>());
	readonly onDidChangeSessionTypes: Event<void> = this._onDidChangeSessionTypes.event;

	private _sessionTypes: readonly ISessionType[] = [];

	private readonly _activeSession = observableValue<IActiveSession | undefined>(this, undefined);
	readonly activeSession: IObservable<IActiveSession | undefined> = this._activeSession;
	private readonly _activeProviderId = observableValue<string | undefined>(this, undefined);
	readonly activeProviderId: IObservable<string | undefined> = this._activeProviderId;
	private lastSelectedSession: URI | undefined;
	private readonly isNewChatSessionContext: IContextKey<boolean>;
	private readonly _activeSessionProviderId: IContextKey<string>;
	private readonly _activeSessionType: IContextKey<string>;
	private readonly _isBackgroundProvider: IContextKey<boolean>;
	private readonly _supportsMultiChat: IContextKey<boolean>;
	private _activeChatObservable: ISettableObservable<IChat> | undefined;
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
		this._supportsMultiChat = ActiveSessionSupportsMultiChatContext.bindTo(contextKeyService);

		// Load last selected session
		this.lastSelectedSession = this.loadLastSelectedSession();

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

	private onDidReplaceSession(from: ISession, to: ISession): void {
		if (this._activeSession.get()?.sessionId === from.sessionId) {
			this.setActiveSession(to);
			this._onDidChangeSessions.fire({
				added: [],
				removed: [from],
				changed: [to],
			});
		}
	}

	private onDidChangeSessionsFromSessionsProviders(e: ISessionChangeEvent): void {
		this._onDidChangeSessions.fire(e);
		const currentActive = this._activeSession.get();

		if (!currentActive) {
			return;
		}

		if (e.removed.length) {
			if (e.removed.some(r => r.sessionId === currentActive.sessionId)) {
				this.openNewSessionView();
				return;
			}
		}
	}

	getSessions(): ISession[] {
		return this.sessionsProvidersService.getSessions();
	}

	getSession(resource: URI): ISession | undefined {
		return this.sessionsProvidersService.getSessions().find(s =>
			this.uriIdentityService.extUri.isEqual(s.resource, resource)
		);
	}

	getSessionTypes(session: ISession): ISessionType[] {
		const provider = this.sessionsProvidersService.getProviders().find(p => p.id === session.providerId);
		if (!provider) {
			return [];
		}
		return provider.getSessionTypes(session.sessionId);
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

	async openChat(session: ISession, chatUri: URI): Promise<void> {
		this.logService.info(`[SessionsManagement] openChat: ${chatUri.toString()} provider=${session.providerId}`);
		this.isNewChatSessionContext.set(false);
		this.setActiveSession(session);

		// Update active chat
		if (this._activeChatObservable) {
			const activeSession = this._activeSession.get();
			if (activeSession) {
				const chat = activeSession.chats.get().find(c => this.uriIdentityService.extUri.isEqual(c.resource, chatUri));
				if (chat) {
					this._activeChatObservable.set(chat, undefined);
				}
			}
		}

		await this.chatWidgetService.openSession(chatUri, ChatViewPaneTarget);
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
		this.setRead(sessionData, true); // mark as read when opened

		await this.chatWidgetService.openSession(sessionData.resource, ChatViewPaneTarget, { preserveFocus: options?.preserveFocus });
	}

	createNewSession(providerId: string, workspace: ISessionWorkspace): ISession {
		if (!this.isNewChatSessionContext.get()) {
			this.isNewChatSessionContext.set(true);
		}

		const provider = this.sessionsProvidersService.getProviders().find(p => p.id === providerId);
		if (!provider) {
			throw new Error(`Sessions provider '${providerId}' not found`);
		}

		const session = provider.createNewSession(workspace);
		this.setActiveSession(session);
		return session;
	}

	async setSessionType(session: ISession, type: ISessionType): Promise<void> {
		const provider = this.sessionsProvidersService.getProviders().find(p => p.id === session.providerId);
		if (!provider) {
			throw new Error(`Sessions provider '${session.providerId}' not found`);
		}

		const updatedSession = provider.setSessionType(session.sessionId, type);

		const activeSession = this._activeSession.get();
		if (activeSession && activeSession.sessionId === updatedSession.sessionId) {
			this.setActiveSession(updatedSession);
		}
	}

	async sendAndCreateChat(session: ISession, options: ISendRequestOptions): Promise<void> {
		this.isNewChatSessionContext.set(false);

		const setActiveChatToLast = () => {
			const activeSession = this._activeSession.get();
			if (this._activeChatObservable && activeSession) {
				const chats = activeSession.chats.get();
				const lastChat = chats[chats.length - 1];
				if (lastChat) {
					this._activeChatObservable.set(lastChat, undefined);
				}
			}
		};

		// Listen for chats changing during the send (subsequent chat appears in the group)
		const chatsListener = autorun(reader => {
			session.chats.read(reader);
			setActiveChatToLast();
		});

		try {
			const updatedSession = await this.sessionsProvidersService.sendAndCreateChat(session.sessionId, options);
			this.setActiveSession(updatedSession);
			setActiveChatToLast();
		} finally {
			chatsListener.dispose();
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
		const provider = session ? this.sessionsProvidersService.getProviders().find(p => p.id === session.providerId) : undefined;
		this._supportsMultiChat.set(provider?.capabilities.multipleChatsPerSession ?? false);

		if (session && session.status.get() !== SessionStatus.Untitled) {
			this.lastSelectedSession = session.resource;
		}

		if (session) {
			this.logService.info(`[ActiveSessionService] Active session changed: ${session.resource.toString()}`);
		} else {
			this.logService.trace('[ActiveSessionService] Active session cleared');
		}

		this._activeSessionDisposables.clear();

		if (session) {
			// Create the active chat observable, defaulting to the first chat
			const activeChatObs = observableValue<IChat>(`activeChat-${session.sessionId}`, session.chats.get()[0]);
			this._activeChatObservable = activeChatObs;
			const activeSession: IActiveSession = {
				...session,
				activeChat: activeChatObs,
			};

			this._activeSession.set(activeSession, undefined);

			// Listen for the active session becoming archived
			if (!session.isArchived.get()) {
				this._activeSessionDisposables.add(autorun(reader => {
					if (session.isArchived.read(reader)) {
						this.openNewSessionView();
					}
				}));
			}
		} else {
			this._activeChatObservable = undefined;
			this._activeSession.set(undefined, undefined);
		}
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
		await this.sessionsProvidersService.archiveSession(session.sessionId);
	}

	async unarchiveSession(session: ISession): Promise<void> {
		await this.sessionsProvidersService.unarchiveSession(session.sessionId);
	}

	async deleteSession(session: ISession): Promise<void> {
		await this.sessionsProvidersService.deleteSession(session.sessionId);
	}

	async deleteChat(session: ISession, chatUri: URI): Promise<void> {
		await this.sessionsProvidersService.deleteChat(session.sessionId, chatUri);
	}

	async renameChat(session: ISession, chatUri: URI, title: string): Promise<void> {
		await this.sessionsProvidersService.renameChat(session.sessionId, chatUri, title);
	}

	setRead(session: ISession, read: boolean): void {
		this.sessionsProvidersService.setRead(session.sessionId, read);
	}
}

//#endregion
