/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import ViewLineParts = require('vs/editor/common/viewLayout/viewLineParts');

suite('Editor ViewLayout - ViewLineParts', () => {

	function newDecoration(startLineNumber:number, startColumn:number, endLineNumber:number, endColumn:number, inlineClassName:string): ViewLineParts.ILineDecoration {
		return {
			range: {
				startLineNumber: startLineNumber,
				startColumn: startColumn,
				endLineNumber: endLineNumber,
				endColumn: endColumn
			},
			options: {
				inlineClassName: inlineClassName
			}
		};
	}

	test('Bug 9827:Overlapping inline decorations can cause wrong inline class to be applied', () => {

		var result = ViewLineParts.LineDecorationsNormalizer.normalize(1, [
			newDecoration(1, 1, 1, 11, 'c1'),
			newDecoration(1, 3, 1, 4, 'c2')
		]);

		assert.deepEqual(result, [
			new ViewLineParts.DecorationSegment(0, 1, 'c1'),
			new ViewLineParts.DecorationSegment(2, 2, 'c2 c1'),
			new ViewLineParts.DecorationSegment(3, 9, 'c1'),
		]);
	});

	test('ViewLineParts', () => {

		assert.deepEqual(ViewLineParts.LineDecorationsNormalizer.normalize(1, [
			newDecoration(1, 1, 1, 2, 'c1'),
			newDecoration(1, 3, 1, 4, 'c2')
		]), [
			new ViewLineParts.DecorationSegment(0, 0, 'c1'),
			new ViewLineParts.DecorationSegment(2, 2, 'c2')
		]);

		assert.deepEqual(ViewLineParts.LineDecorationsNormalizer.normalize(1, [
			newDecoration(1, 1, 1, 3, 'c1'),
			newDecoration(1, 3, 1, 4, 'c2')
		]), [
			new ViewLineParts.DecorationSegment(0, 1, 'c1'),
			new ViewLineParts.DecorationSegment(2, 2, 'c2')
		]);

		assert.deepEqual(ViewLineParts.LineDecorationsNormalizer.normalize(1, [
			newDecoration(1, 1, 1, 4, 'c1'),
			newDecoration(1, 3, 1, 4, 'c2')
		]), [
			new ViewLineParts.DecorationSegment(0, 1, 'c1'),
			new ViewLineParts.DecorationSegment(2, 2, 'c1 c2')
		]);

		assert.deepEqual(ViewLineParts.LineDecorationsNormalizer.normalize(1, [
			newDecoration(1, 1, 1, 4, 'c1'),
			newDecoration(1, 1, 1, 4, 'c1*'),
			newDecoration(1, 3, 1, 4, 'c2')
		]), [
			new ViewLineParts.DecorationSegment(0, 1, 'c1 c1*'),
			new ViewLineParts.DecorationSegment(2, 2, 'c1 c1* c2')
		]);

		assert.deepEqual(ViewLineParts.LineDecorationsNormalizer.normalize(1, [
			newDecoration(1, 1, 1, 4, 'c1'),
			newDecoration(1, 1, 1, 4, 'c1*'),
			newDecoration(1, 1, 1, 4, 'c1**'),
			newDecoration(1, 3, 1, 4, 'c2')
		]), [
			new ViewLineParts.DecorationSegment(0, 1, 'c1 c1* c1**'),
			new ViewLineParts.DecorationSegment(2, 2, 'c1 c1* c1** c2')
		]);

		assert.deepEqual(ViewLineParts.LineDecorationsNormalizer.normalize(1, [
			newDecoration(1, 1, 1, 4, 'c1'),
			newDecoration(1, 1, 1, 4, 'c1*'),
			newDecoration(1, 1, 1, 4, 'c1**'),
			newDecoration(1, 3, 1, 4, 'c2'),
			newDecoration(1, 3, 1, 4, 'c2*')
		]), [
			new ViewLineParts.DecorationSegment(0, 1, 'c1 c1* c1**'),
			new ViewLineParts.DecorationSegment(2, 2, 'c1 c1* c1** c2 c2*')
		]);

		assert.deepEqual(ViewLineParts.LineDecorationsNormalizer.normalize(1, [
			newDecoration(1, 1, 1, 4, 'c1'),
			newDecoration(1, 1, 1, 4, 'c1*'),
			newDecoration(1, 1, 1, 4, 'c1**'),
			newDecoration(1, 3, 1, 4, 'c2'),
			newDecoration(1, 3, 1, 5, 'c2*')
		]), [
			new ViewLineParts.DecorationSegment(0, 1, 'c1 c1* c1**'),
			new ViewLineParts.DecorationSegment(2, 2, 'c1 c1* c1** c2 c2*'),
			new ViewLineParts.DecorationSegment(3, 3, 'c2*')
		]);
	});

});


