/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { renderViewLine, RenderLineInput, CharacterMapping } from 'vs/editor/common/viewLayout/viewLineRenderer';
import { ViewLineToken } from 'vs/editor/common/core/viewLineToken';
import { CharCode } from 'vs/base/common/charCode';
import { MetadataConsts } from 'vs/editor/common/modes';

suite('viewLineRenderer.renderLine', () => {

	function createPart(endIndex: number, foreground: number): ViewLineToken {
		return new ViewLineToken(endIndex, (
			foreground << MetadataConsts.FOREGROUND_OFFSET
		) >>> 0);
	}

	function assertCharacterReplacement(lineContent: string, tabSize: number, expected: string, expectedCharOffsetInPart: number[][], expectedPartLengts: number[]): void {
		let _actual = renderViewLine(new RenderLineInput(
			false,
			lineContent,
			false,
			0,
			[new ViewLineToken(lineContent.length, 0)],
			[],
			tabSize,
			0,
			-1,
			'none',
			false
		));

		assert.equal(_actual.html, '<span><span class="mtk0">' + expected + '</span></span>');
		assertCharacterMapping(_actual.characterMapping, expectedCharOffsetInPart);
		assertPartLengths(_actual.characterMapping, expectedPartLengts);
	}

	test('replaces spaces', () => {
		assertCharacterReplacement(' ', 4, '&nbsp;', [[0, 1]], [1]);
		assertCharacterReplacement('  ', 4, '&nbsp;&nbsp;', [[0, 1, 2]], [2]);
		assertCharacterReplacement('a  b', 4, 'a&nbsp;&nbsp;b', [[0, 1, 2, 3, 4]], [4]);
	});

	test('escapes HTML markup', () => {
		assertCharacterReplacement('a<b', 4, 'a&lt;b', [[0, 1, 2, 3]], [3]);
		assertCharacterReplacement('a>b', 4, 'a&gt;b', [[0, 1, 2, 3]], [3]);
		assertCharacterReplacement('a&b', 4, 'a&amp;b', [[0, 1, 2, 3]], [3]);
	});

	test('replaces some bad characters', () => {
		assertCharacterReplacement('a\0b', 4, 'a&#00;b', [[0, 1, 2, 3]], [3]);
		assertCharacterReplacement('a' + String.fromCharCode(CharCode.UTF8_BOM) + 'b', 4, 'a\ufffdb', [[0, 1, 2, 3]], [3]);
		assertCharacterReplacement('a\u2028b', 4, 'a\ufffdb', [[0, 1, 2, 3]], [3]);
		assertCharacterReplacement('a\rb', 4, 'a&#8203b', [[0, 1, 2, 3]], [3]);
	});

	test('handles tabs', () => {
		assertCharacterReplacement('\t', 4, '&nbsp;&nbsp;&nbsp;&nbsp;', [[0, 4]], [4]);
		assertCharacterReplacement('x\t', 4, 'x&nbsp;&nbsp;&nbsp;', [[0, 1, 4]], [4]);
		assertCharacterReplacement('xx\t', 4, 'xx&nbsp;&nbsp;', [[0, 1, 2, 4]], [4]);
		assertCharacterReplacement('xxx\t', 4, 'xxx&nbsp;', [[0, 1, 2, 3, 4]], [4]);
		assertCharacterReplacement('xxxx\t', 4, 'xxxx&nbsp;&nbsp;&nbsp;&nbsp;', [[0, 1, 2, 3, 4, 8]], [8]);
	});

	function assertParts(lineContent: string, tabSize: number, parts: ViewLineToken[], expected: string, expectedCharOffsetInPart: number[][], expectedPartLengts: number[]): void {
		let _actual = renderViewLine(new RenderLineInput(
			false,
			lineContent,
			false,
			0,
			parts,
			[],
			tabSize,
			0,
			-1,
			'none',
			false
		));

		assert.equal(_actual.html, '<span>' + expected + '</span>');
		assertCharacterMapping(_actual.characterMapping, expectedCharOffsetInPart);
		assertPartLengths(_actual.characterMapping, expectedPartLengts);
	}

	test('empty line', () => {
		assertParts('', 4, [], '<span>&nbsp;</span>', [], []);
	});

	test('uses part type', () => {
		assertParts('x', 4, [createPart(1, 10)], '<span class="mtk10">x</span>', [[0, 1]], [1]);
		assertParts('x', 4, [createPart(1, 20)], '<span class="mtk20">x</span>', [[0, 1]], [1]);
		assertParts('x', 4, [createPart(1, 30)], '<span class="mtk30">x</span>', [[0, 1]], [1]);
	});

	test('two parts', () => {
		assertParts('xy', 4, [createPart(1, 1), createPart(2, 2)], '<span class="mtk1">x</span><span class="mtk2">y</span>', [[0], [0, 1]], [1, 1]);
		assertParts('xyz', 4, [createPart(1, 1), createPart(3, 2)], '<span class="mtk1">x</span><span class="mtk2">yz</span>', [[0], [0, 1, 2]], [1, 2]);
		assertParts('xyz', 4, [createPart(2, 1), createPart(3, 2)], '<span class="mtk1">xy</span><span class="mtk2">z</span>', [[0, 1], [0, 1]], [2, 1]);
	});

	test('overflow', () => {
		let _actual = renderViewLine(new RenderLineInput(
			false,
			'Hello world!',
			false,
			0,
			[
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
			],
			[],
			4,
			10,
			6,
			'boundary',
			false
		));

		let expectedOutput = [
			'<span class="mtk0">H</span>',
			'<span class="mtk1">e</span>',
			'<span class="mtk2">l</span>',
			'<span class="mtk3">l</span>',
			'<span class="mtk4">o</span>',
			'<span class="mtk5">&nbsp;</span>',
			'<span class="vs-whitespace">&hellip;</span>'
		].join('');

		assert.equal(_actual.html, '<span>' + expectedOutput + '</span>');
		assertCharacterMapping(_actual.characterMapping, [
			[0],
			[0],
			[0],
			[0],
			[0],
			[0, 1],
		]);
		assertPartLengths(_actual.characterMapping, [1, 1, 1, 1, 1, 1]);
	});

	test('typical line', () => {
		let lineText = '\t    export class Game { // http://test.com     ';
		let lineParts = [
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
		];
		let expectedOutput = [
			'<span class="vs-whitespace" style="width:40px">&rarr;&nbsp;&nbsp;&nbsp;</span>',
			'<span class="vs-whitespace" style="width:40px">&middot;&middot;&middot;&middot;</span>',
			'<span class="mtk2">export</span>',
			'<span class="mtk3">&nbsp;</span>',
			'<span class="mtk4">class</span>',
			'<span class="mtk5">&nbsp;</span>',
			'<span class="mtk6">Game</span>',
			'<span class="mtk7">&nbsp;</span>',
			'<span class="mtk8">{</span>',
			'<span class="mtk9">&nbsp;</span>',
			'<span class="mtk10">//&nbsp;</span>',
			'<span class="mtk11">http://test.com</span>',
			'<span class="vs-whitespace" style="width:20px">&middot;&middot;</span>',
			'<span class="vs-whitespace" style="width:30px">&middot;&middot;&middot;</span>'
		].join('');
		let expectedOffsetsArr = [
			[0],
			[0, 1, 2, 3],
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
			[0, 1],
			[0, 1, 2, 3],
		];

		let _actual = renderViewLine(new RenderLineInput(
			false,
			lineText,
			false,
			0,
			lineParts,
			[],
			4,
			10,
			-1,
			'boundary',
			false
		));

		assert.equal(_actual.html, '<span>' + expectedOutput + '</span>');
		assertCharacterMapping(_actual.characterMapping, expectedOffsetsArr);
		assertPartLengths(_actual.characterMapping, [4, 4, 6, 1, 5, 1, 4, 1, 1, 1, 3, 15, 2, 3]);
	});

	test('issue #2255: Weird line rendering part 1', () => {
		let lineText = '\t\t\tcursorStyle:\t\t\t\t\t\t(prevOpts.cursorStyle !== newOpts.cursorStyle),';

		let lineParts = [
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
		];
		let expectedOutput = [
			'<span class="mtk1">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>',
			'<span class="mtk2">cursorStyle:</span>',
			'<span class="mtk3">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>',
			'<span class="mtk4">(</span>',
			'<span class="mtk5">prevOpts.cursorStyle&nbsp;</span>',
			'<span class="mtk6">!=</span>',
			'<span class="mtk7">=</span>',
			'<span class="mtk8">&nbsp;newOpts.cursorStyle</span>',
			'<span class="mtk9">)</span>',
			'<span class="mtk10">,</span>',
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

		let _actual = renderViewLine(new RenderLineInput(
			false,
			lineText,
			false,
			0,
			lineParts,
			[],
			4,
			10,
			-1,
			'none',
			false
		));

		assert.equal(_actual.html, '<span>' + expectedOutput + '</span>');
		assertCharacterMapping(_actual.characterMapping, expectedOffsetsArr);
		assertPartLengths(_actual.characterMapping, [12, 12, 24, 1, 21, 2, 1, 20, 1, 1]);
	});

	test('issue #2255: Weird line rendering part 2', () => {
		let lineText = ' \t\t\tcursorStyle:\t\t\t\t\t\t(prevOpts.cursorStyle !== newOpts.cursorStyle),';

		let lineParts = [
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
		];
		let expectedOutput = [
			'<span class="mtk1">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>',
			'<span class="mtk2">cursorStyle:</span>',
			'<span class="mtk3">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>',
			'<span class="mtk4">(</span>',
			'<span class="mtk5">prevOpts.cursorStyle&nbsp;</span>',
			'<span class="mtk6">!=</span>',
			'<span class="mtk7">=</span>',
			'<span class="mtk8">&nbsp;newOpts.cursorStyle</span>',
			'<span class="mtk9">)</span>',
			'<span class="mtk10">,</span>',
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

		let _actual = renderViewLine(new RenderLineInput(
			false,
			lineText,
			false,
			0,
			lineParts,
			[],
			4,
			10,
			-1,
			'none',
			false
		));

		assert.equal(_actual.html, '<span>' + expectedOutput + '</span>');
		assertCharacterMapping(_actual.characterMapping, expectedOffsetsArr);
		assertPartLengths(_actual.characterMapping, [12, 12, 24, 1, 21, 2, 1, 20, 1, 1]);
	});

	test('issue Microsoft/monaco-editor#280: Improved source code rendering for RTL languages', () => {
		let lineText = 'var קודמות = \"מיותר קודמות צ\'ט של, אם לשון העברית שינויים ויש, אם\";';

		let lineParts = [
			createPart(3, 6),
			createPart(13, 1),
			createPart(66, 20),
			createPart(67, 1),
		];

		let expectedOutput = [
			'<span dir="ltr" class="mtk6">var</span>',
			'<span dir="ltr" class="mtk1">&nbsp;קודמות&nbsp;=&nbsp;</span>',
			'<span dir="ltr" class="mtk20">"מיותר&nbsp;קודמות&nbsp;צ\'ט&nbsp;של,&nbsp;אם&nbsp;לשון&nbsp;העברית&nbsp;שינויים&nbsp;ויש,&nbsp;אם"</span>',
			'<span dir="ltr" class="mtk1">;</span>'
		].join('');

		let _actual = renderViewLine(new RenderLineInput(
			false,
			lineText,
			true,
			0,
			lineParts,
			[],
			4,
			10,
			-1,
			'none',
			false
		));

		assert.equal(_actual.html, '<span>' + expectedOutput + '</span>');
		assert.equal(_actual.containsRTL, true);
	});

	test('issue #6885: Splits large tokens', () => {
		//                                                                                                                  1         1         1
		//                        1         2         3         4         5         6         7         8         9         0         1         2
		//               1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234
		let _lineText = 'This is just a long line that contains very interesting text. This is just a long line that contains very interesting text.';

		function assertSplitsTokens(message: string, lineText: string, expectedOutput: string[]): void {
			let lineParts = [createPart(lineText.length, 1)];
			let actual = renderViewLine(new RenderLineInput(
				false,
				lineText,
				false,
				0,
				lineParts,
				[],
				4,
				10,
				-1,
				'none',
				false
			));
			assert.equal(actual.html, '<span>' + expectedOutput.join('') + '</span>', message);
		}

		// A token with 49 chars
		{
			assertSplitsTokens(
				'49 chars',
				_lineText.substr(0, 49),
				[
					'<span class="mtk1">This&nbsp;is&nbsp;just&nbsp;a&nbsp;long&nbsp;line&nbsp;that&nbsp;contains&nbsp;very&nbsp;inter</span>',
				]
			);
		}

		// A token with 50 chars
		{
			assertSplitsTokens(
				'50 chars',
				_lineText.substr(0, 50),
				[
					'<span class="mtk1">This&nbsp;is&nbsp;just&nbsp;a&nbsp;long&nbsp;line&nbsp;that&nbsp;contains&nbsp;very&nbsp;intere</span>',
				]
			);
		}

		// A token with 51 chars
		{
			assertSplitsTokens(
				'51 chars',
				_lineText.substr(0, 51),
				[
					'<span class="mtk1">This&nbsp;is&nbsp;just&nbsp;a&nbsp;long&nbsp;line&nbsp;that&nbsp;contains&nbsp;very&nbsp;intere</span>',
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
					'<span class="mtk1">This&nbsp;is&nbsp;just&nbsp;a&nbsp;long&nbsp;line&nbsp;that&nbsp;contains&nbsp;very&nbsp;intere</span>',
					'<span class="mtk1">sting&nbsp;text.&nbsp;This&nbsp;is&nbsp;just&nbsp;a&nbsp;long&nbsp;line&nbsp;that&nbsp;contain</span>',
				]
			);
		}

		// A token with 100 chars
		{
			assertSplitsTokens(
				'100 chars',
				_lineText.substr(0, 100),
				[
					'<span class="mtk1">This&nbsp;is&nbsp;just&nbsp;a&nbsp;long&nbsp;line&nbsp;that&nbsp;contains&nbsp;very&nbsp;intere</span>',
					'<span class="mtk1">sting&nbsp;text.&nbsp;This&nbsp;is&nbsp;just&nbsp;a&nbsp;long&nbsp;line&nbsp;that&nbsp;contains</span>',
				]
			);
		}

		// A token with 101 chars
		{
			assertSplitsTokens(
				'101 chars',
				_lineText.substr(0, 101),
				[
					'<span class="mtk1">This&nbsp;is&nbsp;just&nbsp;a&nbsp;long&nbsp;line&nbsp;that&nbsp;contains&nbsp;very&nbsp;intere</span>',
					'<span class="mtk1">sting&nbsp;text.&nbsp;This&nbsp;is&nbsp;just&nbsp;a&nbsp;long&nbsp;line&nbsp;that&nbsp;contains</span>',
					'<span class="mtk1">&nbsp;</span>',
				]
			);
		}
	});

	test('issue #6885: Does not split large tokens in RTL text', () => {
		let lineText = 'את גרמנית בהתייחסות שמו, שנתי המשפט אל חפש, אם כתב אחרים ולחבר. של התוכן אודות בויקיפדיה כלל, של עזרה כימיה היא. על עמוד יוצרים מיתולוגיה סדר, אם שכל שתפו לעברית שינויים, אם שאלות אנגלית עזה. שמות בקלות מה סדר.';
		let lineParts = [createPart(lineText.length, 1)];
		let expectedOutput = [
			'<span dir="ltr" class="mtk1">את&nbsp;גרמנית&nbsp;בהתייחסות&nbsp;שמו,&nbsp;שנתי&nbsp;המשפט&nbsp;אל&nbsp;חפש,&nbsp;אם&nbsp;כתב&nbsp;אחרים&nbsp;ולחבר.&nbsp;של&nbsp;התוכן&nbsp;אודות&nbsp;בויקיפדיה&nbsp;כלל,&nbsp;של&nbsp;עזרה&nbsp;כימיה&nbsp;היא.&nbsp;על&nbsp;עמוד&nbsp;יוצרים&nbsp;מיתולוגיה&nbsp;סדר,&nbsp;אם&nbsp;שכל&nbsp;שתפו&nbsp;לעברית&nbsp;שינויים,&nbsp;אם&nbsp;שאלות&nbsp;אנגלית&nbsp;עזה.&nbsp;שמות&nbsp;בקלות&nbsp;מה&nbsp;סדר.</span>'
		];
		let actual = renderViewLine(new RenderLineInput(
			false,
			lineText,
			true,
			0,
			lineParts,
			[],
			4,
			10,
			-1,
			'none',
			false
		));
		assert.equal(actual.html, '<span>' + expectedOutput.join('') + '</span>');
		assert.equal(actual.containsRTL, true);
	});

	function assertCharacterMapping(actual: CharacterMapping, expected: number[][]): void {
		let charOffset = 0;
		for (let partIndex = 0; partIndex < expected.length; partIndex++) {
			let part = expected[partIndex];
			for (let i = 0; i < part.length; i++) {
				let charIndex = part[i];
				// here
				let _actualPartData = actual.charOffsetToPartData(charOffset);
				let actualPartIndex = CharacterMapping.getPartIndex(_actualPartData);
				let actualCharIndex = CharacterMapping.getCharIndex(_actualPartData);

				assert.deepEqual(
					{ partIndex: actualPartIndex, charIndex: actualCharIndex },
					{ partIndex: partIndex, charIndex: charIndex },
					`character mapping for offset ${charOffset}`
				);

				// here
				let actualOffset = actual.partDataToCharOffset(partIndex, part[part.length - 1] + 1, charIndex);

				assert.equal(
					actualOffset,
					charOffset,
					`character mapping for part ${partIndex}, ${charIndex}`
				);

				charOffset++;
			}
		}

		assert.equal(actual.length, charOffset);
	}

	function assertPartLengths(actual: CharacterMapping, expected: number[]): void {
		let _partLengths = actual.getPartLengths();
		let actualLengths: number[] = [];
		for (let i = 0; i < _partLengths.length; i++) {
			actualLengths[i] = _partLengths[i];
		}
		assert.deepEqual(actualLengths, expected, 'part lengths OK');
	}
});
