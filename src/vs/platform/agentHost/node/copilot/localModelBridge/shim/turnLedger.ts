/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IDisposable } from '../../../../../../base/common/lifecycle.js';
import type { ILocalTurnExecution } from '../../../../common/localModel.js';
import type { IServingHold, IServingIdentity } from './servingAccess.js';

/** How one model request ran; the local identity always comes from the request's serving lease, never the current active model. */
export type LocalModelRequestOutcome =
	| { readonly kind: 'local'; readonly serving: IServingIdentity }
	| { readonly kind: 'fallback'; readonly reason: string; readonly fallbackModel: string; readonly serving: IServingIdentity }
	| { readonly kind: 'cloud' };

interface IOpenTurn {
	readonly generation: number;
	readonly outcomes: LocalModelRequestOutcome[];
	/** A local or fallback request without a `sessionId` ran while this turn was open. */
	sawUnattributed: boolean;
	/** The serving generation this turn's requests ran on, held until the turn ends. */
	hold?: IServingHold;
}

/** Turns that never end (a crashed session) are dropped beyond this many. */
const MAX_OPEN_TURNS = 512;

/**
 * Per-turn local/fallback attribution and each turn's serving hold. The request handler records each request's outcome
 * against the open turn of `ctx.sessionId`; a turn aggregates to `local`, `fallback`, `mixed`, `unknown` (only
 * unattributed requests overlapped it) or nothing. A turn's hold is released when it ends, is replaced or dropped.
 */
export class TurnLedger implements IDisposable {

	private readonly _openTurns = new Map<string, IOpenTurn>();
	private _nextGeneration = 1;

	/** Opens a turn for `sessionId`, replacing any open one, and returns its generation. */
	beginTurn(sessionId: string): number {
		const generation = this._nextGeneration++;
		this._closeTurn(sessionId);
		this._openTurns.set(sessionId, { generation, outcomes: [], sawUnattributed: false });
		while (this._openTurns.size > MAX_OPEN_TURNS) {
			const oldest = this._openTurns.keys().next().value;
			if (oldest === undefined) {
				break;
			}
			this._closeTurn(oldest);
		}
		return generation;
	}

	/** Records an outcome against the open turn of `sessionId` (dropped without one); unattributed local or fallback outcomes mark every open turn. */
	record(sessionId: string | undefined, outcome: LocalModelRequestOutcome): void {
		if (sessionId === undefined) {
			if (outcome.kind !== 'cloud') {
				for (const turn of this._openTurns.values()) {
					turn.sawUnattributed = true;
				}
			}
			return;
		}
		this._openTurns.get(sessionId)?.outcomes.push(outcome);
	}

	/** Closes the turn and returns its aggregate; `undefined` for a stale generation or when nothing local was involved. */
	endTurn(sessionId: string, generation: number): ILocalTurnExecution | undefined {
		const turn = this._openTurns.get(sessionId);
		if (!turn || turn.generation !== generation) {
			return undefined;
		}
		this._closeTurn(sessionId);
		return aggregateTurn(turn.outcomes, turn.sawUnattributed);
	}

	hasOpenTurn(sessionId: string | undefined): boolean {
		return sessionId !== undefined && this._openTurns.has(sessionId);
	}

	/** The serving hold of the open turn of `sessionId`, if it took one. */
	getHold(sessionId: string | undefined): IServingHold | undefined {
		return sessionId === undefined ? undefined : this._openTurns.get(sessionId)?.hold;
	}

	/** Makes the open turn of `sessionId` keep `hold` until it ends; without an open turn, `hold` is released at once and `false` returned. */
	setHold(sessionId: string, hold: IServingHold): boolean {
		const turn = this._openTurns.get(sessionId);
		if (!turn) {
			hold.dispose();
			return false;
		}
		if (turn.hold !== hold) {
			turn.hold?.dispose();
			turn.hold = hold;
		}
		return true;
	}

	/** Releases every hold and forgets every open turn. */
	dispose(): void {
		for (const sessionId of [...this._openTurns.keys()]) {
			this._closeTurn(sessionId);
		}
	}

	private _closeTurn(sessionId: string): void {
		const turn = this._openTurns.get(sessionId);
		if (turn) {
			this._openTurns.delete(sessionId);
			turn.hold?.dispose();
		}
	}
}

/** Aggregates a turn's request outcomes as described on {@link TurnLedger}. */
export function aggregateTurn(outcomes: readonly LocalModelRequestOutcome[], sawUnattributed: boolean): ILocalTurnExecution | undefined {
	let firstLocal: Extract<LocalModelRequestOutcome, { kind: 'local' }> | undefined;
	let firstFallback: Extract<LocalModelRequestOutcome, { kind: 'fallback' }> | undefined;
	for (const outcome of outcomes) {
		if (outcome.kind === 'local') {
			firstLocal ??= outcome;
		} else if (outcome.kind === 'fallback') {
			firstFallback ??= outcome;
		}
	}
	if (firstFallback) {
		return {
			execution: firstLocal ? 'mixed' : 'fallback',
			fallbackReason: firstFallback.reason,
			fallbackModel: firstFallback.fallbackModel,
			familyId: (firstLocal ?? firstFallback).serving.familyId,
		};
	}
	if (firstLocal) {
		return { execution: 'local', familyId: firstLocal.serving.familyId };
	}
	return sawUnattributed ? { execution: 'unknown' } : undefined;
}
