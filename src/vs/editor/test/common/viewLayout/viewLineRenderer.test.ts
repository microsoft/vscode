/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { renderLine, RenderLineInput } from 'vs/editor/common/viewLayout/viewLineRenderer';
import { ViewLineToken } from 'vs/editor/common/core/viewLineToken';
import { CharCode } from 'vs/base/common/charCode';
import { LineParts } from 'vs/editor/common/core/lineParts';

suite('viewLineRenderer.renderLine', () => {

	function createPart(startIndex: number, type: string): ViewLineToken {
		return new ViewLineToken(startIndex, type);
	}

	function assertCharacterReplacement(lineContent: string, tabSize: number, expected: string, expectedCharOffsetInPart: number[]): void {
		let _actual = renderLine(new RenderLineInput(
			lineContent,
			tabSize,
			0,
			-1,
			'none',
			false,
			new LineParts([createPart(0, '')], lineContent.length + 1)
		));

		assert.equal(_actual.output, '<span><span class="token ">' + expected + '</span></span>');
		assert.deepEqual(_actual.charOffsetInPart, expectedCharOffsetInPart);
	}

	test('replaces spaces', () => {
		assertCharacterReplacement(' ', 4, '&nbsp;', [0, 1]);
		assertCharacterReplacement('  ', 4, '&nbsp;&nbsp;', [0, 1, 2]);
		assertCharacterReplacement('a  b', 4, 'a&nbsp;&nbsp;b', [0, 1, 2, 3, 4]);
	});

	test('escapes HTML markup', () => {
		assertCharacterReplacement('a<b', 4, 'a&lt;b', [0, 1, 2, 3]);
		assertCharacterReplacement('a>b', 4, 'a&gt;b', [0, 1, 2, 3]);
		assertCharacterReplacement('a&b', 4, 'a&amp;b', [0, 1, 2, 3]);
	});

	test('replaces some bad characters', () => {
		assertCharacterReplacement('a\0b', 4, 'a&#00;b', [0, 1, 2, 3]);
		assertCharacterReplacement('a' + String.fromCharCode(CharCode.UTF8_BOM) + 'b', 4, 'a\ufffdb', [0, 1, 2, 3]);
		assertCharacterReplacement('a\u2028b', 4, 'a\ufffdb', [0, 1, 2, 3]);
		assertCharacterReplacement('a\rb', 4, 'a&#8203b', [0, 1, 2, 3]);
	});

	test('handles tabs', () => {
		assertCharacterReplacement('\t', 4, '&nbsp;&nbsp;&nbsp;&nbsp;', [0, 4]);
		assertCharacterReplacement('x\t', 4, 'x&nbsp;&nbsp;&nbsp;', [0, 1, 4]);
		assertCharacterReplacement('xx\t', 4, 'xx&nbsp;&nbsp;', [0, 1, 2, 4]);
		assertCharacterReplacement('xxx\t', 4, 'xxx&nbsp;', [0, 1, 2, 3, 4]);
		assertCharacterReplacement('xxxx\t', 4, 'xxxx&nbsp;&nbsp;&nbsp;&nbsp;', [0, 1, 2, 3, 4, 8]);
	});

	function assertParts(lineContent: string, tabSize: number, parts: ViewLineToken[], expected: string, expectedCharOffsetInPart: number[]): void {
		let _actual = renderLine(new RenderLineInput(
			lineContent,
			tabSize,
			0,
			-1,
			'none',
			false,
			new LineParts(parts, lineContent.length + 1)
		));

		assert.equal(_actual.output, '<span>' + expected + '</span>');
		assert.deepEqual(_actual.charOffsetInPart, expectedCharOffsetInPart);
	}

	test('empty line', () => {
		assertParts('', 4, [], '<span>&nbsp;</span>', []);
	});

	test('uses part type', () => {
		assertParts('x', 4, [createPart(0, 'y')], '<span class="token y">x</span>', [0, 1]);
		assertParts('x', 4, [createPart(0, 'aAbBzZ0123456789-cC')], '<span class="token aAbBzZ0123456789-cC">x</span>', [0, 1]);
		assertParts('x', 4, [createPart(0, '"~!@#$%^&*()\'')], '<span class="token              ">x</span>', [0, 1]);
	});

	test('two parts', () => {
		assertParts('xy', 4, [createPart(0, 'a'), createPart(1, 'b')], '<span class="token a">x</span><span class="token b">y</span>', [0, 0, 1]);
		assertParts('xyz', 4, [createPart(0, 'a'), createPart(1, 'b')], '<span class="token a">x</span><span class="token b">yz</span>', [0, 0, 1, 2]);
		assertParts('xyz', 4, [createPart(0, 'a'), createPart(2, 'b')], '<span class="token a">xy</span><span class="token b">z</span>', [0, 1, 0, 1]);
	});

	test('overflow', () => {
		let _actual = renderLine(new RenderLineInput(
			'Hello world!',
			4,
			10,
			6,
			'boundary',
			false,
			new LineParts(
				[
					createPart(0, '0'),
					createPart(1, '1'),
					createPart(2, '2'),
					createPart(3, '3'),
					createPart(4, '4'),
					createPart(5, '5'),
					createPart(6, '6'),
					createPart(7, '7'),
					createPart(8, '8'),
					createPart(9, '9'),
					createPart(10, '10'),
					createPart(11, '11'),
				],
				'Hello world!'.length + 1
			)
		));

		let expectedOutput = [
			'<span class="token 0">H</span>',
			'<span class="token 1">e</span>',
			'<span class="token 2">l</span>',
			'<span class="token 3">l</span>',
			'<span class="token 4">o</span>',
			'<span class="token 5">&nbsp;&hellip;</span>'
		].join('');

		assert.equal(_actual.output, '<span>' + expectedOutput + '</span>');
		assert.deepEqual(_actual.charOffsetInPart, [
			0,
			0,
			0,
			0,
			0,
			1
		]);
	});

	test('typical line', () => {
		let lineText = '\t    export class Game { // http://test.com     ';
		let lineParts = [
			createPart(0, 'block meta ts vs-whitespace'),
			createPart(5, 'block declaration meta modifier object storage ts'),
			createPart(11, 'block declaration meta object ts'),
			createPart(12, 'block declaration meta object storage type ts'),
			createPart(17, 'block declaration meta object ts'),
			createPart(18, 'block class declaration entity meta name object ts'),
			createPart(22, 'block declaration meta object ts'),
			createPart(23, 'delimiter curly typescript'),
			createPart(24, 'block body declaration meta object ts'),
			createPart(25, 'block body comment declaration line meta object ts'),
			createPart(28, 'block body comment declaration line meta object ts detected-link'),
			createPart(43, 'block body comment declaration line meta object ts vs-whitespace'),
		];
		let expectedOutput = [
			'<span class="token block meta ts vs-whitespace" style="width:80px">&rarr;&nbsp;&nbsp;&nbsp;&middot;&middot;&middot;&middot;</span>',
			'<span class="token block declaration meta modifier object storage ts">export</span>',
			'<span class="token block declaration meta object ts">&nbsp;</span>',
			'<span class="token block declaration meta object storage type ts">class</span>',
			'<span class="token block declaration meta object ts">&nbsp;</span>',
			'<span class="token block class declaration entity meta name object ts">Game</span>',
			'<span class="token block declaration meta object ts">&nbsp;</span>',
			'<span class="token delimiter curly typescript">{</span>',
			'<span class="token block body declaration meta object ts">&nbsp;</span>',
			'<span class="token block body comment declaration line meta object ts">//&nbsp;</span>',
			'<span class="token block body comment declaration line meta object ts detected-link">http://test.com</span>',
			'<span class="token block body comment declaration line meta object ts vs-whitespace" style="width:50px">&middot;&middot;&middot;&middot;&middot;</span>'
		].join('');
		let expectedOffsetsArr = [
			[0, 4, 5, 6, 7],
			[0, 1, 2, 3, 4, 5],
			[0],
			[0, 1, 2, 3, 4],
			[0],
			[0, 1, 2, 3],
			[0],
			[0],
			[0],
			[0, 1, 2],
			[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
			[0, 1, 2, 3, 4, 5],
		];
		let expectedOffsets = expectedOffsetsArr.reduce((prev, curr) => prev.concat(curr), []);

		let _actual = renderLine(new RenderLineInput(
			lineText,
			4,
			10,
			-1,
			'boundary',
			false,
			new LineParts(lineParts, lineText.length + 1)
		));

		assert.equal(_actual.output, '<span>' + expectedOutput + '</span>');
		assert.deepEqual(_actual.charOffsetInPart, expectedOffsets);
	});

	test('issue #2255: Weird line rendering part 1', () => {
		let lineText = '\t\t\tcursorStyle:\t\t\t\t\t\t(prevOpts.cursorStyle !== newOpts.cursorStyle),';

		let lineParts = [
			createPart(0, 'block body decl declaration meta method object ts'), // 3 chars
			createPart(3, 'block body decl declaration member meta method object ts'), // 12 chars
			createPart(15, 'block body decl declaration member meta method object ts'), // 6 chars
			createPart(21, 'delimiter paren typescript'), // 1 char
			createPart(22, 'block body decl declaration member meta method object ts'), // 21 chars
			createPart(43, 'block body comparison decl declaration keyword member meta method object operator ts'), // 2 chars
			createPart(45, 'block body comparison decl declaration keyword member meta method object operator ts'), // 1 char
			createPart(46, 'block body decl declaration member meta method object ts'), // 20 chars
			createPart(66, 'delimiter paren typescript'), // 1 char
			createPart(67, 'block body decl declaration meta method object ts'), // 2 chars
		];
		let expectedOutput = [
			'<span class="token block body decl declaration meta method object ts">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>',
			'<span class="token block body decl declaration member meta method object ts">cursorStyle:</span>',
			'<span class="token block body decl declaration member meta method object ts">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>',
			'<span class="token delimiter paren typescript">(</span>',
			'<span class="token block body decl declaration member meta method object ts">prevOpts.cursorStyle&nbsp;</span>',
			'<span class="token block body comparison decl declaration keyword member meta method object operator ts">!=</span>',
			'<span class="token block body comparison decl declaration keyword member meta method object operator ts">=</span>',
			'<span class="token block body decl declaration member meta method object ts">&nbsp;newOpts.cursorStyle</span>',
			'<span class="token delimiter paren typescript">)</span>',
			'<span class="token block body decl declaration meta method object ts">,</span>',
		].join('');
		let expectedOffsetsArr = [
			[0, 4, 8], // 3 chars
			[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], // 12 chars
			[0, 4, 8, 12, 16, 20], // 6 chars
			[0], // 1 char
			[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], // 21 chars
			[0, 1], // 2 chars
			[0], // 1 char
			[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19], // 20 chars
			[0], // 1 char
			[0, 1] // 2 chars
		];
		let expectedOffsets = expectedOffsetsArr.reduce((prev, curr) => prev.concat(curr), []);

		let _actual = renderLine(new RenderLineInput(
			lineText,
			4,
			10,
			-1,
			'none',
			false,
			new LineParts(lineParts, lineText.length + 1)
		));

		assert.equal(_actual.output, '<span>' + expectedOutput + '</span>');
		assert.deepEqual(_actual.charOffsetInPart, expectedOffsets);
	});

	test('issue #2255: Weird line rendering part 2', () => {
		let lineText = ' \t\t\tcursorStyle:\t\t\t\t\t\t(prevOpts.cursorStyle !== newOpts.cursorStyle),';

		let lineParts = [
			createPart(0, 'block body decl declaration meta method object ts'), // 4 chars
			createPart(4, 'block body decl declaration member meta method object ts'), // 12 chars
			createPart(16, 'block body decl declaration member meta method object ts'), // 6 chars
			createPart(22, 'delimiter paren typescript'), // 1 char
			createPart(23, 'block body decl declaration member meta method object ts'), // 21 chars
			createPart(44, 'block body comparison decl declaration keyword member meta method object operator ts'), // 2 chars
			createPart(46, 'block body comparison decl declaration keyword member meta method object operator ts'), // 1 char
			createPart(47, 'block body decl declaration member meta method object ts'), // 20 chars
			createPart(67, 'delimiter paren typescript'), // 1 char
			createPart(68, 'block body decl declaration meta method object ts'), // 2 chars
		];
		let expectedOutput = [
			'<span class="token block body decl declaration meta method object ts">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>',
			'<span class="token block body decl declaration member meta method object ts">cursorStyle:</span>',
			'<span class="token block body decl declaration member meta method object ts">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>',
			'<span class="token delimiter paren typescript">(</span>',
			'<span class="token block body decl declaration member meta method object ts">prevOpts.cursorStyle&nbsp;</span>',
			'<span class="token block body comparison decl declaration keyword member meta method object operator ts">!=</span>',
			'<span class="token block body comparison decl declaration keyword member meta method object operator ts">=</span>',
			'<span class="token block body decl declaration member meta method object ts">&nbsp;newOpts.cursorStyle</span>',
			'<span class="token delimiter paren typescript">)</span>',
			'<span class="token block body decl declaration meta method object ts">,</span>',
		].join('');
		let expectedOffsetsArr = [
			[0, 1, 4, 8], // 4 chars
			[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], // 12 chars
			[0, 4, 8, 12, 16, 20], // 6 chars
			[0], // 1 char
			[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], // 21 chars
			[0, 1], // 2 chars
			[0], // 1 char
			[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19], // 20 chars
			[0], // 1 char
			[0, 1] // 2 chars
		];
		let expectedOffsets = expectedOffsetsArr.reduce((prev, curr) => prev.concat(curr), []);

		let _actual = renderLine(new RenderLineInput(
			lineText,
			4,
			10,
			-1,
			'none',
			false,
			new LineParts(lineParts, lineText.length + 1)
		));

		assert.equal(_actual.output, '<span>' + expectedOutput + '</span>');
		assert.deepEqual(_actual.charOffsetInPart, expectedOffsets);
	});


});
