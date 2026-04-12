/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../base/common/lifecycle.js';
import { ILoggerService } from '../../log/common/log.js';
import { IMcpGatewayService, McpGatewayToolBrokerChannelName } from '../common/mcpGateway.js';
/**
 * IPC channel for the MCP Gateway service, used by the remote server.
 *
 * This channel tracks which client (identified by reconnectionToken) creates gateways,
 * enabling cleanup when a client disconnects.
 */
let McpGatewayChannel = class McpGatewayChannel extends Disposable {
    constructor(_ipcServer, mcpGatewayService, _loggerService) {
        super();
        this._ipcServer = _ipcServer;
        this.mcpGatewayService = mcpGatewayService;
        this._loggerService = _loggerService;
        this._onDidChangeGatewayServers = this._register(new Emitter());
        this._gatewayDisposables = this._register(new DisposableMap());
        /** Tracks which gateways belong to which client for cleanup on disconnect */
        this._clientGateways = new Map();
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
    listen(_ctx, event) {
        if (event === 'onDidChangeGatewayServers') {
            return this._onDidChangeGatewayServers.event;
        }
        throw new Error(`Invalid listen: ${event}`);
    }
    async call(ctx, command, args) {
        const logger = this._loggerService.getLogger('mcpGateway');
        logger?.debug(`[McpGateway][Channel] IPC call: ${command} from client ${ctx}`);
        switch (command) {
            case 'createGateway': {
                const brokerChannel = ipcChannelForContext(this._ipcServer, ctx);
                // Fetch initial server list before creating the gateway (IPC is async, but the invoker interface is sync)
                let currentServers = await brokerChannel.call('listServers');
                const onDidChangeServersListener = brokerChannel.listen('onDidChangeServers');
                const result = await this.mcpGatewayService.createGateway(ctx, {
                    onDidChangeServers: Event.map(onDidChangeServersListener, servers => {
                        currentServers = servers;
                        return servers;
                    }),
                    onDidChangeTools: brokerChannel.listen('onDidChangeTools'),
                    onDidChangeResources: brokerChannel.listen('onDidChangeResources'),
                    listServers: () => currentServers,
                    listToolsForServer: serverId => brokerChannel.call('listToolsForServer', { serverId }),
                    callToolForServer: (serverId, name, callArgs) => brokerChannel.call('callToolForServer', { serverId, name, args: callArgs }),
                    listResourcesForServer: serverId => brokerChannel.call('listResourcesForServer', { serverId }),
                    readResourceForServer: (serverId, uri) => brokerChannel.call('readResourceForServer', { serverId, uri }),
                    listResourceTemplatesForServer: serverId => brokerChannel.call('listResourceTemplatesForServer', { serverId }),
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
                    gatewaysForClient = new Set();
                    this._clientGateways.set(ctx, gatewaysForClient);
                }
                gatewaysForClient.add(result.gatewayId);
                logger?.info(`[McpGateway][Channel] Gateway created: ${result.gatewayId} with ${result.servers.length} server(s) for client ${ctx}`);
                // eslint-disable-next-line local/code-no-dangerous-type-assertions
                return { gatewayId: result.gatewayId, servers: result.servers };
            }
            case 'disposeGateway': {
                const gatewayId = args;
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
                return undefined;
            }
        }
        throw new Error(`Invalid call: ${command}`);
    }
};
McpGatewayChannel = __decorate([
    __param(1, IMcpGatewayService),
    __param(2, ILoggerService)
], McpGatewayChannel);
export { McpGatewayChannel };
function ipcChannelForContext(ipcServer, ctx) {
    return ipcServer.getChannel(McpGatewayToolBrokerChannelName, client => client.ctx === ctx);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwR2F0ZXdheUNoYW5uZWwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9tY3Avbm9kZS9tY3BHYXRld2F5Q2hhbm5lbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxVQUFVLEVBQUUsYUFBYSxFQUFFLGVBQWUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRS9GLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUN6RCxPQUFPLEVBQXNELGtCQUFrQixFQUFFLCtCQUErQixFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFHbEo7Ozs7O0dBS0c7QUFDSSxJQUFNLGlCQUFpQixHQUF2QixNQUFNLGlCQUE0QixTQUFRLFVBQVU7SUFPMUQsWUFDa0IsVUFBK0IsRUFDNUIsaUJBQXNELEVBQzFELGNBQStDO1FBRS9ELEtBQUssRUFBRSxDQUFDO1FBSlMsZUFBVSxHQUFWLFVBQVUsQ0FBcUI7UUFDWCxzQkFBaUIsR0FBakIsaUJBQWlCLENBQW9CO1FBQ3pDLG1CQUFjLEdBQWQsY0FBYyxDQUFnQjtRQVIvQywrQkFBMEIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFvRSxDQUFDLENBQUM7UUFDN0gsd0JBQW1CLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLGFBQWEsRUFBMkIsQ0FBQyxDQUFDO1FBQ3BHLDZFQUE2RTtRQUM1RCxvQkFBZSxHQUFHLElBQUksR0FBRyxFQUF5QixDQUFDO1FBUW5FLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLHFCQUFxQixDQUFDLENBQUMsQ0FBQyxFQUFFO1lBQ25ELElBQUksQ0FBQyxjQUFjLENBQUMsU0FBUyxDQUFDLFlBQVksQ0FBQyxFQUFFLElBQUksQ0FBQyw4Q0FBOEMsQ0FBQyxDQUFDLEdBQUcsd0JBQXdCLENBQUMsQ0FBQztZQUMvSCxpQkFBaUIsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7WUFFbEQsK0RBQStEO1lBQy9ELE1BQU0saUJBQWlCLEdBQUcsSUFBSSxDQUFDLGVBQWUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQzFELElBQUksaUJBQWlCLEVBQUUsQ0FBQztnQkFDdkIsS0FBSyxNQUFNLFNBQVMsSUFBSSxpQkFBaUIsRUFBRSxDQUFDO29CQUMzQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsZ0JBQWdCLENBQUMsU0FBUyxDQUFDLENBQUM7Z0JBQ3RELENBQUM7Z0JBQ0QsSUFBSSxDQUFDLGVBQWUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3BDLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVELE1BQU0sQ0FBSSxJQUFjLEVBQUUsS0FBYTtRQUN0QyxJQUFJLEtBQUssS0FBSywyQkFBMkIsRUFBRSxDQUFDO1lBQzNDLE9BQU8sSUFBSSxDQUFDLDBCQUEwQixDQUFDLEtBQWlCLENBQUM7UUFDMUQsQ0FBQztRQUNELE1BQU0sSUFBSSxLQUFLLENBQUMsbUJBQW1CLEtBQUssRUFBRSxDQUFDLENBQUM7SUFDN0MsQ0FBQztJQUVELEtBQUssQ0FBQyxJQUFJLENBQUksR0FBYSxFQUFFLE9BQWUsRUFBRSxJQUFjO1FBQzNELE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsU0FBUyxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQzNELE1BQU0sRUFBRSxLQUFLLENBQUMsbUNBQW1DLE9BQU8sZ0JBQWdCLEdBQUcsRUFBRSxDQUFDLENBQUM7UUFFL0UsUUFBUSxPQUFPLEVBQUUsQ0FBQztZQUNqQixLQUFLLGVBQWUsQ0FBQyxDQUFDLENBQUM7Z0JBQ3RCLE1BQU0sYUFBYSxHQUFHLG9CQUFvQixDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsR0FBRyxDQUFDLENBQUM7Z0JBRWpFLDBHQUEwRztnQkFDMUcsSUFBSSxjQUFjLEdBQUcsTUFBTSxhQUFhLENBQUMsSUFBSSxDQUF5QyxhQUFhLENBQUMsQ0FBQztnQkFDckcsTUFBTSwwQkFBMEIsR0FBRyxhQUFhLENBQUMsTUFBTSxDQUF5QyxvQkFBb0IsQ0FBQyxDQUFDO2dCQUV0SCxNQUFNLE1BQU0sR0FBRyxNQUFNLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxhQUFhLENBQUMsR0FBRyxFQUFFO29CQUM5RCxrQkFBa0IsRUFBRSxLQUFLLENBQUMsR0FBRyxDQUFDLDBCQUEwQixFQUFFLE9BQU8sQ0FBQyxFQUFFO3dCQUNuRSxjQUFjLEdBQUcsT0FBTyxDQUFDO3dCQUN6QixPQUFPLE9BQU8sQ0FBQztvQkFDaEIsQ0FBQyxDQUFDO29CQUNGLGdCQUFnQixFQUFFLGFBQWEsQ0FBQyxNQUFNLENBQU8sa0JBQWtCLENBQUM7b0JBQ2hFLG9CQUFvQixFQUFFLGFBQWEsQ0FBQyxNQUFNLENBQU8sc0JBQXNCLENBQUM7b0JBQ3hFLFdBQVcsRUFBRSxHQUFHLEVBQUUsQ0FBQyxjQUFjO29CQUNqQyxrQkFBa0IsRUFBRSxRQUFRLENBQUMsRUFBRSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQXNCLG9CQUFvQixFQUFFLEVBQUUsUUFBUSxFQUFFLENBQUM7b0JBQzNHLGlCQUFpQixFQUFFLENBQUMsUUFBUSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsRUFBRSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQXFCLG1CQUFtQixFQUFFLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLENBQUM7b0JBQ2hKLHNCQUFzQixFQUFFLFFBQVEsQ0FBQyxFQUFFLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBMEIsd0JBQXdCLEVBQUUsRUFBRSxRQUFRLEVBQUUsQ0FBQztvQkFDdkgscUJBQXFCLEVBQUUsQ0FBQyxRQUFRLEVBQUUsR0FBRyxFQUFFLEVBQUUsQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUF5Qix1QkFBdUIsRUFBRSxFQUFFLFFBQVEsRUFBRSxHQUFHLEVBQUUsQ0FBQztvQkFDaEksOEJBQThCLEVBQUUsUUFBUSxDQUFDLEVBQUUsQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFrQyxnQ0FBZ0MsRUFBRSxFQUFFLFFBQVEsRUFBRSxDQUFDO2lCQUMvSSxDQUFDLENBQUM7Z0JBQ0gsdUNBQXVDO2dCQUN2QyxNQUFNLFlBQVksR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO2dCQUMzQyxZQUFZLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxrQkFBa0IsQ0FBQyxPQUFPLENBQUMsRUFBRTtvQkFDcEQsSUFBSSxDQUFDLDBCQUEwQixDQUFDLElBQUksQ0FBQyxFQUFFLFNBQVMsRUFBRSxNQUFNLENBQUMsU0FBUyxFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUM7Z0JBQ2hGLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ0osSUFBSSxDQUFDLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsU0FBUyxFQUFFLFlBQVksQ0FBQyxDQUFDO2dCQUU3RCxnREFBZ0Q7Z0JBQ2hELElBQUksaUJBQWlCLEdBQUcsSUFBSSxDQUFDLGVBQWUsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQ3RELElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO29CQUN4QixpQkFBaUIsR0FBRyxJQUFJLEdBQUcsRUFBVSxDQUFDO29CQUN0QyxJQUFJLENBQUMsZUFBZSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztnQkFDbEQsQ0FBQztnQkFDRCxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDO2dCQUV4QyxNQUFNLEVBQUUsSUFBSSxDQUFDLDBDQUEwQyxNQUFNLENBQUMsU0FBUyxTQUFTLE1BQU0sQ0FBQyxPQUFPLENBQUMsTUFBTSx5QkFBeUIsR0FBRyxFQUFFLENBQUMsQ0FBQztnQkFDckksbUVBQW1FO2dCQUNuRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sQ0FBQyxTQUFTLEVBQUUsT0FBTyxFQUFFLE1BQU0sQ0FBQyxPQUFPLEVBQU8sQ0FBQztZQUN0RSxDQUFDO1lBQ0QsS0FBSyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUM7Z0JBQ3ZCLE1BQU0sU0FBUyxHQUFHLElBQWMsQ0FBQztnQkFDakMsTUFBTSxFQUFFLElBQUksQ0FBQyw0Q0FBNEMsU0FBUyxlQUFlLEdBQUcsRUFBRSxDQUFDLENBQUM7Z0JBQ3hGLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxnQkFBZ0IsQ0FBQyxTQUFTLENBQUMsQ0FBQztnQkFFckQsOEJBQThCO2dCQUM5QixNQUFNLGlCQUFpQixHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUN4RCxJQUFJLGlCQUFpQixFQUFFLENBQUM7b0JBQ3ZCLGlCQUFpQixDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQztvQkFDcEMsSUFBSSxpQkFBaUIsQ0FBQyxJQUFJLEtBQUssQ0FBQyxFQUFFLENBQUM7d0JBQ2xDLElBQUksQ0FBQyxlQUFlLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO29CQUNsQyxDQUFDO2dCQUNGLENBQUM7Z0JBRUQsTUFBTSxJQUFJLENBQUMsaUJBQWlCLENBQUMsY0FBYyxDQUFDLFNBQVMsQ0FBQyxDQUFDO2dCQUN2RCxPQUFPLFNBQWMsQ0FBQztZQUN2QixDQUFDO1FBQ0YsQ0FBQztRQUVELE1BQU0sSUFBSSxLQUFLLENBQUMsaUJBQWlCLE9BQU8sRUFBRSxDQUFDLENBQUM7SUFDN0MsQ0FBQztDQUNELENBQUE7QUFyR1ksaUJBQWlCO0lBUzNCLFdBQUEsa0JBQWtCLENBQUE7SUFDbEIsV0FBQSxjQUFjLENBQUE7R0FWSixpQkFBaUIsQ0FxRzdCOztBQUVELFNBQVMsb0JBQW9CLENBQVcsU0FBOEIsRUFBRSxHQUFhO0lBQ3BGLE9BQU8sU0FBUyxDQUFDLFVBQVUsQ0FBQywrQkFBK0IsRUFBRSxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxHQUFHLEtBQUssR0FBRyxDQUFDLENBQUM7QUFDNUYsQ0FBQyJ9