/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StopWatch } from '../../../base/common/stopwatch.js';
import type { AgentHostTelemetryReporter, AgentHostTurnResult } from './agentHostTelemetryReporter.js';

/** Per-turn timing state, keyed by `session:turnId`. */
interface ITurnTiming {
	readonly stopWatch: StopWatch;
	readonly provider: string;
	readonly session: string;
	readonly model: string | undefined;
	readonly permissionLevel: string | undefined;
	firstProgressMs: number | undefined;
}

/**
 * Tracks per-turn timing for agent host sessions and reports a completion
 * event via the provided {@link AgentHostTelemetryReporter} when a turn ends.
 *
 * Lifecycle per turn:
 *   1. {@link turnStarted} — begins a stopwatch for the turn
 *   2. {@link markFirstProgress} — records elapsed time to first visible output
 *      (only the first call per turn has an effect)
 *   3. {@link turnCompleted} — emits the telemetry event and clears state
 */
export class AgentHostTurnTracker {

	private readonly _turnTimings = new Map<string, ITurnTiming>();

	constructor(private readonly _reporter: AgentHostTelemetryReporter) { }

	turnStarted(provider: string, session: string, turnId: string, model: string | undefined, permissionLevel: string | undefined): void {
		const key = this._key(session, turnId);
		this._turnTimings.set(key, {
			stopWatch: StopWatch.create(false),
			provider,
			session,
			model,
			permissionLevel,
			firstProgressMs: undefined,
		});
	}

	markFirstProgress(session: string, turnId: string): void {
		const timing = this._turnTimings.get(this._key(session, turnId));
		if (timing && timing.firstProgressMs === undefined) {
			timing.firstProgressMs = timing.stopWatch.elapsed();
		}
	}

	turnCompleted(session: string, turnId: string, result: AgentHostTurnResult, errorType?: string): void {
		const key = this._key(session, turnId);
		const timing = this._turnTimings.get(key);
		if (!timing) {
			return;
		}
		this._turnTimings.delete(key);

		this._reporter.turnCompleted({
			provider: timing.provider,
			session: timing.session,
			turnId,
			timeToFirstProgress: timing.firstProgressMs,
			totalTime: timing.stopWatch.elapsed(),
			result,
			model: timing.model,
			permissionLevel: timing.permissionLevel,
			errorType,
		});
	}

	private _key(session: string, turnId: string): string {
		return `${session}\0${turnId}`;
	}
}
