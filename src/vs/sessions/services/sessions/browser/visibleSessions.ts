/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, IDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, ISettableObservable, ITransaction, autorun, observableValue, transaction } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IActiveSession } from '../common/sessionsManagement.js';
import { IChat, ISession, SessionStatus } from '../common/session.js';

/**
 * Wraps an {@link ISession} with an active chat observable to form an
 * {@link IActiveSession}. Delegates all {@link ISession} property accesses
 * to the wrapped session so the active session always reflects the latest
 * session state without a stale shallow copy.
 *
 * One instance exists per session currently in the visibility model
 * (active, transient, or sticky). Each instance owns its own active-chat
 * observable so visible-but-not-active sessions retain their per-session
 * chat selection.
 */
export class VisibleSession extends Disposable implements IActiveSession {

	private readonly _isCreated;
	readonly isCreated: IObservable<boolean>;

	private readonly _sticky = observableValue<boolean>('activeSessionSticky', false);
	readonly sticky: IObservable<boolean> = this._sticky;

	private readonly _activeChat: ISettableObservable<IChat>;
	readonly activeChat: IObservable<IChat>;

	constructor(
		private readonly _session: ISession,
		initialChat: IChat,
	) {
		super();
		this._activeChat = observableValue<IChat>(`activeChat-${_session.sessionId}`, initialChat);
		this.activeChat = this._activeChat;

		this._isCreated = _session.status.map(status => status !== SessionStatus.Untitled);
		this.isCreated = this._isCreated;
	}

	setActiveChat(chat: IChat): void {
		this._activeChat.set(chat, undefined);
	}

	setSticky(value: boolean): void {
		this._sticky.set(value, undefined);
	}

	/** Register a disposable that lives as long as this wrapper. */
	addDisposable(disposable: IDisposable): IDisposable {
		return this._register(disposable);
	}

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
}

/**
 * Lightweight {@link ISession} adapter that delegates every property to a
 * wrapped session but exposes a different {@link ISession.resource} value.
 *
 * Used as a transient session instance during the create-chat / send-request
 * transition, so the visibility model can reflect the new chat resource on
 * the same grid slot before the provider has produced a final session.
 */
class ResourceOverrideSession implements ISession {

	constructor(
		private readonly _session: ISession,
		readonly resource: URI,
	) { }

	get sessionId() { return this._session.sessionId; }
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
 * Each tracked session has a single {@link VisibleSession} wrapper owned by
 * this class. Wrappers are disposed automatically when their session leaves
 * the visibility model.
 */
export class VisibleSessions extends Disposable {

	private readonly _activeSession = observableValue<IActiveSession | undefined>(this, undefined);
	readonly activeSession: IObservable<IActiveSession | undefined> = this._activeSession;

	/**
	 * Whether the most recent active-session change asked to preserve keyboard
	 * focus (i.e. show the session without moving focus into it). Always set in
	 * the **same transaction** as {@link _activeSession} via
	 * {@link _setActiveSession} so the pair can never go stale, and read
	 * reactively by the consumer that drives focus.
	 */
	private readonly _activePreserveFocus = observableValue<boolean>(this, false);
	readonly activePreserveFocus: IObservable<boolean> = this._activePreserveFocus;

	private readonly _visibleSessions = observableValue<readonly (IActiveSession | undefined)[]>(this, [undefined]);
	readonly visibleSessions: IObservable<readonly (IActiveSession | undefined)[]> = this._visibleSessions;

	private readonly _wrappers = this._register(new DisposableMap<string, VisibleSession>());
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

	constructor(
		private readonly _resolveInitialChat: (session: ISession) => IChat,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService,
	) {
		super();
	}

	/**
	 * Set the active session together with its preserve-focus intent in a
	 * single transaction. Routing every active-session change through here
	 * guarantees the two observables are always consistent and that the intent
	 * never goes stale (callers that do not preserve focus pass `false`).
	 */
	private _setActiveSession(session: IActiveSession | undefined, preserveFocus: boolean, tsx: ITransaction): void {
		this._activeSession.set(session, tsx);
		this._activePreserveFocus.set(preserveFocus, tsx);
	}

