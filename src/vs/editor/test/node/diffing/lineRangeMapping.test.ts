/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Range } from 'vs/editor/common/core/range';
import { RangeMapping } from 'vs/editor/common/diff/linesDiffComputer';
import { getLineRangeMapping } from 'vs/editor/common/diff/standardLinesDiffComputer';

suite('lineRangeMapping', () => {
	test('1', () => {
		assert.deepStrictEqual(
			getLineRangeMapping(
				new RangeMapping(
					new Range(2, 1, 3, 1),
					new Range(2, 1, 2, 1)
				),
				[
					'const abc = "helloworld".split("");',
					'',
					''
				],
				[
					'const asciiLower = "helloworld".split("");',
					''
				]
			).toString(),
			"{[2,3)->[2,2)}"
		);
	});

	test('2', () => {
		assert.deepStrictEqual(
			getLineRangeMapping(
				new RangeMapping(
					new Range(2, 1, 2, 1),
					new Range(2, 1, 4, 1),
				),
				[
					'',
					'',
				],
				[
					'',
					'',
					'',
					'',
				]
			).toString(),
			"{[2,2)->[2,4)}"
		);
	});
});
