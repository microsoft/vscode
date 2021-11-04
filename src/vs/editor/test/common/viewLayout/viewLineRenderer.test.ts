/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { CharCode } from 'vs/base/common/charCode';
import * as strings from 'vs/base/common/strings';
import { IViewLineTokens } from 'vs/editor/common/core/lineTokens';
import { MetadataConsts } from 'vs/editor/common/modes';
import { LineDecoration } from 'vs/editor/common/viewLayout/lineDecorations';
import { CharacterMapping, RenderLineInput, renderViewLine2 as renderViewLine, LineRange, DomPosition } from 'vs/editor/common/viewLayout/viewLineRenderer';
import { InlineDecorationType } from 'vs/editor/common/viewModel/viewModel';
import { ViewLineToken, ViewLineTokens } from 'vs/editor/test/common/core/viewLineToken';

function createViewLineTokens(viewLineTokens: ViewLineToken[]): IViewLineTokens {
	return new ViewLineTokens(viewLineTokens);
}

function createPart(endIndex: number, foreground: number): ViewLineToken {
	return new ViewLineToken(endIndex, (
		foreground << MetadataConsts.FOREGROUND_OFFSET
	) >>> 0);
}

suite('viewLineRenderer.renderLine', () => {

	function assertCharacterReplacement(lineContent: string, tabSize: number, expected: string, expectedCharOffsetInPart: number[]): void {
		const _actual = renderViewLine(new RenderLineInput(
			false,
			true,
			lineContent,
			false,
			strings.isBasicASCII(lineContent),
			false,
			0,
			createViewLineTokens([new ViewLineToken(lineContent.length, 0)]),
			[],
			tabSize,
			0,
			0,
			0,
			0,
			-1,
			'none',
			false,
			false,
			null
		));

		assert.strictEqual(_actual.html, '<span><span class="mtk0">' + expected + '</span></span>');
		const info = expectedCharOffsetInPart.map<CharacterMappingInfo>((absoluteOffset) => [absoluteOffset, [0, absoluteOffset]]);
		assertCharacterMapping3(_actual.characterMapping, info);
	}

	test('replaces spaces', () => {
		assertCharacterReplacement(' ', 4, '\u00a0', [0, 1]);
		assertCharacterReplacement('  ', 4, '\u00a0\u00a0', [0, 1, 2]);
		assertCharacterReplacement('a  b', 4, 'a\u00a0\u00a0b', [0, 1, 2, 3, 4]);
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
	});

	test('handles tabs', () => {
		assertCharacterReplacement('\t', 4, '\u00a0\u00a0\u00a0\u00a0', [0, 4]);
		assertCharacterReplacement('x\t', 4, 'x\u00a0\u00a0\u00a0', [0, 1, 4]);
		assertCharacterReplacement('xx\t', 4, 'xx\u00a0\u00a0', [0, 1, 2, 4]);
		assertCharacterReplacement('xxx\t', 4, 'xxx\u00a0', [0, 1, 2, 3, 4]);
		assertCharacterReplacement('xxxx\t', 4, 'xxxx\u00a0\u00a0\u00a0\u00a0', [0, 1, 2, 3, 4, 8]);
	});

	function assertParts(lineContent: string, tabSize: number, parts: ViewLineToken[], expected: string, info: CharacterMappingInfo[]): void {
		let _actual = renderViewLine(new RenderLineInput(
			false,
			true,
			lineContent,
			false,
			true,
			false,
			0,
			createViewLineTokens(parts),
			[],
			tabSize,
			0,
			0,
			0,
			0,
			-1,
			'none',
			false,
			false,
			null
		));

		assert.strictEqual(_actual.html, '<span>' + expected + '</span>');
		assertCharacterMapping3(_actual.characterMapping, info);
	}

	test('empty line', () => {
		assertParts('', 4, [], '<span></span>', []);
	});

	test('uses part type', () => {
		assertParts('x', 4, [createPart(1, 10)], '<span class="mtk10">x</span>', [[0, [0, 0]], [1, [0, 1]]]);
		assertParts('x', 4, [createPart(1, 20)], '<span class="mtk20">x</span>', [[0, [0, 0]], [1, [0, 1]]]);
		assertParts('x', 4, [createPart(1, 30)], '<span class="mtk30">x</span>', [[0, [0, 0]], [1, [0, 1]]]);
	});

	test('two parts', () => {
		assertParts('xy', 4, [createPart(1, 1), createPart(2, 2)], '<span class="mtk1">x</span><span class="mtk2">y</span>', [[0, [0, 0]], [1, [1, 0]], [2, [1, 1]]]);
		assertParts('xyz', 4, [createPart(1, 1), createPart(3, 2)], '<span class="mtk1">x</span><span class="mtk2">yz</span>', [[0, [0, 0]], [1, [1, 0]], [2, [1, 1]], [3, [1, 2]]]);
		assertParts('xyz', 4, [createPart(2, 1), createPart(3, 2)], '<span class="mtk1">xy</span><span class="mtk2">z</span>', [[0, [0, 0]], [1, [0, 1]], [2, [1, 0]], [3, [1, 1]]]);
	});

	test('overflow', () => {
		let _actual = renderViewLine(new RenderLineInput(
			false,
			true,
			'Hello world!',
			false,
			true,
			false,
			0,
			createViewLineTokens([
				createPart(1, 0),
				createPart(2, 1),
				createPart(3, 2),
				createPart(4, 3),
				createPart(5, 4),
				createPart(6, 5),
				createPart(7, 6),
				createPart(8, 7),
				createPart(9, 8),
				createPart(10, 9),
				createPart(11, 10),
				createPart(12, 11),
			]),
			[],
			4,
			0,
			10,
			10,
			10,
			6,
			'boundary',
			false,
			false,
			null
		));

		let expectedOutput = [
			'<span class="mtk0">H</span>',
			'<span class="mtk1">e</span>',
			'<span class="mtk2">l</span>',
			'<span class="mtk3">l</span>',
			'<span class="mtk4">o</span>',
			'<span class="mtk5">\u00a0</span>',
			'<span>&hellip;</span>'
		].join('');

		assert.strictEqual(_actual.html, '<span>' + expectedOutput + '</span>');
		assertCharacterMapping3(
			_actual.characterMapping,
			[
				[0, [0, 0]],
				[1, [1, 0]],
				[2, [2, 0]],
				[3, [3, 0]],
				[4, [4, 0]],
				[5, [5, 0]],
				[6, [5, 1]],
			]
		);
	});

	test('typical line', () => {
		let lineText = '\t    export class Game { // http://test.com     ';
		let lineParts = createViewLineTokens([
			createPart(5, 1),
			createPart(11, 2),
			createPart(12, 3),
			createPart(17, 4),
			createPart(18, 5),
			createPart(22, 6),
			createPart(23, 7),
			createPart(24, 8),
			createPart(25, 9),
			createPart(28, 10),
			createPart(43, 11),
			createPart(48, 12),
		]);
		let expectedOutput = [
			'<span class="mtkz" style="width:40px">\u2192\u00a0\u00a0\u00a0</span>',
			'<span class="mtkz" style="width:40px">\u00b7\u00b7\u00b7\u00b7</span>',
			'<span class="mtk2">export</span>',
			'<span class="mtk3">\u00a0</span>',
			'<span class="mtk4">class</span>',
			'<span class="mtk5">\u00a0</span>',
			'<span class="mtk6">Game</span>',
			'<span class="mtk7">\u00a0</span>',
			'<span class="mtk8">{</span>',
			'<span class="mtk9">\u00a0</span>',
			'<span class="mtk10">//\u00a0</span>',
			'<span class="mtk11">http://test.com</span>',
			'<span class="mtkz" style="width:20px">\u00b7\u00b7</span>',
			'<span class="mtkz" style="width:30px">\u00b7\u00b7\u00b7</span>'
		].join('');

		const info: CharacterMappingInfo[] = [
			[0, [0, 0]],
			[4, [1, 0]], [5, [1, 1]], [6, [1, 2]], [7, [1, 3]],
			[8, [2, 0]], [9, [2, 1]], [10, [2, 2]], [11, [2, 3]], [12, [2, 4]], [13, [2, 5]],
			[14, [3, 0]],
			[15, [4, 0]], [16, [4, 1]], [17, [4, 2]], [18, [4, 3]], [19, [4, 4]],
			[20, [5, 0]],
			[21, [6, 0]], [22, [6, 1]], [23, [6, 2]], [24, [6, 3]],
			[25, [7, 0]],
			[26, [8, 0]],
			[27, [9, 0]],
			[28, [10, 0]], [29, [10, 1]], [30, [10, 2]],
			[31, [11, 0]], [32, [11, 1]], [33, [11, 2]], [34, [11, 3]], [35, [11, 4]], [36, [11, 5]], [37, [11, 6]], [38, [11, 7]], [39, [11, 8]], [40, [11, 9]], [41, [11, 10]], [42, [11, 11]], [43, [11, 12]], [44, [11, 13]], [45, [11, 14]],
			[46, [12, 0]], [47, [12, 1]],
			[48, [13, 0]], [49, [13, 1]], [50, [13, 2]], [51, [13, 3]],
		];

		const _actual = renderViewLine(new RenderLineInput(
			false,
			true,
			lineText,
			false,
			true,
			false,
			0,
			lineParts,
			[],
			4,
			0,
			10,
			10,
			10,
			-1,
			'boundary',
			false,
			false,
			null
		));

		assert.strictEqual(_actual.html, '<span>' + expectedOutput + '</span>');
		assertCharacterMapping3(_actual.characterMapping, info);
	});

	test('issue #2255: Weird line rendering part 1', () => {
		let lineText = '\t\t\tcursorStyle:\t\t\t\t\t\t(prevOpts.cursorStyle !== newOpts.cursorStyle),';

		let lineParts = createViewLineTokens([
			createPart(3, 1), // 3 chars
			createPart(15, 2), // 12 chars
			createPart(21, 3), // 6 chars
			createPart(22, 4), // 1 char
			createPart(43, 5), // 21 chars
			createPart(45, 6), // 2 chars
			createPart(46, 7), // 1 char
			createPart(66, 8), // 20 chars
			createPart(67, 9), // 1 char
			createPart(68, 10), // 2 chars
		]);
		let expectedOutput = [
			'<span class="mtk1">\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0</span>',
			'<span class="mtk2">cursorStyle:</span>',
			'<span class="mtk3">\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0</span>',
			'<span class="mtk4">(</span>',
			'<span class="mtk5">prevOpts.cursorStyle\u00a0</span>',
			'<span class="mtk6">!=</span>',
			'<span class="mtk7">=</span>',
			'<span class="mtk8">\u00a0newOpts.cursorStyle</span>',
			'<span class="mtk9">)</span>',
			'<span class="mtk10">,</span>',
		].join('');

		const info: CharacterMappingInfo[] = [
			[0, [0, 0]], [4, [0, 4]], [8, [0, 8]],
			[12, [1, 0]], [13, [1, 1]], [14, [1, 2]], [15, [1, 3]], [16, [1, 4]], [17, [1, 5]], [18, [1, 6]], [19, [1, 7]], [20, [1, 8]], [21, [1, 9]], [22, [1, 10]], [23, [1, 11]],
			[24, [2, 0]], [28, [2, 4]], [32, [2, 8]], [36, [2, 12]], [40, [2, 16]], [44, [2, 20]],
			[48, [3, 0]],
			[49, [4, 0]], [50, [4, 1]], [51, [4, 2]], [52, [4, 3]], [53, [4, 4]], [54, [4, 5]], [55, [4, 6]], [56, [4, 7]], [57, [4, 8]], [58, [4, 9]], [59, [4, 10]], [60, [4, 11]], [61, [4, 12]], [62, [4, 13]], [63, [4, 14]], [64, [4, 15]], [65, [4, 16]], [66, [4, 17]], [67, [4, 18]], [68, [4, 19]], [69, [4, 20]],
			[70, [5, 0]], [71, [5, 1]],
			[72, [6, 0]],
			[73, [7, 0]], [74, [7, 1]], [75, [7, 2]], [76, [7, 3]], [77, [7, 4]], [78, [7, 5]], [79, [7, 6]], [80, [7, 7]], [81, [7, 8]], [82, [7, 9]], [83, [7, 10]], [84, [7, 11]], [85, [7, 12]], [86, [7, 13]], [87, [7, 14]], [88, [7, 15]], [89, [7, 16]], [90, [7, 17]], [91, [7, 18]], [92, [7, 19]],
			[93, [8, 0]],
			[94, [9, 0]], [95, [9, 1]],
		];

		const _actual = renderViewLine(new RenderLineInput(
			false,
			true,
			lineText,
			false,
			true,
			false,
			0,
			lineParts,
			[],
			4,
			0,
			10,
			10,
			10,
			-1,
			'none',
			false,
			false,
			null
		));

		assert.strictEqual(_actual.html, '<span>' + expectedOutput + '</span>');
		assertCharacterMapping3(_actual.characterMapping, info);
	});

	test('issue #2255: Weird line rendering part 2', () => {
		let lineText = ' \t\t\tcursorStyle:\t\t\t\t\t\t(prevOpts.cursorStyle !== newOpts.cursorStyle),';

		let lineParts = createViewLineTokens([
			createPart(4, 1), // 4 chars
			createPart(16, 2), // 12 chars
			createPart(22, 3), // 6 chars
			createPart(23, 4), // 1 char
			createPart(44, 5), // 21 chars
			createPart(46, 6), // 2 chars
			createPart(47, 7), // 1 char
			createPart(67, 8), // 20 chars
			createPart(68, 9), // 1 char
			createPart(69, 10), // 2 chars
		]);
		let expectedOutput = [
			'<span class="mtk1">\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0</span>',
			'<span class="mtk2">cursorStyle:</span>',
			'<span class="mtk3">\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0</span>',
			'<span class="mtk4">(</span>',
			'<span class="mtk5">prevOpts.cursorStyle\u00a0</span>',
			'<span class="mtk6">!=</span>',
			'<span class="mtk7">=</span>',
			'<span class="mtk8">\u00a0newOpts.cursorStyle</span>',
			'<span class="mtk9">)</span>',
			'<span class="mtk10">,</span>',
		].join('');

		const info: CharacterMappingInfo[] = [
			[0, [0, 0]], [1, [0, 1]], [4, [0, 4]], [8, [0, 8]],
			[12, [1, 0]], [13, [1, 1]], [14, [1, 2]], [15, [1, 3]], [16, [1, 4]], [17, [1, 5]], [18, [1, 6]], [19, [1, 7]], [20, [1, 8]], [21, [1, 9]], [22, [1, 10]], [23, [1, 11]],
			[24, [2, 0]], [28, [2, 4]], [32, [2, 8]], [36, [2, 12]], [40, [2, 16]], [44, [2, 20]],
			[48, [3, 0]],
			[49, [4, 0]], [50, [4, 1]], [51, [4, 2]], [52, [4, 3]], [53, [4, 4]], [54, [4, 5]], [55, [4, 6]], [56, [4, 7]], [57, [4, 8]], [58, [4, 9]], [59, [4, 10]], [60, [4, 11]], [61, [4, 12]], [62, [4, 13]], [63, [4, 14]], [64, [4, 15]], [65, [4, 16]], [66, [4, 17]], [67, [4, 18]], [68, [4, 19]], [69, [4, 20]],
			[70, [5, 0]], [71, [5, 1]],
			[72, [6, 0]],
			[73, [7, 0]], [74, [7, 1]], [75, [7, 2]], [76, [7, 3]], [77, [7, 4]], [78, [7, 5]], [79, [7, 6]], [80, [7, 7]], [81, [7, 8]], [82, [7, 9]], [83, [7, 10]], [84, [7, 11]], [85, [7, 12]], [86, [7, 13]], [87, [7, 14]], [88, [7, 15]], [89, [7, 16]], [90, [7, 17]], [91, [7, 18]], [92, [7, 19]],
			[93, [8, 0]],
			[94, [9, 0]], [95, [9, 1]],
		];

		const _actual = renderViewLine(new RenderLineInput(
			false,
			true,
			lineText,
			false,
			true,
			false,
			0,
			lineParts,
			[],
			4,
			0,
			10,
			10,
			10,
			-1,
			'none',
			false,
			false,
			null
		));

		assert.strictEqual(_actual.html, '<span>' + expectedOutput + '</span>');
		assertCharacterMapping3(_actual.characterMapping, info);
	});

	test('issue #91178: after decoration type shown before cursor', () => {
		const lineText = '//just a comment';
		const lineParts = createViewLineTokens([
			createPart(16, 1)
		]);
		const expectedOutput = [
			'<span class="mtk1">//just\u00a0a\u00a0com</span>',
			'<span class="mtk1 dec2"></span>',
			'<span class="mtk1 dec1"></span>',
			'<span class="mtk1">ment</span>',
		].join('');

		const expectedCharacterMapping = new CharacterMapping(17, 4);
		expectedCharacterMapping.setColumnInfo(1, 0, 0, 0);
		expectedCharacterMapping.setColumnInfo(2, 0, 1, 0);
		expectedCharacterMapping.setColumnInfo(3, 0, 2, 0);
		expectedCharacterMapping.setColumnInfo(4, 0, 3, 0);
		expectedCharacterMapping.setColumnInfo(5, 0, 4, 0);
		expectedCharacterMapping.setColumnInfo(6, 0, 5, 0);
		expectedCharacterMapping.setColumnInfo(7, 0, 6, 0);
		expectedCharacterMapping.setColumnInfo(8, 0, 7, 0);
		expectedCharacterMapping.setColumnInfo(9, 0, 8, 0);
		expectedCharacterMapping.setColumnInfo(10, 0, 9, 0);
		expectedCharacterMapping.setColumnInfo(11, 0, 10, 0);
		expectedCharacterMapping.setColumnInfo(12, 0, 11, 0);
		expectedCharacterMapping.setColumnInfo(13, 2, 0, 12);
		expectedCharacterMapping.setColumnInfo(14, 3, 1, 12);
		expectedCharacterMapping.setColumnInfo(15, 3, 2, 12);
		expectedCharacterMapping.setColumnInfo(16, 3, 3, 12);
		expectedCharacterMapping.setColumnInfo(17, 3, 4, 12);

		const actual = renderViewLine(new RenderLineInput(
			true,
			false,
			lineText,
			false,
			true,
			false,
			0,
			lineParts,
			[
				new LineDecoration(13, 13, 'dec1', InlineDecorationType.After),
				new LineDecoration(13, 13, 'dec2', InlineDecorationType.Before),
			],
			4,
			0,
			10,
			10,
			10,
			-1,
			'none',
			false,
			false,
			null
		));

		assert.strictEqual(actual.html, '<span>' + expectedOutput + '</span>');
		assertCharacterMapping2(actual.characterMapping, expectedCharacterMapping);
	});

	test('issue microsoft/monaco-editor#280: Improved source code rendering for RTL languages', () => {
		let lineText = 'var קודמות = \"מיותר קודמות צ\'ט של, אם לשון העברית שינויים ויש, אם\";';

		let lineParts = createViewLineTokens([
			createPart(3, 6),
			createPart(13, 1),
			createPart(66, 20),
			createPart(67, 1),
		]);

		let expectedOutput = [
			'<span class="mtk6">var</span>',
			'<span class="mtk1">\u00a0קודמות\u00a0=\u00a0</span>',
			'<span class="mtk20">"מיותר\u00a0קודמות\u00a0צ\'ט\u00a0של,\u00a0אם\u00a0לשון\u00a0העברית\u00a0שינויים\u00a0ויש,\u00a0אם"</span>',
			'<span class="mtk1">;</span>'
		].join('');

		let _actual = renderViewLine(new RenderLineInput(
			false,
			true,
			lineText,
			false,
			false,
			true,
			0,
			lineParts,
			[],
			4,
			0,
			10,
			10,
			10,
			-1,
			'none',
			false,
			false,
			null
		));

		assert.strictEqual(_actual.html, '<span dir="ltr">' + expectedOutput + '</span>');
		assert.strictEqual(_actual.containsRTL, true);
	});

	test('issue #6885: Splits large tokens', () => {
		//                                                                                                                  1         1         1
		//                        1         2         3         4         5         6         7         8         9         0         1         2
		//               1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234
		let _lineText = 'This is just a long line that contains very interesting text. This is just a long line that contains very interesting text.';

		function assertSplitsTokens(message: string, lineText: string, expectedOutput: string[]): void {
			let lineParts = createViewLineTokens([createPart(lineText.length, 1)]);
			let actual = renderViewLine(new RenderLineInput(
				false,
				true,
				lineText,
				false,
				true,
				false,
				0,
				lineParts,
				[],
				4,
				0,
				10,
				10,
				10,
				-1,
				'none',
				false,
				false,
				null
			));
			assert.strictEqual(actual.html, '<span>' + expectedOutput.join('') + '</span>', message);
		}

		// A token with 49 chars
		{
			assertSplitsTokens(
				'49 chars',
				_lineText.substr(0, 49),
				[
					'<span class="mtk1">This\u00a0is\u00a0just\u00a0a\u00a0long\u00a0line\u00a0that\u00a0contains\u00a0very\u00a0inter</span>',
				]
			);
		}

		// A token with 50 chars
		{
			assertSplitsTokens(
				'50 chars',
				_lineText.substr(0, 50),
				[
					'<span class="mtk1">This\u00a0is\u00a0just\u00a0a\u00a0long\u00a0line\u00a0that\u00a0contains\u00a0very\u00a0intere</span>',
				]
			);
		}

		// A token with 51 chars
		{
			assertSplitsTokens(
				'51 chars',
				_lineText.substr(0, 51),
				[
					'<span class="mtk1">This\u00a0is\u00a0just\u00a0a\u00a0long\u00a0line\u00a0that\u00a0contains\u00a0very\u00a0intere</span>',
					'<span class="mtk1">s</span>',
				]
			);
		}

		// A token with 99 chars
		{
			assertSplitsTokens(
				'99 chars',
				_lineText.substr(0, 99),
				[
					'<span class="mtk1">This\u00a0is\u00a0just\u00a0a\u00a0long\u00a0line\u00a0that\u00a0contains\u00a0very\u00a0intere</span>',
					'<span class="mtk1">sting\u00a0text.\u00a0This\u00a0is\u00a0just\u00a0a\u00a0long\u00a0line\u00a0that\u00a0contain</span>',
				]
			);
		}

		// A token with 100 chars
		{
			assertSplitsTokens(
				'100 chars',
				_lineText.substr(0, 100),
				[
					'<span class="mtk1">This\u00a0is\u00a0just\u00a0a\u00a0long\u00a0line\u00a0that\u00a0contains\u00a0very\u00a0intere</span>',
					'<span class="mtk1">sting\u00a0text.\u00a0This\u00a0is\u00a0just\u00a0a\u00a0long\u00a0line\u00a0that\u00a0contains</span>',
				]
			);
		}

		// A token with 101 chars
		{
			assertSplitsTokens(
				'101 chars',
				_lineText.substr(0, 101),
				[
					'<span class="mtk1">This\u00a0is\u00a0just\u00a0a\u00a0long\u00a0line\u00a0that\u00a0contains\u00a0very\u00a0intere</span>',
					'<span class="mtk1">sting\u00a0text.\u00a0This\u00a0is\u00a0just\u00a0a\u00a0long\u00a0line\u00a0that\u00a0contains</span>',
					'<span class="mtk1">\u00a0</span>',
				]
			);
		}
	});

	test('issue #21476: Does not split large tokens when ligatures are on', () => {
		//                                                                                                                  1         1         1
		//                        1         2         3         4         5         6         7         8         9         0         1         2
		//               1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234
		let _lineText = 'This is just a long line that contains very interesting text. This is just a long line that contains very interesting text.';

		function assertSplitsTokens(message: string, lineText: string, expectedOutput: string[]): void {
			let lineParts = createViewLineTokens([createPart(lineText.length, 1)]);
			let actual = renderViewLine(new RenderLineInput(
				false,
				true,
				lineText,
				false,
				true,
				false,
				0,
				lineParts,
				[],
				4,
				0,
				10,
				10,
				10,
				-1,
				'none',
				false,
				true,
				null
			));
			assert.strictEqual(actual.html, '<span>' + expectedOutput.join('') + '</span>', message);
		}

		// A token with 101 chars
		{
			assertSplitsTokens(
				'101 chars',
				_lineText.substr(0, 101),
				[
					'<span class="mtk1">This\u00a0is\u00a0just\u00a0a\u00a0long\u00a0line\u00a0that\u00a0contains\u00a0very\u00a0</span>',
					'<span class="mtk1">interesting\u00a0text.\u00a0This\u00a0is\u00a0just\u00a0a\u00a0long\u00a0line\u00a0that\u00a0</span>',
					'<span class="mtk1">contains\u00a0</span>',
				]
			);
		}
	});

	test('issue #20624: Unaligned surrogate pairs are corrupted at multiples of 50 columns', () => {
		let lineText = 'a𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷';

		let lineParts = createViewLineTokens([createPart(lineText.length, 1)]);
		let actual = renderViewLine(new RenderLineInput(
			false,
			true,
			lineText,
			false,
			false,
			false,
			0,
			lineParts,
			[],
			4,
			0,
			10,
			10,
			10,
			-1,
			'none',
			false,
			false,
			null
		));
		let expectedOutput = [
			'<span class="mtk1">a𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷</span>',
		];
		assert.strictEqual(actual.html, '<span>' + expectedOutput.join('') + '</span>');
	});

	test('issue #6885: Does not split large tokens in RTL text', () => {
		let lineText = 'את גרמנית בהתייחסות שמו, שנתי המשפט אל חפש, אם כתב אחרים ולחבר. של התוכן אודות בויקיפדיה כלל, של עזרה כימיה היא. על עמוד יוצרים מיתולוגיה סדר, אם שכל שתפו לעברית שינויים, אם שאלות אנגלית עזה. שמות בקלות מה סדר.';
		let lineParts = createViewLineTokens([createPart(lineText.length, 1)]);
		let expectedOutput = [
			'<span class="mtk1">את\u00a0גרמנית\u00a0בהתייחסות\u00a0שמו,\u00a0שנתי\u00a0המשפט\u00a0אל\u00a0חפש,\u00a0אם\u00a0כתב\u00a0אחרים\u00a0ולחבר.\u00a0של\u00a0התוכן\u00a0אודות\u00a0בויקיפדיה\u00a0כלל,\u00a0של\u00a0עזרה\u00a0כימיה\u00a0היא.\u00a0על\u00a0עמוד\u00a0יוצרים\u00a0מיתולוגיה\u00a0סדר,\u00a0אם\u00a0שכל\u00a0שתפו\u00a0לעברית\u00a0שינויים,\u00a0אם\u00a0שאלות\u00a0אנגלית\u00a0עזה.\u00a0שמות\u00a0בקלות\u00a0מה\u00a0סדר.</span>'
		];
		let actual = renderViewLine(new RenderLineInput(
			false,
			true,
			lineText,
			false,
			false,
			true,
			0,
			lineParts,
			[],
			4,
			0,
			10,
			10,
			10,
			-1,
			'none',
			false,
			false,
			null
		));
		assert.strictEqual(actual.html, '<span dir="ltr">' + expectedOutput.join('') + '</span>');
		assert.strictEqual(actual.containsRTL, true);
	});

	test('issue #95685: Uses unicode replacement character for Paragraph Separator', () => {
		const lineText = 'var ftext = [\u2029"Und", "dann", "eines"];';
		const lineParts = createViewLineTokens([createPart(lineText.length, 1)]);
		const expectedOutput = [
			'<span class="mtk1">var\u00a0ftext\u00a0=\u00a0[\uFFFD"Und",\u00a0"dann",\u00a0"eines"];</span>'
		];
		const actual = renderViewLine(new RenderLineInput(
			false,
			true,
			lineText,
			false,
			false,
			false,
			0,
			lineParts,
			[],
			4,
			0,
			10,
			10,
			10,
			-1,
			'none',
			false,
			false,
			null
		));
		assert.strictEqual(actual.html, '<span>' + expectedOutput.join('') + '</span>');
	});

	test('issue #19673: Monokai Theme bad-highlighting in line wrap', () => {
		let lineText = '    MongoCallback<string>): void {';

		let lineParts = createViewLineTokens([
			createPart(17, 1),
			createPart(18, 2),
			createPart(24, 3),
			createPart(26, 4),
			createPart(27, 5),
			createPart(28, 6),
			createPart(32, 7),
			createPart(34, 8),
		]);
		let expectedOutput = [
			'<span class="">\u00a0\u00a0\u00a0\u00a0</span>',
			'<span class="mtk1">MongoCallback</span>',
			'<span class="mtk2">&lt;</span>',
			'<span class="mtk3">string</span>',
			'<span class="mtk4">&gt;)</span>',
			'<span class="mtk5">:</span>',
			'<span class="mtk6">\u00a0</span>',
			'<span class="mtk7">void</span>',
			'<span class="mtk8">\u00a0{</span>'
		].join('');

		let _actual = renderViewLine(new RenderLineInput(
			true,
			true,
			lineText,
			false,
			true,
			false,
			4,
			lineParts,
			[],
			4,
			0,
			10,
			10,
			10,
			-1,
			'none',
			false,
			false,
			null
		));

		assert.strictEqual(_actual.html, '<span>' + expectedOutput + '</span>');
	});

	interface ICharMappingData {
		charOffset: number;
		partIndex: number;
		charIndex: number;
	}

	function decodeCharacterMapping(source: CharacterMapping) {
		const mapping: ICharMappingData[] = [];
		for (let charOffset = 0; charOffset < source.length; charOffset++) {
			const domPosition = source.getDomPosition(charOffset + 1);
			mapping.push({ charOffset, partIndex: domPosition.partIndex, charIndex: domPosition.charIndex });
		}
		const absoluteOffsets: number[] = [];
		for (let i = 0; i < source.length; i++) {
			absoluteOffsets[i] = source.getAbsoluteOffset(i + 1);
		}
		return { mapping, absoluteOffsets };
	}

	function assertCharacterMapping2(actual: CharacterMapping, expected: CharacterMapping): void {
		const _actual = decodeCharacterMapping(actual);
		const _expected = decodeCharacterMapping(expected);
		assert.deepStrictEqual(_actual, _expected);
	}
});