	/**
	 * Set the active session, updating the visibility model accordingly.
	 *
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
	 *
	 * Returns the wrapper for the active session, or `undefined` when the
	 * active slot is the empty slot.
	 */
	setActive(session: ISession | undefined, preserveFocus: boolean = false): VisibleSession | undefined {
		const targetId: string | undefined = session?.sessionId;

		if (!this._visibleList.includes(targetId)) {
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
				const idx = this._visibleList.indexOf(replaceSlot);
				this._visibleList.splice(idx, 1, targetId);
				if (replaceSlot !== undefined) {
					this._wrappers.deleteAndDispose(replaceSlot);
				}
			} else {
				this._visibleList.push(targetId);
			}
			this._mostRecentNonStickySlot = targetId;
		}

		const visibleSession = session ? this._getOrCreateVisibleSession(session) : undefined;
		transaction((tsx) => {
			this._setActiveSession(visibleSession, preserveFocus, tsx);
			this._refresh(tsx);
		});
		return visibleSession;
	}

	/**
	 * Insert (or move) a slot into the grid positioned next to a target
	 * session that is already visible. Used by drag-and-drop and by
	 * "open at position" entry points.
	 *
	 * - If the slot is not yet visible, a new non-sticky entry is created
	 *   at the computed position. For an `undefined` session (empty slot),
	 *   this is a no-op when an empty slot already exists in the grid.
	 * - If the slot is already visible, it is moved to the computed
	 *   position; its sticky / non-sticky state is preserved.
	 *
	 * When `activate` is `true` (default), the inserted slot also becomes
	 * the active session. When `false`, the active session is left
	 * unchanged.
	 *
	 * `targetSessionId` may be `undefined` to position relative to the empty
	 * (new-session) slot. No-op if the target slot is not currently visible.
	 */
	insertAt(session: ISession | undefined, targetSessionId: string | undefined, side: 'left' | 'right', activate: boolean = true): void {
		const id: string | undefined = session?.sessionId;
		const targetIdx = this._visibleList.indexOf(targetSessionId);
		if (targetIdx < 0) {
			return;
		}

		// Invariant: at most one empty slot. If inserting the empty slot and
		// one already exists, do not add or move another.
		if (id === undefined && this._visibleList.includes(undefined)) {
			return;
		}

		let destIdx = side === 'left' ? targetIdx : targetIdx + 1;

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
	 * Any wrappers for sessions no longer present in the snapshot are disposed.
	 *
	 * @param slots Ordered grid slots to restore.
	 * @param activeIndex Index into `slots` of the slot that should be active,
	 * or `-1` for none.
	 */
	restoreGrid(slots: ReadonlyArray<{ readonly session: ISession | undefined; readonly sticky: boolean }>, activeIndex: number): void {
		this._visibleList = [];
		this._stickyIds.clear();

		let activeWrapper: VisibleSession | undefined;
		let lastNonStickySlot: string | undefined | typeof NO_RECENT = NO_RECENT;
		for (let i = 0; i < slots.length; i++) {
			const { session, sticky } = slots[i];
			const id = session?.sessionId;
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

		// Dispose wrappers for sessions that are no longer part of the grid so
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

		transaction(tsx => {
			this._setActiveSession(activeWrapper, false, tsx);
			this._refresh(tsx);
		});
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
	 * Remove the given session ids from the visibility model and dispose their
	 * wrappers. Passing `undefined` removes the empty (new-session) slot if
	 * present. If the active slot is among the removed entries, the active
	 * observable falls back to the slot at the active's original position
	 * (or the slot to its left if it was at the end of the grid); when no
	 * visible slot remains, the active observable is cleared. Observables
	 * are refreshed once if anything changed.
	 */
	removeMany(sessionIds: Iterable<string | undefined>): void {
		transaction((tsx) => {
			let changed = false;
			const activeId = this._activeSession.get()?.sessionId;
			// activeSession.get() is undefined both when the empty slot is active
			// and when no slot is active; disambiguate via the visible list.
			const emptySlotIsActive = activeId === undefined && this._visibleList.includes(undefined);
			const activeSlotId = emptySlotIsActive ? undefined : activeId;
			const activeIdx = activeId !== undefined || emptySlotIsActive
				? this._visibleList.indexOf(activeSlotId)
				: -1;
			let activeRemoved = false;
			for (const id of sessionIds) {
				if (this._removeFromModel(id)) {
					changed = true;
					if (id === undefined ? emptySlotIsActive : id === activeId) {
						activeRemoved = true;
					}
				}
			}
			if (activeRemoved) {
				if (this._visibleList.length === 0) {
					this._setActiveSession(undefined, false, tsx);
				} else {
					const fallbackIdx = Math.max(0, Math.min(activeIdx - 1, this._visibleList.length - 1));
					const fallbackId = this._visibleList[fallbackIdx];
					const fallbackWrapper = fallbackId !== undefined ? this._wrappers.get(fallbackId) : undefined;
					this._setActiveSession(fallbackWrapper, false, tsx);
				}
			}
			if (changed) {
				this._refresh(tsx);
			}
		});
	}

	/**
	 * Set the active chat for the given session's wrapper. No-op if the
	 * session is not currently tracked in the visibility model.
	 */
	setActiveChat(session: ISession, chat: IChat): void {
		this._wrappers.get(session.sessionId)?.setActiveChat(chat);
	}

	/**
	 * Replace the given session in the visibility model with `updatedSession`,
	 * preserving the grid slot, sticky state, and active state. The wrapper
	 * for the old session is disposed; a fresh wrapper is created for the
	 * updated session. No-op if `session` is not currently in the grid.
	 */
	updateSession(session: ISession, updatedSession: ISession): void {
		const fromId = session.sessionId;
		if (!this._visibleList.includes(fromId)) {
			return;
		}

		const wasActive = this._activeSession.get()?.sessionId === fromId;
		this.replaceId(fromId, updatedSession.sessionId);
		// `replaceId` is a no-op when ids match — dispose the old wrapper
		// directly so a fresh one is created against `updatedSession`.
		if (fromId === updatedSession.sessionId && this._wrappers.has(fromId)) {
			this._wrappers.deleteAndDispose(fromId);
		}

		transaction((tsx) => {
			const visibleSession = this._getOrCreateVisibleSession(updatedSession);
			if (wasActive) {
				this._setActiveSession(visibleSession, false, tsx);
			}
			this._refresh(tsx);
		});
	}

	/**
	 * Create a transient {@link ISession} that mirrors the given session but
	 * exposes a different {@link ISession.resource}. The visibility model's
	 * wrapper for the same session id is rebuilt against this transient
	 * session so consumers observe the new resource. Returns the transient
	 * session so callers can pass it to a subsequent {@link updateSession}
	 * once the provider produces the final session.
	 *
	 * No-op (but still returns the transient session) if the session is not
	 * currently in the grid.
	 */
	updateResourceOfSession(session: ISession, resource: URI): ISession {
		const tmpSession = new ResourceOverrideSession(session, resource);
		this.updateSession(session, tmpSession);
		return tmpSession;
	}

	/**
	 * Rename a session id in the visibility model so the same grid slot is
	 * reused for the replacement. The old wrapper is disposed; a fresh one is
	 * created lazily on next access. Does not auto-refresh — callers should
	 * call {@link refresh} or {@link setActive} as appropriate.
	 */
	replaceId(fromId: string, toId: string): void {
		if (fromId === toId) {
			return;
		}
		const idx = this._visibleList.indexOf(fromId);
		if (idx >= 0) {
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
		const activeId = this._activeSession.get()?.sessionId;
		if (activeId !== undefined) {
			return this._visibleList.includes(activeId) ? activeId : NO_RECENT;
		}
		return this._visibleList.includes(undefined) ? undefined : NO_RECENT;
	}

	private _removeFromModel(sessionId: string | undefined): boolean {
		let changed = false;
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
		const wrappers: (IActiveSession | undefined)[] = [];
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
		this._visibleSessions.set(wrappers, tsx);
	}

	private _getOrCreateVisibleSession(session: ISession): VisibleSession {
		let visibleSession = this._wrappers.get(session.sessionId);
		if (visibleSession) {
			return visibleSession;
		}

		const initialChat = this._resolveInitialChat(session);
		visibleSession = new VisibleSession(session, initialChat);
		const visibleSessionRef = visibleSession;

		// Track chat list changes — if the active chat is removed, fall back to last.
		visibleSession.addDisposable(autorun(reader => {
			const chats = session.chats.read(reader);
			const activeChat = visibleSessionRef.activeChat.read(reader);
			if (activeChat && !chats.some(c => this._uriIdentityService.extUri.isEqual(c.resource, activeChat.resource))) {
				const fallback = chats[chats.length - 1] ?? session.mainChat;
				if (fallback) {
					visibleSessionRef.setActiveChat(fallback);
				}
			}
		}));

		this._wrappers.set(session.sessionId, visibleSession);
		return visibleSession;
	}
}
