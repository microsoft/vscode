/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken } from '../../../base/common/cancellation.js';
import { EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT } from './extensionManagement.js';
import { areSameExtensions, getExtensionId } from './extensionManagementUtil.js';
import * as semver from '../../../base/common/semver/semver.js';
/**
 * Migrates the installed unsupported nightly extension to a supported pre-release extension. It includes following:
 * 	- Uninstall the Unsupported extension
 * 	- Install (with optional storage migration) the Pre-release extension only if
 * 		- the extension is not installed
 * 		- or it is a release version and the unsupported extension is enabled.
 */
export async function migrateUnsupportedExtensions(profile, extensionManagementService, galleryService, extensionStorageService, extensionEnablementService, logService) {
    try {
        const extensionsControlManifest = await extensionManagementService.getExtensionsControlManifest();
        if (!extensionsControlManifest.deprecated) {
            return;
        }
        const installed = await extensionManagementService.getInstalled(1 /* ExtensionType.User */, profile?.extensionsResource);
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
                await extensionManagementService.uninstall(unsupportedExtension, { profileLocation: profile?.extensionsResource });
                logService.info(`Uninstalled the unsupported extension '${unsupportedExtension.identifier.id}'`);
                let preReleaseExtension = installed.find(i => areSameExtensions(i.identifier, { id: preReleaseExtensionId }));
                if (!preReleaseExtension || (preReleaseExtension.isPreReleaseVersion !== !!preRelease && isUnsupportedExtensionEnabled)) {
                    preReleaseExtension = await extensionManagementService.installFromGallery(gallery, { installPreReleaseVersion: preRelease, isMachineScoped: unsupportedExtension.isMachineScoped, operation: 4 /* InstallOperation.Migrate */, profileLocation: profile?.extensionsResource, context: { [EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT]: true } });
                    logService.info(`Installed the pre-release extension '${preReleaseExtension.identifier.id}'`);
                    if (!autoMigrate.donotDisable && !isUnsupportedExtensionEnabled) {
                        await extensionEnablementService.disableExtension(preReleaseExtension.identifier);
                        logService.info(`Disabled the pre-release extension '${preReleaseExtension.identifier.id}' because the unsupported extension '${unsupportedExtension.identifier.id}' is disabled`);
                    }
                    if (autoMigrate.storage) {
                        extensionStorageService.addToMigrationList(getExtensionId(unsupportedExtension.manifest.publisher, unsupportedExtension.manifest.name), getExtensionId(preReleaseExtension.manifest.publisher, preReleaseExtension.manifest.name));
                        logService.info(`Added pre-release extension to the storage migration list`);
                    }
                }
                logService.info(`Migrated '${unsupportedExtension.identifier.id}' extension to '${preReleaseExtensionId}' extension.`);
            }
            catch (error) {
                logService.error(error);
            }
        }
        if (extensionsControlManifest.autoUpdate) {
            for (const [extensionId, version] of Object.entries(extensionsControlManifest.autoUpdate)) {
                try {
                    const extensionToAutoUpdate = installed.find(i => areSameExtensions(i.identifier, { id: extensionId }) && semver.lte(i.manifest.version, version));
                    if (!extensionToAutoUpdate) {
                        continue;
                    }
                    const gallery = (await galleryService.getExtensions([{ id: extensionId, preRelease: extensionToAutoUpdate.preRelease }], { targetPlatform: await extensionManagementService.getTargetPlatform(), compatible: true }, CancellationToken.None))[0];
                    if (!gallery) {
                        logService.info(`Skipping updating '${extensionToAutoUpdate.identifier.id}' extension because, the compatible target '${extensionId}' extension is not found`);
                        continue;
                    }
                    await extensionManagementService.installFromGallery(gallery, { installPreReleaseVersion: extensionToAutoUpdate.preRelease, isMachineScoped: extensionToAutoUpdate.isMachineScoped, operation: 3 /* InstallOperation.Update */, profileLocation: profile?.extensionsResource, context: { [EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT]: true } });
                    logService.info(`Autoupdated '${extensionToAutoUpdate.identifier.id}' extension to '${gallery.version}' extension.`);
                }
                catch (error) {
                    logService.error(error);
                }
            }
        }
    }
    catch (error) {
        logService.error(error);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidW5zdXBwb3J0ZWRFeHRlbnNpb25zTWlncmF0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vdW5zdXBwb3J0ZWRFeHRlbnNpb25zTWlncmF0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSw4Q0FBOEMsRUFBOEcsTUFBTSwwQkFBMEIsQ0FBQztBQUN0TSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsY0FBYyxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFJakYsT0FBTyxLQUFLLE1BQU0sTUFBTSx1Q0FBdUMsQ0FBQztBQUdoRTs7Ozs7O0dBTUc7QUFDSCxNQUFNLENBQUMsS0FBSyxVQUFVLDRCQUE0QixDQUFDLE9BQXFDLEVBQUUsMEJBQXVELEVBQUUsY0FBd0MsRUFBRSx1QkFBaUQsRUFBRSwwQkFBNkQsRUFBRSxVQUF1QjtJQUNyVSxJQUFJLENBQUM7UUFDSixNQUFNLHlCQUF5QixHQUFHLE1BQU0sMEJBQTBCLENBQUMsNEJBQTRCLEVBQUUsQ0FBQztRQUNsRyxJQUFJLENBQUMseUJBQXlCLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDM0MsT0FBTztRQUNSLENBQUM7UUFDRCxNQUFNLFNBQVMsR0FBRyxNQUFNLDBCQUEwQixDQUFDLFlBQVksNkJBQXFCLE9BQU8sRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO1FBQ2pILEtBQUssTUFBTSxDQUFDLHNCQUFzQixFQUFFLFVBQVUsQ0FBQyxJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMseUJBQXlCLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQztZQUN6RyxJQUFJLENBQUMsVUFBVSxFQUFFLFNBQVMsRUFBRSxDQUFDO2dCQUM1QixTQUFT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