/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IPCServer, IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import { IMcpGatewayService, McpGatewayToolBrokerChannelName } from '../common/mcpGateway.js';
import { MCP } from '../common/modelContextProtocol.js';

/**
 * IPC channel for the MCP Gateway service, used by the remote server.
 *
 * This channel tracks which client (identified by reconnectionToken) creates gateways,
 * enabling cleanup when a client disconnects.
 */
export class McpGatewayChannel<TContext> extends Disposable implements IServerChannel<TContext> {

	constructor(
		private readonly _ipcServer: IPCServer<TContext>,
		@IMcpGatewayService private readonly mcpGatewayService: IMcpGatewayService
	) {
		super();
		this._register(_ipcServer.onDidRemoveConnection(c => mcpGatewayService.disposeGatewaysForClient(c.ctx)));
	}

	listen<T>(_ctx: TContext, _event: string): Event<T> {
		throw new Error('Invalid listen');
	}

	async call<T>(ctx: TContext, command: string, args?: unknown): Promise<T> {
		switch (command) {
			case 'createGateway': {
				const brokerChannel = ipcChannelForContext(this._ipcServer, ctx);
				const result = await this.mcpGatewayService.createGateway(ctx, {
					onDidChangeTools: brokerChannel.listen<void>('onDidChangeTools'),
					listTools: () => brokerChannel.call<readonly MCP.Tool[]>('listTools'),
					callTool: (name, callArgs) => brokerChannel.call<MCP.CallToolResult>('callTool', { name, args: callArgs }),
				});
				return result as T;
			}
			case 'disposeGateway': {
				await this.mcpGatewayService.disposeGateway(args as string);
				return undefined as T;
			}
		}

		throw new Error(`Invalid call: ${command}`);
	}
}

function ipcChannelForContext<TContext>(ipcServer: IPCServer<TContext>, ctx: TContext) {
	return ipcServer.getChannel(McpGatewayToolBrokerChannelName, client => client.ctx === ctx);
}
