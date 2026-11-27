/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { MonotonousArray, findFirstIdxMonotonous, findFirstMonotonous, findLastMonotonous } from '../../common/arraysFind.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('Arrays', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('findLastMonotonous', () => {
		const array = [1, 4, 5, 7, 55, 59, 60, 61, 64, 69];

		const result = findLastMonotonous(array, n => n <= 60);
		assert.strictEqual(result, 60);

		const result2 = findLastMonotonous(array, n => n <= 62);
		assert.strictEqual(result2, 61);

		const result3 = findLastMonotonous(array, n => n <= 1);
		assert.strictEqual(result3, 1);

		const result4 = findLastMonotonous(array, n => n <= 70);
		assert.strictEqual(result4, 69);

		const result5 = findLastMonotonous(array, n => n <= 0);
		assert.strictEqual(result5, undefined);
	});

	test('findFirstMonotonous', () => {
		const array = [1, 4, 5, 7, 55, 59, 60, 61, 64, 69];

		const result = findFirstMonotonous(array, n => n >= 60);
		assert.strictEqual(result, 60);

		const result2 = findFirstMonotonous(array, n => n >= 62);
		assert.strictEqual(result2, 64);

		const result3 = findFirstMonotonous(array, n => n >= 1);
		assert.strictEqual(result3, 1);

		const result4 = findFirstMonotonous(array, n => n >= 70);
		assert.strictEqual(result4, undefined);

		const result5 = findFirstMonotonous(array, n => n >= 0);
		assert.strictEqual(result5, 1);
	});

	test('MonotonousArray', () => {
		const arr = new MonotonousArray([1, 4, 5, 7, 55, 59, 60, 61, 64, 69]);
		assert.strictEqual(arr.findLastMonotonous(n => n <= 0), undefined);
		assert.strictEqual(arr.findLastMonotonous(n => n <= 0), undefined);
		assert.strictEqual(arr.findLastMonotonous(n => n <= 5), 5);
		assert.strictEqual(arr.findLastMonotonous(n => n <= 6), 5);
		assert.strictEqual(arr.findLastMonotonous(n => n <= 55), 55);
		assert.strictEqual(arr.findLastMonotonous(n => n <= 60), 60);
		assert.strictEqual(arr.findLastMonotonous(n => n <= 80), 69);
	});

	test('findFirstIdxMonotonous with bounded endIdxEx', () => {
		const array = [1, 4, 5, 7, 55, 59, 60, 61, 64, 69];

		// Subrange [0, 4) contains [1, 4, 5, 7]; none are >= 50
		assert.strictEqual(findFirstIdxMonotonous(array, n => n >= 50, 0, 4), -1);

		// Subrange [2, 5) contains [5, 7, 55]; none are >= 60
		assert.strictEqual(findFirstIdxMonotonous(array, n => n >= 60, 2, 5), -1);

		// Match exactly at start of subrange
		assert.strictEqual(findFirstIdxMonotonous(array, n => n >= 55, 4, 8), 4);

		// Match in middle of subrange
		assert.strictEqual(findFirstIdxMonotonous(array, n => n >= 59, 2, 7), 5);

		// Match at last valid subrange element (index 7 is < 8)
		assert.strictEqual(findFirstIdxMonotonous(array, n => n >= 61, 0, 8), 7);

		// Element 64 is at index 8, excluded by endIdxEx = 8
		assert.strictEqual(findFirstIdxMonotonous(array, n => n >= 64, 0, 8), -1);

		// Zero-length subrange where startIdx === endIdxEx
		assert.strictEqual(findFirstIdxMonotonous(array, n => n >= 0, 3, 3), -1);

		// Empty array
		assert.strictEqual(findFirstIdxMonotonous([], n => n >= 0), -1);

		// Full array default boundaries
		assert.strictEqual(findFirstIdxMonotonous(array, n => n >= 60), 6);
		assert.strictEqual(findFirstIdxMonotonous(array, n => n >= 100), -1);
	});
});
