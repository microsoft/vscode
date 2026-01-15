/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';

suite('Editor Core - Range', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('empty range', () => {
		const s = new Range(1, 1, 1, 1);
		assert.strictEqual(s.startLineNumber, 1);
		assert.strictEqual(s.startColumn, 1);
		assert.strictEqual(s.endLineNumber, 1);
		assert.strictEqual(s.endColumn, 1);
		assert.strictEqual(s.isEmpty(), true);
	});

	test('swap start and stop same line', () => {
		const s = new Range(1, 2, 1, 1);
		assert.strictEqual(s.startLineNumber, 1);
		assert.strictEqual(s.startColumn, 1);
		assert.strictEqual(s.endLineNumber, 1);
		assert.strictEqual(s.endColumn, 2);
		assert.strictEqual(s.isEmpty(), false);
	});

	test('swap start and stop', () => {
		const s = new Range(2, 1, 1, 2);
		assert.strictEqual(s.startLineNumber, 1);
		assert.strictEqual(s.startColumn, 2);
		assert.strictEqual(s.endLineNumber, 2);
		assert.strictEqual(s.endColumn, 1);
		assert.strictEqual(s.isEmpty(), false);
	});

	test('no swap same line', () => {
		const s = new Range(1, 1, 1, 2);
		assert.strictEqual(s.startLineNumber, 1);
		assert.strictEqual(s.startColumn, 1);
		assert.strictEqual(s.endLineNumber, 1);
		assert.strictEqual(s.endColumn, 2);
		assert.strictEqual(s.isEmpty(), false);
	});

	test('no swap', () => {
		const s = new Range(1, 1, 2, 1);
		assert.strictEqual(s.startLineNumber, 1);
		assert.strictEqual(s.startColumn, 1);
		assert.strictEqual(s.endLineNumber, 2);
		assert.strictEqual(s.endColumn, 1);
		assert.strictEqual(s.isEmpty(), false);
	});

	test('compareRangesUsingEnds', () => {
		let a: Range, b: Range;

		a = new Range(1, 1, 1, 3);
		b = new Range(1, 2, 1, 4);
		assert.ok(Range.compareRangesUsingEnds(a, b) < 0, 'a.start < b.start, a.end < b.end');

		a = new Range(1, 1, 1, 3);
		b = new Range(1, 1, 1, 4);
		assert.ok(Range.compareRangesUsingEnds(a, b) < 0, 'a.start = b.start, a.end < b.end');

		a = new Range(1, 2, 1, 3);
		b = new Range(1, 1, 1, 4);
		assert.ok(Range.compareRangesUsingEnds(a, b) < 0, 'a.start > b.start, a.end < b.end');

		a = new Range(1, 1, 1, 4);
		b = new Range(1, 2, 1, 4);
		assert.ok(Range.compareRangesUsingEnds(a, b) < 0, 'a.start < b.start, a.end = b.end');

		a = new Range(1, 1, 1, 4);
		b = new Range(1, 1, 1, 4);
		assert.ok(Range.compareRangesUsingEnds(a, b) === 0, 'a.start = b.start, a.end = b.end');

		a = new Range(1, 2, 1, 4);
		b = new Range(1, 1, 1, 4);
		assert.ok(Range.compareRangesUsingEnds(a, b) > 0, 'a.start > b.start, a.end = b.end');

		a = new Range(1, 1, 1, 5);
		b = new Range(1, 2, 1, 4);
		assert.ok(Range.compareRangesUsingEnds(a, b) > 0, 'a.start < b.start, a.end > b.end');

		a = new Range(1, 1, 2, 4);
		b = new Range(1, 1, 1, 4);
		assert.ok(Range.compareRangesUsingEnds(a, b) > 0, 'a.start = b.start, a.end > b.end');

		a = new Range(1, 2, 5, 1);
		b = new Range(1, 1, 1, 4);
		assert.ok(Range.compareRangesUsingEnds(a, b) > 0, 'a.start > b.start, a.end > b.end');
	});

	test('containsPosition', () => {
		assert.strictEqual(new Range(2, 2, 5, 10).containsPosition(new Position(1, 3)), false);
		assert.strictEqual(new Range(2, 2, 5, 10).containsPosition(new Position(2, 1)), false);
		assert.strictEqual(new Range(2, 2, 5, 10).containsPosition(new Position(2, 2)), true);
		assert.strictEqual(new Range(2, 2, 5, 10).containsPosition(new Position(2, 3)), true);
		assert.strictEqual(new Range(2, 2, 5, 10).containsPosition(new Position(3, 1)), true);
		assert.strictEqual(new Range(2, 2, 5, 10).containsPosition(new Position(5, 9)), true);
		assert.strictEqual(new Range(2, 2, 5, 10).containsPosition(new Position(5, 10)), true);
		assert.strictEqual(new Range(2, 2, 5, 10).containsPosition(new Position(5, 11)), false);
		assert.strictEqual(new Range(2, 2, 5, 10).containsPosition(new Position(6, 1)), false);
	});

	test('containsRange', () => {
		assert.strictEqual(new Range(2, 2, 5, 10).containsRange(new Range(1, 3, 2, 2)), false);
		assert.strictEqual(new Range(2, 2, 5, 10).containsRange(new Range(2, 1, 2, 2)), false);
		assert.strictEqual(new Range(2, 2, 5, 10).containsRange(new Range(2, 2, 5, 11)), false);
		assert.strictEqual(new Range(2, 2, 5, 10).containsRange(new Range(2, 2, 6, 1)), false);
		assert.strictEqual(new Range(2, 2, 5, 10).containsRange(new Range(5, 9, 6, 1)), false);
		assert.strictEqual(new Range(2, 2, 5, 10).containsRange(new Range(5, 10, 6, 1)), false);
		assert.strictEqual(new Range(2, 2, 5, 10).containsRange(new Range(2, 2, 5, 10)), true);
		assert.strictEqual(new Range(2, 2, 5, 10).containsRange(new Range(2, 3, 5, 9)), true);
		assert.strictEqual(new Range(2, 2, 5, 10).containsRange(new Range(3, 100, 4, 100)), true);
	});

	test('areIntersecting', () => {
		assert.strictEqual(Range.areIntersecting(new Range(2, 2, 3, 2), new Range(4, 2, 5, 2)), false);
		assert.strictEqual(Range.areIntersecting(new Range(4, 2, 5, 2), new Range(2, 2, 3, 2)), false);
		assert.strictEqual(Range.areIntersecting(new Range(4, 2, 5, 2), new Range(5, 2, 6, 2)), false);
		assert.strictEqual(Range.areIntersecting(new Range(5, 2, 6, 2), new Range(4, 2, 5, 2)), false);
		assert.strictEqual(Range.areIntersecting(new Range(2, 2, 2, 7), new Range(2, 4, 2, 6)), true);
		assert.strictEqual(Range.areIntersecting(new Range(2, 2, 2, 7), new Range(2, 4, 2, 9)), true);
		assert.strictEqual(Range.areIntersecting(new Range(2, 4, 2, 9), new Range(2, 2, 2, 7)), true);
	});

	suite('subtractRanges', () => {

		test('subtractRanges with no exclude ranges returns original range', () => {
			const range = new Range(1, 1, 2, 7);
			const excludeRanges: Range[] = [];

			const result = Range.subtractRanges(range, excludeRanges);

			assert.strictEqual(result.length, 1);
			assert.ok(result[0].equalsRange(new Range(1, 1, 2, 7)));
		});

		test('subtractRanges with exclude range splits selection', () => {
			const range = new Range(1, 1, 5, 7);
			const excludeRanges = [
				new Range(2, 1, 3, 7)
			];

			const result = Range.subtractRanges(range, excludeRanges);

			// Expected: selection should be split into:
			// - Range(1, 1, 2, 1) - Line 1 to start of hidden
			// - Range(3, 7, 5, 7) - End of hidden to Line 5
			assert.strictEqual(result.length, 2);
			assert.strictEqual(result[0].startLineNumber, 1);
			assert.strictEqual(result[0].startColumn, 1);
			assert.strictEqual(result[0].endLineNumber, 2);
			assert.strictEqual(result[0].endColumn, 1);
			assert.strictEqual(result[1].startLineNumber, 3);
			assert.strictEqual(result[1].startColumn, 7);
			assert.strictEqual(result[1].endLineNumber, 5);
			assert.strictEqual(result[1].endColumn, 7);
		});

		test('subtractRanges with selection completely hidden', () => {
			const range = new Range(2, 1, 3, 7);
			const excludeRanges = [
				new Range(2, 1, 3, 7)
			];

			const result = Range.subtractRanges(range, excludeRanges);

			// Expected: empty result since the entire selection is hidden
			assert.strictEqual(result.length, 0);
		});

		test('subtractRanges with multiple exclude ranges', () => {
			const range = new Range(1, 1, 8, 7);
			const excludeRanges = [
				new Range(2, 1, 2, 7),
				new Range(7, 1, 7, 7)
			];

			const result = Range.subtractRanges(range, excludeRanges);

			// Expected: selections split around hidden areas
			assert.strictEqual(result.length, 3);
			assert.strictEqual(result[0].startLineNumber, 1);
			assert.strictEqual(result[1].startLineNumber, 2);
			assert.strictEqual(result[1].endLineNumber, 7);
			assert.strictEqual(result[2].startLineNumber, 7);
			assert.strictEqual(result[2].endLineNumber, 8);
		});

		test('subtractRanges with selection starting in hidden area', () => {
			const range = new Range(2, 1, 5, 7);
			const excludeRanges = [
				new Range(1, 1, 3, 7)
			];

			const result = Range.subtractRanges(range, excludeRanges);

			// Expected: only the visible portion after the hidden area
			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].startLineNumber, 3);
			assert.strictEqual(result[0].startColumn, 7);
			assert.strictEqual(result[0].endLineNumber, 5);
			assert.strictEqual(result[0].endColumn, 7);
		});

		test('subtractRanges with selection ending in hidden area', () => {
			const range = new Range(1, 1, 4, 7);
			const excludeRanges = [
				new Range(3, 1, 5, 7)
			];

			const result = Range.subtractRanges(range, excludeRanges);

			// Expected: only the visible portion before the hidden area
			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].startLineNumber, 1);
			assert.strictEqual(result[0].startColumn, 1);
			assert.strictEqual(result[0].endLineNumber, 3);
			assert.strictEqual(result[0].endColumn, 1);
		});

		test('subtractRanges with adjacent hidden areas', () => {
			const range = new Range(1, 1, 6, 7);
			const excludeRanges = [
				new Range(2, 1, 2, 7),
				new Range(3, 1, 3, 7),
				new Range(5, 1, 5, 7)
			];

			const result = Range.subtractRanges(range, excludeRanges);

			// Expected: selections for visible portions
			assert.ok(result.length > 0);
			assert.strictEqual(result[0].startLineNumber, 1);
		});

		test('subtractRanges with overlapping hidden areas', () => {
			const range = new Range(1, 1, 5, 7);
			const excludeRanges = [
				new Range(2, 1, 3, 7),
				new Range(3, 1, 4, 7)
			];

			const result = Range.subtractRanges(range, excludeRanges);

			// Expected: visible portions before and after overlapping hidden areas
			assert.ok(result.length > 0);
			assert.strictEqual(result[0].startLineNumber, 1);
		});

		test('subtractRanges preserves column positions', () => {
			const range = new Range(1, 3, 5, 5);
			const excludeRanges = [
				new Range(3, 1, 3, 7)
			];

			const result = Range.subtractRanges(range, excludeRanges);

			// Expected:
			// - First range preserves start column 3
			// - Second range preserves end column 5
			assert.strictEqual(result.length, 2);
			assert.strictEqual(result[0].startColumn, 3, 'First range should preserve start column 3');
			assert.strictEqual(result[1].endColumn, 5, 'Second range should preserve end column 5');
		});

		test('subtractRanges with single line selection not hidden', () => {
			const range = new Range(2, 1, 2, 7);
			const excludeRanges = [
				new Range(1, 1, 1, 7)
			];

			const result = Range.subtractRanges(range, excludeRanges);

			// Expected: original selection unchanged
			assert.strictEqual(result.length, 1);
			assert.ok(result[0].equalsRange(new Range(2, 1, 2, 7)));
		});

		test('subtractRanges with single line selection that is hidden', () => {
			const range = new Range(2, 1, 2, 7);
			const excludeRanges = [
				new Range(2, 1, 2, 7)
			];

			const result = Range.subtractRanges(range, excludeRanges);

			// Expected: empty result
			assert.strictEqual(result.length, 0);
		});
	});
});
