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
	 * The longest startup any single server took, in milliseconds, or
	 * `undefined` when no server's startup was observed end to end. Servers
	 * start in parallel, so this is the cost that gates readiness rather than
	 * the sum. Measured per server, so idle time between one server settling
	 * and another starting later in the session is excluded.
	 */
	readonly slowestServerMs: number | undefined;
}

/**
 * Tracks MCP server startup timing for a single Copilot SDK session.
 *
 * Each server is timed individually, from the first observation showing it
 * starting to the observation showing it settled, and the reported figure is
 * the longest of those. Measuring per server rather than across the whole
 * session keeps the figure meaningful when servers are added or restarted
 * later in a long-lived session: idle time between an early server settling
 * and a later one starting is not part of any server's startup.
 *
 * Servers that never start (`disabled` / `not_configured`) are counted in the
 * inventory but contribute no duration, and a server first seen already
 * settled contributes none either — its startup was not observed, which is
 * different from it having taken no time.
 *
 * Only forward progress is recorded: a server that settles and is later
 * re-reported keeps its original duration, so repeated inventory snapshots
 * do not inflate the measurement.
 */
export class CopilotMcpReadinessTracker {

	private readonly _statuses = new Map<string, SdkMcpServerStatus>();
	private readonly _startedAtMs = new Map<string, number>();
	private readonly _durationMs = new Map<string, number>();

	constructor(private readonly _clock: Pick<StopWatch, 'elapsed'> = StopWatch.create()) { }

	/** Records `status` for `name`, closing that server's startup interval once it settles. */
	observe(name: string, status: SdkMcpServerStatus): void {
		const now = this._clock.elapsed();
		this._statuses.set(name, status);
		if (!isParticipatingStatus(status)) {
			return;
		}
		if (!isSettledStatus(status)) {
			if (!this._startedAtMs.has(name)) {
				this._startedAtMs.set(name, now);
			}
			return;
		}
		const startedAtMs = this._startedAtMs.get(name);
		if (startedAtMs !== undefined && !this._durationMs.has(name)) {
			this._durationMs.set(name, now - startedAtMs);
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
		return {
			serverCount: this._statuses.size,
			readyCount,
			failedCount,
			unresolvedCount,
			stoppedCount,
			slowestServerMs: this._durationMs.size > 0 ? Math.round(Math.max(...this._durationMs.values())) : undefined,
		};
	}
}
