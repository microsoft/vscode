/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IExtensionHostDebugService } from 'vs/platform/debug/common/extensionHostDebug';
import { IMainProcessService } from 'vs/platform/ipc/electron-browser/mainProcessService';
import { ExtensionHostDebugChannelClient, ExtensionHostDebugBroadcastChannel } from 'vs/platform/debug/common/extensionHostDebugIpc';

export class ExtensionHostDebugService extends ExtensionHostDebugChannelClient {

	constructor(
		@IMainProcessService readonly windowService: IMainProcessService,
	) {
		super(windowService.getChannel(ExtensionHostDebugBroadcastChannel.ChannelName));
	}
}

registerSingleton(IExtensionHostDebugService, ExtensionHostDebugService, true);
