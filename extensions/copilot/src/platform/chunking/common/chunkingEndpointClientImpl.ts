/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RequestType } from '@vscode/copilot-api';
import { CallTracker } from '../../../util/common/telemetryCorrelationId';
import { coalesce } from '../../../util/vs/base/common/arrays';
import { DeferredPromise, raceCancellationError, timeout } from '../../../util/vs/base/common/async';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { LinkedList } from '../../../util/vs/base/common/linkedList';
import { isFalsyOrWhitespace } from '../../../util/vs/base/common/strings';
import { Range } from '../../../util/vs/editor/common/core/range';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { Embedding, EmbeddingType, EmbeddingVector } from '../../embeddings/common/embeddingsComputer';
import { IEnvService } from '../../env/common/envService';
import { getGithubMetadataHeaders } from '../../github/common/githubApiFetcherService';
import { logExecTime } from '../../log/common/logExecTime';
import { ILogService } from '../../log/common/logService';
import { Response } from '../../networking/common/fetcherService';
import { postRequest } from '../../networking/common/networking';
import { IExperimentationService } from '../../telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../telemetry/common/telemetry';
import { getWorkspaceFileDisplayPath, IWorkspaceService } from '../../workspace/common/workspaceService';
import { FileChunkWithEmbedding, FileChunkWithOptionalEmbedding } from './chunk';
import { ChunkableContent, ComputeBatchInfo, EmbeddingsComputeQos, IChunkingEndpointClient } from './chunkingEndpointClient';
import { stripChunkTextMetadata } from './chunkingStringUtils';

type RequestTask = (attempt: number) => Promise<Response>;

class RequestRateLimiter extends Disposable {
	private static readonly _abuseLimit = 1000.0 / 40.0; // 40 requests per second. Actually more like 20 but that causes too much stalling

	private readonly _maxParallelChunksRequests: number;

	/** Max number of times to retry a request before failing. */
	private readonly _maxAttempts = 3;

	/**
	 * Target quota usage percentage that we want to maintain.
	 *
	 * Anything under this will be sent as fast as possible. Once we go over this, we start sending requests slower
	 * and slower as we approach 100% quota usage.
	 */
	private readonly targetQuota = 80; // %

	private readonly requestQueue = new LinkedList<{
		readonly task: RequestTask;
		readonly attempt: number;
		readonly deferred: DeferredPromise<Response>;
		readonly token: CancellationToken;
	}>();

	// State
	private _numberInFlightRequests = 0;
	private _lastSendTime = Date.now();

	/** Timeout for the Github rate limit headers */
	private _rateLimitTimeout?: Promise<void>;

	/** The most recent status for the Github rate limit headers */
	private _latestRateLimitHint?: {
		readonly timestamp: number;
		readonly remaining: number;
		readonly resetAt: number;
	};

	/** The most recent status for the Github quota header */
	private _latestQuotaUsed?: {
		readonly timestamp: number;
		readonly quota: number;
	};

	constructor(
		@IExperimentationService experimentationService: IExperimentationService,
	) {
		super();

		this._maxParallelChunksRequests = experimentationService.getTreatmentVariable<number>('workspace.embeddingIndex.maxParallelChunksRequests') ?? 8;
	}

	public enqueue(task: RequestTask, token: CancellationToken): Promise<Response> {
		const deferred = new DeferredPromise<Response>();
		token.onCancellationRequested(() => deferred.cancel());

		this.requestQueue.push({ task, attempt: 0, deferred, token });
		this.pump();
		return deferred.p;
	}

	private _isPumping = false;

