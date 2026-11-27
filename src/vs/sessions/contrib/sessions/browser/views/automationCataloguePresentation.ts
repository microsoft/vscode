/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { groupByMap } from '../../../../../base/common/collections.js';
import { localize } from '../../../../../nls.js';
import { cloudSandboxAddress } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { agentHostAuthority, normalizeRemoteAgentHostAddress } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { getEntryAddress, IRemoteAgentHostConnectionInfo, IRemoteAgentHostEntry, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { type IAutomationDescriptor, type IAutomationRun, type IAutomationSchedule, isAutomationVisible } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import type { IAutomationProviderDescriptor } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { automationScheduleToLocal, DAYS_OF_WEEK } from '../../../../../workbench/contrib/chat/common/automations/schedule.js';

export function formatAutomationRunStatus(run: IAutomationRun): string {
	if (run.statusDescription) {
		return run.statusDescription;
	}
	if (run.needsInput) {
		return localize('automationsAccessibleView.needsInput', "Needs input");
	}
	switch (run.status) {
		case 'pending':
			return localize('automationsAccessibleView.pending', "Pending");
		case 'running':
			return localize('automationsAccessibleView.running', "Running");
		case 'completed':
			return localize('automationsAccessibleView.completed', "Completed");
		case 'failed':
			return localize('automationsAccessibleView.failed', "Failed");
	}
}

export function getConnectedAutomationRemoteCount(entries: readonly IRemoteAgentHostEntry[], connections: readonly IRemoteAgentHostConnectionInfo[]): number {
	const connectedAddresses = new Set(connections
		.filter(connection => RemoteAgentHostConnectionStatus.isConnected(connection.status))
		.map(connection => normalizeRemoteAgentHostAddress(connection.address)));
	return entries.filter(entry => connectedAddresses.has(normalizeRemoteAgentHostAddress(getEntryAddress(entry)))).length;
}

export function formatSchedule(schedule: IAutomationSchedule): string {
	const localSchedule = automationScheduleToLocal(schedule);
	const { interval, scheduleHour, scheduleMinute } = localSchedule;
	const time = formatHourMinute(scheduleHour, scheduleMinute);
	switch (interval) {
		case 'once': return localize('scheduleOnceAt', "Once: {0}", schedule.runAt ? new Date(schedule.runAt).toLocaleString() : '');
		case 'cron': return localize('scheduleCron', "Cron: {0}", schedule.cronExpression);
		case 'hourly': return localize('scheduleHourly', "Hourly");
		case 'daily': return localize('scheduleDailyAt', "Daily at {0}", time);
		case 'weekdays': return localize('scheduleWeekdaysAt', "Weekdays at {0}", time);
		case 'weekly': {
			const day = DAYS_OF_WEEK[((localSchedule.scheduleDay % 7) + 7) % 7];
			return localize('scheduleWeeklyAt', "{0} at {1}", day, time);
		}
		case 'manual': return localize('scheduleManual', "Manual");
		case 'custom': return localize('scheduleCustom', "Custom schedule");
		default: return localize('scheduleManual', "Manual");
	}
}

function formatHourMinute(hour: number, minute: number): string {
	const date = new Date(Date.UTC(2000, 0, 1, Math.max(0, Math.min(23, hour | 0)), Math.max(0, Math.min(59, minute | 0))));
	return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
}

export function getAutomationsViewContent(automations: readonly IAutomationDescriptor[], runs: readonly IAutomationRun[], showOthers: boolean, sendLaterEnabled: boolean = false) {
	const hiddenIds = new Set(automations
		.filter(automation => !isAutomationVisible(automation, showOthers) || sendLaterEnabled && automation.purpose === 'scheduledChat')
		.map(automation => automation.id));
	return {
		automations: automations.filter(automation => !hiddenIds.has(automation.id)),
		runs: runs.filter(run => !hiddenIds.has(run.automationId) && !(sendLaterEnabled && run.purpose === 'scheduledChat')),
	};
}

export function getAutomationOwnershipGroups(automations: readonly IAutomationDescriptor[]) {
	return [
		{ ownership: 'user', label: localize('automations.yours', "Your automations"), automations: automations.filter(automation => automation.ownership !== 'repository') },
		{
			ownership: 'repository',
			label: localize('automations.repositoryOwned', "Shared automations"),
			description: localize('automations.repositoryOwnedDescription', "These automations are visible to anyone with repository access, and can be edited by anyone with write access."),
			automations: automations.filter(automation => automation.ownership === 'repository'),
		},
	].filter(group => group.automations.length > 0 || group.ownership === 'user' && automations.some(automation => automation.ownership === 'repository'))
		.map(group => ({ ...group, automations: group.automations.sort((a, b) => Number(b.enabled) - Number(a.enabled)) }));
}

export function hasEmptyAutomationSection(automations: readonly IAutomationDescriptor[]): boolean {
	return automations.length === 0 || getAutomationOwnershipGroups(automations)
		.some(group => group.automations.length === 0);
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
