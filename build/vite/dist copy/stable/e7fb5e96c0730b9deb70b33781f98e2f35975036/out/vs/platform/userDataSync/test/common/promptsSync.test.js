/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { IFileService } from '../../../files/common/files.js';
import { assertDefined } from '../../../../base/common/types.js';
import { dirname, joinPath } from '../../../../base/common/resources.js';
import { IEnvironmentService } from '../../../environment/common/environment.js';
import { UserDataSyncClient, UserDataSyncTestServer } from './userDataSyncClient.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IUserDataProfilesService } from '../../../userDataProfile/common/userDataProfile.js';
import { IUserDataSyncStoreService, PREVIEW_DIR_NAME } from '../../common/userDataSync.js';
const PROMPT1_TEXT = 'Write a poem about a programmer who falls in love with their code.';
const PROMPT2_TEXT = 'Explain quantum physics using only emojis and cat memes.';
const PROMPT3_TEXT = 'Create a dialogue between a toaster and a refrigerator about their daily routines.';
const PROMPT4_TEXT = 'Describe a day in the life of a rubber duck debugging session.';
const PROMPT5_TEXT = 'Write a short story where a bug in the code becomes a superhero.';
const PROMPT6_TEXT = 'Imagine a world where all software bugs are sentient.\nWhat do they talk about?';
suite('PromptsSync', () => {
    const server = new UserDataSyncTestServer();
    let testClient;
    let client2;
    let testObject;
    teardown(async () => {
        await testClient.instantiationService.get(IUserDataSyncStoreService).clear();
    });
    const disposableStore = ensureNoDisposablesAreLeakedInTestSuite();
    setup(async () => {
        testClient = disposableStore.add(new UserDataSyncClient(server));
        await testClient.setUp(true);
        const maybeSynchronizer = testClient.getSynchronizer("prompts" /* SyncResource.Prompts */);
        assertDefined(maybeSynchronizer, 'Prompts synchronizer object must be defined.');
        testObject = maybeSynchronizer;
        client2 = disposableStore.add(new UserDataSyncClient(server));
        await client2.setUp(true);
    });
    test('when prompts does not exist', async () => {
        const fileService = testClient.instantiationService.get(IFileService);
        const promptsResource = testClient.instantiationService.get(IUserDataProfilesService).defaultProfile.promptsHome;
        assert.deepStrictEqual(await testObject.getLastSyncUserData(), null);
        let manifest = await testClient.getLatestRef("prompts" /* SyncResource.Prompts */);
        server.reset();
        await testObject.sync(manifest);
        assert.deepStrictEqual(server.requests, []);
        assert.ok(!(await fileService.exists(promptsResource)));
        const lastSyncUserData = await testObject.getLastSyncUserData();
        assertDefined(lastSyncUserData, 'Last sync user data must be defined.');
        const remoteUserData = await testObject.getRemoteUserData(null);
        assert.deepStrictEqual(lastSyncUserData.ref, remoteUserData.ref);
        assert.deepStrictEqual(lastSyncUserData.syncData, remoteUserData.syncData);
        assert.strictEqual(lastSyncUserData.syncData, null);
        manifest = await testClient.getLatestRef("prompts" /* SyncResource.Prompts */);
        server.reset();
        await testObject.sync(manifest);
        assert.deepStrictEqual(server.requests, []);
        manifest = await testClient.getLatestRef("prompts" /* SyncResource.Prompts */);
        server.reset();
        await testObject.sync(manifest);
        assert.deepStrictEqual(server.requests, []);
    });
    test('when prompt is created after first sync', async () => {
        await testObject.sync(await testClient.getLatestRef("prompts" /* SyncResource.Prompts */));
        await updatePrompt('prompt3.prompt.md', PROMPT3_TEXT, testClient);
        let lastSyncUserData = await testObject.getLastSyncUserData();
        const manifest = await testClient.getLatestRef("prompts" /* SyncResource.Prompts */);
        server.reset();
        await testObject.sync(manifest);
        assert.deepStrictEqual(server.requests, [
            { type: 'POST', url: `${server.url}/v1/resource/${testObject.resource}`, headers: { 'If-Match': lastSyncUserData?.ref } },
        ]);
        lastSyncUserData = await testObject.getLastSyncUserData();
        assertDefined(lastSyncUserData, 'Last sync user data must be defined.');
        const remoteUserData = await testObject.getRemoteUserData(null);
        assert.deepStrictEqual(lastSyncUserData.ref, remoteUserData.ref);
        assert.deepStrictEqual(lastSyncUserData.syncData, remoteUserData.syncData);
        assertDefined(lastSyncUserData.syncData, 'Last sync user sync data must be defined.');
        assert.deepStrictEqual(lastSyncUserData.syncData.content, JSON.stringify({ 'prompt3.prompt.md': PROMPT3_TEXT }));
    });
    test('first time sync - outgoing to server (no prompts)', async () => {
        await updatePrompt('prompt3.prompt.md', PROMPT3_TEXT, testClient);
        await updatePrompt('prompt1.prompt.md', PROMPT1_TEXT, testClient);
        await testObject.sync(await testClient.getLatestRef("prompts" /* SyncResource.Prompts */));
        assert.strictEqual(testObject.status, "idle" /* SyncStatus.Idle */);
        assert.deepStrictEqual(testObject.conflicts.conflicts, []);
        const { content } = await testClient.read(testObject.resource);
        assertDefined(content, 'Test object content must be defined.');
        const actual = parsePrompts(content);
        assert.deepStrictEqual(actual, {
            'prompt3.prompt.md': PROMPT3_TEXT,
            'prompt1.prompt.md': PROMPT1_TEXT,
        });
    });
    test('first time sync - incoming from server (no prompts)', async () => {
        await updatePrompt('prompt3.prompt.md', PROMPT3_TEXT, client2);
        await updatePrompt('prompt1.prompt.md', PROMPT1_TEXT, client2);
        await client2.sync();
        await testObject.sync(await testClient.getLatestRef("prompts" /* SyncResource.Prompts */));
        assert.strictEqual(testObject.status, "idle" /* SyncStatus.Idle */);
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
        await testObject.sync(await testClient.getLatestRef("prompts" /* SyncResource.Prompts */));
        assert.strictEqual(testObject.status, "idle" /* SyncStatus.Idle */);
        assert.deepStrictEqual(testObject.conflicts.conflicts, []);
        const actual1 = await readPrompt('prompt3.prompt.md', testClient);
        assert.strictEqual(actual1, PROMPT3_TEXT);
        const actual2 = await readPrompt('prompt1.prompt.md', testClient);
        assert.strictEqual(actual2, PROMPT1_TEXT);
        const { content } = await testClient.read(testObject.resource);
        assertDefined(content, 'Test object content must be defined.');
        const actual = parsePrompts(content);
        assert.deepStrictEqual(actual, {
            'prompt3.prompt.md': PROMPT3_TEXT,
            'prompt1.prompt.md': PROMPT1_TEXT,
        });
    });
    test('first time sync when prompts exists - has conflicts', async () => {
        await updatePrompt('prompt3.prompt.md', PROMPT3_TEXT, client2);
        await client2.sync();
        await updatePrompt('prompt3.prompt.md', PROMPT4_TEXT, testClient);
        await testObject.sync(await testClient.getLatestRef("prompts" /* SyncResource.Prompts */));
        assert.strictEqual(testObject.status, "hasConflicts" /* SyncStatus.HasConflicts */);
        const environmentService = testClient.instantiationService.get(IEnvironmentService);
        const local = joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'prompt3.prompt.md');
        assertPreviews(testObject.conflicts.conflicts, [local]);
    });
    test('first time sync when prompts exists - has conflicts and accept conflicts', async () => {
        await updatePrompt('prompt3.prompt.md', PROMPT3_TEXT, client2);
        await client2.sync();
        await updatePrompt('prompt3.prompt.md', PROMPT4_TEXT, testClient);
        await testObject.sync(await testClient.getLatestRef("prompts" /* SyncResource.Prompts */));
        const conflicts = testObject.conflicts.conflicts;
        await testObject.accept(conflicts[0].previewResource, PROMPT3_TEXT);
        await testObject.apply(false);
        assert.strictEqual(testObject.status, "idle" /* SyncStatus.Idle */);
        assert.deepStrictEqual(testObject.conflicts.conflicts, []);
        const actual1 = await readPrompt('prompt3.prompt.md', testClient);
        assert.strictEqual(actual1, PROMPT3_TEXT);
        const { content } = await testClient.read(testObject.resource);
        assertDefined(content, 'Test object content must be defined.');
        const actual = parsePrompts(content);
        assert.deepStrictEqual(actual, { 'prompt3.prompt.md': PROMPT3_TEXT });
    });
    test('first time sync when prompts exists - has multiple conflicts', async () => {
        await updatePrompt('prompt3.prompt.md', PROMPT3_TEXT, client2);
        await updatePrompt('prompt1.prompt.md', PROMPT1_TEXT, client2);
        await client2.sync();
        await updatePrompt('prompt3.prompt.md', PROMPT4_TEXT, testClient);
        await updatePrompt('prompt1.prompt.md', PROMPT2_TEXT, testClient);
        await testObject.sync(await testClient.getLatestRef("prompts" /* SyncResource.Prompts */));
        assert.strictEqual(testObject.status, "hasConflicts" /* SyncStatus.HasConflicts */);
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
        await testObject.sync(await testClient.getLatestRef("prompts" /* SyncResource.Prompts */));
        let conflicts = testObject.conflicts.conflicts;
        await testObject.accept(conflicts[0].previewResource, PROMPT4_TEXT);
        conflicts = testObject.conflicts.conflicts;
        assert.strictEqual(testObject.status, "hasConflicts" /* SyncStatus.HasConflicts */);
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
        await testObject.sync(await testClient.getLatestRef("prompts" /* SyncResource.Prompts */));
        const conflicts = testObject.conflicts.conflicts;
        await testObject.accept(conflicts[0].previewResource, PROMPT4_TEXT);
        await testObject.accept(conflicts[1].previewResource, PROMPT1_TEXT);
        await testObject.apply(false);
        assert.strictEqual(testObject.status, "idle" /* SyncStatus.Idle */);
        assert.deepStrictEqual(testObject.conflicts.conflicts, []);
        const actual1 = await readPrompt('prompt3.prompt.md', testClient);
        assert.strictEqual(actual1, PROMPT4_TEXT);
        const actual2 = await readPrompt('prompt1.prompt.md', testClient);
        assert.strictEqual(actual2, PROMPT1_TEXT);
        const { content } = await testClient.read(testObject.resource);
        assertDefined(content, 'Test object content must be defined.');
        const actual = parsePrompts(content);
        assert.deepStrictEqual(actual, { 'prompt3.prompt.md': PROMPT4_TEXT, 'prompt1.prompt.md': PROMPT1_TEXT });
    });
    test('sync adding a prompt', async () => {
        await updatePrompt('prompt3.prompt.md', PROMPT3_TEXT, testClient);
        await testObject.sync(await testClient.getLatestRef("prompts" /* SyncResource.Prompts */));
        await updatePrompt('prompt1.prompt.md', PROMPT1_TEXT, testClient);
        await testObject.sync(await testClient.getLatestRef("prompts" /* SyncResource.Prompts */));
        assert.strictEqual(testObject.status, "idle" /* SyncStatus.Idle */);
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
    test('sync adding a prompt - accept', async () => {
        await updatePrompt('prompt3.prompt.md', PROMPT3_TEXT, client2);
        await client2.sync();
        await testObject.sync(await testClient.getLatestRef("prompts" /* SyncResource.Prompts */));
        await updatePrompt('prompt1.prompt.md', PROMPT1_TEXT, client2);
        await client2.sync();
        await testObject.sync(await testClient.getLatestRef("prompts" /* SyncResource.Prompts */));
        assert.strictEqual(testObject.status, "idle" /* SyncStatus.Idle */);
        assert.deepStrictEqual(testObject.conflicts.conflicts, []);
        const actual1 = await readPrompt('prompt3.prompt.md', testClient);
        assert.strictEqual(actual1, PROMPT3_TEXT);
        const actual2 = await readPrompt('prompt1.prompt.md', testClient);
        assert.strictEqual(actual2, PROMPT1_TEXT);
    });
    test('sync updating a prompt', async () => {
        await updatePrompt('default.prompt.md', PROMPT3_TEXT, testClient);
        await testObject.sync(await testClient.getLatestRef("prompts" /* SyncResource.Prompts */));
        await updatePrompt('default.prompt.md', PROMPT4_TEXT, testClient);
        await testObject.sync(await testClient.getLatestRef("prompts" /* SyncResource.Prompts */));
        assert.strictEqual(testObject.status, "idle" /* SyncStatus.Idle */);
        assert.deepStrictEqual(testObject.conflicts.conflicts, []);
        const actual1 = await readPrompt('default.prompt.md', testClient);
        assert.strictEqual(actual1, PROMPT4_TEXT);
        const { content } = await testClient.read(testObject.resource);
        assert.ok(content !== null);
        const actual = parsePrompts(content);
        assert.deepStrictEqual(actual, { 'default.prompt.md': PROMPT4_TEXT });
    });
    test('sync updating a prompt - accept', async () => {
        await updatePrompt('my.prompt.md', PROMPT3_TEXT, client2);
        await client2.sync();
        await testObject.sync(await testClient.getLatestRef("prompts" /* SyncResource.Prompts */));
        await updatePrompt('my.prompt.md', PROMPT4_TEXT, client2);
        await client2.sync();
        await testObject.sync(await testClient.getLatestRef("prompts" /* SyncResource.Prompts */));
        assert.strictEqual(testObject.status, "idle" /* SyncStatus.Idle */);
        assert.deepStrictEqual(testObject.conflicts.conflicts, []);
        const actual1 = await readPrompt('my.prompt.md', testClient);
        assert.strictEqual(actual1, PROMPT4_TEXT);
    });
    test('sync updating a prompt - conflict', async () => {
        await updatePrompt('some.prompt.md', PROMPT3_TEXT, client2);
        await client2.sync();
        await testObject.sync(await testClient.getLatestRef("prompts" /* SyncResource.Prompts */));
        await updatePrompt('some.prompt.md', PROMPT4_TEXT, client2);
        await client2.sync();
        await updatePrompt('some.prompt.md', PROMPT5_TEXT, testClient);
        await testObject.sync(await testClient.getLatestRef("prompts" /* SyncResource.Prompts */));
        assert.strictEqual(testObject.status, "hasConflicts" /* SyncStatus.HasConflicts */);
        const environmentService = testClient.instantiationService.get(IEnvironmentService);
        const local = joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'some.prompt.md');
        assertPreviews(testObject.conflicts.conflicts, [local]);
    });
    test('sync updating a prompt - resolve conflict', async () => {
        await updatePrompt('advanced.prompt.md', PROMPT3_TEXT, client2);
        await client2.sync();
        await testObject.sync(await testClient.getLatestRef("prompts" /* SyncResource.Prompts */));
        await updatePrompt('advanced.prompt.md', PROMPT4_TEXT, client2);
        await client2.sync();
        await updatePrompt('advanced.prompt.md', PROMPT5_TEXT, testClient);
        await testObject.sync(await testClient.getLatestRef("prompts" /* SyncResource.Prompts */));
        await testObject.accept(testObject.conflicts.conflicts[0].previewResource, PROMPT4_TEXT);
        await testObject.apply(false);
        assert.strictEqual(testObject.status, "idle" /* SyncStatus.Idle */);
        assert.deepStrictEqual(testObject.conflicts.conflicts, []);
        const actual1 = await readPrompt('advanced.prompt.md', testClient);
        assert.strictEqual(actual1, PROMPT4_TEXT);
        const { content } = await testClient.read(testObject.resource);
        assert.ok(content !== null);
        const actual = parsePrompts(content);
        assert.deepStrictEqual(actual, { 'advanced.prompt.md': PROMPT4_TEXT });
    });
    test('sync removing a prompt', async () => {
        await updatePrompt('another.prompt.md', PROMPT3_TEXT, testClient);
        await updatePrompt('chat.prompt.md', PROMPT1_TEXT, testClient);
        await testObject.sync(await testClient.getLatestRef("prompts" /* SyncResource.Prompts */));
        await removePrompt('another.prompt.md', testClient);
        await testObject.sync(await testClient.getLatestRef("prompts" /* SyncResource.Prompts */));
        assert.strictEqual(testObject.status, "idle" /* SyncStatus.Idle */);
        assert.deepStrictEqual(testObject.conflicts.conflicts, []);
        const actual1 = await readPrompt('chat.prompt.md', testClient);
        assert.strictEqual(actual1, PROMPT1_TEXT);
        const actual2 = await readPrompt('another.prompt.md', testClient);
        assert.strictEqual(actual2, null);
        const { content } = await testClient.read(testObject.resource);
        assertDefined(content, 'Test object content must be defined.');
        const actual = parsePrompts(content);
        assert.deepStrictEqual(actual, { 'chat.prompt.md': PROMPT1_TEXT });
    });
    test('sync removing a prompt - accept', async () => {
        await updatePrompt('my-query.prompt.md', PROMPT3_TEXT, client2);
        await updatePrompt('summarize.prompt.md', PROMPT1_TEXT, client2);
        await client2.sync();
        await testObject.sync(await testClient.getLatestRef("prompts" /* SyncResource.Prompts */));
        await removePrompt('my-query.prompt.md', client2);
        await client2.sync();
        await testObject.sync(await testClient.getLatestRef("prompts" /* SyncResource.Prompts */));
        assert.strictEqual(testObject.status, "idle" /* SyncStatus.Idle */);
        assert.deepStrictEqual(testObject.conflicts.conflicts, []);
        const actual1 = await readPrompt('summarize.prompt.md', testClient);
        assert.strictEqual(actual1, PROMPT1_TEXT);
        const actual2 = await readPrompt('my-query.prompt.md', testClient);
        assert.strictEqual(actual2, null);
    });
    test('sync removing a prompt locally and updating it remotely', async () => {
        await updatePrompt('some.prompt.md', PROMPT3_TEXT, client2);
        await updatePrompt('important.prompt.md', PROMPT1_TEXT, client2);
        await client2.sync();
        await testObject.sync(await testClient.getLatestRef("prompts" /* SyncResource.Prompts */));
        await updatePrompt('some.prompt.md', PROMPT4_TEXT, client2);
        await client2.sync();
        await removePrompt('some.prompt.md', testClient);
        await testObject.sync(await testClient.getLatestRef("prompts" /* SyncResource.Prompts */));
        assert.strictEqual(testObject.status, "idle" /* SyncStatus.Idle */);
        assert.deepStrictEqual(testObject.conflicts.conflicts, []);
        const actual1 = await readPrompt('important.prompt.md', testClient);
        assert.strictEqual(actual1, PROMPT1_TEXT);
        const actual2 = await readPrompt('some.prompt.md', testClient);
        assert.strictEqual(actual2, PROMPT4_TEXT);
    });
    test('sync removing a prompt - conflict', async () => {
        await updatePrompt('common.prompt.md', PROMPT3_TEXT, client2);
        await updatePrompt('rare.prompt.md', PROMPT1_TEXT, client2);
        await client2.sync();
        await testObject.sync(await testClient.getLatestRef("prompts" /* SyncResource.Prompts */));
        await removePrompt('common.prompt.md', client2);
        await client2.sync();
        await updatePrompt('common.prompt.md', PROMPT4_TEXT, testClient);
        await testObject.sync(await testClient.getLatestRef("prompts" /* SyncResource.Prompts */));
        assert.strictEqual(testObject.status, "hasConflicts" /* SyncStatus.HasConflicts */);
        const environmentService = testClient.instantiationService.get(IEnvironmentService);
        const local = joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'common.prompt.md');
        assertPreviews(testObject.conflicts.conflicts, [local]);
    });
    test('sync removing a prompt - resolve conflict', async () => {
        await updatePrompt('uncommon.prompt.md', PROMPT3_TEXT, client2);
        await updatePrompt('hot.prompt.md', PROMPT1_TEXT, client2);
        await client2.sync();
        await testObject.sync(await testClient.getLatestRef("prompts" /* SyncResource.Prompts */));
        await removePrompt('uncommon.prompt.md', client2);
        await client2.sync();
        await updatePrompt('uncommon.prompt.md', PROMPT4_TEXT, testClient);
        await testObject.sync(await testClient.getLatestRef("prompts" /* SyncResource.Prompts */));
        await testObject.accept(testObject.conflicts.conflicts[0].previewResource, PROMPT5_TEXT);
        await testObject.apply(false);
        assert.strictEqual(testObject.status, "idle" /* SyncStatus.Idle */);
        assert.deepStrictEqual(testObject.conflicts.conflicts, []);
        const actual1 = await readPrompt('hot.prompt.md', testClient);
        assert.strictEqual(actual1, PROMPT1_TEXT);
        const actual2 = await readPrompt('uncommon.prompt.md', testClient);
        assert.strictEqual(actual2, PROMPT5_TEXT);
        const { content } = await testClient.read(testObject.resource);
        assertDefined(content, 'Test object content must be defined.');
        const actual = parsePrompts(content);
        assert.deepStrictEqual(actual, { 'hot.prompt.md': PROMPT1_TEXT, 'uncommon.prompt.md': PROMPT5_TEXT });
    });
    test('sync removing a prompt - resolve conflict by removing', async () => {
        await updatePrompt('prompt3.prompt.md', PROMPT3_TEXT, client2);
        await updatePrompt('refactor.prompt.md', PROMPT1_TEXT, client2);
        await client2.sync();
        await testObject.sync(await testClient.getLatestRef("prompts" /* SyncResource.Prompts */));
        await removePrompt('prompt3.prompt.md', client2);
        await client2.sync();
        await updatePrompt('prompt3.prompt.md', PROMPT4_TEXT, testClient);
        await testObject.sync(await testClient.getLatestRef("prompts" /* SyncResource.Prompts */));
        await testObject.accept(testObject.conflicts.conflicts[0].previewResource, null);
        await testObject.apply(false);
        assert.strictEqual(testObject.status, "idle" /* SyncStatus.Idle */);
        assert.deepStrictEqual(testObject.conflicts.conflicts, []);
        const actual1 = await readPrompt('refactor.prompt.md', testClient);
        assert.strictEqual(actual1, PROMPT1_TEXT);
        const actual2 = await readPrompt('prompt3.prompt.md', testClient);
        assert.strictEqual(actual2, null);
        const { content } = await testClient.read(testObject.resource);
        assertDefined(content, 'Test object content must be defined.');
        const actual = parsePrompts(content);
        assert.deepStrictEqual(actual, { 'refactor.prompt.md': PROMPT1_TEXT });
    });
    test('sync prompts', async () => {
        await updatePrompt('first.prompt.md', PROMPT6_TEXT, client2);
        await updatePrompt('roaming.prompt.md', PROMPT3_TEXT, client2);
        await client2.sync();
        await testObject.sync(await testClient.getLatestRef("prompts" /* SyncResource.Prompts */));
        assert.strictEqual(testObject.status, "idle" /* SyncStatus.Idle */);
        assert.deepStrictEqual(testObject.conflicts.conflicts, []);
        const actual1 = await readPrompt('roaming.prompt.md', testClient);
        assert.strictEqual(actual1, PROMPT3_TEXT);
        const actual2 = await readPrompt('first.prompt.md', testClient);
        assert.strictEqual(actual2, PROMPT6_TEXT);
        const { content } = await testClient.read(testObject.resource);
        assertDefined(content, 'Test object content must be defined.');
        const actual = parsePrompts(content);
        assert.deepStrictEqual(actual, { 'roaming.prompt.md': PROMPT3_TEXT, 'first.prompt.md': PROMPT6_TEXT });
    });
    test('sync should ignore non prompts', async () => {
        await updatePrompt('my.prompt.md', PROMPT6_TEXT, client2);
        await updatePrompt('html.html', PROMPT3_TEXT, client2);
        await updatePrompt('shared.prompt.md', PROMPT1_TEXT, client2);
        await client2.sync();
        await testObject.sync(await testClient.getLatestRef("prompts" /* SyncResource.Prompts */));
        assert.strictEqual(testObject.status, "idle" /* SyncStatus.Idle */);
        assert.deepStrictEqual(testObject.conflicts.conflicts, []);
        const actual1 = await readPrompt('shared.prompt.md', testClient);
        assert.strictEqual(actual1, PROMPT1_TEXT);
        const actual2 = await readPrompt('my.prompt.md', testClient);
        assert.strictEqual(actual2, PROMPT6_TEXT);
        const actual3 = await readPrompt('html.html', testClient);
        assert.strictEqual(actual3, null);
        const { content } = await testClient.read(testObject.resource);
        assert.ok(content !== null);
        const actual = parsePrompts(content);
        assert.deepStrictEqual(actual, { 'shared.prompt.md': PROMPT1_TEXT, 'my.prompt.md': PROMPT6_TEXT });
    });
    test('previews are reset after all conflicts resolved', async () => {
        await updatePrompt('html.prompt.md', PROMPT3_TEXT, client2);
        await updatePrompt('css.prompt.md', PROMPT1_TEXT, client2);
        await client2.sync();
        await updatePrompt('html.prompt.md', PROMPT4_TEXT, testClient);
        await testObject.sync(await testClient.getLatestRef("prompts" /* SyncResource.Prompts */));
        const conflicts = testObject.conflicts.conflicts;
        await testObject.accept(conflicts[0].previewResource, PROMPT4_TEXT);
        await testObject.apply(false);
        const fileService = testClient.instantiationService.get(IFileService);
        assert.ok(!await fileService.exists(dirname(conflicts[0].previewResource)));
    });
    test('merge when there are multiple prompts and all prompts are merged', async () => {
        const environmentService = testClient.instantiationService.get(IEnvironmentService);
        await updatePrompt('sublime.prompt.md', PROMPT4_TEXT, testClient);
        await updatePrompt('tests.prompt.md', PROMPT2_TEXT, testClient);
        const preview = await testObject.sync(await testClient.getLatestRef("prompts" /* SyncResource.Prompts */), true);
        assert.strictEqual(testObject.status, "syncing" /* SyncStatus.Syncing */);
        assertPreviews(preview.resourcePreviews, [
            joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'sublime.prompt.md'),
            joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'tests.prompt.md'),
        ]);
        assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    });
    test('merge when there are multiple prompts and all prompts are merged and applied', async () => {
        await updatePrompt('short.prompt.md', PROMPT4_TEXT, testClient);
        await updatePrompt('long.prompt.md', PROMPT2_TEXT, testClient);
        let preview = await testObject.sync(await testClient.getLatestRef("prompts" /* SyncResource.Prompts */), true);
        preview = await testObject.apply(false);
        assert.strictEqual(testObject.status, "idle" /* SyncStatus.Idle */);
        assert.strictEqual(preview, null);
        assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    });
    test('merge when there are multiple prompts and one prompt has no changes and one prompt is merged', async () => {
        const environmentService = testClient.instantiationService.get(IEnvironmentService);
        await updatePrompt('coding.prompt.md', PROMPT3_TEXT, client2);
        await client2.sync();
        await updatePrompt('coding.prompt.md', PROMPT3_TEXT, testClient);
        await updatePrompt('exploring.prompt.md', PROMPT2_TEXT, testClient);
        const preview = await testObject.sync(await testClient.getLatestRef("prompts" /* SyncResource.Prompts */), true);
        assert.strictEqual(testObject.status, "syncing" /* SyncStatus.Syncing */);
        assertPreviews(preview.resourcePreviews, [
            joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'exploring.prompt.md'),
            joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'coding.prompt.md'),
        ]);
        assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    });
    test('merge when there are multiple prompts and one prompt has no changes and prompts is merged and applied', async () => {
        await updatePrompt('quick.prompt.md', PROMPT3_TEXT, client2);
        await client2.sync();
        await updatePrompt('quick.prompt.md', PROMPT3_TEXT, testClient);
        await updatePrompt('databases.prompt.md', PROMPT2_TEXT, testClient);
        let preview = await testObject.sync(await testClient.getLatestRef("prompts" /* SyncResource.Prompts */), true);
        preview = await testObject.apply(false);
        assert.strictEqual(testObject.status, "idle" /* SyncStatus.Idle */);
        assert.strictEqual(preview, null);
        assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    });
    test('merge when there are multiple prompts with conflicts and all prompts are merged', async () => {
        const environmentService = testClient.instantiationService.get(IEnvironmentService);
        await updatePrompt('reverse.prompt.md', PROMPT3_TEXT, client2);
        await updatePrompt('recycle.prompt.md', PROMPT1_TEXT, client2);
        await client2.sync();
        await updatePrompt('reverse.prompt.md', PROMPT4_TEXT, testClient);
        await updatePrompt('recycle.prompt.md', PROMPT2_TEXT, testClient);
        const preview = await testObject.sync(await testClient.getLatestRef("prompts" /* SyncResource.Prompts */), true);
        assert.strictEqual(testObject.status, "hasConflicts" /* SyncStatus.HasConflicts */);
        assertPreviews(preview.resourcePreviews, [
            joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'reverse.prompt.md'),
            joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'recycle.prompt.md'),
        ]);
        assertPreviews(testObject.conflicts.conflicts, [
            joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'reverse.prompt.md'),
            joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'recycle.prompt.md'),
        ]);
    });
    test('accept when there are multiple prompts with conflicts and only one prompt is accepted', async () => {
        const environmentService = testClient.instantiationService.get(IEnvironmentService);
        await updatePrompt('current.prompt.md', PROMPT3_TEXT, client2);
        await updatePrompt('future.prompt.md', PROMPT1_TEXT, client2);
        await client2.sync();
        await updatePrompt('current.prompt.md', PROMPT4_TEXT, testClient);
        await updatePrompt('future.prompt.md', PROMPT2_TEXT, testClient);
        let preview = await testObject.sync(await testClient.getLatestRef("prompts" /* SyncResource.Prompts */), true);
        assert.strictEqual(testObject.status, "hasConflicts" /* SyncStatus.HasConflicts */);
        assertPreviews(preview.resourcePreviews, [
            joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'current.prompt.md'),
            joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'future.prompt.md'),
        ]);
        assertPreviews(testObject.conflicts.conflicts, [
            joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'current.prompt.md'),
            joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'future.prompt.md'),
        ]);
        preview = await testObject.accept(preview.resourcePreviews[0].previewResource, PROMPT4_TEXT);
        assert.strictEqual(testObject.status, "hasConflicts" /* SyncStatus.HasConflicts */);
        assertPreviews(preview.resourcePreviews, [
            joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'current.prompt.md'),
            joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'future.prompt.md'),
        ]);
        assertPreviews(testObject.conflicts.conflicts, [
            joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'future.prompt.md'),
        ]);
    });
    test('accept when there are multiple prompts with conflicts and all prompts are accepted', async () => {
        const environmentService = testClient.instantiationService.get(IEnvironmentService);
        await updatePrompt('dynamic.prompt.md', PROMPT3_TEXT, client2);
        await updatePrompt('static.prompt.md', PROMPT1_TEXT, client2);
        await client2.sync();
        await updatePrompt('dynamic.prompt.md', PROMPT4_TEXT, testClient);
        await updatePrompt('static.prompt.md', PROMPT2_TEXT, testClient);
        let preview = await testObject.sync(await testClient.getLatestRef("prompts" /* SyncResource.Prompts */), true);
        assert.strictEqual(testObject.status, "hasConflicts" /* SyncStatus.HasConflicts */);
        assertPreviews(preview.resourcePreviews, [
            joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'dynamic.prompt.md'),
            joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'static.prompt.md'),
        ]);
        assertPreviews(testObject.conflicts.conflicts, [
            joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'dynamic.prompt.md'),
            joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'static.prompt.md'),
        ]);
        preview = await testObject.accept(preview.resourcePreviews[0].previewResource, PROMPT4_TEXT);
        preview = await testObject.accept(preview.resourcePreviews[1].previewResource, PROMPT2_TEXT);
        assert.strictEqual(testObject.status, "syncing" /* SyncStatus.Syncing */);
        assertPreviews(preview.resourcePreviews, [
            joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'dynamic.prompt.md'),
            joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'static.prompt.md'),
        ]);
        assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    });
    test('accept when there are multiple prompts with conflicts and all prompts are accepted and applied', async () => {
        const environmentService = testClient.instantiationService.get(IEnvironmentService);
        await updatePrompt('edicational.prompt.md', PROMPT3_TEXT, client2);
        await updatePrompt('unknown.prompt.md', PROMPT1_TEXT, client2);
        await client2.sync();
        await updatePrompt('edicational.prompt.md', PROMPT4_TEXT, testClient);
        await updatePrompt('unknown.prompt.md', PROMPT2_TEXT, testClient);
        let preview = await testObject.sync(await testClient.getLatestRef("prompts" /* SyncResource.Prompts */), true);
        assertDefined(preview, 'Preview must be defined.');
        assert.strictEqual(testObject.status, "hasConflicts" /* SyncStatus.HasConflicts */);
        assertPreviews(preview.resourcePreviews, [
            joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'edicational.prompt.md'),
            joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'unknown.prompt.md'),
        ]);
        assertPreviews(testObject.conflicts.conflicts, [
            joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'edicational.prompt.md'),
            joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'unknown.prompt.md'),
        ]);
        preview = await testObject.accept(preview.resourcePreviews[0].previewResource, PROMPT4_TEXT);
        assertDefined(preview, 'Preview must be defined after accept.');
        preview = await testObject.accept(preview.resourcePreviews[1].previewResource, PROMPT2_TEXT);
        preview = await testObject.apply(false);
        assert.strictEqual(testObject.status, "idle" /* SyncStatus.Idle */);
        assert.strictEqual(preview, null, 'Preview after the last apply must be `null`.');
        assert.deepStrictEqual(testObject.conflicts.conflicts, []);
    });
    test('sync profile prompts', async () => {
        const client2 = disposableStore.add(new UserDataSyncClient(server));
        await client2.setUp(true);
        const profile = await client2.instantiationService.get(IUserDataProfilesService).createNamedProfile('profile1');
        await updatePrompt('my.prompt.md', PROMPT3_TEXT, client2, profile);
        await client2.sync();
        await testClient.sync();
        const syncedProfile = testClient.instantiationService.get(IUserDataProfilesService).profiles.find(p => p.id === profile.id);
        const content = await readPrompt('my.prompt.md', testClient, syncedProfile);
        assert.strictEqual(content, PROMPT3_TEXT);
    });
    function parsePrompts(content) {
        const syncData = JSON.parse(content);
        return JSON.parse(syncData.content);
    }
    async function updatePrompt(name, content, client, profile) {
        const fileService = client.instantiationService.get(IFileService);
        const userDataProfilesService = client.instantiationService.get(IUserDataProfilesService);
        const promptsResource = joinPath((profile ?? userDataProfilesService.defaultProfile).promptsHome, name);
        await fileService.writeFile(promptsResource, VSBuffer.fromString(content));
    }
    async function removePrompt(name, client) {
        const fileService = client.instantiationService.get(IFileService);
        const userDataProfilesService = client.instantiationService.get(IUserDataProfilesService);
        const promptsResource = joinPath(userDataProfilesService.defaultProfile.promptsHome, name);
        await fileService.del(promptsResource);
    }
    async function readPrompt(name, client, profile) {
        const fileService = client.instantiationService.get(IFileService);
        const userDataProfilesService = client.instantiationService.get(IUserDataProfilesService);
        const promptsResource = joinPath((profile ?? userDataProfilesService.defaultProfile).promptsHome, name);
        if (await fileService.exists(promptsResource)) {
            const content = await fileService.readFile(promptsResource);
            return content.value.toString();
        }
        return null;
    }
    function assertPreviews(actual, expected) {
        assert.deepStrictEqual(actual.map(({ previewResource }) => previewResource.toString()), expected.map(uri => uri.toString()));
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvbXB0c1N5bmMudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3VzZXJEYXRhU3luYy90ZXN0L2NvbW1vbi9wcm9tcHRzU3luYy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUU1QixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDN0QsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBR3pFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxzQkFBc0IsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQ3JGLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hHLE9BQU8sRUFBb0Isd0JBQXdCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUNoSCxPQUFPLEVBQStCLHlCQUF5QixFQUFFLGdCQUFnQixFQUE0QixNQUFNLDhCQUE4QixDQUFDO0FBRWxKLE1BQU0sWUFBWSxHQUFHLG9FQUFvRSxDQUFDO0FBQzFGLE1BQU0sWUFBWSxHQUFHLDBEQUEwRCxDQUFDO0FBQ2hGLE1BQU0sWUFBWSxHQUFHLG9GQUFvRixDQUFDO0FBQzFHLE1BQU0sWUFBWSxHQUFHLGdFQUFnRSxDQUFDO0FBQ3RGLE1BQU0sWUFBWSxHQUFHLGtFQUFrRSxDQUFDO0FBQ3hGLE1BQU0sWUFBWSxHQUFHLGlGQUFpRixDQUFDO0FBRXZHLEtBQUssQ0FBQyxhQUFhLEVBQUUsR0FBRyxF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