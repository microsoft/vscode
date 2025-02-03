/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IUserDataSyncEnablementService, SyncResource } from '../../../../platform/userDataSync/common/userDataSync.js';
import { UserDataSyncEnablementService as BaseUserDataSyncEnablementService } from '../../../../platform/userDataSync/common/userDataSyncEnablementService.js';
import { IBrowserWorkbenchEnvironmentService } from '../../environment/browser/environmentService.js';

export class UserDataSyncEnablementService extends BaseUserDataSyncEnablementService implements IUserDataSyncEnablementService {

	protected get workbenchEnvironmentService(): IBrowserWorkbenchEnvironmentService { return <IBrowserWorkbenchEnvironmentService>this.environmentService; }

	override getResourceSyncStateVersion(resource: SyncResource): string | undefined {
		return resource === SyncResource.Extensions ? this.workbenchEnvironmentService.options?.settingsSyncOptions?.extensionsSyncStateVersion : undefined;
	}

}

registerSingleton(IUserDataSyncEnablementService, UserDataSyncEnablementService, InstantiationType.Delayed);
