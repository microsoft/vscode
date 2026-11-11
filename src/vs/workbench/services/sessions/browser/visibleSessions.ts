/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, IReader, ISettableObservable, ITransaction, autorun, constObservable, derived, observableValue, subtransaction, transaction } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { ChatInteractivity, ChatOriginKind, IChat, ISession } from '../common/session.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { Direction } from '../../../../base/browser/ui/grid/grid.js';
import { ISessionGridSlot } from './sessionsPartService.js';
import { ISessionGridPane, SessionGridPaneKind } from './sessionGridPane.js';
import { ISessionPaneTabs } from '../common/sessionPane.js';

/**
 * The state of a pane for one incarnation of the session it shows: the chat it shows and its tab strip. Replacing the
 * session, such as a draft graduating, gives the pane a new state, seeded from the persisted state of the session.
 */
interface IPaneState {
	readonly session: ISession;
	readonly sessionId: string;
	readonly activeChat: IObservable<IChat>;
	readonly sticky: IObservable<boolean>;
	readonly openChats: IObservable<readonly IChat[]>;
	readonly closedChats: IObservable<readonly IChat[]>;
	readonly lastClosedChat: IChat | undefined;
	readonly visibleChatTabs: IObservable<readonly IChat[]>;
	readonly shouldShowChatTabs: IObservable<boolean>;
}

/**
 * The state of the slot of a session: its active chat, and its tab strip with the chats closed in it, the subagent chats
 * shown in it and the chats it excludes because another pane or window shows them. Each slot keeps its own, so a slot that
 * is not active retains its chat selection.
 */
class SessionSlotState extends Disposable implements IPaneState {

	private readonly _sticky = observableValue<boolean>('activeSessionSticky', false);
	readonly sticky: IObservable<boolean> = this._sticky;

	private readonly _activeChat: ISettableObservable<IChat>;
	readonly activeChat: IObservable<IChat>;
	private _fallenBack: { readonly from: URI; readonly to: URI } | undefined;

	/** Resource strings of chats that have been closed (hidden from the tab strip). */
	private readonly _closedChatUris: ISettableObservable<ReadonlySet<string>>;
	/**
	 * Resource strings of subagent (tool-origin) chats the user explicitly opened,
	 * so they surface as tabs. Subagents are hidden from the tab strip by default.
	 */
	private readonly _shownRelatedChatUris: ISettableObservable<ReadonlySet<string>>;
	/** Append-only list tracking close order; last element is the most recently closed. */
	private readonly _closedChatOrder: IChat[] = [];
	readonly openChats: IObservable<readonly IChat[]>;
	readonly closedChats: IObservable<readonly IChat[]>;
	readonly visibleChatTabs: IObservable<readonly IChat[]>;
	readonly shouldShowChatTabs: IObservable<boolean>;
	private readonly _detachedChats = observableValue<ReadonlySet<string>>(this, new Set());
	/** Chats shown in a window of their own, which a grid session does not list anymore. */
	private readonly _windowChats = observableValue<ReadonlySet<string>>(this, new Set());

	constructor(
		private readonly _session: ISession,
		initialChat: IChat,
		initialClosedChatUris?: Iterable<string>,
		initialShownRelatedChatUris?: Iterable<string>,
	) {
		super();
		this._activeChat = observableValue<IChat>(`activeChat-${_session.sessionId}`, initialChat);
		this.activeChat = this._activeChat;

		// Seed the closed set from persisted state, but never hide the chat that
		// is being restored as active, nor the main chat (which can never be
		// closed and must always remain in the tab strip).
		const seed = new Set(initialClosedChatUris);
		seed.delete(_session.mainChat.get().resource.toString());
		const activeUri = initialChat?.resource.toString();
		if (activeUri) {
			seed.delete(activeUri);
		}
		this._closedChatUris = observableValue<ReadonlySet<string>>('closedChatUris', seed);

		// Subagents are hidden by default; if the restored active chat is one,
		// surface its tab so the session opens where the user left off.
		const shownRelatedChats = new Set(initialShownRelatedChatUris);
		if (initialChat?.origin?.kind === ChatOriginKind.Tool) {
			shownRelatedChats.add(initialChat.resource.toString());
		}
		this._shownRelatedChatUris = observableValue<ReadonlySet<string>>('shownRelatedChatUris', shownRelatedChats);

		this.openChats = derived(this, reader => {
			const closed = this._closedChatUris.read(reader);
			const chats = this._session.chats.read(reader);
			const detached = this._detachedChats.read(reader);
			const inWindow = this._windowChats.read(reader);
			// Hidden chats are internal workers that must never be surfaced in the
			// conversation tab strip; closed chats are user-dismissed.
			return chats.filter(c =>
				!detached.has(c.resource.toString()) && !inWindow.has(c.resource.toString()) &&
				c.interactivity.read(reader) !== ChatInteractivity.Hidden &&
				!closed.has(c.resource.toString()));
		});
		this.closedChats = derived(this, reader => {
			const closed = this._closedChatUris.read(reader);
			if (closed.size === 0) {
				return [];
			}
			return this._session.chats.read(reader).filter(c => closed.has(c.resource.toString()));
		});
		// Tab strip contents: the open chats in the provider's order, with subagent
		// (tool-origin) chats hidden by default. A subagent surfaces as a tab only
		// once explicitly opened (e.g. via its chat-transcript pill), tracked in
		// `_shownRelatedChatUris`. Hidden and closed chats are excluded by `openChats`.
		this.visibleChatTabs = derived(this, reader => {
			const shownRelatedChats = this._shownRelatedChatUris.read(reader);
			return this.openChats.read(reader).filter(c =>
				c.origin?.kind !== ChatOriginKind.Tool ||
				shownRelatedChats.has(c.resource.toString()));
		});
		// Detached chats keep the parent's tab strip available as a reattachment target.
		// Otherwise shown only when there is more than one chat actually showing as a tab.
		// Without detached children, a single visible tab (even if other chats are closed, or its title
		// diverged from the session title, or subagents exist) always hides the
		// strip; side chats remain reachable from the Side Chats menu in the
		// session header, and subagents from their chat-transcript pills.
		this.shouldShowChatTabs = derived(this, reader => {
			return this._detachedChats.read(reader).size > 0 || this.visibleChatTabs.read(reader).length > 1;
		});
	}

	setDetachedChats(resources: ReadonlySet<string>, transaction?: ITransaction): void {
		subtransaction(transaction, tx => {
			this._detachedChats.set(resources, tx);
			if (resources.has(this._activeChat.get().resource.toString())) {
				this._activeChat.set(this._defaultActiveChat(this._closedChatUris.get(), this._shownRelatedChatUris.get()), tx);
			}
		});
	}

