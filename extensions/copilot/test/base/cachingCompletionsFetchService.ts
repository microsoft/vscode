/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { outdent } from 'outdent';
import * as yaml from 'yaml';
import { IAuthenticationService } from '../../src/platform/authentication/common/authentication';
import * as fetcher from '../../src/platform/nesFetch/common/completionsFetchService';
import { ResponseStream } from '../../src/platform/nesFetch/common/responseStream';
import { CompletionsFetchService, FetchResponse, IFetchRequestParams } from '../../src/platform/nesFetch/node/completionsFetchServiceImpl';
import { getRequestId } from '../../src/platform/networking/common/fetch';
import { IFetcherService } from '../../src/platform/networking/common/fetcherService';
import { IRequestLogger } from '../../src/platform/requestLogger/node/requestLogger';
import { LockMap } from '../../src/util/common/lock';
import { Result } from '../../src/util/common/result';
import { AsyncIterableObject, DeferredPromise, IThrottledWorkerOptions, ThrottledWorker } from '../../src/util/vs/base/common/async';
import { CachedFunction } from '../../src/util/vs/base/common/cache';
import { CancellationToken } from '../../src/util/vs/base/common/cancellation';
import { assertType } from '../../src/util/vs/base/common/types';
import { OPENAI_FETCHER_CACHE_SALT } from '../cacheSalt';
import { IJSONOutputPrinter } from '../jsonOutputPrinter';
import { InterceptedRequest, ISerialisedChatResponse, OutputType } from '../simulation/shared/sharedTypes';
import { CachedResponseMetadata, CachedTestInfo } from './cachingChatMLFetcher';
import { emptyFetcherResponse, ICacheableCompletionsResponse, ICompletionsCache } from './completionsCache';
import { computeSHA256 } from './hash';
import { CacheMode } from './simulationContext';
import { FetchRequestCollector } from './spyingChatMLFetcher';
import { drainStdoutAndExit } from './stdout';

export class CacheableCompletionRequest {
	readonly hash: string;
	private readonly obj: unknown;

	constructor(url: string, options: fetcher.Completions.Internal.FetchOptions) {
		const cacheSalt = OPENAI_FETCHER_CACHE_SALT.getByUrl(url);
		this.obj = { url, body: options.body };
		this.hash = computeSHA256(cacheSalt + JSON.stringify(this.obj));
	}

	toJSON() {
		return this.obj;
	}
}

export class CachingCompletionsFetchService extends CompletionsFetchService {

	private static readonly Locks = new LockMap();

	/** Throttle per URL (currently set to send a request only once a second) */
	private static readonly throttlers = new CachedFunction(
		function createThrottler(url: string) {
			const delayMs = 1000; // milliseconds
			const options: IThrottledWorkerOptions = {
				maxBufferedWork: undefined, // We want to hold as many requests as possible
				maxWorkChunkSize: 1,
				waitThrottleDelayBetweenWorkUnits: true,
				throttleDelay: delayMs,
			};
			return new ThrottledWorker<() => Promise<void>>(options, async (tasks) => {
				for (const task of tasks) {
					task();
				}
			});
		}
	);

	private requests: Map<string /* requestId */, { request: CacheableCompletionRequest; hitsCache: boolean }> = new Map(); // this's dirty hack to pass info from lower layer _fetchFromUrl to _fetch -- needs rewriting

	constructor(
		private readonly nesCache: ICompletionsCache,
		private readonly testInfo: CachedTestInfo,
		private readonly cacheMode: CacheMode,
		private readonly requestCollector: FetchRequestCollector,
		private readonly isNoFetchModeEnabled: boolean,
		@IJSONOutputPrinter private readonly jsonOutputPrinter: IJSONOutputPrinter,
		@IAuthenticationService authService: IAuthenticationService,
		@IFetcherService fetcherService: IFetcherService,
		@IRequestLogger requestLogger: IRequestLogger,
	) {
		super(authService, fetcherService, requestLogger);
	}

	public override async fetch(url: string, secretKey: string, params: IFetchRequestParams, requestId: string, ct: CancellationToken, headerOverrides?: Record<string, string>): Promise<Result<ResponseStream, fetcher.Completions.CompletionsFetchFailure>> {
		const interceptedRequest = new DeferredPromise<InterceptedRequest>();
		this.requestCollector.addInterceptedRequest(interceptedRequest.p);
		const r = await super.fetch(url, secretKey, params, requestId, ct, headerOverrides);

		const request = params.prompt;

		const requestOptions = {
			...params,
			request
		};

		const requestCachingInfo = this.requests.get(requestId);
		this.requests.delete(requestId);
		assertType(requestCachingInfo, 'request must be set');

		const requestHitsCache = requestCachingInfo.hitsCache;
		const cacheKey = requestCachingInfo.request.hash;

		const model = inventModelFromURI(url);

		if (r.isOk()) {
			const startTime = new Date();
			const requestTime = startTime.toISOString();
			r.val.response.then(response => {
				const elapsedTime = Date.now() - startTime.valueOf();
				const cacheMetadata = {
					requestDuration: elapsedTime,
					requestTime
				};
				const serializedResponse: ISerialisedChatResponse =
					response.isOk()
						? {
							type: 'success',
							cacheKey,
							isCacheHit: requestHitsCache,
							cacheMetadata,
							requestId,
							value: [response.val.choices[0].text ?? ''],
						}
						: {
							type: response.err.name,
							cacheKey,
							isCacheHit: requestHitsCache,
							requestId,
							value: [response.err.stack ? response.err.stack : response.err.message],
						};
				interceptedRequest.complete(new InterceptedRequest(request, requestOptions, serializedResponse, cacheKey, model));
			});
		} else {
			const response: ISerialisedChatResponse = {
				type: r.err.kind,
				cacheKey,
				isCacheHit: requestHitsCache,
				requestId,
				value: [r.err.kind],
			};
			interceptedRequest.complete(new InterceptedRequest(request, requestOptions, response, cacheKey, model));
		}

		return r;
	}

