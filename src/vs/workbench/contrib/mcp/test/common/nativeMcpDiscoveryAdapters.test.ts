/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { claudeConfigToServerDefinition } from '../../common/discovery/nativeMcpDiscoveryAdapters.js';
import { McpServerTransportType } from '../../common/mcpTypes.js';

suite('MCP Discovery - nativeMcpDiscoveryAdapters', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('claudeConfigToServerDefinition forwards HTTP headers', async () => {
		const contents = VSBuffer.fromString(JSON.stringify({
			mcpServers: {
				'with-headers': {
					type: 'http',
					url: 'https://example.com/mcp',
					headers: { 'X-Custom-Header': 'my-value', 'Authorization': 'Bearer abc' },
				},
				'no-headers': {
					type: 'http',
					url: 'https://example.com/other',
				},
				'stdio': {
					command: 'my-cmd',
					args: ['--foo'],
				},
			},
		}));

		const defs = await claudeConfigToServerDefinition('prefix', contents);
		assert.ok(defs);
		assert.strictEqual(defs.length, 3);

		const withHeaders = defs.find(d => d.label === 'with-headers')!;
		assert.strictEqual(withHeaders.launch.type, McpServerTransportType.HTTP);
		assert.deepStrictEqual(
			(withHeaders.launch as { headers: [string, string][] }).headers,
			[['X-Custom-Header', 'my-value'], ['Authorization', 'Bearer abc']],
		);

		const noHeaders = defs.find(d => d.label === 'no-headers')!;
		assert.strictEqual(noHeaders.launch.type, McpServerTransportType.HTTP);
		assert.deepStrictEqual(
			(noHeaders.launch as { headers: [string, string][] }).headers,
			[],
		);

		const stdio = defs.find(d => d.label === 'stdio')!;
		assert.strictEqual(stdio.launch.type, McpServerTransportType.Stdio);
	});
});
