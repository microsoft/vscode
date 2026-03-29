/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore, IDisposable } from '../../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ResourcePool } from '../../../../browser/widget/chatContentParts/chatCollections.js';

class MockPoolItem implements IDisposable {
	isDisposed = false;
	dispose(): void {
		this.isDisposed = true;
	}
}

suite('ResourcePool', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let disposables: DisposableStore;
	let createCount: number;

	setup(() => {
		disposables = store.add(new DisposableStore());
		createCount = 0;
	});

	function createPool(options?: { maxIdleSize?: number; trimIdleDelay?: number }): ResourcePool<MockPoolItem> {
		const pool = new ResourcePool<MockPoolItem>(() => {
			createCount++;
			return new MockPoolItem();
		}, options);
		disposables.add(pool);
		return pool;
	}

	test('creates new items on get', () => {
		const pool = createPool();
		const a = pool.get();
		const b = pool.get();
		assert.notStrictEqual(a, b);
		assert.strictEqual(createCount, 2);
		assert.strictEqual(pool.inUse.size, 2);
	});

	test('reuses released items', () => {
		const pool = createPool();
		const a = pool.get();
		pool.release(a);
		const b = pool.get();
		assert.strictEqual(a, b);
		assert.strictEqual(createCount, 1);
	});

	test('keyed get returns item previously released with same key', () => {
		const pool = createPool();
		const a = pool.get('key1');
		const b = pool.get('key2');
		pool.release(a, 'key1');
		pool.release(b, 'key2');

		const c = pool.get('key2');
		assert.strictEqual(c, b, 'should return the item released with key2');

		const d = pool.get('key1');
		assert.strictEqual(d, a, 'should return the item released with key1');
		assert.strictEqual(createCount, 2);
	});

	test('keyed get falls back to any idle item when key not found', () => {
		const pool = createPool();
		const a = pool.get('key1');
		pool.release(a, 'key1');

		const b = pool.get('unknown-key');
		assert.strictEqual(b, a, 'should return the idle item even with a different key');
	});

	test('keyed get creates new item when pool is empty', () => {
		const pool = createPool();
		const a = pool.get('key1');
		assert.ok(a);
		assert.strictEqual(createCount, 1);
		assert.strictEqual(pool.inUse.size, 1);
	});

	test('multiple items can be checked out with the same key', () => {
		const pool = createPool();
		const a = pool.get('shared-key');
		const b = pool.get('shared-key');
		assert.notStrictEqual(a, b, 'should create separate items');
		assert.strictEqual(createCount, 2);
		assert.strictEqual(pool.inUse.size, 2);
	});

	test('release with same key for multiple items, get returns one of them', () => {
		const pool = createPool();
		const a = pool.get('shared-key');
		const b = pool.get('shared-key');
		pool.release(a, 'shared-key');
		pool.release(b, 'shared-key');

		const c = pool.get('shared-key');
		assert.ok(c === a || c === b, 'should return one of the items released with the key');
	});

	test('clear disposes idle items but not in-use items', () => {
		const pool = createPool();
		const a = pool.get();
		const b = pool.get();
		pool.release(b);

		pool.clear();

		assert.ok(b.isDisposed, 'idle item should be disposed');
		assert.ok(!a.isDisposed, 'in-use item should not be disposed');
		assert.strictEqual(pool.inUse.size, 1);
	});

	test('clear clears key map', () => {
		const pool = createPool();
		const a = pool.get('key1');
		pool.release(a, 'key1');
		pool.clear();

		const b = pool.get('key1');
		assert.notStrictEqual(a, b, 'should create new item after clear');
		assert.ok(a.isDisposed);
	});

	test('dispose disposes all items including in-use', () => {
		const pool = createPool();
		const a = pool.get();
		const b = pool.get();
		pool.release(b);

		// Remove from disposables since we're disposing manually
		disposables.delete(pool);
		pool.dispose();

		assert.ok(a.isDisposed, 'in-use item should be disposed');
		assert.ok(b.isDisposed, 'idle item should be disposed');
	});

	test('trimming disposes excess idle items after delay', async () => {
		const pool = createPool({ maxIdleSize: 1, trimIdleDelay: 50 });

		const a = pool.get();
		const b = pool.get();
		const c = pool.get();
		pool.release(a);
		pool.release(b);
		pool.release(c);

		// Before trim: all 3 in pool
		assert.ok(!a.isDisposed);
		assert.ok(!b.isDisposed);
		assert.ok(!c.isDisposed);

		// Wait for trim
		await new Promise(resolve => setTimeout(resolve, 100));

		// After trim: only 1 should remain (maxIdleSize=1), 2 disposed
		const disposedCount = [a, b, c].filter(x => x.isDisposed).length;
		assert.strictEqual(disposedCount, 2, 'should dispose 2 excess items');
	});

	test('trim timer is debounced on rapid releases', async () => {
		const pool = createPool({ maxIdleSize: 0, trimIdleDelay: 100 });

		const a = pool.get();
		pool.release(a);
		assert.ok(!a.isDisposed, 'should not be disposed immediately');

		// Release another item before the timer fires
		const b = pool.get();
		pool.release(b);

		// Wait less than the delay
		await new Promise(resolve => setTimeout(resolve, 50));
		assert.ok(!a.isDisposed, 'should not be disposed yet (timer was debounced)');

		// Wait for the full delay
		await new Promise(resolve => setTimeout(resolve, 100));
		assert.ok(a.isDisposed, 'should be disposed after debounce completes');
	});

	test('trimming cleans up key map entries', async () => {
		const pool = createPool({ maxIdleSize: 0, trimIdleDelay: 50 });

		const a = pool.get('key1');
		pool.release(a, 'key1');

		await new Promise(resolve => setTimeout(resolve, 100));

		assert.ok(a.isDisposed, 'item should be trimmed');

		// Getting with the same key should create a new item
		const b = pool.get('key1');
		assert.notStrictEqual(a, b);
		assert.strictEqual(createCount, 2);
	});

	test('no trimming when maxIdleSize is not set', async () => {
		const pool = createPool(); // no options

		const items = [];
		for (let i = 0; i < 10; i++) {
			items.push(pool.get());
		}
		for (const item of items) {
			pool.release(item);
		}

		await new Promise(resolve => setTimeout(resolve, 50));

		assert.ok(items.every(i => !i.isDisposed), 'no items should be disposed without maxIdleSize');
	});
});
