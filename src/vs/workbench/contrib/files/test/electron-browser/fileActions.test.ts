/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { incrementFileName } from 'vs/workbench/contrib/files/browser/fileActions';

suite('Files - Increment file name', () => {

	test('Increment file name without any version', function () {
		const name = 'test.js';
		const result = incrementFileName(name, false);
		assert.strictEqual(result, 'test copy.js');
	});

	test('Increment file name with suffix version', function () {
		const name = 'test copy.js';
		const result = incrementFileName(name, false);
		assert.strictEqual(result, 'test copy 2.js');
	});

	test('Increment file name with suffix version with leading zeros', function () {
		const name = 'test copy 005.js';
		const result = incrementFileName(name, false);
		assert.strictEqual(result, 'test copy 6.js');
	});

	test('Increment file name with suffix version, too big number', function () {
		const name = 'test copy 9007199254740992.js';
		const result = incrementFileName(name, false);
		assert.strictEqual(result, 'test copy 9007199254740992 copy.js');
	});

	test('Increment file name with just version in name', function () {
		const name = 'copy.js';
		const result = incrementFileName(name, false);
		assert.strictEqual(result, 'copy copy.js');
	});

	test('Increment file name with just version in name, v2', function () {
		const name = 'copy 2.js';
		const result = incrementFileName(name, false);
		assert.strictEqual(result, 'copy 2 copy.js');
	});

	test('Increment file name without any extension or version', function () {
		const name = 'test';
		const result = incrementFileName(name, false);
		assert.strictEqual(result, 'test copy');
	});

	test('Increment file name without any extension or version, trailing dot', function () {
		const name = 'test.';
		const result = incrementFileName(name, false);
		assert.strictEqual(result, 'test copy.');
	});

	test('Increment file name without any extension or version, leading dot', function () {
		const name = '.test';
		const result = incrementFileName(name, false);
		assert.strictEqual(result, '.test copy');
	});

	test('Increment file name without any extension or version, leading dot v2', function () {
		const name = '..test';
		const result = incrementFileName(name, false);
		assert.strictEqual(result, '. copy.test');
	});

	test('Increment file name without any extension but with suffix version', function () {
		const name = 'test copy 5';
		const result = incrementFileName(name, false);
		assert.strictEqual(result, 'test copy 6');
	});

	test('Increment folder name without any version', function () {
		const name = 'test';
		const result = incrementFileName(name, true);
		assert.strictEqual(result, 'test copy');
	});

	test('Increment folder name with suffix version', function () {
		const name = 'test copy';
		const result = incrementFileName(name, true);
		assert.strictEqual(result, 'test copy 2');
	});

	test('Increment folder name with suffix version, leading zeros', function () {
		const name = 'test copy 005';
		const result = incrementFileName(name, true);
		assert.strictEqual(result, 'test copy 6');
	});

	test('Increment folder name with suffix version, too big number', function () {
		const name = 'test copy 9007199254740992';
		const result = incrementFileName(name, true);
		assert.strictEqual(result, 'test copy 9007199254740992 copy');
	});

	test('Increment folder name with just version in name', function () {
		const name = 'copy';
		const result = incrementFileName(name, true);
		assert.strictEqual(result, 'copy copy');
	});

	test('Increment folder name with just version in name, v2', function () {
		const name = 'copy 2';
		const result = incrementFileName(name, true);
		assert.strictEqual(result, 'copy 2 copy');
	});

	test('Increment folder name "with extension" but without any version', function () {
		const name = 'test.js';
		const result = incrementFileName(name, true);
		assert.strictEqual(result, 'test.js copy');
	});

	test('Increment folder name "with extension" and with suffix version', function () {
		const name = 'test.js copy 5';
		const result = incrementFileName(name, true);
		assert.strictEqual(result, 'test.js copy 6');
	});

	test('Increment file/folder name with suffix version, special case 1', function () {
		const name = 'test copy 0';
		const result = incrementFileName(name, true);
		assert.strictEqual(result, 'test copy');
	});

	test('Increment file/folder name with suffix version, special case 2', function () {
		const name = 'test copy 1';
		const result = incrementFileName(name, true);
		assert.strictEqual(result, 'test copy 2');
	});

});
