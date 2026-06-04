/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { disposableTimeout } from '../../../../base/common/async.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { IObservable, autorun } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IAgentSessionsService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { ActiveSessionProviderIdContext, ActiveSessionTypeContext, IsActiveSessionArchivedContext, ActiveSessionWorkspaceIsVirtualContext, IsNewChatSessionContext } from '../../../common/contextkeys.js';
import { ActiveSessionSupportsMultiChatContext, IActiveSession, ICreateNewSessionOptions, IProviderSessionType, ISendRequestOptions, ISendRequestSentEvent, ISessionsChangeEvent, ISessionsManagementService, IToggleSessionStickinessEvent } from '../common/sessionsManagement.js';
import { ISessionsProvidersChangeEvent, ISessionsProvidersService } from './sessionsProvidersService.js';
import { ISessionChangeEvent, ISessionsProvider } from '../common/sessionsProvider.js';
import { IChat, ISession, ISessionWorkspace, SessionStatus, ISessionType } from '../common/session.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { SessionsNavigation } from './sessionNavigation.js';
import { VisibleSessions } from './visibleSessions.js';

const ACTIVE_SESSION_STATES_KEY = 'agentSessions.activeSessionStates';

/**
 * Upper bound on how long restore waits for a persisted session to resurface
 * via its provider. Generous (providers may load after auth settles) but finite
 * so a session that is gone for good cannot keep restore — and its provider
 * listeners — alive indefinitely.
 */
