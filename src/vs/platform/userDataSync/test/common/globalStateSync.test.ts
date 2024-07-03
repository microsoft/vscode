/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from 'vs/base/common/buffer';
import { runWithFakedTimers } from 'vs/base/test/common/timeTravelScheduler';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IUserDataProfile, IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { GlobalStateSynchroniser } from 'vs/platform/userDataSync/common/globalStateSync';
import { IGlobalState, ISyncData, IUserDataSyncStoreService, SyncResource, SyncStatus } from 'vs/platform/userDataSync/common/userDataSync';
import { IUserDataProfileStorageService } from 'vs/platform/userDataProfile/common/userDataProfileStorageService';
import { UserDataSyncClient, UserDataSyncTestServer } from 'vs/platform/userDataSync/test/common/userDataSyncClient';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';


suite('GlobalStateSync', () => {

	const server = new UserDataSyncTestServer();
	let testClient: UserDataSyncClient;
	let client2: UserDataSyncClient;

	let testObject: GlobalStateSynchroniser;

	teardown(async () => {
		await testClient.instantiationService.get(IUserDataSyncStoreService).clear();
	});

	const disposableStore = ensureNoDisposablesAreLeakedInTestSuite();

	setup(async () => {
		testClient = disposableStore.add(new UserDataSyncClient(server));
		await testClient.setUp(true);
		testObject = testClient.getSynchronizer(SyncResource.GlobalState) as GlobalStateSynchroniser;

		client2 = disposableStore.add(new UserDataSyncClient(server));
		await client2.setUp(true);
	});

	test('when global state does not exist', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		assert.deepStrictEqual(await testObject.getLastSyncUserData(), null);
		let manifest = await testClient.getResourceManifest();
		server.reset();
		await testObject.sync(manifest);

		assert.deepStrictEqual(server.requests, [
			{ type: 'GET', url: `${server.url}/v1/resource/${testObject.resource}/latest`, headers: {} },
		]);

		const lastSyncUserData = await testObject.getLastSyncUserData();
		const remoteUserData = await testObject.getRemoteUserData(null);
		assert.deepStrictEqual(lastSyncUserData!.ref, remoteUserData.ref);
		assert.deepStrictEqual(lastSyncUserData!.syncData, remoteUserData.syncData);
		assert.strictEqual(lastSyncUserData!.syncData, null);

		manifest = await testClient.getResourceManifest();
		server.reset();
		await testObject.sync(manifest);
		assert.deepStrictEqual(server.requests, []);

		manifest = await testClient.getResourceManifest();
		server.reset();
		await testObject.sync(manifest);
		assert.deepStrictEqual(server.requests, []);
	}));

	test('when global state is created after first sync', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await testObject.sync(await testClient.getResourceManifest());
		updateUserStorage('a', 'value1', testClient);

		let lastSyncUserData = await testObject.getLastSyncUserData();
		const manifest = await testClient.getResourceManifest();
		server.reset();
		await testObject.sync(manifest);

		assert.deepStrictEqual(server.requests, [
			{ type: 'POST', url: `${server.url}/v1/resource/${testObject.resource}`, headers: { 'If-Match': lastSyncUserData?.ref } },
		]);

		lastSyncUserData = await testObject.getLastSyncUserData();
		const remoteUserData = await testObject.getRemoteUserData(null);
		assert.deepStrictEqual(lastSyncUserData!.ref, remoteUserData.ref);
		assert.deepStrictEqual(lastSyncUserData!.syncData, remoteUserData.syncData);
		assert.deepStrictEqual(JSON.parse(lastSyncUserData!.syncData!.content).storage, { 'a': { version: 1, value: 'value1' } });
	}));

	test('first time sync - outgoing to server (no state)', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		updateUserStorage('a', 'value1', testClient);
		updateMachineStorage('b', 'value1', testClient);
		await updateLocale(testClient);

		await testObject.sync(await testClient.getResourceManifest());
		assert.strictEqual(testObject.status, SyncStatus.Idle);
		assert.deepStrictEqual(testObject.conflicts.conflicts, []);

		const { content } = await testClient.read(testObject.resource);
		assert.ok(content !== null);
		const actual = parseGlobalState(content);
		assert.deepStrictEqual(actual.storage, { 'globalState.argv.locale': { version: 1, value: 'en' }, 'a': { version: 1, value: 'value1' } });
	}));

	test('first time sync - incoming from server (no state)', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		updateUserStorage('a', 'value1', client2);
		await updateLocale(client2);
		await client2.sync();

		await testObject.sync(await testClient.getResourceManifest());
		assert.strictEqual(testObject.status, SyncStatus.Idle);
		assert.deepStrictEqual(testObject.conflicts.conflicts, []);

		assert.strictEqual(readStorage('a', testClient), 'value1');
		assert.strictEqual(await readLocale(testClient), 'en');
	}));

	test('first time sync when storage exists', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		updateUserStorage('a', 'value1', client2);
		await client2.sync();

		updateUserStorage('b', 'value2', testClient);
		await testObject.sync(await testClient.getResourceManifest());
		assert.strictEqual(testObject.status, SyncStatus.Idle);
		assert.deepStrictEqual(testObject.conflicts.conflicts, []);

		assert.strictEqual(readStorage('a', testClient), 'value1');
		assert.strictEqual(readStorage('b', testClient), 'value2');

		const { content } = await testClient.read(testObject.resource);
		assert.ok(content !== null);
		const actual = parseGlobalState(content);
		assert.deepStrictEqual(actual.storage, { 'a': { version: 1, value: 'value1' }, 'b': { version: 1, value: 'value2' } });
	}));

	test('first time sync when storage exists - has conflicts', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		updateUserStorage('a', 'value1', client2);
		await client2.sync();

		updateUserStorage('a', 'value2', client2);
		await testObject.sync(await testClient.getResourceManifest());

		assert.strictEqual(testObject.status, SyncStatus.Idle);
		assert.deepStrictEqual(testObject.conflicts.conflicts, []);

		assert.strictEqual(readStorage('a', testClient), 'value1');

		const { content } = await testClient.read(testObject.resource);
		assert.ok(content !== null);
		const actual = parseGlobalState(content);
		assert.deepStrictEqual(actual.storage, { 'a': { version: 1, value: 'value1' } });
	}));

	test('sync adding a storage value', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		updateUserStorage('a', 'value1', testClient);
		await testObject.sync(await testClient.getResourceManifest());

		updateUserStorage('b', 'value2', testClient);
		await testObject.sync(await testClient.getResourceManifest());
		assert.strictEqual(testObject.status, SyncStatus.Idle);
		assert.deepStrictEqual(testObject.conflicts.conflicts, []);

		assert.strictEqual(readStorage('a', testClient), 'value1');
		assert.strictEqual(readStorage('b', testClient), 'value2');

		const { content } = await testClient.read(testObject.resource);
		assert.ok(content !== null);
		const actual = parseGlobalState(content);
		assert.deepStrictEqual(actual.storage, { 'a': { version: 1, value: 'value1' }, 'b': { version: 1, value: 'value2' } });
	}));

	test('sync updating a storage value', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		updateUserStorage('a', 'value1', testClient);
		await testObject.sync(await testClient.getResourceManifest());

		updateUserStorage('a', 'value2', testClient);
		await testObject.sync(await testClient.getResourceManifest());
		assert.strictEqual(testObject.status, SyncStatus.Idle);
		assert.deepStrictEqual(testObject.conflicts.conflicts, []);

		assert.strictEqual(readStorage('a', testClient), 'value2');

		const { content } = await testClient.read(testObject.resource);
		assert.ok(content !== null);
		const actual = parseGlobalState(content);
		assert.deepStrictEqual(actual.storage, { 'a': { version: 1, value: 'value2' } });
	}));

	test('sync removing a storage value', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		updateUserStorage('a', 'value1', testClient);
		updateUserStorage('b', 'value2', testClient);
		await testObject.sync(await testClient.getResourceManifest());

		removeStorage('b', testClient);
		await testObject.sync(await testClient.getResourceManifest());
		assert.strictEqual(testObject.status, SyncStatus.Idle);
		assert.deepStrictEqual(testObject.conflicts.conflicts, []);

		assert.strictEqual(readStorage('a', testClient), 'value1');
		assert.strictEqual(readStorage('b', testClient), undefined);

		const { content } = await testClient.read(testObject.resource);
		assert.ok(content !== null);
		const actual = parseGlobalState(content);
		assert.deepStrictEqual(actual.storage, { 'a': { version: 1, value: 'value1' } });
	}));

	test('sync profile state', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const client2 = disposableStore.add(new UserDataSyncClient(server));
		await client2.setUp(true);
		const profile = await client2.instantiationService.get(IUserDataProfilesService).createNamedProfile('profile1');
		await updateLocale(client2);
		await updateUserStorageForProfile('a', 'value1', profile, testClient);
		await client2.sync();

		await testClient.sync();

		const syncedProfile = testClient.instantiationService.get(IUserDataProfilesService).profiles.find(p => p.id === profile.id)!;
		const profileStorage = await testClient.instantiationService.get(IUserDataProfileStorageService).readStorageData(syncedProfile);
		assert.strictEqual(profileStorage.get('a')?.value, 'value1');
		assert.strictEqual(await readLocale(testClient), 'en');

		const { content } = await testClient.read(testObject.resource, '1');
		assert.ok(content !== null);
		const actual = parseGlobalState(content);
		assert.deepStrictEqual(actual.storage, { 'a': { version: 1, value: 'value1' } });
	}));

	function parseGlobalState(content: string): IGlobalState {
		const syncData: ISyncData = JSON.parse(content);
		return JSON.parse(syncData.content);
	}

	async function updateLocale(client: UserDataSyncClient): Promise<void> {
		const fileService = client.instantiationService.get(IFileService);
		const environmentService = client.instantiationService.get(IEnvironmentService);
		await fileService.writeFile(environmentService.argvResource, VSBuffer.fromString(JSON.stringify({ 'locale': 'en' })));
	}

	function updateUserStorage(key: string, value: string, client: UserDataSyncClient, profile?: IUserDataProfile): void {
		const storageService = client.instantiationService.get(IStorageService);
		storageService.store(key, value, StorageScope.PROFILE, StorageTarget.USER);
	}

	async function updateUserStorageForProfile(key: string, value: string, profile: IUserDataProfile, client: UserDataSyncClient): Promise<void> {
		const storageService = client.instantiationService.get(IUserDataProfileStorageService);
		const data = new Map<string, string>();
		data.set(key, value);
		await storageService.updateStorageData(profile, data, StorageTarget.USER);
	}

	function updateMachineStorage(key: string, value: string, client: UserDataSyncClient): void {
		const storageService = client.instantiationService.get(IStorageService);
		storageService.store(key, value, StorageScope.PROFILE, StorageTarget.MACHINE);
	}

	function removeStorage(key: string, client: UserDataSyncClient): void {
		const storageService = client.instantiationService.get(IStorageService);
		storageService.remove(key, StorageScope.PROFILE);
	}

	function readStorage(key: string, client: UserDataSyncClient): string | undefined {
		const storageService = client.instantiationService.get(IStorageService);
		return storageService.get(key, StorageScope.PROFILE);
	}

	async function readLocale(client: UserDataSyncClient): Promise<string | undefined> {
		const fileService = client.instantiationService.get(IFileService);
		const environmentService = client.instantiationService.get(IEnvironmentService);
		const content = await fileService.readFile(environmentService.argvResource);
		return JSON.parse(content.value.toString()).locale;
	}

});
