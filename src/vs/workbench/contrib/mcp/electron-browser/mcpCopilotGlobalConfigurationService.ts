/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IAgentHostEnablementService } from '../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INativeMcpDiscoveryData, INativeMcpDiscoveryHelperService, NativeMcpDiscoveryHelperChannelName } from '../../../../platform/mcp/common/nativeMcpDiscoveryHelper.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
import { McpCopilotGlobalConfigurationService } from '../common/mcpCopilotGlobalConfigurationService.js';

export class NativeMcpCopilotGlobalConfigurationService extends McpCopilotGlobalConfigurationService {
	constructor(
		@IMainProcessService private readonly _mainProcessService: IMainProcessService,
		@IAgentHostEnablementService agentHostEnablementService: IAgentHostEnablementService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@ILogService logService: ILogService,
	) {
		super(agentHostEnablementService, remoteAgentService, logService);
	}

	protected override loadLocalDiscoveryData(): Promise<INativeMcpDiscoveryData> {
		return ProxyChannel.toService<INativeMcpDiscoveryHelperService>(this._mainProcessService.getChannel(NativeMcpDiscoveryHelperChannelName)).load();
	}
}
