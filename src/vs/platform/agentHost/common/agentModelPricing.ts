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
	/** Promotional information when the model is experiencing a discount. */
	readonly promo?: {
		readonly id: string;
		readonly discountPercent: number;
		readonly endsAt: string;
		readonly message: string;
	};
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
	const rawPromo = meta.promo;
	if (rawPromo && typeof rawPromo === 'object' && !Array.isArray(rawPromo)) {
		const p = rawPromo as Record<string, unknown>;
		if (typeof p.id === 'string' && typeof p.discountPercent === 'number' && typeof p.endsAt === 'string' && typeof p.message === 'string') {
			result.promo = { id: p.id, discountPercent: p.discountPercent, endsAt: p.endsAt, message: p.message };
		}
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
 * Normalizes a raw CAPI billing payload (which uses snake_case field names like `token_prices`,
 * `input_price`) into the camelCase {@link ICAPIModelBilling} shape that {@link createPricingMetaFromBilling}
 * expects. Also handles the case where the billing object already uses camelCase (e.g. from the
 * Copilot SDK's `ModelInfo`). Returns `undefined` when `raw` is nullish.
 */
export function normalizeCAPIBilling(raw: unknown): ICAPIModelBilling | undefined {
	if (!raw || typeof raw !== 'object') {
		return undefined;
	}
	const billing = raw as Record<string, unknown>;
	const multiplier = typeof billing.multiplier === 'number' ? billing.multiplier : undefined;
	const priceCategory = typeof billing.priceCategory === 'string' ? billing.priceCategory
		: typeof (billing as Record<string, unknown>).price_category === 'string' ? (billing as Record<string, unknown>).price_category as string
			: undefined;
	const discountPercent = typeof billing.discountPercent === 'number' ? billing.discountPercent
		: typeof (billing as Record<string, unknown>).discount_percent === 'number' ? (billing as Record<string, unknown>).discount_percent as number
			: undefined;

	// Resolve token prices: prefer camelCase `tokenPrices`, fall back to snake_case `token_prices`.
	const rawTokenPrices = (billing.tokenPrices ?? billing.token_prices) as Record<string, unknown> | undefined;
	let tokenPrices: ICAPIModelBilling['tokenPrices'] = undefined;
	if (rawTokenPrices && typeof rawTokenPrices === 'object') {
		// The CAPI snake_case format nests prices under `default` / `long_context` tiers;
		// the camelCase format flattens them at the top level of `tokenPrices`.
		const defaultTier = rawTokenPrices.default as Record<string, unknown> | undefined;
		const hasDefault = defaultTier && typeof defaultTier === 'object';

		const inputPrice = asNumber(rawTokenPrices.inputPrice) ?? asNumber(hasDefault ? defaultTier.input_price : undefined);
		const cachePrice = asNumber(rawTokenPrices.cachePrice) ?? asNumber(hasDefault ? defaultTier.cache_price : undefined);
		const cacheWritePrice = asNumber(rawTokenPrices.cacheWritePrice) ?? asNumber(hasDefault ? defaultTier.cache_write_price : undefined);
		const outputPrice = asNumber(rawTokenPrices.outputPrice) ?? asNumber(hasDefault ? defaultTier.output_price : undefined);
		const contextMax = asNumber(rawTokenPrices.contextMax) ?? asNumber(hasDefault ? defaultTier.context_max : undefined);

		const rawLong = (rawTokenPrices.longContext ?? rawTokenPrices.long_context) as Record<string, unknown> | undefined;
		let longContext: { readonly contextMax?: number; readonly inputPrice?: number; readonly cachePrice?: number; readonly cacheWritePrice?: number; readonly outputPrice?: number } | undefined;
		if (rawLong && typeof rawLong === 'object') {
			longContext = {
				inputPrice: asNumber(rawLong.inputPrice) ?? asNumber(rawLong.input_price),
				cachePrice: asNumber(rawLong.cachePrice) ?? asNumber(rawLong.cache_price),
				cacheWritePrice: asNumber(rawLong.cacheWritePrice) ?? asNumber(rawLong.cache_write_price),
				outputPrice: asNumber(rawLong.outputPrice) ?? asNumber(rawLong.output_price),
				contextMax: asNumber(rawLong.contextMax) ?? asNumber(rawLong.context_max),
			};
		}

		tokenPrices = { inputPrice, cachePrice, cacheWritePrice, outputPrice, contextMax, longContext };
	}

	return { multiplier, priceCategory, discountPercent, promo: normalizePromo(billing), tokenPrices };
}

function asNumber(v: unknown): number | undefined {
	return typeof v === 'number' ? v : undefined;
}

function normalizePromo(billing: Record<string, unknown>): ICAPIModelBilling['promo'] {
	const raw = billing.promo as Record<string, unknown> | undefined;
	if (!raw || typeof raw !== 'object') {
		return undefined;
	}
	const id = typeof raw.id === 'string' ? raw.id : undefined;
	const discountPercent = asNumber(raw.discountPercent) ?? asNumber(raw.discount_percent);
	const endsAt = typeof raw.endsAt === 'string' ? raw.endsAt
		: typeof raw.ends_at === 'string' ? raw.ends_at
			: undefined;
	const message = typeof raw.message === 'string' ? raw.message : undefined;
	if (id && typeof discountPercent === 'number' && endsAt && message) {
		return { id, discountPercent, endsAt, message };
	}
	return undefined;
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
	/** Promotional info when the model is experiencing a promotional discount. */
	readonly promo?: {
		readonly id: string;
		readonly discountPercent: number;
		readonly endsAt: string;
		readonly message: string;
	};
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
 * only emitted when there is an actual surcharge (at least one long-context price differs from the default tier).
 * When emitting, any missing long-context field falls back to the default-tier value so the hover table renders
 * complete rows. See {@link hasLongContextSurcharge} for the surcharge detection logic.
 *
 * @param billing - The model's billing info, narrowed through {@link ICAPIModelBilling}.
 * @param priceCategory - An optional override for the price category (e.g. from `modelPickerPriceCategory` on the
 *   model object itself). Falls back to `billing.priceCategory` when not provided.
 */
export function createPricingMetaFromBilling(billing: ICAPIModelBilling | undefined, priceCategory?: string): Record<string, unknown> | undefined {
	const tokenPrices = billing?.tokenPrices;
	const longContext = tokenPrices?.longContext;

	// Only emit long-context costs when there is an actual surcharge (at least
	// one price differs from default). When emitting, fall back to the default-
	// tier value for any field the long-context tier does not specify so the
	// hover table renders complete rows without gaps.
	const showLongContext = longContext !== undefined && (
		(longContext.inputPrice !== undefined && longContext.inputPrice !== tokenPrices?.inputPrice) ||
		(longContext.outputPrice !== undefined && longContext.outputPrice !== tokenPrices?.outputPrice) ||
		(longContext.cachePrice !== undefined && longContext.cachePrice !== tokenPrices?.cachePrice) ||
		(longContext.cacheWritePrice !== undefined && longContext.cacheWritePrice !== tokenPrices?.cacheWritePrice)
	);

	return createAgentModelPricingMeta({
		multiplierNumeric: typeof billing?.multiplier === 'number' ? billing.multiplier : undefined,
		inputCost: tokenPrices?.inputPrice,
		cacheCost: tokenPrices?.cachePrice,
		cacheWriteCost: tokenPrices?.cacheWritePrice,
		outputCost: tokenPrices?.outputPrice,
		longContextInputCost: showLongContext ? (longContext.inputPrice ?? tokenPrices?.inputPrice) : undefined,
		longContextCacheCost: showLongContext ? (longContext.cachePrice ?? tokenPrices?.cachePrice) : undefined,
		longContextCacheWriteCost: showLongContext ? (longContext.cacheWritePrice ?? tokenPrices?.cacheWritePrice) : undefined,
		longContextOutputCost: showLongContext ? (longContext.outputPrice ?? tokenPrices?.outputPrice) : undefined,
		priceCategory: priceCategory ?? (typeof billing?.priceCategory === 'string' ? billing.priceCategory : undefined),
		discountPercent: typeof billing?.discountPercent === 'number' ? billing.discountPercent : undefined,
		promo: billing?.promo,
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
