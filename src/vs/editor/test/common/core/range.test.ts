/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {Range} from 'vs/editor/common/core/range';

suite('Editor Core - Range', () => {
	test('empty range', () => {
		var s = new Range(1, 1, 1, 1);
		assert.equal(s.startLineNumber, 1);
		assert.equal(s.startColumn, 1);
		assert.equal(s.endLineNumber, 1);
		assert.equal(s.endColumn, 1);
		assert.equal(s.isEmpty(), true);
	});

	test('swap start and stop same line', () => {
		var s = new Range(1, 2, 1, 1);
		assert.equal(s.startLineNumber, 1);
		assert.equal(s.startColumn, 1);
		assert.equal(s.endLineNumber, 1);
		assert.equal(s.endColumn, 2);
		assert.equal(s.isEmpty(), false);
	});

	test('swap start and stop', () => {
		var s = new Range(2, 1, 1, 2);
		assert.equal(s.startLineNumber, 1);
		assert.equal(s.startColumn, 2);
		assert.equal(s.endLineNumber, 2);
		assert.equal(s.endColumn, 1);
		assert.equal(s.isEmpty(), false);
	});

	test('no swap same line', () => {
		var s = new Range(1, 1, 1, 2);
		assert.equal(s.startLineNumber, 1);
		assert.equal(s.startColumn, 1);
		assert.equal(s.endLineNumber, 1);
		assert.equal(s.endColumn, 2);
		assert.equal(s.isEmpty(), false);
	});

	test('no swap', () => {
		var s = new Range(1, 1, 2, 1);
		assert.equal(s.startLineNumber, 1);
		assert.equal(s.startColumn, 1);
		assert.equal(s.endLineNumber, 2);
		assert.equal(s.endColumn, 1);
		assert.equal(s.isEmpty(), false);
	});

	test('compareRangesUsingEnds', () => {
		var a, b;

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

		a = new Range(1, 1, 5, 1);
		b = new Range(1, 1, 1, 4);
		assert.ok(Range.compareRangesUsingEnds(a, b) > 0, 'a.start = b.start, a.end > b.end');
	});
});
