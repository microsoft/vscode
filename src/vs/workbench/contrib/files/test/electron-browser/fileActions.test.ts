/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { incrementFileName } from 'vs/workbench/contrib/files/browser/fileActions';

suite('Files - Increment file name', () => {
	test('Increment file name', function () {
		const name = 'test.js';
		const result = incrementFileName(name, false);
		assert.strictEqual(result, 'test (Copy).js');
	});
	test('Increment file name without file extension', function () {
		const name = 'test';
		const result = incrementFileName(name, false);
		assert.strictEqual(result, 'test (Copy)');
	});
	test('Increment file name with two file extensions', function () {
		const name = 'test.tar.gz';
		const result = incrementFileName(name, false);
		assert.strictEqual(result, 'test (Copy).tar.gz');
	});

	test('Increment second file name', function () {
		const name = 'test (Copy).js';
		const result = incrementFileName(name, false);
		assert.strictEqual(result, 'test (Copy 2).js');
	});
	test('Increment second file name without file extension', function () {
		const name = 'test (Copy)';
		const result = incrementFileName(name, false);
		assert.strictEqual(result, 'test (Copy 2)');
	});
	test('Increment second file name with two file extensions', function () {
		const name = 'test (Copy).tar.gz';
		const result = incrementFileName(name, false);
		assert.strictEqual(result, 'test (Copy 2).tar.gz');
	});

	test('Increment third file name', function () {
		const name = 'test (Copy 2).js';
		const result = incrementFileName(name, false);
		assert.strictEqual(result, 'test (Copy 3).js');
	});
	test('Increment third file name without file extension', function () {
		const name = 'test (Copy 2)';
		const result = incrementFileName(name, false);
		assert.strictEqual(result, 'test (Copy 3)');
	});
	test('Increment third file name with two file extensions', function () {
		const name = 'test (Copy 2).tar.gz';
		const result = incrementFileName(name, false);
		assert.strictEqual(result, 'test (Copy 3).tar.gz');
	});

	test('Increment max safe small integer file name', function () {
		const name = 'test (Copy 1073741824).js';
		const result = incrementFileName(name, false);
		assert.strictEqual(result, 'test (Copy 1073741824) (Copy).js');
	});
	test('Increment max safe small integer file name without file extension', function () {
		const name = 'test (Copy 1073741824)';
		const result = incrementFileName(name, false);
		assert.strictEqual(result, 'test (Copy 1073741824) (Copy)');
	});
	test('Increment max safe small integer file name with two file extensions', function () {
		const name = 'test (Copy 1073741824).tar.gz';
		const result = incrementFileName(name, false);
		assert.strictEqual(result, 'test (Copy 1073741824) (Copy).tar.gz');
	});

});
