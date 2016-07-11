/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import {BaseWorkspaceContextService} from 'vs/platform/workspace/common/baseWorkspaceContextService';
import {StorageScope} from 'vs/platform/storage/common/storage';
import * as TestUtils from 'vs/test/utils/servicesTestUtils';
import {Memento, Scope} from 'vs/workbench/common/memento';
import {Storage, InMemoryLocalStorage} from 'vs/workbench/common/storage';

suite('Workbench Memento', () => {
	let context;
	let storage;

	setup(() => {
		context = new BaseWorkspaceContextService(TestUtils.TestWorkspace, TestUtils.TestConfiguration, null);
		storage = new Storage(new InMemoryLocalStorage(), null, context);
	});

	test('Loading and Saving Memento with Scopes', () => {
		let myMemento = new Memento('memento.test');

		// Global
		let memento = myMemento.getMemento(storage);
		memento.foo = [1, 2, 3];
		let globalMemento = myMemento.getMemento(storage, Scope.GLOBAL);
		assert.deepEqual(globalMemento, memento);

		// Workspace
		memento = myMemento.getMemento(storage, Scope.WORKSPACE);
		assert(memento);
		memento.foo = 'Hello World';

		myMemento.saveMemento();

		// Global
		memento = myMemento.getMemento(storage);
		assert.deepEqual(memento, { foo: [1, 2, 3] });
		globalMemento = myMemento.getMemento(storage, Scope.GLOBAL);
		assert.deepEqual(globalMemento, memento);

		// Workspace
		memento = myMemento.getMemento(storage, Scope.WORKSPACE);
		assert.deepEqual(memento, { foo: 'Hello World' });

		// Assert the Mementos are stored properly in storage
		assert.deepEqual(JSON.parse(storage.get('memento/memento.test')), { foo: [1, 2, 3] });

		assert.deepEqual(JSON.parse(storage.get('memento/memento.test', StorageScope.WORKSPACE)), { foo: 'Hello World' });

		// Delete Global
		memento = myMemento.getMemento(storage, context);
		delete memento.foo;

		// Delete Workspace
		memento = myMemento.getMemento(storage, Scope.WORKSPACE);
		delete memento.foo;

		myMemento.saveMemento();

		// Global
		memento = myMemento.getMemento(storage, context);
		assert.deepEqual(memento, {});

		// Workspace
		memento = myMemento.getMemento(storage, Scope.WORKSPACE);
		assert.deepEqual(memento, {});

		// Assert the Mementos are also removed from storage
		assert.strictEqual(storage.get('memento/memento.test', Scope.GLOBAL, null), null);

		assert.strictEqual(storage.get('memento/memento.test', Scope.WORKSPACE, null), null);
	});

	test('Save and Load', () => {
		let myMemento = new Memento('memento.test');

		// Global
		let memento = myMemento.getMemento(storage, context);
		memento.foo = [1, 2, 3];

		// Workspace
		memento = myMemento.getMemento(storage, Scope.WORKSPACE);
		assert(memento);
		memento.foo = 'Hello World';

		myMemento.saveMemento();

		// Global
		memento = myMemento.getMemento(storage, context);
		assert.deepEqual(memento, { foo: [1, 2, 3] });
		let globalMemento = myMemento.getMemento(storage, Scope.GLOBAL);
		assert.deepEqual(globalMemento, memento);

		// Workspace
		memento = myMemento.getMemento(storage, Scope.WORKSPACE);
		assert.deepEqual(memento, { foo: 'Hello World' });

		// Global
		memento = myMemento.getMemento(storage, context);
		memento.foo = [4, 5, 6];

		// Workspace
		memento = myMemento.getMemento(storage, Scope.WORKSPACE);
		assert(memento);
		memento.foo = 'World Hello';

		myMemento.saveMemento();

		// Global
		memento = myMemento.getMemento(storage, context);
		assert.deepEqual(memento, { foo: [4, 5, 6] });
		globalMemento = myMemento.getMemento(storage, Scope.GLOBAL);
		assert.deepEqual(globalMemento, memento);

		// Workspace
		memento = myMemento.getMemento(storage, Scope.WORKSPACE);
		assert.deepEqual(memento, { foo: 'World Hello' });

		// Delete Global
		memento = myMemento.getMemento(storage, context);
		delete memento.foo;

		// Delete Workspace
		memento = myMemento.getMemento(storage, Scope.WORKSPACE);
		delete memento.foo;

		myMemento.saveMemento();

		// Global
		memento = myMemento.getMemento(storage, context);
		assert.deepEqual(memento, {});

		// Workspace
		memento = myMemento.getMemento(storage, Scope.WORKSPACE);
		assert.deepEqual(memento, {});
	});

	test('Save and Load - 2 Components with same id', () => {
		let myMemento = new Memento('memento.test');
		let myMemento2 = new Memento('memento.test');

		// Global
		let memento = myMemento.getMemento(storage, context);
		memento.foo = [1, 2, 3];

		memento = myMemento2.getMemento(storage, context);
		memento.bar = [1, 2, 3];

		// Workspace
		memento = myMemento.getMemento(storage, Scope.WORKSPACE);
		assert(memento);
		memento.foo = 'Hello World';

		memento = myMemento2.getMemento(storage, Scope.WORKSPACE);
		assert(memento);
		memento.bar = 'Hello World';

		myMemento.saveMemento();
		myMemento2.saveMemento();

		// Global
		memento = myMemento.getMemento(storage, context);
		assert.deepEqual(memento, { foo: [1, 2, 3], bar: [1, 2, 3] });
		let globalMemento = myMemento.getMemento(storage, Scope.GLOBAL);
		assert.deepEqual(globalMemento, memento);

		memento = myMemento2.getMemento(storage, context);
		assert.deepEqual(memento, { foo: [1, 2, 3], bar: [1, 2, 3] });
		globalMemento = myMemento2.getMemento(storage, Scope.GLOBAL);
		assert.deepEqual(globalMemento, memento);

		// Workspace
		memento = myMemento.getMemento(storage, Scope.WORKSPACE);
		assert.deepEqual(memento, { foo: 'Hello World', bar: 'Hello World' });

		memento = myMemento2.getMemento(storage, Scope.WORKSPACE);
		assert.deepEqual(memento, { foo: 'Hello World', bar: 'Hello World' });
	});
});