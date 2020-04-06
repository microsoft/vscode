/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { IUserDataSyncService, UserDataSyncError, UserDataSyncErrorCode, SyncStatus, SyncResource } from 'vs/platform/userDataSync/common/userDataSync';
import { UserDataSyncClient, UserDataSyncTestServer } from 'vs/platform/userDataSync/test/common/userDataSyncClient';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IFileService } from 'vs/platform/files/common/files';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { VSBuffer } from 'vs/base/common/buffer';
import { joinPath } from 'vs/base/common/resources';

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
			// Snippets
			{ type: 'GET', url: `${target.url}/v1/resource/snippets/latest`, headers: {} },
			{ type: 'POST', url: `${target.url}/v1/resource/snippets`, headers: { 'If-Match': '0' } },
			// Global state
			{ type: 'GET', url: `${target.url}/v1/resource/globalState/latest`, headers: {} },
			{ type: 'POST', url: `${target.url}/v1/resource/globalState`, headers: { 'If-Match': '0' } },
			// Extensions
			{ type: 'GET', url: `${target.url}/v1/resource/extensions/latest`, headers: {} },
			{ type: 'POST', url: `${target.url}/v1/resource/extensions`, headers: { 'If-Match': '0' } },
			// Manifest
			{ type: 'GET', url: `${target.url}/v1/manifest`, headers: {} },
		]);

	});

	test('test first time sync ever with no data', async () => {
		// Setup the client
		const target = new UserDataSyncTestServer();
		const client = disposableStore.add(new UserDataSyncClient(target));
		await client.setUp(true);
		const testObject = client.instantiationService.get(IUserDataSyncService);

		// Sync for first time
		await testObject.sync();

		assert.deepEqual(target.requests, [
			// Manifest
			{ type: 'GET', url: `${target.url}/v1/manifest`, headers: {} },
			// Settings
			{ type: 'GET', url: `${target.url}/v1/resource/settings/latest`, headers: {} },
			// Keybindings
			{ type: 'GET', url: `${target.url}/v1/resource/keybindings/latest`, headers: {} },
			// Snippets
			{ type: 'GET', url: `${target.url}/v1/resource/snippets/latest`, headers: {} },
			{ type: 'POST', url: `${target.url}/v1/resource/snippets`, headers: { 'If-Match': '0' } },
			// Global state
			{ type: 'GET', url: `${target.url}/v1/resource/globalState/latest`, headers: {} },
			{ type: 'POST', url: `${target.url}/v1/resource/globalState`, headers: { 'If-Match': '0' } },
			// Extensions
			{ type: 'GET', url: `${target.url}/v1/resource/extensions/latest`, headers: {} },
			{ type: 'POST', url: `${target.url}/v1/resource/extensions`, headers: { 'If-Match': '0' } },
			// Manifest
			{ type: 'GET', url: `${target.url}/v1/manifest`, headers: {} },
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
			/* first time sync */
			{ type: 'GET', url: `${target.url}/v1/manifest`, headers: {} },
			{ type: 'GET', url: `${target.url}/v1/resource/settings/latest`, headers: {} },
			{ type: 'GET', url: `${target.url}/v1/resource/keybindings/latest`, headers: {} },
			{ type: 'GET', url: `${target.url}/v1/resource/snippets/latest`, headers: {} },
			{ type: 'GET', url: `${target.url}/v1/resource/extensions/latest`, headers: {} },
			/* pull */
			{ type: 'GET', url: `${target.url}/v1/resource/settings/latest`, headers: {} },
			{ type: 'GET', url: `${target.url}/v1/resource/keybindings/latest`, headers: {} },
			{ type: 'GET', url: `${target.url}/v1/resource/snippets/latest`, headers: {} },
			{ type: 'GET', url: `${target.url}/v1/resource/globalState/latest`, headers: {} },
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
			/* first time sync */
			{ type: 'GET', url: `${target.url}/v1/manifest`, headers: {} },
			{ type: 'GET', url: `${target.url}/v1/resource/settings/latest`, headers: {} },
			/* pull */
			{ type: 'GET', url: `${target.url}/v1/resource/settings/latest`, headers: {} },
			{ type: 'GET', url: `${target.url}/v1/resource/keybindings/latest`, headers: {} },
			{ type: 'GET', url: `${target.url}/v1/resource/snippets/latest`, headers: {} },
			{ type: 'GET', url: `${target.url}/v1/resource/globalState/latest`, headers: {} },
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
			/* first time sync */
			{ type: 'GET', url: `${target.url}/v1/manifest`, headers: {} },
			{ type: 'GET', url: `${target.url}/v1/resource/settings/latest`, headers: {} },
			{ type: 'GET', url: `${target.url}/v1/resource/keybindings/latest`, headers: {} },
			{ type: 'GET', url: `${target.url}/v1/resource/snippets/latest`, headers: {} },
			{ type: 'GET', url: `${target.url}/v1/resource/extensions/latest`, headers: {} },
			/* sync */
			{ type: 'GET', url: `${target.url}/v1/manifest`, headers: {} },
			{ type: 'GET', url: `${target.url}/v1/resource/settings/latest`, headers: {} },
			{ type: 'GET', url: `${target.url}/v1/resource/keybindings/latest`, headers: {} },
			{ type: 'GET', url: `${target.url}/v1/resource/snippets/latest`, headers: {} },
			{ type: 'GET', url: `${target.url}/v1/resource/globalState/latest`, headers: {} },
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
		await fileService.writeFile(joinPath(environmentService.snippetsHome, 'html.json'), VSBuffer.fromString(`{}`));
		const testObject = testClient.instantiationService.get(IUserDataSyncService);

		// Sync (merge) from the test client
		target.reset();
		await testObject.isFirstTimeSyncWithMerge();
		await testObject.sync();

		assert.deepEqual(target.requests, [
			/* first time sync */
			{ type: 'GET', url: `${target.url}/v1/manifest`, headers: {} },
			{ type: 'GET', url: `${target.url}/v1/resource/settings/latest`, headers: {} },

			/* first time sync */
			{ type: 'GET', url: `${target.url}/v1/manifest`, headers: {} },
			{ type: 'GET', url: `${target.url}/v1/resource/settings/latest`, headers: {} },
			{ type: 'POST', url: `${target.url}/v1/resource/settings`, headers: { 'If-Match': '1' } },
			{ type: 'GET', url: `${target.url}/v1/resource/keybindings/latest`, headers: {} },
			{ type: 'POST', url: `${target.url}/v1/resource/keybindings`, headers: { 'If-Match': '1' } },
			{ type: 'GET', url: `${target.url}/v1/resource/snippets/latest`, headers: {} },
			{ type: 'POST', url: `${target.url}/v1/resource/snippets`, headers: { 'If-Match': '1' } },
			{ type: 'GET', url: `${target.url}/v1/resource/globalState/latest`, headers: {} },
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
		await fileService.writeFile(joinPath(environmentService.snippetsHome, 'html.json'), VSBuffer.fromString(`{}`));
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
			// Snippets
			{ type: 'POST', url: `${target.url}/v1/resource/snippets`, headers: { 'If-Match': '1' } },
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
		await fileService.writeFile(joinPath(environmentService.snippetsHome, 'html.json'), VSBuffer.fromString(`{ "a": "changed" }`));
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
			// Snippets
			{ type: 'GET', url: `${target.url}/v1/resource/snippets/latest`, headers: { 'If-None-Match': '1' } },
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
			// Snippets
			{ type: 'GET', url: `${target.url}/v1/resource/snippets/latest`, headers: {} },
			{ type: 'POST', url: `${target.url}/v1/resource/snippets`, headers: { 'If-Match': '0' } },
			// Global state
			{ type: 'GET', url: `${target.url}/v1/resource/globalState/latest`, headers: {} },
			{ type: 'POST', url: `${target.url}/v1/resource/globalState`, headers: { 'If-Match': '0' } },
			// Extensions
			{ type: 'GET', url: `${target.url}/v1/resource/extensions/latest`, headers: {} },
			{ type: 'POST', url: `${target.url}/v1/resource/extensions`, headers: { 'If-Match': '0' } },
			// Manifest
			{ type: 'GET', url: `${target.url}/v1/manifest`, headers: {} },
		]);

	});

	test('test delete on one client throws turned off error on other client while syncing', async () => {
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

	test('test creating new session from one client throws session expired error on another client while syncing', async () => {
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

		// Sync again from the first client to create new session
		await client.instantiationService.get(IUserDataSyncService).sync();

		// Sync from the test client
		target.reset();
		try {
			await testObject.sync();
		} catch (e) {
			assert.ok(e instanceof UserDataSyncError);
			assert.deepEqual((<UserDataSyncError>e).code, UserDataSyncErrorCode.SessionExpired);
			assert.deepEqual(target.requests, [
				// Manifest
				{ type: 'GET', url: `${target.url}/v1/manifest`, headers: {} },
			]);
			return;
		}
		throw assert.fail('Should fail with turned off error');
	});

	test('test sync status', async () => {
		const target = new UserDataSyncTestServer();

		// Setup the client
		const client = disposableStore.add(new UserDataSyncClient(target));
		await client.setUp();
		const testObject = client.instantiationService.get(IUserDataSyncService);

		// sync from the client
		const actualStatuses: SyncStatus[] = [];
		const disposable = testObject.onDidChangeStatus(status => actualStatuses.push(status));
		await testObject.sync();

		disposable.dispose();
		assert.deepEqual(actualStatuses, [SyncStatus.Syncing, SyncStatus.Idle, SyncStatus.Syncing, SyncStatus.Idle, SyncStatus.Syncing, SyncStatus.Idle, SyncStatus.Syncing, SyncStatus.Idle, SyncStatus.Syncing, SyncStatus.Idle]);
	});

	test('test sync conflicts status', async () => {
		const target = new UserDataSyncTestServer();

		// Setup and sync from the first client
		const client = disposableStore.add(new UserDataSyncClient(target));
		await client.setUp();
		let fileService = client.instantiationService.get(IFileService);
		let environmentService = client.instantiationService.get(IEnvironmentService);
		await fileService.writeFile(environmentService.settingsResource, VSBuffer.fromString(JSON.stringify({ 'editor.fontSize': 14 })));
		await client.instantiationService.get(IUserDataSyncService).sync();

		// Setup the test client
		const testClient = disposableStore.add(new UserDataSyncClient(target));
		await testClient.setUp();
		fileService = testClient.instantiationService.get(IFileService);
		environmentService = testClient.instantiationService.get(IEnvironmentService);
		await fileService.writeFile(environmentService.settingsResource, VSBuffer.fromString(JSON.stringify({ 'editor.fontSize': 16 })));
		const testObject = testClient.instantiationService.get(IUserDataSyncService);

		// sync from the client
		await testObject.sync();

		assert.deepEqual(testObject.status, SyncStatus.HasConflicts);
		assert.deepEqual(testObject.conflicts.map(({ syncResource }) => syncResource), [SyncResource.Settings]);
	});

	test('test sync will sync other non conflicted areas', async () => {
		const target = new UserDataSyncTestServer();

		// Setup and sync from the first client
		const client = disposableStore.add(new UserDataSyncClient(target));
		await client.setUp();
		let fileService = client.instantiationService.get(IFileService);
		let environmentService = client.instantiationService.get(IEnvironmentService);
		await fileService.writeFile(environmentService.settingsResource, VSBuffer.fromString(JSON.stringify({ 'editor.fontSize': 14 })));
		await client.instantiationService.get(IUserDataSyncService).sync();

		// Setup the test client and get conflicts in settings
		const testClient = disposableStore.add(new UserDataSyncClient(target));
		await testClient.setUp();
		let testFileService = testClient.instantiationService.get(IFileService);
		let testEnvironmentService = testClient.instantiationService.get(IEnvironmentService);
		await testFileService.writeFile(testEnvironmentService.settingsResource, VSBuffer.fromString(JSON.stringify({ 'editor.fontSize': 16 })));
		const testObject = testClient.instantiationService.get(IUserDataSyncService);
		await testObject.sync();

		// sync from the first client with changes in keybindings
		await fileService.writeFile(environmentService.keybindingsResource, VSBuffer.fromString(JSON.stringify([{ 'command': 'abcd', 'key': 'cmd+c' }])));
		await client.instantiationService.get(IUserDataSyncService).sync();

		// sync from the test client
		target.reset();
		const actualStatuses: SyncStatus[] = [];
		const disposable = testObject.onDidChangeStatus(status => actualStatuses.push(status));
		await testObject.sync();

		disposable.dispose();
		assert.deepEqual(actualStatuses, []);
		assert.deepEqual(testObject.status, SyncStatus.HasConflicts);

		assert.deepEqual(target.requests, [
			// Manifest
			{ type: 'GET', url: `${target.url}/v1/manifest`, headers: {} },
			// Keybindings
			{ type: 'GET', url: `${target.url}/v1/resource/keybindings/latest`, headers: { 'If-None-Match': '1' } },
		]);
	});

	test('test stop sync reset status', async () => {
		const target = new UserDataSyncTestServer();

		// Setup and sync from the first client
		const client = disposableStore.add(new UserDataSyncClient(target));
		await client.setUp();
		let fileService = client.instantiationService.get(IFileService);
		let environmentService = client.instantiationService.get(IEnvironmentService);
		await fileService.writeFile(environmentService.settingsResource, VSBuffer.fromString(JSON.stringify({ 'editor.fontSize': 14 })));
		await client.instantiationService.get(IUserDataSyncService).sync();

		// Setup the test client
		const testClient = disposableStore.add(new UserDataSyncClient(target));
		await testClient.setUp();
		fileService = testClient.instantiationService.get(IFileService);
		environmentService = testClient.instantiationService.get(IEnvironmentService);
		await fileService.writeFile(environmentService.settingsResource, VSBuffer.fromString(JSON.stringify({ 'editor.fontSize': 16 })));
		const testObject = testClient.instantiationService.get(IUserDataSyncService);
		await testObject.sync();

		// sync from the client
		await testObject.stop();

		assert.deepEqual(testObject.status, SyncStatus.Idle);
		assert.deepEqual(testObject.conflicts, []);
	});

});
