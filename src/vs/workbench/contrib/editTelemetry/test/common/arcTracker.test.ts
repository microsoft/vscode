/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { StringText } from '../../../../../editor/common/core/text/abstractText.js';
import { computeStringDiff } from '../../../../../editor/common/services/editorWebWorker.js';
import { ArcTracker } from '../../common/arcTracker.js';

suite('Debug - AbstractDebugAdapter', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('test1', () => {

		const states = [
			`TODO: Add Charlie
Alpha
Bravo
Delta`,
			`Alpha
Bravo
Delta
Charlie`,
			`* Alpha
* Bravo
* Delta
* Charlie`,
			`ICAO spelling alphabet:
* Alpha
* Bravo
* Delta
* Charlie`
		];

		const edits = compareAdjacentItems(states, (a, b) => computeStringDiff(a, b, { maxComputationTimeMs: 0 }, 'advanced'));

		const t = new ArcTracker(
			new StringText(states[0]),
			edits[0]
		);

		const data: unknown[] = [];
		data.push(t.getLineCountInfo());

		for (let i = 1; i < edits.length; i++) {
			t.handleEdits(edits[i]);
			data.push(t.getLineCountInfo());
		}
		assert.deepStrictEqual(data, ([
			{
				deletedLineCounts: 1,
				insertedLineCounts: 1
			},
			{
				deletedLineCounts: 0,
				insertedLineCounts: 1
			},
			{
				deletedLineCounts: 0,
				insertedLineCounts: 1
			}
		]));
	});
});

function compareAdjacentItems<T, TResult>(arr: T[], comparator: (a: T, b: T) => TResult): TResult[] {
	const result: TResult[] = [];
	for (let i = 0; i < arr.length - 1; i++) {
		result.push(comparator(arr[i], arr[i + 1]));
	}
	return result;
}
