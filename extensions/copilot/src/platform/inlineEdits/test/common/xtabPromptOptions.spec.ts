/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { ImportChanges } from '../../common/dataTypes/importFilteringOptions';
import { applyStrategyConfig, DEFAULT_OPTIONS, GlobalBudgetOptions, IncludeLineNumbersOption, MODEL_CONFIGURATION_VALIDATOR, ModelConfiguration, PromptingStrategy } from '../../common/dataTypes/xtabPromptOptions';

function baseConfig(overrides: Partial<ModelConfiguration> = {}): ModelConfiguration {
	return {
		modelName: 'test-model',
		promptingStrategy: undefined,
		includeTagsInCurrentFile: true,
		lintOptions: undefined,
		...overrides,
	};
}

describe('applyStrategyConfig', () => {

	it('returns config unchanged when strategy has no entry', () => {
		const config = baseConfig({ promptingStrategy: PromptingStrategy.Xtab275 });
		expect(applyStrategyConfig(config)).toBe(config);
	});

	it('returns config unchanged when strategy is undefined', () => {
		const config = baseConfig();
		expect(applyStrategyConfig(config)).toBe(config);
	});

	it('forces includeTagsInCurrentFile=true for CopilotNesXtab', () => {
		const result = applyStrategyConfig(baseConfig({
			promptingStrategy: PromptingStrategy.CopilotNesXtab,
			includeTagsInCurrentFile: false,
		}));
		expect(result.includeTagsInCurrentFile).toBe(true);
	});

	it('forces baked-in fields for PatchBased02WithRecentLineNumbers', () => {
		const result = applyStrategyConfig(baseConfig({
			promptingStrategy: PromptingStrategy.PatchBased02WithRecentLineNumbers,
			includeTagsInCurrentFile: true,
			includePostScript: false,
			currentFile: { includeLineNumbers: IncludeLineNumbersOption.None, maxTokens: 42 },
			recentlyViewedDocuments: { includeLineNumbers: IncludeLineNumbersOption.None, maxTokens: 99 },
			supportsNextCursorLinePrediction: true,
		}));
		expect(result).toMatchObject({
			includeTagsInCurrentFile: false,
			includePostScript: true,
			currentFile: { includeLineNumbers: IncludeLineNumbersOption.WithoutSpace, maxTokens: 42 },
			recentlyViewedDocuments: { includeLineNumbers: IncludeLineNumbersOption.WithoutSpace, maxTokens: 99 },
			supportsNextCursorLinePrediction: false,
		});
	});

	it('forces recentlyViewedDocuments.includeLineNumbers=None for PatchBased02WithoutRecentLineNumbers', () => {
		const result = applyStrategyConfig(baseConfig({
			promptingStrategy: PromptingStrategy.PatchBased02WithoutRecentLineNumbers,
			recentlyViewedDocuments: { includeLineNumbers: IncludeLineNumbersOption.WithSpaceAfter },
		}));
		expect(result.recentlyViewedDocuments?.includeLineNumbers).toBe(IncludeLineNumbersOption.None);
		expect(result.currentFile?.includeLineNumbers).toBe(IncludeLineNumbersOption.WithoutSpace);
	});

	it('preserves undefined for option bags neither side specifies', () => {
		const result = applyStrategyConfig(baseConfig({
			promptingStrategy: PromptingStrategy.CopilotNesXtab,
		}));
		// CopilotNesXtab only sets includeTagsInCurrentFile; nested option bags should stay undefined.
		expect(result.currentFile).toBeUndefined();
		expect(result.recentlyViewedDocuments).toBeUndefined();
		expect(result.lintOptions).toBeUndefined();
	});

	it('preserves allowImportChanges through strategy application', () => {
		const result = applyStrategyConfig(baseConfig({
			promptingStrategy: PromptingStrategy.CopilotNesXtab,
			allowImportChanges: ImportChanges.All,
		}));
		expect(result.allowImportChanges).toBe(ImportChanges.All);
	});
});

