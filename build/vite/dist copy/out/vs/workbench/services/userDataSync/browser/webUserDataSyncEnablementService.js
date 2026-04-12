/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IUserDataSyncEnablementService } from '../../../../platform/userDataSync/common/userDataSync.js';
import { UserDataSyncEnablementService } from './userDataSyncEnablementService.js';
export class WebUserDataSyncEnablementService extends UserDataSyncEnablementService {
    constructor() {
        super(...arguments);
        this.enabled = undefined;
    }
    canToggleEnablement() {
        return this.isTrusted() && super.canToggleEnablement();
    }
    isEnabled() {
        if (!this.isTrusted()) {
            return false;
        }
        if (this.enabled === undefined) {
            this.enabled = this.workbenchEnvironmentService.options?.settingsSyncOptions?.enabled;
        }
        if (this.enabled === undefined) {
            this.enabled = super.isEnabled();
        }
        return this.enabled;
    }
    setEnablement(enabled) {
        if (enabled && !this.canToggleEnablement()) {
            return;
        }
        if (this.enabled !== enabled) {
            this.enabled = enabled;
            super.setEnablement(enabled);
        }
    }
    getResourceSyncStateVersion(resource) {
        return resource === "extensions" /* SyncResource.Extensions */ ? this.workbenchEnvironmentService.options?.settingsSyncOptions?.extensionsSyncStateVersion : undefined;
    }
    isTrusted() {
        return !!this.workbenchEnvironmentService.options?.workspaceProvider?.trusted;
    }
}
registerSingleton(IUserDataSyncEnablementService, WebUserDataSyncEnablementService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2ViVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvdXNlckRhdGFTeW5jL2Jyb3dzZXIvd2ViVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQy9HLE9BQU8sRUFBRSw4QkFBOEIsRUFBZ0IsTUFBTSwwREFBMEQsQ0FBQztBQUN4SCxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUVuRixNQUFNLE9BQU8sZ0NBQWlDLFNBQVEsNkJBQTZCO0lBQW5GOztRQUVTLFlBQU8sR0FBd0IsU0FBUyxDQUFDO0lBcUNsRCxDQUFDO0lBbkNTLG1CQUFtQjtRQUMzQixPQUFPLElBQUksQ0FBQyxTQUFTLEVBQUUsSUFBSSxLQUFLLENBQUMsbUJBQW1CLEVBQUUsQ0FBQztJQUN4RCxDQUFDO0lBRVEsU0FBUztRQUNqQixJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxFQUFFLENBQUM7WUFDdkIsT0FBTyxLQUFLLENBQUM7UUFDZCxDQUFDO1FBQ0QsSUFBSSxJQUFJLENBQUMsT0FBTyxLQUFLLFNBQVMsRUFBRSxDQUFDO1lBQ2hDLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDLDJCQUEyQixDQUFDLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxPQUFPLENBQUM7UUFDdkYsQ0FBQztRQUNELElBQUksSUFBSSxDQUFDLE9BQU8sS0FBSyxTQUFTLEVBQUUsQ0FBQztZQUNoQyxJQUFJLENBQUMsT0FBTyxHQUFHLEtBQUssQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUNsQyxDQUFDO1FBQ0QsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDO0lBQ3JCLENBQUM7SUFFUSxhQUFhLENBQUMsT0FBZ0I7UUFDdEMsSUFBSSxPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsbUJBQW1CLEVBQUUsRUFBRSxDQUFDO1lBQzVDLE9BQU87UUFDUixDQUFDO1FBQ0QsSUFBSSxJQUFJLENBQUMsT0FBTyxLQUFLLE9BQU8sRUFBRSxDQUFDO1lBQzlCLElBQUksQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDO1lBQ3ZCLEtBQUssQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDOUIsQ0FBQztJQUNGLENBQUM7SUFFUSwyQkFBMkIsQ0FBQyxRQUFzQjtRQUMxRCxPQUFPLFFBQVEsK0NBQTRCLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQywyQkFBMkIsQ0FBQyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsMEJBQTBCLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztJQUNySixDQUFDO0lBRU8sU0FBUztRQUNoQixPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsMkJBQTJCLENBQUMsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE9BQU8sQ0FBQztJQUMvRSxDQUFDO0NBRUQ7QUFFRCxpQkFBaUIsQ0FBQyw4QkFBOEIsRUFBRSxnQ0FBZ0Msb0NBQTRCLENBQUMifQ==