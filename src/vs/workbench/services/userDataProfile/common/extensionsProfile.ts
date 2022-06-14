/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { IExtensionGalleryService, IExtensionIdentifier, IExtensionManagementService, ILocalExtension } from 'vs/platform/extensionManagement/common/extensionManagement';
import { areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { ExtensionType } from 'vs/platform/extensions/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { EnablementState, IWorkbenchExtensionEnablementService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { IResourceProfile } from 'vs/workbench/services/userDataProfile/common/userDataProfile';

interface IProfileExtension {
	identifier: IExtensionIdentifier;
	preRelease?: boolean;
	disabled?: boolean;
}

export class ExtensionsProfile implements IResourceProfile {

	constructor(
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService,
		@IExtensionGalleryService private readonly extensionGalleryService: IExtensionGalleryService,
		@ILogService private readonly logService: ILogService,
	) {
	}

	async getProfileContent(): Promise<string> {
		const extensions = await this.getLocalExtensions();
		return JSON.stringify(extensions);
	}

	async applyProfile(content: string): Promise<void> {
		const profileExtensions: IProfileExtension[] = JSON.parse(content);
		const installedExtensions = await this.extensionManagementService.getInstalled();
		const extensionsToEnableOrDisable: { extension: ILocalExtension; enablementState: EnablementState }[] = [];
		const extensionsToInstall: IProfileExtension[] = [];
		for (const e of profileExtensions) {
			const installedExtension = installedExtensions.find(installed => areSameExtensions(installed.identifier, e.identifier));
			if (!installedExtension || installedExtension.preRelease !== e.preRelease) {
				extensionsToInstall.push(e);
			}
			if (installedExtension && this.extensionEnablementService.isEnabled(installedExtension) !== !e.disabled) {
				extensionsToEnableOrDisable.push({ extension: installedExtension, enablementState: e.disabled ? EnablementState.DisabledGlobally : EnablementState.EnabledGlobally });
			}
		}
		const extensionsToUninstall: ILocalExtension[] = installedExtensions.filter(extension => extension.type === ExtensionType.User && !profileExtensions.some(({ identifier }) => areSameExtensions(identifier, extension.identifier)));
		for (const { extension, enablementState } of extensionsToEnableOrDisable) {
			this.logService.trace(`Profile: Updating extension enablement...`, extension.identifier.id);
			await this.extensionEnablementService.setEnablement([extension], enablementState);
			this.logService.info(`Profile: Updated extension enablement`, extension.identifier.id);
		}
		if (extensionsToInstall.length) {
			const galleryExtensions = await this.extensionGalleryService.getExtensions(extensionsToInstall.map(e => ({ ...e.identifier, hasPreRelease: e.preRelease })), CancellationToken.None);
			await Promise.all(extensionsToInstall.map(async e => {
				const extension = galleryExtensions.find(galleryExtension => areSameExtensions(galleryExtension.identifier, e.identifier));
				if (!extension) {
					return;
				}
				if (await this.extensionManagementService.canInstall(extension)) {
					this.logService.trace(`Profile: Installing extension...`, e.identifier.id, extension.version);
					await this.extensionManagementService.installFromGallery(extension, { isMachineScoped: false, donotIncludePackAndDependencies: true, installPreReleaseVersion: e.preRelease } /* set isMachineScoped value to prevent install and sync dialog in web */);
					this.logService.info(`Profile: Installed extension.`, e.identifier.id, extension.version);
				} else {
					this.logService.info(`Profile: Skipped installing extension because it cannot be installed.`, extension.displayName || extension.identifier.id);
				}
			}));
		}
		if (extensionsToUninstall.length) {
			await Promise.all(extensionsToUninstall.map(e => this.extensionManagementService.uninstall(e)));
		}
	}

	private async getLocalExtensions(): Promise<IProfileExtension[]> {
		const result: IProfileExtension[] = [];
		const installedExtensions = await this.extensionManagementService.getInstalled(undefined);
		for (const extension of installedExtensions) {
			const { identifier, preRelease } = extension;
			const enablementState = this.extensionEnablementService.getEnablementState(extension);
			const disabled = !this.extensionEnablementService.isEnabledEnablementState(enablementState);
			if (!disabled && extension.type === ExtensionType.System) {
				// skip enabled system extensions
				continue;
			}
			if (disabled && enablementState !== EnablementState.DisabledGlobally && enablementState !== EnablementState.DisabledWorkspace) {
				//skip extensions that are not disabled by user
				continue;
			}
			const profileExtension: IProfileExtension = { identifier };
			if (disabled) {
				profileExtension.disabled = true;
			}
			if (preRelease) {
				profileExtension.preRelease = true;
			}
			result.push(profileExtension);
		}
		return result;
	}
}
