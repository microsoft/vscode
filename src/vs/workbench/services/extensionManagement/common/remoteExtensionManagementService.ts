/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { Event } from 'vs/base/common/event';
import { ILocalExtension, IGalleryExtension, InstallOptions, InstallVSIXOptions, UninstallOptions } from 'vs/platform/extensionManagement/common/extensionManagement';
import { URI } from 'vs/base/common/uri';
import { ExtensionType } from 'vs/platform/extensions/common/extensions';
import { IProfileAwareExtensionManagementService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { ExtensionManagementChannelClient } from 'vs/platform/extensionManagement/common/extensionManagementIpc';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';

export class RemoteExtensionManagementService extends ExtensionManagementChannelClient implements IProfileAwareExtensionManagementService {

	readonly onDidChangeProfile = Event.None;
	get onProfileAwareInstallExtension() { return super.onInstallExtension; }
	get onProfileAwareDidInstallExtensions() { return super.onDidInstallExtensions; }
	get onProfileAwareUninstallExtension() { return super.onUninstallExtension; }
	get onProfileAwareDidUninstallExtension() { return super.onDidUninstallExtension; }

	constructor(
		channel: IChannel,
		@IUserDataProfilesService private readonly userDataProfileService: IUserDataProfilesService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
	) {
		super(channel);
	}

	override getInstalled(type: ExtensionType | null = null, profileLocation?: URI): Promise<ILocalExtension[]> {
		this.validateProfileLocation({ profileLocation });
		return super.getInstalled(type);
	}

	override uninstall(extension: ILocalExtension, options?: UninstallOptions): Promise<void> {
		options = this.validateProfileLocation(options);
		return super.uninstall(extension, options);
	}

	override async install(vsix: URI, options?: InstallVSIXOptions): Promise<ILocalExtension> {
		options = this.validateProfileLocation(options);
		return super.install(vsix, options);
	}

	override async installFromGallery(extension: IGalleryExtension, options?: InstallOptions): Promise<ILocalExtension> {
		options = this.validateProfileLocation(options);
		return super.installFromGallery(extension, options);
	}

	private validateProfileLocation<T extends { profileLocation?: URI }>(options?: T): T | undefined {
		if (options?.profileLocation) {
			if (!this.uriIdentityService.extUri.isEqual(options?.profileLocation, this.userDataProfileService.defaultProfile.extensionsResource)) {
				throw new Error('This opertaion is not supported in remote scenario');
			}
			options = { ...options, profileLocation: undefined };
		}
		return options;
	}

}
