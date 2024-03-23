/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';

import { stripComments } from 'vs/base/common/stripComments';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

// We use this regular expression quite often to strip comments in JSON files.

suite('Strip Comments', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('Line comment', () => {
		const content: string = [
			"{",
			"  \"prop\": 10 // a comment",
			"}",
		].join('\n');
		const expected = [
			"{",
			"  \"prop\": 10 ",
			"}",
		].join('\n');
		assert.strictEqual(stripComments(content), expected);
	});
	test('Line comment - EOF', () => {
		const content: string = [
			"{",
			"}",
			"// a comment"
		].join('\n');
		const expected = [
			"{",
			"}",
			""
		].join('\n');
		assert.strictEqual(stripComments(content), expected);
	});
	test('Line comment - \\r\\n', () => {
		const content: string = [
			"{",
			"  \"prop\": 10 // a comment",
			"}",
		].join('\r\n');
		const expected = [
			"{",
			"  \"prop\": 10 ",
			"}",
		].join('\r\n');
		assert.strictEqual(stripComments(content), expected);
	});
	test('Line comment - EOF - \\r\\n', () => {
		const content: string = [
			"{",
			"}",
			"// a comment"
		].join('\r\n');
		const expected = [
			"{",
			"}",
			""
		].join('\r\n');
		assert.strictEqual(stripComments(content), expected);
	});
	test('Block comment - single line', () => {
		const content: string = [
			"{",
			"  /* before */\"prop\": 10/* after */",
			"}",
		].join('\n');
		const expected = [
			"{",
			"  \"prop\": 10",
			"}",
		].join('\n');
		assert.strictEqual(stripComments(content), expected);
	});
	test('Block comment - multi line', () => {
		const content: string = [
			"{",
			"  /**",
			"   * Some comment",
			"   */",
			"  \"prop\": 10",
			"}",
		].join('\n');
		const expected = [
			"{",
			"  ",
			"  \"prop\": 10",
			"}",
		].join('\n');
		assert.strictEqual(stripComments(content), expected);
	});
	test('Block comment - shortest match', () => {
		const content = "/* abc */ */";
		const expected = " */";
		assert.strictEqual(stripComments(content), expected);
	});
	test('No strings - double quote', () => {
		const content: string = [
			"{",
			"  \"/* */\": 10",
			"}"
		].join('\n');
		const expected: string = [
			"{",
			"  \"/* */\": 10",
			"}"
		].join('\n');
		assert.strictEqual(stripComments(content), expected);
	});
	test('No strings - single quote', () => {
		const content: string = [
			"{",
			"  '/* */': 10",
			"}"
		].join('\n');
		const expected: string = [
			"{",
			"  '/* */': 10",
			"}"
		].join('\n');
		assert.strictEqual(stripComments(content), expected);
	});
	test('Trailing comma in object', () => {
		const content: string = [
			"{",
			`  "a": 10,`,
			"}"
		].join('\n');
		const expected: string = [
			"{",
			`  "a": 10`,
			"}"
		].join('\n');
		assert.strictEqual(stripComments(content), expected);
	});
	test('Trailing comma in array', () => {
		const content: string = [
			`[ "a", "b", "c", ]`
		].join('\n');
		const expected: string = [
			`[ "a", "b", "c" ]`
		].join('\n');
		assert.strictEqual(stripComments(content), expected);
	});
});
