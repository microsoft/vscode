/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, raceTimeout } from '../../../../base/common/async.js';
import { LRUCache } from '../../../../base/common/map.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';

const DEFAULT_TIMEOUT_MS = 100;
const DEFAULT_CACHE_LIMIT = 200;

/** `requestKind` the runtime stamps on `response.*` telemetry for compaction summarization calls. */
export const COMPACTION_REQUEST_KIND = 'conversation-compaction';

/** Whether a forwarded SDK telemetry kind describes a compaction attempt. */
export function isCompactionTelemetryKind(kind: string): boolean {
	return kind === 'session_compaction_start' || kind === 'session_compaction_complete';
}

export type CompactionTurnCorrelationOutcome = 'mappingAvailable' | 'mappingWaited' | 'waitExpired' | 'noOwningTurn' | 'missingAttemptId' | 'sessionNotFound';

export interface ICompactionTurnCorrelationResult {
	readonly turnId: string | undefined;
	readonly outcome: CompactionTurnCorrelationOutcome;
	readonly waitMs?: number;
}

/**
 * Correlates forwarded compaction telemetry with the Agent Host turn that owned
 * the compaction, keyed by the SDK's `compactionAttemptId`.
 *
 * The owner is recorded from the session's `session.compaction_start` event,
 * which travels on a different channel than the runtime's telemetry, so a
 * telemetry row may briefly arrive first and waits for it.
 */
export class CompactionTurnCorrelation {
	/** `null` records a compaction that no turn owned, e.g. one that ran between turns. */
	private readonly _turnIdsByAttemptId: LRUCache<string, string | null>;
	private readonly _pendingByAttemptId = new Map<string, DeferredPromise<string | null>>();
	private readonly _timeoutMs: number;

	constructor(options: { readonly timeoutMs?: number; readonly cacheLimit?: number } = {}) {
		this._timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		this._turnIdsByAttemptId = new LRUCache<string, string | null>(options.cacheLimit ?? DEFAULT_CACHE_LIMIT);
	}

	/** Records the owner of a compaction attempt. The first owner recorded is retained. */
	record(attemptId: string, turnId: string | undefined): void {
		if (this._turnIdsByAttemptId.has(attemptId)) {
			return;
		}
		const owner = turnId ?? null;
		this._turnIdsByAttemptId.set(attemptId, owner);
		const pending = this._pendingByAttemptId.get(attemptId);
		if (pending) {
			this._pendingByAttemptId.delete(attemptId);
			pending.complete(owner);
		}
	}

	async resolve(attemptId: string): Promise<ICompactionTurnCorrelationResult> {
		const recorded = this._turnIdsByAttemptId.get(attemptId);
		if (recorded !== undefined) {
			return recorded === null ? { turnId: undefined, outcome: 'noOwningTurn' } : { turnId: recorded, outcome: 'mappingAvailable' };
		}
		let pending = this._pendingByAttemptId.get(attemptId);
		if (!pending) {
			pending = new DeferredPromise<string | null>();
			this._pendingByAttemptId.set(attemptId, pending);
		}
		const stopwatch = StopWatch.create();
		const owner = await raceTimeout(pending.p, this._timeoutMs);
		const waitMs = stopwatch.elapsed();
		if (this._pendingByAttemptId.get(attemptId) === pending) {
			this._pendingByAttemptId.delete(attemptId);
		}
		if (owner === undefined) {
			return { turnId: undefined, outcome: 'waitExpired', waitMs };
		}
		return owner === null ? { turnId: undefined, outcome: 'noOwningTurn', waitMs } : { turnId: owner, outcome: 'mappingWaited', waitMs };
	}
}
