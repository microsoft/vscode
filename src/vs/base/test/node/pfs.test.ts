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
import extfs = require('vs/base/node/extfs');
import { onError } from 'vs/base/test/common/utils';
import * as pfs from 'vs/base/node/pfs';

suite('PFS', () => {

	test('writeFile', function (done: () => void) {
		const id = uuid.generateUuid();
		const parentDir = path.join(os.tmpdir(), 'vsctests', id);
		const newDir = path.join(parentDir, 'pfs', id);
		const testFile = path.join(newDir, 'writefile.txt');

		extfs.mkdirp(newDir, 493, (error) => {
			if (error) {
				return onError(error, done);
			}

			assert.ok(fs.existsSync(newDir));

			pfs.writeFile(testFile, 'Hello World', null).done(() => {
				assert.equal(fs.readFileSync(testFile), 'Hello World');

				extfs.del(parentDir, os.tmpdir(), () => { }, done);
			}, error => onError(error, done));
		});
	});

	test('writeFile - parallel write on different files works', function (done: () => void) {
		const id = uuid.generateUuid();
		const parentDir = path.join(os.tmpdir(), 'vsctests', id);
		const newDir = path.join(parentDir, 'pfs', id);
		const testFile1 = path.join(newDir, 'writefile1.txt');
		const testFile2 = path.join(newDir, 'writefile2.txt');
		const testFile3 = path.join(newDir, 'writefile3.txt');
		const testFile4 = path.join(newDir, 'writefile4.txt');
		const testFile5 = path.join(newDir, 'writefile5.txt');

		extfs.mkdirp(newDir, 493, (error) => {
			if (error) {
				return onError(error, done);
			}

			assert.ok(fs.existsSync(newDir));

			TPromise.join([
				pfs.writeFile(testFile1, 'Hello World 1', null),
				pfs.writeFile(testFile2, 'Hello World 2', null),
				pfs.writeFile(testFile3, 'Hello World 3', null),
				pfs.writeFile(testFile4, 'Hello World 4', null),
				pfs.writeFile(testFile5, 'Hello World 5', null)
			]).done(() => {
				assert.equal(fs.readFileSync(testFile1), 'Hello World 1');
				assert.equal(fs.readFileSync(testFile2), 'Hello World 2');
				assert.equal(fs.readFileSync(testFile3), 'Hello World 3');
				assert.equal(fs.readFileSync(testFile4), 'Hello World 4');
				assert.equal(fs.readFileSync(testFile5), 'Hello World 5');

				extfs.del(parentDir, os.tmpdir(), () => { }, done);
			}, error => onError(error, done));
		});
	});

	test('writeFile - parallel write on same files works and is sequentalized', function (done: () => void) {
		const id = uuid.generateUuid();
		const parentDir = path.join(os.tmpdir(), 'vsctests', id);
		const newDir = path.join(parentDir, 'pfs', id);
		const testFile = path.join(newDir, 'writefile.txt');

		extfs.mkdirp(newDir, 493, (error) => {
			if (error) {
				return onError(error, done);
			}

			assert.ok(fs.existsSync(newDir));

			TPromise.join([
				pfs.writeFile(testFile, 'Hello World 1', null),
				pfs.writeFile(testFile, 'Hello World 2', null),
				TPromise.timeout(10).then(() => pfs.writeFile(testFile, 'Hello World 3', null)),
				pfs.writeFile(testFile, 'Hello World 4', null),
				TPromise.timeout(10).then(() => pfs.writeFile(testFile, 'Hello World 5', null))
			]).done(() => {
				assert.equal(fs.readFileSync(testFile), 'Hello World 5');

				extfs.del(parentDir, os.tmpdir(), () => { }, done);
			}, error => onError(error, done));
		});
	});

	test('rimraf - simple', function (done: () => void) {
		const id = uuid.generateUuid();
		const parentDir = path.join(os.tmpdir(), 'vsctests', id);
		const newDir = path.join(parentDir, 'extfs', id);

		extfs.mkdirp(newDir, 493, (error) => {
			if (error) {
				return onError(error, done);
			}

			fs.writeFileSync(path.join(newDir, 'somefile.txt'), 'Contents');
			fs.writeFileSync(path.join(newDir, 'someOtherFile.txt'), 'Contents');

			pfs.rimraf(newDir).then(() => {
				assert.ok(!fs.existsSync(newDir));
				done();
			}, error => onError(error, done));
		}); // 493 = 0755
	});

	test('rimraf - recursive folder structure', function (done: () => void) {
		const id = uuid.generateUuid();
		const parentDir = path.join(os.tmpdir(), 'vsctests', id);
		const newDir = path.join(parentDir, 'extfs', id);

		extfs.mkdirp(newDir, 493, (error) => {
			if (error) {
				return onError(error, done);
			}

			fs.writeFileSync(path.join(newDir, 'somefile.txt'), 'Contents');
			fs.writeFileSync(path.join(newDir, 'someOtherFile.txt'), 'Contents');

			fs.mkdirSync(path.join(newDir, 'somefolder'));
			fs.writeFileSync(path.join(newDir, 'somefolder', 'somefile.txt'), 'Contents');

			pfs.rimraf(newDir).then(() => {
				assert.ok(!fs.existsSync(newDir));
				done();
			}, error => onError(error, done));
		}); // 493 = 0755
	});
});