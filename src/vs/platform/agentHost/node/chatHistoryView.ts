/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../base/common/uuid.js';
import { ActionType } from '../common/state/sessionActions.js';
import { JsonRpcErrorCodes, ProtocolError } from '../common/state/sessionProtocol.js';
import type { Turn } from '../common/state/sessionState.js';
import { DEFAULT_MAX_REASSEMBLY_BYTES } from '../common/webPubSub/chunking.js';

const pageBytes = 4 * 1024 * 1024;
// Includes room for the JSON-RPC envelope, sequence, and cursor.
const maximumBytes = DEFAULT_MAX_REASSEMBLY_BYTES - 1024;

/** A connection's boundary between retained and displayed turns. Never stored in authoritative state. */
export class ChatHistoryView {
	private _hidden = 0;
	private _boundary: Turn | undefined;
	private _cursor: string | undefined;
	private _length = 0;
	private _lastTurn: WeakRef<Turn> | undefined;
	private _lastPrivateSeq = Infinity;
	readonly count: number;

	constructor(count: number, private readonly _project: (turn: Turn) => Turn) {
		if (!Number.isSafeInteger(count) || count < 0) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Invalid chat view turn count');
		}
		this.count = Math.min(100, Math.max(1, count));
	}

	get hiddenCount(): number { return this._hidden; }

	recordPrivateDelivery(serverSeq: number): void {
		this._lastPrivateSeq = serverSeq;
	}

	resume(previous: ChatHistoryView, turns: readonly Turn[], lastSeen: number): boolean {
		if (lastSeen < previous._lastPrivateSeq || turns.length < previous._length || turns[previous._hidden - 1] !== previous._boundary
			|| turns[previous._length - 1] !== previous._lastTurn?.deref()) {
			return false;
		}
		this._lastPrivateSeq = previous._lastPrivateSeq;
		this._cursor = previous._cursor;
		this._hidden = previous._hidden;
		this._boundary = previous._boundary;
		this.observeTurns(turns);
		return true;
	}

	baseline(turns: readonly Turn[], snapshotBytes: number) {
		return this._page(turns, turns.length, snapshotBytes, 'snapshot');
	}

	fetch(turns: readonly Turn[], cursor: string | undefined, envelopeBytes: number) {
		if ((cursor !== undefined && cursor !== this._cursor) || turns[this._hidden - 1] !== this._boundary) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Unrecognized fetchTurns cursor; resubscribe to the chat');
		}
		return this._page(turns, this._hidden, envelopeBytes);
	}

	/** Prepending retained history must not push an unbounded load, or create a gap in the displayed suffix. */
	prepend(turns: readonly Turn[], envelopeBytes: number) {
		return this._page(turns, this._hidden + turns.length - this._length, envelopeBytes, 'notification');
	}

	truncate(turns: readonly Turn[], target: string | undefined): boolean {
		this.observeTurns(turns);
		if (target === undefined) {
			this._setBoundary(turns, 0);
		}
		return target !== undefined && turns.length <= this._hidden && turns.at(-1)?.id === target;
	}

	rebaseline(turns: readonly Turn[], envelopeBytes: number) {
		return this._page(turns, turns.length, envelopeBytes, 'notification');
	}

	observeTurns(turns: readonly Turn[]): void {
		const last = turns.at(-1);
		if (last !== this._lastTurn?.deref()) {
			this._lastTurn = last && new WeakRef(last);
		}
		this._length = turns.length;
	}

	private _setBoundary(turns: readonly Turn[], start: number): void {
		this._hidden = start;
		this._boundary = turns[start - 1];
		this._cursor = start > 0 ? generateUuid() : undefined;
		this.observeTurns(turns);
	}

	private _page(turns: readonly Turn[], end: number, bytes: number, kind: 'fetch' | 'snapshot' | 'notification' = 'fetch') {
		if (bytes > maximumBytes) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, 'Chat snapshot exceeds the transport message size limit without history');
		}
		const page: Turn[] = [];
		let start = end;
		while (start > 0 && page.length < this.count) {
			const turn = this._project(turns[start - 1]);
			const turnBytes = Buffer.byteLength(JSON.stringify(turn)) + 1;
			if (page.length && bytes + turnBytes > pageBytes) {
				break;
			}
			if (bytes + turnBytes > maximumBytes) {
				if (kind === 'notification' || (kind === 'snapshot' && turnBytes <= maximumBytes)) {
					break;
				}
				throw new ProtocolError(JsonRpcErrorCodes.InternalError, 'Chat turn exceeds the transport message size limit');
			}
			page.push(turn);
			bytes += turnBytes;
			start--;
		}
		this._setBoundary(turns, start);
		return { type: ActionType.ChatTurnsLoaded as const, turns: page.reverse(), ...(this._cursor ? { turnsNextCursor: this._cursor } : {}) };
	}
}
