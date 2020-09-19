/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUserDataSyncResourceEnablementService, SyncResource } from 'vs/platform/userDataSync/common/userDataSync';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { UserDataSyncResourceEnablementService } from 'vs/platform/userDataSync/common/userDataSyncResourceEnablementService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { isWeb } from 'vs/base/common/platform';

export class WebUserDataSyncResourceEnablementService extends UserDataSyncResourceEnablementService implements IUserDataSyncResourceEnablementService {

	constructor(
		@IStorageService storageService: IStorageService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super(storageService, telemetryService);
	}

	protected getDefaultResourceEnablementValue(resource: SyncResource): boolean {
		// disable syncing extensions by default in web
		if (resource === SyncResource.Extensions && isWeb) {
			return false;
		}
		return super.getDefaultResourceEnablementValue(resource);
	}

}

registerSingleton(IUserDataSyncResourceEnablementService, WebUserDataSyncResourceEnablementService);
