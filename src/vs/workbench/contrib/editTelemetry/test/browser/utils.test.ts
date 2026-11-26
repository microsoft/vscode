/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { observableValue, transaction } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { iterateObservableChanges } from '../../browser/helpers/utils.js';

suite('iterateObservableChanges', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('captures synchronous changes and drains them after the store is cleared', async () => {
		const store = disposables.add(new DisposableStore());
		const value = observableValue<number, string>('value', 0);
		const changes = iterateObservableChanges(value, store);

		value.set(1, undefined, 'first');
		value.set(2, undefined, 'second');
		store.clear();
		value.set(3, undefined, 'ignored');

		const actual = [];
		for await (const change of changes) {
			actual.push(change);
		}
		assert.deepStrictEqual(actual, [
			{ value: 1, prevValue: 0, change: ['first'] },
			{ value: 2, prevValue: 1, change: ['second'] },
		]);
	});

	test('delivers queued changes and wakes a pending reader on disposal', async () => {
		const store = disposables.add(new DisposableStore());
		const value = observableValue<number, string>('value', 0);
		const iterator = iterateObservableChanges(value, store)[Symbol.asyncIterator]();
		const first = iterator.next();

		value.set(1, undefined, 'first');
		await first;
		value.set(2, undefined, 'second');
		value.set(3, undefined, 'third');

		const actual = [await iterator.next(), await iterator.next()];
		const end = iterator.next();
		store.dispose();
		actual.push(await end, await iterator.next());
		assert.deepStrictEqual(actual, [
			{ done: false, value: { value: 2, prevValue: 1, change: ['second'] } },
			{ done: false, value: { value: 3, prevValue: 2, change: ['third'] } },
			{ done: true, value: undefined },
			{ done: true, value: undefined },
		]);
	});

	test('preserves transaction changes and their before and after values', async () => {
		const store = disposables.add(new DisposableStore());
		const value = observableValue<number, string>('value', 0);
		const iterator = iterateObservableChanges(value, store)[Symbol.asyncIterator]();

		transaction(tx => {
			value.set(1, tx, 'first');
			value.set(2, tx, 'second');
		});

		assert.deepStrictEqual(await iterator.next(), {
			done: false,
			value: { value: 2, prevValue: 0, change: ['first', 'second'] },
		});
	});

	test('completes immediately for an already disposed store', async () => {
		const store = disposables.add(new DisposableStore());
		store.dispose();
		const value = observableValue('value', 0);
		const iterator = iterateObservableChanges(value, store)[Symbol.asyncIterator]();
		value.set(1, undefined);

		assert.deepStrictEqual(await iterator.next(), { done: true, value: undefined });
	});
});
