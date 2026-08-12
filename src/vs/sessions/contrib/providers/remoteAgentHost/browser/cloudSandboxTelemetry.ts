/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IntervalTimer } from '../../../../../base/common/async.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { CloudSandboxRequestError } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';

/** The Mission Control call being reported. A closed set, so it is safe to send verbatim. */
export type CloudSandboxRequestAction = 'connect' | 'reconnect' | 'getEnvironment' | 'listTasks' | 'getTask' | 'getTaskEvents' | 'getRepository';

/**
 * How a Mission Control request ended, bucketed so a count is meaningful without carrying the
 * response itself. `waking` is the 202 an environment returns while it boots, which is neither a
 * success nor a failure but is the response most likely to be retried in a loop. `unexpectedStatus`
 * covers 1xx/3xx, which the client does not treat as success either — see
 * {@link requestOutcomeForStatus}.
 */
export type CloudSandboxRequestOutcome = 'succeeded' | 'waking' | 'clientError' | 'serverError' | 'networkError' | 'unexpectedStatus';

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

export const ICloudSandboxTelemetryService = createDecorator<ICloudSandboxTelemetryService>('cloudSandboxTelemetryService');

/**
 * Telemetry for the cloud sandbox integration.
 *
 * Owns every event the sandbox path emits so the reporting rules — what is aggregated, which values
 * are closed sets, what must never carry a URL or token — live in one place instead of being
 * restated at each call site. New sandbox events belong here as additional methods.
 */
export interface ICloudSandboxTelemetryService {
	readonly _serviceBrand: undefined;

	/**
	 * Record how a Mission Control request ended.
	 *
	 * Cheap to call on every request: outcomes are accumulated and reported periodically rather than
	 * sent individually, because a single connect can fan out to tens of calls through waking retries
	 * and readiness polls.
	 */
	reportRequest(action: CloudSandboxRequestAction, outcome: CloudSandboxRequestOutcome): void;

	/**
	 * Report that credential refresh for a connection stopped, and why.
	 *
	 * Refresh is what keeps a sandbox connection usable, so each of these marks a connection that
	 * will drop once its current token expires — and, equally, a retry loop that was stopped from
	 * running indefinitely.
	 */
	reportCredentialRefreshStopped(reason: CloudSandboxRefreshStopReason, consecutiveFailures: number, error?: unknown): void;
}

/** How often accumulated request counts are reported. */
const REQUEST_REPORT_INTERVAL_MS = 30 * 60_000;

/**
 * The outcome bucket for a response with {@link statusCode}.
 *
 * Only 2xx counts as a success, matching the client's own `isSuccess` check — a 1xx or 3xx is
 * thrown as a request failure, so counting it as a success would understate the failure rate.
 */
export function requestOutcomeForStatus(statusCode: number | undefined): CloudSandboxRequestOutcome {
	if (statusCode === undefined) {
		return 'networkError';
	}
	if (statusCode === 202) {
		return 'waking';
	}
	if (statusCode >= 200 && statusCode < 300) {
		return 'succeeded';
	}
	if (statusCode >= 500) {
		return 'serverError';
	}
	if (statusCode >= 400) {
		return 'clientError';
	}
	return 'unexpectedStatus';
}

/** Per-action counts accumulated between reports. */
type RequestCounts = Record<CloudSandboxRequestOutcome, number>;

function emptyCounts(): RequestCounts {
	return { succeeded: 0, waking: 0, clientError: 0, serverError: 0, networkError: 0, unexpectedStatus: 0 };
}

export class CloudSandboxTelemetryService extends Disposable implements ICloudSandboxTelemetryService {
	declare readonly _serviceBrand: undefined;

	private readonly _counts = new Map<CloudSandboxRequestAction, RequestCounts>();
	private readonly _reportTimer = this._register(new IntervalTimer());
	/** When the current window began, i.e. when its first request was recorded. */
	private _windowStart = Date.now();

	constructor(
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super();
		// Report whatever has accumulated rather than losing the last window on shutdown.
		this._register({ dispose: () => this.flushRequestCounts() });
	}

	reportRequest(action: CloudSandboxRequestAction, outcome: CloudSandboxRequestOutcome): void {
		let counts = this._counts.get(action);
		if (!counts) {
			counts = emptyCounts();
			this._counts.set(action, counts);
			// Only tick while there is something to report, so an idle window stays idle. The window
			// starts here rather than at the last flush, so an idle stretch is not folded into
			// `windowMs` — that would make the reported request rate look far lower than it was.
			if (this._counts.size === 1) {
				this._windowStart = Date.now();
				this._reportTimer.cancelAndSet(() => this.flushRequestCounts(), REQUEST_REPORT_INTERVAL_MS);
			}
		}
		counts[outcome]++;
	}

	reportCredentialRefreshStopped(reason: CloudSandboxRefreshStopReason, consecutiveFailures: number, error?: unknown): void {
		this._telemetryService.publicLog2<CloudSandboxRefreshStoppedEvent, CloudSandboxRefreshStoppedClassification>(
			'cloudSandboxCredentialRefreshStopped',
			{
				reason,
				consecutiveFailures,
				statusCode: error instanceof CloudSandboxRequestError ? error.statusCode : undefined,
			},
		);
	}

	/** Report and reset the accumulated request counts. Safe to call when nothing has been recorded. */
	flushRequestCounts(): void {
		if (this._counts.size === 0) {
			return;
		}
		const windowMs = Date.now() - this._windowStart;
		for (const [action, counts] of this._counts) {
			this._telemetryService.publicLog2<CloudSandboxRequestsEvent, CloudSandboxRequestsClassification>(
				'cloudSandboxRequests',
				{
					action,
					windowMs,
					total: counts.succeeded + counts.waking + counts.clientError + counts.serverError + counts.networkError + counts.unexpectedStatus,
					succeeded: counts.succeeded,
					waking: counts.waking,
					clientError: counts.clientError,
					serverError: counts.serverError,
					networkError: counts.networkError,
					unexpectedStatus: counts.unexpectedStatus,
				},
			);
		}
		this._counts.clear();
		this._reportTimer.cancel();
	}
}

type CloudSandboxRequestsEvent = {
	action: string;
	windowMs: number;
	total: number;
	succeeded: number;
	waking: number;
	clientError: number;
	serverError: number;
	networkError: number;
	unexpectedStatus: number;
};

type CloudSandboxRequestsClassification = {
	action: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Which Mission Control call was counted (connect, reconnect, getEnvironment, listTasks or getTask).' };
	windowMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds covered by these counts.' };
	total: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Requests issued for this action during the window.' };
	succeeded: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Requests that returned a success status.' };
	waking: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Requests answered with HTTP 202, meaning the sandbox environment was still waking.' };
	clientError: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Requests rejected with a 4xx status.' };
	serverError: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Requests that failed with a 5xx status.' };
	networkError: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Requests that never produced a response, such as a timeout.' };
	unexpectedStatus: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Requests answered with a status the client does not expect, such as 1xx or 3xx.' };
	owner: 'osortega';
	comment: 'Volume and outcome of the requests the cloud sandbox integration sends to GitHub Mission Control, used to size its load and detect runaway retry loops.';
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
