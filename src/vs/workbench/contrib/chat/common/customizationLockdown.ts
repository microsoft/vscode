/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptsType } from './promptSyntax/promptTypes.js';

export type StrictPluginOnlyCustomization = boolean | null | undefined;

export function isStrictPluginOnlyCustomizationEnabled(value: StrictPluginOnlyCustomization): boolean {
	return value === true;
}

export function isPromptTypeBlocked(value: StrictPluginOnlyCustomization, type: PromptsType): boolean {
	switch (type) {
		case PromptsType.skill:
		case PromptsType.agent:
		case PromptsType.hook:
		case PromptsType.instructions:
			return isStrictPluginOnlyCustomizationEnabled(value);
		default:
			return false;
	}
}
