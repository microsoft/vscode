/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSharedProcessRemoteService } from '../../ipc/electron-browser/services.js';
import { AGENT_FINDER_CHANNEL_NAME, AgentFinderChannelClient } from '../common/agentFinderIpc.js';
import { IAgentFinderService } from '../common/agentFinderService.js';

registerSharedProcessRemoteService(IAgentFinderService, AGENT_FINDER_CHANNEL_NAME, { channelClientCtor: AgentFinderChannelClient });
