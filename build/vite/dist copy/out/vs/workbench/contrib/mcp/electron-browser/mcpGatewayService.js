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
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { McpGatewayChannelName } from '../../../../platform/mcp/common/mcpGateway.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
/**
 * Electron workbench implementation of the MCP Gateway Service.
 *
 * This implementation can create gateways either in the main process (local)
 * or on a remote server (if connected).
 */
let WorkbenchMcpGatewayService = class WorkbenchMcpGatewayService {
    constructor(mainProcessService, _remoteAgentService, _logService) {
        this._remoteAgentService = _remoteAgentService;
        this._logService = _logService;
        this._localChannel = mainProcessService.getChannel(McpGatewayChannelName);
        this._localPlatformService = ProxyChannel.toService(this._localChannel);
    }
    async createGateway(inRemote) {
        this._logService.debug(`[McpGateway][Workbench] createGateway requested (inRemote=${inRemote})`);
        if (inRemote) {
            return this._createRemoteGateway();
        }
        else {
            return this._createLocalGateway();
        }
    }
    async _createLocalGateway() {
        this._logService.info('[McpGateway][Workbench] Creating local gateway via main process');
        const info = await this._localPlatformService.createGateway(undefined);
        const servers = reviveServers(info.servers);
        this._logService.info(`[McpGateway][Workbench] Local gateway created with ${servers.length} server(s)`);
        const onDidChangeServers = Event.map(Event.filter(this._localChannel.listen('onDidChangeGatewayServers'), e => e.gatewayId === info.gatewayId), e => reviveServers(e.servers));
        return {
            servers,
            onDidChangeServers,
            dispose: () => {
                this._logService.info(`[McpGateway][Workbench] Disposing local gateway: ${info.gatewayId}`);
                this._localPlatformService.disposeGateway(info.gatewayId);
            }
        };
    }
    async _createRemoteGateway() {
        const connection = this._remoteAgentService.getConnection();
        if (!connection) {
            this._logService.info('[McpGateway][Workbench] No remote connection available for remote gateway');
            return undefined;
        }
        this._logService.info('[McpGateway][Workbench] Creating remote gateway via remote server');
        return connection.withChannel(McpGatewayChannelName, async (channel) => {
            const service = ProxyChannel.toService(channel);
            const info = await service.createGateway(undefined);
            const servers = reviveServers(info.servers);
            this._logService.info(`[McpGateway][Workbench] Remote gateway created with ${servers.length} server(s)`);
            const onDidChangeServers = Event.map(Event.filter(channel.listen('onDidChangeGatewayServers'), e => e.gatewayId === info.gatewayId), e => reviveServers(e.servers));
            return {
                servers,
                onDidChangeServers,
                dispose: () => {
                    this._logService.info(`[McpGateway][Workbench] Disposing remote gateway: ${info.gatewayId}`);
                    service.disposeGateway(info.gatewayId);
                }
            };
        });
    }
};
WorkbenchMcpGatewayService = __decorate([
    __param(0, IMainProcessService),
    __param(1, IRemoteAgentService),
    __param(2, ILogService)
], WorkbenchMcpGatewayService);
export { WorkbenchMcpGatewayService };
function reviveServers(servers) {
    return servers.map(s => ({ label: s.label, address: URI.revive(s.address) }));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwR2F0ZXdheVNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9tY3AvZWxlY3Ryb24tYnJvd3Nlci9tY3BHYXRld2F5U2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekQsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBWSxZQUFZLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNsRixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUM1RixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDckUsT0FBTyxFQUE2QyxxQkFBcUIsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ2pJLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBRzVGOzs7OztHQUtHO0FBQ0ksSUFBTSwwQkFBMEIsR0FBaEMsTUFBTSwwQkFBMEI7SUFNdEMsWUFDc0Isa0JBQXVDLEVBQ3RCLG1CQUF3QyxFQUNoRCxXQUF3QjtRQURoQix3QkFBbUIsR0FBbkIsbUJBQW1CLENBQXFCO1FBQ2hELGdCQUFXLEdBQVgsV0FBVyxDQUFhO1FBRXRELElBQUksQ0FBQyxhQUFhLEdBQUcsa0JBQWtCLENBQUMsVUFBVSxDQUFDLHFCQUFxQixDQUFDLENBQUM7UUFDMUUsSUFBSSxDQUFDLHFCQUFxQixHQUFHLFlBQVksQ0FBQyxTQUFTLENBQXFCLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztJQUM3RixDQUFDO0lBRUQsS0FBSyxDQUFDLGFBQWEsQ0FBQyxRQUFpQjtRQUNwQyxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyw2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