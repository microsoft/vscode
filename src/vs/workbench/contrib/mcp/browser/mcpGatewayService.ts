/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IMcpGatewayService, McpGatewayChannelName } from '../../../../platform/mcp/common/mcpGateway.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
import { IMcpGatewayResult, IWorkbenchMcpGatewayService } from '../common/mcpGatewayService.js';

/**
 * Browser implementation of the MCP Gateway Service.
 *
 * In browser/serverless web environments without a remote connection,
 * there is no Node.js process available to create an HTTP server.
 *
 * When running with a remote connection, the gateway is created on the
 * remote server via IPC.
 */
export class BrowserMcpGatewayService implements IWorkbenchMcpGatewayService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IRemoteAgentService private readonly _remoteAgentService: IRemoteAgentService,
	) { }

	async createGateway(inRemote: boolean): Promise<IMcpGatewayResult | undefined> {
		// Browser can only create gateways in remote environment
		if (!inRemote) {
			return undefined;
		}

		const connection = this._remoteAgentService.getConnection();
		if (!connection) {
			// Serverless web environment - no gateway available
			return undefined;
		}

		// Use the remote server's gateway service
		return connection.withChannel(McpGatewayChannelName, async channel => {
			const service = ProxyChannel.toService<IMcpGatewayService>(channel);
			const info = await service.createGateway(undefined);

			return {
				address: URI.revive(info.address),
				dispose: () => {
					service.disposeGateway(info.gatewayId);
				}
			};
		});
	}
}
