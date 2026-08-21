/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { ContributionEnablementState } from '../../common/enablement.js';
import { IAgentPlugin } from '../../common/plugins/agentPluginService.js';
import { IAICustomizationWorkspaceService } from '../../common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService } from '../../common/customizationHarnessService.js';

export function getActiveCustomizationTargetLabel(harnessService: ICustomizationHarnessService, workspaceService: IAICustomizationWorkspaceService): string {
	const label = harnessService.getActiveDescriptor().label.trim();
	if (label) {
		return label;
	}
	return workspaceService.isSessionsWindow
		? localize('activeSessionCustomizationTarget', "Active session")
		: localize('localCustomizationTarget', "Local");
}

export function getPluginScopeLabel(plugin: IAgentPlugin): string {
	switch (plugin.enablement.get()) {
		case ContributionEnablementState.EnabledWorkspace:
		case ContributionEnablementState.DisabledWorkspace:
			return localize('pluginWorkspaceScope', "Workspace");
		case ContributionEnablementState.EnabledProfile:
		case ContributionEnablementState.DisabledProfile:
			return localize('pluginProfileScope', "Profile");
		default:
			return localize('pluginUnknownScope', "Unknown");
	}
}

export function getPluginInclusionLabel(plugin: IAgentPlugin): string {
	if (plugin.policyBlocked?.get() === true) {
		return localize('pluginBlockedByOrganization', "Blocked by Organization");
	}

	switch (plugin.enablement.get()) {
		case ContributionEnablementState.EnabledWorkspace:
			return localize('pluginIncludedInWorkspace', "Included in Workspace");
		case ContributionEnablementState.DisabledWorkspace:
			return localize('pluginExcludedFromWorkspace', "Excluded from Workspace");
		case ContributionEnablementState.EnabledProfile:
			return localize('pluginIncludedForProfile', "Included for Profile");
		case ContributionEnablementState.DisabledProfile:
			return localize('pluginExcludedFromProfile', "Excluded from Profile");
		default:
			return localize('pluginUnknownInclusion', "Inclusion Unknown");
	}
}

export function getPluginStateSummary(plugin: IAgentPlugin, targetLabel: string): string {
	if (plugin.policyBlocked?.get() === true) {
		return localize('pluginPolicyBlockedSummary', "Installed in this client but blocked by your organization. Runtime activation is not reported by {0}.", targetLabel);
	}

	switch (plugin.enablement.get()) {
		case ContributionEnablementState.EnabledWorkspace:
			return localize('pluginEnabledWorkspaceSummary', "Installed in this client and included in this workspace. Runtime activation is not reported by {0}.", targetLabel);
		case ContributionEnablementState.DisabledWorkspace:
			return localize('pluginDisabledWorkspaceSummary', "Installed in this client but excluded from this workspace. Runtime activation is not reported by {0}.", targetLabel);
		case ContributionEnablementState.EnabledProfile:
			return localize('pluginEnabledProfileSummary', "Installed in this client and included for your profile. Runtime activation is not reported by {0}.", targetLabel);
		case ContributionEnablementState.DisabledProfile:
			return localize('pluginDisabledProfileSummary', "Installed in this client but excluded for your profile. Runtime activation is not reported by {0}.", targetLabel);
		default:
			return localize('pluginUnknownStateSummary', "Installed in this client. Inclusion and runtime activation are not reported by {0}.", targetLabel);
	}
}