describe('MODEL_CONFIGURATION_VALIDATOR', () => {

	it('accepts a config with allowImportChanges', () => {
		const result = MODEL_CONFIGURATION_VALIDATOR.validate(baseConfig({ allowImportChanges: ImportChanges.All }));
		expect(result.error).toBeUndefined();
		expect(result.content?.allowImportChanges).toBe(ImportChanges.All);
	});

	it('accepts a config without allowImportChanges', () => {
		const result = MODEL_CONFIGURATION_VALIDATOR.validate(baseConfig());
		expect(result.error).toBeUndefined();
		expect(result.content?.allowImportChanges).toBeUndefined();
	});

	it('rejects an invalid allowImportChanges value', () => {
		const result = MODEL_CONFIGURATION_VALIDATOR.validate(baseConfig({ allowImportChanges: 'sometimes' as ImportChanges }));
		expect(result.error).toBeDefined();
	});
});

describe('GlobalBudgetOptions', () => {

	function gb(overrides: Partial<GlobalBudgetOptions> = {}): GlobalBudgetOptions {
		return {
			totalTokens: GlobalBudgetOptions.DEFAULT_TOTAL_TOKENS,
			order: GlobalBudgetOptions.DEFAULT_ORDER,
			shares: GlobalBudgetOptions.DEFAULT_SHARES,
			...overrides,
		};
	}

	describe('volume-neutral defaults', () => {
		// Guards the core no-regression promise: enabling the global budget with the
		// default total + shares must reproduce today's per-part `maxTokens` caps
		// exactly. If anyone changes DEFAULT_SHARES or DEFAULT_TOTAL_TOKENS in a way
		// that shifts a part's budget, this fails loudly instead of silently
		// shrinking/growing prompts in the experiment arm.
		it('reproduce the legacy per-part caps', () => {
			const total = GlobalBudgetOptions.DEFAULT_TOTAL_TOKENS;
			const shares = GlobalBudgetOptions.DEFAULT_SHARES;
			const computed = {
				currentFile: Math.floor(total * shares.currentFile),
				recentlyViewedDocuments: Math.floor(total * shares.recentlyViewedDocuments),
				languageContext: Math.floor(total * shares.languageContext),
				neighborFiles: Math.floor(total * shares.neighborFiles),
				diffHistory: Math.floor(total * shares.diffHistory),
			};
			expect(computed).toEqual({
				currentFile: DEFAULT_OPTIONS.currentFile.maxTokens,
				recentlyViewedDocuments: DEFAULT_OPTIONS.recentlyViewedDocuments.maxTokens,
				languageContext: DEFAULT_OPTIONS.languageContext.maxTokens,
				neighborFiles: DEFAULT_OPTIONS.neighborFiles.maxTokens,
				diffHistory: DEFAULT_OPTIONS.diffHistory.maxTokens,
			});
		});

		it('shares sum to exactly 1', () => {
			const shares = GlobalBudgetOptions.DEFAULT_SHARES;
			const sum = shares.currentFile + shares.recentlyViewedDocuments + shares.languageContext + shares.neighborFiles + shares.diffHistory;
			expect(sum).toBe(1);
		});
	});

	describe('currentFileBudget', () => {
		it('floors totalTokens * shares.currentFile', () => {
			expect(GlobalBudgetOptions.currentFileBudget(gb({ totalTokens: 8000, shares: { ...GlobalBudgetOptions.DEFAULT_SHARES, currentFile: 2 / 8 } }))).toBe(2000);
			expect(GlobalBudgetOptions.currentFileBudget(gb({ totalTokens: 999, shares: { ...GlobalBudgetOptions.DEFAULT_SHARES, currentFile: 1 / 3 } }))).toBe(333);
		});

		it('clamps at 0 for a zero share', () => {
			expect(GlobalBudgetOptions.currentFileBudget(gb({ totalTokens: 8000, shares: { ...GlobalBudgetOptions.DEFAULT_SHARES, currentFile: 0 } }))).toBe(0);
		});
	});

	describe('validate', () => {
		it('accepts the defaults', () => {
			expect(() => GlobalBudgetOptions.validate(gb())).not.toThrow();
		});

		it('throws on a duplicate part in order', () => {
			expect(() => GlobalBudgetOptions.validate(gb({
				order: ['languageContext', 'languageContext', 'recentlyViewedDocuments', 'neighborFiles', 'diffHistory'],
			}))).toThrow(/duplicate part 'languageContext'/);
		});

		it('throws when shares omit currentFile', () => {
			expect(() => GlobalBudgetOptions.validate(gb({
				shares: { languageContext: 0.25, recentlyViewedDocuments: 0.25, neighborFiles: 0.25, diffHistory: 0.25 } as GlobalBudgetOptions['shares'],
			}))).toThrow(/missing entry for 'currentFile'/);
		});

		it('throws when shares do not sum to ~1 across order plus currentFile', () => {
			expect(() => GlobalBudgetOptions.validate(gb({
				shares: { ...GlobalBudgetOptions.DEFAULT_SHARES, currentFile: 0.9 },
			}))).toThrow(/shares across order must sum to ~1/);
		});

		it('throws when neighborFiles is ordered before recentlyViewedDocuments', () => {
			expect(() => GlobalBudgetOptions.validate(gb({
				order: ['languageContext', 'neighborFiles', 'recentlyViewedDocuments', 'diffHistory'],
			}))).toThrow(/must place 'recentlyViewedDocuments' before 'neighborFiles'/);
		});

		it('throws on a negative totalTokens', () => {
			expect(() => GlobalBudgetOptions.validate(gb({ totalTokens: -1 }))).toThrow(/totalTokens must be a finite, non-negative number/);
		});

		it('throws on a negative share (which would break budget conservation)', () => {
			// Sums to 1 so the legacy sum check passes, but a negative share clamps to
			// a 0 allocation yet still counts toward the sum, letting other parts
			// over-allocate past the pool. Must be rejected.
			expect(() => GlobalBudgetOptions.validate(gb({
				shares: { currentFile: 0.25, languageContext: -0.25, recentlyViewedDocuments: 1.0, neighborFiles: 0, diffHistory: 0 },
			}))).toThrow(/must be a finite, non-negative number/);
		});

		it('throws on a non-finite share', () => {
			expect(() => GlobalBudgetOptions.validate(gb({
				shares: { ...GlobalBudgetOptions.DEFAULT_SHARES, currentFile: Number.NaN },
			}))).toThrow(/must be a finite, non-negative number/);
		});
	});

	describe('fromConfigString', () => {
		it('fills every omitted field with the defaults', () => {
			const result = GlobalBudgetOptions.fromConfigString('{}');
			expect(result.isOk() && result.val).toEqual({
				totalTokens: GlobalBudgetOptions.DEFAULT_TOTAL_TOKENS,
				order: GlobalBudgetOptions.DEFAULT_ORDER,
				shares: GlobalBudgetOptions.DEFAULT_SHARES,
			});
		});

		it('overrides only the fields present in the JSON', () => {
			const result = GlobalBudgetOptions.fromConfigString(JSON.stringify({ totalTokens: 6000 }));
			expect(result.isOk() && result.val).toEqual({
				totalTokens: 6000,
				order: GlobalBudgetOptions.DEFAULT_ORDER,
				shares: GlobalBudgetOptions.DEFAULT_SHARES,
			});
		});

		it('parses a fully-specified config and ignores unknown keys', () => {
			const order: GlobalBudgetOptions['order'] = ['languageContext', 'recentlyViewedDocuments', 'neighborFiles', 'diffHistory'];
			const shares: GlobalBudgetOptions['shares'] = { currentFile: 0.4, languageContext: 0.2, recentlyViewedDocuments: 0.2, neighborFiles: 0.1, diffHistory: 0.1 };
			const result = GlobalBudgetOptions.fromConfigString(JSON.stringify({ totalTokens: 12000, order, shares, unknown: 'ignored' }));
			expect(result.isOk() && result.val).toEqual({ totalTokens: 12000, order, shares });
		});

		it('errors on malformed JSON', () => {
			expect(GlobalBudgetOptions.fromConfigString('{ not json').isError()).toBe(true);
		});

		it('errors when a field has the wrong type', () => {
			expect(GlobalBudgetOptions.fromConfigString(JSON.stringify({ totalTokens: '6000' })).isError()).toBe(true);
		});

		it('errors on an unknown part in order', () => {
			expect(GlobalBudgetOptions.fromConfigString(JSON.stringify({ order: ['languageContext', 'bogus'] })).isError()).toBe(true);
		});

		it('errors when shares are partial (every part is required)', () => {
			expect(GlobalBudgetOptions.fromConfigString(JSON.stringify({ shares: { currentFile: 1 } })).isError()).toBe(true);
		});

		it('errors when the merged config is semantically invalid', () => {
			const shares = { currentFile: 0.9, languageContext: 0.2, recentlyViewedDocuments: 0.2, neighborFiles: 0.1, diffHistory: 0.1 };
			expect(GlobalBudgetOptions.fromConfigString(JSON.stringify({ shares })).isError()).toBe(true);
		});
	});
});