	setWindowChats(resources: ReadonlySet<string>, transaction?: ITransaction): void {
		subtransaction(transaction, tx => {
			this._windowChats.set(resources, tx);
			if (resources.has(this._activeChat.get().resource.toString())) {
				this._activeChat.set(this._defaultActiveChat(this._closedChatUris.get(), this._shownRelatedChatUris.get()), tx);
			}
		});
	}

	setActiveChat(chat: IChat): void {
		this._setActiveChat(chat, undefined);
	}

	/** The subagent (tool-origin) chats explicitly shown, by resource. */
	get shownRelatedChatUris(): ReadonlySet<string> {
		return this._shownRelatedChatUris.get();
	}

	private _setActiveChat(chat: IChat, tx: ITransaction | undefined): void {
		if (this._fallenBack && chat.resource.toString() !== this._fallenBack.to.toString()) {
			this._fallenBack = undefined;
		}
		this._activeChat.set(chat, tx);
	}

	/** Shows `to` because the session stopped listing the active chat `from`, which may have moved to another session. */
	fallBack(from: URI, to: IChat): void {
		this.setActiveChat(to);
		this._fallenBack = { from, to: to.resource };
	}

	/**
	 * The chat this view automatically fell back from, until another chat becomes active: a move of that chat paired
	 * later then doesn't replace what the user chose.
	 */
	get chatFallenBackFrom(): URI | undefined {
		return this._fallenBack?.from;
	}

	closeChat(chat: IChat): void {
		const chatUri = chat.resource.toString();
		// The main chat represents the session itself and is never closed.
		if (chatUri === this._session.mainChat.get().resource.toString()) {
			return;
		}
		// Closing a subagent (tool-origin) tab just hides it again; it stays
		// reachable from its chat-transcript pill and is not added to the
		// reopenable closed set.
		if (chat.origin?.kind === ChatOriginKind.Tool) {
			const shown = this._shownRelatedChatUris.get();
			if (!shown.has(chatUri)) {
				return;
			}
			const nextShown = new Set(shown);
			nextShown.delete(chatUri);
			transaction(tx => {
				this._shownRelatedChatUris.set(nextShown, tx);
				if (this._activeChat.get().resource.toString() === chatUri) {
					this._setActiveChat(this._defaultActiveChat(this._closedChatUris.get(), nextShown), tx);
				}
			});
			return;
		}
		const closed = this._closedChatUris.get();
		if (closed.has(chatUri)) {
			return;
		}
		const next = new Set(closed);
		next.add(chatUri);
		this._closedChatOrder.push(chat);
		transaction(tx => {
			this._closedChatUris.set(next, tx);
			// If the closed chat was active, fall back to another visible tab.
			if (this._activeChat.get().resource.toString() === chatUri) {
				this._setActiveChat(this._defaultActiveChat(next, this._shownRelatedChatUris.get()), tx);
			}
		});
	}

	openChat(chat: IChat): void {
		// Opening a subagent (tool-origin) chat surfaces it as a tab.
		if (chat.origin?.kind === ChatOriginKind.Tool) {
			const shown = this._shownRelatedChatUris.get();
			if (shown.has(chat.resource.toString())) {
				return;
			}
			const next = new Set(shown);
			next.add(chat.resource.toString());
			this._shownRelatedChatUris.set(next, undefined);
			return;
		}
		const closed = this._closedChatUris.get();
		if (!closed.has(chat.resource.toString())) {
			return;
		}
		const next = new Set(closed);
		next.delete(chat.resource.toString());
		this._closedChatUris.set(next, undefined);
		const idx = this._closedChatOrder.findLastIndex(c => c.resource.toString() === chat.resource.toString());
		if (idx !== -1) {
			this._closedChatOrder.splice(idx, 1);
		}
	}

	/**
	 * Pick the active chat to fall back to when the current one is closed: the
	 * last chat that would appear as a visible tab given the closed and shown-
	 * subagent sets, or the main chat.
	 */
	private _defaultActiveChat(closed: ReadonlySet<string>, shownRelatedChats: ReadonlySet<string>): IChat {
		const candidates = this._session.chats.get().filter(c =>
			!this._detachedChats.get().has(c.resource.toString()) &&
			!this._windowChats.get().has(c.resource.toString()) &&
			c.interactivity.get() !== ChatInteractivity.Hidden &&
			!closed.has(c.resource.toString()) &&
			(c.origin?.kind !== ChatOriginKind.Tool || shownRelatedChats.has(c.resource.toString())));
		return candidates[candidates.length - 1] ?? this._session.mainChat.get();
	}

	get lastClosedChat(): IChat | undefined {
		// Filter out stale entries whose chat has since been deleted from the session.
		const currentChats = this._session.chats.get();
		const closed = this._closedChatUris.get();
		for (let i = this._closedChatOrder.length - 1; i >= 0; i--) {
			const chat = this._closedChatOrder[i];
			const uri = chat.resource.toString();
			if (closed.has(uri) && currentChats.some(c => c.resource.toString() === uri)) {
				return chat;
			}
		}
		return undefined;
	}

	setSticky(value: boolean): void {
		this._sticky.set(value, undefined);
	}

	/** Register a disposable that lives as long as this slot state. */
	addDisposable(disposable: IDisposable): IDisposable {
		return this._register(disposable);
	}

	get sessionId(): string { return this._session.sessionId; }

	/** The session of the slot, which outlives this state. */
	get session(): ISession { return this._session; }
}

/**
 * The state of a detached pane: the one chat of its session it shows apart from the session's slot. Its tab strip is that
 * chat while the session lists it and it is not hidden. Nothing closes, opens or selects another chat in it.
 */
class DetachedChatState implements IPaneState {

	readonly activeChat: IObservable<IChat>;
	readonly sticky: IObservable<boolean> = constObservable(false);
	readonly openChats: IObservable<readonly IChat[]>;
	readonly closedChats: IObservable<readonly IChat[]> = constObservable([]);
	readonly lastClosedChat = undefined;
	readonly visibleChatTabs: IObservable<readonly IChat[]>;
	readonly shouldShowChatTabs: IObservable<boolean> = constObservable(true);

	constructor(
		readonly session: ISession,
		readonly chat: IChat,
	) {
		this.activeChat = constObservable(chat);
		const key = chat.resource.toString();
		this.openChats = derived(this, reader => session.chats.read(reader).filter(candidate =>
			candidate.resource.toString() === key && candidate.interactivity.read(reader) !== ChatInteractivity.Hidden));
		this.visibleChatTabs = this.openChats;
	}

	get sessionId(): string { return this.session.sessionId; }
}

/** The chat `state` shows apart from its session's slot: a detached pane's chat; `undefined` for a slot. */
function detachedChatOf(state: IPaneState | undefined): URI | undefined {
	return state instanceof DetachedChatState ? state.chat.resource : undefined;
}

