/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { applyStrategyConfig, IncludeLineNumbersOption, ModelConfiguration, PromptingStrategy } from '../../common/dataTypes/xtabPromptOptions';

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
});
