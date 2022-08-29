/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IProgressService, ProgressLocation } from 'vs/platform/progress/common/progress';
import { ExtensionsProfile } from 'vs/workbench/services/userDataProfile/common/extensionsProfile';
import { GlobalStateProfile } from 'vs/workbench/services/userDataProfile/common/globalStateProfile';
import { IUserDataProfileTemplate, IUserDataProfileImportExportService, PROFILES_CATEGORY, IUserDataProfileManagementService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import { SettingsProfile } from 'vs/workbench/services/userDataProfile/common/settingsProfile';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';

export class UserDataProfileImportExportService implements IUserDataProfileImportExportService {

	readonly _serviceBrand: undefined;

	private readonly settingsProfile: SettingsProfile;
	private readonly globalStateProfile: GlobalStateProfile;
	private readonly extensionsProfile: ExtensionsProfile;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IProgressService private readonly progressService: IProgressService,
		@INotificationService private readonly notificationService: INotificationService,
		@IUserDataProfileManagementService private readonly userDataProfileManagementService: IUserDataProfileManagementService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
	) {
		this.settingsProfile = instantiationService.createInstance(SettingsProfile);
		this.globalStateProfile = instantiationService.createInstance(GlobalStateProfile);
		this.extensionsProfile = instantiationService.createInstance(ExtensionsProfile);
	}

	async exportProfile(options?: { skipComments: boolean }): Promise<IUserDataProfileTemplate> {
		const settings = await this.settingsProfile.getProfileContent(options);
		const globalState = await this.globalStateProfile.getProfileContent();
		const extensions = await this.extensionsProfile.getProfileContent();
		return {
			settings,
			globalState,
			extensions
		};
	}

	async importProfile(profileTemplate: IUserDataProfileTemplate): Promise<void> {
		const name = await this.quickInputService.input({
			placeHolder: localize('name', "Profile name"),
			title: localize('save profile as', "Create from Current Profile..."),
		});
		if (!name) {
			return undefined;
		}

		await this.progressService.withProgress({
			location: ProgressLocation.Notification,
			title: localize('profiles.importing', "{0}: Importing...", PROFILES_CATEGORY),
		}, async progress => {
			await this.userDataProfileManagementService.createAndEnterProfile(name);
			if (profileTemplate.settings) {
				await this.settingsProfile.applyProfile(profileTemplate.settings);
			}
			if (profileTemplate.globalState) {
				await this.globalStateProfile.applyProfile(profileTemplate.globalState);
			}
			if (profileTemplate.extensions) {
				await this.extensionsProfile.applyProfile(profileTemplate.extensions);
			}
		});

		this.notificationService.info(localize('imported profile', "{0}: Imported successfully.", PROFILES_CATEGORY));
	}

	async setProfile(profile: IUserDataProfileTemplate): Promise<void> {
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

registerSingleton(IUserDataProfileImportExportService, UserDataProfileImportExportService, false);
