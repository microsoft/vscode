/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../util/common/services';
import { CallTracker } from '../../../util/common/telemetryCorrelationId';
import { raceCancellationError } from '../../../util/vs/base/common/async';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { CancellationError, isCancellationError } from '../../../util/vs/base/common/errors';
import { Disposable, IDisposable } from '../../../util/vs/base/common/lifecycle';
import { IEnvService } from '../../env/common/envService';
import { ILogService } from '../../log/common/logService';
import { ITelemetryService } from '../../telemetry/common/telemetry';

export const IGithubApiFetcherService = createServiceIdentifier<IGithubApiFetcherService>('IGithubApiFetcherService');

export interface GithubRequestOptions {
	readonly method: string;
	readonly url: string;
	readonly headers?: Record<string, string>;
	readonly body?: unknown;
	readonly authToken: string;

	readonly telemetry: {
		readonly urlId: string; // A stable identifier for the URL, used for telemetry and logging. Should not contain sensitive information.
		readonly callerInfo: CallTracker;
	};

	/** Number of retries on 5xx errors. Defaults to 0 (no retries). */
	readonly retriesOn500?: number;

	/** Number of retries on 429 responses with a Retry-After header. Defaults to 5. */
	readonly retriesOnRateLimiting?: number;
}

export const githubHeaders = Object.freeze({
	requestId: 'x-github-request-id',
	totalQuotaUsed: 'x-github-total-quota-used',
	quotaBucketName: 'x-github-quota-bucket-name',
});

/**
 * Provides standardized throttling and retry behavior for GitHub API requests.
 */
export interface IGithubApiFetcherService extends IDisposable {
	readonly _serviceBrand: undefined;

	makeRequest(options: GithubRequestOptions, token: CancellationToken): Promise<Response>;
}

/**
 * Sliding window that holds at least N entries and all entries in the time window.
 * If inserts are infrequent, the minimum-entry guarantee ensures there is always
 * some history to work with; when inserts are frequent the time window dominates.
 */
class SlidingTimeAndNWindow {
	private values: number[] = [];
	private times: number[] = [];
	private sumValues = 0;
	private readonly numEntries: number;
	private readonly windowDurationMs: number;

	constructor(numEntries: number, windowDurationMs: number) {
		this.numEntries = numEntries;
		this.windowDurationMs = windowDurationMs;
	}

	increment(n: number): void {
		this.values.push(n);
		this.times.push(Date.now());
		this.sumValues += n;
	}

	get(): number {
		return this.sumValues;
	}

	average(): number {
		if (this.values.length === 0) {
			return 0;
		}
		return this.sumValues / this.values.length;
	}

	delta(): number {
		if (this.values.length === 0) {
			return 0;
		}
		return this.values[this.values.length - 1] - this.values[0];
	}

	size(): number {
		return this.values.length;
	}

	reset(): void {
		this.values = [];
		this.times = [];
		this.sumValues = 0;
	}

	/**
	 * Removes entries that are both outside the time window and exceed the
	 * minimum entry count. Called explicitly before throttle decisions so
	 * that the window reflects the current state.
	 */
	cleanUpOldValues(now: number): void {
		const tooOldTime = now - this.windowDurationMs;
		while (
			this.times.length > this.numEntries &&
			this.times[0] < tooOldTime
		) {
			this.sumValues -= this.values[0];
			this.values.shift();
			this.times.shift();
		}
	}
}

class Throttler {
	private readonly target: number;
	private lastSendTime: number;
	private totalQuotaUsedWindow: SlidingTimeAndNWindow;
	private sendPeriodWindow: SlidingTimeAndNWindow;
	private numOutstandingRequests = 0;

	constructor(target: number) {
		this.target = target;
		this.lastSendTime = Date.now();
		this.totalQuotaUsedWindow = new SlidingTimeAndNWindow(5, 2000);
		this.sendPeriodWindow = new SlidingTimeAndNWindow(5, 2000);
	}

	reset(): void {
		if (this.numOutstandingRequests === 0) {
			this.lastSendTime = Date.now();
			this.totalQuotaUsedWindow = new SlidingTimeAndNWindow(5, 2000);
			this.sendPeriodWindow = new SlidingTimeAndNWindow(5, 2000);
		}
	}

	recordQuotaUsed(used: number): void {
		this.totalQuotaUsedWindow.increment(used);
	}

	requestStarted(): void {
		this.numOutstandingRequests += 1;
	}

	requestFinished(): void {
		this.numOutstandingRequests -= 1;
	}

