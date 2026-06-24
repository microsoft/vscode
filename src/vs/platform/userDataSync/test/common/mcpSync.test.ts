/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IFileService } from '../../../files/common/files.js';
import { ILogService } from '../../../log/common/log.js';
import { IUserDataProfilesService } from '../../../userDataProfile/common/userDataProfile.js';
import { getMcpContentFromSyncContent, McpSynchroniser } from '../../common/mcpSync.js';
import { Change, IUserDataSyncStoreService, MergeState, SyncResource, SyncStatus } from '../../common/userDataSync.js';
import { UserDataSyncClient, UserDataSyncTestServer } from './userDataSyncClient.js';

suite('McpSync', () => {

	const server = new UserDataSyncTestServer();
	let client: UserDataSyncClient;

	let testObject: McpSynchroniser;

	teardown(async () => {
		await client.instantiationService.get(IUserDataSyncStoreService).clear();
	});

	const disposableStore = ensureNoDisposablesAreLeakedInTestSuite();

	setup(async () => {
		client = disposableStore.add(new UserDataSyncClient(server));
		await client.setUp(true);
		testObject = client.getSynchronizer(SyncResource.Mcp) as McpSynchroniser;
	});

	test('when mcp file does not exist', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const fileService = client.instantiationService.get(IFileService);
			const mcpResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;

			assert.deepStrictEqual(await testObject.getLastSyncUserData(), null);
			let manifest = await client.getLatestRef(SyncResource.Mcp);
			server.reset();
			await testObject.sync(manifest);

			assert.deepStrictEqual(server.requests, []);
			assert.ok(!await fileService.exists(mcpResource));

			const lastSyncUserData = await testObject.getLastSyncUserData();
			const remoteUserData = await testObject.getRemoteUserData(null);
			assert.deepStrictEqual(lastSyncUserData!.ref, remoteUserData.ref);
			assert.deepStrictEqual(lastSyncUserData!.syncData, remoteUserData.syncData);
			assert.strictEqual(lastSyncUserData!.syncData, null);

			manifest = await client.getLatestRef(SyncResource.Mcp);
			server.reset();
			await testObject.sync(manifest);
			assert.deepStrictEqual(server.requests, []);

			manifest = await client.getLatestRef(SyncResource.Mcp);
			server.reset();
			await testObject.sync(manifest);
			assert.deepStrictEqual(server.requests, []);
		});
	});

	test('when mcp file does not exist and remote has changes', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const client2 = disposableStore.add(new UserDataSyncClient(server));
			await client2.setUp(true);
			const content = JSON.stringify({
				'mcpServers': {
					'test-server': {
						'command': 'node',
						'args': ['./server.js']
					}
				}
			});
			const mcpResource2 = client2.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
			await client2.instantiationService.get(IFileService).writeFile(mcpResource2, VSBuffer.fromString(content));
			await client2.sync();

			const fileService = client.instantiationService.get(IFileService);
			const mcpResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;

			await testObject.sync(await client.getLatestRef(SyncResource.Mcp));

			assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
			const lastSyncUserData = await testObject.getLastSyncUserData();
			const remoteUserData = await testObject.getRemoteUserData(null);
			assert.strictEqual(getMcpContentFromSyncContent(lastSyncUserData!.syncData!.content, client.instantiationService.get(ILogService)), content);
			assert.strictEqual(getMcpContentFromSyncContent(remoteUserData.syncData!.content, client.instantiationService.get(ILogService)), content);
			assert.strictEqual((await fileService.readFile(mcpResource)).value.toString(), content);
		});
	});

	test('when mcp file exists locally and remote has no mcp', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const fileService = client.instantiationService.get(IFileService);
			const mcpResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
			const content = JSON.stringify({
				'mcpServers': {
					'test-server': {
						'command': 'node',
						'args': ['./server.js']
					}
				}
			});
			fileService.writeFile(mcpResource, VSBuffer.fromString(content));

			await testObject.sync(await client.getLatestRef(SyncResource.Mcp));

			assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
			const lastSyncUserData = await testObject.getLastSyncUserData();
			const remoteUserData = await testObject.getRemoteUserData(null);
			assert.strictEqual(getMcpContentFromSyncContent(lastSyncUserData!.syncData!.content, client.instantiationService.get(ILogService)), content);
			assert.strictEqual(getMcpContentFromSyncContent(remoteUserData.syncData!.content, client.instantiationService.get(ILogService)), content);
		});
	});

	test('first time sync: when mcp file exists locally with same content as remote', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const client2 = disposableStore.add(new UserDataSyncClient(server));
			await client2.setUp(true);
			const content = JSON.stringify({
				'mcpServers': {
					'test-server': {
						'command': 'node',
						'args': ['./server.js']
					}
				}
			});
			const mcpResource2 = client2.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
			await client2.instantiationService.get(IFileService).writeFile(mcpResource2, VSBuffer.fromString(content));
			await client2.sync();

			const fileService = client.instantiationService.get(IFileService);
			const mcpResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
			await fileService.writeFile(mcpResource, VSBuffer.fromString(content));

			await testObject.sync(await client.getLatestRef(SyncResource.Mcp));

			assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
			const lastSyncUserData = await testObject.getLastSyncUserData();
			const remoteUserData = await testObject.getRemoteUserData(null);
			assert.strictEqual(getMcpContentFromSyncContent(lastSyncUserData!.syncData!.content, client.instantiationService.get(ILogService)), content);
			assert.strictEqual(getMcpContentFromSyncContent(remoteUserData.syncData!.content, client.instantiationService.get(ILogService)), content);
			assert.strictEqual((await fileService.readFile(mcpResource)).value.toString(), content);
		});
	});

	test('when mcp file locally has moved forward', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const fileService = client.instantiationService.get(IFileService);
			const mcpResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
			fileService.writeFile(mcpResource, VSBuffer.fromString(JSON.stringify({
				'mcpServers': {}
			})));

			await testObject.sync(await client.getLatestRef(SyncResource.Mcp));

			const content = JSON.stringify({
				'mcpServers': {
					'test-server': {
						'command': 'node',
						'args': ['./server.js']
					}
				}
			});
			fileService.writeFile(mcpResource, VSBuffer.fromString(content));

			await testObject.sync(await client.getLatestRef(SyncResource.Mcp));

			assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
			const lastSyncUserData = await testObject.getLastSyncUserData();
			const remoteUserData = await testObject.getRemoteUserData(null);
			assert.strictEqual(getMcpContentFromSyncContent(lastSyncUserData!.syncData!.content, client.instantiationService.get(ILogService)), content);
			assert.strictEqual(getMcpContentFromSyncContent(remoteUserData.syncData!.content, client.instantiationService.get(ILogService)), content);
		});
	});

	test('when mcp file remotely has moved forward', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const client2 = disposableStore.add(new UserDataSyncClient(server));
			await client2.setUp(true);
			const mcpResource2 = client2.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
			const fileService2 = client2.instantiationService.get(IFileService);
			await fileService2.writeFile(mcpResource2, VSBuffer.fromString(JSON.stringify({
				'mcpServers': {}
			})));

			const fileService = client.instantiationService.get(IFileService);
			const mcpResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;

			await client2.sync();
			await testObject.sync(await client.getLatestRef(SyncResource.Mcp));

			const content = JSON.stringify({
				'mcpServers': {
					'test-server': {
						'command': 'node',
						'args': ['./server.js']
					}
				}
			});
			fileService2.writeFile(mcpResource2, VSBuffer.fromString(content));

			await client2.sync();
			await testObject.sync(await client.getLatestRef(SyncResource.Mcp));

			assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
			const lastSyncUserData = await testObject.getLastSyncUserData();
			const remoteUserData = await testObject.getRemoteUserData(null);
			assert.strictEqual(getMcpContentFromSyncContent(lastSyncUserData!.syncData!.content, client.instantiationService.get(ILogService)), content);
			assert.strictEqual(getMcpContentFromSyncContent(remoteUserData.syncData!.content, client.instantiationService.get(ILogService)), content);
			assert.strictEqual((await fileService.readFile(mcpResource)).value.toString(), content);
		});
	});

	test('when mcp file has moved forward locally and remotely with same changes', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const client2 = disposableStore.add(new UserDataSyncClient(server));
			await client2.setUp(true);
			const mcpResource2 = client2.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
			const fileService2 = client2.instantiationService.get(IFileService);
			await fileService2.writeFile(mcpResource2, VSBuffer.fromString(JSON.stringify({
				'mcpServers': {}
			})));

			const fileService = client.instantiationService.get(IFileService);
			const mcpResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;

			await client2.sync();
			await testObject.sync(await client.getLatestRef(SyncResource.Mcp));

			const content = JSON.stringify({
				'mcpServers': {
					'test-server': {
						'command': 'node',
						'args': ['./server.js']
					}
				}
			});
			fileService2.writeFile(mcpResource2, VSBuffer.fromString(content));
			await client2.sync();

			fileService.writeFile(mcpResource, VSBuffer.fromString(content));
			await testObject.sync(await client.getLatestRef(SyncResource.Mcp));

			assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
			const lastSyncUserData = await testObject.getLastSyncUserData();
			const remoteUserData = await testObject.getRemoteUserData(null);
			assert.strictEqual(getMcpContentFromSyncContent(lastSyncUserData!.syncData!.content, client.instantiationService.get(ILogService)), content);
			assert.strictEqual(getMcpContentFromSyncContent(remoteUserData.syncData!.content, client.instantiationService.get(ILogService)), content);
			assert.strictEqual((await fileService.readFile(mcpResource)).value.toString(), content);
		});
	});

	test('when mcp file has moved forward locally and remotely - accept preview', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const client2 = disposableStore.add(new UserDataSyncClient(server));
			await client2.setUp(true);
			const mcpResource2 = client2.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
			const fileService2 = client2.instantiationService.get(IFileService);
			await fileService2.writeFile(mcpResource2, VSBuffer.fromString(JSON.stringify({
				'mcpServers': {}
			})));

			const fileService = client.instantiationService.get(IFileService);
			const mcpResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;

			await client2.sync();
			await testObject.sync(await client.getLatestRef(SyncResource.Mcp));

			fileService2.writeFile(mcpResource2, VSBuffer.fromString(JSON.stringify({
				'mcpServers': {
					'server1': {
						'command': 'node',
						'args': ['./server1.js']
					}
				}
			})));
			await client2.sync();

			const content = JSON.stringify({
				'mcpServers': {
					'server2': {
						'command': 'node',
						'args': ['./server2.js']
					}
				}
			});
			fileService.writeFile(mcpResource, VSBuffer.fromString(content));
			await testObject.sync(await client.getLatestRef(SyncResource.Mcp));

			const previewContent = (await fileService.readFile(testObject.conflicts.conflicts[0].previewResource)).value.toString();
			assert.deepStrictEqual(testObject.status, SyncStatus.HasConflicts);
			assert.deepStrictEqual(testObject.conflicts.conflicts.length, 1);
			assert.deepStrictEqual(testObject.conflicts.conflicts[0].mergeState, MergeState.Conflict);
			assert.deepStrictEqual(testObject.conflicts.conflicts[0].localChange, Change.Modified);
			assert.deepStrictEqual(testObject.conflicts.conflicts[0].remoteChange, Change.Modified);

			await testObject.accept(testObject.conflicts.conflicts[0].previewResource);
			await testObject.apply(false);
			assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
			const lastSyncUserData = await testObject.getLastSyncUserData();
			const remoteUserData = await testObject.getRemoteUserData(null);
			assert.strictEqual(getMcpContentFromSyncContent(lastSyncUserData!.syncData!.content, client.instantiationService.get(ILogService)), previewContent);
			assert.strictEqual(getMcpContentFromSyncContent(remoteUserData.syncData!.content, client.instantiationService.get(ILogService)), previewContent);
			assert.strictEqual((await fileService.readFile(mcpResource)).value.toString(), previewContent);
		});
	});

	test('when mcp file has moved forward locally and remotely - accept modified preview', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const client2 = disposableStore.add(new UserDataSyncClient(server));
			await client2.setUp(true);
			const mcpResource2 = client2.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
			const fileService2 = client2.instantiationService.get(IFileService);
			await fileService2.writeFile(mcpResource2, VSBuffer.fromString(JSON.stringify({
				'mcpServers': {}
			})));

			const fileService = client.instantiationService.get(IFileService);
			const mcpResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;

			await client2.sync();
			await testObject.sync(await client.getLatestRef(SyncResource.Mcp));

			fileService2.writeFile(mcpResource2, VSBuffer.fromString(JSON.stringify({
				'mcpServers': {
					'server1': {
						'command': 'node',
						'args': ['./server1.js']
					}
				}
			})));
			await client2.sync();

			fileService.writeFile(mcpResource, VSBuffer.fromString(JSON.stringify({
				'mcpServers': {
					'server2': {
						'command': 'node',
						'args': ['./server2.js']
					}
				}
			})));
			await testObject.sync(await client.getLatestRef(SyncResource.Mcp));

			const content = JSON.stringify({
				'mcpServers': {
					'server1': {
						'command': 'node',
						'args': ['./server1.js']
					},
					'server2': {
						'command': 'node',
						'args': ['./server2.js']
					}
				}
			});
			await testObject.accept(testObject.conflicts.conflicts[0].previewResource, content);
			await testObject.apply(false);
			assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
			const lastSyncUserData = await testObject.getLastSyncUserData();
			const remoteUserData = await testObject.getRemoteUserData(null);
			assert.strictEqual(getMcpContentFromSyncContent(lastSyncUserData!.syncData!.content, client.instantiationService.get(ILogService)), content);
			assert.strictEqual(getMcpContentFromSyncContent(remoteUserData.syncData!.content, client.instantiationService.get(ILogService)), content);
			assert.strictEqual((await fileService.readFile(mcpResource)).value.toString(), content);
		});
	});

	test('when mcp file has moved forward locally and remotely - accept remote', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const client2 = disposableStore.add(new UserDataSyncClient(server));
			await client2.setUp(true);
			const mcpResource2 = client2.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
			const fileService2 = client2.instantiationService.get(IFileService);
			await fileService2.writeFile(mcpResource2, VSBuffer.fromString(JSON.stringify({
				'mcpServers': {}
			})));

			const fileService = client.instantiationService.get(IFileService);
			const mcpResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;

			await client2.sync();
			await testObject.sync(await client.getLatestRef(SyncResource.Mcp));

			const content = JSON.stringify({
				'mcpServers': {
					'server1': {
						'command': 'node',
						'args': ['./server1.js']
					}
				}
			});
			fileService2.writeFile(mcpResource2, VSBuffer.fromString(content));
			await client2.sync();

			fileService.writeFile(mcpResource, VSBuffer.fromString(JSON.stringify({
				'mcpServers': {
					'server2': {
						'command': 'node',
						'args': ['./server2.js']
					}
				}
			})));
			await testObject.sync(await client.getLatestRef(SyncResource.Mcp));
			assert.deepStrictEqual(testObject.status, SyncStatus.HasConflicts);

			await testObject.accept(testObject.conflicts.conflicts[0].remoteResource);
			await testObject.apply(false);
			assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
			const lastSyncUserData = await testObject.getLastSyncUserData();
			const remoteUserData = await testObject.getRemoteUserData(null);
			assert.strictEqual(getMcpContentFromSyncContent(lastSyncUserData!.syncData!.content, client.instantiationService.get(ILogService)), content);
			assert.strictEqual(getMcpContentFromSyncContent(remoteUserData.syncData!.content, client.instantiationService.get(ILogService)), content);
			assert.strictEqual((await fileService.readFile(mcpResource)).value.toString(), content);
		});
	});

	test('when mcp file has moved forward locally and remotely - accept local', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const client2 = disposableStore.add(new UserDataSyncClient(server));
			await client2.setUp(true);
			const mcpResource2 = client2.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
			const fileService2 = client2.instantiationService.get(IFileService);
			await fileService2.writeFile(mcpResource2, VSBuffer.fromString(JSON.stringify({
				'mcpServers': {}
			})));

			const fileService = client.instantiationService.get(IFileService);
			const mcpResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;

			await client2.sync();
			await testObject.sync(await client.getLatestRef(SyncResource.Mcp));

			fileService2.writeFile(mcpResource2, VSBuffer.fromString(JSON.stringify({
				'mcpServers': {
					'server1': {
						'command': 'node',
						'args': ['./server1.js']
					}
				}
			})));
			await client2.sync();

			const content = JSON.stringify({
				'mcpServers': {
					'server2': {
						'command': 'node',
						'args': ['./server2.js']
					}
				}
			});
			fileService.writeFile(mcpResource, VSBuffer.fromString(content));
			await testObject.sync(await client.getLatestRef(SyncResource.Mcp));
			assert.deepStrictEqual(testObject.status, SyncStatus.HasConflicts);

			await testObject.accept(testObject.conflicts.conflicts[0].localResource);
			await testObject.apply(false);
			assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
			const lastSyncUserData = await testObject.getLastSyncUserData();
			const remoteUserData = await testObject.getRemoteUserData(null);
			assert.strictEqual(getMcpContentFromSyncContent(lastSyncUserData!.syncData!.content, client.instantiationService.get(ILogService)), content);
			assert.strictEqual(getMcpContentFromSyncContent(remoteUserData.syncData!.content, client.instantiationService.get(ILogService)), content);
			assert.strictEqual((await fileService.readFile(mcpResource)).value.toString(), content);
		});
	});

	test('when mcp file was removed in one client', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const fileService = client.instantiationService.get(IFileService);
			const mcpResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
			await fileService.writeFile(mcpResource, VSBuffer.fromString(JSON.stringify({
				'mcpServers': {}
			})));
			await testObject.sync(await client.getLatestRef(SyncResource.Mcp));

			const client2 = disposableStore.add(new UserDataSyncClient(server));
			await client2.setUp(true);
			await client2.sync();

			const mcpResource2 = client2.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
			const fileService2 = client2.instantiationService.get(IFileService);
			fileService2.del(mcpResource2);
			await client2.sync();

			await testObject.sync(await client.getLatestRef(SyncResource.Mcp));

			assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
			const lastSyncUserData = await testObject.getLastSyncUserData();
			const remoteUserData = await testObject.getRemoteUserData(null);
			assert.strictEqual(getMcpContentFromSyncContent(lastSyncUserData!.syncData!.content, client.instantiationService.get(ILogService)), null);
			assert.strictEqual(getMcpContentFromSyncContent(remoteUserData.syncData!.content, client.instantiationService.get(ILogService)), null);
			assert.strictEqual(await fileService.exists(mcpResource), false);
		});
	});

	test('when mcp file is created after first sync', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const fileService = client.instantiationService.get(IFileService);
			const mcpResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
			await testObject.sync(await client.getLatestRef(SyncResource.Mcp));

			const content = JSON.stringify({
				'mcpServers': {
					'test-server': {
						'command': 'node',
						'args': ['./server.js']
					}
				}
			});
			await fileService.createFile(mcpResource, VSBuffer.fromString(content));

			let lastSyncUserData = await testObject.getLastSyncUserData();
			const manifest = await client.getLatestRef(SyncResource.Mcp);
			server.reset();
			await testObject.sync(manifest);

			assert.deepStrictEqual(server.requests, [
				{ type: 'POST', url: `${server.url}/v1/resource/${testObject.resource}`, headers: { 'If-Match': lastSyncUserData?.ref } },
			]);

			lastSyncUserData = await testObject.getLastSyncUserData();
			const remoteUserData = await testObject.getRemoteUserData(null);
			assert.deepStrictEqual(lastSyncUserData!.ref, remoteUserData.ref);
			assert.deepStrictEqual(lastSyncUserData!.syncData, remoteUserData.syncData);
			assert.strictEqual(getMcpContentFromSyncContent(lastSyncUserData!.syncData!.content, client.instantiationService.get(ILogService)), content);
		});
	});

	test('apply remote when mcp file does not exist', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const fileService = client.instantiationService.get(IFileService);
			const mcpResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
			if (await fileService.exists(mcpResource)) {
				await fileService.del(mcpResource);
			}

			const preview = (await testObject.sync(await client.getLatestRef(SyncResource.Mcp), true))!;

			server.reset();
			const content = await testObject.resolveContent(preview.resourcePreviews[0].remoteResource);
			await testObject.accept(preview.resourcePreviews[0].remoteResource, content);
			await testObject.apply(false);
			assert.deepStrictEqual(server.requests, []);
		});
	});

	test('sync profile mcp', async () => {
		await runWithFakedTimers<void>({}, async () => {
			const client2 = disposableStore.add(new UserDataSyncClient(server));
			await client2.setUp(true);
			const profile = await client2.instantiationService.get(IUserDataProfilesService).createNamedProfile('profile1');
			const expected = JSON.stringify({
				'mcpServers': {
					'test-server': {
						'command': 'node',
						'args': ['./server.js']
					}
				}
			});
			await client2.instantiationService.get(IFileService).createFile(profile.mcpResource, VSBuffer.fromString(expected));
			await client2.sync();

			await client.sync();

			const syncedProfile = client.instantiationService.get(IUserDataProfilesService).profiles.find(p => p.id === profile.id)!;
			const actual = (await client.instantiationService.get(IFileService).readFile(syncedProfile.mcpResource)).value.toString();
			assert.strictEqual(actual, expected);
		});
	});

});
