/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IElectronService } from 'vs/platform/electron/node/electron';
import { IMainProcessService } from 'vs/platform/ipc/electron-browser/mainProcessService';
import { createSimpleChannelProxy } from 'vs/platform/ipc/node/simpleIpcProxy';
import { IWindowService } from 'vs/platform/windows/common/windows';

export class ElectronService {

	_serviceBrand: undefined;

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
		@IWindowService windowService: IWindowService
	) {
		return createSimpleChannelProxy<IElectronService>(mainProcessService.getChannel('electron'), windowService.windowId);
	}
}
