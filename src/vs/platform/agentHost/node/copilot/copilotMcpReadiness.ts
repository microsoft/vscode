/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StopWatch } from '../../../../base/common/stopwatch.js';
import type { McpServerStatus as SdkMcpServerStatus } from '@github/copilot-sdk';

/**
 * SDK statuses that mean the server has finished starting, whether or not it
 * became usable. `pending` and `needs-auth` are excluded because the server is
 * still resolving; everything else is a settled outcome.
 */
function isTerminalStatus(status: SdkMcpServerStatus): boolean {
	return status !== 'pending' && status !== 'needs-auth';
}

export interface IMcpReadinessSnapshot {
	/** Servers observed in any state. */
	readonly serverCount: number;
	/** Servers that reached `connected`. */
	readonly readyCount: number;
	/** Servers that reached `failed`. */
	readonly failedCount: number;
	/** Servers still in `pending` or `needs-auth` when the snapshot was taken. */
	readonly unresolvedCount: number;
	/**
	 * Milliseconds from the first observed server to the last one to settle,
	 * or `undefined` when nothing has settled yet. Startup is parallel, so this
	 * is the cost of the slowest server rather than the sum.
	 */
	readonly slowestServerMs: number | undefined;
}

/**
 * Tracks MCP server startup timing for a single Copilot SDK session.
 *
 * Servers start in parallel, so the wall-clock cost of MCP startup is set by
 * the slowest server. This records when the first server was seen and when the
 * last one settled, which is the window a blocked first turn overlaps with.
 *
 * Only forward progress is recorded: a server that settles and is later
 * re-reported keeps its original settle time, so repeated inventory snapshots
 * do not inflate the measurement.
 */
export class CopilotMcpReadinessTracker {

	private readonly _statuses = new Map<string, SdkMcpServerStatus>();
	private readonly _settledAtMs = new Map<string, number>();
	private _firstObservedMs: number | undefined;

	constructor(private readonly _clock: Pick<StopWatch, 'elapsed'> = StopWatch.create()) { }

	/** Records `status` for `name`, stamping the settle time on first terminal status. */
	observe(name: string, status: SdkMcpServerStatus): void {
		const now = this._clock.elapsed();
		this._firstObservedMs ??= now;
		this._statuses.set(name, status);
		if (isTerminalStatus(status) && !this._settledAtMs.has(name)) {
			this._settledAtMs.set(name, now);
		}
	}

	snapshot(): IMcpReadinessSnapshot {
		let readyCount = 0;
		let failedCount = 0;
		let unresolvedCount = 0;
		for (const status of this._statuses.values()) {
			if (status === 'connected') {
				readyCount++;
			} else if (status === 'failed') {
				failedCount++;
			} else if (!isTerminalStatus(status)) {
				unresolvedCount++;
			}
		}
		const lastSettledMs = this._settledAtMs.size > 0 ? Math.max(...this._settledAtMs.values()) : undefined;
		const firstObservedMs = this._firstObservedMs;
		return {
			serverCount: this._statuses.size,
			readyCount,
			failedCount,
			unresolvedCount,
			slowestServerMs: lastSettledMs !== undefined && firstObservedMs !== undefined
				? Math.round(lastSettledMs - firstObservedMs)
				: undefined,
		};
	}
}
