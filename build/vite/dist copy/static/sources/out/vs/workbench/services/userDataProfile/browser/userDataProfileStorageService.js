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
import { Emitter, Event } from '../../../../base/common/event.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { AbstractUserDataProfileStorageService, IUserDataProfileStorageService } from '../../../../platform/userDataProfile/common/userDataProfileStorageService.js';
import { isProfileUsingDefaultStorage, IStorageService } from '../../../../platform/storage/common/storage.js';
import { IndexedDBStorageDatabase } from '../../storage/browser/storageService.js';
import { IUserDataProfileService } from '../common/userDataProfile.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
let UserDataProfileStorageService = class UserDataProfileStorageService extends AbstractUserDataProfileStorageService {
    constructor(storageService, userDataProfileService, logService) {
        super(true, storageService);
        this.userDataProfileService = userDataProfileService;
        this.logService = logService;
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        const disposables = this._register(new DisposableStore());
        this._register(Event.filter(storageService.onDidChangeTarget, e => e.scope === 0 /* StorageScope.PROFILE */, disposables)(() => this.onDidChangeStorageTargetInCurrentProfile()));
        this._register(storageService.onDidChangeValue(0 /* StorageScope.PROFILE */, undefined, disposables)(e => this.onDidChangeStorageValueInCurrentProfile(e)));
    }
    onDidChangeStorageTargetInCurrentProfile() {
        // Not broadcasting changes to other windows/tabs as it is not required in web.
        // Revisit if needed in future.
        this._onDidChange.fire({ targetChanges: [this.userDataProfileService.currentProfile], valueChanges: [] });
    }
    onDidChangeStorageValueInCurrentProfile(e) {
        // Not broadcasting changes to other windows/tabs as it is not required in web
        // Revisit if needed in future.
        this._onDidChange.fire({ targetChanges: [], valueChanges: [{ profile: this.userDataProfileService.currentProfile, changes: [e] }] });
    }
    createStorageDatabase(profile) {
        return isProfileUsingDefaultStorage(profile) ? IndexedDBStorageDatabase.createApplicationStorage(this.logService) : IndexedDBStorageDatabase.createProfileStorage(profile, this.logService);
    }
};
UserDataProfileStorageService = __decorate([
    __param(0, IStorageService),
    __param(1, IUserDataProfileService),
    __param(2, ILogService)
], UserDataProfileStorageService);
export { UserDataProfileStorageService };
registerSingleton(IUserDataProfileStorageService, UserDataProfileStorageService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNlckRhdGFQcm9maWxlU3RvcmFnZVNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvdXNlckRhdGFQcm9maWxlL2Jyb3dzZXIvdXNlckRhdGFQcm9maWxlU3RvcmFnZVNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUVsRSxPQUFPLEVBQXFCLGlCQUFpQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDL0csT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxxQ0FBcUMsRUFBMEIsOEJBQThCLEVBQUUsTUFBTSw4RUFBOEUsQ0FBQztBQUM3TCxPQUFPLEVBQW1DLDRCQUE0QixFQUFFLGVBQWUsRUFBZ0IsTUFBTSxnREFBZ0QsQ0FBQztBQUU5SixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNuRixPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUN2RSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFaEUsSUFBTSw2QkFBNkIsR0FBbkMsTUFBTSw2QkFBOEIsU0FBUSxxQ0FBcUM7SUFLdkYsWUFDa0IsY0FBK0IsRUFDdkIsc0JBQWdFLEVBQzVFLFVBQXdDO1FBRXJELEtBQUssQ0FBQyxJQUFJLEVBQUUsY0FBYyxDQUFDLENBQUM7UUFIYywyQkFBc0IsR0FBdEIsc0JBQXNCLENBQXlCO1FBQzNELGVBQVUsR0FBVixVQUFVLENBQWE7UUFOckMsaUJBQVksR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUEwQixDQUFDLENBQUM7UUFDN0UsZ0JBQVcsR0FBa0MsSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUM7UUFRN0UsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLGVBQWUsRUFBRSxDQUFDLENBQUM7UUFDMUQsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxpQkFBaUIsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLGlDQUF5QixFQUFFLFdBQVcsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyx3Q0FBd0MsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMxSyxJQUFJLENBQUMsU0FBUyxDQUFDLGNBQWMsQ0FBQyxnQkFBZ0IsK0JBQXVCLFNBQVMsRUFBRSxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyx1Q0FBdUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDckosQ0FBQztJQUVPLHdDQUF3QztRQUMvQywrRUFBK0U7UUFDL0UsK0JBQStCO1FBQy9CLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLEVBQUUsYUFBYSxFQUFFLENBQUMsSUFBSSxDQUFDLHNCQUFzQixDQUFDLGNBQWMsQ0FBQyxFQUFFLFlBQVksRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQzNHLENBQUM7SUFFTyx1Q0FBdUMsQ0FBQyxDQUFrQztRQUNqRiw4RUFBOEU7UUFDOUUsK0JBQStCO1FBQy9CLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLEVBQUUsYUFBYSxFQUFFLEVBQUUsRUFBRSxZQUFZLEVBQUUsQ0FBQyxFQUFFLE9BQU8sRUFBRSxJQUFJLENBQUMsc0JBQXNCLENBQUMsY0FBYyxFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDdEksQ0FBQztJQUVTLHFCQUFxQixDQUFDLE9BQXlCO1FBQ3hELE9BQU8sNEJBQTRCLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLHdCQUF3QixDQUFDLHdCQUF3QixDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsd0JBQXdCLENBQUMsb0JBQW9CLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztJQUM3TCxDQUFDO0NBQ0QsQ0FBQTtBQS9CWSw2QkFBNkI7SUFNdkMsV0FBQSxlQUFlLENBQUE7SUFDZixXQUFBLHVCQUF1QixDQUFBO0lBQ3ZCLFdBQUEsV0FBVyxDQUFBO0dBUkQsNkJBQTZCLENBK0J6Qzs7QUFFRCxpQkFBaUIsQ0FBQyw4QkFBOEIsRUFBRSw2QkFBNkIsb0NBQTRCLENBQUMifQ==