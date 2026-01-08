/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CharCode } from '../../../../base/common/charCode.js';
import * as strings from '../../../../base/common/strings.js';
import { assertSnapshot } from '../../../../base/test/common/snapshot.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { OffsetRange } from '../../../common/core/ranges/offsetRange.js';
import { MetadataConsts } from '../../../common/encodedTokenAttributes.js';
import { IViewLineTokens } from '../../../common/tokens/lineTokens.js';
import { LineDecoration } from '../../../common/viewLayout/lineDecorations.js';
import { CharacterMapping, DomPosition, IRenderLineInputOptions, RenderLineInput, RenderLineOutput2, renderViewLine2 as renderViewLine } from '../../../common/viewLayout/viewLineRenderer.js';
import { InlineDecorationType } from '../../../common/viewModel/inlineDecorations.js';
import { TestLineToken, TestLineTokens } from '../core/testLineToken.js';

const HTML_EXTENSION = { extension: 'html' };

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

type IRelaxedRenderLineInputOptions = Partial<IRenderLineInputOptions>;

const defaultRenderLineInputOptions: IRenderLineInputOptions = {
	useMonospaceOptimizations: false,
	canUseHalfwidthRightwardsArrow: true,
	lineContent: '',
	continuesWithWrappedLine: false,
	isBasicASCII: true,
	containsRTL: false,
	fauxIndentLength: 0,
	lineTokens: createViewLineTokens([]),
	lineDecorations: [],
	tabSize: 4,
	startVisibleColumn: 0,
	spaceWidth: 10,
	middotWidth: 10,
	wsmiddotWidth: 10,
	stopRenderingLineAfter: -1,
	renderWhitespace: 'none',
	renderControlCharacters: false,
	fontLigatures: false,
	selectionsOnLine: null,
	textDirection: null,
	verticalScrollbarSize: 14,
	renderNewLineWhenEmpty: false
};

function createRenderLineInputOptions(opts: IRelaxedRenderLineInputOptions): IRenderLineInputOptions {
	return {
		...defaultRenderLineInputOptions,
		...opts
	};
}

function createRenderLineInput(opts: IRelaxedRenderLineInputOptions): RenderLineInput {
	const options = createRenderLineInputOptions(opts);
	return new RenderLineInput(
		options.useMonospaceOptimizations,
		options.canUseHalfwidthRightwardsArrow,
		options.lineContent,
		options.continuesWithWrappedLine,
		options.isBasicASCII,
		options.containsRTL,
		options.fauxIndentLength,
		options.lineTokens,
		options.lineDecorations,
		options.tabSize,
		options.startVisibleColumn,
		options.spaceWidth,
		options.middotWidth,
		options.wsmiddotWidth,
		options.stopRenderingLineAfter,
		options.renderWhitespace,
		options.renderControlCharacters,
		options.fontLigatures,
		options.selectionsOnLine,
		options.textDirection,
		options.verticalScrollbarSize,
		options.renderNewLineWhenEmpty
	);
}

