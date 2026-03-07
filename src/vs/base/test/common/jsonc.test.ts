/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { stripComments } from '../../common/jsonc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('JSONC', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('stripComments', () => {
		test('Line comment', () => {
			const content = '{ "prop": 10 // a comment\n}';
			const expected = '{ "prop": 10 \n}';
			assert.strictEqual(stripComments(content), expected);
		});

		test('Line comment - EOF', () => {
			const content = '{\n}\n// a comment';
			const expected = '{\n}\n';
			assert.strictEqual(stripComments(content), expected);
		});

		test('Line comment - \\r\\n', () => {
			const content = '{ "prop": 10 // a comment\r\n}';
			const expected = '{ "prop": 10 \r\n}';
			assert.strictEqual(stripComments(content), expected);
		});

		test('Line comment - EOF - \\r\\n', () => {
			const content = '{\n}\r\n// a comment';
			const expected = '{\n}\r\n';
			assert.strictEqual(stripComments(content), expected);
		});

		test('Block comment - single line', () => {
			const content = '{ /* before */"prop": 10/* after */ }';
			const expected = '{ "prop": 10 }';
			assert.strictEqual(stripComments(content), expected);
		});

		test('Block comment - multi line', () => {
			const content = '{\n  /**\n   * Some comment\n   */\n  "prop": 10\n}';
			const expected = '{\n  \n  "prop": 10\n}';
			assert.strictEqual(stripComments(content), expected);
		});

		test('Block comment - shortest match', () => {
			const content = '/* abc */ */';
			const expected = ' */';
			assert.strictEqual(stripComments(content), expected);
		});

		test('No strings - double quote', () => {
			const content = '{ "/* */": 10 }';
			const expected = '{ "/* */": 10 }';
			assert.strictEqual(stripComments(content), expected);
		});

		test('No strings - single quote', () => {
			const content = "{ '/* */': 10 }";
			const expected = "{ '/* */': 10 }";
			assert.strictEqual(stripComments(content), expected);
		});

		test('Trailing comma in object', () => {
			const content = '{ "a": 10, }';
			const expected = '{ "a": 10 }';
			assert.strictEqual(stripComments(content), expected);
		});

		test('Trailing comma in array', () => {
			const content = '[ "a", "b", "c", ]';
			const expected = '[ "a", "b", "c" ]';
			assert.strictEqual(stripComments(content), expected);
		});

		test('Trailing comma with multiple newlines', () => {
			const content = '{\n  "a": 10,\n\n}';
			const expected = '{\n  "a": 10\n\n}';
			assert.strictEqual(stripComments(content), expected);
		});

		test('Trailing comma with multiple spaces', () => {
			const content = '{ "a": 10,    }';
			const expected = '{ "a": 10    }';
			assert.strictEqual(stripComments(content), expected);
		});

		test('Escaped quotes within strings', () => {
			const content = '{ "prop": "value \\" with quotes // and comments" }';
			const expected = '{ "prop": "value \\" with quotes // and comments" }';
			assert.strictEqual(stripComments(content), expected);
		});

		test('Complex mixed case', () => {
			const content = '{\n  "prop1": "value1", // line comment\n  "prop2": "value \\" 2", /* block comment */\n  "prop3": [1, 2, 3, ]\n} // eof comment';
			const expected = '{\n  "prop1": "value1", \n  "prop2": "value \\" 2", \n  "prop3": [1, 2, 3 ]\n} ';
			assert.strictEqual(stripComments(content), expected);
		});
	});
});
