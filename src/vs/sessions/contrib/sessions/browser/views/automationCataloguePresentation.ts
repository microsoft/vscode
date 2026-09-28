/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { groupByMap } from '../../../../../base/common/collections.js';
import { localize } from '../../../../../nls.js';
import type { IAutomationProviderDescriptor } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';

export function formatUnavailableAutomationsMessage(unavailableProviders: readonly IAutomationProviderDescriptor[]): string {
	if (unavailableProviders.length === 0) {
		return localize('automationsPartialUnavailable', "Some automations are unavailable.");
	}
	const lines = [unavailableProviders.length === 1
		? localize('automationsUnavailableProvider', "Automations from {0} are unavailable.", unavailableProviders[0].label)
		: localize('automationsUnavailableProviders', "Automations from these providers are unavailable: {0}.", unavailableProviders.map(provider => provider.label).join(', '))];
	const groups = groupByMap(
		unavailableProviders.filter(provider => provider.unavailableReasonCode !== undefined || provider.unavailableReason !== undefined),
		provider => provider.unavailableReasonCode !== undefined ? `code:${provider.unavailableReasonCode}` : `text:${provider.unavailableReason}`,
	);
	for (const providers of groups.values()) {
		const labels = providers.map(provider => provider.label).join(', ');
		switch (providers[0].unavailableReasonCode) {
			case 'disconnected':
				lines.push(localize('automationsProvidersDisconnected', "The Agent Host is disconnected on these providers: {0}.", labels));
				break;
			case 'initializing':
				lines.push(localize('automationsProvidersInitializing', "The Agent Host is still connecting on these providers: {0}.", labels));
				break;
			case 'disabled':
				lines.push(localize('automationsProvidersDisabled', "Automations are disabled on these providers: {0}.", labels));
				break;
			case 'unsupported':
				lines.push(localize('automationsProvidersUnsupported', "These providers do not support automations: {0}.", labels));
				break;
			case 'incompatible':
				lines.push(localize('automationsProvidersIncompatible', "These providers require an Agent Host update to use automations: {0}.", labels));
				break;
			default:
				lines.push(localize('automationsProvidersCustomReason', "{0} Providers: {1}.", providers[0].unavailableReason, labels));
				break;
		}
	}
	return lines.join('\n');
}
