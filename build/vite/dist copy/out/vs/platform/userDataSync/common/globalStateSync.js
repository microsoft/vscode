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
import { VSBuffer } from '../../../base/common/buffer.js';
import { getErrorMessage } from '../../../base/common/errors.js';
import { Event } from '../../../base/common/event.js';
import { parse } from '../../../base/common/json.js';
import { toFormattedString } from '../../../base/common/jsonFormatter.js';
import { isWeb } from '../../../base/common/platform.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { IFileService } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { getServiceMachineId } from '../../externalServices/common/serviceMachineId.js';
import { IStorageService } from '../../storage/common/storage.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';
import { AbstractInitializer, AbstractSynchroniser, getSyncResourceLogLabel, isSyncData } from './abstractSynchronizer.js';
import { edit } from './content.js';
import { merge } from './globalStateMerge.js';
import { ALL_SYNC_RESOURCES, createSyncHeaders, getEnablementKey, IUserDataSyncLocalStoreService, IUserDataSyncLogService, IUserDataSyncEnablementService, IUserDataSyncStoreService, SYNC_SERVICE_URL_TYPE, UserDataSyncError, USER_DATA_SYNC_SCHEME } from './userDataSync.js';
import { IUserDataProfilesService } from '../../userDataProfile/common/userDataProfile.js';
import { IUserDataProfileStorageService } from '../../userDataProfile/common/userDataProfileStorageService.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
const argvStoragePrefx = 'globalState.argv.';
const argvProperties = ['locale'];
export function stringify(globalState, format) {
    const storageKeys = globalState.storage ? Object.keys(globalState.storage).sort() : [];
    const storage = {};
    storageKeys.forEach(key => storage[key] = globalState.storage[key]);
    globalState.storage = storage;
    return format ? toFormattedString(globalState, {}) : JSON.stringify(globalState);
}
const GLOBAL_STATE_DATA_VERSION = 1;
/**
 * Synchronises global state that includes
 * 	- Global storage with user scope
 * 	- Locale from argv properties
 *
 * Global storage is synced without checking version just like other resources (settings, keybindings).
 * If there is a change in format of the value of a storage key which requires migration then
 * 		Owner of that key should remove that key from user scope and replace that with new user scoped key.
 */
