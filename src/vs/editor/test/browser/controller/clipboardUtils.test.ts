/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { Range } from '../../../common/core/range.js';
import { filterSelections } from '../../../browser/controller/editContext/clipboardUtils.js';
import { testViewModel } from '../viewModel/testViewModel.js';

suite('ClipboardUtils - filterSelections', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('filterSelections with no hidden areas returns original selections', () => {
		testViewModel(['12345678', '12345678', '12345678', '12345678', '12345678'], {}, (viewModel) => {
			const selections = [
				new Range(1, 1, 2, 7),
				new Range(4, 1, 5, 7)
			];

			const hiddenAreas: Range[] = [];

			const result = filterSelections(viewModel, selections, hiddenAreas);

			assert.strictEqual(result.length, 2);
			assert.ok(result[0].equalsRange(new Range(1, 1, 2, 7)));
			assert.ok(result[1].equalsRange(new Range(4, 1, 5, 7)));
		});
	});

	test('filterSelections with hidden areas splits selections', () => {
		testViewModel(['12345678', '12345678', '12345678', '12345678', '12345678', '12345678'], {}, (viewModel) => {
			const selections = [
				new Range(1, 1, 5, 7)
			];

			const hiddenAreas = [
				new Range(2, 1, 3, 7)
			];

			const result = filterSelections(viewModel, selections, hiddenAreas);

			// Expected: selection should be split into:
			// - Range(1, 1, 1, 7) - Line 1 (visible)
			// - Range(4, 1, 5, 7) - Lines 4-5 (visible)
			assert.strictEqual(result.length, 2);
			assert.strictEqual(result[0].startLineNumber, 1);
			assert.strictEqual(result[0].endLineNumber, 1);
			assert.strictEqual(result[1].startLineNumber, 4);
			assert.strictEqual(result[1].endLineNumber, 5);
		});
	});

	test('filterSelections with selection completely hidden', () => {
		testViewModel(['12345678', '12345678', '12345678', '12345678', '12345678'], {}, (viewModel) => {
			const selections = [
				new Range(2, 1, 3, 7)
			];

			const hiddenAreas = [
				new Range(2, 1, 3, 7)
			];

			const result = filterSelections(viewModel, selections, hiddenAreas);

			// Expected: empty result since the entire selection is hidden
			assert.strictEqual(result.length, 0);
		});
	});

	test('filterSelections with multiple selections and hidden areas', () => {
		testViewModel(['12345678', '12345678', '12345678', '12345678', '12345678', '12345678', '12345678', '12345678'], {}, (viewModel) => {
			const selections = [
				new Range(1, 1, 4, 7),
				new Range(6, 1, 8, 7)
			];

			const hiddenAreas = [
				new Range(2, 1, 2, 7),
				new Range(7, 1, 7, 7)
			];

			const result = filterSelections(viewModel, selections, hiddenAreas);

			// Expected: selections split around hidden areas
			// First selection: Range(1,1,1,7), Range(3,1,4,7)
			// Second selection: Range(6,1,6,7), Range(8,1,8,7)
			assert.strictEqual(result.length, 4);
			assert.strictEqual(result[0].startLineNumber, 1);
			assert.strictEqual(result[0].endLineNumber, 1);
			assert.strictEqual(result[1].startLineNumber, 3);
			assert.strictEqual(result[1].endLineNumber, 4);
			assert.strictEqual(result[2].startLineNumber, 6);
			assert.strictEqual(result[2].endLineNumber, 6);
			assert.strictEqual(result[3].startLineNumber, 8);
			assert.strictEqual(result[3].endLineNumber, 8);
		});
	});

	test('filterSelections with selection starting in hidden area', () => {
		testViewModel(['12345678', '12345678', '12345678', '12345678', '12345678'], {}, (viewModel) => {
			const selections = [
				new Range(2, 1, 5, 7)
			];

			const hiddenAreas = [
				new Range(1, 1, 3, 7)
			];

			const result = filterSelections(viewModel, selections, hiddenAreas);

			// Expected: only the visible portion Range(4, 1, 5, 7)
			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].startLineNumber, 4);
			assert.strictEqual(result[0].endLineNumber, 5);
		});
	});

	test('filterSelections with selection ending in hidden area', () => {
		testViewModel(['12345678', '12345678', '12345678', '12345678', '12345678'], {}, (viewModel) => {
			const selections = [
				new Range(1, 1, 4, 7)
			];

			const hiddenAreas = [
				new Range(3, 1, 5, 7)
			];

			const result = filterSelections(viewModel, selections, hiddenAreas);

			// Expected: only the visible portion Range(1, 1, 2, maxColumn)
			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].startLineNumber, 1);
			assert.strictEqual(result[0].endLineNumber, 2);
		});
	});

	test('filterSelections with adjacent hidden areas', () => {
		testViewModel(['12345678', '12345678', '12345678', '12345678', '12345678', '12345678'], {}, (viewModel) => {
			const selections = [
				new Range(1, 1, 6, 7)
			];

			const hiddenAreas = [
				new Range(2, 1, 2, 7),
				new Range(3, 1, 3, 7),
				new Range(5, 1, 5, 7)
			];

			const result = filterSelections(viewModel, selections, hiddenAreas);

			// Expected: selections for lines 1, 4, and 6
			assert.strictEqual(result.length, 3);
			assert.strictEqual(result[0].startLineNumber, 1);
			assert.strictEqual(result[0].endLineNumber, 1);
			assert.strictEqual(result[1].startLineNumber, 4);
			assert.strictEqual(result[1].endLineNumber, 4);
			assert.strictEqual(result[2].startLineNumber, 6);
			assert.strictEqual(result[2].endLineNumber, 6);
		});
	});

	test('filterSelections with overlapping hidden areas', () => {
		testViewModel(['12345678', '12345678', '12345678', '12345678', '12345678'], {}, (viewModel) => {
			const selections = [
				new Range(1, 1, 5, 7)
			];

			const hiddenAreas = [
				new Range(2, 1, 3, 7),
				new Range(3, 1, 4, 7)
			];

			const result = filterSelections(viewModel, selections, hiddenAreas);

			// Expected: selections for lines 1 and 5
			assert.strictEqual(result.length, 2);
			assert.strictEqual(result[0].startLineNumber, 1);
			assert.strictEqual(result[0].endLineNumber, 1);
			assert.strictEqual(result[1].startLineNumber, 5);
			assert.strictEqual(result[1].endLineNumber, 5);
		});
	});

	test('filterSelections preserves column positions', () => {
		testViewModel(['12345678', '12345678', '12345678', '12345678', '12345678'], {}, (viewModel) => {
			const selections = [
				new Range(1, 3, 5, 5)
			];

			const hiddenAreas = [
				new Range(3, 1, 3, 7)
			];

			const result = filterSelections(viewModel, selections, hiddenAreas);

			// Expected:
			// - First range preserves start column 3
			// - Second range preserves end column 5
			assert.strictEqual(result.length, 2);
			assert.strictEqual(result[0].startColumn, 3, 'First range should preserve start column 3');
			assert.strictEqual(result[1].endColumn, 5, 'Second range should preserve end column 5');
		});
	});

	test('filterSelections with single line selection not hidden', () => {
		testViewModel(['12345678', '12345678', '12345678'], {}, (viewModel) => {
			const selections = [
				new Range(2, 1, 2, 7)
			];

			const hiddenAreas = [
				new Range(1, 1, 1, 7)
			];

			const result = filterSelections(viewModel, selections, hiddenAreas);

			// Expected: original selection unchanged
			assert.strictEqual(result.length, 1);
			assert.ok(result[0].equalsRange(new Range(2, 1, 2, 7)));
		});
	});

	test('filterSelections with single line selection that is hidden', () => {
		testViewModel(['12345678', '12345678', '12345678'], {}, (viewModel) => {
			const selections = [
				new Range(2, 1, 2, 7)
			];

			const hiddenAreas = [
				new Range(2, 1, 2, 7)
			];

			const result = filterSelections(viewModel, selections, hiddenAreas);

			// Expected: empty result
			assert.strictEqual(result.length, 0);
		});
	});

	test('filterSelections with empty selection array', () => {
		testViewModel(['12345678', '12345678', '12345678'], {}, (viewModel) => {
			const selections: Range[] = [];

			const hiddenAreas = [
				new Range(2, 1, 2, 7)
			];

			const result = filterSelections(viewModel, selections, hiddenAreas);

			// Expected: empty result
			assert.strictEqual(result.length, 0);
		});
	});
});
