/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CCAModel } from '@vscode/copilot-api';
import { createAgentModelPricingMeta, type IAgentModelPricingMeta } from '../../common/agentModelPricing.js';

const TOKENS_PER_MILLION = 1_000_000;
const NANO_AIU_DIVISOR = 1_000_000_000;

/**
 * Raw per-tier token prices as they appear on the runtime CAPI `/models`
 * payload. Values are expressed in AIUs per `batch_size` tokens (tiered
 * format) — {@link normalizeTokenPrices} converts them to credits per 1M.
 */
interface ICapiTokenPriceTier {
	readonly input_price?: number;
	readonly cache_price?: number;
	readonly cache_write_price?: number;
	readonly output_price?: number;
	readonly context_max?: number;
}

/**
 * Raw `billing.token_prices` shape from the runtime CAPI `/models` payload.
 * Supports both the tiered format (`default` / `long_context`, AIUs) and the
 * legacy flat format (top-level `*_price`, nano-AIUs).
 */
interface ICapiTokenPrices {
	readonly batch_size?: number;
	readonly input_price?: number;
	readonly cache_price?: number;
	readonly output_price?: number;
	readonly default?: ICapiTokenPriceTier;
	readonly long_context?: ICapiTokenPriceTier;
}

/**
 * Runtime-only fields the CAPI `/models` payload carries but the published
 * `@vscode/copilot-api` `CCAModel` / `CCAModelBilling` types don't yet
 * declare. Narrow through this augmentation rather than casting to `any` —
 * mirrors the `IClaudeModelSupports` / `ICopilotModelBilling` pattern used
 * elsewhere in the agent host.
 */
interface ICapiModelPricingRuntime {
	readonly billing?: {
		readonly multiplier?: number;
		readonly token_prices?: ICapiTokenPrices;
	};
	readonly model_picker_price_category?: string;
}

interface INormalizedPriceTier {
	readonly inputPrice: number;
	readonly outputPrice: number;
	readonly cachePrice: number | undefined;
	readonly cacheWritePrice: number | undefined;
}

interface INormalizedTokenPricing {
	readonly default: INormalizedPriceTier;
	readonly longContext?: INormalizedPriceTier;
}

/**
 * Converts raw CAPI billing token prices into normalized credits (AICs) per
 * 1M tokens. Handles both the tiered (AIU) and legacy flat (nano-AIU)
 * formats. When a `long_context` tier is present but its prices match the
 * `default` tier, it is omitted. Mirrors `normalizeTokenPrices` in the
 * Copilot Chat extension's `languageModelAccess.ts`.
 */
function normalizeTokenPrices(tokenPrices: ICapiTokenPrices | undefined): INormalizedTokenPricing | undefined {
	if (!tokenPrices) {
		return undefined;
	}
	const batchSize = tokenPrices.batch_size ?? TOKENS_PER_MILLION;
	const scale = TOKENS_PER_MILLION / batchSize;
	const defaultTier = tokenPrices.default;

	if (defaultTier && defaultTier.input_price !== undefined && defaultTier.output_price !== undefined) {
		// Tiered format (API 2026-06-01+): values are in AIUs.
		const normalized: INormalizedPriceTier = {
			inputPrice: defaultTier.input_price * scale,
			outputPrice: defaultTier.output_price * scale,
			cachePrice: defaultTier.cache_price !== undefined ? defaultTier.cache_price * scale : undefined,
			cacheWritePrice: defaultTier.cache_write_price !== undefined ? defaultTier.cache_write_price * scale : undefined,
		};
		let longContext: INormalizedPriceTier | undefined;
		const lc = tokenPrices.long_context;
		if (lc && lc.input_price !== undefined && lc.output_price !== undefined) {
			const lcNormalized: INormalizedPriceTier = {
				inputPrice: lc.input_price * scale,
				outputPrice: lc.output_price * scale,
				cachePrice: lc.cache_price !== undefined ? lc.cache_price * scale : undefined,
				cacheWritePrice: lc.cache_write_price !== undefined ? lc.cache_write_price * scale : undefined,
			};
			// Only include the long-context tier when prices differ from default.
			if (lcNormalized.inputPrice !== normalized.inputPrice
				|| lcNormalized.outputPrice !== normalized.outputPrice
				|| lcNormalized.cachePrice !== normalized.cachePrice
				|| lcNormalized.cacheWritePrice !== normalized.cacheWritePrice) {
				longContext = lcNormalized;
			}
		}
		return { default: normalized, longContext };
	}

	// Legacy flat format (pre-2026-06-01): values are in nano-AIUs.
	if (tokenPrices.input_price === undefined || tokenPrices.output_price === undefined) {
		return undefined;
	}
	return {
		default: {
			inputPrice: (tokenPrices.input_price / NANO_AIU_DIVISOR) * scale,
			outputPrice: (tokenPrices.output_price / NANO_AIU_DIVISOR) * scale,
			cachePrice: tokenPrices.cache_price !== undefined ? (tokenPrices.cache_price / NANO_AIU_DIVISOR) * scale : undefined,
			cacheWritePrice: undefined,
		},
	};
}

/**
 * Builds the `_meta` pricing payload for an {@link IAgentModelInfo} from a
 * CAPI {@link CCAModel}. Surfaces the request multiplier, per-token costs
 * (credits per 1M tokens, normalized across pricing tiers), and the coarse
 * price category so the chat model picker hover can render full cost details.
 *
 * Returns `undefined` when no pricing fields are known so callers can avoid
 * attaching an empty `_meta` bag. Shared by the Claude and Codex agents,
 * which both source models from CAPI; the Copilot agent uses its own
 * already-normalized SDK model shape.
 */
export function capiModelPricingMeta(model: CCAModel): Record<string, unknown> | undefined {
	const runtime = model as CCAModel & ICapiModelPricingRuntime;
	const billing = runtime.billing;
	const normalized = normalizeTokenPrices(billing?.token_prices);
	const pricing: IAgentModelPricingMeta = {
		multiplierNumeric: typeof billing?.multiplier === 'number' ? billing.multiplier : undefined,
		inputCost: normalized?.default.inputPrice,
		cacheCost: normalized?.default.cachePrice,
		cacheWriteCost: normalized?.default.cacheWritePrice,
		outputCost: normalized?.default.outputPrice,
		longContextInputCost: normalized?.longContext?.inputPrice,
		longContextCacheCost: normalized?.longContext?.cachePrice,
		longContextCacheWriteCost: normalized?.longContext?.cacheWritePrice,
		longContextOutputCost: normalized?.longContext?.outputPrice,
		priceCategory: typeof runtime.model_picker_price_category === 'string' ? runtime.model_picker_price_category : undefined,
	};
	return createAgentModelPricingMeta(pricing);
}
