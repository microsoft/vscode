/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../../../base/common/types.js';
import type { SessionModelInfo } from '../../state/protocol/state.js';
import type { IAgentModelInfo } from '../../agent.js';

const VSCODE_AUTO_TIERS_META_KEY = 'vscode.chat.autoTiers';

export interface IAgentModelAutoTier {
	readonly id: string;
	readonly label: string;
	readonly enabled: boolean;
	readonly message?: string;
	/** Runtime-owned managed Fusion tier (`standard`, `high`, `max`) this tier executes, if any. */
	readonly fusionTier?: string;
}

/** Includes unavailable tiers, which the `tier` schema `enum` leaves out. */
export interface IAgentModelAutoTiersMeta {
	readonly tiers: readonly IAgentModelAutoTier[];
}

export function withAgentModelAutoTiersMeta(meta: Record<string, unknown> | undefined, autoTiers: IAgentModelAutoTiersMeta): Record<string, unknown> {
	return {
		...meta,
		[VSCODE_AUTO_TIERS_META_KEY]: {
			tiers: autoTiers.tiers.map(tier => ({ id: tier.id, label: tier.label, enabled: tier.enabled, ...(tier.message ? { message: tier.message } : {}), ...(tier.fusionTier ? { fusionTier: tier.fusionTier } : {}) })),
		},
	};
}

export function readAgentModelAutoTiersMeta(model: IAgentModelInfo | SessionModelInfo): IAgentModelAutoTiersMeta | undefined {
	const value = model._meta?.[VSCODE_AUTO_TIERS_META_KEY];
	const tiers = isObject(value) ? (value as { tiers?: unknown }).tiers : undefined;
	if (!Array.isArray(tiers)) {
		return undefined;
	}
	const result: IAgentModelAutoTier[] = [];
	for (const tier of tiers) {
		if (!isObject(tier)) {
			return undefined;
		}
		const { id, label, enabled, message, fusionTier } = tier as { id?: unknown; label?: unknown; enabled?: unknown; message?: unknown; fusionTier?: unknown };
		if (typeof id !== 'string' || !id || typeof label !== 'string' || typeof enabled !== 'boolean' || (message !== undefined && typeof message !== 'string')) {
			return undefined;
		}
		result.push({ id, label, enabled, ...(message ? { message } : {}), ...(typeof fusionTier === 'string' && fusionTier ? { fusionTier } : {}) });
	}
	return { tiers: result };
}

const VSCODE_AUTO_TIER_PROMOTIONS_META_KEY = 'vscode.chat.autoTierPromotions';

/** An Auto tier promotion, grouped across the tiers it covers. See github/copilot-api#39882. */
export interface IAgentModelAutoTierPromotion {
	readonly id: string;
	/** Absent when the service sent only a discount. */
	readonly message?: string;
	/** `0` announces the promotion without a discount. */
	readonly discountPercent: number;
	readonly tierIds: readonly string[];
	readonly startsAt?: string;
	readonly endsAt?: string;
	readonly showBanner?: boolean;
}

/**
 * The SDK's `AutoTierBillingPromo`, which this layer cannot import. The runtime has already
 * applied `/meta` `service_messages`: unknown kinds and targets and ended promotions are gone,
 * and each tier carries at most one promotion, possibly one that has not started.
 */
export interface IAutoTierBillingPromo {
	readonly id?: string;
	readonly discountPercent?: number;
	readonly startsAt?: string;
	readonly endsAt?: string;
	readonly message?: string;
	readonly showBanner?: boolean;
}

/** Groups the tiers' `billing.promo` by promotion, so one promotion lists every tier it covers. */
export function collectAutoTierPromotions(tiers: readonly { readonly id: string; readonly billing?: { readonly promo?: IAutoTierBillingPromo } }[]): IAgentModelAutoTierPromotion[] {
	const byKey = new Map<string, { promo: IAutoTierBillingPromo; tierIds: string[] }>();
	for (const tier of tiers) {
		const promo = tier.billing?.promo;
		if (!isObject(promo)) {
			continue;
		}
		// `id` is optional in the SDK contract, so an unnamed promotion is keyed by its content.
		const key = typeof promo.id === 'string' && promo.id ? promo.id : JSON.stringify([promo.message, promo.discountPercent, promo.startsAt, promo.endsAt]);
		const group = byKey.get(key);
		if (group) {
			if (!group.tierIds.includes(tier.id)) {
				group.tierIds.push(tier.id);
			}
		} else {
			byKey.set(key, { promo, tierIds: [tier.id] });
		}
	}
	return [...byKey].flatMap(([key, { promo, tierIds }]) => {
		const promotion = toPromotion({ ...promo, id: key, discountPercent: promo.discountPercent ?? 0, tierIds });
		return promotion ? [promotion] : [];
	});
}

export function withAgentModelAutoTierPromotionsMeta(meta: Record<string, unknown> | undefined, promotions: readonly IAgentModelAutoTierPromotion[]): Record<string, unknown> | undefined {
	return promotions.length ? { ...meta, [VSCODE_AUTO_TIER_PROMOTIONS_META_KEY]: promotions.map(promotion => ({ ...promotion, tierIds: [...promotion.tierIds] })) } : meta;
}

export function readAgentModelAutoTierPromotionsMeta(model: IAgentModelInfo | SessionModelInfo): IAgentModelAutoTierPromotion[] {
	const value = model._meta?.[VSCODE_AUTO_TIER_PROMOTIONS_META_KEY];
	if (!Array.isArray(value)) {
		return [];
	}
	return value.flatMap(entry => {
		const promotion = isObject(entry) ? toPromotion(entry as Record<string, unknown>) : undefined;
		return promotion ? [promotion] : [];
	});
}

function toPromotion(entry: Record<string, unknown>): IAgentModelAutoTierPromotion | undefined {
	const { id, message, discountPercent, tierIds, startsAt, endsAt, showBanner } = entry;
	if (typeof id !== 'string' || !id || (message !== undefined && typeof message !== 'string')
		|| typeof discountPercent !== 'number' || !Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100
		// Nothing to show without a message or a discount.
		|| (!message && discountPercent === 0)
		|| !Array.isArray(tierIds) || !tierIds.length || !tierIds.every(tier => typeof tier === 'string' && tier)
		|| !isOptionalDate(startsAt) || !isOptionalDate(endsAt)
		|| (showBanner !== undefined && typeof showBanner !== 'boolean')) {
		return undefined;
	}
	return {
		id, discountPercent, tierIds: tierIds as string[],
		...(typeof message === 'string' && message ? { message } : {}),
		...(typeof startsAt === 'string' ? { startsAt } : {}),
		...(typeof endsAt === 'string' ? { endsAt } : {}),
		...(typeof showBanner === 'boolean' ? { showBanner } : {}),
	};
}

function isOptionalDate(value: unknown): boolean {
	return value === undefined || (typeof value === 'string' && !isNaN(new Date(value).getTime()));
}
