/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { IWSLRemoteAgentHostService } from '../common/wslRemoteAgentHost.js';
import { IWSLRelayClientFactory, WSLRelayClientFactory, WSLRemoteAgentHostService } from './wslRemoteAgentHostServiceImpl.js';

registerSingleton(IWSLRelayClientFactory, WSLRelayClientFactory, InstantiationType.Delayed);
registerSingleton(IWSLRemoteAgentHostService, WSLRemoteAgentHostService, InstantiationType.Delayed);
