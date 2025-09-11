/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { observableValue, derived, autorun } from '../../../common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../utils.js';

suite('debug', () => {
	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	test('debugGetDependencyGraph', () => {
		const myObservable1 = observableValue('myObservable1', 0);
		const myObservable2 = observableValue('myObservable2', 0);

		const myComputed1 = derived(reader => {
			/** @description myComputed1 */
			const value1 = myObservable1.read(reader);
			const value2 = myObservable2.read(reader);
			const sum = value1 + value2;
			return sum;
		});

		const myComputed2 = derived(reader => {
			/** @description myComputed2 */
			const value1 = myComputed1.read(reader);
			const value2 = myObservable1.read(reader);
			const value3 = myObservable2.read(reader);
			const sum = value1 + value2 + value3;
			return sum;
		});

		const myComputed3 = derived(reader => {
			/** @description myComputed3 */
			const value1 = myComputed2.read(reader);
			const value2 = myObservable1.read(reader);
			const value3 = myObservable2.read(reader);
			const sum = value1 + value2 + value3;
			return sum;
		});

		ds.add(autorun(reader => {
			/** @description myAutorun */
			myComputed3.read(reader);
		}));


		assert.deepStrictEqual(myComputed3.debugGetDependencyGraph(), "* derived myComputed3:\n  value: 0\n  state: upToDate\n  dependencies:\n\t\t* derived myComputed2:\n\t\t  value: 0\n\t\t  state: upToDate\n\t\t  dependencies:\n\t\t\t\t* derived myComputed1:\n\t\t\t\t  value: 0\n\t\t\t\t  state: upToDate\n\t\t\t\t  dependencies:\n\t\t\t\t\t\t* observableValue myObservable1:\n\t\t\t\t\t\t  value: 0\n\t\t\t\t\t\t  state: upToDate\n\t\t\t\t\t\t* observableValue myObservable2:\n\t\t\t\t\t\t  value: 0\n\t\t\t\t\t\t  state: upToDate\n\t\t\t\t* observableValue myObservable1 (already listed)\n\t\t\t\t* observableValue myObservable2 (already listed)\n\t\t* observableValue myObservable1 (already listed)\n\t\t* observableValue myObservable2 (already listed)");
	});
});
