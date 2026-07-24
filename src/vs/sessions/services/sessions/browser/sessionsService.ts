/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { IObservable, autorun } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceTrustRequestService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { localize } from '../../../../nls.js';
import { ChatInteractivity, ChatOriginKind, IChat, ISession, SessionStatus } from '../common/session.js';
import { IActiveSession, ICreateNewChatInSessionOptions, ICreateNewSessionOptions, IRecentlyOpenedSessions, ISessionsChangeEvent, ISessionsManagementService, IToggleSessionStickinessEvent } from '../common/sessionsManagement.js';
import { ISessionsProvidersService } from './sessionsProvidersService.js';
import { SessionsNavigation } from './sessionNavigation.js';
import { SessionsRecencyHistory } from './sessionsRecencyHistory.js';
import { VisibleSessions } from './visibleSessions.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ISessionsPartService } from './sessionsPartService.js';
import { IsNewChatSessionContext } from '../../../common/contextkeys.js';
import { setActiveSessionContextKeys } from '../common/sessionContextKeys.js';

const ACTIVE_SESSION_STATES_KEY = 'agentSessions.activeSessionStates';

/**
 * Upper bound on how long restore waits for a persisted session to resurface
 * via its provider. Generous (providers may load after auth settles) but finite
 * so a session that is gone for good cannot keep restore — and its provider
 * listeners — alive indefinitely.
 */
const RESTORE_SESSION_WAIT_TIMEOUT = 30_000;

/** Maximum number of recently opened sessions reported by {@link SessionsService.getRecentlyOpenedSessions}. */
const MAX_RECENTLY_OPENED_SESSIONS = 10;

/**
 * Options for {@link ISessionsService.openNewSession}.
 */
export interface IOpenNewSessionOptions extends ICreateNewSessionOptions {
	/**
	 * Folder to create a concrete draft session for. When set, a new draft is
	 * created and shown; when omitted, the new-session composer is shown
	 * (restoring any pending draft).
	 */
	readonly folderUri?: URI;
}

/**
 * Result of {@link ISessionsService.openNewSession}. `session` holds the
 * created/restored draft on success. `trustDeclined` is `true` only when a
 * `folderUri` was supplied, the folder required workspace trust, and the
 * user explicitly declined it — distinct from any other resolution/creation
 * failure (where `session` is also `undefined` but `trustDeclined` is
 * `false`, since that may still succeed later once a provider registers).
 */
export interface IOpenNewSessionResult {
	readonly session: ISession | undefined;
	readonly trustDeclined: boolean;
}

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
	/**
	 * Resource URIs of chats that were closed (hidden from the tab strip) at save
	 * time. Restored so closed chats stay hidden across reloads; reopen them from
	 * the session header's chats dropdown.
	 */
	closedChatResources?: string[];
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

/**
 * Owns the visible sessions shown in the sessions part's grid and everything
 * that drives them: opening sessions/chats, the new-session composer view,
 * grid arrangement (insert / stickiness / close), Back/Forward navigation,
 * focus, and per-session view persistence (restore).
 *
 * This is the *view* counterpart to the *model*
 * {@link ISessionsManagementService}: it reflects model changes reactively and
 * owns the {@link activeSession} (the visible active slot). It never performs
 * model lifecycle operations (creating sessions, sending requests, CRUD)
 * itself — those stay in the management service.
 */
export interface ISessionsService {
	readonly _serviceBrand: undefined;

	/**
	 * Observable for the currently active session as {@link IActiveSession},
	 * or `undefined` for the new-session (empty) slot.
	 *
	 * This is the canonical active session: it reflects the visible active slot
	 * in the grid. The split mirrors `IEditorService.activeEditor` (view owns
	 * the active editor) vs the session model in
	 * {@link ISessionsManagementService}.
	 */
	readonly activeSession: IObservable<IActiveSession | undefined>;

	/**
	 * Observable list of slots currently displayed in the sessions part's
	 * grid, in their grid order (left-to-right). Each entry is either an
	 * {@link IActiveSession} or `undefined` for the empty (new-session)
	 * placeholder. At most one entry is `undefined` at a time. Sessions
	 * pinned via {@link toggleSessionStickiness} are sticky; the remaining
	 * non-sticky entries get replaced when new sessions are opened.
	 */
	readonly visibleSessions: IObservable<readonly (IActiveSession | undefined)[]>;

