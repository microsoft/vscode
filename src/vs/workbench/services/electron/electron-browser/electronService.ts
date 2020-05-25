/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IElectronService } from 'vs/platform/electron/node/electron';
import { IMainProcessService } from 'vs/platform/ipc/common/mainProcessService';
import { createChannelSender } from 'vs/base/parts/ipc/common/ipc';

export class ElectronService {

	_serviceBrand: undefined;

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService
	) {
		return createChannelSender<IElectronService>(mainProcessService.getChannel('electron'), { context: mainProcessService.windowId });
	}
}