/**
 * A pane of the grid: its grid slot, which shows the session of its current state, the state of the session incarnation it
 * shows. A replacement of the session, such as a draft graduating, gives the pane another state, and keeps the pane and its
 * id.
 */
class SessionGridPane implements ISessionGridPane {

	private readonly _state = observableValue<IPaneState | undefined>(this, undefined);
	/** The state of the session incarnation the pane shows; `undefined` for the new-session slot. */
	readonly state: IObservable<IPaneState | undefined> = this._state;

	readonly session: IObservable<ISession | undefined>;
	readonly chat: IObservable<IChat | undefined>;
	readonly sticky: IObservable<boolean>;
	readonly tabs: ISessionPaneTabs;

	constructor(
		readonly id: string,
		readonly kind: SessionGridPaneKind,
	) {
		const state = this._state;
		this.session = derived(this, reader => state.read(reader)?.session);
		this.chat = derived(this, reader => state.read(reader)?.activeChat.read(reader));
		this.sticky = derived(this, reader => kind === SessionGridPaneKind.Slot && (state.read(reader)?.sticky.read(reader) ?? false));
		this.tabs = {
			openChats: derived(this, reader => state.read(reader)?.openChats.read(reader) ?? []),
			closedChats: derived(this, reader => state.read(reader)?.closedChats.read(reader) ?? []),
			get lastClosedChat() { return state.get()?.lastClosedChat; },
			visibleChatTabs: derived(this, reader => state.read(reader)?.visibleChatTabs.read(reader) ?? []),
			shouldShowChatTabs: derived(this, reader => state.read(reader)?.shouldShowChatTabs.read(reader) ?? false),
		};
	}

	setState(state: IPaneState | undefined, transaction: ITransaction | undefined): void {
		this._state.set(state, transaction);
	}
}

function isGridPane(target: ISession | ISessionGridPane | undefined): target is ISessionGridPane {
	return !!target && typeof (target as Partial<ISessionGridPane>).kind === 'string' && !!(target as Partial<ISessionGridPane>).tabs;
}

/**
 * Sentinel used to distinguish "no slot tracked" from the empty slot
 * (which is itself represented by `undefined` in the visible list).
 */
const NO_RECENT = Symbol('no-recent');

/**
 * Encapsulates the visibility model used by the
 * {@link SessionsManagementService}.
 *
 * The model tracks:
 * - The currently active session.
 * - An ordered list of slots to display in the sessions part's grid. A slot
 *   is either a session id (string) or `undefined` (the "empty" / new-session
 *   placeholder). At most one slot may be `undefined` at a time.
 * - A "sticky" set: sessions the user has explicitly pinned. Non-sticky
 *   sessions also live in the grid but get replaced when new sessions open.
 *   The empty slot is always non-sticky.
 *
 * Each tracked session has a single slot state owned by
 * this class. Slot states are disposed automatically when their session leaves
 * the visibility model.
 */
export class VisibleSessions extends Disposable {
	private readonly _detached = new Map<string, { readonly slot: ISessionGridSlot; readonly state: DetachedChatState }>();
	private readonly _detachedDisposables = this._register(new DisposableMap<string, DisposableStore>());
	private readonly _gridSessions = observableValue<readonly (IPaneState | undefined)[]>(this, [undefined]);

	private readonly _panesById = new Map<string, SessionGridPane>();
	private readonly _panes = observableValue<readonly SessionGridPane[]>(this, []);
	/** The panes of the grid, in the order of {@link getRenderedGridSlots}: its slots, then its detached panes. */
	readonly panes: IObservable<readonly ISessionGridPane[]> = this._panes;
	/** The slots of {@link panes}, without its detached panes. */
	readonly slotPanes: IObservable<readonly ISessionGridPane[]> = derived(this, reader => this._panes.read(reader).filter(pane => pane.kind === SessionGridPaneKind.Slot));

	getRenderedGridSlots(): readonly ISessionGridSlot[] {
		return [...this.getGridSlots(), ...[...this._detached.values()].map(entry => entry.slot)];
	}

	/** The detached pane of the chat `resource` of the session `sessionId`, if the grid shows that chat apart from its slot. */
	getChatPane(sessionId: string, resource: URI): ISessionGridPane | undefined {
		const entry = this._detached.get(resource.toString());
		return entry?.state.sessionId === sessionId ? this._panesById.get(entry.slot.id) : undefined;
	}

	insertAtGridSlot(session: ISession | undefined, reference: string, side: 'left' | 'right' | 'up' | 'down', activate: boolean, transaction?: ITransaction): void {
		const sessionId = session?.sessionId;
		const slots = this.getRenderedGridSlots();
		const index = slots.findIndex(slot => slot.id === reference);
		if (index < 0 || this._gridSlots.get(sessionId)?.id === reference) {
			return;
		}
		const target = this._gridSessions.get()[index];
		subtransaction(transaction, tx => {
			if (target && detachedChatOf(target) && !this._visibleList.includes(target.sessionId)) {
				if (!this._visibleList.includes(sessionId)) {
					if (session) {
						this._getOrCreateVisibleSession(session);
					}
					this._visibleList.push(sessionId);
				}
				if (!this._isStickySlot(sessionId)) {
					this._mostRecentNonStickySlot = sessionId;
				}
			} else {
				this.insertAt(session, target?.sessionId, side, false);
			}
			const previous = this._gridSlots.get(sessionId);
			this._gridSlots.set(sessionId, {
				id: previous?.id ?? generateUuid(),
				placement: { reference, direction: side === 'left' ? Direction.Left : side === 'right' ? Direction.Right : side === 'up' ? Direction.Up : Direction.Down },
			});
			if (activate) {
				this._setActiveSession(sessionId ? this._wrappers.get(sessionId) : undefined, false, tx);
			}
			this._refresh(tx);
		});
	}

	moveChatToGrid(session: ISession, chat: IChat, reference: string, direction: Direction, gridId?: string, transaction?: ITransaction): void {
		const key = chat.resource.toString();
		const existing = this._detached.get(key);
		if (existing?.slot.id === reference) {
			return;
		}
		const store = existing ? undefined : new DisposableStore();
		if (store) {
			this._detachedDisposables.set(key, store);
		}
		const wrapper = existing?.state ?? new DetachedChatState(session, chat);
		const slot: ISessionGridSlot = {
			id: existing?.slot.id ?? gridId ?? generateUuid(),
			placement: { reference, direction },
		};
		subtransaction(transaction, tx => {
			this._detached.set(key, { slot, state: wrapper });
			this._updateDetachedChats(session.sessionId, tx);
			this._setActiveSession(wrapper, false, tx);
			this._refresh(tx);
		});
		store?.add(autorun(reader => {
			if (!session.loading.read(reader) && !session.chats.read(reader).some(candidate => candidate.resource.toString() === key)) {
				this.attachChat(session, chat.resource);
			}
		}));
	}

