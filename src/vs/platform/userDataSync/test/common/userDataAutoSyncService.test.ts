/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { UserDataSyncClient, UserDataSyncTestServer } from 'vs/platform/userDataSync/test/common/userDataSyncClient';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { UserDataAutoSyncService } from 'vs/platform/userDataSync/common/userDataAutoSyncService';
import { IUserDataSyncService, SyncResource } from 'vs/platform/userDataSync/common/userDataSync';
import { CancellationToken } from 'vs/base/common/cancellation';

class TestUserDataAutoSyncService extends UserDataAutoSyncService {
	protected startAutoSync(): boolean { return false; }
	protected getSyncTriggerDelayTime(): number { return 50; }
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
		await client.instantiationService.get(IUserDataSyncService).sync(CancellationToken.None);
		target.reset();

		const testObject: UserDataAutoSyncService = client.instantiationService.createInstance(TestUserDataAutoSyncService);

		// Trigger auto sync with settings change
		await testObject.triggerSync([SyncResource.Settings], false);

		// Filter out machine requests
		const actual = target.requests.filter(request => !request.url.startsWith(`${target.url}/v1/resource/machines`));

		// Make sure only one manifest request is made
		assert.deepEqual(actual, [{ type: 'GET', url: `${target.url}/v1/manifest`, headers: {} }]);
	});

	test('test auto sync with sync resource change triggers sync for every change', async () => {
		// Setup the client
		const target = new UserDataSyncTestServer();
		const client = disposableStore.add(new UserDataSyncClient(target));
		await client.setUp();

		// Sync once and reset requests
		await client.instantiationService.get(IUserDataSyncService).sync(CancellationToken.None);
		target.reset();

		const testObject: UserDataAutoSyncService = client.instantiationService.createInstance(TestUserDataAutoSyncService);

		// Trigger auto sync with settings change multiple times
		for (let counter = 0; counter < 2; counter++) {
			await testObject.triggerSync([SyncResource.Settings], false);
		}

		// Filter out machine requests
		const actual = target.requests.filter(request => !request.url.startsWith(`${target.url}/v1/resource/machines`));

		assert.deepEqual(actual, [
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
		await client.instantiationService.get(IUserDataSyncService).sync(CancellationToken.None);
		target.reset();

		const testObject: UserDataAutoSyncService = client.instantiationService.createInstance(TestUserDataAutoSyncService);

		// Trigger auto sync with window focus once
		await testObject.triggerSync(['windowFocus'], true);

		// Filter out machine requests
		const actual = target.requests.filter(request => !request.url.startsWith(`${target.url}/v1/resource/machines`));

		// Make sure only one manifest request is made
		assert.deepEqual(actual, [{ type: 'GET', url: `${target.url}/v1/manifest`, headers: {} }]);
	});

	test('test auto sync with non sync resource change does not trigger continuous syncs', async () => {
		// Setup the client
		const target = new UserDataSyncTestServer();
		const client = disposableStore.add(new UserDataSyncClient(target));
		await client.setUp();

		// Sync once and reset requests
		await client.instantiationService.get(IUserDataSyncService).sync(CancellationToken.None);
		target.reset();

		const testObject: UserDataAutoSyncService = client.instantiationService.createInstance(TestUserDataAutoSyncService);

		// Trigger auto sync with window focus multiple times
		for (let counter = 0; counter < 2; counter++) {
			await testObject.triggerSync(['windowFocus'], true);
		}

		// Filter out machine requests
		const actual = target.requests.filter(request => !request.url.startsWith(`${target.url}/v1/resource/machines`));

		// Make sure only one manifest request is made
		assert.deepEqual(actual, [{ type: 'GET', url: `${target.url}/v1/manifest`, headers: {} }]);
	});


});
