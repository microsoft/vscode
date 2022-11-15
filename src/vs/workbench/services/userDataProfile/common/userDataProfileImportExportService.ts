/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IProgressService, ProgressLocation } from 'vs/platform/progress/common/progress';
import { ExtensionsResource } from 'vs/workbench/services/userDataProfile/common/extensionsResource';
import { GlobalStateResource } from 'vs/workbench/services/userDataProfile/common/globalStateResource';
import { IUserDataProfileTemplate, IUserDataProfileImportExportService, PROFILES_CATEGORY, IUserDataProfileManagementService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import { SettingsResource } from 'vs/workbench/services/userDataProfile/common/settingsResource';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';

export class UserDataProfileImportExportService implements IUserDataProfileImportExportService {

	readonly _serviceBrand: undefined;

	private readonly settingsResourceProfile: SettingsResource;
	private readonly globalStateProfile: GlobalStateResource;
	private readonly extensionsProfile: ExtensionsResource;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IProgressService private readonly progressService: IProgressService,
		@INotificationService private readonly notificationService: INotificationService,
		@IUserDataProfileManagementService private readonly userDataProfileManagementService: IUserDataProfileManagementService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
	) {
		this.settingsResourceProfile = instantiationService.createInstance(SettingsResource);
		this.globalStateProfile = instantiationService.createInstance(GlobalStateResource);
		this.extensionsProfile = instantiationService.createInstance(ExtensionsResource);
	}

	async exportProfile(options?: { skipComments: boolean }): Promise<IUserDataProfileTemplate> {
		const settings = await this.settingsResourceProfile.getContent(options);
		const globalState = await this.globalStateProfile.getContent();
		const extensions = await this.extensionsProfile.getContent();
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
			title: localize('profiles.importing', "{0}: Importing...", PROFILES_CATEGORY.value),
		}, async progress => {
			await this.userDataProfileManagementService.createAndEnterProfile(name);
			if (profileTemplate.settings) {
				await this.settingsResourceProfile.apply(profileTemplate.settings);
			}
			if (profileTemplate.globalState) {
				await this.globalStateProfile.apply(profileTemplate.globalState);
			}
			if (profileTemplate.extensions) {
				await this.extensionsProfile.apply(profileTemplate.extensions);
			}
		});

		this.notificationService.info(localize('imported profile', "{0}: Imported successfully.", PROFILES_CATEGORY.value));
	}

	async setProfile(profile: IUserDataProfileTemplate): Promise<void> {
		await this.progressService.withProgress({
			location: ProgressLocation.Notification,
			title: localize('profiles.applying', "{0}: Applying...", PROFILES_CATEGORY.value),
		}, async progress => {
			if (profile.settings) {
				await this.settingsResourceProfile.apply(profile.settings);
			}
			if (profile.globalState) {
				await this.globalStateProfile.apply(profile.globalState);
			}
			if (profile.extensions) {
				await this.extensionsProfile.apply(profile.extensions);
			}
		});
		this.notificationService.info(localize('applied profile', "{0}: Applied successfully.", PROFILES_CATEGORY.value));
	}

}

registerSingleton(IUserDataProfileImportExportService, UserDataProfileImportExportService, InstantiationType.Delayed);
