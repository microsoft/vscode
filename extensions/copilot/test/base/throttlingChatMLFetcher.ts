/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type { CancellationToken } from 'vscode';
import { AbstractChatMLFetcher } from '../../src/extension/prompt/node/chatMLFetcher';
import { IChatMLFetcher, IFetchMLOptions } from '../../src/platform/chat/common/chatMLFetcher';
import { ChatFetchResponseType, ChatResponses } from '../../src/platform/chat/common/commonTypes';
import { IConversationOptions } from '../../src/platform/chat/common/conversationOptions';
import { IThrottledWorkerOptions } from '../../src/util/vs/base/common/async';
import { SyncDescriptor } from '../../src/util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../src/util/vs/platform/instantiation/common/instantiation';
import { PausableThrottledWorker } from './pausableThrottledWorker';

/**
 * Configures a maximum number of requests to start either per second or per minute
 *
 * **NOTE**: The number of requests running in parallel could be higher than this,
 * this enforces just the maximum number of requests that start.
 */
export type ThrottlingLimits = Record<string, { limit: number; type: 'RPS' | 'RPM' }>;

export class ChatModelThrottlingTaskLaunchers {
	private _throttlers = new Map<string, PausableThrottledWorker<() => Promise<void>>>();
	private readonly _limits: ThrottlingLimits;
	private _rateLimitBackoff = new Map<string, Promise<void>>();
	private _inFlightRequests = new Map<string, Set<Promise<void>>>();

	constructor(limits: ThrottlingLimits) {
		this._limits = limits;
	}

	private getInFlightRequests(model: string): Set<Promise<void>> {
		if (!this._inFlightRequests.has(model)) {
			this._inFlightRequests.set(model, new Set());
		}
		return this._inFlightRequests.get(model)!;
	}

	getThrottler(model: string): PausableThrottledWorker<() => Promise<void>> {
		if (!this._throttlers.has(model)) {
			// If no limit is configured, the default limit is 1 RPS.
			if (!this._limits[model]) {
				this._limits[model] = { limit: 1, type: 'RPS' };
			}
			const limit = this._limits[model].type === 'RPM' ? this._limits[model].limit : (this._limits[model].limit * 60);
			const options: IThrottledWorkerOptions = {
				maxBufferedWork: undefined, // We want to hold as many requests as possible
				maxWorkChunkSize: 1,
				waitThrottleDelayBetweenWorkUnits: true,
				throttleDelay: Math.ceil(60000 / limit)
			};
			this._throttlers.set(model, new PausableThrottledWorker(options, async (tasks) => {
				for (const task of tasks) {
					await task();
				}
			}));
		}
		return this._throttlers.get(model)!;
	}

	isPaused(model: string): boolean {
		return this._throttlers.get(model)?.isPaused() ?? false;
	}

	pauseProcessing(model: string): void {
		this.getThrottler(model).pause();
	}

	resumeProcessing(model: string): void {
		this.getThrottler(model).resume();
	}

	/**
	 * Handles rate limit responses by implementing exponential backoff.
	 * This updated version uses a shared “backoff chain” to ensure that multiple inflight
	 * requests for the same model do not all retry at the same time.
	 *
	 * @param model The chat model that was rate limited
	 * @param baseDelay The base delay in milliseconds (usually from the retryAfter value)
	 * @returns Whether the request should be retried
	 */
	async handleRateLimit(model: string, baseDelay: number, retryCount: number): Promise<boolean> {
		this.pauseProcessing(model);
		if (retryCount > 3) {
			return false; // Do not retry after too many attempts.
		}

		// If any backoff is already in progress for this model, wait for it first.
		const ongoingBackoff = this._rateLimitBackoff.get(model);
		if (ongoingBackoff) {
			await ongoingBackoff;
		}

		// Calculate exponential backoff delay: 1x, 2x, 3x…
		const delay = baseDelay * retryCount;

		// Create a new backoff promise and set it as active for this model.
		const backoffPromise = new Promise<void>(resolve => {
			setTimeout(resolve, delay);
		});
		this._rateLimitBackoff.set(model, backoffPromise);
		await backoffPromise;
		this._rateLimitBackoff.delete(model);

		return true; // Indicate we should retry.
	}

	/**
	 * Execute a request with retry logic for rate limits.
	 * @param model The chat model to use
	 * @param requestFn The function that performs the actual request
	 * @returns The result from the request function
	 */
	async executeWithRateLimitHandling(
		model: string,
		requestFn: () => Promise<ChatResponses>
	): Promise<ChatResponses> {
		let result!: ChatResponses;
		let continueRetrying = true;
		const inFlightRequests = this.getInFlightRequests(model);

		const cleanup = () => {
			inFlightRequests.delete(promise);
			// Only resume processing if there are no more in-flight requests
			if (inFlightRequests.size === 0) {
				this.resumeProcessing(model);
			}
		};

		const promise = (async () => {
			let retryCount = 1;
			try {
				while (continueRetrying) {
					result = await requestFn();
					if (result.type === ChatFetchResponseType.RateLimited) {
						// Minimum wait should be 5 seconds
						result.retryAfter ??= Math.max(5, result.retryAfter || 0);
						// Convert the retryAfter value in seconds to milliseconds.
						const retryAfterMs = result.retryAfter * 1000;
						const shouldRetry = await this.handleRateLimit(model, retryAfterMs, retryCount);
						if (shouldRetry) {
							retryCount++;
							continueRetrying = true;
							continue;
						}
					}
					// On successful (or non‑rate‑limited) responses:
					continueRetrying = false;
				}
			} finally {
				cleanup();
			}
		})();

		inFlightRequests.add(promise);
		await promise;
		return result;
	}
}

export class ThrottlingChatMLFetcher extends AbstractChatMLFetcher {

	private readonly _fetcher: IChatMLFetcher;

	constructor(
		fetcherDescriptor: SyncDescriptor<IChatMLFetcher>,
		private readonly _modelTaskLaunchers: ChatModelThrottlingTaskLaunchers,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConversationOptions options: IConversationOptions,
	) {
		super(options);
		this._fetcher = instantiationService.createInstance(fetcherDescriptor);
	}

	override async fetchMany(opts: IFetchMLOptions, token: CancellationToken): Promise<ChatResponses> {
		const taskLauncher = this._modelTaskLaunchers.getThrottler(opts.endpoint.model);

		return new Promise<ChatResponses>((resolve, reject) => {
			taskLauncher.work([async () => {
				try {
					const result = await this._modelTaskLaunchers.executeWithRateLimitHandling(opts.endpoint.model, () =>
						this._fetcher.fetchMany(opts, token)
					);
					resolve(result);
				} catch (error) {
					reject(error);
				}
			}]);
		});
	}
}
