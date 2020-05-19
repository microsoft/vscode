/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUserDataSyncService, IUserDataSyncEnablementService } from 'vs/platform/userDataSync/common/userDataSync';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

export const IUserDataSyncWorkbenchService = createDecorator<IUserDataSyncWorkbenchService>('IUserDataSyncWorkbenchService');
export interface IUserDataSyncWorkbenchService {
	_serviceBrand: any;
	turnoff(everyWhere: boolean): Promise<void>;
}

export class UserDataSyncWorkbenchService implements IUserDataSyncWorkbenchService {

	_serviceBrand: any;

	constructor(
		@IUserDataSyncEnablementService private readonly userDataSyncEnablementService: IUserDataSyncEnablementService,
		@IUserDataSyncService private readonly userDataSyncService: IUserDataSyncService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
	}

	async turnoff(everywhere: boolean): Promise<void> {
		if (everywhere) {
			this.telemetryService.publicLog2('sync/turnOffEveryWhere');
			await this.userDataSyncService.reset();
		} else {
			await this.userDataSyncService.resetLocal();
		}
		this.userDataSyncEnablementService.setEnablement(false);
	}

}

registerSingleton(IUserDataSyncWorkbenchService, UserDataSyncWorkbenchService);
