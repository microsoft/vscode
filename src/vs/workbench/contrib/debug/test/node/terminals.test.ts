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

	test('powershell - quotes environment values', () => {
		const leftSingleQuotationMark = '\u2018';
		const rightSingleQuotationMark = '\u2019';

		assert.deepStrictEqual(
			[
				prepareCommand('powershell', [], false, undefined, { SIMPLE: 'hello' }).trim(),
				prepareCommand('powershell', [], false, undefined, { SPACES: 'hello world' }).trim(),
				prepareCommand('powershell', [], false, undefined, { EMPTY: '' }).trim(),
				prepareCommand('powershell', [], false, undefined, { QUOTE: 'hello\'world' }).trim(),
				prepareCommand('powershell', [], false, undefined, { MULTI: 'it\'s \'ok\'' }).trim(),
				prepareCommand('powershell', [], false, undefined, { LEFT_QUOTE: `hello${leftSingleQuotationMark}world` }).trim(),
				prepareCommand('powershell', [], false, undefined, { RIGHT_QUOTE: `hello${rightSingleQuotationMark}world` }).trim(),
				prepareCommand('powershell', [], false, undefined, { TRAILING: 'C:\\work\\' }).trim(),
				prepareCommand('powershell', [], false, undefined, { BACKSLASH_QUOTE: 'C:\\it\'s\\path\\' }).trim(),
			],
			[
				'${env:SIMPLE}=\'hello\';',
				'${env:SPACES}=\'hello world\';',
				'${env:EMPTY}=\'\';',
				'${env:QUOTE}=\'hello\'\'world\';',
				'${env:MULTI}=\'it\'\'s \'\'ok\'\'\';',
				`\${env:LEFT_QUOTE}='hello${leftSingleQuotationMark}${leftSingleQuotationMark}world';`,
				`\${env:RIGHT_QUOTE}='hello${rightSingleQuotationMark}${rightSingleQuotationMark}world';`,
				'${env:TRAILING}=\'C:\\work\\\';',
				'${env:BACKSLASH_QUOTE}=\'C:\\it\'\'s\\path\\\';',
			]);
	});
});
