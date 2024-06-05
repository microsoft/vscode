/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as collections from 'vs/base/common/collections';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

suite('Collections', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('groupBy', () => {

		const group1 = 'a', group2 = 'b';
		const value1 = 1, value2 = 2, value3 = 3;
		const source = [
			{ key: group1, value: value1 },
			{ key: group1, value: value2 },
			{ key: group2, value: value3 },
		];

		const grouped = collections.groupBy(source, x => x.key);

		// Group 1
		assert.strictEqual(grouped[group1].length, 2);
		assert.strictEqual(grouped[group1][0].value, value1);
		assert.strictEqual(grouped[group1][1].value, value2);

		// Group 2
		assert.strictEqual(grouped[group2].length, 1);
		assert.strictEqual(grouped[group2][0].value, value3);
	});
});
