/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { findDirtyRows } from '../../../browser/viewParts/minimap/minimapDirtyRows.js';

suite('Minimap findDirtyRows', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const width = 3;
	const height = 5;

	function image(changedPixels: [x: number, y: number][]): Uint8ClampedArray {
		const data = new Uint8ClampedArray(width * height * 4);
		for (const [x, y] of changedPixels) {
			data[(y * width + x) * 4 + 3] = 255;
		}
		return data;
	}

	test('reports the band of rows that differ', () => {
		const empty = image([]);
		assert.deepStrictEqual([
			findDirtyRows(empty, image([]), width, height),
			findDirtyRows(empty, image([[1, 2]]), width, height),
			findDirtyRows(empty, image([[2, 1], [0, 3]]), width, height),
			findDirtyRows(empty, image([[0, 0], [2, 4]]), width, height),
			findDirtyRows(image([[1, 1]]), image([[1, 3]]), width, height),
		], [
			null,
			{ start: 2, end: 3 },
			{ start: 1, end: 4 },
			{ start: 0, end: 5 },
			{ start: 1, end: 4 },
		]);
	});
});
