/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExtensionHostDebugService } from 'vs/platform/debug/common/extensionHostDebug';
import { registerMainProcessRemoteService } from 'vs/platform/ipc/electron-sandbox/services';
import { ExtensionHostDebugChannelClient, ExtensionHostDebugBroadcastChannel } from 'vs/platform/debug/common/extensionHostDebugIpc';

registerMainProcessRemoteService(IExtensionHostDebugService, ExtensionHostDebugBroadcastChannel.ChannelName, { supportsDelayedInstantiation: true, channelClientCtor: ExtensionHostDebugChannelClient });
