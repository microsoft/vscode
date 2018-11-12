/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { StorageLegacyScope, StorageLegacyService } from 'vs/platform/storage/common/storageLegacyService';
import { parseStorage } from 'vs/platform/storage/common/storageLegacyMigration';
import { URI } from 'vs/base/common/uri';
import { startsWith } from 'vs/base/common/strings';

suite('Storage Migration', () => {
	let storage = window.localStorage;

	setup(() => {
		storage.clear();
	});

	teardown(() => {
		storage.clear();
	});

	test('Parse Storage (Global)', () => {
		const service = createService();

		const parsed = parseStorage(storage);

		assert.equal(parsed.global.size, 4);
		assert.equal(parsed.global.get('key1'), service.get('key1'));
		assert.equal(parsed.global.get('key2.something'), service.get('key2.something'));
		assert.equal(parsed.global.get('key3/special'), service.get('key3/special'));
		assert.equal(parsed.global.get('key4 space'), service.get('key4 space'));
	});

	test('Parse Storage (mixed)', () => {

		// Fill the storage with multiple workspaces of all kinds (empty, root, folders)
		const workspaceIds = [

			// Multi Root Workspace
			URI.from({ path: '1500007676869', scheme: 'root' }).toString(),
			URI.from({ path: '2500007676869', scheme: 'root' }).toString(),
			URI.from({ path: '3500007676869', scheme: 'root' }).toString(),

			// Empty Workspace
			URI.from({ path: '4500007676869', scheme: 'empty' }).toString(),
			URI.from({ path: '5500007676869', scheme: 'empty' }).toString(),
			URI.from({ path: '6500007676869', scheme: 'empty' }).toString(),

			// Unix Paths
			URI.file('/some/folder/folder1').toString(),
			URI.file('/some/folder/folder2').toString(),
			URI.file('/some/folder/folder3').toString(),
			URI.file('/some/folder/folder1/sub1').toString(),
			URI.file('/some/folder/folder2/sub2').toString(),
			URI.file('/some/folder/folder3/sub3').toString(),

			// Windows Paths
			URI.file('c:\\some\\folder\\folder1').toString(),
			URI.file('c:\\some\\folder\\folder2').toString(),
			URI.file('c:\\some\\folder\\folder3').toString(),
			URI.file('c:\\some\\folder\\folder1\\sub1').toString(),
			URI.file('c:\\some\\folder\\folder2\\sub2').toString(),
			URI.file('c:\\some\\folder\\folder3\\sub3').toString(),

			// UNC Paths
			'file://localhost/c%3A/some/folder/folder1',
			'file://localhost/c%3A/some/folder/folder2',
			'file://localhost/c%3A/some/folder/folder3',
			'file://localhost/c%3A/some/folder/folder1/sub1',
			'file://localhost/c%3A/some/folder/folder2/sub2',
			'file://localhost/c%3A/some/folder/folder3/sub3'
		];

		const services = workspaceIds.map(id => createService(id));

		const parsed = parseStorage(storage);

		services.forEach((service, index) => {
			let expectedKeyCount = 4;
			let storageToTest;

			const workspaceId = workspaceIds[index];
			if (startsWith(workspaceId, 'file:')) {
				storageToTest = parsed.folder.get(workspaceId);
				expectedKeyCount++; // workspaceIdentifier gets added!
			} else if (startsWith(workspaceId, 'empty:')) {
				storageToTest = parsed.empty.get(workspaceId);
			} else if (startsWith(workspaceId, 'root:')) {
				storageToTest = parsed.multiRoot.get(workspaceId);
			}

			assert.equal(Object.keys(storageToTest).length, expectedKeyCount);
			assert.equal(storageToTest['key1'], service.get('key1', StorageLegacyScope.WORKSPACE));
			assert.equal(storageToTest['key2.something'], service.get('key2.something', StorageLegacyScope.WORKSPACE));
			assert.equal(storageToTest['key3/special'], service.get('key3/special', StorageLegacyScope.WORKSPACE));
			assert.equal(storageToTest['key4 space'], service.get('key4 space', StorageLegacyScope.WORKSPACE));
		});
	});

	test('Parse Storage (handle subfolders properly)', () => {
		const ws1 = URI.file('/some/folder/folder1').toString();
		const ws2 = URI.file('/some/folder/folder1/sub1').toString();

		const s1 = new StorageLegacyService(storage, storage, ws1, Date.now());
		const s2 = new StorageLegacyService(storage, storage, ws2, Date.now());

		s1.store('s1key1', 'value1', StorageLegacyScope.WORKSPACE);
		s1.store('s1key2.something', JSON.stringify({ foo: 'bar' }), StorageLegacyScope.WORKSPACE);
		s1.store('s1key3/special', true, StorageLegacyScope.WORKSPACE);
		s1.store('s1key4 space', 4, StorageLegacyScope.WORKSPACE);

		s2.store('s2key1', 'value1', StorageLegacyScope.WORKSPACE);
		s2.store('s2key2.something', JSON.stringify({ foo: 'bar' }), StorageLegacyScope.WORKSPACE);
		s2.store('s2key3/special', true, StorageLegacyScope.WORKSPACE);
		s2.store('s2key4 space', 4, StorageLegacyScope.WORKSPACE);

		const parsed = parseStorage(storage);

		const s1Storage = parsed.folder.get(ws1);
		assert.equal(Object.keys(s1Storage).length, 5);
		assert.equal(s1Storage['s1key1'], s1.get('s1key1', StorageLegacyScope.WORKSPACE));
		assert.equal(s1Storage['s1key2.something'], s1.get('s1key2.something', StorageLegacyScope.WORKSPACE));
		assert.equal(s1Storage['s1key3/special'], s1.get('s1key3/special', StorageLegacyScope.WORKSPACE));
		assert.equal(s1Storage['s1key4 space'], s1.get('s1key4 space', StorageLegacyScope.WORKSPACE));

		const s2Storage = parsed.folder.get(ws2);
		assert.equal(Object.keys(s2Storage).length, 5);
		assert.equal(s2Storage['s2key1'], s2.get('s2key1', StorageLegacyScope.WORKSPACE));
		assert.equal(s2Storage['s2key2.something'], s2.get('s2key2.something', StorageLegacyScope.WORKSPACE));
		assert.equal(s2Storage['s2key3/special'], s2.get('s2key3/special', StorageLegacyScope.WORKSPACE));
		assert.equal(s2Storage['s2key4 space'], s2.get('s2key4 space', StorageLegacyScope.WORKSPACE));
	});

	function createService(workspaceId?: string): StorageLegacyService {
		const service = new StorageLegacyService(storage, storage, workspaceId, workspaceId && startsWith(workspaceId, 'file:') ? Date.now() : void 0);

		// Unrelated
		storage.setItem('foo', 'bar');
		storage.setItem('storage://foo', 'bar');
		storage.setItem('storage://global/storage://foo', 'bar');

		// Global
		service.store('key1', 'value1');
		service.store('key2.something', JSON.stringify({ foo: 'bar' }));
		service.store('key3/special', true);
		service.store('key4 space', 4);

		// Workspace
		service.store('key1', 'value1', StorageLegacyScope.WORKSPACE);
		service.store('key2.something', JSON.stringify({ foo: 'bar' }), StorageLegacyScope.WORKSPACE);
		service.store('key3/special', true, StorageLegacyScope.WORKSPACE);
		service.store('key4 space', 4, StorageLegacyScope.WORKSPACE);

		return service;
	}
});