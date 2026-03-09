/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LRUCache } from '../../../base/common/map.js';
import { extUriIgnorePathCase } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { IWebContentExtractorOptions, WebContentExtractResult } from '../common/webContentExtractor.js';

type CacheEntry = Readonly<{
	result: WebContentExtractResult;
	options: IWebContentExtractorOptions | undefined;
	expiration: number;
}>;

/**
 * A cache for web content extraction results.
 */
export class WebContentCache {
	private static readonly MAX_CACHE_SIZE = 1000;
	private static readonly SUCCESS_CACHE_DURATION = 1000 * 60 * 60 * 24; // 24 hours
	private static readonly ERROR_CACHE_DURATION = 1000 * 60 * 5; // 5 minutes

	private readonly _cache = new LRUCache<string, CacheEntry>(WebContentCache.MAX_CACHE_SIZE);

	/**
	 * Add a web content extraction result to the cache.
	 */
	public add(uri: URI, options: IWebContentExtractorOptions | undefined, result: WebContentExtractResult) {
		let expiration: number;
		switch (result.status) {
			case 'ok':
			case 'redirect':
				expiration = Date.now() + WebContentCache.SUCCESS_CACHE_DURATION;
				break;
			default:
				expiration = Date.now() + WebContentCache.ERROR_CACHE_DURATION;
				break;
		}

		const key = WebContentCache.getKey(uri, options);
		this._cache.set(key, { result, options, expiration });
	}

	/**
	 * Try to get a cached web content extraction result for the given URI and options.
	 */
	public tryGet(uri: URI, options: IWebContentExtractorOptions | undefined): WebContentExtractResult | undefined {
		const key = WebContentCache.getKey(uri, options);
		const entry = this._cache.get(key);
		if (entry === undefined) {
			return undefined;
		}

		if (entry.expiration < Date.now()) {
			this._cache.delete(key);
			return undefined;
		}

		return entry.result;
	}

	private static getKey(uri: URI, options: IWebContentExtractorOptions | undefined): string {
		return `${!!options?.followRedirects}${extUriIgnorePathCase.getComparisonKey(uri)}`;
	}
}
