/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { groupByMap } from '../../../../../base/common/collections.js';
import { localize } from '../../../../../nls.js';
import type { IAutomationProviderDescriptor } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';

export function getUnavailableAutomationsReasons(unavailableProviders: readonly IAutomationProviderDescriptor[]): string[] {
	const reasons: string[] = [];
	const groups = groupByMap(
		[...unavailableProviders],
		provider => provider.unavailableReasonCode !== undefined
			? `code:${provider.unavailableReasonCode}`
			: provider.unavailableReason !== undefined ? `text:${provider.unavailableReason}` : 'none',
	);
	for (const providers of groups.values()) {
		const labels = providers.map(provider => provider.label).join(', ');
		switch (providers[0].unavailableReasonCode) {
			case 'disconnected':
				reasons.push(localize('automationsProvidersDisconnected', "The Agent Host is disconnected on these providers: {0}.", labels));
				break;
			case 'initializing':
				reasons.push(localize('automationsProvidersInitializing', "The Agent Host is still connecting on these providers: {0}.", labels));
				break;
			case 'disabled':
				reasons.push(localize('automationsProvidersDisabled', "Automations are disabled on these providers: {0}.", labels));
				break;
			case 'unsupported':
				reasons.push(localize('automationsProvidersUnsupported', "These providers do not support automations: {0}.", labels));
				break;
			case 'incompatible':
				reasons.push(localize('automationsProvidersIncompatible', "These providers require an Agent Host update to use automations: {0}.", labels));
				break;
			default:
				reasons.push(providers[0].unavailableReason !== undefined
					? localize('automationsProvidersCustomReason', "{0} Providers: {1}.", providers[0].unavailableReason, labels)
					: localize('automationsProvidersUnavailable', "Automations are unavailable on these providers: {0}.", labels));
				break;
		}
	}
	return reasons;
}

export function formatUnavailableAutomationsMessage(unavailableProviders: readonly IAutomationProviderDescriptor[]): string {
	const reasons = getUnavailableAutomationsReasons(unavailableProviders);
	return reasons.length > 0
		? reasons.map(reason => `- ${reason}`).join('\n')
		: localize('automationsPartialUnavailable', "Some automations are unavailable.");
}
