/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { IObservable, ISettableObservable, autorun, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ChatViewId, ChatViewPaneTarget, IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { IProgressService } from '../../../../platform/progress/common/progress.js';
import { IAgentSessionsService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { ActiveSessionProviderIdContext, ActiveSessionTypeContext, IsActiveSessionArchivedContext, ActiveSessionWorkspaceIsVirtualContext, IsNewChatInSessionContext, IsNewChatSessionContext } from '../../../common/contextkeys.js';
import { ActiveSessionSupportsMultiChatContext, IActiveSession, ISessionsChangeEvent, ISessionsManagementService } from '../common/sessionsManagement.js';
import { ISessionsProvidersChangeEvent, ISessionsProvidersService } from './sessionsProvidersService.js';
import { ISendRequestOptions, ISessionChangeEvent, ISessionsProvider } from '../common/sessionsProvider.js';
import { IChat, ISession, SessionStatus, ISessionType } from '../common/session.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../common/agentHostSessionsProvider.js';
import { SessionsNavigation } from './sessionNavigation.js';

const ACTIVE_SESSION_STATES_KEY = 'agentSessions.activeSessionStates';

/**
 * Persisted state for a session.
 * Extend this interface to store additional per-session state that should be
 * remembered across restarts.
 */
interface ISessionState {
	/** The resource URI of the session. */
	sessionResource: string;
	/** The resource URI of the last active chat within the session. */
	activeChatResource?: string;
	/** Whether this session was the active session at the time of save. */
	isActive?: boolean;
}

export class SessionsManagementService extends Disposable implements ISessionsManagementService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeSessions = this._register(new Emitter<ISessionsChangeEvent>());
	readonly onDidChangeSessions: Event<ISessionsChangeEvent> = this._onDidChangeSessions.event;

	private readonly _onDidChangeSessionTypes = this._register(new Emitter<void>());
	readonly onDidChangeSessionTypes: Event<void> = this._onDidChangeSessionTypes.event;

	private _sessionTypes: readonly ISessionType[] = [];

	private readonly _activeSession = observableValue<IActiveSession | undefined>(this, undefined);
	readonly activeSession: IObservable<IActiveSession | undefined> = this._activeSession;
	/** Tracks the pending new session so it can be restored by {@link openNewSessionView}. */
	private _pendingNewSession: ISession | undefined;
	private readonly isNewChatSessionContext: IContextKey<boolean>;
	private readonly _isNewChatInSessionContext: IContextKey<boolean>;
	private readonly _activeSessionProviderId: IContextKey<string>;
	private readonly _activeSessionType: IContextKey<string>;
	private readonly _activeSessionWorkspaceIsVirtual: IContextKey<boolean>;
	private readonly _isActiveSessionArchived: IContextKey<boolean>;
	private readonly _supportsMultiChat: IContextKey<boolean>;
	private _activeChatObservable: ISettableObservable<IChat> | undefined;
	/** Cancelled on every navigation action so in-flight async opens bail out. */
	private readonly _openSessionCts = this._register(new MutableDisposable<CancellationTokenSource>());
	private readonly _onDidOpenNewSessionView = this._register(new Emitter<void>());
	private _activeSessionDisposables = this._register(new DisposableStore());
	private readonly _providerListeners = this._register(new DisposableMap<string, IDisposable>());
	private readonly _sessionStates: ResourceMap<ISessionState>;
	private readonly _navigation: SessionsNavigation;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IProgressService private readonly progressService: IProgressService,
	) {
		super();

		// Bind context key to active session state.
		// isNewSession is false when there are any established sessions in the model.
		this.isNewChatSessionContext = IsNewChatSessionContext.bindTo(contextKeyService);
		this._isNewChatInSessionContext = IsNewChatInSessionContext.bindTo(contextKeyService);
		this._activeSessionProviderId = ActiveSessionProviderIdContext.bindTo(contextKeyService);
		this._activeSessionType = ActiveSessionTypeContext.bindTo(contextKeyService);
		this._activeSessionWorkspaceIsVirtual = ActiveSessionWorkspaceIsVirtualContext.bindTo(contextKeyService);
		this._isActiveSessionArchived = IsActiveSessionArchivedContext.bindTo(contextKeyService);
		this._supportsMultiChat = ActiveSessionSupportsMultiChatContext.bindTo(contextKeyService);

		// Load persisted state
		this._sessionStates = this._loadSessionStates();

		// Save on shutdown
		this._register(this.storageService.onWillSaveState(() => this._saveSessionStates()));

		// Subscribe to provider changes for session type updates
		this._register(this.sessionsProvidersService.onDidChangeProviders(e => {
			this._onProvidersChanged(e);
			this._updateSessionTypes();
		}));
		this._subscribeToProviders(this.sessionsProvidersService.getProviders());

		// Session navigation history
		this._navigation = this._register(new SessionsNavigation(
			this,
			contextKeyService,
			this.logService,
		));
		this._register(this.onDidChangeSessions(e => this._navigation.onDidRemoveSessions(e)));
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

	private onDidReplaceSession(from: ISession, to: ISession): void {
		if (this._activeSession.get()?.sessionId === from.sessionId) {
			this.setActiveSession(to, /* force */ true);
		}
		// Always fire the change event so the SessionsList refreshes even when
		// the user navigated to a different session while the new one was
		// being created (which is how duplicate rows appeared in the list).
		this._onDidChangeSessions.fire({
			added: [],
			removed: from.sessionId === to.sessionId ? [] : [from],
			changed: [to],
		});
	}

	private onDidChangeSessionsFromSessionsProviders(e: ISessionChangeEvent): void {
		this._onDidChangeSessions.fire(e);
		const currentActive = this._activeSession.get();

		// Clear stale pending session if the provider removed it
		if (e.removed.length && this._pendingNewSession) {
			if (e.removed.some(r => r.sessionId === this._pendingNewSession!.sessionId)) {
				this._pendingNewSession = undefined;
			}
		}

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
		return deduplicateSessions(sessions);
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

	/**
	 * Cancel any in-flight open-session/restore and return a fresh cancellation token.
	 */
	private _startOpenSession() {
		this._openSessionCts.value?.cancel();
		const cts = new CancellationTokenSource();
		this._openSessionCts.value = cts;
		return cts.token;
	}

	async openChat(session: ISession, chatUri: URI): Promise<void> {
		const t0 = Date.now();
		const token = this._startOpenSession();
		this.logService.trace(`[SessionsManagement] openChat start uri=${chatUri.toString()} provider=${session.providerId}`);
		this.isNewChatSessionContext.set(false);
		this.setActiveSession(session);
		if (!await this._waitForSessionToLoad(session, token)) {
			this.logService.trace(`[SessionsManagement] openChat cancelled while waiting for session to load uri=${chatUri.toString()}`);
			return;
		}

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
			this.logService.trace(`[SessionsManagement] openChat done total=${Date.now() - t0}ms uri=${chatUri.toString()} path=untitled`);
			return;
		}

		this._isNewChatInSessionContext.set(false);
		try {
			await this.chatWidgetService.openSession(chatUri, ChatViewPaneTarget);
		} catch (e) {
			if (token.isCancellationRequested) {
				this.logService.trace('[SessionsManagement] openChat: suppressed error because user navigated away');
				return;
			}
			throw e;
		}
		this.logService.trace(`[SessionsManagement] openChat done total=${Date.now() - t0}ms uri=${chatUri.toString()}`);
	}

	async openSession(sessionResource: URI, options?: { preserveFocus?: boolean }): Promise<void> {
		const token = this._startOpenSession();
		await this._doOpenSession(sessionResource, token, options);
	}

	private async _doOpenSession(sessionResource: URI, token: CancellationToken, options?: { preserveFocus?: boolean }): Promise<void> {
		const t0 = Date.now();
		const sessionData = this.getSession(sessionResource);
		if (!sessionData) {
			this.logService.warn(`[SessionsManagement] openSession: session not found uri=${sessionResource.toString()}`);
			throw new Error(`Session with resource ${sessionResource.toString()} not found`);
		}
		this.logService.trace(`[SessionsManagement] openSession start uri=${sessionResource.toString()} provider=${sessionData.providerId}`);
		this.isNewChatSessionContext.set(false);
		this._isNewChatInSessionContext.set(false);
		this.setActiveSession(sessionData);
		if (!await this._waitForSessionToLoad(sessionData, token)) {
			this.logService.trace(`[SessionsManagement] openSession cancelled while waiting for session to load uri=${sessionResource.toString()}`);
			return;
		}

		// Open the active chat (which may have been restored to the last active chat)
		const activeChat = this._activeSession.get()?.activeChat.get();
		const openUri = activeChat?.resource ?? sessionData.resource;
		try {
			await this.chatWidgetService.openSession(openUri, ChatViewPaneTarget, { preserveFocus: options?.preserveFocus });
		} catch (e) {
			if (token.isCancellationRequested) {
				this.logService.trace('[SessionsManagement] openSession: suppressed error because user navigated away');
				return;
			}
			throw e;
		}
		this.logService.trace(`[SessionsManagement] openSession done total=${Date.now() - t0}ms uri=${sessionResource.toString()}`);
	}

	unsetNewSession(): void {
		this._pendingNewSession = undefined;
		this.setActiveSession(undefined);
	}

	createNewSession(providerId: string, repositoryUri: URI, sessionTypeId?: string): ISession {
		this._startOpenSession();
		if (!this.isNewChatSessionContext.get()) {
			this.isNewChatSessionContext.set(true);
		}

		const provider = this.sessionsProvidersService.getProviders().find(p => p.id === providerId);
		if (!provider) {
			throw new Error(`Sessions provider '${providerId}' not found`);
		}

		if (!sessionTypeId) {
			sessionTypeId = provider.getSessionTypes(repositoryUri)[0]?.id;
			if (!sessionTypeId) {
				throw new Error(`No session types available for provider '${providerId}'`);
			}
		}
		const session = provider.createNewSession(repositoryUri, sessionTypeId);
		this._pendingNewSession = session;
		this.setActiveSession(session);
		return session;
	}

	async sendAndCreateChat(session: ISession, options: ISendRequestOptions): Promise<void> {
		this._pendingNewSession = undefined;
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
		this._pendingNewSession = undefined;
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
		this._startOpenSession();
		// Restore the pending new session if one exists, so pickers
		// re-derive their state from the still-alive session object.
		// Otherwise clear active session (first time / after send).
		this.setActiveSession(this._pendingNewSession ?? undefined);
		this.isNewChatSessionContext.set(true);
		this._isNewChatInSessionContext.set(false);
		this._onDidOpenNewSessionView.fire();

		// Clear isActive so the new-session view is restored on reload
		for (const [, state] of this._sessionStates) {
			state.isActive = false;
		}
	}

	openNewChatInSession(session: ISession): void {
		this._startOpenSession();
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

	private setActiveSession(session: ISession | undefined, force?: boolean): void {
		const previousSession = this._activeSession.get();
		if (!force && previousSession?.sessionId === session?.sessionId) {
			return;
		}

		// Update context keys from session data
		this._activeSessionProviderId.set(session?.providerId ?? '');
		this._activeSessionType.set(session?.sessionType ?? '');
		this._activeSessionWorkspaceIsVirtual.set(session?.workspace.get()?.isVirtualWorkspace ?? true);
		this._isActiveSessionArchived.set(session?.isArchived.get() ?? false);
		this._supportsMultiChat.set(session?.capabilities.supportsMultipleChats ?? false);

		if (session) {
			this.logService.info(`[ActiveSessionService] Active session changed: ${session.resource.toString()}`);
		} else {
			this.logService.trace('[ActiveSessionService] Active session cleared');
		}

		this._activeSessionDisposables.clear();

		if (session) {
			let observedSession = false;
			this._activeSessionDisposables.add(autorun(reader => {
				if (observedSession || session.loading.read(reader)) {
					return;
				}
				observedSession = true;
				// Trigger lazy resolve for expensive session properties (e.g. changes,
				// badge). This is fire-and-forget — the resolve result flows back through
				// the model's onDidChangeSessions → _refreshSessionCache → adapter.update()
				// chain, updating observables reactively. Safe for providers without a
				// resolve handler (returns undefined).
				this.agentSessionsService.model.observeSession(session.resource);
			}));

			// Restore the last active chat for this session, or default to the first chat
			const chats = session.chats.get();
			const sessionState = this._sessionStates.get(session.resource);
			let initialChat = chats[0];
			if (sessionState?.activeChatResource) {
				try {
					const lastChatResource = URI.parse(sessionState.activeChatResource);
					const found = chats.find(c => this.uriIdentityService.extUri.isEqual(c.resource, lastChatResource));
					if (found) {
						initialChat = found;
					}
				} catch (error) {
					this.logService.warn('[ActiveSessionService] Failed to restore active chat from stored session state', error);
				}
			}

			// Create the active chat observable
			const activeChatObs = observableValue<IChat>(`activeChat-${session.sessionId}`, initialChat);
			this._activeChatObservable = activeChatObs;
			const activeSession = new ActiveSession(session, activeChatObs);

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

			// Track workspace changes so the virtual-workspace context key stays in sync
			this._activeSessionDisposables.add(autorun(reader => {
				const workspace = session.workspace.read(reader);
				this._activeSessionWorkspaceIsVirtual.set(workspace?.isVirtualWorkspace ?? true);
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

			// Track active chat changes to persist per-session state
			this._activeSessionDisposables.add(autorun(reader => {
				const chat = activeChatObs.read(reader);
				if (chat && chat.status.read(undefined) !== SessionStatus.Untitled) {
					// Mark all sessions as inactive, then set this one as active
					for (const [, state] of this._sessionStates) {
						state.isActive = false;
					}
					const existing = this._sessionStates.get(session.resource);
					this._sessionStates.set(session.resource, {
						...existing,
						sessionResource: session.resource.toString(),
						activeChatResource: chat.resource.toString(),
						isActive: true,
					});
				}
			}));
		} else {
			this._activeChatObservable = undefined;
			this._activeSession.set(undefined, undefined);
		}
	}

	private async _waitForSessionToLoad(session: ISession, token: CancellationToken): Promise<boolean> {
		if (!session.loading.get()) {
			return true;
		}
		if (token.isCancellationRequested) {
			return false;
		}

		await new Promise<void>(resolve => {
			const disposables = new DisposableStore();
			let resolved = false;
			const finish = () => {
				if (resolved) {
					return;
				}
				resolved = true;
				disposables.dispose();
				resolve();
			};

			disposables.add(token.onCancellationRequested(finish));
			disposables.add(autorun(reader => {
				if (!session.loading.read(reader)) {
					finish();
				}
			}));
		});

		return !token.isCancellationRequested;
	}

	private _loadSessionStates(): ResourceMap<ISessionState> {
		const map = new ResourceMap<ISessionState>();
		const raw = this.storageService.get(ACTIVE_SESSION_STATES_KEY, StorageScope.WORKSPACE);
		if (!raw) {
			return map;
		}
		try {
			const entries: ISessionState[] = JSON.parse(raw);
			for (const entry of entries) {
				const uri = URI.parse(entry.sessionResource);
				map.set(uri, entry);
			}
		} catch {
			// ignore corrupt data
		}
		return map;
	}

	private _saveSessionStates(): void {
		const entries: ISessionState[] = [];
		for (const [, state] of this._sessionStates) {
			entries.push(state);
		}
		this.storageService.store(ACTIVE_SESSION_STATES_KEY, JSON.stringify(entries), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	private _getLastActiveSessionState(): ISessionState | undefined {
		for (const [, state] of this._sessionStates) {
			if (state.isActive) {
				return state;
			}
		}
		return undefined;
	}

	async restoreLastActiveSession(): Promise<void> {
		const lastActive = this._getLastActiveSessionState();
		if (!lastActive) {
			return;
		}

		// Synchronously switch away from the new-session view before any await so
		// that NewChatViewPane never renders and cannot call createNewSession()
		// which would cancel our restore token.
		this.isNewChatSessionContext.set(false);
		this._isNewChatInSessionContext.set(false);

		const sessionResource = URI.parse(lastActive.sessionResource);
		const token = this._startOpenSession();

		const doRestore = async () => {
			// Session may already be available if the provider registered early
			const existing = this.getSession(sessionResource);
			if (existing) {
				try {
					await this._doOpenSession(sessionResource, token);
				} catch {
					if (!token.isCancellationRequested) {
						this.openNewSessionView();
					}
				}
				return;
			}

			// Wait for the session to become available via provider registration.
			// Cancel if the user navigates while we are waiting.
			await new Promise<void>(resolve => {
				const disposables = new DisposableStore();

				const cancel = () => {
					disposables.dispose();
					resolve();
				};

				disposables.add(token.onCancellationRequested(cancel));

				const tryRestore = () => {
					if (token.isCancellationRequested) {
						cancel();
						return;
					}

					const session = this.getSession(sessionResource);
					if (session) {
						disposables.dispose();
						this._doOpenSession(sessionResource, token).then(resolve, () => {
							if (!token.isCancellationRequested) {
								this.openNewSessionView();
							}
							resolve();
						});
					}
				};

				disposables.add(this.onDidChangeSessions(() => tryRestore()));
				disposables.add(this.sessionsProvidersService.onDidChangeProviders(() => tryRestore()));

				// Call immediately in case the session became available between the
				// initial getSession check above and the listener registration here.
				tryRestore();
			});
		};

		const restorePromise = doRestore();
		let onDidOpenNewSessionViewListener: IDisposable | undefined;
		try {
			if (!this.isNewChatSessionContext.get()) {
				// Race against new-session navigation so progress stops immediately
				// when the user opens the new session view, but not when they open
				// another existing session (which should show its own progress).
				// Create the listener explicitly so it can be disposed if restore
				// completes before the event ever fires.
				const openNewSessionViewPromise = new Promise<void>(resolve => {
					onDidOpenNewSessionViewListener = this._onDidOpenNewSessionView.event(() => {
						onDidOpenNewSessionViewListener?.dispose();
						onDidOpenNewSessionViewListener = undefined;
						resolve();
					});
				});
				const progressPromise = Promise.race([
					restorePromise,
					openNewSessionViewPromise
				]);
				this.progressService.withProgress({ location: ChatViewId, delay: 200 }, () => progressPromise);
			}
			await restorePromise;
		} finally {
			onDidOpenNewSessionViewListener?.dispose();
		}
	}

	// -- Session Navigation --

	async openPreviousSession(): Promise<void> {
		await this._navigation.goBack();
	}

	async openNextSession(): Promise<void> {
		await this._navigation.goForward();
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

/**
 * Wraps an {@link ISession} with an active chat observable to form an
 * {@link IActiveSession}. Delegates all {@link ISession} property accesses
 * to the wrapped session so the active session always reflects the latest
 * session state without a stale shallow copy.
 */
class ActiveSession implements IActiveSession {
	constructor(
		private readonly _session: ISession,
		readonly activeChat: IObservable<IChat>,
	) { }

	get sessionId() { return this._session.sessionId; }
	get resource() { return this._session.resource; }
	get providerId() { return this._session.providerId; }
	get sessionType() { return this._session.sessionType; }
	get icon() { return this._session.icon; }
	get createdAt() { return this._session.createdAt; }
	get workspace() { return this._session.workspace; }
	get title() { return this._session.title; }
	get updatedAt() { return this._session.updatedAt; }
	get status() { return this._session.status; }
	get changes() { return this._session.changes; }
	get changesets() { return this._session.changesets; }
	get modelId() { return this._session.modelId; }
	get mode() { return this._session.mode; }
	get loading() { return this._session.loading; }
	get isArchived() { return this._session.isArchived; }
	get isRead() { return this._session.isRead; }
	get description() { return this._session.description; }
	get lastTurnEnd() { return this._session.lastTurnEnd; }
	get chats() { return this._session.chats; }
	get mainChat() { return this._session.mainChat; }
	get capabilities() { return this._session.capabilities; }
	get deduplicationKey() { return this._session.deduplicationKey; }
}

registerSingleton(ISessionsManagementService, SessionsManagementService, InstantiationType.Delayed);

/**
 * Removes duplicate sessions across providers. When multiple sessions share
 * the same {@link ISession.deduplicationKey}, the session from the local
 * agent host provider is preferred; otherwise the first occurrence wins.
 */
export function deduplicateSessions(sessions: ISession[]): ISession[] {
	const seen = new Map<string, ISession>();
	for (const session of sessions) {
		const key = session.deduplicationKey;
		if (!key) {
			continue;
		}
		const existing = seen.get(key);
		if (!existing) {
			seen.set(key, session);
		} else if (existing.providerId !== LOCAL_AGENT_HOST_PROVIDER_ID && session.providerId === LOCAL_AGENT_HOST_PROVIDER_ID) {
			seen.set(key, session);
		}
	}

	return sessions.filter(s => {
		const key = s.deduplicationKey;
		if (!key) {
			return true;
		}
		return seen.get(key) === s;
	});
}
