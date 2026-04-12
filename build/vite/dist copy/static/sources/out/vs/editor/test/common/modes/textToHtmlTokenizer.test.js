/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import assert from 'assert';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { EncodedTokenizationResult, TokenizationRegistry } from '../../../common/languages.js';
import { ILanguageService } from '../../../common/languages/language.js';
import { _tokenizeToString, tokenizeLineToHTML } from '../../../common/languages/textToHtmlTokenizer.js';
import { LanguageIdCodec } from '../../../common/services/languagesRegistry.js';
import { TestLineToken, TestLineTokens } from '../core/testLineToken.js';
import { createModelServices } from '../testTextModel.js';
suite('Editor Modes - textToHtmlTokenizer', () => {
    let disposables;
    let instantiationService;
    setup(() => {
        disposables = new DisposableStore();
        instantiationService = createModelServices(disposables);
    });
    teardown(() => {
        disposables.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    function toStr(pieces) {
        const resultArr = pieces.map((t) => `<span class="${t.className}">${t.text}</span>`);
        return resultArr.join('');
    }
    test('TextToHtmlTokenizer 1', () => {
        const mode = disposables.add(instantiationService.createInstance(Mode));
        const support = TokenizationRegistry.get(mode.languageId);
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
        const support = TokenizationRegistry.get(mode.languageId);
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
            new TestLineToken(4, ((3 << 15 /* MetadataConsts.FOREGROUND_OFFSET */)
                | ((2 /* FontStyle.Bold */ | 1 /* FontStyle.Italic */) << 11 /* MetadataConsts.FONT_STYLE_OFFSET */)) >>> 0),
            new TestLineToken(5, ((1 << 15 /* MetadataConsts.FOREGROUND_OFFSET */)) >>> 0),
            new TestLineToken(10, ((4 << 15 /* MetadataConsts.FOREGROUND_OFFSET */)) >>> 0),
            new TestLineToken(11, ((1 << 15 /* MetadataConsts.FOREGROUND_OFFSET */)) >>> 0),
            new TestLineToken(17, ((5 << 15 /* MetadataConsts.FOREGROUND_OFFSET */)
                | ((4 /* FontStyle.Underline */) << 11 /* MetadataConsts.FONT_STYLE_OFFSET */)) >>> 0)
        ]);
        const colorMap = [null, '#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff'];
        assert.strictEqual(tokenizeLineToHTML(text, lineTokens, colorMap, 0, 17, 4, true), [
            '<div>',
            '<span style="color: #ff0000;font-style: italic;font-weight: bold;">Ciao</span>',
            '<span style="color: #000000;"> </span>',
            '<span style="color: #00ff00;">hello</span>',
            '<span style="color: #000000;"> </span>',
            '<span style="color: #0000ff;text-decoration: underline;">world!</span>',
            '</div>'
        ].join(''));
        assert.strictEqual(tokenizeLineToHTML(text, lineTokens, colorMap, 0, 12, 4, true), [
            '<div>',
            '<span style="color: #ff0000;font-style: italic;font-weight: bold;">Ciao</span>',
            '<span style="color: #000000;"> </span>',
            '<span style="color: #00ff00;">hello</span>',
            '<span style="color: #000000;"> </span>',
            '<span style="color: #0000ff;text-decoration: underline;">w</span>',
            '</div>'
        ].join(''));
        assert.strictEqual(tokenizeLineToHTML(text, lineTokens, colorMap, 0, 11, 4, true), [
            '<div>',
            '<span style="color: #ff0000;font-style: italic;font-weight: bold;">Ciao</span>',
            '<span style="color: #000000;"> </span>',
            '<span style="color: #00ff00;">hello</span>',
            '<span style="color: #000000;"> </span>',
            '</div>'
        ].join(''));
        assert.strictEqual(tokenizeLineToHTML(text, lineTokens, colorMap, 1, 11, 4, true), [
            '<div>',
            '<span style="color: #ff0000;font-style: italic;font-weight: bold;">iao</span>',
            '<span style="color: #000000;"> </span>',
            '<span style="color: #00ff00;">hello</span>',
            '<span style="color: #000000;"> </span>',
            '</div>'
        ].join(''));
        assert.strictEqual(tokenizeLineToHTML(text, lineTokens, colorMap, 4, 11, 4, true), [
            '<div>',
            '<span style="color: #000000;">&#160;</span>',
            '<span style="color: #00ff00;">hello</span>',
            '<span style="color: #000000;"> </span>',
            '</div>'
        ].join(''));
        assert.strictEqual(tokenizeLineToHTML(text, lineTokens, colorMap, 5, 11, 4, true), [
            '<div>',
            '<span style="color: #00ff00;">hello</span>',
            '<span style="color: #000000;"> </span>',
            '</div>'
        ].join(''));
        assert.strictEqual(tokenizeLineToHTML(text, lineTokens, colorMap, 5, 10, 4, true), [
            '<div>',
            '<span style="color: #00ff00;">hello</span>',
            '</div>'
        ].join(''));
        assert.strictEqual(tokenizeLineToHTML(text, lineTokens, colorMap, 6, 9, 4, true), [
            '<div>',
            '<span style="color: #00ff00;">ell</span>',
            '</div>'
        ].join(''));
    });
    test('tokenizeLineToHTML handle spaces #35954', () => {
        const text = '  Ciao   hello world!';
        const lineTokens = new TestLineTokens([
            new TestLineToken(2, ((1 << 15 /* MetadataConsts.FOREGROUND_OFFSET */)) >>> 0),
            new TestLineToken(6, ((3 << 15 /* MetadataConsts.FOREGROUND_OFFSET */)
                | ((2 /* FontStyle.Bold */ | 1 /* FontStyle.Italic */) << 11 /* MetadataConsts.FONT_STYLE_OFFSET */)) >>> 0),
            new TestLineToken(9, ((1 << 15 /* MetadataConsts.FOREGROUND_OFFSET */)) >>> 0),
            new TestLineToken(14, ((4 << 15 /* MetadataConsts.FOREGROUND_OFFSET */)) >>> 0),
            new TestLineToken(15, ((1 << 15 /* MetadataConsts.FOREGROUND_OFFSET */)) >>> 0),
            new TestLineToken(21, ((5 << 15 /* MetadataConsts.FOREGROUND_OFFSET */)
                | ((4 /* FontStyle.Underline */) << 11 /* MetadataConsts.FONT_STYLE_OFFSET */)) >>> 0)
        ]);
        const colorMap = [null, '#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff'];
        assert.strictEqual(tokenizeLineToHTML(text, lineTokens, colorMap, 0, 21, 4, true), [
            '<div>',
            '<span style="color: #000000;">&#160; </span>',
            '<span style="color: #ff0000;font-style: italic;font-weight: bold;">Ciao</span>',
            '<span style="color: #000000;"> &#160; </span>',
            '<span style="color: #00ff00;">hello</span>',
            '<span style="color: #000000;"> </span>',
            '<span style="color: #0000ff;text-decoration: underline;">world!</span>',
            '</div>'
        ].join(''));
        assert.strictEqual(tokenizeLineToHTML(text, lineTokens, colorMap, 0, 17, 4, true), [
            '<div>',
            '<span style="color: #000000;">&#160; </span>',
            '<span style="color: #ff0000;font-style: italic;font-weight: bold;">Ciao</span>',
            '<span style="color: #000000;"> &#160; </span>',
            '<span style="color: #00ff00;">hello</span>',
            '<span style="color: #000000;"> </span>',
            '<span style="color: #0000ff;text-decoration: underline;">wo</span>',
            '</div>'
        ].join(''));
        assert.strictEqual(tokenizeLineToHTML(text, lineTokens, colorMap, 0, 3, 4, true), [
            '<div>',
            '<span style="color: #000000;">&#160; </span>',
            '<span style="color: #ff0000;font-style: italic;font-weight: bold;">C</span>',
            '</div>'
        ].join(''));
    });
    test('tokenizeLineToHTML with tabs and non-zero startOffset #263387', () => {
        // This test demonstrates the issue where tab padding is calculated incorrectly
        // when startOffset is non-zero and there are tabs AFTER the start position.
        // The bug: tabsCharDelta doesn't account for characters before startOffset.
        const colorMap = [null, '#000000', '#ffffff', '#ff0000', '#00ff00'];
        // Critical test case: "\ta\tb" starting at position 2 (skipping first tab and 'a')
        // Layout: First tab (pos 0) goes to column 4, 'a' (pos 1) at column 4,
        //         second tab (pos 2) should go from column 5 to column 8 (3 spaces)
        // With the bug: charIndex starts at 2, tabsCharDelta=0 (first tab was never seen)
        //   When processing second tab: insertSpacesCount = 4 - (2 + 0) % 4 = 2 spaces (WRONG!)
        //   The old code thinks it's at column 2, but it's actually at column 5
        const text = '\ta\tb';
        const lineTokens = new TestLineTokens([
            new TestLineToken(1, ((1 << 15 /* MetadataConsts.FOREGROUND_OFFSET */)) >>> 0),
            new TestLineToken(2, ((3 << 15 /* MetadataConsts.FOREGROUND_OFFSET */)) >>> 0),
            new TestLineToken(3, ((1 << 15 /* MetadataConsts.FOREGROUND_OFFSET */)) >>> 0),
            new TestLineToken(4, ((4 << 15 /* MetadataConsts.FOREGROUND_OFFSET */)) >>> 0)
        ]);
        // First, verify the full line works correctly
        assert.strictEqual(tokenizeLineToHTML(text, lineTokens, colorMap, 0, 4, 4, true), [
            '<div>',
            '<span style="color: #000000;">&#160; &#160; </span>', // First tab: 4 spaces
            '<span style="color: #ff0000;">a</span>', // 'a' at column 4
            '<span style="color: #000000;"> &#160; </span>', // Second tab: 3 spaces (column 5 to 8)
            '<span style="color: #00ff00;">b</span>',
            '</div>'
        ].join(''));
        // THE BUG: Starting at position 2 (after first tab and 'a')
        // Expected (with fix): 3 spaces for the second tab (column 5 to 8)
        // Buggy behavior (old code): 2 spaces (thinks it's at column 2, gives &#160; )
        // The fix correctly accounts for the skipped tab and 'a', outputting &#160; &#160;
        assert.strictEqual(tokenizeLineToHTML(text, lineTokens, colorMap, 2, 4, 4, true), [
            '<div>',
            '<span style="color: #000000;">&#160; &#160;</span>', // With fix: 3 spaces; with bug: only 2 spaces
            '<span style="color: #00ff00;">b</span>',
            '</div>'
        ].join(''));
    });
});
let Mode = class Mode extends Disposable {
    constructor(languageService) {
        super();
        this.languageId = 'textToHtmlTokenizerMode';
        this._register(languageService.registerLanguage({ id: this.languageId }));
        this._register(TokenizationRegistry.register(this.languageId, {
            getInitialState: () => null,
            tokenize: undefined,
            tokenizeEncoded: (line, hasEOL, state) => {
                const tokensArr = [];
                let prevColor = -1;
                for (let i = 0; i < line.length; i++) {
                    const colorId = (line.charAt(i) === '.' ? 7 : 9);
                    if (prevColor !== colorId) {
                        tokensArr.push(i);
                        tokensArr.push((colorId << 15 /* MetadataConsts.FOREGROUND_OFFSET */) >>> 0);
                    }
                    prevColor = colorId;
                }
                const tokens = new Uint32Array(tokensArr.length);
                for (let i = 0; i < tokens.length; i++) {
                    tokens[i] = tokensArr[i];
                }
                return new EncodedTokenizationResult(tokens, [], null);
            }
        }));
    }
};
Mode = __decorate([
    __param(0, ILanguageService)
], Mode);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dFRvSHRtbFRva2VuaXplci50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL3Rlc3QvY29tbW9uL21vZGVzL3RleHRUb0h0bWxUb2tlbml6ZXIudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNuRixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUVoRyxPQUFPLEVBQUUseUJBQXlCLEVBQVUsb0JBQW9CLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUN2RyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUN6RSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUN6RyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDaEYsT0FBTyxFQUFFLGFBQWEsRUFBRSxjQUFjLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUN6RSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUcxRCxLQUFLLENBQUMsb0NBQW9DLEVBQUUsR0FBRyxFQUFFO0lBRWhELElBQUksV0FBNEIsQ0FBQztJQUNqQyxJQUFJLG9CQUE4QyxDQUFDO0lBRW5ELEtBQUssQ0FBQyxHQUFHLEVBQUU7UUFDVixXQUFXLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztRQUNwQyxvQkFBb0IsR0FBRyxtQkFBbUIsQ0FBQyxXQUFXLENBQUMsQ0FBQztJQUN6RCxDQUFDLENBQUMsQ0FBQztJQUVILFFBQVEsQ0FBQyxHQUFHLEVBQUU7UUFDYixXQUFXLENBQUMs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