/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';

/**
 * The routing profiles the Copilot runtime accepts for an Auto session, cheapest first. These are
 * the wire values of its `capi.autoTier` option; the retired `eco`/`balanced`/`max` names are rejected.
 */
export const autoModeTiers = ['efficiency', 'balance', 'intelligence'] as const;

export type AutoModeTier = typeof autoModeTiers[number];

export type AutoModeRoutingTier = AutoModeTier | 'fast';

/** Provider-owned model configuration provenance; absent on older clients and restored legacy choices. */
export const AutoTierSourceConfigKey = 'tierSource';

/** Reads the supported scalar startup default; runtime policy objects are not interpreted here. */
export function parseManagedAutoTierDefault(value: unknown): AutoModeTier | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (typeof value === 'string' && (value.trimStart().startsWith('{') || value.trimStart().startsWith('"'))) {
		try {
			value = JSON.parse(value);
		} catch {
			throw new Error('Invalid managed Auto tier default.');
		}
	}
	if (isAutoModeTier(value)) {
		return value;
	}
	throw new Error('Invalid managed Auto tier default.');
}

export function isAutoModeRoutingTier(value: unknown): value is AutoModeRoutingTier {
	return value === 'fast' || isAutoModeTier(value);
}

export function isInheritedAutoTier(configuration: Readonly<Record<string, unknown>> | undefined): boolean {
	return configuration?.[AutoTierSourceConfigKey] === 'default'
		|| configuration?.[AutoTierSourceConfigKey] === 'preference'
		|| configuration?.[AutoTierSourceConfigKey] === 'managedFallback'
		|| configuration?.[AutoTierSourceConfigKey] === 'managed';
}

/** A choice carried into another conversation is a preference there, not a new explicit selection. */
export function inheritAutoTierConfiguration(configuration: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
	if (!configuration || isInheritedAutoTier(configuration) || !Object.hasOwn(configuration, 'tier')) {
		return configuration;
	}
	return { ...configuration, [AutoTierSourceConfigKey]: 'preference' };
}

/** The profile used when the user has not picked one. Also the picker's default. */
export const defaultAutoModeTier: AutoModeTier = 'balance';

/** Narrows an untrusted value, such as a persisted picker selection, to a profile the runtime accepts. */
export function isAutoModeTier(value: unknown): value is AutoModeTier {
	return autoModeTiers.some(tier => tier === value);
}

/** Maps retired picker and override values to the current runtime names, matching the Copilot extension. */
export function normalizeAutoModeTier(value: unknown): unknown {
	switch (value) {
		case 'eco': return 'efficiency';
		case 'balanced': return 'balance';
		case 'max': return 'intelligence';
		default: return value;
	}
}

/**
 * Localized picker label for a routing profile, capitalizing an unrecognized value so a new profile
 * never surfaces raw. Wording matches the extension's `getAutoModeTierLabel`, which cannot be imported here.
 */
export function getAutoModeTierLabel(tier: string): string {
	switch (tier) {
		case 'efficiency': return localize('autoModeTier.efficiency', "Efficiency");
		case 'balance': return localize('autoModeTier.balance', "Balance");
		case 'intelligence': return localize('autoModeTier.intelligence', "Intelligence");
		default: return tier.charAt(0).toUpperCase() + tier.slice(1);
	}
}

/** Localized picker description, or nothing for an unrecognized value so callers can omit it. */
export function getAutoModeTierDescription(tier: string): string | undefined {
	switch (tier) {
		case 'efficiency': return localize('autoModeTier.efficiencyDescription', "Optimizes for cost and speed, using more capable models only when needed.");
		case 'balance': return localize('autoModeTier.balanceDescription', "Balances cost/speed and capability based on task complexity.");
		case 'intelligence': return localize('autoModeTier.intelligenceDescription', "Optimizes for capability, using faster models only when the task allows it.");
		default: return undefined;
	}
}
