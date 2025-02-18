/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { IFileService } from '../../../../files/common/files.js';
import { assertDefined } from '../../../../../base/common/types.js';
import { dirname, joinPath } from '../../../../../base/common/resources.js';
import { IStringDictionary } from '../../../../../base/common/collections.js';
import { PromptsSynchronizer } from '../../../common/promptsSync/promptsSync.js';
import { IEnvironmentService } from '../../../../environment/common/environment.js';
import { UserDataSyncClient, UserDataSyncTestServer } from '../userDataSyncClient.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IUserDataProfile, IUserDataProfilesService } from '../../../../userDataProfile/common/userDataProfile.js';
import { IResourcePreview, ISyncData, IUserDataSyncStoreService, PREVIEW_DIR_NAME, SyncResource, SyncStatus } from '../../../common/userDataSync.js';

const PROMPT1_TEXT = `prompt 1 text`;

const PROMPT2_TEXT = `prompt 2 text`;

const PROMPT3_TEXT = `prompt 3 text`;

const PROMPT4_TEXT = `prompt 4 text`;

const PROMPT5_TEXT = `prompt 5 text`;

const PROMPT6_Text = `prompt 6 text`;

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

	test('when prompt is created after first sync', async () => {
		await testObject.sync(await testClient.getResourceManifest());
		await updatePrompt('prompt3.prompt.md', PROMPT3_TEXT, testClient);

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

		assert.deepStrictEqual(
			lastSyncUserData.syncData.content,
			JSON.stringify({ 'prompt3.prompt.md': PROMPT3_TEXT }),
		);
	});

	test('first time sync - outgoing to server (no prompts)', async () => {
		await updatePrompt('prompt3.prompt.md', PROMPT3_TEXT, testClient);
		await updatePrompt('prompt1.prompt.md', PROMPT1_TEXT, testClient);

		await testObject.sync(await testClient.getResourceManifest());
		assert.strictEqual(testObject.status, SyncStatus.Idle);
		assert.deepStrictEqual(testObject.conflicts.conflicts, []);

		const { content } = await testClient.read(testObject.resource);
		assertDefined(
			content,
			'Test object content must be defined.',
		);

		const actual = parsePrompts(content);
		assert.deepStrictEqual(
			actual,
			{
				'prompt3.prompt.md': PROMPT3_TEXT,
				'prompt1.prompt.md': PROMPT1_TEXT,
			});
	});

	test('first time sync - incoming from server (no prompts)', async () => {
		await updatePrompt('prompt3.prompt.md', PROMPT3_TEXT, client2);
		await updatePrompt('prompt1.prompt.md', PROMPT1_TEXT, client2);
		await client2.sync();

		await testObject.sync(await testClient.getResourceManifest());
		assert.strictEqual(testObject.status, SyncStatus.Idle);
		assert.deepStrictEqual(testObject.conflicts.conflicts, []);

		const actual1 = await readPrompt('prompt3.prompt.md', testClient);
		assert.strictEqual(actual1, PROMPT3_TEXT);
		const actual2 = await readPrompt('prompt1.prompt.md', testClient);
		assert.strictEqual(actual2, PROMPT1_TEXT);
	});

	test('first time sync when prompts exists', async () => {
		await updatePrompt('prompt3.prompt.md', PROMPT3_TEXT, client2);
		await client2.sync();

		await updatePrompt('prompt1.prompt.md', PROMPT1_TEXT, testClient);
		await testObject.sync(await testClient.getResourceManifest());
		assert.strictEqual(testObject.status, SyncStatus.Idle);
		assert.deepStrictEqual(testObject.conflicts.conflicts, []);

		const actual1 = await readPrompt('prompt3.prompt.md', testClient);
		assert.strictEqual(actual1, PROMPT3_TEXT);
		const actual2 = await readPrompt('prompt1.prompt.md', testClient);
		assert.strictEqual(actual2, PROMPT1_TEXT);

		const { content } = await testClient.read(testObject.resource);
		assertDefined(
			content,
			'Test object content must be defined.',
		);

		const actual = parsePrompts(content);
		assert.deepStrictEqual(
			actual,
			{
				'prompt3.prompt.md': PROMPT3_TEXT,
				'prompt1.prompt.md': PROMPT1_TEXT,
			});
	});

	test('first time sync when prompts exists - has conflicts', async () => {
		await updatePrompt('prompt3.prompt.md', PROMPT3_TEXT, client2);
		await client2.sync();

		await updatePrompt('prompt3.prompt.md', PROMPT4_TEXT, testClient);
		await testObject.sync(await testClient.getResourceManifest());

		assert.strictEqual(testObject.status, SyncStatus.HasConflicts);

		const environmentService = testClient.instantiationService.get(IEnvironmentService);
		const local = joinPath(
			environmentService.userDataSyncHome,
			testObject.resource, PREVIEW_DIR_NAME,
			'prompt3.prompt.md',
		);

		assertPreviews(testObject.conflicts.conflicts, [local]);
	});

	test('first time sync when prompts exists - has conflicts and accept conflicts', async () => {
		await updatePrompt('prompt3.prompt.md', PROMPT3_TEXT, client2);
		await client2.sync();

		await updatePrompt('prompt3.prompt.md', PROMPT4_TEXT, testClient);
		await testObject.sync(await testClient.getResourceManifest());
		const conflicts = testObject.conflicts.conflicts;
		await testObject.accept(conflicts[0].previewResource, PROMPT3_TEXT);
		await testObject.apply(false);

		assert.strictEqual(testObject.status, SyncStatus.Idle);
		assert.deepStrictEqual(testObject.conflicts.conflicts, []);

		const actual1 = await readPrompt('prompt3.prompt.md', testClient);
		assert.strictEqual(actual1, PROMPT3_TEXT);

		const { content } = await testClient.read(testObject.resource);
		assertDefined(
			content,
			'Test object content must be defined.',
		);

		const actual = parsePrompts(content);
		assert.deepStrictEqual(actual, { 'prompt3.prompt.md': PROMPT3_TEXT });
	});

	test('first time sync when prompts exists - has multiple conflicts', async () => {
		await updatePrompt('prompt3.prompt.md', PROMPT3_TEXT, client2);
		await updatePrompt('prompt1.prompt.md', PROMPT1_TEXT, client2);
		await client2.sync();

		await updatePrompt('prompt3.prompt.md', PROMPT4_TEXT, testClient);
		await updatePrompt('prompt1.prompt.md', PROMPT2_TEXT, testClient);
		await testObject.sync(await testClient.getResourceManifest());

		assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
		const environmentService = testClient.instantiationService.get(IEnvironmentService);
		const local1 = joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'prompt3.prompt.md');
		const local2 = joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'prompt1.prompt.md');
		assertPreviews(testObject.conflicts.conflicts, [local1, local2]);
	});

	test('first time sync when prompts exists - has multiple conflicts and accept one conflict', async () => {
		await updatePrompt('prompt3.prompt.md', PROMPT3_TEXT, client2);
		await updatePrompt('prompt1.prompt.md', PROMPT1_TEXT, client2);
		await client2.sync();

		await updatePrompt('prompt3.prompt.md', PROMPT4_TEXT, testClient);
		await updatePrompt('prompt1.prompt.md', PROMPT2_TEXT, testClient);
		await testObject.sync(await testClient.getResourceManifest());

		let conflicts = testObject.conflicts.conflicts;
		await testObject.accept(conflicts[0].previewResource, PROMPT4_TEXT);

		conflicts = testObject.conflicts.conflicts;
		assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
		const environmentService = testClient.instantiationService.get(IEnvironmentService);
		const local = joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'prompt1.prompt.md');
		assertPreviews(testObject.conflicts.conflicts, [local]);
	});

	test('first time sync when prompts exists - has multiple conflicts and accept all conflicts', async () => {
		await updatePrompt('prompt3.prompt.md', PROMPT3_TEXT, client2);
		await updatePrompt('prompt1.prompt.md', PROMPT1_TEXT, client2);
		await client2.sync();

		await updatePrompt('prompt3.prompt.md', PROMPT4_TEXT, testClient);
		await updatePrompt('prompt1.prompt.md', PROMPT2_TEXT, testClient);
		await testObject.sync(await testClient.getResourceManifest());

		const conflicts = testObject.conflicts.conflicts;
		await testObject.accept(conflicts[0].previewResource, PROMPT4_TEXT);
		await testObject.accept(conflicts[1].previewResource, PROMPT1_TEXT);
		await testObject.apply(false);

		assert.strictEqual(testObject.status, SyncStatus.Idle);
		assert.deepStrictEqual(testObject.conflicts.conflicts, []);

		const actual1 = await readPrompt('prompt3.prompt.md', testClient);
		assert.strictEqual(actual1, PROMPT4_TEXT);
		const actual2 = await readPrompt('prompt1.prompt.md', testClient);
		assert.strictEqual(actual2, PROMPT1_TEXT);

		const { content } = await testClient.read(testObject.resource);
		assertDefined(
			content,
			'Test object content must be defined.',
		);

		const actual = parsePrompts(content);
		assert.deepStrictEqual(actual, { 'prompt3.prompt.md': PROMPT4_TEXT, 'prompt1.prompt.md': PROMPT1_TEXT });
	});

	test('sync adding a prompts', async () => {
		await updatePrompt('prompt3.prompt.md', PROMPT3_TEXT, testClient);
		await testObject.sync(await testClient.getResourceManifest());

		await updatePrompt('prompt1.prompt.md', PROMPT1_TEXT, testClient);
		await testObject.sync(await testClient.getResourceManifest());
		assert.strictEqual(testObject.status, SyncStatus.Idle);
		assert.deepStrictEqual(testObject.conflicts.conflicts, []);

		const actual1 = await readPrompt('prompt3.prompt.md', testClient);
		assert.strictEqual(actual1, PROMPT3_TEXT);
		const actual2 = await readPrompt('prompt1.prompt.md', testClient);
		assert.strictEqual(actual2, PROMPT1_TEXT);

		const { content } = await testClient.read(testObject.resource);
		assert.ok(content !== null);
		const actual = parsePrompts(content);
		assert.deepStrictEqual(actual, { 'prompt3.prompt.md': PROMPT3_TEXT, 'prompt1.prompt.md': PROMPT1_TEXT });
	});

	test('sync adding a prompts - accept', async () => {
		await updatePrompt('prompt3.prompt.md', PROMPT3_TEXT, client2);
		await client2.sync();
		await testObject.sync(await testClient.getResourceManifest());

		await updatePrompt('prompt1.prompt.md', PROMPT1_TEXT, client2);
		await client2.sync();

		await testObject.sync(await testClient.getResourceManifest());
		assert.strictEqual(testObject.status, SyncStatus.Idle);
		assert.deepStrictEqual(testObject.conflicts.conflicts, []);

		const actual1 = await readPrompt('prompt3.prompt.md', testClient);
		assert.strictEqual(actual1, PROMPT3_TEXT);
		const actual2 = await readPrompt('prompt1.prompt.md', testClient);
		assert.strictEqual(actual2, PROMPT1_TEXT);
	});

	test('sync updating a prompts', async () => {
		await updatePrompt('default.prompt.md', PROMPT3_TEXT, testClient);
		await testObject.sync(await testClient.getResourceManifest());

		await updatePrompt('default.prompt.md', PROMPT4_TEXT, testClient);
		await testObject.sync(await testClient.getResourceManifest());
		assert.strictEqual(testObject.status, SyncStatus.Idle);
		assert.deepStrictEqual(testObject.conflicts.conflicts, []);

		const actual1 = await readPrompt('default.prompt.md', testClient);
		assert.strictEqual(actual1, PROMPT4_TEXT);

		const { content } = await testClient.read(testObject.resource);
		assert.ok(content !== null);
		const actual = parsePrompts(content);
		assert.deepStrictEqual(actual, { 'default.prompt.md': PROMPT4_TEXT });
	});

	test('sync updating a prompts - accept', async () => {
		await updatePrompt('my.prompt.md', PROMPT3_TEXT, client2);
		await client2.sync();
		await testObject.sync(await testClient.getResourceManifest());

		await updatePrompt('my.prompt.md', PROMPT4_TEXT, client2);
		await client2.sync();

		await testObject.sync(await testClient.getResourceManifest());
		assert.strictEqual(testObject.status, SyncStatus.Idle);
		assert.deepStrictEqual(testObject.conflicts.conflicts, []);

		const actual1 = await readPrompt('my.prompt.md', testClient);
		assert.strictEqual(actual1, PROMPT4_TEXT);
	});

	test('sync updating a prompts - conflict', async () => {
		await updatePrompt('some.prompt.md', PROMPT3_TEXT, client2);
		await client2.sync();
		await testObject.sync(await testClient.getResourceManifest());

		await updatePrompt('some.prompt.md', PROMPT4_TEXT, client2);
		await client2.sync();

		await updatePrompt('some.prompt.md', PROMPT5_TEXT, testClient);
		await testObject.sync(await testClient.getResourceManifest());
		assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
		const environmentService = testClient.instantiationService.get(IEnvironmentService);
		const local = joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'some.prompt.md');
		assertPreviews(testObject.conflicts.conflicts, [local]);
	});

	test('sync updating a prompts - resolve conflict', async () => {
		await updatePrompt('advanced.prompt.md', PROMPT3_TEXT, client2);
		await client2.sync();
		await testObject.sync(await testClient.getResourceManifest());

		await updatePrompt('advanced.prompt.md', PROMPT4_TEXT, client2);
		await client2.sync();

		await updatePrompt('advanced.prompt.md', PROMPT5_TEXT, testClient);
		await testObject.sync(await testClient.getResourceManifest());
		await testObject.accept(testObject.conflicts.conflicts[0].previewResource, PROMPT4_TEXT);
		await testObject.apply(false);

		assert.strictEqual(testObject.status, SyncStatus.Idle);
		assert.deepStrictEqual(testObject.conflicts.conflicts, []);

		const actual1 = await readPrompt('advanced.prompt.md', testClient);
		assert.strictEqual(actual1, PROMPT4_TEXT);

		const { content } = await testClient.read(testObject.resource);
		assert.ok(content !== null);
		const actual = parsePrompts(content);
		assert.deepStrictEqual(actual, { 'advanced.prompt.md': PROMPT4_TEXT });
	});

	test('sync removing a prompts', async () => {
		await updatePrompt('another.prompt.md', PROMPT3_TEXT, testClient);
		await updatePrompt('chat.prompt.md', PROMPT1_TEXT, testClient);
		await testObject.sync(await testClient.getResourceManifest());

		await removePrompt('another.prompt.md', testClient);
		await testObject.sync(await testClient.getResourceManifest());
		assert.strictEqual(testObject.status, SyncStatus.Idle);
		assert.deepStrictEqual(testObject.conflicts.conflicts, []);

		const actual1 = await readPrompt('chat.prompt.md', testClient);
		assert.strictEqual(actual1, PROMPT1_TEXT);
		const actual2 = await readPrompt('another.prompt.md', testClient);
		assert.strictEqual(actual2, null);

		const { content } = await testClient.read(testObject.resource);
		assertDefined(
			content,
			'Test object content must be defined.',
		);

		const actual = parsePrompts(content);
		assert.deepStrictEqual(actual, { 'chat.prompt.md': PROMPT1_TEXT });
	});

	function parsePrompts(content: string): IStringDictionary<string> {
		const syncData: ISyncData = JSON.parse(content);
		return JSON.parse(syncData.content);
	}

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

	async function removePrompt(name: string, client: UserDataSyncClient): Promise<void> {
		const fileService = client.instantiationService.get(IFileService);
		const userDataProfilesService = client.instantiationService.get(IUserDataProfilesService);
		const promptsResource = joinPath(userDataProfilesService.defaultProfile.promptsHome, name);
		await fileService.del(promptsResource);
	}

	async function readPrompt(name: string, client: UserDataSyncClient, profile?: IUserDataProfile): Promise<string | null> {
		const fileService = client.instantiationService.get(IFileService);
		const userDataProfilesService = client.instantiationService.get(IUserDataProfilesService);
		const promptsResource = joinPath((profile ?? userDataProfilesService.defaultProfile).promptsHome, name);
		if (await fileService.exists(promptsResource)) {
			const content = await fileService.readFile(promptsResource);
			return content.value.toString();
		}
		return null;
	}

	function assertPreviews(actual: IResourcePreview[], expected: URI[]) {
		assert.deepStrictEqual(
			actual.map(({ previewResource }) => previewResource.toString()),
			expected.map(uri => uri.toString()),
		);
	}
});
