/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../base/common/lifecycle.js';
import { ProxyChannel } from '../../../base/parts/ipc/common/ipc.js';
import { Server as UtilityProcessServer } from '../../../base/parts/ipc/node/ipc.mp.js';
import { isUtilityProcess } from '../../../base/parts/sandbox/node/electronTypes.js';
import { localTranscriptionChannelName } from '../common/localTranscription.js';
import { LocalTranscriptionService } from './localTranscriptionService.js';

if (!isUtilityProcess(process)) {
	throw new Error('localTranscriptionMain must run in a utility process');
}

const server = new UtilityProcessServer();
const service = new LocalTranscriptionService();
server.registerChannel(localTranscriptionChannelName, ProxyChannel.fromService(service, new DisposableStore()));
