/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../../base/common/async.js';
import { URI } from '../../../../base/common/uri.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IAgentHostEnablementService } from '../../../../platform/agentHost/common/agentHostEnablementService.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { getCopilotGlobalMcpConfigurationResource } from '../../../../platform/mcp/common/mcpCopilotGlobalConfiguration.js';
import { INativeMcpDiscoveryData, INativeMcpDiscoveryHelperService, NativeMcpDiscoveryHelperChannelName } from '../../../../platform/mcp/common/nativeMcpDiscoveryHelper.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';

export const IMcpCopilotGlobalConfigurationService = createDecorator<IMcpCopilotGlobalConfigurationService>('mcpCopilotGlobalConfigurationService');

export interface IMcpCopilotGlobalConfigurationService {
	readonly _serviceBrand: undefined;
	/** Resolves the configuration on the window's agent-host machine, or undefined when unavailable. */
	getConfigurationResource(): Promise<URI | undefined>;
}

export class McpCopilotGlobalConfigurationService implements IMcpCopilotGlobalConfigurationService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IAgentHostEnablementService private readonly _agentHostEnablementService: IAgentHostEnablementService,
		@IRemoteAgentService private readonly _remoteAgentService: IRemoteAgentService,
		@ILogService private readonly _logService: ILogService,
	) { }

	async getConfigurationResource(): Promise<URI | undefined> {
		if (!this._agentHostEnablementService.enabled.get()) {
			return undefined;
		}
		try {
			const data = await raceTimeout(this.loadDiscoveryData(), 5000, () => {
				this._logService.warn('[MCP] Timed out resolving the Copilot Global MCP configuration after 5000ms.');
			});
			return data ? getCopilotGlobalMcpConfigurationResource(data) : undefined;
		} catch (error) {
			this._logService.warn('[MCP] Unable to resolve the Copilot Global MCP configuration.', error);
			return undefined;
		}
	}

	private loadDiscoveryData(): Promise<INativeMcpDiscoveryData | undefined> {
		const connection = this._remoteAgentService.getConnection();
		if (connection) {
			return connection.withChannel(NativeMcpDiscoveryHelperChannelName, channel => ProxyChannel.toService<INativeMcpDiscoveryHelperService>(channel).load());
		}
		return this.loadLocalDiscoveryData();
	}

	protected loadLocalDiscoveryData(): Promise<INativeMcpDiscoveryData | undefined> {
		return Promise.resolve(undefined);
	}
}
