/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { groupByMap } from '../../../../../base/common/collections.js';
import { localize } from '../../../../../nls.js';
import { cloudSandboxAddress } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { agentHostAuthority } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { getEntryAddress, IRemoteAgentHostEntry, RemoteAgentHostEntryType } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import type { IAutomationDescriptor } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import type { IAutomationProviderDescriptor } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';

export function getAutomationOwnershipGroups(automations: readonly IAutomationDescriptor[]) {
	return [
		{ ownership: 'user', label: localize('automations.yours', "Your automations"), automations: automations.filter(automation => automation.ownership !== 'repository') },
		{
			ownership: 'repository',
			label: localize('automations.repositoryOwned', "Shared automations"),
			description: localize('automations.repositoryOwnedDescription', "These automations are visible to anyone with repository access, and can be edited by anyone with write access."),
			automations: automations.filter(automation => automation.ownership === 'repository'),
		},
	].filter(group => group.automations.length > 0 || group.ownership === 'user' && automations.some(automation => automation.ownership === 'repository'));
}

export interface IAutomationRemoteStatusPresentation {
	readonly tunnelEntries: readonly IRemoteAgentHostEntry[];
	readonly replacedTunnelProviderIds: ReadonlySet<string>;
	readonly ignoredGitHubEnvironmentProviderIds: ReadonlySet<string>;
	readonly visibleUnavailableProviders: readonly IAutomationProviderDescriptor[];
	readonly suppressedAllReasons: boolean;
}

export function getAutomationRemoteStatusPresentation(
	unavailableProviders: readonly IAutomationProviderDescriptor[],
	configuredEntries: readonly IRemoteAgentHostEntry[],
	githubEnvironmentIds: readonly string[],
	replaceTunnelWarnings: boolean,
): IAutomationRemoteStatusPresentation {
	const tunnelEntries = configuredEntries.filter(entry => entry.connection.type === RemoteAgentHostEntryType.Tunnel);
	const tunnelProviderIds = new Set(tunnelEntries.map(entry => `agenthost-${agentHostAuthority(getEntryAddress(entry))}`));
	const githubEnvironmentProviderIds = new Set(githubEnvironmentIds
		.map(environmentId => `agenthost-${agentHostAuthority(cloudSandboxAddress(environmentId))}`));
	const replacedTunnelProviderIds = new Set(replaceTunnelWarnings
		? unavailableProviders
			.filter(provider => provider.unavailableReasonCode === 'disconnected' && tunnelProviderIds.has(provider.id))
			.map(provider => provider.id)
		: []);
	const ignoredGitHubEnvironmentProviderIds = new Set(unavailableProviders
		.filter(provider => provider.unavailableReasonCode === 'disconnected' && githubEnvironmentProviderIds.has(provider.id))
		.map(provider => provider.id));
	const visibleUnavailableProviders = unavailableProviders.filter(provider =>
		!ignoredGitHubEnvironmentProviderIds.has(provider.id)
		&& !replacedTunnelProviderIds.has(provider.id));
	return {
		tunnelEntries,
		replacedTunnelProviderIds,
		ignoredGitHubEnvironmentProviderIds,
		visibleUnavailableProviders,
		suppressedAllReasons: unavailableProviders.length > 0 && visibleUnavailableProviders.length === 0,
	};
}

export function getUnavailableAutomationsReasons(unavailableProviders: readonly IAutomationProviderDescriptor[]): string[] {
	const reasons: string[] = [];
	const groups = groupByMap(
		[...unavailableProviders],
		provider => provider.unavailableMessage !== undefined
			? `message:${provider.unavailableMessage}`
			: provider.unavailableReasonCode !== undefined
				? `code:${provider.unavailableReasonCode}`
				: provider.unavailableReason !== undefined ? `text:${provider.unavailableReason}` : 'none',
	);
	for (const providers of groups.values()) {
		const message = providers[0].unavailableMessage;
		if (message !== undefined) {
			reasons.push(message);
			continue;
		}
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
