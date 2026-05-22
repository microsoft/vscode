/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Color } from '../../../../base/common/color.js';
import { Emitter } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { LanguageId, MetadataConsts } from '../../../common/encodedTokenAttributes.js';
import { IState, Token } from '../../../common/languages.js';
import { TokenTheme } from '../../../common/languages/supports/tokenization.js';
import { LanguageService } from '../../../common/services/languageService.js';
import { ILineTokens, IToken, TokenizationSupportAdapter, TokensProvider } from '../../browser/standaloneLanguages.js';
import { IStandaloneTheme, IStandaloneThemeData, IStandaloneThemeService } from '../../common/standaloneTheme.js';
import { UnthemedProductIconTheme } from '../../../../platform/theme/browser/iconsStyleSheet.js';
import { ColorIdentifier } from '../../../../platform/theme/common/colorRegistry.js';
import { ColorScheme } from '../../../../platform/theme/common/theme.js';
import { IColorTheme, IFileIconTheme, IProductIconTheme, ITokenStyle } from '../../../../platform/theme/common/themeService.js';

suite('TokenizationSupport2Adapter', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const languageId = 'tttt';
	// const tokenMetadata = (LanguageId.PlainText << MetadataConsts.LANGUAGEID_OFFSET);

	class MockTokenTheme extends TokenTheme {
		private counter = 0;
		constructor() {
			super(null!, null!);
		}
		public override match(languageId: LanguageId, token: string): number {
			return (
				((this.counter++) << MetadataConsts.FOREGROUND_OFFSET)
				| (languageId << MetadataConsts.LANGUAGEID_OFFSET)
			) >>> 0;
		}
	}

	class MockThemeService implements IStandaloneThemeService {
		declare readonly _serviceBrand: undefined;
		public setTheme(themeName: string): string {
			throw new Error('Not implemented');
		}
		public setAutoDetectHighContrast(autoDetectHighContrast: boolean): void {
			throw new Error('Not implemented');
		}
		public defineTheme(themeName: string, themeData: IStandaloneThemeData): void {
			throw new Error('Not implemented');
		}
		public getColorTheme(): IStandaloneTheme {
			return {
				label: 'mock',

				tokenTheme: new MockTokenTheme(),

				themeName: ColorScheme.LIGHT,

				type: ColorScheme.LIGHT,

				getColor: (color: ColorIdentifier, useDefault?: boolean): Color => {
					throw new Error('Not implemented');
				},

				defines: (color: ColorIdentifier): boolean => {
					throw new Error('Not implemented');
				},

				getTokenStyleMetadata: (type: string, modifiers: string[], modelLanguage: string): ITokenStyle | undefined => {
					return undefined;
				},

				semanticHighlighting: false,

				tokenColorMap: [],

				tokenFontMap: []
			};
		}
		setColorMapOverride(colorMapOverride: Color[] | null): void {
		}
		public getFileIconTheme(): IFileIconTheme {
			return {
				hasFileIcons: false,
				hasFolderIcons: false,
				hidesExplorerArrows: false
			};
		}

		private _builtInProductIconTheme = new UnthemedProductIconTheme();

		public getProductIconTheme(): IProductIconTheme {
			return this._builtInProductIconTheme;
		}
		public readonly onDidColorThemeChange = new Emitter<IColorTheme>().event;
		public readonly onDidFileIconThemeChange = new Emitter<IFileIconTheme>().event;
		public readonly onDidProductIconThemeChange = new Emitter<IProductIconTheme>().event;
	}

	class MockState implements IState {
		public static readonly INSTANCE = new MockState();
		private constructor() { }
		public clone(): IState {
			return this;
		}
		public equals(other: IState): boolean {
			return this === other;
		}
	}

	function testBadTokensProvider(providerTokens: IToken[], expectedClassicTokens: Token[], expectedModernTokens: number[]): void {

		class BadTokensProvider implements TokensProvider {
			public getInitialState(): IState {
				return MockState.INSTANCE;
			}
			public tokenize(line: string, state: IState): ILineTokens {
				return {
					tokens: providerTokens,
					endState: MockState.INSTANCE
				};
			}
		}

		const disposables = new DisposableStore();
		const languageService = disposables.add(new LanguageService());
		disposables.add(languageService.registerLanguage({ id: languageId }));
		const adapter = new TokenizationSupportAdapter(
			languageId,
			new BadTokensProvider(),
			languageService,
			new MockThemeService()
		);

		const actualClassicTokens = adapter.tokenize('whatever', true, MockState.INSTANCE);
		assert.deepStrictEqual(actualClassicTokens.tokens, expectedClassicTokens);

		const actualModernTokens = adapter.tokenizeEncoded('whatever', true, MockState.INSTANCE);
		const modernTokens: number[] = [];
		for (let i = 0; i < actualModernTokens.tokens.length; i++) {
			modernTokens[i] = actualModernTokens.tokens[i];
		}

		// Add the encoded language id to the expected tokens
		const encodedLanguageId = languageService.languageIdCodec.encodeLanguageId(languageId);
		const tokenLanguageMetadata = (encodedLanguageId << MetadataConsts.LANGUAGEID_OFFSET);
		for (let i = 1; i < expectedModernTokens.length; i += 2) {
			expectedModernTokens[i] |= tokenLanguageMetadata;
		}
		assert.deepStrictEqual(modernTokens, expectedModernTokens);

		disposables.dispose();
	}

	test('tokens always start at index 0', () => {
		testBadTokensProvider(
			[
				{ startIndex: 7, scopes: 'foo' },
				{ startIndex: 0, scopes: 'bar' }
			],
			[
				new Token(0, 'foo', languageId),
				new Token(0, 'bar', languageId),
			],
			[
				0, (0 << MetadataConsts.FOREGROUND_OFFSET) | MetadataConsts.BALANCED_BRACKETS_MASK,
				0, (1 << MetadataConsts.FOREGROUND_OFFSET) | MetadataConsts.BALANCED_BRACKETS_MASK
			]
		);
	});

	test('tokens always start after each other', () => {
		testBadTokensProvider(
			[
				{ startIndex: 0, scopes: 'foo' },
				{ startIndex: 5, scopes: 'bar' },
				{ startIndex: 3, scopes: 'foo' },
			],
			[
				new Token(0, 'foo', languageId),
				new Token(5, 'bar', languageId),
				new Token(5, 'foo', languageId),
			],
			[
				0, (0 << MetadataConsts.FOREGROUND_OFFSET) | MetadataConsts.BALANCED_BRACKETS_MASK,
				5, (1 << MetadataConsts.FOREGROUND_OFFSET) | MetadataConsts.BALANCED_BRACKETS_MASK,
				5, (2 << MetadataConsts.FOREGROUND_OFFSET) | MetadataConsts.BALANCED_BRACKETS_MASK
			]
		);
	});
});
