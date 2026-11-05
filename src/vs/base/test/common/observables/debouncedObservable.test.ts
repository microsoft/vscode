/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { autorun, debouncedObservable, observableValue } from '../../../common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../utils.js';

suite('debouncedObservable', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('cancels the pending timer when the last observer is removed', () => {
		const clock = sinon.useFakeTimers();
		try {
			const source = observableValue('source', 0);
			const debounced = debouncedObservable(source, 100);
			const values: number[] = [];
			const observer = store.add(autorun(reader => values.push(debounced.read(reader))));

			source.set(1, undefined);
			source.set(2, undefined);
			assert.deepStrictEqual(values, [0]);
			clock.tick(100);
			assert.deepStrictEqual(values, [0, 2]);

			source.set(3, undefined);
			observer.dispose();
			assert.strictEqual(clock.countTimers(), 0);
			clock.tick(100);
			assert.deepStrictEqual(values, [0, 2]);
		} finally {
			clock.restore();
		}
	});

	test('a cancelled timer cannot overwrite a new observation', () => {
		const clock = sinon.useFakeTimers();
		try {
			const source = observableValue('source', 0);
			const debounced = debouncedObservable(source, 100);
			const firstObserver = store.add(autorun(reader => debounced.read(reader)));
			source.set(1, undefined);
			firstObserver.dispose();

			source.set(2, undefined);
			const values: number[] = [];
			store.add(autorun(reader => values.push(debounced.read(reader))));
			clock.tick(100);
			assert.deepStrictEqual(values, [2]);
		} finally {
			clock.restore();
		}
	});
});
