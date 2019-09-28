/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IExtensionHostDebugService } from 'vs/platform/debug/common/extensionHostDebug';
import { IMainProcessService } from 'vs/platform/ipc/electron-browser/mainProcessService';
import { ExtensionHostDebugChannelClient, ExtensionHostDebugBroadcastChannel } from 'vs/platform/debug/common/extensionHostDebugIpc';
import { IProcessEnvironment } from 'vs/base/common/platform';
import { ParsedArgs } from 'vs/platform/environment/common/environment';
import { IElectronService } from 'vs/platform/electron/node/electron';

export class ExtensionHostDebugService extends ExtensionHostDebugChannelClient {

	constructor(
		@IMainProcessService readonly mainProcessService: IMainProcessService,
		@IElectronService private readonly electronService: IElectronService
	) {
		super(mainProcessService.getChannel(ExtensionHostDebugBroadcastChannel.ChannelName));
	}

	openExtensionDevelopmentHostWindow(args: ParsedArgs, env: IProcessEnvironment): Promise<void> {
		// TODO@Isidor move into debug IPC channel (https://github.com/microsoft/vscode/issues/81060)
		return this.electronService.openExtensionDevelopmentHostWindow(args, env);
	}
}

registerSingleton(IExtensionHostDebugService, ExtensionHostDebugService, true);
