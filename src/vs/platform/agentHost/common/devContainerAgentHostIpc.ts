/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../base/common/lifecycle.js';
import { IServerChannel, ProxyChannel } from '../../../base/parts/ipc/common/ipc.js';
import { IDevContainerAgentHostMainService } from './devContainerAgentHost.js';

/** Delivers sandbox support and user state facts without buffering, so they arrive before a rejected connect RPC disposes its listeners. */
export function createDevContainerAgentHostChannel(service: IDevContainerAgentHostMainService, store: DisposableStore): IServerChannel {
	return ProxyChannel.fromService(service, store, { unbufferedEvents: ['onDidChangeSandboxSupport', 'onDidReportUserState'] });
}
