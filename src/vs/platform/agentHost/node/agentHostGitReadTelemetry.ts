/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../base/common/async.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import type { ITelemetryService } from '../../telemetry/common/telemetry.js';

/** How often the counters of a window are reported while git commands keep running. */
const FLUSH_INTERVAL_MS = 5 * 60 * 1000;

/** A read slower than this is counted as slow. */
const SLOW_READ_MS = 5_000;

/** A read slower than this is counted as very slow; the default git command timeout is 30 s. */
const VERY_SLOW_READ_MS = 15_000;

/** How the host runs read-only git commands. */
export type GitReadArm = 'coalesced' | 'passthrough';

type GitReadsEvent = {
	arm: string;
	spawns: number;
	peakLiveProcesses: number;
	timeouts: number;
	reads: number;
	sharedReads: number;
	queuedReads: number;
	queueWaitTotalMs: number;
	queueWaitMaxMs: number;
	failFastSkips: number;
	readTotalMs: number;
	readMaxMs: number;
	slowReads: number;
	verySlowReads: number;
};

type GitReadsClassification = {
	owner: 'sandy081';
	comment: 'Counters of the Agent Host git commands in a time window, to measure whether sharing identical read-only git commands and limiting how many run at once reduces git process pile-ups and timeouts.';
	arm: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether read-only git commands were shared and limited (coalesced) or each spawned its own process (passthrough).' };
	spawns: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Git processes spawned in the window.' };
	peakLiveProcesses: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'The most git processes alive at the same time in the window.' };
	timeouts: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Git processes that exceeded their time budget and were killed.' };
	reads: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Read-only git commands requested in the window.' };
	sharedReads: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Read-only git commands that joined an identical command already running instead of spawning their own process.' };
	queuedReads: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Read-only git commands that had to wait for a free slot.' };
	queueWaitTotalMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Total time read-only git commands waited for a free slot, in milliseconds.' };
	queueWaitMaxMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'The longest a read-only git command waited for a free slot, in milliseconds.' };
	failFastSkips: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Background git status probes skipped because the same probe had just timed out.' };
	readTotalMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Total time from request to result of the read-only git commands, including any wait for a slot, in milliseconds.' };
	readMaxMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'The longest time from request to result of a read-only git command, in milliseconds.' };
	slowReads: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Read-only git commands that took more than 5 seconds to produce a result.' };
	verySlowReads: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Read-only git commands that took more than 15 seconds to produce a result.' };
};

/**
 * Aggregates counters of the host's git commands and reports one event per window,
 * so that the cost of git commands does not scale telemetry volume.
 */
export class AgentHostGitReadTelemetry extends Disposable {

	private readonly _flushScheduler = this._register(new RunOnceScheduler(() => this.flush(), FLUSH_INTERVAL_MS));

	private _arm: GitReadArm | undefined;
	private _liveProcesses = 0;
	private _spawns = 0;
	private _peakLiveProcesses = 0;
	private _timeouts = 0;
	private _reads = 0;
	private _sharedReads = 0;
	private _queuedReads = 0;
	private _queueWaitTotalMs = 0;
	private _queueWaitMaxMs = 0;
	private _failFastSkips = 0;
	private _readTotalMs = 0;
	private _readMaxMs = 0;
	private _slowReads = 0;
	private _verySlowReads = 0;

	constructor(private readonly _telemetryService: ITelemetryService) {
		super();
		this._register(toDisposable(() => this.flush()));
	}

	/** Starts counting a read-only command; the window of one arm ends when the other is observed. */
	readRequested(arm: GitReadArm): void {
		if (this._arm !== undefined && this._arm !== arm) {
			this.flush();
		}
		this._arm = arm;
		this._reads++;
		this._schedule();
	}

	readShared(): void {
		this._sharedReads++;
	}

	readSkipped(): void {
		this._failFastSkips++;
	}

	readQueued(waitMs: number): void {
		this._queuedReads++;
		this._queueWaitTotalMs += waitMs;
		this._queueWaitMaxMs = Math.max(this._queueWaitMaxMs, waitMs);
	}

	readCompleted(durationMs: number): void {
		this._readTotalMs += durationMs;
		this._readMaxMs = Math.max(this._readMaxMs, durationMs);
		if (durationMs > SLOW_READ_MS) {
			this._slowReads++;
		}
		if (durationMs > VERY_SLOW_READ_MS) {
			this._verySlowReads++;
		}
		this._schedule();
	}

	spawnStarted(): void {
		this._spawns++;
		this._liveProcesses++;
		this._peakLiveProcesses = Math.max(this._peakLiveProcesses, this._liveProcesses);
		this._schedule();
	}

	spawnEnded(): void {
		this._liveProcesses = Math.max(0, this._liveProcesses - 1);
	}

	spawnTimedOut(): void {
		this._timeouts++;
		this._schedule();
	}

	private _schedule(): void {
		if (!this._flushScheduler.isScheduled()) {
			this._flushScheduler.schedule();
		}
	}

	/**
	 * Reports and resets the counters; does nothing when no git command ran since the last report.
	 * A read that completes after the report that counted it is reported with the next window.
	 */
	flush(): void {
		this._flushScheduler.cancel();
		// Without a read there is no arm to attribute the counters to; they carry over to the next window.
		if (this._arm === undefined || (this._spawns === 0 && this._reads === 0 && this._timeouts === 0 && this._readTotalMs === 0)) {
			return;
		}
		this._telemetryService.publicLog2<GitReadsEvent, GitReadsClassification>('agentHost.gitReads', {
			arm: this._arm,
			spawns: this._spawns,
			peakLiveProcesses: this._peakLiveProcesses,
			timeouts: this._timeouts,
			reads: this._reads,
			sharedReads: this._sharedReads,
			queuedReads: this._queuedReads,
			queueWaitTotalMs: this._queueWaitTotalMs,
			queueWaitMaxMs: this._queueWaitMaxMs,
			failFastSkips: this._failFastSkips,
			readTotalMs: this._readTotalMs,
			readMaxMs: this._readMaxMs,
			slowReads: this._slowReads,
			verySlowReads: this._verySlowReads,
		});
		this._spawns = 0;
		this._peakLiveProcesses = this._liveProcesses;
		this._timeouts = 0;
		this._reads = 0;
		this._sharedReads = 0;
		this._queuedReads = 0;
		this._queueWaitTotalMs = 0;
		this._queueWaitMaxMs = 0;
		this._failFastSkips = 0;
		this._readTotalMs = 0;
		this._readMaxMs = 0;
		this._slowReads = 0;
		this._verySlowReads = 0;
	}
}
