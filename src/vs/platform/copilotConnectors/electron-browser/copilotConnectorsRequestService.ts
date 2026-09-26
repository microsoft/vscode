/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSharedProcessRemoteService } from '../../ipc/electron-browser/services.js';
import { COPILOT_CONNECTORS_REQUEST_CHANNEL_NAME, CopilotConnectorsRequestChannelClient } from '../common/copilotConnectorsIpc.js';
import { ICopilotConnectorsRequestService } from '../common/copilotConnectorsRequestService.js';

registerSharedProcessRemoteService(ICopilotConnectorsRequestService, COPILOT_CONNECTORS_REQUEST_CHANNEL_NAME, { channelClientCtor: CopilotConnectorsRequestChannelClient });