	private async pump(): Promise<void> {
		if (this._isPumping) {
			return;
		}

		try {
			this._isPumping = true;
			while (!this.requestQueue.isEmpty()) {
				if (this._rateLimitTimeout) {
					await this._rateLimitTimeout;
					this._rateLimitTimeout = undefined;
				}

				const elapsedSinceLastSend = Date.now() - this._lastSendTime;
				if (elapsedSinceLastSend < RequestRateLimiter._abuseLimit) {
					await timeout(RequestRateLimiter._abuseLimit - elapsedSinceLastSend);
				}

				if (this._numberInFlightRequests >= this._maxParallelChunksRequests) {
					await timeout(10);
					continue; // Check again
				}

				// Check the global github rate limit
				if (this._latestRateLimitHint) {
					const currentTime = Date.now();
					if (currentTime < this._latestRateLimitHint.resetAt) {
						if (this._latestRateLimitHint.remaining - this._numberInFlightRequests <= 0) {
							// There are no remaining requests, wait until reset
							const resetTimeSpan = this._latestRateLimitHint.resetAt - currentTime;
							await timeout(Math.min(resetTimeSpan, 2_000));
						}
					}
				}

				// Check the quota percent
				if (this._latestQuotaUsed && this._latestQuotaUsed.quota > this.targetQuota) {
					const currentTime = Date.now();
					const quotaDelta = this._latestQuotaUsed.quota - this.targetQuota;
					const quotaDeltaTime = currentTime - this._latestQuotaUsed.timestamp;

					const decayTime = 2500; // Estimated time for quota to reset
					const maxDelay = 1000;

					let quotaAdjustment = (quotaDelta / (100 - this.targetQuota));
					quotaAdjustment *= Math.max(1.0 - (quotaDeltaTime / decayTime), 0); // Adjust by time passed

					const delay = quotaAdjustment * maxDelay;
					if (delay > 0) {
						await timeout(Math.min(delay, maxDelay));
					}
				}

				const e = this.requestQueue.shift()!;
				if (e.token.isCancellationRequested) {
					e.deferred.cancel();
					continue;
				}

				// Send the request
				this._numberInFlightRequests++;
				this._lastSendTime = Date.now();

				const request = e.task(e.attempt);
				request.then(response => {
					this.updateQuotasFromResponse(response);

					if (e.token.isCancellationRequested) {
						e.deferred.cancel();
						return;
					}

					if (response.ok) {
						e.deferred.complete(response);
						return;
					}

					// Request failed, see if we can retry
					if (e.attempt < this._maxAttempts) {
						if (response.status === 429 || response.status === 403 || response.status === 408) {
							const retryAfter_seconds = this.getRequestRetryDelay(response);
							if (retryAfter_seconds > 0) {
								this._rateLimitTimeout = timeout(retryAfter_seconds * 1000);
							}

							// Add back into the queue
							this.requestQueue.unshift({ task: e.task, attempt: e.attempt + 1, deferred: e.deferred, token: e.token });
							this.pump();
							return;
						}
					}

					// Unknown failure or max attempts reached, complete  the failed response
					e.deferred.complete(response);
				}).catch(err => {
					e.deferred.error(err);
				}).finally(() => {
					this._numberInFlightRequests--;
				});
			}
		} finally {
			this._isPumping = false;
		}
	}

	private updateQuotasFromResponse(response: Response) {
		const timestamp = Date.now();
		try {
			const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');
			const rateLimitReset = response.headers.get('x-ratelimit-reset');
			if (rateLimitRemaining && rateLimitReset) {
				this._latestRateLimitHint = {
					timestamp: timestamp,
					remaining: parseFloat(rateLimitRemaining),
					resetAt: parseFloat(rateLimitReset) * 1000, // convert to ms
				};
			}

			const totalQuotaUsed = response.headers.get('x-github-total-quota-used');
			if (totalQuotaUsed) {
				if (this._latestQuotaUsed) {
					this._latestQuotaUsed = {
						timestamp: timestamp,
						quota: parseFloat(totalQuotaUsed)
					};
				} else {
					this._latestQuotaUsed = {
						timestamp: timestamp,
						quota: parseFloat(totalQuotaUsed),
					};
				}
			}
		} catch (e) {
			console.error('Error parsing rate limit headers', e);
			// Ignore errors
		}
	}

