/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { BrowserStorageService, IndexedDBStorageDatabase } from 'vs/platform/storage/browser/storageService';
import { NullLogService } from 'vs/platform/log/common/log';
import { Storage } from 'vs/base/parts/storage/common/storage';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { createSuite } from 'vs/platform/storage/test/common/storageService.test';
import { flakySuite } from 'vs/base/test/common/testUtils';
import { FileService } from 'vs/platform/files/common/fileService';
import { InMemoryFileSystemProvider } from 'vs/platform/files/common/inMemoryFilesystemProvider';
import { Schemas } from 'vs/base/common/network';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { URI } from 'vs/base/common/uri';

flakySuite('StorageService (browser)', function () {

	const disposables = new DisposableStore();
	let storageService: BrowserStorageService;

	createSuite<BrowserStorageService>({
		setup: async () => {
			const logService = new NullLogService();

			const fileService = disposables.add(new FileService(logService));

			const userDataProvider = disposables.add(new InMemoryFileSystemProvider());
			disposables.add(fileService.registerProvider(Schemas.userData, userDataProvider));

			storageService = disposables.add(new BrowserStorageService({ id: 'workspace-storage-test' }, logService, { userRoamingDataHome: URI.file('/User').with({ scheme: Schemas.userData }) } as unknown as IEnvironmentService, fileService));

			await storageService.initialize();

			return storageService;
		},
		teardown: async () => {
			await storageService.clear();
			disposables.clear();
		}
	});
});

flakySuite('IndexDBStorageDatabase (browser)', () => {

	const id = 'workspace-storage-db-test';
	const logService = new NullLogService();

	teardown(async () => {
		const storage = await IndexedDBStorageDatabase.create(id, logService);
		await storage.clear();
	});

	test('Basics', async () => {
		let storage = new Storage(await IndexedDBStorageDatabase.create(id, logService));

		await storage.init();

		// Insert initial data
		storage.set('bar', 'foo');
		storage.set('barNumber', 55);
		storage.set('barBoolean', true);
		storage.set('barUndefined', undefined);
		storage.set('barNull', null);

		strictEqual(storage.get('bar'), 'foo');
		strictEqual(storage.get('barNumber'), '55');
		strictEqual(storage.get('barBoolean'), 'true');
		strictEqual(storage.get('barUndefined'), undefined);
		strictEqual(storage.get('barNull'), undefined);

		await storage.close();

		storage = new Storage(await IndexedDBStorageDatabase.create(id, logService));

		await storage.init();

		// Check initial data still there
		strictEqual(storage.get('bar'), 'foo');
		strictEqual(storage.get('barNumber'), '55');
		strictEqual(storage.get('barBoolean'), 'true');
		strictEqual(storage.get('barUndefined'), undefined);
		strictEqual(storage.get('barNull'), undefined);

		// Update data
		storage.set('bar', 'foo2');
		storage.set('barNumber', 552);

		strictEqual(storage.get('bar'), 'foo2');
		strictEqual(storage.get('barNumber'), '552');

		await storage.close();

		storage = new Storage(await IndexedDBStorageDatabase.create(id, logService));

		await storage.init();

		// Check initial data still there
		strictEqual(storage.get('bar'), 'foo2');
		strictEqual(storage.get('barNumber'), '552');
		strictEqual(storage.get('barBoolean'), 'true');
		strictEqual(storage.get('barUndefined'), undefined);
		strictEqual(storage.get('barNull'), undefined);

		// Delete data
		storage.delete('bar');
		storage.delete('barNumber');
		storage.delete('barBoolean');

		strictEqual(storage.get('bar', 'undefined'), 'undefined');
		strictEqual(storage.get('barNumber', 'undefinedNumber'), 'undefinedNumber');
		strictEqual(storage.get('barBoolean', 'undefinedBoolean'), 'undefinedBoolean');

		await storage.close();

		storage = new Storage(await IndexedDBStorageDatabase.create(id, logService));

		await storage.init();

		strictEqual(storage.get('bar', 'undefined'), 'undefined');
		strictEqual(storage.get('barNumber', 'undefinedNumber'), 'undefinedNumber');
		strictEqual(storage.get('barBoolean', 'undefinedBoolean'), 'undefinedBoolean');
	});

	test('Inserts and Deletes at the same time', async () => {
		let storage = new Storage(await IndexedDBStorageDatabase.create(id, logService));

		await storage.init();

		storage.set('bar', 'foo');
		storage.set('barNumber', 55);
		storage.set('barBoolean', true);

		await storage.close();

		storage = new Storage(await IndexedDBStorageDatabase.create(id, logService));

		await storage.init();

		storage.set('bar', 'foobar');
		const largeItem = JSON.stringify({ largeItem: 'Hello World'.repeat(1000) });
		storage.set('largeItem', largeItem);
		storage.delete('barNumber');
		storage.delete('barBoolean');

		await storage.close();

		storage = new Storage(await IndexedDBStorageDatabase.create(id, logService));

		await storage.init();

		strictEqual(storage.get('bar'), 'foobar');
		strictEqual(storage.get('largeItem'), largeItem);
		strictEqual(storage.get('barNumber'), undefined);
		strictEqual(storage.get('barBoolean'), undefined);
	});
});
