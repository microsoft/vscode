/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { autorun, debouncedObservable, observableValue } from '../../../common/observable.js';
import { runWithFakedTimers } from '../timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../utils.js';

suite('debouncedObservable', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('cancels pending delivery when the last observer is removed', () => runWithFakedTimers({}, async () => {
		const source = observableValue('source', 0);
		const debounced = debouncedObservable(source, 100);
		const observer = store.add(autorun(reader => debounced.read(reader)));

		source.set(1, undefined);
		observer.dispose();
		source.set(2, undefined);

		const values: number[] = [];
		store.add(autorun(reader => values.push(debounced.read(reader))));

		await new Promise<void>(resolve => setTimeout(resolve, 150));

		assert.deepStrictEqual(values, [2]);
	}));
});
