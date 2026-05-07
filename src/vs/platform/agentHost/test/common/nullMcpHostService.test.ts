/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { McpServerType } from '../../../mcp/common/mcpPlatformTypes.js';
import type { IMcpServerDefinition } from '../../../agentPlugins/common/pluginParsers.js';
import { NullMcpHostService } from '../../common/mcpHost/nullMcpHostService.js';
import { JsonRpcErrorCodes, ProtocolError } from '../../common/state/sessionProtocol.js';
import type { McpRpcCallResponse } from '../../common/state/protocol/state.js';

suite('NullMcpHostService', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('serverCapabilities is an empty object', () => {
		const service = new NullMcpHostService();
		assert.deepStrictEqual(service.serverCapabilities, {});
	});

	test('setSessionServers returns an empty array', () => {
		const service = new NullMcpHostService();
		const session = URI.parse('agent-session:/session-1');
		const def: IMcpServerDefinition = {
			name: 'test-server',
			uri: URI.file('/plugin'),
			configuration: {
				type: McpServerType.LOCAL,
				command: 'node',
			},
		};

		const handles = service.setSessionServers(session, [def]);
		assert.deepStrictEqual(handles, []);
	});

	test('getServer returns undefined', () => {
		const service = new NullMcpHostService();
		const resource = URI.parse('mcp:/session-1/test-server');
		assert.strictEqual(service.getServer(resource), undefined);
	});

	test('sendMessage rejects with MethodNotFound ProtocolError', async () => {
		const service = new NullMcpHostService();
		const error = await service.sendMessage(
			{ server: 'mcp:/session-1/test-server', method: 'tools/list', params: {} },
			{ clientId: 'client-1', capabilities: undefined },
		).then(() => undefined, err => err);

		assert.ok(error instanceof ProtocolError);
		assert.strictEqual(error.code, JsonRpcErrorCodes.MethodNotFound);
	});

	test('deliverResponse is a no-op and returns nothing', () => {
		const service = new NullMcpHostService();
		const response: McpRpcCallResponse = { jsonrpc: '2.0', id: 1, result: {} };
		const result = service.deliverResponse(URI.parse('mcp:/session-1/test-server'), 'msg-1', response);
		assert.strictEqual(result, undefined);
	});
});
