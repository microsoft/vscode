/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, ISettableObservable, autorun, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { ActiveSessionProviderIdContext, ActiveSessionTypeContext, IsActiveSessionArchivedContext, IsActiveSessionBackgroundProviderContext, IsNewChatInSessionContext, IsNewChatSessionContext } from '../../../common/contextkeys.js';
import { ActiveSessionSupportsMultiChatContext, IActiveSession, ISessionsChangeEvent, ISessionsManagementService } from '../common/sessionsManagement.js';
import { ISessionsProvidersChangeEvent, ISessionsProvidersService } from './sessionsProvidersService.js';
import { ISendRequestOptions, ISessionChangeEvent, ISessionsProvider } from '../common/sessionsProvider.js';
import { COPILOT_CLI_SESSION_TYPE, IChat, ISession, SessionStatus, ISessionType } from '../common/session.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';

const LAST_SELECTED_SESSION_KEY = 'agentSessions.lastSelectedSession';
const ACTIVE_PROVIDER_KEY = 'sessions.activeProviderId';

class SessionsManagementService extends Disposable implements ISessionsManagementService {

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
	private readonly _isNewChatInSessionContext: IContextKey<boolean>;
	private readonly _activeSessionProviderId: IContextKey<string>;
	private readonly _activeSessionType: IContextKey<string>;
	private readonly _isBackgroundProvider: IContextKey<boolean>;
	private readonly _isActiveSessionArchived: IContextKey<boolean>;
	private readonly _supportsMultiChat: IContextKey<boolean>;
	private _activeChatObservable: ISettableObservable<IChat> | undefined;
	private _activeSessionDisposables = this._register(new DisposableStore());
	private readonly _providerListeners = this._register(new DisposableMap<string, IDisposable>());

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
		this._isNewChatInSessionContext = IsNewChatInSessionContext.bindTo(contextKeyService);
		this._activeSessionProviderId = ActiveSessionProviderIdContext.bindTo(contextKeyService);
		this._activeSessionType = ActiveSessionTypeContext.bindTo(contextKeyService);
		this._isBackgroundProvider = IsActiveSessionBackgroundProviderContext.bindTo(contextKeyService);
		this._isActiveSessionArchived = IsActiveSessionArchivedContext.bindTo(contextKeyService);
		this._supportsMultiChat = ActiveSessionSupportsMultiChatContext.bindTo(contextKeyService);

		// Load last selected session
		this.lastSelectedSession = this.loadLastSelectedSession();

		// Save on shutdown
		this._register(this.storageService.onWillSaveState(() => this.saveLastSelectedSession()));

