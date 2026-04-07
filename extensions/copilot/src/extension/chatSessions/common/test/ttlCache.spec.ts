/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SingleSlotTtlCache, TtlCache } from '../ttlCache';

describe('TtlCache', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('returns undefined for missing keys', () => {
		const cache = new TtlCache<string>(1000);
		expect(cache.get('missing')).toBeUndefined();
	});

	it('stores and retrieves values within TTL', () => {
		const cache = new TtlCache<number>(5000);
		cache.set('key', 42);
		expect(cache.get('key')).toBe(42);
	});

	it('expires entries after TTL elapses', () => {
		const cache = new TtlCache<string>(1000);
		cache.set('key', 'value');

		vi.advanceTimersByTime(999);
		expect(cache.get('key')).toBe('value');

		vi.advanceTimersByTime(1);
		expect(cache.get('key')).toBeUndefined();
	});

	it('supports multiple independent keys', () => {
		const cache = new TtlCache<string>(2000);
		cache.set('a', 'alpha');

		vi.advanceTimersByTime(1000);
		cache.set('b', 'beta');

		vi.advanceTimersByTime(1000);
		// 'a' was set 2000ms ago → expired
		expect(cache.get('a')).toBeUndefined();
		// 'b' was set 1000ms ago → still valid
		expect(cache.get('b')).toBe('beta');
	});

	it('overwrites existing entry and resets TTL', () => {
		const cache = new TtlCache<string>(1000);
		cache.set('key', 'old');

		vi.advanceTimersByTime(800);
		cache.set('key', 'new');

		vi.advanceTimersByTime(800);
		// 800ms since last set → still valid
		expect(cache.get('key')).toBe('new');
	});

	it('delete removes entry', () => {
		const cache = new TtlCache<string>(5000);
		cache.set('key', 'value');
		cache.delete('key');
		expect(cache.get('key')).toBeUndefined();
	});

	it('clear removes all entries', () => {
		const cache = new TtlCache<string>(5000);
		cache.set('a', '1');
		cache.set('b', '2');
		cache.clear();
		expect(cache.get('a')).toBeUndefined();
		expect(cache.get('b')).toBeUndefined();
	});

	it('has returns true for non-expired entries and false otherwise', () => {
		const cache = new TtlCache<string>(1000);
		expect(cache.has('key')).toBe(false);

		cache.set('key', 'value');
		expect(cache.has('key')).toBe(true);

		vi.advanceTimersByTime(1000);
		expect(cache.has('key')).toBe(false);
	});
});

describe('SingleSlotTtlCache', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('returns undefined when empty', () => {
		const cache = new SingleSlotTtlCache<string>(1000);
		expect(cache.get('any')).toBeUndefined();
	});

	it('stores and retrieves a value within TTL', () => {
		const cache = new SingleSlotTtlCache<number>(5000);
		cache.set('key', 42);
		expect(cache.get('key')).toBe(42);
	});

	it('returns undefined when key does not match', () => {
		const cache = new SingleSlotTtlCache<string>(5000);
		cache.set('key1', 'value');
		expect(cache.get('key2')).toBeUndefined();
	});

	it('expires entry after TTL elapses', () => {
		const cache = new SingleSlotTtlCache<string>(1000);
		cache.set('key', 'value');

		vi.advanceTimersByTime(999);
		expect(cache.get('key')).toBe('value');

		vi.advanceTimersByTime(1);
		expect(cache.get('key')).toBeUndefined();
	});

	it('replaces previous entry when set with new key', () => {
		const cache = new SingleSlotTtlCache<string>(5000);
		cache.set('key1', 'a');
		cache.set('key2', 'b');

		expect(cache.get('key1')).toBeUndefined();
		expect(cache.get('key2')).toBe('b');
	});

	it('replaces and resets TTL on same key', () => {
		const cache = new SingleSlotTtlCache<string>(1000);
		cache.set('key', 'old');

		vi.advanceTimersByTime(800);
		cache.set('key', 'new');

		vi.advanceTimersByTime(800);
		expect(cache.get('key')).toBe('new');
	});

	it('clear removes entry', () => {
		const cache = new SingleSlotTtlCache<string>(5000);
		cache.set('key', 'value');
		cache.clear();
		expect(cache.get('key')).toBeUndefined();
	});

	it('has returns true for non-expired matching key', () => {
		const cache = new SingleSlotTtlCache<string>(1000);
		expect(cache.has('key')).toBe(false);

		cache.set('key', 'value');
		expect(cache.has('key')).toBe(true);
		expect(cache.has('other')).toBe(false);

		vi.advanceTimersByTime(1000);
		expect(cache.has('key')).toBe(false);
	});
});
