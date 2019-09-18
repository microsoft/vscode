/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IExtensionHostDebugService } from 'vs/platform/debug/common/extensionHostDebug';
import { IMainProcessService } from 'vs/platform/ipc/electron-browser/mainProcessService';
import { ExtensionHostDebugChannelClient, ExtensionHostDebugBroadcastChannel } from 'vs/platform/debug/common/extensionHostDebugIpc';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { IProcessEnvironment } from 'vs/base/common/platform';
import { ParsedArgs } from 'vs/platform/environment/common/environment';

export class ExtensionHostDebugService extends ExtensionHostDebugChannelClient {

	constructor(
		@IMainProcessService readonly mainProcessService: IMainProcessService,
		@IWindowsService private readonly windowsService: IWindowsService
	) {
		super(mainProcessService.getChannel(ExtensionHostDebugBroadcastChannel.ChannelName));
	}

	openExtensionDevelopmentHostWindow(args: ParsedArgs, env: IProcessEnvironment): Promise<void> {
		// TODO@Isidor use debug IPC channel
		return this.windowsService.openExtensionDevelopmentHostWindow(args, env);
	}
}

registerSingleton(IExtensionHostDebugService, ExtensionHostDebugService, true);
