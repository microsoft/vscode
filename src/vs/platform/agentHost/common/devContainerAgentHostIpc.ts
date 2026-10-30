/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { IServerChannel, ProxyChannel } from '../../../base/parts/ipc/common/ipc.js';
import { IDevContainerAgentHostMainService } from './devContainerAgentHost.js';

/** Keeps discovery cancellation out of ProxyChannel's serialized method arguments. */
export function createDevContainerAgentHostChannel(service: IDevContainerAgentHostMainService, store: DisposableStore): IServerChannel {
	const proxy = ProxyChannel.fromService(service, store, { unbufferedEvents: ['onDidChangeSandboxSupport'] });
	return {
		listen: (context, event, arg) => proxy.listen(context, event, arg),
		call: (context, command, args, token) => proxy.call(context, command, command === 'listDevContainers' ? [token ?? CancellationToken.None] : args, token),
	};
}
