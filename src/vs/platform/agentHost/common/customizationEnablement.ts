/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CustomizationEnablementKind, type CustomizationEnablement } from './state/protocol/state.js';

/**
 * Effective enablement when no explicit decision exists at any scope. It is
 * also the value compared before persisting a decision, so decisions matching
 * their inherited value are never written.
 */
export const DEFAULT_CUSTOMIZATION_ENABLED = true;

/**
 * Effective enablement of a customization, derived from its explicit decisions.
 * The most specific decision is first, so `enablement[0]` decides; no explicit
 * decision anywhere means enabled.
 */
export function isCustomizationEnabled(customization: { readonly enablement?: readonly CustomizationEnablement[] }): boolean {
	return customization.enablement?.[0]?.enabled ?? DEFAULT_CUSTOMIZATION_ENABLED;
}

function customizationEnablementOrder(kind: CustomizationEnablementKind): number {
	switch (kind) {
		case CustomizationEnablementKind.Session:
			return 0;
		case CustomizationEnablementKind.Workspace:
			return 1;
		case CustomizationEnablementKind.Global:
			return 2;
		default: {
			const exhaustiveKind: never = kind;
			return exhaustiveKind;
		}
	}
}

/** Sorts enablement decisions from most to least specific, stably within each scope. */
export function sortCustomizationEnablement(enablement: readonly CustomizationEnablement[]): CustomizationEnablement[] {
	return enablement
		.map((decision, index) => ({ decision, index }))
		.sort((a, b) => customizationEnablementOrder(a.decision.kind) - customizationEnablementOrder(b.decision.kind) || a.index - b.index)
		.map(({ decision }) => decision);
}

/** Replaces all decisions for one scope and returns the complete sorted decision set. */
export function withCustomizationEnablement(current: readonly CustomizationEnablement[] | undefined, kind: CustomizationEnablementKind, entry: CustomizationEnablement | readonly CustomizationEnablement[] | undefined): CustomizationEnablement[] {
	const replacement: readonly CustomizationEnablement[] = entry === undefined
		? []
		: Array.isArray(entry)
			? entry
			: [entry];
	return sortCustomizationEnablement([
		...(current?.filter(decision => decision.kind !== kind) ?? []),
		...replacement,
	]);
}
