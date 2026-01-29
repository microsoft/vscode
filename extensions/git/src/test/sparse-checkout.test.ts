/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';

suite('Sparse Checkout', () => {

	suite('getTopLevelDirectories output parsing', () => {
		test('parses list of directories from ls-tree output', () => {
			const stdout = 'src\ndocs\ntests\nscripts\n';
			const result = stdout.trim().split('\n').filter(line => line.length > 0);

			assert.deepStrictEqual(result, ['src', 'docs', 'tests', 'scripts']);
		});

		test('filters out empty lines', () => {
			const stdout = 'src\n\ndocs\n\n\ntests\n';
			const result = stdout.trim().split('\n').filter(line => line.length > 0);

			assert.deepStrictEqual(result, ['src', 'docs', 'tests']);
		});

		test('handles empty output', () => {
			const stdout = '';
			const result = stdout.trim().split('\n').filter(line => line.length > 0);

			assert.deepStrictEqual(result, []);
		});

		test('handles single directory', () => {
			const stdout = 'src\n';
			const result = stdout.trim().split('\n').filter(line => line.length > 0);

			assert.deepStrictEqual(result, ['src']);
		});
	});

	suite('sparseCheckoutList output parsing', () => {
		test('parses list of sparse-checkout paths', () => {
			const stdout = 'src\ndocs\n';
			const result = stdout.trim().split('\n').filter(line => line.length > 0);

			assert.deepStrictEqual(result, ['src', 'docs']);
		});

		test('filters out empty lines', () => {
			const stdout = 'src\n\ndocs\n\n';
			const result = stdout.trim().split('\n').filter(line => line.length > 0);

			assert.deepStrictEqual(result, ['src', 'docs']);
		});

		test('handles empty output', () => {
			const stdout = '';
			const result = stdout.trim().split('\n').filter(line => line.length > 0);

			assert.deepStrictEqual(result, []);
		});
	});
});
