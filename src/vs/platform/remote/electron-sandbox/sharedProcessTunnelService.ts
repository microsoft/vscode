/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSharedProcessRemoteService } from 'vs/platform/ipc/electron-sandbox/services';
import { ISharedProcessTunnelService, ipcSharedProcessTunnelChannelName } from 'vs/platform/remote/common/sharedProcessTunnelService';

registerSharedProcessRemoteService(ISharedProcessTunnelService, ipcSharedProcessTunnelChannelName);
