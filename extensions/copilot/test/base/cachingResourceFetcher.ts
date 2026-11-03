/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ICache, SQLiteCache } from './cache';
import { CacheMode, CacheScope, CurrentTestRunInfo, ICachingResourceFetcher } from './simulationContext';

export const usedResourceCaches = new Set<string>();

class Request<T> {

	constructor(
		readonly input: T,
		readonly cacheScope: CacheScope,
		readonly cacheSalt: string,
		readonly inputCacheKey: string
	) {
	}

	get hash() {
		return `${this.cacheScope}:${this.cacheSalt}:${this.inputCacheKey}`;
	}

	toJSON() {
		return this.input;
	}
}

class ResourceFetcherSQLiteCache<I, R> extends SQLiteCache<Request<I>, R> {
	constructor(currentTestRunInfo: CurrentTestRunInfo) {
		super('resource', undefined, currentTestRunInfo);
	}
}

export class CachingResourceFetcher implements ICachingResourceFetcher {

	declare readonly _serviceBrand: undefined;

	private cache: ICache<Request<any>, any> | undefined;

	// needs to be static, otherwise concurrent writes will happen, since
	// many instances of this will be created
	private static Queues = new Map</* cache key */string, Promise<unknown>>();

	constructor(
		currentTestRunInfo: CurrentTestRunInfo,
		cacheMode: CacheMode
	) {
		this.cache = cacheMode !== CacheMode.Disable
			? new ResourceFetcherSQLiteCache(currentTestRunInfo)
			: undefined;
	}

	public async invokeWithCache<I, R>(cacheScope: CacheScope, input: I, cacheSalt: string, inputCacheKey: string, fn: (input: I) => Promise<R>): Promise<R> {
		if (!this.cache) {
			return await fn(input);
		}

		// serialize accesses to the same cache key
		const promise = Promise.resolve(CachingResourceFetcher.Queues.get(inputCacheKey)).then(async (): Promise<R> => {
			const request = new Request(input, cacheScope, cacheSalt, inputCacheKey);
			let result: R | undefined = await this.cache!.get(request);

			if (result === undefined) {
				result = await fn(input);
				await this.cache!.set(request, result);
			}

			return result;
		});

		CachingResourceFetcher.Queues.set(inputCacheKey, promise.catch(() => { }));

		return promise;
	}
}
