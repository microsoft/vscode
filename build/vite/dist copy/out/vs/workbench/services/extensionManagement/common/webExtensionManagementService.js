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
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { IExtensionGalleryService, IAllowedExtensionsService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { URI } from '../../../../base/common/uri.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { areSameExtensions, getGalleryExtensionId } from '../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { IWebExtensionsScannerService } from './extensionManagement.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { AbstractExtensionManagementService, AbstractExtensionTask, toExtensionManagementError } from '../../../../platform/extensionManagement/common/abstractExtensionManagementService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IExtensionManifestPropertiesService } from '../../extensions/common/extensionManifestPropertiesService.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { isBoolean, isUndefined } from '../../../../base/common/types.js';
import { IUserDataProfileService } from '../../userDataProfile/common/userDataProfile.js';
import { delta } from '../../../../base/common/arrays.js';
import { compare } from '../../../../base/common/strings.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
let WebExtensionManagementService = class WebExtensionManagementService extends AbstractExtensionManagementService {
    get onProfileAwareInstallExtension() { return super.onInstallExtension; }
    get onInstallExtension() { return Event.filter(this.onProfileAwareInstallExtension, e => this.filterEvent(e), this.disposables); }
    get onProfileAwareDidInstallExtensions() { return super.onDidInstallExtensions; }
    get onDidInstallExtensions() {
        return Event.filter(Event.map(this.onProfileAwareDidInstallExtensions, results => results.filter(e => this.filterEvent(e)), this.disposables), results => results.length > 0, this.disposables);
    }
    get onProfileAwareUninstallExtension() { return super.onUninstallExtension; }
    get onUninstallExtension() { return Event.filter(this.onProfileAwareUninstallExtension, e => this.filterEvent(e), this.disposables); }
    get onProfileAwareDidUninstallExtension() { return super.onDidUninstallExtension; }
    get onDidUninstallExtension() { return Event.filter(this.onProfileAwareDidUninstallExtension, e => this.filterEvent(e), this.disposables); }
    get onProfileAwareDidUpdateExtensionMetadata() { return super.onDidUpdateExtensionMetadata; }
    constructor(extensionGalleryService, telemetryService, logService, webExtensionsScannerService, extensionManifestPropertiesService, userDataProfileService, productService, allowedExtensionsService, userDataProfilesService, uriIdentityService) {
        super(extensionGalleryService, telemetryService, uriIdentityService, logService, productService, allowedExtensionsService, userDataProfilesService);
        this.webExtensionsScannerService = webExtensionsScannerService;
        this.extensionManifestPropertiesService = extensionManifestPropertiesService;
        this.userDataProfileService = userDataProfileService;
        this.disposables = this._register(new DisposableStore());
        this._onDidChangeProfile = this._register(new Emitter());
        this.onDidChangeProfile = this._onDidChangeProfile.event;
        this._register(userDataProfileService.onDidChangeCurrentProfile(e => {
            if (!this.uriIdentityService.extUri.isEqual(e.previous.extensionsResource, e.profile.extensionsResource)) {
                e.join(this.whenProfileChanged(e));
            }
        }));
    }
    filterEvent({ profileLocation, applicationScoped }) {
        profileLocation = profileLocation ?? this.userDataProfileService.currentProfile.extensionsResource;
        return applicationScoped || this.uriIdentityService.extUri.isEqual(this.userDataProfileService.currentProfile.extensionsResource, profileLocation);
    }
    async getTargetPlatform() {
        return "web" /* TargetPlatform.WEB */;
    }
    async isExtensionPlatformCompatible(extension) {
        if (this.isConfiguredToExecuteOnWeb(extension)) {
            return true;
        }
        return super.isExtensionPlatformCompatible(extension);
    }
    async getInstalled(type, profileLocation) {
        const extensions = [];
        if (type === undefined || type === 0 /* ExtensionType.System */) {
            const systemExtensions = await this.webExtensionsScannerService.scanSystemExtensions();
            extensions.push(...systemExtensions);
        }
        if (type === undefined || type === 1 /* ExtensionType.User */) {
            const userExtensions = await this.webExtensionsScannerService.scanUserExtensions(profileLocation ?? this.userDataProfileService.currentProfile.extensionsResource);
            extensions.push(...userExtensions);
        }
        return extensions.map(e => toLocalExtension(e));
    }
    async install(location, options = {}) {
        this.logService.trace('ExtensionManagementService#install', location.toString());
        const manifest = await this.webExtensionsScannerService.scanExtensionManifest(location);
        if (!manifest || !manifest.name || !manifest.version) {
            throw new Error(`Cannot find a valid extension from the location ${location.toString()}`);
        }
        const result = await this.installExtensions([{ manifest, extension: location, options }]);
        if (result[0]?.local) {
            return result[0]?.local;
        }
        if (result[0]?.error) {
            throw result[0].error;
        }
        throw toExtensionManagementError(new Error(`Unknown error while installing extension ${getGalleryExtensionId(manifest.publisher, manifest.name)}`));
    }
    installFromLocation(location, profileLocation) {
        return this.install(location, { profileLocation });
    }
    async deleteExtension(extension) {
        // do nothing
    }
    async copyExtension(extension, fromProfileLocation, toProfileLocation, metadata) {
        const target = await this.webExtensionsScannerService.scanExistingExtension(extension.location, extension.type, toProfileLocation);
        const source = await this.webExtensionsScannerService.scanExistingExtension(extension.location, extension.type, fromProfileLocation);
        metadata = { ...source?.metadata, ...metadata };
        let scanned;
        if (target) {
            scanned = await this.webExtensionsScannerService.updateMetadata(extension, { ...target.metadata, ...metadata }, toProfileLocation);
        }
        else {
            scanned = await this.webExtensionsScannerService.addExtension(extension.location, metadata, toProfileLocation);
        }
        return toLocalExtension(scanned);
    }
    async moveExtension(extension, fromProfileLocation, toProfileLocation, metadata) {
        const target = await this.webExtensionsScannerService.scanExistingExtension(extension.location, extension.type, toProfileLocation);
        const source = await this.webExtensionsScannerService.scanExistingExtension(extension.location, extension.type, fromProfileLocation);
        metadata = { ...source?.metadata, ...metadata };
        let scanned;
        if (target) {
            scanned = await this.webExtensionsScannerService.updateMetadata(extension, { ...target.metadata, ...metadata }, toProfileLocation);
        }
        else {
            scanned = await this.webExtensionsScannerService.addExtension(extension.location, metadata, toProfileLocation);
            if (source) {
                await this.webExtensionsScannerService.removeExtension(source, fromProfileLocation);
            }
        }
        return toLocalExtension(scanned);
    }
    async removeExtension(extension, fromProfileLocation) {
        const source = await this.webExtensionsScannerService.scanExistingExtension(extension.location, extension.type, fromProfileLocation);
        if (source) {
            await this.webExtensionsScannerService.removeExtension(source, fromProfileLocation);
        }
    }
    async installExtensionsFromProfile(extensions, fromProfileLocation, toProfileLocation) {
        const result = [];
        const extensionsToInstall = (await this.webExtensionsScannerService.scanUserExtensions(fromProfileLocation))
            .filter(e => extensions.some(id => areSameExtensions(id, e.identifier)));
        if (extensionsToInstall.length) {
            await Promise.allSettled(extensionsToInstall.map(async (e) => {
                let local = await this.installFromLocation(e.location, toProfileLocation);
                if (e.metadata) {
                    local = await this.updateMetadata(local, e.metadata, fromProfileLocation);
                }
                result.push(local);
            }));
        }
        return result;
    }
    async updateMetadata(local, metadata, profileLocation) {
        // unset if false
        if (metadata.isMachineScoped === false) {
            metadata.isMachineScoped = undefined;
        }
        if (metadata.isBuiltin === false) {
            metadata.isBuiltin = undefined;
        }
        if (metadata.pinned === false) {
            metadata.pinned = undefined;
        }
        const updatedExtension = await this.webExtensionsScannerService.updateMetadata(local, metadata, profileLocation);
        const updatedLocalExtension = toLocalExtension(updatedExtension);
        this._onDidUpdateExtensionMetadata.fire({ local: updatedLocalExtension, profileLocation });
        return updatedLocalExtension;
    }
    async copyExtensions(fromProfileLocation, toProfileLocation) {
        await this.webExtensionsScannerService.copyExtensions(fromProfileLocation, toProfileLocation, e => !e.metadata?.isApplicationScoped);
    }
    async getCompatibleVersion(extension, sameVersion, includePreRelease, productVersion) {
        const compatibleExtension = await super.getCompatibleVersion(extension, sameVersion, includePreRelease, productVersion);
        if (compatibleExtension) {
            return compatibleExtension;
        }
        if (this.isConfiguredToExecuteOnWeb(extension)) {
            return extension;
        }
        return null;
    }
    isConfiguredToExecuteOnWeb(gallery) {
        const configuredExtensionKind = this.extensionManifestPropertiesService.getUserConfiguredExtensionKind(gallery.identifier);
        return !!configuredExtensionKind && configuredExtensionKind.includes('web');
    }
    getCurrentExtensionsManifestLocation() {
        return this.userDataProfileService.currentProfile.extensionsResource;
    }
    createInstallExtensionTask(manifest, extension, options) {
        return new InstallExtensionTask(manifest, extension, options, this.webExtensionsScannerService, this.userDataProfilesService);
    }
    createUninstallExtensionTask(extension, options) {
        return new UninstallExtensionTask(extension, options, this.webExtensionsScannerService);
    }
    zip(extension) { throw new Error('unsupported'); }
    getManifest(vsix) { throw new Error('unsupported'); }
    download() { throw new Error('unsupported'); }
    async cleanUp() { }
    async whenProfileChanged(e) {
        const previousProfileLocation = e.previous.extensionsResource;
        const currentProfileLocation = e.profile.extensionsResource;
        if (!previousProfileLocation || !currentProfileLocation) {
            throw new Error('This should not happen');
        }
        const oldExtensions = await this.webExtensionsScannerService.scanUserExtensions(previousProfileLocation);
        const newExtensions = await this.webExtensionsScannerService.scanUserExtensions(currentProfileLocation);
        const { added, removed } = delta(oldExtensions, newExtensions, (a, b) => compare(`${ExtensionIdentifier.toKey(a.identifier.id)}@${a.manifest.version}`, `${ExtensionIdentifier.toKey(b.identifier.id)}@${b.manifest.version}`));
        this._onDidChangeProfile.fire({ added: added.map(e => toLocalExtension(e)), removed: removed.map(e => toLocalExtension(e)) });
    }
};
WebExtensionManagementService = __decorate([
    __param(0, IExtensionGalleryService),
    __param(1, ITelemetryService),
    __param(2, ILogService),
    __param(3, IWebExtensionsScannerService),
    __param(4, IExtensionManifestPropertiesService),
    __param(5, IUserDataProfileService),
    __param(6, IProductService),
    __param(7, IAllowedExtensionsService),
    __param(8, IUserDataProfilesService),
    __param(9, IUriIdentityService)
], WebExtensionManagementService);
export { WebExtensionManagementService };
function toLocalExtension(extension) {
    const metadata = getMetadata(undefined, extension);
    return {
        ...extension,
        identifier: { id: extension.identifier.id, uuid: metadata.id ?? extension.identifier.uuid },
        isMachineScoped: !!metadata.isMachineScoped,
        isApplicationScoped: !!metadata.isApplicationScoped,
        publisherId: metadata.publisherId || null,
        publisherDisplayName: metadata.publisherDisplayName,
        installedTimestamp: metadata.installedTimestamp,
        isPreReleaseVersion: !!metadata.isPreReleaseVersion,
        hasPreReleaseVersion: !!metadata.hasPreReleaseVersion,
        preRelease: extension.preRelease,
        targetPlatform: "web" /* TargetPlatform.WEB */,
        updated: !!metadata.updated,
        pinned: !!metadata?.pinned,
        private: !!metadata.private,
        isWorkspaceScoped: false,
        source: metadata?.source ?? (extension.identifier.uuid ? 'gallery' : 'resource'),
        size: metadata.size ?? 0,
    };
}
function getMetadata(options, existingExtension) {
    const metadata = { ...(existingExtension?.metadata || {}) };
    metadata.isMachineScoped = options?.isMachineScoped || metadata.isMachineScoped;
    return metadata;
}
class InstallExtensionTask extends AbstractExtensionTask {
    get profileLocation() { return this._profileLocation; }
    get operation() { return isUndefined(this.options.operation) ? this._operation : this.options.operation; }
    constructor(manifest, extension, options, webExtensionsScannerService, userDataProfilesService) {
        super();
        this.manifest = manifest;
        this.extension = extension;
        this.options = options;
        this.webExtensionsScannerService = webExtensionsScannerService;
        this.userDataProfilesService = userDataProfilesService;
        this._operation = 2 /* InstallOperation.Install */;
        this._profileLocation = options.profileLocation;
        this.identifier = URI.isUri(extension) ? { id: getGalleryExtensionId(manifest.publisher, manifest.name) } : extension.identifier;
        this.source = extension;
    }
    async doRun(token) {
        const userExtensions = await this.webExtensionsScannerService.scanUserExtensions(this.options.profileLocation);
        const existingExtension = userExtensions.find(e => areSameExtensions(e.identifier, this.identifier));
        if (existingExtension) {
            this._operation = 3 /* InstallOperation.Update */;
        }
        const metadata = getMetadata(this.options, existingExtension);
        if (!URI.isUri(this.extension)) {
            metadata.id = this.extension.identifier.uuid;
            metadata.publisherDisplayName = this.extension.publisherDisplayName;
            metadata.publisherId = this.extension.publisherId;
            metadata.installedTimestamp = Date.now();
            metadata.isPreReleaseVersion = this.extension.properties.isPreReleaseVersion;
            metadata.hasPreReleaseVersion = metadata.hasPreReleaseVersion || this.extension.properties.isPreReleaseVersion;
            metadata.isBuiltin = this.options.isBuiltin || existingExtension?.isBuiltin;
            metadata.isSystem = existingExtension?.type === 0 /* ExtensionType.System */ ? true : undefined;
            metadata.updated = !!existingExtension;
            metadata.isApplicationScoped = this.options.isApplicationScoped || metadata.isApplicationScoped;
            metadata.private = this.extension.private;
            metadata.preRelease = isBoolean(this.options.preRelease)
                ? this.options.preRelease
                : this.options.installPreReleaseVersion || this.extension.properties.isPreReleaseVersion || metadata.preRelease;
            metadata.source = URI.isUri(this.extension) ? 'resource' : 'gallery';
        }
        metadata.pinned = this.options.installGivenVersion ? true : (this.options.pinned ?? metadata.pinned);
        this._profileLocation = metadata.isApplicationScoped ? this.userDataProfilesService.defaultProfile.extensionsResource : this.options.profileLocation;
        const scannedExtension = URI.isUri(this.extension) ? await this.webExtensionsScannerService.addExtension(this.extension, metadata, this.profileLocation)
            : await this.webExtensionsScannerService.addExtensionFromGallery(this.extension, metadata, this.profileLocation);
        return toLocalExtension(scannedExtension);
    }
}
class UninstallExtensionTask extends AbstractExtensionTask {
    constructor(extension, options, webExtensionsScannerService) {
        super();
        this.extension = extension;
        this.options = options;
        this.webExtensionsScannerService = webExtensionsScannerService;
    }
    doRun(token) {
        return this.webExtensionsScannerService.removeExtension(this.extension, this.options.profileLocation);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2ViRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vd2ViRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLG1CQUFtQixFQUF1RixNQUFNLHNEQUFzRCxDQUFDO0FBQ2hMLE9BQU8sRUFBd0Qsd0JBQXdCLEVBQTZDLHlCQUF5QixFQUFFLE1BQU0sd0VBQXdFLENBQUM7QUFDOU8sT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLHFCQUFxQixFQUFFLE1BQU0sNEVBQTRFLENBQUM7QUFDdEksT0FBTyxFQUE4RCw0QkFBNEIsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3BJLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUVyRSxPQUFPLEVBQUUsa0NBQWtDLEVBQUUscUJBQXFCLEVBQStFLDBCQUEwQixFQUFpQyxNQUFNLHVGQUF1RixDQUFDO0FBQzFTLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxtQ0FBbUMsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3BILE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUN4RixPQUFPLEVBQUUsU0FBUyxFQUFFLFdBQVcsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzFFLE9BQU8sRUFBaUMsdUJBQXVCLEVBQUUsTUFBTSxpREFBaUQsQ0FB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