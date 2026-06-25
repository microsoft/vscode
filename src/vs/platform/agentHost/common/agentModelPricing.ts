/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SessionModelInfo } from './state/protocol/state.js';
import type { IAgentModelInfo } from './agentService.js';

/**
 * Well-known pricing metadata carried under a model's open `_meta` bag (see {@link IAgentModelInfo._meta} /
 * {@link SessionModelInfo._meta}). Agents that know a model's billing details populate these keys so the chat model
 * picker can render its cost hover.
 *
 * All cost values are expressed as credits per 1M tokens — the same unit the model picker hover renders (see
 * `getModelHoverContent` in `chatModelPicker.ts`). Fields are optional; agents omit what they don't know.
 */
export interface IAgentModelPricingMeta {
	/** Request multiplier (e.g. `1.5` rendered as "1.5x"). */
	readonly multiplierNumeric?: number;
	/** Default-tier input cost in credits per 1M tokens. */
	readonly inputCost?: number;
	/** Default-tier cached-input (read) cost in credits per 1M tokens. */
	readonly cacheCost?: number;
	/** Default-tier cache-write cost in credits per 1M tokens. */
	readonly cacheWriteCost?: number;
	/** Default-tier output cost in credits per 1M tokens. */
	readonly outputCost?: number;
	/** Long-context-tier input cost in credits per 1M tokens. */
	readonly longContextInputCost?: number;
	/** Long-context-tier cached-input (read) cost in credits per 1M tokens. */
	readonly longContextCacheCost?: number;
	/** Long-context-tier cache-write cost in credits per 1M tokens. */
	readonly longContextCacheWriteCost?: number;
	/** Long-context-tier output cost in credits per 1M tokens. */
	readonly longContextOutputCost?: number;
	/** Coarse price bucket (e.g. `low`, `medium`, `high`) for an at-a-glance tag. */
	readonly priceCategory?: string;
	/** Whole-number percentage discount (0-100) for the synthetic `auto` model; shown as a "{n}% discount" detail. */
	readonly discountPercent?: number;
}

const NUMBER_KEYS = [
	'multiplierNumeric',
	'inputCost',
	'cacheCost',
	'cacheWriteCost',
	'outputCost',
	'longContextInputCost',
	'longContextCacheCost',
	'longContextCacheWriteCost',
	'longContextOutputCost',
	'discountPercent',
] as const satisfies readonly (keyof IAgentModelPricingMeta)[];

/**
 * Reads the well-known {@link IAgentModelPricingMeta} keys from a model's open `_meta` bag, ignoring any unrelated
 * provider-specific keys and values of the wrong type. Returns an object containing only the keys that were present
 * with a valid value.
 */
export function readAgentModelPricingMeta(model: IAgentModelInfo | SessionModelInfo): IAgentModelPricingMeta {
	const meta = model._meta;
	if (!meta) {
		return {};
	}
	const result: { -readonly [K in keyof IAgentModelPricingMeta]: IAgentModelPricingMeta[K] } = {};
	for (const key of NUMBER_KEYS) {
		const value = meta[key];
		if (typeof value === 'number') {
			result[key] = value;
		}
	}
	if (typeof meta.priceCategory === 'string') {
		result.priceCategory = meta.priceCategory;
	}
	return result;
}

/**
 * Builds a `_meta` payload from {@link IAgentModelPricingMeta}, dropping `undefined` entries. Returns `undefined` when
 * no pricing fields are known so callers can avoid attaching an empty `_meta` object.
 */