	/**
	 * PID-controller–inspired gate that decides whether a request should be
	 * sent right now or deferred. It uses sliding windows of recent quota
	 * usage and send periods to compute proportional, integral, and
	 * differential terms, which in turn determine a dynamic delay before
	 * sending the next request.
	 */
	shouldSendRequest(): boolean {
		const now = Date.now();

		// Send a request occasionally even if throttled, to refresh quota info.
		if (now > this.lastSendTime + 5 * 60 * 1000) {
			this.reset();
		}

		this.totalQuotaUsedWindow.cleanUpOldValues(now);
		this.sendPeriodWindow.cleanUpOldValues(now);

		// Ramp up slowly at start so the throttler can calibrate based on
		// server feedback before allowing concurrent requests.
		if (
			this.totalQuotaUsedWindow.size() < 5 &&
			this.numOutstandingRequests > 0
		) {
			return false;
		}

		let shouldSend = false;

		// If there have been no requests, send one.
		if (this.totalQuotaUsedWindow.get() === 0 || this.sendPeriodWindow.size() === 0) {
			shouldSend = true;
		} else if (this.sendPeriodWindow.average() > 0) {
			const integral =
				(this.totalQuotaUsedWindow.average() - this.target) / 100;
			const differential = this.totalQuotaUsedWindow.delta();
			const delayMs =
				this.sendPeriodWindow.average() *
				Math.max(1 + 20 * integral + 0.5 * differential, 0.2);
			if (now > this.lastSendTime + delayMs) {
				shouldSend = true;
			}
		}

		if (shouldSend) {
			this.sendPeriodWindow.increment(now - this.lastSendTime);
			this.lastSendTime = now;
		}
		return shouldSend;
	}
}

export class GithubApiFetcherService extends Disposable implements IGithubApiFetcherService {
	declare readonly _serviceBrand: undefined;

	/**
	 * The target percentage usage of each throttler. Higher is faster but too close to 100 and you
	 * can have queries rejected
	 */
	private readonly throttlerTarget = 80;
	/** Quota-bucket name → {@link Throttler} that governs requests in that bucket. */
	private readonly throttlers = new Map<string, Throttler>();
	/** `"METHOD url"` → quota-bucket name, learned from response headers. */
	private readonly endpointBuckets = new Map<string, string>();

	constructor(
		@IEnvService private readonly envService: IEnvService,
		@ILogService private readonly logService: ILogService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();
	}

	override dispose(): void {
		this.throttlers.clear();
		this.endpointBuckets.clear();
		super.dispose();
	}

	/**
	 * Computes a normalized key for an endpoint, combining HTTP method and URL
	 * pathname. This avoids fragmenting throttling state across different query
	 * strings for the same logical endpoint.
	 */
	private getEndpointKey(method: string, url: string): string {
		try {
			const parsed = new URL(url);
			return `${method} ${parsed.pathname}`;
		} catch {
			// Fall back to the raw URL if it cannot be parsed (e.g. relative URL),
			// preserving existing behavior in those cases.
			return `${method} ${url}`;
		}
	}

	/**
	 * Returns the throttler for a given endpoint (method + pathname) by looking
	 * up its quota bucket. Returns `undefined` for endpoints whose bucket is not
	 * yet known (i.e. no prior response has provided the bucket header).
	 */
	private getThrottlerForEndpoint(method: string, url: string): Throttler | undefined {
		const endpointKey = this.getEndpointKey(method, url);
		const bucket = this.endpointBuckets.get(endpointKey);
		return bucket ? this.throttlers.get(bucket) : undefined;
	}

	/**
	 * Updates the endpoint → quota-bucket and bucket → throttler mappings from
	 * response headers. Creates a new throttler on demand when a bucket is seen
	 * for the first time.
	 */
	private updateThrottlers(method: string, url: string, bucket: string, quotaUsed: number): void {
		if (!this.throttlers.has(bucket)) {
			this.throttlers.set(bucket, new Throttler(this.throttlerTarget));
		}
		this.throttlers.get(bucket)!.recordQuotaUsed(quotaUsed);
		const endpointKey = this.getEndpointKey(method, url);
		this.endpointBuckets.set(endpointKey, bucket);
	}

	async makeRequest(options: GithubRequestOptions, token: CancellationToken): Promise<Response> {
		return this.makeRequestWithRetries(options, token, options.retriesOn500 ?? 0, options.retriesOnRateLimiting ?? 5);
	}

