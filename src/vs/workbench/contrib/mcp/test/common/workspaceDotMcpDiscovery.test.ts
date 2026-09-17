/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileChangesEvent, FileChangeType, IFileContent, IFileService } from '../../../../../platform/files/common/files.js';
import { StorageScope } from '../../../../../platform/storage/common/storage.js';
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
					const existing = collections.get(collection.id);
					if (existing && !existing.lazy) {
						return Disposable.None;
					}
					collections.set(collection.id, collection);
					if (!collection.lazy) {
						collectionChanges.fire();
					}
					return toDisposable(() => {
						if (collections.get(collection.id) === collection) {
							collections.delete(collection.id);
							if (!collection.lazy) {
								collectionChanges.fire();
							}
						}
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
				trust: McpServerTrust.Kind.Trusted,
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

	test('registers an awaitable collection before the initial file read completes', async () => {
		const folderUri = URI.file('workspace');
		const folder = new WorkspaceFolder({ uri: folderUri, name: 'workspace', index: 0 });
		const initialRead = new DeferredPromise<IFileContent>();
		const fileService = upcastPartial<IFileService>({
			readFile: () => initialRead.p,
			createWatcher: () => ({
				onDidChange: Event.None,
				dispose: () => { },
			}),
		});
		const workspaceContextService = upcastPartial<IWorkspaceContextService>({
			onDidChangeWorkspaceFolders: Event.None,
			getWorkspace: () => upcastPartial<IWorkspace>({ folders: [folder] }),
		});
		let collections: McpCollectionDefinition[] = [];
		const registry = upcastPartial<IMcpRegistry>({
			registerCollection: collection => {
				const existing = collections.find(candidate => candidate.id === collection.id);
				if (existing && !existing.lazy) {
					return Disposable.None;
				}
				collections = existing
					? collections.map(candidate => candidate === existing ? collection : candidate)
					: [...collections, collection];
				return toDisposable(() => collections = collections.filter(candidate => candidate !== collection));
			},
		});
		const remoteAgentService = upcastPartial<IRemoteAgentService>({
			getConnection: () => null,
		});
		const discovery = store.add(new WorkspaceDotMcpDiscovery(fileService, workspaceContextService, registry, remoteAgentService));

		discovery.start();
		const lazyCollection = collections[0];
		assert.ok(lazyCollection?.lazy);
		const initialCollectionTrust = {
			scope: lazyCollection.scope,
			trustBehavior: lazyCollection.trustBehavior,
		};

		let loadCompleted = false;
		const load = lazyCollection.lazy.load().then(() => loadCompleted = true);
		await Promise.resolve();
		const loadCompletedBeforeRead = loadCompleted;
		initialRead.complete(upcastPartial<IFileContent>({
			value: VSBuffer.fromString(JSON.stringify({
				mcpServers: {
					server: { command: 'server-command' },
				},
			})),
		}));
		await load;

		assert.deepStrictEqual({
			initialCollectionTrust,
			loadCompletedBeforeRead,
			loadCompleted,
			collections: collections.map(collection => ({
				id: collection.id,
				lazy: !!collection.lazy,
				scope: collection.scope,
				trustBehavior: collection.trustBehavior,
				servers: collection.serverDefinitions.get().map(server => server.label),
			})),
		}, {
			initialCollectionTrust: {
				scope: StorageScope.WORKSPACE,
				trustBehavior: McpServerTrust.Kind.Trusted,
			},
			loadCompletedBeforeRead: false,
			loadCompleted: true,
			collections: [{
				id: 'workspace-dot-mcp.0',
				lazy: false,
				scope: StorageScope.WORKSPACE,
				trustBehavior: McpServerTrust.Kind.Trusted,
				servers: ['server'],
			}],
		});
	});
});
