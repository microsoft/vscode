/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IProgressService, ProgressLocation } from 'vs/platform/progress/common/progress';
import { ExtensionsProfile } from 'vs/workbench/services/profiles/common/extensionsProfile';
import { GlobalStateProfile } from 'vs/workbench/services/profiles/common/globalStateProfile';
import { IProfile, IWorkbenchProfileService, PROFILES_CATEGORY } from 'vs/workbench/services/profiles/common/profile';
import { SettingsProfile } from 'vs/workbench/services/profiles/common/settingsProfile';

export class WorkbenchProfileService implements IWorkbenchProfileService {

	readonly _serviceBrand: undefined;

	private readonly settingsProfile: SettingsProfile;
	private readonly globalStateProfile: GlobalStateProfile;
	private readonly extensionsProfile: ExtensionsProfile;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IProgressService private readonly progressService: IProgressService,
		@INotificationService private readonly notificationService: INotificationService
	) {
		this.settingsProfile = instantiationService.createInstance(SettingsProfile);
		this.globalStateProfile = instantiationService.createInstance(GlobalStateProfile);
		this.extensionsProfile = instantiationService.createInstance(ExtensionsProfile);
	}

	async createProfile(options?: { skipComments: boolean }): Promise<IProfile> {
		const settings = await this.settingsProfile.getProfileContent(options);
		const globalState = await this.globalStateProfile.getProfileContent();
		const extensions = await this.extensionsProfile.getProfileContent();
		return {
			settings,
			globalState,
			extensions
		};
	}

	async setProfile(profile: IProfile): Promise<void> {
		await this.progressService.withProgress({
			location: ProgressLocation.Notification,
			title: localize('profiles.applying', "{0}: Applying...", PROFILES_CATEGORY),
		}, async progress => {
			if (profile.settings) {
				await this.settingsProfile.applyProfile(profile.settings);
			}
			if (profile.globalState) {
				await this.globalStateProfile.applyProfile(profile.globalState);
			}
			if (profile.extensions) {
				await this.extensionsProfile.applyProfile(profile.extensions);
			}
		});
		this.notificationService.info(localize('applied profile', "{0}: Applied successfully.", PROFILES_CATEGORY));
	}

}

registerSingleton(IWorkbenchProfileService, WorkbenchProfileService);
