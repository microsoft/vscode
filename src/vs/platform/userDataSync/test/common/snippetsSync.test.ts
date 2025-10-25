/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { IStringDictionary } from '../../../../base/common/collections.js';
import { dirname, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IEnvironmentService } from '../../../environment/common/environment.js';
import { IFileService } from '../../../files/common/files.js';
import { IUserDataProfile, IUserDataProfilesService } from '../../../userDataProfile/common/userDataProfile.js';
import { SnippetsSynchroniser } from '../../common/snippetsSync.js';
import { IResourcePreview, ISyncData, IUserDataSyncStoreService, PREVIEW_DIR_NAME, SyncResource, SyncStatus } from '../../common/userDataSync.js';
import { UserDataSyncClient, UserDataSyncTestServer } from './userDataSyncClient.js';

const tsSnippet1 = `{

	// Place your snippets for TypeScript here. Each snippet is defined under a snippet name and has a prefix, body and
	// description. The prefix is what is used to trigger the snippet and the body will be expanded and inserted. Possible variables are:
	// $1, $2 for tab stops, $0 for the final cursor position, Placeholders with the
	// same ids are connected.
	"Print to console": {
	// Example:
	"prefix": "log",
		"body": [
			"console.log('$1');",
			"$2"
		],
			"description": "Log output to console",
	}

}`;

const tsSnippet2 = `{

	// Place your snippets for TypeScript here. Each snippet is defined under a snippet name and has a prefix, body and
	// description. The prefix is what is used to trigger the snippet and the body will be expanded and inserted. Possible variables are:
	// $1, $2 for tab stops, $0 for the final cursor position, Placeholders with the
	// same ids are connected.
	"Print to console": {
	// Example:
	"prefix": "log",
		"body": [
			"console.log('$1');",
			"$2"
		],
			"description": "Log output to console always",
	}

}`;

const htmlSnippet1 = `{
/*
	// Place your snippets for HTML here. Each snippet is defined under a snippet name and has a prefix, body and
	// description. The prefix is what is used to trigger the snippet and the body will be expanded and inserted.
	// Example:
	"Print to console": {
	"prefix": "log",
		"body": [
			"console.log('$1');",
			"$2"
		],
			"description": "Log output to console"
	}
*/
"Div": {
	"prefix": "div",
		"body": [
			"<div>",
			"",
			"</div>"
		],
			"description": "New div"
	}
}`;

const htmlSnippet2 = `{
/*
	// Place your snippets for HTML here. Each snippet is defined under a snippet name and has a prefix, body and
	// description. The prefix is what is used to trigger the snippet and the body will be expanded and inserted.
	// Example:
	"Print to console": {
	"prefix": "log",
		"body": [
			"console.log('$1');",
			"$2"
		],
			"description": "Log output to console"
	}
*/
"Div": {
	"prefix": "div",
		"body": [
			"<div>",
			"",
			"</div>"
		],
			"description": "New div changed"
	}
}`;

const htmlSnippet3 = `{
/*
	// Place your snippets for HTML here. Each snippet is defined under a snippet name and has a prefix, body and
	// description. The prefix is what is used to trigger the snippet and the body will be expanded and inserted.
	// Example:
	"Print to console": {
	"prefix": "log",
		"body": [
			"console.log('$1');",
			"$2"
		],
			"description": "Log output to console"
	}
*/
"Div": {
	"prefix": "div",
		"body": [
			"<div>",
			"",
			"</div>"
		],
			"description": "New div changed again"
	}
}`;

const globalSnippet = `{
	// Place your global snippets here. Each snippet is defined under a snippet name and has a scope, prefix, body and
	// description. Add comma separated ids of the languages where the snippet is applicable in the scope field. If scope
	// is left empty or omitted, the snippet gets applied to all languages. The prefix is what is
	// used to trigger the snippet and the body will be expanded and inserted. Possible variables are:
	// $1, $2 for tab stops, $0 for the final cursor position, and {1: label}, { 2: another } for placeholders.
	// Placeholders with the same ids are connected.
	// Example:
	// "Print to console": {
	// 	"scope": "javascript,typescript",
	// 	"prefix": "log",
	// 	"body": [
	// 		"console.log('$1');",
	// 		"$2"
	// 	],
	// 	"description": "Log output to console"
	// }
}`;

