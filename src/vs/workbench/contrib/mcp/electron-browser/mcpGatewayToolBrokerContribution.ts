/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { McpGatewayToolBrokerChannelName } from '../../../../platform/mcp/common/mcpGateway.js';
import { IMcpService } from '../common/mcpTypes.js';
import { McpGatewayToolBrokerChannel } from '../common/mcpGatewayToolBrokerChannel.js';

export class McpGatewayToolBrokerContribution implements IWorkbenchContribution {
	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
		@IMcpService mcpService: IMcpService,
	) {
		mainProcessService.registerChannel(McpGatewayToolBrokerChannelName, new McpGatewayToolBrokerChannel(mcpService));
	}
}
