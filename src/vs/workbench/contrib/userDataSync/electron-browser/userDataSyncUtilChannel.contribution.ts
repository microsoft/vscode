/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { ISharedProcessService } from '../../../../platform/ipc/electron-browser/services.js';
import { IUserDataSyncUtilService } from '../../../../platform/userDataSync/common/userDataSync.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';

export class UserDataSyncUtilChannelContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.userDataSyncServices';

	constructor(
		@IUserDataSyncUtilService userDataSyncUtilService: IUserDataSyncUtilService,
		@ISharedProcessService sharedProcessService: ISharedProcessService,
	) {
		super();
		sharedProcessService.registerChannel('userDataSyncUtil', ProxyChannel.fromService(userDataSyncUtilService, this._store));
	}
}

registerWorkbenchContribution2(UserDataSyncUtilChannelContribution.ID, UserDataSyncUtilChannelContribution, WorkbenchPhase.BlockStartup);
