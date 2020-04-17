/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkspacesService } from 'vs/platform/workspaces/common/workspaces';
import { IMainProcessService } from 'vs/platform/ipc/electron-browser/mainProcessService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createChannelSender } from 'vs/base/parts/ipc/node/ipc';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { INativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-browser/environmentService';

export class NativeWorkspacesService {

	_serviceBrand: undefined;

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
		@IWorkbenchEnvironmentService environmentService: INativeWorkbenchEnvironmentService
	) {
		return createChannelSender<IWorkspacesService>(mainProcessService.getChannel('workspaces'), { context: environmentService.configuration.windowId });
	}
}

registerSingleton(IWorkspacesService, NativeWorkspacesService, true);
