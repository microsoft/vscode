/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IUserDataSyncEnablementService } from '../../../../platform/userDataSync/common/userDataSync.js';
import { UserDataSyncEnablementService as BaseUserDataSyncEnablementService } from '../../../../platform/userDataSync/common/userDataSyncEnablementService.js';
export class UserDataSyncEnablementService extends BaseUserDataSyncEnablementService {
    get workbenchEnvironmentService() { return this.environmentService; }
    getResourceSyncStateVersion(resource) {
        return resource === "extensions" /* SyncResource.Extensions */ ? this.workbenchEnvironmentService.options?.settingsSyncOptions?.extensionsSyncStateVersion : undefined;
    }
}
registerSingleton(IUserDataSyncEnablementService, UserDataSyncEnablementService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvdXNlckRhdGFTeW5jL2Jyb3dzZXIvdXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQy9HLE9BQU8sRUFBRSw4QkFBOEIsRUFBZ0IsTUFBTSwwREFBMEQsQ0FBQztBQUN4SCxPQUFPLEVBQUUsNkJBQTZCLElBQUksaUNBQWlDLEVBQUUsTUFBTSwyRUFBMkUsQ0FBQztBQUcvSixNQUFNLE9BQU8sNkJBQThCLFNBQVEsaUNBQWlDO0lBRW5GLElBQWMsMkJBQTJCLEtBQTBDLE9BQTRDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUM7SUFFaEosMkJBQTJCLENBQUMsUUFBc0I7UUFDMUQsT0FBTyxRQUFRLCtDQUE0QixDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsMkJBQTJCLENBQUMsT0FBTyxFQUFFLG1CQUFtQixFQUFFLDBCQUEwQixDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7SUFDckosQ0FBQztDQUVEO0FBRUQsaUJBQWlCLENBQUMsOEJBQThCLEVBQUUsNkJBQTZCLG9DQUE0QixDQUFDIn0=