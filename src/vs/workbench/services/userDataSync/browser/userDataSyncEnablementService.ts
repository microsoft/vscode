/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IUserDataSyncEnablementService, SyncResource } from 'vs/platform/userDataSync/common/userDataSync';
import { UserDataSyncEnablementService as BaseUserDataSyncEnablementService } from 'vs/platform/userDataSync/common/userDataSyncEnablementService';
import { IBrowserWorkbenchEnvironmentService } from 'vs/workbench/services/environment/browser/environmentService';

export class UserDataSyncEnablementService extends BaseUserDataSyncEnablementService implements IUserDataSyncEnablementService {

	protected get workbenchEnvironmentService(): IBrowserWorkbenchEnvironmentService { return <IBrowserWorkbenchEnvironmentService>this.environmentService; }

	override getResourceSyncStateVersion(resource: SyncResource): string | undefined {
		return resource === SyncResource.Extensions ? this.workbenchEnvironmentService.options?.settingsSyncOptions?.extensionsSyncStateVersion : undefined;
	}

}

registerSingleton(IUserDataSyncEnablementService, UserDataSyncEnablementService, true);
