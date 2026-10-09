/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CopilotClient } from '@github/copilot-sdk';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from '../../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../log/common/log.js';
import { buildManagedDomainBoundary } from '../../../common/agentHostManagedRules.js';
import { createCopilotCliEnvironment } from '../../../node/copilot/copilotCliEnvironment.js';
import { createIsolatedProviderEnvironment } from '../providerTestEnvironment.js';

suite('Agent Host Provider Integration - managed limitTo', function () {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('enforces native fetch boundaries and preserves independent sandbox disablement without network operations', async function () {
		this.timeout(60_000);
		const home = await mkdtemp(join(tmpdir(), 'copilot-limitto-'));
		const client = new CopilotClient({
			mode: 'empty', baseDirectory: home, useLoggedInUser: false,
			env: createCopilotCliEnvironment(createIsolatedProviderEnvironment(home, {
				PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR,
				COPILOT_CLI_PATH: process.env.COPILOT_CLI_PATH,
				COPILOT_TELEMETRY_ENABLED: 'false',
			})),
		});
		try {
			await client.start();
			const urls = ['https://api.example.com/', 'http://api.example.com:8080/', 'https://outside.example/'];
			const operations = urls.map(url => ({ kind: 'url' as const, url }));
			const contexts: Parameters<CopilotClient['rpc']['managedSettings']['permissions']['evaluate']>[0]['context'][] = [
				{ failClosed: false },
				{ permissions: { limitTo: ['Domain(api.example.com)'] }, failClosed: false },
				{ permissions: { limitTo: [] }, failClosed: false },
				{ permissions: { limitTo: ['Domain(api.example.com)'], deny: ['Domain(api.example.com)'] }, failClosed: false },
				{ permissions: { limitTo: ['Domain(api.example.com)'], ask: ['Domain(api.example.com)'] }, failClosed: false },
				{ permissions: { limitTo: ['Domain(api.example.com)'] }, failClosed: true },
			];
			const results = [];
			for (const context of contexts) {
				results.push((await client.rpc.managedSettings.permissions.evaluate({ context, operations })).results.map(result => result.verdict));
			}
			assert.deepStrictEqual(results, [
				['unmanaged', 'unmanaged', 'unmanaged'],
				['unmanaged', 'unmanaged', 'deny'],
				['deny', 'deny', 'deny'],
				['deny', 'ask', 'deny'],
				['ask', 'ask', 'deny'],
				['deny', 'deny', 'deny'],
			]);
			const wildcard = await client.rpc.managedSettings.permissions.evaluate({
				context: { failClosed: false, permissions: { limitTo: ['Domain(*.example.com)'] } },
				operations: ['https://example.com/', 'https://api.example.com/', 'http://api.example.com:8080/', 'https://outside.test/'].map(url => ({ kind: 'url', url })),
			});
			assert.deepStrictEqual(wildcard.results.map(result => result.verdict), ['unmanaged', 'unmanaged', 'unmanaged', 'deny']);
			let permissionRequests = 0;
			const session = await client.createSession({
				workingDirectory: home,
				availableTools: ['builtin:web_fetch'],
				enableConfigDiscovery: false,
				enableManagedSettings: false,
				disabledMcpServers: ['github-mcp-server'],
				mcpServers: {},
				managedSettings: { permissions: { limitTo: buildManagedDomainBoundary(['api.example.com'], new NullLogService()) } },
				onPermissionRequest: () => { permissionRequests++; return { kind: 'reject' }; },
			});
			try {
				const before = await session.rpc.managedSettings.get();
				const disabled = await session.rpc.options.update({ sandboxConfig: { enabled: false } });
				const after = await session.rpc.managedSettings.get();
				await session.rpc.tools.initializeAndValidate();
				const mode = await session.rpc.permissions.setMode({ mode: 'allow-all' });
				const tools = await session.rpc.tools.getCurrentMetadata();
				const fetch = await session.rpc.tools.execute({ name: 'web_fetch', arguments: { url: 'http://127.0.0.1:1/outside' } });
				assert.ok(before.permissionsContext);
				assert.ok(tools.tools);
				assert.ok(typeof fetch !== 'string');
				assert.deepStrictEqual({
					disabled: disabled.success,
					sandbox: after.settings && typeof after.settings === 'object' && !Array.isArray(after.settings) ? after.settings.sandbox : undefined,
					verdicts: (await client.rpc.managedSettings.permissions.evaluate({ context: before.permissionsContext, operations })).results.map(result => result.verdict),
					mode: mode.mode,
					tools: tools.tools.map(tool => tool.name),
					fetch: fetch.resultType,
					permissionRequests,
				}, {
					disabled: true, sandbox: undefined, verdicts: ['unmanaged', 'unmanaged', 'deny'],
					mode: 'allow-all', tools: ['web_fetch'], fetch: 'denied', permissionRequests: 0,
				});
			} finally {
				await session.disconnect();
			}
		} finally {
			try {
				assert.deepStrictEqual(await client.stop(), []);
			} finally {
				await rm(home, { recursive: true, force: true });
			}
		}
	});
});
