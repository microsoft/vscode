/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { NativeStorageService } from 'vs/platform/storage/node/storageService';
import { tmpdir } from 'os';
import { promises } from 'fs';
import { rimraf } from 'vs/base/node/pfs';
import { NullLogService } from 'vs/platform/log/common/log';
import { NativeEnvironmentService } from 'vs/platform/environment/node/environmentService';
import { parseArgs, OPTIONS } from 'vs/platform/environment/node/argv';
import { InMemoryStorageDatabase } from 'vs/base/parts/storage/common/storage';
import { URI } from 'vs/base/common/uri';
import { flakySuite, getRandomTestPath } from 'vs/base/test/node/testUtils';

flakySuite('NativeStorageService', function () {

	let testDir: string;

	setup(() => {
		testDir = getRandomTestPath(tmpdir(), 'vsctests', 'storageservice');

		return promises.mkdir(testDir, { recursive: true });
	});

	teardown(() => {
		return rimraf(testDir);
	});

	test('Migrate Data', async function () {

		class StorageTestEnvironmentService extends NativeEnvironmentService {

			constructor(private workspaceStorageFolderPath: URI, private _extensionsPath: string) {
				super(parseArgs(process.argv, OPTIONS));
			}

			get workspaceStorageHome(): URI {
				return this.workspaceStorageFolderPath;
			}

			get extensionsPath(): string {
				return this._extensionsPath;
			}
		}

		const storage = new NativeStorageService(new InMemoryStorageDatabase(), new NullLogService(), new StorageTestEnvironmentService(URI.file(testDir), testDir));
		await storage.initialize({ id: String(Date.now()) });

		storage.store('bar', 'foo', StorageScope.WORKSPACE, StorageTarget.MACHINE);
		storage.store('barNumber', 55, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		storage.store('barBoolean', true, StorageScope.GLOBAL, StorageTarget.MACHINE);

		strictEqual(storage.get('bar', StorageScope.WORKSPACE), 'foo');
		strictEqual(storage.getNumber('barNumber', StorageScope.WORKSPACE), 55);
		strictEqual(storage.getBoolean('barBoolean', StorageScope.GLOBAL), true);

		await storage.migrate({ id: String(Date.now() + 100) });

		strictEqual(storage.get('bar', StorageScope.WORKSPACE), 'foo');
		strictEqual(storage.getNumber('barNumber', StorageScope.WORKSPACE), 55);
		strictEqual(storage.getBoolean('barBoolean', StorageScope.GLOBAL), true);

		await storage.close();
	});
});
