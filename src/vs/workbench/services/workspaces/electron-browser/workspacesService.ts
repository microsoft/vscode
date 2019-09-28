/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkspacesService } from 'vs/platform/workspaces/common/workspaces';
import { IMainProcessService } from 'vs/platform/ipc/electron-browser/mainProcessService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IElectronEnvironmentService } from 'vs/workbench/services/electron/electron-browser/electronEnvironmentService';
import { createChannelSender } from 'vs/base/parts/ipc/node/ipc';

export class NativeWorkspacesService {

	_serviceBrand: undefined;

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
		@IElectronEnvironmentService electronEnvironmentService: IElectronEnvironmentService
	) {
		return createChannelSender<IWorkspacesService>(mainProcessService.getChannel('workspaces'), { context: electronEnvironmentService.windowId });
	}
}

registerSingleton(IWorkspacesService, NativeWorkspacesService, true);
