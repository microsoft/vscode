/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { CancellationToken } from '../../../base/common/cancellation.js';
import { getErrorMessage, isCancellationError } from '../../../base/common/errors.js';
import { Schemas } from '../../../base/common/network.js';
import { basename } from '../../../base/common/resources.js';
import { gt } from '../../../base/common/semver/semver.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { EXTENSION_IDENTIFIER_REGEX, IExtensionGalleryService, IExtensionManagementService } from './extensionManagement.js';
import { areSameExtensions, getExtensionId, getGalleryExtensionId, getIdAndVersion } from './extensionManagementUtil.js';
import { EXTENSION_CATEGORIES } from '../../extensions/common/extensions.js';
import { IProductService } from '../../product/common/productService.js';
const notFound = (id) => localize('notFound', "Extension '{0}' not found.", id);
const useId = localize('useId', "Make sure you use the full extension ID, including the publisher, e.g.: {0}", 'ms-dotnettools.csharp');
let ExtensionManagementCLI = class ExtensionManagementCLI {
    constructor(extensionsForceVersionByQuality, logger, extensionManagementService, extensionGalleryService, productService) {
        this.extensionsForceVersionByQuality = extensionsForceVersionByQuality;
        this.logger = logger;
        this.extensionManagementService = extensionManagementService;
        this.extensionGalleryService = extensionGalleryService;
        this.productService = productService;
        this.extensionsForceVersionByQuality = this.extensionsForceVersionByQuality.map(e => e.toLowerCase());
    }
    get location() {
        return undefined;
    }
    async listExtensions(showVersions, category, profileLocation) {
        let extensions = await this.extensionManagementService.getInstalled(1 /* ExtensionType.User */, profileLocation);
        const categories = EXTENSION_CATEGORIES.map(c => c.toLowerCase());
        if (category && category !== '') {
            if (categories.indexOf(category.toLowerCase()) < 0) {
                this.logger.info('Invalid category please enter a valid category. To list valid categories run --category without a category specified');
                return;
            }
            extensions = extensions.filter(e => {
                if (e.manifest.categories) {
                    const lowerCaseCategories = e.manifest.categories.map(c => c.toLowerCase());
                    return lowerCaseCategories.indexOf(category.toLowerCase()) > -1;
                }
                return false;
            });
        }
        else if (category === '') {
            this.logger.info('Possible Categories: ');
            categories.forEach(category => {
                this.logger.info(category);
            });
            return;
        }
        if (this.location) {
            this.logger.info(localize('listFromLocation', "Extensions installed on {0}:", this.location));
        }
        extensions = extensions.sort((e1, e2) => e1.identifier.id.localeCompare(e2.identifier.id));
        let lastId = undefined;
        for (const extension of extensions) {
            if (lastId !== extension.identifier.id) {
                lastId = extension.identifier.id;
                this.logger.info(showVersions ? `${lastId}@${extension.manifest.version}` : lastId);
            }
        }
    }
    async installExtensions(extensions, builtinExtensions, installOptions, force) {
        const failed = [];
        try {
            if (extensions.length) {
                this.logger.info(this.location ? localize('installingExtensionsOnLocation', "Installing extensions on {0}...", this.location) : localize('installingExtensions', "Installing extensions..."));
            }
            const installVSIXInfos = [];
            const installExtensionInfos = [];
            const addInstallExtensionInfo = (id, version, isBuiltin) => {
                if (this.extensionsForceVersionByQuality?.some(e => e === id.toLowerCase())) {
                    version = this.productService.quality !== 'stable' ? 'prerelease' : undefined;
                }
                installExtensionInfos.push({ id, version: version !== 'prerelease' ? version : undefined, installOptions: { ...installOptions, isBuiltin, installPreReleaseVersion: version === 'prerelease' || installOptions.installPreReleaseVersion } });
            };
            for (const extension of extensions) {
                if (extension instanceof URI) {
                    installVSIXInfos.push({ vsix: extension, installOptions });
                }
                else {
                    const [id, version] = getIdAndVersion(extension);
                    addInstallExtensionInfo(id, version, false);
                }
            }
            for (const extension of builtinExtensions) {
                if (extension instanceof URI) {
                    installVSIXInfos.push({ vsix: extension, installOptions: { ...installOptions, isBuiltin: true, donotIncludePackAndDependencies: true } });
                }
                else {
                    const [id, version] = getIdAndVersion(extension);
                    addInstallExtensionInfo(id, version, true);
                }
            }
            const installed = await this.extensionManagementService.getInstalled(undefined, installOptions.profileLocation);
            if (installVSIXInfos.length) {
                await Promise.all(installVSIXInfos.map(async ({ vsix, installOptions }) => {
                    try {
                        await this.installVSIX(vsix, installOptions, force, installed);
                    }
                    catch (err) {
                        this.logger.error(err);
                        failed.push(vsix.toString());
                    }
                }));
            }
            if (installExtensionInfos.length) {
                const failedGalleryExtensions = await this.installGalleryExtensions(installExtensionInfos, installed, force);
                failed.push(...failedGalleryExtensions);
            }
        }
        catch (error) {
            this.logger.error(localize('error while installing extensions', "Error while installing extensions: {0}", getErrorMessage(error)));
            throw error;
        }
        if (failed.length) {
            throw new Error(localize('installation failed', "Failed Installing Extensions: {0}", failed.join(', ')));
        }
    }
    async updateExtensions(profileLocation) {
        const installedExtensions = await this.extensionManagementService.getInstalled(1 /* ExtensionType.User */, profileLocation);
        const installedExtensionsQuery = [];
        for (const extension of installedExtensions) {
            if (!!extension.identifier.uuid) { // No need to check new version for an unpublished extension
                installedExtensionsQuery.push({ ...extension.identifier, preRelease: extension.preRelease });
            }
        }
        this.logger.trace(localize({ key: 'updateExtensionsQuery', comment: ['Placeholder is for the count of extensions'] }, "Fetching latest versions for {0} extensions", installedExtensionsQuery.length));
        const availableVersions = await this.extensionGalleryService.getExtensions(installedExtensionsQuery, { compatible: true }, CancellationToken.None);
        const extensionsToUpdate = [];
        for (const newVersion of availableVersions) {
            for (const oldVersion of installedExtensions) {
                if (areSameExtensions(oldVersion.identifier, newVersion.identifier) && gt(newVersion.version, oldVersion.manifest.version)) {
                    extensionsToUpdate.push({
                        extension: newVersion,
                        options: { operation: 3 /* InstallOperation.Update */, installPreReleaseVersion: oldVersion.preRelease, profileLocation, isApplicationScoped: oldVersion.isApplicationScoped }
                    });
                }
            }
        }
        if (!extensionsToUpdate.length) {
            this.logger.info(localize('updateExtensionsNoExtensions', "No extension to update"));
            return;
        }
        this.logger.info(localize('updateExtensionsNewVersionsAvailable', "Updating extensions: {0}", extensionsToUpdate.map(ext => ext.extension.identifier.id).join(', ')));
        const installationResult = await this.extensionManagementService.installGalleryExtensions(extensionsToUpdate);
        for (const extensionResult of installationResult) {
            if (extensionResult.error) {
                this.logger.error(localize('errorUpdatingExtension', "Error while updating extension {0}: {1}", extensionResult.identifier.id, getErrorMessage(extensionResult.error)));
            }
            else {
                this.logger.info(localize('successUpdate', "Extension '{0}' v{1} was successfully updated.", extensionResult.identifier.id, extensionResult.local?.manifest.version));
            }
        }
    }
    async installGalleryExtensions(installExtensionInfos, installed, force) {
        installExtensionInfos = installExtensionInfos.filter(installExtensionInfo => {
            const { id, version, installOptions } = installExtensionInfo;
            const installedExtension = installed.find(i => areSameExtensions(i.identifier, { id }));
            if (installedExtension) {
                if (!force && (!version || (version === 'prerelease' && installedExtension.preRelease))) {
                    this.logger.info(localize('alreadyInstalled-checkAndUpdate', "Extension '{0}' v{1} is already installed. Use '--force' option to update to latest version or provide '@<version>' to install a specific version, for example: '{2}@1.2.3'.", id, installedExtension.manifest.version, id));
                    return false;
                }
                if (version && installedExtension.manifest.version === version) {
                    this.logger.info(localize('alreadyInstalled', "Extension '{0}' is already installed.", `${id}@${version}`));
                    return false;
                }
                if (installedExtension.preRelease && version !== 'prerelease') {
                    installOptions.preRelease = false;
                }
            }
            return true;
        });
        if (!installExtensionInfos.length) {
            return [];
        }
        const failed = [];
        const extensionsToInstall = [];
        const galleryExtensions = await this.getGalleryExtensions(installExtensionInfos);
        await Promise.all(installExtensionInfos.map(async ({ id, version, installOptions }) => {
            const gallery = galleryExtensions.get(id.toLowerCase());
            if (!gallery) {
                this.logger.error(`${notFound(version ? `${id}@${version}` : id)}\n${useId}`);
                failed.push(id);
                return;
            }
            try {
                const manifest = await this.extensionGalleryService.getManifest(gallery, CancellationToken.None);
                if (manifest && !this.validateExtensionKind(manifest)) {
                    return;
                }
            }
            catch (err) {
                this.logger.error(err.message || err.stack || err);
                failed.push(id);
                return;
            }
            const installedExtension = installed.find(e => areSameExtensions(e.identifier, gallery.identifier));
            if (installedExtension) {
                if (gallery.version === installedExtension.manifest.version) {
                    this.logger.info(localize('alreadyInstalled', "Extension '{0}' is already installed.", version ? `${id}@${version}` : id));
                    return;
                }
                this.logger.info(localize('updateMessage', "Updating the extension '{0}' to the version {1}", id, gallery.version));
            }
            if (installOptions.isBuiltin) {
                this.logger.info(version ? localize('installing builtin with version', "Installing builtin extension '{0}' v{1}...", id, version) : localize('installing builtin ', "Installing builtin extension '{0}'...", id));
            }
            else {
                this.logger.info(version ? localize('installing with version', "Installing extension '{0}' v{1}...", id, version) : localize('installing', "Installing extension '{0}'...", id));
            }
            extensionsToInstall.push({
                extension: gallery,
                options: { ...installOptions, installGivenVersion: !!version, isApplicationScoped: installOptions.isApplicationScoped || installedExtension?.isApplicationScoped },
            });
        }));
        if (extensionsToInstall.length) {
            const installationResult = await this.extensionManagementService.installGalleryExtensions(extensionsToInstall);
            for (const extensionResult of installationResult) {
                if (extensionResult.error) {
                    this.logger.error(localize('errorInstallingExtension', "Error while installing extension {0}: {1}", extensionResult.identifier.id, getErrorMessage(extensionResult.error)));
                    failed.push(extensionResult.identifier.id);
                }
                else {
                    this.logger.info(localize('successInstall', "Extension '{0}' v{1} was successfully installed.", extensionResult.identifier.id, extensionResult.local?.manifest.version));
                }
            }
        }
        return failed;
    }
    async installVSIX(vsix, installOptions, force, installedExtensions) {
        const manifest = await this.extensionManagementService.getManifest(vsix);
        if (!manifest) {
            throw new Error('Invalid vsix');
        }
        const valid = await this.validateVSIX(manifest, force, installOptions.profileLocation, installedExtensions);
        if (valid) {
            try {
                await this.extensionManagementService.install(vsix, { ...installOptions, installGivenVersion: true });
                this.logger.info(localize('successVsixInstall', "Extension '{0}' was successfully installed.", basename(vsix)));
            }
            catch (error) {
                if (isCancellationError(error)) {
                    this.logger.info(localize('cancelVsixInstall', "Cancelled installing extension '{0}'.", basename(vsix)));
                }
                else {
                    throw error;
                }
            }
        }
    }
    async getGalleryExtensions(extensions) {
        const galleryExtensions = new Map();
        const preRelease = extensions.some(e => e.installOptions.installPreReleaseVersion);
        const targetPlatform = await this.extensionManagementService.getTargetPlatform();
        const extensionInfos = [];
        for (const extension of extensions) {
            if (EXTENSION_IDENTIFIER_REGEX.test(extension.id)) {
                extensionInfos.push({ ...extension, preRelease });
            }
        }
        if (extensionInfos.length) {
            const result = await this.extensionGalleryService.getExtensions(extensionInfos, { targetPlatform }, CancellationToken.None);
            for (const extension of result) {
                galleryExtensions.set(extension.identifier.id.toLowerCase(), extension);
            }
        }
        return galleryExtensions;
    }
    validateExtensionKind(_manifest) {
        return true;
    }
    async validateVSIX(manifest, force, profileLocation, installedExtensions) {
        if (!force) {
            const extensionIdentifier = { id: getGalleryExtensionId(manifest.publisher, manifest.name) };
            const newer = installedExtensions.find(local => areSameExtensions(extensionIdentifier, local.identifier) && gt(local.manifest.version, manifest.version));
            if (newer) {
                this.logger.info(localize('forceDowngrade', "A newer version of extension '{0}' v{1} is already installed. Use '--force' option to downgrade to older version.", newer.identifier.id, newer.manifest.version, manifest.version));
                return false;
            }
        }
        return this.validateExtensionKind(manifest);
    }
    async uninstallExtensions(extensions, force, profileLocation) {
        const getId = async (extensionDescription) => {
            if (extensionDescription instanceof URI) {
                const manifest = await this.extensionManagementService.getManifest(extensionDescription);
                return getExtensionId(manifest.publisher, manifest.name);
            }
            return extensionDescription;
        };
        const uninstalledExtensions = [];
        for (const extension of extensions) {
            const id = await getId(extension);
            const installed = await this.extensionManagementService.getInstalled(undefined, profileLocation);
            const extensionsToUninstall = installed.filter(e => areSameExtensions(e.identifier, { id }));
            if (!extensionsToUninstall.length) {
                throw new Error(`${this.notInstalled(id)}\n${useId}`);
            }
            if (extensionsToUninstall.some(e => e.type === 0 /* ExtensionType.System */)) {
                this.logger.info(localize('builtin', "Extension '{0}' is a Built-in extension and cannot be uninstalled", id));
                return;
            }
            if (!force && extensionsToUninstall.some(e => e.isBuiltin)) {
                this.logger.info(localize('forceUninstall', "Extension '{0}' is marked as a Built-in extension by user. Please use '--force' option to uninstall it.", id));
                return;
            }
            this.logger.info(localize('uninstalling', "Uninstalling {0}...", id));
            for (const extensionToUninstall of extensionsToUninstall) {
                await this.extensionManagementService.uninstall(extensionToUninstall, { profileLocation });
                uninstalledExtensions.push(extensionToUninstall);
            }
            if (this.location) {
                this.logger.info(localize('successUninstallFromLocation', "Extension '{0}' was successfully uninstalled from {1}!", id, this.location));
            }
            else {
                this.logger.info(localize('successUninstall', "Extension '{0}' was successfully uninstalled!", id));
            }
        }
    }
    async locateExtension(extensions) {
        const installed = await this.extensionManagementService.getInstalled();
        extensions.forEach(e => {
            installed.forEach(i => {
                if (i.identifier.id === e) {
                    if (i.location.scheme === Schemas.file) {
                        this.logger.info(i.location.fsPath);
                        return;
                    }
                }
            });
        });
    }
    notInstalled(id) {
        return this.location ? localize('notInstalleddOnLocation', "Extension '{0}' is not installed on {1}.", id, this.location) : localize('notInstalled', "Extension '{0}' is not installed.", id);
    }
};
ExtensionManagementCLI = __decorate([
    __param(2, IExtensionManagementService),
    __param(3, IExtensionGalleryService),
    __param(4, IProductService)
], ExtensionManagementCLI);
export { ExtensionManagementCLI };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uTWFuYWdlbWVudENMSS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnRDTEkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDekUsT0FBTyxFQUFFLGVBQWUsRUFBRSxtQkFBbUIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMxRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDN0QsT0FBTyxFQUFFLEVBQUUsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQzNELE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUNsRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFDM0MsT0FBTyxFQUFFLDBCQUEwQixFQUFFLHdCQUF3QixFQUFrQiwyQkFBMkIsRUFBOEYsTUFBTSwwQkFBMEIsQ0FBQztBQUN6TyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsY0FBYyxFQUFFLHFCQUFxQixFQUFFLGVBQWUsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ3pILE9BQU8sRUFBaUIsb0JBQW9CLEVBQXNCLE1BQU0sdUNBQXVDLENBQUM7QUFFaEgsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBR3pFLE1BQU0sUUFBUSxHQUFHLENBQUMsRUFBVSxFQUFFLEVBQUUsQ0FBQyxRQUFRLENBQUMsVUFBVSxFQUFFLDRCQUE0QixFQUFFLEVBQUUsQ0FBQyxDQUFDO0FBQ3hGLE1BQU0sS0FBSyxHQUFHLFFBQVEs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