/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { URI } from '../../../../../base/common/uri.js';
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

	test('keeps a workspace default cwd as a URI', async () => {
		const contents = VSBuffer.fromString(JSON.stringify({
			mcpServers: {
				'echo': { command: '/bin/echo', args: ['hello'] },
			},
		}));
		const defaultCwd = URI.parse('vscode-remote://ssh-remote+linux/home/test/workspace');

		const defs = await claudeConfigToServerDefinition('prefix', contents, { defaultCwd });
		const legacyDefs = await claudeConfigToServerDefinition('prefix', contents, { cwd: defaultCwd });
		assert.ok(defs);
		assert.ok(legacyDefs);
		assert.strictEqual(defs.length, 1);

		const launch = defs[0].launch;
		if (launch.type !== McpServerTransportType.Stdio) {
			assert.fail(`Expected Stdio launch, got ${launch.type}`);
		}
		assert.deepStrictEqual({
			cwd: launch.cwd,
			defaultCwd: defs[0].defaultCwd?.toString(),
			preservesTrustedNonce: defs[0].cacheNonce === legacyDefs[0].cacheNonce,
		}, {
			cwd: undefined,
			defaultCwd: defaultCwd.toString(),
			preservesTrustedNonce: true,
		});
	});

	test('preserves a native discovery cwd', async () => {
		const contents = VSBuffer.fromString(JSON.stringify({
			mcpServers: {
				'echo': { command: 'echo' },
			},
		}));
		const cwd = URI.file('/home/test');

		const defs = await claudeConfigToServerDefinition('prefix', contents, { cwd });
		assert.ok(defs);
		assert.strictEqual(defs.length, 1);

		const launch = defs[0].launch;
		if (launch.type !== McpServerTransportType.Stdio) {
			assert.fail(`Expected Stdio launch, got ${launch.type}`);
		}
		assert.deepStrictEqual({
			cwd: launch.cwd,
			defaultCwd: defs[0].defaultCwd,
		}, {
			cwd: cwd.fsPath,
			defaultCwd: undefined,
		});
	});
});
