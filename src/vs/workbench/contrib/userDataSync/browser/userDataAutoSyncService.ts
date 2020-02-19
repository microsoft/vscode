/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUserDataSyncService, IUserDataSyncLogService, IUserDataAuthTokenService, IUserDataSyncEnablementService } from 'vs/platform/userDataSync/common/userDataSync';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { Event } from 'vs/base/common/event';
import { UserDataAutoSyncService as BaseUserDataAutoSyncService } from 'vs/platform/userDataSync/common/userDataAutoSyncService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { UserDataSyncTrigger } from 'vs/workbench/contrib/userDataSync/browser/userDataSyncTrigger';
import { IHostService } from 'vs/workbench/services/host/browser/host';

export class UserDataAutoSyncService extends BaseUserDataAutoSyncService {

	constructor(
		@IUserDataSyncEnablementService userDataSyncEnablementService: IUserDataSyncEnablementService,
		@IUserDataSyncService userDataSyncService: IUserDataSyncService,
		@IConfigurationService configurationService: IConfigurationService,
		@IUserDataSyncLogService logService: IUserDataSyncLogService,
		@IUserDataAuthTokenService authTokenService: IUserDataAuthTokenService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IHostService hostService: IHostService,
	) {
		super(userDataSyncEnablementService, userDataSyncService, logService, authTokenService);

		// Sync immediately if there is a local change.
		this._register(Event.debounce(Event.any<any>(
			userDataSyncService.onDidChangeLocal,
			instantiationService.createInstance(UserDataSyncTrigger).onDidTriggerSync,
			hostService.onDidChangeFocus
		), () => undefined, 500)(() => this.triggerAutoSync()));
	}

}
