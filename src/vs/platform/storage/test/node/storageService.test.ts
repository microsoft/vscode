/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual, ok, equal } from 'assert';
import { StorageScope } from 'vs/platform/storage/common/storage';
import { TestStorageService, TestEnvironmentService } from 'vs/workbench/test/workbenchTestServices';
import { StorageService } from 'vs/platform/storage/node/storageService';
import { generateUuid } from 'vs/base/common/uuid';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirp, del } from 'vs/base/node/pfs';
import { NullLogService } from 'vs/platform/log/common/log';

suite('StorageService', () => {

	test('Remove Data (global, in-memory)', () => {
		removeData(StorageScope.GLOBAL);
	});

	test('Remove Data (workspace, in-memory)', () => {
		removeData(StorageScope.WORKSPACE);
	});

	function removeData(scope: StorageScope): void {
		const storage = new TestStorageService();

		storage.store('Monaco.IDE.Core.Storage.Test.remove', 'foobar', scope);
		strictEqual('foobar', storage.get('Monaco.IDE.Core.Storage.Test.remove', scope));

		storage.remove('Monaco.IDE.Core.Storage.Test.remove', scope);
		ok(!storage.get('Monaco.IDE.Core.Storage.Test.remove', scope));
	}

	test('Get Data, Integer, Boolean (global, in-memory)', () => {
		storeData(StorageScope.GLOBAL);
	});

	test('Get Data, Integer, Boolean (workspace, in-memory)', () => {
		storeData(StorageScope.WORKSPACE);
	});

	function storeData(scope: StorageScope): void {
		const storage = new TestStorageService();

		strictEqual(storage.get('Monaco.IDE.Core.Storage.Test.get', scope, 'foobar'), 'foobar');
		strictEqual(storage.get('Monaco.IDE.Core.Storage.Test.get', scope, ''), '');
		strictEqual(storage.getInteger('Monaco.IDE.Core.Storage.Test.getInteger', scope, 5), 5);
		strictEqual(storage.getInteger('Monaco.IDE.Core.Storage.Test.getInteger', scope, 0), 0);
		strictEqual(storage.getBoolean('Monaco.IDE.Core.Storage.Test.getBoolean', scope, true), true);
		strictEqual(storage.getBoolean('Monaco.IDE.Core.Storage.Test.getBoolean', scope, false), false);

		storage.store('Monaco.IDE.Core.Storage.Test.get', 'foobar', scope);
		strictEqual(storage.get('Monaco.IDE.Core.Storage.Test.get', scope), 'foobar');

		storage.store('Monaco.IDE.Core.Storage.Test.get', '', scope);
		strictEqual(storage.get('Monaco.IDE.Core.Storage.Test.get', scope), '');

		storage.store('Monaco.IDE.Core.Storage.Test.getInteger', 5, scope);
		strictEqual(storage.getInteger('Monaco.IDE.Core.Storage.Test.getInteger', scope), 5);

		storage.store('Monaco.IDE.Core.Storage.Test.getInteger', 0, scope);
		strictEqual(storage.getInteger('Monaco.IDE.Core.Storage.Test.getInteger', scope), 0);

		storage.store('Monaco.IDE.Core.Storage.Test.getBoolean', true, scope);
		strictEqual(storage.getBoolean('Monaco.IDE.Core.Storage.Test.getBoolean', scope), true);

		storage.store('Monaco.IDE.Core.Storage.Test.getBoolean', false, scope);
		strictEqual(storage.getBoolean('Monaco.IDE.Core.Storage.Test.getBoolean', scope), false);

		strictEqual(storage.get('Monaco.IDE.Core.Storage.Test.getDefault', scope, 'getDefault'), 'getDefault');
		strictEqual(storage.getInteger('Monaco.IDE.Core.Storage.Test.getIntegerDefault', scope, 5), 5);
		strictEqual(storage.getBoolean('Monaco.IDE.Core.Storage.Test.getBooleanDefault', scope, true), true);
	}

	function uniqueStorageDir(): string {
		const id = generateUuid();

		return join(tmpdir(), 'vsctests', id, 'storage2', id);
	}

	test('Migrate Data', async () => {
		const storageDir = uniqueStorageDir();
		await mkdirp(storageDir);

		const storage = new StorageService(join(storageDir, 'storage.db'), false, new NullLogService(), TestEnvironmentService);
		await storage.init();

		storage.store('bar', 'foo', StorageScope.WORKSPACE);
		storage.store('barNumber', 55, StorageScope.WORKSPACE);
		storage.store('barBoolean', true, StorageScope.GLOBAL);

		const newStorageDir = uniqueStorageDir();
		await mkdirp(newStorageDir);

		await storage.migrate(newStorageDir);

		equal(storage.get('bar', StorageScope.WORKSPACE), 'foo');
		equal(storage.getInteger('barNumber', StorageScope.WORKSPACE), 55);
		equal(storage.getBoolean('barBoolean', StorageScope.GLOBAL), true);

		await storage.close();
		await del(newStorageDir, tmpdir());
		await del(storageDir, tmpdir());
	});
});