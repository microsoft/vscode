/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../base/common/lifecycle.js';
import { IPCServer, IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import { ILoggerService } from '../../log/common/log.js';
import { IMcpGatewayServerDescriptor, IMcpGatewayServerInfo, IMcpGatewayService, McpGatewayToolBrokerChannelName } from '../common/mcpGateway.js';
import { MCP } from '../common/modelContextProtocol.js';

/**
 * IPC channel for the MCP Gateway service, used by the remote server.
 *
 * This channel tracks which client (identified by reconnectionToken) creates gateways,
 * enabling cleanup when a client disconnects.
 */
export class McpGatewayChannel<TContext> extends Disposable implements IServerChannel<TContext> {

	private readonly _onDidChangeGatewayServers = this._register(new Emitter<{ gatewayId: string; servers: readonly IMcpGatewayServerInfo[] }>());
	private readonly _gatewayDisposables = this._register(new DisposableMap<string, DisposableStore>());
	/** Tracks which gateways belong to which client for cleanup on disconnect */
	private readonly _clientGateways = new Map<TContext, Set<string>>();

	constructor(
		private readonly _ipcServer: IPCServer<TContext>,
		@IMcpGatewayService private readonly mcpGatewayService: IMcpGatewayService,
		@ILoggerService private readonly _loggerService: ILoggerService,
	) {
		super();
		this._register(_ipcServer.onDidRemoveConnection(c => {
			this._loggerService.getLogger('mcpGateway')?.info(`[McpGateway][Channel] Client disconnected: ${c.ctx}, cleaning up gateways`);
			mcpGatewayService.disposeGatewaysForClient(c.ctx);

			// Clean up per-gateway change-event forwarders for this client
			const gatewaysForClient = this._clientGateways.get(c.ctx);
			if (gatewaysForClient) {
				for (const gatewayId of gatewaysForClient) {
					this._gatewayDisposables.deleteAndDispose(gatewayId);
				}
				this._clientGateways.delete(c.ctx);
			}
		}));
	}

	listen<T>(_ctx: TContext, event: string): Event<T> {
		if (event === 'onDidChangeGatewayServers') {
			return this._onDidChangeGatewayServers.event as Event<T>;
		}
		throw new Error(`Invalid listen: ${event}`);
	}

	async call<T>(ctx: TContext, command: string, args?: unknown): Promise<T> {
		const logger = this._loggerService.getLogger('mcpGateway');
		logger?.debug(`[McpGateway][Channel] IPC call: ${command} from client ${ctx}`);

		switch (command) {
			case 'createGateway': {
				const { chatSessionResource } = (args as { chatSessionResource?: string } | undefined) ?? {};
				const brokerChannel = ipcChannelForContext(this._ipcServer, ctx);

				// Fetch initial server list before creating the gateway (IPC is async, but the invoker interface is sync)
				let currentServers = await brokerChannel.call<readonly IMcpGatewayServerDescriptor[]>('listServers');
				const onDidChangeServersListener = brokerChannel.listen<readonly IMcpGatewayServerDescriptor[]>('onDidChangeServers');

				const result = await this.mcpGatewayService.createGateway(ctx, {
					onDidChangeServers: Event.map(onDidChangeServersListener, servers => {
						currentServers = servers;
						return servers;
					}),
					onDidChangeTools: brokerChannel.listen<void>('onDidChangeTools'),
					onDidChangeResources: brokerChannel.listen<void>('onDidChangeResources'),
					listServers: () => currentServers,
					listToolsForServer: serverId => brokerChannel.call<readonly MCP.Tool[]>('listToolsForServer', { serverId }),
					callToolForServer: (serverId, name, callArgs) => brokerChannel.call<MCP.CallToolResult>('callToolForServer', { serverId, name, args: callArgs, chatSessionResource }),
					listResourcesForServer: serverId => brokerChannel.call<readonly MCP.Resource[]>('listResourcesForServer', { serverId }),
					readResourceForServer: (serverId, uri) => brokerChannel.call<MCP.ReadResourceResult>('readResourceForServer', { serverId, uri }),
					listResourceTemplatesForServer: serverId => brokerChannel.call<readonly MCP.ResourceTemplate[]>('listResourceTemplatesForServer', { serverId }),
				});
				// Forward server change events via IPC
				const gatewayStore = new DisposableStore();
				gatewayStore.add(result.onDidChangeServers(servers => {
					this._onDidChangeGatewayServers.fire({ gatewayId: result.gatewayId, servers });
				}));
				this._gatewayDisposables.set(result.gatewayId, gatewayStore);

				// Track client → gateway for disconnect cleanup
				let gatewaysForClient = this._clientGateways.get(ctx);
				if (!gatewaysForClient) {
					gatewaysForClient = new Set<string>();
					this._clientGateways.set(ctx, gatewaysForClient);
				}
				gatewaysForClient.add(result.gatewayId);

				logger?.info(`[McpGateway][Channel] Gateway created: ${result.gatewayId} with ${result.servers.length} server(s) for client ${ctx}`);
				// eslint-disable-next-line local/code-no-dangerous-type-assertions
				return { gatewayId: result.gatewayId, servers: result.servers } as T;
			}
			case 'disposeGateway': {
				const gatewayId = args as string;
				logger?.info(`[McpGateway][Channel] Disposing gateway: ${gatewayId} for client ${ctx}`);
				this._gatewayDisposables.deleteAndDispose(gatewayId);

				// Remove from client tracking
				const gatewaysForClient = this._clientGateways.get(ctx);
				if (gatewaysForClient) {
					gatewaysForClient.delete(gatewayId);
					if (gatewaysForClient.size === 0) {
						this._clientGateways.delete(ctx);
					}
				}

				await this.mcpGatewayService.disposeGateway(gatewayId);
				return undefined as T;
			}
		}

		throw new Error(`Invalid call: ${command}`);
	}
}

function ipcChannelForContext<TContext>(ipcServer: IPCServer<TContext>, ctx: TContext) {
	return ipcServer.getChannel(McpGatewayToolBrokerChannelName, client => client.ctx === ctx);
}
