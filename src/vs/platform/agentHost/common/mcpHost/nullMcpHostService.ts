/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { IMcpServerDefinition } from '../../../agentPlugins/common/pluginParsers.js';
import { McpMessageParams, McpMessageResult, ServerMcpCapabilities } from '../state/protocol/commands.js';
import { McpRpcCallResponse } from '../state/protocol/state.js';
import { JsonRpcErrorCodes, ProtocolError } from '../state/sessionProtocol.js';
import { IMcpClientContext, IMcpHostService, IMcpServerHandle } from './mcpHostService.js';

/**
 * No-op {@link IMcpHostService}. Returns no servers, advertises no MCP
 * capabilities, and refuses `mcpMessage` calls with `MethodNotFound`. Used by
 * surfaces that don't host MCP traffic (browser-side stubs and tests).
 */
export class NullMcpHostService implements IMcpHostService {
	declare readonly _serviceBrand: undefined;

	readonly serverCapabilities: ServerMcpCapabilities = {};

	setSessionServers(_session: URI, _servers: readonly IMcpServerDefinition[]): readonly IMcpServerHandle[] {
		return [];
	}

	getServer(_resource: URI): IMcpServerHandle | undefined {
		return undefined;
	}

	async sendMessage(_params: McpMessageParams, _client: IMcpClientContext): Promise<McpMessageResult> {
		throw new ProtocolError(JsonRpcErrorCodes.MethodNotFound, 'mcpMessage is not supported by this host');
	}

	deliverResponse(_mcpServer: URI, _messageId: string, _response: McpRpcCallResponse): void {
		// no-op
	}
}
