/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IStatusbarService, StatusbarAlignment } from 'vs/workbench/services/statusbar/browser/statusbar';
import { PROFILES_CATEGORY } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import '../common/profileActions';
// import '../common/userDataProfileActions';

class UserDataProfileStatusBarEntryContribution implements IWorkbenchContribution {

	constructor(
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IStatusbarService private readonly statusBarService: IStatusbarService
	) {
		this.updateStatus();
	}

	private async updateStatus(): Promise<void> {
		const profiles = await this.userDataProfilesService.getAllProfiles();
		if (profiles.length) {
			this.statusBarService.addEntry({
				name: this.userDataProfilesService.currentProfile.name!,
				command: 'workbench.profiles.actions.switchProfile',
				ariaLabel: localize('currentProfile', "Current Settings Profile is {0}", this.userDataProfilesService.currentProfile.name),
				text: `${PROFILES_CATEGORY}: ${this.userDataProfilesService.currentProfile.name!}`,
			}, 'status.userDataProfile', StatusbarAlignment.LEFT, 1);
		}
	}
}

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(UserDataProfileStatusBarEntryContribution, LifecyclePhase.Eventually);
