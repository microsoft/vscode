/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../../../base/common/types.js';
import type { SessionModelInfo } from '../../state/protocol/state.js';
import type { IAgentModelInfo } from '../../agent.js';

const VSCODE_AUTO_TIERS_META_KEY = 'vscode.chat.autoTiers';

/** One Auto tier the picker lists, in the provider's order. */
export interface IAgentModelAutoTier {
	readonly id: string;
	readonly label: string;
	/** `false` when the provider lists the tier but does not let this account select it. */
	readonly enabled: boolean;
	/** Why the tier is unavailable, from the provider. */
	readonly message?: string;
}

/**
 * The provider's Auto tiers for the picker, including ones it lists as unavailable. The model's
 * `tier` schema `enum` holds only the selectable ones, so clients that do not read this keep
 * working; clients that do can show the unavailable ones as disabled.
 */
export interface IAgentModelAutoTiersMeta {
	readonly tiers: readonly IAgentModelAutoTier[];
}

export function withAgentModelAutoTiersMeta(meta: Record<string, unknown> | undefined, autoTiers: IAgentModelAutoTiersMeta): Record<string, unknown> {
	return {
		...meta,
		[VSCODE_AUTO_TIERS_META_KEY]: {
			tiers: autoTiers.tiers.map(tier => ({ id: tier.id, label: tier.label, enabled: tier.enabled, ...(tier.message ? { message: tier.message } : {}) })),
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
		const { id, label, enabled, message } = tier as { id?: unknown; label?: unknown; enabled?: unknown; message?: unknown };
		if (typeof id !== 'string' || !id || typeof label !== 'string' || typeof enabled !== 'boolean' || (message !== undefined && typeof message !== 'string')) {
			return undefined;
		}
		result.push({ id, label, enabled, ...(message ? { message } : {}) });
	}
	return { tiers: result };
}

const VSCODE_AUTO_TIER_PROMOTIONS_META_KEY = 'vscode.chat.autoTierPromotions';

/**
 * A promotion the Copilot service attaches to Auto tiers (a `/meta` `service_messages[]` entry of
 * kind `promotion`), scoped to the caller. See github/copilot-api#39882.
 */
export interface IAgentModelAutoTierPromotion {
	readonly id: string;
	readonly message: string;
	/** Whole-number percentage (0-100); `0` is a message-only promotion. */
	readonly discountPercent: number;
	/** The Auto tier IDs the promotion applies to. */
	readonly tierIds: readonly string[];
	/** ISO 8601 start; before it the promotion is upcoming. Absent means already started. */
	readonly startsAt?: string;
	/** ISO 8601 end; after it the promotion is hidden. Absent means open-ended. */
	readonly endsAt?: string;
	readonly showBanner?: boolean;
}

/**
 * Reads the promotions for Auto tiers from a `/meta` `service_messages` list, in either the wire's
 * snake_case or an SDK's camelCase. Unknown kinds and target types, and malformed entries, are
 * ignored, as the service requires.
 */
export function parseAutoTierPromotions(serviceMessages: unknown): IAgentModelAutoTierPromotion[] {
	if (!Array.isArray(serviceMessages)) {
		return [];
	}
	const promotions: IAgentModelAutoTierPromotion[] = [];
	for (const raw of serviceMessages) {
		if (!isObject(raw)) {
			continue;
		}
		const entry = raw as Record<string, unknown>;
		if (entry.kind !== 'promotion') {
			continue;
		}
		const appliesTo = entry.appliesTo ?? entry.applies_to;
		const tierIds = Array.isArray(appliesTo)
			? appliesTo.flatMap(target => isObject(target) && (target as Record<string, unknown>).type === 'auto_tier' && typeof (target as Record<string, unknown>).id === 'string' && (target as Record<string, unknown>).id ? [(target as Record<string, unknown>).id as string] : [])
			: [];
		const promotion = toPromotion({
			id: entry.id,
			message: entry.message,
			discountPercent: entry.discountPercent ?? entry.discount_percent,
			tierIds: [...new Set(tierIds)],
			// The wire may send `null` for an absent date or flag.
			startsAt: entry.startsAt ?? entry.starts_at ?? undefined,
			endsAt: entry.endsAt ?? entry.ends_at ?? undefined,
			showBanner: entry.showBanner ?? entry.show_banner ?? undefined,
		});
		if (promotion) {
			promotions.push(promotion);
		}
	}
	return promotions;
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
	if (typeof id !== 'string' || !id || typeof message !== 'string' || !message
		|| typeof discountPercent !== 'number' || !Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100
		|| !Array.isArray(tierIds) || !tierIds.length || !tierIds.every(tier => typeof tier === 'string' && tier)
		|| !isOptionalDate(startsAt) || !isOptionalDate(endsAt)
		|| (showBanner !== undefined && typeof showBanner !== 'boolean')) {
		return undefined;
	}
	return {
		id, message, discountPercent, tierIds: tierIds as string[],
		...(typeof startsAt === 'string' ? { startsAt } : {}),
		...(typeof endsAt === 'string' ? { endsAt } : {}),
		...(typeof showBanner === 'boolean' ? { showBanner } : {}),
	};
}

function isOptionalDate(value: unknown): boolean {
	return value === undefined || (typeof value === 'string' && !isNaN(new Date(value).getTime()));
}
