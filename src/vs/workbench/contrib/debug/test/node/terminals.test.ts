/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { prepareCommand } from 'vs/workbench/contrib/debug/node/terminals';


suite('Debug - prepareCommand', () => {
	test('bash', () => {
		assert.strictEqual(
			prepareCommand('bash', ['{$} (']).trim(),
			'\\{\\$\\}\\ \\(');
		assert.strictEqual(
			prepareCommand('bash', ['hello', 'world', '--flag=true']).trim(),
			'hello world --flag=true');
		assert.strictEqual(
			prepareCommand('bash', [' space arg ']).trim(),
			'\\ space\\ arg\\');
	});

	test('bash - do not escape > and <', () => {
		assert.strictEqual(
			prepareCommand('bash', ['arg1', '>', '> hello.txt', '<', '<input.in']).trim(),
			'arg1 > \\>\\ hello.txt < \\<input.in');
	});

	test('cmd', () => {
		assert.strictEqual(
			prepareCommand('cmd.exe', ['^!< ']).trim(),
			'"^^^!^< "');
		assert.strictEqual(
			prepareCommand('cmd.exe', ['hello', 'world', '--flag=true']).trim(),
			'hello world --flag=true');
		assert.strictEqual(
			prepareCommand('cmd.exe', [' space arg ']).trim(),
			'" space arg "');
		assert.strictEqual(
			prepareCommand('cmd.exe', ['"A>0"']).trim(),
			'"""A^>0"""');
		assert.strictEqual(
			prepareCommand('cmd.exe', ['']).trim(),
			'""');
	});

	test('cmd - do not escape > and <', () => {
		assert.strictEqual(
			prepareCommand('cmd.exe', ['arg1', '>', '> hello.txt', '<', '<input.in']).trim(),
			'arg1 > "^> hello.txt" < ^<input.in');
	});

	test('powershell', () => {
		assert.strictEqual(
			prepareCommand('powershell', ['!< ']).trim(),
			`& '!< '`);
		assert.strictEqual(
			prepareCommand('powershell', ['hello', 'world', '--flag=true']).trim(),
			`& 'hello' 'world' '--flag=true'`);
		assert.strictEqual(
			prepareCommand('powershell', [' space arg ']).trim(),
			`& ' space arg '`);
		assert.strictEqual(
			prepareCommand('powershell', ['"A>0"']).trim(),
			`& '"A>0"'`);
		assert.strictEqual(
			prepareCommand('powershell', ['']).trim(),
			`& ''`);
	});

	test('powershell - do not escape > and <', () => {
		assert.strictEqual(
			prepareCommand('powershell', ['arg1', '>', '> hello.txt', '<', '<input.in']).trim(),
			`& 'arg1' > '> hello.txt' < '<input.in'`);
	});
});
