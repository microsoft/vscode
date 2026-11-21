/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { Range } from '../../../common/core/range.js';
import { LineRange } from '../../../common/core/ranges/lineRange.js';
import { DefaultLinesDiffComputer } from '../../../common/diff/defaultLinesDiffComputer/defaultLinesDiffComputer.js';
import { LinesDiff } from '../../../common/diff/linesDiffComputer.js';
import { DetailedLineRangeMapping, RangeMapping } from '../../../common/diff/rangeMapping.js';
import { verifyLinesDiff } from '../../../common/diff/verifyLinesDiff.js';

suite('verifyLinesDiff', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const original = ['a', '\tb', 'c'];
	const modified = ['a', '  B', 'c'];

	function computeDiff(ignoreTrimWhitespace: boolean): LinesDiff {
		return new DefaultLinesDiffComputer().computeDiff(original, modified, { ignoreTrimWhitespace, maxComputationTimeMs: 0, computeMoves: false });
	}

	function singleChange(innerChanges: RangeMapping[] | undefined): LinesDiff {
		return new LinesDiff([new DetailedLineRangeMapping(new LineRange(2, 3), new LineRange(2, 3), innerChanges)], [], false);
	}

	test('valid, invalid and unverified diffs', () => {
		assert.deepStrictEqual({
			correct: verifyLinesDiff(computeDiff(false), original, modified, false),
			correctIgnoringTrimWhitespace: verifyLinesDiff(computeDiff(true), original, modified, true),
			// Ignoring trim whitespace drops the indentation change, so the text is only reproduced up to trimming.
			ignoringTrimWhitespaceCheckedStrictly: verifyLinesDiff(computeDiff(true), original, modified, false),
			// Deletes `b` instead of replacing it with `B`.
			wrongEdit: verifyLinesDiff(singleChange([new RangeMapping(new Range(2, 2, 2, 3), new Range(2, 3, 2, 3))]), original, modified, true),
			noInnerChanges: verifyLinesDiff(singleChange(undefined), original, modified, false),
		}, {
			correct: 'valid',
			correctIgnoringTrimWhitespace: 'valid',
			ignoringTrimWhitespaceCheckedStrictly: 'invalid',
			wrongEdit: 'invalid',
			noInnerChanges: 'unverified',
		});
	});
});
