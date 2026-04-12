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
import { Disposable, DisposableMap, MutableDisposable, isDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { Storage } from '../../../base/parts/storage/common/storage.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { AbstractStorageService, IStorageService, isProfileUsingDefaultStorage } from '../../storage/common/storage.js';
import { Emitter } from '../../../base/common/event.js';
import { ApplicationStorageDatabaseClient, ProfileStorageDatabaseClient } from '../../storage/common/storageIpc.js';
import { reviveProfile } from './userDataProfile.js';
export const IUserDataProfileStorageService = createDecorator('IUserDataProfileStorageService');
let AbstractUserDataProfileStorageService = class AbstractUserDataProfileStorageService extends Disposable {
    constructor(persistStorages, storageService) {
        super();
        this.storageService = storageService;
        if (persistStorages) {
            this.storageServicesMap = this._register(new DisposableMap());
        }
    }
    async readStorageData(profile) {
        return this.withProfileScopedStorageService(profile, async (storageService) => this.getItems(storageService));
    }
    async updateStorageData(profile, data, target) {
        return this.withProfileScopedStorageService(profile, async (storageService) => this.writeItems(storageService, data, target));
    }
    async withProfileScopedStorageService(profile, fn) {
        if (this.storageService.hasScope(profile)) {
            return fn(this.storageService);
        }
        let storageService = this.storageServicesMap?.get(profile.id);
        if (!storageService) {
            storageService = new StorageService(this.createStorageDatabase(profile));
            this.storageServicesMap?.set(profile.id, storageService);
            try {
                await storageService.initialize();
            }
            catch (error) {
                if (this.storageServicesMap?.has(profile.id)) {
                    this.storageServicesMap.deleteAndDispose(profile.id);
                }
                else {
                    storageService.dispose();
                }
                throw error;
            }
        }
        try {
            const result = await fn(storageService);
            await storageService.flush();
            return result;
        }
        finally {
            if (!this.storageServicesMap?.has(profile.id)) {
                storageService.dispose();
            }
        }
    }
    getItems(storageService) {
        const result = new Map();
        const populate = (target) => {
            for (const key of storageService.keys(0 /* StorageScope.PROFILE */, target)) {
                result.set(key, { value: storageService.get(key, 0 /* StorageScope.PROFILE */), target });
            }
        };
        populate(0 /* StorageTarget.USER */);
        populate(1 /* StorageTarget.MACHINE */);
        return result;
    }
    writeItems(storageService, items, target) {
        storageService.storeAll(Array.from(items.entries()).map(([key, value]) => ({ key, value, scope: 0 /* StorageScope.PROFILE */, target })), true);
    }
};
AbstractUserDataProfileStorageService = __decorate([
    __param(1, IStorageService)
], AbstractUserDataProfileStorageService);
export { AbstractUserDataProfileStorageService };
export class RemoteUserDataProfileStorageService extends AbstractUserDataProfileStorageService {
    constructor(persistStorages, remoteService, userDataProfilesService, storageService, logService) {
        super(persistStorages, storageService);
        this.remoteService = remoteService;
        const channel = remoteService.getChannel('profileStorageListener');
        const disposable = this._register(new MutableDisposable());
        this._onDidChange = this._register(new Emitter({
            // Start listening to profile storage changes only when someone is listening
            onWillAddFirstListener: () => {
                disposable.value = channel.listen('onDidChange')(e => {
                    logService.trace('profile storage changes', e);
                    this._onDidChange.fire({
                        targetChanges: e.targetChanges.map(profile => reviveProfile(profile, userDataProfilesService.profilesHome.scheme)),
                        valueChanges: e.valueChanges.map(e => ({ ...e, profile: reviveProfile(e.profile, userDataProfilesService.profilesHome.scheme) }))
                    });
                });
            },
            // Stop listening to profile storage changes when no one is listening
            onDidRemoveLastListener: () => disposable.value = undefined
        }));
        this.onDidChange = this._onDidChange.event;
    }
    async createStorageDatabase(profile) {
        const storageChannel = this.remoteService.getChannel('storage');
        return isProfileUsingDefaultStorage(profile) ? new ApplicationStorageDatabaseClient(storageChannel) : new ProfileStorageDatabaseClient(storageChannel, profile);
    }
}
class StorageService extends AbstractStorageService {
    constructor(profileStorageDatabase) {
        super({ flushInterval: 100 });
        this.profileStorageDatabase = profileStorageDatabase;
    }
    async doInitialize() {
        const profileStorageDatabase = await this.profileStorageDatabase;
        const profileStorage = new Storage(profileStorageDatabase);
        this._register(profileStorage.onDidChangeStorage(e => {
            this.emitDidChangeValue(0 /* StorageScope.PROFILE */, e);
        }));
        this._register(toDisposable(() => {
            profileStorage.close();
            profileStorage.dispose();
            if (isDisposable(profileStorageDatabase)) {
                profileStorageDatabase.dispose();
            }
        }));
        this.profileStorage = profileStorage;
        return this.profileStorage.init();
    }
    getStorage(scope) {
        return scope === 0 /* StorageScope.PROFILE */ ? this.profileStorage : undefined;
    }
    getLogDetails() { return undefined; }
    async switchToProfile() { }
    async switchToWorkspace() { }
    hasScope() { return false; }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNlckRhdGFQcm9maWxlU3RvcmFnZVNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZVN0b3JhZ2VTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsYUFBYSxFQUFFLGlCQUFpQixFQUFFLFlBQVksRUFBRSxZQUFZLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM3SCxPQUFPLEVBQThCLE9BQU8sRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ3BHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsZUFBZSxFQUF5RCw0QkFBNEIsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQy9LLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSwrQkFBK0IsQ0FBQztBQUcvRCxPQUFPLEVBQUUsZ0NBQWdDLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNwSCxPQUFPLEVBQThDLGFBQWEsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBaUJqRyxNQUFNLENBQUMsTUFBTSw4QkFBOEIsR0FBRyxlQUFlLENBQWlDLGdDQUFnQyxDQUFDLENBQUM7QUE2QnpILElBQWUscUNBQXFDLEdBQXBELE1BQWUscUNBQXNDLFNBQVEsVUFBVTtJQVE3RSxZQUNDLGVBQXdCLEVBQ1ksY0FBK0I7UUFFbkUsS0FBSyxFQUFFLENBQUM7UUFGNEIsbUJBQWMsR0FBZCxjQUFjLENBQWlCO1FBR25FLElBQUksZUFBZSxFQUFFLENBQUM7WUFDckIsSUFBSSxDQUFDLGtCQUFrQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxhQUFhLEVBQTBCLENB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