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
import { equals } from '../../../base/common/arrays.js';
import { createCancelablePromise, ThrottledDelayer } from '../../../base/common/async.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Emitter } from '../../../base/common/event.js';
import { parse } from '../../../base/common/json.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { uppercaseFirstLetter } from '../../../base/common/strings.js';
import { isString, isUndefined } from '../../../base/common/types.js';
import { localize } from '../../../nls.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { FileOperationError, IFileService, toFileOperationResult } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { getServiceMachineId } from '../../externalServices/common/serviceMachineId.js';
import { IStorageService } from '../../storage/common/storage.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';
import { getLastSyncResourceUri, IUserDataSyncLocalStoreService, IUserDataSyncLogService, IUserDataSyncEnablementService, IUserDataSyncStoreService, IUserDataSyncUtilService, PREVIEW_DIR_NAME, UserDataSyncError, USER_DATA_SYNC_CONFIGURATION_SCOPE, USER_DATA_SYNC_SCHEME, getPathSegments, NON_EXISTING_RESOURCE_REF, } from './userDataSync.js';
import { IUserDataProfilesService } from '../../userDataProfile/common/userDataProfile.js';
export function isRemoteUserData(thing) {
    if (thing
        && (thing.ref !== undefined && typeof thing.ref === 'string' && thing.ref !== '')
        && (thing.syncData !== undefined && (thing.syncData === null || isSyncData(thing.syncData)))) {
        return true;
    }
    return false;
}
export function isSyncData(thing) {
    if (thing
        && (thing.version !== undefined && typeof thing.version === 'number')
        && (thing.content !== undefined && typeof thing.content === 'string')) {
        // backward compatibility
        if (Object.keys(thing).length === 2) {
            return true;
        }
        if (Object.keys(thing).length === 3
            && (thing.machineId !== undefined && typeof thing.machineId === 'string')) {
            return true;
        }
    }
    return false;
}
export function getSyncResourceLogLabel(syncResource, profile) {
    return `${uppercaseFirstLetter(syncResource)}${profile.isDefault ? '' : ` (${profile.name})`}`;
}
export var SyncStrategy;
(function (SyncStrategy) {
    SyncStrategy["Preview"] = "preview";
    SyncStrategy["Merge"] = "merge";
    SyncStrategy["PullOrPush"] = "pull-push";
})(SyncStrategy || (SyncStrategy = {}));
let AbstractSynchroniser = class AbstractSynchroniser extends Disposable {
    get status() { return this._status; }
    get conflicts() { return { ...this.syncResource, conflicts: this._conflicts }; }
    constructor(syncResource, collection, fileService, environmentService, storageService, userDataSyncStoreService, userDataSyncLocalStoreService, userDataSyncEnablementService, telemetryService, logService, configurationService, uriIdentityService) {
        super();
        this.syncResource = syncResource;
        this.collection = collection;
        this.fileService = fileService;
        this.environmentService = environmentService;
        this.storageService = storageService;
        this.userDataSyncStoreService = userDataSyncStoreService;
        this.userDataSyncLocalStoreService = userDataSyncLocalStoreService;
        this.userDataSyncEnablementService = userDataSyncEnablementService;
        this.telemetryService = telemetryService;
        this.logService = logService;
        this.configurationService = configurationService;
        this.syncPreviewPromise = null;
        this._status = "idle" /* SyncStatus.Idle */;
        this._onDidChangStatus = this._register(new Emitter());
        this.onDidChangeStatus = this._onDidChangStatus.event;
        this._conflicts = [];
        this._onDidChangeConflicts = this._register(new Emitter());
        this.onDidChangeConflicts = this._onDidChangeConflicts.event;
        this.localChangeTriggerThrottler = this._register(new ThrottledDelayer(50));
        this._onDidChangeLocal = this._register(new Emitter());
        this.onDidChangeLocal = this._onDidChangeLocal.event;
        this.hasSyncResourceStateVersionChanged = false;
        this.syncHeaders = {};
        this.lastSyncUserDataStateKey = `${collection ? `${collection}.` : ''}${syncResource.syncResource}.lastSyncUserData`;
        this.resource = syncResource.syncResource;
        this.syncResourceLogLabel = getSyncResourceLogLabel(syncResource.syncResource, syncResource.profile);
        this.extUri = uriIdentityService.extUri;
        this.syncFolder = this.extUri.joinPath(environmentService.userDataSyncHome, ...getPathSegments(syncResource.profile.isDefault ? undefined : syncResource.profile.id, syncResource.syncResource));
        this.syncPreviewFolder = this.extUri.joinPath(this.syncFolder, PREVIEW_DIR_NAME);
        this.lastSyncResource = getLastSyncResourceUri(syncResource.profile.isDefault ? undefined : syncResource.profile.id, syncResource.syncResource, environmentService, this.extUri);
        this.currentMachineIdPromise = getServiceMachineId(environmentService, fileService, storageService);
    }
    triggerLocalChange() {
        this.localChangeTriggerThrottler.trigger(() => this.doTriggerLocalChange());
    }
    async doTriggerLocalChange() {
        // Sync again if current status is in conflicts
        if (this.status === "hasConflicts" /* SyncStatus.HasConflicts */) {
            this.logService.info(`${this.syncResourceLogLabel}: In conflicts state and local change detected. Syncing again...`);
            const preview = await this.syncPreviewPromise;
            this.syncPreviewPromise = null;
            const status = await this.performSync(preview.remoteUserData, preview.lastSyncUserData, "merge" /* SyncStrategy.Merge */, this.getUserDataSyncConfiguration());
            this.setStatus(status);
        }
        // Check if local change causes remote change
        else {
            this.logService.trace(`${this.syncResourceLogLabel}: Checking for local changes...`);
            const lastSyncUserData = await this.getLastSyncUserData();
            const hasRemoteChanged = lastSyncUserData ? await this.hasRemoteChanged(lastSyncUserData) : true;
            if (hasRemoteChanged) {
                this._onDidChangeLocal.fire();
            }
        }
    }
    setStatus(status) {
        if (this._status !== status) {
            this._status = status;
            this._onDidChangStatus.fire(status);
        }
    }
    async sync(refOrUserData, preview = false, userDataSyncConfiguration = this.getUserDataSyncConfiguration(), headers = {}) {
        try {
            this.syncHeaders = { ...headers };
            if (this.status === "hasConflicts" /* SyncStatus.HasConflicts */) {
                this.logService.info(`${this.syncResourceLogLabel}: Skipped synchronizing ${this.resource.toLowerCase()} as there are conflicts.`);
                return this.syncPreviewPromise;
            }
            if (this.status === "syncing" /* SyncStatus.Syncing */) {
                this.logService.info(`${this.syncResourceLogLabel}: Skipped synchronizing ${this.resource.toLowerCase()} as it is running already.`);
                return this.syncPreviewPromise;
            }
            this.logService.trace(`${this.syncResourceLogLabel}: Started synchronizing ${this.resource.toLowerCase()}...`);
            this.setStatus("syncing" /* SyncStatus.Syncing */);
            let status = "idle" /* SyncStatus.Idle */;
            try {
                const lastSyncUserData = await this.getLastSyncUserData();
                const remoteUserData = await this.getLatestRemoteUserData(refOrUserData, lastSyncUserData);
                status = await this.performSync(remoteUserData, lastSyncUserData, preview ? "preview" /* SyncStrategy.Preview */ : "merge" /* SyncStrategy.Merge */, userDataSyncConfiguration);
                if (status === "hasConflicts" /* SyncStatus.HasConflicts */) {
                    this.logService.info(`${this.syncResourceLogLabel}: Detected conflicts while synchronizing ${this.resource.toLowerCase()}.`);
                }
                else if (status === "idle" /* SyncStatus.Idle */) {
                    this.logService.trace(`${this.syncResourceLogLabel}: Finished synchronizing ${this.resource.toLowerCase()}.`);
                }
                return this.syncPreviewPromise || null;
            }
            finally {
                this.setStatus(status);
            }
        }
        finally {
            this.syncHeaders = {};
        }
    }
    async apply(force, headers = {}) {
        try {
            this.syncHeaders = { ...headers };
            const status = await this.doApply(force);
            this.setStatus(status);
            return this.syncPreviewPromise;
        }
        finally {
            this.syncHeaders = {};
        }
    }
    async replace(content) {
        const syncData = this.parseSyncData(content);
        if (!syncData) {
            return false;
        }
        await this.stop();
        try {
            this.logService.trace(`${this.syncResourceLogLabel}: Started resetting ${this.resource.toLowerCase()}...`);
            this.setStatus("syncing" /* SyncStatus.Syncing */);
            const lastSyncUserData = await this.getLastSyncUserData();
            const remoteUserData = await this.getLatestRemoteUserData(null, lastSyncUserData);
            const isRemoteDataFromCurrentMachine = await this.isRemoteDataFromCurrentMachine(remoteUserData);
            /* use replace sync data */
            const resourcePreviewResults = await this.generateSyncPreview({ ref: remoteUserData.ref, syncData }, lastSyncUserData, isRemoteDataFromCurrentMachine, this.getUserDataSyncConfiguration(), CancellationToken.None);
            const resourcePreviews = [];
            for (const resourcePreviewResult of resourcePreviewResults) {
                /* Accept remote resource */
                const acceptResult = await this.getAcceptResult(resourcePreviewResult, resourcePreviewResult.remoteResource, undefined, CancellationToken.None);
                /* compute remote change */
                const { remoteChange } = await this.getAcceptResult(resourcePreviewResult, resourcePreviewResult.previewResource, resourcePreviewResult.remoteContent, CancellationToken.None);
                resourcePreviews.push([resourcePreviewResult, { ...acceptResult, remoteChange: remoteChange !== 0 /* Change.None */ ? remoteChange : 2 /* Change.Modified */ }]);
            }
            await this.applyResult(remoteUserData, lastSyncUserData, resourcePreviews, false);
            this.logService.info(`${this.syncResourceLogLabel}: Finished resetting ${this.resource.toLowerCase()}.`);
        }
        finally {
            this.setStatus("idle" /* SyncStatus.Idle */);
        }
        return true;
    }
    async isRemoteDataFromCurrentMachine(remoteUserData) {
        const machineId = await this.currentMachineIdPromise;
        return !!remoteUserData.syncData?.machineId && remoteUserData.syncData.machineId === machineId;
    }
    async getLatestRemoteUserData(refOrLatestData, lastSyncUserData) {
        if (refOrLatestData === null) {
            return { ref: NON_EXISTING_RESOURCE_REF, syncData: null };
        }
        if (!isString(refOrLatestData)) {
            return this.toRemoteUserData(refOrLatestData);
        }
        // Last time synced resource and latest resource on server are same
        if (lastSyncUserData?.ref === refOrLatestData) {
            return lastSyncUserData;
        }
        return this.getRemoteUserData(lastSyncUserData);
    }
    async performSync(remoteUserData, lastSyncUserData, strategy, userDataSyncConfiguration) {
        if (remoteUserData.syncData && remoteUserData.syncData.version > this.version) {
            throw new UserDataSyncError(localize({ key: 'incompatible', comment: ['This is an error while syncing a resource that its local version is not compatible with its remote version.'] }, "Cannot sync {0} as its local version {1} is not compatible with its remote version {2}", this.resource, this.version, remoteUserData.syncData.version), "IncompatibleLocalContent" /* UserDataSyncErrorCode.IncompatibleLocalContent */, this.resource);
        }
        try {
            return await this.doSync(remoteUserData, lastSyncUserData, strategy, userDataSyncConfiguration);
        }
        catch (e) {
            if (e instanceof UserDataSyncError) {
                switch (e.code) {
                    case "LocalPreconditionFailed" /* UserDataSyncErrorCode.LocalPreconditionFailed */:
                        // Rejected as there is a new local version. Syncing again...
                        this.logService.info(`${this.syncResourceLogLabel}: Failed to synchronize ${this.syncResourceLogLabel} as there is a new local version available. Synchronizing again...`);
                        return this.performSync(remoteUserData, lastSyncUserData, strategy, userDataSyncConfiguration);
                    case "Conflict" /* UserDataSyncErrorCode.Conflict */:
                    case "PreconditionFailed" /* UserDataSyncErrorCode.PreconditionFailed */:
                        // Rejected as there is a new remote version. Syncing again...
                        this.logService.info(`${this.syncResourceLogLabel}: Failed to synchronize as there is a new remote version available. Synchronizing again...`);
                        // Avoid cache and get latest remote user data - https://github.com/microsoft/vscode/issues/90624
                        remoteUserData = await this.getRemoteUserData(null);
                        // Get the latest last sync user data. Because multiple parallel syncs (in Web) could share same last sync data
                        // and one of them successfully updated remote and last sync state.
                        lastSyncUserData = await this.getLastSyncUserData();
                        return this.performSync(remoteUserData, lastSyncUserData, "merge" /* SyncStrategy.Merge */, userDataSyncConfiguration);
                }
            }
            throw e;
        }
    }
    async doSync(remoteUserData, lastSyncUserData, strategy, userDataSyncConfiguration) {
        try {
            const isRemoteDataFromCurrentMachine = await this.isRemoteDataFromCurrentMachine(remoteUserData);
            const acceptRemote = !isRemoteDataFromCurrentMachine && lastSyncUserData === null && this.getStoredLastSyncUserDataStateContent() !== undefined;
            const merge = strategy === "preview" /* SyncStrategy.Preview */ || (strategy === "merge" /* SyncStrategy.Merge */ && !acceptRemote);
            const apply = strategy === "merge" /* SyncStrategy.Merge */ || strategy === "pull-push" /* SyncStrategy.PullOrPush */;
            // generate or use existing preview
            if (!this.syncPreviewPromise) {
                this.syncPreviewPromise = createCancelablePromise(token => this.doGenerateSyncResourcePreview(remoteUserData, lastSyncUserData, isRemoteDataFromCurrentMachine, merge, userDataSyncConfiguration, token));
            }
            let preview = await this.syncPreviewPromise;
            if (strategy === "merge" /* SyncStrategy.Merge */ && acceptRemote) {
                this.logService.info(`${this.syncResourceLogLabel}: Accepting remote because it was synced before and the last sync data is not available.`);
                for (const resourcePreview of preview.resourcePreviews) {
                    preview = (await this.accept(resourcePreview.remoteResource)) || preview;
                }
            }
            else if (strategy === "pull-push" /* SyncStrategy.PullOrPush */) {
                for (const resourcePreview of preview.resourcePreviews) {
                    if (resourcePreview.mergeState === "accepted" /* MergeState.Accepted */) {
                        continue;
                    }
                    if (remoteUserData.ref === lastSyncUserData?.ref || isRemoteDataFromCurrentMachine) {
                        preview = (await this.accept(resourcePreview.localResource)) ?? preview;
                    }
                    else {
                        preview = (await this.accept(resourcePreview.remoteResource)) ?? preview;
                    }
                }
            }
            this.updateConflicts(preview.resourcePreviews);
            if (preview.resourcePreviews.some(({ mergeState }) => mergeState === "conflict" /* MergeState.Conflict */)) {
                return "hasConflicts" /* SyncStatus.HasConflicts */;
            }
            if (apply) {
                return await this.doApply(false);
            }
            return "syncing" /* SyncStatus.Syncing */;
        }
        catch (error) {
            // reset preview on error
            this.syncPreviewPromise = null;
            throw error;
        }
    }
    async accept(resource, content) {
        await this.updateSyncResourcePreview(resource, async (resourcePreview) => {
            const acceptResult = await this.getAcceptResult(resourcePreview, resource, content, CancellationToken.None);
            resourcePreview.acceptResult = acceptResult;
            resourcePreview.mergeState = "accepted" /* MergeState.Accepted */;
            resourcePreview.localChange = acceptResult.localChange;
            resourcePreview.remoteChange = acceptResult.remoteChange;
            return resourcePreview;
        });
        return this.syncPreviewPromise;
    }
    async discard(resource) {
        await this.updateSyncResourcePreview(resource, async (resourcePreview) => {
            const mergeResult = await this.getMergeResult(resourcePreview, CancellationToken.None);
            await this.fileService.writeFile(resourcePreview.previewResource, VSBuffer.fromString(mergeResult.content || ''));
            resourcePreview.acceptResult = undefined;
            resourcePreview.mergeState = "preview" /* MergeState.Preview */;
            resourcePreview.localChange = mergeResult.localChange;
            resourcePreview.remoteChange = mergeResult.remoteChange;
            return resourcePreview;
        });
        return this.syncPreviewPromise;
    }
    async updateSyncResourcePreview(resource, updateResourcePreview) {
        if (!this.syncPreviewPromise) {
            return;
        }
        let preview = await this.syncPreviewPromise;
        const index = preview.resourcePreviews.findIndex(({ localResource, remoteResource, previewResource }) => this.extUri.isEqual(localResource, resource) || this.extUri.isEqual(remoteResource, resource) || this.extUri.isEqual(previewResource, resource));
        if (index === -1) {
            return;
        }
        this.syncPreviewPromise = createCancelablePromise(async (token) => {
            const resourcePreviews = [...preview.resourcePreviews];
            resourcePreviews[index] = await updateResourcePreview(resourcePreviews[index]);
            return {
                ...preview,
                resourcePreviews
            };
        });
        preview = await this.syncPreviewPromise;
        this.updateConflicts(preview.resourcePreviews);
        if (preview.resourcePreviews.some(({ mergeState }) => mergeState === "conflict" /* MergeState.Conflict */)) {
            this.setStatus("hasConflicts" /* SyncStatus.HasConflicts */);
        }
        else {
            this.setStatus("syncing" /* SyncStatus.Syncing */);
        }
    }
    async doApply(force) {
        if (!this.syncPreviewPromise) {
            return "idle" /* SyncStatus.Idle */;
        }
        const preview = await this.syncPreviewPromise;
        // check for conflicts
        if (preview.resourcePreviews.some(({ mergeState }) => mergeState === "conflict" /* MergeState.Conflict */)) {
            return "hasConflicts" /* SyncStatus.HasConflicts */;
        }
        // check if all are accepted
        if (preview.resourcePreviews.some(({ mergeState }) => mergeState !== "accepted" /* MergeState.Accepted */)) {
            return "syncing" /* SyncStatus.Syncing */;
        }
        // apply preview
        await this.applyResult(preview.remoteUserData, preview.lastSyncUserData, preview.resourcePreviews.map(resourcePreview => ([resourcePreview, resourcePreview.acceptResult])), force);
        // reset preview
        this.syncPreviewPromise = null;
        // reset preview folder
        await this.clearPreviewFolder();
        return "idle" /* SyncStatus.Idle */;
    }
    async clearPreviewFolder() {
        try {
            await this.fileService.del(this.syncPreviewFolder, { recursive: true });
        }
        catch (error) { /* Ignore */ }
    }
    updateConflicts(resourcePreviews) {
        const conflicts = resourcePreviews.filter(({ mergeState }) => mergeState === "conflict" /* MergeState.Conflict */);
        if (!equals(this._conflicts, conflicts, (a, b) => this.extUri.isEqual(a.previewResource, b.previewResource))) {
            this._conflicts = conflicts;
            this._onDidChangeConflicts.fire(this.conflicts);
        }
    }
    async hasPreviouslySynced() {
        const lastSyncData = await this.getLastSyncUserData();
        return !!lastSyncData && lastSyncData.syncData !== null /* `null` sync data implies resource is not synced */;
    }
    async resolvePreviewContent(uri) {
        const syncPreview = this.syncPreviewPromise ? await this.syncPreviewPromise : null;
        if (syncPreview) {
            for (const resourcePreview of syncPreview.resourcePreviews) {
                if (this.extUri.isEqual(resourcePreview.acceptedResource, uri)) {
                    return resourcePreview.acceptResult ? resourcePreview.acceptResult.content : null;
                }
                if (this.extUri.isEqual(resourcePreview.remoteResource, uri)) {
                    return resourcePreview.remoteContent;
                }
                if (this.extUri.isEqual(resourcePreview.localResource, uri)) {
                    return resourcePreview.localContent;
                }
                if (this.extUri.isEqual(resourcePreview.baseResource, uri)) {
                    return resourcePreview.baseContent;
                }
            }
        }
        return null;
    }
    async resetLocal() {
        this.storageService.remove(this.lastSyncUserDataStateKey, -1 /* StorageScope.APPLICATION */);
        try {
            await this.fileService.del(this.lastSyncResource);
        }
        catch (error) {
            if (toFileOperationResult(error) !== 1 /* FileOperationResult.FILE_NOT_FOUND */) {
                this.logService.error(error);
            }
        }
    }
    async doGenerateSyncResourcePreview(remoteUserData, lastSyncUserData, isRemoteDataFromCurrentMachine, merge, userDataSyncConfiguration, token) {
        const resourcePreviewResults = await this.generateSyncPreview(remoteUserData, lastSyncUserData, isRemoteDataFromCurrentMachine, userDataSyncConfiguration, token);
        const resourcePreviews = [];
        for (const resourcePreviewResult of resourcePreviewResults) {
            const acceptedResource = resourcePreviewResult.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'accepted' });
            /* No change -> Accept */
            if (resourcePreviewResult.localChange === 0 /* Change.None */ && resourcePreviewResult.remoteChange === 0 /* Change.None */) {
                resourcePreviews.push({
                    ...resourcePreviewResult,
                    acceptedResource,
                    acceptResult: { content: null, localChange: 0 /* Change.None */, remoteChange: 0 /* Change.None */ },
                    mergeState: "accepted" /* MergeState.Accepted */
                });
            }
            /* Changed -> Apply ? (Merge ? Conflict | Accept) : Preview */
            else {
                /* Merge */
                const mergeResult = merge ? await this.getMergeResult(resourcePreviewResult, token) : undefined;
                if (token.isCancellationRequested) {
                    break;
                }
                await this.fileService.writeFile(resourcePreviewResult.previewResource, VSBuffer.fromString(mergeResult?.content || ''));
                /* Conflict | Accept */
                const acceptResult = mergeResult && !mergeResult.hasConflicts
                    /* Accept if merged and there are no conflicts */
                    ? await this.getAcceptResult(resourcePreviewResult, resourcePreviewResult.previewResource, undefined, token)
                    : undefined;
                resourcePreviews.push({
                    ...resourcePreviewResult,
                    acceptResult,
                    mergeState: mergeResult?.hasConflicts ? "conflict" /* MergeState.Conflict */ : acceptResult ? "accepted" /* MergeState.Accepted */ : "preview" /* MergeState.Preview */,
                    localChange: acceptResult ? acceptResult.localChange : mergeResult ? mergeResult.localChange : resourcePreviewResult.localChange,
                    remoteChange: acceptResult ? acceptResult.remoteChange : mergeResult ? mergeResult.remoteChange : resourcePreviewResult.remoteChange
                });
            }
        }
        return { syncResource: this.resource, profile: this.syncResource.profile, remoteUserData, lastSyncUserData, resourcePreviews, isLastSyncFromCurrentMachine: isRemoteDataFromCurrentMachine };
    }
    async getLastSyncUserData() {
        const storedLastSyncUserDataStateContent = this.getStoredLastSyncUserDataStateContent();
        // Last Sync Data state does not exist
        if (!storedLastSyncUserDataStateContent) {
            this.logService.info(`${this.syncResourceLogLabel}: Last sync data state does not exist.`);
            return null;
        }
        const lastSyncUserDataState = JSON.parse(storedLastSyncUserDataStateContent);
        const resourceSyncStateVersion = this.userDataSyncEnablementService.getResourceSyncStateVersion(this.resource);
        this.hasSyncResourceStateVersionChanged = !!lastSyncUserDataState.version && !!resourceSyncStateVersion && lastSyncUserDataState.version !== resourceSyncStateVersion;
        if (this.hasSyncResourceStateVersionChanged) {
            this.logService.info(`${this.syncResourceLogLabel}: Reset last sync state because last sync state version ${lastSyncUserDataState.version} is not compatible with current sync state version ${resourceSyncStateVersion}.`);
            await this.resetLocal();
            return null;
        }
        let syncData = undefined;
        // Get Last Sync Data from Local
        let retrial = 1;
        while (syncData === undefined && retrial++ < 6 /* Retry 5 times */) {
            try {
                const lastSyncStoredRemoteUserData = await this.readLastSyncStoredRemoteUserData();
                if (lastSyncStoredRemoteUserData) {
                    if (lastSyncStoredRemoteUserData.ref === lastSyncUserDataState.ref) {
                        syncData = lastSyncStoredRemoteUserData.syncData;
                    }
                    else {
                        this.logService.info(`${this.syncResourceLogLabel}: Last sync data stored locally is not same as the last sync state.`);
                    }
                }
                break;
            }
            catch (error) {
                if (error instanceof FileOperationError && error.fileOperationResult === 1 /* FileOperationResult.FILE_NOT_FOUND */) {
                    this.logService.info(`${this.syncResourceLogLabel}: Last sync resource does not exist locally.`);
                    break;
                }
                else if (error instanceof UserDataSyncError) {
                    throw error;
                }
                else {
                    // log and retry
                    this.logService.error(error, retrial);
                }
            }
        }
        // Get Last Sync Data from Remote
        if (syncData === undefined) {
            try {
                const content = await this.userDataSyncStoreService.resolveResourceContent(this.resource, lastSyncUserDataState.ref, this.collection, this.syncHeaders);
                syncData = content === null ? null : this.parseSyncData(content);
                await this.writeLastSyncStoredRemoteUserData({ ref: lastSyncUserDataState.ref, syncData });
            }
            catch (error) {
                if (error instanceof UserDataSyncError && error.code === "NotFound" /* UserDataSyncErrorCode.NotFound */) {
                    this.logService.info(`${this.syncResourceLogLabel}: Last sync resource does not exist remotely.`);
                }
                else {
                    throw error;
                }
            }
        }
        // Last Sync Data Not Found
        if (syncData === undefined) {
            return null;
        }
        return {
            ...lastSyncUserDataState,
            syncData,
        };
    }
    async updateLastSyncUserData(lastSyncRemoteUserData, additionalProps = {}) {
        if (additionalProps['ref'] || additionalProps['version']) {
            throw new Error('Cannot have core properties as additional');
        }
        const version = this.userDataSyncEnablementService.getResourceSyncStateVersion(this.resource);
        const lastSyncUserDataState = {
            ref: lastSyncRemoteUserData.ref,
            version,
            ...additionalProps
        };
        this.storageService.store(this.lastSyncUserDataStateKey, JSON.stringify(lastSyncUserDataState), -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
        await this.writeLastSyncStoredRemoteUserData(lastSyncRemoteUserData);
    }
    getStoredLastSyncUserDataStateContent() {
        return this.storageService.get(this.lastSyncUserDataStateKey, -1 /* StorageScope.APPLICATION */);
    }
    async readLastSyncStoredRemoteUserData() {
        const content = (await this.fileService.readFile(this.lastSyncResource)).value.toString();
        try {
            const lastSyncStoredRemoteUserData = content ? JSON.parse(content) : undefined;
            if (isRemoteUserData(lastSyncStoredRemoteUserData)) {
                return lastSyncStoredRemoteUserData;
            }
        }
        catch (e) {
            this.logService.error(e);
        }
        return undefined;
    }
    async writeLastSyncStoredRemoteUserData(lastSyncRemoteUserData) {
        await this.fileService.writeFile(this.lastSyncResource, VSBuffer.fromString(JSON.stringify(lastSyncRemoteUserData)));
    }
    async getRemoteUserData(lastSyncData) {
        const userData = await this.getUserData(lastSyncData);
        return this.toRemoteUserData(userData);
    }
    toRemoteUserData({ ref, content }) {
        let syncData = null;
        if (content !== null) {
            syncData = this.parseSyncData(content);
        }
        return { ref, syncData };
    }
    parseSyncData(content) {
        try {
            const syncData = JSON.parse(content);
            if (isSyncData(syncData)) {
                return syncData;
            }
        }
        catch (error) {
            this.logService.error(error);
        }
        throw new UserDataSyncError(localize('incompatible sync data', "Cannot parse sync data as it is not compatible with the current version."), "IncompatibleRemoteContent" /* UserDataSyncErrorCode.IncompatibleRemoteContent */, this.resource);
    }
    async getUserData(lastSyncData) {
        const lastSyncUserData = lastSyncData ? { ref: lastSyncData.ref, content: lastSyncData.syncData ? JSON.stringify(lastSyncData.syncData) : null } : null;
        return this.userDataSyncStoreService.readResource(this.resource, lastSyncUserData, this.collection, this.syncHeaders);
    }
    async updateRemoteUserData(content, ref) {
        const machineId = await this.currentMachineIdPromise;
        const syncData = { version: this.version, machineId, content };
        try {
            ref = await this.userDataSyncStoreService.writeResource(this.resource, JSON.stringify(syncData), ref, this.collection, this.syncHeaders);
            return { ref, syncData };
        }
        catch (error) {
            if (error instanceof UserDataSyncError && error.code === "TooLarge" /* UserDataSyncErrorCode.TooLarge */) {
                error = new UserDataSyncError(error.message, error.code, this.resource);
            }
            throw error;
        }
    }
    async backupLocal(content) {
        const syncData = { version: this.version, content };
        return this.userDataSyncLocalStoreService.writeResource(this.resource, JSON.stringify(syncData), new Date(), this.syncResource.profile.isDefault ? undefined : this.syncResource.profile.id);
    }
    async stop() {
        if (this.status === "idle" /* SyncStatus.Idle */) {
            return;
        }
        this.logService.trace(`${this.syncResourceLogLabel}: Stopping synchronizing ${this.resource.toLowerCase()}.`);
        if (this.syncPreviewPromise) {
            this.syncPreviewPromise.cancel();
            this.syncPreviewPromise = null;
        }
        this.updateConflicts([]);
        await this.clearPreviewFolder();
        this.setStatus("idle" /* SyncStatus.Idle */);
        this.logService.info(`${this.syncResourceLogLabel}: Stopped synchronizing ${this.resource.toLowerCase()}.`);
    }
    getUserDataSyncConfiguration() {
        return this.configurationService.getValue(USER_DATA_SYNC_CONFIGURATION_SCOPE);
    }
};
AbstractSynchroniser = __decorate([
    __param(2, IFileService),
    __param(3, IEnvironmentService),
    __param(4, IStorageService),
    __param(5, IUserDataSyncStoreService),
    __param(6, IUserDataSyncLocalStoreService),
    __param(7, IUserDataSyncEnablementService),
    __param(8, ITelemetryService),
    __param(9, IUserDataSyncLogService),
    __param(10, IConfigurationService),
    __param(11, IUriIdentityService)
], AbstractSynchroniser);
export { AbstractSynchroniser };
let AbstractFileSynchroniser = class AbstractFileSynchroniser extends AbstractSynchroniser {
    constructor(file, syncResource, collection, fileService, environmentService, storageService, userDataSyncStoreService, userDataSyncLocalStoreService, userDataSyncEnablementService, telemetryService, logService, configurationService, uriIdentityService) {
        super(syncResource, collection, fileService, environmentService, storageService, userDataSyncStoreService, userDataSyncLocalStoreService, userDataSyncEnablementService, telemetryService, logService, configurationService, uriIdentityService);
        this.file = file;
        this._register(this.fileService.watch(this.extUri.dirname(file)));
        this._register(this.fileService.onDidFilesChange(e => this.onFileChanges(e)));
    }
    async getLocalFileContent() {
        try {
            return await this.fileService.readFile(this.file);
        }
        catch (error) {
            return null;
        }
    }
    async updateLocalFileContent(newContent, oldContent, force) {
        try {
            if (oldContent) {
                // file exists already
                await this.fileService.writeFile(this.file, VSBuffer.fromString(newContent), force ? undefined : oldContent);
            }
            else {
                // file does not exist
                await this.fileService.createFile(this.file, VSBuffer.fromString(newContent), { overwrite: force });
            }
        }
        catch (e) {
            if ((e instanceof FileOperationError && e.fileOperationResult === 1 /* FileOperationResult.FILE_NOT_FOUND */) ||
                (e instanceof FileOperationError && e.fileOperationResult === 3 /* FileOperationResult.FILE_MODIFIED_SINCE */)) {
                throw new UserDataSyncError(e.message, "LocalPreconditionFailed" /* UserDataSyncErrorCode.LocalPreconditionFailed */);
            }
            else {
                throw e;
            }
        }
    }
    async deleteLocalFile() {
        try {
            await this.fileService.del(this.file);
        }
        catch (e) {
            if (!(e instanceof FileOperationError && e.fileOperationResult === 1 /* FileOperationResult.FILE_NOT_FOUND */)) {
                throw e;
            }
        }
    }
    onFileChanges(e) {
        if (!e.contains(this.file)) {
            return;
        }
        this.triggerLocalChange();
    }
};
AbstractFileSynchroniser = __decorate([
    __param(3, IFileService),
    __param(4, IEnvironmentService),
    __param(5, IStorageService),
    __param(6, IUserDataSyncStoreService),
    __param(7, IUserDataSyncLocalStoreService),
    __param(8, IUserDataSyncEnablementService),
    __param(9, ITelemetryService),
    __param(10, IUserDataSyncLogService),
    __param(11, IConfigurationService),
    __param(12, IUriIdentityService)
], AbstractFileSynchroniser);
export { AbstractFileSynchroniser };
let AbstractJsonFileSynchroniser = class AbstractJsonFileSynchroniser extends AbstractFileSynchroniser {
    constructor(file, syncResource, collection, fileService, environmentService, storageService, userDataSyncStoreService, userDataSyncLocalStoreService, userDataSyncEnablementService, telemetryService, logService, userDataSyncUtilService, configurationService, uriIdentityService) {
        super(file, syncResource, collection, fileService, environmentService, storageService, userDataSyncStoreService, userDataSyncLocalStoreService, userDataSyncEnablementService, telemetryService, logService, configurationService, uriIdentityService);
        this.userDataSyncUtilService = userDataSyncUtilService;
        this._formattingOptions = undefined;
    }
    hasErrors(content, isArray) {
        const parseErrors = [];
        const result = parse(content, parseErrors, { allowEmptyContent: true, allowTrailingComma: true });
        return parseErrors.length > 0 || (!isUndefined(result) && isArray !== Array.isArray(result));
    }
    getFormattingOptions() {
        if (!this._formattingOptions) {
            this._formattingOptions = this.userDataSyncUtilService.resolveFormattingOptions(this.file);
        }
        return this._formattingOptions;
    }
};
AbstractJsonFileSynchroniser = __decorate([
    __param(3, IFileService),
    __param(4, IEnvironmentService),
    __param(5, IStorageService),
    __param(6, IUserDataSyncStoreService),
    __param(7, IUserDataSyncLocalStoreService),
    __param(8, IUserDataSyncEnablementService),
    __param(9, ITelemetryService),
    __param(10, IUserDataSyncLogService),
    __param(11, IUserDataSyncUtilService),
    __param(12, IConfigurationService),
    __param(13, IUriIdentityService)
], AbstractJsonFileSynchroniser);
export { AbstractJsonFileSynchroniser };
let AbstractInitializer = class AbstractInitializer {
    constructor(resource, userDataProfilesService, environmentService, logService, fileService, storageService, uriIdentityService) {
        this.resource = resource;
        this.userDataProfilesService = userDataProfilesService;
        this.environmentService = environmentService;
        this.logService = logService;
        this.fileService = fileService;
        this.storageService = storageService;
        this.extUri = uriIdentityService.extUri;
        this.lastSyncResource = getLastSyncResourceUri(undefined, this.resource, environmentService, this.extUri);
    }
    async initialize({ ref, content }) {
        if (!content) {
            this.logService.info('Remote content does not exist.', this.resource);
            return;
        }
        const syncData = this.parseSyncData(content);
        if (!syncData) {
            return;
        }
        try {
            await this.doInitialize({ ref, syncData });
        }
        catch (error) {
            this.logService.error(error);
        }
    }
    parseSyncData(content) {
        try {
            const syncData = JSON.parse(content);
            if (isSyncData(syncData)) {
                return syncData;
            }
        }
        catch (error) {
            this.logService.error(error);
        }
        this.logService.info('Cannot parse sync data as it is not compatible with the current version.', this.resource);
        return undefined;
    }
    async updateLastSyncUserData(lastSyncRemoteUserData, additionalProps = {}) {
        if (additionalProps['ref'] || additionalProps['version']) {
            throw new Error('Cannot have core properties as additional');
        }
        const lastSyncUserDataState = {
            ref: lastSyncRemoteUserData.ref,
            version: undefined,
            ...additionalProps
        };
        this.storageService.store(`${this.resource}.lastSyncUserData`, JSON.stringify(lastSyncUserDataState), -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
        await this.fileService.writeFile(this.lastSyncResource, VSBuffer.fromString(JSON.stringify(lastSyncRemoteUserData)));
    }
};
AbstractInitializer = __decorate([
    __param(1, IUserDataProfilesService),
    __param(2, IEnvironmentService),
    __param(3, ILogService),
    __param(4, IFileService),
    __param(5, IStorageService),
    __param(6, IUriIdentityService)
], AbstractInitializer);
export { AbstractInitializer };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWJzdHJhY3RTeW5jaHJvbml6ZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS91c2VyRGF0YVN5bmMvY29tbW9uL2Fic3RyYWN0U3luY2hyb25pemVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUN4RCxPQUFPLEVBQXFCLHVCQUF1QixFQUFFLGdCQUFnQixFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDN0csT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRXpFLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSwrQkFBK0IsQ0FBQztBQUMvRCxPQUFPLEVBQUUsS0FBSyxFQUFjLE1BQU0sOEJBQThCLENBQUM7QUFFakUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRS9ELE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxRQUFRLEVBQUUsV0FBVyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFHdEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQzNDLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzlFLE9BQU8sRUFBb0Isa0JBQWtCLEVBQXFDLFlBQVksRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQzNKLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUN0RCxPQUFPLEVBQUUsbUJBQW1C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