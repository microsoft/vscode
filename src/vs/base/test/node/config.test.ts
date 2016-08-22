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
import {ConfigWatcher} from 'vs/base/node/config';

suite('Config', () => {

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
		const id = uuid.generateUuid();
		const parentDir = path.join(os.tmpdir(), 'vsctests', id);
		const newDir = path.join(parentDir, 'config', id);
		const testFile = path.join(newDir, 'config.json');

		extfs.mkdirp(newDir, 493, (error) => {
			fs.writeFileSync(testFile, '// my comment\n{ "foo": "bar" }');

			let watcher = new ConfigWatcher<{ foo: string; }>(testFile);

			let config = watcher.getConfig();
			assert.ok(config);
			assert.equal(config.foo, 'bar');
			assert.equal(watcher.getValue('foo'), 'bar');
			assert.equal(watcher.getValue('bar'), void 0);
			assert.equal(watcher.getValue('bar', 'fallback'), 'fallback');

			watcher.dispose();

			extfs.del(parentDir, os.tmpdir(), () => { }, done);
		});
	});

	test('watching', function (done: () => void) {
		const id = uuid.generateUuid();
		const parentDir = path.join(os.tmpdir(), 'vsctests', id);
		const newDir = path.join(parentDir, 'config', id);
		const testFile = path.join(newDir, 'config.json');

		extfs.mkdirp(newDir, 493, (error) => {
			fs.writeFileSync(testFile, '// my comment\n{ "foo": "bar" }');

			let watcher = new ConfigWatcher<{ foo: string; }>(testFile);

			setTimeout(function() {
				fs.writeFileSync(testFile, '// my comment\n{ "foo": "changed" }');
			}, 50);

			watcher.onDidUpdateConfiguration(event => {
				assert.ok(event);
				assert.equal(event.config.foo, 'changed');
				assert.equal(watcher.getValue('foo'), 'changed');

				watcher.dispose();

				extfs.del(parentDir, os.tmpdir(), () => { }, done);
			});

		});
	});
});