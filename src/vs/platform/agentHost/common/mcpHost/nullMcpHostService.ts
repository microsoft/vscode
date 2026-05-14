/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IMcpServerDefinition } from '../../../agentPlugins/common/pluginParsers.js';
import { McpMethodCallParams, McpMethodCallResult, McpNotificationParams } from '../state/protocol/commands.js';
import type { McpServerSummary } from '../state/protocol/state.js';
import { JsonRpcErrorCodes, ProtocolError } from '../state/sessionProtocol.js';
import { IMcpHostService, IMcpHostUpstreamDelegate, IMcpServerHandle } from './mcpHostService.js';

/**
 * No-op {@link IMcpHostService}. Returns no servers, refuses `mcpMethodCall`
 * requests with `MethodNotFound`, and silently drops `mcpNotification`s.
 * Used by surfaces that don't host MCP traffic (browser-side stubs and tests).
 */
export class NullMcpHostService implements IMcpHostService {
	declare readonly _serviceBrand: undefined;

	setSessionServers(_session: URI, _servers: readonly IMcpServerDefinition[]): readonly IMcpServerHandle[] {
		return [];
	}

	getServerSummaries(_session: URI): readonly McpServerSummary[] {
		return [];
	}

	getServer(_resource: URI): IMcpServerHandle | undefined {
		return undefined;
	}

	async callMethod(_params: McpMethodCallParams): Promise<McpMethodCallResult> {
		throw new ProtocolError(JsonRpcErrorCodes.MethodNotFound, 'mcpMethodCall is not supported by this host');
	}

	notify(_params: McpNotificationParams): void {
		// no-op
	}

	setUpstreamDelegate(_delegate: IMcpHostUpstreamDelegate): IDisposable {
		return { dispose: () => { /* no-op */ } };
	}
}


