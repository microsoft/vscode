/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout, raceTimeout } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isCancellationError, onUnexpectedError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { IObservable, autorun, derived, observableValue, transaction } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { localize } from '../../../../nls.js';
import { ChatInteractivity, ChatOriginKind, IChat, ISession, SessionStatus } from '../common/session.js';
import { IActiveSession, ICreateNewChatInSessionOptions, ICreateNewSessionOptions, inheritableSessionTarget, IRecentlyOpenedSessions, ISessionsChangeEvent, ISessionsManagementService, IToggleSessionStickinessEvent } from '../common/sessionsManagement.js';
import { ISessionsProvidersService } from './sessionsProvidersService.js';
import { ensureSessionWorktreesTrusted } from './worktreeTrust.js';
import { ClosedItemHistory } from './closedItemHistory.js';
import { SessionsNavigation } from './sessionNavigation.js';
import { SessionsRecencyHistory } from './sessionsRecencyHistory.js';
import { VisibleSessions } from './visibleSessions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ISessionsPartService, MAIN_SESSIONS_PART, SessionGridRequest } from './sessionsPartService.js';
import { ICustomViewService } from '../../customView/browser/customViewService.js';
import { setActiveSessionContextKeys } from '../common/sessionContextKeys.js';
import { ISessionChangesStatsCache } from '../common/sessionChangesStatsCache.js';
import { ISessionOpenTelemetryAttempt, ISessionOpenTelemetryService, SessionOpenSource } from './sessionOpenTelemetryService.js';
import { isAgentHostProvider } from '../../../common/agentHostSessionsProvider.js';
import { Direction } from '../../../../base/browser/ui/grid/grid.js';
import { ISessionGridState, ISessionWindowState, ISessionWindowsState, isSessionGridState, isSessionWindowsState, joinSessionGrids, projectSessionGrid } from './sessionGridState.js';
import { IAuxiliaryWindowOpenOptions } from '../../../../workbench/services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { getActiveWindow } from '../../../../base/browser/dom.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import Severity from '../../../../base/common/severity.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';

const ACTIVE_SESSION_STATES_KEY = 'agentSessions.activeSessionStates';
const SESSION_GRID_STATE_KEY = 'agentSessions.gridState';

export type SessionGridDirection = 'left' | 'right' | 'up' | 'down';

export function toSessionGridDirection(direction: Direction): SessionGridDirection {
	return direction === Direction.Left ? 'left' : direction === Direction.Right ? 'right' : direction === Direction.Up ? 'up' : 'down';
}

/** Upper bound on redirecting every persisted slot before the grid is restored. */
const RESTORE_RESOLVE_BUDGET_MS = 10_000;

/**
 * Upper bound on how long restore waits for a persisted session to resurface
 * via its provider. Generous (providers may load after auth settles) but finite
 * so a session that is gone for good cannot keep restore — and its provider
 * listeners — alive indefinitely.
 */
const RESTORE_SESSION_WAIT_TIMEOUT = 30_000;

/** Maximum number of recently opened sessions reported by {@link SessionsService.getRecentlyOpenedSessions}. */
const MAX_RECENTLY_OPENED_SESSIONS = 10;

type SessionNavigationIntent = 'explicit' | 'automatic';

export interface ISessionNavigationRequest {
	/** The caller's token, so deferred handoffs can recognize their own navigation. */
	readonly token: CancellationToken;
}

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
	/** Cancel startup session restoration so this new-session navigation wins. */
	readonly cancelRestore?: boolean;
	/** Keep the current navigation intent when the composer creates or updates its own draft. */
	readonly preserveNavigation?: boolean;

	/**
	 * When `true`, opens the new session (or empty composer slot) to the side
	 * of the active session in the grid instead of replacing it in place.
	 */
	readonly toSide?: boolean;
	/** Require the created draft to start in a Dev Container rather than falling back to host execution. */
	readonly requireDevContainer?: boolean;
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

/** Options for {@link ISessionsService.closeChat}. */
export interface ICloseChatOptions {
	/**
	 * Do not remember the chat as the most recently closed item. Used by batch
	 * closes (e.g. "Close All Chats"), where remembering just the final chat of
	 * the batch would make one arbitrary member of it reopenable.
	 */
	readonly skipHistory?: boolean;
}

export interface IOpenSessionOptions {
	readonly partId?: string;
	readonly preserveFocus?: boolean;
	readonly source?: SessionOpenSource;
	readonly restoreOnlySideOrToolChat?: boolean;
	readonly forceMainChat?: boolean;
}

export interface IOpenSessionsOptions extends IOpenSessionOptions {
	readonly activate?: 'first' | 'last' | false;
}

/**
 * Persisted state for a session.
 * Extend this interface to store additional per-session state that should be
 * remembered across restarts.
 */
interface ISessionState {
	/** Legacy count-based arrangement hint, consumed only during migration. */
	gridLayout?: 'columns' | 'grid';
	/** The resource URI of the session. */
	sessionResource: string;
	/** The resource URI of the last active chat within the session. */
	activeChatResource?: string;
	/** The origin of the last active chat within the session. */
	activeChatOrigin?: ChatOriginKind;
	/**
	 * Resource URIs of chats that were closed (hidden from the tab strip) at save
	 * time. Restored so closed chats stay hidden across reloads; reopen them from
	 * the session header's chats dropdown.
	 */
	closedChatResources?: string[];
	/** Resource URIs of chats that were opened as tabs. */
	openedChatResources?: string[];
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
	readonly mainVisibleSessions: IObservable<readonly (IActiveSession | undefined)[]>;
	getSessionPartId(session: ISession | undefined): string;
	moveSessionsToNewWindow(sessions: readonly ISession[], options?: IAuxiliaryWindowOpenOptions): Promise<void>;
	moveSessionsToWindow(sessions: readonly ISession[], partId: string): Promise<void>;
	returnSessionsToMainWindow(partId: string): void;

	/** Whether the initial persisted visible-session restore has settled. */
	readonly initialRestoreComplete: IObservable<boolean>;

	/** Latest explicit navigation, including requests to an already-active empty composer. */
	readonly navigationRequest: IObservable<ISessionNavigationRequest | undefined>;

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
	 * Synchronously select an existing session as active and show it in the grid
	 * without waiting for its provider-backed state to load.
	 */
	showSession(sessionResource: URI, options?: { preserveFocus?: boolean }): void;

	/**
	 * Select an existing session as the active session and show it in the grid.
	 * When `options.preserveFocus` is set, the session is shown without moving
	 * keyboard focus into it.
	 */
	openSession(sessionResource: URI, options?: IOpenSessionOptions): Promise<void>;

	/** Place a session to the right of a visible reference, or the last visible session, and activate it. */
	openSessionToSide(session: ISession, options?: IOpenSessionOptions & { chatResource?: URI; referenceSessionId?: string }): Promise<void>;

	/** Open a chat beside a visible reference chat, or its current group, redirecting a superseded resource first. */
	openChatToSide(session: ISession, chatResource: URI, options?: { preserveFocus?: boolean; referenceChatResource?: URI }): Promise<void>;

	/**
	 * Whether the given session may be opened, honoring workspace trust. Prompts
	 * for trust on any untrusted folder the session runs in and resolves to
	 * `false` if the user declines.
	 */
	canOpenSession(session: ISession): Promise<boolean>;

	/**
	 * Open a specific chat within a session and show it in the grid.
	 * When `options.preserveFocus` is set, the chat is shown without moving
	 * keyboard focus into it.
	 */
	openChat(session: ISession, chatUri: URI, options?: IOpenSessionOptions): Promise<void>;

	/**
	 * Close a chat from the session view. The chat is hidden from the tab strip
	 * and can be reopened from the session header's chats dropdown.
	 */
	closeChat(session: IActiveSession, chat: IChat, options?: ICloseChatOptions): Promise<void>;

	/**
	 * Reopen the single most recently closed chat or session and focus it.
	 *
	 * A closed chat is un-hidden in its session. A session that was closed
	 * explicitly returns to the grid at the index it occupied; a session that
	 * was pushed out of the grid by a newly opened one takes its slot back,
	 * removing the session that replaced it.
	 *
	 * The entry is consumed, so pressing the shortcut repeatedly does not walk
	 * further back through history. No-op when nothing is remembered.
	 */
	reopenLastClosedItem(): Promise<void>;

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
	openNewSession(options?: IOpenNewSessionOptions, token?: CancellationToken): Promise<IOpenNewSessionResult>;

	/**
	 * Open a new **quick chat**: create a concrete workspace-less draft session
	 * (via {@link ISessionsManagementService.createQuickChat}) and show it as the
	 * active session. Returns the activated session, or `undefined` when no
	 * provider supports quick chats. Automatic fallbacks preserve pending navigation.
	 */
	openQuickChat(options?: ICreateNewSessionOptions, preserveNavigation?: boolean): IActiveSession | undefined;

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
	 * session that is already visible. Passing `undefined` operates on the
	 * empty (new-session) slot.
	 */
	insertAt(session: ISession | undefined, targetSessionId: string | undefined, side: SessionGridDirection, activate?: boolean): void;

	/** Prepare and atomically place sessions, moving existing leaves without replacing them. */
	openSessionsAt(sessions: readonly ISession[], referenceSessionId: string | undefined, direction: SessionGridDirection, options?: IOpenSessionsOptions): Promise<void>;
	/** Open an ordered set in a balanced arrangement, retaining the included live views. */
	openSessionsInGrid(sessions: readonly ISession[]): Promise<void>;
	arrangeSessions(): void;
	focusSessionInDirection(session: IActiveSession | undefined, direction: Direction): void;
	moveSessionInDirection(session: IActiveSession | undefined, direction: Direction): void;
	resizeSession(session: IActiveSession | undefined, direction: Direction): void;

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

	/** Submit the live input in the active new-session composer. */
	submitNewSessionInput(): Promise<boolean>;

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
	private readonly _gridRequest = observableValue<SessionGridRequest | undefined>(this, undefined);
	readonly visibleSessions: IObservable<readonly (IActiveSession | undefined)[]>;
	readonly mainVisibleSessions: IObservable<readonly (IActiveSession | undefined)[]>;

	/** Remembers the single most recently closed chat or session for {@link reopenLastClosedItem}. */
	private readonly _closedItems: ClosedItemHistory;

	/** The canonical active session — the visible active slot. */
	readonly activeSession: IObservable<IActiveSession | undefined>;
	private readonly _initialRestoreComplete = observableValue<boolean>(this, false);
	readonly initialRestoreComplete: IObservable<boolean> = this._initialRestoreComplete;
	private readonly _navigationRequest = observableValue<ISessionNavigationRequest | undefined>(this, undefined);
	readonly navigationRequest: IObservable<ISessionNavigationRequest | undefined> = this._navigationRequest;

