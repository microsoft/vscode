/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { Range } from '../../../common/core/range.js';
import { LineRange } from '../../../common/core/ranges/lineRange.js';
import { compareDiffAlgorithms } from '../../../common/diff/diffAlgorithmComparison.js';
import { DefaultLinesDiffComputer } from '../../../common/diff/defaultLinesDiffComputer/defaultLinesDiffComputer.js';
import { ILinesDiffComputer, LinesDiff } from '../../../common/diff/linesDiffComputer.js';
import { DetailedLineRangeMapping, RangeMapping } from '../../../common/diff/rangeMapping.js';

suite('compareDiffAlgorithms', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const original = ['a', 'b', 'c'];
	const modified = ['a', 'B', 'c'];

	/** Deletes `b` instead of replacing it with `B`, which does not reproduce the modified text. */
	const invalidAlgorithm: ILinesDiffComputer = {
		computeDiff: () => new LinesDiff([
			new DetailedLineRangeMapping(new LineRange(2, 3), new LineRange(2, 3), [new RangeMapping(new Range(2, 1, 2, 2), new Range(2, 1, 2, 1))]),
		], [], false),
	};
	const throwingAlgorithm: ILinesDiffComputer = {
		computeDiff: () => { throw new Error('boom'); },
	};

	function compare(primary: ILinesDiffComputer, secondary: ILinesDiffComputer, ignoreTrimWhitespace = false) {
		const result = compareDiffAlgorithms(original, modified, { ignoreTrimWhitespace, maxComputationTimeMs: 0, computeMoves: false }, primary, secondary);
		// Timings are not deterministic.
		return {
			isIdentical: result.isIdentical,
			primary: { ...result.primary, timeMs: undefined },
			secondary: { ...result.secondary, timeMs: undefined },
		};
	}

	test('reports identical, valid diffs', () => {
		assert.deepStrictEqual(compare(new DefaultLinesDiffComputer(), new DefaultLinesDiffComputer()), {
			isIdentical: true,
			primary: { timeMs: undefined, threw: false, hitTimeout: false, changeCount: 1, validity: 'valid' },
			secondary: { timeMs: undefined, threw: false, hitTimeout: false, changeCount: 1, validity: 'valid' },
		});
	});

	test('detects invalid and throwing algorithms', () => {
		assert.deepStrictEqual([compare(new DefaultLinesDiffComputer(), invalidAlgorithm), compare(new DefaultLinesDiffComputer(), throwingAlgorithm)], [
			{
				isIdentical: false,
				primary: { timeMs: undefined, threw: false, hitTimeout: false, changeCount: 1, validity: 'valid' },
				secondary: { timeMs: undefined, threw: false, hitTimeout: false, changeCount: 1, validity: 'invalid' },
			},
			{
				isIdentical: false,
				primary: { timeMs: undefined, threw: false, hitTimeout: false, changeCount: 1, validity: 'valid' },
				secondary: { timeMs: undefined, threw: true, hitTimeout: false, changeCount: 0, validity: 'unverified' },
			},
		]);
	});

	test('does not verify diffs that ignore trim whitespace', () => {
		assert.deepStrictEqual(compare(new DefaultLinesDiffComputer(), invalidAlgorithm, true).secondary.validity, 'unverified');
	});
});
