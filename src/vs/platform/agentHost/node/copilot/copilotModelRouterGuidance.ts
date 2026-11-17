/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { structuralEquals } from '../../../../base/common/equals.js';
import type { IModelRouterGuidance } from '../../common/modelRouterGuidance.js';

/**
 * Which model router route's guidance each chat's main agent has: that of the route the chat's
 * last routed turn is on.
 *
 * A chat is *fresh* from its creation until one of its sessions starts root work. While it is
 * fresh, the turn being sent can hold a *candidate* guidance, and a turn that is not routed has
 * none. When work starts, the guidance the working session was launched with becomes the chat's
 * *committed* guidance, which may be none. From then on a routed turn replaces it when its route
 * has other guidance, as when the chat moves to another route, and a turn that is not routed
 * changes nothing.
 *
 * Guidance is compared by identity: a session is launched with a guidance object and stays valid
 * for as long as the chat's guidance is that same object. "No guidance" is always `undefined`.
 *
 * Kept in memory only. After a host restart a chat has none until its next routed turn.
 */
export class CopilotModelRouterGuidance {

	private readonly _fresh = new Set<string>();
	/** The turn each chat is on. A routing result belongs to it. */
	private readonly _currentTurns = new Map<string, string>();
	private readonly _candidates = new Map<string, IModelRouterGuidance>();
	private readonly _committed = new Map<string, IModelRouterGuidance>();

	/** Marks a chat that was just created new: not forked, imported or restored. */
	markFresh(chat: string): void {
		this._fresh.add(chat);
	}

	/**
	 * Notes the turn a chat is routing, preparing or sending. For a fresh chat, moving to another
	 * turn drops the candidate, so one turn's routing never reaches another turn's launch.
	 */
	enterTurn(chat: string, turnId: string | undefined): void {
		if (turnId !== undefined && this._currentTurns.get(chat) === turnId) {
			return;
		}
		if (this._fresh.has(chat)) {
			this._candidates.delete(chat);
		}
		if (turnId === undefined) {
			this._currentTurns.delete(chat);
		} else {
			this._currentTurns.set(chat, turnId);
		}
	}

	/**
	 * A turn was routed to a route whose guidance is `guidance`, which is now the chat's. It is
	 * taken only while the chat is still on that turn; a routing call that finishes late changes
	 * nothing. Returns whether the chat's guidance changed.
	 */
	routeTurn(chat: string, turnId: string, guidance: IModelRouterGuidance | undefined): boolean {
		if (this._currentTurns.get(chat) !== turnId) {
			return false;
		}
		const guidances = this._fresh.has(chat) ? this._candidates : this._committed;
		// Equal guidance keeps the object a session was launched with.
		if (structuralEquals(guidances.get(chat), guidance)) {
			return false;
		}
		if (guidance) {
			guidances.set(chat, guidance);
		} else {
			guidances.delete(chat);
		}
		return true;
	}

	/** A turn was not routed. A fresh chat sends it without guidance; a chat that has started work keeps its own. */
	leaveTurnUnrouted(chat: string, turnId: string): void {
		if (this._fresh.has(chat) && this._currentTurns.get(chat) === turnId) {
			this._candidates.delete(chat);
		}
	}

	/** The guidance a session of the chat runs with: the committed one, or the current turn's candidate while the chat is fresh. */
	guidanceFor(chat: string): IModelRouterGuidance | undefined {
		return this._fresh.has(chat) ? this._candidates.get(chat) : this._committed.get(chat);
	}

	/**
	 * A session of the chat started root work. The first time, the guidance given here becomes the
	 * chat's; later reports change nothing. The caller passes the guidance that session was
	 * launched with.
	 */
	commit(chat: string, launched: IModelRouterGuidance | undefined): void {
		if (!this._fresh.delete(chat)) {
			return;
		}
		this._candidates.delete(chat);
		if (launched) {
			this._committed.set(chat, launched);
		} else {
			this._committed.delete(chat);
		}
	}

	/** Forgets a chat that is gone. */
	forget(chat: string): void {
		this._fresh.delete(chat);
		this._candidates.delete(chat);
		this._currentTurns.delete(chat);
		this._committed.delete(chat);
	}
}
