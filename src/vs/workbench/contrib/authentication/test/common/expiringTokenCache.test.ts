/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ExpiringTokenCache } from '../../common/expiringTokenCache.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('ExpiringTokenCache', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let cache: ExpiringTokenCache<string>;

	setup(() => {
		cache = new ExpiringTokenCache<string>(1000, 100); // 1 second TTL, 100ms cleanup
		disposables.add(cache);
	});

	test('should store and retrieve valid tokens', () => {
		cache.set('token1', 'value1');
		assert.strictEqual(cache.get('token1'), 'value1');
		assert.strictEqual(cache.has('token1'), true);
		assert.strictEqual(cache.size, 1);
	});

	test('should return undefined for non-existent tokens', () => {
		assert.strictEqual(cache.get('nonexistent'), undefined);
		assert.strictEqual(cache.has('nonexistent'), false);
	});

	test('should handle custom TTL', () => {
		cache.set('shortToken', 'value', 100); // 100ms TTL
		assert.strictEqual(cache.get('shortToken'), 'value');
		
		// Token should still be valid immediately
		assert.strictEqual(cache.isExpired('shortToken'), false);
		assert(cache.getRemainingTime('shortToken') > 0);
	});

	test('should expire tokens after TTL', async () => {
		cache.set('expiring', 'value', 50); // 50ms TTL
		assert.strictEqual(cache.get('expiring'), 'value');
		
		// Wait for expiration
		await new Promise(resolve => setTimeout(resolve, 100));
		
		assert.strictEqual(cache.get('expiring'), undefined);
		assert.strictEqual(cache.has('expiring'), false);
		assert.strictEqual(cache.isExpired('expiring'), true);
		assert.strictEqual(cache.getRemainingTime('expiring'), 0);
	});

	test('should delete tokens manually', () => {
		cache.set('deletable', 'value');
		assert.strictEqual(cache.has('deletable'), true);
		
		const deleted = cache.delete('deletable');
		assert.strictEqual(deleted, true);
		assert.strictEqual(cache.has('deletable'), false);
		
		// Deleting non-existent token should return false
		const deletedAgain = cache.delete('deletable');
		assert.strictEqual(deletedAgain, false);
	});

	test('should clear all tokens', () => {
		cache.set('token1', 'value1');
		cache.set('token2', 'value2');
		assert.strictEqual(cache.size, 2);
		
		cache.clear();
		assert.strictEqual(cache.size, 0);
		assert.strictEqual(cache.has('token1'), false);
		assert.strictEqual(cache.has('token2'), false);
	});

	test('should handle complex token values', () => {
		const complexCache = new ExpiringTokenCache<{ email: string; userId: string }>();
		disposables.add(complexCache);
		
		const tokenData = { email: 'user@example.com', userId: 'user123' };
		complexCache.set('resetToken', tokenData);
		
		const retrieved = complexCache.get('resetToken');
		assert.deepStrictEqual(retrieved, tokenData);
	});

	test('should handle edge cases', () => {
		// Empty token key
		cache.set('', 'emptyKey');
		assert.strictEqual(cache.get(''), 'emptyKey');
		
		// Empty value
		cache.set('emptyValue', '');
		assert.strictEqual(cache.get('emptyValue'), '');
		
		// Zero TTL should expire immediately
		cache.set('zeroTtl', 'value', 0);
		assert.strictEqual(cache.get('zeroTtl'), undefined);
	});
});