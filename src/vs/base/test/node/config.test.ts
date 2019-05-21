/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as os from 'os';

import * as path from 'vs/base/common/path';
import * as fs from 'fs';
import * as uuid from 'vs/base/common/uuid';
import { ConfigWatcher } from 'vs/base/node/config';
import { testFile } from 'vs/base/test/node/utils';

suite('Config', () => {

	test('defaults', () => {
		const id = uuid.generateUuid();
		const parentDir = path.join(os.tmpdir(), 'vsctests', id);
		const newDir = path.join(parentDir, 'config', id);
		const testFile = path.join(newDir, 'config.json');

		let watcher = new ConfigWatcher<{}>(testFile);

		let config = watcher.getConfig();
		assert.ok(config);
		assert.equal(Object.keys(config), 0);

		watcher.dispose();

		let watcher2 = new ConfigWatcher<any[]>(testFile, { defaultConfig: ['foo'], onError: console.error });

		let config2 = watcher2.getConfig();
		assert.ok(Array.isArray(config2));
		assert.equal(config2.length, 1);

		watcher.dispose();
	});

	test('getConfig / getValue', function () {
		return testFile('config', 'config.json').then(res => {
			fs.writeFileSync(res.testFile, '// my comment\n{ "foo": "bar" }');

			let watcher = new ConfigWatcher<{ foo: string; }>(res.testFile);

			let config = watcher.getConfig();
			assert.ok(config);
			assert.equal(config.foo, 'bar');
			assert.ok(!watcher.hasParseErrors);

			watcher.dispose();

			return res.cleanUp();
		});
	});

	test('getConfig / getValue - broken JSON', function () {
		return testFile('config', 'config.json').then(res => {
			fs.writeFileSync(res.testFile, '// my comment\n "foo": "bar ... ');

			let watcher = new ConfigWatcher<{ foo: string; }>(res.testFile);

			let config = watcher.getConfig();
			assert.ok(config);
			assert.ok(!config.foo);

			assert.ok(watcher.hasParseErrors);

			watcher.dispose();

			return res.cleanUp();
		});
	});

	// test('watching', function (done) {
	// 	this.timeout(10000); // watching is timing intense

	// 	testFile('config', 'config.json').then(res => {
	// 		fs.writeFileSync(res.testFile, '// my comment\n{ "foo": "bar" }');

	// 		let watcher = new ConfigWatcher<{ foo: string; }>(res.testFile);
	// 		watcher.getConfig(); // ensure we are in sync

	// 		fs.writeFileSync(res.testFile, '// my comment\n{ "foo": "changed" }');

	// 		watcher.onDidUpdateConfiguration(event => {
	// 			assert.ok(event);
	// 			assert.equal(event.config.foo, 'changed');
	// 			assert.equal(watcher.getValue('foo'), 'changed');

	// 			watcher.dispose();

	// 			res.cleanUp().then(done, done);
	// 		});
	// 	}, done);
	// });

	// test('watching also works when file created later', function (done) {
	// 	this.timeout(10000); // watching is timing intense

	// 	testFile('config', 'config.json').then(res => {
	// 		let watcher = new ConfigWatcher<{ foo: string; }>(res.testFile);
	// 		watcher.getConfig(); // ensure we are in sync

	// 		fs.writeFileSync(res.testFile, '// my comment\n{ "foo": "changed" }');

	// 		watcher.onDidUpdateConfiguration(event => {
	// 			assert.ok(event);
	// 			assert.equal(event.config.foo, 'changed');
	// 			assert.equal(watcher.getValue('foo'), 'changed');

	// 			watcher.dispose();

	// 			res.cleanUp().then(done, done);
	// 		});
	// 	}, done);
	// });

	// test('watching detects the config file getting deleted', function (done) {
	// 	this.timeout(10000); // watching is timing intense

	// 	testFile('config', 'config.json').then(res => {
	// 		fs.writeFileSync(res.testFile, '// my comment\n{ "foo": "bar" }');

	// 		let watcher = new ConfigWatcher<{ foo: string; }>(res.testFile);
	// 		watcher.getConfig(); // ensure we are in sync

	// 		watcher.onDidUpdateConfiguration(event => {
	// 			assert.ok(event);

	// 			watcher.dispose();

	// 			res.cleanUp().then(done, done);
	// 		});

	// 		fs.unlinkSync(res.testFile);
	// 	}, done);
	// });

	test('reload', function (done) {
		testFile('config', 'config.json').then(res => {
			fs.writeFileSync(res.testFile, '// my comment\n{ "foo": "bar" }');

			let watcher = new ConfigWatcher<{ foo: string; }>(res.testFile, { changeBufferDelay: 100, onError: console.error, defaultConfig: { foo: 'bar' } });
			watcher.getConfig(); // ensure we are in sync

			fs.writeFileSync(res.testFile, '// my comment\n{ "foo": "changed" }');

			// still old values because change is not bubbling yet
			assert.equal(watcher.getConfig().foo, 'bar');

			// force a load from disk
			watcher.reload(config => {
				assert.equal(config.foo, 'changed');
				assert.equal(watcher.getConfig().foo, 'changed');

				watcher.dispose();

				res.cleanUp().then(done, done);
			});
		}, done);
	});
});