type CharacterMappingInfo = [number, [number, number]];

function assertCharacterMapping3(actual: CharacterMapping, expectedInfo: CharacterMappingInfo[]): void {
	for (let i = 0; i < expectedInfo.length; i++) {
		const [absoluteOffset, [partIndex, charIndex]] = expectedInfo[i];

		const actualDomPosition = actual.getDomPosition(i + 1);
		assert.deepStrictEqual(actualDomPosition, new DomPosition(partIndex, charIndex), `getDomPosition(${i + 1})`);

		let partLength = charIndex + 1;
		for (let j = i + 1; j < expectedInfo.length; j++) {
			const [, [nextPartIndex, nextCharIndex]] = expectedInfo[j];
			if (nextPartIndex === partIndex) {
				partLength = nextCharIndex + 1;
			} else {
				break;
			}
		}

		const actualColumn = actual.getColumn(new DomPosition(partIndex, charIndex), partLength);
		assert.strictEqual(actualColumn, i + 1, `actual.getColumn(${partIndex}, ${charIndex})`);

		const actualAbsoluteOffset = actual.getAbsoluteOffset(i + 1);
		assert.strictEqual(actualAbsoluteOffset, absoluteOffset, `actual.getAbsoluteOffset(${i + 1})`);
	}

	assert.strictEqual(actual.length, expectedInfo.length, `length mismatch`);
}

