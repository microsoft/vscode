/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { CCAModel } from '@vscode/copilot-api';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { capiModelPricingMeta } from '../../node/shared/capiModelPricing.js';

function makeModel(billing: unknown, extra?: Record<string, unknown>): CCAModel {
	return { id: 'm', name: 'M', billing, ...extra } as unknown as CCAModel;
}

suite('capiModelPricingMeta', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns undefined when no pricing fields are known', () => {
		assert.strictEqual(capiModelPricingMeta(makeModel(undefined)), undefined);
		assert.strictEqual(capiModelPricingMeta(makeModel({ is_premium: false })), undefined);
	});

	test('surfaces the multiplier on its own', () => {
		assert.deepStrictEqual(capiModelPricingMeta(makeModel({ multiplier: 1.5 })), { multiplierNumeric: 1.5 });
	});

	test('normalizes tiered token prices (AIUs) to credits per 1M tokens and includes price category', () => {
		const meta = capiModelPricingMeta(makeModel(
			{
				multiplier: 1,
				token_prices: {
					batch_size: 1_000_000,
					default: { input_price: 3, output_price: 15, cache_price: 0.3, cache_write_price: 3.75 },
				},
			},
			{ model_picker_price_category: 'high' },
		));
		assert.deepStrictEqual(meta, {
			multiplierNumeric: 1,
			inputCost: 3,
			outputCost: 15,
			cacheCost: 0.3,
			cacheWriteCost: 3.75,
			priceCategory: 'high',
		});
	});

	test('scales tiered prices by batch size', () => {
		const meta = capiModelPricingMeta(makeModel({
			token_prices: {
				batch_size: 500_000,
				default: { input_price: 1, output_price: 2 },
			},
		}));
		// scale = 1_000_000 / 500_000 = 2
		assert.deepStrictEqual(meta, { inputCost: 2, outputCost: 4 });
	});

	test('includes long-context tier only when it differs from default', () => {
		const same = capiModelPricingMeta(makeModel({
			token_prices: {
				batch_size: 1_000_000,
				default: { input_price: 3, output_price: 15 },
				long_context: { input_price: 3, output_price: 15 },
			},
		}));
		assert.deepStrictEqual(same, { inputCost: 3, outputCost: 15 });

		const differs = capiModelPricingMeta(makeModel({
			token_prices: {
				batch_size: 1_000_000,
				default: { input_price: 3, output_price: 15 },
				long_context: { input_price: 6, output_price: 22.5 },
			},
		}));
		assert.deepStrictEqual(differs, {
			inputCost: 3,
			outputCost: 15,
			longContextInputCost: 6,
			longContextOutputCost: 22.5,
		});
	});

	test('normalizes legacy flat token prices (nano-AIUs) to credits per 1M tokens', () => {
		const meta = capiModelPricingMeta(makeModel({
			token_prices: { input_price: 3_000_000_000, output_price: 15_000_000_000, cache_price: 300_000_000 },
		}));
		assert.deepStrictEqual(meta, { inputCost: 3, outputCost: 15, cacheCost: 0.3 });
	});
});