export function createAgentModelPricingMeta(pricing: IAgentModelPricingMeta): Record<string, unknown> | undefined {
	const entries = Object.entries(pricing).filter(([, value]) => value !== undefined);
	return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

/**
 * Runtime shape of the CAPI model billing payload. The published SDK types (`CCAModelBilling`, `ModelBilling`) don't
 * yet declare `tokenPrices`, `priceCategory`, or `discountPercent`, but the `/models` endpoint already carries them.
 * Both Copilot and Claude agents narrow through this interface at the read boundary.
 *
 * Remove individual fields as the SDK catches up (tracked at microsoft/vscode-capi#85).
 */
export interface ICAPIModelBilling {
	readonly multiplier?: number;
	/** Coarse price bucket surfaced as a tag in the model picker hover. */
	readonly priceCategory?: string;
	/** Whole-number percentage discount (0-100) for the synthetic `auto` model; rendered as a "{n}% discount" detail. */
	readonly discountPercent?: number;
	readonly tokenPrices?: {
		readonly contextMax?: number;
		readonly inputPrice?: number;
		readonly cachePrice?: number;
		readonly cacheWritePrice?: number;
		readonly outputPrice?: number;
		readonly longContext?: {
			readonly contextMax?: number;
			readonly inputPrice?: number;
			readonly cachePrice?: number;
			readonly cacheWritePrice?: number;
			readonly outputPrice?: number;
		};
	};
}

/**
 * Converts a CAPI model's billing payload into an {@link IAgentModelPricingMeta} `_meta` bag. Long-context costs are
 * only emitted when they differ from the default tier so the model picker can tell them apart.
 *
 * @param billing - The model's billing info, narrowed through {@link ICAPIModelBilling}.
 * @param priceCategory - An optional override for the price category (e.g. from `modelPickerPriceCategory` on the
 *   model object itself). Falls back to `billing.priceCategory` when not provided.
 */
export function createPricingMetaFromBilling(billing: ICAPIModelBilling | undefined, priceCategory?: string): Record<string, unknown> | undefined {
	const tokenPrices = billing?.tokenPrices;
	const longContext = tokenPrices?.longContext;

	const differsFromDefault = (longValue: number | undefined, defaultValue: number | undefined): number | undefined =>
		longValue !== undefined && longValue !== defaultValue ? longValue : undefined;

	return createAgentModelPricingMeta({
		multiplierNumeric: typeof billing?.multiplier === 'number' ? billing.multiplier : undefined,
		inputCost: tokenPrices?.inputPrice,
		cacheCost: tokenPrices?.cachePrice,
		cacheWriteCost: tokenPrices?.cacheWritePrice,
		outputCost: tokenPrices?.outputPrice,
		longContextInputCost: differsFromDefault(longContext?.inputPrice, tokenPrices?.inputPrice),
		longContextCacheCost: differsFromDefault(longContext?.cachePrice, tokenPrices?.cachePrice),
		longContextCacheWriteCost: differsFromDefault(longContext?.cacheWritePrice, tokenPrices?.cacheWritePrice),
		longContextOutputCost: differsFromDefault(longContext?.outputPrice, tokenPrices?.outputPrice),
		priceCategory: priceCategory ?? (typeof billing?.priceCategory === 'string' ? billing.priceCategory : undefined),
		discountPercent: typeof billing?.discountPercent === 'number' ? billing.discountPercent : undefined,
	});
}

/**
 * Whether the model's long-context tier has any cost that differs from its default tier.
 * Used to decide whether to show a context-size picker (surcharge → user opts in) or to
 * silently use the full context window for free.
 */
export function hasLongContextSurcharge(billing: ICAPIModelBilling | undefined): boolean {
	const tokenPrices = billing?.tokenPrices;
	const longContext = tokenPrices?.longContext;
	if (!longContext) {
		return false;
	}
	return (longContext.inputPrice !== undefined && longContext.inputPrice !== tokenPrices?.inputPrice)
		|| (longContext.outputPrice !== undefined && longContext.outputPrice !== tokenPrices?.outputPrice)
		|| (longContext.cachePrice !== undefined && longContext.cachePrice !== tokenPrices?.cachePrice)
		|| (longContext.cacheWritePrice !== undefined && longContext.cacheWritePrice !== tokenPrices?.cacheWritePrice);
}
