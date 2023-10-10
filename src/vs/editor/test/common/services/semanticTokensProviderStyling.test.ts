/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { SparseMultilineTokens } from 'vs/editor/common/tokens/sparseMultilineTokens';
import { MetadataConsts } from 'vs/editor/common/encodedTokenAttributes';
import { SemanticTokensProviderStyling, toMultilineTokens2 } from 'vs/editor/common/services/semanticTokensProviderStyling';
import { createModelServices } from 'vs/editor/test/common/testTextModel';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { IThemeService, ITokenStyle } from 'vs/platform/theme/common/themeService';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

suite('ModelService', () => {
	let disposables: DisposableStore;
	let instantiationService: TestInstantiationService;
	let languageService: ILanguageService;

	setup(() => {
		disposables = new DisposableStore();
		instantiationService = createModelServices(disposables);
		languageService = instantiationService.get(ILanguageService);
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('issue #134973: invalid semantic tokens should be handled better', () => {
		const languageId = 'java';
		disposables.add(languageService.registerLanguage({ id: languageId }));
		const legend = {
			tokenTypes: ['st0', 'st1', 'st2', 'st3', 'st4', 'st5', 'st6', 'st7', 'st8', 'st9', 'st10'],
			tokenModifiers: []
		};
		instantiationService.stub(IThemeService, <Partial<IThemeService>>{
			getColorTheme() {
				return {
					getTokenStyleMetadata: (tokenType, tokenModifiers, languageId): ITokenStyle => {
						return {
							foreground: parseInt(tokenType.substr(2), 10),
							bold: undefined,
							underline: undefined,
							strikethrough: undefined,
							italic: undefined
						};
					}
				};
			}
		});
		const styling = instantiationService.createInstance(SemanticTokensProviderStyling, legend);
		const badTokens = {
			data: new Uint32Array([
				0, 13, 16, 1, 0,
				1, 2, 6, 2, 0,
				0, 7, 6, 3, 0,
				0, 15, 8, 4, 0,
				0, 17, 1, 5, 0,
				0, 7, 5, 6, 0,
				1, 12, 8, 7, 0,
				0, 19, 5, 8, 0,
				0, 7, 1, 9, 0,
				0, 4294967294, 5, 10, 0
			])
		};
		const result = toMultilineTokens2(badTokens, styling, languageId);
		const expected = SparseMultilineTokens.create(1, new Uint32Array([
			0, 13, 29, (MetadataConsts.SEMANTIC_USE_FOREGROUND | (1 << MetadataConsts.FOREGROUND_OFFSET)),
			1, 2, 8, (MetadataConsts.SEMANTIC_USE_FOREGROUND | (2 << MetadataConsts.FOREGROUND_OFFSET)),
			1, 9, 15, (MetadataConsts.SEMANTIC_USE_FOREGROUND | (3 << MetadataConsts.FOREGROUND_OFFSET)),
			1, 24, 32, (MetadataConsts.SEMANTIC_USE_FOREGROUND | (4 << MetadataConsts.FOREGROUND_OFFSET)),
			1, 41, 42, (MetadataConsts.SEMANTIC_USE_FOREGROUND | (5 << MetadataConsts.FOREGROUND_OFFSET)),
			1, 48, 53, (MetadataConsts.SEMANTIC_USE_FOREGROUND | (6 << MetadataConsts.FOREGROUND_OFFSET)),
			2, 12, 20, (MetadataConsts.SEMANTIC_USE_FOREGROUND | (7 << MetadataConsts.FOREGROUND_OFFSET)),
			2, 31, 36, (MetadataConsts.SEMANTIC_USE_FOREGROUND | (8 << MetadataConsts.FOREGROUND_OFFSET)),
			2, 38, 39, (MetadataConsts.SEMANTIC_USE_FOREGROUND | (9 << MetadataConsts.FOREGROUND_OFFSET)),
		]));
		assert.deepStrictEqual(result.toString(), expected.toString());
	});

	test('issue #148651: VSCode UI process can hang if a semantic token with negative values is returned by language service', () => {
		const languageId = 'dockerfile';
		disposables.add(languageService.registerLanguage({ id: languageId }));
		const legend = {
			tokenTypes: ['st0', 'st1', 'st2', 'st3', 'st4', 'st5', 'st6', 'st7', 'st8', 'st9'],
			tokenModifiers: ['stm0', 'stm1', 'stm2']
		};
		instantiationService.stub(IThemeService, <Partial<IThemeService>>{
			getColorTheme() {
				return {
					getTokenStyleMetadata: (tokenType, tokenModifiers, languageId): ITokenStyle => {
						return {
							foreground: parseInt(tokenType.substr(2), 10),
							bold: undefined,
							underline: undefined,
							strikethrough: undefined,
							italic: undefined
						};
					}
				};
			}
		});
		const styling = instantiationService.createInstance(SemanticTokensProviderStyling, legend);
		const badTokens = {
			data: new Uint32Array([
				0, 0, 3, 0, 0,
				0, 4, 2, 2, 0,
				0, 2, 3, 8, 0,
				0, 3, 1, 9, 0,
				0, 1, 1, 10, 0,
				0, 1, 4, 8, 0,
				0, 4, 4294967292, 2, 0,
				0, 4294967292, 4294967294, 8, 0,
				0, 4294967294, 1, 9, 0,
				0, 1, 1, 10, 0,
				0, 1, 3, 8, 0,
				0, 3, 4294967291, 8, 0,
				0, 4294967291, 1, 9, 0,
				0, 1, 1, 10, 0,
				0, 1, 4, 8, 0
			])
		};
		const result = toMultilineTokens2(badTokens, styling, languageId);
		const expected = SparseMultilineTokens.create(1, new Uint32Array([
			0, 4, 6, (MetadataConsts.SEMANTIC_USE_FOREGROUND | (1 << MetadataConsts.FOREGROUND_OFFSET)),
			0, 6, 9, (MetadataConsts.SEMANTIC_USE_FOREGROUND | (2 << MetadataConsts.FOREGROUND_OFFSET)),
			0, 9, 10, (MetadataConsts.SEMANTIC_USE_FOREGROUND | (3 << MetadataConsts.FOREGROUND_OFFSET)),
			0, 11, 15, (MetadataConsts.SEMANTIC_USE_FOREGROUND | (4 << MetadataConsts.FOREGROUND_OFFSET)),
		]));
		assert.deepStrictEqual(result.toString(), expected.toString());
	});

	test('issue #149130: vscode freezes because of Bracket Pair Colorization', () => {
		const languageId = 'q';
		disposables.add(languageService.registerLanguage({ id: languageId }));
		const legend = {
			tokenTypes: ['st0', 'st1', 'st2', 'st3', 'st4', 'st5'],
			tokenModifiers: ['stm0', 'stm1', 'stm2']
		};
		instantiationService.stub(IThemeService, <Partial<IThemeService>>{
			getColorTheme() {
				return {
					getTokenStyleMetadata: (tokenType, tokenModifiers, languageId): ITokenStyle => {
						return {
							foreground: parseInt(tokenType.substr(2), 10),
							bold: undefined,
							underline: undefined,
							strikethrough: undefined,
							italic: undefined
						};
					}
				};
			}
		});
		const styling = instantiationService.createInstance(SemanticTokensProviderStyling, legend);
		const badTokens = {
			data: new Uint32Array([
				0, 11, 1, 1, 0,
				0, 4, 1, 1, 0,
				0, 4294967289, 1, 1, 0
			])
		};
		const result = toMultilineTokens2(badTokens, styling, languageId);
		const expected = SparseMultilineTokens.create(1, new Uint32Array([
			0, 11, 12, (MetadataConsts.SEMANTIC_USE_FOREGROUND | (1 << MetadataConsts.FOREGROUND_OFFSET)),
			0, 15, 16, (MetadataConsts.SEMANTIC_USE_FOREGROUND | (1 << MetadataConsts.FOREGROUND_OFFSET)),
		]));
		assert.deepStrictEqual(result.toString(), expected.toString());
	});
});
