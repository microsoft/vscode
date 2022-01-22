/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { VSBuffer } from 'vs/base/common/buffer';
import { DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { ILogService } from 'vs/platform/log/common/log';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { getTasksContentFromSyncContent, TasksSynchroniser } from 'vs/platform/userDataSync/common/tasksSync';
import { Change, IUserDataSyncStoreService, MergeState, SyncResource, SyncStatus } from 'vs/platform/userDataSync/common/userDataSync';
import { UserDataSyncClient, UserDataSyncTestServer } from 'vs/platform/userDataSync/test/common/userDataSyncClient';

suite('TasksSync', () => {

	const disposableStore = new DisposableStore();
	const server = new UserDataSyncTestServer();
	let client: UserDataSyncClient;

	let testObject: TasksSynchroniser;

	setup(async () => {
		client = disposableStore.add(new UserDataSyncClient(server));
		await client.setUp(true);
		testObject = client.getSynchronizer(SyncResource.Tasks) as TasksSynchroniser;
		disposableStore.add(toDisposable(() => client.instantiationService.get(IUserDataSyncStoreService).clear()));
	});

	teardown(() => disposableStore.clear());

	test('when tasks file does not exist', async () => {
		const fileService = client.instantiationService.get(IFileService);
		const uriIdentityService = client.instantiationService.get(IUriIdentityService);
		const tasksResource = uriIdentityService.extUri.joinPath(uriIdentityService.extUri.dirname(client.instantiationService.get(IEnvironmentService).settingsResource), 'tasks.json');

		assert.deepStrictEqual(await testObject.getLastSyncUserData(), null);
		let manifest = await client.manifest();
		server.reset();
		await testObject.sync(manifest);

		assert.deepStrictEqual(server.requests, [
			{ type: 'GET', url: `${server.url}/v1/resource/${testObject.resource}/latest`, headers: {} },
		]);
		assert.ok(!await fileService.exists(tasksResource));

		const lastSyncUserData = await testObject.getLastSyncUserData();
		const remoteUserData = await testObject.getRemoteUserData(null);
		assert.deepStrictEqual(lastSyncUserData!.ref, remoteUserData.ref);
		assert.deepStrictEqual(lastSyncUserData!.syncData, remoteUserData.syncData);
		assert.strictEqual(lastSyncUserData!.syncData, null);

		manifest = await client.manifest();
		server.reset();
		await testObject.sync(manifest);
		assert.deepStrictEqual(server.requests, []);

		manifest = await client.manifest();
		server.reset();
		await testObject.sync(manifest);
		assert.deepStrictEqual(server.requests, []);
	});

	test('when tasks file does not exist and remote has changes', async () => {
		const client2 = disposableStore.add(new UserDataSyncClient(server));
		await client2.setUp(true);
		const content = JSON.stringify({
			'version': '2.0.0',
			'tasks': [{
				'type': 'npm',
				'script': 'watch',
				'label': 'Watch'
			}]
		});
		const uriIdentityService2 = client2.instantiationService.get(IUriIdentityService);
		const tasksResource2 = uriIdentityService2.extUri.joinPath(uriIdentityService2.extUri.dirname(client2.instantiationService.get(IEnvironmentService).settingsResource), 'tasks.json');
		await client2.instantiationService.get(IFileService).writeFile(tasksResource2, VSBuffer.fromString(content));
		await client2.sync();

		const fileService = client.instantiationService.get(IFileService);
		const uriIdentityService = client.instantiationService.get(IUriIdentityService);
		const tasksResource = uriIdentityService.extUri.joinPath(uriIdentityService.extUri.dirname(client.instantiationService.get(IEnvironmentService).settingsResource), 'tasks.json');

		await testObject.sync(await client.manifest());

		assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
		const lastSyncUserData = await testObject.getLastSyncUserData();
		const remoteUserData = await testObject.getRemoteUserData(null);
		assert.strictEqual(getTasksContentFromSyncContent(lastSyncUserData!.syncData!.content!, client.instantiationService.get(ILogService)), content);
		assert.strictEqual(getTasksContentFromSyncContent(remoteUserData!.syncData!.content!, client.instantiationService.get(ILogService)), content);
		assert.strictEqual((await fileService.readFile(tasksResource)).value.toString(), content);
	});

	test('when tasks file exists locally and remote has no tasks', async () => {
		const fileService = client.instantiationService.get(IFileService);
		const uriIdentityService = client.instantiationService.get(IUriIdentityService);
		const tasksResource = uriIdentityService.extUri.joinPath(uriIdentityService.extUri.dirname(client.instantiationService.get(IEnvironmentService).settingsResource), 'tasks.json');
		const content = JSON.stringify({
			'version': '2.0.0',
			'tasks': [{
				'type': 'npm',
				'script': 'watch',
				'label': 'Watch'
			}]
		});
		fileService.writeFile(tasksResource, VSBuffer.fromString(content));

		await testObject.sync(await client.manifest());

		assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
		const lastSyncUserData = await testObject.getLastSyncUserData();
		const remoteUserData = await testObject.getRemoteUserData(null);
		assert.strictEqual(getTasksContentFromSyncContent(lastSyncUserData!.syncData!.content!, client.instantiationService.get(ILogService)), content);
		assert.strictEqual(getTasksContentFromSyncContent(remoteUserData!.syncData!.content!, client.instantiationService.get(ILogService)), content);
	});

	test('first time sync: when tasks file exists locally with same content as remote', async () => {
		const client2 = disposableStore.add(new UserDataSyncClient(server));
		await client2.setUp(true);
		const content = JSON.stringify({
			'version': '2.0.0',
			'tasks': [{
				'type': 'npm',
				'script': 'watch',
				'label': 'Watch'
			}]
		});
		const uriIdentityService2 = client2.instantiationService.get(IUriIdentityService);
		const tasksResource2 = uriIdentityService2.extUri.joinPath(uriIdentityService2.extUri.dirname(client2.instantiationService.get(IEnvironmentService).settingsResource), 'tasks.json');
		await client2.instantiationService.get(IFileService).writeFile(tasksResource2, VSBuffer.fromString(content));
		await client2.sync();

		const fileService = client.instantiationService.get(IFileService);
		const uriIdentityService = client.instantiationService.get(IUriIdentityService);
		const tasksResource = uriIdentityService.extUri.joinPath(uriIdentityService.extUri.dirname(client.instantiationService.get(IEnvironmentService).settingsResource), 'tasks.json');
		await fileService.writeFile(tasksResource, VSBuffer.fromString(content));

		await testObject.sync(await client.manifest());

		assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
		const lastSyncUserData = await testObject.getLastSyncUserData();
		const remoteUserData = await testObject.getRemoteUserData(null);
		assert.strictEqual(getTasksContentFromSyncContent(lastSyncUserData!.syncData!.content!, client.instantiationService.get(ILogService)), content);
		assert.strictEqual(getTasksContentFromSyncContent(remoteUserData!.syncData!.content!, client.instantiationService.get(ILogService)), content);
		assert.strictEqual((await fileService.readFile(tasksResource)).value.toString(), content);
	});

	test('when tasks file locally has moved forward', async () => {
		const fileService = client.instantiationService.get(IFileService);
		const uriIdentityService = client.instantiationService.get(IUriIdentityService);
		const tasksResource = uriIdentityService.extUri.joinPath(uriIdentityService.extUri.dirname(client.instantiationService.get(IEnvironmentService).settingsResource), 'tasks.json');
		fileService.writeFile(tasksResource, VSBuffer.fromString(JSON.stringify({
			'version': '2.0.0',
			'tasks': []
		})));

		await testObject.sync(await client.manifest());

		const content = JSON.stringify({
			'version': '2.0.0',
			'tasks': [{
				'type': 'npm',
				'script': 'watch',
				'label': 'Watch'
			}]
		});
		fileService.writeFile(tasksResource, VSBuffer.fromString(content));

		await testObject.sync(await client.manifest());

		assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
		const lastSyncUserData = await testObject.getLastSyncUserData();
		const remoteUserData = await testObject.getRemoteUserData(null);
		assert.strictEqual(getTasksContentFromSyncContent(lastSyncUserData!.syncData!.content!, client.instantiationService.get(ILogService)), content);
		assert.strictEqual(getTasksContentFromSyncContent(remoteUserData!.syncData!.content!, client.instantiationService.get(ILogService)), content);
	});

	test('when tasks file remotely has moved forward', async () => {
		const client2 = disposableStore.add(new UserDataSyncClient(server));
		await client2.setUp(true);
		const uriIdentityService2 = client2.instantiationService.get(IUriIdentityService);
		const tasksResource2 = uriIdentityService2.extUri.joinPath(uriIdentityService2.extUri.dirname(client2.instantiationService.get(IEnvironmentService).settingsResource), 'tasks.json');
		const fileService2 = client2.instantiationService.get(IFileService);
		await fileService2.writeFile(tasksResource2, VSBuffer.fromString(JSON.stringify({
			'version': '2.0.0',
			'tasks': []
		})));

		const fileService = client.instantiationService.get(IFileService);
		const uriIdentityService = client.instantiationService.get(IUriIdentityService);
		const tasksResource = uriIdentityService.extUri.joinPath(uriIdentityService.extUri.dirname(client.instantiationService.get(IEnvironmentService).settingsResource), 'tasks.json');

		await client2.sync();
		await testObject.sync(await client.manifest());

		const content = JSON.stringify({
			'version': '2.0.0',
			'tasks': [{
				'type': 'npm',
				'script': 'watch',
				'label': 'Watch'
			}]
		});
		fileService2.writeFile(tasksResource2, VSBuffer.fromString(content));

		await client2.sync();
		await testObject.sync(await client.manifest());

		assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
		const lastSyncUserData = await testObject.getLastSyncUserData();
		const remoteUserData = await testObject.getRemoteUserData(null);
		assert.strictEqual(getTasksContentFromSyncContent(lastSyncUserData!.syncData!.content!, client.instantiationService.get(ILogService)), content);
		assert.strictEqual(getTasksContentFromSyncContent(remoteUserData!.syncData!.content!, client.instantiationService.get(ILogService)), content);
		assert.strictEqual((await fileService.readFile(tasksResource)).value.toString(), content);
	});

	test('when tasks file has moved forward locally and remotely with same changes', async () => {
		const client2 = disposableStore.add(new UserDataSyncClient(server));
		await client2.setUp(true);
		const uriIdentityService2 = client2.instantiationService.get(IUriIdentityService);
		const tasksResource2 = uriIdentityService2.extUri.joinPath(uriIdentityService2.extUri.dirname(client2.instantiationService.get(IEnvironmentService).settingsResource), 'tasks.json');
		const fileService2 = client2.instantiationService.get(IFileService);
		await fileService2.writeFile(tasksResource2, VSBuffer.fromString(JSON.stringify({
			'version': '2.0.0',
			'tasks': []
		})));

		const fileService = client.instantiationService.get(IFileService);
		const uriIdentityService = client.instantiationService.get(IUriIdentityService);
		const tasksResource = uriIdentityService.extUri.joinPath(uriIdentityService.extUri.dirname(client.instantiationService.get(IEnvironmentService).settingsResource), 'tasks.json');

		await client2.sync();
		await testObject.sync(await client.manifest());

		const content = JSON.stringify({
			'version': '2.0.0',
			'tasks': [{
				'type': 'npm',
				'script': 'watch',
				'label': 'Watch'
			}]
		});
		fileService2.writeFile(tasksResource2, VSBuffer.fromString(content));
		await client2.sync();

		fileService.writeFile(tasksResource, VSBuffer.fromString(content));
		await testObject.sync(await client.manifest());

		assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
		const lastSyncUserData = await testObject.getLastSyncUserData();
		const remoteUserData = await testObject.getRemoteUserData(null);
		assert.strictEqual(getTasksContentFromSyncContent(lastSyncUserData!.syncData!.content!, client.instantiationService.get(ILogService)), content);
		assert.strictEqual(getTasksContentFromSyncContent(remoteUserData!.syncData!.content!, client.instantiationService.get(ILogService)), content);
		assert.strictEqual((await fileService.readFile(tasksResource)).value.toString(), content);
	});

	test('when tasks file has moved forward locally and remotely - accept preview', async () => {
		const client2 = disposableStore.add(new UserDataSyncClient(server));
		await client2.setUp(true);
		const uriIdentityService2 = client2.instantiationService.get(IUriIdentityService);
		const tasksResource2 = uriIdentityService2.extUri.joinPath(uriIdentityService2.extUri.dirname(client2.instantiationService.get(IEnvironmentService).settingsResource), 'tasks.json');
		const fileService2 = client2.instantiationService.get(IFileService);
		await fileService2.writeFile(tasksResource2, VSBuffer.fromString(JSON.stringify({
			'version': '2.0.0',
			'tasks': []
		})));

		const fileService = client.instantiationService.get(IFileService);
		const uriIdentityService = client.instantiationService.get(IUriIdentityService);
		const tasksResource = uriIdentityService.extUri.joinPath(uriIdentityService.extUri.dirname(client.instantiationService.get(IEnvironmentService).settingsResource), 'tasks.json');

		await client2.sync();
		await testObject.sync(await client.manifest());

		fileService2.writeFile(tasksResource2, VSBuffer.fromString(JSON.stringify({
			'version': '2.0.0',
			'tasks': [{
				'type': 'npm',
				'script': 'watch',
			}]
		})));
		await client2.sync();

		const content = JSON.stringify({
			'version': '2.0.0',
			'tasks': [{
				'type': 'npm',
				'script': 'watch',
				'label': 'Watch'
			}]
		});
		fileService.writeFile(tasksResource, VSBuffer.fromString(content));
		await testObject.sync(await client.manifest());

		assert.deepStrictEqual(testObject.status, SyncStatus.HasConflicts);
		assert.deepStrictEqual(testObject.conflicts.length, 1);
		assert.deepStrictEqual(testObject.conflicts[0].mergeState, MergeState.Conflict);
		assert.deepStrictEqual(testObject.conflicts[0].localChange, Change.Modified);
		assert.deepStrictEqual(testObject.conflicts[0].remoteChange, Change.Modified);
		assert.deepStrictEqual((await fileService.readFile(testObject.conflicts[0].previewResource)).value.toString(), content);

		await testObject.accept(testObject.conflicts[0].previewResource);
		await testObject.apply(false);
		assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
		const lastSyncUserData = await testObject.getLastSyncUserData();
		const remoteUserData = await testObject.getRemoteUserData(null);
		assert.strictEqual(getTasksContentFromSyncContent(lastSyncUserData!.syncData!.content!, client.instantiationService.get(ILogService)), content);
		assert.strictEqual(getTasksContentFromSyncContent(remoteUserData!.syncData!.content!, client.instantiationService.get(ILogService)), content);
		assert.strictEqual((await fileService.readFile(tasksResource)).value.toString(), content);
	});

	test('when tasks file has moved forward locally and remotely - accept modified preview', async () => {
		const client2 = disposableStore.add(new UserDataSyncClient(server));
		await client2.setUp(true);
		const uriIdentityService2 = client2.instantiationService.get(IUriIdentityService);
		const tasksResource2 = uriIdentityService2.extUri.joinPath(uriIdentityService2.extUri.dirname(client2.instantiationService.get(IEnvironmentService).settingsResource), 'tasks.json');
		const fileService2 = client2.instantiationService.get(IFileService);
		await fileService2.writeFile(tasksResource2, VSBuffer.fromString(JSON.stringify({
			'version': '2.0.0',
			'tasks': []
		})));

		const fileService = client.instantiationService.get(IFileService);
		const uriIdentityService = client.instantiationService.get(IUriIdentityService);
		const tasksResource = uriIdentityService.extUri.joinPath(uriIdentityService.extUri.dirname(client.instantiationService.get(IEnvironmentService).settingsResource), 'tasks.json');

		await client2.sync();
		await testObject.sync(await client.manifest());

		fileService2.writeFile(tasksResource2, VSBuffer.fromString(JSON.stringify({
			'version': '2.0.0',
			'tasks': [{
				'type': 'npm',
				'script': 'watch',
			}]
		})));
		await client2.sync();

		fileService.writeFile(tasksResource, VSBuffer.fromString(JSON.stringify({
			'version': '2.0.0',
			'tasks': [{
				'type': 'npm',
				'script': 'watch',
				'label': 'Watch'
			}]
		})));
		await testObject.sync(await client.manifest());

		const content = JSON.stringify({
			'version': '2.0.0',
			'tasks': [{
				'type': 'npm',
				'script': 'watch',
				'label': 'Watch 2'
			}]
		});
		await testObject.accept(testObject.conflicts[0].previewResource, content);
		await testObject.apply(false);
		assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
		const lastSyncUserData = await testObject.getLastSyncUserData();
		const remoteUserData = await testObject.getRemoteUserData(null);
		assert.strictEqual(getTasksContentFromSyncContent(lastSyncUserData!.syncData!.content!, client.instantiationService.get(ILogService)), content);
		assert.strictEqual(getTasksContentFromSyncContent(remoteUserData!.syncData!.content!, client.instantiationService.get(ILogService)), content);
		assert.strictEqual((await fileService.readFile(tasksResource)).value.toString(), content);
	});

	test('when tasks file has moved forward locally and remotely - accept remote', async () => {
		const client2 = disposableStore.add(new UserDataSyncClient(server));
		await client2.setUp(true);
		const uriIdentityService2 = client2.instantiationService.get(IUriIdentityService);
		const tasksResource2 = uriIdentityService2.extUri.joinPath(uriIdentityService2.extUri.dirname(client2.instantiationService.get(IEnvironmentService).settingsResource), 'tasks.json');
		const fileService2 = client2.instantiationService.get(IFileService);
		await fileService2.writeFile(tasksResource2, VSBuffer.fromString(JSON.stringify({
			'version': '2.0.0',
			'tasks': []
		})));

		const fileService = client.instantiationService.get(IFileService);
		const uriIdentityService = client.instantiationService.get(IUriIdentityService);
		const tasksResource = uriIdentityService.extUri.joinPath(uriIdentityService.extUri.dirname(client.instantiationService.get(IEnvironmentService).settingsResource), 'tasks.json');

		await client2.sync();
		await testObject.sync(await client.manifest());

		const content = JSON.stringify({
			'version': '2.0.0',
			'tasks': [{
				'type': 'npm',
				'script': 'watch',
			}]
		});
		fileService2.writeFile(tasksResource2, VSBuffer.fromString(content));
		await client2.sync();

		fileService.writeFile(tasksResource, VSBuffer.fromString(JSON.stringify({
			'version': '2.0.0',
			'tasks': [{
				'type': 'npm',
				'script': 'watch',
				'label': 'Watch'
			}]
		})));
		await testObject.sync(await client.manifest());
		assert.deepStrictEqual(testObject.status, SyncStatus.HasConflicts);

		await testObject.accept(testObject.conflicts[0].remoteResource);
		await testObject.apply(false);
		assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
		const lastSyncUserData = await testObject.getLastSyncUserData();
		const remoteUserData = await testObject.getRemoteUserData(null);
		assert.strictEqual(getTasksContentFromSyncContent(lastSyncUserData!.syncData!.content!, client.instantiationService.get(ILogService)), content);
		assert.strictEqual(getTasksContentFromSyncContent(remoteUserData!.syncData!.content!, client.instantiationService.get(ILogService)), content);
		assert.strictEqual((await fileService.readFile(tasksResource)).value.toString(), content);
	});

	test('when tasks file has moved forward locally and remotely - accept local', async () => {
		const client2 = disposableStore.add(new UserDataSyncClient(server));
		await client2.setUp(true);
		const uriIdentityService2 = client2.instantiationService.get(IUriIdentityService);
		const tasksResource2 = uriIdentityService2.extUri.joinPath(uriIdentityService2.extUri.dirname(client2.instantiationService.get(IEnvironmentService).settingsResource), 'tasks.json');
		const fileService2 = client2.instantiationService.get(IFileService);
		await fileService2.writeFile(tasksResource2, VSBuffer.fromString(JSON.stringify({
			'version': '2.0.0',
			'tasks': []
		})));

		const fileService = client.instantiationService.get(IFileService);
		const uriIdentityService = client.instantiationService.get(IUriIdentityService);
		const tasksResource = uriIdentityService.extUri.joinPath(uriIdentityService.extUri.dirname(client.instantiationService.get(IEnvironmentService).settingsResource), 'tasks.json');

		await client2.sync();
		await testObject.sync(await client.manifest());

		fileService2.writeFile(tasksResource2, VSBuffer.fromString(JSON.stringify({
			'version': '2.0.0',
			'tasks': [{
				'type': 'npm',
				'script': 'watch',
			}]
		})));
		await client2.sync();

		const content = JSON.stringify({
			'version': '2.0.0',
			'tasks': [{
				'type': 'npm',
				'script': 'watch',
				'label': 'Watch'
			}]
		});
		fileService.writeFile(tasksResource, VSBuffer.fromString(content));
		await testObject.sync(await client.manifest());
		assert.deepStrictEqual(testObject.status, SyncStatus.HasConflicts);

		await testObject.accept(testObject.conflicts[0].localResource);
		await testObject.apply(false);
		assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
		const lastSyncUserData = await testObject.getLastSyncUserData();
		const remoteUserData = await testObject.getRemoteUserData(null);
		assert.strictEqual(getTasksContentFromSyncContent(lastSyncUserData!.syncData!.content!, client.instantiationService.get(ILogService)), content);
		assert.strictEqual(getTasksContentFromSyncContent(remoteUserData!.syncData!.content!, client.instantiationService.get(ILogService)), content);
		assert.strictEqual((await fileService.readFile(tasksResource)).value.toString(), content);
	});

	test('when tasks file is created after first sync', async () => {
		const fileService = client.instantiationService.get(IFileService);
		const uriIdentityService = client.instantiationService.get(IUriIdentityService);
		const tasksResource = uriIdentityService.extUri.joinPath(uriIdentityService.extUri.dirname(client.instantiationService.get(IEnvironmentService).settingsResource), 'tasks.json');
		await testObject.sync(await client.manifest());

		const content = JSON.stringify({
			'version': '2.0.0',
			'tasks': [{
				'type': 'npm',
				'script': 'watch',
				'label': 'Watch'
			}]
		});
		await fileService.createFile(tasksResource, VSBuffer.fromString(content));

		let lastSyncUserData = await testObject.getLastSyncUserData();
		const manifest = await client.manifest();
		server.reset();
		await testObject.sync(manifest);

		assert.deepStrictEqual(server.requests, [
			{ type: 'POST', url: `${server.url}/v1/resource/${testObject.resource}`, headers: { 'If-Match': lastSyncUserData?.ref } },
		]);

		lastSyncUserData = await testObject.getLastSyncUserData();
		const remoteUserData = await testObject.getRemoteUserData(null);
		assert.deepStrictEqual(lastSyncUserData!.ref, remoteUserData.ref);
		assert.deepStrictEqual(lastSyncUserData!.syncData, remoteUserData.syncData);
		assert.strictEqual(getTasksContentFromSyncContent(lastSyncUserData!.syncData!.content!, client.instantiationService.get(ILogService)), content);
	});

	test('apply remote when tasks file does not exist', async () => {
		const fileService = client.instantiationService.get(IFileService);
		const uriIdentityService = client.instantiationService.get(IUriIdentityService);
		const tasksResource = uriIdentityService.extUri.joinPath(uriIdentityService.extUri.dirname(client.instantiationService.get(IEnvironmentService).settingsResource), 'tasks.json');
		if (await fileService.exists(tasksResource)) {
			await fileService.del(tasksResource);
		}

		const preview = (await testObject.preview(await client.manifest(), {}))!;

		server.reset();
		const content = await testObject.resolveContent(preview.resourcePreviews[0].remoteResource);
		await testObject.accept(preview.resourcePreviews[0].remoteResource, content);
		await testObject.apply(false);
		assert.deepStrictEqual(server.requests, []);
	});

});
