/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { abortOnDispose, CancellationToken, CancellationTokenSource, CancellationTokenPool } from '../../common/cancellation.js';
import { CancellationError, isCancellationError } from '../../common/errors.js';
import { DisposableStore } from '../../common/lifecycle.js';
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

	test('any handles empty and already cancelled inputs', () => {
		const lifetime = store.add(new DisposableStore());
		const active = store.add(new CancellationTokenSource());
		const cancelled = store.add(new CancellationTokenSource());
		const cancelledToken = cancelled.token;
		cancelled.cancel();

		assert.deepStrictEqual([
			CancellationToken.any([], lifetime),
			CancellationToken.any([CancellationToken.None, CancellationToken.None], lifetime),
			CancellationToken.any([CancellationToken.Cancelled], lifetime),
			CancellationToken.any([active.token, cancelledToken], lifetime),
			CancellationToken.any([cancelledToken, active.token], lifetime),
		], [
			CancellationToken.None,
			CancellationToken.None,
			CancellationToken.Cancelled,
			CancellationToken.Cancelled,
			CancellationToken.Cancelled,
		]);
	});

	test('any keeps a single distinct active input tied to its parent after lifetime disposal', () => {
		const lifetime = store.add(new DisposableStore());
		const source = store.add(new CancellationTokenSource());
		const tokens = [
			CancellationToken.any([source.token], lifetime),
			CancellationToken.any([CancellationToken.None, source.token, source.token, CancellationToken.None], lifetime),
		];
		const notifications = [0, 0];
		tokens.forEach((token, index) => store.add(token.onCancellationRequested(() => notifications[index]++)));

		lifetime.dispose();
		const cancelledOnDispose = tokens.map(token => token.isCancellationRequested);
		source.cancel();

		assert.deepStrictEqual({
			reusesParent: tokens.map(token => token === source.token),
			cancelledOnDispose,
			cancelled: tokens.map(token => token.isCancellationRequested),
			notifications,
		}, {
			reusesParent: [true, true],
			cancelledOnDispose: [false, false],
			cancelled: [true, true],
			notifications: [1, 1],
		});
	});

	for (const firstToCancel of [0, 1]) {
		test(`any cancels once when parent ${firstToCancel + 1} cancels first`, () => {
			const lifetime = store.add(new DisposableStore());
			const parents = [store.add(new CancellationTokenSource()), store.add(new CancellationTokenSource())];
			const token = CancellationToken.any([parents[0].token, CancellationToken.None, parents[1].token, parents[0].token], lifetime);
			const initiallyCancelled = token.isCancellationRequested;
			let notifications = 0;
			store.add(token.onCancellationRequested(() => notifications++));

			parents[firstToCancel].cancel();
			const cancelledByFirstParent = token.isCancellationRequested;
			const otherParentCancelled = parents[1 - firstToCancel].token.isCancellationRequested;
			parents[1 - firstToCancel].cancel();

			assert.deepStrictEqual({
				initiallyCancelled, cancelledByFirstParent, otherParentCancelled, notifications,
			}, { initiallyCancelled: false, cancelledByFirstParent: true, otherParentCancelled: false, notifications: 1 });
		});
	}

	test('any stops forwarding multiple inputs after lifetime disposal without cancelling them', () => {
		const lifetime = store.add(new DisposableStore());
		const parents = [store.add(new CancellationTokenSource()), store.add(new CancellationTokenSource())];
		const token = CancellationToken.any(parents.map(parent => parent.token), lifetime);
		let notifications = 0;
		store.add(token.onCancellationRequested(() => notifications++));

		lifetime.dispose();
		const parentsCancelledOnDispose = parents.map(parent => parent.token.isCancellationRequested);
		parents.forEach(parent => parent.cancel());

		assert.deepStrictEqual({
			parentsCancelledOnDispose, cancelled: token.isCancellationRequested, notifications,
		}, { parentsCancelledOnDispose: [false, false], cancelled: false, notifications: 0 });
	});

	test('any delivers cancellation when a listener disposes its lifetime', () => {
		const lifetime = store.add(new DisposableStore());
		const first = store.add(new CancellationTokenSource());
		const second = store.add(new CancellationTokenSource());
		const token = CancellationToken.any([first.token, second.token], lifetime);
		const notifications: string[] = [];
		store.add(token.onCancellationRequested(() => {
			notifications.push('cleanup');
			lifetime.dispose();
		}));
		store.add(token.onCancellationRequested(() => notifications.push('observer')));

		first.cancel();
		second.cancel();

		assert.deepStrictEqual(notifications, ['cleanup', 'observer']);
	});

	test('throwIfCanceled throws only for cancelled tokens', () => {
		const source = store.add(new CancellationTokenSource());
		CancellationToken.throwIfCanceled(CancellationToken.None);
		CancellationToken.throwIfCanceled(source.token);

		source.cancel();

		for (const token of [source.token, CancellationToken.Cancelled]) {
			assert.throws(() => CancellationToken.throwIfCanceled(token), CancellationError);
		}
	});

	test('fromAbortSignal reflects current and future cancellation', () => {
		const lifetime = store.add(new DisposableStore());
		const controller = new AbortController();
		const token = CancellationToken.fromAbortSignal(controller.signal, lifetime);
		const initiallyCancelled = token.isCancellationRequested;
		let notifications = 0;
		lifetime.add(token.onCancellationRequested(() => notifications++));
		controller.abort();
		controller.abort();
		assert.deepStrictEqual({
			initiallyCancelled,
			cancelled: token.isCancellationRequested,
			alreadyAborted: CancellationToken.fromAbortSignal(controller.signal, lifetime).isCancellationRequested,
			notifications,
		}, { initiallyCancelled: false, cancelled: true, alreadyAborted: true, notifications: 1 });
	});

	test('fromAbortSignal stops forwarding after lifetime disposal', () => {
		const lifetime = store.add(new DisposableStore());
		const controller = new AbortController();
		const token = CancellationToken.fromAbortSignal(controller.signal, lifetime);
		lifetime.dispose();
		const abortedOnDispose = controller.signal.aborted;
		controller.abort();
		assert.deepStrictEqual({
			abortedOnDispose, signalAborted: controller.signal.aborted, tokenCancelled: token.isCancellationRequested,
		}, { abortedOnDispose: false, signalAborted: true, tokenCancelled: false });
	});

	test('toAbortSignal reflects current and future cancellation', () => {
		const lifetime = store.add(new DisposableStore());
		const source = store.add(new CancellationTokenSource());
		const token = source.token;
		const signal = CancellationToken.toAbortSignal(token, lifetime);
		const initiallyAborted = signal.aborted;
		source.cancel();
		const cancelledSignals = [
			signal,
			CancellationToken.toAbortSignal(token, lifetime),
			CancellationToken.toAbortSignal(CancellationToken.Cancelled, lifetime),
		];
		assert.deepStrictEqual({
			initiallyAborted,
			cancelledSignals: cancelledSignals.map(signal => ({ aborted: signal.aborted, cancellationError: isCancellationError(signal.reason) })),
			none: CancellationToken.toAbortSignal(CancellationToken.None, lifetime).aborted,
		}, {
			initiallyAborted: false,
			cancelledSignals: [
				{ aborted: true, cancellationError: true },
				{ aborted: true, cancellationError: true },
				{ aborted: true, cancellationError: true },
			],
			none: false,
		});
	});

	test('toAbortSignal stops forwarding after lifetime disposal', () => {
		const lifetime = store.add(new DisposableStore());
		const source = store.add(new CancellationTokenSource());
		const signal = CancellationToken.toAbortSignal(source.token, lifetime);
		lifetime.dispose();
		const cancelledOnDispose = source.token.isCancellationRequested;
		source.cancel();
		assert.deepStrictEqual({
			cancelledOnDispose, tokenCancelled: source.token.isCancellationRequested, signalAborted: signal.aborted,
		}, { cancelledOnDispose: false, tokenCancelled: true, signalAborted: false });
	});

	test('abortOnDispose aborts when the store is disposed', () => {
		const lifetime = store.add(new DisposableStore());
		const signal = abortOnDispose(lifetime);
		const initiallyAborted = signal.aborted;
		lifetime.dispose();
		assert.deepStrictEqual({
			initiallyAborted,
			aborted: signal.aborted,
			cancellationError: isCancellationError(signal.reason),
		}, { initiallyAborted: false, aborted: true, cancellationError: true });
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
