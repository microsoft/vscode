/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, ISettableObservable, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { SessionsHasClosedItemContext } from '../../../common/contextkeys.js';
import { ISession, SessionStatus } from '../common/session.js';
import { ISessionsManagementService } from '../common/sessionsManagement.js';
import { ISessionsPartService } from './sessionsPartService.js';
import { VisibleSessions } from './visibleSessions.js';

export const enum ClosedItemKind {
	Chat = 'chat',
	Session = 'session',
}

/** A chat tab that was closed (hidden) within a session. */
export interface IClosedChatItem {
	readonly kind: ClosedItemKind.Chat;
	readonly session: ISession;
	readonly chatResource: URI;
}

/** A session slot that left the sessions grid. */
export interface IClosedSessionItem {
	readonly kind: ClosedItemKind.Session;
	readonly session: ISession;
	/** Grid index the slot occupied when the session left the grid. */
	readonly index: number;
	readonly sticky: boolean;
	/**
	 * Set when the session left the grid because a newly opened slot took its
	 * place, holding the id of that slot (`undefined` for the empty
	 * new-session slot). Absent when the user closed the slot explicitly.
	 */
	readonly replacedBy?: { readonly sessionId: string | undefined };
}

export type ClosedItem = IClosedChatItem | IClosedSessionItem;

/**
 * Remembers the single most recently closed chat or session and reopens it
 * (`Ctrl/Cmd+Shift+T`). Deliberately holds one entry only: reopening consumes
 * it, so pressing the chord repeatedly cannot walk further back through
 * history. In-memory only — a window reload starts empty.
 */
export class ClosedItemHistory extends Disposable {

	private readonly _item: ISettableObservable<ClosedItem | undefined> = observableValue(this, undefined);

	private _suspendDepth = 0;

	constructor(
		private readonly _visibility: VisibleSessions,
		private readonly _openChat: (session: ISession, chatResource: URI) => Promise<void>,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsPartService private readonly _sessionsPartService: ISessionsPartService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		const hasClosedItem = SessionsHasClosedItemContext.bindTo(contextKeyService);
		this._register(autorun(reader => hasClosedItem.set(this._item.read(reader) !== undefined)));

		// A deleted session has nothing left to reopen.
		this._register(this._sessionsManagementService.onDidDeleteSession(session => {
			if (this._item.get()?.session.sessionId === session.sessionId) {
				this._item.set(undefined, undefined);
			}
		}));
	}

	/** Remember a chat that was hidden from its session's tab strip. */
	recordClosedChat(session: ISession, chatResource: URI): void {
		this._record({ kind: ClosedItemKind.Chat, session, chatResource });
	}

	/**
	 * Remember a session the user closed, together with the grid slot it holds
	 * right now, so it can return to exactly that position. Must be called
	 * before the session leaves the grid; a session that is not visible is
	 * ignored.
	 */
	recordClosedSession(session: ISession): void {
		const slot = this._visibility.getSlot(session.sessionId);
		if (slot) {
			this._recordSession(session, slot.index, slot.sticky);
		}
	}

	/**
	 * Remember a session that lost its grid slot to a newly opened one, so it
	 * can take that slot back.
	 */
	recordReplacedSlot(replaced: ISession, index: number, sticky: boolean, replacedBySessionId: string | undefined): void {
		this._recordSession(replaced, index, sticky, { sessionId: replacedBySessionId });
	}

	/**
	 * Reopen the remembered chat or session and focus it, consuming the entry.
	 * No-op when nothing is remembered or the session is gone.
	 */
	async reopenLast(): Promise<void> {
		const item = this._item.get();
		if (!item) {
			return;
		}
		// Consume up front: a stale entry must not survive a failed reopen, or
		// the command would stay enabled while permanently doing nothing.
		this._item.set(undefined, undefined);

		// The recorded session may be a wrapper that was disposed along with its
		// grid slot, and a provider can drop it from its catalog without ever
		// firing `onDidDeleteSession`.
		const session = this._sessionsManagementService.getSessions().find(s => s.sessionId === item.session.sessionId);
		if (!session) {
			return;
		}

		// Reopening re-activates sessions and can evict grid slots itself; keep
		// its own side effects out of the history.
		const suspension = this._suspend();
		try {
			if (item.kind === ClosedItemKind.Chat) {
				await this._openChat(session, item.chatResource);
			} else {
				this._reopenSession(item, session);
			}
		} finally {
			suspension.dispose();
		}

		this._sessionsPartService.focusSession(this._visibility.activeSession.get());
	}

	private _reopenSession(item: IClosedSessionItem, session: ISession): void {
		// A session pushed out by a newly opened slot takes that slot back, so
		// the grid returns to what it looked like before. If the replacement has
		// meanwhile moved or left the grid, fall back to the recorded index.
		if (item.replacedBy && this._visibility.getSlot(item.replacedBy.sessionId)) {
			this._sessionsManagementService.discardNewSession(this._visibility.getSession(item.replacedBy.sessionId));
			if (this._visibility.replaceSlot(item.replacedBy.sessionId, session, item.sticky)) {
				return;
			}
		}

		this._visibility.insertAtIndex(session, item.index, item.sticky);
	}

	private _recordSession(session: ISession, index: number, sticky: boolean, replacedBy?: { readonly sessionId: string | undefined }): void {
		// An untitled draft is discarded rather than hidden when it leaves the
		// grid, so there is nothing meaningful to restore.
		if (session.status.get() !== SessionStatus.Untitled) {
			this._record({ kind: ClosedItemKind.Session, session, index, sticky, replacedBy });
		}
	}

	private _record(item: ClosedItem): void {
		if (this._suspendDepth === 0) {
			this._item.set(item, undefined);
		}
	}

	private _suspend(): IDisposable {
		this._suspendDepth++;
		return toDisposable(() => this._suspendDepth--);
	}
}
