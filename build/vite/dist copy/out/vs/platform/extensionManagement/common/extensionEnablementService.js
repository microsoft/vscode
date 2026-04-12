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
import { isUndefinedOrNull } from '../../../base/common/types.js';
import { DISABLED_EXTENSIONS_STORAGE_PATH, IExtensionManagementService } from './extensionManagement.js';
import { areSameExtensions } from './extensionManagementUtil.js';
import { IStorageService } from '../../storage/common/storage.js';
let GlobalExtensionEnablementService = class GlobalExtensionEnablementService extends Disposable {
    constructor(storageService, extensionManagementService) {
        super();
        this._onDidChangeEnablement = this._register(new Emitter());
        this.onDidChangeEnablement = this._onDidChangeEnablement.event;
        this.storageManager = this._register(new StorageManager(storageService));
        this._register(this.storageManager.onDidChange(extensions => this._onDidChangeEnablement.fire({ extensions, source: 'storage' })));
        this._register(extensionManagementService.onDidInstallExtensions(e => e.forEach(({ local, operation }) => {
            if (local && operation === 4 /* InstallOperation.Migrate */) {
                this._removeFromDisabledExtensions(local.identifier); /* Reset migrated extensions */
            }
        })));
    }
    async enableExtension(extension, source) {
        if (this._removeFromDisabledExtensions(extension)) {
            this._onDidChangeEnablement.fire({ extensions: [extension], source });
            return true;
        }
        return false;
    }
    async disableExtension(extension, source) {
        if (this._addToDisabledExtensions(extension)) {
            this._onDidChangeEnablement.fire({ extensions: [extension], source });
            return true;
        }
        return false;
    }
    getDisabledExtensions() {
        return this._getExtensions(DISABLED_EXTENSIONS_STORAGE_PATH);
    }
    async getDisabledExtensionsAsync() {
        return this.getDisabledExtensions();
    }
    _addToDisabledExtensions(identifier) {
        const disabledExtensions = this.getDisabledExtensions();
        if (disabledExtensions.every(e => !areSameExtensions(e, identifier))) {
            disabledExtensions.push(identifier);
            this._setDisabledExtensions(disabledExtensions);
            return true;
        }
        return false;
    }
    _removeFromDisabledExtensions(identifier) {
        const disabledExtensions = this.getDisabledExtensions();
        for (let index = 0; index < disabledExtensions.length; index++) {
            const disabledExtension = disabledExtensions[index];
            if (areSameExtensions(disabledExtension, identifier)) {
                disabledExtensions.splice(index, 1);
                this._setDisabledExtensions(disabledExtensions);
                return true;
            }
        }
        return false;
    }
    _setDisabledExtensions(disabledExtensions) {
        this._setExtensions(DISABLED_EXTENSIONS_STORAGE_PATH, disabledExtensions);
    }
    _getExtensions(storageId) {
        return this.storageManager.get(storageId, 0 /* StorageScope.PROFILE */);
    }
    _setExtensions(storageId, extensions) {
        this.storageManager.set(storageId, extensions, 0 /* StorageScope.PROFILE */);
    }
};
GlobalExtensionEnablementService = __decorate([
    __param(0, IStorageService),
    __param(1, IExtensionManagementService)
], GlobalExtensionEnablementService);
export { GlobalExtensionEnablementService };
export class StorageManager extends Disposable {
    constructor(storageService) {
        super();
        this.storageService = storageService;
        this.storage = Object.create(null);
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this._register(storageService.onDidChangeValue(0 /* StorageScope.PROFILE */, undefined, this._store)(e => this.onDidStorageChange(e)));
    }
    get(key, scope) {
        let value;
        if (scope === 0 /* StorageScope.PROFILE */) {
            if (isUndefinedOrNull(this.storage[key])) {
                this.storage[key] = this._get(key, scope);
            }
            value = this.storage[key];
        }
        else {
            value = this._get(key, scope);
        }
        return JSON.parse(value);
    }
    set(key, value, scope) {
        const newValue = JSON.stringify(value.map(({ id, uuid }) => ({ id, uuid })));
        const oldValue = this._get(key, scope);
        if (oldValue !== newValue) {
            if (scope === 0 /* StorageScope.PROFILE */) {
                if (value.length) {
                    this.storage[key] = newValue;
                }
                else {
                    delete this.storage[key];
                }
            }
            this._set(key, value.length ? newValue : undefined, scope);
        }
    }
    onDidStorageChange(storageChangeEvent) {
        if (!isUndefinedOrNull(this.storage[storageChangeEvent.key])) {
            const newValue = this._get(storageChangeEvent.key, storageChangeEvent.scope);
            if (newValue !== this.storage[storageChangeEvent.key]) {
                const oldValues = this.get(storageChangeEvent.key, storageChangeEvent.scope);
                delete this.storage[storageChangeEvent.key];
                const newValues = this.get(storageChangeEvent.key, storageChangeEvent.scope);
                const added = oldValues.filter(oldValue => !newValues.some(newValue => areSameExtensions(oldValue, newValue)));
                const removed = newValues.filter(newValue => !oldValues.some(oldValue => areSameExtensions(oldValue, newValue)));
                if (added.length || removed.length) {
                    this._onDidChange.fire([...added, ...removed]);
                }
            }
        }
    }
    _get(key, scope) {
        return this.storageService.get(key, scope, '[]');
    }
    _set(key, value, scope) {
        if (value) {
            // Enablement state is synced separately through extensions
            this.storageService.store(key, value, scope, 1 /* StorageTarget.MACHINE */);
        }
        else {
            this.storageService.remove(key, scope);
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25FbmFibGVtZW50U2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sK0JBQStCLENBQUM7QUFDL0QsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ2xFLE9BQU8sRUFBRSxnQ0FBZ0MsRUFBd0IsMkJBQTJCLEVBQXVELE1BQU0sMEJBQTBCLENBQUM7QUFDcEwsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDakUsT0FBTyxFQUFtQyxlQUFlLEVBQStCLE1BQU0saUNBQWlDLENBQUM7QUFFekgsSUFBTSxnQ0FBZ0MsR0FBdEMsTUFBTSxnQ0FBaUMsU0FBUSxVQUFVO0lBUS9ELFlBQ2tCLGNBQStCLEVBQ25CLDBCQUF1RDtRQUVwRixLQUFLLEVBQUUsQ0FBQztRQVJELDJCQUFzQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQTZFLENBQUMsQ0FBQztRQUNqSSwwQkFBcUIsR0FBcUYsSUFBSSxDQUFDLHNCQUFzQixDQUFDLEtBQUssQ0FBQztRQVFwSixJQUFJLENBQUMsY0FBYyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxjQUFjLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQztRQUN6RSxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLHNCQUFz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