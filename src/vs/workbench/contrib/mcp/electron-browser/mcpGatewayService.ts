/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { IChannel, ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IMcpGatewayServerInfo, IMcpGatewayService, McpGatewayChannelName } from '../../../../platform/mcp/common/mcpGateway.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
import { IMcpGatewayResult, IMcpGatewayResultServer, IWorkbenchMcpGatewayService } from '../common/mcpGatewayService.js';

/**
 * Electron workbench implementation of the MCP Gateway Service.
 *
 * This implementation can create gateways either in the main process (local)
 * or on a remote server (if connected).
 */
export class WorkbenchMcpGatewayService implements IWorkbenchMcpGatewayService {
	declare readonly _serviceBrand: undefined;

	private readonly _localPlatformService: IMcpGatewayService;
	private readonly _localChannel: IChannel;

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
		@IRemoteAgentService private readonly _remoteAgentService: IRemoteAgentService,
		@ILogService private readonly _logService: ILogService,
	) {
		this._localChannel = mainProcessService.getChannel(McpGatewayChannelName);
		this._localPlatformService = ProxyChannel.toService<IMcpGatewayService>(this._localChannel);
	}

	async createGateway(inRemote: boolean, chatSessionResource?: URI): Promise<IMcpGatewayResult | undefined> {
		this._logService.debug(`[McpGateway][Workbench] createGateway requested (inRemote=${inRemote})`);
		if (inRemote) {
			return this._createRemoteGateway(chatSessionResource);
		} else {
			return this._createLocalGateway(chatSessionResource);
		}
	}

	private async _createLocalGateway(chatSessionResource?: URI): Promise<IMcpGatewayResult> {
		this._logService.info('[McpGateway][Workbench] Creating local gateway via main process');
		const info = await this._localChannel.call<{ gatewayId: string; servers: readonly IMcpGatewayServerInfo[] }>(
			'createGateway',
			chatSessionResource ? { chatSessionResource: chatSessionResource.toString() } : undefined
		);
		const servers = reviveServers(info.servers);
		this._logService.info(`[McpGateway][Workbench] Local gateway created with ${servers.length} server(s)`);

		const onDidChangeServers = Event.map(
			Event.filter(
				this._localChannel.listen<{ gatewayId: string; servers: readonly IMcpGatewayServerInfo[] }>('onDidChangeGatewayServers'),
				e => e.gatewayId === info.gatewayId,
			),
			e => reviveServers(e.servers),
		);

		return {
			servers,
			onDidChangeServers,
			dispose: () => {
				this._logService.info(`[McpGateway][Workbench] Disposing local gateway: ${info.gatewayId}`);
				this._localPlatformService.disposeGateway(info.gatewayId);
			}
		};
	}

	private async _createRemoteGateway(chatSessionResource?: URI): Promise<IMcpGatewayResult | undefined> {
		const connection = this._remoteAgentService.getConnection();
		if (!connection) {
			this._logService.info('[McpGateway][Workbench] No remote connection available for remote gateway');
			return undefined;
		}

		this._logService.info('[McpGateway][Workbench] Creating remote gateway via remote server');
		return connection.withChannel(McpGatewayChannelName, async channel => {
			const info = await channel.call<{ gatewayId: string; servers: readonly IMcpGatewayServerInfo[] }>(
				'createGateway',
				chatSessionResource ? { chatSessionResource: chatSessionResource.toString() } : undefined
			);
			const servers = reviveServers(info.servers);
			this._logService.info(`[McpGateway][Workbench] Remote gateway created with ${servers.length} server(s)`);

			const onDidChangeServers = Event.map(
				Event.filter(
					channel.listen<{ gatewayId: string; servers: readonly IMcpGatewayServerInfo[] }>('onDidChangeGatewayServers'),
					e => e.gatewayId === info.gatewayId,
				),
				e => reviveServers(e.servers),
			);

			return {
				servers,
				onDidChangeServers,
				dispose: () => {
					this._logService.info(`[McpGateway][Workbench] Disposing remote gateway: ${info.gatewayId}`);
					void channel.call('disposeGateway', info.gatewayId).catch(error => {
						this._logService.warn(`[McpGateway][Workbench] Failed to dispose remote gateway: ${info.gatewayId}`, error);
					});
				}
			};
		});
	}
}

function reviveServers(servers: readonly IMcpGatewayServerInfo[]): IMcpGatewayResultServer[] {
	return servers.map(s => ({ label: s.label, address: URI.revive(s.address) }));
}
