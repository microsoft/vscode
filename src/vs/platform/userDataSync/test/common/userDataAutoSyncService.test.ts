/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { UserDataSyncClient, UserDataSyncTestServer } from 'vs/platform/userDataSync/test/common/userDataSyncClient';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { UserDataAutoSyncService } from 'vs/platform/userDataSync/common/userDataAutoSyncService';
import { IUserDataSyncService, SyncResource, IUserDataSyncEnablementService } from 'vs/platform/userDataSync/common/userDataSync';

class TestUserDataAutoSyncService extends UserDataAutoSyncService {
	protected startAutoSync(): boolean { return false; }
}

suite('UserDataAutoSyncService', () => {

	const disposableStore = new DisposableStore();

	teardown(() => disposableStore.clear());

	test('test auto sync with sync resource change triggers sync', async () => {
		// Setup the client
		const target = new UserDataSyncTestServer();
		const client = disposableStore.add(new UserDataSyncClient(target));
		await client.setUp();

		// Sync once and reset requests
		await client.instantiationService.get(IUserDataSyncService).sync();
		target.reset();

		client.instantiationService.get(IUserDataSyncEnablementService).setEnablement(true);
		const testObject: UserDataAutoSyncService = client.instantiationService.createInstance(TestUserDataAutoSyncService);

		// Trigger auto sync with settings change
		await testObject.triggerAutoSync([SyncResource.Settings]);

		// Make sure only one request is made
		assert.deepEqual(target.requests, [{ type: 'GET', url: `${target.url}/v1/manifest`, headers: {} }]);
	});

	test('test auto sync with sync resource change triggers sync for every change', async () => {
		// Setup the client
		const target = new UserDataSyncTestServer();
		const client = disposableStore.add(new UserDataSyncClient(target));
		await client.setUp();

		// Sync once and reset requests
		await client.instantiationService.get(IUserDataSyncService).sync();
		target.reset();

		client.instantiationService.get(IUserDataSyncEnablementService).setEnablement(true);
		const testObject: UserDataAutoSyncService = client.instantiationService.createInstance(TestUserDataAutoSyncService);

		// Trigger auto sync with settings change multiple times
		for (let counter = 0; counter < 2; counter++) {
			await testObject.triggerAutoSync([SyncResource.Settings]);
		}

		assert.deepEqual(target.requests, [
			{ type: 'GET', url: `${target.url}/v1/manifest`, headers: {} },
			{ type: 'GET', url: `${target.url}/v1/manifest`, headers: {} }
		]);
	});

	test('test auto sync with non sync resource change triggers sync', async () => {
		// Setup the client
		const target = new UserDataSyncTestServer();
		const client = disposableStore.add(new UserDataSyncClient(target));
		await client.setUp();

		// Sync once and reset requests
		await client.instantiationService.get(IUserDataSyncService).sync();
		target.reset();

		client.instantiationService.get(IUserDataSyncEnablementService).setEnablement(true);
		const testObject: UserDataAutoSyncService = client.instantiationService.createInstance(TestUserDataAutoSyncService);

		// Trigger auto sync with window focus once
		await testObject.triggerAutoSync(['windowFocus']);

		// Make sure only one request is made
		assert.deepEqual(target.requests, [{ type: 'GET', url: `${target.url}/v1/manifest`, headers: {} }]);
	});

	test('test auto sync with non sync resource change does not trigger continuous syncs', async () => {
		// Setup the client
		const target = new UserDataSyncTestServer();
		const client = disposableStore.add(new UserDataSyncClient(target));
		await client.setUp();

		// Sync once and reset requests
		await client.instantiationService.get(IUserDataSyncService).sync();
		target.reset();

		client.instantiationService.get(IUserDataSyncEnablementService).setEnablement(true);
		const testObject: UserDataAutoSyncService = client.instantiationService.createInstance(TestUserDataAutoSyncService);

		// Trigger auto sync with window focus multiple times
		for (let counter = 0; counter < 2; counter++) {
			await testObject.triggerAutoSync(['windowFocus']);
		}

		// Make sure only one request is made
		assert.deepEqual(target.requests, [{ type: 'GET', url: `${target.url}/v1/manifest`, headers: {} }]);
	});


});
