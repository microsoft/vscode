/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';

/**
 * The routing profiles the Copilot runtime accepts for an Auto session, cheapest first. These are
 * the wire values of its `capi.autoTier` option, matching what the Copilot Chat extension sends to
 * `POST /auto` in `extensions/copilot/src/platform/endpoint/common/autoModeTiers.ts`. The runtime
 * rejects the retired `eco`/`balanced`/`max` names.
 */
export const autoModeTiers = ['efficiency', 'balance', 'intelligence'] as const;

export type AutoModeTier = typeof autoModeTiers[number];

/** The profile used when the user has not picked one. Also the picker's default. */
export const defaultAutoModeTier: AutoModeTier = 'balance';

/** Narrows an untrusted value, such as a persisted picker selection, to a profile the runtime accepts. */
export function isAutoModeTier(value: unknown): value is AutoModeTier {
	return autoModeTiers.some(tier => tier === value);
}

/**
 * Localized picker label for a routing profile, capitalizing an unrecognized value so a new profile
 * never surfaces raw. Wording matches `getAutoModeTierLabel` in
 * `extensions/copilot/src/extension/conversation/common/languageModelAccess.ts`, which cannot be
 * imported here because the extension compiles separately and localizes through `vscode.l10n`.
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
		case 'efficiency': return localize('autoModeTier.efficiencyDescription', "Cheaper models for everyday tasks");
		case 'balance': return localize('autoModeTier.balanceDescription', "Balances capability and cost");
		case 'intelligence': return localize('autoModeTier.intelligenceDescription', "Most capable models, higher cost");
		default: return undefined;
	}
}
