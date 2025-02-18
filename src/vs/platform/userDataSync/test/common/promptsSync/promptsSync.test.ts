/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { IFileService } from '../../../../files/common/files.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { assertDefined } from '../../../../../base/common/types.js';
import { PromptsSynchronizer } from '../../../common/promptsSync/promptsSync.js';
import { UserDataSyncClient, UserDataSyncTestServer } from '../userDataSyncClient.js';
import { IUserDataSyncStoreService, SyncResource } from '../../../common/userDataSync.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IUserDataProfile, IUserDataProfilesService } from '../../../../userDataProfile/common/userDataProfile.js';

const prompt3 = `prompt 3 text`;

suite('PromptsSync', () => {
	const server = new UserDataSyncTestServer();
	let testClient: UserDataSyncClient;
	let client2: UserDataSyncClient;

	let testObject: PromptsSynchronizer;

	teardown(async () => {
		await testClient.instantiationService.get(IUserDataSyncStoreService).clear();
	});

	const disposableStore = ensureNoDisposablesAreLeakedInTestSuite();

	setup(async () => {
		testClient = disposableStore.add(new UserDataSyncClient(server));
		await testClient.setUp(true);

		const maybeSynchronizer = testClient.getSynchronizer(SyncResource.Prompts) as (PromptsSynchronizer | undefined);

		assertDefined(
			maybeSynchronizer,
			'Prompts synchronizer object must be defined.',
		);

		testObject = maybeSynchronizer;

		client2 = disposableStore.add(new UserDataSyncClient(server));
		await client2.setUp(true);
	});

	test('when prompts does not exist', async () => {
		const fileService = testClient.instantiationService.get(IFileService);
		const promptsResource = testClient.instantiationService.get(IUserDataProfilesService).defaultProfile.promptsHome;

		assert.deepStrictEqual(await testObject.getLastSyncUserData(), null);
		let manifest = await testClient.getResourceManifest();
		server.reset();
		await testObject.sync(manifest);

		assert.deepStrictEqual(server.requests, [
			{ type: 'GET', url: `${server.url}/v1/resource/${testObject.resource}/latest`, headers: {} },
		]);
		assert.ok(!(await fileService.exists(promptsResource)));

		const lastSyncUserData = await testObject.getLastSyncUserData();

		assertDefined(
			lastSyncUserData,
			'Last sync user data must be defined.',
		);

		const remoteUserData = await testObject.getRemoteUserData(null);
		assert.deepStrictEqual(lastSyncUserData.ref, remoteUserData.ref);
		assert.deepStrictEqual(lastSyncUserData.syncData, remoteUserData.syncData);
		assert.strictEqual(lastSyncUserData.syncData, null);

		manifest = await testClient.getResourceManifest();
		server.reset();
		await testObject.sync(manifest);
		assert.deepStrictEqual(server.requests, []);

		manifest = await testClient.getResourceManifest();
		server.reset();
		await testObject.sync(manifest);
		assert.deepStrictEqual(server.requests, []);
	});

	test('when snippet is created after first sync', async () => {
		await testObject.sync(await testClient.getResourceManifest());
		await updatePrompt('prompt3.prompt.md', prompt3, testClient);

		let lastSyncUserData = await testObject.getLastSyncUserData();
		const manifest = await testClient.getResourceManifest();
		server.reset();
		await testObject.sync(manifest);

		assert.deepStrictEqual(server.requests, [
			{ type: 'POST', url: `${server.url}/v1/resource/${testObject.resource}`, headers: { 'If-Match': lastSyncUserData?.ref } },
		]);

		lastSyncUserData = await testObject.getLastSyncUserData();

		assertDefined(
			lastSyncUserData,
			'Last sync user data must be defined.',
		);

		const remoteUserData = await testObject.getRemoteUserData(null);
		assert.deepStrictEqual(lastSyncUserData.ref, remoteUserData.ref);
		assert.deepStrictEqual(lastSyncUserData.syncData, remoteUserData.syncData);

		assertDefined(
			lastSyncUserData.syncData,
			'Last sync user sync data must be defined.',
		);

		assert.deepStrictEqual(lastSyncUserData.syncData.content, JSON.stringify({ 'prompt3.prompt.md': prompt3 }));
	});

	async function updatePrompt(
		name: string,
		content: string,
		client: UserDataSyncClient,
		profile?: IUserDataProfile,
	): Promise<void> {
		const fileService = client.instantiationService.get(IFileService);
		const userDataProfilesService = client.instantiationService.get(IUserDataProfilesService);
		const promptsResource = joinPath((profile ?? userDataProfilesService.defaultProfile).promptsHome, name);
		await fileService.writeFile(promptsResource, VSBuffer.fromString(content));
	}
});
