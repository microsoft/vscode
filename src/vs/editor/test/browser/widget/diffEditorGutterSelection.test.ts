/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { Range } from '../../../common/core/range.js';
import { StringText } from '../../../common/core/text/abstractText.js';
import { TextEdit } from '../../../common/core/edits/textEdit.js';
import { DetailedLineRangeMapping, RangeMapping } from '../../../common/diff/rangeMapping.js';
import { LineRange } from '../../../common/core/ranges/lineRange.js';

suite('DiffEditorGutterSelection', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('Partial staging of pure deletions', () => {
		/**
		 * Simulates what computeStagedValue does:
		 * applies the inner changes (as text edits) from modified onto original.
		 */
		function computeStagedValue(innerChanges: RangeMapping[], original: StringText, modified: StringText): string {
			const edit = new TextEdit(innerChanges.map(c => c.toTextEdit(modified)));
			return edit.apply(original);
		}

		/**
		 * Simulates the clipping logic from gutterFeature._selectedDiffs:
		 * clips inner changes' originalRange to the selection.
		 */
		function clipRangeMappings(innerChanges: RangeMapping[], selection: Range): RangeMapping[] {
			return innerChanges.flatMap(c => {
				const clipped = Range.intersectRanges(c.originalRange, selection);
				if (!clipped || clipped.isEmpty()) { return []; }
				return [new RangeMapping(clipped, c.modifiedRange)];
			});
		}

		test('Full deletion staged completely', () => {
			// Original has 5 lines, modified has 0 (pure deletion of lines 2-4)
			const original = new StringText('line1\nline2\nline3\nline4\nline5');
			const modified = new StringText('line1\nline5');

			// A pure deletion: original lines 2-4 deleted, modified range is empty
			const innerChange = new RangeMapping(
				new Range(2, 1, 5, 1),  // original: lines 2-4 (up to start of line 5)
				new Range(2, 1, 2, 1),  // modified: empty range at line 2
			);

			// Select all deleted lines
			const selection = new Range(2, 1, 5, 1);
			const clipped = clipRangeMappings([innerChange], selection);

			assert.deepStrictEqual(
				computeStagedValue(clipped, original, modified),
				'line1\nline5',
			);
		});

		test('Partial deletion — select first two of three deleted lines', () => {
			const original = new StringText('line1\nline2\nline3\nline4\nline5');
			const modified = new StringText('line1\nline5');

			const innerChange = new RangeMapping(
				new Range(2, 1, 5, 1),
				new Range(2, 1, 2, 1),
			);

			// Select only lines 2-3 (not line 4)
			const selection = new Range(2, 1, 4, 1);
			const clipped = clipRangeMappings([innerChange], selection);

			assert.deepStrictEqual(
				computeStagedValue(clipped, original, modified),
				'line1\nline4\nline5',
			);
		});

		test('Partial deletion — select last line of three deleted lines', () => {
			const original = new StringText('line1\nline2\nline3\nline4\nline5');
			const modified = new StringText('line1\nline5');

			const innerChange = new RangeMapping(
				new Range(2, 1, 5, 1),
				new Range(2, 1, 2, 1),
			);

			// Select only line 4
			const selection = new Range(4, 1, 5, 1);
			const clipped = clipRangeMappings([innerChange], selection);

			assert.deepStrictEqual(
				computeStagedValue(clipped, original, modified),
				'line1\nline2\nline3\nline5',
			);
		});

		test('Selection does not intersect deletion — no changes applied', () => {
			const original = new StringText('line1\nline2\nline3\nline4\nline5');
			const modified = new StringText('line1\nline5');

			const innerChange = new RangeMapping(
				new Range(2, 1, 5, 1),
				new Range(2, 1, 2, 1),
			);

			// Select line 1 (outside the deletion)
			const selection = new Range(1, 1, 2, 1);
			const clipped = clipRangeMappings([innerChange], selection);

			assert.strictEqual(clipped.length, 0);
		});

		test('fromRangeMappings produces correct DetailedLineRangeMapping from clipped range', () => {
			const innerChange = new RangeMapping(
				new Range(2, 1, 5, 1),
				new Range(2, 1, 2, 1),
			);

			// Clip to lines 3-4
			const selection = new Range(3, 1, 5, 1);
			const clipped = clipRangeMappings([innerChange], selection);

			const mapping = DetailedLineRangeMapping.fromRangeMappings(clipped);
			assert.deepStrictEqual(mapping.original, new LineRange(3, 6));
			assert.deepStrictEqual(mapping.modified, new LineRange(2, 3));
			assert.strictEqual(mapping.innerChanges!.length, 1);
		});
	});
});