suite('SnippetsSync', () => {

	const server = new UserDataSyncTestServer();
	let testClient: UserDataSyncClient;
	let client2: UserDataSyncClient;

	let testObject: SnippetsSynchroniser;

	teardown(async () => {
		await testClient.instantiationService.get(IUserDataSyncStoreService).clear();
	});

	const disposableStore = ensureNoDisposablesAreLeakedInTestSuite();

	setup(async () => {
		testClient = disposableStore.add(new UserDataSyncClient(server));
		await testClient.setUp(true);
		testObject = testClient.getSynchronizer(SyncResource.Snippets) as SnippetsSynchroniser;

		client2 = disposableStore.add(new UserDataSyncClient(server));
		await client2.setUp(true);
	});

	test('when snippets does not exist', async () => {
		const fileService = testClient.instantiationService.get(IFileService);
		const snippetsResource = testClient.instantiationService.get(IUserDataProfilesService).defaultProfile.snippetsHome;

		assert.deepStrictEqual(await testObject.getLastSyncUserData(), null);
		let manifest = await testClient.getLatestRef(SyncResource.Snippets);
		server.reset();
		await testObject.sync(manifest);

		assert.deepStrictEqual(server.requests, []);
		assert.ok(!await fileService.exists(snippetsResource));

		const lastSyncUserData = await testObject.getLastSyncUserData();
		const remoteUserData = await testObject.getRemoteUserData(null);
		assert.deepStrictEqual(lastSyncUserData!.ref, remoteUserData.ref);
		assert.deepStrictEqual(lastSyncUserData!.syncData, remoteUserData.syncData);
		assert.strictEqual(lastSyncUserData!.syncData, null);

		manifest = await testClient.getLatestRef(SyncResource.Snippets);
		server.reset();
		await testObject.sync(manifest);
		assert.deepStrictEqual(server.requests, []);

		manifest = await testClient.getLatestRef(SyncResource.Snippets);
		server.reset();
		await testObject.sync(manifest);
		assert.deepStrictEqual(server.requests, []);
	});

	test('when snippet is created after first sync', async () => {
		await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
		await updateSnippet('html.json', htmlSnippet1, testClient);

		let lastSyncUserData = await testObject.getLastSyncUserData();
		const manifest = await testClient.getLatestRef(SyncResource.Snippets);
		server.reset();
		await testObject.sync(manifest);

		assert.deepStrictEqual(server.requests, [
			{ type: 'POST', url: `${server.url}/v1/resource/${testObject.resource}`, headers: { 'If-Match': lastSyncUserData?.ref } },
		]);

		lastSyncUserData = await testObject.getLastSyncUserData();
		const remoteUserData = await testObject.getRemoteUserData(null);
		assert.deepStrictEqual(lastSyncUserData!.ref, remoteUserData.ref);
		assert.deepStrictEqual(lastSyncUserData!.syncData, remoteUserData.syncData);
		assert.deepStrictEqual(lastSyncUserData!.syncData!.content, JSON.stringify({ 'html.json': htmlSnippet1 }));
	});

	test('first time sync - outgoing to server (no snippets)', async () => {
		await updateSnippet('html.json', htmlSnippet1, testClient);
		await updateSnippet('typescript.json', tsSnippet1, testClient);

		await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
		assert.strictEqual(testObject.status, SyncStatus.Idle);
		assert.deepStrictEqual(testObject.conflicts.conflicts, []);

		const { content } = await testClient.read(testObject.resource);
		assert.ok(content !== null);
		const actual = parseSnippets(content);
		assert.deepStrictEqual(actual, { 'html.json': htmlSnippet1, 'typescript.json': tsSnippet1 });
	});

	test('first time sync - incoming from server (no snippets)', async () => {
		await updateSnippet('html.json', htmlSnippet1, client2);
		await updateSnippet('typescript.json', tsSnippet1, client2);
		await client2.sync();

		await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
		assert.strictEqual(testObject.status, SyncStatus.Idle);
		assert.deepStrictEqual(testObject.conflicts.conflicts, []);

		const actual1 = await readSnippet('html.json', testClient);
		assert.strictEqual(actual1, htmlSnippet1);
		const actual2 = await readSnippet('typescript.json', testClient);
		assert.strictEqual(actual2, tsSnippet1);
	});

	test('first time sync when snippets exists', async () => {
		await updateSnippet('html.json', htmlSnippet1, client2);
		await client2.sync();

		await updateSnippet('typescript.json', tsSnippet1, testClient);
		await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
		assert.strictEqual(testObject.status, SyncStatus.Idle);
		assert.deepStrictEqual(testObject.conflicts.conflicts, []);

		const actual1 = await readSnippet('html.json', testClient);
		assert.strictEqual(actual1, htmlSnippet1);
		const actual2 = await readSnippet('typescript.json', testClient);
		assert.strictEqual(actual2, tsSnippet1);

		const { content } = await testClient.read(testObject.resource);
		assert.ok(content !== null);
		const actual = parseSnippets(content);
		assert.deepStrictEqual(actual, { 'html.json': htmlSnippet1, 'typescript.json': tsSnippet1 });
	});

	test('first time sync when snippets exists - has conflicts', async () => {
		await updateSnippet('html.json', htmlSnippet1, client2);
		await client2.sync();

		await updateSnippet('html.json', htmlSnippet2, testClient);
		await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));

		assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
		const environmentService = testClient.instantiationService.get(IEnvironmentService);
		const local = joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'html.json');
		assertPreviews(testObject.conflicts.conflicts, [local]);
	});

	test('first time sync when snippets exists - has conflicts and accept conflicts', async () => {
		await updateSnippet('html.json', htmlSnippet1, client2);
		await client2.sync();

		await updateSnippet('html.json', htmlSnippet2, testClient);
		await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
		const conflicts = testObject.conflicts.conflicts;
		await testObject.accept(conflicts[0].previewResource, htmlSnippet1);
		await testObject.apply(false);

		assert.strictEqual(testObject.status, SyncStatus.Idle);
		assert.deepStrictEqual(testObject.conflicts.conflicts, []);

		const actual1 = await readSnippet('html.json', testClient);
		assert.strictEqual(actual1, htmlSnippet1);

		const { content } = await testClient.read(testObject.resource);
		assert.ok(content !== null);
		const actual = parseSnippets(content);
		assert.deepStrictEqual(actual, { 'html.json': htmlSnippet1 });
	});

	test('first time sync when snippets exists - has multiple conflicts', async () => {
		await updateSnippet('html.json', htmlSnippet1, client2);
		await updateSnippet('typescript.json', tsSnippet1, client2);
		await client2.sync();

		await updateSnippet('html.json', htmlSnippet2, testClient);
		await updateSnippet('typescript.json', tsSnippet2, testClient);
		await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));

		assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
		const environmentService = testClient.instantiationService.get(IEnvironmentService);
		const local1 = joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'html.json');
		const local2 = joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'typescript.json');
		assertPreviews(testObject.conflicts.conflicts, [local1, local2]);
	});

	test('first time sync when snippets exists - has multiple conflicts and accept one conflict', async () => {
		await updateSnippet('html.json', htmlSnippet1, client2);
		await updateSnippet('typescript.json', tsSnippet1, client2);
		await client2.sync();

		await updateSnippet('html.json', htmlSnippet2, testClient);
		await updateSnippet('typescript.json', tsSnippet2, testClient);
		await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));

		let conflicts = testObject.conflicts.conflicts;
		await testObject.accept(conflicts[0].previewResource, htmlSnippet2);

		conflicts = testObject.conflicts.conflicts;
		assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
		const environmentService = testClient.instantiationService.get(IEnvironmentService);
		const local = joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'typescript.json');
		assertPreviews(testObject.conflicts.conflicts, [local]);
	});

	test('first time sync when snippets exists - has multiple conflicts and accept all conflicts', async () => {
		await updateSnippet('html.json', htmlSnippet1, client2);
		await updateSnippet('typescript.json', tsSnippet1, client2);
		await client2.sync();

		await updateSnippet('html.json', htmlSnippet2, testClient);
		await updateSnippet('typescript.json', tsSnippet2, testClient);
		await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));

		const conflicts = testObject.conflicts.conflicts;
		await testObject.accept(conflicts[0].previewResource, htmlSnippet2);
		await testObject.accept(conflicts[1].previewResource, tsSnippet1);
		await testObject.apply(false);

		assert.strictEqual(testObject.status, SyncStatus.Idle);
		assert.deepStrictEqual(testObject.conflicts.conflicts, []);

		const actual1 = await readSnippet('html.json', testClient);
		assert.strictEqual(actual1, htmlSnippet2);
		const actual2 = await readSnippet('typescript.json', testClient);
		assert.strictEqual(actual2, tsSnippet1);

		const { content } = await testClient.read(testObject.resource);
		assert.ok(content !== null);
		const actual = parseSnippets(content);
		assert.deepStrictEqual(actual, { 'html.json': htmlSnippet2, 'typescript.json': tsSnippet1 });
	});

	test('sync adding a snippet', async () => {
		await updateSnippet('html.json', htmlSnippet1, testClient);
		await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));

		await updateSnippet('typescript.json', tsSnippet1, testClient);
		await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
		assert.strictEqual(testObject.status, SyncStatus.Idle);
		assert.deepStrictEqual(testObject.conflicts.conflicts, []);

		const actual1 = await readSnippet('html.json', testClient);
		assert.strictEqual(actual1, htmlSnippet1);
		const actual2 = await readSnippet('typescript.json', testClient);
		assert.strictEqual(actual2, tsSnippet1);

		const { content } = await testClient.read(testObject.resource);
		assert.ok(content !== null);
		const actual = parseSnippets(content);
		assert.deepStrictEqual(actual, { 'html.json': htmlSnippet1, 'typescript.json': tsSnippet1 });
	});

	test('sync adding a snippet - accept', async () => {
		await updateSnippet('html.json', htmlSnippet1, client2);
		await client2.sync();
		await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));

		await updateSnippet('typescript.json', tsSnippet1, client2);
		await client2.sync();

		await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
		assert.strictEqual(testObject.status, SyncStatus.Idle);
		assert.deepStrictEqual(testObject.conflicts.conflicts, []);

		const actual1 = await readSnippet('html.json', testClient);
		assert.strictEqual(actual1, htmlSnippet1);
		const actual2 = await readSnippet('typescript.json', testClient);
		assert.strictEqual(actual2, tsSnippet1);
	});

	test('sync updating a snippet', async () => {
		await updateSnippet('html.json', htmlSnippet1, testClient);
		await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));

		await updateSnippet('html.json', htmlSnippet2, testClient);
		await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
		assert.strictEqual(testObject.status, SyncStatus.Idle);
		assert.deepStrictEqual(testObject.conflicts.conflicts, []);

		const actual1 = await readSnippet('html.json', testClient);
		assert.strictEqual(actual1, htmlSnippet2);

		const { content } = await testClient.read(testObject.resource);
		assert.ok(content !== null);
		const actual = parseSnippets(content);
		assert.deepStrictEqual(actual, { 'html.json': htmlSnippet2 });
	});

	test('sync updating a snippet - accept', async () => {
		await updateSnippet('html.json', htmlSnippet1, client2);
		await client2.sync();
		await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));

		await updateSnippet('html.json', htmlSnippet2, client2);
		await client2.sync();

		await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
		assert.strictEqual(testObject.status, SyncStatus.Idle);
		assert.deepStrictEqual(testObject.conflicts.conflicts, []);

		const actual1 = await readSnippet('html.json', testClient);
		assert.strictEqual(actual1, htmlSnippet2);
	});

	test('sync updating a snippet - conflict', async () => {
		await updateSnippet('html.json', htmlSnippet1, client2);
		await client2.sync();
		await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));

		await updateSnippet('html.json', htmlSnippet2, client2);
		await client2.sync();

		await updateSnippet('html.json', htmlSnippet3, testClient);
		await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
		assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
		const environmentService = testClient.instantiationService.get(IEnvironmentService);
		const local = joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'html.json');
		assertPreviews(testObject.conflicts.conflicts, [local]);
	});

	test('sync updating a snippet - resolve conflict', async () => {
		await updateSnippet('html.json', htmlSnippet1, client2);
		await client2.sync();
		await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));

		await updateSnippet('html.json', htmlSnippet2, client2);
		await client2.sync();

		await updateSnippet('html.json', htmlSnippet3, testClient);
		await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
		await testObject.accept(testObject.conflicts.conflicts[0].previewResource, htmlSnippet2);
		await testObject.apply(false);

		assert.strictEqual(testObject.status, SyncStatus.Idle);
		assert.deepStrictEqual(testObject.conflicts.conflicts, []);

		const actual1 = await readSnippet('html.json', testClient);
		assert.strictEqual(actual1, htmlSnippet2);

		const { content } = await testClient.read(testObject.resource);
		assert.ok(content !== null);
		const actual = parseSnippets(content);
		assert.deepStrictEqual(actual, { 'html.json': htmlSnippet2 });
	});

	test('sync removing a snippet', async () => {
		await updateSnippet('html.json', htmlSnippet1, testClient);
		await updateSnippet('typescript.json', tsSnippet1, testClient);
		await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));

		await removeSnippet('html.json', testClient);
		await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
		assert.strictEqual(testObject.status, SyncStatus.Idle);
		assert.deepStrictEqual(testObject.conflicts.conflicts, []);

		const actual1 = await readSnippet('typescript.json', testClient);
		assert.strictEqual(actual1, tsSnippet1);
		const actual2 = await readSnippet('html.json', testClient);
		assert.strictEqual(actual2, null);

		const { content } = await testClient.read(testObject.resource);
		assert.ok(content !== null);
		const actual = parseSnippets(content);
		assert.deepStrictEqual(actual, { 'typescript.json': tsSnippet1 });
	});

	test('sync removing a snippet - accept', async () => {
		await updateSnippet('html.json', htmlSnippet1, client2);
		await updateSnippet('typescript.json', tsSnippet1, client2);
		await client2.sync();
		await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));

		await removeSnippet('html.json', client2);
		await client2.sync();

		await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
		assert.strictEqual(testObject.status, SyncStatus.Idle);
		assert.deepStrictEqual(testObject.conflicts.conflicts, []);

		const actual1 = await readSnippet('typescript.json', testClient);
		assert.strictEqual(actual1, tsSnippet1);
		const actual2 = await readSnippet('html.json', testClient);
		assert.strictEqual(actual2, null);
	});

	test('sync removing a snippet locally and updating it remotely', async () => {
		await updateSnippet('html.json', htmlSnippet1, client2);
		await updateSnippet('typescript.json', tsSnippet1, client2);
		await client2.sync();
		await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));

		await updateSnippet('html.json', htmlSnippet2, client2);
		await client2.sync();

		await removeSnippet('html.json', testClient);
		await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));

		assert.strictEqual(testObject.status, SyncStatus.Idle);
		assert.deepStrictEqual(testObject.conflicts.conflicts, []);

		const actual1 = await readSnippet('typescript.json', testClient);
		assert.strictEqual(actual1, tsSnippet1);
		const actual2 = await readSnippet('html.json', testClient);
		assert.strictEqual(actual2, htmlSnippet2);
	});

	test('sync removing a snippet - conflict', async () => {
		await updateSnippet('html.json', htmlSnippet1, client2);
		await updateSnippet('typescript.json', tsSnippet1, client2);
		await client2.sync();
		await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));

		await removeSnippet('html.json', client2);
		await client2.sync();

		await updateSnippet('html.json', htmlSnippet2, testClient);
		await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));

		assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
		const environmentService = testClient.instantiationService.get(IEnvironmentService);
		const local = joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'html.json');
		assertPreviews(testObject.conflicts.conflicts, [local]);
	});

	test('sync removing a snippet - resolve conflict', async () => {
		await updateSnippet('html.json', htmlSnippet1, client2);
		await updateSnippet('typescript.json', tsSnippet1, client2);
		await client2.sync();
		await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));

		await removeSnippet('html.json', client2);
		await client2.sync();

		await updateSnippet('html.json', htmlSnippet2, testClient);
		await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
		await testObject.accept(testObject.conflicts.conflicts[0].previewResource, htmlSnippet3);
		await testObject.apply(false);

		assert.strictEqual(testObject.status, SyncStatus.Idle);
		assert.deepStrictEqual(testObject.conflicts.conflicts, []);

		const actual1 = await readSnippet('typescript.json', testClient);
		assert.strictEqual(actual1, tsSnippet1);
		const actual2 = await readSnippet('html.json', testClient);
		assert.strictEqual(actual2, htmlSnippet3);

		const { content } = await testClient.read(testObject.resource);
		assert.ok(content !== null);
		const actual = parseSnippets(content);
		assert.deepStrictEqual(actual, { 'typescript.json': tsSnippet1, 'html.json': htmlSnippet3 });
	});

	test('sync removing a snippet - resolve conflict by removing', async () => {
		await updateSnippet('html.json', htmlSnippet1, client2);
		await updateSnippet('typescript.json', tsSnippet1, client2);
		await client2.sync();
		await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));

		await removeSnippet('html.json', client2);
		await client2.sync();

		await updateSnippet('html.json', htmlSnippet2, testClient);
		await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
		await testObject.accept(testObject.conflicts.conflicts[0].previewResource, null);
		await testObject.apply(false);

		assert.strictEqual(testObject.status, SyncStatus.Idle);
		assert.deepStrictEqual(testObject.conflicts.conflicts, []);

		const actual1 = await readSnippet('typescript.json', testClient);
		assert.strictEqual(actual1, tsSnippet1);
		const actual2 = await readSnippet('html.json', testClient);
		assert.strictEqual(actual2, null);

		const { content } = await testClient.read(testObject.resource);
		assert.ok(content !== null);
		const actual = parseSnippets(content);
		assert.deepStrictEqual(actual, { 'typescript.json': tsSnippet1 });
	});

	test('sync global and language snippet', async () => {
		await updateSnippet('global.code-snippets', globalSnippet, client2);
		await updateSnippet('html.json', htmlSnippet1, client2);
		await client2.sync();

		await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
		assert.strictEqual(testObject.status, SyncStatus.Idle);
		assert.deepStrictEqual(testObject.conflicts.conflicts, []);

		const actual1 = await readSnippet('html.json', testClient);
		assert.strictEqual(actual1, htmlSnippet1);
		const actual2 = await readSnippet('global.code-snippets', testClient);
		assert.strictEqual(actual2, globalSnippet);

		const { content } = await testClient.read(testObject.resource);
		assert.ok(content !== null);
		const actual = parseSnippets(content);
		assert.deepStrictEqual(actual, { 'html.json': htmlSnippet1, 'global.code-snippets': globalSnippet });
	});

	test('sync should ignore non snippets', async () => {
		await updateSnippet('global.code-snippets', globalSnippet, client2);
		await updateSnippet('html.html', htmlSnippet1, client2);
		await updateSnippet('typescript.json', tsSnippet1, client2);
		await client2.sync();

		await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));
		assert.strictEqual(testObject.status, SyncStatus.Idle);
		assert.deepStrictEqual(testObject.conflicts.conflicts, []);

		const actual1 = await readSnippet('typescript.json', testClient);
		assert.strictEqual(actual1, tsSnippet1);
		const actual2 = await readSnippet('global.code-snippets', testClient);
		assert.strictEqual(actual2, globalSnippet);
		const actual3 = await readSnippet('html.html', testClient);
		assert.strictEqual(actual3, null);

		const { content } = await testClient.read(testObject.resource);
		assert.ok(content !== null);
		const actual = parseSnippets(content);
		assert.deepStrictEqual(actual, { 'typescript.json': tsSnippet1, 'global.code-snippets': globalSnippet });
	});

	test('previews are reset after all conflicts resolved', async () => {
		await updateSnippet('html.json', htmlSnippet1, client2);
		await updateSnippet('typescript.json', tsSnippet1, client2);
		await client2.sync();

		await updateSnippet('html.json', htmlSnippet2, testClient);
		await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets));

		const conflicts = testObject.conflicts.conflicts;
		await testObject.accept(conflicts[0].previewResource, htmlSnippet2);
		await testObject.apply(false);

		const fileService = testClient.instantiationService.get(IFileService);
		assert.ok(!await fileService.exists(dirname(conflicts[0].previewResource)));
	});

	test('merge when there are multiple snippets and all snippets are merged', async () => {
		const environmentService = testClient.instantiationService.get(IEnvironmentService);

		await updateSnippet('html.json', htmlSnippet2, testClient);
		await updateSnippet('typescript.json', tsSnippet2, testClient);
		const preview = await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets), true);

		assert.strictEqual(testObject.status, SyncStatus.Syncing);
		assertPreviews(preview!.resourcePreviews,
			[
				joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'html.json'),
				joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'typescript.json'),
			]);
		assert.deepStrictEqual(testObject.conflicts.conflicts, []);
	});

	test('merge when there are multiple snippets and all snippets are merged and applied', async () => {
		await updateSnippet('html.json', htmlSnippet2, testClient);
		await updateSnippet('typescript.json', tsSnippet2, testClient);
		let preview = await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets), true);
		preview = await testObject.apply(false);

		assert.strictEqual(testObject.status, SyncStatus.Idle);
		assert.strictEqual(preview, null);
		assert.deepStrictEqual(testObject.conflicts.conflicts, []);
	});

	test('merge when there are multiple snippets and one snippet has no changes and one snippet is merged', async () => {
		const environmentService = testClient.instantiationService.get(IEnvironmentService);

		await updateSnippet('html.json', htmlSnippet1, client2);
		await client2.sync();

		await updateSnippet('html.json', htmlSnippet1, testClient);
		await updateSnippet('typescript.json', tsSnippet2, testClient);
		const preview = await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets), true);

		assert.strictEqual(testObject.status, SyncStatus.Syncing);
		assertPreviews(preview!.resourcePreviews,
			[
				joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'typescript.json'),
				joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'html.json'),
			]);
		assert.deepStrictEqual(testObject.conflicts.conflicts, []);
	});

	test('merge when there are multiple snippets and one snippet has no changes and snippets is merged and applied', async () => {
		await updateSnippet('html.json', htmlSnippet1, client2);
		await client2.sync();

		await updateSnippet('html.json', htmlSnippet1, testClient);
		await updateSnippet('typescript.json', tsSnippet2, testClient);
		let preview = await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets), true);

		preview = await testObject.apply(false);

		assert.strictEqual(testObject.status, SyncStatus.Idle);
		assert.strictEqual(preview, null);
		assert.deepStrictEqual(testObject.conflicts.conflicts, []);
	});

	test('merge when there are multiple snippets with conflicts and all snippets are merged', async () => {
		const environmentService = testClient.instantiationService.get(IEnvironmentService);

		await updateSnippet('html.json', htmlSnippet1, client2);
		await updateSnippet('typescript.json', tsSnippet1, client2);
		await client2.sync();

		await updateSnippet('html.json', htmlSnippet2, testClient);
		await updateSnippet('typescript.json', tsSnippet2, testClient);
		const preview = await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets), true);

		assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
		assertPreviews(preview!.resourcePreviews,
			[
				joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'html.json'),
				joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'typescript.json'),
			]);
		assertPreviews(testObject.conflicts.conflicts,
			[
				joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'html.json'),
				joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'typescript.json'),
			]);
	});

	test('accept when there are multiple snippets with conflicts and only one snippet is accepted', async () => {
		const environmentService = testClient.instantiationService.get(IEnvironmentService);

		await updateSnippet('html.json', htmlSnippet1, client2);
		await updateSnippet('typescript.json', tsSnippet1, client2);
		await client2.sync();

		await updateSnippet('html.json', htmlSnippet2, testClient);
		await updateSnippet('typescript.json', tsSnippet2, testClient);
		let preview = await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets), true);

		assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
		assertPreviews(preview!.resourcePreviews,
			[
				joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'html.json'),
				joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'typescript.json'),
			]);
		assertPreviews(testObject.conflicts.conflicts,
			[
				joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'html.json'),
				joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'typescript.json'),
			]);

		preview = await testObject.accept(preview!.resourcePreviews[0].previewResource, htmlSnippet2);

		assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
		assertPreviews(preview!.resourcePreviews,
			[
				joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'html.json'),
				joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'typescript.json'),
			]);
		assertPreviews(testObject.conflicts.conflicts,
			[
				joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'typescript.json'),
			]);
	});

	test('accept when there are multiple snippets with conflicts and all snippets are accepted', async () => {
		const environmentService = testClient.instantiationService.get(IEnvironmentService);

		await updateSnippet('html.json', htmlSnippet1, client2);
		await updateSnippet('typescript.json', tsSnippet1, client2);
		await client2.sync();

		await updateSnippet('html.json', htmlSnippet2, testClient);
		await updateSnippet('typescript.json', tsSnippet2, testClient);
		let preview = await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets), true);

		assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
		assertPreviews(preview!.resourcePreviews,
			[
				joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'html.json'),
				joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'typescript.json'),
			]);
		assertPreviews(testObject.conflicts.conflicts,
			[
				joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'html.json'),
				joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'typescript.json'),
			]);

		preview = await testObject.accept(preview!.resourcePreviews[0].previewResource, htmlSnippet2);
		preview = await testObject.accept(preview!.resourcePreviews[1].previewResource, tsSnippet2);

		assert.strictEqual(testObject.status, SyncStatus.Syncing);
		assertPreviews(preview!.resourcePreviews,
			[
				joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'html.json'),
				joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'typescript.json'),
			]);
		assert.deepStrictEqual(testObject.conflicts.conflicts, []);
	});

	test('accept when there are multiple snippets with conflicts and all snippets are accepted and applied', async () => {
		const environmentService = testClient.instantiationService.get(IEnvironmentService);
		await updateSnippet('html.json', htmlSnippet1, client2);
		await updateSnippet('typescript.json', tsSnippet1, client2);
		await client2.sync();

		await updateSnippet('html.json', htmlSnippet2, testClient);
		await updateSnippet('typescript.json', tsSnippet2, testClient);
		let preview = await testObject.sync(await testClient.getLatestRef(SyncResource.Snippets), true);

		assert.strictEqual(testObject.status, SyncStatus.HasConflicts);
		assertPreviews(preview!.resourcePreviews,
			[
				joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'html.json'),
				joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'typescript.json'),
			]);
		assertPreviews(testObject.conflicts.conflicts,
			[
				joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'html.json'),
				joinPath(environmentService.userDataSyncHome, testObject.resource, PREVIEW_DIR_NAME, 'typescript.json'),
			]);

		preview = await testObject.accept(preview!.resourcePreviews[0].previewResource, htmlSnippet2);
		preview = await testObject.accept(preview!.resourcePreviews[1].previewResource, tsSnippet2);
		preview = await testObject.apply(false);

		assert.strictEqual(testObject.status, SyncStatus.Idle);
		assert.strictEqual(preview, null);
		assert.deepStrictEqual(testObject.conflicts.conflicts, []);
	});

	test('sync profile snippets', async () => {
		const client2 = disposableStore.add(new UserDataSyncClient(server));
		await client2.setUp(true);
		const profile = await client2.instantiationService.get(IUserDataProfilesService).createNamedProfile('profile1');
		await updateSnippet('html.json', htmlSnippet1, client2, profile);
		await client2.sync();

		await testClient.sync();

		const syncedProfile = testClient.instantiationService.get(IUserDataProfilesService).profiles.find(p => p.id === profile.id)!;
		const content = await readSnippet('html.json', testClient, syncedProfile);
		assert.strictEqual(content, htmlSnippet1);
	});

	function parseSnippets(content: string): IStringDictionary<string> {
		const syncData: ISyncData = JSON.parse(content);
		return JSON.parse(syncData.content);
	}

	async function updateSnippet(name: string, content: string, client: UserDataSyncClient, profile?: IUserDataProfile): Promise<void> {
		const fileService = client.instantiationService.get(IFileService);
		const userDataProfilesService = client.instantiationService.get(IUserDataProfilesService);
		const snippetsResource = joinPath((profile ?? userDataProfilesService.defaultProfile).snippetsHome, name);
		await fileService.writeFile(snippetsResource, VSBuffer.fromString(content));
	}

	async function removeSnippet(name: string, client: UserDataSyncClient): Promise<void> {
		const fileService = client.instantiationService.get(IFileService);
		const userDataProfilesService = client.instantiationService.get(IUserDataProfilesService);
		const snippetsResource = joinPath(userDataProfilesService.defaultProfile.snippetsHome, name);
		await fileService.del(snippetsResource);
	}

	async function readSnippet(name: string, client: UserDataSyncClient, profile?: IUserDataProfile): Promise<string | null> {
		const fileService = client.instantiationService.get(IFileService);
		const userDataProfilesService = client.instantiationService.get(IUserDataProfilesService);
		const snippetsResource = joinPath((profile ?? userDataProfilesService.defaultProfile).snippetsHome, name);
		if (await fileService.exists(snippetsResource)) {
			const content = await fileService.readFile(snippetsResource);
			return content.value.toString();
		}
		return null;
	}

	function assertPreviews(actual: IResourcePreview[], expected: URI[]) {
		assert.deepStrictEqual(actual.map(({ previewResource }) => previewResource.toString()), expected.map(uri => uri.toString()));
	}

});
