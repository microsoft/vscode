/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { ConfigurationScope, Extensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { IFileService } from 'vs/platform/files/common/files';
import { ILogService } from 'vs/platform/log/common/log';
import { Registry } from 'vs/platform/registry/common/platform';
import { IUserDataProfileService, IResourceProfile, ProfileCreationOptions } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import { removeComments, updateIgnoredSettings } from 'vs/platform/userDataSync/common/settingsMerge';
import { IUserDataSyncUtilService } from 'vs/platform/userDataSync/common/userDataSync';

interface ISettingsContent {
	settings: string;
}

export class SettingsProfile implements IResourceProfile {

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IUserDataSyncUtilService private readonly userDataSyncUtilService: IUserDataSyncUtilService,
		@ILogService private readonly logService: ILogService,
	) {
	}

	async getProfileContent(options?: ProfileCreationOptions): Promise<string> {
		const ignoredSettings = this.getIgnoredSettings();
		const formattingOptions = await this.userDataSyncUtilService.resolveFormattingOptions(this.userDataProfileService.currentProfile.settingsResource);
		const localContent = await this.getLocalFileContent();
		let settingsProfileContent = updateIgnoredSettings(localContent || '{}', '{}', ignoredSettings, formattingOptions);
		if (options?.skipComments) {
			settingsProfileContent = removeComments(settingsProfileContent, formattingOptions);
		}
		const settingsContent: ISettingsContent = {
			settings: settingsProfileContent
		};
		return JSON.stringify(settingsContent);
	}

	async applyProfile(content: string): Promise<void> {
		const settingsContent: ISettingsContent = JSON.parse(content);
		this.logService.trace(`Profile: Applying settings...`);
		const localSettingsContent = await this.getLocalFileContent();
		const formattingOptions = await this.userDataSyncUtilService.resolveFormattingOptions(this.userDataProfileService.currentProfile.settingsResource);
		const contentToUpdate = updateIgnoredSettings(settingsContent.settings, localSettingsContent || '{}', this.getIgnoredSettings(), formattingOptions);
		await this.fileService.writeFile(this.userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString(contentToUpdate));
		this.logService.info(`Profile: Applied settings`);
	}

	private getIgnoredSettings(): string[] {
		const allSettings = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties();
		const ignoredSettings = Object.keys(allSettings).filter(key => allSettings[key]?.scope === ConfigurationScope.MACHINE || allSettings[key]?.scope === ConfigurationScope.MACHINE_OVERRIDABLE);
		return ignoredSettings;
	}

	private async getLocalFileContent(): Promise<string | null> {
		try {
			const content = await this.fileService.readFile(this.userDataProfileService.currentProfile.settingsResource);
			return content.value.toString();
		} catch (error) {
			return null;
		}
	}

}
