/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { incrementFileName } from 'vs/workbench/parts/files/electron-browser/fileActions';

suite('Files - Increment file name', () => {

	test('Increment file name without any version', function () {
		const name = 'test.js';
		const result = incrementFileName(name, false);
		assert.strictEqual(result, 'test.1.js');
	});

	test('Increment folder name without any version', function () {
		const name = 'test';
		const result = incrementFileName(name, true);
		assert.strictEqual(result, 'test.1');
	});

	test('Increment file name with suffix version', function () {
		const name = 'test.1.js';
		const result = incrementFileName(name, false);
		assert.strictEqual(result, 'test.2.js');
	});

	test('Increment file name with suffix version with trailing zeros', function () {
		const name = 'test.001.js';
		const result = incrementFileName(name, false);
		assert.strictEqual(result, 'test.002.js');
	});

	test('Increment file name with suffix version with trailing zeros, changing length', function () {
		const name = 'test.009.js';
		const result = incrementFileName(name, false);
		assert.strictEqual(result, 'test.010.js');
	});

	test('Increment file name with suffix version with `-` as separator', function () {
		const name = 'test-1.js';
		const result = incrementFileName(name, false);
		assert.strictEqual(result, 'test-2.js');
	});

	test('Increment file name with suffix version with `-` as separator, trailing zeros', function () {
		const name = 'test-001.js';
		const result = incrementFileName(name, false);
		assert.strictEqual(result, 'test-002.js');
	});

	test('Increment file name with suffix version with `-` as separator, trailing zeros, changnig length', function () {
		const name = 'test-099.js';
		const result = incrementFileName(name, false);
		assert.strictEqual(result, 'test-100.js');
	});

	test('Increment file name with suffix version with `_` as separator', function () {
		const name = 'test_1.js';
		const result = incrementFileName(name, false);
		assert.strictEqual(result, 'test_2.js');
	});

	test('Increment folder name with suffix version', function () {
		const name = 'test.1';
		const result = incrementFileName(name, true);
		assert.strictEqual(result, 'test.2');
	});

	test('Increment folder name with suffix version, trailing zeros', function () {
		const name = 'test.001';
		const result = incrementFileName(name, true);
		assert.strictEqual(result, 'test.002');
	});

	test('Increment folder name with suffix version with `-` as separator', function () {
		const name = 'test-1';
		const result = incrementFileName(name, true);
		assert.strictEqual(result, 'test-2');
	});

	test('Increment folder name with suffix version with `_` as separator', function () {
		const name = 'test_1';
		const result = incrementFileName(name, true);
		assert.strictEqual(result, 'test_2');
	});

	test('Increment file name with suffix version, too big number', function () {
		const name = 'test.9007199254740992.js';
		const result = incrementFileName(name, false);
		assert.strictEqual(result, 'test.9007199254740992.1.js');
	});

	test('Increment folder name with suffix version, too big number', function () {
		const name = 'test.9007199254740992';
		const result = incrementFileName(name, true);
		assert.strictEqual(result, 'test.9007199254740992.1');
	});

	test('Increment file name with prefix version', function () {
		const name = '1.test.js';
		const result = incrementFileName(name, false);
		assert.strictEqual(result, '2.test.js');
	});

	test('Increment file name with just version in name', function () {
		const name = '1.js';
		const result = incrementFileName(name, false);
		assert.strictEqual(result, '2.js');
	});

	test('Increment file name with just version in name, too big number', function () {
		const name = '9007199254740992.js';
		const result = incrementFileName(name, false);
		assert.strictEqual(result, '9007199254740992.1.js');
	});

	test('Increment file name with prefix version, trailing zeros', function () {
		const name = '001.test.js';
		const result = incrementFileName(name, false);
		assert.strictEqual(result, '002.test.js');
	});

	test('Increment file name with prefix version with `-` as separator', function () {
		const name = '1-test.js';
		const result = incrementFileName(name, false);
		assert.strictEqual(result, '2-test.js');
	});

	test('Increment file name with prefix version with `-` as separator', function () {
		const name = '1_test.js';
		const result = incrementFileName(name, false);
		assert.strictEqual(result, '2_test.js');
	});

	test('Increment file name with prefix version, too big number', function () {
		const name = '9007199254740992.test.js';
		const result = incrementFileName(name, false);
		assert.strictEqual(result, '9007199254740992.test.1.js');
	});

	test('Increment folder name with prefix version', function () {
		const name = '1.test';
		const result = incrementFileName(name, true);
		assert.strictEqual(result, '2.test');
	});

	test('Increment folder name with prefix version, too big number', function () {
		const name = '9007199254740992.test';
		const result = incrementFileName(name, true);
		assert.strictEqual(result, '9007199254740992.test.1');
	});

	test('Increment folder name with prefix version, trailing zeros', function () {
		const name = '001.test';
		const result = incrementFileName(name, true);
		assert.strictEqual(result, '002.test');
	});

	test('Increment folder name with prefix version  with `-` as separator', function () {
		const name = '1-test';
		const result = incrementFileName(name, true);
		assert.strictEqual(result, '2-test');
	});

});