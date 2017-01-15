/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { DecorationSegment, LineDecorationsNormalizer, Decoration } from 'vs/editor/common/viewLayout/viewLineParts';
import { Range } from 'vs/editor/common/core/range';
import { RenderLineInput, renderViewLine } from 'vs/editor/common/viewLayout/viewLineRenderer';
import { ViewLineToken, ViewLineTokens } from 'vs/editor/common/core/viewLineToken';
import { InlineDecoration } from 'vs/editor/common/viewModel/viewModel';

suite('Editor ViewLayout - ViewLineParts', () => {

	function newDecoration(startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number, inlineClassName: string): InlineDecoration {
		return new InlineDecoration(new Range(startLineNumber, startColumn, endLineNumber, endColumn), inlineClassName);
	}

	test('Bug 9827:Overlapping inline decorations can cause wrong inline class to be applied', () => {

		var result = LineDecorationsNormalizer.normalize([
			new Decoration(1, 11, 'c1'),
			new Decoration(3, 4, 'c2')
		]);

		assert.deepEqual(result, [
			new DecorationSegment(0, 1, 'c1'),
			new DecorationSegment(2, 2, 'c2 c1'),
			new DecorationSegment(3, 9, 'c1'),
		]);
	});

	test('issue #3462: no whitespace shown at the end of a decorated line', () => {

		var result = LineDecorationsNormalizer.normalize([
			new Decoration(15, 21, 'vs-whitespace'),
			new Decoration(20, 21, 'inline-folded'),
		]);

		assert.deepEqual(result, [
			new DecorationSegment(14, 18, 'vs-whitespace'),
			new DecorationSegment(19, 19, 'vs-whitespace inline-folded')
		]);
	});

	test('issue #3661: Link decoration bleeds to next line when wrapping', () => {

		let result = Decoration.filter([
			newDecoration(2, 12, 3, 30, 'detected-link')
		], 3, 12, 500);

		assert.deepEqual(result, [
			new Decoration(12, 30, 'detected-link'),
		]);
	});

	function testCreateLineParts(lineContent: string, tokens: ViewLineToken[], fauxIndentLength: number, renderWhitespace: 'none' | 'boundary' | 'all', expected: string): void {
		let actual = renderViewLine(new RenderLineInput(
			lineContent,
			new ViewLineTokens(tokens, fauxIndentLength, lineContent.length),
			[],
			4,
			10,
			-1,
			renderWhitespace,
			false
		));

		assert.deepEqual(actual.output.split(/></g), expected.split(/></g));
	}

	test('createLineParts simple', () => {
		testCreateLineParts(
			'Hello world!',
			[
				new ViewLineToken(0, '')
			],
			0,
			'none',
			[
				'<span>',
				'<span class="">Hello&nbsp;world!</span>',
				'</span>',
			].join('')
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
			'none',
			[
				'<span>',
				'<span class="a">Hello&nbsp;</span>',
				'<span class="b">world!</span>',
				'</span>',
			].join('')
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
			'boundary',
			[
				'<span>',
				'<span class="vs-whitespace" style="width:40px">&middot;&middot;&middot;&middot;</span>',
				'<span class="a">He</span>',
				'<span class="b">llo&nbsp;world!</span>',
				'<span class="vs-whitespace" style="width:40px">&middot;&middot;&middot;&middot;</span>',
				'</span>',
			].join('')
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
			'boundary',
			[
				'<span>',
				'<span class="vs-whitespace" style="width:40px">&middot;&middot;&middot;&middot;</span>',
				'<span class="vs-whitespace" style="width:40px">&middot;&middot;&middot;&middot;</span>',
				'<span class="a">He</span>',
				'<span class="b">llo&nbsp;world!</span>',
				'<span class="vs-whitespace" style="width:40px">&middot;&middot;&middot;&middot;</span>',
				'<span class="vs-whitespace" style="width:40px">&middot;&middot;&middot;&middot;</span>',
				'</span>',
			].join('')
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
			'boundary',
			[
				'<span>',
				'<span class="vs-whitespace" style="width:40px">&rarr;&nbsp;&nbsp;&nbsp;</span>',
				'<span class="vs-whitespace" style="width:40px">&rarr;&nbsp;&nbsp;&nbsp;</span>',
				'<span class="a">He</span>',
				'<span class="b">llo&nbsp;world!</span>',
				'<span class="vs-whitespace" style="width:40px">&rarr;&nbsp;&nbsp;&nbsp;</span>',
				'</span>',
			].join('')
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
			'boundary',
			[
				'<span>',
				'<span class="vs-whitespace" style="width:40px">&middot;&middot;&rarr;&nbsp;</span>',
				'<span class="vs-whitespace" style="width:40px">&rarr;&nbsp;&nbsp;&nbsp;</span>',
				'<span class="vs-whitespace" style="width:20px">&middot;&middot;</span>',
				'<span class="a">He</span>',
				'<span class="b">llo&nbsp;world!</span>',
				'<span class="vs-whitespace" style="width:20px">&middot;&rarr;</span>',
				'<span class="vs-whitespace" style="width:40px">&middot;&middot;&rarr;&nbsp;</span>',
				'<span class="vs-whitespace" style="width:40px">&middot;&middot;&middot;&rarr;</span>',
				'<span class="vs-whitespace" style="width:40px">&middot;&middot;&middot;&middot;</span>',
				'</span>',
			].join('')
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
			'boundary',
			[
				'<span>',
				'<span class="">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>',
				'<span class="vs-whitespace" style="width:20px">&middot;&middot;</span>',
				'<span class="a">He</span>',
				'<span class="b">llo&nbsp;world!</span>',
				'<span class="vs-whitespace" style="width:20px">&middot;&rarr;</span>',
				'<span class="vs-whitespace" style="width:40px">&middot;&middot;&rarr;&nbsp;</span>',
				'<span class="vs-whitespace" style="width:40px">&middot;&middot;&middot;&rarr;</span>',
				'<span class="vs-whitespace" style="width:40px">&middot;&middot;&middot;&middot;</span>',
				'</span>',
			].join('')
		);
	});

	test('createLineParts render whitespace in middle but not for one space', () => {
		testCreateLineParts(
			'it  it it  it',
			[
				new ViewLineToken(0, ''),
				new ViewLineToken(6, 'a'),
				new ViewLineToken(7, 'b')
			],
			0,
			'boundary',
			[
				'<span>',
				'<span class="">it</span>',
				'<span class="vs-whitespace" style="width:20px">&middot;&middot;</span>',
				'<span class="">it</span>',
				'<span class="a">&nbsp;</span>',
				'<span class="b">it</span>',
				'<span class="vs-whitespace" style="width:20px">&middot;&middot;</span>',
				'<span class="b">it</span>',
				'</span>',
			].join('')
		);
	});

	test('createLineParts render whitespace for all in middle', () => {
		testCreateLineParts(
			' Hello world!\t',
			[
				new ViewLineToken(0, ''),
				new ViewLineToken(4, 'a'),
				new ViewLineToken(6, 'b')
			],
			0,
			'all',
			[
				'<span>',
				'<span class="vs-whitespace" style="width:10px">&middot;</span>',
				'<span class="">Hel</span>',
				'<span class="a">lo</span>',
				'<span class="vs-whitespace" style="width:10px">&middot;</span>',
				'<span class="b">world!</span>',
				'<span class="vs-whitespace" style="width:30px">&rarr;&nbsp;&nbsp;</span>',
				'</span>',
			].join('')
		);
	});

	test('createLineParts can handle unsorted inline decorations', () => {
		let actual = renderViewLine(new RenderLineInput(
			'Hello world',
			new ViewLineTokens([new ViewLineToken(0, '')], 0, 'Hello world'.length),
			[
				new Decoration(5, 7, 'a'),
				new Decoration(1, 3, 'b'),
				new Decoration(2, 8, 'c'),
			],
			4,
			10,
			-1,
			'none',
			false
		));

		// 01234567890
		// Hello world
		// ----aa-----
		// bb---------
		// -cccccc----

		assert.deepEqual(actual.output, [
			'<span>',
			'<span class=" b">H</span>',
			'<span class=" b c">e</span>',
			'<span class=" c">ll</span>',
			'<span class=" a c">o&nbsp;</span>',
			'<span class=" c">w</span>',
			'<span class="">orld</span>',
			'</span>',
		].join(''));
	});

	test('ViewLineParts', () => {

		assert.deepEqual(LineDecorationsNormalizer.normalize([
			new Decoration(1, 2, 'c1'),
			new Decoration(3, 4, 'c2')
		]), [
				new DecorationSegment(0, 0, 'c1'),
				new DecorationSegment(2, 2, 'c2')
			]);

		assert.deepEqual(LineDecorationsNormalizer.normalize([
			new Decoration(1, 3, 'c1'),
			new Decoration(3, 4, 'c2')
		]), [
				new DecorationSegment(0, 1, 'c1'),
				new DecorationSegment(2, 2, 'c2')
			]);

		assert.deepEqual(LineDecorationsNormalizer.normalize([
			new Decoration(1, 4, 'c1'),
			new Decoration(3, 4, 'c2')
		]), [
				new DecorationSegment(0, 1, 'c1'),
				new DecorationSegment(2, 2, 'c1 c2')
			]);

		assert.deepEqual(LineDecorationsNormalizer.normalize([
			new Decoration(1, 4, 'c1'),
			new Decoration(1, 4, 'c1*'),
			new Decoration(3, 4, 'c2')
		]), [
				new DecorationSegment(0, 1, 'c1 c1*'),
				new DecorationSegment(2, 2, 'c1 c1* c2')
			]);

		assert.deepEqual(LineDecorationsNormalizer.normalize([
			new Decoration(1, 4, 'c1'),
			new Decoration(1, 4, 'c1*'),
			new Decoration(1, 4, 'c1**'),
			new Decoration(3, 4, 'c2')
		]), [
				new DecorationSegment(0, 1, 'c1 c1* c1**'),
				new DecorationSegment(2, 2, 'c1 c1* c1** c2')
			]);

		assert.deepEqual(LineDecorationsNormalizer.normalize([
			new Decoration(1, 4, 'c1'),
			new Decoration(1, 4, 'c1*'),
			new Decoration(1, 4, 'c1**'),
			new Decoration(3, 4, 'c2'),
			new Decoration(3, 4, 'c2*')
		]), [
				new DecorationSegment(0, 1, 'c1 c1* c1**'),
				new DecorationSegment(2, 2, 'c1 c1* c1** c2 c2*')
			]);

		assert.deepEqual(LineDecorationsNormalizer.normalize([
			new Decoration(1, 4, 'c1'),
			new Decoration(1, 4, 'c1*'),
			new Decoration(1, 4, 'c1**'),
			new Decoration(3, 4, 'c2'),
			new Decoration(3, 5, 'c2*')
		]), [
				new DecorationSegment(0, 1, 'c1 c1* c1**'),
				new DecorationSegment(2, 2, 'c1 c1* c1** c2 c2*'),
				new DecorationSegment(3, 3, 'c2*')
			]);
	});

	function createTestGetColumnOfLinePartOffset(lineContent: string, tabSize: number, parts: ViewLineToken[]): (partIndex: number, partLength: number, offset: number, expected: number) => void {
		let renderLineOutput = renderViewLine(new RenderLineInput(
			lineContent,
			new ViewLineTokens(parts, 0, lineContent.length),
			[],
			tabSize,
			10,
			-1,
			'none',
			false
		));

		return (partIndex: number, partLength: number, offset: number, expected: number) => {
			let charOffset = renderLineOutput.characterMapping.partDataToCharOffset(partIndex, partLength, offset);
			let actual = charOffset + 1;
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
		testGetColumnOfLinePartOffset(0, 11, 0, 1);
		testGetColumnOfLinePartOffset(0, 11, 1, 2);
		testGetColumnOfLinePartOffset(0, 11, 2, 3);
		testGetColumnOfLinePartOffset(0, 11, 3, 4);
		testGetColumnOfLinePartOffset(0, 11, 4, 5);
		testGetColumnOfLinePartOffset(0, 11, 5, 6);
		testGetColumnOfLinePartOffset(0, 11, 6, 7);
		testGetColumnOfLinePartOffset(0, 11, 7, 8);
		testGetColumnOfLinePartOffset(0, 11, 8, 9);
		testGetColumnOfLinePartOffset(0, 11, 9, 10);
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
		testGetColumnOfLinePartOffset(0, 3, 0, 1);
		testGetColumnOfLinePartOffset(0, 3, 1, 2);
		testGetColumnOfLinePartOffset(0, 3, 2, 3);
		testGetColumnOfLinePartOffset(0, 3, 3, 4);
		testGetColumnOfLinePartOffset(1, 1, 0, 4);
		testGetColumnOfLinePartOffset(1, 1, 1, 5);
		testGetColumnOfLinePartOffset(2, 1, 0, 5);
		testGetColumnOfLinePartOffset(2, 1, 1, 6);
		testGetColumnOfLinePartOffset(3, 3, 0, 6);
		testGetColumnOfLinePartOffset(3, 3, 1, 7);
		testGetColumnOfLinePartOffset(3, 3, 2, 8);
		testGetColumnOfLinePartOffset(3, 3, 3, 9);
		testGetColumnOfLinePartOffset(4, 1, 0, 9);
		testGetColumnOfLinePartOffset(4, 1, 1, 10);
		testGetColumnOfLinePartOffset(5, 1, 0, 10);
		testGetColumnOfLinePartOffset(5, 1, 1, 11);
	});

	test('getColumnOfLinePartOffset 3 - tab with tab size 6', () => {
		let testGetColumnOfLinePartOffset = createTestGetColumnOfLinePartOffset(
			'\t',
			6,
			[
				new ViewLineToken(0, 'vs-whitespace')
			]
		);
		testGetColumnOfLinePartOffset(0, 6, 0, 1);
		testGetColumnOfLinePartOffset(0, 6, 1, 1);
		testGetColumnOfLinePartOffset(0, 6, 2, 1);
		testGetColumnOfLinePartOffset(0, 6, 3, 1);
		testGetColumnOfLinePartOffset(0, 6, 4, 2);
		testGetColumnOfLinePartOffset(0, 6, 5, 2);
		testGetColumnOfLinePartOffset(0, 6, 6, 2);
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
		testGetColumnOfLinePartOffset(0, 4, 0, 1);
		testGetColumnOfLinePartOffset(0, 4, 1, 1);
		testGetColumnOfLinePartOffset(0, 4, 2, 1);
		testGetColumnOfLinePartOffset(0, 4, 3, 2);
		testGetColumnOfLinePartOffset(0, 4, 4, 2);
		testGetColumnOfLinePartOffset(1, 8, 0, 2);
		testGetColumnOfLinePartOffset(1, 8, 1, 3);
		testGetColumnOfLinePartOffset(1, 8, 2, 4);
		testGetColumnOfLinePartOffset(1, 8, 3, 5);
		testGetColumnOfLinePartOffset(1, 8, 4, 6);
		testGetColumnOfLinePartOffset(1, 8, 5, 7);
		testGetColumnOfLinePartOffset(1, 8, 6, 8);
		testGetColumnOfLinePartOffset(1, 8, 7, 9);
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
		testGetColumnOfLinePartOffset(0, 8, 0, 1);
		testGetColumnOfLinePartOffset(0, 8, 1, 1);
		testGetColumnOfLinePartOffset(0, 8, 2, 1);
		testGetColumnOfLinePartOffset(0, 8, 3, 2);
		testGetColumnOfLinePartOffset(0, 8, 4, 2);
		testGetColumnOfLinePartOffset(0, 8, 5, 2);
		testGetColumnOfLinePartOffset(0, 8, 6, 2);
		testGetColumnOfLinePartOffset(0, 8, 7, 3);
		testGetColumnOfLinePartOffset(0, 8, 8, 3);
		testGetColumnOfLinePartOffset(1, 8, 0, 3);
		testGetColumnOfLinePartOffset(1, 8, 1, 4);
		testGetColumnOfLinePartOffset(1, 8, 2, 5);
		testGetColumnOfLinePartOffset(1, 8, 3, 6);
		testGetColumnOfLinePartOffset(1, 8, 4, 7);
		testGetColumnOfLinePartOffset(1, 8, 5, 8);
		testGetColumnOfLinePartOffset(1, 8, 6, 9);
		testGetColumnOfLinePartOffset(1, 8, 7, 10);
		testGetColumnOfLinePartOffset(1, 8, 8, 11);
	});
});