	/** Cancelled on every navigation action so in-flight async opens bail out. */
	private readonly _openSessionCts = this._register(new DisposableMap<string, CancellationTokenSource>());
	/**
	 * Cancellation for the in-flight {@link restoreVisibleSessions}. Kept
	 * separate from {@link _openSessionCts} so that additive new-session
	 * operations (the new-chat composer eagerly creating a draft on startup)
	 * do not abort restoring the previously visible grid. Explicit navigation
	 * to a session, or a new-session handoff with `cancelRestore`, cancels it.
	 */
	private readonly _restoreCts = this._register(new MutableDisposable<CancellationTokenSource>());
	private _restoringGridState: ISessionGridState | undefined;
	private readonly _restoringWindows = new Map<string, ISessionWindowState>();
	private readonly _auxiliaryRestoreCts = this._register(new DisposableMap<string, CancellationTokenSource>());
	private readonly _sessionMoves = new Map<string, symbol>();
	private readonly _openingWindows = new Set<string>();

	private readonly _sessionStates: ResourceMap<ISessionState>;
	private readonly _pendingRestoredChatResources = new ResourceMap<URI>();
	private readonly _navigation: SessionsNavigation;
	/**
	 * The single source of truth for session recency (most-recently-opened
	 * first), persisted across restarts. Both the recent-sessions picker (via
	 * {@link getRecentlyOpenedSessions}) and {@link SessionsNavigation} build on
	 * top of it.
	 */
	private readonly _recencyHistory: SessionsRecencyHistory;

	/** Tracks wrapper identity so same-ID replacements restore focus but unrelated visibility changes do not. */
	private _focusedActiveSession: IActiveSession | undefined;

