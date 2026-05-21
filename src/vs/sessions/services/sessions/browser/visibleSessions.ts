/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, IDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, ISettableObservable, autorun, observableValue } from '../../../../base/common/observable.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IAgentSessionsService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { IActiveSession } from '../common/sessionsManagement.js';
import { IChat, ISession } from '../common/session.js';

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
export class ActiveSession extends Disposable implements IActiveSession {

	private readonly _isCreated = observableValue<boolean>('activeSessionIsCreated', true);
	readonly isCreated: IObservable<boolean> = this._isCreated;

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
	}

	setActiveChat(chat: IChat): void {
		this._activeChat.set(chat, undefined);
	}

	setIsCreated(value: boolean): void {
		this._isCreated.set(value, undefined);
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
	get deduplicationKey() { return this._session.deduplicationKey; }
}

/**
 * Encapsulates the visibility model used by the
 * {@link SessionsManagementService}.
 *
 * The model tracks:
 * - The currently active session.
 * - An ordered list of sessions to display in the sessions part's grid.
 * - A "sticky" set: sessions the user has explicitly pinned. Non-sticky
 *   sessions also live in the grid but get replaced when new sessions open.
 *
 * Each tracked session has a single {@link ActiveSession} wrapper owned by
 * this class. Wrappers are disposed automatically when their session leaves
 * the visibility model.
 */
export class VisibleSessions extends Disposable {

	private readonly _activeSession = observableValue<IActiveSession | undefined>(this, undefined);
	readonly activeSession: IObservable<IActiveSession | undefined> = this._activeSession;

	private readonly _visibleSessions = observableValue<readonly IActiveSession[]>(this, []);
	readonly visibleSessions: IObservable<readonly IActiveSession[]> = this._visibleSessions;

	private readonly _wrappers = this._register(new DisposableMap<string, ActiveSession>());
	/** Ordered session ids in the grid (left-to-right). */
	private _visibleList: string[] = [];
	/** Subset of {@link _visibleList} the user has marked sticky. */
	private readonly _stickyIds = new Set<string>();
	/**
	 * Id of the most recently opened (or toggled-to-non-sticky) session in the
	 * grid. Used to choose which non-sticky slot to replace when opening a new
	 * session while the active one is sticky.
	 */
	private _mostRecentNonStickyId: string | undefined;

	constructor(
		private readonly _resolveInitialChat: (session: ISession) => IChat,
		private readonly _uriIdentityService: IUriIdentityService,
		private readonly _agentSessionsService: IAgentSessionsService,
	) {
		super();
	}

	/**
	 * Set the active session, updating the visibility model accordingly.
	 *
	 * - Passing `undefined` only clears the active observable; the grid is
	 *   left intact so non-sticky sessions remain visible.
	 * - If the session is already in the grid, its slot is preserved and only
	 *   the active observable is updated.
	 * - Otherwise the session is placed as non-sticky:
	 *   - If the active session is non-sticky, the new one replaces it in
	 *     place.
	 *   - Else if a non-sticky session exists, the most-recently opened
	 *     non-sticky is replaced.
	 *   - Else the session is appended at the end of the grid.
	 *
	 * Returns the wrapper for the active session, or `undefined` if cleared.
	 */
	setActive(session: ISession | undefined): ActiveSession | undefined {
		if (!session) {
			this._activeSession.set(undefined, undefined);
			return undefined;
		}

		const id = session.sessionId;
		if (!this._visibleList.includes(id)) {
			const activeId = this._activeSession.get()?.sessionId;
			const activeIsNonSticky = activeId !== undefined
				&& this._visibleList.includes(activeId)
				&& !this._stickyIds.has(activeId);

			let replaceId: string | undefined;
			if (activeIsNonSticky) {
				replaceId = activeId;
			} else if (this._mostRecentNonStickyId !== undefined
				&& this._visibleList.includes(this._mostRecentNonStickyId)
				&& !this._stickyIds.has(this._mostRecentNonStickyId)) {
				replaceId = this._mostRecentNonStickyId;
			} else {
				replaceId = this._findLastNonSticky();
			}

			if (replaceId !== undefined) {
				const idx = this._visibleList.indexOf(replaceId);
				this._visibleList.splice(idx, 1, id);
				this._wrappers.deleteAndDispose(replaceId);
			} else {
				this._visibleList.push(id);
			}
			this._mostRecentNonStickyId = id;
		}

		const wrapper = this._getOrCreateWrapper(session);
		this._activeSession.set(wrapper, undefined);
		this._refresh();
		return wrapper;
	}

