/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual, ok } from 'assert';
import { StorageScope, InMemoryStorageService, StorageTarget } from 'vs/platform/storage/common/storage';

suite('StorageService', function () {

	test('Get Data, Integer, Boolean (global, in-memory)', () => {
		storeData(StorageScope.GLOBAL);
	});

	test('Get Data, Integer, Boolean (workspace, in-memory)', () => {
		storeData(StorageScope.WORKSPACE);
	});

	function storeData(scope: StorageScope): void {
		const storage = new InMemoryStorageService();

		strictEqual(storage.get('test.get', scope, 'foobar'), 'foobar');
		strictEqual(storage.get('test.get', scope, ''), '');
		strictEqual(storage.getNumber('test.getNumber', scope, 5), 5);
		strictEqual(storage.getNumber('test.getNumber', scope, 0), 0);
		strictEqual(storage.getBoolean('test.getBoolean', scope, true), true);
		strictEqual(storage.getBoolean('test.getBoolean', scope, false), false);

		storage.store('test.get', 'foobar', scope);
		strictEqual(storage.get('test.get', scope, (undefined)!), 'foobar');

		storage.store('test.get', '', scope);
		strictEqual(storage.get('test.get', scope, (undefined)!), '');

		storage.store('test.getNumber', 5, scope);
		strictEqual(storage.getNumber('test.getNumber', scope, (undefined)!), 5);

		storage.store('test.getNumber', 0, scope);
		strictEqual(storage.getNumber('test.getNumber', scope, (undefined)!), 0);

		storage.store('test.getBoolean', true, scope);
		strictEqual(storage.getBoolean('test.getBoolean', scope, (undefined)!), true);

		storage.store('test.getBoolean', false, scope);
		strictEqual(storage.getBoolean('test.getBoolean', scope, (undefined)!), false);

		strictEqual(storage.get('test.getDefault', scope, 'getDefault'), 'getDefault');
		strictEqual(storage.getNumber('test.getNumberDefault', scope, 5), 5);
		strictEqual(storage.getBoolean('test.getBooleanDefault', scope, true), true);
	}

	test('Remove Data (global, in-memory)', () => {
		removeData(StorageScope.GLOBAL);
	});

	test('Remove Data (workspace, in-memory)', () => {
		removeData(StorageScope.WORKSPACE);
	});

	function removeData(scope: StorageScope): void {
		const storage = new InMemoryStorageService();

		storage.store('test.remove', 'foobar', scope);
		strictEqual('foobar', storage.get('test.remove', scope, (undefined)!));

		storage.remove('test.remove', scope);
		ok(!storage.get('test.remove', scope, (undefined)!));
	}

	test('Keys (in-memory)', () => {
		const storage = new InMemoryStorageService();

		// Empty
		for (const scope of [StorageScope.WORKSPACE, StorageScope.GLOBAL]) {
			for (const target of [StorageTarget.MACHINE, StorageTarget.USER]) {
				strictEqual(storage.keys(scope, target).length, 0);
			}
		}

		// Add values
		for (const scope of [StorageScope.WORKSPACE, StorageScope.GLOBAL]) {
			for (const target of [StorageTarget.MACHINE, StorageTarget.USER]) {
				storage.store2('test.target1', 'value1', scope, target);
				strictEqual(storage.keys(scope, target).length, 1);

				storage.store2('test.target1', 'otherValue1', scope, target);
				strictEqual(storage.keys(scope, target).length, 1);

				storage.store2('test.target2', 'value2', scope, target);
				storage.store2('test.target3', 'value3', scope, target);

				strictEqual(storage.keys(scope, target).length, 3);
			}
		}

		// Remove values
		for (const scope of [StorageScope.WORKSPACE, StorageScope.GLOBAL]) {
			for (const target of [StorageTarget.MACHINE, StorageTarget.USER]) {
				const keysLength = storage.keys(scope, target).length;

				storage.store2('test.target4', 'value1', scope, target);
				strictEqual(storage.keys(scope, target).length, keysLength + 1);

				storage.remove('test.target4', scope);
				strictEqual(storage.keys(scope, target).length, keysLength);
			}
		}

		// Remove all
		for (const scope of [StorageScope.WORKSPACE, StorageScope.GLOBAL]) {
			for (const target of [StorageTarget.MACHINE, StorageTarget.USER]) {
				const keys = storage.keys(scope, target);

				for (const key of keys) {
					storage.remove(key, scope);
				}

				strictEqual(storage.keys(scope, target).length, 0);
			}
		}

		// Adding undefined or null removes value
		for (const scope of [StorageScope.WORKSPACE, StorageScope.GLOBAL]) {
			for (const target of [StorageTarget.MACHINE, StorageTarget.USER]) {
				storage.store2('test.target1', 'value1', scope, target);
				strictEqual(storage.keys(scope, target).length, 1);

				storage.store2('test.target1', undefined, scope, target);
				strictEqual(storage.keys(scope, target).length, 0);

				storage.store2('test.target1', '', scope, target);
				strictEqual(storage.keys(scope, target).length, 1);

				storage.store2('test.target1', null, scope, target);
				strictEqual(storage.keys(scope, target).length, 0);
			}
		}
	});
});
