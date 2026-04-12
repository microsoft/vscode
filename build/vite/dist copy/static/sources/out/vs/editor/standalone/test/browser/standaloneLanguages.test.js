/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Emitter } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { Token } from '../../../common/languages.js';
import { TokenTheme } from '../../../common/languages/supports/tokenization.js';
import { LanguageService } from '../../../common/services/languageService.js';
import { TokenizationSupportAdapter } from '../../browser/standaloneLanguages.js';
import { UnthemedProductIconTheme } from '../../../../platform/theme/browser/iconsStyleSheet.js';
import { ColorScheme } from '../../../../platform/theme/common/theme.js';
suite('TokenizationSupport2Adapter', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    const languageId = 'tttt';
    // const tokenMetadata = (LanguageId.PlainText << MetadataConsts.LANGUAGEID_OFFSET);
    class MockTokenTheme extends TokenTheme {
        constructor() {
            super(null, null);
            this.counter = 0;
        }
        match(languageId, token) {
            return (((this.counter++) << 15 /* MetadataConsts.FOREGROUND_OFFSET */)
                | (languageId << 0 /* MetadataConsts.LANGUAGEID_OFFSET */)) >>> 0;
        }
    }
    class MockThemeService {
        constructor() {
            this._builtInProductIconTheme = new UnthemedProductIconTheme();
            this.onDidColorThemeChange = new Emitter().event;
            this.onDidFileIconThemeChange = new Emitter().event;
            this.onDidProductIconThemeChange = new Emitter().event;
        }
        setTheme(themeName) {
            throw new Error('Not implemented');
        }
        setAutoDetectHighContrast(autoDetectHighContrast) {
            throw new Error('Not implemented');
        }
        defineTheme(themeName, themeData) {
            throw new Error('Not implemented');
        }
        getColorTheme() {
            return {
                label: 'mock',
                tokenTheme: new MockTokenTheme(),
                themeName: ColorScheme.LIGHT,
                type: ColorScheme.LIGHT,
                getColor: (color, useDefault) => {
                    throw new Error('Not implemented');
                },
                defines: (color) => {
                    throw new Error('Not implemented');
                },
                getTokenStyleMetadata: (type, modifiers, modelLanguage) => {
                    return undefined;
                },
                semanticHighlighting: false,
                tokenColorMap: [],
                tokenFontMap: []
            };
        }
        setColorMapOverride(colorMapOverride) {
        }
        getFileIconTheme() {
            return {
                hasFileIcons: false,
                hasFolderIcons: false,
                hidesExplorerArrows: false
            };
        }
        getProductIconTheme() {
            return this._builtInProductIconTheme;
        }
    }
    class MockState {
        static { this.INSTANCE = new MockState(); }
        constructor() { }
        clone() {
            return this;
        }
        equals(other) {
            return this === other;
        }
    }
    function testBadTokensProvider(providerTokens, expectedClassicTokens, expectedModernTokens) {
        class BadTokensProvider {
            getInitialState() {
                return MockState.INSTANCE;
            }
            tokenize(line, state) {
                return {
                    tokens: providerTokens,
                    endState: MockState.INSTANCE
                };
            }
        }
        const disposables = new DisposableStore();
        const languageService = disposables.add(new LanguageService());
        disposables.add(languageService.registerLanguage({ id: languageId }));
        const adapter = new TokenizationSupportAdapter(languageId, new BadTokensProvider(), languageService, new MockThemeService());
        const actualClassicTokens = adapter.tokenize('whatever', true, MockState.INSTANCE);
        assert.deepStrictEqual(actualClassicTokens.tokens, expectedClassicTokens);
        const actualModernTokens = adapter.tokenizeEncoded('whatever', true, MockState.INSTANCE);
        const modernTokens = [];
        for (let i = 0; i < actualModernTokens.tokens.length; i++) {
            modernTokens[i] = actualModernTokens.tokens[i];
        }
        // Add the encoded language id to the expected tokens
        const encodedLanguageId = languageService.languageIdCodec.encodeLanguageId(languageId);
        const tokenLanguageMetadata = (encodedLanguageId << 0 /* MetadataConsts.LANGUAGEID_OFFSET */);
        for (let i = 1; i < expectedModernTokens.length; i += 2) {
            expectedModernTokens[i] |= tokenLanguageMetadata;
        }
        assert.deepStrictEqual(modernTokens, expectedModernTokens);
        disposables.dispose();
    }
    test('tokens always start at index 0', () => {
        testBadTokensProvider([
            { startIndex: 7, scopes: 'foo' },
            { startIndex: 0, scopes: 'bar' }
        ], [
            new Token(0, 'foo', languageId),
            new Token(0, 'bar', languageId),
        ], [
            0, (0 << 15 /* MetadataConsts.FOREGROUND_OFFSET */) | 1024 /* MetadataConsts.BALANCED_BRACKETS_MASK */,
            0, (1 << 15 /* MetadataConsts.FOREGROUND_OFFSET */) | 1024 /* MetadataConsts.BALANCED_BRACKETS_MASK */
        ]);
    });
    test('tokens always start after each other', () => {
        testBadTokensProvider([
            { startIndex: 0, scopes: 'foo' },
            { startIndex: 5, scopes: 'bar' },
            { startIndex: 3, scopes: 'foo' },
        ], [
            new Token(0, 'foo', languageId),
            new Token(5, 'bar', languageId),
            new Token(5, 'foo', languageId),
        ], [
            0, (0 << 15 /* MetadataConsts.FOREGROUND_OFFSET */) | 1024 /* MetadataConsts.BALANCED_BRACKETS_MASK */,
            5, (1 << 15 /* MetadataConsts.FOREGROUND_OFFSET */) | 1024 /* MetadataConsts.BALANCED_BRACKETS_MASK */,
            5, (2 << 15 /* MetadataConsts.FOREGROUND_OFFSET */) | 1024 /* MetadataConsts.BALANCED_BRACKETS_MASK */
        ]);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhbmRhbG9uZUxhbmd1YWdlcy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL3N0YW5kYWxvbmUvdGVzdC9icm93c2VyL3N0YW5kYWxvbmVMYW5ndWFnZXMudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFFNUIsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN2RSxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUVoRyxPQUFPLEVBQVUsS0FBSyxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDN0QsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUM5RSxPQUFPLEVBQXVCLDBCQUEwQixFQUFrQixNQUFNLHNDQUFzQyxDQUFDO0FBRXZILE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBRWpHLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUd6RSxLQUFLLENBQUMsNkJBQTZCLEVBQUUsR0FBRyxFQUFFO0lBRXpDLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsTUFBTSxVQUFVLEdBQUcsTUFBTSxDQUFDO0lBQzFCLG9GQUFvRjtJQUVwRixNQUFNLGNBQWUsU0FBUSxVQUFVO1FBRXRDO1lBQ0MsS0FBSyxDQUFDLElBQUssRUFBRSxJQUFLLENBQUMsQ0FBQztZQUZiLFlBQU8sR0FBRyxDQUFDLENBQUM7UUFHcEIsQ0FBQztRQUNlLEtBQUssQ0FBQyxVQUFzQixFQUFFLEtBQWE7WUFDMUQsT0FBTyxD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