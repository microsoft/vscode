/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT, IExtensionGalleryService, IExtensionManagementService, IGlobalExtensionEnablementService, InstallOperation } from './extensionManagement.js';
import { areSameExtensions, getExtensionId } from './extensionManagementUtil.js';
import { IExtensionStorageService } from './extensionStorage.js';
import { ExtensionType } from '../../extensions/common/extensions.js';
import { ILogService } from '../../log/common/log.js';

/**
 * Migrates the installed unsupported nightly extension to a supported pre-release extension. It includes following:
 * 	- Uninstall the Unsupported extension
 * 	- Install (with optional storage migration) the Pre-release extension only if
 * 		- the extension is not installed
 * 		- or it is a release version and the unsupported extension is enabled.
 */
export async function migrateUnsupportedExtensions(extensionManagementService: IExtensionManagementService, galleryService: IExtensionGalleryService, extensionStorageService: IExtensionStorageService, extensionEnablementService: IGlobalExtensionEnablementService, logService: ILogService): Promise<void> {
	try {
		const extensionsControlManifest = await extensionManagementService.getExtensionsControlManifest();
		if (!extensionsControlManifest.deprecated) {
			return;
		}
		const installed = await extensionManagementService.getInstalled(ExtensionType.User);
		for (const [unsupportedExtensionId, deprecated] of Object.entries(extensionsControlManifest.deprecated)) {
			if (!deprecated?.extension) {
				continue;
			}
			const { id: preReleaseExtensionId, autoMigrate, preRelease } = deprecated.extension;
			if (!autoMigrate) {
				continue;
			}
			const unsupportedExtension = installed.find(i => areSameExtensions(i.identifier, { id: unsupportedExtensionId }));
			// Unsupported Extension is not installed
			if (!unsupportedExtension) {
				continue;
			}

			const gallery = (await galleryService.getExtensions([{ id: preReleaseExtensionId, preRelease }], { targetPlatform: await extensionManagementService.getTargetPlatform(), compatible: true }, CancellationToken.None))[0];
			if (!gallery) {
				logService.info(`Skipping migrating '${unsupportedExtension.identifier.id}' extension because, the comaptible target '${preReleaseExtensionId}' extension is not found`);
				continue;
			}

			try {
				logService.info(`Migrating '${unsupportedExtension.identifier.id}' extension to '${preReleaseExtensionId}' extension...`);

				const isUnsupportedExtensionEnabled = !extensionEnablementService.getDisabledExtensions().some(e => areSameExtensions(e, unsupportedExtension.identifier));
				await extensionManagementService.uninstall(unsupportedExtension);
				logService.info(`Uninstalled the unsupported extension '${unsupportedExtension.identifier.id}'`);

				let preReleaseExtension = installed.find(i => areSameExtensions(i.identifier, { id: preReleaseExtensionId }));
				if (!preReleaseExtension || (!preReleaseExtension.isPreReleaseVersion && isUnsupportedExtensionEnabled)) {
					preReleaseExtension = await extensionManagementService.installFromGallery(gallery, { installPreReleaseVersion: true, isMachineScoped: unsupportedExtension.isMachineScoped, operation: InstallOperation.Migrate, context: { [EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT]: true } });
					logService.info(`Installed the pre-release extension '${preReleaseExtension.identifier.id}'`);
					if (!isUnsupportedExtensionEnabled) {
						await extensionEnablementService.disableExtension(preReleaseExtension.identifier);
						logService.info(`Disabled the pre-release extension '${preReleaseExtension.identifier.id}' because the unsupported extension '${unsupportedExtension.identifier.id}' is disabled`);
					}
					if (autoMigrate.storage) {
						extensionStorageService.addToMigrationList(getExtensionId(unsupportedExtension.manifest.publisher, unsupportedExtension.manifest.name), getExtensionId(preReleaseExtension.manifest.publisher, preReleaseExtension.manifest.name));
						logService.info(`Added pre-release extension to the storage migration list`);
					}
				}
				logService.info(`Migrated '${unsupportedExtension.identifier.id}' extension to '${preReleaseExtensionId}' extension.`);
			} catch (error) {
				logService.error(error);
			}
		}
	} catch (error) {
		logService.error(error);
	}
}
