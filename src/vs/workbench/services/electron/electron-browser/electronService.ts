/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IElectronService } from 'vs/platform/electron/node/electron';
import { IMainProcessService } from 'vs/platform/ipc/electron-browser/mainProcessService';
import { createChannelSender } from 'vs/platform/ipc/node/ipcChannelCreator';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IElectronEnvironmentService } from 'vs/workbench/services/electron/electron-browser/electronEnvironment';

export class ElectronService {

	_serviceBrand: undefined;

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
		@IElectronEnvironmentService electronEnvironmentService: IElectronEnvironmentService
	) {
		return createChannelSender<IElectronService>(mainProcessService.getChannel('electron'), { context: electronEnvironmentService.windowId });
	}
}

registerSingleton(IElectronService, ElectronService, true);
