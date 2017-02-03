/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { DecorationSegment, LineDecorationsNormalizer, Decoration } from 'vs/editor/common/viewLayout/viewLineParts';
import { Range } from 'vs/editor/common/core/range';
import { RenderLineInput, renderViewLine } from 'vs/editor/common/viewLayout/viewLineRenderer';
import { ViewLineToken } from 'vs/editor/common/core/viewLineToken';
import { InlineDecoration } from 'vs/editor/common/viewModel/viewModel';

suite('Editor ViewLayout - ViewLineParts', () => {

	function newDecoration(startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number, inlineClassName: string): InlineDecoration {
		return new InlineDecoration(new Range(startLineNumber, startColumn, endLineNumber, endColumn), inlineClassName, false);
	}

	test('Bug 9827:Overlapping inline decorations can cause wrong inline class to be applied', () => {

		var result = LineDecorationsNormalizer.normalize([
			new Decoration(1, 11, 'c1', false),
			new Decoration(3, 4, 'c2', false)
		]);

		assert.deepEqual(result, [
			new DecorationSegment(0, 1, 'c1'),
			new DecorationSegment(2, 2, 'c2 c1'),
			new DecorationSegment(3, 9, 'c1'),
		]);
	});

	test('issue #3462: no whitespace shown at the end of a decorated line', () => {

		var result = LineDecorationsNormalizer.normalize([
			new Decoration(15, 21, 'vs-whitespace', false),
			new Decoration(20, 21, 'inline-folded', false),
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
			new Decoration(12, 30, 'detected-link', false),
		]);
	});

	function testCreateLineParts(fontIsMonospace: boolean, lineContent: string, tokens: ViewLineToken[], fauxIndentLength: number, renderWhitespace: 'none' | 'boundary' | 'all', expected: string): void {
		let actual = renderViewLine(new RenderLineInput(
			fontIsMonospace,
			lineContent,
			false,
			fauxIndentLength,
			tokens,
			[],
			4,
			10,
			-1,
			renderWhitespace,
			false
		));

		assert.deepEqual(actual.html.split(/></g), expected.split(/></g));
	}

	test('issue #18616: Inline decorations ending at the text length are no longer rendered', () => {

		let lineContent = 'https://microsoft.com';

		let actual = renderViewLine(new RenderLineInput(
			false,
			lineContent,
			false,
			0,
			[new ViewLineToken(21, 'mtk3')],
			[new Decoration(1, 22, 'link', false)],
			4,
			10,
			-1,
			'none',
			false
		));

		let expected = [
			'<span>',
			'<span class="mtk3 link">https://microsoft.com</span>',
			'</span>'
		].join('');

		assert.deepEqual(actual.html, expected);
	});

	test('issue #19207: Link in Monokai is not rendered correctly', () => {

		let lineContent = '\'let url = `http://***/_api/web/lists/GetByTitle(\\\'Teambuildingaanvragen\\\')/items`;\'';

		let actual = renderViewLine(new RenderLineInput(
			true,
			lineContent,
			false,
			0,
			[
				new ViewLineToken(49, 'mtk6'),
				new ViewLineToken(51, 'mtk4'),
				new ViewLineToken(72, 'mtk6'),
				new ViewLineToken(74, 'mtk4'),
				new ViewLineToken(84, 'mtk6'),
			],
			[
				new Decoration(13, 51, 'detected-link', false)
			],
			4,
			10,
			-1,
			'none',
			false
		));

		let expected = [
			'<span>',
			'<span class="mtk6">\'let&nbsp;url&nbsp;=&nbsp;`</span>',
			'<span class="mtk6 detected-link">http://***/_api/web/lists/GetByTitle(</span>',
			'<span class="mtk4 detected-link">\\</span>',
			'<span class="mtk4">\'</span>',
			'<span class="mtk6">Teambuildingaanvragen</span>',
			'<span class="mtk4">\\\'</span>',
			'<span class="mtk6">)/items`;\'</span>',
			'</span>'
		].join('');

		assert.deepEqual(actual.html, expected);
	});

	test('createLineParts simple', () => {
		testCreateLineParts(
			false,
			'Hello world!',
			[
				new ViewLineToken(12, '')
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
			false,
			'Hello world!',
			[
				new ViewLineToken(6, 'a'),
				new ViewLineToken(12, 'b')
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
			false,
			'    Hello world!    ',
			[
				new ViewLineToken(4, ''),
				new ViewLineToken(6, 'a'),
				new ViewLineToken(20, 'b')
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
			false,
			'        Hello world!        ',
			[
				new ViewLineToken(8, ''),
				new ViewLineToken(10, 'a'),
				new ViewLineToken(28, 'b')
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
			false,
			'\t\tHello world!\t',
			[
				new ViewLineToken(2, ''),
				new ViewLineToken(4, 'a'),
				new ViewLineToken(15, 'b')
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
			false,
			'  \t\t  Hello world! \t  \t   \t    ',
			[
				new ViewLineToken(6, ''),
				new ViewLineToken(8, 'a'),
				new ViewLineToken(31, 'b')
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
			false,
			'\t\t  Hello world! \t  \t   \t    ',
			[
				new ViewLineToken(4, ''),
				new ViewLineToken(6, 'a'),
				new ViewLineToken(29, 'b')
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

	test('createLineParts does not emit width for monospace fonts', () => {
		testCreateLineParts(
			true,
			'\t\t  Hello world! \t  \t   \t    ',
			[
				new ViewLineToken(4, ''),
				new ViewLineToken(6, 'a'),
				new ViewLineToken(29, 'b')
			],
			2,
			'boundary',
			[
				'<span>',
				'<span class="">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>',
				'<span class="vs-whitespace">&middot;&middot;</span>',
				'<span class="a">He</span>',
				'<span class="b">llo&nbsp;world!</span>',
				'<span class="vs-whitespace">&middot;&rarr;&middot;&middot;&rarr;&nbsp;&middot;&middot;&middot;&rarr;&middot;&middot;&middot;&middot;</span>',
				'</span>',
			].join('')
		);
	});

	test('createLineParts render whitespace in middle but not for one space', () => {
		testCreateLineParts(
			false,
			'it  it it  it',
			[
				new ViewLineToken(6, ''),
				new ViewLineToken(7, 'a'),
				new ViewLineToken(13, 'b')
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
			false,
			' Hello world!\t',
			[
				new ViewLineToken(4, ''),
				new ViewLineToken(6, 'a'),
				new ViewLineToken(14, 'b')
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
			false,
			'Hello world',
			false,
			0,
			[new ViewLineToken(11, '')],
			[
				new Decoration(5, 7, 'a', false),
				new Decoration(1, 3, 'b', false),
				new Decoration(2, 8, 'c', false),
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

		assert.deepEqual(actual.html, [
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
			new Decoration(1, 2, 'c1', false),
			new Decoration(3, 4, 'c2', false)
		]), [
				new DecorationSegment(0, 0, 'c1'),
				new DecorationSegment(2, 2, 'c2')
			]);

		assert.deepEqual(LineDecorationsNormalizer.normalize([
			new Decoration(1, 3, 'c1', false),
			new Decoration(3, 4, 'c2', false)
		]), [
				new DecorationSegment(0, 1, 'c1'),
				new DecorationSegment(2, 2, 'c2')
			]);

		assert.deepEqual(LineDecorationsNormalizer.normalize([
			new Decoration(1, 4, 'c1', false),
			new Decoration(3, 4, 'c2', false)
		]), [
				new DecorationSegment(0, 1, 'c1'),
				new DecorationSegment(2, 2, 'c1 c2')
			]);

		assert.deepEqual(LineDecorationsNormalizer.normalize([
			new Decoration(1, 4, 'c1', false),
			new Decoration(1, 4, 'c1*', false),
			new Decoration(3, 4, 'c2', false)
		]), [
				new DecorationSegment(0, 1, 'c1 c1*'),
				new DecorationSegment(2, 2, 'c1 c1* c2')
			]);

		assert.deepEqual(LineDecorationsNormalizer.normalize([
			new Decoration(1, 4, 'c1', false),
			new Decoration(1, 4, 'c1*', false),
			new Decoration(1, 4, 'c1**', false),
			new Decoration(3, 4, 'c2', false)
		]), [
				new DecorationSegment(0, 1, 'c1 c1* c1**'),
				new DecorationSegment(2, 2, 'c1 c1* c1** c2')
			]);

		assert.deepEqual(LineDecorationsNormalizer.normalize([
			new Decoration(1, 4, 'c1', false),
			new Decoration(1, 4, 'c1*', false),
			new Decoration(1, 4, 'c1**', false),
			new Decoration(3, 4, 'c2', false),
			new Decoration(3, 4, 'c2*', false)
		]), [
				new DecorationSegment(0, 1, 'c1 c1* c1**'),
				new DecorationSegment(2, 2, 'c1 c1* c1** c2 c2*')
			]);

		assert.deepEqual(LineDecorationsNormalizer.normalize([
			new Decoration(1, 4, 'c1', false),
			new Decoration(1, 4, 'c1*', false),
			new Decoration(1, 4, 'c1**', false),
			new Decoration(3, 4, 'c2', false),
			new Decoration(3, 5, 'c2*', false)
		]), [
				new DecorationSegment(0, 1, 'c1 c1* c1**'),
				new DecorationSegment(2, 2, 'c1 c1* c1** c2 c2*'),
				new DecorationSegment(3, 3, 'c2*')
			]);
	});

	function createTestGetColumnOfLinePartOffset(lineContent: string, tabSize: number, parts: ViewLineToken[], expectedPartLengths: number[]): (partIndex: number, partLength: number, offset: number, expected: number) => void {
		let renderLineOutput = renderViewLine(new RenderLineInput(
			false,
			lineContent,
			false,
			0,
			parts,
			[],
			tabSize,
			10,
			-1,
			'none',
			false
		));

		const partLengths = renderLineOutput.characterMapping.getPartLengths();
		let actualPartLengths: number[] = [];
		for (let i = 0; i < partLengths.length; i++) {
			actualPartLengths[i] = partLengths[i];
		}
		assert.deepEqual(actualPartLengths, expectedPartLengths, 'part lengths OK');

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
				new ViewLineToken(11, 'aToken')
			],
			[11]
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
				new ViewLineToken(3, 'meta type js storage var expr'),
				new ViewLineToken(4, 'meta js var expr'),
				new ViewLineToken(5, 'meta js var expr var-single-variable variable'),
				new ViewLineToken(8, 'meta js var expr var-single-variable'),
				new ViewLineToken(9, 'meta js var expr var-single-variable constant numeric'),
				new ViewLineToken(10, ''),
			],
			[3, 1, 1, 3, 1, 1]
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
				new ViewLineToken(1, 'vs-whitespace')
			],
			[6]
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
				new ViewLineToken(1, ''),
				new ViewLineToken(9, 'meta type js function storage'),
			],
			[4, 8]
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
				new ViewLineToken(2, ''),
				new ViewLineToken(10, 'meta type js function storage'),
			],
			[8, 8]
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


