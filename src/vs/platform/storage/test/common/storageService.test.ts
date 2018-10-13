/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { StorageScope } from 'vs/platform/storage/common/storage';
// tslint:disable-next-line:import-patterns
import { TestStorageService } from 'vs/workbench/test/workbenchTestServices';

suite('StorageService', () => {

	test('Remove Data', () => {
		let storage = new TestStorageService();
		storage.set('Monaco.IDE.Core.Storage.Test.remove', 'foobar', StorageScope.GLOBAL);
		assert.strictEqual('foobar', storage.get('Monaco.IDE.Core.Storage.Test.remove', StorageScope.GLOBAL));

		storage.delete('Monaco.IDE.Core.Storage.Test.remove', StorageScope.GLOBAL);
		assert.ok(!storage.get('Monaco.IDE.Core.Storage.Test.remove', StorageScope.GLOBAL));
	});

	test('Get Data, Integer, Boolean', () => {
		let storage = new TestStorageService();

		assert.strictEqual(storage.get('Monaco.IDE.Core.Storage.Test.get', StorageScope.GLOBAL, 'foobar'), 'foobar');
		assert.strictEqual(storage.get('Monaco.IDE.Core.Storage.Test.get', StorageScope.GLOBAL, ''), '');
		assert.strictEqual(storage.get('Monaco.IDE.Core.Storage.Test.getInteger', StorageScope.GLOBAL, 5), 5);
		assert.strictEqual(storage.get('Monaco.IDE.Core.Storage.Test.getInteger', StorageScope.GLOBAL, 0), 0);
		assert.strictEqual(storage.get('Monaco.IDE.Core.Storage.Test.getBoolean', StorageScope.GLOBAL, true), true);
		assert.strictEqual(storage.get('Monaco.IDE.Core.Storage.Test.getBoolean', StorageScope.GLOBAL, false), false);

		storage.set('Monaco.IDE.Core.Storage.Test.get', 'foobar', StorageScope.GLOBAL);
		assert.strictEqual(storage.get('Monaco.IDE.Core.Storage.Test.get', StorageScope.GLOBAL), 'foobar');

		storage.set('Monaco.IDE.Core.Storage.Test.get', '', StorageScope.GLOBAL);
		assert.strictEqual(storage.get('Monaco.IDE.Core.Storage.Test.get', StorageScope.GLOBAL), '');

		storage.set('Monaco.IDE.Core.Storage.Test.getInteger', 5, StorageScope.GLOBAL);
		assert.strictEqual(storage.getInteger('Monaco.IDE.Core.Storage.Test.getInteger', StorageScope.GLOBAL), 5);

		storage.set('Monaco.IDE.Core.Storage.Test.getInteger', 0, StorageScope.GLOBAL);
		assert.strictEqual(storage.getInteger('Monaco.IDE.Core.Storage.Test.getInteger', StorageScope.GLOBAL), 0);

		storage.set('Monaco.IDE.Core.Storage.Test.getBoolean', true, StorageScope.GLOBAL);
		assert.strictEqual(storage.getBoolean('Monaco.IDE.Core.Storage.Test.getBoolean', StorageScope.GLOBAL), true);

		storage.set('Monaco.IDE.Core.Storage.Test.getBoolean', false, StorageScope.GLOBAL);
		assert.strictEqual(storage.getBoolean('Monaco.IDE.Core.Storage.Test.getBoolean', StorageScope.GLOBAL), false);

		assert.strictEqual(storage.get('Monaco.IDE.Core.Storage.Test.getDefault', StorageScope.GLOBAL, 'getDefault'), 'getDefault');
		assert.strictEqual(storage.getInteger('Monaco.IDE.Core.Storage.Test.getIntegerDefault', StorageScope.GLOBAL, 5), 5);
		assert.strictEqual(storage.getBoolean('Monaco.IDE.Core.Storage.Test.getBooleanDefault', StorageScope.GLOBAL, true), true);
	});
});