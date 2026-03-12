/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { UriComponents } from '../../../base/common/uri.js';
import { Client, IClientRouter, IConnectionHub } from '../../../base/parts/ipc/common/ipc.js';

export const NODE_REMOTE_RESOURCE_IPC_METHOD_NAME = 'request';

export const NODE_REMOTE_RESOURCE_CHANNEL_NAME = 'remoteResourceHandler';

export type NodeRemoteResourceResponse = { body: /* base64 */ string; mimeType?: string; statusCode: number };

export class NodeRemoteResourceRouter implements IClientRouter<string> {
	async routeCall(hub: IConnectionHub<string>, command: string, arg?: unknown): Promise<Client<string>> {
		if (command !== NODE_REMOTE_RESOURCE_IPC_METHOD_NAME) {
			throw new Error(`Call not found: ${command}`);
		}

		const uri = Array.isArray(arg) ? arg[0] as (UriComponents | undefined) : undefined;
		if (uri?.authority) {
			const connection = hub.connections.find(c => c.ctx === uri.authority);
			if (connection) {
				return connection;
			}
		}

		throw new Error(`Caller not found`);
	}

	routeEvent(_: IConnectionHub<string>, event: string): Promise<Client<string>> {
		throw new Error(`Event not found: ${event}`);
	}
}
