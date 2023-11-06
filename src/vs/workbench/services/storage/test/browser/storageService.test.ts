/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { joinPath } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { IStorageChangeEvent, Storage } from 'vs/base/parts/storage/common/storage';
import { flakySuite } from 'vs/base/test/common/testUtils';
import { runWithFakedTimers } from 'vs/base/test/common/timeTravelScheduler';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { FileService } from 'vs/platform/files/common/fileService';
import { InMemoryFileSystemProvider } from 'vs/platform/files/common/inMemoryFilesystemProvider';
import { NullLogService } from 'vs/platform/log/common/log';
import { StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { createSuite } from 'vs/platform/storage/test/common/storageService.test';
import { IUserDataProfile } from 'vs/platform/userDataProfile/common/userDataProfile';
import { BrowserStorageService, IndexedDBStorageDatabase } from 'vs/workbench/services/storage/browser/storageService';
import { UserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfileService';

async function createStorageService(): Promise<[DisposableStore, BrowserStorageService]> {
	const disposables = new DisposableStore();
	const logService = new NullLogService();

	const fileService = disposables.add(new FileService(logService));

	const userDataProvider = disposables.add(new InMemoryFileSystemProvider());
	disposables.add(fileService.registerProvider(Schemas.vscodeUserData, userDataProvider));

	const profilesRoot = URI.file('/profiles').with({ scheme: Schemas.inMemory });

	const inMemoryExtraProfileRoot = joinPath(profilesRoot, 'extra');
	const inMemoryExtraProfile: IUserDataProfile = {
		id: 'id',
		name: 'inMemory',
		shortName: 'inMemory',
		isDefault: false,
		location: inMemoryExtraProfileRoot,
		globalStorageHome: joinPath(inMemoryExtraProfileRoot, 'globalStorageHome'),
		settingsResource: joinPath(inMemoryExtraProfileRoot, 'settingsResource'),
		keybindingsResource: joinPath(inMemoryExtraProfileRoot, 'keybindingsResource'),
		tasksResource: joinPath(inMemoryExtraProfileRoot, 'tasksResource'),
		snippetsHome: joinPath(inMemoryExtraProfileRoot, 'snippetsHome'),
		extensionsResource: joinPath(inMemoryExtraProfileRoot, 'extensionsResource'),
		cacheHome: joinPath(inMemoryExtraProfileRoot, 'cache')
	};

	const storageService = disposables.add(new BrowserStorageService({ id: 'workspace-storage-test' }, disposables.add(new UserDataProfileService(inMemoryExtraProfile)), logService));

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

	ensureNoDisposablesAreLeakedInTestSuite();
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

	test.skip('clear', () => { // slow test and also only ever being used as a developer action
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			storageService.store('bar', 'foo', StorageScope.APPLICATION, StorageTarget.MACHINE);
			storageService.store('bar', 3, StorageScope.APPLICATION, StorageTarget.USER);
			storageService.store('bar', 'foo', StorageScope.PROFILE, StorageTarget.MACHINE);
			storageService.store('bar', 3, StorageScope.PROFILE, StorageTarget.USER);
			storageService.store('bar', 'foo', StorageScope.WORKSPACE, StorageTarget.MACHINE);
			storageService.store('bar', 3, StorageScope.WORKSPACE, StorageTarget.USER);

			await storageService.clear();

			for (const scope of [StorageScope.APPLICATION, StorageScope.PROFILE, StorageScope.WORKSPACE]) {
				for (const target of [StorageTarget.USER, StorageTarget.MACHINE]) {
					strictEqual(storageService.get('bar', scope), undefined);
					strictEqual(storageService.keys(scope, target).length, 0);
				}
			}
		});
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});

flakySuite('IndexDBStorageDatabase (browser)', () => {

	const id = 'workspace-storage-db-test';
	const logService = new NullLogService();

	const disposables = new DisposableStore();

	teardown(async () => {
		const storage = disposables.add(await IndexedDBStorageDatabase.create({ id }, logService));
		await storage.clear();

		disposables.clear();
	});

	test('Basics', async () => {
		let storage = disposables.add(new Storage(disposables.add(await IndexedDBStorageDatabase.create({ id }, logService))));

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

		storage = disposables.add(new Storage(disposables.add(await IndexedDBStorageDatabase.create({ id }, logService))));

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

		storage = disposables.add(new Storage(disposables.add(await IndexedDBStorageDatabase.create({ id }, logService))));

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

		storage = disposables.add(new Storage(disposables.add(await IndexedDBStorageDatabase.create({ id }, logService))));

		await storage.init();

		strictEqual(storage.get('bar', 'undefined'), 'undefined');
		strictEqual(storage.get('barNumber', 'undefinedNumber'), 'undefinedNumber');
		strictEqual(storage.get('barBoolean', 'undefinedBoolean'), 'undefinedBoolean');

		strictEqual(storage.size, 0);
		strictEqual(storage.items.size, 0);
	});

	test('Clear', async () => {
		let storage = disposables.add(new Storage(disposables.add(await IndexedDBStorageDatabase.create({ id }, logService))));

		await storage.init();

		storage.set('bar', 'foo');
		storage.set('barNumber', 55);
		storage.set('barBoolean', true);

		await storage.close();

		const db = disposables.add(await IndexedDBStorageDatabase.create({ id }, logService));
		storage = disposables.add(new Storage(db));

		await storage.init();
		await db.clear();

		storage = disposables.add(new Storage(disposables.add(await IndexedDBStorageDatabase.create({ id }, logService))));

		await storage.init();

		strictEqual(storage.get('bar'), undefined);
		strictEqual(storage.get('barNumber'), undefined);
		strictEqual(storage.get('barBoolean'), undefined);

		strictEqual(storage.size, 0);
		strictEqual(storage.items.size, 0);
	});

	test('Inserts and Deletes at the same time', async () => {
		let storage = disposables.add(new Storage(disposables.add(await IndexedDBStorageDatabase.create({ id }, logService))));

		await storage.init();

		storage.set('bar', 'foo');
		storage.set('barNumber', 55);
		storage.set('barBoolean', true);

		await storage.close();

		storage = disposables.add(new Storage(disposables.add(await IndexedDBStorageDatabase.create({ id }, logService))));

		await storage.init();

		storage.set('bar', 'foobar');
		const largeItem = JSON.stringify({ largeItem: 'Hello World'.repeat(1000) });
		storage.set('largeItem', largeItem);
		storage.delete('barNumber');
		storage.delete('barBoolean');

		await storage.close();

		storage = disposables.add(new Storage(disposables.add(await IndexedDBStorageDatabase.create({ id }, logService))));

		await storage.init();

		strictEqual(storage.get('bar'), 'foobar');
		strictEqual(storage.get('largeItem'), largeItem);
		strictEqual(storage.get('barNumber'), undefined);
		strictEqual(storage.get('barBoolean'), undefined);
	});

	test('Storage change event', async () => {
		const storage = disposables.add(new Storage(disposables.add(await IndexedDBStorageDatabase.create({ id }, logService))));
		let storageChangeEvents: IStorageChangeEvent[] = [];
		disposables.add(storage.onDidChangeStorage(e => storageChangeEvents.push(e)));

		await storage.init();

		storage.set('notExternal', 42);
		let storageValueChangeEvent = storageChangeEvents.find(e => e.key === 'notExternal');
		strictEqual(storageValueChangeEvent?.external, false);
		storageChangeEvents = [];

		storage.set('isExternal', 42, true);
		storageValueChangeEvent = storageChangeEvents.find(e => e.key === 'isExternal');
		strictEqual(storageValueChangeEvent?.external, true);

		storage.delete('notExternal');
		storageValueChangeEvent = storageChangeEvents.find(e => e.key === 'notExternal');
		strictEqual(storageValueChangeEvent?.external, false);

		storage.delete('isExternal', true);
		storageValueChangeEvent = storageChangeEvents.find(e => e.key === 'isExternal');
		strictEqual(storageValueChangeEvent?.external, true);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
