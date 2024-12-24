/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { LineRange, LineRangeSet } from '../../../common/core/lineRange.js';

suite('LineRange', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('contains', () => {
		const r = new LineRange(2, 3);
		assert.deepStrictEqual(r.contains(1), false);
		assert.deepStrictEqual(r.contains(2), true);
		assert.deepStrictEqual(r.contains(3), false);
		assert.deepStrictEqual(r.contains(4), false);
	});
});

suite('LineRangeSet', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('addRange', () => {
		const set = new LineRangeSet();
		set.addRange(new LineRange(2, 3));
		set.addRange(new LineRange(3, 4));
		set.addRange(new LineRange(10, 20));
		assert.deepStrictEqual(set.toString(), '[2,4), [10,20)');

		set.addRange(new LineRange(3, 21));
		assert.deepStrictEqual(set.toString(), '[2,21)');
	});

	test('getUnion', () => {
		const set1 = new LineRangeSet([
			new LineRange(2, 3),
			new LineRange(5, 7),
			new LineRange(10, 20)
		]);
		const set2 = new LineRangeSet([
			new LineRange(3, 4),
			new LineRange(6, 8),
			new LineRange(9, 11)
		]);

		const union = set1.getUnion(set2);
		assert.deepStrictEqual(union.toString(), '[2,4), [5,8), [9,20)');
	});

	test('intersects', () => {
		const set1 = new LineRangeSet([
			new LineRange(2, 3),
			new LineRange(5, 7),
			new LineRange(10, 20)
		]);

		assert.deepStrictEqual(set1.intersects(new LineRange(1, 2)), false);
		assert.deepStrictEqual(set1.intersects(new LineRange(1, 3)), true);
		assert.deepStrictEqual(set1.intersects(new LineRange(3, 5)), false);
	});
});
