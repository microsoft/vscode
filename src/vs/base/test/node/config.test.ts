/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import assert = require('assert');
import os = require('os');

import path = require('path');
import fs = require('fs');
import extfs = require('vs/base/node/extfs');
import uuid = require('vs/base/common/uuid');
import { ConfigWatcher } from 'vs/base/node/config';
import { onError } from 'vs/base/test/common/utils';

suite('Config', () => {

	function testFile(callback: (error: Error, path: string, cleanUp: (callback: () => void) => void) => void): void {
		const id = uuid.generateUuid();
		const parentDir = path.join(os.tmpdir(), 'vsctests', id);
		const newDir = path.join(parentDir, 'config', id);
		const testFile = path.join(newDir, 'config.json');

		extfs.mkdirp(newDir, 493, error => {
			callback(error, testFile, (callback) => extfs.del(parentDir, os.tmpdir(), () => { }, callback));
		});
	}

	test('defaults', function () {
		const id = uuid.generateUuid();
		const parentDir = path.join(os.tmpdir(), 'vsctests', id);
		const newDir = path.join(parentDir, 'config', id);
		const testFile = path.join(newDir, 'config.json');

		let watcher = new ConfigWatcher(testFile);

		let config = watcher.getConfig();
		assert.ok(config);
		assert.equal(Object.keys(config), 0);

		watcher.dispose();

		let watcher2 = new ConfigWatcher<any[]>(testFile, { defaultConfig: ['foo'] });

		let config2 = watcher2.getConfig();
		assert.ok(Array.isArray(config2));
		assert.equal(config2.length, 1);

		watcher.dispose();
	});

	test('getConfig / getValue', function (done: () => void) {
		testFile((error, testFile, cleanUp) => {
			if (error) {
				return onError(error, done);
			}

			fs.writeFileSync(testFile, '// my comment\n{ "foo": "bar" }');

			let watcher = new ConfigWatcher<{ foo: string; }>(testFile);

			let config = watcher.getConfig();
			assert.ok(config);
			assert.equal(config.foo, 'bar');
			assert.equal(watcher.getValue('foo'), 'bar');
			assert.equal(watcher.getValue('bar'), void 0);
			assert.equal(watcher.getValue('bar', 'fallback'), 'fallback');
			assert.ok(!watcher.hasParseErrors);

			watcher.dispose();

			cleanUp(done);
		});
	});

	test('getConfig / getValue - broken JSON', function (done: () => void) {
		testFile((error, testFile, cleanUp) => {
			if (error) {
				return onError(error, done);
			}

			fs.writeFileSync(testFile, '// my comment\n "foo": "bar ... ');

			let watcher = new ConfigWatcher<{ foo: string; }>(testFile);

			let config = watcher.getConfig();
			assert.ok(config);
			assert.ok(!config.foo);

			assert.ok(watcher.hasParseErrors);

			watcher.dispose();

			cleanUp(done);
		});
	});

	test('watching', function (done: () => void) {
		testFile((error, testFile, cleanUp) => {
			if (error) {
				return onError(error, done);
			}

			fs.writeFileSync(testFile, '// my comment\n{ "foo": "bar" }');

			let watcher = new ConfigWatcher<{ foo: string; }>(testFile);
			watcher.getConfig(); // ensure we are in sync

			fs.writeFileSync(testFile, '// my comment\n{ "foo": "changed" }');

			watcher.onDidUpdateConfiguration(event => {
				assert.ok(event);
				assert.equal(event.config.foo, 'changed');
				assert.equal(watcher.getValue('foo'), 'changed');

				watcher.dispose();

				cleanUp(done);
			});

		});
	});

	test('watching also works when file created later', function (done: () => void) {
		testFile((error, testFile, cleanUp) => {
			if (error) {
				return onError(error, done);
			}

			let watcher = new ConfigWatcher<{ foo: string; }>(testFile);
			watcher.getConfig(); // ensure we are in sync

			fs.writeFileSync(testFile, '// my comment\n{ "foo": "changed" }');

			watcher.onDidUpdateConfiguration(event => {
				assert.ok(event);
				assert.equal(event.config.foo, 'changed');
				assert.equal(watcher.getValue('foo'), 'changed');

				watcher.dispose();

				cleanUp(done);
			});

		});
	});

	test('watching detects the config file getting deleted', function (done: () => void) {
		testFile((error, testFile, cleanUp) => {
			if (error) {
				return onError(error, done);
			}

			fs.writeFileSync(testFile, '// my comment\n{ "foo": "bar" }');

			let watcher = new ConfigWatcher<{ foo: string; }>(testFile);
			watcher.getConfig(); // ensure we are in sync

			watcher.onDidUpdateConfiguration(event => {
				assert.ok(event);

				watcher.dispose();

				cleanUp(done);
			});

			fs.unlinkSync(testFile);
		});
	});

	test('reload', function (done: () => void) {
		testFile((error, testFile, cleanUp) => {
			if (error) {
				return onError(error, done);
			}

			fs.writeFileSync(testFile, '// my comment\n{ "foo": "bar" }');

			let watcher = new ConfigWatcher<{ foo: string; }>(testFile, { changeBufferDelay: 100 });
			watcher.getConfig(); // ensure we are in sync

			fs.writeFileSync(testFile, '// my comment\n{ "foo": "changed" }');

			// still old values because change is not bubbling yet
			assert.equal(watcher.getConfig().foo, 'bar');
			assert.equal(watcher.getValue('foo'), 'bar');

			// force a load from disk
			watcher.reload(config => {
				assert.equal(config.foo, 'changed');
				assert.equal(watcher.getConfig().foo, 'changed');
				assert.equal(watcher.getValue('foo'), 'changed');

				watcher.dispose();

				cleanUp(done);
			});
		});
	});
});