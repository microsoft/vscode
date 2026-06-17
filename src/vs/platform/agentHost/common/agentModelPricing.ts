/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
	/** Default-tier cached-input cost in credits per 1M tokens. */
	readonly cacheCost?: number;
	/** Default-tier output cost in credits per 1M tokens. */
	readonly outputCost?: number;
	/** Long-context-tier input cost in credits per 1M tokens. */
	readonly longContextInputCost?: number;
	/** Long-context-tier cached-input cost in credits per 1M tokens. */
	readonly longContextCacheCost?: number;
	/** Long-context-tier output cost in credits per 1M tokens. */
	readonly longContextOutputCost?: number;
	/** Coarse price bucket (e.g. `low`, `medium`, `high`) for an at-a-glance tag. */
	readonly priceCategory?: string;
}

const NUMBER_KEYS = [
	'multiplierNumeric',
	'inputCost',
	'cacheCost',
	'outputCost',
	'longContextInputCost',
	'longContextCacheCost',
	'longContextOutputCost',
] as const satisfies readonly (keyof IAgentModelPricingMeta)[];

/**
 * Reads the well-known {@link IAgentModelPricingMeta} keys from a model's open `_meta` bag, ignoring any unrelated
 * provider-specific keys and values of the wrong type. Returns an object containing only the keys that were present
 * with a valid value.
 */
export function readAgentModelPricingMeta(meta: Record<string, unknown> | undefined): IAgentModelPricingMeta {
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
