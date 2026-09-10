/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileChangesEvent, FileChangeType, IFileContent, IFileService } from '../../../../../platform/files/common/files.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFoldersChangeEvent, toWorkspaceFolder, WorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { claudeConfigToServerDefinition } from '../../common/discovery/nativeMcpDiscoveryAdapters.js';
import { WorkspaceDotMcpDiscovery } from '../../common/discovery/workspaceDotMcpDiscovery.js';
import { IMcpRegistry } from '../../common/mcpRegistryTypes.js';
import { McpCollectionDefinition, McpCollectionProvenance, McpServerTransportType, McpServerTrust } from '../../common/mcpTypes.js';

suite('MCP Discovery - workspaceDotMcpDiscovery', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const root = URI.file('/workspace');
	const resource = URI.joinPath(root, '.mcp.json');

	function fixture(initialContent: string | undefined) {
		let content = initialContent;
		let folder = toWorkspaceFolder(root);
		let delayNextRead: DeferredPromise<void> | undefined;
		const fileChanges = store.add(new Emitter<FileChangesEvent>());
		const folderChanges = store.add(new Emitter<IWorkspaceFoldersChangeEvent>());
		const collectionChanges = store.add(new Emitter<void>());
		const collections = new Map<string, McpCollectionDefinition>();
		const discovery = store.add(new WorkspaceDotMcpDiscovery(
			upcastPartial<IFileService>({
				createWatcher: () => ({ onDidChange: fileChanges.event, dispose: () => { } }),
				readFile: async () => {
					const snapshot = content;
					const delay = delayNextRead;
					delayNextRead = undefined;
					await delay?.p;
					if (snapshot === undefined) {
						throw new Error('File not found');
					}
					return upcastPartial<IFileContent>({ value: VSBuffer.fromString(snapshot) });
				},
			}),
			upcastPartial<IWorkspaceContextService>({
				onDidChangeWorkspaceFolders: folderChanges.event,
				getWorkspace: () => upcastPartial<IWorkspace>({ folders: [folder] }),
			}),
			upcastPartial<IMcpRegistry>({
				registerCollection: collection => {
					collections.set(collection.id, collection);
					collectionChanges.fire();
					return toDisposable(() => {
						collections.delete(collection.id);
						collectionChanges.fire();
					});
				},
			}),
			upcastPartial<IRemoteAgentService>({ getConnection: () => null }),
		));
		return {
			discovery,
			collections,
			onDidChange: collectionChanges.event,
			pauseNextRead: () => delayNextRead = new DeferredPromise<void>(),
			updateFolderIndex: (index: number) => {
				const previousFolder = folder;
				folder = new WorkspaceFolder({ uri: root, name: folder.name, index });
				folderChanges.fire({ added: [], removed: [], changed: [previousFolder] });
			},
			update: (next: string | undefined) => {
				content = next;
				fileChanges.fire(new FileChangesEvent([{ resource, type: next === undefined ? FileChangeType.DELETED : FileChangeType.UPDATED }], false));
			},
		};
	}

	test('updates collection and server IDs when the workspace folder index changes', async () => {
		const f = fixture('{"mcpServers":{"server":{"command":"node"}}}');
		const initial = Event.toPromise(f.onDidChange);
		f.discovery.start();
		await initial;
		const changed = Event.toPromise(Event.filter(f.onDidChange, () => f.collections.has('workspace-dot-mcp.2')));
		f.updateFolderIndex(2);
		await changed;
		assert.deepStrictEqual([...f.collections.values()].map(collection => ({
			id: collection.id,
			serverIds: collection.serverDefinitions.get().map(definition => definition.id),
		})), [{
			id: 'workspace-dot-mcp.2',
			serverIds: ['workspace-dot-mcp.2.server'],
		}]);
	});

	for (const wrapped of [true, false]) {
		test(`reads ${wrapped ? 'wrapped' : 'flat'} JSONC without changing IDs, trust nonces or default cwd`, async () => {
			const entries = '"local": { "command": "node", "args": ["server.js"] }, "invalid": null, "remote": { "url": "https://example.com/mcp", "headers": { "Authorization": "value" } },';
			const f = fixture(wrapped ? `{ /* comment */ "mcpServers": { ${entries} }, }` : `{ /* comment */ ${entries} }`);
			const changed = Event.toPromise(f.onDidChange);
			f.discovery.start();
			await changed;
			const collection = f.collections.get('workspace-dot-mcp.0')!;
			const definitions = collection.serverDefinitions.get();
			const legacy = await claudeConfigToServerDefinition('workspace-dot-mcp.0', VSBuffer.fromString(JSON.stringify({
				mcpServers: {
					local: { command: 'node', args: ['server.js'] },
					remote: { url: 'https://example.com/mcp', headers: { Authorization: 'value' } },
				},
			})), { defaultCwd: root });
			assert.deepStrictEqual({
				fromGallery: f.discovery.fromGallery,
				provenance: collection.provenance,
				trust: collection.trustBehavior,
				ids: definitions.map(definition => definition.id),
				nonces: definitions.map(definition => definition.cacheNonce),
				defaultCwd: definitions[0].defaultCwd,
				cwd: definitions[0].launch.type === McpServerTransportType.Stdio ? definitions[0].launch.cwd : null,
				roots: definitions.map(definition => definition.roots),
			}, {
				fromGallery: false,
				provenance: McpCollectionProvenance.WorkspaceDotMcp,
				trust: McpServerTrust.Kind.TrustedOnNonce,
				ids: ['workspace-dot-mcp.0.local', 'workspace-dot-mcp.0.remote'],
				nonces: legacy!.map(definition => definition.cacheNonce),
				defaultCwd: root,
				cwd: undefined,
				roots: [[root], [root]],
			});
		});
	}

	test('removes malformed or deleted roots and rediscovers repaired files', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const f = fixture('{"mcpServers":{"server":{"command":"node"}}}');
		let changed = Event.toPromise(f.onDidChange);
		f.discovery.start();
		await changed;

		changed = Event.toPromise(f.onDidChange);
		f.update('{"mcpServers":[]}');
		await changed;
		assert.strictEqual(f.collections.size, 0);

		changed = Event.toPromise(f.onDidChange);
		f.update('{"server":{"command":"repaired"}}');
		await changed;
		assert.deepStrictEqual([...f.collections.values()][0].serverDefinitions.get().map(definition => definition.label), ['server']);

		changed = Event.toPromise(f.onDidChange);
		f.update(undefined);
		await changed;
		assert.strictEqual(f.collections.size, 0);
	}));

	test('does not publish an older malformed read after a newer successful refresh', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const f = fixture('{ malformed');
		const pendingRead = f.pauseNextRead();
		f.discovery.start();
		const changed = Event.toPromise(f.onDidChange);
		f.update('{"mcpServers":{"new":{"command":"node"}}}');
		await changed;
		await pendingRead.complete();
		await timeout(0);
		assert.deepStrictEqual([...f.collections.values()].flatMap(collection => collection.serverDefinitions.get().map(definition => definition.label)), ['new']);
	}));
});