suite('viewLineRenderer.renderLine', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function assertCharacterReplacement(lineContent: string, tabSize: number, expected: string, expectedCharOffsetInPart: number[]): void {
		const _actual = renderViewLine(createRenderLineInput({
			lineContent,
			isBasicASCII: strings.isBasicASCII(lineContent),
			lineTokens: createViewLineTokens([new TestLineToken(lineContent.length, 0)]),
			tabSize,
			spaceWidth: 0,
			middotWidth: 0,
			wsmiddotWidth: 0
		}));

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
		const _actual = renderViewLine(createRenderLineInput({
			lineContent,
			lineTokens: createViewLineTokens(parts),
			tabSize,
			spaceWidth: 0,
			middotWidth: 0,
			wsmiddotWidth: 0
		}));

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

	test('overflow', async () => {
		const _actual = renderViewLine(createRenderLineInput({
			lineContent: 'Hello world!',
			lineTokens: createViewLineTokens([
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
			stopRenderingLineAfter: 6,
			renderWhitespace: 'boundary'
		}));

		const inflated = inflateRenderLineOutput(_actual);
		await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
		await assertSnapshot(inflated.mapping);
	});

	test('typical line', async () => {
		const lineContent = '\t    export class Game { // http://test.com     ';
		const lineTokens = createViewLineTokens([
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
		const _actual = renderViewLine(createRenderLineInput({
			lineContent,
			lineTokens,
			renderWhitespace: 'boundary'
		}));

		const inflated = inflateRenderLineOutput(_actual);
		await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
		await assertSnapshot(inflated.mapping);
	});

	test('issue #2255: Weird line rendering part 1', async () => {
		const lineContent = '\t\t\tcursorStyle:\t\t\t\t\t\t(prevOpts.cursorStyle !== newOpts.cursorStyle),';
		const lineTokens = createViewLineTokens([
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
		const _actual = renderViewLine(createRenderLineInput({
			lineContent,
			lineTokens
		}));

		const inflated = inflateRenderLineOutput(_actual);
		await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
		await assertSnapshot(inflated.mapping);
	});

	test('issue #2255: Weird line rendering part 2', async () => {
		const lineContent = ' \t\t\tcursorStyle:\t\t\t\t\t\t(prevOpts.cursorStyle !== newOpts.cursorStyle),';

		const lineTokens = createViewLineTokens([
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
		const _actual = renderViewLine(createRenderLineInput({
			lineContent,
			lineTokens
		}));

		const inflated = inflateRenderLineOutput(_actual);
		await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
		await assertSnapshot(inflated.mapping);
	});

	test('issue #91178: after decoration type shown before cursor', async () => {
		const lineContent = '//just a comment';
		const lineTokens = createViewLineTokens([
			createPart(16, 1)
		]);
		const actual = renderViewLine(createRenderLineInput({
			useMonospaceOptimizations: true,
			canUseHalfwidthRightwardsArrow: false,
			lineContent,
			lineTokens,
			lineDecorations: [
				new LineDecoration(13, 13, 'dec1', InlineDecorationType.After),
				new LineDecoration(13, 13, 'dec2', InlineDecorationType.Before),
			]
		}));

		const inflated = inflateRenderLineOutput(actual);
		await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
		await assertSnapshot(inflated.mapping);
	});

	test('issue microsoft/monaco-editor#280: Improved source code rendering for RTL languages', async () => {
		const lineContent = 'var קודמות = \"מיותר קודמות צ\'ט של, אם לשון העברית שינויים ויש, אם\";';
		const lineTokens = createViewLineTokens([
			createPart(3, 6),
			createPart(13, 1),
			createPart(66, 20),
			createPart(67, 1),
		]);
		const _actual = renderViewLine(createRenderLineInput({
			lineContent,
			isBasicASCII: false,
			containsRTL: true,
			lineTokens
		}));

		const inflated = inflateRenderLineOutput(_actual);
		await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
		await assertSnapshot(inflated.mapping);
	});

	test('issue #137036: Issue in RTL languages in recent versions', async () => {
		const lineContent = '<option value=\"العربية\">العربية</option>';
		const lineTokens = createViewLineTokens([
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
		const _actual = renderViewLine(createRenderLineInput({
			lineContent,
			isBasicASCII: false,
			containsRTL: true,
			lineTokens
		}));

		const inflated = inflateRenderLineOutput(_actual);
		await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
		await assertSnapshot(inflated.mapping);
	});

	test('issue #99589: Rendering whitespace influences bidi layout', async () => {
		const lineContent = '    [\"🖨️ چاپ فاکتور\",\"🎨 تنظیمات\"]';
		const lineTokens = createViewLineTokens([
			createPart(5, 2),
			createPart(21, 3),
			createPart(22, 2),
			createPart(34, 3),
			createPart(35, 2),
		]);
		const _actual = renderViewLine(createRenderLineInput({
			useMonospaceOptimizations: true,
			lineContent,
			isBasicASCII: false,
			containsRTL: true,
			lineTokens,
			renderWhitespace: 'all'
		}));

		const inflated = inflateRenderLineOutput(_actual);
		await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
		await assertSnapshot(inflated.mapping);
	});

	test('issue #260239: HTML containing bidirectional text is rendered incorrectly', async () => {
		// Simulating HTML like: <p class="myclass" title="العربي">نشاط التدويل!</p>
		// The line contains both LTR (class="myclass") and RTL (title="العربي") attribute values
		const lineContent = '<p class="myclass" title="العربي">نشاط التدويل!</p>';
		const lineTokens = createViewLineTokens([
			createPart(1, 1),   // <
			createPart(2, 2),   // p
			createPart(3, 3),   // (space)
			createPart(8, 4),   // class
			createPart(9, 5),   // =
			createPart(10, 6),  // "
			createPart(17, 7),  // myclass
			createPart(18, 6),  // "
			createPart(19, 3),  // (space)
			createPart(24, 4),  // title
			createPart(25, 5),  // =
			createPart(26, 6),  // "
			createPart(32, 8),  // العربي (RTL text) - 6 Arabic characters from position 26-31
			createPart(33, 6),  // " - closing quote at position 32
			createPart(34, 1),  // >
			createPart(47, 9),  // نشاط التدويل! (RTL text) - 13 characters from position 34-46
			createPart(48, 1),  // <
			createPart(49, 2),  // /
			createPart(50, 2),  // p
			createPart(51, 1),  // >
		]);
		const _actual = renderViewLine(new RenderLineInput(
			false,
			true,
			lineContent,
			false,
			false,
			true,
			0,
			lineTokens,
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
			null,
			null,
			14
		));

		const inflated = inflateRenderLineOutput(_actual);
		await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
		await assertSnapshot(inflated.mapping);
	});

	test('issue #274604: Mixed LTR and RTL in a single token', async () => {
		const lineContent = 'test.com##a:-abp-contains(إ)';
		const lineTokens = createViewLineTokens([
			createPart(lineContent.length, 1)
		]);
		const actual = renderViewLine(createRenderLineInput({
			lineContent,
			isBasicASCII: false,
			containsRTL: true,
			lineTokens
		}));

		const inflated = inflateRenderLineOutput(actual);
		await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
		await assertSnapshot(inflated.mapping);
	});

	test('issue #277693: Mixed LTR and RTL in a single token with template literal', async () => {
		const lineContent = 'نام کاربر: ${user.firstName}';
		const lineTokens = createViewLineTokens([
			createPart(9, 1),   // نام کاربر (RTL string content)
			createPart(11, 1),  // : (space)
			createPart(13, 2),  // ${ (template expression punctuation)
			createPart(17, 3),  // user (variable)
			createPart(18, 4),  // . (punctuation)
			createPart(27, 3),  // firstName (property)
			createPart(28, 2),  // } (template expression punctuation)
		]);
		const actual = renderViewLine(createRenderLineInput({
			lineContent,
			isBasicASCII: false,
			containsRTL: true,
			lineTokens
		}));

		const inflated = inflateRenderLineOutput(actual);
		await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
		await assertSnapshot(inflated.mapping);
	});

	test('issue #6885: Splits large tokens', async () => {
		//                                                                                                                  1         1         1
		//                        1         2         3         4         5         6         7         8         9         0         1         2
		//               1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234
		const _lineText = 'This is just a long line that contains very interesting text. This is just a long line that contains very interesting text.';

		function assertSplitsTokens(message: string, lineContent: string, expectedOutput: string[]): void {
			const lineTokens = createViewLineTokens([createPart(lineContent.length, 1)]);
			const actual = renderViewLine(createRenderLineInput({
				lineContent,
				lineTokens
			}));
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

	test('issue #21476: Does not split large tokens when ligatures are on', async () => {
		//                                                                                                                  1         1         1
		//                        1         2         3         4         5         6         7         8         9         0         1         2
		//               1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234
		const _lineText = 'This is just a long line that contains very interesting text. This is just a long line that contains very interesting text.';

		function assertSplitsTokens(message: string, lineContent: string, expectedOutput: string[]): void {
			const lineTokens = createViewLineTokens([createPart(lineContent.length, 1)]);
			const actual = renderViewLine(createRenderLineInput({
				lineContent,
				lineTokens,
				fontLigatures: true
			}));
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

	test('issue #20624: Unaligned surrogate pairs are corrupted at multiples of 50 columns', async () => {
		const lineContent = 'a𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷';
		const lineTokens = createViewLineTokens([createPart(lineContent.length, 1)]);
		const actual = renderViewLine(createRenderLineInput({
			lineContent,
			isBasicASCII: false,
			lineTokens
		}));

		await assertSnapshot(inflateRenderLineOutput(actual).html.join(''), HTML_EXTENSION);
	});

	test('issue #6885: Does not split large tokens in RTL text', async () => {
		const lineContent = 'את גרמנית בהתייחסות שמו, שנתי המשפט אל חפש, אם כתב אחרים ולחבר. של התוכן אודות בויקיפדיה כלל, של עזרה כימיה היא. על עמוד יוצרים מיתולוגיה סדר, אם שכל שתפו לעברית שינויים, אם שאלות אנגלית עזה. שמות בקלות מה סדר.';
		const lineTokens = createViewLineTokens([createPart(lineContent.length, 1)]);
		const actual = renderViewLine(createRenderLineInput({
			lineContent,
			isBasicASCII: false,
			containsRTL: true,
			lineTokens
		}));

		await assertSnapshot(actual.html, HTML_EXTENSION);
	});

	test('issue #95685: Uses unicode replacement character for Paragraph Separator', async () => {
		const lineContent = 'var ftext = [\u2029"Und", "dann", "eines"];';
		const lineTokens = createViewLineTokens([createPart(lineContent.length, 1)]);
		const actual = renderViewLine(createRenderLineInput({
			lineContent,
			isBasicASCII: false,
			lineTokens
		}));
		const inflated = inflateRenderLineOutput(actual);
		await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
		await assertSnapshot(inflated.mapping);
	});

	test('issue #19673: Monokai Theme bad-highlighting in line wrap', async () => {
		const lineContent = '    MongoCallback<string>): void {';
		const lineTokens = createViewLineTokens([
			createPart(17, 1),
			createPart(18, 2),
			createPart(24, 3),
			createPart(26, 4),
			createPart(27, 5),
			createPart(28, 6),
			createPart(32, 7),
			createPart(34, 8),
		]);
		const _actual = renderViewLine(createRenderLineInput({
			useMonospaceOptimizations: true,
			lineContent,
			fauxIndentLength: 4,
			lineTokens
		}));

		const inflated = inflateRenderLineOutput(_actual);
		await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
		await assertSnapshot(inflated.mapping);
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
		const actual = renderViewLine(createRenderLineInput({
			useMonospaceOptimizations: fontIsMonospace,
			lineContent,
			fauxIndentLength,
			lineTokens: createViewLineTokens(tokens),
			renderWhitespace,
			selectionsOnLine: selections
		}));
		return inflateRenderLineOutput(actual);
	}

	test('issue #18616: Inline decorations ending at the text length are no longer rendered', async () => {
		const lineContent = 'https://microsoft.com';
		const actual = renderViewLine(createRenderLineInput({
			lineContent,
			lineTokens: createViewLineTokens([createPart(21, 3)]),
			lineDecorations: [new LineDecoration(1, 22, 'link', InlineDecorationType.Regular)]
		}));

		const inflated = inflateRenderLineOutput(actual);
		await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
		await assertSnapshot(inflated.mapping);
	});

	test('issue #19207: Link in Monokai is not rendered correctly', async () => {
		const lineContent = '\'let url = `http://***/_api/web/lists/GetByTitle(\\\'Teambuildingaanvragen\\\')/items`;\'';
		const actual = renderViewLine(createRenderLineInput({
			useMonospaceOptimizations: true,
			lineContent,
			lineTokens: createViewLineTokens([
				createPart(49, 6),
				createPart(51, 4),
				createPart(72, 6),
				createPart(74, 4),
				createPart(84, 6),
			]),
			lineDecorations: [
				new LineDecoration(13, 51, 'detected-link', InlineDecorationType.Regular)
			]
		}));

		const inflated = inflateRenderLineOutput(actual);
		await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
		await assertSnapshot(inflated.mapping);
	});

	test('createLineParts simple', async () => {
		const actual = testCreateLineParts(
			false,
			'Hello world!',
			[
				createPart(12, 1)
			],
			0,
			'none',
			null
		);
		await assertSnapshot(actual.html.join(''), HTML_EXTENSION);
		await assertSnapshot(actual.mapping);
	});

	test('createLineParts simple two tokens', async () => {
		const actual = testCreateLineParts(
			false,
			'Hello world!',
			[
				createPart(6, 1),
				createPart(12, 2)
			],
			0,
			'none',
			null
		);
		await assertSnapshot(actual.html.join(''), HTML_EXTENSION);
		await assertSnapshot(actual.mapping);
	});

	test('createLineParts render whitespace - 4 leading spaces', async () => {
		const actual = testCreateLineParts(
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
		);
		await assertSnapshot(actual.html.join(''), HTML_EXTENSION);
		await assertSnapshot(actual.mapping);
	});

	test('createLineParts render whitespace - 8 leading spaces', async () => {
		const actual = testCreateLineParts(
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
		);
		await assertSnapshot(actual.html.join(''), HTML_EXTENSION);
		await assertSnapshot(actual.mapping);
	});

	test('createLineParts render whitespace - 2 leading tabs', async () => {
		const actual = testCreateLineParts(
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
		);
		await assertSnapshot(actual.html.join(''), HTML_EXTENSION);
		await assertSnapshot(actual.mapping);
	});

	test('createLineParts render whitespace - mixed leading spaces and tabs', async () => {
		const actual = testCreateLineParts(
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
		);
		await assertSnapshot(actual.html.join(''), HTML_EXTENSION);
		await assertSnapshot(actual.mapping);
	});

	test('createLineParts render whitespace skips faux indent', async () => {
		const actual = testCreateLineParts(
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
		);
		await assertSnapshot(actual.html.join(''), HTML_EXTENSION);
		await assertSnapshot(actual.mapping);
	});

	test('createLineParts does not emit width for monospace fonts', async () => {
		const actual = testCreateLineParts(
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
		);
		await assertSnapshot(actual.html.join(''), HTML_EXTENSION);
		await assertSnapshot(actual.mapping);
	});

	test('createLineParts render whitespace in middle but not for one space', async () => {
		const actual = testCreateLineParts(
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
		);
		await assertSnapshot(actual.html.join(''), HTML_EXTENSION);
		await assertSnapshot(actual.mapping);
	});

	test('createLineParts render whitespace for all in middle', async () => {
		const actual = testCreateLineParts(
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
		);
		await assertSnapshot(actual.html.join(''), HTML_EXTENSION);
		await assertSnapshot(actual.mapping);
	});

	test('createLineParts render whitespace for selection with no selections', async () => {
		const actual = testCreateLineParts(
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
		);
		await assertSnapshot(actual.html.join(''), HTML_EXTENSION);
		await assertSnapshot(actual.mapping);
	});

	test('createLineParts render whitespace for selection with whole line selection', async () => {
		const actual = testCreateLineParts(
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
		);
		await assertSnapshot(actual.html.join(''), HTML_EXTENSION);
		await assertSnapshot(actual.mapping);
	});

	test('createLineParts render whitespace for selection with selection spanning part of whitespace', async () => {
		const actual = testCreateLineParts(
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
		);
		await assertSnapshot(actual.html.join(''), HTML_EXTENSION);
		await assertSnapshot(actual.mapping);
	});

	test('createLineParts render whitespace for selection with multiple selections', async () => {
		const actual = testCreateLineParts(
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
		);
		await assertSnapshot(actual.html.join(''), HTML_EXTENSION);
		await assertSnapshot(actual.mapping);
	});

	test('createLineParts render whitespace for selection with multiple, initially unsorted selections', async () => {
		const actual = testCreateLineParts(
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
		);
		await assertSnapshot(actual.html.join(''), HTML_EXTENSION);
		await assertSnapshot(actual.mapping);
	});

	test('createLineParts render whitespace for selection with selections next to each other', async () => {
		const actual = testCreateLineParts(
			false,
			' * S',
			[
				createPart(4, 0)
			],
			0,
			'selection',
			[new OffsetRange(0, 1), new OffsetRange(1, 2), new OffsetRange(2, 3)]
		);
		await assertSnapshot(actual.html.join(''), HTML_EXTENSION);
		await assertSnapshot(actual.mapping);
	});

	test('createLineParts render whitespace for trailing with leading, inner, and without trailing whitespace', async () => {
		const actual = testCreateLineParts(
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
		);
		await assertSnapshot(actual.html.join(''), HTML_EXTENSION);
		await assertSnapshot(actual.mapping);
	});

	test('createLineParts render whitespace for trailing with leading, inner, and trailing whitespace', async () => {
		const actual = testCreateLineParts(
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
		);
		await assertSnapshot(actual.html.join(''), HTML_EXTENSION);
		await assertSnapshot(actual.mapping);
	});

	test('createLineParts render whitespace for trailing with 8 leading and 8 trailing whitespaces', async () => {
		const actual = testCreateLineParts(
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
		);
		await assertSnapshot(actual.html.join(''), HTML_EXTENSION);
		await assertSnapshot(actual.mapping);
	});

	test('createLineParts render whitespace for trailing with line containing only whitespaces', async () => {
		const actual = testCreateLineParts(
			false,
			' \t ',
			[
				createPart(2, 0),
				createPart(3, 1),
			],
			0,
			'trailing',
			null
		);
		await assertSnapshot(actual.html.join(''), HTML_EXTENSION);
		await assertSnapshot(actual.mapping);
	});

	test('createLineParts can handle unsorted inline decorations', async () => {
		const actual = renderViewLine(createRenderLineInput({
			lineContent: 'Hello world',
			lineTokens: createViewLineTokens([createPart(11, 0)]),
			lineDecorations: [
				new LineDecoration(5, 7, 'a', InlineDecorationType.Regular),
				new LineDecoration(1, 3, 'b', InlineDecorationType.Regular),
				new LineDecoration(2, 8, 'c', InlineDecorationType.Regular),
			]
		}));

		// 01234567890
		// Hello world
		// ----aa-----
		// bb---------
		// -cccccc----

		const inflated = inflateRenderLineOutput(actual);
		await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
		await assertSnapshot(inflated.mapping);
	});

	test('issue #11485: Visible whitespace conflicts with before decorator attachment', async () => {

		const lineContent = '\tbla';

		const actual = renderViewLine(createRenderLineInput({
			lineContent,
			lineTokens: createViewLineTokens([createPart(4, 3)]),
			lineDecorations: [new LineDecoration(1, 2, 'before', InlineDecorationType.Before)],
			renderWhitespace: 'all',
			fontLigatures: true
		}));

		const inflated = inflateRenderLineOutput(actual);
		await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
		await assertSnapshot(inflated.mapping);
	});

	test('issue #32436: Non-monospace font + visible whitespace + After decorator causes line to "jump"', async () => {

		const lineContent = '\tbla';

		const actual = renderViewLine(createRenderLineInput({
			lineContent,
			lineTokens: createViewLineTokens([createPart(4, 3)]),
			lineDecorations: [new LineDecoration(2, 3, 'before', InlineDecorationType.Before)],
			renderWhitespace: 'all',
			fontLigatures: true
		}));

		const inflated = inflateRenderLineOutput(actual);
		await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
		await assertSnapshot(inflated.mapping);
	});

	test('issue #30133: Empty lines don\'t render inline decorations', async () => {

		const lineContent = '';

		const actual = renderViewLine(createRenderLineInput({
			lineContent,
			lineTokens: createViewLineTokens([createPart(0, 3)]),
			lineDecorations: [new LineDecoration(1, 2, 'before', InlineDecorationType.Before)],
			renderWhitespace: 'all',
			fontLigatures: true
		}));

		const inflated = inflateRenderLineOutput(actual);
		await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
		await assertSnapshot(inflated.mapping);
	});

	test('issue #37208: Collapsing bullet point containing emoji in Markdown document results in [??] character', async () => {

		const actual = renderViewLine(createRenderLineInput({
			useMonospaceOptimizations: true,
			lineContent: '  1. 🙏',
			isBasicASCII: false,
			lineTokens: createViewLineTokens([createPart(7, 3)]),
			lineDecorations: [new LineDecoration(7, 8, 'inline-folded', InlineDecorationType.After)],
			tabSize: 2,
			stopRenderingLineAfter: 10000
		}));

		const inflated = inflateRenderLineOutput(actual);
		await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
		await assertSnapshot(inflated.mapping);
	});

	test('issue #37401 #40127: Allow both before and after decorations on empty line', async () => {

		const actual = renderViewLine(createRenderLineInput({
			useMonospaceOptimizations: true,
			lineContent: '',
			lineTokens: createViewLineTokens([createPart(0, 3)]),
			lineDecorations: [
				new LineDecoration(1, 1, 'before', InlineDecorationType.Before),
				new LineDecoration(1, 1, 'after', InlineDecorationType.After),
			],
			tabSize: 2,
			stopRenderingLineAfter: 10000
		}));

		const inflated = inflateRenderLineOutput(actual);
		await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
		await assertSnapshot(inflated.mapping);
	});

	test('issue #118759: enable multiple text editor decorations in empty lines', async () => {

		const actual = renderViewLine(createRenderLineInput({
			useMonospaceOptimizations: true,
			lineContent: '',
			lineTokens: createViewLineTokens([createPart(0, 3)]),
			lineDecorations: [
				new LineDecoration(1, 1, 'after1', InlineDecorationType.After),
				new LineDecoration(1, 1, 'after2', InlineDecorationType.After),
				new LineDecoration(1, 1, 'before1', InlineDecorationType.Before),
				new LineDecoration(1, 1, 'before2', InlineDecorationType.Before),
			],
			tabSize: 2,
			stopRenderingLineAfter: 10000
		}));

		const inflated = inflateRenderLineOutput(actual);
		await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
		await assertSnapshot(inflated.mapping);
	});

	test('issue #38935: GitLens end-of-line blame no longer rendering', async () => {

		const actual = renderViewLine(createRenderLineInput({
			useMonospaceOptimizations: true,
			lineContent: '\t}',
			lineTokens: createViewLineTokens([createPart(2, 3)]),
			lineDecorations: [
				new LineDecoration(3, 3, 'ced-TextEditorDecorationType2-5e9b9b3f-3 ced-TextEditorDecorationType2-3', InlineDecorationType.Before),
				new LineDecoration(3, 3, 'ced-TextEditorDecorationType2-5e9b9b3f-4 ced-TextEditorDecorationType2-4', InlineDecorationType.After),
			],
			stopRenderingLineAfter: 10000
		}));

		const inflated = inflateRenderLineOutput(actual);
		await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
		await assertSnapshot(inflated.mapping);
	});

	test('issue #136622: Inline decorations are not rendering on non-ASCII lines when renderControlCharacters is on', async () => {

		const actual = renderViewLine(createRenderLineInput({
			useMonospaceOptimizations: true,
			lineContent: 'some text £',
			isBasicASCII: false,
			lineTokens: createViewLineTokens([createPart(11, 3)]),
			lineDecorations: [
				new LineDecoration(5, 5, 'inlineDec1', InlineDecorationType.After),
				new LineDecoration(6, 6, 'inlineDec2', InlineDecorationType.Before),
			],
			stopRenderingLineAfter: 10000,
			renderControlCharacters: true
		}));

		const inflated = inflateRenderLineOutput(actual);
		await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
		await assertSnapshot(inflated.mapping);
	});

	test('issue #22832: Consider fullwidth characters when rendering tabs', async () => {

		const actual = renderViewLine(createRenderLineInput({
			useMonospaceOptimizations: true,
			lineContent: 'asd = "擦"\t\t#asd',
			isBasicASCII: false,
			lineTokens: createViewLineTokens([createPart(15, 3)]),
			stopRenderingLineAfter: 10000
		}));

		const inflated = inflateRenderLineOutput(actual);
		await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
		await assertSnapshot(inflated.mapping);
	});

	test('issue #22832: Consider fullwidth characters when rendering tabs (render whitespace)', async () => {

		const actual = renderViewLine(createRenderLineInput({
			useMonospaceOptimizations: true,
			lineContent: 'asd = "擦"\t\t#asd',
			isBasicASCII: false,
			lineTokens: createViewLineTokens([createPart(15, 3)]),
			stopRenderingLineAfter: 10000,
			renderWhitespace: 'all'
		}));

		const inflated = inflateRenderLineOutput(actual);
		await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
		await assertSnapshot(inflated.mapping);
	});

	test('issue #22352: COMBINING ACUTE ACCENT (U+0301)', async () => {

		const actual = renderViewLine(createRenderLineInput({
			useMonospaceOptimizations: true,
			lineContent: '12345689012345678901234568901234567890123456890abába',
			isBasicASCII: false,
			lineTokens: createViewLineTokens([createPart(53, 3)]),
			stopRenderingLineAfter: 10000
		}));

		const inflated = inflateRenderLineOutput(actual);
		await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
		await assertSnapshot(inflated.mapping);
	});

	test('issue #22352: Partially Broken Complex Script Rendering of Tamil', async () => {

		const actual = renderViewLine(createRenderLineInput({
			useMonospaceOptimizations: true,
			lineContent: ' JoyShareல் பின்தொடர்ந்து, விடீயோ, ஜோக்குகள், அனிமேசன், நகைச்சுவை படங்கள் மற்றும் செய்திகளை பெறுவீர்',
			isBasicASCII: false,
			lineTokens: createViewLineTokens([createPart(100, 3)]),
			stopRenderingLineAfter: 10000
		}));

		const inflated = inflateRenderLineOutput(actual);
		await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
		await assertSnapshot(inflated.mapping);
	});

	test('issue #42700: Hindi characters are not being rendered properly', async () => {

		const actual = renderViewLine(createRenderLineInput({
			useMonospaceOptimizations: true,
			lineContent: ' वो ऐसा क्या है जो हमारे अंदर भी है और बाहर भी है। जिसकी वजह से हम सब हैं। जिसने इस सृष्टि की रचना की है।',
			isBasicASCII: false,
			lineTokens: createViewLineTokens([createPart(105, 3)]),
			stopRenderingLineAfter: 10000
		}));

		const inflated = inflateRenderLineOutput(actual);
		await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
		await assertSnapshot(inflated.mapping);
	});

	test('issue #38123: editor.renderWhitespace: "boundary" renders whitespace at line wrap point when line is wrapped', async () => {
		const actual = renderViewLine(createRenderLineInput({
			useMonospaceOptimizations: true,
			lineContent: 'This is a long line which never uses more than two spaces. ',
			continuesWithWrappedLine: true,
			lineTokens: createViewLineTokens([createPart(59, 3)]),
			stopRenderingLineAfter: 10000,
			renderWhitespace: 'boundary'
		}));

		const inflated = inflateRenderLineOutput(actual);
		await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
		await assertSnapshot(inflated.mapping);
	});

	test('issue #33525: Long line with ligatures takes a long time to paint decorations', async () => {
		const actual = renderViewLine(createRenderLineInput({
			canUseHalfwidthRightwardsArrow: false,
			lineContent: 'append data to append data to append data to append data to append data to append data to append data to append data to append data to append data to append data to append data to append data to',
			lineTokens: createViewLineTokens([createPart(194, 3)]),
			stopRenderingLineAfter: 10000,
			fontLigatures: true
		}));

		const inflated = inflateRenderLineOutput(actual);
		await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
		await assertSnapshot(inflated.mapping);
	});

	test('issue #33525: Long line with ligatures takes a long time to paint decorations - not possible', async () => {
		const actual = renderViewLine(createRenderLineInput({
			canUseHalfwidthRightwardsArrow: false,
			lineContent: 'appenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatato',
			lineTokens: createViewLineTokens([createPart(194, 3)]),
			stopRenderingLineAfter: 10000,
			fontLigatures: true
		}));

		const inflated = inflateRenderLineOutput(actual);
		await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
		await assertSnapshot(inflated.mapping);
	});

	test('issue #91936: Semantic token color highlighting fails on line with selected text', async () => {
		const actual = renderViewLine(createRenderLineInput({
			lineContent: '                    else if ($s = 08) then \'\\b\'',
			lineTokens: createViewLineTokens([
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
			stopRenderingLineAfter: 10000,
			renderWhitespace: 'selection',
			selectionsOnLine: [new OffsetRange(0, 47)],
			middotWidth: 11,
			wsmiddotWidth: 11
		}));

		const inflated = inflateRenderLineOutput(actual);
		await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
		await assertSnapshot(inflated.mapping);
	});

	test('issue #119416: Delete Control Character (U+007F / &#127;) displayed as space', async () => {
		const actual = renderViewLine(createRenderLineInput({
			canUseHalfwidthRightwardsArrow: false,
			lineContent: '[' + String.fromCharCode(127) + '] [' + String.fromCharCode(0) + ']',
			lineTokens: createViewLineTokens([createPart(7, 3)]),
			stopRenderingLineAfter: 10000,
			renderControlCharacters: true,
			fontLigatures: true
		}));

		const inflated = inflateRenderLineOutput(actual);
		await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
		await assertSnapshot(inflated.mapping);
	});

	test('issue #116939: Important control characters aren\'t rendered', async () => {
		const actual = renderViewLine(createRenderLineInput({
			canUseHalfwidthRightwardsArrow: false,
			lineContent: `transferBalance(5678,${String.fromCharCode(0x202E)}6776,4321${String.fromCharCode(0x202C)},"USD");`,
			isBasicASCII: false,
			lineTokens: createViewLineTokens([createPart(42, 3)]),
			stopRenderingLineAfter: 10000,
			renderControlCharacters: true
		}));

		const inflated = inflateRenderLineOutput(actual);
		await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
		await assertSnapshot(inflated.mapping);
	});

	test('issue #124038: Multiple end-of-line text decorations get merged', async () => {
		const actual = renderViewLine(createRenderLineInput({
			useMonospaceOptimizations: true,
			canUseHalfwidthRightwardsArrow: false,
			lineContent: '    if',
			lineTokens: createViewLineTokens([createPart(4, 1), createPart(6, 2)]),
			lineDecorations: [
				new LineDecoration(7, 7, 'ced-1-TextEditorDecorationType2-17c14d98-3 ced-1-TextEditorDecorationType2-3', InlineDecorationType.Before),
				new LineDecoration(7, 7, 'ced-1-TextEditorDecorationType2-17c14d98-4 ced-1-TextEditorDecorationType2-4', InlineDecorationType.After),
				new LineDecoration(7, 7, 'ced-ghost-text-1-4', InlineDecorationType.After),
			],
			stopRenderingLineAfter: 10000,
			renderWhitespace: 'all'
		}));

		const inflated = inflateRenderLineOutput(actual);
		await assertSnapshot(inflated.html.join(''), HTML_EXTENSION);
		await assertSnapshot(inflated.mapping);
	});

	function createTestGetColumnOfLinePartOffset(lineContent: string, tabSize: number, parts: TestLineToken[], expectedPartLengths: number[]): (partIndex: number, partLength: number, offset: number, expected: number) => void {
		const renderLineOutput = renderViewLine(createRenderLineInput({
			lineContent,
			tabSize,
			lineTokens: createViewLineTokens(parts)
		}));

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
