/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { IUserDataSyncService, UserDataSyncError, UserDataSyncErrorCode } from 'vs/platform/userDataSync/common/userDataSync';
import { UserDataSyncClient, UserDataSyncTestServer } from 'vs/platform/userDataSync/test/common/userDataSyncClient';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IFileService } from 'vs/platform/files/common/files';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { VSBuffer } from 'vs/base/common/buffer';

suite('UserDataSyncService', () => {

	const disposableStore = new DisposableStore();

	teardown(() => disposableStore.clear());

	test('test first time sync ever', async () => {
		// Setup the client
		const target = new UserDataSyncTestServer();
		const client = disposableStore.add(new UserDataSyncClient(target));
		await client.setUp();
		const testObject = client.instantiationService.get(IUserDataSyncService);

		// Sync for first time
		await testObject.sync();

		assert.deepEqual(target.requests, [
			// Manifest
			{ type: 'GET', url: `${target.url}/v1/manifest`, headers: {} },
			// Settings
			{ type: 'GET', url: `${target.url}/v1/resource/settings/latest`, headers: {} },
			{ type: 'POST', url: `${target.url}/v1/resource/settings`, headers: { 'If-Match': '0' } },
			// Keybindings
			{ type: 'GET', url: `${target.url}/v1/resource/keybindings/latest`, headers: {} },
			{ type: 'POST', url: `${target.url}/v1/resource/keybindings`, headers: { 'If-Match': '0' } },
			// Global state
			{ type: 'GET', url: `${target.url}/v1/resource/globalState/latest`, headers: {} },
			{ type: 'POST', url: `${target.url}/v1/resource/globalState`, headers: { 'If-Match': '0' } },
			// Extensions
			{ type: 'GET', url: `${target.url}/v1/resource/extensions/latest`, headers: {} },
			{ type: 'POST', url: `${target.url}/v1/resource/extensions`, headers: { 'If-Match': '0' } }
		]);

	});

	test('test first time sync from the client with no changes - pull', async () => {
		const target = new UserDataSyncTestServer();

		// Setup and sync from the first client
		const client = disposableStore.add(new UserDataSyncClient(target));
		await client.setUp();
		await client.instantiationService.get(IUserDataSyncService).sync();

		// Setup the test client
		const testClient = disposableStore.add(new UserDataSyncClient(target));
		await testClient.setUp();
		const testObject = testClient.instantiationService.get(IUserDataSyncService);

		// Sync (pull) from the test client
		target.reset();
		await testObject.isFirstTimeSyncWithMerge();
		await testObject.pull();

		assert.deepEqual(target.requests, [
			// Manifest
			{ type: 'GET', url: `${target.url}/v1/manifest`, headers: {} },
			// Settings
			{ type: 'GET', url: `${target.url}/v1/resource/settings/latest`, headers: {} },
			// Keybindings
			{ type: 'GET', url: `${target.url}/v1/resource/keybindings/latest`, headers: {} },
			// Global state
			{ type: 'GET', url: `${target.url}/v1/resource/globalState/latest`, headers: {} },
			// Extensions
			{ type: 'GET', url: `${target.url}/v1/resource/extensions/latest`, headers: {} },
		]);

	});

	test('test first time sync from the client with changes - pull', async () => {
		const target = new UserDataSyncTestServer();

		// Setup and sync from the first client
		const client = disposableStore.add(new UserDataSyncClient(target));
		await client.setUp();
		await client.instantiationService.get(IUserDataSyncService).sync();

		// Setup the test client with changes
		const testClient = disposableStore.add(new UserDataSyncClient(target));
		await testClient.setUp();
		const testObject = testClient.instantiationService.get(IUserDataSyncService);
		const fileService = testClient.instantiationService.get(IFileService);
		const environmentService = testClient.instantiationService.get(IEnvironmentService);
		await fileService.writeFile(environmentService.settingsResource, VSBuffer.fromString(JSON.stringify({ 'editor.fontSize': 14 })));
		await fileService.writeFile(environmentService.keybindingsResource, VSBuffer.fromString(JSON.stringify([{ 'command': 'abcd', 'key': 'cmd+c' }])));
		await fileService.writeFile(environmentService.argvResource, VSBuffer.fromString(JSON.stringify({ 'locale': 'de' })));

		// Sync (pull) from the test client
		target.reset();
		await testObject.isFirstTimeSyncWithMerge();
		await testObject.pull();

		assert.deepEqual(target.requests, [
			// Manifest
			{ type: 'GET', url: `${target.url}/v1/manifest`, headers: {} },
			// Settings
			{ type: 'GET', url: `${target.url}/v1/resource/settings/latest`, headers: {} },
			// Keybindings
			{ type: 'GET', url: `${target.url}/v1/resource/keybindings/latest`, headers: {} },
			// Global state
			{ type: 'GET', url: `${target.url}/v1/resource/globalState/latest`, headers: {} },
			// Extensions
			{ type: 'GET', url: `${target.url}/v1/resource/extensions/latest`, headers: {} },
		]);

	});

	test('test first time sync from the client with no changes - merge', async () => {
		const target = new UserDataSyncTestServer();

		// Setup and sync from the first client
		const client = disposableStore.add(new UserDataSyncClient(target));
		await client.setUp();
		await client.instantiationService.get(IUserDataSyncService).sync();

		// Setup the test client
		const testClient = disposableStore.add(new UserDataSyncClient(target));
		await testClient.setUp();
		const testObject = testClient.instantiationService.get(IUserDataSyncService);

		// Sync (merge) from the test client
		target.reset();
		await testObject.isFirstTimeSyncWithMerge();
		await testObject.sync();

		assert.deepEqual(target.requests, [
			// Manifest
			{ type: 'GET', url: `${target.url}/v1/manifest`, headers: {} },
			{ type: 'GET', url: `${target.url}/v1/manifest`, headers: {} },
			// Settings
			{ type: 'GET', url: `${target.url}/v1/resource/settings/latest`, headers: {} },
			// Keybindings
			{ type: 'GET', url: `${target.url}/v1/resource/keybindings/latest`, headers: {} },
			// Global state
			{ type: 'GET', url: `${target.url}/v1/resource/globalState/latest`, headers: {} },
			// Extensions
			{ type: 'GET', url: `${target.url}/v1/resource/extensions/latest`, headers: {} },
		]);

	});

	test('test first time sync from the client with changes - merge', async () => {
		const target = new UserDataSyncTestServer();

		// Setup and sync from the first client
		const client = disposableStore.add(new UserDataSyncClient(target));
		await client.setUp();
		await client.instantiationService.get(IUserDataSyncService).sync();

		// Setup the test client with changes
		const testClient = disposableStore.add(new UserDataSyncClient(target));
		await testClient.setUp();
		const fileService = testClient.instantiationService.get(IFileService);
		const environmentService = testClient.instantiationService.get(IEnvironmentService);
		await fileService.writeFile(environmentService.settingsResource, VSBuffer.fromString(JSON.stringify({ 'editor.fontSize': 14 })));
		await fileService.writeFile(environmentService.keybindingsResource, VSBuffer.fromString(JSON.stringify([{ 'command': 'abcd', 'key': 'cmd+c' }])));
		await fileService.writeFile(environmentService.argvResource, VSBuffer.fromString(JSON.stringify({ 'locale': 'de' })));
		const testObject = testClient.instantiationService.get(IUserDataSyncService);

		// Sync (merge) from the test client
		target.reset();
		await testObject.isFirstTimeSyncWithMerge();
		await testObject.sync();

		assert.deepEqual(target.requests, [
			// Manifest
			{ type: 'GET', url: `${target.url}/v1/manifest`, headers: {} },
			{ type: 'GET', url: `${target.url}/v1/manifest`, headers: {} },
			// Settings
			{ type: 'GET', url: `${target.url}/v1/resource/settings/latest`, headers: {} },
			{ type: 'POST', url: `${target.url}/v1/resource/settings`, headers: { 'If-Match': '1' } },
			// Keybindings
			{ type: 'GET', url: `${target.url}/v1/resource/keybindings/latest`, headers: {} },
			{ type: 'POST', url: `${target.url}/v1/resource/keybindings`, headers: { 'If-Match': '1' } },
			// Global state
			{ type: 'GET', url: `${target.url}/v1/resource/globalState/latest`, headers: {} },
			{ type: 'POST', url: `${target.url}/v1/resource/globalState`, headers: { 'If-Match': '1' } },
			// Extensions
			{ type: 'GET', url: `${target.url}/v1/resource/extensions/latest`, headers: {} },
		]);

	});

	test('test sync when there are no changes', async () => {
		const target = new UserDataSyncTestServer();

		// Setup and sync from the client
		const client = disposableStore.add(new UserDataSyncClient(target));
		await client.setUp();
		const testObject = client.instantiationService.get(IUserDataSyncService);
		await testObject.sync();

		// sync from the client again
		target.reset();
		await testObject.sync();

		assert.deepEqual(target.requests, [
			// Manifest
			{ type: 'GET', url: `${target.url}/v1/manifest`, headers: {} },
		]);
	});

	test('test sync when there are local changes', async () => {
		const target = new UserDataSyncTestServer();

		// Setup and sync from the client
		const client = disposableStore.add(new UserDataSyncClient(target));
		await client.setUp();
		const testObject = client.instantiationService.get(IUserDataSyncService);
		await testObject.sync();
		target.reset();

		// Do changes in the client
		const fileService = client.instantiationService.get(IFileService);
		const environmentService = client.instantiationService.get(IEnvironmentService);
		await fileService.writeFile(environmentService.settingsResource, VSBuffer.fromString(JSON.stringify({ 'editor.fontSize': 14 })));
		await fileService.writeFile(environmentService.keybindingsResource, VSBuffer.fromString(JSON.stringify([{ 'command': 'abcd', 'key': 'cmd+c' }])));
		await fileService.writeFile(environmentService.argvResource, VSBuffer.fromString(JSON.stringify({ 'locale': 'de' })));

		// Sync from the client
		await testObject.sync();

		assert.deepEqual(target.requests, [
			// Manifest
			{ type: 'GET', url: `${target.url}/v1/manifest`, headers: {} },
			// Settings
			{ type: 'POST', url: `${target.url}/v1/resource/settings`, headers: { 'If-Match': '1' } },
			// Keybindings
			{ type: 'POST', url: `${target.url}/v1/resource/keybindings`, headers: { 'If-Match': '1' } },
			// Global state
			{ type: 'POST', url: `${target.url}/v1/resource/globalState`, headers: { 'If-Match': '1' } },
		]);
	});

	test('test sync when there are remote changes', async () => {
		const target = new UserDataSyncTestServer();

		// Sync from first client
		const client = disposableStore.add(new UserDataSyncClient(target));
		await client.setUp();
		await client.instantiationService.get(IUserDataSyncService).sync();

		// Sync from test client
		const testClient = disposableStore.add(new UserDataSyncClient(target));
		await testClient.setUp();
		const testObject = testClient.instantiationService.get(IUserDataSyncService);
		await testObject.sync();

		// Do changes in first client and sync
		const fileService = client.instantiationService.get(IFileService);
		const environmentService = client.instantiationService.get(IEnvironmentService);
		await fileService.writeFile(environmentService.settingsResource, VSBuffer.fromString(JSON.stringify({ 'editor.fontSize': 14 })));
		await fileService.writeFile(environmentService.keybindingsResource, VSBuffer.fromString(JSON.stringify([{ 'command': 'abcd', 'key': 'cmd+c' }])));
		await fileService.writeFile(environmentService.argvResource, VSBuffer.fromString(JSON.stringify({ 'locale': 'de' })));
		await client.instantiationService.get(IUserDataSyncService).sync();

		// Sync from test client
		target.reset();
		await testObject.sync();

		assert.deepEqual(target.requests, [
			// Manifest
			{ type: 'GET', url: `${target.url}/v1/manifest`, headers: {} },
			// Settings
			{ type: 'GET', url: `${target.url}/v1/resource/settings/latest`, headers: { 'If-None-Match': '1' } },
			// Keybindings
			{ type: 'GET', url: `${target.url}/v1/resource/keybindings/latest`, headers: { 'If-None-Match': '1' } },
			// Global state
			{ type: 'GET', url: `${target.url}/v1/resource/globalState/latest`, headers: { 'If-None-Match': '1' } },
		]);

	});

	test('test delete', async () => {
		const target = new UserDataSyncTestServer();

		// Sync from the client
		const testClient = disposableStore.add(new UserDataSyncClient(target));
		await testClient.setUp();
		const testObject = testClient.instantiationService.get(IUserDataSyncService);
		await testObject.sync();

		// Reset from the client
		target.reset();
		await testObject.reset();

		assert.deepEqual(target.requests, [
			// Manifest
			{ type: 'DELETE', url: `${target.url}/v1/resource`, headers: {} },
		]);

	});

	test('test delete and sync', async () => {
		const target = new UserDataSyncTestServer();

		// Sync from the client
		const testClient = disposableStore.add(new UserDataSyncClient(target));
		await testClient.setUp();
		const testObject = testClient.instantiationService.get(IUserDataSyncService);
		await testObject.sync();

		// Reset from the client
		await testObject.reset();

		// Sync again
		target.reset();
		await testObject.sync();

		assert.deepEqual(target.requests, [
			// Manifest
			{ type: 'GET', url: `${target.url}/v1/manifest`, headers: {} },
			// Settings
			{ type: 'GET', url: `${target.url}/v1/resource/settings/latest`, headers: {} },
			{ type: 'POST', url: `${target.url}/v1/resource/settings`, headers: { 'If-Match': '0' } },
			// Keybindings
			{ type: 'GET', url: `${target.url}/v1/resource/keybindings/latest`, headers: {} },
			{ type: 'POST', url: `${target.url}/v1/resource/keybindings`, headers: { 'If-Match': '0' } },
			// Global state
			{ type: 'GET', url: `${target.url}/v1/resource/globalState/latest`, headers: {} },
			{ type: 'POST', url: `${target.url}/v1/resource/globalState`, headers: { 'If-Match': '0' } },
			// Extensions
			{ type: 'GET', url: `${target.url}/v1/resource/extensions/latest`, headers: {} },
			{ type: 'POST', url: `${target.url}/v1/resource/extensions`, headers: { 'If-Match': '0' } }
		]);

	});

	test('test delete on one client throws error on other client while syncing', async () => {
		const target = new UserDataSyncTestServer();

		// Set up and sync from the client
		const client = disposableStore.add(new UserDataSyncClient(target));
		await client.setUp();
		await client.instantiationService.get(IUserDataSyncService).sync();

		// Set up and sync from the test client
		const testClient = disposableStore.add(new UserDataSyncClient(target));
		await testClient.setUp();
		const testObject = testClient.instantiationService.get(IUserDataSyncService);
		await testObject.sync();

		// Reset from the first client
		await client.instantiationService.get(IUserDataSyncService).reset();

		// Sync from the test client
		target.reset();
		try {
			await testObject.sync();
		} catch (e) {
			assert.ok(e instanceof UserDataSyncError);
			assert.deepEqual((<UserDataSyncError>e).code, UserDataSyncErrorCode.TurnedOff);
			assert.deepEqual(target.requests, [
				// Manifest
				{ type: 'GET', url: `${target.url}/v1/manifest`, headers: {} },
			]);
			return;
		}
		throw assert.fail('Should fail with turned off error');
	});

});
