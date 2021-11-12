/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerMainProcessRemoteService, registerSharedProcessRemoteService } from 'vs/platform/ipc/electron-sandbox/services';
import { IExtensionHostStarter, ipcExtensionHostStarterChannelName } from 'vs/platform/extensions/common/extensionHostStarter';

const location = 'main' as 'main' | 'shared';

if (location === 'main') {
	registerMainProcessRemoteService(IExtensionHostStarter, ipcExtensionHostStarterChannelName, { supportsDelayedInstantiation: true });
} else {
	registerSharedProcessRemoteService(IExtensionHostStarter, ipcExtensionHostStarterChannelName, { supportsDelayedInstantiation: true });
}
