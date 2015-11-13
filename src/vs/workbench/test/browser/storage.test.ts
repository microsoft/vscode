/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import {clone} from 'vs/base/common/objects';
import {StorageEventType, StorageScope} from 'vs/platform/storage/common/storage';
import {TestContextService, TestWorkspace} from 'vs/workbench/test/browser/servicesTestUtils';
import {Storage, InMemoryLocalStorage} from 'vs/workbench/browser/storage';

suite("Workbench Storage", () => {
	test("Store Data", () => {
		let context = new TestContextService();
		let s = new Storage(context, new InMemoryLocalStorage());

		let counter = 0;
		let unbind = s.addListener(StorageEventType.STORAGE, function(e) {
			assert.strictEqual(e.key, "Monaco.IDE.Core.Storage.Test.store");
			assert.strictEqual(e.oldValue, null);
			assert.strictEqual(e.newValue, "foobar");

			counter++;
			assert(counter <= 1);
		});

		s.store("Monaco.IDE.Core.Storage.Test.store", "foobar");
		s.store("Monaco.IDE.Core.Storage.Test.store", "foobar");
		unbind();

		counter = 0;
		unbind = s.addListener(StorageEventType.STORAGE, function(e) {
			assert.strictEqual(e.key, "Monaco.IDE.Core.Storage.Test.store");
			assert.strictEqual(e.oldValue, "foobar");
			assert.strictEqual(e.newValue, "barfoo");

			counter++;
			assert(counter <= 1);
		});

		s.store("Monaco.IDE.Core.Storage.Test.store", "barfoo");
		s.store("Monaco.IDE.Core.Storage.Test.store", "barfoo");
		unbind();

		s.dispose();
	});

	test("Swap Data", () => {
		let context = new TestContextService();
		let s = new Storage(context, new InMemoryLocalStorage());

		let counter = 0;
		let unbind = s.addListener(StorageEventType.STORAGE, function(e) {
			assert.strictEqual(e.key, "Monaco.IDE.Core.Storage.Test.swap");
			assert.strictEqual(e.oldValue, null);
			assert.strictEqual(e.newValue, "foobar");

			counter++;
			assert(counter <= 1);
		});

		s.swap("Monaco.IDE.Core.Storage.Test.swap", "foobar", "barfoo", StorageScope.GLOBAL, "foobar");
		unbind();

		counter = 0;
		unbind = s.addListener(StorageEventType.STORAGE, function(e) {
			assert.strictEqual(e.key, "Monaco.IDE.Core.Storage.Test.swap");
			assert.strictEqual(e.oldValue, "foobar");
			assert.strictEqual(e.newValue, "barfoo");

			counter++;
			assert(counter <= 1);
		});

		s.swap("Monaco.IDE.Core.Storage.Test.swap", "foobar", "barfoo", StorageScope.GLOBAL, "foobar");
		unbind();
	});

	test("Swap Data with undefined default value", () => {
		let context = new TestContextService();
		let s = new Storage(context, new InMemoryLocalStorage());

		s.swap("Monaco.IDE.Core.Storage.Test.swap", "foobar", "barfoo");
		assert.strictEqual("foobar", s.get("Monaco.IDE.Core.Storage.Test.swap"));
		s.swap("Monaco.IDE.Core.Storage.Test.swap", "foobar", "barfoo");
		assert.strictEqual("barfoo", s.get("Monaco.IDE.Core.Storage.Test.swap"));
		s.swap("Monaco.IDE.Core.Storage.Test.swap", "foobar", "barfoo");
		assert.strictEqual("foobar", s.get("Monaco.IDE.Core.Storage.Test.swap"));
	});

	test("Remove Data", () => {
		let context = new TestContextService();
		let s = new Storage(context, new InMemoryLocalStorage());

		let counter = 0;
		let unbind = s.addListener(StorageEventType.STORAGE, function(e) {
			assert.strictEqual(e.key, "Monaco.IDE.Core.Storage.Test.remove");
			assert.strictEqual(e.oldValue, null);
			assert.strictEqual(e.newValue, "foobar");

			counter++;
			assert(counter <= 1);
		});

		s.store("Monaco.IDE.Core.Storage.Test.remove", "foobar");
		unbind();

		counter = 0;
		unbind = s.addListener(StorageEventType.STORAGE, function(e) {
			assert.strictEqual(e.key, "Monaco.IDE.Core.Storage.Test.remove");
			assert.strictEqual(e.oldValue, "foobar");
			assert.strictEqual(e.newValue, null);

			counter++;
			assert(counter <= 1);
		});

		s.remove("Monaco.IDE.Core.Storage.Test.remove");
		unbind();
	});

	test("Get Data, Integer, Boolean", () => {
		let context = new TestContextService();
		let s = new Storage(context, new InMemoryLocalStorage());

		assert.strictEqual(s.get("Monaco.IDE.Core.Storage.Test.get", StorageScope.GLOBAL, "foobar"), "foobar");
		assert.strictEqual(s.get("Monaco.IDE.Core.Storage.Test.get", StorageScope.GLOBAL, ""), "");
		assert.strictEqual(s.get("Monaco.IDE.Core.Storage.Test.getInteger", StorageScope.GLOBAL, 5), 5);
		assert.strictEqual(s.get("Monaco.IDE.Core.Storage.Test.getInteger", StorageScope.GLOBAL, 0), 0);
		assert.strictEqual(s.get("Monaco.IDE.Core.Storage.Test.getBoolean", StorageScope.GLOBAL, true), true);
		assert.strictEqual(s.get("Monaco.IDE.Core.Storage.Test.getBoolean", StorageScope.GLOBAL, false), false);

		s.store("Monaco.IDE.Core.Storage.Test.get", "foobar");
		assert.strictEqual(s.get("Monaco.IDE.Core.Storage.Test.get"), "foobar");

		s.store("Monaco.IDE.Core.Storage.Test.get", "");
		assert.strictEqual(s.get("Monaco.IDE.Core.Storage.Test.get"), "");

		s.store("Monaco.IDE.Core.Storage.Test.getInteger", 5);
		assert.strictEqual(s.getInteger("Monaco.IDE.Core.Storage.Test.getInteger"), 5);

		s.store("Monaco.IDE.Core.Storage.Test.getInteger", 0);
		assert.strictEqual(s.getInteger("Monaco.IDE.Core.Storage.Test.getInteger"), 0);

		s.store("Monaco.IDE.Core.Storage.Test.getBoolean", true);
		assert.strictEqual(s.getBoolean("Monaco.IDE.Core.Storage.Test.getBoolean"), true);

		s.store("Monaco.IDE.Core.Storage.Test.getBoolean", false);
		assert.strictEqual(s.getBoolean("Monaco.IDE.Core.Storage.Test.getBoolean"), false);

		assert.strictEqual(s.get("Monaco.IDE.Core.Storage.Test.getDefault", StorageScope.GLOBAL, "getDefault"), "getDefault");
		assert.strictEqual(s.getInteger("Monaco.IDE.Core.Storage.Test.getIntegerDefault", StorageScope.GLOBAL, 5), 5);
		assert.strictEqual(s.getBoolean("Monaco.IDE.Core.Storage.Test.getBooleanDefault", StorageScope.GLOBAL, true), true);
	});

	test("Storage cleans up when workspace changes", () => {
		let storageImpl = new InMemoryLocalStorage();
		let context = new TestContextService();
		let s = new Storage(context, storageImpl);

		s.store("key1", "foobar");
		s.store("key2", "something");
		s.store("wkey1", "foo", StorageScope.WORKSPACE);
		s.store("wkey2", "foo2", StorageScope.WORKSPACE);

		s = new Storage(context, storageImpl);

		assert.strictEqual(s.get("key1", StorageScope.GLOBAL), "foobar");
		assert.strictEqual(s.get("key1", StorageScope.WORKSPACE, null), null);

		assert.strictEqual(s.get("key2", StorageScope.GLOBAL), "something");
		assert.strictEqual(s.get("wkey1", StorageScope.WORKSPACE), "foo");
		assert.strictEqual(s.get("wkey2", StorageScope.WORKSPACE), "foo2");

		let ws: any = clone(TestWorkspace);
		ws.uid = new Date().getTime() + 100;
		context = new TestContextService(ws);
		s = new Storage(context, storageImpl);

		assert.strictEqual(s.get("key1", StorageScope.GLOBAL), "foobar");
		assert.strictEqual(s.get("key1", StorageScope.WORKSPACE, null), null);

		assert.strictEqual(s.get("key2", StorageScope.GLOBAL), "something");
		assert(!s.get("wkey1", StorageScope.WORKSPACE));
		assert(!s.get("wkey2", StorageScope.WORKSPACE));
	});
});