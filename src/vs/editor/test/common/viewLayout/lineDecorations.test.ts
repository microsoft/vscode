/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { DecorationSegment, LineDecorationsNormalizer, LineDecoration } from 'vs/editor/common/viewLayout/lineDecorations';
import { Range } from 'vs/editor/common/core/range';
import { InlineDecoration } from 'vs/editor/common/viewModel/viewModel';

suite('Editor ViewLayout - ViewLineParts', () => {

	function newDecoration(startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number, inlineClassName: string): InlineDecoration {
		return new InlineDecoration(new Range(startLineNumber, startColumn, endLineNumber, endColumn), inlineClassName, false);
	}

	test('Bug 9827:Overlapping inline decorations can cause wrong inline class to be applied', () => {

		var result = LineDecorationsNormalizer.normalize([
			new LineDecoration(1, 11, 'c1', false),
			new LineDecoration(3, 4, 'c2', false)
		]);

		assert.deepEqual(result, [
			new DecorationSegment(0, 1, 'c1'),
			new DecorationSegment(2, 2, 'c2 c1'),
			new DecorationSegment(3, 9, 'c1'),
		]);
	});

	test('issue #3462: no whitespace shown at the end of a decorated line', () => {

		var result = LineDecorationsNormalizer.normalize([
			new LineDecoration(15, 21, 'vs-whitespace', false),
			new LineDecoration(20, 21, 'inline-folded', false),
		]);

		assert.deepEqual(result, [
			new DecorationSegment(14, 18, 'vs-whitespace'),
			new DecorationSegment(19, 19, 'vs-whitespace inline-folded')
		]);
	});

	test('issue #3661: Link decoration bleeds to next line when wrapping', () => {

		let result = LineDecoration.filter([
			newDecoration(2, 12, 3, 30, 'detected-link')
		], 3, 12, 500);

		assert.deepEqual(result, [
			new LineDecoration(12, 30, 'detected-link', false),
		]);
	});

	test('ViewLineParts', () => {

		assert.deepEqual(LineDecorationsNormalizer.normalize([
			new LineDecoration(1, 2, 'c1', false),
			new LineDecoration(3, 4, 'c2', false)
		]), [
				new DecorationSegment(0, 0, 'c1'),
				new DecorationSegment(2, 2, 'c2')
			]);

		assert.deepEqual(LineDecorationsNormalizer.normalize([
			new LineDecoration(1, 3, 'c1', false),
			new LineDecoration(3, 4, 'c2', false)
		]), [
				new DecorationSegment(0, 1, 'c1'),
				new DecorationSegment(2, 2, 'c2')
			]);

		assert.deepEqual(LineDecorationsNormalizer.normalize([
			new LineDecoration(1, 4, 'c1', false),
			new LineDecoration(3, 4, 'c2', false)
		]), [
				new DecorationSegment(0, 1, 'c1'),
				new DecorationSegment(2, 2, 'c1 c2')
			]);

		assert.deepEqual(LineDecorationsNormalizer.normalize([
			new LineDecoration(1, 4, 'c1', false),
			new LineDecoration(1, 4, 'c1*', false),
			new LineDecoration(3, 4, 'c2', false)
		]), [
				new DecorationSegment(0, 1, 'c1 c1*'),
				new DecorationSegment(2, 2, 'c1 c1* c2')
			]);

		assert.deepEqual(LineDecorationsNormalizer.normalize([
			new LineDecoration(1, 4, 'c1', false),
			new LineDecoration(1, 4, 'c1*', false),
			new LineDecoration(1, 4, 'c1**', false),
			new LineDecoration(3, 4, 'c2', false)
		]), [
				new DecorationSegment(0, 1, 'c1 c1* c1**'),
				new DecorationSegment(2, 2, 'c1 c1* c1** c2')
			]);

		assert.deepEqual(LineDecorationsNormalizer.normalize([
			new LineDecoration(1, 4, 'c1', false),
			new LineDecoration(1, 4, 'c1*', false),
			new LineDecoration(1, 4, 'c1**', false),
			new LineDecoration(3, 4, 'c2', false),
			new LineDecoration(3, 4, 'c2*', false)
		]), [
				new DecorationSegment(0, 1, 'c1 c1* c1**'),
				new DecorationSegment(2, 2, 'c1 c1* c1** c2 c2*')
			]);

		assert.deepEqual(LineDecorationsNormalizer.normalize([
			new LineDecoration(1, 4, 'c1', false),
			new LineDecoration(1, 4, 'c1*', false),
			new LineDecoration(1, 4, 'c1**', false),
			new LineDecoration(3, 4, 'c2', false),
			new LineDecoration(3, 5, 'c2*', false)
		]), [
				new DecorationSegment(0, 1, 'c1 c1* c1**'),
				new DecorationSegment(2, 2, 'c1 c1* c1** c2 c2*'),
				new DecorationSegment(3, 3, 'c2*')
			]);
	});
});
