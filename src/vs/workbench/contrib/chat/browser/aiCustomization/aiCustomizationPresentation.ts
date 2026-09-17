/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { ContributionEnablementState } from '../../common/enablement.js';
import { IAgentPlugin } from '../../common/plugins/agentPluginService.js';

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
