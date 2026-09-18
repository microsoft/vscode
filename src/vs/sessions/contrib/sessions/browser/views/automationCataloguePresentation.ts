/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import type { IAutomationProviderDescriptor } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';

export function formatUnavailableAutomationsMessage(unavailableProviders: readonly IAutomationProviderDescriptor[]): string {
	if (unavailableProviders.length === 1) {
		return localize('automationsUnavailableProvider', "Automations from {0} are unavailable.", unavailableProviders[0].label);
	}
	if (unavailableProviders.length > 1) {
		return localize('automationsUnavailableProviders', "Automations from these providers are unavailable: {0}.", unavailableProviders.map(provider => provider.label).join(', '));
	}
	return localize('automationsPartialUnavailable', "Some automations are unavailable.");
}
