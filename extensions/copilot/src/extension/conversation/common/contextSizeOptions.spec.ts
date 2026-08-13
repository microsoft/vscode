/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, test } from 'vitest';
import { getContextSizeOptions, normalizeTokenPrices } from './languageModelAccess';

describe('normalizeTokenPrices long-context window', () => {
	test('keeps longContextMax when long-context prices match default (free long context)', () => {
		const result = normalizeTokenPrices({
			batch_size: 1_000_000,
			default: { input_price: 3, output_price: 15, context_max: 272_000 },
			long_context: { input_price: 3, output_price: 15, context_max: 1_000_000 },
		});
		expect(result?.longContext).toBeUndefined();
		expect(result?.longContextMax).toBe(1_000_000);
		expect(result?.default.contextMax).toBe(272_000);
	});

	test('falls back to max_prompt_tokens when context_max is absent', () => {
		const result = normalizeTokenPrices({
			batch_size: 1_000_000,
			default: { input_price: 3, output_price: 15, max_prompt_tokens: 272_000 },
			long_context: { input_price: 6, output_price: 30, max_prompt_tokens: 1_000_000 },
		});
		expect(result?.default.contextMax).toBe(272_000);
		expect(result?.longContext?.contextMax).toBe(1_000_000);
		expect(result?.longContextMax).toBe(1_000_000);
	});

	test('reads cache_read_price as the current CAPI cache field', () => {
		const result = normalizeTokenPrices({
			batch_size: 1_000_000,
			default: { input_price: 3, output_price: 15, cache_read_price: 0.3, max_prompt_tokens: 272_000 },
			long_context: { input_price: 6, output_price: 30, cache_read_price: 0.6, max_prompt_tokens: 1_000_000 },
		});
		expect(result?.default.cachePrice).toBe(0.3);
		expect(result?.longContext?.cachePrice).toBe(0.6);
	});
});

describe('getContextSizeOptions', () => {
	function endpoint(overrides: { modelMaxPromptTokens: number; defaultContextMax?: number; longContextMax?: number; longContextPricing?: boolean }) {
		return {
			modelMaxPromptTokens: overrides.modelMaxPromptTokens,
			tokenPricing: {
				default: {
					inputPrice: 3,
					outputPrice: 15,
					cacheReadTokenPrice: undefined,
					cacheWriteTokenPrice: undefined,
					contextMax: overrides.defaultContextMax,
				},
				longContext: overrides.longContextPricing
					? {
						inputPrice: 6,
						outputPrice: 30,
						cacheReadTokenPrice: undefined,
						cacheWriteTokenPrice: undefined,
						contextMax: overrides.longContextMax,
					}
					: undefined,
				longContextMax: overrides.longContextPricing ? undefined : overrides.longContextMax,
			},
		};
	}

	test('shows context size when free long context is larger than the prompt budget (regression for #330481)', () => {
		const options = getContextSizeOptions(endpoint({
			modelMaxPromptTokens: 272_000,
			defaultContextMax: 272_000,
			longContextMax: 1_000_000,
		}), false);
		expect(options?.map(o => o.value)).toEqual([272_000, 1_000_000]);
	});

	test('shows context size when billed default contextMax is missing (new Local session)', () => {
		const options = getContextSizeOptions(endpoint({
			modelMaxPromptTokens: 272_000,
			longContextMax: 1_000_000,
		}), false);
		expect(options?.map(o => o.value)).toEqual([272_000, 1_000_000]);
	});

	test('hides context size when the model has no larger long-context window', () => {
		expect(getContextSizeOptions(endpoint({
			modelMaxPromptTokens: 272_000,
			defaultContextMax: 272_000,
		}), false)).toBeUndefined();
	});

	test('shows only the long-context option when preferLongContext is on and there is no surcharge', () => {
		const options = getContextSizeOptions(endpoint({
			modelMaxPromptTokens: 272_000,
			defaultContextMax: 272_000,
			longContextMax: 1_000_000,
		}), true);
		expect(options).toEqual([
			{ value: 1_000_000, description: 'Longer sessions', isDefault: true },
		]);
	});
});