	attachChat(session: ISession, resource: URI, transaction?: ITransaction): boolean {
		const key = resource.toString();
		const detached = this._detached.get(key);
		if (!detached || detached.state.sessionId !== session.sessionId) {
			return false;
		}
		subtransaction(transaction, tx => {
			this._detached.delete(key);
			this._detachedDisposables.deleteAndDispose(key);
			this._updateDetachedChats(session.sessionId, tx);
			if (this._activeSession.get() === detached.state) {
				const sibling = [...this._detached.values()].find(entry => entry.state.sessionId === session.sessionId)?.state;
				const lastRoot = this._visibleList.at(-1);
				const fallback = this._visibleList.length
					? lastRoot === undefined ? undefined : this._wrappers.get(lastRoot)
					: this._detached.values().next().value?.state;
				this._setActiveSession(this._wrappers.get(session.sessionId) ?? sibling ?? fallback, false, tx);
			}
			this._refresh(tx);
		});
		return true;
	}

	private _updateWindowChats(sessionId: string, transaction?: ITransaction): void {
		this._wrappers.get(sessionId)?.setWindowChats(new Set(
			[...this._hiddenChats].filter(([, hidden]) => hidden.sessionId === sessionId).map(([key]) => key),
		), transaction);
	}

	/** Chats another host shows, such as a chat window, by chat resource: the grid does not show them. */
	private readonly _hiddenChats = new Map<string, { readonly sessionId: string; count: number }>();

	/**
	 * Hides `chat` of the session `sessionId` from the grid while the returned disposable is not disposed, such as while a
	 * chat window shows it: its tab does not show in the session's slot. Holds may overlap; the chat shows again once all
	 * are released.
	 */
	hideChatFromGrid(sessionId: string, chatResource: URI): IDisposable {
		const key = chatResource.toString();
		const hidden = this._hiddenChats.get(key);
		if (hidden?.sessionId === sessionId) {
			hidden.count++;
		} else {
			this._hiddenChats.set(key, { sessionId, count: 1 });
		}
		this._updateWindowChats(sessionId);
		let released = false;
		return toDisposable(() => {
			if (released) {
				return;
			}
			released = true;
			const current = this._hiddenChats.get(key);
			if (current?.sessionId !== sessionId) {
				return;
			}
			if (--current.count === 0) {
				this._hiddenChats.delete(key);
			}
			this._updateWindowChats(sessionId);
		});
	}

	private _updateDetachedChats(sessionId: string, transaction?: ITransaction): void {
		this._wrappers.get(sessionId)?.setDetachedChats(new Set(
			[...this._detached].filter(([, entry]) => entry.state.sessionId === sessionId).map(([key]) => key)
		), transaction);
	}

	private readonly _gridSlots = new Map<string | undefined, ISessionGridSlot>([[undefined, { id: 'initial' }]]);

	getGridSlots(): readonly ISessionGridSlot[] {
		if (!this._visibleList.length && this._detached.size) {
			return [];
		}
		return (this._visibleList.length ? this._visibleList : [undefined]).map(id => {
			let slot = this._gridSlots.get(id);
			if (!slot) {
				slot = { id: generateUuid() };
				this._gridSlots.set(id, slot);
			}
			return slot;
		});
	}

	private transferGridSlot(from: string | undefined, to: string | undefined): void {
		const slot = this._gridSlots.get(from);
		this._gridSlots.delete(from);
		if (slot) {
			this._gridSlots.set(to, slot);
		}
	}

	/** The state of the session incarnation the active pane shows; `undefined` while the new-session slot, or no pane, is. */
	private readonly _activeSession = observableValue<IPaneState | undefined>(this, undefined);

	/** The active pane: the new-session slot's while that is active; `undefined` while no pane is. */
	readonly activePane: IObservable<ISessionGridPane | undefined> = derived(this, reader => {
		const active = this._activeSession.read(reader);
		return this._panes.read(reader).find(pane => active
			? pane.state.read(reader) === active
			: pane.kind === SessionGridPaneKind.Slot && !pane.state.read(reader));
	});

	/**
	 * Whether the most recent active-session change asked to preserve keyboard
	 * focus (i.e. show the session without moving focus into it). Always set in
	 * the **same transaction** as {@link _activeSession} via
	 * {@link _setActiveSession} so the pair can never go stale, and read
	 * reactively by the consumer that drives focus.
	 */
	private readonly _activePreserveFocus = observableValue<boolean>(this, false);
	readonly activePreserveFocus: IObservable<boolean> = this._activePreserveFocus;

	/**
	 * The sessions of the grid's slots, in order: the provider's sessions, and `undefined` for the new-session slot. Unlike
	 * {@link slotPanes}, empty while the grid has no slot of its own yet.
	 */
	private readonly _slotSessions = observableValue<readonly (ISession | undefined)[]>(this, [undefined]);
	readonly slotSessions: IObservable<readonly (ISession | undefined)[]> = this._slotSessions;

	private readonly _wrappers = this._register(new DisposableMap<string, SessionSlotState>());
	/**
	 * Ordered slot ids in the grid (left-to-right). Each entry is either a
	 * session id or `undefined` (the empty slot). The invariant is that at
	 * most one entry is `undefined` at any time.
	 */
	private _visibleList: (string | undefined)[] = [];
	/** Subset of {@link _visibleList} the user has marked sticky. */
	private readonly _stickyIds = new Set<string>();
	/**
	 * Slot id of the most recently opened (or toggled-to-non-sticky) entry in
	 * the grid. Used to choose which non-sticky slot to replace when opening a
	 * new session while the active one is sticky.
	 * - `NO_RECENT` means none is tracked.
	 * - `undefined` refers to the empty slot.
	 * - A string refers to that session id.
	 */
	private _mostRecentNonStickySlot: string | undefined | typeof NO_RECENT = NO_RECENT;

	/**
	 * @param _onSlotReplaced Reports a session that left the grid because a
	 * newly opened slot took its place, with the slot state it lost. Explicit
	 * removals ({@link removeMany}) and grid restores are not reported.
	 */
	constructor(
		private readonly _resolveInitialChat: (session: ISession) => IChat,
		private readonly _resolveInitialClosedChats: (session: ISession) => Iterable<string>,
		private readonly _resolveInitialShownRelatedChats: (session: ISession) => Iterable<string>,
		private readonly _onSlotReplaced: (replaced: ISession, index: number, sticky: boolean, replacedBySessionId: string | undefined) => void,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService,
	) {
		super();
		this._updatePanes(undefined);
	}

