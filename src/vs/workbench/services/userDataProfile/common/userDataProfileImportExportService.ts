/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IProgressService, ProgressLocation } from 'vs/platform/progress/common/progress';
import { ExtensionsImportExport } from 'vs/workbench/services/userDataProfile/common/extensionsImportExport';
import { GlobalStateImportExport } from 'vs/workbench/services/userDataProfile/common/globalStateImportExport';
import { IUserDataProfileTemplate, IUserDataProfileImportExportService, PROFILES_CATEGORY, IUserDataProfileManagementService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import { SettingsImportExport } from 'vs/workbench/services/userDataProfile/common/settingsImportExport';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';

export class UserDataProfileImportExportService implements IUserDataProfileImportExportService {

	readonly _serviceBrand: undefined;

	private readonly settingsProfile: SettingsImportExport;
	private readonly globalStateProfile: GlobalStateImportExport;
	private readonly extensionsProfile: ExtensionsImportExport;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IProgressService private readonly progressService: IProgressService,
		@INotificationService private readonly notificationService: INotificationService,
		@IUserDataProfileManagementService private readonly userDataProfileManagementService: IUserDataProfileManagementService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
	) {
		this.settingsProfile = instantiationService.createInstance(SettingsImportExport);
		this.globalStateProfile = instantiationService.createInstance(GlobalStateImportExport);
		this.extensionsProfile = instantiationService.createInstance(ExtensionsImportExport);
	}

	async exportProfile(options?: { skipComments: boolean }): Promise<IUserDataProfileTemplate> {
		const settings = await this.settingsProfile.export(options);
		const globalState = await this.globalStateProfile.export();
		const extensions = await this.extensionsProfile.export();
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
			title: localize('profiles.applying', "{0}: Importing...", PROFILES_CATEGORY),
		}, async progress => {
			await this.userDataProfileManagementService.createAndEnterProfile(name);
			if (profileTemplate.settings) {
				await this.settingsProfile.import(profileTemplate.settings);
			}
			if (profileTemplate.globalState) {
				await this.globalStateProfile.import(profileTemplate.globalState);
			}
			if (profileTemplate.extensions) {
				await this.extensionsProfile.import(profileTemplate.extensions);
			}
		});

		this.notificationService.info(localize('applied profile', "{0}: Imported successfully.", PROFILES_CATEGORY));
	}

}

registerSingleton(IUserDataProfileImportExportService, UserDataProfileImportExportService);
