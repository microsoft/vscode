/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { prepareCommand } from '../../node/terminals.js';


suite('Debug - prepareCommand', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('bash', () => {
		assert.strictEqual(
			prepareCommand('bash', ['{$} ('], false).trim(),
			'\\{\\$\\}\\ \\(');
		assert.strictEqual(
			prepareCommand('bash', ['hello', 'world', '--flag=true'], false).trim(),
			'hello world --flag=true');
		assert.strictEqual(
			prepareCommand('bash', [' space arg '], false).trim(),
			'\\ space\\ arg\\');

		assert.strictEqual(
			prepareCommand('bash', ['{$} ('], true).trim(),
			'{$} (');
		assert.strictEqual(
			prepareCommand('bash', ['hello', 'world', '--flag=true'], true).trim(),
			'hello world --flag=true');
		assert.strictEqual(
			prepareCommand('bash', [' space arg '], true).trim(),
			'space arg');
	});

	test('bash - do not escape > and <', () => {
		assert.strictEqual(
			prepareCommand('bash', ['arg1', '>', '> hello.txt', '<', '<input.in'], false).trim(),
			'arg1 > \\>\\ hello.txt < \\<input.in');
	});

	test('cmd', () => {
		assert.strictEqual(
			prepareCommand('cmd.exe', ['^!< '], false).trim(),
			'"^^^!^< "');
		assert.strictEqual(
			prepareCommand('cmd.exe', ['hello', 'world', '--flag=true'], false).trim(),
			'hello world --flag=true');
		assert.strictEqual(
			prepareCommand('cmd.exe', [' space arg '], false).trim(),
			'" space arg "');
		assert.strictEqual(
			prepareCommand('cmd.exe', ['"A>0"'], false).trim(),
			'"""A^>0"""');
		assert.strictEqual(
			prepareCommand('cmd.exe', [''], false).trim(),
			'""');

		assert.strictEqual(
			prepareCommand('cmd.exe', ['^!< '], true).trim(),
			'^!<');
		assert.strictEqual(
			prepareCommand('cmd.exe', ['hello', 'world', '--flag=true'], true).trim(),
			'hello world --flag=true');
		assert.strictEqual(
			prepareCommand('cmd.exe', [' space arg '], true).trim(),
			'space arg');
		assert.strictEqual(
			prepareCommand('cmd.exe', ['"A>0"'], true).trim(),
			'"A>0"');
		assert.strictEqual(
			prepareCommand('cmd.exe', [''], true).trim(),
			'');
	});

	test('cmd - do not escape > and <', () => {
		assert.strictEqual(
			prepareCommand('cmd.exe', ['arg1', '>', '> hello.txt', '<', '<input.in'], false).trim(),
			'arg1 > "^> hello.txt" < ^<input.in');
	});

	test('powershell', () => {
		assert.strictEqual(
			prepareCommand('powershell', ['!< '], false).trim(),
			`& '!< '`);
		assert.strictEqual(
			prepareCommand('powershell', ['hello', 'world', '--flag=true'], false).trim(),
			`& 'hello' 'world' '--flag=true'`);
		assert.strictEqual(
			prepareCommand('powershell', [' space arg '], false).trim(),
			`& ' space arg '`);
		assert.strictEqual(
			prepareCommand('powershell', ['"A>0"'], false).trim(),
			`& '"A>0"'`);
		assert.strictEqual(
			prepareCommand('powershell', [''], false).trim(),
			`& ''`);

		assert.strictEqual(
			prepareCommand('powershell', ['!< '], true).trim(),
			'!<');
		assert.strictEqual(
			prepareCommand('powershell', ['hello', 'world', '--flag=true'], true).trim(),
			'hello world --flag=true');
		assert.strictEqual(
			prepareCommand('powershell', [' space arg '], true).trim(),
			'space arg');
		assert.strictEqual(
			prepareCommand('powershell', ['"A>0"'], true).trim(),
			'"A>0"');
		assert.strictEqual(
			prepareCommand('powershell', [''], true).trim(),
			``);
	});

	test('powershell - do not escape > and <', () => {
		assert.strictEqual(
			prepareCommand('powershell', ['arg1', '>', '> hello.txt', '<', '<input.in'], false).trim(),
			`& 'arg1' > '> hello.txt' < '<input.in'`);
	});
});
