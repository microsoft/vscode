/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { IUserDataSyncStoreService, IUserDataSyncService, SyncResource, SyncStatus, IGlobalState } from 'vs/platform/userDataSync/common/userDataSync';
import { UserDataSyncClient, UserDataSyncTestServer } from 'vs/platform/userDataSync/test/common/userDataSyncClient';
import { DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { UserDataSyncService } from 'vs/platform/userDataSync/common/userDataSyncService';
import { IFileService } from 'vs/platform/files/common/files';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ISyncData } from 'vs/platform/userDataSync/common/abstractSynchronizer';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { GlobalStateSynchroniser } from 'vs/platform/userDataSync/common/globalStateSync';
import { VSBuffer } from 'vs/base/common/buffer';
import { IStorageKeysSyncRegistryService } from 'vs/platform/userDataSync/common/storageKeys';


suite('GlobalStateSync', () => {

	const disposableStore = new DisposableStore();
	const server = new UserDataSyncTestServer();
	let testClient: UserDataSyncClient;
	let client2: UserDataSyncClient;

	let testObject: GlobalStateSynchroniser;

	setup(async () => {
		testClient = disposableStore.add(new UserDataSyncClient(server));
		await testClient.setUp(true);
		let storageKeysSyncRegistryService = testClient.instantiationService.get(IStorageKeysSyncRegistryService);
		storageKeysSyncRegistryService.registerStorageKey({ key: 'a', version: 1 });
		storageKeysSyncRegistryService.registerStorageKey({ key: 'b', version: 1 });
		testObject = (testClient.instantiationService.get(IUserDataSyncService) as UserDataSyncService).getSynchroniser(SyncResource.GlobalState) as GlobalStateSynchroniser;
		disposableStore.add(toDisposable(() => testClient.instantiationService.get(IUserDataSyncStoreService).clear()));

		client2 = disposableStore.add(new UserDataSyncClient(server));
		await client2.setUp(true);
		storageKeysSyncRegistryService = client2.instantiationService.get(IStorageKeysSyncRegistryService);
		storageKeysSyncRegistryService.registerStorageKey({ key: 'a', version: 1 });
		storageKeysSyncRegistryService.registerStorageKey({ key: 'b', version: 1 });
	});

	teardown(() => disposableStore.clear());

	test('first time sync - outgoing to server (no state)', async () => {
		updateStorage('a', 'value1', testClient);
		await updateLocale(testClient);

		await testObject.sync();
		assert.equal(testObject.status, SyncStatus.Idle);
		assert.deepEqual(testObject.conflicts, []);

		const { content } = await testClient.read(testObject.resource);
		assert.ok(content !== null);
		const actual = parseGlobalState(content!);
		assert.deepEqual(actual.storage, { 'globalState.argv.locale': { version: 1, value: 'en' }, 'a': { version: 1, value: 'value1' } });
	});

	test('first time sync - incoming from server (no state)', async () => {
		updateStorage('a', 'value1', client2);
		await updateLocale(client2);
		await client2.sync();

		await testObject.sync();
		assert.equal(testObject.status, SyncStatus.Idle);
		assert.deepEqual(testObject.conflicts, []);

		assert.equal(readStorage('a', testClient), 'value1');
		assert.equal(await readLocale(testClient), 'en');
	});

	test('first time sync when storage exists', async () => {
		updateStorage('a', 'value1', client2);
		await client2.sync();

		updateStorage('b', 'value2', testClient);
		await testObject.sync();
		assert.equal(testObject.status, SyncStatus.Idle);
		assert.deepEqual(testObject.conflicts, []);

		assert.equal(readStorage('a', testClient), 'value1');
		assert.equal(readStorage('b', testClient), 'value2');

		const { content } = await testClient.read(testObject.resource);
		assert.ok(content !== null);
		const actual = parseGlobalState(content!);
		assert.deepEqual(actual.storage, { 'a': { version: 1, value: 'value1' }, 'b': { version: 1, value: 'value2' } });
	});

	test('first time sync when storage exists - has conflicts', async () => {
		updateStorage('a', 'value1', client2);
		await client2.sync();

		updateStorage('a', 'value2', client2);
		await testObject.sync();

		assert.equal(testObject.status, SyncStatus.Idle);
		assert.deepEqual(testObject.conflicts, []);

		assert.equal(readStorage('a', testClient), 'value1');

		const { content } = await testClient.read(testObject.resource);
		assert.ok(content !== null);
		const actual = parseGlobalState(content!);
		assert.deepEqual(actual.storage, { 'a': { version: 1, value: 'value1' } });
	});

	test('sync adding a storage value', async () => {
		updateStorage('a', 'value1', testClient);
		await testObject.sync();

		updateStorage('b', 'value2', testClient);
		await testObject.sync();
		assert.equal(testObject.status, SyncStatus.Idle);
		assert.deepEqual(testObject.conflicts, []);

		assert.equal(readStorage('a', testClient), 'value1');
		assert.equal(readStorage('b', testClient), 'value2');

		const { content } = await testClient.read(testObject.resource);
		assert.ok(content !== null);
		const actual = parseGlobalState(content!);
		assert.deepEqual(actual.storage, { 'a': { version: 1, value: 'value1' }, 'b': { version: 1, value: 'value2' } });
	});

	test('sync updating a storage value', async () => {
		updateStorage('a', 'value1', testClient);
		await testObject.sync();

		updateStorage('a', 'value2', testClient);
		await testObject.sync();
		assert.equal(testObject.status, SyncStatus.Idle);
		assert.deepEqual(testObject.conflicts, []);

		assert.equal(readStorage('a', testClient), 'value2');

		const { content } = await testClient.read(testObject.resource);
		assert.ok(content !== null);
		const actual = parseGlobalState(content!);
		assert.deepEqual(actual.storage, { 'a': { version: 1, value: 'value2' } });
	});

	test('sync removing a storage value', async () => {
		updateStorage('a', 'value1', testClient);
		updateStorage('b', 'value2', testClient);
		await testObject.sync();

		removeStorage('b', testClient);
		await testObject.sync();
		assert.equal(testObject.status, SyncStatus.Idle);
		assert.deepEqual(testObject.conflicts, []);

		assert.equal(readStorage('a', testClient), 'value1');
		assert.equal(readStorage('b', testClient), undefined);

		const { content } = await testClient.read(testObject.resource);
		assert.ok(content !== null);
		const actual = parseGlobalState(content!);
		assert.deepEqual(actual.storage, { 'a': { version: 1, value: 'value1' } });
	});

	test('first time sync - push', async () => {
		updateStorage('a', 'value1', testClient);
		updateStorage('b', 'value2', testClient);

		await testObject.push();
		assert.equal(testObject.status, SyncStatus.Idle);
		assert.deepEqual(testObject.conflicts, []);

		const { content } = await testClient.read(testObject.resource);
		assert.ok(content !== null);
		const actual = parseGlobalState(content!);
		assert.deepEqual(actual.storage, { 'a': { version: 1, value: 'value1' }, 'b': { version: 1, value: 'value2' } });
	});

	test('first time sync - pull', async () => {
		updateStorage('a', 'value1', client2);
		updateStorage('b', 'value2', client2);
		await client2.sync();

		await testObject.pull();
		assert.equal(testObject.status, SyncStatus.Idle);
		assert.deepEqual(testObject.conflicts, []);

		assert.equal(readStorage('a', testClient), 'value1');
		assert.equal(readStorage('b', testClient), 'value2');
	});

	function parseGlobalState(content: string): IGlobalState {
		const syncData: ISyncData = JSON.parse(content);
		return JSON.parse(syncData.content);
	}

	async function updateLocale(client: UserDataSyncClient): Promise<void> {
		const fileService = client.instantiationService.get(IFileService);
		const environmentService = client.instantiationService.get(IEnvironmentService);
		await fileService.writeFile(environmentService.argvResource, VSBuffer.fromString(JSON.stringify({ 'locale': 'en' })));
	}

	function updateStorage(key: string, value: string, client: UserDataSyncClient): void {
		const storageService = client.instantiationService.get(IStorageService);
		storageService.store(key, value, StorageScope.GLOBAL);
	}

	function removeStorage(key: string, client: UserDataSyncClient): void {
		const storageService = client.instantiationService.get(IStorageService);
		storageService.remove(key, StorageScope.GLOBAL);
	}

	function readStorage(key: string, client: UserDataSyncClient): string | undefined {
		const storageService = client.instantiationService.get(IStorageService);
		return storageService.get(key, StorageScope.GLOBAL);
	}

	async function readLocale(client: UserDataSyncClient): Promise<string | undefined> {
		const fileService = client.instantiationService.get(IFileService);
		const environmentService = client.instantiationService.get(IEnvironmentService);
		const content = await fileService.readFile(environmentService.argvResource);
		return JSON.parse(content.value.toString()).locale;
	}

});
