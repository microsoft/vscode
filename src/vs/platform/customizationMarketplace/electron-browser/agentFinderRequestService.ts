/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AgentFinderRequestChannelClient, AGENT_FINDER_REQUEST_CHANNEL_NAME } from '../common/agentFinderRequestIpc.js';
import { IAgentFinderRequestService } from '../common/agentFinderRequestService.js';
import { registerSharedProcessRemoteService } from '../../ipc/electron-browser/services.js';

registerSharedProcessRemoteService(IAgentFinderRequestService, AGENT_FINDER_REQUEST_CHANNEL_NAME, { channelClientCtor: AgentFinderRequestChannelClient });
