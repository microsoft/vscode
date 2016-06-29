/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {DecorationSegment, LineDecorationsNormalizer, getColumnOfLinePartOffset, createLineParts} from 'vs/editor/common/viewLayout/viewLineParts';
import {Range} from 'vs/editor/common/core/range';
import {RenderLineInput, renderLine} from 'vs/editor/common/viewLayout/viewLineRenderer';
import {ViewLineToken, ViewLineTokens} from 'vs/editor/common/core/viewLineToken';
import {InlineDecoration} from 'vs/editor/common/viewModel/viewModel';

suite('Editor ViewLayout - ViewLineParts', () => {

	function newDecoration(startLineNumber:number, startColumn:number, endLineNumber:number, endColumn:number, inlineClassName:string): InlineDecoration {
		return new InlineDecoration(new Range(startLineNumber, startColumn, endLineNumber, endColumn), inlineClassName);
	}

	test('Bug 9827:Overlapping inline decorations can cause wrong inline class to be applied', () => {

		var result = LineDecorationsNormalizer.normalize(1, 1, [
			newDecoration(1, 1, 1, 11, 'c1'),
			newDecoration(1, 3, 1, 4, 'c2')
		]);

		assert.deepEqual(result, [
			new DecorationSegment(0, 1, 'c1'),
			new DecorationSegment(2, 2, 'c2 c1'),
			new DecorationSegment(3, 9, 'c1'),
		]);
	});

	test('issue #3462: no whitespace shown at the end of a decorated line', () => {

		var result = LineDecorationsNormalizer.normalize(3, 1, [
			newDecoration(3, 15, 3, 21, 'trailing whitespace'),
			newDecoration(3, 20, 3, 21, 'inline-folded'),
		]);

		assert.deepEqual(result, [
			new DecorationSegment(14, 18, 'trailing whitespace'),
			new DecorationSegment(19, 19, 'trailing whitespace inline-folded')
		]);
	});

	test('issue #3661: Link decoration bleeds to next line when wrapping', () => {

		var result = LineDecorationsNormalizer.normalize(3, 12, [
			newDecoration(2, 12, 3, 30, 'detected-link')
		]);

		assert.deepEqual(result, [
			new DecorationSegment(11, 28, 'detected-link'),
		]);
	});

	function testCreateLineParts(lineContent: string, tokens: ViewLineToken[], fauxIndentLength: number, renderWhitespace:boolean, expected:ViewLineToken[]): void {
		let lineParts = createLineParts(1, 1, lineContent, 4, new ViewLineTokens(tokens, fauxIndentLength, lineContent.length), [], renderWhitespace);
		let actual = lineParts.getParts();

		assert.deepEqual(actual, expected);
	}

	test('createLineParts simple', () => {
		testCreateLineParts(
			'Hello world!',
			[
				new ViewLineToken(0, '')
			],
			0,
			false,
			[
				new ViewLineToken(0, '')
			]
		);
	});
	test('createLineParts simple two tokens', () => {
		testCreateLineParts(
			'Hello world!',
			[
				new ViewLineToken(0, 'a'),
				new ViewLineToken(6, 'b')
			],
			0,
			false,
			[
				new ViewLineToken(0, 'a'),
				new ViewLineToken(6, 'b')
			]
		);
	});
	test('createLineParts render whitespace - 4 leading spaces', () => {
		testCreateLineParts(
			'    Hello world!    ',
			[
				new ViewLineToken(0, ''),
				new ViewLineToken(4, 'a'),
				new ViewLineToken(6, 'b')
			],
			0,
			true,
			[
				new ViewLineToken(0, ' leading whitespace'),
				new ViewLineToken(4, 'a'),
				new ViewLineToken(6, 'b'),
				new ViewLineToken(16, 'b trailing whitespace')
			]
		);
	});
	test('createLineParts render whitespace - 8 leading spaces', () => {
		testCreateLineParts(
			'        Hello world!        ',
			[
				new ViewLineToken(0, ''),
				new ViewLineToken(8, 'a'),
				new ViewLineToken(10, 'b')
			],
			0,
			true,
			[
				new ViewLineToken(0, ' leading whitespace'),
				new ViewLineToken(4, ' leading whitespace'),
				new ViewLineToken(8, 'a'),
				new ViewLineToken(10, 'b'),
				new ViewLineToken(20, 'b trailing whitespace'),
				new ViewLineToken(24, 'b trailing whitespace'),
			]
		);
	});
	test('createLineParts render whitespace - 2 leading tabs', () => {
		testCreateLineParts(
			'\t\tHello world!\t',
			[
				new ViewLineToken(0, ''),
				new ViewLineToken(2, 'a'),
				new ViewLineToken(4, 'b')
			],
			0,
			true,
			[
				new ViewLineToken(0, ' leading whitespace'),
				new ViewLineToken(1, ' leading whitespace'),
				new ViewLineToken(2, 'a'),
				new ViewLineToken(4, 'b'),
				new ViewLineToken(14, 'b trailing whitespace'),
			]
		);
	});
	test('createLineParts render whitespace - mixed leading spaces and tabs', () => {
		testCreateLineParts(
			'  \t\t  Hello world! \t  \t   \t    ',
			[
				new ViewLineToken(0, ''),
				new ViewLineToken(6, 'a'),
				new ViewLineToken(8, 'b')
			],
			0,
			true,
			[
				new ViewLineToken(0, ' leading whitespace'),
				new ViewLineToken(3, ' leading whitespace'),
				new ViewLineToken(4, ' leading whitespace'),
				new ViewLineToken(6, 'a'),
				new ViewLineToken(8, 'b'),
				new ViewLineToken(18, 'b trailing whitespace'),
				new ViewLineToken(20, 'b trailing whitespace'),
				new ViewLineToken(23, 'b trailing whitespace'),
				new ViewLineToken(27, 'b trailing whitespace'),
			]
		);
	});
	test('createLineParts render whitespace - mixed leading spaces and tabs', () => {
		testCreateLineParts(
			'  \t\t  Hello world! \t  \t   \t    ',
			[
				new ViewLineToken(0, ''),
				new ViewLineToken(6, 'a'),
				new ViewLineToken(8, 'b')
			],
			0,
			true,
			[
				new ViewLineToken(0, ' leading whitespace'),
				new ViewLineToken(3, ' leading whitespace'),
				new ViewLineToken(4, ' leading whitespace'),
				new ViewLineToken(6, 'a'),
				new ViewLineToken(8, 'b'),
				new ViewLineToken(18, 'b trailing whitespace'),
				new ViewLineToken(20, 'b trailing whitespace'),
				new ViewLineToken(23, 'b trailing whitespace'),
				new ViewLineToken(27, 'b trailing whitespace'),
			]
		);
	});

	test('createLineParts render whitespace skips faux indent', () => {
		testCreateLineParts(
			'\t\t  Hello world! \t  \t   \t    ',
			[
				new ViewLineToken(0, ''),
				new ViewLineToken(4, 'a'),
				new ViewLineToken(6, 'b')
			],
			2,
			true,
			[
				new ViewLineToken(0, ''),
				new ViewLineToken(2, ' leading whitespace'),
				new ViewLineToken(4, 'a'),
				new ViewLineToken(6, 'b'),
				new ViewLineToken(16, 'b trailing whitespace'),
				new ViewLineToken(18, 'b trailing whitespace'),
				new ViewLineToken(21, 'b trailing whitespace'),
				new ViewLineToken(25, 'b trailing whitespace'),
			]
		);
	});

	test('ViewLineParts', () => {

		assert.deepEqual(LineDecorationsNormalizer.normalize(1, 1, [
			newDecoration(1, 1, 1, 2, 'c1'),
			newDecoration(1, 3, 1, 4, 'c2')
		]), [
			new DecorationSegment(0, 0, 'c1'),
			new DecorationSegment(2, 2, 'c2')
		]);

		assert.deepEqual(LineDecorationsNormalizer.normalize(1, 1, [
			newDecoration(1, 1, 1, 3, 'c1'),
			newDecoration(1, 3, 1, 4, 'c2')
		]), [
			new DecorationSegment(0, 1, 'c1'),
			new DecorationSegment(2, 2, 'c2')
		]);

		assert.deepEqual(LineDecorationsNormalizer.normalize(1, 1, [
			newDecoration(1, 1, 1, 4, 'c1'),
			newDecoration(1, 3, 1, 4, 'c2')
		]), [
			new DecorationSegment(0, 1, 'c1'),
			new DecorationSegment(2, 2, 'c1 c2')
		]);

		assert.deepEqual(LineDecorationsNormalizer.normalize(1, 1, [
			newDecoration(1, 1, 1, 4, 'c1'),
			newDecoration(1, 1, 1, 4, 'c1*'),
			newDecoration(1, 3, 1, 4, 'c2')
		]), [
			new DecorationSegment(0, 1, 'c1 c1*'),
			new DecorationSegment(2, 2, 'c1 c1* c2')
		]);

		assert.deepEqual(LineDecorationsNormalizer.normalize(1, 1, [
			newDecoration(1, 1, 1, 4, 'c1'),
			newDecoration(1, 1, 1, 4, 'c1*'),
			newDecoration(1, 1, 1, 4, 'c1**'),
			newDecoration(1, 3, 1, 4, 'c2')
		]), [
			new DecorationSegment(0, 1, 'c1 c1* c1**'),
			new DecorationSegment(2, 2, 'c1 c1* c1** c2')
		]);

		assert.deepEqual(LineDecorationsNormalizer.normalize(1, 1, [
			newDecoration(1, 1, 1, 4, 'c1'),
			newDecoration(1, 1, 1, 4, 'c1*'),
			newDecoration(1, 1, 1, 4, 'c1**'),
			newDecoration(1, 3, 1, 4, 'c2'),
			newDecoration(1, 3, 1, 4, 'c2*')
		]), [
			new DecorationSegment(0, 1, 'c1 c1* c1**'),
			new DecorationSegment(2, 2, 'c1 c1* c1** c2 c2*')
		]);

		assert.deepEqual(LineDecorationsNormalizer.normalize(1, 1, [
			newDecoration(1, 1, 1, 4, 'c1'),
			newDecoration(1, 1, 1, 4, 'c1*'),
			newDecoration(1, 1, 1, 4, 'c1**'),
			newDecoration(1, 3, 1, 4, 'c2'),
			newDecoration(1, 3, 1, 5, 'c2*')
		]), [
			new DecorationSegment(0, 1, 'c1 c1* c1**'),
			new DecorationSegment(2, 2, 'c1 c1* c1** c2 c2*'),
			new DecorationSegment(3, 3, 'c2*')
		]);
	});

	function createTestGetColumnOfLinePartOffset(lineContent:string, tabSize:number, parts:ViewLineToken[]): (partIndex:number, partLength:number, offset:number, expected:number)=>void {
		let renderLineOutput = renderLine(new RenderLineInput(lineContent, tabSize, 10, -1, false, false, parts));

		return (partIndex:number, partLength:number, offset:number, expected:number) => {
			let actual = getColumnOfLinePartOffset(-1, parts, lineContent.length + 1, renderLineOutput.charOffsetInPart, partIndex, partLength, offset);
			assert.equal(actual, expected, 'getColumnOfLinePartOffset for ' + partIndex + ' @ ' + offset);
		};
	}

	test('getColumnOfLinePartOffset 1 - simple text', () => {
		let testGetColumnOfLinePartOffset = createTestGetColumnOfLinePartOffset(
			'hello world',
			4,
			[
				new ViewLineToken(0, 'aToken')
			]
		);
		testGetColumnOfLinePartOffset(0, 11,  0,  1);
		testGetColumnOfLinePartOffset(0, 11,  1,  2);
		testGetColumnOfLinePartOffset(0, 11,  2,  3);
		testGetColumnOfLinePartOffset(0, 11,  3,  4);
		testGetColumnOfLinePartOffset(0, 11,  4,  5);
		testGetColumnOfLinePartOffset(0, 11,  5,  6);
		testGetColumnOfLinePartOffset(0, 11,  6,  7);
		testGetColumnOfLinePartOffset(0, 11,  7,  8);
		testGetColumnOfLinePartOffset(0, 11,  8,  9);
		testGetColumnOfLinePartOffset(0, 11,  9, 10);
		testGetColumnOfLinePartOffset(0, 11, 10, 11);
		testGetColumnOfLinePartOffset(0, 11, 11, 12);
	});

	test('getColumnOfLinePartOffset 2 - regular JS', () => {
		let testGetColumnOfLinePartOffset = createTestGetColumnOfLinePartOffset(
			'var x = 3;',
			4,
			[
				new ViewLineToken(0, 'meta type js storage var expr'),
				new ViewLineToken(3, 'meta js var expr'),
				new ViewLineToken(4, 'meta js var expr var-single-variable variable'),
				new ViewLineToken(5, 'meta js var expr var-single-variable'),
				new ViewLineToken(8, 'meta js var expr var-single-variable constant numeric'),
				new ViewLineToken(9, ''),
			]
		);
		testGetColumnOfLinePartOffset(0, 3, 0,  1);
		testGetColumnOfLinePartOffset(0, 3, 1,  2);
		testGetColumnOfLinePartOffset(0, 3, 2,  3);
		testGetColumnOfLinePartOffset(0, 3, 3,  4);
		testGetColumnOfLinePartOffset(1, 1, 0,  4);
		testGetColumnOfLinePartOffset(1, 1, 1,  5);
		testGetColumnOfLinePartOffset(2, 1, 0,  5);
		testGetColumnOfLinePartOffset(2, 1, 1,  6);
		testGetColumnOfLinePartOffset(3, 3, 0,  6);
		testGetColumnOfLinePartOffset(3, 3, 1,  7);
		testGetColumnOfLinePartOffset(3, 3, 2,  8);
		testGetColumnOfLinePartOffset(3, 3, 3,  9);
		testGetColumnOfLinePartOffset(4, 1, 0,  9);
		testGetColumnOfLinePartOffset(4, 1, 1, 10);
		testGetColumnOfLinePartOffset(5, 1, 0, 10);
		testGetColumnOfLinePartOffset(5, 1, 1, 11);
	});

	test('getColumnOfLinePartOffset 3 - tab with tab size 6', () => {
		let testGetColumnOfLinePartOffset = createTestGetColumnOfLinePartOffset(
			'\t',
			6,
			[
				new ViewLineToken(0, 'leading whitespace')
			]
		);
		testGetColumnOfLinePartOffset(0, 6, 0,  1);
		testGetColumnOfLinePartOffset(0, 6, 1,  1);
		testGetColumnOfLinePartOffset(0, 6, 2,  1);
		testGetColumnOfLinePartOffset(0, 6, 3,  1);
		testGetColumnOfLinePartOffset(0, 6, 4,  2);
		testGetColumnOfLinePartOffset(0, 6, 5,  2);
		testGetColumnOfLinePartOffset(0, 6, 6,  2);
	});

	test('getColumnOfLinePartOffset 4 - once indented line, tab size 4', () => {
		let testGetColumnOfLinePartOffset = createTestGetColumnOfLinePartOffset(
			'\tfunction',
			4,
			[
				new ViewLineToken(0, ''),
				new ViewLineToken(1, 'meta type js function storage'),
			]
		);
		testGetColumnOfLinePartOffset(0, 4, 0,  1);
		testGetColumnOfLinePartOffset(0, 4, 1,  1);
		testGetColumnOfLinePartOffset(0, 4, 2,  1);
		testGetColumnOfLinePartOffset(0, 4, 3,  2);
		testGetColumnOfLinePartOffset(0, 4, 4,  2);
		testGetColumnOfLinePartOffset(1, 8, 0,  2);
		testGetColumnOfLinePartOffset(1, 8, 1,  3);
		testGetColumnOfLinePartOffset(1, 8, 2,  4);
		testGetColumnOfLinePartOffset(1, 8, 3,  5);
		testGetColumnOfLinePartOffset(1, 8, 4,  6);
		testGetColumnOfLinePartOffset(1, 8, 5,  7);
		testGetColumnOfLinePartOffset(1, 8, 6,  8);
		testGetColumnOfLinePartOffset(1, 8, 7,  9);
		testGetColumnOfLinePartOffset(1, 8, 8, 10);
	});

	test('getColumnOfLinePartOffset 5 - twice indented line, tab size 4', () => {
		let testGetColumnOfLinePartOffset = createTestGetColumnOfLinePartOffset(
			'\t\tfunction',
			4,
			[
				new ViewLineToken(0, ''),
				new ViewLineToken(2, 'meta type js function storage'),
			]
		);
		testGetColumnOfLinePartOffset(0, 8, 0,  1);
		testGetColumnOfLinePartOffset(0, 8, 1,  1);
		testGetColumnOfLinePartOffset(0, 8, 2,  1);
		testGetColumnOfLinePartOffset(0, 8, 3,  2);
		testGetColumnOfLinePartOffset(0, 8, 4,  2);
		testGetColumnOfLinePartOffset(0, 8, 5,  2);
		testGetColumnOfLinePartOffset(0, 8, 6,  2);
		testGetColumnOfLinePartOffset(0, 8, 7,  3);
		testGetColumnOfLinePartOffset(0, 8, 8,  3);
		testGetColumnOfLinePartOffset(1, 8, 0,  3);
		testGetColumnOfLinePartOffset(1, 8, 1,  4);
		testGetColumnOfLinePartOffset(1, 8, 2,  5);
		testGetColumnOfLinePartOffset(1, 8, 3,  6);
		testGetColumnOfLinePartOffset(1, 8, 4,  7);
		testGetColumnOfLinePartOffset(1, 8, 5,  8);
		testGetColumnOfLinePartOffset(1, 8, 6,  9);
		testGetColumnOfLinePartOffset(1, 8, 7, 10);
		testGetColumnOfLinePartOffset(1, 8, 8, 11);
	});
});


