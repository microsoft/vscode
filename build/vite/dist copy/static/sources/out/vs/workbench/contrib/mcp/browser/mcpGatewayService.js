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
import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { McpGatewayChannelName } from '../../../../platform/mcp/common/mcpGateway.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
/**
 * Browser implementation of the MCP Gateway Service.
 *
 * In browser/serverless web environments without a remote connection,
 * there is no Node.js process available to create an HTTP server.
 *
 * When running with a remote connection, the gateway is created on the
 * remote server via IPC.
 */
let BrowserMcpGatewayService = class BrowserMcpGatewayService {
    constructor(_remoteAgentService, _logService) {
        this._remoteAgentService = _remoteAgentService;
        this._logService = _logService;
    }
    async createGateway(inRemote) {
        this._logService.debug(`[McpGateway][BrowserWorkbench] createGateway requested (inRemote=${inRemote})`);
        // Browser can only create gateways in remote environment
        if (!inRemote) {
            this._logService.info('[McpGateway][BrowserWorkbench] Cannot create local gateway in browser environment');
            return undefined;
        }
        const connection = this._remoteAgentService.getConnection();
        if (!connection) {
            this._logService.info('[McpGateway][BrowserWorkbench] No remote connection available (serverless web)');
            return undefined;
        }
        this._logService.info('[McpGateway][BrowserWorkbench] Creating remote gateway via remote server');
        // Use the remote server's gateway service
        return connection.withChannel(McpGatewayChannelName, async (channel) => {
            const service = ProxyChannel.toService(channel);
            const info = await service.createGateway(undefined);
            const servers = reviveServers(info.servers);
            this._logService.info(`[McpGateway][BrowserWorkbench] Remote gateway created with ${servers.length} server(s)`);
            const onDidChangeServers = Event.map(Event.filter(channel.listen('onDidChangeGatewayServers'), e => e.gatewayId === info.gatewayId), e => reviveServers(e.servers));
            return {
                servers,
                onDidChangeServers,
                dispose: () => {
                    this._logService.info(`[McpGateway][BrowserWorkbench] Disposing remote gateway: ${info.gatewayId}`);
                    service.disposeGateway(info.gatewayId);
                }
            };
        });
    }
};
BrowserMcpGatewayService = __decorate([
    __param(0, IRemoteAgentService),
    __param(1, ILogService)
], BrowserMcpGatewayService);
export { BrowserMcpGatewayService };
function reviveServers(servers) {
    return servers.map(s => ({ label: s.label, address: URI.revive(s.address) }));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwR2F0ZXdheVNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9tY3AvYnJvd3Nlci9tY3BHYXRld2F5U2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekQsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUN4RSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDckUsT0FBTyxFQUE2QyxxQkFBcUIsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ2pJLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBRzVGOzs7Ozs7OztHQVFHO0FBQ0ksSUFBTSx3QkFBd0IsR0FBOUIsTUFBTSx3QkFBd0I7SUFHcEMsWUFDdUMsbUJBQXdDLEVBQ2hELFdBQXdCO1FBRGhCLHdCQUFtQixHQUFuQixtQkFBbUIsQ0FBcUI7UUFDaEQsZ0JBQVcsR0FBWCxXQUFXLENBQWE7SUFDbkQsQ0FBQztJQUVMLEtBQUssQ0FBQyxhQUFhLENBQUMsUUFBaUI7UUFDcEMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsb0VBQW9FLFFBQVEsR0FBRyxDQUFDLENBQUM7UUFFeEcseURBQXlEO1FBQ3pELElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNmLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLG1GQUFtRixDQUFDLENBQUM7WUFDM0csT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztRQUVELE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUM1RCxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDakIsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsZ0ZBQWdGLENBQUMsQ0FBQztZQUN4RyxPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBRUQsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsMEVBQTBFLENBQUMsQ0FBQztRQUNsRywwQ0FBMEM7UUFDMUMsT0FBTyxVQUFVLENBQUMsV0FBVyxDQUFDLHFCQUFxQixFQUFFLEtBQUssRUFBQyxPQUFPLEVBQUMsRUFBRTtZQUNwRSxNQUFNLE9BQU8sR0FBRyxZQUFZLENBQUMsU0FBUyxDQUFxQixPQUFPLENBQUMsQ0FBQztZQUNwRSxNQUFNLElBQUksR0FBRyxNQUFNLE9BQU8sQ0FBQyxhQUFhLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDcEQsTUFBTSxPQUFPLEdBQUcsYUFBYSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUM1QyxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyw4REFBOEQsT0FBTyxDQUFDLE1BQU0sWUFBWSxDQUFDLENBQUM7WUFFaEgsTUFBTSxrQkFBa0IsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUNuQyxLQUFLLENBQUMsTUFBTSxDQUNYLE9BQU8sQ0FBQyxNQUFNLENBQW1FLDJCQUEyQixDQUFDLEVBQzdHLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFNBQVMsS0FBSyxJQUFJLENBQUMsU0FBUyxDQUNuQyxFQUNELENBQUMsQ0FBQyxFQUFFLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FDN0IsQ0FBQztZQUVGLE9BQU87Z0JBQ04sT0FBTztnQkFDUCxrQkFBa0I7Z0JBQ2xCLE9BQU8sRUFBRSxHQUFHLEVBQUU7b0JBQ2IsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsNERBQTRELElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDO29CQUNwRyxPQUFPLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztnQkFDeEMsQ0FBQzthQUNELENBQUM7UUFDSCxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUM7Q0FDRCxDQUFBO0FBakRZLHdCQUF3QjtJQUlsQyxXQUFBLG1CQUFtQixDQUFBO0lBQ25CLFdBQUEsV0FBVyxDQUFBO0dBTEQsd0JBQXdCLENBaURwQzs7QUFFRCxTQUFTLGFBQWEsQ0FBQyxPQUF5QztJQUMvRCxPQUFPLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQyxLQUFLLEVBQUUsT0FBTyxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO0FBQy9FLENBQUMifQ==