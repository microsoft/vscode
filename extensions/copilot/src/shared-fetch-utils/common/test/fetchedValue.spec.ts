/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FetchedValue, FetchedValueOptions } from '../fetchedValue';
import { FetchBlockedError } from '../fetchTypes';

interface TestToken {
	value: string;
	expiresAt: number;
}

describe('FetchedValue', () => {
	let fetchCount: number;
	let nextToken: TestToken;
	let fetchedValue: FetchedValue<TestToken>;

	function createFetchedValue(overrides?: Partial<FetchedValueOptions<TestToken>>): FetchedValue<TestToken> {
		return new FetchedValue({
			fetch: async () => {
				fetchCount++;
				return nextToken;
			},
			isStale: token => token.expiresAt < Date.now(),
			...overrides,
		});
	}

	beforeEach(() => {
		fetchCount = 0;
		nextToken = { value: 'token-1', expiresAt: Date.now() + 60_000 };
		fetchedValue = createFetchedValue();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('value is undefined before first resolve', () => {
		expect(fetchedValue.value).toBeUndefined();
	});

	it('resolve fetches and caches the value', async () => {
		const result = await fetchedValue.resolve();
		expect(result).toBe(nextToken);
		expect(fetchedValue.value).toBe(nextToken);
		expect(fetchCount).toBe(1);
	});

	it('resolve returns cached value when not stale', async () => {
		await fetchedValue.resolve();
		nextToken = { value: 'token-2', expiresAt: Date.now() + 60_000 };
		const result = await fetchedValue.resolve();
		expect(result.value).toBe('token-1');
		expect(fetchCount).toBe(1);
	});

	it('resolve re-fetches when value is stale', async () => {
		nextToken = { value: 'token-1', expiresAt: Date.now() - 1 };
		await fetchedValue.resolve();
		expect(fetchCount).toBe(1);

		nextToken = { value: 'token-2', expiresAt: Date.now() + 60_000 };
		const result = await fetchedValue.resolve();
		expect(result.value).toBe('token-2');
		expect(fetchCount).toBe(2);
	});

	it('resolve with force bypasses staleness check', async () => {
		await fetchedValue.resolve();
		nextToken = { value: 'token-2', expiresAt: Date.now() + 60_000 };

		const result = await fetchedValue.resolve(true);
		expect(result.value).toBe('token-2');
		expect(fetchCount).toBe(2);
	});

	it('concurrent resolves coalesce into a single fetch', async () => {
		const [a, b, c] = await Promise.all([
			fetchedValue.resolve(),
			fetchedValue.resolve(),
			fetchedValue.resolve(),
		]);
		expect(fetchCount).toBe(1);
		expect(a).toBe(b);
		expect(b).toBe(c);
	});

	it('fetch error propagates and does not cache', async () => {
		const fv = createFetchedValue({
			fetch: async () => { throw new Error('network failure'); },
		});

		await expect(fv.resolve()).rejects.toThrow('network failure');
		expect(fv.value).toBeUndefined();
	});

	it('FetchBlockedError returns cached value when one exists', async () => {
		let shouldBlock = false;
		const fv = new FetchedValue<TestToken>({
			fetch: async () => {
				if (shouldBlock) {
					throw new FetchBlockedError('blocked', 5000);
				}
				return { value: 'good-value', expiresAt: Date.now() + 60_000 };
			},
			isStale: () => true,
		});
		await fv.resolve();
		expect(fv.value!.value).toBe('good-value');

		shouldBlock = true;
		const result = await fv.resolve();
		expect(result.value).toBe('good-value');
	});

	it('FetchBlockedError propagates when no cached value exists', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(100);
		let blockedFetchCount = 0;
		const fv = new FetchedValue<TestToken>({
			fetch: async () => {
				blockedFetchCount++;
				throw new FetchBlockedError('blocked', 5000);
			},
			isStale: () => true,
		});

		await expect(fv.resolve()).rejects.toThrow('blocked');
		vi.advanceTimersByTime(4999);
		await expect(fv.resolve()).rejects.toThrow('blocked');
		expect(blockedFetchCount).toBe(1);

		vi.advanceTimersByTime(1);
		await expect(fv.resolve()).rejects.toThrow('blocked');
		expect(blockedFetchCount).toBe(2);
		expect(fv.value).toBeUndefined();
	});

	it('uses the configured retry delay for other errors', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(100);
		let failedFetchCount = 0;
		const fv = new FetchedValue<TestToken>({
			fetch: async () => {
				failedFetchCount++;
				throw new Error('network failure');
			},
			isStale: () => true,
			getRetryAfterMs: () => 5000,
		});

		await expect(fv.resolve()).rejects.toThrow('network failure');
		vi.advanceTimersByTime(4999);
		await expect(fv.resolve()).rejects.toThrow('network failure');
		expect(failedFetchCount).toBe(1);

		vi.advanceTimersByTime(1);
		await expect(fv.resolve()).rejects.toThrow('network failure');
		expect(failedFetchCount).toBe(2);
	});

	it('configured retry delays suppress retries without hiding failures behind a cached value', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(100);
		let shouldFail = false;
		let fetchCount = 0;
		const fv = new FetchedValue<TestToken>({
			fetch: async () => {
				fetchCount++;
				if (shouldFail) {
					throw new Error('signed out');
				}
				return nextToken;
			},
			isStale: () => true,
			getRetryAfterMs: () => 5000,
		});

		await expect(fv.resolve()).resolves.toBe(nextToken);
		shouldFail = true;
		await expect(fv.resolve()).rejects.toThrow('signed out');
		await expect(fv.resolve()).rejects.toThrow('signed out');
		expect(fetchCount).toBe(2);

		vi.advanceTimersByTime(5000);
		await expect(fv.resolve()).rejects.toThrow('signed out');
		expect(fetchCount).toBe(3);
	});

	it('force bypasses a blocked failure and invalidate clears it', async () => {
		let shouldFail = true;
		let blockedFetchCount = 0;
		const fv = new FetchedValue<TestToken>({
			fetch: async () => {
				blockedFetchCount++;
				if (shouldFail) {
					throw new FetchBlockedError('blocked', 5000);
				}
				return nextToken;
			},
			isStale: () => true,
		});

		await expect(fv.resolve()).rejects.toThrow('blocked');
		shouldFail = false;
		await expect(fv.resolve(true)).resolves.toBe(nextToken);
		expect(blockedFetchCount).toBe(2);

		fv.invalidate();
		expect(fv.value).toBeUndefined();
	});

	it('invalidate prevents an older in-flight fetch from repopulating the cache', async () => {
		let resolveFirst: ((value: TestToken) => void) | undefined;
		const firstFetch = new Promise<TestToken>(resolve => resolveFirst = resolve);
		const newToken = { value: 'token-2', expiresAt: Date.now() + 60_000 };
		let fetchCount = 0;
		const fv = new FetchedValue<TestToken>({
			fetch: () => ++fetchCount === 1 ? firstFetch : Promise.resolve(newToken),
			isStale: () => false,
		});

		const firstResolve = fv.resolve();
		fv.invalidate();
		await expect(fv.resolve()).resolves.toBe(newToken);
		resolveFirst!(nextToken);
		await expect(firstResolve).resolves.toBe(nextToken);

		expect(fv.value).toBe(newToken);
	});

	it('dispose prevents further resolves', async () => {
		fetchedValue.dispose();
		await expect(fetchedValue.resolve()).rejects.toThrow('disposed');
	});

	describe('when T includes undefined', () => {
		it('does not re-fetch when the fetched value is undefined', async () => {
			let undefinedFetchCount = 0;
			const fv = new FetchedValue<string | undefined>({
				fetch: async () => {
					undefinedFetchCount++;
					return undefined;
				},
				isStale: () => false,
			});

			const first = await fv.resolve();
			expect(first).toBeUndefined();
			expect(undefinedFetchCount).toBe(1);

			const second = await fv.resolve();
			expect(second).toBeUndefined();
			expect(undefinedFetchCount).toBe(1); // should not re-fetch
		});
	});
});
