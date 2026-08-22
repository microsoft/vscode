/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptsType } from './promptSyntax/promptTypes.js';
import { isStrictPluginOnlyCustomizationSelectorArray, StrictPluginOnlyCustomizationSelector } from '../../../../platform/policy/common/copilotManagedSettings.js';

export type StrictPluginOnlyCustomization = boolean | readonly unknown[] | null | undefined;

export function isStrictPluginOnlyCustomizationEnabled(value: StrictPluginOnlyCustomization): boolean {
	return value === true;
}

export function isStrictPluginOnlyCustomizationBlocked(value: StrictPluginOnlyCustomization, surface: StrictPluginOnlyCustomizationSelector | 'instructions'): boolean {
	if (value === true) {
		return true;
	}
	if (value === false || value === undefined) {
		return false;
	}
	if (!isStrictPluginOnlyCustomizationSelectorArray(value)) {
		return true;
	}
	return surface !== 'instructions' && value.includes(surface);
}

export function isPromptTypeBlocked(value: StrictPluginOnlyCustomization, type: PromptsType): boolean {
	switch (type) {
		case PromptsType.skill:
			return isStrictPluginOnlyCustomizationBlocked(value, 'skills');
		case PromptsType.agent:
			return isStrictPluginOnlyCustomizationBlocked(value, 'agents');
		case PromptsType.hook:
			return isStrictPluginOnlyCustomizationBlocked(value, 'hooks');
		case PromptsType.instructions:
			return isStrictPluginOnlyCustomizationBlocked(value, 'instructions');
		default:
			return false;
	}
}