	/**
	 * Get the retry delay for a request based on the response.
	 *
	 * @returns The retry delay in seconds.
	 */
	private getRequestRetryDelay(response: Response) {
		// Check `retry-after` header
		try {
			const retryAfterHeader = response.headers.get('retry-after');
			if (retryAfterHeader) {
				const intValue = parseFloat(retryAfterHeader);
				if (!isNaN(intValue)) {
					return intValue;
				}
			}
		} catch {
			// Noop
		}

		// Fallback to `x-ratelimit-reset` header
		try {
			const resetHeader = response.headers.get('x-ratelimit-reset');
			if (resetHeader) {
				const intValue = parseFloat(resetHeader);
				if (!isNaN(intValue)) {
					const currentEpochSeconds = Math.floor(Date.now() / 1000);
					return intValue - currentEpochSeconds;
				}
			}
		} catch {
			// Noop
		}

		// Seeing if the request timed out which lets us use a faster retry
		if (response.status === 408) {
			return 0.25;
		}

		// Otherwise use a generic timeout
		return 2;
	}
}

type ChunksEndpointResponse = {
	readonly chunks: readonly {
		readonly hash: string;
		readonly range: { start: number; end: number };
		readonly line_range: { start: number; end: number };
		readonly text?: string;
		readonly embedding?: { model: string; embedding: EmbeddingVector };
	}[];

	readonly embedding_model: string;
};

export class ChunkingEndpointClientImpl extends Disposable implements IChunkingEndpointClient {
	declare readonly _serviceBrand: undefined;

