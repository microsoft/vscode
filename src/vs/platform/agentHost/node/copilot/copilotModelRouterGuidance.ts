/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { structuralEquals } from '../../../../base/common/equals.js';
import { modelRouterGuidanceNote, type IModelRouterGuidance } from '../../common/modelRouterGuidance.js';

/** A route's guidance, or none. An object, so "none" differs from "not known". */
interface IRouteGuidance {
	readonly guidance: IModelRouterGuidance | undefined;
}

interface IChatGuidance {
	/** The turn the chat is on and, once it is routed, the guidance of the route it went to. */
	turn?: { readonly id: string; readonly routed?: IRouteGuidance };
	/** What the agent was last told, when that is known. */
	told?: IRouteGuidance;
	/** The note handed out for a message, until the message is seen to reach the agent with it. */
	pending?: IRouteGuidance;
	/** The chat's history can hold a note: one sent here, or one in turns from before this host knew the chat. */
	mayHoldNote?: boolean;
}

/**
 * Tells each chat's main agent the guidance of the model router route the chat is on.
 *
 * The guidance is a note sent with a turn's message, not part of the system prompt: the system
 * prompt comes before the whole conversation, so changing it there would make the model read the
 * conversation again without its prompt cache. A chat is told when a routed turn brings guidance
 * other than what the chat was last told, and a turn that is not routed leaves the chat with what
 * it has.
 *
 * What a chat was told is not always known: a chat that already has turns when this host first
 * routes it, such as one restored after a restart, a fork or an import, can hold a note in its
 * history, a rewrite of the history can drop a note or bring an older one back, and a note handed
 * out with a message that was not seen to reach the agent may have reached it. Such a chat is told
 * again on its next routed turn, also when the route has no guidance.
 *
 * Kept in memory only.
 */
export class CopilotModelRouterGuidance {

	private readonly _chats = new Map<string, IChatGuidance>();

	private _chat(chat: string): IChatGuidance {
		let state = this._chats.get(chat);
		if (!state) {
			state = {};
			this._chats.set(chat, state);
		}
		return state;
	}

	/**
	 * A turn is about to be routed. Call it before the first await: a routing that finishes
	 * after a later turn entered is then ignored.
	 */
	enterTurn(chat: string, turnId: string): void {
		this._chat(chat).turn = { id: turnId };
	}

	/**
	 * A turn was routed to a route whose guidance is `guidance`. `hasEarlierTurns` says whether
	 * the chat has turns before this one.
	 */
	routeTurn(chat: string, turnId: string, guidance: IModelRouterGuidance | undefined, hasEarlierTurns: boolean): void {
		const state = this._chat(chat);
		if (state.turn?.id !== turnId) {
			return;
		}
		state.turn = { id: turnId, routed: { guidance } };
		if (!state.told && !state.mayHoldNote) {
			if (hasEarlierTurns) {
				state.mayHoldNote = true;
			} else {
				// The chat's first turn: it was told nothing.
				state.told = { guidance: undefined };
			}
		}
	}

	/**
	 * The note to send with a turn's message: the guidance of the route the turn was routed to,
	 * or that earlier guidance no longer holds. None for a turn that was not routed, and when the
	 * chat was already told this guidance.
	 */
	noteFor(chat: string, turnId: string | undefined): string | undefined {
		const state = this._chats.get(chat);
		if (!state) {
			return undefined;
		}
		if (state.pending) {
			// A note was handed out and its message was never seen to reach the agent. It may still have.
			this._toldUnknown(state);
		}
		const routed = state.turn && state.turn.id === turnId ? state.turn.routed : undefined;
		if (!routed || state.told && structuralEquals(state.told.guidance, routed.guidance)) {
			return undefined;
		}
		state.pending = routed;
		return modelRouterGuidanceNote(routed.guidance);
	}

	/**
	 * The message that {@link noteFor} last gave a note for reached the agent with it. Returns
	 * whether there was such a note.
	 */
	noteDelivered(chat: string): boolean {
		const state = this._chats.get(chat);
		if (!state?.pending) {
			return false;
		}
		state.told = state.pending;
		state.pending = undefined;
		state.mayHoldNote = true;
		return true;
	}

	/** The chat's history was rewritten: a note can be gone from it, or an older one back in it. */
	historyRewritten(chat: string): void {
		const state = this._chats.get(chat);
		if (state?.pending) {
			// The note on its way can be in what was rewritten, so its delivery would say nothing.
			this._toldUnknown(state);
		} else if (state?.mayHoldNote) {
			state.told = undefined;
		}
	}

	/** Another process ran the chat since this host loaded it, so what its history holds is not known. */
	historyChangedElsewhere(chat: string): void {
		const state = this._chats.get(chat);
		if (state) {
			this._toldUnknown(state);
		}
	}

	/** What the chat was told is not known, and its history can hold a note. A note on its way no longer counts when it arrives. */
	private _toldUnknown(state: IChatGuidance): void {
		state.pending = undefined;
		state.told = undefined;
		state.mayHoldNote = true;
	}

	/** Forgets a chat that is gone. */
	forget(chat: string): void {
		this._chats.delete(chat);
	}
}
