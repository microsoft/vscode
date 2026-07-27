/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptsType } from './promptSyntax/promptTypes.js';

export type CustomizationLockdownSurface = 'skills' | 'agents' | 'hooks' | 'mcpServers';
export type StrictPluginOnlyCustomization = boolean | readonly CustomizationLockdownSurface[] | null | undefined;

export function isCustomizationSurfaceBlocked(value: StrictPluginOnlyCustomization, surface: CustomizationLockdownSurface): boolean {
	return value === true || (Array.isArray(value) && value.includes(surface));
}

export function isPromptTypeBlocked(value: StrictPluginOnlyCustomization, type: PromptsType): boolean {
	switch (type) {
		case PromptsType.skill:
			return isCustomizationSurfaceBlocked(value, 'skills');
		case PromptsType.agent:
			return isCustomizationSurfaceBlocked(value, 'agents');
		case PromptsType.hook:
			return isCustomizationSurfaceBlocked(value, 'hooks');
		default:
			return false;
	}
}
