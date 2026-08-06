/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Routing profiles accepted by `POST /auto`. A tier is picked per session and
 * biases which models the router may choose from.
 */
export const autoModeTiers = ['eco', 'balanced', 'max', 'fast'] as const;

export type AutoModeTier = typeof autoModeTiers[number];

/**
 * The tiers offered in the model picker. `fast` is deliberately excluded: it is
 * an internal profile reserved for inline chat and is never user selectable.
 */
export const selectableAutoModeTiers: readonly AutoModeTier[] = ['eco', 'balanced', 'max'];

/** The tier used when the user has not picked one. */
export const defaultAutoModeTier: AutoModeTier = 'balanced';

/** Inline chat always routes with this tier; latency matters more than depth there. */
export const inlineChatAutoModeTier: AutoModeTier = 'fast';

/** Key the selected tier is stored under in the Auto model's configuration. */
export const AUTO_MODE_TIER_PROPERTY = 'tier';

/**
 * Narrows an untrusted value (e.g. persisted model configuration) to a tier the
 * user is allowed to select. `fast` is rejected so a hand-edited setting cannot
 * opt panel chat into the inline-chat profile.
 */
export function isSelectableAutoModeTier(value: unknown): value is AutoModeTier {
	return typeof value === 'string' && (selectableAutoModeTiers as readonly string[]).includes(value);
}

/**
 * Narrows an untrusted value to any tier, including `fast`. Used by the internal
 * override setting, which may target profiles the picker does not offer.
 */
export function isAutoModeTier(value: unknown): value is AutoModeTier {
	return typeof value === 'string' && (autoModeTiers as readonly string[]).includes(value);
}