	/**
	 * Set the active session together with its preserve-focus intent in a
	 * single transaction. Routing every active-session change through here
	 * guarantees the two observables are always consistent and that the intent
	 * never goes stale (callers that do not preserve focus pass `false`).
	 */
	private _setActiveSession(session: IPaneState | undefined, preserveFocus: boolean, tsx: ITransaction): void {
		this._activeSession.set(session, tsx);
		this._activePreserveFocus.set(preserveFocus, tsx);
	}

	/**
	 * Set the active session, updating the visibility model accordingly.
	 *
	 * - Passing a pane of this grid makes that pane active: a detached pane, a
	 *   slot (as passing its session), or the new-session slot (as passing
	 *   `undefined`). A pane that is not this grid's is ignored.
	 * - Passing `undefined` places (or keeps) the single empty slot in the
	 *   grid and makes it active. The empty slot is always non-sticky.
	 * - If the session is already in the grid, its slot is preserved and only
	 *   the active observable is updated.
	 * - Otherwise the session is placed as non-sticky:
	 *   - If the active slot is non-sticky, the new one replaces it in
	 *     place.
	 *   - Else if a non-sticky slot exists, the most-recently opened
	 *     non-sticky is replaced.
	 *   - Else the session is appended at the end of the grid.
	 */
	setActive(target: ISession | ISessionGridPane | undefined, preserveFocus: boolean = false): void {
		let session: ISession | undefined;
		if (isGridPane(target)) {
			if (!(target instanceof SessionGridPane) || this._panesById.get(target.id) !== target) {
				return;
			}
			const state = target.state.get();
			if (state && target.kind === SessionGridPaneKind.Detached) {
				transaction(tx => this._setActiveSession(state, preserveFocus, tx));
				return;
			}
			session = state?.session;
		} else {
			session = target;
		}
		const targetId: string | undefined = session?.sessionId;
		const targetHasVisibleSlot = this._visibleList.includes(targetId);

		if (!targetHasVisibleSlot) {
			const activeSlot = this._currentActiveSlot();
			const activeIsNonSticky = activeSlot !== NO_RECENT && !this._isStickySlot(activeSlot);

			let replaceSlot: string | undefined | typeof NO_RECENT;
			if (activeIsNonSticky) {
				replaceSlot = activeSlot;
			} else if (this._mostRecentNonStickySlot !== NO_RECENT
				&& this._visibleList.includes(this._mostRecentNonStickySlot)
				&& !this._isStickySlot(this._mostRecentNonStickySlot)) {
				replaceSlot = this._mostRecentNonStickySlot;
			} else {
				replaceSlot = this._findLastNonSticky();
			}

			if (replaceSlot !== NO_RECENT) {
				this.transferGridSlot(replaceSlot, targetId);
				const idx = this._visibleList.indexOf(replaceSlot);
				this._visibleList.splice(idx, 1, targetId);
				if (replaceSlot !== undefined) {
					const replaced = this._wrappers.get(replaceSlot)?.session;
					const sticky = this._stickyIds.has(replaceSlot);
					this._wrappers.deleteAndDispose(replaceSlot);
					if (replaced) {
						this._onSlotReplaced(replaced, idx, sticky, targetId);
					}
				}
			} else {
				if (!this._visibleList.length) {
					this.transferGridSlot(undefined, targetId);
				}
				this._visibleList.push(targetId);
			}
			this._mostRecentNonStickySlot = targetId;
		}

		const visibleSession = session ? this._getOrCreateVisibleSession(session) : undefined;
		transaction((tsx) => {
			this._setActiveSession(visibleSession, preserveFocus, tsx);
			if (!targetHasVisibleSlot) {
				this._refresh(tsx);
			}
		});
	}

	/**
	 * Insert (or move) a slot into the grid positioned next to a target
	 * session that is already visible. Used by drag-and-drop and by
	 * "open at position" entry points.
	 *
	 * - If the slot is not yet visible, a new non-sticky entry is created
	 *   at the computed position.
	 * - If the slot is already visible, it is moved to the computed
	 *   position; its sticky / non-sticky state is preserved. This also
	 *   moves the single empty slot when `session` is `undefined`.
	 *
	 * When `activate` is `true` (default), the inserted slot also becomes
	 * the active session. When `false`, the active session is left
	 * unchanged.
	 *
	 * `targetSessionId` may be `undefined` to position relative to the empty
	 * (new-session) slot. No-op if the target slot is not currently visible.
	 */
	insertAt(session: ISession | undefined, targetSessionId: string | undefined, side: 'left' | 'right' | 'up' | 'down', activate: boolean = true): void {
		if (!this._visibleList.length && targetSessionId === undefined) {
			this._visibleList.push(undefined);
		}
		const id: string | undefined = session?.sessionId;
		const targetIdx = this._visibleList.indexOf(targetSessionId);
		if (targetIdx < 0) {
			return;
		}

		if (id === targetSessionId) {
			return;
		}
		const reference = this.getGridSlots()[targetIdx].id;
		const previous = this._gridSlots.get(id);
		this._gridSlots.set(id, {
			id: previous?.id ?? generateUuid(),
			placement: { reference, direction: side === 'left' ? Direction.Left : side === 'right' ? Direction.Right : side === 'up' ? Direction.Up : Direction.Down }
		});
		let destIdx = side === 'left' || side === 'up' ? targetIdx : targetIdx + 1;

		const currentIdx = this._visibleList.indexOf(id);
		if (currentIdx >= 0) {
			// Already visible: move only if the destination differs from the
			// current position (dropping to the right of the previous slot or
			// to the left of the next slot are both no-ops).
			if (currentIdx !== destIdx && currentIdx + 1 !== destIdx) {
				this._visibleList.splice(currentIdx, 1);
				if (currentIdx < destIdx) {
					destIdx--;
				}
				this._visibleList.splice(destIdx, 0, id);
			}
			if (!this._isStickySlot(id)) {
				this._mostRecentNonStickySlot = id;
			}
		} else {
			if (session) {
				this._getOrCreateVisibleSession(session);
			}
			this._visibleList.splice(destIdx, 0, id);
			this._mostRecentNonStickySlot = id;
		}

		transaction((tsx) => {
			if (activate) {
				const wrapper = id !== undefined ? this._wrappers.get(id) : undefined;
				this._setActiveSession(wrapper, false, tsx);
			}
			this._refresh(tsx);
		});
	}

