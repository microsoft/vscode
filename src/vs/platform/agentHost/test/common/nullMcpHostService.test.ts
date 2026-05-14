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

suite('NullMcpHostService', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

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

	test('callMethod rejects with MethodNotFound ProtocolError', async () => {
		const service = new NullMcpHostService();
		const error = await service.callMethod(
			{ server: 'mcp:/session-1/test-server', method: 'tools/list', params: {} },
		).then(() => undefined, (err: unknown) => err);

		assert.ok(error instanceof ProtocolError);
		assert.strictEqual(error.code, JsonRpcErrorCodes.MethodNotFound);
	});

	test('notify is a no-op', () => {
		const service = new NullMcpHostService();
		service.notify({ server: 'mcp:/session-1/test-server', method: 'notifications/message', params: {} });
	});

	test('setUpstreamDelegate returns a disposable that does not throw', () => {
		const service = new NullMcpHostService();
		const reg = service.setUpstreamDelegate({
			handleUpstreamRequest: async () => ({ result: {} }),
			handleUpstreamNotification: () => { /* no-op */ },
		});
		reg.dispose();
	});
});