	protected override async _fetchFromUrl(
		url: string,
		options: fetcher.Completions.Internal.FetchOptions,
		ct: CancellationToken
	): Promise<Result<FetchResponse, fetcher.Completions.CompletionsFetchFailure>> {

		const request = new CacheableCompletionRequest(url, options);

		if (this.cacheMode === CacheMode.Disable) {
			this.requests.set(options.requestId, { request, hitsCache: false });
			return this._fetchFromUrlAndCache(request, url, options, ct);
		}

		return CachingCompletionsFetchService.Locks.withLock(request.hash, async () => {
			const cachedValue = await this.nesCache.get(request, this.testInfo.cacheSlot);
			if (cachedValue) {
				this.requests.set(options.requestId, { request, hitsCache: true });
				return Result.ok(ICacheableCompletionsResponse.toFetchResponse(cachedValue));
			}

			if (this.cacheMode === CacheMode.Require) {
				prettyPrintJsonEncodedObject(options.body);
				await this.throwCacheMissing(request);
			}

			try {
				this.requests.set(options.requestId, { request, hitsCache: false });
			} catch (err) {
				if (/Key already exists/.test(err.message)) {
					prettyPrintJsonEncodedObject(options.body);
					console.log(`\n✗ ${err.message}`);
					await drainStdoutAndExit(1);
				}

				throw err;
			}
			return this._fetchFromUrlAndCache(request, url, options, ct);
		});
	}

	private async _fetchFromUrlAndCache(
		request: CacheableCompletionRequest,
		url: string,
		options: fetcher.Completions.Internal.FetchOptions,
		ct: CancellationToken,
	): Promise<Result<FetchResponse, fetcher.Completions.CompletionsFetchFailure>> {

		const throttler = CachingCompletionsFetchService.throttlers.get(url);

		let startTime: number | undefined;
		const fetchResult: Result<FetchResponse, fetcher.Completions.CompletionsFetchFailure> =
			this.isNoFetchModeEnabled
				? Result.ok({
					requestId: getRequestId(new Headers()),
					status: 200,
					statusText: '',
					headers: new Headers(),
					body: AsyncIterableObject.fromArray(['']),
					response: emptyFetcherResponse(new Headers()),
				} satisfies FetchResponse)
				: await new Promise((resolve, reject) => {
					throttler.work([
						async () => {
							try {
								startTime = Date.now();
								const r = await super._fetchFromUrl(url, options, ct);
								resolve(r);
							} catch (e) {
								reject(e);
							}
						}
					]);
				});

		if (fetchResult.isError() || fetchResult.val.status !== 200) { // don't cache a failure
			console.log('Fetch failed', JSON.stringify(fetchResult, null, '\t'));
			return fetchResult;
		}

		const response = fetchResult.val;
		const stream = response.body;

		const isCachingEnabled = this.cacheMode !== CacheMode.Disable && !this.isNoFetchModeEnabled;

		let body = '';
		const cachingStream = new AsyncIterableObject<string>(async (emitter) => {
			// I specifically don't wrap in try-catch to not cache if this throws
			for await (const chunk of stream) {
				body += chunk.toString();
				emitter.emitOne(chunk);
			}
			if (isCachingEnabled) {
				const fetchingResponseTimeInMs = Date.now() - startTime!;
				const cacheMetadata: CachedResponseMetadata = {
					testName: this.testInfo.testName,
					requestDuration: fetchingResponseTimeInMs,
					requestTime: new Date().toISOString()
				};
				this.nesCache
					.set(request, this.testInfo.cacheSlot, ICacheableCompletionsResponse.create(options.requestId, cacheMetadata, response.status, response.statusText, body))
					.catch(err => {
						console.error(err);
						console.log('Failed to cache response', JSON.stringify(fetchResult, null, '\t'));
					});
			}
		});

		// Replace response.body with the caching stream
		response.body = cachingStream;

		return fetchResult;
	}

	private throwCacheMissing(request: CacheableCompletionRequest) {
		const message = outdent`
            ✗ Cache entry not found for a request generated by test "${this.testInfo.testName}"!
            - Valid cache entries are currently required for all requests!
            - The missing request has the hash: ${request.hash} (cache slot ${this.testInfo.cacheSlot}, make sure to call simulate -- -n=10).`;

		console.log(message);
		yaml.stringify(request);

		const reason = outdent`
            Terminated because of --require-cache
            ${message}`;

		this.jsonOutputPrinter.print({ type: OutputType.terminated, reason });

		return drainStdoutAndExit(1);
	}
}

function inventModelFromURI(uri: string): string | undefined {
	const lastSlash = uri.lastIndexOf('/');
	if (lastSlash === -1) {
		return uri;
	}
	const secondLastSlash = uri.lastIndexOf('/', lastSlash - 1);
	return uri.substring(secondLastSlash + 1);
}

function prettyPrintJsonEncodedObject(obj: string) {
	console.log(
		JSON.stringify(
			JSON.parse(obj, (key, value) => {
				if (typeof value === 'string') {
					const split = value.split(/\n/g);
					return split.length > 1 ? split : value;
				}
				return value;
			}),
			null,
			4
		)
	);
}