	/** Fires after a session's stickiness was toggled via {@link toggleSessionStickiness}. */
	readonly onDidToggleSessionStickiness: Event<IToggleSessionStickinessEvent>;

	/**
	 * Get all sessions from all registered providers, split into two groups:
	 * - `recent`: sessions opened in this workspace, most recently opened first,
	 *   capped at a fixed maximum.
	 * - `other`: the remaining sessions, sorted by their last update time (most
	 *   recently updated first).
	 *
	 * Used to populate the sessions picker.
	 */
	getRecentlyOpenedSessions(): IRecentlyOpenedSessions;

	/**
	 * Select an existing session as the active session and show it in the grid.
	 * When `options.preserveFocus` is set, the session is shown without moving
	 * keyboard focus into it.
	 */
	openSession(sessionResource: URI, options?: { preserveFocus?: boolean }): Promise<void>;

	/**
	 * Open a specific chat within a session and show it in the grid.
	 */
	openChat(session: ISession, chatUri: URI): Promise<void>;

	/**
	 * Close a chat from the session view. The chat is hidden from the tab strip
	 * and can be reopened from the session header's chats dropdown.
	 */
	closeChat(session: IActiveSession, chat: IChat): Promise<void>;

	/**
	 * Open the new-session composer.
	 *
	 * - Without `options.folderUri`: switch to the new-session view, restoring
	 *   the pending (composed-but-not-sent) draft if one exists, otherwise
	 *   showing the empty placeholder. No-op when the empty placeholder is
	 *   already showing (no session active). Returns the restored pending
	 *   draft as `result.session`, or `undefined` when none; `trustDeclined`
	 *   is always `false`.
	 * - With `options.folderUri`: resolve the workspace and, when it requires
	 *   workspace trust, prompt for it first (single gate for every path that
	 *   creates a concrete session for a folder). If trust is declined,
	 *   returns `{ session: undefined, trustDeclined: true }` without
	 *   creating a session. Otherwise creates a concrete draft session for
	 *   that folder (via {@link ISessionsManagementService.createNewSession})
	 *   and shows it as the active session, returning it as `result.session`.
	 */
	openNewSession(options?: IOpenNewSessionOptions): Promise<IOpenNewSessionResult>;

	/**
	 * Open a new **quick chat**: create a concrete workspace-less draft session
	 * (via {@link ISessionsManagementService.createQuickChat}) and show it as the
	 * active session. Returns the activated session, or `undefined` when no
	 * provider supports quick chats.
	 */
	openQuickChat(options?: ICreateNewSessionOptions): IActiveSession | undefined;

	/**
	 * Switch to the new-chat-in-session view.
	 * Adds a new chat to the session via the provider, makes it the active chat,
	 * and shows a rich input for composing a message. Pass
	 * {@link ICreateNewChatInSessionOptions.forceNew} to always create a fresh
	 * chat (e.g. when resetting the composer right after a background send).
	 */
	openNewChatInSession(session: ISession, options?: ICreateNewChatInSessionOptions): Promise<void>;

	/**
	 * Discard the pending new session and clear the active session, returning
	 * to the empty new-session placeholder.
	 */
	unsetNewSession(): void;

	/**
	 * Insert (or move) a session into the grid positioned next to a target
	 * session that is already visible.
	 */
	insertAt(session: ISession, targetSessionId: string, side: 'left' | 'right', activate?: boolean): void;

	/**
	 * Toggle a session's stickiness in the grid. The session keeps its grid
	 * slot when toggled. If the session is not currently visible, it is
	 * appended to the grid as sticky.
	 */
	toggleSessionStickiness(session: ISession): void;

	/**
	 * Close a session: remove it from the grid. If it was the active one, the
	 * previous visible session becomes active; if no session remains visible,
	 * the new-session view is opened. Passing `undefined` closes the empty
	 * (new-session) slot if it is currently visible.
	 */
	closeSession(session: ISession | undefined): void;

