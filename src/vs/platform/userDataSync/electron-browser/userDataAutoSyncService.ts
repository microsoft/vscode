/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUserDataSyncService, IUserDataSyncLogService, IUserDataAuthTokenService, IUserDataSyncEnablementService } from 'vs/platform/userDataSync/common/userDataSync';
import { Event } from 'vs/base/common/event';
import { IElectronService } from 'vs/platform/electron/node/electron';
import { UserDataAutoSyncService as BaseUserDataAutoSyncService } from 'vs/platform/userDataSync/common/userDataAutoSyncService';

export class UserDataAutoSyncService extends BaseUserDataAutoSyncService {

	constructor(
		@IUserDataSyncEnablementService userDataSyncEnablementService: IUserDataSyncEnablementService,
		@IUserDataSyncService userDataSyncService: IUserDataSyncService,
		@IElectronService electronService: IElectronService,
		@IUserDataSyncLogService logService: IUserDataSyncLogService,
		@IUserDataAuthTokenService authTokenService: IUserDataAuthTokenService,
	) {
		super(userDataSyncEnablementService, userDataSyncService, logService, authTokenService);

		// Sync immediately if there is a local change.
		this._register(Event.debounce(Event.any<any>(
			electronService.onWindowFocus,
			electronService.onWindowOpen,
			userDataSyncService.onDidChangeLocal,
		), () => undefined, 500)(() => this.triggerAutoSync()));
	}

}
