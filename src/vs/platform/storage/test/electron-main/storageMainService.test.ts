/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises } from 'fs';
import { tmpdir } from 'os';
import { strictEqual } from 'assert';
import { URI } from 'vs/base/common/uri';
import { rimraf } from 'vs/base/node/pfs';
import { flakySuite, getRandomTestPath } from 'vs/base/test/node/testUtils';
import { OPTIONS, parseArgs } from 'vs/platform/environment/node/argv';
import { NativeEnvironmentService } from 'vs/platform/environment/node/environmentService';
import { NullLogService } from 'vs/platform/log/common/log';
import { IStorageMainService, StorageMainService } from 'vs/platform/storage/electron-main/storageMainService';
import { instanceStorageKey } from 'vs/platform/telemetry/common/telemetry';
import { IStorageChangeEvent, IStorageMain } from 'vs/platform/storage/electron-main/storageMain';
import { generateUuid } from 'vs/base/common/uuid';
import { isWindows } from 'vs/base/common/platform';

flakySuite('StorageMainService (native)', function () {

	class StorageTestEnvironmentService extends NativeEnvironmentService {

		constructor(private globalStorageFolderPath: URI, private _extensionsPath: string) {
			super(parseArgs(process.argv, OPTIONS));
		}

		get globalStorageHome(): URI {
			return this.globalStorageFolderPath;
		}

		get extensionsPath(): string {
			return this._extensionsPath;
		}
	}

	let testDir: string;
	let storageMainService: IStorageMainService;

	setup(async () => {
		testDir = getRandomTestPath(tmpdir(), 'vsctests', 'storageMainService');

		await promises.mkdir(testDir, { recursive: true });

		storageMainService = new StorageMainService(new NullLogService(), new StorageTestEnvironmentService(URI.file(testDir), testDir));
	});

	teardown(async () => {
		await storageMainService.globalStorage.close();

		return rimraf(testDir);
	});

	async function testStorage(storage: IStorageMain, isGlobal: boolean): Promise<void> {

		// Telemetry: added after init
		if (isGlobal) {
			strictEqual(storage.items.size, 0);
			strictEqual(storage.get(instanceStorageKey), undefined);
			await storage.initialize();
			strictEqual(typeof storage.get(instanceStorageKey), 'string');
		}

		let storageChangeEvent: IStorageChangeEvent | undefined = undefined;
		const storageChangeListener = storage.onDidChangeStorage(e => {
			storageChangeEvent = e;
		});

		let storageDidClose = false;
		const storageCloseListener = storage.onDidCloseStorage(() => storageDidClose = true);

		// Basic store/get/remove
		const size = storage.items.size;

		storage.store('bar', 'foo');
		strictEqual(storageChangeEvent!.key, 'bar');
		storage.store('barNumber', 55);
		storage.store('barBoolean', true);

		strictEqual(storage.get('bar'), 'foo');
		strictEqual(storage.getNumber('barNumber'), 55);
		strictEqual(storage.getBoolean('barBoolean'), true);

		strictEqual(storage.items.size, size + 3);

		storage.remove('bar');
		strictEqual(storage.get('bar'), undefined);

		strictEqual(storage.items.size, size + 2);

		// Close
		await storage.close();

		strictEqual(storageDidClose, true);

		storageChangeListener.dispose();
		storageCloseListener.dispose();
	}

	test('basics (global)', function () {
		return testStorage(storageMainService.globalStorage, true);
	});

	test('basics (workspace)', function () {
		return testStorage(storageMainService.workspaceStorage({ id: generateUuid(), uri: URI.file(isWindows ? 'C:\\testWorkspace' : '/testWorkspace') }), false);
	});
});
