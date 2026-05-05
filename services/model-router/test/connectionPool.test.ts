// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

import { describe, test } from 'node:test';
import assert from 'node:assert';
import { ProviderConnectionPool } from '../src/connectionPool.js';

// The Pool class from undici is tested via a lightweight shim so the test does
// not require a live network. We verify that:
//  - the same Pool instance is returned for the same base URL
//  - different base URLs produce different Pool instances
//  - destroy() clears the pool registry
//
// We cannot easily test the actual HTTP behaviour of undici.Pool in a unit test
// without a live server, so the pool fetch integration is exercised through
// the provider adapter tests which accept a fetchFn override.

describe('ProviderConnectionPool', () => {
	test('getPool returns the same instance for the same base URL', () => {
		const pools = new ProviderConnectionPool();
		const p1 = pools.getPool('https://api.anthropic.com');
		const p2 = pools.getPool('https://api.anthropic.com');
		assert.strictEqual(p1, p2);
	});

	test('getPool returns different instances for different base URLs', () => {
		const pools = new ProviderConnectionPool();
		const p1 = pools.getPool('https://api.anthropic.com');
		const p2 = pools.getPool('https://api.openai.com');
		assert.notStrictEqual(p1, p2);
	});

	test('size tracks number of distinct pools', () => {
		const pools = new ProviderConnectionPool();
		assert.strictEqual(pools.size, 0);
		pools.getPool('https://api.anthropic.com');
		assert.strictEqual(pools.size, 1);
		pools.getPool('https://api.openai.com');
		assert.strictEqual(pools.size, 2);
		// Same URL again — size should not grow.
		pools.getPool('https://api.anthropic.com');
		assert.strictEqual(pools.size, 2);
	});

	test('createFetchFn returns a function', () => {
		const pools = new ProviderConnectionPool();
		const fn = pools.createFetchFn('https://api.anthropic.com');
		assert.strictEqual(typeof fn, 'function');
	});

	test('createFetchFn for same URL uses same pool (idempotent)', () => {
		const pools = new ProviderConnectionPool();
		pools.createFetchFn('https://api.anthropic.com');
		pools.createFetchFn('https://api.anthropic.com');
		// Two calls should not create two pools.
		assert.strictEqual(pools.size, 1);
	});

	test('destroy clears all pools', async () => {
		const pools = new ProviderConnectionPool();
		pools.getPool('https://api.anthropic.com');
		pools.getPool('https://api.openai.com');
		assert.strictEqual(pools.size, 2);
		await pools.destroy();
		assert.strictEqual(pools.size, 0);
	});

	test('getPool after destroy creates a new instance', async () => {
		const pools = new ProviderConnectionPool();
		const p1 = pools.getPool('https://api.anthropic.com');
		await pools.destroy();
		const p2 = pools.getPool('https://api.anthropic.com');
		// p2 is a fresh pool, not p1.
		assert.notStrictEqual(p1, p2);
	});
});
