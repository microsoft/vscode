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
import { IExtensionGalleryService, ExtensionManagementError, EXTENSION_INSTALL_CLIENT_TARGET_PLATFORM_CONTEXT, IAllowedExtensionsService, VerifyExtensionSignatureConfigKey } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { areSameExtensions } from '../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { isNonEmptyArray } from '../../../../base/common/arrays.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { localize } from '../../../../nls.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Promises } from '../../../../base/common/async.js';
import { IExtensionManifestPropertiesService } from '../../extensions/common/extensionManifestPropertiesService.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { RemoteExtensionManagementService } from '../common/remoteExtensionManagementService.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { IUserDataProfileService } from '../../userDataProfile/common/userDataProfile.js';
import { IRemoteUserDataProfilesService } from '../../userDataProfile/common/remoteUserDataProfiles.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { areApiProposalsCompatible } from '../../../../platform/extensions/common/extensionValidator.js';
import { isBoolean, isUndefined } from '../../../../base/common/types.js';
let NativeRemoteExtensionManagementService = class NativeRemoteExtensionManagementService extends RemoteExtensionManagementService {
    constructor(channel, localExtensionManagementServer, productService, userDataProfileService, userDataProfilesService, remoteUserDataProfilesService, uriIdentityService, logService, galleryService, configurationService, allowedExtensionsService, fileService, extensionManifestPropertiesService) {
        super(channel, productService, allowedExtensionsService, userDataProfileService, userDataProfilesService, remoteUserDataProfilesService, uriIdentityService);
        this.localExtensionManagementServer = localExtensionManagementServer;
        this.logService = logService;
        this.galleryService = galleryService;
        this.configurationService = configurationService;
        this.fileService = fileService;
        this.extensionManifestPropertiesService = extensionManifestPropertiesService;
    }
    async install(vsix, options) {
        const local = await super.install(vsix, options);
        await this.installUIDependenciesAndPackedExtensions(local);
        return local;
    }
    async installFromGallery(extension, installOptions = {}) {
        if (isUndefined(installOptions.donotVerifySignature)) {
            const value = this.configurationService.getValue(VerifyExtensionSignatureConfigKey);
            installOptions.donotVerifySignature = isBoolean(value) ? !value : undefined;
        }
        const local = await this.doInstallFromGallery(extension, installOptions);
        await this.installUIDependenciesAndPackedExtensions(local);
        return local;
    }
    async doInstallFromGallery(extension, installOptions) {
        if (installOptions.downloadExtensionsLocally || this.configurationService.getValue('remote.downloadExtensionsLocally')) {
            return this.downloadAndInstall(extension, installOptions);
        }
        try {
            const clientTargetPlatform = await this.localExtensionManagementServer.extensionManagementService.getTargetPlatform();
            return await super.installFromGallery(extension, { ...installOptions, context: { ...installOptions?.context, [EXTENSION_INSTALL_CLIENT_TARGET_PLATFORM_CONTEXT]: clientTargetPlatform } });
        }
        catch (error) {
            switch (error.name) {
                case "Download" /* ExtensionManagementErrorCode.Download */:
                case "DownloadSignature" /* ExtensionManagementErrorCode.DownloadSignature */:
                case "Gallery" /* ExtensionManagementErrorCode.Gallery */:
                case "Internal" /* ExtensionManagementErrorCode.Internal */:
                case "Unknown" /* ExtensionManagementErrorCode.Unknown */:
                    try {
                        this.logService.error(`Error while installing '${extension.identifier.id}' extension in the remote server.`, toErrorMessage(error));
                        return await this.downloadAndInstall(extension, installOptions);
                    }
                    catch (e) {
                        this.logService.error(e);
                        throw e;
                    }
                default:
                    this.logService.debug('Remote Install Error Name', error.name);
                    throw error;
            }
        }
    }
    async downloadAndInstall(extension, installOptions) {
        this.logService.info(`Downloading the '${extension.identifier.id}' extension locally and install`);
        const compatible = await this.checkAndGetCompatible(extension, !!installOptions.installPreReleaseVersion);
        installOptions = { ...installOptions, donotIncludePackAndDependencies: true };
        const installed = await this.getInstalled(1 /* ExtensionType.User */, undefined, installOptions.productVersion);
        const workspaceExtensions = await this.getAllWorkspaceDependenciesAndPackedExtensions(compatible, CancellationToken.None);
        if (workspaceExtensions.length) {
            this.logService.info(`Downloading the workspace dependencies and packed extensions of '${compatible.identifier.id}' locally and install`);
            for (const workspaceExtension of workspaceExtensions) {
                await this.downloadCompatibleAndInstall(workspaceExtension, installed, installOptions);
            }
        }
        return await this.downloadCompatibleAndInstall(compatible, installed, installOptions);
    }
    async downloadCompatibleAndInstall(extension, installed, installOptions) {
        const compatible = await this.checkAndGetCompatible(extension, !!installOptions.installPreReleaseVersion);
        this.logService.trace('Downloading extension:', compatible.identifier.id);
        const location = await this.localExtensionManagementServer.extensionManagementService.download(compatible, installed.filter(i => areSameExtensions(i.identifier, compatible.identifier))[0] ? 3 /* InstallOperation.Update */ : 2 /* InstallOperation.Install */, !!installOptions.donotVerifySignature);
        this.logService.info('Downloaded extension:', compatible.identifier.id, location.path);
        try {
            const local = await super.install(location, { ...installOptions, keepExisting: true });
            this.logService.info(`Successfully installed '${compatible.identifier.id}' extension`);
            return local;
        }
        finally {
            try {
                await this.fileService.del(location);
            }
            catch (error) {
                this.logService.error(error);
            }
        }
    }
    async checkAndGetCompatible(extension, includePreRelease) {
        const targetPlatform = await this.getTargetPlatform();
        let compatibleExtension = null;
        if (extension.hasPreReleaseVersion && extension.properties.isPreReleaseVersion !== includePreRelease) {
            compatibleExtension = (await this.galleryService.getExtensions([{ ...extension.identifier, preRelease: includePreRelease }], { targetPlatform, compatible: true }, CancellationToken.None))[0] || null;
        }
        if (!compatibleExtension && await this.galleryService.isExtensionCompatible(extension, includePreRelease, targetPlatform)) {
            compatibleExtension = extension;
        }
        if (!compatibleExtension) {
            compatibleExtension = await this.galleryService.getCompatibleExtension(extension, includePreRelease, targetPlatform);
        }
        if (!compatibleExtension) {
            const incompatibleApiProposalsMessages = [];
            if (!areApiProposalsCompatible(extension.properties.enabledApiProposals ?? [], incompatibleApiProposalsMessages)) {
                throw new ExtensionManagementError(localize('incompatibleAPI', "Can't install '{0}' extension. {1}", extension.displayName ?? extension.identifier.id, incompatibleApiProposalsMessages[0]), "IncompatibleApi" /* ExtensionManagementErrorCode.IncompatibleApi */);
            }
            /** If no compatible release version is found, check if the extension has a release version or not and throw relevant error */
            if (!includePreRelease && extension.properties.isPreReleaseVersion && (await this.galleryService.getExtensions([extension.identifier], CancellationToken.None))[0]) {
                throw new ExtensionManagementError(localize('notFoundReleaseExtension', "Can't install release version of '{0}' extension because it has no release version.", extension.identifier.id), "ReleaseVersionNotFound" /* ExtensionManagementErrorCode.ReleaseVersionNotFound */);
            }
            throw new ExtensionManagementError(localize('notFoundCompatibleDependency', "Can't install '{0}' extension because it is not compatible with the current version of {1} (version {2}).", extension.identifier.id, this.productService.nameLong, this.productService.version), "Incompatible" /* ExtensionManagementErrorCode.Incompatible */);
        }
        return compatibleExtension;
    }
    async installUIDependenciesAndPackedExtensions(local) {
        const uiExtensions = await this.getAllUIDependenciesAndPackedExtensions(local.manifest, CancellationToken.None);
        const installed = await this.localExtensionManagementServer.extensionManagementService.getInstalled();
        const toInstall = uiExtensions.filter(e => installed.every(i => !areSameExtensions(i.identifier, e.identifier)));
        if (toInstall.length) {
            this.logService.info(`Installing UI dependencies and packed extensions of '${local.identifier.id}' locally`);
            await Promises.settled(toInstall.map(d => this.localExtensionManagementServer.extensionManagementService.installFromGallery(d)));
        }
    }
    async getAllUIDependenciesAndPackedExtensions(manifest, token) {
        const result = new Map();
        const extensions = [...(manifest.extensionPack || []), ...(manifest.extensionDependencies || [])];
        await this.getDependenciesAndPackedExtensionsRecursively(extensions, result, true, token);
        return [...result.values()];
    }
    async getAllWorkspaceDependenciesAndPackedExtensions(extension, token) {
        const result = new Map();
        result.set(extension.identifier.id.toLowerCase(), extension);
        const manifest = await this.galleryService.getManifest(extension, token);
        if (manifest) {
            const extensions = [...(manifest.extensionPack || []), ...(manifest.extensionDependencies || [])];
            await this.getDependenciesAndPackedExtensionsRecursively(extensions, result, false, token);
        }
        result.delete(extension.identifier.id);
        return [...result.values()];
    }
    async getDependenciesAndPackedExtensionsRecursively(toGet, result, uiExtension, token) {
        if (toGet.length === 0) {
            return Promise.resolve();
        }
        const extensions = await this.galleryService.getExtensions(toGet.map(id => ({ id })), token);
        const manifests = await Promise.all(extensions.map(e => this.galleryService.getManifest(e, token)));
        const extensionsManifests = [];
        for (let idx = 0; idx < extensions.length; idx++) {
            const extension = extensions[idx];
            const manifest = manifests[idx];
            if (manifest && this.extensionManifestPropertiesService.prefersExecuteOnUI(manifest) === uiExtension) {
                result.set(extension.identifier.id.toLowerCase(), extension);
                extensionsManifests.push(manifest);
            }
        }
        toGet = [];
        for (const extensionManifest of extensionsManifests) {
            if (isNonEmptyArray(extensionManifest.extensionDependencies)) {
                for (const id of extensionManifest.extensionDependencies) {
                    if (!result.has(id.toLowerCase())) {
                        toGet.push(id);
                    }
                }
            }
            if (isNonEmptyArray(extensionManifest.extensionPack)) {
                for (const id of extensionManifest.extensionPack) {
                    if (!result.has(id.toLowerCase())) {
                        toGet.push(id);
                    }
                }
            }
        }
        return this.getDependenciesAndPackedExtensionsRecursively(toGet, result, uiExtension, token);
    }
};
NativeRemoteExtensionManagementService = __decorate([
    __param(2, IProductService),
    __param(3, IUserDataProfileService),
    __param(4, IUserDataProfilesService),
    __param(5, IRemoteUserDataProfilesService),
    __param(6, IUriIdentityService),
    __param(7, ILogService),
    __param(8, IExtensionGalleryService),
    __param(9, IConfigurationService),
    __param(10, IAllowedExtensionsService),
    __param(11, IFileService),
    __param(12, IExtensionManifestPropertiesService)
], NativeRemoteExtensionManagementService);
export { NativeRemoteExtensionManagementService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvZXh0ZW5zaW9uTWFuYWdlbWVudC9lbGVjdHJvbi1icm93c2VyL3JlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBc0Msd0JBQXdCLEVBQW9DLHdCQUF3QixFQUFnQyxnREFBZ0QsRUFBRSx5QkFBeUIsRUFBRSxpQ0FBaUMsRUFBRSxNQUFNLHdFQUF3RSxDQUFDO0FBR2hXLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDRFQUE0RSxDQUFDO0FBQy9HLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNyRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDekUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDeEYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFFbkcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxtQ0FBbUMsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3BILE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsZ0NBQWdDLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUNqRyxPQUFP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