/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, raceTimeout } from '../../../../base/common/async.js';
import { LRUCache } from '../../../../base/common/map.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';

const DEFAULT_TIMEOUT_MS = 100;
const DEFAULT_CACHE_LIMIT = 1000;

export type ModelCallTurnCorrelationOutcome = 'mappingAvailable' | 'mappingWaited' | 'waitExpired' | 'responseAlreadyForwarded';

export interface IModelCallTurnCorrelationResult {
	readonly turnId: string | undefined;
	readonly outcome: ModelCallTurnCorrelationOutcome;
	readonly waitMs?: number;
}

/** Correlates model-call response telemetry with host-remapped Agent Host turns. */
export class ModelCallTurnCorrelation {
	private readonly _turnIdsByModelCallId: LRUCache<string, string>;
	private readonly _pendingTurnIdsByModelCallId = new Map<string, DeferredPromise<string>>();
	private readonly _forwardedModelCallIdsAwaitingCorrelation: LRUCache<string, true>;
	private readonly _timeoutMs: number;

	constructor(options: { readonly timeoutMs?: number; readonly cacheLimit?: number } = {}) {
		this._timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		const cacheLimit = options.cacheLimit ?? DEFAULT_CACHE_LIMIT;
		this._turnIdsByModelCallId = new LRUCache<string, string>(cacheLimit);
		this._forwardedModelCallIdsAwaitingCorrelation = new LRUCache<string, true>(cacheLimit);
	}

	record(modelCallId: string, turnId: string): void {
		if (this._forwardedModelCallIdsAwaitingCorrelation.delete(modelCallId)) {
			return;
		}
		const pending = this._pendingTurnIdsByModelCallId.get(modelCallId);
		if (pending) {
			this._pendingTurnIdsByModelCallId.delete(modelCallId);
			pending.complete(turnId);
			return;
		}
		this._turnIdsByModelCallId.set(modelCallId, turnId);
	}

	take(modelCallId: string): string | undefined {
		const turnId = this._turnIdsByModelCallId.get(modelCallId);
		this._turnIdsByModelCallId.delete(modelCallId);
		return turnId;
	}

	markResponseForwarded(modelCallId: string): void {
		this._turnIdsByModelCallId.delete(modelCallId);
		this._forwardedModelCallIdsAwaitingCorrelation.set(modelCallId, true);
	}

	async wait(modelCallId: string): Promise<IModelCallTurnCorrelationResult> {
		const existing = this.take(modelCallId);
		if (existing) {
			return { turnId: existing, outcome: 'mappingAvailable' };
		}
		if (this._forwardedModelCallIdsAwaitingCorrelation.has(modelCallId)) {
			return { turnId: undefined, outcome: 'responseAlreadyForwarded' };
		}
		const pending = new DeferredPromise<string>();
		this._pendingTurnIdsByModelCallId.set(modelCallId, pending);
		const stopwatch = StopWatch.create();
		const turnId = await raceTimeout(pending.p, this._timeoutMs);
		const waitMs = stopwatch.elapsed();
		if (this._pendingTurnIdsByModelCallId.get(modelCallId) === pending) {
			this._pendingTurnIdsByModelCallId.delete(modelCallId);
		}
		if (turnId === undefined) {
			this.markResponseForwarded(modelCallId);
		}
		return { turnId, outcome: turnId === undefined ? 'waitExpired' : 'mappingWaited', waitMs };
	}
}
