/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { structuralEquals } from '../../../../base/common/equals.js';
import type { IModelRouterGuidance } from '../../common/modelRouterGuidance.js';

/**
 * Which model router route's guidance each chat's main agent has. It is decided once, by the first
 * message that starts work in the chat, and never changes afterwards.
 *
 * A chat is *fresh* from its creation until one of its sessions starts root work. While it is
 * fresh, the turn being sent can hold a *candidate* guidance. When work starts, the guidance the
 * working session was launched with becomes the chat's *committed* guidance, which may be none.
 *
 * Guidance is compared by identity: a session is launched with a guidance object and stays valid
 * for as long as the chat's guidance is that same object. "No guidance" is always `undefined`.
 *
 * Kept in memory only, so a host restart forgets every chat's guidance.
 */
export class CopilotModelRouterGuidance {

	private readonly _fresh = new Set<string>();
	/** The turn each fresh chat is on. A candidate belongs to it. */
	private readonly _currentTurns = new Map<string, string>();
	private readonly _candidates = new Map<string, IModelRouterGuidance>();
	private readonly _committed = new Map<string, IModelRouterGuidance>();

	/** Marks a chat that was just created new: not forked, imported or restored. */
	markFresh(chat: string): void {
		this._fresh.add(chat);
	}

	isFresh(chat: string): boolean {
		return this._fresh.has(chat);
	}

	/**
	 * Notes the turn a fresh chat is routing, preparing or sending. Moving to another turn drops
	 * the candidate, so one turn's routing never reaches another turn's launch.
	 */
	enterTurn(chat: string, turnId: string | undefined): void {
		if (!this._fresh.has(chat) || (turnId !== undefined && this._currentTurns.get(chat) === turnId)) {
			return;
		}
		this._candidates.delete(chat);
		if (turnId === undefined) {
			this._currentTurns.delete(chat);
		} else {
			this._currentTurns.set(chat, turnId);
		}
	}

	/**
	 * Offers the guidance of the route a turn was routed to. It is taken only while the chat is fresh
	 * and still on that turn; a routing call that finishes late changes nothing. Returns whether it was taken.
	 */
	setCandidate(chat: string, turnId: string, guidance: IModelRouterGuidance | undefined): boolean {
		if (!this._fresh.has(chat) || this._currentTurns.get(chat) !== turnId) {
			return false;
		}
		if (!guidance) {
			this._candidates.delete(chat);
		} else if (!structuralEquals(this._candidates.get(chat), guidance)) {
			this._candidates.set(chat, guidance);
		}
		return true;
	}

	/** The guidance a session of the chat launches with: the committed one, else the current turn's candidate. */
	guidanceFor(chat: string): IModelRouterGuidance | undefined {
		return this._fresh.has(chat) ? this._candidates.get(chat) : this._committed.get(chat);
	}

	/**
	 * A session of the chat started root work. The first time, the guidance given here becomes the
	 * chat's for good; later reports change nothing. The caller passes the guidance that session
	 * was launched with.
	 */
	commit(chat: string, launched: IModelRouterGuidance | undefined): void {
		if (!this._fresh.delete(chat)) {
			return;
		}
		this._candidates.delete(chat);
		this._currentTurns.delete(chat);
		if (launched) {
			this._committed.set(chat, launched);
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
