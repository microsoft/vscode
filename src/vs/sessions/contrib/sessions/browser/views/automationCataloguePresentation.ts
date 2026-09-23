/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import type { IAutomationProviderDescriptor } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';

export function formatUnavailableAutomationsMessage(unavailableProviders: readonly IAutomationProviderDescriptor[]): string {
	if (unavailableProviders.length === 1) {
		const provider = unavailableProviders[0];
		if (provider.unavailableReason !== undefined) {
			return localize('automationsUnavailableProviderWithReason', "Automations from {0} are unavailable. {1}", provider.label, provider.unavailableReason);
		}
		return localize('automationsUnavailableProvider', "Automations from {0} are unavailable.", unavailableProviders[0].label);
	}
	if (unavailableProviders.length > 1) {
		const reasons = unavailableProviders.flatMap(provider => provider.unavailableReason === undefined
			? []
			: [localize('automationsProviderUnavailableReason', "{0}: {1}", provider.label, provider.unavailableReason)]);
		if (reasons.length > 0) {
			return localize('automationsUnavailableProvidersWithReasons', "Automations from these providers are unavailable: {0}. {1}", unavailableProviders.map(provider => provider.label).join(', '), reasons.join(' '));
		}
		return localize('automationsUnavailableProviders', "Automations from these providers are unavailable: {0}.", unavailableProviders.map(provider => provider.label).join(', '));
	}
	return localize('automationsPartialUnavailable', "Some automations are unavailable.");
}
