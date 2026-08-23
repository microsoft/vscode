/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { ISSHRemoteAgentHostService } from '../common/sshRemoteAgentHost.js';
import { ISSHRelayClientFactory, SSHRelayClientFactory, SSHRemoteAgentHostService } from './sshRemoteAgentHostServiceImpl.js';

registerSingleton(ISSHRelayClientFactory, SSHRelayClientFactory, InstantiationType.Delayed);
registerSingleton(ISSHRemoteAgentHostService, SSHRemoteAgentHostService, InstantiationType.Delayed);