	private async makeRequestWithRetries(
		options: GithubRequestOptions,
		token: CancellationToken,
		retriesOn500Remaining: number,
		retryOnRateLimitedRemaining: number,
	): Promise<Response> {
		// Throttle based on the URL's quota bucket (if known from prior responses)
		const throttler = this.getThrottlerForEndpoint(options.method, options.url);
		if (throttler) {
			while (!throttler.shouldSendRequest()) {
				await raceCancellationError(sleep(5), token);
			}
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
		}

		throttler?.requestStarted();
		try {
			const res = await fetch(options.url, {
				method: options.method,
				headers: {
					...options.headers,
					'Authorization': `Bearer ${options.authToken}`,
					...getGithubMetadataHeaders(options.telemetry.callerInfo, this.envService),
				},
				body: options.body ? JSON.stringify(options.body) : undefined,
			});

			// Record quota usage for throttle calibration
			// Record quota usage for throttle calibration, keyed by bucket. If the bucket name is not in the headers use a
			// fake __global__ bucket.
			const bucketNameHeader = res.headers.get(githubHeaders.quotaBucketName);
			const bucketName = bucketNameHeader || '__global__';
			const quotaUsedHeader = res.headers.get(githubHeaders.totalQuotaUsed);

			// Learn the endpoint → bucket mapping whenever we have a bucket header, even if quota-used is missing.
			if (bucketNameHeader && quotaUsedHeader === null) {
				this.updateThrottlers(options.method, options.url, bucketName, 0);
			}

			// Only record quota usage when the parsed value is finite and greater than zero.
			if (quotaUsedHeader !== null) {
				const quotaUsed = parseFloat(quotaUsedHeader);
				if (Number.isFinite(quotaUsed) && quotaUsed > 0) {
					this.updateThrottlers(options.method, options.url, bucketName, quotaUsed);
				}
			}

			if (!res.ok) {
				// Handle 429 with Retry-After header
				if (res.status === 429 && retryOnRateLimitedRemaining > 0) {
					const retryAfterHeader = res.headers.get('Retry-After');
					if (retryAfterHeader) {
						const waitSeconds = parseInt(retryAfterHeader, 10) || 1;
						this.logService.info(`GithubApiFetcherService: ${options.method} ${options.telemetry.urlId} returned 429, waiting ${waitSeconds}s (Retry-After). ${retryOnRateLimitedRemaining - 1} retries remaining`);
						await raceCancellationError(sleep(waitSeconds * 1000), token);
						return this.makeRequestWithRetries(options, token, retriesOn500Remaining, retryOnRateLimitedRemaining - 1);
					}
				}

				const willRetryAfterError = res.status >= 500 && res.status < 600 && retriesOn500Remaining > 0;
				const requestId = res.headers.get(githubHeaders.requestId);

				if (willRetryAfterError) {
					this.logService.warn(`GithubApiFetcherService: ${options.method} ${options.telemetry.urlId} returned ${res.status}, github requestId: '${requestId}'. Retrying (${retriesOn500Remaining} retries remaining)`,);
				} else {
					let responseBody = '';
					try {
						responseBody = await res.text();
					} catch {
						// noop
					}
					this.logService.error(`GithubApiFetcherService: ${options.method} ${options.telemetry.urlId} failed with status '${res.status}', github requestId: '${requestId}', body: ${responseBody}`,);
				}

				/* __GDPR__
					"githubApiFetcherService.request.error" : {
						"owner": "copilot-core",
						"comment": "Logging when a GitHub API request fails",
						"urlId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "A stable identifier for the URL" },
						"method": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The HTTP method used" },
						"caller": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Caller" },
						"statusCode": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The response status code" },
						"willRetry": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Whether the request will be retried" }
					}
				*/
				this.telemetryService.sendMSFTTelemetryEvent('githubApiFetcherService.request.error', {
					urlId: options.telemetry.urlId,
					method: options.method,
					caller: options.telemetry.callerInfo.toString(),
				}, {
					statusCode: res.status,
					willRetry: willRetryAfterError ? 1 : 0,
				});

				if (willRetryAfterError) {
					return this.makeRequestWithRetries(options, token, retriesOn500Remaining - 1, retryOnRateLimitedRemaining);
				}
			}

			return res;
		} catch (e) {
			if (!isCancellationError(e)) {
				this.logService.error(`GithubApiFetcherService: ${options.method} ${options.telemetry.urlId} threw: ${e}`);
			}
			throw e;
		} finally {
			throttler?.requestFinished();
		}
	}
}

async function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export function getGithubMetadataHeaders(callerInfo: CallTracker, envService: IEnvService): Record<string, string> | undefined {
	const editorInfo = envService.getEditorInfo();

	// Try converting vscode/1.xxx-insiders to vscode-insiders/1.xxx
	const versionNumberAndSubName = editorInfo.version.match(/^(?<version>.+?)(\-(?<subName>\w+?))?$/);
	const application = versionNumberAndSubName && versionNumberAndSubName.groups?.subName
		? `${editorInfo.name}-${versionNumberAndSubName.groups.subName}/${versionNumberAndSubName.groups.version}`
		: editorInfo.format();

	return {
		'X-Client-Application': application,
		'X-Client-Source': envService.getEditorPluginInfo().format(),
		'X-Client-Feature': callerInfo.toAscii().slice(0, 1000),
	};
}
