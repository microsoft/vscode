/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import {clone} from 'vs/base/common/objects';
import {StorageScope} from 'vs/platform/storage/common/storage';
import {TestContextService, TestWorkspace} from 'vs/test/utils/servicesTestUtils';
import {Storage, InMemoryLocalStorage} from 'vs/workbench/common/storage';

suite('Workbench Storage', () => {

	test('Swap Data with undefined default value', () => {
		let context = new TestContextService();
		let s = new Storage(new InMemoryLocalStorage(), null, context);

		s.swap('Monaco.IDE.Core.Storage.Test.swap', 'foobar', 'barfoo');
		assert.strictEqual('foobar', s.get('Monaco.IDE.Core.Storage.Test.swap'));
		s.swap('Monaco.IDE.Core.Storage.Test.swap', 'foobar', 'barfoo');
		assert.strictEqual('barfoo', s.get('Monaco.IDE.Core.Storage.Test.swap'));
		s.swap('Monaco.IDE.Core.Storage.Test.swap', 'foobar', 'barfoo');
		assert.strictEqual('foobar', s.get('Monaco.IDE.Core.Storage.Test.swap'));
	});

	test('Remove Data', () => {
		let context = new TestContextService();
		let s = new Storage(new InMemoryLocalStorage(), null, context);
		s.store('Monaco.IDE.Core.Storage.Test.remove', 'foobar');
		assert.strictEqual('foobar', s.get('Monaco.IDE.Core.Storage.Test.remove'));

		s.remove('Monaco.IDE.Core.Storage.Test.remove');
		assert.ok(!s.get('Monaco.IDE.Core.Storage.Test.remove'));
	});

	test('Get Data, Integer, Boolean', () => {
		let context = new TestContextService();
		let s = new Storage(new InMemoryLocalStorage(), null, context);

		assert.strictEqual(s.get('Monaco.IDE.Core.Storage.Test.get', StorageScope.GLOBAL, 'foobar'), 'foobar');
		assert.strictEqual(s.get('Monaco.IDE.Core.Storage.Test.get', StorageScope.GLOBAL, ''), '');
		assert.strictEqual(s.get('Monaco.IDE.Core.Storage.Test.getInteger', StorageScope.GLOBAL, 5), 5);
		assert.strictEqual(s.get('Monaco.IDE.Core.Storage.Test.getInteger', StorageScope.GLOBAL, 0), 0);
		assert.strictEqual(s.get('Monaco.IDE.Core.Storage.Test.getBoolean', StorageScope.GLOBAL, true), true);
		assert.strictEqual(s.get('Monaco.IDE.Core.Storage.Test.getBoolean', StorageScope.GLOBAL, false), false);

		s.store('Monaco.IDE.Core.Storage.Test.get', 'foobar');
		assert.strictEqual(s.get('Monaco.IDE.Core.Storage.Test.get'), 'foobar');

		s.store('Monaco.IDE.Core.Storage.Test.get', '');
		assert.strictEqual(s.get('Monaco.IDE.Core.Storage.Test.get'), '');

		s.store('Monaco.IDE.Core.Storage.Test.getInteger', 5);
		assert.strictEqual(s.getInteger('Monaco.IDE.Core.Storage.Test.getInteger'), 5);

		s.store('Monaco.IDE.Core.Storage.Test.getInteger', 0);
		assert.strictEqual(s.getInteger('Monaco.IDE.Core.Storage.Test.getInteger'), 0);

		s.store('Monaco.IDE.Core.Storage.Test.getBoolean', true);
		assert.strictEqual(s.getBoolean('Monaco.IDE.Core.Storage.Test.getBoolean'), true);

		s.store('Monaco.IDE.Core.Storage.Test.getBoolean', false);
		assert.strictEqual(s.getBoolean('Monaco.IDE.Core.Storage.Test.getBoolean'), false);

		assert.strictEqual(s.get('Monaco.IDE.Core.Storage.Test.getDefault', StorageScope.GLOBAL, 'getDefault'), 'getDefault');
		assert.strictEqual(s.getInteger('Monaco.IDE.Core.Storage.Test.getIntegerDefault', StorageScope.GLOBAL, 5), 5);
		assert.strictEqual(s.getBoolean('Monaco.IDE.Core.Storage.Test.getBooleanDefault', StorageScope.GLOBAL, true), true);
	});

	test('Storage cleans up when workspace changes', () => {
		let storageImpl = new InMemoryLocalStorage();
		let context = new TestContextService();
		let s = new Storage(storageImpl, null, context);

		s.store('key1', 'foobar');
		s.store('key2', 'something');
		s.store('wkey1', 'foo', StorageScope.WORKSPACE);
		s.store('wkey2', 'foo2', StorageScope.WORKSPACE);

		s = new Storage(storageImpl, null, context);

		assert.strictEqual(s.get('key1', StorageScope.GLOBAL), 'foobar');
		assert.strictEqual(s.get('key1', StorageScope.WORKSPACE, null), null);

		assert.strictEqual(s.get('key2', StorageScope.GLOBAL), 'something');
		assert.strictEqual(s.get('wkey1', StorageScope.WORKSPACE), 'foo');
		assert.strictEqual(s.get('wkey2', StorageScope.WORKSPACE), 'foo2');

		let ws: any = clone(TestWorkspace);
		ws.uid = new Date().getTime() + 100;
		context = new TestContextService(ws);
		s = new Storage(storageImpl, null, context);

		assert.strictEqual(s.get('key1', StorageScope.GLOBAL), 'foobar');
		assert.strictEqual(s.get('key1', StorageScope.WORKSPACE, null), null);

		assert.strictEqual(s.get('key2', StorageScope.GLOBAL), 'something');
		assert(!s.get('wkey1', StorageScope.WORKSPACE));
		assert(!s.get('wkey2', StorageScope.WORKSPACE));
	});
});