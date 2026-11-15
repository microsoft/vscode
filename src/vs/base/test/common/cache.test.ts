/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../common/async.js';
import { Cache, CachedFunction, LRUCachedFunction } from '../../common/cache.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('Cache', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('simple value', () => {
		let counter = 0;
		const cache = new Cache(_ => Promise.resolve(counter++));

		return cache.get().promise
			.then(c => assert.strictEqual(c, 0), () => assert.fail('Unexpected assertion error'))
			.then(() => cache.get().promise)
			.then(c => assert.strictEqual(c, 0), () => assert.fail('Unexpected assertion error'));
	});

	test('simple error', () => {
		let counter = 0;
		const cache = new Cache(_ => Promise.reject(new Error(String(counter++))));

		return cache.get().promise
			.then(() => assert.fail('Unexpected assertion error'), err => assert.strictEqual(err.message, '0'))
			.then(() => cache.get().promise)
			.then(() => assert.fail('Unexpected assertion error'), err => assert.strictEqual(err.message, '0'));
	});

	test('should retry cancellations', () => {
		let counter1 = 0, counter2 = 0;

		const cache = new Cache(token => {
			counter1++;
			return Promise.resolve(timeout(2, token).then(() => counter2++));
		});

		assert.strictEqual(counter1, 0);
		assert.strictEqual(counter2, 0);
		let result = cache.get();
		assert.strictEqual(counter1, 1);
		assert.strictEqual(counter2, 0);
		result.promise.then(undefined, () => assert(true));
		result.dispose();
		assert.strictEqual(counter1, 1);
		assert.strictEqual(counter2, 0);

		result = cache.get();
		assert.strictEqual(counter1, 2);
		assert.strictEqual(counter2, 0);

		return result.promise
			.then(c => {
				assert.strictEqual(counter1, 2);
				assert.strictEqual(counter2, 1);
			})
			.then(() => cache.get().promise)
			.then(c => {
				assert.strictEqual(counter1, 2);
				assert.strictEqual(counter2, 1);
			});
	});

	test('LRUCachedFunction with initial undefined key', () => {
		let callCount = 0;
		const cached = new LRUCachedFunction((arg?: string) => {
			callCount++;
			return arg ? `val:${arg}` : 'default';
		});

		assert.strictEqual(cached.get(undefined), 'default');
		assert.strictEqual(callCount, 1);
	});

	test('LRUCachedFunction with custom getCacheKey returning undefined', () => {
		let callCount = 0;
		const cached = new LRUCachedFunction(
			{ getCacheKey: (item: { id?: string }) => item.id },
			(item: { id?: string; data: number }) => {
				callCount++;
				return item.data * 2;
			}
		);

		assert.strictEqual(cached.get({ id: undefined, data: 5 }), 10);
		assert.strictEqual(callCount, 1);

		// Same undefined key should return cached result
		assert.strictEqual(cached.get({ id: undefined, data: 99 }), 10);
		assert.strictEqual(callCount, 1);
	});

	test('LRUCachedFunction alternating between undefined and defined keys', () => {
		let callCount = 0;
		const cached = new LRUCachedFunction((arg: string | undefined) => {
			callCount++;
			return arg === undefined ? 'is-undefined' : `str:${arg}`;
		});

		assert.strictEqual(cached.get(undefined), 'is-undefined');
		assert.strictEqual(callCount, 1);

		assert.strictEqual(cached.get(undefined), 'is-undefined');
		assert.strictEqual(callCount, 1);

		assert.strictEqual(cached.get('first'), 'str:first');
		assert.strictEqual(callCount, 2);

		assert.strictEqual(cached.get(undefined), 'is-undefined');
		assert.strictEqual(callCount, 3);
	});

	test('CachedFunction with custom cache key and cachedValues map', () => {
		let callCount = 0;
		const cached = new CachedFunction(
			{ getCacheKey: (item: { id: string }) => item.id },
			(item: { id: string; name: string }) => {
				callCount++;
				return item.name.toUpperCase();
			}
		);

		const first = { id: 'a', name: 'apple' };
		const second = { id: 'a', name: 'apricot' };
		const third = { id: 'b', name: 'banana' };

		assert.strictEqual(cached.get(first), 'APPLE');
		assert.strictEqual(callCount, 1);

		assert.strictEqual(cached.get(second), 'APPLE');
		assert.strictEqual(callCount, 1);

		assert.strictEqual(cached.get(third), 'BANANA');
		assert.strictEqual(callCount, 2);

		assert.strictEqual(cached.cachedValues.size, 2);
	});

	test('LRUCachedFunction with null and boolean keys', () => {
		let callCount = 0;
		const cached = new LRUCachedFunction((arg: boolean | null) => {
			callCount++;
			return arg === null ? 'null' : String(arg);
		});

		assert.strictEqual(cached.get(null), 'null');
		assert.strictEqual(callCount, 1);
		assert.strictEqual(cached.get(null), 'null');
		assert.strictEqual(callCount, 1);

		assert.strictEqual(cached.get(false), 'false');
		assert.strictEqual(callCount, 2);
		assert.strictEqual(cached.get(false), 'false');
		assert.strictEqual(callCount, 2);
	});
});
