/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IFileContent, IFileService } from '../../../../../platform/files/common/files.js';
import { StorageScope } from '../../../../../platform/storage/common/storage.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { WorkspaceDotMcpDiscovery } from '../../common/discovery/workspaceDotMcpDiscovery.js';
import { IMcpRegistry } from '../../common/mcpRegistryTypes.js';
import { McpCollectionDefinition, McpServerTrust } from '../../common/mcpTypes.js';

suite('WorkspaceDotMcpDiscovery', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('registers an awaitable collection before the initial file read completes', async () => {
		const folderUri = URI.file('workspace');
		const folder: IWorkspaceFolder = {
			uri: folderUri,
			name: 'workspace',
			index: 0,
			toResource: relativePath => joinPath(folderUri, relativePath),
		};
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
