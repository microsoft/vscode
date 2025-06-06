/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { MonotonousArray, findFirstMonotonous, findLastMonotonous } from '../../common/arraysFind.js';
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
});
