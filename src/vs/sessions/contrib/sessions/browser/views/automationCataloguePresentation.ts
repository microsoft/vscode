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
				reasons.push(localize('automationsProvidersDisconnected', "The agent host is disconnected on {0}.", labels));
				break;
			case 'initializing':
				reasons.push(localize('automationsProvidersInitializing', "The agent host is still connecting on {0}.", labels));
				break;
			case 'disabled':
				reasons.push(localize('automationsProvidersDisabled', "Automations are disabled on {0}.", labels));
				break;
			case 'unsupported':
				reasons.push(localize('automationsProvidersUnsupported', "Automations are not supported on {0}.", labels));
				break;
			case 'incompatible':
				reasons.push(localize('automationsProvidersIncompatible', "The agent host needs to be updated to use automations on {0}.", labels));
				break;
			default:
				reasons.push(providers[0].unavailableReason !== undefined
					? localize('automationsProvidersCustomReason', "Automations are unavailable on {0}. {1}", labels, providers[0].unavailableReason)
					: localize('automationsProvidersUnavailable', "Automations are unavailable on {0}.", labels));
				break;
		}
	}
	return reasons;
}

export function formatUnavailableAutomationsMessage(unavailableProviders: readonly IAutomationProviderDescriptor[]): string {
	const reasons = getUnavailableAutomationsReasons(unavailableProviders);
	if (reasons.length === 1) {
		return reasons[0];
	}
	return reasons.length > 0
		? reasons.map(reason => `- ${reason}`).join('\n')
		: localize('automationsPartialUnavailable', "Some automations are unavailable.");
}
