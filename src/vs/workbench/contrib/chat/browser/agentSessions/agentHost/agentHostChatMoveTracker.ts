/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableMap, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, IReader } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';

/** One end of a chat move: the session and the chat's resource in it. */
export interface IAgentHostChatMoveEnd<T> {
	readonly session: T;
	readonly chat: URI;
}

/** A chat that moved from one session to another, or became the main chat of a new session. */
export interface IAgentHostChatMove<T> {
	readonly from: IAgentHostChatMoveEnd<T>;
	readonly to: IAgentHostChatMoveEnd<T>;
}

interface IPendingMoveEnd<T> extends IAgentHostChatMoveEnd<T> {
	readonly kind: 'removed' | 'added';
}

/**
 * Recognizes chat moves from the catalogs of the sessions it is told about. A
 * host moves a chat by removing it from one session and adding it to another
 * (or making it a new session's main chat); a client may learn of the two
 * catalogs in either order. A backend chat that leaves one session and appears
 * in another moved; one that only leaves was deleted. The ends are paired by
 * the backend chat, never by parsing its URI.
 *
 * A session's catalog maps each backend chat it lists to the chat's resource
 * in that session.
 */
export class AgentHostChatMoveTracker<T extends { readonly resource: URI }> extends Disposable {

	/** How long a chat that left a session waits for another session to list it, and vice versa. */
	static readonly PAIRING_WINDOW_MS = 10_000;

	private readonly _onDidMoveChat = this._register(new Emitter<IAgentHostChatMove<T>>());
	readonly onDidMoveChat: Event<IAgentHostChatMove<T>> = this._onDidMoveChat.event;

	private readonly _catalogs = new Map<string, { readonly session: T; readonly chats: ReadonlyMap<string, URI> }>();
	private readonly _tracked = this._register(new DisposableMap<T, IDisposable>());
	private readonly _pending = new Map<string, IPendingMoveEnd<T>>();
	private readonly _pendingTimeouts = this._register(new DisposableMap<string, IDisposable>());

	/** Follows `session`'s catalog as `readChats` reports it, until {@link untrack}. */
	track(session: T, readChats: (reader: IReader) => ReadonlyMap<string, URI>): void {
		if (!this._tracked.has(session)) {
			this._tracked.set(session, autorun(reader => this.update(session, readChats(reader))));
		}
	}

	/** Stops following `session`; the chats it listed leave it. */
	untrack(session: T): void {
		this._tracked.deleteAndDispose(session);
		// Also drops a catalog reported through `update` alone, so nothing stays listed for a session no longer known.
		this.remove(session);
	}

	/** `session` now lists `chats`. */
	update(session: T, chats: ReadonlyMap<string, URI>): void {
		const key = session.resource.toString();
		const previous = this._catalogs.get(key)?.chats ?? new Map<string, URI>();
		this._catalogs.set(key, { session, chats });
		for (const [backend, chat] of previous) {
			if (!chats.has(backend)) {
				this._onRemoved(backend, { session, chat });
			}
		}
		for (const [backend, chat] of chats) {
			if (!previous.has(backend)) {
				this._onAdded(backend, { session, chat });
			}
		}
	}

	/** `session` is gone; the chats it listed leave it (a session that ends after its only chat moved). */
	remove(session: T): void {
		const key = session.resource.toString();
		const catalog = this._catalogs.get(key);
		this._catalogs.delete(key);
		for (const [backend, chat] of catalog?.chats ?? []) {
			this._onRemoved(backend, { session: catalog!.session, chat });
		}
	}

	private _onRemoved(backend: string, end: IAgentHostChatMoveEnd<T>): void {
		const pending = this._pending.get(backend);
		if (pending?.kind === 'added' && !this._isSameSession(pending, end)) {
			this._settle(backend);
			this._onDidMoveChat.fire({ from: end, to: pending });
			return;
		}
		this._await(backend, { ...end, kind: 'removed' });
	}

	private _onAdded(backend: string, end: IAgentHostChatMoveEnd<T>): void {
		const pending = this._pending.get(backend);
		if (pending?.kind === 'removed') {
			this._settle(backend);
			if (!this._isSameSession(pending, end)) {
				this._onDidMoveChat.fire({ from: pending, to: end });
			}
			return;
		}
		// The other session may not have caught up yet: it still lists the chat. Pairing is by backend chat alone, so the
		// same backend chat listed by two sessions within the window (a duplicate backend id, or one re-added elsewhere
		// after a delete) also reads as a move; a host never produces that, and the only effect is following the chat.
		for (const [key, catalog] of this._catalogs) {
			if (key !== end.session.resource.toString() && catalog.chats.has(backend)) {
				this._await(backend, { ...end, kind: 'added' });
				return;
			}
		}
	}

	private _await(backend: string, end: IPendingMoveEnd<T>): void {
		if (this._store.isDisposed) {
			// Owners may forget their sessions while disposing, after this tracker is gone.
			return;
		}
		this._pending.set(backend, end);
		this._pendingTimeouts.set(backend, disposableTimeout(() => this._settle(backend), AgentHostChatMoveTracker.PAIRING_WINDOW_MS));
	}

	private _settle(backend: string): void {
		this._pending.delete(backend);
		this._pendingTimeouts.deleteAndDispose(backend);
	}

	private _isSameSession(a: IAgentHostChatMoveEnd<T>, b: IAgentHostChatMoveEnd<T>): boolean {
		return a.session.resource.toString() === b.session.resource.toString();
	}
}
