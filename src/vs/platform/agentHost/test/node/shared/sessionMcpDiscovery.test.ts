/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileService } from '../../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../log/common/log.js';
import { McpServerType } from '../../../../mcp/common/mcpPlatformTypes.js';
import { SessionMcpDiscovery } from '../../../node/shared/sessionMcpDiscovery.js';

suite('SessionMcpDiscovery', () => {

	const store = new DisposableStore();
	let fileService: FileService;
	const primary = URI.from({ scheme: Schemas.inMemory, path: '/primary' });
	const additional = URI.from({ scheme: Schemas.inMemory, path: '/additional' });

	setup(() => {
		fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider(Schemas.inMemory, store.add(new InMemoryFileSystemProvider())));
	});

	teardown(() => store.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	async function write(root: URI, value: unknown): Promise<void> {
		await fileService.writeFile(URI.joinPath(root, '.mcp.json'), VSBuffer.fromString(JSON.stringify(value)));
	}

	test('discovers every root with primary-first duplicate handling and URI defaults', async () => {
		await write(primary, {
			mcpServers: {
				duplicate: { command: 'primary-command' },
				primary: { type: 'stdio', command: 'primary' },
			}
		});
		await write(additional, {
			mcpServers: {
				duplicate: { command: 'additional-command' },
				additional: { type: 'streamable-http', url: 'https://example.com/mcp' },
			}
		});

		const discovery = store.add(new SessionMcpDiscovery([primary, additional], fileService));
		const definitions = await discovery.refresh();

		assert.deepStrictEqual(definitions.map(definition => definition.name), ['duplicate', 'primary', 'additional']);
		assert.strictEqual(definitions[0].configuration.type, McpServerType.LOCAL);
		assert.strictEqual(definitions[0].configuration.type === McpServerType.LOCAL ? definitions[0].configuration.command : undefined, 'primary-command');
		assert.strictEqual(definitions[0].defaultCwd, primary);
		assert.strictEqual(definitions[2].defaultCwd, additional);
		assert.strictEqual(definitions[2].uri.toString(), URI.joinPath(additional, '.mcp.json').toString());
	});

	test('preserves an explicit cwd while retaining the owning root as the default', async () => {
		await write(primary, {
			mcpServers: {
				server: { command: 'server', cwd: './custom' },
			}
		});

		const discovery = store.add(new SessionMcpDiscovery([primary], fileService));
		const [definition] = await discovery.refresh();

		assert.strictEqual(definition.configuration.type, McpServerType.LOCAL);
		assert.strictEqual(definition.configuration.type === McpServerType.LOCAL ? definition.configuration.cwd : undefined, './custom');
		assert.strictEqual(definition.defaultCwd, primary);
	});

	test('ignores malformed files and refreshes after an exact file change', async () => {
		await fileService.writeFile(URI.joinPath(primary, '.mcp.json'), VSBuffer.fromString('{ malformed'));
		const discovery = store.add(new SessionMcpDiscovery([primary], fileService));
		assert.deepStrictEqual(await discovery.refresh(), []);

		const changed = Event.toPromise(discovery.onDidChange);
		await write(primary, { mcpServers: { server: { command: 'server' } } });
		const definitions = await changed;

		assert.deepStrictEqual(definitions.map(definition => definition.name), ['server']);
		assert.strictEqual(discovery.definitions, definitions);
	});

	test('removes definitions when a workspace config is deleted', async () => {
		await write(primary, { mcpServers: { server: { command: 'server' } } });
		const discovery = store.add(new SessionMcpDiscovery([primary], fileService));
		assert.deepStrictEqual((await discovery.refresh()).map(definition => definition.name), ['server']);

		const changed = Event.toPromise(discovery.onDidChange);
		await fileService.del(URI.joinPath(primary, '.mcp.json'));

		assert.deepStrictEqual(await changed, []);
		assert.deepStrictEqual(discovery.definitions, []);
	});
});
