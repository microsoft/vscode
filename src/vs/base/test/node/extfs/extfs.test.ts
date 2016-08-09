/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import assert = require('assert');
import os = require('os');

import path = require('path');
import fs = require('fs');

import uuid = require('vs/base/common/uuid');
import strings = require('vs/base/common/strings');
import extfs = require('vs/base/node/extfs');

suite('Extfs', () => {

	test('mkdirp', function (done: () => void) {
		const id = uuid.generateUuid();
		const parentDir = path.join(os.tmpdir(), 'vsctests', id);
		const newDir = path.join(parentDir, 'extfs', id);

		extfs.mkdirp(newDir, 493, (error) => {
			assert.ok(!error);
			assert.ok(fs.existsSync(newDir));

			extfs.del(parentDir, os.tmpdir(), () => { }, done);
		}); // 493 = 0755
	});

	test('copy, move and delete', function (done: () => void) {
		const id = uuid.generateUuid();
		const id2 = uuid.generateUuid();
		const sourceDir = require.toUrl('./fixtures');
		const parentDir = path.join(os.tmpdir(), 'vsctests', 'extfs');
		const targetDir = path.join(parentDir, id);
		const targetDir2 = path.join(parentDir, id2);

		extfs.copy(sourceDir, targetDir, (error) => {
			assert.ok(!error);
			assert.ok(fs.existsSync(targetDir));
			assert.ok(fs.existsSync(path.join(targetDir, 'index.html')));
			assert.ok(fs.existsSync(path.join(targetDir, 'site.css')));
			assert.ok(fs.existsSync(path.join(targetDir, 'examples')));
			assert.ok(fs.statSync(path.join(targetDir, 'examples')).isDirectory());
			assert.ok(fs.existsSync(path.join(targetDir, 'examples', 'small.jxs')));

			extfs.mv(targetDir, targetDir2, (error) => {
				assert.ok(!error);
				assert.ok(!fs.existsSync(targetDir));
				assert.ok(fs.existsSync(targetDir2));
				assert.ok(fs.existsSync(path.join(targetDir2, 'index.html')));
				assert.ok(fs.existsSync(path.join(targetDir2, 'site.css')));
				assert.ok(fs.existsSync(path.join(targetDir2, 'examples')));
				assert.ok(fs.statSync(path.join(targetDir2, 'examples')).isDirectory());
				assert.ok(fs.existsSync(path.join(targetDir2, 'examples', 'small.jxs')));

				extfs.mv(path.join(targetDir2, 'index.html'), path.join(targetDir2, 'index_moved.html'), (error) => {
					assert.ok(!error);
					assert.ok(!fs.existsSync(path.join(targetDir2, 'index.html')));
					assert.ok(fs.existsSync(path.join(targetDir2, 'index_moved.html')));

					extfs.del(parentDir, os.tmpdir(), (error) => {
						assert.ok(!error);
					}, (error) => {
						assert.ok(!error);
						assert.ok(!fs.existsSync(parentDir));
						done();
					});
				});
			});
		});
	});

	test('readdir', function (done: () => void) {
		if (strings.canNormalize && typeof process.versions['electron'] !== 'undefined' /* needs electron */) {
			const id = uuid.generateUuid();
			const parentDir = path.join(os.tmpdir(), 'vsctests', id);
			const newDir = path.join(parentDir, 'extfs', id, 'öäü');

			extfs.mkdirp(newDir, 493, (error) => {
				assert.ok(!error);
				assert.ok(fs.existsSync(newDir));

				extfs.readdir(path.join(parentDir, 'extfs', id), (error, children) => {
					assert.equal(children.some(n => n === 'öäü'), true); // Mac always converts to NFD, so

					extfs.del(parentDir, os.tmpdir(), () => { }, done);
				});
			}); // 493 = 0755
		} else {
			done();
		}
	});

	test('writeFileAndFlush', function (done: () => void) {
		const id = uuid.generateUuid();
		const parentDir = path.join(os.tmpdir(), 'vsctests', id);
		const newDir = path.join(parentDir, 'extfs', id);
		const testFile = path.join(newDir, 'flushed.txt');

		extfs.mkdirp(newDir, 493, (error) => {
			assert.ok(!error);
			assert.ok(fs.existsSync(newDir));

			extfs.writeFileAndFlush(testFile, 'Hello World', null, (error) => {
				assert.ok(!error);
				assert.equal(fs.readFileSync(testFile), 'Hello World');

				const largeString = (new Array(100 * 1024)).join('Large String\n');

				extfs.writeFileAndFlush(testFile, largeString, null, (error) => {
					assert.ok(!error);
					assert.equal(fs.readFileSync(testFile), largeString);

					done();
				});
			});
		});
	});
});