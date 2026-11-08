/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { RowSignatures } from '../../../browser/viewParts/minimap/minimapDirtyRows.js';

suite('Minimap RowSignatures', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	type Drawing = [y: number, height: number, signature: string, uniform: boolean];

	function rows(drawings: Drawing[], height = 10): RowSignatures {
		const result = new RowSignatures(height);
		for (const [y, h, signature, uniform] of drawings) {
			result.add(y, h, signature, uniform);
		}
		return result;
	}

	test('finds the band of rows drawn differently', () => {
		const cursor: Drawing = [2, 2, 'red', true];
		const label: Drawing = [5, 3, 'Header', false];
		assert.deepStrictEqual([
			RowSignatures.diff(null, rows([])),
			RowSignatures.diff(rows([]), rows([])),
			RowSignatures.diff(rows([cursor, label]), rows([cursor, label])),
			RowSignatures.diff(rows([cursor]), rows([[3, 2, 'red', true]])),
			RowSignatures.diff(rows([cursor]), rows([[2, 2, 'blue', true]])),
			RowSignatures.diff(rows([cursor]), rows([[2, 2.5, 'red', true]])),
			RowSignatures.diff(rows([[1, 4, 'red', true]]), rows([[1, 2, 'red', true], [3, 2, 'red', true]])),
			RowSignatures.diff(rows([label]), rows([[6, 3, 'Header', false]])),
			RowSignatures.diff(rows([cursor, [3, 3, 'Header', false]]), rows([[3, 3, 'Header', false], cursor])),
			RowSignatures.diff(rows([[0, 1, 'a', true], [9, 1, 'a', true]]), rows([[0, 1, 'b', true], [9, 1, 'b', true]])),
			RowSignatures.diff(rows([], 10), rows([], 8)),
		], [
			{ start: 0, end: 10 },
			null,
			null,
			{ start: 2, end: 5 },
			{ start: 2, end: 4 },
			{ start: 4, end: 5 },
			null,
			{ start: 5, end: 9 },
			{ start: 3, end: 4 },
			{ start: 0, end: 10 },
			{ start: 0, end: 8 },
		]);
	});
});
