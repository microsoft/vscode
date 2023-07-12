/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { ConfigurationScope, Extensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { FileOperationError, FileOperationResult, IFileService } from 'vs/platform/files/common/files';
import { ILogService } from 'vs/platform/log/common/log';
import { Registry } from 'vs/platform/registry/common/platform';
import { IProfileResource, IProfileResourceChildTreeItem, IProfileResourceInitializer, IProfileResourceTreeItem, IUserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import { updateIgnoredSettings } from 'vs/platform/userDataSync/common/settingsMerge';
import { IUserDataSyncUtilService } from 'vs/platform/userDataSync/common/userDataSync';
import { ITreeItemCheckboxState, TreeItemCollapsibleState } from 'vs/workbench/common/views';
import { IUserDataProfile, ProfileResourceType } from 'vs/platform/userDataProfile/common/userDataProfile';
import { API_OPEN_EDITOR_COMMAND_ID } from 'vs/workbench/browser/parts/editor/editorCommands';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { localize } from 'vs/nls';

interface ISettingsContent {
	settings: string | null;
}

export class SettingsResourceInitializer implements IProfileResourceInitializer {

	constructor(
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
	) {
	}

	async initialize(content: string): Promise<void> {
		const settingsContent: ISettingsContent = JSON.parse(content);
		if (settingsContent.settings === null) {
			this.logService.info(`Initializing Profile: No settings to apply...`);
			return;
		}
		await this.fileService.writeFile(this.userDataProfileService.currentProfile.settingsResource, VSBuffer.fromString(settingsContent.settings));
	}
}

export class SettingsResource implements IProfileResource {

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IUserDataSyncUtilService private readonly userDataSyncUtilService: IUserDataSyncUtilService,
		@ILogService private readonly logService: ILogService,
	) {
	}

	async getContent(profile: IUserDataProfile): Promise<string> {
		const settingsContent = await this.getSettingsContent(profile);
		return JSON.stringify(settingsContent);
	}

	async getSettingsContent(profile: IUserDataProfile): Promise<ISettingsContent> {
		const localContent = await this.getLocalFileContent(profile);
		if (localContent === null) {
			return { settings: null };
		} else {
			const ignoredSettings = this.getIgnoredSettings();
			const formattingOptions = await this.userDataSyncUtilService.resolveFormattingOptions(profile.settingsResource);
			const settings = updateIgnoredSettings(localContent || '{}', '{}', ignoredSettings, formattingOptions);
			return { settings };
		}
	}

	async apply(content: string, profile: IUserDataProfile): Promise<void> {
		const settingsContent: ISettingsContent = JSON.parse(content);
		if (settingsContent.settings === null) {
			this.logService.info(`Importing Profile (${profile.name}): No settings to apply...`);
			return;
		}
		const localSettingsContent = await this.getLocalFileContent(profile);
		const formattingOptions = await this.userDataSyncUtilService.resolveFormattingOptions(profile.settingsResource);
		const contentToUpdate = updateIgnoredSettings(settingsContent.settings, localSettingsContent || '{}', this.getIgnoredSettings(), formattingOptions);
		await this.fileService.writeFile(profile.settingsResource, VSBuffer.fromString(contentToUpdate));
	}

	private getIgnoredSettings(): string[] {
		const allSettings = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties();
		const ignoredSettings = Object.keys(allSettings).filter(key => allSettings[key]?.scope === ConfigurationScope.MACHINE || allSettings[key]?.scope === ConfigurationScope.MACHINE_OVERRIDABLE);
		return ignoredSettings;
	}

	private async getLocalFileContent(profile: IUserDataProfile): Promise<string | null> {
		try {
			const content = await this.fileService.readFile(profile.settingsResource);
			return content.value.toString();
		} catch (error) {
			// File not found
			if (error instanceof FileOperationError && error.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
				return null;
			} else {
				throw error;
			}
		}
	}

}

export class SettingsResourceTreeItem implements IProfileResourceTreeItem {

	readonly type = ProfileResourceType.Settings;
	readonly handle = ProfileResourceType.Settings;
	readonly label = { label: localize('settings', "Settings") };
	readonly collapsibleState = TreeItemCollapsibleState.Expanded;
	checkbox: ITreeItemCheckboxState | undefined;

	constructor(
		private readonly profile: IUserDataProfile,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) { }

	async getChildren(): Promise<IProfileResourceChildTreeItem[]> {
		return [{
			handle: this.profile.settingsResource.toString(),
			resourceUri: this.profile.settingsResource,
			collapsibleState: TreeItemCollapsibleState.None,
			parent: this,
			command: {
				id: API_OPEN_EDITOR_COMMAND_ID,
				title: '',
				arguments: [this.profile.settingsResource, undefined, undefined]
			}
		}];
	}

	async hasContent(): Promise<boolean> {
		const settingsContent = await this.instantiationService.createInstance(SettingsResource).getSettingsContent(this.profile);
		return settingsContent.settings !== null;
	}

	async getContent(): Promise<string> {
		return this.instantiationService.createInstance(SettingsResource).getContent(this.profile);
	}

	isFromDefaultProfile(): boolean {
		return !this.profile.isDefault && !!this.profile.useDefaultFlags?.settings;
	}

}