const RESTORE_SESSION_WAIT_TIMEOUT = 30_000;

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
	/**
	 * Position (left-to-right) of the session in the grid at save time, when
	 * the session was visible. `undefined` when the session was not visible.
	 */
	visibleOrder?: number;
	/** Whether the session was pinned (sticky) in the grid at save time. */
	isSticky?: boolean;
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
	/**
	 * Cancellation for the in-flight {@link restoreVisibleSessions}. Kept
	 * separate from {@link _openSessionCts} so that additive new-session
	 * operations (the new-chat composer eagerly creating a draft on startup)
	 * do not abort restoring the previously visible grid. Only an explicit
	 * navigation to a specific session cancels a restore.
	 */
	private readonly _restoreCts = this._register(new MutableDisposable<CancellationTokenSource>());
	private readonly _onDidOpenNewSessionView = this._register(new Emitter<void>());
	private readonly _providerListeners = this._register(new DisposableMap<string, IDisposable>());
	private readonly _sessionStates: ResourceMap<ISessionState>;
	private readonly _navigation: SessionsNavigation;

	/**
	 * Chat resources for which this service has just kicked off a
	 * `provider.sendRequest` and will emit `_onDidSendRequest` manually after
	 * the provider call resolves. Used to suppress the duplicate event that
	 * would otherwise arrive via {@link IChatService.onDidSubmitRequest},
	 * which fires synchronously inside the same provider call.
	 */
	private readonly _pendingSendChatResources = new Set<string>();

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IChatService private readonly chatService: IChatService,
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
		this._sessionTypes = this._collectSessionTypes();

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

		// Mirror follow-up chat requests (sent from within an existing chat
		// widget, not through our own send paths) onto `_onDidSendRequest` so
		// downstream listeners (e.g., telemetry) can observe every user
		// request for a session, not just those initiated from the sessions
		// UI. Sends originating from {@link sendRequest} and
		// {@link sendNewChatRequest} are deduplicated via
		// {@link _pendingSendChatResources}.
		this._register(this.chatService.onDidSubmitRequest(({ chatSessionResource, message }) => {
			if (this._pendingSendChatResources.has(chatSessionResource.toString())) {
				return;
			}
			for (const session of this.getSessions()) {
				const chat = session.chats.get().find(c => this.uriIdentityService.extUri.isEqual(c.resource, chatSessionResource));
				if (chat) {
					this._onDidSendRequest.fire({
						session,
						chat,
						isNewSession: false,
						isNewChat: false,
						options: { query: message?.text ?? '' },
					});
					return;
				}
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

		// Track active chat changes to persist per-session state. The visible /
		// active / sticky flags are snapshotted from the live grid at save time
		// (see `_snapshotVisibleSessionStates`); here we only remember the last active
		// chat so reopening the session restores its selected chat.
		disposables.add(autorun(reader => {
			const chat = activeSession.activeChat.read(reader);
			if (chat && chat.status.read(undefined) !== SessionStatus.Untitled) {
				const existing = this._sessionStates.get(activeSession.resource);
				this._sessionStates.set(activeSession.resource, {
					...existing,
					sessionResource: activeSession.resource.toString(),
					activeChatResource: chat.resource.toString(),
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
		this._visibility.updateSession(from, to);

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

		// Clear stale pending session if the provider removed it. The provider
		// already disposed it, so just drop the pointer (do not dispose again).
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
			if (fallback && this.getSession(fallback.resource)) {
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
		for (const provider of this._getOrderedProviders()) {
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
		for (const provider of this._getOrderedProviders()) {
			for (const type of provider.sessionTypes) {
				if (!seen.has(type.id)) {
					seen.add(type.id);
					types.push(type);
				}
			}
		}
		return types;
	}

	/**
	 * Returns the registered providers in the order their session types should
	 * be surfaced, sorted by each provider's {@link ISessionsProvider.order}
	 * (lower first). The sort is stable, so providers with equal order keep
	 * their registration order.
	 */
	private _getOrderedProviders(): ISessionsProvider[] {
		return [...this.sessionsProvidersService.getProviders()].sort((a, b) => a.order - b.order);
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

	/**
	 * Cancel an in-flight {@link restoreVisibleSessions}. Called when the user
	 * explicitly navigates to a specific session, so restore stops fighting
	 * the user's choice. Additive new-session operations do NOT call this.
	 */
	private _cancelRestore(): void {
		// `cancel()` (not just `clear()`/dispose) so the in-flight restore's
		// token actually fires cancellation and bails out; `MutableDisposable`
		// disposes the source without cancelling it.
		this._restoreCts.value?.cancel();
		this._restoreCts.clear();
	}

	async openChat(session: ISession, chatUri: URI): Promise<void> {
		const t0 = Date.now();
		this._cancelRestore();
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
		this._cancelRestore();
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

	/**
	 * Delete the currently pending (composed-but-not-sent) new session.
	 *
	 * Providers track new sessions themselves and no longer dispose them
	 * implicitly when a newer one is created, so abandoning a pending session
	 * must explicitly dispose it through its own provider to release the
	 * eagerly-acquired backend session.
	 *
	 * This is only for abandonment. When a pending session is graduating (being
	 * sent) or was already removed by its provider, just clear
	 * {@link _pendingNewSession} directly so the session is left intact.
	 */
	private _deletePendingNewSession(): void {
		const pending = this._pendingNewSession;
		this._pendingNewSession = undefined;
		if (pending) {
			this._getProvider(pending)?.deleteNewSession(pending.sessionId);
		}
	}

	unsetNewSession(): void {
		this._deletePendingNewSession();
		this.setActiveSession(undefined);
	}

	/**
	 * Resolve the provider and session type to use for a new session in the
	 * given folder, applying the same selection rules as
	 * {@link createNewSession}. Throws when no provider/type can be resolved.
	 */
	private _resolveProviderForNewSession(folderUri: URI, options?: ICreateNewSessionOptions): { provider: ISessionsProvider; sessionTypeId: string } {
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
		return { provider, sessionTypeId };
	}

	createNewSession(folderUri: URI, options?: ICreateNewSessionOptions): ISession {
		this._startOpenSession();

		const { provider, sessionTypeId } = this._resolveProviderForNewSession(folderUri, options);

		const previousPending = this._pendingNewSession;
		const session = provider.createNewSession(folderUri, sessionTypeId);
		this._pendingNewSession = session;
		this.setActiveSession(session);

		// Providers no longer dispose the previous new session implicitly, so
		// dispose the one this composer just replaced. Use its own provider
		// because switching workspace can switch providers. Done after a
		// successful create so a throw above leaves the previous one intact.
		if (previousPending && previousPending.sessionId !== session.sessionId) {
			this._getProvider(previousPending)?.deleteNewSession(previousPending.sessionId);
		}
		return session;
	}

	async sendNewChatRequest(session: ISession, options: ISendRequestOptions): Promise<void> {
		// The session is graduating into the list (being sent),
		// so the provider keeps owning it — just drop the pointer, do not delete.
		this._pendingNewSession = undefined;
		this._isNewChatSessionContext.set(false);

		const provider = this._getProvider(session);
		if (!provider) {
			throw new Error(`Sessions provider '${session.providerId}' not found`);
		}

		if (options.background) {
			// Restore the new-session view synchronously so the composer stays
			// put, then run the send fire-and-forget so the composer can reset
			// and reseed immediately while the request commits. If the commit
			// fails, the graduating draft is stranded (no longer in
			// `_pendingNewSession`), so dispose it through its provider to
			// release the eager backend session. Safe no-op if the provider
			// already graduated/removed it.
			this.openNewSessionView();
			this._sendNewChatRequestInBackground(provider, session, options).catch(e => {
				provider.deleteNewSession(session.sessionId);
				this.logService.error('[SessionsManagement] Failed to send background request:', e);
			});
			return;
		}

		// Foreground send: notify listeners that a send is starting. Listeners
		// (e.g., telemetry) can use this to prewarm caches whose result is
		// consumed when `onDidSendRequest` fires below. The background path
		// fires this from within `_sendNewChatRequestInBackground`.
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
			// Ask the provider to create the new chat; open its widget before sending
			const chat = await provider.createNewChat(session.sessionId, options.query);
			// Swap in a transient session whose resource is the new chat
			// resource, so the grid slot reflects the chat that is about to
			// be sent before the provider hands us the final session.
			const tmpSession = this._visibility.updateResourceOfSession(session, chat.resource);

			const chatResourceKey = chat.resource.toString();
			this._pendingSendChatResources.add(chatResourceKey);
			let updatedSession: ISession;
			try {
				updatedSession = await provider.sendRequest(session.sessionId, chat.resource, options);
			} finally {
				this._pendingSendChatResources.delete(chatResourceKey);
			}
			if (updatedSession.sessionId !== session.sessionId) {
				this.logService.info(`[SessionsManagement] sendRequest: active session replaced: ${session.sessionId} -> ${updatedSession.sessionId}`);
				this._visibility.updateSession(tmpSession, updatedSession);
				setActiveChatToLast();
			}
			this._onDidStartSession.fire(updatedSession);

			this._onDidSendRequest.fire({ session: updatedSession, chat, isNewSession: true, isNewChat: true, options });
		} finally {
			chatsListener.dispose();
		}
	}

	/**
	 * Create a new session for the given folder and send a chat request to it,
	 * without navigating into the started session. The started session appears
	 * in the sessions list once the provider commits it, while the user's
	 * current view is left untouched.
	 *
	 * Unlike {@link sendNewChatRequest} with `background`, this does not go
	 * through the new-session composer: it creates a fresh session purely for
	 * this request and never sets it as pending/active. Intended for callers
	 * outside the composer that want to kick off a session programmatically.
	 *
	 * If the send fails, the stranded draft is disposed through its provider and
	 * the error is rethrown so the caller can react.
	 */
	async createAndSendNewChatRequest(folderUri: URI, options: ISendRequestOptions, createOptions?: ICreateNewSessionOptions): Promise<void> {
		const { provider, sessionTypeId } = this._resolveProviderForNewSession(folderUri, createOptions);
		const session = provider.createNewSession(folderUri, sessionTypeId);

		try {
			await this._sendNewChatRequestInBackground(provider, session, options);
		} catch (e) {
			// The send never committed, so the draft is stranded. Dispose it
			// through its provider to release the eager backend session before
			// rethrowing. Safe no-op if the provider already removed it.
			provider.deleteNewSession(session.sessionId);
			throw e;
		}
	}

	/**
	 * Commit a new-session request: fire {@link _onWillSendRequest}, create the
	 * new chat via the provider, send the request, and—on success—fire
	 * {@link _onDidStartSession} and {@link _onDidSendRequest}. The started
	 * session is never swapped into the visible chat slot, so it simply appears
	 * in the sessions list once the provider commits it.
	 *
	 * Owns the full will/did send lifecycle so callers do not fire the paired
	 * events themselves. Errors are propagated to the caller; this method does
	 * not clean up the stranded draft, so callers own any view handling and the
	 * error handling (e.g. disposing the stranded draft via
	 * {@link ISessionsProvider.deleteNewSession}).
	 *
	 * Providers are multi-new-session aware, so the graduating session and a
	 * concurrently reseeded composer draft coexist without conflict.
	 */
	private async _sendNewChatRequestInBackground(provider: ISessionsProvider, session: ISession, options: ISendRequestOptions): Promise<void> {
		// Notify listeners (e.g., telemetry) that a send is starting so they can
		// prewarm caches whose result is consumed when `onDidSendRequest` fires.
		this._onWillSendRequest.fire(session);
		const chat = await provider.createNewChat(session.sessionId, options.query);

		// Suppress the `chatService.onDidSubmitRequest` mirror for this send so
		// `_onDidSendRequest` is not fired twice for providers that dispatch
		// through `chatService.sendRequest` (see the mirror in the constructor).
		const chatResourceKey = chat.resource.toString();
		this._pendingSendChatResources.add(chatResourceKey);
		let updatedSession: ISession;
		try {
			updatedSession = await provider.sendRequest(session.sessionId, chat.resource, options);
		} finally {
			this._pendingSendChatResources.delete(chatResourceKey);
		}
		if (this._store.isDisposed) {
			return;
		}
		this._onDidStartSession.fire(updatedSession);
		this._onDidSendRequest.fire({ session: updatedSession, chat, isNewSession: true, isNewChat: true, options });
	}

	async sendRequest(session: ISession, chat: IChat, options: ISendRequestOptions): Promise<void> {
		// Sending into an existing session abandons any pending composer, so
		// dispose it to release its eager backend session.
		this._deletePendingNewSession();

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

		const chatResourceKey = chat.resource.toString();
		this._pendingSendChatResources.add(chatResourceKey);
		let updatedSession: ISession;
		try {
			updatedSession = await provider.sendRequest(session.sessionId, chat.resource, options);
		} finally {
			this._pendingSendChatResources.delete(chatResourceKey);
		}
		if (updatedSession.sessionId !== session.sessionId) {
			this.logService.info(`[SessionsManagement] sendRequest: active session replaced: ${session.sessionId} -> ${updatedSession.sessionId}`);
			this._visibility.updateSession(session, updatedSession);
		}

		this._onDidSendRequest.fire({ session: updatedSession, chat, isNewSession: false, isNewChat: true, options });
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
	}

	async openNewChatInSession(session: ISession): Promise<void> {
		this._cancelRestore();
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
			this._deletePendingNewSession();
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

	closeAllSessions(): void {
		const ids = this._visibility.visibleSessions.get()
			.filter((s): s is IActiveSession => !!s)
			.map(s => s.sessionId);
		if (ids.length === 0) {
			return;
		}

		this._pendingNewSession = undefined;

		// Remove every visible session in a single pass; the visibility model
		// clears the active session, which drives the grid back to the
		// new-session view via the part's reconciliation.
		this._visibility.removeMany(ids);
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
		const entries = this._snapshotVisibleSessionStates();
		this.storageService.store(ACTIVE_SESSION_STATES_KEY, JSON.stringify(entries), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	private _snapshotVisibleSessionStates(): ISessionState[] {
		const activeId = this._visibility.activeSession.get()?.sessionId;
		const visible = this._visibility.visibleSessions.get();
		const entries: ISessionState[] = [];
		visible.forEach((session, index) => {
			if (!session) {
				return;
			}

			if (session.status.get() === SessionStatus.Untitled) {
				this._sessionStates.delete(session.resource);
				return;
			}

			// Keep the in-memory record up to date so the session's last active
			// chat is remembered while reopening it within this window.
			const existing = this._sessionStates.get(session.resource);
			const state: ISessionState = {
				sessionResource: session.resource.toString(),
				activeChatResource: session.activeChat.get()?.resource.toString() ?? existing?.activeChatResource,
				visibleOrder: index,
				isSticky: session.sticky.get(),
				isActive: session.sessionId === activeId,
			};
			this._sessionStates.set(session.resource, state);
			entries.push(state);
		});
		return entries;
	}

	/**
	 * The persisted visible sessions, ordered left-to-right by their stored
	 * grid position.
	 */
	private _getVisibleSessionStates(): ISessionState[] {
		const states: ISessionState[] = [];
		for (const [, state] of this._sessionStates) {
			if (state.visibleOrder !== undefined) {
				states.push(state);
			}
		}
		return states.sort((a, b) => (a.visibleOrder! - b.visibleOrder!));
	}

	/**
	 * Wait for the session with the given resource to become available via its
	 * provider, resolving with the session or `undefined` if the token is
	 * cancelled before it appears. When `timeout` is given, resolves with
	 * `undefined` after that many milliseconds so a persisted session that never
	 * resurfaces (e.g. deleted while the window was closed) cannot keep restore
	 * pending — and its provider listeners alive — indefinitely.
	 */
	private _waitForSession(sessionResource: URI, token: CancellationToken, timeout?: number): Promise<ISession | undefined> {
		const existing = this.getSession(sessionResource);
		if (existing) {
			return Promise.resolve(existing);
		}
		return new Promise<ISession | undefined>(resolve => {
			const disposables = new DisposableStore();
			let resolved = false;
			const finish = (session: ISession | undefined) => {
				if (resolved) {
					return;
				}
				resolved = true;
				disposables.dispose();
				resolve(session);
			};

			disposables.add(token.onCancellationRequested(() => finish(undefined)));

			const tryFind = () => {
				if (token.isCancellationRequested) {
					finish(undefined);
					return;
				}
				const session = this.getSession(sessionResource);
				if (session) {
					finish(session);
				}
			};

			// Providers (e.g. the agent host) load their session cache
			// asynchronously, so the session may appear via either a provider
			// change or a session list change.
			disposables.add(this.sessionsProvidersService.onDidChangeProviders(() => tryFind()));
			disposables.add(this.onDidChangeSessions(() => tryFind()));

			// Give up after the timeout so the listeners above are not retained
			// forever when the session is gone for good.
			if (timeout !== undefined) {
				disposables.add(disposableTimeout(() => finish(undefined), timeout));
			}

			// In case the session became available between the initial check and
			// the listener registration.
			tryFind();
		});
	}

	async restoreVisibleSessions(): Promise<void> {
		// Ordered list of slots to restore: real sessions plus, optionally, the
		// empty (new-session) slot when it was active.
		interface IRestoreTarget {
			readonly resource: URI | undefined;
			readonly isSticky: boolean;
			readonly isActive: boolean;
			readonly order: number;
		}

		const targets: IRestoreTarget[] = this._getVisibleSessionStates().map(state => ({
			resource: URI.parse(state.sessionResource),
			isSticky: !!state.isSticky,
			isActive: !!state.isActive,
			order: state.visibleOrder!,
		}));

		if (targets.length === 0) {
			targets.push({ resource: undefined, isSticky: false, isActive: true, order: 1 });
		}

		targets.sort((a, b) => a.order - b.order);

		let activeIdx = targets.findIndex(t => t.isActive);
		if (activeIdx < 0) {
			activeIdx = 0;
		}

		// Use a dedicated cancellation token (not the shared open-session one)
		// so that a new-session draft created during restore (e.g. by the
		// new-chat composer on startup) does not abort restoring the grid. The
		// token is cancelled only when the user explicitly opens a session.
		const cts = new CancellationTokenSource();
		this._restoreCts.value = cts;
		const token = cts.token;

		// Sessions resolved so far, indexed by their position in `targets`.
		// `null` marks the empty (new-session) slot, which has no session.
		const resolved: (ISession | null | undefined)[] = new Array(targets.length).fill(undefined);

		/**
		 * Insert a resolved session into the grid next to the nearest
		 * already-placed neighbour, preserving the persisted order regardless of
		 * the order in which sessions become available. When a neighbour exists
		 * the active session is left unchanged; only in the edge case where no
		 * neighbour has been placed yet (e.g. the active target never resurfaced,
		 * so the grid laid out empty) does the first session to arrive become
		 * active as a sensible fallback.
		 */
		const place = (idx: number, session: ISession): void => {
			let anchor: { id: string | undefined; side: 'left' | 'right' } | undefined;
			for (let j = idx - 1; j >= 0 && !anchor; j--) {
				const neighbour = resolved[j];
				if (neighbour !== undefined) {
					anchor = { id: neighbour?.sessionId, side: 'right' };
				}
			}
			for (let j = idx + 1; j < targets.length && !anchor; j++) {
				const neighbour = resolved[j];
				if (neighbour !== undefined) {
					anchor = { id: neighbour?.sessionId, side: 'left' };
				}
			}

			resolved[idx] = session;
			if (anchor) {
				this._visibility.insertAt(session, anchor.id, anchor.side, false);
			} else {
				this.setActiveSession(session);
			}
			if (targets[idx].isSticky) {
				this._visibility.toggleStickiness(session);
			}
		};

		// Resolve the active session first so it can act as the anchor for the
		// initial layout. The empty slot resolves immediately (the grid already
		// shows the new-session view). Load progress is surfaced per-leaf by the
		// chat view itself once the grid is laid out (mirroring how each editor
		// group owns its progress bar), so no part-wide progress is driven here.
		const activeTarget = targets[activeIdx];
		const activeSessionPromise: Promise<ISession | undefined> = activeTarget.resource
			? this._waitForSession(activeTarget.resource, token, RESTORE_SESSION_WAIT_TIMEOUT).then(session => session ?? undefined)
			: Promise.resolve<ISession | undefined>(undefined);

		const activeSession = await activeSessionPromise;

		if (token.isCancellationRequested) {
			return;
		}

		// Lay out all currently-available sessions atomically in the persisted
		// order so the grid appears in one shot rather than building up slot by
		// slot (which caused the active session to be shown alone and then
		// reflow as the others were inserted). Sessions whose provider has not
		// yet surfaced them are filled in incrementally below.
		const slots: { session: ISession | undefined; sticky: boolean }[] = [];
		let activeSlotIndex = -1;
		for (let idx = 0; idx < targets.length; idx++) {
			const target = targets[idx];
			let session: ISession | null | undefined;
			if (!target.resource) {
				session = null; // empty new-session slot
			} else if (idx === activeIdx) {
				session = activeSession;
			} else {
				session = this.getSession(target.resource);
			}
			if (session === undefined) {
				continue; // not yet available — placed incrementally below
			}
			resolved[idx] = session;
			if (idx === activeIdx) {
				activeSlotIndex = slots.length;
			}
			slots.push({ session: session ?? undefined, sticky: target.isSticky });
		}
		this._visibility.restoreGrid(slots, activeSlotIndex);

		if (token.isCancellationRequested) {
			return;
		}

		// Focus is moved into the restored active session by the sessions part,
		// which observes the active-session change (see SessionsPartService).

		// Place any sessions that became available later in their correct
		// positions around the already-established layout.
		await Promise.all(targets.map(async (target, idx) => {
			if (idx === activeIdx || !target.resource || token.isCancellationRequested || resolved[idx] !== undefined) {
				return;
			}
			const session = await this._waitForSession(target.resource, token, RESTORE_SESSION_WAIT_TIMEOUT);
			if (!session || token.isCancellationRequested || resolved[idx] !== undefined) {
				return;
			}
			place(idx, session);
		}));
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

registerSingleton(ISessionsManagementService, SessionsManagementService, InstantiationType.Eager);
