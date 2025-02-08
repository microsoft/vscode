/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSharedProcessRemoteService } from '../../ipc/electron-sandbox/services.js';
import { IRemoteTunnelService } from '../common/remoteTunnel.js';

registerSharedProcessRemoteService(IRemoteTunnelService, 'remoteTunnel');
