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
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { isWeb } from '../../../base/common/platform.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { IStorageService } from '../../storage/common/storage.js';
import { ALL_SYNC_RESOURCES, getEnablementKey, IUserDataSyncStoreManagementService } from './userDataSync.js';
const enablementKey = 'sync.enable';
let UserDataSyncEnablementService = class UserDataSyncEnablementService extends Disposable {
    constructor(storageService, environmentService, userDataSyncStoreManagementService) {
        super();
        this.storageService = storageService;
        this.environmentService = environmentService;
        this.userDataSyncStoreManagementService = userDataSyncStoreManagementService;
        this._onDidChangeEnablement = this._register(new Emitter());
        this.onDidChangeEnablement = this._onDidChangeEnablement.event;
        this._onDidChangeResourceEnablement = this._register(new Emitter());
        this.onDidChangeResourceEnablement = this._onDidChangeResourceEnablement.event;
        this._register(storageService.onDidChangeValue(-1 /* StorageScope.APPLICATION */, undefined, this._store)(e => this.onDidStorageChange(e)));
    }
    isEnabled() {
        switch (this.environmentService.sync) {
            case 'on':
                return true;
            case 'off':
                return false;
        }
        return this.storageService.getBoolean(enablementKey, -1 /* StorageScope.APPLICATION */, false);
    }
    canToggleEnablement() {
        return this.userDataSyncStoreManagementService.userDataSyncStore !== undefined && this.environmentService.sync === undefined;
    }
    setEnablement(enabled) {
        if (enabled && !this.canToggleEnablement()) {
            return;
        }
        this.storageService.store(enablementKey, enabled, -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
    }
    isResourceEnabled(resource, defaultValue) {
        const storedValue = this.storageService.getBoolean(getEnablementKey(resource), -1 /* StorageScope.APPLICATION */);
        defaultValue = defaultValue ?? resource !== "prompts" /* SyncResource.Prompts */;
        return storedValue ?? defaultValue;
    }
    isResourceEnablementConfigured(resource) {
        const storedValue = this.storageService.getBoolean(getEnablementKey(resource), -1 /* StorageScope.APPLICATION */);
        return (storedValue !== undefined);
    }
    setResourceEnablement(resource, enabled) {
        if (this.isResourceEnabled(resource) !== enabled) {
            const resourceEnablementKey = getEnablementKey(resource);
            this.storeResourceEnablement(resourceEnablementKey, enabled);
        }
    }
    getResourceSyncStateVersion(resource) {
        return undefined;
    }
    storeResourceEnablement(resourceEnablementKey, enabled) {
        this.storageService.store(resourceEnablementKey, enabled, -1 /* StorageScope.APPLICATION */, isWeb ? 0 /* StorageTarget.USER */ : 1 /* StorageTarget.MACHINE */);
    }
    onDidStorageChange(storageChangeEvent) {
        if (enablementKey === storageChangeEvent.key) {
            this._onDidChangeEnablement.fire(this.isEnabled());
            return;
        }
        const resourceKey = ALL_SYNC_RESOURCES.filter(resourceKey => getEnablementKey(resourceKey) === storageChangeEvent.key)[0];
        if (resourceKey) {
            this._onDidChangeResourceEnablement.fire([resourceKey, this.isResourceEnabled(resourceKey)]);
            return;
        }
    }
};
UserDataSyncEnablementService = __decorate([
    __param(0, IStorageService),
    __param(1, IEnvironmentService),
    __param(2, IUserDataSyncStoreManagementService)
], UserDataSyncEnablementService);
export { UserDataSyncEnablementService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS91c2VyRGF0YVN5bmMvY29tbW9uL3VzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSwrQkFBK0IsQ0FBQztBQUMvRCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDL0QsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pELE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzlFLE9BQU8sRUFBdUMsZUFBZSxFQUErQixNQUFNLGlDQUFpQyxDQUFDO0FBQ3BJLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxnQkFBZ0IsRUFBa0MsbUNBQW1DLEVBQWdCLE1BQU0sbUJBQW1CLENBQUM7QUFFNUosTUFBTSxhQUFhLEdBQUcsYUFBYSxDQUFDO0FBRTdCLElBQU0sNkJBQTZCLEdBQW5DLE1BQU0sNkJBQThCLFNBQVEsVUFBVTtJQVU1RCxZQUNrQixjQUFnRCxFQUM1QyxrQkFBMEQsRUFDMUMsa0NBQXdGO1FBRTdILEtBQUssRUFBRSxDQUFDO1FBSjBCLG1CQUFjLEdBQWQsY0FBYyxDQUFpQjtRQUN6Qix1QkFBa0IsR0FBbEIsa0JBQWtCLENBQXFCO1FBQ3pCLHVDQUFrQyxHQUFsQyxrQ0FBa0MsQ0FBcUM7UUFUdEgsMkJBQXNCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBVyxDQUFDLENBQUM7UUFDL0QsMEJBQXFCLEdBQW1CLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxLQUFLLENBQUM7UUFFM0UsbUNBQThCLEdBQUcsSUFBSSxDQUFD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