		// Restore or auto-select active provider
		this._initActiveProvider();
		this._register(this.sessionsProvidersService.onDidChangeProviders(e => {
			this._onProvidersChanged(e);
			this._initActiveProvider();
			this._updateSessionTypes();
		}));
		this._subscribeToProviders(this.sessionsProvidersService.getProviders());
	}

	private _onProvidersChanged(e: ISessionsProvidersChangeEvent): void {
		for (const provider of e.removed) {
			this._providerListeners.deleteAndDispose(provider.id);
		}
		if (e.added.length) {
			this._subscribeToProviders(e.added);
		}
	}

	private _subscribeToProviders(providers: readonly ISessionsProvider[]): void {
		for (const provider of providers) {
			const disposables = new DisposableStore();
			disposables.add(provider.onDidChangeSessions(e => this.onDidChangeSessionsFromSessionsProviders(e)));
			if (provider.onDidReplaceSession) {
				disposables.add(provider.onDidReplaceSession(e => this.onDidReplaceSession(e.from, e.to)));
			}
			if (provider.onDidChangeSessionTypes) {
				disposables.add(provider.onDidChangeSessionTypes(() => this._updateSessionTypes()));
			}
			this._providerListeners.set(provider.id, disposables);
		}
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
		const sessions: ISession[] = [];
		for (const provider of this.sessionsProvidersService.getProviders()) {
			sessions.push(...provider.getSessions());
		}
		return sessions;
	}

	getSession(resource: URI): ISession | undefined {
		return this.getSessions().find(s =>
			this.uriIdentityService.extUri.isEqual(s.resource, resource)
		);
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
		const changed = this._sessionTypes.length !== newTypes.length
			|| this._sessionTypes.some((t, i) => t.id !== newTypes[i].id || t.label !== newTypes[i].label);
		if (changed) {
			this._sessionTypes = newTypes;
			this._onDidChangeSessionTypes.fire();
		}
	}

	async openChat(session: ISession, chatUri: URI): Promise<void> {
		this.logService.info(`[SessionsManagement] openChat: ${chatUri.toString()} provider=${session.providerId}`);
		this.isNewChatSessionContext.set(false);
		this.setActiveSession(session);

		// Find the chat and update active chat
		let chat: IChat | undefined;
		if (this._activeChatObservable) {
			const activeSession = this._activeSession.get();
			if (activeSession) {
				chat = activeSession.chats.get().find(c => this.uriIdentityService.extUri.isEqual(c.resource, chatUri));
				if (chat) {
					this._activeChatObservable.set(chat, undefined);
				}
			}
		}

		// If the chat is untitled (not yet sent), show the new-chat-in-session view
		if (chat && chat.status.get() === SessionStatus.Untitled) {
			this._isNewChatInSessionContext.set(true);
			return;
		}

		this._isNewChatInSessionContext.set(false);
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
		this._isNewChatInSessionContext.set(false);
		this.setActiveSession(sessionData);

		await this.chatWidgetService.openSession(sessionData.resource, ChatViewPaneTarget, { preserveFocus: options?.preserveFocus });
	}

	unsetNewSession(): void {
		this.setActiveSession(undefined);
	}

	createNewSession(providerId: string, repositoryUri: URI, sessionTypeId?: string): ISession {
		if (!this.isNewChatSessionContext.get()) {
			this.isNewChatSessionContext.set(true);
		}

		const provider = this.sessionsProvidersService.getProviders().find(p => p.id === providerId);
		if (!provider) {
			throw new Error(`Sessions provider '${providerId}' not found`);
		}

		if (!sessionTypeId) {
			const defaultType = provider.getSessionTypes(repositoryUri)[0];
			if (!defaultType) {
				throw new Error(`No session types available for provider '${providerId}'`);
			}
			sessionTypeId = defaultType.id;
		}

		const session = provider.createNewSession(repositoryUri, sessionTypeId);
		this.setActiveSession(session);
		return session;
	}

	async sendAndCreateChat(session: ISession, options: ISendRequestOptions): Promise<void> {
		this.isNewChatSessionContext.set(false);
		this._isNewChatInSessionContext.set(false);

		const setActiveChatToLast = () => {
			const activeSession = this._activeSession.get();
			if (this._activeChatObservable && activeSession?.sessionId === session.sessionId && this.uriIdentityService.extUri.isEqual(activeSession.activeChat.get().resource, (<IActiveSession>session).activeChat?.get().resource)) {
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
			const provider = this._getProvider(session);
			if (!provider) {
				throw new Error(`Sessions provider '${session.providerId}' not found`);
			}
			const updatedSession = await provider.sendAndCreateChat(session.sessionId, options);
			if (updatedSession.sessionId !== session.sessionId && this._activeSession.get()?.sessionId === session.sessionId) {
				this.logService.info(`[SessionsManagement] sendAndCreateChat: active session replaced: ${session.sessionId} -> ${updatedSession.sessionId}`);
				this.setActiveSession(updatedSession);
				setActiveChatToLast();
			}
		} finally {
			chatsListener.dispose();
		}
	}

	async sendRequest(session: ISession, chat: IChat, options: ISendRequestOptions): Promise<void> {
		this.isNewChatSessionContext.set(false);
		this._isNewChatInSessionContext.set(false);

		// Keep the sent chat as the active chat
		if (this._activeChatObservable) {
			this._activeChatObservable.set(chat, undefined);
		}

		const provider = this._getProvider(session);
		if (!provider) {
			throw new Error(`Sessions provider '${session.providerId}' not found`);
		}

		const updatedSession = await provider.sendRequest(session.sessionId, chat.resource, options);
		if (updatedSession.sessionId !== session.sessionId && this._activeSession.get()?.sessionId === session.sessionId) {
			this.logService.info(`[SessionsManagement] sendRequest: active session replaced: ${session.sessionId} -> ${updatedSession.sessionId}`);
			this.setActiveSession(updatedSession);
		}
	}

	openNewSessionView(): void {
		// No-op if the current session is already a new session
		if (this.isNewChatSessionContext.get()) {
			return;
		}
		this.setActiveSession(undefined);
		this.isNewChatSessionContext.set(true);
		this._isNewChatInSessionContext.set(false);
	}

	openNewChatInSession(session: ISession): void {
		const provider = this._getProvider(session);
		if (!provider) {
			this.logService.warn(`[SessionsManagement] openNewChatInSession: provider '${session.providerId}' not found`);
			return;
		}

		// Reuse an existing untitled chat if one exists, otherwise create a new one
		const existingUntitled = session.chats.get().find(c => c.status.get() === SessionStatus.Untitled);
		const chat = existingUntitled ?? provider.addChat(session.sessionId);

		this.setActiveSession(session);

		// Set the chat as the active chat
		if (this._activeChatObservable) {
			this._activeChatObservable.set(chat, undefined);
		}

		this._isNewChatInSessionContext.set(true);
	}

	private setActiveSession(session: ISession | undefined): void {
		const previousSession = this._activeSession.get();
		if (previousSession?.sessionId === session?.sessionId) {
			return;
		}

		// Update context keys from session data
		this._activeSessionProviderId.set(session?.providerId ?? '');
		this._activeSessionType.set(session?.sessionType ?? '');
		this._isBackgroundProvider.set(session?.sessionType === COPILOT_CLI_SESSION_TYPE);
		this._isActiveSessionArchived.set(session?.isArchived.get() ?? false);
		this._supportsMultiChat.set(session?.capabilities.supportsMultipleChats ?? false);

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

			// Track archived state changes for the active session
			let wasArchived = session.isArchived.get();
			this._activeSessionDisposables.add(autorun(reader => {
				const isArchived = session.isArchived.read(reader);
				this._isActiveSessionArchived.set(isArchived);
				if (isArchived && !wasArchived) {
					this.openNewSessionView();
				}
				wasArchived = isArchived;
			}));

			// Track chat list changes — if the active chat is removed, fall back
			this._activeSessionDisposables.add(autorun(reader => {
				const chats = session.chats.read(reader);
				const activeChat = activeChatObs.read(reader);
				if (activeChat && !chats.some(c => this.uriIdentityService.extUri.isEqual(c.resource, activeChat.resource))) {
					const fallback = chats[chats.length - 1] ?? session.mainChat;
					if (fallback) {
						this.openChat(session, fallback.resource);
					}
				}
			}));
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

	private _getProvider(session: ISession): ISessionsProvider | undefined {
		return this.sessionsProvidersService.getProviders().find(p => p.id === session.providerId);
	}

	async archiveSession(session: ISession): Promise<void> {
		await this._getProvider(session)?.archiveSession(session.sessionId);
	}

	async unarchiveSession(session: ISession): Promise<void> {
		await this._getProvider(session)?.unarchiveSession(session.sessionId);
	}

	async deleteSession(session: ISession): Promise<void> {
		await this._getProvider(session)?.deleteSession(session.sessionId);
	}

	async deleteChat(session: ISession, chatUri: URI): Promise<void> {
		await this._getProvider(session)?.deleteChat(session.sessionId, chatUri);
	}

	async renameChat(session: ISession, chatUri: URI, title: string): Promise<void> {
		await this._getProvider(session)?.renameChat(session.sessionId, chatUri, title);
	}
}

registerSingleton(ISessionsManagementService, SessionsManagementService, InstantiationType.Delayed);
