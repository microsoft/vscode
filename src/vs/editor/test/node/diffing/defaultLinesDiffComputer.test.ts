/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Range } from '../../../common/core/range.js';
import { getLineRangeMapping, RangeMapping } from '../../../common/diff/rangeMapping.js';
import { OffsetRange } from '../../../common/core/ranges/offsetRange.js';
import { LinesSliceCharSequence } from '../../../common/diff/defaultLinesDiffComputer/linesSliceCharSequence.js';
import { MyersDiffAlgorithm } from '../../../common/diff/defaultLinesDiffComputer/algorithms/myersDiffAlgorithm.js';
import { DynamicProgrammingDiffing } from '../../../common/diff/defaultLinesDiffComputer/algorithms/dynamicProgrammingDiffing.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ArrayText } from '../../../common/core/text/abstractText.js';

suite('myers', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('1', () => {
		const s1 = new LinesSliceCharSequence(['hello world'], new Range(1, 1, 1, Number.MAX_SAFE_INTEGER), true);
		const s2 = new LinesSliceCharSequence(['hallo welt'], new Range(1, 1, 1, Number.MAX_SAFE_INTEGER), true);

		const a = true ? new MyersDiffAlgorithm() : new DynamicProgrammingDiffing();
		a.compute(s1, s2);
	});
});

suite('lineRangeMapping', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('Simple', () => {
		assert.deepStrictEqual(
			getLineRangeMapping(
				new RangeMapping(
					new Range(2, 1, 3, 1),
					new Range(2, 1, 2, 1)
				),
				new ArrayText([
					'const abc = "helloworld".split("");',
					'',
					''
				]),
				new ArrayText([
					'const asciiLower = "helloworld".split("");',
					''
				])
			).toString(),
			"{[2,3)->[2,2)}"
		);
	});

	test('Empty Lines', () => {
		assert.deepStrictEqual(
			getLineRangeMapping(
				new RangeMapping(
					new Range(2, 1, 2, 1),
					new Range(2, 1, 4, 1),
				),
				new ArrayText([
					'',
					'',
				]),
				new ArrayText([
					'',
					'',
					'',
					'',
				])
			).toString(),
			"{[2,2)->[2,4)}"
		);
	});
});

suite('LinesSliceCharSequence', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const sequence = new LinesSliceCharSequence(
		[
			'line1: foo',
			'line2: fizzbuzz',
			'line3: barr',
			'line4: hello world',
			'line5: bazz',
		],
		new Range(2, 1, 5, 1), true
	);

	test('translateOffset', () => {
		assert.deepStrictEqual(
			{ result: OffsetRange.ofLength(sequence.length).map(offset => sequence.translateOffset(offset).toString()) },
			({
				result: [
					"(2,1)", "(2,2)", "(2,3)", "(2,4)", "(2,5)", "(2,6)", "(2,7)", "(2,8)", "(2,9)", "(2,10)", "(2,11)",
					"(2,12)", "(2,13)", "(2,14)", "(2,15)", "(2,16)",

					"(3,1)", "(3,2)", "(3,3)", "(3,4)", "(3,5)", "(3,6)", "(3,7)", "(3,8)", "(3,9)", "(3,10)", "(3,11)", "(3,12)",

					"(4,1)", "(4,2)", "(4,3)", "(4,4)", "(4,5)", "(4,6)", "(4,7)", "(4,8)", "(4,9)",
					"(4,10)", "(4,11)", "(4,12)", "(4,13)", "(4,14)", "(4,15)", "(4,16)", "(4,17)",
					"(4,18)", "(4,19)"
				]
			})
		);
	});

	test('extendToFullLines', () => {
		assert.deepStrictEqual(
			{ result: sequence.getText(sequence.extendToFullLines(new OffsetRange(20, 25))) },
			({ result: "line3: barr\n" })
		);

		assert.deepStrictEqual(
			{ result: sequence.getText(sequence.extendToFullLines(new OffsetRange(20, 45))) },
			({ result: "line3: barr\nline4: hello world\n" })
		);
	});
});
