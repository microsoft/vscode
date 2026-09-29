/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotClient } from '@github/copilot-sdk';
import assert from 'assert';
import { spy } from 'sinon';
import { Emitter } from '../../../../base/common/event.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { dirname } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getCopilotMcpConfigurationPath } from '../../../environment/common/copilotHome.js';
import { FileChangesEvent, FileChangeType, IFileService } from '../../../files/common/files.js';
import { NullLogService } from '../../../log/common/log.js';
import { CopilotMcpDiscovery } from '../../node/copilot/copilotMcpDiscovery.js';

suite('CopilotMcpDiscovery', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setupDiscovery() {
		const calls: string[] = [];
		const watchers = new Map<string, Emitter<FileChangesEvent>>();
		let failReload = false;
		const fileService = new class extends mock<IFileService>() {
			override createWatcher(resource: URI) {
				const emitter = new Emitter<FileChangesEvent>();
				watchers.set(resource.toString(), emitter);
				return {
					onDidChange: emitter.event,
					dispose: () => { watchers.delete(resource.toString()); emitter.dispose(); },
				};
			}
		}();
		const rpc = new class extends mock<CopilotClient['rpc']>() {
			override readonly mcp = new class extends mock<CopilotClient['rpc']['mcp']>() {
				override readonly config = new class extends mock<CopilotClient['rpc']['mcp']['config']>() {
					override reload = async () => {
						calls.push('reload');
						if (failReload) {
							throw new Error('reload failed');
						}
					};
					override list = async () => {
						calls.push('list');
						return { servers: { personal: { command: 'secret-command', args: ['secret-arg'], env: { TOKEN: 'secret-token' }, tools: ['*'] } } };
					};
				}();
				override discover = async (params: Parameters<CopilotClient['rpc']['mcp']['discover']>[0]) => {
					calls.push(`discover:${params.workingDirectory}:${params.includeEffectiveSource}`);
					return { servers: [] };
				};
			}();
		}();
		const client = new class extends mock<CopilotClient>() {
			override get rpc() { return rpc; }
		}();
		const home = URI.file('/test-home');
		const config = URI.file(getCopilotMcpConfigurationPath(home.fsPath, process.env));
		const logService = new NullLogService();
		const debug = spy(logService, 'debug');
		store.add(toDisposable(() => debug.restore()));
		const discovery = store.add(new CopilotMcpDiscovery(async () => client, home, fileService, logService));
		const fire = (watched: URI, resource: URI, type: FileChangeType) =>
			watchers.get(watched.toString())?.fire(new FileChangesEvent([{ resource, type }], false));
		return { discovery, calls, watchers, config, fire, logs: () => debug.getCalls().map(call => call.args), failReload: (value: boolean) => { failReload = value; } };
	}

	test('reloads external config edits before querying, without any session RPC', async () => {
		const h = setupDiscovery();
		await h.discovery.discover(undefined);
		h.fire(dirname(h.config), h.config, FileChangeType.UPDATED);
		await h.discovery.discover(URI.file('/workspace'));
		await h.discovery.discover(undefined);
		assert.deepStrictEqual({ calls: h.calls, logs: h.logs() }, {
			calls: ['list', 'reload', 'discover:/workspace:true', 'list'],
			logs: [
				['[Copilot:McpDiscovery] Querying user declarations: method=mcp.config.list'],
				['[Copilot:McpDiscovery] User configuration invalidated: reason=userConfigFileChanged'],
				['[Copilot:McpDiscovery] Reloading user configuration: method=mcp.config.reload'],
				['[Copilot:McpDiscovery] User configuration reloaded'],
				['[Copilot:McpDiscovery] Querying workspace catalog: method=mcp.discover, includeEffectiveSource=true'],
				['[Copilot:McpDiscovery] Querying user declarations: method=mcp.config.list'],
			],
		});
	});

	test('observes creation of a missing configuration directory and cleans up watchers', async () => {
		const h = setupDiscovery();
		await h.discovery.discover(undefined);
		h.fire(dirname(dirname(h.config)), dirname(h.config), FileChangeType.ADDED);
		await h.discovery.discover(undefined);
		h.discovery.dispose();
		assert.deepStrictEqual({ calls: h.calls, watchers: h.watchers.size, invalidation: h.logs()[1] }, {
			calls: ['list', 'reload', 'list'],
			watchers: 0,
			invalidation: ['[Copilot:McpDiscovery] User configuration invalidated: reason=userConfigDirectoryChanged'],
		});
	});

	test('does not query after failed invalidation and retries reload on the next request', async () => {
		const h = setupDiscovery();
		h.fire(dirname(h.config), h.config, FileChangeType.DELETED);
		h.failReload(true);
		await assert.rejects(h.discovery.discover(undefined), /reload failed/);
		h.failReload(false);
		await h.discovery.discover(undefined);
		assert.deepStrictEqual({ calls: h.calls, logs: h.logs() }, {
			calls: ['reload', 'reload', 'list'],
			logs: [
				['[Copilot:McpDiscovery] User configuration invalidated: reason=userConfigFileChanged'],
				['[Copilot:McpDiscovery] Reloading user configuration: method=mcp.config.reload'],
				['[Copilot:McpDiscovery] Reloading user configuration: method=mcp.config.reload'],
				['[Copilot:McpDiscovery] User configuration reloaded'],
				['[Copilot:McpDiscovery] Querying user declarations: method=mcp.config.list'],
			],
		});
	});
});
