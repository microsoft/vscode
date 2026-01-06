/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CharCode } from '../../../../base/common/charCode.js';
import * as strings from '../../../../base/common/strings.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { MetadataConsts } from '../../../common/encodedTokenAttributes.js';
import { IViewLineTokens } from '../../../common/tokens/lineTokens.js';
import { LineDecoration } from '../../../common/viewLayout/lineDecorations.js';
import { CharacterMapping, DomPosition, RenderLineInput, RenderLineOutput2, renderViewLine2 as renderViewLine } from '../../../common/viewLayout/viewLineRenderer.js';
import { TestLineToken, TestLineTokens } from '../core/testLineToken.js';
import { OffsetRange } from '../../../common/core/ranges/offsetRange.js';
import { InlineDecorationType } from '../../../common/viewModel/inlineDecorations.js';

function createViewLineTokens(viewLineTokens: TestLineToken[]): IViewLineTokens {
	return new TestLineTokens(viewLineTokens);
}

function createPart(endIndex: number, foreground: number): TestLineToken {
	return new TestLineToken(endIndex, (
		foreground << MetadataConsts.FOREGROUND_OFFSET
	) >>> 0);
}

function inflateRenderLineOutput(renderLineOutput: RenderLineOutput2) {
	// remove encompassing <span> to simplify test writing.
	let html = renderLineOutput.html;
	if (html.startsWith('<span>')) {
		html = html.replace(/^<span>/, '');
	}
	html = html.replace(/<\/span>$/, '');
	const spans: string[] = [];
	let lastIndex = 0;
	do {
		const newIndex = html.indexOf('<span', lastIndex + 1);
		if (newIndex === -1) {
			break;
		}
		spans.push(html.substring(lastIndex, newIndex));
		lastIndex = newIndex;
	} while (true);
	spans.push(html.substring(lastIndex));

	return {
		html: spans,
		mapping: renderLineOutput.characterMapping.inflate(),
	};
}

