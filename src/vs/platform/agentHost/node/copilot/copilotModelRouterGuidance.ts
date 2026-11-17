/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { structuralEquals } from '../../../../base/common/equals.js';
import type { IModelRouterGuidance } from '../../common/modelRouterGuidance.js';

/**
 * Which model router route's guidance each chat's main agent has: that of the route of the last
 * routed turn whose work one of the chat's sessions started.
 *
 * Routing a turn *stages* the guidance of its route, for that turn only. A session launched or
 * relaunched for the turn runs with the staged guidance, and when it starts root work that
 * guidance becomes the chat's *committed* guidance. A turn that is cancelled before then, or that
 * is not routed, leaves the chat's guidance as it was, which is none for a chat that has not
 * started work.
 *
 * Guidance is compared by identity: a session is launched with a guidance object and stays valid
 * for as long as the chat's guidance is that same object. "No guidance" is always `undefined`.
 *
 * Kept in memory only. After a host restart a chat has none until its next routed turn.
 */
export class CopilotModelRouterGuidance {

	/** The turn each chat is on. Staged guidance belongs to it. */
	private readonly _currentTurns = new Map<string, string>();
	/** What the current turn of a chat was routed to, when that is not the committed guidance. A route can have none. */
	private readonly _staged = new Map<string, { readonly guidance: IModelRouterGuidance | undefined }>();
	private readonly _committed = new Map<string, IModelRouterGuidance>();

	/**
	 * Notes the turn a chat is routing, preparing or sending. Moving to another turn drops what
	 * was staged, so one turn's routing never reaches another turn's launch.
	 */
	enterTurn(chat: string, turnId: string | undefined): void {
		if (turnId !== undefined && this._currentTurns.get(chat) === turnId) {
			return;
		}
		this._staged.delete(chat);
		if (turnId === undefined) {
			this._currentTurns.delete(chat);
		} else {
			this._currentTurns.set(chat, turnId);
		}
	}

	/**
	 * A turn was routed to a route whose guidance is `guidance`. It is staged only while the chat
	 * is still on that turn; a routing call that finishes late changes nothing. Returns whether
	 * the guidance a session of the chat should run with changed.
	 */
	routeTurn(chat: string, turnId: string, guidance: IModelRouterGuidance | undefined): boolean {
		if (this._currentTurns.get(chat) !== turnId) {
			return false;
		}
		// Equal guidance keeps the object a session was launched with.
		if (structuralEquals(this.guidanceFor(chat), guidance)) {
			return false;
		}
		if (structuralEquals(this._committed.get(chat), guidance)) {
			this._staged.delete(chat);
		} else {
			this._staged.set(chat, { guidance });
		}
		return true;
	}

	/** A turn was not routed, so it runs with the guidance the chat has. */
	leaveTurnUnrouted(chat: string, turnId: string): void {
		if (this._currentTurns.get(chat) === turnId) {
			this._staged.delete(chat);
		}
	}

	/** The guidance a session of the chat runs with: what the current turn staged, else the committed one. */
	guidanceFor(chat: string): IModelRouterGuidance | undefined {
		const staged = this._staged.get(chat);
		return staged ? staged.guidance : this._committed.get(chat);
	}

	/**
	 * A session of the chat started root work, so the guidance it was launched with is the chat's.
	 * The caller passes that guidance.
	 */
	commit(chat: string, launched: IModelRouterGuidance | undefined): void {
		if (launched) {
			this._committed.set(chat, launched);
		} else {
			this._committed.delete(chat);
		}
		const staged = this._staged.get(chat);
		if (staged && staged.guidance === launched) {
			this._staged.delete(chat);
		}
	}

	/** Forgets a chat that is gone. */
	forget(chat: string): void {
		this._currentTurns.delete(chat);
		this._staged.delete(chat);
		this._committed.delete(chat);
	}
}
