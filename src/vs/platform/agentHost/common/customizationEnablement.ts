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

export type CustomizationDisabledReason =
	| {
		readonly source: 'scope';
		readonly scope: CustomizationEnablementKind;
	}
	| {
		readonly source: 'plugin';
		readonly plugin: {
			readonly id: string;
			readonly name: string;
			readonly uri: string;
			readonly clientId?: string;
			readonly enablement?: readonly CustomizationEnablement[];
		};
	};

/** Returns the decisive explicit enablement decision, if one exists. */
export function getCustomizationEnablementDecision(customization: { readonly enablement?: readonly CustomizationEnablement[] }): CustomizationEnablement | undefined {
	return customization.enablement?.[0];
}

/**
 * Effective enablement of a customization, derived from its explicit decisions.
 * The most specific decision is first, so `enablement[0]` decides; no explicit
 * decision anywhere means enabled.
 */
export function isCustomizationEnabled(customization: { readonly enablement?: readonly CustomizationEnablement[] }): boolean {
	return getCustomizationEnablementDecision(customization)?.enabled ?? DEFAULT_CUSTOMIZATION_ENABLED;
}

export interface ICustomizationScopeEnablement {
	readonly global: boolean;
	readonly workspace: boolean;
	readonly session: boolean;
}

/**
 * Resolves the value each scope would inherit if it had no explicit decision.
 */
export function getCustomizationScopeEnablement(customization: { readonly enablement?: readonly CustomizationEnablement[] }): ICustomizationScopeEnablement {
	const global = customization.enablement?.find(decision => decision.kind === CustomizationEnablementKind.Global)?.enabled ?? DEFAULT_CUSTOMIZATION_ENABLED;
	const workspace = customization.enablement?.find(decision => decision.kind === CustomizationEnablementKind.Workspace)?.enabled ?? global;
	return {
		global,
		workspace,
		session: isCustomizationEnabled(customization),
	};
}

/**
 * Returns the published reason when a customization or its containing plugin is
 * disabled. The plugin takes precedence because its child cannot take effect
 * until the plugin is enabled again.
 */
export function getCustomizationDisabledReason(customization: { readonly enablement?: readonly CustomizationEnablement[] }, plugin?: { readonly id: string; readonly name: string; readonly uri: string; readonly clientId?: string; readonly enablement?: readonly CustomizationEnablement[] }): CustomizationDisabledReason | undefined {
	if (plugin && !isCustomizationEnabled(plugin)) {
		return {
			source: 'plugin',
			plugin: {
				id: plugin.id,
				name: plugin.name,
				uri: plugin.uri,
				...(plugin.clientId === undefined ? undefined : { clientId: plugin.clientId }),
				enablement: plugin.enablement,
			},
		};
	}
	const decision = getCustomizationEnablementDecision(customization);
	return decision?.enabled === false ? { source: 'scope', scope: decision.kind } : undefined;
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
