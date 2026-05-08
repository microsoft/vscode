/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ITunnelAgentHostService } from '../../../../platform/agentHost/common/tunnelAgentHost.js';
import { TunnelAgentHostService } from './tunnelAgentHostServiceImpl.js';

registerSingleton(ITunnelAgentHostService, TunnelAgentHostService, InstantiationType.Delayed);