suite('viewLineRenderer.renderLine 2', () => {

	function testCreateLineParts(fontIsMonospace: boolean, lineContent: string, tokens: ViewLineToken[], fauxIndentLength: number, renderWhitespace: 'none' | 'boundary' | 'selection' | 'trailing' | 'all', selections: LineRange[] | null, expected: string): void {
		let actual = renderViewLine(new RenderLineInput(
			fontIsMonospace,
			true,
			lineContent,
			false,
			true,
			false,
			fauxIndentLength,
			createViewLineTokens(tokens),
			[],
			4,
			0,
			10,
			10,
			10,
			-1,
			renderWhitespace,
			false,
			false,
			selections
		));

		assert.deepStrictEqual(actual.html, expected);
	}

	test('issue #18616: Inline decorations ending at the text length are no longer rendered', () => {

		let lineContent = 'https://microsoft.com';

		let actual = renderViewLine(new RenderLineInput(
			false,
			true,
			lineContent,
			false,
			true,
			false,
			0,
			createViewLineTokens([createPart(21, 3)]),
			[new LineDecoration(1, 22, 'link', InlineDecorationType.Regular)],
			4,
			0,
			10,
			10,
			10,
			-1,
			'none',
			false,
			false,
			null
		));

		let expected = [
			'<span>',
			'<span class="mtk3 link">https://microsoft.com</span>',
			'</span>'
		].join('');

		assert.deepStrictEqual(actual.html, expected);
	});

	test('issue #19207: Link in Monokai is not rendered correctly', () => {

		let lineContent = '\'let url = `http://***/_api/web/lists/GetByTitle(\\\'Teambuildingaanvragen\\\')/items`;\'';

		let actual = renderViewLine(new RenderLineInput(
			true,
			true,
			lineContent,
			false,
			true,
			false,
			0,
			createViewLineTokens([
				createPart(49, 6),
				createPart(51, 4),
				createPart(72, 6),
				createPart(74, 4),
				createPart(84, 6),
			]),
			[
				new LineDecoration(13, 51, 'detected-link', InlineDecorationType.Regular)
			],
			4,
			0,
			10,
			10,
			10,
			-1,
			'none',
			false,
			false,
			null
		));

		let expected = [
			'<span>',
			'<span class="mtk6">\'let\u00a0url\u00a0=\u00a0`</span>',
			'<span class="mtk6 detected-link">http://***/_api/web/lists/GetByTitle(</span>',
			'<span class="mtk4 detected-link">\\</span>',
			'<span class="mtk4">\'</span>',
			'<span class="mtk6">Teambuildingaanvragen</span>',
			'<span class="mtk4">\\\'</span>',
			'<span class="mtk6">)/items`;\'</span>',
			'</span>'
		].join('');

		assert.deepStrictEqual(actual.html, expected);
	});

	test('createLineParts simple', () => {
		testCreateLineParts(
			false,
			'Hello world!',
			[
				createPart(12, 1)
			],
			0,
			'none',
			null,
			[
				'<span>',
				'<span class="mtk1">Hello\u00a0world!</span>',
				'</span>',
			].join('')
		);
	});
	test('createLineParts simple two tokens', () => {
		testCreateLineParts(
			false,
			'Hello world!',
			[
				createPart(6, 1),
				createPart(12, 2)
			],
			0,
			'none',
			null,
			[
				'<span>',
				'<span class="mtk1">Hello\u00a0</span>',
				'<span class="mtk2">world!</span>',
				'</span>',
			].join('')
		);
	});
	test('createLineParts render whitespace - 4 leading spaces', () => {
		testCreateLineParts(
			false,
			'    Hello world!    ',
			[
				createPart(4, 1),
				createPart(6, 2),
				createPart(20, 3)
			],
			0,
			'boundary',
			null,
			[
				'<span>',
				'<span class="mtkz" style="width:40px">\u00b7\u00b7\u00b7\u00b7</span>',
				'<span class="mtk2">He</span>',
				'<span class="mtk3">llo\u00a0world!</span>',
				'<span class="mtkz" style="width:40px">\u00b7\u00b7\u00b7\u00b7</span>',
				'</span>',
			].join('')
		);
	});
	test('createLineParts render whitespace - 8 leading spaces', () => {
		testCreateLineParts(
			false,
			'        Hello world!        ',
			[
				createPart(8, 1),
				createPart(10, 2),
				createPart(28, 3)
			],
			0,
			'boundary',
			null,
			[
				'<span>',
				'<span class="mtkz" style="width:40px">\u00b7\u00b7\u00b7\u00b7</span>',
				'<span class="mtkz" style="width:40px">\u00b7\u00b7\u00b7\u00b7</span>',
				'<span class="mtk2">He</span>',
				'<span class="mtk3">llo\u00a0world!</span>',
				'<span class="mtkz" style="width:40px">\u00b7\u00b7\u00b7\u00b7</span>',
				'<span class="mtkz" style="width:40px">\u00b7\u00b7\u00b7\u00b7</span>',
				'</span>',
			].join('')
		);
	});
	test('createLineParts render whitespace - 2 leading tabs', () => {
		testCreateLineParts(
			false,
			'\t\tHello world!\t',
			[
				createPart(2, 1),
				createPart(4, 2),
				createPart(15, 3)
			],
			0,
			'boundary',
			null,
			[
				'<span>',
				'<span class="mtkz" style="width:40px">\u2192\u00a0\u00a0\u00a0</span>',
				'<span class="mtkz" style="width:40px">\u2192\u00a0\u00a0\u00a0</span>',
				'<span class="mtk2">He</span>',
				'<span class="mtk3">llo\u00a0world!</span>',
				'<span class="mtkz" style="width:40px">\u2192\u00a0\u00a0\u00a0</span>',
				'</span>',
			].join('')
		);
	});
	test('createLineParts render whitespace - mixed leading spaces and tabs', () => {
		testCreateLineParts(
			false,
			'  \t\t  Hello world! \t  \t   \t    ',
			[
				createPart(6, 1),
				createPart(8, 2),
				createPart(31, 3)
			],
			0,
			'boundary',
			null,
			[
				'<span>',
				'<span class="mtkz" style="width:40px">\u00b7\u00b7\u2192\u00a0</span>',
				'<span class="mtkz" style="width:40px">\u2192\u00a0\u00a0\u00a0</span>',
				'<span class="mtkz" style="width:20px">\u00b7\u00b7</span>',
				'<span class="mtk2">He</span>',
				'<span class="mtk3">llo\u00a0world!</span>',
				'<span class="mtkz" style="width:20px">\u00b7\uffeb</span>',
				'<span class="mtkz" style="width:40px">\u00b7\u00b7\u2192\u00a0</span>',
				'<span class="mtkz" style="width:40px">\u00b7\u00b7\u00b7\uffeb</span>',
				'<span class="mtkz" style="width:40px">\u00b7\u00b7\u00b7\u00b7</span>',
				'</span>',
			].join('')
		);
	});

	test('createLineParts render whitespace skips faux indent', () => {
		testCreateLineParts(
			false,
			'\t\t  Hello world! \t  \t   \t    ',
			[
				createPart(4, 1),
				createPart(6, 2),
				createPart(29, 3)
			],
			2,
			'boundary',
			null,
			[
				'<span>',
				'<span class="">\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0</span>',
				'<span class="mtkz" style="width:20px">\u00b7\u00b7</span>',
				'<span class="mtk2">He</span>',
				'<span class="mtk3">llo\u00a0world!</span>',
				'<span class="mtkz" style="width:20px">\u00b7\uffeb</span>',
				'<span class="mtkz" style="width:40px">\u00b7\u00b7\u2192\u00a0</span>',
				'<span class="mtkz" style="width:40px">\u00b7\u00b7\u00b7\uffeb</span>',
				'<span class="mtkz" style="width:40px">\u00b7\u00b7\u00b7\u00b7</span>',
				'</span>',
			].join('')
		);
	});

	test('createLineParts does not emit width for monospace fonts', () => {
		testCreateLineParts(
			true,
			'\t\t  Hello world! \t  \t   \t    ',
			[
				createPart(4, 1),
				createPart(6, 2),
				createPart(29, 3)
			],
			2,
			'boundary',
			null,
			[
				'<span>',
				'<span class="">\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0</span>',
				'<span class="mtkw">\u00b7\u00b7</span>',
				'<span class="mtk2">He</span>',
				'<span class="mtk3">llo\u00a0world!</span>',
				'<span class="mtkw">\u00b7\uffeb\u00b7\u00b7\u2192\u00a0\u00b7\u00b7\u00b7\uffeb\u00b7\u00b7\u00b7\u00b7</span>',
				'</span>',
			].join('')
		);
	});

	test('createLineParts render whitespace in middle but not for one space', () => {
		testCreateLineParts(
			false,
			'it  it it  it',
			[
				createPart(6, 1),
				createPart(7, 2),
				createPart(13, 3)
			],
			0,
			'boundary',
			null,
			[
				'<span>',
				'<span class="mtk1">it</span>',
				'<span class="mtkz" style="width:20px">\u00b7\u00b7</span>',
				'<span class="mtk1">it</span>',
				'<span class="mtk2">\u00a0</span>',
				'<span class="mtk3">it</span>',
				'<span class="mtkz" style="width:20px">\u00b7\u00b7</span>',
				'<span class="mtk3">it</span>',
				'</span>',
			].join('')
		);
	});

	test('createLineParts render whitespace for all in middle', () => {
		testCreateLineParts(
			false,
			' Hello world!\t',
			[
				createPart(4, 0),
				createPart(6, 1),
				createPart(14, 2)
			],
			0,
			'all',
			null,
			[
				'<span>',
				'<span class="mtkz" style="width:10px">\u00b7</span>',
				'<span class="mtk0">Hel</span>',
				'<span class="mtk1">lo</span>',
				'<span class="mtkz" style="width:10px">\u00b7</span>',
				'<span class="mtk2">world!</span>',
				'<span class="mtkz" style="width:30px">\u2192\u00a0\u00a0</span>',
				'</span>',
			].join('')
		);
	});

	test('createLineParts render whitespace for selection with no selections', () => {
		testCreateLineParts(
			false,
			' Hello world!\t',
			[
				createPart(4, 0),
				createPart(6, 1),
				createPart(14, 2)
			],
			0,
			'selection',
			null,
			[
				'<span>',
				'<span class="mtk0">\u00a0Hel</span>',
				'<span class="mtk1">lo</span>',
				'<span class="mtk2">\u00a0world!\u00a0\u00a0\u00a0</span>',
				'</span>',
			].join('')
		);
	});

	test('createLineParts render whitespace for selection with whole line selection', () => {
		testCreateLineParts(
			false,
			' Hello world!\t',
			[
				createPart(4, 0),
				createPart(6, 1),
				createPart(14, 2)
			],
			0,
			'selection',
			[new LineRange(0, 14)],
			[
				'<span>',
				'<span class="mtkz" style="width:10px">\u00b7</span>',
				'<span class="mtk0">Hel</span>',
				'<span class="mtk1">lo</span>',
				'<span class="mtkz" style="width:10px">\u00b7</span>',
				'<span class="mtk2">world!</span>',
				'<span class="mtkz" style="width:30px">\u2192\u00a0\u00a0</span>',
				'</span>',
			].join('')
		);
	});

	test('createLineParts render whitespace for selection with selection spanning part of whitespace', () => {
		testCreateLineParts(
			false,
			' Hello world!\t',
			[
				createPart(4, 0),
				createPart(6, 1),
				createPart(14, 2)
			],
			0,
			'selection',
			[new LineRange(0, 5)],
			[
				'<span>',
				'<span class="mtkz" style="width:10px">\u00b7</span>',
				'<span class="mtk0">Hel</span>',
				'<span class="mtk1">lo</span>',
				'<span class="mtk2">\u00a0world!\u00a0\u00a0\u00a0</span>',
				'</span>',
			].join('')
		);
	});


	test('createLineParts render whitespace for selection with multiple selections', () => {
		testCreateLineParts(
			false,
			' Hello world!\t',
			[
				createPart(4, 0),
				createPart(6, 1),
				createPart(14, 2)
			],
			0,
			'selection',
			[new LineRange(0, 5), new LineRange(9, 14)],
			[
				'<span>',
				'<span class="mtkz" style="width:10px">\u00b7</span>',
				'<span class="mtk0">Hel</span>',
				'<span class="mtk1">lo</span>',
				'<span class="mtk2">\u00a0world!</span>',
				'<span class="mtkz" style="width:30px">\u2192\u00a0\u00a0</span>',
				'</span>',
			].join('')
		);
	});


	test('createLineParts render whitespace for selection with multiple, initially unsorted selections', () => {
		testCreateLineParts(
			false,
			' Hello world!\t',
			[
				createPart(4, 0),
				createPart(6, 1),
				createPart(14, 2)
			],
			0,
			'selection',
			[new LineRange(9, 14), new LineRange(0, 5)],
			[
				'<span>',
				'<span class="mtkz" style="width:10px">\u00b7</span>',
				'<span class="mtk0">Hel</span>',
				'<span class="mtk1">lo</span>',
				'<span class="mtk2">\u00a0world!</span>',
				'<span class="mtkz" style="width:30px">\u2192\u00a0\u00a0</span>',
				'</span>',
			].join('')
		);
	});

	test('createLineParts render whitespace for selection with selections next to each other', () => {
		testCreateLineParts(
			false,
			' * S',
			[
				createPart(4, 0)
			],
			0,
			'selection',
			[new LineRange(0, 1), new LineRange(1, 2), new LineRange(2, 3)],
			[
				'<span>',
				'<span class="mtkz" style="width:10px">\u00b7</span>',
				'<span class="mtk0">*</span>',
				'<span class="mtkz" style="width:10px">\u00b7</span>',
				'<span class="mtk0">S</span>',
				'</span>',
			].join('')
		);
	});

	test('createLineParts render whitespace for trailing with leading, inner, and without trailing whitespace', () => {
		testCreateLineParts(
			false,
			' Hello world!',
			[
				createPart(4, 0),
				createPart(6, 1),
				createPart(14, 2)
			],
			0,
			'trailing',
			null,
			[
				'<span>',
				'<span class="mtk0">\u00a0Hel</span>',
				'<span class="mtk1">lo</span>',
				'<span class="mtk2">\u00a0world!</span>',
				'</span>',
			].join('')
		);
	});

	test('createLineParts render whitespace for trailing with leading, inner, and trailing whitespace', () => {
		testCreateLineParts(
			false,
			' Hello world! \t',
			[
				createPart(4, 0),
				createPart(6, 1),
				createPart(15, 2)
			],
			0,
			'trailing',
			null,
			[
				'<span>',
				'<span class="mtk0">\u00a0Hel</span>',
				'<span class="mtk1">lo</span>',
				'<span class="mtk2">\u00a0world!</span>',
				'<span class="mtkz" style="width:30px">\u00b7\u2192\u00a0</span>',
				'</span>',
			].join('')
		);
	});

	test('createLineParts render whitespace for trailing with 8 leading and 8 trailing whitespaces', () => {
		testCreateLineParts(
			false,
			'        Hello world!        ',
			[
				createPart(8, 1),
				createPart(10, 2),
				createPart(28, 3)
			],
			0,
			'trailing',
			null,
			[
				'<span>',
				'<span class="mtk1">\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0</span>',
				'<span class="mtk2">He</span>',
				'<span class="mtk3">llo\u00a0world!</span>',
				'<span class="mtkz" style="width:40px">\u00b7\u00b7\u00b7\u00b7</span>',
				'<span class="mtkz" style="width:40px">\u00b7\u00b7\u00b7\u00b7</span>',
				'</span>',
			].join('')
		);
	});

	test('createLineParts render whitespace for trailing with line containing only whitespaces', () => {
		testCreateLineParts(
			false,
			' \t ',
			[
				createPart(2, 0),
				createPart(3, 1),
			],
			0,
			'trailing',
			null,
			[
				'<span>',
				'<span class="mtkz" style="width:40px">\u00b7\u2192\u00a0\u00a0</span>',
				'<span class="mtkz" style="width:10px">\u00b7</span>',
				'</span>',
			].join('')
		);
	});

	test('createLineParts can handle unsorted inline decorations', () => {
		let actual = renderViewLine(new RenderLineInput(
			false,
			true,
			'Hello world',
			false,
			true,
			false,
			0,
			createViewLineTokens([createPart(11, 0)]),
			[
				new LineDecoration(5, 7, 'a', InlineDecorationType.Regular),
				new LineDecoration(1, 3, 'b', InlineDecorationType.Regular),
				new LineDecoration(2, 8, 'c', InlineDecorationType.Regular),
			],
			4,
			0,
			10,
			10,
			10,
			-1,
			'none',
			false,
			false,
			null
		));

		// 01234567890
		// Hello world
		// ----aa-----
		// bb---------
		// -cccccc----

		assert.deepStrictEqual(actual.html, [
			'<span>',
			'<span class="mtk0 b">H</span>',
			'<span class="mtk0 b c">e</span>',
			'<span class="mtk0 c">ll</span>',
			'<span class="mtk0 a c">o\u00a0</span>',
			'<span class="mtk0 c">w</span>',
			'<span class="mtk0">orld</span>',
			'</span>',
		].join(''));
	});

	test('issue #11485: Visible whitespace conflicts with before decorator attachment', () => {

		let lineContent = '\tbla';

		let actual = renderViewLine(new RenderLineInput(
			false,
			true,
			lineContent,
			false,
			true,
			false,
			0,
			createViewLineTokens([createPart(4, 3)]),
			[new LineDecoration(1, 2, 'before', InlineDecorationType.Before)],
			4,
			0,
			10,
			10,
			10,
			-1,
			'all',
			false,
			true,
			null
		));

		let expected = [
			'<span>',
			'<span class="mtkw before">\u2192\u00a0\u00a0\u00a0</span>',
			'<span class="mtk3">bla</span>',
			'</span>'
		].join('');

		assert.deepStrictEqual(actual.html, expected);
	});

	test('issue #32436: Non-monospace font + visible whitespace + After decorator causes line to "jump"', () => {

		let lineContent = '\tbla';

		let actual = renderViewLine(new RenderLineInput(
			false,
			true,
			lineContent,
			false,
			true,
			false,
			0,
			createViewLineTokens([createPart(4, 3)]),
			[new LineDecoration(2, 3, 'before', InlineDecorationType.Before)],
			4,
			0,
			10,
			10,
			10,
			-1,
			'all',
			false,
			true,
			null
		));

		let expected = [
			'<span>',
			'<span class="mtkz" style="width:40px">\u2192\u00a0\u00a0\u00a0</span>',
			'<span class="mtk3 before">b</span>',
			'<span class="mtk3">la</span>',
			'</span>'
		].join('');

		assert.deepStrictEqual(actual.html, expected);
	});

	test('issue #30133: Empty lines don\'t render inline decorations', () => {

		let lineContent = '';

		let actual = renderViewLine(new RenderLineInput(
			false,
			true,
			lineContent,
			false,
			true,
			false,
			0,
			createViewLineTokens([createPart(0, 3)]),
			[new LineDecoration(1, 2, 'before', InlineDecorationType.Before)],
			4,
			0,
			10,
			10,
			10,
			-1,
			'all',
			false,
			true,
			null
		));

		let expected = [
			'<span>',
			'<span class="before"></span>',
			'</span>'
		].join('');

		assert.deepStrictEqual(actual.html, expected);
	});

	test('issue #37208: Collapsing bullet point containing emoji in Markdown document results in [??] character', () => {

		let actual = renderViewLine(new RenderLineInput(
			true,
			true,
			'  1. 🙏',
			false,
			false,
			false,
			0,
			createViewLineTokens([createPart(7, 3)]),
			[new LineDecoration(7, 8, 'inline-folded', InlineDecorationType.After)],
			2,
			0,
			10,
			10,
			10,
			10000,
			'none',
			false,
			false,
			null
		));

		let expected = [
			'<span>',
			'<span class="mtk3">\u00a0\u00a01.\u00a0</span>',
			'<span class="mtk3 inline-folded">🙏</span>',
			'</span>'
		].join('');

		assert.deepStrictEqual(actual.html, expected);
	});

	test('issue #37401 #40127: Allow both before and after decorations on empty line', () => {

		let actual = renderViewLine(new RenderLineInput(
			true,
			true,
			'',
			false,
			true,
			false,
			0,
			createViewLineTokens([createPart(0, 3)]),
			[
				new LineDecoration(1, 1, 'before', InlineDecorationType.Before),
				new LineDecoration(1, 1, 'after', InlineDecorationType.After),
			],
			2,
			0,
			10,
			10,
			10,
			10000,
			'none',
			false,
			false,
			null
		));

		let expected = [
			'<span>',
			'<span class="before"></span>',
			'<span class="after"></span>',
			'</span>'
		].join('');

		assert.deepStrictEqual(actual.html, expected);
	});

	test('issue #118759: enable multiple text editor decorations in empty lines', () => {

		let actual = renderViewLine(new RenderLineInput(
			true,
			true,
			'',
			false,
			true,
			false,
			0,
			createViewLineTokens([createPart(0, 3)]),
			[
				new LineDecoration(1, 1, 'after1', InlineDecorationType.After),
				new LineDecoration(1, 1, 'after2', InlineDecorationType.After),
				new LineDecoration(1, 1, 'before1', InlineDecorationType.Before),
				new LineDecoration(1, 1, 'before2', InlineDecorationType.Before),
			],
			2,
			0,
			10,
			10,
			10,
			10000,
			'none',
			false,
			false,
			null
		));

		let expected = [
			'<span>',
			'<span class="before1"></span>',
			'<span class="before2"></span>',
			'<span class="after1"></span>',
			'<span class="after2"></span>',
			'</span>'
		].join('');

		assert.deepStrictEqual(actual.html, expected);
	});

	test('issue #38935: GitLens end-of-line blame no longer rendering', () => {

		let actual = renderViewLine(new RenderLineInput(
			true,
			true,
			'\t}',
			false,
			true,
			false,
			0,
			createViewLineTokens([createPart(2, 3)]),
			[
				new LineDecoration(3, 3, 'ced-TextEditorDecorationType2-5e9b9b3f-3 ced-TextEditorDecorationType2-3', InlineDecorationType.Before),
				new LineDecoration(3, 3, 'ced-TextEditorDecorationType2-5e9b9b3f-4 ced-TextEditorDecorationType2-4', InlineDecorationType.After),
			],
			4,
			0,
			10,
			10,
			10,
			10000,
			'none',
			false,
			false,
			null
		));

		let expected = [
			'<span>',
			'<span class="mtk3">\u00a0\u00a0\u00a0\u00a0}</span>',
			'<span class="ced-TextEditorDecorationType2-5e9b9b3f-3 ced-TextEditorDecorationType2-3"></span><span class="ced-TextEditorDecorationType2-5e9b9b3f-4 ced-TextEditorDecorationType2-4"></span>',
			'</span>'
		].join('');

		assert.deepStrictEqual(actual.html, expected);
	});

	test('issue #22832: Consider fullwidth characters when rendering tabs', () => {

		let actual = renderViewLine(new RenderLineInput(
			true,
			true,
			'asd = "擦"\t\t#asd',
			false,
			false,
			false,
			0,
			createViewLineTokens([createPart(15, 3)]),
			[],
			4,
			0,
			10,
			10,
			10,
			10000,
			'none',
			false,
			false,
			null
		));

		let expected = [
			'<span>',
			'<span class="mtk3">asd\u00a0=\u00a0"擦"\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0#asd</span>',
			'</span>'
		].join('');

		assert.deepStrictEqual(actual.html, expected);
	});

	test('issue #22832: Consider fullwidth characters when rendering tabs (render whitespace)', () => {

		let actual = renderViewLine(new RenderLineInput(
			true,
			true,
			'asd = "擦"\t\t#asd',
			false,
			false,
			false,
			0,
			createViewLineTokens([createPart(15, 3)]),
			[],
			4,
			0,
			10,
			10,
			10,
			10000,
			'all',
			false,
			false,
			null
		));

		let expected = [
			'<span>',
			'<span class="mtk3">asd</span>',
			'<span class="mtkw">\u00b7</span>',
			'<span class="mtk3">=</span>',
			'<span class="mtkw">\u00b7</span>',
			'<span class="mtk3">"擦"</span>',
			'<span class="mtkw">\u2192\u00a0\u2192\u00a0\u00a0\u00a0</span>',
			'<span class="mtk3">#asd</span>',
			'</span>'
		].join('');

		assert.deepStrictEqual(actual.html, expected);
	});

	test('issue #22352: COMBINING ACUTE ACCENT (U+0301)', () => {

		let actual = renderViewLine(new RenderLineInput(
			true,
			true,
			'12345689012345678901234568901234567890123456890abába',
			false,
			false,
			false,
			0,
			createViewLineTokens([createPart(53, 3)]),
			[],
			4,
			0,
			10,
			10,
			10,
			10000,
			'none',
			false,
			false,
			null
		));

		let expected = [
			'<span>',
			'<span class="mtk3">12345689012345678901234568901234567890123456890abába</span>',
			'</span>'
		].join('');

		assert.deepStrictEqual(actual.html, expected);
	});

	test('issue #22352: Partially Broken Complex Script Rendering of Tamil', () => {

		let actual = renderViewLine(new RenderLineInput(
			true,
			true,
			' JoyShareல் பின்தொடர்ந்து, விடீயோ, ஜோக்குகள், அனிமேசன், நகைச்சுவை படங்கள் மற்றும் செய்திகளை பெறுவீர்',
			false,
			false,
			false,
			0,
			createViewLineTokens([createPart(100, 3)]),
			[],
			4,
			0,
			10,
			10,
			10,
			10000,
			'none',
			false,
			false,
			null
		));

		let expected = [
			'<span>',
			'<span class="mtk3">\u00a0JoyShareல்\u00a0பின்தொடர்ந்து,\u00a0விடீயோ,\u00a0ஜோக்குகள்,\u00a0</span>',
			'<span class="mtk3">அனிமேசன்,\u00a0நகைச்சுவை\u00a0படங்கள்\u00a0மற்றும்\u00a0செய்திகளை\u00a0</span>',
			'<span class="mtk3">பெறுவீர்</span>',
			'</span>'
		].join('');

		assert.deepStrictEqual(actual.html, expected);
	});

	test('issue #42700: Hindi characters are not being rendered properly', () => {

		let actual = renderViewLine(new RenderLineInput(
			true,
			true,
			' वो ऐसा क्या है जो हमारे अंदर भी है और बाहर भी है। जिसकी वजह से हम सब हैं। जिसने इस सृष्टि की रचना की है।',
			false,
			false,
			false,
			0,
			createViewLineTokens([createPart(105, 3)]),
			[],
			4,
			0,
			10,
			10,
			10,
			10000,
			'none',
			false,
			false,
			null
		));

		let expected = [
			'<span>',
			'<span class="mtk3">\u00a0वो\u00a0ऐसा\u00a0क्या\u00a0है\u00a0जो\u00a0हमारे\u00a0अंदर\u00a0भी\u00a0है\u00a0और\u00a0बाहर\u00a0भी\u00a0है।\u00a0</span>',
			'<span class="mtk3">जिसकी\u00a0वजह\u00a0से\u00a0हम\u00a0सब\u00a0हैं।\u00a0जिसने\u00a0इस\u00a0सृष्टि\u00a0की\u00a0रचना\u00a0की\u00a0</span>',
			'<span class="mtk3">है।</span>',
			'</span>'
		].join('');

		assert.deepStrictEqual(actual.html, expected);
	});

	test('issue #38123: editor.renderWhitespace: "boundary" renders whitespace at line wrap point when line is wrapped', () => {
		let actual = renderViewLine(new RenderLineInput(
			true,
			true,
			'This is a long line which never uses more than two spaces. ',
			true,
			true,
			false,
			0,
			createViewLineTokens([createPart(59, 3)]),
			[],
			4,
			0,
			10,
			10,
			10,
			10000,
			'boundary',
			false,
			false,
			null
		));

		let expected = [
			'<span>',
			'<span class="mtk3">This\u00a0is\u00a0a\u00a0long\u00a0line\u00a0which\u00a0never\u00a0uses\u00a0more\u00a0than\u00a0two</span><span class="mtk3">\u00a0spaces.</span><span class="mtk3">\u00a0</span>',
			'</span>'
		].join('');

		assert.deepStrictEqual(actual.html, expected);
	});

	test('issue #33525: Long line with ligatures takes a long time to paint decorations', () => {
		let actual = renderViewLine(new RenderLineInput(
			false,
			false,
			'append data to append data to append data to append data to append data to append data to append data to append data to append data to append data to append data to append data to append data to',
			false,
			true,
			false,
			0,
			createViewLineTokens([createPart(194, 3)]),
			[],
			4,
			0,
			10,
			10,
			10,
			10000,
			'none',
			false,
			true,
			null
		));

		let expected = [
			'<span>',
			'<span class="mtk3">append\u00a0data\u00a0to\u00a0append\u00a0data\u00a0to\u00a0append\u00a0data\u00a0to\u00a0</span>',
			'<span class="mtk3">append\u00a0data\u00a0to\u00a0append\u00a0data\u00a0to\u00a0append\u00a0data\u00a0to\u00a0</span>',
			'<span class="mtk3">append\u00a0data\u00a0to\u00a0append\u00a0data\u00a0to\u00a0append\u00a0data\u00a0to\u00a0</span>',
			'<span class="mtk3">append\u00a0data\u00a0to\u00a0append\u00a0data\u00a0to\u00a0append\u00a0data\u00a0to\u00a0</span>',
			'<span class="mtk3">append\u00a0data\u00a0to</span>',
			'</span>'
		].join('');

		assert.deepStrictEqual(actual.html, expected);
	});

	test('issue #33525: Long line with ligatures takes a long time to paint decorations - not possible', () => {
		let actual = renderViewLine(new RenderLineInput(
			false,
			false,
			'appenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatato',
			false,
			true,
			false,
			0,
			createViewLineTokens([createPart(194, 3)]),
			[],
			4,
			0,
			10,
			10,
			10,
			10000,
			'none',
			false,
			true,
			null
		));

		let expected = [
			'<span>',
			'<span class="mtk3">appenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatato</span>',
			'</span>'
		].join('');

		assert.deepStrictEqual(actual.html, expected);
	});

	test('issue #91936: Semantic token color highlighting fails on line with selected text', () => {
		let actual = renderViewLine(new RenderLineInput(
			false,
			true,
			'                    else if ($s = 08) then \'\\b\'',
			false,
			true,
			false,
			0,
			createViewLineTokens([
				createPart(20, 1),
				createPart(24, 15),
				createPart(25, 1),
				createPart(27, 15),
				createPart(28, 1),
				createPart(29, 1),
				createPart(29, 1),
				createPart(31, 16),
				createPart(32, 1),
				createPart(33, 1),
				createPart(34, 1),
				createPart(36, 6),
				createPart(36, 1),
				createPart(37, 1),
				createPart(38, 1),
				createPart(42, 15),
				createPart(43, 1),
				createPart(47, 11)
			]),
			[],
			4,
			0,
			10,
			11,
			11,
			10000,
			'selection',
			false,
			false,
			[new LineRange(0, 47)]
		));

		let expected = [
			'<span>',
			'<span class="mtkz" style="width:10px">\u00b7</span>',
			'<span class="mtkz" style="width:10px">\u00b7</span>',
			'<span class="mtkz" style="width:10px">\u00b7</span>',
			'<span class="mtkz" style="width:10px">\u00b7</span>',
			'<span class="mtkz" style="width:10px">\u00b7</span>',
			'<span class="mtkz" style="width:10px">\u00b7</span>',
			'<span class="mtkz" style="width:10px">\u00b7</span>',
			'<span class="mtkz" style="width:10px">\u00b7</span>',
			'<span class="mtkz" style="width:10px">\u00b7</span>',
			'<span class="mtkz" style="width:10px">\u00b7</span>',
			'<span class="mtkz" style="width:10px">\u00b7</span>',
			'<span class="mtkz" style="width:10px">\u00b7</span>',
			'<span class="mtkz" style="width:10px">\u00b7</span>',
			'<span class="mtkz" style="width:10px">\u00b7</span>',
			'<span class="mtkz" style="width:10px">\u00b7</span>',
			'<span class="mtkz" style="width:10px">\u00b7</span>',
			'<span class="mtkz" style="width:10px">\u00b7</span>',
			'<span class="mtkz" style="width:10px">\u00b7</span>',
			'<span class="mtkz" style="width:10px">\u00b7</span>',
			'<span class="mtkz" style="width:10px">\u00b7</span>',
			'<span class="mtk15">else</span>',
			'<span class="mtkz" style="width:10px">\u00b7</span>',
			'<span class="mtk15">if</span>',
			'<span class="mtkz" style="width:10px">\u00b7</span>',
			'<span class="mtk1">(</span>',
			'<span class="mtk16">$s</span>',
			'<span class="mtkz" style="width:10px">\u00b7</span>',
			'<span class="mtk1">=</span>',
			'<span class="mtkz" style="width:10px">\u00b7</span>',
			'<span class="mtk6">08</span>',
			'<span class="mtk1">)</span>',
			'<span class="mtkz" style="width:10px">\u00b7</span>',
			'<span class="mtk15">then</span>',
			'<span class="mtkz" style="width:10px">\u00b7</span>',
			'<span class="mtk11">\'\\b\'</span>',
			'</span>'
		].join('');

		assert.deepStrictEqual(actual.html, expected);
	});

	test('issue #119416: Delete Control Character (U+007F / &#127;) displayed as space', () => {
		const actual = renderViewLine(new RenderLineInput(
			false,
			false,
			'[' + String.fromCharCode(127) + '] [' + String.fromCharCode(0) + ']',
			false,
			true,
			false,
			0,
			createViewLineTokens([createPart(7, 3)]),
			[],
			4,
			0,
			10,
			10,
			10,
			10000,
			'none',
			true,
			true,
			null
		));

		const expected = [
			'<span>',
			'<span class="mtk3">[\u2421]\u00a0[\u2400]</span>',
			'</span>'
		].join('');

		assert.deepStrictEqual(actual.html, expected);
	});

	test('issue #116939: Important control characters aren\'t rendered', () => {
		const actual = renderViewLine(new RenderLineInput(
			false,
			false,
			`transferBalance(5678,${String.fromCharCode(0x202E)}6776,4321${String.fromCharCode(0x202C)},"USD");`,
			false,
			false,
			false,
			0,
			createViewLineTokens([createPart(42, 3)]),
			[],
			4,
			0,
			10,
			10,
			10,
			10000,
			'none',
			true,
			false,
			null
		));

		const expected = [
			'<span>',
			'<span class="mtk3">transferBalance(5678,</span><span class="mtkcontrol">[U+202E]</span><span class="mtk3">6776,4321</span><span class="mtkcontrol">[U+202C]</span><span class="mtk3">,"USD");</span>',
			'</span>'
		].join('');

		assert.deepStrictEqual(actual.html, expected);
	});

	test('issue #124038: Multiple end-of-line text decorations get merged', () => {
		const actual = renderViewLine(new RenderLineInput(
			true,
			false,
			'    if',
			false,
			true,
			false,
			0,
			createViewLineTokens([createPart(4, 1), createPart(6, 2)]),
			[
				new LineDecoration(7, 7, 'ced-1-TextEditorDecorationType2-17c14d98-3 ced-1-TextEditorDecorationType2-3', InlineDecorationType.Before),
				new LineDecoration(7, 7, 'ced-1-TextEditorDecorationType2-17c14d98-4 ced-1-TextEditorDecorationType2-4', InlineDecorationType.After),
				new LineDecoration(7, 7, 'ced-ghost-text-1-4', InlineDecorationType.After),
			],
			4,
			0,
			10,
			10,
			10,
			10000,
			'all',
			false,
			false,
			null
		));

		const expected = [
			'<span>',
			'<span class="mtkw">····</span><span class="mtk2">if</span><span class="ced-1-TextEditorDecorationType2-17c14d98-3 ced-1-TextEditorDecorationType2-3"></span><span class="ced-1-TextEditorDecorationType2-17c14d98-4 ced-1-TextEditorDecorationType2-4"></span><span class="ced-ghost-text-1-4"></span>',
			'</span>'
		].join('');

		assert.deepStrictEqual(actual.html, expected);
		assertCharacterMapping3(actual.characterMapping,
			[
				[0, [0, 0]],
				[1, [0, 1]],
				[2, [0, 2]],
				[3, [0, 3]],
				[4, [1, 0]],
				[5, [1, 1]],
				[6, [3, 0]],
			]
		);
	});


	function createTestGetColumnOfLinePartOffset(lineContent: string, tabSize: number, parts: ViewLineToken[], expectedPartLengths: number[]): (partIndex: number, partLength: number, offset: number, expected: number) => void {
		let renderLineOutput = renderViewLine(new RenderLineInput(
			false,
			true,
			lineContent,
			false,
			true,
			false,
			0,
			createViewLineTokens(parts),
			[],
			tabSize,
			0,
			10,
			10,
			10,
			-1,
			'none',
			false,
			false,
			null
		));

		return (partIndex: number, partLength: number, offset: number, expected: number) => {
			const actualColumn = renderLineOutput.characterMapping.getColumn(new DomPosition(partIndex, offset), partLength);
			assert.strictEqual(actualColumn, expected, 'getColumn for ' + partIndex + ', ' + offset);
		};
	}

	test('getColumnOfLinePartOffset 1 - simple text', () => {
		let testGetColumnOfLinePartOffset = createTestGetColumnOfLinePartOffset(
			'hello world',
			4,
			[
				createPart(11, 1)
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
				createPart(3, 1),
				createPart(4, 2),
				createPart(5, 3),
				createPart(8, 4),
				createPart(9, 5),
				createPart(10, 6),
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
				createPart(1, 1)
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
				createPart(1, 1),
				createPart(9, 2),
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
				createPart(2, 1),
				createPart(10, 2),
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
