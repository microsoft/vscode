/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CustomizationEnablementKind, type CustomizationEnablement } from './state/protocol/channels-session/state.js';

/**
 * Effective enablement of a customization that carries no explicit decision at
 * any scope. Also the value a stored decision is compared against before it is
 * persisted, so a decision matching what would be inherited is never written.
 */
export const DEFAULT_CUSTOMIZATION_ENABLED = true;

/**
 * Normalizes wire enablement decisions so the first entry is always decisive.
 */
export function sortCustomizationEnablement(enablement: readonly CustomizationEnablement[]): CustomizationEnablement[] {
	return enablement.map((entry, index) => ({ entry, index })).sort((a, b) => {
		const kindOrder = customizationEnablementKindOrder(a.entry.kind) - customizationEnablementKindOrder(b.entry.kind);
		if (kindOrder !== 0) {
			return kindOrder;
		}
		return a.index - b.index;
	}).map(({ entry }) => entry);
}

/**
 * Replaces all decisions of one kind, preserving the others in wire order.
 */
export function withCustomizationEnablement(
	current: readonly CustomizationEnablement[] | undefined,
	kind: CustomizationEnablementKind,
	entry: CustomizationEnablement | readonly CustomizationEnablement[] | undefined,
): CustomizationEnablement[] {
	const replacements = entry === undefined ? [] : Array.isArray(entry) ? entry : [entry];
	return sortCustomizationEnablement([...(current ?? []).filter(candidate => candidate.kind !== kind), ...replacements]);
}

function customizationEnablementKindOrder(kind: CustomizationEnablementKind): number {
	switch (kind) {
		case CustomizationEnablementKind.Session:
			return 0;
		case CustomizationEnablementKind.Workspace:
			return 1;
		case CustomizationEnablementKind.Global:
			return 2;
	}
}
