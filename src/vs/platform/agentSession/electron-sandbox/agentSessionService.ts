/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAgentSessionStatusMainService } from '../common/agentSession.js';
import { AgentSessionStatusMainChannelClient } from '../common/agentSessionIpc.js';
import { IMainProcessService } from '../../ipc/common/mainProcessService.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';

// Register the client-side service that connects to the main process
registerSingleton(IAgentSessionStatusMainService, class extends AgentSessionStatusMainChannelClient {
	constructor(@IMainProcessService mainProcessService: IMainProcessService) {
		super(mainProcessService.getChannel('agentSessionStatus'));
	}
}, InstantiationType.Delayed);
