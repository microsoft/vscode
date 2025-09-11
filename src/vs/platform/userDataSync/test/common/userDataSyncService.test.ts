/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { dirname, joinPath } from '../../../../base/common/resources.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IEnvironmentService } from '../../../environment/common/environment.js';
import { IFileService } from '../../../files/common/files.js';
import { IUserDataProfilesService } from '../../../userDataProfile/common/userDataProfile.js';
import { IUserDataSyncEnablementService, IUserDataSyncService, SyncResource, SyncStatus } from '../../common/userDataSync.js';
import { UserDataSyncClient, UserDataSyncTestServer } from './userDataSyncClient.js';

suite('UserDataSyncService', () => {

	const disposableStore = ensureNoDisposablesAreLeakedInTestSuite();

	test('test first time sync ever', async () => {
		// Setup the client
		const target = new UserDataSyncTestServer();
		const client = disposableStore.add(new UserDataSyncClient(target));
		await client.setUp();
		const testObject = client.instantiationService.get(IUserDataSyncService);

		// Sync for first time
		await (await testObject.createSyncTask(null)).run();

		assert.deepStrictEqual(target.requests, [
			// Manifest
			{ type: 'GET', url: `${target.url}/v1/manifest`, headers: {} },
			// Settings
			{ type: 'POST', url: `${target.url}/v1/resource/settings`, headers: { 'If-Match': '0' } },
			// Keybindings
			{ type: 'POST', url: `${target.url}/v1/resource/keybindings`, headers: { 'If-Match': '0' } },
			// Snippets
			{ type: 'POST', url: `${target.url}/v1/resource/snippets`, headers: { 'If-Match': '0' } },
			// Tasks
			{ type: 'POST', url: `${target.url}/v1/resource/tasks`, headers: { 'If-Match': '0' } },
			// Global state
			{ type: 'POST', url: `${target.url}/v1/resource/globalState`, headers: { 'If-Match': '0' } },
			// Prompts
			{ type: 'POST', url: `${target.url}/v1/resource/prompts`, headers: { 'If-Match': '0' } },
		]);

	});

	test('test first time sync ever when a sync resource is disabled', async () => {
		// Setup the client
		const target = new UserDataSyncTestServer();
		const client = disposableStore.add(new UserDataSyncClient(target));
		await client.setUp();
		client.instantiationService.get(IUserDataSyncEnablementService).setResourceEnablement(SyncResource.Settings, false);
		const testObject = client.instantiationService.get(IUserDataSyncService);

		// Sync for first time
		await (await testObject.createSyncTask(null)).run();

		assert.deepStrictEqual(target.requests, [
			// Manifest
			{ type: 'GET', url: `${target.url}/v1/manifest`, headers: {} },
			// Keybindings
			{ type: 'POST', url: `${target.url}/v1/resource/keybindings`, headers: { 'If-Match': '0' } },
			// Snippets
			{ type: 'POST', url: `${target.url}/v1/resource/snippets`, headers: { 'If-Match': '0' } },
			// Snippets
			{ type: 'POST', url: `${target.url}/v1/resource/tasks`, headers: { 'If-Match': '0' } },
			// Global state
			{ type: 'POST', url: `${target.url}/v1/resource/globalState`, headers: { 'If-Match': '0' } },
			// Prompts
			{ type: 'POST', url: `${target.url}/v1/resource/prompts`, headers: { 'If-Match': '0' } },
		]);
	});

	test('test first time sync ever with no data', async () => {
		// Setup the client
		const target = new UserDataSyncTestServer();
		const client = disposableStore.add(new UserDataSyncClient(target));
		await client.setUp(true);
		const testObject = client.instantiationService.get(IUserDataSyncService);

		// Sync for first time
		await (await testObject.createSyncTask(null)).run();

		assert.deepStrictEqual(target.requests, [
			// Manifest
			{ type: 'GET', url: `${target.url}/v1/manifest`, headers: {} },
		]);
	});

	test('test first time sync from the client with no changes - merge', async () => {
		const target = new UserDataSyncTestServer();

		// Setup and sync from the first client
		const client = disposableStore.add(new UserDataSyncClient(target));
		await client.setUp();
		await (await client.instantiationService.get(IUserDataSyncService).createSyncTask(null)).run();

		// Setup the test client
		const testClient = disposableStore.add(new UserDataSyncClient(target));
		await testClient.setUp();
		const testObject = testClient.instantiationService.get(IUserDataSyncService);

		// Sync (merge) from the test client
		target.reset();
		await (await testObject.createSyncTask(null)).run();

		assert.deepStrictEqual(target.requests, [
			{ type: 'GET', url: `${target.url}/v1/manifest`, headers: {} },
			{ type: 'GET', url: `${target.url}/v1/resource/settings/latest`, headers: {} },
			{ type: 'GET', url: `${target.url}/v1/resource/keybindings/latest`, headers: {} },
			{ type: 'GET', url: `${target.url}/v1/resource/snippets/latest`, headers: {} },
			{ type: 'GET', url: `${target.url}/v1/resource/tasks/latest`, headers: {} },
			{ type: 'GET', url: `${target.url}/v1/resource/globalState/latest`, headers: {} },
			{ type: 'GET', url: `${target.url}/v1/resource/prompts/latest`, headers: {} },
		]);
	});

	test('test first time sync from the client with changes - merge', async () => {
		const target = new UserDataSyncTestServer();

		// Setup and sync from the first client
		const client = disposableStore.add(new UserDataSyncClient(target));
		await client.setUp();
		await (await client.instantiationService.get(IUserDataSyncService).createSyncTask(null)).run();

		// Setup the test client with changes
		const testClient = disposableStore.add(new UserDataSyncClient(target));
		await testClient.setUp();
		const fileService = testClient.instantiationService.get(IFileService);
		const environmentService = testClient.instantiationService.get(IEnvironmentService);
		const userDataProfilesService = testClient.instantiationService.get(IUserDataProfilesService);
		await fileService.writeFile(userDataProfilesService.defaultProfile.settingsResource, VSBuffer.fromString(JSON.stringify({ 'editor.fontSize': 14 })));
		await fileService.writeFile(userDataProfilesService.defaultProfile.keybindingsResource, VSBuffer.fromString(JSON.stringify([{ 'command': 'abcd', 'key': 'cmd+c' }])));
		await fileService.writeFile(environmentService.argvResource, VSBuffer.fromString(JSON.stringify({ 'locale': 'de' })));
		await fileService.writeFile(joinPath(userDataProfilesService.defaultProfile.snippetsHome, 'html.json'), VSBuffer.fromString(`{}`));
		await fileService.writeFile(joinPath(userDataProfilesService.defaultProfile.promptsHome, 'mine.prompt.md'), VSBuffer.fromString('text'));
		await fileService.writeFile(joinPath(dirname(userDataProfilesService.defaultProfile.settingsResource), 'tasks.json'), VSBuffer.fromString(JSON.stringify({})));
		const testObject = testClient.instantiationService.get(IUserDataSyncService);

		// Sync (merge) from the test client
		target.reset();
		await (await testObject.createSyncTask(null)).run();

		assert.deepStrictEqual(target.requests, [
			{ type: 'GET', url: `${target.url}/v1/manifest`, headers: {} },
			{ type: 'GET', url: `${target.url}/v1/resource/settings/latest`, headers: {} },
			{ type: 'POST', url: `${target.url}/v1/resource/settings`, headers: { 'If-Match': '1' } },
			{ type: 'GET', url: `${target.url}/v1/resource/keybindings/latest`, headers: {} },
			{ type: 'POST', url: `${target.url}/v1/resource/keybindings`, headers: { 'If-Match': '1' } },
			{ type: 'GET', url: `${target.url}/v1/resource/snippets/latest`, headers: {} },
			{ type: 'POST', url: `${target.url}/v1/resource/snippets`, headers: { 'If-Match': '1' } },
			{ type: 'GET', url: `${target.url}/v1/resource/tasks/latest`, headers: {} },
			{ type: 'GET', url: `${target.url}/v1/resource/globalState/latest`, headers: {} },
			{ type: 'GET', url: `${target.url}/v1/resource/prompts/latest`, headers: {} },
			{ type: 'POST', url: `${target.url}/v1/resource/prompts`, headers: { 'If-Match': '1' } },
		]);

	});

	test('test first time sync from the client with changes - merge with profile', async () => {
		const target = new UserDataSyncTestServer();

		// Setup and sync from the first client
		const client = disposableStore.add(new UserDataSyncClient(target));
		await client.setUp();
		await (await client.instantiationService.get(IUserDataSyncService).createSyncTask(null)).run();

		// Setup the test client with changes
		const testClient = disposableStore.add(new UserDataSyncClient(target));
		await testClient.setUp();
		const fileService = testClient.instantiationService.get(IFileService);
		const environmentService = testClient.instantiationService.get(IEnvironmentService);
		const userDataProfilesService = testClient.instantiationService.get(IUserDataProfilesService);
		await userDataProfilesService.createNamedProfile('1');
		await fileService.writeFile(userDataProfilesService.defaultProfile.settingsResource, VSBuffer.fromString(JSON.stringify({ 'editor.fontSize': 14 })));
		await fileService.writeFile(userDataProfilesService.defaultProfile.keybindingsResource, VSBuffer.fromString(JSON.stringify([{ 'command': 'abcd', 'key': 'cmd+c' }])));
		await fileService.writeFile(environmentService.argvResource, VSBuffer.fromString(JSON.stringify({ 'locale': 'de' })));
		await fileService.writeFile(joinPath(userDataProfilesService.defaultProfile.snippetsHome, 'html.json'), VSBuffer.fromString(`{}`));
		await fileService.writeFile(joinPath(userDataProfilesService.defaultProfile.promptsHome, 'my.prompt.md'), VSBuffer.fromString('some prompt text'));
		await fileService.writeFile(joinPath(dirname(userDataProfilesService.defaultProfile.settingsResource), 'tasks.json'), VSBuffer.fromString(JSON.stringify({})));
		const testObject = testClient.instantiationService.get(IUserDataSyncService);

		// Sync (merge) from the test client
		target.reset();
		await (await testObject.createSyncTask(null)).run();

		assert.deepStrictEqual(target.requests, [
			{ type: 'GET', url: `${target.url}/v1/manifest`, headers: {} },
			{ type: 'GET', url: `${target.url}/v1/resource/settings/latest`, headers: {} },
			{ type: 'POST', url: `${target.url}/v1/resource/settings`, headers: { 'If-Match': '1' } },
			{ type: 'GET', url: `${target.url}/v1/resource/keybindings/latest`, headers: {} },
			{ type: 'POST', url: `${target.url}/v1/resource/keybindings`, headers: { 'If-Match': '1' } },
			{ type: 'GET', url: `${target.url}/v1/resource/snippets/latest`, headers: {} },
			{ type: 'POST', url: `${target.url}/v1/resource/snippets`, headers: { 'If-Match': '1' } },
			{ type: 'GET', url: `${target.url}/v1/resource/tasks/latest`, headers: {} },
			{ type: 'GET', url: `${target.url}/v1/resource/globalState/latest`, headers: {} },
			{ type: 'GET', url: `${target.url}/v1/resource/prompts/latest`, headers: {} },
			{ type: 'POST', url: `${target.url}/v1/resource/prompts`, headers: { 'If-Match': '1' } },
			{ type: 'POST', url: `${target.url}/v1/collection`, headers: {} },
			{ type: 'POST', url: `${target.url}/v1/resource/profiles`, headers: { 'If-Match': '0' } },
		]);

	});

	test('test sync when there are no changes', async () => {
		const target = new UserDataSyncTestServer();

		// Setup and sync from the client
		const client = disposableStore.add(new UserDataSyncClient(target));
		await client.setUp();
		const testObject = client.instantiationService.get(IUserDataSyncService);
		await (await testObject.createSyncTask(null)).run();

		// sync from the client again
		target.reset();
		await (await testObject.createSyncTask(null)).run();

		assert.deepStrictEqual(target.requests, [
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
		await (await testObject.createSyncTask(null)).run();
		target.reset();

		// Do changes in the client
		const fileService = client.instantiationService.get(IFileService);
		const environmentService = client.instantiationService.get(IEnvironmentService);
		const userDataProfilesService = client.instantiationService.get(IUserDataProfilesService);
		await fileService.writeFile(userDataProfilesService.defaultProfile.settingsResource, VSBuffer.fromString(JSON.stringify({ 'editor.fontSize': 14 })));
		await fileService.writeFile(userDataProfilesService.defaultProfile.keybindingsResource, VSBuffer.fromString(JSON.stringify([{ 'command': 'abcd', 'key': 'cmd+c' }])));
		await fileService.writeFile(joinPath(userDataProfilesService.defaultProfile.snippetsHome, 'html.json'), VSBuffer.fromString(`{}`));
		await fileService.writeFile(joinPath(userDataProfilesService.defaultProfile.promptsHome, 'shared.prompt.md'), VSBuffer.fromString('prompt text'));
		await fileService.writeFile(environmentService.argvResource, VSBuffer.fromString(JSON.stringify({ 'locale': 'de' })));

		// Sync from the client
		await (await testObject.createSyncTask(null)).run();

		assert.deepStrictEqual(target.requests, [
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
			// Prompts
			{ type: 'POST', url: `${target.url}/v1/resource/prompts`, headers: { 'If-Match': '1' } },
		]);
	});

	test('test sync when there are local changes with profile', async () => {
		const target = new UserDataSyncTestServer();

		// Setup and sync from the client
		const client = disposableStore.add(new UserDataSyncClient(target));
		await client.setUp();
		const testObject = client.instantiationService.get(IUserDataSyncService);
		await (await testObject.createSyncTask(null)).run();
		target.reset();

		// Do changes in the client
		const fileService = client.instantiationService.get(IFileService);
		const environmentService = client.instantiationService.get(IEnvironmentService);
		const userDataProfilesService = client.instantiationService.get(IUserDataProfilesService);
		await userDataProfilesService.createNamedProfile('1');
		await fileService.writeFile(userDataProfilesService.defaultProfile.settingsResource, VSBuffer.fromString(JSON.stringify({ 'editor.fontSize': 14 })));
		await fileService.writeFile(userDataProfilesService.defaultProfile.keybindingsResource, VSBuffer.fromString(JSON.stringify([{ 'command': 'abcd', 'key': 'cmd+c' }])));
		await fileService.writeFile(joinPath(userDataProfilesService.defaultProfile.snippetsHome, 'html.json'), VSBuffer.fromString(`{}`));
		await fileService.writeFile(joinPath(userDataProfilesService.defaultProfile.promptsHome, 'default.prompt.md'), VSBuffer.fromString('some prompt file contents'));
		await fileService.writeFile(environmentService.argvResource, VSBuffer.fromString(JSON.stringify({ 'locale': 'de' })));

		// Sync from the client
		await (await testObject.createSyncTask(null)).run();

		assert.deepStrictEqual(target.requests, [
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
			// Prompts
			{ type: 'POST', url: `${target.url}/v1/resource/prompts`, headers: { 'If-Match': '1' } },
			// Profiles
			{ type: 'POST', url: `${target.url}/v1/collection`, headers: {} },
			{ type: 'POST', url: `${target.url}/v1/resource/profiles`, headers: { 'If-Match': '0' } },
		]);
	});

	test('test sync when there are local changes and sync resource is disabled', async () => {
		const target = new UserDataSyncTestServer();

		// Setup and sync from the client
		const client = disposableStore.add(new UserDataSyncClient(target));
		await client.setUp();
		const testObject = client.instantiationService.get(IUserDataSyncService);
		await (await testObject.createSyncTask(null)).run();
		target.reset();

		// Do changes in the client
		const fileService = client.instantiationService.get(IFileService);
		const environmentService = client.instantiationService.get(IEnvironmentService);
		const userDataProfilesService = client.instantiationService.get(IUserDataProfilesService);
		await fileService.writeFile(userDataProfilesService.defaultProfile.settingsResource, VSBuffer.fromString(JSON.stringify({ 'editor.fontSize': 14 })));
		await fileService.writeFile(userDataProfilesService.defaultProfile.keybindingsResource, VSBuffer.fromString(JSON.stringify([{ 'command': 'abcd', 'key': 'cmd+c' }])));
		await fileService.writeFile(joinPath(userDataProfilesService.defaultProfile.snippetsHome, 'html.json'), VSBuffer.fromString(`{}`));
		await fileService.writeFile(joinPath(userDataProfilesService.defaultProfile.promptsHome, '1.prompt.md'), VSBuffer.fromString('random prompt text'));
		await fileService.writeFile(environmentService.argvResource, VSBuffer.fromString(JSON.stringify({ 'locale': 'de' })));
		client.instantiationService.get(IUserDataSyncEnablementService).setResourceEnablement(SyncResource.Snippets, false);
		client.instantiationService.get(IUserDataSyncEnablementService).setResourceEnablement(SyncResource.Prompts, false);

		// Sync from the client
		await (await testObject.createSyncTask(null)).run();

		assert.deepStrictEqual(target.requests, [
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
		await (await client.instantiationService.get(IUserDataSyncService).createSyncTask(null)).run();

		// Sync from test client
		const testClient = disposableStore.add(new UserDataSyncClient(target));
		await testClient.setUp();
		const testObject = testClient.instantiationService.get(IUserDataSyncService);
		await (await testObject.createSyncTask(null)).run();

		// Do changes in first client and sync
		const fileService = client.instantiationService.get(IFileService);
		const environmentService = client.instantiationService.get(IEnvironmentService);
		const userDataProfilesService = client.instantiationService.get(IUserDataProfilesService);
		await fileService.writeFile(userDataProfilesService.defaultProfile.settingsResource, VSBuffer.fromString(JSON.stringify({ 'editor.fontSize': 14 })));
		await fileService.writeFile(userDataProfilesService.defaultProfile.keybindingsResource, VSBuffer.fromString(JSON.stringify([{ 'command': 'abcd', 'key': 'cmd+c' }])));
		await fileService.writeFile(joinPath(userDataProfilesService.defaultProfile.snippetsHome, 'html.json'), VSBuffer.fromString(`{ "a": "changed" }`));
		await fileService.writeFile(joinPath(userDataProfilesService.defaultProfile.promptsHome, 'unknown.prompt.md'), VSBuffer.fromString('prompt text'));
		await fileService.writeFile(environmentService.argvResource, VSBuffer.fromString(JSON.stringify({ 'locale': 'de' })));
		await (await client.instantiationService.get(IUserDataSyncService).createSyncTask(null)).run();

		// Sync from test client
		target.reset();
		await (await testObject.createSyncTask(null)).run();

		assert.deepStrictEqual(target.requests, [
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
			// Prompts
			{ type: 'GET', url: `${target.url}/v1/resource/prompts/latest`, headers: { 'If-None-Match': '1' } },
		]);

	});

	test('test sync when there are remote changes with profile', async () => {
		const target = new UserDataSyncTestServer();

		// Sync from first client
		const client = disposableStore.add(new UserDataSyncClient(target));
		await client.setUp();
		await (await client.instantiationService.get(IUserDataSyncService).createSyncTask(null)).run();

		// Sync from test client
		const testClient = disposableStore.add(new UserDataSyncClient(target));
		await testClient.setUp();
		const testObject = testClient.instantiationService.get(IUserDataSyncService);
		await (await testObject.createSyncTask(null)).run();

		// Do changes in first client and sync
		const fileService = client.instantiationService.get(IFileService);
		const environmentService = client.instantiationService.get(IEnvironmentService);
		const userDataProfilesService = client.instantiationService.get(IUserDataProfilesService);
		await userDataProfilesService.createNamedProfile('1');
		await fileService.writeFile(userDataProfilesService.defaultProfile.settingsResource, VSBuffer.fromString(JSON.stringify({ 'editor.fontSize': 14 })));
		await fileService.writeFile(userDataProfilesService.defaultProfile.keybindingsResource, VSBuffer.fromString(JSON.stringify([{ 'command': 'abcd', 'key': 'cmd+c' }])));
		await fileService.writeFile(joinPath(userDataProfilesService.defaultProfile.snippetsHome, 'html.json'), VSBuffer.fromString(`{ "a": "changed" }`));
		await fileService.writeFile(joinPath(userDataProfilesService.defaultProfile.promptsHome, 'global.prompt.md'), VSBuffer.fromString('some text goes here'));
		await fileService.writeFile(environmentService.argvResource, VSBuffer.fromString(JSON.stringify({ 'locale': 'de' })));
		await (await client.instantiationService.get(IUserDataSyncService).createSyncTask(null)).run();

		// Sync from test client
		target.reset();
		await (await testObject.createSyncTask(null)).run();

		assert.deepStrictEqual(target.requests, [
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
			// Prompts
			{ type: 'GET', url: `${target.url}/v1/resource/prompts/latest`, headers: { 'If-None-Match': '1' } },
			// Profiles
			{ type: 'GET', url: `${target.url}/v1/resource/profiles/latest`, headers: { 'If-None-Match': '0' } },
		]);

	});

	test('test delete', async () => {
		const target = new UserDataSyncTestServer();

		// Sync from the client
		const testClient = disposableStore.add(new UserDataSyncClient(target));
		await testClient.setUp();
		const testObject = testClient.instantiationService.get(IUserDataSyncService);
		await (await testObject.createSyncTask(null)).run();

		// Reset from the client
		target.reset();
		await testObject.reset();

		assert.deepStrictEqual(target.requests, [
			// Manifest
			{ type: 'DELETE', url: `${target.url}/v1/collection`, headers: {} },
			{ type: 'DELETE', url: `${target.url}/v1/resource`, headers: {} },
		]);

	});

	test('test delete and sync', async () => {
		const target = new UserDataSyncTestServer();

		// Sync from the client
		const testClient = disposableStore.add(new UserDataSyncClient(target));
		await testClient.setUp();
		const testObject = testClient.instantiationService.get(IUserDataSyncService);
		await (await testObject.createSyncTask(null)).run();

		// Reset from the client
		await testObject.reset();

		// Sync again
		target.reset();
		await (await testObject.createSyncTask(null)).run();

		assert.deepStrictEqual(target.requests, [
			// Manifest
			{ type: 'GET', url: `${target.url}/v1/manifest`, headers: {} },
			// Settings
			{ type: 'POST', url: `${target.url}/v1/resource/settings`, headers: { 'If-Match': '0' } },
			// Keybindings
			{ type: 'POST', url: `${target.url}/v1/resource/keybindings`, headers: { 'If-Match': '0' } },
			// Snippets
			{ type: 'POST', url: `${target.url}/v1/resource/snippets`, headers: { 'If-Match': '0' } },
			// Tasks
			{ type: 'POST', url: `${target.url}/v1/resource/tasks`, headers: { 'If-Match': '0' } },
			// Global state
			{ type: 'POST', url: `${target.url}/v1/resource/globalState`, headers: { 'If-Match': '0' } },
			// Prompts
			{ type: 'POST', url: `${target.url}/v1/resource/prompts`, headers: { 'If-Match': '0' } },
		]);

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
		await (await testObject.createSyncTask(null)).run();

		disposable.dispose();
		assert.deepStrictEqual(actualStatuses, [SyncStatus.Syncing, SyncStatus.Idle, SyncStatus.Syncing, SyncStatus.Idle, SyncStatus.Syncing, SyncStatus.Idle, SyncStatus.Syncing, SyncStatus.Idle, SyncStatus.Syncing, SyncStatus.Idle, SyncStatus.Syncing, SyncStatus.Idle, SyncStatus.Syncing, SyncStatus.Idle, SyncStatus.Syncing, SyncStatus.Idle, SyncStatus.Syncing, SyncStatus.Idle]);
	});

	test('test sync conflicts status', async () => {
		const target = new UserDataSyncTestServer();

		// Setup and sync from the first client
		const client = disposableStore.add(new UserDataSyncClient(target));
		await client.setUp();
		let fileService = client.instantiationService.get(IFileService);
		let userDataProfilesService = client.instantiationService.get(IUserDataProfilesService);
		await fileService.writeFile(userDataProfilesService.defaultProfile.settingsResource, VSBuffer.fromString(JSON.stringify({ 'editor.fontSize': 14 })));
		await (await client.instantiationService.get(IUserDataSyncService).createSyncTask(null)).run();

		// Setup the test client
		const testClient = disposableStore.add(new UserDataSyncClient(target));
		await testClient.setUp();
		fileService = testClient.instantiationService.get(IFileService);
		userDataProfilesService = testClient.instantiationService.get(IUserDataProfilesService);
		await fileService.writeFile(userDataProfilesService.defaultProfile.settingsResource, VSBuffer.fromString(JSON.stringify({ 'editor.fontSize': 16 })));
		const testObject = testClient.instantiationService.get(IUserDataSyncService);

		// sync from the client
		await (await testObject.createSyncTask(null)).run();

		assert.deepStrictEqual(testObject.status, SyncStatus.HasConflicts);
		assert.deepStrictEqual(testObject.conflicts.map(({ syncResource }) => syncResource), [SyncResource.Settings]);
	});

	test('test sync will sync other non conflicted areas', async () => {
		const target = new UserDataSyncTestServer();

		// Setup and sync from the first client
		const client = disposableStore.add(new UserDataSyncClient(target));
		await client.setUp();
		const fileService = client.instantiationService.get(IFileService);
		let userDataProfilesService = client.instantiationService.get(IUserDataProfilesService);
		await fileService.writeFile(userDataProfilesService.defaultProfile.settingsResource, VSBuffer.fromString(JSON.stringify({ 'editor.fontSize': 14 })));
		await (await client.instantiationService.get(IUserDataSyncService).createSyncTask(null)).run();

		// Setup the test client and get conflicts in settings
		const testClient = disposableStore.add(new UserDataSyncClient(target));
		await testClient.setUp();
		const testFileService = testClient.instantiationService.get(IFileService);
		userDataProfilesService = testClient.instantiationService.get(IUserDataProfilesService);
		await testFileService.writeFile(userDataProfilesService.defaultProfile.settingsResource, VSBuffer.fromString(JSON.stringify({ 'editor.fontSize': 16 })));
		const testObject = testClient.instantiationService.get(IUserDataSyncService);
		await (await testObject.createSyncTask(null)).run();

		// sync from the first client with changes in keybindings
		await fileService.writeFile(userDataProfilesService.defaultProfile.keybindingsResource, VSBuffer.fromString(JSON.stringify([{ 'command': 'abcd', 'key': 'cmd+c' }])));
		await (await client.instantiationService.get(IUserDataSyncService).createSyncTask(null)).run();

		// sync from the test client
		target.reset();
		const actualStatuses: SyncStatus[] = [];
		const disposable = testObject.onDidChangeStatus(status => actualStatuses.push(status));
		await (await testObject.createSyncTask(null)).run();

		disposable.dispose();
		assert.deepStrictEqual(actualStatuses, []);
		assert.deepStrictEqual(testObject.status, SyncStatus.HasConflicts);

		assert.deepStrictEqual(target.requests, [
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
		let userDataProfilesService = client.instantiationService.get(IUserDataProfilesService);
		await fileService.writeFile(userDataProfilesService.defaultProfile.settingsResource, VSBuffer.fromString(JSON.stringify({ 'editor.fontSize': 14 })));
		await (await client.instantiationService.get(IUserDataSyncService).createSyncTask(null)).run();

		// Setup the test client
		const testClient = disposableStore.add(new UserDataSyncClient(target));
		await testClient.setUp();
		fileService = testClient.instantiationService.get(IFileService);
		userDataProfilesService = testClient.instantiationService.get(IUserDataProfilesService);
		await fileService.writeFile(userDataProfilesService.defaultProfile.settingsResource, VSBuffer.fromString(JSON.stringify({ 'editor.fontSize': 16 })));
		const testObject = testClient.instantiationService.get(IUserDataSyncService);


		const syncTask = (await testObject.createSyncTask(null));
		syncTask.run().then(null, () => null /* ignore error */);
		await syncTask.stop();

		assert.deepStrictEqual(testObject.status, SyncStatus.Idle);
		assert.deepStrictEqual(testObject.conflicts, []);
	});

	test('test sync send execution id header', async () => {
		// Setup the client
		const target = new UserDataSyncTestServer();
		const client = disposableStore.add(new UserDataSyncClient(target));
		await client.setUp();
		const testObject = client.instantiationService.get(IUserDataSyncService);

		await (await testObject.createSyncTask(null)).run();

		for (const request of target.requestsWithAllHeaders) {
			const hasExecutionIdHeader = request.headers && request.headers['X-Execution-Id'] && request.headers['X-Execution-Id'].length > 0;
			assert.ok(hasExecutionIdHeader, `Should have execution header: ${request.url}`);
		}

	});

	test('test can run sync taks only once', async () => {
		// Setup the client
		const target = new UserDataSyncTestServer();
		const client = disposableStore.add(new UserDataSyncClient(target));
		await client.setUp();
		const testObject = client.instantiationService.get(IUserDataSyncService);

		const syncTask = await testObject.createSyncTask(null);
		await syncTask.run();

		try {
			await syncTask.run();
			assert.fail('Should fail running the task again');
		} catch (error) {
			/* expected */
		}
	});

	test('test sync when there are local profile that uses default profile', async () => {
		const target = new UserDataSyncTestServer();

		// Setup and sync from the client
		const client = disposableStore.add(new UserDataSyncClient(target));
		await client.setUp();
		const testObject = client.instantiationService.get(IUserDataSyncService);
		await (await testObject.createSyncTask(null)).run();
		target.reset();

		// Do changes in the client
		const fileService = client.instantiationService.get(IFileService);
		const environmentService = client.instantiationService.get(IEnvironmentService);
		const userDataProfilesService = client.instantiationService.get(IUserDataProfilesService);
		await userDataProfilesService.createNamedProfile('1', { useDefaultFlags: { settings: true } });
		await fileService.writeFile(userDataProfilesService.defaultProfile.settingsResource, VSBuffer.fromString(JSON.stringify({ 'editor.fontSize': 14 })));
		await fileService.writeFile(userDataProfilesService.defaultProfile.keybindingsResource, VSBuffer.fromString(JSON.stringify([{ 'command': 'abcd', 'key': 'cmd+c' }])));
		await fileService.writeFile(joinPath(userDataProfilesService.defaultProfile.snippetsHome, 'html.json'), VSBuffer.fromString(`{}`));
		await fileService.writeFile(joinPath(userDataProfilesService.defaultProfile.promptsHome, '2.prompt.md'), VSBuffer.fromString('file contents'));
		await fileService.writeFile(environmentService.argvResource, VSBuffer.fromString(JSON.stringify({ 'locale': 'de' })));

		// Sync from the client
		await (await testObject.createSyncTask(null)).run();

		assert.deepStrictEqual(target.requests, [
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
			// Prompts
			{ type: 'POST', url: `${target.url}/v1/resource/prompts`, headers: { 'If-Match': '1' } },
			// Profiles
			{ type: 'POST', url: `${target.url}/v1/collection`, headers: {} },
			{ type: 'POST', url: `${target.url}/v1/resource/profiles`, headers: { 'If-Match': '0' } },
		]);
	});

	test('test sync when there is a remote profile that uses default profile', async () => {
		const target = new UserDataSyncTestServer();

		// Sync from first client
		const client = disposableStore.add(new UserDataSyncClient(target));
		await client.setUp();
		await (await client.instantiationService.get(IUserDataSyncService).createSyncTask(null)).run();

		// Sync from test client
		const testClient = disposableStore.add(new UserDataSyncClient(target));
		await testClient.setUp();
		const testObject = testClient.instantiationService.get(IUserDataSyncService);
		await (await testObject.createSyncTask(null)).run();

		// Do changes in first client and sync
		const fileService = client.instantiationService.get(IFileService);
		const environmentService = client.instantiationService.get(IEnvironmentService);
		const userDataProfilesService = client.instantiationService.get(IUserDataProfilesService);
		await userDataProfilesService.createNamedProfile('1', { useDefaultFlags: { keybindings: true } });
		await fileService.writeFile(userDataProfilesService.defaultProfile.settingsResource, VSBuffer.fromString(JSON.stringify({ 'editor.fontSize': 14 })));
		await fileService.writeFile(userDataProfilesService.defaultProfile.keybindingsResource, VSBuffer.fromString(JSON.stringify([{ 'command': 'abcd', 'key': 'cmd+c' }])));
		await fileService.writeFile(joinPath(userDataProfilesService.defaultProfile.snippetsHome, 'html.json'), VSBuffer.fromString(`{ "a": "changed" }`));
		await fileService.writeFile(joinPath(userDataProfilesService.defaultProfile.promptsHome, 'best.prompt.md'), VSBuffer.fromString('prompt prompt'));
		await fileService.writeFile(environmentService.argvResource, VSBuffer.fromString(JSON.stringify({ 'locale': 'de' })));
		await (await client.instantiationService.get(IUserDataSyncService).createSyncTask(null)).run();

		// Sync from test client
		target.reset();
		await (await testObject.createSyncTask(null)).run();

		assert.deepStrictEqual(target.requests, [
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
			// Prompts
			{ type: 'GET', url: `${target.url}/v1/resource/prompts/latest`, headers: { 'If-None-Match': '1' } },
			// Profiles
			{ type: 'GET', url: `${target.url}/v1/resource/profiles/latest`, headers: { 'If-None-Match': '0' } },
		]);

	});
});
