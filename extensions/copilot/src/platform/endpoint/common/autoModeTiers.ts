/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Routing profiles accepted by `POST /auto`. A tier is picked per session and
 * biases which models the router may choose from.
 */
export const autoModeTiers = ['efficiency', 'balance', 'intelligence', 'fast'] as const;

export type AutoModeTier = typeof autoModeTiers[number];

/**
 * The tiers offered in the model picker. `fast` is excluded: it is the profile
 * inline chat falls back to when the user has not picked a tier, and is not
 * offered as a choice. It remains reachable through the internal
 * {@link ConfigKey.Advanced.AutoModeTierOverride} setting.
 */
export const selectableAutoModeTiers: readonly AutoModeTier[] = ['efficiency', 'balance', 'intelligence'];

/** The tier used when the user has not picked one. */
export const defaultAutoModeTier: AutoModeTier = 'balance';

/** The tier inline chat defaults to; latency matters more than routing depth there. */
export const inlineChatAutoModeTier: AutoModeTier = 'fast';

/** Key the selected tier is stored under in the Auto model's configuration. */
export const AUTO_MODE_TIER_PROPERTY = 'tier';

/**
 * Tier names retired in favour of the current ones. `POST /auto` still accepts
 * them, but the agent runtime rejects them, so they are mapped forward on read.
 */
const retiredAutoModeTiers: Readonly<Record<string, AutoModeTier>> = {
	eco: 'efficiency',
	balanced: 'balance',
	max: 'intelligence',
};

/**
 * Maps a retired tier name to its current one, leaving anything else untouched.
 * Needed for raw inputs that predate the rename, such as the override setting or a persisted picker
 * value restored before its model's schema has loaded.
 */
export function normalizeAutoModeTier(value: unknown): unknown {
	return typeof value === 'string' ? retiredAutoModeTiers[value] ?? value : value;
}

/**
 * Narrows an untrusted value (persisted model configuration, or configuration
 * supplied by a third-party extension through the `vscode.lm` API) to a tier the
 * picker offers. `fast` is rejected so it stays an internal default rather than
 * something a caller can select.
 */
export function isSelectableAutoModeTier(value: unknown): value is AutoModeTier {
	return typeof value === 'string' && (selectableAutoModeTiers as readonly string[]).includes(value);
}
