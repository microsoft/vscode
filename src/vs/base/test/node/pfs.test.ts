/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';

import assert = require('assert');
import os = require('os');

import path = require('path');
import fs = require('fs');

import uuid = require('vs/base/common/uuid');
import * as pfs from 'vs/base/node/pfs';

suite('PFS', () => {

	test('writeFile', function () {
		const id = uuid.generateUuid();
		const parentDir = path.join(os.tmpdir(), 'vsctests', id);
		const newDir = path.join(parentDir, 'pfs', id);
		const testFile = path.join(newDir, 'writefile.txt');

		return pfs.mkdirp(newDir, 493).then(() => {
			assert.ok(fs.existsSync(newDir));

			return pfs.writeFile(testFile, 'Hello World', null).then(() => {
				assert.equal(fs.readFileSync(testFile), 'Hello World');

				return pfs.del(parentDir, os.tmpdir());
			});
		});
	});

	test('writeFile - parallel write on different files works', function () {
		const id = uuid.generateUuid();
		const parentDir = path.join(os.tmpdir(), 'vsctests', id);
		const newDir = path.join(parentDir, 'pfs', id);
		const testFile1 = path.join(newDir, 'writefile1.txt');
		const testFile2 = path.join(newDir, 'writefile2.txt');
		const testFile3 = path.join(newDir, 'writefile3.txt');
		const testFile4 = path.join(newDir, 'writefile4.txt');
		const testFile5 = path.join(newDir, 'writefile5.txt');

		return pfs.mkdirp(newDir, 493).then(() => {
			assert.ok(fs.existsSync(newDir));

			return TPromise.join([
				pfs.writeFile(testFile1, 'Hello World 1', null),
				pfs.writeFile(testFile2, 'Hello World 2', null),
				pfs.writeFile(testFile3, 'Hello World 3', null),
				pfs.writeFile(testFile4, 'Hello World 4', null),
				pfs.writeFile(testFile5, 'Hello World 5', null)
			]).then(() => {
				assert.equal(fs.readFileSync(testFile1), 'Hello World 1');
				assert.equal(fs.readFileSync(testFile2), 'Hello World 2');
				assert.equal(fs.readFileSync(testFile3), 'Hello World 3');
				assert.equal(fs.readFileSync(testFile4), 'Hello World 4');
				assert.equal(fs.readFileSync(testFile5), 'Hello World 5');

				return pfs.del(parentDir, os.tmpdir());
			});
		});
	});

	test('writeFile - parallel write on same files works and is sequentalized', function () {
		const id = uuid.generateUuid();
		const parentDir = path.join(os.tmpdir(), 'vsctests', id);
		const newDir = path.join(parentDir, 'pfs', id);
		const testFile = path.join(newDir, 'writefile.txt');

		return pfs.mkdirp(newDir, 493).then(() => {
			assert.ok(fs.existsSync(newDir));

			return TPromise.join([
				pfs.writeFile(testFile, 'Hello World 1', null),
				pfs.writeFile(testFile, 'Hello World 2', null),
				TPromise.timeout(10).then(() => pfs.writeFile(testFile, 'Hello World 3', null)),
				pfs.writeFile(testFile, 'Hello World 4', null),
				TPromise.timeout(10).then(() => pfs.writeFile(testFile, 'Hello World 5', null))
			]).then(() => {
				assert.equal(fs.readFileSync(testFile), 'Hello World 5');

				return pfs.del(parentDir, os.tmpdir());
			});
		});
	});

	test('rimraf - simple', function () {
		const id = uuid.generateUuid();
		const parentDir = path.join(os.tmpdir(), 'vsctests', id);
		const newDir = path.join(parentDir, 'extfs', id);

		return pfs.mkdirp(newDir, 493).then(() => {
			fs.writeFileSync(path.join(newDir, 'somefile.txt'), 'Contents');
			fs.writeFileSync(path.join(newDir, 'someOtherFile.txt'), 'Contents');

			return pfs.rimraf(newDir).then(() => {
				assert.ok(!fs.existsSync(newDir));
			});
		});
	});

	test('rimraf - recursive folder structure', function () {
		const id = uuid.generateUuid();
		const parentDir = path.join(os.tmpdir(), 'vsctests', id);
		const newDir = path.join(parentDir, 'extfs', id);

		return pfs.mkdirp(newDir, 493).then(() => {
			fs.writeFileSync(path.join(newDir, 'somefile.txt'), 'Contents');
			fs.writeFileSync(path.join(newDir, 'someOtherFile.txt'), 'Contents');

			fs.mkdirSync(path.join(newDir, 'somefolder'));
			fs.writeFileSync(path.join(newDir, 'somefolder', 'somefile.txt'), 'Contents');

			return pfs.rimraf(newDir).then(() => {
				assert.ok(!fs.existsSync(newDir));
			});
		});
	});
});