/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { isValidConnectionToken, parseConnectionTokenFile } from '../../common/connectionToken.js';

suite('Connection token format', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('accepts the protocol alphabet and one optional file line ending', () => {
		const token = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-';
		assert.deepStrictEqual(['', '\n', '\r\n'].map(ending => parseConnectionTokenFile(token + ending)), [token, token, token]);
	});

	test('rejects empty tokens and characters outside the protocol alphabet', () => {
		assert.deepStrictEqual([undefined, null, 123, '', 'a b', 'a!', 'a\n', 'a\r\n', '\uFEFFa'].map(isValidConnectionToken), Array(9).fill(false));
	});

	test('does not trim whitespace, a BOM, or additional lines', () => {
		const invalid = ['', '\n', '\r\n', ' a', 'a ', '\uFEFFa', 'a\r', 'a\n\n', 'a\r\n\r\n', 'a\nb'];
		assert.deepStrictEqual(invalid.map(parseConnectionTokenFile), invalid.map(() => undefined));
	});
});
