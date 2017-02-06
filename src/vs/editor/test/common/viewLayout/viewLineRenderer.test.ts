/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { renderViewLine, RenderLineInput, CharacterMapping } from 'vs/editor/common/viewLayout/viewLineRenderer';
import { ViewLineToken } from 'vs/editor/common/core/viewLineToken';
import { CharCode } from 'vs/base/common/charCode';

suite('viewLineRenderer.renderLine', () => {

	function createPart(endIndex: number, type: string): ViewLineToken {
		return new ViewLineToken(endIndex, type);
	}

	function assertCharacterReplacement(lineContent: string, tabSize: number, expected: string, expectedCharOffsetInPart: number[][], expectedPartLengts: number[]): void {
		let _actual = renderViewLine(new RenderLineInput(
			false,
			lineContent,
			false,
			0,
			[new ViewLineToken(lineContent.length, '')],
			[],
			tabSize,
			0,
			-1,
			'none',
			false
		));

		assert.equal(_actual.html, '<span><span class="">' + expected + '</span></span>');
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
		assertParts('x', 4, [createPart(1, 'y')], '<span class="y">x</span>', [[0, 1]], [1]);
		assertParts('x', 4, [createPart(1, 'aAbBzZ0123456789-cC')], '<span class="aAbBzZ0123456789-cC">x</span>', [[0, 1]], [1]);
		assertParts('x', 4, [createPart(1, '             ')], '<span class="             ">x</span>', [[0, 1]], [1]);
	});

	test('two parts', () => {
		assertParts('xy', 4, [createPart(1, 'a'), createPart(2, 'b')], '<span class="a">x</span><span class="b">y</span>', [[0], [0, 1]], [1, 1]);
		assertParts('xyz', 4, [createPart(1, 'a'), createPart(3, 'b')], '<span class="a">x</span><span class="b">yz</span>', [[0], [0, 1, 2]], [1, 2]);
		assertParts('xyz', 4, [createPart(2, 'a'), createPart(3, 'b')], '<span class="a">xy</span><span class="b">z</span>', [[0, 1], [0, 1]], [2, 1]);
	});

	test('overflow', () => {
		let _actual = renderViewLine(new RenderLineInput(
			false,
			'Hello world!',
			false,
			0,
			[
				createPart(1, '0'),
				createPart(2, '1'),
				createPart(3, '2'),
				createPart(4, '3'),
				createPart(5, '4'),
				createPart(6, '5'),
				createPart(7, '6'),
				createPart(8, '7'),
				createPart(9, '8'),
				createPart(10, '9'),
				createPart(11, '10'),
				createPart(12, '11'),
			],
			[],
			4,
			10,
			6,
			'boundary',
			false
		));

		let expectedOutput = [
			'<span class="0">H</span>',
			'<span class="1">e</span>',
			'<span class="2">l</span>',
			'<span class="3">l</span>',
			'<span class="4">o</span>',
			'<span class="5">&nbsp;</span>',
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
			createPart(5, 'block meta ts'),
			createPart(11, 'block declaration meta modifier object storage ts'),
			createPart(12, 'block declaration meta object ts'),
			createPart(17, 'block declaration meta object storage type ts'),
			createPart(18, 'block declaration meta object ts'),
			createPart(22, 'block class declaration entity meta name object ts'),
			createPart(23, 'block declaration meta object ts'),
			createPart(24, 'delimiter curly typescript'),
			createPart(25, 'block body declaration meta object ts'),
			createPart(28, 'block body comment declaration line meta object ts'),
			createPart(43, 'block body comment declaration line meta object ts detected-link'),
			createPart(48, 'block body comment declaration line meta object ts'),
		];
		let expectedOutput = [
			'<span class="vs-whitespace" style="width:40px">&rarr;&nbsp;&nbsp;&nbsp;</span>',
			'<span class="vs-whitespace" style="width:40px">&middot;&middot;&middot;&middot;</span>',
			'<span class="block declaration meta modifier object storage ts">export</span>',
			'<span class="block declaration meta object ts">&nbsp;</span>',
			'<span class="block declaration meta object storage type ts">class</span>',
			'<span class="block declaration meta object ts">&nbsp;</span>',
			'<span class="block class declaration entity meta name object ts">Game</span>',
			'<span class="block declaration meta object ts">&nbsp;</span>',
			'<span class="delimiter curly typescript">{</span>',
			'<span class="block body declaration meta object ts">&nbsp;</span>',
			'<span class="block body comment declaration line meta object ts">//&nbsp;</span>',
			'<span class="block body comment declaration line meta object ts detected-link">http://test.com</span>',
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
			createPart(3, 'block body decl declaration meta method object ts'), // 3 chars
			createPart(15, 'block body decl declaration member meta method object ts'), // 12 chars
			createPart(21, 'block body decl declaration member meta method object ts'), // 6 chars
			createPart(22, 'delimiter paren typescript'), // 1 char
			createPart(43, 'block body decl declaration member meta method object ts'), // 21 chars
			createPart(45, 'block body comparison decl declaration keyword member meta method object operator ts'), // 2 chars
			createPart(46, 'block body comparison decl declaration keyword member meta method object operator ts'), // 1 char
			createPart(66, 'block body decl declaration member meta method object ts'), // 20 chars
			createPart(67, 'delimiter paren typescript'), // 1 char
			createPart(68, 'block body decl declaration meta method object ts'), // 2 chars
		];
		let expectedOutput = [
			'<span class="block body decl declaration meta method object ts">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>',
			'<span class="block body decl declaration member meta method object ts">cursorStyle:</span>',
			'<span class="block body decl declaration member meta method object ts">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>',
			'<span class="delimiter paren typescript">(</span>',
			'<span class="block body decl declaration member meta method object ts">prevOpts.cursorStyle&nbsp;</span>',
			'<span class="block body comparison decl declaration keyword member meta method object operator ts">!=</span>',
			'<span class="block body comparison decl declaration keyword member meta method object operator ts">=</span>',
			'<span class="block body decl declaration member meta method object ts">&nbsp;newOpts.cursorStyle</span>',
			'<span class="delimiter paren typescript">)</span>',
			'<span class="block body decl declaration meta method object ts">,</span>',
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
			createPart(4, 'block body decl declaration meta method object ts'), // 4 chars
			createPart(16, 'block body decl declaration member meta method object ts'), // 12 chars
			createPart(22, 'block body decl declaration member meta method object ts'), // 6 chars
			createPart(23, 'delimiter paren typescript'), // 1 char
			createPart(44, 'block body decl declaration member meta method object ts'), // 21 chars
			createPart(46, 'block body comparison decl declaration keyword member meta method object operator ts'), // 2 chars
			createPart(47, 'block body comparison decl declaration keyword member meta method object operator ts'), // 1 char
			createPart(67, 'block body decl declaration member meta method object ts'), // 20 chars
			createPart(68, 'delimiter paren typescript'), // 1 char
			createPart(69, 'block body decl declaration meta method object ts'), // 2 chars
		];
		let expectedOutput = [
			'<span class="block body decl declaration meta method object ts">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>',
			'<span class="block body decl declaration member meta method object ts">cursorStyle:</span>',
			'<span class="block body decl declaration member meta method object ts">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>',
			'<span class="delimiter paren typescript">(</span>',
			'<span class="block body decl declaration member meta method object ts">prevOpts.cursorStyle&nbsp;</span>',
			'<span class="block body comparison decl declaration keyword member meta method object operator ts">!=</span>',
			'<span class="block body comparison decl declaration keyword member meta method object operator ts">=</span>',
			'<span class="block body decl declaration member meta method object ts">&nbsp;newOpts.cursorStyle</span>',
			'<span class="delimiter paren typescript">)</span>',
			'<span class="block body decl declaration meta method object ts">,</span>',
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
			createPart(3, 'mtk6'),
			createPart(13, 'mtk1'),
			createPart(66, 'mtk20'),
			createPart(67, 'mtk1'),
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
			let lineParts = [createPart(lineText.length, 'mtk1')];
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
		let lineParts = [createPart(lineText.length, 'mtk1')];
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