	/**
	 * Insert (or move) a session into the grid positioned next to a target
	 * session that is already visible. Used by drag-and-drop and by
	 * "open at position" entry points.
	 *
	 * - If the session is not yet visible, a new non-sticky entry is created
	 *   at the computed position.
	 * - If the session is already visible, it is moved to the computed
	 *   position; its sticky / non-sticky state is preserved.
	 *
	 * No-op if `targetSessionId` is not currently visible.
	 */
	insertAt(session: ISession, targetSessionId: string, side: 'left' | 'right'): void {
		const id = session.sessionId;
		const targetIdx = this._visibleList.indexOf(targetSessionId);
		if (targetIdx < 0) {
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
			if (!this._stickyIds.has(id)) {
				this._mostRecentNonStickyId = id;
			}
		} else {
			this._getOrCreateWrapper(session);
			this._visibleList.splice(destIdx, 0, id);
			this._mostRecentNonStickyId = id;
		}

		this._refresh();
	}

	/**
	 * Toggle a session's stickiness in the grid. The session keeps its grid
	 * slot when toggled.
	 * - If the session is not currently visible, it is appended at the end as
	 *   sticky.
	 */
	toggleStickiness(session: ISession): void {
		const id = session.sessionId;
		if (!this._visibleList.includes(id)) {
			this._stickyIds.add(id);
			this._getOrCreateWrapper(session);
			this._visibleList.push(id);
		} else if (this._stickyIds.has(id)) {
			this._stickyIds.delete(id);
			this._mostRecentNonStickyId = id;
		} else {
			this._stickyIds.add(id);
			if (this._mostRecentNonStickyId === id) {
				this._mostRecentNonStickyId = this._findLastNonSticky();
			}
		}
		this._refresh();
	}

	/**
	 * Remove the given session ids from the visibility model and dispose their
	 * wrappers. Clears the active observable if the active session is among
	 * the removed ids. Observables are refreshed once if anything changed.
	 */
	removeMany(sessionIds: Iterable<string>): void {
		let changed = false;
		const activeId = this._activeSession.get()?.sessionId;
		let activeRemoved = false;
		for (const id of sessionIds) {
			if (this._removeFromModel(id)) {
				changed = true;
				if (id === activeId) {
					activeRemoved = true;
				}
			}
		}
		if (activeRemoved) {
			this._activeSession.set(undefined, undefined);
		}
		if (changed) {
			this._refresh();
		}
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
		if (this._mostRecentNonStickyId === fromId) {
			this._mostRecentNonStickyId = toId;
		}
		if (this._wrappers.has(fromId)) {
			this._wrappers.deleteAndDispose(fromId);
		}
	}

	/** Re-publish the visible sessions and sticky ids observables. */
	refresh(): void {
		this._refresh();
	}

	private _findLastNonSticky(): string | undefined {
		for (let i = this._visibleList.length - 1; i >= 0; i--) {
			const sid = this._visibleList[i];
			if (!this._stickyIds.has(sid)) {
				return sid;
			}
		}
		return undefined;
	}

	private _removeFromModel(sessionId: string): boolean {
		let changed = false;
		const idx = this._visibleList.indexOf(sessionId);
		if (idx >= 0) {
			this._visibleList.splice(idx, 1);
			changed = true;
		}
		if (this._stickyIds.delete(sessionId)) {
			changed = true;
		}
		if (this._mostRecentNonStickyId === sessionId) {
			this._mostRecentNonStickyId = this._findLastNonSticky();
			changed = true;
		}
		if (this._wrappers.has(sessionId)) {
			this._wrappers.deleteAndDispose(sessionId);
			changed = true;
		}
		return changed;
	}

	private _refresh(): void {
		const wrappers: IActiveSession[] = [];
		for (const id of this._visibleList) {
			const wrapper = this._wrappers.get(id);
			if (wrapper) {
				wrapper.setSticky(this._stickyIds.has(id));
				wrappers.push(wrapper);
			}
		}
		this._visibleSessions.set(wrappers, undefined);
	}

	private _getOrCreateWrapper(session: ISession): ActiveSession {
		let wrapper = this._wrappers.get(session.sessionId);
		if (wrapper) {
			return wrapper;
		}

		const initialChat = this._resolveInitialChat(session);
		wrapper = new ActiveSession(session, initialChat);

		// Trigger lazy resolve for expensive session properties (e.g. changes,
		// badge). Per-wrapper so visible-but-not-active sessions also have their
		// data populated for rendering in the grid.
		let observedSession = false;
		const wrapperRef = wrapper;
		wrapper.addDisposable(autorun(reader => {
			if (observedSession || session.loading.read(reader)) {
				return;
			}
			observedSession = true;
			this._agentSessionsService.model.observeSession(session.resource);
		}));

		// Track chat list changes — if the active chat is removed, fall back to last.
		wrapper.addDisposable(autorun(reader => {
			const chats = session.chats.read(reader);
			const activeChat = wrapperRef.activeChat.read(reader);
			if (activeChat && !chats.some(c => this._uriIdentityService.extUri.isEqual(c.resource, activeChat.resource))) {
				const fallback = chats[chats.length - 1] ?? session.mainChat;
				if (fallback) {
					wrapperRef.setActiveChat(fallback);
				}
			}
		}));

		this._wrappers.set(session.sessionId, wrapper);
		return wrapper;
	}
}