	/**
	 * Atomically (re)build the entire grid from a persisted snapshot.
	 *
	 * Slots are given left-to-right; a `session` of `undefined` denotes the
	 * empty new-session slot. The whole model — slot order, stickiness and the
	 * active slot — is published in a single transaction so restoring multiple
	 * sessions does not produce intermediate layouts (which would otherwise
	 * cause the grid to visibly flicker as sessions are restored one by one).
	 *
	 * Any slot states for sessions no longer present in the snapshot are disposed.
	 *
	 * @param slots Ordered grid slots to restore.
	 * @param activeIndex Index into `slots` of the slot that should be active,
	 * or `-1` for none.
	 */
	restoreGrid(slots: ReadonlyArray<{ readonly session: ISession | undefined; readonly sticky: boolean; readonly gridId?: string; readonly chatResource?: URI }>, activeIndex: number, transaction?: ITransaction): void {
		this._visibleList = [];
		this._stickyIds.clear();

		let activeWrapper: IPaneState | undefined;
		let lastNonStickySlot: string | undefined | typeof NO_RECENT = NO_RECENT;
		for (let i = 0; i < slots.length; i++) {
			const { session, sticky } = slots[i];
			if (slots[i].chatResource) {
				continue;
			}
			const id = session?.sessionId;
			if (this._visibleList.includes(id)) {
				continue;
			}
			if (slots[i].gridId) {
				this._gridSlots.set(id, { id: slots[i].gridId! });
			}
			this._visibleList.push(id);
			if (session) {
				const wrapper = this._getOrCreateVisibleSession(session);
				if (sticky) {
					this._stickyIds.add(session.sessionId);
				}
				if (i === activeIndex) {
					activeWrapper = wrapper;
				}
			}
			if (!this._isStickySlot(id)) {
				lastNonStickySlot = id;
			}
		}

		// Dispose slot states for sessions that are no longer part of the grid so
		// the model does not leak entries from a previous (e.g. transient
		// new-session) state.
		for (const existingId of [...this._wrappers.keys()]) {
			if (!this._visibleList.includes(existingId)) {
				this._wrappers.deleteAndDispose(existingId);
			}
		}

		// Mirror the slot-replacement bookkeeping used elsewhere: prefer the
		// active slot when it is non-sticky, otherwise the last non-sticky slot.
		const activeId = activeWrapper?.sessionId;
		this._mostRecentNonStickySlot = (activeId !== undefined && !this._isStickySlot(activeId))
			? activeId
			: lastNonStickySlot;

		subtransaction(transaction, tsx => {
			const restoredChats = new Set(slots.flatMap(slot => slot.chatResource ? [slot.chatResource.toString()] : []));
			for (const [key, entry] of this._detached) {
				if (!restoredChats.has(key)) {
					this.attachChat(entry.state.session, URI.parse(key), tsx);
				}
			}
			for (let index = 0; index < slots.length; index++) {
				const { session, chatResource, gridId } = slots[index];
				if (!session || !chatResource) {
					continue;
				}
				const chat = session.chats.get().find(chat => chat.resource.toString() === chatResource.toString());
				if (chat) {
					const key = chatResource.toString();
					if (!this._detached.has(key)) {
						this.moveChatToGrid(session, chat, this.getRenderedGridSlots()[0]?.id ?? 'initial', Direction.Right, gridId, tsx);
					}
					const restored = this._detached.get(key)!;
					this._detached.set(key, { ...restored, slot: { id: gridId ?? restored.slot.id } });
					if (index === activeIndex) {
						activeWrapper = this._detached.get(chatResource.toString())?.state;
					}
				}
			}
			if (!activeWrapper && slots[activeIndex]?.session) {
				activeWrapper = this._wrappers.values().next().value ?? this._detached.values().next().value?.state;
			}
			this._setActiveSession(activeWrapper, false, tsx);
			this._refresh(tsx);
		});
	}

	/**
	 * The grid slot state of a currently visible session (or of the empty slot
	 * when `sessionId` is `undefined`), or `undefined` when it is not visible.
	 */
	getSlot(sessionId: string | undefined): { readonly index: number; readonly sticky: boolean } | undefined {
		if (!this._visibleList.length && sessionId === undefined) {
			return { index: 0, sticky: false };
		}
		const index = this._visibleList.indexOf(sessionId);
		return index < 0 ? undefined : { index, sticky: this._isStickySlot(sessionId) };
	}

	/** The session behind a visible slot, or `undefined` for the empty slot / an unknown id. */
	getSession(sessionId: string | undefined): ISession | undefined {
		return sessionId === undefined ? undefined : this._wrappers.get(sessionId)?.session;
	}

	/**
	 * Put a session (back) into the grid at `index`, shifting the slots at and
	 * after it to the right, and make it active. The index is clamped to the
	 * current grid size, so a stale index appends instead of failing. No-op
	 * when the session is already visible.
	 */
	insertAtIndex(session: ISession, index: number, sticky: boolean): void {
		const id = session.sessionId;
		if (this._visibleList.includes(id)) {
			const existing = this._wrappers.get(id);
			transaction(tsx => this._setActiveSession(existing, false, tsx));
			return;
		}

		const destIdx = Math.max(0, Math.min(index, this._visibleList.length));
		const wrapper = this._getOrCreateVisibleSession(session);
		this._visibleList.splice(destIdx, 0, id);
		if (sticky) {
			this._stickyIds.add(id);
		} else {
			this._mostRecentNonStickySlot = id;
		}

		transaction((tsx) => {
			this._setActiveSession(wrapper, false, tsx);
			this._refresh(tsx);
		});
	}

	/**
	 * Replace the slot currently held by `slotId` (`undefined` for the empty
	 * slot) with `session`, and make it active. Used to undo a grid
	 * replacement, so the restored session lands exactly where it was and the
	 * session that took its place leaves the grid. No-op when the slot is not
	 * visible or the session is already visible elsewhere. Returns whether it replaced the slot.
	 */
	replaceSlot(slotId: string | undefined, session: ISession, sticky: boolean): boolean {
		const id = session.sessionId;
		const idx = this._visibleList.indexOf(slotId);
		if (idx < 0 || this._visibleList.includes(id)) {
			return false;
		}

		this._visibleList.splice(idx, 1, id);
		this.transferGridSlot(slotId, id);
		if (slotId !== undefined) {
			this._stickyIds.delete(slotId);
			this._wrappers.deleteAndDispose(slotId);
		}
		if (sticky) {
			this._stickyIds.add(id);
		}
		if (this._mostRecentNonStickySlot === slotId) {
			this._mostRecentNonStickySlot = sticky ? this._findLastNonSticky() : id;
		}

		const wrapper = this._getOrCreateVisibleSession(session);
		transaction((tsx) => {
			this._setActiveSession(wrapper, false, tsx);
			this._refresh(tsx);
		});
		return true;
	}

	/**
	 * Toggle a session's stickiness in the grid. The session keeps its grid
	 * slot when toggled.
	 * - If the session is not currently visible, it is appended at the end as
	 *   sticky.
	 *
	 * Returns the session's stickiness state after the toggle.
	 */
	toggleStickiness(session: ISession): boolean {
		const id = session.sessionId;
		if (!this._visibleList.includes(id)) {
			this._stickyIds.add(id);
			this._getOrCreateVisibleSession(session);
			this._visibleList.push(id);
		} else if (this._stickyIds.has(id)) {
			this._stickyIds.delete(id);
			this._mostRecentNonStickySlot = id;
		} else {
			this._stickyIds.add(id);
			if (this._mostRecentNonStickySlot === id) {
				this._mostRecentNonStickySlot = this._findLastNonSticky();
			}
		}
		this._refresh(undefined);
		return this._stickyIds.has(id);
	}

