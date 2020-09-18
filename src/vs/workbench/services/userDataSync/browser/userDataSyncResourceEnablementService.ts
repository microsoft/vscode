/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUserDataSyncResourceEnablementService, SyncResource } from 'vs/platform/userDataSync/common/userDataSync';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { UserDataSyncResourceEnablementService } from 'vs/platform/userDataSync/common/userDataSyncResourceEnablementService';
import { IExtensionManagementServerService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

export class WebUserDataSyncResourceEnablementService extends UserDataSyncResourceEnablementService implements IUserDataSyncResourceEnablementService {

	constructor(
		@IStorageService storageService: IStorageService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IExtensionManagementServerService private readonly extensionManagementServerService: IExtensionManagementServerService,
	) {
		super(storageService, telemetryService);
	}

	protected getDefaultResourceEnablementValue(resource: SyncResource): boolean {
		if (resource === SyncResource.Extensions) {
			// In Web, disable syncing extensions by default when there is a remote server
			return !this.extensionManagementServerService.remoteExtensionManagementServer;
		}
		return super.getDefaultResourceEnablementValue(resource);
	}

}

registerSingleton(IUserDataSyncResourceEnablementService, WebUserDataSyncResourceEnablementService);