	/**
	 * Close all sessions currently shown in the grid and land on the
	 * new-session view. No-op when no session is currently visible.
	 */
	closeAllSessions(): void;

	/** Make the given (already visible) session the active session. */
	setActive(session: IActiveSession | undefined): void;

	/**
	 * Restore the sessions that were visible in the grid from persisted state.
	 * Restores their order, sticky (pinned) state and the active session,
	 * waiting until each session's provider makes it available. Falls back to
	 * the new-session view when nothing can be restored.
	 */
	restoreVisibleSessions(): Promise<void>;

	/** Navigate to the previous session in the navigation history. */
	openPreviousSession(): Promise<void>;

	/** Navigate to the next session in the navigation history. */
	openNextSession(): Promise<void>;
}

export const ISessionsService = createDecorator<ISessionsService>('sessionsService');

export class SessionsService extends Disposable implements ISessionsService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidToggleSessionStickiness = this._register(new Emitter<IToggleSessionStickinessEvent>());
	readonly onDidToggleSessionStickiness: Event<IToggleSessionStickinessEvent> = this._onDidToggleSessionStickiness.event;

	/** Owns the active/sticky/transient visibility model and the {@link IActiveSession} wrappers. */
	private readonly _visibility: VisibleSessions;
	readonly visibleSessions: IObservable<readonly (IActiveSession | undefined)[]>;

	/** The canonical active session — the visible active slot. */
	readonly activeSession: IObservable<IActiveSession | undefined>;

	private readonly _isNewChatSessionContext: IContextKey<boolean>;

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

	private readonly _sessionStates: ResourceMap<ISessionState>;
	private readonly _navigation: SessionsNavigation;
	/**
	 * The single source of truth for session recency (most-recently-opened
	 * first), persisted across restarts. Both the recent-sessions picker (via
	 * {@link getRecentlyOpenedSessions}) and {@link SessionsNavigation} build on
	 * top of it.
	 */
	private readonly _recencyHistory: SessionsRecencyHistory;

	/**
	 * Session id (or `undefined` for the new-session slot) that focus was last
	 * moved into in response to an active-session change. Tracks the active id
	 * so unrelated visibility updates don't re-focus and steal focus.
	 */
	private _focusedActiveSessionId: string | undefined;

	/** The in-flight foreground send's "keep newest chat active" follow. */
	private readonly _sendFollow = this._register(new MutableDisposable<DisposableStore>());

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@ISessionsPartService private readonly sessionsPartService: ISessionsPartService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkspaceTrustRequestService private readonly workspaceTrustRequestService: IWorkspaceTrustRequestService,
	) {
		super();

		// Load persisted state
		this._sessionStates = this._loadSessionStates();

		// Visibility model — owns wrappers, active/sticky/transient state, and
		// observables exposed to the UI.
		this._visibility = this._register(this.instantiationService.createInstance(
			VisibleSessions,
			session => this._restoreInitialChat(session),
			session => this._restoreClosedChats(session),
		));
		this.visibleSessions = this._visibility.visibleSessions;
		this.activeSession = this._visibility.activeSession;

		// Bind active-session context keys. These reflect the visible active
		// slot (the view's `activeSession`); `isNewChatSession` also consults
		// the model's in-progress draft (`newSession`).
		this._isNewChatSessionContext = IsNewChatSessionContext.bindTo(this.contextKeyService);

		// Save on shutdown
		this._register(this.storageService.onWillSaveState(() => this._saveSessionStates()));

		// Session recency history — the single source of truth for "recently
		// opened" ordering, shared by the picker and navigation.
		this._recencyHistory = this._register(new SessionsRecencyHistory(
			this.storageService,
			this.logService,
		));

		// Session navigation history (Back/Forward) builds on the recency history.
		this._navigation = this._register(new SessionsNavigation(
			this,
			this.activeSession,
			this.sessionsManagementService,
			this._recencyHistory,
			this.contextKeyService,
			this.logService,
		));
		this._register(this.sessionsManagementService.onDidChangeSessions(e => this._navigation.onDidRemoveSessions(e)));
		this._register(this.sessionsManagementService.onDidDeleteSession(session => this._recencyHistory.remove(entry => entry.sessionResource.toString() === session.resource.toString())));

		// Keep the active-session context keys in sync with the visible active
		// slot and the model's in-progress draft. The helper reads the session's
		// observable properties via `reader`, so this autorun re-applies the keys
		// whenever any of them change.
		this._register(autorun(reader => {
			const activeSession = this.activeSession.read(reader);
			const newSession = this.sessionsManagementService.newSession.read(reader);
			// `isNewChatSession` is true when no active session exists, OR when the
			// active session is still the in-progress new session (created but not yet
			// sent for the first time). Scoping to the active session avoids flipping
			// into "new chat" mode while viewing a different established session.
			this._isNewChatSessionContext.set(activeSession === undefined || activeSession.sessionId === newSession?.sessionId);
			setActiveSessionContextKeys(activeSession, this.contextKeyService, reader);
		}));

		// Per-active-session view reactions (archived → new-session view,
		// active-chat removed → fallback chat, persist the active chat).
		this._register(autorun(reader => {
			const activeSession = this.activeSession.read(reader);
			if (activeSession) {
				reader.store.add(this._activeSessionViewListeners(activeSession));
			}
		}));

		// Viewing a session marks it read. This keeps the active session read
		// while it stays active, so `ISession.isRead` is the single source of
		// truth for read state (no display-only overlay needed).
		this._register(autorun(reader => {
			const activeSession = this.activeSession.read(reader);
			if (activeSession && !activeSession.isRead.read(reader)) {
				this.sessionsManagementService.markRead(activeSession);
			}
		}));

		// Reflect provider-level session changes onto the grid: drop removed
		// sessions and pick a fallback (or the new-session view) when the active
		// one disappears.
		this._register(this.sessionsManagementService.onDidChangeSessions(e => this._onDidChangeSessions(e)));

		// Reflect provider session replacement (e.g. a draft graduating into a
		// committed session) onto the grid slot.
		this._register(this.sessionsManagementService.onDidReplaceSession(({ from, to }) => this._onDidReplaceSession(from, to)));

		// While a foreground send materialises new chats, keep the newest chat
		// active in the visible slot so the user sees the chat being sent.
		this._register(this.sessionsManagementService.onWillSendRequest(session => this._startSendFollow(session)));
		this._register(this.sessionsManagementService.onDidSendRequest(() => this._sendFollow.clear()));

		// Drive the part: reconcile the grid and move focus into the active
		// session whenever the visible sessions or the active session change.
		this._register(autorun(reader => {
			const visible = this.visibleSessions.read(reader);
			const active = this._visibility.activeSession.read(reader);
			const preserveFocus = this._visibility.activePreserveFocus.read(reader);
			this.sessionsPartService.updateVisibleSessions(visible, active);

			// Move keyboard focus into the active session whenever it changes
			// (e.g. after opening, switching to, or restoring a session) so the
			// user can start typing immediately. The focus is guarded so a
			// session the user is already interacting with is never re-focused
			// (which would steal focus from the clicked element), and the id
			// check ensures unrelated visibility updates do not move focus.
			// `preserveFocus` (published atomically with the active session)
			// suppresses the focus move for background opens.
			const activeId = active?.sessionId;
			if (activeId !== this._focusedActiveSessionId) {
				this._focusedActiveSessionId = activeId;
				if (!preserveFocus) {
					this.sessionsPartService.focusSession(active);
				}
			}
		}));

		// When a session view in the grid receives focus, promote that session
		// to the active session.
		this._register(this.sessionsPartService.onDidFocusSession(sessionId => {
			const session = this.visibleSessions.get().find(s => s?.sessionId === sessionId);
			if (session) {
				this.setActive(session);
			}
		}));
	}

	private _onDidReplaceSession(from: ISession, to: ISession): void {
		this._visibility.updateSession(from, to);
	}

	private _activeSessionViewListeners(activeSession: IActiveSession): IDisposable {
		const disposables = new DisposableStore();

		// When the active session becomes archived, return to the new-session
		// view (or the quick-chat composer for a quick chat), keeping context.
		let wasArchived = activeSession.isArchived.get();
		disposables.add(autorun(reader => {
			const isArchived = activeSession.isArchived.read(reader);
			if (isArchived && !wasArchived) {
				if (activeSession.isQuickChat?.read(undefined)) {
					this.openQuickChat();
				} else {
					const folderUri = activeSession.workspace.read(undefined)?.folders[0]?.root;
					this.openNewSession(folderUri ? { folderUri, providerId: activeSession.providerId, sessionTypeId: activeSession.sessionType } : undefined);
				}
			}
			wasArchived = isArchived;
		}));

		// Track chat list changes — if the active chat is removed, fall back.
		if (activeSession.status.get() !== SessionStatus.Untitled) {
			disposables.add(autorun(reader => {
				const chats = activeSession.chats.read(reader);
				const activeChat = activeSession.activeChat.read(reader);
				if (activeChat && !chats.some(c => this.uriIdentityService.extUri.isEqual(c.resource, activeChat.resource))) {
					// Fall back to the last visible (non-hidden) chat, or the main chat.
					const visible = chats.filter(c => c.interactivity.read(reader) !== ChatInteractivity.Hidden);
					const fallback = visible[visible.length - 1] ?? activeSession.mainChat.read(reader);
					if (fallback) {
						this.openChat(activeSession, fallback.resource);
					}
				}
			}));
		}

		// Track active chat changes to persist per-session state. The visible /
		// active / sticky flags are snapshotted from the live grid at save time
		// (see `_snapshotVisibleSessionStates`); here we only remember the last
		// active chat so reopening the session restores its selected chat. The
		// closed-chat set is persisted deterministically in `closeChat`/`openChat`
		// instead (see `_setChatClosedState`), so it never depends on chats being
		// loaded or on autorun timing.
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

	private _onDidChangeSessions(e: ISessionsChangeEvent): void {
		const currentActive = this._visibility.activeSession.get();

		// Clean removed sessions out of the visibility model (drops their grid
		// slot and disposes their wrapper). If the active session is among the
		// removed, removeMany picks a fallback active session (or clears it when
		// no slot remains); drive the open flow below so the fallback is fully
		// opened.
		if (e.removed.length) {
			for (const session of e.removed) {
				this._sessionStates.delete(session.resource);
			}
			this._visibility.removeMany(e.removed.map(r => r.sessionId));
		}

		if (!currentActive) {
			return;
		}

		if (e.removed.length && e.removed.some(r => r.sessionId === currentActive.sessionId)) {
			const fallback = this._visibility.activeSession.get();
			if (fallback && this.sessionsManagementService.getSession(fallback.resource)) {
				this.openSession(fallback.resource);
			} else {
				this.openNewSession();
			}
		}
	}

	private _startSendFollow(session: ISession): void {
		const store = new DisposableStore();
		let followId = session.sessionId;
		// A foreground send can replace the session id (draft graduating into a
		// committed session); keep following the new id.
		store.add(this.sessionsManagementService.onDidReplaceSession(({ from, to }) => {
			if (from.sessionId === followId) {
				followId = to.sessionId;
			}
		}));
		store.add(autorun(reader => {
			const active = this._visibility.activeSession.read(reader);
			if (active && active.sessionId === followId) {
				const chats = active.visibleChatTabs.read(reader);
				const lastChat = chats[chats.length - 1];
				if (lastChat) {
					this._visibility.setActiveChat(active, lastChat);
				}
			}
		}));
		this._sendFollow.value = store;
	}

	getRecentlyOpenedSessions(): IRecentlyOpenedSessions {
		const seen = new Set<string>();
		const recent: ISession[] = [];

		// Sessions in recency order (most-recently-opened first), deduplicated by
		// session so a session with multiple opened chats appears only once and
		// capped at the most recent {@link MAX_RECENTLY_OPENED_SESSIONS}.
		for (const entry of this._recencyHistory.entries) {
			if (recent.length >= MAX_RECENTLY_OPENED_SESSIONS) {
				break;
			}
			const key = entry.sessionResource.toString();
			if (seen.has(key)) {
				continue;
			}
			seen.add(key);
			const session = this.sessionsManagementService.getSession(entry.sessionResource);
			if (session) {
				recent.push(session);
			}
		}

		// Sessions that have not been included in the recently opened group,
		// sorted by most recently updated first.
		const other = this.sessionsManagementService.getSessions()
			.filter(s => !seen.has(s.resource.toString()))
			.sort((a, b) => b.updatedAt.get().getTime() - a.updatedAt.get().getTime());

		return { recent, other };
	}

	/**
	 * Cancel any in-flight open-session/restore and return a fresh cancellation token.
	 */
	private _startOpenSession(): CancellationToken {
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

	/**
	 * Make the given session active in the visibility model, optionally without
	 * moving focus into it. The preserve-focus intent is published atomically
	 * with the active session by the visibility model, and the model's
	 * canonical active session is updated reactively by the mirror autorun.
	 */
	private _activate(session: ISession | undefined, preserveFocus?: boolean): IActiveSession | undefined {
		return this._visibility.setActive(session, preserveFocus);
	}

	async openChat(session: ISession, chatUri: URI): Promise<void> {
		const t0 = Date.now();
		this._cancelRestore();
		const token = this._startOpenSession();
		this.logService.trace(`[SessionsView] openChat start uri=${chatUri.toString()} provider=${session.providerId}`);
		this._activate(session);
		if (!await this._waitForSessionToLoad(session, token)) {
			this.logService.trace(`[SessionsView] openChat cancelled while waiting for session to load uri=${chatUri.toString()}`);
			return;
		}

		// Find the chat and update active chat
		let chat: IChat | undefined;
		const activeSession = this._visibility.activeSession.get();
		if (activeSession) {
			chat = activeSession.chats.get().find(c => this.uriIdentityService.extUri.isEqual(c.resource, chatUri));
			if (chat) {
				// Opening a chat also un-hides it if it was previously closed.
				this._visibility.openChat(session, chat);
				this._visibility.setActiveChat(session, chat);
				this._setChatClosedState(session, chat, false);
			}
		}

		if (chat && chat.status.get() === SessionStatus.Untitled) {
			this.logService.trace(`[SessionsView] openChat done total=${Date.now() - t0}ms uri=${chatUri.toString()} path=untitled`);
			return;
		}

		this.logService.trace(`[SessionsView] openChat done total=${Date.now() - t0}ms uri=${chatUri.toString()}`);
	}

	async closeChat(session: IActiveSession, chat: IChat): Promise<void> {
		// Closing hides the chat from the tab strip; it stays reopenable from the
		// session header's chats dropdown.
		this._visibility.closeChat(session, chat);
		this._setChatClosedState(session, chat, true);
	}

	/**
	 * Persist a chat's closed/open state into the session's stored view state so
	 * it survives switching the session out of the grid (which disposes its
	 * wrapper) and reloads. Done synchronously on the close/open action rather
	 * than reactively from `closedChats`, which would depend on the session's
	 * chats being loaded. The main chat can never be closed and is ignored.
	 */
	private _setChatClosedState(session: ISession, chat: IChat, closed: boolean): void {
		if (this.uriIdentityService.extUri.isEqual(chat.resource, session.mainChat.get().resource)) {
			return;
		}
		// Subagent (tool-origin) chats are hidden by default and toggled via an
		// in-memory shown set, not the persisted closed set, so they never
		// participate in closed-chat persistence.
		if (chat.origin?.kind === ChatOriginKind.Tool) {
			return;
		}
		const existing = this._sessionStates.get(session.resource);
		const closedSet = new Set(existing?.closedChatResources ?? []);
		const chatResource = chat.resource.toString();
		if (closed) {
			closedSet.add(chatResource);
		} else if (!closedSet.delete(chatResource)) {
			return; // nothing changed (chat was not closed)
		}
		this._sessionStates.set(session.resource, {
			...existing,
			sessionResource: session.resource.toString(),
			closedChatResources: [...closedSet],
		});
	}

	async openSession(sessionResource: URI, options?: { preserveFocus?: boolean }): Promise<void> {
		this._cancelRestore();
		const token = this._startOpenSession();
		await this._doOpenSession(sessionResource, token, options);
	}

	private async _doOpenSession(sessionResource: URI, token: CancellationToken, options?: { preserveFocus?: boolean }): Promise<void> {
		const t0 = Date.now();
		const sessionData = this.sessionsManagementService.getSession(sessionResource);
		if (!sessionData) {
			this.logService.warn(`[SessionsView] openSession: session not found uri=${sessionResource.toString()}`);
			throw new Error(`Session with resource ${sessionResource.toString()} not found`);
		}
		this.logService.trace(`[SessionsView] openSession start uri=${sessionResource.toString()} provider=${sessionData.providerId}`);
		this._activate(sessionData, options?.preserveFocus);
		if (!await this._waitForSessionToLoad(sessionData, token)) {
			this.logService.trace(`[SessionsView] openSession cancelled while waiting for session to load uri=${sessionResource.toString()}`);
			return;
		}

		this.logService.trace(`[SessionsView] openSession done total=${Date.now() - t0}ms uri=${sessionResource.toString()}`);
	}

	unsetNewSession(): void {
		this.sessionsManagementService.discardNewSession();
		this._activate(undefined);
	}

	async openNewSession(options?: IOpenNewSessionOptions): Promise<IOpenNewSessionResult> {
		const folderUri = options?.folderUri;
		if (folderUri) {
			// Single trust gate for every path that creates a concrete session for
			// a folder (the workspace picker dropdown, the folder Quick Pick, etc.):
			// resolve the workspace and, if it requires trust, prompt before
			// creating the session. A no-op if the folder is already trusted.
			// Resolved with the same provider `createNewSession` below will use
			// (honoring `options.providerId`), so the trust decision always
			// reflects the workspace that is actually about to be created.
			const resolved = this.sessionsManagementService.resolveWorkspace(folderUri, options?.providerId);
			if (resolved?.workspace.requiresWorkspaceTrust) {
				const trusted = await this.workspaceTrustRequestService.requestResourcesTrust({
					uri: folderUri,
					message: localize('sessionsService.trustFolderMessage', "An agent session will be able to read files, run commands, and make changes in this folder."),
				});
				if (!trusted) {
					return { session: undefined, trustDeclined: true };
				}
			}

			this._startOpenSession();
			try {
				const session = this.sessionsManagementService.createNewSession(folderUri, options);
				this._activate(session);
				return { session, trustDeclined: false };
			} catch (e) {
				// When the folder cannot be resolved (e.g. the active session's
				// workspace uses an unsupported scheme like 'unknown:/'), fall
				// through to the folder-less composer view.
				this.logService.trace(`[SessionsView] openNewSession: createNewSession failed for folder ${folderUri.toString()}, falling back to composer view`);
			}
		}

		// Without a folder (or when folder resolution failed above): switch to
		// the new-session composer view.
		// No-op when no session is active (empty new-session placeholder showing).
		if (this._visibility.activeSession.get() === undefined) {
			return { session: undefined, trustDeclined: false };
		}
		if (!folderUri) {
			this._startOpenSession();
		}

		// Restore the in-progress new session if one exists, so pickers re-derive
		// their state from the still-alive session object. Otherwise clear the
		// active session (first time / after send).
		const newSession = this.sessionsManagementService.newSession.get();

		// A quick-chat draft must not be restored into the workspace new-session
		// composer (symmetric to the New Quick Chat gesture): discard it and show
		// a fresh workspace composer instead.
		if (newSession?.isQuickChat?.get()) {
			this.sessionsManagementService.discardNewSession(newSession);
			this._activate(undefined);
			return { session: undefined, trustDeclined: false };
		}

		this._activate(newSession ?? undefined);
		return { session: newSession ?? undefined, trustDeclined: false };
	}

	openQuickChat(options?: ICreateNewSessionOptions): IActiveSession | undefined {
		this._startOpenSession();
		try {
			const session = this.sessionsManagementService.createQuickChat(options);
			return this._activate(session);
		} catch (e) {
			// No provider supports quick chats: leave whatever was visible as-is
			// rather than activating an unrelated workspace-bound draft.
			this.logService.trace(`[SessionsView] openQuickChat: createQuickChat failed: ${e}`);
			return undefined;
		}
	}

	async openNewChatInSession(session: ISession, options?: ICreateNewChatInSessionOptions): Promise<void> {
		this._cancelRestore();
		this._startOpenSession();
		const chat = await this.sessionsManagementService.createNewChatInSession(session, options);
		if (!chat) {
			return;
		}

		this._activate(session);

		// Set the chat as the active chat
		this._visibility.setActiveChat(session, chat);
	}

	setActive(session: IActiveSession | undefined): void {
		this._activate(session);
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

		// Discard the in-progress new session when its slot (or the empty slot)
		// is the one being closed; closing an unrelated session leaves it intact.
		this.sessionsManagementService.discardNewSession(session);

		this._visibility.removeMany([sessionId]);

		if (!wasActive) {
			return;
		}

		// removeMany already picked a fallback active session (or cleared the
		// active observable when no slot remains); drive the full open flow.
		const fallback = this._visibility.activeSession.get();
		if (fallback === undefined) {
			this.openNewSession();
		}
	}

	closeAllSessions(): void {
		const ids = this._visibility.visibleSessions.get()
			.filter((s): s is IActiveSession => !!s)
			.map(s => s.sessionId);
		if (ids.length === 0) {
			return;
		}

		this.sessionsManagementService.discardNewSession();

		// Remove every visible session in a single pass; the visibility model
		// clears the active session, which drives the grid back to the
		// new-session view via the reconcile autorun.
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
				this.logService.warn('[SessionsView] Failed to restore active chat from stored session state', error);
			}
		}
		return initialChat;
	}

	/**
	 * The resource strings of chats that were closed (hidden from the tab strip)
	 * when the session was last saved, so they stay hidden across reloads. Stale
	 * URIs that no longer match a chat are harmless: the visible session
	 * intersects them with the live chat list.
	 */
	private _restoreClosedChats(session: ISession): readonly string[] {
		return this._sessionStates.get(session.resource)?.closedChatResources ?? [];
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

		// Also persist the per-session state (closed chats, last active chat) of
		// sessions that are not currently visible, so a session switched out of
		// the grid keeps its closed-chat set across a reload. Grid-placement
		// fields are stripped so they are not restored into the grid.
		const visible = new ResourceMap<true>();
		for (const entry of entries) {
			visible.set(URI.parse(entry.sessionResource), true);
		}
		for (const [resource, state] of this._sessionStates) {
			if (visible.has(resource)) {
				continue;
			}
			entries.push({
				sessionResource: state.sessionResource,
				activeChatResource: state.activeChatResource,
				closedChatResources: state.closedChatResources,
			});
		}

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
			// chat is remembered while reopening it within this window. The
			// closed-chat set is maintained deterministically by
			// `_setChatClosedState`; prefer it over the live (loaded-chats only)
			// `closedChats` so a not-yet-loaded session does not drop its set.
			const existing = this._sessionStates.get(session.resource);
			const state: ISessionState = {
				sessionResource: session.resource.toString(),
				activeChatResource: session.activeChat.get()?.resource.toString() ?? existing?.activeChatResource,
				closedChatResources: existing?.closedChatResources ?? session.closedChats.get().map(c => c.resource.toString()),
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
		const existing = this.sessionsManagementService.getSession(sessionResource);
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
				const session = this.sessionsManagementService.getSession(sessionResource);
				if (session) {
					finish(session);
				}
			};

			// Providers (e.g. the agent host) load their session cache
			// asynchronously, so the session may appear via either a provider
			// change or a session list change.
			disposables.add(this.sessionsProvidersService.onDidChangeProviders(() => tryFind()));
			disposables.add(this.sessionsManagementService.onDidChangeSessions(() => tryFind()));

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
				this._activate(session);
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
				session = this.sessionsManagementService.getSession(target.resource);
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

		// Focus is moved into the restored active session by the reconcile
		// autorun, which observes the active-session change.

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
}

registerSingleton(ISessionsService, SessionsService, InstantiationType.Eager);
