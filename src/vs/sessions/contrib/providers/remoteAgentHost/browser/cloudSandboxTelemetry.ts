/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IntervalTimer } from '../../../../../base/common/async.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { CloudSandboxRequestError } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';

/** The Mission Control call being counted. A closed set, so it is safe to report verbatim. */
export type CloudSandboxRequestAction = 'connect' | 'reconnect' | 'getEnvironment' | 'listTasks' | 'getTask';

/**
 * How a Mission Control request ended, bucketed so a count is meaningful without carrying the
 * response itself. `waking` is the 202 an environment returns while it boots, which is neither a
 * success nor a failure but is the response most likely to be retried in a loop.
 */
export type CloudSandboxRequestOutcome = 'succeeded' | 'waking' | 'clientError' | 'serverError' | 'networkError';

/** Why the credential-refresh scheduler stopped. A closed set of client-side decisions. */
export type CloudSandboxRefreshStopReason =
	/** Mission Control rejected the request in a way that repeating cannot fix (e.g. 404). */
	| 'permanentError'
	/** Too many consecutive failed refreshes. */
	| 'consecutiveFailures'
	/** `/reconnect` kept answering "waking" for a client that is supposed to be connected. */
	| 'environmentWaking'
	/** Refreshed tokens kept arriving already expired, or without a usable `expires_at`. */
	| 'unusableToken';

/** How often accumulated request counts are reported. */
const VOLUME_FLUSH_INTERVAL_MS = 30 * 60_000;

/** The outcome bucket for a response with {@link statusCode}. */
export function requestOutcomeForStatus(statusCode: number | undefined): CloudSandboxRequestOutcome {
	if (statusCode === undefined) {
		return 'networkError';
	}
	if (statusCode === 202) {
		return 'waking';
	}
	if (statusCode >= 500) {
		return 'serverError';
	}
	if (statusCode >= 400) {
		return 'clientError';
	}
	return 'succeeded';
}

/** Per-action tallies accumulated between flushes. */
interface IRequestTally {
	succeeded: number;
	waking: number;
	clientError: number;
	serverError: number;
	networkError: number;
}

function emptyTally(): IRequestTally {
	return { succeeded: 0, waking: 0, clientError: 0, serverError: 0, networkError: 0 };
}

/**
 * Counts Mission Control requests and reports them periodically.
 *
 * Reported in aggregate rather than per request because the connect path fans out: waking retries
 * and environment-readiness polls can each issue tens of calls for a single user action, so one
 * event per request would be both noisy and expensive. The counts exist to answer how much traffic
 * this integration sends to GitHub, and how much of it is failing.
 */
export class CloudSandboxRequestVolumeReporter extends Disposable {

	private readonly _tallies = new Map<CloudSandboxRequestAction, IRequestTally>();
	private readonly _flushTimer = this._register(new IntervalTimer());
	private _windowStart = Date.now();

	constructor(
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super();
		this._register({ dispose: () => this.flush() });
	}

	record(action: CloudSandboxRequestAction, outcome: CloudSandboxRequestOutcome): void {
		let tally = this._tallies.get(action);
		if (!tally) {
			tally = emptyTally();
			this._tallies.set(action, tally);
			// Only tick while there is something to report, so an idle window stays idle.
			if (this._tallies.size === 1) {
				this._flushTimer.cancelAndSet(() => this.flush(), VOLUME_FLUSH_INTERVAL_MS);
			}
		}
		tally[outcome]++;
	}

	/** Report and reset the accumulated counts. Safe to call when nothing has been recorded. */
	flush(): void {
		if (this._tallies.size === 0) {
			return;
		}
		const windowMs = Date.now() - this._windowStart;
		for (const [action, tally] of this._tallies) {
			this._telemetryService.publicLog2<CloudSandboxRequestVolumeEvent, CloudSandboxRequestVolumeClassification>(
				'cloudSandboxRequestVolume',
				{
					action,
					windowMs,
					total: tally.succeeded + tally.waking + tally.clientError + tally.serverError + tally.networkError,
					succeeded: tally.succeeded,
					waking: tally.waking,
					clientError: tally.clientError,
					serverError: tally.serverError,
					networkError: tally.networkError,
				},
			);
		}
		this._tallies.clear();
		this._flushTimer.cancel();
		this._windowStart = Date.now();
	}
}

/**
 * Report that the credential-refresh scheduler gave up on a connection.
 *
 * Each of these represents a refresh loop that previously would have retried indefinitely, so the
 * rate answers both "how often does a sandbox connection become unrecoverable" and "how much
 * Mission Control traffic is the give-up condition actually preventing".
 */
export function reportCredentialRefreshStopped(
	telemetryService: ITelemetryService,
	reason: CloudSandboxRefreshStopReason,
	consecutiveFailures: number,
	error?: unknown,
): void {
	telemetryService.publicLog2<CloudSandboxRefreshStoppedEvent, CloudSandboxRefreshStoppedClassification>(
		'cloudSandboxCredentialRefreshStopped',
		{
			reason,
			consecutiveFailures,
			statusCode: error instanceof CloudSandboxRequestError ? error.statusCode : undefined,
		},
	);
}

type CloudSandboxRequestVolumeEvent = {
	action: string;
	windowMs: number;
	total: number;
	succeeded: number;
	waking: number;
	clientError: number;
	serverError: number;
	networkError: number;
};

type CloudSandboxRequestVolumeClassification = {
	action: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Which Mission Control call was counted (connect, reconnect, getEnvironment, listTasks or getTask).' };
	windowMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds covered by these counts.' };
	total: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Requests issued for this action during the window.' };
	succeeded: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Requests that returned a success status.' };
	waking: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Requests answered with HTTP 202, meaning the sandbox environment was still waking.' };
	clientError: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Requests rejected with a 4xx status.' };
	serverError: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Requests that failed with a 5xx status.' };
	networkError: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Requests that never produced a response, such as a timeout.' };
	owner: 'osortega';
	comment: 'Volume and outcome of the requests the cloud sandbox integration sends to GitHub Mission Control, used to detect runaway retry loops.';
};

type CloudSandboxRefreshStoppedEvent = {
	reason: string;
	consecutiveFailures: number;
	statusCode: number | undefined;
};

type CloudSandboxRefreshStoppedClassification = {
	reason: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Why the scheduler gave up: permanentError, consecutiveFailures, environmentWaking or unusableToken.' };
	consecutiveFailures: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Consecutive unhealthy refresh cycles preceding the stop.' };
	statusCode: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'HTTP status that caused a permanent stop, when the stop was caused by a rejected request.' };
	owner: 'osortega';
	comment: 'Reports that credential refresh for a cloud sandbox connection stopped, so unrecoverable sandbox sessions can be distinguished from transient failures.';
};