	/** The in-flight foreground send's "keep newest chat active" follow. */
	private readonly _sendFollow = this._register(new DisposableMap<ISession, { count: number; sessionId: string; dispose(): void }>());

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@ISessionsPartService private readonly sessionsPartService: ISessionsPartService,
		@ICustomViewService private readonly customViewService: ICustomViewService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkspaceTrustRequestService private readonly workspaceTrustRequestService: IWorkspaceTrustRequestService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@ISessionChangesStatsCache private readonly changesStatsCache: ISessionChangesStatsCache,
		@ISessionOpenTelemetryService private readonly sessionOpenTelemetryService: ISessionOpenTelemetryService,
		@INotificationService private readonly notificationService: INotificationService,
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
			session => this._restoreShownRelatedChats(session),
			(replaced, index, sticky, replacedBySessionId, partId) => this._closedItems.recordReplacedSlot(replaced, index, sticky, replacedBySessionId, partId),
		));
		this.visibleSessions = this._visibility.visibleSessions;
		this.mainVisibleSessions = derived(this, reader => this.visibleSessions.read(reader).filter(session => this.getSessionPartId(session) === MAIN_SESSIONS_PART));
		this.activeSession = this._visibility.activeSession;
		this.sessionsPartService.setAuxiliaryWindowCloseHandler(partId => this.returnClosingSessionsToMainWindow(partId));
		this.sessionsPartService.setSessionDragHandlers({
			drop: (sessions, target) => this.openSessionsAt(sessions, target.referenceSessionId, target.direction, { partId: target.partId }),
			openWindow: (sessions, bounds) => this.moveSessionsToNewWindow(sessions, { bounds }),
		});
		this._register(this.sessionsPartService.onDidCloseAuxiliaryPart(event => {
			if (!event.shutdown) {
				this._saveSessionStates();
			}
		}));

		this._closedItems = this._register(this.instantiationService.createInstance(
			ClosedItemHistory,
			this._visibility,
			(session, chatResource) => this.openChat(session, chatResource),
		));

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

		// Global session keys follow explicit activation, not a background window's local selection.
		this._register(autorun(reader => {
			const activeSession = this.activeSession.read(reader);
			setActiveSessionContextKeys(activeSession, this.contextKeyService, reader, this.changesStatsCache);
		}));

		// Per-active-session view reactions (archived → new-session view,
		// active-chat removed → fallback chat, persist the active chat).
		this._register(autorun(reader => {
			const activeSession = this.activeSession.read(reader);
			if (activeSession) {
				reader.store.add(this._activeSessionViewListeners(activeSession));
			}
		}));

		// Honor explicit unread marks until the user leaves the session and returns.
		let previousActiveSessionId: string | undefined;
		this._register(autorun(reader => {
			const activeSession = this.activeSession.read(reader);
			const activeSessionChanged = activeSession?.sessionId !== previousActiveSessionId;
			previousActiveSessionId = activeSession?.sessionId;
			if (!activeSession) {
				return;
			}
			const activeChat = activeSession.activeChat.read(reader);
			if (!activeChat.isRead.read(reader)) {
				this.sessionsManagementService.markChatRead(activeSession, activeChat, { preserveExplicitUnread: !activeSessionChanged }).catch(onUnexpectedError);
			}
			const allChatsRead = activeSession.chats.read(reader).every(chat => chat.isArchived.read(reader) || chat.isRead.read(reader));
			if (allChatsRead && !activeSession.isRead.read(reader)) {
				this.sessionsManagementService.markRead(activeSession, { preserveExplicitUnread: !activeSessionChanged }).catch(onUnexpectedError);
			}
		}));

		// Reflect provider-level session changes onto the grid: drop removed
		// sessions and pick a fallback (or the new-session view) when the active
		// one disappears.
		this._register(this.sessionsManagementService.onDidChangeSessions(e => this._onDidChangeSessions(e)));

		// Reflect both provider session replacement (e.g. a draft graduating)
		// and pre-send draft replacement onto the same visible grid slot.
		this._register(this.sessionsManagementService.onDidReplaceSession(({ from, to }) => this._onDidReplaceSession(from, to)));
		this._register(this.sessionsManagementService.onDidReplaceNewDraftSession(({ from, to }) => this._onDidReplaceSession(from, to)));

		// While a foreground send materialises new chats, keep the newest chat
		// active in the visible slot so the user sees the chat being sent.
		this._register(this.sessionsManagementService.onWillSendRequest(session => this._startSendFollow(session)));
		this._register(this.sessionsManagementService.onDidFinishSendRequest(session => {
			const follow = this._sendFollow.get(session);
			if (follow && --follow.count === 0) {
				this._sendFollow.deleteAndDispose(session);
			}
		}));

		// Drive the part: reconcile the grid and move focus into the active
		// session whenever the visible sessions or the active session change.
		this._register(autorun(reader => {
			const visible = this.visibleSessions.read(reader);
			const active = this._visibility.activeSession.read(reader);
			const preserveFocus = this._visibility.activePreserveFocus.read(reader);
			const request = this._gridRequest.read(reader);
			const partIds = new Set([MAIN_SESSIONS_PART, ...this.sessionsPartService.getParts().map(part => part.partId)]);
			for (const partId of partIds) {
				const local = visible.filter(session => this.getSessionPartId(session) === partId);
				const selected = this._visibility.getSelectedSession(partId);
				this.sessionsPartService.updateVisibleSessions(local, selected, this._visibility.getGridSlots(partId), (request?.partId ?? MAIN_SESSIONS_PART) === partId ? request : undefined, partId);
			}

			if (active !== this._focusedActiveSession) {
				this._focusedActiveSession = active;
				if (!preserveFocus) {
					this.sessionsPartService.focusSession(active);
				}
			}
		}));

		// When a session view in the grid receives focus, promote that session
		// to the active session.
		this._register(this.sessionsPartService.onDidFocusSession(sessionId => {
			const session = this.visibleSessions.get().find(s => s?.sessionId === sessionId);
			if (sessionId === undefined || session) {
				this.setActive(session);
			}
		}));
		this._register(this.sessionsPartService.onDidInteractWithGrid(partId => {
			this._cancelRestore(partId);
			this._startOpenSession(partId);
			this._recordNavigation();
		}));
	}

	getSessionPartId(session: ISession | undefined): string {
		return this._visibility.getPartId(session?.sessionId);
	}

	private getTargetPartId(session?: ISession, partId?: string): string {
		if (session && this._visibility.getSlot(session.sessionId)) {
			return this.getSessionPartId(session);
		}
		return partId ?? this.sessionsPartService.getPartForWindow(getActiveWindow())?.partId ?? MAIN_SESSIONS_PART;
	}

	private async withSessionMove(sessions: readonly ISession[], task: (isCurrent: () => boolean) => Promise<void>): Promise<void> {
		const request = Symbol();
		const sources = sessions.map(session => ({
			id: session.sessionId,
			visible: !!this._visibility.getSlot(session.sessionId),
			partId: this.getSessionPartId(session),
			view: this.sessionsPartService.getSessionView(session.sessionId),
			binding: this._visibility.getSession(session.sessionId),
		}));
		for (const source of sources) {
			this._sessionMoves.set(source.id, request);
		}
		try {
			await task(() => {
				const current = sources.every(source => this._sessionMoves.get(source.id) === request
					&& (!source.visible || (!!this._visibility.getSlot(source.id) && this._visibility.getPartId(source.id) === source.partId
						&& this.sessionsPartService.getSessionView(source.id) === source.view && this._visibility.getSession(source.id) === source.binding)));
				if (!current) {
					this.logService.trace('[SessionsView] Cancelled a superseded session movement');
				}
				return current;
			});
		} finally {
			for (const source of sources) {
				if (this._sessionMoves.get(source.id) === request) {
					this._sessionMoves.delete(source.id);
				}
			}
		}
	}

	async moveSessionsToNewWindow(sessions: readonly ISession[], options?: IAuxiliaryWindowOpenOptions): Promise<void> {
		this.ensureMovableSessions(sessions);
		this._recordNavigation();
		const navigation = this.navigationRequest.get();
		return this.withSessionMove(sessions, async isCurrent => {
			const partId = generateUuid();
			this._openingWindows.add(partId);
			try {
				await this.sessionsPartService.createAuxiliaryPart(options, partId);
				if (isCurrent()) {
					await this.doMoveSessionsToWindow(sessions, partId, isCurrent, () => this.navigationRequest.get() === navigation);
				}
			} finally {
				this._openingWindows.delete(partId);
				if (!this._visibility.getVisibleSessions(partId).length) {
					this.sessionsPartService.closeAuxiliaryPart(partId);
				}
			}
		});
	}

	async moveSessionsToWindow(sessions: readonly ISession[], partId: string): Promise<void> {
		this.ensureMovableSessions(sessions);
		this._recordNavigation();
		const navigation = this.navigationRequest.get();
		return this.withSessionMove(sessions, isCurrent => this.doMoveSessionsToWindow(sessions, partId, isCurrent, () => this.navigationRequest.get() === navigation));
	}

	private async doMoveSessionsToWindow(sessions: readonly ISession[], partId: string, isCurrent: () => boolean, shouldActivate: () => boolean): Promise<void> {
		if (!this.sessionsPartService.getPart(partId)) {
			throw new Error(`Sessions part '${partId}' is not available`);
		}
		const token = this._startOpenSession(partId);
		const prepared = await this.prepareGridSessions(sessions, token);
		if (!prepared || token.isCancellationRequested || !isCurrent() || !this.areGridSessionsCurrent(prepared)) {
			return;
		}
		this.ensureMovableSessions(prepared);
		if (!this.sessionsPartService.getPart(partId)) {
			throw new Error(localize('sessions.targetWindowClosed', "The destination window was closed before the session could be moved."));
		}
		const visible = this.visibleSessions.get();
		const moving = prepared.flatMap(session => {
			const wrapper = visible.find(candidate => candidate?.sessionId === session.sessionId);
			return wrapper ? [wrapper] : [];
		});
		this.sessionsPartService.transferSessions(moving, partId, () => transaction(() => {
			for (const id of new Set([partId, ...moving.map(session => this.getSessionPartId(session))])) {
				this._cancelRestore(id);
			}
			for (const session of prepared) {
				if (!this._visibility.getSlot(session.sessionId)) {
					this._visibility.appendToPart(session, partId);
				}
			}
			this._visibility.moveToPart(prepared.map(session => session.sessionId), partId);
			if (prepared[0]) {
				this._activate(prepared[0], false, partId, shouldActivate());
			}
		}));
		this.closeEmptyAuxiliaryParts();
		if (shouldActivate()) {
			if (partId === MAIN_SESSIONS_PART) {
				this.customViewService.hideCustomView();
			}
			this.sessionsPartService.focusSession(this.activeSession.get());
			status(localize('sessions.movedToWindow', "Moved sessions to the destination window."));
		}
	}

	private ensureMovableSessions(sessions: readonly ISession[]): void {
		if (!sessions.length) {
			throw new Error(localize('sessions.moveNoSession', "Select a session to move to another window."));
		}
		if (sessions.some(session => session.status.get() === SessionStatus.Untitled)) {
			throw new Error(localize('sessions.moveDraftWindow', "Finish creating the session before moving it to another window."));
		}
		for (const session of sessions) {
			const veto = this.sessionsPartService.getSessionView(session.sessionId)?.getTransferVeto();
			if (veto) {
				throw new Error(veto);
			}
		}
	}

	returnSessionsToMainWindow(partId: string): void {
		if (partId === MAIN_SESSIONS_PART) {
			return;
		}
		this._openSessionCts.get(partId)?.cancel();
		this._openSessionCts.deleteAndDispose(partId);
		const pendingSource = this._restoringWindows.get(partId)?.layout;
		const pendingMain = this._restoringGridState;
		const mainState = pendingMain ?? this.snapshotGrid(MAIN_SESSIONS_PART);
		const sourceState = pendingSource ?? this.snapshotGrid(partId);
		const active = this.activeSession.get();
		const activePart = this.getSessionPartId(active);
		this._cancelRestore(partId);
		const sessions = this._visibility.getVisibleSessions(partId).filter((session): session is IActiveSession => !!session);
		if (!sessions.length && !pendingSource) {
			this._visibility.forgetPart(partId);
			return;
		}
		this._recordNavigation();
		for (const session of sessions) {
			this._sessionMoves.delete(session.sessionId);
		}
		const grid = sourceState ? mainState ? joinSessionGrids(mainState.grid, sourceState.grid) : sourceState.grid : mainState?.grid;
		this._cancelRestore(MAIN_SESSIONS_PART);
		this.sessionsPartService.transferSessions(sessions, MAIN_SESSIONS_PART, () => transaction(tx => {
			this._visibility.moveToPart(sessions.map(session => session.sessionId), MAIN_SESSIONS_PART, false);
			if (active && activePart === partId) {
				this._visibility.setActive(active, true, MAIN_SESSIONS_PART);
			}
			if (grid) {
				this._gridRequest.set({ type: 'restore', grid }, tx);
			}
		}));
		this._visibility.forgetPart(partId);
		if ((pendingSource || pendingMain) && sourceState && grid) {
			const state: ISessionGridState = {
				version: 1, grid,
				sessions: [...mainState?.sessions ?? [], ...sourceState.sessions],
				active: activePart === partId ? sourceState.active : mainState?.active ?? sourceState.active,
			};
			this.resumeMainRestore(state, activePart === partId || activePart === MAIN_SESSIONS_PART);
		}
		if (sessions.some(session => session === this.activeSession.get())) {
			this.customViewService.hideCustomView();
			this.sessionsPartService.focusSession(this.activeSession.get());
		}
		status(localize('sessions.returnedToMain', "Returned sessions to the main window."));
	}

	private returnClosingSessionsToMainWindow(partId: string): void {
		const layout = this._restoringWindows.get(partId)?.layout ?? this.snapshotGrid(partId);
		const window = this.sessionsPartService.getAuxiliaryWindowState(partId);
		const pendingMain = this._restoringGridState;
		this._saveSessionStates();
		try {
			this.returnSessionsToMainWindow(partId);
		} catch (error) {
			this.logService.error('[SessionsView] Failed to return sessions from a closing window', error);
			this._restoringGridState = pendingMain;
			const state: ISessionWindowState | undefined = layout ? { id: partId, layout, window } : undefined;
			if (state) {
				this._restoringWindows.set(partId, state);
			}
			const sessions = this._visibility.getVisibleSessions(partId);
			this._visibility.removeMany(sessions.map(session => session?.sessionId));
			this._visibility.forgetPart(partId);
			if (!state) {
				this.notificationService.error(error);
				return;
			}
			this.notificationService.prompt(Severity.Error, localize('sessions.returnWindowFailed', "The window closed, but its sessions could not be returned to the main window. Their saved layout and drafts have been kept. Retry to reopen them."), [{
				label: localize('sessions.retryWindow', "Retry"),
				run: () => this.restoreAuxiliaryPart(state, true),
			}]);
		}
	}

	private resumeMainRestore(state: ISessionGridState, activate: boolean, preserveSelection = false): void {
		const cts = new CancellationTokenSource();
		this._restoreCts.value = cts;
		this._restoringGridState = state;
		void this._restoreVisibleSessions(cts.token, state, MAIN_SESSIONS_PART, activate, preserveSelection).then(complete => {
			if (this._restoreCts.value === cts) {
				if (complete) {
					this._restoringGridState = undefined;
					this._restoringWindows.delete(MAIN_SESSIONS_PART);
				}
				this._restoreCts.clear();
			}
		}, error => {
			if (this._restoreCts.value === cts) {
				this._restoreCts.clear();
			}
			this.logService.error('[SessionsView] Failed to restore returned sessions', error);
			this.notificationService.error(error);
		});
	}

	private retryUnresolvedRestores(): void {
		if (this._restoringGridState && !this._restoreCts.value) {
			this.resumeMainRestore(this._restoringGridState, false, true);
		}
		for (const [id, state] of this._restoringWindows) {
			if (id !== MAIN_SESSIONS_PART && !this._auxiliaryRestoreCts.has(id) && this.sessionsPartService.getPart(id)) {
				void this.restoreAuxiliaryPart(state, false, true);
			}
		}
	}

	private closeEmptyAuxiliaryParts(): void {
		for (const part of this.sessionsPartService.getParts()) {
			if (!part.isMain && !this._openingWindows.has(part.partId) && !this._restoringWindows.has(part.partId) && !this._visibility.getVisibleSessions(part.partId).length) {
				this.sessionsPartService.closeAuxiliaryPart(part.partId);
			}
		}
	}

	private _onDidReplaceSession(from: ISession, to: ISession): void {
		for (const follow of this._sendFollow.values()) {
			if (follow.sessionId === from.sessionId) {
				follow.sessionId = to.sessionId;
			}
		}
		const sessionView = this.sessionsPartService.getSessionView(from.sessionId);
		const preserveFocus = !sessionView || this.sessionsPartService.getFocusedSessionView() !== sessionView;
		this._visibility.updateSession(from, to, preserveFocus);
	}

	private _activeSessionViewListeners(activeSession: IActiveSession): IDisposable {
		const disposables = new DisposableStore();
		const initialChatResource = activeSession.activeChat.get()?.resource;
		let pendingRestoredChatResource: URI | undefined;
		this._pendingRestoredChatResources.delete(activeSession.resource);
		const storedActiveChatResource = this._sessionStates.get(activeSession.resource)?.activeChatResource;
		if (storedActiveChatResource) {
			try {
				const resource = URI.parse(storedActiveChatResource);
				if (!initialChatResource || !this.uriIdentityService.extUri.isEqual(resource, initialChatResource)) {
					pendingRestoredChatResource = resource;
					this._pendingRestoredChatResources.set(activeSession.resource, resource);
				}
			} catch (error) {
				this.logService.warn('[SessionsView] Failed to restore active chat from stored session state', error);
			}
		}

		// When the active session becomes archived, return to the new-session
		// view (or the quick-chat composer for a quick chat), keeping context.
		let wasArchived = activeSession.isArchived.get();
		disposables.add(autorun(reader => {
			const isArchived = activeSession.isArchived.read(reader);
			if (isArchived && !wasArchived) {
				if (this.getSessionPartId(activeSession) !== MAIN_SESSIONS_PART) {
					this.closeSession(activeSession);
				} else if (activeSession.isQuickChat?.read(undefined)) {
					this._openQuickChat(undefined, 'automatic');
				} else {
					const folderUri = activeSession.workspace.read(undefined)?.folders[0]?.root;
					void this._openNewSession(folderUri
						? { folderUri, ...inheritableSessionTarget(this.sessionsManagementService, activeSession, folderUri) }
						: undefined, CancellationToken.None, 'automatic').catch(onUnexpectedError);
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
						void this._openChatSession(activeSession, fallback.resource, undefined, 'automatic').catch(onUnexpectedError);
					}
				}
			}));
		}

		if (pendingRestoredChatResource) {
			disposables.add(autorun(reader => {
				const resource = pendingRestoredChatResource;
				if (!resource) {
					return;
				}
				const chat = activeSession.chats.read(reader).find(candidate =>
					this.uriIdentityService.extUri.isEqual(candidate.resource, resource));
				if (chat) {
					pendingRestoredChatResource = undefined;
					this._pendingRestoredChatResources.delete(activeSession.resource);
					this._visibility.openChat(activeSession, chat);
					this._visibility.setActiveChat(activeSession, chat);
				}
			}));
		}

		// Track active chat changes to persist per-session state. The visible /
		// active / sticky flags are snapshotted from the live grid at save time
		// (see `_snapshotVisibleSessionStates`); here we only remember the last
		// active chat so reopening the session restores its selected chat. The
		// chat visibility is persisted deterministically in `closeChat`/`openChat`
		// instead, so it never depends on chats being loaded or on autorun timing.
		disposables.add(autorun(reader => {
			const chat = activeSession.activeChat.read(reader);
			if (chat && chat.status.read(undefined) !== SessionStatus.Untitled) {
				if (pendingRestoredChatResource && initialChatResource && this.uriIdentityService.extUri.isEqual(chat.resource, initialChatResource)) {
					return;
				}
				pendingRestoredChatResource = undefined;
				this._pendingRestoredChatResources.delete(activeSession.resource);
				const existing = this._sessionStates.get(activeSession.resource);
				this._sessionStates.set(activeSession.resource, {
					...existing,
					sessionResource: activeSession.resource.toString(),
					activeChatResource: chat.resource.toString(),
					activeChatOrigin: chat.origin?.kind,
				});
			}
		}));

		return disposables;
	}

	private _onDidChangeSessions(e: ISessionsChangeEvent): void {
		const currentActive = this._visibility.activeSession.get();
		if (e.added.length) {
			this.retryUnresolvedRestores();
		}

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
			this.closeEmptyAuxiliaryParts();
		}

		if (!currentActive) {
			return;
		}

		if (e.removed.length && e.removed.some(r => r.sessionId === currentActive.sessionId)) {
			const fallback = this._visibility.activeSession.get();
			if (fallback && this.sessionsManagementService.getSession(fallback.resource)) {
				void this._openSession(fallback.resource, { source: 'fallback' }, 'automatic').catch(onUnexpectedError);
			} else {
				void this._openNewSession(undefined, CancellationToken.None, 'automatic').catch(onUnexpectedError);
			}
		}
	}

	private _startSendFollow(session: ISession): void {
		const existing = this._sendFollow.get(session);
		if (existing) {
			existing.count++;
			return;
		}
		const store = new DisposableStore();
		const follow = { count: 1, sessionId: session.sessionId, dispose: () => store.dispose() };
		this._sendFollow.set(session, follow);
		store.add(autorun(reader => {
			this.activeSession.read(reader);
			const active = this.visibleSessions.read(reader).find(candidate => candidate?.sessionId === follow.sessionId);
			if (active && this._visibility.getSelectedSession(this.getSessionPartId(active)) === active) {
				const chats = active.visibleChatTabs.read(reader);
				const lastChat = chats[chats.length - 1];
				if (lastChat) {
					this._visibility.setActiveChat(active, lastChat);
				}
			}
		}));
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
	private _startOpenSession(partId = this.getTargetPartId()): CancellationToken {
		this._openSessionCts.get(partId)?.cancel();
		const cts = new CancellationTokenSource();
		this._openSessionCts.set(partId, cts);
		return cts.token;
	}

	private _beginNavigation(intent: SessionNavigationIntent, partId = this.getTargetPartId(), token: CancellationToken = CancellationToken.None, preserveNavigation = false): void {
		if (intent === 'explicit') {
			if (!preserveNavigation) {
				this._recordNavigation(token);
			}
			if (partId === MAIN_SESSIONS_PART) {
				this.customViewService.hideCustomView();
			}
		}
	}

	private _recordNavigation(token: CancellationToken = CancellationToken.None): void {
		this._navigationRequest.set({ token }, undefined);
	}

	/**
	 * Cancel an in-flight {@link restoreVisibleSessions}. Called when the user
	 * explicitly navigates to a session, including a new-session handoff that
	 * sets `cancelRestore`, so restore stops fighting the user's choice.
	 */
	private _cancelRestore(partId = this.getTargetPartId()): void {
		this._restoringWindows.delete(partId);
		if (partId !== MAIN_SESSIONS_PART) {
			this._auxiliaryRestoreCts.get(partId)?.cancel();
			this._auxiliaryRestoreCts.deleteAndDispose(partId);
			return;
		}
		// `cancel()` (not just `clear()`/dispose) so the in-flight restore's
		// token actually fires cancellation and bails out; `MutableDisposable`
		// disposes the source without cancelling it.
		this._restoreCts.value?.cancel();
		this._restoreCts.clear();
		this._restoringGridState = undefined;
	}

	/**
	 * Make the given session active in the visibility model, optionally without
	 * moving focus into it. The preserve-focus intent is published atomically
	 * with the active session by the visibility model, and the model's
	 * canonical active session is updated reactively by the mirror autorun.
	 */
	private _activate(session: ISession | undefined, preserveFocus?: boolean, partId?: string, activatePart = true): IActiveSession | undefined {
		const target = !session || session.status.get() === SessionStatus.Untitled ? MAIN_SESSIONS_PART : this.getTargetPartId(session, partId);
		if (target !== MAIN_SESSIONS_PART && !this.sessionsPartService.getPart(target)) {
			throw new Error(localize('sessions.targetWindowClosed', "The destination window was closed before the session could be moved."));
		}
		return this._visibility.setActive(session, preserveFocus, target, activatePart);
	}

	openChat(session: ISession, chatUri: URI, options?: IOpenSessionOptions): Promise<void> {
		return this._openChatSession(session, chatUri, options, 'explicit');
	}

	private async _openChatSession(session: ISession, chatUri: URI, options: IOpenSessionOptions | undefined, intent: SessionNavigationIntent): Promise<void> {
		options = { ...options, partId: this.getTargetPartId(session, options?.partId) };
		const t0 = Date.now();
		this._cancelRestore(options.partId);
		this._beginNavigation(intent, options.partId);
		const navigation = this.navigationRequest.get();
		const token = this._startOpenSession(options.partId);
		// Redirect a superseded resource (e.g. a legacy session adopted into another
		// provider) before activating, the same way `openSession` does for a URI, so
		// opening by object migrates rather than activating the old facade as-is.
		const resolved = await this._resolveSessionForOpen(session, chatUri);
		if (token.isCancellationRequested) {
			return;
		}
		session = resolved.session;
		chatUri = resolved.chatUri ?? chatUri;
		if (options?.source) {
			await this.sessionOpenTelemetryService.withOpenRequest(options.source, token, async telemetryAttempt => {
				this.sessionOpenTelemetryService.sessionResolved(
					telemetryAttempt,
					session.resource,
					session.providerId,
					this.activeSession.get()?.sessionId === session.sessionId,
					session.loading.get(),
				);
				await this._openChat(session, chatUri, options.preserveFocus, token, t0, telemetryAttempt, options.partId, this.navigationRequest.get() === navigation);
			});
			return;
		}
		await this._openChat(session, chatUri, options?.preserveFocus, token, t0, undefined, options.partId, this.navigationRequest.get() === navigation);
	}

	private async _openChat(session: ISession, chatUri: URI, preserveFocus: boolean | undefined, token: CancellationToken, startTime: number, telemetryAttempt?: ISessionOpenTelemetryAttempt, partId?: string, activatePart = true): Promise<void> {
		if (telemetryAttempt) {
			this.sessionOpenTelemetryService.sessionActivated(telemetryAttempt, chatUri);
		}
		this.logService.trace(`[SessionsView] openChat start uri=${chatUri.toString()} provider=${session.providerId}`);
		this._activate(session, preserveFocus, partId, activatePart);
		if (!await this._waitForSessionToLoad(session, token)) {
			this.logService.trace(`[SessionsView] openChat cancelled while waiting for session to load uri=${chatUri.toString()}`);
			return;
		}

		// Find the chat and update active chat
		let chat: IChat | undefined;
		const activeSession = this.visibleSessions.get().find(candidate => candidate?.sessionId === session.sessionId);
		if (activeSession) {
			chat = activeSession.chats.get().find(c => this.uriIdentityService.extUri.isEqual(c.resource, chatUri));
			if (chat) {
				// Opening a chat also un-hides it if it was previously closed.
				this._visibility.openChat(session, chat);
				this._visibility.setActiveChat(session, chat);
				this._setChatVisibilityState(session, chat, true);
			}
		}
		if (telemetryAttempt) {
			if (chat) {
				this.sessionOpenTelemetryService.sessionActivated(telemetryAttempt, chat.resource);
			}
			this.sessionOpenTelemetryService.sessionLoaded(telemetryAttempt);
		}

		if (chat && chat.status.get() === SessionStatus.Untitled) {
			this.logService.trace(`[SessionsView] openChat done total=${Date.now() - startTime}ms uri=${chatUri.toString()} path=untitled`);
			return;
		}

		this.logService.trace(`[SessionsView] openChat done total=${Date.now() - startTime}ms uri=${chatUri.toString()}`);
	}

	async closeChat(session: IActiveSession, chat: IChat, options?: ICloseChatOptions): Promise<void> {
		// Closing hides the chat from the tab strip; it stays reopenable from the
		// session header's chats dropdown.
		this._visibility.closeChat(session, chat);
		this._setChatVisibilityState(session, chat, false);
		if (!options?.skipHistory) {
			this._closedItems.recordClosedChat(session, chat.resource);
		}
	}

	reopenLastClosedItem(): Promise<void> {
		this._cancelRestore();
		this._startOpenSession();
		return this._closedItems.reopenLast();
	}

	/**
	 * Persist a chat's closed/open state into the session's stored view state so
	 * it survives switching the session out of the grid (which disposes its
	 * wrapper) and reloads. Done synchronously on the close/open action rather
	 * than reactively from `closedChats`, which would depend on the session's
	 * chats being loaded. The main chat can never be closed and is ignored.
	 */
	private _setChatVisibilityState(session: ISession, chat: IChat, visible: boolean): void {
		if (this.uriIdentityService.extUri.isEqual(chat.resource, session.mainChat.get().resource)) {
			return;
		}
		const existing = this._sessionStates.get(session.resource);
		const chatResource = chat.resource.toString();
		const closedChatResources = new Set(existing?.closedChatResources);
		const openedChatResources = new Set(existing?.openedChatResources);
		if (visible) {
			closedChatResources.delete(chatResource);
			openedChatResources.add(chatResource);
		} else {
			closedChatResources.delete(chatResource);
			openedChatResources.delete(chatResource);
			if (chat.origin?.kind !== ChatOriginKind.Tool) {
				closedChatResources.add(chatResource);
			}
		}
		this._sessionStates.set(session.resource, {
			...existing,
			sessionResource: session.resource.toString(),
			closedChatResources: closedChatResources.size ? [...closedChatResources] : undefined,
			openedChatResources: openedChatResources.size ? [...openedChatResources] : undefined,
		});
	}

	private _applyActiveChatSelection(session: ISession, options: IOpenSessionOptions | undefined): void {
		if (!options?.forceMainChat && !options?.restoreOnlySideOrToolChat) {
			return;
		}
		const state = this._sessionStates.get(session.resource);
		if (!options.forceMainChat && (state?.activeChatOrigin === ChatOriginKind.SideChat || state?.activeChatOrigin === ChatOriginKind.Tool)) {
			return;
		}
		const mainChat = session.mainChat.get();
		this._visibility.setActiveChat(session, mainChat);
		this._sessionStates.set(session.resource, {
			...state,
			sessionResource: session.resource.toString(),
			activeChatResource: mainChat.resource.toString(),
			activeChatOrigin: mainChat.origin?.kind,
		});
	}

	openSession(sessionResource: URI, options?: IOpenSessionOptions): Promise<void> {
		return this._openSession(sessionResource, options, 'explicit');
	}

	private async _openSession(sessionResource: URI, options: IOpenSessionOptions | undefined, intent: SessionNavigationIntent): Promise<void> {
		options = { ...options, partId: this.getTargetPartId(this.sessionsManagementService.getSession(sessionResource), options?.partId) };
		this.logService.trace(`[SessionsView] openSession requested uri=${sessionResource.toString()}`);
		// Claim the open before resolving: resolution can take seconds for a legacy
		// Copilot CLI resource, and a newer open must win regardless of which
		// resolution finishes first.
		this._cancelRestore(options.partId);
		this._beginNavigation(intent, options.partId);
		const navigation = this.navigationRequest.get();
		const token = this._startOpenSession(options.partId);
		await this.sessionOpenTelemetryService.withOpenRequest(options?.source ?? 'unknown', token, async telemetryAttempt => {
			// Redirect a superseded resource (legacy session adopted into another
			// provider) before lookup, so an open by URI migrates rather than reaching
			// the old provider. Providers decline unfamiliar resources and the caller
			// keeps the original resource.
			const resolved = await this.sessionsManagementService.resolveSessionResource(sessionResource, 'open');
			if (token.isCancellationRequested) {
				return;
			}
			const sessionData = this._getSession(resolved);
			await this.sessionsProvidersService.getProvider(sessionData.providerId)?.prepareSessionForOpen?.(sessionData, 'open');
			if (token.isCancellationRequested) {
				return;
			}
			this._applyActiveChatSelection(sessionData, options);
			this.sessionOpenTelemetryService.sessionResolved(
				telemetryAttempt,
				sessionData.resource,
				sessionData.providerId,
				this.activeSession.get()?.sessionId === sessionData.sessionId,
				sessionData.loading.get(),
			);
			this._showSession(sessionData, options, this.navigationRequest.get() === navigation);
			await this._waitForOpenSessionToLoad(sessionData, token, telemetryAttempt);
		});
	}

	showSession(sessionResource: URI, options?: { preserveFocus?: boolean }): void {
		const session = this._getSession(sessionResource);
		const partId = this.getTargetPartId(session);
		this._cancelRestore(partId);
		this._beginNavigation('explicit', partId);
		this._startOpenSession(partId);
		this._showSession(session, { ...options, partId });
	}

	async canOpenSession(session: ISession): Promise<boolean> {
		// Re-focusing the already-active session is not a new open, so never gate it.
		if (this.activeSession.get()?.sessionId === session.sessionId) {
			return true;
		}
		const workspace = session.workspace.get();
		// A session that doesn't require workspace trust (virtual/cloud/quick-chat),
		// or whose workspace metadata has not hydrated yet, opens without a check; a
		// folder-less workspace has nothing to gate.
		if (!workspace?.requiresWorkspaceTrust) {
			return true;
		}
		// Inherit trust for any isolated worktree VS Code created off a base
		// repository the user already trusts, before checking folders — so opening
		// a worktree session does not prompt for a folder whose provenance is
		// already trusted. This runs here (the imperative open path) because the
		// reactive mount's equivalent step only runs once the session is active,
		// i.e. after this gate.
		await ensureSessionWorktreesTrusted(workspace, this.workspaceTrustManagementService);
		// Every folder the session operates in must be trusted before it opens, not
		// just the primary one: the agent — and its tasks, terminals and other
		// tooling — can run against any of the session's working directories, so we
		// make no assumptions about the non-primary folders being harmless. Check
		// all in parallel (fast path when already trusted), then surface VS Code's
		// standard workspace-trust dialog for each untrusted folder in turn.
		// Declining any leaves the current session (or empty new-session slot)
		// untouched. Run from this imperative open path (not the reactive mount),
		// the prompt fires once per open and cannot loop.
		const folders = workspace.folders.map(folder => folder.workingDirectory);
		const trustInfos = await Promise.all(folders.map(folder => this.workspaceTrustManagementService.getUriTrustInfo(folder)));
		const untrustedFolders = folders.filter((_, index) => !trustInfos[index].trusted);
		for (const folder of untrustedFolders) {
			const trusted = await this.workspaceTrustRequestService.requestResourcesTrust({
				uri: folder,
				message: localize('sessionsService.trustFolderMessage', "An agent session will be able to read files, run commands, and make changes in this folder."),
			});
			if (!trusted) {
				return false;
			}
		}
		return true;
	}

	openSessionToSide(session: ISession, options?: IOpenSessionOptions & { chatResource?: URI; referenceSessionId?: string }): Promise<void> {
		return this.withSessionMove([session], isCurrent => this.doOpenSessionToSide(session, options, isCurrent));
	}

	private async doOpenSessionToSide(session: ISession, options: (IOpenSessionOptions & { chatResource?: URI; referenceSessionId?: string }) | undefined, isCurrent: () => boolean): Promise<void> {
		const partId = options?.referenceSessionId !== undefined ? this._visibility.getPartId(options.referenceSessionId) : options?.partId ?? this.getTargetPartId();
		const referenceWasVisible = options?.referenceSessionId !== undefined && !!this._visibility.getSlot(options.referenceSessionId);
		this._cancelRestore(partId);
		this._beginNavigation('explicit', partId);
		const navigation = this.navigationRequest.get();
		const token = this._startOpenSession(partId);
		session = this.sessionsManagementService.getSession(session.resource) ?? session;
		// Redirect a superseded resource before inserting a slot, so the side-by-side
		// view/terminal never briefly binds to the old facade.
		const resolved = await this._resolveSessionForOpen(session, options?.chatResource);
		if (token.isCancellationRequested) {
			return;
		}
		session = resolved.session;
		if (options?.chatResource && resolved.chatUri) {
			options = { ...options, chatResource: resolved.chatUri };
		}
		if (!this.areGridSessionsCurrent([session]) || !await this.canOpenSession(session) || token.isCancellationRequested || !this.areGridSessionsCurrent([session])) {
			return;
		}
		await this.sessionsProvidersService.getProvider(session.providerId)?.prepareSessionForOpen?.(session, 'open');
		if (token.isCancellationRequested || !isCurrent() || !this.areGridSessionsCurrent([session])) {
			return;
		}
		const visible = this._visibility.getVisibleSessions(partId);
		if (referenceWasVisible && !this._visibility.getSlot(options?.referenceSessionId)) {
			return;
		}
		if (options?.forceMainChat && !options.chatResource && this._visibility.getSlot(session.sessionId)) {
			await this.openChatToSide(session, session.mainChat.get().resource, { preserveFocus: options.preserveFocus });
			return;
		}
		const reference = visible.find(candidate => candidate?.sessionId === options?.referenceSessionId) ?? visible[visible.length - 1];
		await this.sessionOpenTelemetryService.withOpenRequest(options?.source ?? 'unknown', token, async attempt => {
			if (token.isCancellationRequested || !this.areGridSessionsCurrent([session])) {
				return;
			}
			this.sessionOpenTelemetryService.sessionResolved(attempt, session.resource, session.providerId, this.activeSession.get()?.sessionId === session.sessionId, session.loading.get());
			const existing = this.visibleSessions.get().find(candidate => candidate?.sessionId === session.sessionId);
			const commit = () => transaction(() => {
				if (existing) {
					this._cancelRestore(this.getSessionPartId(existing));
				}
				if (reference && reference.sessionId !== session.sessionId) {
					this._visibility.insertAt(session, reference.sessionId, 'right', false);
				} else if (!reference && partId !== MAIN_SESSIONS_PART) {
					if (!this._visibility.getSlot(session.sessionId)) {
						this._visibility.appendToPart(session, partId);
					}
					this._visibility.moveToPart([session.sessionId], partId);
				} else if (!reference && existing && this.getSessionPartId(existing) !== partId) {
					this._visibility.insertAt(session, undefined, 'right', false);
				}
				this._applyActiveChatSelection(session, options);
				this._showSession(session, { ...options, partId }, this.navigationRequest.get() === navigation);
			});
			if (existing && this.getSessionPartId(existing) !== partId) {
				this.sessionsPartService.transferSessions([existing], partId, commit);
			} else {
				commit();
			}
			this.closeEmptyAuxiliaryParts();
			if (!options?.preserveFocus && this.navigationRequest.get() === navigation) {
				this.sessionsPartService.focusSession(this.activeSession.get());
			}
			if (options?.chatResource) {
				await this._openChat(session, options.chatResource, options.preserveFocus, token, Date.now(), attempt, partId, this.navigationRequest.get() === navigation);
			} else {
				await this._waitForOpenSessionToLoad(session, token, attempt);
			}
		});
	}

	private async prepareGridSessions(sessions: readonly ISession[], token: CancellationToken): Promise<ISession[] | undefined> {
		const result: ISession[] = [];
		const ids = new Set<string>();
		const candidates = sessions.map(candidate => this.sessionsManagementService.getSession(candidate.resource) ?? candidate);
		for (const candidate of candidates) {
			const { session } = await this._resolveSessionForOpen(candidate, undefined);
			if (token.isCancellationRequested || !this.areGridSessionsCurrent([session])) {
				return undefined;
			}
			if (ids.has(session.sessionId)) {
				continue;
			}
			if (!this._visibility.getSlot(session.sessionId)) {
				if (!await this.canOpenSession(session) || token.isCancellationRequested || !this.areGridSessionsCurrent([session])) {
					return undefined;
				}
				await this.sessionsProvidersService.getProvider(session.providerId)?.prepareSessionForOpen?.(session, 'open');
				if (token.isCancellationRequested) {
					return undefined;
				}
			}
			ids.add(session.sessionId);
			result.push(session);
		}
		return result;
	}

	private areGridSessionsCurrent(sessions: readonly ISession[]): boolean {
		if (sessions.some(session => this.sessionsManagementService.getSession(session.resource) !== session)) {
			this.logService.trace('[SessionsView] Cancelled grid opening because a candidate was removed or replaced');
			return false;
		}
		return true;
	}

	openSessionsAt(sessions: readonly ISession[], referenceSessionId: string | undefined, direction: SessionGridDirection, options?: IOpenSessionsOptions): Promise<void> {
		return this.withSessionMove(sessions, isCurrent => this.doOpenSessionsAt(sessions, referenceSessionId, direction, options, isCurrent));
	}

	private async doOpenSessionsAt(sessions: readonly ISession[], referenceSessionId: string | undefined, direction: SessionGridDirection, options: IOpenSessionsOptions | undefined, isCurrent: () => boolean): Promise<void> {
		const partId = referenceSessionId !== undefined ? this._visibility.getPartId(referenceSessionId) : options?.partId ?? MAIN_SESSIONS_PART;
		const emptyTarget = referenceSessionId === undefined && partId !== MAIN_SESSIONS_PART && this._visibility.getVisibleSessions(partId).length === 0;
		const referenceView = this.sessionsPartService.getSessionView(referenceSessionId);
		const referenceIsCurrent = () => emptyTarget
			? this._visibility.getVisibleSessions(partId).length === 0
			: !!this._visibility.getSlot(referenceSessionId)
			&& this._visibility.getPartId(referenceSessionId) === partId
			&& this.sessionsPartService.getSessionView(referenceSessionId) === referenceView;
		this._cancelRestore(partId);
		this._beginNavigation('explicit', partId);
		const navigation = this.navigationRequest.get();
		const token = this._startOpenSession(partId);
		const prepared = await this.prepareGridSessions(sessions, token);
		if (!prepared || token.isCancellationRequested || !isCurrent() || !referenceIsCurrent() || !this.areGridSessionsCurrent(prepared)) {
			return;
		}
		if (partId !== MAIN_SESSIONS_PART && !this.sessionsPartService.getPart(partId)) {
			throw new Error(localize('sessions.targetWindowClosed', "The destination window was closed before the session could be moved."));
		}
		if (partId !== MAIN_SESSIONS_PART) {
			this.ensureMovableSessions(prepared);
		}
		const primary = options?.activate === 'last' ? prepared.at(-1) : prepared[0];
		if (!primary) {
			return;
		}
		const splitMainChat = options?.activate !== false && options?.forceMainChat && !!this._visibility.getSlot(primary.sessionId);
		const entries = prepared.filter(session => session.sessionId !== referenceSessionId && (!splitMainChat || session !== primary));
		const open = async (attempt?: ISessionOpenTelemetryAttempt): Promise<void> => {
			if (token.isCancellationRequested || !isCurrent() || !referenceIsCurrent() || !this.areGridSessionsCurrent(prepared)) {
				return;
			}
			if (attempt) {
				this.sessionOpenTelemetryService.sessionResolved(attempt, primary.resource, primary.providerId, this.activeSession.get()?.sessionId === primary.sessionId, primary.loading.get());
			}
			const moving = this.visibleSessions.get().filter((session): session is IActiveSession => !!session && entries.some(entry => entry.sessionId === session.sessionId) && this.getSessionPartId(session) !== partId);
			const commit = () => transaction(() => {
				for (const session of moving) {
					this._cancelRestore(this.getSessionPartId(session));
				}
				const ordered = !emptyTarget && (direction === 'right' || direction === 'down') ? [...entries].reverse() : entries;
				for (const session of ordered) {
					if (emptyTarget) {
						if (!this._visibility.getSlot(session.sessionId)) {
							this._visibility.appendToPart(session, partId);
						}
					} else {
						this._visibility.insertAt(session, referenceSessionId, direction, false);
					}
				}
				if (emptyTarget) {
					this._visibility.moveToPart(entries.map(session => session.sessionId), partId);
				}
				if (options?.activate !== false) {
					if (!splitMainChat) {
						this._applyActiveChatSelection(primary, options);
					}
					this._showSession(primary, { ...options, partId }, this.navigationRequest.get() === navigation);
				}
			});
			if (moving.length) {
				this.sessionsPartService.transferSessions(moving, partId, commit);
			} else {
				commit();
			}
			this.closeEmptyAuxiliaryParts();
			if (splitMainChat) {
				await this._showChatToSide(primary, primary.mainChat.get().resource, options, token, () => this.navigationRequest.get() === navigation);
				if (token.isCancellationRequested) {
					return;
				}
			}
			if (options?.activate !== false && !options?.preserveFocus && this.navigationRequest.get() === navigation) {
				this.sessionsPartService.focusSession(this.activeSession.get());
			}
			if (attempt) {
				await this._waitForOpenSessionToLoad(primary, token, attempt);
			}
		};
		if (options?.source && options.activate !== false) {
			await this.sessionOpenTelemetryService.withOpenRequest(options.source, token, open);
		} else {
			await open();
		}
	}

	openSessionsInGrid(sessions: readonly ISession[]): Promise<void> {
		return this.withSessionMove(sessions, isCurrent => this.doOpenSessionsInGrid(sessions, isCurrent));
	}

	private async doOpenSessionsInGrid(sessions: readonly ISession[], isCurrent: () => boolean): Promise<void> {
		const partId = this.getTargetPartId();
		this._cancelRestore(partId);
		this._beginNavigation('explicit', partId);
		const navigation = this.navigationRequest.get();
		const token = this._startOpenSession(partId);
		const prepared = await this.prepareGridSessions(sessions, token);
		if (!prepared || token.isCancellationRequested || !isCurrent() || !prepared.length || !this.areGridSessionsCurrent(prepared)) {
			return;
		}
		if (partId !== MAIN_SESSIONS_PART) {
			this.ensureMovableSessions(prepared);
		}
		const active = this.activeSession.get();
		const slots = prepared.map(session => ({ session, sticky: this._visibility.getSlot(session.sessionId)?.sticky ?? false }));
		const moving = this.visibleSessions.get().filter((session): session is IActiveSession => !!session && prepared.some(candidate => candidate.sessionId === session.sessionId) && this.getSessionPartId(session) !== partId);
		const commit = () => transaction(tx => {
			if (moving.length) {
				for (const session of moving) {
					this._cancelRestore(this.getSessionPartId(session));
				}
				this._visibility.moveToPart(moving.map(session => session.sessionId), partId);
			}
			this._visibility.restoreGrid(slots, Math.max(0, prepared.findIndex(session => session.sessionId === active?.sessionId)), partId, this.navigationRequest.get() === navigation);
			this._gridRequest.set({ type: 'arrange', partId }, tx);
		});
		if (moving.length) {
			this.sessionsPartService.transferSessions(moving, partId, commit);
		} else {
			commit();
		}
		this.closeEmptyAuxiliaryParts();
	}

	arrangeSessions(): void {
		const partId = this.getTargetPartId();
		this._cancelRestore(partId);
		this._startOpenSession(partId);
		this._gridRequest.set({ type: 'arrange', partId }, undefined);
	}

	focusSessionInDirection(session: IActiveSession | undefined, direction: Direction): void {
		const partId = this.getSessionPartId(session);
		this._cancelRestore(partId);
		this._startOpenSession(partId);
		const neighbor = this.sessionsPartService.getNeighborSession(session?.sessionId, direction);
		if (neighbor !== undefined) {
			this.setActive(neighbor ?? undefined);
			this.sessionsPartService.focusSession(neighbor ?? undefined);
		}
	}

	moveSessionInDirection(session: IActiveSession | undefined, direction: Direction): void {
		const partId = this.getSessionPartId(session);
		this._cancelRestore(partId);
		this._startOpenSession(partId);
		const neighbor = this.sessionsPartService.getNeighborSession(session?.sessionId, direction);
		if (neighbor !== undefined) {
			this.insertAt(session, neighbor?.sessionId, toSessionGridDirection(direction));
		}
	}

	resizeSession(session: IActiveSession | undefined, direction: Direction): void {
		const partId = this.getSessionPartId(session);
		this._cancelRestore(partId);
		this._startOpenSession(partId);
		this.sessionsPartService.resizeSession(session?.sessionId, direction, 40);
	}

	/**
	 * Opens a chat to the side of its session view, redirecting a superseded
	 * resource first so a migrating session opens its adopted twin to the side
	 * rather than the old facade. Provider-neutral: the redirect is the
	 * `resolveSessionResource` hook, not a scheme check.
	 */
	async openChatToSide(session: ISession, chatResource: URI, options?: { preserveFocus?: boolean; referenceChatResource?: URI }): Promise<void> {
		const partId = this.getTargetPartId(session);
		this._beginNavigation('explicit', partId);
		const navigation = this.navigationRequest.get();
		const token = this._startOpenSession(partId);
		const resolved = await this._resolveSessionForOpen(session, chatResource);
		if (token.isCancellationRequested) {
			return;
		}
		session = resolved.session;
		chatResource = resolved.chatUri ?? chatResource;
		await this._showChatToSide(session, chatResource, options, token, () => this.navigationRequest.get() === navigation);
	}

	private async _showChatToSide(session: ISession, chatResource: URI, options: { preserveFocus?: boolean; referenceChatResource?: URI } | undefined, token: CancellationToken, shouldActivate: () => boolean): Promise<void> {
		this._showSession(this._getSession(session.resource), options, shouldActivate());
		const sessionView = this.sessionsPartService.getSessionView(session.sessionId);
		if (!sessionView) {
			throw new Error(`Unable to open chat to the side because session view '${session.sessionId}' is not mounted`);
		}
		await sessionView.openChatToSide(chatResource, options?.referenceChatResource, async () => {
			if (!token.isCancellationRequested) {
				await this._openChat(session, chatResource, options?.preserveFocus || !shouldActivate(), token, Date.now(), undefined, this.getSessionPartId(session), shouldActivate());
			}
		}, options?.preserveFocus || !shouldActivate());
	}

	/**
	 * Redirects a superseded session to its authoritative facade before it is
	 * shown (mirrors `openSession`'s URI resolution). Provider-neutral: it asks
	 * `resolveSessionResource`, which declines unfamiliar resources, rather than
	 * inspecting the provider's URI scheme. Returns the redirected session (and
	 * its main chat) when it changes, otherwise the inputs unchanged.
	 */
	private async _resolveSessionForOpen(session: ISession, chatUri: URI | undefined): Promise<{ session: ISession; chatUri: URI | undefined }> {
		const resolved = await this.sessionsManagementService.resolveSessionResource(session.resource, 'open');
		if (this.uriIdentityService.extUri.isEqual(resolved, session.resource)) {
			return { session, chatUri };
		}
		const superseding = this.sessionsManagementService.getSession(resolved);
		if (!superseding) {
			return { session, chatUri };
		}
		return { session: superseding, chatUri: chatUri ? superseding.mainChat.get().resource : undefined };
	}

	private _getSession(sessionResource: URI): ISession {
		const sessionData = this.sessionsManagementService.getSession(sessionResource);
		if (!sessionData) {
			this.logService.warn(`[SessionsView] openSession: session not found uri=${sessionResource.toString()}`);
			throw new Error(`Session with resource ${sessionResource.toString()} not found`);
		}
		return sessionData;
	}

	private _showSession(sessionData: ISession, options?: IOpenSessionOptions, activatePart = true): void {
		const t0 = Date.now();
		this.logService.trace(`[SessionsView] openSession start uri=${sessionData.resource.toString()} provider=${sessionData.providerId}`);

		const alreadyActive = this.activeSession.get()?.sessionId === sessionData.sessionId;
		this._activate(sessionData, options?.preserveFocus, options?.partId, activatePart);
		if (activatePart && alreadyActive && !options?.preserveFocus) {
			this.sessionsPartService.focusSession(this.activeSession.get());
		}
		this.logService.trace(`[SessionsView] showSession done total=${Date.now() - t0}ms uri=${sessionData.resource.toString()}`);
	}

	private async _waitForOpenSessionToLoad(sessionData: ISession, token: CancellationToken, telemetryAttempt: ISessionOpenTelemetryAttempt): Promise<void> {
		const t0 = Date.now();
		if (!await this._waitForSessionToLoad(sessionData, token)) {
			this.logService.trace(`[SessionsView] openSession cancelled while waiting for session to load uri=${sessionData.resource.toString()}`);
			return;
		}

		const activeSession = this.activeSession.get();
		const activeChat = activeSession?.sessionId === sessionData.sessionId ? activeSession.activeChat.get() : undefined;
		if (activeChat) {
			this.sessionOpenTelemetryService.sessionActivated(telemetryAttempt, activeChat.resource);
		}
		this.sessionOpenTelemetryService.sessionLoaded(telemetryAttempt);
		this.logService.trace(`[SessionsView] openSession loaded total=${Date.now() - t0}ms uri=${sessionData.resource.toString()}`);
	}

	unsetNewSession(): void {
		this.sessionsManagementService.discardNewSession();
		this._activate(undefined);
	}

	openNewSession(options?: IOpenNewSessionOptions, token: CancellationToken = CancellationToken.None): Promise<IOpenNewSessionResult> {
		return this._openNewSession(options, token, 'explicit');
	}

	private async _openNewSession(options: IOpenNewSessionOptions | undefined, token: CancellationToken, intent: SessionNavigationIntent): Promise<IOpenNewSessionResult> {
		const activatePart = !options?.preserveNavigation || this.getSessionPartId(this.activeSession.get()) === MAIN_SESSIONS_PART;
		if (options?.cancelRestore) {
			this._cancelRestore(MAIN_SESSIONS_PART);
		}
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
				if (token.isCancellationRequested) {
					return { session: undefined, trustDeclined: false };
				}
				if (!trusted) {
					return { session: undefined, trustDeclined: true };
				}
			}

			if (token.isCancellationRequested) {
				return { session: undefined, trustDeclined: false };
			}
			this._beginNavigation(intent, MAIN_SESSIONS_PART, token, options?.preserveNavigation);
			this._startOpenSession(MAIN_SESSIONS_PART);
			try {
				const session = this.sessionsManagementService.createNewSession(folderUri, options);
				if (options?.requireDevContainer) {
					const provider = this.sessionsProvidersService.getProvider(session.providerId);
					if (!provider || !isAgentHostProvider(provider) || !provider.preferDevContainer) {
						this.sessionsManagementService.discardNewSession(session);
						throw new Error(`Session provider '${session.providerId}' does not support Dev Container drafts.`);
					}
					try {
						provider.preferDevContainer(session.sessionId, { required: true });
					} catch (error) {
						this.sessionsManagementService.discardNewSession(session);
						throw error;
					}
				}
				this._activateOrInsert(session, options?.toSide, activatePart);
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
		// No-op when the empty new-session placeholder is active, unless opening to the side.
		if (!folderUri) {
			this._beginNavigation(intent, MAIN_SESSIONS_PART, token, options?.preserveNavigation);
		}
		if (this._visibility.activeSession.get() === undefined && !options?.toSide) {
			return { session: undefined, trustDeclined: false };
		}
		if (!folderUri) {
			this._startOpenSession(MAIN_SESSIONS_PART);
		}

		// Restore the in-progress new session if one exists, so pickers re-derive
		// their state from the still-alive session object. Otherwise clear the
		// active session (first time / after send).
		const newSession = this.sessionsManagementService.newSession.get();

		const activeSession = this._visibility.getSelectedSession(MAIN_SESSIONS_PART);
		const targetSession = options?.toSide && newSession?.sessionId === activeSession?.sessionId
			? undefined
			: newSession;
		this._activateOrInsert(targetSession, options?.toSide, activatePart);
		return { session: targetSession, trustDeclined: false };
	}

	/** Open or move beside the active session when requested, keeping a single empty slot. */
	private _activateOrInsert(session: ISession | undefined, toSide: boolean | undefined, activatePart = true): void {
		const activeSessionId = this._visibility.getSelectedSession(MAIN_SESSIONS_PART)?.sessionId;
		const sessionId = session?.sessionId;
		if (toSide && activeSessionId !== sessionId) {
			const visible = this.mainVisibleSessions.get();
			// An empty active slot has no id; fall back to the rightmost session.
			const anchorId = activeSessionId ?? visible[visible.length - 1]?.sessionId;
			if (anchorId && anchorId !== sessionId) {
				this.insertAt(session, anchorId, 'right', true);
				return;
			}
		}
		this._activate(session, !activatePart, MAIN_SESSIONS_PART, activatePart);
	}

	openQuickChat(options?: ICreateNewSessionOptions, preserveNavigation = false): IActiveSession | undefined {
		return this._openQuickChat(options, preserveNavigation ? 'automatic' : 'explicit');
	}

	private _openQuickChat(options: ICreateNewSessionOptions | undefined, intent: SessionNavigationIntent): IActiveSession | undefined {
		const activatePart = intent === 'explicit' || this.getSessionPartId(this.activeSession.get()) === MAIN_SESSIONS_PART;
		this._beginNavigation(intent, MAIN_SESSIONS_PART);
		this._startOpenSession(MAIN_SESSIONS_PART);
		try {
			const session = this.sessionsManagementService.createQuickChat(options);
			return this._activate(session, !activatePart, MAIN_SESSIONS_PART, activatePart);
		} catch (e) {
			// No provider supports quick chats: leave whatever was visible as-is
			// rather than activating an unrelated workspace-bound draft.
			this.logService.trace(`[SessionsView] openQuickChat: createQuickChat failed: ${e}`);
			return undefined;
		}
	}

	async openNewChatInSession(session: ISession, options?: ICreateNewChatInSessionOptions): Promise<void> {
		const partId = this.getTargetPartId(session);
		this._cancelRestore(partId);
		this._beginNavigation('explicit', partId);
		const token = this._startOpenSession(partId);
		const chat = await this.sessionsManagementService.createNewChatInSession(session, options);
		if (!chat || token.isCancellationRequested) {
			return;
		}

		this._activate(session);

		// Set the chat as the active chat
		this._visibility.setActiveChat(session, chat);
	}

	setActive(session: IActiveSession | undefined): void {
		if (session?.sessionId !== this.activeSession.get()?.sessionId) {
			const partId = this.getSessionPartId(session);
			this._cancelRestore(partId);
			this._startOpenSession(partId);
			this._recordNavigation();
		}
		this._activate(session);
	}

	async submitNewSessionInput(): Promise<boolean> {
		let activeSession = this.activeSession.get();
		if (activeSession?.isCreated.get()) {
			return false;
		}

		// The composer is not necessarily mounted in the grid (e.g. every slot
		// holds a created session), so open it before submitting into it.
		if (!this.sessionsPartService.getSessionView(activeSession?.sessionId)) {
			await this.openNewSession();
			activeSession = this.activeSession.get();
			if (activeSession?.isCreated.get()) {
				return false;
			}
		}

		return this.sessionsPartService.getSessionView(activeSession?.sessionId)?.submitInput() ?? false;
	}

	toggleSessionStickiness(session: ISession): void {
		const partId = this.getSessionPartId(session);
		this._cancelRestore(partId);
		this._startOpenSession(partId);
		const sticky = this._visibility.toggleStickiness(session);
		this._onDidToggleSessionStickiness.fire({ session, sticky });
	}

	insertAt(session: ISession | undefined, targetSessionId: string | undefined, side: SessionGridDirection, activate: boolean = true): void {
		if (session) {
			this._sessionMoves.delete(session.sessionId);
		}
		const partId = this._visibility.getPartId(targetSessionId);
		this._cancelRestore(partId);
		this._startOpenSession(partId);
		const wrapper = this.visibleSessions.get().find(candidate => candidate?.sessionId === session?.sessionId);
		const commit = () => this._visibility.insertAt(session, targetSessionId, side, activate);
		if (wrapper && this.getSessionPartId(wrapper) !== partId) {
			this.sessionsPartService.transferSessions([wrapper], partId, commit);
		} else {
			commit();
		}
		this.closeEmptyAuxiliaryParts();
	}

	closeSession(session: ISession | undefined): void {
		if (session) {
			this._sessionMoves.delete(session.sessionId);
		}
		const partId = this.getSessionPartId(session);
		this._cancelRestore(partId);
		this._startOpenSession(partId);
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

		// Remember the slot so Reopen Closed Chat or Session can put it back
		// exactly where it was.
		if (session) {
			this._closedItems.recordClosedSession(session);
		}

		// Discard the in-progress new session when its slot (or the empty slot)
		// is the one being closed; closing an unrelated session leaves it intact.
		this.sessionsManagementService.discardNewSession(session);

		this._visibility.removeMany([sessionId]);
		this.closeEmptyAuxiliaryParts();

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
		const partId = this.getTargetPartId();
		this._cancelRestore(partId);
		this._startOpenSession(partId);
		const ids = this._visibility.getVisibleSessions(partId)
			.filter((s): s is IActiveSession => !!s)
			.map(s => s.sessionId);
		if (ids.length === 0) {
			return;
		}

		if (partId === MAIN_SESSIONS_PART) {
			this.sessionsManagementService.discardNewSession();
		}

		// Remove every visible session in a single pass; the visibility model
		// clears the active session, which drives the grid back to the
		// new-session view via the reconcile autorun.
		this._visibility.removeMany(ids);
		for (const id of ids) {
			this._sessionMoves.delete(id);
		}
		this.closeEmptyAuxiliaryParts();
	}

	private _restoreInitialChat(session: ISession): IChat {
		const chats = session.chats.get();
		let initialChat = chats[0] ?? session.mainChat.get();
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

	private _restoreShownRelatedChats(session: ISession): readonly string[] {
		return this._sessionStates.get(session.resource)?.openedChatResources ?? [];
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
		this.sessionsPartService.flushState();
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
				activeChatOrigin: state.activeChatOrigin,
				closedChatResources: state.closedChatResources,
				openedChatResources: state.openedChatResources,
			});
		}

		this.storageService.store(ACTIVE_SESSION_STATES_KEY, JSON.stringify(entries), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		const snapshots = new Map(this._restoringWindows);
		const partIds = new Set([MAIN_SESSIONS_PART, ...this.sessionsPartService.getParts().map(part => part.partId)]);
		for (const id of partIds) {
			const layout = id === MAIN_SESSIONS_PART && this._restoringGridState ? this._restoringGridState : snapshots.get(id)?.layout ?? this.snapshotGrid(id);
			if (layout) {
				snapshots.set(id, { id, layout, window: this.sessionsPartService.getAuxiliaryWindowState(id) });
			}
		}
		if (snapshots.size === 1 && snapshots.has(MAIN_SESSIONS_PART)) {
			this.storageService.store(SESSION_GRID_STATE_KEY, JSON.stringify(snapshots.get(MAIN_SESSIONS_PART)!.layout), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		} else if (snapshots.size) {
			const activePart = this.getSessionPartId(this.activeSession.get());
			const state: ISessionWindowsState = { version: 2, parts: [...snapshots.values()], activePart: snapshots.has(activePart) ? activePart : MAIN_SESSIONS_PART };
			this.storageService.store(SESSION_GRID_STATE_KEY, JSON.stringify(state), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}
	}

	private snapshotGrid(partId: string): ISessionGridState | undefined {
		const grid = this.sessionsPartService.getGridLayout(partId);
		if (grid) {
			const visible = this._visibility.getVisibleSessions(partId);
			const slots = this._visibility.getGridSlots(partId);
			const activeId = this._visibility.getSelectedSession(partId)?.sessionId;
			const activeIndex = Math.max(0, visible.findIndex(session => session?.sessionId === activeId));
			const composerIndex = !visible[activeIndex]?.isCreated.get() ? activeIndex : visible.findIndex(session => !session?.isCreated.get());
			const bindings: ISessionGridState['sessions'][number][] = [];
			for (let index = 0; index < slots.length; index++) {
				const session = visible[index];
				const resource = session?.isCreated.get() ? session.resource.toString() : undefined;
				if (!resource && index !== composerIndex) {
					continue;
				}
				bindings.push({ id: slots[index].id, resource, sticky: resource ? session!.sticky.get() : false });
			}
			const projected = projectSessionGrid(grid, id => bindings.some(binding => binding.id === id) ? id : undefined);
			const active = slots[activeIndex].id;
			if (projected) {
				return { version: 1, grid: projected, sessions: bindings, active: bindings.some(binding => binding.id === active) ? active : bindings[0].id };
			}
		}
		return undefined;
	}

	private loadWindowsState(): ISessionWindowsState | undefined {
		const raw = this.storageService.get(SESSION_GRID_STATE_KEY, StorageScope.WORKSPACE);
		if (!raw) {
			return undefined;
		}
		try {
			const value: unknown = JSON.parse(raw);
			return isSessionWindowsState(value) ? value : undefined;
		} catch (error) {
			this.logService.warn('[SessionsView] Failed to read session window state', error);
			return undefined;
		}
	}

	private loadGridState(): ISessionGridState | undefined {
		const raw = this.storageService.get(SESSION_GRID_STATE_KEY, StorageScope.WORKSPACE);
		if (!raw) {
			return undefined;
		}
		try {
			const value: unknown = JSON.parse(raw);
			if (isSessionGridState(value)) {
				return value;
			}
			this.logService.warn('[SessionsView] Invalid or unsupported session grid state; restoring session order instead');
		} catch (error) {
			this.logService.warn('[SessionsView] Failed to read session grid state', error);
		}
		return undefined;
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
			// Chat visibility is maintained deterministically by open/close; prefer
			// persisted state over live, loaded-chat-only observables.
			const existing = this._sessionStates.get(session.resource);
			const state: ISessionState = {
				sessionResource: session.resource.toString(),
				activeChatResource: this._pendingRestoredChatResources.get(session.resource)?.toString() ?? session.activeChat.get()?.resource.toString() ?? existing?.activeChatResource,
				activeChatOrigin: session.activeChat.get()?.origin?.kind ?? existing?.activeChatOrigin,
				closedChatResources: existing?.closedChatResources ?? session.closedChats.get().map(c => c.resource.toString()),
				openedChatResources: existing?.openedChatResources,
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
		this._cancelRestore(MAIN_SESSIONS_PART);
		const cts = new CancellationTokenSource();
		this._restoreCts.value = cts;
		let mainComplete = false;
		try {
			const windows = this.loadWindowsState();
			if (windows) {
				for (const part of windows.parts) {
					this._restoringWindows.set(part.id, part);
				}
				await Promise.all(windows.parts.map(async part => {
					if (part.id === MAIN_SESSIONS_PART) {
						mainComplete = await this._restoreVisibleSessions(cts.token, part.layout, part.id, windows.activePart === part.id);
						if (mainComplete) {
							this._restoringWindows.delete(part.id);
						}
					} else {
						await this.restoreAuxiliaryPart(part, windows.activePart === part.id);
					}
				}));
			} else {
				mainComplete = await this._restoreVisibleSessions(cts.token, this.loadGridState());
			}
		} finally {
			if (this._restoreCts.value === cts) {
				if (mainComplete) {
					this._restoringGridState = undefined;
				}
				this._restoreCts.clear();
			}
			this._initialRestoreComplete.set(true, undefined);
		}
	}

	private async restoreAuxiliaryPart(state: ISessionWindowState, activate: boolean, preserveSelection = false): Promise<void> {
		const cts = new CancellationTokenSource();
		this._auxiliaryRestoreCts.get(state.id)?.cancel();
		this._auxiliaryRestoreCts.set(state.id, cts);
		try {
			const options = state.window;
			await (this.sessionsPartService.getPart(state.id) ?? this.sessionsPartService.createAuxiliaryPart(options && {
				bounds: options.bounds,
				mode: options.mode,
				zoomLevel: options.zoomLevel,
				alwaysOnTop: options.alwaysOnTop,
			}, state.id));
			if (cts.token.isCancellationRequested) {
				return;
			}
			const complete = await this._restoreVisibleSessions(cts.token, state.layout, state.id, activate, preserveSelection);
			if (complete) {
				this._restoringWindows.delete(state.id);
			} else if (!cts.token.isCancellationRequested) {
				this.logService.warn('[SessionsView] Keeping unresolved auxiliary session bindings for provider recovery');
			}
		} catch (error) {
			if (!isCancellationError(error)) {
				this.logService.error('[SessionsView] Failed to restore auxiliary session window', error);
				this.notificationService.prompt(Severity.Warning, localize('sessions.restoreWindowFailed', "A Sessions window could not be restored. Its saved sessions and layout have been kept."), [{
					label: localize('sessions.retryWindow', "Retry"),
					run: () => this.restoreAuxiliaryPart(state, true),
				}]);
			}
		} finally {
			if (this._auxiliaryRestoreCts.get(state.id) === cts) {
				this._auxiliaryRestoreCts.deleteAndDispose(state.id);
			}
			this.closeEmptyAuxiliaryParts();
		}
	}

	private async _restoreVisibleSessions(token: CancellationToken, gridState: ISessionGridState | undefined, partId = MAIN_SESSIONS_PART, activate = true, preserveSelection = false): Promise<boolean> {
		const navigation = this.navigationRequest.get();
		// Ordered list of slots to restore: real sessions plus, optionally, the
		// empty (new-session) slot when it was active.
		interface IRestoreTarget {
			readonly resource: URI | undefined;
			isSticky: boolean;
			isActive: boolean;
			readonly order: number;
			readonly gridId?: string;
		}

		if (partId === MAIN_SESSIONS_PART) {
			this._restoringGridState = gridState;
		}
		const persisted = this._getVisibleSessionStates();
		const unresolved: IRestoreTarget[] = gridState ? gridState.sessions.map((binding, index) => ({
			resource: binding.resource ? URI.parse(binding.resource) : undefined,
			isSticky: binding.sticky,
			isActive: binding.id === gridState.active,
			order: index,
			gridId: binding.id,
		})) : persisted.map(state => ({
			resource: URI.parse(state.sessionResource),
			isSticky: !!state.isSticky,
			isActive: !!state.isActive,
			order: state.visibleOrder!,
		}));
		// Redirecting a persisted slot can wait on a cold agent host. Bound the whole
		// pass so one slow slot cannot hold the entire grid blank; an unredirected
		// slot still opens, just against its persisted resource.
		const redirected: IRestoreTarget[] = await raceTimeout(Promise.all(unresolved.map(async target => ({
			// Persisted state names a session by URI, so a legacy Copilot CLI slot
			// restores through the old provider unless it is redirected here.
			...target,
			resource: target.resource ? await this.sessionsManagementService.resolveSessionResource(target.resource, 'restore') : undefined,
		}))), RESTORE_RESOLVE_BUDGET_MS) ?? unresolved;
		const targets: IRestoreTarget[] = [];
		const redirects = new Map<string, string>();
		for (const target of redirected) {
			const duplicate = targets.find(existing => this.uriIdentityService.extUri.isEqual(existing.resource, target.resource));
			if (duplicate) {
				duplicate.isSticky ||= target.isSticky;
				duplicate.isActive ||= target.isActive;
				if (target.gridId && duplicate.gridId) {
					redirects.set(target.gridId, duplicate.gridId);
				}
			} else {
				targets.push(target);
			}
		}

		if (token.isCancellationRequested) {
			return false;
		}

		if (targets.length === 0) {
			targets.push({ resource: undefined, isSticky: false, isActive: true, order: 1 });
		}

		targets.sort((a, b) => a.order - b.order);

		let activeIdx = targets.findIndex(t => t.isActive);
		if (preserveSelection) {
			const selected = this._visibility.getSelectedSession(partId)?.resource;
			const current = selected ? targets.findIndex(target => this.uriIdentityService.extUri.isEqual(target.resource, selected)) : -1;
			activeIdx = current >= 0 ? current : targets.findIndex(target => target.resource && this.sessionsManagementService.getSession(target.resource));
		}
		if (activeIdx < 0) {
			activeIdx = 0;
		}

		// Sessions resolved so far, indexed by their position in `targets`.
		// `null` marks the empty (new-session) slot, which has no session.
		const resolved: (ISession | null | undefined)[] = new Array(targets.length).fill(undefined);

		const restoreResolved = (preserveActive: boolean): void => {
			const slots: { session: ISession | undefined; sticky: boolean; gridId?: string }[] = [];
			let activeIndex = -1;
			const activeId = this._visibility.getSelectedSession(partId)?.sessionId;
			for (let index = 0; index < targets.length; index++) {
				const session = resolved[index];
				if (session === undefined) {
					continue;
				}
				if (preserveActive ? session?.sessionId === activeId : index === activeIdx) {
					activeIndex = slots.length;
				}
				slots.push({ session: session ?? undefined, sticky: targets[index].isSticky, gridId: targets[index].gridId });
			}
			transaction(tx => {
				this._visibility.restoreGrid(slots, Math.max(0, activeIndex), partId, activate && this.navigationRequest.get() === navigation && (!preserveActive || this.getSessionPartId(this.activeSession.get()) === partId));
				if (gridState) {
					const ids = new Set(slots.map(slot => slot.gridId));
					const grid = projectSessionGrid(gridState.grid, id => {
						const mapped = redirects.get(id) ?? id;
						return ids.has(mapped) ? mapped : undefined;
					});
					if (grid) {
						this._gridRequest.set({ type: 'restore', grid, partId }, tx);
					}
				} else if (persisted.some(state => state.gridLayout === 'grid')) {
					this._gridRequest.set({ type: 'arrange' }, tx);
				}
			});
		};

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
			if (gridState) {
				resolved[idx] = session;
				restoreResolved(true);
				return;
			}
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
			return false;
		}
		if (activeSession) {
			const provider = this.sessionsProvidersService.getProvider(activeSession.providerId);
			void provider?.prepareSessionForOpen?.(activeSession, 'restore').catch(error => this.logService.warn(`[SessionsView] Failed to prepare restored session for provider '${provider.id}'`, error));
		}

		// Lay out all currently-available sessions atomically in the persisted
		// order so the grid appears in one shot rather than building up slot by
		// slot (which caused the active session to be shown alone and then
		// reflow as the others were inserted). Sessions whose provider has not
		// yet surfaced them are filled in incrementally below.
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
		}
		restoreResolved(preserveSelection);

		if (token.isCancellationRequested) {
			return false;
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
		if (token.isCancellationRequested) {
			return false;
		}
		for (let index = 0; index < targets.length; index++) {
			const resource = targets[index].resource;
			if (resource && resolved[index] === undefined) {
				const session = this.sessionsManagementService.getSession(resource);
				if (session) {
					place(index, session);
				}
			}
		}
		return resolved.every(session => session !== undefined);
	}

	// -- Session Navigation --

	async openPreviousSession(): Promise<void> {
		await this._navigation.goBack();
	}

	async openNextSession(): Promise<void> {
		await this._navigation.goForward();
	}

	override dispose(): void {
		this._restoreCts.value?.cancel();
		for (const source of this._auxiliaryRestoreCts.values()) {
			source.cancel();
		}
		for (const source of this._openSessionCts.values()) {
			source.cancel();
		}
		this._sessionMoves.clear();
		super.dispose();
	}
}

registerSingleton(ISessionsService, SessionsService, InstantiationType.Eager);
