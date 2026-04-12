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
import { createCancelablePromise, RunOnceScheduler } from '../../../base/common/async.js';
import { CancellationTokenSource } from '../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { isEqual } from '../../../base/common/resources.js';
import { isBoolean, isUndefined } from '../../../base/common/types.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IExtensionGalleryService } from '../../extensionManagement/common/extensionManagement.js';
import { IFileService } from '../../files/common/files.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { IStorageService } from '../../storage/common/storage.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { IUserDataProfilesService } from '../../userDataProfile/common/userDataProfile.js';
import { ExtensionsSynchroniser } from './extensionsSync.js';
import { GlobalStateSynchroniser } from './globalStateSync.js';
import { KeybindingsSynchroniser } from './keybindingsSync.js';
import { PromptsSynchronizer } from './promptsSync/promptsSync.js';
import { SettingsSynchroniser } from './settingsSync.js';
import { SnippetsSynchroniser } from './snippetsSync.js';
import { TasksSynchroniser } from './tasksSync.js';
import { McpSynchroniser } from './mcpSync.js';
import { UserDataProfilesManifestSynchroniser } from './userDataProfilesManifestSync.js';
import { ALL_SYNC_RESOURCES, createSyncHeaders, IUserDataSyncEnablementService, IUserDataSyncLogService, IUserDataSyncStoreManagementService, IUserDataSyncStoreService, UserDataSyncError, UserDataSyncStoreError, USER_DATA_SYNC_CONFIGURATION_SCOPE, IUserDataSyncResourceProviderService, IUserDataSyncLocalStoreService, isUserDataManifest, } from './userDataSync.js';
const LAST_SYNC_TIME_KEY = 'sync.lastSyncTime';
let UserDataSyncService = class UserDataSyncService extends Disposable {
    get status() { return this._status; }
    get conflicts() { return this._conflicts; }
    get lastSyncTime() { return this._lastSyncTime; }
    constructor(fileService, userDataSyncStoreService, userDataSyncStoreManagementService, instantiationService, logService, telemetryService, storageService, userDataSyncEnablementService, userDataProfilesService, userDataSyncResourceProviderService, userDataSyncLocalStoreService) {
        super();
        this.fileService = fileService;
        this.userDataSyncStoreService = userDataSyncStoreService;
        this.userDataSyncStoreManagementService = userDataSyncStoreManagementService;
        this.instantiationService = instantiationService;
        this.logService = logService;
        this.telemetryService = telemetryService;
        this.storageService = storageService;
        this.userDataSyncEnablementService = userDataSyncEnablementService;
        this.userDataProfilesService = userDataProfilesService;
        this.userDataSyncResourceProviderService = userDataSyncResourceProviderService;
        this.userDataSyncLocalStoreService = userDataSyncLocalStoreService;
        this._status = "uninitialized" /* SyncStatus.Uninitialized */;
        this._onDidChangeStatus = this._register(new Emitter());
        this.onDidChangeStatus = this._onDidChangeStatus.event;
        this._onDidChangeLocal = this._register(new Emitter());
        this.onDidChangeLocal = this._onDidChangeLocal.event;
        this._conflicts = [];
        this._onDidChangeConflicts = this._register(new Emitter());
        this.onDidChangeConflicts = this._onDidChangeConflicts.event;
        this._syncErrors = [];
        this._onSyncErrors = this._register(new Emitter());
        this.onSyncErrors = this._onSyncErrors.event;
        this._lastSyncTime = undefined;
        this._onDidChangeLastSyncTime = this._register(new Emitter());
        this.onDidChangeLastSyncTime = this._onDidChangeLastSyncTime.event;
        this._onDidResetLocal = this._register(new Emitter());
        this.onDidResetLocal = this._onDidResetLocal.event;
        this._onDidResetRemote = this._register(new Emitter());
        this.onDidResetRemote = this._onDidResetRemote.event;
        this.activeProfileSynchronizers = new Map();
        this._status = userDataSyncStoreManagementService.userDataSyncStore ? "idle" /* SyncStatus.Idle */ : "uninitialized" /* SyncStatus.Uninitialized */;
        this._lastSyncTime = this.storageService.getNumber(LAST_SYNC_TIME_KEY, -1 /* StorageScope.APPLICATION */, undefined);
        this._register(toDisposable(() => this.clearActiveProfileSynchronizers()));
        this._register(new RunOnceScheduler(() => this.cleanUpStaleStorageData(), 5 * 1000 /* after 5s */)).schedule();
    }
    async createSyncTask(manifest, disableCache) {
        this.checkEnablement();
        this.logService.info('Sync started.');
        const startTime = new Date().getTime();
        const executionId = generateUuid();
        try {
            const syncHeaders = createSyncHeaders(executionId);
            if (disableCache) {
                syncHeaders['Cache-Control'] = 'no-cache';
            }
            manifest = await this.userDataSyncStoreService.manifest(manifest, syncHeaders);
        }
        catch (error) {
            const userDataSyncError = UserDataSyncError.toUserDataSyncError(error);
            reportUserDataSyncError(userDataSyncError, executionId, this.userDataSyncStoreManagementService, this.telemetryService);
            throw userDataSyncError;
        }
        const executed = false;
        const that = this;
        let cancellablePromise;
        return {
            manifest,
            async run() {
                if (executed) {
                    throw new Error('Can run a task only once');
                }
                cancellablePromise = createCancelablePromise(token => that.sync(manifest, false, executionId, token));
                await cancellablePromise.finally(() => cancellablePromise = undefined);
                that.logService.info(`Sync done. Took ${new Date().getTime() - startTime}ms`);
                that.updateLastSyncTime();
            },
            stop() {
                cancellablePromise?.cancel();
                return that.stop();
            }
        };
    }
    async createManualSyncTask() {
        this.checkEnablement();
        if (this.userDataSyncEnablementService.isEnabled()) {
            throw new UserDataSyncError('Cannot start manual sync when sync is enabled', "LocalError" /* UserDataSyncErrorCode.LocalError */);
        }
        this.logService.info('Sync started.');
        const startTime = new Date().getTime();
        const executionId = generateUuid();
        const syncHeaders = createSyncHeaders(executionId);
        let latestUserDataOrManifest;
        try {
            latestUserDataOrManifest = await this.userDataSyncStoreService.getLatestData(syncHeaders);
        }
        catch (error) {
            const userDataSyncError = UserDataSyncError.toUserDataSyncError(error);
            this.telemetryService.publicLog2('sync.download.latest', {
                code: userDataSyncError.code,
                serverCode: userDataSyncError instanceof UserDataSyncStoreError ? String(userDataSyncError.serverCode) : undefined,
                url: userDataSyncError instanceof UserDataSyncStoreError ? userDataSyncError.url : undefined,
                resource: userDataSyncError.resource,
                executionId,
                service: this.userDataSyncStoreManagementService.userDataSyncStore.url.toString()
            });
            // Fallback to manifest in stable
            try {
                latestUserDataOrManifest = await this.userDataSyncStoreService.manifest(null, syncHeaders);
            }
            catch (error) {
                const userDataSyncError = UserDataSyncError.toUserDataSyncError(error);
                reportUserDataSyncError(userDataSyncError, executionId, this.userDataSyncStoreManagementService, this.telemetryService);
                throw userDataSyncError;
            }
        }
        /* Manual sync shall start on clean local state */
        await this.resetLocal();
        const that = this;
        const cancellableToken = new CancellationTokenSource();
        return {
            id: executionId,
            async merge() {
                return that.sync(latestUserDataOrManifest, true, executionId, cancellableToken.token);
            },
            async apply() {
                try {
                    try {
                        await that.applyManualSync(latestUserDataOrManifest, executionId, cancellableToken.token);
                    }
                    catch (error) {
                        if (UserDataSyncError.toUserDataSyncError(error).code === "MethodNotFound" /* UserDataSyncErrorCode.MethodNotFound */) {
                            that.logService.info('Client is making invalid requests. Cleaning up data...');
                            await that.cleanUpRemoteData();
                            that.logService.info('Applying manual sync again...');
                            await that.applyManualSync(latestUserDataOrManifest, executionId, cancellableToken.token);
                        }
                        else {
                            throw error;
                        }
                    }
                }
                catch (error) {
                    that.logService.error(error);
                    throw error;
                }
                that.logService.info(`Sync done. Took ${new Date().getTime() - startTime}ms`);
                that.updateLastSyncTime();
            },
            async stop() {
                cancellableToken.cancel();
                await that.stop();
                await that.resetLocal();
            }
        };
    }
    async sync(manifestOrLatestData, preview, executionId, token) {
        this._syncErrors = [];
        try {
            if (this.status !== "hasConflicts" /* SyncStatus.HasConflicts */) {
                this.setStatus("syncing" /* SyncStatus.Syncing */);
            }
            // Sync Default Profile First
            const defaultProfileSynchronizer = this.getOrCreateActiveProfileSynchronizer(this.userDataProfilesService.defaultProfile, undefined);
            this._syncErrors.push(...await this.syncProfile(defaultProfileSynchronizer, manifestOrLatestData, preview, executionId, token));
            // Sync other profiles
            const userDataProfileManifestSynchronizer = defaultProfileSynchronizer.enabled.find(s => s.resource === "profiles" /* SyncResource.Profiles */);
            if (userDataProfileManifestSynchronizer) {
                const syncProfiles = (await userDataProfileManifestSynchronizer.getLastSyncedProfiles()) || [];
                if (token.isCancellationRequested) {
                    return;
                }
                await this.syncRemoteProfiles(syncProfiles, manifestOrLatestData, preview, executionId, token);
            }
        }
        finally {
            if (this.status !== "hasConflicts" /* SyncStatus.HasConflicts */) {
                this.setStatus("idle" /* SyncStatus.Idle */);
            }
            this._onSyncErrors.fire(this._syncErrors);
        }
    }
    async syncRemoteProfiles(remoteProfiles, manifest, preview, executionId, token) {
        for (const syncProfile of remoteProfiles) {
            if (token.isCancellationRequested) {
                return;
            }
            const profile = this.userDataProfilesService.profiles.find(p => p.id === syncProfile.id);
            if (!profile) {
                this.logService.error(`Profile with id:${syncProfile.id} and name: ${syncProfile.name} does not exist locally to sync.`);
                continue;
            }
            this.logService.info('Syncing profile.', syncProfile.name);
            const profileSynchronizer = this.getOrCreateActiveProfileSynchronizer(profile, syncProfile);
            this._syncErrors.push(...await this.syncProfile(profileSynchronizer, manifest, preview, executionId, token));
        }
        // Dispose & Delete profile synchronizers which do not exist anymore
        for (const [key, profileSynchronizerItem] of this.activeProfileSynchronizers.entries()) {
            if (this.userDataProfilesService.profiles.some(p => p.id === profileSynchronizerItem[0].profile.id)) {
                continue;
            }
            await profileSynchronizerItem[0].resetLocal();
            profileSynchronizerItem[1].dispose();
            this.activeProfileSynchronizers.delete(key);
        }
    }
    async applyManualSync(manifestOrLatestData, executionId, token) {
        try {
            this.setStatus("syncing" /* SyncStatus.Syncing */);
            const profileSynchronizers = this.getActiveProfileSynchronizers();
            for (const profileSynchronizer of profileSynchronizers) {
                if (token.isCancellationRequested) {
                    return;
                }
                await profileSynchronizer.apply(executionId, token);
            }
            const defaultProfileSynchronizer = profileSynchronizers.find(s => s.profile.isDefault);
            if (!defaultProfileSynchronizer) {
                return;
            }
            const userDataProfileManifestSynchronizer = defaultProfileSynchronizer.enabled.find(s => s.resource === "profiles" /* SyncResource.Profiles */);
            if (!userDataProfileManifestSynchronizer) {
                return;
            }
            // Sync remote profiles which are not synced locally
            const remoteProfiles = (await userDataProfileManifestSynchronizer.getRemoteSyncedProfiles(getRefOrUserData(manifestOrLatestData, undefined, "profiles" /* SyncResource.Profiles */) ?? null)) || [];
            const remoteProfilesToSync = remoteProfiles.filter(remoteProfile => profileSynchronizers.every(s => s.profile.id !== remoteProfile.id));
            if (remoteProfilesToSync.length) {
                await this.syncRemoteProfiles(remoteProfilesToSync, manifestOrLatestData, false, executionId, token);
            }
        }
        finally {
            this.setStatus("idle" /* SyncStatus.Idle */);
        }
    }
    async syncProfile(profileSynchronizer, manifestOrLatestData, preview, executionId, token) {
        const errors = await profileSynchronizer.sync(manifestOrLatestData, preview, executionId, token);
        return errors.map(([syncResource, error]) => ({ profile: profileSynchronizer.profile, syncResource, error }));
    }
    async stop() {
        if (this.status !== "idle" /* SyncStatus.Idle */) {
            await Promise.allSettled(this.getActiveProfileSynchronizers().map(profileSynchronizer => profileSynchronizer.stop()));
        }
    }
    async resolveContent(resource) {
        const content = await this.userDataSyncResourceProviderService.resolveContent(resource);
        if (content) {
            return content;
        }
        for (const profileSynchronizer of this.getActiveProfileSynchronizers()) {
            for (const synchronizer of profileSynchronizer.enabled) {
                const content = await synchronizer.resolveContent(resource);
                if (content) {
                    return content;
                }
            }
        }
        return null;
    }
    async replace(syncResourceHandle) {
        this.checkEnablement();
        const profileSyncResource = this.userDataSyncResourceProviderService.resolveUserDataSyncResource(syncResourceHandle);
        if (!profileSyncResource) {
            return;
        }
        const content = await this.resolveContent(syncResourceHandle.uri);
        if (!content) {
            return;
        }
        await this.performAction(profileSyncResource.profile, async (synchronizer) => {
            if (profileSyncResource.syncResource === synchronizer.resource) {
                await synchronizer.replace(content);
                return true;
            }
            return undefined;
        });
        return;
    }
    async accept(syncResource, resource, content, apply) {
        this.checkEnablement();
        await this.performAction(syncResource.profile, async (synchronizer) => {
            if (syncResource.syncResource === synchronizer.resource) {
                await synchronizer.accept(resource, content);
                if (apply) {
                    await synchronizer.apply(isBoolean(apply) ? false : apply.force, createSyncHeaders(generateUuid()));
                }
                return true;
            }
            return undefined;
        });
    }
    async hasLocalData() {
        const result = await this.performAction(this.userDataProfilesService.defaultProfile, async (synchronizer) => {
            // skip global state synchronizer
            if (synchronizer.resource !== "globalState" /* SyncResource.GlobalState */ && await synchronizer.hasLocalData()) {
                return true;
            }
            return undefined;
        });
        return !!result;
    }
    async hasPreviouslySynced() {
        const result = await this.performAction(this.userDataProfilesService.defaultProfile, async (synchronizer) => {
            if (await synchronizer.hasPreviouslySynced()) {
                return true;
            }
            return undefined;
        });
        return !!result;
    }
    async reset() {
        this.checkEnablement();
        await this.resetRemote();
        await this.resetLocal();
    }
    async resetRemote() {
        this.checkEnablement();
        try {
            await this.userDataSyncStoreService.clear();
            this.logService.info('Cleared data on server');
        }
        catch (e) {
            this.logService.error(e);
        }
        this._onDidResetRemote.fire();
    }
    async resetLocal() {
        this.checkEnablement();
        this._lastSyncTime = undefined;
        this.storageService.remove(LAST_SYNC_TIME_KEY, -1 /* StorageScope.APPLICATION */);
        for (const [synchronizer] of this.activeProfileSynchronizers.values()) {
            try {
                await synchronizer.resetLocal();
            }
            catch (e) {
                this.logService.error(e);
            }
        }
        this.clearActiveProfileSynchronizers();
        this._onDidResetLocal.fire();
        this.logService.info('Did reset the local sync state.');
    }
    async cleanUpStaleStorageData() {
        const allKeys = this.storageService.keys(-1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
        const lastSyncProfileKeys = [];
        for (const key of allKeys) {
            if (!key.endsWith('.lastSyncUserData')) {
                continue;
            }
            const segments = key.split('.');
            if (segments.length === 3) {
                lastSyncProfileKeys.push([key, segments[0]]);
            }
        }
        if (!lastSyncProfileKeys.length) {
            return;
        }
        const disposables = new DisposableStore();
        try {
            let defaultProfileSynchronizer = this.activeProfileSynchronizers.get(this.userDataProfilesService.defaultProfile.id)?.[0];
            if (!defaultProfileSynchronizer) {
                defaultProfileSynchronizer = disposables.add(this.instantiationService.createInstance(ProfileSynchronizer, this.userDataProfilesService.defaultProfile, undefined));
            }
            const userDataProfileManifestSynchronizer = defaultProfileSynchronizer.enabled.find(s => s.resource === "profiles" /* SyncResource.Profiles */);
            if (!userDataProfileManifestSynchronizer) {
                return;
            }
            const lastSyncedProfiles = await userDataProfileManifestSynchronizer.getLastSyncedProfiles();
            const lastSyncedCollections = lastSyncedProfiles?.map(p => p.collection) ?? [];
            for (const [key, collection] of lastSyncProfileKeys) {
                if (!lastSyncedCollections.includes(collection)) {
                    this.logService.info(`Removing last sync state for stale profile: ${collection}`);
                    this.storageService.remove(key, -1 /* StorageScope.APPLICATION */);
                }
            }
        }
        finally {
            disposables.dispose();
        }
    }
    async cleanUpRemoteData() {
        const remoteProfiles = await this.userDataSyncResourceProviderService.getRemoteSyncedProfiles();
        const remoteProfileCollections = remoteProfiles.map(profile => profile.collection);
        const allCollections = await this.userDataSyncStoreService.getAllCollections();
        const redundantCollections = allCollections.filter(c => !remoteProfileCollections.includes(c));
        if (redundantCollections.length) {
            this.logService.info(`Deleting ${redundantCollections.length} redundant collections on server`);
            await Promise.allSettled(redundantCollections.map(collectionId => this.userDataSyncStoreService.deleteCollection(collectionId)));
            this.logService.info(`Deleted redundant collections on server`);
        }
        const updatedRemoteProfiles = remoteProfiles.filter(profile => allCollections.includes(profile.collection));
        if (updatedRemoteProfiles.length !== remoteProfiles.length) {
            const profileManifestSynchronizer = this.instantiationService.createInstance(UserDataProfilesManifestSynchroniser, this.userDataProfilesService.defaultProfile, undefined);
            try {
                this.logService.info('Resetting the last synced state of profiles');
                await profileManifestSynchronizer.resetLocal();
                this.logService.info('Did reset the last synced state of profiles');
                this.logService.info(`Updating remote profiles with invalid collections on server`);
                await profileManifestSynchronizer.updateRemoteProfiles(updatedRemoteProfiles, null);
                this.logService.info(`Updated remote profiles on server`);
            }
            finally {
                profileManifestSynchronizer.dispose();
            }
        }
    }
    async saveRemoteActivityData(location) {
        this.checkEnablement();
        const data = await this.userDataSyncStoreService.getActivityData();
        await this.fileService.writeFile(location, data);
    }
    async extractActivityData(activityDataResource, location) {
        const content = (await this.fileService.readFile(activityDataResource)).value.toString();
        const activityData = JSON.parse(content);
        if (activityData.resources) {
            for (const resource in activityData.resources) {
                for (const version of activityData.resources[resource]) {
                    await this.userDataSyncLocalStoreService.writeResource(resource, version.content, new Date(version.created * 1000), undefined, location);
                }
            }
        }
        if (activityData.collections) {
            for (const collection in activityData.collections) {
                for (const resource in activityData.collections[collection].resources) {
                    for (const version of activityData.collections[collection].resources?.[resource] ?? []) {
                        await this.userDataSyncLocalStoreService.writeResource(resource, version.content, new Date(version.created * 1000), collection, location);
                    }
                }
            }
        }
    }
    async performAction(profile, action) {
        const disposables = new DisposableStore();
        try {
            const activeProfileSyncronizer = this.activeProfileSynchronizers.get(profile.id);
            if (activeProfileSyncronizer) {
                const result = await this.performActionWithProfileSynchronizer(activeProfileSyncronizer[0], action, disposables);
                return isUndefined(result) ? null : result;
            }
            if (profile.isDefault) {
                const defaultProfileSynchronizer = disposables.add(this.instantiationService.createInstance(ProfileSynchronizer, profile, undefined));
                const result = await this.performActionWithProfileSynchronizer(defaultProfileSynchronizer, action, disposables);
                return isUndefined(result) ? null : result;
            }
            const userDataProfileManifestSynchronizer = disposables.add(this.instantiationService.createInstance(UserDataProfilesManifestSynchroniser, profile, undefined));
            const manifest = await this.userDataSyncStoreService.manifest(null);
            const syncProfiles = (await userDataProfileManifestSynchronizer.getRemoteSyncedProfiles(manifest?.latest?.profiles ?? null)) || [];
            const syncProfile = syncProfiles.find(syncProfile => syncProfile.id === profile.id);
            if (syncProfile) {
                const profileSynchronizer = disposables.add(this.instantiationService.createInstance(ProfileSynchronizer, profile, syncProfile.collection));
                const result = await this.performActionWithProfileSynchronizer(profileSynchronizer, action, disposables);
                return isUndefined(result) ? null : result;
            }
            return null;
        }
        finally {
            disposables.dispose();
        }
    }
    async performActionWithProfileSynchronizer(profileSynchronizer, action, disposables) {
        const allSynchronizers = [...profileSynchronizer.enabled, ...profileSynchronizer.disabled.reduce((synchronizers, syncResource) => {
                if (syncResource !== "workspaceState" /* SyncResource.WorkspaceState */) {
                    synchronizers.push(disposables.add(profileSynchronizer.createSynchronizer(syncResource)));
                }
                return synchronizers;
            }, [])];
        for (const synchronizer of allSynchronizers) {
            const result = await action(synchronizer);
            if (!isUndefined(result)) {
                return result;
            }
        }
        return undefined;
    }
    setStatus(status) {
        const oldStatus = this._status;
        if (this._status !== status) {
            this._status = status;
            this._onDidChangeStatus.fire(status);
            if (oldStatus === "hasConflicts" /* SyncStatus.HasConflicts */) {
                this.updateLastSyncTime();
            }
        }
    }
    updateConflicts() {
        const conflicts = this.getActiveProfileSynchronizers().map(synchronizer => synchronizer.conflicts).flat();
        if (!equals(this._conflicts, conflicts, (a, b) => a.profile.id === b.profile.id && a.syncResource === b.syncResource && equals(a.conflicts, b.conflicts, (a, b) => isEqual(a.previewResource, b.previewResource)))) {
            this._conflicts = conflicts;
            this._onDidChangeConflicts.fire(conflicts);
        }
    }
    updateLastSyncTime() {
        if (this.status === "idle" /* SyncStatus.Idle */) {
            this._lastSyncTime = new Date().getTime();
            this.storageService.store(LAST_SYNC_TIME_KEY, this._lastSyncTime, -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
            this._onDidChangeLastSyncTime.fire(this._lastSyncTime);
        }
    }
    getOrCreateActiveProfileSynchronizer(profile, syncProfile) {
        let activeProfileSynchronizer = this.activeProfileSynchronizers.get(profile.id);
        if (activeProfileSynchronizer && activeProfileSynchronizer[0].collection !== syncProfile?.collection) {
            this.logService.error('Profile synchronizer collection does not match with the remote sync profile collection');
            activeProfileSynchronizer[1].dispose();
            activeProfileSynchronizer = undefined;
            this.activeProfileSynchronizers.delete(profile.id);
        }
        if (!activeProfileSynchronizer) {
            const disposables = new DisposableStore();
            const profileSynchronizer = disposables.add(this.instantiationService.createInstance(ProfileSynchronizer, profile, syncProfile?.collection));
            disposables.add(profileSynchronizer.onDidChangeStatus(e => this.setStatus(e)));
            disposables.add(profileSynchronizer.onDidChangeConflicts(conflicts => this.updateConflicts()));
            disposables.add(profileSynchronizer.onDidChangeLocal(e => this._onDidChangeLocal.fire(e)));
            this.activeProfileSynchronizers.set(profile.id, activeProfileSynchronizer = [profileSynchronizer, disposables]);
        }
        return activeProfileSynchronizer[0];
    }
    getActiveProfileSynchronizers() {
        const profileSynchronizers = [];
        for (const [profileSynchronizer] of this.activeProfileSynchronizers.values()) {
            profileSynchronizers.push(profileSynchronizer);
        }
        return profileSynchronizers;
    }
    clearActiveProfileSynchronizers() {
        this.activeProfileSynchronizers.forEach(([, disposable]) => disposable.dispose());
        this.activeProfileSynchronizers.clear();
    }
    checkEnablement() {
        if (!this.userDataSyncStoreManagementService.userDataSyncStore) {
            throw new Error('Not enabled');
        }
    }
};
UserDataSyncService = __decorate([
    __param(0, IFileService),
    __param(1, IUserDataSyncStoreService),
    __param(2, IUserDataSyncStoreManagementService),
    __param(3, IInstantiationService),
    __param(4, IUserDataSyncLogService),
    __param(5, ITelemetryService),
    __param(6, IStorageService),
    __param(7, IUserDataSyncEnablementService),
    __param(8, IUserDataProfilesService),
    __param(9, IUserDataSyncResourceProviderService),
    __param(10, IUserDataSyncLocalStoreService)
], UserDataSyncService);
export { UserDataSyncService };
let ProfileSynchronizer = class ProfileSynchronizer extends Disposable {
    get enabled() { return this._enabled.sort((a, b) => a[1] - b[1]).map(([synchronizer]) => synchronizer); }
    get disabled() { return ALL_SYNC_RESOURCES.filter(syncResource => !this.userDataSyncEnablementService.isResourceEnabled(syncResource)); }
    get status() { return this._status; }
    get conflicts() { return this._conflicts; }
    constructor(profile, collection, userDataSyncEnablementService, instantiationService, extensionGalleryService, userDataSyncStoreManagementService, telemetryService, logService, configurationService) {
        super();
        this.profile = profile;
        this.collection = collection;
        this.userDataSyncEnablementService = userDataSyncEnablementService;
        this.instantiationService = instantiationService;
        this.extensionGalleryService = extensionGalleryService;
        this.userDataSyncStoreManagementService = userDataSyncStoreManagementService;
        this.telemetryService = telemetryService;
        this.logService = logService;
        this.configurationService = configurationService;
        this._enabled = [];
        this._status = "idle" /* SyncStatus.Idle */;
        this._onDidChangeStatus = this._register(new Emitter());
        this.onDidChangeStatus = this._onDidChangeStatus.event;
        this._onDidChangeLocal = this._register(new Emitter());
        this.onDidChangeLocal = this._onDidChangeLocal.event;
        this._conflicts = [];
        this._onDidChangeConflicts = this._register(new Emitter());
        this.onDidChangeConflicts = this._onDidChangeConflicts.event;
        this._register(userDataSyncEnablementService.onDidChangeResourceEnablement(([syncResource, enablement]) => this.onDidChangeResourceEnablement(syncResource, enablement)));
        this._register(toDisposable(() => this._enabled.splice(0, this._enabled.length).forEach(([, , disposable]) => disposable.dispose())));
        for (const syncResource of ALL_SYNC_RESOURCES) {
            if (userDataSyncEnablementService.isResourceEnabled(syncResource)) {
                this.registerSynchronizer(syncResource);
            }
        }
    }
    onDidChangeResourceEnablement(syncResource, enabled) {
        if (enabled) {
            this.registerSynchronizer(syncResource);
        }
        else {
            this.deRegisterSynchronizer(syncResource);
        }
    }
    registerSynchronizer(syncResource) {
        if (this._enabled.some(([synchronizer]) => synchronizer.resource === syncResource)) {
            return;
        }
        if (syncResource === "extensions" /* SyncResource.Extensions */ && !this.extensionGalleryService.isEnabled()) {
            this.logService.info('Skipping extensions sync because gallery is not configured');
            return;
        }
        if (syncResource === "profiles" /* SyncResource.Profiles */) {
            if (!this.profile.isDefault) {
                return;
            }
        }
        if (syncResource === "workspaceState" /* SyncResource.WorkspaceState */) {
            return;
        }
        if (syncResource !== "profiles" /* SyncResource.Profiles */ && this.profile.useDefaultFlags?.[syncResource]) {
            this.logService.debug(`Skipping syncing ${syncResource} in ${this.profile.name} because it is already synced by default profile`);
            return;
        }
        const disposables = new DisposableStore();
        const synchronizer = disposables.add(this.createSynchronizer(syncResource));
        disposables.add(synchronizer.onDidChangeStatus(() => this.updateStatus()));
        disposables.add(synchronizer.onDidChangeConflicts(() => this.updateConflicts()));
        disposables.add(synchronizer.onDidChangeLocal(() => this._onDidChangeLocal.fire(syncResource)));
        const order = this.getOrder(syncResource);
        this._enabled.push([synchronizer, order, disposables]);
    }
    deRegisterSynchronizer(syncResource) {
        const index = this._enabled.findIndex(([synchronizer]) => synchronizer.resource === syncResource);
        if (index !== -1) {
            const [[synchronizer, , disposable]] = this._enabled.splice(index, 1);
            disposable.dispose();
            this.updateStatus();
            synchronizer.stop().then(null, error => this.logService.error(error));
        }
    }
    createSynchronizer(syncResource) {
        switch (syncResource) {
            case "settings" /* SyncResource.Settings */: return this.instantiationService.createInstance(SettingsSynchroniser, this.profile, this.collection);
            case "keybindings" /* SyncResource.Keybindings */: return this.instantiationService.createInstance(KeybindingsSynchroniser, this.profile, this.collection);
            case "snippets" /* SyncResource.Snippets */: return this.instantiationService.createInstance(SnippetsSynchroniser, this.profile, this.collection);
            case "prompts" /* SyncResource.Prompts */: return this.instantiationService.createInstance(PromptsSynchronizer, this.profile, this.collection);
            case "tasks" /* SyncResource.Tasks */: return this.instantiationService.createInstance(TasksSynchroniser, this.profile, this.collection);
            case "mcp" /* SyncResource.Mcp */: return this.instantiationService.createInstance(McpSynchroniser, this.profile, this.collection);
            case "globalState" /* SyncResource.GlobalState */: return this.instantiationService.createInstance(GlobalStateSynchroniser, this.profile, this.collection);
            case "extensions" /* SyncResource.Extensions */: return this.instantiationService.createInstance(ExtensionsSynchroniser, this.profile, this.collection);
            case "profiles" /* SyncResource.Profiles */: return this.instantiationService.createInstance(UserDataProfilesManifestSynchroniser, this.profile, this.collection);
        }
    }
    async sync(manifestOrLatestData, preview, executionId, token) {
        // Return if cancellation is requested
        if (token.isCancellationRequested) {
            return [];
        }
        const synchronizers = this.enabled;
        if (!synchronizers.length) {
            return [];
        }
        try {
            const syncErrors = [];
            const syncHeaders = createSyncHeaders(executionId);
            const userDataSyncConfiguration = preview ? await this.getUserDataSyncConfiguration(manifestOrLatestData) : this.getLocalUserDataSyncConfiguration();
            for (const synchroniser of synchronizers) {
                // Return if cancellation is requested
                if (token.isCancellationRequested) {
                    return [];
                }
                // Return if resource is not enabled
                if (!this.userDataSyncEnablementService.isResourceEnabled(synchroniser.resource)) {
                    return [];
                }
                try {
                    const refOrUserData = getRefOrUserData(manifestOrLatestData, this.collection, synchroniser.resource) ?? null;
                    await synchroniser.sync(refOrUserData, preview, userDataSyncConfiguration, syncHeaders);
                }
                catch (e) {
                    const userDataSyncError = UserDataSyncError.toUserDataSyncError(e);
                    reportUserDataSyncError(userDataSyncError, executionId, this.userDataSyncStoreManagementService, this.telemetryService);
                    if (canBailout(e)) {
                        throw userDataSyncError;
                    }
                    // Log and and continue
                    this.logService.error(e);
                    this.logService.error(`${synchroniser.resource}: ${toErrorMessage(e)}`);
                    syncErrors.push([synchroniser.resource, userDataSyncError]);
                }
            }
            return syncErrors;
        }
        finally {
            this.updateStatus();
        }
    }
    async apply(executionId, token) {
        const syncHeaders = createSyncHeaders(executionId);
        for (const synchroniser of this.enabled) {
            if (token.isCancellationRequested) {
                return;
            }
            try {
                await synchroniser.apply(false, syncHeaders);
            }
            catch (e) {
                const userDataSyncError = UserDataSyncError.toUserDataSyncError(e);
                reportUserDataSyncError(userDataSyncError, executionId, this.userDataSyncStoreManagementService, this.telemetryService);
                if (canBailout(e)) {
                    throw userDataSyncError;
                }
                // Log and and continue
                this.logService.error(e);
                this.logService.error(`${synchroniser.resource}: ${toErrorMessage(e)}`);
            }
        }
    }
    async stop() {
        for (const synchroniser of this.enabled) {
            try {
                if (synchroniser.status !== "idle" /* SyncStatus.Idle */) {
                    await synchroniser.stop();
                }
            }
            catch (e) {
                this.logService.error(e);
            }
        }
    }
    async resetLocal() {
        for (const synchroniser of this.enabled) {
            try {
                await synchroniser.resetLocal();
            }
            catch (e) {
                this.logService.error(`${synchroniser.resource}: ${toErrorMessage(e)}`);
                this.logService.error(e);
            }
        }
    }
    async getUserDataSyncConfiguration(manifestOrLatestData) {
        if (!this.profile.isDefault) {
            return {};
        }
        const local = this.getLocalUserDataSyncConfiguration();
        const settingsSynchronizer = this.enabled.find(synchronizer => synchronizer instanceof SettingsSynchroniser);
        if (settingsSynchronizer) {
            const remote = await settingsSynchronizer.getRemoteUserDataSyncConfiguration(getRefOrUserData(manifestOrLatestData, this.collection, "settings" /* SyncResource.Settings */) ?? null);
            return { ...local, ...remote };
        }
        return local;
    }
    getLocalUserDataSyncConfiguration() {
        return this.configurationService.getValue(USER_DATA_SYNC_CONFIGURATION_SCOPE);
    }
    setStatus(status) {
        if (this._status !== status) {
            this._status = status;
            this._onDidChangeStatus.fire(status);
        }
    }
    updateStatus() {
        this.updateConflicts();
        if (this.enabled.some(s => s.status === "hasConflicts" /* SyncStatus.HasConflicts */)) {
            return this.setStatus("hasConflicts" /* SyncStatus.HasConflicts */);
        }
        if (this.enabled.some(s => s.status === "syncing" /* SyncStatus.Syncing */)) {
            return this.setStatus("syncing" /* SyncStatus.Syncing */);
        }
        return this.setStatus("idle" /* SyncStatus.Idle */);
    }
    updateConflicts() {
        const conflicts = this.enabled.filter(s => s.status === "hasConflicts" /* SyncStatus.HasConflicts */)
            .filter(s => s.conflicts.conflicts.length > 0)
            .map(s => s.conflicts);
        if (!equals(this._conflicts, conflicts, (a, b) => a.syncResource === b.syncResource && equals(a.conflicts, b.conflicts, (a, b) => isEqual(a.previewResource, b.previewResource)))) {
            this._conflicts = conflicts;
            this._onDidChangeConflicts.fire(conflicts);
        }
    }
    getOrder(syncResource) {
        switch (syncResource) {
            case "settings" /* SyncResource.Settings */: return 0;
            case "keybindings" /* SyncResource.Keybindings */: return 1;
            case "snippets" /* SyncResource.Snippets */: return 2;
            case "tasks" /* SyncResource.Tasks */: return 3;
            case "mcp" /* SyncResource.Mcp */: return 4;
            case "globalState" /* SyncResource.GlobalState */: return 5;
            case "extensions" /* SyncResource.Extensions */: return 6;
            case "prompts" /* SyncResource.Prompts */: return 7;
            case "profiles" /* SyncResource.Profiles */: return 8;
            case "workspaceState" /* SyncResource.WorkspaceState */: return 9;
        }
    }
};
ProfileSynchronizer = __decorate([
    __param(2, IUserDataSyncEnablementService),
    __param(3, IInstantiationService),
    __param(4, IExtensionGalleryService),
    __param(5, IUserDataSyncStoreManagementService),
    __param(6, ITelemetryService),
    __param(7, IUserDataSyncLogService),
    __param(8, IConfigurationService)
], ProfileSynchronizer);
function canBailout(e) {
    if (e instanceof UserDataSyncError) {
        switch (e.code) {
            case "MethodNotFound" /* UserDataSyncErrorCode.MethodNotFound */:
            case "TooLarge" /* UserDataSyncErrorCode.TooLarge */:
            case "RemoteTooManyRequests" /* UserDataSyncErrorCode.TooManyRequests */:
            case "TooManyRequestsAndRetryAfter" /* UserDataSyncErrorCode.TooManyRequestsAndRetryAfter */:
            case "LocalTooManyRequests" /* UserDataSyncErrorCode.LocalTooManyRequests */:
            case "LocalTooManyProfiles" /* UserDataSyncErrorCode.LocalTooManyProfiles */:
            case "Gone" /* UserDataSyncErrorCode.Gone */:
            case "UpgradeRequired" /* UserDataSyncErrorCode.UpgradeRequired */:
            case "IncompatibleRemoteContent" /* UserDataSyncErrorCode.IncompatibleRemoteContent */:
            case "IncompatibleLocalContent" /* UserDataSyncErrorCode.IncompatibleLocalContent */:
                return true;
        }
    }
    return false;
}
function reportUserDataSyncError(userDataSyncError, executionId, userDataSyncStoreManagementService, telemetryService) {
    telemetryService.publicLog2('sync/error', {
        code: userDataSyncError.code,
        serverCode: userDataSyncError instanceof UserDataSyncStoreError ? String(userDataSyncError.serverCode) : undefined,
        url: userDataSyncError instanceof UserDataSyncStoreError ? userDataSyncError.url : undefined,
        resource: userDataSyncError.resource,
        executionId,
        service: userDataSyncStoreManagementService.userDataSyncStore.url.toString()
    });
}
function getRefOrUserData(manifestOrLatestData, collection, resource) {
    if (isUserDataManifest(manifestOrLatestData)) {
        if (collection) {
            return manifestOrLatestData?.collections?.[collection]?.latest?.[resource];
        }
        return manifestOrLatestData?.latest?.[resource];
    }
    if (collection) {
        return manifestOrLatestData?.collections?.[collection]?.resources?.[resource];
    }
    return manifestOrLatestData?.resources?.[resource];
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNlckRhdGFTeW5jU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24vdXNlckRhdGFTeW5jU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDeEQsT0FBTyxFQUFxQix1QkFBdUIsRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQzdHLE9BQU8sRUFBcUIsdUJBQXVCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDdEUsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLCtCQUErQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFlLFlBQVksRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzNHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM1RCxPQUFPLEVBQUUsU0FBUyxFQUFFLFdBQVcsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBRXZFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUM1RCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUNwRixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDM0QsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDcEYsT0FBTyxFQUFFLGVBQWUsRUFBK0IsTUFBTSxpQ0FBaUMsQ0FBQztBQUMvRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUs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