/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IElectronService } from 'vs/platform/electron/node/electron';
import { IMainProcessService } from 'vs/platform/ipc/electron-browser/mainProcessService';
import { createChannelSender } from 'vs/platform/ipc/node/ipcChannelCreator';
import { IWindowService } from 'vs/platform/windows/common/windows';

export class ElectronService {

	_serviceBrand: undefined;

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
		@IWindowService windowService: IWindowService
	) {
		return createChannelSender<IElectronService>(mainProcessService.getChannel('electron'), { context: windowService.windowId });
	}
}
