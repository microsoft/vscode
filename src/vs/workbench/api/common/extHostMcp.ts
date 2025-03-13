/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { McpServerLaunch } from '../../contrib/mcp/common/mcpTypes.js';
import { ExtHostMcpShape, MainContext, MainThreadMcpShape } from './extHost.protocol.js';
import { IExtHostRpcService } from './extHostRpcService.js';


export const IExtHostMpcService = createDecorator<IExtHostMpcService>('IExtHostMpcService');

export interface IExtHostMpcService extends ExtHostMcpShape { }

export class ExtHostMcpService implements IExtHostMpcService {
	protected _proxy: MainThreadMcpShape;

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
	) {
		this._proxy = extHostRpc.getProxy(MainContext.MainThreadMcp);
	}

	$startMcp(id: number, launch: McpServerLaunch): void {
		// todo: SSE launches can be implemented in this common layer
		throw new Error('not implemented');
	}

	$stopMcp(id: number): void {
		// no-op
	}

	$sendMessage(id: number, message: string): void {
		// no-op
	}
}
