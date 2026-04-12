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
import { Queue } from '../../../base/common/async.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Emitter } from '../../../base/common/event.js';
import { ResourceMap } from '../../../base/common/map.js';
import { URI } from '../../../base/common/uri.js';
import { isIExtensionIdentifier } from './extensionManagement.js';
import { areSameExtensions } from './extensionManagementUtil.js';
import { IFileService, toFileOperationResult } from '../../files/common/files.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { IUserDataProfilesService } from '../../userDataProfile/common/userDataProfile.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';
import { isObject, isString, isUndefined } from '../../../base/common/types.js';
import { getErrorMessage } from '../../../base/common/errors.js';
export var ExtensionsProfileScanningErrorCode;
(function (ExtensionsProfileScanningErrorCode) {
    /**
     * Error when trying to scan extensions from a profile that does not exist.
     */
    ExtensionsProfileScanningErrorCode["ERROR_PROFILE_NOT_FOUND"] = "ERROR_PROFILE_NOT_FOUND";
    /**
     * Error when profile file is invalid.
     */
    ExtensionsProfileScanningErrorCode["ERROR_INVALID_CONTENT"] = "ERROR_INVALID_CONTENT";
})(ExtensionsProfileScanningErrorCode || (ExtensionsProfileScanningErrorCode = {}));
export class ExtensionsProfileScanningError extends Error {
    constructor(message, code) {
        super(message);
        this.code = code;
    }
}
export const IExtensionsProfileScannerService = createDecorator('IExtensionsProfileScannerService');
let AbstractExtensionsProfileScannerService = class AbstractExtensionsProfileScannerService extends Disposable {
    constructor(extensionsLocation, fileService, userDataProfilesService, uriIdentityService, logService) {
        super();
        this.extensionsLocation = extensionsLocation;
        this.fileService = fileService;
        this.userDataProfilesService = userDataProfilesService;
        this.uriIdentityService = uriIdentityService;
        this.logService = logService;
        this._onAddExtensions = this._register(new Emitter());
        this.onAddExtensions = this._onAddExtensions.event;
        this._onDidAddExtensions = this._register(new Emitter());
        this.onDidAddExtensions = this._onDidAddExtensions.event;
        this._onRemoveExtensions = this._register(new Emitter());
        this.onRemoveExtensions = this._onRemoveExtensions.event;
        this._onDidRemoveExtensions = this._register(new Emitter());
        this.onDidRemoveExtensions = this._onDidRemoveExtensions.event;
        this.resourcesAccessQueueMap = new ResourceMap();
    }
    scanProfileExtensions(profileLocation, options) {
        return this.withProfileExtensions(profileLocation, undefined, options);
    }
    async addExtensionsToProfile(extensions, profileLocation, keepExistingVersions) {
        const extensionsToRemove = [];
        const extensionsToAdd = [];
        try {
            await this.withProfileExtensions(profileLocation, existingExtensions => {
                const result = [];
                if (keepExistingVersions) {
                    result.push(...existingExtensions);
                }
                else {
                    for (const existing of existingExtensions) {
                        if (extensions.some(([e]) => areSameExtensions(e.identifier, existing.identifier) && e.manifest.version !== existing.version)) {
                            // Remove the existing extension with different version
                            extensionsToRemove.push(existing);
                        }
                        else {
                            result.push(existing);
                        }
                    }
                }
                for (const [extension, metadata] of extensions) {
                    const index = result.findIndex(e => areSameExtensions(e.identifier, extension.identifier) && e.version === extension.manifest.version);
                    const extensionToAdd = { identifier: extension.identifier, version: extension.manifest.version, location: extension.location, metadata };
                    if (index === -1) {
                        extensionsToAdd.push(extensionToAdd);
                        result.push(extensionToAdd);
                    }
                    else {
                        result.splice(index, 1, extensionToAdd);
                    }
                }
                if (extensionsToAdd.length) {
                    this._onAddExtensions.fire({ extensions: extensionsToAdd, profileLocation });
                }
                if (extensionsToRemove.length) {
                    this._onRemoveExtensions.fire({ extensions: extensionsToRemove, profileLocation });
                }
                return result;
            });
            if (extensionsToAdd.length) {
                this._onDidAddExtensions.fire({ extensions: extensionsToAdd, profileLocation });
            }
            if (extensionsToRemove.length) {
                this._onDidRemoveExtensions.fire({ extensions: extensionsToRemove, profileLocation });
            }
            return extensionsToAdd;
        }
        catch (error) {
            if (extensionsToAdd.length) {
                this._onDidAddExtensions.fire({ extensions: extensionsToAdd, error, profileLocation });
            }
            if (extensionsToRemove.length) {
                this._onDidRemoveExtensions.fire({ extensions: extensionsToRemove, error, profileLocation });
            }
            throw error;
        }
    }
    async updateMetadata(extensions, profileLocation) {
        const updatedExtensions = [];
        await this.withProfileExtensions(profileLocation, profileExtensions => {
            const result = [];
            for (const profileExtension of profileExtensions) {
                const extension = extensions.find(([e]) => areSameExtensions({ id: e.identifier.id }, { id: profileExtension.identifier.id }) && e.manifest.version === profileExtension.version);
                if (extension) {
                    profileExtension.metadata = { ...profileExtension.metadata, ...extension[1] };
                    updatedExtensions.push(profileExtension);
                    result.push(profileExtension);
                }
                else {
                    result.push(profileExtension);
                }
            }
            return result;
        });
        return updatedExtensions;
    }
    async removeExtensionsFromProfile(extensions, profileLocation) {
        const extensionsToRemove = [];
        try {
            await this.withProfileExtensions(profileLocation, profileExtensions => {
                const result = [];
                for (const e of profileExtensions) {
                    if (extensions.some(extension => areSameExtensions(e.identifier, extension))) {
                        extensionsToRemove.push(e);
                    }
                    else {
                        result.push(e);
                    }
                }
                if (extensionsToRemove.length) {
                    this._onRemoveExtensions.fire({ extensions: extensionsToRemove, profileLocation });
                }
                return result;
            });
            if (extensionsToRemove.length) {
                this._onDidRemoveExtensions.fire({ extensions: extensionsToRemove, profileLocation });
            }
        }
        catch (error) {
            if (extensionsToRemove.length) {
                this._onDidRemoveExtensions.fire({ extensions: extensionsToRemove, error, profileLocation });
            }
            throw error;
        }
    }
    async withProfileExtensions(file, updateFn, options) {
        return this.getResourceAccessQueue(file).queue(async () => {
            let extensions = [];
            // Read
            let storedProfileExtensions;
            try {
                const content = await this.fileService.readFile(file);
                storedProfileExtensions = JSON.parse(content.value.toString().trim() || '[]');
            }
            catch (error) {
                if (toFileOperationResult(error) !== 1 /* FileOperationResult.FILE_NOT_FOUND */) {
                    throw error;
                }
                // migrate from old location, remove this after couple of releases
                if (this.uriIdentityService.extUri.isEqual(file, this.userDataProfilesService.defaultProfile.extensionsResource)) {
                    storedProfileExtensions = await this.migrateFromOldDefaultProfileExtensionsLocation();
                }
                if (!storedProfileExtensions && options?.bailOutWhenFileNotFound) {
                    throw new ExtensionsProfileScanningError(getErrorMessage(error), "ERROR_PROFILE_NOT_FOUND" /* ExtensionsProfileScanningErrorCode.ERROR_PROFILE_NOT_FOUND */);
                }
            }
            if (storedProfileExtensions) {
                if (!Array.isArray(storedProfileExtensions)) {
                    this.throwInvalidConentError(file);
                }
                // TODO @sandy081: Remove this migration after couple of releases
                let migrate = false;
                for (const e of storedProfileExtensions) {
                    if (!isStoredProfileExtension(e)) {
                        this.throwInvalidConentError(file);
                    }
                    let location;
                    if (isString(e.relativeLocation) && e.relativeLocation) {
                        // Extension in new format. No migration needed.
                        location = this.resolveExtensionLocation(e.relativeLocation);
                    }
                    else if (isString(e.location)) {
                        this.logService.warn(`Extensions profile: Ignoring extension with invalid location: ${e.location}`);
                        continue;
                    }
                    else {
                        location = URI.revive(e.location);
                        const relativePath = this.toRelativePath(location);
                        if (relativePath) {
                            // Extension in old format. Migrate to new format.
                            migrate = true;
                            e.relativeLocation = relativePath;
                        }
                    }
                    if (isUndefined(e.metadata?.hasPreReleaseVersion) && e.metadata?.preRelease) {
                        migrate = true;
                        e.metadata.hasPreReleaseVersion = true;
                    }
                    const uuid = e.metadata?.id ?? e.identifier.uuid;
                    extensions.push({
                        identifier: uuid ? { id: e.identifier.id, uuid } : { id: e.identifier.id },
                        location,
                        version: e.version,
                        metadata: e.metadata,
                    });
                }
                if (migrate) {
                    await this.fileService.writeFile(file, VSBuffer.fromString(JSON.stringify(storedProfileExtensions)));
                }
            }
            // Update
            if (updateFn) {
                extensions = updateFn(extensions);
                const storedProfileExtensions = extensions.map(e => ({
                    identifier: e.identifier,
                    version: e.version,
                    // retain old format so that old clients can read it
                    location: e.location.toJSON(),
                    relativeLocation: this.toRelativePath(e.location),
                    metadata: e.metadata
                }));
                await this.fileService.writeFile(file, VSBuffer.fromString(JSON.stringify(storedProfileExtensions)));
            }
            return extensions;
        });
    }
    throwInvalidConentError(file) {
        throw new ExtensionsProfileScanningError(`Invalid extensions content in ${file.toString()}`, "ERROR_INVALID_CONTENT" /* ExtensionsProfileScanningErrorCode.ERROR_INVALID_CONTENT */);
    }
    toRelativePath(extensionLocation) {
        return this.uriIdentityService.extUri.isEqual(this.uriIdentityService.extUri.dirname(extensionLocation), this.extensionsLocation)
            ? this.uriIdentityService.extUri.basename(extensionLocation)
            : undefined;
    }
    resolveExtensionLocation(path) {
        return this.uriIdentityService.extUri.joinPath(this.extensionsLocation, path);
    }
    async migrateFromOldDefaultProfileExtensionsLocation() {
        if (!this._migrationPromise) {
            this._migrationPromise = (async () => {
                const oldDefaultProfileExtensionsLocation = this.uriIdentityService.extUri.joinPath(this.userDataProfilesService.defaultProfile.location, 'extensions.json');
                const oldDefaultProfileExtensionsInitLocation = this.uriIdentityService.extUri.joinPath(this.extensionsLocation, '.init-default-profile-extensions');
                let content;
                try {
                    content = (await this.fileService.readFile(oldDefaultProfileExtensionsLocation)).value.toString();
                }
                catch (error) {
                    if (toFileOperationResult(error) === 1 /* FileOperationResult.FILE_NOT_FOUND */) {
                        return undefined;
                    }
                    throw error;
                }
                this.logService.info('Migrating extensions from old default profile location', oldDefaultProfileExtensionsLocation.toString());
                let storedProfileExtensions;
                try {
                    const parsedData = JSON.parse(content);
                    if (Array.isArray(parsedData) && parsedData.every(candidate => isStoredProfileExtension(candidate))) {
                        storedProfileExtensions = parsedData;
                    }
                    else {
                        this.logService.warn('Skipping migrating from old default profile locaiton: Found invalid data', parsedData);
                    }
                }
                catch (error) {
                    /* Ignore */
                    this.logService.error(error);
                }
                if (storedProfileExtensions) {
                    try {
                        await this.fileService.createFile(this.userDataProfilesService.defaultProfile.extensionsResource, VSBuffer.fromString(JSON.stringify(storedProfileExtensions)), { overwrite: false });
                        this.logService.info('Migrated extensions from old default profile location to new location', oldDefaultProfileExtensionsLocation.toString(), this.userDataProfilesService.defaultProfile.extensionsResource.toString());
                    }
                    catch (error) {
                        if (toFileOperationResult(error) === 3 /* FileOperationResult.FILE_MODIFIED_SINCE */) {
                            this.logService.info('Migration from old default profile location to new location is done by another window', oldDefaultProfileExtensionsLocation.toString(), this.userDataProfilesService.defaultProfile.extensionsResource.toString());
                        }
                        else {
                            throw error;
                        }
                    }
                }
                try {
                    await this.fileService.del(oldDefaultProfileExtensionsLocation);
                }
                catch (error) {
                    if (toFileOperationResult(error) !== 1 /* FileOperationResult.FILE_NOT_FOUND */) {
                        this.logService.error(error);
                    }
                }
                try {
                    await this.fileService.del(oldDefaultProfileExtensionsInitLocation);
                }
                catch (error) {
                    if (toFileOperationResult(error) !== 1 /* FileOperationResult.FILE_NOT_FOUND */) {
                        this.logService.error(error);
                    }
                }
                return storedProfileExtensions;
            })();
        }
        return this._migrationPromise;
    }
    getResourceAccessQueue(file) {
        let resourceQueue = this.resourcesAccessQueueMap.get(file);
        if (!resourceQueue) {
            resourceQueue = new Queue();
            this.resourcesAccessQueueMap.set(file, resourceQueue);
        }
        return resourceQueue;
    }
};
AbstractExtensionsProfileScannerService = __decorate([
    __param(1, IFileService),
    __param(2, IUserDataProfilesService),
    __param(3, IUriIdentityService),
    __param(4, ILogService)
], AbstractExtensionsProfileScannerService);
export { AbstractExtensionsProfileScannerService };
function isStoredProfileExtension(obj) {
    const candidate = obj;
    return isObject(candidate)
        && isIExtensionIdentifier(candidate.identifier)
        && (isUriComponents(candidate.location) || (isString(candidate.location) && !!candidate.location))
        && (isUndefined(candidate.relativeLocation) || isString(candidate.relativeLocation))
        && !!candidate.version
        && isString(candidate.version);
}
function isUriComponents(obj) {
    if (!obj) {
        return false;
    }
    const thing = obj;
    return typeof thing?.path === 'string' &&
        typeof thing?.scheme === 'string';
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmVyU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbnNQcm9maWxlU2Nhbm5lclNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3RELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDL0QsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLCtCQUErQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUMxRCxPQUFPLEVBQUUsR0FBRyxFQUFpQixNQUFNLDZCQUE2QixDQUFDO0FBQ2pFLE9BQU8sRUFBWSxzQkFBc0IsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQzVFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBRWpFLE9BQU8sRUFBdUIsWUFBWSxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDdkcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUN0RCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUMzRixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM5RSxPQUFPLEVBQVcsUUFBUSxFQUFFLFFBQVEsRUFBRSxXQUFXLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN6RixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFVakUsTUFBTSxDQUFOLElBQWtCLGtDQVlqQjtBQVpELFdBQWtCLGtDQUFrQztJQUVuRDs7T0FFRztJQUNILHlGQUFtRCxDQUFBO0lBRW5EOztPQUVHO0lBQ0gscUZBQStDLENBQUE7QUFFaEQsQ0FBQyxFQVppQixrQ0FBa0MsS0FBbEMsa0NBQWtDLFFBWW5EO0FBRUQsTUFBTSxPQUFPLDhCQUErQixTQUFRLEtBQUs7SUFDeEQsWUFBWSxPQUFlLEVBQVMsSUFBd0M7UUFDM0UsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBRG9CLFNBQUksR0FBSixJQUFJLENBQW9DO0lBRTVFLENBQUM7Q0FDRDtBQTBCRCxNQUFNLENBQUMsTUFBTSxnQ0FBZ0MsR0FBRyxlQUFlLENBQW1DLGtDQUFrQyxDQUFDLENBQUM7QUFlL0gsSUFBZSx1Q0FBdUMsR0FBdEQsTUFBZSx1Q0FBd0MsU0FBUSxVQUFVO0lBaUIvRSxZQUNrQixrQkFBdUIsRUFDMUIsV0FBMEMsRUFDOUIsdUJBQWtFLEVBQ3ZFLGtCQUF3RCxFQUNoRSxVQUF3QztRQUVyRCxLQUFLLEVBQUUsQ0FBQztRQU5TLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBSztRQUNULGdCQUFXLEdBQVgsV0FBVyxDQUFjO1FBQ2IsNEJBQXVCLEdBQXZCLHVCQUF1QixDQUEwQjtRQUN0RCx1QkFBa0IsR0FBbEIsa0JBQWtCLENBQXFCO1FBQy9DLGVBQVUsR0FBVixVQUFVLENBQWE7UUFuQnJDLHFCQUFnQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQTBCLENBQUMsQ0FBQztRQUNqRixvQkFBZSxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLENBQUM7UUFFdEMsd0JBQW1CLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBZ0MsQ0FBQyxDQUFDO1FBQzFGLHVCQUFrQixHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxLQUFLLENBQUM7UUFFNUMsd0JBQW1CLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBMEIsQ0FBQyxDQUFDO1FBQ3BGLHVCQUFrQixHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxLQUFLLENBQUM7UUFFNUMsMkJBQXNCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBbUMsQ0FBQyxDQUFDO1FBQ2hHLDBCQUFxQixHQUFHLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxLQUFLLENBQUM7UUFFbEQsNEJBQXVCLEdBQUcsSUFBSSxXQUFXLEVBQXFDLENBQUM7SUFVaEcsQ0FBQztJQUVELHFCQUFxQixDQUFDLGVBQW9CLEVBQUUsT0FBdUM7UUFDbEYsT0FBTyxJQUFJLENBQUMscUJBQXFCLENBQUMsZUFBZSxFQUFFLFNBQVMsRUFBRSxPQUFPLENBQUMsQ0FBQztJQUN4RSxDQUFDO0lBRUQsS0FBSyxDQUFDLHNCQUFzQixDQUFDLFVBQWdELEVBQUUsZUFBb0IsRUFBRSxvQkFBOEI7UUFDbEksTUFBTSxrQkFBa0IsR0FBK0IsRUFBRSxDQUFDO1FBQzFELE1BQU0sZUFBZSxHQUErQixFQUFFLENBQUM7UUFDdkQsSUFBSSxDQUFDO1lBQ0osTUFBTSxJQUFJLENBQUMscUJBQXFCLENBQUMsZUFBZSxFQUFFLGtCQUFrQixDQUFDLEVBQUU7Z0JBQ3RFLE1BQU0sTUFBTSxHQUErQixFQUFFLENBQUM7Z0JBQzlDLElBQUksb0JBQW9CLEVBQUUsQ0FBQztvQkFDMUIsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLGtCQUFrQixDQUFDLENBQUM7Z0JBQ3BDLENBQUM7cUJBQU0sQ0FBQztvQkFDUCxLQUFLLE1BQU0sUUFBUSxJQUFJLGtCQUFrQixFQUFFLENBQUM7d0JBQzNDLElBQUksVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxVQUFVLEVBQUUsUUFBUSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxRQUFRLENBQUMsT0FBTyxLQUFLLFFBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDOzRCQUMvSCx1REFBdUQ7NEJBQ3ZELGtCQUFrQixDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQzt3QkFDbkMsQ0FBQzs2QkFBTSxDQUFDOzRCQUNQLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7d0JBQ3ZCLENBQUM7b0JBQ0YsQ0FBQztnQkFDRixDQUFDO2dCQUNELEtBQUssTUFBTSxDQUFDLFNBQVMsRUFBRSxRQUFRLENBQUMsSUFBSSxVQUFVLEVBQUUsQ0FBQztvQkFDaEQsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxVQUFVLEVBQUUsU0FBUyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxPQUFPLEtBQUssU0FBUyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQztvQkFDdkksTUFBTSxjQUFjLEdBQUcsRUFBRSxVQUFVLEVBQUUsU0FBUyxDQUFDLFVBQVUsRUFBRSxPQUFPLEVBQUUsU0FBUyxDQUFDLFFBQVEsQ0FBQyxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsQ0FBQyxRQUFRLEVBQUUsUUFBUSxFQUFFLENBQUM7b0JBQ3pJLElBQUksS0FBSyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUM7d0JBQ2xCLGVBQWUsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUM7d0JBQ3JDLE1BQU0sQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUM7b0JBQzdCLENBQUM7eUJBQU0sQ0FBQzt3QkFDUCxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxDQUFDLEVBQUUsY0FBYyxDQUFDLENBQUM7b0JBQ3pDLENBQUM7Z0JBQ0YsQ0FBQztnQkFDRCxJQUFJLGVBQWUsQ0FBQyxNQUFNLEVBQUUsQ0FBQztvQkFDNUIsSUFBSSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsZUFBZSxFQUFFLENBQUMsQ0FBQztnQkFDOUUsQ0FBQztnQkFDRCxJQUFJLGtCQUFrQixDQUFDLE1BQU0sRUFBRSxDQUFDO29CQUMvQixJQUFJLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLEVBQUUsVUFBVSxFQUFFLGtCQUFrQixFQUFFLGVBQWUsRUFBRSxDQUFDLENBQUM7Z0JBQ3BGLENBQUM7Z0JBQ0QsT0FBTyxNQUFNLENBQUM7WUFDZixDQUFDLENBQUMsQ0FBQztZQUNILElBQUksZUFBZSxDQUFDLE1BQU0sRUFBRSxDQUFDO2dCQUM1QixJQUFJLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxlQUFlLEVBQUUsQ0FBQyxDQUFDO1lBQ2pGLENBQUM7WUFDRCxJQUFJLGtCQUFrQixDQUFDLE1BQU0sRUFBRSxDQUFDO2dCQUMvQixJQUFJLENBQUMsc0JBQXNCLENBQUMsSUFBSSxDQUFDLEVBQUUsVUFBVSxFQUFFLGtCQUFrQixFQUFFLGVBQWUsRUFBRSxDQUFDLENBQUM7WUFDdkYsQ0FBQztZQUNELE9BQU8sZUFBZSxDQUFDO1FBQ3hCLENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2hCLElBQUksZUFBZSxDQUFDLE1BQU0sRUFBRSxDQUFDO2dCQUM1QixJQUFJLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxLQUFLLEVBQUUsZUFBZSxFQUFFLENBQUMsQ0FBQztZQUN4RixDQUFDO1lBQ0QsSUFBSSxrQkFBa0IsQ0FBQyxNQUFNLEVBQUUsQ0FBQztnQkFDL0IsSUFBSSxDQUFDLHNCQUFzQixDQUFDLElBQUksQ0FBQyxFQUFFLFVBQVUsRUFBRSxrQkFBa0IsRUFBRSxLQUFLLEVBQUUsZUFBZSxFQUFFLENBQUMsQ0FBQztZQUM5RixDQUFDO1lBQ0QsTUFBTSxLQUFLLENBQUM7UUFDYixDQUFDO0lBQ0YsQ0FBQztJQUVELEtBQUssQ0FBQyxjQUFjLENBQUMsVUFBb0MsRUFBRSxlQUFvQjtRQUM5RSxNQUFNLGlCQUFpQixHQUErQixFQUFFLENBQUM7UUFDekQsTUFBTSxJQUFJLENBQUMscUJBQXFCLENBQUMsZUFBZSxFQUFFLGlCQUFpQixDQUFDLEVBQUU7WUFDckUsTUFBTSxNQUFNLEdBQStCLEVBQUUsQ0FBQztZQUM5QyxLQUFLLE1BQU0sZ0JBQWdCLElBQUksaUJBQWlCLEVBQUUsQ0FBQztnQkFDbEQsTUFBTSxTQUFTLEdBQUcsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLGlCQUFpQixDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxVQUFVLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsZ0JBQWdCLENBQUMsVUFBVSxDQUFDLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLFFBQVEsQ0FBQyxPQUFPLEtBQUssZ0JBQWdCLENBQUMsT0FBTyxDQUFDLENBQUM7Z0JBQ2xMLElBQUksU0FBUyxFQUFFLENBQUM7b0JBQ2YsZ0JBQWdCLENBQUMsUUFBUSxHQUFHLEVBQUUsR0FBRyxnQkFBZ0IsQ0FBQyxRQUFRLEVBQUUsR0FBRyxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztvQkFDOUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLENBQUM7b0JBQ3pDLE1BQU0sQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztnQkFDL0IsQ0FBQztxQkFBTSxDQUFDO29CQUNQLE1BQU0sQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztnQkFDL0IsQ0FBQztZQUNGLENBQUM7WUFDRCxPQUFPLE1BQU0sQ0FBQztRQUNmLENBQUMsQ0FBQyxDQUFDO1FBQ0gsT0FBTyxpQkFBaUIsQ0FBQztJQUMxQixDQUFDO0lBRUQsS0FBSyxDQUFDLDJCQUEyQixDQUFDLFVBQWtDLEVBQUUsZUFBb0I7UUFDekYsTUFBTSxrQkFBa0IsR0FBK0IsRUFBRSxDQUFDO1FBQzFELElBQUksQ0FBQztZQUNKLE1BQU0sSUFBSSxDQUFDLHFCQUFxQixDQUFDLGVBQWUsRUFBRSxpQkFBaUIsQ0FBQyxFQUFFO2dCQUNyRSxNQUFNLE1BQU0sR0FBK0IsRUFBRSxDQUFDO2dCQUM5QyxLQUFLLE1BQU0sQ0FBQyxJQUFJLGlCQUFpQixFQUFFLENBQUM7b0JBQ25DLElBQUksVUFBVSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxVQUFVLEVBQUUsU0FBUyxDQUFDLENBQUMsRUFBRSxDQUFDO3dCQUM5RSxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQzVCLENBQUM7eUJBQU0sQ0FBQzt3QkFDUCxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUNoQixDQUFDO2dCQUNGLENBQUM7Z0JBQ0QsSUFBSSxrQkFBa0IsQ0FBQyxNQUFNLEVBQUUsQ0FBQztvQkFDL0IsSUFBSSxDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxFQUFFLFVBQVUsRUFBRSxrQkFBa0IsRUFBRSxlQUFlLEVBQUUsQ0FBQyxDQUFDO2dCQUNwRixDQUFDO2dCQUNELE9BQU8sTUFBTSxDQUFDO1lBQ2YsQ0FBQyxDQUFDLENBQUM7WUFDSCxJQUFJLGtCQUFrQixDQUFDLE1BQU0sRUFBRSxDQUFDO2dCQUMvQixJQUFJLENBQUMsc0JBQXNCLENBQUMsSUFBSSxDQUFDLEVBQUUsVUFBVSxFQUFFLGtCQUFrQixFQUFFLGVBQWUsRUFBRSxDQUFDLENBQUM7WUFDdkYsQ0FBQztRQUNGLENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2hCLElBQUksa0JBQWtCLENBQUMsTUFBTSxFQUFFLENBQUM7Z0JBQy9CLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxJQUFJLENBQUMsRUFBRSxVQUFVLEVBQUUsa0JBQWtCLEVBQUUsS0FBSyxFQUFFLGVBQWUsRUFBRSxDQUFDLENBQUM7WUFDOUYsQ0FBQztZQUNELE1BQU0sS0FBSyxDQUFDO1FBQ2IsQ0FBQztJQUNGLENBQUM7SUFFTyxLQUFLLENBQUMscUJBQXFCLENBQUMsSUFBUyxFQUFFLFFBQTBGLEVBQUUsT0FBdUM7UUFDakwsT0FBTyxJQUFJLENBQUMsc0JBQXNCLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLEtBQUssSUFBSSxFQUFFO1lBQ3pELElBQUksVUFBVSxHQUErQixFQUFFLENBQUM7WUFFaEQsT0FBTztZQUNQLElBQUksdUJBQThELENBQUM7WUFDbkUsSUFBSSxDQUFDO2dCQUNKLE1BQU0sT0FBTyxHQUFHLE1BQU0sSUFBSSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ3RELHVCQUF1QixHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsQ0FBQyxJQUFJLEVBQUUsSUFBSSxJQUFJLENBQUMsQ0FBQztZQUMvRSxDQUFDO1lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztnQkFDaEIsSUFBSSxxQkFBcUIsQ0FBQyxLQUFLLENBQUMsK0NBQXVDLEVBQUUsQ0FBQztvQkFDekUsTUFBTSxLQUFLLENBQUM7Z0JBQ2IsQ0FBQztnQkFDRCxrRUFBa0U7Z0JBQ2xFLElBQUksSUFBSSxDQUFDLGtCQUFrQixDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxjQUFjLENBQUMsa0JBQWtCLENBQUMsRUFBRSxDQUFDO29CQUNsSCx1QkFBdUIsR0FBRyxNQUFNLElBQUksQ0FBQyw4Q0FBOEMsRUFBRSxDQUFDO2dCQUN2RixDQUFDO2dCQUNELElBQUksQ0FBQyx1QkFBdUIsSUFBSSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsQ0FBQztvQkFDbEUsTUFBTSxJQUFJLDhCQUE4QixDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsNkZBQTZELENBQUM7Z0JBQzlILENBQUM7WUFDRixDQUFDO1lBQ0QsSUFBSSx1QkFBdUIsRUFBRSxDQUFDO2dCQUM3QixJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyx1QkFBdUIsQ0FBQyxFQUFFLENBQUM7b0JBQzdDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDcEMsQ0FBQztnQkFDRCxpRUFBaUU7Z0JBQ2pFLElBQUksT0FBTyxHQUFHLEtBQUssQ0FBQztnQkFDcEIsS0FBSyxNQUFNLENBQUMsSUFBSSx1QkFBdUIsRUFBRSxDQUFDO29CQUN6QyxJQUFJLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQzt3QkFDbEMsSUFBSSxDQUFDLHVCQUF1QixDQUFDLElBQUksQ0FBQyxDQUFDO29CQUNwQyxDQUFDO29CQUNELElBQUksUUFBYSxDQUFDO29CQUNsQixJQUFJLFFBQVEsQ0FBQyxDQUFDLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQzt3QkFDeEQsZ0RBQWdEO3dCQUNoRCxRQUFRLEdBQUcsSUFBSSxDQUFDLHdCQUF3QixDQUFDLENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO29CQUM5RCxDQUFDO3lCQUFNLElBQUksUUFBUSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO3dCQUNqQyxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxpRUFBaUUsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7d0JBQ3BHLFNBQVM7b0JBQ1YsQ0FBQzt5QkFBTSxDQUFDO3dCQUNQLFFBQVEsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQzt3QkFDbEMsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUMsQ0FBQzt3QkFDbkQsSUFBSSxZQUFZLEVBQUUsQ0FBQzs0QkFDbEIsa0RBQWtEOzRCQUNsRCxPQUFPLEdBQUcsSUFBSSxDQUFDOzRCQUNmLENBQUMsQ0FBQyxnQkFBZ0IsR0FBRyxZQUFZLENBQUM7d0JBQ25DLENBQUM7b0JBQ0YsQ0FBQztvQkFDRCxJQUFJLFdBQVcsQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLG9CQUFvQixDQUFDLElBQUksQ0FBQyxDQUFDLFFBQVEsRUFBRSxVQUFVLEVBQUUsQ0FBQzt3QkFDN0UsT0FBTyxHQUFHLElBQUksQ0FBQzt3QkFDZixDQUFDLENBQUMsUUFBUSxDQUFDLG9CQUFvQixHQUFHLElBQUksQ0FBQztvQkFDeEMsQ0FBQztvQkFDRCxNQUFNLElBQUksR0FBRyxDQUFDLENBQUMsUUFBUSxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQztvQkFDakQsVUFBVSxDQUFDLElBQUksQ0FBQzt3QkFDZixVQUFVLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsVUFBVSxDQUFDLEVBQUUsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxFQUFFLEVBQUU7d0JBQzFFLFFBQVE7d0JBQ1IsT0FBTyxFQUFFLENBQUMsQ0FBQyxPQUFPO3dCQUNsQixRQUFRLEVBQUUsQ0FBQyxDQUFDLFFBQVE7cUJBQ3BCLENBQUMsQ0FBQztnQkFDSixDQUFDO2dCQUNELElBQUksT0FBTyxFQUFFLENBQUM7b0JBQ2IsTUFBTSxJQUFJLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsUUFBUSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLHVCQUF1QixDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUN0RyxDQUFDO1lBQ0YsQ0FBQztZQUVELFNBQVM7WUFDVCxJQUFJLFFBQVEsRUFBRSxDQUFDO2dCQUNkLFVBQVUsR0FBRyxRQUFRLENBQUMsVUFBVSxDQUFDLENBQUM7Z0JBQ2xDLE1BQU0sdUJBQXVCLEdBQThCLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO29CQUMvRSxVQUFVLEVBQUUsQ0FBQyxDQUFDLFVBQVU7b0JBQ3hCLE9BQU8sRUFBRSxDQUFDLENBQUMsT0FBTztvQkFDbEIsb0RBQW9EO29CQUNwRCxRQUFRLEVBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUU7b0JBQzdCLGdCQUFnQixFQUFFLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQztvQkFDakQsUUFBUSxFQUFFLENBQUMsQ0FBQyxRQUFRO2lCQUNwQixDQUFDLENBQUMsQ0FBQztnQkFDSixNQUFNLElBQUksQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxRQUFRLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsdUJBQXVCLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDdEcsQ0FBQztZQUVELE9BQU8sVUFBVSxDQUFDO1FBQ25CLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVPLHVCQUF1QixDQUFDLElBQVM7UUFDeEMsTUFBTSxJQUFJLDhCQUE4QixDQUFDLGlDQUFpQyxJQUFJLENBQUMsUUFBUSxFQUFFLEVBQUUseUZBQTJELENBQUM7SUFDeEosQ0FBQztJQUVPLGNBQWMsQ0FBQyxpQkFBc0I7UUFDNUMsT0FBTyxJQUFJLENBQUMsa0JBQWtCLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxFQUFFLElBQUksQ0FBQyxrQkFBa0IsQ0FBQztZQUNoSSxDQUFDLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsaUJBQWlCLENBQUM7WUFDNUQsQ0FBQyxDQUFDLFNBQVMsQ0FBQztJQUNkLENBQUM7SUFFTyx3QkFBd0IsQ0FBQyxJQUFZO1FBQzVDLE9BQU8sSUFBSSxDQUFDLGtCQUFrQixDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLGtCQUFrQixFQUFFLElBQUksQ0FBQyxDQUFDO0lBQy9FLENBQUM7SUFHTyxLQUFLLENBQUMsOENBQThDO1FBQzNELElBQUksQ0FBQyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztZQUM3QixJQUFJLENBQUMsaUJBQWlCLEdBQUcsQ0FBQyxLQUFLLElBQUksRUFBRTtnQkFDcEMsTUFBTSxtQ0FBbUMsR0FBRyxJQUFJLENBQUMsa0JBQWtCLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsdUJBQXVCLENBQUMsY0FBYyxDQUFDLFFBQVEsRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO2dCQUM3SixNQUFNLHVDQUF1QyxHQUFHLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxrQ0FBa0MsQ0FBQyxDQUFDO2dCQUNySixJQUFJLE9BQWUsQ0FBQztnQkFDcEIsSUFBSSxDQUFDO29CQUNKLE9BQU8sR0FBRyxDQUFDLE1BQU0sSUFBSSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsbUNBQW1DLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsQ0FBQztnQkFDbkcsQ0FBQztnQkFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO29CQUNoQixJQUFJLHFCQUFxQixDQUFDLEtBQUssQ0FBQywrQ0FBdUMsRUFBRSxDQUFDO3dCQUN6RSxPQUFPLFNBQVMsQ0FBQztvQkFDbEIsQ0FBQztvQkFDRCxNQUFNLEtBQUssQ0FBQztnQkFDYixDQUFDO2dCQUVELElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLHdEQUF3RCxFQUFFLG1DQUFtQyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7Z0JBQy9ILElBQUksdUJBQThELENBQUM7Z0JBQ25FLElBQUksQ0FBQztvQkFDSixNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO29CQUN2QyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLElBQUksVUFBVSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLHdCQUF3QixDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsQ0FBQzt3QkFDckcsdUJBQXVCLEdBQUcsVUFBVSxDQUFDO29CQUN0QyxDQUFDO3lCQUFNLENBQUM7d0JBQ1AsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsMEVBQTBFLEVBQUUsVUFBVSxDQUFDLENBQUM7b0JBQzlHLENBQUM7Z0JBQ0YsQ0FBQztnQkFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO29CQUNoQixZQUFZO29CQUNaLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUM5QixDQUFDO2dCQUVELElBQUksdUJBQXVCLEVBQUUsQ0FBQztvQkFDN0IsSUFBSSxDQUFDO3dCQUNKLE1BQU0sSUFBSSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLHVCQUF1QixDQUFDLGNBQWMsQ0FBQyxrQkFBa0IsRUFBRSxRQUFRLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsdUJBQXVCLENBQUMsQ0FBQyxFQUFFLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7d0JBQ3RMLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLHVFQUF1RSxFQUFFLG1DQUFtQyxDQUFDLFFBQVEsRUFBRSxFQUFFLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxjQUFjLENBQUMsa0JBQWtCLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztvQkFDMU4sQ0FBQztvQkFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO3dCQUNoQixJQUFJLHFCQUFxQixDQUFDLEtBQUssQ0FBQyxvREFBNEMsRUFBRSxDQUFDOzRCQUM5RSxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyx1RkFBdUYsRUFBRSxtQ0FBbUMsQ0FBQyxRQUFRLEVBQUUsRUFBRSxJQUFJLENBQUMsdUJBQXVCLENBQUMsY0FBYyxDQUFDLGtCQUFrQixDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7d0JBQzFPLENBQUM7NkJBQU0sQ0FBQzs0QkFDUCxNQUFNLEtBQUssQ0FBQzt3QkFDYixDQUFDO29CQUNGLENBQUM7Z0JBQ0YsQ0FBQztnQkFFRCxJQUFJLENBQUM7b0JBQ0osTUFBTSxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxtQ0FBbUMsQ0FBQyxDQUFDO2dCQUNqRSxDQUFDO2dCQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7b0JBQ2hCLElBQUkscUJBQXFCLENBQUMsS0FBSyxDQUFDLCtDQUF1QyxFQUFFLENBQUM7d0JBQ3pFLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO29CQUM5QixDQUFDO2dCQUNGLENBQUM7Z0JBRUQsSUFBSSxDQUFDO29CQUNKLE1BQU0sSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsdUNBQXVDLENBQUMsQ0FBQztnQkFDckUsQ0FBQztnQkFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO29CQUNoQixJQUFJLHFCQUFxQixDQUFDLEtBQUssQ0FBQywrQ0FBdUMsRUFBRSxDQUFDO3dCQUN6RSxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztvQkFDOUIsQ0FBQztnQkFDRixDQUFDO2dCQUVELE9BQU8sdUJBQXVCLENBQUM7WUFDaEMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztRQUNOLENBQUM7UUFDRCxPQUFPLElBQUksQ0FBQyxpQkFBaUIsQ0FBQztJQUMvQixDQUFDO0lBRU8sc0JBQXNCLENBQUMsSUFBUztRQUN2QyxJQUFJLGFBQWEsR0FBRyxJQUFJLENBQUMsdUJBQXVCLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzNELElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztZQUNwQixhQUFhLEdBQUcsSUFBSSxLQUFLLEVBQThCLENBQUM7WUFDeEQsSUFBSSxDQUFDLHVCQUF1QixDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsYUFBYSxDQUFDLENBQUM7UUFDdkQsQ0FBQztRQUNELE9BQU8sYUFBYSxDQUFDO0lBQ3RCLENBQUM7Q0FDRCxDQUFBO0FBN1NxQix1Q0FBdUM7SUFtQjFELFdBQUEsWUFBWSxDQUFBO0lBQ1osV0FBQSx3QkFBd0IsQ0FBQTtJQUN4QixXQUFBLG1CQUFtQixDQUFBO0lBQ25CLFdBQUEsV0FBVyxDQUFBO0dBdEJRLHVDQUF1QyxDQTZTNUQ7O0FBRUQsU0FBUyx3QkFBd0IsQ0FBQyxHQUFZO0lBQzdDLE1BQU0sU0FBUyxHQUFHLEdBQTBDLENBQUM7SUFDN0QsT0FBTyxRQUFRLENBQUMsU0FBUyxDQUFDO1dBQ3RCLHNCQUFzQixDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUM7V0FDNUMsQ0FBQyxlQUFlLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1dBQy9GLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLFFBQVEsQ0FBQyxTQUFTLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztXQUNqRixDQUFDLENBQUMsU0FBUyxDQUFDLE9BQU87V0FDbkIsUUFBUSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsQ0FBQztBQUNqQyxDQUFDO0FBRUQsU0FBUyxlQUFlLENBQUMsR0FBWTtJQUNwQyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDVixPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7SUFDRCxNQUFNLEtBQUssR0FBRyxHQUFnQyxDQUFDO0lBQy9DLE9BQU8sT0FBTyxLQUFLLEVBQUUsSUFBSSxLQUFLLFFBQVE7UUFDckMsT0FBTyxLQUFLLEVBQUUsTUFBTSxLQUFLLFFBQVEsQ0FBQztBQUNwQyxDQUFDIn0=