/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// AI removed: none of the agent-host workbench contributions are registered
// any more, so the workbench never starts or surfaces agent-host sessions.
// The BYOK language-model handler stays registered because the agent-host
// client channel in platform/agentHost injects it.

import { IAgentHostByokLmHandler } from '../../../../../../platform/agentHost/common/agentHostByokLm.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { AgentHostByokLmHandler } from './agentHostByokLmHandler.js';

registerSingleton(IAgentHostByokLmHandler, AgentHostByokLmHandler, InstantiationType.Delayed);
