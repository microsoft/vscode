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
import { IStorageService } from '../../../platform/storage/common/storage.js';
import { MainContext, ExtHostContext } from '../common/extHost.protocol.js';
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { isWeb } from '../../../base/common/platform.js';
import { IExtensionStorageService } from '../../../platform/extensionManagement/common/extensionStorage.js';
import { migrateExtensionStorage } from '../../services/extensions/common/extensionStorageMigration.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../platform/log/common/log.js';
let MainThreadStorage = class MainThreadStorage {
    constructor(extHostContext, _extensionStorageService, _storageService, _instantiationService, _logService) {
        this._extensionStorageService = _extensionStorageService;
        this._storageService = _storageService;
        this._instantiationService = _instantiationService;
        this._logService = _logService;
        this._storageListener = new DisposableStore();
        this._sharedStorageKeysToWatch = new Map();
        this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostStorage);
        this._storageListener.add(this._storageService.onDidChangeValue(0 /* StorageScope.PROFILE */, undefined, this._storageListener)(e => {
            if (this._sharedStorageKeysToWatch.has(e.key)) {
                const rawState = this._extensionStorageService.getExtensionStateRaw(e.key, true);
                if (typeof rawState === 'string') {
                    this._proxy.$acceptValue(true, e.key, rawState);
                }
            }
        }));
    }
    dispose() {
        this._storageListener.dispose();
    }
    async $initializeExtensionStorage(shared, extensionId) {
        await this.checkAndMigrateExtensionStorage(extensionId, shared);
        if (shared) {
            this._sharedStorageKeysToWatch.set(extensionId, true);
        }
        return this._extensionStorageService.getExtensionStateRaw(extensionId, shared);
    }
    async $setValue(shared, key, value) {
        this._extensionStorageService.setExtensionState(key, value, shared);
    }
    $registerExtensionStorageKeysToSync(extension, keys) {
        this._extensionStorageService.setKeysForSync(extension, keys);
    }
    async checkAndMigrateExtensionStorage(extensionId, shared) {
        try {
            let sourceExtensionId = this._extensionStorageService.getSourceExtensionToMigrate(extensionId);
            // TODO: @sandy081 - Remove it after 6 months
            // If current extension does not have any migration requested
            // Then check if the extension has to be migrated for using lower case in web
            // If so, migrate the extension state from lower case id to its normal id.
            if (!sourceExtensionId && isWeb && extensionId !== extensionId.toLowerCase()) {
                sourceExtensionId = extensionId.toLowerCase();
            }
            if (sourceExtensionId) {
                // TODO: @sandy081 - Remove it after 6 months
                // In Web, extension state was used to be stored in lower case extension id.
                // Hence check that if the lower cased source extension was not yet migrated in web
                // If not take the lower cased source extension id for migration
                if (isWeb && sourceExtensionId !== sourceExtensionId.toLowerCase() && this._extensionStorageService.getExtensionState(sourceExtensionId.toLowerCase(), shared) && !this._extensionStorageService.getExtensionState(sourceExtensionId, shared)) {
                    sourceExtensionId = sourceExtensionId.toLowerCase();
                }
                await migrateExtensionStorage(sourceExtensionId, extensionId, shared, this._instantiationService);
            }
        }
        catch (error) {
            this._logService.error(error);
        }
    }
};
MainThreadStorage = __decorate([
    extHostNamedCustomer(MainContext.MainThreadStorage),
    __param(1, IExtensionStorageService),
    __param(2, IStorageService),
    __param(3, IInstantiationService),
    __param(4, ILogService)
], MainThreadStorage);
export { MainThreadStorage };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZFN0b3JhZ2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL2Jyb3dzZXIvbWFpblRocmVhZFN0b3JhZ2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGVBQWUsRUFBZ0IsTUFBTSw2Q0FBNkMsQ0FBQztBQUM1RixPQUFPLEVBQTBCLFdBQVcsRUFBdUIsY0FBYyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDekgsT0FBTyxFQUFFLG9CQUFvQixFQUFtQixNQUFNLHNEQUFzRCxDQUFDO0FBQzdHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekQsT0FBTyxFQUEyQix3QkFBd0IsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBQ3JJLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3hHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUczRCxJQUFNLGlCQUFpQixHQUF2QixNQUFNLGlCQUFpQjtJQU03QixZQUNDLGNBQStCLEVBQ0wsd0JBQW1FLEVBQzVFLGVBQWlELEVBQzNDLHFCQUE2RCxFQUN2RSxXQUF5QztRQUhYLDZCQUF3QixHQUF4Qix3QkFBd0IsQ0FBMEI7UUFDM0Qsb0JBQWUsR0FBZixlQUFlLENBQWlCO1FBQzFCLDBCQUFxQixHQUFyQixxQkFBcUIsQ0FBdUI7UUFDdEQsZ0JBQVcsR0FBWCxXQUFXLENBQWE7UUFSdEMscUJBQWdCLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztRQUN6Qyw4QkFBeUIsR0FBeUIsSUFBSSxHQUFHLEVBQW1CLENBQUM7UUFTN0YsSUFBSSxDQUFDLE1BQU0sR0FBRyxjQUFjLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUVyRSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsZ0JBQWdCLCtCQUF1QixTQUFTLEVBQUUsSUFBSSxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDM0gsSUFBSSxJQUFJLENBQUMseUJBQXlCLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUMvQyxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsd0JBQXdCLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FBQztnQkFDakYsSUFBSSxPQUFPLFFBQVEsS0FBSyxRQUFRLEVBQUUsQ0FBQztvQkFDbEMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxHQUFHLEVBQUUsUUFBUSxDQUFDLENBQUM7Z0JBQ2pELENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFRCxPQUFPO1FBQ04sSUFBSSxDQUFDLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ2pDLENBQUM7SUFFRCxLQUFLLENBQUMsMkJBQTJCLENBQUMsTUFBZSxFQUFFLFdBQW1CO1FBRXJFLE1BQU0sSUFBSSxDQUFDLCtCQUErQixDQUFDLFdBQVcsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUVoRSxJQUFJLE1BQU0sRUFBRSxDQUFDO1lBQ1osSUFBSSxDQUFDLHlCQUF5QixDQUFDLEdBQUcsQ0FBQyxXQUFXLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDdkQsQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDLHdCQUF3QixDQUFDLG9CQUFvQixDQUFDLFdBQVcsRUFBRSxNQUFNLENBQUMsQ0FBQztJQUNoRixDQUFDO0lBRUQsS0FBSyxDQUFDLFNBQVMsQ0FBQyxNQUFlLEVBQUUsR0FBVyxFQUFFLEtBQWE7UUFDMUQsSUFBSSxDQUFDLHdCQUF3QixDQUFDLGlCQUFpQixDQUFDLEdBQUcsRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFDckUsQ0FBQztJQUVELG1DQUFtQyxDQUFDLFNBQWtDLEVBQUUsSUFBYztRQUNyRixJQUFJLENBQUMsd0JBQXdCLENBQUMsY0FBYyxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUMvRCxDQUFDO0lBRU8sS0FBSyxDQUFDLCtCQUErQixDQUFDLFdBQW1CLEVBQUUsTUFBZTtRQUNqRixJQUFJLENBQUM7WUFDSixJQUFJLGlCQUFpQixHQUFHLElBQUksQ0FBQyx3QkFBd0IsQ0FBQywyQkFBMkIsQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUUvRiw2Q0FBNkM7WUFDN0MsNkRBQTZEO1lBQzdELDZFQUE2RTtZQUM3RSwwRUFBMEU7WUFDMUUsSUFBSSxDQUFDLGlCQUFpQixJQUFJLEtBQUssSUFBSSxXQUFXLEtBQUssV0FBVyxDQUFDLFdBQVcsRUFBRSxFQUFFLENBQUM7Z0JBQzlFLGlCQUFpQixHQUFHLFdBQVcsQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUMvQyxDQUFDO1lBRUQsSUFBSSxpQkFBaUIsRUFBRSxDQUFDO2dCQUN2Qiw2Q0FBNkM7Z0JBQzdDLDRFQUE0RTtnQkFDNUUsbUZBQW1GO2dCQUNuRixnRUFBZ0U7Z0JBQ2hFLElBQUksS0FBSyxJQUFJLGlCQUFpQixLQUFLLGlCQUFpQixDQUFDLFdBQVcsRUFBRSxJQUFJLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxpQkFBaUIsQ0FBQyxpQkFBaUIsQ0FBQyxXQUFXLEVBQUUsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxpQkFBaUIsQ0FBQyxpQkFBaUIsRUFBRSxNQUFNLENBQUMsRUFBRSxDQUFDO29CQUMvTyxpQkFBaUIsR0FBRyxpQkFBaUIsQ0FBQyxXQUFXLEVBQUUsQ0FBQztnQkFDckQsQ0FBQztnQkFDRCxNQUFNLHVCQUF1QixDQUFDLGlCQUFpQixFQUFFLFdBQVcsRUFBRSxNQUFNLEVBQUUsSUFBSSxDQUFDLHFCQUFxQixDQUFDLENBQUM7WUFDbkcsQ0FBQztRQUNGLENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2hCLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQy9CLENBQUM7SUFDRixDQUFDO0NBQ0QsQ0FBQTtBQXpFWSxpQkFBaUI7SUFEN0Isb0JBQW9CLENBQUMsV0FBVyxDQUFDLGlCQUFpQixDQUFDO0lBU2pELFdBQUEsd0JBQXdCLENBQUE7SUFDeEIsV0FBQSxlQUFlLENBQUE7SUFDZixXQUFBLHFCQUFxQixDQUFBO0lBQ3JCLFdBQUEsV0FBVyxDQUFBO0dBWEQsaUJBQWlCLENBeUU3QiJ9