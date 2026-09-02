/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import type { IAgentHostMcpConnector, IAgentHostMcpConnectorsService } from '../../node/agentHostMcpConnectorsService.js';

export function createTestMcpConnectorsService(connectors: readonly IAgentHostMcpConnector[] = []): IAgentHostMcpConnectorsService {
	return {
		_serviceBrand: undefined,
		onDidChange: Event.None,
		getCachedConnectors: () => connectors,
		getConnectors: async () => connectors,
		refresh: async () => connectors,
	};
}
