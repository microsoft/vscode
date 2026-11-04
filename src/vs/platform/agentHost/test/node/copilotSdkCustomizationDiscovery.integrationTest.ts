/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CopilotClient } from '@github/copilot-sdk';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable, DisposableStore, type IDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { join } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { DiskFileSystemProvider } from '../../../files/node/diskFileSystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { hasReadableCustomizationContent } from '../../common/agentHostCustomizationUri.js';
import { readCustomizationDiscoveryMeta } from '../../common/meta/customizationDiscoveryMeta.js';
import { CustomizationType, McpServerStatus } from '../../common/state/protocol/state.js';
import { createCopilotCliEnvironment } from '../../node/copilot/copilotCliEnvironment.js';
import { SessionCustomizationDiscovery } from '../../node/copilot/sessionCustomizationDiscovery.js';
import { initTestGitRepo } from './e2e/harness/agentHostE2ETestHarness.js';
import { createIsolatedProviderEnvironment } from './providerTestEnvironment.js';

suite('Copilot SDK - customization discovery', function () {
	this.timeout(60_000);
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('fills the standalone SDK workspace hook discovery gap without starting a session', async () => {
		const store = disposables.add(new DisposableStore());
		const home = await realpath(await mkdtemp(join(tmpdir(), 'copilot-workspace-hooks-')));
		const workspace = join(home, 'workspace');
		const client = new CopilotClient({
			mode: 'copilot-cli', baseDirectory: home, useLoggedInUser: false,
			env: createCopilotCliEnvironment(createIsolatedProviderEnvironment(home, {
				PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR,
				COPILOT_TELEMETRY_ENABLED: 'false',
			})),
		});
		try {
			await mkdir(join(workspace, '.github', 'hooks'), { recursive: true });
			initTestGitRepo(workspace);
			await writeFile(join(workspace, '.github', 'hooks', 'test.json'), JSON.stringify({
				version: 1, hooks: { preToolUse: [{ type: 'command', bash: 'exit 1', powershell: 'exit 1' }] },
			}));
			await client.start();
			const native = await client.rpc.hooks.discover({ projectPaths: [workspace] });
			const log = new NullLogService();
			const files = store.add(new FileService(log));
			store.add(files.registerProvider(Schemas.file, store.add(new class extends DiskFileSystemProvider {
				override watch(): IDisposable { return Disposable.None; }
			}(log))));
			const discovery = store.add(new SessionCustomizationDiscovery([URI.file(workspace)], URI.file(home), URI.file, files, log));
			const result = await discovery.discover(client, CancellationToken.None);
			// Remove the native-gap assertion with the workaround when runtime #30644 is fixed.
			assert.deepStrictEqual({
				native: native.hooks.map(hook => hook.hookType),
				published: result.flatMap(item => item.children ?? []).filter(item => item.type === CustomizationType.Hook).map(hook => ({
					name: hook.name, enabled: hook.enabled, source: readCustomizationDiscoveryMeta(hook)?.source,
					readable: hasReadableCustomizationContent(URI.parse(hook.uri)),
				})),
			}, {
				native: [],
				published: [{ name: 'preToolUse', enabled: true, source: 'repository', readable: false }],
			});
		} finally {
			store.clear();
			try {
				await client.stop();
			} finally {
				await rm(home, { recursive: true, force: true });
			}
		}
	});

	test('publishes hooks-only and MCP-only installations without starting a session', async () => {
		const store = disposables.add(new DisposableStore());
		const home = await realpath(await mkdtemp(join(tmpdir(), 'copilot-discovery-')));
		const client = new CopilotClient({
			mode: 'copilot-cli', baseDirectory: home, useLoggedInUser: false,
			env: createCopilotCliEnvironment(createIsolatedProviderEnvironment(home, {
				PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR,
				COPILOT_TELEMETRY_ENABLED: 'false',
			})),
		});
		try {
			for (const name of ['hooks-inventory', 'mcp-inventory']) {
				const root = join(home, name);
				await mkdir(join(root, '.plugin'), { recursive: true });
				await writeFile(join(root, '.plugin', 'plugin.json'), JSON.stringify({ name, version: '1.0.0' }));
			}
			await mkdir(join(home, 'hooks-inventory', 'hooks'));
			await writeFile(join(home, 'hooks-inventory', 'hooks', 'hooks.json'), JSON.stringify({
				version: 1, hooks: { sessionStart: [{ type: 'command', bash: 'exit 1', powershell: 'exit 1' }] },
			}));
			await writeFile(join(home, 'mcp-inventory', '.mcp.json'), JSON.stringify({
				mcpServers: { 'inventory-server': { type: 'stdio', command: 'must-not-start-during-discovery', args: [], tools: ['*'] } },
			}));
			await client.start();
			const installations = [];
			for (const name of ['hooks-inventory', 'mcp-inventory']) {
				installations.push(await client.rpc.plugins.install({ source: join(home, name) }));
			}
			const log = new NullLogService();
			const files = store.add(new FileService(log));
			store.add(files.registerProvider(Schemas.file, store.add(new class extends DiskFileSystemProvider {
				// This test refreshes explicitly; filesystem watch behavior has separate unit coverage.
				override watch(): IDisposable { return Disposable.None; }
			}(log))));
			const discovery = store.add(new SessionCustomizationDiscovery([URI.file(home)], URI.file(home), URI.file, files, log));
			const customizations = await discovery.discover(client, CancellationToken.None);
			const children = customizations.flatMap(item => item.type === CustomizationType.McpServer ? [item] : item.children ?? []);
			assert.deepStrictEqual({
				hooks: children.filter(item => item.type === CustomizationType.Hook).map(item => ({
					name: item.name, enabled: item.enabled, source: readCustomizationDiscoveryMeta(item)?.source,
					readable: hasReadableCustomizationContent(URI.parse(item.uri)),
				})),
				mcp: children.filter(item => item.type === CustomizationType.McpServer).map(item => ({
					name: item.name, state: item.state.kind, source: readCustomizationDiscoveryMeta(item)?.source,
					enabled: readCustomizationDiscoveryMeta(item)?.defaultEnabled,
				})),
			}, {
				hooks: [{ name: 'sessionStart', enabled: true, source: 'plugin', readable: false }],
				mcp: [{ name: 'inventory-server', state: McpServerStatus.Stopped, source: 'plugin', enabled: true }],
			});
			for (const { plugin } of installations) {
				await client.rpc.plugins.uninstall({ name: plugin.name, directSourceId: plugin.directSourceId });
			}
			const removed = await discovery.discover(client, CancellationToken.None);
			assert.deepStrictEqual(removed.flatMap(item => item.type === CustomizationType.McpServer ? [item] : item.children ?? []), []);
		} finally {
			store.clear();
			try {
				await client.stop();
			} finally {
				await rm(home, { recursive: true, force: true });
			}
		}
	});
});