	/**
	 * Remove session panes, optionally retaining standalone children, and select a surviving pane if the active pane is removed.
	 * With `preserveFocus`, the surviving pane becomes active without taking keyboard focus, such as when the pane left for another window.
	 */
	removeMany(sessionIds: Iterable<string | undefined>, preserveDetached = false, preserveFocus = false): void {
		transaction((tsx) => {
			let changed = false;
			const active = this._activeSession.get();
			const activeId = active?.sessionId;
			// activeSession.get() is undefined both when the empty slot is active
			// and when no slot is active; disambiguate via the visible list.
			const emptySlotIsActive = activeId === undefined && this._visibleList.includes(undefined);
			const activeSlotId = emptySlotIsActive ? undefined : activeId;
			const activeIdx = activeId !== undefined || emptySlotIsActive
				? this._visibleList.indexOf(activeSlotId)
				: -1;
			let activeRemoved = false;
			for (const id of sessionIds) {
				if (this._removeFromModel(id, preserveDetached)) {
					changed = true;
					if ((id === undefined ? emptySlotIsActive : id === activeId) && !(preserveDetached && detachedChatOf(active))) {
						activeRemoved = true;
					}
				}
			}
			if (activeRemoved) {
				const child = [...this._detached.values()].find(entry => entry.state.sessionId === activeId)?.state;
				if (child) {
					this._setActiveSession(child, preserveFocus, tsx);
				} else if (this._visibleList.length === 0) {
					this._setActiveSession(this._detached.values().next().value?.state, preserveFocus, tsx);
				} else {
					const fallbackIdx = Math.max(0, Math.min(activeIdx - 1, this._visibleList.length - 1));
					const fallbackId = this._visibleList[fallbackIdx];
					const fallbackWrapper = fallbackId !== undefined ? this._wrappers.get(fallbackId) : undefined;
					this._setActiveSession(fallbackWrapper, preserveFocus, tsx);
				}
			}
			if (changed) {
				this._refresh(tsx);
			}
		});
	}

	/**
	 * Set the active chat for the given session's slot state. No-op if the
	 * session is not currently tracked in the visibility model.
	 */
	setActiveChat(session: ISession, chat: IChat): void {
		const detached = this._detached.get(chat.resource.toString());
		if (detached?.state.sessionId === session.sessionId) {
			transaction(tx => this._setActiveSession(detached.state, this._activePreserveFocus.get(), tx));
			return;
		}
		transaction(tx => {
			let wrapper = this._wrappers.get(session.sessionId);
			const active = this._activeSession.get();
			const activeChat = detachedChatOf(active);
			const activeChild = active && activeChat && active.sessionId === session.sessionId
				? this._detached.get(activeChat.toString())
				: undefined;
			if (!wrapper && activeChild) {
				this.insertAtGridSlot(session, activeChild.slot.id, 'right', false, tx);
				wrapper = this._wrappers.get(session.sessionId);
				wrapper?.openChat(chat);
			}
			wrapper?.setActiveChat(chat);
			if (wrapper && activeChild) {
				this._setActiveSession(wrapper, this._activePreserveFocus.get(), tx);
			}
		});
	}

	/** The chat the session's view last fell back from because the session stopped listing it; see {@link SessionSlotState.chatFallenBackFrom}. */
	getChatFallenBackFrom(session: ISession): URI | undefined {
		return this._wrappers.get(session.sessionId)?.chatFallenBackFrom;
	}

	/**
	 * Close (hide from the tab strip) the given chat in the session's slot state.
	 * No-op if the session is not currently tracked in the visibility model.
	 */
	closeChat(session: ISession, chat: IChat): void {
		this.attachChat(session, chat.resource);
		this._wrappers.get(session.sessionId)?.closeChat(chat);
	}

	/**
	 * Open (un-hide from the tab strip) a previously closed chat in the session's
	 * slot state. No-op if the session is not currently tracked in the visibility model.
	 */
	openChat(session: ISession, chat: IChat): void {
		this._wrappers.get(session.sessionId)?.openChat(chat);
	}

	/**
	 * Replace the given session in the visibility model with `updatedSession`,
	 * preserving the grid slot, sticky state, and active state. The slot state
	 * for the old session is disposed; a fresh slot state is created for the
	 * updated session. No-op if `session` is not currently in the grid.
	 */
	updateSession(session: ISession, updatedSession: ISession, preserveFocus = false): void {
		const fromId = session.sessionId;
		const rootVisible = this._visibleList.includes(fromId);
		if (!rootVisible && ![...this._detached.values()].some(entry => entry.state.sessionId === fromId)) {
			return;
		}

		const previousActive = this._activeSession.get();
		const wasActive = previousActive?.sessionId === fromId;
		const detached = [...this._detached].filter(([, entry]) => entry.state.sessionId === fromId);
		this.replaceId(fromId, updatedSession.sessionId);
		// `replaceId` is a no-op when ids match — dispose the old slot state
		// directly so a fresh one is created against `updatedSession`.
		if (fromId === updatedSession.sessionId && this._wrappers.has(fromId)) {
			this._wrappers.deleteAndDispose(fromId);
		}

		transaction((tsx) => {
			const visibleSession = rootVisible ? this._getOrCreateVisibleSession(updatedSession) : undefined;
			for (const [key, entry] of detached) {
				this._detached.delete(key);
				this._detachedDisposables.deleteAndDispose(key);
				const chat = updatedSession.chats.get().find(chat => chat.resource.toString() === key);
				if (chat) {
					this.moveChatToGrid(updatedSession, chat, entry.slot.placement?.reference ?? this.getRenderedGridSlots()[0]?.id ?? entry.slot.id,
						entry.slot.placement?.direction ?? Direction.Right, entry.slot.id, tsx);
				}
			}
			this._updateDetachedChats(updatedSession.sessionId, tsx);
			if (wasActive) {
				const previousChat = detachedChatOf(previousActive);
				const activePane = previousChat && this._detached.get(previousChat.toString())?.state;
				const firstRoot = this._visibleList[0];
				this._setActiveSession(activePane || visibleSession || this._detached.values().next().value?.state
					|| (firstRoot === undefined ? undefined : this._wrappers.get(firstRoot)), preserveFocus, tsx);
			} else if (detached.length) {
				this._setActiveSession(previousActive, preserveFocus, tsx);
			}
			this._refresh(tsx);
		});
	}

