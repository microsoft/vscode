/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { EncodedTokenizationResult, IState, TokenizationRegistry } from 'vs/editor/common/languages';
import { FontStyle, ColorId, MetadataConsts } from 'vs/editor/common/encodedTokenAttributes';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { tokenizeLineToHTML, _tokenizeToString } from 'vs/editor/common/languages/textToHtmlTokenizer';
import { LanguageIdCodec } from 'vs/editor/common/services/languagesRegistry';
import { TestLineToken, TestLineTokens } from 'vs/editor/test/common/core/testLineToken';
import { createModelServices } from 'vs/editor/test/common/testTextModel';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';

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

	function toStr(pieces: { className: string; text: string }[]): string {
		let resultArr = pieces.map((t) => `<span class="${t.className}">${t.text}</span>`);
		return resultArr.join('');
	}

	test('TextToHtmlTokenizer 1', () => {
		const mode = disposables.add(instantiationService.createInstance(Mode));
		let support = TokenizationRegistry.get(mode.languageId)!;

		let actual = _tokenizeToString('.abc..def...gh', new LanguageIdCodec(), support);
		let expected = [
			{ className: 'mtk7', text: '.' },
			{ className: 'mtk9', text: 'abc' },
			{ className: 'mtk7', text: '..' },
			{ className: 'mtk9', text: 'def' },
			{ className: 'mtk7', text: '...' },
			{ className: 'mtk9', text: 'gh' },
		];
		let expectedStr = `<div class="monaco-tokenized-source">${toStr(expected)}</div>`;

		assert.strictEqual(actual, expectedStr);
	});

	test('TextToHtmlTokenizer 2', () => {
		const mode = disposables.add(instantiationService.createInstance(Mode));
		let support = TokenizationRegistry.get(mode.languageId)!;

		let actual = _tokenizeToString('.abc..def...gh\n.abc..def...gh', new LanguageIdCodec(), support);
		let expected1 = [
			{ className: 'mtk7', text: '.' },
			{ className: 'mtk9', text: 'abc' },
			{ className: 'mtk7', text: '..' },
			{ className: 'mtk9', text: 'def' },
			{ className: 'mtk7', text: '...' },
			{ className: 'mtk9', text: 'gh' },
		];
		let expected2 = [
			{ className: 'mtk7', text: '.' },
			{ className: 'mtk9', text: 'abc' },
			{ className: 'mtk7', text: '..' },
			{ className: 'mtk9', text: 'def' },
			{ className: 'mtk7', text: '...' },
			{ className: 'mtk9', text: 'gh' },
		];
		let expectedStr1 = toStr(expected1);
		let expectedStr2 = toStr(expected2);
		let expectedStr = `<div class="monaco-tokenized-source">${expectedStr1}<br/>${expectedStr2}</div>`;

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

});

class Mode extends Disposable {

	private readonly languageId = 'textToHtmlTokenizerMode';

	constructor(
		@ILanguageService languageService: ILanguageService
	) {
		super();
		this._register(languageService.registerLanguage({ id: this.languageId }));
		this._register(TokenizationRegistry.register(this.languageId, {
			getInitialState: (): IState => null!,
			tokenize: undefined!,
			tokenizeEncoded: (line: string, hasEOL: boolean, state: IState): EncodedTokenizationResult => {
				let tokensArr: number[] = [];
				let prevColor: ColorId = -1;
				for (let i = 0; i < line.length; i++) {
					let colorId = line.charAt(i) === '.' ? 7 : 9;
					if (prevColor !== colorId) {
						tokensArr.push(i);
						tokensArr.push((
							colorId << MetadataConsts.FOREGROUND_OFFSET
						) >>> 0);
					}
					prevColor = colorId;
				}

				let tokens = new Uint32Array(tokensArr.length);
				for (let i = 0; i < tokens.length; i++) {
					tokens[i] = tokensArr[i];
				}
				return new EncodedTokenizationResult(tokens, null!);
			}
		}));
	}
}
