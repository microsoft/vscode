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
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { IFileService } from '../../files/common/files.js';
import { IStorageService } from '../../storage/common/storage.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';
import { AbstractFileSynchroniser } from './abstractSynchronizer.js';
import { IUserDataSyncLocalStoreService, IUserDataSyncLogService, IUserDataSyncEnablementService, IUserDataSyncStoreService, USER_DATA_SYNC_SCHEME } from './userDataSync.js';
let AbstractJsonSynchronizer = class AbstractJsonSynchronizer extends AbstractFileSynchroniser {
    constructor(fileResource, syncResourceMetadata, collection, previewFileName, fileService, environmentService, storageService, userDataSyncStoreService, userDataSyncLocalStoreService, userDataSyncEnablementService, telemetryService, logService, configurationService, uriIdentityService) {
        super(fileResource, syncResourceMetadata, collection, fileService, environmentService, storageService, userDataSyncStoreService, userDataSyncLocalStoreService, userDataSyncEnablementService, telemetryService, logService, configurationService, uriIdentityService);
        this.version = 1;
        this.previewResource = this.extUri.joinPath(this.syncPreviewFolder, previewFileName);
        this.baseResource = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'base' });
        this.localResource = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'local' });
        this.remoteResource = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'remote' });
        this.acceptedResource = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'accepted' });
    }
    async generateSyncPreview(remoteUserData, lastSyncUserData, isRemoteDataFromCurrentMachine, userDataSyncConfiguration) {
        const remoteContent = remoteUserData.syncData ? this.getContentFromSyncContent(remoteUserData.syncData.content) : null;
        // Use remote data as last sync data if last sync data does not exist and remote data is from same machine
        lastSyncUserData = lastSyncUserData === null && isRemoteDataFromCurrentMachine ? remoteUserData : lastSyncUserData;
        const lastSyncContent = lastSyncUserData?.syncData ? this.getContentFromSyncContent(lastSyncUserData.syncData.content) : null;
        // Get file content last to get the latest
        const fileContent = await this.getLocalFileContent();
        let content = null;
        let hasLocalChanged = false;
        let hasRemoteChanged = false;
        let hasConflicts = false;
        if (remoteUserData.syncData) {
            const localContent = fileContent ? fileContent.value.toString() : null;
            if (!lastSyncContent // First time sync
                || lastSyncContent !== localContent // Local has forwarded
                || lastSyncContent !== remoteContent // Remote has forwarded
            ) {
                this.logService.trace(`${this.syncResourceLogLabel}: Merging remote ${this.syncResource.syncResource} with local ${this.syncResource.syncResource}...`);
                const result = this.merge(localContent, remoteContent, lastSyncContent);
                content = result.content;
                hasConflicts = result.hasConflicts;
                hasLocalChanged = result.hasLocalChanged;
                hasRemoteChanged = result.hasRemoteChanged;
            }
        }
        // First time syncing to remote
        else if (fileContent) {
            this.logService.trace(`${this.syncResourceLogLabel}: Remote ${this.syncResource.syncResource} does not exist. Synchronizing ${this.syncResource.syncResource} for the first time.`);
            content = fileContent.value.toString();
            hasRemoteChanged = true;
        }
        const previewResult = {
            content: hasConflicts ? lastSyncContent : content,
            localChange: hasLocalChanged ? fileContent ? 2 /* Change.Modified */ : 1 /* Change.Added */ : 0 /* Change.None */,
            remoteChange: hasRemoteChanged ? 2 /* Change.Modified */ : 0 /* Change.None */,
            hasConflicts
        };
        const localContent = fileContent ? fileContent.value.toString() : null;
        return [{
                fileContent,
                baseResource: this.baseResource,
                baseContent: lastSyncContent,
                localResource: this.localResource,
                localContent,
                localChange: previewResult.localChange,
                remoteResource: this.remoteResource,
                remoteContent,
                remoteChange: previewResult.remoteChange,
                previewResource: this.previewResource,
                previewResult,
                acceptedResource: this.acceptedResource,
            }];
    }
    async hasRemoteChanged(lastSyncUserData) {
        const lastSyncContent = lastSyncUserData?.syncData ? this.getContentFromSyncContent(lastSyncUserData.syncData.content) : null;
        if (lastSyncContent === null) {
            return true;
        }
        const fileContent = await this.getLocalFileContent();
        const localContent = fileContent ? fileContent.value.toString() : null;
        const result = this.merge(localContent, lastSyncContent, lastSyncContent);
        return result.hasLocalChanged || result.hasRemoteChanged;
    }
    async getMergeResult(resourcePreview, token) {
        return resourcePreview.previewResult;
    }
    async getAcceptResult(resourcePreview, resource, content, token) {
        /* Accept local resource */
        if (this.extUri.isEqual(resource, this.localResource)) {
            return {
                content: resourcePreview.fileContent ? resourcePreview.fileContent.value.toString() : null,
                localChange: 0 /* Change.None */,
                remoteChange: 2 /* Change.Modified */,
            };
        }
        /* Accept remote resource */
        if (this.extUri.isEqual(resource, this.remoteResource)) {
            return {
                content: resourcePreview.remoteContent,
                localChange: 2 /* Change.Modified */,
                remoteChange: 0 /* Change.None */,
            };
        }
        /* Accept preview resource */
        if (this.extUri.isEqual(resource, this.previewResource)) {
            if (content === undefined) {
                return {
                    content: resourcePreview.previewResult.content,
                    localChange: resourcePreview.previewResult.localChange,
                    remoteChange: resourcePreview.previewResult.remoteChange,
                };
            }
            else {
                return {
                    content,
                    localChange: 2 /* Change.Modified */,
                    remoteChange: 2 /* Change.Modified */,
                };
            }
        }
        throw new Error(`Invalid Resource: ${resource.toString()}`);
    }
    async applyResult(remoteUserData, lastSyncUserData, resourcePreviews, force) {
        const { fileContent } = resourcePreviews[0][0];
        const { content, localChange, remoteChange } = resourcePreviews[0][1];
        if (localChange === 0 /* Change.None */ && remoteChange === 0 /* Change.None */) {
            this.logService.info(`${this.syncResourceLogLabel}: No changes found during synchronizing ${this.syncResource.syncResource}.`);
        }
        if (localChange !== 0 /* Change.None */) {
            this.logService.trace(`${this.syncResourceLogLabel}: Updating local ${this.syncResource.syncResource}...`);
            if (fileContent) {
                await this.backupLocal(JSON.stringify(this.toSyncContent(fileContent.value.toString())));
            }
            if (content) {
                await this.updateLocalFileContent(content, fileContent, force);
            }
            else {
                await this.deleteLocalFile();
            }
            this.logService.info(`${this.syncResourceLogLabel}: Updated local ${this.syncResource.syncResource}`);
        }
        if (remoteChange !== 0 /* Change.None */) {
            this.logService.trace(`${this.syncResourceLogLabel}: Updating remote ${this.syncResource.syncResource}...`);
            const remoteContents = JSON.stringify(this.toSyncContent(content));
            remoteUserData = await this.updateRemoteUserData(remoteContents, force ? null : remoteUserData.ref);
            this.logService.info(`${this.syncResourceLogLabel}: Updated remote ${this.syncResource.syncResource}`);
        }
        // Delete the preview
        try {
            await this.fileService.del(this.previewResource);
        }
        catch (e) { /* ignore */ }
        if (lastSyncUserData?.ref !== remoteUserData.ref) {
            this.logService.trace(`${this.syncResourceLogLabel}: Updating last synchronized ${this.syncResource.syncResource}...`);
            await this.updateLastSyncUserData(remoteUserData);
            this.logService.info(`${this.syncResourceLogLabel}: Updated last synchronized ${this.syncResource.syncResource}`);
        }
    }
    async hasLocalData() {
        return this.fileService.exists(this.file);
    }
    async resolveContent(uri) {
        if (this.extUri.isEqual(this.remoteResource, uri)
            || this.extUri.isEqual(this.baseResource, uri)
            || this.extUri.isEqual(this.localResource, uri)
            || this.extUri.isEqual(this.acceptedResource, uri)) {
            return this.resolvePreviewContent(uri);
        }
        return null;
    }
    merge(originalLocalContent, originalRemoteContent, baseContent) {
        /* no changes */
        if (originalLocalContent === null && originalRemoteContent === null && baseContent === null) {
            return { content: null, hasLocalChanged: false, hasRemoteChanged: false, hasConflicts: false };
        }
        // Normalize nulls to empty strings for easier comparison
        originalRemoteContent = originalRemoteContent ?? '';
        originalLocalContent = originalLocalContent ?? '';
        baseContent = baseContent ?? '';
        /* no changes */
        if (originalLocalContent === originalRemoteContent) {
            return { content: null, hasLocalChanged: false, hasRemoteChanged: false, hasConflicts: false };
        }
        const localForwarded = baseContent !== originalLocalContent;
        const remoteForwarded = baseContent !== originalRemoteContent;
        /* no changes */
        if (!localForwarded && !remoteForwarded) {
            return { content: null, hasLocalChanged: false, hasRemoteChanged: false, hasConflicts: false };
        }
        /* local has changed and remote has not */
        if (localForwarded && !remoteForwarded) {
            return { content: originalLocalContent, hasRemoteChanged: true, hasLocalChanged: false, hasConflicts: false };
        }
        /* remote has changed and local has not */
        if (remoteForwarded && !localForwarded) {
            return { content: originalRemoteContent, hasLocalChanged: true, hasRemoteChanged: false, hasConflicts: false };
        }
        return { content: originalLocalContent, hasLocalChanged: true, hasRemoteChanged: true, hasConflicts: true };
    }
};
AbstractJsonSynchronizer = __decorate([
    __param(4, IFileService),
    __param(5, IEnvironmentService),
    __param(6, IStorageService),
    __param(7, IUserDataSyncStoreService),
    __param(8, IUserDataSyncLocalStoreService),
    __param(9, IUserDataSyncEnablementService),
    __param(10, ITelemetryService),
    __param(11, IUserDataSyncLogService),
    __param(12, IConfigurationService),
    __param(13, IUriIdentityService)
], AbstractJsonSynchronizer);
export { AbstractJsonSynchronizer };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWJzdHJhY3RKc29uU3luY2hyb25pemVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vdXNlckRhdGFTeW5jL2NvbW1vbi9hYnN0cmFjdEpzb25TeW5jaHJvbml6ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFJaEcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDcEYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDOUUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQzNELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNsRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUN4RSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUU5RSxPQUFPLEVBQUUsd0JBQXdCLEVBQXFELE1BQU0sMkJBQTJCLENBQUM7QUFDeEgsT0FBTyxFQUEyQiw4QkFBOEIsRUFBcUQsdUJBQXVCLEVBQUUsOEJBQThCLEVBQUUseUJBQXlCLEVBQUUscUJBQXFCLEVBQWdCLE1BQU0sbUJBQW1CLENBQUM7QUFNalEsSUFBZSx3QkFBd0IsR0FBdkMsTUFBZSx3QkFBeUIsU0FBUSx3QkFBd0I7SUFTOUUsWUFDQyxZQUFpQixFQUNqQixvQkFBK0UsRUFDL0UsVUFBOEIsRUFDOUIsZUFBdUIsRUFDVCxXQUF5QixFQUNsQixrQkFBdUMsRUFDM0MsY0FBK0IsRUFDckIsd0JBQW1ELEVBQzlDLDZCQUE2RCxFQUM3RCw2QkFBNkQsRUFDMUUsZ0JBQW1DLEVBQzdCLFVBQW1DLEVBQ3JDLG9CQUEyQyxFQUM3QyxrQkFBdUM7UUFFNUQsS0FBSyxDQUFDLFlBQVksRUFBRSxvQkFBb0IsRUFBRSxV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