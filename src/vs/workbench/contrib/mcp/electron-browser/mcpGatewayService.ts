/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IMcpGatewayService, McpGatewayChannelName } from '../../../../platform/mcp/common/mcpGateway.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
import { IMcpGatewayResult, IWorkbenchMcpGatewayService } from '../common/mcpGatewayService.js';

/**
 * Electron workbench implementation of the MCP Gateway Service.
 *
 * This implementation can create gateways either in the main process (local)
 * or on a remote server (if connected).
 */
export class WorkbenchMcpGatewayService implements IWorkbenchMcpGatewayService {
	declare readonly _serviceBrand: undefined;

	private readonly _localPlatformService: IMcpGatewayService;

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
		@IRemoteAgentService private readonly _remoteAgentService: IRemoteAgentService,
		@ILogService private readonly _logService: ILogService,
	) {
		this._localPlatformService = ProxyChannel.toService<IMcpGatewayService>(
			mainProcessService.getChannel(McpGatewayChannelName)
		);
	}

	async createGateway(inRemote: boolean): Promise<IMcpGatewayResult | undefined> {
		this._logService.debug(`[McpGateway][Workbench] createGateway requested (inRemote=${inRemote})`);
		if (inRemote) {
			return this._createRemoteGateway();
		} else {
			return this._createLocalGateway();
		}
	}

	private async _createLocalGateway(): Promise<IMcpGatewayResult> {
		this._logService.info('[McpGateway][Workbench] Creating local gateway via main process');
		const info = await this._localPlatformService.createGateway(undefined);
		const address = URI.revive(info.address);
		this._logService.info(`[McpGateway][Workbench] Local gateway created: ${address}`);

		return {
			address,
			dispose: () => {
				this._logService.info(`[McpGateway][Workbench] Disposing local gateway: ${info.gatewayId}`);
				this._localPlatformService.disposeGateway(info.gatewayId);
			}
		};
	}

	private async _createRemoteGateway(): Promise<IMcpGatewayResult | undefined> {
		const connection = this._remoteAgentService.getConnection();
		if (!connection) {
			this._logService.info('[McpGateway][Workbench] No remote connection available for remote gateway');
			return undefined;
		}

		this._logService.info('[McpGateway][Workbench] Creating remote gateway via remote server');
		return connection.withChannel(McpGatewayChannelName, async channel => {
			const service = ProxyChannel.toService<IMcpGatewayService>(channel);
			const info = await service.createGateway(undefined);
			const address = URI.revive(info.address);
			this._logService.info(`[McpGateway][Workbench] Remote gateway created: ${address}`);

			return {
				address,
				dispose: () => {
					this._logService.info(`[McpGateway][Workbench] Disposing remote gateway: ${info.gatewayId}`);
					service.disposeGateway(info.gatewayId);
				}
			};
		});
	}
}
