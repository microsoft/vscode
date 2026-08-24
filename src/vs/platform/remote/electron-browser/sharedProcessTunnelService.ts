/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSharedProcessRemoteService } from '../../ipc/electron-browser/services.js';
import { ISharedProcessTunnelService, ipcSharedProcessTunnelChannelName } from '../common/sharedProcessTunnelService.js';

registerSharedProcessRemoteService(ISharedProcessTunnelService, ipcSharedProcessTunnelChannelName);
