/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { observableValue, derived, autorun } from '../../../common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../utils.js';
// eslint-disable-next-line local/code-no-deep-import-of-internal
import { debugGetObservableGraph } from '../../../common/observableInternal/logging/debugGetDependencyGraph.js';

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


		let idx = 0;
		assert.deepStrictEqual(
			debugGetObservableGraph(myComputed3, { type: 'dependencies', debugNamePostProcessor: name => `name${++idx}` }),
			'* derived name1:\n  value: 0\n  state: upToDate\n  dependencies:\n\t\t* derived name2:\n\t\t  value: 0\n\t\t  state: upToDate\n\t\t  dependencies:\n\t\t\t\t* derived name3:\n\t\t\t\t  value: 0\n\t\t\t\t  state: upToDate\n\t\t\t\t  dependencies:\n\t\t\t\t\t\t* observableValue name4:\n\t\t\t\t\t\t  value: 0\n\t\t\t\t\t\t  state: upToDate\n\t\t\t\t\t\t* observableValue name5:\n\t\t\t\t\t\t  value: 0\n\t\t\t\t\t\t  state: upToDate\n\t\t\t\t* observableValue name6 (already listed)\n\t\t\t\t* observableValue name7 (already listed)\n\t\t* observableValue name8 (already listed)\n\t\t* observableValue name9 (already listed)',
		);
	});
});
