/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, raceTimeout } from '../../../../base/common/async.js';
import { LRUCache } from '../../../../base/common/map.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { AgentHostClientType } from '../../common/agentHostClientInfo.js';

const DEFAULT_TIMEOUT_MS = 100;
const DEFAULT_CACHE_LIMIT = 1000;

export type ModelCallTurnCorrelationOutcome = 'mappingAvailable' | 'mappingWaited' | 'waitExpired' | 'responseAlreadyForwarded';

export interface IModelCallTurnCorrelationResult {
	readonly turnId: string | undefined;
	readonly initiatorClientType: AgentHostClientType;
	readonly outcome: ModelCallTurnCorrelationOutcome;
	readonly waitMs?: number;
}
export type ModelCallTurnCorrelationRecordStatus = 'recorded' | 'late' | 'duplicate' | 'conflict';

interface IModelCallTurnCorrelation {
	readonly turnId: string;
	readonly initiatorClientType: AgentHostClientType;
}

/** Correlates model-call response telemetry with host-remapped Agent Host turns. */
export class ModelCallTurnCorrelation {
	private readonly _correlationsByModelCallId: LRUCache<string, IModelCallTurnCorrelation>;
	private readonly _recordedCorrelationsByModelCallId: LRUCache<string, IModelCallTurnCorrelation>;
	private readonly _pendingCorrelationsByModelCallId = new Map<string, DeferredPromise<IModelCallTurnCorrelation>>();
	private readonly _forwardedModelCallIdsAwaitingCorrelation: LRUCache<string, true>;
	private readonly _timeoutMs: number;

	constructor(options: { readonly timeoutMs?: number; readonly cacheLimit?: number } = {}) {
		this._timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		const cacheLimit = options.cacheLimit ?? DEFAULT_CACHE_LIMIT;
		this._correlationsByModelCallId = new LRUCache<string, IModelCallTurnCorrelation>(cacheLimit);
		this._recordedCorrelationsByModelCallId = new LRUCache<string, IModelCallTurnCorrelation>(cacheLimit);
		this._forwardedModelCallIdsAwaitingCorrelation = new LRUCache<string, true>(cacheLimit);
	}

	record(modelCallId: string, turnId: string, initiatorClientType = AgentHostClientType.Unknown): ModelCallTurnCorrelationRecordStatus {
		const recordedCorrelation = this._recordedCorrelationsByModelCallId.get(modelCallId);
		if (recordedCorrelation !== undefined) {
			return recordedCorrelation.turnId === turnId ? 'duplicate' : 'conflict';
		}
		const correlation = { turnId, initiatorClientType };
		this._recordedCorrelationsByModelCallId.set(modelCallId, correlation);
		if (this._forwardedModelCallIdsAwaitingCorrelation.has(modelCallId)) {
			return 'late';
		}
		const pending = this._pendingCorrelationsByModelCallId.get(modelCallId);
		if (pending) {
			pending.complete(correlation);
			return 'recorded';
		}
		this._correlationsByModelCallId.set(modelCallId, correlation);
		return 'recorded';
	}

	take(modelCallId: string): IModelCallTurnCorrelation | undefined {
		const correlation = this._correlationsByModelCallId.get(modelCallId);
		if (correlation !== undefined) {
			this.markResponseForwarded(modelCallId);
		}
		return correlation;
	}

	getRecordedTurnId(modelCallId: string): string | undefined {
		return this._recordedTurnIdsByModelCallId.get(modelCallId);
	}

	markResponseForwarded(modelCallId: string): void {
		this._correlationsByModelCallId.delete(modelCallId);
		this._forwardedModelCallIdsAwaitingCorrelation.set(modelCallId, true);
	}

	async wait(modelCallId: string): Promise<IModelCallTurnCorrelationResult> {
		const existing = this.take(modelCallId);
		if (existing) {
			return { ...existing, outcome: 'mappingAvailable' };
		}
		if (this._forwardedModelCallIdsAwaitingCorrelation.has(modelCallId)) {
			return { turnId: undefined, initiatorClientType: AgentHostClientType.Unknown, outcome: 'responseAlreadyForwarded' };
		}
		let pending = this._pendingCorrelationsByModelCallId.get(modelCallId);
		if (!pending) {
			pending = new DeferredPromise<IModelCallTurnCorrelation>();
			this._pendingCorrelationsByModelCallId.set(modelCallId, pending);
		}
		const stopwatch = StopWatch.create();
		const correlation = await raceTimeout(pending.p, this._timeoutMs);
		const waitMs = stopwatch.elapsed();
		if (this._pendingCorrelationsByModelCallId.get(modelCallId) === pending) {
			this._pendingCorrelationsByModelCallId.delete(modelCallId);
		}
		this.markResponseForwarded(modelCallId);
		return {
			turnId: correlation?.turnId,
			initiatorClientType: correlation?.initiatorClientType ?? AgentHostClientType.Unknown,
			outcome: correlation === undefined ? 'waitExpired' : 'mappingWaited',
			waitMs,
		};
	}
}
