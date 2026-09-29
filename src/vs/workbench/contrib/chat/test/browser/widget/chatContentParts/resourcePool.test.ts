/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore, IDisposable } from '../../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../../base/test/common/timeTravelScheduler.js';
import { timeout } from '../../../../../../../base/common/async.js';
import { ResourcePool, KeyedResourcePool } from '../../../../browser/widget/chatContentParts/chatCollections.js';

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

	test('dispose disposes all items including in-use', () => {
		const pool = createPool();
		const a = pool.get();
		const b = pool.get();
		pool.release(b);

		disposables.delete(pool);
		pool.dispose();

		assert.ok(a.isDisposed, 'in-use item should be disposed');
		assert.ok(b.isDisposed, 'idle item should be disposed');
	});

	test('trimming disposes excess idle items after delay', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const pool = createPool({ maxIdleSize: 1, trimIdleDelay: 50 });

		const a = pool.get();
		const b = pool.get();
		const c = pool.get();
		pool.release(a);
		pool.release(b);
		pool.release(c);

		assert.ok(!a.isDisposed);
		assert.ok(!b.isDisposed);
		assert.ok(!c.isDisposed);

		await timeout(100);

		const disposedCount = [a, b, c].filter(x => x.isDisposed).length;
		assert.strictEqual(disposedCount, 2, 'should dispose 2 excess items');
	}));

	test('trim timer is debounced on rapid releases', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const pool = createPool({ maxIdleSize: 0, trimIdleDelay: 100 });

		const a = pool.get();
		pool.release(a);
		assert.ok(!a.isDisposed, 'should not be disposed immediately');

		const b = pool.get();
		pool.release(b);

		await timeout(50);
		assert.ok(!a.isDisposed, 'should not be disposed yet (timer was debounced)');

		await timeout(100);
		assert.ok(a.isDisposed, 'should be disposed after debounce completes');
	}));

	test('no trimming when maxIdleSize is not set', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const pool = createPool();

		const items = [];
		for (let i = 0; i < 10; i++) {
			items.push(pool.get());
		}
		for (const item of items) {
			pool.release(item);
		}

		await timeout(50);
		assert.ok(items.every(i => !i.isDisposed), 'no items should be disposed without maxIdleSize');
	}));
});

suite('KeyedResourcePool', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let disposables: DisposableStore;
	let createCount: number;

	setup(() => {
		disposables = store.add(new DisposableStore());
		createCount = 0;
	});

	function createPool(options?: { maxIdleSize?: number; trimIdleDelay?: number }): KeyedResourcePool<MockPoolItem> {
		const pool = new KeyedResourcePool<MockPoolItem>(() => {
			createCount++;
			return new MockPoolItem();
		}, options);
		disposables.add(pool);
		return pool;
	}

	test('creates new items on get', () => {
		const pool = createPool();
		const a = pool.get('key1');
		const b = pool.get('key2');
		assert.notStrictEqual(a, b);
		assert.strictEqual(createCount, 2);
		assert.strictEqual(pool.inUse.size, 2);
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

	test('multiple items can share the same key', () => {
		const pool = createPool();
		const a = pool.get('shared');
		const b = pool.get('shared');
		assert.notStrictEqual(a, b, 'should create separate items');
		pool.release(a, 'shared');
		pool.release(b, 'shared');

		const c = pool.get('shared');
		assert.ok(c === a || c === b, 'should return one of the keyed items');
	});

	test('key reassignment removes old key association', () => {
		const pool = createPool();
		const a = pool.get('key1');
		const b = pool.get('key2');
		pool.release(a, 'key1');
		pool.release(b, 'key2');

		// Reuse a via key1, then release it under key2
		const reused = pool.get('key1');
		assert.strictEqual(reused, a);
		pool.release(reused, 'key2');

		// key1 should not find a anymore — only b is associated with its original key2
		// But a was reassigned to key2, so key2 now has both a and b
		const c = pool.get('key1');
		// key1 has no associations, falls back to generic — gets whatever is on top
		pool.release(c, 'key1');

		// key2 should still find one of {a, b}
		const d = pool.get('key2');
		assert.ok(d === a || d === b);
	});

	test('clear disposes idle items and clears key map', () => {
		const pool = createPool();
		const a = pool.get('key1');
		const b = pool.get('key2');
		pool.release(a, 'key1');
		pool.release(b, 'key2');

		pool.clear();

		assert.ok(a.isDisposed);
		assert.ok(b.isDisposed);

		const c = pool.get('key1');
		assert.notStrictEqual(c, a, 'should create new item after clear');
	});

	test('dispose disposes all items including in-use', () => {
		const pool = createPool();
		const a = pool.get('key1');
		const b = pool.get('key2');
		pool.release(b, 'key2');

		disposables.delete(pool);
		pool.dispose();

		assert.ok(a.isDisposed);
		assert.ok(b.isDisposed);
	});

	test('trimming disposes excess idle items', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const pool = createPool({ maxIdleSize: 1, trimIdleDelay: 50 });

		const a = pool.get('a');
		const b = pool.get('b');
		const c = pool.get('c');
		pool.release(a, 'a');
		pool.release(b, 'b');
		pool.release(c, 'c');

		await timeout(100);

		const disposedCount = [a, b, c].filter(x => x.isDisposed).length;
		assert.strictEqual(disposedCount, 2, 'should dispose 2 excess items');
	}));

	test('trimming cleans up key associations for disposed items', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const pool = createPool({ maxIdleSize: 0, trimIdleDelay: 50 });

		const a = pool.get('key1');
		pool.release(a, 'key1');

		await timeout(100);

		assert.ok(a.isDisposed);

		const b = pool.get('key1');
		assert.notStrictEqual(a, b, 'should create new item since keyed item was trimmed');
		assert.strictEqual(createCount, 2);
	}));

	test('repeated key reassignment does not grow stale associations', () => {
		const pool = createPool();
		const item = pool.get('key-0');

		for (let i = 0; i < 100; i++) {
			pool.release(item, `key-${i}`);
			const reused = pool.get(`key-${i}`);
			assert.strictEqual(reused, item);
		}

		pool.release(item, 'final-key');
		const result = pool.get('final-key');
		assert.strictEqual(result, item);
		assert.strictEqual(createCount, 1, 'should have only created one item');
	});
});
