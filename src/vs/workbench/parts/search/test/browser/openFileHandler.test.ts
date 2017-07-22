/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import * as errors from 'vs/base/common/errors';
import * as objects from 'vs/base/common/objects';
import { TPromise } from 'vs/base/common/winjs.base';
import { CacheState } from 'vs/workbench/parts/search/browser/openFileHandler';
import { DeferredTPromise } from 'vs/base/test/common/utils';
import { QueryType, ISearchQuery } from 'vs/platform/search/common/search';

suite('CacheState', () => {

	test('reuse old cacheKey until new cache is loaded', function () {

		const cache = new MockCache();

		const first = createCacheState(cache);
		const firstKey = first.cacheKey;
		assert.strictEqual(first.isLoaded, false);
		assert.strictEqual(first.isUpdating, false);

		first.load();
		assert.strictEqual(first.isLoaded, false);
		assert.strictEqual(first.isUpdating, true);

		cache.loading[firstKey].complete(null);
		assert.strictEqual(first.isLoaded, true);
		assert.strictEqual(first.isUpdating, false);

		const second = createCacheState(cache, first);
		second.load();
		assert.strictEqual(second.isLoaded, true);
		assert.strictEqual(second.isUpdating, true);
		assert.strictEqual(Object.keys(cache.disposing).length, 0);
		assert.strictEqual(second.cacheKey, firstKey); // still using old cacheKey

		const secondKey = cache.cacheKeys[1];
		cache.loading[secondKey].complete(null);
		assert.strictEqual(second.isLoaded, true);
		assert.strictEqual(second.isUpdating, false);
		assert.strictEqual(Object.keys(cache.disposing).length, 1);
		assert.strictEqual(second.cacheKey, secondKey);
	});

	test('do not spawn additional load if previous is still loading', function () {

		const cache = new MockCache();

		const first = createCacheState(cache);
		const firstKey = first.cacheKey;
		first.load();
		assert.strictEqual(first.isLoaded, false);
		assert.strictEqual(first.isUpdating, true);
		assert.strictEqual(Object.keys(cache.loading).length, 1);

		const second = createCacheState(cache, first);
		second.load();
		assert.strictEqual(second.isLoaded, false);
		assert.strictEqual(second.isUpdating, true);
		assert.strictEqual(cache.cacheKeys.length, 2);
		assert.strictEqual(Object.keys(cache.loading).length, 1); // still only one loading
		assert.strictEqual(second.cacheKey, firstKey);

		cache.loading[firstKey].complete(null);
		assert.strictEqual(second.isLoaded, true);
		assert.strictEqual(second.isUpdating, false);
		assert.strictEqual(Object.keys(cache.disposing).length, 0);
	});

	test('do not use previous cacheKey if query changed', function () {

		const cache = new MockCache();

		const first = createCacheState(cache);
		const firstKey = first.cacheKey;
		first.load();
		cache.loading[firstKey].complete(null);
		assert.strictEqual(first.isLoaded, true);
		assert.strictEqual(first.isUpdating, false);
		assert.strictEqual(Object.keys(cache.disposing).length, 0);

		cache.baseQuery.excludePattern = { '**/node_modules': true };
		const second = createCacheState(cache, first);
		assert.strictEqual(second.isLoaded, false);
		assert.strictEqual(second.isUpdating, false);
		assert.strictEqual(Object.keys(cache.disposing).length, 1);

		second.load();
		assert.strictEqual(second.isLoaded, false);
		assert.strictEqual(second.isUpdating, true);
		assert.notStrictEqual(second.cacheKey, firstKey); // not using old cacheKey
		const secondKey = cache.cacheKeys[1];
		assert.strictEqual(second.cacheKey, secondKey);

		cache.loading[secondKey].complete(null);
		assert.strictEqual(second.isLoaded, true);
		assert.strictEqual(second.isUpdating, false);
		assert.strictEqual(Object.keys(cache.disposing).length, 1);
	});

	test('dispose propagates', function () {

		const cache = new MockCache();

		const first = createCacheState(cache);
		const firstKey = first.cacheKey;
		first.load();
		cache.loading[firstKey].complete(null);
		const second = createCacheState(cache, first);
		assert.strictEqual(second.isLoaded, true);
		assert.strictEqual(second.isUpdating, false);
		assert.strictEqual(Object.keys(cache.disposing).length, 0);

		second.dispose();
		assert.strictEqual(second.isLoaded, false);
		assert.strictEqual(second.isUpdating, false);
		assert.strictEqual(Object.keys(cache.disposing).length, 1);
		assert.ok(cache.disposing[firstKey]);
	});

	test('keep using old cacheKey when loading fails', function () {

		const cache = new MockCache();

		const first = createCacheState(cache);
		const firstKey = first.cacheKey;
		first.load();
		cache.loading[firstKey].complete(null);

		const second = createCacheState(cache, first);
		second.load();
		const secondKey = cache.cacheKeys[1];
		const origErrorHandler = errors.errorHandler.getUnexpectedErrorHandler();
		try {
			errors.setUnexpectedErrorHandler(() => null);
			cache.loading[secondKey].error('loading failed');
		} finally {
			errors.setUnexpectedErrorHandler(origErrorHandler);
		}
		assert.strictEqual(second.isLoaded, true);
		assert.strictEqual(second.isUpdating, false);
		assert.strictEqual(Object.keys(cache.loading).length, 2);
		assert.strictEqual(Object.keys(cache.disposing).length, 0);
		assert.strictEqual(second.cacheKey, firstKey); // keep using old cacheKey

		const third = createCacheState(cache, second);
		third.load();
		assert.strictEqual(third.isLoaded, true);
		assert.strictEqual(third.isUpdating, true);
		assert.strictEqual(Object.keys(cache.loading).length, 3);
		assert.strictEqual(Object.keys(cache.disposing).length, 0);
		assert.strictEqual(third.cacheKey, firstKey);

		const thirdKey = cache.cacheKeys[2];
		cache.loading[thirdKey].complete(null);
		assert.strictEqual(third.isLoaded, true);
		assert.strictEqual(third.isUpdating, false);
		assert.strictEqual(Object.keys(cache.loading).length, 3);
		assert.strictEqual(Object.keys(cache.disposing).length, 2);
		assert.strictEqual(third.cacheKey, thirdKey); // recover with next successful load
	});

	function createCacheState(cache: MockCache, previous?: CacheState): CacheState {
		return new CacheState(
			cacheKey => cache.query(cacheKey),
			query => cache.load(query),
			cacheKey => cache.dispose(cacheKey),
			previous
		);
	}

	class MockCache {

		public cacheKeys: string[] = [];
		public loading: { [cacheKey: string]: DeferredTPromise<any> } = {};
		public disposing: { [cacheKey: string]: DeferredTPromise<void> } = {};

		public baseQuery: ISearchQuery = {
			type: QueryType.File
		};

		public query(cacheKey: string): ISearchQuery {
			this.cacheKeys.push(cacheKey);
			return objects.assign({ cacheKey: cacheKey }, this.baseQuery);
		}

		public load(query: ISearchQuery): TPromise<any> {
			const promise = new DeferredTPromise<any>();
			this.loading[query.cacheKey] = promise;
			return promise;
		}

		public dispose(cacheKey: string): TPromise<void> {
			const promise = new DeferredTPromise<void>();
			this.disposing[cacheKey] = promise;
			return promise;
		}
	}
});