suite('viewLineRenderer.renderLine', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function assertCharacterReplacement(lineContent: string, tabSize: number, expected: string, expectedCharOffsetInPart: number[]): void {
		const _actual = renderViewLine(new RenderLineInput(
			false,
			true,
			lineContent,
			false,
			strings.isBasicASCII(lineContent),
			false,
			0,
			createViewLineTokens([new TestLineToken(lineContent.length, 0)]),
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

	function assertParts(lineContent: string, tabSize: number, parts: TestLineToken[], expected: string, info: CharacterMappingInfo[]): void {
		const _actual = renderViewLine(new RenderLineInput(
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
		const _actual = renderViewLine(new RenderLineInput(
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

		assert.deepStrictEqual(inflateRenderLineOutput(_actual), {
			html: [
				'<span class="mtk0">H</span>',
				'<span class="mtk1">e</span>',
				'<span class="mtk2">l</span>',
				'<span class="mtk3">l</span>',
				'<span class="mtk4">o</span>',
				'<span class="mtk5">\u00a0</span>',
				'<span class="mtkoverflow">Show more (6 chars)</span>'
			],
			mapping: [
				[0, 0, 0],
				[1, 0, 1],
				[2, 0, 2],
				[3, 0, 3],
				[4, 0, 4],
				[5, 0, 5],
				[5, 1, 6],
			]
		});
	});

	test('typical line', () => {
		const lineText = '\t    export class Game { // http://test.com     ';
		const lineParts = createViewLineTokens([
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

		assert.deepStrictEqual(inflateRenderLineOutput(_actual), {
			html: [
				'<span class="mtkz" style="width:40px">\u2192\u00a0\u00a0\u00a0</span>',
				'<span class="mtkz" style="width:40px">\u00b7\u200c\u00b7\u200c\u00b7\u200c\u00b7\u200c</span>',
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
				'<span class="mtkz" style="width:20px">\u00b7\u200c\u00b7\u200c</span>',
				'<span class="mtkz" style="width:30px">\u00b7\u200c\u00b7\u200c\u00b7\u200c</span>'
			],
			mapping: [
				[0, 0, 0],
				[1, 0, 4], [1, 2, 5], [1, 4, 6], [1, 6, 7],
				[2, 0, 8], [2, 1, 9], [2, 2, 10], [2, 3, 11], [2, 4, 12], [2, 5, 13],
				[3, 0, 14],
				[4, 0, 15], [4, 1, 16], [4, 2, 17], [4, 3, 18], [4, 4, 19],
				[5, 0, 20],
				[6, 0, 21], [6, 1, 22], [6, 2, 23], [6, 3, 24],
				[7, 0, 25],
				[8, 0, 26],
				[9, 0, 27],
				[10, 0, 28], [10, 1, 29], [10, 2, 30],
				[11, 0, 31], [11, 1, 32], [11, 2, 33], [11, 3, 34], [11, 4, 35], [11, 5, 36], [11, 6, 37], [11, 7, 38], [11, 8, 39], [11, 9, 40], [11, 10, 41], [11, 11, 42], [11, 12, 43], [11, 13, 44], [11, 14, 45],
				[12, 0, 46], [12, 2, 47],
				[13, 0, 48], [13, 2, 49], [13, 4, 50], [13, 6, 51],
			]
		});
	});

	test('issue #2255: Weird line rendering part 1', () => {
		const lineText = '\t\t\tcursorStyle:\t\t\t\t\t\t(prevOpts.cursorStyle !== newOpts.cursorStyle),';
		const lineParts = createViewLineTokens([
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

		assert.deepStrictEqual(inflateRenderLineOutput(_actual), {
			html: [
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
			],
			mapping: [
				[0, 0, 0], [0, 4, 4], [0, 8, 8],
				[1, 0, 12], [1, 1, 13], [1, 2, 14], [1, 3, 15], [1, 4, 16], [1, 5, 17], [1, 6, 18], [1, 7, 19], [1, 8, 20], [1, 9, 21], [1, 10, 22], [1, 11, 23],
				[2, 0, 24], [2, 4, 28], [2, 8, 32], [2, 12, 36], [2, 16, 40], [2, 20, 44],
				[3, 0, 48],
				[4, 0, 49], [4, 1, 50], [4, 2, 51], [4, 3, 52], [4, 4, 53], [4, 5, 54], [4, 6, 55], [4, 7, 56], [4, 8, 57], [4, 9, 58], [4, 10, 59], [4, 11, 60], [4, 12, 61], [4, 13, 62], [4, 14, 63], [4, 15, 64], [4, 16, 65], [4, 17, 66], [4, 18, 67], [4, 19, 68], [4, 20, 69],
				[5, 0, 70], [5, 1, 71],
				[6, 0, 72],
				[7, 0, 73], [7, 1, 74], [7, 2, 75], [7, 3, 76], [7, 4, 77], [7, 5, 78], [7, 6, 79], [7, 7, 80], [7, 8, 81], [7, 9, 82], [7, 10, 83], [7, 11, 84], [7, 12, 85], [7, 13, 86], [7, 14, 87], [7, 15, 88], [7, 16, 89], [7, 17, 90], [7, 18, 91], [7, 19, 92],
				[8, 0, 93],
				[9, 0, 94], [9, 1, 95],
			]
		});
	});

	test('issue #2255: Weird line rendering part 2', () => {
		const lineText = ' \t\t\tcursorStyle:\t\t\t\t\t\t(prevOpts.cursorStyle !== newOpts.cursorStyle),';

		const lineParts = createViewLineTokens([
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

		assert.deepStrictEqual(inflateRenderLineOutput(_actual), {
			html: [
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
			],
			mapping: [
				[0, 0, 0], [0, 1, 1], [0, 4, 4], [0, 8, 8],
				[1, 0, 12], [1, 1, 13], [1, 2, 14], [1, 3, 15], [1, 4, 16], [1, 5, 17], [1, 6, 18], [1, 7, 19], [1, 8, 20], [1, 9, 21], [1, 10, 22], [1, 11, 23],
				[2, 0, 24], [2, 4, 28], [2, 8, 32], [2, 12, 36], [2, 16, 40], [2, 20, 44],
				[3, 0, 48], [4, 0, 49], [4, 1, 50], [4, 2, 51], [4, 3, 52], [4, 4, 53], [4, 5, 54], [4, 6, 55], [4, 7, 56], [4, 8, 57], [4, 9, 58], [4, 10, 59], [4, 11, 60], [4, 12, 61], [4, 13, 62], [4, 14, 63], [4, 15, 64], [4, 16, 65], [4, 17, 66], [4, 18, 67], [4, 19, 68], [4, 20, 69],
				[5, 0, 70], [5, 1, 71],
				[6, 0, 72],
				[7, 0, 73], [7, 1, 74], [7, 2, 75], [7, 3, 76], [7, 4, 77], [7, 5, 78], [7, 6, 79], [7, 7, 80], [7, 8, 81], [7, 9, 82], [7, 10, 83], [7, 11, 84], [7, 12, 85], [7, 13, 86], [7, 14, 87], [7, 15, 88], [7, 16, 89], [7, 17, 90], [7, 18, 91], [7, 19, 92],
				[8, 0, 93],
				[9, 0, 94], [9, 1, 95],
			],
		});
	});

	test('issue #91178: after decoration type shown before cursor', () => {
		const lineText = '//just a comment';
		const lineParts = createViewLineTokens([
			createPart(16, 1)
		]);
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

		assert.deepStrictEqual(inflateRenderLineOutput(actual), ({
			html: [
				'<span class="mtk1">//just\u00a0a\u00a0com</span>',
				'<span class="mtk1 dec2"></span>',
				'<span class="mtk1 dec1"></span>',
				'<span class="mtk1">ment</span>',
			],
			mapping: [
				[0, 0, 0], [0, 1, 1], [0, 2, 2], [0, 3, 3], [0, 4, 4], [0, 5, 5], [0, 6, 6], [0, 7, 7], [0, 8, 8], [0, 9, 9], [0, 10, 10], [0, 11, 11],
				[2, 0, 12],
				[3, 1, 13], [3, 2, 14], [3, 3, 15], [3, 4, 16]
			]
		}));
	});

	test('issue microsoft/monaco-editor#280: Improved source code rendering for RTL languages', () => {
		const lineText = 'var קודמות = \"מיותר קודמות צ\'ט של, אם לשון העברית שינויים ויש, אם\";';
		const lineParts = createViewLineTokens([
			createPart(3, 6),
			createPart(13, 1),
			createPart(66, 20),
			createPart(67, 1),
		]);
		const _actual = renderViewLine(new RenderLineInput(
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

		assert.deepStrictEqual(inflateRenderLineOutput(_actual), ({
			html: [
				'<span dir="ltr">',
				'<span class="mtk6">var</span>',
				'<span style="unicode-bidi:isolate" class="mtk1">\u00a0קודמות\u00a0=\u00a0</span>',
				'<span style="unicode-bidi:isolate" class="mtk20">"מיותר\u00a0קודמות\u00a0צ\'ט\u00a0של,\u00a0אם\u00a0לשון\u00a0העברית\u00a0שינויים\u00a0ויש,\u00a0אם"</span>',
				'<span class="mtk1">;</span>',
			],
			mapping: [
				[0, 0, 0], [0, 1, 1], [0, 2, 2],
				[1, 0, 3], [1, 1, 4], [1, 2, 5], [1, 3, 6], [1, 4, 7], [1, 5, 8], [1, 6, 9], [1, 7, 10], [1, 8, 11], [1, 9, 12],
				[2, 0, 13], [2, 1, 14], [2, 2, 15], [2, 3, 16], [2, 4, 17], [2, 5, 18], [2, 6, 19], [2, 7, 20], [2, 8, 21], [2, 9, 22], [2, 10, 23], [2, 11, 24], [2, 12, 25], [2, 13, 26], [2, 14, 27], [2, 15, 28], [2, 16, 29], [2, 17, 30], [2, 18, 31], [2, 19, 32], [2, 20, 33], [2, 21, 34], [2, 22, 35], [2, 23, 36], [2, 24, 37], [2, 25, 38], [2, 26, 39], [2, 27, 40], [2, 28, 41], [2, 29, 42], [2, 30, 43], [2, 31, 44], [2, 32, 45], [2, 33, 46], [2, 34, 47], [2, 35, 48], [2, 36, 49], [2, 37, 50], [2, 38, 51], [2, 39, 52], [2, 40, 53], [2, 41, 54], [2, 42, 55], [2, 43, 56], [2, 44, 57], [2, 45, 58], [2, 46, 59], [2, 47, 60], [2, 48, 61], [2, 49, 62], [2, 50, 63], [2, 51, 64], [2, 52, 65],
				[3, 0, 66], [3, 1, 67]
			]
		}));
		assert.strictEqual(_actual.containsRTL, true);
	});

	test('issue #137036: Issue in RTL languages in recent versions', () => {
		const lineText = '<option value=\"العربية\">العربية</option>';
		const lineParts = createViewLineTokens([
			createPart(1, 2),
			createPart(7, 3),
			createPart(8, 4),
			createPart(13, 5),
			createPart(14, 4),
			createPart(23, 6),
			createPart(24, 2),
			createPart(31, 4),
			createPart(33, 2),
			createPart(39, 3),
			createPart(40, 2),
		]);
		const _actual = renderViewLine(new RenderLineInput(
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

		assert.deepStrictEqual(inflateRenderLineOutput(_actual), ({
			html: [
				'<span dir="ltr">',
				'<span class="mtk2">&lt;</span>',
				'<span class="mtk3">option</span>',
				'<span class="mtk4">\u00a0</span>',
				'<span class="mtk5">value</span>',
				'<span class="mtk4">=</span>',
				'<span style="unicode-bidi:isolate" class="mtk6">"العربية"</span>',
				'<span class="mtk2">&gt;</span>',
				'<span style="unicode-bidi:isolate" class="mtk4">العربية</span>',
				'<span class="mtk2">&lt;/</span>',
				'<span class="mtk3">option</span>',
				'<span class="mtk2">&gt;</span>',
			],
			mapping: [
				[0, 0, 0],
				[1, 0, 1], [1, 1, 2], [1, 2, 3], [1, 3, 4], [1, 4, 5], [1, 5, 6],
				[2, 0, 7],
				[3, 0, 8], [3, 1, 9], [3, 2, 10], [3, 3, 11], [3, 4, 12],
				[4, 0, 13],
				[5, 0, 14], [5, 1, 15], [5, 2, 16], [5, 3, 17], [5, 4, 18], [5, 5, 19], [5, 6, 20], [5, 7, 21], [5, 8, 22],
				[6, 0, 23],
				[7, 0, 24], [7, 1, 25], [7, 2, 26], [7, 3, 27], [7, 4, 28], [7, 5, 29], [7, 6, 30],
				[8, 0, 31], [8, 1, 32],
				[9, 0, 33], [9, 1, 34], [9, 2, 35], [9, 3, 36], [9, 4, 37], [9, 5, 38],
				[10, 0, 39], [10, 1, 40]
			]
		}));
		assert.strictEqual(_actual.containsRTL, true);
	});

	test('issue #99589: Rendering whitespace influences bidi layout', () => {
		const lineText = '    [\"🖨️ چاپ فاکتور\",\"🎨 تنظیمات\"]';
		const lineParts = createViewLineTokens([
			createPart(5, 2),
			createPart(21, 3),
			createPart(22, 2),
			createPart(34, 3),
			createPart(35, 2),
		]);
		const _actual = renderViewLine(new RenderLineInput(
			true,
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
			'all',
			false,
			false,
			null
		));

		assert.deepStrictEqual(inflateRenderLineOutput(_actual), ({
			html: [
				'<span dir="ltr">',
				'<span class="mtkw">\u00b7\u200c\u00b7\u200c\u00b7\u200c\u00b7\u200c</span>',
				'<span class="mtk2">[</span>',
				'<span style="unicode-bidi:isolate" class="mtk3">"🖨️\u00a0چاپ\u00a0فاکتور"</span>',
				'<span class="mtk2">,</span>',
				'<span style="unicode-bidi:isolate" class="mtk3">"🎨\u00a0تنظیمات"</span>',
				'<span class="mtk2">]</span>',
			],
			mapping: [
				[0, 0, 0], [0, 2, 1], [0, 4, 2], [0, 6, 3],
				[1, 0, 4],
				[2, 0, 5], [2, 1, 6], [2, 2, 7], [2, 3, 8], [2, 4, 9], [2, 5, 10], [2, 6, 11], [2, 7, 12], [2, 8, 13], [2, 9, 14], [2, 10, 15], [2, 11, 16], [2, 12, 17], [2, 13, 18], [2, 14, 19], [2, 15, 20],
				[3, 0, 21],
				[4, 0, 22], [4, 1, 23], [4, 2, 24], [4, 3, 25], [4, 4, 26], [4, 5, 27], [4, 6, 28], [4, 7, 29], [4, 8, 30], [4, 9, 31], [4, 10, 32], [4, 11, 33],
				[5, 0, 34], [5, 1, 35]
			]
		}));
		assert.strictEqual(_actual.containsRTL, true);
	});

	test('issue #6885: Splits large tokens', () => {
		//                                                                                                                  1         1         1
		//                        1         2         3         4         5         6         7         8         9         0         1         2
		//               1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234
		const _lineText = 'This is just a long line that contains very interesting text. This is just a long line that contains very interesting text.';

		function assertSplitsTokens(message: string, lineText: string, expectedOutput: string[]): void {
			const lineParts = createViewLineTokens([createPart(lineText.length, 1)]);
			const actual = renderViewLine(new RenderLineInput(
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
		const _lineText = 'This is just a long line that contains very interesting text. This is just a long line that contains very interesting text.';

		function assertSplitsTokens(message: string, lineText: string, expectedOutput: string[]): void {
			const lineParts = createViewLineTokens([createPart(lineText.length, 1)]);
			const actual = renderViewLine(new RenderLineInput(
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
		const lineText = 'a𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷';
		const lineParts = createViewLineTokens([createPart(lineText.length, 1)]);
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

		assert.deepStrictEqual(inflateRenderLineOutput(actual).html, [
			'<span class="mtk1">a𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷</span>',
		]);
	});

	test('issue #6885: Does not split large tokens in RTL text', () => {
		const lineText = 'את גרמנית בהתייחסות שמו, שנתי המשפט אל חפש, אם כתב אחרים ולחבר. של התוכן אודות בויקיפדיה כלל, של עזרה כימיה היא. על עמוד יוצרים מיתולוגיה סדר, אם שכל שתפו לעברית שינויים, אם שאלות אנגלית עזה. שמות בקלות מה סדר.';
		const lineParts = createViewLineTokens([createPart(lineText.length, 1)]);
		const actual = renderViewLine(new RenderLineInput(
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

		assert.deepStrictEqual(actual.html, [
			'<span dir="ltr">',
			'<span style="unicode-bidi:isolate" class="mtk1">את\u00a0גרמנית\u00a0בהתייחסות\u00a0שמו,\u00a0שנתי\u00a0המשפט\u00a0אל\u00a0חפש,\u00a0אם\u00a0כתב\u00a0אחרים\u00a0ולחבר.\u00a0של\u00a0התוכן\u00a0אודות\u00a0בויקיפדיה\u00a0כלל,\u00a0של\u00a0עזרה\u00a0כימיה\u00a0היא.\u00a0על\u00a0עמוד\u00a0יוצרים\u00a0מיתולוגיה\u00a0סדר,\u00a0אם\u00a0שכל\u00a0שתפו\u00a0לעברית\u00a0שינויים,\u00a0אם\u00a0שאלות\u00a0אנגלית\u00a0עזה.\u00a0שמות\u00a0בקלות\u00a0מה\u00a0סדר.</span>',
			'</span>'
		].join(''));
		assert.strictEqual(actual.containsRTL, true);
	});

	test('issue #95685: Uses unicode replacement character for Paragraph Separator', () => {
		const lineText = 'var ftext = [\u2029"Und", "dann", "eines"];';
		const lineParts = createViewLineTokens([createPart(lineText.length, 1)]);
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
		assert.deepStrictEqual(inflateRenderLineOutput(actual), ({
			html: [
				'<span class="mtk1">var\u00a0ftext\u00a0=\u00a0[\uFFFD"Und",\u00a0"dann",\u00a0"eines"];</span>'
			],
			mapping: [
				[0, 0, 0], [0, 1, 1], [0, 2, 2], [0, 3, 3], [0, 4, 4], [0, 5, 5], [0, 6, 6], [0, 7, 7],
				[0, 8, 8], [0, 9, 9], [0, 10, 10], [0, 11, 11], [0, 12, 12], [0, 13, 13], [0, 14, 14],
				[0, 15, 15], [0, 16, 16], [0, 17, 17], [0, 18, 18], [0, 19, 19], [0, 20, 20], [0, 21, 21],
				[0, 22, 22], [0, 23, 23], [0, 24, 24], [0, 25, 25], [0, 26, 26], [0, 27, 27], [0, 28, 28],
				[0, 29, 29], [0, 30, 30], [0, 31, 31], [0, 32, 32], [0, 33, 33], [0, 34, 34], [0, 35, 35],
				[0, 36, 36], [0, 37, 37], [0, 38, 38]
			]
		}));
	});

	test('issue #19673: Monokai Theme bad-highlighting in line wrap', () => {
		const lineText = '    MongoCallback<string>): void {';
		const lineParts = createViewLineTokens([
			createPart(17, 1),
			createPart(18, 2),
			createPart(24, 3),
			createPart(26, 4),
			createPart(27, 5),
			createPart(28, 6),
			createPart(32, 7),
			createPart(34, 8),
		]);
		const _actual = renderViewLine(new RenderLineInput(
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

		assert.deepStrictEqual(inflateRenderLineOutput(_actual), ({
			html: [
				'<span class="">\u00a0\u00a0\u00a0\u00a0</span>',
				'<span class="mtk1">MongoCallback</span>',
				'<span class="mtk2">&lt;</span>',
				'<span class="mtk3">string</span>',
				'<span class="mtk4">&gt;)</span>',
				'<span class="mtk5">:</span>',
				'<span class="mtk6">\u00a0</span>',
				'<span class="mtk7">void</span>',
				'<span class="mtk8">\u00a0{</span>'
			],
			mapping: [
				[0, 0, 0], [0, 1, 1], [0, 2, 2], [0, 3, 3],
				[1, 0, 4], [1, 1, 5], [1, 2, 6], [1, 3, 7], [1, 4, 8], [1, 5, 9], [1, 6, 10], [1, 7, 11], [1, 8, 12], [1, 9, 13], [1, 10, 14], [1, 11, 15], [1, 12, 16],
				[2, 0, 17],
				[3, 0, 18], [3, 1, 19], [3, 2, 20], [3, 3, 21], [3, 4, 22], [3, 5, 23],
				[4, 0, 24], [4, 1, 25],
				[5, 0, 26],
				[6, 0, 27],
				[7, 0, 28], [7, 1, 29], [7, 2, 30], [7, 3, 31],
				[8, 0, 32], [8, 1, 33], [8, 2, 34]
			]
		}));
	});
});

type CharacterMappingInfo = [number, [number, number]];

function assertCharacterMapping3(actual: CharacterMapping, expectedInfo: CharacterMappingInfo[]): void {
	for (let i = 0; i < expectedInfo.length; i++) {
		const [horizontalOffset, [partIndex, charIndex]] = expectedInfo[i];

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

		const actualHorizontalOffset = actual.getHorizontalOffset(i + 1);
		assert.strictEqual(actualHorizontalOffset, horizontalOffset, `actual.getHorizontalOffset(${i + 1})`);
	}

	assert.strictEqual(actual.length, expectedInfo.length, `length mismatch`);
}

suite('viewLineRenderer.renderLine 2', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function testCreateLineParts(fontIsMonospace: boolean, lineContent: string, tokens: TestLineToken[], fauxIndentLength: number, renderWhitespace: 'none' | 'boundary' | 'selection' | 'trailing' | 'all', selections: OffsetRange[] | null) {
		const actual = renderViewLine(new RenderLineInput(
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
		return inflateRenderLineOutput(actual);
	}

	test('issue #18616: Inline decorations ending at the text length are no longer rendered', () => {
		const lineContent = 'https://microsoft.com';
		const actual = renderViewLine(new RenderLineInput(
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

		assert.deepStrictEqual(inflateRenderLineOutput(actual), ({
			html: [
				'<span class="mtk3 link">https://microsoft.com</span>'
			],
			mapping: [
				[0, 0, 0], [0, 1, 1], [0, 2, 2], [0, 3, 3], [0, 4, 4], [0, 5, 5], [0, 6, 6], [0, 7, 7],
				[0, 8, 8], [0, 9, 9], [0, 10, 10], [0, 11, 11], [0, 12, 12], [0, 13, 13], [0, 14, 14],
				[0, 15, 15], [0, 16, 16], [0, 17, 17], [0, 18, 18], [0, 19, 19], [0, 20, 20], [0, 21, 21]
			]
		}));
	});

	test('issue #19207: Link in Monokai is not rendered correctly', () => {
		const lineContent = '\'let url = `http://***/_api/web/lists/GetByTitle(\\\'Teambuildingaanvragen\\\')/items`;\'';
		const actual = renderViewLine(new RenderLineInput(
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

		assert.deepStrictEqual(inflateRenderLineOutput(actual), ({
			html: [
				'<span class="mtk6">\'let\u00a0url\u00a0=\u00a0`</span>',
				'<span class="mtk6 detected-link">http://***/_api/web/lists/GetByTitle(</span>',
				'<span class="mtk4 detected-link">\\</span>',
				'<span class="mtk4">\'</span>',
				'<span class="mtk6">Teambuildingaanvragen</span>',
				'<span class="mtk4">\\\'</span>',
				'<span class="mtk6">)/items`;\'</span>',
			],
			mapping: [
				[0, 0, 0], [0, 1, 1], [0, 2, 2], [0, 3, 3], [0, 4, 4], [0, 5, 5], [0, 6, 6], [0, 7, 7], [0, 8, 8], [0, 9, 9], [0, 10, 10], [0, 11, 11],
				[1, 0, 12], [1, 1, 13], [1, 2, 14], [1, 3, 15], [1, 4, 16], [1, 5, 17], [1, 6, 18], [1, 7, 19], [1, 8, 20], [1, 9, 21], [1, 10, 22], [1, 11, 23], [1, 12, 24], [1, 13, 25], [1, 14, 26], [1, 15, 27], [1, 16, 28], [1, 17, 29], [1, 18, 30], [1, 19, 31], [1, 20, 32], [1, 21, 33], [1, 22, 34], [1, 23, 35], [1, 24, 36], [1, 25, 37], [1, 26, 38], [1, 27, 39], [1, 28, 40], [1, 29, 41], [1, 30, 42], [1, 31, 43], [1, 32, 44], [1, 33, 45], [1, 34, 46], [1, 35, 47], [1, 36, 48],
				[2, 0, 49],
				[3, 0, 50],
				[4, 0, 51], [4, 1, 52], [4, 2, 53], [4, 3, 54], [4, 4, 55], [4, 5, 56], [4, 6, 57], [4, 7, 58], [4, 8, 59], [4, 9, 60], [4, 10, 61], [4, 11, 62], [4, 12, 63], [4, 13, 64], [4, 14, 65], [4, 15, 66], [4, 16, 67], [4, 17, 68], [4, 18, 69], [4, 19, 70], [4, 20, 71],
				[5, 0, 72], [5, 1, 73],
				[6, 0, 74], [6, 1, 75], [6, 2, 76], [6, 3, 77], [6, 4, 78], [6, 5, 79], [6, 6, 80], [6, 7, 81], [6, 8, 82], [6, 9, 83], [6, 10, 84]
			]
		}));
	});

	test('createLineParts simple', () => {
		assert.deepStrictEqual(
			testCreateLineParts(
				false,
				'Hello world!',
				[
					createPart(12, 1)
				],
				0,
				'none',
				null
			),
			{
				html: [
					'<span class="mtk1">Hello\u00a0world!</span>'
				],
				mapping: [
					[0, 0, 0], [0, 1, 1], [0, 2, 2], [0, 3, 3], [0, 4, 4], [0, 5, 5], [0, 6, 6], [0, 7, 7], [0, 8, 8], [0, 9, 9], [0, 10, 10], [0, 11, 11], [0, 12, 12]
				]
			}
		);
	});

	test('createLineParts simple two tokens', () => {
		assert.deepStrictEqual(
			testCreateLineParts(
				false,
				'Hello world!',
				[
					createPart(6, 1),
					createPart(12, 2)
				],
				0,
				'none',
				null
			),
			{
				html: [
					'<span class="mtk1">Hello\u00a0</span>',
					'<span class="mtk2">world!</span>',
				],
				mapping: [
					[0, 0, 0], [0, 1, 1], [0, 2, 2], [0, 3, 3], [0, 4, 4], [0, 5, 5],
					[1, 0, 6], [1, 1, 7], [1, 2, 8], [1, 3, 9], [1, 4, 10], [1, 5, 11], [1, 6, 12]
				]
			}
		);
	});

	test('createLineParts render whitespace - 4 leading spaces', () => {
		assert.deepStrictEqual(
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
				null
			),
			{
				html: [
					'<span class="mtkz" style="width:40px">\u00b7\u200c\u00b7\u200c\u00b7\u200c\u00b7\u200c</span>',
					'<span class="mtk2">He</span>',
					'<span class="mtk3">llo\u00a0world!</span>',
					'<span class="mtkz" style="width:40px">\u00b7\u200c\u00b7\u200c\u00b7\u200c\u00b7\u200c</span>',
				],
				mapping: [
					[0, 0, 0], [0, 2, 1], [0, 4, 2], [0, 6, 3],
					[1, 0, 4], [1, 1, 5],
					[2, 0, 6], [2, 1, 7], [2, 2, 8], [2, 3, 9], [2, 4, 10], [2, 5, 11], [2, 6, 12], [2, 7, 13], [2, 8, 14], [2, 9, 15],
					[3, 0, 16], [3, 2, 17], [3, 4, 18], [3, 6, 19], [3, 8, 20]
				]
			}
		);
	});

	test('createLineParts render whitespace - 8 leading spaces', () => {
		assert.deepStrictEqual(
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
				null
			),
			{
				html: [
					'<span class="mtkz" style="width:40px">\u00b7\u200c\u00b7\u200c\u00b7\u200c\u00b7\u200c</span>',
					'<span class="mtkz" style="width:40px">\u00b7\u200c\u00b7\u200c\u00b7\u200c\u00b7\u200c</span>',
					'<span class="mtk2">He</span>',
					'<span class="mtk3">llo\u00a0world!</span>',
					'<span class="mtkz" style="width:40px">\u00b7\u200c\u00b7\u200c\u00b7\u200c\u00b7\u200c</span>',
					'<span class="mtkz" style="width:40px">\u00b7\u200c\u00b7\u200c\u00b7\u200c\u00b7\u200c</span>',
				],
				mapping: [
					[0, 0, 0], [0, 2, 1], [0, 4, 2], [0, 6, 3],
					[1, 0, 4], [1, 2, 5], [1, 4, 6], [1, 6, 7],
					[2, 0, 8], [2, 1, 9],
					[3, 0, 10], [3, 1, 11], [3, 2, 12], [3, 3, 13], [3, 4, 14], [3, 5, 15], [3, 6, 16], [3, 7, 17], [3, 8, 18], [3, 9, 19],
					[4, 0, 20], [4, 2, 21], [4, 4, 22], [4, 6, 23],
					[5, 0, 24], [5, 2, 25], [5, 4, 26], [5, 6, 27], [5, 8, 28]
				]
			}
		);
	});

	test('createLineParts render whitespace - 2 leading tabs', () => {
		assert.deepStrictEqual(
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
				null
			),
			{
				html: [
					'<span class="mtkz" style="width:40px">\u2192\u00a0\u00a0\u00a0</span>',
					'<span class="mtkz" style="width:40px">\u2192\u00a0\u00a0\u00a0</span>',
					'<span class="mtk2">He</span>',
					'<span class="mtk3">llo\u00a0world!</span>',
					'<span class="mtkz" style="width:40px">\u2192\u00a0\u00a0\u00a0</span>',
				],
				mapping: [
					[0, 0, 0],
					[1, 0, 4],
					[2, 0, 8], [2, 1, 9],
					[3, 0, 10], [3, 1, 11], [3, 2, 12], [3, 3, 13], [3, 4, 14], [3, 5, 15], [3, 6, 16], [3, 7, 17], [3, 8, 18], [3, 9, 19],
					[4, 0, 20], [4, 4, 24]
				]
			}
		);
	});

	test('createLineParts render whitespace - mixed leading spaces and tabs', () => {
		assert.deepStrictEqual(
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
				null
			),
			{
				html: [
					'<span class="mtkz" style="width:40px">\u00b7\u200c\u00b7\u200c\u2192\u00a0</span>',
					'<span class="mtkz" style="width:40px">\u2192\u00a0\u00a0\u00a0</span>',
					'<span class="mtkz" style="width:20px">\u00b7\u200c\u00b7\u200c</span>',
					'<span class="mtk2">He</span>',
					'<span class="mtk3">llo\u00a0world!</span>',
					'<span class="mtkz" style="width:20px">\u00b7\u200c\uffeb</span>',
					'<span class="mtkz" style="width:40px">\u00b7\u200c\u00b7\u200c\u2192\u00a0</span>',
					'<span class="mtkz" style="width:40px">\u00b7\u200c\u00b7\u200c\u00b7\u200c\uffeb</span>',
					'<span class="mtkz" style="width:40px">\u00b7\u200c\u00b7\u200c\u00b7\u200c\u00b7\u200c</span>',
				],
				mapping: [
					[0, 0, 0], [0, 2, 1], [0, 4, 2],
					[1, 0, 4],
					[2, 0, 8], [2, 2, 9],
					[3, 0, 10], [3, 1, 11],
					[4, 0, 12], [4, 1, 13], [4, 2, 14], [4, 3, 15], [4, 4, 16], [4, 5, 17], [4, 6, 18], [4, 7, 19], [4, 8, 20], [4, 9, 21],
					[5, 0, 22], [5, 2, 23],
					[6, 0, 24], [6, 2, 25], [6, 4, 26],
					[7, 0, 28], [7, 2, 29], [7, 4, 30], [7, 6, 31],
					[8, 0, 32], [8, 2, 33], [8, 4, 34], [8, 6, 35], [8, 8, 36]
				]
			}
		);
	});

	test('createLineParts render whitespace skips faux indent', () => {
		assert.deepStrictEqual(
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
				null
			),
			{
				html: [
					'<span class="">\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0</span>',
					'<span class="mtkz" style="width:20px">\u00b7\u200c\u00b7\u200c</span>',
					'<span class="mtk2">He</span>',
					'<span class="mtk3">llo\u00a0world!</span>',
					'<span class="mtkz" style="width:20px">\u00b7\u200c\uffeb</span>',
					'<span class="mtkz" style="width:40px">\u00b7\u200c\u00b7\u200c\u2192\u00a0</span>',
					'<span class="mtkz" style="width:40px">\u00b7\u200c\u00b7\u200c\u00b7\u200c\uffeb</span>',
					'<span class="mtkz" style="width:40px">\u00b7\u200c\u00b7\u200c\u00b7\u200c\u00b7\u200c</span>',
				],
				mapping: [
					[0, 0, 0], [0, 4, 4],
					[1, 0, 8], [1, 2, 9],
					[2, 0, 10], [2, 1, 11],
					[3, 0, 12], [3, 1, 13], [3, 2, 14], [3, 3, 15], [3, 4, 16], [3, 5, 17], [3, 6, 18], [3, 7, 19], [3, 8, 20], [3, 9, 21],
					[4, 0, 22], [4, 2, 23],
					[5, 0, 24], [5, 2, 25], [5, 4, 26],
					[6, 0, 28], [6, 2, 29], [6, 4, 30], [6, 6, 31],
					[7, 0, 32], [7, 2, 33], [7, 4, 34], [7, 6, 35], [7, 8, 36]
				]
			}
		);
	});

	test('createLineParts does not emit width for monospace fonts', () => {
		assert.deepStrictEqual(
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
				null
			),
			{
				html: [
					'<span class="">\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0</span>',
					'<span class="mtkw">\u00b7\u200c\u00b7\u200c</span>',
					'<span class="mtk2">He</span>',
					'<span class="mtk3">llo\u00a0world!</span>',
					'<span class="mtkw">\u00b7\u200c\uffeb\u00b7\u200c\u00b7\u200c\u2192\u00a0\u00b7\u200c\u00b7\u200c\u00b7\u200c\uffeb\u00b7\u200c\u00b7\u200c\u00b7\u200c\u00b7\u200c</span>',
				],
				mapping: [
					[0, 0, 0], [0, 4, 4],
					[1, 0, 8], [1, 2, 9],
					[2, 0, 10], [2, 1, 11],
					[3, 0, 12], [3, 1, 13], [3, 2, 14], [3, 3, 15], [3, 4, 16], [3, 5, 17], [3, 6, 18], [3, 7, 19], [3, 8, 20], [3, 9, 21],
					[4, 0, 22], [4, 2, 23], [4, 3, 24], [4, 5, 25], [4, 7, 26], [4, 9, 28], [4, 11, 29], [4, 13, 30], [4, 15, 31], [4, 16, 32], [4, 18, 33], [4, 20, 34], [4, 22, 35], [4, 24, 36]
				]
			}
		);
	});

	test('createLineParts render whitespace in middle but not for one space', () => {
		assert.deepStrictEqual(
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
				null
			),
			{
				html: [
					'<span class="mtk1">it</span>',
					'<span class="mtkz" style="width:20px">\u00b7\u200c\u00b7\u200c</span>',
					'<span class="mtk1">it</span>',
					'<span class="mtk2">\u00a0</span>',
					'<span class="mtk3">it</span>',
					'<span class="mtkz" style="width:20px">\u00b7\u200c\u00b7\u200c</span>',
					'<span class="mtk3">it</span>',
				],
				mapping: [
					[0, 0, 0], [0, 1, 1],
					[1, 0, 2], [1, 2, 3],
					[2, 0, 4], [2, 1, 5],
					[3, 0, 6],
					[4, 0, 7], [4, 1, 8],
					[5, 0, 9], [5, 2, 10],
					[6, 0, 11], [6, 1, 12], [6, 2, 13]
				]
			}
		);
	});

	test('createLineParts render whitespace for all in middle', () => {
		assert.deepStrictEqual(
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
				null
			),
			{
				html: [
					'<span class="mtkz" style="width:10px">\u00b7\u200c</span>',
					'<span class="mtk0">Hel</span>',
					'<span class="mtk1">lo</span>',
					'<span class="mtkz" style="width:10px">\u00b7\u200c</span>',
					'<span class="mtk2">world!</span>',
					'<span class="mtkz" style="width:30px">\u2192\u00a0\u00a0</span>',
				],
				mapping: [
					[0, 0, 0],
					[1, 0, 1], [1, 1, 2], [1, 2, 3],
					[2, 0, 4], [2, 1, 5],
					[3, 0, 6],
					[4, 0, 7], [4, 1, 8], [4, 2, 9], [4, 3, 10], [4, 4, 11], [4, 5, 12],
					[5, 0, 13], [5, 3, 16]
				]
			}
		);
	});

	test('createLineParts render whitespace for selection with no selections', () => {
		assert.deepStrictEqual(
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
				null
			),
			{
				html: [
					'<span class="mtk0">\u00a0Hel</span>',
					'<span class="mtk1">lo</span>',
					'<span class="mtk2">\u00a0world!\u00a0\u00a0\u00a0</span>',
				],
				mapping: [
					[0, 0, 0], [0, 1, 1], [0, 2, 2], [0, 3, 3],
					[1, 0, 4], [1, 1, 5],
					[2, 0, 6], [2, 1, 7], [2, 2, 8], [2, 3, 9], [2, 4, 10], [2, 5, 11], [2, 6, 12], [2, 7, 13], [2, 10, 16]
				]
			}
		);
	});

	test('createLineParts render whitespace for selection with whole line selection', () => {
		assert.deepStrictEqual(
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
				[new OffsetRange(0, 14)]
			),
			{
				html: [
					'<span class="mtkz" style="width:10px">\u00b7\u200c</span>',
					'<span class="mtk0">Hel</span>',
					'<span class="mtk1">lo</span>',
					'<span class="mtkz" style="width:10px">\u00b7\u200c</span>',
					'<span class="mtk2">world!</span>',
					'<span class="mtkz" style="width:30px">\u2192\u00a0\u00a0</span>',
				],
				mapping: [
					[0, 0, 0],
					[1, 0, 1], [1, 1, 2], [1, 2, 3],
					[2, 0, 4], [2, 1, 5],
					[3, 0, 6],
					[4, 0, 7], [4, 1, 8], [4, 2, 9], [4, 3, 10], [4, 4, 11], [4, 5, 12],
					[5, 0, 13], [5, 3, 16]
				]
			}
		);
	});

	test('createLineParts render whitespace for selection with selection spanning part of whitespace', () => {
		assert.deepStrictEqual(
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
				[new OffsetRange(0, 5)]
			),
			{
				html: [
					'<span class="mtkz" style="width:10px">\u00b7\u200c</span>',
					'<span class="mtk0">Hel</span>',
					'<span class="mtk1">lo</span>',
					'<span class="mtk2">\u00a0world!\u00a0\u00a0\u00a0</span>',
				],
				mapping: [
					[0, 0, 0],
					[1, 0, 1], [1, 1, 2], [1, 2, 3],
					[2, 0, 4], [2, 1, 5],
					[3, 0, 6], [3, 1, 7], [3, 2, 8], [3, 3, 9], [3, 4, 10], [3, 5, 11], [3, 6, 12], [3, 7, 13], [3, 10, 16]
				]
			}
		);
	});

	test('createLineParts render whitespace for selection with multiple selections', () => {
		assert.deepStrictEqual(
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
				[new OffsetRange(0, 5), new OffsetRange(9, 14)]
			),
			{
				html: [
					'<span class="mtkz" style="width:10px">\u00b7\u200c</span>',
					'<span class="mtk0">Hel</span>',
					'<span class="mtk1">lo</span>',
					'<span class="mtk2">\u00a0world!</span>',
					'<span class="mtkz" style="width:30px">\u2192\u00a0\u00a0</span>',
				],
				mapping: [
					[0, 0, 0],
					[1, 0, 1], [1, 1, 2], [1, 2, 3],
					[2, 0, 4], [2, 1, 5],
					[3, 0, 6], [3, 1, 7], [3, 2, 8], [3, 3, 9], [3, 4, 10], [3, 5, 11], [3, 6, 12],
					[4, 0, 13], [4, 3, 16]
				]
			}
		);
	});

	test('createLineParts render whitespace for selection with multiple, initially unsorted selections', () => {
		assert.deepStrictEqual(
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
				[new OffsetRange(9, 14), new OffsetRange(0, 5)]
			),
			{
				html: [
					'<span class="mtkz" style="width:10px">\u00b7\u200c</span>',
					'<span class="mtk0">Hel</span>',
					'<span class="mtk1">lo</span>',
					'<span class="mtk2">\u00a0world!</span>',
					'<span class="mtkz" style="width:30px">\u2192\u00a0\u00a0</span>',
				],
				mapping: [
					[0, 0, 0],
					[1, 0, 1], [1, 1, 2], [1, 2, 3],
					[2, 0, 4], [2, 1, 5],
					[3, 0, 6], [3, 1, 7], [3, 2, 8], [3, 3, 9], [3, 4, 10], [3, 5, 11], [3, 6, 12],
					[4, 0, 13], [4, 3, 16]
				]
			}
		);
	});

	test('createLineParts render whitespace for selection with selections next to each other', () => {
		assert.deepStrictEqual(
			testCreateLineParts(
				false,
				' * S',
				[
					createPart(4, 0)
				],
				0,
				'selection',
				[new OffsetRange(0, 1), new OffsetRange(1, 2), new OffsetRange(2, 3)]
			),
			{
				html: [
					'<span class="mtkz" style="width:10px">\u00b7\u200c</span>',
					'<span class="mtk0">*</span>',
					'<span class="mtkz" style="width:10px">\u00b7\u200c</span>',
					'<span class="mtk0">S</span>',
				],
				mapping: [
					[0, 0, 0],
					[1, 0, 1],
					[2, 0, 2],
					[3, 0, 3], [3, 1, 4]
				]
			}
		);
	});

	test('createLineParts render whitespace for trailing with leading, inner, and without trailing whitespace', () => {
		assert.deepStrictEqual(
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
				null
			),
			{
				html: [
					'<span class="mtk0">\u00a0Hel</span>',
					'<span class="mtk1">lo</span>',
					'<span class="mtk2">\u00a0world!</span>',
				],
				mapping: [
					[0, 0, 0], [0, 1, 1], [0, 2, 2], [0, 3, 3],
					[1, 0, 4], [1, 1, 5],
					[2, 0, 6], [2, 1, 7], [2, 2, 8], [2, 3, 9], [2, 4, 10], [2, 5, 11], [2, 6, 12], [2, 7, 13]
				]
			}
		);
	});

	test('createLineParts render whitespace for trailing with leading, inner, and trailing whitespace', () => {
		assert.deepStrictEqual(
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
				null
			),
			{
				html: [
					'<span class="mtk0">\u00a0Hel</span>',
					'<span class="mtk1">lo</span>',
					'<span class="mtk2">\u00a0world!</span>',
					'<span class="mtkz" style="width:30px">\u00b7\u200c\u2192\u00a0</span>',
				],
				mapping: [
					[0, 0, 0], [0, 1, 1], [0, 2, 2], [0, 3, 3],
					[1, 0, 4], [1, 1, 5],
					[2, 0, 6], [2, 1, 7], [2, 2, 8], [2, 3, 9], [2, 4, 10], [2, 5, 11], [2, 6, 12],
					[3, 0, 13], [3, 2, 14], [3, 4, 16]
				]
			}
		);
	});

	test('createLineParts render whitespace for trailing with 8 leading and 8 trailing whitespaces', () => {
		assert.deepStrictEqual(
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
				null
			),
			{
				html: [
					'<span class="mtk1">\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0</span>',
					'<span class="mtk2">He</span>',
					'<span class="mtk3">llo\u00a0world!</span>',
					'<span class="mtkz" style="width:40px">\u00b7\u200c\u00b7\u200c\u00b7\u200c\u00b7\u200c</span>',
					'<span class="mtkz" style="width:40px">\u00b7\u200c\u00b7\u200c\u00b7\u200c\u00b7\u200c</span>',
				],
				mapping: [
					[0, 0, 0], [0, 1, 1], [0, 2, 2], [0, 3, 3], [0, 4, 4], [0, 5, 5], [0, 6, 6], [0, 7, 7],
					[1, 0, 8], [1, 1, 9],
					[2, 0, 10], [2, 1, 11], [2, 2, 12], [2, 3, 13], [2, 4, 14], [2, 5, 15], [2, 6, 16], [2, 7, 17], [2, 8, 18], [2, 9, 19],
					[3, 0, 20], [3, 2, 21], [3, 4, 22], [3, 6, 23],
					[4, 0, 24], [4, 2, 25], [4, 4, 26], [4, 6, 27], [4, 8, 28]
				]
			}
		);
	});

	test('createLineParts render whitespace for trailing with line containing only whitespaces', () => {
		assert.deepStrictEqual(
			testCreateLineParts(
				false,
				' \t ',
				[
					createPart(2, 0),
					createPart(3, 1),
				],
				0,
				'trailing',
				null
			),
			{
				html: [
					'<span class="mtkz" style="width:40px">\u00b7\u200c\u2192\u00a0\u00a0</span>',
					'<span class="mtkz" style="width:10px">\u00b7\u200c</span>',
				],
				mapping: [
					[0, 0, 0], [0, 2, 1],
					[1, 0, 4], [1, 2, 5]
				]
			}
		);
	});

	test('createLineParts can handle unsorted inline decorations', () => {
		const actual = renderViewLine(new RenderLineInput(
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

		assert.deepStrictEqual(inflateRenderLineOutput(actual), {
			html: [
				'<span class="mtk0 b">H</span>',
				'<span class="mtk0 b c">e</span>',
				'<span class="mtk0 c">ll</span>',
				'<span class="mtk0 a c">o\u00a0</span>',
				'<span class="mtk0 c">w</span>',
				'<span class="mtk0">orld</span>',
			],
			mapping: [
				[0, 0, 0],
				[1, 0, 1],
				[2, 0, 2], [2, 1, 3],
				[3, 0, 4], [3, 1, 5],
				[4, 0, 6],
				[5, 0, 7], [5, 1, 8], [5, 2, 9], [5, 3, 10], [5, 4, 11]
			]
		});
	});

	test('issue #11485: Visible whitespace conflicts with before decorator attachment', () => {

		const lineContent = '\tbla';

		const actual = renderViewLine(new RenderLineInput(
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

		assert.deepStrictEqual(inflateRenderLineOutput(actual), {
			html: [
				'<span class="mtkw before">\u2192\u00a0\u00a0\u00a0</span>',
				'<span class="mtk3">bla</span>',
			],
			mapping: [
				[0, 0, 0],
				[1, 0, 4], [1, 1, 5], [1, 2, 6], [1, 3, 7]
			]
		});
	});

	test('issue #32436: Non-monospace font + visible whitespace + After decorator causes line to "jump"', () => {

		const lineContent = '\tbla';

		const actual = renderViewLine(new RenderLineInput(
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

		assert.deepStrictEqual(inflateRenderLineOutput(actual), {
			html: [
				'<span class="mtkz" style="width:40px">\u2192\u00a0\u00a0\u00a0</span>',
				'<span class="mtk3 before">b</span>',
				'<span class="mtk3">la</span>',
			],
			mapping: [
				[0, 0, 0],
				[1, 0, 4],
				[2, 0, 5], [2, 1, 6], [2, 2, 7]
			]
		});
	});

	test('issue #30133: Empty lines don\'t render inline decorations', () => {

		const lineContent = '';

		const actual = renderViewLine(new RenderLineInput(
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

		assert.deepStrictEqual(inflateRenderLineOutput(actual), {
			html: [
				'<span class="before"></span>',
			],
			mapping: [
				[1, 0, 0]
			]
		});
	});

	test('issue #37208: Collapsing bullet point containing emoji in Markdown document results in [??] character', () => {

		const actual = renderViewLine(new RenderLineInput(
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

		assert.deepStrictEqual(inflateRenderLineOutput(actual), {
			html: [
				'<span class="mtk3">\u00a0\u00a01.\u00a0</span>',
				'<span class="mtk3 inline-folded">🙏</span>',
			],
			mapping: [
				[0, 0, 0], [0, 1, 1], [0, 2, 2], [0, 3, 3], [0, 4, 4],
				[1, 0, 5], [1, 1, 6], [1, 2, 7]
			]
		});
	});

	test('issue #37401 #40127: Allow both before and after decorations on empty line', () => {

		const actual = renderViewLine(new RenderLineInput(
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

		assert.deepStrictEqual(inflateRenderLineOutput(actual), {
			html: [
				'<span class="before"></span>',
				'<span class="after"></span>',
			],
			mapping: [
				[1, 0, 0]
			]
		});
	});

	test('issue #118759: enable multiple text editor decorations in empty lines', () => {

		const actual = renderViewLine(new RenderLineInput(
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

		assert.deepStrictEqual(inflateRenderLineOutput(actual), {
			html: [
				'<span class="before1"></span>',
				'<span class="before2"></span>',
				'<span class="after1"></span>',
				'<span class="after2"></span>',
			],
			mapping: [
				[2, 0, 0]
			]
		});
	});

	test('issue #38935: GitLens end-of-line blame no longer rendering', () => {

		const actual = renderViewLine(new RenderLineInput(
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

		assert.deepStrictEqual(inflateRenderLineOutput(actual), {
			html: [
				'<span class="mtk3">\u00a0\u00a0\u00a0\u00a0}</span>',
				'<span class="ced-TextEditorDecorationType2-5e9b9b3f-3 ced-TextEditorDecorationType2-3"></span>',
				'<span class="ced-TextEditorDecorationType2-5e9b9b3f-4 ced-TextEditorDecorationType2-4"></span>',
			],
			mapping: [
				[0, 0, 0], [0, 4, 4],
				[2, 0, 5]
			]
		});
	});

	test('issue #136622: Inline decorations are not rendering on non-ASCII lines when renderControlCharacters is on', () => {

		const actual = renderViewLine(new RenderLineInput(
			true,
			true,
			'some text £',
			false,
			false,
			false,
			0,
			createViewLineTokens([createPart(11, 3)]),
			[
				new LineDecoration(5, 5, 'inlineDec1', InlineDecorationType.After),
				new LineDecoration(6, 6, 'inlineDec2', InlineDecorationType.Before),
			],
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

		assert.deepStrictEqual(inflateRenderLineOutput(actual), {
			html: [
				'<span class="mtk3">some</span>',
				'<span class="mtk3 inlineDec1"></span>',
				'<span class="mtk3">\u00a0</span>',
				'<span class="mtk3 inlineDec2"></span>',
				'<span class="mtk3">text\u00a0£</span>',
			],
			mapping: [
				[0, 0, 0], [0, 1, 1], [0, 2, 2], [0, 3, 3],
				[1, 0, 4],
				[4, 0, 5], [4, 1, 6], [4, 2, 7], [4, 3, 8], [4, 4, 9], [4, 5, 10], [4, 6, 11]
			]
		});
	});

	test('issue #22832: Consider fullwidth characters when rendering tabs', () => {

		const actual = renderViewLine(new RenderLineInput(
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

		assert.deepStrictEqual(inflateRenderLineOutput(actual), {
			html: [
				'<span class="mtk3">asd\u00a0=\u00a0"擦"\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0#asd</span>',
			],
			mapping: [
				[0, 0, 0], [0, 1, 1], [0, 2, 2], [0, 3, 3], [0, 4, 4], [0, 5, 5], [0, 6, 6], [0, 7, 7], [0, 8, 9],
				[0, 9, 10], [0, 11, 12], [0, 15, 16], [0, 16, 17], [0, 17, 18], [0, 18, 19], [0, 19, 20]
			]
		});
	});

	test('issue #22832: Consider fullwidth characters when rendering tabs (render whitespace)', () => {

		const actual = renderViewLine(new RenderLineInput(
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

		assert.deepStrictEqual(inflateRenderLineOutput(actual), {
			html: [
				'<span class="mtk3">asd</span>',
				'<span class="mtkw">\u00b7\u200c</span>',
				'<span class="mtk3">=</span>',
				'<span class="mtkw">\u00b7\u200c</span>',
				'<span class="mtk3">"擦"</span>',
				'<span class="mtkw">\u2192\u00a0\u2192\u00a0\u00a0\u00a0</span>',
				'<span class="mtk3">#asd</span>',
			],
			mapping: [
				[0, 0, 0], [0, 1, 1], [0, 2, 2],
				[1, 0, 3],
				[2, 0, 4],
				[3, 0, 5],
				[4, 0, 6], [4, 1, 7], [4, 2, 9],
				[5, 0, 10], [5, 2, 12],
				[6, 0, 16], [6, 1, 17], [6, 2, 18], [6, 3, 19], [6, 4, 20]
			]
		});
	});

	test('issue #22352: COMBINING ACUTE ACCENT (U+0301)', () => {

		const actual = renderViewLine(new RenderLineInput(
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

		assert.deepStrictEqual(inflateRenderLineOutput(actual), {
			html: [
				'<span class="mtk3">12345689012345678901234568901234567890123456890abába</span>',
			],
			mapping: [
				[0, 0, 0], [0, 1, 1], [0, 2, 2], [0, 3, 3], [0, 4, 4], [0, 5, 5], [0, 6, 6], [0, 7, 7],
				[0, 8, 8], [0, 9, 9], [0, 10, 10], [0, 11, 11], [0, 12, 12], [0, 13, 13], [0, 14, 14],
				[0, 15, 15], [0, 16, 16], [0, 17, 17], [0, 18, 18], [0, 19, 19], [0, 20, 20], [0, 21, 21],
				[0, 22, 22], [0, 23, 23], [0, 24, 24], [0, 25, 25], [0, 26, 26], [0, 27, 27], [0, 28, 28],
				[0, 29, 29], [0, 30, 30], [0, 31, 31], [0, 32, 32], [0, 33, 33], [0, 34, 34], [0, 35, 35],
				[0, 36, 36], [0, 37, 37], [0, 38, 38], [0, 39, 39], [0, 40, 40], [0, 41, 41], [0, 42, 42],
				[0, 43, 43], [0, 44, 44], [0, 45, 45], [0, 46, 46], [0, 47, 47], [0, 48, 48], [0, 49, 49],
				[0, 50, 50], [0, 51, 51], [0, 52, 52], [0, 53, 53]
			]
		});
	});

	test('issue #22352: Partially Broken Complex Script Rendering of Tamil', () => {

		const actual = renderViewLine(new RenderLineInput(
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

		assert.deepStrictEqual(inflateRenderLineOutput(actual), {
			html: [
				'<span class="mtk3">\u00a0JoyShareல்\u00a0பின்தொடர்ந்து,\u00a0விடீயோ,\u00a0ஜோக்குகள்,\u00a0</span>',
				'<span class="mtk3">அனிமேசன்,\u00a0நகைச்சுவை\u00a0படங்கள்\u00a0மற்றும்\u00a0செய்திகளை\u00a0</span>',
				'<span class="mtk3">பெறுவீர்</span>',
			],
			mapping: [
				[0, 0, 0], [0, 1, 1], [0, 2, 2], [0, 3, 3], [0, 4, 4], [0, 5, 5], [0, 6, 6], [0, 7, 7],
				[0, 8, 8], [0, 9, 9], [0, 10, 10], [0, 11, 11], [0, 12, 12], [0, 13, 13], [0, 14, 14],
				[0, 15, 15], [0, 16, 16], [0, 17, 17], [0, 18, 18], [0, 19, 19], [0, 20, 20], [0, 21, 21],
				[0, 22, 22], [0, 23, 23], [0, 24, 24], [0, 25, 25], [0, 26, 26], [0, 27, 27], [0, 28, 28],
				[0, 29, 29], [0, 30, 30], [0, 31, 31], [0, 32, 32], [0, 33, 33], [0, 34, 34], [0, 35, 35],
				[0, 36, 36], [0, 37, 37], [0, 38, 38], [0, 39, 39], [0, 40, 40], [0, 41, 41], [0, 42, 42],
				[0, 43, 43], [0, 44, 44], [0, 45, 45],
				[1, 0, 46], [1, 1, 47], [1, 2, 48], [1, 3, 49], [1, 4, 50], [1, 5, 51], [1, 6, 52], [1, 7, 53],
				[1, 8, 54], [1, 9, 55], [1, 10, 56], [1, 11, 57], [1, 12, 58], [1, 13, 59], [1, 14, 60], [1, 15, 61],
				[1, 16, 62], [1, 17, 63], [1, 18, 64], [1, 19, 65], [1, 20, 66], [1, 21, 67], [1, 22, 68], [1, 23, 69],
				[1, 24, 70], [1, 25, 71], [1, 26, 72], [1, 27, 73], [1, 28, 74], [1, 29, 75], [1, 30, 76], [1, 31, 77],
				[1, 32, 78], [1, 33, 79], [1, 34, 80], [1, 35, 81], [1, 36, 82], [1, 37, 83], [1, 38, 84], [1, 39, 85],
				[1, 40, 86], [1, 41, 87], [1, 42, 88], [1, 43, 89], [1, 44, 90], [1, 45, 91],
				[2, 0, 92], [2, 1, 93], [2, 2, 94], [2, 3, 95], [2, 4, 96], [2, 5, 97], [2, 6, 98], [2, 7, 99], [2, 8, 100]
			]
		});
	});

	test('issue #42700: Hindi characters are not being rendered properly', () => {

		const actual = renderViewLine(new RenderLineInput(
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

		assert.deepStrictEqual(inflateRenderLineOutput(actual), {
			html: [
				'<span class="mtk3">\u00a0वो\u00a0ऐसा\u00a0क्या\u00a0है\u00a0जो\u00a0हमारे\u00a0अंदर\u00a0भी\u00a0है\u00a0और\u00a0बाहर\u00a0भी\u00a0है।\u00a0</span>',
				'<span class="mtk3">जिसकी\u00a0वजह\u00a0से\u00a0हम\u00a0सब\u00a0हैं।\u00a0जिसने\u00a0इस\u00a0सृष्टि\u00a0की\u00a0रचना\u00a0की\u00a0</span>',
				'<span class="mtk3">है।</span>',
			],
			mapping: [
				[0, 0, 0], [0, 1, 1], [0, 2, 2], [0, 3, 3], [0, 4, 4], [0, 5, 5], [0, 6, 6], [0, 7, 7],
				[0, 8, 8], [0, 9, 9], [0, 10, 10], [0, 11, 11], [0, 12, 12], [0, 13, 13], [0, 14, 14],
				[0, 15, 15], [0, 16, 16], [0, 17, 17], [0, 18, 18], [0, 19, 19], [0, 20, 20], [0, 21, 21],
				[0, 22, 22], [0, 23, 23], [0, 24, 24], [0, 25, 25], [0, 26, 26], [0, 27, 27], [0, 28, 28],
				[0, 29, 29], [0, 30, 30], [0, 31, 31], [0, 32, 32], [0, 33, 33], [0, 34, 34], [0, 35, 35],
				[0, 36, 36], [0, 37, 37], [0, 38, 38], [0, 39, 39], [0, 40, 40], [0, 41, 41], [0, 42, 42],
				[0, 43, 43], [0, 44, 44], [0, 45, 45], [0, 46, 46], [0, 47, 47], [0, 48, 48], [0, 49, 49],
				[0, 50, 50],
				[1, 0, 51], [1, 1, 52], [1, 2, 53], [1, 3, 54], [1, 4, 55], [1, 5, 56], [1, 6, 57], [1, 7, 58],
				[1, 8, 59], [1, 9, 60], [1, 10, 61], [1, 11, 62], [1, 12, 63], [1, 13, 64], [1, 14, 65],
				[1, 15, 66], [1, 16, 67], [1, 17, 68], [1, 18, 69], [1, 19, 70], [1, 20, 71], [1, 21, 72],
				[1, 22, 73], [1, 23, 74], [1, 24, 75], [1, 25, 76], [1, 26, 77], [1, 27, 78], [1, 28, 79],
				[1, 29, 80], [1, 30, 81], [1, 31, 82], [1, 32, 83], [1, 33, 84], [1, 34, 85], [1, 35, 86],
				[1, 36, 87], [1, 37, 88], [1, 38, 89], [1, 39, 90], [1, 40, 91], [1, 41, 92], [1, 42, 93],
				[1, 43, 94], [1, 44, 95], [1, 45, 96], [1, 46, 97], [1, 47, 98], [1, 48, 99], [1, 49, 100],
				[1, 50, 101], [2, 0, 102], [2, 1, 103], [2, 2, 104], [2, 3, 105]
			]
		});
	});

	test('issue #38123: editor.renderWhitespace: "boundary" renders whitespace at line wrap point when line is wrapped', () => {
		const actual = renderViewLine(new RenderLineInput(
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

		assert.deepStrictEqual(inflateRenderLineOutput(actual), {
			html: [
				'<span class="mtk3">This\u00a0is\u00a0a\u00a0long\u00a0line\u00a0which\u00a0never\u00a0uses\u00a0more\u00a0than\u00a0two</span>',
				'<span class="mtk3">\u00a0spaces.</span>',
				'<span class="mtk3">\u00a0</span>',
			],
			mapping: [
				[0, 0, 0], [0, 1, 1], [0, 2, 2], [0, 3, 3], [0, 4, 4], [0, 5, 5], [0, 6, 6], [0, 7, 7],
				[0, 8, 8], [0, 9, 9], [0, 10, 10], [0, 11, 11], [0, 12, 12], [0, 13, 13], [0, 14, 14],
				[0, 15, 15], [0, 16, 16], [0, 17, 17], [0, 18, 18], [0, 19, 19], [0, 20, 20], [0, 21, 21],
				[0, 22, 22], [0, 23, 23], [0, 24, 24], [0, 25, 25], [0, 26, 26], [0, 27, 27], [0, 28, 28],
				[0, 29, 29], [0, 30, 30], [0, 31, 31], [0, 32, 32], [0, 33, 33], [0, 34, 34], [0, 35, 35],
				[0, 36, 36], [0, 37, 37], [0, 38, 38], [0, 39, 39], [0, 40, 40], [0, 41, 41], [0, 42, 42],
				[0, 43, 43], [0, 44, 44], [0, 45, 45], [0, 46, 46], [0, 47, 47], [0, 48, 48], [0, 49, 49],
				[1, 0, 50], [1, 1, 51], [1, 2, 52], [1, 3, 53], [1, 4, 54], [1, 5, 55], [1, 6, 56], [1, 7, 57],
				[2, 0, 58], [2, 1, 59]
			]
		});
	});

	test('issue #33525: Long line with ligatures takes a long time to paint decorations', () => {
		const actual = renderViewLine(new RenderLineInput(
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

		assert.deepStrictEqual(inflateRenderLineOutput(actual), {
			html: [
				'<span class="mtk3">append\u00a0data\u00a0to\u00a0append\u00a0data\u00a0to\u00a0append\u00a0data\u00a0to\u00a0</span>',
				'<span class="mtk3">append\u00a0data\u00a0to\u00a0append\u00a0data\u00a0to\u00a0append\u00a0data\u00a0to\u00a0</span>',
				'<span class="mtk3">append\u00a0data\u00a0to\u00a0append\u00a0data\u00a0to\u00a0append\u00a0data\u00a0to\u00a0</span>',
				'<span class="mtk3">append\u00a0data\u00a0to\u00a0append\u00a0data\u00a0to\u00a0append\u00a0data\u00a0to\u00a0</span>',
				'<span class="mtk3">append\u00a0data\u00a0to</span>',
			],
			mapping: [
				[0, 0, 0], [0, 1, 1], [0, 2, 2], [0, 3, 3], [0, 4, 4], [0, 5, 5], [0, 6, 6], [0, 7, 7],
				[0, 8, 8], [0, 9, 9], [0, 10, 10], [0, 11, 11], [0, 12, 12], [0, 13, 13], [0, 14, 14],
				[0, 15, 15], [0, 16, 16], [0, 17, 17], [0, 18, 18], [0, 19, 19], [0, 20, 20], [0, 21, 21],
				[0, 22, 22], [0, 23, 23], [0, 24, 24], [0, 25, 25], [0, 26, 26], [0, 27, 27], [0, 28, 28],
				[0, 29, 29], [0, 30, 30], [0, 31, 31], [0, 32, 32], [0, 33, 33], [0, 34, 34], [0, 35, 35],
				[0, 36, 36], [0, 37, 37], [0, 38, 38], [0, 39, 39], [0, 40, 40], [0, 41, 41], [0, 42, 42],
				[0, 43, 43], [0, 44, 44],
				[1, 0, 45], [1, 1, 46], [1, 2, 47], [1, 3, 48], [1, 4, 49], [1, 5, 50], [1, 6, 51],
				[1, 7, 52], [1, 8, 53], [1, 9, 54], [1, 10, 55], [1, 11, 56], [1, 12, 57], [1, 13, 58],
				[1, 14, 59], [1, 15, 60], [1, 16, 61], [1, 17, 62], [1, 18, 63], [1, 19, 64], [1, 20, 65],
				[1, 21, 66], [1, 22, 67], [1, 23, 68], [1, 24, 69], [1, 25, 70], [1, 26, 71], [1, 27, 72],
				[1, 28, 73], [1, 29, 74], [1, 30, 75], [1, 31, 76], [1, 32, 77], [1, 33, 78], [1, 34, 79],
				[1, 35, 80], [1, 36, 81], [1, 37, 82], [1, 38, 83], [1, 39, 84], [1, 40, 85], [1, 41, 86],
				[1, 42, 87], [1, 43, 88], [1, 44, 89],
				[2, 0, 90], [2, 1, 91], [2, 2, 92], [2, 3, 93], [2, 4, 94], [2, 5, 95], [2, 6, 96],
				[2, 7, 97], [2, 8, 98], [2, 9, 99], [2, 10, 100], [2, 11, 101], [2, 12, 102],
				[2, 13, 103], [2, 14, 104], [2, 15, 105], [2, 16, 106], [2, 17, 107], [2, 18, 108],
				[2, 19, 109], [2, 20, 110], [2, 21, 111], [2, 22, 112], [2, 23, 113], [2, 24, 114],
				[2, 25, 115], [2, 26, 116], [2, 27, 117], [2, 28, 118], [2, 29, 119], [2, 30, 120],
				[2, 31, 121], [2, 32, 122], [2, 33, 123], [2, 34, 124], [2, 35, 125], [2, 36, 126],
				[2, 37, 127], [2, 38, 128], [2, 39, 129], [2, 40, 130], [2, 41, 131], [2, 42, 132],
				[2, 43, 133], [2, 44, 134],
				[3, 0, 135], [3, 1, 136], [3, 2, 137], [3, 3, 138], [3, 4, 139], [3, 5, 140], [3, 6, 141],
				[3, 7, 142], [3, 8, 143], [3, 9, 144], [3, 10, 145], [3, 11, 146], [3, 12, 147], [3, 13, 148],
				[3, 14, 149], [3, 15, 150], [3, 16, 151], [3, 17, 152], [3, 18, 153], [3, 19, 154], [3, 20, 155],
				[3, 21, 156], [3, 22, 157], [3, 23, 158], [3, 24, 159], [3, 25, 160], [3, 26, 161], [3, 27, 162],
				[3, 28, 163], [3, 29, 164], [3, 30, 165], [3, 31, 166], [3, 32, 167], [3, 33, 168], [3, 34, 169],
				[3, 35, 170], [3, 36, 171], [3, 37, 172], [3, 38, 173], [3, 39, 174], [3, 40, 175], [3, 41, 176],
				[3, 42, 177], [3, 43, 178], [3, 44, 179],
				[4, 0, 180], [4, 1, 181], [4, 2, 182], [4, 3, 183], [4, 4, 184], [4, 5, 185], [4, 6, 186],
				[4, 7, 187], [4, 8, 188], [4, 9, 189], [4, 10, 190], [4, 11, 191], [4, 12, 192], [4, 13, 193],
				[4, 14, 194]
			]
		});
	});

	test('issue #33525: Long line with ligatures takes a long time to paint decorations - not possible', () => {
		const actual = renderViewLine(new RenderLineInput(
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

		assert.deepStrictEqual(inflateRenderLineOutput(actual), {
			html: [
				'<span class="mtk3">appenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatato</span>',
			],
			mapping: [
				[0, 0, 0], [0, 1, 1], [0, 2, 2], [0, 3, 3], [0, 4, 4], [0, 5, 5], [0, 6, 6], [0, 7, 7],
				[0, 8, 8], [0, 9, 9], [0, 10, 10], [0, 11, 11], [0, 12, 12], [0, 13, 13], [0, 14, 14],
				[0, 15, 15], [0, 16, 16], [0, 17, 17], [0, 18, 18], [0, 19, 19], [0, 20, 20], [0, 21, 21],
				[0, 22, 22], [0, 23, 23], [0, 24, 24], [0, 25, 25], [0, 26, 26], [0, 27, 27], [0, 28, 28],
				[0, 29, 29], [0, 30, 30], [0, 31, 31], [0, 32, 32], [0, 33, 33], [0, 34, 34], [0, 35, 35],
				[0, 36, 36], [0, 37, 37], [0, 38, 38], [0, 39, 39], [0, 40, 40], [0, 41, 41], [0, 42, 42],
				[0, 43, 43], [0, 44, 44], [0, 45, 45], [0, 46, 46], [0, 47, 47], [0, 48, 48], [0, 49, 49],
				[0, 50, 50], [0, 51, 51], [0, 52, 52], [0, 53, 53], [0, 54, 54], [0, 55, 55], [0, 56, 56],
				[0, 57, 57], [0, 58, 58], [0, 59, 59], [0, 60, 60], [0, 61, 61], [0, 62, 62], [0, 63, 63],
				[0, 64, 64], [0, 65, 65], [0, 66, 66], [0, 67, 67], [0, 68, 68], [0, 69, 69], [0, 70, 70],
				[0, 71, 71], [0, 72, 72], [0, 73, 73], [0, 74, 74], [0, 75, 75], [0, 76, 76], [0, 77, 77],
				[0, 78, 78], [0, 79, 79], [0, 80, 80], [0, 81, 81], [0, 82, 82], [0, 83, 83], [0, 84, 84],
				[0, 85, 85], [0, 86, 86], [0, 87, 87], [0, 88, 88], [0, 89, 89], [0, 90, 90], [0, 91, 91],
				[0, 92, 92], [0, 93, 93], [0, 94, 94], [0, 95, 95], [0, 96, 96], [0, 97, 97], [0, 98, 98],
				[0, 99, 99], [0, 100, 100], [0, 101, 101], [0, 102, 102], [0, 103, 103], [0, 104, 104],
				[0, 105, 105], [0, 106, 106], [0, 107, 107], [0, 108, 108], [0, 109, 109], [0, 110, 110],
				[0, 111, 111], [0, 112, 112], [0, 113, 113], [0, 114, 114], [0, 115, 115], [0, 116, 116],
				[0, 117, 117], [0, 118, 118], [0, 119, 119], [0, 120, 120], [0, 121, 121], [0, 122, 122],
				[0, 123, 123], [0, 124, 124], [0, 125, 125], [0, 126, 126], [0, 127, 127], [0, 128, 128],
				[0, 129, 129], [0, 130, 130], [0, 131, 131], [0, 132, 132], [0, 133, 133], [0, 134, 134],
				[0, 135, 135], [0, 136, 136], [0, 137, 137], [0, 138, 138], [0, 139, 139], [0, 140, 140],
				[0, 141, 141], [0, 142, 142], [0, 143, 143], [0, 144, 144], [0, 145, 145], [0, 146, 146],
				[0, 147, 147], [0, 148, 148], [0, 149, 149], [0, 150, 150], [0, 151, 151], [0, 152, 152],
				[0, 153, 153], [0, 154, 154], [0, 155, 155], [0, 156, 156]
			]
		});
	});

	test('issue #91936: Semantic token color highlighting fails on line with selected text', () => {
		const actual = renderViewLine(new RenderLineInput(
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
			[new OffsetRange(0, 47)]
		));

		assert.deepStrictEqual(inflateRenderLineOutput(actual), {
			html: [
				'<span class="mtkz" style="width:10px">\u00b7\u200c</span>',
				'<span class="mtkz" style="width:10px">\u00b7\u200c</span>',
				'<span class="mtkz" style="width:10px">\u00b7\u200c</span>',
				'<span class="mtkz" style="width:10px">\u00b7\u200c</span>',
				'<span class="mtkz" style="width:10px">\u00b7\u200c</span>',
				'<span class="mtkz" style="width:10px">\u00b7\u200c</span>',
				'<span class="mtkz" style="width:10px">\u00b7\u200c</span>',
				'<span class="mtkz" style="width:10px">\u00b7\u200c</span>',
				'<span class="mtkz" style="width:10px">\u00b7\u200c</span>',
				'<span class="mtkz" style="width:10px">\u00b7\u200c</span>',
				'<span class="mtkz" style="width:10px">\u00b7\u200c</span>',
				'<span class="mtkz" style="width:10px">\u00b7\u200c</span>',
				'<span class="mtkz" style="width:10px">\u00b7\u200c</span>',
				'<span class="mtkz" style="width:10px">\u00b7\u200c</span>',
				'<span class="mtkz" style="width:10px">\u00b7\u200c</span>',
				'<span class="mtkz" style="width:10px">\u00b7\u200c</span>',
				'<span class="mtkz" style="width:10px">\u00b7\u200c</span>',
				'<span class="mtkz" style="width:10px">\u00b7\u200c</span>',
				'<span class="mtkz" style="width:10px">\u00b7\u200c</span>',
				'<span class="mtkz" style="width:10px">\u00b7\u200c</span>',
				'<span class="mtk15">else</span>',
				'<span class="mtkz" style="width:10px">\u00b7\u200c</span>',
				'<span class="mtk15">if</span>',
				'<span class="mtkz" style="width:10px">\u00b7\u200c</span>',
				'<span class="mtk1">(</span>',
				'<span class="mtk16">$s</span>',
				'<span class="mtkz" style="width:10px">\u00b7\u200c</span>',
				'<span class="mtk1">=</span>',
				'<span class="mtkz" style="width:10px">\u00b7\u200c</span>',
				'<span class="mtk6">08</span>',
				'<span class="mtk1">)</span>',
				'<span class="mtkz" style="width:10px">\u00b7\u200c</span>',
				'<span class="mtk15">then</span>',
				'<span class="mtkz" style="width:10px">\u00b7\u200c</span>',
				'<span class="mtk11">\'\\b\'</span>',
			],
			mapping: [
				[0, 0, 0],
				[1, 0, 1],
				[2, 0, 2],
				[3, 0, 3],
				[4, 0, 4],
				[5, 0, 5],
				[6, 0, 6],
				[7, 0, 7],
				[8, 0, 8],
				[9, 0, 9],
				[10, 0, 10],
				[11, 0, 11],
				[12, 0, 12],
				[13, 0, 13],
				[14, 0, 14],
				[15, 0, 15],
				[16, 0, 16],
				[17, 0, 17],
				[18, 0, 18],
				[19, 0, 19],
				[20, 0, 20], [20, 1, 21], [20, 2, 22], [20, 3, 23],
				[21, 0, 24],
				[22, 0, 25], [22, 1, 26],
				[23, 0, 27],
				[24, 0, 28],
				[25, 0, 29], [25, 1, 30],
				[26, 0, 31],
				[27, 0, 32],
				[28, 0, 33],
				[29, 0, 34], [29, 1, 35],
				[30, 0, 36],
				[31, 0, 37],
				[32, 0, 38], [32, 1, 39], [32, 2, 40], [32, 3, 41],
				[33, 0, 42],
				[34, 0, 43], [34, 1, 44], [34, 2, 45], [34, 3, 46], [34, 4, 47]
			]
		});
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

		assert.deepStrictEqual(inflateRenderLineOutput(actual), {
			html: [
				'<span class="mtk3">[\u2421]\u00a0[\u2400]</span>',
			],
			mapping: [
				[0, 0, 0], [0, 1, 1], [0, 2, 2], [0, 3, 3], [0, 4, 4], [0, 5, 5], [0, 6, 6], [0, 7, 7]
			]
		});
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

		assert.deepStrictEqual(inflateRenderLineOutput(actual), {
			html: [
				'<span class="mtk3">transferBalance(5678,</span>',
				'<span class="mtkcontrol">[U+202E]</span>',
				'<span class="mtk3">6776,4321</span>',
				'<span class="mtkcontrol">[U+202C]</span>',
				'<span class="mtk3">,"USD");</span>',
			],
			mapping: [
				[0, 0, 0], [0, 1, 1], [0, 2, 2], [0, 3, 3], [0, 4, 4], [0, 5, 5], [0, 6, 6], [0, 7, 7],
				[0, 8, 8], [0, 9, 9], [0, 10, 10], [0, 11, 11], [0, 12, 12], [0, 13, 13], [0, 14, 14],
				[0, 15, 15], [0, 16, 16], [0, 17, 17], [0, 18, 18], [0, 19, 19], [0, 20, 20],
				[1, 0, 21],
				[2, 0, 29], [2, 1, 30], [2, 2, 31], [2, 3, 32], [2, 4, 33], [2, 5, 34], [2, 6, 35],
				[2, 7, 36], [2, 8, 37],
				[3, 0, 38],
				[4, 0, 46], [4, 1, 47], [4, 2, 48], [4, 3, 49], [4, 4, 50], [4, 5, 51], [4, 6, 52], [4, 7, 53], [4, 8, 54]
			]
		});
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

		assert.deepStrictEqual(inflateRenderLineOutput(actual), {
			html: [
				'<span class="mtkw">\u00b7\u200c\u00b7\u200c\u00b7\u200c\u00b7\u200c</span>',
				'<span class="mtk2">if</span>',
				'<span class="ced-1-TextEditorDecorationType2-17c14d98-3 ced-1-TextEditorDecorationType2-3"></span>',
				'<span class="ced-1-TextEditorDecorationType2-17c14d98-4 ced-1-TextEditorDecorationType2-4"></span>',
				'<span class="ced-ghost-text-1-4"></span>',
			],
			mapping: [
				[0, 0, 0], [0, 2, 1], [0, 4, 2], [0, 6, 3],
				[1, 0, 4], [1, 1, 5],
				[3, 0, 6]
			]
		});
	});

	function createTestGetColumnOfLinePartOffset(lineContent: string, tabSize: number, parts: TestLineToken[], expectedPartLengths: number[]): (partIndex: number, partLength: number, offset: number, expected: number) => void {
		const renderLineOutput = renderViewLine(new RenderLineInput(
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
		const testGetColumnOfLinePartOffset = createTestGetColumnOfLinePartOffset(
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
		const testGetColumnOfLinePartOffset = createTestGetColumnOfLinePartOffset(
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
		const testGetColumnOfLinePartOffset = createTestGetColumnOfLinePartOffset(
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
		const testGetColumnOfLinePartOffset = createTestGetColumnOfLinePartOffset(
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
		const testGetColumnOfLinePartOffset = createTestGetColumnOfLinePartOffset(
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
