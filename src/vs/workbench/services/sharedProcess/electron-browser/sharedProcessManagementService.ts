/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createChannelSender } from 'vs/base/parts/ipc/common/ipc';
import { IMainProcessService } from 'vs/platform/ipc/electron-sandbox/mainProcessService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ISharedProcessManagementService } from 'vs/platform/sharedProcess/common/sharedProcessManagement';

// @ts-ignore: interface is implemented via proxy
export class SharedProcessManagementService implements ISharedProcessManagementService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService
	) {
		return createChannelSender<ISharedProcessManagementService>(mainProcessService.getChannel('sharedProcessManagement'));
	}
}

registerSingleton(ISharedProcessManagementService, SharedProcessManagementService, true);
