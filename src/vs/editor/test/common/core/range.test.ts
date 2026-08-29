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
});
