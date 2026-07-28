/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';

import { parse, stripComments } from '../../common/jsonc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('JSON Parse', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('Line comment', () => {
		const content: string = [
			'{',
			'  "prop": 10 // a comment',
			'}',
		].join('\n');
		const expected = [
			'{',
			'  "prop": 10 ',
			'}',
		].join('\n');
		assert.deepEqual(parse(content), JSON.parse(expected));
	});
	test('Line comment - EOF', () => {
		const content: string = [
			'{',
			'}',
			'// a comment'
		].join('\n');
		const expected = [
			'{',
			'}',
			''
		].join('\n');
		assert.deepEqual(parse(content), JSON.parse(expected));
	});
	test('Line comment - \\r\\n', () => {
		const content: string = [
			'{',
			'  "prop": 10 // a comment',
			'}',
		].join('\r\n');
		const expected = [
			'{',
			'  "prop": 10 ',
			'}',
		].join('\r\n');
		assert.deepEqual(parse(content), JSON.parse(expected));
	});
	test('Line comment - EOF - \\r\\n', () => {
		const content: string = [
			'{',
			'}',
			'// a comment'
		].join('\r\n');
		const expected = [
			'{',
			'}',
			''
		].join('\r\n');
		assert.deepEqual(parse(content), JSON.parse(expected));
	});
	test('Block comment - single line', () => {
		const content: string = [
			'{',
			'  /* before */"prop": 10/* after */',
			'}',
		].join('\n');
		const expected = [
			'{',
			'  "prop": 10',
			'}',
		].join('\n');
		assert.deepEqual(parse(content), JSON.parse(expected));
	});
	test('Block comment - multi line', () => {
		const content: string = [
			'{',
			'  /**',
			'   * Some comment',
			'   */',
			'  "prop": 10',
			'}',
		].join('\n');
		const expected = [
			'{',
			'  ',
			'  "prop": 10',
			'}',
		].join('\n');
		assert.deepEqual(parse(content), JSON.parse(expected));
	});
	test('Block comment - shortest match', () => {
		const content = '/* abc */ */';
		const expected = ' */';
		assert.strictEqual(stripComments(content), expected);
	});
	test('No strings - double quote', () => {
		const content: string = [
			'{',
			'  "/* */": 10',
			'}'
		].join('\n');
		const expected: string = [
			'{',
			'  "/* */": 10',
			'}'
		].join('\n');
		assert.deepEqual(parse(content), JSON.parse(expected));
	});
	test('No strings - single quote', () => {
		const content: string = [
			'{',
			`  '/* */': 10`,
			'}'
		].join('\n');
		const expected: string = [
			'{',
			`  '/* */': 10`,
			'}'
		].join('\n');
		assert.strictEqual(stripComments(content), expected);
	});
	test('Trailing comma in object', () => {
		const content: string = [
			'{',
			`  "a": 10,`,
			'}'
		].join('\n');
		const expected: string = [
			'{',
			`  "a": 10`,
			'}'
		].join('\n');
		assert.deepEqual(parse(content), JSON.parse(expected));
	});
	test('Trailing comma in array', () => {
		const content: string = [
			`[ "a", "b", "c", ]`
		].join('\n');
		const expected: string = [
			`[ "a", "b", "c" ]`
		].join('\n');
		assert.deepEqual(parse(content), JSON.parse(expected));
	});

	test('Trailing comma', () => {
		const content: string = [
			'{',
			'  "propA": 10, // a comment',
			'  "propB": false, // a trailing comma',
			'}',
		].join('\n');
		const expected = [
			'{',
			'  "propA": 10,',
			'  "propB": false',
			'}',
		].join('\n');
		assert.deepEqual(parse(content), JSON.parse(expected));
	});

	test('Trailing comma - EOF', () => {
		const content = `
// This configuration file allows you to pass permanent command line arguments to VS Code.
// Only a subset of arguments is currently supported to reduce the likelihood of breaking
// the installation.
//
// PLEASE DO NOT CHANGE WITHOUT UNDERSTANDING THE IMPACT
//
// NOTE: Changing this file requires a restart of VS Code.
{
	// Use software rendering instead of hardware accelerated rendering.
	// This can help in cases where you see rendering issues in VS Code.
	// "disable-hardware-acceleration": true,
	// Allows to disable crash reporting.
	// Should restart the app if the value is changed.
	"enable-crash-reporter": true,
	// Unique id used for correlating crash reports sent from this instance.
	// Do not edit this value.
	"crash-reporter-id": "aaaaab31-7453-4506-97d0-93411b2c21c7",
	"locale": "en",
	// "log-level": "trace"
}
`;
		assert.deepEqual(parse(content), {
			'enable-crash-reporter': true,
			'crash-reporter-id': 'aaaaab31-7453-4506-97d0-93411b2c21c7',
			'locale': 'en'
		});
	});
});