	/**
	 * Limiter for request to the chunks endpoint.
	 */
	private readonly _requestLimiter: RequestRateLimiter;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IEnvService private readonly _envService: IEnvService,
		@ILogService private readonly _logService: ILogService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IWorkspaceService private readonly _workspaceService: IWorkspaceService,
	) {
		super();

		this._requestLimiter = this._register(this._instantiationService.createInstance(RequestRateLimiter));
	}

	public computeChunks(authToken: string, embeddingType: EmbeddingType, content: ChunkableContent, batchInfo: ComputeBatchInfo, qos: EmbeddingsComputeQos, cache: ReadonlyMap<string, FileChunkWithEmbedding> | undefined, telemetryInfo: CallTracker, token: CancellationToken): Promise<readonly FileChunkWithOptionalEmbedding[] | undefined> {
		return this.doComputeChunksAndEmbeddings(authToken, embeddingType, content, batchInfo, { qos, computeEmbeddings: false }, cache, telemetryInfo, token);
	}

	public async computeChunksAndEmbeddings(authToken: string, embeddingType: EmbeddingType, content: ChunkableContent, batchInfo: ComputeBatchInfo, qos: EmbeddingsComputeQos, cache: ReadonlyMap<string, FileChunkWithEmbedding> | undefined, telemetryInfo: CallTracker, token: CancellationToken): Promise<readonly FileChunkWithEmbedding[] | undefined> {
		const result = await this.doComputeChunksAndEmbeddings(authToken, embeddingType, content, batchInfo, { qos, computeEmbeddings: true }, cache, telemetryInfo, token);
		return result as FileChunkWithEmbedding[] | undefined;
	}

	private async doComputeChunksAndEmbeddings(
		authToken: string,
		embeddingType: EmbeddingType,
		content: ChunkableContent,
		batchInfo: ComputeBatchInfo,
		options: {
			qos: EmbeddingsComputeQos;
			computeEmbeddings: boolean;
		},
		cache: ReadonlyMap<string, FileChunkWithEmbedding> | undefined,
		telemetryInfo: CallTracker,
		token: CancellationToken
	): Promise<readonly FileChunkWithOptionalEmbedding[] | undefined> {
		const text = await raceCancellationError(content.getText(), token);
		if (isFalsyOrWhitespace(text)) {
			return [];
		}

		try {
			const makeRequest = async (attempt: number) => {
				return logExecTime(this._logService, `ChunksEndpointEmbeddingComputer.fetchChunksRequest(${content.uri}, attempt=${attempt})`, () => this._instantiationService.invokeFunction(postRequest, {
					endpointOrUrl: { type: RequestType.Chunks },
					secretKey: authToken,
					intent: 'copilot-panel',
					requestId: '',
					body: {
						embed: options.computeEmbeddings,
						// Only to online set during re-ranking step
						qos: options.qos,
						content: text,
						path: getWorkspaceFileDisplayPath(this._workspaceService, content.uri),
						local_hashes: cache ? Array.from(cache.keys()) : [],
						language_id: content.githubLanguageId,
						embedding_model: embeddingType.id,
					} satisfies {
						embed: boolean;
						qos: string;
						content: string;
						path: string;
						local_hashes: string[];
						language_id: number | undefined;
						embedding_model: string;
					} as any,
					additionalHeaders: getGithubMetadataHeaders(telemetryInfo, this._envService),
					cancelToken: token,
				}));
			};

			batchInfo.recomputedFileCount++;
			batchInfo.sentContentTextLength += text.length;

			const response = await raceCancellationError(this._requestLimiter.enqueue(makeRequest, token), token);
			if (!response.ok) {
				this._logService.debug(`Error chunking '${content.uri}'. Status: ${response.status}. Status Text: ${response.statusText}.`);

				/* __GDPR__
					"workspaceChunkEmbeddingsIndex.computeChunksAndEmbeddings.error" : {
						"owner": "mjbvz",
						"comment": "Tracks errors from the chunks service",
						"source": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Caller of computeChunksAndEmbeddings" },
						"responseStatus": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Status code" }
					}
				*/
				this._telemetryService.sendMSFTTelemetryEvent('workspaceChunkEmbeddingsIndex.computeChunksAndEmbeddings.error', {
					source: telemetryInfo.toString(),
				}, {
					responseStatus: response.status,
				});

				return undefined;
			}

			const body: ChunksEndpointResponse = await response.json();
			if (!body.chunks.length) {
				return [];
			}

			return coalesce(body.chunks.map((chunk): FileChunkWithOptionalEmbedding | undefined => {
				const range = new Range(chunk.line_range.start, 0, chunk.line_range.end, 0);
				const cached = cache?.get(chunk.hash);
				if (cached) {
					return {
						chunk: {
							file: content.uri,
							text: stripChunkTextMetadata(cached.chunk.text),
							rawText: undefined,
							range,
							isFullFile: cached.chunk.isFullFile, // TODO: get from endpoint
						},
						chunkHash: chunk.hash,
						embedding: cached.embedding,
					};
				}

				if (typeof chunk.text !== 'string') {
					// Invalid chunk
					return undefined;
				}

				let embedding: Embedding | undefined;
				if (chunk.embedding?.embedding) {
					const returnedEmbeddingsType = new EmbeddingType(body.embedding_model);
					if (!returnedEmbeddingsType.equals(embeddingType)) {
						throw new Error(`Unexpected embedding model. Got: ${returnedEmbeddingsType}. Expected: ${embeddingType}`);
					}

					embedding = { type: returnedEmbeddingsType, value: chunk.embedding.embedding };
				}

				if (options.computeEmbeddings && !embedding) {
					// Invalid chunk
					return undefined;
				}

				return {
					chunk: {
						file: content.uri,
						text: stripChunkTextMetadata(chunk.text),
						rawText: undefined,
						range,
						isFullFile: false, // TODO: get from endpoint
					},
					chunkHash: chunk.hash,
					embedding: embedding
				};
			}));

		} catch (e) {
			this._logService.error(e);
			return undefined;
		}
	}
}
