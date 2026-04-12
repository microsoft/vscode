/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { RemoteStorageService } from '../../../../platform/storage/common/storageService.js';
export class NativeWorkbenchStorageService extends RemoteStorageService {
    constructor(workspace, userDataProfileService, userDataProfilesService, mainProcessService, environmentService) {
        super(workspace, { currentProfile: userDataProfileService.currentProfile, defaultProfile: userDataProfilesService.defaultProfile }, mainProcessService, environmentService);
        this.userDataProfileService = userDataProfileService;
        this.registerListeners();
    }
    registerListeners() {
        this._register(this.userDataProfileService.onDidChangeCurrentProfile(e => e.join(this.switchToProfile(e.profile))));
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RvcmFnZVNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvc3RvcmFnZS9lbGVjdHJvbi1icm93c2VyL3N0b3JhZ2VTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBSWhHLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBSzdGLE1BQU0sT0FBTyw2QkFBOEIsU0FBUSxvQkFBb0I7SUFFdEUsWUFDQyxTQUE4QyxFQUM3QixzQkFBK0MsRUFDaEUsdUJBQWlELEVBQ2pELGtCQUF1QyxFQUN2QyxrQkFBdUM7UUFFdkMsS0FBSyxDQUFDLFNBQVMsRUFBRSxFQUFFLGNBQWMsRUFBRSxzQkFBc0IsQ0FBQyxjQUFjLEVBQUUsY0FBYyxFQUFFLHVCQUF1QixDQUFDLGNBQWMsRUFBRSxFQUFFLGtCQUFrQixFQUFFLGtCQUFrQixDQUFDLENBQUM7UUFMM0osMkJBQXNCLEdBQXRCLHNCQUFzQixDQUF5QjtRQU9oRSxJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztJQUMxQixDQUFDO0lBRU8saUJBQWlCO1FBQ3hCLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLHNCQUFzQixDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNySCxDQUFDO0NBQ0QifQ==