	/**
	 * Rename a session id in the visibility model so the same grid slot is
	 * reused for the replacement. The old slot state is disposed; a fresh one is
	 * created lazily on next access. Does not auto-refresh — callers should
	 * call {@link refresh} or {@link setActive} as appropriate.
	 */
	replaceId(fromId: string, toId: string): void {
		if (fromId === toId) {
			return;
		}
		const idx = this._visibleList.indexOf(fromId);
		if (idx >= 0) {
			this.transferGridSlot(fromId, toId);
			this._visibleList.splice(idx, 1, toId);
		}
		if (this._stickyIds.delete(fromId)) {
			this._stickyIds.add(toId);
		}
		if (this._mostRecentNonStickySlot === fromId) {
			this._mostRecentNonStickySlot = toId;
		}
		if (this._wrappers.has(fromId)) {
			this._wrappers.deleteAndDispose(fromId);
		}
	}

	/** Re-publish the visible sessions and sticky ids observables. */
	refresh(): void {
		this._refresh(undefined);
	}

	private _findLastNonSticky(): string | undefined | typeof NO_RECENT {
		for (let i = this._visibleList.length - 1; i >= 0; i--) {
			const sid = this._visibleList[i];
			if (!this._isStickySlot(sid)) {
				return sid;
			}
		}
		return NO_RECENT;
	}

	/** True if the given slot id refers to a sticky session. The empty slot is never sticky. */
	private _isStickySlot(id: string | undefined): boolean {
		return id !== undefined && this._stickyIds.has(id);
	}

	/**
	 * Returns the slot id of the currently active entry in the grid, or
	 * {@link NO_RECENT} if no entry in the grid is active.
	 */
	private _currentActiveSlot(): string | undefined | typeof NO_RECENT {
		const active = this._activeSession.get();
		const activeId = active?.sessionId;
		if (activeId !== undefined) {
			return this._visibleList.includes(activeId) ? activeId : NO_RECENT;
		}
		return this._visibleList.includes(undefined) ? undefined : NO_RECENT;
	}

	private _removeFromModel(sessionId: string | undefined, preserveDetached: boolean): boolean {
		let changed = false;
		for (const [key, entry] of this._detached) {
			if (entry.state.sessionId === sessionId && !preserveDetached) {
				this._detached.delete(key);
				this._detachedDisposables.deleteAndDispose(key);
				changed = true;
			}
		}
		const idx = this._visibleList.indexOf(sessionId);
		if (idx >= 0) {
			this._visibleList.splice(idx, 1);
			changed = true;
		}
		if (sessionId !== undefined && this._stickyIds.delete(sessionId)) {
			changed = true;
		}
		if (this._mostRecentNonStickySlot === sessionId) {
			this._mostRecentNonStickySlot = this._findLastNonSticky();
			changed = true;
		}
		if (sessionId !== undefined && this._wrappers.has(sessionId)) {
			this._wrappers.deleteAndDispose(sessionId);
			changed = true;
		}
		return changed;
	}

	private _refresh(tsx: ITransaction | undefined): void {
		const ids = this._visibleList.length ? this._visibleList : this._detached.size ? [] : [undefined];
		for (const id of this._gridSlots.keys()) {
			if (!ids.includes(id)) {
				this._gridSlots.delete(id);
			}
		}
		this.getGridSlots();
		const wrappers: (SessionSlotState | undefined)[] = [];
		for (const id of this._visibleList) {
			if (id === undefined) {
				wrappers.push(undefined);
				continue;
			}
			const visibleSession = this._wrappers.get(id);
			if (visibleSession) {
				visibleSession.setSticky(this._stickyIds.has(id));
				wrappers.push(visibleSession);
			}
		}
		this._slotSessions.set(wrappers.map(wrapper => wrapper?.session), tsx);
		this._gridSessions.set([...wrappers, ...[...this._detached.values()].map(entry => entry.state)], tsx);
		this._updatePanes(tsx);
	}

	/**
	 * Gives each grid slot its pane, in the same transaction as the sessions the grid shows: a slot keeps its pane, which shows
	 * the state of the session incarnation the slot now shows.
	 */
	private _updatePanes(tsx: ITransaction | undefined): void {
		// The session ids of the slots of `getGridSlots`, in order.
		const roots = !this._visibleList.length && this._detached.size ? [] : this._visibleList.length ? this._visibleList : [undefined];
		const entries: { readonly id: string; readonly kind: SessionGridPaneKind; readonly state: IPaneState | undefined }[] = [
			...this.getGridSlots().map((slot, index) => ({ id: slot.id, kind: SessionGridPaneKind.Slot, state: roots[index] === undefined ? undefined : this._wrappers.get(roots[index]) })),
			...[...this._detached.values()].map(entry => ({ id: entry.slot.id, kind: SessionGridPaneKind.Detached, state: entry.state })),
		];
		const panes = entries.map(({ id, kind, state }) => {
			let pane = this._panesById.get(id);
			if (!pane || pane.kind !== kind) {
				pane = new SessionGridPane(id, kind);
				this._panesById.set(id, pane);
			}
			pane.setState(state, tsx);
			return pane;
		});
		for (const id of [...this._panesById.keys()]) {
			if (!panes.some(pane => pane.id === id)) {
				this._panesById.delete(id);
			}
		}
		this._panes.set(panes, tsx);
	}

	/** The pane of the grid slot `id`. */
	getPane(id: string, reader?: IReader): ISessionGridPane | undefined {
		return this._panes.read(reader).find(pane => pane.id === id);
	}

	private _getOrCreateVisibleSession(session: ISession): SessionSlotState {
		let visibleSession = this._wrappers.get(session.sessionId);
		if (visibleSession) {
			return visibleSession;
		}

		const initialChat = this._resolveInitialChat(session);
		visibleSession = new SessionSlotState(
			session,
			initialChat,
			this._resolveInitialClosedChats(session),
			this._resolveInitialShownRelatedChats(session),
		);
		const visibleSessionRef = visibleSession;

		// Track chat list changes — if the active chat is removed, fall back to the last visible tab.
		visibleSession.addDisposable(autorun(reader => {
			const chats = session.chats.read(reader);
			const activeChat = visibleSessionRef.activeChat.read(reader);
			if (activeChat && !chats.some(c => this._uriIdentityService.extUri.isEqual(c.resource, activeChat.resource))) {
				const visibleChatTabs = visibleSessionRef.visibleChatTabs.read(reader);
				const fallback = visibleChatTabs[visibleChatTabs.length - 1] ?? session.mainChat.read(reader);
				if (fallback) {
					visibleSessionRef.fallBack(activeChat.resource, fallback);
				}
			}
		}));

		this._wrappers.set(session.sessionId, visibleSession);
		this._updateDetachedChats(session.sessionId);
		this._updateWindowChats(session.sessionId);
		return visibleSession;
	}
}
