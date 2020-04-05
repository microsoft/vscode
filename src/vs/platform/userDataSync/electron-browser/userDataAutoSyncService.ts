/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUserDataSyncService, IUserDataSyncLogService, IUserDataSyncEnablementService } from 'vs/platform/userDataSync/common/userDataSync';
import { Event } from 'vs/base/common/event';
import { IElectronService } from 'vs/platform/electron/node/electron';
import { UserDataAutoSyncService as BaseUserDataAutoSyncService } from 'vs/platform/userDataSync/common/userDataAutoSyncService';
import { IAuthenticationTokenService } from 'vs/platform/authentication/common/authentication';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

export class UserDataAutoSyncService extends BaseUserDataAutoSyncService {

	constructor(
		@IUserDataSyncEnablementService userDataSyncEnablementService: IUserDataSyncEnablementService,
		@IUserDataSyncService userDataSyncService: IUserDataSyncService,
		@IElectronService electronService: IElectronService,
		@IUserDataSyncLogService logService: IUserDataSyncLogService,
		@IAuthenticationTokenService authTokenService: IAuthenticationTokenService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super(userDataSyncEnablementService, userDataSyncService, logService, authTokenService, telemetryService);

		this._register(Event.debounce<string, string[]>(Event.any<string>(
			Event.map(electronService.onWindowFocus, () => 'windowFocus'),
			Event.map(electronService.onWindowOpen, () => 'windowOpen'),
			userDataSyncService.onDidChangeLocal,
		), (last, source) => last ? [...last, source] : [source], 1000)(sources => this.triggerAutoSync(sources)));
	}

}
