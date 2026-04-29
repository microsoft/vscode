/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { CancellationToken, CancellationTokenSource, CancellationTokenPool } from '../../common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('CancellationToken', function () {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('None', () => {
		assert.strictEqual(CancellationToken.None.isCancellationRequested, false);
		assert.strictEqual(typeof CancellationToken.None.onCancellationRequested, 'function');
	});

	test('cancel before token', function () {

		const source = new CancellationTokenSource();
		assert.strictEqual(source.token.isCancellationRequested, false);
		source.cancel();

		assert.strictEqual(source.token.isCancellationRequested, true);

		return new Promise<void>(resolve => {
			source.token.onCancellationRequested(() => resolve());
		});
	});

	test('cancel happens only once', function () {

		const source = new CancellationTokenSource();
		assert.strictEqual(source.token.isCancellationRequested, false);

		let cancelCount = 0;
		function onCancel() {
			cancelCount += 1;
		}

		store.add(source.token.onCancellationRequested(onCancel));

		source.cancel();
		source.cancel();

		assert.strictEqual(cancelCount, 1);
	});

	test('cancel calls all listeners', function () {

		let count = 0;

		const source = new CancellationTokenSource();
		store.add(source.token.onCancellationRequested(() => count++));
		store.add(source.token.onCancellationRequested(() => count++));
		store.add(source.token.onCancellationRequested(() => count++));

		source.cancel();
		assert.strictEqual(count, 3);
	});

	test('token stays the same', function () {

		let source = new CancellationTokenSource();
		let token = source.token;
		assert.ok(token === source.token); // doesn't change on get

		source.cancel();
		assert.ok(token === source.token); // doesn't change after cancel

		source.cancel();
		assert.ok(token === source.token); // doesn't change after 2nd cancel

		source = new CancellationTokenSource();
		source.cancel();
		token = source.token;
		assert.ok(token === source.token); // doesn't change on get
	});

	test('dispose calls no listeners', function () {

		let count = 0;

		const source = new CancellationTokenSource();
		store.add(source.token.onCancellationRequested(() => count++));

		source.dispose();
		source.cancel();
		assert.strictEqual(count, 0);
	});

	test('dispose calls no listeners (unless told to cancel)', function () {

		let count = 0;

		const source = new CancellationTokenSource();
		store.add(source.token.onCancellationRequested(() => count++));

		source.dispose(true);
		// source.cancel();
		assert.strictEqual(count, 1);
	});

	test('dispose does not cancel', function () {
		const source = new CancellationTokenSource();
		source.dispose();
		assert.strictEqual(source.token.isCancellationRequested, false);
	});

	test('parent cancels child', function () {

		const parent = new CancellationTokenSource();
		const child = new CancellationTokenSource(parent.token);

		let count = 0;
		store.add(child.token.onCancellationRequested(() => count++));

		parent.cancel();

		assert.strictEqual(count, 1);
		assert.strictEqual(child.token.isCancellationRequested, true);
		assert.strictEqual(parent.token.isCancellationRequested, true);

		child.dispose();
		parent.dispose();
	});
});

suite('CancellationTokenPool', function () {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('empty pool token is not cancelled', function () {
		const pool = new CancellationTokenPool();
		store.add(pool);

		assert.strictEqual(pool.token.isCancellationRequested, false);
	});

	test('pool token cancels when all tokens are cancelled', function () {
		const pool = new CancellationTokenPool();
		store.add(pool);

		const source1 = new CancellationTokenSource();
		const source2 = new CancellationTokenSource();
		const source3 = new CancellationTokenSource();

		pool.add(source1.token);
		pool.add(source2.token);
		pool.add(source3.token);

		assert.strictEqual(pool.token.isCancellationRequested, false);

		source1.cancel();
		assert.strictEqual(pool.token.isCancellationRequested, false);

		source2.cancel();
		assert.strictEqual(pool.token.isCancellationRequested, false);

		source3.cancel();
		assert.strictEqual(pool.token.isCancellationRequested, true);

		source1.dispose();
		source2.dispose();
		source3.dispose();
	});

	test('pool token fires cancellation event when all tokens are cancelled', function () {
		return new Promise<void>(resolve => {
			const pool = new CancellationTokenPool();
			store.add(pool);

			const source1 = new CancellationTokenSource();
			const source2 = new CancellationTokenSource();

			pool.add(source1.token);
			pool.add(source2.token);

			store.add(pool.token.onCancellationRequested(() => resolve()));

			source1.cancel();
			source2.cancel();

			source1.dispose();
			source2.dispose();
		});
	});

	test('adding already cancelled token counts immediately', function () {
		const pool = new CancellationTokenPool();
		store.add(pool);

		const source1 = new CancellationTokenSource();
		const source2 = new CancellationTokenSource();

		source1.cancel(); // Cancel before adding to pool

		pool.add(source1.token);
		assert.strictEqual(pool.token.isCancellationRequested, true); // 1 of 1 cancelled, so pool is cancelled

		pool.add(source2.token); // Adding after pool is done should have no effect
		assert.strictEqual(pool.token.isCancellationRequested, true);

		source2.cancel(); // This should have no effect since pool is already done
		assert.strictEqual(pool.token.isCancellationRequested, true);

		source1.dispose();
		source2.dispose();
	});

	test('adding single already cancelled token cancels pool immediately', function () {
		const pool = new CancellationTokenPool();
		store.add(pool);

		const source = new CancellationTokenSource();
		source.cancel();

		pool.add(source.token);
		assert.strictEqual(pool.token.isCancellationRequested, true); // 1 of 1 cancelled

		source.dispose();
	});

	test('adding token after pool is done has no effect', function () {
		const pool = new CancellationTokenPool();
		store.add(pool);

		const source1 = new CancellationTokenSource();
		const source2 = new CancellationTokenSource();

		pool.add(source1.token);
		source1.cancel(); // Pool should be done now

		assert.strictEqual(pool.token.isCancellationRequested, true);

		// Adding another token should have no effect
		pool.add(source2.token);
		source2.cancel();

		assert.strictEqual(pool.token.isCancellationRequested, true);

		source1.dispose();
		source2.dispose();
	});

	test('single token pool behaviour', function () {
		const pool = new CancellationTokenPool();
		store.add(pool);

		const source = new CancellationTokenSource();
		pool.add(source.token);

		assert.strictEqual(pool.token.isCancellationRequested, false);

		source.cancel();
		assert.strictEqual(pool.token.isCancellationRequested, true);

		source.dispose();
	});

	test('pool with only cancelled tokens', function () {
		const pool = new CancellationTokenPool();
		store.add(pool);

		const source1 = new CancellationTokenSource();
		const source2 = new CancellationTokenSource();

		source1.cancel();
		source2.cancel();

		pool.add(source1.token);
		pool.add(source2.token);

		assert.strictEqual(pool.token.isCancellationRequested, true);

		source1.dispose();
		source2.dispose();
	});
});