let GlobalStateSynchroniser = class GlobalStateSynchroniser extends AbstractSynchroniser {
    constructor(profile, collection, userDataProfileStorageService, fileService, userDataSyncStoreService, userDataSyncLocalStoreService, logService, environmentService, userDataSyncEnablementService, telemetryService, configurationService, storageService, uriIdentityService, instantiationService) {
        super({ syncResource: "globalState" /* SyncResource.GlobalState */, profile }, collection, fileService, environmentService, storageService, userDataSyncStoreService, userDataSyncLocalStoreService, userDataSyncEnablementService, telemetryService, logService, configurationService, uriIdentityService);
        this.userDataProfileStorageService = userDataProfileStorageService;
        this.version = GLOBAL_STATE_DATA_VERSION;
        this.previewResource = this.extUri.joinPath(this.syncPreviewFolder, 'globalState.json');
        this.baseResource = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'base' });
        this.localResource = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'local' });
        this.remoteResource = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'remote' });
        this.acceptedResource = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'accepted' });
        this.localGlobalStateProvider = instantiationService.createInstance(LocalGlobalStateProvider);
        this._register(fileService.watch(this.extUri.dirname(this.environmentService.argvResource)));
        this._register(Event.any(
        /* Locale change */
        Event.filter(fileService.onDidFilesChange, e => e.contains(this.environmentService.argvResource)), Event.filter(userDataProfileStorageService.onDidChange, e => {
            /* StorageTarget has changed in profile storage */
            if (e.targetChanges.some(profile => this.syncResource.profile.id === profile.id)) {
                return true;
            }
            /* User storage data has changed in profile storage */
            if (e.valueChanges.some(({ profile, changes }) => this.syncResource.profile.id === profile.id && changes.some(change => change.target === 0 /* StorageTarget.USER */))) {
                return true;
            }
            return false;
        }))((() => this.triggerLocalChange())));
    }
    async generateSyncPreview(remoteUserData, lastSyncUserData, isRemoteDataFromCurrentMachine) {
        const remoteGlobalState = remoteUserData.syncData ? JSON.parse(remoteUserData.syncData.content) : null;
        // Use remote data as last sync data if last sync data does not exist and remote data is from same machine
        lastSyncUserData = lastSyncUserData === null && isRemoteDataFromCurrentMachine ? remoteUserData : lastSyncUserData;
        const lastSyncGlobalState = lastSyncUserData && lastSyncUserData.syncData ? JSON.parse(lastSyncUserData.syncData.content) : null;
        const localGlobalState = await this.localGlobalStateProvider.getLocalGlobalState(this.syncResource.profile);
        if (remoteGlobalState) {
            this.logService.trace(`${this.syncResourceLogLabel}: Merging remote ui state with local ui state...`);
        }
        else {
            this.logService.trace(`${this.syncResourceLogLabel}: Remote ui state does not exist. Synchronizing ui state for the first time.`);
        }
        const storageKeys = await this.getStorageKeys(lastSyncGlobalState);
        const { local, remote } = merge(localGlobalState.storage, remoteGlobalState ? remoteGlobalState.storage : null, lastSyncGlobalState ? lastSyncGlobalState.storage : null, storageKeys, this.logService);
        const previewResult = {
            content: null,
            local,
            remote,
            localChange: Object.keys(local.added).length > 0 || Object.keys(local.updated).length > 0 || local.removed.length > 0 ? 2 /* Change.Modified */ : 0 /* Change.None */,
            remoteChange: remote.all !== null ? 2 /* Change.Modified */ : 0 /* Change.None */,
        };
        const localContent = stringify(localGlobalState, false);
        return [{
                baseResource: this.baseResource,
                baseContent: lastSyncGlobalState ? stringify(lastSyncGlobalState, false) : localContent,
                localResource: this.localResource,
                localContent,
                localUserData: localGlobalState,
                remoteResource: this.remoteResource,
                remoteContent: remoteGlobalState ? stringify(remoteGlobalState, false) : null,
                previewResource: this.previewResource,
                previewResult,
                localChange: previewResult.localChange,
                remoteChange: previewResult.remoteChange,
                acceptedResource: this.acceptedResource,
                storageKeys
            }];
    }
    async hasRemoteChanged(lastSyncUserData) {
        const lastSyncGlobalState = lastSyncUserData.syncData ? JSON.parse(lastSyncUserData.syncData.content) : null;
        if (lastSyncGlobalState === null) {
            return true;
        }
        const localGlobalState = await this.localGlobalStateProvider.getLocalGlobalState(this.syncResource.profile);
        const storageKeys = await this.getStorageKeys(lastSyncGlobalState);
        const { remote } = merge(localGlobalState.storage, lastSyncGlobalState.storage, lastSyncGlobalState.storage, storageKeys, this.logService);
        return remote.all !== null;
    }
    async getMergeResult(resourcePreview, token) {
        return { ...resourcePreview.previewResult, hasConflicts: false };
    }
    async getAcceptResult(resourcePreview, resource, content, token) {
        /* Accept local resource */
        if (this.extUri.isEqual(resource, this.localResource)) {
            return this.acceptLocal(resourcePreview);
        }
        /* Accept remote resource */
        if (this.extUri.isEqual(resource, this.remoteResource)) {
            return this.acceptRemote(resourcePreview);
        }
        /* Accept preview resource */
        if (this.extUri.isEqual(resource, this.previewResource)) {
            return resourcePreview.previewResult;
        }
        throw new Error(`Invalid Resource: ${resource.toString()}`);
    }
    async acceptLocal(resourcePreview) {
        if (resourcePreview.remoteContent !== null) {
            const remoteGlobalState = JSON.parse(resourcePreview.remoteContent);
            const { local, remote } = merge(resourcePreview.localUserData.storage, remoteGlobalState.storage, remoteGlobalState.storage, resourcePreview.storageKeys, this.logService);
            return {
                content: resourcePreview.remoteContent,
                local,
                remote,
                localChange: 0 /* Change.None */,
                remoteChange: remote.all !== null ? 2 /* Change.Modified */ : 0 /* Change.None */,
            };
        }
        else {
            return {
                content: resourcePreview.localContent,
                local: { added: {}, removed: [], updated: {} },
                remote: { added: Object.keys(resourcePreview.localUserData.storage), removed: [], updated: [], all: resourcePreview.localUserData.storage },
                localChange: 0 /* Change.None */,
                remoteChange: 2 /* Change.Modified */,
            };
        }
    }
    async acceptRemote(resourcePreview) {
        if (resourcePreview.remoteContent !== null) {
            const remoteGlobalState = JSON.parse(resourcePreview.remoteContent);
            const { local, remote } = merge(resourcePreview.localUserData.storage, remoteGlobalState.storage, resourcePreview.localUserData.storage, resourcePreview.storageKeys, this.logService);
            return {
                content: resourcePreview.remoteContent,
                local,
                remote,
                localChange: Object.keys(local.added).length > 0 || Object.keys(local.updated).length > 0 || local.removed.length > 0 ? 2 /* Change.Modified */ : 0 /* Change.None */,
                remoteChange: 0 /* Change.None */,
            };
        }
        else {
            return {
                content: resourcePreview.remoteContent,
                local: { added: {}, removed: [], updated: {} },
                remote: { added: [], removed: [], updated: [], all: null },
                localChange: 0 /* Change.None */,
                remoteChange: 0 /* Change.None */,
            };
        }
    }
    async applyResult(remoteUserData, lastSyncUserData, resourcePreviews, force) {
        const { localUserData } = resourcePreviews[0][0];
        const { local, remote, localChange, remoteChange } = resourcePreviews[0][1];
        if (localChange === 0 /* Change.None */ && remoteChange === 0 /* Change.None */) {
            this.logService.info(`${this.syncResourceLogLabel}: No changes found during synchronizing ui state.`);
        }
        if (localChange !== 0 /* Change.None */) {
            // update local
            this.logService.trace(`${this.syncResourceLogLabel}: Updating local ui state...`);
            await this.backupLocal(JSON.stringify(localUserData));
            await this.localGlobalStateProvider.writeLocalGlobalState(local, this.syncResource.profile);
            this.logService.info(`${this.syncResourceLogLabel}: Updated local ui state`);
        }
        if (remoteChange !== 0 /* Change.None */) {
            // update remote
            this.logService.trace(`${this.syncResourceLogLabel}: Updating remote ui state...`);
            const content = JSON.stringify({ storage: remote.all });
            remoteUserData = await this.updateRemoteUserData(content, force ? null : remoteUserData.ref);
            this.logService.info(`${this.syncResourceLogLabel}: Updated remote ui state.${remote.added.length ? ` Added: ${remote.added}.` : ''}${remote.updated.length ? ` Updated: ${remote.updated}.` : ''}${remote.removed.length ? ` Removed: ${remote.removed}.` : ''}`);
        }
        if (lastSyncUserData?.ref !== remoteUserData.ref) {
            // update last sync
            this.logService.trace(`${this.syncResourceLogLabel}: Updating last synchronized ui state...`);
            await this.updateLastSyncUserData(remoteUserData);
            this.logService.info(`${this.syncResourceLogLabel}: Updated last synchronized ui state`);
        }
    }
    async resolveContent(uri) {
        if (this.extUri.isEqual(this.remoteResource, uri)
            || this.extUri.isEqual(this.baseResource, uri)
            || this.extUri.isEqual(this.localResource, uri)
            || this.extUri.isEqual(this.acceptedResource, uri)) {
            const content = await this.resolvePreviewContent(uri);
            return content ? stringify(JSON.parse(content), true) : content;
        }
        return null;
    }
    async hasLocalData() {
        try {
            const { storage } = await this.localGlobalStateProvider.getLocalGlobalState(this.syncResource.profile);
            if (Object.keys(storage).length > 1 || storage[`${argvStoragePrefx}.locale`]?.value !== 'en') {
                return true;
            }
        }
        catch (error) {
            /* ignore error */
        }
        return false;
    }
    async getStorageKeys(lastSyncGlobalState) {
        const storageData = await this.userDataProfileStorageService.readStorageData(this.syncResource.profile);
        const user = [], machine = [];
        for (const [key, value] of storageData) {
            if (value.target === 0 /* StorageTarget.USER */) {
                user.push(key);
            }
            else if (value.target === 1 /* StorageTarget.MACHINE */) {
                machine.push(key);
            }
        }
        const registered = [...user, ...machine];
        const unregistered = lastSyncGlobalState?.storage ? Object.keys(lastSyncGlobalState.storage).filter(key => !key.startsWith(argvStoragePrefx) && !registered.includes(key) && storageData.get(key) !== undefined) : [];
        if (!isWeb) {
            // Following keys are synced only in web. Do not sync these keys in other platforms
            const keysSyncedOnlyInWeb = [...ALL_SYNC_RESOURCES.map(resource => getEnablementKey(resource)), SYNC_SERVICE_URL_TYPE];
            unregistered.push(...keysSyncedOnlyInWeb);
            machine.push(...keysSyncedOnlyInWeb);
        }
        return { user, machine, unregistered };
    }
};
GlobalStateSynchroniser = __decorate([
    __param(2, IUserDataProfileStorageService),
    __param(3, IFileService),
    __param(4, IUserDataSyncStoreService),
    __param(5, IUserDataSyncLocalStoreService),
    __param(6, IUserDataSyncLogService),
    __param(7, IEnvironmentService),
    __param(8, IUserDataSyncEnablementService),
    __param(9, ITelemetryService),
    __param(10, IConfigurationService),
    __param(11, IStorageService),
    __param(12, IUriIdentityService),
    __param(13, IInstantiationService)
], GlobalStateSynchroniser);
export { GlobalStateSynchroniser };
let LocalGlobalStateProvider = class LocalGlobalStateProvider {
    constructor(fileService, environmentService, userDataProfileStorageService, logService) {
        this.fileService = fileService;
        this.environmentService = environmentService;
        this.userDataProfileStorageService = userDataProfileStorageService;
        this.logService = logService;
    }
    async getLocalGlobalState(profile) {
        const storage = {};
        if (profile.isDefault) {
            const argvContent = await this.getLocalArgvContent();
            const argvValue = parse(argvContent);
            for (const argvProperty of argvProperties) {
                if (argvValue[argvProperty] !== undefined) {
                    storage[`${argvStoragePrefx}${argvProperty}`] = { version: 1, value: argvValue[argvProperty] };
                }
            }
        }
        const storageData = await this.userDataProfileStorageService.readStorageData(profile);
        for (const [key, value] of storageData) {
            if (value.value && value.target === 0 /* StorageTarget.USER */) {
                storage[key] = { version: 1, value: value.value };
            }
        }
        return { storage };
    }
    async getLocalArgvContent() {
        try {
            this.logService.debug('GlobalStateSync#getLocalArgvContent', this.environmentService.argvResource);
            const content = await this.fileService.readFile(this.environmentService.argvResource);
            this.logService.debug('GlobalStateSync#getLocalArgvContent - Resolved', this.environmentService.argvResource);
            return content.value.toString();
        }
        catch (error) {
            this.logService.debug(getErrorMessage(error));
        }
        return '{}';
    }
    async writeLocalGlobalState({ added, removed, updated }, profile) {
        const syncResourceLogLabel = getSyncResourceLogLabel("globalState" /* SyncResource.GlobalState */, profile);
        const argv = {};
        const updatedStorage = new Map();
        const storageData = await this.userDataProfileStorageService.readStorageData(profile);
        const handleUpdatedStorage = (keys, storage) => {
            for (const key of keys) {
                if (key.startsWith(argvStoragePrefx)) {
                    argv[key.substring(argvStoragePrefx.length)] = storage ? storage[key].value : undefined;
                    continue;
                }
                if (storage) {
                    const storageValue = storage[key];
                    if (storageValue.value !== storageData.get(key)?.value) {
                        updatedStorage.set(key, storageValue.value);
                    }
                }
                else {
                    if (storageData.get(key) !== undefined) {
                        updatedStorage.set(key, undefined);
                    }
                }
            }
        };
        handleUpdatedStorage(Object.keys(added), added);
        handleUpdatedStorage(Object.keys(updated), updated);
        handleUpdatedStorage(removed);
        if (Object.keys(argv).length) {
            this.logService.trace(`${syncResourceLogLabel}: Updating locale...`);
            const argvContent = await this.getLocalArgvContent();
            let content = argvContent;
            for (const argvProperty of Object.keys(argv)) {
                content = edit(content, [argvProperty], argv[argvProperty], {});
            }
            if (argvContent !== content) {
                this.logService.trace(`${syncResourceLogLabel}: Updating locale...`);
                await this.fileService.writeFile(this.environmentService.argvResource, VSBuffer.fromString(content));
                this.logService.info(`${syncResourceLogLabel}: Updated locale.`);
            }
            this.logService.info(`${syncResourceLogLabel}: Updated locale`);
        }
        if (updatedStorage.size) {
            this.logService.trace(`${syncResourceLogLabel}: Updating global state...`);
            await this.userDataProfileStorageService.updateStorageData(profile, updatedStorage, 0 /* StorageTarget.USER */);
            this.logService.info(`${syncResourceLogLabel}: Updated global state`, [...updatedStorage.keys()]);
        }
    }
};
LocalGlobalStateProvider = __decorate([
    __param(0, IFileService),
    __param(1, IEnvironmentService),
    __param(2, IUserDataProfileStorageService),
    __param(3, IUserDataSyncLogService)
], LocalGlobalStateProvider);
export { LocalGlobalStateProvider };
let GlobalStateInitializer = class GlobalStateInitializer extends AbstractInitializer {
    constructor(storageService, fileService, userDataProfilesService, environmentService, logService, uriIdentityService) {
        super("globalState" /* SyncResource.GlobalState */, userDataProfilesService, environmentService, logService, fileService, storageService, uriIdentityService);
    }
    async doInitialize(remoteUserData) {
        const remoteGlobalState = remoteUserData.syncData ? JSON.parse(remoteUserData.syncData.content) : null;
        if (!remoteGlobalState) {
            this.logService.info('Skipping initializing global state because remote global state does not exist.');
            return;
        }
        const argv = {};
        const storage = {};
        for (const key of Object.keys(remoteGlobalState.storage)) {
            if (key.startsWith(argvStoragePrefx)) {
                argv[key.substring(argvStoragePrefx.length)] = remoteGlobalState.storage[key].value;
            }
            else {
                if (this.storageService.get(key, 0 /* StorageScope.PROFILE */) === undefined) {
                    storage[key] = remoteGlobalState.storage[key].value;
                }
            }
        }
        if (Object.keys(argv).length) {
            let content = '{}';
            try {
                const fileContent = await this.fileService.readFile(this.environmentService.argvResource);
                content = fileContent.value.toString();
            }
            catch (error) { }
            for (const argvProperty of Object.keys(argv)) {
                content = edit(content, [argvProperty], argv[argvProperty], {});
            }
            await this.fileService.writeFile(this.environmentService.argvResource, VSBuffer.fromString(content));
        }
        if (Object.keys(storage).length) {
            const storageEntries = [];
            for (const key of Object.keys(storage)) {
                storageEntries.push({ key, value: storage[key], scope: 0 /* StorageScope.PROFILE */, target: 0 /* StorageTarget.USER */ });
            }
            this.storageService.storeAll(storageEntries, true);
        }
    }
};
GlobalStateInitializer = __decorate([
    __param(0, IStorageService),
    __param(1, IFileService),
    __param(2, IUserDataProfilesService),
    __param(3, IEnvironmentService),
    __param(4, IUserDataSyncLogService),
    __param(5, IUriIdentityService)
], GlobalStateInitializer);
export { GlobalStateInitializer };
let UserDataSyncStoreTypeSynchronizer = class UserDataSyncStoreTypeSynchronizer {
    constructor(userDataSyncStoreClient, storageService, environmentService, fileService, logService) {
        this.userDataSyncStoreClient = userDataSyncStoreClient;
        this.storageService = storageService;
        this.environmentService = environmentService;
        this.fileService = fileService;
        this.logService = logService;
    }
    getSyncStoreType(userData) {
        const remoteGlobalState = this.parseGlobalState(userData);
        return remoteGlobalState?.storage[SYNC_SERVICE_URL_TYPE]?.value;
    }
    async sync(userDataSyncStoreType) {
        const syncHeaders = createSyncHeaders(generateUuid());
        try {
            return await this.doSync(userDataSyncStoreType, syncHeaders);
        }
        catch (e) {
            if (e instanceof UserDataSyncError) {
                switch (e.code) {
                    case "PreconditionFailed" /* UserDataSyncErrorCode.PreconditionFailed */:
                        this.logService.info(`Failed to synchronize UserDataSyncStoreType as there is a new remote version available. Synchronizing again...`);
                        return this.doSync(userDataSyncStoreType, syncHeaders);
                }
            }
            throw e;
        }
    }
    async doSync(userDataSyncStoreType, syncHeaders) {
        // Read the global state from remote
        const globalStateUserData = await this.userDataSyncStoreClient.readResource("globalState" /* SyncResource.GlobalState */, null, undefined, syncHeaders);
        const remoteGlobalState = this.parseGlobalState(globalStateUserData) || { storage: {} };
        // Update the sync store type
        remoteGlobalState.storage[SYNC_SERVICE_URL_TYPE] = { value: userDataSyncStoreType, version: GLOBAL_STATE_DATA_VERSION };
        // Write the global state to remote
        const machineId = await getServiceMachineId(this.environmentService, this.fileService, this.storageService);
        const syncDataToUpdate = { version: GLOBAL_STATE_DATA_VERSION, machineId, content: stringify(remoteGlobalState, false) };
        await this.userDataSyncStoreClient.writeResource("globalState" /* SyncResource.GlobalState */, JSON.stringify(syncDataToUpdate), globalStateUserData.ref, undefined, syncHeaders);
    }
    parseGlobalState({ content }) {
        if (!content) {
            return null;
        }
        const syncData = JSON.parse(content);
        if (isSyncData(syncData)) {
            return syncData ? JSON.parse(syncData.content) : null;
        }
        throw new Error('Invalid remote data');
    }
};
UserDataSyncStoreTypeSynchronizer = __decorate([
    __param(1, IStorageService),
    __param(2, IEnvironmentService),
    __param(3, IFileService),
    __param(4, ILogService)
], UserDataSyncStoreTypeSynchronizer);
export { UserDataSyncStoreTypeSynchronizer };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2xvYmFsU3RhdGVTeW5jLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vdXNlckRhdGFTeW5jL2NvbW1vbi9nbG9iYWxTdGF0ZVN5bmMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBRzFELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDdEQsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ3JELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUV6RCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFFNUQsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDcEYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDOUUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQzNELE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUN0RCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUN4RixPQUFPLEVBQWlCLGVBQWUsRUFBK0IsTUFBTSxpQ0FBaUMsQ0FBQztBQUM5RyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUN4RSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsb0JBQW9C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