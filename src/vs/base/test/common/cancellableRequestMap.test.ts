/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationTokenSource } from '../../common/cancellation.js';
import { CancellableRequestMap } from '../../common/cancellableRequestMap.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('CancellableRequestMap', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	suite('basic operations', () => {
		test('set and get', () => {
			const map = store.add(new CancellableRequestMap<{ value: number }>());
			const cts = store.add(new CancellationTokenSource());

			map.set(1, { value: 42 }, cts.token, () => { });

			const entry = map.get(1);
			assert.deepStrictEqual(entry, { value: 42 });
		});

		test('get returns undefined for missing key', () => {
			const map = store.add(new CancellableRequestMap<{ value: number }>());
			assert.strictEqual(map.get(999), undefined);
		});

		test('delete removes entry', () => {
			const map = store.add(new CancellableRequestMap<{ value: number }>());
			const cts = store.add(new CancellationTokenSource());

			map.set(1, { value: 42 }, cts.token, () => { });
			map.delete(1);

			assert.strictEqual(map.get(1), undefined);
		});

		test('delete is a no-op for missing key', () => {
			const map = store.add(new CancellableRequestMap<{ value: number }>());
			map.delete(999); // should not throw
		});
	});

	suite('cancellation listener management', () => {
		test('onCancel is called when token is cancelled', () => {
			const map = store.add(new CancellableRequestMap<{ value: number }>());
			const cts = store.add(new CancellationTokenSource());

			let cancelled = false;
			map.set(1, { value: 42 }, cts.token, () => { cancelled = true; });

			cts.cancel();
			assert.strictEqual(cancelled, true);
		});

		test('onCancel is not called after entry is deleted', () => {
			const map = store.add(new CancellableRequestMap<{ value: number }>());
			const cts = store.add(new CancellationTokenSource());

			let cancelled = false;
			map.set(1, { value: 42 }, cts.token, () => { cancelled = true; });

			map.delete(1);
			cts.cancel();

			assert.strictEqual(cancelled, false);
		});

		test('old listener is disposed when same requestId is overwritten', () => {
			const map = store.add(new CancellableRequestMap<{ value: number }>());
			const cts1 = store.add(new CancellationTokenSource());
			const cts2 = store.add(new CancellationTokenSource());

			let cancelled1 = false;
			let cancelled2 = false;
			map.set(1, { value: 1 }, cts1.token, () => { cancelled1 = true; });
			map.set(1, { value: 2 }, cts2.token, () => { cancelled2 = true; });

			assert.deepStrictEqual(map.get(1), { value: 2 });

			cts1.cancel();
			assert.strictEqual(cancelled1, false, 'old listener should have been disposed');

			cts2.cancel();
			assert.strictEqual(cancelled2, true, 'new listener should fire');
		});
	});

	suite('clear', () => {
		test('clear disposes all listeners', () => {
			const map = store.add(new CancellableRequestMap<{ value: number }>());
			const cts1 = store.add(new CancellationTokenSource());
			const cts2 = store.add(new CancellationTokenSource());

			let cancelled1 = false;
			let cancelled2 = false;
			map.set(1, { value: 1 }, cts1.token, () => { cancelled1 = true; });
			map.set(2, { value: 2 }, cts2.token, () => { cancelled2 = true; });

			map.clear();

			cts1.cancel();
			cts2.cancel();

			assert.strictEqual(cancelled1, false);
			assert.strictEqual(cancelled2, false);
		});
	});

	suite('dispose', () => {
		test('dispose clears all entries and listeners', () => {
			const map = new CancellableRequestMap<{ value: number }>();
			const cts1 = store.add(new CancellationTokenSource());
			const cts2 = store.add(new CancellationTokenSource());

			let cancelled1 = false;
			let cancelled2 = false;
			map.set(1, { value: 1 }, cts1.token, () => { cancelled1 = true; });
			map.set(2, { value: 2 }, cts2.token, () => { cancelled2 = true; });

			map.dispose();

			cts1.cancel();
			cts2.cancel();

			assert.strictEqual(cancelled1, false);
			assert.strictEqual(cancelled2, false);
		});
	});

	suite('already-cancelled token', () => {
		test('onCancel fires asynchronously when token is already cancelled', async () => {
			const map = store.add(new CancellableRequestMap<{ value: number }>());
			const cts = store.add(new CancellationTokenSource());
			cts.cancel();

			let cancelled = false;
			map.set(1, { value: 42 }, cts.token, () => { cancelled = true; });

			assert.strictEqual(cancelled, false, 'callback must not run synchronously');

			await new Promise(resolve => setTimeout(resolve, 0));
			assert.strictEqual(cancelled, true, 'callback must run after the next event loop turn');
		});
	});
});
