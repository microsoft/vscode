/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Length, lengthAdd, lengthDiffNonNegative, lengthToObj, toLength } from '../../../../common/model/bracketPairsTextModelPart/bracketPairsTree/length.js';

suite('Bracket Pair Colorizer - Length', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function toStr(length: Length): string {
		return lengthToObj(length).toString();
	}

	test('Basic', () => {
		const l1 = toLength(100, 10);
		assert.strictEqual(lengthToObj(l1).lineCount, 100);
		assert.strictEqual(lengthToObj(l1).columnCount, 10);

		assert.deepStrictEqual(toStr(lengthAdd(l1, toLength(100, 10))), '200,10');
		assert.deepStrictEqual(toStr(lengthAdd(l1, toLength(0, 10))), '100,20');
	});

	test('lengthDiffNonNeg', () => {
		assert.deepStrictEqual(
			toStr(
				lengthDiffNonNegative(
					toLength(100, 10),
					toLength(100, 20))
			),
			'0,10'
		);

		assert.deepStrictEqual(
			toStr(
				lengthDiffNonNegative(
					toLength(100, 10),
					toLength(101, 20))
			),
			'1,20'
		);

		assert.deepStrictEqual(
			toStr(
				lengthDiffNonNegative(
					toLength(101, 30),
					toLength(101, 20))
			),
			'0,0'
		);

		assert.deepStrictEqual(
			toStr(
				lengthDiffNonNegative(
					toLength(102, 10),
					toLength(101, 20))
			),
			'0,0'
		);
	});
});
