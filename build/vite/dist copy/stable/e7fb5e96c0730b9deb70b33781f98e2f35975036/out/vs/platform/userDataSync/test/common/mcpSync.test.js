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
import { getMcpContentFromSyncContent } from '../../common/mcpSync.js';
import { IUserDataSyncStoreService } from '../../common/userDataSync.js';
import { UserDataSyncClient, UserDataSyncTestServer } from './userDataSyncClient.js';
suite('McpSync', () => {
    const server = new UserDataSyncTestServer();
    let client;
    let testObject;
    teardown(async () => {
        await client.instantiationService.get(IUserDataSyncStoreService).clear();
    });
    const disposableStore = ensureNoDisposablesAreLeakedInTestSuite();
    setup(async () => {
        client = disposableStore.add(new UserDataSyncClient(server));
        await client.setUp(true);
        testObject = client.getSynchronizer("mcp" /* SyncResource.Mcp */);
    });
    test('when mcp file does not exist', async () => {
        await runWithFakedTimers({}, async () => {
            const fileService = client.instantiationService.get(IFileService);
            const mcpResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
            assert.deepStrictEqual(await testObject.getLastSyncUserData(), null);
            let manifest = await client.getLatestRef("mcp" /* SyncResource.Mcp */);
            server.reset();
            await testObject.sync(manifest);
            assert.deepStrictEqual(server.requests, []);
            assert.ok(!await fileService.exists(mcpResource));
            const lastSyncUserData = await testObject.getLastSyncUserData();
            const remoteUserData = await testObject.getRemoteUserData(null);
            assert.deepStrictEqual(lastSyncUserData.ref, remoteUserData.ref);
            assert.deepStrictEqual(lastSyncUserData.syncData, remoteUserData.syncData);
            assert.strictEqual(lastSyncUserData.syncData, null);
            manifest = await client.getLatestRef("mcp" /* SyncResource.Mcp */);
            server.reset();
            await testObject.sync(manifest);
            assert.deepStrictEqual(server.requests, []);
            manifest = await client.getLatestRef("mcp" /* SyncResource.Mcp */);
            server.reset();
            await testObject.sync(manifest);
            assert.deepStrictEqual(server.requests, []);
        });
    });
    test('when mcp file does not exist and remote has changes', async () => {
        await runWithFakedTimers({}, async () => {
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
            await testObject.sync(await client.getLatestRef("mcp" /* SyncResource.Mcp */));
            assert.deepStrictEqual(testObject.status, "idle" /* SyncStatus.Idle */);
            const lastSyncUserData = await testObject.getLastSyncUserData();
            const remoteUserData = await testObject.getRemoteUserData(null);
            assert.strictEqual(getMcpContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
            assert.strictEqual(getMcpContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), content);
            assert.strictEqual((await fileService.readFile(mcpResource)).value.toString(), content);
        });
    });
    test('when mcp file exists locally and remote has no mcp', async () => {
        await runWithFakedTimers({}, async () => {
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
            await testObject.sync(await client.getLatestRef("mcp" /* SyncResource.Mcp */));
            assert.deepStrictEqual(testObject.status, "idle" /* SyncStatus.Idle */);
            const lastSyncUserData = await testObject.getLastSyncUserData();
            const remoteUserData = await testObject.getRemoteUserData(null);
            assert.strictEqual(getMcpContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
            assert.strictEqual(getMcpContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), content);
        });
    });
    test('first time sync: when mcp file exists locally with same content as remote', async () => {
        await runWithFakedTimers({}, async () => {
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
            await testObject.sync(await client.getLatestRef("mcp" /* SyncResource.Mcp */));
            assert.deepStrictEqual(testObject.status, "idle" /* SyncStatus.Idle */);
            const lastSyncUserData = await testObject.getLastSyncUserData();
            const remoteUserData = await testObject.getRemoteUserData(null);
            assert.strictEqual(getMcpContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
            assert.strictEqual(getMcpContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), content);
            assert.strictEqual((await fileService.readFile(mcpResource)).value.toString(), content);
        });
    });
    test('when mcp file locally has moved forward', async () => {
        await runWithFakedTimers({}, async () => {
            const fileService = client.instantiationService.get(IFileService);
            const mcpResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
            fileService.writeFile(mcpResource, VSBuffer.fromString(JSON.stringify({
                'mcpServers': {}
            })));
            await testObject.sync(await client.getLatestRef("mcp" /* SyncResource.Mcp */));
            const content = JSON.stringify({
                'mcpServers': {
                    'test-server': {
                        'command': 'node',
                        'args': ['./server.js']
                    }
                }
            });
            fileService.writeFile(mcpResource, VSBuffer.fromString(content));
            await testObject.sync(await client.getLatestRef("mcp" /* SyncResource.Mcp */));
            assert.deepStrictEqual(testObject.status, "idle" /* SyncStatus.Idle */);
            const lastSyncUserData = await testObject.getLastSyncUserData();
            const remoteUserData = await testObject.getRemoteUserData(null);
            assert.strictEqual(getMcpContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
            assert.strictEqual(getMcpContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), content);
        });
    });
    test('when mcp file remotely has moved forward', async () => {
        await runWithFakedTimers({}, async () => {
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
            await testObject.sync(await client.getLatestRef("mcp" /* SyncResource.Mcp */));
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
            await testObject.sync(await client.getLatestRef("mcp" /* SyncResource.Mcp */));
            assert.deepStrictEqual(testObject.status, "idle" /* SyncStatus.Idle */);
            const lastSyncUserData = await testObject.getLastSyncUserData();
            const remoteUserData = await testObject.getRemoteUserData(null);
            assert.strictEqual(getMcpContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
            assert.strictEqual(getMcpContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), content);
            assert.strictEqual((await fileService.readFile(mcpResource)).value.toString(), content);
        });
    });
    test('when mcp file has moved forward locally and remotely with same changes', async () => {
        await runWithFakedTimers({}, async () => {
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
            await testObject.sync(await client.getLatestRef("mcp" /* SyncResource.Mcp */));
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
            await testObject.sync(await client.getLatestRef("mcp" /* SyncResource.Mcp */));
            assert.deepStrictEqual(testObject.status, "idle" /* SyncStatus.Idle */);
            const lastSyncUserData = await testObject.getLastSyncUserData();
            const remoteUserData = await testObject.getRemoteUserData(null);
            assert.strictEqual(getMcpContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
            assert.strictEqual(getMcpContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), content);
            assert.strictEqual((await fileService.readFile(mcpResource)).value.toString(), content);
        });
    });
    test('when mcp file has moved forward locally and remotely - accept preview', async () => {
        await runWithFakedTimers({}, async () => {
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
            await testObject.sync(await client.getLatestRef("mcp" /* SyncResource.Mcp */));
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
            await testObject.sync(await client.getLatestRef("mcp" /* SyncResource.Mcp */));
            const previewContent = (await fileService.readFile(testObject.conflicts.conflicts[0].previewResource)).value.toString();
            assert.deepStrictEqual(testObject.status, "hasConflicts" /* SyncStatus.HasConflicts */);
            assert.deepStrictEqual(testObject.conflicts.conflicts.length, 1);
            assert.deepStrictEqual(testObject.conflicts.conflicts[0].mergeState, "conflict" /* MergeState.Conflict */);
            assert.deepStrictEqual(testObject.conflicts.conflicts[0].localChange, 2 /* Change.Modified */);
            assert.deepStrictEqual(testObject.conflicts.conflicts[0].remoteChange, 2 /* Change.Modified */);
            await testObject.accept(testObject.conflicts.conflicts[0].previewResource);
            await testObject.apply(false);
            assert.deepStrictEqual(testObject.status, "idle" /* SyncStatus.Idle */);
            const lastSyncUserData = await testObject.getLastSyncUserData();
            const remoteUserData = await testObject.getRemoteUserData(null);
            assert.strictEqual(getMcpContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), previewContent);
            assert.strictEqual(getMcpContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), previewContent);
            assert.strictEqual((await fileService.readFile(mcpResource)).value.toString(), previewContent);
        });
    });
    test('when mcp file has moved forward locally and remotely - accept modified preview', async () => {
        await runWithFakedTimers({}, async () => {
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
            await testObject.sync(await client.getLatestRef("mcp" /* SyncResource.Mcp */));
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
            await testObject.sync(await client.getLatestRef("mcp" /* SyncResource.Mcp */));
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
            assert.deepStrictEqual(testObject.status, "idle" /* SyncStatus.Idle */);
            const lastSyncUserData = await testObject.getLastSyncUserData();
            const remoteUserData = await testObject.getRemoteUserData(null);
            assert.strictEqual(getMcpContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
            assert.strictEqual(getMcpContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), content);
            assert.strictEqual((await fileService.readFile(mcpResource)).value.toString(), content);
        });
    });
    test('when mcp file has moved forward locally and remotely - accept remote', async () => {
        await runWithFakedTimers({}, async () => {
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
            await testObject.sync(await client.getLatestRef("mcp" /* SyncResource.Mcp */));
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
            await testObject.sync(await client.getLatestRef("mcp" /* SyncResource.Mcp */));
            assert.deepStrictEqual(testObject.status, "hasConflicts" /* SyncStatus.HasConflicts */);
            await testObject.accept(testObject.conflicts.conflicts[0].remoteResource);
            await testObject.apply(false);
            assert.deepStrictEqual(testObject.status, "idle" /* SyncStatus.Idle */);
            const lastSyncUserData = await testObject.getLastSyncUserData();
            const remoteUserData = await testObject.getRemoteUserData(null);
            assert.strictEqual(getMcpContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
            assert.strictEqual(getMcpContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), content);
            assert.strictEqual((await fileService.readFile(mcpResource)).value.toString(), content);
        });
    });
    test('when mcp file has moved forward locally and remotely - accept local', async () => {
        await runWithFakedTimers({}, async () => {
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
            await testObject.sync(await client.getLatestRef("mcp" /* SyncResource.Mcp */));
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
            await testObject.sync(await client.getLatestRef("mcp" /* SyncResource.Mcp */));
            assert.deepStrictEqual(testObject.status, "hasConflicts" /* SyncStatus.HasConflicts */);
            await testObject.accept(testObject.conflicts.conflicts[0].localResource);
            await testObject.apply(false);
            assert.deepStrictEqual(testObject.status, "idle" /* SyncStatus.Idle */);
            const lastSyncUserData = await testObject.getLastSyncUserData();
            const remoteUserData = await testObject.getRemoteUserData(null);
            assert.strictEqual(getMcpContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
            assert.strictEqual(getMcpContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), content);
            assert.strictEqual((await fileService.readFile(mcpResource)).value.toString(), content);
        });
    });
    test('when mcp file was removed in one client', async () => {
        await runWithFakedTimers({}, async () => {
            const fileService = client.instantiationService.get(IFileService);
            const mcpResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
            await fileService.writeFile(mcpResource, VSBuffer.fromString(JSON.stringify({
                'mcpServers': {}
            })));
            await testObject.sync(await client.getLatestRef("mcp" /* SyncResource.Mcp */));
            const client2 = disposableStore.add(new UserDataSyncClient(server));
            await client2.setUp(true);
            await client2.sync();
            const mcpResource2 = client2.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
            const fileService2 = client2.instantiationService.get(IFileService);
            fileService2.del(mcpResource2);
            await client2.sync();
            await testObject.sync(await client.getLatestRef("mcp" /* SyncResource.Mcp */));
            assert.deepStrictEqual(testObject.status, "idle" /* SyncStatus.Idle */);
            const lastSyncUserData = await testObject.getLastSyncUserData();
            const remoteUserData = await testObject.getRemoteUserData(null);
            assert.strictEqual(getMcpContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), null);
            assert.strictEqual(getMcpContentFromSyncContent(remoteUserData.syncData.content, client.instantiationService.get(ILogService)), null);
            assert.strictEqual(await fileService.exists(mcpResource), false);
        });
    });
    test('when mcp file is created after first sync', async () => {
        await runWithFakedTimers({}, async () => {
            const fileService = client.instantiationService.get(IFileService);
            const mcpResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
            await testObject.sync(await client.getLatestRef("mcp" /* SyncResource.Mcp */));
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
            const manifest = await client.getLatestRef("mcp" /* SyncResource.Mcp */);
            server.reset();
            await testObject.sync(manifest);
            assert.deepStrictEqual(server.requests, [
                { type: 'POST', url: `${server.url}/v1/resource/${testObject.resource}`, headers: { 'If-Match': lastSyncUserData?.ref } },
            ]);
            lastSyncUserData = await testObject.getLastSyncUserData();
            const remoteUserData = await testObject.getRemoteUserData(null);
            assert.deepStrictEqual(lastSyncUserData.ref, remoteUserData.ref);
            assert.deepStrictEqual(lastSyncUserData.syncData, remoteUserData.syncData);
            assert.strictEqual(getMcpContentFromSyncContent(lastSyncUserData.syncData.content, client.instantiationService.get(ILogService)), content);
        });
    });
    test('apply remote when mcp file does not exist', async () => {
        await runWithFakedTimers({}, async () => {
            const fileService = client.instantiationService.get(IFileService);
            const mcpResource = client.instantiationService.get(IUserDataProfilesService).defaultProfile.mcpResource;
            if (await fileService.exists(mcpResource)) {
                await fileService.del(mcpResource);
            }
            const preview = (await testObject.sync(await client.getLatestRef("mcp" /* SyncResource.Mcp */), true));
            server.reset();
            const content = await testObject.resolveContent(preview.resourcePreviews[0].remoteResource);
            await testObject.accept(preview.resourcePreviews[0].remoteResource, content);
            await testObject.apply(false);
            assert.deepStrictEqual(server.requests, []);
        });
    });
    test('sync profile mcp', async () => {
        await runWithFakedTimers({}, async () => {
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
            const syncedProfile = client.instantiationService.get(IUserDataProfilesService).profiles.find(p => p.id === profile.id);
            const actual = (await client.instantiationService.get(IFileService).readFile(syncedProfile.mcpResource)).value.toString();
            assert.strictEqual(actual, expected);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwU3luYy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vdXNlckRhdGFTeW5jL3Rlc3QvY29tbW9uL21jcFN5bmMudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3pGLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUM5RCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDekQsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDOUYsT0FBTyxFQUFFLDRCQUE0QixFQUFtQixNQUFNLHlCQUF5QixDQUFDO0FBQ3hGLE9BQU8sRUFBVSx5QkFBeUIsRUFBd0MsTUFBTSw4QkFBOEIsQ0FBQztBQUN2SCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUVyRixLQUFLLENBQUMsU0FBUyxFQUFFLEdBQUcsRUFBRTtJQUVyQixNQUFNLE1BQU0sR0FBRyxJQUFJLHNCQUFzQixFQUFFLENBQUM7SUFDNUMsSUFBSSxNQUEwQixDQUFDO0lBRS9CLElBQUksVUFBMkIsQ0FBQztJQUVoQyxRQUFRLENBQUMsS0FBSyxJQUFJLEVBQUU7UUFDbkIsTUFBTSxNQUFNLENBQUMsb0JBQW9CLENBQUMsR0FBRyxDQUFDLHlCQUF5QixDQUFDLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDMUUsQ0FBQyxDQUFDLENBQUM7SUFFSCxNQUFN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