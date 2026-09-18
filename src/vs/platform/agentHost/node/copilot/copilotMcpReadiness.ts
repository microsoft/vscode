/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StopWatch } from '../../../../base/common/stopwatch.js';
import type { McpServerStatus as SdkMcpServerStatus } from '@github/copilot-sdk';

/**
 * Statuses that mean the server actually attempted to start. `disabled` and
 * `not_configured` servers never launch a process, so they take no part in the
 * startup window even though they appear in the session's inventory.
 */
function isParticipatingStatus(status: SdkMcpServerStatus): boolean {
	return status !== 'disabled' && status !== 'not_configured';
}

/**
 * Statuses that mean a started server has finished, whether or not it became
 * usable. `pending` and `needs-auth` are still resolving, and non-participating
 * statuses never started, so neither settles.
 */
function isSettledStatus(status: SdkMcpServerStatus): boolean {
	return status === 'connected' || status === 'failed';
}

export interface IMcpReadinessSnapshot {
	/** Servers observed in any state, including ones that never started. */
	readonly serverCount: number;
	/** Servers that reached `connected`. */
	readonly readyCount: number;
	/** Servers that reached `failed`. */
	readonly failedCount: number;
	/** Started servers still in `pending` or `needs-auth` when the snapshot was taken. */
	readonly unresolvedCount: number;
	/** Servers that never started because they are `disabled` or `not_configured`. */
	readonly stoppedCount: number;
	/**
	 * Milliseconds from the first server that started to the last one to settle,
	 * or `undefined` when no server has settled — including a session whose
	 * servers are all disabled, which has no startup window at all rather than a
	 * zero-length one. Startup is parallel, so this is the cost of the slowest
	 * server rather than the sum.
	 */
	readonly slowestServerMs: number | undefined;
}

/**
 * Tracks MCP server startup timing for a single Copilot SDK session.
 *
 * Servers start in parallel, so the wall-clock cost of MCP startup is set by
 * the slowest server. This records when the first server started and when the
 * last one settled, which is the window a blocked first turn overlaps with.
 * Servers that never start (`disabled` / `not_configured`) are counted in the
 * inventory but excluded from that window, so a session of only disabled
 * servers reports no window rather than a zero-length one.
 *
 * Only forward progress is recorded: a server that settles and is later
 * re-reported keeps its original settle time, so repeated inventory snapshots
 * do not inflate the measurement.
 */
export class CopilotMcpReadinessTracker {

	private readonly _statuses = new Map<string, SdkMcpServerStatus>();
	private readonly _settledAtMs = new Map<string, number>();
	private _firstStartedMs: number | undefined;

	constructor(private readonly _clock: Pick<StopWatch, 'elapsed'> = StopWatch.create()) { }

	/** Records `status` for `name`, stamping the settle time the first time it finishes starting. */
	observe(name: string, status: SdkMcpServerStatus): void {
		const now = this._clock.elapsed();
		this._statuses.set(name, status);
		if (!isParticipatingStatus(status)) {
			return;
		}
		this._firstStartedMs ??= now;
		if (isSettledStatus(status) && !this._settledAtMs.has(name)) {
			this._settledAtMs.set(name, now);
		}
	}

	snapshot(): IMcpReadinessSnapshot {
		let readyCount = 0;
		let failedCount = 0;
		let unresolvedCount = 0;
		let stoppedCount = 0;
		for (const status of this._statuses.values()) {
			if (status === 'connected') {
				readyCount++;
			} else if (status === 'failed') {
				failedCount++;
			} else if (!isParticipatingStatus(status)) {
				stoppedCount++;
			} else {
				unresolvedCount++;
			}
		}
		const lastSettledMs = this._settledAtMs.size > 0 ? Math.max(...this._settledAtMs.values()) : undefined;
		const firstStartedMs = this._firstStartedMs;
		return {
			serverCount: this._statuses.size,
			readyCount,
			failedCount,
			unresolvedCount,
			stoppedCount,
			slowestServerMs: lastSettledMs !== undefined && firstStartedMs !== undefined
				? Math.round(lastSettledMs - firstStartedMs)
				: undefined,
		};
	}
}
