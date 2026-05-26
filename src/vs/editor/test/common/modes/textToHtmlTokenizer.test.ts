/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ColorId, FontStyle, MetadataConsts } from '../../../common/encodedTokenAttributes.js';
import { EncodedTokenizationResult, IState, TokenizationRegistry } from '../../../common/languages.js';
import { ILanguageService } from '../../../common/languages/language.js';
import { _tokenizeToString, tokenizeLineToHTML } from '../../../common/languages/textToHtmlTokenizer.js';
import { LanguageIdCodec } from '../../../common/services/languagesRegistry.js';
import { TestLineToken, TestLineTokens } from '../core/testLineToken.js';
import { createModelServices } from '../testTextModel.js';
import { TestInstantiationService } from '../../../../platform/instantiation/test/common/instantiationServiceMock.js';

suite('Editor Modes - textToHtmlTokenizer', () => {

	let disposables: DisposableStore;
	let instantiationService: TestInstantiationService;

	setup(() => {
		disposables = new DisposableStore();
		instantiationService = createModelServices(disposables);
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function toStr(pieces: { className: string; text: string }[]): string {
		const resultArr = pieces.map((t) => `<span class="${t.className}">${t.text}</span>`);
		return resultArr.join('');
	}

	test('TextToHtmlTokenizer 1', () => {
		const mode = disposables.add(instantiationService.createInstance(Mode));
		const support = TokenizationRegistry.get(mode.languageId)!;

		const actual = _tokenizeToString('.abc..def...gh', new LanguageIdCodec(), support);
		const expected = [
			{ className: 'mtk7', text: '.' },
			{ className: 'mtk9', text: 'abc' },
			{ className: 'mtk7', text: '..' },
			{ className: 'mtk9', text: 'def' },
			{ className: 'mtk7', text: '...' },
			{ className: 'mtk9', text: 'gh' },
		];
		const expectedStr = `<div class="monaco-tokenized-source">${toStr(expected)}</div>`;

		assert.strictEqual(actual, expectedStr);
	});

	test('TextToHtmlTokenizer 2', () => {
		const mode = disposables.add(instantiationService.createInstance(Mode));
		const support = TokenizationRegistry.get(mode.languageId)!;

		const actual = _tokenizeToString('.abc..def...gh\n.abc..def...gh', new LanguageIdCodec(), support);
		const expected1 = [
			{ className: 'mtk7', text: '.' },
			{ className: 'mtk9', text: 'abc' },
			{ className: 'mtk7', text: '..' },
			{ className: 'mtk9', text: 'def' },
			{ className: 'mtk7', text: '...' },
			{ className: 'mtk9', text: 'gh' },
		];
		const expected2 = [
			{ className: 'mtk7', text: '.' },
			{ className: 'mtk9', text: 'abc' },
			{ className: 'mtk7', text: '..' },
			{ className: 'mtk9', text: 'def' },
			{ className: 'mtk7', text: '...' },
			{ className: 'mtk9', text: 'gh' },
		];
		const expectedStr1 = toStr(expected1);
		const expectedStr2 = toStr(expected2);
		const expectedStr = `<div class="monaco-tokenized-source">${expectedStr1}<br/>${expectedStr2}</div>`;

		assert.strictEqual(actual, expectedStr);
	});

	test('tokenizeLineToHTML', () => {
		const text = 'Ciao hello world!';
		const lineTokens = new TestLineTokens([
			new TestLineToken(
				4,
				(
					(3 << MetadataConsts.FOREGROUND_OFFSET)
					| ((FontStyle.Bold | FontStyle.Italic) << MetadataConsts.FONT_STYLE_OFFSET)
				) >>> 0
			),
			new TestLineToken(
				5,
				(
					(1 << MetadataConsts.FOREGROUND_OFFSET)
				) >>> 0
			),
			new TestLineToken(
				10,
				(
					(4 << MetadataConsts.FOREGROUND_OFFSET)
				) >>> 0
			),
			new TestLineToken(
				11,
				(
					(1 << MetadataConsts.FOREGROUND_OFFSET)
				) >>> 0
			),
			new TestLineToken(
				17,
				(
					(5 << MetadataConsts.FOREGROUND_OFFSET)
					| ((FontStyle.Underline) << MetadataConsts.FONT_STYLE_OFFSET)
				) >>> 0
			)
		]);
		const colorMap = [null!, '#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff'];

		assert.strictEqual(
			tokenizeLineToHTML(text, lineTokens, colorMap, 0, 17, 4, true),
			[
				'<div>',
				'<span style="color: #ff0000;font-style: italic;font-weight: bold;">Ciao</span>',
				'<span style="color: #000000;"> </span>',
				'<span style="color: #00ff00;">hello</span>',
				'<span style="color: #000000;"> </span>',
				'<span style="color: #0000ff;text-decoration: underline;">world!</span>',
				'</div>'
			].join('')
		);

		assert.strictEqual(
			tokenizeLineToHTML(text, lineTokens, colorMap, 0, 12, 4, true),
			[
				'<div>',
				'<span style="color: #ff0000;font-style: italic;font-weight: bold;">Ciao</span>',
				'<span style="color: #000000;"> </span>',
				'<span style="color: #00ff00;">hello</span>',
				'<span style="color: #000000;"> </span>',
				'<span style="color: #0000ff;text-decoration: underline;">w</span>',
				'</div>'
			].join('')
		);

		assert.strictEqual(
			tokenizeLineToHTML(text, lineTokens, colorMap, 0, 11, 4, true),
			[
				'<div>',
				'<span style="color: #ff0000;font-style: italic;font-weight: bold;">Ciao</span>',
				'<span style="color: #000000;"> </span>',
				'<span style="color: #00ff00;">hello</span>',
				'<span style="color: #000000;"> </span>',
				'</div>'
			].join('')
		);

		assert.strictEqual(
			tokenizeLineToHTML(text, lineTokens, colorMap, 1, 11, 4, true),
			[
				'<div>',
				'<span style="color: #ff0000;font-style: italic;font-weight: bold;">iao</span>',
				'<span style="color: #000000;"> </span>',
				'<span style="color: #00ff00;">hello</span>',
				'<span style="color: #000000;"> </span>',
				'</div>'
			].join('')
		);

		assert.strictEqual(
			tokenizeLineToHTML(text, lineTokens, colorMap, 4, 11, 4, true),
			[
				'<div>',
				'<span style="color: #000000;">&#160;</span>',
				'<span style="color: #00ff00;">hello</span>',
				'<span style="color: #000000;"> </span>',
				'</div>'
			].join('')
		);

		assert.strictEqual(
			tokenizeLineToHTML(text, lineTokens, colorMap, 5, 11, 4, true),
			[
				'<div>',
				'<span style="color: #00ff00;">hello</span>',
				'<span style="color: #000000;"> </span>',
				'</div>'
			].join('')
		);

		assert.strictEqual(
			tokenizeLineToHTML(text, lineTokens, colorMap, 5, 10, 4, true),
			[
				'<div>',
				'<span style="color: #00ff00;">hello</span>',
				'</div>'
			].join('')
		);

		assert.strictEqual(
			tokenizeLineToHTML(text, lineTokens, colorMap, 6, 9, 4, true),
			[
				'<div>',
				'<span style="color: #00ff00;">ell</span>',
				'</div>'
			].join('')
		);
	});
	test('tokenizeLineToHTML handle spaces #35954', () => {
		const text = '  Ciao   hello world!';
		const lineTokens = new TestLineTokens([
			new TestLineToken(
				2,
				(
					(1 << MetadataConsts.FOREGROUND_OFFSET)
				) >>> 0
			),
			new TestLineToken(
				6,
				(
					(3 << MetadataConsts.FOREGROUND_OFFSET)
					| ((FontStyle.Bold | FontStyle.Italic) << MetadataConsts.FONT_STYLE_OFFSET)
				) >>> 0
			),
			new TestLineToken(
				9,
				(
					(1 << MetadataConsts.FOREGROUND_OFFSET)
				) >>> 0
			),
			new TestLineToken(
				14,
				(
					(4 << MetadataConsts.FOREGROUND_OFFSET)
				) >>> 0
			),
			new TestLineToken(
				15,
				(
					(1 << MetadataConsts.FOREGROUND_OFFSET)
				) >>> 0
			),
			new TestLineToken(
				21,
				(
					(5 << MetadataConsts.FOREGROUND_OFFSET)
					| ((FontStyle.Underline) << MetadataConsts.FONT_STYLE_OFFSET)
				) >>> 0
			)
		]);
		const colorMap = [null!, '#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff'];

		assert.strictEqual(
			tokenizeLineToHTML(text, lineTokens, colorMap, 0, 21, 4, true),
			[
				'<div>',
				'<span style="color: #000000;">&#160; </span>',
				'<span style="color: #ff0000;font-style: italic;font-weight: bold;">Ciao</span>',
				'<span style="color: #000000;"> &#160; </span>',
				'<span style="color: #00ff00;">hello</span>',
				'<span style="color: #000000;"> </span>',
				'<span style="color: #0000ff;text-decoration: underline;">world!</span>',
				'</div>'
			].join('')
		);

		assert.strictEqual(
			tokenizeLineToHTML(text, lineTokens, colorMap, 0, 17, 4, true),
			[
				'<div>',
				'<span style="color: #000000;">&#160; </span>',
				'<span style="color: #ff0000;font-style: italic;font-weight: bold;">Ciao</span>',
				'<span style="color: #000000;"> &#160; </span>',
				'<span style="color: #00ff00;">hello</span>',
				'<span style="color: #000000;"> </span>',
				'<span style="color: #0000ff;text-decoration: underline;">wo</span>',
				'</div>'
			].join('')
		);

		assert.strictEqual(
			tokenizeLineToHTML(text, lineTokens, colorMap, 0, 3, 4, true),
			[
				'<div>',
				'<span style="color: #000000;">&#160; </span>',
				'<span style="color: #ff0000;font-style: italic;font-weight: bold;">C</span>',
				'</div>'
			].join('')
		);
	});

	test('tokenizeLineToHTML with tabs and non-zero startOffset #263387', () => {
		// This test demonstrates the issue where tab padding is calculated incorrectly
		// when startOffset is non-zero and there are tabs AFTER the start position.
		// The bug: tabsCharDelta doesn't account for characters before startOffset.

		const colorMap = [null!, '#000000', '#ffffff', '#ff0000', '#00ff00'];

		// Critical test case: "\ta\tb" starting at position 2 (skipping first tab and 'a')
		// Layout: First tab (pos 0) goes to column 4, 'a' (pos 1) at column 4,
		//         second tab (pos 2) should go from column 5 to column 8 (3 spaces)
		// With the bug: charIndex starts at 2, tabsCharDelta=0 (first tab was never seen)
		//   When processing second tab: insertSpacesCount = 4 - (2 + 0) % 4 = 2 spaces (WRONG!)
		//   The old code thinks it's at column 2, but it's actually at column 5
		const text = '\ta\tb';
		const lineTokens = new TestLineTokens([
			new TestLineToken(
				1,
				(
					(1 << MetadataConsts.FOREGROUND_OFFSET)
				) >>> 0
			),
			new TestLineToken(
				2,
				(
					(3 << MetadataConsts.FOREGROUND_OFFSET)
				) >>> 0
			),
			new TestLineToken(
				3,
				(
					(1 << MetadataConsts.FOREGROUND_OFFSET)
				) >>> 0
			),
			new TestLineToken(
				4,
				(
					(4 << MetadataConsts.FOREGROUND_OFFSET)
				) >>> 0
			)
		]);

		// First, verify the full line works correctly
		assert.strictEqual(
			tokenizeLineToHTML(text, lineTokens, colorMap, 0, 4, 4, true),
			[
				'<div>',
				'<span style="color: #000000;">&#160; &#160; </span>', // First tab: 4 spaces
				'<span style="color: #ff0000;">a</span>',               // 'a' at column 4
				'<span style="color: #000000;"> &#160; </span>',       // Second tab: 3 spaces (column 5 to 8)
				'<span style="color: #00ff00;">b</span>',
				'</div>'
			].join('')
		);

		// THE BUG: Starting at position 2 (after first tab and 'a')
		// Expected (with fix): 3 spaces for the second tab (column 5 to 8)
		// Buggy behavior (old code): 2 spaces (thinks it's at column 2, gives &#160; )
		// The fix correctly accounts for the skipped tab and 'a', outputting &#160; &#160;
		assert.strictEqual(
			tokenizeLineToHTML(text, lineTokens, colorMap, 2, 4, 4, true),
			[
				'<div>',
				'<span style="color: #000000;">&#160; &#160;</span>', // With fix: 3 spaces; with bug: only 2 spaces
				'<span style="color: #00ff00;">b</span>',
				'</div>'
			].join('')
		);
	});

});

class Mode extends Disposable {

	public readonly languageId = 'textToHtmlTokenizerMode';

	constructor(
		@ILanguageService languageService: ILanguageService
	) {
		super();
		this._register(languageService.registerLanguage({ id: this.languageId }));
		this._register(TokenizationRegistry.register(this.languageId, {
			getInitialState: (): IState => null!,
			tokenize: undefined!,
			tokenizeEncoded: (line: string, hasEOL: boolean, state: IState): EncodedTokenizationResult => {
				const tokensArr: number[] = [];
				let prevColor = -1 as ColorId;
				for (let i = 0; i < line.length; i++) {
					const colorId = (line.charAt(i) === '.' ? 7 : 9) as ColorId;
					if (prevColor !== colorId) {
						tokensArr.push(i);
						tokensArr.push((
							colorId << MetadataConsts.FOREGROUND_OFFSET
						) >>> 0);
					}
					prevColor = colorId;
				}

				const tokens = new Uint32Array(tokensArr.length);
				for (let i = 0; i < tokens.length; i++) {
					tokens[i] = tokensArr[i];
				}
				return new EncodedTokenizationResult(tokens, [], null!);
			}
		}));
	}
}
