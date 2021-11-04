/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { Storage } from 'vs/base/parts/storage/common/storage';
import { flakySuite } from 'vs/base/test/common/testUtils';
import { runWithFakedTimers } from 'vs/base/test/common/timeTravelScheduler';
import { FileService } from 'vs/platform/files/common/fileService';
import { InMemoryFileSystemProvider } from 'vs/platform/files/common/inMemoryFilesystemProvider';
import { NullLogService } from 'vs/platform/log/common/log';
import { BrowserStorageService, IndexedDBStorageDatabase } from 'vs/platform/storage/browser/storageService';
import { StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { createSuite } from 'vs/platform/storage/test/common/storageService.test';

async function createStorageService(): Promise<[DisposableStore, BrowserStorageService]> {
	const disposables = new DisposableStore();
	const logService = new NullLogService();

	const fileService = disposables.add(new FileService(logService));

	const userDataProvider = disposables.add(new InMemoryFileSystemProvider());
	disposables.add(fileService.registerProvider(Schemas.userData, userDataProvider));

	const storageService = disposables.add(new BrowserStorageService({ id: 'workspace-storage-test' }, logService));

	await storageService.initialize();

	return [disposables, storageService];
}

flakySuite('StorageService (browser)', function () {
	const disposables = new DisposableStore();
	let storageService: BrowserStorageService;

	createSuite<BrowserStorageService>({
		setup: async () => {
			const res = await createStorageService();
			disposables.add(res[0]);
			storageService = res[1];

			return storageService;
		},
		teardown: async () => {
			await storageService.clear();
			disposables.clear();
		}
	});
});

flakySuite('StorageService (browser specific)', () => {
	const disposables = new DisposableStore();
	let storageService: BrowserStorageService;

	setup(async () => {
		const res = await createStorageService();
		disposables.add(res[0]);

		storageService = res[1];
	});

	teardown(async () => {
		await storageService.clear();
		disposables.clear();
	});

	test('clear', () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			storageService.store('bar', 'foo', StorageScope.GLOBAL, StorageTarget.MACHINE);
			storageService.store('bar', 3, StorageScope.GLOBAL, StorageTarget.USER);
			storageService.store('bar', 'foo', StorageScope.WORKSPACE, StorageTarget.MACHINE);
			storageService.store('bar', 3, StorageScope.WORKSPACE, StorageTarget.USER);

			await storageService.clear();

			for (const scope of [StorageScope.GLOBAL, StorageScope.WORKSPACE]) {
				for (const target of [StorageTarget.USER, StorageTarget.MACHINE]) {
					strictEqual(storageService.get('bar', scope), undefined);
					strictEqual(storageService.keys(scope, target).length, 0);
				}
			}
		});
	});
});

flakySuite('IndexDBStorageDatabase (browser)', () => {

	const id = 'workspace-storage-db-test';
	const logService = new NullLogService();

	teardown(async () => {
		const storage = await IndexedDBStorageDatabase.create({ id }, logService);
		await storage.clear();
	});

	test('Basics', async () => {
		let storage = new Storage(await IndexedDBStorageDatabase.create({ id }, logService));

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

		strictEqual(storage.size, 3);
		strictEqual(storage.items.size, 3);

		await storage.close();

		storage = new Storage(await IndexedDBStorageDatabase.create({ id }, logService));

		await storage.init();

		// Check initial data still there
		strictEqual(storage.get('bar'), 'foo');
		strictEqual(storage.get('barNumber'), '55');
		strictEqual(storage.get('barBoolean'), 'true');
		strictEqual(storage.get('barUndefined'), undefined);
		strictEqual(storage.get('barNull'), undefined);

		strictEqual(storage.size, 3);
		strictEqual(storage.items.size, 3);

		// Update data
		storage.set('bar', 'foo2');
		storage.set('barNumber', 552);

		strictEqual(storage.get('bar'), 'foo2');
		strictEqual(storage.get('barNumber'), '552');

		await storage.close();

		storage = new Storage(await IndexedDBStorageDatabase.create({ id }, logService));

		await storage.init();

		// Check initial data still there
		strictEqual(storage.get('bar'), 'foo2');
		strictEqual(storage.get('barNumber'), '552');
		strictEqual(storage.get('barBoolean'), 'true');
		strictEqual(storage.get('barUndefined'), undefined);
		strictEqual(storage.get('barNull'), undefined);

		strictEqual(storage.size, 3);
		strictEqual(storage.items.size, 3);

		// Delete data
		storage.delete('bar');
		storage.delete('barNumber');
		storage.delete('barBoolean');

		strictEqual(storage.get('bar', 'undefined'), 'undefined');
		strictEqual(storage.get('barNumber', 'undefinedNumber'), 'undefinedNumber');
		strictEqual(storage.get('barBoolean', 'undefinedBoolean'), 'undefinedBoolean');

		strictEqual(storage.size, 0);
		strictEqual(storage.items.size, 0);

		await storage.close();

		storage = new Storage(await IndexedDBStorageDatabase.create({ id }, logService));

		await storage.init();

		strictEqual(storage.get('bar', 'undefined'), 'undefined');
		strictEqual(storage.get('barNumber', 'undefinedNumber'), 'undefinedNumber');
		strictEqual(storage.get('barBoolean', 'undefinedBoolean'), 'undefinedBoolean');

		strictEqual(storage.size, 0);
		strictEqual(storage.items.size, 0);
	});

	test('Clear', async () => {
		let storage = new Storage(await IndexedDBStorageDatabase.create({ id }, logService));

		await storage.init();

		storage.set('bar', 'foo');
		storage.set('barNumber', 55);
		storage.set('barBoolean', true);

		await storage.close();

		const db = await IndexedDBStorageDatabase.create({ id }, logService);
		storage = new Storage(db);

		await storage.init();
		await db.clear();

		storage = new Storage(await IndexedDBStorageDatabase.create({ id }, logService));

		await storage.init();

		strictEqual(storage.get('bar'), undefined);
		strictEqual(storage.get('barNumber'), undefined);
		strictEqual(storage.get('barBoolean'), undefined);

		strictEqual(storage.size, 0);
		strictEqual(storage.items.size, 0);
	});

	test('Inserts and Deletes at the same time', async () => {
		let storage = new Storage(await IndexedDBStorageDatabase.create({ id }, logService));

		await storage.init();

		storage.set('bar', 'foo');
		storage.set('barNumber', 55);
		storage.set('barBoolean', true);

		await storage.close();

		storage = new Storage(await IndexedDBStorageDatabase.create({ id }, logService));

		await storage.init();

		storage.set('bar', 'foobar');
		const largeItem = JSON.stringify({ largeItem: 'Hello World'.repeat(1000) });
		storage.set('largeItem', largeItem);
		storage.delete('barNumber');
		storage.delete('barBoolean');

		await storage.close();

		storage = new Storage(await IndexedDBStorageDatabase.create({ id }, logService));

		await storage.init();

		strictEqual(storage.get('bar'), 'foobar');
		strictEqual(storage.get('largeItem'), largeItem);
		strictEqual(storage.get('barNumber'), undefined);
		strictEqual(storage.get('barBoolean'), undefined);
	});
});
