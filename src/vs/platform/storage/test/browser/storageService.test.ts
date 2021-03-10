/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { BrowserStorageService, FileStorageDatabase } from 'vs/platform/storage/browser/storageService';
import { NullLogService } from 'vs/platform/log/common/log';
import { Storage } from 'vs/base/parts/storage/common/storage';
import { URI } from 'vs/base/common/uri';
import { FileService } from 'vs/platform/files/common/fileService';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { InMemoryFileSystemProvider } from 'vs/platform/files/common/inMemoryFilesystemProvider';
import { createSuite } from 'vs/platform/storage/test/common/storageService.test';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

suite('StorageService (browser)', function () {

	const disposables = new DisposableStore();
	let storageService: BrowserStorageService;

	createSuite<BrowserStorageService>({
		setup: async () => {
			const logService = new NullLogService();

			const fileService = disposables.add(new FileService(logService));

			const userDataProvider = disposables.add(new InMemoryFileSystemProvider());
			disposables.add(fileService.registerProvider(Schemas.userData, userDataProvider));

			storageService = disposables.add(new BrowserStorageService({ id: String(Date.now()) }, { userRoamingDataHome: URI.file('/User').with({ scheme: Schemas.userData }) } as unknown as IEnvironmentService, fileService));

			await storageService.initialize();

			return storageService;
		},
		teardown: async storage => {
			await storageService.flush();
			disposables.clear();
		}
	});
});

suite('FileStorageDatabase (browser)', () => {

	let fileService: FileService;

	const disposables = new DisposableStore();

	setup(async () => {
		const logService = new NullLogService();

		fileService = disposables.add(new FileService(logService));

		const userDataProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(Schemas.userData, userDataProvider));
	});

	teardown(() => {
		disposables.clear();
	});

	test('Basics', async () => {
		const testDir = URI.file('/User/storage.json').with({ scheme: Schemas.userData });

		let storage = new Storage(new FileStorageDatabase(testDir, false, fileService));

		await storage.init();

		storage.set('bar', 'foo');
		storage.set('barNumber', 55);
		storage.set('barBoolean', true);

		strictEqual(storage.get('bar'), 'foo');
		strictEqual(storage.get('barNumber'), '55');
		strictEqual(storage.get('barBoolean'), 'true');

		await storage.close();

		storage = new Storage(new FileStorageDatabase(testDir, false, fileService));

		await storage.init();

		strictEqual(storage.get('bar'), 'foo');
		strictEqual(storage.get('barNumber'), '55');
		strictEqual(storage.get('barBoolean'), 'true');

		storage.delete('bar');
		storage.delete('barNumber');
		storage.delete('barBoolean');

		strictEqual(storage.get('bar', 'undefined'), 'undefined');
		strictEqual(storage.get('barNumber', 'undefinedNumber'), 'undefinedNumber');
		strictEqual(storage.get('barBoolean', 'undefinedBoolean'), 'undefinedBoolean');

		await storage.close();

		storage = new Storage(new FileStorageDatabase(testDir, false, fileService));

		await storage.init();

		strictEqual(storage.get('bar', 'undefined'), 'undefined');
		strictEqual(storage.get('barNumber', 'undefinedNumber'), 'undefinedNumber');
		strictEqual(storage.get('barBoolean', 'undefinedBoolean'), 'undefinedBoolean');
	});
});
