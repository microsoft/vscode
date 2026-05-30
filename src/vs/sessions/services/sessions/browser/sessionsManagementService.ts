/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { IObservable, autorun } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IAgentSessionsService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { ActiveSessionProviderIdContext, ActiveSessionTypeContext, IsActiveSessionArchivedContext, ActiveSessionWorkspaceIsVirtualContext, IsNewChatSessionContext } from '../../../common/contextkeys.js';
import { ActiveSessionSupportsMultiChatContext, IActiveSession, ICreateNewSessionOptions, IProviderSessionType, ISendRequestSentEvent, ISessionsChangeEvent, ISessionsManagementService, IToggleSessionStickinessEvent } from '../common/sessionsManagement.js';
import { ISessionsProvidersChangeEvent, ISessionsProvidersService } from './sessionsProvidersService.js';
import { ISendRequestOptions, ISessionChangeEvent, ISessionsProvider } from '../common/sessionsProvider.js';
import { IChat, ISession, ISessionWorkspace, SessionStatus, ISessionType } from '../common/session.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { SessionsNavigation } from './sessionNavigation.js';
import { VisibleSessions } from './visibleSessions.js';
import { ISessionsPartService } from '../../../browser/parts/sessionsPartService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';

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
	private readonly _onDidStartSession = this._register(new Emitter<ISession>());
	readonly onDidStartSession: Event<ISession> = this._onDidStartSession.event;

	private readonly _onWillSendRequest = this._register(new Emitter<ISession>());
	readonly onWillSendRequest: Event<ISession> = this._onWillSendRequest.event;
	private readonly _onDidSendRequest = this._register(new Emitter<ISendRequestSentEvent>());
	readonly onDidSendRequest: Event<ISendRequestSentEvent> = this._onDidSendRequest.event;

	private readonly _onDidArchiveSession = this._register(new Emitter<ISession>());
	readonly onDidArchiveSession: Event<ISession> = this._onDidArchiveSession.event;
	private readonly _onDidUnarchiveSession = this._register(new Emitter<ISession>());
	readonly onDidUnarchiveSession: Event<ISession> = this._onDidUnarchiveSession.event;
	private readonly _onDidDeleteSession = this._register(new Emitter<ISession>());
	readonly onDidDeleteSession: Event<ISession> = this._onDidDeleteSession.event;
	private readonly _onDidDeleteChat = this._register(new Emitter<ISession>());
	readonly onDidDeleteChat: Event<ISession> = this._onDidDeleteChat.event;
	private readonly _onDidRenameChat = this._register(new Emitter<ISession>());
	readonly onDidRenameChat: Event<ISession> = this._onDidRenameChat.event;

	private readonly _onDidToggleSessionStickiness = this._register(new Emitter<IToggleSessionStickinessEvent>());
	readonly onDidToggleSessionStickiness: Event<IToggleSessionStickinessEvent> = this._onDidToggleSessionStickiness.event;

	private readonly _onDidChangeSessionTypes = this._register(new Emitter<void>());
	readonly onDidChangeSessionTypes: Event<void> = this._onDidChangeSessionTypes.event;

	private _sessionTypes: readonly ISessionType[] = [];

	/** Owns the active/sticky/transient visibility model and the {@link ActiveSession} wrappers. */
	private readonly _visibility: VisibleSessions;
	readonly activeSession: IObservable<IActiveSession | undefined>;
	readonly visibleSessions: IObservable<readonly (IActiveSession | undefined)[]>;

	/** Tracks the pending new session so it can be restored by {@link openNewSessionView}. */
	private _pendingNewSession: ISession | undefined;
	private readonly _isNewChatSessionContext: IContextKey<boolean>;
	private readonly _activeSessionProviderId: IContextKey<string>;
	private readonly _activeSessionType: IContextKey<string>;
	private readonly _activeSessionWorkspaceIsVirtual: IContextKey<boolean>;
	private readonly _isActiveSessionArchived: IContextKey<boolean>;
	private readonly _supportsMultiChat: IContextKey<boolean>;
	/** Cancelled on every navigation action so in-flight async opens bail out. */
	private readonly _openSessionCts = this._register(new MutableDisposable<CancellationTokenSource>());
	private readonly _onDidOpenNewSessionView = this._register(new Emitter<void>());
	private readonly _providerListeners = this._register(new DisposableMap<string, IDisposable>());
	private readonly _sessionStates: ResourceMap<ISessionState>;
	private readonly _navigation: SessionsNavigation;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		// Bind context key to active session state.
		// isNewSession is false when there are any established sessions in the model.
		this._isNewChatSessionContext = IsNewChatSessionContext.bindTo(contextKeyService);
		this._activeSessionProviderId = ActiveSessionProviderIdContext.bindTo(contextKeyService);
		this._activeSessionType = ActiveSessionTypeContext.bindTo(contextKeyService);
		this._activeSessionWorkspaceIsVirtual = ActiveSessionWorkspaceIsVirtualContext.bindTo(contextKeyService);
		this._isActiveSessionArchived = IsActiveSessionArchivedContext.bindTo(contextKeyService);
		this._supportsMultiChat = ActiveSessionSupportsMultiChatContext.bindTo(contextKeyService);

		// Load persisted state
		this._sessionStates = this._loadSessionStates();

		// Visibility model — owns wrappers, active/sticky/transient state, and
		// observables exposed to the UI.
		this._visibility = this._register(new VisibleSessions(
			session => this._restoreInitialChat(session),
			this.uriIdentityService,
			this.agentSessionsService,
		));
		this.activeSession = this._visibility.activeSession;
		this.visibleSessions = this._visibility.visibleSessions;

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

		this._register(autorun(reader => {
			const activeSession = this._visibility.activeSession.read(reader);
			this._handleActiveSessionContextKeys(activeSession);
			if (activeSession) {
				reader.store.add(this._activeSessionListeners(activeSession));
			}
		}));
	}

	private _handleActiveSessionContextKeys(session: IActiveSession | undefined): void {
		// Update context keys from session data
		// IsNewChatSessionContext is true when no active session exists, OR when the
		// active session is still pending (created but not yet sent for the first time).
		// Scoping to the active session avoids flipping into "new chat" mode while
		// viewing a different established session.
		this._isNewChatSessionContext.set(session === undefined || session.sessionId === this._pendingNewSession?.sessionId);
		this._activeSessionProviderId.set(session?.providerId ?? '');
		this._activeSessionType.set(session?.sessionType ?? '');
		this._activeSessionWorkspaceIsVirtual.set(session?.workspace.get()?.isVirtualWorkspace ?? true);
		this._isActiveSessionArchived.set(session?.isArchived.get() ?? false);
		this._supportsMultiChat.set(session?.capabilities.supportsMultipleChats ?? false);
	}

	private _activeSessionListeners(activeSession: IActiveSession): IDisposable {
		const disposables = new DisposableStore();

		// Track archived state changes for the active session
		let wasArchived = activeSession.isArchived.get();
		disposables.add(autorun(reader => {
			const isArchived = activeSession.isArchived.read(reader);
			this._isActiveSessionArchived.set(isArchived);
			if (isArchived && !wasArchived) {
				this.openNewSessionView();
			}
			wasArchived = isArchived;
		}));

		// Track workspace changes so the virtual-workspace context key stays in sync
		disposables.add(autorun(reader => {
			const workspace = activeSession.workspace.read(reader);
			this._activeSessionWorkspaceIsVirtual.set(workspace?.isVirtualWorkspace ?? true);
		}));

		// Track chat list changes — if the active chat is removed, fall back
		if (activeSession.status.get() !== SessionStatus.Untitled) {
			disposables.add(autorun(reader => {
				const chats = activeSession.chats.read(reader);
				const activeChat = activeSession.activeChat.read(reader);
				if (activeChat && !chats.some(c => this.uriIdentityService.extUri.isEqual(c.resource, activeChat.resource))) {
					const fallback = chats[chats.length - 1] ?? activeSession.mainChat.read(reader);
					if (fallback) {
						this.openChat(activeSession, fallback.resource);
					}
				}
			}));
		}

		// Track active chat changes to persist per-session state
		disposables.add(autorun(reader => {
			const chat = activeSession.activeChat.read(reader);
			if (chat && chat.status.read(undefined) !== SessionStatus.Untitled) {
				// Mark all sessions as inactive, then set this one as active
				for (const [, state] of this._sessionStates) {
					state.isActive = false;
				}
				const existing = this._sessionStates.get(activeSession.resource);
				this._sessionStates.set(activeSession.resource, {
					...existing,
					sessionResource: activeSession.resource.toString(),
					activeChatResource: chat.resource.toString(),
					isActive: true,
				});
			}
		}));

		return disposables;
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
		// Rewrite the id in the visibility model so the same grid slot is
		// reused for the replaced session.
		const wasActive = this._visibility.activeSession.get()?.sessionId === from.sessionId;
		this._visibility.replaceId(from.sessionId, to.sessionId);

		if (wasActive) {
			this.setActiveSession(to, /* force */ true);
		} else {
			this._visibility.refresh();
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
		const currentActive = this._visibility.activeSession.get();

		// Clear stale pending session if the provider removed it
		if (e.removed.length && this._pendingNewSession) {
			if (e.removed.some(r => r.sessionId === this._pendingNewSession!.sessionId)) {
				this._pendingNewSession = undefined;
			}
		}

		// Clean removed sessions out of the visibility model (drops their grid slot
		// and disposes their wrapper). If the active session is among the removed,
		// removeMany picks a fallback active session (or clears it when no slot
		// remains); drive the open flow below so the fallback is fully opened.
		if (e.removed.length) {
			this._visibility.removeMany(e.removed.map(r => r.sessionId));
		}

		if (!currentActive) {
			return;
		}

		if (e.removed.length && e.removed.some(r => r.sessionId === currentActive.sessionId)) {
			const fallback = this._visibility.activeSession.get();
			if (fallback) {
				this.openSession(fallback.resource);
			} else {
				this.openNewSessionView();
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

	getSessionTypesForFolder(folderUri: URI): IProviderSessionType[] {
		const result: IProviderSessionType[] = [];
		for (const provider of this.sessionsProvidersService.getProviders()) {
			if (!provider.resolveWorkspace(folderUri)) {
				continue;
			}
			for (const sessionType of provider.getSessionTypes(folderUri)) {
				result.push({ providerId: provider.id, sessionType });
			}
		}
		return result;
	}

	resolveWorkspace(folderUri: URI): { providerId: string; workspace: ISessionWorkspace } | undefined {
		for (const provider of this.sessionsProvidersService.getProviders()) {
			const workspace = provider.resolveWorkspace(folderUri);
			if (workspace) {
				return { providerId: provider.id, workspace };
			}
		}
		return undefined;
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
		// Always fire — the deduplicated flat list (used by surfaces that
		// only need a set of type ids) may be unchanged, but the per-folder
		// result of {@link getSessionTypesForFolder} can change whenever any
		// provider's types or the set of providers changes, because each
		// entry is keyed by (providerId × sessionType) rather than by type
		// id alone.
		this._sessionTypes = this._collectSessionTypes();
		this._onDidChangeSessionTypes.fire();
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
		this.setActiveSession(session);
		if (!await this._waitForSessionToLoad(session, token)) {
			this.logService.trace(`[SessionsManagement] openChat cancelled while waiting for session to load uri=${chatUri.toString()}`);
			return;
		}

		// Find the chat and update active chat
		let chat: IChat | undefined;
		//let previousChatResource: URI | undefined;
		const activeSession = this._visibility.activeSession.get();
		if (activeSession) {
			//previousChatResource = activeSession.activeChat.get()?.resource;
			chat = activeSession.chats.get().find(c => this.uriIdentityService.extUri.isEqual(c.resource, chatUri));
			if (chat) {
				this._visibility.setActiveChat(session, chat);
			}
		}

		// If the chat is untitled (not yet sent), show the new-chat-in-session view
		if (chat && chat.status.get() === SessionStatus.Untitled) {
			this.logService.trace(`[SessionsManagement] openChat done total=${Date.now() - t0}ms uri=${chatUri.toString()} path=untitled`);
			return;
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
		this.setActiveSession(sessionData);
		if (!await this._waitForSessionToLoad(sessionData, token)) {
			this.logService.trace(`[SessionsManagement] openSession cancelled while waiting for session to load uri=${sessionResource.toString()}`);
			return;
		}

		this.logService.trace(`[SessionsManagement] openSession done total=${Date.now() - t0}ms uri=${sessionResource.toString()}`);
	}

	unsetNewSession(): void {
		this._pendingNewSession = undefined;
		this.setActiveSession(undefined);
	}

	createNewSession(folderUri: URI, options?: ICreateNewSessionOptions): ISession {
		this._startOpenSession();

		const providers = this.sessionsProvidersService.getProviders();
		let provider: ISessionsProvider | undefined;

		if (options?.providerId) {
			provider = providers.find(p => p.id === options.providerId);
			if (!provider) {
				throw new Error(`Sessions provider '${options.providerId}' not found`);
			}
			if (!provider.resolveWorkspace(folderUri)) {
				throw new Error(`Sessions provider '${options.providerId}' cannot resolve folder '${folderUri.toString()}'`);
			}
		} else {
			// Iterate providers and pick the first one that can resolve the folder.
			// When a specific session type was requested, also require the provider to
			// advertise that type for the folder.
			for (const candidate of providers) {
				if (!candidate.resolveWorkspace(folderUri)) {
					continue;
				}
				if (options?.sessionTypeId && !candidate.getSessionTypes(folderUri).some(t => t.id === options.sessionTypeId)) {
					continue;
				}
				provider = candidate;
				break;
			}
			if (!provider) {
				throw new Error(`No sessions provider can resolve folder '${folderUri.toString()}'`);
			}
		}
		let sessionTypeId = options?.sessionTypeId;
		if (!sessionTypeId) {
			sessionTypeId = provider.getSessionTypes(folderUri)[0]?.id;
			if (!sessionTypeId) {
				throw new Error(`No session types available for provider '${provider.id}'`);
			}
		}

		const session = provider.createNewSession(folderUri, sessionTypeId);
		this._pendingNewSession = session;
		this.setActiveSession(session);
		return session;
	}

	async sendNewChatRequest(session: ISession, options: ISendRequestOptions): Promise<void> {
		this._pendingNewSession = undefined;
		this._isNewChatSessionContext.set(false);

		// Notify listeners that a send is starting. Listeners (e.g., telemetry)
		// can use this to prewarm caches whose result is consumed when
		// `onDidSendRequest` fires below.
		this._onWillSendRequest.fire(session);

		const setActiveChatToLast = () => {
			const activeSession = this._visibility.activeSession.get();
			if (activeSession?.sessionId === session.sessionId && this.uriIdentityService.extUri.isEqual(activeSession.activeChat.get().resource, (<IActiveSession>session).activeChat?.get().resource)) {
				const chats = activeSession.chats.get();
				const lastChat = chats[chats.length - 1];
				if (lastChat) {
					this._visibility.setActiveChat(session, lastChat);
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

			// Ask the provider to create the new chat; open its widget before sending
			const chat = await provider.createNewChat(session.sessionId, options.query);
			// Swap in a transient session whose resource is the new chat
			// resource, so the grid slot reflects the chat that is about to
			// be sent before the provider hands us the final session.
			const tmpSession = this._visibility.updateResourceOfSession(session, chat.resource);

			const updatedSession = await provider.sendRequest(session.sessionId, chat.resource, options);
			if (updatedSession.sessionId !== session.sessionId) {
				this.logService.info(`[SessionsManagement] sendRequest: active session replaced: ${session.sessionId} -> ${updatedSession.sessionId}`);
				this._visibility.updateSession(tmpSession, updatedSession);
				setActiveChatToLast();
			}
			this._onDidStartSession.fire(updatedSession);

			this._onDidSendRequest.fire({ session: updatedSession, chat: session.mainChat.get(), isNewSession: true, options });
		} finally {
			chatsListener.dispose();
		}
	}

	async sendRequest(session: ISession, chat: IChat, options: ISendRequestOptions): Promise<void> {
		this._pendingNewSession = undefined;

		// Notify listeners that a send is starting. Listeners (e.g., telemetry)
		// can use this to prewarm caches whose result is consumed when
		// `onDidSendRequest` fires below.
		this._onWillSendRequest.fire(session);

		// Keep the sent chat as the active chat
		this._visibility.setActiveChat(session, chat);

		const provider = this._getProvider(session);
		if (!provider) {
			throw new Error(`Sessions provider '${session.providerId}' not found`);
		}

		const updatedSession = await provider.sendRequest(session.sessionId, chat.resource, options);
		if (updatedSession.sessionId !== session.sessionId) {
			this.logService.info(`[SessionsManagement] sendRequest: active session replaced: ${session.sessionId} -> ${updatedSession.sessionId}`);
			this._visibility.updateSession(session, updatedSession);
		}

		this._onDidSendRequest.fire({ session: updatedSession, chat, isNewSession: false, options });
	}

	openNewSessionView(): void {
		// No-op if the current session is already a new session
		if (this._visibility.activeSession.get() === undefined) {
			return;
		}
		this._startOpenSession();
		// Restore the pending new session if one exists, so pickers
		// re-derive their state from the still-alive session object.
		// Otherwise clear active session (first time / after send).
		this.setActiveSession(this._pendingNewSession ?? undefined);
		this._onDidOpenNewSessionView.fire();

		// Clear isActive so the new-session view is restored on reload
		for (const [, state] of this._sessionStates) {
			state.isActive = false;
		}
	}

	async openNewChatInSession(session: ISession): Promise<void> {
		this._startOpenSession();
		const provider = this._getProvider(session);
		if (!provider) {
			this.logService.warn(`[SessionsManagement] openNewChatInSession: provider '${session.providerId}' not found`);
			return;
		}

		// Reuse an existing untitled chat if one exists, otherwise create a new one
		const existingUntitled = session.chats.get().find(c => c.status.get() === SessionStatus.Untitled);
		const chat = existingUntitled ?? await provider.createNewChat(session.sessionId);

		this.setActiveSession(session);

		// Set the chat as the active chat
		this._visibility.setActiveChat(session, chat);
	}

	setActive(session: IActiveSession | undefined) {
		this.setActiveSession(session);
	}

	private setActiveSession(session: ISession | undefined, force?: boolean): void {
		const previousSession = this._visibility.activeSession.get();
		if (!force && previousSession?.sessionId === session?.sessionId) {
			return;
		}

		if (session) {
			this.logService.info(`[ActiveSessionService] Active session changed: ${session.resource.toString()}`);
		} else {
			this.logService.trace('[ActiveSessionService] Active session cleared');
		}

		this._visibility.setActive(session);
	}

	toggleSessionStickiness(session: ISession): void {
		const sticky = this._visibility.toggleStickiness(session);
		this._onDidToggleSessionStickiness.fire({ session, sticky });
	}

	insertAt(session: ISession, targetSessionId: string, side: 'left' | 'right', activate: boolean = true): void {
		this._visibility.insertAt(session, targetSessionId, side, activate);
	}

	closeSession(session: ISession | undefined): void {
		const sessionId = session?.sessionId;
		const visible = this._visibility.visibleSessions.get();
		if (!visible.some(s => s?.sessionId === sessionId)) {
			return;
		}

		// The empty/new-session slot has no sessionId; both it and "no active
		// session" are reported by activeSession as undefined. Since we already
		// confirmed the slot is present in `visible`, undefined === undefined
		// here means the empty slot is active.
		const activeSessionId = this._visibility.activeSession.get()?.sessionId;
		const wasActive = activeSessionId === sessionId;

		if (sessionId === undefined || this._pendingNewSession?.sessionId === sessionId) {
			this._pendingNewSession = undefined;
		}

		this._visibility.removeMany([sessionId]);

		if (!wasActive) {
			return;
		}

		// removeMany already picked a fallback active session (or cleared the
		// active observable when no slot remains); drive the full open flow.
		const fallback = this._visibility.activeSession.get();
		if (fallback === undefined) {
			this.openNewSessionView();
		}
	}

	private _restoreInitialChat(session: ISession): IChat {
		const chats = session.chats.get();
		let initialChat = chats[0];
		const sessionState = this._sessionStates.get(session.resource);
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
		return initialChat;
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
		// this.isNewChatSessionContext.set(false);
		// this._isNewChatInSessionContext.set(false);
		// THIS IS A WEIRD COMMENT ABOVE. CAN WE JUST REMOVE

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

				disposables.add(this.sessionsProvidersService.onDidChangeProviders(() => tryRestore()));
				// Also retry when a provider's session list changes. Providers
				// like the agent host load their session cache asynchronously
				// (after authentication settles), so the target session may
				// appear without `onDidChangeProviders` ever firing again.
				disposables.add(this.onDidChangeSessions(() => tryRestore()));

				// Call immediately in case the session became available between the
				// initial getSession check above and the listener registration here.
				tryRestore();
			});
		};

		const restorePromise = doRestore();
		let onDidOpenNewSessionViewListener: IDisposable | undefined;
		try {
			if (this._visibility.activeSession.get() !== undefined) {
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
				this.instantiationService.invokeFunction(accessor => {
					accessor.get(ISessionsPartService).getProgressIndicator().showWhile(progressPromise, 200);
				});
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
		this._onDidArchiveSession.fire(session);
	}

	async unarchiveSession(session: ISession): Promise<void> {
		await this._getProvider(session)?.unarchiveSession(session.sessionId);
		this._onDidUnarchiveSession.fire(session);
	}

	async deleteSession(session: ISession): Promise<void> {
		await this._getProvider(session)?.deleteSession(session.sessionId);
		this._onDidDeleteSession.fire(session);
	}

	async deleteChat(session: ISession, chatUri: URI): Promise<void> {
		await this._getProvider(session)?.deleteChat(session.sessionId, chatUri);
		this._onDidDeleteChat.fire(session);
	}

	async renameChat(session: ISession, chatUri: URI, title: string): Promise<void> {
		await this._getProvider(session)?.renameChat(session.sessionId, chatUri, title);
		this._onDidRenameChat.fire(session);
	}
}

registerSingleton(ISessionsManagementService, SessionsManagementService, InstantiationType.Delayed);
